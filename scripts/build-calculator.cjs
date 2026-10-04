// Editable decimal calculator: every stored bit, operation and display is wired.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadApp}=require('./compact-circuit.cjs');
const arithmetic=require('./calculator-arithmetic.cjs');
function buildCalculator(){
  const nodes=[],edges=[],groups=[];let section='',serial=0;
  const use=name=>{section=name;if(!groups.includes(name))groups.push(name);};
  const out=(node,index=0)=>({node,side:'out',index}),input=(node,index=0)=>({node,side:'in',index});
  const add=(type,label,extra={})=>{const id=extra.id||'c'+(++serial);nodes.push({id,type,label,x:0,y:0,rotation:0,_section:section,...extra});return id;};
  const link=(from,to,style='normal',color='White')=>{if(from)edges.push({from,to,style,color});};
  const api={node:add,link};
  use('control');api.one=out(add('inverter','Logic 1'));
  const gate=(type,a,b,label=type.toUpperCase())=>{const id=add(type,label);link(a,input(id));if(b)link(b,input(id,1));return out(id);};
  const not=a=>a?gate('inverter',a,null,'NOT'):api.one;
  const and=(a,b,label)=>a&&b?gate('and',a,b,label):null;
  const or=(a,b,label)=>!a?b:!b?a:gate('or',a,b,label);
  const combine=(sources,label='Combine')=>{let next=sources.filter(Boolean);while(next.length>1)next=Array.from({length:Math.ceil(next.length/2)},(_,i)=>or(next[i*2],next[i*2+1],label));return next[0]||null;};
  const delay=(source,ticks,label='Sequence')=>{const id=add('delay',label,{delay:ticks});link(source,input(id));return out(id);};
  const cells=(prefix,count,label)=>Array.from({length:count},(_,i)=>out(add('buffer1',`${label} · bit ${i}`,{id:prefix+'-'+i,bit:false})));
  const write=(bank,data,clock,label)=>bank.forEach((cell,i)=>{link(and(data[i],clock,label+' · write 1'),input(cell.node,1));link(and(not(data[i]),clock,label+' · write 0'),input(cell.node));});
  const button=(id,label,x,y,action)=>out(add('button',label,{id,x,y,_fixed:true,calculator:{group:'calculator',action}}));
  const displays=(prefix,digits,x,y,label)=>Array.from({length:digits},(_,place)=>{
    const px=x+(digits-1-place)*192;
    const id=add('converter7','',{id:prefix+'-converter-'+place,x:px,y,_fixed:true});
    add('display7',place===digits-1?label:'',{id:prefix+'-display-'+place,x:px,y,_fixed:true});return id;
  });
  use('front');
  const entryScreens=displays('entry',4,0,0,'ENTRY');
  const varScreens=[displays('var1',4,912,0,'VARIABLE 1'),displays('var2',4,912,432,'VARIABLE 2')];
  const resultScreens=displays('result',8,576,1200,'RESULT');
  const keys=[];[[7,8,9],[4,5,6],[1,2,3],[null,0,null]].forEach((row,r)=>row.forEach((digit,c)=>{if(digit!==null)keys[digit]=button('key'+digit,String(digit),c*144,336+r*144,'digit');}));
  const setButtons=[button('set1','SET VARIABLE 1',1728,48,'set'),button('set2','SET VARIABLE 2',1728,480,'set')];
  const calculate=button('calculate','CALCULATE',2208,1248,'calculate');
  const opButtons=[button('op-add','ADD +',912,816,'operation'),button('op-sub','SUBTRACT −',1152,816,'operation'),button('op-mul','MULTIPLY ×',1392,816,'operation')];
  use('control');
  const transient=bank=>{for(const cell of bank)nodes.find(n=>n.id===cell.node).calculator={group:'calculator',role:'transient'};return bank;};
  const tokens=transient(cells('command',3,'Command')),tails=tokens.map(t=>delay(t,1,'Command re-arm'));
  const heads=tokens.map((t,i)=>and(t,not(tails[i]),'200 ms command pulse'));
  const busy=combine([...tokens,...tails],'BUSY');
  const busyNode=add('or','BUSY',{id:'busy',x:1872,y:816,_fixed:true,calculator:{group:'calculator',role:'busy'}});link(busy,input(busyNode));
  const idle=not(busy),valid=cells('valid',2,'Variable stored');
  const ready=and(and(valid[0],valid[1]),idle,'Both variables ready');
  const readyNode=add('or','READY TO CALCULATE',{id:'ready',x:2112,y:816,_fixed:true,calculator:{group:'calculator',role:'ready'}});link(ready,input(readyNode));
  link(out(busyNode),{x:2040,y:864},'neon','Yellow');link(out(readyNode),{x:2280,y:864},'neon','Green');
  const rawCommands=[...setButtons,calculate],seen=transient(cells('seen-command',3,'Button already sampled'));
  const fresh=rawCommands.map((raw,i)=>{link(raw,input(seen[i].node,1));link(not(raw),input(seen[i].node));return and(raw,not(seen[i]),'Fresh command');});
  const requests=[and(fresh[0],idle),and(and(fresh[1],not(setButtons[0])),idle),and(and(fresh[2],not(combine(setButtons))),ready)];
  requests.forEach((request,i)=>link(request,input(tokens[i].node,1)));
  const clearPulses=heads.slice(0,2).map((head,i)=>{
    link(head,input(valid[i].node,1));link(delay(head,10,'Transfer complete'),input(tokens[i].node));
    return combine([2,4,6,8].map(t=>delay(head,t,'Clear entry · zero shift')));
  });
  const clearEntry=combine(clearPulses,'Clear entry');
  const operation=cells('operation',2,'Operation code');
  opButtons.forEach((button,i)=>write(operation,[i===1?api.one:null,i===2?api.one:null],and(button,idle),'Select operation'));
  const isSubtract=and(operation[0],not(operation[1]),'SUBTRACT'),isMultiply=and(operation[1],not(operation[0]),'MULTIPLY');
  [not(or(isSubtract,isMultiply)),isSubtract,isMultiply].forEach((signal,i)=>{const x=912+i*240,id=add('or',['SELECTED +','SELECTED −','SELECTED ×'][i],{x,y:1008,_fixed:true});link(signal,input(id));link(out(id),{x:x+168,y:1056},'neon','Green');});
  const multiplyHead=and(heads[2],isMultiply,'Start multiply'),quickHead=and(heads[2],not(isMultiply),'Start add / subtract');
  const quickCapture=delay(quickHead,2,'Capture add / subtract');link(delay(quickHead,4,'Calculation complete'),input(tokens[2].node));
  use('entry-encoder');
  const keySignals=keys.map(k=>and(k,idle,'Keypad interlock'));
  const encoded=Array.from({length:4},(_,bit)=>combine(keySignals.filter((_,digit)=>digit&(1<<bit)),`Digit ${1<<bit}`));
  const anyKey=combine(keySignals,'Any digit');
  use('entry-write');
  const entryPlanes=Array.from({length:4},(_,bit)=>out(add('buffer4',`Entry digit plane ${1<<bit}`,{id:'entry-memory-'+bit,bits:[false,false,false,false]})));
  entryPlanes.forEach((cell,bit)=>{link(and(encoded[bit],anyKey,'Enter 1'),input(cell.node,1));link(or(and(not(encoded[bit]),anyKey,'Enter 0'),clearEntry),input(cell.node));});
  const entry=Array.from({length:16},(_,i)=>out(entryPlanes[i%4].node,Math.floor(i/4)));
  entry.forEach((source,i)=>link(source,input(entryScreens[Math.floor(i/4)],3-i%4)));
  const operands=[];
  for(let v=0;v<2;v++){
    use('variable'+(v+1));const held=cells('var'+(v+1),16,'Variable '+(v+1));write(held,entry,heads[v],'Capture variable '+(v+1));
    held.forEach((source,i)=>link(source,input(varScreens[v][Math.floor(i/4)],3-i%4)));
    use('binary'+(v+1));let word=held.slice(12,16);
    for(let digit=2;digit>=0;digit--){
      const shift=(bits,count)=>[...Array(count).fill(null),...bits].slice(0,16);
      const tenfold=arithmetic.addWords(api,shift(word,1),shift(word,3),{width:16,label:'Decimal × 10'}).bits;
      word=arithmetic.addWords(api,tenfold,held.slice(digit*4,digit*4+4),{width:16,label:'Append decimal digit'}).bits;
    }operands.push(word.slice(0,14));
  }
  use('add-sub');
  const sum=arithmetic.addWords(api,...operands,{width:16,label:'Add variables'}).bits;
  const difference=arithmetic.subtractMagnitude(api,...operands,{width:16,label:'Subtract variables'});
  const mux=(a,b,chooseB,label)=>or(and(a,not(chooseB),label),and(b,chooseB,label),label);
  const quickResult=Array.from({length:28},(_,i)=>mux(sum[i],difference.bits[i],isSubtract,'Arithmetic select'));
  const negative=and(isSubtract,difference.negative,'Negative subtraction');
  use('multiply');
  const main=cells('multiply-main',28,'Multiply main'),shadow=cells('multiply-shadow',28,'Multiply shadow');
  write(main,[...operands[1],...Array(14).fill(null)],multiplyHead,'Initialize multiplier');
  const next=arithmetic.multiplyStep(api,main,operands[0],{label:'Multiply step'});
  let capture=delay(multiplyHead,4,'Multiply round 1');const captures=[],commits=[];
  for(let round=0;round<14;round++){if(round)capture=delay(capture,4,`Multiply round ${round+1}`);captures.push(capture);commits.push(delay(capture,2,`Commit round ${round+1}`));}
  write(shadow,next,combine(captures,'Capture next multiply state'),'Multiply shadow write');
  write(main,shadow,combine(commits,'Commit multiply state'),'Multiply commit');
  const multiplyCapture=delay(commits.at(-1),2,'Capture product');link(delay(commits.at(-1),4,'Multiplication complete'),input(tokens[2].node));
  use('result-memory');
  const result=cells('answer',28,'ANSWER'),sign=cells('answer-negative',1,'Negative answer');
  write(result,quickResult,quickCapture,'Store add / subtract');write(result,main,multiplyCapture,'Store product');
  write(sign,[negative],quickCapture,'Store sign');write(sign,[null],multiplyCapture,'Positive product');
  use('result-decoder');
  const decimal=arithmetic.binaryToBcd(api,result,{digits:8,label:'Answer → decimal'});
  decimal.forEach((bits,place)=>bits.forEach((source,bit)=>link(source,input(resultScreens[place],3-bit))));
  // Use seven independent gates for the most significant display so it can show minus.
  // It must not touch its converter: move the decoder board to the backend.
  const signConverter=nodes.find(n=>n.id===resultScreens[7]);delete signConverter._fixed;signConverter._section='result-decoder';
  for(let segment=0;segment<7;segment++)link(segment===6?or(and(out(signConverter.id,segment),not(sign[0])),sign[0]):and(out(signConverter.id,segment),not(sign[0])),input('result-display-7',segment));
  const design={id:'calculator-9999',name:'Calculator · 0–9999 · + − ×',detail:'A four-digit decimal keypad, two independent stored variables and an eight-digit result. All memory, command sequencing, addition, signed subtraction, multiplication and decimal conversion use editable circuit parts and wires.',check:'Enter digits, then Set Variable 1; wait for the entry to clear. Repeat with Set Variable 2. Select +, − or × and press Calculate. Leading zeros are shown. Multiplication uses fourteen clocked add-and-shift rounds (~13 simulated seconds). Busy protects capture and clearing. The previous answer is held until the next calculation completes.',nodes,wires:[],_edges:edges,_groups:groups};
  return design;
}
function bake(){
  const ctx=loadApp(),design=buildCalculator(),{layoutAndRoute}=require('./calculator-routing.cjs');
  const routed=layoutAndRoute(design.nodes,design._edges,design._groups,vm.runInContext('footprint',ctx),vm.runInContext('localPort',ctx),{progress:progress=>console.log(`Routing ${progress.done}/${progress.total} (${(progress.elapsedMs/1000).toFixed(1)}s)`)});
  design.wires=routed.wires;delete design._edges;delete design._groups;
  design.nodes.forEach(n=>{delete n._section;delete n._fixed;});
  const file=path.join(__dirname,'../dist/app.js'),source=fs.readFileSync(file,'utf8');
  const block='// BEGIN GENERATED CALCULATOR (scripts/build-calculator.cjs)\nconst CALCULATOR_DESIGN = '+JSON.stringify(design)+';\n// END GENERATED CALCULATOR';
  fs.writeFileSync(file,source.includes('// BEGIN GENERATED CALCULATOR')?source.replace(/\/\/ BEGIN GENERATED CALCULATOR[^\n]*\n[\s\S]*?\/\/ END GENERATED CALCULATOR/,block):source.replace('BUILT_IN_DESIGNS.push(ALPHABET_DESIGN);','BUILT_IN_DESIGNS.push(ALPHABET_DESIGN);\n'+block+'\nBUILT_IN_DESIGNS.push(CALCULATOR_DESIGN);'));
  console.log(JSON.stringify({parts:design.nodes.length,wires:design.wires.length,...routed.stats}));
}
if(require.main===module)bake();
module.exports={buildCalculator};
