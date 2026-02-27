const NOISE_NAMES = new Set([
  "com.apple",
  "Apple",
  ".DS_Store",
  "CrashReporter",
  "DiagnosticReports",
]);

function shouldIgnore(name) {
  if (!name) return true;
  if (NOISE_NAMES.has(name)) return true;
  if (name === "Caches" || name === "Preferences" || name === "Logs") return true;
  return false;
}

function normalizeKey(name) {
  let s = name.replace(/\.app$/i, "").replace(/\.plist$/i, "").trim();

  // bundle id 類型 -> vendor/product/...
  if (/^[a-z0-9-]+\.[a-z0-9-]+\./i.test(s)) {
    const parts = s.split(".");
    const drop = new Set(["com", "net", "org", "io", "app"]);
    const kept = parts.filter((p, idx) => !(idx === 0 && drop.has(p)));
    s = kept.slice(0, 3).join("/");
  }

  return s.toLowerCase();
}

function displayNameFromKey(key) {
  const parts = key.split("/");
  const nice = parts
    .map((p) => p.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()))
    .join(" / ");
  return nice || key;
}

module.exports = {
  NOISE_NAMES,
  shouldIgnore,
  normalizeKey,
  displayNameFromKey,
};

