module.exports={
  name:'Crowded two-lever OR branch',
  nodes:[
    {id:'top',type:'lever',x:1344,y:-48,rotation:0,on:true},
    {id:'bottom',type:'lever',x:1344,y:192,rotation:0,on:true},
    {id:'or',type:'or',x:1728,y:0,rotation:0}
  ],
  wires:[
    {id:'top-to-junction',from:{node:'top',side:'out',index:0},to:{x:1680,y:96},points:[{x:1464,y:108},{x:1512,y:108},{x:1664.7950506737575,y:287.46530645553423},{x:1548,y:96},{x:1560,y:96},{x:1572,y:96},{x:1572,y:108},{x:1668,y:108},{x:1668,y:96}]},
    {id:'junction-to-or-a',from:{x:1560,y:96},to:{node:'or',side:'in',index:0},points:[{x:1624.556703163554,y:52.61376824230821},{x:1639.8067318208589,y:-70.94267781349834},{x:1656,y:96},{x:1721.4998793616,y:283.69266498714126},{x:1789.4087555922754,y:210.3859904808918},{x:1698.3409428117243,y:66.07955725144238},{x:1704,y:24},{x:1716,y:24}]},
    {id:'bottom-to-junction',from:{node:'bottom',side:'out',index:0},to:{x:1577.0076923076929,y:228.3692307692307},points:[{x:1464,y:300},{x:1512,y:300},{x:1512,y:228.3692307692307},{x:1565.0076923076929,y:228.3692307692307}]},
    {id:'bottom-branch',from:{x:1577.0076923076929,y:228.3692307692307},to:{x:1560,y:96},points:[{x:1577.0076923076929,y:216.3692307692307},{x:1486.170681020767,y:109.79000377109304},{x:1572,y:108},{x:1560,y:108}]},
    {id:'short-join',from:{x:1560,y:96},to:{x:1560,y:108},points:[]},
    {id:'junction-to-or-b',from:{x:1680,y:96},to:{node:'or',side:'in',index:1},points:[]}
  ]
};
