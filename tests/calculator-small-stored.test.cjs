const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
const {buildCalculatorSmallStored}=require('../scripts/build-calculator-small-stored.cjs');

// Exercise the actual simulator on the editable logical schematic. Routing and
// accidental physical contacts are checked separately when designs are baked.
function rig(){
  const design=buildCalculatorSmallStored(),ctx=loadApp();
  const parent=new Map(),ports=new Map();
  const key=p=>p.node?`${p.node}:${p.side}:${p.index}`:`free:${p.x}:${p.y}`;
  const find=x=>{
    if(!parent.has(x))parent.set(x,x);
    if(parent.get(x)!==x)parent.set(x,find(parent.get(x)));
    return parent.get(x);
  };
  for(const edge of design._edges){
    const a=key(edge.from),b=key(edge.to);
    if(edge.from.node)ports.set(a,edge.from);
    if(edge.to.node)ports.set(b,edge.to);
    parent.set(find(a),find(b));
  }
  const network={inputs:new Map(),outputs:new Map(),groups:new Map(),contacts:[],byWire:new Map()};
  for(const [id,p] of ports){
    const group=find(id);
    if(!network.inputs.has(group)){
      network.inputs.set(group,[]);network.outputs.set(group,[]);network.groups.set(group,[]);
    }
    network[p.side==='out'?'outputs':'inputs'].get(group).push({...p,point:{x:0,y:0}});
  }
  for(const n of design.nodes.filter(n=>n.type==='converter7'&&n._fixed)){
    const display=n.id.replace('-converter','-display');
    if(design.nodes.some(candidate=>candidate.id===display))for(let index=0;index<7;index++)
      network.contacts.push({from:{node:n.id,index},to:{node:display,index}});
  }
  design.nodes.forEach((n,i)=>{n.x=i*10000;n.y=i*10000;});
  ctx.logicalDesign=design;ctx.logicalNetwork=network;
  vm.runInContext(`
    model=logicalDesign;logicalNetwork.pulseContacts=forwardedInputContacts();wireNetworks=()=>logicalNetwork;
    renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};setStatus=()=>{};
    resetTiming();simulate(false);
  `,ctx);
  const run=code=>vm.runInContext(code,ctx);
  const press=id=>run(`buttonPulses.set(${JSON.stringify(`small-stored-${id}`)},simulationMs+350);simulate(false);`);
  return {
    design,run,press,
    advance:ms=>run(`simulate(true,${ms});`),
    bit:id=>!!run(`nodeBy(${JSON.stringify(`small-stored-${id}`)}).bit`),
    on:id=>!!run(`values.get(${JSON.stringify(`small-stored-${id}`)}).out[0]`),
    word:(prefix,count)=>run(`Array.from({length:${count}},(_,i)=>nodeBy(${JSON.stringify(`small-stored-${prefix}-`)}+i).bit?2**i:0).reduce((a,b)=>a+b,0)`),
    screen:id=>run(`(()=>{const pins=values.get(${JSON.stringify(`small-stored-${id}-display`)}).in;const lit=[...SEGMENT_NAMES].filter((_,i)=>pins[i]).join('');return lit==='g'?'-':String(SEGMENT_DIGITS.findIndex(glyph=>glyph===lit));})()`)
  };
}
function enter(r,digit){r.press(`key${digit}`);r.advance(400);}
function store(r,variable,digit){enter(r,digit);r.press(`set${variable}`);r.advance(1200);}
function calculate(r,op){r.press(`op-${op}`);r.advance(400);r.press('calculate');r.advance(1200);}
function result(r){return r.screen('result-1')+r.screen('result-0');}

test('small stored calculator has a unique editable physical-part design',()=>{
  const d=buildCalculatorSmallStored();
  assert.equal(d.id,'calculator-small-stored');
  assert.equal(new Set(d.nodes.map(n=>n.id)).size,d.nodes.length);
  assert.ok(d.nodes.every(n=>n.type!=='calculator'&&n.type!=='displayText'));
  assert.ok(d._edges.every(edge=>!edge.from.node||d.nodes.some(n=>n.id===edge.from.node)));
  assert.ok(d._edges.every(edge=>!edge.to.node||d.nodes.some(n=>n.id===edge.to.node)));
  assert.equal(d.nodes.filter(n=>n.type==='display7').length,5);
});

test('small stored calculator copies one digit to each variable and clears only the entry',()=>{
  const r=rig();
  assert.equal(r.screen('entry'),'0');
  enter(r,9);assert.equal(r.screen('entry'),'9');
  r.press('set1');
  assert.equal(r.word('var1',4),9,'variable A captures before entry clear');
  assert.equal(r.screen('var1'),'9');
  r.advance(1200);
  assert.equal(r.screen('entry'),'0');
  assert.equal(r.screen('var1'),'9');
  assert.equal(r.on('ready'),false);
  store(r,2,8);
  assert.equal(r.screen('var1'),'9');
  assert.equal(r.screen('var2'),'8');
  assert.equal(r.on('ready'),true);
  enter(r,4);assert.equal(r.screen('entry'),'4','entry is ready for another input');
  r.press('set1');r.advance(1200);
  assert.equal(r.screen('var1'),'4');
  assert.equal(r.screen('var2'),'8');
  assert.equal(r.screen('entry'),'0');
});

test('small stored calculator computes 9+9, 9×9, 0×9 and 0−9 with held displays',()=>{
  const r=rig();
  r.press('calculate');r.advance(400);
  assert.equal(r.on('busy'),false,'Calculate is disabled until A and B are stored');
  store(r,1,9);store(r,2,9);
  calculate(r,'add');
  assert.equal(r.word('answer',8),18);assert.equal(result(r),'18');
  calculate(r,'mul');
  assert.equal(r.word('answer',8),81);assert.equal(result(r),'81');
  store(r,1,0);
  assert.equal(result(r),'81','setting A does not alter the held answer');
  calculate(r,'mul');
  assert.equal(r.word('answer',8),0);assert.equal(result(r),'00');
  calculate(r,'sub');
  assert.equal(r.bit('answer-negative-0'),true);
  assert.equal(result(r),'-9');
  store(r,2,0);calculate(r,'sub');
  assert.equal(r.bit('answer-negative-0'),false);
  assert.equal(result(r),'00');
});

test('small stored calculator re-arms controls after each capture',()=>{
  const r=rig();store(r,1,7);store(r,2,5);
  calculate(r,'sub');assert.equal(result(r),'02');
  calculate(r,'add');assert.equal(result(r),'12');
  calculate(r,'mul');assert.equal(result(r),'35');
  store(r,2,8);calculate(r,'add');assert.equal(result(r),'15');
  assert.equal(r.on('busy'),false);
});
