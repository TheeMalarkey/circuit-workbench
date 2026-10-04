// Diagnostic-only camera layer experiments. Never included in dist.
function installCameraLayerExperiment(){
  const panel=document.getElementById('camera-benchmark');
  const label=document.createElement('label');label.textContent=' Rendering experiment: ';
  const select=document.createElement('select');select.id='camera-layer-variant';
  for(const [value,text] of [['original','Original SVG'],['no-hint','No world compositor hint'],['viewport-svg','Viewport-sized independent SVG'],['no-wires','Hide wire visuals (diagnostic only)'],['no-nodes','Hide boards (diagnostic only)']]){
    const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option);
  }
  label.append(select);panel.prepend(label);
  const root=els.wires,parent=root.parentElement,next=root.nextSibling;
  const originalRootStyle=root.getAttribute('style'),originalViewBox=root.getAttribute('viewBox');
  const style=document.createElement('style');document.head.append(style);
  let variant='original';
  const sync=()=>{
    if(variant!=='viewport-svg')return;
    const width=els.viewport.clientWidth,height=els.viewport.clientHeight;
    root.style.width=width+'px';root.style.height=height+'px';
    root.setAttribute('viewBox',`${-view.x/view.scale} ${-view.y/view.scale} ${width/view.scale} ${height/view.scale}`);
  };
  const originalApply=applyView;
  applyView=(...args)=>{const result=originalApply(...args);sync();return result;};
  select.onchange=()=>{
    variant=select.value;
    parent.insertBefore(root,next);
    if(originalRootStyle===null)root.removeAttribute('style');else root.setAttribute('style',originalRootStyle);
    if(originalViewBox===null)root.removeAttribute('viewBox');else root.setAttribute('viewBox',originalViewBox);
    els.world.style.zIndex='';
    style.textContent=variant==='no-hint'?'#world{will-change:auto!important}':variant==='no-wires'?'#wires .wire-path{visibility:hidden!important}':variant==='no-nodes'?'#nodes{visibility:hidden!important}':'';
    if(variant==='viewport-svg'){
      els.viewport.insertBefore(root,els.world);
      root.style.left='0';root.style.top='0';root.style.overflow='hidden';
      root.setAttribute('preserveAspectRatio','none');els.world.style.zIndex='2';
    }else root.removeAttribute('preserveAspectRatio');
    applyView();panel.dataset.layerVariant=variant;
  };
  panel.dataset.layerVariant=variant;
  window.addEventListener('resize',sync);
}
