const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
vm.runInContext(source+';renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};',ctx);
const run=code=>vm.runInContext(code,ctx);
test('all calculator and counter routes avoid every board interior',()=>{
  assert.equal(run(`BUILT_IN_DESIGNS.filter(d=>d.id.startsWith('calculator-')||d.id==='counter-0-15').every(d=>{
    model=structuredClone(d);return model.wires.every(w=>{const p=wireEnds(w);return p.slice(1).every((b,i)=>{
      const a=p[i];if(a.x!==b.x&&a.y!==b.y)return false;
      return model.nodes.every(n=>{const f=footprint(n);return !(a.x===b.x?a.x>n.x&&a.x<n.x+f.w&&Math.max(a.y,b.y)>n.y&&Math.min(a.y,b.y)<n.y+f.h:a.y>n.y&&a.y<n.y+f.h&&Math.max(a.x,b.x)>n.x&&Math.min(a.x,b.x)<n.x+f.w);});
    });});
  })`),true);
});
test('tidying preserves wire identity, finish and model until applied',()=>{
  run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='counter-0-15'));var before=JSON.stringify(model);var routed=planTidyWires();");
  assert.equal(run('JSON.stringify(model)===before'),true);
  assert.equal(run('routed.every((w,i)=>w.id===model.wires[i].id&&w.style===model.wires[i].style&&w.color===model.wires[i].color)'),true);
});

function assertSeparateLanes(){
  assert.equal(run(`(()=>{
    const paths=model.wires.map(w=>wireEnds(w));
    const segments=paths.flatMap((p,wire)=>p.slice(1).map((b,i)=>({a:p[i],b,wire}))).filter(s=>!near(s.a,s.b));
    return segments.every((s,i)=>segments.slice(i+1).every(t=>{
      if(s.wire===t.wire)return true;
      const h=s.a.y===s.b.y;if(h!==(t.a.y===t.b.y))return true;
      const axis=h?s.a.y:s.a.x,other=h?t.a.y:t.a.x;
      const lo=Math.max(Math.min(h?s.a.x:s.a.y,h?s.b.x:s.b.y),Math.min(h?t.a.x:t.a.y,h?t.b.x:t.b.y));
      const hi=Math.min(Math.max(h?s.a.x:s.a.y,h?s.b.x:s.b.y),Math.max(h?t.a.x:t.a.y,h?t.b.x:t.b.y));
      if(Math.abs(axis-other)>=10||hi-lo<=0.01)return true;
      // The only exception is the bounded lead from a shared endpoint to its
      // staggered exit, never an arbitrary shared-signal section downstream.
      const p=paths[s.wire],q=paths[t.wire];
      if(paths.flatMap(path=>[path[0],path.at(-1)]).some(join=>
        (h?Math.abs(join.y-axis):Math.abs(join.x-axis))<0.01&&onWire(join,p)&&onWire(join,q)&&
        Math.max(Math.abs(lo-(h?join.x:join.y)),Math.abs(hi-(h?join.x:join.y)))<=12.01))return true;
      return Math.abs(axis-other)<0.01&&[[p[0],p[1]],[p.at(-1),p.at(-2)]].some(([a,b])=>
        [[q[0],q[1]],[q.at(-1),q.at(-2)]].some(([c,d])=>near(a,c)&&(a.y===b.y)===h&&(c.y===d.y)===h&&Math.abs((h?a.y:a.x)-axis)<0.01&&
          lo>=Math.max(Math.min(h?a.x:a.y,h?b.x:b.y),Math.min(h?c.x:c.y,h?d.x:d.y))-0.01&&
          hi<=Math.min(Math.max(h?a.x:a.y,h?b.x:b.y),Math.max(h?c.x:c.y,h?d.x:d.y))+0.01));
    }));
  })()`),true,'different wires must have separate parallel lanes, even on the same signal');
}

