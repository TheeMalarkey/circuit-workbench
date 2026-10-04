const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function rig(){
  const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(source+';renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};',ctx);
  const run=code=>vm.runInContext(code,ctx),json=code=>JSON.parse(run(`JSON.stringify(${code})`));
  return{run,json};
}

test('gate-level calculator matches arithmetic and its reference across all 256 input pairs',()=>{
  const r=rig();
  r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='calculator-0-0'));simulate(false);");
  assert.equal(r.run('valid(model)'),true);
  assert.equal(r.run("model.nodes.filter(n=>n.type==='lever').length"),8);
  for(let a=0;a<16;a++)for(let b=0;b<16;b++){
    r.run(`for(let i=0;i<4;i++){nodeBy('a'+i).on=!!(${a}&(1<<i));nodeBy('b'+i).on=!!(${b}&(1<<i));}simulate(false);`);
    const actual=r.run("[0,1,2,3].reduce((sum,i)=>sum+(values.get('s'+i).out[0]?2**i:0),values.get('c3').out[0]?16:0)");
    assert.equal(actual,a+b,`${a}+${b}`);
    assert.equal(r.run("[0,1,2,3,4].some(i=>values.get('check'+i).out[0])"),false,`comparison ${a}+${b}`);
    const low=(a+b)%16;
    assert.deepEqual(r.json("values.get('tensDisplay').in"),r.json(`[...SEGMENT_NAMES].map(s=>SEGMENT_DIGITS[${Math.floor(low/10)}].includes(s))`));
    assert.deepEqual(r.json("values.get('unitsDisplay').in"),r.json(`[...SEGMENT_NAMES].map(s=>SEGMENT_DIGITS[${low%10}].includes(s))`));
  }
  // Break a real gate to prove the comparison indicators can detect a fault.
  r.run("nodeBy('s0').type='xnor';simulate(false);");
  assert.equal(r.run("values.get('check0').out[0]"),true);
});
test('calculator presets survive import and copying with their labels and saved inputs',()=>{
  const r=rig();
  for(const [a,b] of [[0,0],[7,8],[15,1],[15,15]]){
    r.run(`model=normalize(JSON.parse(JSON.stringify(BUILT_IN_DESIGNS.find(d=>d.id==='calculator-${a}-${b}'))));simulate(false);`);
    assert.equal(r.run("[0,1,2,3].reduce((sum,i)=>sum+(values.get('s'+i).out[0]?2**i:0),values.get('c3').out[0]?16:0)"),a+b);
    assert.equal(r.run("nodeBy('a0').label"),'A · 1');
    r.run("model={name:'copied',...designCopy(model,{nodes:[],wires:[]})};resetTiming();simulate(false);");
    assert.equal(r.run('valid(model)'),true);
    assert.equal(r.run("model.nodes.filter(n=>n.label?.startsWith('Mismatch')).some(n=>values.get(n.id).out[0])"),false);
  }
});
test('seven-segment face stays red even when a legacy save contains another color',()=>{
  const r=rig();
  r.run(`document.createElement=()=>({style:{setProperty(k,v){this[k]=v}},append(){}});`);
  for(const color of ['Green','Blue','White',undefined]){
    assert.equal(r.run(`segmentFace({id:'old',color:${JSON.stringify(color)||'undefined'}}).style['--segment-color']`),'#f21b22');
  }
  assert.equal(source.includes('Cycle display color'),false);
  assert.equal(r.run("NEON_COLORS.find(c=>c.name==='Green').hex"),'#20e837');
});
test('fourteen-segment face uses fixed-red SVG fills without per-segment filters',()=>{
  const css=fs.readFileSync(path.join(__dirname,'../dist/styles.css'),'utf8');
  assert.match(css,/--display14-lit\s*:\s*#[0-9a-f]{6}/i);
  assert.match(css,/\.segment14\s*\{[^}]*fill:\s*var\(--display14-unlit\)/);
  assert.match(css,/\.segment14\.lit\s*\{[^}]*fill:\s*var\(--display14-lit\)/);
  for(const rule of css.matchAll(/\.segment14(?:\.lit)?\s*\{([^}]*)\}/g))assert.doesNotMatch(rule[1],/(?:^|;)\s*filter\s*:/);
  assert.equal(source.includes('Cycle display color'),false);
});
test('seven-segment bottom labels sit on a gray lip without changing the circuit footprint',()=>{
  const r=rig(),css=fs.readFileSync(path.join(__dirname,'../dist/styles.css'),'utf8');
  assert.deepEqual(r.json("footprint(designNode('display','display7',0,0))"),{w:96,h:192});
  assert.match(css,/\.node\.display7-part \.segment-face\s*\{[^}]*scaleY\(\.88\)/);
  assert.match(css,/\.node\.display7-part::after\s*\{[^}]*height:25px/);
  assert.match(css,/\.node\.converter7-part\.stacked \.port\.in \.port-label/);
});
test('Full Adder exhaustively adds two four-bit banks plus carry (512 combinations)',()=>{
  const r=rig();
  for(let a=0;a<16;a++)for(let b=0;b<16;b++)for(let carry=0;carry<2;carry++){
    const out=r.json(`evaluate('fullAdder',[...writeBits(${a}),...writeBits(${b}),${!!carry}],{})`);
    const actual=out.slice(0,4).reduce((n,x)=>n*2+Number(x),0)+(out[4]?16:0);
    assert.equal(actual,a+b+carry,`${a}+${b}+${carry}`);
  }
});

