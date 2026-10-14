const http = require("http");
const fs = require("fs");
const path = require("path");
const { createLocalForumBackend } = require("./local-backend");

const PORT = Number.parseInt(process.env.CC98_LOCAL_PORT || "44303", 10);
// This simulator contains test accounts and intentionally relaxed compatibility
// paths. Never let an environment override expose it to a LAN or the Internet.
const HOST = "127.0.0.1";
const ALLOWED_HOST_HEADERS = new Set([`${HOST}:${PORT}`, `localhost:${PORT}`]);
const OUTPUT_LOG_PATH = process.env.CC98_LOCAL_OUTPUT_LOG || "";
const ERROR_LOG_PATH = process.env.CC98_LOCAL_ERROR_LOG || "";
const NATIVE_FRONTEND = process.env.CC98_LOCAL_NATIVE_FRONTEND === "1";
const projectRoot = path.resolve(__dirname, "..", "..");
const forumRoot = path.join(projectRoot, "reference", "Forum-main", "dist", "static");
const extensionRoot = projectRoot;
const backend = createLocalForumBackend({
  dataPath: process.env.CC98_LOCAL_DATA_PATH || path.join(__dirname, ".runtime", "forum-data.json"),
  uploadRoot: process.env.CC98_LOCAL_UPLOAD_ROOT || path.join(__dirname, ".runtime", "uploads"),
  backupRoot: process.env.CC98_LOCAL_BACKUP_ROOT || path.join(__dirname, ".runtime", "backups"),
  requireAuth: process.env.CC98_LOCAL_REQUIRE_AUTH === "1"
});
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

