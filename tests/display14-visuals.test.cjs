const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
const segmentOrder=['a','b','c','d','e','f','g1','g2','h','i','j','k','l','m'];
const contacts=[[48,21],[77,58],[77,132],[48,170],[19,132],[19,58],[35,96],[61,96],[36,58],[61,58],[36,132],[61,132],[48,58],[48,132]];
function element(namespaceURI,tagName){
  return{namespaceURI,tagName,children:[],attributes:{},style:{setProperty(name,value){this[name]=value;}},
    setAttribute(name,value){this.attributes[name]=String(value);},
    getAttribute(name){return this.attributes[name]??null;},
    append(...children){this.children.push(...children);},
    appendChild(child){this.children.push(child);return child;}};
}
function rig(){
  const ctx=vm.createContext({document:{getElementById:()=>({}),createElement:tag=>element(null,tag),createElementNS:element},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(source,ctx);
  const run=code=>vm.runInContext(code,ctx),json=code=>JSON.parse(run(`JSON.stringify(${code})`));
  return{run,json};
}
function classes(node){return(node.getAttribute('class')||node.className||'').split(/\s+/);}
function polygons(face){return face.children.filter(child=>child.tagName==='polygon'&&classes(child).includes('segment14'));}

test('fourteen-segment SVG contains fourteen unique ordered polygons within its original face',()=>{
  const r=rig(),face=r.run("segment14Face({id:'display'})"),segments=polygons(face);
  assert.equal(face.namespaceURI,'http://www.w3.org/2000/svg');
  assert.equal(face.tagName,'svg');
  assert.equal(face.getAttribute('viewBox'),'0 0 96 192');
  assert.equal(segments.length,14);
  assert.deepEqual(r.json('SEGMENT14_NAMES'),segmentOrder);
  assert.deepEqual(segments.map(segment=>classes(segment).find(name=>name.startsWith('segment14-'))),segmentOrder.map(name=>'segment14-'+name));
  assert.equal(new Set(segments.map(segment=>segment.getAttribute('points'))).size,14);
  segments.forEach((segment,index)=>{
    assert.equal(segment.namespaceURI,'http://www.w3.org/2000/svg');
    assert.ok(classes(segment).includes('segment14'));
    assert.equal(segment.getAttribute('points'),r.run(`SEGMENT14_SHAPES[${JSON.stringify(segmentOrder[index])}]`));
    const points=segment.getAttribute('points').trim().split(/\s+/).map(point=>point.split(',').map(Number));
    assert.ok(points.length>=3,segmentOrder[index]+' is a polygon');
    for(const point of points){assert.equal(point.length,2);assert.ok(point.every(Number.isFinite));assert.ok(point[0]>=0&&point[0]<=96&&point[1]>=0&&point[1]<=192,segmentOrder[index]+' stays inside face');}
  });
});

test('each fourteen-segment SVG polygon reads only its matching input and preview stays unlit',()=>{
  const r=rig();
  for(let active=-1;active<14;active++){
    r.run(`values.set('display',{in:Array.from({length:14},(_,i)=>i===${active}),out:[]})`);
    const segments=polygons(r.run("segment14Face({id:'display'})"));
    assert.deepEqual(segments.flatMap((segment,index)=>classes(segment).includes('lit')?[index]:[]),active<0?[]:[active],`input ${active}`);
  }
  r.run("values.set('display',{in:Array(14).fill(true),out:[]})");
  assert.equal(polygons(r.run("segment14Face({id:'display'})")).filter(segment=>classes(segment).includes('lit')).length,14);
  assert.equal(polygons(r.run("segment14Face({id:'display'},true)")).filter(segment=>classes(segment).includes('lit')).length,0);
});

test('fourteen-segment visual refresh preserves dimensions and all saved-wiring contact positions',()=>{
  const r=rig();
  for(const type of ['display14','converter14']){
    assert.deepEqual(r.json(`footprint(designNode('part',${JSON.stringify(type)},0,0))`),{w:96,h:192});
    const side=type==='display14'?'in':'out';
    assert.deepEqual(r.json(`Array.from({length:14},(_,i)=>localPort({type:${JSON.stringify(type)}},${JSON.stringify(side)},i))`),contacts.map(([x,y])=>({x,y})));
  }
  assert.deepEqual(r.json('SEGMENT14_POSITIONS'),contacts);
  assert.deepEqual(r.json("Array.from({length:6},(_,i)=>localPort({type:'converter14'},'in',i))"),Array.from({length:6},(_,i)=>({x:0,y:16+i*32})));
});

test('Explorer thumbnail uses the same fourteen polygons as the live display',()=>{
  const r=rig();
  const url=r.run("designPreview({id:'display14-visual-regression',nodes:[designNode('display','display14',0,0)],wires:[]})");
  assert.ok(url.startsWith('data:image/svg+xml;charset=utf-8,'));
  const svg=decodeURIComponent(url.slice(url.indexOf(',')+1));
  const points=[...svg.matchAll(/<polygon\b[^>]*\bpoints="([^"]+)"/g)].map(match=>match[1]);
  const shapes=r.json('SEGMENT14_NAMES.map(name=>SEGMENT14_SHAPES[name])');
  assert.deepEqual(points.filter(shape=>shapes.includes(shape)),shapes);
  for(const shape of shapes)assert.equal(points.filter(value=>value===shape).length,1,'one polygon per segment');
  assert.doesNotMatch(svg,/<path\b/,'does not substitute the old generic seven-stroke thumbnail');
});
