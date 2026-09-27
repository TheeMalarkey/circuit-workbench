const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
const context=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
vm.runInContext(source+';renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};',context);
const run=code=>vm.runInContext(code,context);
test('large eight-bit adder carries between stages and agrees with references',()=>{
  run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='eight-bit-adder-bench'));simulate(false);");
  assert.equal(run('valid(model)'),true);
  assert.ok(run('model.nodes.length')>=50);
  assert.equal(run(`model.wires.every(w=>{const p=wireEnds(w);return p.slice(1).every((b,i)=>{
    const a=p[i];if(a.x!==b.x&&a.y!==b.y)return false;
    return model.nodes.every(n=>{const f=footprint(n);return !(a.x===b.x?a.x>n.x&&a.x<n.x+f.w&&Math.max(a.y,b.y)>n.y&&Math.min(a.y,b.y)<n.y+f.h:a.y>n.y&&a.y<n.y+f.h&&Math.max(a.x,b.x)>n.x&&Math.min(a.x,b.x)<n.x+f.w);});
  });})`),true,'wires stay outside board interiors');
  for(const [a,b] of [[0,0],[15,1],[255,1],[170,85],[255,255]]){
    run(`for(let i=0;i<8;i++){const p=i<4?'low-':'high-',bit=i%4;nodeBy(p+'a'+bit).on=!!(${a}&(1<<i));nodeBy(p+'b'+bit).on=!!(${b}&(1<<i));}simulate(false);`);
    const result=run("Array.from({length:8},(_,i)=>values.get((i<4?'low-':'high-')+'s'+(i%4)).out[0]?1<<i:0).reduce((a,b)=>a+b,0)+(values.get('high-c3').out[0]?256:0)");
    assert.equal(result,a+b,`${a}+${b}`);
    assert.equal(run("model.nodes.filter(n=>n.id.startsWith('low-check')||n.id.startsWith('high-check')).some(n=>values.get(n.id).out[0])"),false);
  }
});
