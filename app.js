(() => {
'use strict';

// ===== State =====
let jsonData = null;
let elements = [];       // flat list of {path, name, type, props, children}
let selectedPath = null;
let zoomLevel = 100;
let nudgeStep = 1;

// ===== DOM refs =====
const $ = s => document.querySelector(s);
const inputSection = $('#input-section');
const editorSection = $('#editor-section');
const jsonInput = $('#json-input');
const parseError = $('#parse-error');
const elementTree = $('#element-tree');
const propsContainer = $('#props-container');
const propsTitle = $('#props-title');
const previewScreen = $('#preview-screen');
const exportModal = $('#export-modal');
const jsonOutput = $('#json-output');

// ===== Example JSON =====
const EXAMPLE_JSON = {
  "namespace": "scoreboard",
  "scoreboard_sidebar_score": { "visible": false },
  "shimmer_sweep": {
    "anim_type": "offset", "easing": "linear", "duration": 3.5,
    "from": ["-20px", 0], "to": ["200px", 0],
    "next": "@scoreboard.shimmer_sweep"
  },
  "scoreboard_sidebar": {
    "type": "panel", "size": ["100%", "100%"],
    "controls": [{
      "default": {
        "type": "stack_panel", "size": ["100%cm", "100%c"],
        "offset": [-1, 0], "anchor_from": "right_middle", "anchor_to": "right_middle",
        "controls": [{
          "lines": {
            "type": "image", "texture": "#texture", "alpha": 0.35,
            "size": ["100%cm+3px", "100%c+5px"],
            "controls": [
              {
                "logo": {
                  "type": "panel", "size": [64, 10], "offset": [0, 3],
                  "anchor_from": "top_middle", "anchor_to": "top_middle", "layer": 1,
                  "controls": [
                    { "logo_image": { "type": "image", "texture": "textures/ui/scoreboard/logo_scoreboard", "size": ["100%", "100%"], "uv_size": [306, 66], "layer": 1 } },
                    { "shimmer_clip": {
                      "type": "panel", "size": [54, 10], "offset": [0, 0], "clips_children": true, "layer": 2,
                      "controls": [{ "shimmer": { "type": "image", "texture": "textures/ui/scoreboard/shimmer", "size": [18, 14], "uv_size": [80, 66], "anims": ["@scoreboard.shimmer_sweep"] } }]
                    }}
                  ]
                }
              },
              {
                "lists": {
                  "type": "panel", "anchor_from": "bottom_left", "anchor_to": "bottom_left",
                  "offset": [4, -3], "size": ["100%cm", "100%c"], "min_size": [90, "100%c"],
                  "controls": [{
                    "players": {
                      "type": "stack_panel", "anchor_from": "top_left", "anchor_to": "top_left",
                      "size": ["100%cm", "100%c"], "orientation": "vertical",
                      "collection_name": "scoreboard_players"
                    }
                  }]
                }
              }
            ]
          }
        }]
      }
    }]
  }
};

// ===== Anchor values =====
const ANCHORS = [
  'top_left', 'top_middle', 'top_right',
  'left_middle', 'center', 'right_middle',
  'bottom_left', 'bottom_middle', 'bottom_right'
];

// ===== Init =====
function init() {
  $('#btn-parse').addEventListener('click', parseJSON);
  $('#btn-load-example').addEventListener('click', loadExample);
  $('#btn-back').addEventListener('click', goBack);
  $('#btn-export').addEventListener('click', showExport);
  $('#btn-close-modal').addEventListener('click', () => exportModal.classList.remove('visible'));
  $('#btn-copy').addEventListener('click', copyJSON);
  $('#btn-download').addEventListener('click', downloadJSON);
  $('#btn-zoom-in').addEventListener('click', () => setZoom(zoomLevel + 25));
  $('#btn-zoom-out').addEventListener('click', () => setZoom(zoomLevel - 25));
  $('#tree-search').addEventListener('input', filterTree);

  // Tabs
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // Close modal on overlay click
  exportModal.addEventListener('click', e => {
    if (e.target === exportModal) exportModal.classList.remove('visible');
  });

  // Keyboard: Escape closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && exportModal.classList.contains('visible')) exportModal.classList.remove('visible');
  });

  // Preview toolbar
  const deviceSel = $('#device-select');
  if (deviceSel) deviceSel.addEventListener('change', () => { device = deviceSel.value; renderPreview(); });
  const sample = $('#sample-text');
  if (sample) sample.addEventListener('input', () => { sampleText = sample.value; renderPreview(); });
  bindToggle('#opt-hud', v => { showHud = v; });
  bindToggle('#opt-grid', v => { showGrid = v; });
  bindToggle('#opt-labels', v => { showLabels = v; });
  bindToggle('#opt-snap', v => { snapEnabled = v; });

  // Screenshot backdrop: pick a file, or just drop one on the preview.
  const shotInput = $('#shot-input');
  if (shotInput) shotInput.addEventListener('change', () => loadShot(shotInput.files[0]));
  const fade = $('#shot-fade');
  if (fade) fade.addEventListener('input', () => { shotFade = fade.value / 100; renderPreview(); });
  const clearShot = $('#btn-shot-clear');
  if (clearShot) clearShot.addEventListener('click', () => setShot(null));
  const viewport = $('#preview-viewport');
  if (viewport) {
    viewport.addEventListener('dragover', e => { e.preventDefault(); viewport.classList.add('drop-target'); });
    viewport.addEventListener('dragleave', () => viewport.classList.remove('drop-target'));
    viewport.addEventListener('drop', e => {
      e.preventDefault();
      viewport.classList.remove('drop-target');
      const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) loadShot(file);
    });
  }

  $('#btn-copy-offset').addEventListener('click', copyOffset);
  $('#btn-copy-element').addEventListener('click', copyElement);
  $('#btn-reset-offset').addEventListener('click', resetOffset);

  // Dragging boxes straight on the preview
  window.addEventListener('pointermove', moveDrag);
  window.addEventListener('pointerup', endDrag);
  window.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => { if (!editorSection.hidden) renderPreview(); });

  // Keyboard: arrows nudge the selection, Ctrl+Z / Ctrl+Shift+Z walk the history
  document.addEventListener('keydown', e => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing) return;
    const step = e.shiftKey ? nudgeStep * 10 : nudgeStep;
    if (e.key === 'ArrowLeft')  { e.preventDefault(); nudgeSelected(-step, 0); }
    if (e.key === 'ArrowRight') { e.preventDefault(); nudgeSelected(step, 0); }
    if (e.key === 'ArrowUp')    { e.preventDefault(); nudgeSelected(0, -step); }
    if (e.key === 'ArrowDown')  { e.preventDefault(); nudgeSelected(0, step); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      restoreHistory(e.shiftKey ? 1 : -1);
    }
  });

  // Bring back whatever was open last time: a lost draft costs more than a stale one.
  if (loadDraft()) showToast('Restored your last draft');

  // Auto-activate first tab panel on mobile
  switchTab('tree');
}

