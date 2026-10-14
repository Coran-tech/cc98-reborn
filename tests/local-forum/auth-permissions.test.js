const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const port = 44307;
const origin = `http://127.0.0.1:${port}`;
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc98-reborn-auth-"));
const dataPath = path.join(runtimeRoot, "forum-data.json");
const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  cwd: path.resolve(__dirname, "..", ".."),
  env: {
    ...process.env,
    CC98_LOCAL_PORT: String(port),
    CC98_LOCAL_DATA_PATH: dataPath,
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

async function json(pathname, options = {}, status = 200) {
  return (await request(pathname, options, status)).json();
}

async function login(username, password) {
  const result = await json("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  assert.match(result.access_token, /^cc98-access-/);
  return result;
}

async function run() {
  await waitForServer();

  await json("/me", {}, 401);
  await json("/auth/users", {}, 401);
  const badLogin = await json("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "LocalTester", password: "wrong-password" })
  }, 401);
  assert.equal(badLogin.error, "invalid_credentials");

  const admin = await login("LocalTester", "LocalTest!2026");
  const member = await login("SyntaxTester", "SyntaxTest!2026");
  const adminHeaders = { Authorization: `Bearer ${admin.access_token}` };
  const memberHeaders = { Authorization: `Bearer ${member.access_token}` };
  await json("/auth/users", { headers: memberHeaders }, 403);

  const adminMe = await json("/me", { headers: adminHeaders });
  assert.equal(adminMe.privilege, "管理员");
  assert.equal(adminMe.displayTitle, "站务管理员");
  assert.equal(Array.isArray(adminMe.boardMasterTitles), true);

  const ownExtensionStorage = await json("/__local/extension-storage", { headers: memberHeaders });
  assert.equal(ownExtensionStorage.userId, 100002);
  await json("/__local/extension-storage/795406", { headers: memberHeaders }, 403);

  const session = await json("/auth/session", { headers: memberHeaders });
  assert.equal(session.authenticated, true);
  assert.equal(session.user.name, "SyntaxTester");
  assert.equal(Object.hasOwn(session.user, "passwordHash"), false);

  await request("/board/81/topic", {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "member topic", content: "member content", contentType: 0 })
  });
  await request("/topic/6500000/lock", { method: "PUT", headers: memberHeaders }, 403);
  await request("/config/global/announcement", {
    method: "PUT",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ announcement: "forbidden" })
  }, 403);

  const ownPost = await json("/topic/6500000/post?from=0&size=20", { headers: memberHeaders });
  const memberPost = ownPost.find((post) => post.userName === "SyntaxTester");
  assert.ok(memberPost);
  await request(`/post/${memberPost.id}`, {
    method: "PUT",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "member edited", contentType: 0 })
  });
  await request("/topic/6500000/lock", { method: "PUT", headers: adminHeaders });
  await request("/topic/6500000/lock", { method: "DELETE", headers: adminHeaders });

  const snapshot = await json("/__test/state", { headers: adminHeaders }, 200);
  assert.equal(snapshot.data.users.some((user) => Object.hasOwn(user, "passwordHash")), false);
  const raw = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  assert.match(raw.users.find((user) => user.name === "LocalTester").passwordHash, /^scrypt-v1\$/);
  assert.equal(raw.users.some((user) => user.password === "LocalTest!2026"), false);

  await json("/auth/logout", { method: "POST", headers: memberHeaders });
  await json("/me", { headers: memberHeaders }, 401);

  const backup = await json("/__test/backup", { method: "POST", headers: adminHeaders });
  assert.equal(backup.ok, true);
  assert.equal(backup.integrity.ok, true);
  const health = await json("/__test/health");
  assert.equal(health.backend.schemaVersion, 4);

  console.log("local-forum-auth-permissions: ok");
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