test('Add 3 keeps 0–4, adds three above four, and wraps its four output bits',()=>{
  const r=rig();
  for(let value=0;value<16;value++){
    const expected=value>4?(value+3)&15:value;
    assert.equal(r.run(`readBits(evaluate('add3',writeBits(${value}),{}))`),expected,`Add 3 input ${value}`);
  }
  assert.deepEqual(r.json("evaluate('add3',writeBits(8),{})"),[true,false,true,true],'observed 8 → 11');
  assert.deepEqual(r.json("evaluate('add3',writeBits(12),{})"),[true,true,true,true],'observed 12 → 15');
  assert.deepEqual(r.json("evaluate('add3',writeBits(13),{})"),[false,false,false,false],'observed 13 → 0');
});

test('Add 3 built-in has four independent bottom inputs and top output wires',()=>{
  const r=rig();
  r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='add-three-test'));");
  assert.equal(r.run('model.nodes.every(n=>canPlace(n,model.nodes,n.x,n.y))'),true);
  assert.equal(r.run('valid(model)'),true);
  assert.deepEqual(r.json("[0,1,2,3].map(i=>localPort(nodeBy('add3'),'in',i))"),[24,72,120,168].map(x=>({x,y:96})));
  assert.deepEqual(r.json("[0,1,2,3].map(i=>localPort(nodeBy('add3'),'out',i))"),[24,72,120,168].map(x=>({x,y:0})));
  for(let value=0;value<16;value++){
    r.run(`for(let i=0;i<4;i++)nodeBy('bit'+i).on=!!(${value}&(1<<(3-i)));simulate(false);`);
    assert.equal(r.run("readBits(values.get('add3').in)"),value,`input wires ${value}`);
    const expected=value>4?(value+3)&15:value;
    assert.equal(r.run("readBits(values.get('add3').out)"),expected,`output ${value}`);
    assert.equal(r.run("(()=>{const net=networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id).out])));return values.get('add3').out.every((on,i)=>!!net.powered.get(net.byWire.get('output-'+i))===on);})()"),true,`output wires ${value}`);
  }
  const before=r.json('model');
  r.run('model=normalize(JSON.parse(JSON.stringify(model)));simulate(false)');
  assert.deepEqual(r.json('model.nodes'),before.nodes,'saved positions and rotations retained');
  const copy=r.json('designCopy(model)');
  assert.equal(copy.nodes.length,before.nodes.length);
  assert.equal(copy.wires.length,before.wires.length);
});

