const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
function rig(){
  const elements=new Map();
  const element=()=>({hidden:true,style:{},children:[],attrs:{},focus(){},setAttribute(k,v){this.attrs[k]=v;},append(...children){this.children.push(...children);},replaceChildren(){this.children=[];},querySelector(){return this.children[0];},getBoundingClientRect(){return {width:220,height:220};}});
  const getElementById=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const ctx=vm.createContext({structuredClone,crypto:require('node:crypto').webcrypto,document:{getElementById,createElement:element},window:{innerWidth:800,innerHeight:600},localStorage:{getItem:()=>null}});
  const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
  vm.runInContext(source+`;renderSelection=()=>{};renderWires=()=>{};save=()=>{};updateHistory=()=>{};changed=()=>{};model={name:'ends',nodes:[designNode('a','lever',0,0),designNode('b','and',288,0)],wires:[designWire('w',{node:'a',index:0},{node:'b',index:0},[{x:120,y:160}],'neon','Blue')]};`,ctx);
  return {run:s=>vm.runInContext(s,ctx),json:s=>JSON.parse(vm.runInContext('JSON.stringify('+s+')',ctx))};
}
test('point menu only opens for the selected wire and Move picks up its endpoint without mutating it',()=>{
  const r=rig(),before=r.json('model');
  r.run("openWirePointMenu('w',{end:'from'},10,20);");assert.equal(r.run('wirePointMenu'),null);
  r.run("selectOnly('wire','w');openWirePointMenu('w',{end:'from'},10,20);");
  assert.equal(r.run('draft'),null);
  assert.equal(r.run('wirePointMenu.end'),'from');
  assert.deepEqual(r.json("$('wire-point-menu').children.map(x=>x.textContent)"),['Move endpoint','Start branch here','Delete endpoint']);
  r.run("$('wire-point-menu').children[0].onclick();");
  assert.equal(r.run('draft.editing'),'w');assert.deepEqual(r.json('model'),before);
  assert.equal(r.run('wirePointMenu'),null);
  r.run('cancelWire()');assert.deepEqual(r.json('model'),before);assert.equal(r.run('history.length'),0);
});

test('deleting either endpoint trims only its last segment and preserves finish, opposite end and undo',()=>{
  for(const end of ['from','to'])for(const loose of [true,false]){
    const r=rig();r.run("model.wires[0].points.push({x:200,y:160});");
    if(loose)r.run(`model.wires[0].${end}={x:500,y:600};`);
    const before=r.json('model.wires[0]');
    r.run(`deleteWirePoint({id:'w',end:'${end}'});`);
    const after=r.json('model.wires[0]');
    assert.deepEqual(after[end],end==='from'?before.points[0]:before.points.at(-1));
    assert.deepEqual(after.points,end==='from'?before.points.slice(1):before.points.slice(0,-1));
    assert.deepEqual(after[end==='from'?'to':'from'],before[end==='from'?'to':'from']);
    assert.equal(after.style,before.style);assert.equal(after.color,before.color);
    assert.deepEqual(r.json('history[0].wires[0]'),before);assert.equal(r.run('valid(model)'),true);
  }
});

test('deleting a no-bend endpoint clearly offers whole-wire deletion and leaves other wires alone',()=>{
  const r=rig();r.run("model.wires[0].points=[];model.wires.push({...clone(model.wires[0]),id:'other'});selectOnly('wire','w');openWirePointMenu('w',{end:'to'},790,590);");
  assert.equal(r.run("$('wire-point-menu').children.at(-1).textContent"),'Delete endpoint & wire');
  r.run("$('wire-point-menu').children.at(-1).onclick();");
  assert.deepEqual(r.json('model.wires.map(w=>w.id)'),['other']);assert.equal(r.run('history[0].wires.length'),2);
});

