const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];

function rig(modelExpression){
  const ctx=vm.createContext({structuredClone,crypto:require('node:crypto').webcrypto,
    document:{getElementById:()=>({})},localStorage:{getItem:()=>null}});
  vm.runInContext(source+`;
    let settleCalls=0,signalPaints=0,timingPaints=0,timingFrames=[],statuses=[];
    const settleOriginal=settleTiming;
    settleTiming=(...args)=>{settleCalls++;return settleOriginal(...args);};
    renderSelection=()=>{};save=()=>{};setStatus=message=>statuses.push(message);
    paintSignals=()=>{signalPaints++;};
    paintTimingFaces=()=>{timingPaints++;timingFrames.push({ms:simulationMs,lamps:model.nodes.filter(n=>n.type==='delay'||n.type==='sustain').map(n=>[n.id,timingSegments(n)])});};
    model=${modelExpression};resetTiming();simulate(false);paintedModel=model;
    function resetMetrics(){settleCalls=0;signalPaints=0;timingPaints=0;timingFrames=[];}
    resetMetrics();`,ctx);
  const run=code=>vm.runInContext(code,ctx);
  return {run,json:code=>JSON.parse(run(`JSON.stringify(${code})`))};
}
const preset=id=>`structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'))`;
const timed=type=>`{name:'timing boundaries',nodes:[designNode('source','lever',0,0),designNode('timer','${type}',288,0,{delay:2})],wires:[designWire('feed',{node:'source',side:'out',index:0},{node:'timer',side:'in',index:0})]}`;

test('idle simulation frames reuse settled signals while advancing the full clock',()=>{
  const r=rig(`{name:'idle',nodes:[designNode('source','lever',0,0)],wires:[]}`);
  r.run('simulate(true,20)');
  assert.equal(r.run('settleCalls'),0,'an unchanged circuit must not be solved again');
  assert.equal(r.run('simulationMs'),20);assert.equal(r.run('tick'),.1);
  assert.equal(r.run('signalPaints'),0);assert.equal(r.run('timingPaints'),1);
  r.run('resetMetrics();simulate(true,1234.5)');
  assert.equal(r.run('settleCalls'),0);assert.equal(r.run('simulationMs'),1254.5);
  assert.equal(r.run('tick'),1254.5/200);
});

test('timing lamps advance at render boundaries without an electrical event',()=>{
  const r=rig(timed('delay'));
  r.run("nodeBy('source').on=true;simulate(false);simulate(true,199);resetMetrics();simulate(true,1)");
  assert.equal(r.run("values.get('timer').out[0]"),false);
  assert.equal(r.run('settleCalls'),0);assert.equal(r.run('signalPaints'),0);
  assert.deepEqual(r.json('timingFrames'),[{ms:200,lamps:[['timer',[11]]]}]);
  r.run('resetMetrics();simulate(true,199)');
  assert.equal(r.run('settleCalls'),0);assert.equal(r.run('simulationMs'),399);
  assert.deepEqual(r.json('timingFrames'),[{ms:399,lamps:[['timer',[11]]]}]);
});

test('button expiry at the exact target still settles and repaints signals',()=>{
  const r=rig(preset('button-pulse'));
  r.run("pressButton(nodeBy('button'));resetMetrics();simulate(true,349)");
  assert.equal(r.run("values.get('button').out[0]"),true);
  assert.equal(r.run("values.get('gate').out[0]"),true);
  assert.equal(r.run('settleCalls'),0);
  r.run('resetMetrics();simulate(true,1)');
  assert.equal(r.run('simulationMs'),350);assert.equal(r.run('settleCalls'),1);
  assert.equal(r.run("values.get('button').out[0]"),false);
  assert.equal(r.run("values.get('gate').out[0]"),false);
  assert.equal(r.run('signalPaints'),1);
});

