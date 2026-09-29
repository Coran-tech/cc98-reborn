# Release Checklist

Current release target: `0.3.5.2`.

1. Confirm `manifest.json` version.
2. Run validation:

```powershell
node --check .\src\content.js
node --check .\src\extended-ubb-core.js
node --check .\src\extended-ubb.js
node --check .\src\markup-converter.js
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
```

For dual UBB editor changes, start the local forum simulator:

```powershell
node .\tests\local-forum\server.js
```

When `reference/Forum-main` and its local dependencies are available, run the
isolated simulator smoke test first:

```powershell
node .\tests\local-forum\smoke.test.js
```

Then visit `http://127.0.0.1:44303/__test/code-editor-regression.html` and
`http://127.0.0.1:44303/editor/postTopic/81`. Verify the 19 editor regression
cases, both editing surfaces, extended UBB popover, Markdown/math rendering,
table insertion, legacy preview, manual synchronization, emoji panel, and
leading-emoji spacing.

3. Build the zip:

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
- `src/extended-ubb-core.js`
- `src/extended-ubb.js`
- `src/extended-ubb.css`
- `src/markup-converter.js`
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

The release includes the active CC98 OpenID authorization code + PKCE flow for direct CC98 and WebVPN sessions. Binding must match the current CC98 web-account UID. Only the local identity summary and watermark prefix captured at binding time are retained; access and refresh tokens are not persisted. Periodic profile refresh code remains disabled.

The experimental question reaction is off by default and currently supports OpenID authorization only on direct CC98 pages. Its independent HTTPS service receives a signed OpenID ID Token during question authorization, plus numeric topic/floor IDs for queries and toggles. Check the popup privacy link and the consent dialog before distribution. This local package does not deploy or guarantee uptime of the external service; uploading the ZIP to a store or release is a separate manual step.
