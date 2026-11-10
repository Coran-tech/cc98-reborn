import js from "@eslint/js";
import globals from "globals";
import { sharedScriptGlobals } from "./scripts/quality/browser-globals.mjs";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "dist/**",
      "build/**",
      "outputs/**",
      "reference/**",
      "tmp/**",
      ".codex/**",
      ".agents/**",
      "src/vendor/**",
      "question-mark-sites-demo/**",
      "question-mark-sites-source/**",
      "experiments/post-context-draft/package-preview/**",
      "experiments/semantic-lab/.runtime/**",
      "experiments/semantic-lab/models/**",
      "experiments/semantic-lab/venv/**",
      "tests/.baseline-*",
      "**/*.min.js",
      "ios/CC98RebornShell/Resources/Reborn/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,cjs,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module"
    },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules: {
      "no-unused-vars": ["error", { vars: "local", args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-irregular-whitespace": ["error", { skipComments: true, skipTemplates: true }]
    }
  },
  {
    files: ["**/*.{cjs,mjs}", "tests/**/*.js"],
    languageOptions: { globals: globals.node }
  },
  {
    files: [
      "src/**/*.js",
      "popup/**/*.js",
      "experiments/question-mark/*.js",
      "experiments/post-context-draft/*.js",
      "experiments/semantic-lab/web/*.js",
      "experiments/topic-live-socket/browser-probe.js",
      "experiments/topic-live-socket/notification-wake.js",
      "ios/runtime/*.js",
      "question-service/public/**/*.js"
    ],
    languageOptions: {
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.worker,
        module: "readonly",
        require: "readonly",
        CC98RebornContentFilterCore: "readonly",
        CC98RebornConversation: "readonly",
        CC98RebornExtendedUbb: "readonly",
        CC98RebornTopicLiveApi: "readonly"
      }
    }
  },
  ...sharedScriptGlobals(),
  {
    files: ["release/0.3.7/intro/render.cjs"],
    // The screenshot builder evaluates this binding in the browser page.
    languageOptions: { globals: { document: "readonly" } }
  },
  {
    files: ["tests/**/*.{js,cjs}", "**/*.test.{js,cjs}"],
    // Browser tests pass functions into page.evaluate and isolated VM globals.
    // ESLint cannot resolve bindings in those deliberately separate contexts.
    rules: { "no-undef": "off" }
  }
];
