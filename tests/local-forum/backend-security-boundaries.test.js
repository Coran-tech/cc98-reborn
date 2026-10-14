const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const port = 44310;
const origin = `http://127.0.0.1:${port}`;
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc98-reborn-security-boundaries-"));
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

async function json(pathname, options = {}, status = 200) {
  return (await request(pathname, options, status)).json();
}

async function login(username, password) {
  return json("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
}

function headers(token, jsonBody = false) {
  return {
    Authorization: `Bearer ${token}`,
    ...(jsonBody ? { "Content-Type": "application/json" } : {})
  };
}

async function createTopic(boardId, token, body) {
  return Number(await (await request(`/board/${boardId}/topic`, {
    method: "POST",
    headers: headers(token, true),
    body: JSON.stringify(body)
  })).text());
}

async function firstPost(topicId, token) {
  return (await json(`/topic/${topicId}/post?from=0&size=1`, { headers: headers(token) }))[0];
}

async function updateBoard(boardId, token, body) {
  await request(`/board/${boardId}`, {
    method: "PUT",
    headers: headers(token, true),
    body: JSON.stringify(body)
  });
}

async function setRoles(userId, token, roles) {
  await request(`/auth/users/${userId}/roles`, {
    method: "PUT",
    headers: headers(token, true),
    body: JSON.stringify({ roles })
  });
}

async function run() {
  await waitForServer();
  const admin = await login("LocalTester", "LocalTest!2026");
  const member = await login("SyntaxTester", "SyntaxTest!2026");
  const adminToken = admin.access_token;
  const memberToken = member.access_token;

  const moderatorRegistration = await json("/auth/register", {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ username: "BoundaryMod", password: "BoundaryPass!2026" })
  }, 201);
  const moderator = await login("BoundaryMod", "BoundaryPass!2026");
  const moderatorToken = moderator.access_token;

  const boardA = await json("/board", {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ name: "Boundary A" })
  }, 201);
  const boardB = await json("/board", {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ name: "Boundary B" })
  }, 201);
  await request(`/board/${boardA.id}/moderators`, {
    method: "PUT",
    headers: headers(adminToken, true),
    body: JSON.stringify({ userId: moderatorRegistration.user.id })
  });
  await setRoles(moderatorRegistration.user.id, adminToken, ["member", "boardModerator"]);
  const moderatorProfile = await json(`/user/${moderatorRegistration.user.id}`, { headers: headers(adminToken) });
  assert.equal(moderatorProfile.privilege, "正式用户");
  assert.equal(moderatorProfile.boardMasterTitles.some((title) => title.boardId === boardA.id && title.title === "版主"), true);

  const topicA = await createTopic(boardA.id, memberToken, { title: "topic a", content: "body a", tag1: 1 });
  const topicB = await createTopic(boardB.id, memberToken, { title: "topic b", content: "body b", tag1: 1 });

  await request(`/topic/multi-lock?id=${topicA}&id=${topicB}&boardid=${boardA.id}`, {
    method: "PUT",
    headers: headers(moderatorToken, true),
    body: JSON.stringify({ value: 7, reason: "cross-board-attempt" })
  }, 400);
  assert.equal((await json(`/topic/${topicA}`, { headers: headers(memberToken) })).state, 0);
  assert.equal((await json(`/topic/${topicB}`, { headers: headers(memberToken) })).state, 0);

  await request(`/topic/multi-delete?id=${topicA}&id=${topicB}`, {
    method: "PUT",
    headers: headers(moderatorToken, true),
    body: JSON.stringify({ reason: "cross-board-attempt" })
  }, 403);
  await request(`/topic/${topicA}`, { headers: headers(memberToken) });
  await request(`/topic/${topicB}`, { headers: headers(memberToken) });

  await request(`/topic/${topicA}/moveto/${boardB.id}`, {
    method: "PUT",
    headers: headers(moderatorToken, true),
    body: JSON.stringify({ reason: "unauthorized target" })
  }, 403);
  assert.equal((await json(`/topic/${topicA}`, { headers: headers(memberToken) })).boardId, boardA.id);

  await request(`/board/${boardB.id}/moderators`, {
    method: "PUT",
    headers: headers(adminToken, true),
    body: JSON.stringify({ userId: moderatorRegistration.user.id })
  });
  await request(`/topic/${topicA}/moveto/${boardB.id}`, {
    method: "PUT",
    headers: headers(moderatorToken, true),
    body: JSON.stringify({ reason: "authorized move" })
  });
  assert.equal((await json(`/topic/${topicA}`, { headers: headers(memberToken) })).boardId, boardB.id);
  assert.equal((await firstPost(topicA, memberToken)).boardId, boardB.id);

  await setRoles(moderatorRegistration.user.id, adminToken, ["member"]);
  const demotedProfile = await json(`/user/${moderatorRegistration.user.id}`, { headers: headers(adminToken) });
  assert.deepEqual(demotedProfile.boardMasterTitles, []);
  assert.equal(demotedProfile.roles.includes("boardModerator"), false);
  await request(`/topic/${topicA}/lock`, { method: "PUT", headers: headers(moderatorToken, true), body: "{}" }, 403);
  await request(`/board/${boardB.id}/moderators`, {
    method: "PUT",
    headers: headers(adminToken, true),
    body: JSON.stringify({ userId: moderatorRegistration.user.id })
  });

  const rootPost = await firstPost(topicA, memberToken);
  await request(`/post/${rootPost.id}/rating-v2`, {
    method: "PUT",
    headers: headers(memberToken, true),
    body: JSON.stringify({ reasonId: 1, type: 1 })
  }, 400);
  const beforeEdit = await json(`/post/${rootPost.id}/original`, { headers: headers(memberToken) });
  await request(`/post/${rootPost.id}`, {
    method: "PUT",
    headers: headers(memberToken, true),
    body: JSON.stringify({ content: "must not be committed", title: "x".repeat(81), tag1: 999999 })
  }, 400);
  const afterLongTitle = await json(`/post/${rootPost.id}/original`, { headers: headers(memberToken) });
  assert.equal(afterLongTitle.content, beforeEdit.content);
  assert.equal(afterLongTitle.title, beforeEdit.title);
  await request(`/post/${rootPost.id}`, {
    method: "PUT",
    headers: headers(memberToken, true),
    body: JSON.stringify({ content: "must still not be committed", title: "valid title", tag1: 999999 })
  }, 400);
  const afterBadTag = await json(`/post/${rootPost.id}/original`, { headers: headers(memberToken) });
  assert.equal(afterBadTag.content, beforeEdit.content);
  assert.equal(afterBadTag.title, beforeEdit.title);

  const voteTopic = await createTopic(boardB.id, memberToken, {
    title: "private vote",
    content: "vote body",
    isVote: true,
    voteInfo: { voteItems: ["one", "two"], expiredDays: 3, maxVoteCount: 1, needVote: false }
  });
  await request(`/topic/${voteTopic}/vote`, {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ items: [999] })
  }, 400);
  await request(`/topic/${voteTopic}/vote`, {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ items: [1, 2] })
  }, 400);
  await request(`/topic/${voteTopic}/vote`, {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ items: [1] })
  });
  const publicVote = await json(`/topic/${voteTopic}/vote`, { headers: headers(memberToken) });
  assert.deepEqual(publicVote.voteRecords, []);
  assert.equal(publicVote.voteUserCount, 1);
  assert.equal(publicVote.myRecord, null);
  const ownVote = await json(`/topic/${voteTopic}/vote`, { headers: headers(adminToken) });
  assert.deepEqual(ownVote.myRecord.items, [1]);
  assert.equal(Object.hasOwn(ownVote.myRecord, "userName"), false);
  assert.equal(Object.hasOwn(ownVote.myRecord, "ip"), false);
  const moderatorVote = await json(`/topic/${voteTopic}/vote`, { headers: headers(moderatorToken) });
  assert.equal(moderatorVote.voteRecords.length, 1);
  assert.equal(moderatorVote.voteRecords[0].userName, "LocalTester");

  const wealthBoard = await json("/board", {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ name: "Anonymous modes", anonymousState: 0 })
  }, 201);
  const ordinaryTopic = await createTopic(wealthBoard.id, memberToken, { title: "ordinary", content: "body" });
  await request(`/topic/${ordinaryTopic}/post`, {
    method: "POST",
    headers: headers(memberToken, true),
    body: JSON.stringify({ content: "forbidden anonymous", isAnonymous: true })
  }, 403);

  await updateBoard(wealthBoard.id, adminToken, { anonymousState: 1 });
  const requiredWealthBefore = (await json("/me", { headers: headers(memberToken) })).wealth;
  const requiredReply = Number(await (await request(`/topic/${ordinaryTopic}/post`, {
    method: "POST",
    headers: headers(memberToken, true),
    body: JSON.stringify({ content: "required anonymous", isAnonymous: false })
  })).text());
  assert.equal((await json(`/post/${requiredReply}/original`, { headers: headers(memberToken) })).isAnonymous, true);
  assert.equal((await json("/me", { headers: headers(memberToken) })).wealth, requiredWealthBefore);

  await updateBoard(wealthBoard.id, adminToken, { anonymousState: 2 });
  await request("/post/900001/operation", {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ operationType: 0, wealth: 30000, reason: "anonymous boundary funding" })
  });
  const optionalWealthBefore = (await json("/me", { headers: headers(adminToken) })).wealth;
  const optionalTopic = await createTopic(wealthBoard.id, adminToken, { title: "optional anonymous", content: "body", isAnonymous: true });
  assert.equal((await json("/me", { headers: headers(adminToken) })).wealth, optionalWealthBefore - 10000);
  const continuedWealthBefore = (await json("/me", { headers: headers(adminToken) })).wealth;
  const continuedReply = Number(await (await request(`/topic/${optionalTopic}/post`, {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ content: "anonymous owner continuation", isAnonymous: false })
  })).text());
  assert.equal((await json(`/post/${continuedReply}/original`, { headers: headers(adminToken) })).isAnonymous, true);
  assert.equal((await json("/me", { headers: headers(adminToken) })).wealth, continuedWealthBefore);

  const optionalReplyWealthBefore = (await json("/me", { headers: headers(adminToken) })).wealth;
  await request(`/topic/${ordinaryTopic}/post`, {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ content: "paid anonymous reply", isAnonymous: true })
  });
  assert.equal((await json("/me", { headers: headers(adminToken) })).wealth, optionalReplyWealthBefore - 2000);

  await updateBoard(wealthBoard.id, adminToken, { anonymousState: 3 });
  await request(`/topic/${ordinaryTopic}/post`, {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ content: "non-owner cannot choose anonymous", isAnonymous: true })
  }, 403);
  const ownerOnlyTopic = await createTopic(wealthBoard.id, adminToken, { title: "owner-only anonymous", content: "body", isAnonymous: true });
  const ownerOnlyWealthBefore = (await json("/me", { headers: headers(adminToken) })).wealth;
  const ownerOnlyReply = Number(await (await request(`/topic/${ownerOnlyTopic}/post`, {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ content: "owner continuation", isAnonymous: false })
  })).text());
  assert.equal((await json(`/post/${ownerOnlyReply}/original`, { headers: headers(adminToken) })).isAnonymous, true);
  assert.equal((await json("/me", { headers: headers(adminToken) })).wealth, ownerOnlyWealthBefore);

  const exportedState = await json("/__test/export", { headers: headers(adminToken) });
  const damaged = structuredClone(exportedState);
  const brokenPost = damaged.posts.find((post) => post.topicId === topicB && post.floor === 1);
  brokenPost.boardId = boardA.id;
  brokenPost.parentId = 999999999;
  damaged.voteRecords.push({ userId: 100002, topicId: topicB, items: [999], time: new Date().toISOString() });
  const restoreError = await json("/__test/restore", {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ data: damaged })
  }, 400);
  assert.equal(restoreError.error, "invalid_backup");
  assert.equal((await json("/__test/integrity", { headers: headers(adminToken) })).ok, true);

  const restored = await json("/__test/restore", {
    method: "POST",
    headers: headers(adminToken, true),
    body: JSON.stringify({ data: exportedState })
  });
  assert.equal(restored.integrity.ok, true);

  console.log("local-forum-backend-security-boundaries: ok");
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