test('Add 3 output can directly touch matching BCD inputs without jumper wires',()=>{
  const r=rig();
  r.run("model={name:'add3 contact',nodes:[designNode('bcd','binaryBCD',192,96),designNode('add3','add3',288,192)],wires:[]};simulate(false);");
  assert.equal(r.run('model.nodes.every(n=>canPlace(n,model.nodes,n.x,n.y))'),true);
  assert.equal(r.run('touchingPorts().length'),4);
  for(const rotation of [0,90,180,270]){
    r.run(`probe={id:'probe',type:'add3',rotation:${rotation},x:96,y:144};`);
    assert.deepEqual(r.json('footprint(probe)'),rotation%180?{w:96,h:192}:{w:192,h:96});
    assert.equal(r.run("['in','out'].every(side=>PARTS.add3[side==='in'?'inputs':'outputs'].every((_,i)=>{const p=portPosition(probe,side,i),f=footprint(probe);return p.x>=probe.x-.01&&p.y>=probe.y-.01&&p.x<=probe.x+f.w+.01&&p.y<=probe.y+f.h+.01;}))"),true);
  }
});
test('four pictured binary inputs convert all 16 values into two BCD banks',()=>{
  const r=rig();
  for(let n=0;n<16;n++)assert.deepEqual(r.json(`evaluate('binaryBCD',writeBits(${n}),{})`),[8,4,2,1].map(x=>!!(Math.floor(n/10)&x)).concat([8,4,2,1].map(x=>!!(n%10&x))));
});
test('Electro Tech 7:25–7:30 reference: binary 15 becomes decimal 1 and 5',()=>{
  const r=rig();
  assert.deepEqual(r.json("evaluate('binaryBCD',[true,true,true,true],{})"),[false,false,false,true,false,true,false,true]);
  assert.equal(r.json("evaluate('converter7',evaluate('binaryBCD',[true,true,true,true],{}).slice(0,4),{})").map(Number).join(''),'0110000');
  assert.equal(r.json("evaluate('converter7',evaluate('binaryBCD',[true,true,true,true],{}).slice(4),{})").map(Number).join(''),'1011011');
});
test('all adder combinations reach five separate output wires without shorts or stale high bits',()=>{
  const r=rig();r.run(`model={name:'adder wiring',nodes:[designNode('adder','fullAdder',0,0),...Array.from({length:9},(_,i)=>designNode('s'+i,'lever',i===8?-192:(i+(i>=4?1:0))*48,144))],wires:[]};
    for(let i=0;i<9;i++)model.wires.push(designWire('in'+i,{node:'s'+i,side:'out',index:0},{node:'adder',side:'in',index:i}));
    for(let i=0;i<5;i++){const p=portPosition(nodeBy('adder'),'out',i);model.wires.push(designWire('out'+i,{node:'adder',side:'out',index:i},{x:p.x+(i===4?96:0),y:p.y-(i===4?0:96)}));}`);
  for(let n=511;n>=0;n--){
    r.run(`for(let i=0;i<9;i++)nodeBy('s'+i).on=!!(${n}&(1<<(8-i)));simulate(false);`);
    const a=(n>>5)&15,b=(n>>1)&15,carry=n&1;
    assert.equal(r.run("readBits(values.get('adder').out.slice(0,4))+(values.get('adder').out[4]?16:0)"),a+b+carry,`wired input ${n}`);
    assert.equal(r.run("(()=>{const net=networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id).out])));return values.get('adder').out.every((on,i)=>!!net.powered.get(net.byWire.get('out'+i))===on);})()"),true,`output wires ${n}`);
  }
});
test('converter digits use independent spatial segment outputs; unsupported 10–15 are explicitly blank',()=>{
  const r=rig(),patterns=['1111110','0110000','1101101','1111001','0110011','1011011','1011111','1110000','1111111','1111011'];
  for(let n=0;n<16;n++)assert.equal(r.json(`evaluate('converter7',writeBits(${n}),{})`).map(Number).join(''),patterns[n]||'0000000');
});
test('fourteen-segment converter and stacked display match all 52 chart states',()=>{
  const r=rig(),chart=require('./fixtures/fourteen-segment-chart.json');
  assert.equal(chart.litByCode.length,52);
  assert.equal(chart.segmentOrder.length,14);
  r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='fourteen-segment-test'));");
  for(let code=0;code<64;code++){
    const expected=chart.litByCode[code]||[];
    const actual=r.json(`evaluate('converter14',Array.from({length:6},(_,i)=>!!(${code}&(1<<i))),{})`);
    assert.equal(actual.length,14);
    assert.deepEqual(actual.flatMap((on,i)=>on?[i]:[]),expected,`converter code ${code}`);
    r.run(`for(let i=0;i<6;i++)nodeBy('bit'+i).on=!!(${code}&(1<<i));simulate(false);`);
    assert.deepEqual(r.json("values.get('display').in").flatMap((on,i)=>on?[i]:[]),expected,`stacked display code ${code}`);
  }
});

