# Release Checklist

1. Confirm `manifest.json` version.
2. Run validation:

```powershell
node --check .\src\content.js
node --check .\src\background.js
node --check .\src\page-submit-monitor.js
node --check .\popup\popup.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); console.log('manifest ok')"
```

3. Build the zip:

```powershell
.\scripts\package-extension.ps1
```

4. Upload `dist/cc98-reborn-<version>.zip` to the Chrome Web Store or a GitHub Release.

## Included Runtime Files

- `manifest.json`
- `assets/`
- `images/`
- `popup/`
- `src/background.js`
- `src/content.js`
- `src/page-submit-monitor.js`
- `src/styles.css`
- `README.md`
- `README.zh-CN.md`
- `CHANGELOG.md`
- `LICENSE`
- `PRIVACY.md`

## Notes

The release includes the active CC98 OpenID authorization code + PKCE flow. Binding must match the current CC98 web-account UID. Only the local identity summary and watermark prefix are retained; access and refresh tokens are not persisted.
