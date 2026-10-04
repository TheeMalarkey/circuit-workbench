const {test}=require('node:test');
const assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');

function rig(){
  const ctx=loadApp(),frames=new Map();let next=0;
  ctx.performance={now:()=>1000};
  ctx.requestAnimationFrame=callback=>{const id=++next;frames.set(id,callback);return id;};
  ctx.cancelAnimationFrame=id=>frames.delete(id);
  const run=code=>vm.runInContext(code,ctx);
  run(`
    class Element {
      constructor(tag='div'){
        this.tagName=tag;this.children=[];this.dataset={};this.attrs={};this.className='';this.listeners={};this.queries=0;this.writes=0;
        this.style={setProperty:(key,value)=>{this.style[key]=value;}};
        const classes=()=>new Set(this.className.split(' ').filter(Boolean));
        this.classList={contains:key=>classes().has(key),toggle:(key,on)=>{const all=classes();if(on)all.add(key);else all.delete(key);this.className=[...all].join(' ');},add:key=>{const all=classes();all.add(key);this.className=[...all].join(' ');},remove:key=>{const all=classes();all.delete(key);this.className=[...all].join(' ');}};
      }
      setAttribute(key,value){this.writes++;this.attrs[key]=String(value);if(key==='class')this.className=String(value);}
      getAttribute(key){return this.attrs[key]??null;}
      get firstElementChild(){return this.children[0]||null;}
      get nextElementSibling(){if(!this.parentElement)return null;const siblings=this.parentElement.children;return siblings[siblings.indexOf(this)+1]||null;}
      append(...items){for(const item of items){item.parentElement?.removeChild(item);item.parentElement=this;this.children.push(item);}}
      insertBefore(item,before){if(item===before)return;item.parentElement?.removeChild(item);const i=this.children.indexOf(before);item.parentElement=this;if(i<0)this.children.push(item);else this.children.splice(i,0,item);}
      removeChild(item){const i=this.children.indexOf(item);if(i>=0)this.children.splice(i,1);item.parentElement=null;}
      replaceChildren(...items){for(const item of [...this.children])this.removeChild(item);this.append(...items);}
      replaceChild(next,old){this.insertBefore(next,old);this.removeChild(old);}
      addEventListener(type,fn){this.listeners[type]=fn;}
      contains(target){return this===target||this.children.some(child=>child.contains(target));}
      querySelectorAll(selector){this.queries++;const found=[];const matches=el=>selector.split(',').some(s=>s.trim().split('.').filter(Boolean).every(c=>el.classList.contains(c)));const visit=el=>{for(const child of el.children){if(matches(child))found.push(child);visit(child);}};visit(this);return found;}
      querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
      getBoundingClientRect(){return {left:0,top:0,width:800,height:600};}
      setPointerCapture(){}
      set innerHTML(value){this.html=value;this.replaceChildren();for(const match of value.matchAll(/<span class="([^"]+)"/g)){const el=new Element('span');el.className=match[1];this.append(el);}}
      get innerHTML(){return this.html||'';}
    }
    const dom=new Map();document.getElementById=id=>{if(!dom.has(id))dom.set(id,new Element());return dom.get(id);};
    document.createElement=tag=>new Element(tag);document.createElementNS=(_,tag)=>new Element(tag);document.elementFromPoint=()=>null;
    for(const id of Object.keys(els))els[id]=document.getElementById(id);
    const wireRoot=new Element('div');wireRoot.append(els.wires);
    const label=new Element();label.className='tidy-label';document.getElementById('tidy-wires').append(label);
    localStorage.setItem=()=>{};renderPalette=renderWireInspector=renderWirePaint=updateHistory=renderProjectTabs=save=setStatus=()=>{};
    render=()=>renderSelection();view={x:0,y:0,scale:1};viewportSize={w:800,h:600};
    model={name:'Drag test',nodes:[designNode('source','lever',0,0),designNode('sink','or',480,0)],wires:[
      designWire('attached',{node:'source',side:'out',index:0},{node:'sink',side:'in',index:0},[{x:192,y:96}]),
      designWire('far',{x:1000,y:300},{x:1200,y:300},[{x:1100,y:300}])
    ]};resetTiming();simulate(false);renderSelection();
  `);
  return {run,frames,flush(){const queued=[...frames];frames.clear();for(const [,callback] of queued)callback(16);}};
}

