// Local-only probe of the real model-movement handler. Never shipped in dist.
function installBoardDragBenchmark(){
  const panel=document.getElementById('camera-benchmark');
  const run=document.createElement('button');run.textContent='Run board drag benchmark';
  const eventCount=document.createElement('select');eventCount.id='board-events-per-frame';eventCount.setAttribute('aria-label','Pointer events per frame');
  for(const count of [4,1]){const option=document.createElement('option');option.value=String(count);option.textContent=count+' pointer events per frame';eventCount.append(option);}
  const output=document.createElement('pre');output.id='board-drag-result';
  output.style.whiteSpace='pre-wrap';panel.prepend(eventCount,run,output);
  let recording=false,profile={};
  const timed=(name,fn)=>(...args)=>{
    if(!recording)return fn(...args);
    const start=performance.now();try{return fn(...args);}finally{
      const item=profile[name]||(profile[name]={calls:0,totalMs:0,maxMs:0});
      const elapsed=performance.now()-start;item.calls++;item.totalMs+=elapsed;item.maxMs=Math.max(item.maxMs,elapsed);
    }
  };
  wireNetworks=timed('wireNetworks',wireNetworks);wireDrawing=timed('wireDrawing',wireDrawing);
  renderNodes=timed('renderNodes',renderNodes);renderWires=timed('renderWires',renderWires);
  renderSelection=timed('renderSelection',renderSelection);simulate=timed('simulate',simulate);
  onPointerMove=timed('onPointerMove',onPointerMove);
  const stats=items=>{const xs=[...items].sort((a,b)=>a-b);return {median:+xs[Math.floor(xs.length*.5)].toFixed(2),p95:+xs[Math.floor(xs.length*.95)].toFixed(2),max:+xs.at(-1).toFixed(2)};};
  run.onclick=()=>{
    run.disabled=true;output.textContent='Running board movement handler...';
    const initial=model,initialTiming=timingSnapshot(),eventsPerFrame=Number(eventCount.value);
    model=structuredClone(initial);clearSelection();networkCache=null;paintedModel=null;renderSelection();simulate(false);
    const node=nodeBy('key7')||model.nodes.reduce((a,b)=>a.x<b.x?a:b);
    const orig={x:node.x,y:node.y};selectOnly('node',node.id);renderSelection();
    const r=els.viewport.getBoundingClientRect(),start={x:r.left+view.x+node.x*view.scale,y:r.top+view.y+node.y*view.scale};
    gesture={type:'group',pointerId:991,start:{...orig},before:structuredClone(model),beforeTiming:initialTiming,moved:false,nodes:new Map([[node.id,orig]]),wires:new Map()};
    const gaps=[],work=[];let frame=0,last=0,movedFrames=0;profile={};recording=true;
    const step=now=>{
      if(frame>=4&&last)gaps.push(now-last);last=now;
      const before={x:node.x,y:node.y},started=performance.now();
      // Compare redundant pointer events with one latest-position update/frame.
      for(let i=0;i<eventsPerFrame;i++)onPointerMove({pointerId:991,pointerType:'mouse',clientX:start.x-(96+(frame%8)*48+i)*view.scale,clientY:start.y});
      if(frame>=4)work.push(performance.now()-started);
      if(node.x!==before.x||node.y!==before.y)movedFrames++;
      if(++frame<36){requestAnimationFrame(step);return;}
      recording=false;gesture=null;
      const script=Object.fromEntries(Object.entries(profile).map(([name,item])=>[name,{calls:item.calls,totalMs:+item.totalMs.toFixed(1),maxMs:+item.maxMs.toFixed(1)}]));
      output.textContent=JSON.stringify({mode:'drag one board',nodes:model.nodes.length,wires:model.wires.length,eventsPerFrame,warmupFrames:4,totalFrames:gaps.length,movedFrames,frameMs:stats(gaps),handlerBatchMs:stats(work),script},null,2);
      model=initial;restoreTiming(initialTiming);clearSelection();networkCache=null;paintedModel=null;renderSelection();simulate(false);run.disabled=false;
    };requestAnimationFrame(step);
  };
}
