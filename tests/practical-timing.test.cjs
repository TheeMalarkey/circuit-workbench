const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function rig(id){
  const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(source+`;renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'));simulate(false);`,ctx);
  return code=>vm.runInContext(code,ctx);
}
function on(run,id){return !!run(`values.get('${id}').out[0]`);}
function stage(run){return run("nodeBy('selector').channel");}
function checkStages(run){
  const lights=JSON.parse(run("JSON.stringify([0,1,2,3].map(i=>!!values.get('stage'+i).out[0]))"));
  const resetting=!!run("nodeBy('resetMemory').bit");
  assert.equal(lights.filter(Boolean).length,resetting?0:1,'stage outputs are exclusive');
  if(!resetting)assert.equal(lights[stage(run)],true,'selected stage is lit');
}

test('courtesy light turns on immediately and holds six ticks after button release',()=>{
  const run=rig('courtesy-light-timer');
  assert.equal(run('valid(model)'),true);
  assert.equal(on(run,'hold'),false);
  run("pressButton(nodeBy('trigger'));");assert.equal(on(run,'hold'),true);
  run('simulate(true,1549)');assert.equal(on(run,'hold'),true);
  run('simulate(true,1)');assert.equal(on(run,'hold'),false);
  run("pressButton(nodeBy('trigger'));simulate(true,1000);pressButton(nodeBy('trigger'));simulate(true,1549);");
  assert.equal(on(run,'hold'),true,'another press restarts the hold');
  run('simulate(true,1)');assert.equal(on(run,'hold'),false);
});

test('four-stage controller advances manually, stays paused, and resets from every stage',()=>{
  const run=rig('four-stage-process');
  assert.equal(run('valid(model)'),true);checkStages(run);
  for(let i=1;i<=8;i++){
    run("pressButton(nodeBy('next'));simulate(true,400);");
    assert.equal(stage(run),i%4,`manual step ${i}`);checkStages(run);
  }
  run('simulate(true,6000)');assert.equal(stage(run),0,'clock alone cannot step while paused');
  for(const phase of [1,2,3]){
    run(`nodeBy('selector').channel=${phase};simulate(false);pressButton(nodeBy('reset'));`);
    checkStages(run);
    for(let n=0;n<30&&run("nodeBy('resetMemory').bit");n++){
      run('simulate(true,100)');checkStages(run);
    }
    assert.equal(stage(run),0,`reset from ${phase}`);
    assert.equal(run("nodeBy('resetMemory').bit"),false,'reset completes');
  }
});

test('RUN advances on fresh clock phases and pause prevents stale-clock steps',()=>{
  const run=rig('four-stage-process');
  run("nodeBy('run').on=true;simulate(false);");
  assert.equal(stage(run),0,'RUN does not step immediately');
  run('simulate(true,1100)');checkStages(run);
  assert.equal(stage(run),1,'first fresh high advances once');
  run("nodeBy('run').on=false;simulate(false);");
  const paused=stage(run);
  run('simulate(true,6000)');assert.equal(stage(run),paused,'no progress while paused');checkStages(run);
  run("nodeBy('run').on=true;simulate(false);");
  assert.equal(stage(run),paused,'resume does not consume a stale high');
  run('simulate(true,2500)');checkStages(run);
  assert.notEqual(stage(run),paused,'a fresh clock phase resumes progress');
});