test('rapid board drag paints once per frame but keeps the latest model position live',()=>{
  const r=rig();r.run(`selectOnly('node','source');renderSelection();startGroupDrag({pointerId:1,clientX:0,clientY:0});
    const sourceEl=paintedNodes.get('source').el,initialLeft=sourceEl.style.left;
    for(const x of [48,96,144,192])onPointerMove({pointerId:1,pointerType:'mouse',clientX:x,clientY:0});`);
  assert.equal(r.run("nodeBy('source').x"),192);
  assert.equal(r.run('sourceEl.style.left'),r.run('initialLeft'),'pointer bursts must not repaint between animation frames');
  assert.equal(r.frames.size,1);
  r.flush();
  assert.equal(r.run('sourceEl.style.left'),'192px');
  assert.equal(r.run("values.has('sink')"),true);
});

test('wire geometry edits retain SVG paths and untouched hit targets without stale paths',()=>{
  const r=rig();r.run(`const oldAttached=paintedWires.find(w=>w.id==='attached'),oldFar=paintedWires.find(w=>w.id==='far');
    const attachedPath=oldAttached.paths.find(p=>p.dataset.layer==='over'),farPath=oldFar.paths[0],farGroup=oldFar.group,beforeD=attachedPath.getAttribute('d');
    nodeBy('source').x=96;renderSelection();`);
  assert.equal(r.run("paintedWires.find(w=>w.id==='far').paths[0]===farPath"),true,'unaffected wire paths stay mounted');
  assert.equal(r.run("paintedWires.find(w=>w.id==='far').group===farGroup"),true,'unaffected hit targets keep their listeners');
  assert.equal(r.run("paintedWires.find(w=>w.id==='attached').paths.includes(attachedPath)"),true,'moving geometry updates rather than replaces a path');
  assert.notEqual(r.run('attachedPath.getAttribute("d")'),r.run('beforeD'));
});

test('pointer release flushes the final drag and records exactly one undo step',()=>{
  const r=rig();r.run(`selectOnly('node','source');startGroupDrag({pointerId:1,clientX:0,clientY:0});
    onPointerMove({pointerId:1,pointerType:'mouse',clientX:96,clientY:0});
    onPointerUp({type:'pointerup',pointerId:1,pointerType:'mouse',clientX:96,clientY:0});`);
  assert.equal(r.run("paintedNodes.get('source').el.style.left"),'96px');
  assert.equal(r.run('history.length'),1);
  assert.equal(r.run('history[0].nodes[0].x'),0);
  assert.equal(r.run('gesture'),null);
  assert.equal(r.frames.size,0,'release must not leave a delayed drag redraw behind');
});

test('deleting a moving selection cancels its queued paint and undo restores it',()=>{
  const r=rig();r.run(`selectOnly('node','source');startGroupDrag({pointerId:1,clientX:0,clientY:0});
    onPointerMove({pointerId:1,pointerType:'mouse',clientX:96,clientY:0});removeSelected();`);
  assert.equal(r.frames.size,0);
  r.flush();
  assert.equal(r.run("!!nodeBy('source')"),false);
  r.run('undo()');
  assert.equal(r.run("nodeBy('source').x"),0);
  assert.equal(r.run("paintedNodes.get('source').el.style.left"),'0px');
});

test('retained wires still repaint power changes and remove deleted elements',()=>{
  const r=rig();r.run(`const far=paintedWires.find(w=>w.id==='far'),path=far.paths[0];
    model.wires[1].points[0].x=1120;renderSelection();nodeBy('source').on=true;simulate(false);`);
  assert.equal(r.run("paintedWires.find(w=>w.id==='attached').paths.some(p=>p.classList.contains('wire-active'))"),true);
  assert.equal(r.run("paintedWires.find(w=>w.id==='far').paths[0]===path"),true);
  r.run("model.wires=model.wires.filter(w=>w.id!=='far');renderSelection();");
  assert.equal(r.run('els.wires.children.includes(path)'),false);
  assert.equal(r.run("paintedWires.some(w=>w.id==='far')"),false);
});

test('crossing bumps update on retained wires without covering their overpass layer',()=>{
  const r=rig();r.run(`model={nodes:[],wires:[
    designWire('h',{x:0,y:50},{x:200,y:50}),
    designWire('v',{x:100,y:0},{x:100,y:100})
  ]};renderSelection();const hPath=paintedWires.find(w=>w.id==='h').paths[0];
    model.wires[1].from.x=120;model.wires[1].to.x=120;renderSelection();`);
  assert.equal(r.run("paintedWires.find(w=>w.id==='h').paths[0]===hPath"),true);
  assert.equal(r.run("hPath.getAttribute('d')"),'M 0 50 L 116 50 Q 120 42 124 50 L 200 50');
  assert.equal(r.run("els.wires.children.filter(p=>p.dataset.layer).map(p=>p.dataset.layer).join(',')"),'under,over');
  r.run("model.wires[1].from.x=250;model.wires[1].to.x=250;renderSelection();");
  assert.equal(r.run("hPath.getAttribute('d')"),'M 0 50 L 200 50');
});

