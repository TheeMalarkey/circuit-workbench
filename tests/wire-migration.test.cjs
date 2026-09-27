const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../dist/app.js'), 'utf8').split('bind();updateGridSnap();')[0];
function app() {
  let nextId=0;
  const context = vm.createContext({structuredClone, crypto:{randomUUID:()=> `generated-${++nextId}`}, document:{getElementById:()=>({})}, localStorage:{getItem:()=>null}});
  vm.runInContext(source + '\n globalThis.api={normalize,valid,portPosition,footprint,canPlace,findCircuitSpot,touchingPorts}; renderSelection=()=>{};',context);
  return context;
}
const node = (id,type,extra={}) => ({id,type,x:20,y:40,rotation:0,...extra});
const wire = (id,from,to) => ({id,from:{node:from,index:0},to:{node:to,index:0},points:[]});
test('saved Clock delay circuits migrate to Signal Delay without losing settings or wiring',()=>{
  const ctx=app();
  const original={name:'old timing',nodes:[node('source','lever',{on:true}),node('timer','clock',{delay:4})],wires:[wire('wire','source','timer')]};
  const migrated=ctx.api.normalize(original);
  assert.equal(original.nodes[1].type,'clock');
  assert.equal(migrated.nodes[1].type,'delay');
  assert.equal(migrated.nodes[1].delay,4);
  assert.equal(migrated.wires[0].to.node,'timer');
  assert.equal(ctx.api.valid(migrated),true);
});
test('legacy neon chains become one routed wire with the same signal',()=>{
  for(const reverse of [false,true]) {
    const ctx=app();
    const neons=[node('n1','neon',{color:'Cyan',length:180}),node('n2','neon',{color:'Cyan',length:240})];
    const data={name:'chain',nodes:[node('source','lever',{on:true}),...(reverse?neons.reverse():neons),node('gate','or')],wires:[wire('w1','source','n1'),wire('w2','n1','n2'),wire('w3','n2','gate')]};
    ctx.fixture=ctx.api.normalize(data);
    assert.equal(ctx.api.valid(ctx.fixture),true);
    assert.equal(ctx.fixture.nodes.length,2);
    assert.equal(ctx.fixture.wires.length,1);
    assert.equal(ctx.fixture.wires[0].style,'neon');
    assert.equal(ctx.fixture.wires[0].color,'Cyan');
    assert.equal(ctx.fixture.wires[0].points.length,4);
    vm.runInContext('model=fixture;simulate(false);',ctx);
    assert.equal(vm.runInContext("values.get('gate').in[0]",ctx),true);
    assert.equal(vm.runInContext("values.get('gate').out[0]",ctx),true);
    vm.runInContext('simulate(true);',ctx);
    assert.equal(vm.runInContext("values.get('gate').out[0]",ctx),true);
  }
});
test('legacy lamps keep their connection and become a reconnectable free-ended wire',()=>{
  const ctx=app();
  const data=ctx.api.normalize({name:'lamp',nodes:[node('source','button'),node('lamp','lamp')],wires:[wire('w','source','lamp')]});
  assert.equal(ctx.api.valid(data),true);
  assert.equal(data.wires[0].from.node,'source');
  assert.equal(data.wires[0].to.x,200);
  assert.equal(data.wires[0].to.y,88);
  assert.equal(ctx.api.valid(ctx.api.normalize(JSON.parse(JSON.stringify(data)))),true);
});
test('unconnected rotated neon retains both free ends',()=>{
  const ctx=app();
  const data=ctx.api.normalize({name:'loose',nodes:[node('n','neon',{rotation:90,length:200,color:'Pink'})],wires:[]});
  assert.equal(ctx.api.valid(data),true);
  assert.equal(data.nodes.length,0);
  assert.equal(data.wires[0].to.y,288);
  assert.equal(data.wires[0].color,'Pink');
});
test('compact controls occupy one by two cells and rotate on the circuit grid',()=>{
  const ctx=app();
  assert.deepEqual({...ctx.api.footprint(node('l','lever'))},{w:48,h:96});
  assert.deepEqual({...ctx.api.footprint(node('g','and'))},{w:96,h:96});
  const p=ctx.api.portPosition(node('l','lever'),'out',0);
  assert.equal(p.x,44);assert.equal(p.y,136);
  const rotated=ctx.api.portPosition(node('l','lever',{rotation:90}),'out',0);
  assert.equal(rotated.x,20);assert.equal(rotated.y,64);
  assert.equal(ctx.api.canPlace(node('l','lever'),[node('g','and',{x:48,y:0})],0,0),true);
  assert.equal(ctx.api.canPlace(node('l','lever'),[node('g','and',{x:0,y:0})],0,0),false);
});
test('single ports are centered and NOT occupies two by one cells',()=>{
  const ctx=app();
  const gate=node('g','and',{x:0,y:0});
  const not=node('n','inverter',{x:96,y:0});
  assert.equal(ctx.api.portPosition(gate,'out',0).y,48);
  assert.deepEqual({...ctx.api.footprint(not)},{w:96,h:48});
  assert.deepEqual({...ctx.api.footprint({...not,rotation:90})},{w:48,h:96});
  assert.equal(ctx.api.portPosition(not,'in',0).y,24);
  assert.equal(ctx.api.portPosition(not,'out',0).y,24);
});
test('touching centered ports transmit signals with no wire',()=>{
  const ctx=app();
  ctx.fixture={name:'contact',nodes:[node('source','inverter',{x:0,y:0}),node('next','inverter',{x:96,y:0})],wires:[]};
  vm.runInContext('model=fixture;simulate(false);',ctx);
  assert.equal(vm.runInContext("values.get('next').in[0]",ctx),true);
  assert.equal(vm.runInContext("values.get('next').out[0]",ctx),false);
  ctx.fixture.nodes[1].x=144;
  vm.runInContext('model=fixture;simulate(false);',ctx);
  assert.equal(vm.runInContext("values.get('next').in[0]",ctx),false);
  assert.equal(vm.runInContext("values.get('next').out[0]",ctx),true);
});
test('lever output at the bottom connects to a top-facing input',()=>{
  const ctx=app();
  ctx.fixture={name:'vertical contact',nodes:[node('lever','lever',{x:48,y:0,on:true}),node('gate','or',{x:0,y:96,rotation:90})],wires:[]};
  vm.runInContext('model=fixture;simulate(false);',ctx);
  assert.equal(vm.runInContext("values.get('gate').in[0]",ctx),true);
});
test('new circuits use free cells even when the requested cell is occupied',()=>{
  const ctx=app();
  const existing=[node('g','and',{x:0,y:0})];
  const spot=ctx.api.findCircuitSpot(node('next','and'),existing,0,0);
  assert.deepEqual({...spot},{x:96,y:0});
  assert.equal(ctx.api.canPlace(node('next','and'),existing,spot.x,spot.y),true);
});
test('Enter finishes an output wire at its last clicked point, not the cursor',()=>{
  const ctx=app();
  ctx.fixture={name:'free output',nodes:[node('source','lever')],wires:[]};
  vm.runInContext("model=fixture;draft={anchor:{node:'source',side:'out',index:0},points:[{x:70,y:160},{x:90,y:170}],cursor:{x:100,y:200},style:'neon',color:'Cyan'};changed=()=>{};checkpoint=()=>{};setStatus=()=>{};finishWire();",ctx);
  assert.equal(ctx.fixture.wires.length,1);
  assert.deepEqual({...ctx.fixture.wires[0].to},{x:90,y:170});
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.fixture.wires[0].points)),[{x:70,y:160}]);
  assert.equal(ctx.fixture.wires[0].from.node,'source');
  assert.equal(ctx.fixture.wires[0].style,'neon');
  assert.equal(ctx.api.valid(ctx.fixture),true);
  assert.equal(vm.runInContext('draft',ctx),null);
});
test('Enter finishes a wire started from an input with a free end',()=>{
  const ctx=app();
  ctx.fixture={name:'free input',nodes:[node('target','inverter')],wires:[]};
  vm.runInContext("model=fixture;draft={anchor:{node:'target',side:'in',index:0},points:[{x:0,y:80}],cursor:{x:-40,y:80},style:'normal',color:'White'};changed=()=>{};checkpoint=()=>{};setStatus=()=>{};finishWire();",ctx);
  assert.equal(ctx.fixture.wires[0].from.node,'target');
  assert.equal(ctx.fixture.wires[0].from.side,'in');
  assert.deepEqual({...ctx.fixture.wires[0].to},{x:0,y:80});
  assert.equal(ctx.api.valid(ctx.fixture),true);
});
test('Enter waits for a clicked point before finishing a free wire',()=>{
  const ctx=app();
  ctx.fixture={name:'unset end',nodes:[node('source','lever')],wires:[]};
  vm.runInContext("model=fixture;draft={anchor:{node:'source',side:'out',index:0},points:[],cursor:{x:100,y:200},style:'normal',color:'White'};setStatus=()=>{};finishWire();",ctx);
  assert.equal(ctx.fixture.wires.length,0);
  assert.notEqual(vm.runInContext('draft',ctx),null);
});
test('a button press produces a recorded-range 350 ms signal',()=>{
  const ctx=app();
  ctx.fixture={name:'button pulse',nodes:[node('button','button')],wires:[]};
  vm.runInContext('model=fixture;pressButton(model.nodes[0]);',ctx);
  assert.equal(vm.runInContext("values.get('button').out[0]",ctx),true);
  vm.runInContext('simulate(true,349);',ctx);
  assert.equal(vm.runInContext("values.get('button').out[0]",ctx),true);
  vm.runInContext('simulate(true,1);',ctx);
  assert.equal(vm.runInContext("values.get('button').out[0]",ctx),false);
});
test('legacy zero settings migrate to the new minimum of one without losing wires',()=>{
  const ctx=app();
  const original={name:'legacy',nodes:[node('source','lever'),node('delay','delay',{delay:0}),node('sustain','sustain',{delay:0})],wires:[wire('w','source','delay')]};
  const migrated=ctx.api.normalize(original);
  assert.equal(migrated.nodes[1].delay,1);assert.equal(migrated.nodes[2].delay,1);
  assert.equal(migrated.wires[0].to.node,'delay');assert.equal(ctx.api.valid(migrated),true);
  assert.equal(original.nodes[1].delay,0);
});
test('delay setting one outputs with its first lamp',()=>{
  const ctx=app();
  ctx.fixture={name:'delay one',nodes:[node('source','lever',{on:true}),node('delay','delay',{delay:1})],wires:[wire('w','source','delay')]};
  vm.runInContext('model=fixture;simulate(false);',ctx);
  assert.equal(vm.runInContext("values.get('delay').out[0]",ctx),false);
  vm.runInContext('simulate(true,200);',ctx);
  assert.equal(vm.runInContext("values.get('delay').out[0]",ctx),true);
});
test('delay setting two outputs with its second lamp',()=>{
  const ctx=app();
  ctx.fixture={name:'delay two',nodes:[node('source','lever',{on:true}),node('delay','delay',{delay:2})],wires:[wire('w','source','delay')]};
  vm.runInContext('model=fixture;simulate(false);',ctx);
  assert.equal(vm.runInContext("values.get('delay').out[0]",ctx),false);
  vm.runInContext('simulate(true,400);',ctx);
  assert.equal(vm.runInContext("values.get('delay').out[0]",ctx),true);
});
test('recorded minimum sustain setting follows input with no visible hold',()=>{
  const ctx=app();
  ctx.fixture={name:'sustain one',nodes:[node('source','lever',{on:true}),node('sustain','sustain',{delay:1})],wires:[wire('w','source','sustain')]};
  vm.runInContext('model=fixture;simulate(false);',ctx);
  assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),true);
  vm.runInContext('model.nodes[0].on=false;simulate(false);',ctx);
  assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),false);
});
test('signal sustain at two starts immediately and holds for two ticks after release',()=>{
  const ctx=app();
  ctx.fixture={name:'sustain two',nodes:[node('source','lever',{on:true}),node('sustain','sustain',{delay:2})],wires:[wire('w','source','sustain')]};
  vm.runInContext('model=fixture;simulate(false);simulate(true);model.nodes[0].on=false;simulate(false);',ctx);
  assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),true);
  vm.runInContext('simulate(true);',ctx);
  assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),true);
  vm.runInContext('simulate(true);',ctx);
  assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),false);
});
test('a sustain wired back into its own input stays on instead of retriggering',()=>{
  const ctx=app();
  ctx.fixture={name:'sustain feedback',nodes:[node('source','button'),node('sustain','sustain',{delay:12})],wires:[wire('start','source','sustain'),wire('loop','sustain','sustain')]};
  vm.runInContext('model=fixture;simulate(false);pressButton(model.nodes[0]);',ctx);
  assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),true);
  vm.runInContext('simulate(true,400);',ctx);
  assert.equal(vm.runInContext("values.get('source').out[0]",ctx),false);
  for(let i=0;i<50;i++){
    vm.runInContext('simulate(true,200);',ctx);
    assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),true,`loop switched off after ${400+(i+1)*200} ms`);
  }
  vm.runInContext("model.wires=model.wires.filter(w=>w.id!=='loop');simulate(false);",ctx);
  assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),true);
  vm.runInContext('simulate(true,2400);',ctx);
  assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),false);
  vm.runInContext("model.wires=fixture.wires;resetTiming();simulate(false);",ctx);
  assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),false,'an unpowered loop must not turn itself on');
});
test('on-circuit timing button advances settings and wraps from 12 to 1',()=>{
  const ctx=app();
  ctx.fixture={name:'timing control',nodes:[node('delay','delay',{delay:11}),node('sustain','sustain',{delay:12})],wires:[]};
  vm.runInContext('model=fixture;checkpoint=()=>{};changed=()=>{};setStatus=()=>{};cycleTiming(model.nodes[0]);cycleTiming(model.nodes[0]);cycleTiming(model.nodes[1]);',ctx);
  assert.equal(ctx.fixture.nodes[0].delay,1);
  assert.equal(ctx.fixture.nodes[1].delay,1);
});
test('delay shows every lamp from bottom to top, one at a time',()=>{
  const ctx=app();
  ctx.fixture={name:'timing bar',nodes:[node('source','lever',{on:true}),node('delay','delay',{delay:12})],wires:[wire('a','source','delay')]};
  vm.runInContext('model=fixture;simulate(false);',ctx);
  assert.equal(vm.runInContext('timingSegments(model.nodes[1]).length',ctx),0);
  vm.runInContext('simulate(true,200);',ctx);
  for(let step=0;step<12;step++){
    assert.equal(JSON.stringify(vm.runInContext('timingSegments(model.nodes[1])',ctx)),JSON.stringify([11-step]),`delay lamp ${step+1}`);
    assert.equal(vm.runInContext("values.get('delay').out[0]",ctx),step===11,`delay output at lamp ${step+1}`);
    vm.runInContext('simulate(true,200);',ctx);
  }
  assert.equal(vm.runInContext('timingSegments(model.nodes[1]).length',ctx),0);
});
test('sustain shows every lamp from bottom to top after release',()=>{
  const ctx=app();
  ctx.fixture={name:'sustain lamps',nodes:[node('source','lever',{on:true}),node('sustain','sustain',{delay:12})],wires:[wire('a','source','sustain')]};
  vm.runInContext('model=fixture;simulate(false);',ctx);
  vm.runInContext('model.nodes[0].on=false;simulate(false);',ctx);
  for(let step=0;step<12;step++){
    assert.equal(JSON.stringify(vm.runInContext('timingSegments(model.nodes[1])',ctx)),JSON.stringify([11-step]),`sustain lamp ${step+1}`);
    vm.runInContext('simulate(true,200);',ctx);
  }
  assert.equal(vm.runInContext('timingSegments(model.nodes[1]).length',ctx),0);
});
test('short pulses keep their width through repeated Delay feedback at settings 1–3',()=>{
  for(const [setting,width] of [[1,50],[2,50],[3,50],[2,350],[3,350]]){
    const ctx=app();
    ctx.fixture={name:'delay feedback',nodes:[node('source','lever',{on:true}),node('delay','delay',{delay:setting})],wires:[wire('start','source','delay'),wire('loop','delay','delay')]};
    vm.runInContext('model=fixture;simulate(false);',ctx);
    vm.runInContext(`simulate(true,${width});model.nodes[0].on=false;simulate(false);`,ctx);
    let rise=null,count=0,last=false;
    for(let time=width+10;time<=6000;time+=10){
      vm.runInContext('simulate(true,10);',ctx);
      const on=vm.runInContext("values.get('delay').out[0]",ctx);
      if(on&&!last)rise=time;
      if(!on&&last){assert.equal(time-rise,width,`setting ${setting} must preserve ${width} ms pulse`);count++;}
      last=on;
    }
    assert.ok(count>=8,`setting ${setting} must keep switching off between pulses`);
  }
});
test('four-tick signal delay delays a six-tick input without shortening it',()=>{
  const ctx=app();
  ctx.fixture={name:'queued delay',nodes:[node('source','lever',{on:true}),node('delay','delay',{delay:4})],wires:[wire('w','source','delay')]};
  vm.runInContext('model=fixture;simulate(false);',ctx);
  const output=[];
  for(let step=1;step<=14;step++){
    if(step===7)vm.runInContext('model.nodes[0].on=false;simulate(false);',ctx);
    vm.runInContext('simulate(true);',ctx);
    output.push(vm.runInContext("values.get('delay').out[0]",ctx));
  }
  assert.equal(output.findIndex(Boolean),3);
  assert.equal(output.filter(Boolean).length,6);
  assert.equal(output[9],false);
});
test('wires and chained ordinary gates propagate immediately',()=>{
  const ctx=app();
  ctx.fixture={name:'cascade',nodes:[node('source','lever',{x:0,y:0,on:true}),node('first','or',{x:144,y:0}),node('second','or',{x:288,y:0})],wires:[wire('a','source','first'),wire('b','first','second')]};
  vm.runInContext('model=fixture;simulate(false);',ctx);
  assert.equal(vm.runInContext("values.get('first').in[0]",ctx),true);
  assert.equal(vm.runInContext("values.get('first').out[0]",ctx),true);
  assert.equal(vm.runInContext("values.get('second').in[0]",ctx),true);
  assert.equal(vm.runInContext("values.get('second').out[0]",ctx),true);
  vm.runInContext('model.nodes[0].on=false;simulate(false);',ctx);
  assert.equal(vm.runInContext("values.get('first').in[0]",ctx),false);
  assert.equal(vm.runInContext("values.get('first').out[0]",ctx),false);
  assert.equal(vm.runInContext("values.get('second').out[0]",ctx),false);
});
test('a loose wire end can branch from the middle of another wire',()=>{
  const ctx=app();
  ctx.fixture={name:'branch',nodes:[node('source','lever',{x:0,y:0,on:true}),node('gate','or',{x:288,y:0})],wires:[
    {id:'main',from:{node:'source',index:0},to:{x:240,y:96},points:[]},
    {id:'branch',from:{x:120,y:96},to:{node:'gate',index:0},points:[{x:120,y:24}]}
  ]};
  vm.runInContext('model=fixture;simulate(false);',ctx);
  assert.equal(vm.runInContext("values.get('gate').in[0]",ctx),true);
  assert.equal(vm.runInContext("wireNetworks().byWire.get('main')===wireNetworks().byWire.get('branch')",ctx),true);
});
test('another source powers every wire sharing a nub',()=>{
  const ctx=app();
  ctx.fixture={name:'shared nub',nodes:[node('off','lever',{x:0,y:0,on:false}),node('on','lever',{x:0,y:192,on:true}),node('gate','or',{x:288,y:0})],wires:[
    {id:'main',from:{node:'off',index:0},to:{x:240,y:96},points:[]},
    {id:'power',from:{node:'on',index:0},to:{x:120,y:96},points:[]},
    {id:'branch',from:{x:120,y:96},to:{node:'gate',index:0},points:[{x:120,y:24}]}
  ]};
  vm.runInContext('model=fixture;simulate(false);',ctx);
  assert.equal(vm.runInContext("values.get('gate').in[0]",ctx),true);
  assert.equal(vm.runInContext("networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id).out]))).powered.get(wireNetworks().byWire.get('main'))",ctx),true);
});
test('wires that only cross do not connect',()=>{
  const ctx=app();
  ctx.fixture={name:'crossing',nodes:[],wires:[
    {id:'horizontal',from:{x:0,y:96},to:{x:240,y:96},points:[]},
    {id:'vertical',from:{x:120,y:20},to:{x:120,y:160},points:[]}
  ]};
  vm.runInContext('model=fixture;',ctx);
  assert.equal(vm.runInContext("wireNetworks().byWire.get('horizontal')===wireNetworks().byWire.get('vertical')",ctx),false);
});
test('starting from a loose end preserves the original wire and adds a branch',()=>{
  const ctx=app();
  ctx.fixture={name:'continue',nodes:[],wires:[{id:'old',from:{x:0,y:0},to:{x:100,y:0},points:[]}]};
  vm.runInContext("model=fixture;changed=()=>{};startWireAt({x:100,y:0},model.wires[0]);draft.points.push({x:100,y:80});finishWire();",ctx);
  assert.equal(ctx.fixture.wires.length,2);
  assert.deepEqual({...ctx.fixture.wires[1].from},{x:100,y:0});
  assert.deepEqual({...ctx.fixture.wires[1].to},{x:100,y:80});
  assert.equal(vm.runInContext("wireNetworks().byWire.get('old')===wireNetworks().byWire.get(model.wires[1].id)",ctx),true);
});
test('every built-in design is a valid editable circuit',()=>{
  const ctx=app();
  assert.equal(vm.runInContext('BUILT_IN_DESIGNS.length',ctx),33);
  assert.equal(vm.runInContext('BUILT_IN_DESIGNS.every(d=>valid({name:d.name,nodes:d.nodes,wires:d.wires}))',ctx),true);
});
test('adding a built-in design uses fresh IDs and leaves existing parts intact',()=>{
  const ctx=app();
  ctx.fixture={name:'My build',nodes:[node('mine','lever',{x:0,y:0})],wires:[]};
  vm.runInContext("model=fixture;newCopy=designCopy(BUILT_IN_DESIGNS[0]);",ctx);
  assert.equal(ctx.fixture.nodes.length,1);
  assert.equal(vm.runInContext("newCopy.nodes.every(n=>n.id!=='mine'&&n.x>=240)",ctx),true);
  assert.equal(vm.runInContext("valid({name:model.name,nodes:[...model.nodes,...newCopy.nodes],wires:newCopy.wires})",ctx),true);
});
test('SR Latch powers the top output first and each input latches its own output',()=>{
  const ctx=app();
  vm.runInContext("const design=BUILT_IN_DESIGNS.find(d=>d.id==='sr-latch');model=structuredClone(design);simulate(false);",ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'true,false');
  vm.runInContext("pressButton(model.nodes.find(n=>n.id==='bottom'));",ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'true,true');
  vm.runInContext('simulate(true,200);',ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'false,true');
  vm.runInContext('simulate(true,400);',ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'false,true');
  vm.runInContext("pressButton(model.nodes.find(n=>n.id==='top'));",ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'true,true');
  vm.runInContext('simulate(true,200);',ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'true,false');
});
test('joined latch inputs select the side reached through the link and repeat the recorded output pulse',()=>{
  const ctx=app();
  vm.runInContext("const design=BUILT_IN_DESIGNS.find(d=>d.id==='sr-latch-linked');model=structuredClone(design);simulate(false);",ctx);
  assert.equal(vm.runInContext("new Set(['top-feed','bottom-feed','input-link'].map(id=>wireNetworks().byWire.get(id))).size",ctx),1);
  vm.runInContext("pressButton(model.nodes.find(n=>n.id==='top'));",ctx);
  assert.equal(vm.runInContext("values.get('latch').in.join(',')",ctx),'true,true');
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'true,true');
  vm.runInContext('simulate(true,200);',ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'false,true');
  vm.runInContext('simulate(true,200);',ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'true,true');
  vm.runInContext('simulate(true,400);',ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'false,true');
  vm.runInContext("pressButton(model.nodes.find(n=>n.id==='bottom'));simulate(true,200);",ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'true,false');
  vm.runInContext('simulate(true,200);',ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'true,true');
  vm.runInContext('simulate(true,400);',ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'true,false');
  vm.runInContext("pressButton(model.nodes.find(n=>n.id==='bottom'));simulate(true,400);",ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'true,true');
  vm.runInContext('simulate(true,400);',ctx);
  assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),'true,false');
});
test('the six joined-wire presses keep the same winning side sequence as the recording',()=>{
  const ctx=app();
  vm.runInContext("const design=BUILT_IN_DESIGNS.find(d=>d.id==='sr-latch-linked');model=structuredClone(design);simulate(false);",ctx);
  for(const [button,winner] of [['top','false,true'],['bottom','true,false'],['bottom','true,false'],['bottom','true,false'],['top','false,true'],['top','false,true']]){
    vm.runInContext(`pressButton(model.nodes.find(n=>n.id==='${button}'));simulate(true,800);`,ctx);
    assert.equal(vm.runInContext("values.get('latch').out.join(',')",ctx),winner);
  }
});
test('the crossing design keeps the two neon wires electrically separate',()=>{
  const ctx=app();
  vm.runInContext("const crossing=BUILT_IN_DESIGNS.find(d=>d.id==='crossing-wires');model={name:'crossing',nodes:crossing.nodes,wires:crossing.wires};simulate(false);",ctx);
  assert.equal(vm.runInContext("wireNetworks().byWire.get('horizontal')===wireNetworks().byWire.get('vertical')",ctx),false);
  assert.equal(vm.runInContext("networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id).out]))).powered.get(wireNetworks().byWire.get('horizontal'))",ctx),true);
  assert.equal(vm.runInContext("networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id).out]))).powered.get(wireNetworks().byWire.get('vertical'))",ctx),false);
});
test('recording comparison designs share the input but keep both outputs isolated',()=>{
  const ctx=app();
  vm.runInContext("const design=BUILT_IN_DESIGNS.find(d=>d.id==='timing-one');model={name:design.name,nodes:design.nodes,wires:design.wires};simulate(false);",ctx);
  assert.equal(vm.runInContext("model.nodes.find(n=>n.type==='delay').delay",ctx),1);
  assert.equal(vm.runInContext("wireNetworks().byWire.get('input')===wireNetworks().byWire.get('sustain-feed')",ctx),true);
  assert.equal(vm.runInContext("new Set(['input','sustain-output','delay-output'].map(id=>wireNetworks().byWire.get(id))).size",ctx),3);
  assert.equal(vm.runInContext("model.wires.filter(w=>w.from.node==='delay').length",ctx),1);
  assert.equal(vm.runInContext("model.wires.filter(w=>w.to.node==='delay').length",ctx),1);
  vm.runInContext("pressButton(model.nodes.find(n=>n.type==='button'));",ctx);
  assert.equal(vm.runInContext("values.get('delay').in[0]",ctx),true);
  assert.equal(vm.runInContext("values.get('delay').out[0]",ctx),false);
  assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),true);
});
test('setting 12 delay starts on its final lamp while sustain holds for 2.4 seconds',()=>{
  const ctx=app();
  vm.runInContext("const design=BUILT_IN_DESIGNS.find(d=>d.id==='timing-long');model=structuredClone(design);model.nodes[0].on=true;simulate(false);simulate(true,333);model.nodes[0].on=false;simulate(false);simulate(true,2066);",ctx);
  assert.equal(vm.runInContext("values.get('delay').out[0]",ctx),false);
  vm.runInContext('simulate(true,1);',ctx);
  assert.equal(vm.runInContext("values.get('delay').out[0]",ctx),true);
  vm.runInContext('simulate(true,332);',ctx);
  assert.equal(vm.runInContext("values.get('delay').out[0]&&values.get('sustain').out[0]",ctx),true);
  vm.runInContext('simulate(true,1);',ctx);
  assert.equal(vm.runInContext("values.get('delay').out[0]||values.get('sustain').out[0]",ctx),false);
});
test('long input keeps its full recorded duration and sustain refills on a second pulse',()=>{
  const ctx=app();
  vm.runInContext("const design=BUILT_IN_DESIGNS.find(d=>d.id==='timing-long');model=structuredClone(design);model.nodes[0].on=true;simulate(false);simulate(true,3567);model.nodes[0].on=false;simulate(false);",ctx);
  assert.equal(vm.runInContext("values.get('delay').out[0]&&values.get('sustain').out[0]",ctx),true);
  vm.runInContext('simulate(true,2399);',ctx);
  assert.equal(vm.runInContext("values.get('delay').out[0]",ctx),true);
  vm.runInContext('simulate(true,1);',ctx);
  assert.equal(vm.runInContext("values.get('delay').out[0]||values.get('sustain').out[0]",ctx),false);
  vm.runInContext('model.nodes[0].on=true;simulate(false);simulate(true,100);model.nodes[0].on=false;simulate(false);simulate(true,1000);model.nodes[0].on=true;simulate(false);simulate(true,100);model.nodes[0].on=false;simulate(false);simulate(true,2399);',ctx);
  assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),true);
  vm.runInContext('simulate(true,1);',ctx);
  assert.equal(vm.runInContext("values.get('sustain').out[0]",ctx),false);
});
