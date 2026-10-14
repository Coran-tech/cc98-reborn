const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const port = 44344;
const origin = `http://127.0.0.1:${port}`;
const serverPath = path.join(__dirname, "server.js");
const projectRoot = path.resolve(__dirname, "..", "..");
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc98-local-admin-lifecycle-"));
const dataPath = path.join(runtimeRoot, "forum-data.json");
const uploadRoot = path.join(runtimeRoot, "uploads");
const avatarPath = path.join(projectRoot, "images", "avatar", "avatar.jpg");
let child = null;
let output = "";

function startServer(reset = false) {
  output = "";
  const env = {
    ...process.env,
    CC98_LOCAL_PORT: String(port),
    CC98_LOCAL_DATA_PATH: dataPath,
    CC98_LOCAL_UPLOAD_ROOT: uploadRoot,
    CC98_LOCAL_BACKUP_ROOT: path.join(runtimeRoot, "backups"),
    CC98_LOCAL_REQUIRE_AUTH: "1",
    CC98_LOCAL_STRICT_API: "1"
  };
  if (reset) env.CC98_LOCAL_RESET = "1";
  else delete env.CC98_LOCAL_RESET;
  child = spawn(process.execPath, [serverPath], {
    cwd: projectRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => { output += chunk.toString(); });
  child.stderr.on("data", (chunk) => { output += chunk.toString(); });
}

async function stopServer() {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
  child = null;
}

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
  const response = await fetch(`${origin}${pathname}`, options);
  assert.equal(response.status, expectedStatus, `${options.method || "GET"} ${pathname}`);
  return response;
}

async function json(pathname, options = {}, expectedStatus = 200) {
  return (await request(pathname, options, expectedStatus)).json();
}

async function text(pathname, options = {}, expectedStatus = 200) {
  return (await request(pathname, options, expectedStatus)).text();
}

function auth(token, jsonBody = false) {
  return {
    Authorization: `Bearer ${token}`,
    ...(jsonBody ? { "Content-Type": "application/json" } : {})
  };
}

function jsonRequest(method, token, body) {
  return {
    method,
    headers: auth(token, true),
    body: JSON.stringify(body)
  };
}

