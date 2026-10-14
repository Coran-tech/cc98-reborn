const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const { chromium } = require("playwright");
const root = path.resolve(__dirname, "..");
const origin = "https://www.cc98.org";
const ascii = process.argv.includes("--ascii");
const output = path.join(root, ascii ? "outputs/ascii-editor-preview" : "outputs/vote-editor-preview");
const settingsKey = "cc98ComfortSettings";

async function main() {
  let settings = { enabled:true, themeStyle:ascii?"ascii":"modern", themeMode:"light", themePalette:"teal", emojiScale:100, prewarmPostImages:false, previsitFirstPageForTopicImages:false };
  const browser = await chromium.launch({ channel:"msedge", headless:true });
  const page = await browser.newPage({ viewport:{width:1440,height:1000} });
  page.setDefaultTimeout(10000);
  const errors = [], posts = [];
  let checks = 0;
  try {
    page.on("pageerror", error => errors.push(error.message));
    await page.exposeBinding("__voteStorage", (_source, { keys, values }) => {
      if (values) { if (values[settingsKey]) settings = values[settingsKey]; return null; }
      const records = { [settingsKey]:settings, "cc98RebornOpenIdBinding:v1":{bound:true,userId:12345,userName:"测试用户"} };
      return keys === null ? records : Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(key => [key,records[key]]));
    });
    await page.addInitScript(() => {
      localStorage.setItem("userInfo",JSON.stringify({id:12345,name:"测试用户"}));
      window.__storageListeners = [];
      window.chrome = { runtime:{ getManifest:()=>({version:"0.3.6"}),getURL:file=>new URL(`/${file}`,location.origin).href,onMessage:{addListener(){}},sendMessage(_message,callback){callback?.({ok:false});return Promise.resolve({ok:false});} },storage:{local:{},onChanged:{addListener(listener){__storageListeners.push(listener);}}} };
      chrome.storage.local.get=(keys,callback)=>{const promise=__voteStorage({keys});if(callback){promise.then(callback);return;}return promise;};
      chrome.storage.local.set=(values,callback)=>{const promise=__voteStorage({values});if(callback){promise.then(callback);return;}return promise;};
      chrome.storage.local.remove=(_keys,callback)=>{callback?.();return Promise.resolve();};
    });
    await page.route("**/*",async route=>{
      const url=new URL(route.request().url());
      if(url.origin==="https://api.cc98.org"&&url.pathname==="/board/758/topic") { posts.push(route.request().postDataJSON()); return route.fulfill({contentType:"text/plain",body:"6800001"}); }
      if(url.origin!==origin) return route.abort();
      if(url.pathname.startsWith("/topic/")) return route.fulfill({contentType:"text/html",body:"<title>已发布投票</title>投票主题发布成功"});
      const file=/^\/(?:editor|board)\//.test(url.pathname)?path.join(root,"tests/vote-editor.html"):path.resolve(root,`.${decodeURIComponent(url.pathname)}`);
      if(!file.startsWith(`${root}${path.sep}`))return route.abort();
      try {
        if(ascii && file===path.join(root,"tests/vote-editor.html")) {
          const html=(await fs.readFile(file,"utf8")).replace('</head>','<link rel="stylesheet" href="/src/interface-styles.css"></head>').replace('<script src="/src/content.js">','<script src="/src/interface-style.js"></script><script src="/src/content.js">');
          return await route.fulfill({contentType:"text/html",body:html});
        }
        return await route.fulfill({path:file});
      } catch { return route.fulfill({status:404,body:"Not found"}); }
    });
    async function editor() { await page.locator("#cc98-comfort-app .cc98-rebuild-vote-settings").waitFor(); await page.locator(".cc98-rebuild-dual-ubb-source").waitFor(); }
    async function theme(tone) {
      const old=settings;settings={...settings,themeMode:tone};
      await page.evaluate(({old,next,key})=>__storageListeners.forEach(listener=>listener({[key]:{oldValue:old,newValue:next}},"local")),{old,next:settings,key:settingsKey});
      await page.waitForFunction(tone=>document.documentElement.dataset.cc98ComfortTone===tone,tone);
    }
    await fs.mkdir(output,{recursive:true});
    await page.goto(`${origin}/board/758`);
    const voteAction=page.locator(".cc98-rebuild-board-post-vote-action");
    await voteAction.waitFor();
    assert.equal(await voteAction.evaluate(node=>node.tagName),"BUTTON");
    assert.equal(await voteAction.innerText(),"发投票");
    await voteAction.click();await page.waitForURL(`${origin}/editor/postVoteTopic/758`);await editor();
    assert.equal(await page.evaluate(()=>sessionStorage.getItem("vote-native-navigation")),"postVoteTopic");
    assert.equal(await page.locator("#cc98-comfort-app").getAttribute("data-page-kind"),"editor");
    assert.equal(await page.locator(".cc98-rebuild-hero h1, .cc98-rebuild-head h1").first().innerText(),"发表投票主题");
    assert.equal(await page.locator(".cc98-rebuild-editor-hero .cc98-rebuild-kicker").innerText(),"POLL"); checks++;
    await page.goto(`${origin}/board/758?legacy=1`);await voteAction.waitFor();
    assert.equal(await voteAction.evaluate(node=>node.tagName),"A");assert.equal(await voteAction.getAttribute("href"),`${origin}/editor/postVoteTopic/758`);
    await voteAction.click();await editor();checks++;
    await page.goto(`${origin}/board/758?noVote=1`);await page.locator(".cc98-rebuild-board-toolbar").waitFor();assert.equal(await voteAction.count(),0);
    await page.goto(`${origin}/board/758?locked=1`);await voteAction.waitFor();assert(await voteAction.isDisabled());checks++;
    await page.goto(`${origin}/editor/postVoteTopic/758?delay=700`);
    assert.equal(await page.evaluate(()=>getPageKind()),"editor","vote route must be recognized before native fields mount");await editor();checks++;

    const expires=page.locator('input[name="expiredDays"]'),max=page.locator('input[name="maxVoteCount"]'),items=page.locator('input[name="voteItem"]'),add=page.locator('[data-cc98-vote-action="add"]');
    await page.locator('#post-topic-button').click();
    await page.locator('.ant-message-notice-content').waitFor();
    assert.match(await page.locator('.ant-message-notice-content').innerText(),/请输入合法的过期天数/);
    await page.waitForFunction(()=>document.getElementById('native-vote-editor').dataset.cc98SubmitTransactionActive!=='true');
    assert.equal(posts.length,0);await editor();await page.evaluate(()=>{document.querySelector('.ant-message').textContent='';});checks++;
    await expires.fill("30");await max.fill("2");await page.locator('label[for="needVote"]').click();
    await items.nth(0).fill("选项甲");await items.nth(1).fill("选项乙");
    await add.click();await items.nth(2).waitFor();await items.nth(2).fill("选项丙");
    assert(await page.locator('[data-cc98-vote-action="remove"]').evaluateAll(buttons=>buttons.every(button=>{const a=button.getBoundingClientRect(),b=button.closest('.createTopicTitle').getBoundingClientRect();return a.left>=b.left&&a.right<=b.right;})),"delete buttons must fit inside their option rows");
    await page.locator('[data-cc98-vote-action="remove"]').nth(1).click();
    assert.equal(await items.count(),2);assert.equal(await items.nth(1).inputValue(),"选项丙");
    assert.equal(await page.locator('[data-cc98-vote-action="remove"]').count(),0);
    assert.equal(await max.getAttribute("max"),"2");
    assert.equal(await page.evaluate(()=>document.getElementById("native-vote-editor").dataset.cc98SubmitTransactionActive),undefined);
    assert.equal(posts.length,0,"add/remove must not submit a topic");checks++;
    for(let i=2;i<20;i++)await add.click();assert.equal(await items.count(),20);await add.click();assert.equal(await items.count(),20);
    assert.equal(await items.first().getAttribute("maxlength"),"50");
    for(let i=20;i>2;i--)await page.locator('[data-cc98-vote-action="remove"]').last().click();assert.equal(await items.count(),2);checks++;

    await page.locator("#native-title").fill("想听听大家的选择");
    await page.locator(".cc98-rebuild-dual-ubb-source").fill("[b]投票说明[/b]");
    await page.evaluate(()=>{window.__voteNativeNodes=[document.getElementById("native-vote-editor"),...document.querySelectorAll('input[name="expiredDays"],input[name="maxVoteCount"],#needVote,input[name="voteItem"]')];});
    const before=await page.evaluate(()=>getNativeEditorDraftKey(document.getElementById("native-vote-editor")));
    assert.match(before,/:vote:758$/);
    await page.locator(".cc98-rebuild-editor-draft-button").filter({hasText:"保存草稿"}).click();
    const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),before);
    assert.equal(saved.title,"想听听大家的选择");assert.equal(saved.content,"[b]投票说明[/b]");checks++;
    await page.locator(".cc98-rebuild-toast").waitFor({state:"detached"});
    if(ascii) {
      await page.locator('[data-cc98-ascii-toolbar-label="[URL]"]').waitFor();
      const labels=await page.locator('[data-cc98-ascii-toolbar-label]').evaluateAll(nodes=>Object.fromEntries(nodes.map(node=>[node.dataset.cc98AsciiToolbarLabel,{native:node.dataset.cc98ToolbarLabel,content:getComputedStyle(node,'::before').content}])));
      for(const [label,native] of Object.entries({'[URL]':'🔗','[VID]':'▶','[AUD]':'♪','[UNDO]':'↶','[REDO]':'↷','[EMO]':'☺','T':undefined})) {
        assert.equal(labels[label]?.content,JSON.stringify(label),`${label} must display ASCII`);
        assert.equal(labels[label]?.native,native,`${label} must preserve the command label`);
      }
      assert(await page.locator('.cc98-rebuild-editor-font-select').isVisible());
      await page.locator('.cc98-rebuild-font-size-trigger').click();
      await page.locator('.cc98-rebuild-font-size-popover:not([hidden])').waitFor();
      assert.equal(await page.locator('.cc98-rebuild-font-size-popover:not([hidden])').evaluate(node=>getComputedStyle(node).borderRadius),'0px');
      await page.keyboard.press('Escape');
      await page.locator('.cc98-rebuild-color-chooser').click();
      await page.locator('.cc98-rebuild-color-popover:not([hidden])').waitFor();
      assert(await page.locator('.cc98-rebuild-color-popover:not([hidden])').evaluate(node=>[node,...node.querySelectorAll('*')].every(child=>getComputedStyle(child).borderRadius==='0px')));
      await page.keyboard.press('Escape');checks++;
      await page.locator('#native-title').fill('修改后的标题');
      await page.locator('.cc98-rebuild-dual-ubb-source').fill('修改后的正文');
      await page.locator('.cc98-rebuild-editor-draft-button').filter({hasText:'恢复草稿'}).click();
      await page.waitForFunction(()=>document.getElementById('native-title').value==='想听听大家的选择');
      assert.equal(await page.locator('.cc98-rebuild-dual-ubb-source').evaluate(node=>getProfileSignatureSourceText(node)),'[b]投票说明[/b]');
      await page.locator('.cc98-rebuild-editor-draft-button').filter({hasText:'清除草稿'}).click();
      assert.equal(await page.evaluate(key=>localStorage.getItem(key),before),null);
      assert.equal(await page.locator('.cc98-rebuild-dual-ubb-source').evaluate(node=>getProfileSignatureSourceText(node)),'[b]投票说明[/b]');checks++;
      await page.waitForFunction(()=>!document.querySelector('.cc98-rebuild-toast'));
    }
    for(const tone of ["light","dark"]){
      await theme(tone);
      for(const width of [1440,1024,390]){
        await page.setViewportSize({width,height:1000});await page.waitForTimeout(120);
        const layout=await page.locator("#native-vote-editor").evaluate(editor=>({overflow:document.documentElement.scrollWidth>innerWidth+1,fields:[...editor.querySelectorAll('.cc98-rebuild-vote-settings input,.cc98-rebuild-vote-option input')].map(field=>{const a=field.getBoundingClientRect(),b=field.closest('.createTopicTitle').getBoundingClientRect();return{type:field.type,width:a.width,height:a.height,inside:a.left>=b.left-1&&a.right<=b.right+1&&a.top>=b.top-1&&a.bottom<=b.bottom+1};})}));
        assert(!layout.overflow,`${tone}/${width}: document overflow`);assert(layout.fields.every(field=>field.inside),`${tone}/${width}: control left its row ${JSON.stringify(layout)}`);
        const checkbox=layout.fields.find(field=>field.type==="checkbox");assert(checkbox.width<=20&&checkbox.height<=20);
        assert.equal(await expires.inputValue(),"30");assert.equal(await max.inputValue(),"2");assert(await page.locator("#needVote").isChecked());
        assert(await page.locator('.cc98-rebuild-dual-ubb-source').isVisible());
        const typeFields=await page.locator('.createTopicType input').evaluateAll(inputs=>inputs.every(input=>{const field=input.getBoundingClientRect(),row=input.closest('.createTopicType').getBoundingClientRect();return field.top>=row.top-1&&field.bottom<=row.bottom+1;}));
        assert(typeFields,`${tone}/${width}: native topic-type options were clipped`);
        assert(await page.evaluate(()=>__voteNativeNodes.every(node=>node.isConnected)),"theme changes must preserve native form nodes");
        if(ascii) {
          const controls=await page.locator('#native-vote-editor').evaluate(editor=>[...editor.querySelectorAll('.cc98-rebuild-editor-draftbar,.cc98-rebuild-editor-draft-button,.createTopicTitle,.createTopicType,.createTopicContent,#post-topic-changeMode,.ubb-editor,.ubb-buttons,.ubb-button,.cc98-rebuild-font-family-control,.cc98-rebuild-font-size-apply,.sp-preview,.cc98-local-syntax-experimental-badge')].filter(node=>node.getBoundingClientRect().width).map(node=>{const style=getComputedStyle(node),bounds=node.getBoundingClientRect(),parent=node.closest('.ubb-buttons')?.getBoundingClientRect();return {cls:node.className,radii:[style.borderTopLeftRadius,style.borderTopRightRadius,style.borderBottomLeftRadius,style.borderBottomRightRadius],clipped:node.hasAttribute('data-cc98-ascii-toolbar-label')&&node.scrollWidth>node.clientWidth+1,outside:parent&&(bounds.left<parent.left-1||bounds.right>parent.right+1)};}));
          assert(controls.every(node=>node.radii.every(radius=>radius==='0px')),`${tone}/${width}: rounded editor surface ${JSON.stringify(controls.filter(node=>node.radii.some(radius=>radius!=='0px')))}`);
          assert(controls.every(node=>!node.clipped&&!node.outside),`${tone}/${width}: clipped toolbar ${JSON.stringify(controls.filter(node=>node.clipped||node.outside))}`);
          assert.equal(await page.locator('.cc98-rebuild-dual-editor-divider').evaluate(node=>getComputedStyle(node,'::after').borderRadius),'0px');
        }
        if(width!==1024){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(output,`vote-editor-${width}-${tone}.png`),animations:"disabled"});await page.locator('.cc98-rebuild-topbar').evaluate(node=>node.style.setProperty('visibility','hidden','important'));await page.locator('#native-vote-editor').screenshot({path:path.join(output,`vote-form-${width}-${tone}.png`),animations:"disabled"});await page.locator('.cc98-rebuild-topbar').evaluate(node=>node.style.removeProperty('visibility'));}
        checks++;
      }
    }
    await page.setViewportSize({width:1440,height:1000});
    if(ascii) {
      const old=settings;settings={...settings,themeStyle:'modern'};
      await page.evaluate(({old,next,key})=>__storageListeners.forEach(listener=>listener({[key]:{oldValue:old,newValue:next}},'local')),{old,next:settings,key:settingsKey});
      await page.waitForFunction(()=>!document.querySelector('[data-cc98-ascii-toolbar-label]'));
      assert.equal(await page.locator('.ubb-button[title="插入url"]').evaluate(node=>getComputedStyle(node,'::before').content),'"🔗"');
      assert.notEqual(await page.locator('#post-topic-changeMode').evaluate(node=>getComputedStyle(node).borderRadius),'0px');
      assert.equal(await page.locator('.cc98-rebuild-dual-ubb-source').evaluate(node=>getProfileSignatureSourceText(node)),'[b]投票说明[/b]');checks++;
    }
    await page.locator("#post-topic-changeMode").click();await page.locator(".react-mde textarea").waitFor();
    assert.equal(await expires.inputValue(),"30");assert(await page.locator("#needVote").isChecked());checks++;
    await page.locator(".react-mde textarea").fill("投票说明 Markdown");
    await page.locator("#post-topic-button").click();
    await page.waitForFunction(()=>__voteFixture.posts===1).catch(()=>{});
    assert.equal(posts.length,1);assert.equal(posts[0].isVote,true);assert.deepEqual(posts[0].voteInfo,{expiredDays:30,maxVoteCount:2,needVote:true,voteItems:["选项甲","选项丙"]});
    assert.equal(posts[0].title,"想听听大家的选择");assert.equal(posts[0].content,"投票说明 Markdown");checks++;
    assert.deepEqual(errors,[]);
    console.log(`vote editor: ${checks} groups passed (native button/legacy link, route, limits, dynamic options, draft isolation, theme/layout and local vote submission)`);
  }catch(error){
    await fs.mkdir(output,{recursive:true});
    await page.screenshot({path:path.join(output,"failure.png"),fullPage:true}).catch(()=>{});
    await fs.writeFile(path.join(output,"failure.html"),await page.content());
    const overflow=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth,items:[...document.querySelectorAll('body *')].map(node=>({tag:node.tagName,cls:node.className,id:node.id,right:node.getBoundingClientRect().right,width:node.getBoundingClientRect().width})).filter(node=>node.right>innerWidth+1&&node.width).sort((a,b)=>b.right-a.right).slice(0,20)}));
    await fs.writeFile(path.join(output,"failure-overflow.json"),JSON.stringify(overflow,null,2));
    throw error;
  }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
