const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
const {validateElectricalRouting,validateGeometryRouting}=require('../scripts/check-calculator-routing.cjs');
const {buildCalculatorSmallStored}=require('../scripts/build-calculator-small-stored.cjs');
const {buildCalculatorSmallAuto}=require('../scripts/build-calculator-small-auto.cjs');

for(const {id,constant,build} of [
  {id:'calculator-small-stored',constant:'CALCULATOR_SMALL_STORED_DESIGN',build:buildCalculatorSmallStored},
  {id:'calculator-small-auto',constant:'CALCULATOR_SMALL_AUTO_DESIGN',build:buildCalculatorSmallAuto},
])test(`${id} has exactly its intended physical connections and clear, separate routes`,()=>{
  const ctx=loadApp(),design=vm.runInContext(constant,ctx),intended=build();
  assert.equal(design.id,id);
  assert.equal(design.wires.length,intended._edges.length,'baked circuit must match current builder');
  assert.equal(design.nodes.length,intended.nodes.length,'all intended parts must remain editable');
  assert.equal(vm.runInContext('valid('+constant+')',ctx),true);
  const electrical=validateElectricalRouting(design,intended._edges,ctx);
  const physical=validateGeometryRouting(design,ctx);
  assert.equal(electrical.wires,design.wires.length);
  assert.ok(physical.segments>=design.wires.length);
});
