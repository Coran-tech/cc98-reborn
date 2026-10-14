const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const port = 44306;
const origin = `http://127.0.0.1:${port}`;
const serverPath = path.join(__dirname, "server.js");
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc98-reborn-backend-contract-"));
let child = null;
let output = "";

function startServer() {
  child = spawn(process.execPath, [serverPath], {
    cwd: path.resolve(__dirname, "..", ".."),
    env: {
      ...process.env,
      CC98_LOCAL_PORT: String(port),
      CC98_LOCAL_DATA_PATH: path.join(runtimeRoot, "forum-data.json"),
      CC98_LOCAL_UPLOAD_ROOT: path.join(runtimeRoot, "uploads"),
      CC98_LOCAL_RESET: "1",
      CC98_LOCAL_STRICT_API: "1"
    },
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

async function request(pathname, options = {}, expectedStatus = 200) {
  const response = await fetch(`${origin}${pathname}`, options);
  assert.equal(response.status, expectedStatus, `${options.method || "GET"} ${pathname}: ${response.status}`);
  return response;
}

async function json(pathname, options = {}, expectedStatus = 200) {
  return (await request(pathname, options, expectedStatus)).json();
}

async function run() {
  startServer();
  await waitForServer();

  const health = await json("/__test/health");
  assert.equal(health.backend.schemaVersion, 4);
  assert.equal(health.backend.unknownRequests, 0);

  const me = await json("/me");
  assert.equal(Array.isArray(me.boardMasterTitles), true);
  assert.equal(Array.isArray(me.userTitleIds), true);
  assert.equal(me.browsingHistoryEnabled, true);

  await request("/me", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ SignatureCode: "[b]契约签名[/b]", Introduction: "契约简介", QQ: "123456", Gender: 0 })
  });
  const updatedMe = await json("/me");
  assert.equal(updatedMe.signatureCode, "[b]契约签名[/b]");
  assert.equal(updatedMe.introduction, "契约简介");
  assert.equal(updatedMe.qq, "123456");
  assert.equal(updatedMe.gender, 0);

  await request("/me/portrait", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify("/__uploads/local-avatar.png")
  });
  assert.equal((await json("/me")).portraitUrl, "/__uploads/local-avatar.png");

  await request("/me/theme?id=7", { method: "PUT" });
  assert.equal(await json("/me/theme"), 7);
  await request("/me/theme?id=29", { method: "PUT" });
  assert.equal(await json("/me/theme"), 29);
  assert.deepEqual(await json("/me/theme-setting"), {
    enableDayNightSwitch: false,
    syncWithBrowserDayNightMode: false,
    dayStartTime: "08:00:00",
    nightStartTime: "23:00:00"
  });
  await request("/me/theme-setting", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enableDayNightSwitch: true, dayStartTime: "07:30" })
  });
  assert.deepEqual(await json("/me/theme-setting"), {
    enableDayNightSwitch: true,
    syncWithBrowserDayNightMode: false,
    dayStartTime: "07:30:00",
    nightStartTime: "23:00:00"
  });
  await request("/me/topic-view-mode?mode=2", { method: "PUT" });
  assert.equal(await json("/me/topic-view-mode"), 2);

  const signinBefore = await json("/me/signin");
  assert.equal(signinBefore.hasSignedInToday, false);
  assert.equal(signinBefore.lastSignInCount, 0);
  assert.equal((await json("/me")).signInCardCount, 1);
  await request("/me/signin", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify("契约测试签到")
  });
  const signinAfter = await json("/me/signin");
  assert.equal(signinAfter.hasSignedInToday, true);
  assert.ok(signinAfter.lastReward >= 600 && signinAfter.lastReward <= 1200);
  assert.equal(signinAfter.lastSignInCount, 1);

  const today = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const signinMonth = await json(`/me/signin-in-month?year=${today.getUTCFullYear()}&month=${today.getUTCMonth() + 1}`);
  assert.equal(signinMonth.length, 1);
  assert.deepEqual(signinMonth[0], {
    year: today.getUTCFullYear(),
    month: today.getUTCMonth() + 1,
    day: today.getUTCDate(),
    reward: signinAfter.lastReward,
    useCard: false
  });

  const makeup = await json("/me/make-up-missed-signin", { method: "POST" });
  assert.equal(makeup.errorCode, 0);
  assert.equal(makeup.data, 2);
  const yesterday = new Date(Date.now() + 8 * 60 * 60 * 1000);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const makeupMonth = await json(`/me/signin-in-month?year=${yesterday.getUTCFullYear()}&month=${yesterday.getUTCMonth() + 1}`);
  assert.deepEqual(makeupMonth.find((item) => item.day === yesterday.getUTCDate()), {
    year: yesterday.getUTCFullYear(),
    month: yesterday.getUTCMonth() + 1,
    day: yesterday.getUTCDate(),
    reward: 0,
    useCard: true
  });
  assert.equal((await json("/me")).signInCardCount, 0);

  const token = await json("/openid/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: "local" })
  });
  assert.equal(token.token_type, "Bearer");
  assert.equal(typeof token.access_token, "string");

  const discovery = await json("/openid/.well-known/openid-configuration");
  assert.match(discovery.authorization_endpoint, /\/openid\/connect\/authorize$/);
  assert.match(discovery.end_session_endpoint, /\/openid\/connect\/endsession$/);
  const authorization = await request(
    "/openid/connect/authorize?response_type=code&state=contract-state&redirect_uri=http%3A%2F%2F127.0.0.1%3A44306%2Fcallback",
    { redirect: "manual", headers: { Accept: "text/html" } },
    302
  );
  const authorizationLocation = new URL(authorization.headers.get("location"));
  assert.equal(authorizationLocation.hostname, "127.0.0.1");
  assert.equal(authorizationLocation.searchParams.get("state"), "contract-state");
  assert.match(authorizationLocation.searchParams.get("code"), /^cc98-code-/);
  await json(
    "/openid/connect/authorize?redirect_uri=https%3A%2F%2Fexample.com%2Fcallback",
    {},
    400
  );

  const globalBefore = await json("/config/global");
  assert.match(globalBefore.announcement, /本地模拟论坛/);
  await request("/config/global/announcement", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ announcement: "[b]契约测试公告[/b]" })
  });
  assert.equal((await json("/config/index")).announcement, "[b]契约测试公告[/b]");

  const hotPosts = await json("/topic/6500000/hot-post");
  assert.deepEqual(hotPosts.map((item) => item.id), [900002]);

  const voteTopicId = Number(await (await request("/board/81/topic", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "契约测试投票",
      content: "请选择",
      contentType: 0,
      isVote: true,
      voteInfo: { voteItems: ["选项一", "选项二"], expiredDays: 3, maxVoteCount: 1, needVote: true }
    })
  })).text());
  const voteBefore = await json(`/topic/${voteTopicId}/vote`);
  assert.equal(voteBefore.voteItems.length, 2);
  assert.equal(voteBefore.canVote, true);
  assert.equal(voteBefore.needVote, true);
  await request(`/topic/${voteTopicId}/vote`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: [1] })
  });
  const voteAfter = await json(`/topic/${voteTopicId}/vote`);
  assert.equal(voteAfter.voteItems[0].count, 1);
  assert.equal(voteAfter.canVote, false);

  const recentBatchOne = await json("/topic/random-recent?from=0&size=1");
  const recentBatchTwo = await json("/topic/random-recent?from=0&size=1");
  assert.equal(recentBatchOne.length, 1);
  assert.equal(recentBatchTwo.length, 1);
  assert.notEqual(recentBatchOne[0].id, recentBatchTwo[0].id);
  const recommendationBatchOne = await json("/topic/random-recommendation?from=0&size=1");
  const recommendationBatchTwo = await json("/topic/random-recommendation?from=0&size=1");
  assert.equal(recommendationBatchOne.length, 1);
  assert.equal(recommendationBatchTwo.length, 1);
  assert.notEqual(recommendationBatchOne[0].id, recommendationBatchTwo[0].id);

  const ratingBody = JSON.stringify({ value: 1, reason: "契约测试评分" });
  await request("/post/900002/rating", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: ratingBody
  });
  await request("/post/900002/rating", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: ratingBody
  }, 403);
  let awards = await json("/post/900002/awards");
  assert.equal(awards[0].operatorName, "LocalTester");
  assert.equal(awards[0].content, "风评值 +1");
  assert.equal(awards[0].reason, "契约测试评分");

  await request("/post/900002/operation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operationType: 0, wealth: 5, stopPostDays: 2, reason: "契约测试管理操作" })
  });
  assert.equal((await json("/user/100002")).wealth, 505);
  const stoppedUsers = await json("/board/81/stop-post-user?from=0&size=20");
  assert.equal(stoppedUsers.length, 1);
  assert.equal(stoppedUsers[0].userId, 100002);
  assert.equal(stoppedUsers[0].userName, "SyntaxTester");
  assert.equal(stoppedUsers[0].operatorUserName, "LocalTester");
  assert.equal(stoppedUsers[0].days, 2);
  awards = await json("/post/900002/awards");
  assert.equal(awards.some((award) => (
    award.operatorName === "LocalTester"
    && award.content === "财富 +5"
    && award.reason === "契约测试管理操作"
  )), true);
  await request("/board/81/stop-post-user/100002", { method: "DELETE" });
  assert.equal((await json("/board/81/stop-post-user?from=0&size=20")).length, 0);

  const ipGroups = await json("/topic/6500000/look-ip");
  assert.equal(ipGroups.length, 1);
  assert.equal(ipGroups[0].ip, "127.0.0.1");
  assert.equal(ipGroups[0].posts.length, 3);

  await request("/topic/6500000/lock", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "契约测试锁定" })
  });
  assert.equal((await json("/topic/6500000")).state, 1);
  await request("/topic/6500000/lock", { method: "DELETE" });
  assert.equal((await json("/topic/6500000")).state, 0);

  await request("/topic/6500000/best", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "契约测试精华" })
  });
  const bestTopics = await json("/topic/best/board/81?from=0&size=20");
  assert.equal(bestTopics.count, 1);
  assert.equal(bestTopics.topics[0].id, 6500000);

  const topicEvents = await json("/topic/6500000/event?from=0&size=7");
  assert.equal(Array.isArray(topicEvents.data), true);
  assert.equal(topicEvents.count >= topicEvents.data.length, true);
  const boardEvents = await json("/board/81/events?from=0&size=20");
  assert.equal(Array.isArray(boardEvents.boardEvents), true);
  assert.equal(boardEvents.count >= boardEvents.boardEvents.length, true);

  const rewardRecord = await json("/manage/reward-daily-record?boardId=81");
  assert.equal(rewardRecord.boardName, "本地测试版");
  assert.equal(typeof rewardRecord.rewardMaxValue, "number");
  assert.equal(typeof rewardRecord.rewardTotalValue, "number");

  const review = await json("/me/annual-review-2026");
  assert.equal(review.year, 2026);
  assert.equal(typeof review.topicCount, "number");
  assert.equal(typeof review.achievement, "string");
  assert.equal(review.board1, 81);

  const recentPosts = await json("/user/795406/post?days=3650&from=0&size=10");
  assert.equal(Array.isArray(recentPosts.postInfos), true);
  assert.equal(recentPosts.count >= recentPosts.postInfos.length, true);

  const myPosts = await json("/me/recent-post?from=0&size=11");
  assert.equal(Array.isArray(myPosts.data), true);
  assert.equal(myPosts.count >= myPosts.data.length, true);
  assert.equal(typeof myPosts.data[0].title, "string");
  const hotMyPosts = await json("/me/hot-post?from=0&size=11");
  assert.equal(Array.isArray(hotMyPosts.data), true);

  await json("/topic/6500000");
  const history = await json("/me/browsing-record?from=0&size=11");
  assert.equal(Array.isArray(history.data), true);
  assert.equal(history.count >= history.data.length, true);

  const allMessageCount = await json("/me/all-message-count");
  const unreadCount = await json("/me/unread-count");
  assert.equal(allMessageCount.systemCount >= unreadCount.systemCount, true);

  const knownGetPaths = [
    "/config/index",
    "/config/global/advertisement/all",
    "/config/global/special-offer/all",
    "/index/column/recommandationreading/all",
    "/index/column/recommandationfunction/all",
    "/index/column/schoolnews/all",
    "/config/global/alltag",
    "/config/global/all-user-title",
    "/config/now",
    "/user?id=795406&id=100002",
    "/user/name?name=LocalTester&name=SyntaxTester",
    "/user/name/LocalTester",
    "/user/basic/100002",
    "/user/100002/recent-topic?from=0&size=11",
    "/me/recent-topic?from=0&size=11",
    "/me/followee?from=0&size=10",
    "/me/follower?from=0&size=10",
    "/me/followee/topic?from=0&size=20",
    "/me/custom-board",
    "/me/custom-board/topic?from=0&size=20",
    "/me/favorite-topic-group",
    "/topic/me/favorite?from=0&size=11&order=0&groupid=0",
    "/board/all",
    "/board?id=81",
    "/board/search?keyword=本地",
    "/board/81/tag",
    "/board/81/tag-v2",
    "/board/81/topic?from=0&size=20",
    "/topic/toptopics?boardid=81",
    "/topic/save/board/81?from=0&size=20",
    "/topic/search?keyword=本地&from=0&size=20",
    "/topic/search/board/81?keyword=本地&from=0&size=20",
    "/topic/search/board/81/tag?tag1=1&from=0&size=20",
    "/topic/basic?id=6500000",
    "/topic/new?from=0&size=20",
    "/topic/new-media?from=0&size=20",
    "/topic/hot-weekly?from=0&size=20",
    "/topic/random-recent?size=5",
    "/topic/random-recommendation?size=5",
    "/topic/6500000/isfavorite",
    "/topic/6500000/hot-post",
    "/topic/6500000/post?from=0&size=10",
    "/topic/6500000/look-ip",
    "/post/basic?id=900001&id=900002",
    "/post/900001/original",
    "/post/900002/like",
    "/post/rating-reason?type=1",
    "/post/900002/awards",
    "/post/topic/specific-user?topicid=6500000&postid=900002&from=0&size=10",
    "/message/recent-contact-users?from=0&size=7",
    "/message/user/100002?from=0&size=10",
    "/notification/reply?from=0&size=10",
    "/notification/at?from=0&size=10",
    "/notification/system?from=0&size=10"
  ];
  for (const pathname of knownGetPaths) await request(pathname);
  assert.equal((await json("/__test/unknown")).length, 0);

  const frontendRoute = await request("/usercenter/config");
  assert.match(await frontendRoute.text(), /<html/i);
  assert.equal((await json("/__test/unknown")).length, 0);

  const unknown = await json("/definitely-not-an-api", {}, 501);
  assert.equal(unknown.error, "local_api_not_implemented");
  const unknownLog = await json("/__test/unknown");
  assert.equal(unknownLog.length, 1);
  assert.equal(unknownLog[0].path, "/definitely-not-an-api");
}

run()
  .then(() => console.log("local-forum-backend-contract: ok"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopServer();
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  });
