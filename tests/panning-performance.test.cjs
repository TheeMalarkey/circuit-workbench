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
  const r=app();r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='wire-two-sources'));simulate(false);let writes=0;const path={classList:{toggle:()=>writes++}};paintedWires=[{id:'shared',paths:[path],active:false,unstable:false}];model.nodes[0].on=true;simulate(false);paintSignals();paintSignals();");
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

test('wire drawing pieces preserve every command and bound distant filtered runs separately',()=>{
  const r=app();
  const original='M -10 0 L -10 5000 M 5000 0 L 5010 0 Q 5014 -8 5018 0 L 5020 0';
  const pieces=JSON.parse(r.run(`JSON.stringify(wireRenderPieces(${JSON.stringify(original)}))`));
  assert.equal(pieces.map(p=>p.d).join(' '),original);
  assert.equal(pieces.length,2);
  assert.equal(pieces[1].bounds.y,-24,'crossing curve and glow stay inside the visible bounds');
  const area=pieces.reduce((sum,p)=>sum+p.bounds.w*p.bounds.h,0);
  assert.ok(area<5030*5000/100,'filter surfaces omit the huge empty rectangle between runs');
  assert.equal(r.run("wireRenderPieces('M 0 0 L 10 0 M 0 12 L 10 12').length"),1,'compact runs stay batched to avoid extra drawing elements');
});

test('an offscreen run is culled even when another run of the same wire is visible',()=>{
  const r=app();r.run(`model={nodes:[],wires:[]};paintedModel=model;viewportSize={w:800,h:600};view={x:0,y:0,scale:1};
    paintedWires=[{id:'long',points:[{x:10,y:10},{x:10,y:5000},{x:5000,y:5000}],group:{style:{}},paths:[
      {style:{},wireBounds:{x:0,y:0,w:30,h:5000}},
      {style:{},wireBounds:{x:0,y:4990,w:5020,h:30}}]}];updateRenderWindow(true);`);
  assert.equal(r.run('paintedWires[0].paths[0].style.display'),'');
  assert.equal(r.run('paintedWires[0].paths[1].style.display'),'none');
  assert.equal(r.run('paintedWires[0].group.style.display'),'');
  r.run("selectedWires.add('long');updateRenderWindow(true)");
  assert.equal(r.run('paintedWires[0].paths[1].style.display'),'');
});
test('visibility refreshes write only real node, hit target, path and junction transitions',()=>{
  const r=app();r.run(`
    let visibilityWrites=0;
    function visibilityElement(){let display;return {contains:()=>false,style:{get display(){return display},set display(value){visibilityWrites++;display=value}}};}
    model={nodes:[designNode('near','lever',0,0),designNode('far','lever',4000,4000)],wires:[]};
    paintedModel=model;viewportSize={w:800,h:600};view={x:0,y:0,scale:1};
    paintedNodes=new Map(model.nodes.map(n=>[n.id,{el:visibilityElement()}]));
    paintedWires=[
      {id:'near',points:[{x:10,y:20},{x:300,y:20}],group:visibilityElement(),paths:[visibilityElement()]},
      {id:'far',points:[{x:4000,y:4000},{x:4200,y:4000}],group:visibilityElement(),paths:[visibilityElement(),visibilityElement()]}
    ];
    for(const entry of paintedWires)entry.cullBounds=wireVisibilityBounds(entry);
    paintedJunctions=[{x:100,y:20,el:visibilityElement()},{x:4100,y:4000,el:visibilityElement()}];
    updateRenderWindow(true);globalThis.initialVisibilityWrites=visibilityWrites;visibilityWrites=0;
    updateRenderWindow(true);view.x=50;updateRenderWindow();updateRenderWindow(true);
  `);
  assert.equal(r.run('initialVisibilityWrites'),9,'every freshly mounted element gets its initial visibility');
  assert.equal(r.run('visibilityWrites'),0,'repeat checks must not reassign unchanged display styles');
  r.run(`view.x=-4000;view.y=-4000;updateRenderWindow(true);`);
  assert.equal(r.run('visibilityWrites'),9,'only the newly hidden or revealed elements change');
  assert.equal(r.run("paintedNodes.get('near').el.style.display"),'none');
  assert.equal(r.run("paintedNodes.get('far').el.style.display"),'');
  assert.equal(r.run('paintedWires[1].group.style.display'),'');
  assert.equal(r.run("paintedWires[1].paths.every(path=>path.style.display==='')"),true);
  assert.equal(r.run('paintedJunctions[1].el.style.display'),'');
});

