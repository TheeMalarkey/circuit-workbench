const {test}=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {readSource,captureTrace,compareTraces,options,median}=require('../scripts/performance-benchmark.cjs');
const source=readSource(path.join(__dirname,'../dist/app.js'));
test('performance parity harness captures complete pins and exact timed feedback transitions',()=>{
  const first=captureTrace(source,'delay-feedback'),second=captureTrace(source,'delay-feedback');
  assert.equal(compareTraces(first,second).identical,true);
  assert.ok(first.events.length>10);
  const rising=first.events.filter(event=>JSON.parse(event.pins).find(([id])=>id==='timer')?.[3][0]);
  assert.ok(rising.some(event=>event.time===400),'delay setting two must first activate at 400 ms');
  assert.ok(first.checkpoints.every(checkpoint=>'timers' in JSON.parse(checkpoint.state)));
});
test('performance parity reports a changed pin or timestamp instead of just comparing final answers',()=>{
  const original={name:'test',events:[{time:400,pins:JSON.stringify([['a',[false],[false],[true],false]])}],checkpoints:[]};
  const changedTime=structuredClone(original);changedTime.events[0].time=401;
  assert.throws(()=>compareTraces(original,changedTime),/events\[0\] differs/);
  const changedPin=structuredClone(original);changedPin.events[0].pins=JSON.stringify([['a',[false],[false],[false],false]]);
  assert.throws(()=>compareTraces(original,changedPin),/first differing pins/);
});
test('performance benchmark parsing permits explicit baseline and targeted parity without thresholds',()=>{
  assert.deepEqual(options(['--baseline','previous.js','--case','joined-latch','--parity-only','--samples','12']),{cases:['joined-latch'],samples:12,activeSamples:3,baseline:'previous.js',parityOnly:true});
  assert.throws(()=>options(['--samples','0']),/positive integer/);
  assert.equal(median([5,1,3]),3);assert.equal(median([8,1,6,3]),4.5);
});

test('performance CLI saves the measured parity report as a reusable artifact',()=>{
  const fs=require('node:fs'),os=require('node:os'),{spawnSync}=require('node:child_process');
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'circuit-parity-report-')),file=path.join(folder,'report.json');
  try{
    const result=spawnSync(process.execPath,[path.join(__dirname,'../scripts/performance-benchmark.cjs'),'--case','delay-feedback','--parity-only','--output',file],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    assert.deepEqual(saved,JSON.parse(result.stdout));
    assert.equal(saved.parity[0].case,'delay-feedback');assert.ok(saved.parity[0].fullPinTransitions>10);
  }finally{if(fs.existsSync(file))fs.unlinkSync(file);fs.rmdirSync(folder);}
});
