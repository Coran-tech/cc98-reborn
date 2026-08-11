const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number.parseInt(process.env.CC98_LOCAL_PORT || "44303", 10);
const HOST = process.env.CC98_LOCAL_HOST || "127.0.0.1";
const OUTPUT_LOG_PATH = process.env.CC98_LOCAL_OUTPUT_LOG || "";
const ERROR_LOG_PATH = process.env.CC98_LOCAL_ERROR_LOG || "";
const projectRoot = path.resolve(__dirname, "..", "..");
const forumRoot = path.join(projectRoot, "reference", "Forum-main", "dist", "static");
const extensionRoot = projectRoot;
const requestLog = [];
const startedAt = new Date();

function formatLocalTimestamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function writeRuntimeLog(message, isError = false) {
  const text = String(message);
  const logPath = isError ? ERROR_LOG_PATH : OUTPUT_LOG_PATH;
  if (logPath) {
    try {
      fs.mkdirSync(path.dirname(logPath), { recursive: true });
      fs.appendFileSync(logPath, `[${formatLocalTimestamp(new Date())}] ${text}\n`, "utf8");
    } catch {
      // Logging must never prevent the local simulator from starting.
    }
  }
  (isError ? console.error : console.log)(text);
}

const user = {
  id: 795406,
  name: "LocalTester",
  portraitUrl: "/static/images/default_avatar_girl.png",
  privilege: "\u6b63\u5f0f\u7528\u6237",
  displayTitle: "\u672c\u5730\u6d4b\u8bd5\u7528\u6237",
  displayTitleId: 0,
  postCount: 1234,
  fanCount: 42,
  followCount: 18,
  popularity: 7,
  prestige: 1,
  gender: 1,
  theme: 4,
  isFollowing: false,
  isVerified: true,
  lockState: 0,
  lastLogOnTime: new Date().toISOString(),
  signatureCode: "[color=#2d7890][b]CC98 Reborn \u672c\u5730\u6d4b\u8bd5\u7b7e\u540d[/b][/color]"
};

const otherUser = {
  ...user,
  id: 100002,
  name: "SyntaxTester",
  portraitUrl: "/static/images/default_avatar_boy.png",
  fanCount: 8,
  isFollowing: true,
  signatureCode: "[u][color=#39785a]\u7b7e\u540d\u6863\u6837\u5f0f\u6d4b\u8bd5[/color][/u]"
};

const board = {
  id: 81,
  name: "\u672c\u5730\u6d4b\u8bd5\u7248",
  description: "[b]\u8fd9\u662f\u4e00\u4e2a\u4e0d\u8fde\u63a5\u751f\u4ea7 API \u7684 CC98 \u672c\u5730\u6d4b\u8bd5\u7248\u9762\u3002[/b]",
  boardMasters: [],
  anonymousState: 0,
  canEntry: true,
  todayCount: 12,
  topicCount: 345,
  postCount: 678,
  isLocked: false
};

const topic = {
  id: 6500000,
  boardId: 81,
  userId: user.id,
  userName: user.name,
  title: "CC98 Reborn \u672c\u5730 UBB \u4e0e Markdown \u6d4b\u8bd5\u5e16",
  time: "2026-08-09T00:00:00+08:00",
  lastPostTime: "2026-08-09T00:05:00+08:00",
  replyCount: 2,
  hitCount: 531,
  favoriteCount: 10,
  state: 0,
  type: 0,
  tag1: 1,
  tag2: 0,
  floor: 2,
  isAnonymous: false,
  isVote: false,
  todayCount: 0,
  notifyAllReplierPostIds: [],
  lotteryTopicDetail: null
};

