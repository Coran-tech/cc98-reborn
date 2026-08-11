const assert = require("assert/strict");
const path = require("path");
const { spawn } = require("child_process");
const syntaxToolsCore = require("../../src/extended-ubb-core.js");

const port = 44304;
const origin = `http://127.0.0.1:${port}`;
const serverPath = path.join(__dirname, "server.js");
const child = spawn(process.execPath, [serverPath], {
  cwd: path.resolve(__dirname, "..", ".."),
  env: { ...process.env, CC98_LOCAL_PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let serverOutput = "";
child.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

async function waitForServer() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/__test/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local forum did not start.\n${serverOutput}`);
}

async function request(pathname, options) {
  const response = await fetch(`${origin}${pathname}`, options);
  assert.equal(response.ok, true, `${options?.method || "GET"} ${pathname} failed`);
  return response;
}

async function run() {
  assert.deepEqual(
    syntaxToolsCore.preferSavedSelection(
      { start: 10, end: 10, surface: "source" },
      { start: 0, end: 10, surface: "source" }
    ),
    { start: 0, end: 10, surface: "source" }
  );
  const wrappedSelection = syntaxToolsCore.buildSourceEdit(
    "alpha beta",
    { start: 0, end: 10 },
    { before: "[quote]", after: "[/quote]" }
  );
  assert.equal(wrappedSelection.nextValue, "[quote]alpha beta[/quote]");
  assert.deepEqual(wrappedSelection.nextSelection, { start: 7, end: 17 });
  const collapsedInsertion = syntaxToolsCore.buildSourceEdit(
    "ab",
    { start: 1, end: 1 },
    { before: "[math]", after: "[/math]" }
  );
  assert.equal(collapsedInsertion.nextValue, "a[math][/math]b");
  assert.deepEqual(collapsedInsertion.nextSelection, { start: 7, end: 7 });
  assert.equal((syntaxToolsCore.buildTableUbb(2, 3).match(/\[th\]/g) || []).length, 3);
  assert.equal((syntaxToolsCore.buildTableUbb(2, 3).match(/\[td\]/g) || []).length, 3);
  const clampedTable = syntaxToolsCore.buildTableUbb(-1, 2147483647);
  assert.equal((clampedTable.match(/\[tr\]/g) || []).length, 1);
  assert.equal((clampedTable.match(/\[th\]/g) || []).length, 6);
  assert.equal((clampedTable.match(/\[td\]/g) || []).length, 0);
  const fractionalTable = syntaxToolsCore.buildTableUbb(2.9, 3.9);
  assert.equal((fractionalTable.match(/\[tr\]/g) || []).length, 2);
  assert.equal((fractionalTable.match(/\[th\]/g) || []).length, 3);
  assert.equal((fractionalTable.match(/\[td\]/g) || []).length, 3);
  assert.equal((syntaxToolsCore.buildTableUbb("nope", 0).match(/\[th\]/g) || []).length, 1);

  await waitForServer();

  const health = await (await request("/__test/health")).json();
  assert.equal(health.ok, true);
  assert.equal(health.host, "127.0.0.1");
  assert.equal(health.port, port);
  assert.equal(Number.isInteger(health.pid) && health.pid > 0, true);
  assert.equal(Number.isInteger(health.uptimeSeconds) && health.uptimeSeconds >= 0, true);
  assert.equal(Number.isNaN(Date.parse(health.startedAt)), false);
  assert.equal(Number.isInteger(health.activityRequests) && health.activityRequests >= 0, true);

  const index = await (await request("/", {
    headers: { Accept: "text/html" }
  })).text();
  assert.match(index, /\/__test\/content\.js/);
  assert.match(index, /\/src\/extended-ubb\.js/);
  assert.match(index, /\/src\/extended-ubb-core\.js/);
  assert.ok(
    index.indexOf("/src/extended-ubb-core.js") < index.indexOf("/src/extended-ubb.js"),
    "syntax tool core must load before the renderer and toolbar"
  );
  assert.match(index, /\/src\/vendor\/showdown\/showdown\.min\.js/);
  assert.match(index, /\/src\/vendor\/katex\/katex\.min\.js/);
  assert.match(index, /"vendors\.js","main\.js"/);

  const experimentalSyntax = await (await request("/src/extended-ubb.js")).text();
  assert.match(experimentalSyntax, /CC98RebornExtendedUbb/);
  assert.match(experimentalSyntax, /cc98RebornExtendedUbbTour:v1/);
  assert.match(experimentalSyntax, /EXTENDED_UBB_TOUR_VERSION = "0\.3\.4"/);
  assert.match(experimentalSyntax, /cc98-local-syntax-experimental-badge/);
  assert.match(experimentalSyntax, /打开扩展语法/);
  assert.match(experimentalSyntax, /rememberExtendedUbbTourSeen/);
  assert.match(experimentalSyntax, /cc98-local-experimental-table/);
  assert.match(experimentalSyntax, /cc98-local-syntax-tools/);
  assert.match(experimentalSyntax, /buildTableUbb/);
  assert.match(experimentalSyntax, /positionLocalSyntaxPopover/);
  assert.match(experimentalSyntax, /insertUnformattedVisualLine/);
  assert.match(experimentalSyntax, /event\.shiftKey/);
  assert.match(experimentalSyntax, /createEditableCodeBlock/);
  assert.match(experimentalSyntax, /insertEditableCodeLineBreak/);
  assert.match(experimentalSyntax, /normalizeEscapedEditableCodeBlocks/);
  assert.match(experimentalSyntax, /moveEditableCodeLineOutside/);
  assert.match(experimentalSyntax, /replaceEditableCodeSelectionWithText/);
  assert.match(experimentalSyntax, /serializeEditableMarkdown/);
  assert.match(experimentalSyntax, /cc98-rebuild-markdown-post/);
  assert.doesNotMatch(experimentalSyntax, /id: "replyview", label: "回复可见"/);
  assert.doesNotMatch(experimentalSyntax, /createLocalFontControl/);
  assert.doesNotMatch(experimentalSyntax, /cc98-local-font-section/);
  assert.equal(
    (experimentalSyntax.match(/if \(result\?\.applied\) \{[\s\S]{0,80}?closeLocalSyntaxTools\(tools\);/g) || []).length >= 3,
    true,
    "successful syntax actions must close the popover"
  );
  assert.match(experimentalSyntax, /cc98LocalUbbTag = "code"/);
  assert.doesNotMatch(experimentalSyntax, /setRawSource\(pre, rawSource\)/);
  assert.match(experimentalSyntax, /\[img=1\]/);

  const codeRegression = await (await request("/__test/code-editor-regression.html")).text();
  assert.match(codeRegression, /Editable \[code\] regression/);
  assert.match(codeRegression, /code-editor-regression\.js/);
  const interactionRegression = await (await request("/__test/interaction-regression.html")).text();
  assert.match(interactionRegression, /CC98 Reborn interaction regression/);

  const experimentalSyntaxStyles = await (await request("/src/extended-ubb.css")).text();
  assert.match(experimentalSyntaxStyles, /\.cc98-local-syntax-popover\s*\{[^}]*position:\s*fixed/s);
  assert.match(experimentalSyntaxStyles, /z-index:\s*2147483000/);
  assert.match(experimentalSyntaxStyles, /\.cc98-local-syntax-experimental-badge\s*\{[^}]*background:\s*#fff4c2/s);
  assert.match(experimentalSyntaxStyles, /\.cc98-local-syntax-tour-layer\s*\{[^}]*z-index:\s*2147483500/s);
  assert.match(experimentalSyntaxStyles, /\.cc98-local-syntax-tour-dialog\s*\{[^}]*width:\s*min\(520px/s);
  assert.match(experimentalSyntaxStyles, /\.cc98-local-experimental-quote\s*\{[^}]*border:\s*1px solid/s);
  assert.match(experimentalSyntaxStyles, /\.cc98-local-experimental-quote:empty::before\s*\{[^}]*content:\s*"\\200B"/s);
  assert.match(experimentalSyntaxStyles, /\.cc98-local-experimental-code > ol\s*\{[^}]*counter-reset:\s*li/s);
  assert.match(experimentalSyntaxStyles, /\.cc98-local-experimental-code > ol > li::before\s*\{[^}]*content:\s*counter\(li\)/s);

  const experimentalSyntaxCore = await (await request("/src/extended-ubb-core.js")).text();
  assert.match(experimentalSyntaxCore, /CC98RebornExtendedUbbCore/);
  assert.match(experimentalSyntaxCore, /preferSavedSelection/);
  assert.match(experimentalSyntaxCore, /buildSourceEdit/);

  const localContentScript = await (await request("/__test/content.js")).text();
  assert.match(localContentScript, /extendedUbb\?\.shouldHandle/);
  assert.match(localContentScript, /data-cc98-local-ubb-source/);
  assert.match(localContentScript, /extendedUbbTag === "code"/);
  assert.match(localContentScript, /hasExtendedStructuredContent/);
  assert.match(localContentScript, /data-cc98-local-ubb-tag='table'/);
  assert.match(localContentScript, /data-cc98-local-ubb-tag='quote'/);
  assert.match(localContentScript, /data-cc98-local-ubb-source/);
  assert.match(localContentScript, /extendedUbbApplySourceEdit/);
  assert.match(localContentScript, /EDITOR_FONT_FAMILY_GROUPS/);
  assert.match(localContentScript, /cc98-rebuild-editor-font-select/);
  assert.match(localContentScript, /__cc98WysiwygApplyFontFamily/);
  assert.match(localContentScript, /Microsoft YaHei/);
  assert.match(localContentScript, /STHeiti Light/);
  assert.match(localContentScript, /STXingkai/);
  assert.match(localContentScript, /Apple LiSung Light/);
  assert.match(localContentScript, /hostname === "127\.0\.0\.1"/);
  assert.doesNotThrow(() => new Function(localContentScript));

  const config = await (await request("/static/config.json")).json();
  assert.equal(config.apiUrl, origin);

  const tags = await (await request("/board/81/tag-v2")).json();
  assert.equal(tags.layers, 1);
  assert.equal(tags.tags.length, 2);

  const posts = await (await request("/topic/6500000/post?from=0&size=10")).json();
  assert.equal(posts.length, 3);
  assert.match(posts[0].content, /\[font=KaiTi\]/);
  assert.match(posts[0].content, /\[img=1\]/);
  assert.match(posts[0].content, /\[math\]/);

  const topicId = await (await request("/board/81/topic", {
    method: "POST",
    body: JSON.stringify({ title: "smoke", content: "[b]test[/b]" })
  })).text();
  assert.equal(topicId, "6500000");

  const reply = await (await request("/topic/6500000/post", {
    method: "POST",
    body: JSON.stringify({ content: "reply" })
  })).json();
  assert.equal(reply.id, 900004);

  assert.equal(await (await request("/post/900001", {
    method: "PUT",
    body: JSON.stringify({ content: "edit" })
  })).text(), "ok");

  const reasons = await (await request("/post/rating-reason?type=1")).json();
  assert.equal(reasons[0].enabled, true);
  assert.equal(await (await request("/post/900001/rating-v2", {
    method: "PUT",
    body: JSON.stringify({ reasonId: reasons[0].id, type: 1 })
  })).text(), "ok");

  const requests = await (await request("/__test/requests")).json();
  assert.equal(requests.some((entry) => entry.method === "POST" && entry.path === "/board/81/topic"), true);
  assert.equal(requests.some((entry) => entry.method === "POST" && entry.path === "/topic/6500000/post"), true);
  assert.equal(requests.some((entry) => entry.method === "PUT" && entry.path === "/post/900001"), true);
  assert.equal(requests.some((entry) => entry.method === "PUT" && entry.path === "/post/900001/rating-v2"), true);
}

run()
  .then(() => {
    console.log("local-forum-smoke: ok");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    child.kill();
  });
