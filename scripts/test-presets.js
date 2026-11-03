/* scripts/test-presets.js — 内置赛制的静态检查（目前覆盖启政杯）。 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
const m = src.match(/const BUILT_IN_PRESETS = (\[[\s\S]*?\n  \]);/);
if (!m) { console.log('FAIL  BUILT_IN_PRESETS not found'); process.exit(1); }
const presets = vm.runInNewContext(m[1]);
let fails = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) fails++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + '  actual=' + JSON.stringify(actual) + (ok ? '' : ' expected=' + JSON.stringify(expected)));
}
const total = st => st.reduce((t, s) => t + s.duration * (s.type === 'duel' ? 2 : 1), 0);
const q = presets.find(p => p.name === '启政杯');
check('启政杯 exists', !!q, true);
check('启政杯 has 18 stages', q.stages.length, 18);
check('启政杯 totals 53 minutes', total(q.stages), 53 * 60);
check('启政杯 stage 15 is 指导环节 1:00', [q.stages[14].name, q.stages[14].type, q.stages[14].duration], ['指导环节', 'single', 60]);
check('启政杯 stage 16 is 自由辩 dual 3:00 each', [q.stages[15].name, q.stages[15].type, q.stages[15].duration], ['自由辩', 'duel', 180]);
check('启政杯 only stage 16 is dual', q.stages.filter(s => s.type !== 'single').length, 1);
check('启政杯 order', q.stages.map(s => s.name), ['正方一辩立论','反方二辩盘问正方一辩','反方一辩立论','正方三辩盘问反方一辩','正方二辩驳论','反方三辩盘问正方二辩','反方二辩驳论','正方一辩盘问反方二辩','正方三辩驳论','反方一辩盘问正方三辩','反方三辩驳论','正方二辩盘问反方三辩','正方四辩总结（一）','反方四辩总结（一）','指导环节','自由辩','反方四辩总结（二）','正方四辩总结（二）']);
check('built-in preset names unique', new Set(presets.map(p => p.name)).size, presets.length);
console.log(fails === 0 ? '\nALL PASS' : '\n' + fails + ' FAILED');
process.exit(fails === 0 ? 0 : 1);
