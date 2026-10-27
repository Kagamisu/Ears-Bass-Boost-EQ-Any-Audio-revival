/* Optional numerical comparison against the user's private original archive.
 * Original copyrighted background source is never copied into this project. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
function routes(req,res){
 const dir=process.env.EARS_ORIGINAL_DIR;if(!dir||!req.url.startsWith('/reference'))return false;
 if(req.url==='/reference.html'){
  res.setHeader('Content-Type','text/html');res.end('<meta charset="utf-8"><script src="/reference-stub.js"></script><script src="/reference-bg.js"></script>');
 }else if(req.url==='/reference-stub.js'){
  res.setHeader('Content-Type','text/javascript');res.end(`localStorage.clear();window.originalListeners=[];window.chrome={runtime:{getManifest:()=>({version:'1.3.12'}),sendMessage:()=>{},onMessage:{addListener:f=>originalListeners.push(f),removeListener:()=>{}}},storage:{sync:{get:(q,cb)=>cb({}),set:(q,cb)=>cb(),remove:(q,cb)=>cb()},onChanged:{addListener:()=>{}}},tabs:{query:(q,cb)=>cb([{id:1,title:'reference'}])},tabCapture:{onStatusChanged:{addListener:()=>{}}}};`);
 }else if(req.url==='/reference-bg.js'){
  let source=fs.readFileSync(path.join(dir,'bg.js'),'utf8');
  const remote='(function(){var e=document.createElement("script");e.type="text/javascript";e.async=true;e.src="https://ssl.google-analytics.com/ga.js";var t=document.getElementsByTagName("script")[0];t.parentNode.insertBefore(e,t)})();';
  assert.ok(source.includes(remote),'Unexpected original background');source=source.replace(remote,'');
  assert.ok(source.includes('B.connect(G);function u(e)'));source=source.replace('B.connect(G);function u(e)','window.originalGraph={context:M,filters:V,output:G};B.connect(G);function u(e)');
  res.setHeader('Content-Type','text/javascript');res.end(source);
 }else {res.writeHead(404);res.end()}
 return true;
}
const expression=`(()=>{const g=GRAPH;const frequencies=new Float32Array(Array.from({length:256},(_,i)=>5*Math.pow(4000,i/255)));const totals=Array(256).fill(1);for(const node of g.filters){const magnitude=new Float32Array(256),phase=new Float32Array(256);node.getFrequencyResponse(frequencies,magnitude,phase);for(let j=0;j<256;j++)totals[j]*=magnitude[j]}return {sampleRate:g.context.sampleRate,db:totals.map(n=>20*Math.log10(n*g.output.gain.value))}})()`;
async function compare({context,base,audioSession,ui}){
 if(!process.env.EARS_ORIGINAL_DIR)return null;
 const original=await context.newPage();await original.goto(base+'/reference.html');await original.waitForFunction(()=>window.originalGraph);
 const cases=[{type:'preset',preset:'bassBoost'},{type:'modifyFilter',index:4,frequency:1100,gain:-12,q:4},{type:'modifyFilter',index:8,frequency:6500,gain:9,q:.2}];
 let maximum=0;
 for(const message of cases){
  await original.evaluate(m=>originalListeners[0](m,{},()=>{}),message);
  await ui.evaluate(m=>Ears.sendMessage(m),message);await new Promise(r=>setTimeout(r,300));
  const a=await original.evaluate(expression.replace('GRAPH','originalGraph'));
  const b=await audioSession.eval(expression.replace('GRAPH','engine'));
  assert.equal(a.sampleRate,b.sampleRate);
  maximum=Math.max(maximum,...a.db.map((v,i)=>Math.abs(v-b.db[i])));
 }
 assert.ok(maximum<.002,'Original/revival response deviation: '+maximum+' dB');
 await ui.evaluate(()=>Ears.sendMessage({type:'preset',preset:'bassBoost'}));await original.close();await ui.bringToFront();return {configurations:3,frequencies:256,maximumDeviationDb:maximum};
}
module.exports={routes,compare};
