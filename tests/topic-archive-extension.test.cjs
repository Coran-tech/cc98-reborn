const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const { native, png } = require('./topic-archive.test.cjs');
const root = path.resolve(__dirname, '..'), origin='https://www.cc98.org';
const markdownUrl='https://file.cc98.org/v4-upload/d/2026/1028/5m3z23ao.md';
const markdownText='# 离线附件\n\n这是测试 Markdown。\n';
const webpUrl='https://file.cc98.org/v4-upload/d/2026/1028/sauxtllp.webp';
async function main(){
  const output=path.join(root,'outputs/topic-archive/extension');await fs.mkdir(output,{recursive:true});
  const context=await chromium.launchPersistentContext('',{executablePath:await executable(),headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${root}`,`--load-extension=${root}`],viewport:{width:1280,height:900}});
  const errors=[],requests=[],cspErrors=[];
  context.on('page',page=>page.on('console',message=>{if (/violates.*Content Security Policy|Refused to apply inline style/i.test(message.text())) cspErrors.push(message.text());}));
  try{
    // A valid WebP with a RIFF size containing C2 80: UTF-8 decoding collapses
    // those two bytes, breaking the old text-offset magic-number check.
    const fixturePage=await context.newPage();
    const webpBase=Buffer.from(await fixturePage.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=32;canvas.height=24;
      const brush=canvas.getContext('2d');brush.fillStyle='#326a70';brush.fillRect(0,0,32,24);
      brush.fillStyle='#f5ba50';brush.fillRect(8,6,16,12);
      return canvas.toDataURL('image/webp').split(',')[1];
    }),'base64');await fixturePage.close();
    assert.equal(webpBase.toString('ascii',8,12),'WEBP');
    const junk=Buffer.alloc(0x80c2+8-webpBase.length);junk.write('JUNK',0,'ascii');junk.writeUInt32LE(junk.length-8,4);
    const webp=Buffer.concat([webpBase,junk]);webp.writeUInt32LE(webp.length-8,4);
    assert.equal(/^RIFF[\s\S]{4}WEBP/.test(new TextDecoder().decode(webp.subarray(0,32))),false,'fixture must reproduce the old decoder bug');
    await fs.writeFile(path.join(output,'utf8-size-field.webp'),webp);
    await context.setOffline(true);
    await context.route('**/*',async route=>{
      const u=new URL(route.request().url());if(u.protocol==='chrome-extension:')return route.continue();
      requests.push(u.href);
      if(u.origin===origin&&/^\/topic\/100(?:\/\d+)?$/.test(u.pathname)){
        const n=Number(u.pathname.split('/')[3]||1);
        const content=native(n,true).replace('</article>',`<a href="${markdownUrl}">下载文件</a><img src="${webpUrl}" alt="WebP二进制头回归"></article>`);
        const body=`<!doctype html><html><head><meta charset="utf-8"><title>快照集成测试 - CC98论坛</title></head><body><div id="root"><header class="topBar"><span class="topBarUserName">测试用户</span></header>${content}</div></body></html>`;
        return route.fulfill({contentType:'text/html',body});
      }
      if(u.href===webpUrl)return route.fulfill({contentType:'image/webp',body:webp});
      if(u.pathname.endsWith('.png'))return route.fulfill({contentType:'image/png',body:png});
      return route.abort();
    });
    const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
    const id=new URL(worker.url()).host;
    await worker.evaluate(async ({base64,markdownUrl,markdownText,webpUrl,webpBase64})=>{
      await chrome.storage.local.set({cc98ComfortSettings:{enabled:true,themeMode:'light',themeStyle:'modern',prewarmPostImages:false,previsitFirstPageForTopicImages:false},'cc98RebornOpenIdBinding:v1':{bound:true,userId:'12345',userName:'测试用户',boundAt:Date.now()}});
      consumeStartupUpdateNotice=async()=>({ok:true,show:false});
      getStoredUpdateStatus=async()=>({ok:true,currentVersion:chrome.runtime.getManifest().version,latestVersion:chrome.runtime.getManifest().version,hasUpdate:false});
      getOpenIdBinding=async()=>({ok:true,binding:{bound:true,userId:'12345',userName:'测试用户',boundAt:Date.now()}});
      // Media transport is isolated; the real runtime messages, sender identity and extension DB stay intact.
      const originalFetch=globalThis.fetch;
      globalThis.fetch=async (url,options)=> String(url)===markdownUrl ? new Response(markdownText,{headers:{'content-type':'application/octet-stream'}})
        : String(url)===webpUrl ? new Response(Uint8Array.from(atob(webpBase64),c=>c.charCodeAt(0)),{headers:{'content-type':'image/webp'}})
        : String(url).endsWith('/manual.pdf') ? new Response('%PDF-1.4\nTest',{headers:{'content-type':'application/pdf'}})
        : String(url).endsWith('/movie.mp4') ? new Response('fixture-video',{headers:{'content-type':'video/mp4'}})
        : /^(https:\/\/(file|www)\.cc98\.org\/.*\.png|chrome-extension:.*\/images\/)/.test(String(url))
          ?new Response(Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),{headers:{'content-type':'image/png'}}):originalFetch(url,options);
    },{base64:png.toString('base64'),markdownUrl,markdownText,webpUrl,webpBase64:webp.toString('base64')});
    await context.addInitScript(()=>{if(location.protocol==='https:')localStorage.setItem('userInfo','obj-'+JSON.stringify({id:12345,name:'测试用户'}));});
    const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/topic/100/2');
    await page.locator('.cc98-topic-archive-entry').first().waitFor();
    await page.waitForTimeout(1600);const before=await page.locator('.cc98-rebuild-post').count();
    await page.locator('.cc98-topic-archive-entry').first().click();await page.getByRole('button',{name:'开始存档',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.cc98-topic-archive-status')?.textContent.startsWith('存档完成'),{},{timeout:20000});
    assert.equal(await page.locator('.cc98-rebuild-post').count(),before);
    await page.screenshot({path:path.join(output,'actual-extension-capture.png')});
    const open=context.waitForEvent('page');await page.getByRole('button',{name:'查看存档',exact:true}).click();const archive=await open;
    archive.on('pageerror',e=>errors.push(e.message));await archive.waitForURL(`chrome-extension://${id}/popup/archive.html#*`);
    await archive.locator('#archive-title').waitFor();await archive.locator('.archive-post').first().waitFor();
    assert.equal(await archive.locator('#archive-title').textContent(),'快照集成测试');
    assert.equal(await archive.locator('#archive-pagination [data-page]').count(),3);assert.equal(await archive.locator('#archive-pagination-bottom [data-page]').count(),3);assert.equal(await archive.locator('.archive-awards-table tbody tr').count(),2);const rating=await archive.locator('.archive-award-avatar img').evaluate(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}));assert(rating.width<=24&&rating.height<=24,JSON.stringify(rating));
    await archive.locator('#archive-pagination-bottom [data-page-step="1"]').click();await archive.waitForFunction(()=>document.querySelector('.archive-post')?.textContent.includes('#11'));
    for (const image of await archive.locator('#archive-posts img').all()) await image.scrollIntoViewIfNeeded();
    await archive.waitForFunction(()=>[...document.querySelectorAll('#archive-posts img')].every(image=>image.complete&&image.naturalWidth>0));
    const assets=await archive.locator('#archive-posts img').evaluateAll(nodes=>nodes.map(n=>({src:n.src,loaded:n.complete&&n.naturalWidth>0})));
    assert(assets.length>=3&&assets.every(a=>a.loaded&&/^(blob:|data:)/.test(a.src)),JSON.stringify(assets));
    const webpImage=archive.getByAltText('WebP二进制头回归');
    assert.deepEqual(await webpImage.evaluate(image=>[image.naturalWidth,image.naturalHeight]),[32,24]);
    await archive.screenshot({path:path.join(output,'actual-extension-reader.png')});
    const beforeRead=requests.length;await archive.reload();await archive.locator('.archive-post').first().waitFor();assert.equal(requests.length,beforeRead,'offline viewer must not fetch originals');
    const popup=await context.newPage();await popup.goto(`chrome-extension://${id}/popup/popup.html`);const fromSettings=context.waitForEvent('page');await popup.locator('#openTopicArchives').click();const library=await fromSettings;await library.waitForURL(`chrome-extension://${id}/popup/archive.html`);await library.locator('#archive-list button').first().waitFor();
    await page.getByLabel('同时保存音视频和附件').check();await page.getByRole('button',{name:'再次存档',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.cc98-topic-archive-status')?.textContent.startsWith('存档完成'),{},{timeout:20000});
    const markdownOpen=context.waitForEvent('page');await page.getByRole('button',{name:'查看存档',exact:true}).click();const filesPage=await markdownOpen;
    await filesPage.locator('.archive-post').first().waitFor();
    const downloading=filesPage.waitForEvent('download');await filesPage.getByRole('button',{name:'5m3z23ao.md',exact:true}).click();const downloaded=await downloading;
    assert.equal(downloaded.suggestedFilename(),'5m3z23ao.md');const downloadedPath=await downloaded.path();assert.equal(await fs.readFile(downloadedPath,'utf8'),markdownText);
    const exporting=filesPage.waitForEvent('download');await filesPage.locator('#archive-export').click();const exported=await exporting;
    const exportPath=path.join(output,'webp-offline.html');await exported.saveAs(exportPath);
    const html=await fs.readFile(exportPath,'utf8'), embedded=html.match(/data:image\/webp;base64,([a-z0-9+/=]+)/i);
    assert(embedded,'WebP is embedded into standalone HTML');assert.deepEqual(Buffer.from(embedded[1],'base64'),webp);
    const offline=await context.browser().newContext({offline:true});
    try {
      const reader=await offline.newPage();await reader.goto(require('node:url').pathToFileURL(exportPath).href);
      const image=reader.getByAltText('WebP二进制头回归').first();await image.scrollIntoViewIfNeeded();
      await image.evaluate(image=>image.decode());assert.deepEqual(await image.evaluate(image=>[image.naturalWidth,image.naturalHeight]),[32,24]);
    }finally{await offline.close()}
    assert.deepEqual(errors,[]);assert.deepEqual(cspErrors,[]);await fs.writeFile(path.join(output,'validation.json'),JSON.stringify({passed:true,checks:['Actual MV3 sender/background/IndexedDB capture','Three pages and offline media reading','Valid WebP with UTF-8-like RIFF size rejected by old detector, now captured, rendered and exported byte-for-byte','Standalone HTML WebP decodes fully offline','Persistence across viewer reload, zero external reads','Shared settings entry opens archive library','Markdown optional capture, offline download bytes and original filename','No CSP violations'],webpFixture:{bytes:webp.length,width:32,height:24,originalRemoteFile:false},assets,errors,cspErrors},null,2));console.log('Actual extension archive integration passed');
  }finally{await context.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
