// Offline integration: real shared reader, content extraction, scan UI and IndexedDB store.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const root = path.resolve(__dirname, '..'), origin = 'https://www.cc98.org';
const output = path.join(root, 'outputs/topic-archive/integration');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD2cAAAAASUVORK5CYII=', 'base64');
const reply = (floor, body) => `<div class="reply" data-floor="${floor}"><span class="reply-floor">${floor}</span><a href="/user/id/123456">测试用户</a><div class="reply-content"><div class="substance"><article>${body}</article></div></div><div class="signature"><p>签名档<img src="https://file.cc98.org/signature.png"></p></div><div class="comment1">发表于 2026-10-28 12:00:00</div><div class="awardInfo"><div class="tagSize"><span class="userName">用户</span><span class="grades">操作</span><span class="credit">理由</span></div><div class="tagSize good"><span class="userName"><img src="https://file.cc98.org/rating-avatar.png">Alice</span><span class="grades">风评值 +3</span><span class="credit">资料很详细</span></div><div class="tagSize bad"><span class="userName">Bob</span><span class="grades">风评值 -1</span><span class="credit">补充来源</span></div></div></div>`;
function native(page, fresh = false) {
  const floor = (page - 1) * 10 + 1;
  return `<h1 id="essay1">快照集成测试</h1><button class="followTopic">收藏</button>${reply(floor, `<p>${fresh ? '最新内容' : '旧页面'} 第 ${page} 页</p><blockquote><p>引用内容</p><img src="https://file.cc98.org/quote.png"></blockquote><img src="https://file.cc98.org/photo.png"><img src="/static/images/ac/01.png" alt="[ac01]"><video src="https://file.cc98.org/movie.mp4" poster="https://file.cc98.org/poster.png"></video><a href="https://file.cc98.org/manual.pdf" download>测试附件</a>`)}<div class="pagination"><ul class="page-nav">${[1,2,3].map(n => `<li><a href="/topic/100/${n}">${n}</a></li>`).join('')}</ul></div>`;
}
function shell(body, scripts = '') { return `<!doctype html><html class="cc98-comfort"><head><meta charset="utf-8">${['theme-tokens.css','styles.css','topic-search.css','topic-archive.css','interface-styles.css'].map(f => `<link rel="stylesheet" href="/src/${f}">`).join('')}<style>.native{position:absolute;left:-10000px;width:900px}#cc98-comfort-app{position:relative!important;padding:20px;min-height:2000px}</style></head><body>${body}${scripts}</body></html>`; }
function foreground() { return shell(`<div class="native">${native(2)}</div><main id="cc98-comfort-app"></main>`, `<script>
window.__messages=[];window.__downloads=[];window.__assetFailure=false;
window.chrome={runtime:{id:'abcdefghijklmnopabcdefghijklmnop',getURL:p=>'chrome-extension://abcdefghijklmnopabcdefghijklmnop/'+p,getManifest:()=>({version:'0.4.2'}),onMessage:{addListener(){}},sendMessage(m,c){if(m.type?.startsWith('CC98_ARCHIVE_')){__messages.push(m);return window.__store.handle(m,window.__sender)} c?.({ok:false});return Promise.resolve({ok:false})}},permissions:{contains:async()=>true},tabs:{create:async x=>{window.__opened=x.url}},storage:{local:{get:(k,c)=>{c?.({});return Promise.resolve({})},set:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener(){}}}};
</script>` + ['topic-archive-store.js','theme-core.js','interface-style.js','conversation-core.js','conversation.js','topic-archive.js','content.js'].map(f=>`<script src="/src/${f}"></script>`).join('') + `<script>
window.__sender={id:chrome.runtime.id,url:location.href,tab:{id:1},frameId:0,documentId:'fixture-doc'};
window.__ui={id:chrome.runtime.id,url:chrome.runtime.getURL('popup/archive.html'),tab:{id:2},frameId:0};
window.__store=CC98RebornTopicArchiveStore.createStore({chrome,indexedDB,databaseName:'archive-integration',fetch:async(url)=>{__downloads.push(url);if(__assetFailure&&url.endsWith('/photo.png'))return new Response('',{status:403});return new Response(Uint8Array.from(atob('${png.toString('base64')}'),c=>c.charCodeAt(0)),{headers:{'content-type':url.endsWith('.pdf')?'application/pdf':url.endsWith('.mp4')?'video/mp4':'image/png'}})}});
lastSettings={...DEFAULT_SETTINGS,previsitFirstPageForTopicImages:false,prewarmPostImages:false};scheduleRebuild=()=>{};scheduleSync=()=>{};document.documentElement.removeAttribute('data-cc98-rebuild-transition-veil');const app=document.querySelector('#cc98-comfort-app');app.append(renderPostPager());getPostItems().forEach(item=>app.append(renderPostCard(item)));ensureObserver();CC98RebornThemeCore.apply(document.documentElement,lastSettings);
</script>`); }

