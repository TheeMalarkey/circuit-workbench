const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
const {buildCalculatorSmallAuto}=require('../scripts/build-calculator-small-auto.cjs');
const {layoutAndRoute}=require('../scripts/calculator-routing.cjs');
const {validateElectricalRouting,validateGeometryRouting}=require('../scripts/check-calculator-routing.cjs');

// The generated parts and edges are run by the production simulator. This
// graph connects only the builder's declared wires and the physical contacts
// where a converter is mounted directly beneath its display.
function rig(){
  const design=buildCalculatorSmallAuto(),ctx=loadApp();
  const parent=new Map(),ports=new Map();
  const key=p=>p.node?`${p.node}:${p.side}:${p.index}`:`free:${p.x}:${p.y}`;
  const find=x=>{if(!parent.has(x))parent.set(x,x);if(parent.get(x)!==x)parent.set(x,find(parent.get(x)));return parent.get(x);};
  for(const edge of design._edges){
    const a=key(edge.from),b=key(edge.to);
    if(edge.from.node)ports.set(a,edge.from);if(edge.to.node)ports.set(b,edge.to);
    parent.set(find(a),find(b));
  }
  const network={inputs:new Map(),outputs:new Map(),groups:new Map(),contacts:[],byWire:new Map()};
  for(const [id,p] of ports){
    const group=find(id);
    if(!network.inputs.has(group)){network.inputs.set(group,[]);network.outputs.set(group,[]);network.groups.set(group,[]);}
    network[p.side==='out'?'outputs':'inputs'].get(group).push({...p,point:{x:0,y:0}});
  }
  for(const n of design.nodes.filter(n=>n.type==='converter7'&&n._fixed)){
    const display=n.id.replace('-converter','-display');
    if(design.nodes.some(other=>other.id===display))for(let segment=0;segment<7;segment++)network.contacts.push({from:{node:n.id,index:segment},to:{node:display,index:segment}});
  }
  design.nodes.forEach((n,i)=>{n.x=i*10000;n.y=i*10000;});
  ctx.logicalDesign=design;ctx.logicalNetwork=network;
  vm.runInContext(`
    model=logicalDesign;logicalNetwork.pulseContacts=forwardedInputContacts();wireNetworks=()=>logicalNetwork;
    renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};setStatus=()=>{};
    resetTiming();simulate(false);
  `,ctx);
  const run=code=>vm.runInContext(code,ctx);
  return {
    design,run,
    advance:ms=>run(`simulate(true,${ms});`),
    press:id=>run(`buttonPulses.set(${JSON.stringify(id)},simulationMs+350);simulate(false);`),
    value:prefix=>run(`Array.from({length:4},(_,bit)=>nodeBy(${JSON.stringify(prefix+'-bit-')}+bit).bit?2**bit:0).reduce((a,b)=>a+b,0)`),
    flag:id=>!!run(`nodeBy(${JSON.stringify(id)}).bit`),
    face:id=>run(`(()=>{const pins=values.get(${JSON.stringify(id)}).in;const lit=[...SEGMENT_NAMES].filter((_,i)=>pins[i]).join('');return lit==='g'?'-':lit?String(SEGMENT_DIGITS.findIndex(glyph=>glyph===lit)):' ';})()`),
    result(){return this.face('auto-result-tens-display')+this.face('auto-result-units-display');}
  };
}
function push(r,id){r.press(id);r.advance(400);}
function enter(r,a,op,b){push(r,`auto-key${a}`);push(r,`auto-op-${op}`);push(r,`auto-key${b}`);}

test('auto calculator is an ordinary, smaller, editable graph with no precomputed answers',()=>{
  const d=buildCalculatorSmallAuto();
  assert.equal(d.id,'calculator-small-auto');
  assert.ok(d.nodes.length<250,`expected under 250 parts, got ${d.nodes.length}`);
  assert.ok(d._edges.length>300);
  assert.equal(new Set(d.nodes.map(n=>n.id)).size,d.nodes.length);
  assert.deepEqual(d.wires,[]);
  assert.ok(d.nodes.filter(n=>n.type==='fullAdder').length>=6,'multiplication uses physical adders');
  assert.ok(d.nodes.every(n=>!('answer' in n)&&!('value' in n)));
});

