const fs = require("fs");
const path = require("path");

const {
  shouldIgnore,
  normalizeKey,
  displayNameFromKey,
} = require("./normalizer");

const MAX_DEPTH = 2;

function existsDir(p) {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function safeReaddir(dir) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
}

function safeStat(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

function scanDir(root) {
  const hits = [];

  const walk = (dir, depth) => {
    if (depth > MAX_DEPTH) return;
    const ents = safeReaddir(dir);
    if (!ents) return;

    for (const ent of ents) {
      const full = path.join(dir, ent.name);
      const st = safeStat(full);
      if (!st) continue;

      // 避免 symlink 造成循環或誤刪
      if (st.isSymbolicLink && st.isSymbolicLink()) continue;

      if (!shouldIgnore(ent.name)) {
        const key = normalizeKey(ent.name);
        if (key && key.length >= 2) hits.push({ key, rawName: ent.name, path: full, root });
      }

      if (ent.isDirectory()) walk(full, depth + 1);
    }
  };

  walk(root, 0);
  return hits;
}

function buildScanRoots(homeDir, includeSystem) {
  const roots = [
    "/Applications",
    path.join(homeDir, "Applications"),
    path.join(homeDir, "Library", "Application Support"),
    path.join(homeDir, "Library", "Preferences"),
    path.join(homeDir, "Library", "Caches"),
    path.join(homeDir, "Library", "Logs"),
    path.join(homeDir, "Library", "Saved Application State"),
    path.join(homeDir, "Library", "Containers"),
    path.join(homeDir, "Library", "Group Containers"),
  ];

  if (includeSystem) {
    roots.push(
      "/Library/Application Support",
      "/Library/Preferences",
      "/Library/Caches",
      "/Library/Logs",
      "/Library/LaunchAgents",
      "/Library/LaunchDaemons"
    );
  }

  return roots;
}

function buildGroups(options) {
  const {
    homeDir,
    includeSystem = false,
    filter = "",
    minHits = 1,
  } = options || {};

  const normalizedFilter = (filter || "").toLowerCase();
  const scanRoots = buildScanRoots(homeDir, includeSystem);

  const allHits = [];
  for (const root of scanRoots) {
    if (!existsDir(root)) continue;
    allHits.push(...scanDir(root));
  }

  const map = new Map(); // key -> group
  for (const h of allHits) {
    if (
      normalizedFilter &&
      !h.key.includes(normalizedFilter) &&
      !h.rawName.toLowerCase().includes(normalizedFilter)
    ) {
      continue;
    }

    if (!map.has(h.key)) {
      map.set(h.key, {
        key: h.key,
        displayName: displayNameFromKey(h.key),
        roots: new Set(),
        paths: new Set(),
        samples: [],
      });
    }
    const g = map.get(h.key);
    g.roots.add(h.root);
    g.paths.add(h.path);
    if (g.samples.length < 6) g.samples.push(h.path);
  }

  const groups = Array.from(map.values())
    .map((g) => ({
      key: g.key,
      name: g.displayName,
      hitCount: g.paths.size,
      roots: Array.from(g.roots),
      samplePaths: g.samples,
      allPaths: Array.from(g.paths),
    }))
    .filter((g) => g.hitCount >= (Number(minHits) || 1))
    .sort((a, b) => b.hitCount - a.hitCount || a.name.localeCompare(b.name));

  return { groups, scanRoots };
}

module.exports = {
  MAX_DEPTH,
  existsDir,
  safeReaddir,
  safeStat,
  scanDir,
  buildScanRoots,
  buildGroups,
};

