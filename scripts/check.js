const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
  index: path.join(root, 'index.html'),
  css: path.join(root, 'style.css'),
  js: path.join(root, 'app.js'),
  single: path.join(root, '辩论计时器（bj）.html'),
};

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const index = read(files.index);
const css = read(files.css);
const js = read(files.js);

new Function(js);

assert(index.includes('<link rel="stylesheet" href="style.css">'), 'index.html must load style.css');
assert(index.includes('<script src="app.js" defer></script>'), 'index.html must load app.js');
assert(index.includes('id="stage"'), 'index.html must include the stage mount');
assert(js.includes("type: 'cover'"), 'app.js must include the cover stage');
assert(js.includes('function renderCover()'), 'app.js must render the cover page');
assert(css.includes('body[data-screen="cover"]'), 'style.css must include cover-only layout rules');
assert(css.includes('.stage-duel .duel-progress'), 'style.css must include duel layout rules');
assert(js.includes('function duelFlowOf('), 'app.js must resolve per-stage duel flow');
assert(js.includes("curDuelFlow() === 'relay'"), 'app.js must gate duel auto-relay on the stage flow');
assert(js.includes('stage-flow-pill'), 'app.js must render the duel flow toggle');
assert(css.includes('.stage-flow-pill'), 'style.css must style the duel flow toggle');

const forbiddenPatterns = [
  'id="displayGroup"',
  'id="timerScaleInput"',
  'data-display="ring"',
  'state.display',
  'state.timerScale',
  'applyTimerScale',
  'duel-ring',
  'ringProgress',
];

for (const pattern of forbiddenPatterns) {
  assert(!index.includes(pattern), `index.html contains removed feature marker: ${pattern}`);
  assert(!css.includes(pattern), `style.css contains removed feature marker: ${pattern}`);
  assert(!js.includes(pattern), `app.js contains removed feature marker: ${pattern}`);
}

// The bundle must run after the markup: `defer` does not apply to inline
// scripts, so a <script> inlined into <head> sees an empty document.
if (fs.existsSync(files.single)) {
  const single = read(files.single);
  const scriptAt = single.indexOf('<script>');
  assert(scriptAt > single.indexOf('id="stage"'), 'single-file build must inline the script after the body markup, not in <head>');
  assert(scriptAt < single.indexOf('</body>'), 'single-file build must inline the script inside <body>');
}

for (const [name, filePath] of Object.entries(files)) {
  if (!fs.existsSync(filePath)) continue;
  const text = read(filePath);
  assert(!text.includes('??'), `${name} contains mojibake marker ??`);
}

console.log('check passed');
