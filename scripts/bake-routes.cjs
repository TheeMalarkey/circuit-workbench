// Generate preset bends once instead of repeating lane searches on every page load.
const fs=require('node:fs'),path=require('node:path');
const file=path.join(__dirname,'../dist/app.js');
const source=fs.readFileSync(file,'utf8');
const block=/\/\/ BEGIN GENERATED ROUTES[^\n]*\r?\n[\s\S]*?\/\/ END GENERATED ROUTES/;
// Cache the original router coordinate space; keypad compaction runs after lookup.
const designSource=source.split('bind();updateGridSnap();')[0].replace(
  'const DECIMAL_KEYPAD_DESIGNS=[1,2,3,4].map(digits=>decimalKeypadDesign(digits));',
  'const DECIMAL_KEYPAD_DESIGNS=[1,2,3,4].map(digits=>decimalKeypadDesign(digits,false));');
const result=new Function('document','localStorage','crypto',designSource+`;return Object.fromEntries([['calc','calculator-0-0'],['counter','counter-0-15'],['traffic','traffic-light-controller'],...PRACTICAL_DESIGNS.map(d=>[d.id,d.id]),...DECIMAL_KEYPAD_DESIGNS.map(d=>[d.id,d.id])].map(([prefix,id])=>{const d=BUILT_IN_DESIGNS.find(d=>d.id===id);return [prefix,{signature:routeSignature(d.nodes,d.wires),points:d.wires.map(w=>w.points)}];}));`)({getElementById:()=>({})},{getItem:()=>null},require('node:crypto').webcrypto);
fs.writeFileSync(file,source.replace(block,'// BEGIN GENERATED ROUTES (scripts/bake-routes.cjs)\nconst PRESET_ROUTES = '+JSON.stringify(result)+';\n// END GENERATED ROUTES'));
console.log(`Baked ${Object.keys(result).length} explorer route sets.`);
