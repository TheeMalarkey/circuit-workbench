const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
function rig(){
  const ctx=loadApp(),run=code=>vm.runInContext(code,ctx);
  run('renderSelection=paintTimingFaces=save=setStatus=()=>{};');
  return {run,json:code=>JSON.parse(run(`JSON.stringify(${code})`))};
}
const sources=`{nodes:[designNode('a','lever',0,0,{on:true}),designNode('b','lever',480,0),designNode('sink','inverter',960,0)],wires:[
  designWire('a-wire',{node:'a',side:'out',index:0},{node:'sink',side:'in',index:0}),
  designWire('b-wire',{node:'b',side:'out',index:0},{node:'sink',side:'in',index:0})]}`;

test('stable solves propagate real joined sources without allocating driver Sets per pass',()=>{
  const r=rig();r.run(`model=${sources};resetTiming();simulate(false);
    const NativeSet=Set;let solverSets=0;Set=class extends NativeSet{constructor(...args){super(...args);solverSets++;}};
    const solved=resolveSignals();Set=NativeSet;`);
  assert.deepEqual(r.json("solved.get('sink')"),{in:[true],drive:[true],out:[false]});
  assert.equal(r.run('solverSets'),0,'cached connectivity must not rebuild transient source Sets');
});

test('forwarded drive distinguishes self-only pulses from another buffer on the same network',()=>{
  const r=rig();r.run(`model={nodes:[designNode('a','buffer1',0,0),designNode('b','buffer1',480,0)],wires:[
    designWire('joined',{node:'a',side:'in',index:0},{node:'b',side:'in',index:0})]};resetTiming();
    memoryStates.set('a',{old:false,port:0,until:200});values=resolveSignals();`);
  assert.deepEqual(r.json("[values.get('a').in[0],values.get('a').drive[0],values.get('b').in[0],values.get('b').drive[0]]"),[true,false,true,true]);
  r.run("memoryStates.set('b',{old:false,port:0,until:200});values=resolveSignals();");
  assert.deepEqual(r.json("[values.get('a').drive[0],values.get('b').drive[0]]"),[true,true]);
  r.run('simulationMs=200;values=resolveSignals();');
  assert.deepEqual(r.json("[values.get('a').in[0],values.get('a').drive[0],values.get('b').in[0],values.get('b').drive[0]]"),[false,false,false,false]);
});

test('public wire source snapshots remain independent and report every active driver',()=>{
  const r=rig();r.run(`model=${sources};resetTiming();simulate(false);
    const first=networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id).out])));
    const net=first.byWire.get('a-wire');nodeBy('b').on=true;simulate(false);
    const second=networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id).out])));`);
  assert.deepEqual(r.json('[...first.outputDrivers.get(net)]'),['a']);
  assert.deepEqual(r.json('[...second.outputDrivers.get(net)]'),['a','b']);
  assert.deepEqual(r.json("wirePowerDetails('a-wire',second).sources.map(s=>[s.node,s.active])"),[['a',true],['b',true]]);
  r.run("nodeBy('a').on=false;simulate(false);");
  assert.equal(r.run("values.get('sink').in[0]"),true,'the remaining real source keeps the wire powered');
  assert.deepEqual(r.json('[...second.outputDrivers.get(net)]'),['a','b'],'later solves never mutate an inspector snapshot');
});

test('reused propagation observes topology edits and same-geometry model replacement',()=>{
  const r=rig();r.run(`model=${sources};resetTiming();simulate(false);model=structuredClone(model);nodeBy('a').on=false;nodeBy('b').on=true;simulate(false);`);
  assert.equal(r.run("values.get('sink').in[0]"),true);
  r.run("model.wires=model.wires.filter(w=>w.id!=='b-wire');simulate(false);");
  assert.deepEqual(r.json("values.get('sink')"),{in:[false],drive:[false],out:[true]});
});
