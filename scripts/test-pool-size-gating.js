/* scripts/test-pool-size-gating.js — 25 秒数字大小区块只在套用雅哲杯时显示（静态检查）。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
let fails = 0;
function check(label, ok) { if (!ok) fails++; console.log((ok ? 'PASS  ' : 'FAIL  ') + label); }
const presets = vm.runInNewContext(src.match(/const BUILT_IN_PRESETS = (\[[\s\S]*?\n  \]);/)[1]);
const fn = vm.runInNewContext('(' + src.match(/const POOL_SIZE_PRESET = '([^']+)';/)[0].replace('const ', 'function(){var ') + ' return function(a){return a===POOL_SIZE_PRESET;};})()');
check('gating preset 雅哲杯 is a built-in preset', presets.some(p => p.name === '雅哲杯'));
check('visible only for 雅哲杯', presets.filter(p => fn(p.name)).map(p => p.name).join() === '雅哲杯');
check('hidden when no preset / user preset', !fn(null) && !fn(undefined) && !fn('分享的赛制'));
check('activePreset persisted in saveState', /activePreset: state\.activePreset/.test(src));
check('visibility applied after loadState', /loadState\(\);\s*\n\s*updatePoolSizeVisibility\(\);/.test(src));
check('pool-size row still in index.html', html.includes('pool-size-row') && html.includes('id="poolSize"'));
console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