test('fourteen-segment converter reproduces six photographed single-input states',()=>{
  const r=rig();
  const observed={0:[],1:[1,2],2:[0,1,3,4,6,7],4:[1,2,5,6,7],8:[0,1,2,3,4,5,6,7],16:[0,4,5,6,7],32:[4,5,9,10]};
  for(const [code,lit] of Object.entries(observed)){
    const actual=r.json(`evaluate('converter14',Array.from({length:6},(_,i)=>!!(${code}&(1<<i))),{})`);
    assert.deepEqual(actual.flatMap((on,i)=>on?[i]:[]),lit,`reference screenshot input ${code}`);
  }
  assert.equal(r.run('SEGMENT14_CODES[10]'),'0');
  assert.equal(r.run('SEGMENT14_CODES[22]'),'L');
  assert.equal(r.run('SEGMENT14_CODES[30]'),'T');
  assert.equal(r.run('SEGMENT14_CODES[45]'),'$');
  assert.equal(r.run('SEGMENT14_CODES[43]'),'?');
  assert.equal(r.run('SEGMENT14_CODES[52]'),'');
});
test('in-game 14-segment input B+C+E displays L with left and bottom strokes',()=>{
  const r=rig();
  const inputs=[false,true,true,false,true,false];
  assert.equal(r.run('SEGMENT14_CODES[22]'),'L');
  assert.deepEqual(r.json(`evaluate('converter14',${JSON.stringify(inputs)},{})`).flatMap((on,i)=>on?[i]:[]),[3,4,5]);
  r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='fourteen-segment-test'));for(let i=0;i<6;i++)nodeBy('bit'+i).on=[false,true,true,false,true,false][i];simulate(false)");
  assert.deepEqual(r.json("values.get('display').in").flatMap((on,i)=>on?[i]:[]),[3,4,5]);
});
test('in-game 14-segment input B+D displays slashed zero',()=>{
  const r=rig();
  const inputs=[false,true,false,true,false,false];
  assert.equal(r.run('SEGMENT14_CODES[10]'),'0');
  assert.deepEqual(r.json(`evaluate('converter14',${JSON.stringify(inputs)},{})`).flatMap((on,i)=>on?[i]:[]),[0,1,2,3,4,5,9,10]);
  r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='fourteen-segment-test'));for(let i=0;i<6;i++)nodeBy('bit'+i).on=[false,true,false,true,false,false][i];simulate(false)");
  assert.deepEqual(r.json("values.get('display').in").flatMap((on,i)=>on?[i]:[]),[0,1,2,3,4,5,9,10]);
});
test('in-game 14-segment input A+C+D+F displays dollar sign with both center strokes',()=>{
  const r=rig();
  const inputs=[true,false,true,true,false,true];
  assert.equal(r.run('SEGMENT14_CODES[45]'),'$');
  assert.deepEqual(r.json(`evaluate('converter14',${JSON.stringify(inputs)},{})`).flatMap((on,i)=>on?[i]:[]),[0,2,3,5,6,7,12,13]);
  r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='fourteen-segment-test'));for(let i=0;i<6;i++)nodeBy('bit'+i).on=[true,false,true,true,false,true][i];simulate(false)");
  assert.deepEqual(r.json("values.get('display').in").flatMap((on,i)=>on?[i]:[]),[0,2,3,5,6,7,12,13]);
});
test('in-game 14-segment input A+B+D+F displays five-stroke question mark',()=>{
  const r=rig();
  const inputs=[true,true,false,true,false,true];
  assert.equal(r.run('SEGMENT14_CODES[43]'),'?');
  assert.deepEqual(r.json(`evaluate('converter14',${JSON.stringify(inputs)},{})`).flatMap((on,i)=>on?[i]:[]),[0,1,5,7,13]);
  r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='fourteen-segment-test'));for(let i=0;i<6;i++)nodeBy('bit'+i).on=[true,true,false,true,false,true][i];simulate(false)");
  assert.deepEqual(r.json("values.get('display').in").flatMap((on,i)=>on?[i]:[]),[0,1,5,7,13]);
});
test('fourteen-segment display stacks on its converter at every rotation',()=>{
  const r=rig();
  for(const rotation of [0,90,180,270]){
    r.run(`model={name:'rotated pair',nodes:[designNode('c','converter14',192,192,{rotation:${rotation}}),designNode('d','display14',192,192,{rotation:${rotation}})],wires:[]}`);
    assert.equal(r.run('model.nodes.every(n=>canPlace(n,model.nodes,n.x,n.y))'),true,`valid stack ${rotation}`);
    assert.equal(r.run('touchingPorts().length'),14,`contacts ${rotation}`);
    r.run('nodeBy(\'d\').x+=480');
    assert.equal(r.run('touchingPorts().length'),0,`lifted display disconnects ${rotation}`);
  }
});
test('fourteen-segment bodies touch on fourteen separate contacts and preserve the six-lever design',()=>{
  const r=rig();r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='fourteen-segment-test'));simulate(false)");
  assert.equal(r.run('valid(model)'),true);
  assert.equal(r.run('model.nodes.every(n=>canPlace(n,model.nodes,n.x,n.y))'),true);
  assert.equal(r.run('touchingPorts().length'),14);
  assert.deepEqual(r.json("[0,1,2,3,4,5].map(i=>localPort(nodeBy('converter'),'in',i))"),[0,1,2,3,4,5].map(i=>({x:0,y:16+i*32})));
  for(const code of [0,1,2,4,8,16,32]){
    r.run(`for(let i=0;i<6;i++)nodeBy('bit'+i).on=!!(${code}&(1<<i));simulate(false)`);
    assert.deepEqual(r.json("values.get('display').in"),r.json("values.get('converter').out"),`direct contacts for ${code}`);
  }
  r.run('model=normalize(JSON.parse(JSON.stringify(model)));simulate(false)');
  assert.equal(r.run('touchingPorts().length'),14,'save/load preserves contacts');
  assert.equal(r.run("valid({name:'copy',...designCopy(model)})"),true,'editable design copies safely');
});
test('wiki 7 and 3 fixture drives every segment independently and switches back to 00',()=>{
  const r=rig();r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='wiki-seven-73'));nodeBy('source').on=true;simulate(false);");
  assert.equal(r.json("values.get('seven').in").map(Number).join(''),'1110000');
  assert.equal(r.json("values.get('three').in").map(Number).join(''),'1111001');
  r.run("nodeBy('source').on=false;simulate(false);");
  for(const id of ['seven','three'])assert.equal(r.json(`values.get('${id}').in`).map(Number).join(''),'1111110');
});

