// Isolated browser coverage of the real image viewer. No account or network data.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'outputs/image-viewer-transform-20261109/qa');
const origin = 'https://www.cc98.org';
const viewer = '#cc98-comfort-image-viewer';
const image = viewer + ' .cc98-image-viewer-stage img';
const art = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="420" viewBox="0 0 720 420"><rect width="720" height="420" fill="#f1e6c7"/><path d="M0 0h720v55H0z" fill="#2e6b66"/><text x="360" y="38" fill="white" font-size="25" text-anchor="middle" font-family="sans-serif">TOP / UP</text><path d="M325 290V170h-45l80-80 80 80h-45v120z" fill="#c36a44"/><rect x="34" y="340" width="75" height="45" fill="#436c8d"/><text x="585" y="380" fill="#54392e" font-size="26" font-family="sans-serif">RIGHT</text></svg>`;
const fixture = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>图片查看器测试 - CC98论坛</title>
${['theme-tokens.css','styles.css','interface-styles.css'].map(f=>`<link rel="stylesheet" href="/src/${f}">`).join('')}</head><body><div id="root"><header class="topBar"><span class="topBarUserName">测试用户</span></header><section class="topicInfo-info"><h1 id="essay1">图片方向与缩放</h1><button class="followTopic">收藏</button></section><div class="reply" data-floor="1"><span class="reply-floor">1</span><a href="/user/id/1234">测试用户</a><div class="reply-content"><div class="substance"><article><p>用有方向标记的图片检查旋转。</p><img src="/fixture/one.png" alt="方向测试一"><p>第二张</p><img src="/fixture/two.png" alt="方向测试二"><p>${'底部留白用于检查关闭后阅读位置。'.repeat(60)}</p></article></div></div><div class="reply-footer"><button>引用</button></div></div></div>
${['theme-core.js','interface-style.js','conversation-core.js','conversation.js','content.js'].map(f=>`<script src="/src/${f}"></script>`).join('')}</body></html>`;

