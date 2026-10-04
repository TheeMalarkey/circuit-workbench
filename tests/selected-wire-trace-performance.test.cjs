const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
function rig(){const ctx=loadApp();return{ctx,run:code=>vm.runInContext(code,ctx),json:code=>JSON.parse(vm.runInContext(`JSON.stringify(${code})`,ctx))};}
function commands(path){
 let at=null;const result=[];
 for(const raw of path.match(/[MLQ][^MLQ]*/g)||[]){const command=raw.trim(),kind=command[0],numbers=command.slice(1).trim().split(/\s+/).map(Number);
  if(kind!=='M')result.push({from:at,command});at=numbers.slice(-2);
 }
 return result;
}
test('large selected traces retain every original line and crossing curve, with much smaller filter bounds',()=>{
 const r=rig(),path='M -10000 0 L -10000 9000 L -4 9000 Q 0 8992 4 9000 L 8000 9000 L 8000 -6000';
 const pieces=r.json(`wireTracePieces(${JSON.stringify(path)})`),original=r.json(`wireRenderPieces(${JSON.stringify(path)})`);
 assert.equal(pieces.length,3);assert.deepEqual(pieces.flatMap(p=>commands(p.d)),commands(path),'inserted moves resume at the exact previous endpoint');
 assert.equal(pieces.filter(p=>p.d.includes('Q 0 8992 4 9000')).length,1,'the bridge is complete and drawn once');
 const area=pieces.reduce((sum,p)=>sum+p.bounds.w*p.bounds.h,0),before=original[0].bounds.w*original[0].bounds.h;
 assert.ok(area<before/100,'filters no longer cover empty space between long legs');
 const bridge=pieces.find(p=>p.d.includes(' Q '));assert.equal(bridge.bounds.y,8976,'curve and glow remain in its visibility bounds');
});
test('compact selected traces keep the exact original single SVG path',()=>{
 const r=rig(),path='M 0 0 L 12 0 Q 16 -8 20 0 L 48 0 L 48 48';
 assert.deepEqual(r.json(`wireTracePieces(${JSON.stringify(path)})`),r.json(`wireRenderPieces(${JSON.stringify(path)})`));
 assert.equal(r.json(`wireTracePieces(${JSON.stringify(path)})`)[0].d,path);
});
test('long calculator result trace preserves original geometry without its giant empty filtered surface',()=>{
 const r=rig();r.run(`model=structuredClone(CALCULATOR_DESIGN);const drawing=wireDrawing(wireNetworks());globalThis.longTrace=drawing.paths.get('calculator-2604');`);
 const path=r.run('longTrace'),pieces=r.json('wireTracePieces(longTrace)'),original=r.json('wireRenderPieces(longTrace)');
 assert.ok(pieces.length>1);assert.deepEqual(pieces.flatMap(p=>commands(p.d)),commands(path));
 const area=pieces.reduce((sum,p)=>sum+p.bounds.w*p.bounds.h,0),before=original[0].bounds.w*original[0].bounds.h;
 assert.ok(area<before/50,`${before} → ${area} world-pixel filter bounds`);
});
test('trace rendering keeps selected wires, hit paths, endpoints and bends intact, and clears obsolete trace pieces',()=>{
 const r=rig();r.run(`class TraceSvg{
  constructor(){this.children=[];this.attrs={};this.dataset={};this.style={setProperty:(key,value)=>this.attrs[key]=value};}
  setAttribute(key,value){this.attrs[key]=String(value);}append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}addEventListener(){}
 }
 const traceElements=new Map();document.getElementById=id=>{if(!traceElements.has(id))traceElements.set(id,new TraceSvg());return traceElements.get(id);};
 document.createElementNS=()=>new TraceSvg();els.wires=new TraceSvg();
 model={nodes:[],wires:[
  {id:'selected',from:{x:-10000,y:0},to:{x:9000,y:-6000},points:[{x:-10000,y:9000},{x:9000,y:9000}]},
  {id:'crossing',from:{x:0,y:8500},to:{x:0,y:9500},points:[]}
 ]};selectedWires=new Set(['selected']);selected={kind:'wire',id:'selected'};const before=JSON.stringify(model);renderWires();
 const originalTrace=wireDrawing(wireNetworks()).paths.get('selected');
 `);
 assert.equal(r.run('JSON.stringify(model)===before'),true);
 assert.deepEqual(r.json('[...selectedWires]'),['selected']);assert.equal(r.run('paintedTraces.length'),3);
 assert.deepEqual(r.json('paintedTraces.map(t=>t.el.attrs.d)').flatMap(commands),commands(r.run('originalTrace')));
 assert.equal(r.run("paintedTraces.every(t=>t.id==='selected'&&t.el.attrs.class==='wire-trace'&&t.bounds.w>0&&t.bounds.h>0)"),true);
 assert.equal(r.run("$('wire-end-handles').children.filter(e=>e.attrs.class?.startsWith('waypoint')).length"),4,'both bends and both endpoints remain editable');
 assert.equal(r.run("els.wires.children.flatMap(g=>g.children).filter(e=>e.attrs.class==='wire-hit').every(e=>e.attrs.d===pathFor(wireEnds(model.wires.find(w=>w.id===e.dataset.id))))"),true,'hit geometry is unchanged');
 r.run('const mountedTrace=paintedTraces[0].el;renderWires();');assert.equal(r.run('paintedTraces[0].el===mountedTrace'),true,'unchanged selection reuses mounted geometry');
 r.run('selectedWires.clear();selected=null;renderWires();');assert.equal(r.run('paintedTraces.length'),0);
 assert.equal(r.run("$('wire-end-handles').children.some(e=>e.attrs.class==='wire-trace')"),false);
});