function send(res, status, body, contentType) {
  const payload = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const headers = {
    "Content-Type": contentType,
    "Content-Length": payload.length,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff"
  };
  if (res.cc98LocalCorsOrigin) {
    headers["Access-Control-Allow-Origin"] = res.cc98LocalCorsOrigin;
    headers.Vary = "Origin";
  }
  if (String(contentType).startsWith("text/html")) {
    headers["Content-Security-Policy"] = [
      "default-src 'self' data: blob:",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "media-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-src 'self' https:",
      "object-src 'none'",
      "base-uri 'none'"
    ].join("; ");
  }
  res.writeHead(status, headers);
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

function serveForumStatic(res, relativePath) {
  const normalizedPath = String(relativePath || "").replace(/\\/g, "/");
  if (NATIVE_FRONTEND && normalizedPath === "scripts/main.js") {
    const filePath = safePath(forumRoot, normalizedPath);
    if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return false;
    }
    // The released Forum bundle hard-codes the six default avatars to the
    // production host. Keep the native UI and click handlers intact while
    // serving those same bundled assets from this isolated local instance.
    const source = fs.readFileSync(filePath, "utf8")
      .replaceAll("//www.cc98.org/static/images/", "/static/images/");
    send(res, 200, source, "text/javascript; charset=utf-8");
    return true;
  }
  return serveFile(res, forumRoot, normalizedPath);
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
  const tagClickInterception = `      if (item instanceof HTMLElement && row.contains(item)) {
        event.preventDefault();
        event.stopPropagation();
        syncEditorTagValue(row, item);
        setEditorTagDropdownOpen(row, false);
        return;
      }`;
  if (!source.includes(tagClickInterception)) {
    throw new Error("Could not locate rebuilt tag click interception in src/content.js");
  }
  source = source.replace(
    tagClickInterception,
    `      if (item instanceof HTMLElement && row.contains(item)) {
        // Keep the rebuilt visual state, then let the upstream React li
        // handler receive the same click so InputTitle updates its parent.
        syncEditorTagValue(row, item);
        setEditorTagDropdownOpen(row, false);
        return;
      }`
  );
  const siteManageKindMarker = '  if (isReadLaterRoute()) {\n    return "readLater";\n  }';
  if (!source.includes(siteManageKindMarker)) {
    throw new Error("Could not locate read-later page kind in src/content.js");
  }
  source = source.replace(
    siteManageKindMarker,
    siteManageKindMarker
      + '\n  if (globalThis.__CC98_LOCAL_BOOTSTRAP__ && /^\\/(?:usercenter|logon|register|account\\/password)(?:\\/|$|[?#])/i.test(cc98RoutePath)) {\n    return "localAccount";\n  }'
      + '\n  if (globalThis.__CC98_LOCAL_BOOTSTRAP__ && /^\\/sitemanage(?:\\/|$|[?#])/i.test(cc98RoutePath)) {\n    return "localSiteManage";\n  }'
  );
  const userCenterRouteMarker = 'function isUserCenterRoutePath(path = getCurrentCc98RoutePath()) {';
  if (!source.includes(userCenterRouteMarker)) {
    throw new Error("Could not locate user-center route detection in src/content.js");
  }
  source = source.replace(
    userCenterRouteMarker,
    `${userCenterRouteMarker}\n  if (globalThis.__CC98_LOCAL_BOOTSTRAP__ && /^\\/(?:usercenter|logon|register|account\\/password)(?:\\/|$|[?#])/i.test(String(path || ""))) {\n    return false;\n  }`
  );
  const routePathMarker = '|| /^\\/(?:boardList|boardlist|newTopics|recommendedTopics|searchBoard|usercenter|topic|board|focus|search|user|message|editor|signin|logOn)(?:\\/|$|\\?)/i.test(path);';
  if (!source.includes(routePathMarker)) {
    throw new Error("Could not locate CC98 route path matcher in src/content.js");
  }
  source = source.replace(
    routePathMarker,
    '|| /^\\/(?:boardList|boardlist|newTopics|recommendedTopics|searchBoard|usercenter|topic|board|focus|search|user|message|editor|signin|logOn|register|account\\/password|sitemanage)(?:\\/|$|[?#])/i.test(path);'
  );
  const genericRendererMarker = "function renderGeneric(app) {";
  if (!source.includes(genericRendererMarker)) {
    throw new Error("Could not locate renderGeneric in src/content.js");
  }
  const siteManageRenderer = [
    "function renderLocalAccount(app) {",
    "  if (!globalThis.CC98LocalAccountApp?.render) {",
    "    const fallback = createElement(\"section\", \"cc98-rebuild-section\");",
    "    fallback.append(createElement(\"h2\", \"\", \"账号模块未载入\"));",
    "    fallback.append(createElement(\"p\", \"cc98-rebuild-card-meta\", \"请刷新页面后重试。\"));",
    "    app.append(fallback);",
    "    return;",
    "  }",
    "  globalThis.CC98LocalAccountApp.render(app);",
    "  globalThis.CC98RebornFavoriteShare?.mount(app);",
    "}",
    "",
    "function renderLocalSiteManage(app) {",
    "  const hero = createElement(\"section\", \"cc98-rebuild-hero cc98-local-site-manage-hero\");",
    "  hero.append(createElement(\"p\", \"cc98-rebuild-kicker\", \"LOCAL ADMINISTRATION\"));",
    "  hero.append(createElement(\"h1\", \"\", \"本地全站管理\"));",
    "  hero.append(createElement(\"p\", \"cc98-local-site-manage-lead\", \"论坛权限、内容与 CC98 Reborn 本地配置由同一控制台维护。\"));",
    "  app.append(hero);",
    "  const metrics = createElement(\"section\", \"cc98-rebuild-section cc98-local-site-manage-status\");",
    "  const heading = createElement(\"div\", \"cc98-rebuild-section-heading\");",
    "  heading.append(createElement(\"h2\", \"\", \"服务状态\"));",
    "  metrics.append(heading);",
    "  const metricGrid = createElement(\"div\", \"cc98-local-site-manage-metrics\");",
    "  [\"用户\", \"版面\", \"主题\", \"回复\"].forEach((label) => {",
    "    const item = createElement(\"div\", \"cc98-local-site-manage-metric\");",
    "    item.append(createElement(\"span\", \"\", label), createElement(\"strong\", \"\", \"--\"));",
    "    metricGrid.append(item);",
    "  });",
    "  metrics.append(metricGrid);",
    "  const refreshMetrics = () => fetch(\"/__test/health\", { cache: \"no-store\", credentials: \"same-origin\" })",
    "    .then((response) => response.ok ? response.json() : Promise.reject(new Error(String(response.status))))",
    "    .then((health) => {",
    "      const values = [health.backend?.users, health.backend?.boards, health.backend?.topics, health.backend?.posts];",
    "      metricGrid.querySelectorAll(\"strong\").forEach((element, index) => { element.textContent = String(values[index] ?? \"--\"); });",
    "      metrics.classList.remove(\"is-unavailable\");",
    "    })",
    "    .catch(() => { metrics.classList.add(\"is-unavailable\"); });",
    "  globalThis.__cc98LocalAdminMetricsRefresh = refreshMetrics;",
    "  refreshMetrics();",
    "  app.append(metrics);",
    "  const section = createElement(\"section\", \"cc98-rebuild-section\");",
    "  const sectionHeading = createElement(\"div\", \"cc98-rebuild-section-heading\");",
    "  sectionHeading.append(createElement(\"h2\", \"\", \"管理功能\"));",
    "  section.append(sectionHeading);",
    "  const grid = createElement(\"div\", \"cc98-local-site-manage-grid\");",
    "  [",
    "    [\"账号与权限\", \"设置站务、版主、账号状态与注册策略\", \"accounts\"],",
    "    [\"版面管理\", \"创建版面、编辑说明并分配版主\", \"boards\"],",
    "    [\"主题管理\", \"搜索、锁定、置顶、精华、删除与恢复\", \"topics\"],",
    "    [\"首页内容\", \"维护全站公告、推荐阅读与首页栏目\", \"homepage\"],",
    "    [\"插件控制\", \"按 UID 管理主题、浏览行为和本地数据\", \"extension\"],",
    "    [\"数据维护\", \"完整性检查、备份、恢复和审计记录\", \"data\"]",
    "  ].forEach(([title, description, panel]) => {",
    "    const link = createElement(\"a\", \"cc98-local-site-manage-card\");",
    "    link.href = \"/__local/console#\" + panel;",
    "    link.target = \"_blank\";",
    "    link.rel = \"noopener\";",
    "    link.append(createElement(\"strong\", \"\", title), createElement(\"span\", \"\", description));",
    "    grid.append(link);",
    "  });",
    "  section.append(grid);",
    "  app.append(section);",
    "  const adminSection = createElement(\"section\", \"cc98-rebuild-section cc98-local-site-admin-section\");",
    "  const adminHost = createElement(\"div\", \"cc98-local-site-admin-host\");",
    "  adminHost.append(createElement(\"p\", \"cc98-rebuild-card-meta\", \"正在读取站务权限与论坛数据...\"));",
    "  adminSection.append(adminHost);",
    "  app.append(adminSection);",
    "  globalThis.CC98LocalAccountApp?.renderAdminConsole?.(adminHost);",
    "}",
    "",
    genericRendererMarker
  ].join("\n");
  source = source.replace(genericRendererMarker, siteManageRenderer);
  const dispatchPattern = /    } else if \(kind === "userCenter"\) \{\r?\n      renderUserCenter\(app\);\r?\n    } else \{\r?\n      renderGeneric\(app\);\r?\n    }/;
  if (!dispatchPattern.test(source)) {
    throw new Error("Could not locate rebuilt page dispatch in src/content.js");
  }
  source = source.replace(
    dispatchPattern,
    '    } else if (kind === "userCenter") {\n      renderUserCenter(app);\n    } else if (kind === "localAccount") {\n      renderLocalAccount(app);\n    } else if (kind === "localSiteManage") {\n      renderLocalSiteManage(app);\n    } else {\n      renderGeneric(app);\n    }'
  );
  const genericHeroKinds = '["board", "userCenter", "message", "signin", "login", "error", "blacklist"]';
  if (!source.includes(genericHeroKinds)) {
    throw new Error("Could not locate generic hero page kinds in src/content.js");
  }
  source = source.replace(
    genericHeroKinds,
    '["board", "userCenter", "message", "signin", "login", "error", "blacklist", "localAccount", "localSiteManage"]'
  );
  const fallbackGuard = 'if (!["login", "error", "blacklist"].includes(kind) && !app.querySelector(".cc98-rebuild-blocked-page") && app.children.length <= 2) {';
  if (!source.includes(fallbackGuard)) {
    throw new Error("Could not locate rebuilt fallback guard in src/content.js");
  }
  source = source.replace(
    fallbackGuard,
    'if (!["login", "error", "blacklist", "localAccount"].includes(kind) && !app.querySelector(".cc98-rebuild-blocked-page") && app.children.length <= 2) {'
  );
  const topbarStoredAccountPattern = /  if \(hasFreshCc98LoginSession\(\)\) \{\r?\n    return createForcedTopbarUserEntry\(\);\r?\n  \}/;
  if (!topbarStoredAccountPattern.test(source)) {
    throw new Error("Could not locate stored topbar account fallback in src/content.js");
  }
  source = source.replace(
    topbarStoredAccountPattern,
    '  if (globalThis.__CC98_LOCAL_BOOTSTRAP__?.user || hasFreshCc98LoginSession()) {\n    return createForcedTopbarUserEntry();\n  }'
  );
  const syncAppMarker = '  if (\n    getPageKind() === "userCenter"';
  if (!source.includes(syncAppMarker)) {
    throw new Error("Could not locate rebuilt content sync entry in src/content.js");
  }
  source = source.replace(
    syncAppMarker,
    '  const localPageKind = getPageKind();\n  if (["localAccount", "localSiteManage"].includes(localPageKind)) {\n    return;\n  }\n  if (\n    localPageKind === "userCenter"'
  );
  return source;
}
function isStandaloneLocalAccountRoute(pathname = "/") {
  return /^\/(?:usercenter(?:\/|$)|logon(?:\/|$)|register(?:\/|$)|account\/password(?:\/|$)|sitemanage(?:\/|$))/i.test(String(pathname || "/"));
}

