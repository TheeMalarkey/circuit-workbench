const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function rig(store=new Map()){
  const elements=new Map(),element=()=>({classList:{remove(){}},querySelector:()=>null,setAttribute(){}});
  const ctx=vm.createContext({structuredClone,crypto:require('node:crypto').webcrypto,
    document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);}},
    localStorage:{getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)},setTimeout(){},clearTimeout(){}});
  vm.runInContext(source+';render=()=>{};renderSelection=()=>{};renderProjectTabs=()=>{};paintTimingFaces=()=>{};save=()=>{};updateHistory=()=>{};refreshWireToolUI=()=>{};',ctx);
  return {run:code=>vm.runInContext(code,ctx),json:code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,ctx)),store};
}
const init=(r,code)=>r.run(`model=${code};resetTiming();simulate(false);`);

test('one sustained activation makes exactly one downstream memory edge',()=>{
  for(const memory of ['selector4','buffer4']){
    const r=rig(),destination=memory==='selector4'?0:1;
    init(r,`{name:'sustain edge',nodes:[designNode('source','lever',0,0),designNode('hold','sustain',288,0,{delay:2}),designNode('sink','${memory}',576,0)],wires:[designWire('feed',{node:'source',side:'out',index:0},{node:'hold',side:'in',index:0}),designWire('output',{node:'hold',side:'out',index:0},{node:'sink',side:'in',index:${destination}})]}`);
    r.run("nodeBy('source').on=true;simulate(false);simulate(true,100);");
    const before=r.json("({out:values.get('hold').out[0],input:values.get('sink').in["+destination+"],stored:nodeBy('sink').channel??nodeBy('sink').bits})");
    r.run("nodeBy('source').on=false;simulate(false);");
    const after=r.json("({out:values.get('hold').out[0],input:values.get('sink').in["+destination+"],stored:nodeBy('sink').channel??nodeBy('sink').bits})");
    assert.equal(before.out,true);assert.equal(after.out,true);
    assert.equal(before.input,true);assert.equal(after.input,true);
    assert.deepEqual(after.stored,before.stored,memory+' counted a hidden second rising edge');
    r.run('simulate(true,400)');assert.equal(r.run("values.get('hold').out[0]"),false);
  }
});

test('wires touching the same component nub conduct as one network',()=>{
  const r=rig();init(r,`{name:'shared nub',nodes:[designNode('source','lever',-384,0,{on:true}),designNode('nub','lever',0,0)],wires:[]}`);
  r.run(`const p=portPosition(nodeBy('nub'),'out',0);model.wires.push(designWire('horizontal',{node:'source',side:'out',index:0},{x:p.x+192,y:p.y}),designWire('vertical',{x:p.x,y:p.y-192},{x:p.x,y:p.y+192}));simulate(false);`);
  assert.equal(r.run("wireNetworks().byWire.get('horizontal')===wireNetworks().byWire.get('vertical')"),true);
  assert.equal(r.run("networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id).out]))).powered.get(wireNetworks().byWire.get('vertical'))"),true);
});

test('selected wire diagnostics list every connected output and its live state',()=>{
  const r=rig();init(r,`{name:'wire sources',nodes:[designNode('a','lever',0,0,{label:'A',on:true}),designNode('b','lever',0,192,{label:'B',on:false})],wires:[designWire('first',{node:'a',side:'out',index:0},{x:300,y:144}),designWire('second',{node:'b',side:'out',index:0},{x:300,y:144})]}`);
  let detail=r.json("wirePowerDetails('first')");
  assert.equal(detail.powered,true);
  assert.deepEqual(detail.sources.map(s=>[s.label,s.active]),[['A',true],['B',false]]);
  r.run("nodeBy('a').on=false;nodeBy('b').on=true;simulate(false)");
  detail=r.json("wirePowerDetails('second')");
  assert.equal(detail.powered,true);
  assert.deepEqual(detail.sources.map(s=>[s.label,s.active]),[['A',false],['B',true]]);
  r.run("nodeBy('b').on=false;simulate(false)");
  assert.equal(r.json("wirePowerDetails('first')").powered,false);
});

