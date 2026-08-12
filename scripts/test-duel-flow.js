/* Headless harness for app.js — verifies the 交锋/独立 (relay/solo) duel flow.
   Runs app.js against a minimal fake DOM, then drives the rAF loop with a
   controllable timestamp so a 10s stage can be burned down instantly. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(process.argv[2] || path.join(path.resolve(__dirname, '..'), 'app.js'), 'utf8');

let nodeSeq = 0;
function makeNode(tag) {
  const n = {
    _id: ++nodeSeq,
    tagName: (tag || 'div').toUpperCase(),
    textContent: '', _html: '', value: '', title: '', disabled: false, draggable: false,
    style: { setProperty() {}, removeProperty() {}, getPropertyValue() { return ''; } },
    dataset: {}, children: [], _h: {}, _q: new Map(),
    classList: {
      _s: new Set(),
      add(...a) { a.forEach(x => this._s.add(x)); },
      remove(...a) { a.forEach(x => this._s.delete(x)); },
      contains(x) { return this._s.has(x); },
      toggle(x, on) { if (on) this._s.add(x); else this._s.delete(x); },
    },
    addEventListener(t, f) { (this._h[t] = this._h[t] || []).push(f); },
    removeEventListener() {},
    dispatch(t, ev) {
      (this._h[t] || []).forEach(f => f(Object.assign({
        target: this, currentTarget: this, preventDefault() {}, stopPropagation() {},
      }, ev)));
    },
    click() { this.dispatch('click', {}); },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.push(c); return c; },
    removeChild() {},
    remove() {},
    setAttribute() {}, getAttribute() { return null; },
    focus() {}, blur() {},
    closest() { return null; },
    getBoundingClientRect() { return { top: 0, left: 0, width: 100, height: 100 }; },
    querySelector(sel) {
      if (!this._q.has(sel)) this._q.set(sel, makeNode('div'));
      return this._q.get(sel);
    },
    querySelectorAll() { return []; },
  };
  // assigning innerHTML must drop previously rendered children/queries,
  // otherwise stale rows survive a re-render and hide real bugs
  Object.defineProperty(n, 'innerHTML', {
    get() { return this._html; },
    set(v) { this._html = String(v); this.children.length = 0; this._q.clear(); },
  });
  return n;
}

const byId = new Map();
function el(id) {
  if (!byId.has(id)) { const n = makeNode('div'); n.id = id; byId.set(id, n); }
  return byId.get(id);
}

const document = {
  body: makeNode('body'),
  documentElement: makeNode('html'),
  fullscreenElement: null,
  _h: {},
  getElementById: el,
  createElement: (t) => makeNode(t),
  querySelector: (s) => el('sel:' + s),
  querySelectorAll: () => [],
  addEventListener(t, f) { (this._h[t] = this._h[t] || []).push(f); },
  dispatch(t, ev) {
    (document._h[t] || []).forEach(f => f(Object.assign({
      target: makeNode('div'), preventDefault() {}, stopPropagation() {},
    }, ev)));
  },
  exitFullscreen() {},
};
document._h = {};
document.addEventListener = (t, f) => { (document._h[t] = document._h[t] || []).push(f); };
document.body.dataset = {};

const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
};

let rafCb = null;
const sandbox = {
  document, localStorage, console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
  cancelAnimationFrame: () => { rafCb = null; },
  performance: { now: () => 0 },
  navigator: { userAgent: 'node' },
};
sandbox.window = sandbox;
sandbox.window.AudioContext = function () {
  return {
    state: 'running', currentTime: 0, resume() {}, destination: {},
    createOscillator() { return { type: '', frequency: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect(n) { return n; }, start() {}, stop() {} }; },
    createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }, connect(n) { return n; } }; },
  };
};

vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: 'app.js' });

/* ---- helpers to drive the app ---- */
function stageRows() {
  return el('stagesList').children;
}
// innerHTML is not parsed by the fake DOM, so rows are addressed by index.
// Default flow order: 0 首页 1 正方陈词 2 反方质询 3 反方陈词 4 对辩 5 正方陈词 6 自由辩论 7 结辩
const ROW = { '对辩': 4, '自由辩论': 6, '反方质询': 2 };
function rowNamed(name) { return stageRows()[ROW[name]]; }
function key(k, extra) {
  document.dispatch('keydown', Object.assign({ key: k, code: k === ' ' ? 'Space' : 'Key' + k }, extra));
}
function goToStage(name) {
  // walk stages with ArrowRight until the tab for `name` is active
  for (let i = 0; i < 40; i++) {
    const tabs = el('modeTabs').children;
    const active = tabs.find(t => String(t.className || '').includes('active'));
    if (active && active.textContent === name) return true;
    key('ArrowRight');
  }
  return false;
}
function duelSnapshot() {
  return {
    pro: el('proTime').textContent,
    con: el('conTime').textContent,
    proStatus: el('panelPro').querySelector('.duel-status').textContent,
    conStatus: el('panelCon').querySelector('.duel-status').textContent,
    divider: (el('stage').innerHTML.match(/class="duel-divider"[^>]*>([^<]*)</) || [, '?'])[1],
    startLabel: el('startLabel').textContent,
  };
}
// burn `sec` seconds of wall clock through the rAF loop in ~50ms steps.
// The clock is monotonic across calls, like a real rAF timestamp.
let clock = 1000;
function advance(sec) {
  const start = clock;
  const end = start + sec * 1000;
  while (clock < end) {
    if (!rafCb) break; // loop stopped on its own
    clock += 50;
    const cb = rafCb; rafCb = null;
    cb(clock);
  }
  const burned = (clock - start) / 1000;
  clock = end; // keep the clock moving even while paused
  return burned;
}
// treat -00:00 (sub-frame overshoot past zero) as zero
const z = t => (t === '-00:00' ? '00:00' : t);

