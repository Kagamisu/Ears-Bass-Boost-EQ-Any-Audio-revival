/* Real browser regression. Uses public Chrome DevTools extension test commands.
 * No fake media devices and no test hooks in the packaged extension. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),os=require('node:os');
const brand=process.argv[2]||'chromium';
const root=path.resolve(__dirname,'..');
const extension=path.join(root,'extension');
const evidence=path.resolve(process.env.EARS_EVIDENCE||path.join(root,'docs/test-evidence'));
const tempRoot=path.resolve(process.env.EARS_TEST_ROOT||path.join(os.tmpdir(),'ears-revival-tests'));
const profile=path.join(tempRoot,'profile-'+brand+'-'+Date.now());
const report={brand,date:new Date().toISOString(),checks:[],errors:[],network:[]};
report.extensionVersion=JSON.parse(fs.readFileSync(path.join(extension,'manifest.json'),'utf8')).version;
const reportPrefix=process.env.EARS_REPORT_PREFIX||'';
const reference=require('./original-reference.cjs');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,description,timeout=10000){const end=Date.now()+timeout;let lastError;while(Date.now()<end){try{const v=await fn();if(v)return v}catch(error){lastError=error}await pause(100)}throw new Error('Timeout: '+description+(lastError?' ('+lastError.message+')':''))}
function check(name,details){report.checks.push({name,details});console.log('PASS',name,details?JSON.stringify(details):'')}
function wave(){const rate=48000,n=rate*2,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(800*(Math.sin(2*Math.PI*80*i/rate)+Math.sin(2*Math.PI*1000*i/rate))),44+i*2);return b}
async function targetSession(cdp,targetId){
 const {sessionId}=await cdp.send('Target.attachToTarget',{targetId,flatten:false});let serial=0;
 const pending=new Map();
 const listener=event=>{if(event.sessionId!==sessionId)return;const m=JSON.parse(event.message);if(m.id){const p=pending.get(m.id);pending.delete(m.id);if(m.error)p.reject(new Error(m.error.message));else p.resolve(m.result)}else if(m.method==='Runtime.exceptionThrown')report.errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Network.requestWillBeSent'&&/^https?:/.test(m.params.request.url))report.network.push(m.params.request.url)};
 cdp.on('Target.receivedMessageFromTarget',listener);
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,{resolve,reject});cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject)});
 await send('Runtime.enable');await send('Network.enable');
 return {send,eval:async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value},detach:async()=>{cdp.off('Target.receivedMessageFromTarget',listener);await cdp.send('Target.detachFromTarget',{sessionId}).catch(()=>{})}};
}
let context,server,cdp,id,worker,ui,audioSession;
async function getWorker(){return until(()=>{worker=context.serviceWorkers().find(w=>w.url().startsWith('chrome-extension://'+id));return worker},'service worker')}
async function status(){return (await getWorker()).evaluate(()=>audioStatus())}
async function config(){return (await getWorker()).evaluate(()=>settings())}
async function fft(){return (await getWorker()).evaluate(()=>audio({type:'fft'}))}
async function openUI(tabId){const p=await context.newPage();p.on('pageerror',e=>report.errors.push(e.message));p.on('request',r=>{if(/^https?:/.test(r.url()))report.network.push(r.url())});await p.goto('chrome-extension://'+id+'/popup.html?tabId='+tabId);await p.waitForSelector('.filterDot');return p}
async function trigger(page){await page.bringToFront();const tabs=(await cdp.send('Target.getTargets',{filter:[{type:'tab'}]})).targetInfos;const t=tabs.find(t=>t.url===page.url());assert.ok(t);await cdp.send('Extensions.triggerAction',{id,targetId:t.targetId});}
async function peak(hz){let last;for(let i=0;i<7;i++){last=(await fft()).fft;await pause(40)}const s=await status(),bin=Math.round(hz/(s.sampleRate/8192));return Math.max(...last.slice(bin-2,bin+3))}
(async()=>{
 fs.mkdirSync(evidence,{recursive:true});fs.mkdirSync(tempRoot,{recursive:true});
 const wav=wave();server=http.createServer((req,res)=>{
  if(reference.routes(req,res))return;
  if(req.url==='/tone.wav'){res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':wav.length});res.end(wav)}else{res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end('<!doctype html><title>Ears HTML5 audio '+req.url+'</title><audio loop src="/tone.wav"></audio><button onclick="document.querySelector(\'audio\').play()">Play</button>')}
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const executablePath=process.env.EARS_BROWSER||(brand==='yandex'?'C:/Program Files/Yandex/YandexBrowser/Application/browser.exe':brand==='chrome'?'C:/Program Files/Google/Chrome/Application/chrome.exe':chromium.executablePath());
 const options={executablePath,headless:process.env.EARS_HEADED!=='1',acceptDownloads:true,viewport:{width:656,height:600},ignoreDefaultArgs:['--disable-extensions','--mute-audio'],args:['--enable-unsafe-extension-debugging','--no-first-run','--no-default-browser-check','--autoplay-policy=no-user-gesture-required']};
 context=await chromium.launchPersistentContext(profile,options);report.version=context.browser().version();
 cdp=await context.browser().newBrowserCDPSession();({id}=await cdp.send('Extensions.loadUnpacked',{path:extension}));
 assert.ok((await cdp.send('Extensions.getExtensions')).extensions.find(e=>e.id===id&&e.enabled));check('MV3 loads',report.version);
 const first=context.pages()[0];await first.goto(base+'/one');await trigger(first);await getWorker();
 const firstId=await worker.evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url?.endsWith('/one')).id);
 await pause(300);const popupTarget=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url==='chrome-extension://'+id+'/popup.html');
 report.toolbarPopup=!!popupTarget;
 if(popupTarget){const pop=await targetSession(cdp,popupTarget.targetId);await until(()=>pop.eval('document.querySelectorAll(".filterDot").length===11'),'toolbar SVG');assert.equal(await pop.eval('document.querySelector("#eqSvg").getAttribute("width")'),'600');const screenshot=await pop.send('Page.captureScreenshot');fs.writeFileSync(path.join(evidence,reportPrefix+brand+'-toolbar-popup.png'),Buffer.from(screenshot.data,'base64'));await pop.detach();check('actual toolbar popup SVG');await cdp.send('Target.closeTarget',{targetId:popupTarget.targetId})}
 ui=await openUI(firstId);await until(async()=> (await status()).streams.length===1,'real tab capture');
 assert.equal((await status()).contextState,'running');check('real HTML5 tabCapture in offscreen',await status());
 const offscreen=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url==='chrome-extension://'+id+'/offscreen.html');audioSession=await targetSession(cdp,offscreen.targetId);
 // Test-only silent output device: real captured PCM and filters still run,
 // but generated tones never reach the user's headphones.
 await audioSession.eval('engine.context.setSinkId({type:"none"})');
 await first.getByRole('button').click();
 await pause(1000);console.log('source media',await first.locator('audio').evaluate(a=>({paused:a.paused,time:a.currentTime,ready:a.readyState,error:a.error?.message})));const bassBefore=await peak(80),highBefore=await peak(1000);console.log('baseline',bassBefore,highBefore);assert.ok(bassBefore>-100);assert.ok(highBefore>-100);
 await ui.locator('#bassBoostButton').click();await until(async()=> (await config()).filters[0].gain===5,'bass preset commit');await pause(300);
 const bassAfter=await peak(80),highAfter=await peak(1000);console.log('spectrum deltas',bassAfter-bassBefore,highAfter-highBefore);assert.ok(bassAfter-bassBefore>4&&bassAfter-bassBefore<6);assert.ok(Math.abs(highAfter-highBefore)<1.25);check('Bass Boost changes real captured spectrum',{bassDeltaDb:bassAfter-bassBefore,oneKHzDeltaDb:highAfter-highBefore});
 console.log('Test output uses the silent Web Audio sink; no headphone signal.');
 await ui.locator('#vizButton').click();await until(()=>ui.evaluate(()=>document.querySelectorAll('#eqSvg polyline').length>=12),'spectrum SVG');
 await pause(1500);const defsBefore=await ui.locator('linearGradient').count();await pause(2000);assert.equal(await ui.locator('linearGradient').count(),defsBefore);check('spectrum animates without accumulating gradients',{gradientCount:defsBefore});
 await ui.screenshot({path:path.join(evidence,reportPrefix+brand+'-controls.png')});
 await first.locator('audio').evaluate(a=>{a.volume=0});
 const originalComparison=await reference.compare({context,base,audioSession,ui});if(originalComparison)check('numerical response matches real original background filters',originalComparison);
 const dot=ui.locator('.filterDot').nth(4),box=await until(()=>dot.boundingBox(),'filter dot ready');await ui.mouse.move(box.x+4,box.y+4);await ui.mouse.down();await ui.mouse.move(box.x+28,box.y-24,{steps:8});await ui.mouse.up();await until(async()=> (await config()).filters[4].gain>3,'drag gain');check('original dot dragging modifies native filters');
 await pause(200);const shifted=await until(()=>dot.boundingBox(),'refreshed dot');await ui.keyboard.down('Shift');await ui.mouse.move(shifted.x+4,shifted.y+4);await ui.mouse.down();await ui.mouse.move(shifted.x+4,shifted.y+14,{steps:4});await ui.mouse.up();await ui.keyboard.up('Shift');await until(async()=> (await config()).filters[4].q!==.7071,'shift drag Q');check('Shift drag changes Q');
 await ui.locator('.filterDot').nth(4).dblclick();await until(async()=> (await config()).filters[4].gain===0,'double click reset');check('double click resets one filter');
 const gain=await ui.locator('.gainLine').boundingBox();await ui.mouse.move(gain.x+15,gain.y+2);await ui.mouse.down();await ui.mouse.move(gain.x+15,gain.y+38,{steps:5});await ui.mouse.up();await until(async()=> (await config()).gain<.5,'output gain');check('original gain slider controls output amplitude');
 await ui.locator('#presetNameInput').fill('Regression bass');await ui.locator('#savePresetButton').click();await until(()=>ui.locator('#userPresetSpan button').count(),'save preset UI');
 const downloadEvent=ui.waitForEvent('download');await ui.locator('#exportPresetsButton').click();const download=await downloadEvent;const exported=JSON.parse(fs.readFileSync(await download.path(),'utf8'));assert.equal(exported['Regression bass'].frequencies.length,11);check('preset save and original-format export');
 await ui.locator('#deletePresetButton').click();await until(async()=> !(await config()).presets['Regression bass'],'preset deletion');
 await ui.locator('#importPresetsFile').setInputFiles({name:'presets.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});await until(async()=> !!(await config()).presets['Regression bass'],'import presets');check('preset delete and import');
 await ui.locator('#importPresetsFile').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{invalid')});await until(()=>ui.locator('#requiresProDiv').innerText().then(s=>s.includes('Invalid preset JSON')),'invalid JSON feedback');assert.ok((await config()).presets['Regression bass']);check('invalid imports report an error and preserve settings');
 await ui.close();ui=null;await pause(1500);assert.equal(await audioSession.eval('engine.analyser===null'),true);assert.equal((await status()).streams.length,1);check('audio survives closing interface; idle analyser released');
 const second=await context.newPage();await second.goto(base+'/two');await second.locator('audio').evaluate(a=>{a.volume=0});await second.getByRole('button').click();await trigger(second);await pause(300);
 const secondId=await (await getWorker()).evaluate(async()=> (await chrome.tabs.query({})).find(t=>t.url?.endsWith('/two')).id);
 ui=await openUI(secondId);await until(async()=> (await status()).streams.length===2,'two streams');assert.equal(await audioSession.eval('engine.sessions.size'),2);assert.equal(await audioSession.eval('engine.filters.length'),11);check('two independent captures share original 11-filter EQ');
 // Stop the service worker through CDP while the document retains the live streams.
 await ui.close();ui=null;
 const pageCDP=await context.newCDPSession(second);let versions=[];pageCDP.on('ServiceWorker.workerVersionUpdated',e=>{versions.push(...e.versions)});await pageCDP.send('ServiceWorker.enable');
 const version=await until(()=>versions.find(v=>v.scriptURL==='chrome-extension://'+id+'/service-worker.js'&&v.runningStatus==='running'),'worker version');
 await pageCDP.send('ServiceWorker.stopWorker',{versionId:version.versionId});await pause(500);
 assert.equal(await audioSession.eval('engine.sessions.size'),2);assert.equal(await audioSession.eval('engine.context.state'),'running');
 ui=await openUI(secondId);await until(async()=> (await status()).streams.length===2,'state after worker restart');check('audio and tab state survive forced service worker stop');
 await ui.locator('#eqTabButton').click();await until(async()=> (await status()).streams.length===1,'stop second tab');assert.equal(await audioSession.eval('engine.sessions.size'),1);assert.equal((await status()).streams[0].id,firstId);check('stopping one tab preserves other tab audio');
 await ui.locator('#eqTabButton').click();await until(async()=> (await status()).streams.length===2,'resume second');check('stop/start without reloading source page');
 await second.close();await until(async()=> (await status()).streams.length===1,'closed source cleanup');check('closing captured source tab releases its stream');
 await ui.close();ui=await openUI(firstId);await ui.locator('#resetFiltersButton').click();await until(async()=> (await config()).gain===1,'reset all');
 for(let i=0;i<8;i++){await ui.locator('#eqTabButton').click();await until(async()=> (await status()).streams.length===0,'stop cycle');await ui.locator('#eqTabButton').click();await until(async()=> (await status()).streams.length===1,'start cycle')}
 await audioSession.detach();const currentOffscreen=(await cdp.send('Target.getTargets')).targetInfos.find(t=>t.url.endsWith('/offscreen.html'));audioSession=await targetSession(cdp,currentOffscreen.targetId);
 assert.equal(await audioSession.eval('engine.sessions.size'),1);assert.equal(await audioSession.eval('engine.filters.length'),11);check('8 capture restart cycles leave exactly one graph and stream');
 await ui.locator('#bassBoostButton').click();await until(async()=> (await config()).filters[0].gain===5,'final persisted bass');
 // 60-second actual background run; this is a bounded soak, not an hours-long test.
 await ui.close();ui=null;const soakStart=Date.now();await pause(Number(process.env.EARS_SOAK_MS||60000));assert.equal(await audioSession.eval('engine.context.state'),'running');assert.equal(await audioSession.eval('engine.sessions.size'),1);check('bounded background soak',{seconds:(Date.now()-soakStart)/1000});
 await audioSession.detach();await context.close();context=null;
 context=await chromium.launchPersistentContext(profile,options);cdp=await context.browser().newBrowserCDPSession();
 await cdp.send('Extensions.loadUnpacked',{path:extension});ui=await openUI(firstId);await getWorker();await until(async()=> (await config()).filters[0].gain===5,'browser restart settings');
 assert.ok((await config()).presets['Regression bass']);assert.equal((await status()).streams.length,0);check('browser restart restores filters/presets without silently recapturing tabs');
 assert.equal(report.errors.length,0,JSON.stringify(report.errors));assert.equal(report.network.length,0,JSON.stringify(report.network));check('no extension JS exceptions or external HTTP requests');
 report.passed=true;
})().catch(error=>{report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1}).finally(async()=>{if(context)await context.close().catch(()=>{});if(server)server.close();fs.mkdirSync(evidence,{recursive:true});fs.writeFileSync(path.join(evidence,reportPrefix+brand+'-results.json'),JSON.stringify(report,null,2));console.log('Report:',path.join(evidence,reportPrefix+brand+'-results.json'))});
