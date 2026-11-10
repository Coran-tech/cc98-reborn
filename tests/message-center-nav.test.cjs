// Synthetic native router: preserve Message.tsx's nav and replace only the
// Route child, as navigation among the five message tabs does on the forum.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const {chromium} = require('playwright');
const {executable} = require('./new-topics-virtual.test.cjs');
const root = path.resolve(__dirname,'..'), out = path.join(root,'outputs/message-center-nav-20261104/qa');
const origin = 'https://www.cc98.org';
const tabs = [['response','回复我的','replyCount',3],['attme','@ 我的','atCount',2],['system','系统通知','systemCount',12],['message','我的私信','messageCount',0],['setting','消息设置']];
const cards = [
  ['校园生活','青禾','图书馆的秋天'],['学习天地','墨鱼','下周的读书会'],['开怀一笑','山间','窗外有只松鼠'],
  ['似水流年','木棉','我在校园看到的风景']
];
function panel(key) {
  if(key==='setting')return '<div class="message-right"><div class="message-setting">'+['是否显示回复通知','是否显示@通知','是否显示系统通知','是否显示私信通知','回帖是否跳至最新回复'].map((t,i)=>
    '<div class="message-settingbox"><div class="radioTitle">'+t+'</div><input type="radio" name="setting'+i+'" value="是" checked><div>是</div><input type="radio" name="setting'+i+'" value="否"><div>否</div></div>').join('')+'<button class="message-setting-btn">保存消息设置</button></div></div>';
  if(key==='message')return '<div class="message-message"><div class="message-message-people"><div class="message-message-pTitle">近期私信</div><div class="message-message-pList"><div id="contact_7200" class="message-message-pFocus"><div class="message-message-person"><img class="message-message-pPortraitUrl" src="/test-avatar.svg"><div class="message-message-pInfo"><div class="message-message-pName">青禾</div><div class="message-message-pMessage"><article>明天见。</article></div></div></div></div></div></div><div class="message-message-window"><div class="message-message-wHeader"><div class="message-message-wReport"></div><div class="message-message-wTitle">与 青禾 的私信</div></div><div class="message-message-wContent" id="messageContent"><div class="message-message-wc"><div class="message-message-wcReceiver"><a href="/user/id/7200"><img src="/test-avatar.svg" class="message-message-wcPortraitUrl"></a><div class="message-message-wcContent"><div class="message-message-wcText"><article>明天见。</article></div></div></div></div></div><div class="message-message-wPost"><textarea class="message-message-wPostArea"></textarea><div class="message-message-wPostBtn-wrapper"><button class="message-message-wPostBtn">发送</button></div></div></div></div>';
  const body=cards.map(([board,who,title],i)=>key==='system'
    ? '<div class="message-system-box"><div class="message-system-box-bar"><div class="message-system-box-title">版面通知</div><div class="message-system-box-date">2026-11-04 10:15:00</div></div><div class="message-system-box-content"><article>你关注的「'+board+'」版面更新了公告。</article></div></div>'
    : '<div class="message-response-box"><div class="message-response-box-middle"><div class="message-response-box-middle1"><div class="message-response-box-middle-title"><article>'+board+'</article></div><div class="message-response-box-middle-date">2026-11-04 10:15:00</div></div><div class="message-response-box-middle-content"><article>'+who+'在 <a href="/topic/'+(6671000+i)+'">《'+title+'》</a> '+(key==='response'?'回复了你。':'提到了你。')+'</article></div></div></div>').join('');
  return '<div class="message-right"><div class="message-'+(key==='system'?'system':'response')+'">'+body+'</div><div class="message-pager"><div class="pagination"><ul class="page-nav">'+[1,2,3].map(i=>'<li class="page-item"><a class="page-link'+(i===1?' active':'')+'" href="/message/'+key+'/'+i+'">'+i+'</a></li>').join('')+'</ul></div></div></div>';
}
function doc(entry,key) {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>我的消息 - CC98论坛</title><link id="mainStylesheet" rel="stylesheet" href="/tests/fixtures/native-forum.css">'+entry.css.map(f=>'<link rel="stylesheet" href="/'+f+'">').join('')+'</head><body><div id="root"><header class="topBar"><div class="topBarRight"><span class="topBarUserName">同学</span></div></header><div class="message-root"><div class="message"><div class="readAllMessage"><button class="message-message-wPostBtn">全部标为已读</button></div><div class="message-title">我的消息</div><div class="message-content"><div class="message-nav">'+tabs.map(([k,n,c,v])=>'<a'+(k===key?' class="active"':'')+' href="/message/'+k+'"><div id="'+k+'" class="nav-div">'+n+(c?'<div class="message-counterNav'+(v?'':' displaynone')+'" id="unreadCount-'+c+'1">'+v+'</div>':'')+'</div></a>').join('<hr>')+'</div>'+panel(key)+'</div></div></div></div><script>('+wire.toString()+')('+JSON.stringify(Object.fromEntries(tabs.map(([k])=>[k,panel(k)])))+')</script>'+entry.js.filter(f=>/theme-core|interface-style|private-message|markup-converter|extended-ubb-core|^src\/content\.js$/.test(f)).map(f=>'<script src="/'+f+'"></script>').join('')+'</body></html>';
}
function wire(panels) {
  window.calls={read:0,save:[],pages:[],tabs:[]};
  const nav=document.querySelector('.message-nav');window.nativeNav=nav;
  // On /message itself none of the native NavLinks matches /message/response.
  if(location.pathname==='/message')nav.querySelector('a.active')?.classList.remove('active');
  const activate=key=>{
    const template=document.createElement('template');template.innerHTML=panels[key];nav.nextElementSibling.replaceWith(template.content);nav.querySelectorAll('a').forEach(a=>a.classList.toggle('active',a.pathname.endsWith('/'+key)));
  };
  document.addEventListener('click',e=>{
    const a=e.target.closest('a');if(a?.closest('.message-nav')){
      e.preventDefault();const key=a.pathname.split('/').at(-1);history.pushState({},'',a.href);activate(key);calls.tabs.push(key);
    }else if(a?.matches('.page-link')){
      e.preventDefault();history.pushState({},'',a.href);calls.pages.push(a.pathname);a.closest('.page-nav').querySelectorAll('a').forEach(n=>n.classList.toggle('active',n===a));
    }else if(e.target.closest('.readAllMessage button')){calls.read++;nav.querySelectorAll('.message-counterNav').forEach(b=>b.classList.add('displaynone'))}
    else if(e.target.closest('.message-setting-btn')){calls.save.push(document.querySelector('input[name=setting0]:checked').value)}
  });
  addEventListener('popstate',()=>activate(location.pathname.split('/')[2]||'response'));
}
async function main(){
  const before=process.argv.includes('--before'), report={samples:[],checks:[],errors:[]};
  await fs.mkdir(out,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8')), entry=manifest.content_scripts.find(s=>s.js.includes('src/content.js'));
  const browser=await chromium.launch({executablePath:await executable(),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  await context.addInitScript(()=>{
    const prefs={enabled:true,rebuildUi:true,themeMode:'light',themeStyle:'modern',prewarmPostImages:false,previsitFirstPageForTopicImages:false};
    localStorage.setItem('userInfo',JSON.stringify({id:6000,name:'同学'}));
    const listeners=[];const records={cc98ComfortSettings:prefs,'cc98RebornOpenIdBinding:v1':{bound:true,userId:'6000',userName:'同学'}};
    window.chrome={runtime:{getManifest:()=>({version:'0.4.3'}),getURL:p=>new URL('/'+p,location.origin).href,onMessage:{addListener(){}},sendMessage:(m,c)=>{c?.({ok:false});return Promise.resolve({ok:false})}},storage:{local:{get:(keys,c)=>{c?.(records);return Promise.resolve(records)},set:(v,c)=>{const d=Object.fromEntries(Object.entries(v).map(([k,n])=>[k,{oldValue:records[k],newValue:n}]));Object.assign(records,v);listeners.forEach(f=>f(d,'local'));c?.();return Promise.resolve()}},onChanged:{addListener:f=>listeners.push(f)}}};
    window.ascii=()=>chrome.storage.local.set({cc98ComfortSettings:{...prefs,themeMode:'dark',themeStyle:'ascii'}});
  });
  await context.route('**/*',async r=>{
    const u=new URL(r.request().url());if(u.origin!==origin)return r.abort();
    if(r.request().resourceType()==='document')return r.fulfill({contentType:'text/html',body:doc(entry,u.pathname.split('/')[2]||'response')});
    if(u.pathname==='/test-avatar.svg')return r.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"><rect width="48" height="48" fill="#779c8c"/><path fill="#f8edc5" d="M0 42 12 22l8 8 10-15 18 21v12H0Z"/></svg>'});
    const tree=before&&['/src/content.js','/src/styles.css'].includes(u.pathname)?path.join(out,'../before'):root;
    const f=path.resolve(tree,'.'+u.pathname);if(!f.startsWith(tree+path.sep))return r.abort();
    try{return await r.fulfill({path:f})}catch{return r.fulfill({status:404,body:''})}
  });
  const p=await context.newPage();p.setDefaultTimeout(5500);p.on('pageerror',e=>report.errors.push(e.message));
  const shell=p.locator('#cc98-comfort-app .cc98-rebuild-native-message'),nav=shell.locator('.message-nav');
  const go=async k=>{await nav.locator('a[href="/message/'+k+'"]').click();await p.waitForFunction(k=>location.pathname.endsWith('/'+k)&&document.querySelector('#cc98-comfort-app .message-nav a.active')?.pathname.endsWith('/'+k),k)};
  const frame=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  async function measure(key,width){
    if(!before)await p.waitForFunction(key=>document.querySelector('#cc98-comfort-app .message-nav a[aria-current="page"]')?.pathname==='/message/'+key,key);
    await frame();
    const sample=await shell.evaluate((s,key)=>{
      const rect=n=>{const {x,y,width,height,right,bottom}=n.getBoundingClientRect();return {x,y,width,height,right,bottom}};
      const links=[...s.querySelectorAll('.message-nav a')],current=links.find(a=>a.pathname.endsWith('/'+key)),currentDiv=current.firstElementChild;
      const n=s.querySelector('.message-nav'),read=s.querySelector('.readAllMessage button'),content=n.nextElementSibling;
      const cStyle=n=>getComputedStyle(n);
      return {nav:rect(n),read:rect(read),panel:rect(content),links:links.map(a=>rect(a)),active:cStyle(currentDiv).backgroundColor,other:cStyle(links.find(a=>a!==current).firstElementChild).backgroundColor,
        pageWidth:document.documentElement.scrollWidth,screen:innerWidth,native:window.nativeNav===n};
    },key);
    report.samples.push({key,width,...sample});
    if(!before){
      assert.equal(sample.native,true,'native router nav was replaced');
      assert.equal(await nav.getAttribute('aria-label'),'消息中心');
      assert.equal(await nav.locator('a[aria-current="page"]').getAttribute('href'),'/message/'+key);
      assert.equal(sample.links.length,5);assert(sample.links.every(b=>Math.abs(b.y-sample.links[0].y)<2&&b.height>12),'five horizontal tabs: '+key);
      assert(Math.abs(sample.nav.y+sample.nav.height/2-sample.read.y-sample.read.height/2)<5,'mark-read aligns with tabs: '+key);
      assert(sample.read.x>=sample.nav.right-1&&sample.read.width>12,'native mark-read stays at right: '+key);
      assert(sample.panel.y>=sample.nav.bottom-1,'content appears below the horizontal nav');
      assert.notEqual(sample.active,sample.other,'the selected tab is visually distinct: '+key);
      assert(sample.pageWidth<=sample.screen+1,'document overflow: '+key);
      if(width<=480&&!sample.links.every(b=>b.x>=sample.nav.x-1&&b.right<=sample.nav.right+1)){
        await p.screenshot({path:path.join(out,'overflow-'+width+'-'+key+'.png')});
        throw new Error('narrow tabs overflow: '+JSON.stringify({key,width,nav:sample.nav,links:sample.links}));
      }
    }
    return sample;
  }
  try{
    await p.goto(origin+'/message/response');await nav.waitFor();
    if(before){
      for(const [k] of [tabs[0],tabs[3]]){await go(k);await p.waitForTimeout(300);await measure(k,1440);await p.screenshot({path:path.join(out,'before-'+k+'.png')})}
      console.log(JSON.stringify(report.samples.map(x=>[x.key,x.nav.x,x.nav.y,x.nav.width,x.nav.height])));return;
    }
    for(const width of [1440,390]){
      await p.setViewportSize({width,height:width===1440?900:844});let first;
      for(const [k] of tabs){await go(k);if(k==='message')await p.locator('.cc98-rebuild-message-editor-send').waitFor();const s=await measure(k,width);first??=s;
        assert(Math.abs(s.nav.x-first.nav.x)<9&&Math.abs(s.nav.y-first.nav.y)<2&&Math.abs(s.read.y-first.read.y)<2,'bar moves between tabs: '+k);
        if(k==='message'){if(width===1440){const a=await p.locator('.message-message-people').boundingBox(),b=await p.locator('.message-message-window').boundingBox();assert(a.x+a.width<=b.x+1)}else{await p.locator('.cc98-dm-contacts-button').click();await p.locator('.message-message-people').waitFor();await p.locator('.cc98-dm-chat-button').click();await p.locator('.message-message-window').waitFor()}}
        if(k==='response'){await p.locator('.page-nav a').nth(1).click();assert.equal(await p.evaluate(()=>calls.pages.at(-1)),'/message/response/2')}
        if(k==='setting'){
          const labels=await p.locator('.message-settingbox').evaluateAll(rows=>rows.every(row=>{
            const range=document.createRange();range.selectNodeContents(row.querySelector('.radioTitle'));return range.getBoundingClientRect().right<=row.querySelector('input').getBoundingClientRect().left+1;
          }));assert(labels,'setting labels must not cover radio controls');
          await p.locator('[name=setting0][value="否"]').check();await p.locator('.message-setting-btn').click();assert.equal(await p.evaluate(()=>calls.save.at(-1)),'否');
        }
        if((width===1440&&k==='response')||(width===390&&k==='setting'))await p.screenshot({path:path.join(out,width+'-'+k+'.png')});
      }report.checks.push('Five sections share one horizontal bar on '+width+'px; same-shell navigation, page links, setting save and DM panes');
    }
    await p.setViewportSize({width:320,height:740});await p.evaluate(()=>ascii());await p.waitForFunction(()=>document.documentElement.dataset.cc98ComfortTone==='dark');await go('system');await measure('system',320);
    assert.equal(await nav.locator('.message-counterNav:visible').count(),3);assert.equal(await nav.locator('#unreadCount-systemCount1').innerText(),'12');
    const note=await shell.locator('.message-system-box-content article').first().boundingBox();assert(note.width>=200,'narrow system notice text should use the available width: '+note.width);
    await p.screenshot({path:path.join(out,'320-system-ascii.png')});
    for(const [i,[k]] of tabs.entries()){
      const a=nav.locator('a[href="/message/'+k+'"]');
      if(!i)await a.focus();else await p.keyboard.press('Tab');
      const active=await a.evaluate(a=>({ok:a===document.activeElement,el:document.activeElement?.outerHTML.slice(0,180)}));assert(active.ok,k+': '+JSON.stringify(active));
      const point=()=>a.evaluate(a=>{const r=a.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),n=a.closest('.message-nav');return {ok:a.contains(hit),hit:hit?.outerHTML.slice(0,90),x:r.x,right:r.right,scroll:n.scrollLeft,max:n.scrollWidth-n.clientWidth}});
      await frame();const result=await point();assert(result.ok,'keyboard-accessible tab: '+k+' '+JSON.stringify(result));
    }
    await p.getByRole('button',{name:'全部标为已读'}).click();assert.equal(await p.evaluate(()=>calls.read),1);assert.equal(await nav.locator('.message-counterNav:visible').count(),0);
    await go('setting');await p.goBack();await measure('system',320);
    await p.goto(origin+'/message');await nav.waitFor();await measure('response',320);
    report.checks.push('Unread counts, one native mark-all action, keyboard-accessible narrow ASCII tabs, browser Back and /message alias');assert.deepEqual(report.errors,[]);
    await fs.writeFile(path.join(out,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report.checks));
  }finally{await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
