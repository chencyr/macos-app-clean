function matchGroups(groups, query) {
  const q = (query || "").toLowerCase();
  if (!q) return [];
  // 以 key/name 進行包含匹配（實務上比較好用）
  return groups.filter(
    (g) => g.key.includes(q) || g.name.toLowerCase().includes(q)
  );
}

module.exports = {
  matchGroups,
};

