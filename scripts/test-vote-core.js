// 不依赖任何第三方库，直接跑纯函数计票逻辑的单测。
const path = require('path');
const assert = require('assert');
const VoteCore = require(path.join(__dirname, '..', 'vote-core.js'));

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log('  ok - ' + name);
}

test('overwrite：同一 voter_id 投票会覆盖而不是累加', () => {
  const tally = VoteCore.createTally();
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 1 });
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 2000 });
  assert.deepStrictEqual(VoteCore.counts(tally), { pro: 1, con: 0, total: 1 });
});

test('switch：改投对面会立刻生效', () => {
  const tally = VoteCore.createTally();
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 1 });
  const changed = VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'con', ts: 2 });
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(VoteCore.counts(tally), { pro: 0, con: 1, total: 1 });
});

test('dedupe：300ms 内同一边的重复消息被丢弃', () => {
  const tally = VoteCore.createTally();
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 1000 });
  const changed = VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 1200 });
  assert.strictEqual(changed, false);
  assert.deepStrictEqual(VoteCore.counts(tally), { pro: 1, con: 0, total: 1 });
});

test('dedupe：超过 300ms 的同边重复仍然算一次有效更新', () => {
  const tally = VoteCore.createTally();
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 1000 });
  const changed = VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 1301 });
  assert.strictEqual(changed, true);
  assert.deepStrictEqual(VoteCore.counts(tally), { pro: 1, con: 0, total: 1 });
});

test('older ts：比已记录的还旧的消息被丢弃（乱序重发）', () => {
  const tally = VoteCore.createTally();
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 5000 });
  const changed = VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'con', ts: 100 });
  assert.strictEqual(changed, false);
  assert.deepStrictEqual(VoteCore.counts(tally), { pro: 1, con: 0, total: 1 });
});

test('多个 voter 分别计票', () => {
  const tally = VoteCore.createTally();
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 1 });
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'b', side: 'con', ts: 1 });
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'c', side: 'pro', ts: 1 });
  assert.deepStrictEqual(VoteCore.counts(tally), { pro: 2, con: 1, total: 3 });
});

test('非法消息被忽略', () => {
  const tally = VoteCore.createTally();
  assert.strictEqual(VoteCore.applyVote(tally, null), false);
  assert.strictEqual(VoteCore.applyVote(tally, { type: 'sync' }), false);
  assert.strictEqual(VoteCore.applyVote(tally, { type: 'vote', voter_id: '', side: 'pro', ts: 1 }), false);
  assert.strictEqual(VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'up', ts: 1 }), false);
  assert.deepStrictEqual(VoteCore.counts(tally), { pro: 0, con: 0, total: 0 });
});

test('baseline：锁定后记录快照，不随后续投票变化', () => {
  const tally = VoteCore.createTally();
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 1 });
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'b', side: 'con', ts: 1 });
  const baseline = VoteCore.snapshotBaseline(tally);
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'c', side: 'pro', ts: 2 });
  assert.deepStrictEqual(baseline, { pro: 1, con: 1 });
  assert.deepStrictEqual(VoteCore.counts(tally), { pro: 2, con: 1, total: 3 });
});

test('delta：结果对象的 delta 是 final - baseline', () => {
  const tally = VoteCore.createTally();
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 1 });
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'b', side: 'con', ts: 1 });
  const baseline = VoteCore.snapshotBaseline(tally);
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'c', side: 'pro', ts: 2 });
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'b', side: 'pro', ts: 3 }); // b 改投
  const result = VoteCore.buildResult('ABC123', baseline, tally);
  assert.strictEqual(result.room, 'ABC123');
  assert.deepStrictEqual(result.baseline, { pro: 1, con: 1 });
  assert.deepStrictEqual(result.final, { pro: 3, con: 0 });
  assert.deepStrictEqual(result.delta, { pro: 2, con: -1 });
  assert.strictEqual(result.total, 3);
  assert.strictEqual(typeof result.timestamp, 'number');
});

test('delta：没有锁定过 baseline 时按 0 计算', () => {
  const tally = VoteCore.createTally();
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 1 });
  const result = VoteCore.buildResult('ROOM01', null, tally);
  assert.deepStrictEqual(result.baseline, { pro: 0, con: 0 });
  assert.deepStrictEqual(result.delta, { pro: 1, con: 0 });
});

test('CSV：表头 + 一行数据，字段齐全', () => {
  const tally = VoteCore.createTally();
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 1 });
  const result = VoteCore.buildResult('ROOM02', { pro: 0, con: 0 }, tally);
  const csv = VoteCore.toCSV(result);
  const lines = csv.trim().split('\r\n');
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(lines[0], 'room,baseline_pro,baseline_con,final_pro,final_con,delta_pro,delta_con,total,timestamp');
  const cols = lines[1].split(',');
  assert.strictEqual(cols[0], 'ROOM02');
  assert.strictEqual(cols[3], '1'); // final_pro
  assert.strictEqual(cols[7], '1'); // total
});

test('JSON：可以被原样解析回同样的结果对象', () => {
  const tally = VoteCore.createTally();
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'con', ts: 1 });
  const result = VoteCore.buildResult('ROOM03', { pro: 0, con: 0 }, tally);
  const parsed = JSON.parse(VoteCore.toJSON(result));
  assert.deepStrictEqual(parsed, result);
});

test('serializeVotes / restoreVotes：能完整往返（用于 localStorage 备份恢复）', () => {
  const tally = VoteCore.createTally();
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'a', side: 'pro', ts: 10 });
  VoteCore.applyVote(tally, { type: 'vote', voter_id: 'b', side: 'con', ts: 20 });
  const arr = VoteCore.serializeVotes(tally);
  const restored = VoteCore.restoreVotes(arr);
  assert.deepStrictEqual(VoteCore.counts(restored), VoteCore.counts(tally));
  // 恢复后继续应用 dedupe 规则：同边 + 短时间内的重复仍会被丢弃
  const changed = VoteCore.applyVote(restored, { type: 'vote', voter_id: 'a', side: 'pro', ts: 10 + 10 });
  assert.strictEqual(changed, false);
});

console.log(passed + ' passed');
