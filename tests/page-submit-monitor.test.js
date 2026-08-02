const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeElement {}
class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}
class FakeMutationObserver {
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

function makeResponse(url, body = "") {
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
      return makeResponse(url, body);
    },
    async text() {
      return body;
    },
    async json() {
      return [];
    }
  };
}

async function main() {
  const postMessages = [];
  const domMessages = [];
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
    querySelectorAll() {
      return [];
    },
    dispatchEvent(event) {
      domMessages.push(JSON.parse(event.detail));
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
    setTimeout() {
      return 0;
    },
    clearTimeout() {},
    window: null
  };
  context.Location.prototype.assign = function assign() {};
  context.Location.prototype.replace = function replace() {};
  context.window = context;
  context.window.postMessage = (message) => {
    postMessages.push(message);
  };
  context.window.fetch = async (url, init = {}) => {
    const value = String(url);
    const body = /\/board\/17\/topic$/i.test(value) && init.method === "POST"
      ? "6581234"
      : "";
    return makeResponse(value, body);
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
  assert.equal(domMessages.length, submitMessages.length, "DOM bridge should mirror every submit message");
  assert.deepEqual(
    domMessages.map((message) => message.monitorEventId),
    submitMessages.map((message) => message.monitorEventId),
    "both bridges must use the same IDs for content-side deduplication"
  );
  assert.equal(
    submitMessages.find((message) => (
      message.type === "editor-submit-result" && message.payload.kind === "post"
    )).payload.body,
    "6581234"
  );
}

main().then(() => {
  console.log("page-submit-monitor: ok");
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
