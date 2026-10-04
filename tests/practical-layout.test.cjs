const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'../dist/app.js'),'utf8').split('bind();updateGridSnap();')[0];
const ctx=vm.createContext({document:{getElementById:()=>({})},localStorage:{getItem:()=>null},structuredClone,crypto:require('node:crypto').webcrypto});
vm.runInContext(source,ctx);
const run=code=>vm.runInContext(code,ctx);

test('all twelve practical circuits have cached, valid, editable routes outside board interiors',()=>{
  assert.equal(run('PRACTICAL_DESIGNS.length'),12);
  assert.equal(run('new Set(PRACTICAL_DESIGNS.map(d=>d.id)).size'),12);
  assert.equal(run(`PRACTICAL_DESIGNS.every(d=>{
    if(!valid(d)||!EXPLORER_DESIGNS.some(e=>e.id===d.id))return false;
    if(PRESET_ROUTES[d.id]?.signature!==routeSignature(d.nodes,d.wires))return false;
    model=d;
    return d.nodes.every((n,i)=>d.nodes.slice(i+1).every(other=>canPlace(n,[other],n.x,n.y)))&&
      d.wires.every(w=>{const path=wireEnds(w);return path.slice(1).every((b,i)=>{
        const a=path[i];if(a.x!==b.x&&a.y!==b.y)return false;
        return d.nodes.every(n=>{const f=footprint(n);return !(a.x===b.x?
          a.x>n.x&&a.x<n.x+f.w&&Math.max(a.y,b.y)>n.y&&Math.min(a.y,b.y)<n.y+f.h:
          a.y>n.y&&a.y<n.y+f.h&&Math.max(a.x,b.x)>n.x&&Math.min(a.x,b.x)<n.x+f.w);});
      });});
  })`),true);
});

test('all new thumbnails encode finite bounds and can be rendered without canvas state',()=>{
  assert.equal(run(`PRACTICAL_DESIGNS.every(d=>{
    const uri=designPreview(d),svg=decodeURIComponent(uri.split(',')[1]);
    return svg.startsWith('<svg')&&!svg.includes('NaN')&&!svg.includes('Infinity')&&svg.includes('viewBox=');
  })`),true);
});

test('each practical design can be copied beside an existing circuit without hidden game state',()=>{
  assert.equal(run(`PRACTICAL_DESIGNS.every(d=>{
    if([...d.nodes,...d.wires].some(item=>item.arcade))return false;
    const existing={name:'Player work',nodes:[designNode('player','lever',0,0)],wires:[]};
    const copy=designCopy(d,existing);
    return existing.nodes.length===1&&existing.nodes[0].id==='player'&&
      copy.nodes.length===d.nodes.length&&copy.wires.length===d.wires.length&&
      valid({name:d.name,nodes:[...existing.nodes,...copy.nodes],wires:copy.wires});
  })`),true);
});
