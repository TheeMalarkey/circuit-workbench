const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
const {buildCalculator}=require('../scripts/build-calculator.cjs');

// These tests verify the logical schematic before placement. Only electrical
// connectivity is supplied directly: gates, buffers, timers, button pulses,
// propagation, display conversion and the simulation clock are the real app.
// Physical route clearance and accidental route contacts need separate tests.
function rig(){
  const design=buildCalculator(),ctx=loadApp();
  const parent=new Map(),ports=new Map();
  const key=p=>p.node?`${p.node}:${p.side}:${p.index}`:`free:${p.x}:${p.y}`;
  const find=x=>{if(!parent.has(x))parent.set(x,x);if(parent.get(x)!==x)parent.set(x,find(parent.get(x)));return parent.get(x);};
  for(const edge of design._edges){
    const a=key(edge.from),b=key(edge.to);if(edge.from.node)ports.set(a,edge.from);if(edge.to.node)ports.set(b,edge.to);parent.set(find(a),find(b));
  }
  const network={inputs:new Map(),outputs:new Map(),groups:new Map(),contacts:[],byWire:new Map()};
  for(const [id,p] of ports){
    const group=find(id);
    if(!network.inputs.has(group)){network.inputs.set(group,[]);network.outputs.set(group,[]);network.groups.set(group,[]);}
    network[p.side==='out'?'outputs':'inputs'].get(group).push({...p,point:{x:0,y:0}});
  }
  // Converter/display boards deliberately share one footprint in the design.
  // The leftmost result screen instead uses explicit sign-selection wires.
  for(const n of design.nodes.filter(n=>n.type==='converter7'&&n._fixed)){
    const display=n.id.replace('-converter-','-display-');
    if(design.nodes.some(n=>n.id===display))for(let index=0;index<7;index++)network.contacts.push({from:{node:n.id,index},to:{node:display,index}});
  }
  // Distinct positions avoid inventing extra socket contacts before routing.
  design.nodes.forEach((n,i)=>{n.x=i*10000;n.y=i*10000;});
  ctx.logicalDesign=design;ctx.logicalNetwork=network;
  vm.runInContext(`
    model=logicalDesign;logicalNetwork.pulseContacts=forwardedInputContacts();wireNetworks=()=>logicalNetwork;
    renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};setStatus=()=>{};
    resetTiming();simulate(false);
  `,ctx);
  const run=code=>vm.runInContext(code,ctx);
  return {
    run,
    advance:ms=>run(`simulate(true,${ms});`),
    // Inject the same 350 ms ordinary source pulse as a physical button. Bypass
    // UI click guards so Busy protection must be provided by the wired circuit.
    press:id=>run(`buttonPulses.set(${JSON.stringify(id)},simulationMs+350);simulate(false);`),
    bit:id=>!!run(`nodeBy(${JSON.stringify(id)}).bit`),
    on:id=>!!run(`values.get(${JSON.stringify(id)}).out[0]`),
    word:(prefix,count=28)=>run(`Array.from({length:${count}},(_,i)=>nodeBy(${JSON.stringify(prefix+'-')}+i).bit?2**i:0).reduce((a,b)=>a+b,0)`),
    entry:()=>run(`Array.from({length:4},(_,place)=>Array.from({length:4},(_,bit)=>nodeBy('entry-memory-'+bit).bits[place]?2**bit:0).reduce((a,b)=>a+b,0)*10**place).reduce((a,b)=>a+b,0)`),
    screen:(prefix,count)=>run(`Array.from({length:${count}},(_,place)=>{const pins=values.get(${JSON.stringify(prefix+'-display-')}+place).in;const lit=[...SEGMENT_NAMES].filter((_,i)=>pins[i]).join('');return lit==='g'?'-':String(SEGMENT_DIGITS.findIndex(glyph=>glyph===lit));}).reverse().join('')`)
  };
}
function enter(r,number){for(const digit of String(number)){r.press('key'+digit);r.advance(400);}}
function store(r,which,number){enter(r,number);r.press('set'+which);r.advance(2200);}
function choose(r,operation){r.press('op-'+operation);r.advance(400);}
function calculate(r,operation='add'){choose(r,operation);r.press('calculate');r.advance(operation==='mul'?12600:1000);}

test('calculator logical schematic captures before four clearing shifts and keeps independent variable displays',()=>{
  const r=rig();
  assert.equal(r.on('busy'),false);assert.equal(r.on('ready'),false);
  assert.equal(r.screen('entry',4),'0000');assert.equal(r.screen('result',8),'00000000');
  enter(r,1234);assert.equal(r.entry(),1234);assert.equal(r.screen('entry',4),'1234');
  r.press('set1');
  assert.equal(r.word('var1',16),0x1234,'capture happens before entry clearing');
  assert.equal(r.screen('var1',4),'1234');assert.equal(r.entry(),1234);assert.equal(r.on('busy'),true);
  r.advance(399);assert.equal(r.entry(),1234);
  r.advance(1);assert.equal(r.entry(),2340);
  for(const expected of [3400,4000,0]){r.advance(400);assert.equal(r.entry(),expected);}
  r.advance(599);assert.equal(r.on('busy'),true,'command tail protects pulse-shaper re-arm');
  r.advance(1);assert.equal(r.on('busy'),false);assert.equal(r.on('ready'),false);
  store(r,2,56);assert.equal(r.screen('var1',4),'1234');assert.equal(r.screen('var2',4),'0056');assert.equal(r.on('ready'),true);
  store(r,1,9);assert.equal(r.screen('var1',4),'0009');assert.equal(r.screen('var2',4),'0056');
});

