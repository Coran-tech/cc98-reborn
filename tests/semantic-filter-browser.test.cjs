"use strict";
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..'), origin = 'https://www.cc98.org';
const output = path.join(root, 'outputs/semantic-filter-preview');
const attack = '你连这么简单的话都看不懂，还到处装懂，真是个蠢货。闭嘴吧，没人想听你胡说八道。';
const normal = '我觉得这项安排还有改进空间。工作日晚上有课的同学可能不方便参加，能否再提供一个周末时段？大家的需求不太一样，可以先收集一下意见。';
const contents = [attack, normal, '<blockquote>以下是引用1楼：用户Other在2026-10-16 12:00:00的发言：' + attack + '</blockquote>' + normal];
const html = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>语义规则合成测试 - CC98论坛</title></head><body><div id="root"><h1>语义规则合成测试</h1>'
  + contents.map((text,i) => '<div class="reply" id="post-' + (i+1) + '" data-floor="' + (i+1) + '"><div class="reply-floor">#' + (i+1) + '</div><a href="/user/id/' + (200+i) + '">Synthetic' + i + '</a><div class="reply-content"><div class="substance"><article>' + text + '</article></div></div><div class="signature">' + attack + '</div><div class="reply-footer"><div class="upup"><span class="commentProp">0</span></div><div class="downdown"><span class="commentProp">0</span></div></div></div>').join('')
  + '<div class="pagination"><ul class="page-nav"><li><a href="/topic/100/1">1</a></li></ul></div></div></body></html>';
