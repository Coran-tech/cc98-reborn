import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "espree";

const root = fileURLToPath(new URL("../../", import.meta.url));

function bindingNames(node) {
  if (!node) return [];
  if (node.type === "Identifier") return [node.name];
  if (node.type === "RestElement") return bindingNames(node.argument);
  if (node.type === "AssignmentPattern") return bindingNames(node.left);
  if (node.type === "ArrayPattern") return node.elements.flatMap(bindingNames);
  if (node.type === "ObjectPattern") {
    return node.properties.flatMap((item) => bindingNames(item.value || item.argument));
  }
  return [];
}

function declarations(file) {
  const ast = parse(fs.readFileSync(path.join(root, file), "utf8"), {
    ecmaVersion: "latest",
    sourceType: "script"
  });
  const names = {};
  for (const node of ast.body) {
    if (node.type === "VariableDeclaration") {
      for (const item of node.declarations) {
        for (const name of bindingNames(item.id)) names[name] = node.kind !== "const";
      }
    } else if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
      names[node.id.name] = false;
    }
  }
  return names;
}

// These scripts intentionally run in the same classic-script context; unlike
// a module bundle, their lexical declarations are shared across files.
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const content = manifest.content_scripts.find((item) => item.js?.includes("src/content.js")).js;
const groups = [
  [...content.filter((file) => !file.includes("/vendor/")), "src/topic-drawer.js"],
  ["popup/popup.js", "popup/settings-backup.js"],
  [
    "src/background.js",
    "experiments/question-mark/background.js",
    "src/semantic-background.js",
    "experiments/question-mark/admin-key-store.js"
  ],
  ["experiments/question-mark/admin-key-store.js", "experiments/question-mark/admin.js"]
];

export function sharedScriptGlobals() {
  return groups.flatMap((files) => {
    const symbols = new Map(files.map((file) => [file, declarations(file)]));
    return files.map((file) => ({
      files: [file],
      languageOptions: {
        globals: Object.assign(
          {},
          ...files.filter((other) => other !== file).map((other) => symbols.get(other))
        )
      }
    }));
  });
}
