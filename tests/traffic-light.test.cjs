const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];

function rig(){
  const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(source+";renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='traffic-light-controller'));simulate(false);",ctx);
  return code=>vm.runInContext(code,ctx);
}

const state=`JSON.stringify((()=>({
  phase:nodeBy('selector').channel,
  north:['nsRed','nsYellow','nsGreen'].map(id=>!!values.get(id).out[0]),
  east:['ewRed','ewYellow','ewGreen'].map(id=>!!values.get(id).out[0]),
  safe:!!values.get('bothRed').out[0],
  resetting:!!nodeBy('resetMemory').bit,
  clock:!!values.get('clock').out[0],
  armed:!!nodeBy('autoArm').bit
}))())`;
function read(run){return JSON.parse(run(state));}
function safe(s){
  assert.equal(s.north.filter(Boolean).length,1,JSON.stringify(s));
  assert.equal(s.east.filter(Boolean).length,1,JSON.stringify(s));
  assert.equal(s.north[2]&&s.east[2],false,JSON.stringify(s));
  assert.equal(s.safe,s.north[0]&&s.east[0],JSON.stringify(s));
}

test('traffic controller cycles both roads through green, yellow, and all red',()=>{
  const run=rig();assert.equal(run('valid(model)'),true);
  const expected=[
    [7,[true,false,false],[true,false,false]],
    [0,[false,false,true],[true,false,false]],
    [1,[false,false,true],[true,false,false]],
    [2,[false,true,false],[true,false,false]],
    [3,[true,false,false],[true,false,false]],
    [4,[true,false,false],[false,false,true]],
    [5,[true,false,false],[false,false,true]],
    [6,[true,false,false],[false,true,false]],
    [7,[true,false,false],[true,false,false]]
  ];
  assert.equal(read(run).phase,7);
  for(let cycle=0;cycle<2;cycle++)for(let i=0;i<expected.length;i++){
    if(i===0)continue;
    run(`simulate(true,${cycle===0&&i===1?3000:2000})`);
    const current=read(run);safe(current);
    assert.equal(current.phase,expected[i][0],`cycle ${cycle}, phase ${i}`);
    assert.deepEqual(current.north,expected[i][1]);
    assert.deepEqual(current.east,expected[i][2]);
  }
});

test('reset forces all red, returns home, and waits for a fresh clock edge',()=>{
  for(const phase of [0,1,2,3,4,5,6,7]){
    const run=rig();run(`nodeBy('selector').channel=${phase};simulate(false);pressButton(nodeBy('reset'));`);
    let current=read(run);safe(current);
    assert.equal(current.resetting,true,`phase ${phase}`);
    assert.deepEqual(current.north,[true,false,false]);
    assert.deepEqual(current.east,[true,false,false]);
    const trace=[current];
    for(let i=0;i<30&&current.resetting;i++){run('simulate(true,100)');current=read(run);safe(current);trace.push(current);}
    assert.equal(current.resetting,false,`reset completed from phase ${phase}`);
    assert.equal(current.phase,7,`home phase from ${phase}: ${JSON.stringify(trace)}`);
    assert.deepEqual(current.north,[true,false,false]);
    assert.deepEqual(current.east,[true,false,false]);
    run('simulate(true,4000)');safe(read(run));
    assert.notEqual(read(run).phase,7,`automatic cycle resumed from ${phase}`);
  }
});

test('reset ending during a high clock waits for a complete new interval',()=>{
  const run=rig();
  run('simulate(true,7999);nodeBy("selector").channel=2;simulate(false);pressButton(nodeBy("reset"));');
  let current=read(run);
  for(let i=0;i<40&&current.resetting;i++){run('simulate(true,100)');current=read(run);safe(current);}
  assert.equal(current.resetting,false);
  assert.equal(current.phase,7);
  assert.equal(current.clock,true,'reset should finish while the old clock high is still present');
  assert.equal(run('nodeBy("seenLow").bit'),false,'the old high cannot satisfy the fresh-cycle guard');
  const releaseAt=run('simulationMs');
  const trace=[];
  for(let i=0;i<40;i++){
    run('simulate(true,100)');current=read(run);safe(current);
    trace.push({time:run('simulationMs'),phase:current.phase,clock:current.clock,low:run('nodeBy("seenLow").bit'),high:run('nodeBy("seenHigh").bit'),armed:current.armed});
  }
  const firstAdvance=trace.find(row=>row.phase!==7);
  assert.ok(firstAdvance,`automatic cycling resumes: ${JSON.stringify(trace)}`);
  assert.ok(firstAdvance.time-releaseAt>=2400,`both roads stay red through a fresh interval: released at ${releaseAt}; first advance ${JSON.stringify(firstAdvance)}; trace ${JSON.stringify(trace)}`);
  assert.equal(firstAdvance.phase,0);
});

test('traffic light neon outputs are distinct and use their displayed colors',()=>{
  const run=rig();
  const summary=JSON.parse(run(`JSON.stringify((()=>{
    const wires=model.wires.filter(w=>w.style==='neon');
    return {colors:wires.map(w=>w.color),safe:valid(model),count:wires.length};
  })())`));
  assert.equal(summary.safe,true);
  assert.equal(summary.count,7);
  assert.deepEqual(summary.colors,['Green','Yellow','Red','Green','Yellow','Red','Orange']);
});
