const {test} = require('node:test');
const assert = require('node:assert/strict');
const S = require('../extension/settings.js');
test('original 11 filters, shelving types, defaults and exact Q', () => {
  const s=S.defaults(); assert.equal(s.filters.length,11);
  assert.deepEqual(s.filters.map(f=>f.frequency),[20,40,80,160,320,640,1280,2560,5120,10240,20480]);
  assert.equal(s.filters[0].type,'lowshelf');assert.equal(s.filters[10].type,'highshelf');
  assert.equal(s.filters.filter(f=>f.type==='peaking').length,9);
  assert.ok(s.filters.every(f=>f.q===.7071 && f.gain===0));assert.equal(s.gain,1);
});
test('Bass Boost matches original, including original 20 kHz edit clamp', () => {
  const s=S.apply(S.defaults(),{type:'preset',preset:'bassBoost'});
  assert.equal(s.filters[0].frequency,340);assert.equal(s.filters[0].gain,5);
  assert.equal(s.filters[10].frequency,20000);assert.ok(s.filters.slice(1).every(f=>f.gain===0));
});
test('finite numbers, bounds and filter indexes are enforced', () => {
  for(const n of [NaN,Infinity,undefined,'5',null])assert.throws(()=>S.apply(S.defaults(),{type:'modifyGain',gain:n}));
  for(const index of [-1,11,1.5,'1'])assert.throws(()=>S.apply(S.defaults(),{type:'modifyFilter',index,frequency:10,gain:0,q:1}));
  const s=S.apply(S.defaults(),{type:'modifyFilter',index:2,frequency:99999,gain:-999,q:99});
  assert.equal(s.filters[2].frequency,20000);assert.equal(s.filters[2].gain,-30);assert.equal(s.filters[2].q,11);
  assert.equal(S.apply(s,{type:'modifyGain',gain:99}).gain,10);
  assert.equal(S.apply(s,{type:'modifyGain',gain:0}).gain,.00316);
});
test('presets round trip in the original Ears JSON format; gain remains independent', () => {
  let s=S.apply(S.defaults(),{type:'preset',preset:'bassBoost'});
  s=S.apply(s,{type:'modifyGain',gain:.2});s=S.apply(s,{type:'savePreset',preset:'My bass'});
  const exported=JSON.parse(JSON.stringify(s.presets));
  let next=S.apply(S.defaults(),{type:'importPresets',presets:exported});
  next=S.apply(next,{type:'preset',preset:'My bass'});assert.deepEqual(next.filters,s.filters);assert.equal(next.gain,1);
  assert.deepEqual(S.load(JSON.parse(JSON.stringify(s))),s);
  next=S.apply(next,{type:'deletePreset',preset:'My bass'});assert.equal(Object.keys(next.presets).length,0);
});
test('malformed and prototype-polluting imports fail atomically', () => {
  const s=S.defaults(),good=S.apply(s,{type:'savePreset',preset:'ok'}).presets.ok;
  for(const p of [null,[],{bad:{}},JSON.parse('{"__proto__":{}}'),{bad:{...good,gains:[1]}},{bad:{...good,frequencies:Array(11).fill('80')}}])assert.throws(()=>S.apply(s,{type:'importPresets',presets:p}));
  assert.equal({}.polluted,undefined);assert.equal(Object.keys(s.presets).length,0);
  const mixed={good,bad:{}};assert.throws(()=>S.apply(s,{type:'importPresets',presets:mixed}));assert.deepEqual(s.presets,{});
});
test('reset restores original values and resets output gain', () => {
  const changed=S.apply(S.defaults(),{type:'modifyGain',gain:4});
  const reset=S.apply(changed,{type:'resetFilters'});assert.equal(reset.gain,1);assert.equal(reset.filters[10].frequency,20000);
});
