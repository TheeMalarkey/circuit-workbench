const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function rig(id){
  const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(source+`;renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'));simulate(false);`,ctx);
  return code=>vm.runInContext(code,ctx);
}
function digit(run,prefix){return run(`nodeBy('${prefix}-selector').channel`);}
function expectDigit(run,prefix,expected){
  assert.equal(digit(run,prefix),expected,`${prefix} state`);
  assert.equal(run(`values.get('${prefix}-display').in.map(Number).join('')`),
    run(`[...SEGMENT_NAMES].map(s=>Number(SEGMENT_DIGITS[${expected}].includes(s))).join('')`),`${prefix} screen`);
}
function count(run){run("pressButton(nodeBy('count'));simulate(true,400);");}

test('one-digit public counter counts 0–9, wraps, resets, and never double-counts a held pulse',()=>{
  const run=rig('decimal-counter');
  assert.equal(run('valid(model)'),true);assert.equal(run("EXPLORER_DESIGNS.some(d=>d.id==='decimal-counter')"),true);
  expectDigit(run,'ones',0);
  for(let i=1;i<=20;i++){
    count(run);expectDigit(run,'ones',i%10);
    run('simulate(true,1000)');expectDigit(run,'ones',i%10);
  }
  for(const n of [1,5,9]){
    run(`nodeBy('ones-selector').channel=${n};simulate(false);pressButton(nodeBy('reset'));simulate(true,4500);`);
    expectDigit(run,'ones',0);
    assert.equal(run("nodeBy('ones-resetMemory').bit"),false,'reset settles');
    count(run);expectDigit(run,'ones',1);
  }
});

test('two-digit tally carries only at nine, wraps 99 to 00, and resets both digits',()=>{
  const run=rig('two-digit-tally');
  assert.equal(run('valid(model)'),true);assert.equal(run("EXPLORER_DESIGNS.some(d=>d.id==='two-digit-tally')"),true);
  for(let i=0;i<=100;i++){
    assert.equal(digit(run,'tens'),Math.floor(i%100/10),`tens at count ${i}`);
    expectDigit(run,'ones',i%10);expectDigit(run,'tens',Math.floor(i%100/10));
    assert.equal(!!run("values.get('at99').out[0]"),i%100===99,`99 light at ${i}`);
    if(i<100)count(run);
  }
  for(const [tens,ones] of [[0,0],[4,7],[9,9]]){
    run(`nodeBy('tens-selector').channel=${tens};nodeBy('ones-selector').channel=${ones};simulate(false);pressButton(nodeBy('reset'));simulate(true,4500);`);
    expectDigit(run,'ones',0);expectDigit(run,'tens',0);
    assert.equal(run("nodeBy('ones-resetMemory').bit||nodeBy('tens-resetMemory').bit"),false,'both resets settle');
    count(run);expectDigit(run,'ones',1);expectDigit(run,'tens',0);
  }
});

test('two-digit reset wins even when a carry pulse is still pending',()=>{
  for(const offset of [50,250,360]){
    const run=rig('two-digit-tally');
    run("nodeBy('ones-selector').channel=9;nodeBy('tens-selector').channel=4;simulate(false);pressButton(nodeBy('count'));");
    run(`simulate(true,${offset});pressButton(nodeBy('reset'));simulate(true,4500);`);
    expectDigit(run,'ones',0);expectDigit(run,'tens',0);
  }
});

test('two-digit tally accepts distinct quick and slow button presses',()=>{
  for(const interval of [360,700]){
    const run=rig('two-digit-tally');
    for(let i=1;i<=22;i++){
      run(`pressButton(nodeBy('count'));simulate(true,${interval});`);
      expectDigit(run,'ones',i%10);expectDigit(run,'tens',Math.floor(i/10));
    }
  }
});
