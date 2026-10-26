const assert = require("node:assert/strict");
const core = require("../src/settings-backup-core.js");
const pins = require("../src/private-message-pins-core.js");
const semantic = require("../src/semantic-filter-core.js");
const defaults = { blockedContentRules: "[]", topicDrawerEnabled: true, enabled: true, fontScale: 110, emojiScale: 200, imageLoadDuration: 2100, themeStyle: "modern", themeMode: "light", themePalette: "teal", themeDayStart: "07:00", themeNightStart: "19:00", themeCustomPrimary: "#1f7166", themeCustomSecondary: "#326b9b", blockedUserIds: "", aiSearchSuggestApiKey: "" };
Object.assign(defaults, semantic.DEFAULTS);
defaults.blockedTitleKeywords = "";
const records = {
  [core.SETTINGS_KEY]: { ...defaults, blockedContentRules: JSON.stringify(['"[ac01]" > 3 AND NOT "hello"', '风评 < -3 OR (赞踩比 < 0.5 AND 赞踩总数 >= 20)']), topicDrawerEnabled: false, themeStyle: "ascii", themeMode: "auto", blockedUserIds: "123", aiSearchSuggestApiKey: "secret-api-key", futureUnknown: "skip" },
  [core.BOARDS_KEY]: ["https://www.cc98.org/board/1", "https://www-cc98-org-s.webvpn.zju.edu.cn/https/token/board/2", "/board/1"],
  "cc98RebornUserNote:uid:123:user:456": "同学 😀",
  "cc98RebornUserNote:uid:789:user:456": "另一个账号的备注",
  [pins.storageKey("123")]: [{ uid: "456", name: "同学" }, { uid: "789", name: "伙伴" }],
  "cc98RebornOpenIdBinding:v1": { bound: true, secret: "auth-token" },
  "cc98RebornReadLater:v1:uid:123": [{ title: "skip" }],
  "draft:secret": "skip"
};
records["cc98RebornSemanticConnection:v1"] = { token: "secret-semantic-token" };
records["cc98RebornAccountVault:v1"] = { version: 1, accounts: [{ values: { accessToken: "synthetic-vault-secret" } }] };
Object.assign(records[core.SETTINGS_KEY], { semanticFilterEnabled: true, semanticFilterModel: "minilm", semanticFilterThreshold: 0.73 });
records[core.SETTINGS_KEY].blockedTitleKeywords = "普通关键词\n/招聘.{1,3}实习/i\n/[a,b]/";
records[core.SETTINGS_KEY].topicsSidebarPosition = "left";
const text = core.create(records, defaults, "0.3.6", new Date("2026-10-13T00:00:00Z"));
assert.doesNotMatch(text, /secret-api-key|auth-token|futureUnknown|draft:secret|ReadLater/);
assert.doesNotMatch(text, /secret-semantic-token|cc98RebornSemanticConnection/);
assert.doesNotMatch(text, /synthetic-vault-secret|cc98RebornAccountVault/);
const result = core.parse(text, defaults);
assert.deepEqual(JSON.parse(result.data[core.SETTINGS_KEY].blockedContentRules), ['"[ac01]" > 3 AND NOT "hello"', '风评 < -3 OR (赞踩比 < 0.5 AND 赞踩总数 >= 20)']);
assert.equal(result.data[core.SETTINGS_KEY].topicDrawerEnabled, false);
assert(!Object.hasOwn(result.data[core.SETTINGS_KEY], "topicsSidebarPosition"));
assert.doesNotMatch(text, /topicsSidebarPosition/);
assert.equal(result.data[core.SETTINGS_KEY].themeMode, "auto");
assert.equal(result.data[core.SETTINGS_KEY].themeStyle, "ascii");
assert.equal(result.data[core.SETTINGS_KEY].semanticFilterEnabled, true);
assert.equal(result.data[core.SETTINGS_KEY].semanticFilterModel, "minilm");
assert.equal(result.data[core.SETTINGS_KEY].semanticFilterThreshold, 0.73);
assert.equal(result.data[core.SETTINGS_KEY].blockedTitleKeywords, "普通关键词\n/招聘.{1,3}实习/i\n/[a,b]/");
assert.deepEqual(result.data[core.BOARDS_KEY], ["/board/1", "/board/2"]);
assert.deepEqual(core.summary(result.data), { settings: 21, notes: 2, contacts: 2, boards: 2, accounts: 2 });
const oldBackup = JSON.parse(text);
oldBackup.data[core.SETTINGS_KEY].topicsSidebarPosition = "left";
assert(!Object.hasOwn(core.parse(JSON.stringify(oldBackup), defaults).data[core.SETTINGS_KEY], "topicsSidebarPosition"), "retired position keys in old backups are ignored");
assert.deepEqual(core.parse("\uFEFF" + text, defaults).data, result.data);
for (const change of [
  file => { file.version = 9; },
  file => { file.format = "other"; },
  file => { file.data["cc98RebornOpenIdBinding:v1"] = { bound: true }; },
  file => { file.data[core.SETTINGS_KEY].aiSearchSuggestApiKey = "malicious"; },
  file => { file.data[core.SETTINGS_KEY].fontScale = 300; },
  file => { file.data[core.SETTINGS_KEY].enabled = "false"; },
  file => { file.data[core.SETTINGS_KEY].blockedContentRules = '["/[/"]'; },
  file => { file.data[core.SETTINGS_KEY].blockedTitleKeywords = '/[a-/'; },
  file => { file.data[core.SETTINGS_KEY].themeStyle = "unknown"; },
  file => { file.data[core.SETTINGS_KEY].semanticFilterThreshold = 1.1; },
  file => { file.data[core.SETTINGS_KEY].semanticFilterModel = "remote-url"; },
  file => { file.data[core.SETTINGS_KEY].semanticFilterBlockedLabels = "not-a-candidate"; },
  file => { file.data[core.SETTINGS_KEY].semanticFilterHypothesisTemplate = "{} {}"; },
  file => { file.data["cc98RebornSemanticConnection:v1"] = { token: "secret" }; },
  file => { file.data["cc98RebornAccountVault:v1"] = { version: 1, accounts: [] }; },
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
