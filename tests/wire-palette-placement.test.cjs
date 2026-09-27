const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8').split('bind();updateGridSnap();')[0];

function workspace() {
  let nextId = 0;
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true,
      value: '',
      classList: { toggle() {} },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
      setPointerCapture() {},
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    structuredClone,
    crypto: { randomUUID: () => `wire-${++nextId}` },
    document: { getElementById: element },
    localStorage: { getItem: () => null },
  });
  vm.runInContext(source + '\nrenderSelection=()=>{};renderPalette=()=>{};renderWires=()=>{};changed=()=>{};view={x:0,y:0,scale:1};', context);
  return context;
}

function canvasClick(context, x, y, extra = {}) {
  context.event = { button: 0, clientX: x, clientY: y, shiftKey: false, target: { closest: () => null }, ...extra };
  vm.runInContext('onCanvasPointerDown(event)', context);
}

for (const style of ['normal', 'neon']) {
  test(`${style} palette tool starts on empty canvas and finishes with a loose end`, () => {
    const context = workspace();
    vm.runInContext(`selectWireTool('${style}')`, context);
    assert.equal(vm.runInContext('wirePlacementArmed', context), true);
    assert.equal(vm.runInContext('draft', context), null);
    canvasClick(context, 40, 60);
    assert.equal(vm.runInContext('wirePlacementArmed', context), false);
    assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(draft.anchor)', context)), { x: 40, y: 60 });
    canvasClick(context, 100, 60);
    vm.runInContext('finishWire()', context);
    const wire = JSON.parse(vm.runInContext('JSON.stringify(model.wires[0])', context));
    assert.deepEqual(wire.from, { x: 40, y: 60 });
    assert.deepEqual(wire.to, { x: 100, y: 60 });
    assert.deepEqual(wire.points, []);
    assert.equal(wire.style, style);
    assert.equal(vm.runInContext('valid(model)', context), true);
    assert.equal(vm.runInContext('draft', context), null);
    assert.equal(vm.runInContext('history.length', context), 1);
    canvasClick(context, 160, 60);
    assert.equal(vm.runInContext('draft', context), null, 'placement is one-use');
  });
}

test('free wire can bend and join a port, including with snap enabled', () => {
  const context = workspace();
  context.fixture = { name: 'Port join', nodes: [{ id: 'lever', type: 'lever', x: 240, y: 0, rotation: 0 }], wires: [] };
  vm.runInContext("model=fixture;gridSnap=true;selectWireTool('neon')", context);
  canvasClick(context, 25, 25);
  canvasClick(context, 120, 48);
  vm.runInContext("clickPort('lever','out',0)", context);
  const wire = JSON.parse(vm.runInContext('JSON.stringify(model.wires[0])', context));
  assert.deepEqual(wire.from, { x: 24, y: 24 });
  assert.deepEqual(wire.points, [{ x: 120, y: 48 }]);
  assert.deepEqual(wire.to, { node: 'lever', side: 'out', index: 0 });
  assert.equal(wire.style, 'neon');
  assert.equal(vm.runInContext('valid(model)', context), true);
});

test('cancelling or clicking without a wire tool does not create a wire', () => {
  const context = workspace();
  canvasClick(context, 20, 20);
  assert.equal(vm.runInContext('draft', context), null);
  vm.runInContext("selectWireTool('normal');cancelWire()", context);
  canvasClick(context, 40, 40);
  assert.equal(vm.runInContext('draft', context), null);
  vm.runInContext("selectWireTool('neon')", context);
  canvasClick(context, 60, 60);
  vm.runInContext('cancelWire()', context);
  assert.equal(vm.runInContext('model.wires.length', context), 0);
  assert.equal(vm.runInContext('history.length', context), 0);
});

test('a selected old wire does not recolor or pull a new snapped start off grid', () => {
  const context = workspace();
  context.fixture = { name: 'Independent wire', nodes: [{ id: 'lever', type: 'lever', x: 0, y: 0, rotation: 0 }], wires: [
    { id: 'old', from: { node: 'lever', side: 'out', index: 0 }, to: { x: 160, y: 140 }, points: [], style: 'normal', color: 'White' },
  ] };
  vm.runInContext("model=fixture;gridSnap=true;selectOnly('wire','old');selectWireTool('neon')", context);
  assert.equal(vm.runInContext('model.wires[0].style', context), 'normal');
  canvasClick(context, 37, 97);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(draft.anchor)', context)), { x: 36, y: 96 });
});
