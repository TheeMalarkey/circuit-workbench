// Build an ordinary, editable LT2 circuit. There is no game-specific simulator.
const fs=require('node:fs'),path=require('node:path');
function buildPong(){
  const nodes=[],edges=[],pixels=[],out=(node,index=0)=>({node,side:'out',index});
  const add=(id,type,label,extra={})=>{nodes.push({id,type,label,x:0,y:0,rotation:0,...extra});return out(id);};
  const link=(from,node,index=0)=>edges.push({from,to:{node,side:'in',index}});
  const gate=(id,type,a,b,label=id)=>{const result=add(id,type,label);if(a)link(a,id);if(b)link(b,id,1);return result;};
  const not=(id,a)=>gate(id,'inverter',a,null,id.replaceAll('-',' '));
  const fold=(id,type,signals)=>{let layer=signals,level=0;while(layer.length>1){const next=[];for(let i=0;i<layer.length;i+=2)next.push(i+1===layer.length?layer[i]:gate(`${id}-${level}-${i/2}`,type,layer[i],layer[i+1],id.replaceAll('-',' ')));layer=next;level++;}return layer[0];};
  const tag=(role)=>({arcade:{game:'pong',group:'pong',role}});
  const run=add('run','lever','RUN / PAUSE',{on:false,panel:true,...tag('run')});
  nodes.at(-1).arcade.contactVersion=2;
  const restart=add('restart','button','NEW GAME',{panel:true,...tag('restart')});
  const left=add('left','button','LEFT · A',{panel:true,...tag('left')});
  const center=add('center','button','CENTER · S',{panel:true,...tag('center')});
  const right=add('right','button','RIGHT · D',{panel:true,...tag('right')});
  const power=not('power',null);
  const reset=add('resetting','buffer1','Reset in progress',{bit:false});link(restart,'resetting',1);
  const lost=add('lost','buffer1','Miss remembered',{bit:false});link(restart,'lost',0);
  const paddleLeft=add('paddle-left','buffer1','Paddle at left',{bit:false});
  const paddleRight=add('paddle-right','buffer1','Paddle at right',{bit:false});
  const clearLeft=fold('clear-left','or',[center,right,restart]),clearRight=fold('clear-right','or',[center,left,restart]);
  link(clearLeft,'paddle-left',0);link(clearRight,'paddle-right',0);
  link(gate('choose-left','and',left,not('allow-left',clearLeft)),'paddle-left',1);
  link(gate('choose-right','and',right,not('allow-right',clearRight)),'paddle-right',1);
  const cover=[paddleLeft,not('not-right',paddleRight),power,not('not-left',paddleLeft),paddleRight];
  add('ball-x','selector8','Ball horizontal phase · wall bounce',{channel:0});
  add('ball-y','selector16','Ball vertical phase · top and paddle',{channel:0,enabled:Array.from({length:16},(_,i)=>i<10)});
  add('divider','selector4','Horizontal half-speed',{channel:0,enabled:[true,true,false,false]});
  const score=add('score','selector16','Returns · 0 to 15',{channel:0,...tag('score')});
  const won=out('score',15);
  const enabled=fold('playing','and',[run,not('not-resetting',reset),not('not-lost',lost),not('not-won',won)]);
  const clock=gate('clock','and',enabled,out('clock-feedback'), 'Ball clock');
  add('clock-delay','delay','Pace · 2 ticks',{delay:2});link(clock,'clock-delay');not('clock-feedback',out('clock-delay'));
  const resetClock=gate('reset-clock','and',reset,out('reset-feedback'),'Reset clock');
  add('reset-delay','delay','Reset pace',{delay:1});link(resetClock,'reset-delay');not('reset-feedback',out('reset-delay'));
  const normalPulses={
    'ball-x':gate('x-step','and',clock,out('divider',1),'Move horizontal'),
    'ball-y':clock,
    'divider':gate('half-step','and',enabled,not('clock-low',clock),'Prepare next horizontal step'),
    'score':out('hit')
  };
  const halfStep=normalPulses.divider;
  for(const id of ['ball-x','ball-y','divider','score']){
    const resetStep=gate('home-'+id,'and',resetClock,not('not-zero-'+id,out(id,0)),'Home '+id);
    link(gate('advance-'+id,'or',normalPulses[id],resetStep,'Advance '+id),id);
  }
  link(fold('reset-complete','and',[...['ball-x','ball-y','divider','score'].map(id=>out(id,0)),not('restart-released',restart)]),'resetting',0);
  const columns=Array.from({length:5},(_,x)=>x===0||x===4?out('ball-x',x):gate('column-'+x,'or',out('ball-x',x),out('ball-x',8-x),'Ball column '+(x+1)));
  const rows=Array.from({length:6},(_,y)=>y===0||y===5?out('ball-y',y):gate('row-'+y,'or',out('ball-y',y),out('ball-y',10-y),'Ball row '+(y+1)));
  const match=fold('paddle-match','or',columns.map((c,x)=>gate('covered-'+x,'and',c,cover[x],'Paddle covers column '+(x+1))));
  const handled=add('contact-handled','buffer1','Sample each paddle contact once',{bit:false});
  link(not('away-from-paddle',rows[5]),'contact-handled',0);
  // Let the ball light its final row before sampling the paddle at the
  // falling half of the clock. One contact still counts only once.
  const contact=fold('contact','and',[rows[5],not('unhandled',handled),halfStep]);
  link(contact,'contact-handled',1);
  gate('hit','and',contact,match,'Successful return');
  link(gate('miss','and',contact,not('not-covered',match),'Missed paddle'),'lost',1);
  for(let y=0;y<6;y++)for(let x=0;x<5;x++)pixels.push({x,y,source:gate(`pixel-${x}-${y}`,'and',columns[x],rows[y],`Screen · ${x+1}, ${y+1}`),color:'Cyan'});
  for(let x=0;x<5;x++)pixels.push({x,y:6,source:cover[x],color:'Green'});
  const scoreBits=[];
  for(let bit=0;bit<4;bit++)scoreBits.push(fold('score-bit-'+bit,'or',Array.from({length:16},(_,i)=>i).filter(i=>i&(1<<bit)).map(i=>out('score',i))));
  add('score-bcd','binaryBCD','Score → decimal');scoreBits.forEach((p,bit)=>link(p,'score-bcd',3-bit));
  for(const [digit,x] of [['tens',1008],['units',1152]]){
    add('score-'+digit,'converter7','',{panel:true,x,y:192});
    add('score-'+digit+'-display','display7',digit==='tens'?'SCORE · tens':'SCORE · units',{panel:true,x,y:192,...tag('display-'+digit)});
    for(let i=0;i<4;i++)link(out('score-bcd',(digit==='tens'?0:4)+i),'score-'+digit,i);
  }
  const display={pixels,status:[{role:'lost',source:lost,color:'Red'},{role:'won',source:won,color:'Green'},{role:'resetting',source:reset,color:'Orange'}]};
  return {nodes,edges,display,id:'pong-solo',name:'Pong · logic arcade',
    detail:'A playable solo Pong circuit: 5 × 7 neon screen, three paddle positions, automatic wall bounces, collision memory, and a two-digit score. Every game rule is built from ordinary gates, selectors, buffers, and delays.',
    check:'The cyan neon wires show the ball and the green row shows the paddle. Click LEFT, CENTER or RIGHT to move; turn RUN on to start. NEW GAME homes the ball and clears the score. Reach 15 returns to win. Use Show Pong circuit to return to the screen after exploring the wiring.'};
}

