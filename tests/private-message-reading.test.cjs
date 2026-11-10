// Local, synthetic DM thread; native nesting follows Message{,Message,Window,Receiver,Sender}.tsx.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'outputs/dm-reading-20261104/qa');
const origin = 'https://www.cc98.org';
const contacts = [
  ['林间来信', '照片收到啦，明天见。'], ['山月', '我把书单整理好了'], ['照相馆', '你觉得哪一张更合适？'],
  ['春日放映室', '周末来看电影吗'], ['半夏', '收到！'], ['雨天电台', '谢谢分享'], ['翻书的人', '下次见面再聊']
];
function row(who, html, time, id = '', uid = who === 'Sender' ? 6000 : 7000) {
  return `<div class="message-message-wc" ${id ? 'id="'+id+'"' : ''}><div class="${time ? 'message-message-wcTime' : 'displaynone'}">${time || ''}</div><div class="message-message-wc${who}"><a href="/user/id/${uid}" target="_blank"><img class="message-message-wcPortraitUrl" src="/local-avatar/${uid}.svg"></a><div class="message-message-wcContent"><div class="message-message-wcText"><article>${html}</article></div></div></div></div>`;
}
function fixture(entry) {
  const nav = [['response','回复我的'],['attme','@ 我的'],['system','系统通知'],['message','我的私信'],['setting','消息设置']];
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>我的私信 - CC98论坛</title>
  <link id="mainStylesheet" rel="stylesheet" href="/tests/fixtures/native-forum.css">${entry.css.map(f=>`<link rel="stylesheet" href="/${f}">`).join('')}</head><body>
  <div id="root"><header class="topBar"><div class="topBarRight"><span class="topBarUserName">青禾</span></div></header>
  <div class="message-root"><div class="message"><div class="readAllMessage"><button class="message-message-wPostBtn">全部标为已读</button></div><div class="message-title">我的消息</div>
  <div class="message-content"><div class="message-nav">${nav.map(([key,name])=>`<a class="${key==='message'?'active':''}" href="/message/${key}"><div id="${key}" class="nav-div ${key==='message'?'message-nav-focus':''}">${name}</div></a>`).join('<hr>')}</div>
  <div class="message-message"><div class="message-message-people"><div class="message-message-pTitle">近期私信</div><div class="message-message-pList">
  ${contacts.map(([name,text],i)=>`<div id="contact_${7000+i}" class="${i ? '' : 'message-message-pFocus'}"><div class="message-message-person"><img class="message-message-pPortraitUrl" src="/local-avatar/${7000+i}.svg"><div class="message-message-pInfo"><div class="message-message-pName">${name}</div><div class="message-message-pMessage"><article>${text}</article></div></div><div class="message-counterPerson ${i===2?'':'displaynone'}"></div></div></div>`).join('')}
  <div class="message-message-plMore"><div id="moreDot">...</div><div id="moreShow">显示更多小伙伴~</div><div class="displaynone" id="moreDone">小伙伴们都出来了~</div></div></div></div>
  <div class="message-message-window"><div class="message-message-wHeader"><div class="message-message-wReport"></div><div class="message-message-wTitle">与 林间来信 的私信</div><div class="message-message-wReport displaynone"><button>举报</button></div></div>
  <div class="message-message-wContent" id="messageContent"><div class="message-message-wcLoading"><div id="wcGetMore" class="message-message-wcLoadingMore">点击加载更多...</div><div id="wcLoadingText" class="message-message-wcLoadingText displaynone">没有更多消息了~</div></div>
  ${row('Receiver','下午好！昨天聊到的照片整理好啦。','2026-11-04 14:08:23','incoming')}
  ${row('Sender','好呀，想看看那天湖边的秋色。','','outgoing')}
  ${row('Receiver','<img id="photo" src="/local-photo.svg" alt="秋日湖畔">','2026-11-04 14:21:12')}
  ${row('Receiver','这一张是傍晚，在水边等最后一束光。','','after-photo')}
  ${row('Sender','照片收到啦，明天见。<img id="ac" src="/images/ac/01.png" alt="AC">','')}
  </div><div class="message-message-wPost"><textarea class="message-message-wPostArea" id="postContent"></textarea><div id="wPostNotice" class="message-message-wPostNotice">请在这里填入您要发送的私信内容</div>
  <div id="wPostError" class="message-message-wPostError displaynone">发送失败</div><input id="upload-files" type="file" accept="image/*" style="display:none"><div class="message-message-wPostBtn-wrapper"><button type="button" class="message-message-wPostBtn">上传图片</button><button class="message-message-wPostBtn" id="native-send">发送</button></div></div></div></div></div></div></div></div>
  <script>window.events={send:[],history:0,contact:0,read:0}; document.querySelector(".readAllMessage button").onclick=()=>events.read++; document.querySelector("#native-send").onclick=()=>{events.send.push(document.querySelector("#postContent").value)};
  document.querySelector("#wcGetMore").onclick=()=>{events.history++;document.querySelector("#wcGetMore").classList.add("displaynone");document.querySelector("#wcLoadingText").classList.remove("displaynone");};
  document.querySelectorAll("[id^=contact_]").forEach(n=>n.onclick=()=>{document.querySelectorAll(".message-message-pFocus").forEach(r=>r.classList.remove("message-message-pFocus"));n.classList.add("message-message-pFocus");n.querySelector(".message-counterPerson").classList.add("displaynone");document.querySelector(".message-message-wTitle").textContent="与 "+n.querySelector(".message-message-pName").textContent+" 的私信";events.contact++;});
  </script>${entry.js.filter(f=>/theme-core|interface-style|private-message|markup-converter|extended-ubb-core|^src\/content\.js$/.test(f)).map(f=>`<script src="/${f}"></script>`).join('')}</body></html>`;
}
function asset(id) {
  if (id === 'lake') return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 118" width="260" height="118"><rect width="260" height="118" fill="#eadbb9"/><circle cx="196" cy="32" r="15" fill="#fcf2c7"/><path d="M0 57l41-19 37 11 51-22 52 27 40-11 39 12v63H0Z" fill="#80958c"/><path d="M0 70l45-12 56 15 60-13 51 3 48-13v68H0Z" fill="#54766b"/><path d="M0 77h260v41H0z" fill="#89aaa3"/><path d="M8 88h58m100 2h78m-140 12h50" stroke="#d6daca" stroke-width="2"/></svg>';
  const colors=['#59877d','#a47d5e','#786c96','#7992a2','#c79169','#6a946d','#979171'];
  const i=Number(id)%7;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="${colors[i]}"/><path d="M0 48L16 24l15 17 9-12 24 24v11H0Z" fill="#f7e4b6" opacity=".8"/><circle cx="${14+i*5}" cy="15" r="6" fill="#fff7d8"/></svg>`;
}
async function main() {
  const baseline=process.argv.includes('--before');
  const manifest=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));
  const entry=manifest.content_scripts.find(s=>s.js.includes('src/content.js'));
  const browser=await chromium.launch({executablePath:await executable(),headless:true});
  const context=await browser.newContext({viewport:{width:1440,height:900}});
  const page=await context.newPage(), errors=[],checks=[];
  page.setDefaultTimeout(4500);page.on('pageerror',e=>errors.push(e.message));
  await fs.mkdir(out,{recursive:true});
  await context.addInitScript(()=>{
    localStorage.setItem('userInfo',JSON.stringify({id:'6000',name:'青禾'}));
    const records={cc98ComfortSettings:{enabled:true,rebuildUi:true,themeMode:'light',themeStyle:'modern',emojiScale:100,prewarmPostImages:false,previsitFirstPageForTopicImages:false},'cc98RebornOpenIdBinding:v1':{bound:true,userId:'6000',userName:'青禾'}};
    const listeners=[];window.chrome={runtime:{getManifest:()=>({version:'0.4.3'}),getURL:f=>new URL('/'+f,location.origin).href,onMessage:{addListener(){}},sendMessage:(v,c)=>{c?.({ok:false});return Promise.resolve({ok:false})}},storage:{local:{get:(keys,c)=>{const v=keys==null?records:Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in records).map(k=>[k,records[k]]));c?.(v);return Promise.resolve(v)},set:(v,c)=>{const diff=Object.fromEntries(Object.entries(v).map(([k,n])=>[k,{oldValue:records[k],newValue:n}]));Object.assign(records,v);listeners.forEach(l=>l(diff,'local'));c?.();return Promise.resolve()},remove:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener:f=>listeners.push(f)}}};
    window.theme=(themeStyle,themeMode)=>chrome.storage.local.set({cc98ComfortSettings:{...records.cc98ComfortSettings,themeStyle,themeMode}});
  });
  await context.route('**/*',async r=>{
    const u=new URL(r.request().url());
    if(u.origin!==origin)return r.abort();
    if(u.pathname==='/message/message')return r.fulfill({contentType:'text/html',body:fixture(entry)});
    if(u.pathname.startsWith('/local-avatar/')||u.pathname==='/local-photo.svg')return r.fulfill({contentType:'image/svg+xml',body:asset(u.pathname==='/local-photo.svg'?'lake':path.basename(u.pathname,'.svg'))});
    const file=path.resolve(root,'.'+u.pathname);
    if(!file.startsWith(root+path.sep))return r.abort();
    try {return await r.fulfill({path:file})}catch{return r.fulfill({status:404,body:''})}
  });
  async function fits(){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflows horizontally')}
  async function shot(name){await page.screenshot({path:path.join(out,name+'.png'),animations:'disabled'})}
  try{
    await page.goto(origin+'/message/message?id=7000');
    await page.locator('#cc98-comfort-app .cc98-rebuild-native-message').waitFor();await page.locator('.cc98-rebuild-message-editor-send').waitFor();
    await page.locator('#contact_7000 .cc98-message-pin').waitFor({state:'attached'});
    const reflow=process.argv.includes('--reflow');
    await page.evaluate(()=>document.fonts.ready);if(!reflow)await shot(baseline?'before-desktop':'desktop-light');
    if(baseline){await page.setViewportSize({width:390,height:844});await shot('before-mobile');return}
    let geo;if(!reflow){
    geo=await page.evaluate(()=>{
      const b=s=>document.querySelector(s).getBoundingClientRect();
      const side=b('.message-message-people'),chat=b('.message-message-window'),inc=b('#incoming .message-message-wcText'),out=b('#outgoing .message-message-wcText');
      return {sideAndChat:side.right<=chat.left+1,left:inc.x<out.x&&b('#incoming a').right<=inc.x+1,right:b('#outgoing a').left>=out.right-1, composerBottom:b('.cc98-rebuild-message-editor-send').bottom,viewport:innerHeight,chatWidth:chat.width, incWidth:inc.width,photo:b('#photo').width,ac:b('#ac').height};
    });
    assert(geo.sideAndChat&&geo.left&&geo.right,JSON.stringify(geo));assert(geo.ac>2&&geo.ac<=48&&geo.photo>110,JSON.stringify(geo));assert(geo.composerBottom<=geo.viewport,JSON.stringify(geo));await fits();checks.push('Two-pane layout, incoming/outgoing bubbles and avatars; photo and inline emoji');
    // Fill both native scrollers, then wheel over each; neither the other pane,
    // the page, nor the composer's position should move.
    await page.evaluate(()=>{
      const list=document.querySelector('.message-message-pList'), messages=document.querySelector('#messageContent');
      for(let i=0;i<18;i++){
        const contact=list.querySelector('#contact_7000').cloneNode(true); contact.id='contact_'+(7200+i);contact.classList.remove('message-message-pFocus');contact.querySelector('.cc98-message-pin')?.remove();contact.dataset.qaExtra='1';list.insertBefore(contact,list.lastElementChild);
        const msg=messages.querySelector('#outgoing').cloneNode(true);msg.removeAttribute('id');msg.dataset.qaExtra='1';messages.append(msg);
      }
    });
    const offsets=()=>page.evaluate(()=>[document.querySelector('.message-message-pList').scrollTop,document.querySelector('#messageContent').scrollTop,scrollY,document.querySelector('.cc98-rebuild-message-editor-send').getBoundingClientRect().bottom]);
    const listView=page.locator('.message-message-pList'),thread=page.locator('#messageContent');
    const before=await offsets();
    await listView.hover();await page.mouse.wheel(0,220);await page.waitForFunction(before=>document.querySelector('.message-message-pList').scrollTop>before,before[0]);
    const listMoved=await offsets();assert.deepEqual(listMoved.slice(1),before.slice(1));
    await thread.hover();await page.mouse.wheel(0,220);await page.waitForFunction(before=>document.querySelector('#messageContent').scrollTop>before,before[1]);
    const chatMoved=await offsets();assert.equal(chatMoved[0],listMoved[0]);assert.deepEqual(chatMoved.slice(2),before.slice(2));
    await page.evaluate(()=>{document.querySelectorAll('[data-qa-extra]').forEach(n=>n.remove());document.querySelector('.message-message-pList').scrollTop=0;document.querySelector('#messageContent').scrollTop=0});
    checks.push('Wheel scrolls contacts and history independently without moving the page or composer');
    const draft=page.locator('.cc98-rebuild-message-editor-textarea');await draft.fill('测试草稿：明天见。');
    const format=page.getByRole('button',{name:'格式',exact:true});const emoji=page.getByRole('button',{name:'插入表情',exact:true});
    assert.equal(await format.getAttribute('aria-expanded'),'false');
    await format.click();assert(await page.locator('button[title="粗体"]').isVisible());await format.click();
    await emoji.click();await page.locator('.cc98-rebuild-message-emoji-panel').waitFor();await emoji.click();
    assert(await page.getByRole('button',{name:'上传图片',exact:true}).isVisible());checks.push('Compact tools retain emoji picker, image upload and expandable formatting');
    const pin=page.locator('#contact_7002 .cc98-message-pin');await page.locator('#contact_7002').hover();await pin.click();await page.waitForFunction(()=>document.querySelector('#contact_7002 .cc98-message-pin').getAttribute('aria-pressed')==='true');
    assert.equal(await page.evaluate(()=>events.contact),0);assert.equal(await draft.inputValue(),'测试草稿：明天见。');
    await page.locator('#wcGetMore').click();assert.equal(await page.evaluate(()=>events.history),1);
    await page.getByRole('button',{name:'全部标为已读'}).click();assert.equal(await page.evaluate(()=>events.read),1);
    await page.locator('.cc98-rebuild-message-editor-send').click();assert.deepEqual(await page.evaluate(()=>events.send),['测试草稿：明天见。']);checks.push('History loading, contact pin without changing conversation or draft, mark all read, native send');
    }
    await page.evaluate(()=>theme('ascii','dark'));await page.waitForFunction(()=>document.documentElement.dataset.cc98ComfortTone==='dark');await shot('desktop-ascii-dark');
    assert.equal(await page.locator('#contact_7000 .message-message-pPortraitUrl').evaluate(n=>getComputedStyle(n).borderTopLeftRadius),'0px');
    await page.evaluate(()=>theme('modern','light'));await page.waitForFunction(()=>document.documentElement.dataset.cc98ComfortTone==='light');
    await page.setViewportSize({width:390,height:844});await fits();await shot('mobile-chat');
    const mobile=await page.evaluate(()=>{
      const rect=s=>document.querySelector(s).getBoundingClientRect();return {transcriptHeight:rect('#messageContent').height,screen:innerHeight,sendBottom:rect('.cc98-rebuild-message-editor-send').bottom,chatStarts:rect('.message-message-wHeader').top};
    });assert(mobile.sendBottom<=mobile.screen+1,JSON.stringify(mobile));assert(mobile.transcriptHeight>mobile.screen/2,JSON.stringify(mobile));
    const nav=page.locator('.message-nav a[href="/message/setting"]'),read=page.getByRole('button',{name:'全部标为已读'});await nav.focus();assert(await nav.evaluate(n=>{const b=n.getBoundingClientRect();return n.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}));await read.click();assert.equal(await page.evaluate(()=>events.read),reflow?1:2);
    const open=page.locator('.cc98-dm-contacts-button'),back=page.locator('.cc98-dm-chat-button');
    const draft=page.locator('.cc98-rebuild-message-editor-textarea');
    assert(!await page.locator('.message-message-people').isVisible());
    await open.click();await page.locator('#contact_7001 .message-message-pName').waitFor();await fits();await shot('mobile-contacts');
    await back.click();assert(await draft.isVisible());await open.click();
    await page.locator('#contact_7001 .message-message-pName').click();await page.waitForFunction(()=>document.querySelector('.message-message-wTitle').textContent.includes('山月'));
    assert(await draft.isVisible());assert.equal(await page.evaluate(()=>events.contact),1);await fits();checks.push('Mobile conversation/list switch and native contact selection');
    await open.click();const contact=page.locator('#contact_7004');await contact.focus();await page.keyboard.press('Tab');assert(await contact.locator('.cc98-message-pin').evaluate(n=>n===document.activeElement));await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('#contact_7004 .cc98-message-pin').getAttribute('aria-pressed')==='true');assert.equal(await page.evaluate(()=>events.contact),1);
    await contact.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.message-message-wTitle').textContent.includes('半夏'));assert(await draft.isVisible());checks.push('Mobile settings navigation, single mark-read action, keyboard contact selection and pin focus');
    await page.evaluate(()=>{document.querySelectorAll('.message-message-pFocus').forEach(r=>r.classList.remove('message-message-pFocus'));document.querySelector('.message-message-wTitle').textContent='无当前聊天对象'});
    await page.locator('.message-message-people').waitFor();await fits();checks.push('No active conversation shows the contact list');
    assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,reflow?'reflow.json':'validation.json'),JSON.stringify({checks,geo,mobile,errors},null,2));console.log(JSON.stringify({checks,geo,mobile}));
  }finally{await context.close();await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
