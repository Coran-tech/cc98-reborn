# Release Checklist

Current release target: `0.3.9`.

1. Confirm `manifest.json` version.
2. Run validation:

```powershell
node --check .\src\content.js
node --check .\src\theme-core.js
node --check .\src\interface-style.js
node --check .\src\extended-ubb-core.js
node --check .\src\extended-ubb.js
node --check .\src\markup-converter.js
node --check .\src\conversation-core.js
node --check .\src\conversation.js
node --check .\src\topic-search.js
node --check .\src\topic-drawer.js
node --check .\src\favorite-share-core.js
node --check .\src\favorite-share-service.js
node --check .\src\favorite-share.js
node --check .\src\user-notes-core.js
node --check .\src\user-notes.js
node --check .\src\background.js
node --check .\src\openid-webvpn-bridge.js
node --check .\src\page-submit-monitor.js
node --check .\popup\popup.js
node --check .\experiments\question-mark\background.js
node --check .\experiments\question-mark\content.js
node --check .\experiments\question-mark\admin-key-store.js
node --check .\experiments\question-mark\admin.js
node --check .\tests\local-static-server.cjs
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
node .\tests\page-submit-monitor.test.js
node .\tests\openid-refresh.test.js
node .\tests\extended-ubb-core.test.js
node .\tests\markup-converter-core.test.js
node .\tests\question-mark-integration.test.js
node .\tests\conversation-core.test.js
node .\tests\media-resource-url.test.js
node .\tests\favorite-share-core.test.js
node .\tests\favorite-share-service.test.js
node .\tests\user-notes-core.test.js
node .\tests\theme-core.test.js
```

For dual UBB editor changes, start the local forum simulator:

```powershell
node ..\cc98-local-forum\server.js
```

For first-page background prewarming, run `node .\tests\first-page-prewarm.test.cjs`
with Playwright and Edge. It covers delayed static responses, rendered SPA and
anonymous authors, failed reads, cancellation, the disabled option and native
UI mode. The current page must remain readable without overlays, navigation,
scroll/selection changes or editor replacement; other pages reuse the recent read.

For refresh/navigation stability, run `node .\tests\page-transition-stability.test.cjs`.
Its 14 browser groups cover Modern/ASCII cold loads, delayed reloads and SPA content,
unchanged follow-up timers, visible reading anchors, rapid consecutive navigation
and disabling during loading. Every sampled frame must retain one active shell
while a destination is pending; cold loads show the plugin shell immediately,
retain its shell/navigation nodes when content arrives, and keep native content
hidden in every sampled frame. Stale floors must not be published on a new route.

For theme changes, run `node .\tests\theme.test.cjs` with Playwright and Edge.
It checks real popup/page scripts, legacy migration, independent palettes,
local-time boundaries, storage synchronization, color contrast, and preservation
of existing post nodes, editor drafts, selection and scroll during switching.
Also run `node .\tests\page-theme-elements.test.cjs` to check computed colors of
forum navigation, primary actions, tags, quotes and supporting actions in all
preset combinations and extreme custom colors, while preserving status colors
and user-specified UBB colors. Check color-picker/HEX persistence, input
validation, switching back to presets, and cleanup when the extension is disabled.

For topbar layout changes, run `node .\tests\topbar-layout.test.cjs` to check
centered horizontal navigation on wide message/home pages, narrow viewports,
and the fixed left efficiency bar.

For interface-style changes, run `node .\tests\ascii-style.test.cjs` with
Playwright and Edge. It checks real popup/content scripts, style/tone/palette
independence, native actions, responsive character frames, two-column posts,
compact topic rows, left navigation, dialogs, dynamic content, draft/selection
preservation and cleanup. The included `tests/ascii-overlays.cjs` checks rank
movement labels at wide/narrow widths in both tones, nested square frames,
author follow actions, search menus, image zoom/navigation/close, body-mounted
native dialog state/listeners, the settings popup and restoration to Reborn.
Authored content must retain its formatting, and positioning transforms must
remain intact. Run `node .\tests\table-paste-selection.test.cjs --ascii`
and `node .\tests\private-message-sidebar.test.cjs --ascii` for the editor and
message layouts. Run `node .\tests\vote-editor.test.cjs --ascii` to check square
draft/mode/toolbar surfaces, ASCII command labels, font/color menus, draft
restore/clear and responsive wrapping in both tones, with native labels and
Markdown switching preserved. The real MV3 personal-center regression checks the selector
and style backup/restore from its embedded settings page.

