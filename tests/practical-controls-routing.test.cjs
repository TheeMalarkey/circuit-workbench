const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function rig(id){
  const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(source+`;renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'));simulate(false);`,ctx);
  return code=>vm.runInContext(code,ctx);
}
function output(run,id,index=0){return !!run(`values.get('${id}').out[${index}]`);}
function powered(run,id){return !!run(`wirePowerDetails('${id}').powered`);}

test('new public control and routing designs are editable, connected, and have distinct route lanes',()=>{
  const run=rig('ab-source-chooser');
  const ids=['start-stop-latch','safe-machine-controller','ab-source-chooser','four-source-router'];
  for(const id of ids){
    assert.equal(run(`valid(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'))`),true,id);
    assert.equal(run(`EXPLORER_DESIGNS.some(d=>d.id==='${id}')`),true,id);
    assert.equal(run(`BUILT_IN_DESIGNS.find(d=>d.id==='${id}').wires.every(w=>w.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))`),true,id);
  }
});

test('A/B chooser truth table and visible wire agree for every input',()=>{
  const run=rig('ab-source-chooser');
  for(let mask=0;mask<8;mask++){
    const a=!!(mask&1),b=!!(mask&2),select=!!(mask&4);
    run(`nodeBy('a').on=${a};nodeBy('b').on=${b};nodeBy('select').on=${select};simulate(false);`);
    assert.equal(output(run,'merged'),select?b:a,`mask ${mask}`);
    assert.equal(powered(run,'ab-source-chooser-7'),select?b:a,`visible output at mask ${mask}`);
  }
});

test('four-way router selects exactly one source, override and enable are independent',()=>{
  const run=rig('four-source-router');
  const outputWire=run("model.wires.find(w=>w.from.node==='output'&&w.style==='neon').id");
  for(let sourceMask=0;sourceMask<16;sourceMask++)for(let choice=0;choice<4;choice++)for(const override of [false,true])for(const enable of [false,true]){
    run(`for(let i=0;i<4;i++)nodeBy('source'+i).on=!!(${sourceMask}&(1<<i));nodeBy('choice0').on=!!(${choice}&1);nodeBy('choice1').on=!!(${choice}&2);nodeBy('override').on=${override};nodeBy('enable').on=${enable};simulate(false);`);
    const selected=override?3:choice,expected=enable&&!!(sourceMask&(1<<selected));
    assert.equal(output(run,'output'),expected,`sources ${sourceMask}, choice ${choice}, override ${override}, enable ${enable}`);
    assert.equal(powered(run,outputWire),expected,'visible output wire');
    for(let i=0;i<4;i++)assert.equal(output(run,'show'+i),i===selected,`source lamp ${i}`);
  }
});

test('start/stop memory holds state after each button pulse',()=>{
  const run=rig('start-stop-latch');
  assert.equal(output(run,'memory',0),false);
  run("pressButton(nodeBy('start'));simulate(true,400);");
  assert.equal(output(run,'memory',0),true);
  run('simulate(true,1200)');assert.equal(output(run,'memory',0),true);
  run("pressButton(nodeBy('stop'));simulate(true,400);");
  assert.equal(output(run,'memory',0),false);
});

test('machine controller never energizes output during a fault and requires a new start',()=>{
  const run=rig('safe-machine-controller');
  const machineWire=run("model.wires.find(w=>w.from.node==='running'&&w.style==='neon').id");
  assert.equal(output(run,'running'),false);
  run("pressButton(nodeBy('start'));simulate(true,400);");
  assert.equal(output(run,'running'),true);
  for(const fault of ['emergency','guard','power']){
    run(`nodeBy('${fault}').on=${fault==='emergency'};simulate(false);`);
    assert.equal(output(run,'running'),false,`${fault} cuts output`);
    assert.equal(powered(run,machineWire),false,`${fault} darkens wire`);
    assert.equal(output(run,'fault'),true,`${fault} lights fault`);
    run("pressButton(nodeBy('start'));simulate(true,400);");
    assert.equal(output(run,'running'),false,`START cannot bypass ${fault}`);
    run(`nodeBy('${fault}').on=${fault!=='emergency'};simulate(false);`);
    assert.equal(output(run,'running'),false,`${fault} clearing does not restart`);
    run("pressButton(nodeBy('start'));simulate(true,400);");
    assert.equal(output(run,'running'),true,`fresh START after ${fault}`);
  }
  run("pressButton(nodeBy('stop'));simulate(true,400);");
  assert.equal(output(run,'running'),false);
});
