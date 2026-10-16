const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { chromium } = require('playwright');
const localForum = require('./local-forum-path.cjs');

async function main() {
  const root = path.resolve(__dirname, '..');
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'manifest.json'), 'utf8'));
  const runtime = await fs.mkdtemp(path.join(os.tmpdir(), 'cc98-build-version-'));
  const origin = 'http://127.0.0.1:44346';
  const server = spawn(process.execPath, [localForum.serverPath], { cwd: root,
    env: { ...process.env, ...localForum.environment, CC98_LOCAL_PORT: '44346', CC98_LOCAL_REQUIRE_AUTH: '0', CC98_LOCAL_NATIVE_FRONTEND: '0', CC98_TEST_BUILD: 'label-regression',
      CC98_LOCAL_DATA_PATH: path.join(runtime, 'data.json'), CC98_LOCAL_UPLOAD_ROOT: path.join(runtime, 'uploads'), CC98_LOCAL_BACKUP_ROOT: path.join(runtime, 'backups') }, stdio: ['ignore', 'pipe', 'pipe'] });
  let browser, logs = '';
  server.stdout.on('data', b => { logs += b; }); server.stderr.on('data', b => { logs += b; });
  try {
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(origin + '/__test/health')).ok) break; } catch {}
      if (i === 79) throw new Error(logs);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(origin + '/topic/6500000/1');
    await page.locator('[data-post-floor="1"]').waitFor();
    const expected = `beta ${manifest.version} (build label-regression)`;
    assert.equal(await page.locator('.cc98-rebuild-hero .cc98-rebuild-kicker').first().textContent(), `Reborn View · ${expected}`);
    const state = await page.evaluate(() => ({ manifest: chrome.runtime.getManifest() }));
    assert.equal(state.manifest.version_name, expected);
    assert.equal(state.manifest.version, manifest.version);
    const status = await page.evaluate(() => chrome.runtime.sendMessage({ type: 'CC98_REBORN_GET_UPDATE_STATUS' }));
    assert.equal(status.currentVersion, manifest.version); assert.equal(status.latestVersion, manifest.version); assert.equal(status.hasUpdate, false);
    assert.deepEqual(errors, []);
    const result = { displayVersion: expected, numericVersion: manifest.version, localPageLabelPassed: true, numericUpdateComparisonPassed: true, errors };
    await fs.writeFile(path.join(root, 'outputs/build-version-validation.json'), JSON.stringify(result, null, 2));
    console.log(result);
  } finally { if (browser) await browser.close(); server.kill(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
