const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {compactCircuit,bounds,loadApp}=require('../scripts/compact-circuit.cjs');
test('empty-strip compaction preserves every built-in electrical network, board size, and original design',()=>{
  const ctx=loadApp(),designs=vm.runInContext('BUILT_IN_DESIGNS',ctx),footprint=vm.runInContext('footprint',ctx);
  vm.runInContext(`function topology(d){model=d;const n=wireNetworks();return JSON.stringify([...n.groups].map(([id,entries])=>[
    entries.map(e=>e.wire.id).sort(),n.inputs.get(id).map(p=>p.node+':'+p.index).sort(),n.outputs.get(id).map(p=>p.node+':'+p.index).sort()
  ]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));}`,ctx);
  const topology=vm.runInContext('topology',ctx);
  for(const design of designs){
    const before=JSON.stringify(design),copy=compactCircuit(design,footprint);
    assert.equal(JSON.stringify(design),before,design.id+' source stays untouched');
    assert.equal(topology(copy),topology(design),design.id+' keeps all connections');
    assert.ok(bounds(copy,footprint).area<=bounds(design,footprint).area,design.id+' never grows');
    copy.nodes.forEach((n,i)=>{assert.deepEqual(footprint(n),footprint(design.nodes[i]));assert.ok((n.x-design.nodes[i].x)%48===0);assert.ok((n.y-design.nodes[i].y)%48===0);});
  }
});
test('four-digit keypad becomes substantially smaller while retaining separate parallel lanes',()=>{
  const ctx=loadApp(),original=vm.runInContext('decimalKeypadDesign(4,false)',ctx),footprint=vm.runInContext('footprint',ctx);
  const copy=compactCircuit(original,footprint);
  assert.ok(bounds(copy,footprint).area<bounds(original,footprint).area*.6);
  ctx.copy=copy;
  assert.equal(vm.runInContext(`model=copy;const segments=model.wires.flatMap((w,id)=>{const p=wireEnds(w);return p.slice(1).map((b,i)=>({id,a:p[i],b}));});
    segments.every((s,i)=>segments.slice(i+1).every(t=>{
      if(s.id===t.id)return true;const h=s.a.y===s.b.y;if(h!==(t.a.y===t.b.y))return true;
      const distance=Math.abs((h?s.a.y:s.a.x)-(h?t.a.y:t.a.x));
      if(distance===0||distance>=10)return true;
      return Math.min(Math.max(h?s.a.x:s.a.y,h?s.b.x:s.b.y),Math.max(h?t.a.x:t.a.y,h?t.b.x:t.b.y))<=Math.max(Math.min(h?s.a.x:s.a.y,h?s.b.x:s.b.y),Math.min(h?t.a.x:t.a.y,h?t.b.x:t.b.y));
    }));`,ctx),true);
});

test('all explorer keypads use compact layouts without adding shared wire paths',()=>{
  const ctx=loadApp(),footprint=vm.runInContext('footprint',ctx);
  for(let digits=1;digits<=4;digits++){
    const original=vm.runInContext(`decimalKeypadDesign(${digits},false)`,ctx);
    const actual=vm.runInContext(`DECIMAL_KEYPAD_DESIGNS[${digits-1}]`,ctx);
    assert.equal(JSON.stringify(actual),JSON.stringify(compactCircuit(original,footprint)));
    assert.ok(bounds(actual,footprint).area<bounds(original,footprint).area*.8);
    ctx.original=original;ctx.actual=actual;
    assert.equal(vm.runInContext(`(()=>{
      const overlaps=d=>{model=d;const segments=d.wires.flatMap(w=>{const p=wireEnds(w);return p.slice(1).map((b,i)=>({id:w.id,a:p[i],b}));});
        const pairs=new Set();for(let i=0;i<segments.length;i++)for(let j=0;j<i;j++){
          const s=segments[i],t=segments[j];if(s.id===t.id)continue;
          const h=s.a.y===s.b.y;if(h!==(t.a.y===t.b.y))continue;
          if((h?s.a.y:s.a.x)!==(h?t.a.y:t.a.x))continue;
          const lo=Math.max(Math.min(h?s.a.x:s.a.y,h?s.b.x:s.b.y),Math.min(h?t.a.x:t.a.y,h?t.b.x:t.b.y));
          const hi=Math.min(Math.max(h?s.a.x:s.a.y,h?s.b.x:s.b.y),Math.max(h?t.a.x:t.a.y,h?t.b.x:t.b.y));
          if(hi>lo)pairs.add([s.id,t.id].sort().join('|'));
        }return [...pairs].sort().join(';');};
      return overlaps(original)===overlaps(actual);
    })()`,ctx),true,'compaction cannot merge separate paths');
  }
});