function wirePong(design,api,{compact=true}={}){
  const {nodes,edges,display}=design,{portPosition,footprint}=api;
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const controls={left:[96,0],center:[240,0],right:[384,0],run:[576,0],restart:[720,0]};
  for(const [id,[x,y]] of Object.entries(controls))Object.assign(byId.get(id),{x,y});
  const rack=nodes.filter(n=>!n.panel),columns=6;
  // Each rack row has its own socket gutters. Vertical buses never pass boards;
  // every source has one explicit trunk and each input gets its own branch.
  const used=new Map();
  const key=p=>`${p.node}:${p.side}:${p.index}`;
  const remember=p=>used.set(key(p),p);
  edges.forEach(e=>{remember(e.from);remember(e.to);});
  [...display.pixels,...display.status].forEach(p=>remember(p.source));
  const leads=new Map(),allPorts=[];let rowTop=0,rackRight=0;
  const reach=(n,side)=>Math.max(24,...[...used.values()].filter(p=>p.node===n.id&&p.side===side).map(p=>24+p.index*12));
  for(let start=0;start<rack.length;start+=columns){
    const row=rack.slice(start,start+columns);
    let lane=0;
    row.forEach((n,col)=>{
      if(compact){
        const previous=row[col-1];
        n.x=previous?Math.ceil((previous.x+footprint(previous).w+reach(previous,'out')+reach(n,'in')+48)/48)*48:1536;
        n.y=rowTop+96;
        rackRight=Math.max(rackRight,n.x+footprint(n).w+reach(n,'out'));
      }else{n.x=1536+col*1008;n.y=rowTop+240;}
    });
    for(const n of row){const f=footprint(n);
      for(const p of [...used.values()].filter(p=>p.node===n.id)){
        const position=portPosition(n,p.side,p.index),laneY=rowTop+(compact?288:672)+(lane++)*12;
        leads.set(key(p),{ref:p,position,laneY,points:escape(n,p,position,laneY,f)});allPorts.push(position);
      }
    }
    rowTop+=compact?Math.ceil((336+lane*12)/48)*48:720+lane*12;
  }
  let panelLane=rowTop+96;
  for(const n of nodes.filter(n=>n.panel))for(const p of [...used.values()].filter(p=>p.node===n.id)){
    const position=portPosition(n,p.side,p.index),laneY=panelLane;panelLane+=12;
    leads.set(key(p),{ref:p,position,laneY,points:escape(n,p,position,laneY,footprint(n))});allPorts.push(position);
  }
  function escape(n,p,a,laneY,f){
    const side=p.side==='in'?-1:1,escapeX=side<0?n.x-24-p.index*12:n.x+f.w+24+p.index*12;
    if(Math.abs(a.y-n.y)<.1||Math.abs(a.y-n.y-f.h)<.1){
      const outward=Math.abs(a.y-n.y)<.1?-1:1,stubY=a.y+outward*(12+p.index*12);
      return [{x:a.x,y:stubY},{x:escapeX,y:stubY},{x:escapeX,y:laneY}];
    }
    return [{x:escapeX,y:a.y},{x:escapeX,y:laneY}];
  }
  const nets=new Map();
  function net(source){const k=key(source);if(!nets.has(k))nets.set(k,{source,sinks:[],lights:[]});return nets.get(k);}
  for(const e of edges)net(e.from).sinks.push(e.to);
  for(const p of display.pixels)net(p.source).lights.push({...p,role:'pixel'});
  for(const p of display.status)net(p.source).lights.push({...p,x:8,y:4+display.status.indexOf(p)});
  const wires=[];let next=0,netIndex=0;
  const wire=(from,to,points=[],extra={})=>wires.push({id:'pong-wire-'+next++,from,to,points,style:'normal',color:'White',...extra});
  const pixelLaneStart=panelLane+96;
  let lightIndex=0;
  const busStart=compact?Math.ceil((rackRight+192)/12)*12:7728;
  for(const net of nets.values()){
    const busX=busStart+netIndex++*12,source=leads.get(key(net.source));
    const taps=[{x:busX,y:source.laneY}];
    wire(net.source,taps[0],[...source.points]);
    for(const ref of net.sinks){const lead=leads.get(key(ref)),tap={x:busX,y:lead.laneY};taps.push(tap);wire(tap,ref,[...lead.points].reverse());}
    for(const light of net.lights){
      const x=144+light.x*144,y=144+light.y*84,start={x,y},end={x:x+48,y};
      // Light feed approaches through an individual bottom lane, keeping all
      // neon endpoints independent even when pixels share a row.
      const laneY=pixelLaneStart+lightIndex++*12,tap={x:busX,y:laneY};taps.push(tap);
      const feedX=x-24-light.y*12;
      wire(tap,start,[{x:feedX,y:laneY},{x:feedX,y:y+24},{x,y:y+24}]);
      wire(start,end,[],{style:'neon',color:light.color,arcade:{game:'pong',group:'pong',role:light.role,x:light.x,y:light.y}});
    }
    taps.sort((a,b)=>a.y-b.y);
    // Segment the bus at real branches: selecting a trunk shows one readable
    // run, with actual junction endpoints at its consumers.
    for(let i=1;i<taps.length;i++)if(taps[i].y!==taps[i-1].y)wire(taps[i-1],taps[i]);
  }
  return {...design,wires,edges:undefined,display:undefined};
}

