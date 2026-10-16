const assert = require("node:assert/strict");
const core = require("../src/content-filter-core.js");
let checks = 0;
function test(source, text, expected) { assert.equal(core.evaluate(core.compile(source), text), expected, source); checks++; }
test('"[ac01]" > 3', "[ac01]".repeat(3), false);
test('"[ac01]" > 3', "[ac01]".repeat(4), true);
test('"广告" >= 2', "广告文字广告", true);
test('"广告" = 2', "广告文字广告", true);
test('"aa" = 1', "aaa", true);
test('"ABC"', "abc", true);
test('"广告" AND NOT "讨论"', "广告讨论", false);
test('"广告" AND NOT "讨论"', "广告", true);
test('"a" OR "b" AND "c"', "a", true);
test('("a" OR "b") AND "c"', "a", false);
test('"a" && !"b"', "a", true);
test('"广告" 且 非 "讨论"', "广告", true);
test('"广告" 或者 "推广"', "推广", true);
test('/加[微薇]信/i >= 2', "加微信，加薇信", true);
test('/abc/', "ABC", false);
test('/abc/i', "ABC", true);
test('/^广告/m >= 2', "广告\n广告", true);
test('/a.b/s', "a\nb", true);
test('/(?:)/gu = 2', "😀", true);
test('/[\\/]/ >= 2', "//", true);
test('"a\\nb"', "a\nb", true);
test('/(ab){2}/g == 2', "abab abab", true);
for (const [operator, expected] of [[">", false], [">=", true], ["<", false], ["<=", true], ["!=", false], ["=", true]]) test('"a" ' + operator + " 2", "aa", expected);
for (const source of ["", '""', '"abc', "/abc", "/[/", "/a/ii", "/a/y", '"a" AND', '"a" "b"', '( "a"', '"a" > -1', '"a" > 1.5', '"a" > 100001', "AND", "(".repeat(34) + '"a"' + ")".repeat(34), "a".repeat(1025)]) {
  assert.throws(() => core.compile(source), undefined, source); checks++;
}
assert.equal(core.evaluate(core.compile('"a" OR /b/'), "a", false), true);
assert.equal(core.evaluate(core.compile('"a" AND /b/'), "", false), false);
assert.equal(core.evaluate(core.compile('NOT /b/'), "x", false), undefined); checks += 3;
assert.deepEqual(core.parseRules(JSON.stringify(['"a"', "/a{1,3}/"])), ['"a"', "/a{1,3}/"]); checks++;
for (const [source, metrics, expected] of [
  ['风评 < -3', { reputation: -4 }, true], ['风评 < -3', { reputation: -3 }, false],
  ['风评计数 <= +1', { reputation: 1 }, true], ['踩量 > 20', { dislikes: 21 }, true],
  ['赞踩比 < 0.5 AND 赞踩总数 >= 20', { likes: 3, dislikes: 17 }, true],
  ['赞踩比 < 0.5 AND 赞踩总数 >= 20', { likes: 1, dislikes: 4 }, false],
  ['赞踩比 < 0.5 AND 赞踩总数 >= 20', { likes: 20, dislikes: 20 }, false],
  ['赞踩比 < 1', { likes: 1, dislikes: 0 }, false], ['赞踩比 >= 1', { likes: 1, dislikes: 0 }, true],
  ['NOT 赞踩比 < 1', { likes: 0, dislikes: 0 }, undefined],
  ['赞踩总数 = 0', { likes: 0, dislikes: 0 }, true], ['风评 < 0', {}, undefined],
  ['NOT 风评 < 0', {}, undefined], ['风评 < 0 OR "a"', {}, true],
  ['风评 < 0 AND "absent"', {}, false], ['风评 < -3 OR 踩 > 20', { dislikes: 21 }, true],
  ['赞数 >= 2 且 踩数 <= 3', { likes: 2, dislikes: 3 }, true],
  ['ratio < .5 && total >= 20', { likes: 3, dislikes: 17 }, true],
  ['风评 < 0', { reputation: null }, undefined], ['踩 > 0', { dislikes: '9' }, undefined],
  ['NOT 赞踩比 < 1', { likes: 1 }, undefined], ['赞踩比 > 0', { likes: -1, dislikes: 3 }, undefined],
  ['风评 < -3 AND /a/', { reputation: -4 }, true], ['风评 < -3 AND /z/', { reputation: -4 }, false],
  ['"风评"', {}, false], ['likes != 3', { likes: 2 }, true]
]) { assert.equal(core.evaluate(core.compile(source), 'a', true, metrics), expected, source); checks++; }
for (const source of ['风评', '风评 <', '赞踩比 < NaN', '赞 > Infinity', '风评 > 1000000001', '踩 > 1e3', '赞 > 1.2.3']) { assert.throws(() => core.compile(source)); checks++; }
assert.equal(core.compile('风评 < 0 OR "a"').hasMetrics, true); checks++;
for (const value of ["{}", '["/[/"]', "[42]", JSON.stringify(Array(51).fill('"a"'))]) { assert.throws(() => core.parseRules(value)); checks++; }
function title(source, text, expected) {
  const rule = core.compileTitle(source);
  assert.equal(core.evaluate(rule, text), expected, source);
  assert.equal(rule.ast.compare, ">="); assert.equal(rule.ast.count, 1); assert.equal(rule.hasMetrics, false);
  checks++;
}
for (const [source, text, expected] of [
  ["AND", "ordinary AND keyword", true], ["a AND b", "a and b", true], ["a AND b", "a b", false],
  ["a.b", "xxa.bxx", true], ["a.b", "xxaxbxx", false], ["x+? [ac01]", "X+? [AC01]", true],
  ["风评 < -3", "风评 < -3 的讨论", true], ["'quoted'", "quoted", false], ["a,b", "a,b", true],
  ["  招聘 推广  ", "关于招聘 推广的讨论", true], ["普通关键词", "没有该字样", false],
  ["/^a.b$/", "axb", true], ["/abc/", "ABC", false], ["/abc/i", "ABC", true],
  ["/a|b/", "b", true], ["/a{1,3}/", "aa", true], ["/(?:)/u", "短标题", true],
  [String.raw`/a\/b/i`, "A/b", true], [String.raw`/[/,;]/`, ",", true],
  [String.raw`/[\]/,;]/u`, "]", true], [String.raw`/[[]/`, "[", true],
  [String.raw`/[\\]/`, "\\", true], ["/[^]/u", "😀", true]
]) title(source, text, expected);
for (const source of ["", " ", null, 42, "x".repeat(1025), "/unclosed", "/[/", "/x/ii", "/x/y", "/x/d", "/x/v", "//", "/x/ >= 1", "/x/>0", "/x/ == 1", "/x/ AND /y/", "/x/i OR foo", "/x/ extra"]) {
  assert.throws(() => core.compileTitle(source), undefined, String(source)); checks++;
}
assert.equal(core.compileTitle("x".repeat(1024)).ast.value.length, 1024); checks++;
assert.deepEqual(core.compileTitle("  a AND b  "), { source: "a AND b", ast: { type: "text", value: "a AND b", flags: "", compare: ">=", count: 1 }, hasRegex: false, hasMetrics: false }); checks++;
assert.equal(core.evaluate(core.compileTitle("/x/i"), "X", false), undefined); checks++;
assert.equal(core.evaluate(core.compileTitle("x"), "X", false), true); checks++;
for (const [value, expected] of [
  ["alpha,beta，gamma;delta；epsilon\r\nzeta", ["alpha", "beta", "gamma", "delta", "epsilon", "zeta"]],
  ["abc,/a,b/i", ["abc", "/a,b/i"]],
  ["alpha,/a{1,3}/i，beta;/[；,]/u；gamma", ["alpha", "/a{1,3}/i", "beta", "/[；,]/u", "gamma"]],
  [String.raw`/a\/b,c/i; ordinary AND keyword`, [String.raw`/a\/b,c/i`, "ordinary AND keyword"]],
  [String.raw`/[\]/,;]/u,after`, [String.raw`/[\]/,;]/u`, "after"]],
  ["/[a,b\nnext,another\n/ok/i", ["/[a,b", "next", "another", "/ok/i"]],
  ["/x/ OR /a,b/\nnext", ["/x/ OR /a,b/", "next"]],
  ["/x/ >= 1,normal\r/next/i", ["/x/ >= 1", "normal", "/next/i"]],
  [" ,，;； \n\r\n", []], [" ordinary AND word ", ["ordinary AND word"]]
]) { assert.deepEqual(core.splitTitleRules(value), expected, value); checks++; }
const mixedTitles = "legacy,keyword\n/a{1,3}/i\n/[broken\nnext\n/x/>=1\n/[；,]/u";
assert.deepEqual(core.parseTitleRules(mixedTitles).map(rule => rule.source), ["legacy", "keyword", "/a{1,3}/i", "next", "/[；,]/u"]); checks++;
assert.throws(() => core.parseTitleRules(mixedTitles, true)); checks++;
assert.deepEqual(core.parseTitleRules("/[/\n/x/ >= 1\nvalid" ).map(rule => rule.source), ["valid"]); checks++;
assert.deepEqual(core.parseTitleRules("a AND b\na.b\n风评 < -3", true).map(rule => rule.ast.type), ["text", "text", "text"]); checks++;
const manyTitles = Array.from({ length: 51 }, (_, index) => "/title" + index + "/i").concat(Array.from({ length: 100 }, (_, index) => "keyword" + index)).join("\n");
assert.equal(core.parseTitleRules(manyTitles).filter(rule => rule.hasRegex).length, 50); checks++;
assert.equal(core.parseTitleRules(manyTitles).filter(rule => !rule.hasRegex).length, 100); checks++;
assert.throws(() => core.parseTitleRules(manyTitles, true), /50/); checks++;
for (const value of [42, [], {}, "x".repeat(100001), null]) {
  assert.deepEqual(core.parseTitleRules(value), []); assert.throws(() => core.parseTitleRules(value, true)); checks++;
}
assert.deepEqual(core.parseTitleRules(undefined, true), []); assert.deepEqual(core.parseTitleRules("", true), []); checks++;
// Compilation only constructs the user pattern. It must never run it while
// validating typed input, even for expressions that are expensive to match.
{
  const vm = require("node:vm"), fs = require("node:fs"); let constructions = 0;
  const context = { module: { exports: {} }, RegExp: function () {
    constructions++; return { exec() { throw new Error("User regex ran during validation"); }, test() { throw new Error("User regex ran during validation"); } };
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/content-filter-core.js"), "utf8"), context);
  assert.equal(context.module.exports.compileTitle("/(a+)+$/").hasRegex, true);
  assert.equal(constructions, 1); checks++;
}
console.log("Content/title rule parser/count/logic/regex/limits: " + checks + " checks passed");
