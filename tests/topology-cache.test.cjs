const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');

function rig(){
  const ctx=loadApp(),run=code=>vm.runInContext(code,ctx);
  run(`function fixture(){
    model={name:'cache fixture',nodes:[designNode('source','lever',0,0),designNode('gate','and',240,0),designNode('other','lever',480,0)],wires:[
      designWire('attached',{node:'source',side:'out',index:0},{node:'gate',side:'in',index:0},[{x:120,y:96}]),
      designWire('loose',{x:100,y:200},{x:200,y:200},[{x:150,y:200}])
    ]};
    simulationNetwork=null;
  }
  function canonical(network){return JSON.stringify({
    groups:[...network.groups].map(([id,entries])=>({
      wires:entries.map(e=>e.wire.id),inputs:network.inputs.get(id),outputs:network.outputs.get(id)
    })),contacts:network.contacts,pulseContacts:[...network.pulseContacts]
  });}
  fixture();`);
  return{run};
}

test('node lookup observes direct same-length replacement, reorder and ID edits',()=>{
  const {run}=rig();
  assert.equal(run(`nodeBy('source')===model.nodes[0]`),true);
  run(`const old=model.nodes[0];model.nodes[0]={...old,on:true};`);
  assert.equal(run(`nodeBy('source')===model.nodes[0]&&nodeBy('source')!==old`),true);
  run(`model.nodes.reverse();`);
  assert.equal(run(`nodeBy('source')===model.nodes[2]`),true);
  run(`model.nodes[2].id='renamed';`);
  assert.equal(run(`nodeBy('source')===undefined&&nodeBy('renamed')===model.nodes[2]`),true);
  run(`model.nodes=model.nodes.slice(1);`);
  assert.equal(run(`nodeBy('other')===undefined&&nodeBy('gate')===model.nodes[0]`),true);
  run(`model={...model,nodes:model.nodes.map(n=>({...n}))};`);
  assert.equal(run(`nodeBy('renamed')===model.nodes[1]`),true);
});

test('node lookup retains Array.find first-match semantics for duplicate IDs',()=>{
  const {run}=rig();run(`nodeBy('other');model.nodes[0].id='other';`);
  assert.equal(run(`nodeBy('other')===model.nodes[0]`),true);
  run(`model.nodes.reverse();`);
  assert.equal(run(`nodeBy('other')===model.nodes[0]`),true);
  run(`model.nodes[0]={...model.nodes[0]};`);
  assert.equal(run(`nodeBy('other')===model.nodes[0]`),true);
});

test('real synchronous solve uses the validated node index, but mock networks do not bypass validation',()=>{
  const {run}=rig();run(`wireNetworks();simulationNetwork=networkCache.network;
    let idReads=0;const source=model.nodes[0];Object.defineProperty(source,'id',{get(){idReads++;return 'source'},configurable:true});
    for(let i=0;i<100;i++)nodeBy('source');`);
  assert.equal(run('idReads'),0,'a validated synchronous solve should not rescan node membership');
  run(`simulationNetwork={};model.nodes[0]={...model.nodes[0],id:'replacement'};`);
  assert.equal(run(`nodeBy('source')===undefined&&nodeBy('replacement')===model.nodes[0]`),true);
});

test('unchanged topology reuses network and drawing keys without serialization',()=>{
  const {run}=rig();run(`const originalNetwork=wireNetworks(),originalKey=networkCache.key;
    const originalStringify=JSON.stringify;JSON.stringify=()=>{throw Error('unchanged topology was serialized')};
    model.nodes[0].on=true;model.nodes[0].label='new label';model.wires[0].color='Red';
    for(let i=0;i<10;i++)wireNetworks();JSON.stringify=originalStringify;`);
  assert.equal(run('wireNetworks()===originalNetwork&&networkCache.key===originalKey'),true);
  run(`model.nodes=model.nodes.map(n=>({...n}));model.wires=model.wires.map(w=>structuredClone(w));`);
  assert.equal(run('wireNetworks()===originalNetwork&&networkCache.key===originalKey'),true,'equal geometry may reuse connectivity after object replacement');
  assert.equal(run(`nodeBy('source')===model.nodes[0]`),true,'node lookup must nevertheless point at the new object');
});

test('every topology scalar and structural mutation invalidates the cache and matches a fresh rebuild',()=>{
  const {run}=rig();
  const edits=[
    `model.nodes[0].x+=12`, `model.nodes[0].y-=12`, `model.nodes[0].rotation=90`,
    `model.nodes[0].type='button'`, `model.nodes[0].id='renamed';model.wires[0].from.node='renamed'`,
    `model.nodes.reverse()`, `model.nodes[0]={...model.nodes[0],x:48}`,
    `model.nodes.push(designNode('added','inverter',600,0))`, `model.nodes.pop()`,
    `model.wires[0].id='renamed-wire'`, `model.wires.reverse()`,
    `model.wires[0].from.node='other'`, `model.wires[0].to.side='out'`, `model.wires[0].to.index=1`,
    `model.wires[0].from={x:24,y:96}`, `model.wires[0].to={x:240,y:48}`,
    `model.wires[1].from.x+=12`, `model.wires[1].from.y+=12`,
    `model.wires[1].to.x+=12`, `model.wires[1].to.y+=12`,
    `model.wires[0].points[0].x+=12`, `model.wires[0].points[0].y+=12`,
    `model.wires[0].points[0]={x:132,y:96}`, `model.wires[0].points.push({x:180,y:96})`,
    `model.wires[0].points.pop()`, `model.wires[0]={...model.wires[0],to:{x:500,y:300}}`,
    `model.wires.push(designWire('added-wire',{x:600,y:0},{x:600,y:100}))`, `model.wires.pop()`
  ];
  for(const edit of edits){
    run(`fixture();globalThis.before=wireNetworks();globalThis.beforeKey=networkCache.key;${edit};globalThis.after=wireNetworks();`);
    assert.equal(run('after!==before&&networkCache.key!==beforeKey'),true,edit);
    const cached=run('canonical(after)');run('networkCache=null;');
    assert.equal(run('canonical(wireNetworks())'),cached,edit+' (fresh network parity)');
  }
});

test('wire drawing cache is invalidated by an in-place bend edit, but not signal-only edits',()=>{
  const {run}=rig();run(`const firstDrawing=wireDrawing(wireNetworks());model.nodes[0].on=true;`);
  assert.equal(run('wireDrawing(wireNetworks())===firstDrawing'),true);
  run(`model.wires[0].points[0].x+=48;`);
  assert.equal(run('wireDrawing(wireNetworks())!==firstDrawing'),true);
});

test('wire endpoints resolve each attached node only once and preserve loose or missing ends',()=>{
  const {run}=rig();run(`const originalNodeBy=nodeBy;let lookups=0;
    nodeBy=id=>{lookups++;return originalNodeBy(id)};
    const originalEnds=wireEnds(model.wires[0]);`);
  assert.equal(run('lookups'),2);
  assert.equal(run('originalEnds.length'),3);
  run(`lookups=0;wireEnds(model.wires[1]);`);
  assert.equal(run('lookups'),0);
  run(`model.wires[0].from.node='missing';`);
  assert.equal(run('wireEnds(model.wires[0])'),null);
});
