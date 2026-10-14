const fs = require("fs");
const path = require("path");
const ts = require(path.resolve(__dirname, "..", "..", "reference", "Forum-main", "node_modules", "typescript"));

const forumRoot = path.resolve(__dirname, "..", "..", "reference", "Forum-main");
const sourceRoots = ["Actions", "AsyncActions", "Components", "Pages", "Utility", "Utility.tsx"];

function collectSourceFiles(entry, output = []) {
  const target = path.join(forumRoot, entry);
  if (!fs.existsSync(target)) return output;
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (/\.tsx?$/.test(target)) output.push(target);
    return output;
  }
  for (const item of fs.readdirSync(target, { withFileTypes: true })) {
    if (item.name === "node_modules" || item.name === "dist") continue;
    collectSourceFiles(path.relative(forumRoot, path.join(target, item.name)), output);
  }
  return output;
}

function expressionText(node, sourceFile) {
  return node ? node.getText(sourceFile) : "";
}

function enclosingFunction(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) return current;
    current = current.parent;
  }
  return null;
}

function functionName(node) {
  if (!node || ts.isSourceFile(node)) return "";
  if (node.name && (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name))) return node.name.text;
  if ((ts.isArrowFunction(node) || ts.isFunctionExpression(node)) && ts.isVariableDeclaration(node.parent)) {
    return ts.isIdentifier(node.parent.name) ? node.parent.name.text : "";
  }
  return "";
}

function isCallToFunction(call, fn) {
  const name = functionName(fn);
  if (!name || !ts.isCallExpression(call)) return false;
  if (ts.isIdentifier(call.expression)) return call.expression.text === name;
  if (ts.isPropertyAccessExpression(call.expression)) return call.expression.name.text === name;
  return false;
}

function nodesBeforeReference(sourceFile, reference, predicate) {
  const referenceScope = enclosingFunction(reference);
  const matches = [];
  const visit = (node) => {
    if (node.pos > reference.pos) return;
    if (predicate(node)) {
      const declarationScope = enclosingFunction(node);
      if (declarationScope === sourceFile || declarationScope === referenceScope) matches.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return matches;
}

function cartesianJoin(left, right) {
  const result = [];
  for (const leftValue of left) {
    for (const rightValue of right) result.push(`${leftValue}${rightValue}`);
  }
  return [...new Set(result)];
}

function placeholder(node, sourceFile) {
  return `:${expressionText(node, sourceFile).replace(/\s+/g, "")}`;
}

function resolveParameter(identifier, sourceFile, seen, bindings) {
  const fn = enclosingFunction(identifier);
  if (!fn || ts.isSourceFile(fn)) return [];
  const index = fn.parameters.findIndex((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === identifier.text);
  if (index < 0) return [];

  const result = [];
  const visit = (node) => {
    if (isCallToFunction(node, fn) && node.arguments[index]) {
      result.push(...resolveExpression(node.arguments[index], sourceFile, seen, bindings));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...new Set(result)];
}

function resolveArrayElement(node, sourceFile, seen, bindings) {
  if (!ts.isElementAccessExpression(node) || !ts.isIdentifier(node.expression) || !node.argumentExpression) return [];
  const indexValues = resolveExpression(node.argumentExpression, sourceFile, seen, bindings)
    .map((value) => Number.parseInt(value, 10))
    .filter(Number.isInteger);
  if (!indexValues.length) return [];

  const declarations = nodesBeforeReference(sourceFile, node, (candidate) => (
    ts.isVariableDeclaration(candidate)
    && ts.isIdentifier(candidate.name)
    && candidate.name.text === node.expression.text
    && ts.isArrayLiteralExpression(candidate.initializer)
  ));
  const result = [];
  for (const declaration of declarations) {
    for (const index of indexValues) {
      const element = declaration.initializer.elements[index];
      if (element) result.push(...resolveExpression(element, sourceFile, seen, bindings));
    }
  }
  return [...new Set(result)];
}

function containsIdentifier(node, name) {
  let found = false;
  const visit = (candidate) => {
    if (found) return;
    if (ts.isIdentifier(candidate) && candidate.text === name) {
      found = true;
      return;
    }
    ts.forEachChild(candidate, visit);
  };
  visit(node);
  return found;
}

function resolveIdentifier(node, sourceFile, seen, bindings) {
  if (bindings.has(node.text)) return bindings.get(node.text);
  const key = `identifier:${node.text}:${enclosingFunction(node)?.pos ?? -1}`;
  if (seen.has(key)) return [];
  const nextSeen = new Set(seen).add(key);
  let values = [];

  const candidates = nodesBeforeReference(sourceFile, node, (candidate) => (
    (ts.isVariableDeclaration(candidate)
      && ts.isIdentifier(candidate.name)
      && candidate.name.text === node.text
      && candidate.initializer)
    || (ts.isBinaryExpression(candidate)
      && candidate.operatorToken.kind === ts.SyntaxKind.EqualsToken
      && ts.isIdentifier(candidate.left)
      && candidate.left.text === node.text)
  ));
  for (const candidate of candidates.sort((left, right) => left.pos - right.pos)) {
    const expression = ts.isVariableDeclaration(candidate) ? candidate.initializer : candidate.right;
    const selfReferential = containsIdentifier(expression, node.text);
    const nextBindings = new Map(bindings);
    if (selfReferential && values.length) nextBindings.set(node.text, values);
    const resolved = resolveExpression(expression, sourceFile, nextSeen, nextBindings);
    if (!resolved.length) continue;
    if (ts.isVariableDeclaration(candidate) || selfReferential) {
      values = resolved;
    } else {
      values = [...new Set([...values.filter(Boolean), ...resolved.filter(Boolean)])];
    }
  }
  if (!values.length) values.push(...resolveParameter(node, sourceFile, nextSeen, bindings));
  if (!values.length) values.push(placeholder(node, sourceFile));
  return [...new Set(values)];
}

function resolveExpression(node, sourceFile, seen = new Set(), bindings = new Map()) {
  if (!node || seen.size > 40) return [];
  const key = `node:${node.pos}:${node.end}`;
  if (seen.has(key)) return [];
  const nextSeen = new Set(seen).add(key);

  if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
  if (ts.isNumericLiteral(node)) return [node.text];
  if (node.kind === ts.SyntaxKind.TrueKeyword) return ["true"];
  if (node.kind === ts.SyntaxKind.FalseKeyword) return ["false"];
  if (ts.isParenthesizedExpression(node)) return resolveExpression(node.expression, sourceFile, nextSeen, bindings);
  if (ts.isIdentifier(node)) return resolveIdentifier(node, sourceFile, nextSeen, bindings);
  if (ts.isElementAccessExpression(node)) {
    const resolved = resolveArrayElement(node, sourceFile, nextSeen, bindings);
    return resolved.length ? resolved : [placeholder(node, sourceFile)];
  }
  if (ts.isPropertyAccessExpression(node)) return [placeholder(node, sourceFile)];
  if (ts.isConditionalExpression(node)) {
    return [...new Set([
      ...resolveExpression(node.whenTrue, sourceFile, nextSeen, bindings),
      ...resolveExpression(node.whenFalse, sourceFile, nextSeen, bindings)
    ])];
  }
  if (ts.isPrefixUnaryExpression(node)) {
    const values = resolveExpression(node.operand, sourceFile, nextSeen, bindings);
    if (node.operator === ts.SyntaxKind.MinusToken) return values.map((value) => `-${value}`);
    return values;
  }
  if (ts.isTemplateExpression(node)) {
    let values = [node.head.text];
    for (const span of node.templateSpans) {
      const resolved = resolveExpression(span.expression, sourceFile, nextSeen, bindings);
      values = cartesianJoin(values, resolved.length ? resolved : [placeholder(span.expression, sourceFile)]);
      values = values.map((value) => `${value}${span.literal.text}`);
    }
    return values;
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveExpression(node.left, sourceFile, nextSeen, bindings);
    const right = resolveExpression(node.right, sourceFile, nextSeen, bindings);
    return cartesianJoin(
      left.length ? left : [placeholder(node.left, sourceFile)],
      right.length ? right : [placeholder(node.right, sourceFile)]
    );
  }
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === "encodeURIComponent" && node.arguments[0]) {
      return [placeholder(node, sourceFile)];
    }
    return [placeholder(node, sourceFile)];
  }
  return [];
}

function normalizeApiPattern(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized);
      return `${url.pathname}${url.search}`;
    } catch {
      return normalized;
    }
  }
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function requestMethods(optionsNode, sourceFile) {
  if (!optionsNode || !ts.isObjectLiteralExpression(optionsNode)) return ["GET"];
  const methodProperty = optionsNode.properties.find((property) => (
    ts.isPropertyAssignment(property)
    && ((ts.isIdentifier(property.name) && property.name.text === "method")
      || (ts.isStringLiteral(property.name) && property.name.text === "method"))
  ));
  if (!methodProperty || !ts.isPropertyAssignment(methodProperty)) return ["GET"];
  const methods = resolveExpression(methodProperty.initializer, sourceFile)
    .map((value) => value.toUpperCase())
    .filter((value) => /^[A-Z]+$/.test(value));
  return methods.length ? [...new Set(methods)] : [expressionText(methodProperty.initializer, sourceFile).toUpperCase()];
}

