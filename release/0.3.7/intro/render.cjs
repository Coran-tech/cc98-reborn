const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const directory = __dirname;
const origin = 'http://127.0.0.1:8787';
async function main() {
  const features=JSON.parse(await fs.readFile(path.join(directory,'features.json'),'utf8'));
  const browser=await chromium.launch({channel:'msedge',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const url=new URL(route.request().url());
      const file=path.resolve(directory,'.'+decodeURIComponent(url.pathname));
      if(url.origin!==origin||!file.startsWith(directory+path.sep))return route.abort();
      try {await route.fulfill({path:file});}catch{await route.fulfill({status:404,body:'Not found'});}
    });
    await page.goto(origin+'/concepts.html');await page.evaluate(()=>document.fonts.ready);
    const layout=[];
    for(const feature of features){
      const card=page.locator('#concept-'+feature.id);
      await card.scrollIntoViewIfNeeded();
      const bounds=await card.evaluate(card=>{
        const outer=card.getBoundingClientRect(),viz=card.querySelector('.viz').getBoundingClientRect(),foot=card.querySelector('.foot').getBoundingClientRect(),subtitle=card.querySelector('.subtitle').getBoundingClientRect();
        const outside=[...card.querySelectorAll('.pane,.browser,.terminal,.viewer,.dual-editor,.pill,.mock-button')].filter(node=>node.closest('.viz')).map(node=>({cls:node.className,rect:node.getBoundingClientRect()})).filter(({rect})=>rect.width&&(rect.left<outer.left-1||rect.right>outer.right+1||rect.bottom>foot.top-5||rect.top<subtitle.bottom+4));
        return {width:outer.width,height:outer.height,contentBottom:viz.bottom-outer.top,footTop:foot.top-outer.top,outside:outside.map(item=>item.cls)};
      });
      layout.push({id:feature.id,key:feature.key,...bounds});
      if(bounds.outside.length)console.log('CHECK LAYOUT',feature.id,JSON.stringify(bounds));
      await card.screenshot({path:path.join(directory,'images',`${feature.id}-${feature.key}.png`),animations:'disabled'});
    }
    await page.setViewportSize({width:1920,height:1100});
    await page.goto(origin+'/contact-sheet.html');await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(directory,'总览.png'),fullPage:true});
    await page.setViewportSize({width:1440,height:1000});
    await page.goto(origin+'/预览.html');
    await page.screenshot({path:path.join(directory,'预览首屏.png')});
    await fs.writeFile(path.join(directory,'render-report.json'),JSON.stringify({concepts:features.length,dimensions:'1440x900',errors,layout},null,2));
    if(errors.length)throw new Error(errors.join('\n'));
    console.log(`Rendered ${features.length} feature PNGs, contact sheet and offline gallery preview`);
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
