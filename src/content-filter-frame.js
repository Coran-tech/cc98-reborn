(() => {
  "use strict";
  let port, worker, active, timer;
  const queue = [];
  function finish(result) {
    clearTimeout(timer); active = null; port?.postMessage(result); next();
  }
  function next() {
    if (active || !queue.length) return;
    active = queue.shift();
    if (!worker) {
      worker = new Worker("content-filter-worker.js");
      worker.onmessage = event => { if (event.data.id === active?.id) finish(event.data); };
      worker.onerror = () => { const id = active?.id; worker.terminate(); worker = null; finish({ id, index: -1, error: "正则检测失败，本次已跳过" }); };
    }
    const id = active.id;
    timer = setTimeout(() => { worker.terminate(); worker = null; finish({ id, index: -1, error: "正则运行超时，本次已跳过；请简化规则" }); }, 200);
    worker.postMessage(active);
  }
  addEventListener("message", event => {
    if (port || event.source !== parent || event.data?.type !== "CC98_CONTENT_FILTER_CONNECT" || !event.ports[0]) return;
    let url;
    try { url = new URL(event.origin); } catch { return; }
    if (!/^https?:$/.test(url.protocol) || !(/^(?:www\.)?cc98\.org$/i.test(url.hostname) || /(?:^|\.)webvpn\.zju\.edu\.cn$/i.test(url.hostname))) return;
    port = event.ports[0];
    port.onmessage = message => {
      const data = message.data;
      if (!data || !Number.isSafeInteger(data.id) || typeof data.text !== "string" || !Array.isArray(data.rules) || data.rules.length > 50) return;
      queue.push(data); next();
    };
    port.postMessage({ ready: true });
  });
  addEventListener("pagehide", () => { clearTimeout(timer); worker?.terminate(); port?.close(); });
})();
