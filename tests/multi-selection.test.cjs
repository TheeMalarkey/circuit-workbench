const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];

function fixture(){
  let next=0;
  const ctx=vm.createContext({structuredClone,crypto:{randomUUID:()=>`new-${++next}`},document:{getElementById:()=>({})},localStorage:{getItem:()=>null}});
  vm.runInContext(source+'\nrenderSelection=()=>{};changed=()=>{};checkpoint=()=>{};setStatus=()=>{};',ctx);
  vm.runInContext(`model={name:'test',nodes:[
    {id:'a',type:'lever',x:0,y:0,rotation:0},
    {id:'b',type:'or',x:192,y:0,rotation:0},
    {id:'c',type:'and',x:480,y:0,rotation:0}
  ],wires:[
    {id:'internal',from:{node:'a',side:'out',index:0},to:{node:'b',side:'in',index:0},points:[{x:96,y:144}],style:'normal',color:'White'},
    {id:'external',from:{node:'b',side:'out',index:0},to:{node:'c',side:'in',index:0},points:[],style:'normal',color:'White'}
  ]};`,ctx);
  return ctx;
}

test('shift toggling and a repeated marquee remove items already selected',()=>{
  const c=fixture();
  vm.runInContext(`toggleSelection('node','a');toggleSelection('wire','internal');`,c);
  assert.equal(vm.runInContext('selectionSize()',c),2);
  vm.runInContext(`toggleSelection('node','a')`,c);
  assert.equal(vm.runInContext('selectedNodes.has("a")',c),false);
  const hits=vm.runInContext(`itemsInRect({x:-5,y:-5,w:300,h:160})`,c);
  assert.equal(hits.nodes.has('a'),true);
  assert.equal(hits.nodes.has('b'),true);
  assert.equal(hits.nodes.has('c'),false);
  assert.equal(hits.wires.has('internal'),true);
  assert.equal(hits.wires.has('external'),true); // its start is inside the box
  vm.runInContext(`for(const id of itemsInRect({x:-5,y:-5,w:300,h:160}).wires)toggleSelection('wire',id)`,c);
  assert.equal(vm.runInContext('selectedWires.has("internal")',c),false);
});

test('group movement keeps circuit spacing and bends together',()=>{
  const c=fixture();
  vm.runInContext(`toggleSelection('node','a');toggleSelection('node','b');
    var g={nodes:new Map(model.nodes.filter(n=>selectedNodes.has(n.id)).map(n=>[n.id,{x:n.x,y:n.y}])),
    wires:new Map(model.wires.filter(w=>movingWireIds().has(w.id)).map(w=>[w.id,{from:structuredClone(w.from),to:structuredClone(w.to),points:structuredClone(w.points),ends:wireEnds(w)}]))};
    moveGroup(g,96,96);`,c);
  const result=vm.runInContext('({nodes:model.nodes.map(n=>({id:n.id,x:n.x,y:n.y})),bend:model.wires[0].points[0],from:model.wires[0].from,to:model.wires[0].to})',c);
  assert.deepEqual(JSON.parse(JSON.stringify(result.nodes.map(n=>[n.x,n.y]))),[[96,96],[288,96],[480,0]]);
  assert.deepEqual({...result.bend},{x:192,y:240});
  assert.equal(result.from.node,'a');assert.equal(result.to.node,'b');
});

test('copying nodes includes internal wires and pasted copies have new endpoints',()=>{
  const c=fixture();
  vm.runInContext(`toggleSelection('node','a');toggleSelection('node','b');copySelection();pasteSelection();`,c);
  const result=vm.runInContext('({nodes:model.nodes,wires:model.wires,selectedNodes:[...selectedNodes],selectedWires:[...selectedWires]})',c);
  assert.equal(result.nodes.length,5);assert.equal(result.wires.length,3);
  assert.equal(result.selectedNodes.length,2);assert.equal(result.selectedWires.length,1);
  const pasted=result.wires[2];
  assert.equal(result.selectedNodes.includes(pasted.from.node),true);
  assert.equal(result.selectedNodes.includes(pasted.to.node),true);
  assert.equal(pasted.id!==result.wires[0].id,true);
});

test('copying a wire alone makes attached ends free instead of linking to originals',()=>{
  const c=fixture();
  vm.runInContext(`toggleSelection('wire','external');copySelection();pasteSelection();`,c);
  const result=vm.runInContext('model.wires.at(-1)',c);
  assert.equal(result.from.node,undefined);assert.equal(result.to.node,undefined);
  assert.equal(Number.isFinite(result.from.x)&&Number.isFinite(result.to.x),true);
});
