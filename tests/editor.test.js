'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

// Exercise the real property controls and state transitions without a browser dependency.
class Element {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.style = {};
    this.dataset = {};
    this.listeners = {};
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { children.forEach(child => this.appendChild(child)); }
  addEventListener(event, handler) { this.listeners[event] = handler; }
  fire(event) { this.listeners[event]?.({ target: this }); }
}

function setup(props) {
  const storage = new Map();
  const nodes = new Map();
  const timers = new Map();
  const context = vm.createContext({
    document: {
      querySelector(selector) {
        if (!nodes.has(selector)) nodes.set(selector, new Element());
        return nodes.get(selector);
      },
      createElement: tag => new Element(tag),
    },
    localStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key) },
    setInterval: handler => { const id = timers.size + 1; timers.set(id, handler); return id; },
    clearInterval: id => timers.delete(id),
    prompt: () => null,
  });
  const source = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  const hook = `
    let renders = 0;
    renderPreview = () => { renders++; };
    renderTree = () => {};
    renderProps = () => {};
    selectElement = path => { selectedPath = path; };
    showToast = () => {};
    globalThis.editor = {
      init(props) {
        jsonData = { namespace: 'test', panel: props };
        elements = []; flattenElements(jsonData, ''); selectedPath = 'panel';
        uiHistory = []; histIndex = -1; pushHistory(); saveDraft();
      },
      get data() { return jsonData; },
      get history() { return uiHistory; },
      get renders() { return renders; },
      dragOptions(options = {}) {
        device = options.device || 'phone'; uiScale = options.scale || 1;
        snapEnabled = !!options.snap; showHud = false;
      },
      addTemplate(name, obj) { jsonData[name] = obj; pushHistory(); saveDraft(); },
      layoutBoxes, beginDrag, moveDrag, endDrag,
      nudgeSelected, restoreHistory, createOffsetEditor, createSizeEditor,
      createAnchorSelect, createNumberInput, createBoolInput, createTextInput, createArrayInput
    };
  `;
  assert.match(source, /init\(\);\s*\}\)\(\);\s*$/);
  vm.runInContext(source.replace(/init\(\);\s*\}\)\(\);\s*$/, `${hook}\n})();`), context);
  const editor = context.editor;
  editor.init(structuredClone(props));
  return {
    editor, context, timers,
    data: () => JSON.parse(JSON.stringify(editor.data.panel)),
    draft: () => JSON.parse(storage.get('bjue.draft')).panel,
  };
}

function descendants(node, tagName) {
  return node.children.flatMap(child => [
    ...(child.tagName === tagName.toUpperCase() ? [child] : []),
    ...descendants(child, tagName),
  ]);
}

function assertSavedAndUndoable(state, before, after) {
  assert.deepEqual(state.data(), after);
  assert.deepEqual(state.draft(), after);
  assert.equal(state.editor.history.length, 2);
  assert.ok(state.editor.renders > 0, 'the preview is refreshed');
  state.editor.restoreHistory(-1);
  assert.deepEqual(state.data(), before);
  assert.deepEqual(state.draft(), before, 'reload must retain an undo');
  state.editor.restoreHistory(1);
  assert.deepEqual(state.data(), after);
  assert.deepEqual(state.draft(), after, 'reload must retain a redo');
}

test('keyboard nudges preserve percentage coordinates and the untouched axis', () => {
  const before = { type: 'panel', offset: ['50%', '10%'] };
  const state = setup(before);
  state.editor.nudgeSelected(1, 0);
  assertSavedAndUndoable(state, before, { ...before, offset: ['51%', '10%'] });
});

test('keyboard nudges preserve explicit pixel units and fractional steps', () => {
  const before = { type: 'panel', offset: ['12px', -3] };
  const state = setup(before);
  state.editor.nudgeSelected(-0.5, 10);
  assertSavedAndUndoable(state, before, { ...before, offset: ['11.5px', 7] });
});

const cases = [
  ['size', { size: [20, '50%'] }, e => e.createSizeEditor(e.data.panel, e.data.panel.size), 'input', '40', { size: [40, '50%'] }],
  ['default size', { type: 'panel' }, e => e.createSizeEditor(e.data.panel, ['100%', '100%']), 'input', '40', { type: 'panel', size: [40, '100%'] }],
  ['anchor', { anchor_from: 'center' }, e => e.createAnchorSelect('anchor_from', 'center', e.data.panel), 'select', 'top_left', { anchor_from: 'top_left' }],
  ['number', { alpha: 0.5 }, e => e.createNumberInput('alpha', 0.5, e.data.panel, 0, 1, 0.05), 'input', '0.75', { alpha: 0.75 }],
  ['boolean', { visible: true }, e => e.createBoolInput('visible', true, e.data.panel), 'input', false, { visible: false }],
  ['text', { text: 'old' }, e => e.createTextInput('text', 'old', e.data.panel), 'input', 'new', { text: 'new' }],
  ['variable', { $scale: 1 }, e => e.createTextInput('$scale', '1', e.data.panel), 'input', '2', { $scale: 2 }],
  ['array', { from: ['20px', 0] }, e => e.createArrayInput('from', e.data.panel.from, e.data.panel), 'input', '30px', { from: ['30px', 0] }],
];
for (const [name, before, create, tag, value, after] of cases) {
  test(`${name} property changes refresh, autosave, undo and redo`, () => {
    const state = setup(before);
    const input = descendants(create(state.editor), tag)[0];
    if (typeof value === 'boolean') input.checked = value;
    else input.value = value;
    input.fire('change');
    assertSavedAndUndoable(state, before, after);
  });
}

