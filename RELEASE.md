# Release Checklist

1. Confirm `manifest.json` version.
2. Run validation:

```powershell
node --check .\src\content.js
node --check .\src\background.js
node --check .\src\watermark-bridge.js
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
- `popup/`
- `src/background.js`
- `src/content.js`
- `src/styles.css`
- `README.md`
- `README.zh-CN.md`
- `CHANGELOG.md`
- `LICENSE`
- `PRIVACY.md`

## Notes

The watermark implementation is intentionally dormant until OAuth is wired. Do not add `src/watermark-bridge.js` back to `manifest.json` until the official authorization flow is ready.