function localIndex(req = { headers: {} }, pathname = "/") {
  let source = fs.readFileSync(path.join(forumRoot, "index.html"), "utf8");
  const standaloneAccountPage = NATIVE_FRONTEND
    ? /^\/(?:register(?:\/|$)|account\/password(?:\/|$)|usercenter\/security(?:\/|$)|sitemanage(?:\/|$))/i.test(String(pathname || "/"))
    : isStandaloneLocalAccountRoute(pathname);
  if (standaloneAccountPage) {
    const forumBundleMarker = 'const jsFileNames = ["vendors.js","main.js"];';
    if (!source.includes(forumBundleMarker)) {
      throw new Error("Could not locate Forum application bundle loader");
    }
    // Account pages have their own local frontend. Starting the legacy React
    // application here would keep replacing form nodes while users type.
    source = source.replace(forumBundleMarker, "const jsFileNames = [];");
  }
  const bootstrap = backend.getBrowserBootstrap(req);
  const sharedTestAssets = [
    `<script>
      // Browser automation cannot read native alert text. Opt-in capture keeps
      // the real page code unchanged for ordinary simulator sessions while
      // making validation failures observable in local UI regression runs.
      (function installLocalDialogCapture() {
        var params = new URLSearchParams(window.location.search);
        if (params.get("__cc98CaptureDialogs") !== "1") return;
        window.__CC98_LOCAL_DIALOGS__ = [];
        window.alert = function (message) {
          var entry = { type: "alert", message: String(message), at: Date.now() };
          window.__CC98_LOCAL_DIALOGS__.push(entry);
          console.warn("[CC98 local dialog]", entry.message);
        };
      })();
    </script>`,
    `<script>
      // The released Forum bundle only recognizes /search?boardId=0&keyword=...
      // while Reborn also supports the shorter /search?keyword=... route.
      // Keep both routes valid in the local simulator without changing either
      // the bundled frontend or the extension's production navigation.
      (function normalizeLocalSearchRoute() {
        var url = new URL(window.location.href);
        if (url.pathname !== "/search" || !url.searchParams.has("keyword") || url.searchParams.has("boardId")) return;
        var params = new URLSearchParams();
        // Search.tsx uses a legacy ordered regexp rather than URLSearchParams.
        // Keep the historical boardId-then-keyword order for its parser.
        params.set("boardId", "0");
        params.set("keyword", url.searchParams.get("keyword") || "");
        url.searchParams.forEach(function (value, key) {
          if (key !== "boardId" && key !== "keyword") params.append(key, value);
        });
        window.history.replaceState(null, "", url.pathname + "?" + params.toString() + url.hash);
      })();
    </script>`,
    `<script>
      window.__CC98_LOCAL_STRICT_AUTH__=${process.env.CC98_LOCAL_REQUIRE_AUTH === "1" ? "true" : "false"};
      window.__CC98_LOCAL_NATIVE_FRONTEND__=${NATIVE_FRONTEND ? "true" : "false"};
      window.__CC98_LOCAL_BOOTSTRAP__=${JSON.stringify(bootstrap).replace(/</g, "\\u003c")};
      window.__CC98_LOCAL_STANDALONE_ACCOUNT__=${standaloneAccountPage ? "true" : "false"};
      if (window.__CC98_LOCAL_STANDALONE_ACCOUNT__) {
        document.documentElement.dataset.cc98LocalStandaloneAccount = "true";
      }
    </script>`
  ];
  const frontendAssets = NATIVE_FRONTEND ? [
    '<script src="/__test/native-bootstrap.js"></script>',
    ...(standaloneAccountPage ? [
      '<link rel="stylesheet" href="/__local/site-account.css">',
      '<script src="/__local/site-account.js"></script>',
      '<script>document.addEventListener("DOMContentLoaded", function () { CC98LocalAccountApp.render(document.getElementById("root")); }, { once: true });</script>'
    ] : [])
  ] : [
    '<script src="/__test/chrome-shim.js"></script>',
    '<link rel="stylesheet" href="/src/theme-tokens.css">',
    '<link rel="stylesheet" href="/src/vendor/katex/katex.min.css">',
    '<link rel="stylesheet" href="/__test/styles.css">',
    '<link rel="stylesheet" href="/src/extended-ubb.css">',
    '<link rel="stylesheet" href="/src/user-notes.css">',
    '<link rel="stylesheet" href="/src/interface-styles.css">',
    '<link rel="stylesheet" href="/__test/site-portal.css">',
    '<link rel="stylesheet" href="/__local/site-account.css">',
    '<script src="/src/vendor/showdown/showdown.min.js"></script>',
    '<script src="/src/theme-core.js"></script>',
    '<script src="/src/interface-style.js"></script>',
    '<script src="/src/vendor/katex/katex.min.js"></script>',
    '<script src="/src/extended-ubb-core.js"></script>',
    '<script src="/src/extended-ubb.js"></script>',
    '<script src="/__test/page-submit-monitor.js"></script>',
    '<script src="/__local/site-account.js"></script>',
    '<script src="/src/conversation-core.js"></script>',
    '<script src="/src/conversation.js"></script>',
    '<link rel="stylesheet" href="/src/topic-search.css">',
    '<script src="/src/topic-search.js"></script>',
    '<script src="/src/favorite-share-core.js"></script>',
    '<script src="/src/favorite-share-service.js"></script>',
    '<script src="/src/favorite-share.js"></script>',
    '<script src="/src/user-notes-core.js"></script>',
    '<script src="/src/user-notes.js"></script>',
    '<script src="/__test/content.js"></script>'
  ];
  const testAssets = [...sharedTestAssets, ...frontendAssets].join("\n  ");
  return source.replace("</head>", `  ${testAssets}\n</head>`);
}

