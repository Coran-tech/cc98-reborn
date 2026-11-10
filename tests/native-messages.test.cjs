"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { executable } = require("./new-topics-virtual.test.cjs");
const { frontendRoot } = require("./local-forum-path.cjs");
const root = path.resolve(__dirname, "..");
const output = path.join(root, "outputs/native-messages-20261109/qa");
const origin = "https://www.cc98.org";
const statusOnly = process.argv.includes("--ascii-status-only");

// Exact native component markup from frontend/Components/NoticeMessage.tsx;
// exact class lifecycle from frontend/Utility.tsx noticeMessageShow. All text
// and actions below are synthetic. Ant messages use the actual local 3.26.20.
const runtime = String.raw`
const h=React.createElement;
window.__clicks={page:0,message:0,link:0,closed:0};
class NoticeMessage extends React.PureComponent {
 render(){return h('div',{className:'noticeSuccess displaynone',id:this.props.id,style:{position:'fixed',top:this.props.top,left:this.props.left,whiteSpace:'pre-wrap',textAlign:'start'}},this.props.text);}
}
class SendTopicNoticeMessage extends React.PureComponent {
 render(){return h('div',{className:'send-topic-notice-success displaynone',id:this.props.id},'操作失败。'+this.props.text);}
}
ReactDOM.render(h(React.Fragment,null,
 h(NoticeMessage,{id:'native-short',top:'40%',left:'30%',text:'操作成功'}),
 h(NoticeMessage,{id:'native-long',top:'40%',left:'30%',text:'内容已保存。请检查这条较长的提示能否完整换行显示，而不是超出侧拉窗口。\nhttps://example.invalid/'+ 'resource'.repeat(12)}),
 h(SendTopicNoticeMessage,{id:'native-failure',text:'本条提示只用于测试阅读布局，没有向论坛发送请求。'})),document.querySelector('#native-root'));
window.__noticeMessageShow=id=>{
 $('#'+id).removeClass('displaynone').removeClass('noticeDisplaynone');
 setTimeout(()=>$('#'+id).addClass('noticeDisplaynone'),1);
};
window.__showNative=id=>{
 $('.noticeSuccess,.send-topic-notice-success').addClass('displaynone').removeClass('noticeDisplaynone');
 __noticeMessageShow(id);
};
window.__hideNative=()=>$('.noticeSuccess,.send-topic-notice-success').addClass('displaynone').removeClass('noticeDisplaynone');
window.__theme=(style,tone,enabled=true)=>{
 const settings={enabled,themeStyle:style,themeMode:tone,themePalette:'teal',roundedCorners:true};
 document.documentElement.classList.toggle('cc98-comfort',enabled);
 document.documentElement.classList.toggle('cc98-comfort-rebuild-active',enabled);
 CC98RebornThemeCore.apply(document.documentElement,settings);
 CC98RebornInterfaceStyle.sync(settings);
 CC98RebornNativeMessages.sync(settings);
};
window.__showAnt=()=>{
 antd.message.destroy();
 for(const type of ['success','error','warning','info','loading']){
  const text={success:'保存成功',error:'保存失败，请稍后重试',warning:'请检查必填项',info:'这是一条较长的信息提示，用于确认较窄的浏览窗口也可以完整显示。',loading:'正在加载…'}[type];
  antd.message[type](text,0);
 }
};
window.__showInteractive=()=>{
 antd.message.destroy();
 window.__closeAnt=antd.message.info(h('span',{onClick:()=>__clicks.message++},'交互消息 ',h('a',{href:'#message-link',onClick:event=>{event.preventDefault();__clicks.link++;}},'查看详情')),0,()=>__clicks.closed++);
};
window.__metrics=selector=>[...document.querySelectorAll(selector)].map(node=>{
 const r=node.getBoundingClientRect(),s=getComputedStyle(node),canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 const color=value=>{ctx.clearRect(0,0,1,1);ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3).map(v=>v/255);};
 const luminance=rgb=>rgb.map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);
 const ratio=(a,b)=>{const x=luminance(color(a)),y=luminance(color(b));return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 const parent=node.closest('.ant-message-notice-content')||node;
 const bg=getComputedStyle(parent).backgroundColor;
 return {text:node.textContent,left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,color:s.color,background:bg,contrast:ratio(s.color,bg),radius:s.borderTopLeftRadius,font:s.fontFamily,opacity:s.opacity,visibility:s.visibility,display:s.display,pointerEvents:s.pointerEvents,animationName:s.animationName,animationDuration:s.animationDuration,before:getComputedStyle(node,'::before').content};
});
`;

