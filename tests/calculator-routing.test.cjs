const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
const {layoutAndRoute,worldPort}=require('../scripts/calculator-routing.cjs');
const {validateElectricalRouting,validateGeometryRouting}=require('../scripts/check-calculator-routing.cjs');
const {buildCalculator}=require('../scripts/build-calculator.cjs');
test('baked calculator matches its intended electrical graph and keeps every route clear',()=>{
 const ctx=loadApp(),design=vm.runInContext('CALCULATOR_DESIGN',ctx),intended=buildCalculator();
 assert.equal(design.wires.length,intended._edges.length,'baked graph is current');
 const electrical=validateElectricalRouting(design,intended._edges,ctx),geometry=validateGeometryRouting(design,ctx);
 assert.equal(electrical.wires,2605);assert.equal(geometry.geometryFailures,0);
});
test('calculator shelf router preserves fixed controls, avoids boards and separates independent tracks',()=>{
 const ctx=loadApp(),footprint=vm.runInContext('footprint',ctx),localPort=vm.runInContext('localPort',ctx);
 const nodes=[{id:'a',type:'button',x:0,y:0,_fixed:true},{id:'b',type:'button',x:96,y:0,_fixed:true},{id:'key-below',type:'button',x:0,y:144,_fixed:true}];
 const edges=[],out=(id,index=0)=>({node:id,side:'out',index}),input=(id,index=0)=>({node:id,side:'in',index});
 for(let i=0;i<60;i++){const id=`gate-${i}`;nodes.push({id,type:i%5?'and':'fullAdder',_section:i<30?'first':'second'});edges.push({from:out(i<2?i?'b':'a':`gate-${i-2}`),to:input(id)});if(i)edges.push({from:out(i%2?'a':'b'),to:input(id,1)});}
 const {wires}=layoutAndRoute(nodes,edges,['first','second'],footprint,localPort);
 assert.equal(wires.length,edges.length);assert.equal(nodes[0].x,0);assert.equal(nodes[1].x,96);
 const byId=new Map(nodes.map(n=>[n.id,n]));
 const end=e=>worldPort(byId.get(e.node),e.side,e.index,footprint,localPort);
 const segments=wires.flatMap((w,wire)=>{const path=[end(w.from),...w.points,end(w.to)];return path.slice(1).map((b,i)=>({a:path[i],b,wire}));});
 for(const {a,b} of segments){assert.ok(a.x===b.x||a.y===b.y,'orthogonal');
  for(const n of nodes){const f=footprint(n),inside=a.x===b.x?a.x>n.x+.001&&a.x<n.x+f.w-.001&&Math.min(Math.max(a.y,b.y),n.y+f.h)-Math.max(Math.min(a.y,b.y),n.y)>.001:a.y>n.y+.001&&a.y<n.y+f.h-.001&&Math.min(Math.max(a.x,b.x),n.x+f.w)-Math.max(Math.min(a.x,b.x),n.x)>.001;assert.equal(inside,false,`wire crosses ${n.id}`);}
 }
 for(let i=0;i<segments.length;i++)for(let j=0;j<i;j++){
  const a=segments[i],b=segments[j];if(a.wire===b.wire)continue;
  const sameSource=JSON.stringify(wires[a.wire].from)===JSON.stringify(wires[b.wire].from);if(sameSource)continue;
  const h=a.a.y===a.b.y;if(h!==(b.a.y===b.b.y))continue;
  if((h?a.a.y:a.a.x)!==(h?b.a.y:b.a.x))continue;
  const overlap=Math.min(Math.max(h?a.a.x:a.a.y,h?a.b.x:a.b.y),Math.max(h?b.a.x:b.a.y,h?b.b.x:b.b.y))-Math.max(Math.min(h?a.a.x:a.a.y,h?a.b.x:a.b.y),Math.min(h?b.a.x:b.a.y,h?b.b.x:b.b.y));assert.ok(overlap<=.001,'unrelated tracks do not overlap');
 }
 ctx.fixture={name:'routing fixture',nodes,wires};
 const physical=vm.runInContext(`model=fixture;[...wireNetworks().groups].map(([id,group])=>({wires:group.map(e=>e.wire.id),ports:[...wireNetworks().inputs.get(id).map(p=>p.node+':in:'+p.index),...wireNetworks().outputs.get(id).map(p=>p.node+':out:'+p.index)].sort()}))`,ctx);
 const parents=edges.map((_,i)=>i),root=i=>{while(parents[i]!==i)i=parents[i];return i;},contacts=new Map();
 edges.forEach((e,i)=>{for(const p of [e.from,e.to]){const key=JSON.stringify(p);if(contacts.has(key))parents[root(i)]=root(contacts.get(key));else contacts.set(key,i);}});
 for(const group of physical){const intended=edges.filter((_,i)=>group.wires.includes(wires[i].id));
  assert.equal(new Set(edges.map((_,i)=>i).filter(i=>group.wires.includes(wires[i].id)).map(root)).size,1,'independent electrical nets stay separate');
  const ports=[...new Set(intended.flatMap(e=>[e.from,e.to].map(p=>p.node+':'+p.side+':'+p.index)))].sort();assert.deepEqual(Array.from(group.ports),ports,'routes do not touch unused sockets or create hidden shorts');
 }
});
