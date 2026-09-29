/* Read-only runtime probes. This file does not edit the app, storage, or fixtures. */
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const assert = require('node:assert/strict');
const source = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8').split('bind();updateGridSnap();')[0];
function rig(setup) {
  const elements = new Map();
  const ctx = vm.createContext({
    structuredClone, crypto: require('node:crypto').webcrypto,
    document: { getElementById: id => { if (!elements.has(id)) elements.set(id, {classList:{remove(){}},setAttribute(){},querySelector(){return null;}}); return elements.get(id); } },
    localStorage: {getItem:()=>null,setItem(){}},setTimeout(){},clearTimeout(){},
  });
  vm.runInContext(source + ';render=()=>{};renderSelection=()=>{};paintSignals=()=>{};paintTimingFaces=()=>{};save=()=>{};updateHistory=()=>{};refreshWireToolUI=()=>{};' + setup, ctx);
  return code => vm.runInContext(code, ctx);
}
function snapshot(run) {
  return JSON.parse(run(`JSON.stringify({ms:simulationMs,values:[...values],latch:[...latchStates],buffers:[...circuitBuffers],nodes:model.nodes.filter(isMemory)})`));
}
const feedbackSetup = `model={name:'Repeated delayed pulses into linked latch',nodes:[
  designNode('source','lever',0,0,{on:true}),designNode('delay','delay',300,0,{delay:1}),designNode('latch','srLatch',700,0)],wires:[
  designWire('input',{node:'source',side:'out',index:0},{node:'delay',side:'in',index:0}),
  designWire('feedback',{node:'delay',side:'out',index:0},{node:'delay',side:'in',index:0}),
  designWire('to-latch',{node:'delay',side:'out',index:0},{node:'latch',side:'in',index:0}),
  designWire('link',{node:'latch',side:'in',index:0},{node:'latch',side:'in',index:1})]};
  resetTiming();simulate(false);simulate(true,50);nodeBy('source').on=false;simulate(false);simulate(true,175);`;
// Two input pulses at 0..50 and 200..225 ms produce delayed pulses at
// 200..250 and 400..425 ms. Compare only ordinary 200 ms Step intervals
// against 10 ms frames; no internal timer state is changed by this probe.
const twoPulsesSetup=feedbackSetup.replace("designWire('feedback',{node:'delay',side:'out',index:0},{node:'delay',side:'in',index:0}),",'').replace("simulate(true,175);","simulate(true,150);nodeBy('source').on=true;simulate(false);simulate(true,25);nodeBy('source').on=false;simulate(false);");
const stepped=rig(twoPulsesSetup),framed=rig(twoPulsesSetup);
assert.equal(stepped('valid(model)'),true);
stepped('simulate(true,200);simulate(true,200);simulate(true,50)');
framed('for(let i=0;i<45;i++)simulate(true,10)');
console.log('LATCH_FRAME_DEPENDENCE',JSON.stringify({stepped:snapshot(stepped),framed:snapshot(framed)}));
assert.notEqual(stepped("values.get('latch').out.join(',')"),framed("values.get('latch').out.join(',')"));

const bufferSetup = `model={name:'Buffer feedback',nodes:[designNode('b','buffer1',0,0,{bit:true})],wires:[designWire('feedback',{node:'b',side:'out',index:0},{node:'b',side:'in',index:0})]};resetTiming();simulate(false);`;
const bufferDirect=rig(bufferSetup),bufferGate=rig(bufferSetup.replace("],wires:",",designNode('g','or',300,0)],wires:").replace("{node:'b',side:'out',index:0},{node:'b',side:'in',index:0}","{node:'b',side:'out',index:0},{node:'g',side:'in',index:0}),designWire('to-buffer',{node:'g',side:'out',index:0},{node:'b',side:'in',index:0}"));
assert.equal(bufferDirect('valid(model)'),true);assert.equal(bufferGate('valid(model)'),true);
assert.equal(bufferDirect("nodeBy('b').bit"),true);assert.equal(bufferGate("nodeBy('b').bit"),false);
console.log('BUFFER_SELF_FEEDBACK',JSON.stringify({direct:snapshot(bufferDirect),viaOr:snapshot(bufferGate)}));

const latch=rig(`model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='sr-latch'));simulate(false);pressButton(nodeBy('bottom'));simulate(true,800);`);
const before=snapshot(latch);
latch('model=normalize(JSON.parse(JSON.stringify(model)));resetTiming();simulate(false)');
console.log('LATCH_RELOAD',JSON.stringify({before,after:snapshot(latch)}));

