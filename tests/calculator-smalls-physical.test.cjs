const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');

function rig(constant){
  const ctx=loadApp(),run=code=>vm.runInContext(code,ctx);
  run(`model=structuredClone(${constant});
    renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};setStatus=()=>{};
    resetTiming();simulate(false);`);
  assert.equal(run('valid(model)'),true);
  return {
    run,
    press:id=>run(`pressButton(nodeBy(${JSON.stringify(id)}));`),
    advance:ms=>run(`simulate(true,${ms});`),
    face:id=>run(`(()=>{const pins=values.get(${JSON.stringify(id)}).in;
      const lit=[...SEGMENT_NAMES].filter((_,i)=>pins[i]).join('');
      return lit==='g'?'-':lit?String(SEGMENT_DIGITS.findIndex(glyph=>glyph===lit)):' ';
    })()`),
  };
}

test('stored one-digit calculator drives its physical A/B/result displays',()=>{
  const r=rig('CALCULATOR_SMALL_STORED_DESIGN');
  const enter=digit=>{r.press(`small-stored-key${digit}`);r.advance(400);};
  const store=(which,digit)=>{enter(digit);r.press(`small-stored-set${which}`);r.advance(1200);};
  const answer=()=>r.face('small-stored-result-1-display')+r.face('small-stored-result-0-display');
  store(1,9);store(2,9);
  assert.equal(r.face('small-stored-var1-display'),'9');
  assert.equal(r.face('small-stored-var2-display'),'9');
  r.press('small-stored-op-mul');r.advance(400);
  r.press('small-stored-calculate');r.advance(1200);
  assert.equal(answer(),'81');
  r.press('small-stored-op-add');r.advance(400);
  r.press('small-stored-calculate');r.advance(1200);
  assert.equal(answer(),'18');
  store(1,0);
  r.press('small-stored-op-sub');r.advance(400);
  r.press('small-stored-calculate');r.advance(1200);
  assert.equal(answer(),'-9');
  assert.equal(r.run(`[...values.values()].some(value=>value.unstable)`),false);
  const removed=r.run(`(()=>{const before=model.wires.length;
    model.wires=model.wires.filter(w=>!/^small-stored-answer-\\d+$/.test(w.from.node||''));
    simulate(false);return before-model.wires.length;})()`);
  assert.ok(removed>0,'fault injection must disconnect the stored answer bus');
  assert.notEqual(answer(),'-9','stored answer must reach the display through wires');
});

test('auto one-digit calculator lights result on B and loses it if answer wires are removed',()=>{
  const r=rig('CALCULATOR_SMALL_AUTO_DESIGN');
  const push=id=>{r.press(id);r.advance(400);};
  const answer=()=>r.face('auto-result-tens-display')+r.face('auto-result-units-display');
  assert.equal(answer(),'  ');
  push('auto-key9');push('auto-op-mul');push('auto-key9');
  assert.equal(answer(),'81');
  push('auto-clear');assert.equal(answer(),'  ');
  push('auto-key0');push('auto-op-sub');push('auto-key9');
  assert.equal(answer(),'-9');
  assert.equal(r.run(`[...values.values()].some(value=>value.unstable)`),false);
  const removed=r.run(`(()=>{const before=model.wires.length;
    model.wires=model.wires.filter(w=>w.to.node!=='auto-result-units-display');
    simulate(false);return before-model.wires.length;})()`);
  assert.ok(removed>0,'fault injection must disconnect a physical answer route');
  assert.notEqual(answer(),'-9','display must depend on answer wires');
});