For private-message emoji changes, run `node .\tests\private-message-emoji.test.cjs`
with Playwright and Edge. It checks first render, conversation replacement,
new messages, lazy and responsive sources, size and tone changes, while keeping
ordinary pictures, avatars, drafts, caret positions and scroll intact. All
requests use local fixtures.
For recent-contact layout, run `node .\tests\private-message-sidebar.test.cjs`.
Check compact rows against native forum markup/styles, two-line previews,
long names, unread/selection states, scrolling and load-more behavior in both
tones and narrow sidebar widths.
For message pagination styling, run `node .\tests\message-pagination.test.cjs`
to check native page/Go links, validated jump destinations, matching rounded
controls, current/hover/focus states, theme colors and wrapping at narrow widths.
For the personal-center settings page, run `node .\tests\user-settings-page.test.cjs`
with the bundled Chromium/Playwright runtime. It loads a real temporary MV3
extension against local forum fixtures and checks web-accessible framing,
popup parity, shared storage, routing/history, disabled-state recovery,
layout/height and mocked account/update/data-cleanup actions.

For personal-center reply rendering, run `node .\tests\user-reply-quotes.test.cjs`
with Playwright and Edge. Local fixtures cover multiline/nested quotes, literal
code, images/emoji, theme colors, narrow layouts, async list replacement and
native original-post/whole-reply navigation. `--baseline` reproduces the old
line renderer's literal quote markers.

For private-message pins, run `node .\tests\private-message-pins.test.cjs` and
`node .\tests\private-message-sidebar.test.cjs` with Playwright and Edge. Check
pin/unpin, reload, cross-tab sync, missing-contact shortcuts, account isolation
and preservation of native rows, unread state, selection and drafts.
`node .\tests\settings-backup-core.test.js` validates backup scope, credentials
exclusion, malformed files and account keys; the real MV3 settings-page test
also covers export, import preview/cancel, storage restoration and popup sync.

For vote-topic adaptation, run `node .\tests\vote-editor.test.cjs` with Playwright
and Edge. The fixture follows the saved native vote form and original forum
components. It checks native-button/legacy-link entry points, disabled states,
delayed editor mount, option limits/add/remove, validation failure recovery,
title/body draft isolation, tone/width changes, Markdown mode and a locally
mocked vote POST. Also run the shared table-paste regression when editor layout
rules change. No real forum posts are created by these tests.

With Playwright and Edge installed, run `node .\tests\table-paste-selection.test.cjs`
to check visual-table paste after caret-only cell navigation, including the
signature editor. This test serves local fixtures and does not contact CC98.

When the sibling `cc98-local-forum` project and its frontend dependencies are available, run the
isolated simulator smoke test first:

```powershell
node ..\cc98-local-forum\smoke.test.js
```

For post images and conversation changes, with Playwright and Edge installed:

```powershell
node .\tests\post-lazy-media.test.cjs
node .\tests\post-lazy-media.test.cjs --late-content --drop-snapshots
node .\tests\conversation-native.test.cjs
node .\tests\conversation.test.cjs
node .\tests\quote-image-fragments.test.cjs
```

The lazy-media regression checks first load, pagination, images below the fold,
repeated URLs, legacy uploads, hidden images and recovery when the message bridge
is interrupted. It starts an isolated local forum with a temporary database.
The quote-image regression reproduces partially rendered Markdown image links,
then checks fragment/download-card cleanup, nested quotes, preserved attachments
and literal code, lazy/hidden media, light/dark layouts and the conversation
image viewer. All page and media requests are fulfilled by offline fixtures.

For favorite sharing, run `node .\tests\favorite-share.test.cjs` with the same
browser runtime. It intercepts all favorite writes in local fixtures and checks
full pagination, destination selection, existing-favorite preservation, retry,
cancellation, invalid input, and authentication/rate-limit pauses.

For local user notes, run `node .\tests\user-notes.test.cjs` with Playwright and
Edge installed. Verify editing from followings and profile pages, original
usernames, post badges, account isolation, UID-based rename matching, local
persistence, storage failures, and light/dark narrow layouts.
Then run `node .\tests\user-notes-integration.test.cjs` to verify the same flow
through the local forum's real post/profile renderer and extension hooks.

Then visit `http://127.0.0.1:44303/__test/code-editor-regression.html` and
`http://127.0.0.1:44303/editor/postTopic/81`. Verify the 19 editor regression
cases, both editing surfaces, extended UBB popover, Markdown/math rendering,
table insertion, legacy preview, manual synchronization, emoji panel, and
leading-emoji spacing.

3. Build the zip:

For a test package, use `./scripts/package-extension.ps1 -TestBuild` (optional
`-Build xxx`). Its display version is `beta <version> (build <id>)`.
It always overwrites `dist/cc98-reborn-beta/` and `dist/cc98-reborn-beta.zip`;
load that fixed directory once and reload the extension after each build.
Before testing the unpackaged source checkout, run `./scripts/set-test-build.ps1`
to stamp a fresh display label. The independent simulator generates its own build at startup.
The default release command below removes `version_name` from the staged
manifest, retaining the numeric `version` and stable extension key. Packaging
must not change the source manifest. Compare release manifests against the
source with `version_name` omitted; all other packaged runtime files must match.
Run `node tests/build-version.test.cjs` to verify the simulator's visible build
label and numeric update status. The real MV3 settings test also checks the
popup, embedded settings and update card display the manifest's same label.

