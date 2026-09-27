const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function app(){
  const timers=new Map(),frames=[];let id=0;const label={textContent:''};
  const button={dataset:{},setAttribute(k,v){this[k]=v;},querySelector:()=>label};
  const ctx=vm.createContext({structuredClone,document:{getElementById:()=>button},localStorage:{getItem:()=>null},requestAnimationFrame:cb=>frames.push(cb),setTimeout:(cb,delay)=>{timers.set(++id,{cb,delay});return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(source+`;model={nodes:[],wires:[{id:'wire',points:[]}]};let plans=0,edits=0;planTidyBestEffort=()=>{plans++;return {wires:[{id:'wire',points:[{x:12,y:12}]}],skipped:0,areas:1};};checkpoint=()=>{};changed=()=>edits++;setStatus=()=>{throw Error('Tidy must not write footer status');};`,ctx);
  return {run:s=>vm.runInContext(s,ctx),button,label,flush(){frames.splice(0).forEach(cb=>cb());for(const [key,t] of [...timers])if(t.delay===0){timers.delete(key);t.cb();}},reset(){for(const [key,t] of [...timers])if(t.delay===3000){timers.delete(key);t.cb();}}};
}
test('tidy paints busy before work, blocks repeat clicks, then resets green feedback',()=>{
  const r=app();r.run('tidyWires();tidyWires();');assert.equal(r.button.dataset.state,'busy');assert.equal(r.button.disabled,true);assert.equal(r.run('plans'),0);
  r.flush();assert.equal(r.run('plans'),1);assert.equal(r.run('edits'),1);assert.equal(r.button.dataset.state,'done');assert.equal(r.button.disabled,false);
  r.reset();assert.equal(r.label.textContent,'Tidy wires');assert.equal(r.button.dataset.state,'');
});
test('failed or partial tidy reports a warning without claiming full success',()=>{
  const r=app();r.run("planTidyBestEffort=()=>{throw Error('blocked');};tidyWires();");r.flush();assert.equal(r.button.dataset.state,'warning');assert.equal(r.run('edits'),0);assert.equal(r.run('tidyBusy'),false);
  r.run("planTidyBestEffort=()=>({wires:model.wires,skipped:1,areas:0});tidyWires();");r.flush();assert.equal(r.label.textContent,'Partly tidied');
});
test('switching project before queued tidy leaves both circuits untouched',()=>{
  const r=app();r.run('tidyWires();model={nodes:[],wires:[]};');r.flush();assert.equal(r.run('plans'),0);assert.equal(r.label.textContent,'Cancelled');assert.equal(r.run('tidyBusy'),false);
});
