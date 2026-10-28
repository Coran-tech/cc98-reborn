const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const { native, shell, png } = require('./topic-archive.test.cjs');
const root = path.resolve(__dirname, '..'), origin = 'https://www.cc98.org';
const output = path.join(root, 'outputs/archive-toolbar-20261028/qa');

function fixture() {
  const shim = `<script>window.__messages=[];window.__favoriteClicks=0;
    window.chrome={runtime:{getURL:p=>location.origin+'/'+p,getManifest:()=>({version:'0.4.2'}),onMessage:{addListener(){}},sendMessage:(m,c)=>{__messages.push(m);c?.({ok:false});return Promise.resolve({ok:false})}},storage:{local:{get:(k,c)=>{c?.({});return Promise.resolve({})},set:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener(){}}}};</script>`;
  const scripts = ['theme-core.js','interface-style.js','conversation-core.js','conversation.js','topic-search.js','topic-archive.js','content.js'].map(file=>`<script src="/src/${file}"></script>`).join('');
  const source = native(2).replace(/<video\b[^>]*>[\s\S]*?<\/video>/g,'');
  return shell(`<div class="native topicInfo-info">${source}</div><main id="cc98-comfort-app"></main>`, shim + scripts + `<script>
    lastSettings={...DEFAULT_SETTINGS,previsitFirstPageForTopicImages:false,prewarmPostImages:false};
    scheduleRebuild=()=>{};scheduleSync=()=>{};document.documentElement.removeAttribute('data-cc98-rebuild-transition-veil');
    document.querySelector('.native .followTopic').onclick=()=>__favoriteClicks++;
    document.querySelector('#cc98-comfort-app').append(renderPostPager());
    CC98RebornThemeCore.apply(document.documentElement,lastSettings);
  </script>`).replace('<meta charset="utf-8">','<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">');
}

async function appearance(locator) {
  return locator.evaluate(button=>{
    const css=getComputedStyle(button);
    return Object.fromEntries(['height','color','backgroundColor','borderTopColor','borderTopWidth','borderTopStyle','borderRadius','padding','fontFamily','fontSize','fontWeight','lineHeight','outlineColor','outlineWidth','outlineStyle','outlineOffset'].map(key=>[key,css[key]]));
  });
}

