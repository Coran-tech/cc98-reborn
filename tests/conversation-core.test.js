const assert = require("node:assert/strict");
const { keyOf, buildGraph, selectConversation, buildConversationTree } = require("../src/conversation-core.js");

const post = (topicId, floor, refs = []) => ({ topicId: String(topicId), floor, references: refs.map(([id, number]) => ({ topicId: String(id), floor: number })) });
const records = [post(100, 1), post(100, 4, [[100, 1], [200, 2]]), post(100, 8, [[100, 4]]),
  post(100, 12, [[100, 4]]), post(100, 21, [[100, 12]]), post(100, 22, [[100, 12]]),
  post(100, 23, [[100, 22]]), post(100, 30), post(200, 2, [[200, 1]])];
const graph = buildGraph(records);
const all = selectConversation(graph, "100:12");
assert.deepEqual(new Set(all.map((entry) => entry.key)), new Set(["100:1", "100:4", "200:1", "200:2", "100:12", "100:21", "100:22", "100:23"]));
assert.equal(all.find((entry) => entry.key === "200:1").record, null, "deleted/unread ancestors must remain visible as missing nodes");
assert.equal(all.find((entry) => entry.key === "100:23").level, 2);
assert(!all.some((entry) => entry.key === "100:8"), "a sibling branch off an ancestor is not downstream of the selected floor");
assert.deepEqual(selectConversation(graph, "100:12", "downstream").map((entry) => entry.key), ["100:12", "100:21", "100:22", "100:23"]);
assert(!selectConversation(graph, "100:12", "upstream").some((entry) => entry.relation === "downstream"));
const tree = buildConversationTree(graph, all);
const branches = [];
const visit = (node) => { branches.push(node); node.children.forEach(visit); };
tree.forEach(visit);
assert.equal(branches.find((node) => node.key === "100:12" && !node.alias).parentKey, "100:4");
assert.equal(branches.find((node) => node.key === "100:23" && !node.alias).parentKey, "100:22");
assert.equal(branches.find((node) => node.key === "100:23" && !node.alias).depth, 4);
assert(branches.some((node) => node.key === "100:4" && node.parentKey === "200:2" && node.alias), "a second direct parent retains an attached reference to the shared reply");
assert.equal(branches.filter((node) => !node.alias).length, all.length);

const invalid = buildGraph([post(100, 4, [[100, 4], [100, 9], [100, 1], [100, 1]])]);
assert.deepEqual([...invalid.parents.get("100:4")], ["100:1"]);
const cyclic = buildGraph([post(100, 1, [[200, 1]]), post(200, 1, [[100, 1]])]);
assert.equal(selectConversation(cyclic, "100:1").length, 2, "cross-topic cycles must terminate without duplicate nodes");
assert.equal(buildConversationTree(cyclic, selectConversation(cyclic, "100:1"))[0].children[0].children[0].alias, true);
assert.equal(keyOf("bad", 1), "");
assert.equal(keyOf("100", 0), "");
assert.equal(keyOf("100", 1.5), "");
console.log("conversation-core: branches, cross-topic ancestry, missing floors, invalid edges and cycles passed");
