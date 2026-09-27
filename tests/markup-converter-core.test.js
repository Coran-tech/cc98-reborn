const assert = require("node:assert/strict");
const converter = require("../src/markup-converter.js");
const showdown = require("../src/vendor/showdown/showdown.min.js");

const samples = [
  ["[b]粗体[/b]", "**粗体**"],
  ["[i]斜体[/i]", "_斜体_"],
  ["[b]甲[i]乙[/i][/b]", "**甲_乙_**"],
  ["[del]删除[/del]", "~~删除~~"],
  ["[url=https://www.cc98.org/topic/1]链接[/url]", "[链接](https://www.cc98.org/topic/1)"],
  ["[img]https://example.com/a.png[/img]", "![](https://example.com/a.png)"],
  ["[quote]第一行\n第二行[/quote]", "> 第一行\n> 第二行"],
  ["[code]a\nb[/code]", "```\na\nb\n```"],
  ["[line]", "---"],
  ["[md]# 标题[/md]", "# 标题"],
  ["[table][tr][th]甲[/th][th]乙[/th][/tr][tr][td]1[/td][td]2[/td][/tr][/table]", "| 甲 | 乙 |\n| --- | --- |\n| 1 | 2 |"]
];
for (const [source, expected] of samples) {
  const result = converter.convertUbbToMarkdown(source);
  assert.equal(result.output, expected, source);
  assert.equal(result.blocked, false, source);
}
assert.equal(converter.convertUbbToMarkdown("[replyview]隐藏内容[/replyview]").blocked, true);
assert.equal(converter.convertUbbToMarkdown("[color=#f00][replyview]隐藏内容[/replyview][/color]").blocked, true);
assert.equal(converter.convertUbbToMarkdown("[posteronly]").blocked, true);
assert.match(converter.convertUbbToMarkdown("[color=#f00]红[/color]").warnings.join(" "), /color/);
assert.equal(converter.convertUbbToMarkdown("[code]a```b[/code]").output, "````\na```b\n````");
assert.equal(converter.convertUbbToMarkdown("\n\n[b]甲[/b]\n").output, "\n\n**甲**\n");
assert.match(converter.convertUbbToMarkdown("[ac01]").warnings.join(" "), /表情/);
assert.match(converter.convertUbbToMarkdown("[table][tr][td=2,1]合并[/td][/tr][/table]").warnings.join(" "), /复杂表格/);
const nested = converter.convertUbbToMarkdown("[b]甲[i]乙[/i][/b]").output;
assert.match(new showdown.Converter().makeHtml(nested), /<strong>甲<em>乙<\/em><\/strong>/);
console.log("markup-converter-core: ok");
