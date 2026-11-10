const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');
const { executable } = require('./new-topics-virtual.test.cjs');
const root = path.resolve(__dirname, '..');

async function main() {
  const browser = await chromium.launch({ executablePath: await executable(), headless: true });
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Archive update isolation</title>' }));
    await page.goto('https://archive.test/');
    await page.addScriptTag({ path: path.join(root, 'src/topic-archive-store.js') });
    const report = await page.evaluate(async () => {
      const checks = [], own = 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/', owner = 'https://www.cc98.org:42';
      const forum = { id: 'abcdefghijklmnopabcdefghijklmnop', url: 'https://www.cc98.org/topic/6500000/1', tab: { id: 3 }, frameId: 0, documentId: 'source-a' };
      const ui = { id: forum.id, url: own + 'popup/archive.html', tab: { id: 4 }, frameId: 0 };
      const event = () => { const set = new Set(); return { addListener: x => set.add(x), removeListener: x => set.delete(x), emit: x => [...set].forEach(f => f(x)) }; };
      const removed = event(), committed = event(), tabs = [], network = [];
      const chrome = { runtime: { id: forum.id, getURL: name => own + name }, permissions: { contains: async () => true },
        tabs: { onRemoved: removed, create: async value => { tabs.push(value); return { id: 8 }; } }, webNavigation: { onCommitted: committed } };
      const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
      let behavior, now = 100000;
      const fetch = async (url, opts) => { network.push(url); if (behavior) return behavior(url, opts); return new Response(png, { headers: { 'content-type': 'image/png' } }); };
      const databaseName = 'archive-update-test', options = { chrome, fetch, indexedDB, databaseName, now: () => ++now };
      let store = CC98RebornTopicArchiveStore.createStore(options);
      const send = (type, values = {}, sender = forum) => store.handle({ type: 'CC98_ARCHIVE_' + type, ...values }, sender);
      const ok = (value, label) => { if (!value) throw new Error(label); };
      const meta = { topicId: '6500000', title: 'Original archive', url: forum.url, owner, includeFiles: true };
      const record = (floor, content = 'original-' + floor) => ({ topicId: meta.topicId, floor, user: 'Author', uid: '42', contentHtml: '<p>' + content + '</p>', signatureHtml: '<p>signature</p>', extraHtml: '' });
      const put = (id, page, rows, maxPage = page) => send('PAGE', { id, page, result: { records: rows, maxPage, title: 'Updated title' } });
      const asset = (id, url) => send('RESOURCE', { id, url, kind: 'image' });
      const raw = async id => {
        const db = await new Promise((resolve, reject) => { const r = indexedDB.open(databaseName); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
        const read = (name, query) => new Promise((resolve,reject) => { const tx=db.transaction(name,'readonly'), r=query(tx.objectStore(name));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error); });
        try {
          const snapshot = await read('snapshots', s=>s.get(id)), pages = await read('pages', s=>s.index('snapshotId').getAll(id)), assets=await read('assets',s=>s.index('snapshotId').getAll(id));
          return { snapshot, pages, assets: await Promise.all(assets.map(async a=>({ ...a, blob:[...new Uint8Array(await a.blob.arrayBuffer())] }))) };
        } finally { db.close(); }
      };
      const same = (a,b,label) => ok(JSON.stringify(a)===JSON.stringify(b),label);
      const create = async (patch = {}) => { const r=await send('BEGIN',{meta:{...meta,...patch}});ok(r.ok,'new archive begins');return r.id; };
      const start = async (id, patch = {}, sender = forum) => send('BEGIN',{meta:{...meta,baseId:id,...patch}},sender);
      const base = await create();
      const old = 'https://file.cc98.org/saved.png', repaired = 'https://file.cc98.org/repaired.png', unlocated = 'https://file.cc98.org/unlocated.png';
      await put(base,1,[record(1),record(2)] ,3);
      await put(base,3,[{...record(21),contentHtml:'<img data-cc98-archive-resource="'+unlocated+'">'}],3);
      await asset(base,old);
      await send('FINISH',{id:base,status:'complete',expectedPages:3,failures:[{page:1,url:repaired,error:'image failed'},{page:1,error:'quote incomplete'},{page:2,error:'page failed'},{url:unlocated,error:'image failed'}]});
      const before=await raw(base);
      ok(before.snapshot.status==='partial','initial partial fixture');
      const info=await send('UPDATE_INFO',{id:base,owner});ok(info.ok,'matching account can inspect update plan');
      same(info.update.scanPages,[1,2,3],'missing/failure/tail pages scheduled');
      ok(!(await send('UPDATE_INFO',{id:base,owner:'different'})).ok,'different account rejected');
      ok(!(await start(base,{owner:'different'})).ok,'different account cannot update');
      ok(!(await start(base,{url:'https://www.cc98.org/topic/6500001',topicId:'6500001'},{...forum,url:'https://www.cc98.org/topic/6500001'})).ok,'different topic rejected');
      ok(!(await start(base,{url:'https://other.webvpn.zju.edu.cn/topic/6500000'},{...forum,url:'https://other.webvpn.zju.edu.cn/topic/6500000'})).ok,'different origin rejected');
      ok(!(await send('UPDATE_OPEN',{id:base})).ok,'forum cannot invoke UI update launch');
      ok((await send('UPDATE_OPEN',{id:base},ui)).ok && tabs.at(-1).url===forum.url+'#cc98-reborn-update-archive='+base,'UI update opens original topic with bounded ID');
      checks.push('Account/topic/origin/UI source boundaries and safe original-topic launch');

      const begun=await start(base), work=begun.id;ok(begun.ok&&work!==base,'separate work copy');
      ok(!(await start(base)).ok,'concurrent update rejected');
      same(await raw(base),before,'begin leaves base exactly unchanged');
      const listing=await send('LIST',{},ui);ok(!listing.items.some(s=>s.id===work),'work copy hidden from library');
      const netBefore=network.length;await asset(work,old);ok(network.length===netBefore,'existing blob reused with no network');
      ok(!(await put(work,1,[record(99)],4)).ok,'cross-page update floor rejected');
      ok(!(await put(work,1,[record(1),record(1)],4)).ok,'duplicate update floor rejected');
      await put(work,1,[record(1,'edited')],4); // Missing floor 2 remains in the archive.
      await put(work,2,[record(11,'new missing-page recovery')],4);
      await put(work,3,[record(21),record(22,'new tail reply')],4);
      await put(work,4,[record(31,'new page')],4);
      await asset(work,repaired);await asset(work,unlocated);
      same(await raw(base),before,'page/media writes remain isolated until final commit');
      const finish=await send('FINISH',{id:work,status:'complete',expectedPages:4,failures:[]});
      ok(finish.ok&&finish.updated&&finish.id===base&&finish.updateStatus==='partial','atomic promotion to original ID with historical retained-page failure');
      const after=await raw(base);
      same(after.pages.map(p=>p.page),[1,2,3,4],'new and missing pages merged');
      same(after.pages[0].records.map(r=>r.floor),[1,2],'deleted floor retained');
      ok(after.pages[0].records[0].contentHtml.includes('edited'),'existing matching floor updated');
      ok(after.snapshot.recordCount===6&&after.snapshot.pageCount===4&&after.snapshot.assetCount===3,'merged counters exact');
      ok(after.snapshot.startedAt===before.snapshot.startedAt&&after.snapshot.completedAt===before.snapshot.completedAt&&after.snapshot.updatedAt>before.snapshot.completedAt&&after.snapshot.revision===1,'capture interval preserved with explicit update time/revision');
      same(after.snapshot.failures,[{page:1,error:'quote incomplete'}],'repaired resources/missing pages cleared; retained older content warning kept');
      same(after.assets.find(a=>a.url===old).blob,before.assets[0].blob,'old resource unchanged');
      const workRaw=await raw(work);ok(workRaw.pages.length===0&&workRaw.assets.length===0&&workRaw.snapshot.updateReceipt,'temporary data cleaned after commit');
      ok((await send('FINISH',{id:work,status:'error'})).updated,'terminal acknowledgement idempotent');
      ok((await send('ABORT',{id:work})).updated,'late abort cannot undo completed update');
      checks.push('Isolated copy, binary reuse, floor-preserving append/edit, accurate counters, failure repair and atomic promotion');

      const refresh=await start(base,{refreshExisting:true});same(refresh.update.scanPages,[1,2,3,4],'optional full recheck plan');
      await put(refresh.id,1,[record(1,'edited again'),record(2)],4);
      const refreshed=await send('FINISH',{id:refresh.id,status:'complete',expectedPages:4,failures:[]});
      ok(refreshed.updateStatus==='complete'&&refreshed.snapshot.failures.length===0,'successful complete page recheck clears old non-resource failure');
      const clean=await send('UPDATE_INFO',{id:base,owner});same(clean.update.scanPages,[4],'clean archive defaults to last page only');
      checks.push('Default incremental tail plan and optional full-page recheck');

      const protectedBase=await create();
      const completeRecord={...record(1),contentHtml:'<blockquote><p>Complete saved quote</p><img data-cc98-archive-resource="'+old+'"></blockquote>',signatureHtml:'<p>Original complete signature</p>'};
      await put(protectedBase,1,[completeRecord],1);await asset(protectedBase,old);
      await send('FINISH',{id:protectedBase,status:'complete',expectedPages:1,failures:[]});
      const protectedOriginal=(await raw(protectedBase)).pages[0].records[0];
      const incompleteQuote=await start(protectedBase);
      await put(incompleteQuote.id,1,[record(1,'quote placeholder only'),record(2,'new reply survives incomplete quote')],1);
      const incompleteResult=await send('FINISH',{id:incompleteQuote.id,status:'partial',expectedPages:1,failures:[{page:1,error:'1 处引用未能展开'}]});
      const afterQuote=await raw(protectedBase);
      ok(incompleteResult.updated&&incompleteResult.updateStatus==='partial'&&afterQuote.snapshot.recordCount===2,'incomplete quote update appends new floor and stays partial');
      same(afterQuote.pages[0].records[0],protectedOriginal,'incomplete quote cannot replace saved complete old floor');
      ok(afterQuote.pages[0].records[1].contentHtml.includes('new reply survives'),'new floor preserved on incomplete existing page');
      const lateMedia=await start(protectedBase), lateUrl='https://file.cc98.org/new-late-failure.png';
      await put(lateMedia.id,1,[{...record(1,'new body missing old quote'),contentHtml:'<img data-cc98-archive-resource="'+lateUrl+'">'},record(2,'changed old reply'),record(3,'new reply with unavailable media')],2);
      await put(lateMedia.id,2,[{...record(11),contentHtml:'<img data-cc98-archive-resource="'+lateUrl+'">'}],2);
      behavior=async()=>new Response('missing',{status:404});const lateFailure=await asset(lateMedia.id,lateUrl);ok(!lateFailure.ok,'media fails after PAGE already staged');behavior=null;
      const lateResult=await send('FINISH',{id:lateMedia.id,status:'partial',expectedPages:2,failures:[{page:2,url:lateUrl,error:lateFailure.error}]});
      const afterLate=await raw(protectedBase);
      ok(lateResult.updated&&lateResult.updateStatus==='partial'&&afterLate.snapshot.recordCount===4,'late media failure promotes append-only partial pages');
      same(afterLate.pages[0].records.slice(0,2),afterQuote.pages[0].records,'shared URL late failure retains old floors even when failure names another page');
      same(afterLate.pages[0].records.map(r=>r.floor),[1,2,3],'new floor appended after late media failure');
      ok(afterLate.pages[1].records[0].floor===11,'entirely new partial page is retained');
      ok(afterLate.snapshot.failures.some(f=>f.error==='1 处引用未能展开')&&afterLate.snapshot.failures.some(f=>f.url===lateUrl),'fallback-to-old page retains historical warning and current media failure');
      checks.push('Incomplete quotes and late shared-resource failures retain complete old floors while appending new floors/pages with accurate partial status');

      for(const kind of ['tab-close','document-change']) {
        const raceBefore=await raw(base), originalAdd=IDBObjectStore.prototype.add;let interrupted=false,raceId;
        IDBObjectStore.prototype.add=function(value,...args){
          if(this.name==='pages'&&value.snapshotId!==base&&!interrupted){
            interrupted=true;raceId=value.snapshotId;
            if(kind==='tab-close')removed.emit(forum.tab.id);else committed.emit({tabId:forum.tab.id,frameId:0,documentId:'new-document-during-begin'});
          }
          return originalAdd.call(this,value,...args);
        };
        let begunDuringClose;try{begunDuringClose=await start(base);}finally{IDBObjectStore.prototype.add=originalAdd;}
        ok(interrupted&&!begunDuringClose.ok,'pending BEGIN cancels on '+kind);
        same(await raw(base),raceBefore,'pending BEGIN cancellation preserves original on '+kind);
        const leftover=await raw(raceId);ok(!leftover.snapshot&&!leftover.pages.length&&!leftover.assets.length,'pending BEGIN cleans staging on '+kind);
        const replacement={...forum,tab:{id:9},documentId:'replacement-after-'+kind};
        const retry=await start(base,{},replacement);ok(retry.ok,'pending BEGIN cancellation releases update lock on '+kind);
        await send('ABORT',{id:retry.id},replacement);
      }
      checks.push('Tab close/document navigation during BEGIN clone aborts staging, preserves base and releases the update lock for a new document');

      const stable=await raw(base), cancelled=await start(base);
      await put(cancelled.id,5,[record(41,'cancelled new reply')],5);
      behavior=(url,opts)=>new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new DOMException('cancelled','AbortError')),{once:true}));
      const pending=asset(cancelled.id,'https://file.cc98.org/pending.png');await new Promise(r=>setTimeout(r,10));
      const aborted=await send('ABORT',{id:cancelled.id});ok(aborted.ok&&!aborted.updated&&aborted.updateStatus==='cancelled','cancellation reports own outcome');ok(!(await pending).ok,'pending network aborted');behavior=null;
      same(await raw(base),stable,'cancel preserves original bytes and counters');
      ok((await raw(cancelled.id)).pages.length===0,'cancel discards temporary pages');
      ok((await send('FINISH',{id:cancelled.id,status:'complete'})).updateStatus==='cancelled','finally cannot promote cancelled copy');
      const errored=await start(base);await put(errored.id,5,[record(41)],5);await send('FINISH',{id:errored.id,status:'error',error:'network stopped'});same(await raw(base),stable,'error preserves original');
      checks.push('Cancellation/error stop in-flight work, remove temporary entries, and never change original');

      const quota=await start(base);await put(quota.id,5,[record(41,'quota candidate')],5);
      const originalPut=IDBObjectStore.prototype.put;let armed=true;
      IDBObjectStore.prototype.put=function(value,...args){if(armed&&this.name==='pages'&&value.snapshotId===base){armed=false;throw new DOMException('Injected storage quota','QuotaExceededError');}return originalPut.call(this,value,...args);};
      let quotaResult;try{quotaResult=await send('FINISH',{id:quota.id,status:'complete',expectedPages:5,failures:[]});}finally{IDBObjectStore.prototype.put=originalPut;}
      ok(!quotaResult.ok&&quotaResult.fatal===true&&quotaResult.error.includes('原备份未修改')&&!quotaResult.error.includes('删除'),'promotion quota safely reports fatal without deletion guidance');same(await raw(base),stable,'promotion transaction rollback preserves every original entry');
      ok((await raw(quota.id)).assets.length===0,'failed promotion cleans work media');
      checks.push('Injected promotion quota failure rolls back all base writes and cleans staging');

      const navigation=await start(base);await put(navigation.id,5,[record(41)],5);
      committed.emit({tabId:3,frameId:0,documentId:'other-document'});
      for(let i=0;i<30;i++){if((await raw(navigation.id)).snapshot.updateReceipt)break;await new Promise(r=>setTimeout(r,5));}
      same(await raw(base),stable,'document navigation leaves base unchanged');
      ok(!(await put(navigation.id,5,[record(41)],5)).ok,'navigated document loses write capability');
      const restart=await start(base);await put(restart.id,5,[record(41)],5);await store.close();store=CC98RebornTopicArchiveStore.createStore(options);
      await send('LIST',{},ui);same(await raw(base),stable,'service-worker restart keeps base unchanged');ok((await raw(restart.id)).pages.length===0,'restart clears orphan staging');
      checks.push('Document navigation and service-worker restart cannot promote abandoned work');

      const deleting=await start(base);await put(deleting.id,5,[record(41)],5);
      ok((await send('DELETE',{id:base},ui)).ok,'explicit deletion accepted');
      ok(!(await send('FINISH',{id:deleting.id,status:'complete',expectedPages:5})).ok,'deleted base never recreated');
      ok(!(await send('GET',{id:base},ui)).ok&&(await raw(deleting.id)).snapshot===undefined,'base and associated staging gone');
      checks.push('Delete cancels associated update and prevents resurrection');

      const noFiles=await create({includeFiles:false});await put(noFiles,1,[record(1)],1);await send('FINISH',{id:noFiles,status:'complete',expectedPages:1});
      const noFilesUpdate=await start(noFiles,{includeFiles:true});ok(!noFilesUpdate.snapshot.includeFiles,'update preserves original media setting');
      ok(!(await send('RESOURCE',{id:noFilesUpdate.id,url:'https://file.cc98.org/file.pdf',kind:'file'})).ok,'file capture stays disabled');await send('ABORT',{id:noFilesUpdate.id});
      const baseSmall=await raw(noFiles);await store.close();
      store=CC98RebornTopicArchiveStore.createStore({...options,limits:{snapshot:baseSmall.snapshot.bytes+400,page:800000}});
      const limited=await start(noFiles);ok(limited.ok,'bounded update begins');
      const limitedPage=await put(limited.id,2,[record(11,'x'.repeat(1000))],2);
      ok(!limitedPage.ok&&limitedPage.fatal===true&&limitedPage.error.includes('原备份未修改')&&!limitedPage.error.includes('删除'),'total size limit stops capture with safe fatal error');
      const limitFinish=await send('FINISH',{id:limited.id,status:'partial',expectedPages:2,failures:[{page:2,error:'limit'}]});
      ok(limitFinish.ok&&!limitFinish.updated&&limitFinish.updateStatus==='error','size limit cannot promote partial writes');same(await raw(noFiles),baseSmall,'size-limited original unchanged');
      checks.push('Original optional-media contract and total-size failures preserve original backup');
      await store.close();
      return {passed:true,realIndexedDB:true,isolatedFixtures:true,checks,productionNetworkRequests:0};
    });
    assert(report.passed);const output=path.join(root,'outputs/archive-update-20261028/storage');await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'validation.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
  } finally {await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