test('display rear inputs independently light all 128 segment combinations without a converter',()=>{
  const r=rig();
  r.run(`model={name:'Direct segment inputs',nodes:[designNode('display','display7',576,0),...Array.from({length:7},(_,i)=>designNode('source'+i,'lever',i*48,288))],wires:[]};
    for(let i=0;i<7;i++)model.wires.push(designWire('segment'+i,{node:'source'+i,side:'out',index:0},{node:'display',side:'in',index:i}));`);
  for(let mask=127;mask>=0;mask--){
    r.run(`for(let i=0;i<7;i++)nodeBy('source'+i).on=!!(${mask}&(1<<i));simulate(false);`);
    assert.deepEqual(r.json("values.get('display').in"),Array.from({length:7},(_,i)=>!!(mask&(1<<i))),`independent segments ${mask}`);
    assert.deepEqual(r.json("values.get('display').out"),[],'display has no driven outputs');
  }
});
test('full wiki arithmetic adaptation propagates 10 + 4 to displayed 14 with no artificial tick delay',()=>{
  const r=rig();r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='wiki-adder-14'));nodeBy('source').on=true;simulate(false);");
  assert.deepEqual(r.json("values.get('adder').out"),[true,true,true,false,false]);
  assert.equal(r.json("values.get('bcd').out").map(Number).join(''),'00010100');
  assert.equal(r.json("values.get('tenDisplay').in").map(Number).join(''),'0110000');
  assert.equal(r.json("values.get('unitDisplay').in").map(Number).join(''),'0110011');
  assert.equal(r.run('simulationMs'),0);
  r.run("nodeBy('source').on=false;simulate(false);");
  assert.equal(r.json("values.get('unitDisplay').in").map(Number).join(''),'1111110');
});
test('new fixtures are non-overlapping, serialize without moving parts, and copy with remapped endpoints',()=>{
  const r=rig();
  for(const id of ['wiki-seven-73','wiki-adder-14']){
    r.run(`model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'));nodeBy('source').on=true;simulate(false);`);
    const before=r.json('model');
    assert.equal(r.run('model.nodes.every(n=>canPlace(n,model.nodes,n.x,n.y))'),true);
    r.run('model=normalize(JSON.parse(JSON.stringify(model)));resetTiming();simulate(false);');
    assert.deepEqual(r.json('model.nodes'),before.nodes);
    assert.equal(r.run('valid(model)'),true);
    const copy=r.json('designCopy(model)');
    assert.equal(copy.nodes.length,before.nodes.length);assert.equal(copy.wires.length,before.wires.length);
    assert.equal(copy.nodes.some(n=>before.nodes.some(old=>old.id===n.id)),false);
  }
});
test('centered arithmetic pin banks respect different bar widths and rotation bounds',()=>{
  const r=rig();
  r.run("model={nodes:[designNode('adder','fullAdder',0,96),designNode('bcd','binaryBCD',0,0)],wires:[]};");
  assert.equal(r.run('touchingPorts().length'),0,'different-width centered banks need connecting wires');
  assert.deepEqual(r.json("[0,1,2,3].map(i=>localPort(nodeBy('adder'),'out',i).x)"),[144,192,240,288]);
  assert.deepEqual(r.json("[0,1,2,3].map(i=>localPort(nodeBy('bcd'),'in',i).x)"),[120,168,216,264]);
  for(const type of ['fullAdder','binaryBCD','converter7','display7'])for(const rotation of [0,90,180,270]){
    r.run(`probe={id:'p',type:'${type}',rotation:${rotation},x:96,y:144};`);
    assert.equal(r.run("['in','out'].every(side=>PARTS[probe.type][side==='in'?'inputs':'outputs'].every((_,i)=>{const p=portPosition(probe,side,i),f=footprint(probe);return p.x>=probe.x-.01&&p.y>=probe.y-.01&&p.x<=probe.x+f.w+.01&&p.y<=probe.y+f.h+.01;}))"),true);
  }
});

