const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const serverPath = path.join(__dirname, "server.js");
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc98-local-native-frontend-"));
const port = 44341;
const origin = `http://127.0.0.1:${port}`;
let output = "";

const child = spawn(process.execPath, [serverPath], {
  cwd: path.resolve(__dirname, "..", ".."),
  env: {
    ...process.env,
    CC98_LOCAL_PORT: String(port),
    CC98_LOCAL_DATA_PATH: path.join(runtimeRoot, "forum-data.json"),
    CC98_LOCAL_UPLOAD_ROOT: path.join(runtimeRoot, "uploads"),
    CC98_LOCAL_RESET: "1",
    CC98_LOCAL_REQUIRE_AUTH: "1",
    CC98_LOCAL_STRICT_API: "1",
    CC98_LOCAL_NATIVE_FRONTEND: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});

child.stdout.on("data", (chunk) => { output += chunk.toString(); });
child.stderr.on("data", (chunk) => { output += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${origin}/__test/health`)).ok) return;
    } catch { }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local forum did not start.\n${output}`);
}

async function request(pathname, options = {}, expectedStatus = 200) {
  const response = await fetch(`${origin}${pathname}`, { redirect: "manual", ...options });
  assert.equal(response.status, expectedStatus, `${options.method || "GET"} ${pathname}`);
  return response;
}

async function html(pathname, cookie = "") {
  return (await request(pathname, {
    headers: {
      Accept: "text/html",
      ...(cookie ? { Cookie: cookie } : {})
    }
  })).text();
}

async function login() {
  const response = await request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "LocalTester", password: "LocalTest!2026" })
  });
  const cookie = (response.headers.get("set-cookie") || "").split(";")[0];
  assert.match(cookie, /^cc98_local_session=/);
  return cookie;
}

function assertNativeForumPage(source, pathname) {
  assert.match(source, /window\.__CC98_LOCAL_NATIVE_FRONTEND__=true/, pathname);
  assert.match(source, /window\.__CC98_LOCAL_STANDALONE_ACCOUNT__=false/, pathname);
  assert.match(source, /const jsFileNames = \["vendors\.js","main\.js"\];/, pathname);
  assert.match(source, /\/__test\/native-bootstrap\.js/, pathname);
  assert.doesNotMatch(source, /\/__test\/content\.js/, pathname);
  assert.doesNotMatch(source, /\/__test\/styles\.css/, pathname);
  assert.doesNotMatch(source, /\/__local\/site-account\.js/, pathname);
}

function assertStandalonePage(source, pathname) {
  assert.match(source, /window\.__CC98_LOCAL_NATIVE_FRONTEND__=true/, pathname);
  assert.match(source, /window\.__CC98_LOCAL_STANDALONE_ACCOUNT__=true/, pathname);
  assert.match(source, /const jsFileNames = \[\];/, pathname);
  assert.match(source, /\/__local\/site-account\.css/, pathname);
  assert.match(source, /\/__local\/site-account\.js/, pathname);
  assert.doesNotMatch(source, /\/__test\/content\.js/, pathname);
  assert.doesNotMatch(source, /\/__test\/styles\.css/, pathname);
}

async function run() {
  await waitForServer();
  const health = await (await request("/__test/health")).json();
  assert.equal(health.frontendMode, "native");
  assert.equal(health.rebornInjected, false);

  const cookie = await login();
  for (const pathname of ["/", "/logOn", "/usercenter", "/usercenter/config", "/message/setting", "/topic/6500000/1"]) {
    assertNativeForumPage(await html(pathname, cookie), pathname);
  }
  for (const pathname of ["/register", "/account/password", "/usercenter/security", "/sitemanage"]) {
    assertStandalonePage(await html(pathname, cookie), pathname);
  }

  const bootstrap = await (await request("/__test/native-bootstrap.js")).text();
  assert.match(bootstrap, /installAccountSecurityLink/);
  assert.match(bootstrap, /账号安全/);
  assert.match(bootstrap, /navigator\.sendBeacon\("\/auth\/logout"\)/);
  assert.doesNotMatch(bootstrap, /event\.preventDefault\(\)[\s\S]{0,300}退出登录/);
  assert.doesNotThrow(() => new Function(bootstrap));

  const beforeLogout = await (await request("/auth/session", { headers: { Cookie: cookie } })).json();
  assert.equal(beforeLogout.authenticated, true);
  const logout = await request("/auth/logout", {
    method: "POST",
    headers: { Cookie: cookie }
  });
  assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0/);
  const afterLogout = await (await request("/auth/session", { headers: { Cookie: cookie } })).json();
  assert.equal(afterLogout.authenticated, false);

  const secondCookie = await login();
  const localLogout = await request("/__local/logout", {
    method: "POST",
    headers: { Cookie: secondCookie }
  }, 302);
  assert.equal(localLogout.headers.get("location"), "/");
  assert.match(localLogout.headers.get("set-cookie") || "", /Max-Age=0/);

  console.log("local-forum-native-frontend: ok");
}

run()
  .catch((error) => {
    console.error(error);
    if (output) console.error(output);
    process.exitCode = 1;
  })
  .finally(() => {
    child.kill();
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  });