test('Delay preserves both exact transitions and the full button pulse across a large frame',()=>{
  const r=rig(timed('delay').replace("'source','lever'","'source','button'"));
  r.run("pressButton(nodeBy('source'));simulate(true,399)");
  assert.equal(r.run("values.get('source').out[0]"),false);
  assert.equal(r.run("values.get('timer').out[0]"),false);
  r.run('resetMetrics();simulate(true,1)');
  assert.equal(r.run('settleCalls'),1);assert.equal(r.run("values.get('timer').out[0]"),true);
  r.run('simulate(true,349)');assert.equal(r.run("values.get('timer').out[0]"),true);
  r.run('resetMetrics();simulate(true,1)');
  assert.equal(r.run('simulationMs'),750);assert.equal(r.run('settleCalls'),1);
  assert.equal(r.run("values.get('timer').out[0]"),false);

  const large=rig(timed('delay').replace("'source','lever'","'source','button'"));
  large.run("pressButton(nodeBy('source'));resetMetrics();simulate(true,749)");
  assert.equal(large.run('settleCalls'),2,'button expiry and delayed rise only');
  assert.equal(large.run("values.get('timer').out[0]"),true);
  large.run('simulate(true,1)');assert.equal(large.run("values.get('timer').out[0]"),false);
});

test('forwarded Buffer pulse expires at its exact deadline without changing the stored bit',()=>{
  const r=rig(preset('buffer-one-test'));
  r.run("model.nodes.push(designNode('target','inverter',1000,1000));model.wires.push(designWire('forwarded',{node:'memory',side:'in',index:2},{node:'target',side:'in',index:0}));simulate(false);pressButton(nodeBy('one'));resetMetrics();simulate(true,199)");
  assert.equal(r.run("values.get('target').in[0]"),true);
  assert.equal(r.run("values.get('target').out[0]"),false);
  assert.equal(r.run('settleCalls'),0);
  r.run('resetMetrics();simulate(true,1)');
  assert.equal(r.run('settleCalls'),1);assert.equal(r.run("bufferPulsePort('memory')"),undefined);
  assert.equal(r.run("values.get('target').in[0]"),false);
  assert.equal(r.run("values.get('target').out[0]"),true);
  assert.equal(r.run("nodeBy('memory').bit"),true);
});

test('Sustain hold expiry preserves exactly one downstream edge',()=>{
  const r=rig(timed('sustain'));
  r.run("model.nodes.push(designNode('sink','selector4',800,0));model.wires.push(designWire('count',{node:'timer',side:'out',index:0},{node:'sink',side:'in',index:0}));simulate(false);nodeBy('source').on=true;simulate(false);simulate(true,100);nodeBy('source').on=false;simulate(false);resetMetrics();simulate(true,399)");
  assert.equal(r.run('simulationMs'),499);assert.equal(r.run('settleCalls'),0);
  assert.equal(r.run("values.get('timer').out[0]"),true);assert.equal(r.run("nodeBy('sink').channel"),1);
  r.run('resetMetrics();simulate(true,1)');
  assert.equal(r.run('settleCalls'),1);assert.equal(r.run("values.get('timer').out[0]"),false);
  assert.equal(r.run("nodeBy('sink').channel"),1);
});

test('latch changeover and joined-input release expire at their exact deadlines',()=>{
  const r=rig(preset('sr-latch'));
  r.run("pressButton(nodeBy('bottom'));simulate(true,199)");
  assert.deepEqual(r.json("values.get('latch').out"),[true,true]);
  r.run('resetMetrics();simulate(true,1)');
  assert.equal(r.run('settleCalls'),1);assert.deepEqual(r.json("values.get('latch').out"),[false,true]);

  const joined=rig(preset('sr-latch-linked'));
  joined.run("pressButton(nodeBy('top'));simulate(true,349)");
  assert.deepEqual(joined.json("values.get('latch').out"),[false,true]);
  joined.run('simulate(true,1)');
  assert.deepEqual(joined.json("values.get('latch').out"),[true,true]);
  assert.equal(joined.run("latchStates.get('latch').releaseUntil"),750);
  joined.run('simulate(true,399)');assert.deepEqual(joined.json("values.get('latch').out"),[true,true]);
  joined.run('resetMetrics();simulate(true,1)');
  assert.equal(joined.run('settleCalls'),1);assert.deepEqual(joined.json("values.get('latch').out"),[false,true]);
});

