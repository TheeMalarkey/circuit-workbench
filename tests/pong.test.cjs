const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {buildPong,wirePong}=require('../scripts/build-pong.cjs');
const source=fs.readFileSync(require('node:path').join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function game(){
  const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(source+`;renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};model=structuredClone(PONG_DESIGN);simulate(false);`,ctx);
  const run=code=>vm.runInContext(code,ctx);run.context=ctx;return run;
}
const screenState=`(()=>{
  const network=networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id)?.out||[]])));
  const on=w=>!!network.powered.get(network.byWire.get(w.id));
  const pixels=model.wires.filter(w=>w.arcade?.role==='pixel'&&on(w));
  return {ball:pixels.filter(w=>w.arcade.y<6).length,paddle:pixels.filter(w=>w.arcade.y===6).length,
    lost:model.wires.some(w=>w.arcade?.role==='lost'&&on(w)),
    won:model.wires.some(w=>w.arcade?.role==='won'&&on(w)),
    digits:['score-tens-display','score-units-display'].map(id=>values.get(id).in)};
})()`;
test('Pong uses ordinary parts and starts with one ball and a three-pixel paddle',()=>{
  const run=game();assert.equal(run('valid(model)'),true);
  assert.equal(run("model.nodes.every(n=>PARTS[n.type])"),true);
  assert.equal(run("model.nodes.find(n=>n.id==='score').channel"),0);
  assert.equal(run("values.get('lost').out[0]"),false);
  assert.equal(run("model.nodes.filter(n=>n.id.startsWith('pixel-')&&values.get(n.id).out[0]).length"),1);
  assert.equal(run("nodeBy('paddle-left').bit||nodeBy('paddle-right').bit"),false);
  assert.equal(run("[...wireNetworks().outputs.values()].every(ports=>ports.length===1)"),true,'no unrelated outputs are shorted');
});
test('Pong logic rack is compact without routing wires through boards',()=>{
  const run=game();
  const metrics=JSON.parse(run(`JSON.stringify((()=>{
    const rack=PONG_DESIGN.nodes.filter(n=>!n.panel),old=rack.map(n=>PONG_LEGACY_POSITIONS[n.id]),fresh=rack.map(n=>[n.x,n.y]);
    const span=(points,axis)=>Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]));
    const clear=model.wires.every(w=>{const path=wireEnds(w);return path?.slice(1).every((b,i)=>{
      const a=path[i];if(a.x!==b.x&&a.y!==b.y)return false;
      return model.nodes.every(n=>{const f=footprint(n);
        return !(a.x===b.x?a.x>n.x&&a.x<n.x+f.w&&Math.max(a.y,b.y)>n.y&&Math.min(a.y,b.y)<n.y+f.h:
          a.y>n.y&&a.y<n.y+f.h&&Math.max(a.x,b.x)>n.x&&Math.min(a.x,b.x)<n.x+f.w);
      });
    });});
    return {oldWidth:span(old,0),width:span(fresh,0),oldHeight:span(old,1),height:span(fresh,1),clear};
  })())`));
  assert.ok(metrics.width<metrics.oldWidth*.6,JSON.stringify(metrics));
  assert.ok(metrics.height<metrics.oldHeight*.7,JSON.stringify(metrics));
  assert.equal(metrics.clear,true,'no compacted route should pass through a circuit board');
});
test('Pong bounces, scores once per contact, misses, freezes and homes through real reset wiring',()=>{
  const run=game();run("nodeBy('run').on=true;simulate(false)");
  const frames=[];
  for(let i=0;i<80;i++){
    frames.push(JSON.parse(run("JSON.stringify({x:nodeBy('ball-x').channel,y:nodeBy('ball-y').channel,score:nodeBy('score').channel,lost:nodeBy('lost').bit})")));
    run('simulate(true,400)');
  }
  assert.ok(frames.some(f=>f.score>0));
  assert.ok(frames.some(f=>f.y===9)&&frames.some(f=>f.x===7));
  assert.ok(frames.some(f=>f.lost));
  const frozen=run("JSON.stringify([nodeBy('ball-x').channel,nodeBy('ball-y').channel,nodeBy('score').channel])");
  run('simulate(true,2000)');assert.equal(run("JSON.stringify([nodeBy('ball-x').channel,nodeBy('ball-y').channel,nodeBy('score').channel])"),frozen);
  run("nodeBy('run').on=false;pressButton(nodeBy('restart'));simulate(true,8000)");
  assert.equal(run("nodeBy('resetting').bit"),false);
  assert.equal(run("nodeBy('lost').bit"),false);
  assert.equal(run("['ball-x','ball-y','score','divider'].every(id=>nodeBy(id).channel===0)"),true);
});
test('a player can reach 15 returns; all screen lights and digits read circuit voltage',()=>{
  const run=game();run("nodeBy('run').on=true;simulate(false)");
  const result=JSON.parse(run(`JSON.stringify((()=>{
    const states=[];
    for(let frame=0;frame<160&&nodeBy('score').channel<15;frame++){
      if(nodeBy('ball-y').channel===4){const phase=nodeBy('ball-x').channel,x=phase<=4?phase:8-phase;pressButton(nodeBy(x<2?'left':x>2?'right':'center'));}
      simulate(true,800);
      const s=${screenState};states.push({ball:s.ball,paddle:s.paddle,lost:s.lost});
    }
    return {states,score:nodeBy('score').channel,won:(${screenState}).won,digits:(${screenState}).digits};
  })())`));
  assert.equal(result.score,15);assert.equal(result.won,true);
  assert.ok(result.states.every(s=>s.ball===1&&s.paddle===3&&!s.lost));
  assert.equal(result.digits.map(bits=>bits.map(Number).join('')).join(','),'0110000,1011011');
});
test('Pong import and editable copies preserve the circuit and isolate play controls',()=>{
  const run=game();
  run('model=normalize(JSON.parse(JSON.stringify(model)));resetTiming();simulate(false)');
  assert.equal(run('valid(model)'),true);assert.equal(JSON.parse(run(`JSON.stringify(${screenState})`)).ball,1);
  run('globalThis.copy=designCopy(PONG_DESIGN);');
  assert.equal(run("copy.nodes.find(n=>n.arcade?.role==='run').arcade.group!== 'pong'"),true);
  assert.equal(run('new Set([...copy.nodes,...copy.wires].filter(x=>x.arcade).map(x=>x.arcade.group)).size'),1);
});
test('rapid paddle presses settle to the latest position without conflicting memory writes',()=>{
  const run=game();
  run("pressButton(nodeBy('left'));simulate(true,100);pressButton(nodeBy('right'));simulate(true,400)");
  assert.equal(run("nodeBy('paddle-left').bit"),false);assert.equal(run("nodeBy('paddle-right').bit"),true);
  run("pressButton(nodeBy('center'));simulate(true,400)");
  assert.equal(run("nodeBy('paddle-left').bit||nodeBy('paddle-right').bit"),false);
});
test('the player can move the paddle after seeing the ball on the last row',()=>{
  const run=game();
  const contact=JSON.parse(run(`JSON.stringify((()=>{
    nodeBy('run').on=true;simulate(false);
    let lastScore=-1;
    for(let frame=0;frame<300;frame++){
      const xPhase=nodeBy('ball-x').channel,x=xPhase<=4?xPhase:8-xPhase;
      const y=nodeBy('ball-y').channel,score=nodeBy('score').channel;
      if(y===4&&score>=1){
        pressButton(nodeBy(x<2?'right':'left'));
        simulate(true,400);
        const nextPhase=nodeBy('ball-x').channel,nextX=nextPhase<=4?nextPhase:8-nextPhase;
        if(nodeBy('ball-y').channel===5&&nextX!==2){
          return {x:nextX,score:nodeBy('score').channel,lost:nodeBy('lost').bit};
        }
      }else simulate(true,400);
      lastScore=score;
      if(nodeBy('lost').bit)break;
    }
    return {error:'no off-center contact reached',lastScore,lost:nodeBy('lost').bit};
  })())`));
  assert.equal(contact.error,undefined,JSON.stringify(contact));
  assert.equal(contact.lost,false,'the ball should remain visible before the half-tick contact sample');
  run(`pressButton(nodeBy('${contact.x<2?'left':'right'}'));simulate(true,400)`);
  assert.equal(run("nodeBy('lost').bit"),false);
  assert.equal(run("nodeBy('score').channel"),contact.score+1);
  run('simulate(true,400)');
  assert.notEqual(run("nodeBy('ball-y').channel"),5,'the ball should travel back up after the return');
});
test('existing Pong copies with original contact wiring upgrade without replacing the circuit',()=>{
  const run=game();
  run.context.legacyPong=wirePong(buildPong(),{portPosition:run('portPosition'),footprint:run('footprint')},{compact:false});
  const result=JSON.parse(run(`JSON.stringify((()=>{
    const old=structuredClone(legacyPong),byId=id=>old.nodes.find(n=>n.id===id);
    const source=(id,index=0)=>old.wires.find(w=>w.from?.node===id&&(w.from.index||0)===index&&Number.isFinite(w.to?.x));
    const branch=(id,index)=>old.wires.find(w=>w.to?.node===id&&w.to.index===index&&!w.from?.node);
    delete byId('run').arcade.contactVersion;
    const enabled=source('playing-1-0'),bottom=source('ball-y',5);
    const contact=branch('contact-1-0',1),handled=branch('contact-handled',1);
    contact.from={...enabled.to};handled.from={...bottom.to};
    // The previous loader snapped every circuit board but did not move its
    // wire bends. Recreate that saved-browser state before upgrading it.
    old.nodes.forEach(n=>{n.x=circuitSnap(n.x);n.y=circuitSnap(n.y);});
    const pixel=JSON.stringify(old.wires.find(w=>w.arcade?.role==='pixel'));
    const upgraded=normalize(old),findSource=(id,index=0)=>upgraded.wires.find(w=>w.from?.node===id&&(w.from.index||0)===index&&Number.isFinite(w.to?.x));
    const findBranch=(id,index)=>upgraded.wires.find(w=>w.to?.node===id&&w.to.index===index&&!w.from?.node);
    const copied=normalize({name:'Old Pong copy',...designCopy(old,{nodes:[],wires:[]})});
    model=normalize(PONG_DESIGN);resetTiming();simulate(false);
    const baseSeparate=[...wireNetworks().outputs.values()].every(ports=>ports.length===1);
    model=upgraded;resetTiming();simulate(false);
    return {version:upgraded.nodes.find(n=>n.id==='run').arcade.contactVersion,
      contact:findBranch('contact-1-0',1).from.x===findSource('half-step').to.x,
      handled:findBranch('contact-handled',1).from.x===findSource('contact-1-0').to.x,
      pixel:JSON.stringify(upgraded.wires.find(w=>w.arcade?.role==='pixel'))===pixel,
      valid:valid(upgraded),nodes:upgraded.nodes.length,wires:upgraded.wires.length,
      stable:JSON.stringify(normalize(upgraded).wires)===JSON.stringify(upgraded.wires),
      copyVersion:copied.nodes.find(n=>n.arcade?.role==='run').arcade.contactVersion,
      restored:upgraded.nodes.every(n=>{
        const [x,y]=PONG_LEGACY_POSITIONS[n.id];return n.x===x&&n.y===y;
      }),
      baseSeparate,separate:[...wireNetworks().outputs.values()].every(ports=>ports.length===1)};
  })())`));
  assert.deepEqual(result,{version:2,contact:true,handled:true,pixel:true,valid:true,nodes:143,wires:796,stable:true,copyVersion:2,restored:true,baseSeparate:true,separate:true});
});