// ===== Screenshot backdrop =====
function loadShot(file) {
  if (!file || !/^image\//.test(file.type)) { showToast('That is not an image'); return; }
  const reader = new FileReader();
  reader.onload = () => setShot(reader.result);
  reader.readAsDataURL(file);
}

function setShot(url) {
  if (shotUrl && shotUrl.startsWith('blob:')) URL.revokeObjectURL(shotUrl);
  shotUrl = url;
  const has = !!url;
  const wrap = $('#shot-fade-wrap');
  const clear = $('#btn-shot-clear');
  if (wrap) wrap.hidden = !has;
  if (clear) clear.hidden = !has;
  renderPreview();
  showToast(has ? 'Screenshot loaded — line elements up against it' : 'Screenshot cleared');
}

// ===== Clipboard helpers =====
function selectedElement() {
  return elements.find(x => x.path === selectedPath) || null;
}

function copyOffset() {
  const el = selectedElement();
  if (!el || !Array.isArray(el.obj.offset)) { showToast('Select an element with an offset'); return; }
  const text = JSON.stringify(el.obj.offset);
  navigator.clipboard.writeText(text).then(() => showToast('Copied ' + text));
}

function copyElement() {
  const el = selectedElement();
  if (!el) { showToast('Select an element first'); return; }
  const text = JSON.stringify({ [el.name]: el.obj }, null, 2);
  navigator.clipboard.writeText(text).then(() => showToast('Copied ' + el.name));
}

function resetOffset() {
  const el = selectedElement();
  if (!el || !Array.isArray(el.obj.offset)) { showToast('Select an element with an offset'); return; }
  setOffset(el.obj, 0, 0);
  pushHistory();
  renderPreview();
  renderProps(el.obj, el.name, el.type);
  saveDraft();
  showToast('Offset reset to 0, 0');
}

function bindToggle(sel, apply) {
  const box = $(sel);
  if (!box) return;
  box.addEventListener('change', () => { apply(box.checked); renderPreview(); });
}

// ===== Tab switching =====
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.panel[data-panel]').forEach(p => p.classList.toggle('active-panel', p.dataset.panel === tab));

  // The preview scales itself to the panel width, and a hidden panel is zero wide: without
  // this redraw the stage keeps the scale it had while invisible, and every drag lands
  // somewhere other than where the cursor is.
  if (tab === 'preview' && jsonData) renderPreview();
}

// ===== Parse JSON =====
function parseJSON() {
  const raw = jsonInput.value.trim();
  if (!raw) { showError('Please paste JSON UI code first.'); return; }

  try {
    jsonData = JSON.parse(raw);
  } catch (e) {
    showError('Invalid JSON: ' + e.message);
    return;
  }

  parseError.hidden = true;
  elements = [];
  flattenElements(jsonData, '');
  inputSection.hidden = true;
  editorSection.hidden = false;
  renderTree();
  renderPreview();
  uiHistory = [];
  histIndex = -1;
  pushHistory();
  saveDraft();
}

function showError(msg) {
  parseError.textContent = msg;
  parseError.hidden = false;
}

function loadExample() {
  jsonInput.value = JSON.stringify(EXAMPLE_JSON, null, 2);
}

function goBack() {
  editorSection.hidden = true;
  inputSection.hidden = false;
  // Update textarea with current state
  if (jsonData) jsonInput.value = JSON.stringify(jsonData, null, 2);
}

// ===== Flatten JSON UI into element list =====
function flattenElements(obj, parentPath) {
  if (!obj || typeof obj !== 'object') return;

  for (const [key, val] of Object.entries(obj)) {
    if (key === 'namespace') continue;
    if (typeof val !== 'object' || val === null) continue;

    // Array items in controls
    if (Array.isArray(val)) continue;

    const path = parentPath ? `${parentPath}.${key}` : key;
    const type = detectType(val);

    elements.push({ path, name: key, type, obj: val });

    // Recurse into controls array
    if (Array.isArray(val.controls)) {
      val.controls.forEach((ctrl, i) => {
        if (typeof ctrl === 'object' && ctrl !== null) {
          for (const [cName, cVal] of Object.entries(ctrl)) {
            if (typeof cVal === 'object' && cVal !== null) {
              const cPath = `${path}.controls[${i}].${cName}`;
              const cType = detectType(cVal);
              elements.push({ path: cPath, name: cName, type: cType, obj: cVal });
              // Recurse deeper
              if (Array.isArray(cVal.controls)) {
                flattenControlsRecursive(cVal.controls, cPath);
              }
            }
          }
        }
      });
    }
  }
}

function flattenControlsRecursive(controls, parentPath) {
  controls.forEach((ctrl, i) => {
    if (typeof ctrl === 'object' && ctrl !== null) {
      for (const [cName, cVal] of Object.entries(ctrl)) {
        if (typeof cVal === 'object' && cVal !== null) {
          const cPath = `${parentPath}.controls[${i}].${cName}`;
          const cType = detectType(cVal);
          elements.push({ path: cPath, name: cName, type: cType, obj: cVal });
          if (Array.isArray(cVal.controls)) {
            flattenControlsRecursive(cVal.controls, cPath);
          }
        }
      }
    }
  });
}

function detectType(obj) {
  if (obj.type) return obj.type;
  if (obj.anim_type) return 'animation';
  return 'other';
}

// ===== Build nested tree structure =====
function buildTree(obj, parentPath) {
  const nodes = [];
  for (const [key, val] of Object.entries(obj)) {
    if (key === 'namespace') continue;
    if (typeof val !== 'object' || val === null || Array.isArray(val)) continue;

    const path = parentPath ? `${parentPath}.${key}` : key;
    const type = detectType(val);
    const children = [];

    if (Array.isArray(val.controls)) {
      val.controls.forEach((ctrl, i) => {
        if (typeof ctrl === 'object' && ctrl !== null) {
          for (const [cName, cVal] of Object.entries(ctrl)) {
            if (typeof cVal === 'object' && cVal !== null) {
              const cPath = `${path}.controls[${i}].${cName}`;
              const cType = detectType(cVal);
              const grandChildren = [];
              if (Array.isArray(cVal.controls)) {
                grandChildren.push(...buildControlsTree(cVal.controls, cPath));
              }
              children.push({ path: cPath, name: cName, type: cType, obj: cVal, children: grandChildren });
            }
          }
        }
      });
    }

    nodes.push({ path, name: key, type, obj: val, children });
  }
  return nodes;
}

function buildControlsTree(controls, parentPath) {
  const nodes = [];
  controls.forEach((ctrl, i) => {
    if (typeof ctrl === 'object' && ctrl !== null) {
      for (const [cName, cVal] of Object.entries(ctrl)) {
        if (typeof cVal === 'object' && cVal !== null) {
          const cPath = `${parentPath}.controls[${i}].${cName}`;
          const cType = detectType(cVal);
          const children = [];
          if (Array.isArray(cVal.controls)) {
            children.push(...buildControlsTree(cVal.controls, cPath));
          }
          nodes.push({ path: cPath, name: cName, type: cType, obj: cVal, children });
        }
      }
    }
  });
  return nodes;
}

