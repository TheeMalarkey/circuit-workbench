// CPU-only simulator benchmark and exact before/after behavioral trace checker.
// Usage: node scripts/performance-benchmark.cjs --baseline path/to/app-before.js
// Optional: --case calculator (repeatable), --parity-only, --timing-only,
// --samples 40 (idle calls), --active-samples 3 (complete active workloads).
// Rendering and persistence are stubbed. These numbers are not browser FPS.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const assert=require('node:assert/strict'),{performance}=require('node:perf_hooks');
const APP=path.join(__dirname,'../dist/app.js');
const readSource=file=>fs.readFileSync(file,'utf8').split('bind();updateGridSnap();')[0];
const sourceHash=source=>require('node:crypto').createHash('sha256').update(source).digest('hex');
const pins=state=>JSON.stringify([...state].map(([id,value])=>[id,value.in,value.drive,value.out,!!value.unstable]));
function createRig(source,{capture=false}={}){
  const events=[],checkpoints=[];let previousPins;
  const ctx=vm.createContext({structuredClone,crypto:require('node:crypto').webcrypto,
    document:{getElementById:()=>({})},localStorage:{getItem:()=>null},setTimeout(){},clearTimeout(){},
    observe(time,state){const statePins=pins(state);if(statePins!==previousPins){events.push({time,pins:statePins});previousPins=statePins;}}
  });
  vm.runInContext(source+`;renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};setStatus=()=>{};render=()=>{};`,ctx);
  if(capture)vm.runInContext(`const benchmarkSettle=settleTiming;settleTiming=function(){const result=benchmarkSettle();observe(simulationMs,result);return result;};`,ctx);
  const run=code=>vm.runInContext(code,ctx);
  const snapshot=()=>run(`JSON.stringify({time:simulationMs,tick,pins:[...values].map(([id,v])=>[id,v.in,v.drive,v.out,!!v.unstable]),
    memory:model.nodes.map(n=>[n.id,n.bit,n.bits,n.memoryInput,n.channel,n.latchSelected]),
    buttons:[...buttonPulses],timers:[...circuitBuffers],latches:[...latchStates],forwarded:[...memoryStates]})`);
  const action=(label,code)=>{run(code);if(capture){ctx.observe(run('simulationMs'),run('values'));checkpoints.push({label,state:snapshot()});}};
  const init=code=>action('initial',`model=${code};resetTiming();simulate(false);`);
  const advance=ms=>action(`advance ${ms}`,`simulate(true,${ms});`);
  const press=id=>action(`press ${id}`,`pressButton(nodeBy(${JSON.stringify(id)}));`);
  const screen=(prefix,count)=>run(`Array.from({length:${count}},(_,place)=>{const v=values.get(${JSON.stringify(prefix+'-display-')}+place).in,lit=[...SEGMENT_NAMES].filter((_,i)=>v[i]).join('');return lit==='g'?'-':String(SEGMENT_DIGITS.findIndex(s=>s===lit));}).reverse().join('')`);
  return {run,action,init,advance,press,screen,events,checkpoints};
}
function enter(r,value){for(const digit of String(value)){r.press('key'+digit);r.advance(400);}}
function store(r,which,value){enter(r,value);r.press('set'+which);r.advance(2200);}
function calculate(r,operation){r.press('op-'+operation);r.advance(400);r.press('calculate');r.advance(operation==='mul'?12600:1000);}
function loopFixture(type,setting){return `{name:'${type} feedback',nodes:[designNode('source','lever',0,0),designNode('timer','${type}',288,0,{delay:${setting}})],wires:[
  designWire('feed',{node:'source',side:'out',index:0},{node:'timer',side:'in',index:0}),
  designWire('loop',{node:'timer',side:'out',index:0},{node:'timer',side:'in',index:0},[{x:480,y:48},{x:480,y:-96},{x:240,y:-96},{x:240,y:48}])]}`;}
