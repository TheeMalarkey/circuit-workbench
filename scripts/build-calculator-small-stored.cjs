// One-digit calculator with separately captured A and B, wired arithmetic,
// and an answer that changes only when Calculate is pressed. This returns an
// unrouted design; the shared offline router supplies the physical wire paths.
const arithmetic=require('./calculator-arithmetic.cjs');

function buildCalculatorSmallStored(){
  const nodes=[],edges=[],groups=[];
  let section='',serial=0;
  const use=name=>{section=name;if(!groups.includes(name))groups.push(name);};
  const out=(node,index=0)=>({node,side:'out',index});
  const input=(node,index=0)=>({node,side:'in',index});
  const add=(type,label,extra={})=>{
    const id=extra.id||`small-stored-g${++serial}`;
    nodes.push({id,type,label,x:0,y:0,rotation:0,_section:section,...extra});
    return id;
  };
  const link=(from,to,style='normal',color='White')=>{if(from)edges.push({from,to,style,color});};
  const api={node:add,link};
  use('control');
  api.one=out(add('inverter','Logic 1'));
  const gate=(type,a,b,label=type.toUpperCase())=>{
    const id=add(type,label);link(a,input(id));if(b)link(b,input(id,1));return out(id);
  };
  const not=a=>a?gate('inverter',a,null,'NOT'):api.one;
  const and=(a,b,label)=>a&&b?gate('and',a,b,label):null;
  const or=(a,b,label)=>!a?b:!b?a:gate('or',a,b,label);
  const combine=(sources,label='Combine')=>{
    let row=sources.filter(Boolean);
    while(row.length>1)row=Array.from({length:Math.ceil(row.length/2)},(_,i)=>or(row[2*i],row[2*i+1],label));
    return row[0]||null;
  };
  const delay=(source,ticks,label)=>{
    const id=add('delay',label,{delay:ticks});link(source,input(id));return out(id);
  };
  const cells=(prefix,count,label)=>Array.from({length:count},(_,bit)=>
    out(add('buffer1',`${label} · bit ${bit}`,{id:`small-stored-${prefix}-${bit}`,bit:false})));
  const write=(bank,data,clock,label)=>bank.forEach((cell,i)=>{
    link(and(data[i],clock,`${label} · 1`),input(cell.node,1));
    link(and(not(data[i]),clock,`${label} · 0`),input(cell.node));
  });
  const button=(id,label,x,y,action)=>out(add('button',label,{
    id:`small-stored-${id}`,x,y,_fixed:true,
    calculator:{group:'calculator-small-stored',action}
  }));
  const screen=(id,label,x,y)=>{
    const converter=add('converter7','',{id:`small-stored-${id}-converter`,x,y,_fixed:true});
    add('display7',label,{id:`small-stored-${id}-display`,x,y,_fixed:true});
    return converter;
  };
  use('front');
  const entryScreen=screen('entry','ENTRY',96,48);
  const variableScreens=[screen('var1','VARIABLE 1',576,48),screen('var2','VARIABLE 2',816,48)];
  const resultScreens=[screen('result-0','ONES',816,912),screen('result-1','RESULT / SIGN',624,912)];
  const keys=[];
  [[7,8,9],[4,5,6],[1,2,3],[null,0,null]].forEach((row,r)=>row.forEach((digit,c)=>{
    if(digit!==null)keys[digit]=button(`key${digit}`,String(digit),72+c*96,336+r*144,'digit');
  }));
  const setButtons=[button('set1','SET VARIABLE 1',600,336,'set'),button('set2','SET VARIABLE 2',840,336,'set')];
  const opButtons=[button('op-add','ADD +',576,576,'operation'),button('op-sub','SUBTRACT −',720,576,'operation'),button('op-mul','MULTIPLY ×',864,576,'operation')];
  const calculate=button('calculate','CALCULATE',1104,576,'calculate');

  use('control');
  const transient=bank=>{
    for(const cell of bank)nodes.find(n=>n.id===cell.node).calculator={group:'calculator-small-stored',role:'transient'};
    return bank;
  };
  const tokens=transient(cells('command',3,'Command'));
  const tails=tokens.map(token=>delay(token,1,'Command re-arm'));
  const heads=tokens.map((token,i)=>and(token,not(tails[i]),'One tick command pulse'));
  const busy=combine([...tokens,...tails],'BUSY');
  const busyNode=add('or','BUSY',{id:'small-stored-busy',calculator:{group:'calculator-small-stored',role:'busy'}});
  link(busy,input(busyNode));
  const idle=not(busy);
  const valid=cells('valid',2,'Variable stored');
  const ready=and(and(valid[0],valid[1]),idle,'Both variables ready');
  const readyNode=add('or','READY',{id:'small-stored-ready',calculator:{group:'calculator-small-stored',role:'ready'}});
  link(ready,input(readyNode));
  const commands=[...setButtons,calculate];
  const seen=transient(cells('seen-command',3,'Button already sampled'));
  const fresh=commands.map((raw,i)=>{
    link(raw,input(seen[i].node,1));link(not(raw),input(seen[i].node));
    return and(raw,not(seen[i]),'Fresh command');
  });
  const requests=[and(fresh[0],idle),and(and(fresh[1],not(setButtons[0])),idle),
    and(and(fresh[2],not(combine(setButtons))),ready)];
  requests.forEach((request,i)=>link(request,input(tokens[i].node,1)));
  heads.forEach((head,i)=>link(delay(head,4,'Command complete'),input(tokens[i].node)));
  const clearEntry=combine(heads.slice(0,2).map(head=>delay(head,2,'Clear entered digit')),'Clear entry');
  const operation=cells('operation',2,'Operation code');
  opButtons.forEach((button,i)=>write(operation,
    [i===1?api.one:null,i===2?api.one:null],and(button,idle),'Select operation'));
  const isSubtract=and(operation[0],not(operation[1]),'SUBTRACT');
  const isMultiply=and(operation[1],not(operation[0]),'MULTIPLY');
  const isAdd=not(or(isSubtract,isMultiply));
  [isAdd,isSubtract,isMultiply].forEach((signal,i)=>{
    const x=576+i*144,id=add('or',['SELECTED +','SELECTED −','SELECTED ×'][i],{x,y:720,_fixed:true});
    link(signal,input(id));link(out(id),{x:x+120,y:768},'neon','Green');
  });

  use('entry-encoder');
  const keySignals=keys.map(key=>and(key,idle,'Keypad interlock'));
  const encoded=Array.from({length:4},(_,bit)=>combine(
    keySignals.filter((_,digit)=>digit&(1<<bit)),`Digit ${1<<bit}`));
  const anyKey=combine(keySignals,'Any digit');
  use('entry-write');
  const entry=cells('entry',4,'Entered digit');
  entry.forEach((cell,bit)=>{
    link(and(encoded[bit],anyKey,'Write entered 1'),input(cell.node,1));
    link(or(and(not(encoded[bit]),anyKey,'Write entered 0'),clearEntry,'Clear entered digit'),input(cell.node));
  });
  entry.forEach((source,bit)=>link(source,input(entryScreen,3-bit)));
  // Reset the entry after either capture. The two 200 ms command pulses are
  // separated from this reset by two ticks, so a displayed value is copied first.

  const operands=[];
  for(let variable=0;variable<2;variable++){
    use(`variable-${variable+1}`);
    const held=cells(`var${variable+1}`,4,`Variable ${variable+1}`);
    write(held,entry,heads[variable],`Capture variable ${variable+1}`);
    held.forEach((source,bit)=>link(source,input(variableScreens[variable],3-bit)));
    link(heads[variable],input(valid[variable].node,1));
    operands.push(held);
  }
  use('arithmetic');
  const addition=arithmetic.addWords(api,operands[0],operands[1],{width:4,label:'A + B'});
  const sum=[...addition.bits,addition.carry,...Array(3).fill(null)];
  const difference=arithmetic.subtractMagnitude(api,operands[0],operands[1],{width:4,label:'A − B'});
  let product=Array(8).fill(null);
  for(let multiplierBit=0;multiplierBit<4;multiplierBit++){
    const partial=Array(8).fill(null);
    for(let bit=0;bit<4;bit++)partial[bit+multiplierBit]=and(
      operands[0][bit],operands[1][multiplierBit],`Multiply partial ${bit}+${multiplierBit}`);
    product=multiplierBit===0?partial:arithmetic.addWords(api,product,partial,
      {width:8,label:`Add multiply row ${multiplierBit}`}).bits;
  }
  const selected=Array.from({length:8},(_,bit)=>combine([
    and(sum[bit],isAdd,'Select +'),
    and(difference.bits[bit],isSubtract,'Select −'),
    and(product[bit],isMultiply,'Select ×')
  ],'Select answer bit'));
  const negative=and(difference.negative,isSubtract,'Negative subtraction');
  use('answer-memory');
  const answer=cells('answer',8,'ANSWER');
  const sign=cells('answer-negative',1,'Negative answer');
  write(answer,selected,heads[2],'Capture answer');
  write(sign,[negative],heads[2],'Capture sign');
  use('result-decoder');
  const decimal=arithmetic.binaryToBcd(api,answer,{digits:2,label:'Answer → decimal'});
  decimal.forEach((bits,place)=>bits.forEach((source,bit)=>link(source,input(resultScreens[place],3-bit))));
  // On negative results the left display shows a minus instead of its zero.
  const signConverter=nodes.find(n=>n.id===resultScreens[1]);
  delete signConverter._fixed;signConverter._section='result-decoder';
  for(let segment=0;segment<7;segment++){
    const glyph=segment===6?
      or(and(out(signConverter.id,segment),not(sign[0])),sign[0]):
      and(out(signConverter.id,segment),not(sign[0]));
    link(glyph,input('small-stored-result-1-display',segment));
  }
  return {
    id:'calculator-small-stored',name:'Calculator · 0–9 · Stored + − ×',
    detail:'Enter one decimal digit, store it in either of two independent variable displays, then choose addition, subtraction or multiplication and press Calculate. Ordinary editable gates, buffers and wires compute and hold the result.',
    check:'Enter a digit and press Set Variable 1; the entry clears after capture. Repeat for Variable 2. Choose +, − or ×, then Calculate. The two result displays show 00–81 or a minus sign and one digit for negative subtraction.',
    nodes,wires:[],_edges:edges,_groups:groups
  };
}

module.exports={buildCalculatorSmallStored};
