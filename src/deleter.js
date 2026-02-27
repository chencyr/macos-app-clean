const fs = require("fs");
const path = require("path");

const { matchGroups } = require("./matcher");
const { recordDeleteOperation } = require("./history");

function rmRecursive(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const ents = fs.readdirSync(src, { withFileTypes: true });
  for (const ent of ents) {
    const s = path.join(src, ent.name);
    const d = path.join(dest, ent.name);
    if (ent.isDirectory()) {
      copyDir(s, d);
    } else if (ent.isSymbolicLink()) {
      // 不複製 symlink，避免不預期行為
      continue;
    } else if (
      ent.name === ".com.apple.containermanagerd.metadata.plist" ||
      ent.name.startsWith(".com.apple.containermanagerd.metadata")
    ) {
      // 一些 macOS Container metadata 檔案在某些系統版本或權限設定下不可被複製
      // 為了避免整個移到垃圾桶流程失敗，這類 metadata 檔會被略過，不搬到 Trash
      continue;
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

function ensureTrashDir(trashDir) {
  try {
    if (!fs.existsSync(trashDir) || !fs.statSync(trashDir).isDirectory()) {
      fs.mkdirSync(trashDir, { recursive: true });
    }
  } catch {
    // 如果不行也沒關係，後面會報錯
  }
}

function uniqueTrashPath(originalPath, trashDir) {
  const base = path.basename(originalPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let dest = path.join(trashDir, `${base}__deleted__${stamp}`);
  let i = 1;
  while (fs.existsSync(dest)) {
    dest = path.join(trashDir, `${base}__deleted__${stamp}__${i++}`);
  }
  return dest;
}

function moveToTrash(p, trashDir) {
  ensureTrashDir(trashDir);
  const dest = uniqueTrashPath(p, trashDir);
  try {
    fs.renameSync(p, dest);
    return { ok: true, dest };
  } catch (e) {
    // rename 失敗時（跨磁碟/權限），退回用 copy+rm
    // 只在檔案/資料夾可讀寫時才可能成功
    try {
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        copyDir(p, dest);
        rmRecursive(p);
      } else {
        fs.copyFileSync(p, dest);
        rmRecursive(p);
      }
      return { ok: true, dest, fallback: "copy+rm" };
    } catch (e2) {
      const msg = String(e2?.message || e2);
      const lower = msg.toLowerCase();
      // If this is a macOS permission / locking issue (EPERM / ENOTEMPTY / EBUSY),
      // add a clearer hint instead of failing silently.
      if (
        (e2 && (e2.code === "EPERM" || e2.code === "ENOTEMPTY" || e2.code === "EBUSY")) ||
        lower.includes("operation not permitted") ||
        lower.includes("directory not empty") ||
        lower.includes("resource busy")
      ) {
        return {
          ok: false,
          error:
            msg +
            " (This is likely a macOS permission or locking restriction. Try quitting the related app/agent, ejecting any mounted disk images, and granting macos-app-clean Full Disk Access. The tool will not automatically use sudo or bypass system protections.)",
        };
      }
      return { ok: false, error: msg };
    }
  }
}

function isDangerousPath(p, homeDir) {
  const normalized = path.normalize(p);
  const dangerous = new Set([
    homeDir,
    path.join(homeDir, "Library"),
    "/Library",
    "/Applications",
  ]);
  return dangerous.has(normalized);
}

function runDelete(groups, query, options) {
  const {
    homeDir,
    trashDir,
    force = false,
    permanentRm = false,
  } = options || {};

  const q = (query || "").trim().toLowerCase();
  const targets = matchGroups(groups, q);

  if (targets.length === 0) {
    console.error(`No matching groups for --delete=${q}`);
    console.error(
      `Tip: run without --delete first, then copy a keyword from "key" or "name".`
    );
    process.exitCode = 2;
    return {
      targets: [],
      paths: [],
      results: [],
    };
  }

  // 收斂要刪除的 path（去重）
  const paths = new Set();
  targets.forEach((g) => g.allPaths.forEach((p) => paths.add(p)));

  const pathList = Array.from(paths).sort();

  console.log(`Matched groups: ${targets.length}`);
  targets.forEach((g) =>
    console.log(` - ${g.name} (key: ${g.key}, hits: ${g.hitCount})`)
  );
  console.log("");
  console.log(`Total unique paths to remove: ${pathList.length}`);
  console.log(
    `Mode: ${
      force
        ? permanentRm
          ? "PERMANENT DELETE (--rm)"
          : "MOVE TO TRASH"
        : "DRY-RUN (add --force to execute)"
    }`
  );
  console.log("");

  // Dry-run 先列出
  pathList.forEach((p) => console.log(` - ${p}`));

  if (!force) {
    console.log("\nDry-run only. Re-run with --force to execute.");
    if (!permanentRm)
      console.log(
        "Default action is moving items to ~/.Trash (safer). Add --rm for permanent deletion."
      );
    return {
      targets,
      paths: pathList,
      results: [],
    };
  }

  console.log("\nExecuting...\n");

  const results = [];
  for (const p of pathList) {
    // 額外安全：避免把家目錄或 Library 根砍掉
    if (isDangerousPath(p, homeDir)) {
      results.push({
        path: p,
        ok: false,
        error: "Refused: dangerous root path",
      });
      continue;
    }

    try {
      if (!fs.existsSync(p)) {
        results.push({ path: p, ok: true, skipped: "not found" });
        continue;
      }

      if (permanentRm) {
        rmRecursive(p);
        results.push({ path: p, ok: true, action: "rm" });
      } else {
        const r = moveToTrash(p, trashDir);
        if (r.ok)
          results.push({
            path: p,
            ok: true,
            action: "trash",
            dest: r.dest,
            fallback: r.fallback,
          });
        else results.push({ path: p, ok: false, error: r.error });
      }
    } catch (e) {
      results.push({ path: p, ok: false, error: String(e?.message || e) });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;

  console.log(`Done. success=${ok}, failed=${fail}`);
  if (fail) {
    console.log("\nFailures:");
    results
      .filter((r) => !r.ok)
      .slice(0, 50)
      .forEach((r) => console.log(` - ${r.path}: ${r.error}`));
    if (fail > 50) console.log(` ... (+${fail - 50} more)`);
  }

  if (!permanentRm) {
    console.log(`\nMoved items are in: ${trashDir}`);
  }

  if (force && !permanentRm && results.length) {
    recordDeleteOperation({
      homeDir,
      query: q,
      mode: "move-to-trash",
      trashDir,
      results,
    });
  }

  return {
    targets,
    paths: pathList,
    results,
  };
}

module.exports = {
  rmRecursive,
  copyDir,
  ensureTrashDir,
  uniqueTrashPath,
  moveToTrash,
  isDangerousPath,
  runDelete,
};