test('selected-wire popup renders changing sources without changing the circuit',()=>{
  const r=rig();init(r,`{name:'wire popup',nodes:[designNode('source','lever',0,0,{label:'Source',on:true})],wires:[designWire('lead',{node:'source',side:'out',index:0},{x:288,y:48})]}`);
  r.run("document.createElement=()=>({textContent:'',className:'',children:[],append(...items){this.children.push(...items)}});const box=$('wire-inspector');box.children=[];box.replaceChildren=function(){this.children=[]};box.append=function(...items){this.children.push(...items)};selected={kind:'wire',id:'lead'};selectedWires=new Set(['lead']);renderWireInspector();");
  assert.deepEqual(r.json("$('wire-inspector').children.map(item=>item.textContent)"),['Selected wire · On','Any active source on this connected network keeps the wire on.','']);
  assert.match(r.run("$('wire-inspector').children[2].children[0].textContent"),/On · Source · Out/);
  r.run("nodeBy('source').on=false;simulate(false);renderWireInspector()");
  assert.equal(r.run("$('wire-inspector').children[0].textContent"),'Selected wire · Off');
  assert.match(r.run("$('wire-inspector').children[2].children[0].textContent"),/Off · Source · Out/);
});

test('unsettled inverter feedback is disclosed and independent of disconnected parts',()=>{
  const r=rig();init(r,`{name:'inverter loop',nodes:[designNode('g','inverter',0,0)],wires:[designWire('feedback',{node:'g',side:'out',index:0},{node:'g',side:'in',index:0},[{x:144,y:48},{x:144,y:-48},{x:-48,y:-48},{x:-48,y:48}])]}`);
  assert.equal(r.run("values.get('g').unstable"),true);
  assert.equal(r.json("wirePowerDetails('feedback')").sources[0].unstable,true);
  r.run("model.nodes.push(designNode('disconnected','lever',2000,2000));simulate(false);");
  assert.equal(r.run("values.get('g').unstable"),true);
  r.run("model.wires=[];simulate(false);");
  assert.equal(r.run("!!values.get('g').unstable"),false);
  assert.equal(r.run("values.get('g').out[0]"),true);
});

test('the large built-in circuits settle without false instability warnings',()=>{
  const r=rig();
  for(const id of ['calculator-0-0','eight-bit-adder-bench','counter-0-15','traffic-light-controller','pong-solo']){
    init(r,`structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'))`);
    assert.equal(r.run('[...values.values()].filter(value=>value.unstable).length'),0,id);
  }
});

test('linked latch selection is invariant to splitting or freeing a wire endpoint',()=>{
  const state=variant=>{
    const r=rig();init(r,"structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='sr-latch-linked'))");
    if(variant==='loose')r.run("const w=model.wires.find(w=>w.id==='top-feed');w.to=portPosition(nodeBy(w.to.node),w.to.side||'in',w.to.index);");
    if(variant==='split')r.run("const w=model.wires.find(w=>w.id==='top-feed'),points=wireEnds(w),target=w.to;w.to={...points[1]};w.points=[];model.wires.push(designWire('continued',points[1],target,points.slice(2,-1)));");
    r.run("simulate(false);pressButton(nodeBy('top'));simulate(true,800);");
    return r.json("values.get('latch').out");
  };
  const original=state('original');assert.deepEqual(original,[false,true]);
  assert.deepEqual(state('loose'),original);assert.deepEqual(state('split'),original);
});

test('linked latch output does not depend on simulation frame size',()=>{
  const run=steps=>{
    const r=rig();init(r,`{name:'two pulses',nodes:[designNode('source','lever',0,0,{on:true}),designNode('delay','delay',300,0,{delay:1}),designNode('latch','srLatch',700,0)],wires:[designWire('input',{node:'source',side:'out',index:0},{node:'delay',side:'in',index:0}),designWire('to-latch',{node:'delay',side:'out',index:0},{node:'latch',side:'in',index:0}),designWire('link',{node:'latch',side:'in',index:0},{node:'latch',side:'in',index:1})]}`);
    r.run("simulate(true,50);nodeBy('source').on=false;simulate(false);simulate(true,150);nodeBy('source').on=true;simulate(false);simulate(true,25);nodeBy('source').on=false;simulate(false);");
    for(const step of steps)r.run(`simulate(true,${step})`);
    return r.json("({out:values.get('latch').out,selected:latchStates.get('latch').selected,releaseUntil:latchStates.get('latch').releaseUntil})");
  };
  assert.deepEqual(run([200,200,50]),run(Array(45).fill(10)));
});

