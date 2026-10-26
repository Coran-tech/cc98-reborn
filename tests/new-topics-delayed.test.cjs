const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { PNG } = require('pngjs');
const { chromium } = require('playwright');
const { mixedFixture, markerImage } = require('./new-topics-paint.test.cjs');
const { executable } = require('./new-topics-virtual.test.cjs');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'outputs/new-topics-delayed-stability');
const extensionRoot = process.argv.includes('--candidate') ? root : path.join(root, 'dist/cc98-reborn-beta');
const origin = 'https://www.cc98.org';
const FEED = '#cc98-comfort-app [data-cc98-virtual="true"]';
const initialCount = Number(process.argv.find(value => value.startsWith('--count='))?.split('=')[1] || 48);
const matching = process.argv.includes('--matching');
const workerDelay = Number(process.argv.find(value => value.startsWith('--ipc-delay='))?.split('=')[1] || 0);
const titleRule = matching ? '/topic ' + String(initialCount).padStart(4,'0') + '/i' : '/NotPresent/i';
const holdOnly = process.argv.includes('--hold-only');
const caseName = initialCount+'-'+(matching?'match':'negative')+'-ipc'+workerDelay;

function fixture() {
  const script = `(() => {
    const probe = window.__nativeDelayed = { events: [], batches: [], pending: false, allowed: false };
    function more() {
      if (!probe.allowed || probe.pending || __newTopicsFixture.state.count >= ${initialCount + 56}) return;
      probe.pending = true;
      const first = __newTopicsFixture.state.count;
      probe.events.push({t:performance.now(),kind:'request',first,y:scrollY});
      setTimeout(() => {
        __newTopicsFixture.append(8);
        probe.batches.push({t:performance.now(),first,end:first+8});
        probe.events.push({t:performance.now(),kind:'append',first,y:scrollY});
        setTimeout(() => { probe.pending = false; }, 450);
      }, 180);
    }
    const onScroll = () => { if (probe.events.length < 8) probe.events.push({t:performance.now(),kind:'scroll',allowed:probe.allowed,y:scrollY,height:document.documentElement.scrollHeight}); if (scrollY + innerHeight > document.documentElement.scrollHeight - 550) more(); };
    addEventListener('scroll', onScroll, {passive:true,capture:true});
    document.addEventListener('scroll', onScroll, {passive:true,capture:true});
    probe.request = more;
    document.getElementById('focus-topic-getMore').onclick = more;
  })();`;
  return mixedFixture(initialCount).replace('</body>', '<script>' + script + '</script></body>');
}

