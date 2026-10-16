const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/quote-blacklist-preview');
const header = (user, uid = '') => `<b>以下是引用1楼：用户${uid ? `<a href="/user/id/${uid}">${user}</a>` : user}在2026-10-16 12:00:00的发言：<a href="/topic/100/1#1">&gt;&gt;查看原帖&lt;&lt;</a></b>`;
const quote = (user, text, uid) => `<blockquote>${header(user, uid)}<p>${text}</p></blockquote>`;
async function main() {
  const fixture = await fs.readFile(path.join(root, 'tests/quote-image-fragments.test.cjs'), 'utf8');
  const { shell, origin } = new Function('require', '__dirname', fixture.split('async function main()')[0] + ';return {shell,origin};')(require, path.join(root, 'tests'));
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let checks = 0;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/*', async route => {
      const url = new URL(route.request().url()); requests.push(url.href);
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/topic/100/1') return route.fulfill({ contentType: 'text/html', body: shell(false) });
      if (url.pathname.startsWith('/fixture/')) return route.fulfill({ path: path.join(root, 'assets/icon128.png') });
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
      if (!file.startsWith(root + path.sep)) return route.abort();
      try {
        if (url.pathname === '/src/content.js') {
          const code = await fs.readFile(file, 'utf8');
          return route.fulfill({ contentType: 'text/javascript', body: code.slice(0, code.lastIndexOf('\narmInitialRebuildTransitionVeil();')) });
        }
        return await route.fulfill({ path: file });
      } catch { return route.abort(); }
    });
    await page.goto(origin + '/topic/100/1');
    await page.locator('.cc98-rebuild-post-body').waitFor();
    const cases = [
      { name: 'plain username', html: '自己的正文' + quote('Bad Name', 'SECRET-A'), absent: ['SECRET-A'], present: ['自己的正文'] },
      { name: 'nested child', html: quote('Good', '父级文字' + quote('Bad Name', 'SECRET-B') + '父级结尾'), absent: ['SECRET-B'], present: ['父级文字', '父级结尾', '用户Good'] },
      { name: 'blocked parent', html: quote('Bad Name', 'SECRET-C' + quote('Good', 'SECRET-NESTED')), absent: ['SECRET-C', 'SECRET-NESTED'] },
      { name: 'flat oldest blocked', html: `<div style="background-color:#f5faff">${header('Bad Name')}<p>SECRET-D</p>${header('Good')}<p>正常第二段</p></div>`, absent: ['SECRET-D'], present: ['正常第二段', '用户Good'] },
      { name: 'flat newest blocked', html: `<div style="background-color:#f5faff">${header('Good')}<p>正常第一段</p>${header('Bad Name')}<p>SECRET-E</p></div>`, absent: ['SECRET-E'], present: ['正常第一段', '用户Good'] },
      { name: 'flat both blocked', html: `<blockquote>${header('Bad Name')}<p>SECRET-F</p>${header('Bad Name')}<p>SECRET-G</p></blockquote>`, absent: ['SECRET-F', 'SECRET-G'] },
      { name: 'exact name only', html: quote('Bad Name2', '相似用户名保留'), present: ['相似用户名保留'] },
      { name: 'ordinary prose and code', html: '<p>Bad Name 在普通正文中出现</p><pre><code>' + header('Bad Name') + '原样代码</code></pre><blockquote>只是提到 Bad Name，并非引用作者</blockquote>', present: ['普通正文中出现', '原样代码', '并非引用作者'] },
      { name: 'explicit UID', rules: 'UID:123', html: quote('OnlyUid', 'SECRET-UID', '123'), absent: ['SECRET-UID'] },
      { name: 'body profile link is not author', rules: '123', html: quote('Good', '<a href="/user/id/123">Other</a>正常内容'), present: ['正常内容'] },
      { name: 'known public UID', rules: '123', known: { userId: '123', userName: 'Known', isAnonymous: false }, html: quote('Known', 'SECRET-KNOWN'), absent: ['SECRET-KNOWN'] },
      { name: 'anonymous identity stays private', rules: '123', known: { userId: '123', userName: 'AnonymousName', isAnonymous: true }, html: quote('AnonymousName', '无公开对应时保留'), present: ['无公开对应时保留'] },
      { name: 'unresolved UID stays conservative', rules: '123', html: quote('Unknown', '无 UID 的引用保留'), present: ['无 UID 的引用保留'] }
    ];
    for (const test of cases) {
      const result = await page.evaluate(test => {
        lastSettings = { ...lastSettings, blockedUserIds: test.rules || 'Bad Name' };
        capturedTopicPostsById.clear(); quoteBlacklistIdentityCache = null;
        if (test.known) capturedTopicPostsById.set('100:99', test.known);
        const source = document.createElement('article'); source.innerHTML = test.html;
        const original = source.innerHTML;
        const content = sanitizePostContent(source);
        const card = renderPostCard({ ...fixtureItems[0], id: test.name, user: 'Allowed', uid: '200', content, text: '' });
        document.querySelector('#cc98-comfort-app').replaceChildren(card);
        const body = card.querySelector('.cc98-rebuild-post-body');
        const filtered = body.textContent;
        const once = body.innerHTML;
        filterBlacklistedQuotes(body);
        const stable = body.innerHTML === once;
        lastSettings.blockedUserIds = ''; filterBlacklistedQuotes(body);
        return { filtered, restored: body.textContent, sourceUnchanged: original === source.innerHTML, stable };
      }, test);
      for (const text of test.absent || []) { assert(!result.filtered.includes(text), test.name + ': ' + result.filtered); assert(result.restored.includes(text), test.name + ': restore'); }
      for (const text of test.present || []) assert(result.filtered.includes(text), test.name + ': ' + result.filtered);
      assert(result.sourceUnchanged && result.stable, test.name + ': source/idempotence'); checks++;
    }
    const events = await page.evaluate(html => {
      lastSettings.blockedUserIds = 'Bad Name';
      const root = document.createElement('div'); root.innerHTML = html;
      const button = document.createElement('button'); button.textContent = '隐藏图片控制';
      let clicks = 0; button.addEventListener('click', () => clicks++); root.querySelector('blockquote').append(button);
      filterBlacklistedQuotes(root); const hidden = !root.contains(button);
      lastSettings.blockedUserIds = ''; filterBlacklistedQuotes(root); button.click();
      return { hidden, restored: root.contains(button), clicks };
    }, quote('Bad Name', '事件恢复'));
    assert.deepEqual(events, { hidden: true, restored: true, clicks: 1 }); checks++;
    const publicContext = await page.evaluate(html => {
      lastSettings.blockedUserIds = '123'; quoteBlacklistIdentityCache = null;
      const root = document.createElement('div'); root.innerHTML = html;
      filterBlacklistedQuotes(root, [{ uid: '123', user: 'ContextUser' }]);
      const first = !root.textContent.includes('CONTEXT-SECRET');
      filterBlacklistedQuotes(root);
      return first && !root.textContent.includes('CONTEXT-SECRET');
    }, quote('ContextUser', 'CONTEXT-SECRET'));
    assert(publicContext, 'retained conversation content preserves its public author context'); checks++;
    await page.addScriptTag({ path: path.join(root, 'src/extended-ubb-core.js') });
    await page.addScriptTag({ path: path.join(root, 'src/extended-ubb.js') });
    const replies = await page.evaluate(() => {
      lastSettings.blockedUserIds = 'Bad Name';
      const router = document.createElement('div');
      const content = document.createElement('div'); content.className = 'user-post-content';
      const link = document.createElement('a'); link.href = '/topic/100';
      link.textContent = '[quote]以下是引用1楼：用户Bad Name在2026-10-16 12:00:00的发言：\nSECRET-REPLY[/quote]\n自己的回复';
      content.append(link); router.append(content); stabilizeUserReplyUbbContents(router);
      return router.textContent;
    });
    assert(!replies.includes('SECRET-REPLY') && replies.includes('自己的回复')); checks++;
    await page.evaluate(html => {
      lastSettings.blockedUserIds = 'Bad Name';
      document.querySelector('.native .reply article').innerHTML = html;
      fixtureItems = getPostItems();
      document.querySelector('#cc98-comfort-app').replaceChildren(...fixtureItems.map(renderPostCard));
    }, quote('Bad Name', 'SECRET-DIALOG') + quote('Good', '可见引用') + '自己的正文');
    await page.locator('.cc98-rebuild-conversation-action').click();
    await page.waitForFunction(() => document.querySelector('.cc98-rebuild-conversation-status')?.textContent.startsWith('查找完成'));
    const body = page.locator('[data-conversation-key="100:1"] .cc98-rebuild-conversation-body');
    assert(!(await body.textContent()).includes('SECRET-DIALOG'));
    assert((await body.textContent()).includes('可见引用')); checks++;
    assert(await page.evaluate(() => {
      const reader = CC98RebornConversation.createReader({ topicId: '100', maxKnown: 1 }, { capture: false });
      const raw = [...reader.cachedPages().values()].some(page => page.records.some(record => record.contentHtml.includes('SECRET-DIALOG')));
      reader.dispose(); return raw;
    }), 'shared page cache retains original text independently of display filtering'); checks++;
    await page.evaluate(() => applySettings({ ...lastSettings, blockedUserIds: '' }));
    assert((await body.textContent()).includes('SECRET-DIALOG')); checks++;
    await page.evaluate(() => applySettings({ ...lastSettings, blockedUserIds: 'Bad Name' }));
    assert(!(await body.textContent()).includes('SECRET-DIALOG')); checks++;
    await fs.mkdir(output, { recursive: true });
    await body.locator('summary').evaluateAll(nodes => nodes.forEach(node => { node.parentElement.open = true; }));
    await page.addStyleTag({ path: path.join(root, 'src/interface-styles.css') });
    for (const style of ['modern', 'ascii']) for (const tone of ['light', 'dark']) {
      await page.evaluate(({ tone, style }) => { applySettings({ ...lastSettings, themeMode: tone, themeStyle: style }); document.documentElement.dataset.cc98ComfortStyle = style; }, { tone, style });
      assert(!(await body.textContent()).includes('SECRET-DIALOG'));
      await page.screenshot({ path: path.join(output, style + '-' + tone + '.png'), fullPage: true });
    }
    assert.deepEqual(errors, []);
    const result = { checks, nestedAndFlatQuotesPassed: true, sourceAndMediaEventsPreserved: true, userRepliesAndConversationPassed: true, liveBlacklistRestorePassed: true, errors };
    await fs.writeFile(path.join(output, 'validation.json'), JSON.stringify(result, null, 2)); console.log(result);
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