test('user-measured arithmetic bars use 9 by 2 and 8 by 2 cells in every rotation',()=>{
  const r=rig();
  for(const [type,w] of [['fullAdder',432],['binaryBCD',384]])for(const rotation of [0,90,180,270]){
    assert.deepEqual(r.json(`footprint({type:'${type}',rotation:${rotation}})`),rotation%180?{w:96,h:w}:{w,h:96});
  }
  assert.deepEqual(r.json("localPort({type:'fullAdder'},'in',8)"),{x:0,y:48});
  assert.deepEqual(r.json("localPort({type:'fullAdder'},'out',4)"),{x:432,y:48});
});

test('arithmetic resize keeps a one-time original browser save and tolerates full storage',()=>{
  const r=rig();
  r.run(`saved=new Map([['project','{"nodes":[{"type":"fullAdder"}]}']]);localStorage.getItem=k=>saved.get(k)??null;localStorage.setItem=(k,v)=>saved.set(k,v);backupArithmeticLayout('project');`);
  const original=r.run("saved.get('project-before-arithmetic-depth-v2')");
  r.run(`saved.set('project','{"nodes":[{"type":"binaryBCD"}]}');backupArithmeticLayout('project');`);
  assert.equal(r.run("saved.get('project-before-arithmetic-depth-v2')"),original);
  r.run("localStorage.setItem=()=>{throw Error('quota')};backupArithmeticLayout('project');");
  assert.equal(r.run("saved.get('project')"),'{"nodes":[{"type":"binaryBCD"}]}');
});

