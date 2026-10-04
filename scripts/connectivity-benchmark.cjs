// Compare cold connection builds against an explicit saved baseline.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {performance}=require('node:perf_hooks');
const {readSource,createRig}=require('./performance-benchmark.cjs');
const option=name=>{const at=process.argv.indexOf(name);return at<0?null:process.argv[at+1]};
const baseline=option('--baseline');if(!baseline)throw Error('Use --baseline <saved app.js>');
function inspect(file){
  const r=createRig(readSource(file));r.init('structuredClone(CALCULATOR_DESIGN)');
  const signature=r.run('wireNetworkSignature()'),pins=r.run('JSON.stringify([...values])'),samples=[];
  for(let i=0;i<3;i++){const at=performance.now();r.run('networkCache=null;wireNetworks()');samples.push(+(performance.now()-at).toFixed(3));}
  return {signature,pins,samples};
}
const before=inspect(path.resolve(baseline)),after=inspect(path.join(__dirname,'../dist/app.js'));
assert.equal(before.signature,after.signature,'Every physical network must be unchanged');
assert.equal(before.pins,after.pins,'All initial pins and uncertainty must be unchanged');
const report={scope:'Node.js cold wire connectivity build, not browser FPS',beforeMs:before.samples,afterMs:after.samples,networksIdentical:true,initialPinsIdentical:true};
const output=option('--output');if(output)fs.writeFileSync(path.resolve(output),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
