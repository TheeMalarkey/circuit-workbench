// Local-only renderer experiment. Loaded by the camera benchmark, not dist.
function installCanvasWirePrototype(){
  const canvas=document.createElement('canvas');canvas.id='wire-canvas-prototype';
  canvas.setAttribute('aria-hidden','true');
  canvas.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:1';
  els.viewport.insertBefore(canvas,els.world);
  const ctx=canvas.getContext('2d'),style=document.createElement('style');
  // SVG hit paths, endpoints, junctions, selected traces, and drafts are kept.
  style.textContent='#wires .wire-path:not(.draft){visibility:hidden!important}';document.head.append(style);
  let frame=null,entries=null,records=[];
  const rebuild=()=>{
    entries=paintedWires;const under=[],over=[];
    for(const wire of entries)for(const path of wire.paths){
      const item={wire,path,geometry:new Path2D(path.getAttribute('d')),bounds:path.wireBounds};
      (path.dataset.layer==='over'?over:under).push(item);
    }
    records=[...under,...over];refreshStyles();
  };
  const refreshStyles=()=>{for(const item of records){
    const s=getComputedStyle(item.path);
    item.style={stroke:s.stroke,width:parseFloat(s.strokeWidth),cap:s.strokeLinecap,join:s.strokeLinejoin,opacity:Number(s.opacity),filter:s.filter,dash:s.strokeDasharray==='none'?[]:s.strokeDasharray.split(/[ ,]+/).map(parseFloat)};
  }};
  const draw=()=>{
    frame=null;if(entries!==paintedWires)rebuild();
    const width=els.viewport.clientWidth,height=els.viewport.clientHeight,dpr=devicePixelRatio||1;
    if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);canvas.style.width=width+'px';canvas.style.height=height+'px';
    }
    ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.setTransform(dpr*view.scale,0,0,dpr*view.scale,dpr*view.x,dpr*view.y);
    const left=-view.x/view.scale,top=-view.y/view.scale,right=(width-view.x)/view.scale,bottom=(height-view.y)/view.scale;
    for(const item of records){
      const b=item.bounds;
      if(item.wire.group.style.display==='none'||item.path.style.display==='none'||b&&(b.x>right||b.y>bottom||b.x+b.w<left||b.y+b.h<top))continue;
      const s=item.style;ctx.strokeStyle=s.stroke;ctx.lineWidth=s.width;ctx.lineCap=s.cap;ctx.lineJoin=s.join;
      ctx.globalAlpha=s.opacity;ctx.filter=s.filter;ctx.setLineDash(s.dash);ctx.stroke(item.geometry);
    }
  };
  const schedule=()=>{if(frame===null)frame=requestAnimationFrame(draw);};
  const viewOriginal=applyView,wiresOriginal=renderWires,signalsOriginal=paintSignals;
  applyView=(...args)=>{const result=viewOriginal(...args);schedule();return result;};
  renderWires=(...args)=>{const result=wiresOriginal(...args);schedule();return result;};
  paintSignals=(...args)=>{const result=signalsOriginal(...args);if(entries===paintedWires)refreshStyles();schedule();return result;};
  window.addEventListener('resize',schedule);schedule();
}