test('offscreen selected and focused elements remain pinned and unpin without stale visibility',()=>{
  const r=app();r.run(`
    const focusedControl={};document.activeElement=null;
    model={nodes:[designNode('selected','lever',4000,4000),designNode('focused','and',5000,5000)],wires:[]};
    paintedModel=model;viewportSize={w:800,h:600};view={x:0,y:0,scale:1};
    paintedNodes=new Map(model.nodes.map(n=>[n.id,{el:{style:{},contains:el=>n.id==='focused'&&el===focusedControl}}]));
    paintedWires=[{id:'wire',points:[{x:4000,y:4000},{x:5000,y:5000}],group:{style:{}},paths:[{style:{},wireBounds:{x:4000,y:4000,w:1000,h:1000}}]}];
    paintedWires[0].cullBounds=wireVisibilityBounds(paintedWires[0]);
    updateRenderWindow(true);selectedNodes.add('selected');selectedWires.add('wire');document.activeElement=focusedControl;updateRenderWindow(true);
  `);
  assert.equal(r.run("[...paintedNodes.values()].every(entry=>entry.el.style.display==='')"),true);
  assert.equal(r.run("paintedWires[0].group.style.display===''&&paintedWires[0].paths[0].style.display===''") ,true);
  r.run(`selectedNodes.clear();selectedWires.clear();document.activeElement=null;updateRenderWindow(true);`);
  assert.equal(r.run("[...paintedNodes.values()].every(entry=>entry.el.style.display==='none')"),true);
  assert.equal(r.run("paintedWires[0].group.style.display==='none'&&paintedWires[0].paths[0].style.display==='none'"),true);
});

test('visibility broadphase preserves exact diagonal and boundary crossings and observes uncached point edits',()=>{
  const r=app();r.run(`
    model={nodes:[],wires:[]};paintedModel=model;viewportSize={w:800,h:600};view={x:0,y:0,scale:1};
    const area={x:-320,y:-320,w:1440,h:1240};
    const cases=[
      [{x:-2000,y:300},{x:2000,y:300}],
      [{x:-2000,y:-320},{x:2000,y:-320}],
      [{x:-2000,y:-321},{x:2000,y:-321}],
      [{x:-400,y:-310},{x:-310,y:-400}],
      [{x:-400,y:-240},{x:-240,y:-400}],
      [{x:1120,y:-400},{x:1120,y:1000}],
      [{x:4000,y:4000},{x:5000,y:5000}]
    ];
    paintedWires=cases.map((points,id)=>({id:String(id),points,group:{style:{}},paths:[{style:{}}]}));
    const expected=cases.map(points=>segmentHitsRect(points[0],points[1],area));
    updateRenderWindow(true);globalThis.actual=paintedWires.map(entry=>entry.group.style.display==='');
    paintedWires[6].points[0].x=0;paintedWires[6].points[0].y=0;updateRenderWindow(true);
  `);
  assert.equal(r.run('JSON.stringify(actual)'),r.run('JSON.stringify(expected)'));
  assert.equal(r.run('paintedWires[6].group.style.display'),'','uncached entries keep observing their current point geometry');
});

test('visibility broadphase skips distant wires and their already-hidden pieces without a wire count limit',()=>{
  const r=app();r.run(`
    model={nodes:[],wires:[]};paintedModel=model;viewportSize={w:800,h:600};view={x:0,y:0,scale:1};
    paintedWires=Array.from({length:2605},(_,id)=>({id:String(id),points:[{x:4000+id,y:4000},{x:4000+id,y:8000}],group:{style:{}},paths:[{style:{}}]}));
    for(const entry of paintedWires)entry.cullBounds=wireVisibilityBounds(entry);
    let exactChecks=0;const exact=segmentHitsRect;segmentHitsRect=(...args)=>{exactChecks++;return exact(...args)};
    updateRenderWindow(true);globalThis.distantChecks=exactChecks;
    for(const entry of paintedWires)entry.paths=new Proxy(entry.paths,{get(target,key){if(key===Symbol.iterator)throw Error('revisited hidden pieces');return Reflect.get(target,key)}});
    paintedWires.push({id:'crossing',points:[{x:-2000,y:300},{x:2000,y:300}],group:{style:{}},paths:[{style:{}}]});
    updateRenderWindow(true);
  `);
  assert.equal(r.run('distantChecks'),0);
  assert.equal(r.run('exactChecks'),1,'only the potential crossing needs exact geometry');
  assert.equal(r.run('paintedWires.at(-1).group.style.display'),'');
  assert.equal(r.run("paintedWires.slice(0,-1).every(entry=>entry.group.style.display==='none')"),true);
});

test('whole-wire visibility bounds retain padded overpass glow independently of the hit target',()=>{
  const r=app();r.run(`
    model={nodes:[],wires:[]};paintedModel=model;viewportSize={w:800,h:600};view={x:0,y:0,scale:1};
    paintedWires=[{id:'bump',points:[{x:1140,y:100},{x:1140,y:200}],group:{style:{}},paths:[{style:{},wireBounds:{x:1110,y:84,w:60,h:132}}]}];
    paintedWires[0].cullBounds=wireVisibilityBounds(paintedWires[0]);updateRenderWindow(true);
  `);
  assert.equal(r.run('paintedWires[0].group.style.display'),'none','the centerline is outside the hit-test area');
  assert.equal(r.run('paintedWires[0].paths[0].style.display'),'','the sibling overpass/glow reaches into the padded visible area');
});

