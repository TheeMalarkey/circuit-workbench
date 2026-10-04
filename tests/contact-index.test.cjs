const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];

function rig(){
  const element=()=>({hidden:true,replaceChildren(){}});
  const ctx=vm.createContext({structuredClone,crypto:{randomUUID:()=>''},document:{getElementById:element},localStorage:{getItem:()=>null}});
  vm.runInContext(source,ctx);
  const run=code=>vm.runInContext(code,ctx);
  run(`function originalContacts(){const matches=[];for(const source of model.nodes)for(const target of model.nodes){
    if(source.id===target.id)continue;
    PARTS[source.type].outputs.forEach((_,out)=>PARTS[target.type].inputs.forEach((__,input)=>{
      const a=portPosition(source,'out',out),b=portPosition(target,'in',input);
      if(Math.hypot(a.x-b.x,a.y-b.y)<0.01)matches.push({from:{node:source.id,index:out},to:{node:target.id,index:input}});
    }));
  }return matches;}`);
  return {run,json:code=>JSON.parse(run(`JSON.stringify(${code})`))};
}

test('indexed touching sockets preserve the exact contact list and ordering',()=>{
  const r=rig();
  for(const id of ['calculator-0-0','counter-0-15','decimal-keypad-4']){
    r.run(`model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'));`);
    assert.deepEqual(r.json('touchingPorts()'),r.json('originalContacts()'),id);
  }
  r.run(`model={name:'edge contacts',nodes:[
    designNode('source','lever',-120.25,-90.75),
    designNode('target','inverter',330,220,{rotation:90}),
    designNode('bystander','and',800,700)
  ],wires:[]};
  const out=portPosition(model.nodes[0],'out',0),input=portPosition(model.nodes[1],'in',0);
  model.nodes[1].x+=out.x-input.x;model.nodes[1].y+=out.y-input.y;`);
  for(const delta of [0,0.005,-0.005,0.01,0.015]){
    r.run(`model.nodes[1].x+=${delta}-(globalThis.previousDelta||0);globalThis.previousDelta=${delta};`);
    assert.deepEqual(r.json('touchingPorts()'),r.json('originalContacts()'),`offset ${delta}`);
  }
  r.run(`model={name:'many ports',nodes:[],wires:[]};
    for(let i=0;i<180;i++)model.nodes.push(designNode('n'+i,i%2?'fullAdder':'lever',(i%15)*144,(i/15|0)*192,{rotation:(i%4)*90}));`);
  assert.deepEqual(r.json('touchingPorts()'),r.json('originalContacts()'));
  r.run(`let calls=0,original=portPosition;portPosition=(...args)=>{calls++;return original(...args);};touchingPorts();globalThis.portCalls=calls;`);
  assert.ok(r.run('portCalls')<2500,'socket positions should be computed once, not once per node pair');
});

test('rendering nodes uses the already computed network contacts',()=>{
  const r=rig();
  r.run(`model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='wire-two-sources'));wireNetworks();
    touchingPorts=()=>{throw Error('recomputed contacts')};
    nodeElement=()=>({});renderNodes();`);
});

test('selection reuses existing node elements instead of replacing the circuit DOM',()=>{
  const r=rig();
  r.run(`model={name:'selection',nodes:[designNode('a','lever',0,0),designNode('b','and',240,0)],wires:[]};
    els.nodes.children=[];els.nodes.replacements=0;els.nodes.singleReplacements=0;
    els.nodes.replaceChildren=function(...children){this.children=children;this.replacements++};
    els.nodes.replaceChild=function(next,old){this.children[this.children.indexOf(old)]=next;this.singleReplacements++};
    globalThis.created=0;
    nodeElement=n=>{created++;return {dataset:{id:n.id},style:{},classList:{toggle(){}},querySelectorAll:()=>[]}};
    renderNodes();selectedNodes.add('a');renderNodes();model.nodes[0].x+=48;renderNodes();`);
  assert.equal(r.run('created'),2);
  assert.equal(r.run('els.nodes.replacements'),1);
  assert.equal(r.run('els.nodes.singleReplacements'),0);
  assert.equal(r.run('els.nodes.children[0].style.left'),'48px');
  r.run(`model.nodes[0].label='renamed';renderNodes();`);
  assert.equal(r.run('created'),3);
  assert.equal(r.run('els.nodes.singleReplacements'),1);
});

