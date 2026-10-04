// Bake the two one-digit calculators as ordinary editable, routed designs.
// Builders own the logic; this file owns only placement, routing and embedding.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {loadApp}=require('./compact-circuit.cjs');
const {layoutAndRoute}=require('./calculator-routing.cjs');
const {buildCalculatorSmallStored}=require('./build-calculator-small-stored.cjs');
const {buildCalculatorSmallAuto}=require('./build-calculator-small-auto.cjs');

const definitions=[
  {constant:'CALCULATOR_SMALL_STORED_DESIGN',prefix:'calc-stored',build:buildCalculatorSmallStored},
  {constant:'CALCULATOR_SMALL_AUTO_DESIGN',prefix:'calc-auto',build:buildCalculatorSmallAuto},
];

function routeSmallCalculators(){
  const ctx=loadApp(),footprint=vm.runInContext('footprint',ctx),localPort=vm.runInContext('localPort',ctx);
  return definitions.map(({constant,prefix,build})=>{
    const design=build(),edges=design._edges,groups=design._groups;
    if(!Array.isArray(design.nodes)||!Array.isArray(edges)||!Array.isArray(groups)||design.wires?.length)throw Error(`Unrouted design required: ${constant}`);
    const result=layoutAndRoute(design.nodes,edges,groups,footprint,localPort,{
      prefix,sectionWidth:1440,padding:72,sectionGap:336,columns:2,
      progress:progress=>{if(progress.done%200===0||progress.done===progress.total)console.log(`${prefix}: ${progress.done}/${progress.total} wires, ${(progress.elapsedMs/1000).toFixed(1)}s`);},
    });
    design.wires=result.wires;
    delete design._edges;delete design._groups;
    for(const node of design.nodes){delete node._section;delete node._fixed;}
    ctx.candidate=design;
    if(!vm.runInContext('valid(candidate)',ctx))throw Error(`Invalid routed design: ${design.id}`);
    return {constant,design,stats:result.stats};
  });
}

function bakeSmallCalculators(){
  const routed=routeSmallCalculators(),file=path.join(__dirname,'../dist/app.js');
  let source=fs.readFileSync(file,'utf8');
  const block='// BEGIN GENERATED SMALL CALCULATORS (scripts/build-calculator-smalls.cjs)\n'
    +routed.map(({constant,design})=>`const ${constant} = ${JSON.stringify(design)};\nBUILT_IN_DESIGNS.push(${constant});`).join('\n')
    +'\n// END GENERATED SMALL CALCULATORS';
  if(source.includes('// BEGIN GENERATED SMALL CALCULATORS')){
    source=source.replace(/\/\/ BEGIN GENERATED SMALL CALCULATORS[^\n]*\n[\s\S]*?\/\/ END GENERATED SMALL CALCULATORS/,block);
  }else{
    const anchor='// BEGIN GENERATED PONG (scripts/build-pong.cjs)';
    if(!source.includes(anchor))throw Error('Missing generated-design anchor');
    source=source.replace(anchor,block+'\n'+anchor);
  }
  fs.writeFileSync(file,source);
  return routed.map(({design,stats})=>({id:design.id,nodes:design.nodes.length,wires:design.wires.length,elapsedMs:stats.elapsedMs}));
}

if(require.main===module)console.log(bakeSmallCalculators());
module.exports={routeSmallCalculators,bakeSmallCalculators};
