const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const manifest = JSON.parse(read("manifest.json"));
const questionPath = "experiments/question-mark/";
const origin = "https://question.coranqwq.xyz";

assert.equal(manifest.version, "0.3.5.2");
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

console.log("Question reaction integration references passed");
