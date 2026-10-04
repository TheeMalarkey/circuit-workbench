const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function rig(id){
  const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(source+`;renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'));simulate(false);`,ctx);
  return code=>vm.runInContext(code,ctx);
}
function check(bits,id){
  const run=rig(id),limit=2**bits;
  assert.equal(run('valid(model)'),true);
  assert.equal(run(`EXPLORER_DESIGNS.some(d=>d.id==='${id}')`),true);
  for(let a=0;a<limit;a++)for(let b=0;b<limit;b++){
    run(`for(let bit=0;bit<${bits};bit++){nodeBy('a'+bit).on=!!(${a}&(1<<bit));nodeBy('b'+bit).on=!!(${b}&(1<<bit));}simulate(false);`);
    const result=JSON.parse(run(`JSON.stringify({greater:!!values.get('greaterThrough0').out[0],equal:!!values.get('equalThrough0').out[0],less:!!values.get('lessThrough0').out[0]${bits===4?',alarm:!!values.get(\'atOrAbove\').out[0]':''}})`));
    assert.equal(result.greater,a>b,`${id}: ${a} > ${b}`);
    assert.equal(result.equal,a===b,`${id}: ${a} = ${b}`);
    assert.equal(result.less,a<b,`${id}: ${a} < ${b}`);
    assert.equal([result.greater,result.equal,result.less].filter(Boolean).length,1,'exactly one decision');
    if(bits===4)assert.equal(result.alarm,a>=b,`${a} at/above ${b}`);
  }
}
test('two-bit comparator exhaustively matches all 16 relationships',()=>check(2,'two-bit-comparator'));
test('four-bit threshold exhaustively matches all 256 relationships',()=>check(4,'four-bit-threshold'));
