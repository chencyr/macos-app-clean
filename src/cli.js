const os = require("os");
const path = require("path");

const { buildGroups, existsDir } = require("./scanner");
const { runDelete } = require("./deleter");

function hasFlag(argv, f) {
  return argv.includes(f);
}

function getArg(argv, key, def = null) {
  const p = argv.find((a) => a.startsWith(`--${key}=`));
  if (!p) return def;
  return p.slice(key.length + 3);
}

function parseArgs(argv) {
  const includeSystem = hasFlag(argv, "--system");
  const asJson = hasFlag(argv, "--json");
  const filter = (getArg(argv, "filter", "") || "").toLowerCase();
  const minHits = Number(getArg(argv, "minHits", "1")) || 1;

  const deleteQuery = (getArg(argv, "delete", "") || "").trim().toLowerCase();
  const force = hasFlag(argv, "--force");
  const permanentRm = hasFlag(argv, "--rm"); // 若不加 --rm，預設移到垃圾桶（較安全）

  return {
    includeSystem,
    asJson,
    filter,
    minHits,
    deleteQuery,
    force,
    permanentRm,
  };
}

function printGroups(groups, scanRoots, filter) {
  console.log(`Found ${groups.length} candidate app residue groups`);
  console.log(
    `Scanned roots: ${
      scanRoots.filter(existsDir).length
    }/${scanRoots.length} (use --system to include /Library)`
  );
  if (filter) console.log(`Filter: ${filter}`);
  console.log("");

  groups.forEach((it, idx) => {
    console.log(
      `${String(idx + 1).padStart(3, " ")}. ${it.name}  (hits: ${it.hitCount})`
    );
    console.log(`     key: ${it.key}`);
    console.log(`     roots: ${it.roots.join(", ")}`);
    console.log(`     sample paths:`);
    it.samplePaths.forEach((p) => console.log(`       - ${p}`));
    if (it.allPaths.length > it.samplePaths.length) {
      console.log(
        `       ... (+${it.allPaths.length - it.samplePaths.length} more)`
      );
    }
    console.log("");
  });
}

function runCLI(argv, options) {
  const args = parseArgs(argv || []);
  const homeDir = (options && options.homeDir) || os.homedir();
  const trashDir =
    (options && options.trashDir) || path.join(homeDir, ".Trash");

  const { groups, scanRoots } = buildGroups({
    homeDir,
    includeSystem: args.includeSystem,
    filter: args.filter,
    minHits: args.minHits,
  });

  if (args.asJson) {
    process.stdout.write(
      JSON.stringify(
        { generatedAt: new Date().toISOString(), items: groups },
        null,
        2
      )
    );
    return;
  }

  if (args.deleteQuery) {
    runDelete(groups, args.deleteQuery, {
      homeDir,
      trashDir,
      force: args.force,
      permanentRm: args.permanentRm,
    });
    return;
  }

  // 預設：只列出
  printGroups(groups, scanRoots, args.filter);

  console.log("Tips:");
  console.log("- narrow down: --filter=<keyword> (e.g., --filter=chrome)");
  console.log("- reduce noise: --minHits=2");
  console.log("- include system paths: --system");
  console.log(
    "- delete residues: --delete=<AppName> (dry-run), add --force to execute"
  );
  console.log("- permanent delete: add --rm (DANGEROUS)");
}

module.exports = {
  parseArgs,
  printGroups,
  runCLI,
};

