const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
function rig(){
  const ctx=loadApp();
  vm.runInContext(`renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};
    function oldForwardedContacts(){
      const result=new Map();
      for(const source of model.nodes)if(PARTS[source.type].inputs.length){
        result.set(source.id,PARTS[source.type].inputs.map((_,index)=>{
          const point=portPosition(source,'in',index),targets=[];
          for(const other of model.nodes)if(other.id!==source.id)PARTS[other.type].inputs.forEach((__,i)=>{
            if(near(point,portPosition(other,'in',i)))targets.push({node:other.id,index:i});
          });
          return targets;
        }));
      }
      return [...result];
    }
    function contactFixture(rotation,deltaX=0,deltaY=0){
      model={name:'forwarded sockets',nodes:[designNode('source','buffer4',-160.25,-200.75,{rotation}),designNode('target','inverter',288,288,{rotation:90}),designNode('far','and',3000,3000)],wires:[]};
      const from=portPosition(model.nodes[0],'in',2),to=portPosition(model.nodes[1],'in',0);
      model.nodes[1].x+=from.x-to.x+deltaX;model.nodes[1].y+=from.y-to.y+deltaY;
    }
  `,ctx);
  const run=code=>vm.runInContext(code,ctx);return{run,json:code=>JSON.parse(run(`JSON.stringify(${code})`))};
}
test('forwarded input contact index matches the old exact lookup for rotations and fractional neighbors',()=>{
  const r=rig();
  for(const rotation of [0,90,180,270])for(const [dx,dy] of [[0,0],[.49,0],[.5,0],[.5001,0],[-.5,0],[0,-.5],[.3,.4],[.301,.4]]){
    r.run(`contactFixture(${rotation},${dx},${dy});`);
    assert.deepEqual(r.json('[...forwardedInputContacts()]'),r.json('oldForwardedContacts()'),`${rotation}°, offset ${dx},${dy}`);
    assert.equal(r.run(`[...forwardedInputContacts()].every(([node,ports])=>ports.every(targets=>targets.every(p=>p.node!==node)))`),true);
  }
});
test('forwarded input contact index preserves multiple target order and is cached by topology',()=>{
  const r=rig();r.run(`contactFixture(270);const p=portPosition(model.nodes[0],'in',2);
    for(let i=0;i<20;i++){const n=designNode('next'+i,i%2?'buffer1':'inverter',1000,1000,{rotation:(i%4)*90});const q=portPosition(n,'in',0);n.x+=p.x-q.x+(i%3-1)*.2;n.y+=p.y-q.y;model.nodes.push(n);}
  `);
  assert.deepEqual(r.json('[...wireNetworks().pulseContacts]'),r.json('oldForwardedContacts()'));
  assert.equal(r.run('wireNetworks().pulseContacts===wireNetworks().pulseContacts'),true);
  r.run(`const cachedContacts=wireNetworks().pulseContacts;nodeBy('target').x+=10;`);
  assert.equal(r.run('wireNetworks().pulseContacts===cachedContacts'),false);
  assert.deepEqual(r.json('[...wireNetworks().pulseContacts]'),r.json('oldForwardedContacts()'));
});
test('forwarded pulse activates an adjacent input without geometry checks on each gate pass',()=>{
  const r=rig();r.run(`contactFixture(90,.5,0);simulationMs=0;memoryStates.set('source',{old:false,port:2,until:100});
    wireNetworks();let positionCalls=0;const positionOriginal=portPosition;portPosition=(...args)=>{positionCalls++;return positionOriginal(...args);};
    const forwarded=resolveSignals();`);
  assert.equal(r.run(`forwarded.get('target').in[0]`),true);
  assert.equal(r.run(`forwarded.get('target').drive[0]`),true);
  assert.equal(r.run(`forwarded.get('target').out[0]`),false);
  assert.equal(r.run(`forwarded.get('source').in[2]`),true);
  assert.equal(r.run(`forwarded.get('source').drive[2]`),false,'a buffer must not trigger itself from its displaced-bit pulse');
  assert.equal(r.run('positionCalls'),0,'cached topology eliminates repeated socket geometry');
  r.run(`simulationMs=100;const expired=resolveSignals();`);
  assert.equal(r.run(`expired.get('target').in[0]`),false);
});
test('legacy synthetic networks without pulseContacts retain real adjacent-socket forwarding',()=>{
  const r=rig();r.run(`contactFixture(0);simulationMs=0;memoryStates.set('source',{old:false,port:2,until:100});
    const legacyNetwork=wireNetworks();delete legacyNetwork.pulseContacts;simulationNetwork=legacyNetwork;const fallback=resolveSignals();simulationNetwork=null;`);
  assert.equal(r.run(`fallback.get('target').drive[0]`),true);
  assert.equal(r.run(`fallback.get('target').out[0]`),false);
});
