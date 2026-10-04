// Diagnostic only: profile the current engine without modifying application assets.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {performance}=require('node:perf_hooks');
const {SCENARIOS}=require('./performance-benchmark.cjs');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
const names=['wireNetworks','sameTopology','nodeLookup','nodeBy','resolveSignals','networkSignals','settleTiming','advanceTiming','sameSignals','wireDrawing'];
function rig(){
  const counters={};let enabled=false;
  const ctx=vm.createContext({structuredClone,crypto:require('node:crypto').webcrypto,document:{getElementById:()=>({})},localStorage:{getItem:()=>null},clearTimeout(){},setTimeout(){},
    clock:()=>performance.now(),record(name,ms){if(!enabled)return;const c=counters[name]??={calls:0,totalMs:0,maxMs:0};c.calls++;c.totalMs+=ms;c.maxMs=Math.max(c.maxMs,ms);}});
  const started=performance.now();
  vm.runInContext(source+';render=renderSelection=paintTimingFaces=save=setStatus=()=>{};',ctx);
  const startupMs=performance.now()-started;
  const run=code=>vm.runInContext(code,ctx);
  for(const name of names)run(`{const original=${name};${name}=function(...args){const started=clock();try{return original(...args);}finally{record('${name}',clock()-started);}};}`);
  const action=(label,code)=>run(code);
  const init=expression=>run(`model=${expression};resetTiming();networkCache=null;simulate(false);`);
  const advance=ms=>run(`simulate(true,${ms})`);
  const press=id=>run(`pressButton(nodeBy(${JSON.stringify(id)}))`);
  const screen=(prefix,count)=>run(`Array.from({length:${count}},(_,place)=>{const v=values.get(${JSON.stringify(prefix+'-display-')}+place).in,lit=[...SEGMENT_NAMES].filter((_,i)=>v[i]).join('');return lit==='g'?'-':String(SEGMENT_DIGITS.findIndex(s=>s===lit));}).reverse().join('')`);
  function measure(code){for(const key of Object.keys(counters))delete counters[key];enabled=true;const start=performance.now();run(code);const elapsedMs=performance.now()-start;enabled=false;
    return {elapsedMs:+elapsedMs.toFixed(3),counters:Object.fromEntries(Object.entries(counters).map(([name,c])=>[name,{calls:c.calls,totalMs:+c.totalMs.toFixed(3),maxMs:+c.maxMs.toFixed(3)}]))};}
  function workload(){for(const key of Object.keys(counters))delete counters[key];enabled=true;const start=performance.now();SCENARIOS.calculator({run,action,init,advance,press,screen});const elapsedMs=performance.now()-start;enabled=false;
    return {elapsedMs:+elapsedMs.toFixed(3),counters:Object.fromEntries(Object.entries(counters).map(([name,c])=>[name,{calls:c.calls,totalMs:+c.totalMs.toFixed(3),maxMs:+c.maxMs.toFixed(3)}]))};}
  return {run,init,measure,workload,startupMs};
}
const r=rig();
const report={scope:'CPU diagnostic: renderer and persistence stubbed; function timings include nested calls and instrumentation overhead',startupMs:+r.startupMs.toFixed(3),designs:[]};
const expressions=['CALCULATOR_DESIGN','CALCULATOR_SMALL_AUTO_DESIGN','DECIMAL_KEYPAD_DESIGNS[3]'];
for(const expression of expressions){
  const start=performance.now();r.init(`structuredClone(${expression})`);const initialSettleMs=performance.now()-start;
  r.run('for(let i=0;i<10;i++)simulate(true,20)');
  const geometry=JSON.parse(r.run(`JSON.stringify({nodes:model.nodes.length,wires:model.wires.length,points:model.wires.reduce((sum,w)=>sum+w.points.length+2,0),ports:model.nodes.reduce((sum,n)=>sum+PARTS[n.type].inputs.length+PARTS[n.type].outputs.length,0),fallbackWires:model.wires.filter(w=>{const points=wireEnds(w);return points.slice(1).some((b,i)=>{const a=points[i];return (Math.floor((Math.max(a.x,b.x)+.5)/96)-Math.floor((Math.min(a.x,b.x)-.5)/96)+1)*(Math.floor((Math.max(a.y,b.y)+.5)/96)-Math.floor((Math.min(a.y,b.y)-.5)/96)+1)>128;});}).length,networks:wireNetworks().groups.size,timingNodes:model.nodes.filter(n=>n.type==='delay'||n.type==='sustain').length,modelBytes:JSON.stringify(model).length,timingBytes:JSON.stringify([...values]).length})`));
  const idle=r.measure('for(let i=0;i<100;i++)simulate(true,20)');
  const skipIdleSolve=r.measure('var originalSettle=settleTiming;settleTiming=()=>values;try{for(let i=0;i<100;i++)simulate(true,20)}finally{settleTiming=originalSettle}');
  const coldTopology=r.measure('networkCache=null;wireNetworks()');
  const coldDrawing=r.measure('wireDrawing(wireNetworks())');
  const cachedDrawing=r.measure('for(let i=0;i<100;i++)wireDrawing(wireNetworks())');
  const snapshot=r.measure('for(let i=0;i<20;i++){clone(model);timingSnapshot()}');
  const serialization=r.measure('for(let i=0;i<20;i++)JSON.stringify(model)');
  report.designs.push({expression,...geometry,initialSettleMs:+initialSettleMs.toFixed(3),idle,skipIdleSolve,coldTopology,coldDrawing,cachedDrawing,snapshot,serialization});
}
if(!process.argv.includes('--skip-active'))report.activeCalculator=r.workload();
const outputIndex=process.argv.indexOf('--output');
if(outputIndex>=0){const output=path.resolve(process.argv[outputIndex+1]);fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
