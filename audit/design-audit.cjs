// Read-only audit of built-in circuits. Production state is changed only in VM copies.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {buildPong}=require('../scripts/build-pong.cjs');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
vm.runInContext(source+`;renderSelection=()=>{};paintTimingFaces=()=>{};save=()=>{};globalThis.audit={
 designs:BUILT_IN_DESIGNS,load(d){model=structuredClone(d);resetTiming();simulate(false)},get model(){return model},get values(){return values},
 nodeBy,simulate,pressButton,wireNetworks,wireEnds,footprint,normalize,portPosition,networkSignals,
 getNetwork(){return networkSignals(new Map(model.nodes.map(n=>[n.id,values.get(n.id).out])))},
 output(id,index=0){return !!values.get(id)?.out[index]}
};`,ctx);
const api=ctx.audit;
const load=id=>api.load(api.designs.find(d=>d.id===id));
const edgeKey=(a,b)=>`${a.node}:${a.index}->${b.node}:${b.index}`;
function graphSummary(id){
 load(id);const net=api.wireNetworks(),expected=new Set(),actual=new Set();
 if(id==='pong-solo')for(const e of buildPong().edges)expected.add(edgeKey(e.from,e.to));
 else for(const w of api.model.wires)if(w.from.node&&w.to.node)expected.add(edgeKey(w.from,w.to));
 for(const [key,outs] of net.outputs)for(const a of outs)for(const b of net.inputs.get(key))actual.add(edgeKey(a,b));
 const extra=[...actual].filter(e=>!expected.has(e)),missing=[...expected].filter(e=>!actual.has(e));
 const shorts=[...net.outputs].filter(([key,outs])=>outs.length>1).map(([key,outs])=>outs.map(p=>p.node+':'+p.index));
 const badBoards=[];
 for(let i=0;i<api.model.nodes.length;i++)for(let j=i+1;j<api.model.nodes.length;j++){
  const a=api.model.nodes[i],b=api.model.nodes[j],af=api.footprint(a),bf=api.footprint(b);
  if(a.x<b.x+bf.w&&a.x+af.w>b.x&&a.y<b.y+bf.h&&a.y+af.h>b.y&&!(a.x===b.x&&a.y===b.y&&a.type.startsWith('converter')&&b.type.startsWith('display')))badBoards.push([a.id,b.id]);
 }
 return {id,nodes:api.model.nodes.length,wires:api.model.wires.length,expected:expected.size,actual:actual.size,extra,missing,shorts,contacts:net.contacts.length,badBoards};
}
function scrub(design){
 const d=structuredClone(design),ids=new Map(d.nodes.map((n,i)=>[n.id,'n'+i]));
 for(const n of d.nodes){n.id=ids.get(n.id);delete n.arcade;delete n.label;delete n.panel;}
 for(const [i,w] of d.wires.entries()){w.id='w'+i;delete w.arcade;for(const end of [w.from,w.to])if(end.node)end.node=ids.get(end.node);}
 return {d,ids};
}
function pongTrace(scrubbed=false,cut=null){
 let d=api.designs.find(d=>d.id==='pong-solo'),ids=new Map(d.nodes.map(n=>[n.id,n.id]));
 if(scrubbed)({d,ids}=scrub(d));
 d=structuredClone(d);
 if(cut)d.wires=d.wires.filter(w=>w.from.node!==ids.get(cut));
 api.load(d);const n=id=>api.nodeBy(ids.get(id));n('run').on=true;api.simulate(false);const frames=[];
 for(let i=0;i<100;i++){
  if(n('ball-y').channel===4){const phase=n('ball-x').channel,x=phase<=4?phase:8-phase;api.pressButton(n(x<2?'left':x>2?'right':'center'));}
  api.simulate(true,400);frames.push([n('ball-x').channel,n('ball-y').channel,n('score').channel,n('lost').bit]);
 }
 return frames;
}
function outputLights(){const net=api.getNetwork();return api.model.wires.filter(w=>w.style==='neon').map(w=>({id:w.id,from:w.from,on:!!net.powered.get(net.byWire.get(w.id))}));}
function faults(){
 const results=[];
 load('counter-0-15');api.model.wires=api.model.wires.filter(w=>w.to.node!=='counter');api.pressButton(api.nodeBy('count'));api.simulate(true,1000);results.push({cut:'counter input',count:api.nodeBy('counter').channel});
 load('traffic-light-controller');api.model.wires=api.model.wires.filter(w=>w.to.node!=='selector');api.simulate(true,10000);results.push({cut:'traffic selector input',phase:api.nodeBy('selector').channel,lights:outputLights()});
 load('calculator-0-0');api.nodeBy('a0').on=true;api.model.wires=api.model.wires.filter(w=>w.from.node!=='p0');api.simulate(false);results.push({cut:'4-bit p0 outputs',sum0:api.output('s0'),mismatch0:api.output('check0'),lights:outputLights()});
 for(const cut of ['clock','advance-ball-y','hit','pixel-0-0']){const trace=pongTrace(false,cut);results.push({cut:'Pong '+cut,final:trace.at(-1),scores:[...new Set(trace.map(f=>f[2]))],y:[...new Set(trace.map(f=>f[1]))]});}
 return results;
}
function adderSweep(count=2048){
 load('eight-bit-adder-bench');let seed=49275,bad=[];
 for(let i=0;i<count;i++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const a=(seed>>>8)&255;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;const b=(seed>>>8)&255;
  for(let bit=0;bit<8;bit++){const p=bit<4?'low-':'high-',j=bit%4;api.nodeBy(p+'a'+j).on=!!(a&(1<<bit));api.nodeBy(p+'b'+j).on=!!(b&(1<<bit));}
  api.simulate(false);let observed=0;for(let bit=0;bit<8;bit++)if(api.output((bit<4?'low-':'high-')+'s'+bit%4))observed+=1<<bit;if(api.output('high-c3'))observed+=256;
  if(observed!==a+b||api.model.nodes.some(n=>/^(low|high)-check/.test(n.id)&&api.output(n.id)))bad.push({a,b,observed});
 }
 return {samples:count,bad};
}
if(require.main===module){
 console.log(JSON.stringify({graphs:['counter-0-15','calculator-0-0','eight-bit-adder-bench','traffic-light-controller','pong-solo'].map(graphSummary)},null,2));
 console.log('Pong metadata-independent:',JSON.stringify(pongTrace())===JSON.stringify(pongTrace(true)));
 console.log(JSON.stringify({faults:faults(),adder:adderSweep()},null,2));
}
module.exports={api,ctx,load,graphSummary,scrub,pongTrace,outputLights};