test('offset buttons and repeated presses save every committed edit', () => {
  const before = { type: 'panel', offset: ['50%', '10%'] };
  const state = setup(before);
  const buttons = descendants(state.editor.createOffsetEditor(state.editor.data.panel, before.offset), 'button');
  buttons[1].fire('click');
  assert.deepEqual(state.draft().offset, ['51%', '10%']);
  buttons[1].fire('pointerdown');
  for (const handler of state.timers.values()) handler();
  buttons[1].fire('pointercancel');
  assert.equal(state.timers.size, 0);
  assert.deepEqual(state.draft().offset, ['52%', '10%']);
  state.editor.restoreHistory(-1);
  assert.deepEqual(state.draft().offset, ['51%', '10%']);
});

test('direct offset edit saves without changing the other coordinate', () => {
  const before = { type: 'panel', offset: [1, '25%'] };
  const state = setup(before);
  state.context.prompt = () => '9px';
  const values = descendants(state.editor.createOffsetEditor(state.editor.data.panel, before.offset), 'span');
  values[0].fire('click');
  assertSavedAndUndoable(state, before, { ...before, offset: ['9px', '25%'] });
});

test('default offset can be edited and cancel leaves history unchanged', () => {
  const before = { type: 'panel' };
  const state = setup(before);
  const values = descendants(state.editor.createOffsetEditor(state.editor.data.panel, [0, 0]), 'span');
  values[0].fire('click');
  assert.equal(state.editor.history.length, 1);
  assert.deepEqual(state.data(), before);
  state.context.prompt = () => '4';
  values[0].fire('click');
  assertSavedAndUndoable(state, before, { ...before, offset: [4, 0] });
});

test('editing after undo discards the redo branch and persists the new state', () => {
  const state = setup({ layer: 1 });
  const change = value => {
    const input = descendants(state.editor.createNumberInput('layer', state.editor.data.panel.layer, state.editor.data.panel, -100, 100, 1), 'input')[0];
    input.value = String(value); input.fire('change');
  };
  change(2); change(3); state.editor.restoreHistory(-1); change(4);
  state.editor.restoreHistory(1);
  assert.equal(state.data().layer, 4);
  assert.equal(state.draft().layer, 4);
  assert.equal(state.editor.history.length, 3);
});

test('nudges do not truncate expressions or alter an untouched expression', () => {
  const before = { type: 'panel', offset: ['50% + 2px', '10%'] };
  const state = setup(before);
  state.editor.nudgeSelected(1, 0);
  assert.deepEqual(state.data(), before);
  assert.deepEqual(state.draft(), before);
  assert.equal(state.editor.history.length, 1);
  state.editor.nudgeSelected(0, 1);
  assert.deepEqual(state.draft().offset, ['50% + 2px', '11%']);
});

test('no-op changes retain the redo branch', () => {
  const state = setup({ offset: [1, 2] });
  state.editor.nudgeSelected(1, 0);
  state.editor.restoreHistory(-1);
  state.editor.nudgeSelected(0, 0);
  state.editor.restoreHistory(1);
  assert.deepEqual(state.draft().offset, [2, 2]);
});

test('empty and non-finite number inputs cannot save null into the draft', () => {
  const state = setup({ alpha: 0.5 });
  const input = descendants(state.editor.createNumberInput('alpha', 0.5, state.editor.data.panel, 0, 1, 0.05), 'input')[0];
  for (const value of ['', 'Infinity', 'invalid']) {
    input.value = value; input.fire('change');
    assert.equal(state.data().alpha, 0.5);
    assert.equal(state.draft().alpha, 0.5);
    assert.equal(state.editor.history.length, 1);
  }
});

function drag(state, path, dx, dy, options = {}) {
  state.editor.dragOptions(options);
  const box = state.editor.layoutBoxes().find(box => box.path === path);
  assert.ok(box, 'the target must be a real laid-out box');
  state.editor.beginDrag({ clientX: 100, clientY: 100, target: {}, preventDefault() {} }, box);
  state.editor.moveDrag({ clientX: 100 + dx, clientY: 100 + dy, altKey: false, shiftKey: false });
  state.editor.endDrag();
}

