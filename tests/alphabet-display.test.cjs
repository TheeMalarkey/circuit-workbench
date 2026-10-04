const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
function rig(){const ctx=loadApp();vm.runInContext(`renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};setStatus=()=>{};model=structuredClone(ALPHABET_DESIGN);simulate(false);`,ctx);return code=>vm.runInContext(code,ctx);}
function text(run){return run(`Array.from({length:4},(_,i)=>{const v=values.get('text-screen-'+(3-i)).in.map(Number).join('');return Object.entries(SEGMENT14_GLYPHS).find(([key,segments])=>/^[A-Z]$/.test(key)&&SEGMENT14_NAMES.map(s=>Number(segments.split(' ').includes(s))).join('')===v)?.[0]||' ';}).join('')`);}
function enter(run,key){run(`pressButton(model.nodes.find(n=>n.alphabet?.key===${JSON.stringify(key)}));simulate(true,400);`);}
test('alphabet keyboard is a public, ordinary wired four-character design',()=>{
 const run=rig();assert.equal(run('valid(ALPHABET_DESIGN)&&EXPLORER_DESIGNS.some(d=>d.id===ALPHABET_DESIGN.id)'),true);
 assert.equal(run("model.nodes.filter(n=>n.type==='display14').length"),4);assert.equal(run("model.nodes.filter(n=>n.type==='buffer4').length"),6);
 assert.equal(text(run),'    ');
 for(const c of 'HELLO'){enter(run,c);}assert.equal(text(run),'ELLO');
 for(const c of '    ')enter(run,c);assert.equal(text(run),'    ');
 for(const c of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'){enter(run,c);assert.equal(text(run).at(-1),c);}
});
test('rapid typed letters queue separate real button pulses, including repeats and spaces',()=>{
 const run=rig();run(`alphabetInputState().activeGroup='alphabet';for(const key of 'ABBA Z')handleAlphabetKey({key,preventDefault(){}});`);
 for(let i=0;i<130;i++)run('simulate(true,20)');assert.equal(text(run),'BA Z');
 assert.equal(run('alphabetInputState().queue.length'),0);
 run(`handleAlphabetKey({key:'Escape',preventDefault(){}});`);assert.equal(run(`handleAlphabetKey({key:'x',preventDefault(){}})`),false);
});
test('pausing queues input without shifting and disconnected displays cannot show hidden text',()=>{
 const run=rig();run(`running=false;pressButton(model.nodes.find(n=>n.alphabet?.key==='A'));simulate(false);`);assert.equal(text(run),'    ');
 run('running=true;simulate(true,20)');assert.equal(text(run),'   A');
 run(`model.wires=model.wires.filter(w=>w.to.node!=='text-code-0');simulate(false);`);assert.equal(text(run),'    ');
});
test('copied keyboards get independent input groups and source design stays untouched',()=>{
 const run=rig();assert.equal(run(`(()=>{const before=JSON.stringify(ALPHABET_DESIGN),a=designCopy(ALPHABET_DESIGN,{nodes:[],wires:[]}),b=designCopy(ALPHABET_DESIGN,{nodes:[],wires:[]});return a.nodes[0].alphabet.group!==b.nodes[0].alphabet.group&&JSON.stringify(ALPHABET_DESIGN)===before;})()`),true);
});
test('alphabet routes are orthogonal and avoid board interiors',()=>{
 const run=rig();assert.equal(run(`model.wires.every(w=>{const p=wireEnds(w);return p.slice(1).every((b,i)=>{const a=p[i];return(a.x===b.x||a.y===b.y)&&model.nodes.every(n=>{const f=footprint(n);return !segmentHitsRect(a,b,{x:n.x+.01,y:n.y+.01,w:f.w-.02,h:f.h-.02});});});})`),true);
});
