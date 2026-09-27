const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function app(){
  const frames=new Map();let next=0;
  const ctx=vm.createContext({structuredClone,crypto:{randomUUID:()=>String(++next)},document:{getElementById:()=>({hidden:true,style:{setProperty(){}},classList:{remove(){}}})},localStorage:{getItem:()=>null},requestAnimationFrame:cb=>{const id=++next;frames.set(id,cb);return id;},cancelAnimationFrame:id=>frames.delete(id)});
  vm.runInContext(source+';renderSelection=()=>{};paintTimingFaces=()=>{};',ctx);
  return {run:s=>vm.runInContext(s,ctx),frames};
}
test('mounted signal rendering stays live during pan without rebuilding geometry',()=>{
  const r=app();r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='wire-two-sources'));simulate(false);paintedModel=model;let updates=0;paintSignals=()=>updates++;renderSelection=()=>{throw Error('rebuild');};gesture={type:'pan'};model.nodes[0].on=true;simulate(false);");
  assert.equal(r.run('updates'),1);assert.equal(r.run('cameraVisualDirty'),false);
});
test('signal painter updates existing wire elements only when their power changes',()=>{
  const r=app();r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='wire-two-sources'));simulate(false);let writes=0;const path={classList:{toggle:()=>writes++}};paintedWires=[{id:'shared',paths:[path],active:false}];model.nodes[0].on=true;simulate(false);paintSignals();paintSignals();");
  assert.equal(r.run('writes'),1);assert.equal(r.run('paintedWires[0].paths[0]===path'),true);
  r.run('model.nodes[0].on=false;simulate(false);paintSignals();');assert.equal(r.run('writes'),2);
});
test('buffered visibility keeps crossing wires with offscreen endpoints and pins selected wires',()=>{
  const r=app();r.run("model={nodes:[],wires:[]};paintedModel=model;viewportSize={w:800,h:600};view={x:0,y:0,scale:1};const make=(id,points)=>({id,points,paths:[{style:{}}],group:{style:{}}});paintedWires=[make('cross',[{x:-1000,y:300},{x:2000,y:300}]),make('far',[{x:3000,y:3000},{x:3100,y:3100}])];updateRenderWindow(true);");
  assert.equal(r.run("paintedWires[0].paths[0].style.display"),'');assert.equal(r.run("paintedWires[1].paths[0].style.display"),'none');
  r.run("selectedWires.add('far');updateRenderWindow(true);");assert.equal(r.run("paintedWires[1].group.style.display"),'');
  r.run("const windowBefore=renderWindow;view.x=50;updateRenderWindow();");assert.equal(r.run('windowBefore===renderWindow'),true);
  r.run("view.x=-3000;view.y=-3000;updateRenderWindow();");assert.equal(r.run("paintedWires[1].paths[0].style.display"),'');
});
test('many mouse events queue one camera frame without measuring layout or rebuilding wires',()=>{
  const r=app();
  r.run("gesture={type:'pan',orig:{x:100,y:200},start:{x:10,y:20}};screenToWorld=()=>{throw Error('unnecessary layout read');};renderWires=()=>{throw Error('unnecessary wire rebuild');};for(let i=0;i<100;i++)onPointerMove({clientX:10+i,clientY:20+i});");
  assert.equal(r.frames.size,1);assert.equal(r.run('view.x'),199);
  const callback=[...r.frames.values()][0];r.frames.clear();callback();
  assert.match(r.run('els.world.style.transform'),/translate\(199px, 299px\)/);
  r.run("onPointerMove({clientX:200,clientY:300});onPointerUp({type:'pointerup',clientX:210,clientY:310});");
  assert.equal(r.frames.size,0);assert.equal(r.run('gesture'),null);
  assert.match(r.run('els.world.style.transform'),/translate\(300px, 490px\)/);
});
test('panning moves grid layers without changing their tile sizes',()=>{
  const r=app();
  r.run("view={x:-31,y:52,scale:.75};applyView();globalThis.gridResizes=0;for(const id of ['circuit-grid','wire-grid'])els[id].style.setProperty=()=>gridResizes++;gesture={type:'pan',orig:{x:view.x,y:view.y},start:{x:0,y:0}};for(let i=0;i<20;i++)onPointerMove({clientX:i*3,clientY:i*2});");
  assert.equal(r.frames.size,1);
  [...r.frames.values()][0]();
  assert.equal(r.run('gridResizes'),0);
  assert.match(r.run("els['circuit-grid'].style.transform"),/^translate3d\(/);
  assert.equal(r.run("gridPhase(-31,36)"),5);
  assert.equal(r.run("gridPhase(52,36)"),16);
});
test('rapid zoom events keep their cursor anchor and paint only once',()=>{
  const r=app();
  r.run("els.viewport.getBoundingClientRect=()=>({left:20,top:30});view={x:40,y:-10,scale:1};applyView();globalThis.anchor=(150-20-view.x)/view.scale;zoomAt(1.1,150,100);zoomAt(1.1,150,100);zoomAt(1.1,150,100);");
  assert.equal(r.frames.size,1);
  assert.ok(Math.abs(r.run('view.scale')-1.331)<1e-12);
  assert.ok(Math.abs(r.run('(150-20-view.x)/view.scale-anchor'))<1e-12);
  [...r.frames.values()][0]();
  assert.match(r.run('els.world.style.transform'),/scale\(1\.331/);
});
test('ending a pan redraws wires only if a signal changed while moving',()=>{
  const r=app();
  r.run("globalThis.redraws=0;renderSelection=()=>redraws++;paintTimingFaces=()=>{};model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='wire-two-sources'));simulate(false);redraws=0;gesture={type:'pan',orig:{x:0,y:0},start:{x:0,y:0}};onPointerUp({type:'pointerup',clientX:0,clientY:0});");
  assert.equal(r.run('redraws'),0);
  r.run("gesture={type:'pan',orig:{x:0,y:0},start:{x:0,y:0}};model.nodes[0].on=true;simulate(false);");
  assert.equal(r.run('redraws'),0);
  r.run("onPointerUp({type:'pointerup',clientX:0,clientY:0});");
  assert.equal(r.run('redraws'),1);
});
test('steady simulation and panning reuse connections, physical edits rebuild them',()=>{
  const r=app();r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='wire-two-sources'));const original=wireNetworks();view.x+=100;model.nodes[0].on=true;simulate(false);");
  assert.equal(r.run('wireNetworks()===original'),true);
  assert.equal(r.run("values.get('witness').out[0]"),true);
  r.run("model.wires.find(w=>w.id==='shared').from.x+=48;simulate(false);");
  assert.equal(r.run('wireNetworks()===original'),false);assert.equal(r.run("values.get('witness').out[0]"),false);
  r.run('const after=wireNetworks();model.nodes[0].rotation=90;');
  assert.equal(r.run('wireNetworks()===after'),false);
});
test('unchanged large circuits do no repeated geometric connection tests',()=>{
  const r=app();
  r.run("model={name:'load',nodes:[],wires:[]};for(let i=0;i<80;i++){model.nodes.push(designNode('l'+i,'lever',i*144,0));model.wires.push(designWire('w'+i,{node:'l'+i,side:'out',index:0},{x:i*144+24,y:192}));}simulate(false);let checks=0;const oldOnWire=onWire;onWire=(...args)=>{checks++;return oldOnWire(...args);};for(let i=0;i<25;i++)simulate(true,20);");
  assert.equal(r.run('checks'),0);
  assert.equal(r.run('simulationMs'),500);
});
