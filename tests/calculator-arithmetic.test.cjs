const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
const {out,addWords,subtractMagnitude,multiplyStep,binaryToBcd}=require('../scripts/calculator-arithmetic.cjs');
const context=loadApp(),evaluate=vm.runInContext('evaluate',context);
const allowed=new Set(['lever','fullAdder','add3','and','xor','inverter']);

// Combinational helper tests evaluate the actual linked ordinary-part graph
// using the application's part truth functions. Physical routing, capture, and
// UI interaction are intentionally tested by the complete calculator tests.
function graph(){
  const nodes=[],edges=[],inputs=new Map();
  const api={node(type,label){const id=`n${nodes.length}`;assert.ok(allowed.has(type),type);nodes.push({id,type,label});return id;},link(from,to){edges.push({from,to});}};
  const bank=(name,count)=>Array.from({length:count},(_,i)=>out(api.node('lever',`${name}${i}`)));
  const set=(bank,value)=>bank.forEach((source,i)=>inputs.set(source.node,!!(value&2**i)));
  function run(){
    const values=new Map(),sources=new Map();
    for(const edge of edges){if(!sources.has(edge.to.node))sources.set(edge.to.node,[]);sources.get(edge.to.node).push(edge);}
    for(const node of nodes){
      if(node.type==='lever'){values.set(node.id,[!!inputs.get(node.id)]);continue;}
      const count=node.type==='fullAdder'?9:node.type==='add3'?4:node.type==='inverter'?1:2;
      const signals=Array(count).fill(false);
      for(const edge of sources.get(node.id)||[]){
        assert.ok(values.has(edge.from.node),'graph must be feed-forward');
        signals[edge.to.index]||=!!values.get(edge.from.node)[edge.from.index];
      }
      values.set(node.id,evaluate(node.type,signals,node));
    }
    const read=bits=>bits.reduce((n,source,i)=>n+(source&&values.get(source.node)[source.index]?2**i:0),0);
    return {read,on:source=>!!(source&&values.get(source.node)[source.index])};
  }
  return {api,nodes,edges,bank,set,run};
}
function pairs(){
  const examples=[[0,0],[0,9999],[9999,0],[1,1],[15,1],[7,8],[99,100],[100,99],[1234,5678],[9999,9999]];
  let seed=674;
  for(let i=0;i<90;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const a=seed%10000;seed=(Math.imul(seed,1664525)+1013904223)>>>0;examples.push([a,seed%10000]);}
  return examples;
}
test('calculator adder graph propagates all four-bit carries and the final carry',()=>{
  const g=graph(),a=g.bank('A',16),b=g.bank('B',16),sum=addWords(g.api,a,b,{width:16});
  for(const [x,y] of [...pairs(),[65535,1],[65535,65535],[4095,1]]){
    g.set(a,x);g.set(b,y);const r=g.run();assert.equal(r.read(sum.bits)+(r.on(sum.carry)?65536:0),x+y,`${x}+${y}`);
  }
});
test('calculator subtraction graph produces absolute digits and a separate truthful sign',()=>{
  const g=graph(),a=g.bank('A',14),b=g.bank('B',14),result=subtractMagnitude(g.api,a,b,{width:16});
  for(const [x,y] of pairs()){
    g.set(a,x);g.set(b,y);const r=g.run();assert.equal(r.read(result.bits),Math.abs(x-y),`${x}-${y}`);assert.equal(r.on(result.negative),x<y,`${x}-${y} sign`);
  }
});
test('calculator iterative multiplier uses fourteen real add-and-shift passes',()=>{
  const g=graph(),state=g.bank('STATE',28),a=g.bank('A',14),next=multiplyStep(g.api,state,a);
  assert.equal(next.length,28);
  for(const [x,y] of pairs()){
    g.set(a,x);let combined=y;
    for(let step=0;step<14;step++){g.set(state,combined);combined=g.run().read(next);}
    assert.equal(combined,x*y,`${x} × ${y}`);
  }
});
test('calculator eight-digit double-dabble graph displays the full multiplication range',()=>{
  const g=graph(),binary=g.bank('BINARY',28),digits=binaryToBcd(g.api,binary,{digits:8});
  assert.equal(digits.length,8);
  const samples=[0,1,9,10,99,100,9999,19998,10000,99980001,99999999,...pairs().map(([a,b])=>a*b)];
  for(const value of samples){
    g.set(binary,value);const r=g.run(),actual=digits.map(digit=>r.read(digit));
    assert.ok(actual.every(digit=>digit<10),`valid BCD for ${value}`);
    assert.equal(actual.reduce((n,digit,i)=>n+digit*10**i,0),value,`decimal ${value}`);
  }
});
test('calculator arithmetic never bypasses a disconnected input wire',()=>{
  const g=graph(),a=g.bank('A',4),b=g.bank('B',4),sum=addWords(g.api,a,b);
  g.set(a,1);g.set(b,0);assert.equal(g.run().read(sum.bits),1);
  const wire=g.edges.findIndex(edge=>edge.from.node===a[0].node);assert.notEqual(wire,-1);g.edges.splice(wire,1);
  assert.equal(g.run().read(sum.bits),0);
});