async function login(username, password) {
  return json("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
}

async function run() {
  assert.equal(fs.existsSync(avatarPath), true, "real avatar fixture is required");
  const avatarBytes = fs.readFileSync(avatarPath);

  startServer(true);
  await waitForServer();

  const admin = await login("LocalTester", "LocalTest!2026");
  const member = await login("SyntaxTester", "SyntaxTest!2026");
  const adminToken = admin.access_token;
  const memberToken = member.access_token;

  const created = await json("/auth/register", jsonRequest("POST", adminToken, {
    username: "LifecycleUser",
    password: "LifecyclePass!2026",
    displayTitle: "待配置用户",
    adminCreate: true
  }), 201);
  const userId = created.user.id;
  assert.equal(created.createdByAdmin, true);
  assert.equal((await json("/auth/session", { headers: auth(adminToken) })).user.name, "LocalTester");

  let lifecycle = await login("LifecycleUser", "LifecyclePass!2026");
  const originalLifecycleToken = lifecycle.access_token;
  await json(`/auth/users/${userId}/profile`, jsonRequest("PUT", adminToken, {
    displayTitle: "生命周期测试员",
    introduction: "站务生命周期测试账号"
  }));
  await json(`/auth/users/${userId}/roles`, jsonRequest("PUT", adminToken, {
    roles: ["member", "boardModerator"]
  }));
  let profile = await json(`/user/${userId}`, { headers: auth(adminToken) });
  assert.equal(profile.displayTitle, "生命周期测试员");
  assert.equal(profile.roles.includes("boardModerator"), true);

  await json(`/auth/users/${userId}/status`, jsonRequest("PUT", adminToken, { status: "suspended" }));
  await json("/me", { headers: auth(originalLifecycleToken) }, 401);
  await json(`/auth/users/${userId}/status`, jsonRequest("PUT", adminToken, { status: "active" }));
  await json(`/auth/users/${userId}/password`, jsonRequest("PUT", adminToken, {
    password: "LifecycleReset!2026"
  }));
  await json("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "LifecycleUser", password: "LifecyclePass!2026" })
  }, 401);
  lifecycle = await login("LifecycleUser", "LifecycleReset!2026");
  const lifecycleToken = lifecycle.access_token;

  const board = await json("/board", jsonRequest("POST", adminToken, {
    name: "生命周期版面",
    description: "删除与恢复状态测试",
    canEntry: true,
    isLocked: false
  }), 201);
  assert.equal(Object.hasOwn(board, "deletedState"), false);

  await json(`/board/${board.id}`, jsonRequest("PUT", memberToken, { name: "越权修改" }), 403);
  await text(`/board/${board.id}`, { method: "DELETE", headers: auth(memberToken) }, 403);
  await request(`/board/${board.id}/moderators`, jsonRequest("PUT", adminToken, { userId }));
  await text(`/board/${board.id}/big-paper`, jsonRequest("PUT", lifecycleToken, {
    content: "版主可维护的版面说明"
  }));
  assert.equal((await json(`/board/${board.id}`, { headers: auth(memberToken) })).bigPaper, "版主可维护的版面说明");
  await json(`/board/${board.id}`, jsonRequest("PUT", lifecycleToken, { name: "版主不应改整版配置" }), 403);
  await text(`/board/${board.id}`, { method: "DELETE", headers: auth(lifecycleToken) }, 403);

  const topicId = Number(await text(`/board/${board.id}/topic`, jsonRequest("POST", memberToken, {
    title: "生命周期主题",
    content: "首楼内容",
    contentType: 0
  })));
  const rootPost = (await json(`/topic/${topicId}/post?from=0&size=10`, { headers: auth(memberToken) }))[0];
  const deletedReplyId = Number(await text(`/topic/${topicId}/post`, jsonRequest("POST", lifecycleToken, {
    content: "应保持删除的独立回复",
    contentType: 0
  })));
  const retainedReplyId = Number(await text(`/topic/${topicId}/post`, jsonRequest("POST", memberToken, {
    content: "应随主题恢复的回复",
    contentType: 0
  })));
  await text(`/post/${deletedReplyId}`, { method: "DELETE", headers: auth(lifecycleToken) });
  await json(`/post/${deletedReplyId}/original`, { headers: auth(adminToken) }, 404);

  await text(`/topic/${topicId}/lock`, { method: "PUT", headers: auth(lifecycleToken) });
  await text(`/topic/${topicId}/best`, { method: "PUT", headers: auth(lifecycleToken) });
  await text(`/topic/${topicId}/top`, jsonRequest("PUT", lifecycleToken, { topState: 2 }));
  let topic = await json(`/topic/${topicId}`, { headers: auth(memberToken) });
  assert.equal(topic.state, 1);
  assert.equal(topic.bestState, 1);
  assert.equal(topic.topState, 2);
  await text(`/topic/${topicId}/lock`, { method: "DELETE", headers: auth(lifecycleToken) });

  await text(`/topic/${topicId}`, { method: "DELETE", headers: auth(memberToken) });
  await json(`/topic/${topicId}`, { headers: auth(memberToken) }, 404);
  await json(`/__local/topics/${topicId}/restore`, { method: "PUT", headers: auth(memberToken) }, 403);
  await json(`/__local/topics/${topicId}/restore`, { method: "PUT", headers: auth(adminToken) });

  topic = await json(`/topic/${topicId}`, { headers: auth(memberToken) });
  assert.equal(topic.id, topicId);
  const restoredPosts = await json(`/topic/${topicId}/post?from=0&size=20`, { headers: auth(memberToken) });
  assert.deepEqual(restoredPosts.map((post) => post.id), [rootPost.id, retainedReplyId]);
  assert.equal(restoredPosts.every((post) => !Object.hasOwn(post, "deletedByTopic")), true);
  await json(`/post/${deletedReplyId}/original`, { headers: auth(memberToken) }, 404);

  await text(`/board/${board.id}`, { method: "DELETE", headers: auth(adminToken) });
  await json(`/board/${board.id}`, { headers: auth(adminToken) }, 404);
  const deletedBoard = (await json("/__local/boards", { headers: auth(adminToken) }))
    .find((item) => item.id === board.id);
  assert.ok(deletedBoard);
  assert.equal(deletedBoard.deleted, true);
  assert.equal(deletedBoard.canEntry, false);
  assert.equal(deletedBoard.isLocked, true);
  assert.equal(Object.hasOwn(deletedBoard, "deletedState"), false);
  await json(`/__local/boards/${board.id}/restore`, { method: "PUT", headers: auth(memberToken) }, 403);
  const restoredBoard = await json(`/__local/boards/${board.id}/restore`, {
    method: "PUT",
    headers: auth(adminToken)
  });
  assert.equal(restoredBoard.deleted, false);
  assert.equal(restoredBoard.canEntry, true);
  assert.equal(restoredBoard.isLocked, false);
  assert.equal(Object.hasOwn(restoredBoard, "deletedState"), false);
  assert.equal((await json(`/topic/${topicId}`, { headers: auth(memberToken) })).id, topicId);
  const postAfterBoardRestore = Number(await text(`/topic/${topicId}/post`, jsonRequest("POST", memberToken, {
    content: "版面恢复后可以继续回复"
  })));
  assert.ok(Number.isSafeInteger(postAfterBoardRestore));

  await request(`/board/${board.id}/moderators`, jsonRequest("DELETE", adminToken, { userId }));
  await text(`/board/${board.id}/big-paper`, jsonRequest("PUT", lifecycleToken, {
    content: "移除版主后不应成功"
  }), 403);
  profile = await json(`/user/${userId}`, { headers: auth(adminToken) });
  assert.equal(profile.roles.includes("boardModerator"), false);
  assert.equal(profile.boardMasterTitles.length, 0);

  const avatarForm = new FormData();
  avatarForm.append("files", new Blob([avatarBytes], { type: "image/jpeg" }), "avatar.jpg");
  const avatarUrls = await json("/file/portrait", {
    method: "POST",
    headers: auth(lifecycleToken),
    body: avatarForm
  });
  assert.equal(avatarUrls.length, 1);
  assert.match(avatarUrls[0], /^\/__uploads\/\d+-\d+\.jpg$/);
  const uploadedBytes = Buffer.from(await (await request(avatarUrls[0])).arrayBuffer());
  assert.deepEqual(uploadedBytes, avatarBytes);
  const avatarMe = await json("/me", { headers: auth(lifecycleToken) });
  assert.equal(avatarMe.portraitUrl, avatarUrls[0]);
  assert.equal(avatarMe.photourl, avatarUrls[0]);

  const rawState = await json("/__test/export", { headers: auth(adminToken) });
  const rawDeletedReply = rawState.posts.find((post) => post.id === deletedReplyId);
  const rawRetainedReply = rawState.posts.find((post) => post.id === retainedReplyId);
  assert.equal(rawDeletedReply.isDeleted, true);
  assert.equal(rawDeletedReply.deletedByTopic, false);
  assert.equal(rawRetainedReply.isDeleted, false);
  assert.equal(rawRetainedReply.deletedByTopic, false);
  assert.equal((await json("/__test/integrity", { headers: auth(adminToken) })).ok, true);

  await stopServer();
  startServer(false);
  await waitForServer();
  const restartedLifecycle = await login("LifecycleUser", "LifecycleReset!2026");
  const restartedMe = await json("/me", { headers: auth(restartedLifecycle.access_token) });
  assert.equal(restartedMe.portraitUrl, avatarUrls[0]);
  assert.deepEqual(Buffer.from(await (await request(avatarUrls[0])).arrayBuffer()), avatarBytes);
  const restartedPosts = await json(`/topic/${topicId}/post?from=0&size=20`, {
    headers: auth(restartedLifecycle.access_token)
  });
  assert.equal(restartedPosts.some((post) => post.id === deletedReplyId), false);
  assert.equal(restartedPosts.some((post) => post.id === retainedReplyId), true);

  const restartedAdmin = await login("LocalTester", "LocalTest!2026");
  assert.equal((await json("/__test/integrity", { headers: auth(restartedAdmin.access_token) })).ok, true);
  assert.deepEqual(await json("/__test/unknown", { headers: auth(restartedAdmin.access_token) }), []);

  console.log("local-forum-admin-lifecycle: ok");
}

run()
  .catch((error) => {
    console.error(error);
    if (output) console.error(output);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer();
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  });
