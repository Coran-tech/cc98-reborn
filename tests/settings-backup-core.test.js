const assert = require("node:assert/strict");
const core = require("../src/settings-backup-core.js");
const pins = require("../src/private-message-pins-core.js");
const defaults = { enabled: true, fontScale: 110, emojiScale: 200, imageLoadDuration: 2100, themeStyle: "modern", themeMode: "light", themePalette: "teal", themeDayStart: "07:00", themeNightStart: "19:00", themeCustomPrimary: "#1f7166", themeCustomSecondary: "#326b9b", blockedUserIds: "", aiSearchSuggestApiKey: "" };
const records = {
  [core.SETTINGS_KEY]: { ...defaults, themeStyle: "ascii", themeMode: "auto", blockedUserIds: "123", aiSearchSuggestApiKey: "secret-api-key", futureUnknown: "skip" },
  [core.BOARDS_KEY]: ["https://www.cc98.org/board/1", "https://www-cc98-org-s.webvpn.zju.edu.cn/https/token/board/2", "/board/1"],
  "cc98RebornUserNote:uid:123:user:456": "同学 😀",
  "cc98RebornUserNote:uid:789:user:456": "另一个账号的备注",
  [pins.storageKey("123")]: [{ uid: "456", name: "同学" }, { uid: "789", name: "伙伴" }],
  "cc98RebornOpenIdBinding:v1": { bound: true, secret: "auth-token" },
  "cc98RebornReadLater:v1:uid:123": [{ title: "skip" }],
  "draft:secret": "skip"
};
const text = core.create(records, defaults, "0.3.6", new Date("2026-10-13T00:00:00Z"));
assert.doesNotMatch(text, /secret-api-key|auth-token|futureUnknown|draft:secret|ReadLater/);
const result = core.parse(text, defaults);
assert.equal(result.data[core.SETTINGS_KEY].themeMode, "auto");
assert.equal(result.data[core.SETTINGS_KEY].themeStyle, "ascii");
assert.deepEqual(result.data[core.BOARDS_KEY], ["/board/1", "/board/2"]);
assert.deepEqual(core.summary(result.data), { settings: 12, notes: 2, contacts: 2, boards: 2, accounts: 2 });
assert.deepEqual(core.parse("\uFEFF" + text, defaults).data, result.data);
for (const change of [
  file => { file.version = 9; },
  file => { file.format = "other"; },
  file => { file.data["cc98RebornOpenIdBinding:v1"] = { bound: true }; },
  file => { file.data[core.SETTINGS_KEY].aiSearchSuggestApiKey = "malicious"; },
  file => { file.data[core.SETTINGS_KEY].fontScale = 300; },
  file => { file.data[core.SETTINGS_KEY].enabled = "false"; },
  file => { file.data[core.SETTINGS_KEY].themeStyle = "unknown"; },
  file => { file.data[core.SETTINGS_KEY].themeNightStart = "07:00"; },
  file => { file.data[core.BOARDS_KEY] = ["javascript:alert(1)"]; },
  file => { file.data[core.BOARDS_KEY] = ["https://example.com/board/1"]; },
  file => { file.data[pins.storageKey("123")] = [{ uid: "001", name: "bad" }]; },
  file => { file.data["cc98RebornUserNote:uid:123:user:456"] = "x".repeat(81); },
  file => { file.data = {}; }
]) {
  const file = JSON.parse(text); change(file);
  assert.throws(() => core.parse(JSON.stringify(file), defaults));
}
assert.throws(() => core.parse("{", defaults));
assert.throws(() => core.parse("x".repeat(core.MAX_BYTES + 1), defaults));
assert.throws(() => core.parse(text.replace('"data": {', '"data": { "__proto__": {},'), defaults));
assert.equal(pins.uid("001"), "");
assert.equal(pins.uid(Number.MAX_SAFE_INTEGER + 1), "");
assert.equal(pins.storageKey("guest"), "");
assert.deepEqual(pins.normalize([{ uid: 1, name: "甲\n乙" }, { uid: "1", name: "duplicate" }, { uid: "0", name: "bad" }]), [{ uid: "1", name: "甲 乙" }]);
console.log("settings backup and private-message pins core: roundtrip, scope, credentials exclusion, validation and account keys passed");