test('indexed wire networks match the original junction algorithm',()=>{
  const r=rig();
  r.run(`function originalWireNetworks(){
    const entries=model.wires.map(w=>({wire:w,points:wireEnds(w)})).filter(e=>e.points);
    const touches=(point,entry)=>entry.virtual?entry.points.some(p=>near(point,p)):onWire(point,entry.points);
    const parent=entries.map((_,i)=>i);
    const root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
    const join=(a,b)=>{parent[root(a)]=root(b);};
    for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
      const a=entries[i].points,b=entries[j].points;
      if(touches(a[0],entries[j])||touches(a.at(-1),entries[j])||touches(b[0],entries[i])||touches(b.at(-1),entries[i]))join(i,j);
    }
    const ports={in:[],out:[]};
    for(const n of model.nodes)for(const side of ['in','out'])PARTS[n.type][side==='in'?'inputs':'outputs'].forEach((_,index)=>ports[side].push({node:n.id,index,point:portPosition(n,side,index)}));
    for(const port of [...ports.in,...ports.out]){
      let first=-1;
      entries.forEach((entry,i)=>{if(!touches(port.point,entry))return;if(first<0)first=i;else join(first,i);});
    }
    const groups=new Map();entries.forEach((entry,i)=>{const id=root(i);if(!groups.has(id))groups.set(id,[]);groups.get(id).push(entry);});
    const inputs=new Map(),outputs=new Map();
    for(const [id,group] of groups){
      inputs.set(id,ports.in.filter(p=>group.some(e=>touches(p.point,e))));
      outputs.set(id,ports.out.filter(p=>group.some(e=>touches(p.point,e))));
    }
    return {groups,inputs,outputs,contacts:originalContacts()};
  }
  function canonicalNetwork(network){
    return [...network.groups].map(([id,group])=>({
      wires:group.map(e=>e.wire.id).sort(),
      inputs:network.inputs.get(id).map(p=>p.node+':'+p.index).sort(),
      outputs:network.outputs.get(id).map(p=>p.node+':'+p.index).sort()
    })).sort((a,b)=>a.wires[0].localeCompare(b.wires[0]));
  }`);
  for(const id of ['wire-two-sources','counter-0-15','decimal-keypad-4']){
    r.run(`model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'));`);
    assert.deepEqual(r.json('canonicalNetwork(wireNetworks())'),r.json('canonicalNetwork(originalWireNetworks())'),id);
  }
  r.run(`model={name:'crossings and far wires',nodes:[designNode('a','lever',0,0),designNode('b','and',192,0)],wires:[
    {id:'h',from:{x:-9600,y:80},to:{x:9600,y:80},points:[]},
    {id:'cross',from:{x:150,y:-900},to:{x:150,y:900},points:[]},
    {id:'junction',from:{x:0,y:80},to:{x:150,y:80},points:[]},
    {id:'diagonal',from:{x:-4000,y:-4000},to:{x:4000,y:4000},points:[]},
    {id:'isolated',from:{x:-2000,y:2000},to:{x:-1800,y:2000},points:[]}
  ]};`);
  assert.deepEqual(r.json('canonicalNetwork(wireNetworks())'),r.json('canonicalNetwork(originalWireNetworks())'));
});

test('long separated wires do not require checking every wire for every contact',()=>{
  const r=rig();
  r.run(`model={name:'long parallel paths',nodes:[],wires:[]};
    for(let i=0;i<160;i++)model.wires.push({id:'w'+i,from:{x:-100000,y:i*16+.25},to:{x:100000,y:i*16+.25},points:[]});
    let predicateCalls=0;const segmentOriginal=onSegment;
    onSegment=(...args)=>{predicateCalls++;return segmentOriginal(...args)};
    wireNetworks();`);
  assert.equal(r.run('wireNetworks().groups.size'),160,'parallel paths remain electrically separate');
  assert.ok(r.run('predicateCalls')<2000,'long-wire broad phase should inspect nearby segments, not all long wires');
});

test('segment bounds retain half-unit tolerance, zero-length segments and diagonal endpoints',()=>{
  const r=rig();
  r.run(`const entries=[
    {points:[{x:-100000,y:-.25},{x:100000,y:-.25}]},
    {points:[{x:20,y:-100000},{x:20,y:100000}]},
    {points:[{x:-10000,y:-10000},{x:10000,y:10000}]},
    {points:[{x:500,y:600},{x:500,y:600}]}
  ];const contactCandidates=wireContactIndex(entries);
  function hits(x,y){const p={x,y};return [...contactCandidates(p)].filter(i=>onWire(p,entries[i].points)).sort((a,b)=>a-b)}`);
  for(const [x,y,want] of [[-100000.5,-.25,[0]],[0,.25,[0,2]],[0,.251,[2]],[20.5,-300,[1]],[20.501,-300,[]],[10000.3,10000.3,[2]],[10000.4,10000.4,[]],[500.5,600,[3]],[500.501,600,[]]]){
    assert.deepEqual(r.json(`hits(${x},${y})`),want,`contact ${x},${y}`);
  }
});
