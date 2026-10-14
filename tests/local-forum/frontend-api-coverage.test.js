const assert = require("assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");
const { auditFrontendApi, uniqueApiPatterns } = require("./frontend-api-audit");

const port = 44312;
const origin = `http://127.0.0.1:${port}`;
const runtimeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cc98-reborn-frontend-api-coverage-"));
const child = spawn(process.execPath, [path.join(__dirname, "server.js")], {
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

let serverOutput = "";
child.stdout.on("data", (chunk) => { serverOutput += chunk.toString(); });
child.stderr.on("data", (chunk) => { serverOutput += chunk.toString(); });

async function waitForServer() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${origin}/__test/health`)).ok) return;
    } catch { }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Local forum did not start.\n${serverOutput}`);
}

function concretePath(pattern) {
  const lower = pattern.toLowerCase();
  let pathname = pattern.split("?")[0].replace(/\/$/, "");
  const segments = pathname.split("/").map((segment, index, all) => {
    if (!segment.startsWith(":")) return segment;
    const parent = String(all[index - 1] || "").toLowerCase();
    if (parent === "board" || parent === "moveto") return "81";
    if (parent === "topic" && all[index - 2]?.toLowerCase() === "post") return "6500000";
    if (parent === "topic" || parent === "favorite") return "6500000";
    if (parent === "post") return "900002";
    if (parent === "user" && all[index - 2]?.toLowerCase() === "message") return "100002";
    if (parent === "name") return "SyntaxTester";
    if (parent === "basic") return "100002";
    if (parent === "followee" || parent === "stop-post-user") return "100002";
    if (parent === "custom-board") return "81";
    if (parent === "column") return "1";
    if (parent === "hot-") return "weekly";
    if (all[index + 1] === "vote" || all[index + 1] === "post" || all[index + 1] === "event"
      || all[index + 1] === "isfavorite" || all[index + 1] === "look-ip") return "6500000";
    if (all[index + 1] === "operation" || all[index + 1] === "recent-topic") return "100002";
    if (all[index + 1] === "original" || all[index + 1] === "like" || all[index + 1] === "rating"
      || all[index + 1] === "rating-v2" || all[index + 1] === "awards") return "900002";
    if (all[index + 1] === "lock" || all[index + 1] === "best" || all[index + 1] === "not-hot"
      || all[index + 1] === "top" || all[index + 1] === "up" || all[index + 1] === "highlight") return "6500000";
    return "100002";
  });
  pathname = segments.join("/") || "/";
  pathname = pathname.replace(/hot-:[^/]+$/i, "hot-weekly");
  pathname = pathname.replace(/annual-review-:[^/]+$/i, "annual-review-2026");

  const query = new URLSearchParams();
  if (lower.includes("from=")) query.set("from", "0");
  if (lower.includes("size=")) query.set("size", "20");
  if (lower.includes("days=")) query.set("days", "3650");
  if (lower.includes("year=")) query.set("year", "2026");
  if (lower.includes("month=")) query.set("month", "8");
  if (lower.includes("keyword=")) query.set("keyword", "本地");
  if (lower.includes("boardid=")) query.set("boardId", "81");
  if (lower.includes("topicid=")) query.set("topicid", "6500000");
  if (lower.includes("postid=")) query.set("postid", "900002");
  if (lower.includes("userid=")) query.set("userid", "100002");
  if (lower.includes("tag1=")) query.set("tag1", "1");
  if (lower.includes("tag2=")) query.set("tag2", "0");
  if (lower.includes("groupid=")) query.set("groupid", "0");
  if (lower.includes("group=")) query.set("group", "0");
  if (lower.includes("order=")) query.set("order", "0");
  if (lower.includes("mode=")) query.set("mode", "0");
  if (lower.includes("enabled=")) query.set("enabled", "true");
  if (lower.includes("type=")) query.set("type", "1");
  if (lower.includes("?id=") || lower.includes("?:target") || pathname.includes("multi-")) {
    const id = pathname.startsWith("/user") ? "100002"
      : (pathname.startsWith("/post") ? "900002" : "6500000");
    query.append("id", id);
  }
  if (lower.includes("?name=")) query.append("name", "SyntaxTester");

  const suffix = query.toString();
  return suffix ? `${pathname}?${suffix}` : pathname;
}

function requestInit(method, pathname) {
  if (method === "GET" || method === "DELETE") return { method };
  const lower = pathname.toLowerCase();
  let body = {};
  if (lower === "/me/signin") body = "coverage-signin";
  if (lower.includes("multi-lock")) body = { value: 1, reason: "coverage" };
  if (/\/post\/\d+\/like/.test(lower)) body = 1;
  if (/\/post\/\d+\/(rating|rating-v2)/.test(lower)) body = { value: 1, type: 1, reasonId: 1, reason: "coverage" };
  if (/\/topic\/\d+\/vote/.test(lower)) body = { items: [1] };
  if (lower === "/notification/at") body = [];
  return {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}

async function run() {
  await waitForServer();
  const calls = auditFrontendApi();
  assert.equal(calls.length >= 175, true, "the frontend API scan unexpectedly shrank");
  assert.deepEqual(
    calls.filter((call) => call.patterns.length === 0 || call.methods.length === 0),
    [],
    "every cc98Fetch call must resolve to at least one method and route"
  );

  const patterns = uniqueApiPatterns(calls);
  assert.equal(patterns.length >= 150, true, "the unique frontend API surface unexpectedly shrank");
  const failures = [];
  for (const entry of patterns) {
    const separator = entry.indexOf(" ");
    const method = entry.slice(0, separator);
    const pathname = concretePath(entry.slice(separator + 1));
    const response = await fetch(`${origin}${pathname}`, requestInit(method, pathname));
    if (response.status === 500 || response.status === 501) {
      failures.push({ entry, method, pathname, status: response.status, body: await response.text() });
    }
    if (method !== "GET") {
      const reset = await fetch(`${origin}/__test/reset`, { method: "POST" });
      assert.equal(reset.ok, true, `reset after ${entry}`);
    }
  }

  assert.deepEqual(failures, [], `frontend routes returned 500/501:\n${JSON.stringify(failures, null, 2)}`);
  const unknown = await (await fetch(`${origin}/__test/unknown`)).json();
  assert.deepEqual(unknown, [], `frontend routes reached the unknown API fallback:\n${JSON.stringify(unknown, null, 2)}`);
  const integrity = await (await fetch(`${origin}/__test/integrity`)).json();
  assert.equal(integrity.ok, true);
}

run()
  .then(() => console.log("local-forum-frontend-api-coverage: ok"))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
    }
    fs.rmSync(runtimeRoot, { recursive: true, force: true });
  });
