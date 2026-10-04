const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
function rig(digits){
  const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(source+`;renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};model=structuredClone(BUILT_IN_DESIGNS.find(d=>d.id==='decimal-keypad-${digits}'));simulate(false);`,ctx);
  return code=>vm.runInContext(code,ctx);
}
function shownDigit(run,place){
  const segments=run(`values.get('digit${place}-display').in.map(Number).join('')`);
  return run(`SEGMENT_DIGITS.findIndex(glyph=>[...SEGMENT_NAMES].map(s=>Number(glyph.includes(s))).join('')==='${segments}')`);
}
function verify(run,digits,number){
  for(let place=0;place<digits;place++)assert.equal(shownDigit(run,place),Math.floor(number/10**place)%10,`decimal place ${place}`);
  let binary=0;
  for(let bit=0;bit<Math.ceil(Math.log2(10**digits));bit++){
    const on=!!run(`values.get('binary-${bit}').out[0]`);
    const wire=run(`model.wires.find(w=>w.from.node==='binary-${bit}'&&w.style==='neon').id`);
    assert.equal(!!run(`wirePowerDetails('${wire}').powered`),on,`binary wire ${bit} follows its circuit`);
    if(on)binary+=2**bit;
  }
  assert.equal(binary,number,'live binary outputs match the decimal displays');
}
function enter(run,digit){run(`pressButton(nodeBy('key${digit}'));simulate(true,400);`);}

test('four keypad designs are public, editable, and use routed circuit wires',()=>{
  const run=rig(1);
  assert.equal(run('DECIMAL_KEYPAD_DESIGNS.length'),4);
  for(let digits=1;digits<=4;digits++){
    const id=`decimal-keypad-${digits}`;
    assert.equal(run(`valid(BUILT_IN_DESIGNS.find(d=>d.id==='${id}'))`),true,id);
    assert.equal(run(`EXPLORER_DESIGNS.some(d=>d.id==='${id}')`),true,id);
    assert.equal(run(`(()=>{const raw=decimalKeypadDesign(${digits},false);return PRESET_ROUTES['${id}'].signature===routeSignature(raw.nodes,raw.wires);})()`),true,id);
    assert.equal(run(`BUILT_IN_DESIGNS.find(d=>d.id==='${id}').nodes.filter(n=>n.type==='button').length`),10,id);
    assert.equal(run(`BUILT_IN_DESIGNS.find(d=>d.id==='${id}').nodes.filter(n=>n.type==='display7').length`),digits,id);
  }
});

test('all keypad routes stay orthogonal and outside circuit interiors',()=>{
  const run=rig(1);
  assert.equal(run(`DECIMAL_KEYPAD_DESIGNS.every(d=>{
    model=d;
    return d.nodes.every((n,i)=>d.nodes.slice(i+1).every(other=>canPlace(n,[other],n.x,n.y)))&&
      d.wires.every(w=>{const path=wireEnds(w);return path.slice(1).every((b,i)=>{
        const a=path[i];if(a.x!==b.x&&a.y!==b.y)return false;
        return d.nodes.every(n=>{const f=footprint(n);return !(a.x===b.x?
          a.x>n.x&&a.x<n.x+f.w&&Math.max(a.y,b.y)>n.y&&Math.min(a.y,b.y)<n.y+f.h:
          a.y>n.y&&a.y<n.y+f.h&&Math.max(a.x,b.x)>n.x&&Math.min(a.x,b.x)<n.x+f.w);});
      });});
  })`),true);
});

test('each of the ten keypad buttons encodes its own digit, including zero',()=>{
  const run=rig(1);
  for(let digit=0;digit<=9;digit++){enter(run,digit);verify(run,1,digit);}
});

for(let digits=1;digits<=4;digits++)test(`${digits}-digit keypad shifts decimal entries and exposes the actual binary number`,()=>{
  const run=rig(digits);
  let number=0;verify(run,digits,number);
  for(const digit of [1,2,3,4,9,0]){
    enter(run,digit);number=(number*10+digit)%(10**digits);
    verify(run,digits,number);
  }
  for(let i=0;i<digits;i++){enter(run,0);number=number*10%(10**digits);verify(run,digits,number);}
  assert.equal(number,0,'repeated zero entries clear the register');
});

test('four digits can reach 9999 without overflow or a disconnected high bit',()=>{
  const run=rig(4);
  for(const digit of [9,9,9,9])enter(run,digit);
  verify(run,4,9999);
  assert.equal(run('values.get("binary-13").out[0]'),true,'8192 bit is live');
});

test('keypad designs copy beside a player circuit without mutating it',()=>{
  const run=rig(1);
  assert.equal(run(`DECIMAL_KEYPAD_DESIGNS.every(d=>{
    const player={name:'Player project',nodes:[designNode('player','lever',0,0)],wires:[]};
    const copy=designCopy(d,player);
    return player.nodes.length===1&&player.nodes[0].id==='player'&&copy.nodes.length===d.nodes.length&&
      copy.wires.length===d.wires.length&&valid({name:d.name,nodes:[...player.nodes,...copy.nodes],wires:copy.wires});
  })`),true);
});