const undo=rig(`model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='sr-latch'));simulate(false);pressButton(nodeBy('bottom'));simulate(true,800);checkpoint();nodeBy('latch').x+=48;simulate(false);`);
const beforeUndo=snapshot(undo);undo('undo()');
console.log('LATCH_UNDO_MOVE',JSON.stringify({before:beforeUndo,after:snapshot(undo)}));

const sustainedSelector=rig(`model={name:'Sustain to selector',nodes:[designNode('source','lever',0,0),designNode('sustain','sustain',300,0,{delay:2}),designNode('selector','selector4',600,0)],wires:[designWire('feed',{node:'source',side:'out',index:0},{node:'sustain',side:'in',index:0}),designWire('count',{node:'sustain',side:'out',index:0},{node:'selector',side:'in',index:0})]};resetTiming();simulate(false);`);
sustainedSelector("nodeBy('source').on=true;simulate(false);simulate(true,100)");
const beforeRelease=snapshot(sustainedSelector);
sustainedSelector("nodeBy('source').on=false;simulate(false)");
const afterRelease=snapshot(sustainedSelector);
assert.equal(sustainedSelector('valid(model)'),true);
assert.equal(beforeRelease.nodes[0].channel,1);assert.equal(afterRelease.nodes[0].channel,2);
assert.equal(beforeRelease.values.find(([id])=>id==='sustain')[1].out[0],true);
assert.equal(afterRelease.values.find(([id])=>id==='sustain')[1].out[0],true);
sustainedSelector('simulate(true,400)');
console.log('SUSTAIN_PHANTOM_EDGE',JSON.stringify({before:beforeRelease,after:afterRelease,expired:snapshot(sustainedSelector)}));

const sustainedBuffer=rig(`model={name:'Sustain to Buffer 4',nodes:[designNode('source','lever',0,0),designNode('sustain','sustain',300,0,{delay:2}),designNode('memory','buffer4',600,0)],wires:[designWire('feed',{node:'source',side:'out',index:0},{node:'sustain',side:'in',index:0}),designWire('write',{node:'sustain',side:'out',index:0},{node:'memory',side:'in',index:1})]};resetTiming();simulate(false);nodeBy('source').on=true;simulate(false);simulate(true,100);`);
const beforeBufferRelease=snapshot(sustainedBuffer);
sustainedBuffer("nodeBy('source').on=false;simulate(false)");
const afterBufferRelease=snapshot(sustainedBuffer);
assert.equal(sustainedBuffer('valid(model)'),true);
assert.equal(beforeBufferRelease.nodes[0].bits.map(Number).join(''),'1000');
assert.equal(afterBufferRelease.nodes[0].bits.map(Number).join(''),'1100');
console.log('SUSTAIN_PHANTOM_WRITE',JSON.stringify({before:beforeBufferRelease,after:afterBufferRelease}));
console.log('SUSTAIN_BUILTIN_USAGE',sustainedBuffer("JSON.stringify(BUILT_IN_DESIGNS.filter(d=>d.nodes.some(n=>n.type==='sustain')).map(d=>({id:d.id,name:d.name,memoryNodes:d.nodes.filter(isMemory).length})))"));

// Constant-input timing and memory controls: expected behavior is asserted.
for(const type of ['delay','sustain']){
  const r=rig(`model={name:'continuous input',nodes:[designNode('source','lever',0,0,{on:true}),designNode('timer','${type}',300,0,{delay:2})],wires:[designWire('feed',{node:'source',side:'out',index:0},{node:'timer',side:'in',index:0})]};resetTiming();simulate(false);simulate(true,10000);`);
  assert.equal(r("values.get('timer').out[0]"),true);
  r("nodeBy('source').on=false;simulate(false);simulate(true,399)");assert.equal(r("values.get('timer').out[0]"),true);
  r('simulate(true,1)');assert.equal(r("values.get('timer').out[0]"),false);
}
for(const id of ['selector-four-test','buffer-one-test']){
  const r=rig(`model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'));simulate(false);`);
  const sourceId=id==='selector-four-test'?'source':'one';
  r(`nodeBy('${sourceId}').type='lever';nodeBy('${sourceId}').on=true;simulate(false)`);
  const initial=r("JSON.stringify(model.nodes.filter(isMemory).map(n=>memoryOutputs(n)))");r('simulate(true,10000)');
  assert.equal(r("JSON.stringify(model.nodes.filter(isMemory).map(n=>memoryOutputs(n)))"),initial);
}
console.log('CONTROL_ASSERTIONS passed: held Delay/Sustain release on schedule; Buffer/Selector do not repeat held-input edges');