test('stacked display connects seven separate signals at every rotation, with no wires',()=>{
  const r=rig();
  for(const rotation of [0,90,180,270]){
    r.run(`model={name:'stack',nodes:[designNode('c','converter7',192,192,{rotation:${rotation}}),designNode('d','display7',192,192,{rotation:${rotation}})],wires:[]};`);
    assert.equal(r.run("canPlace(nodeBy('d'),model.nodes,192,192)"),true);
    assert.equal(r.run('touchingPorts().length'),7);
    assert.equal(r.run("canPlace({...nodeBy('d'),id:'duplicate'},model.nodes,192,192)"),false);
    assert.equal(r.run("canPlace(nodeBy('d'),model.nodes,240,192)"),false);
    r.run('simulate(false)');
    assert.equal(r.json("values.get('d').in").map(Number).join(''),'1111110');
    r.run("model=normalize(JSON.parse(JSON.stringify(model)))");
    assert.equal(r.run('touchingPorts().length'),7,'save/load retains stack');
    r.run("nodeBy('d').x+=480;simulate(false)");
    assert.equal(r.json("values.get('d').in").some(Boolean),false,'lifting disconnects display');
  }
});

test('stacked built-in accepts A to D along the bottom and preserves all bit combinations',()=>{
  const r=rig();r.run("model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='stacked-seven'))");
  assert.equal(r.run('model.nodes.every(n=>canPlace(n,model.nodes,n.x,n.y))'),true);
  for(let bit=0;bit<4;bit++)assert.deepEqual(r.json(`localPort(nodeBy('converter'),'in',${3-bit})`),{x:12+24*bit,y:192});
  for(let n=0;n<16;n++){
    r.run(`for(let i=0;i<4;i++)nodeBy('bit'+i).on=!!(${n}&(1<<i));simulate(false)`);
    assert.deepEqual(r.json("values.get('display').in"),r.json(`evaluate('converter7',writeBits(${n}),{})`));
  }
  r.run('model=designCopy(model);model.name="copy";model=normalize(model);simulate(false)');
  assert.equal(r.run('touchingPorts().length'),7,'copy retains automatic contacts');
});
