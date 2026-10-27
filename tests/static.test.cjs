const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'../extension');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
test('valid MV3 manifest, minimal permissions and self-contained runtime',()=>{
 assert.equal(manifest.manifest_version,3);assert.match(manifest.version,/^\d+(\.\d+){0,3}$/);
 assert.deepEqual([...manifest.permissions].sort(),['activeTab','offscreen','storage','tabCapture']);
 assert.equal(manifest.minimum_chrome_version,'116');
 for(const key of ['key','update_url','host_permissions','content_scripts'])assert.equal(manifest[key],undefined);
 assert.equal(manifest.background.service_worker,'service-worker.js');assert.ok(manifest.action.default_popup);
 assert.ok(manifest.content_security_policy.extension_pages.includes("connect-src 'none'"));
 assert.ok(!fs.existsSync(path.join(root,'_metadata')));
 for(const f of [manifest.background.service_worker,manifest.action.default_popup,...Object.values(manifest.icons)])assert.ok(fs.existsSync(path.join(root,f)));
});
test('JavaScript parses; own code stays local; vendored library matches upstream hash',()=>{
 for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.js'))){
  const source=fs.readFileSync(path.join(root,f),'utf8');new vm.Script(source,{filename:f});
  if(f==='snap.svg-min.js'){assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex'),'ce63e4b1ae68e2d143d460ef071d43e90a8a0a81b20d51cc3406cbc1a3ad2549');continue;}
  assert.doesNotMatch(source,/_gaq|google-analytics|UA-64913318|chrome\.storage\.sync|\beval\s*\(|new\s+Function\s*\(|\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|RTCPeerConnection/);
 }
 const html=fs.readFileSync(path.join(root,'popup.html'),'utf8');
 assert.doesNotMatch(html,/<script[^>]+src=["']https?:/);
 for(const src of [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(m=>m[1]))assert.ok(fs.existsSync(path.join(root,src)));
});
