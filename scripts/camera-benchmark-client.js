// Appended to the application module only by camera-benchmark.cjs; never shipped.
{
  const params=new URLSearchParams(location.search);
  const design=BUILT_IN_DESIGNS.find(d=>d.id===(params.get('design')||'decimal-keypad-4'));
  model=structuredClone(design);clearSelection();networkCache=null;paintedModel=null;
  resetTiming();running=true;updatePlaybackControls();
  render();simulate(false);
  if(design.id.startsWith('decimal-keypad-'))for(const digit of [1,2,3,4]){pressButton(nodeBy('key'+digit));simulate(true,400);}
  let highlightedWire=null;
  if(params.get('select')==='longest'){
    let widest=-1;
    for(const wire of model.wires){
      const points=wireEnds(wire);if(!points?.length)continue;
      const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
      const area=(Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys));
      if(area>widest){widest=area;highlightedWire=wire.id;}
    }
    if(highlightedWire){selectOnly('wire',highlightedWire);renderSelection();}
  }
  const anchor=(params.get('region')==='front'?model.nodes.find(n=>n.id==='key5'):null)||model.nodes.find(n=>n.label?.includes('add-digit-0'))||model.nodes[Math.floor(model.nodes.length/2)];
  const scale=Number(params.get('scale'))||.45,distance=Number(params.get('distance'))||260;
  view={x:180-anchor.x*scale,y:160-anchor.y*scale,scale};applyView();
  if(params.get('wire-renderer')==='canvas')installCanvasWirePrototype();
  const panel=document.createElement('div');panel.id='camera-benchmark';
  panel.style.cssText='position:fixed;right:12px;top:100px;z-index:10000;background:#17262f;color:white;padding:12px;max-width:550px;font:12px monospace';
  const run=document.createElement('button');run.textContent='Run pan benchmark';
  const mixed=document.createElement('button');mixed.textContent='Run pan + zoom benchmark';
  const unfiltered=document.createElement('input');unfiltered.type='checkbox';unfiltered.id='unfiltered';
  const label=document.createElement('label');label.htmlFor='unfiltered';label.textContent='Disable wire filters for comparison';
  const output=document.createElement('pre');output.style.whiteSpace='pre-wrap';output.textContent=`${params.get('camera-bench')||'current'}: ${model.nodes.length} parts, ${model.wires.length} wires${highlightedWire?', highlighted '+highlightedWire:''}`;
  const style=document.createElement('style');document.head.append(style);
  unfiltered.onchange=()=>{style.textContent=unfiltered.checked?'#wires .wire-path{filter:none!important}':'';};
  // Local-only timing split: the browser frame gap includes rendering and
  // scheduling, while these counters measure only JavaScript in known paths.
  let profiling=false,profile={};
  const timed=(name,fn)=>(...args)=>{
    if(!profiling)return fn(...args);
    const started=performance.now();
    try{return fn(...args);}finally{
      const bucket=profile[name]||(profile[name]={calls:0,totalMs:0,maxMs:0});
      const duration=performance.now()-started;
      bucket.calls++;bucket.totalMs+=duration;bucket.maxMs=Math.max(bucket.maxMs,duration);
    }
  };
  applyView=timed('applyView',applyView);
  updateRenderWindow=timed('visibility',updateRenderWindow);
  simulate=timed('simulate',simulate);
  paintSignals=timed('paintSignals',paintSignals);
  paintTimingFaces=timed('timingFaces',paintTimingFaces);
  panel.append(run,mixed,unfiltered,label,output);document.body.append(panel);
  const benchmark=zoom=>{
    run.disabled=mixed.disabled=true;const start={...view},gaps=[],work=[];let frame=0,last=0;
    profile={};profiling=true;
    gesture={type:'pan',pointerId:991,start:{x:0,y:0},orig:{x:view.x,y:view.y},moved:true};els.viewport.classList.add('panning');
    const step=now=>{
      if(frame>=24&&last)gaps.push(now-last);last=now;
      const t=performance.now();
      onPointerMove({pointerId:991,pointerType:'mouse',clientX:Math.sin(frame/35)*distance,clientY:Math.sin(frame/49)*distance*.7});
      if(zoom){const r=els.viewport.getBoundingClientRect(),scale=start.scale*Math.exp(Math.sin(frame/40)*.3);zoomAt(scale/view.scale,r.left+r.width*.5,r.top+r.height*.5);}
      applyView();
      if(frame>=24)work.push(performance.now()-t);
      if(++frame<144){requestAnimationFrame(step);return;}
      gesture=null;view=start;finishCameraGesture();run.disabled=mixed.disabled=false;profiling=false;
      const stats=xs=>{const sorted=[...xs].sort((a,b)=>a-b);return {median:+sorted[Math.floor(sorted.length*.5)].toFixed(2),p95:+sorted[Math.floor(sorted.length*.95)].toFixed(2),max:+sorted.at(-1).toFixed(2)};};
      const script=Object.fromEntries(Object.entries(profile).map(([name,data])=>[name,{calls:data.calls,totalMs:+data.totalMs.toFixed(1),maxMs:+data.maxMs.toFixed(1)}]));
      output.textContent=JSON.stringify({variant:params.get('camera-bench')||'current',renderer:params.get('wire-renderer')||'svg',mode:zoom?'pan + zoom':'pan',region:params.get('region')||'back',highlightedWire,running,unfiltered:unfiltered.checked,design:design.id,nodes:model.nodes.length,wires:model.wires.length,frameMs:stats(gaps),cameraJsMs:stats(work),script,framesOver33ms:gaps.filter(n=>n>33.5).length,totalFrames:gaps.length},null,2);
    };requestAnimationFrame(step);
  };
  run.onclick=()=>benchmark(false);mixed.onclick=()=>benchmark(true);
}
