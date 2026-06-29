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

for (const [name, filePath] of Object.entries(files)) {
  if (!fs.existsSync(filePath)) continue;
  const text = read(filePath);
  assert(!text.includes('??'), `${name} contains mojibake marker ??`);
}

console.log('check passed');
