const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
test('adder socket approaches form an ordered comb with unchanged endpoints',()=>{
  const ctx=loadApp();
  const result=vm.runInContext(`(()=>{
    const nodes=[designNode('adder','fullAdder',0,0)];
    const edges=Array.from({length:8},(_,i)=>({from:{x:-192,y:192+i*24},to:{node:'adder',side:'in',index:i}}));
    const routed=routeDesignWires(nodes,edges,'tidy');
    const paths=routed.map(w=>[w.from,...w.points,portPosition(nodes[0],'in',w.to.index)]);
    return JSON.stringify({routed,edges,leads:paths.map(p=>{const end=p.at(-1),last=p.slice(0,-1).reverse().find(q=>q.y!==end.y);return {x:end.x,length:Math.abs(last.y-end.y)};}),clear:paths.every(p=>p.slice(1).every((b,i)=>!wireSegmentBlocked(p[i],b,wireBoardObstacles(nodes))))});
  })()`,ctx);
  const {routed,edges,leads,clear}=JSON.parse(result);
  assert.equal(clear,true);
  routed.forEach((w,i)=>{assert.deepEqual(w.from,edges[i].from);assert.deepEqual(w.to,edges[i].to);});
  leads.sort((a,b)=>a.x-b.x);
  assert.ok(leads.every((p,i)=>p.length===(i+1)*12),JSON.stringify(leads));
});

test('tidy adder preserves the model and electrical connections until applied',()=>{
  const ctx=loadApp();
  const result=vm.runInContext(`(()=>{
    const nodes=[designNode('adder','fullAdder',0,0)];
    const edges=Array.from({length:8},(_,i)=>({from:{x:-192,y:192+i*24},to:{node:'adder',side:'in',index:i}}));
    model={name:'Socket bank',nodes,wires:routeDesignWires(nodes,edges,'fixture')};
    const before=JSON.stringify(model),wires=planTidyWires();
    return {unchanged:JSON.stringify(model)===before,count:wires.length,expected:model.wires.length};
  })()`,ctx);
  assert.equal(result.unchanged,true);assert.equal(result.count,result.expected);
});
