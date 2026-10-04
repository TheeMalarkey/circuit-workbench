const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
function rig(expression){
  const ctx=loadApp(),run=code=>vm.runInContext(code,ctx);
  // Browser DOM boundary only: nodeElement/renderNodes/paintSignals/timing stay real.
  run(`class PaintElement{
    constructor(tag='div'){
      this.tagName=tag;this.children=[];this.dataset={};this.attrs={};this.style={};this.className='';this.queries=0;this.toggles=0;this.htmlWrites=0;
      const classes=()=>new Set(this.className.split(' ').filter(Boolean));
      this.classList={toggle:(key,on)=>{this.toggles++;const all=classes();if(on)all.add(key);else all.delete(key);this.className=[...all].join(' ');},
        add:(key)=>{const all=classes();all.add(key);this.className=[...all].join(' ');},contains:key=>classes().has(key)};
    }
    setAttribute(key,value){this.attrs[key]=String(value);if(key==='class')this.className=String(value);}
    getAttribute(key){return this.attrs[key];}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.children=children;}
    replaceChild(next,old){this.children[this.children.indexOf(old)]=next;}
    addEventListener(){}
    contains(target){return this===target||this.children.some(child=>child.contains(target));}
    querySelectorAll(selector){
      this.queries++;const matches=el=>selector.split(',').some(s=>s.trim().split('.').filter(Boolean).every(c=>el.classList.contains(c)));
      const found=[];const visit=el=>{for(const child of el.children){if(matches(child))found.push(child);visit(child);}};visit(this);return found;
    }
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    set innerHTML(value){this.htmlWrites++;this.html=value;this.children=[];for(const match of value.matchAll(/<span class="([^"]+)"/g)){const el=new PaintElement('span');el.className=match[1];this.children.push(el);}}
    get innerHTML(){return this.html||'';}
  }
  const domElements=new Map();document.getElementById=id=>{if(!domElements.has(id))domElements.set(id,new PaintElement());return domElements.get(id);};
  document.createElement=tag=>new PaintElement(tag);document.createElementNS=(_,tag)=>new PaintElement(tag);
  els.nodes=new PaintElement();els['empty-hint']=new PaintElement();
  renderSelection=save=setStatus=()=>{};
  model=${expression};resetTiming();simulate(false);renderNodes();paintedModel=model;
  let paintReads=[];const originalPaintKey=signalPaintKey;signalPaintKey=n=>{paintReads.push(n.id);return originalPaintKey(n);};
  const nodeEl=id=>paintedNodes.get(id).el;
  function resetReads(){paintReads=[];els.nodes.queries=0;}
  resetReads();`);
  return {run,json:code=>JSON.parse(run(`JSON.stringify(${code})`))};
}

test('an electrical change skips unchanged component paint keys but updates its affected ports',()=>{
  const r=rig(`{nodes:[designNode('a','lever',0,0),designNode('b','lever',480,0),designNode('sink','inverter',960,0)],wires:[
    designWire('feed',{node:'a',side:'out',index:0},{node:'sink',side:'in',index:0})]}`);
  r.run("nodeBy('a').on=true;simulate(false);");
  assert.equal(r.run("nodeEl('sink').querySelector('.in').classList.contains('active')"),true);
  assert.equal(r.run("nodeEl('a').querySelector('.node-control').getAttribute('aria-pressed')"),'true');
  assert.equal(r.run("paintReads.includes('b')"),false,'unchanged components need no serialized paint comparison');
  assert.deepEqual(r.json('paintReads'),['a','sink']);
  r.run("resetReads();nodeBy('a').on=false;simulate(false);");
  assert.equal(r.run("nodeEl('sink').querySelector('.in').classList.contains('active')"),false);
  assert.equal(r.run("nodeEl('sink').getAttribute('aria-label')"),'Signal Inverter on');
});

test('unchanged calculator buttons still reflect editable busy and ready signals',()=>{
  const r=rig(`{nodes:[
    designNode('ready','lever',0,0,{on:true,calculator:{group:'calc',role:'ready'}}),
    designNode('busy','lever',240,0,{calculator:{group:'calc',role:'busy'}}),
    designNode('calculate','button',480,0,{calculator:{group:'calc',action:'calculate'}}),
    designNode('key','button',720,0,{calculator:{group:'calc',action:'digit'}})
  ],wires:[]}`);
  assert.equal(r.run("nodeEl('calculate').querySelector('.node-control').disabled"),false);
  r.run("nodeBy('busy').on=true;simulate(false);");
  assert.equal(r.run("nodeEl('calculate').querySelector('.node-control').disabled"),true);
  assert.equal(r.run("nodeEl('key').querySelector('.node-control').disabled"),true);
  assert.equal(r.run("values.get('calculate').out[0]"),false,'control repaint is not restricted to changed button output');
  r.run("nodeBy('busy').on=false;nodeBy('ready').on=false;simulate(false);");
  assert.equal(r.run("nodeEl('calculate').querySelector('.node-control').disabled"),true);
  assert.equal(r.run("nodeEl('key').querySelector('.node-control').disabled"),false);
  r.run("nodeBy('ready').on=true;simulate(false);");
  assert.equal(r.run("nodeEl('calculate').querySelector('.node-control').disabled"),false);
});

test('idle timer painting reuses mounted faces without querying every circuit or rewriting unchanged lamps',()=>{
  const r=rig(`{nodes:[designNode('source','lever',0,0),designNode('timer','delay',288,0,{delay:2})],wires:[
    designWire('feed',{node:'source',side:'out',index:0},{node:'timer',side:'in',index:0})]}`);
  r.run("const face=nodeEl('timer').querySelector('.timing-face'),track=face.querySelector('.timing-track'),light=face.querySelector('.timing-input-light');light.toggles=0;track.htmlWrites=0;face.queries=0;resetReads();for(let i=0;i<10;i++)simulate(true,20);");
  assert.equal(r.run('els.nodes.queries'),0,'timer registry avoids a repeated selector traversal across all boards');
  assert.equal(r.run('face.queries'),0,'mounted timer child references are reused');
  assert.equal(r.run('light.toggles'),0);assert.equal(r.run('track.htmlWrites'),0);
  assert.equal(r.run('simulationMs'),200);
  r.run("nodeBy('source').on=true;simulate(false);simulate(true,200);");
  assert.equal(r.run('light.classList.contains(\'lit\')'),true);
  assert.ok(r.run('track.innerHTML').includes('top:55px'),'the timer still paints the advancing tick');
  r.run('simulate(true,200);');
  assert.equal(r.run("values.get('timer').out[0]"),true);
});

test('timer registry follows board replacement and removal rather than painting obsolete faces',()=>{
  const r=rig(`{nodes:[designNode('timer','delay',0,0,{delay:2})],wires:[]}`);
  r.run("const oldFace=nodeEl('timer').querySelector('.timing-face');model.nodes[0]={...model.nodes[0],type:'sustain'};simulate(false);renderNodes();const newFace=nodeEl('timer').querySelector('.timing-face');oldFace.queries=0;simulate(true,20);");
  assert.equal(r.run('oldFace===newFace'),false);assert.equal(r.run('oldFace.queries'),0);
  r.run('model.nodes=[];simulate(false);renderNodes();newFace.queries=0;simulate(true,20);');
  assert.equal(r.run('newFace.queries'),0);assert.equal(r.run('els.nodes.children.length'),0);
});
