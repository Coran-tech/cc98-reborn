"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const { executable } = require("./new-topics-virtual.test.cjs");
const { frontendRoot } = require("./local-forum-path.cjs");
const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const baseline = process.argv.includes("--baseline");
const output = path.join(root, "outputs/dual-topic-tags-20261109/qa");

// Native InputTitle in frontend/Components/Edit.tsx: two layers use a wrapper
// .row containing two independent .row controls; layer 2 has the `1` suffix.
// Its React li click handlers mutate the labels then notify the parent; the
// parent keeps title when onTitleChange receives an empty title string.
const nativeFixture = String.raw`
const h = React.createElement;
window.__nativeCalls = [];
window.__submitted = null;
const choices = [
  { name:'出', id:11, subTags:[{name:'紫金港',id:101},{name:'玉泉',id:102}] },
  { name:'求', id:12, subTags:[{name:'西溪',id:201},{name:'海宁',id:202}] }
];
class NativeTitle extends React.Component {
  constructor(props){super(props);this.state={title:'双标签测试标题',tag1:'',tag2:'',revision:0};}
  onTitleChange(title,tag1,tag2){
    __nativeCalls.push({title,tag1,tag2});
    this.setState({...title ? {title} : {},tag1,tag2,revision:this.state.revision+1});
  }
  bindNative(){
    for(const suffix of ['', '1']){
      const row=document.querySelector('.tagBoxSelect'+suffix)?.parentElement;
      if(!row||row.__nativeBound)continue;row.__nativeBound=true;
      for(const name of ['tagBoxSelect','downArrow'])row.querySelector('.'+name+suffix).addEventListener('click',event=>{
        const list=row.querySelector('.tagBoxSub'+suffix);list.style.display=getComputedStyle(list).display==='none'?'block':'none';event.preventDefault();event.stopPropagation();
      });
    }
  }
  componentDidMount(){this.bindNative();window.__titleComponent=this;stabilizeEditorTagDropdown(document.querySelector('#native-editor'));}
  componentDidUpdate(){this.bindNative();stabilizeEditorTagDropdown(document.querySelector('#native-editor'));}
  select(item,second){
    const one=document.querySelector('.tagBoxSelect'),two=document.querySelector('.tagBoxSelect1');
    if(second)two.textContent=item.name;else{one.textContent=item.name;if(two)two.textContent='';}
    this.onTitleChange('',one.textContent,two?.textContent||'');
  }
  selector(second){
    const suffix=second?'1':'',selected=choices.find(item=>item.name===this.state.tag1);
    const options=second?(selected?.subTags||[]):choices;
    return h('div',{className:'row',key:suffix||'first'},
      h('div',{className:'tagBoxSelect'+suffix},''),
      h('div',{className:'downArrow'+suffix},h('img',{src:'/fixture/down.svg',width:12,height:12,alt:''})),
      h('ul',{className:'tagBoxSub'+suffix,style:{display:'none'}},options.map(item=>h('li',{key:item.id,onClick:()=>this.select(item,second)},item.name)))
    );
  }
  render(){
    const layers=this.props.layers;
    return h(React.Fragment,null,
      h('div',{className:'createTopicTitle'},
        h('div',{className:'createTopicListName'},'主题标题'),
        layers===2?h('div',{className:'row'},this.selector(false),this.selector(true)):layers===1?this.selector(false):null,
        h('input',{id:'native-title',placeholder:'请输入新主题的标题',value:this.state.title,onChange:event=>this.onTitleChange(event.target.value,document.querySelector('.tagBoxSelect')?.textContent||'',document.querySelector('.tagBoxSelect1')?.textContent||'')})),
      h('div',{className:'createTopicContent'},h('div',{className:'createTopicListName'},'主题内容'),h('div',null,'这是隔离测试内容。')),
      h('div',{className:'fixture-spacer'}),
      h('button',{id:'fixture-submit',type:'button',onClick:()=>{
        const primary=choices.find(item=>item.name===this.state.tag1),secondary=primary?.subTags.find(item=>item.name===this.state.tag2);
        window.__submitted={title:this.state.title,tag1:primary?.id||0,tag2:secondary?.id||0};
      }},'发帖'));
  }
}
document.addEventListener('click',()=>document.querySelectorAll('.tagBoxSub,.tagBoxSub1').forEach(list=>{list.style.display='none';}));
window.__mountNative=(layers)=>{
  ReactDOM.unmountComponentAtNode(document.querySelector('#native-editor'));
  __nativeCalls=[];__submitted=null;
  ReactDOM.render(h(NativeTitle,{layers}),document.querySelector('#native-editor'));
};
__mountNative(2);
`;

