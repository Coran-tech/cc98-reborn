const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const {chromium}=require('playwright');
const {executable}=require('./new-topics-virtual.test.cjs');
const {png}=require('./topic-archive.test.cjs');
const root=path.resolve(__dirname,'..'),origin='https://www.cc98.org',out=path.join(root,'outputs/topic-live-api-20261028/browser');
function reply(floor) {
 const body=floor<=10?Array.from({length:3},()=>`<p>原有第${floor}楼，正在阅读的正文保持不变。</p>`).join('')
   :floor===12?'':`<p>新增第${floor}楼</p><blockquote>引用内容</blockquote><img src="https://file.cc98.org/new.png" onerror="window.__attack=1"><img src="https://www.cc98.org/static/images/ac/01.png" alt="[ac01]">`;
 return `<div class="reply" id="${700000+floor}" data-floor="${floor}"><a href="/user/id/${1000+floor}">用户${floor}</a>${floor===12?'<span class="anonymousName">匿名 ABC123</span>':''}<span class="reply-floor">${floor}</span><div class="reply-content"><div class="substance"><article>${body}</article></div></div><div class="signature"><article>签名${floor}</article></div><div>发表于 2026-10-28 16:00:00</div><button>赞 0</button><button>踩 0</button><button>引用</button></div>`;
}
function apiPost(floor) {
 return {id:700000+floor,topicId:6500000,floor,userId:floor===15?1011:1000+floor,userName:floor===12?'abc123':`用户${floor}`,isAnonymous:floor===12,isDeleted:floor===16,
  content:floor===12?'':floor===14?`新增第${floor}楼\n\n> Markdown 引用\n\n![图片](https://file.cc98.org/new.png)\n<img src="https://file.cc98.org/new.png" onerror="window.__attack=1"><svg><a xlink:href="javascript:window.__attack=1">危险链接</a><set attributeName="href" to="javascript:window.__attack=1"></set></svg>`:
    `新增第${floor}楼[quote]引用内容[/quote][img]https://file.cc98.org/new.png[/img][ac01]`, contentType:floor===14?1:0,
  time:'2026-10-28T16:00:00+08:00',likeCount:2,dislikeCount:1,awards:[{operatorName:'评分用户',content:'风评值 +1',reason:'测试理由'}]};
}
function apiProfiles(url) {return url.searchParams.getAll('id').map(id=>({id:Number(id),name:`用户${Number(id)-1000}`,portraitUrl:'https://file.cc98.org/avatar.png',signatureCode:`签名${Number(id)-1000}`}))}
function native(page,total) {
 const last=Math.max(1,Math.ceil(total/10));
 return `<section class="topicInfo-info"><h1 id="essay1">跟帖测试</h1><button class="followTopic">收藏</button></section><div id="native-posts">${Array.from({length:Math.min(10,Math.max(0,total-(page-1)*10))},(_,i)=>reply((page-1)*10+i+1)).join('')}<div class="reply" id="pending-reply">尚未加载的外壳</div></div><div class="pagination"><div class="page-nav">${Array.from({length:last},(_,i)=>`<a href="/topic/6500000/${i+1}">${i+1}</a>`).join('')}</div></div>`;
}
function shell(body,scripts=true) {
 return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>跟帖测试 - CC98论坛</title>${['theme-tokens.css','styles.css','interface-styles.css','topic-live.css'].map(f=>`<link rel="stylesheet" href="/src/${f}">`).join('')}</head><body><div id="root"><div class="topBar"><a href="/">CC98</a></div>${body}</div>${scripts?['theme-core.js','interface-style.js','vendor/showdown/showdown.min.js','extended-ubb-core.js','extended-ubb.js','conversation-core.js','conversation.js','topic-live-api.js','topic-live.js','content.js'].map(f=>`<script src="/src/${f}"></script>`).join(''):''}</body></html>`;
}
async function main(){
 await fs.mkdir(out,{recursive:true});const browser=await chromium.launch({executablePath:await executable(),headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage();
 const errors=[],requests=[],unexpected=[],checks=[];let count=10,failure=0,failFrom=null;const backgroundPages=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-28T08:00:00Z')});
 await context.addInitScript(()=>{
  if(!localStorage.getItem('userInfo'))localStorage.setItem('userInfo','obj-'+JSON.stringify({id:42,name:'测试用户'}));localStorage.setItem('accessToken','str-Bearer fake-browser-token');window.__listeners=[];
  window.chrome={runtime:{getManifest:()=>({version:'0.4.3',version_name:'beta 0.4.3 (build live-test)'}),getURL:p=>new URL('/'+p,location.origin).href,onMessage:{addListener(){}},sendMessage:(m,c)=>{c?.({ok:false});return Promise.resolve({ok:false})}},storage:{local:{get:(k,c)=>{const value={cc98ComfortSettings:{enabled:true,rebuildUi:true,previsitFirstPageForTopicImages:false,prewarmPostImages:false,themeStyle:'modern',themeMode:'light'},'cc98RebornOpenIdBinding:v1':{bound:true,userId:'42',userName:'测试用户'}};c?.(value);return Promise.resolve(value)},set:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener:fn=>__listeners.push(fn)}}};
 });
 await context.route('**/*',async route=>{
  const r=route.request(),u=new URL(r.url()),match=u.pathname.match(/^\/topic\/6500000(?:\/(\d+))?$/);
  if(u.origin==='https://api.cc98.org') {
   requests.push({path:u.pathname+u.search,at:await page.evaluate(()=>Date.now())});
   assert.equal(r.headers().authorization,'Bearer fake-browser-token');assert.equal(r.method(),'GET');
   if(failure||(failFrom!==null&&u.pathname.endsWith('/post')&&Number(u.searchParams.get('from'))===failFrom))return route.fulfill({status:failure||500,headers:failure===429?{'Retry-After':'600','Access-Control-Expose-Headers':'Retry-After'}:{},body:'failure'});
   if(u.pathname==='/topic/6500000')return route.fulfill({json:{id:6500000,replyCount:count-1}});
   if(u.pathname==='/Topic/6500000/post') {const from=Number(u.searchParams.get('from'));return route.fulfill({json:Array.from({length:Math.min(10,Math.max(0,count-from))},(_,i)=>apiPost(from+i+1))})}
   if(u.pathname==='/user')return route.fulfill({json:apiProfiles(u)});
   unexpected.push(u.href);return route.abort();
  }
  if(match){const n=Number(match[1]||1),foreground=r.resourceType()==='document'&&r.frame()===page.mainFrame();
   if(!foreground)backgroundPages.push(u.href);
   return route.fulfill({contentType:'text/html',body:shell(native(n,10),foreground)});
  }
  if(/\.(?:png|gif)$/.test(u.pathname))return route.fulfill({contentType:'image/png',body:png});
  if(u.origin===origin&&u.pathname.startsWith('/src/'))return route.fulfill({path:path.join(root,u.pathname)});
  if(u.pathname.endsWith('/favicon.ico'))return route.fulfill({status:204,body:''});
  unexpected.push(u.href);return route.abort();
 });
 const tick=async(ms=22000)=>{await page.clock.fastForward(ms);await page.waitForTimeout(80)};
 const watching=()=>page.waitForFunction(()=>document.querySelector('.cc98-topic-live-status')?.textContent.startsWith('跟帖中'));
 try{
  await page.goto(origin+'/topic/6500000/1');await page.locator('[data-post-floor="10"]').waitFor();
  const liveEntry=page.locator('.cc98-topic-live-entry').first();
  await liveEntry.waitFor({state:'attached'});assert.equal(await liveEntry.isVisible(),false,'toolbar entry is temporarily hidden, not removed');
  await tick(60000);assert.equal(requests.length,0,'default off makes no background reads');
  await page.evaluate(()=>{
   window.__reader=CC98RebornConversation.createReader(getTopicPageInfo());
   window.__cached=JSON.stringify([...__reader.cachedPages()]);
   window.__cards=[...document.querySelectorAll('.cc98-rebuild-post-feed > .cc98-rebuild-post')];
   const draft=document.createElement('textarea');draft.id='live-draft';draft.value='保留的回复草稿';document.querySelector('#cc98-comfort-app').append(draft);draft.setSelectionRange(2,4);
  });
  // The entry is intentionally hidden; synthetic activation only exercises
  // the retained experimental runtime, not a currently available user action.
  await liveEntry.evaluate(button=>button.click());await watching();
  assert.equal(requests.length,1);assert.equal(await page.locator('.cc98-topic-live-posts > article').count(),0,'baseline does not insert old replies');
  count=11;await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,320)});const y=await page.evaluate(()=>scrollY);
  await tick();await page.locator('[data-live-floor="11"]').waitFor();await watching();
  assert(Math.abs(await page.evaluate(()=>scrollY)-y)<2,'upstream reading position retained');
  assert(await page.getByRole('button',{name:'新增 1 条',exact:true}).isVisible());
  assert.deepEqual(await page.evaluate(()=>({retained:__cards.every((card,i)=>card===document.querySelectorAll('.cc98-rebuild-post-feed > .cc98-rebuild-post')[i]),draft:document.querySelector('#live-draft').value,caret:document.querySelector('#live-draft').selectionStart,cache:JSON.stringify([...__reader.cachedPages()])===__cached})),{retained:true,draft:'保留的回复草稿',caret:2,cache:true});
  const newCard=page.locator('[data-live-floor="11"]');assert((await newCard.innerText()).includes('新增第11楼'));assert((await newCard.innerText()).includes('签名11'));
  assert.equal(await newCard.locator('img[onerror]').count(),0);assert.equal(await newCard.locator('.cc98-rebuild-conversation-action').count(),0,'no dialogue with a wrong physical page');
  await page.getByRole('button',{name:'新增 1 条',exact:true}).click();
  assert(await newCard.evaluate(card=>card.getBoundingClientRect().top>=document.querySelector('.cc98-topic-live-bar').getBoundingClientRect().bottom),'jump leaves author below sticky controls');
  for(const image of await newCard.locator('.cc98-rebuild-post-body img').all()) {
    await image.scrollIntoViewIfNeeded();await image.evaluate(image=>image.decode());
    assert(await image.evaluate(image=>image.complete&&image.naturalWidth>0));
  }
  assert.equal(requests[0].path,'/topic/6500000');assert(requests.some(r=>r.path==='/Topic/6500000/post?from=10&size=10'));assert.equal(await newCard.locator('blockquote').count(),1);assert(await newCard.locator('.cc98-rebuild-post-body img').count()>=2);
  checks.push('Metadata-only baseline; incremental API range, UBB quotes/images/emotes/signatures; retained foreground, cache, draft and selection');
  await tick();await watching();assert.equal(await page.locator('[data-live-floor="11"]').count(),1);
  await page.evaluate(()=>{lastSettings.blockedUserIds='用户13';document.activeElement?.blur();scrollTo(0,document.scrollingElement.scrollHeight)});
  await page.waitForTimeout(50);count=14;await tick();await page.locator('[data-live-floor="14"]').waitFor();await watching();
  assert((await page.locator('[data-live-floor="12"]').innerText()).includes('ABC123'));
  assert(!await page.locator('[data-live-floor="12"]').innerText().then(t=>t.includes('UID 1012')));
  assert(await page.locator('[data-live-floor="13"]').evaluate(n=>n.classList.contains('cc98-rebuild-blocked')));
  assert(await page.evaluate(()=>document.scrollingElement.scrollHeight-innerHeight-scrollY<5),'follows only when already at bottom');
  assert.equal(await page.locator('[data-live-floor="14"] img[onerror], [data-live-floor="14"] [xlink\\:href], [data-live-floor="14"] set').count(),0);assert.equal(await page.locator('[data-live-floor="14"] blockquote').count(),1);
  checks.push('Bottom follow, empty/anonymous replies, Markdown, safe HTML, rating rows and existing user blocking');
  for(const themeStyle of ['modern','ascii'])for(const themeMode of ['light','dark']){
   await page.evaluate(settings=>{Object.assign(lastSettings,settings);CC98RebornThemeCore.apply(document.documentElement,lastSettings);CC98RebornInterfaceStyle.sync(lastSettings);CC98RebornTopicLive.sync()}, {themeStyle,themeMode});
   await newCard.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(out,`${themeStyle}-${themeMode}.png`)});
  }
  await page.setViewportSize({width:390,height:850});await newCard.scrollIntoViewIfNeeded();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'ascii-narrow.png')});
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'))});
  const hiddenCount=requests.length;await tick(180000);assert.equal(requests.length,hiddenCount);assert.equal(await page.locator('.cc98-topic-search-worker').count(),1,'only unrelated conversation cache reader remains');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'))});await watching();
  checks.push('Hidden-tab cancellation removes live reader/probe and makes no polling requests; resume works');
  await page.getByRole('button',{name:'停止',exact:true}).click();const stopped=requests.length;await tick(180000);assert.equal(requests.length,stopped);assert.equal(await page.locator('[data-live-floor="11"]').count(),1);
  count=16;await page.getByRole('button',{name:'继续',exact:true}).click();await page.locator('[data-live-floor="16"]').waitFor();await watching();
  assert.deepEqual(backgroundPages,[],'no background HTML documents or fetches');assert.equal(await page.locator('.cc98-rebuild-conversation-probe').count(),0);assert((await page.locator('[data-live-floor="16"]').innerText()).includes('该贴已被my cc98, my home'));assert(!requests.some(r=>r.path.includes('id=1012')||r.path.includes('id=1016')),'no anonymous/deleted profile lookup');assert.equal(requests.filter(r=>r.path.startsWith('/user?')&&r.path.includes('id=1011')).length,1,'profile reused on later batches');
  checks.push('Stop retains cards; resume catches up by offset; profile cache reused; anonymous/deleted identities protected; zero background pages/probes');
  count=30;failFrom=26;await tick(70000);await page.waitForFunction(()=>document.querySelector('.cc98-topic-live-status')?.textContent.startsWith('连接中断'));
  assert.equal(await page.locator('[data-live-floor="26"]').count(),1);assert.equal(await page.locator('[data-live-floor="27"]').count(),0,'failed second batch does not advance past unread data');
  const failed=requests.length;await tick(20000);assert.equal(requests.length,failed,'errors back off instead of hammering');
  failFrom=null;await tick(300000);await page.locator('[data-live-floor="30"]').waitFor();await watching();
  assert.equal(await page.locator('[data-live-floor]').count(),20,'partial-batch retry neither duplicates nor skips replies');
  failure=429;await tick(70000);await page.waitForFunction(()=>document.querySelector('.cc98-topic-live-status')?.textContent.includes('600秒'));
  const limited=requests.length;failure=0;await tick(300000);assert.equal(requests.length,limited,'server Retry-After overrides the five-minute local backoff cap');await tick(400000);await watching();
  checks.push('Multi-batch offset catch-up, partial-failure retry without skips/duplicates, and 600-second server rate-limit cooldown');
  await page.evaluate(()=>{localStorage.setItem('userInfo','obj-'+JSON.stringify({id:43,name:'另一个用户'}));CC98RebornTopicLive.sync()});
  assert.equal(await page.locator('.cc98-topic-live-bar').count(),0);assert.equal(await page.locator('.cc98-topic-live-posts').count(),0);const switched=requests.length;await tick(180000);assert.equal(requests.length,switched);
  checks.push('Error backoff and recovery; account changes release old replies/readers/timers before further reads');
  await liveEntry.evaluate(button=>button.click());await watching();await page.evaluate(()=>{history.pushState(null,'','/topic/6500001');CC98RebornTopicLive.sync()});
  assert.equal(await page.locator('.cc98-topic-live-bar').count(),0);const changed=requests.length;await tick(180000);assert.equal(requests.length,changed);
  assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
  await fs.writeFile(path.join(out,'validation.json'),JSON.stringify({passed:true,checks,requests,backgroundPages,errors,unexpected},null,2));console.log(JSON.stringify({passed:true,checks}));
 }finally{await context.close();await browser.close()}
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1});
module.exports={native,shell,apiPost,apiProfiles};