async function main() {
  await fs.mkdir(out,{recursive:true});
  const browser = await chromium.launch({executablePath:await executable(),headless:true});
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  const page = await context.newPage(), errors = [], checks = [];
  page.setDefaultTimeout(5000); page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{
    localStorage.setItem('userInfo',JSON.stringify({id:1234,name:'测试用户'})); window.__downloads=[];
    window.chrome={runtime:{getManifest:()=>({version:'0.4.3'}),getURL:p=>new URL('/'+p,location.origin).href,onMessage:{addListener(){}},sendMessage:(m,c)=>{const r={ok:m.type==='CC98_REBORN_DOWNLOAD_FILE'};if(r.ok)__downloads.push(m);c?.(r);return Promise.resolve(r)}},storage:{local:{get:(keys,c)=>{const value={'cc98RebornOpenIdBinding:v1':{bound:true,userId:'1234',userName:'测试用户'},cc98ComfortSettings:{enabled:true,rebuildUi:true,themeStyle:'modern',themeMode:'light',prewarmPostImages:false,previsitFirstPageForTopicImages:false}};c?.(value);return Promise.resolve(value)},set:(v,c)=>{c?.();return Promise.resolve()}},onChanged:{addListener(){}}}};
  });
  await context.route('**/*', async route=>{
    const u=new URL(route.request().url());
    if(u.origin===origin && u.pathname==='/topic/6500000')return route.fulfill({contentType:'text/html',body:fixture});
    if(u.origin===origin && u.pathname.startsWith('/fixture/'))return route.fulfill({contentType:'image/svg+xml',body:art});
    if(u.origin===origin && /^\/src\/[\w.-]+$/.test(u.pathname))return route.fulfill({path:path.join(root,u.pathname)});
    return route.fulfill({status:204,body:''});
  });
  async function matrix() {
    // Wait for the viewer's short transform animation to settle.
    await page.waitForTimeout(125);
    return page.locator(image).evaluate(n=>{const m=new DOMMatrix(getComputedStyle(n).transform),r=n.getBoundingClientRect();return {a:m.a,b:m.b,c:m.c,d:m.d,x:m.e,y:m.f,scale:Math.hypot(m.a,m.b),angle:(Math.atan2(m.b,m.a)*180/Math.PI+360)%360,cx:(r.left+r.right)/2,cy:(r.top+r.bottom)/2,width:r.width,height:r.height}});
  }
  async function open() {
    await page.locator('#cc98-comfort-app img[alt="方向测试一"]').first().click();
    await page.locator(image).waitFor(); await page.locator(image).evaluate(n=>n.decode());
  }
  async function rotate(side) {
    const buttons=page.locator(viewer+' button');
    const found=await buttons.evaluateAll((nodes,side)=>nodes.findIndex(n=>new RegExp(side==='left'?'左.*旋转|旋转.*左':'右.*旋转|旋转.*右').test(n.getAttribute('aria-label')||n.title||n.textContent)),side);
    assert(found>=0,side+' rotation control exists');await buttons.nth(found).click();
  }
  const near=(a,b,label)=>assert(Math.abs(a-b)<.06,`${label}: ${a} vs ${b}`);
  async function reset(){await page.keyboard.press('0');const m=await matrix();near(m.scale,1,'reset scale');near(m.angle,0,'reset angle');near(m.x,0,'reset X');near(m.y,0,'reset Y')}
  async function shot(name){await page.screenshot({path:path.join(out,name+'.png')})}
  async function localAt(point){return page.locator(image).evaluate((n,p)=>{const m=new DOMMatrix(getComputedStyle(n).transform),r=n.getBoundingClientRect();return new DOMPoint(p.x-(r.left+r.right)/2,p.y-(r.top+r.bottom)/2).matrixTransform(new DOMMatrix([m.a,m.b,m.c,m.d,0,0]).inverse()).toJSON()},point)}
  try {
    await page.goto(origin+'/topic/6500000');await page.locator('#cc98-comfort-app img[alt="方向测试一"]').first().waitFor();
    await open(); const first=await matrix();near(first.scale,1,'initial scale');
    await rotate('right');let m=await matrix();near(m.angle,90,'clockwise quarter turn');near(m.width,first.height,'rotated width');near(m.height,first.width,'rotated height');
    await shot('desktop-rotated');await rotate('left');near((await matrix()).angle,0,'counterclockwise returns upright');
    await rotate('left');near((await matrix()).angle,270,'counterclockwise quarter turn');await rotate('right');
    await page.keyboard.press('Shift+ArrowRight');near((await matrix()).angle,90,'Shift right rotates');assert.match(await page.locator(image).getAttribute('src'),/one\.png/);await page.keyboard.press('Shift+ArrowLeft');near((await matrix()).angle,0,'Shift left rotates');
    checks.push('Left and right buttons and Shift arrows rotate by 90 degrees without changing the image');

    await rotate('right');m=await matrix();const point={x:m.cx+40,y:m.cy-25};
    const at=()=>localAt(point);
    const before=await at();await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,-100);await matrix();const after=await at();near(after.x,before.x,'rotated pointer anchor X');near(after.y,before.y,'rotated pointer anchor Y');
    m=await matrix();await page.mouse.move(m.cx,m.cy);await page.mouse.down();await page.mouse.move(m.cx+65,m.cy+35,{steps:5});await page.mouse.up();const dragged=await matrix();near(dragged.x-m.x,65,'drag after rotation X');near(dragged.y-m.y,35,'drag after rotation Y');
    checks.push('Pointer-anchored zoom and drag remain correct after rotation');

    await reset();m=await matrix();await page.mouse.move(m.cx,m.cy);for(let i=0;i<32;i++)await page.mouse.wheel(0,-100);
    m=await matrix();near(m.scale,20,'maximum zoom is 20x');await page.mouse.wheel(0,-100);near((await matrix()).scale,20,'zoom cap');await rotate('left');near((await matrix()).scale,20,'rotation preserves zoom');
    await reset();checks.push('Zoom reaches and caps at 20x; rotation retains zoom and 0 resets all transforms');

    await rotate('right');await page.keyboard.press('ArrowRight');m=await matrix();near(m.angle,0,'next image resets rotation');near(m.scale,1,'next image resets zoom');assert.match(await page.locator(image).getAttribute('src'),/two\.png/);assert.match(await page.locator(viewer+' .cc98-image-viewer-save').getAttribute('data-href'),/two\.png/);
    await rotate('right');await page.locator(viewer+' .cc98-image-viewer-save').click();assert.deepEqual(await page.evaluate(()=>__downloads.map(v=>v.url)),[origin+'/fixture/two.png']);
    await page.keyboard.press('ArrowLeft');assert.match(await page.locator(image).getAttribute('src'),/one\.png/);await page.keyboard.press('Escape');await page.locator(viewer).waitFor({state:'detached'});
    checks.push('Arrow navigation resets transforms, save still downloads the original image after rotation, and Escape closes');

    for(const [width,themeStyle,themeMode] of [[390,'modern','dark'],[320,'ascii','light']]) {
      await page.setViewportSize({width,height:844});await page.evaluate(s=>{Object.assign(lastSettings,s);CC98RebornThemeCore.apply(document.documentElement,lastSettings);CC98RebornInterfaceStyle.sync(lastSettings)},{themeStyle,themeMode});await open();
      await page.keyboard.press('Shift+ArrowRight');near((await matrix()).angle,90,'reopening registers only one keyboard rotation handler');await page.keyboard.press('0');await rotate('left');await matrix();
      const centered=await page.locator(image).evaluate(n=>{const r=n.getBoundingClientRect(),s=n.closest('.cc98-image-viewer-stage').getBoundingClientRect();return {dx:(r.left+r.right-s.left-s.right)/2,dy:(r.top+r.bottom-s.top-s.bottom)/2,fit:r.left>=s.left-1&&r.right<=s.right+1&&r.top>=s.top-1&&r.bottom<=s.bottom+1}});
      near(centered.dx,0,'narrow stage centered X');near(centered.dy,0,'narrow stage centered Y');assert(centered.fit,'rotated picture fits narrow stage');
      const anchor={x:width/2+20,y:422-30},beforeAnchor=await localAt(anchor);await page.mouse.move(anchor.x,anchor.y);await page.mouse.wheel(0,-100);await matrix();const afterAnchor=await localAt(anchor);near(beforeAnchor.x,afterAnchor.x,'narrow rotated zoom anchor X');near(beforeAnchor.y,afterAnchor.y,'narrow rotated zoom anchor Y');await page.keyboard.press('0');await rotate('left');await matrix();
      const bounds=await page.locator(viewer).evaluate(v=>{const r=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom}};return {controls:[...v.querySelectorAll('.cc98-image-viewer-toolbar button,.cc98-image-viewer-close')].map(r),width:innerWidth,height:innerHeight}});
      assert(bounds.controls.every(b=>b.x>=0&&b.right<=width&&b.y>=0&&b.bottom<=bounds.height),JSON.stringify(bounds));
      for(let i=0;i<bounds.controls.length;i++)for(let j=i+1;j<bounds.controls.length;j++){const a=bounds.controls[i],b=bounds.controls[j];assert(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1,'toolbar controls do not overlap')}
      await shot(themeStyle+'-'+width);await page.keyboard.press('Escape');await page.locator(viewer).waitFor({state:'detached'});
    }
    checks.push('Rotation controls remain visible without overlap on narrow modern and ASCII themes');
    await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>window.scrollTo(0,180));const pos=await page.evaluate(()=>scrollY);await open();await rotate('right');await page.keyboard.press('Escape');await page.waitForTimeout(1300);near(await page.evaluate(()=>scrollY),pos,'close restores reading offset');
    checks.push('Closing after rotation restores the original reading position');assert.deepEqual(errors,[]);
    await fs.writeFile(path.join(out,'validation.json'),JSON.stringify({passed:true,checks,errors},null,2));console.log(JSON.stringify({passed:true,checks}));
  }catch(error){
    await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
    console.error({checks,errors,buttons:await page.locator(viewer+' button').allTextContents()});throw error;
  }finally{await context.close();await browser.close()}
}
main().catch(e=>{console.error(e);process.exitCode=1});