const posts = [
  {
    id: 900001,
    topicId: topic.id,
    userId: user.id,
    userName: user.name,
    floor: 1,
    contentType: 0,
    content: [
      "[b]\u7c97\u4f53[/b] [i]\u659c\u4f53[/i] [u]\u4e0b\u5212\u7ebf[/u] [del]\u5220\u9664\u7ebf[/del]",
      "[color=#e5484d]\u7ea2\u8272[/color] [size=5]\u5927\u5b57[/size] [url=https://www.cc98.org]\u7edd\u5bf9\u94fe\u63a5[/url]",
      "[align=right]\u53f3\u5bf9\u9f50\u8868\u60c5 [ac01][/align]",
      "[left]\u5de6\u5bf9\u9f50\u522b\u540d[/left]",
      "[center][font=KaiTi]\u5c45\u4e2d\u4e0e\u5b57\u4f53\u6807\u7b7e[/font][/center]",
      "[right]\u53f3\u5bf9\u9f50\u522b\u540d[/right]",
      "[quote][md]### Markdown in UBB\n\n- \u5217\u8868\u9879 A\n- \u5217\u8868\u9879 B\n\n| \u8bed\u6cd5 | \u72b6\u6001 |\n| --- | --- |\n| Markdown | \u6b63\u5e38 |[/md][/quote]",
      "[line]",
      "[code]const answer = 98;\nconsole.log(answer);[/code]",
      "[table][tr][th]\u8bed\u6cd5[/th][th]\u7ed3\u679c[/th][/tr][tr][td]UBB[/td][td]\u6b63\u5e38[/td][/tr][/table]",
      "[img]/static/images/default_avatar_girl.png[/img]",
      "[img=1]/static/images/default_avatar_boy.png[/img]",
      "[upload=png]/static/images/default_avatar_girl.png[/upload]",
      "[upload]/__test/download/example.txt[/upload]",
      "[math]x^2 + y^2 = z^2[/math]"
    ].join("\n"),
    time: "2026-08-09T00:00:00+08:00",
    lastUpdateAuthor: user.name,
    lastUpdateTime: "2026-08-09T00:01:00+08:00",
    isAnonymous: false,
    isDeleted: false,
    isLZ: true,
    isMe: true,
    likeCount: 6,
    dislikeCount: 1,
    likeState: 0,
    awards: []
  },
  {
    id: 900002,
    topicId: topic.id,
    userId: otherUser.id,
    userName: otherUser.name,
    floor: 2,
    contentType: 1,
    content: "## Markdown \u56de\u590d\n\n- \u5217\u8868\u4e00\n- \u5217\u8868\u4e8c\n\n> \u5f15\u7528\u5185\u5bb9\n\n`inline code` \u548c **bold**\u3002",
    time: "2026-08-09T00:03:00+08:00",
    lastUpdateAuthor: "",
    lastUpdateTime: "",
    isAnonymous: false,
    isDeleted: false,
    isLZ: false,
    isMe: false,
    likeCount: 19,
    dislikeCount: 0,
    likeState: 0,
    awards: []
  },
  {
    id: 900003,
    topicId: topic.id,
    userId: user.id,
    userName: user.name,
    floor: 3,
    contentType: 0,
    content: "[align=center]\u7f16\u8f91\u3001\u56de\u5e16\u4e0e\u8868\u60c5\u540c\u6b65\u6d4b\u8bd5 [em01][/align]",
    time: "2026-08-09T00:05:00+08:00",
    lastUpdateAuthor: "",
    lastUpdateTime: "",
    isAnonymous: false,
    isDeleted: false,
    isLZ: false,
    isMe: true,
    likeCount: 2,
    dislikeCount: 0,
    likeState: 0,
    awards: []
  }
];

const tags = [{ id: 1, name: "\u8ba8\u8bba" }, { id: 2, name: "\u6c42\u52a9" }];

function topicLink(id, title, boardId = board.id, boardName = board.name) {
  return { id, title, boardId, boardName };
}

