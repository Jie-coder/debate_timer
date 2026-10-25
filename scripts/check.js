const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const files = {
  index: path.join(root, 'index.html'),
  css: path.join(root, 'style.css'),
  js: path.join(root, 'app.js'),
  voteCore: path.join(root, 'vote-core.js'),
  voteHost: path.join(root, 'vote-host.js'),
  vote: path.join(root, 'vote.html'),
  configExample: path.join(root, 'config.example.js'),
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
const voteCoreJs = read(files.voteCore);
const voteHostJs = read(files.voteHost);
const voteHtml = read(files.vote);
const configExample = read(files.configExample);

new Function(js);
new Function(voteCoreJs);
new Function(voteHostJs);

assert(index.includes('<script src="vote-core.js" defer></script>'), 'index.html must load vote-core.js');
assert(index.includes('<script src="vote-host.js" defer></script>'), 'index.html must load vote-host.js');
assert(index.includes('<script src="config.js" defer></script>'), 'index.html must optionally load config.js');
assert(index.includes('id="btnVote"'), 'index.html must have the vote icon button');
assert(index.includes('id="votePanel"'), 'index.html must have the vote panel');
assert(index.includes('id="voteRatioBar"'), 'index.html must have the vote ratio bar');
assert(css.includes('.vote-ratio-bar'), 'style.css must style the vote ratio bar');
assert(css.includes('body[data-screen="cover"] .vote-ratio-bar'), 'style.css must hide the vote ratio bar on cover');
assert(voteCoreJs.includes('window.VoteCore'), 'vote-core.js must export window.VoteCore');
assert(voteCoreJs.includes('module.exports'), 'vote-core.js must export module.exports for tests');
assert(voteHostJs.includes('VoteCore'), 'vote-host.js must use VoteCore');
assert(voteHtml.includes('DEBATE_VOTE_CONFIG'), 'vote.html must read window.DEBATE_VOTE_CONFIG');
assert(voteHtml.includes('room'), 'vote.html must read the room query param');
assert(configExample.includes('DEBATE_VOTE_CONFIG'), 'config.example.js must define window.DEBATE_VOTE_CONFIG');

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