const SCENARIOS={
  calculator(r){
    r.init('structuredClone(CALCULATOR_DESIGN)');
    store(r,1,12);store(r,2,3);calculate(r,'add');assert.equal(r.screen('result',8),'00000015');
    store(r,1,3);store(r,2,12);calculate(r,'sub');assert.equal(r.screen('result',8),'-0000009');
    store(r,1,12);store(r,2,3);calculate(r,'mul');assert.equal(r.screen('result',8),'00000036');
    r.advance(17);r.advance(83);r.advance(1500);
  },
  'delay-feedback'(r){
    r.init(loopFixture('delay',2));r.action('lever on',`nodeBy('source').on=true;simulate(false);`);r.advance(50);
    r.action('lever off',`nodeBy('source').on=false;simulate(false);`);
    for(let i=0;i<16;i++)r.advance([17,83,211,89][i%4]);
    r.action('disconnect feedback',`model.wires=model.wires.filter(w=>w.id!=='loop');simulate(false);`);r.advance(900);
  },
  'sustain-feedback'(r){
    r.init(loopFixture('sustain',12));r.action('lever on',`nodeBy('source').on=true;simulate(false);`);r.advance(50);
    r.action('lever off',`nodeBy('source').on=false;simulate(false);`);r.advance(349);r.advance(1);r.advance(2399);r.advance(1);r.advance(4000);
    assert.equal(r.run(`values.get('timer').out[0]`),true);
    r.action('disconnect feedback',`model.wires=model.wires.filter(w=>w.id!=='loop');simulate(false);`);r.advance(2399);r.advance(1);
    assert.equal(r.run(`values.get('timer').out[0]`),false);
  },
  'sustain-memory'(r){
    r.init(`{name:'sustained write',nodes:[designNode('source','lever',0,0),designNode('hold','sustain',288,0,{delay:2}),designNode('sink','buffer4',576,0)],wires:[designWire('feed',{node:'source',side:'out',index:0},{node:'hold',side:'in',index:0}),designWire('output',{node:'hold',side:'out',index:0},{node:'sink',side:'in',index:1})]}`);
    r.action('lever on',`nodeBy('source').on=true;simulate(false);`);r.advance(100);
    r.action('lever off',`nodeBy('source').on=false;simulate(false);`);r.advance(399);r.advance(1);r.advance(100);
    assert.equal(r.run(`nodeBy('sink').bits.map(Number).join('')`),'1000');
  },
  'buffer-forwarding'(r){
    r.init(`structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='buffer-one-test'))`);
    r.action('connect displaced bit',`model.nodes.push(designNode('receiver','buffer1',576,288));model.wires.push(designWire('forward',{node:'memory',side:'in',index:2},{node:'receiver',side:'in',index:1}));simulate(false);`);
    for(const id of ['one','one','zero','one']){r.press(id);r.advance(199);r.advance(1);r.advance(149);r.advance(1);r.advance(250);}
  },
  'joined-latch'(r){
    r.init(`structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='sr-latch-linked'))`);
    for(const id of ['top','bottom','top']){r.press(id);for(const ms of [50,150,25,175,249,1,150])r.advance(ms);}
  },
  'unstable-loop'(r){
    r.init(`{name:'unstable',nodes:[designNode('gate','inverter',0,0)],wires:[designWire('loop',{node:'gate',side:'out',index:0},{node:'gate',side:'in',index:0},[{x:144,y:48},{x:144,y:-48},{x:-48,y:-48},{x:-48,y:48}])]}`);
    r.advance(17);r.advance(500);r.action('remove feedback',`model.wires=[];simulate(false);`);r.advance(200);
  }
};
function captureTrace(source,name){
  if(!SCENARIOS[name])throw Error('Unknown scenario: '+name);
  const r=createRig(source,{capture:true});SCENARIOS[name](r);
  return {name,events:r.events,checkpoints:r.checkpoints};
}
function compareTraces(before,after){
  for(const field of ['events','checkpoints']){
    const a=before[field],b=after[field];
    for(let i=0;i<Math.max(a.length,b.length);i++){
      if(JSON.stringify(a[i])===JSON.stringify(b[i]))continue;
      const left=a[i],right=b[i];
      let detail='';
      if(field==='events'&&left?.pins&&right?.pins){
        const lp=JSON.parse(left.pins),rp=JSON.parse(right.pins);
        const node=lp.findIndex((value,j)=>JSON.stringify(value)!==JSON.stringify(rp[j]));
        if(node>=0)detail=`; first differing pins ${JSON.stringify(lp[node])} -> ${JSON.stringify(rp[node])}`;
      }
      throw Error(`${before.name}: ${field}[${i}] differs (before ${left?.time??left?.label??'missing'}, after ${right?.time??right?.label??'missing'})${detail}`);
    }
  }
  return {case:before.name,fullPinTransitions:before.events.length,checkpoints:before.checkpoints.length,identical:true};
}
function measure(work){
  const start=performance.now(),cpu=process.cpuUsage();work();const used=process.cpuUsage(cpu);
  return {cpuMs:+((used.user+used.system)/1000).toFixed(3),wallMs:+(performance.now()-start).toFixed(3)};
}
const median=values=>{const sorted=[...values].sort((a,b)=>a-b),middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;};
function benchmark(source,samples=40,activeSamples=3){
  const r=createRig(source);r.init('structuredClone(CALCULATOR_DESIGN)');
  for(let i=0;i<8;i++)r.advance(16);
  // Batch idle calls because process.cpuUsage has coarse resolution on Windows.
  const idle=[];
  for(let done=0;done<samples;){const count=Math.min(10,samples-done);idle.push({calls:count,...measure(()=>{for(let i=0;i<count;i++)r.advance(16);})});done+=count;}
  const workload=()=>{store(r,1,12);store(r,2,3);calculate(r,'mul');};
  workload();assert.equal(r.screen('result',8),'00000036'); // Warm the active path before measuring it.
  const active=[];
  for(let i=0;i<activeSamples;i++){
    // Reset registers and topology outside the timed sample, retaining warmed code.
    r.init('structuredClone(CALCULATOR_DESIGN)');for(let warm=0;warm<8;warm++)r.advance(16);
    active.push(measure(workload));assert.equal(r.screen('result',8),'00000036');
  }
  return {parts:r.run('model.nodes.length'),wires:r.run('model.wires.length'),
    idle:{calls:samples,batches:idle,medianCpuMsPerCall:+median(idle.map(sample=>sample.cpuMs/sample.calls)).toFixed(3),medianWallMsPerCall:+median(idle.map(sample=>sample.wallMs/sample.calls)).toFixed(3)},
    active:{workload:'Enter 12 and 3, capture both, calculate 12 × 3',samples:active,medianCpuMs:+median(active.map(sample=>sample.cpuMs)).toFixed(3),medianWallMs:+median(active.map(sample=>sample.wallMs)).toFixed(3)}};
}
function options(argv){
  const result={cases:[],samples:40,activeSamples:3};
  for(let i=0;i<argv.length;i++){
    const arg=argv[i];
    if(arg==='--baseline')result.baseline=argv[++i];
    else if(arg==='--output')result.output=argv[++i];
    else if(arg==='--case')result.cases.push(argv[++i]);
    else if(arg==='--samples')result.samples=Number(argv[++i]);
    else if(arg==='--active-samples')result.activeSamples=Number(argv[++i]);
    else if(arg==='--parity-only')result.parityOnly=true;
    else if(arg==='--timing-only')result.timingOnly=true;
    else throw Error('Unknown argument: '+arg);
  }
  if(!Number.isInteger(result.samples)||result.samples<1)throw Error('--samples requires a positive integer');
  if(!Number.isInteger(result.activeSamples)||result.activeSamples<1)throw Error('--active-samples requires a positive integer');
  if(!result.cases.length)result.cases=Object.keys(SCENARIOS);
  return result;
}
function main(argv=process.argv.slice(2)){
  const opts=options(argv),current=readSource(APP),baseline=opts.baseline?readSource(path.resolve(opts.baseline)):null;
  const report={scope:'Node.js simulator CPU only; rendering and persistence stubbed; not browser FPS',sources:{before:baseline?sourceHash(baseline):null,after:sourceHash(current)},parity:[]};
  if(!opts.timingOnly)for(const name of opts.cases){
    const after=captureTrace(current,name);
    const result=baseline?compareTraces(captureTrace(baseline,name),after):{case:name,fullPinTransitions:after.events.length,checkpoints:after.checkpoints.length};
    report.parity.push(result);console.error(`Trace ${name}: ${result.fullPinTransitions} complete-pin transitions, ${result.checkpoints} checkpoints${baseline?' identical':''}`);
  }
  if(!opts.parityOnly){
    if(baseline)report.before=benchmark(baseline,opts.samples,opts.activeSamples);
    report.after=benchmark(current,opts.samples,opts.activeSamples);
  }
  const json=JSON.stringify(report,null,2);
  if(opts.output)fs.writeFileSync(path.resolve(opts.output),json+'\n');
  console.log(json);return report;
}
if(require.main===module){try{main();}catch(error){console.error(error.stack);process.exitCode=1;}}
module.exports={readSource,createRig,SCENARIOS,captureTrace,compareTraces,benchmark,options,median};