async function main(){
  await fs.mkdir(output,{recursive:true});
  const browser=await chromium.launch({executablePath:await executable(),headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900}}), page=await context.newPage();
  let failPage=false,unsupported=false;const errors=[],requests=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
    const request=route.request(),u=new URL(request.url()),match=u.pathname.match(/^\/topic\/100(?:\/(\d+))?$/);
    if(match){const n=Number(match[1]||1),isMain=request.resourceType()==='document'&&request.frame()===page.mainFrame();requests.push({n,type:request.resourceType(),main:isMain,at:Date.now()});if(isMain)return route.fulfill({contentType:'text/html',body:foreground()});if(failPage&&n===2)return route.fulfill({status:403,body:'Forbidden'});if(n===3)return route.fulfill({contentType:'text/html',body:shell('<div id="root"></div>',`<script>setTimeout(()=>document.querySelector('#root').innerHTML=${JSON.stringify(native(3,true).replace('</article>', '<span class="hiddenImage" onclick="this.outerHTML=\'<img src=https://file.cc98.org/hidden.png>\'">点击查看图片</span></article>'))},30)</script>`)});const body=n===1&&unsupported?native(n,true).replace('https://file.cc98.org/movie.mp4','blob:https://www.cc98.org/temporary').replace('</article>','<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="></article>'):native(n,true);return route.fulfill({contentType:'text/html',body:shell(body)});}
    if(u.pathname.endsWith('.png'))return route.fulfill({contentType:'image/png',body:png});
    if(u.origin===origin&&u.pathname==='/src/content.js'){
      const source=await fs.readFile(path.join(root,'src/content.js'),'utf8');
      // This fixture explicitly mounts the reading surface. Full extension boot is tested separately.
      return route.fulfill({contentType:'text/javascript',body:source.slice(0,source.lastIndexOf('\narmInitialRebuildTransitionVeil();'))});
    }
    if(u.origin===origin&&u.pathname.startsWith('/src/'))return route.fulfill({path:path.join(root,u.pathname)});
    return route.fulfill({status:404,body:''});
  });
  const list=()=>page.evaluate(()=>__store.handle({type:'CC98_ARCHIVE_LIST'},__ui));
  const get=(id,p)=>page.evaluate(({id,p})=>__store.handle({type:'CC98_ARCHIVE_GET',id,...(p?{page:p}:{})},__ui),{id,p});
  const scan=async files=>{await page.locator('.cc98-topic-archive-entry').first().evaluate(button=>button.click());await page.getByLabel('同时保存音视频和附件').setChecked(files);await page.getByRole('button',{name:/^(开始存档|再次存档)$/}).click();};
  const done=async()=>page.waitForFunction(()=>document.querySelector('.cc98-topic-archive-dialog')&&!document.querySelector('.cc98-topic-archive-primary').disabled,{},{timeout:20000});
  try{
    await page.goto(origin+'/topic/100/2');await page.locator('.cc98-topic-archive-entry').first().waitFor();
    await page.waitForTimeout(700);
    await page.evaluate(async()=>{window.__reader=CC98RebornConversation.createReader(getTopicPageInfo());window.__before=JSON.stringify(await __reader.read(2));window.__cards=[...document.querySelectorAll('.cc98-rebuild-post')];scrollTo(0,140)});
    const oldY=await page.evaluate(()=>scrollY),startIndex=requests.length;
    await scan(false);await page.screenshot({path:path.join(output,'scan-modern.png')});await page.getByRole('button',{name:'关闭',exact:true}).click();
    await page.waitForFunction(()=>__messages.some(m=>m.type==='CC98_ARCHIVE_FINISH'),{},{timeout:20000});
    await page.locator('.cc98-topic-archive-entry').first().evaluate(button=>button.click());await done();
    let result=await list(),item=result.items[0];assert.equal(item.status,'complete');assert.equal(item.pageCount,3);assert.equal(item.recordCount,3);
    const stored=await get(item.id,2),record=stored.pages[0].records[0];assert(record.contentHtml.includes('最新内容'));assert(record.signatureHtml.includes('签名档'));assert(record.extraHtml.includes('awardInfo'));assert(record.extraHtml.includes('rating-avatar.png'));assert(record.extraHtml.includes('风评值 +3'));assert(record.contentHtml.includes('<blockquote>'));assert(record.contentHtml.includes('data-cc98-archive-resource'));assert(!/\ssrc=/.test(record.contentHtml));
    const fetched=requests.slice(startIndex).filter(r=>r.type==='fetch');assert.deepEqual(fetched.map(r=>r.n),[1,2,3]);assert(fetched.every((r,i)=>!i||r.at-fetched[i-1].at>=950));assert(requests.some(r=>r.n===3&&r.type==='document'&&!r.main));
    assert(await page.evaluate(async()=>JSON.stringify(await __reader.read(2))===__before));assert.equal(await page.evaluate(()=>scrollY),oldY);assert(await page.evaluate(()=>__cards.every((n,i)=>n===document.querySelectorAll('.cc98-rebuild-post')[i])),JSON.stringify(await page.evaluate(()=>({before:__cards.map(n=>[n.isConnected,n.className]),after:[...document.querySelectorAll('.cc98-rebuild-post')].map(n=>n.className)}))));assert.equal(await page.locator('.cc98-topic-search-worker').count(),1); // only the deliberately open cache reader
    assert((await page.evaluate(()=>__downloads)).some(u=>u.endsWith('/hidden.png')));assert(!(await page.evaluate(()=>__downloads)).some(u=>/\.(pdf|mp4)$/.test(u)));checks.push('Fresh paced full scan, rendered page fallback, untouched foreground/cache, signatures/quotes, default media scope');
    await page.getByRole('button',{name:'查看存档',exact:true}).click();assert((await page.evaluate(()=>__opened)).endsWith('#'+item.id));
    for(const themeStyle of ['modern','ascii'])for(const themeMode of ['light','dark']){await page.evaluate(settings=>{Object.assign(lastSettings,settings);CC98RebornThemeCore.apply(document.documentElement,lastSettings);CC98RebornInterfaceStyle.sync(lastSettings)}, {themeStyle,themeMode});await page.screenshot({path:path.join(output,`scan-${themeStyle}-${themeMode}.png`)});}
    await page.getByRole('button',{name:'关闭',exact:true}).click();await scan(true);await done();result=await list();item=result.items[0];assert.equal(item.status,'complete');assert.equal(item.includeFiles,true);assert((await page.evaluate(()=>__downloads)).some(u=>u.endsWith('.mp4')));assert((await page.evaluate(()=>__downloads)).some(u=>u.endsWith('.pdf')));assert.equal(result.items.length,2);checks.push('Optional files saved; repeated captures retain separate snapshots; viewer entry');
    await page.getByRole('button',{name:'关闭',exact:true}).click();failPage=true;await page.evaluate(()=>__assetFailure=true);await scan(false);await done();item=(await list()).items[0];assert.equal(item.status,'partial');assert.equal(item.pageCount,2);assert(item.failures.some(x=>x.page===2));assert(item.failures.some(x=>x.url?.endsWith('/photo.png')));checks.push('Page and media failures remain partial with reasons; later pages still saved');
    failPage=false;unsupported=true;await page.evaluate(()=>__assetFailure=false);await page.getByRole('button',{name:'关闭',exact:true}).click();await scan(true);await done();item=(await list()).items[0];assert.equal(item.status,'partial');assert(item.failures.some(x=>x.error.includes('图片')));assert(item.failures.some(x=>x.error.includes('临时地址')));checks.push('Unsupported image and selected blob video are explicit partial failures');
    unsupported=false;await page.getByRole('button',{name:'关闭',exact:true}).click();await scan(false);await page.waitForFunction(()=>document.querySelector('.cc98-topic-archive-status').textContent.includes('1/3'));
    await page.getByRole('button',{name:'取消存档',exact:true}).click();await done();item=(await list()).items[0];assert.equal(item.status,'cancelled');assert.equal(await page.locator('.cc98-topic-archive-error').isVisible(),false);assert(item.pageCount>=1&&item.pageCount<3);checks.push('Cancellation retains captured pages without false error');
    await page.getByRole('button',{name:'关闭',exact:true}).click();await scan(false);await page.waitForFunction(()=>document.querySelector('.cc98-topic-archive-status').textContent.includes('1/3'));await page.evaluate(()=>history.pushState(null,'','/topic/200/1'));await done();item=(await list()).items[0];assert.equal(item.status,'cancelled');checks.push('Leaving topic cancels capture and releases probe');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'validation.json'),JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({passed:checks.length,checks}));
  }finally{await context.close();await browser.close();}
}
if (require.main === module) main().catch(error=>{console.error(error);process.exitCode=1});
module.exports = { native, shell, png };