test('an offscreen powered wire reveals its current signal without waiting for another simulation change',()=>{
  const r=app();r.run(`
    model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='wire-two-sources'));simulate(false);
    paintedModel=model;viewportSize={w:800,h:600};view={x:0,y:0,scale:1};
    const classes=new Set(),path={style:{},classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name)}}};
    paintedWires=[{id:'shared',points:[{x:4000,y:4000},{x:4200,y:4000}],group:{style:{}},paths:[path],active:false,unstable:false}];
    paintedWires[0].cullBounds=wireVisibilityBounds(paintedWires[0]);updateRenderWindow(true);
    model.nodes[0].on=true;simulate(false);
  `);
  assert.equal(r.run('paintedWires[0].paths[0].style.display'),'none');
  assert.equal(r.run("classes.has('wire-active')"),true,'signal changes still update a hidden wire');
  r.run(`view.x=-4000;view.y=-4000;updateRenderWindow(true);`);
  assert.equal(r.run('paintedWires[0].paths[0].style.display'),'');
  assert.equal(r.run("classes.has('wire-active')"),true,'reveal does not resurrect stale signal paint');
});

test('selected trace pieces cull and reveal independently without touching selection or handles',()=>{
  const r=app();r.run(`
    model={nodes:[],wires:[]};paintedModel=model;viewportSize={w:800,h:600};view={x:0,y:0,scale:1};
    let traceWrites=0;function traceElement(){let display;return {style:{get display(){return display},set display(value){traceWrites++;display=value}}}}
    selectedWires.add('selected');
    paintedTraces=[
      {id:'selected',el:traceElement(),bounds:{x:-2000,y:100,w:4000,h:32}},
      {id:'selected',el:traceElement(),bounds:{x:4000,y:4000,w:500,h:32}}
    ];
    updateRenderWindow(true);traceWrites=0;updateRenderWindow(true);
  `);
  assert.equal(r.run('traceWrites'),0);
  assert.equal(r.run('paintedTraces[0].el.style.display'),'','a trace with offscreen endpoints still crosses the viewport');
  assert.equal(r.run('paintedTraces[1].el.style.display'),'none');
  r.run(`view.x=-4000;view.y=-4000;updateRenderWindow(true);`);
  assert.equal(r.run('traceWrites'),2,'hide the old trace run and reveal the new run exactly once');
  assert.equal(r.run('paintedTraces[0].el.style.display'),'none');
  assert.equal(r.run('paintedTraces[1].el.style.display'),'');
  assert.equal(r.run("selectedWires.has('selected')"),true,'culling must not alter circuit selection');
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
test('wheel zoom during a right-button pan does not snap back on the next move or release',()=>{
  const r=app();
  r.run(`els.viewport.getBoundingClientRect=()=>({left:0,top:0});
    view={x:100,y:80,scale:1};gesture={type:'pan',pointerId:7,start:{x:100,y:100},orig:{x:100,y:80},moved:true};
    onPointerMove({pointerId:7,pointerType:'mouse',clientX:160,clientY:140});
    zoomAt(1/1.1,160,140);globalThis.afterZoom={...view};
    onPointerMove({pointerId:7,pointerType:'mouse',clientX:160,clientY:140});`);
  assert.deepEqual(r.run('JSON.stringify(view)'),r.run('JSON.stringify(afterZoom)'));
  r.run('onPointerMove({pointerId:7,pointerType:"mouse",clientX:180,clientY:150});');
  assert.ok(Math.abs(r.run('view.x-afterZoom.x')-20)<1e-9);
  assert.ok(Math.abs(r.run('view.y-afterZoom.y')-10)<1e-9);
  r.run('onPointerUp({type:"pointerup",pointerId:7,pointerType:"mouse",clientX:180,clientY:150});');
  assert.ok(Math.abs(r.run('view.x-afterZoom.x')-20)<1e-9);
  assert.equal(r.run('gesture'),null);
});
test('the transformed circuit world is kept in a compositor layer',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../dist/styles.css'),'utf8');
  assert.match(css,/#world\s*\{\s*will-change\s*:\s*transform\s*\}/);
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
test('a steady timing frame does not solve unchanged signals',()=>{
  const r=app();
  r.run(`model={name:'steady',nodes:[designNode('switch','lever',0,0)],wires:[]};
    simulate(false);let settles=0,originalSettle=settleTiming;
    settleTiming=()=>{settles++;return originalSettle();};simulate(true,20);globalThis.settles=settles;`);
  assert.equal(r.run('settles'),0);
  assert.equal(r.run('simulationMs'),20);
});
