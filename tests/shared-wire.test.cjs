const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function rig(id){
  const ctx=vm.createContext({structuredClone,crypto:{randomUUID:()=>crypto.randomUUID()},document:{getElementById:()=>({})},localStorage:{getItem:()=>null}});
  vm.runInContext(source+`;renderSelection=()=>{};model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id===${JSON.stringify(id)}));simulate(false);`,ctx);
  return {
    run:code=>vm.runInContext(code,ctx),
    on:(id,on)=>vm.runInContext(`nodeBy(${JSON.stringify(id)}).on=${on};simulate(false);`,ctx),
    powered:id=>vm.runInContext(`(()=>{const net=networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id).out])));return net.powered.get(net.byWire.get(${JSON.stringify(id)}));})()`,ctx),
    output:id=>vm.runInContext(`values.get(${JSON.stringify(id)}).out[0]`,ctx)
  };
}
test('shared sources keep the entire net powered until the last source switches off',()=>{
  const r=rig('wire-two-sources');
  for(const [a,b] of [[false,false],[true,false],[true,true],[false,true],[false,false],[false,true],[true,true],[true,false],[false,false]]){
    r.on('a',a);r.on('b',b);
    for(const wire of ['a-feed','b-feed','shared','witness-output'])assert.equal(r.powered(wire),a||b,wire);
    assert.equal(r.output('witness'),a||b);
  }
});
test('shared output nubs backfeed wires without changing the inactive source state',()=>{
  const r=rig('wire-shared-output');r.on('a',true);
  assert.equal(r.powered('branch'),true);assert.equal(r.output('witness'),true);
  assert.equal(r.output('b'),false);assert.equal(r.run("nodeBy('b').on===true"),false);
  r.on('a',false);assert.equal(r.output('witness'),false);
});
test('adding and removing a live branch updates immediately without residual power',()=>{
  const r=rig('wire-live-attachment');
  assert.equal(r.output('witness'),false);
  r.run("model.wires.push(designWire('new',{x:192,y:144},{node:'witness',side:'in',index:0},[{x:288,y:144},{x:288,y:120}]));simulate(false);");
  assert.equal(r.output('witness'),true);
  r.run("model.wires=model.wires.filter(w=>w.id!=='new');simulate(false);");
  assert.equal(r.output('witness'),false);assert.equal(r.powered('live-end'),true);
});
test('deleting one source branch preserves the other and deleting the last clears the net',()=>{
  const r=rig('wire-two-sources');r.on('a',true);r.on('b',true);
  r.run("model.wires=model.wires.filter(w=>w.id!=='a-feed');simulate(false);");
  assert.equal(r.output('witness'),true);
  r.run("model.wires=model.wires.filter(w=>w.id!=='b-feed');simulate(false);");
  assert.equal(r.output('witness'),false);
});
test('external power at an OR output does not cross the gate into its inputs',()=>{
  const r=rig('wire-or-isolation');r.on('b',true);
  assert.equal(r.powered('output'),true);assert.equal(r.powered('input'),false);
  assert.equal(r.output('witness'),false);
  r.on('a',true);assert.equal(r.powered('input'),true);assert.equal(r.output('witness'),true);
  r.on('b',false);assert.equal(r.powered('output'),true);
  r.on('a',false);assert.equal(r.powered('output'),false);
});
test('wire style, array ordering and endpoint direction do not change connectivity',()=>{
  const r=rig('wire-two-sources');r.on('a',true);
  r.run("model.nodes.reverse();model.wires.reverse();for(const w of model.wires){const from={...w.from,side:w.from.side||'out'},to={...w.to,side:w.to.side||'in'};w.from=to;w.to=from;w.points.reverse();w.style='neon';w.color='Pink';}simulate(false);");
  assert.equal(r.output('witness'),true);assert.equal(r.powered('b-feed'),true);
  r.on('a',false);assert.equal(r.output('witness'),false);
});
test('a separated branch stops conducting and reconnecting it restores power',()=>{
  const r=rig('wire-two-sources');r.on('a',true);
  r.run("model.wires.find(w=>w.id==='shared').from.x+=48;simulate(false);");
  assert.equal(r.output('witness'),false);
  r.run("model.wires.find(w=>w.id==='shared').from.x-=48;simulate(false);");
  assert.equal(r.output('witness'),true);
});
test('crossings stay isolated through repeated source changes',()=>{
  const r=rig('crossing-wires');
  for(const [a,b] of [[true,false],[false,true],[true,true],[false,false]]){
    r.on('on',a);r.on('off',b);
    assert.equal(r.powered('horizontal'),a);assert.equal(r.powered('vertical'),b);
  }
});
test('NOR and OR-NOT retain their intended output after attaching a wire',()=>{
  const r=rig('gate-nor-attachment');
  assert.equal(r.output('nor'),true);assert.equal(r.output('not'),true);
  r.run("model.wires.push(designWire('nor-output',{node:'nor',side:'out',index:0},{x:480,y:48}));simulate(false);");
  assert.equal(r.powered('nor-output'),true);assert.equal(r.powered('reference-output'),true);
});
test('all wire validation designs survive export/import without losing their topology',()=>{
  for(const id of ['wire-two-sources','wire-shared-output','wire-live-attachment','wire-or-isolation','gate-nor-attachment']){
    const r=rig(id);
    assert.equal(r.run('valid(model)'),true);
    const before=r.run('JSON.stringify(model.wires)');
    r.run('model=normalize(JSON.parse(JSON.stringify(model)));resetTiming();simulate(false);');
    assert.equal(r.run('valid(model)'),true);assert.equal(r.run('JSON.stringify(model.wires)'),before);
  }
});
