/* scripts/e2e-vote.js — Real end-to-end test of the audience voting feature
 * against an actual Supabase project, using the gitignored config.js at the
 * repo root (see VOTING.md). Drives a real headless Chromium: one host tab
 * (index.html) plus three independent voter tabs (vote.html), each in its
 * own browser context so they get distinct voter ids (vote.html keys a
 * voter id off localStorage, which would otherwise be shared across tabs
 * in the same context).
 *
 * Skips cleanly (exit 0) if config.js is missing or incomplete — this is
 * meant to run against a real project, not as a CI gate.
 *
 * Usage: node scripts/e2e-vote.js
 */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.js');
const PORT = 8935;

if (!fs.existsSync(CONFIG_PATH)) {
  console.log('config.js not found at repo root — skipping e2e-vote.js (see VOTING.md to set up a Supabase project).');
  process.exit(0);
}

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch (e) {
  console.log('playwright not installed — skipping e2e-vote.js (npm install playwright to run it).');
  process.exit(0);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };

function startServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    const full = path.join(ROOT, p);
    fs.readFile(full, (err, data) => {
      if (err) { res.writeHead(404); res.end('not found'); return; }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(data);
    });
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

let passCount = 0, failCount = 0;
function assert(cond, msg, actual) {
  if (cond) { passCount++; console.log('PASS  ' + msg + (actual !== undefined ? '  actual=' + JSON.stringify(actual) : '')); }
  else { failCount++; console.log('FAIL  ' + msg + (actual !== undefined ? '  actual=' + JSON.stringify(actual) : '')); }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitForText(locator, predicate, timeout = 10000, label) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < timeout) {
    last = (await locator.textContent()) || '';
    if (predicate(last)) return last;
    await sleep(150);
  }
  throw new Error('waitForText timed out' + (label ? ' (' + label + ')' : '') + ', last value: ' + JSON.stringify(last));
}