// ===== Render Tree =====
function renderTree() {
  const tree = buildTree(jsonData, '');
  elementTree.innerHTML = '';
  tree.forEach(node => elementTree.appendChild(createTreeNode(node, 0)));
}

function createTreeNode(node, depth) {
  const el = document.createElement('div');
  el.className = 'tree-node';
  el.dataset.path = node.path;
  el.dataset.name = node.name.toLowerCase();

  const hasChildren = node.children && node.children.length > 0;

  const label = document.createElement('div');
  label.className = 'tree-label';
  if (selectedPath === node.path) label.classList.add('selected');

  const toggle = document.createElement('span');
  toggle.className = 'tree-toggle' + (hasChildren ? '' : ' empty');
  toggle.textContent = '\u25B6';
  if (hasChildren && depth < 1) toggle.classList.add('open');

  const typeBadge = document.createElement('span');
  const tClass = getTypeClass(node.type);
  typeBadge.className = 'tree-type ' + tClass;
  typeBadge.textContent = shortType(node.type);

  const name = document.createElement('span');
  name.className = 'tree-name';
  name.textContent = node.name;

  label.append(toggle, typeBadge, name);

  label.addEventListener('click', (e) => {
    // Toggle expand
    if (hasChildren && (e.target === toggle || e.target === label)) {
      const childDiv = el.querySelector(':scope > .tree-children');
      if (childDiv) {
        childDiv.classList.toggle('collapsed');
        toggle.classList.toggle('open');
      }
    }
    selectElement(node.path, node.obj, node.name, node.type);
  });

  el.appendChild(label);

  if (hasChildren) {
    const childContainer = document.createElement('div');
    childContainer.className = 'tree-children' + (depth >= 1 ? ' collapsed' : '');
    node.children.forEach(child => childContainer.appendChild(createTreeNode(child, depth + 1)));
    el.appendChild(childContainer);
  }

  return el;
}

function getTypeClass(type) {
  const map = {
    'panel': 't-panel', 'label': 't-label', 'image': 't-image',
    'button': 't-button', 'stack_panel': 't-stack', 'grid': 't-grid',
    'custom': 't-custom', 'screen': 't-screen', 'factory': 't-factory',
    'animation': 't-anim'
  };
  return map[type] || 't-other';
}

function shortType(type) {
  const map = {
    'stack_panel': 'stack', 'animation': 'anim'
  };
  return map[type] || type;
}

// ===== Filter Tree =====
function filterTree(e) {
  const q = e.target.value.toLowerCase().trim();
  document.querySelectorAll('.tree-node').forEach(node => {
    const name = node.dataset.name;
    const match = !q || name.includes(q);
    node.querySelector(':scope > .tree-label').classList.toggle('hidden-by-search', !match);
    // Expand parents if child matches
    if (match && q) {
      let parent = node.parentElement;
      while (parent) {
        if (parent.classList.contains('tree-children')) {
          parent.classList.remove('collapsed');
          const tog = parent.previousElementSibling?.querySelector('.tree-toggle');
          if (tog) tog.classList.add('open');
        }
        parent = parent.parentElement;
      }
    }
  });
}

// ===== Select Element =====
function selectElement(path, obj, name, type) {
  selectedPath = path;

  // Update tree selection
  document.querySelectorAll('.tree-label.selected').forEach(l => l.classList.remove('selected'));
  const treeNode = document.querySelector(`.tree-node[data-path="${CSS.escape(path)}"] > .tree-label`);
  if (treeNode) treeNode.classList.add('selected');

  // Redraw the preview so the selection is highlighted and the status line below it shows
  // this element's box: distance to every screen edge is what you are actually after.
  renderPreview();

  propsTitle.textContent = name;
  renderProps(obj, name, type);

  // Switch to props tab on mobile
  if (window.innerWidth <= 768) switchTab('props');
}

