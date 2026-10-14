const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const serverPath = path.join(__dirname, "server.js");
const runtimeRoots = [];
const children = [];

function startServer(port, strict = false) {
  const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), `cc98-local-account-${strict ? "strict" : "compat"}-`));
  runtimeRoots.push(runtimeRoot);
  const child = spawn(process.execPath, [serverPath], {
    cwd: path.resolve(__dirname, "..", ".."),
    env: {
      ...process.env,
      CC98_LOCAL_PORT: String(port),
      CC98_LOCAL_DATA_PATH: path.join(runtimeRoot, "forum-data.json"),
      CC98_LOCAL_UPLOAD_ROOT: path.join(runtimeRoot, "uploads"),
      CC98_LOCAL_RESET: "1",
      CC98_LOCAL_REQUIRE_AUTH: strict ? "1" : "0",
      CC98_LOCAL_STRICT_API: strict ? "1" : "0"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  children.push(child);
  let output = "";
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
  child.__cc98Output = () => output;
  return {
    child,
    origin: `http://127.0.0.1:${port}`,
    output: () => output
  };
}

async function waitForServer(server) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${server.origin}/__test/health`)).ok) return;
    } catch { }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local forum did not start.\n${server.output()}`);
}

async function request(server, pathname, options = {}, status = 200) {
  const response = await fetch(`${server.origin}${pathname}`, options);
  assert.equal(response.status, status, `${options.method || "GET"} ${pathname}`);
  return response;
}

async function json(server, pathname, options = {}, status = 200) {
  return (await request(server, pathname, options, status)).json();
}

function jsonOptions(method, body, cookie = "") {
  return {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: JSON.stringify(body)
  };
}

function cookieFrom(response) {
  const value = response.headers.get("set-cookie") || "";
  return value.split(";")[0];
}

async function login(server, username, password) {
  const response = await request(server, "/auth/login", jsonOptions("POST", { username, password }));
  const payload = await response.json();
  const cookie = cookieFrom(response);
  assert.match(cookie, /^cc98_local_session=/);
  return { payload, cookie };
}

async function runCompatibilityMode() {
  const server = startServer(44333, false);
  await waitForServer(server);

  const initial = await json(server, "/__local/account-context");
  assert.equal(initial.mode, "compatibility");
  assert.equal(initial.canSwitchAccounts, true);
  assert.equal(initial.currentUser.name, "LocalTester");
  assert.equal(initial.users.length, 2);

  await json(server, "/__local/current-user", jsonOptions("PUT", { userId: 100002 }));
  const member = await json(server, "/__local/account-context");
  assert.equal(member.currentUser.name, "SyntaxTester");
  assert.equal(member.isAdmin, false);

  // Compatibility mode account switching is a simulator action, not an admin
  // privilege. A selected member must still be able to switch back.
  await json(server, "/__local/current-user", jsonOptions("PUT", { userId: 795406 }));
  assert.equal((await json(server, "/__local/account-context")).currentUser.name, "LocalTester");

  const adminCreated = await json(server, "/auth/register", jsonOptions("POST", {
    username: "AdminCreated",
    password: "AdminCreated!2026",
    adminCreate: true
  }), 201);
  assert.equal(adminCreated.createdByAdmin, true);
  assert.equal((await json(server, "/__local/account-context")).currentUser.name, "LocalTester");

  await json(server, "/auth/registration", jsonOptions("PUT", {
    enabled: true,
    requireInvite: true,
    inviteCode: "LOCAL-INVITE-2026"
  }));
  await json(server, "/auth/register", jsonOptions("POST", {
    username: "InviteMissing",
    password: "InviteMissing!2026"
  }), 400);
  await json(server, "/auth/register", jsonOptions("POST", {
    username: "InviteWrong",
    password: "InviteWrong!2026",
    inviteCode: "wrong"
  }), 403);
  const invited = await json(server, "/auth/register", jsonOptions("POST", {
    username: "InviteAccepted",
    password: "InviteAccepted!2026",
    inviteCode: "LOCAL-INVITE-2026"
  }), 201);
  assert.equal(invited.compatibilityMode, true);
  assert.equal((await json(server, "/__local/account-context")).currentUser.name, "InviteAccepted");
  await json(server, "/__local/current-user", jsonOptions("PUT", { userId: 795406 }));
  await json(server, "/auth/registration", jsonOptions("PUT", { requireInvite: false, inviteCode: "" }));

  const selfRegistered = await json(server, "/auth/register", jsonOptions("POST", {
    username: "SelfRegistered",
    password: "SelfRegistered!2026"
  }), 201);
  assert.equal(selfRegistered.compatibilityMode, true);
  assert.equal((await json(server, "/__local/account-context")).currentUser.name, "SelfRegistered");

  await json(server, "/auth/change-password", jsonOptions("PUT", {
    currentPassword: "SelfRegistered!2026",
    newPassword: "SelfRegistered!2027"
  }));
  await json(server, "/auth/login", jsonOptions("POST", {
    username: "SelfRegistered",
    password: "SelfRegistered!2026"
  }), 401);
  const changedLogin = await json(server, "/auth/login", jsonOptions("POST", {
    username: "SelfRegistered",
    password: "SelfRegistered!2027"
  }));
  assert.equal(changedLogin.user.name, "SelfRegistered");

  await json(server, "/auth/login", jsonOptions("POST", {
    username: "SyntaxTester",
    password: "SyntaxTest!2026"
  }));
  assert.equal((await json(server, "/__local/account-context")).currentUser.name, "SyntaxTester");

  const userCenter = await (await request(server, "/usercenter/config", {
    headers: { Accept: "text/html" }
  })).text();
  assert.match(userCenter, /\/__local\/site-account\.js/);
  assert.match(userCenter, /\/__local\/site-account\.css/);
  assert.match(userCenter, /window\.__CC98_LOCAL_STANDALONE_ACCOUNT__=true/);
  assert.match(userCenter, /const jsFileNames = \[\];/);
  assert.doesNotMatch(userCenter, /const jsFileNames = \["vendors\.js","main\.js"\];/);

  const home = await (await request(server, "/", {
    headers: { Accept: "text/html" }
  })).text();
  assert.match(home, /window\.__CC98_LOCAL_STANDALONE_ACCOUNT__=false/);
  assert.match(home, /const jsFileNames = \["vendors\.js","main\.js"\];/);

  for (const pathname of ["/logOn", "/register", "/account/password", "/usercenter/security", "/sitemanage"]) {
    const html = await (await request(server, pathname, { headers: { Accept: "text/html" } })).text();
    assert.match(html, /window\.__CC98_LOCAL_STANDALONE_ACCOUNT__=true/, pathname);
    assert.match(html, /const jsFileNames = \[\];/, pathname);
  }

  const accountScript = await (await request(server, "/__local/site-account.js")).text();
  assert.match(accountScript, /CC98LocalAccountApp/);
  assert.match(accountScript, /renderUserCenter/);
  assert.match(accountScript, /renderAdminConsole/);
  assert.match(accountScript, /\/auth\/change-password/);
  assert.match(accountScript, /persistForumSession/);
  assert.match(accountScript, /clearForumSession/);
  assert.doesNotThrow(() => new Function(accountScript));

  const injectedContent = await (await request(server, "/__test/content.js")).text();
  assert.match(injectedContent, /kind === "localAccount"/);
  assert.match(injectedContent, /register/);
  assert.match(injectedContent, /renderLocalAccount\(app\)/);
  assert.match(injectedContent, /renderAdminConsole/);
  assert.match(injectedContent, /__cc98LocalAdminMetricsRefresh/);
  assert.doesNotThrow(() => new Function(injectedContent));
}