test('bend menu supports click-to-place and Escape without changing other wire points or endpoints',()=>{
  const r=rig(),before=r.json('model.wires[0]');
  r.run("selectOnly('wire','w');openWirePointMenu('w',{index:0},100,200);");
  assert.deepEqual(r.json("$('wire-point-menu').children.map(x=>x.textContent)"),['Move bend','Start branch here','Delete bend']);
  r.run("$('wire-point-menu').children[0].onclick();draft.points[0]={x:200,y:300};");
  assert.deepEqual(r.json('model.wires[0]'),before);
  r.run('cancelWire()');assert.deepEqual(r.json('model.wires[0]'),before);assert.equal(r.run('history.length'),0);
  r.run("startBendEdit('w',0);draft.points[0]={x:200,y:300};finishWire();");
  assert.deepEqual(r.json('model.wires[0].points'),[{x:200,y:300}]);
  assert.deepEqual(r.json('model.wires[0].from'),before.from);assert.deepEqual(r.json('model.wires[0].to'),before.to);
  assert.deepEqual(r.json('history[0].wires[0]'),before);
});
test('shared junction has its own move action and moves the trunk and branch together',()=>{
  const r=rig();
  r.run("model={name:'fork',nodes:[],wires:[{id:'trunk',from:{x:0,y:0},to:{x:200,y:0},points:[]},{id:'branch',from:{x:100,y:0},to:{x:100,y:100},points:[]}]};selectOnly('wire','branch');");
  const before=r.json('model');
  r.run("openWirePointMenu('branch',{end:'from'},100,100);");
  assert.equal(r.json("$('wire-point-menu').children.map(x=>x.textContent)").includes('Move junction & branches'),true);
  r.run("$('wire-point-menu').children[1].onclick();");
  assert.deepEqual(r.json('model'),before);
  r.run('cancelWire()');
  assert.deepEqual(r.json('model'),before);
  assert.equal(r.run("moveJunction('branch',{x:100,y:0},{x:100,y:48})"),true);
  assert.equal(r.run('wireNetworks().groups.size'),1);
  assert.equal(r.run('model.wires.every(w=>onWire({x:100,y:48},wireEnds(w)))'),true);
  assert.deepEqual(r.json('history.at(-1)'),before);
});

test('wire snapping uses subdivisions of the part grid and exact axes for unusual ports',()=>{
  const r=rig();r.run('gridSnap=true;');
  assert.equal(r.run('GRID_SIZE'),12);
  assert.deepEqual(r.json('snapPoint({x:23,y:71})'),{x:24,y:72});
  r.run("model.nodes.push(designNode('special','converter14',576,0));model.wires[0].to={node:'special',side:'in',index:0};selectOnly('wire','w');");
  assert.deepEqual(r.json('portPosition(nodeBy("special"),"in",0)'),{x:576,y:16});
  assert.deepEqual(r.json('snapPoint({x:579,y:18})'),{x:576,y:16});
  r.run('gridSnap=false;');
  assert.deepEqual(r.json('snapPoint({x:579,y:18})'),{x:579,y:18});
});

test('free endpoints offer continuation, branching retains attached-port identity, and selection changes dismiss menu',()=>{
  const r=rig();r.run("model.wires[0].to={x:500,y:400};selectOnly('wire','w');openWirePointMenu('w',{end:'to'},100,200);");
  assert.equal(r.run("$('wire-point-menu').children[1].textContent"),'Continue wire');
  r.run("$('wire-point-menu').children[1].onclick();");assert.deepEqual(r.json('draft.anchor'),{x:500,y:400});r.run('cancelWire()');
  r.run("openWirePointMenu('w',{end:'from'},100,200);$('wire-point-menu').children[1].onclick();");
  assert.deepEqual(r.json('draft.anchor'),{node:'a',side:'out',index:0});r.run('cancelWire()');
  r.run("openWirePointMenu('w',{end:'to'},100,200);selectOnly('node','a');");assert.equal(r.run('wirePointMenu'),null);assert.equal(r.run("$('wire-point-menu').hidden"),true);
});

test('menu stays inside screen edges without scaling with canvas zoom',()=>{
  const r=rig();assert.deepEqual(r.json('menuPosition(790,590,220,220,800,600)'),{x:572,y:372});
  assert.deepEqual(r.json('menuPosition(-20,-40,220,220,800,600)'),{x:8,y:8});
  assert.deepEqual(r.json('menuPosition(100,200,220,220,800,600)'),{x:112,y:212});
});
test('detach either endpoint while retaining bends, style, opposite end and undo snapshot',()=>{
  for(const end of ['from','to']){
    const r=rig(),before=r.json('model.wires[0]');
    r.run(`startEndpointEdit('w','${end}');finishWireAt({x:240,y:300});`);
    const after=r.json('model.wires[0]');assert.deepEqual(after[end],{x:240,y:300});
    assert.deepEqual(after[end==='from'?'to':'from'],before[end==='from'?'to':'from']);
    assert.deepEqual(after.points,before.points);assert.equal(after.color,'Blue');assert.equal(after.style,'neon');
    assert.equal(r.run('model.wires.length'),1);assert.deepEqual(r.json('history[0].wires[0]'),before);
  }
});
test('loose endpoints reconnect to input or output ports without reversing the wire',()=>{
  const r=rig();r.run("model.wires[0].to={x:500,y:500};startEndpointEdit('w','to');clickPort('a','out',0);");
  assert.deepEqual(r.json('model.wires[0].to'),{node:'a',side:'out',index:0});
  r.run("startEndpointEdit('w','to');clickPort('b','in',1);");
  assert.deepEqual(r.json('model.wires[0].to'),{node:'b',side:'in',index:1});assert.equal(r.run('valid(model)'),true);
});