async function main() {
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({executablePath:await executable(),headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:850}}), page=await context.newPage();
  const errors=[],unexpectedRequests=[],checks=[],samples=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin && url.pathname==='/topic/100/2' && request.resourceType()==='document')return route.fulfill({contentType:'text/html',body:fixture()});
    if(url.origin===origin && url.pathname==='/src/content.js') {
      const source=await fs.readFile(path.join(root,'src/content.js'),'utf8'), cut=source.lastIndexOf('\narmInitialRebuildTransitionVeil();');
      assert(cut>0,'fixture uses the production rendering code without booting the whole app');
      return route.fulfill({contentType:'text/javascript',body:source.slice(0,cut)});
    }
    if(url.origin===origin && url.pathname.startsWith('/src/'))return route.fulfill({path:path.join(root,url.pathname)});
    if(request.resourceType()==='image')return route.fulfill({contentType:'image/png',body:png});
    if(url.pathname.endsWith('/favicon.ico'))return route.fulfill({status:204,body:''});
    unexpectedRequests.push({url:url.href,type:request.resourceType()});return route.abort();
  });
  try {
    await page.goto(origin+'/topic/100/2');
    const search=page.locator('.cc98-topic-search-entry'), archive=page.locator('.cc98-topic-archive-entry');
    await archive.waitFor();
    const order=await page.locator('.cc98-rebuild-pager-action').allTextContents();
    assert.deepEqual(order,['全文搜索','存档本帖','收藏']);
    assert(await archive.evaluate(button=>button.nextElementSibling.classList.contains('cc98-rebuild-topic-favorite-action')));
    checks.push('Production renderPostPager orders full-text search, archive, favorite');
    for(const themeStyle of ['modern','ascii']) for(const themeMode of ['light','dark']) {
      await page.evaluate(settings=>{Object.assign(lastSettings,settings);CC98RebornThemeCore.apply(document.documentElement,lastSettings);CC98RebornInterfaceStyle.sync(lastSettings)}, {themeStyle,themeMode});
      await page.mouse.move(0,0);await page.evaluate(()=>document.activeElement?.blur());await page.waitForTimeout(250);
      const normal=await appearance(search);assert.deepEqual(await appearance(archive),normal,`${themeStyle}/${themeMode} default styles`);
      if(themeStyle==='ascii')assert.equal(normal.borderRadius,'0px');
      await search.hover();await page.waitForTimeout(250);const hover=await appearance(search);
      await archive.hover();await page.waitForTimeout(250);assert.deepEqual(await appearance(archive),hover,`${themeStyle}/${themeMode} hover styles`);
      await page.mouse.move(0,0);await page.keyboard.press('Tab');await search.focus();await page.waitForTimeout(250);
      assert(await search.evaluate(button=>button.matches(':focus-visible')));
      const focus=await appearance(search);await archive.focus();await page.waitForTimeout(250);
      assert(await archive.evaluate(button=>button.matches(':focus-visible')));assert.deepEqual(await appearance(archive),focus,`${themeStyle}/${themeMode} focus styles`);
      await page.evaluate(()=>document.activeElement?.blur());await page.waitForTimeout(250);
      await page.locator('.cc98-rebuild-pager').screenshot({path:path.join(output,`${themeStyle}-${themeMode}.png`)});
      samples.push({themeStyle,themeMode,normal,hover,focus});
    }
    checks.push('Modern/ASCII light/dark share height, colors, borders, radius, typography, hover and keyboard focus');
    await page.setViewportSize({width:390,height:850});
    for(const themeStyle of ['modern','ascii']) {
      await page.evaluate(settings=>{Object.assign(lastSettings,settings);CC98RebornThemeCore.apply(document.documentElement,lastSettings);CC98RebornInterfaceStyle.sync(lastSettings)}, {themeStyle,themeMode:'light'});
      const geometry=await page.locator('.cc98-rebuild-pager-action').evaluateAll(buttons=>buttons.map(button=>{const rect=button.getBoundingClientRect();return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom}}));
      assert(geometry.every((rect,index)=>index===0 || rect.left>geometry[index-1].left && Math.abs(rect.top-geometry[index-1].top)<1),JSON.stringify(geometry));
      // Preserve the existing single-row horizontally scrolling pager.
      for(const button of await page.locator('.cc98-rebuild-pager-action').all()) {
        await button.scrollIntoViewIfNeeded();
        assert(await button.evaluate(button=>{const item=button.getBoundingClientRect(),bar=button.parentElement.getBoundingClientRect();return item.left>=bar.left-1 && item.right<=bar.right+1}));
      }
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal page overflow');
      await page.locator('.cc98-rebuild-pager').screenshot({path:path.join(output,`${themeStyle}-narrow.png`)});
    }
    checks.push('390px toolbar retains local horizontal scrolling, all buttons remain reachable in order without page overflow');
    await archive.click();assert(await page.locator('.cc98-topic-archive-dialog').isVisible());assert.equal(await page.locator('.cc98-topic-search-dialog').count(),0);
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    await search.click();assert(await page.locator('.cc98-topic-search-dialog').isVisible());assert.equal(await page.locator('.cc98-topic-archive-dialog').count(),0);
    await page.keyboard.press('Escape');await page.locator('.cc98-rebuild-topic-favorite-action').click();
    await page.waitForFunction(()=>__favoriteClicks===1);
    assert(!(await page.evaluate(()=>__messages)).some(message=>/^CC98_ARCHIVE_(?:BEGIN|RESOURCE|PAGE)/.test(message.type)));
    checks.push('Each button opens its own dialog; favorite proxies the original click; no capture starts');
    assert.deepEqual(errors,[]);assert.deepEqual(unexpectedRequests,[]);
    await fs.writeFile(path.join(output,'validation.json'),JSON.stringify({passed:true,checks,samples,errors,unexpectedRequests},null,2));
    console.log(JSON.stringify({passed:true,checks}));
  }finally{await context.close();await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