function isCc98FetchCall(node) {
  if (!ts.isCallExpression(node)) return false;
  const expression = node.expression;
  if (ts.isIdentifier(expression)) return expression.text === "cc98Fetch";
  return ts.isPropertyAccessExpression(expression) && expression.name.text === "cc98Fetch";
}

function auditFrontendApi() {
  const calls = [];
  const sourceFiles = [...new Set(sourceRoots.flatMap((entry) => collectSourceFiles(entry)))];
  for (const filePath of sourceFiles) {
    const source = fs.readFileSync(filePath, "utf8");
    const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if (isCc98FetchCall(node) && node.arguments.length) {
        const argument = node.arguments[0];
        const patterns = resolveExpression(argument, sourceFile)
          .map(normalizeApiPattern)
          .filter((value) => value.startsWith("/"));
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
        calls.push({
          file: path.relative(forumRoot, filePath).replace(/\\/g, "/"),
          line: position.line + 1,
          methods: requestMethods(node.arguments[1], sourceFile),
          expression: expressionText(argument, sourceFile),
          patterns: [...new Set(patterns)]
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return calls;
}

function uniqueApiPatterns(calls = auditFrontendApi()) {
  return [...new Set(calls.flatMap((call) => (
    call.methods.flatMap((method) => call.patterns.map((pattern) => `${method} ${pattern}`))
  )))].sort();
}

if (require.main === module) {
  const calls = auditFrontendApi();
  const unresolved = calls.filter((call) => call.patterns.length === 0 || call.methods.some((method) => !/^[A-Z]+$/.test(method)));
  const patterns = uniqueApiPatterns(calls);
  console.log(JSON.stringify({ callCount: calls.length, patternCount: patterns.length, unresolved, patterns }, null, 2));
}

module.exports = { auditFrontendApi, normalizeApiPattern, uniqueApiPatterns };
