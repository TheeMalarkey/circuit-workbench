const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../dist/app.js'), 'utf8').split('bind();updateGridSnap();')[0];

function workspace() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true,
      classList: { add() {}, remove() {}, toggle() {} },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 375, height: 600 }),
      setPointerCapture() {},
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    structuredClone,
    crypto: { randomUUID: () => 'mobile-test' },
    document: { getElementById: element },
    localStorage: { getItem: () => null },
  });
  vm.runInContext(source + `
    let renderCount=0;renderSelection=()=>{renderCount++};renderWires=()=>{};paintTimingFaces=()=>{};
    applyView=()=>{};scheduleCamera=()=>{};view={x:0,y:0,scale:1};
  `, context);
  return context;
}

function touch(context, phase, id, x, y, { node = false, button = false } = {}) {
  const event = {
    type: `pointer${phase}`, pointerType: 'touch', pointerId: id, button: 0,
    clientX: x, clientY: y, shiftKey: false,
    target: { closest: selector => button && selector === 'button' ? {} : node && selector === '.node' ? {} : null },
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  context.event = event;
  if (phase === 'down') {
    vm.runInContext('onTouchPointerDown(event)', context);
    if (!event.stopped && !node && !button) vm.runInContext('onCanvasPointerDown(event)', context);
  } else vm.runInContext(phase === 'move' ? 'onPointerMove(event)' : 'onPointerUp(event)', context);
  return event;
}

function read(context, expression) { return JSON.parse(vm.runInContext(`JSON.stringify(${expression})`, context)); }

test('one-finger empty-canvas drag pans, while a tap stays still', () => {
  const context = workspace();
  touch(context, 'down', 1, 100, 100);
  assert.equal(read(context, 'renderCount'), 0, 'starting a pan does not rebuild an unselected circuit');
  touch(context, 'move', 1, 102, 101);
  assert.deepEqual(read(context, 'view'), { x: 0, y: 0, scale: 1 });
  touch(context, 'move', 1, 160, 145);
  assert.deepEqual(read(context, 'view'), { x: 60, y: 45, scale: 1 });
  touch(context, 'up', 1, 160, 145);
  assert.equal(read(context, 'gesture'), null);
  assert.equal(read(context, 'activeTouches.size'), 0);
});

test('pinch zoom anchors the midpoint, pans with both fingers, and continues with one', () => {
  const context = workspace();
  touch(context, 'down', 1, 100, 100);
  touch(context, 'down', 2, 200, 100);
  assert.equal(read(context, 'gesture.type'), 'pinch');
  touch(context, 'move', 2, 300, 100);
  assert.deepEqual(read(context, 'view'), { x: -100, y: -100, scale: 2 });
  touch(context, 'move', 1, 150, 100);
  touch(context, 'move', 2, 350, 100);
  assert.deepEqual(read(context, 'view'), { x: -50, y: -100, scale: 2 });
  touch(context, 'up', 1, 150, 100);
  assert.equal(read(context, 'gesture.type'), 'pan');
  touch(context, 'move', 2, 370, 100);
  assert.deepEqual(read(context, 'view'), { x: -30, y: -100, scale: 2 });
  touch(context, 'up', 2, 370, 100);
  assert.equal(read(context, 'gesture'), null);
});
test('two-finger zoom out and pan together keep the same world point under the midpoint', () => {
  const context = workspace();
  touch(context, 'down', 1, 100, 100);
  touch(context, 'down', 2, 300, 100);
  touch(context, 'move', 1, 180, 150);
  touch(context, 'move', 2, 280, 150);
  assert.deepEqual(read(context, 'view'), { x: 130, y: 100, scale: .5 });
  touch(context, 'move', 1, 210, 170);
  touch(context, 'move', 2, 310, 170);
  assert.deepEqual(read(context, 'view'), { x: 160, y: 120, scale: .5 });
});
test('a wheel zoom during an active pinch rebases the gesture instead of snapping back', () => {
  const context = workspace();
  touch(context, 'down', 1, 100, 100);
  touch(context, 'down', 2, 200, 100);
  touch(context, 'move', 2, 280, 100);
  vm.runInContext('zoomAt(.8,190,100);globalThis.afterWheel={...view}', context);
  touch(context, 'move', 2, 280, 100);
  assert.deepEqual(read(context, 'view'), read(context, 'afterWheel'));
  touch(context, 'move', 2, 300, 100);
  assert.ok(read(context, 'view.scale')>read(context, 'afterWheel.scale'));
});

test('pinching during a part drag cancels the unsaved movement', () => {
  const context = workspace();
  context.fixture = { name: 'Touch drag', nodes: [{ id: 'lever', type: 'lever', x: 0, y: 0, rotation: 0 }], wires: [] };
  vm.runInContext('model=fixture', context);
  touch(context, 'down', 1, 40, 40, { node: true });
  context.event = { button: 0, pointerType: 'touch', pointerId: 1, clientX: 40, clientY: 40, shiftKey: false,
    target: { closest: () => null }, stopPropagation() {} };
  vm.runInContext("startNodeDrag(event,'lever')", context);
  touch(context, 'move', 1, 88, 40);
  assert.equal(read(context, 'model.nodes[0].x'), 48);
  touch(context, 'down', 2, 200, 40);
  assert.equal(read(context, 'gesture.type'), 'pinch');
  assert.equal(read(context, 'model.nodes[0].x'), 0);
  touch(context, 'up', 1, 88, 40);
  touch(context, 'up', 2, 200, 40);
  assert.equal(read(context, 'history.length'), 0);
});

test('wire drawing and circuit buttons are not mistaken for canvas gestures', () => {
  const context = workspace();
  vm.runInContext("draft={anchor:{x:0,y:0},points:[],cursor:{x:0,y:0},style:'normal'}", context);
  touch(context, 'down', 1, 40, 60);
  assert.equal(read(context, 'draft.points.length'), 1);
  assert.equal(read(context, 'gesture'), null);
  assert.equal(touch(context, 'down', 2, 100, 60, { button: true }).stopped, true);
  assert.equal(read(context, 'gesture'), null);
  assert.deepEqual(read(context, 'view'), { x: 0, y: 0, scale: 1 });
  touch(context, 'up', 2, 100, 60);
  touch(context, 'up', 1, 40, 60);
});
