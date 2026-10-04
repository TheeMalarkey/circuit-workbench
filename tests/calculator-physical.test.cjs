const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');

test('built-in calculator schematic calculates through its physical wires and real keypad buttons',()=>{
  const ctx=loadApp(),run=code=>vm.runInContext(code,ctx);
  run(`model=structuredClone(CALCULATOR_DESIGN);
    renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};setStatus=()=>{};
    resetTiming();simulate(false);`);
  // No network substitution, preset operand bits, or arithmetic callback: the
  // same ports, routed wires, button queue, buffers and timing as the browser.
  const press=id=>run(`pressButton(nodeBy(${JSON.stringify(id)}));`);
  const advance=ms=>run(`simulate(true,${ms});`);
  const screen=(prefix,count)=>run(`Array.from({length:${count}},(_,place)=>{
    const pins=values.get(${JSON.stringify(prefix+'-display-')}+place).in;
    const lit=[...SEGMENT_NAMES].filter((_,i)=>pins[i]).join('');
    return lit==='g'?'-':String(SEGMENT_DIGITS.findIndex(glyph=>glyph===lit));
  }).reverse().join('')`);
  const store=(which,value)=>{
    for(const digit of String(value)){press('key'+digit);advance(400);}
    assert.equal(screen('entry',4),String(value).padStart(4,'0'));
    press('set'+which);advance(2200);
    assert.equal(screen('var'+which,4),String(value).padStart(4,'0'));
    assert.equal(screen('entry',4),'0000');
  };
  const calculate=operation=>{press('op-'+operation);advance(400);press('calculate');advance(operation==='mul'?12600:1000);};
  assert.equal(run('valid(model)'),true);
  assert.equal(screen('entry',4),'0000');assert.equal(screen('result',8),'00000000');
  store(1,12);store(2,3);calculate('add');
  assert.equal(screen('result',8),'00000015');
  store(1,3);store(2,12);calculate('sub');
  assert.equal(screen('result',8),'-0000009');
  store(1,12);store(2,3);calculate('mul');
  assert.equal(screen('result',8),'00000036');
  assert.equal(run(`values.get('busy').out[0]`),false);
  assert.equal(run(`[...values.values()].some(value=>value.unstable)`),false);

  // Removing the physical routes from the answer memory must blank its value
  // at the decimal decoder even while the stored answer itself remains 36.
  const removed=run(`const before=model.wires.length;
    model.wires=model.wires.filter(w=>!/^answer-\\d+$/.test(w.from.node||''));
    simulate(false);before-model.wires.length;`);
  assert.ok(removed>0,'fault injection must actually disconnect the answer bus');
  assert.equal(run(`Array.from({length:28},(_,i)=>nodeBy('answer-'+i).bit?2**i:0).reduce((a,b)=>a+b,0)`),36);
  assert.equal(screen('result',8),'00000000','a disconnected result cannot be shown by metadata or hidden arithmetic');
});