async function executable() {
  const cache = path.join(process.env.LOCALAPPDATA, 'ms-playwright');
  for (const name of (await fs.readdir(cache)).filter(n=>/^chromium-\d+$/.test(n)).sort().reverse()) {
    const file = path.join(cache,name,'chrome-win64/chrome.exe'); try { await fs.access(file); return file; } catch {}
  }
  throw new Error('Full Chromium is required');
}
async function main() {
  // Headless Chromium cannot accept its native optional-permission bubble.
  // Use an isolated copy with the same extension identity and a pregranted
  // loopback origin; the separate settings test checks the real gesture call.
  await fs.mkdir(output,{recursive:true});
  const fixture = await fs.mkdtemp(path.join(output,'extension-'));
  for(const directory of ['src','popup','assets','images']) await fs.cp(path.join(root,directory),path.join(fixture,directory),{recursive:true});
  const questionDir=path.join(fixture,'experiments/question-mark'); await fs.mkdir(questionDir,{recursive:true});
  for(const file of ['admin-key-store.js','admin.html','admin.js','background.js','content.js','content.css']) await fs.copyFile(path.join(root,'experiments/question-mark',file),path.join(questionDir,file));
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  manifest.host_permissions.push('http://127.0.0.1/*');
  await fs.writeFile(path.join(fixture,'manifest.json'),JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext('', { executablePath: await executable(), headless:true,
    ignoreDefaultArgs:['--disable-extensions'], args:['--disable-extensions-except='+fixture,'--load-extension='+fixture], viewport:{width:1440,height:1000} });
  const checks=[], errors=[]; let page, settingsPage;
  const check = name => {checks.push(name);console.log('ok '+checks.length+': '+name);};
  try {
    await context.route('**/*', route => {
      const url=new URL(route.request().url());
      if (url.protocol==='chrome-extension:' || url.origin==='http://127.0.0.1:8766') return route.continue();
      if (url.origin===origin) return route.fulfill({contentType:'text/html',body:html});
      return route.abort();
    });
    const worker=context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const extensionId = new URL(worker.url()).hostname;
    await worker.evaluate(async () => {
      await chrome.storage.local.set({cc98ComfortSettings:{enabled:true,themeMode:'light',prewarmPostImages:false,previsitFirstPageForTopicImages:false,blockedContentRules:'[]'}});
      consumeStartupUpdateNotice=async()=>({ok:true,show:false});
      getOpenIdBinding=async()=>({ok:true,binding:{bound:true,userId:12345,userName:'Synthetic',boundAt:42}});
      globalThis.semanticRequests=[];
      const original=fetch;
      globalThis.fetch=(url,options)=>{
        if(String(url).startsWith('http://127.0.0.1:8766')) {
          const body=options?.body ? JSON.parse(options.body) : null;
          semanticRequests.push({path:new URL(url).pathname,model:body?.models?.[0],text:body?.text});
        }
        return original(url,options);
      };
    });
    const patch = value => worker.evaluate(async value=> {
      const data=(await chrome.storage.local.get('cc98ComfortSettings')).cc98ComfortSettings;
      await chrome.storage.local.set({cc98ComfortSettings:{...data,...value}});
    }, value);
    const states = () => worker.evaluate(async()=>{
      const [tab]=await chrome.tabs.query({url:'https://www.cc98.org/*'});
      return (await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>({
        status:CC98RebornSemanticFilter.status(),
        reasons:getPostItems().map(item=>({floor:item.index,reason:shouldBlockRebuiltItem(item)}))
      })}))[0].result;
    });
    const waitFor = async (predicate,label,ms=90000) => {
      const until=Date.now()+ms;
      while(Date.now()<until) { const value=await states(); if(predicate(value)) return value; await page.waitForTimeout(150); }
      throw new Error('Timed out: '+label);
    };
    if(process.argv.includes('--settings-only')) {
      page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
      await page.goto(origin+'/#cc98-reborn-blacklist');
      const frameNode=page.locator('iframe.cc98-rebuild-semantic-settings-frame');
      await frameNode.scrollIntoViewIfNeeded();
      const frame=page.frameLocator('iframe.cc98-rebuild-semantic-settings-frame');
      await frame.locator('#semantic-save').waitFor();
      await frame.locator('#semantic-model').selectOption('minilm');
      await page.waitForTimeout(300);
      const height=await frameNode.evaluate(el=>el.getBoundingClientRect().height);
      assert(height>200 && height<12000);
      await frameNode.screenshot({path:path.join(output,'embedded-modern-light.png')});
      await patch({themeMode:'dark',themeStyle:'ascii'});
      await page.setViewportSize({width:390,height:1000});
      await page.waitForTimeout(250);
      await frameNode.scrollIntoViewIfNeeded();
      let outerHeight,innerHeight;
      for(let attempt=0;attempt<20;attempt++) {
        outerHeight=await frameNode.evaluate(el=>el.getBoundingClientRect().height);
        innerHeight=await frame.locator('main').evaluate(el=>el.getBoundingClientRect().height);
        if(Math.abs(outerHeight-innerHeight)<=2) break;
        await page.waitForTimeout(100);
      }
      assert(Math.abs(outerHeight-innerHeight)<=2,JSON.stringify({outerHeight,innerHeight}));
      await frameNode.screenshot({path:path.join(output,'embedded-ascii-dark-mobile.png')});
      await frameNode.evaluate(el=>window.scrollTo(0,window.scrollY+el.getBoundingClientRect().top-120));
      await page.screenshot({path:path.join(output,'embedded-mobile-top-viewport.png')});
      await frameNode.evaluate(el=>window.scrollTo(0,window.scrollY+el.getBoundingClientRect().bottom-window.innerHeight+20));
      await page.screenshot({path:path.join(output,'embedded-mobile-bottom-viewport.png')});
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      assert(await frame.locator('html').evaluate(el=>el.scrollWidth<=innerWidth+1));
      assert.equal((await worker.evaluate(()=>semanticRequests)).length,0);
      assert.deepEqual(errors,[]);
      await fs.writeFile(path.join(output,'embedded-ui-validation.json'),JSON.stringify({passed:true,realMV3:true,noLocalFetch:true,dynamicHeight:height,mobileOuterHeight:outerHeight,mobileInnerHeight:innerHeight,errors},null,2));
      console.log('Embedded UI passed, zero localhost fetches');
      return;
    }
    page=await context.newPage(); page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/topic/100/1'); await page.bringToFront();
    await page.locator('.cc98-rebuild-post[data-post-floor="1"]').waitFor();
    await page.waitForTimeout(450);
    assert.equal((await worker.evaluate(()=>semanticRequests)).length,0); check('default off sends zero localhost requests');
    settingsPage=await context.newPage(); settingsPage.on('pageerror',e=>errors.push(e.message));
    await settingsPage.goto('chrome-extension://'+extensionId+'/popup/semantic-settings.html');
    await settingsPage.locator('#semantic-save').waitFor();
    const token = (await fs.readFile(path.join(process.env.USERPROFILE,'Documents/GitHub/cc98-semantic-lab-runtime/service-token.txt'),'utf8')).trim();
    await settingsPage.locator('#semantic-token').fill(token);
    await settingsPage.locator('#semantic-connect').click();
    await settingsPage.waitForFunction(()=>document.querySelector('#semantic-status').dataset.connected==='true',undefined,{timeout:15000});
    assert.equal(await settingsPage.locator('#semantic-token').inputValue(),'');
    assert.equal(await settingsPage.locator('#semantic-enabled').isChecked(),false); check('manual token connection succeeds without enabling in a preauthorized test profile');
    await patch({semanticFilterEnabled:true,semanticFilterModel:'cold',semanticFilterThreshold:.8});
    await page.bringToFront();
    const cold=await waitFor(value=>value.reasons[0]?.reason.includes('语义规则')&&!value.status.pending&&!value.status.queued,'COLD actual match');
    assert.equal(cold.reasons[1].reason,''); assert.equal(cold.reasons[2].reason,'');
    const sent=await worker.evaluate(()=>semanticRequests.filter(r=>r.path==='/api/v1/evaluate'));
    assert(sent.some(r=>r.text===attack)); assert(sent.some(r=>r.text===normal));
    assert(sent.every(r=>!r.text.includes('以下是引用') && !r.text.includes('</'))); check('real COLD inference folds attack, excludes quotes/signatures and preserves normal posts');
    const reveal=page.getByRole('button',{name:'展开原文',exact:true}); await reveal.first().click();
    await page.locator('.cc98-rebuild-post[data-post-floor="1"]').waitFor();
    await page.waitForTimeout(400); assert(await page.locator('.cc98-rebuild-post[data-post-floor="1"]').isVisible()); check('reveal retains the original post and survives subsequent rebuild');
    await patch({semanticFilterModel:'horizon',semanticFilterThreshold:.5});
    const horizon=await waitFor(value=>value.reasons[0]?.reason.includes('语义规则')&&!value.status.pending&&!value.status.queued,'Horizon actual match');
    assert.equal(horizon.reasons[1].reason,''); check('real Horizon model selection and threshold matching');
    await patch({semanticFilterThreshold:1});
    await waitFor(value=>!value.status.pending&&!value.status.queued&&value.reasons.every(r=>!r.reason),'threshold adjustment'); check('threshold change restores content');
    await patch({semanticFilterModel:'minilm',semanticFilterThreshold:.85,semanticFilterBlockedLabels:'人身攻击'});
    await waitFor(value=>value.reasons[0]?.reason.includes('人身攻击')&&!value.status.pending&&!value.status.queued,'MiniLM actual match'); check('real MiniLM target-label matching');
    const disconnect=await settingsPage.evaluate(()=>chrome.runtime.sendMessage({type:'CC98_SEMANTIC_DISCONNECT'})); assert(disconnect.ok);
    await waitFor(value=>value.reasons.every(r=>!r.reason),'disconnect clears folded cache',10000); check('disconnect invalidates cached matches and restores visible content');
    await patch({semanticFilterEnabled:false});
    assert(!await worker.evaluate(async()=>Boolean((await chrome.storage.local.get('cc98RebornSemanticConnection:v1'))['cc98RebornSemanticConnection:v1'])));
    await page.goto(origin+'/#cc98-reborn-blacklist');
    await page.locator('iframe.cc98-rebuild-semantic-settings-frame').waitFor();
    assert.deepEqual(errors,[]);
    await fs.mkdir(output,{recursive:true});
    const report={checks,passed:true,realMV3:true,realModels:true,permissionPregrantedInIsolatedFixture:true,pageErrors:errors};
    await fs.writeFile(path.join(output,'real-browser-validation.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({passed:true,checks:checks.length}));
  } catch(error) {
    await fs.mkdir(output,{recursive:true});
    // Never capture the connection field or token-bearing extension settings.
    if(page) await page.screenshot({path:path.join(output,'topic-failure.png'),fullPage:true});
    if(settingsPage) console.error(JSON.stringify(await settingsPage.evaluate(async()=>({
      error:document.querySelector('#semantic-error')?.textContent,
      status:document.querySelector('#semantic-status')?.textContent,
      connecting:document.querySelector('#semantic-connect')?.disabled,
      permission:await chrome.permissions.contains({origins:['http://127.0.0.1/*']})
    })).catch(()=>({diagnostics:'unavailable'}))));
    console.error(String(error.message).replace(/[A-Za-z0-9_-]{32,}/g,'[redacted]'));
    process.exitCode=1;
  } finally {await context.close();}
}
main();
