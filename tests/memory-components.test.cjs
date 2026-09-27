const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function rig(id){
  const ctx=vm.createContext({structuredClone,crypto:{randomUUID:()=>require('node:crypto').randomUUID()},document:{getElementById:()=>({})},localStorage:{getItem:()=>null}});
  vm.runInContext(source+`;renderSelection=()=>{};save=()=>{};updateHistory=()=>{};render=()=>{};model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id===${JSON.stringify(id)}));simulate(false);`,ctx);
  return {run:s=>vm.runInContext(s,ctx),out:id=>vm.runInContext(`values.get('${id}').out.join(',')`,ctx)};
}
test('selectors use an integrated orange advance button without the rotation glyph',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../dist/styles.css'),'utf8');
  assert.match(source,/control\('',`Advance \$\{part\.name\}`/);
  assert.match(source,/advance\.innerHTML='<span class="button-face"><\/span>'/);
  assert.doesNotMatch(source,/control\('↻'/);
  assert.match(css,/\.node\.selector-part \.selector-advance\s*\{[^}]*background:linear-gradient\(130deg,#edb15b,#d7953b\)/);
});
test('Buffer 1 retains provisional stored-bit behavior on its single output',()=>{
  const r=rig('buffer-one-test');assert.equal(r.out('memory'),'false');
  r.run("pressButton(nodeBy('one'));");assert.equal(r.out('memory'),'true');
  r.run('simulate(true,600);');assert.equal(r.out('memory'),'true');
  r.run("pressButton(nodeBy('zero'));");assert.equal(r.out('memory'),'false');
});
test('held write input writes once and repeated separate writes displace the stored value',()=>{
  const r=rig('buffer-one-test');r.run("nodeBy('one').type='lever';nodeBy('one').on=true;simulate(false);simulate(true,2000);");assert.equal(r.out('memory'),'true');
  r.run("nodeBy('one').on=false;simulate(false);nodeBy('one').on=true;simulate(false);");assert.equal(r.out('memory'),'true');
});
test('simultaneous buffer inputs are ignored under the explicitly provisional rule',()=>{
  const r=rig('buffer-one-test');r.run("nodeBy('zero').type='lever';nodeBy('one').type='lever';nodeBy('zero').on=true;nodeBy('one').on=true;simulate(false);");assert.equal(r.out('memory'),'false');
});
test('Buffer bit survives serialization without replaying its write or old-bit pulse',()=>{
  const r=rig('buffer-one-test');r.run("nodeBy('one').type='lever';nodeBy('one').on=true;simulate(false);model=normalize(JSON.parse(JSON.stringify(model)));resetTiming();simulate(false);");assert.equal(r.out('memory'),'true');assert.equal(r.run('valid(model)'),true);
});
test('Selector cycles all outputs, holds between pulses and wraps',()=>{
  const r=rig('selector-four-test');assert.equal(r.out('selector'),'true,false,false,false');
  for(const channel of [1,2,3,0,1]){r.run("pressButton(nodeBy('source'));simulate(true,400);");assert.equal(r.run("nodeBy('selector').channel"),channel);assert.equal(r.run("values.get('selector').out.filter(Boolean).length"),1);}
});

test('reference Buffer 1 has a 2 by 1 body and forwards old bits through the opposite row',()=>{
  const r=rig('buffer-one-test');
  assert.equal(r.run("JSON.stringify(footprint(nodeBy('memory')))"),'{"w":96,"h":48}');
  assert.equal(r.run("JSON.stringify([0,1,2,3].map(i=>localPort(nodeBy('memory'),'in',i)))"),'[{"x":24,"y":0},{"x":72,"y":0},{"x":24,"y":48},{"x":72,"y":48}]');
  assert.equal(r.run("JSON.stringify(localPort(nodeBy('memory'),'out',0))"),'{"x":96,"y":24}');
  r.run("model.wires.find(w=>w.id==='one-feed').to.index=3;pressButton(nodeBy('one'));");
  assert.equal(r.out('memory'),'true');
  assert.equal(r.run("values.get('memory').in.join(',')"),'true,false,false,true');
  r.run("simulate(true,600);model.wires.find(w=>w.id==='zero-feed').to.index=2;pressButton(nodeBy('zero'));");
  assert.equal(r.out('memory'),'false');
  assert.equal(r.run("values.get('memory').in.join(',')"),'false,true,true,false');
});

test('repeated top writes forward the displaced bit without self-triggering',()=>{
  const r=rig('buffer-one-test');
  r.run("pressButton(nodeBy('one'));");
  assert.equal(r.run("bufferPulsePort('memory')"),2);
  assert.equal(r.out('memory'),'true');
  r.run('simulate(true,600);');
  assert.equal(r.run("bufferPulsePort('memory')"),undefined);
  r.run("pressButton(nodeBy('one'));");
  assert.equal(r.run("bufferPulsePort('memory')"),3);
  assert.equal(r.out('memory'),'true');
  r.run("simulate(true,600);pressButton(nodeBy('zero'));");
  assert.equal(r.run("bufferPulsePort('memory')"),3);
  assert.equal(r.out('memory'),'false');
});

test('forwarded old-bit pulse powers an attached wire and writes another buffer',()=>{
  const r=rig('buffer-one-test');
  r.run("model.nodes.push(designNode('receiver','buffer1',576,288));model.wires.push(designWire('forward',{node:'memory',side:'in',index:2},{node:'receiver',side:'in',index:1}));simulate(false);pressButton(nodeBy('one'));");
  assert.equal(r.out('memory'),'true');
  assert.equal(r.out('receiver'),'true');
  assert.equal(r.run("networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id).out]))).powered.get(wireNetworks().byWire.get('forward'))"),true);
  r.run('simulate(true,600);');
  assert.equal(r.out('receiver'),'true');
  assert.equal(r.run("networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id).out]))).powered.get(wireNetworks().byWire.get('forward'))"),false);
});

test('removed prototype buffer outputs migrate to loose ends without dropping wires',()=>{
  const r=rig('buffer-one-test');
  r.run("model.wires.push(designWire('old-output',{node:'memory',side:'out',index:2},{x:720,y:216}));model=normalize(model);");
  assert.equal(r.run('valid(model)'),true);
  assert.equal(r.run("model.wires.find(w=>w.id==='old-output').from.node"),undefined);
  assert.equal(r.run("model.wires.find(w=>w.id==='old-output').from.x"),432);
});
test('Selector skips disabled channels and one enabled channel toggles',()=>{
  const r=rig('selector-four-test');r.run("nodeBy('selector').enabled=[true,false,true,false];");
  for(const channel of [2,0,2]){r.run("advanceSelector(nodeBy('selector'));simulate(false);");assert.equal(r.run("nodeBy('selector').channel"),channel);}
  r.run("nodeBy('selector').enabled=[true,false,false,false];advanceSelector(nodeBy('selector'));simulate(false);");assert.equal(r.out('selector'),'true,false,false,false');
  r.run("advanceSelector(nodeBy('selector'));simulate(false);");assert.equal(r.out('selector'),'false,false,false,false');
});
test('disabled active channel advances and all-disabled selector is safe',()=>{
  const r=rig('selector-four-test');r.run("toggleSelectorOutput(nodeBy('selector'),0);");assert.equal(r.out('selector'),'false,true,false,false');
  r.run("nodeBy('selector').enabled=[false,false,false,false];advanceSelector(nodeBy('selector'));simulate(false);");assert.equal(r.out('selector'),'false,false,false,false');
});
test('held selector input does not cycle repeatedly and settings survive reload',()=>{
  const r=rig('selector-four-test');r.run("nodeBy('source').type='lever';nodeBy('source').on=true;simulate(false);simulate(true,2000);nodeBy('selector').enabled=[true,true,false,true];model=normalize(JSON.parse(JSON.stringify(model)));resetTiming();simulate(false);");assert.equal(r.out('selector'),'false,true,false,false');assert.equal(r.run("nodeBy('selector').enabled[2]"),false);
});
test('memory fixtures have valid isolated outputs and rotatable grid-aligned ports',()=>{
  for(const id of ['buffer-one-test','buffer-2-shift','buffer-4-shift','selector-four-test']){
    const r=rig(id);assert.equal(r.run('valid(model)'),true);
    assert.equal(r.run("new Set(model.wires.filter(w=>w.id.startsWith('out-')).map(w=>wireNetworks().byWire.get(w.id))).size"),id==='buffer-one-test'?1:id==='buffer-2-shift'?2:4);
    r.run("for(const n of model.nodes)n.rotation=90;");assert.equal(r.run('valid(model)'),true);
    assert.equal(r.run("model.nodes.every(n=>['in','out'].every(side=>PARTS[n.type][side==='in'?'inputs':'outputs'].every((_,i)=>{const p=portPosition(n,side,i);return Number.isFinite(p.x)&&Number.isFinite(p.y);})))"),true);
  }
});

for(const count of [2,4])test(`Buffer ${count} reproduces reference bidirectional sequence and saves all bits`,()=>{
  const r=rig(`buffer-${count}-shift`);
  const bits=()=>r.run("values.get('memory').out.map(Number).join('')");
  assert.equal(bits(),'0'.repeat(count));
  r.run("pressButton(nodeBy('one'));simulate(true,600);");assert.equal(bits(),'1'+'0'.repeat(count-1));
  r.run("pressButton(nodeBy('one'));");assert.equal(bits(),'11'+'0'.repeat(count-2));
  assert.equal(r.run("bufferPulsePort('memory')"),2);
  r.run("simulate(true,600);pressButton(nodeBy('zero'));");assert.equal(bits(),'1'+'0'.repeat(count-1));
  assert.equal(r.run("bufferPulsePort('memory')"),1);
  r.run("simulate(true,600);model=normalize(JSON.parse(JSON.stringify(model)));resetTiming();simulate(false);");
  assert.equal(bits(),'1'+'0'.repeat(count-1));assert.equal(r.run('valid(model)'),true);
  for(const rotation of [0,90,180,270]){
    r.run(`nodeBy('memory').rotation=${rotation};`);
    assert.equal(r.run("JSON.stringify(footprint(nodeBy('memory')))"),JSON.stringify(rotation%180?{w:count*48,h:96}:{w:96,h:count*48}));
  }
});

for(const count of [4,8,16])test(`Selector ${count} geometry, cycling, disable and intentional-off persistence`,()=>{
  const r=rig(count===4?'selector-four-test':`selector-${count}-test`);
  assert.equal(r.run("values.get('selector').out[0]"),true);
  assert.equal(r.run("new Set(model.wires.filter(w=>w.id.startsWith('out-')).map(w=>wireNetworks().byWire.get(w.id))).size"),count);
  for(let channel=1;channel<=count;channel++){
    r.run("pressButton(nodeBy('source'));simulate(true,600);");
    assert.equal(r.run("values.get('selector').out.findIndex(Boolean)"),channel%count);
  }
  r.run("toggleSelectorOutput(nodeBy('selector'),0);");assert.equal(r.run("nodeBy('selector').channel"),1);
  r.run("nodeBy('selector').channel=-1;toggleSelectorOutput(nodeBy('selector'),0);");
  assert.equal(r.run("values.get('selector').out.some(Boolean)"),false);
  r.run("model=normalize(JSON.parse(JSON.stringify(model)));resetTiming();simulate(false);");
  assert.equal(r.run("nodeBy('selector').channel"),-1);
  assert.equal(r.run("nodeBy('selector').enabled.length"),count);
  assert.equal(r.run('valid(model)'),true);
  assert.equal(r.run("JSON.stringify(localPort(nodeBy('selector'),'out',0))"),'{"x":24,"y":96}');
  for(const rotation of [0,90,180,270]){
    r.run(`nodeBy('selector').rotation=${rotation};`);
    assert.equal(r.run("JSON.stringify(footprint(nodeBy('selector')))"),JSON.stringify(rotation%180?{w:96,h:count*48}:{w:count*48,h:96}));
  }
});

test('selector footprint migration keeps a recoverable original browser save',()=>{
  const r=rig('selector-four-test');
  r.run("const saved=new Map([['projects',JSON.stringify(model)]]);localStorage.getItem=k=>saved.get(k)??null;localStorage.setItem=(k,v)=>saved.set(k,v);backupArithmeticLayout('projects');");
  assert.equal(r.run("saved.get('projects-before-selector-layout-v1')===saved.get('projects')"),true);
});
