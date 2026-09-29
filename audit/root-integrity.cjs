// Read-only audit diagnostics. Does not edit app, browser saves, or live data.
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8').split('bind();updateGridSnap();')[0];
function rig() {
  const ctx = vm.createContext({ structuredClone, crypto: require('node:crypto').webcrypto,
    document: {getElementById: () => ({})}, localStorage: {getItem: () => null} });
  vm.runInContext(source + ';renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};', ctx);
  return code => vm.runInContext(code, ctx);
}
const run = rig();
const inventory = JSON.parse(run(`JSON.stringify(BUILT_IN_DESIGNS.map(d=>{
  model=structuredClone(d);resetTiming();simulate(false);
  const network=wireNetworks();
  return {id:d.id,nodes:d.nodes.length,wires:d.wires.length,
    multipleDriverNets:[...network.outputs].filter(([id,p])=>p.length>1).map(([id,p])=>p.map(x=>x.node+':'+x.index)),
    contacts:network.contacts.length};
}))`));
console.log(JSON.stringify({inventory}, null, 2));

// Observe real wire paint objects, not just evaluate() or copied output arrays.
run(`model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='wire-two-sources'));resetTiming();simulate(false);
  paintedModel=model;const painted={};
  paintedWires=model.wires.map(w=>({id:w.id,active:false,paths:[{classList:{toggle:(name,on)=>painted[w.id]=on}}]}));
  nodeBy('a').on=true;simulate(false);
  const before=JSON.stringify(painted);
  nodeBy('a').on=false;simulate(false);
  const after=JSON.stringify(painted);`);
console.log(JSON.stringify({sharedWirePaint:{powered:JSON.parse(run('before')),unpowered:JSON.parse(run('after'))}}));

// Test the reset called by addDesign. Existing latch selection is not model state.
run(`model={name:'latch',nodes:[designNode('button','button',0,0),designNode('latch','srLatch',384,0)],wires:[designWire('feed',{node:'button',side:'out',index:0},{node:'latch',side:'in',index:1})]};
  resetTiming();pressButton(nodeBy('button'));simulate(true,1000);
  const beforeLatch=values.get('latch').out.slice();
  const added=designCopy(BUILT_IN_DESIGNS.find(d=>d.id==='crossing-wires'));
  model={...model,nodes:[...model.nodes,...added.nodes],wires:[...model.wires,...added.wires]};
  resetTiming();simulate(false);
  const afterLatch=values.get('latch').out.slice();`);
console.log(JSON.stringify({addingUnconnectedDesign:{before:JSON.parse(run('JSON.stringify(beforeLatch)')),after:JSON.parse(run('JSON.stringify(afterLatch)'))}}));