const homeData = {
  academics: [topicLink(6500000, "\u5b66\u672f\u8bed\u6cd5\u6d4b\u8bd5")],
  announcement: "[color=#2d7890][b]CC98 Reborn \u672c\u5730\u6a21\u62df\u8bba\u575b[/b][/color]",
  emotion: [topicLink(6500000, "\u60c5\u611f\u533a\u6d4b\u8bd5\u5e16")],
  fleaMarket: [topicLink(6500000, "\u5e02\u573a\u533a\u6d4b\u8bd5\u5e16")],
  fullTimeJob: [topicLink(6500000, "\u6c42\u804c\u6d4b\u8bd5\u5e16")],
  hotTopic: Array.from({ length: 10 }, (_, index) => topicLink(6500000, `${index + 1}. \u672c\u5730\u70ed\u95e8\u8bdd\u9898`, board.id, board.name)),
  lastUserName: user.name,
  onlineUserCount: 25,
  partTimeJob: [topicLink(6500000, "\u517c\u804c\u6d4b\u8bd5\u5e16")],
  postCount: 67890,
  recommendationFunction: [],
  recommendationReading: [{ imageUrl: "/static/images/board.jpg", title: "\u672c\u5730\u6d4b\u8bd5\u6307\u5357", url: "/topic/6500000", content: "\u6240\u6709\u8bf7\u6c42\u90fd\u7559\u5728\u672c\u673a\u3002" }],
  schoolEvent: [topicLink(6500000, "\u6821\u56ed\u6d3b\u52a8\u6d4b\u8bd5")],
  schoolNews: [],
  specialOffer: [],
  study: [topicLink(6500000, "UBB \u4e0e Markdown \u8bed\u6cd5")],
  todayCount: 12,
  todayTopicCount: 3,
  topicCount: 345,
  userCount: 999
};

function send(res, status, body, contentType) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  res.writeHead(status, {
    "Content-Type": contentType,
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(payload);
}

function sendJson(res, data, status = 200) {
  send(res, status, JSON.stringify(data), "application/json; charset=utf-8");
}

function sendText(res, data, status = 200) {
  send(res, status, data, "text/plain; charset=utf-8");
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".css": "text/css; charset=utf-8",
    ".gif": "image/gif",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".ttf": "font/ttf",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".webp": "image/webp"
  }[extension] || "application/octet-stream";
}

function safePath(root, relativePath) {
  const absoluteRoot = path.resolve(root);
  const candidate = path.resolve(absoluteRoot, relativePath);
  if (candidate !== absoluteRoot && !candidate.startsWith(`${absoluteRoot}${path.sep}`)) {
    return null;
  }
  return candidate;
}

function serveFile(res, root, relativePath) {
  const filePath = safePath(root, relativePath);
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return false;
  }
  send(res, 200, fs.readFileSync(filePath), mimeType(filePath));
  return true;
}