test('calculator logical schematic gates Calculate until two variables are stored, including zero',()=>{
  const r=rig();r.press('calculate');assert.equal(r.on('busy'),false);r.advance(400);
  store(r,1,0);assert.equal(r.bit('valid-0'),true);assert.equal(r.on('ready'),false);
  r.press('calculate');assert.equal(r.on('busy'),false);r.advance(400);
  store(r,2,0);assert.equal(r.on('ready'),true);calculate(r);
  assert.equal(r.word('answer'),0);assert.equal(r.screen('result',8),'00000000');assert.equal(r.on('busy'),false);
});

test('calculator logical schematic adds boundary operands, subtracts with sign and holds its last answer',()=>{
  const r=rig();store(r,1,9999);store(r,2,9999);calculate(r);
  assert.equal(r.word('answer'),19998);assert.equal(r.screen('result',8),'00019998');
  store(r,1,0);assert.equal(r.word('answer'),19998,'setting an operand does not replace the answer');
  calculate(r,'sub');assert.equal(r.word('answer'),9999);assert.equal(r.bit('answer-negative-0'),true);assert.equal(r.screen('result',8),'-0009999');
  store(r,1,9999);store(r,2,0);calculate(r,'sub');
  assert.equal(r.word('answer'),9999);assert.equal(r.bit('answer-negative-0'),false);assert.equal(r.screen('result',8),'00009999');
});

test('calculator logical schematic commits exactly fourteen separated multiply rounds and produces 99980001',()=>{
  const r=rig();store(r,1,9999);store(r,2,9999);choose(r,'mul');r.press('calculate');
  let expected=9999,time=0;assert.equal(r.word('multiply-main'),expected);
  for(let round=0;round<14;round++){
    const capture=800+round*800;
    r.advance(capture-time-1);time=capture-1;assert.equal(r.word('multiply-main'),expected);
    const next=Math.floor(expected/2)+(expected%2?9999*8192:0);
    r.advance(1);time=capture;
    assert.equal(r.word('multiply-shadow'),next,`round ${round+1} captures next state`);
    assert.equal(r.word('multiply-main'),expected,'capture does not commit through feedback');
    r.advance(400);time+=400;expected=next;
    assert.equal(r.word('multiply-main'),expected,`round ${round+1} commits once`);
    assert.equal(r.word('answer'),0,'previous answer is retained during multiplication');
  }
  assert.equal(expected,99980001);r.advance(400);time+=400;
  assert.equal(r.word('answer'),99980001);assert.equal(r.screen('result',8),'99980001');
  assert.equal(r.on('busy'),true);r.advance(12600-time);assert.equal(r.on('busy'),false);
  store(r,2,0);calculate(r,'mul');assert.equal(r.word('answer'),0);assert.equal(r.screen('result',8),'00000000');
});

test('calculator logical schematic ignores controls while busy and preserves a paused simulation',()=>{
  const r=rig();store(r,1,12);store(r,2,3);choose(r,'mul');r.press('calculate');
  r.press('op-sub');r.press('key9');r.press('set1');r.press('calculate');
  assert.equal(r.word('operation',2),2,'operation remains multiply');assert.equal(r.word('var1',16),0x12);
  r.run('running=false;');const before=r.word('multiply-main');
  r.run('simulate(false);simulate(false);simulate(false);');assert.equal(r.word('multiply-main'),before,'render/settle calls do not advance time');
  assert.equal(r.run('simulationMs'),6000,'only explicit simulated time has elapsed');
  r.run('running=true;');r.advance(12600);
  assert.equal(r.word('answer'),36);assert.equal(r.entry(),0);assert.equal(r.on('busy'),false);
});

test('calculator logical schematic re-arms for repeated same commands without becoming stuck',()=>{
  const r=rig();store(r,1,4);r.press('set1');r.advance(2200);
  assert.equal(r.word('var1',16),0);assert.equal(r.on('busy'),false);
  store(r,1,4);store(r,2,5);calculate(r);assert.equal(r.word('answer'),9);
  r.press('calculate');r.advance(1000);assert.equal(r.word('answer'),9);assert.equal(r.on('busy'),false);
});

test('calculator logical schematic does not defer a busy command into the next ready interval',()=>{
  const r=rig();enter(r,7);r.press('set1');r.advance(2100);
  r.press('set2');r.advance(500);
  assert.equal(r.bit('valid-1'),false,'a Set2 press made while busy must not capture after Busy ends');
  assert.equal(r.on('busy'),false);
});
