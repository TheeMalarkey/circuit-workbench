// Ordinary-part circuit graph helpers. Bit vectors are LSB-first; null is an
// unconnected logical zero. The caller owns IDs, placement, and physical routing.
// API: node(type, label) -> id; link(source, input); optional one -> source.
const out=(node,index=0)=>({node,side:'out',index});
const input=(node,index=0)=>({node,side:'in',index});
const wire=(api,source,node,index=0)=>{if(source)api.link(source,input(node,index));};
function gate(api,type,sources,label){
  const id=api.node(type,label);
  sources.forEach((source,i)=>wire(api,source,id,i));
  return out(id);
}
function one(api){
  if(!api.one)api.one=gate(api,'inverter',[],'CONSTANT 1');
  return api.one;
}
function addWords(api,a,b,{width=Math.ceil(Math.max(a.length,b.length)/4)*4,carry=null,label='ADD'}={}){
  if(!Number.isInteger(width)||width<4||width%4)throw Error('Adder width must be a positive multiple of four');
  const bits=[];
  for(let start=0;start<width;start+=4){
    const id=api.node('fullAdder',`${label} · bits ${start}–${start+3}`);
    for(let bit=0;bit<4;bit++){
      wire(api,a[start+bit],id,3-bit);
      wire(api,b[start+bit],id,7-bit);
      bits.push(out(id,3-bit));
    }
    wire(api,carry,id,8);carry=out(id,4);
  }
  return {bits,carry};
}
function subtractMagnitude(api,a,b,{width=Math.ceil(Math.max(a.length,b.length)/4)*4,label='SUBTRACT'}={}){
  const inverted=Array.from({length:width},(_,i)=>b[i]?gate(api,'inverter',[b[i]],`${label} · NOT B${i}`):one(api));
  const difference=addWords(api,a,inverted,{width,carry:one(api),label});
  const negative=gate(api,'inverter',[difference.carry],`${label} · NEGATIVE`);
  const absolute= difference.bits.map((bit,i)=>gate(api,'xor',[bit,negative],`${label} · ABS ${i}`));
  return {bits:addWords(api,absolute,[],{width,carry:negative,label:`${label} · MAGNITUDE`}).bits,negative};
}
function multiplyStep(api,combined,multiplicand,{label='MULTIPLY STEP'}={}){
  const width=multiplicand.length;
  if(combined.length!==2*width)throw Error('Combined multiply register must contain twice the operand width');
  // Standard add-and-shift multiplication: Q0 selects the multiplicand, add it
  // to the upper accumulator, then right-shift the entire carry:A:Q register.
  const selected=multiplicand.map((bit,i)=>bit?gate(api,'and',[bit,combined[0]],`${label} · SELECT A${i}`):null);
  const sum=addWords(api,combined.slice(width),selected,{width:Math.ceil((width+1)/4)*4,label:`${label} · ACCUMULATE`});
  return [...combined.slice(1,width),...sum.bits.slice(0,width+1)];
}
function binaryToBcd(api,binary,{digits=8,label='DECIMAL'}={}){
  if(!Number.isInteger(digits)||digits<1)throw Error('BCD output needs at least one digit');
  let bcd=Array(digits*4).fill(null);
  for(let bit=binary.length-1;bit>=0;bit--){
    const adjusted=[];
    for(let digit=0;digit<digits;digit++){
      const nibble=bcd.slice(digit*4,digit*4+4);
      // A nibble with both high bits structurally zero can never reach five.
      // Skip its Add 3 board, not its signal: this prunes the empty upper triangle.
      if(!nibble[2]&&!nibble[3]){adjusted.push(...nibble);continue;}
      const id=api.node('add3',`${label} · bit ${bit} digit ${digit}`);
      nibble.forEach((source,i)=>wire(api,source,id,3-i));
      adjusted.push(...[3,2,1,0].map(i=>out(id,i)));
    }
    bcd=[binary[bit]||null,...adjusted.slice(0,-1)];
  }
  return Array.from({length:digits},(_,digit)=>bcd.slice(digit*4,digit*4+4));
}
module.exports={out,input,gate,addWords,subtractMagnitude,multiplyStep,binaryToBcd};