function localContentScript() {
  let source = fs.readFileSync(path.join(extensionRoot, "src", "content.js"), "utf8");
  const marker = "function isDirectCc98Host(hostname = location.hostname) {";
  if (!source.includes(marker)) {
    throw new Error("Could not locate isDirectCc98Host in src/content.js");
  }
  source = source.replace(
    marker,
    `${marker}\n  if (hostname === "127.0.0.1" || hostname === "localhost") {\n    return true;\n  }`
  );
  return source;
}
function localIndex() {
  const source = fs.readFileSync(path.join(forumRoot, "index.html"), "utf8");
  const testAssets = [
    '<script src="/__test/chrome-shim.js"></script>',
    '<link rel="stylesheet" href="/src/vendor/katex/katex.min.css">',
    '<link rel="stylesheet" href="/__test/styles.css">',
    '<link rel="stylesheet" href="/src/extended-ubb.css">',
    '<script src="/src/vendor/showdown/showdown.min.js"></script>',
    '<script src="/src/vendor/katex/katex.min.js"></script>',
    '<script src="/src/extended-ubb-core.js"></script>',
    '<script src="/src/extended-ubb.js"></script>',
    '<script src="/__test/page-submit-monitor.js"></script>',
    '<script src="/__test/content.js"></script>'
  ].join("\n  ");
  return source.replace("</head>", `  ${testAssets}\n</head>`);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleApi(req, res, url) {
  const route = url.pathname.toLowerCase();
  if (route === "/config/index") return sendJson(res, homeData);
  if (route === "/config/global/advertisement") return sendJson(res, []);
  if (route === "/config/global/alltag") return sendJson(res, tags);
  if (route === "/config/global") return sendJson(res, { allowRegister: true });
  if (route === "/me") return sendJson(res, { ...user, watermarkId: "LOCAL001-WATERMARK" });
  if (route === "/me/all-message-count" || route === "/me/unread-count") {
    return sendJson(res, { atCount: 0, messageCount: 0, replyCount: 0, systemCount: 0 });
  }
  if (route === "/me/favorite-topic-group") {
    return sendJson(res, [{ id: 0, name: "\u9ed8\u8ba4\u5206\u7ec4", count: topic.favoriteCount, createTime: topic.time }]);
  }
  if (/^\/me\/favorite\/\d+$/.test(route) && /^(?:PUT|DELETE)$/.test(req.method)) {
    return sendText(res, "ok");
  }
  if (route === "/board/all") return sendJson(res, [board]);
  if (route === "/board/81/tag-v2") return sendJson(res, { layers: 1, tags });
  if (route === "/board/81/tag") return sendJson(res, tags);
  if (route === "/board/81") return sendJson(res, board);
  if (route === "/topic/6500000/isfavorite" || /^\/topic\/\d+\/isfavorite$/.test(route)) return sendJson(res, false);
  if (route === "/topic/6500000/hot-post" || /^\/topic\/\d+\/hot-post$/.test(route)) return sendJson(res, [posts[1]]);
  if (/^\/topic\/\d+\/post$/.test(route) && req.method === "GET") {
    const from = Number.parseInt(url.searchParams.get("from") || "0", 10);
    const size = Number.parseInt(url.searchParams.get("size") || "10", 10);
    return sendJson(res, posts.slice(from, from + size));
  }
  if (/^\/topic\/\d+$/.test(route) && req.method === "GET") return sendJson(res, topic);
  if (/^\/topic\/(new|new-media|school-event|academics|study|emotion|flea-market|full-time-job|part-time-job)/.test(route)) return sendJson(res, homeData.hotTopic);
  if (route === "/user" || route === "/user/name") {
    const ids = url.searchParams.getAll("id");
    const names = url.searchParams.getAll("name");
    const values = ids.length ? ids.map(Number) : names;
    return sendJson(res, values.map((value) => String(value) === String(otherUser.id) || value === otherUser.name ? otherUser : user));
  }
  if (/^\/user\/name\//.test(route)) {
    const name = decodeURIComponent(url.pathname.split("/").pop() || "");
    return sendJson(res, name.toLowerCase() === otherUser.name.toLowerCase() ? otherUser : user);
  }
  if (/^\/user\/\d+$/.test(route) || /^\/user\/basic\/\d+$/.test(route)) {
    const id = Number.parseInt(url.pathname.split("/").pop(), 10);
    return sendJson(res, id === otherUser.id ? otherUser : user);
  }
  if (route === "/post/900001/original") {
    return sendJson(res, { ...posts[0], boardId: board.id, title: topic.title });
  }
  if (route === "/post/rating-reason") {
    const type = Number.parseInt(url.searchParams.get("type") || "1", 10);
    return sendJson(res, [{
      id: type === 2 ? 2 : 1,
      reason: type === 2 ? "\u672c\u5730\u6d4b\u8bd5\u53cd\u5bf9" : "\u672c\u5730\u6d4b\u8bd5\u652f\u6301",
      type,
      enabled: true
    }]);
  }
  if (/^\/post\/\d+\/rating-v2$/.test(route) && req.method === "PUT") {
    await readBody(req);
    return sendText(res, "ok");
  }
  if (/^\/post\/\d+\/like$/.test(route)) {
    return sendJson(res, { likeCount: 6, dislikeCount: 1, likeState: req.method === "PUT" ? 1 : 0 });
  }
  if (/^\/post\/\d+$/.test(route) && req.method === "PUT") {
    await readBody(req);
    return sendText(res, "ok");
  }
  if (/^\/me\/followee\/\d+$/.test(route)) return sendText(res, "ok");
  if (route === "/board/81/topic" && req.method === "POST") {
    await readBody(req);
    return sendText(res, String(topic.id));
  }
  if (/^\/topic\/\d+\/post$/.test(route) && req.method === "POST") {
    await readBody(req);
    return sendJson(res, { id: 900004, floor: 4 });
  }
  if (route === "/notification/at" && req.method === "POST") {
    await readBody(req);
    return sendText(res, "ok");
  }
  if (route === "/topic/random-recommendation") return sendJson(res, []);
  if (route.startsWith("/me/") || route.startsWith("/message/")) return sendJson(res, []);
  return sendJson(res, []);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
  if (url.pathname !== "/__test/health") {
    requestLog.push({ method: req.method, path: `${url.pathname}${url.search}`, at: Date.now() });
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS" });
    return res.end();
  }
  if (url.pathname === "/__test/health") {
    return sendJson(res, {
      ok: true,
      host: HOST,
      port: PORT,
      pid: process.pid,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.max(0, Math.floor(process.uptime())),
      requests: requestLog.length,
      activityRequests: requestLog.filter((entry) => !entry.path.startsWith("/__test/")).length
    });
  }
  if (url.pathname === "/__test/requests") return sendJson(res, requestLog);
  if (url.pathname === "/__test/download/example.txt") return sendText(res, "CC98 Reborn local upload test\n");
  if (url.pathname === "/__test/chrome-shim.js") return serveFile(res, __dirname, "chrome-shim.js");
  if (url.pathname === "/__test/code-editor-regression.html") return serveFile(res, __dirname, "code-editor-regression.html");
  if (url.pathname === "/__test/code-editor-regression.js") return serveFile(res, __dirname, "code-editor-regression.js");
  if (url.pathname === "/__test/interaction-regression.html") return serveFile(res, extensionRoot, "tests/interaction-regression.html");
  if (url.pathname === "/__test/content.js") return send(res, 200, localContentScript(), "text/javascript; charset=utf-8");
  if (url.pathname === "/__test/page-submit-monitor.js") return serveFile(res, extensionRoot, "src/page-submit-monitor.js");
  if (url.pathname === "/__test/styles.css") return serveFile(res, extensionRoot, "src/styles.css");
  if (url.pathname.startsWith("/src/")) return serveFile(res, extensionRoot, url.pathname.slice(1));
  if (url.pathname.startsWith("/__extension/")) return serveFile(res, extensionRoot, url.pathname.slice("/__extension/".length));
  if (url.pathname === "/static/config.json") {
    return sendJson(res, { apiUrl: `http://${HOST}:${PORT}`, openIdUrl: `http://${HOST}:${PORT}/openid`, imageUploadUrl: `http://${HOST}:${PORT}`, defaultTheme: 4 });
  }
  if (url.pathname === "/static/config.Production.json") return sendJson(res, {}, 404);
  if (url.pathname.startsWith("/static/")) {
    if (serveFile(res, forumRoot, url.pathname.slice("/static/".length))) return;
    return sendJson(res, { error: "static-not-found" }, 404);
  }
  const wantsHtml = req.method === "GET" && String(req.headers.accept || "").includes("text/html");
  if (wantsHtml) return send(res, 200, localIndex(), "text/html; charset=utf-8");
  try {
    return await handleApi(req, res, url);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: error.message }, 500);
  }
});

server.on("error", (error) => {
  writeRuntimeLog(error?.stack || error?.message || error, true);
});

server.listen(PORT, HOST, () => {
  writeRuntimeLog(`CC98 local forum: http://${HOST}:${PORT}`);
  writeRuntimeLog("Production API access is disabled; all API calls are served locally.");
});
