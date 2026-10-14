const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const port = 44305;
const origin = `http://127.0.0.1:${port}`;
const serverPath = path.join(__dirname, "server.js");
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc98-reborn-backend-persistence-"));
const dataPath = path.join(runtimeRoot, "forum-data.json");
let child = null;
let output = "";

function startServer(reset) {
  output = "";
  const env = {
    ...process.env,
    CC98_LOCAL_PORT: String(port),
    CC98_LOCAL_DATA_PATH: dataPath,
    CC98_LOCAL_UPLOAD_ROOT: path.join(runtimeRoot, "uploads")
  };
  if (reset) env.CC98_LOCAL_RESET = "1";
  else delete env.CC98_LOCAL_RESET;
  child = spawn(process.execPath, [serverPath], {
    cwd: path.resolve(__dirname, "..", ".."),
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
}

async function waitForServer() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/__test/health`);
      if (response.ok) return;
    } catch { }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local forum did not start.\n${output}`);
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  child = null;
}

async function json(pathname, options = {}) {
  const response = await fetch(`${origin}${pathname}`, options);
  assert.equal(response.ok, true, `${options.method || "GET"} ${pathname}: ${response.status}`);
  return response.json();
}

async function bodyText(pathname, options = {}) {
  const response = await fetch(`${origin}${pathname}`, options);
  assert.equal(response.ok, true, `${options.method || "GET"} ${pathname}: ${response.status}`);
  return response.text();
}

async function run() {
  startServer(true);
  await waitForServer();

  const invalid = await fetch(`${origin}/board/81/topic`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "invalid", content: "" })
  });
  assert.equal(invalid.status, 402);

  const topicId = Number(await bodyText("/board/81/topic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Persistence topic", content: "first post", contentType: 0 })
  }));
  assert.equal(topicId, 6500001);

  const postId = Number(await bodyText(`/topic/${topicId}/post`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "persistent reply", contentType: 0, parentId: 900004 })
  }));
  assert.equal(postId, 900005);

  await bodyText(`/me/favorite/${topicId}`, { method: "PUT" });
  await bodyText("/me/followee/100002", { method: "DELETE" });
  await json("/__local/extension-storage", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      values: {
        cc98ComfortSettings: { enabled: true, theme: "wine", rebuildUi: true },
        "cc98RebornReadLater:v1:uid:795406": [{ key: "topic:6500000", title: "persisted" }]
      }
    })
  });
  const messageId = Number(await bodyText("/message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ receiverId: 100002, content: "survives restart" })
  }));
  assert.equal(Number.isInteger(messageId), true);

  const form = new FormData();
  form.append("files", new Blob(["local upload body"], { type: "text/plain" }), "test.txt");
  const uploadResponse = await fetch(`${origin}/file`, { method: "POST", body: form });
  assert.equal(uploadResponse.ok, true);
  const uploaded = await uploadResponse.json();
  assert.equal(uploaded.length, 1);
  assert.match(uploaded[0], /^\/__uploads\//);
  assert.equal(await (await fetch(`${origin}${uploaded[0]}`)).text(), "local upload body");
  const extensionStorage = await json("/__local/extension-storage");
  assert.equal(extensionStorage.values.cc98ComfortSettings.theme, "wine");
  assert.equal(extensionStorage.values["cc98RebornReadLater:v1:uid:795406"][0].title, "persisted");

  const beforeRestart = await json("/__test/state");
  assert.equal(beforeRestart.stats.topics, 2);
  assert.equal(beforeRestart.stats.posts, 5);
  assert.equal(beforeRestart.stats.messages, 3);
  assert.equal(beforeRestart.stats.uploads, 1);

  await stopServer();
  startServer(false);
  await waitForServer();

  const topic = await json(`/topic/${topicId}`);
  assert.equal(topic.title, "Persistence topic");
  assert.equal(topic.replyCount, 1);
  const posts = await json(`/topic/${topicId}/post?from=0&size=10`);
  assert.equal(posts.some((post) => post.id === postId && post.content === "persistent reply"), true);
  assert.equal(await json(`/topic/${topicId}/isfavorite`), true);
  assert.equal(await json("/me/followee/100002"), false);
  const messages = await json("/message/user/100002?from=0&size=20");
  assert.equal(messages.some((message) => message.content === "survives restart"), true);
  assert.equal(await (await fetch(`${origin}${uploaded[0]}`)).text(), "local upload body");

  const afterRestart = await json("/__test/state");
  assert.equal(afterRestart.stats.topics, beforeRestart.stats.topics);
  assert.equal(afterRestart.stats.posts, beforeRestart.stats.posts);
  assert.equal(afterRestart.stats.messages, beforeRestart.stats.messages);

  const reset = await json("/__test/reset", { method: "POST" });
  assert.equal(reset.stats.topics, 1);
  assert.equal(reset.stats.posts, 3);
}

run()
  .then(() => console.log("local-forum-backend-persistence: ok"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer();
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  });
