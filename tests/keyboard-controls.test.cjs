const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');

function rig(){
  const elements=new Map();
  const element=()=>({
    style:{},dataset:{},children:[],listeners:{},classList:{add(){},toggle(){}},
    setAttribute(){},append(...children){this.children.push(...children);},
    addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);},
    querySelector(){return {textContent:''};},
    clickFromKeyboard(){for(const handler of this.listeners.click||[])handler({detail:0,stopPropagation(){}});},
  });
  const getElementById=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  const ctx=vm.createContext({structuredClone,crypto:require('node:crypto').webcrypto,document:{getElementById,createElement:element},window:{innerWidth:800,innerHeight:600},localStorage:{getItem:()=>null}});
  const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
  vm.runInContext(source+`;render=save=simulate=renderSelection=refreshWireToolUI=()=>{};model={name:'keyboard',nodes:[designNode('lever','lever',0,0)],wires:[]};var leverElement=nodeElement(model.nodes[0],new Set());`,ctx);
  return {run:s=>vm.runInContext(s,ctx)};
}

test('keyboard activation toggles a lever exactly once',()=>{
  const r=rig();
  assert.equal(r.run('!!model.nodes[0].on'),false);
  r.run("leverElement.children.find(el=>el.className.startsWith('node-control')).clickFromKeyboard()");
  assert.equal(r.run('model.nodes[0].on'),true);
  assert.equal(r.run('history.length'),1);
});

test('keyboard activation of a port starts a wire at that port',()=>{
  const r=rig();
  r.run("leverElement.children.find(el=>el.className==='port out').clickFromKeyboard()");
  assert.equal(r.run('draft.anchor.node'),'lever');
  assert.equal(r.run('draft.anchor.side'),'out');
  assert.equal(r.run('draft.anchor.index'),0);
});
