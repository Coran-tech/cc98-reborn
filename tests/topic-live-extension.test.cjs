const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const {executable}=require('./new-topics-virtual.test.cjs');
const {native,shell,apiPost,apiProfiles}=require('./topic-live.test.cjs');
const {png}=require('./topic-archive.test.cjs');
const root=path.resolve(__dirname,'..'),extension=path.join(root,'dist/cc98-reborn-beta');
const origin='https://www.cc98.org',out=path.join(root,'outputs/topic-live-api-20261028/extension');
async function main(){
 await fs.mkdir(out,{recursive:true});
 const context=await chromium.launchPersistentContext('',{executablePath:await executable(),headless:true,ignoreDefaultArgs:['--disable-extensions'],args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`],viewport:{width:1440,height:1000}});
 const requests=[],errors=[];let count=10,hold=false,release;
 try{
  await context.setOffline(true);
  await context.addInitScript(()=>{localStorage.setItem('accessToken','str-Bearer fake-extension-token');if(!localStorage.getItem('userInfo'))localStorage.setItem('userInfo','obj-'+JSON.stringify({id:42,name:'测试用户'}));});
  await context.route('**/*',async route=>{
   const r=route.request(),u=new URL(r.url());if(u.protocol==='chrome-extension:')return route.continue();
   if(u.origin==='https://api.cc98.org'){
    requests.push({url:u.href,type:r.resourceType(),at:Date.now()});assert.equal(r.headers().authorization,'Bearer fake-extension-token');
    if(hold)await new Promise(resolve=>release=resolve);
    const body=u.pathname==='/topic/6500000'?{id:6500000,replyCount:count-1}:u.pathname==='/user'?apiProfiles(u):Array.from({length:Math.min(10,Math.max(0,count-Number(u.searchParams.get('from'))))},(_,i)=>apiPost(Number(u.searchParams.get('from'))+i+1));
    return route.fulfill({json:body}).catch(()=>{});
   }
   const match=u.pathname.match(/^\/topic\/6500000(?:\/(\d+))?$/);
   if(u.origin===origin&&match){
    const n=Number(match[1]||1);requests.push({url:u.href,type:r.resourceType(),at:Date.now()});
    return route.fulfill({contentType:'text/html',body:shell(native(n,count),false)}).catch(()=>{});
   }
   if(/\.(?:png|gif)$/.test(u.pathname))return route.fulfill({contentType:'image/png',body:png});
   return route.abort();
  });
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker');
  await worker.evaluate(async()=>{
   await chrome.storage.local.set({cc98ComfortSettings:{enabled:true,rebuildUi:true,themeStyle:'modern',themeMode:'light',topicDrawerEnabled:true,prewarmPostImages:false,previsitFirstPageForTopicImages:false,openLinksInNewTab:true},'cc98RebornOpenIdBinding:v1':{bound:true,userId:'42',userName:'测试用户',boundAt:Date.now()}});
   consumeStartupUpdateNotice=async()=>({ok:true,show:false});getStoredUpdateStatus=async()=>({ok:true,currentVersion:'0.4.3',latestVersion:'0.4.3',hasUpdate:false});
   getOpenIdBinding=async()=>({ok:true,binding:{bound:true,userId:'42',userName:'测试用户'}});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/topic/6500000/1');await page.locator('.cc98-topic-live-entry').first().waitFor({state:'attached'});
  assert.equal(await page.locator('.cc98-topic-live-entry').first().isVisible(),false,'main toolbar entry remains present but hidden');
  await page.waitForTimeout(1800);assert(!requests.some(r=>r.type==='fetch'),'off by default in actual beta');
  await page.evaluate(()=>{
   window.__parentCards=[...document.querySelectorAll('#cc98-comfort-app [data-post-floor]')];
   const card=document.createElement('article');card.className='cc98-rebuild-card';
   const link=document.createElement('a');link.className='cc98-rebuild-card-title';link.href='/topic/6500000/1';link.textContent='打开测试侧窗';card.append(link);document.querySelector('#cc98-comfort-app').append(card);
  });
  await page.getByRole('link',{name:'打开测试侧窗'}).click();await page.locator('.cc98-topic-drawer-ready').waitFor({timeout:35000});
  const child=await (await page.locator('.cc98-topic-drawer-frame').elementHandle()).contentFrame();
  const childLiveEntry=child.locator('.cc98-topic-live-entry').first();
  await childLiveEntry.waitFor({state:'attached'});assert.equal(await childLiveEntry.isVisible(),false,'drawer toolbar entry is also hidden');assert.equal(await child.locator('.cc98-rebuild-topbar').isVisible(),false);
  // Synthetic activation tests the retained runtime inside an isolated MV3
  // fixture; the hidden entry is not a user-facing start control.
  await childLiveEntry.evaluate(button=>button.click());await child.waitForFunction(()=>document.querySelector('.cc98-topic-live-status')?.textContent.startsWith('跟帖中'));
  count=11;await child.locator('.cc98-topic-live-bar').scrollIntoViewIfNeeded();
  await child.locator('[data-live-floor="11"]').waitFor({timeout:35000});
  assert.equal(await page.locator('[data-live-floor]').count(),0,'child updates do not append to the parent');
  assert(await page.evaluate(()=>__parentCards.every((card,i)=>card===document.querySelectorAll('#cc98-comfort-app > .cc98-rebuild-post-feed [data-post-floor]')[i])));
  const opened=context.waitForEvent('page');await child.getByRole('button',{name:'打开第 11 楼原文及操作',exact:true}).click();const original=await opened;
  await original.waitForURL(origin+'/topic/6500000/2#11');await original.locator('[data-post-floor="11"]').waitFor();await original.close();await page.bringToFront();
  await page.screenshot({path:path.join(out,'actual-beta-drawer.png')});
  hold=true;const pending=await page.waitForRequest(r=>r.resourceType()==='fetch'&&r.url().includes('/Topic/6500000/post'),{timeout:40000});assert(pending);
  await page.getByRole('button',{name:'关闭帖子侧窗',exact:true}).click();assert(child.isDetached());
  release?.();const closed=requests.length;await page.waitForTimeout(22000);assert.equal(requests.length,closed,'closing releases in-flight and scheduled reads');
  assert.equal(await page.locator('.cc98-topic-drawer-frame,.cc98-topic-search-worker,.cc98-rebuild-conversation-probe').count(),0);
  assert(!requests.some(r=>r.type==='fetch'&&r.url.startsWith(origin)),'live never fetches forum HTML');assert.deepEqual(errors,[]);
  const manifest=JSON.parse(await fs.readFile(path.join(extension,'manifest.json'),'utf8'));
  await fs.writeFile(path.join(out,'validation.json'),JSON.stringify({passed:true,version:manifest.version_name,checks:['Actual MV3 beta defaults off and only uses authenticated incremental API; no background HTML/probes','Targeted drawer injection includes live runtime and styles','New reply appended only inside child; native parent cards retained','Original-floor action follows new-tab preference and loads native operations','Drawer close destroys in-flight reader and no further polls occur'],requests,errors},null,2));console.log('Actual beta live-follow drawer passed');
 }finally{release?.();await context.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