test('initial settling still observes source changes during zero and positive elapsed frames',()=>{
  const r=rig(preset('gate-chain'));
  r.run("nodeBy('lever').on=true;simulate(true,0)");
  assert.equal(r.run('settleCalls'),1);assert.equal(r.run('simulationMs'),0);
  assert.equal(r.run("values.get('second').out[0]"),true);
  r.run("resetMetrics();nodeBy('lever').on=false;simulate(true,20)");
  assert.equal(r.run('settleCalls'),1);assert.equal(r.run("values.get('second').out[0]"),false);
  assert.equal(r.run('signalPaints'),1);
});

test('idle reuse observes in-place memory edits and selector control changes',()=>{
  const r=rig(`{name:'memory edits',nodes:[designNode('b','buffer4',0,0),designNode('s','selector4',400,0)],wires:[]}`);
  r.run("nodeBy('b').bits=[true,false,true,false];nodeBy('s').channel=2;simulate(true,20)");
  assert.deepEqual(r.json("values.get('b').out"),[true,false,true,false]);
  assert.deepEqual(r.json("values.get('s').out"),[false,false,true,false]);
  r.run("resetMetrics();nodeBy('b').bits[1]=true;nodeBy('s').enabled=[true,true,false,true];simulate(true,0)");
  assert.deepEqual(r.json("values.get('b').out"),[true,true,true,false]);
  assert.deepEqual(r.json("values.get('s').out"),[false,false,false,false]);
  assert.equal(r.run('settleCalls'),1);
  r.run('resetMetrics();simulate(true,20)');assert.equal(r.run('settleCalls'),0);
});

test('restored timing cannot reuse signals from the previous session state',()=>{
  const r=rig(preset('button-pulse'));
  r.run("const before=timingSnapshot();pressButton(nodeBy('button'));simulate(true,20);restoreTiming(before);resetMetrics();simulate(true,0)");
  assert.equal(r.run("values.get('gate').out[0]"),false);
  assert.equal(r.run('settleCalls'),1);
  r.run('resetMetrics();simulate(true,20)');assert.equal(r.run('settleCalls'),0);
});

test('idle optimization retains feedback uncertainty and clears it after disconnection',()=>{
  const r=rig(`{name:'unsettled',nodes:[designNode('g','inverter',0,0)],wires:[designWire('feedback',{node:'g',side:'out',index:0},{node:'g',side:'in',index:0},[{x:144,y:48},{x:144,y:-48},{x:-48,y:-48},{x:-48,y:48}])]}`);
  for(const elapsed of [0,20,199,1000]){
    r.run(`resetMetrics();simulate(true,${elapsed})`);
    assert.equal(r.run('settleCalls'),1);assert.equal(r.run("values.get('g').unstable"),true);
    assert.equal(r.run("wirePowerDetails('feedback').unstable"),true);
  }
  r.run('model.wires=[];resetMetrics();simulate(true,20)');
  assert.equal(r.run("!!values.get('g').unstable"),false);
  assert.equal(r.run("values.get('g').out[0]"),true);assert.equal(r.run('signalPaints'),1);
});

test('signal comparison covers every displayed signal and uncertainty independently of object key order',()=>{
  const r=rig(`{name:'compare',nodes:[],wires:[]}`);
  const base={in:[false,true],drive:[true,false],out:[false]};
  const compare=(a,b)=>r.run(`sameSignals(${JSON.stringify(a)},${JSON.stringify(b)})`);
  assert.equal(compare(base,{out:[false],drive:[true,false],in:[false,true]}),true);
  assert.equal(compare(base,{...base,unstable:false}),true);
  assert.equal(compare(base,{...base,unstable:true}),false);
  for(const field of ['in','drive','out']){
    const changed=structuredClone(base);changed[field][0]=!changed[field][0];
    assert.equal(compare(base,changed),false,field+' state');
    const shortened=structuredClone(base);shortened[field].pop();
    assert.equal(compare(base,shortened),false,field+' length');
    const missing=structuredClone(base);delete missing[field];
    assert.equal(compare(base,missing),false,field+' absent');
  }
  assert.equal(r.run('sameSignals(undefined,undefined)'),true);
  assert.equal(r.run(`sameSignals(undefined,${JSON.stringify(base)})`),false);
  assert.equal(r.run(`sameSignals(${JSON.stringify(base)},undefined)`),false);
});
