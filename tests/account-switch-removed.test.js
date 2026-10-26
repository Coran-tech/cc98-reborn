const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const background = read('src/background.js');
const content = read('src/content.js');

async function main() {
  const manifest = JSON.parse(read('manifest.json'));
  assert(!JSON.stringify(manifest).includes('account-drafts.js'));
  assert.doesNotMatch(read('popup/popup.html'), /accounts-card|accountsSave|account-switch\.js/);
  assert.doesNotMatch(read('popup/popup.css'), /\.accounts-/);
  for (const file of ['src/background.js', 'src/content.js', 'src/topic-search.js', 'src/semantic-filter.js', 'experiments/question-mark/background.js']) {
    assert.doesNotMatch(read(file), /CC98RebornAccounts|CC98_REBORN_ACCOUNTS_|cc98AccountPageOperation|CC98RebornAccountDrafts|prepareAccountSwitch/);
  }
  for (const file of ['src/account-switch-background.js', 'src/account-switch-page.js', 'src/account-vault.js', 'src/account-drafts.js', 'popup/account-switch.js']) {
    assert(!fs.existsSync(path.join(root, file)), file + ' must be removed');
    assert(!read('scripts/package-extension.ps1').includes(path.basename(file)));
  }
  const cleanupSource = background.slice(background.indexOf('async function removeRetiredAccountRecords()'), background.indexOf('\nremoveRetiredAccountRecords().catch'));
  assert(cleanupSource.length > 200);
  const session = new Map([
    ['cc98RebornAccountVault:v1', { syntheticSecret: 'fixture-only' }],
    ['cc98RebornAccountEpoch:v1', 7], ['cc98RebornAccountsRevision:v1', 'fixture'],
    ['cc98RebornQuestionSession:v1', { token: 'separate-fixture' }], ['unrelated', 'keep']
  ]);
  const local = { 'cc98RebornOpenIdBinding:v1': { bound: true, userId: '101' }, cc98ComfortSettings: { enabled: true } };
  let deleted = '', fail = false;
  const chrome = { runtime: { lastError: null }, storage: {
    session: { remove(keys, callback) {
      if (fail) chrome.runtime.lastError = { message: 'fixture failure' };
      else keys.forEach(key => session.delete(key));
      callback(); chrome.runtime.lastError = null;
    } }, local
  } };
  const context = vm.createContext({ chrome, Promise, Error, indexedDB: { deleteDatabase(name) {
    deleted = name;
    const request = {}; queueMicrotask(() => request.onsuccess()); return request;
  } } });
  vm.runInContext(cleanupSource, context);
  await context.removeRetiredAccountRecords();
  assert.equal(deleted, 'cc98RebornAccountVault');
  assert.deepEqual([...session.keys()], ['cc98RebornQuestionSession:v1', 'unrelated']);
  assert.equal(local['cc98RebornOpenIdBinding:v1'].userId, '101');
  assert.equal(local.cc98ComfortSettings.enabled, true);
  fail = true;
  await assert.rejects(context.removeRetiredAccountRecords(), /retired-account-cleanup-failed/);
  fail = false;
  await context.removeRetiredAccountRecords();

  const keySource = content.slice(content.indexOf('function getNativeEditorDraftKey(editor)'), content.indexOf('\nfunction getNativeEditorDraftPageKey(editor)'));
  const pageKey = 'cc98RebornDraft:v1:reply:77', values = new Map();
  const draft = vm.createContext({ EDITOR_DRAFT_STORAGE_PREFIX: 'cc98RebornDraft:v1:',
    getNativeEditorDraftPageKey: () => pageKey,
    localStorage: { getItem: key => values.get(key) ?? null } });
  vm.runInContext(keySource, draft);
  assert.equal(draft.getNativeEditorDraftKey({}), pageKey, 'untouched legacy caller');
  values.set('cc98RebornDraftScope:v1', JSON.stringify({ version: 1, legacyOwner: '101' }));
  values.set('userInfo', 'obj-' + JSON.stringify({ id: 101 }));
  values.set('cc98RebornDraft:v1:uid:101:reply:77', 'new A draft');
  values.set('cc98RebornDraft:v1:uid:102:reply:77', 'new B draft');
  values.set(pageKey, 'older legacy A draft');
  assert.equal(values.get(draft.getNativeEditorDraftKey({})), 'new A draft');
  values.set('userInfo', 'obj-' + JSON.stringify({ id: 102 }));
  assert.equal(values.get(draft.getNativeEditorDraftKey({})), 'new B draft');
  values.delete('userInfo');
  assert.equal(draft.getNativeEditorDraftKey({}), '', 'guest must not adopt legacy draft');
  values.set('cc98RebornDraftScope:v1', '{bad');
  assert.equal(draft.getNativeEditorDraftKey({}), '', 'corrupt marker must not expose another account draft');
  console.log('Account switch removal: entry points absent, precise credential cleanup, retry, OpenID/settings preservation and scoped-draft compatibility passed');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