// ===== Render Properties =====
function renderProps(obj, name, type) {
  propsContainer.innerHTML = '';

  // Type info
  if (obj.type || obj.anim_type) {
    const info = createPropGroup('Element Info');
    if (obj.type) info.appendChild(createReadonly('type', obj.type));
    if (obj.anim_type) info.appendChild(createReadonly('anim_type', obj.anim_type));
    if (obj.texture) info.appendChild(createReadonly('texture', obj.texture));
    propsContainer.appendChild(info);
  }

  // Position
  const hasPosition = obj.offset || obj.anchor_from || obj.anchor_to;
  if (hasPosition || obj.type) {
    const posGroup = createPropGroup('Position');

    // Offset with nudge
    if (obj.offset || obj.type) {
      const offset = obj.offset || [0, 0];
      posGroup.appendChild(createOffsetEditor(obj, offset));
    }

    // Anchors
    if (obj.anchor_from !== undefined || obj.type) {
      posGroup.appendChild(createAnchorSelect('anchor_from', obj.anchor_from || 'center', obj));
    }
    if (obj.anchor_to !== undefined || obj.type) {
      posGroup.appendChild(createAnchorSelect('anchor_to', obj.anchor_to || 'center', obj));
    }

    propsContainer.appendChild(posGroup);
  }

  // Size
  if (obj.size || obj.type) {
    const sizeGroup = createPropGroup('Size');
    const size = obj.size || ['100%', '100%'];
    sizeGroup.appendChild(createSizeEditor(obj, size));
    if (obj.min_size) {
      sizeGroup.appendChild(createArrayInput('min_size', obj.min_size, obj));
    }
    if (obj.max_size) {
      sizeGroup.appendChild(createArrayInput('max_size', obj.max_size, obj));
    }
    if (obj.uv_size) {
      sizeGroup.appendChild(createArrayInput('uv_size', obj.uv_size, obj));
    }
    propsContainer.appendChild(sizeGroup);
  }

  // Appearance
  const hasAppearance = obj.alpha !== undefined || obj.layer !== undefined || obj.visible !== undefined || obj.color !== undefined;
  if (hasAppearance) {
    const appGroup = createPropGroup('Appearance');
    if (obj.alpha !== undefined) {
      appGroup.appendChild(createNumberInput('alpha', obj.alpha, obj, 0, 1, 0.05));
    }
    if (obj.layer !== undefined) {
      appGroup.appendChild(createNumberInput('layer', obj.layer, obj, -100, 100, 1));
    }
    if (obj.visible !== undefined) {
      appGroup.appendChild(createBoolInput('visible', obj.visible, obj));
    }
    if (obj.enabled !== undefined) {
      appGroup.appendChild(createBoolInput('enabled', obj.enabled, obj));
    }
    if (obj.color !== undefined) {
      appGroup.appendChild(createReadonly('color', JSON.stringify(obj.color)));
    }
    propsContainer.appendChild(appGroup);
  }

  // Animation
  if (obj.anim_type) {
    const animGroup = createPropGroup('Animation');
    if (obj.easing) animGroup.appendChild(createTextInput('easing', obj.easing, obj));
    if (obj.duration !== undefined) animGroup.appendChild(createNumberInput('duration', obj.duration, obj, 0, 60, 0.1));
    if (obj.from) animGroup.appendChild(createArrayInput('from', obj.from, obj));
    if (obj.to) animGroup.appendChild(createArrayInput('to', obj.to, obj));
    if (obj.next) animGroup.appendChild(createReadonly('next', obj.next));
    propsContainer.appendChild(animGroup);
  }

  // Text
  if (obj.type === 'label') {
    const textGroup = createPropGroup('Text');
    if (obj.text !== undefined) textGroup.appendChild(createTextInput('text', obj.text, obj));
    if (obj.text_alignment) textGroup.appendChild(createTextInput('text_alignment', obj.text_alignment, obj));
    if (obj.shadow !== undefined) textGroup.appendChild(createBoolInput('shadow', obj.shadow, obj));
    propsContainer.appendChild(textGroup);
  }

  // Clips
  if (obj.clips_children !== undefined) {
    const miscGroup = createPropGroup('Misc');
    miscGroup.appendChild(createBoolInput('clips_children', obj.clips_children, obj));
    propsContainer.appendChild(miscGroup);
  }

  // Other raw properties
  const knownKeys = new Set([
    'type', 'anim_type', 'texture', 'offset', 'anchor_from', 'anchor_to',
    'size', 'min_size', 'max_size', 'uv_size', 'alpha', 'layer', 'visible',
    'enabled', 'color', 'easing', 'duration', 'from', 'to', 'next',
    'text', 'text_alignment', 'shadow', 'clips_children', 'controls',
    'bindings', 'anims', 'factory', 'collection_name', 'orientation',
    'propagate_alpha', '$prefix', 'content_alignment', 'spacing'
  ]);

  const otherKeys = Object.keys(obj).filter(k => !knownKeys.has(k) && !k.startsWith('$'));
  if (otherKeys.length > 0) {
    const otherGroup = createPropGroup('Other Properties');
    otherKeys.forEach(key => {
      const val = obj[key];
      if (typeof val === 'string' || typeof val === 'number') {
        otherGroup.appendChild(createTextInput(key, String(val), obj));
      } else if (typeof val === 'boolean') {
        otherGroup.appendChild(createBoolInput(key, val, obj));
      } else {
        otherGroup.appendChild(createReadonly(key, JSON.stringify(val)));
      }
    });
    propsContainer.appendChild(otherGroup);
  }

  // Variables ($prefix etc)
  const varKeys = Object.keys(obj).filter(k => k.startsWith('$'));
  if (varKeys.length > 0) {
    const varGroup = createPropGroup('Variables');
    varKeys.forEach(key => {
      const val = obj[key];
      if (typeof val === 'string' || typeof val === 'number') {
        varGroup.appendChild(createTextInput(key, String(val), obj));
      } else {
        varGroup.appendChild(createReadonly(key, JSON.stringify(val)));
      }
    });
    propsContainer.appendChild(varGroup);
  }
}

// ===== Property Editors =====

function createPropGroup(title) {
  const div = document.createElement('div');
  div.className = 'prop-group';
  const h = document.createElement('div');
  h.className = 'prop-group-title';
  h.textContent = title;
  div.appendChild(h);
  return div;
}

function createReadonly(label, value) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  row.innerHTML = `<span class="prop-label">${esc(label)}</span><span class="prop-input" style="background:transparent;border:none;color:var(--text-dim)">${esc(String(value))}</span>`;
  return row;
}

function createOffsetEditor(obj, offset) {
  const wrap = document.createElement('div');

  // Step selector
  const stepRow = document.createElement('div');
  stepRow.className = 'prop-step';
  stepRow.innerHTML = `<label>Step:</label>`;
  const stepSel = document.createElement('select');
  stepSel.className = 'step-select';
  [0.5, 1, 2, 5, 10, 20].forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v + 'px';
    if (v === nudgeStep) o.selected = true;
    stepSel.appendChild(o);
  });
  stepSel.addEventListener('change', () => { nudgeStep = parseFloat(stepSel.value); });
  stepRow.appendChild(stepSel);
  wrap.appendChild(stepRow);

  const parseVal = v => {
    if (typeof v === 'number') return v;
    const n = parseFloat(String(v));
    return isNaN(n) ? 0 : n;
  };

  const getSuffix = v => {
    if (typeof v === 'number') return '';
    const m = String(v).match(/[a-z%]+$/i);
    return m ? m[0] : '';
  };

  let xVal = parseVal(offset[0]);
  let yVal = parseVal(offset[1]);
  let xSuffix = getSuffix(offset[0]);
  let ySuffix = getSuffix(offset[1]);

  const update = () => {
    obj.offset = [
      xSuffix ? xVal + xSuffix : xVal,
      ySuffix ? yVal + ySuffix : yVal
    ];
    xDisp.textContent = formatVal(xVal, xSuffix);
    yDisp.textContent = formatVal(yVal, ySuffix);
    renderPreview();
  };

  const formatVal = (v, s) => (Number.isInteger(v) ? v : v.toFixed(1)) + s;

  // X row
  const xRow = document.createElement('div');
  xRow.className = 'prop-row';
  xRow.innerHTML = '<span class="prop-label">offset X</span>';
  const xNudge = document.createElement('div');
  xNudge.className = 'nudge-row';
  xNudge.style.flex = '1';
  xNudge.style.display = 'flex';
  xNudge.style.alignItems = 'center';
  xNudge.style.gap = '0.3rem';

  const xMinus = createNudgeBtn('\u25C0', () => { xVal -= nudgeStep; update(); });
  const xDisp = document.createElement('span');
  xDisp.className = 'nudge-val';
  xDisp.textContent = formatVal(xVal, xSuffix);
  xDisp.addEventListener('click', () => {
    const input = prompt('Offset X:', obj.offset[0]);
    if (input !== null) {
      const parsed = parseFloat(input);
      if (!isNaN(parsed)) { xVal = parsed; xSuffix = getSuffix(input); update(); }
    }
  });
  const xPlus = createNudgeBtn('\u25B6', () => { xVal += nudgeStep; update(); });
  xNudge.append(xMinus, xDisp, xPlus);
  xRow.appendChild(xNudge);
  wrap.appendChild(xRow);

  // Y row
  const yRow = document.createElement('div');
  yRow.className = 'prop-row';
  yRow.innerHTML = '<span class="prop-label">offset Y</span>';
  const yNudge = document.createElement('div');
  yNudge.style.flex = '1';
  yNudge.style.display = 'flex';
  yNudge.style.alignItems = 'center';
  yNudge.style.gap = '0.3rem';

  const yMinus = createNudgeBtn('\u25B2', () => { yVal -= nudgeStep; update(); });
  const yDisp = document.createElement('span');
  yDisp.className = 'nudge-val';
  yDisp.textContent = formatVal(yVal, ySuffix);
  yDisp.addEventListener('click', () => {
    const input = prompt('Offset Y:', obj.offset[1]);
    if (input !== null) {
      const parsed = parseFloat(input);
      if (!isNaN(parsed)) { yVal = parsed; ySuffix = getSuffix(input); update(); }
    }
  });
  const yPlus = createNudgeBtn('\u25BC', () => { yVal += nudgeStep; update(); });
  yNudge.append(yMinus, yDisp, yPlus);
  yRow.appendChild(yNudge);
  wrap.appendChild(yRow);

  return wrap;
}

