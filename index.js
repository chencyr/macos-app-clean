const os = require("os");
const path = require("path");

const { runCLI } = require("./src/cli");
const { buildGroups } = require("./src/scanner");
const { runDelete } = require("./src/deleter");

function main(argv) {
  return runCLI(argv || process.argv.slice(2));
}

function scan(options) {
  const opts = options || {};
  const homeDir = opts.homeDir || os.homedir();

  const { groups } = buildGroups({
    homeDir,
    includeSystem: !!opts.includeSystem,
    filter: (opts.filter || "").toLowerCase(),
    minHits: Number(opts.minHits || 1) || 1,
  });

  return groups;
}

function deleteResidues(query, options) {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    throw new Error("deleteResidues requires a non-empty query string");
  }

  const opts = options || {};
  const homeDir = opts.homeDir || os.homedir();
  const trashDir = opts.trashDir || path.join(homeDir, ".Trash");

  const { groups } = buildGroups({
    homeDir,
    includeSystem: !!opts.includeSystem,
    filter: (opts.filter || "").toLowerCase(),
    minHits: Number(opts.minHits || 1) || 1,
  });

  return runDelete(groups, q, {
    homeDir,
    trashDir,
    force: !!opts.force,
    permanentRm: !!opts.permanentRm,
  });
}

module.exports = {
  main,
  scan,
  deleteResidues,
};

