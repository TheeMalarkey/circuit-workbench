const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {loadApp}=require('../scripts/compact-circuit.cjs');
function rig(){
 const ctx=loadApp();
 vm.runInContext(`model={nodes:[
 {id:'key1',type:'button',calculator:{group:'test',action:'digit'}},
 {id:'key2',type:'button',calculator:{group:'test',action:'digit'}},
 {id:'set1',type:'button',calculator:{group:'test',action:'set'}},
 {id:'calculate',type:'button',calculator:{group:'test',action:'calculate'}},
 {id:'busy',type:'or',calculator:{group:'test',role:'busy'}},
 {id:'ready',type:'or',calculator:{group:'test',role:'ready'}}],wires:[]};simulate=()=>{};`,ctx);
 return code=>vm.runInContext(code,ctx);
}
test('calculator UI serializes source presses without calculating or modifying stored bits',()=>{
 const run=rig();run(`pressButton(nodeBy('key1'));pressButton(nodeBy('key2'));pressButton(nodeBy('set1'));`);
 assert.equal(run(`buttonPulses.get('key1')`),350);assert.equal(run(`buttonPulses.has('key2')`),false);
 run(`simulationMs=400;pumpCalculatorInput();`);assert.equal(run(`buttonPulses.get('key2')`),750);
 run(`simulationMs=800;pumpCalculatorInput();`);assert.equal(run(`buttonPulses.get('set1')`),1150);
 assert.equal(run(`calculatorInputState('test').queue.length`),0);
 assert.equal(run(`model.nodes.some(n=>'bit' in n||'bits' in n)`),false);
});
test('calculator buttons read Busy and Ready from their own editable circuit',()=>{
 const run=rig();assert.equal(run(`calculatorLocked(nodeBy('calculate'))`),true);
 run(`values.set('ready',{out:[true]});`);assert.equal(run(`calculatorLocked(nodeBy('calculate'))`),false);
 run(`values.set('busy',{out:[true]});pressButton(nodeBy('key1'));pressButton(nodeBy('calculate'));`);
 assert.equal(run('buttonPulses.size'),0);assert.equal(run(`calculatorInputs.has(model)`),false);
 run(`values.set('busy',{out:[false]});pressButton(nodeBy('key1'));`);assert.equal(run(`buttonPulses.has('key1')`),true);
});
test('paused calculator input waits and Reset clears pending button presses',()=>{
 const run=rig();run(`running=false;pressButton(nodeBy('key1'));`);assert.equal(run('buttonPulses.size'),0);
 assert.equal(run(`calculatorInputState('test').queue.length`),1);
 run(`resetTiming();`);assert.equal(run('calculatorInputs.has(model)'),false);
});
test('copied calculator button guards remain independent between complete calculator instances',()=>{
 const ctx=loadApp(),run=code=>vm.runInContext(code,ctx);
 assert.equal(run(`(()=>{const source=CALCULATOR_DESIGN,before=JSON.stringify(source),a=designCopy(source,{nodes:[],wires:[]}),b=designCopy(source,{nodes:[],wires:[]});const groups=design=>new Set(design.nodes.filter(n=>n.calculator).map(n=>n.calculator.group));return groups(a).size===1&&groups(b).size===1&&[...groups(a)][0]!==[...groups(b)][0]&&JSON.stringify(source)===before;})()`),true);
 assert.equal(run(`CALCULATOR_DESIGN.nodes.filter(n=>n.type==='display7').length`),20);
 assert.equal(run(`valid(CALCULATOR_DESIGN)`),true);
});