async function main() {
  await fs.mkdir(output,{recursive:true});
  const baselineRoot=path.join(root,"outputs/dual-topic-tags-20261109/before");
  const source=await fs.readFile(path.join(baseline?baselineRoot:root,"src/content.js"),"utf8");
  const start=source.indexOf("function closeEditorTagDropdowns("),end=source.indexOf("function bindDualUbbPaneDivider(",start);
  assert(start>=0&&end>start,"production tag adapter exists");
  const adapter=source.slice(start,end);
  const fixture=`<!doctype html><html lang="zh-CN" class="cc98-comfort" data-cc98-comfort-style="modern" data-cc98-comfort-tone="light" data-cc98-comfort-round="true"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>双标签隔离测试</title><link rel="stylesheet" href="/tests/fixtures/native-forum.css"><link rel="stylesheet" href="/src/theme-tokens.css"><link rel="stylesheet" href="/src/styles.css"><link rel="stylesheet" href="/src/interface-styles.css"><style>body{margin:0}.fixture-shell{max-width:1100px;margin:24px auto;padding:16px;box-sizing:border-box}.fixture-spacer{height:240px}#native-editor{padding:16px;display:flex;flex-direction:column;gap:18px}</style></head><body><main id="cc98-comfort-app" class="fixture-shell"><h1>发表主题</h1><div id="native-editor" class="createTopic cc98-rebuild-native-editor"></div></main><script src="/fixture/react.js"></script><script src="/fixture/react-dom.js"></script><script src="/src/theme-core.js"></script><script>function cleanupPostText(text){return String(text||'').trim();}${adapter}</script><script>${nativeFixture}</script></body></html>`;
  const browser=await chromium.launch({executablePath:await executable(),headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage();
  const report={passed:false,baseline,checks:[],errors:[]};
  page.setDefaultTimeout(4500);page.on('pageerror',error=>report.errors.push(error.message));
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==origin)return route.abort();
    if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});
    if(url.pathname==='/fixture/down.svg')return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><path d="m2 4 4 4 4-4" fill="none" stroke="black"/></svg>'});
    if(url.pathname==='/fixture/react.js')return route.fulfill({path:path.join(frontendRoot,'node_modules/react/umd/react.development.js')});
    if(url.pathname==='/fixture/react-dom.js')return route.fulfill({path:path.join(frontendRoot,'node_modules/react-dom/umd/react-dom.development.js')});
    const actual=baseline&&url.pathname==='/src/styles.css'?path.join(baselineRoot,'src/styles.css'):path.resolve(root,'.'+url.pathname);
    if(!actual.startsWith(root+path.sep))return route.abort();
    try{return await route.fulfill({path:actual});}catch{return route.fulfill({status:404,body:''});}
  });
  const choose=async(suffix,text)=>{await page.locator('.tagBoxSelect'+suffix).click();await page.locator('.tagBoxSub'+suffix).waitFor({state:'visible'});await page.locator('.tagBoxSub'+suffix+' li').getByText(text,{exact:true}).click();};
  const shot=async name=>page.screenshot({path:path.join(output,name+'.png'),animations:'disabled'});
  async function layout(layers,width,style){
    const result=await page.locator('.createTopicTitle').evaluate(row=>{
      const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
      return {row:rect(row),next:rect(row.nextElementSibling),controls:[...row.querySelectorAll('.tagBoxSelect,.tagBoxSelect1')].map(node=>rect(node.parentElement)),title:rect(row.querySelector('input')),scrollWidth:document.documentElement.scrollWidth,innerWidth};
    });
    const all=[...result.controls,result.title];
    assert.equal(result.controls.length,layers);
    assert(result.scrollWidth<=width+1,`${style}/${width}/${layers} page overflow ${JSON.stringify(result)}`);
    for(const r of all)assert(r.width>40&&r.left>=result.row.left-1&&r.right<=result.row.right+1&&r.top>=result.row.top-1&&r.bottom<=result.row.bottom+1,`controls fit inside title row ${JSON.stringify(result)}`);
    assert(result.next.top>=result.row.bottom-1,`next content row does not overlap title row ${JSON.stringify(result)}`);
    for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){const a=all[i],b=all[j];assert(a.right<=b.left+1||b.right<=a.left+1||a.bottom<=b.top+1||b.bottom<=a.top+1,`controls overlap ${style}/${width}/${layers}: ${JSON.stringify(result)}`);}
  }
  try{
    await page.goto(origin+'/fixture');await page.locator('.tagBoxSelect').waitFor();
    await choose('','出');
    assert.equal(await page.evaluate(()=>__titleComponent.state.tag1),'出','native React parent receives primary tag without title typing');
    await choose('1','紫金港');
    assert.deepEqual(await page.evaluate(()=>({tag1:__titleComponent.state.tag1,tag2:__titleComponent.state.tag2,title:__titleComponent.state.title})),{tag1:'出',tag2:'紫金港',title:'双标签测试标题'});
    await page.locator('#fixture-submit').click();
    assert.deepEqual(await page.evaluate(()=>__submitted),{title:'双标签测试标题',tag1:11,tag2:101});
    report.checks.push('Both native React tag callbacks and numeric submit values work without title typing');
    await choose('','求');
    assert.equal(await page.locator('.tagBoxSelect1').textContent(),'');
    assert.equal(await page.evaluate(()=>__titleComponent.state.tag2),'');
    assert.deepEqual(await page.locator('.tagBoxSub1 li').allTextContents(),['西溪','海宁']);
    await choose('1','海宁');await page.locator('#fixture-submit').click();
    assert.deepEqual(await page.evaluate(()=>__submitted),{title:'双标签测试标题',tag1:12,tag2:202});
    report.checks.push('Primary changes reset secondary and rebuild native dependent choices');
    await page.locator('.tagBoxSelect').click();await page.locator('.tagBoxSelect1').click();
    assert(await page.locator('.tagBoxSub').isHidden(),'one menu open at a time');
    assert(await page.locator('.tagBoxSub1').isVisible());
    await page.locator('h1').click();assert(await page.locator('.tagBoxSub1').isHidden());
    await page.locator('.tagBoxSelect1').click();await page.keyboard.press('Escape');
    assert(await page.locator('.tagBoxSub1').isHidden(),'Escape dismisses selector');
    report.checks.push('Menus are independent; outside click and Escape dismiss them');
    await page.locator('.tagBoxSelect').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>__titleComponent.state.tag1),'出');
    await page.locator('.tagBoxSelect1').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>__titleComponent.state.tag2),'玉泉');
    report.checks.push('Arrow and Enter keyboard selection reaches native React callbacks');
    for(const [width,style] of [[1280,'modern'],[390,'modern'],[320,'ascii'],[1280,'ascii']]){
      await page.setViewportSize({width,height:800});
      await page.evaluate(style=>CC98RebornThemeCore.apply(document.documentElement,{enabled:true,themeStyle:style,themeMode:'light',themePalette:'teal',roundedCorners:true}),style);
      for(const layers of [0,1,2]){
        await page.evaluate(layers=>__mountNative(layers),layers);
        await layout(layers,width,style);
        if(layers){await choose('','出');if(layers===2)await choose('1','玉泉');}
        if(layers===2){await page.locator('.tagBoxSelect1').click();const menu=await page.locator('.tagBoxSub1').boundingBox();assert(menu.x>=0&&menu.x+menu.width<=width+1,'dropdown fits viewport');await shot(`${style}-${width}-two-tags`);await page.keyboard.press('Escape');}
      }
    }
    report.checks.push('Zero/one/two tag layouts fit modern and ASCII desktop and 390/320px viewports');
    assert.deepEqual(report.errors,[]);report.passed=true;
  }catch(error){report.failure=String(error);await shot(baseline?'baseline-failure':'failure').catch(()=>{});throw error;}
  finally{await fs.writeFile(path.join(output,baseline?'baseline.json':'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await context.close();await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
