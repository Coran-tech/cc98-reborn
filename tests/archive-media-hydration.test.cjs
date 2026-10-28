// Uses the forum's installed React/react-lazyload versions in an offline browser.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const { frontendRoot } = require('./local-forum-path.cjs');
const webpack = require(path.join(frontendRoot, 'node_modules/webpack'));
const root = path.resolve(__dirname, '..'), origin = 'https://www.cc98.org';
const output = path.join(root, 'outputs/archive-refinement-20261028/media');
const baseline = process.argv.includes('--baseline');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD2cAAAAASUVORK5CYII=', 'base64');

async function buildFixture() {
  await fs.mkdir(output, { recursive: true });
  const entry = path.join(output, 'native-lazy-fixture.js');
  await fs.writeFile(entry, `
const React = require('react'), ReactDOM = require('react-dom'), LazyLoad = require('react-lazyload').default;
const h = React.createElement, scenario = window.__fixture;
class NativeImage extends React.Component {
 constructor(props) { super(props); this.state={show:!props.hidden}; }
 render() { return this.state.show ? h(LazyLoad,{height:300,once:true,offset:100},h('img',{src:'/test-media/'+this.props.id+'.png',alt:this.props.id,width:80,height:40}))
 : h('div',{className:'hiddenImage',onClick:()=>this.setState({show:true})},'点击查看图片'); }
}
class NativeQuote extends React.Component {
 constructor(props) { super(props); this.state={show:false}; }
 render() { return h('div',{style:{backgroundColor:'#F5FAFF',border:'1px solid #ccc',maxHeight:800,overflowY:'auto'}},
 this.state.show ? h('div',null,h('p',null,'完整的旧引用'),h(NativeImage,{id:'quoted-hidden',hidden:true})) : h('button',{className:'hiddenImage',onClick:()=>this.setState({show:true})},'展开剩余引用'),h('p',null,'最近两层引用')); }
}
class DelayedAvatar extends React.Component {
 constructor(props) { super(props);this.state={show:false};this.scheduled=false;this.reveal=()=>{if(this.scheduled)return;this.scheduled=true;setTimeout(()=>this.setState({show:true}),500)}; }
 componentDidMount(){window.addEventListener('scroll',this.reveal)}
 componentWillUnmount(){window.removeEventListener('scroll',this.reveal)}
 render(){return h('aside',{className:'userMessage'},this.state.show?h('img',{className:'userPortrait',src:'/test-media/author-avatar.png'}):h('div',{className:'lazyload-placeholder',style:{height:150}},''));}
}
class NativeAward extends React.Component {
 constructor(props){super(props);this.state={show:false}}
 render(){return h('div',{className:'awardInfo'},this.state.show?h('div',null,h('p',null,'已展开评分'),h('div',{style:{height:3000}},'评分理由'),h(NativeImage,{id:'award-image'})):h('button',{onClick:()=>this.setState({show:true})},'显示全部'));}
}
const tall=height=>h('div',{style:{height}},'长正文');
const body=scenario==='quote'?[h(NativeQuote),tall(2400)]
 :scenario==='hidden'?[h(NativeImage,{id:'hidden-at-top',hidden:true}),tall(2400)]
 :scenario==='long'?[tall(42000),h(NativeImage,{id:'after-long-post'})]
 :scenario==='nested'?[h('blockquote',{style:{maxHeight:400,overflowY:'auto'}},tall(35000),h(NativeImage,{id:'nested-quote'}))]
 :scenario==='avatar'||scenario==='award'?[h('p',null,'只有文字和附件链接的正文')]
 :scenario==='quote-failure'?[h('button',{className:'hiddenImage'},'展开剩余引用')]
 :[h('div',{className:'lazyload-placeholder',style:{height:300}},'真实未完成占位'),h('div',{className:'hiddenImage'},'其他不是图片的控件')];
ReactDOM.render(h('div',null,h('h1',{id:'essay1'},'媒体读取测试'),h('div',{className:'reply','data-floor':'1'},scenario==='avatar'?h(DelayedAvatar):null,h('span',{className:'reply-floor'},'1'),h('a',{href:'/user/id/12345'},'测试用户'),h('button',{onClick:()=>parent.__archiveVotes++},'投票'),h('div',{className:'reply-content'},h('div',{className:'substance'},h('article',null,...body)),scenario==='nested'?h('div',{className:'signature'},tall(500),h(NativeImage,{id:'signature'})):null,scenario==='award'?h(NativeAward):null))),document.querySelector('#root'));
`, 'utf8');
  await new Promise((resolve, reject) => webpack({ mode:'production', entry, target:'web', output:{path:output,filename:'native-lazy-bundle.js'}, resolve:{modules:[path.join(frontendRoot,'node_modules')]}, optimization:{minimize:false}, devtool:false }, (error,stats) => error || stats.hasErrors() ? reject(error || new Error(stats.toString('errors-only'))) : resolve()));
}
const shell = body => `<!doctype html><html><head><meta charset="utf-8"><style>body{margin:8px;font:16px/1.5 sans-serif}.reply{margin:10px}img{max-width:100%}</style></head><body>${body}</body></html>`;
async function main() {
  await buildFixture();
  const browser = await chromium.launch({executablePath:await executable(),headless:true});
  const context = await browser.newContext({viewport:{width:1200,height:900}}), page=await context.newPage();
  const errors=[],report=[]; let currentScenario='quote'; page.on('pageerror',error=>errors.push(error.message));
  await context.route('**/*', async route => {
    const request=route.request(),url=new URL(request.url());
    if(url.origin!==origin)return route.abort();
    if(/^\/topic\/100(?:\/1)?$/.test(url.pathname)) {
      if(request.resourceType()==='fetch')return route.fulfill({contentType:'text/html',body:shell('<div id="root"></div>')});
      return route.fulfill({contentType:'text/html',body:shell('<div id="root"></div><script>window.__fixture='+JSON.stringify(currentScenario)+'</script><script src="/native-lazy-bundle.js"></script>')});
    }
    if(url.pathname==='/native-lazy-bundle.js')return route.fulfill({path:path.join(output,'native-lazy-bundle.js')});
    if(url.pathname.startsWith('/test-media/'))return route.fulfill({contentType:'image/png',body:png});
    if(url.pathname.startsWith('/src/'))return route.fulfill({path:path.join(root,url.pathname)});
    return route.fulfill({contentType:'text/html',body:shell('<main id="foreground" style="height:4000px">保持前台内容</main>')});
  });
  try {
    await page.goto(origin+'/fixture');
    await page.addStyleTag({path:path.join(root,'src/styles.css')});
    await page.addStyleTag({path:path.join(root,'src/topic-search.css')});
    await page.evaluate(() => {
      document.documentElement.classList.add('cc98-comfort');
      window.chrome={runtime:{getURL:p=>location.origin+'/'+p,getManifest:()=>({version:'0.4.2'}),onMessage:{addListener(){}},sendMessage:(m,c)=>{c?.({ok:false});return Promise.resolve({ok:false})}},storage:{local:{get:(k,c)=>{c?.({});return Promise.resolve({})},set:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener(){}}}};
    });
    for(const file of ['theme-core.js','conversation-core.js'])await page.addScriptTag({path:path.join(root,'src',file)});
    await page.addScriptTag({path:baseline?path.join(root,'outputs/archive-refinement-20261028/before/src/conversation.js'):path.join(root,'src/conversation.js')});
    let content=await fs.readFile(path.join(root,'src/content.js'),'utf8');content=content.slice(0,content.lastIndexOf('\narmInitialRebuildTransitionVeil();'));
    await page.addScriptTag({content});
    await page.evaluate(()=>{lastSettings={...DEFAULT_SETTINGS,enabled:true};scheduleRebuild=()=>{};scheduleSync=()=>{};window.__foreground=document.querySelector('#foreground');window.__archiveVotes=0;scrollTo(0,250)});
    for(const scenario of ['quote','hidden','long','nested','avatar','award','quote-failure','unresolved']) {
      currentScenario=scenario;
      const result=await page.evaluate(async()=>{const before={url:location.href,scroll:scrollY},start=performance.now(),reader=CC98RebornConversation.createReader({topicId:'100',maxKnown:1},{archive:true});try{const value=await reader.read(1);return {...value,elapsed:performance.now()-start,before,after:{url:location.href,scroll:scrollY},sameForeground:__foreground===document.querySelector('#foreground')}}finally{reader.dispose()}});
      const html=result.records.map(r=>r.contentHtml+r.signatureHtml+r.extraHtml+r.avatar).join('');
      const expected={quote:['quoted-hidden'],hidden:['hidden-at-top'],long:['after-long-post'],nested:['nested-quote','signature'],avatar:['author-avatar'],award:['award-image'],'quote-failure':[],unresolved:[]}[scenario];
      const captured=expected.filter(id=>html.includes('/test-media/'+id+'.png'));
      report.push({scenario,incompleteMedia:result.incompleteMedia,incompleteQuotes:result.incompleteQuotes||0,captured,expected,elapsed:Math.round(result.elapsed)});
      assert.deepEqual(result.before,result.after);assert(result.sameForeground);assert(result.elapsed<14000);
      if(!baseline){assert.deepEqual(captured,expected,scenario);assert.equal(result.incompleteMedia,scenario==='unresolved'?1:0,scenario);assert.equal(result.incompleteQuotes,scenario==='quote-failure'?1:0,scenario);}
    }
    // Disposing a reader must abort even while it is moving an inner scroll area.
    currentScenario='long';const cancelled=await page.evaluate(async()=>{const reader=CC98RebornConversation.createReader({topicId:'100'},{archive:true});const promise=reader.read(1).catch(error=>error.name);setTimeout(()=>reader.dispose(),150);return await promise});
    assert.equal(cancelled,'AbortError');assert.equal(await page.locator('.cc98-topic-search-worker').count(),0);assert.equal(await page.evaluate(()=>__archiveVotes),0);assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(output,baseline?'baseline.json':'validation.json'),JSON.stringify({baseline,realReactLazyload:true,report,foregroundPreserved:true,cancellation:'AbortError',errors},null,2));
    console.log(JSON.stringify({baseline,report,errors}));
  }finally{await context.close();await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
