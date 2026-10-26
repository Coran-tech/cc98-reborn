const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const { mixedFixture, markerImage } = require('./new-topics-paint.test.cjs');
const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/card-hover-restore');
const origin = 'https://www.cc98.org';
const FEED = '#cc98-comfort-app [data-cc98-virtual="true"]';
const baseline = process.argv.includes('--baseline');
const extensionRoot = baseline ? path.join(root, 'dist/cc98-reborn-beta') : root;
async function main() {
  const report = { passed: false, baseline, realMV3: true, syntheticOnly: true, changedFiles: ['src/styles.css'], checks: [], screenshots: [], samples: {}, errors: [] };
  await fs.mkdir(output, { recursive: true });
  const context = await chromium.launchPersistentContext('', { executablePath: await executable(), headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--disable-extensions-except='+extensionRoot, '--load-extension='+extensionRoot], viewport: { width: 1440, height: 1000 } });
  let page;
  try {
    const image = markerImage();
    await context.setOffline(true);
    await context.route('**/*', route => {
      const request = route.request(), url = new URL(request.url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.origin !== origin) return route.abort();
      if (request.resourceType() === 'image') return route.fulfill({ contentType: 'image/png', body: image });
      return route.fulfill({ contentType: 'text/html', body: mixedFixture(80) });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    await worker.evaluate(async () => {
      const binding = { bound: true, userId: 795406, userName: 'LocalTester', boundAt: 42 };
      await chrome.storage.local.set({ cc98ComfortSettings: { enabled: true, rebuildUi: true, themeStyle: 'modern', themeMode: 'light', expandTopicCardsByDefault: false, topicDrawerEnabled: true, prewarmPostImages: false, previsitFirstPageForTopicImages: false, semanticFilterEnabled: false, blockedTitleKeywords: '/NotPresent/i', blockedContentRules: '[]', openLinksInNewTab: false }, 'cc98RebornOpenIdBinding:v1': binding });
      consumeStartupUpdateNotice = async () => ({ ok: true, show: false });
      getOpenIdBinding = async () => ({ ok: true, binding });
    });
    page = await context.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', error => report.errors.push(error.message));
    const isolated = (action) => worker.evaluate(async action => {
      const [tab] = await chrome.tabs.query({ url: 'https://www.cc98.org/*' });
      return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [action], func: action => {
        if (action === 'status') return CC98RebornNewTopicsVirtual.status();
        if (action === 'install') { globalThis.__hoverCalls=[]; const original=window.scrollBy.bind(window); window.scrollBy=(...args)=>{const before=scrollY; const result=original(...args); __hoverCalls.push({t:performance.now(),before,after:scrollY,args}); return result;}; return; }
        if (action === 'scrolls') return __hoverCalls;
      }}))[0].result;
    }, action);
    const settle = async(ms=300) => { await page.waitForTimeout(ms); await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); };
    await page.goto(origin+'/newTopics', { waitUntil: 'domcontentloaded' }); await page.locator(FEED).waitFor();
    await page.waitForFunction(()=>__newTopicsFixture.state.refreshClicks>0); await settle(1800); await isolated('install');
    await page.mouse.move(0,0);
    await page.locator(FEED).evaluate(feed=>scrollTo(0,feed.getBoundingClientRect().top+scrollY+420)); await settle();
    const key = await page.locator(FEED).evaluate(feed=>{
      const card=[...feed.children].find(n=>n.matches('.cc98-rebuild-card')&&n.getBoundingClientRect().top>180&&n.getBoundingClientRect().bottom<innerHeight-80&&!n.querySelector('img'));
      if(!card) throw Error('No full no-image card'); return card.dataset.itemKey;
    });
    const card = page.locator(FEED+' > .cc98-rebuild-card').filter({has:page.locator('a.cc98-rebuild-card-title[href="'+key.slice(6)+'"]')});
    const state=()=>card.evaluate(card=>{const meta=card.querySelector('.cc98-rebuild-hover-meta'),b=card.getBoundingClientRect(),m=meta.getBoundingClientRect(),next=card.nextElementSibling?.getBoundingClientRect(); return {top:b.top,height:b.height,bottom:b.bottom,metaTop:m.top,metaHeight:m.height,opacity:getComputedStyle(meta).opacity,position:getComputedStyle(meta).position,maxHeight:getComputedStyle(meta).maxHeight,transition:getComputedStyle(meta).transition,scrollY,documentHeight:document.documentElement.scrollHeight,nextTop:next?.top};});
    report.samples.before=await state();
    const shot=async name=>{const file=path.join(output,(baseline?'baseline-':'candidate-')+name+'.png'); await page.screenshot({path:file});report.screenshots.push(file);};
    await shot('before');
    await page.evaluate(key=>{
      const feed=document.querySelector('[data-cc98-virtual="true"]'),card=[...feed.children].find(n=>n.dataset.itemKey===key), meta=card.querySelector('.cc98-rebuild-hover-meta');
      const probe=window.__hoverAnimation={rows:[],running:true};
      function frame(t){if(!probe.running)return; const r=card.getBoundingClientRect(),m=meta.getBoundingClientRect();probe.rows.push({t,height:r.height,metaHeight:m.height,opacity:Number(getComputedStyle(meta).opacity),scrollY});requestAnimationFrame(frame);}requestAnimationFrame(frame);
    },key);
    const box=await card.boundingBox(); await page.mouse.move(box.x+120,box.y+Math.min(35,box.height/2));
    await page.waitForTimeout(70); report.samples.during=await state(); await shot('during');
    await settle(240);report.samples.expanded=await state();await shot('expanded');
    await page.mouse.move(0,0);await settle(260);report.samples.after=await state();await shot('after');
    report.animation=await page.evaluate(()=>{__hoverAnimation.running=false;return __hoverAnimation.rows;});
    if(!baseline){
      const {before,expanded,after}=report.samples;
      assert.equal(expanded.position,'static','details stay within card, not separate floating bubble');
      assert(expanded.height>before.height+20,'hover grows card naturally');
      assert(expanded.metaTop>=before.top&&expanded.metaTop+expanded.metaHeight<=expanded.bottom+1,'details contained inside expanded card');
      assert(Math.abs((expanded.nextTop-before.nextTop)-(expanded.height-before.height))<=1,'next card follows natural expansion');
      assert(Math.abs(after.height-before.height)<=1&&Math.abs(after.nextTop-before.nextTop)<=1,'leave restores collapsed card/list geometry');
      assert(report.animation.some(row=>row.height>before.height+1&&row.height<expanded.height-1),'animation has real intermediate heights');
      assert(report.animation.every(row=>Math.abs(row.scrollY-before.scrollY)<=1),'hover does not force page-scroll corrections');
    }
    report.checks.push('actual before/during/expanded/after hover render and in-flow geometry');
    // Hover/focus contract is the same for virtual and full display. Avoid the
    // explicit always-expanded preference, which intentionally has no animation.
    await card.locator('.cc98-rebuild-card-title').focus();await settle(220);report.samples.focused=await state();
    if(!baseline)assert(report.samples.focused.height>report.samples.before.height+20,'keyboard focus expands the same details');
    await page.evaluate(()=>document.activeElement.blur());await settle(220);
    report.checks.push('keyboard focus uses same expansion');
    // Append and wheel with cursor outside the feed: isolate data ingestion from
    // expected user-triggered in-flow height animation.
    const beginScrollProbe = () => page.evaluate(()=>{
      const ids=new WeakMap();let serial=0;const id=n=>{if(!n)return 0;if(!ids.has(n))ids.set(n,++serial);return ids.get(n);};
      const p=window.__hoverScroll={frames:[],running:true};const frame=t=>{if(!p.running)return;const feed=document.querySelector('[data-cc98-virtual="true"]'), inset=document.querySelector('.cc98-rebuild-topbar')?.getBoundingClientRect().bottom||0;
      const rows=[...(feed?.querySelectorAll(':scope > .cc98-rebuild-card')||[])].map(n=>{const r=n.getBoundingClientRect();return {key:n.dataset.itemKey,id:id(n),top:r.top,bottom:r.bottom};}).filter(r=>r.bottom>inset&&r.top<innerHeight);
      p.frames.push({t,feed:id(feed),scrollY,rows,mounted:feed?.querySelectorAll(':scope > .cc98-rebuild-card').length||0});requestAnimationFrame(frame);};requestAnimationFrame(frame);
    });
    await beginScrollProbe();
    await page.evaluate(()=>{for(let i=0;i<4;i++)setTimeout(()=>__newTopicsFixture.append(16),i*200);});
    for(let i=0;i<16;i++){await page.mouse.wheel(0,150);await page.waitForTimeout(40);}
    await settle(700);
    report.scroll=await page.evaluate(()=>{__hoverScroll.running=false;return __hoverScroll.frames;});
    report.status=await isolated('status');
    const replaced=[],reversed=[];
    for(let i=1;i<report.scroll.length;i++){const a=report.scroll[i-1],b=report.scroll[i];if(b.scrollY<a.scrollY-2)reversed.push({i,a:a.scrollY,b:b.scrollY});for(const n of b.rows){const old=a.rows.find(v=>v.key===n.key);if(old&&old.id!==n.id)replaced.push({i,key:n.key});}}
    report.scrollMetrics={frames:report.scroll.length,feedRemounts:new Set(report.scroll.map(f=>f.feed)).size-1,blankFrames:report.scroll.filter(f=>!f.rows.length).length,visibleCardReplacements:replaced.length,reverseScrolls:reversed.length,maxMounted:Math.max(...report.scroll.map(f=>f.mounted))};
    assert.equal(report.status.total,144);assert.equal(report.scrollMetrics.feedRemounts,0);assert.equal(report.scrollMetrics.blankFrames,0);assert.equal(report.scrollMetrics.visibleCardReplacements,0);assert.equal(report.scrollMetrics.reverseScrolls,0);assert(report.scrollMetrics.maxMounted<150);
    report.checks.push('64 appended titles with active negative regex + continuous wheel: feed/card identity retained, no blank/reverse scroll, bounded DOM');
    const hoverPoint = await page.locator(FEED).evaluate(feed=>({x:feed.getBoundingClientRect().left+120,y:440}));
    await page.mouse.move(hoverPoint.x,hoverPoint.y);await settle(220);await beginScrollProbe();
    await page.evaluate(()=>{for(let i=0;i<2;i++)setTimeout(()=>__newTopicsFixture.append(16),i*230);});
    for(let i=0;i<16;i++){await page.mouse.wheel(0,130);await page.waitForTimeout(45);}
    await page.mouse.move(0,0);await settle(650);
    report.hoverWheel=await page.evaluate(()=>{__hoverScroll.running=false;return __hoverScroll.frames;});
    const hoverReplaced=[];
    for(let i=1;i<report.hoverWheel.length;i++)for(const n of report.hoverWheel[i].rows){const old=report.hoverWheel[i-1].rows.find(v=>v.key===n.key);if(old&&old.id!==n.id)hoverReplaced.push({i,key:n.key});}
    report.hoverWheelMetrics={frames:report.hoverWheel.length,feedRemounts:new Set(report.hoverWheel.map(f=>f.feed)).size-1,blankFrames:report.hoverWheel.filter(f=>!f.rows.length).length,visibleCardReplacements:hoverReplaced.length,maxMounted:Math.max(...report.hoverWheel.map(f=>f.mounted))};
    assert.equal(report.hoverWheelMetrics.feedRemounts,0);assert.equal(report.hoverWheelMetrics.blankFrames,0);assert.equal(report.hoverWheelMetrics.visibleCardReplacements,0);assert(report.hoverWheelMetrics.maxMounted<150);
    assert.equal((await isolated('status')).total,176);
    report.checks.push('pointer over cards during wheel + 32 appended titles: natural hover height changes without feed/card replacement or blank frames');
    await page.mouse.move(0,0);await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await settle();
    const last=page.locator(FEED+' > .cc98-rebuild-card').last();
    const endBefore=await last.evaluate(n=>({height:n.getBoundingClientRect().height,doc:document.documentElement.scrollHeight,y:scrollY}));
    const lastBox=await last.boundingBox();await page.mouse.move(lastBox.x+120,lastBox.y+35);await settle(260);
    const endHover=await last.evaluate(n=>({height:n.getBoundingClientRect().height,doc:document.documentElement.scrollHeight,y:scrollY}));
    await page.mouse.move(0,0);await settle(260);
    const endAfter=await last.evaluate(n=>({height:n.getBoundingClientRect().height,doc:document.documentElement.scrollHeight,y:scrollY}));
    report.samples.documentEnd={before:endBefore,hover:endHover,after:endAfter};
    if(!baseline){assert(endHover.height>endBefore.height+20);assert(Math.abs(endAfter.height-endBefore.height)<=1);assert(Math.abs(endAfter.y-endBefore.y)<=2);}
    report.checks.push('actual last-card expansion and leave settle without a scroll-position oscillation');
    const patch=async value=>{await worker.evaluate(async patch=>{const data=await chrome.storage.local.get('cc98ComfortSettings');await chrome.storage.local.set({cc98ComfortSettings:{...data.cc98ComfortSettings,...patch}});},value);await settle(350);};
    await patch({expandTopicCardsByDefault:true});
    const expandedDefault=await page.locator(FEED+' .cc98-rebuild-hover-meta').first().evaluate(n=>({opacity:getComputedStyle(n).opacity,height:n.getBoundingClientRect().height,transition:getComputedStyle(n).transition,position:getComputedStyle(n).position}));
    assert(Number(expandedDefault.opacity)>.9&&expandedDefault.height>10&&expandedDefault.position==='static');report.defaultExpanded=expandedDefault;
    await patch({themeStyle:'ascii',expandTopicCardsByDefault:false});
    report.ascii=await page.locator(FEED+' .cc98-rebuild-hover-meta').first().evaluate(n=>({opacity:getComputedStyle(n).opacity,height:n.getBoundingClientRect().height,position:getComputedStyle(n).position}));
    assert(Number(report.ascii.opacity)>.9&&report.ascii.height>10&&report.ascii.position==='static');
    report.checks.push('always-expanded preference and ASCII metadata stay visible in normal flow');
    assert.deepEqual(report.errors,[]);report.scrollCalls=await isolated('scrolls');report.passed=true;
    await fs.writeFile(path.join(output,baseline?'baseline.json':'validation.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({passed:true,baseline,checks:report.checks,scrollMetrics:report.scrollMetrics,output}));
  }catch(error){report.error=error.stack;if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});await fs.writeFile(path.join(output,baseline?'baseline-failure.json':'failure.json'),JSON.stringify(report,null,2));throw error;}
  finally{await context.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
