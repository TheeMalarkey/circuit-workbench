const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
test('selection includes explicit wires and selected board connections, not unrelated wires',()=>{
 const ctx=loadApp();
 assert.equal(vm.runInContext(`(()=>{
 model={nodes:[designNode('g','or',0,0)],wires:[
 designWire('connected',{x:-96,y:24},{node:'g',side:'in',index:0}),
 designWire('free',{x:300,y:300},{x:400,y:300}),
 designWire('other',{x:500,y:500},{x:600,y:500})]};
 selectedNodes=new Set(['g']);selectedWires=new Set(['free']);
 return JSON.stringify(tidySelectionIds().sort());})()`,ctx),'["connected","free"]');
 assert.equal(vm.runInContext('selectedNodes.clear();selectedWires.clear();tidySelectionIds()',ctx),null);
 assert.equal(vm.runInContext("model.wires=[];selectedNodes.add('g');tidySelectionIds().length",ctx),0);
});
test('scoped best-effort routing never moves unselected wires or boards',()=>{
 const ctx=loadApp();
 assert.equal(vm.runInContext(`(()=>{
 model={nodes:[],wires:[designWire('chosen',{x:0,y:0},{x:96,y:96},[{x:0,y:240},{x:96,y:240}]),designWire('fixed',{x:240,y:0},{x:240,y:240})]};
 const before=JSON.stringify(model),fixed=JSON.stringify(model.wires[1]);
 const result=planTidyBestEffort(new Set(['chosen']));
 return before===JSON.stringify(model)&&fixed===JSON.stringify(result.wires[1])&&JSON.stringify(result.wires[0])!==JSON.stringify(model.wires[0]);})()`,ctx),true);
});
