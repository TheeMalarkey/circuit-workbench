const {api,load,outputLights}=require('./design-audit.cjs');
const failures=[];
function compareDirectNeons(label){for(const light of outputLights())if(light.from.node&&light.on!==api.output(light.from.node,light.from.index))failures.push({label,light});}
load('counter-0-15');for(let count=0;count<16;count++){compareDirectNeons('counter '+count);api.pressButton(api.nodeBy('count'));api.simulate(true,400);}
load('traffic-light-controller');for(let ms=0;ms<18000;ms+=100){compareDirectNeons('traffic '+ms);api.simulate(true,100);}
load('pong-solo');
function pixel(x,y){const net=api.getNetwork(),w=api.model.wires.find(w=>w.arcade?.role==='pixel'&&w.arcade.x===x&&w.arcade.y===y);return !!net.powered.get(net.byWire.get(w.id));}
const before={computed:api.output('pixel-0-0'),neon:pixel(0,0)};
const cut=api.model.wires.find(w=>w.from.node==='pixel-0-0');api.model.wires=api.model.wires.filter(w=>w.id!==cut.id);api.simulate(false);
const after={computed:api.output('pixel-0-0'),neon:pixel(0,0)};
load('pong-solo');api.nodeBy('run').on=true;api.simulate(false);let frames=0;
for(;frames<100;frames++){
 const phase=api.nodeBy('ball-x').channel,x=phase<=4?phase:8-phase;
 if(api.nodeBy('ball-y').channel===4)api.pressButton(api.nodeBy(x<2?'left':x>2?'right':'center'));
 api.simulate(true,400);
 for(let y=0;y<6;y++)for(let x=0;x<5;x++)if(pixel(x,y)!==api.output(`pixel-${x}-${y}`))failures.push({frame:frames,pixel:[x,y]});
}
console.log(JSON.stringify({failures,frames,pixelFeedFault:{wire:cut.id,before,after}},null,2));
