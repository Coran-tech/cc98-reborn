(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornConversationCore = api;
})(globalThis, function () {
  "use strict";

  function keyOf(topicId, floor) {
    const id = String(topicId || "");
    const number = Number(floor);
    return /^\d+$/.test(id) && Number.isSafeInteger(number) && number > 0
      ? `${id}:${number}` : "";
  }

  function buildGraph(records) {
    const nodes = new Map();
    const parents = new Map();
    const children = new Map();
    for (const record of records) {
      const key = keyOf(record.topicId, record.floor);
      if (key) nodes.set(key, record);
    }
    for (const [key, record] of nodes) {
      const refs = new Set();
      for (const ref of record.references || []) {
        const parent = keyOf(ref.topicId, ref.floor);
        if (!parent || parent === key) continue;
        // Same-topic references to a future floor cannot represent a reply.
        if (String(ref.topicId) === String(record.topicId) && Number(ref.floor) >= Number(record.floor)) continue;
        refs.add(parent);
        if (!children.has(parent)) children.set(parent, new Set());
        children.get(parent).add(key);
      }
      parents.set(key, refs);
    }
    return { nodes, parents, children };
  }

  function walk(edges, start) {
    const levels = new Map([[start, 0]]);
    const queue = [start];
    for (let index = 0; index < queue.length; index += 1) {
      const key = queue[index];
      for (const next of edges.get(key) || []) {
        if (levels.has(next)) continue;
        levels.set(next, levels.get(key) + 1);
        queue.push(next);
      }
    }
    levels.delete(start);
    return levels;
  }

  function selectConversation(graph, seed, direction = "all") {
    const upstream = walk(graph.parents, seed);
    const downstream = walk(graph.children, seed);
    const selected = new Map([[seed, { key: seed, relation: "seed", level: 0 }]]);
    if (direction !== "downstream") {
      upstream.forEach((level, key) => selected.set(key, { key, relation: "upstream", level }));
    }
    if (direction !== "upstream") {
      downstream.forEach((level, key) => {
        if (!selected.has(key)) selected.set(key, { key, relation: "downstream", level });
      });
    }
    return [...selected.values()].sort((a, b) => {
      const rank = { upstream: 0, seed: 1, downstream: 2 };
      if (a.relation !== b.relation) return rank[a.relation] - rank[b.relation];
      const aLevel = a.relation === "upstream" ? -a.level : a.level;
      const bLevel = b.relation === "upstream" ? -b.level : b.level;
      return aLevel - bLevel || a.key.localeCompare(b.key, undefined, { numeric: true });
    }).map((entry) => ({ ...entry, record: graph.nodes.get(entry.key) || null }));
  }

  function buildConversationTree(graph, entries) {
    const selected = new Map(entries.map((entry) => [entry.key, entry]));
    const children = new Map();
    const roots = [];
    for (const entry of entries) {
      const parents = [...graph.parents.get(entry.key) || []].filter((key) => selected.has(key));
      if (!parents.length) roots.push(entry.key);
      for (const parent of parents) {
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent).push(entry.key);
      }
    }
    const visited = new Set();
    const seedTopic = entries.find((entry) => entry.relation === "seed")?.key.split(":")[0];
    roots.sort((a, b) => Number(b.startsWith(`${seedTopic}:`)) - Number(a.startsWith(`${seedTopic}:`))
      || a.localeCompare(b, undefined, { numeric: true }));
    function branch(key, parentKey, depth) {
      const alias = visited.has(key);
      const node = { key, parentKey, depth, entry: selected.get(key), alias, children: [] };
      if (!alias) {
        visited.add(key);
        node.children = (children.get(key) || []).map((child) => branch(child, key, depth + 1));
      }
      return node;
    }
    const forest = roots.map((key) => branch(key, null, 0));
    // A malformed cross-topic cycle still gets a finite, navigable branch.
    for (const entry of entries) {
      if (!visited.has(entry.key)) forest.push(branch(entry.key, null, 0));
    }
    return forest;
  }

  return { keyOf, buildGraph, selectConversation, buildConversationTree };
});
