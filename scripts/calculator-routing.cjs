// Offline, deterministic shelf placement and channel routing for large generated
// circuits. No browser work, global dense grid, or changes to electrical sources.
// Physical endpoints remain the original ports. A shared electrical source may
// reuse its own trunk; unrelated signals may cross, but never share a track.
const EPS=0.001,LANE=12;
const snap=n=>Math.ceil(n/48)*48;
const near=(a,b)=>Math.abs(a.x-b.x)<EPS&&Math.abs(a.y-b.y)<EPS;
const lower=(a,v)=>{let l=0,h=a.length;while(l<h){const m=(l+h)>>1;if(a[m]<v)l=m+1;else h=m;}return l;};
function simplify(points){
 const result=[];
 for(const p of points){
  if(result.length&&near(result.at(-1),p))continue;
  while(result.length>1){const a=result.at(-2),b=result.at(-1);
   if(a.x===b.x&&b.x===p.x&&(b.y-a.y)*(p.y-b.y)>=0||a.y===b.y&&b.y===p.y&&(b.x-a.x)*(p.x-b.x)>=0)result.pop();else break;
  }
  result.push({x:p.x,y:p.y});
 }
 return result;
}
function worldPort(node,side,index,footprint,localPort){
 const f=footprint(node),base=footprint({...node,rotation:0}),p=localPort(node,side,index);
 const angle=(node.rotation||0)*Math.PI/180,dx=p.x-base.w/2,dy=p.y-base.h/2;
 return {x:Math.round((node.x+f.w/2+dx*Math.cos(angle)-dy*Math.sin(angle))*1000)/1000,
  y:Math.round((node.y+f.h/2+dx*Math.sin(angle)+dy*Math.cos(angle))*1000)/1000};
}
function placeSections(nodes,edges,groups,footprint,options){
 const fixed=nodes.filter(n=>n._fixed),backend=nodes.filter(n=>!n._fixed);
 const names=Array.isArray(groups)?groups.map(g=>typeof g==='string'?g:g.name):[];
 for(const n of backend)if(!names.includes(n._section||'logic'))names.push(n._section||'logic');
 const sections=[],shelfWidth=options.sectionWidth||2160,pad=options.padding||96;
 const degree=new Map(),adjacent=new Map(nodes.map(n=>[n.id,new Set()]));
 for(const e of edges)if(e.from.node){const key=`${e.from.node}:${e.from.index}`;degree.set(key,(degree.get(key)||0)+1);}
 for(const e of edges)if(e.from.node&&e.to.node&&(degree.get(`${e.from.node}:${e.from.index}`)||0)<=8){adjacent.get(e.from.node).add(e.to.node);adjacent.get(e.to.node).add(e.from.node);}
 for(const name of names){
  const original=backend.filter(n=>(n._section||'logic')===name);if(!original.length)continue;
  const remaining=new Map(original.map(n=>[n.id,n])),members=[];
  // Bandwidth-reducing traversal groups data paths rather than creation order.
  // In particular a memory bit stays near its own write gates; ubiquitous
  // clocks are ignored so they do not pull every bit into one giant star.
  const localDegree=id=>[...adjacent.get(id)].filter(k=>remaining.has(k)).length;
  while(remaining.size){const start=[...remaining.keys()].sort((a,b)=>localDegree(a)-localDegree(b))[0],queue=[start];
   remaining.delete(start);members.push(original.find(n=>n.id===start));
   for(let q=0;q<queue.length;q++)for(const id of [...adjacent.get(queue[q])].filter(id=>remaining.has(id)).sort((a,b)=>localDegree(a)-localDegree(b))){const node=remaining.get(id);remaining.delete(id);members.push(node);queue.push(id);}
  }
  let x=pad,y=pad,rowH=0,maxX=0;
  for(const n of members){const f=footprint(n);
   if(x>pad&&x+f.w+pad>shelfWidth){x=pad;y+=snap(rowH+pad*2);rowH=0;}
   n.x=x;n.y=y;x+=snap(f.w+pad*2);rowH=Math.max(rowH,f.h);maxX=Math.max(maxX,x);
  }
  sections.push({name,members,w:snap(Math.max(maxX,shelfWidth)),h:snap(y+rowH+pad),});
 }
 const columns=options.columns||3,gap=options.sectionGap||576;
 const columnWidth=Math.max(shelfWidth,...sections.map(s=>s.w))+gap;
 const frontRight=Math.max(0,...fixed.map(n=>n.x+footprint(n).w));
 const startX=snap(frontRight+gap),heights=Array(columns).fill(0);
 for(const s of sections){const c=heights.indexOf(Math.min(...heights)),x=startX+c*columnWidth,y=heights[c];
  for(const n of s.members){n.x+=x;n.y+=y;}
  s.x=x;s.y=y;heights[c]+=s.h+gap;
 }
 return sections.map(({members,...s})=>({...s,count:members.length}));
}
class Heap{
 constructor(){this.a=[];}
 push(v){const a=this.a;a.push(v);let i=a.length-1;while(i){const p=(i-1)>>1;if(a[p].f<=v.f)break;a[i]=a[p];i=p;}a[i]=v;}
 pop(){const a=this.a,result=a[0],v=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let c=i*2+1;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=v.f)break;a[i]=a[c];i=c;}a[i]=v;}return result;}
}
function layoutAndRoute(nodes,edges,groups,footprint,localPort,options={}){
 if(typeof footprint!=='function'||typeof localPort!=='function')throw Error('Routing requires footprint and localPort callbacks');
 const started=Date.now(),sections=placeSections(nodes,edges,groups,footprint,options),byId=new Map(nodes.map(n=>[n.id,n]));
 const endpoint=e=>e.node?worldPort(byId.get(e.node),e.side||'out',e.index||0,footprint,localPort):{x:e.x,y:e.y};
 const endKey=e=>e.node?`${e.node}:${e.side||'out'}:${e.index||0}`:`${e.x}:${e.y}`;
 const parents=edges.map((_,i)=>i),root=i=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;},contacts=new Map();
 edges.forEach((e,i)=>{for(const p of [e.from,e.to]){const k=endKey(p);if(contacts.has(k))parents[root(i)]=root(contacts.get(k));else contacts.set(k,i);}});
 // Coincident sockets (display + converter) intentionally form one net, too.
 const physical=new Map();edges.forEach((e,i)=>{for(const p of [e.from,e.to]){const q=endpoint(p),k=`${q.x}:${q.y}`;if(physical.has(k))parents[root(i)]=root(physical.get(k));else physical.set(k,i);}});
 const net=edges.map((_,i)=>root(i)),boxes=[];
 for(const n of nodes){const f=footprint(n);if(!boxes.some(b=>b.x===n.x&&b.y===n.y&&b.w===f.w&&b.h===f.h))boxes.push({x:n.x,y:n.y,w:f.w,h:f.h});}
 const escape=48;
 const stub=e=>{const p=endpoint(e);if(!e.node)return p;const n=byId.get(e.node),f=footprint(n);
  const fit=q=>{for(const b of boxes){if(b.x===n.x&&b.y===n.y&&b.w===f.w&&b.h===f.h)continue;
    if(q.x===p.x&&p.x>b.x-LANE+EPS&&p.x<b.x+b.w+LANE-EPS){if(q.y>p.y&&b.y>=p.y)q.y=Math.min(q.y,b.y-LANE);if(q.y<p.y&&b.y+b.h<=p.y)q.y=Math.max(q.y,b.y+b.h+LANE);}
    if(q.y===p.y&&p.y>b.y-LANE+EPS&&p.y<b.y+b.h+LANE-EPS){if(q.x>p.x&&b.x>=p.x)q.x=Math.min(q.x,b.x-LANE);if(q.x<p.x&&b.x+b.w<=p.x)q.x=Math.max(q.x,b.x+b.w+LANE);}
   }return q;};
  if(Math.abs(p.x-n.x)<EPS)return fit({x:p.x-escape,y:p.y});
  if(Math.abs(p.x-n.x-f.w)<EPS)return fit({x:p.x+escape,y:p.y});
  if(Math.abs(p.y-n.y)<EPS)return fit({x:p.x,y:p.y-escape});
  if(Math.abs(p.y-n.y-f.h)<EPS)return fit({x:p.x,y:p.y+escape});
  // Display segment contacts sit on the face, not the rim. Only their own
  // contact lead may leave that face; the main channel still starts outside.
  const exits=[{distance:p.x-n.x,p:{x:n.x-escape,y:p.y}},{distance:n.x+f.w-p.x,p:{x:n.x+f.w+escape,y:p.y}},
   {distance:p.y-n.y,p:{x:p.x,y:n.y-escape}},{distance:n.y+f.h-p.y,p:{x:p.x,y:n.y+f.h+escape}}];
  return fit(exits.sort((a,b)=>a.distance-b.distance)[0].p);
 };
 const starts=edges.map(e=>stub(e.from)),ends=edges.map(e=>stub(e.to));
 const border=options.border||Math.max(192,Math.ceil(Math.sqrt(edges.length))*LANE);
 const minX=Math.min(...boxes.map(b=>b.x),...starts.map(p=>p.x),...ends.map(p=>p.x))-border;
 const maxX=Math.max(...boxes.map(b=>b.x+b.w),...starts.map(p=>p.x),...ends.map(p=>p.x))+border;
 const minY=Math.min(...boxes.map(b=>b.y),...starts.map(p=>p.y),...ends.map(p=>p.y))-border;
 const maxY=Math.max(...boxes.map(b=>b.y+b.h),...starts.map(p=>p.y),...ends.map(p=>p.y))+border;
 const axis=(lo,hi,key)=>{const set=new Set([...starts,...ends].map(p=>p[key]));for(let v=Math.floor(lo/LANE)*LANE;v<=hi;v+=LANE)set.add(v);return [...set].sort((a,b)=>a-b);};
 const xs=axis(minX,maxX,'x'),ys=axis(minY,maxY,'y'),xIndices=new Map(xs.map((v,i)=>[v,i])),yIndices=new Map(ys.map((v,i)=>[v,i]));
 const obstacleH=new Map(),obstacleV=new Map(),horizontal=new Map(),vertical=new Map(),turnsH=new Map(),turnsV=new Map();
 const add=(map,key,value)=>{if(!map.has(key))map.set(key,[]);map.get(key).push(value);};
 for(const b of boxes){
  for(let i=lower(ys,b.y-LANE+EPS);i<ys.length&&ys[i]<b.y+b.h+LANE-EPS;i++)add(obstacleH,ys[i],{lo:b.x-LANE,hi:b.x+b.w+LANE});
  for(let i=lower(xs,b.x-LANE+EPS);i<xs.length&&xs[i]<b.x+b.w+LANE-EPS;i++)add(obstacleV,xs[i],{lo:b.y-LANE,hi:b.y+b.h+LANE});
 }
 const reserve=(a,b,n,wire=null)=>{if(near(a,b))return;const h=a.y===b.y;add(h?horizontal:vertical,h?a.y:a.x,{lo:Math.min(h?a.x:a.y,h?b.x:b.y),hi:Math.max(h?a.x:a.y,h?b.x:b.y),net:n,wire});};
 // Reserve all short socket leads first so later routes cannot trap a port.
 edges.forEach((e,i)=>{reserve(endpoint(e.from),starts[i],net[i]);reserve(endpoint(e.to),ends[i],net[i]);
  for(const p of [starts[i],ends[i]]){add(turnsH,p.y,{at:p.x,net:net[i]});add(turnsV,p.x,{at:p.y,net:net[i]});}
 });
 const conflicts=(a,b,n)=>{
  const h=a.y===b.y,axis=h?a.y:a.x,lo=Math.min(h?a.x:a.y,h?b.x:b.y),hi=Math.max(h?a.x:a.y,h?b.x:b.y),occupied=h?horizontal:vertical,axes=h?ys:xs,result=[];
  for(let i=lower(axes,axis-LANE+EPS);i<axes.length&&axes[i]<axis+LANE-EPS;i++)for(const s of occupied.get(axes[i])||[])if(s.net!==n&&Math.min(hi,s.hi)-Math.max(lo,s.lo)>EPS)result.push(s);
  return result;
 };
 const segmentClear=(a,b,n,relaxed=false)=>{
  if(near(a,b))return true;const h=a.y===b.y;if(!h&&a.x!==b.x)return false;
  const axis=h?a.y:a.x,lo=Math.min(h?a.x:a.y,h?b.x:b.y),hi=Math.max(h?a.x:a.y,h?b.x:b.y);
  if((h?obstacleH:obstacleV).get(axis)?.some(s=>Math.min(hi,s.hi)-Math.max(lo,s.lo)>EPS))return false;
  if((h?turnsH:turnsV).get(axis)?.some(p=>p.net!==n&&p.at>=lo-EPS&&p.at<=hi+EPS))return false;
  if(conflicts(a,b,n).some(s=>!relaxed||s.wire===null))return false;
  return true;
 };
 const pathClear=(path,n)=>path.slice(1).every((p,i)=>segmentClear(path[i],p,n));
 const orderedAxis=(axes,a,b)=>{const center=(a+b)/2;return axes.slice().sort((x,y)=>Math.abs(x-center)-Math.abs(y-center));};
 let fallbackSearches=0,expanded=0,ripUps=0;const routeAttempts=new Map();
 const search=(a,b,n,relaxed=false)=>{
  fallbackSearches++;
  // Sparse searches grow around these two sockets. No whole-world rectangular
  // matrix is allocated; easy local wires never enter this fallback.
  for(const padding of [96,288,864,2592,Infinity]){
   const left=lower(xs,Math.min(a.x,b.x)-padding),right=Math.min(xs.length-1,lower(xs,Math.max(a.x,b.x)+padding));
   const top=lower(ys,Math.min(a.y,b.y)-padding),bottom=Math.min(ys.length-1,lower(ys,Math.max(a.y,b.y)+padding));
   const ax=xIndices.get(a.x),ay=yIndices.get(a.y),bx=xIndices.get(b.x),by=yIndices.get(b.y),heap=new Heap(),dist=new Map(),prev=new Map();
   const key=(x,y,d)=>(y*xs.length+x)*2+d,heuristic=(x,y)=>Math.abs(xs[x]-b.x)+Math.abs(ys[y]-b.y);
   for(let d=0;d<2;d++){const k=key(ax,ay,d);dist.set(k,0);heap.push({x:ax,y:ay,d,k,g:0,f:heuristic(ax,ay)});}
   let goal=null;
   while(heap.a.length){const q=heap.pop();if(q.g!==dist.get(q.k))continue;expanded++;
    if(q.x===bx&&q.y===by){goal=q;break;}
    for(const [dx,dy,d] of [[1,0,0],[-1,0,0],[0,1,1],[0,-1,1]]){
     const x=q.x+dx,y=q.y+dy;if(x<left||x>right||y<top||y>bottom)continue;
     const p={x:xs[q.x],y:ys[q.y]},r={x:xs[x],y:ys[y]};if(!segmentClear(p,r,n,relaxed))continue;
     const penalty=relaxed?conflicts(p,r,n).reduce((sum,s)=>sum+1200*(1+(routeAttempts.get(s.wire)||0)),0):0;
     const k=key(x,y,d),g=q.g+Math.abs(r.x-p.x)+Math.abs(r.y-p.y)+(d!==q.d?36:0)+penalty;
     if(g>=(dist.get(k)??Infinity))continue;dist.set(k,g);prev.set(k,q.k);heap.push({x,y,d,k,g,f:g+heuristic(x,y)});
    }
   }
   if(goal){const path=[];let k=goal.k;for(;;){const cell=Math.floor(k/2);path.push({x:xs[cell%xs.length],y:ys[Math.floor(cell/xs.length)]});if(!prev.has(k))break;k=prev.get(k);}return simplify(path.reverse());}
  }
  return null;
 };
 const order=edges.map((_,i)=>i).sort((i,j)=>{
  const distance=k=>Math.abs(starts[k].x-ends[k].x)+Math.abs(starts[k].y-ends[k].y);
  return distance(i)-distance(j)||i-j;
 }),wires=Array(edges.length);
 for(let position=0;position<order.length;position++){const i=order[position],a=starts[i],b=ends[i],n=net[i];let path=null;
  const candidates=[[a,b],[a,{x:b.x,y:a.y},b],[a,{x:a.x,y:b.y},b]];
  for(const p of candidates)if(pathClear(p,n)){path=p;break;}
  if(!path)for(const x of orderedAxis(xs,a.x,b.x)){const p=[a,{x,y:a.y},{x,y:b.y},b];if(pathClear(p,n)){path=p;break;}}
  if(!path)for(const y of orderedAxis(ys,a.y,b.y)){const p=[a,{x:a.x,y},{x:b.x,y},b];if(pathClear(p,n)){path=p;break;}}
  if(!path)path=search(a,b,n);
  if(!path){
   path=search(a,b,n,true);
   if(path){
    const displaced=new Set(path.slice(1).flatMap((p,j)=>conflicts(path[j],p,n).map(s=>s.wire)).filter(w=>w!==null));
    for(const map of [horizontal,vertical])for(const [axis,entries] of map)map.set(axis,entries.filter(s=>!displaced.has(s.wire)));
    for(const wire of displaced){wires[wire]=null;order.push(wire);routeAttempts.set(wire,(routeAttempts.get(wire)||0)+1);ripUps++;}
    if(options.progress)options.progress({done:wires.filter(Boolean).length,total:edges.length,elapsedMs:Date.now()-started,ripUps});
   }
  }
  if(!path){
   const diagnostic=p=>({p,neighbors:[[LANE,0],[-LANE,0],[0,LANE],[0,-LANE]].map(([dx,dy])=>{
    const q={x:p.x+dx,y:p.y+dy},h=dy===0,axis=h?p.y:p.x,lo=Math.min(h?p.x:p.y,h?q.x:q.y),hi=Math.max(h?p.x:p.y,h?q.x:q.y);
    return {q,clear:segmentClear(p,q,n),obstacles:(h?obstacleH:obstacleV).get(axis)?.filter(s=>Math.min(hi,s.hi)-Math.max(lo,s.lo)>EPS),turns:(h?turnsH:turnsV).get(axis)?.filter(s=>s.net!==n&&s.at>=lo-EPS&&s.at<=hi+EPS),wires:(h?horizontal:vertical).get(axis)?.filter(s=>s.net!==n&&Math.min(hi,s.hi)-Math.max(lo,s.lo)>EPS)};
   })});
   throw Error(`Cannot route calculator wire ${i}: ${endKey(edges[i].from)} -> ${endKey(edges[i].to)}; ${JSON.stringify({net:n,source:diagnostic(a),target:diagnostic(b)})}`);
  }
  path=simplify(path);for(let j=1;j<path.length;j++)reserve(path[j-1],path[j],n,i);
  const e=edges[i],full=simplify([endpoint(e.from),...path,endpoint(e.to)]);
  wires[i]={id:`${options.prefix||'calculator'}-${i}`,from:structuredClone(e.from),to:structuredClone(e.to),points:full.slice(1,-1),style:e.style||'normal',color:e.color||'Cyan'};
  if(options.progress&&(position+1)%100===0)options.progress({done:wires.filter(Boolean).length,total:edges.length,elapsedMs:Date.now()-started,ripUps});
 }
 return {wires,stats:{nodes:nodes.length,wires:wires.length,sections,elapsedMs:Date.now()-started,fallbackSearches,expanded,ripUps}};
}
module.exports={layoutAndRoute,worldPort,simplify};
