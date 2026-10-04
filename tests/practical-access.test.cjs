const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function rig(id){
  const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(source+`;renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'));simulate(false);`,ctx);
  return code=>vm.runInContext(code,ctx);
}
function setCode(run,n){run(`for(let bit=0;bit<4;bit++)nodeBy('code'+bit).on=!!(${n}&(1<<bit));simulate(false);`);}
function out(run,id){return !!run(`values.get('${id}').out[0]`);}
function press(run,id){run(`pressButton(nodeBy('${id}'));simulate(true,400);`);}

test('four-switch pattern matches only 1011 and output wire follows its gate',()=>{
  const run=rig('four-switch-code');
  assert.equal(run('valid(model)'),true);
  const matchWire=run("model.wires.find(w=>w.from.node==='match'&&w.style==='neon').id");
  for(let n=0;n<16;n++){
    setCode(run,n);
    assert.equal(out(run,'match'),n===11,`code ${n}`);
    assert.equal(!!run(`wirePowerDetails('${matchWire}').powered`),n===11,'visible MATCH wire');
  }
});

test('wrong entry latches alarm, blocks unlock, and reset restores a fresh attempt',()=>{
  const run=rig('entry-code-lock');
  assert.equal(run('valid(model)'),true);
  assert.equal(out(run,'unlockMemory'),false);
  setCode(run,9);press(run,'enter');
  assert.equal(out(run,'alarmMemory'),true);
  assert.equal(out(run,'unlockMemory'),false);
  setCode(run,11);press(run,'enter');
  assert.equal(out(run,'unlockMemory'),false,'right code cannot bypass a latched alarm');
  press(run,'reset');
  assert.equal(out(run,'alarmMemory'),false);
  assert.equal(out(run,'unlockMemory'),false);
  press(run,'enter');
  assert.equal(out(run,'unlockMemory'),true);
  assert.equal(out(run,'locked'),false);
  setCode(run,0);
  assert.equal(out(run,'unlockMemory'),true,'code changes do not cancel remembered unlock');
  press(run,'reset');
  assert.equal(out(run,'unlockMemory'),false);
  assert.equal(out(run,'locked'),true);
});
