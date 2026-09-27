// Wiki truth tables are specifications, not proof of current in-game bug behavior.
// Source pages and exceptions: evidence-audit.md.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone});
vm.runInContext(source,ctx);
for(const [type,expected] of Object.entries({and:[0,0,0,1],or:[0,1,1,1],xor:[0,1,1,0],nand:[1,1,1,0],nor:[1,0,0,0],xnor:[1,0,0,1]})){
  test(`${type}: all four documented truth-table combinations (ideal logic)`,()=>{
    for(let i=0;i<4;i++)assert.equal(vm.runInContext(`evaluate('${type}',[${!!(i&2)},${!!(i&1)}],{})[0]`,ctx),!!expected[i]);
  });
}
test('Signal Inverter: both documented input states',()=>{
  assert.equal(vm.runInContext("evaluate('inverter',[false],{})[0]",ctx),true);
  assert.equal(vm.runInContext("evaluate('inverter',[true],{})[0]",ctx),false);
});
test('documented gate tables also hold through real shared-wire propagation',()=>{
  const tables={and:[0,0,0,1],or:[0,1,1,1],xor:[0,1,1,0],nand:[1,1,1,0],nor:[1,0,0,0],xnor:[1,0,0,1]};
  for(const [type,outputs] of Object.entries(tables)){
    vm.runInContext(`renderSelection=()=>{};model={nodes:[{id:'a',type:'lever',x:0,y:0},{id:'b',type:'lever',x:0,y:192},{id:'g',type:'${type}',x:384,y:0}],wires:[{id:'wa',from:{node:'a',side:'out',index:0},to:{node:'g',side:'in',index:0},points:[]},{id:'wb',from:{node:'b',side:'out',index:0},to:{node:'g',side:'in',index:1},points:[]}]};resetTiming();`,ctx);
    for(let i=0;i<4;i++){
      assert.equal(vm.runInContext(`nodeBy('a').on=${!!(i&2)};nodeBy('b').on=${!!(i&1)};simulate(false);values.get('g').out[0]`,ctx),!!outputs[i],`${type} input ${i}`);
    }
  }
});
