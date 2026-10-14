const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");
const { spawn } = require("child_process");
const syntaxToolsCore = require("../../src/extended-ubb-core.js");

const port = 44304;
const origin = `http://127.0.0.1:${port}`;
const serverPath = path.join(__dirname, "server.js");
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc98-reborn-local-forum-"));
const dataPath = path.join(runtimeRoot, "forum-data.json");
const child = spawn(process.execPath, [serverPath], {
  cwd: path.resolve(__dirname, "..", ".."),
  env: {
    ...process.env,
    CC98_LOCAL_PORT: String(port),
    CC98_LOCAL_HOST: "0.0.0.0",
    CC98_LOCAL_DATA_PATH: dataPath,
    CC98_LOCAL_UPLOAD_ROOT: path.join(runtimeRoot, "uploads"),
    CC98_LOCAL_RESET: "1"
  },
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
  let response;
  try {
    response = await fetch(`${origin}${pathname}`, options);
  } catch (error) {
    throw new Error(`${options?.method || "GET"} ${pathname} transport failed: ${error.message}\n${serverOutput}`);
  }
  assert.equal(response.ok, true, `${options?.method || "GET"} ${pathname} failed`);
  return response;
}

function rawRequest(pathname, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({ hostname: "127.0.0.1", port, path: pathname, headers }, (response) => {
      response.resume();
      response.on("end", () => resolve({ status: response.statusCode, headers: response.headers }));
    });
    request.on("error", reject);
    request.end();
  });
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
  child.on("exit", (code, signal) => {
    serverOutput += `\n[child-exit code=${code} signal=${signal}]`;
  });

  const health = await (await request("/__test/health")).json();
  assert.equal(health.ok, true);
  assert.equal(health.host, "127.0.0.1");
  assert.equal(health.port, port);
  assert.equal(Number.isInteger(health.pid) && health.pid > 0, true);
  assert.equal(Number.isInteger(health.uptimeSeconds) && health.uptimeSeconds >= 0, true);
  assert.equal(Number.isNaN(Date.parse(health.startedAt)), false);
  assert.equal(Number.isInteger(health.activityRequests) && health.activityRequests >= 0, true);
  assert.equal(health.backend.topics, 1);
  assert.equal(health.backend.posts, 3);

  const crossSite = await rawRequest("/__test/health", {
    Host: `127.0.0.1:${port}`,
    Origin: "https://evil.example",
    "Sec-Fetch-Site": "cross-site"
  });
  assert.equal(crossSite.status, 403);
  assert.equal(crossSite.headers["access-control-allow-origin"], undefined);
  const rebindingAttempt = await rawRequest("/__test/health", { Host: "evil.example" });
  assert.equal(rebindingAttempt.status, 403);
  const malformedHost = await rawRequest("/__test/health", { Host: "[" });
  assert.equal(malformedHost.status, 403);
  const allowedLocalOrigin = await fetch(`${origin}/__test/health`, {
    headers: { Origin: origin }
  });
  assert.equal(allowedLocalOrigin.status, 200);
  assert.equal(allowedLocalOrigin.headers.get("access-control-allow-origin"), origin);

  const indexResponse = await request("/", {
    headers: { Accept: "text/html" }
  });
  assert.match(indexResponse.headers.get("content-security-policy") || "", /connect-src 'self'/);
  assert.notEqual(indexResponse.headers.get("access-control-allow-origin"), "*");
  const index = await indexResponse.text();
  assert.match(index, /\/__test\/content\.js/);
  assert.match(index, /normalizeLocalSearchRoute/);
  assert.match(index, /boardId-then-keyword order/);
  assert.match(index, /__cc98CaptureDialogs/);
  assert.match(index, /window\.__CC98_LOCAL_DIALOGS__ = \[\]/);
  assert.match(index, /params\.get\("__cc98CaptureDialogs"\) !== "1"/);
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
  assert.match(experimentalSyntax, /trigger\.textContent = "扩展"/);
  assert.doesNotMatch(experimentalSyntax, /cc98-local-syntax-experimental-badge/);
  assert.match(experimentalSyntax, /打开扩展语法/);
  assert.match(experimentalSyntax, /rememberExtendedUbbTourSeen/);
  assert.match(experimentalSyntax, /cc98-local-experimental-table/);
  assert.match(experimentalSyntax, /cc98-local-syntax-tools/);
  assert.match(experimentalSyntax, /const EXTENDED_UBB_TOUR_AUTO_ENABLED = false/);
  assert.match(experimentalSyntax, /if \(!EXTENDED_UBB_TOUR_AUTO_ENABLED\) \{\s*return;/);
  assert.match(experimentalSyntax, /function createExtendedUbbTour/);
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
  assert.match(localContentScript, /localSiteManage/);
  assert.match(localContentScript, /function renderLocalSiteManage/);
  assert.match(localContentScript, /__local\/console#/);
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
  assert.match(localContentScript, /let the upstream React li/);
  const tagCompatibilityMarker = localContentScript.indexOf("// Keep the rebuilt visual state");
  assert.notEqual(tagCompatibilityMarker, -1);
  const tagCompatibilityEnd = localContentScript.indexOf('      if (target.closest(".tagBoxSelect, .downArrow"))', tagCompatibilityMarker);
  assert.notEqual(tagCompatibilityEnd, -1);
  const tagCompatibilityBlock = localContentScript.slice(tagCompatibilityMarker - 100, tagCompatibilityEnd);
  assert.match(tagCompatibilityBlock, /syncEditorTagValue\(row, item\)/);
  assert.doesNotMatch(tagCompatibilityBlock, /preventDefault|stopPropagation/);
  assert.doesNotThrow(() => new Function(localContentScript));

  const localChromeShim = await (await request("/__test/chrome-shim.js")).text();
  assert.match(localChromeShim, /__CC98_LOCAL_BOOTSTRAP__/);
  assert.match(localChromeShim, /\/__local\/extension-storage/);
  assert.match(localChromeShim, /BroadcastChannel/);
  assert.match(localChromeShim, /pullStorage/);

  const adminConsole = await (await request("/__local/console")).text();
  assert.match(adminConsole, /插件全量控制/);
  assert.match(adminConsole, /账号与权限/);
  assert.match(adminConsole, /主题管理/);
  assert.match(adminConsole, /\/__local\/admin\.js/);
  const adminScript = await (await request("/__local/admin.js")).text();
  assert.match(adminScript, /DEFAULT_SETTINGS/);
  assert.match(adminScript, /\/__local\/extension-storage/);
  assert.match(adminScript, /boardModerator/);
  const sitePortalStyles = await (await request("/__test/site-portal.css")).text();
  assert.match(sitePortalStyles, /cc98-local-site-manage-grid/);

  const bootstrappedHome = await (await request("/", { headers: { Accept: "text/html" } })).text();
  assert.match(bootstrappedHome, /signInCardCount/);
  assert.match(bootstrappedHome, /extensionStorageVersion/);

  const config = await (await request("/static/config.json")).json();
  assert.equal(config.apiUrl, origin);

  const shortSearchPage = await (await request("/search?keyword=%E6%B5%8B%E8%AF%95", {
    headers: { Accept: "text/html" }
  })).text();
  assert.match(shortSearchPage, /normalizeLocalSearchRoute/);

  const tags = await (await request("/board/81/tag-v2")).json();
  assert.equal(tags.layers, 1);
  assert.equal(tags.tags.length, 3);
  const tagGroups = await (await request("/board/81/tag")).json();
  assert.equal(tagGroups[0].layer, 1);
  assert.equal(tagGroups[0].tags.length, 3);

  const posts = await (await request("/topic/6500000/post?from=0&size=10")).json();
  assert.equal(posts.length, 3);
  assert.match(posts[0].content, /\[font=KaiTi\]/);
  assert.match(posts[0].content, /\[img=1\]/);
  assert.match(posts[0].content, /\[math\]/);

  const topicId = await (await request("/board/81/topic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "smoke", content: "[b]test[/b]", contentType: 0 })
  })).text();
  assert.equal(topicId, "6500001");

  const createdTopic = await (await request(`/topic/${topicId}`)).json();
  assert.equal(createdTopic.title, "smoke");
  assert.equal(createdTopic.replyCount, 0);

  const replyId = await (await request(`/topic/${topicId}/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "reply", contentType: 0 })
  })).text();
  assert.equal(replyId, "900005");

  const createdPosts = await (await request(`/topic/${topicId}/post?from=0&size=10`)).json();
  assert.equal(createdPosts.length, 2);
  assert.equal(createdPosts[1].content, "reply");

  assert.equal(await (await request("/post/900001", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "edit", contentType: 0, title: "edited seed topic" })
  })).text(), "ok");

  const edited = await (await request("/post/900001/original")).json();
  assert.equal(edited.content, "edit");
  assert.equal(edited.title, "edited seed topic");

  const likeAfterPut = await (await request("/post/900002/like", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "1"
  })).json();
  assert.equal(likeAfterPut.likeState, 1);
  assert.equal(likeAfterPut.likeCount, 20);
  const likeAfterToggle = await (await request("/post/900002/like", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: "1"
  })).json();
  assert.equal(likeAfterToggle.likeState, 0);
  assert.equal(likeAfterToggle.likeCount, 19);

  assert.equal(await (await request(`/me/favorite/${topicId}`, { method: "PUT" })).text(), "ok");
  assert.equal(await (await request(`/topic/${topicId}/isfavorite`)).json(), true);
  const favorites = await (await request("/topic/me/favorite?from=0&size=20")).json();
  assert.equal(favorites.some((item) => item.id === Number(topicId)), true);

  assert.equal(await (await request("/me/followee/100002", { method: "DELETE" })).text(), "ok");
  assert.equal(await (await request("/me/followee/100002")).json(), false);
  assert.equal(await (await request("/me/followee/100002", { method: "PUT" })).text(), "ok");
  assert.equal(await (await request("/me/followee/100002")).json(), true);
  assert.deepEqual(await (await request("/me/followee?from=0&size=10")).json(), [100002]);

  const serverNow = await (await request("/config/now")).json();
  assert.equal(Number.isNaN(Date.parse(serverNow.data)), false);

  const tracedPosts = await (await request("/post/topic/user?topicid=6500000&userid=795406&from=0&size=10")).json();
  assert.equal(tracedPosts[0].count, 2);

  const messageId = await (await request("/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receiverId: 100002, content: "persistent private message" })
  })).text();
  assert.equal(Number.isInteger(Number(messageId)), true);
  const messages = await (await request("/message/user/100002?from=0&size=20")).json();
  assert.equal(messages.some((item) => item.content === "persistent private message"), true);

  const reasons = await (await request("/post/rating-reason?type=1")).json();
  assert.equal(reasons[0].enabled, true);
  assert.equal(await (await request("/post/900002/rating-v2", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reasonId: reasons[0].id, type: 1 })
  })).text(), "ok");

  const state = await (await request("/__test/state")).json();
  assert.equal(state.stats.topics, 2);
  assert.equal(state.stats.posts, 5);
  assert.equal(state.data.topics.some((item) => item.id === Number(topicId)), true);
  assert.equal(fs.existsSync(dataPath), true);

  const requests = await (await request("/__test/requests")).json();
  assert.equal(requests.some((entry) => entry.method === "POST" && entry.path === "/board/81/topic"), true);
  assert.equal(requests.some((entry) => entry.method === "POST" && entry.path === `/topic/${topicId}/post`), true);
  assert.equal(requests.some((entry) => entry.method === "PUT" && entry.path === "/post/900001"), true);
  assert.equal(requests.some((entry) => entry.method === "PUT" && entry.path === "/post/900002/rating-v2"), true);
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
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  });
