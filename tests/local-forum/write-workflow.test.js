const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const port = 44316;
const origin = `http://127.0.0.1:${port}`;
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc98-reborn-write-workflow-"));
const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
  cwd: path.resolve(__dirname, "..", ".."),
  env: {
    ...process.env,
    CC98_LOCAL_PORT: String(port),
    CC98_LOCAL_DATA_PATH: path.join(runtimeRoot, "forum-data.json"),
    CC98_LOCAL_UPLOAD_ROOT: path.join(runtimeRoot, "uploads"),
    CC98_LOCAL_BACKUP_ROOT: path.join(runtimeRoot, "backups"),
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

async function request(pathname, options = {}, expectedStatus = 200) {
  const response = await fetch(`${origin}${pathname}`, options);
  assert.equal(
    response.status,
    expectedStatus,
    `${options.method || "GET"} ${pathname}: expected ${expectedStatus}, got ${response.status}`
  );
  return response;
}

async function json(pathname, options = {}, expectedStatus = 200) {
  return (await request(pathname, options, expectedStatus)).json();
}

async function text(pathname, options = {}, expectedStatus = 200) {
  return (await request(pathname, options, expectedStatus)).text();
}

async function login(username, password) {
  return json("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
}

function auth(token, jsonBody = false) {
  return {
    Authorization: `Bearer ${token}`,
    ...(jsonBody ? { "Content-Type": "application/json" } : {})
  };
}

async function writeJson(pathname, method, token, body, expectedStatus = 200) {
  return request(pathname, {
    method,
    headers: auth(token, true),
    body: JSON.stringify(body)
  }, expectedStatus);
}

async function stopServer() {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
}

async function run() {
  await waitForServer();

  const initialHealth = await json("/__test/health");
  assert.equal(initialHealth.host, "127.0.0.1");
  assert.equal(initialHealth.backend.unknownRequests, 0);

  const admin = await login("LocalTester", "LocalTest!2026");
  const member = await login("SyntaxTester", "SyntaxTest!2026");
  const adminToken = admin.access_token;
  const memberToken = member.access_token;

  const board = await json("/board", {
    method: "POST",
    headers: auth(adminToken, true),
    body: JSON.stringify({ name: "写操作回归版", description: "完整写操作工作流" })
  }, 201);
  assert.equal(board.name, "写操作回归版");

  const topicId = Number(await text(`/board/${board.id}/topic`, {
    method: "POST",
    headers: auth(memberToken, true),
    body: JSON.stringify({
      title: "写操作工作流主题",
      content: "[b]第一版正文[/b]",
      contentType: 0,
      tag1: 1,
      notifyPoster: true
    })
  }));
  assert.ok(Number.isSafeInteger(topicId));

  let topic = await json(`/topic/${topicId}`, { headers: auth(memberToken) });
  assert.equal(topic.title, "写操作工作流主题");
  assert.equal(topic.tag1, 1);
  assert.equal(topic.replyCount, 0);

  let posts = await json(`/topic/${topicId}/post?from=0&size=20`, { headers: auth(memberToken) });
  assert.equal(posts.length, 1);
  const firstPostId = posts[0].id;
  assert.equal(posts[0].isMe, true);

  await writeJson(`/post/${firstPostId}`, "PUT", memberToken, {
    title: "写操作工作流主题（已编辑）",
    content: "[color=#ff0000]编辑后的正文[/color]",
    contentType: 0,
    tag1: 2
  });
  topic = await json(`/topic/${topicId}`, { headers: auth(memberToken) });
  const editedFirstPost = await json(`/post/${firstPostId}/original`, { headers: auth(memberToken) });
  assert.equal(topic.title, "写操作工作流主题（已编辑）");
  assert.equal(topic.tag1, 2);
  assert.equal(editedFirstPost.content, "[color=#ff0000]编辑后的正文[/color]");
  assert.equal(editedFirstPost.lastUpdateAuthor, "SyntaxTester");
  assert.equal(Number.isNaN(Date.parse(editedFirstPost.lastUpdateTime)), false);

  const replyId = Number(await text(`/topic/${topicId}/post`, {
    method: "POST",
    headers: auth(adminToken, true),
    body: JSON.stringify({
      content: "管理员真实回复 @SyntaxTester",
      contentType: 0,
      parentId: firstPostId,
      notifyAllReplier: true
    })
  }));
  assert.ok(Number.isSafeInteger(replyId));
  await writeJson(`/post/${replyId}`, "PUT", memberToken, { content: "越权编辑" }, 403);
  await writeJson(`/post/${replyId}`, "PUT", adminToken, { content: "管理员已编辑回复", contentType: 0 });
  assert.equal((await json(`/post/${replyId}/original`, { headers: auth(adminToken) })).content, "管理员已编辑回复");

  const memberReplyNotifications = await json("/notification/reply?from=0&size=20", { headers: auth(memberToken) });
  assert.equal(memberReplyNotifications.some((item) => item.postId === replyId), true);
  await writeJson(`/notification/at?topicid=${topicId}&postid=${replyId}`, "POST", adminToken, ["SyntaxTester"]);
  const memberAtNotifications = await json("/notification/at?from=0&size=20", { headers: auth(memberToken) });
  assert.equal(memberAtNotifications.some((item) => item.postId === replyId), true);
  const adminUnreadBefore = await json("/me/unread-count", { headers: auth(adminToken) });
  assert.equal(adminUnreadBefore.systemCount, 1);
  await request("/notification/read-all-reply", { method: "PUT", headers: auth(memberToken) });
  await request("/notification/read-all-at", { method: "PUT", headers: auth(memberToken) });
  await request("/notification/read-all-system", { method: "PUT", headers: auth(adminToken) });
  const memberUnread = await json("/me/unread-count", { headers: auth(memberToken) });
  const adminUnread = await json("/me/unread-count", { headers: auth(adminToken) });
  assert.equal(memberUnread.replyCount, 0);
  assert.equal(memberUnread.atCount, 0);
  assert.equal(adminUnread.systemCount, 0);

  assert.equal(await json(`/me/custom-board/${board.id}`, { headers: auth(memberToken) }), false);
  await request(`/me/custom-board/${board.id}`, { method: "PUT", headers: auth(memberToken) });
  assert.equal(await json(`/me/custom-board/${board.id}`, { headers: auth(memberToken) }), true);
  assert.equal((await json("/me/custom-board", { headers: auth(memberToken) })).some((item) => item.id === board.id), true);
  assert.equal((await json("/me", { headers: auth(memberToken) })).customBoards.includes(board.id), true);
  await request(`/me/custom-board/${board.id}`, { method: "DELETE", headers: auth(memberToken) });
  assert.equal(await json(`/me/custom-board/${board.id}`, { headers: auth(memberToken) }), false);
  assert.equal((await json("/me", { headers: auth(memberToken) })).customBoards.includes(board.id), false);

  const reactionBefore = await json(`/post/${firstPostId}/like`, { headers: auth(adminToken) });
  await writeJson(`/post/${firstPostId}/like`, "PUT", adminToken, { state: 1 });
  let reaction = await json(`/post/${firstPostId}/like`, { headers: auth(adminToken) });
  assert.equal(reaction.likeState, 1);
  assert.equal(reaction.likeCount, reactionBefore.likeCount + 1);
  await writeJson(`/post/${firstPostId}/like`, "PUT", adminToken, { state: 1 });
  reaction = await json(`/post/${firstPostId}/like`, { headers: auth(adminToken) });
  assert.equal(reaction.likeState, 0);
  assert.equal(reaction.likeCount, reactionBefore.likeCount);
  await writeJson(`/post/${firstPostId}/like`, "PUT", adminToken, { state: 2 });
  reaction = await json(`/post/${firstPostId}/like`, { headers: auth(adminToken) });
  assert.equal(reaction.likeState, 2);
  assert.equal(reaction.dislikeCount, reactionBefore.dislikeCount + 1);

  const popularityBefore = (await json("/user/100002", { headers: auth(adminToken) })).popularity;
  await writeJson(`/post/${firstPostId}/rating`, "PUT", adminToken, { value: 1, reason: "工作流评分" });
  await writeJson(`/post/${firstPostId}/rating`, "PUT", adminToken, { value: 1, reason: "重复评分" }, 403);
  const popularityAfter = (await json("/user/100002", { headers: auth(adminToken) })).popularity;
  assert.equal(popularityAfter, popularityBefore + 1);
  const awards = await json(`/post/${firstPostId}/awards`, { headers: auth(memberToken) });
  assert.equal(awards.some((award) => (
    award.operatorName === "LocalTester"
    && award.content === "风评值 +1"
    && award.reason === "工作流评分"
    && award.value === 1
  )), true);

  await request(`/me/followee/795406`, { method: "PUT", headers: auth(memberToken) });
  assert.equal(await json("/me/followee/795406", { headers: auth(memberToken) }), true);
  assert.equal(await json("/me/followee/795406", { headers: auth(adminToken) }), false);
  await request(`/me/followee/795406`, { method: "DELETE", headers: auth(memberToken) });
  assert.equal(await json("/me/followee/795406", { headers: auth(memberToken) }), false);

  const adminWealthBefore = (await json("/me", { headers: auth(adminToken) })).wealth;
  const memberWealthBefore = (await json("/me", { headers: auth(memberToken) })).wealth;
  const transferNames = await json("/me/transfer-wealth", {
    method: "PUT",
    headers: auth(adminToken, true),
    body: JSON.stringify({ userNames: ["SyntaxTester"], wealth: 20, reason: "工作流转账" })
  });
  assert.deepEqual(transferNames, ["SyntaxTester"]);
  assert.equal((await json("/me", { headers: auth(adminToken) })).wealth, adminWealthBefore - 20);
  assert.equal((await json("/me", { headers: auth(memberToken) })).wealth, memberWealthBefore + 10);
  await writeJson("/me/transfer-wealth", "PUT", adminToken, { userNames: ["SyntaxTester"], wealth: 9, reason: "金额过小" }, 400);
  await writeJson("/me/transfer-wealth", "PUT", adminToken, { userNames: ["MissingUser"], wealth: 20, reason: "无效用户" }, 400);
  await writeJson("/me/transfer-wealth", "PUT", adminToken, { userNames: ["LocalTester"], wealth: 20, reason: "不能给自己" }, 400);
  await writeJson("/me/transfer-wealth", "PUT", adminToken, { userNames: ["SyntaxTester"], wealth: 1000000, reason: "余额不足" }, 400);

  await writeJson("/me/favorite-topic-group", "POST", memberToken, { name: "工作流组" });
  let groupsResponse = await json("/me/favorite-topic-group", { headers: auth(memberToken) });
  assert.equal(groupsResponse.errorCode, 0);
  let groups = groupsResponse.data;
  const group = groups.find((item) => item.name === "工作流组");
  assert.ok(group);
  await request(`/me/favorite/${topicId}?groupid=${group.id}`, { method: "PUT", headers: auth(memberToken) });
  assert.equal(await json(`/topic/${topicId}/isfavorite`, { headers: auth(memberToken) }), true);
  let favorites = await json(`/topic/me/favorite?from=0&size=20&groupid=${group.id}`, { headers: auth(memberToken) });
  assert.equal(favorites.some((item) => item.id === topicId), true);
  await request(`/me/favorite-topic-group?groupid=${group.id}`, { method: "DELETE", headers: auth(memberToken) });
  groupsResponse = await json("/me/favorite-topic-group", { headers: auth(memberToken) });
  assert.equal(groupsResponse.errorCode, 0);
  groups = groupsResponse.data;
  assert.equal(groups.some((item) => item.id === group.id), false);
  favorites = await json("/topic/me/favorite?from=0&size=20&groupid=0", { headers: auth(memberToken) });
  assert.equal(favorites.some((item) => item.id === topicId), true);
  await request(`/me/favorite/${topicId}`, { method: "DELETE", headers: auth(memberToken) });
  assert.equal(await json(`/topic/${topicId}/isfavorite`, { headers: auth(memberToken) }), false);

  const messageId = Number(await text("/message", {
    method: "POST",
    headers: auth(memberToken, true),
    body: JSON.stringify({ receiverId: 795406, content: "工作流私信 [b]UBB[/b]" })
  }));
  assert.ok(Number.isSafeInteger(messageId));
  let memberMessages = await json("/message/user/795406?from=0&size=20", { headers: auth(memberToken) });
  let adminMessages = await json("/message/user/100002?from=0&size=20", { headers: auth(adminToken) });
  assert.equal(memberMessages.some((item) => item.id === messageId), true);
  assert.equal(adminMessages.some((item) => item.id === messageId && item.content.includes("[b]UBB[/b]")), true);
  await request(`/message/${messageId}`, { method: "DELETE", headers: auth(memberToken) });
  memberMessages = await json("/message/user/795406?from=0&size=20", { headers: auth(memberToken) });
  adminMessages = await json("/message/user/100002?from=0&size=20", { headers: auth(adminToken) });
  assert.equal(memberMessages.some((item) => item.id === messageId), false);
  assert.equal(adminMessages.some((item) => item.id === messageId), true);
  await request(`/message/${messageId}`, { method: "DELETE", headers: auth(adminToken) });
  adminMessages = await json("/message/user/100002?from=0&size=20", { headers: auth(adminToken) });
  assert.equal(adminMessages.some((item) => item.id === messageId), false);

  const voteTopicId = Number(await text(`/board/${board.id}/topic`, {
    method: "POST",
    headers: auth(memberToken, true),
    body: JSON.stringify({
      title: "工作流投票",
      content: "请选择一项",
      contentType: 0,
      tag1: 1,
      isVote: true,
      voteInfo: {
        voteItems: ["选项 A", "选项 B"],
        expiredDays: 7,
        maxVoteCount: 1,
        needVote: true
      }
    })
  }));
  await writeJson(`/topic/${voteTopicId}/vote`, "POST", adminToken, { items: [1] });
  await writeJson(`/topic/${voteTopicId}/vote`, "POST", adminToken, { items: [2] }, 403);
  const adminVote = await json(`/topic/${voteTopicId}/vote`, { headers: auth(adminToken) });
  const memberVote = await json(`/topic/${voteTopicId}/vote`, { headers: auth(memberToken) });
  assert.equal(adminVote.voteItems[0].count, 1);
  assert.equal(adminVote.canVote, false);
  assert.equal(adminVote.voteRecords.length, 1);
  assert.equal(memberVote.voteRecords.length, 0);

  await request(`/topic/${topicId}/lock`, { method: "PUT", headers: auth(adminToken) });
  await writeJson(`/topic/${topicId}/post`, "POST", memberToken, { content: "锁定后不应写入" }, 403);
  await request(`/topic/${topicId}/lock`, { method: "DELETE", headers: auth(adminToken) });
  await request(`/topic/${topicId}/best`, { method: "PUT", headers: auth(adminToken) });
  await writeJson(`/topic/${topicId}/top`, "PUT", adminToken, { topState: 2 });
  await writeJson(`/topic/${topicId}/highlight`, "PUT", adminToken, { color: "#ff0000", bold: true });
  await request(`/topic/${topicId}/not-hot`, { method: "PUT", headers: auth(adminToken) });
  topic = await json(`/topic/${topicId}`, { headers: auth(memberToken) });
  assert.equal(topic.state, 0);
  assert.equal(topic.bestState, 1);
  assert.equal(topic.topState, 2);
  assert.equal(topic.notHot, true);
  assert.deepEqual(topic.highlight, { color: "#ff0000", bold: true });

  const destination = await json("/board", {
    method: "POST",
    headers: auth(adminToken, true),
    body: JSON.stringify({ name: "写操作迁移目标" })
  }, 201);
  await writeJson(`/topic/${topicId}/moveto/${destination.id}`, "PUT", adminToken, { reason: "工作流移动" });
  topic = await json(`/topic/${topicId}`, { headers: auth(memberToken) });
  assert.equal(topic.boardId, destination.id);
  assert.equal((await json(`/post/${firstPostId}/original`, { headers: auth(memberToken) })).boardId, destination.id);

  await writeJson("/config/global/announcement", "PUT", adminToken, { announcement: "[b]工作流公告[/b]" });
  assert.equal((await json("/config/index", { headers: auth(memberToken) })).announcement, "[b]工作流公告[/b]");
  const column = await json("/index/column/", {
    method: "POST",
    headers: auth(adminToken, true),
    body: JSON.stringify({ type: 1, title: "工作流栏目", content: "栏目内容", url: `/topic/${topicId}` })
  });
  assert.ok(Number.isSafeInteger(column.id));
  assert.equal((await json("/index/column/recommandationreading/all", { headers: auth(memberToken) }))
    .some((item) => item.id === column.id), true);
  await request(`/index/column/${column.id}`, { method: "DELETE", headers: auth(adminToken) });
  assert.equal((await json("/index/column/recommandationreading/all", { headers: auth(memberToken) }))
    .some((item) => item.id === column.id), false);

  const auditBoardEvents = await json(`/board/${destination.id}/events?from=0&size=50`, { headers: auth(adminToken) });
  assert.equal(auditBoardEvents.boardEvents.some((item) => item.topicId === topicId && item.operation === "moveto"), true);

  await request(`/post/${replyId}`, { method: "DELETE", headers: auth(adminToken) });
  posts = await json(`/topic/${topicId}/post?from=0&size=20`, { headers: auth(memberToken) });
  assert.equal(posts.some((post) => post.id === replyId), false);
  await request(`/post/${replyId}/original`, { headers: auth(memberToken) }, 404);

  await request(`/topic/${topicId}`, { method: "DELETE", headers: auth(memberToken) });
  await request(`/topic/${topicId}`, { headers: auth(memberToken) }, 404);
  assert.equal((await json(`/topic/search?keyword=${encodeURIComponent("写操作工作流主题")}&from=0&size=20`, { headers: auth(memberToken) }))
    .some((item) => item.id === topicId), false);

  const integrity = await json("/__test/integrity", { headers: auth(adminToken) });
  assert.equal(integrity.ok, true, JSON.stringify(integrity.issues));
  assert.deepEqual(await json("/__test/unknown", { headers: auth(adminToken) }), []);
  const finalHealth = await json("/__test/health");
  assert.equal(finalHealth.backend.unknownRequests, 0);

  console.log("local-forum-write-workflow: ok");
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