function isFrontendOnlyGetRoute(pathname) {
  return /^\/(?:usercenter(?:\/|$)|account\/password(?:\/|$)|register(?:\/|$)|focus(?:\/|$)|newtopics(?:\/|$)|recommendedtopics(?:\/|$)|searchboard(?:\/|$)|search(?:\/|$)|signin(?:\/|$)|sitemanage(?:\/|$)|editor(?:\/|$)|annual-review(?:-|\/|$)|index\/?$|list(?:\/|$)|logon(?:\/|$))/i.test(pathname);
}

function allowedBrowserOrigin(value) {
  if (!value) return "";
  try {
    const origin = new URL(value);
    const port = origin.port || (origin.protocol === "http:" ? "80" : "");
    if (origin.protocol !== "http:" || port !== String(PORT)) return "";
    if (origin.hostname !== HOST && origin.hostname !== "localhost") return "";
    return origin.origin;
  } catch {
    return "";
  }
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
  return backend.handle(req, res, url);
}

const server = http.createServer(async (req, res) => {
  const requestHost = String(req.headers.host || "").toLowerCase();
  const requestOrigin = String(req.headers.origin || "");
  const allowedOrigin = allowedBrowserOrigin(requestOrigin);
  const fetchSite = String(req.headers["sec-fetch-site"] || "").toLowerCase();
  if (!ALLOWED_HOST_HEADERS.has(requestHost) || fetchSite === "cross-site" || (requestOrigin && !allowedOrigin)) {
    return sendJson(res, { error: "local_origin_required" }, 403);
  }
  const url = new URL(req.url, `http://${requestHost}`);
  if (allowedOrigin) res.cc98LocalCorsOrigin = allowedOrigin;
  if (url.pathname !== "/__test/health") {
    requestLog.push({ method: req.method, path: `${url.pathname}${url.search}`, at: Date.now() });
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      ...(allowedOrigin ? { "Access-Control-Allow-Origin": allowedOrigin, Vary: "Origin" } : {}),
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS"
    });
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
      activityRequests: requestLog.filter((entry) => !entry.path.startsWith("/__test/")).length,
      frontendMode: NATIVE_FRONTEND ? "native" : "reborn",
      rebornInjected: !NATIVE_FRONTEND,
      backend: backend.getStats()
    });
  }
  if (url.pathname === "/__test/shutdown" && req.method === "POST") {
    const permission = backend.isAdminRequest(req);
    if (!permission.ok) return sendJson(res, { error: permission.error }, permission.status);
    sendJson(res, { ok: true, pid: process.pid });
    return setTimeout(() => server.close(() => process.exit(0)), 20);
  }
  if (url.pathname === "/__test/requests") {
    const permission = backend.isAdminRequest(req);
    if (!permission.ok) return sendJson(res, { error: permission.error }, permission.status);
    return sendJson(res, requestLog);
  }
  if (url.pathname === "/__local/console") return serveFile(res, __dirname, "admin.html");
  if (url.pathname === "/__local/admin.css") return serveFile(res, __dirname, "admin.css");
  if (url.pathname === "/__local/admin.js") return serveFile(res, __dirname, "admin.js");
  if (url.pathname === "/__local/site-account.css") return serveFile(res, __dirname, "site-account.css");
  if (url.pathname === "/__local/site-account.js") return serveFile(res, __dirname, "site-account.js");
  if (url.pathname === "/__test/download/example.txt") return sendText(res, "CC98 Reborn local upload test\n");
  if (url.pathname === "/__test/chrome-shim.js") return serveFile(res, __dirname, "chrome-shim.js");
  if (url.pathname === "/__test/native-bootstrap.js") return serveFile(res, __dirname, "native-bootstrap.js");
  if (url.pathname === "/__test/code-editor-regression.html") return serveFile(res, __dirname, "code-editor-regression.html");
  if (url.pathname === "/__test/code-editor-regression.js") return serveFile(res, __dirname, "code-editor-regression.js");
  if (url.pathname === "/__test/interaction-regression.html") return serveFile(res, __dirname, "interaction-regression.html");
  if (url.pathname === "/favicon.ico") {
    if (serveFile(res, extensionRoot, "assets/icon32.png")) return;
    return send(res, 204, "", "image/x-icon");
  }
  if (url.pathname === "/__test/content.js") return send(res, 200, localContentScript(), "text/javascript; charset=utf-8");
  if (url.pathname === "/__test/page-submit-monitor.js") return serveFile(res, extensionRoot, "src/page-submit-monitor.js");
  if (url.pathname === "/__test/styles.css") return serveFile(res, extensionRoot, "src/styles.css");
  if (url.pathname === "/__test/site-portal.css") return serveFile(res, __dirname, "site-portal.css");
  if (url.pathname.startsWith("/src/")) return serveFile(res, extensionRoot, url.pathname.slice(1));
  if (url.pathname.startsWith("/__extension/")) return serveFile(res, extensionRoot, url.pathname.slice("/__extension/".length));
  if (url.pathname === "/static/config.json") {
    return sendJson(res, { apiUrl: `http://${HOST}:${PORT}`, openIdUrl: `http://${HOST}:${PORT}/openid`, imageUploadUrl: `http://${HOST}:${PORT}`, defaultTheme: 4 });
  }
  if (url.pathname === "/static/config.Production.json") return sendJson(res, {}, 404);
  if (url.pathname.startsWith("/static/")) {
    if (serveForumStatic(res, url.pathname.slice("/static/".length))) return;
    return sendJson(res, { error: "static-not-found" }, 404);
  }
  if (url.pathname.startsWith("/openid/")) {
    try {
      return await handleApi(req, res, url);
    } catch (error) {
      console.error(error);
      return sendJson(res, { error: error.message }, Number.isInteger(error.status) ? error.status : 500);
    }
  }
  const wantsHtml = req.method === "GET" && String(req.headers.accept || "").includes("text/html");
  if (wantsHtml) {
    try {
      return send(res, 200, localIndex(req, url.pathname), "text/html; charset=utf-8");
    } catch (error) {
      writeRuntimeLog(error?.stack || error?.message || error, true);
      return sendJson(res, { error: "local_page_build_failed", detail: error.message }, 500);
    }
  }
  if (req.method === "GET" && isFrontendOnlyGetRoute(url.pathname)) {
    try {
      return send(res, 200, localIndex(req, url.pathname), "text/html; charset=utf-8");
    } catch (error) {
      writeRuntimeLog(error?.stack || error?.message || error, true);
      return sendJson(res, { error: "local_page_build_failed", detail: error.message }, 500);
    }
  }
  try {
    return await handleApi(req, res, url);
  } catch (error) {
    console.error(error);
    return sendJson(res, { error: error.message }, Number.isInteger(error.status) ? error.status : 500);
  }
});

server.on("error", (error) => {
  writeRuntimeLog(error?.stack || error?.message || error, true);
});

server.listen(PORT, HOST, () => {
  writeRuntimeLog(`CC98 local forum: http://${HOST}:${PORT}`);
  writeRuntimeLog(`Frontend mode: ${NATIVE_FRONTEND ? "native Forum UI (Reborn disabled)" : "Reborn injected"}.`);
  writeRuntimeLog("Production API access is disabled; all API calls are served locally.");
});
