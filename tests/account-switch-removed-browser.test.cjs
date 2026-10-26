/* Real MV3 rollback/cleanup checks; synthetic accounts in a disposable profile. */
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/account-switch-rollback');
const origin = 'https://www.cc98.org';
const bindingKey = 'cc98RebornOpenIdBinding:v1';
const oldKeys = ['cc98RebornAccountVault:v1', 'cc98RebornAccountEpoch:v1', 'cc98RebornAccountsRevision:v1'];
const draftKey = 'cc98RebornDraft:v1:uid:101:reply:77';

async function main() {
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const errors = [], evidence = [];
  let context;
  async function launch() {
    context = await chromium.launchPersistentContext(profile, {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      headless: true, ignoreDefaultArgs: ['--disable-extensions'],
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
      viewport: { width: 390, height: 800 }
    });
    await context.setOffline(true);
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.origin === origin) return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Offline rollback fixture</title><p>Local fixture</p>' });
      return route.abort();
    });
    context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
    return context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  }
  async function seed(worker) {
    await worker.evaluate(async ({ bindingKey, oldKeys }) => {
      await chrome.storage.local.set({ [bindingKey]: { bound: true, userId: '101', userName: '本地测试甲', boundAt: 123, watermarkIdPrefix: 'fixture1', storageMode: 'local-readonly' }, cc98ComfortSettings: { enabled: true, themeMode: 'light', themeStyle: 'ascii' } });
      await chrome.storage.session.set({ [oldKeys[0]]: { version: 1, accounts: [{ syntheticOnly: true }] }, [oldKeys[1]]: 7, [oldKeys[2]]: 'fixture-revision', 'cc98RebornQuestionSession:v1': { token: 'fixture-question' }, unrelated: 'keep' });
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('cc98RebornAccountVault', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('state');
        request.onerror = () => reject(new Error('fixture setup failed'));
        request.onsuccess = () => {
          const db = request.result, transaction = db.transaction('state', 'readwrite');
          transaction.objectStore('state').put({ version: 2, accounts: [{ userId: '101', values: { accessToken: 'fixture-only' } }] }, 'accounts');
          transaction.oncomplete = () => { db.close(); resolve(); };
          transaction.onabort = () => { db.close(); reject(new Error('fixture write failed')); };
        };
      });
    }, { bindingKey, oldKeys });
  }
  async function state(worker) {
    return worker.evaluate(async ({ bindingKey, oldKeys }) => ({
      vault: (await indexedDB.databases()).some(db => db.name === 'cc98RebornAccountVault'),
      session: await chrome.storage.session.get([...oldKeys, 'cc98RebornQuestionSession:v1', 'unrelated']),
      binding: (await chrome.storage.local.get(bindingKey))[bindingKey],
      settings: (await chrome.storage.local.get('cc98ComfortSettings')).cc98ComfortSettings,
      runtimePresent: Boolean(globalThis.CC98RebornAccounts || globalThis.CC98RebornAccountVault)
    }), { bindingKey, oldKeys });
  }
  try {
    let worker = await launch();
    await worker.evaluate(() => removeRetiredAccountRecords());
    await seed(worker);
    await worker.evaluate(() => removeRetiredAccountRecords());
    const clean = await state(worker);
    assert.equal(clean.vault, false);
    for (const key of oldKeys) assert.equal(clean.session[key], undefined);
    assert.equal(clean.session['cc98RebornQuestionSession:v1'].token, 'fixture-question');
    assert.equal(clean.session.unrelated, 'keep');
    assert.equal(clean.binding.userId, '101');
    assert.equal(clean.settings.enabled, true);
    assert.equal(clean.runtimePresent, false);
    evidence.push('Real IndexedDB/session cleanup removes saved copies only; active binding, question session and settings remain');
    const page = await context.newPage();
    await page.goto(origin + '/rollback-fixture');
    await page.evaluate(({ draftKey }) => {
      localStorage.setItem('userInfo', 'obj-' + JSON.stringify({ id: 101, name: '本地测试甲' }));
      localStorage.setItem('accessToken', 'str-Bearer fixture-native');
      localStorage.setItem('cc98RebornDraftScope:v1', JSON.stringify({ version: 1, legacyOwner: '101' }));
      localStorage.setItem(draftKey, JSON.stringify({ key: draftKey, content: 'rollback draft fixture' }));
    }, { draftKey });
    await seed(worker);
    await context.close(); context = null;
    worker = await launch();
    // Startup runs cleanup automatically; do not call the function in this stage.
    let restored;
    for (let i = 0; i < 30; i++) {
      restored = await state(worker);
      if (!restored.vault) break;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(restored.vault, false);
    assert.equal(restored.binding.userId, '101');
    assert.equal(restored.runtimePresent, false);
    const after = await context.newPage();
    await after.goto(origin + '/rollback-fixture');
    const native = await after.evaluate(key => ({ user: localStorage.getItem('userInfo'), token: localStorage.getItem('accessToken'), draft: JSON.parse(localStorage.getItem(key)) }), draftKey);
    assert.equal(JSON.parse(native.user.slice(4)).id, 101);
    assert.equal(native.token, 'str-Bearer fixture-native');
    assert.equal(native.draft.content, 'rollback draft fixture');
    evidence.push('Actual browser restart automatically deletes retired durable vault and preserves native login and UID draft');
    const extensionId = new URL(worker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup/popup.html`);
    await popup.locator('#openidMeta').waitFor({ state: 'visible' });
    assert.equal(await popup.locator('.accounts-card, #accountsSave').count(), 0);
    assert.equal(await popup.locator('#openidBind').count(), 1);
    assert.match(await popup.locator('#openidMeta').innerText(), /101/);
    assert.equal(await popup.evaluate(() => chrome.runtime.sendMessage({ type: 'CC98_REBORN_ACCOUNTS_LIST' })), undefined);
    await popup.locator('.openid-card').scrollIntoViewIfNeeded();
    await popup.screenshot({ path: path.join(output, 'popup-after-removal.png') });
    evidence.push('Original OpenID UI remains, switching card and message API absent');
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'browser-validation.json'), JSON.stringify({ passed: true, syntheticOnly: true, evidence, browserRestarts: 1, errors }, null, 2));
    console.log('Account switch rollback: real MV3 cleanup, browser restart, login/draft preservation, original OpenID and removed UI/API passed');
  } finally {
    if (context) await context.close();
    const absolute = path.resolve(profile);
    assert(absolute.startsWith(path.resolve(output) + path.sep));
    await fs.rm(absolute, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
