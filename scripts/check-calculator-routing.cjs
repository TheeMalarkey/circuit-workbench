// Check the baked physical network against the generator's intended port graph.
// This catches an extra socket contact even when numerical examples look right.
const vm=require('node:vm'),assert=require('node:assert/strict');
function validateElectricalRouting(design,edges,ctx){
 ctx.routingFixture=design;
 const ports=vm.runInContext(`routingFixture.nodes.flatMap(n=>['in','out'].flatMap(side=>PARTS[n.type][side==='in'?'inputs':'outputs'].map((_,index)=>({key:n.id+':'+side+':'+index,point:portPosition(n,side,index)}))))`,ctx);
 const key=e=>e.node?`${e.node}:${e.side}:${e.index}`:`point:${e.x}:${e.y}`;
 const parent=new Map(),root=k=>{if(!parent.has(k))parent.set(k,k);let result=k;while(parent.get(result)!==result)result=parent.get(result);while(parent.get(k)!==k){const next=parent.get(k);parent.set(k,result);k=next;}return result;};
 const join=(a,b)=>parent.set(root(a),root(b)),coordinates=new Map();
 for(const p of ports){root(p.key);const coordinate=`${p.point.x.toFixed(3)}:${p.point.y.toFixed(3)}`;if(coordinates.has(coordinate))join(p.key,coordinates.get(coordinate));else coordinates.set(coordinate,p.key);}
 for(const e of edges)join(key(e.from),key(e.to));
 const expectedPorts=new Map();for(const p of ports){const r=root(p.key);if(!expectedPorts.has(r))expectedPorts.set(r,[]);expectedPorts.get(r).push(p.key);}
 const physical=vm.runInContext(`model=routingFixture;simulationNetwork=null;[...wireNetworks().groups].map(([id,group])=>({wires:group.map(e=>e.wire.id),ports:[...wireNetworks().inputs.get(id).map(p=>p.node+':in:'+p.index),...wireNetworks().outputs.get(id).map(p=>p.node+':out:'+p.index)]}))`,ctx);
 const intendedByWire=new Map(design.wires.map((w,i)=>[w.id,root(key(edges[i].from))]));
 for(const group of physical){
  const roots=new Set(group.wires.map(w=>intendedByWire.get(w)));assert.equal(roots.size,1,`Unexpected short joining ${group.wires.slice(0,12).join(', ')}`);
  const expected=(expectedPorts.get([...roots][0])||[]).slice().sort();assert.deepEqual(Array.from(group.ports).sort(),expected,`Unexpected/missing socket contact on ${group.wires[0]}`);
 }
 return {wires:design.wires.length,physicalNets:physical.length,ports:ports.length};
}
function validateGeometryRouting(design,ctx){
 ctx.routingFixture=design;
 const report=vm.runInContext(`(()=>{
  model=routingFixture;const boxes=wireBoardObstacles(model.nodes),failures=[],horizontal=new Map(),vertical=new Map(),network=wireNetworks();let segments=0;
  for(let i=0;i<model.nodes.length;i++)for(let j=0;j<i;j++)if(!canPlace(model.nodes[i],[model.nodes[j]],model.nodes[i].x,model.nodes[i].y))failures.push({id:model.nodes[i].id,other:model.nodes[j].id,type:'board overlap'});
  for(const w of model.wires){const path=wireEnds(w);for(let i=1;i<path.length;i++){
   segments++;const a=path[i-1],b=path[i];if(a.x!==b.x&&a.y!==b.y){failures.push({id:w.id,type:'diagonal'});continue;}
   const exempt=[];for(const [end,eligible] of [[w.from,i===1],[w.to,i===path.length-1]])if(eligible&&end.node){
    const n=nodeBy(end.node),f=footprint(n),p=portPosition(n,end.side,end.index);if(['converter7','display7'].includes(n.type)&&p.x>n.x&&p.x<n.x+f.w&&p.y>n.y&&p.y<n.y+f.h)exempt.push(n);
   }
   const others=boxes.filter(box=>!exempt.some(n=>n.x===box.x&&n.y===box.y&&footprint(n).w===box.w&&footprint(n).h===box.h));
   if(wireSegmentBlocked(a,b,others))failures.push({id:w.id,type:'board clearance',a,b});
   const h=a.y===b.y,map=h?horizontal:vertical,axis=h?a.y:a.x,lo=Math.min(h?a.x:a.y,h?b.x:b.y),hi=Math.max(h?a.x:a.y,h?b.x:b.y),net=network.byWire.get(w.id);
   if(!map.has(axis))map.set(axis,[]);map.get(axis).push({lo,hi,net,id:w.id});
  }}
  for(const map of [horizontal,vertical]){const axes=[...map.keys()].sort((a,b)=>a-b);for(let i=0;i<axes.length;i++)for(let j=i;j<axes.length&&axes[j]-axes[i]<11.999;j++){
   const first=map.get(axes[i]),second=map.get(axes[j]);for(let a=0;a<first.length;a++)for(let b=i===j?a+1:0;b<second.length;b++)if(first[a].net!==second[b].net&&Math.min(first[a].hi,second[b].hi)-Math.max(first[a].lo,second[b].lo)>.001)failures.push({id:first[a].id,other:second[b].id,type:'parallel overlap'});
  }}
  return {segments,failureCount:failures.length,failures:failures.slice(0,10)};
 })()`,ctx);
 assert.equal(report.failureCount,0,JSON.stringify(report.failures));return {segments:report.segments,geometryFailures:0};
}
if(require.main===module){
 const {loadApp}=require('./compact-circuit.cjs'),{buildCalculator}=require('./build-calculator.cjs'),ctx=loadApp();
 const design=vm.runInContext('CALCULATOR_DESIGN',ctx),intended=buildCalculator();
 assert.equal(design.wires.length,intended._edges.length,'Baked graph is stale');
 console.log({...validateElectricalRouting(design,intended._edges,ctx),...validateGeometryRouting(design,ctx)});
}
module.exports={validateElectricalRouting,validateGeometryRouting};
