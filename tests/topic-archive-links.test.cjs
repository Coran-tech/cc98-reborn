const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const root = path.resolve(__dirname,'..'), out = path.join(root,'outputs/archive-external-links-20261028');
const external = 'https://www.bilibili.com/toy/204bang/index.html';
async function main() {
  const before = process.argv.includes('--before');
  const source = await fs.readFile(path.join(before?path.join(out,'before'):root,'src/topic-archive.js'),'utf8');
  const exposed = source.replace('Object.freeze({ open, close })','Object.freeze({ open, close, prepareHtml })');
  assert.notEqual(exposed,source,'test exports private helper only in its isolated copy');
  const browser=await chromium.launch({executablePath:await executable(),headless:true});
  try {
    const page=await browser.newPage();
    await page.addScriptTag({content:`window.chrome={runtime:{getURL:p=>'chrome-extension://fixture/'+p}};window.getMediaUrl=i=>i.getAttribute('src');window.isImageUrl=u=>/\\.(png|gif|webp)(?:[?#]|$)/i.test(u);window.isLegacyQuoteStyle=()=>false;`});
    await page.addScriptTag({content:exposed});
    const results=await page.evaluate(({external,before})=>{
      const prepare=(html,files=true)=>{
        const resources=new Map(),failures=[];
        const saved=CC98RebornTopicArchive.prepareHtml(html,'https://www.cc98.org/topic/100/89',files,resources,failures);
        const template=document.createElement('template');template.innerHTML=saved;
        return {html:saved,resources:[...resources],failures,frames:template.content.querySelectorAll('iframe').length,
          links:[...template.content.querySelectorAll('a')].map(a=>({href:a.href,resource:a.getAttribute('data-cc98-archive-resource')}))};
      };
      const html=`<a href="${external}">外部网页</a><iframe src="${external}"></iframe><iframe src="https://other.example/frame.mp4"></iframe><a href="${external}"><img src="https://file.cc98.org/picture.png"></a><a href="https://other.example/manual.pdf"><img src="https://file.cc98.org/signature.png"></a><a href="https://other.example/page.html?file=manual.pdf">查询参数不是附件</a>`;
      const ordinary=prepare(html),optionalOff=prepare(html,false);
      const attachments=prepare('<a href="https://file.cc98.org/manual.pdf?download=1">PDF</a><a href="https://file.cc98.org/notes.md">MD</a><a href="https://file.cc98.org/download/file?id=1">附件</a><a href="https://file.cc98.org/raw" download>显式下载</a><a href="https://file.cc98.org/report.html" download>明确的HTML附件仍交由安全校验拒绝</a><img src="https://www.bilibili.com/real-image.png">');
      return {before,ordinary,optionalOff,attachments};
    },{external,before});
    if(before) {
      assert(results.ordinary.resources.some(([url])=>url===external),'old HTML classifier reproduces user resource failure');
      await fs.writeFile(path.join(out,'before-validation.json'),JSON.stringify(results,null,2));
      console.log('Reproduced ordinary HTML/embed/image destination incorrectly queued as attachment');return;
    }
    assert.deepEqual(results.ordinary.resources,[['https://file.cc98.org/picture.png','image'],['https://file.cc98.org/signature.png','image']]);
    assert.equal(results.ordinary.frames,0);assert.equal(results.ordinary.links.length,6);assert(results.ordinary.links.every(link=>link.href&&!link.resource));
    assert.deepEqual(results.ordinary.failures,[]);assert.deepEqual(results.optionalOff.resources,results.ordinary.resources);
    assert.deepEqual(results.attachments.resources.map(([url,kind])=>[new URL(url).pathname,kind]),[['/real-image.png','image'],['/manual.pdf','file'],['/notes.md','file'],['/download/file','file'],['/raw','file'],['/report.html','file']]);
    assert(results.attachments.resources.some(([url])=>url==='https://www.bilibili.com/real-image.png'),'real external media still enters permission validation');
    const report={passed:true,checks:['User HTML URL preserved without download','Embedded pages are external links, not files even with media-looking URL','Linked image destination is not downloaded; actual image is saved','Filename in query alone is not attachment evidence','PDF/Markdown/download routes and explicit download contract retained','Real external image still requires normal domain permission'],results};
    await fs.writeFile(path.join(out,'links-validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,checks:report.checks}));
  } finally {await browser.close()}
}
main().catch(error=>{console.error(error);process.exitCode=1});
