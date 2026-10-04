const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
for(const rotation of [0,90,180,270])test(`tidy routes clear of the visible board edge at ${rotation} degrees`,()=>{
  const ctx=loadApp();
  const result=vm.runInContext(`model={name:'edge',nodes:[designNode('gate','or',0,0,{rotation:${rotation}})],wires:[]};
    const f=footprint(model.nodes[0]);model.wires=[designWire('edge',{x:-48,y:f.h},{x:f.w+48,y:f.h},[{x:-48,y:f.h+48},{x:f.w+48,y:f.h+48}])];
    const before=JSON.stringify(model),routed=planTidyWires();
    JSON.stringify({unchanged:before===JSON.stringify(model),w:f.w,h:f.h,path:[routed[0].from,...routed[0].points,routed[0].to]});`,ctx);
  const {unchanged,w,h,path}=JSON.parse(result);assert.equal(unchanged,true);
  const across=path.slice(1).filter((b,i)=>Math.min(path[i].x,b.x)<=w/2&&Math.max(path[i].x,b.x)>=w/2);
  assert.ok(across.length);
  assert.ok(across.every(p=>p.y>=h+12||p.y<=-12),'wire clears the board and its visible rim');
});

test('outward socket leads remain usable beside stacked displays',()=>{
  const ctx=loadApp();
  assert.equal(vm.runInContext(`const nodes=[designNode('c','converter7',0,0),designNode('d','display7',0,0)];
    const p=portPosition(nodes[0],'in',0);!wireSegmentBlocked(p,{x:p.x,y:p.y+24},wireBoardObstacles(nodes));`,ctx),true);
});
