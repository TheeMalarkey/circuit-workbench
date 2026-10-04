const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];

test('Explorer defers offscreen preview generation and still loads each visible card',()=>{
  let callback,observed=[],released=[];
  class Observer{
    constructor(onChange,options){callback=onChange;assert.equal(options.rootMargin,'320px');}
    observe(image){observed.push(image);}
    unobserve(image){released.push(image);}
    disconnect(){observed=[];}
  }
  const ctx=vm.createContext({structuredClone,crypto:{randomUUID:()=>''},document:{getElementById:()=>({})},localStorage:{getItem:()=>null},IntersectionObserver:Observer});
  vm.runInContext(source,ctx);
  vm.runInContext(`globalThis.generations=0;designPreview=design=>{generations++;return 'preview:'+design.id};
    globalThis.image={src:''};globalThis.design={id:'example'};scheduleDesignPreview(image,design,{});`,ctx);
  assert.equal(vm.runInContext('generations',ctx),0);
  assert.equal(observed.length,1);
  callback([{target:observed[0],isIntersecting:true}]);
  assert.equal(vm.runInContext('image.src',ctx),'preview:example');
  assert.equal(vm.runInContext('generations',ctx),1);
  assert.equal(released.length,1);
  vm.runInContext(`IntersectionObserver=undefined;globalThis.other={src:''};scheduleDesignPreview(other,{id:'fallback'},{});`,ctx);
  assert.equal(vm.runInContext('other.src',ctx),'preview:fallback');
});