test('a second touch discards queued board painting and restores its unsaved drag',()=>{
  const r=rig();r.run(`const target={closest:()=>null};
    onTouchPointerDown({pointerType:'touch',pointerId:1,clientX:0,clientY:0,target});
    selectOnly('node','source');startGroupDrag({pointerId:1,clientX:0,clientY:0});
    onPointerMove({pointerType:'touch',pointerId:1,clientX:96,clientY:0});
    onTouchPointerDown({pointerType:'touch',pointerId:2,clientX:200,clientY:0,target,preventDefault(){},stopPropagation(){}});`);
  assert.equal(r.frames.size,0);
  r.flush();
  assert.equal(r.run("nodeBy('source').x"),0);
  assert.equal(r.run("paintedNodes.get('source').el.style.left"),'0px');
  assert.equal(r.run('gesture.type'),'pinch');
  assert.equal(r.run('history.length'),0);
});

test('retained hit targets keep bend and loose-end gestures working after geometry edits',()=>{
  const r=rig();r.run(`model.wires[1].points[0].x=1120;renderSelection();
    selectOnly('wire','far');renderSelection();
    const bend=$('wire-end-handles').children.find(p=>p.dataset.pointIndex===0);
    bend.listeners.pointerdown({button:0,pointerId:1,clientX:1120,clientY:300,stopPropagation(){}});
    onPointerMove({pointerId:1,pointerType:'mouse',clientX:1132,clientY:312});
    onPointerUp({type:'pointerup',pointerId:1,pointerType:'mouse',clientX:1132,clientY:312});`);
  assert.equal(r.run('model.wires[1].points[0].x'),1132);
  assert.equal(r.run('model.wires[1].points[0].y'),312);
  assert.equal(r.run('history.length'),1);
  assert.equal(r.run("$('wire-end-handles').children.filter(p=>p.dataset.end).length"),2);
  assert.equal(r.run("paintedWires.find(w=>w.id==='far').group.querySelector('.wire-hit').getAttribute('d')"),'M 1000 300 L 1132 312 L 1200 300');
});

test('SVG reconciliation does not repeatedly read a live child collection during bulk replacement',()=>{
  const r=rig();r.run(`let childReads=0;
    const old=Array.from({length:200},(_,i)=>({id:'old'+i})),next=Array.from({length:200},(_,i)=>({id:'next'+i}));
    let children=[...old];const parent={
      get children(){childReads++;return children;},get firstElementChild(){return children[0]||null;},
      insertBefore(child,before){const existing=children.indexOf(child);if(existing>=0)children.splice(existing,1);const i=children.indexOf(before);if(i<0)children.push(child);else children.splice(i,0,child);},
      removeChild(child){children.splice(children.indexOf(child),1);}
    };
    for(const child of [...old,...next])Object.defineProperty(child,'nextElementSibling',{get(){return children[children.indexOf(child)+1]||null;}});
    reconcileWireChildren(parent,next);
  `);
  assert.equal(r.run('children.length'),200);
  assert.equal(r.run('children.every((child,i)=>child===next[i])'),true);
  assert.ok(r.run('childReads')<=3,'mutating a live HTMLCollection must not repeatedly rebuild its index');
});

test('board rendering shares a validated node lookup instead of rescanning nodes for each wire end',()=>{
  const r=rig();r.run(`let nodeScans=0;const findNode=model.nodes.find;
    model.nodes.find=function(...args){nodeScans++;return findNode.apply(this,args);};
    model.nodes[0].x=96;renderSelection();`);
  assert.equal(r.run("paintedNodes.get('source').el.style.left"),'96px');
  assert.ok(r.run('nodeScans')<=1,'rendering ordinary boards and endpoints must not repeatedly scan every board');
  r.run("model.nodes[0].id='renamed';");
  assert.equal(r.run("nodeBy('source')"),undefined,'standalone lookups must remain safe after direct ID edits');
  assert.equal(r.run("nodeBy('renamed').x"),96);
});