test('four wires sharing one port fan out into separate lanes in either direction',()=>{
  for(const reverse of [false,true]){
    run(`model={nodes:[designNode('source','inverter',0,0),...Array.from({length:4},(_,i)=>designNode('sink'+i,'inverter',384,i*192))],wires:[]};
      var fanEdges=Array.from({length:4},(_,i)=>({from:{node:'source',side:'out',index:0},to:{node:'sink'+i,side:'in',index:0}}));
      if(${reverse})fanEdges=fanEdges.map(e=>({from:e.to,to:e.from}));
      model.wires=routeDesignWires(model.nodes,fanEdges,'fan');`);
    assertSeparateLanes();
    assert.equal(run('wireNetworks().groups.size'),1,'fan-out remains electrically joined');
    assert.equal(run('Math.max(...model.wires.map(w=>{const p=wireEnds(w),a='+ (reverse?'p.at(-1),b=p.at(-2)':'p[0],b=p[1]')+';return Math.abs(a.x-b.x)+Math.abs(a.y-b.y);}))'),48,'four fan-out exits are bounded to four 12-unit steps');
  }
});

test('counter and calculator separate all parallel wires, not only different signals',()=>{
  for(const id of ['counter-0-15','calculator-0-0']){
    run(`model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'));`);
    assertSeparateLanes();
  }
});
test('a manually joined branch stays anchored without changing wire identity',()=>{
  run(`model={nodes:[],wires:[{id:'a',from:{x:0,y:0},to:{x:200,y:0},points:[{x:100,y:100}]},{id:'b',from:{x:100,y:100},to:{x:100,y:200},points:[]}]};var before=JSON.stringify(model);`);
  run('var anchored=planTidyWires();');
  assert.equal(run('JSON.stringify(model)===before'),true);
  run('model.wires=anchored;');
  assert.equal(run('wireNetworks().groups.size'),1);
  assert.equal(run('onWire({x:100,y:100},wireEnds(model.wires[0]))'),true);
  assert.equal(run('model.wires.map(w=>w.id).join(",")'),'a,b');
  assertSeparateLanes();
});

test('a branch attached halfway along a straight wire stays joined after tidying',()=>{
  run(`model={nodes:[],wires:[{id:'a',from:{x:0,y:0},to:{x:200,y:0},points:[]},{id:'b',from:{x:100,y:0},to:{x:100,y:120},points:[]}]};model.wires=planTidyWires();`);
  assert.equal(run('wireNetworks().groups.size'),1);
  assert.equal(run('onWire({x:100,y:0},wireEnds(model.wires[0]))'),true);
  assertSeparateLanes();
});

test('five branches at one free junction fan out without losing the junction',()=>{
  run(`model={nodes:[],wires:Array.from({length:5},(_,i)=>({id:'branch'+i,from:{x:0,y:0},to:{x:240,y:(i-2)*120},points:[{x:120,y:0}]}))};model.wires=planTidyWires();`);
  assert.equal(run('wireNetworks().groups.size'),1);
  assert.equal(run('model.wires.length'),5);
  assertSeparateLanes();
});

