const fs=require('node:fs'),vm=require('node:vm');
const {loadApp}=require('./compact-circuit.cjs');
const ctx=loadApp();
const json=vm.runInContext(`(()=>{
 const nodes=[designNode('adder','fullAdder',0,0)];
 const edges=Array.from({length:8},(_,i)=>({from:{x:-192,y:192+i*24},to:{node:'adder',side:'in',index:i}}));
 return JSON.stringify({name:'Ordered adder lanes',nodes,wires:routeDesignWires(nodes,edges,'tidy')},null,2);
})()`,ctx);
fs.writeFileSync(require('node:path').join(__dirname,'../audit/ordered-adder-lanes.json'),json);