async function main() {
  const report = { baseline: !process.argv.includes('--candidate'), extensionRoot, realMV3: true, syntheticOnly: true, initialCount, titleRule, workerRequestDelayMs: workerDelay, workerResults: 'unchanged real extension worker; optional IPC scheduling delay is an explicit controlled timing input', watermark: 'private fake TEST0001', scenarios: [], errors: [], screenshots: [] };
  await fs.mkdir(output, { recursive: true });
  const context = await chromium.launchPersistentContext('', { executablePath: await executable(), headless: true, ignoreDefaultArgs: ['--disable-extensions'], args: ['--disable-extensions-except=' + extensionRoot, '--load-extension=' + extensionRoot], viewport: { width: 1440, height: 1000 } });
  try {
    const image = markerImage();
    await context.setOffline(true);
    await context.route('**/*', async route => {
      const request = route.request(), url = new URL(request.url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.origin !== origin) return route.abort();
      if (request.resourceType() === 'image') {
        const index = Number(url.pathname.match(/virtual-(\d+)-/)?.[1] || 0);
        await new Promise(resolve => setTimeout(resolve, [180, 480, 900][index % 3]));
        return route.fulfill({ contentType: 'image/png', body: image }).catch(() => {});
      }
      return route.fulfill({ contentType: 'text/html', body: fixture() });
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    report.build = await worker.evaluate(async titleRule => {
      const binding = { bound: true, userId: 795406, userName: 'LocalTester', boundAt: 42, watermarkIdPrefix: 'TEST0001' };
      await chrome.storage.local.set({ cc98ComfortSettings: { enabled: true, rebuildUi: true, themeStyle: 'ascii', themeMode: 'light', expandTopicCards: false, topicDrawerEnabled: true, prewarmPostImages: false, previsitFirstPageForTopicImages: false, semanticFilterEnabled: false, blockedTitleKeywords: titleRule, blockedContentRules: '[]', openLinksInNewTab: false }, 'cc98RebornOpenIdBinding:v1': binding });
      consumeStartupUpdateNotice = async () => ({ ok: true, show: false }); getOpenIdBinding = async () => ({ ok: true, binding });
      return chrome.runtime.getManifest().version_name;
    }, titleRule);
    const page = await context.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', error => report.errors.push(error.message));
    await page.goto(origin + '/newTopics', { waitUntil: 'domcontentloaded' }); await page.locator(FEED).waitFor();
    await page.waitForFunction(() => __newTopicsFixture.state.refreshClicks > 0); await page.waitForTimeout(2200);
    await page.locator('cc98-reborn-watermark').waitFor({ state: 'attached' });
    const isolated = (action, value = null) => worker.evaluate(async ({ action, value }) => {
      const [tab] = await chrome.tabs.query({ url: 'https://www.cc98.org/*' });
      return (await chrome.scripting.executeScript({ target: { tabId: tab.id }, args: [action, value], func: (action, value) => {
        if (action === 'trace') return globalThis.__delayedTrace.entries;
        if (action === 'reset') { __delayedTrace.entries = []; return; }
        if (action === 'status') return CC98RebornNewTopicsVirtual.status();
        if (action === 'filter-status') return CC98RebornContentFilter.status?.() || null;
        if (action !== 'install') throw new Error(action);
        const trace = globalThis.__delayedTrace = { entries: [] };
        const compact = node => node instanceof Element ? {tag:node.tagName,id:node.id,key:node.dataset.itemKey,cls:String(node.className).slice(0,150)} : {};
        const record = (kind, detail = {}) => { if(trace.entries.length<18000)trace.entries.push({t:performance.now(),kind,y:scrollY,...detail}); };
        const sent=new WeakSet(),send=MessagePort.prototype.postMessage;
        MessagePort.prototype.postMessage=function(message,...rest){if(Number.isSafeInteger(message?.id)&&Array.isArray(message?.rules)){if(!sent.has(this)){sent.add(this);this.addEventListener('message',event=>record('filter-result',{data:event.data}));}record('filter-job',{id:message.id,textLength:message.text?.length,rules:message.rules});if(value?.workerDelay){setTimeout(()=>{record('filter-send',{id:message.id});send.call(this,message,...rest);},value.workerDelay);return;}}return send.call(this,message,...rest);};
        document.addEventListener('cc98-content-rules-updated',()=>record('filter-notify-event'));
        const by = window.scrollBy.bind(window); window.scrollBy = (...args) => {const before=scrollY;const result=by(...args);record('scrollBy',{args,before,after:scrollY,stack:new Error().stack});return result;};
        const originalRaf = window.requestAnimationFrame.bind(window);
        window.requestAnimationFrame = callback => { const stack = new Error().stack; return originalRaf(t => {try{return callback(t);}finally{if(/new-topics-virtual/.test(stack))record('vlist-raf',{stack,status:globalThis.CC98RebornNewTopicsVirtual?.status()});}}); };
        for (const name of ['getTopicItems','renderTopicCard','syncRebuiltContent','renderRebuiltUi','scheduleRebuild']) {
          const original = globalThis[name]; if(typeof original!=='function')continue;
          globalThis[name] = function(...args){record(name,{href:args[0]?.href,stack:new Error().stack});return original.apply(this,args);};
        }
        const observed = new WeakSet(), resize = new ResizeObserver(entries=>record('resize-observer',{targets:entries.map(entry=>({...compact(entry.target),height:entry.contentRect.height,width:entry.contentRect.width}))}));
        const observe = () => {const feed=document.querySelector('[data-cc98-virtual="true"]');if(feed&&!observed.has(feed)){observed.add(feed);resize.observe(feed);} for(const card of feed?.querySelectorAll(':scope > .cc98-rebuild-card')||[]){if(!observed.has(card)){observed.add(card);resize.observe(card);}}};
        new MutationObserver(records=>{const relevant=records.filter(item=>item.target instanceof Element&&(item.target.closest('#cc98-comfort-app')||item.target===document.documentElement));if(relevant.length)record('mutation',{records:relevant.slice(0,30).map(item=>({type:item.type,attribute:item.attributeName,target:compact(item.target),added:item.addedNodes.length,removed:item.removedNodes.length}))});observe();}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','data-status']});observe();
        const clear = CanvasRenderingContext2D.prototype.clearRect; CanvasRenderingContext2D.prototype.clearRect = function(...args){if(this.canvas.getRootNode()?.host?.tagName==='CC98-REBORN-WATERMARK')record('watermark-clear',{args});return clear.apply(this,args);};
      } }))[0].result;
    }, { action, value });
    await isolated('install',{workerDelay});
    const timeOrigin = await page.evaluate(() => performance.timeOrigin);
    const cdp = await context.newCDPSession(page); let scenario = null;
    cdp.on('Page.screencastFrame', event => { cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{}); if(scenario)scenario.raster.push({t:event.metadata.timestamp*1000-timeOrigin,data:event.data}); });
    await cdp.send('Page.startScreencast',{format:'png',everyNthFrame:1,maxWidth:1440,maxHeight:1000});
    await page.evaluate(() => {
      const ids = new WeakMap(); let count = 0; const id = node => {if(!node)return 0;if(!ids.has(node))ids.set(node,++count);return ids.get(node);};
      const probe = window.__delayedPaint = {running:true,active:false,frames:[],firstSeen:[],seen:new Set()};
      const sample = t => {
        if(probe.active){
          const feed=document.querySelector('[data-cc98-virtual="true"]'),inset=document.querySelector('.cc98-rebuild-topbar')?.getBoundingClientRect().bottom||0;
          const cards=[...feed?.querySelectorAll(':scope > .cc98-rebuild-card')||[]].map(card=>{const r=card.getBoundingClientRect();let opacity=1,hidden=false;for(let n=card;n instanceof Element;n=n.parentElement){const css=getComputedStyle(n);opacity*=Number(css.opacity);hidden||=css.display==='none'||css.visibility==='hidden';}return {key:card.dataset.itemKey,id:id(card),x:r.x,top:r.top,width:r.width,height:r.height,bottom:r.bottom,opacity,hidden,images:[...card.querySelectorAll('img')].map(image=>({id:id(image),src:image.currentSrc||image.src,complete:image.complete,naturalWidth:image.naturalWidth,status:image.closest('.cc98-rebuild-image-frame')?.dataset.status}))};}).filter(card=>card.bottom>inset&&card.top<innerHeight);
          for(const card of cards){const index=Number(card.key?.match(/topic\/(\d+)/)?.[1])-7000000;const batch=__nativeDelayed.batches.find(batch=>batch.t>=probe.started&&index>=batch.first&&index<batch.end);if(batch&&!probe.seen.has(batch.first)){probe.seen.add(batch.first);probe.firstSeen.push({t,first:batch.first,key:card.key,top:card.top,y:scrollY,appendT:batch.t});}}
          probe.frames.push({t,y:scrollY,inset,feed:id(feed),cards,watermark:Boolean(document.querySelector('cc98-reborn-watermark'))});
        } if(probe.running)requestAnimationFrame(sample);
      };requestAnimationFrame(sample);
    });
    for (const mode of holdOnly ? ['hold-after-new-visible'] : ['hold-after-new-visible','continuous-wheel-after-new-visible']) {
      await page.evaluate(() => {__nativeDelayed.allowed=false;__delayedPaint.active=false;scrollTo(0,document.documentElement.scrollHeight-1300);});await page.waitForTimeout(1100);
      const filterBefore = await isolated('filter-status');
      await isolated('reset');
      scenario = {mode,raster:[]};
      await page.evaluate(() => {__delayedPaint.frames=[];__delayedPaint.firstSeen=[];__delayedPaint.seen.clear();__delayedPaint.started=performance.now();__delayedPaint.active=true;__nativeDelayed.allowed=true;});
      let appeared = false;
      const deadline=Date.now()+8000;
      for(let i=0;i<30&&Date.now()<deadline;i++){await page.mouse.wheel(0,100);await page.waitForTimeout(70);await page.evaluate(()=>{if(scrollY+innerHeight>document.documentElement.scrollHeight-550)__nativeDelayed.request();});if(await page.evaluate(()=>__delayedPaint.firstSeen.length>0)){appeared=true;break;}}
      if(!appeared){report.initializationDebug=await page.evaluate(()=>({events:__nativeDelayed.events,batches:__nativeDelayed.batches,firstSeen:__delayedPaint.firstSeen,lastFrames:__delayedPaint.frames.slice(-3),y:scrollY,height:document.documentElement.scrollHeight,count:__newTopicsFixture.state.count}));console.log(JSON.stringify(report.initializationDebug));}
      assert(appeared,'native scroll append becomes visible before observing delayed upper content');
      if(mode==='continuous-wheel-after-new-visible')for(let i=0;i<24;i++){await page.mouse.wheel(0,24);await page.waitForTimeout(80);}
      else await page.waitForTimeout(2400);
      await page.evaluate(()=>{__nativeDelayed.allowed=false;__delayedPaint.active=false;});
      const browser = await page.evaluate(()=>({frames:__delayedPaint.frames,firstSeen:__delayedPaint.firstSeen,native:__nativeDelayed.events,batches:__nativeDelayed.batches}));
      Object.assign(scenario,browser,{trace:await isolated('trace'),status:await isolated('status'),filterBefore,filterAfter:await isolated('filter-status')});
      const shot=path.join(output,(report.baseline?'baseline-':'candidate-')+caseName+'-'+mode+'.png');await page.screenshot({path:shot});report.screenshots.push(shot);
      report.scenarios.push(scenario);console.log('delayed probe: '+mode+' '+JSON.stringify({raf:scenario.frames.length,compositor:scenario.raster.length,firstSeen:scenario.firstSeen,status:scenario.status}));
      scenario=null;
      if(matching&&mode==='hold-after-new-visible'){
        const card=page.locator(FEED+' > [data-item-key="topic:'+origin+'/topic/'+(7000000+initialCount)+'/1"]');
        await card.locator('.cc98-rebuild-blocked-actions').waitFor();
        report.matchReveal={folded:true};await card.getByRole('button',{name:/显示/}).click();
        await page.locator(FEED+' a.cc98-rebuild-card-title').filter({hasText:'Synthetic topic '+String(initialCount).padStart(4,'0')}).waitFor();report.matchReveal.revealed=true;
      }
    }
    await cdp.send('Page.stopScreencast');await page.evaluate(()=>{__delayedPaint.running=false;});
    for(const scenario of report.scenarios){
      scenario.comparisons=[];scenario.suspects=[];
      scenario.rasterEvidence=[];
      for(let i=0;i<scenario.raster.length;i++){const frame=scenario.raster[i];if(scenario.firstSeen.some(event=>frame.t>=event.t-80&&frame.t<=event.t+500)){const file=path.join(output,(report.baseline?'baseline-':'candidate-')+caseName+'-'+scenario.mode+'-t'+Math.round(frame.t)+'.png');await fs.writeFile(file,Buffer.from(frame.data,'base64'));scenario.rasterEvidence.push({t:frame.t,path:file});}}
      for(let i=1;i<scenario.raster.length;i++){
        const previous=scenario.raster[i-1],current=scenario.raster[i];
        const near=t=>scenario.frames.reduce((best,frame)=>!best||Math.abs(frame.t-t)<Math.abs(best.t-t)?frame:best,null);
        const a=near(previous.t),b=near(current.t);if(!a||!b||Math.abs(a.t-previous.t)>60||Math.abs(b.t-current.t)>60)continue;
        const window=scenario.firstSeen.find(event=>current.t>=event.t&&current.t<=event.t+2200);if(!window)continue;
        const pngA=PNG.sync.read(Buffer.from(previous.data,'base64')),pngB=PNG.sync.read(Buffer.from(current.data,'base64'));
        for(const row of b.cards){const old=a.cards.find(value=>value.key===row.key);if(!old||Number(row.key.match(/topic\/(\d+)/)?.[1])-7000000>=window.first)continue;
          const from=Math.max(0,a.inset-old.top,b.inset-row.top),to=Math.min(old.height,row.height,1000-old.top,1000-row.top);if(to-from<50||Math.abs(old.width-row.width)>2)continue;
          let changed=0,total=0,inkA=0,inkB=0,difference=0;
          for(let y=Math.ceil(from+3);y<to-3;y+=2)for(let x=4;x<Math.min(old.width,row.width)-4;x+=2){const ax=Math.round(old.x+x),ay=Math.round(old.top+y),bx=Math.round(row.x+x),by=Math.round(row.top+y);if(ax<0||bx<0||ax>=1440||bx>=1440||ay<0||by<0||ay>=1000||by>=1000)continue;const ai=(ay*pngA.width+ax)*4,bi=(by*pngB.width+bx)*4;let delta=0;for(let c=0;c<3;c++)delta+=Math.abs(pngA.data[ai+c]-pngB.data[bi+c]);if(delta>90)changed++;difference+=delta/3;if(Math.min(...pngA.data.subarray(ai,ai+3))<140)inkA++;if(Math.min(...pngB.data.subarray(bi,bi+3))<140)inkB++;total++;}
          if(!total)continue;const comparison={t:current.t,sinceNewVisibleMs:current.t-window.t,key:row.key,previousCard:old.id,currentCard:row.id,deltaY:row.top-old.top,scrollDelta:b.y-a.y,layoutDelta:row.top-old.top+b.y-a.y,changedRatio:changed/total,meanDelta:difference/total,inkA,inkB,inkLoss:inkA>50?1-inkB/inkA:0};scenario.comparisons.push(comparison);
          if(comparison.changedRatio>.2||comparison.inkLoss>.45||row.hidden||row.opacity<.5){const name=(report.baseline?'baseline-':'candidate-')+caseName+'-'+scenario.mode+'-suspect-'+scenario.suspects.length;await fs.writeFile(path.join(output,name+'-before.png'),Buffer.from(previous.data,'base64'));await fs.writeFile(path.join(output,name+'-after.png'),Buffer.from(current.data,'base64'));scenario.suspects.push({...comparison,before:path.join(output,name+'-before.png'),after:path.join(output,name+'-after.png'),events:scenario.trace.filter(event=>Math.abs(event.t-current.t)<100)});}
        }
      }
      const t0=scenario.firstSeen[0]?.t||Infinity;
      scenario.afterNewRemounts=[];for(let i=1;i<scenario.frames.length;i++){const before=scenario.frames[i-1],after=scenario.frames[i];if(after.t>t0&&after.feed!==before.feed)scenario.afterNewRemounts.push({t:after.t,sinceNewVisibleMs:after.t-t0,before:before.feed,after:after.feed});}
      scenario.metrics={raf:scenario.frames.length,compositor:scenario.raster.length,firstNewVisible:scenario.firstSeen,afterNewRemounts:scenario.afterNewRemounts,filterJobs:scenario.trace.filter(value=>value.kind==='filter-job').length,filterResults:scenario.trace.filter(value=>value.kind==='filter-result').length,filterNotifications:scenario.trace.filter(value=>value.kind==='filter-notify-event').length,upperComparisons:scenario.comparisons.length,suspects:scenario.suspects.length,maxUpperChangedRatio:Math.max(0,...scenario.comparisons.map(value=>value.changedRatio)),maxUpperInkLoss:Math.max(0,...scenario.comparisons.map(value=>value.inkLoss)),scrollByCalls:scenario.trace.filter(value=>value.kind==='scrollBy').length,watermarkClears:scenario.trace.filter(value=>value.kind==='watermark-clear').length};
      scenario.metrics.afterNewEmptyFrames=scenario.frames.filter(frame=>frame.t>t0&&frame.t<t0+2200&&!frame.cards.length).length;
      for(const frame of scenario.raster)delete frame.data;
    }
    report.metrics=report.scenarios.map(scenario=>({mode:scenario.mode,...scenario.metrics}));
    if(!report.baseline){assert(report.scenarios.every(value=>value.afterNewRemounts.length===0),'async title completion never remounts the live feed after new lower content is visible');assert(report.scenarios.every(value=>value.metrics.afterNewEmptyFrames===0),'no empty upper viewport after lower content appears');for(const value of report.scenarios){if(value.filterBefore&&value.filterAfter){assert.equal(value.filterAfter.pending,0,'all newly queued title workers settle');assert.equal(value.filterAfter.titleEntries-value.filterBefore.titleEntries,value.metrics.filterJobs,'cached resident titles are not re-evaluated while appending new titles');}}assert.deepEqual(report.errors,[]);report.passed=true;}
    await fs.writeFile(path.join(output,(report.baseline?'baseline-':'candidate-')+caseName+'-delayed-evidence.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({baseline:report.baseline,metrics:report.metrics,errors:report.errors,output}));
  }catch(error){report.error=error.stack;await fs.writeFile(path.join(output,'delayed-failure.json'),JSON.stringify(report,null,2));throw error;}finally{await context.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
