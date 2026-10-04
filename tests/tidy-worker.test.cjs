const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {loadApp}=require('../scripts/compact-circuit.cjs');
test('background routing has no timeout and cancellation terminates its worker',async()=>{
 const ctx=loadApp();let worker,terminated=0;
 ctx.Worker=class{constructor(){worker=this;}postMessage(data){this.data=data;}terminate(){terminated++;}};
 ctx.setTimeout=()=>{throw Error('Routing must not create a deadline timer');};
 const pending=vm.runInContext("routeTidyInWorker({nodes:[],wires:[]},['chosen'])",ctx);
 assert.equal(worker.data.wireIds[0],'chosen');
 vm.runInContext('cancelTidyWorker()',ctx);
 await assert.rejects(pending,e=>e.code==='TIDY_CANCELLED');assert.equal(terminated,1);
 worker.onmessage({data:{result:{wires:[]}}});assert.equal(terminated,1);
 assert.equal(vm.runInContext('cancelTidyWorker',ctx),null);
});
test('routing no longer rejects the old wire-count limit',()=>{
 const ctx=loadApp();assert.equal(vm.runInContext(`(()=>{const edges=Array.from({length:1001},(_,i)=>({from:{x:i*12,y:0},to:{x:i*12,y:0}}));return routeDesignWires([],edges,'tidy').length;})()`,ctx),1001);
 const src=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8');
 assert.doesNotMatch(src,/TIDY_LIMIT|checkTidyBudget|tidyLimitError|Circuit too large for automatic routing/);
});
test('generated background worker uses current engine and returns routed wires',()=>{
 const src=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
 const worker=fs.readFileSync(path.join(__dirname,'../dist/routing-worker.js'),'utf8');assert.ok(worker.includes(src),'regenerate worker after app edits');
 let result;const ctx=vm.createContext({structuredClone,crypto:require('node:crypto').webcrypto,self:{postMessage:r=>result=r}});
 vm.runInContext(worker,ctx);
 vm.runInContext(`self.onmessage({data:{name:'test',nodes:[],wires:[{id:'a',from:{x:0,y:0},to:{x:96,y:96},points:[{x:0,y:96}],style:'normal'}]}})`,ctx);
 assert.ok(result.result,result.error);assert.equal(result.result.wires[0].id,'a');
});