test('manual mixed-finish circuit preserves mid-wire junctions, feedback and rotated ports',()=>{
  ctx.manualRoutingFixture=require('./fixtures/manual-routing.cjs');
  run('model=structuredClone(manualRoutingFixture);var manualBefore=JSON.stringify(model);var manualRouted=planTidyWires();');
  assert.equal(run('JSON.stringify(model)===manualBefore'),true);
  assert.equal(run('manualRouted.every((w,i)=>w.id===model.wires[i].id&&w.style===model.wires[i].style&&w.color===model.wires[i].color&&JSON.stringify(w.from)===JSON.stringify(model.wires[i].from)&&JSON.stringify(w.to)===JSON.stringify(model.wires[i].to))'),true);
  run('model.wires=manualRouted;');
  assert.equal(run('onWire({x:1560,y:96},wireEnds(model.wires[14]))'),true);
  assert.equal(run('onWire({x:3360,y:240},wireEnds(model.wires[32]))'),true);
});
test('crowded two-lever OR branch can be tidied without moving components or changing connections',()=>{
  ctx.crowdedBranch=require('./fixtures/tidy-crowded-branch.cjs');
  run('model=structuredClone(crowdedBranch);var crowdedBefore=JSON.stringify(model),crowdedNet=wireNetworkSignature();');
  run('var crowdedRouted=planTidyWires();');
  assert.equal(run('JSON.stringify(model)===crowdedBefore'),true);
  assert.equal(run('crowdedRouted.length'),6);
  run('model.wires=crowdedRouted;');
  assert.equal(run('wireNetworkSignature()===crowdedNet'),true);
  assert.equal(run('model.wires.every(w=>wireEnds(w).slice(1).every((b,i)=>{const a=wireEnds(w)[i];return a.x===b.x||a.y===b.y;}))'),true);
  assert.equal(run('model.wires.every(w=>{const path=wireEnds(w);return new Set(path.map(p=>`${p.x},${p.y}`)).size===path.length;})'),true,'tidy should not leave backtracking loops');
  assertSeparateLanes();
});
test('an impossible separate area does not prevent the crowded branch from being tidied',()=>{
  ctx.crowdedBranch=require('./fixtures/tidy-crowded-branch.cjs');
  run(`model=structuredClone(crowdedBranch);
    model.nodes.push(designNode('blocked','or',1000,1000));
    model.wires.push({id:'blocked-wire',from:{x:1020,y:1020},to:{x:1200,y:1020},points:[]});
    var originalJSON=JSON.stringify(model),originalNet=wireNetworkSignature();`);
  assert.throws(()=>run('planTidyWires()'),/Unable to route/);
  run('var partial=planTidyBestEffort();');
  assert.equal(run('JSON.stringify(model)===originalJSON'),true);
  assert.equal(run('partial.skipped'),1);
  assert.equal(run('partial.areas'),1);
  assert.equal(run("JSON.stringify(partial.wires.at(-1))===JSON.stringify(model.wires.at(-1))"),true);
  run('model.wires=partial.wires;');
  assert.equal(run('wireNetworkSignature()===originalNet'),true);
  assert.equal(run("model.wires.slice(0,6).some((w,i)=>JSON.stringify(w.points)!==JSON.stringify(crowdedBranch.wires[i].points))"),true);
});
test('expanded crowded branch can still tidy some wires without changing its connections',()=>{
  ctx.expandedBranch=require('./fixtures/tidy-expanded-branch.cjs');
  run('model=structuredClone(expandedBranch);var expandedBefore=JSON.stringify(model),expandedNet=wireNetworkSignature();');
  const result=run('var expandedResult=planTidyBestEffort();expandedResult');
  assert.equal(run('JSON.stringify(model)===expandedBefore'),true);
  assert.equal(run('JSON.stringify(model.wires)!==JSON.stringify(expandedResult.wires)'),true,'Tidy should make visible progress on this circuit');
  run('model.wires=expandedResult.wires;');
  assert.equal(run('wireNetworkSignature()===expandedNet'),true);
  assert.equal(run('model.wires.every(w=>{const p=wireEnds(w);return p.slice(1).every((b,i)=>p[i].x===b.x||p[i].y===b.y)})'),true);
  assertSeparateLanes();
});
test('the full 51-wire workspace makes progress without altering any electrical net',()=>{
  ctx.fullWorkspace=require('./fixtures/tidy-full-workspace.cjs');
  run('model=structuredClone(fullWorkspace);var fullBefore=JSON.stringify(model),fullNet=wireNetworkSignature();var fullRouted=planTidyBestEffort();');
  assert.equal(run('JSON.stringify(model)===fullBefore'),true);
  const changed=run('fullRouted.wires.flatMap((w,i)=>JSON.stringify(w.points)!==JSON.stringify(model.wires[i].points)?[i]:[])');
  assert.equal(changed.length>0,true);
  assert.equal(changed.filter(i=>[14,15,19,20,44,45,46,47,48,49,50].includes(i)).length>=8,true,`Expanded OR branch must improve; changed ${changed.join(',')}`);
  run('model.wires=fullRouted.wires;');
  assert.equal(run('wireNetworkSignature()===fullNet'),true);
  assertSeparateLanes();
});
test('panning advances simulation without rebuilding the canvas',()=>{
  run(`model={nodes:[designNode('switch','lever',0,0,{on:false})],wires:[]};var paints=0;renderSelection=()=>paints++;paintTimingFaces=()=>paints++;simulate(false);paints=0;gesture={type:'pan'};model.nodes[0].on=true;simulate(true,200);`);
  assert.equal(run('values.get("switch").out[0]'),true);
  assert.equal(run('paints'),0);
  run('gesture=null;');
});
test('routing leaves rotated ports on the correct side of each board',()=>{
  for(const rotation of [0,90,180,270]){
    assert.equal(run(`(()=>{const nodes=[designNode('a','inverter',0,0,{rotation:${rotation}}),designNode('b','inverter',384,192,{rotation:${rotation}})];const wires=routeDesignWires(nodes,[{from:{node:'a',side:'out',index:0},to:{node:'b',side:'in',index:0}}],'rotation');return wires.length===1;})()`),true);
  }
});
test('counter and calculator keep independent signals at least ten units apart on parallel runs',()=>{
  assert.equal(run(`['counter-0-15','calculator-0-0'].every(id=>{
    model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id===id));
    const wires=model.wires.map(w=>wireEnds(w)),parent=wires.map((_,i)=>i),root=i=>{while(parent[i]!==i)i=parent[i];return i;};
    for(let i=0;i<wires.length;i++)for(let j=0;j<i;j++)if([wires[i][0],wires[i].at(-1)].some(a=>[wires[j][0],wires[j].at(-1)].some(b=>near(a,b))))parent[root(i)]=root(j);
    const segments=wires.flatMap((p,i)=>p.slice(1).map((b,j)=>({a:p[j],b,net:root(i)}))).filter(s=>!near(s.a,s.b));
    return segments.every((s,i)=>segments.slice(i+1).every(t=>{
      if(s.net===t.net)return true;const h=s.a.y===s.b.y;if(h!==(t.a.y===t.b.y))return true;
      const separation=Math.abs(h?s.a.y-t.a.y:s.a.x-t.a.x);
      const overlap=Math.min(Math.max(h?s.a.x:s.a.y,h?s.b.x:s.b.y),Math.max(h?t.a.x:t.a.y,h?t.b.x:t.b.y))-Math.max(Math.min(h?s.a.x:s.a.y,h?s.b.x:s.b.y),Math.min(h?t.a.x:t.a.y,h?t.b.x:t.b.y));
      return separation>=10||overlap<=0.01;
    }));
  })`),true);
});
test('crossings get bridges, actual branches get dots, and geometry is cached',()=>{
  run(`model={nodes:[],wires:[{id:'h',from:{x:0,y:50},to:{x:100,y:50},points:[]},{id:'v',from:{x:50,y:0},to:{x:50,y:100},points:[]}]};var geometry=wireDrawing(wireNetworks());`);
  assert.match(run("geometry.paths.get('h')"),/ Q /);
  assert.equal(run('geometry.junctions.length'),0);
  assert.equal(run('wireDrawing(wireNetworks())===geometry'),true);
  run("model.wires[1].from={x:50,y:50};geometry=wireDrawing(wireNetworks());");
  assert.doesNotMatch(run("geometry.paths.get('h')"),/ Q /);
  assert.equal(run('geometry.junctions.some(p=>p.x===50&&p.y===50)'),true);
});
test('straight two-wire continuations do not add a cluttering junction dot',()=>{
  run("model={nodes:[],wires:[{id:'left',from:{x:0,y:0},to:{x:50,y:0},points:[]},{id:'right',from:{x:50,y:0},to:{x:100,y:0},points:[]}]};");
  assert.equal(run('wireDrawing(wireNetworks()).junctions.length'),0);
  assert.equal(run('wireNetworks().groups.size'),1);
});
test('overlapping wire picker identifies only the routes near the click',()=>{
  run("model={nodes:[],wires:[{id:'a',from:{x:0,y:0},to:{x:100,y:0},points:[]},{id:'b',from:{x:50,y:-50},to:{x:50,y:50},points:[]},{id:'far',from:{x:0,y:40},to:{x:100,y:40},points:[]}]};view.scale=1;");
  assert.equal(run("wireChoicesAt({x:50,y:0}).map(choice=>choice.w.id).join(',')"),'a,b');
});
test('crossing sections stay above vertical legs even when both wires have bumps',()=>{
  run(`class TestSvg{
    constructor(){this.children=[];this.attrs={};this.dataset={};this.style={setProperty:(k,v)=>this.attrs[k]=v};}
    setAttribute(k,v){this.attrs[k]=String(v);}append(...items){this.children.push(...items);}replaceChildren(){this.children=[];}addEventListener(){}
    cloneNode(){const copy=new TestSvg();copy.attrs={...this.attrs};return copy;}
  }
  const testElements=new Map();document.getElementById=id=>{if(!testElements.has(id))testElements.set(id,new TestSvg());return testElements.get(id);};document.createElementNS=()=>new TestSvg();els.wires=new TestSvg();
  var crossingFixture=[
    {id:'h',from:{x:0,y:50},to:{x:200,y:150},points:[{x:100,y:50},{x:100,y:150}],style:'neon',color:'Red'},
    {id:'v',from:{x:50,y:0},to:{x:150,y:200},points:[{x:50,y:100},{x:150,y:100}]}
  ];selectedWires=new Set(['h']);
  function drawnSegments(d){
    const commands=d.match(/[MLQ][^MLQ]*/g)||[],segments=[];let at='';
    for(const command of commands){
      const [kind,...numbers]=command.trim().split(/\\s+/);
      if(kind!=='M')segments.push(at+' '+kind+' '+numbers.join(' '));
      at=numbers.slice(-2).join(' ');
    }return segments.sort();
  }`);
  for(let order=0;order<2;order++)for(let reversed=0;reversed<4;reversed++){
    run(`model={nodes:[],wires:structuredClone(crossingFixture)};
      model.wires.forEach((w,i)=>{if(${reversed}&(1<<i)){[w.from,w.to]=[w.to,w.from];w.points.reverse();}});
      if(${order})model.wires.reverse();
      var unchanged=JSON.stringify(model);renderWires();
      var geometry=wireDrawing(wireNetworks()),visiblePaths=els.wires.children.filter(p=>p.attrs.class?.startsWith('wire-path'));
    `);
    assert.equal(run('geometry.bridges.size'),2,'both wires need to cross over the other');
    assert.equal(run('JSON.stringify(model)===unchanged'),true,'rendering must not reroute or edit the circuit');
    assert.equal(run("visiblePaths.map(p=>p.dataset.layer).join(',')"),'under,under,over,over');
    assert.equal(run("visiblePaths.filter(p=>p.dataset.id==='h').every(p=>p.attrs.class==='wire-path wire-neon selected'&&p.attrs['--neon-color']===neonColor(model.wires.find(w=>w.id==='h')).hex)"),true);
    assert.equal(run(`model.wires.every(w=>{
      const parts=visiblePaths.filter(p=>p.dataset.id===w.id);
      return JSON.stringify(parts.flatMap(p=>drawnSegments(p.attrs.d)).sort())===JSON.stringify(drawnSegments(geometry.paths.get(w.id)));
    })`),true,'every original line and curve is drawn exactly once');
    assert.equal(run("visiblePaths.filter(p=>p.dataset.layer==='under').every(p=>!p.attrs.d.includes(' Q '))"),true);
    assert.equal(run("els.wires.children.flatMap(g=>g.children).filter(p=>p.attrs.class==='wire-hit').every(p=>p.attrs.d===pathFor(wireEnds(model.wires.find(w=>w.id===p.dataset.id))))"),true,'hit targets remain unchanged');
  }
});
