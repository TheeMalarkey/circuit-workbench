// Bake an editable gate-level alphabet encoder + four-character shift register.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadApp}=require('./compact-circuit.cjs');
function buildAlphabet(){
 const nodes=[],edges=[],out=(node,index=0)=>({node,side:'out',index}),input=(node,index=0)=>({node,side:'in',index});
 const add=(id,type,x,y,label,extra={})=>nodes.push(designNode(id,type,x,y,{label,...extra}));
 const link=(from,to)=>edges.push({from,to});
 const keys='ABCDEFGHIJKLMNOPQRSTUVWXYZ '.split('');
 keys.forEach((key,i)=>add('letter-'+i,'button',(i%9)*144,Math.floor(i/9)*240+144,key===' '?'SPACE':key,{alphabet:{group:'alphabet',key}}));
 const tree=(sources,name,x,y)=>{
   for(let level=0;sources.length>1;level++){
     const next=[];
     for(let i=0;i<sources.length;i+=2){if(i+1===sources.length){next.push(sources[i]);continue;}
       const id=name+'-'+level+'-'+i;add(id,'or',x+level*288,y+(i/2)*192,name);link(sources[i],input(id));link(sources[i+1],input(id,1));next.push(out(id));
     }sources=next;
   }return sources[0];
 };
 const bits=Array.from({length:6},(_,bit)=>tree(keys.flatMap((key,i)=>((key===' '?0:i+11)&(1<<bit))?[out('letter-'+i)]:[]),'CODE '+(1<<bit),1920,bit*1632));
 const clock=tree([...bits,out('letter-26')],'ANY LETTER',3648,10368);
 for(let bit=0;bit<6;bit++){
   const y=bit*1632;
   add('not-'+bit,'inverter',3648,y+192,'ZERO '+(1<<bit));add('one-'+bit,'and',4032,y,'WRITE 1');add('zero-'+bit,'and',4032,y+192,'WRITE 0');
   add('text-memory-'+bit,'buffer4',4320,y+48,'CHAR BIT '+(1<<bit));
   link(bits[bit],input('not-'+bit));link(bits[bit],input('one-'+bit));link(clock,input('one-'+bit,1));
   link(out('not-'+bit),input('zero-'+bit));link(clock,input('zero-'+bit,1));
   link(out('zero-'+bit),input('text-memory-'+bit));link(out('one-'+bit),input('text-memory-'+bit,1));
 }
 for(let place=0;place<4;place++){
   const x=(3-place)*288;
   add('text-code-'+place,'converter14',x,-288,'');add('text-screen-'+place,'display14',x,-288,place===0?'NEWEST':'TEXT');
   for(let bit=0;bit<6;bit++)link(out('text-memory-'+bit,place),input('text-code-'+place,bit));
 }
 return compactDesignLayout({id:'alphabet-shift-4',name:'Alphabet text · four-character shift',detail:'A–Z and Space buttons feed a six-bit gate encoder. Six Buffer 4 boards store the last four character codes and drive four 14-segment converters and displays. Every new character moves the older characters left. No hidden display logic.',check:'Click a letter to focus this keyboard, then type A–Z or Space. Rapid typing is queued into separate button pulses. Escape leaves typing mode. The newest character appears on the right; older text falls off the left. Four spaces clear the screen. Pause also pauses queued typing.',nodes,wires:routeDesignWires(nodes,edges,'alphabet')});
}
const ctx=loadApp();
vm.runInContext('var result=('+buildAlphabet.toString()+')();',ctx);
const design=vm.runInContext('result',ctx),file=path.join(__dirname,'../dist/app.js');
const block='// BEGIN GENERATED ALPHABET (scripts/build-alphabet.cjs)\nconst ALPHABET_DESIGN = '+JSON.stringify(design)+';\n// END GENERATED ALPHABET';
const source=fs.readFileSync(file,'utf8');
fs.writeFileSync(file,source.includes('// BEGIN GENERATED ALPHABET')?source.replace(/\/\/ BEGIN GENERATED ALPHABET[^\n]*\n[\s\S]*?\/\/ END GENERATED ALPHABET/,block):source.replace('BUILT_IN_DESIGNS.push(...DECIMAL_KEYPAD_DESIGNS);','BUILT_IN_DESIGNS.push(...DECIMAL_KEYPAD_DESIGNS);\n'+block+'\nBUILT_IN_DESIGNS.push(ALPHABET_DESIGN);'));
console.log(design.nodes.length+' parts, '+design.wires.length+' wires');
