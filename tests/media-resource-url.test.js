const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const source = fs.readFileSync(require("node:path").join(__dirname, "../src/content.js"), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} is missing`);
  const end = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, end < 0 ? source.length : end);
}

function contextFor(href, vpn = false) {
  const location = new URL(href);
  const context = vm.createContext({ URL, location,
    isWebVpnHost: (hostname = location.hostname) => hostname.endsWith(".webvpn.zju.edu.cn"),
    getCurrentWebVpnCc98Prefix: () => vpn ? `${location.origin}/https/cc98-proxy` : "",
    getCurrentWebVpnFileResourcePrefix: () => vpn ? `${location.origin}/https/file-proxy` : "",
    getWebVpnProxyPrefixFromUrl: (url) => /\/https\/(?:cc98|file)-proxy/.test(url),
    makeAbsoluteCc98Url: (url) => new URL(url, location.origin).href });
  vm.runInContext(functionSource("upgradeCc98AssetUrl") + "\n" + functionSource("makeWebVpnCc98ResourceUrl"), context);
  return context;
}

const direct = contextFor("https://www.cc98.org/topic/6656303/3#27");
for (const gender of ["boy", "girl"]) {
  assert.equal(direct.makeWebVpnCc98ResourceUrl(`http://www.cc98.org/static/images/default_avatar_${gender}.png`), `https://www.cc98.org/static/images/default_avatar_${gender}.png`);
}
assert.equal(direct.makeWebVpnCc98ResourceUrl("http://file.cc98.org/v4-upload/p/a.webp?q=1#image"), "https://file.cc98.org/v4-upload/p/a.webp?q=1#image");
assert.equal(direct.makeWebVpnCc98ResourceUrl("/static/images/default_avatar_girl.png"), "https://www.cc98.org/static/images/default_avatar_girl.png");
assert.equal(direct.upgradeCc98AssetUrl("http://external.example/image.png"), "http://external.example/image.png");
assert.equal(direct.upgradeCc98AssetUrl("http://www.cc98.org.evil.example/static/image.png"), "http://www.cc98.org.evil.example/static/image.png");
assert.equal(direct.upgradeCc98AssetUrl("http://www.cc98.org:8080/static/image.png"), "http://www.cc98.org:8080/static/image.png");
assert.equal(direct.upgradeCc98AssetUrl("chrome-extension://example/images/ac/01.png"), "chrome-extension://example/images/ac/01.png");
const local = contextFor("http://127.0.0.1:44303/topic/6500000");
assert.equal(local.makeWebVpnCc98ResourceUrl("/static/images/default_avatar_girl.png"), "http://127.0.0.1:44303/static/images/default_avatar_girl.png");
const vpn = contextFor("https://www-cc98-org-s.webvpn.zju.edu.cn/https/cc98-proxy/topic/6656303", true);
assert.equal(vpn.makeWebVpnCc98ResourceUrl("http://file.cc98.org/v4-upload/p/a.webp"), `${vpn.location.origin}/https/file-proxy/v4-upload/p/a.webp`);
assert.equal(vpn.makeWebVpnCc98ResourceUrl("/static/images/default_avatar_girl.png"), `${vpn.location.origin}/https/cc98-proxy/static/images/default_avatar_girl.png`);
assert.equal(vpn.makeWebVpnCc98ResourceUrl(`${vpn.location.origin}/https/file-proxy/v4-upload/p/a.webp`), `${vpn.location.origin}/https/file-proxy/v4-upload/p/a.webp`);
direct.cleanupPostText = (text) => String(text || "").trim();
direct.isDecorativeFrameImageUrl = () => false;
vm.runInContext(["decodeCapturedMediaText", "normalizeCapturedMediaUrl", "extractCapturedPostMediaSources"].map(functionSource).join("\n"), direct);
const repeatedUrl = "https://file.cc98.org/test/repeated.png";
const captured = direct.extractCapturedPostMediaSources([
  `[img]${repeatedUrl}[/img]`,
  `[upload=jpg]${repeatedUrl}?size=1[/upload]`,
  `[upload=png,1]${repeatedUrl}?size=2[/upload]`,
  `[img]${repeatedUrl}[/img]`,
  `[upload=zip]https://file.cc98.org/test/archive.zip[/upload]`,
  `[video]https://file.cc98.org/test/clip.mp4[/video]`
].join("\n"));
assert.deepEqual(Array.from(captured, (item) => item.src), [repeatedUrl, `${repeatedUrl}?size=1`, `${repeatedUrl}?size=2`, repeatedUrl, "https://file.cc98.org/test/clip.mp4"]);
assert.deepEqual(Array.from(captured, (item) => item.kind), ["image", "image", "image", "image", "video"]);
console.log("media resource URLs: HTTPS, local HTTP, WebVPN, legacy uploads and repeated image occurrences passed");
