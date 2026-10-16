(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.CC98RebornContentFilterCore = api;
})(globalThis, function () {
  "use strict";
  const MAX_RULES = 50, MAX_LENGTH = 1024;
  const METRICS = { 风评: "reputation", 风评计数: "reputation", 赞: "likes", 赞数: "likes", 踩: "dislikes", 踩量: "dislikes", 踩数: "dislikes", 赞踩比: "ratio", 赞踩总数: "total", 赞踩总和: "total", reputation: "reputation", likes: "likes", dislikes: "dislikes", ratio: "ratio", total: "total" };
  function scanRegexLiteral(source, start) {
    let at = start + 1, value = "", flags = "", inClass = false, closed = false, incompleteEscape = false;
    while (at < source.length) {
      const char = source[at++];
      if (char === "\\") {
        if (at >= source.length) { incompleteEscape = true; break; }
        value += char + source[at++];
      } else if (char === "/" && !inClass) { closed = true; break; }
      else { value += char; if (char === "[") inClass = true; if (char === "]") inClass = false; }
    }
    if (closed) while (/[a-z]/i.test(source[at] || "") && at < source.length) flags += source[at++];
    return { value, flags, end: at, closed, incompleteEscape };
  }
  function readRegexLiteral(source, start) {
    const literal = scanRegexLiteral(source, start);
    const fail = message => { throw new Error(message + "（第 " + (literal.end + 1) + " 字）"); };
    if (literal.incompleteEscape) fail("正则转义不完整");
    if (!literal.closed) fail("正则表达式未闭合");
    if (!/^[gimsu]*$/.test(literal.flags) || new Set(literal.flags).size !== literal.flags.length) fail("正则仅支持 g、i、m、s、u 标志，且不能重复");
    try { new RegExp(literal.value, literal.flags); } catch (error) { fail("正则无效：" + error.message); }
    return literal;
  }
  function compile(source) {
    if (typeof source !== "string" || !source.trim() || source.length > MAX_LENGTH) throw new Error("规则须为 1–1024 字的表达式");
    let at = 0, tokens = 0, depth = 0, hasRegex = false, hasMetrics = false;
    const space = () => { while (/\s/.test(source[at] || "") && at < source.length) at++; };
    const fail = message => { throw new Error(message + "（第 " + (at + 1) + " 字）"); };
    function operator(words, symbols) {
      space();
      for (const symbol of symbols) if (source.startsWith(symbol, at)) { at += symbol.length; return true; }
      for (const word of words) {
        if (source.slice(at, at + word.length).toUpperCase() === word
          && (!/^[A-Z]+$/.test(word) || !/[a-z0-9_]/i.test(source[at + word.length] || ""))) { at += word.length; return true; }
      }
      return false;
    }
    function atom() {
      space();
      if (++tokens > 256 || ++depth > 32) fail("规则过于复杂");
      let result;
      if (source[at] === "(") {
        at++; result = or(); space();
        if (source[at++] !== ")") fail("缺少右括号");
      } else {
        let type = "text", value = "", flags = "";
        const delimiter = source[at];
        if (delimiter === '"' || delimiter === "'") {
          at++; let closed = false;
          while (at < source.length) {
            const char = source[at++];
            if (char === delimiter) { closed = true; break; }
            if (char === "\\") {
              if (at >= source.length) fail("字符串转义不完整");
              const next = source[at++];
              value += ({ n: "\n", r: "\r", t: "\t" })[next] ?? next;
            } else value += char;
          }
          if (!closed) fail("字符串引号未闭合");
        } else if (delimiter === "/") {
          type = "regex"; hasRegex = true;
          const literal = readRegexLiteral(source, at);
          value = literal.value; flags = literal.flags; at = literal.end;
        } else {
          const match = source.slice(at).match(/^[^\s()><=!&|]+/);
          if (!match) fail('请输入 "文本"、[ac01] 或 /正则/');
          value = match[0]; at += value.length;
          if (/^(?:AND|OR|NOT)$/i.test(value)) fail("逻辑词前后缺少条件");
          if (Object.hasOwn(METRICS, value.toLowerCase())) { type = "metric"; value = METRICS[value.toLowerCase()]; hasMetrics = true; }
        }
        if (!value) fail("匹配内容不能为空");
        space();
        let compare = ">=", count = 1;
        const comparison = source.slice(at).match(/^(>=|<=|==|!=|>|<|=)/);
        if (comparison) {
          compare = comparison[0]; at += compare.length; space();
          const number = source.slice(at).match(type === "metric" ? /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)/ : /^\d+/);
          if (!number || Math.abs(Number(number[0])) > (type === "metric" ? 1e9 : 100000)) fail(type === "metric" ? "指标阈值须为 -10亿至10亿的数字" : "次数须为 0–100000 的整数");
          count = Number(number[0]); at += number[0].length;
        } else if (type === "metric") fail("指标后须填写比较符和数值");
        result = { type, value, flags, compare, count };
      }
      depth--; return result;
    }
    function not() { return operator(["NOT", "非"], ["!"]) ? { type: "not", child: not() } : atom(); }
    function and() { let left = not(); while (operator(["AND", "并且", "且", "与"], ["&&"])) left = { type: "and", left, right: not() }; return left; }
    function or() { let left = and(); while (operator(["OR", "或者", "或"], ["||"])) left = { type: "or", left, right: and() }; return left; }
    const ast = or(); space();
    if (at !== source.length) fail("条件之间需要 AND、OR 或 NOT");
    return { source, ast, hasRegex, hasMetrics };
  }
  function compileTitle(source) {
    if (typeof source !== "string" || !source.trim() || source.length > MAX_LENGTH) throw new Error("标题规则须为 1–1024 字的关键词或正则");
    source = source.trim();
    let type = "text", value = source, flags = "";
    if (source[0] === "/") {
      const literal = readRegexLiteral(source, 0);
      if (literal.end !== source.length) throw new Error("标题正则只支持单个 /表达式/，不支持逻辑或次数比较（第 " + (literal.end + 1) + " 字）");
      if (!literal.value) throw new Error("标题正则匹配内容不能为空");
      type = "regex"; value = literal.value; flags = literal.flags;
    }
    return { source, ast: { type, value, flags, compare: ">=", count: 1 }, hasRegex: type === "regex", hasMetrics: false };
  }
  function splitTitleRules(value) {
    if (typeof value !== "string") return [];
    const rules = [], separator = char => /[,，;；]/.test(char);
    // A broken literal consumes only its own line, never the next stored rule.
    for (const line of value.split(/\r\n?|\n/)) {
      let at = 0;
      while (at < line.length) {
        while (at < line.length && (separator(line[at]) || /\s/.test(line[at]))) at++;
        const start = at, regex = line[at] === "/";
        if (regex) at = scanRegexLiteral(line, at).end;
        while (at < line.length && !separator(line[at])) {
          // Protect delimiters in a second literal of an invalid DSL tail too;
          // do not turn that tail into new literal keyword rules accidentally.
          if (regex && line[at] === "/") at = scanRegexLiteral(line, at).end;
          else at++;
        }
        const source = line.slice(start, at).trim();
        if (source) rules.push(source);
        at++;
      }
    }
    return rules;
  }
  function parseTitleRules(value, strict = false) {
    if (value === undefined || value === "" || value === null && !strict) return [];
    if (typeof value !== "string" || value.length > 100000) {
      if (strict) throw new Error("标题规则须为不超过 100000 字的文本");
      return [];
    }
    const result = [];
    let regexCount = 0;
    for (const source of splitTitleRules(value)) {
      try {
        const rule = compileTitle(source);
        if (rule.hasRegex && ++regexCount > MAX_RULES) throw new Error("最多保存 50 条标题正则规则");
        result.push(rule);
      } catch (error) { if (strict) throw error; }
    }
    return result;
  }
  function parseRules(value) {
    let rules;
    try { rules = JSON.parse(value || "[]"); } catch { throw new Error("内容规则格式无效"); }
    if (!Array.isArray(rules) || rules.length > MAX_RULES || rules.some(rule => typeof rule !== "string")) throw new Error("最多保存 50 条内容规则");
    return rules.map(rule => { compile(rule); return rule; });
  }
  function occurrences(term, text, foldedText) {
    if (term.type === "text") {
      let at = 0, count = 0;
      const needle = term.value.toLocaleLowerCase(), haystack = foldedText;
      while (count <= term.count && (at = haystack.indexOf(needle, at)) !== -1) { count++; at += needle.length; }
      return count;
    }
    const flags = term.flags.replace(/g/g, "") + "g", pattern = new RegExp(term.value, flags);
    let count = 0, match;
    while (count <= term.count && (match = pattern.exec(text))) {
      count++;
      if (!match[0].length) {
        const code = text.codePointAt(pattern.lastIndex);
        pattern.lastIndex += flags.includes("u") && code > 0xffff ? 2 : 1;
      }
    }
    return count;
  }
  function metricValue(name, metrics) {
    const likes = metrics?.likes, dislikes = metrics?.dislikes;
    if (name === "reputation") return Number.isFinite(metrics?.reputation) ? metrics.reputation : undefined;
    if (name === "likes" || name === "dislikes") return Number.isFinite(metrics?.[name]) && metrics[name] >= 0 ? metrics[name] : undefined;
    if (!Number.isFinite(likes) || !Number.isFinite(dislikes) || likes < 0 || dislikes < 0) return undefined;
    if (name === "total") return likes + dislikes;
    return dislikes ? likes / dislikes : likes > 0 ? Infinity : undefined;
  }
  function evaluate(rule, text, allowRegex = true, metrics = {}) {
    let foldedText;
    function visit(node) {
      if (node.type === "not") { const result = visit(node.child); return result === undefined ? undefined : !result; }
      if (node.type === "and" || node.type === "or") {
        const a = visit(node.left);
        if (node.type === "and" && a === false) return false;
        if (node.type === "or" && a === true) return true;
        const b = visit(node.right);
        if (node.type === "and" && b === false) return false;
        if (node.type === "or" && b === true) return true;
        return a === undefined || b === undefined ? undefined : b;
      }
      if (node.type === "regex" && !allowRegex) return undefined;
      if (node.type === "text") foldedText ??= text.toLocaleLowerCase();
      const count = node.type === "metric" ? metricValue(node.value, metrics) : occurrences(node, text, foldedText);
      if (count === undefined) return undefined;
      switch (node.compare) {
        case ">": return count > node.count;
        case ">=": return count >= node.count;
        case "<": return count < node.count;
        case "<=": return count <= node.count;
        case "!=": return count !== node.count;
        default: return count === node.count;
      }
    }
    return visit(rule.ast);
  }
  return { MAX_RULES, MAX_LENGTH, compile, parseRules, compileTitle, splitTitleRules, parseTitleRules, evaluate, metricValue };
});