const fixture=`<!doctype html><html lang="zh-CN" class="cc98-comfort cc98-comfort-rebuild-active" data-cc98-comfort-rebuild-ready="true" data-cc98-comfort-app-root="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>原站消息隔离测试</title><link rel="stylesheet" href="/tests/fixtures/native-forum.css"><link rel="stylesheet" href="/src/theme-tokens.css"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/interface-styles.css"><link rel="stylesheet" href="/src/native-messages.css"><style>body{margin:0;background:var(--cc98-comfort-bg,#fff)}.fixture-shell{box-sizing:border-box;padding:24px;max-width:900px;margin:auto}#under-message{position:fixed;left:0;top:0;width:10px;height:450px;padding:0;border:0;background:transparent;opacity:0!important}#fixture-content{margin-top:460px;padding:20px;border:1px solid var(--cc98-comfort-border,#ddd)}</style></head><body><button id="under-message" aria-label="底层页面" onclick="__clicks.page++"></button><div id="root"><div id="native-root"></div><main id="cc98-comfort-app" class="fixture-shell"><section id="fixture-content"><h2>消息提示样式</h2><p>隔离测试页面 · 无论坛数据</p></section></main></div><script src="/fixture/react.js"></script><script src="/fixture/react-dom.js"></script><script src="/fixture/jquery.js"></script><script src="/fixture/moment.js"></script><script src="/fixture/antd.js"></script><script src="/src/theme-core.js"></script><script src="/src/interface-style.js"></script><script src="/src/native-messages.js"></script><script>${runtime}</script></body></html>`;