test('root percentage dragging converts UI pixels using screen dimensions', () => {
  const before = { type: 'panel', size: [20, 10], offset: ['50%', '10%'] };
  const state = setup(before);
  drag(state, 'panel', 52, 24);
  assertSavedAndUndoable(state, before, { ...before, offset: ['60%', '20%'] });
});

test('child percentage dragging uses its own parent and preview scale', () => {
  const before = { type: 'panel', size: [200, 80], controls: [{ child: { type: 'label', offset: ['50%', '10%'] } }] };
  const state = setup(before);
  drag(state, 'panel.controls[0].child', 20, 8, { scale: 2 });
  const after = structuredClone(before); after.controls[0].child.offset = ['55%', '15%'];
  assertSavedAndUndoable(state, before, after);
});

test('dragging preserves pixel strings and does not round an untouched percentage', () => {
  const before = { type: 'panel', size: [20, 10], offset: ['20px', '10.25%'] };
  const state = setup(before);
  drag(state, 'panel', 2, 0);
  assertSavedAndUndoable(state, before, { ...before, offset: ['22px', '10.25%'] });
});

test('percentage dragging applies snapping in pixels, then converts back', () => {
  const before = { type: 'panel', size: [20, 10], anchor_from: 'top_left', anchor_to: 'top_left', offset: ['1%', '10%'] };
  const state = setup(before);
  drag(state, 'panel', -4, 0, { snap: true });
  assertSavedAndUndoable(state, before, { ...before, offset: ['0%', '10%'] });
  assert.equal(state.editor.layoutBoxes()[0].x, 0);
});

test('a click or zero-distance pointer move cannot snap or rewrite offsets', () => {
  const before = { type: 'panel', size: [20, 10], anchor_from: 'top_left', offset: ['0.1%', '10.25%'] };
  const state = setup(before);
  drag(state, 'panel', 0, 0, { snap: true });
  assert.deepEqual(state.data(), before);
  assert.deepEqual(state.draft(), before);
  assert.equal(state.editor.history.length, 1);
});

test('repeated drags use the saved value and numeric offsets still move in pixels', () => {
  const state = setup({ type: 'panel', offset: ['50%', 10] });
  drag(state, 'panel', -52, -2);
  drag(state, 'panel', 26, 3);
  assert.deepEqual(state.draft().offset, ['45%', 11]);
  assert.equal(state.editor.history.length, 3);
  state.editor.restoreHistory(-1);
  assert.deepEqual(state.draft().offset, ['40%', 8]);
});

test('zero-sized percentage parents and unsupported expressions are not corrupted', () => {
  const zero = { type: 'panel', size: [0, 80], controls: [{ child: { type: 'label', offset: ['50%', 0] } }] };
  const state = setup(zero);
  drag(state, 'panel.controls[0].child', 10, 0);
  assert.deepEqual(state.data(), zero);
  assert.deepEqual(state.draft(), zero);
  assert.equal(state.editor.history.length, 1);
  const expression = { type: 'panel', offset: ['50% + 2px', 0] };
  const expressionState = setup(expression);
  drag(expressionState, 'panel', 10, 0);
  assert.deepEqual(expressionState.data(), expression);
  assert.equal(expressionState.editor.history.length, 1);
});

test('dragging an inherited control writes its own raw offset, not the resolved copy', () => {
  const before = { type: 'panel', size: [200, 80], controls: [{ 'child@test.template': { offset: ['50%', '10%'] } }] };
  const state = setup(before);
  state.editor.addTemplate('template', { type: 'label', size: [20, 10], offset: [0, 0] });
  drag(state, 'panel.controls[0].child@test.template', 10, 4);
  assert.deepEqual(state.draft().controls[0]['child@test.template'].offset, ['55%', '15%']);
  assert.deepEqual(JSON.parse(JSON.stringify(state.editor.data.template.offset)), [0, 0]);
  state.editor.restoreHistory(-1);
  assert.deepEqual(state.draft(), before);
});

test('a drag returned to its start leaves no extra undo step or changed draft', () => {
  const before = { type: 'panel', size: [20, 10], offset: ['50%', '10%'] };
  const state = setup(before);
  state.editor.dragOptions();
  const box = state.editor.layoutBoxes()[0];
  state.editor.beginDrag({ clientX: 100, clientY: 100, target: { setPointerCapture() { throw new Error('not captured'); } }, preventDefault() {} }, box);
  state.editor.moveDrag({ clientX: 152, clientY: 124 });
  state.editor.moveDrag({ clientX: 100, clientY: 100 });
  state.editor.endDrag();
  state.editor.endDrag();
  assert.deepEqual(state.data(), before);
  assert.deepEqual(state.draft(), before);
  assert.equal(state.editor.history.length, 1);
});