test('the first digit captures A, zero is valid, and the result appears only after B',()=>{
  const r=rig();
  assert.equal(r.result(),'  ');
  push(r,'auto-key0');
  assert.equal(r.value('auto-a'),0);assert.equal(r.flag('auto-a-valid'),true);
  assert.equal(r.flag('auto-b-valid'),false);assert.equal(r.result(),'  ');
  push(r,'auto-op-sub');assert.equal(r.flag('auto-operation-valid'),true);assert.equal(r.result(),'  ');
  r.press('auto-key9');
  assert.equal(r.value('auto-b'),9);assert.equal(r.flag('auto-b-valid'),true);
  assert.equal(r.result(),'-9','B press must complete calculation without a Calculate button or timer');
  r.advance(400);push(r,'auto-key5');
  assert.equal(r.value('auto-b'),9,'later digit presses do not silently overwrite B');
  assert.equal(r.result(),'-9');
});

test('addition, subtraction and multiplication cover their one-digit extremes',()=>{
  const r=rig();
  enter(r,9,'add',9);assert.equal(r.result(),'18');
  push(r,'auto-clear');assert.equal(r.flag('auto-a-valid'),false);assert.equal(r.flag('auto-b-valid'),false);assert.equal(r.result(),'  ');
  enter(r,0,'sub',9);assert.equal(r.result(),'-9');
  push(r,'auto-clear');enter(r,9,'mul',9);assert.equal(r.result(),'81');
  push(r,'auto-op-add');assert.equal(r.result(),'18','changing operation recomputes the live answer');
  push(r,'auto-op-sub');assert.equal(r.result(),'00','equal operands do not show a minus');
});

test('clear/new releases a repeated same key for the next calculation',()=>{
  const r=rig();
  enter(r,7,'mul',7);assert.equal(r.result(),'49');
  push(r,'auto-clear');enter(r,7,'add',7);assert.equal(r.result(),'14');
  assert.equal(r.value('auto-a'),7);assert.equal(r.value('auto-b'),7);
});

test('every one-digit operand pair and all three operators decode correctly',()=>{
  const r=rig();
  for(let a=0;a<=9;a++)for(let b=0;b<=9;b++)for(const [op,operationBits,answer] of [
    ['add',0,a+b],['sub',1,a-b],['mul',2,a*b]
  ]){
    r.run(`for(let i=0;i<4;i++){nodeBy('auto-a-bit-'+i).bit=!!(${a}&(1<<i));nodeBy('auto-b-bit-'+i).bit=!!(${b}&(1<<i));}nodeBy('auto-operation-sub').bit=!!(${operationBits}&1);nodeBy('auto-operation-mul').bit=!!(${operationBits}&2);nodeBy('auto-b-valid').bit=true;simulate(false);`);
    const expected=answer<0?`-${-answer}`:String(answer).padStart(2,'0');
    assert.equal(r.result(),expected,`${a} ${op} ${b}`);
  }
});

test('auto calculator routes to exactly the intended sockets without board or wire overlap',()=>{
  const design=buildCalculatorSmallAuto(),ctx=loadApp();
  design.wires=layoutAndRoute(design.nodes,design._edges,design._groups,
    vm.runInContext('footprint',ctx),vm.runInContext('localPort',ctx),
    {prefix:'calc-auto',sectionWidth:1440,padding:72,sectionGap:336,columns:2}).wires;
  assert.equal(validateElectricalRouting(design,design._edges,ctx).wires,design._edges.length);
  assert.equal(validateGeometryRouting(design,ctx).geometryFailures,0);
});