async function runStrictMode() {
  const server = startServer(44334, true);
  await waitForServer(server);

  const anonymous = await json(server, "/__local/account-context");
  assert.equal(anonymous.mode, "strict");
  assert.equal(anonymous.currentUser, null);
  assert.equal(anonymous.canSwitchAccounts, false);
  assert.deepEqual(anonymous.users, []);

  const member = await login(server, "SyntaxTester", "SyntaxTest!2026");
  const memberContext = await json(server, "/__local/account-context", {
    headers: { Cookie: member.cookie }
  });
  assert.equal(memberContext.currentUser.name, "SyntaxTester");
  assert.equal(memberContext.isAdmin, false);
  assert.equal(memberContext.users.length, 1);
  await json(server, "/__local/current-user", jsonOptions("PUT", { userId: 795406 }, member.cookie), 403);

  const admin = await login(server, "LocalTester", "LocalTest!2026");
  const adminContext = await json(server, "/__local/account-context", {
    headers: { Cookie: admin.cookie }
  });
  assert.equal(adminContext.isAdmin, true);
  assert.equal(adminContext.users.length, 2);
  const memberRegistrationView = await json(server, "/__local/account-context", {
    headers: { Cookie: member.cookie }
  });
  assert.equal(Object.hasOwn(memberRegistrationView.registration, "inviteCode"), false);

  const strictRegistration = await request(server, "/auth/register", jsonOptions("POST", {
    username: "StrictSelfRegistered",
    password: "StrictSelfRegistered!2026",
    switchToNewAccount: true
  }, admin.cookie), 201);
  const strictRegistrationPayload = await strictRegistration.json();
  const strictRegistrationCookie = cookieFrom(strictRegistration);
  assert.equal(strictRegistrationPayload.user.name, "StrictSelfRegistered");
  assert.equal(strictRegistrationPayload.createdByAdmin, undefined);
  assert.match(strictRegistrationCookie, /^cc98_local_session=/);
  assert.equal((await json(server, "/__local/account-context", {
    headers: { Cookie: strictRegistrationCookie }
  })).currentUser.name, "StrictSelfRegistered");

  const changed = await request(server, "/auth/change-password", jsonOptions("PUT", {
    currentPassword: "SyntaxTest!2026",
    newPassword: "SyntaxTest!2027"
  }, member.cookie));
  assert.match(changed.headers.get("set-cookie") || "", /Max-Age=0/);
  await json(server, "/auth/session", { headers: { Cookie: member.cookie } }, 200).then((session) => {
    assert.equal(session.authenticated, false);
  });
}

async function run() {
  await runCompatibilityMode();
  await runStrictMode();
  console.log("local-forum-account-frontend: ok");
}

run()
  .catch((error) => {
    console.error(error);
    children.forEach((child, index) => {
      const output = child.__cc98Output?.() || "";
      if (output) console.error(`[${index === 0 ? "compatibility" : "strict"} server]\n${output}`);
    });
    process.exitCode = 1;
  })
  .finally(() => {
    children.forEach((child) => child.kill());
    runtimeRoots.forEach((runtimeRoot) => fs.rmSync(runtimeRoot, { recursive: true, force: true }));
  });