async function main() {
  const server = await startServer();
  const browser = await chromium.launch();
  const dialogAccept = (page) => page.on('dialog', (d) => d.accept());

  try {
    // ---------- Host ----------
    const hostCtx = await browser.newContext();
    // 观众投票默认关闭：先在主状态里打开开关
    await hostCtx.addInitScript(() => {
      try {
        const s = JSON.parse(localStorage.getItem('debate-timer-v2') || '{}');
        if (!s.voteEnabled) { s.voteEnabled = true; localStorage.setItem('debate-timer-v2', JSON.stringify(s)); }
      } catch (e) {}
    });
    const host = await hostCtx.newPage();
    dialogAccept(host);
    await host.goto(`http://localhost:${PORT}/index.html`);
    await host.click('#btnVote');
    await host.waitForSelector('#votePanel.open');
    await sleep(300);

    const configWarned = await host.evaluate(() => !document.getElementById('voteConfigWarning').hidden);
    if (configWarned) {
      console.log('config.js is present but the vote panel reports "not configured" — skipping e2e-vote.js. Check SUPABASE_URL / SUPABASE_ANON_KEY in config.js.');
      await browser.close();
      server.close();
      process.exit(0);
    }

    const room = ((await host.locator('#voteRoomCode').textContent()) || '').trim();
    assert(/^[A-Z0-9]{6}$/.test(room), '主持端生成了房间码', room);

    await host.click('#voteStartBtn');
    await waitForText(host.locator('#votePhase'), (t) => t.includes('投票中'), 5000, 'phase=collecting');

    // ---------- 3 independent voters (separate contexts => separate voter ids) ----------
    const voterCtxs = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
    const voters = await Promise.all(voterCtxs.map((ctx) => ctx.newPage()));
    for (const v of voters) {
      await v.goto(`http://localhost:${PORT}/vote.html?room=${encodeURIComponent(room)}`);
      await v.waitForSelector('.status-ok', { timeout: 15000 });
    }
    console.log('PASS  三个独立观众标签页都连接上了房间 ' + room);
    passCount++;

    // ---------- 频道分流：观众只订阅控制频道，从不订阅投票频道 ----------
    const hostChannels = await host.evaluate(() => ({
      vote: window.__voteHostChannelsForTest && window.__voteHostChannelsForTest.vote && window.__voteHostChannelsForTest.vote.state,
      ctl: window.__voteHostChannelsForTest && window.__voteHostChannelsForTest.ctl && window.__voteHostChannelsForTest.ctl.state,
    }));
    assert(hostChannels.vote === 'joined' && hostChannels.ctl === 'joined', '主持端同时订阅了投票频道和控制频道', hostChannels);

    for (let i = 0; i < voters.length; i++) {
      const chans = await voters[i].evaluate(() => ({
        vote: window.__voteChannelsForTest && window.__voteChannelsForTest.vote && window.__voteChannelsForTest.vote.state,
        ctl: window.__voteChannelsForTest && window.__voteChannelsForTest.ctl && window.__voteChannelsForTest.ctl.state,
      }));
      assert(chans.vote !== 'joined', '观众 #' + (i + 1) + ' 的投票频道从未订阅（不会收到其他观众的票）', chans);
      assert(chans.ctl === 'joined', '观众 #' + (i + 1) + ' 只订阅了控制频道', chans);
    }

    // track expected per-voter side so we can compute expected tallies locally
    const mySide = [null, null, null];
    function expectedCounts() {
      let pro = 0, con = 0;
      mySide.forEach((s) => { if (s === 'pro') pro++; else if (s === 'con') con++; });
      return { pro, con, total: pro + con };
    }
    async function vote(i, side) {
      await voters[i].click(side === 'pro' ? '#btnPro' : '#btnCon');
      mySide[i] = side;
    }
    async function waitHostCounts(label) {
      const c = expectedCounts();
      const expected = `正方 ${c.pro} · 反方 ${c.con}（共 ${c.total} 人）`;
      const actual = await waitForText(host.locator('#voteCounts'), (t) => t === expected, 10000, label);
      assert(actual === expected, label, actual);
    }

    // ---------- 1) votes counted ----------
    await vote(0, 'pro');
    await vote(1, 'pro');
    await vote(2, 'con');
    await waitHostCounts('三票计数正确（2 正方 / 1 反方）');

    // 投完票之后再查一次：观众发票不订阅、不建立 WebSocket 连接，所以就算
    // 其他观众密集改票，自己的投票频道也始终不会变成 joined —— 这就是
    // "观众收不到其他人投票广播" 的根本原因（从来没有订阅那条频道）。
    for (let i = 0; i < voters.length; i++) {
      const voteState = await voters[i].evaluate(() => window.__voteChannelsForTest.vote.state);
      assert(voteState !== 'joined', '观众 #' + (i + 1) + ' 投票后，投票频道仍未订阅（结构上收不到别人的票）', voteState);
    }

    // ---------- 2) switching side overwrites, not double-counts ----------
    await vote(0, 'con'); // voter 0: pro -> con
    await waitHostCounts('改票后总票数不变、按新立场计数（1 正方 / 2 反方，共 3 人）');

    // ---------- 3) lock baseline, then switch votes -> deltas correct ----------
    // ---------- 2b) 赛前「锁票」：手机显示已结束，锁票后到达的票不计 ----------
    const baselineAtLock = expectedCounts();
    await host.evaluate(() => window.VoteHost.lockPre());
    await waitForText(host.locator('#votePhase'), (t) => t.includes('已锁票'), 5000, 'phase=paused');
    for (let i = 0; i < voters.length; i++) {
      await voters[i].waitForSelector('#closedBanner:not([hidden])', { timeout: 8000 });
      const dis = await voters[i].evaluate(() => document.getElementById('btnPro').disabled);
      assert(dis, '锁票后观众 #' + (i + 1) + ' 显示投票已结束、按钮禁用', dis);
    }
    // 绕过禁用的按钮强行发一票（模拟锁票瞬间迟到的票）：主持端必须忽略
    const countsAtLock = await host.locator('#voteCounts').textContent();
    await voters[2].evaluate(() => { const b = document.getElementById('btnPro'); b.disabled = false; b.click(); });
    await sleep(2500);
    const countsAfterLate = await host.locator('#voteCounts').textContent();
    assert(countsAfterLate === countsAtLock, '锁票后迟到的票不计入（票数不变）', { countsAtLock, countsAfterLate });

    // 重新开放 = 进入赛后投票，基准保持锁票时的票数
    await host.evaluate(() => window.VoteHost.reopen());
    await waitForText(host.locator('#votePhase'), (t) => t.includes('直播'), 5000, 'phase=live');
    await sleep(1500);
    await waitHostCounts('重新开放后，锁票期间那张迟到的票仍不计入，基准不变');
    await voters[2].waitForFunction(() => document.getElementById('closedBanner').hidden === true, null, { timeout: 8000 });
    assert(true, '重新开放后观众端横幅消失、可以继续投票');

    // 只改一票：如果连续改两票，中途的总票数可能和锁定基准前的总票数凑巧相等
    // （总数相同但归属不同），会让"等计数达到目标值"提前误判为改票已生效。
    await vote(1, 'con'); // voter 1: pro -> con
    await waitHostCounts('锁定基准后继续改票，票数条实时更新');

    const finalBeforeEnd = expectedCounts();
    await host.click('#voteEndBtn');
    await waitForText(host.locator('#votePhase'), (t) => t.includes('已结束'), 5000, 'phase=closed');
    await sleep(300);

    const resultCells = await host.locator('.vote-result-cell').allTextContents();
    const expectedDeltaPro = finalBeforeEnd.pro - baselineAtLock.pro;
    const expectedDeltaCon = finalBeforeEnd.con - baselineAtLock.con;
    const fmtDelta = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '+0');
    assert(
      resultCells[0].includes(String(finalBeforeEnd.pro)) && resultCells[0].includes('初始 ' + baselineAtLock.pro) && resultCells[0].includes(fmtDelta(expectedDeltaPro)),
      '正方结果：最终 ' + finalBeforeEnd.pro + '，初始 ' + baselineAtLock.pro + '，变化 ' + fmtDelta(expectedDeltaPro),
      resultCells[0]
    );
    assert(
      resultCells[1].includes(String(finalBeforeEnd.con)) && resultCells[1].includes('初始 ' + baselineAtLock.con) && resultCells[1].includes(fmtDelta(expectedDeltaCon)),
      '反方结果：最终 ' + finalBeforeEnd.con + '，初始 ' + baselineAtLock.con + '，变化 ' + fmtDelta(expectedDeltaCon),
      resultCells[1]
    );

    // ---------- 4) voters see "投票已结束" and their buttons are disabled ----------
    for (let i = 0; i < voters.length; i++) {
      await voters[i].waitForSelector('#closedBanner:not([hidden])', { timeout: 8000 });
      const proDisabled = await voters[i].locator('#btnPro').isDisabled();
      const conDisabled = await voters[i].locator('#btnCon').isDisabled();
      assert(proDisabled && conDisabled, '观众 #' + (i + 1) + ' 看到"投票已结束"，按钮禁用', { proDisabled, conDisabled });
    }

    // ---------- 5) reload host -> state restored, sync makes voters resend, counts stay consistent ----------
    const countsBeforeReload = await host.locator('#voteCounts').textContent();
    await host.reload();
    await host.click('#btnVote');
    await host.waitForSelector('#votePanel.open');
    await sleep(300);

    const roomAfterReload = ((await host.locator('#voteRoomCode').textContent()) || '').trim();
    assert(roomAfterReload === room, '刷新主持端后房间码从 localStorage 恢复', roomAfterReload);
    const phaseAfterReload = (await host.locator('#votePhase').textContent()) || '';
    assert(phaseAfterReload.includes('已结束'), '刷新主持端后阶段仍是已结束', phaseAfterReload);

    // give the reconnect + broadcastSync() + voter resend round-trip time to settle
    await sleep(2000);
    const countsAfterReload = await host.locator('#voteCounts').textContent();
    assert(countsAfterReload === countsBeforeReload, '主持端重连广播 sync、观众重发票后，票数和刷新前一致', { before: countsBeforeReload, after: countsAfterReload });

    // ---------- 6) reopen / reset works ----------
    await host.click('#voteResetBtn');
    await waitForText(host.locator('#votePhase'), (t) => t.includes('未开始'), 5000, 'phase=idle after reset');
    assert(true, '重置后阶段回到"未开始"');

    // voters should still be closed (idle broadcasts the same "closed" signal as the ended phase)
    for (let i = 0; i < voters.length; i++) {
      const closedHidden = await voters[i].locator('#closedBanner').isHidden();
      assert(!closedHidden, '重置后（投票还没重新开始）观众 #' + (i + 1) + ' 仍显示已结束', { closedHidden });
    }

    await host.click('#voteStartBtn');
    await waitForText(host.locator('#votePhase'), (t) => t.includes('投票中'), 5000, 'phase=collecting after reopen');

    for (let i = 0; i < voters.length; i++) {
      await voters[i].waitForFunction(() => document.getElementById('closedBanner').hidden === true, null, { timeout: 8000 });
      const proDisabled = await voters[i].locator('#btnPro').isDisabled();
      assert(!proDisabled, '重新开始投票后观众 #' + (i + 1) + ' 按钮恢复可点', { proDisabled });
    }

    mySide[0] = mySide[1] = mySide[2] = null;
    await vote(0, 'pro');
    await waitHostCounts('重开投票后新一轮计票从 0 开始、新票正确计入');

    // ---------- 主题同步：主持端切到「红蓝对决」，观众页跟着切 ----------
    await host.evaluate(() => {
      document.querySelector('#btnSettings').click();
      document.querySelector('#themeGroup .chip[data-theme="poster"]').click();
      document.querySelector('#drawerClose').click();
    });
    for (let i = 0; i < voters.length; i++) {
      let t = null;
      try { await voters[i].waitForFunction(() => document.body.dataset.theme === 'poster', null, { timeout: 8000 }); t = 'poster'; }
      catch (e) { t = await voters[i].evaluate(() => document.body.dataset.theme); }
      assert(t === 'poster', '观众 #' + (i + 1) + ' 同步到红蓝对决主题', t);
    }

    console.log('');
    console.log(passCount + ' passed, ' + failCount + ' failed');
    process.exitCode = failCount > 0 ? 1 : 0;
  } catch (e) {
    console.error('e2e-vote.js crashed:', e);
    process.exitCode = 1;
  } finally {
    await browser.close();
    server.close();
  }
}

main();
