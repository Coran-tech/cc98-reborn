const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const { png } = require('./topic-archive.test.cjs');
const root = path.resolve(__dirname, '..'), origin = 'https://www.cc98.org';
const output = path.join(root, 'outputs/empty-post-cards-20261028');
const baseline = process.argv.includes('--before');
function reply(floor, body = '', options = {}) {
  const content = options.vote ? '<div class="vote-content"><p>投票详情</p></div>'
    : options.lottery ? '<div class="ant-card-body"><p>该主题帖启用了抽奖功能</p></div>'
    : `<div class="substance">${options.markdown ? `<div class="markdown-container mde-preview"><div class="mde-preview-content">${body}</div></div>` : `<article>${body}</article>`}</div>`;
  return `<div class="reply" id="reply_${floor}" data-floor="${floor}"><div class="reply-header"><a href="/user/id/${1000+floor}">空楼作者${floor}</a><span class="reply-floor">${floor}</span></div><div class="reply-content">${content}</div>${options.signature ? '<div class="signature"><article>仅有签名档<img src="https://file.cc98.org/signature.png"></article></div>' : ''}<div class="comment1">发表于 2026-10-28 12:00:00</div><div class="reply-footer"><button data-native-action="like" data-floor="${floor}">赞 3</button><button>踩 0</button><button>评分</button><button data-native-action="quote" data-floor="${floor}">引用</button></div></div>`;
}
function html(allEmpty = false) {
  const posts = allEmpty ? reply(1) + reply(2,'<p><br></p>') + reply(3,'',{markdown:true})
    : reply(1)+reply(2,'<p> \n<br>&nbsp; </p>')+reply(3,'',{markdown:true})+reply(4,'',{signature:true})
      +reply(5,'<img src="https://file.cc98.org/photo.png">')+reply(6,'<blockquote>仅有引用</blockquote>')
      +reply(7,'',{vote:true})+reply(8,'',{lottery:true});
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>空正文楼层测试 - CC98论坛</title>${['theme-tokens.css','styles.css','interface-styles.css'].map(name=>`<link rel="stylesheet" href="/src/${name}">`).join('')}</head><body><div id="root"><div class="topBar"><a href="/">CC98</a></div><section class="topicInfo-info"><h1 id="essay1">空正文楼层测试</h1><button class="followTopic">收藏</button></section><main id="native-page">${posts}<div class="reply" id="unloaded-reply"><div class="reply-header">尚未加载的外壳</div></div><div class="post-tools"><button>工具</button></div></main><div class="pagination"><div class="page-nav"><a href="/topic/6500000/1">1</a><a href="/topic/6500000/2">2</a></div></div><textarea id="draft">尚未提交的草稿</textarea></div>${['theme-core.js','interface-style.js','conversation-core.js','conversation.js','content.js'].map(name=>`<script src="/src/${name}"></script>`).join('')}</body></html>`;
}
async function main() {
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({executablePath:await executable(),headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:1000}}), page=await context.newPage();
  const errors=[], unexpected=[], checks=[];
  let allEmpty=false;
  page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(()=>{
    window.__settingListeners=[];window.__nativeClicks=[];
    window.chrome={runtime:{getManifest:()=>({version:'0.4.3'}),getURL:p=>new URL('/'+p,location.origin).href,onMessage:{addListener(){}},sendMessage:(m,c)=>{c?.({ok:false});return Promise.resolve({ok:false})}},storage:{local:{get:(keys,c)=>{const value={cc98ComfortSettings:{enabled:true,rebuildUi:true,themeStyle:'modern',themeMode:'light',previsitFirstPageForTopicImages:false,prewarmPostImages:false}};c?.(value);return Promise.resolve(value)},set:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener:fn=>__settingListeners.push(fn)}}};
    document.addEventListener('click',event=>{const button=event.target.closest('[data-native-action]');if(button)__nativeClicks.push([button.dataset.nativeAction,button.dataset.floor])});
  });
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin && /^\/topic\//.test(url.pathname)) return route.fulfill({contentType:'text/html',body:html(allEmpty)});
    if(url.pathname.endsWith('.png')) return route.fulfill({contentType:'image/png',body:png});
    if(url.origin===origin && url.pathname.startsWith('/src/')) {
      const file=baseline && url.pathname==='/src/content.js' ? path.join(output,'before/src/content.js') : path.join(root,url.pathname);
      return route.fulfill({path:file});
    }
    if(url.pathname.endsWith('/favicon.ico'))return route.fulfill({status:204,body:''});
    unexpected.push(url.href);return route.abort();
  });
  try {
    await page.goto(origin+'/topic/6500000/1');
    await page.locator('#cc98-comfort-app [data-post-floor]').first().waitFor();
    const floors=await page.locator('#cc98-comfort-app [data-post-floor]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.postFloor)));
    if(baseline) {
      assert(!floors.includes(1)&&!floors.includes(2)&&!floors.includes(3)&&!floors.includes(4),'old content filters must reproduce missing empty-body floors');
      allEmpty=true;await page.reload();await page.waitForTimeout(1200);
      const empty=await page.evaluate(()=>({count:document.querySelectorAll('#cc98-comfort-app [data-post-floor]').length,ready:getNativeRouteRenderState('post').ready}));
      assert.equal(empty.count,0);assert.equal(empty.ready,false);
      await fs.writeFile(path.join(output,'before-validation.json'),JSON.stringify({floors,allEmpty:empty,errors},null,2));
      console.log('Reproduced empty-card loss and all-empty route readiness failure');return;
    }
    assert.deepEqual(floors,[1,2,3,4,5,6,7,8]);
    const emptyBodies=await page.locator('#cc98-comfort-app [data-post-floor]').evaluateAll(cards=>cards.slice(0,4).map(card=>({floor:card.dataset.postFloor,text:card.querySelector('.cc98-rebuild-post-body').textContent.trim()})));
    assert(emptyBodies.every(card=>card.text===''),'do not fabricate empty-body placeholder text');
    assert((await page.locator('[data-post-floor="4"] .cc98-rebuild-signature').innerText()).includes('仅有签名档'));
    assert.equal(await page.locator('[data-post-floor="5"] .cc98-rebuild-post-body img').count(),1);
    assert((await page.locator('[data-post-floor="6"] .cc98-rebuild-post-body').innerText()).includes('仅有引用'));
    for(const floor of [1,2,3,4]) {
      const card=page.locator(`#cc98-comfort-app [data-post-floor="${floor}"]`);
      assert((await card.innerText()).includes('空楼作者'+floor));assert(await card.locator('.cc98-rebuild-post-actions').isVisible());
    }
    await page.locator('[data-post-floor="1"] button[aria-label="引用"]').click();
    assert.deepEqual(await page.evaluate(()=>__nativeClicks),[['quote','1']]);
    checks.push('Empty UBB/whitespace/Markdown and signature-only floors retain identities, anchors, signatures and native actions; media/quote/vote/lottery floors unchanged');
    await page.evaluate(()=>{window.__keptCards=[...document.querySelectorAll('#cc98-comfort-app [data-post-floor]')];document.querySelector('#draft').setSelectionRange(2,4);syncRebuiltContent();syncRebuiltContent()});
    assert(await page.evaluate(()=>__keptCards.every((card,index)=>card===document.querySelectorAll('#cc98-comfort-app [data-post-floor]')[index])));
    assert.equal(await page.locator('#draft').inputValue(),'尚未提交的草稿');
    assert.equal(await page.locator('#draft').evaluate(node=>node.selectionStart),2);
    checks.push('Repeated synchronization retains cards, draft and selection; unloaded shell and toolbar never become floors');
    await page.evaluate(()=>{
      window.__emptyCard=document.querySelector('#cc98-comfort-app [data-post-floor="3"]');
      window.__emptyHeader=__emptyCard.querySelector('.cc98-rebuild-post-header');
      window.__emptyActions=__emptyCard.querySelector('.cc98-rebuild-post-actions');
      document.querySelector('#reply_3 .mde-preview-content').innerHTML='<p>延迟到达的 Markdown 正文</p><img src="https://file.cc98.org/late.png">';
    });
    await page.waitForFunction(()=>document.querySelector('#cc98-comfort-app [data-post-floor="3"] .cc98-rebuild-post-body')?.textContent.includes('延迟到达的 Markdown 正文'));
    assert.equal(await page.locator('[data-post-floor="3"] .cc98-rebuild-post-body img').count(),1);
    assert(await page.evaluate(()=>__emptyCard===document.querySelector('#cc98-comfort-app [data-post-floor="3"]')
      && __emptyHeader===__emptyCard.querySelector('.cc98-rebuild-post-header')
      && __emptyActions===__emptyCard.querySelector('.cc98-rebuild-post-actions')));
    checks.push('An initially empty Markdown container updates when delayed text and media arrive');
    for(const themeStyle of ['modern','ascii'])for(const themeMode of ['light','dark']) {
      await page.evaluate(settings=>{Object.assign(lastSettings,settings);CC98RebornThemeCore.apply(document.documentElement,lastSettings);CC98RebornInterfaceStyle.sync(lastSettings)}, {themeStyle,themeMode});
      await page.locator('[data-post-floor="1"]').scrollIntoViewIfNeeded();
      assert(await page.locator('[data-post-floor="1"]').isVisible());
      await page.screenshot({path:path.join(output,`${themeStyle}-${themeMode}.png`)});
    }
    await page.setViewportSize({width:390,height:900});
    await page.locator('[data-post-floor="1"]').scrollIntoViewIfNeeded();
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(output,'ascii-narrow.png')});
    await page.evaluate(()=>{
      window.CC98RebornContentFilter={metrics:()=>null,reason:item=>item.content?.textContent.includes('命中延迟规则')?'发言规则：延迟内容':''};
      document.querySelector('#reply_2 article').textContent='命中延迟规则';
    });
    const blocked=page.locator('[data-item-key="post:reply_2"].cc98-rebuild-blocked');
    await blocked.waitFor();assert((await blocked.innerText()).includes('发言规则'));
    await blocked.getByRole('button').click();
    await page.waitForFunction(()=>document.querySelector('#cc98-comfort-app [data-post-floor="2"]')?.textContent.includes('命中延迟规则'));
    checks.push('Delayed content still passes the existing rule interface and supports reveal');
    allEmpty=true;await page.goto(origin+'/topic/6500000/1?empty=1#2');
    await page.locator('#cc98-comfort-app [data-post-floor="3"]').waitFor();
    assert.deepEqual(await page.locator('#cc98-comfort-app [data-post-floor]').evaluateAll(nodes=>nodes.map(node=>Number(node.dataset.postFloor))),[1,2,3]);
    await page.waitForFunction(()=>document.querySelector('#cc98-comfort-app')?.dataset.cc98ContentPending!=='true');
    assert(await page.evaluate(()=>getNativeRouteRenderState('post').ready));
    assert((await page.locator('#cc98-comfort-app [data-post-floor="2"]').getAttribute('id')).includes('2'));
    await page.screenshot({path:path.join(output,'all-empty-ready.png')});
    checks.push('All-empty topic completes the real startup shell and preserves direct floor anchors');
    await page.evaluate(markup=>document.querySelector('#native-page').insertAdjacentHTML('beforeend',markup),reply(4));
    await page.locator('#cc98-comfort-app [data-post-floor="4"]').waitFor();
    checks.push('A dynamically appended empty floor appears through the native observer');
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
    await fs.writeFile(path.join(output,'validation.json'),JSON.stringify({passed:true,floors,emptyBodies,checks,errors,unexpected},null,2));console.log(JSON.stringify({passed:true,checks}));
  } finally {await context.close();await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
