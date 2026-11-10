const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const root = path.resolve(__dirname, '..'), origin = 'https://www.cc98.org';
const output = path.join(root, 'outputs/browser-perf-nav-20261029/navigation');
const title = '一个懦弱自私者的自白——关于【已编辑】根源';
const breadcrumb = `<div id="native-path" class="row" style="align-items:baseline;justify-content:flex-start;color:grey;font-size:.75rem;margin-bottom:1rem"><a href="/">首页</a><i class="fa fa-chevron-right"></i><a href="/boardlist">版面列表</a><i class="fa fa-chevron-right"></i><a href="/board/777">维权空间</a><i class="fa fa-chevron-right"></i><a href="/topic/6677683"><div style="overflow:hidden;text-overflow:ellipsis;max-width:15rem;white-space:nowrap">${title}</div></a></div>`;
function fixture() {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - CC98论坛</title>${['theme-tokens.css','styles.css','interface-styles.css','topic-drawer.css'].map(file=>`<link rel="stylesheet" href="/src/${file}">`).join('')}</head><body><div id="root"><div class="topBar"><a href="/">CC98</a></div><div id="native-path-host">${breadcrumb}</div><section class="topicInfo-info"><h1 id="essay1">${title}</h1><span id="viewtimes"><span class="timeProp tagSize">32,456</span></span><button class="followTopic">收藏</button></section><div class="reply" id="reply_11" data-floor="11"><a href="/user/id/1001">测试用户</a><span class="reply-floor">11</span><div class="reply-content"><div class="substance"><article><p>路径导航位于标题下方，浏览数与路径保持同一行。</p><p>正文、引用和回复操作保留。</p></article></div></div><div class="reply-footer"><button data-native-action="quote">引用</button></div></div><div class="pagination"><div class="page-nav"><a href="/topic/6677683/1">1</a><a href="/topic/6677683/2">2</a></div></div><textarea id="draft">未发送草稿</textarea></div>${['theme-core.js','interface-style.js','conversation-core.js','conversation.js','content.js'].map(file=>`<script src="/src/${file}"></script>`).join('')}</body></html>`;
}

async function main() {
  await fs.mkdir(output,{recursive:true});
  const browser = await chromium.launch({executablePath:await executable(),headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  const page = await context.newPage(), errors = [], checks = [], samples = [];
  page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{
    window.__quoteClicks=0;
    window.chrome={runtime:{getManifest:()=>({version:'0.4.3'}),getURL:p=>new URL('/'+p,location.origin).href,onMessage:{addListener(){}},sendMessage:(m,c)=>{c?.({ok:false});return Promise.resolve({ok:false})}},storage:{local:{get:(keys,c)=>{const value={cc98ComfortSettings:{enabled:true,rebuildUi:true,previsitFirstPageForTopicImages:false,prewarmPostImages:false,themeStyle:'modern',themeMode:'light'}};c?.(value);return Promise.resolve(value)},set:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener(){}}}};
    document.addEventListener('click',e=>{if(e.target.matches('[data-native-action="quote"]'))__quoteClicks++});
  });
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===origin && url.pathname.startsWith('/src/'))return route.fulfill({path:path.join(root,url.pathname)});
    if(route.request().resourceType()==='document')return route.fulfill({contentType:'text/html',body:url.pathname.startsWith('/topic/')?fixture():`<!doctype html><title>导航目标</title><p>${url.pathname}</p>`});
    return route.fulfill({status:204,body:''});
  });
  try {
    await page.goto(origin+'/topic/6677683/2');
    const nav=page.getByRole('navigation',{name:'帖子路径'});
    await nav.waitFor();
    assert.deepEqual(await nav.locator('a').allTextContents(),['首页','版面列表','维权空间',title]);
    assert.deepEqual(await nav.locator('a').evaluateAll(nodes=>nodes.map(n=>new URL(n.href).pathname)),['/','/boardlist','/board/777','/topic/6677683']);
    assert.equal(await page.locator('.cc98-rebuild-topic-views').innerText(),'浏览 32456');
    assert.equal(await page.locator('#native-path').getAttribute('style'),'align-items:baseline;justify-content:flex-start;color:grey;font-size:.75rem;margin-bottom:1rem');
    checks.push('Original four path links retained below title; view count shares right side, native source unchanged');
    for(const width of [1280,390,320]) for(const themeStyle of ['modern','ascii']) for(const themeMode of ['light','dark']) {
      await page.setViewportSize({width,height:900});
      await page.evaluate(settings=>{Object.assign(lastSettings,settings);CC98RebornThemeCore.apply(document.documentElement,lastSettings);CC98RebornInterfaceStyle.sync(lastSettings)}, {themeStyle,themeMode});
      await page.waitForTimeout(120);
      const geometry=await page.locator('.cc98-rebuild-topic-context').evaluate(row=>{
        const box=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width}};
        const nav=row.querySelector('nav'),views=row.querySelector('p'),links=[...nav.querySelectorAll('a')];
        return {row:box(row),nav:box(nav),views:box(views),links:links.map(box),overflow:document.documentElement.scrollWidth>innerWidth,ellipsis:getComputedStyle(links.at(-1)).textOverflow,clipped:links.at(-1).scrollWidth>links.at(-1).clientWidth};
      });
      assert(!geometry.overflow,JSON.stringify({width,themeStyle,geometry}));
      assert(geometry.nav.right<=geometry.views.left && Math.abs(geometry.views.top-geometry.nav.top)<3,JSON.stringify(geometry));
      assert(geometry.links.every(link=>link.width>10 && link.left>=geometry.row.left-1 && link.right<=geometry.views.left),JSON.stringify(geometry));
      assert.equal(geometry.ellipsis,'ellipsis');assert(geometry.clipped);
      samples.push({width,themeStyle,themeMode,geometry});
      if(width!==320)await page.locator('.cc98-rebuild-hero').screenshot({path:path.join(output,`${themeStyle}-${themeMode}-${width}.png`)});
    }
    checks.push('Modern/ASCII light/dark at 1280/390/320px retain one row, visible path links and ellipsis without horizontal overflow');
    await page.evaluate(()=>{window.__originalCards=[...document.querySelectorAll('#cc98-comfort-app [data-post-floor]')];window.__originalNav=document.querySelector('.cc98-rebuild-topic-breadcrumb');document.querySelector('#draft').setSelectionRange(2,4);syncTopicViewCount();syncTopicViewCount();document.querySelector('#viewtimes .timeProp').textContent='32457'});
    await page.waitForFunction(()=>document.querySelector('.cc98-rebuild-topic-views')?.textContent==='浏览 32457');
    assert(await page.evaluate(()=>__originalNav===document.querySelector('.cc98-rebuild-topic-breadcrumb') && __originalCards.every((card,i)=>card===document.querySelectorAll('#cc98-comfort-app [data-post-floor]')[i])));
    assert.equal(await page.locator('#draft').inputValue(),'未发送草稿');
    assert.equal(await page.locator('#draft').evaluate(n=>n.selectionStart),2);
    checks.push('View-count updates do not rebuild navigation, cards or draft/selection');
    await page.evaluate(()=>{document.querySelector('#native-path a[href="/board/777"]').textContent='版面名称已更新'});
    await page.getByRole('link',{name:'版面名称已更新',exact:true}).last().waitFor();
    await page.evaluate(()=>document.querySelector('#native-path').remove());
    await nav.waitFor({state:'detached'});
    await page.evaluate(html=>document.querySelector('#native-path-host').innerHTML=html,breadcrumb.replace(/<a href="\/topic\/[\s\S]*?<\/a>/,''));
    assert.equal(await nav.count(),0);
    await page.evaluate(title=>{const link=document.createElement('a');link.href='/topic/6677683';link.textContent=title;document.querySelector('#native-path').append(link)},title);
    await nav.waitFor();
    checks.push('Delayed/partially mounted path, replacement, edits and removal synchronize without stale links');
    await page.evaluate(()=>{document.querySelector('#viewtimes').remove()});
    await page.locator('.cc98-rebuild-topic-views').waitFor({state:'detached'});
    assert.equal(await nav.count(),1);
    await page.evaluate(()=>{const n=document.createElement('span');n.id='viewtimes';n.innerHTML='<span class="timeProp tagSize">40000</span>';document.querySelector('.topicInfo-info').append(n)});
    await page.waitForFunction(()=>document.querySelector('.cc98-rebuild-topic-views')?.textContent==='浏览 40000');
    await page.setViewportSize({width:540,height:900});
    await page.evaluate(()=>document.documentElement.classList.add('cc98-topic-drawer-child'));
    assert(await nav.isVisible());
    await page.locator('.cc98-rebuild-hero').screenshot({path:path.join(output,'ascii-drawer-540.png')});
    checks.push('Absent/late view counts supported, breadcrumb remains in drawer-child layout');
    await page.locator('#cc98-comfort-app [data-post-floor="11"] button[aria-label="引用"]').click();
    assert.equal(await page.evaluate(()=>__quoteClicks),1);
    await page.evaluate(()=>{lastSettings.openLinksInNewTab=true;bindOpenLinksInNewTabGuard()});
    const popupPromise=page.waitForEvent('popup');
    await nav.getByRole('link',{name:'维权空间',exact:true}).click();
    const popup=await popupPromise;await popup.waitForLoadState();assert.equal(popup.url(),origin+'/board/777');await popup.close();
    assert(page.url().includes('/topic/6677683/2'));
    await page.evaluate(()=>lastSettings.openLinksInNewTab=false);
    await nav.getByRole('link',{name:'版面列表',exact:true}).click();
    await page.waitForURL(origin+'/boardlist');
    checks.push('Reply action remains functional; path clicks follow same-page/new-tab preference');
    assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(output,'validation.json'),JSON.stringify({passed:true,checks,samples,errors},null,2));
    console.log(JSON.stringify({passed:true,checks}));
  }catch(error){
    console.error({errors,state:await page.evaluate(()=>({kind:typeof getPageKind==='function'?getPageKind():null,items:typeof getTopicBreadcrumbItems==='function'?getTopicBreadcrumbItems(document.querySelector('#native-path')):null,app:document.querySelector('#cc98-comfort-app')?.outerHTML.slice(0,5000),source:document.querySelector('#native-path')?.outerHTML,settings:typeof lastSettings==='object'?lastSettings?.enabled:null}))});
    await page.screenshot({path:path.join(output,'failure.png')});throw error;
  }finally{await context.close();await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
