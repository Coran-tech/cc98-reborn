const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeElement {
  constructor() {
    this.attributes = new Map();
    this.children = [];
    this.slots = [];
  }
  closest() { return null; }
  querySelectorAll(selector) {
    return selector === ".lazyload-placeholder" ? this.slots : this.children;
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
}
class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}
class FakeMutationObserver {
  static instances = [];
  constructor(callback) {
    this.callback = callback;
    FakeMutationObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
}
class FakeXMLHttpRequest {
  addEventListener() {}
  getResponseHeader() {
    return "";
  }
}
FakeXMLHttpRequest.prototype.open = function open() {};
FakeXMLHttpRequest.prototype.send = function send() {};

function makeResponse(url, body = "", json = []) {
  return {
    ok: true,
    status: 200,
    url,
    headers: {
      get() {
        return "";
      }
    },
    clone() {
      return makeResponse(url, body, json);
    },
    async text() {
      return body;
    },
    async json() {
      return json;
    }
  };
}

async function main() {
  const postMessages = [];
  const domMessages = [];
  const documentListeners = new Map();
  const topicResponses = new Map();
  const timers = new Map();
  let timerSequence = 0;
  let fetchCount = 0;
  let replies = [];
  const location = {
    hostname: "www.cc98.org",
    origin: "https://www.cc98.org",
    pathname: "/editor/postTopic/17",
    search: "",
    hash: "",
    href: "https://www.cc98.org/editor/postTopic/17",
    replace() {},
    assign() {}
  };
  const document = {
    referrer: "",
    documentElement: {},
    querySelectorAll(selector) {
      return selector === ".reply" ? replies : [];
    },
    addEventListener(type, callback) {
      if (!documentListeners.has(type)) documentListeners.set(type, []);
      documentListeners.get(type).push(callback);
    },
    dispatchEvent(event) {
      if (event.type === "cc98-reborn-submit-monitor-event") {
        domMessages.push(JSON.parse(event.detail));
      }
      documentListeners.get(event.type)?.forEach((callback) => callback(event));
      return true;
    }
  };
  const storage = {
    getItem() {
      return "";
    },
    setItem() {}
  };
  const context = {
    console,
    URL,
    Element: FakeElement,
    CustomEvent: FakeCustomEvent,
    MutationObserver: FakeMutationObserver,
    XMLHttpRequest: FakeXMLHttpRequest,
    Location: function Location() {},
    location,
    document,
    history: {
      pushState() {},
      replaceState() {}
    },
    localStorage: storage,
    sessionStorage: storage,
    setTimeout(callback, delay) {
      timers.set(++timerSequence, { callback, delay });
      return timerSequence;
    },
    clearTimeout(id) { timers.delete(id); },
    window: null
  };
  context.Location.prototype.assign = function assign() {};
  context.Location.prototype.replace = function replace() {};
  context.window = context;
  context.window.postMessage = (message) => {
    postMessages.push(message);
  };
  context.window.fetch = async (url, init = {}) => {
    fetchCount += 1;
    const value = String(url);
    const body = /\/board\/17\/topic$/i.test(value) && init.method === "POST"
      ? "6581234"
      : "";
    return makeResponse(value, body, topicResponses.get(value) || []);
  };

  vm.createContext(context);
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "page-submit-monitor.js"),
    "utf8"
  );
  vm.runInContext(source, context, { filename: "page-submit-monitor.js" });

  await context.window.fetch("https://api.cc98.org/board/17/topic", { method: "POST" });
  await context.window.fetch("https://api.cc98.org/topic/6581234/post", { method: "POST" });
  await context.window.fetch("https://api.cc98.org/post/839454548", { method: "PUT" });
  await context.window.fetch("https://api.cc98.org/topic/6581234/post", { method: "GET" });
  await context.window.fetch(
    "https://webvpn.zju.edu.cn/https/77726476706e69737468656265737421e7e056d22433310830079bab/board/17/topic",
    { method: "POST" }
  );
  await context.window.fetch(
    "https://webvpn.zju.edu.cn/https/77726476706e69737468656265737421e7e056d22433310830079bab/topic/6581234/post",
    { method: "POST" }
  );
  await context.window.fetch(
    "https://webvpn.zju.edu.cn/https/77726476706e69737468656265737421e7e056d22433310830079bab/post/839454548",
    { method: "PATCH" }
  );
  await Promise.resolve();
  await Promise.resolve();

  const submitMessages = postMessages.filter((message) => (
    /^editor-submit-(?:start|result)$/.test(message.type)
  ));
  assert.equal(submitMessages.length, 12, "direct and WebVPN submits should each emit start and result");
  assert.deepEqual(
    submitMessages.map((message) => `${message.type}:${message.payload.kind}`),
    [
      "editor-submit-start:post",
      "editor-submit-result:post",
      "editor-submit-start:reply",
      "editor-submit-result:reply",
      "editor-submit-start:edit",
      "editor-submit-result:edit",
      "editor-submit-start:post",
      "editor-submit-result:post",
      "editor-submit-start:reply",
      "editor-submit-result:reply",
      "editor-submit-start:edit",
      "editor-submit-result:edit"
    ]
  );
  const domSubmitMessages = domMessages.filter((message) => /^editor-submit-(?:start|result)$/.test(message.type));
  assert.equal(domSubmitMessages.length, submitMessages.length, "DOM bridge should mirror every submit message");
  assert.deepEqual(
    domSubmitMessages.map((message) => message.monitorEventId),
    submitMessages.map((message) => message.monitorEventId),
    "both bridges must use the same IDs for content-side deduplication"
  );
  assert.equal(
    submitMessages.find((message) => (
      message.type === "editor-submit-result" && message.payload.kind === "post"
    )).payload.body,
    "6581234"
  );

  const snapshots = () => postMessages.filter((message) => message.type === "topic-content-snapshot");
  const requestSnapshot = (overrides = {}) => document.dispatchEvent(new FakeCustomEvent(
    "cc98-reborn-topic-content-request",
    { detail: JSON.stringify({
      source: "cc98-reborn-content", type: "request-topic-content-snapshot",
      topicId: "6581234", from: 0, ...overrides
    }) }
  ));
  const setPage = (page) => {
    location.pathname = `/topic/6581234/${page}`;
    location.href = `${location.origin}${location.pathname}`;
  };
  const fetchPage = async (from, items) => {
    const url = `https://api.cc98.org/Topic/6581234/post?from=${from}&size=10`;
    topicResponses.set(url, items);
    await context.window.fetch(url);
    await Promise.resolve();
    await Promise.resolve();
  };
  setPage(1);
  const firstPage = [
    { id: 123456, floor: 1, content: "[img]https://file.cc98.org/one.png[/img]" },
    { id: 123457, floor: 2, content: "[img]https://file.cc98.org/two.png[/img]" }
  ];
  await fetchPage(0, firstPage);
  const captured = snapshots().at(-1);
  assert.equal(captured.payload.items.length, 2);
  const capturedDom = domMessages.find((message) => message.monitorEventId === captured.monitorEventId);
  assert.deepEqual(capturedDom.payload, JSON.parse(JSON.stringify(captured.payload)), "topic snapshots use both bridges with one event ID");

  const beforeReplayFetches = fetchCount;
  const beforeReplay = snapshots().length;
  requestSnapshot();
  assert.equal(snapshots().length, beforeReplay + 1, "a late receiver can replay the current page");
  assert.deepEqual(snapshots().at(-1).payload, captured.payload);
  assert.notEqual(snapshots().at(-1).monitorEventId, captured.monitorEventId, "replays have a fresh ID after an earlier lost delivery");
  assert.equal(fetchCount, beforeReplayFetches, "replay never fetches the page again");

  const beforeInvalid = snapshots().length;
  requestSnapshot({ source: "unrelated" });
  requestSnapshot({ topicId: "7654321" });
  requestSnapshot({ from: 10 });
  requestSnapshot({ from: "0" });
  document.dispatchEvent(new FakeCustomEvent("cc98-reborn-topic-content-request", { detail: "{" }));
  assert.equal(snapshots().length, beforeInvalid, "malformed or stale-route requests cannot replay another page");

  const reply = new FakeElement();
  const content = new FakeElement();
  const slot = new FakeElement();
  const hiddenImage = new FakeElement();
  const sameSourceSlot = new FakeElement();
  content.__reactFiber$fixture = { memoizedProps: { postId: 123456, floor: 1, content: "image-one" }, return: null };
  slot.__reactFiber$fixture = { memoizedProps: {}, return: {
    memoizedProps: { children: { type: "img", props: { src: "https://file.cc98.org/one.png", alt: "first" } } }, return: null
  } };
  sameSourceSlot.__reactFiber$fixture = { memoizedProps: {}, return: {
    memoizedProps: { imageUri: "https://file.cc98.org/one.png", title: "repeated" }, return: null
  } };
  hiddenImage.__reactFiber$fixture = { memoizedProps: { imageUri: "https://file.cc98.org/hidden.png" }, return: null };
  reply.children = [content, hiddenImage];
  reply.slots = [slot, sameSourceSlot];
  replies = [reply];
  requestSnapshot();
  assert.equal(slot.getAttribute("data-cc98-lazy-src"), "https://file.cc98.org/one.png");
  assert.equal(slot.getAttribute("data-cc98-lazy-alt"), "first");
  assert.equal(sameSourceSlot.getAttribute("data-cc98-lazy-src"), "https://file.cc98.org/one.png", "each occurrence keeps its own slot source");
  assert.equal(hiddenImage.getAttribute("data-cc98-lazy-src"), null, "explicitly hidden images are not automatically materialized");
  assert.equal(snapshots().at(-1).payload.items[0].content, "image-one", "request also captures current React props");

  const beforeIndependentReplay = snapshots().length;
  replies = [];
  requestSnapshot();
  assert.equal(snapshots().length, beforeIndependentReplay + 2, "partial rendered snapshots do not overwrite the complete API page cache");
  assert.equal(snapshots().slice(beforeIndependentReplay).some((message) => message.payload.items.length === 2), true);

  replies = [reply];
  const scheduleRenderedCapture = () => {
    FakeMutationObserver.instances.at(-1).callback();
    const [id, timer] = [...timers].filter(([, entry]) => entry.delay === 120).at(-1);
    timers.delete(id);
    timer.callback();
  };
  const beforeUnchanged = snapshots().length;
  scheduleRenderedCapture();
  assert.equal(snapshots().length, beforeUnchanged, "unchanged rendered snapshots are suppressed");
  content.__reactFiber$fixture.memoizedProps.content = "image-two";
  scheduleRenderedCapture();
  assert.equal(snapshots().length, beforeUnchanged + 1, "equal-length content edits must emit an updated snapshot");
  assert.equal(snapshots().at(-1).payload.items[0].content, "image-two");

  reply.children = [];
  slot.__reactFiber$fixture.return.memoizedProps.children.props.src = "https://file.cc98.org/fallback.png";
  scheduleRenderedCapture();
  assert.equal(snapshots().at(-1).payload.kind, "rendered-media", "slot recovery without post props notifies the content renderer");
  assert.equal(snapshots().at(-1).payload.items.length, 0, "a slot-only signal does not claim a complete page snapshot");
  const beforeStableSlots = snapshots().length;
  scheduleRenderedCapture();
  assert.equal(snapshots().length, beforeStableSlots, "stable slot attributes do not create a rebuild loop");

  replies = [];
  for (let page = 2; page <= 16; page += 1) {
    await fetchPage((page - 1) * 10, [{ id: 123456 + page, floor: (page - 1) * 10 + 1, content: `page-${page}` }]);
  }
  const beforeEvictedReplay = snapshots().length;
  requestSnapshot();
  assert.equal(snapshots().length, beforeEvictedReplay, "old page snapshots are evicted from the bounded cache");
  setPage(16);
  requestSnapshot({ from: 150 });
  assert.equal(snapshots().length, beforeEvictedReplay + 1, "a recent page remains available after pagination");
  assert.equal(snapshots().at(-1).payload.items[0].floor, 151);
}

main().then(() => {
  console.log("page-submit-monitor: ok");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
