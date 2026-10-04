// Local-only browser benchmark. Freezes the starting assets for before/after comparisons.
// Run: node scripts/camera-benchmark.cjs, then open http://127.0.0.1:8783/
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../dist');
const option=name=>{const index=process.argv.indexOf(name);return index<0?undefined:process.argv[index+1];};
const port=Number(option('--port')||8783);
const baselineFile=option('--baseline'),baselineCss=option('--baseline-css');
const baseline={js:fs.readFileSync(baselineFile||path.join(root,'app-explorer.js'),'utf8'),css:fs.readFileSync(baselineCss||path.join(root,'styles.css'),'utf8')};
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1:8783'),old=url.searchParams.get('camera-bench')==='baseline';
  const wireLayer=!old&&url.searchParams.get('wire-layer')==='on';
  const name=url.pathname==='/'?'index.html':url.pathname.slice(1);
  const file=path.resolve(root,name);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  try{
    let body=fs.readFileSync(file);
    if(name==='index.html')body=body.toString().replace(/(app-explorer\.js|styles\.css)\?v=\d+/g,(_,asset)=>`${asset}?camera-bench=${old?'baseline':'current'}${asset==='styles.css'&&wireLayer?'&wire-layer=on':''}${asset==='app-explorer.js'&&url.searchParams.get('layer-experiment')==='on'?'&layer-experiment=on':''}${asset==='app-explorer.js'&&url.searchParams.get('board-experiment')==='on'?'&board-experiment=on':''}`);
    if(name==='app-explorer.js')body=(old?baseline.js:body.toString())+'\n'+fs.readFileSync(path.join(__dirname,'canvas-wire-prototype.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'camera-benchmark-client.js'),'utf8')+(url.searchParams.get('layer-experiment')==='on'?'\n'+fs.readFileSync(path.join(__dirname,'camera-layer-experiment.js'),'utf8')+'\ninstallCameraLayerExperiment();':'');
    if(name==='styles.css'&&old)body=baseline.css;
    if(name==='app-explorer.js'&&url.searchParams.get('board-experiment')==='on')body+='\n'+fs.readFileSync(path.join(__dirname,'board-drag-benchmark.js'),'utf8')+'\ninstallBoardDragBenchmark();';
    // Diagnostic only: never alter baseline assets or the shipped stylesheet.
    if(name==='styles.css'&&wireLayer)body=body.toString()+'\n#wires{will-change:transform}\n';
    res.writeHead(200,{'Content-Type':name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.html')?'text/html':'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end();}
}).listen(port,'127.0.0.1',()=>console.log(`Camera benchmark: http://127.0.0.1:${port}/ (baseline: ?camera-bench=baseline)`));
