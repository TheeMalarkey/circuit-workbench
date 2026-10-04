// Single-digit calculator with an entirely physical input sequence and arithmetic.
// First digit -> A, choose + / - / x, next digit -> B and a live answer.
const arithmetic=require('./calculator-arithmetic.cjs');

function buildCalculatorSmallAuto(){
  const nodes=[],edges=[],groups=[];let section='',serial=0;
  const use=name=>{section=name;if(!groups.includes(name))groups.push(name);};
  const out=(node,index=0)=>({node,side:'out',index});
  const input=(node,index=0)=>({node,side:'in',index});
  const add=(type,label,extra={})=>{const id=extra.id||`auto-${++serial}`;nodes.push({id,type,label,x:0,y:0,rotation:0,_section:section,...extra});return id;};
  const link=(from,to,style='normal',color='White')=>{if(from)edges.push({from,to,style,color});};
  const api={node:add,link};
  const gate=(type,a,b,label)=>{const id=add(type,label||type.toUpperCase());link(a,input(id));if(b)link(b,input(id,1));return out(id);};
  const not=a=>gate('inverter',a,null,'NOT');
  const and=(a,b,label)=>a&&b?gate('and',a,b,label):null;
  const or=(a,b,label)=>!a?b:!b?a:gate('or',a,b,label);
  const combine=(sources,label)=>{let layer=sources.filter(Boolean);while(layer.length>1){const next=[];for(let i=0;i<layer.length;i+=2)next.push(or(layer[i],layer[i+1],label));layer=next;}return layer[0]||null;};
  const cell=(id,label)=>out(add('buffer1',label,{id,bit:false}));
  const write=(bank,data,clock,label,reset=null)=>bank.forEach((bit,i)=>{
    link(and(data[i],clock,`${label} · 1`),input(bit.node,1));
    link(or(and(not(data[i]),clock,`${label} · 0`),reset,`${label} · clear`),input(bit.node));
  });
  const control={group:'calculator-small-auto'};
  const button=(id,label,x,y,action)=>out(add('button',label,{id,x,y,_fixed:true,calculator:{...control,action}}));
  const screen=(prefix,x,y,label)=>{
    const converter=add('converter7','',{id:`${prefix}-converter`,x,y,_fixed:true});
    const display=add('display7',label,{id:`${prefix}-display`,x,y,_fixed:true});
    return {converter,display};
  };

  use('front');
  const aScreen=screen('auto-a',0,0,'A'),bScreen=screen('auto-b',192,0,'B');
  const tensScreen=screen('auto-result-tens',624,0,'ANSWER');
  // Leave distinct escape lanes for the seven independently wired segments.
  const unitsScreen=screen('auto-result-units',864,0,'');
  const keys=[];
  [[7,8,9],[4,5,6],[1,2,3],[null,0,null]].forEach((row,r)=>row.forEach((digit,c)=>{
    if(digit!==null)keys[digit]=button(`auto-key${digit}`,String(digit),c*144,336+r*144,'digit');
  }));
  const opButtons=[button('auto-op-add','ADD +',624,384,'operation'),button('auto-op-sub','SUBTRACT -',816,384,'operation'),button('auto-op-mul','MULTIPLY x',1008,384,'operation')];
  const clear=button('auto-clear','CLEAR / NEW',816,624,'clear');

  use('input-sequence');
  const aValid=cell('auto-a-valid','A entered'),operationValid=cell('auto-operation-valid','Operation chosen'),bValid=cell('auto-b-valid','B entered / result ready');
  const clearReleased=not(clear),keySeen=keys.map((key,digit)=>cell(`auto-key-seen-${digit}`,`Key ${digit} already sampled`));
  keySeen.forEach((seen,digit)=>{
    nodes.find(n=>n.id===seen.node).calculator={...control,role:'transient'};
    link(keys[digit],input(seen.node,1));link(not(keys[digit]),input(seen.node));
  });
  const fresh=keys.map((key,i)=>and(key,not(keySeen[i]),`Fresh key ${i}`));
  const keyPulse=and(combine(fresh,'Any new digit'),clearReleased,'Accepted digit');
  const encoded=Array.from({length:4},(_,bit)=>combine(fresh.filter((_,digit)=>digit&(1<<bit)),`Digit bit ${1<<bit}`));
  const first=and(keyPulse,not(aValid),'Capture first digit');
  const second=and(and(keyPulse,aValid,'A present'),and(operationValid,not(bValid),'Waiting for B'),'Capture second digit');
  link(first,input(aValid.node,1));link(second,input(bValid.node,1));
  link(clear,input(aValid.node));link(clear,input(bValid.node));link(clear,input(operationValid.node));
  // A zero is an entered digit, not an empty A. Validity is independent of the data bits.
  const opPulses=opButtons.map((button,i)=>and(button,and(aValid,clearReleased,'A ready'),'Select '+['+','-','x'][i]));
  link(combine(opPulses,'Operation selected'),input(operationValid.node,1));
  const operation=[cell('auto-operation-sub','Subtract selected'),cell('auto-operation-mul','Multiply selected')];
  write(operation,[opPulses[1],opPulses[2]],combine(opPulses,'Operation edge'),'Choose operation',clear);

  use('operand-memory');
  const a=Array.from({length:4},(_,bit)=>cell(`auto-a-bit-${bit}`,`A bit ${1<<bit}`));
  const b=Array.from({length:4},(_,bit)=>cell(`auto-b-bit-${bit}`,`B bit ${1<<bit}`));
  write(a,encoded,first,'Remember A',clear);write(b,encoded,second,'Remember B',clear);
  a.forEach((source,bit)=>link(source,input(aScreen.converter,3-bit)));
  b.forEach((source,bit)=>link(source,input(bScreen.converter,3-bit)));

  use('arithmetic');
  const sum=arithmetic.addWords(api,a,b,{width:4,label:'A + B'});
  const difference=arithmetic.subtractMagnitude(api,a,b,{width:4,label:'A - B'});
  // Four ordinary AND rows and three ripple additions form a 4x4 multiplier.
  // No result bit is supplied by JavaScript, even for the 9 x 9 case.
  const rows=Array.from({length:4},(_,i)=>Array.from({length:7},(_,place)=>{
    const aBit=place-i;return aBit>=0&&aBit<4?and(a[aBit],b[i],`Product row ${i} · bit ${place}`):null;
  }));
  let product=rows[0];
  for(let row=1;row<4;row++)product=arithmetic.addWords(api,product,rows[row],{width:8,label:`Product row ${row} sum`}).bits.slice(0,7);
  const subtract=and(operation[0],not(operation[1]),'Subtract mode');
  const multiply=and(operation[1],not(operation[0]),'Multiply mode');
  const positive=not(multiply);
  const notSubtract=not(subtract);
  const result=Array.from({length:7},(_,bit)=>{
    const addOrSubtract=or(and(sum.bits[bit]||(bit===4?sum.carry:null),notSubtract,`Sum bit ${bit}`),and(difference.bits[bit],subtract,`Difference bit ${bit}`));
    return or(and(addOrSubtract,positive,`Simple result bit ${bit}`),and(product[bit],multiply,`Product bit ${bit}`));
  });
  const negative=and(subtract,difference.negative,'Negative answer');

  use('decimal-output');
  const decimal=arithmetic.binaryToBcd(api,result,{digits:2,label:'Answer to decimal'});
  decimal[0].forEach((source,bit)=>link(source,input(unitsScreen.converter,3-bit)));
  decimal[1].forEach((source,bit)=>link(source,input(tensScreen.converter,3-bit)));
  // The result remains dark until B is captured. The tens face displays only
  // the middle bar for a negative answer; the units face shows its magnitude.
  for(const converter of [tensScreen.converter,unitsScreen.converter]){
    const board=nodes.find(n=>n.id===converter);
    delete board._fixed;board._section='decimal-output';
  }
  const sign=and(negative,bValid,'Show minus');
  const decimalVisible=and(not(negative),bValid,'Show decimal digits');
  for(let segment=0;segment<7;segment++){
    const tens=and(out(tensScreen.converter,segment),decimalVisible,`Tens segment ${segment}`);
    link(segment===6?or(tens,sign,'Minus / middle bar'):tens,input(tensScreen.display,segment));
    link(and(out(unitsScreen.converter,segment),bValid,`Units segment ${segment}`),input(unitsScreen.display,segment));
  }

  const design={
    id:'calculator-small-auto',name:'Calculator · 0–9 · automatic + − ×',
    detail:'A compact single-digit calculator. One shared decimal keypad stores A, the operator buttons select +, − or ×, and the next digit stores B and immediately lights the answer. Its memory, arithmetic, decimal conversion and displays are ordinary editable circuit parts.',
    check:'Press one digit (including 0) to store A; choose +, − or ×; press another digit to store B and see the answer without a Calculate button. CLEAR / NEW starts another pair. Try 9+9=18, 0−9=−9, 9×9=81, and the same digit twice. Extra digits after B are ignored until CLEAR / NEW; changing the operator recomputes the current answer.',
    nodes,wires:[],_edges:edges,_groups:groups
  };
  return design;
}

module.exports={buildCalculatorSmallAuto};
