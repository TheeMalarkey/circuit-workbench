const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../scripts/canvas-wire-prototype.js'),'utf8');
function rig(){
  const drawn=[],frames=[];
  const context={setTransform(...v){this.transform=v},clearRect(){drawn.length=0},setLineDash(v){this.dash=v},stroke(p){drawn.push({path:p.d,stroke:this.strokeStyle,width:this.lineWidth,filter:this.filter,dash:this.dash,transform:this.transform})}};
  const ctx=vm.createContext({Path2D:class {constructor(d){this.d=d}},devicePixelRatio:2,requestAnimationFrame:fn=>{frames.push(fn);return frames.length},getComputedStyle:p=>p.computed,
    document:{createElement:tag=>tag==='canvas'?{style:{},setAttribute(){},getContext:()=>context}:{textContent:''},head:{append(){}}},window:{addEventListener(){}},
    els:{viewport:{clientWidth:800,clientHeight:600,insertBefore(){}},world:{}},view:{x:10,y:20,scale:.5},renderWires(){},paintSignals(){},applyView(){},
    paintedWires:[],prototypeFrames:frames,prototypeDrawn:drawn});
  vm.runInContext(source+`;function fixture(d,layer,stroke='red'){return {dataset:{layer},wireBounds:{x:0,y:0,w:100,h:100},style:{},getAttribute:name=>name==='d'?d:name==='class'?'wire-path':'',computed:{stroke,strokeWidth:'4',strokeLinecap:'round',strokeLinejoin:'round',opacity:'1',filter:'drop-shadow(0px 0px 2px rgb(0, 150, 200))',strokeDasharray:'none'}}}`,ctx);
  return {run:code=>vm.runInContext(code,ctx),flush(){while(frames.length)frames.shift()()},drawn};
}
test('Canvas experiment reuses exact bridge geometry and draws overpasses above underpasses',()=>{
  const r=rig();
  r.run(`paintedWires=[{group:{style:{}},paths:[fixture('M 0 10 L 46 10 Q 50 2 54 10 L 100 10','over'),fixture('M 50 0 L 50 100','under','gray')]}];installCanvasWirePrototype();`);
  r.flush();
  assert.deepEqual(r.drawn.map(d=>d.path),['M 50 0 L 50 100','M 0 10 L 46 10 Q 50 2 54 10 L 100 10']);
  assert.deepEqual(Array.from(r.drawn[0].transform),[1,0,0,1,20,40]);
  assert.equal(r.drawn[1].width,4);assert.match(r.drawn[1].filter,/drop-shadow/);
});
test('Canvas experiment coalesces camera draws, refreshes signals, and leaves edit handles alone',()=>{
  const r=rig();
  r.run(`const p=fixture('M 0 0 L 10 0','under');paintedWires=[{group:{style:{}},paths:[p]}];installCanvasWirePrototype();applyView();applyView();applyView();`);
  assert.equal(r.run('prototypeFrames.length'),1);r.flush();assert.equal(r.drawn.length,1);
  r.run(`p.computed.stroke='cyan';paintSignals();`);r.flush();assert.equal(r.drawn[0].stroke,'cyan');
  r.run(`paintedWires[0].group.style.display='none';applyView();`);r.flush();assert.equal(r.drawn.length,0);
  r.run(`paintedWires=[{group:{style:{}},paths:[fixture('M 1 1 L 20 1','under')]}];renderWires();`);r.flush();assert.equal(r.drawn[0].path,'M 1 1 L 20 1');
});
