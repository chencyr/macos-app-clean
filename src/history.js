const fs = require("fs");
const path = require("path");

function getOperationsDir(homeDir) {
  return path.join(homeDir, ".macos-app-clean", "operations");
}

function ensureOperationsDir(homeDir) {
  const dir = getOperationsDir(homeDir);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {
    // ignore; later writes will surface errors
  }
  return dir;
}

function recordDeleteOperation({ homeDir, query, mode, trashDir, results }) {
  if (!homeDir || !query || !mode) return;
  const dir = ensureOperationsDir(homeDir);

  const now = new Date();
  const iso = now.toISOString();
  const id = iso.replace(/[:.]/g, "-");

  const items = results
    .filter((r) => r && r.path)
    .map((r) => ({
      originalPath: r.path,
      trashPath: r.dest || null,
      status: r.ok
        ? r.action === "trash"
          ? "moved"
          : r.skipped
          ? "skipped"
          : "ok"
        : "error",
      action: r.action || null,
      skipped: r.skipped || null,
      error: r.ok ? null : r.error || null,
    }));

  const op = {
    id,
    timestamp: iso,
    mode,
    query,
    homeDir,
    trashDir,
    itemCount: items.length,
    items,
    undoTimestamps: [],
  };

  const file = path.join(dir, `op-${id}.json`);
  try {
    fs.writeFileSync(file, JSON.stringify(op, null, 2), "utf8");
  } catch {
    // failing to record history should not break deletion
  }
  return op;
}

function listOperations(homeDir, limit) {
  const dir = getOperationsDir(homeDir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return [];
  }

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith("op-") && f.endsWith(".json"));

  const metas = [];
  for (const f of files) {
    const full = path.join(dir, f);
    try {
      const stat = fs.statSync(full);
      const raw = fs.readFileSync(full, "utf8");
      const op = JSON.parse(raw);
      if (!op || op.mode !== "move-to-trash") continue;
      metas.push({
        id: op.id || f.slice(3, -5),
        timestamp: op.timestamp || stat.mtime.toISOString(),
        query: op.query || "",
        mode: op.mode,
        itemCount: op.itemCount || (op.items ? op.items.length : 0),
        undoCount: Array.isArray(op.undoTimestamps)
          ? op.undoTimestamps.length
          : 0,
        lastUndoAt: Array.isArray(op.undoTimestamps) &&
          op.undoTimestamps.length > 0
          ? op.undoTimestamps[op.undoTimestamps.length - 1]
          : null,
        file: full,
        mtimeMs: stat.mtimeMs,
      });
    } catch {
      // skip broken history entries
    }
  }

  metas.sort((a, b) => b.mtimeMs - a.mtimeMs);
  if (typeof limit === "number" && limit > 0) {
    return metas.slice(0, limit);
  }
  return metas;
}

function loadOperationById(homeDir, id) {
  if (!id) return null;
  const dir = getOperationsDir(homeDir);
  const prefix = `op-${id}`;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    return null;
  }
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".json"));
  if (!files.length) return null;
  const full = path.join(dir, files[0]);
  try {
    const raw = fs.readFileSync(full, "utf8");
    const op = JSON.parse(raw);
    if (!op || op.mode !== "move-to-trash") return null;
    return op;
  } catch {
    return null;
  }
}

function loadLastOperation(homeDir) {
  const metas = listOperations(homeDir, 1);
  if (!metas.length) return null;
  const meta = metas[0];
  try {
    const raw = fs.readFileSync(meta.file, "utf8");
    const op = JSON.parse(raw);
    if (!op || op.mode !== "move-to-trash") return null;
    return op;
  } catch {
    return null;
  }
}

module.exports = {
  getOperationsDir,
  recordDeleteOperation,
  listOperations,
  loadOperationById,
  loadLastOperation,
};

