const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const questionPath = "experiments/question-mark/";
const origin = "https://question.coranqwq.xyz";

assert.match(manifest.version, /^\d+\.\d+\.\d+(?:\.\d+)?$/);
assert(manifest.host_permissions.includes(`${origin}/*`));

const pageScript = manifest.content_scripts.find((entry) => entry.js?.includes("src/content.js"));
assert(pageScript, "main content script registration is missing");
assert(pageScript.js.indexOf(`${questionPath}content.js`) > pageScript.js.indexOf("src/content.js"));
assert(pageScript.css.includes(`${questionPath}content.css`));

for (const name of ["admin-key-store.js", "admin.html", "admin.js", "background.js", "content.js", "content.css"]) {
  assert(fs.existsSync(path.join(root, questionPath, name)), `${name} is missing`);
}

const background = read("src/background.js");
assert(background.indexOf(`importScripts("../${questionPath}admin-key-store.js")`)
  < background.indexOf(`importScripts("../${questionPath}background.js")`));

const popup = read("popup/popup.js");
const popupHtml = read("popup/popup.html");
const questionBackground = read(`${questionPath}background.js`);
const questionContent = read(`${questionPath}content.js`);
assert.match(popup, /questionMarkEnabled:\s*false/);
assert.match(popupHtml, /id="questionMarkEnabled"/);
assert(popupHtml.includes(`${origin}/privacy`));
assert(questionContent.includes(`${origin}/privacy`));
assert(questionBackground.includes(`QUESTION_API_ORIGIN = "${origin}"`));
assert.match(questionBackground, /questionMarkEnabled === true/);
assert.match(questionBackground, /questionPrivacyAccepted\(\)/);
assert.match(questionBackground, /requireSameCc98UserId\(authorization\.binding, webAccount\)/);
assert.match(questionBackground, /body: \{ challengeId: challenge\.id, idToken \}/);
assert.match(questionBackground, /body: \{ topicId, floors \}/);
assert.match(questionBackground, /body: \{ topicId, floor \}/);

async function checkFrameRequests() {
  const vm = require("node:vm");
  const local = { cc98ComfortSettings: { questionMarkEnabled: true }, "cc98RebornQuestionPrivacyAccepted:v1": true };
  const session = { "cc98RebornQuestionSession:v1": { token: "local-test-only", bindingEpoch: 42, expiresAt: Date.now() + 60000 } };
  const calls = [], accounts = [], listeners = [];
  let accountId = "123";
  const context = vm.createContext({ URL, Date, Map, Set, Number, String, Error,
    isCc98WebPageTabUrl: new Function("URL", background.match(/function isCc98WebPageTabUrl\(value\) \{[\s\S]*?\n\}/)[0] + ";return isCc98WebPageTabUrl;")(URL),
    isWebVpnPageUrl: value => new URL(value).hostname.endsWith("webvpn.zju.edu.cn"),
    readLocalStorage: async key => ({ [key]: local[key] }),
    writeLocalStorage: async value => Object.assign(local, value),
    readSessionStorage: async key => ({ [key]: session[key] }),
    removeSessionStorage: async key => { delete session[key]; },
    getOpenIdBinding: async () => ({ binding: { bound: true, userId: "123", boundAt: 42 } }),
    fetch: async (url, options) => {
      const body = JSON.parse(options.body); calls.push({ url, body });
      return { ok: true, json: async () => url.endsWith("/batch")
        ? { items: Object.fromEntries(body.floors.map(f => [f, { count: 0, mine: false }])) }
        : { count: 1, mine: true } };
    },
    chrome: { runtime: { onMessage: { addListener: fn => listeners.push(fn) } }, tabs: {
      sendMessage: (tabId, message, target, callback) => {
        accounts.push({ tabId, message, target }); callback({ account: { userId: accountId } });
      }
    } }
  });
  vm.runInContext(questionBackground, context);
  const child = { tab: { id: 7, url: "https://www.cc98.org/newTopics" }, frameId: 3, documentId: "drawer-document", url: "https://www.cc98.org/topic/6500000/2" };
  const message = { type: "CC98_REBORN_QUESTION_GET", topicId: 6500000, floors: [11, 12] };
  const result = await context.questionHandle(message, child);
  assert.equal(result.items[11].count, 0);
  assert.equal(calls[0].body.topicId, 6500000);
  assert.equal(accounts[0].target.documentId, "drawer-document");
  assert.deepEqual(Object.keys(accounts[0].target), ["documentId"]);
  const toggled = await context.questionHandle({ type: "CC98_REBORN_QUESTION_TOGGLE", topicId: 6500000, floor: 11 }, child);
  assert.equal(toggled.mine, true);
  assert.deepEqual(calls[1].body, { topicId: 6500000, floor: 11 });
  const count = calls.length;
  for (const invalid of [
    { ...child, url: "https://www.cc98.org/topic/6500001" },
    { ...child, url: "https://www.cc98.org/topic/6500000suffix" },
    { ...child, url: "https://evil.example/topic/6500000" },
    { ...child, url: "https://cc98.org/topic/6500000" },
    { ...child, url: "" },
    { ...child, url: "ftp://www.cc98.org/topic/6500000", tab: { id: 7, url: "ftp://www.cc98.org/" } }
  ]) await assert.rejects(context.questionHandle(message, invalid), /无效的帖子地址/);
  assert.equal(calls.length, count, "invalid documents must not contact the question service");
  local["cc98RebornQuestionPrivacyAccepted:v1"] = false;
  const consent = await new Promise(resolve => listeners[0]({ type: "CC98_REBORN_QUESTION_ACCEPT_PRIVACY", topicId: 6500000 }, child, resolve));
  assert.equal(consent.ok, true);
  assert.equal(local["cc98RebornQuestionPrivacyAccepted:v1"], true);
  await context.questionHandle(message, { tab: { id: 7, url: child.url }, frameId: 0 });
  assert.equal(accounts.at(-1).target.frameId, 0, "top-level account lookup is explicitly targeted");
  await context.questionHandle(message, { ...child, documentId: undefined });
  assert.equal(accounts.at(-1).target.frameId, 3, "frame ID fallback remains scoped to its sender");
  accountId = "other-user";
  await assert.rejects(context.questionHandle({ type: "CC98_REBORN_QUESTION_TOGGLE", topicId: 6500000, floor: 11 }, child), /当前网页账号/);
  console.log("Question integration: drawer URL/count/toggle/consent, document targeting, invalid URLs and account mismatch passed");
}
checkFrameRequests().catch(error => { console.error(error); process.exitCode = 1; });
