const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
const {buildCalculator}=require('../scripts/build-calculator.cjs');

function rig(){
  const ctx=loadApp();
  vm.runInContext(`
    model={name:'Lifecycle fixture',nodes:[
      {id:'command',type:'buffer1',bit:true,calculator:{group:'calculator',role:'transient'},memoryInput:[true,false,false,false]},
      {id:'seen',type:'buffer1',bit:true,calculator:{group:'calculator',role:'transient'},memoryInput:[false,true,false,false]},
      {id:'entry',type:'buffer4',bits:[true,false,true,false],memoryInput:[false,false,false,false]},
      {id:'variable',type:'buffer1',bit:true,calculator:{group:'calculator',role:'stored'}},
      {id:'answer',type:'buffer1',bit:true},
      {id:'unrelated',type:'buffer1',bit:true},
      {id:'switch',type:'lever',on:true},
      {id:'button',type:'button'},
      {id:'tail',type:'delay',delay:1}
    ],wires:[]};
    model.nodes.forEach((n,i)=>{n.x=i*1000;n.y=i*1000;n.rotation=0;});
    save=()=>{};render=()=>{};renderSelection=()=>{};paintTimingFaces=()=>{};
    checkpoint=()=>{};changed=()=>simulate(false);setStatus=()=>{};
    updatePlaybackControls=()=>{};renderProjectTabs=()=>{};refreshWireToolUI=()=>{};
    els.viewport.classList={remove:()=>{}};
    resetTiming();
    buttonPulses.set('button',850);
    circuitBuffers.set('tail',{input:false,output:true,events:[{at:700,on:false}],pulses:[],holdUntil:0});
    simulationMs=500;tick=2.5;
    calculatorInputState('calculator').queue.push('button');
  `,ctx);
  return code=>vm.runInContext(code,ctx);
}
function unchangedStorage(run){
  assert.equal(run("nodeBy('variable').bit"),true,'stored variable is preserved');
  assert.equal(run("nodeBy('answer').bit"),true,'previous answer is preserved');
  assert.equal(run("nodeBy('unrelated').bit"),true,'unrelated memory is preserved');
  assert.equal(run("JSON.stringify(nodeBy('entry').bits)"),'[true,false,true,false]','current entry is preserved');
}

test('calculator generator marks only command and fresh-edge cells as transient',()=>{
  const design=buildCalculator(),transient=design.nodes.filter(n=>n.calculator?.role==='transient');
  assert.equal(transient.length,6);
  assert.ok(transient.every(n=>/^(command|seen-command)-[0-2]$/.test(n.id)));
  assert.ok(design.nodes.filter(n=>/^(var[12]|answer|entry-memory|operation|valid)-/.test(n.id)).every(n=>n.calculator?.role!=='transient'));
});

test('Reset inputs cancels calculator command memory and pending timing without deleting stored data',()=>{
  const run=rig();run('resetInputs();');
  assert.equal(run("nodeBy('command').bit"),false);assert.equal(run("nodeBy('seen').bit"),false);
  assert.equal(run("nodeBy('switch').on"),false,'ordinary Reset inputs behavior is retained');
  assert.equal(run('buttonPulses.size'),0);assert.equal(run('calculatorInputs.has(model)'),false);
  assert.equal(run("circuitBuffers.get('tail').events.length"),0);
  assert.equal(run('simulationMs'),0);unchangedStorage(run);
  run('simulate(true,3000);');unchangedStorage(run);
  assert.equal(run("nodeBy('command').bit"),false,'cancelled command does not restart later');
});

test('restoring without a timing snapshot cancels only transient calculator cells',()=>{
  const run=rig();run('restoreTiming(null);');
  assert.equal(run("nodeBy('command').bit"),false);assert.equal(run("nodeBy('seen').bit"),false);
  assert.equal(run("Object.hasOwn(nodeBy('command'),'memoryInput')"),false);
  assert.equal(run('circuitBuffers.size'),0);assert.equal(run('simulationMs'),0);unchangedStorage(run);
});

test('restoring a valid timing snapshot keeps an active calculator command and its timer phase',()=>{
  const run=rig();run('const savedTiming=timingSnapshot();resetTiming();restoreTiming(savedTiming);');
  assert.equal(run("nodeBy('command').bit"),true);assert.equal(run("nodeBy('seen').bit"),true);
  assert.equal(run('simulationMs'),500);assert.equal(run("circuitBuffers.get('tail').events[0].at"),700);
  assert.equal(run("buttonPulses.get('button')"),850);unchangedStorage(run);
});

test('sessionless project restoration cancels commands but saved project sessions resume intact',()=>{
  const run=rig();
  run("const savedProjectModel=structuredClone(model);const savedProjectSession={...timingSnapshot(),history:[],future:[],selected:null,selectedNodes:[],selectedWires:[]};");
  run("restoreProject({id:'import',model:structuredClone(savedProjectModel),view:{x:0,y:0,scale:1},running:true});");
  assert.equal(run("nodeBy('command').bit"),false);assert.equal(run("nodeBy('seen').bit"),false);unchangedStorage(run);
  run("restoreProject({id:'resume',model:structuredClone(savedProjectModel),view:{x:0,y:0,scale:1},running:true,session:savedProjectSession});");
  assert.equal(run("nodeBy('command').bit"),true);assert.equal(run("nodeBy('seen').bit"),true);
  assert.equal(run('simulationMs'),500);assert.equal(run("circuitBuffers.get('tail').events[0].at"),700);unchangedStorage(run);
});

test('copying a running calculator cancels copied command state and keeps the original untouched',()=>{
  const run=rig();
  run('const lifecycleCopy=structuredClone(model);remapArcadeGroups(lifecycleCopy);');
  assert.equal(run("lifecycleCopy.nodes.find(n=>n.id==='command').bit"),false);
  assert.equal(run("lifecycleCopy.nodes.find(n=>n.id==='seen').bit"),false);
  assert.equal(run("Object.hasOwn(lifecycleCopy.nodes.find(n=>n.id==='command'),'memoryInput')"),false);
  assert.equal(run("lifecycleCopy.nodes.find(n=>n.id==='variable').bit"),true);
  assert.equal(run("lifecycleCopy.nodes.find(n=>n.id==='command').calculator.group!=='calculator'"),true);
  assert.equal(run("lifecycleCopy.nodes.find(n=>n.id==='command').calculator.group===lifecycleCopy.nodes.find(n=>n.id==='variable').calculator.group"),true);
  assert.equal(run("nodeBy('command').bit"),true,'the original running circuit is untouched');
  assert.equal(run("nodeBy('seen').bit"),true);unchangedStorage(run);
});
