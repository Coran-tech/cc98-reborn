const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/topic-lock-reason-20261104/qa');
const origin = 'https://www.cc98.org';
const selector = '#cc98-comfort-app .cc98-rebuild-topic-locked-card';
const reason = '心灵不允许一两句话帖，锁沉不是处罚补充内容就好';
const quoted = '该帖已被锁定（锁定原因：这只是用户引用的文字）';
const full = `该帖已被锁定（锁定原因：${reason}）`;
const notice = text => `<div id="native-lock" style="color:red;margin:0.5rem">${text}</div>`;

function fixture(initial) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>锁帖测试 - CC98论坛</title>
    ${['theme-tokens.css','styles.css','interface-styles.css'].map(file=>`<link rel="stylesheet" href="/src/${file}">`).join('')}</head><body>
    <div id="root"><div class="topBar"><a href="/">CC98</a></div><div class="center"><div class="column" id="lock-slot"><div class="row"><div class="pagination"><div class="page-nav"><a href="/topic/6500000/1">1</a></div></div></div>
    ${initial ? notice(initial) : ''}</div><div class="topicInfo-info"><h1 id="essay1">锁帖测试</h1><button class="followTopic">收藏</button></div>
    <div class="reply" data-floor="1" id="reply_1"><a href="/user/id/1001">测试用户</a><span class="reply-floor">1</span>
      <div class="reply-content"><div class="substance"><article><p>正文与引用均属于用户内容。</p><blockquote><p>${quoted}</p></blockquote></article></div></div>
      <div class="signature"><p>${quoted}</p></div><div class="reply-footer"><button>引用</button></div></div>
    <div class="column"><div class="pagination"><div class="page-nav"><a href="/topic/6500000/1">1</a></div></div></div></div></div>
    ${['theme-core.js','interface-style.js','conversation-core.js','conversation.js','content.js'].map(file=>`<script src="/src/${file}"></script>`).join('')}</body></html>`;
}

async function main() {
  await fs.mkdir(output, {recursive:true});
  const browser = await chromium.launch({executablePath:await executable(),headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:850}});
  const page = await context.newPage(), errors = [], checks = [];
  page.setDefaultTimeout(7000);
  page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(()=>{
    window.chrome={runtime:{getManifest:()=>({version:'0.4.3'}),getURL:p=>new URL('/'+p,location.origin).href,onMessage:{addListener(){}},sendMessage:(m,c)=>{c?.({ok:false});return Promise.resolve({ok:false})}},storage:{local:{get:(keys,c)=>{const value={cc98ComfortSettings:{enabled:true,rebuildUi:true,themeStyle:'modern',themeMode:'light',previsitFirstPageForTopicImages:false,prewarmPostImages:false}};c?.(value);return Promise.resolve(value)},set:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener(){}}}};
  });
  let initial = full;
  await context.route('**/*', async route=>{
    const u=new URL(route.request().url());
    if(u.origin===origin && u.pathname==='/topic/6500000')return route.fulfill({contentType:'text/html',body:fixture(initial)});
    if(u.origin===origin && /^\/src\/[\w.-]+$/.test(u.pathname))return route.fulfill({path:path.join(root,u.pathname)});
    return route.fulfill({status:204,body:''});
  });
  const card=page.locator(selector);
  async function open(text) {
    initial=text;await page.goto(origin+'/topic/6500000');
    await page.locator('#cc98-comfort-app [data-post-floor="1"]').waitFor();
  }
  async function shows(text) {
    await page.waitForFunction(({selector,text})=>document.querySelector(selector)?.textContent.includes(text),{selector,text},{timeout:6500});
    assert.equal(await card.count(),1);
    assert(!(await card.textContent()).includes('这只是用户引用的文字'));
  }
  try {
    await open(full);await shows(reason);
    assert.match(await card.innerText(),/已被锁定/);
    assert(!(await card.innerText()).includes('正文与引用'));
    await card.screenshot({path:path.join(output,'modern-light.png')});
    checks.push('Reported full reason appears once in the existing notice, without surrounding topic or reply text');

    await open('该帖已被锁定');await card.waitFor();
    assert.match(await card.textContent(),/已被锁定/);
    assert(!/锁定原因/.test(await card.textContent()));
    checks.push('Legacy reasonless notice still renders without an empty reason label');

    const revised='请补充上下文（含原始资料），再联系版主。';
    await page.evaluate(text=>{const reason=document.createElement('span');reason.textContent='（锁定原因：'+text+'）';document.querySelector('#native-lock').append(reason)},revised);
    await shows(revised);
    const literal='<img id="xss-probe" src=x onerror="window.userTextExecuted=true">，请保留（原样）。';
    await page.locator('#native-lock span').evaluate((span,text)=>{span.firstChild.nodeValue='（锁定原因：'+text+'）'},literal);
    await shows(literal);
    assert.equal(await card.locator('#xss-probe').count(),0);
    assert.equal(await page.evaluate(()=>Boolean(window.userTextExecuted)),false);
    checks.push('Async split markup and text-node edits update the reason; nested punctuation and markup-like text remain literal');

    const long='请补充原帖中的出处和具体经过（可以保留已有内容）。'.repeat(3)+'资料编号：'+'x'.repeat(65)+'。';
    await page.locator('#native-lock').evaluate((node,text)=>{const next=node.cloneNode(false);next.textContent='该贴已被锁定（锁定原因：'+text+'）';node.replaceWith(next)},long);
    await shows(long);
    for(const [themeStyle,themeMode,width] of [['modern','dark',390],['ascii','light',320]]) {
      await page.setViewportSize({width,height:850});
      await page.evaluate(settings=>{Object.assign(lastSettings,settings);CC98RebornThemeCore.apply(document.documentElement,lastSettings);CC98RebornInterfaceStyle.sync(lastSettings)},{themeStyle,themeMode});
      await card.screenshot({path:path.join(output,`${themeStyle}-${themeMode}-${width}.png`)});
      const fits=await card.evaluate(n=>n.scrollWidth<=n.clientWidth+1 && n.scrollHeight<=n.clientHeight+1 && n.getBoundingClientRect().right<=innerWidth+1);
      assert(fits,`long reason must fit ${themeStyle}/${themeMode}/${width}px`);
    }
    checks.push('Replacement notice and 贴 variant retain full reason; long text wraps on dark modern and narrow ASCII views');

    await page.locator('#native-lock').evaluate(n=>n.remove());await card.waitFor({state:'detached'});
    await open('');assert.equal(await card.count(),0);
    assert((await page.locator('#cc98-comfort-app [data-post-floor="1"]').innerText()).includes('这只是用户引用的文字'));
    checks.push('Unlock clears the banner; text in a reply, quote or signature does not mark an unlocked thread as locked');
    await page.locator('#lock-slot > .row').evaluate((row,html)=>row.insertAdjacentHTML('afterend',html),notice(full));await shows(reason);
    checks.push('A native notice added after the post is reading-ready appears without refresh');
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(output,'validation.json'),JSON.stringify({passed:true,isolatedFixture:true,checks,errors},null,2));
    console.log(JSON.stringify({passed:true,checks}));
  }catch(error){
    console.error({checks,errors,banner:await card.allTextContents()});throw error;
  }finally{await context.close();await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
