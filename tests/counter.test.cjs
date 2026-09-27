const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function rig(){
  const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(source+";renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='counter-0-15'));simulate(false);",ctx);
  return code=>vm.runInContext(code,ctx);
}
function expectCount(run,n){
  assert.equal(run("nodeBy('counter').channel"),n);
  assert.equal(run("[0,1,2,3].reduce((sum,i)=>sum+(values.get('encode'+i+'-2-0').out[0]?2**i:0),0)"),n);
  for(const [digit,value] of [['tens',Math.floor(n/10)],['units',n%10]]){
    assert.equal(run(`values.get('${digit}Display').in.map(Number).join('')`),run(`[...SEGMENT_NAMES].map(s=>Number(SEGMENT_DIGITS[${value}].includes(s))).join('')`));
  }
}
test('counter counts all 16 states and wraps twice without extra advances during a held pulse',()=>{
  const run=rig();assert.equal(run('valid(model)'),true);expectCount(run,0);
  for(let i=1;i<=32;i++){
    run("pressButton(nodeBy('count')); ");expectCount(run,i%16);
    run('simulate(true,1000);');expectCount(run,i%16);
  }
});
test('counter reset reaches zero from every count and accepts the next count',()=>{
  const run=rig();
  for(let n=0;n<16;n++){
    run(`resetTiming();nodeBy('resetMemory').bit=false;nodeBy('resetMemory').memoryInput=[false,false,false,false];nodeBy('counter').channel=${n};nodeBy('counter').memoryInput=[false];simulate(false);pressButton(nodeBy('reset'));simulate(true,6500);`);
    expectCount(run,0);
    assert.equal(run("nodeBy('resetMemory').bit"),false,`reset finished from ${n}`);
    run("pressButton(nodeBy('count'));simulate(true,500);");expectCount(run,1);
  }
});
test('counter count survives save/import without replaying a pulse',()=>{
  const run=rig();
  for(let i=0;i<9;i++)run("pressButton(nodeBy('count'));simulate(true,500);");
  run('model=normalize(JSON.parse(JSON.stringify(model)));resetTiming();simulate(false);');
  expectCount(run,9);
  run("pressButton(nodeBy('count'));simulate(true,500);");expectCount(run,10);
});
