const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const port = 44309;
const origin = `http://127.0.0.1:${port}`;
const clientId = "9a1fd200-8687-44b1-4c20-08d50a96e5cd";
const clientSecret = "8b53f727-08e2-4509-8857-e34bf92b27f2";
const redirectUri = `http://127.0.0.1:${port}/callback`;
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc98-reborn-openid-"));
const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  cwd: path.resolve(__dirname, "..", ".."),
  env: {
    ...process.env,
    CC98_LOCAL_PORT: String(port),
    CC98_LOCAL_DATA_PATH: path.join(runtimeRoot, "forum-data.json"),
    CC98_LOCAL_UPLOAD_ROOT: path.join(runtimeRoot, "uploads"),
    CC98_LOCAL_RESET: "1",
    CC98_LOCAL_REQUIRE_AUTH: "1",
    CC98_LOCAL_STRICT_API: "1"
  },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
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

async function request(pathname, options = {}, status = 200) {
  const response = await fetch(`${origin}${pathname}`, options);
  assert.equal(response.status, status, `${options.method || "GET"} ${pathname}`);
  return response;
}

async function form(pathname, data, status = 200) {
  return (await request(pathname, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(data)
  }, status)).json();
}

function cookieFrom(response) {
  const value = response.headers.get("set-cookie") || "";
  const match = /cc98_local_session=([^;]+)/.exec(value);
  assert.ok(match, "expected local session cookie");
  return `cc98_local_session=${match[1]}`;
}

async function run() {
  await waitForServer();
  const discovery = await (await request("/openid/.well-known/openid-configuration")).json();
  assert.equal(discovery.issuer, `${origin}/openid`);

  await form("/openid/connect/token", {
    grant_type: "password",
    client_id: "wrong-client",
    client_secret: clientSecret,
    username: "LocalTester",
    password: "LocalTest!2026"
  }, 401);
  await form("/openid/connect/token", {
    grant_type: "password",
    client_id: clientId,
    client_secret: "wrong-secret",
    username: "LocalTester",
    password: "LocalTest!2026"
  }, 401);

  const passwordResponse = await request("/openid/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: clientId,
      client_secret: clientSecret,
      username: "SyntaxTester",
      password: "SyntaxTest!2026"
    })
  });
  const passwordGrant = await passwordResponse.json();
  assert.match(passwordGrant.access_token, /^cc98-access-/);
  assert.match(passwordGrant.refresh_token, /^cc98-refresh-/);
  const sessionCookie = cookieFrom(passwordResponse);

  const userInfo = await (await request("/openid/connect/userinfo", {
    headers: { Authorization: `Bearer ${passwordGrant.access_token}` }
  })).json();
  assert.equal(userInfo.name, "SyntaxTester");

  const authorizeQuery = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: "openid profile cc98",
    state: "strict-openid-state"
  });
  await request(`/openid/connect/authorize?${authorizeQuery}`, { redirect: "manual" }, 401);
  const authorization = await request(`/openid/connect/authorize?${authorizeQuery}`, {
    redirect: "manual",
    headers: { Cookie: sessionCookie }
  }, 302);
  const callback = new URL(authorization.headers.get("location"));
  assert.equal(callback.origin, origin);
  assert.equal(callback.searchParams.get("state"), "strict-openid-state");
  const code = callback.searchParams.get("code");
  assert.match(code, /^cc98-code-/);

  const codeGrant = await form("/openid/connect/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code
  });
  assert.match(codeGrant.access_token, /^cc98-access-/);
  await form("/openid/connect/token", {
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code
  }, 400);

  const refreshed = await form("/openid/connect/token", {
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: codeGrant.refresh_token
  });
  assert.match(refreshed.access_token, /^cc98-access-/);
  await request(`/openid/connect/endsession?${new URLSearchParams({ post_logout_redirect_uri: `${origin}/` })}`, {
    redirect: "manual",
    headers: { Cookie: sessionCookie }
  }, 302);
  await request("/me", { headers: { Cookie: sessionCookie } }, 401);
  console.log("local-forum-openid-strict: ok");
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    child.kill();
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  });