function createNudgeBtn(text, handler) {
  const btn = document.createElement('button');
  btn.className = 'nudge-btn';
  btn.textContent = text;
  btn.addEventListener('click', handler);
  // Long press for continuous nudge
  let interval;
  btn.addEventListener('pointerdown', () => {
    interval = setInterval(handler, 120);
  });
  btn.addEventListener('pointerup', () => clearInterval(interval));
  btn.addEventListener('pointerleave', () => clearInterval(interval));
  btn.addEventListener('pointercancel', () => clearInterval(interval));
  return btn;
}

function createSizeEditor(obj, size) {
  const wrap = document.createElement('div');

  const createSizeDim = (label, idx) => {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `<span class="prop-label">${label}</span>`;
    const input = document.createElement('input');
    input.className = 'prop-input';
    input.type = 'text';
    input.value = String(size[idx]);
    input.addEventListener('change', () => {
      const v = input.value.trim();
      const n = parseFloat(v);
      if (!obj.size) obj.size = [...size];
      obj.size[idx] = (!isNaN(n) && v === String(n)) ? n : v;
      renderPreview();
    });
    row.appendChild(input);
    return row;
  };

  wrap.appendChild(createSizeDim('width', 0));
  wrap.appendChild(createSizeDim('height', 1));
  return wrap;
}

function createAnchorSelect(prop, value, obj) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  row.innerHTML = `<span class="prop-label">${esc(prop)}</span>`;
  const sel = document.createElement('select');
  sel.className = 'prop-select';
  ANCHORS.forEach(a => {
    const o = document.createElement('option');
    o.value = a; o.textContent = a.replace(/_/g, ' ');
    if (a === value) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    obj[prop] = sel.value;
    renderPreview();
  });
  row.appendChild(sel);
  return row;
}

function createNumberInput(prop, value, obj, min, max, step) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  row.innerHTML = `<span class="prop-label">${esc(prop)}</span>`;
  const input = document.createElement('input');
  input.className = 'prop-input';
  input.type = 'number';
  input.min = min; input.max = max; input.step = step;
  input.value = value;
  input.addEventListener('change', () => {
    obj[prop] = parseFloat(input.value);
    renderPreview();
  });
  row.appendChild(input);
  return row;
}

function createBoolInput(prop, value, obj) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  row.innerHTML = `<span class="prop-label">${esc(prop)}</span>`;
  const wrap = document.createElement('div');
  wrap.className = 'prop-checkbox-wrap';
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'prop-checkbox';
  cb.checked = value;
  const label = document.createElement('span');
  label.textContent = value ? 'true' : 'false';
  label.style.fontSize = '0.82rem';
  label.style.fontFamily = 'var(--mono)';
  cb.addEventListener('change', () => {
    obj[prop] = cb.checked;
    label.textContent = cb.checked ? 'true' : 'false';
    renderPreview();
  });
  wrap.append(cb, label);
  row.appendChild(wrap);
  return row;
}

function createTextInput(prop, value, obj) {
  const row = document.createElement('div');
  row.className = 'prop-row';
  row.innerHTML = `<span class="prop-label">${esc(prop)}</span>`;
  const input = document.createElement('input');
  input.className = 'prop-input';
  input.type = 'text';
  input.value = value;
  input.addEventListener('change', () => {
    const v = input.value;
    const n = parseFloat(v);
    obj[prop] = (!isNaN(n) && v === String(n)) ? n : v;
  });
  row.appendChild(input);
  return row;
}

function createArrayInput(prop, arr, obj) {
  const wrap = document.createElement('div');
  arr.forEach((val, idx) => {
    const row = document.createElement('div');
    row.className = 'prop-row';
    row.innerHTML = `<span class="prop-label">${esc(prop)}[${idx}]</span>`;
    const input = document.createElement('input');
    input.className = 'prop-input';
    input.type = 'text';
    input.value = String(val);
    input.addEventListener('change', () => {
      const v = input.value.trim();
      const n = parseFloat(v);
      obj[prop][idx] = (!isNaN(n) && v === String(n)) ? n : v;
      renderPreview();
    });
    row.appendChild(input);
    wrap.appendChild(row);
  });
  return wrap;
}

// ===== Preview =====
// ===== Visual preview =====
//
// The preview works in Bedrock UI pixels, not CSS pixels: every JSON UI number is a UI
// pixel, so a box drawn in "whatever the panel is wide" told you nothing about where the
// element actually lands in game. The stage is a fixed UI-pixel screen scaled to fit.
const UI_SCREENS = {
  desktop: { w: 427, h: 240, label: 'Desktop 16:9' },
  phone:   { w: 520, h: 240, label: 'Phone 19.5:9' },
  tablet:  { w: 320, h: 240, label: 'Tablet 4:3' }
};

let device = 'desktop';
let sampleText = '\u{1F5D1} Очистка: 4:12';
let showHud = true, showGrid = true, showLabels = true, snapEnabled = true;
let shotUrl = null, shotFade = 0.6;
let snapLines = [];
let uiScale = 1;
let dragState = null;

// Undo stack. Named apart from window.history on purpose: assigning to that one throws.
let uiHistory = [];
let histIndex = -1;

// Vanilla HUD landmarks, in UI pixels from their own corner. Handy when you are lining an
// element up against something the client draws itself.
const HUD_GUIDES = [
  { id: 'hotbar',  w: 182, h: 22, ax: 0.5, ay: 1,   ox: 0,   oy: -2,  text: 'hotbar' },
  { id: 'health',  w: 81,  h: 9,  ax: 0.5, ay: 1,   ox: -50, oy: -25, text: 'health' },
  { id: 'hunger',  w: 81,  h: 9,  ax: 0.5, ay: 1,   ox: 50,  oy: -25, text: 'hunger' },
  { id: 'logo',    w: 27,  h: 27, ax: 1,   ay: 1,   ox: -4,  oy: 0,   text: 'client logo' },
  { id: 'chat',    w: 200, h: 60, ax: 0,   ay: 0,   ox: 2,   oy: 2,   text: 'chat' },
  { id: 'board',   w: 96,  h: 90, ax: 1,   ay: 0.5, ox: -1,  oy: 0,   text: 'sidebar' }
];