let fails = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + '  actual=' + JSON.stringify(actual) + (ok ? '' : ' expected=' + JSON.stringify(expected)));
}

/* ---- 1. keyword inference on the default flow ---- */
check('对辩 defaults to 交锋', rowNamed('对辩').querySelector('.stage-flow-pill').textContent, '交锋');
check('自由辩论 defaults to 交锋', rowNamed('自由辩论').querySelector('.stage-flow-pill').textContent, '交锋');
check('反方质询 (single) infers 独立', rowNamed('反方质询').querySelector('.stage-flow-pill').textContent, '独立');
check('flow pill hidden on single stages', rowNamed('反方质询').querySelector('.stage-flow-pill').style.visibility, 'hidden');
check('flow pill visible on duel stages', rowNamed('对辩').querySelector('.stage-flow-pill').style.visibility, 'visible');

/* ---- 2. renaming a duel stage re-infers the default ---- */
{
  const r = rowNamed('对辩');
  const input = r.querySelector('.stage-name-input');
  input.value = '一辩质询';
  input.dispatch('input', { target: input });
  check('rename 对辩 -> 一辩质询 flips default to 独立', r.querySelector('.stage-flow-pill').textContent, '独立');
  input.value = '对辩';
  input.dispatch('input', { target: input });
  check('rename back to 对辩 restores 交锋', r.querySelector('.stage-flow-pill').textContent, '交锋');
}

/* ---- 3. explicit toggle sticks and survives a rename ---- */
{
  const r = rowNamed('对辩');
  const pill = r.querySelector('.stage-flow-pill');
  pill.click();
  check('clicking pill flips 对辩 to 独立', pill.textContent, '独立');
  const input = r.querySelector('.stage-name-input');
  input.value = '自由辩论';
  input.dispatch('input', { target: input });
  check('explicit 独立 survives rename to 自由辩论', pill.textContent, '独立');
  check('explicit choice is persisted', JSON.parse(localStorage.getItem('debate-timer-v2')).stages[4].duelFlow, 'solo');
  input.value = '对辩';
  input.dispatch('input', { target: input });
}

/* ---- 4. SOLO: one side hitting zero must NOT hand time to the other ---- */
{
  const r = rowNamed('对辩');                       // already toggled to 独立 above
  const dur = r.querySelector('.stage-dur-input');
  dur.value = '10';
  dur.dispatch('change', { target: dur });
  check('navigated to 对辩', goToStage('对辩'), true);
  check('solo divider reads 独立', duelSnapshot().divider, '独立');
  check('solo start values', [duelSnapshot().pro, duelSnapshot().con], ['00:10', '00:10']);
  key(' ');                                        // start
  const ran = advance(20);
  const s = duelSnapshot();
  check('solo: loop stopped at zero (s)', ran <= 11, true);
  check('solo: 正方 hit zero', z(s.pro), '00:00');
  check('solo: 反方 untouched', s.con, '00:10');
  check('solo: 正方 shows 已结束', s.proStatus, '已结束');
  check('solo: start button back to 开始', s.startLabel, '开始');
  // now hand the clock to 反方 manually
  key('2');
  advance(4);
  const s2 = duelSnapshot();
  check('solo: 反方 runs only after being selected', s2.con, '00:06');
  check('solo: 正方 stays at zero', z(s2.pro), '00:00');
}

/* ---- 5. RELAY: one side hitting zero still auto-continues on the other ---- */
{
  const r = rowNamed('自由辩论');
  const dur = r.querySelector('.stage-dur-input');
  dur.value = '10';
  dur.dispatch('change', { target: dur });
  check('navigated to 自由辩论', goToStage('自由辩论'), true);
  check('relay divider reads VS', duelSnapshot().divider, 'VS');
  key(' ');
  advance(14);
  const s = duelSnapshot();
  check('relay: 正方 hit zero', z(s.pro), '00:00');
  check('relay: 反方 auto-continued', s.con, '00:06');
  advance(10);
  const s2 = duelSnapshot();
  check('relay: both exhausted -> stop', [z(s2.pro), z(s2.con), s2.startLabel], ['00:00', '00:00', '开始']);
  check('relay: both sides show 已结束', [s2.proStatus, s2.conStatus], ['已结束', '已结束']);
}

console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