if(require.main===module){
  const file=path.join(__dirname,'../dist/app.js'),source=fs.readFileSync(file,'utf8');
  const block=/\/\/ BEGIN GENERATED PONG[\s\S]*?\/\/ END GENERATED PONG/;
  const core=source.replace(block,'').replace('BUILT_IN_DESIGNS.push(PONG_DESIGN);','').split('bind();updateGridSnap();')[0];
  const vm=require('node:vm'),ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
  vm.runInContext(core+';globalThis.pongGeometry={portPosition,footprint};',ctx);
  const legacy=wirePong(buildPong(),ctx.pongGeometry,{compact:false});
  const design=wirePong(buildPong(),ctx.pongGeometry);
  const legacyPositions=Object.fromEntries(legacy.nodes.map(n=>[n.id,[n.x,n.y]]));
  const generated='// BEGIN GENERATED PONG (scripts/build-pong.cjs)\nconst PONG_LEGACY_POSITIONS = '+JSON.stringify(legacyPositions)+';\nconst PONG_DESIGN = '+JSON.stringify(design)+';\n// END GENERATED PONG';
  fs.writeFileSync(file,block.test(source)?source.replace(block,generated):source.replace('const NEON_COLORS = [',generated+'\nBUILT_IN_DESIGNS.push(PONG_DESIGN);\nconst NEON_COLORS = ['));
  console.log(`Pong: ${design.nodes.length} components, ${design.wires.length} wires.`);
}
module.exports={buildPong,wirePong};