// ===== Text metrics =====
// Minecraft draws most glyphs 6 UI pixels wide; private-use glyphs from a pack font are
// square and take the full line. Close enough to tell "fits" from "runs off the screen".
function measureUiText(str) {
  let w = 0;
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (ch === ' ') w += 4;
    else if (code >= 0xE000 && code <= 0xF8FF) w += 9;   // pack glyph
    else if (code > 0xFFFF) w += 10;                     // emoji
    else if (/[a-z0-9]/i.test(ch)) w += 6;
    else w += 6;
  }
  return w;
}

function labelText(obj) {
  const raw = obj.text;
  if (typeof raw !== 'string') return sampleText;
  // "#text" and friends are bound at runtime — show the sample instead of the binding name.
  if (raw.startsWith('#') || raw.startsWith('$')) return sampleText;
  return raw;
}

// ===== Resolving references =====
// A control named "thing@namespace.other" inherits everything from "other". A stack panel
// with a factory renders one entry per collection item. Both are drawn here, because both
// are exactly where a layout goes wrong.
function lookupElement(ref) {
  if (!jsonData || typeof ref !== 'string') return null;
  const name = ref.includes('.') ? ref.slice(ref.lastIndexOf('.') + 1) : ref;
  const direct = jsonData[name];
  if (direct && typeof direct === 'object') return direct;
  for (const [key, val] of Object.entries(jsonData)) {
    if (key === 'namespace' || !val || typeof val !== 'object') continue;
    if (key.split('@')[0] === name) return val;
  }
  return null;
}

function resolved(name, obj) {
  if (!name.includes('@')) return obj;
  const base = lookupElement(name.split('@')[1]);
  if (!base) return obj;
  const merged = Object.assign({}, base, obj);
  if (!obj.controls && base.controls) merged.controls = base.controls;
  return merged;
}

// ===== Measurement =====
function sizeOf(obj, parentW, parentH) {
  const size = obj.size || ['default', 'default'];
  return {
    w: axisSize(size[0], parentW, obj, 'w'),
    h: axisSize(size[1], parentH, obj, 'h')
  };
}

function axisSize(v, parentDim, obj, axis) {
  if (typeof v === 'number') return v;
  const s = String(v).trim();

  // "100%c" / "100%cm" / "wrap_content" — driven by the content, so measure the content.
  if (s === 'wrap_content' || s === 'default' || /%c/.test(s)) {
    const frac = /%c/.test(s) ? (parseFloat(s) || 100) / 100 : 1;
    return contentSize(obj, axis) * frac;
  }

  // "100%sm" — sibling driven; we have no siblings here, fall back to the parent.
  if (/%s/.test(s)) return parentDim * ((parseFloat(s) || 100) / 100);

  // "100% - 4px" and plain percentages.
  const pct = s.match(/(-?[\d.]+)\s*%/);
  const px = s.match(/([+-]\s*[\d.]+)\s*px/);
  if (pct) {
    let out = parentDim * (parseFloat(pct[1]) / 100);
    if (px) out += parseFloat(px[1].replace(/\s+/g, ''));
    return out;
  }
  const n = parseFloat(s);
  return isNaN(n) ? 20 : n;
}

function contentSize(obj, axis) {
  if (obj.type === 'label') {
    return axis === 'w' ? measureUiText(labelText(obj)) : 10;
  }
  const kids = childEntries(obj);
  if (!kids.length) return axis === 'w' ? 20 : 10;
  let max = 0;
  for (const kid of kids) {
    const s = sizeOf(kid.obj, 0, 0);
    max = Math.max(max, axis === 'w' ? s.w : s.h);
  }
  return max;
}

function childEntries(obj) {
  const out = [];
  if (Array.isArray(obj.controls)) {
    obj.controls.forEach((ctrl, i) => {
      if (!ctrl || typeof ctrl !== 'object') return;
      for (const [name, val] of Object.entries(ctrl)) {
        if (!val || typeof val !== 'object') continue;
        out.push({ index: i, name, obj: resolved(name, val), raw: val });
      }
    });
  }
  return out;
}

// ===== Layout =====
// Boxes are laid out against their PARENT, not against the screen. The old preview measured
// every element from the screen corner, which is precisely the mistake that hides a child
// spilling out of its own panel.
function layoutBoxes() {
  const screen = UI_SCREENS[device];
  const boxes = [];
  if (!jsonData) return boxes;

  // Templates that something else renders — a factory entry, an "@" reference — are drawn
  // inside their owner. Drawing them a second time as a root fills the screen with boxes
  // the player never sees there.
  const referenced = collectReferenced();
  const roots = Object.entries(jsonData).filter(
    ([k, v]) =>
      k !== 'namespace' && v && typeof v === 'object' && !Array.isArray(v) &&
      (v.type || v.controls) && !referenced.has(k.split('@')[0])
  );

  for (const [name, obj] of roots) {
    place(name, resolved(name, obj), { x: 0, y: 0, w: screen.w, h: screen.h }, name, 0, boxes, 0);
  }
  return boxes;
}

function collectReferenced() {
  const names = new Set();
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.factory && typeof node.factory.control_name === 'string') {
      const cn = node.factory.control_name;
      names.add(cn.includes('.') ? cn.slice(cn.lastIndexOf('.') + 1) : cn);
    }
    for (const [key, val] of Object.entries(node)) {
      if (key.includes('@')) {
        const ref = key.split('@')[1] || '';
        names.add(ref.includes('.') ? ref.slice(ref.lastIndexOf('.') + 1) : ref);
      }
      walk(val);
    }
  };
  walk(jsonData);
  return names;
}

function place(name, obj, parentBox, path, depth, boxes, stackShift) {
  if (!obj || obj.type === 'screen') return;

  const { w, h } = sizeOf(obj, parentBox.w, parentBox.h);

  const from = obj.anchor_from || 'center';
  const to = obj.anchor_to || from;
  const ax = from.includes('left') ? 0 : from.includes('right') ? 1 : 0.5;
  const ay = from.includes('top') ? 0 : from.includes('bottom') ? 1 : 0.5;
  const bx = to.includes('left') ? 0 : to.includes('right') ? 1 : 0.5;
  const by = to.includes('top') ? 0 : to.includes('bottom') ? 1 : 0.5;

  const off = obj.offset || [0, 0];
  const ox = numOf(off[0], parentBox.w);
  const oy = numOf(off[1], parentBox.h);

  const box = {
    path, name, obj, depth,
    x: parentBox.x + ax * parentBox.w - bx * w + ox,
    y: parentBox.y + ay * parentBox.h - by * h + oy + stackShift,
    w, h
  };
  boxes.push(box);

  const vertical = obj.orientation !== 'horizontal';
  let shift = 0;

  childEntries(obj).forEach((kid, i) => {
    const kidPath = `${path}.controls[${kid.index}].${kid.name}`;
    place(kid.name, kid.obj, box, kidPath, depth + 1, boxes, obj.type === 'stack_panel' ? shift : 0);
    if (obj.type === 'stack_panel') {
      const s = sizeOf(kid.obj, box.w, box.h);
      shift += vertical ? s.h : s.w;
    }
  });

  // A factory renders the collection: draw one sample entry so the row is visible where the
  // player will actually see it.
  if (obj.factory && obj.factory.control_name) {
    const entry = lookupElement(obj.factory.control_name);
    if (entry) place('factory entry', entry, box, path + '::factory', depth + 1, boxes, shift, true);
  }
}