async function main(){
 await fs.mkdir(output,{recursive:true});
 const report={passed:false,checks:[],samples:[],errors:[]};
 const browser=await chromium.launch({executablePath:await executable(),headless:true});
 const context=await browser.newContext({viewport:{width:1280,height:850}}),page=await context.newPage();
 page.setDefaultTimeout(5000);page.on('pageerror',error=>report.errors.push(error.message));
 const assets={'/fixture/react.js':'react/umd/react.development.js','/fixture/react-dom.js':'react-dom/umd/react-dom.development.js','/fixture/jquery.js':'jquery/dist/jquery.js','/fixture/moment.js':'moment/min/moment.min.js','/fixture/antd.js':'antd/dist/antd.min.js'};
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==origin)return route.abort();
  if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});
  if(url.pathname==='/drawer')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="margin:0;background:#eee"><main style="padding:24px">独立左侧页面</main><iframe name="drawer" title="模拟侧拉窗口" src="/fixture" style="position:absolute;right:0;top:0;width:390px;height:800px;border:0"></iframe></body></html>'});
  if(assets[url.pathname])return route.fulfill({path:path.join(frontendRoot,'node_modules',assets[url.pathname])});
  const actual=path.resolve(root,'.'+url.pathname);
  if(!actual.startsWith(root+path.sep))return route.abort();
  try{return await route.fulfill({path:actual});}catch{return route.fulfill({status:404,body:''});}
 });
 const shot=async name=>page.screenshot({path:path.join(output,name+'.png')});
 const relay=id=>`.cc98-native-message[data-native-message-source="${id}"]`;
 const pauseNative=async(target,id,enabled=true)=>{
  await target.evaluate(id=>__showNative(id),id);
  await target.waitForFunction(id=>document.getElementById(id).getAnimations().length>0,id);
  if(enabled)await target.locator(relay(id)).waitFor();
  await target.evaluate(id=>[document.getElementById(id),document.querySelector('.cc98-native-message[data-native-message-source="'+id+'"]')].filter(Boolean).forEach(node=>node.getAnimations().forEach(animation=>{animation.pause();animation.currentTime=300;})),id);
 };
 const assertFit=(items,width,label)=>{
  for(const item of items){assert(item.width>20&&item.height>20,`${label} measurable: ${JSON.stringify(item)}`);assert(item.left>=7&&item.right<=width-7,`${label} viewport margins: ${JSON.stringify(item)}`);assert(item.scrollWidth<=item.clientWidth+1,`${label} content overflow: ${JSON.stringify(item)}`);assert(item.contrast>=4.5,`${label} readable text contrast: ${JSON.stringify(item)}`);}
 };
 try{
  await page.goto(origin+'/fixture');await page.waitForFunction(()=>window.__showAnt);
  if(statusOnly){
   await page.setViewportSize({width:320,height:850});await page.evaluate(()=>{__theme('ascii','light');__showAnt();});await page.waitForTimeout(400);
   const markers=await page.evaluate(()=>__metrics('.ant-message .anticon'));
   assert.deepEqual(markers.map(marker=>marker.before),['"[OK]"','"[X]"','"[!]"','"[i]"','"[...]"']);
   for(const marker of markers){assert(marker.width>0&&marker.height>0&&marker.display!=='none');assert(marker.contrast>=4.5,`ASCII text marker contrast ${JSON.stringify(marker)}`);}
   report.samples.push({style:'ascii',tone:'light',width:320,markers});await shot('ascii-light-320-ant');
   assert.deepEqual(report.errors,[]);report.checks.push('ASCII light text status markers stay visible and all reach 4.5:1 contrast');report.passed=true;return;
  }
  for(const [style,tone,width] of [['modern','light',1280],['modern','dark',390],['ascii','light',320],['ascii','dark',390]]){
   await page.setViewportSize({width,height:850});await page.evaluate(([style,tone])=>__theme(style,tone),[style,tone]);
   await page.evaluate(()=>{__hideNative();__showAnt();});await page.waitForTimeout(400);
   const ant=await page.evaluate(()=>__metrics('.ant-message-notice-content'));
   assert.equal(ant.length,5);assertFit(ant,width,`${style}/${tone}/Ant`);
   for(let i=1;i<ant.length;i++)assert(ant[i].top>=ant[i-1].bottom+4,'Ant stacked messages remain separated');
   if(style==='ascii')for(const item of ant){assert.equal(parseFloat(item.radius),0,'ASCII messages are square');assert(/Consolas/i.test(item.font),'ASCII uses monospace font');}
   const states=await page.evaluate(()=>__metrics('.ant-message-custom-content'));
   if(style==='ascii'){
    const markers=await page.evaluate(()=>__metrics('.ant-message .anticon'));
    assert.deepEqual(markers.map(marker=>marker.before),['"[OK]"','"[X]"','"[!]"','"[i]"','"[...]"'],'ASCII retains each status cue');
    assert(markers.every(marker=>marker.width>0&&marker.height>0&&marker.display!=='none'),'ASCII status markers are visible');
    assert(markers.every(marker=>marker.contrast>=4.5),'ASCII text status markers reach 4.5:1 contrast');
   }
   report.samples.push({style,tone,width,ant,states});await shot(`${style}-${tone}-${width}-ant`);
   await page.mouse.click(3,40);assert.equal(await page.evaluate(()=>__clicks.page),report.samples.length,'message container whitespace lets page clicks through');
   await page.evaluate(()=>antd.message.destroy());
   for(const id of ['native-short','native-long','native-failure']){
    await pauseNative(page,id);
    const [native]=await page.evaluate(selector=>__metrics(selector),relay(id));assertFit([native],width,`${style}/${tone}/${id}`);
    assert(Number(native.opacity)>=.95,'native prompt body remains opaque before its fade-out');
    if(style==='ascii'){assert.equal(parseFloat(native.radius),0,'native ASCII capsule is square');assert(/Consolas/i.test(native.font),'native ASCII uses monospace font');}
    report.samples.at(-1)[id]=native;
    if(id!=='native-short')await shot(`${style}-${tone}-${width}-${id}`);
   }
   await page.evaluate(()=>__hideNative());
  }
  report.checks.push('Real Ant Design five-state message stack: modern/ASCII light/dark, text contrast, wrapping, viewport bounds, and transparent whitespace');
  report.checks.push('Verified native capsule and reply failure components: readable opacity, long URLs/newlines, 320/390px bounds, ASCII square monospace');

  await page.evaluate(()=>{__theme('modern','light');antd.message.info('原生 Ant 消息',0);__noticeMessageShow('native-short');__noticeMessageShow('native-failure');});
  await page.locator(relay('native-failure')).waitFor();await page.waitForTimeout(350);
  const stack=await page.evaluate(()=>__metrics('.ant-message-notice-content,.cc98-native-message'));
  assert.equal(stack.length,3);
  for(let i=0;i<stack.length;i++)for(let j=i+1;j<stack.length;j++)assert(stack[i].bottom<=stack[j].top||stack[j].bottom<=stack[i].top,'native and Ant messages do not overlap');
  report.mixedStack=stack;await shot('modern-light-mixed-stack');
  await page.evaluate(()=>{__hideNative();antd.message.destroy();});
  report.checks.push('Simultaneous native capsule/failure messages and Ant portal message do not overlap');

  await page.evaluate(()=>{__theme('modern','light');__showInteractive();});await page.waitForTimeout(350);
  await page.locator('.ant-message a').click();
  assert.deepEqual(await page.evaluate(()=>({message:__clicks.message,link:__clicks.link,closed:__clicks.closed})),{message:1,link:1,closed:0});
  await page.evaluate(()=>__closeAnt());await page.locator('.ant-message-notice').waitFor({state:'detached'});
  assert.equal(await page.evaluate(()=>__clicks.closed),0,'Ant 3 returned close function removes DOM without invoking onClose');
  await page.mouse.move(300,800);
  await page.evaluate(()=>{window.__autoClosed=false;antd.message.success('自动消失测试',.4,()=>__autoClosed=true);});
  await page.waitForFunction(()=>__autoClosed===true);
  report.checks.push('Native Ant link and click callbacks, returned close function, onClose and auto-dismiss remain intact');

  for(const id of ['native-short','native-failure']){
   await page.evaluate(id=>__showNative(id),id);
   await page.waitForFunction(id=>document.getElementById(id).classList.contains('noticeDisplaynone'),id);
   const [active]=await page.evaluate(id=>__metrics('#'+id),id);
   assert.equal(active.animationDuration,'3s','native duration is preserved');
   assert.equal(active.opacity,'0.5','source opacity remains available to native submit-success monitoring');
   await page.locator(relay(id)).waitFor();
   await page.waitForFunction(id=>getComputedStyle(document.getElementById(id)).visibility==='hidden',id,{timeout:4500});
   await page.locator(relay(id)).waitFor({state:'detached'});
   assert.equal(await page.locator('#'+id).count(),1,'native DOM remains mounted after fade');
   await page.evaluate(id=>__showNative(id),id);
   await page.waitForFunction(id=>getComputedStyle(document.getElementById(id)).visibility==='visible',id);
   await page.evaluate(()=>__hideNative());
  }
  report.checks.push('Native noticeDisplaynone remains a three-second visibility animation, keeps DOM mounted, and can be shown again');

  await page.evaluate(()=>__showNative('native-short'));await page.locator(relay('native-short')).waitFor();
  await page.evaluate(()=>document.querySelector('#native-short').firstChild.textContent='更新后的原生提示');
  await page.waitForFunction(()=>document.querySelector('.cc98-native-message[data-native-message-source="native-short"]')?.textContent.includes('更新后的原生提示'));
  await page.evaluate(()=>document.querySelector('#native-short').remove());
  await page.locator(relay('native-short')).waitFor({state:'detached',timeout:4500});
  report.checks.push('Active source text updates propagate; removed source leaves no lasting relay');

  await page.evaluate(()=>{__theme('ascii','dark',false);__showAnt();});await page.waitForTimeout(350);
  const [nativeAnt]=await page.evaluate(()=>__metrics('.ant-message-notice-content'));
  assert.equal(nativeAnt.radius,'4px','disabled plugin restores native Ant rounding');
  await pauseNative(page,'native-long',false);const [nativeCapsule]=await page.evaluate(()=>__metrics('#native-long'));
  assert.equal(nativeCapsule.background,'rgb(169, 169, 169)','disabled plugin restores darkgrey native capsule');
  assert.equal(Number(nativeCapsule.opacity),.5,'disabled plugin restores original fadeOut opacity');
  report.checks.push('Disabling plugin restores unmodified native Ant and capsule styles');

  await page.setViewportSize({width:1200,height:850});await page.goto(origin+'/drawer');
  const drawer=page.frame({name:'drawer'});await drawer.waitForFunction(()=>window.__showAnt);
  await drawer.evaluate(()=>{__theme('ascii','dark');__showAnt();});await page.waitForTimeout(350);
  assertFit(await drawer.evaluate(()=>__metrics('.ant-message-notice-content')),390,'drawer Ant');
  await drawer.evaluate(()=>antd.message.destroy());await pauseNative(drawer,'native-long');
  assertFit(await drawer.evaluate(selector=>__metrics(selector),relay('native-long')),390,'drawer native');await shot('ascii-dark-drawer');
  report.checks.push('Messages stay inside a 390px independent iframe viewport with plugin styling');
  assert.deepEqual(report.errors,[]);report.passed=true;
 }catch(error){report.failure=String(error);await shot('failure').catch(()=>{});throw error;}
 finally{await fs.writeFile(path.join(output,statusOnly?'ascii-status-validation.json':'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:report.passed,checks:report.checks,errors:report.errors,failure:report.failure,output}));await context.close();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
