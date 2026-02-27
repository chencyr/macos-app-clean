const fs = require("fs");
const path = require("path");

const { isDangerousPath } = require("./deleter");
const {
  getOperationsDir,
  listOperations,
  loadLastOperation,
  loadOperationById,
} = require("./history");

function printUndoList({ homeDir, limit = 20 }) {
  const ops = listOperations(homeDir, limit);
  if (!ops.length) {
    console.log("No rollbackable delete operations found.");
    return;
  }

  console.log(`Last ${ops.length} rollbackable delete operations:`);
  ops.forEach((op, idx) => {
    console.log(
      `${String(idx + 1).padStart(3, " ")}. id=${op.id}  time=${
        op.timestamp
      }  query="${op.query}"  items=${op.itemCount}` +
        `  lastUndo=${op.lastUndoAt || "-"}  undos=${op.undoCount || 0}`
    );
  });
}

function printUndoPlan(op) {
  const movable = (op.items || []).filter(
    (it) => it.status === "moved" && it.trashPath
  );

  console.log(`Operation id: ${op.id}`);
  console.log(`Timestamp   : ${op.timestamp}`);
  console.log(`Query       : ${op.query}`);
  console.log(`Mode        : ${op.mode}`);
  console.log(`Items       : ${op.itemCount}`);
  console.log(`Restorable  : ${movable.length}`);
  if (Array.isArray(op.undoTimestamps) && op.undoTimestamps.length > 0) {
    console.log(`Undo count  : ${op.undoTimestamps.length}`);
    console.log(
      `Last undo   : ${op.undoTimestamps[op.undoTimestamps.length - 1]}`
    );
  }
  console.log("");

  movable.forEach((it) => {
    console.log(` - ${it.originalPath}`);
    console.log(`     from: ${it.trashPath}`);
  });
}

function executeUndo(op, { homeDir }) {
  const movable = (op.items || []).filter(
    (it) => it.status === "moved" && it.trashPath
  );

  const results = [];

  for (const it of movable) {
    const original = it.originalPath;
    const trashPath = it.trashPath;

    if (isDangerousPath(original, homeDir)) {
      results.push({
        path: original,
        ok: false,
        error: "Refused: dangerous root path",
      });
      continue;
    }

    try {
      if (!fs.existsSync(trashPath)) {
        results.push({
          path: original,
          ok: false,
          error: "Trash entry missing",
        });
        continue;
      }

      if (fs.existsSync(original)) {
        results.push({
          path: original,
          ok: false,
          error: "Original path already exists; skipped to avoid overwrite",
        });
        continue;
      }

      const parent = path.dirname(original);
      try {
        if (!fs.existsSync(parent)) {
          fs.mkdirSync(parent, { recursive: true });
        }
      } catch {
        // mkdir 失敗會在下面 rename 時被捕捉
      }

      fs.renameSync(trashPath, original);
      results.push({ path: original, ok: true, action: "restore" });
    } catch (e) {
      results.push({
        path: original,
        ok: false,
        error: String(e?.message || e),
      });
    }
  }

  const ok = results.filter((r) => r.ok).length;
  const fail = results.length - ok;

  console.log(`\nRestore done. success=${ok}, failed=${fail}`);
  if (fail) {
    console.log("\nFailures:");
    results
      .filter((r) => !r.ok)
      .slice(0, 50)
      .forEach((r) => console.log(` - ${r.path}: ${r.error}`));
    if (fail > 50) console.log(` ... (+${fail - 50} more)`);
  }

  if (ok > 0) {
    const ts = new Date().toISOString();
    try {
      const dir = getOperationsDir(op.homeDir || homeDir);
      const file = path.join(dir, `op-${op.id}.json`);
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, "utf8");
        const data = JSON.parse(raw);
        if (!Array.isArray(data.undoTimestamps)) {
          data.undoTimestamps = [];
        }
        data.undoTimestamps.push(ts);
        fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
      }
    } catch {
      // failing to record undo history should not break restore
    }
  }

  return { results };
}

function runUndoLast({ homeDir, force }) {
  const op = loadLastOperation(homeDir);
  if (!op) {
    console.error("No rollbackable delete operations found.");
    return;
  }

  const movable = (op.items || []).filter(
    (it) => it.status === "moved" && it.trashPath
  );
  if (!movable.length) {
    console.error("Last operation has no restorable items.");
    return;
  }

  console.log(
    force
      ? "Restoring from last delete operation..."
      : "Dry-run: would restore from last delete operation:"
  );
  console.log("");

  printUndoPlan(op);

  if (!force) {
    console.log(
      "\nDry-run only. Re-run with --undo-last --force to actually restore files."
    );
    return;
  }

  return executeUndo(op, { homeDir });
}

function runUndoById(id, { homeDir, force }) {
  const op = loadOperationById(homeDir, id);
  if (!op) {
    console.error(`No rollbackable delete operation found for id=${id}.`);
    return;
  }

  const movable = (op.items || []).filter(
    (it) => it.status === "moved" && it.trashPath
  );
  if (!movable.length) {
    console.error("Target operation has no restorable items.");
    return;
  }

  console.log(
    force
      ? `Restoring from delete operation id=${id}...`
      : `Dry-run: would restore from delete operation id=${id}:`
  );
  console.log("");

  printUndoPlan(op);

  if (!force) {
    console.log(
      `\nDry-run only. Re-run with --undo-id=${id} --force to actually restore files.`
    );
    return;
  }

  return executeUndo(op, { homeDir });
}

module.exports = {
  printUndoList,
  runUndoLast,
  runUndoById,
};