test('an unrelated preset and undo preserve an established latch',()=>{
  const r=rig();init(r,"structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='sr-latch'))");
  r.run("pressButton(nodeBy('bottom'));simulate(true,800);");
  assert.deepEqual(r.json("values.get('latch').out"),[false,true]);
  r.run("checkpoint();const copy=designCopy(BUILT_IN_DESIGNS.find(d=>d.id==='crossing-wires'));model={...model,nodes:[...model.nodes,...copy.nodes],wires:[...model.wires,...copy.wires]};simulate(false);");
  assert.deepEqual(r.json("values.get('latch').out"),[false,true]);
  r.run('undo()');assert.deepEqual(r.json("values.get('latch').out"),[false,true]);
});

test('a saved project restores its latch and pending delay timing',()=>{
  const storage=new Map(),r=rig(storage);
  r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='sr-latch'));projects=[{id:'p',model,view:{x:0,y:0,scale:1},running:false,open:true}];activeProjectId='p';running=false;simulate(false);pressButton(nodeBy('bottom'));simulate(true,800);persistProjects();");
  const restored=rig(storage);restored.run('initializeProjects()');
  assert.deepEqual(restored.json("values.get('latch').out"),[false,true]);
  assert.equal(restored.run('running'),false);
});

test('Reset inputs clears a persisted latch selection and can be undone',()=>{
  const r=rig();init(r,"structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='sr-latch'))");
  r.run("pressButton(nodeBy('bottom'));simulate(true,800)");
  assert.deepEqual(r.json("values.get('latch').out"),[false,true]);
  r.run('resetInputs()');
  assert.deepEqual(r.json("values.get('latch').out"),[true,false]);
  r.run('undo()');
  assert.deepEqual(r.json("values.get('latch').out"),[false,true]);
});

test('reload retains a pending delay transition at its remaining time',()=>{
  const storage=new Map(),r=rig(storage);
  r.run("model={name:'pending',nodes:[designNode('source','lever',0,0,{on:true}),designNode('timer','delay',288,0,{delay:4})],wires:[designWire('input',{node:'source',side:'out',index:0},{node:'timer',side:'in',index:0})]};projects=[{id:'p',model,view:{x:0,y:0,scale:1},running:true,open:true}];activeProjectId='p';resetTiming();simulate(false);simulate(true,300);persistProjects();");
  const restored=rig(storage);restored.run('initializeProjects()');
  assert.equal(restored.run('simulationMs'),300);
  assert.equal(restored.run("values.get('timer').out[0]"),false);
  restored.run('simulate(true,499)');assert.equal(restored.run("values.get('timer').out[0]"),false);
  restored.run('simulate(true,1)');assert.equal(restored.run("values.get('timer').out[0]"),true);
});

test('malformed saved timing state cannot stop a project from loading',()=>{
  const storage=new Map(),r=rig(storage);
  r.run("model={name:'saved',nodes:[designNode('source','lever',0,0,{on:true}),designNode('timer','delay',288,0,{delay:2})],wires:[designWire('feed',{node:'source',side:'out',index:0},{node:'timer',side:'in',index:0})]};projects=[{id:'p',model,view:{x:0,y:0,scale:1},running:true,open:true}];activeProjectId='p';persistProjects();");
  const key=r.run('PROJECTS_KEY'),saved=JSON.parse(storage.get(key));
  saved.projects[0].session.circuitBuffers=[['timer',{input:true}]];
  saved.projects[0].session.buttonPulses=[['source','not a time']];
  storage.set(key,JSON.stringify(saved));
  const restored=rig(storage);
  assert.doesNotThrow(()=>restored.run('initializeProjects();simulate(true,1000)'));
  assert.equal(restored.run("values.get('timer').out[0]"),true);
});
