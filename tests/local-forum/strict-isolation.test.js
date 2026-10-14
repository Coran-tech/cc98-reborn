const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const port = 44308;
const origin = `http://127.0.0.1:${port}`;
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc98-reborn-strict-isolation-"));
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

function auth(token) {
  return { Authorization: `Bearer ${token}` };
}

async function registerAdmin(headers, username, password) {
  return json("/auth/register", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  }, 201);
}

async function run() {
  await waitForServer();
  await request("/__test/requests", {}, 401);
  await request("/__test/health", {}, 200);

  const admin = await login("LocalTester", "LocalTest!2026");
  const member = await login("SyntaxTester", "SyntaxTest!2026");
  const adminHeaders = auth(admin.access_token);
  const memberHeaders = auth(member.access_token);

  const created = await registerAdmin(adminHeaders, "ThirdMember", "ThirdPass!2026");
  assert.equal(created.createdByAdmin, true);
  assert.equal(created.user.name, "ThirdMember");
  assert.equal((await json("/auth/session", { headers: adminHeaders })).user.name, "LocalTester");
  const third = await login("ThirdMember", "ThirdPass!2026");
  const thirdHeaders = auth(third.access_token);

  const board = await json("/board", {
    method: "POST",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Strict board", description: "private permission checks" })
  }, 201);
  assert.equal(board.canVote, true);
  assert.equal(board.isLock, false);
  await request(`/board/${board.id}/moderators`, {
    method: "PUT",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ userId: created.user.id })
  });

  await request(`/board/${board.id}/topic`, {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "member topic", content: "member content" })
  });
  const boardTopics = await json(`/board/${board.id}/topic?from=0&size=10`, { headers: thirdHeaders });
  const memberTopic = boardTopics.find((topic) => topic.userName === "SyntaxTester");
  assert.ok(memberTopic);

  // The legacy Markdown reply client still posts to /post/topic/:id. It must
  // behave identically to the modern /topic/:id/post endpoint.
  const legacyReplyId = Number(await (await request(`/post/topic/${memberTopic.id}`, {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "legacy-markdown-reply", contentType: 1 })
  })).text());
  assert.ok(Number.isInteger(legacyReplyId));
  const legacyReply = await json(`/post/${legacyReplyId}/original`, { headers: memberHeaders });
  assert.equal(legacyReply.content, "legacy-markdown-reply");
  assert.equal(legacyReply.contentType, 1);
  await request(`/post/topic/${memberTopic.id}`, { method: "GET", headers: memberHeaders }, 405);
  await request(`/post/topic/${memberTopic.id}`, { method: "PUT", headers: memberHeaders }, 405);
  await request("/post/topic/9999999", {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "missing topic" })
  }, 404);

  // user trace must honor its explicit userid parameter. The specific and
  // anonymous endpoints are reference based, and may never cross topics.
  const memberTrace = await json(`/post/topic/user?topicid=${memberTopic.id}&userid=100002&from=0&size=20`, { headers: memberHeaders });
  assert.equal(memberTrace.some((post) => post.id === legacyReplyId), true);
  assert.equal(memberTrace.every((post) => post.userId === 100002 && !post.isAnonymous), true);
  const seededOtherTopicPost = 900002;
  await request(`/post/topic/specific-user?topicid=${memberTopic.id}&postid=${seededOtherTopicPost}&from=0&size=10`, { headers: memberHeaders }, 404);
  await request(`/post/topic/anonymous/user?topicid=${memberTopic.id}&postid=${legacyReplyId}&from=0&size=10`, { headers: memberHeaders }, 400);

  // Anonymous mode is a board rule, not a client-side button hint. Once the
  // board requires it, an ordinary request must be projected as anonymous.
  await request(`/board/${board.id}`, {
    method: "PUT",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ anonymousState: 1 })
  });
  const anonymousReplyId = Number(await (await request(`/topic/${memberTopic.id}/post`, {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "anonymous trace body", isAnonymous: false })
  })).text());
  const anonymousPost = (await json(`/topic/${memberTopic.id}/post?from=0&size=20`, { headers: memberHeaders }))
    .find((post) => post.id === anonymousReplyId);
  assert.ok(anonymousPost);
  assert.equal(Object.hasOwn(anonymousPost, "userId"), false);
  assert.equal(Object.hasOwn(anonymousPost, "anonymousCode"), false);
  assert.equal(Object.hasOwn(anonymousPost, "ip"), false);
  assert.equal(anonymousPost.userName.startsWith("A"), true);
  const anonymousTrace = await json(`/post/topic/anonymous/user?topicid=${memberTopic.id}&postid=${anonymousReplyId}&from=0&size=10`, { headers: memberHeaders });
  assert.equal(anonymousTrace.some((post) => post.id === anonymousReplyId), true);
  assert.equal(anonymousTrace.every((post) => post.isAnonymous), true);
  assert.equal(anonymousTrace.every((post) => !Object.hasOwn(post, "userId") && !Object.hasOwn(post, "anonymousCode")), true);
  const normalTrace = await json(`/post/topic/specific-user?topicid=${memberTopic.id}&postid=${anonymousReplyId}&from=0&size=10`, { headers: memberHeaders });
  assert.equal(normalTrace.some((post) => post.id === anonymousReplyId), true);
  assert.equal(normalTrace.every((post) => post.isAnonymous), true);

  await request(`/topic/${memberTopic.id}/lock`, { method: "PUT", headers: memberHeaders }, 403);
  await request(`/topic/${memberTopic.id}/lock`, { method: "PUT", headers: thirdHeaders });
  await request(`/topic/${memberTopic.id}/lock`, { method: "DELETE", headers: thirdHeaders });
  await request("/topic/6500000/lock", { method: "PUT", headers: thirdHeaders }, 403);
  await request(`/board/${board.id}/events?from=0&size=20`, { headers: memberHeaders }, 403);
  const moderatorBoardEvents = await json(`/board/${board.id}/events?from=0&size=20`, { headers: thirdHeaders });
  assert.equal(Array.isArray(moderatorBoardEvents.boardEvents), true);
  await request(`/board/${board.id}/stop-post-user?from=0&size=20`, { headers: memberHeaders }, 403);
  assert.deepEqual(await json(`/board/${board.id}/stop-post-user?from=0&size=20`, { headers: thirdHeaders }), []);
  await request(`/topic/${memberTopic.id}/event?from=0&size=20`, { headers: memberHeaders }, 403);
  const moderatorTopicEvents = await json(`/topic/${memberTopic.id}/event?from=0&size=20`, { headers: thirdHeaders });
  assert.equal(Array.isArray(moderatorTopicEvents.data), true);
  const globalSearchBoard = await json("/board/0", { headers: memberHeaders });
  assert.equal(globalSearchBoard.id, 0);
  assert.equal(globalSearchBoard.name, "全站");

  // New topics validate their own tags, voting configuration, and anonymous
  // policy. Direct API callers cannot rely on the editor to sanitize these.
  await request(`/board/${board.id}/topic`, {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "bad tag", content: "body", tag1: 999999 })
  }, 400);
  await request(`/board/${board.id}/topic`, {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "bad vote", content: "body", isVote: true, voteInfo: { voteItems: ["only one"], expiredDays: 1, maxVoteCount: 1 } })
  }, 400);
  await request(`/board/${board.id}`, {
    method: "PUT",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ anonymousState: 2, allowVote: false })
  });
  await request(`/board/${board.id}/topic`, {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "blocked vote", content: "body", isVote: true, voteInfo: { voteItems: ["one", "two"], expiredDays: 1, maxVoteCount: 1 } })
  }, 403);
  await request(`/board/${board.id}/topic`, {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "too poor anonymous", content: "body", isAnonymous: true })
  }, 400);
  await request(`/board/${board.id}`, {
    method: "PUT",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ anonymousState: 0, allowVote: true })
  });
  await request(`/board/${board.id}/topic`, {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "anonymous forbidden", content: "body", isAnonymous: true })
  }, 403);

  const deletedReplyMarker = "deleted-reply-should-not-leak";
  const deletedReplyId = Number(await (await request(`/topic/${memberTopic.id}/post`, {
    method: "POST",
    headers: { ...thirdHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ content: deletedReplyMarker })
  })).text());
  assert.ok(Number.isInteger(deletedReplyId));
  assert.equal((await json(`/topic/search?keyword=${deletedReplyMarker}`, { headers: memberHeaders })).some((topic) => topic.id === memberTopic.id), true);
  const notificationBeforeDeletion = await json("/notification/reply?from=0&size=20", { headers: memberHeaders });
  assert.equal(notificationBeforeDeletion.some((item) => item.postId === deletedReplyId && item.content === deletedReplyMarker), true);
  assert.equal((await json("/me/unread-count", { headers: memberHeaders })).replyCount, 1);
  await request(`/post/${deletedReplyId}`, { method: "DELETE", headers: thirdHeaders });
  const visiblePostsAfterDeletion = await json(`/topic/${memberTopic.id}/post?from=0&size=20`, { headers: memberHeaders });
  assert.equal(visiblePostsAfterDeletion.some((post) => post.id === deletedReplyId), false);
  assert.deepEqual(await json(`/post/basic?id=${deletedReplyId}`, { headers: memberHeaders }), []);
  await request(`/post/${deletedReplyId}/original`, { headers: memberHeaders }, 404);
  await request(`/post/topic/specific-user?topicid=${memberTopic.id}&postid=${deletedReplyId}&from=0&size=10`, { headers: memberHeaders }, 404);
  await request(`/post/topic/anonymous/user?topicid=${memberTopic.id}&postid=${deletedReplyId}&from=0&size=10`, { headers: memberHeaders }, 404);
  await request(`/topic/${memberTopic.id}/post`, {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "cannot quote deleted reply", parentId: deletedReplyId })
  }, 404);
  assert.equal((await json(`/topic/search?keyword=${deletedReplyMarker}`, { headers: memberHeaders })).some((topic) => topic.id === memberTopic.id), false);
  const notificationAfterDeletion = await json("/notification/reply?from=0&size=20", { headers: memberHeaders });
  assert.equal(notificationAfterDeletion.some((item) => item.postId === deletedReplyId || item.content.includes(deletedReplyMarker)), false);
  assert.equal((await json("/me/unread-count", { headers: memberHeaders })).replyCount, 0);
  assert.equal((await json("/me/all-message-count", { headers: memberHeaders })).replyCount, 0);

  // Removing floor one hides the whole topic. It must not leave a readable
  // shell where the first post is missing but later floors survive.
  const firstPostTopicId = Number(await (await request(`/board/${board.id}/topic`, {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ title: "first post deletion", content: "topic root" })
  })).text());
  const firstPostId = (await json(`/topic/${firstPostTopicId}/post?from=0&size=1`, { headers: memberHeaders }))[0].id;
  const childPostId = Number(await (await request(`/topic/${firstPostTopicId}/post`, {
    method: "POST",
    headers: { ...thirdHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ content: "child of deleted root" })
  })).text());
  await request(`/post/${firstPostId}`, { method: "DELETE", headers: memberHeaders });
  await request(`/topic/${firstPostTopicId}`, { headers: memberHeaders }, 404);
  await request(`/topic/${firstPostTopicId}/post`, { headers: memberHeaders }, 404);
  await request(`/post/${childPostId}/original`, { headers: memberHeaders }, 404);

  const privateMessageId = Number(await (await request("/message", {
    method: "POST",
    headers: { ...memberHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ receiverId: created.user.id, content: "member-to-third" })
  })).text());
  assert.ok(Number.isInteger(privateMessageId));
  assert.equal((await json(`/message/user/${created.user.id}?from=0&size=50`, { headers: memberHeaders })).some((item) => item.id === privateMessageId), true);
  await request(`/message/${privateMessageId}`, { method: "DELETE", headers: memberHeaders });
  assert.equal((await json(`/message/user/${created.user.id}?from=0&size=50`, { headers: memberHeaders })).some((item) => item.id === privateMessageId), false);
  assert.equal((await json(`/message/user/100002?from=0&size=50`, { headers: thirdHeaders })).some((item) => item.id === privateMessageId), true);
  await request(`/message/${privateMessageId}`, { method: "DELETE", headers: thirdHeaders });
  assert.equal((await json(`/message/user/100002?from=0&size=50`, { headers: thirdHeaders })).some((item) => item.id === privateMessageId), false);

  await request("/me/followee/100002", { method: "PUT", headers: thirdHeaders });
  assert.equal(await json("/me/followee/100002", { headers: thirdHeaders }), true);
  assert.equal(await json("/me/followee/100002", { headers: memberHeaders }), false);
  await request("/me/favorite/6500000", { method: "PUT", headers: thirdHeaders });
  const thirdFavorites = await json("/topic/me/favorite?from=0&size=20&groupid=0", { headers: thirdHeaders });
  assert.equal(thirdFavorites.some((topic) => topic.id === 6500000), true);
  const memberFavorites = await json("/topic/me/favorite?from=0&size=20&groupid=0", { headers: memberHeaders });
  assert.equal(memberFavorites.some((topic) => topic.id === 6500000), false);

  await request(`/auth/users/${created.user.id}/status`, {
    method: "PUT",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "suspended" })
  });
  await request("/me", { headers: thirdHeaders }, 401);
  await request(`/auth/users/${created.user.id}/status`, {
    method: "PUT",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "active" })
  });
  const reset = await json(`/auth/users/${created.user.id}/password`, {
    method: "PUT",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ password: "ThirdReset!2026" })
  });
  assert.equal(reset.ok, true);
  const reloggedThird = await login("ThirdMember", "ThirdReset!2026");
  assert.match(reloggedThird.access_token, /^cc98-access-/);

  await request("/auth/users/795406/roles", {
    method: "PUT",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ roles: ["member"] })
  }, 400);
  await request("/auth/users/795406/status", {
    method: "PUT",
    headers: { ...adminHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ status: "suspended" })
  }, 400);

  await request(`/board/${board.id}`, { method: "DELETE", headers: adminHeaders });
  await request(`/board/${board.id}`, { headers: adminHeaders }, 404);
  assert.equal((await json("/board/all", { headers: adminHeaders }))[0].boards.some((item) => item.id === board.id), false);
  await request(`/board/${board.id}/tag`, { headers: adminHeaders }, 404);
  await request(`/board/${board.id}/tag-v2`, { headers: adminHeaders }, 404);
  await request(`/board/${board.id}/events`, { headers: adminHeaders }, 404);
  await request(`/board/${board.id}/stop-post-user`, { headers: adminHeaders }, 404);
  await request(`/topic/search/board/${board.id}?keyword=member`, { headers: adminHeaders }, 404);
  await request(`/topic/search/board/${board.id}/tag?tag1=1`, { headers: adminHeaders }, 404);
  await request(`/topic/${memberTopic.id}`, { headers: adminHeaders }, 404);
  await request(`/topic/${memberTopic.id}/post`, { headers: adminHeaders }, 404);
  await request(`/topic/${memberTopic.id}/event`, { headers: adminHeaders }, 404);
  await request(`/topic/${memberTopic.id}/hot-post`, { headers: adminHeaders }, 404);
  await request(`/topic/basic?id=${memberTopic.id}`, { headers: adminHeaders });
  assert.equal((await json(`/topic/basic?id=${memberTopic.id}`, { headers: adminHeaders })).length, 0);
  const deletedBoardPost = (await json(`/user/100002/post?days=3650&from=0&size=20`, { headers: adminHeaders })).postInfos;
  assert.equal(deletedBoardPost.some((post) => post.topicId === memberTopic.id), false);
  assert.equal((await json("/__test/integrity", { headers: adminHeaders })).ok, true);
  console.log("local-forum-strict-isolation: ok");
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