function numOf(v, parentDim) {
  if (typeof v === 'number') return v;
  const s = String(v);
  if (s.includes('%')) return parentDim * (parseFloat(s) / 100 || 0);
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

// ===== Rendering =====
function renderPreview() {
  const screen = UI_SCREENS[device];
  const viewport = $('#preview-viewport');
  const stage = $('#preview-stage');
  if (!stage) return;

  const avail = (viewport.clientWidth || 320) - 24;
  uiScale = Math.max(0.4, (avail / screen.w) * (zoomLevel / 100));

  stage.style.width = screen.w * uiScale + 'px';
  stage.style.height = screen.h * uiScale + 'px';
  previewScreen.style.width = screen.w * uiScale + 'px';
  previewScreen.style.height = screen.h * uiScale + 'px';
  previewScreen.classList.toggle('with-grid', showGrid);
  previewScreen.classList.toggle('with-shot', !!shotUrl);
  previewScreen.style.setProperty('--grid-step', 10 * uiScale + 'px');
  previewScreen.innerHTML = '';

  // A screenshot of the real game is the only honest backdrop: guides approximate the HUD,
  // the player's own frame IS the HUD, at the exact size the client draws it.
  if (shotUrl) {
    const shot = document.createElement('img');
    shot.className = 'preview-shot';
    shot.src = shotUrl;
    shot.style.opacity = shotFade;
    previewScreen.appendChild(shot);
  }

  if (showHud) renderGuides(screen);

  layoutBoxes().forEach(box => {
    if (box.obj.visible === false) return;
    previewScreen.appendChild(buildBox(box, screen));
  });

  snapLines.forEach(line => {
    const el = document.createElement('div');
    el.className = 'snap-line ' + (line.axis === 'x' ? 'snap-v' : 'snap-h');
    if (line.axis === 'x') el.style.left = line.at * uiScale + 'px';
    else el.style.top = line.at * uiScale + 'px';
    previewScreen.appendChild(el);
  });

  updateStatus(screen);
}

function renderGuides(screen) {
  HUD_GUIDES.forEach(g => {
    const el = document.createElement('div');
    el.className = 'hud-guide guide-' + g.id;
    const x = g.ax * screen.w - g.ax * g.w + g.ox;
    const y = g.ay * screen.h - g.ay * g.h + g.oy;
    el.style.left = x * uiScale + 'px';
    el.style.top = y * uiScale + 'px';
    el.style.width = g.w * uiScale + 'px';
    el.style.height = g.h * uiScale + 'px';
    el.dataset.name = g.text;
    previewScreen.appendChild(el);
  });
}

function buildBox(box, screen) {
  const div = document.createElement('div');
  div.className = 'preview-el';
  const type = box.obj.type || 'panel';
  div.classList.add('type-' + type.replace('stack_panel', 'panel'));
  div.dataset.path = box.path;
  div.style.left = box.x * uiScale + 'px';
  div.style.top = box.y * uiScale + 'px';
  div.style.width = Math.max(2, box.w * uiScale) + 'px';
  div.style.height = Math.max(2, box.h * uiScale) + 'px';
  if (box.obj.alpha !== undefined) div.style.opacity = Math.max(0.15, box.obj.alpha);
  if (selectedPath === box.path) div.classList.add('active');

  const spills =
    box.x < -0.5 || box.y < -0.5 ||
    box.x + box.w > screen.w + 0.5 || box.y + box.h > screen.h + 0.5;
  if (spills) div.classList.add('offscreen');

  // A box that covers most of the screen is a container, not a thing you drag: it sits under
  // everything and would swallow every stray grab, moving the whole layout instead of the
  // one row you aimed at. Select those from the tree.
  if (box.w * box.h > screen.w * screen.h * 0.7) div.classList.add('passthrough');

  if (type === 'label') {
    const text = document.createElement('span');
    text.className = 'el-text';
    text.textContent = labelText(box.obj);
    text.style.fontSize = 8 * uiScale + 'px';
    text.style.justifyContent =
      box.obj.text_alignment === 'right' ? 'flex-end'
      : box.obj.text_alignment === 'center' ? 'center' : 'flex-start';
    div.appendChild(text);
  } else if (showLabels) {
    const tag = document.createElement('span');
    tag.className = 'el-tag';
    tag.textContent = box.name;
    div.appendChild(tag);
  }

  div.addEventListener('pointerdown', e => beginDrag(e, box));
  return div;
}

// ===== Dragging =====
function beginDrag(e, box) {
  const el = elements.find(x => x.path === box.path);
  if (el) selectElement(el.path, el.obj, el.name, el.type);

  // A factory sample and inherited elements have no editable offset of their own.
  if (!el || !Array.isArray(box.obj.offset)) {
    if (!el) showToast('This box is drawn from another element — select that one to move it');
    return;
  }

  e.preventDefault();
  dragState = {
    obj: box.obj,
    path: box.path,
    startX: e.clientX,
    startY: e.clientY,
    baseX: numOf(box.obj.offset[0], 0),
    baseY: numOf(box.obj.offset[1], 0),
    sx: typeof box.obj.offset[0] === 'string' && box.obj.offset[0].includes('%') ? '%' : '',
    sy: typeof box.obj.offset[1] === 'string' && box.obj.offset[1].includes('%') ? '%' : ''
  };
  // Capture is a nicety — it keeps the drag alive when the cursor outruns the box. Some
  // pointer ids cannot be captured at all, and losing the whole drag over that is worse.
  try {
    if (e.target.setPointerCapture) e.target.setPointerCapture(e.pointerId);
  } catch (err) { /* drag still works through the window listeners */ }
}

function moveDrag(e) {
  if (!dragState) return;
  const dx = (e.clientX - dragState.startX) / uiScale;
  const dy = (e.clientY - dragState.startY) / uiScale;
  const step = e.shiftKey ? 0.5 : nudgeStep;
  const round = v => Math.round(v / step) * step;

  let nx = round(dragState.baseX + dx);
  let ny = round(dragState.baseY + dy);
  if (nx !== dragState.baseX || ny !== dragState.baseY) dragState.moved = true;
  setOffset(dragState.obj, nx, ny);

  // Snapping runs on the laid-out box, not on the raw offset: what you line up is the edge
  // of the element, and where that edge lands depends on the anchor and on the parent.
  snapLines = [];
  if (snapEnabled && !e.altKey) {
    const box = layoutBoxes().find(b => b.path === dragState.path);
    if (box) {
      const fix = snapCorrection(box);
      if (fix.dx || fix.dy) setOffset(dragState.obj, nx + fix.dx, ny + fix.dy);
      snapLines = fix.lines;
    }
  }
  renderPreview();
  if (selectedPath) {
    const el = elements.find(x => x.path === selectedPath);
    if (el && el.obj === dragState.obj) renderProps(el.obj, el.name, el.type);
  }
}

function setOffset(obj, x, y) {
  const cur = obj.offset || [0, 0];
  const sx = typeof cur[0] === 'string' && cur[0].includes('%') ? '%' : '';
  const sy = typeof cur[1] === 'string' && cur[1].includes('%') ? '%' : '';
  obj.offset = [sx ? x + sx : x, sy ? y + sy : y];
}

// ===== Snapping =====
// Targets are the screen edges and the edges of every HUD landmark: those are the things a
// layout is actually lined up against.
const SNAP_TOLERANCE = 2.5;

function snapTargets(screen) {
  const xs = [0, screen.w / 2, screen.w];
  const ys = [0, screen.h / 2, screen.h];
  if (showHud) {
    HUD_GUIDES.forEach(g => {
      const x = g.ax * screen.w - g.ax * g.w + g.ox;
      const y = g.ay * screen.h - g.ay * g.h + g.oy;
      xs.push(x, x + g.w);
      ys.push(y, y + g.h);
    });
  }
  return { xs, ys };
}

function snapCorrection(box) {
  const screen = UI_SCREENS[device];
  const { xs, ys } = snapTargets(screen);
  const lines = [];
  let dx = 0, dy = 0;

  const best = (edges, targets) => {
    let pick = null;
    edges.forEach(edge => {
      targets.forEach(t => {
        const delta = t - edge;
        if (Math.abs(delta) <= SNAP_TOLERANCE && (!pick || Math.abs(delta) < Math.abs(pick.delta))) {
          pick = { delta, at: t };
        }
      });
    });
    return pick;
  };

  const hit = best([box.x, box.x + box.w], xs);
  if (hit) { dx = hit.delta; lines.push({ axis: 'x', at: hit.at }); }
  const vit = best([box.y, box.y + box.h], ys);
  if (vit) { dy = vit.delta; lines.push({ axis: 'y', at: vit.at }); }
  return { dx, dy, lines };
}

function endDrag() {
  if (!dragState) return;
  const moved = dragState.moved;
  dragState = null;
  snapLines = [];
  renderPreview();
  if (moved) { pushHistory(); saveDraft(); }
}

// ===== Status line =====
function updateStatus(screen) {
  const status = $('#preview-status');
  if (!status) return;
  const box = layoutBoxes().find(b => b.path === selectedPath);
  if (!box) {
    status.innerHTML = '<span class="ps-hint">Drag any box to move it. Arrow keys nudge the selected element, Shift &times;10, Ctrl+Z undo.</span>';
    return;
  }
  const r = v => Math.round(v * 10) / 10;
  const gapRight = screen.w - (box.x + box.w);
  const gapBottom = screen.h - (box.y + box.h);
  const spills = box.x < -0.5 || box.y < -0.5 || gapRight < -0.5 || gapBottom < -0.5;
  status.innerHTML =
    `<b>${esc(box.name)}</b>` +
    `<span>size ${r(box.w)}&times;${r(box.h)}</span>` +
    `<span>left ${r(box.x)}</span><span>top ${r(box.y)}</span>` +
    `<span>right ${r(gapRight)}</span><span>bottom ${r(gapBottom)}</span>` +
    (spills ? '<span class="ps-warn">runs off the screen</span>' : '');
}

// ===== Undo =====
function pushHistory() {
  if (!jsonData) return;
  uiHistory = uiHistory.slice(0, histIndex + 1);
  uiHistory.push(JSON.stringify(jsonData));
  if (uiHistory.length > 60) uiHistory.shift();
  histIndex = uiHistory.length - 1;
}

function restoreHistory(step) {
  const next = histIndex + step;
  if (next < 0 || next >= uiHistory.length) { showToast(step < 0 ? 'Nothing to undo' : 'Nothing to redo'); return; }
  histIndex = next;
  jsonData = JSON.parse(uiHistory[histIndex]);
  elements = [];
  flattenElements(jsonData, '');
  renderTree();
  renderPreview();
  const el = elements.find(x => x.path === selectedPath);
  if (el) renderProps(el.obj, el.name, el.type);
  showToast(step < 0 ? 'Undo' : 'Redo');
}

// ===== Draft persistence =====
function saveDraft() {
  try {
    if (jsonData) localStorage.setItem('bjue.draft', JSON.stringify(jsonData));
  } catch (e) { /* private mode — nothing to do */ }
}

function loadDraft() {
  try {
    const raw = localStorage.getItem('bjue.draft');
    if (raw) { jsonInput.value = JSON.stringify(JSON.parse(raw), null, 2); return true; }
  } catch (e) { /* ignore */ }
  return false;
}

// ===== Nudge with the keyboard =====
function nudgeSelected(dx, dy) {
  const el = elements.find(x => x.path === selectedPath);
  if (!el || !Array.isArray(el.obj.offset)) return;
  const cur = el.obj.offset;
  const sx = typeof cur[0] === 'string' && cur[0].includes('%') ? '%' : '';
  const sy = typeof cur[1] === 'string' && cur[1].includes('%') ? '%' : '';
  const nx = numOf(cur[0], 0) + dx;
  const ny = numOf(cur[1], 0) + dy;
  el.obj.offset = [sx ? nx + sx : nx, sy ? ny + sy : ny];
  pushHistory();
  renderPreview();
  renderProps(el.obj, el.name, el.type);
  saveDraft();
}

function setZoom(level) {
  zoomLevel = Math.max(50, Math.min(400, level));
  $('#zoom-level').textContent = zoomLevel + '%';
  renderPreview();
}

// ===== Export =====
function showExport() {
  if (!jsonData) return;
  try {
    const output = JSON.stringify(jsonData, null, 2);
    exportModal.classList.add('visible');
    // Set value after modal is visible so textarea can render
    requestAnimationFrame(() => {
      jsonOutput.value = output;
      jsonOutput.scrollTop = 0;
    });
  } catch (e) {
    exportModal.classList.add('visible');
    jsonOutput.value = '// Error serializing JSON: ' + e.message;
  }
}

function copyJSON() {
  navigator.clipboard.writeText(jsonOutput.value).then(() => showToast('Copied to clipboard!'));
}

function downloadJSON() {
  const ns = jsonData.namespace || 'ui';
  const blob = new Blob([jsonOutput.value], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = ns + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Downloaded ' + ns + '.json');
}

// ===== Toast =====
function showToast(msg) {
  let toast = document.querySelector('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

// ===== Util =====
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ===== Start =====
init();
})();