```powershell
.\scripts\package-extension.ps1
```

The script also keeps `dist/cc98-reborn-<version>/` as a clean unpacked
extension for Edge/Chrome developer-mode testing. Load that directory rather
than the repository root; development-only `reference/`, `tests/`, and their
third-party fixtures are intentionally excluded.

4. Upload `dist/cc98-reborn-<version>.zip` to the Chrome Web Store or a GitHub Release.

## Included Runtime Files

- `manifest.json`
- `assets/`
- `images/`
- `popup/`
- `src/background.js`
- `src/content.js`
- `src/theme-core.js`
- `src/theme-tokens.css`
- `src/interface-style.js`
- `src/interface-styles.css`
- `src/extended-ubb-core.js`
- `src/extended-ubb.js`
- `src/extended-ubb.css`
- `src/markup-converter.js`
- `src/conversation-core.js`
- `src/conversation.js`
- `src/topic-search.js`
- `src/topic-search.css`
- `src/favorite-share-core.js`
- `src/favorite-share-service.js`
- `src/favorite-share.js`
- `src/user-notes-core.js`
- `src/user-notes.js`
- `src/user-notes.css`
- `src/private-message-pins-core.js`
- `src/private-message-pins.js`
- `src/settings-backup-core.js`
- `src/openid-webvpn-bridge.js`
- `src/page-submit-monitor.js`
- `src/styles.css`
- `src/vendor/` (Showdown, KaTeX, KaTeX fonts, and bundled licenses)
- `experiments/question-mark/` (six extension runtime files; no local test server or database)
- `README.md`
- `CHANGELOG.md`
- `LICENSE`
- `PRIVACY.md`

## Notes

For conversation changes, run `node tests/conversation.test.cjs` and
`node tests/conversation-native.test.cjs` with Playwright available. These
cover cross-page and cross-topic ancestors, native flattened quotes, Markdown,
reply branches, missing floors, retry/cancellation, immediate whole-topic cache
reuse after switching floors, full-document pagination/reload/browser Back,
tab-session snapshots and corrupt-cache recovery, partial 40-page scans across
reload, account isolation, manual
refresh with stale foreground snapshots, and preservation
of the foreground page. The native test uses its own temporary local database.
Check the dialog in both tones and a narrow viewport before packaging.

For in-topic full-text search, run `node tests/topic-search.test.cjs`. It covers
the favorite-adjacent entry, confirmation before page reads, close-to-background
behavior, shared conversation cache/serial queue and request spacing, literal
matching/highlights, quote inclusion, safe snippets and existing user filtering,
source/draft/scroll and toolbar-width preservation,
result links, Modern/ASCII light/dark layouts, fresh-read retry, frozen-document
restoration, pause/continue, same-topic pagination recovery and account isolation.
The native conversation regression also exercises search on real rendered UBB.
Username/UID and emotion-code search checks cover anonymous identity protection,
all bundled emotion families, light/dark AC variants, lazy image sources, literal
codes, quote inclusion and safe highlighted snippets while reusing cached pages.

For performance changes, run `node tests/performance-regression.test.cjs` with
Playwright and Edge. The offline 40-post fixture checks that repeated syncs
retain cards/drafts/caret without reconstructing existing floors; appending a
floor creates exactly one card, idle Ant lists stop scheduling their own updates,
and editing does not trigger full-document ASCII scans. New native list items,
dialogs and ASCII decorations must still appear. Compare timing only within
the same fixture and machine; the call-count checks are the stable regression.

For the topic drawer, run `node tests/topic-drawer.test.cjs` with full Chromium
and Playwright. It loads the actual MV3 extension and unchanged native React
frontend against a temporary local backend, verifying targeted iframe injection,
real pagination and a persisted native reply, unchanged parent DOM/scroll/draft,
pointer/keyboard resizing, Modern/ASCII/narrow layouts, and teardown on close or
disable. Unmarked hidden probes must receive neither a full runtime nor the
MAIN-world reply/media bridge. Reload the extension after adding `scripting`.

The release includes the active CC98 OpenID authorization code + PKCE flow for direct CC98 and WebVPN sessions. Binding must match the current CC98 web-account UID. Only the local identity summary and watermark prefix captured at binding time are retained; access and refresh tokens are not persisted. Periodic profile refresh code remains disabled.

The experimental question reaction is off by default and currently supports OpenID authorization only on direct CC98 pages. Its independent HTTPS service receives a signed OpenID ID Token during question authorization, plus numeric topic/floor IDs for queries and toggles. Check the popup privacy link and the consent dialog before distribution. This local package does not deploy or guarantee uptime of the external service; uploading the ZIP to a store or release is a separate manual step.
