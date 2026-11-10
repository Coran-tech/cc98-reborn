const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/topic-live-api.js'), 'utf8');
const post = (id, extra = {}) => ({id, topicId:6500000, userId:42, userName:'作者', content:'正文', contentType:0, time:'2026-10-28T16:00:00+08:00', likeCount:3, dislikeCount:1, awards:[], ...extra});
function fixture(responses, host = 'https://www.cc98.org') {
  const calls=[], pending=[], values=new Map([['accessToken','str-Bearer fake-unit-token']]);
  let now=100000, uid=42, route='/topic/6500000/1';
  const clock={now:()=>now};
  const context=vm.createContext({location:new URL(host),localStorage:{getItem:key=>values.get(key)||null},
    getCc98AccountId:()=>uid,getStoredCc98UserInfo:()=>({id:uid}),getRoutePageKey:()=>route,
    Map,Set,Error,SyntaxError,DOMException,AbortController,Date:class extends Date{static now(){return clock.now()}},
    setTimeout(fn,ms){const timer={fn,ms,live:true};pending.push(timer);if(ms<12000)queueMicrotask(()=>{if(timer.live){now+=ms;timer.live=false;fn()}});return timer},
    clearTimeout(timer){timer.live=false},
    async fetch(url,options){calls.push({url,options,at:now});const response=responses.shift();if(typeof response==='function')return response(url,options);return new Response(JSON.stringify(response?.body??response),{status:response?.status||200,headers:response?.headers})}
  });
  vm.runInContext(source,context);
  return {calls,pending,values,create:profiles=>context.CC98RebornTopicLiveApi.create({topicId:'6500000',profiles}),
    changeAccount(){uid++},changeRoute(){route+='/2'},timeout(){pending.findLast(t=>t.live&&t.ms===12000)?.fn()}};
}
async function main(){
  const f=fixture([{id:6500000,replyCount:9},[],[post(11),post(12,{userId:43}),post(13,{isAnonymous:true,userName:'ab1234',userId:999}),post(14,{isDeleted:true,userId:888,content:'已删除秘密'})],
    [{id:43,name:'乙',signatureCode:'[b]签名[/b]',portraitUrl:'/avatar.png'},{id:42,name:'甲'}],[post(15)],[]]);
  const profiles=new Map(),reader=f.create(profiles);
  assert.equal(await reader.baseline(),10);assert.equal(f.calls.length,1,'baseline only reads metadata');
  assert.equal((await reader.read(10)).length,0);assert.equal(f.calls.length,2,'idle poll is one empty range read');
  const batch=await reader.read(10);
  assert.equal(batch[0].user,'甲');assert.equal(batch[1].user,'乙');assert.equal(batch[1].signatureCode,'[b]签名[/b]');
  assert.equal(batch[2].anonymousCode,'AB1234');assert.equal(batch[2].uid,'');assert.equal(batch[2].signatureCode,'');
  assert.equal(batch[3].content,'该贴已被my cc98, my home');assert.equal(batch[3].uid,'');
  assert.equal(f.calls[3].url,'https://api.cc98.org/user?id=42&id=43','never look up anonymous/deleted IDs');
  assert.equal(batch[0].metrics.reputation,0);assert.equal(batch[0].metrics.likes,3);
  await reader.read(14);assert.equal(f.calls.length,5,'cached authors cause no new profile fetch');
  assert.equal((await reader.read(15)).length,0);
  for(let i=1;i<f.calls.length;i++)assert(f.calls[i].at-f.calls[i-1].at>=1000,'serial request pacing');
  for(const {options} of f.calls){assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bearer fake-unit-token');assert(!options.body)}
  reader.dispose();await assert.rejects(reader.read(15),{name:'AbortError'});
  for(const mutation of ['changeAccount','changeRoute']){const x=fixture([]),r=x.create();x[mutation]();await assert.rejects(r.baseline(),{status:401});assert.equal(x.calls.length,0)}
  {const x=fixture([]),r=x.create();x.values.set('accessToken','str-Bearer changed');await assert.rejects(r.baseline(),{status:401});assert.equal(x.calls.length,0)}
  {const x=fixture([]),r=x.create();x.values.set('accessToken_expirationTime','1');await assert.rejects(r.baseline(),{status:401});assert.equal(x.calls.length,0)}
  {const x=fixture([]);x.values.delete('accessToken');await assert.rejects(x.create().baseline(),{status:401});assert.equal(x.calls.length,0)}
  for(const body of [{id:1,replyCount:9},{id:6500000,replyCount:-1},{id:6500000,replyCount:'9'}])await assert.rejects(fixture([body]).create().baseline(),/有效的帖子信息/);
  for(const body of [{},[post(11,{floor:1})],[post(11,{topicId:1})],[post(11,{contentType:9})],[post(11),post(11)]])await assert.rejects(fixture([body]).create().read(10));
  {const x=fixture([[post(11,{userId:41,awards:undefined,likeCount:undefined}),post(12,{userId:42})],[{id:42,name:'正确用户'}]]);const rows=await x.create().read(10);assert.equal(rows[0].user,'作者');assert.equal(rows[1].user,'正确用户');assert.equal(rows[0].metrics.reputation,null);assert.equal(rows[0].metrics.likes,null)}
  {const x=fixture([{status:429,headers:{'Retry-After':'600'},body:{}}]);await assert.rejects(x.create().read(10),e=>e.status===429&&e.retryAfterMs===600000)}
  {const x=fixture([{status:403,body:{}}]);await assert.rejects(x.create().read(10),{status:403});assert.equal(x.calls.length,1)}
  {const x=fixture([[post(11)],{status:500,body:{}},[post(11)],[{id:42,name:'重试作者'}]]),cache=new Map(),r=x.create(cache);await assert.rejects(r.read(10),{status:500});assert.equal(cache.size,0);assert.equal((await r.read(10))[0].user,'重试作者');assert.equal(x.calls[0].url,x.calls[2].url,'failed profile batch can be retried at the same cursor')}
  for(const action of ['dispose','timeout']){
    const x=fixture([(_,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new DOMException('cancel','AbortError'))))]);
    const r=x.create(),promise=r.read(10);await new Promise(resolve=>setImmediate(resolve));if(action==='dispose')r.dispose();else x.timeout();
    await assert.rejects(promise,action==='dispose'?{name:'AbortError'}:/超时/);
  }
  {const x=fixture([()=>new Promise(resolve=>{x.changeAccount();resolve(new Response(JSON.stringify({id:6500000,replyCount:9})))})]);await assert.rejects(x.create().baseline(),{status:401})}
  {const x=fixture([{id:6500000,replyCount:9}],'https://www-cc98-org-s.webvpn.zju.edu.cn');await x.create().baseline();assert(x.calls[0].url.startsWith('https://webvpn.zju.edu.cn/https/'));assert.equal(x.calls[0].options.credentials,'include')}
  assert.throws(()=>fixture([],'https://evil.example').create(),/CC98/);
  console.log('Incremental API: baseline/ranges, pacing, profiles, privacy, malformed replies, auth isolation, 429, abort/timeout and WebVPN passed');
}
main().catch(error=>{console.error(error);process.exitCode=1});
