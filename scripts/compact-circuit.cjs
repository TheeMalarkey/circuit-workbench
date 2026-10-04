// Compress unused layout strips without rerouting wires or moving sockets within boards.
// Developer tool: node scripts/compact-circuit.cjs decimal-keypad-4 [output.json]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function compactCircuit(design,footprint){
  const copy=structuredClone(design),grid=48,lane=12;
  const points=[...new Set(copy.wires.flatMap(w=>[w.from,...w.points,w.to].filter(p=>!p.node)))];
  const axisMap=axis=>{
    const size=axis==='x'?'w':'h';
    const protectedSpans=copy.nodes.map(n=>[n[axis]-12,n[axis]+footprint(n)[size]+12]);
    const cuts=[...new Set([...protectedSpans.flat(),...points.map(p=>p[axis])])].sort((a,b)=>a-b);
    let removed=0;const shifts=[];
    for(let i=0;i<cuts.length;i++){
      if(i){const a=cuts[i-1],b=cuts[i];
        if(!protectedSpans.some(([lo,hi])=>lo<b&&hi>a))removed+=Math.max(0,Math.floor((b-a-lane)/grid)*grid);
      }
      shifts.push(removed);
    }
    return value=>{let lo=0,hi=cuts.length;while(lo<hi){const mid=(lo+hi)>>1;if(cuts[mid]<=value)lo=mid+1;else hi=mid;}return value-(shifts[Math.max(0,lo-1)]||0);};
  };
  const x=axisMap('x'),y=axisMap('y');
  for(const n of copy.nodes){n.x=x(n.x);n.y=y(n.y);}
  for(const p of points){p.x=x(p.x);p.y=y(p.y);}
  return copy;
}
function bounds(design,footprint){
  const points=design.nodes.flatMap(n=>{const f=footprint(n);return [{x:n.x,y:n.y},{x:n.x+f.w,y:n.y+f.h}];})
    .concat(design.wires.flatMap(w=>[w.from,...w.points,w.to].filter(p=>!p.node)));
  const width=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x));
  const height=Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y));
  return {width,height,area:width*height};
}
function loadApp(){
  const ctx=vm.createContext({structuredClone,document:{getElementById:()=>({})},localStorage:{getItem:()=>null},crypto:require('node:crypto').webcrypto});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0],ctx);
  return ctx;
}
if(require.main===module){
  const ctx=loadApp(),id=process.argv[2]||'decimal-keypad-4';ctx.designId=id;
  const original=vm.runInContext('BUILT_IN_DESIGNS.find(d=>d.id===designId)',ctx);
  if(!original)throw Error('Unknown built-in circuit: '+id);
  const footprint=vm.runInContext('footprint',ctx),result=compactCircuit(original,footprint);
  const before=bounds(original,footprint),after=bounds(result,footprint);
  console.log(JSON.stringify({id,before,after,areaReductionPercent:+((1-after.area/before.area)*100).toFixed(1)},null,2));
  if(process.argv[3])fs.writeFileSync(path.resolve(process.argv[3]),JSON.stringify(result,null,2));
}
module.exports={compactCircuit,bounds,loadApp};
