// Read-only signal audit: run the existing app in an isolated VM.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8').split('bind();updateGridSnap();')[0];
function rig(setup) {
  const ctx = vm.createContext({structuredClone, crypto:require('node:crypto').webcrypto, document:{getElementById:()=>({})}, localStorage:{getItem:()=>null}});
  vm.runInContext(source + ';renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};' + setup, ctx);
  return code => JSON.parse(vm.runInContext('JSON.stringify((()=>{' + code + '})())', ctx));
}
function print(name, result) { console.log(JSON.stringify({name,...result})); }

const loopSetup = `model={name:'one inverter feedback',nodes:[designNode('g','inverter',0,0)],wires:[designWire('feedback',{node:'g',side:'out',index:0},{node:'g',side:'in',index:0},[{x:144,y:48},{x:144,y:-48},{x:-48,y:-48},{x:-48,y:48}])]};simulate(false);`;
const loop = rig(loopSetup);
print('nonconvergent inverter loop', loop(`const before=structuredClone(values.get('g'));const beforeWire=networkSignals(new Map([...values].map(([id,v])=>[id,v.out]))).powered.get(wireNetworks().byWire.get('feedback'));simulate(true,1000);const afterOneSecond=structuredClone(values.get('g'));model.nodes.push(designNode('unconnected','lever',2000,2000));simulate(false);const afterUnrelatedNode=structuredClone(values.get('g'));return {before,beforeWire,afterOneSecond,afterUnrelatedNode,afterWire:networkSignals(new Map([...values].map(([id,v])=>[id,v.out]))).powered.get(wireNetworks().byWire.get('feedback'))};`));

function latchVariant(variant) {
  const run = rig(`model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='sr-latch-linked'));`);
  return run(`
    const variant=${JSON.stringify(variant)};
    const original=model.wires.find(w=>w.id==='top-feed');
    const ends=wireEnds(original), midpoint={x:(ends[0].x+ends[1].x)/2,y:(ends[0].y+ends[1].y)/2};
    if(variant==='loose-end')original.to=portPosition(nodeBy(original.to.node),original.to.side||'in',original.to.index);
    if(variant==='split'){
      const points=wireEnds(original), split=points[1], target=original.to;
      original.to={...split};original.points=[];
      model.wires.push(designWire('continued',split,target,points.slice(2,-1)));
    }
    simulate(false);
    const net=wireNetworks(), signature=[...net.groups].map(([id,wires])=>({inputs:net.inputs.get(id).map(p=>p.node+':'+p.index).sort(),outputs:net.outputs.get(id).map(p=>p.node+':'+p.index).sort()}));
    pressButton(nodeBy('top'));simulate(true,200);const during=structuredClone(values.get('latch'));simulate(true,600);
    return {variant,valid:valid(model),signature,during,after:values.get('latch'),state:latchStates.get('latch')};
  `);
}
for(const variant of ['original','loose-end','split'])print('joined SR latch endpoint dependence',latchVariant(variant));

const ownBuffer=rig(`model={name:'buffer self feedback',nodes:[designNode('b','buffer1',0,0,{bit:true})],wires:[designWire('feedback',{node:'b',side:'out',index:0},{node:'b',side:'in',index:0},[{x:144,y:24},{x:144,y:-48},{x:24,y:-48}])]};simulate(false);`);
print('buffer ignores own regular output',ownBuffer(`return {valid:valid(model),value:values.get('b'),bit:nodeBy('b').bit,memoryInput:nodeBy('b').memoryInput};`));

const positive = rig(`model={name:'OR feedback',nodes:[designNode('s','lever',-300,-300,{on:true}),designNode('g','or',0,0)],wires:[designWire('input',{node:'s',side:'out',index:0},{node:'g',side:'in',index:1},[{x:-204,y:24}]),designWire('feedback',{node:'g',side:'out',index:0},{node:'g',side:'in',index:0},[{x:144,y:48},{x:144,y:-48},{x:-48,y:-48},{x:-48,y:24}])]};simulate(false);`);
print('ordinary gate feedback restart',positive(`const before=structuredClone(values.get('g'));nodeBy('s').on=false;simulate(false);return{before,after:values.get('g')};`));

const nub=rig(`model={name:'same nub interior contact',nodes:[designNode('source','lever',-384,0,{on:true}),designNode('nub','lever',0,0,{on:false})],wires:[]};const nubPoint=portPosition(nodeBy('nub'),'out',0);const sourcePoint=portPosition(nodeBy('source'),'out',0);model.wires.push(designWire('horizontal',{node:'source',side:'out',index:0},{x:nubPoint.x+192,y:nubPoint.y}));model.wires.push(designWire('vertical',{x:nubPoint.x,y:nubPoint.y-192},{x:nubPoint.x,y:nubPoint.y+192}));simulate(false);`);
print('two wire interiors touching same nub',nub(`
  const inspect=()=>{const net=networkSignals(new Map([...values].map(([id,v])=>[id,v.out])));return {horizontal:net.powered.get(net.byWire.get('horizontal')),vertical:net.powered.get(net.byWire.get('vertical')),ports:[...net.outputs].map(([id,ports])=>ports.map(p=>p.node+':'+p.index))};};
  const before=inspect();const vertical=model.wires.find(w=>w.id==='vertical'),bottom=vertical.to;vertical.to={...nubPoint};model.wires.push(designWire('vertical-bottom',nubPoint,bottom));simulate(false);return {before,afterIdenticalGeometrySplit:inspect()};
`));
