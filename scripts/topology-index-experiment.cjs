// Test a suspected connectivity bottleneck on a known fixture. Never ship this
// threshold change: an axis/interval index is preferable for arbitrary layouts.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {readSource,createRig}=require('./performance-benchmark.cjs');
const baselineIndex=process.argv.indexOf('--baseline');
const original=readSource(baselineIndex>=0?path.resolve(process.argv[baselineIndex+1]):path.join(__dirname,'../dist/app.js'));
const before='if((right-left+1)*(bottom-top+1)>128){longWires.add(i);return;}';
assert.equal(original.includes(before),true,'Historical experiment requires --baseline pointing to the pre-bounds-tree app.js');
const variant=original.replace(before,'if((right-left+1)*(bottom-top+1)>8192){longWires.add(i);return;}');
function inspect(source){
  const r=createRig(source);r.init('structuredClone(CALCULATOR_DESIGN)');
  const signature=r.run('wireNetworkSignature()');
  const pins=r.run('JSON.stringify([...values])');
  const samples=[];
  for(let i=0;i<3;i++){const start=performance.now();r.run('networkCache=null;wireNetworks()');samples.push(+(performance.now()-start).toFixed(3));}
  return {signature,pins,samples};
}
const a=inspect(original),b=inspect(variant);
assert.equal(a.signature,b.signature,'physical networks must stay identical');
assert.equal(a.pins,b.pins,'initial input/drive/output/uncertainty must stay identical');
const report={scope:'Diagnostic fixture only; indexing threshold is changed in memory, production files are unchanged',beforeColdMs:a.samples,experimentalColdMs:b.samples,networksIdentical:true,initialPinsIdentical:true};
const out=process.argv.indexOf('--output');if(out>=0)fs.writeFileSync(path.resolve(process.argv[out+1]),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
