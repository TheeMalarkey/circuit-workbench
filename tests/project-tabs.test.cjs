const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
const key='circuit-workbench-v1-projects';
function app(store=new Map()){
  let id=0;
  const elements=new Map();
  const element=()=>({classList:{remove(){}},querySelector:()=>null,setAttribute(name,value){this[name]=value;}});
  const ctx=vm.createContext({structuredClone,crypto:{randomUUID:()=>`p-${++id}`},clearTimeout(){},setTimeout(){},document:{getElementById:id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);}},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)}});
  vm.runInContext(source+';render=()=>{};renderProjectTabs=()=>{};renderSelection=()=>{};updateHistory=()=>{};fit=()=>{};initializeProjects();',ctx);
  return {store,run:code=>vm.runInContext(code,ctx)};
}
test('playback controls follow the restored project state',()=>{
  const r=app();r.run('running=false;updatePlaybackControls();');
  assert.equal(r.run("$('step').hidden"),false);assert.equal(r.run("$('run-toggle')['aria-label']"),'Play simulation');
  r.run('newProject();');assert.equal(r.run("$('step').hidden"),true);assert.equal(r.run("$('run-toggle')['aria-label']"),'Pause simulation');
});
test('rename persists active and inactive projects without switching or losing circuits',()=>{
  const r=app();
  r.run("const first=activeProjectId;model.nodes.push({id:'lever',type:'lever',x:0,y:0});newProject();const second=activeProjectId;renameProject(first,'  My first build  ');renameProject(second,'Second build');");
  assert.equal(r.run('activeProjectId===second'),true);
  assert.equal(r.run("projects.find(p=>p.id===first).model.nodes.length"),1);
  const reload=app(r.store);
  assert.equal(reload.run('model.name'),'Second build');
  assert.equal(reload.run('projects[0].model.name'),'My first build');
  assert.equal(r.run("renameProject(second,'   ')"),false);
  assert.equal(r.run('renameProject(second,null)'),false);
  assert.equal(r.run('model.name'),'Second build');
});

test('existing single project migrates without overwriting the legacy save',()=>{
  const legacy=JSON.stringify({name:'Existing build',nodes:[{id:'lever',type:'lever',x:0,y:0,rotation:0,on:true}],wires:[]});
  const r=app(new Map([['circuit-workbench-v1',legacy]]));
  assert.equal(r.run('model.name'),'Existing build');
  r.run('persistProjects()');
  assert.equal(r.store.get('circuit-workbench-v1'),legacy);
  assert.equal(JSON.parse(r.store.get(key)).projects.length,1);
});
test('switching preserves independent circuits, view, undo and timed state',()=>{
  const r=app();
  r.run("model.name='First';model.nodes.push({id:'timer',type:'delay',delay:12,x:0,y:0,rotation:0});checkpoint();view={x:22,y:33,scale:1.5};running=false;simulationMs=500;tick=2;circuitBuffers.set('timer',{input:true,output:false,events:[{at:2400,on:true}],pulses:[],holdUntil:0});const first=activeProjectId;newProject();const second=activeProjectId;model.name='Second';view.x=999;checkpoint();switchProject(first);");
  assert.equal(r.run('model.name'),'First');assert.equal(r.run('view.x'),22);assert.equal(r.run('view.scale'),1.5);
  assert.equal(r.run('running'),false);assert.equal(r.run('history.length'),1);assert.equal(r.run('simulationMs'),500);
  assert.equal(r.run("circuitBuffers.get('timer').events[0].at"),2400);
  r.run('switchProject(second);');assert.equal(r.run('model.name'),'Second');assert.equal(r.run('model.nodes.length'),0);assert.equal(r.run('view.x'),999);
});
test('closed projects remain saved and can be reopened after refresh',()=>{
  const r=app();r.run("model.name='Keep me';const first=activeProjectId;newProject();closeProject(first);persistProjects();");
  const reload=app(r.store);
  assert.equal(reload.run('projects.length'),2);
  assert.equal(reload.run("projects.find(p=>p.model.name==='Keep me').open"),false);
  reload.run("switchProject(projects.find(p=>p.model.name==='Keep me').id);");assert.equal(reload.run('model.name'),'Keep me');
});
test('closing the final tab opens a blank one without deleting its saved project',()=>{
  const r=app();r.run("model.name='Closed build';closeProject(activeProjectId);");
  assert.equal(r.run('projects.filter(p=>p.open).length'),1);assert.equal(r.run('projects.length'),2);
  assert.equal(r.run("projects.find(p=>p.model.name==='Closed build').open"),false);
});
test('import creates an independent new tab and clipboard remains available across tabs',()=>{
  const r=app();r.run("model.name='Original';copied={nodes:[],wires:[]};const incoming={name:'Imported',nodes:[],wires:[]};newProject(incoming);model.name='Changed';");
  assert.equal(r.run('projects.length'),2);assert.equal(r.run('projects[0].model.name'),'Original');assert.equal(r.run('incoming.name'),'Imported');assert.equal(r.run('copied!==null'),true);
  assert.throws(()=>r.run("newProject({name:'Broken',nodes:[{}],wires:[]});"));assert.equal(r.run('projects.length'),2);
});
test('refresh restores active project, all circuits, camera and play setting',()=>{
  const r=app();r.run("newProject();model.name='Active';view={x:101,y:-50,scale:.7};running=false;persistProjects();");
  const reload=app(r.store);assert.equal(reload.run('model.name'),'Active');assert.equal(reload.run('view.x'),101);assert.equal(reload.run('running'),false);assert.equal(reload.run('projects.length'),2);
});
test('storage failure keeps projects in memory and reports unsaved state',()=>{
  const r=app();r.run("localStorage.setItem=()=>{throw Error('quota');};model.name='Unsaved';");
  assert.equal(r.run('persistProjects()'),false);assert.equal(r.run('model.name'),'Unsaved');assert.match(r.run("els['save-status'].textContent"),/Could not save/);
});
test('memory transients freeze in inactive project tabs and resume on return',()=>{
  const r=app();r.run("model.nodes.push({id:'memory',type:'buffer1',x:0,y:0,rotation:0,bit:true});memoryStates.set('memory',{old:false,until:200});simulationMs=100;const first=activeProjectId;newProject();simulate(true,500);switchProject(first);");
  assert.equal(r.run('simulationMs'),100);assert.equal(r.run("memoryOutputs(nodeBy('memory')).join(',')"),'true');
  assert.equal(r.run("memoryStates.get('memory').until"),200);
  r.run('simulate(true,100);');assert.equal(r.run("memoryOutputs(nodeBy('memory')).join(',')"),'true');
});
