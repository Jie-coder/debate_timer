/* scripts/e2e-pool.js — 雅哲杯 + 共用时间池自由辩论的浏览器端到端测试。
 * 用 Playwright 的假时钟快进，不依赖 Supabase。
 * Usage: node scripts/e2e-pool.js   （没装 playwright 时跳过） */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '..');
const PORT = 8936;
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) {
  console.log('playwright not installed — skipping e2e-pool.js'); process.exit(0);
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
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
  return new Promise((r) => server.listen(PORT, () => r(server)));
}
let pass = 0, fail = 0;
function assert(c, msg, actual) {
  if (c) pass++; else fail++;
  console.log((c ? 'PASS  ' : 'FAIL  ') + msg + (actual !== undefined ? '  actual=' + JSON.stringify(actual) : ''));
}
async function gotoTab(page, name) {
  await page.evaluate((n) => {
    const b = Array.from(document.querySelectorAll('#modeTabs .mode-tab')).find(x => x.textContent.trim() === n);
    b.click();
  }, name);
}
const EXPECT = [
  ['正一立论', 240], ['反二质询正一', 180], ['反一立论', 240], ['正二质询反一', 180],
  ['反二申论', 180], ['正二申论', 180], ['小讨论', 60], ['自由辩论', 600],
  ['讨论结论', 120], ['反方总结', 180], ['正方总结', 180],
];

(async () => {
  const server = await startServer();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', (e) => { fail++; console.log('FAIL  pageerror ' + e.message); });
    await page.clock.install();
    await page.goto('http://localhost:' + PORT + '/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // 1. 赛制可选，环节和时长正确
    await page.click('#btnSettings');
    const item = page.locator('.preset-item-builtin', { hasText: '雅哲杯' });
    assert(await item.count() === 1, '内置赛制里有「雅哲杯」');
    await item.locator('[data-action="load"]').click();
    await page.click('#drawerClose');
    const stages = await page.evaluate(() => JSON.parse(localStorage.getItem('debate-timer-v2')).stages);
    const timed = stages.filter(s => s.type !== 'cover' && s.type !== 'vote-pre' && s.type !== 'vote-final');
    assert(JSON.stringify(timed.map(s => [s.name, s.duration])) === JSON.stringify(EXPECT), '环节顺序与时长', timed.map(s => s.name + ' ' + s.duration).join(' / '));
    const fd = timed.find(s => s.name === '自由辩论');
    assert(fd && fd.type === 'pool' && fd.turn === 25, '自由辩论是共用时间池，单次 25 秒', fd);
    assert(timed.filter(s => s.name !== '自由辩论').every(s => s.type === 'single'), '其余环节都是单计时');

    // 跳到自由辩论
    await gotoTab(page, '自由辩论');
    assert(await page.locator('#pool').count() === 1, '自由辩论显示共用时间池界面');
    assert((await page.textContent('.pool-title')).includes('雅哲杯 · 自由辩论'), '标题「雅哲杯 · 自由辩论」');
    const sizes = await page.evaluate(() => {
      const fs = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
      return { turn: fs('#poolTurn'), left: fs('#poolLeft'), head: fs('#poolHeadLeft') };
    });
    assert(sizes.turn > sizes.left * 3 && sizes.turn > sizes.head * 3, '25 秒是最大的数字', sizes);
    const txt = async (sel) => (await page.textContent(sel)).trim();
    assert(await txt('#poolTurn') === '25' && await txt('#poolLeft') === '10:00', '初始 25 / 10:00');

    // 2. 共用总池递减
    // 中间控制行只剩换边 / 重置；开始暂停由底部按钮负责
    assert(await page.locator('#poolStart').count() === 0 && await page.locator('#poolSwitch').count() === 1 && await page.locator('#poolReset').count() === 1, '中间控制行无开始键，只有换边和重置');
    const startLabel = () => page.evaluate(() => document.getElementById('startLabel').textContent.trim());
    assert(await startLabel() === '开始', '底部按钮初始显示开始', await startLabel());
    await page.click('#btnStart');
    assert(await startLabel() === '暂停', '点底部按钮开始后显示暂停', await startLabel());
    await page.clock.runFor(3000);
    await page.click('#btnStart');
    assert(await startLabel() === '开始', '点底部按钮暂停后显示开始', await startLabel());
    const tp = await txt('#poolTurn');
    await page.clock.runFor(5000);
    assert(await txt('#poolTurn') === tp && tp === '22', '暂停期间不走', tp);
    await page.keyboard.press('Space');
    assert(await startLabel() === '暂停', '空格继续计时', await startLabel());
    await page.clock.runFor(4100);
    const t7 = await txt('#poolTurn');
    assert(t7 === '18', '跑 7 秒后单次剩 18', t7);
    assert(await txt('#poolLeft') === '09:53', '总池剩 09:53', await txt('#poolLeft'));
    assert(await page.locator('#poolSide_pro.active').count() === 1, '正方高亮');

    // 3. 手动换边重置 25 秒（快捷键 S）
    await page.keyboard.press('s');
    assert(await page.locator('#poolSide_con.active').count() === 1, 'S 换到反方');
    assert(await txt('#poolTurn') === '25', '换边后单次重置为 25', await txt('#poolTurn'));
    assert((await txt('#poolSwitch')).includes('换到正方'), '换边按钮文字跟着变');
    await page.click('#poolSwitch');
    assert(await page.locator('#poolSide_pro.active').count() === 1, '按钮换回正方');
    assert(await page.evaluate(() => document.getElementById('startLabel').textContent) === '暂停', '换边时继续计时');

    // 警示：最后 5 秒变红
    await page.clock.runFor(20500);
    assert(await page.locator('#poolTurn.warning').count() === 1, '最后 5 秒警示', await txt('#poolTurn'));

    // 4. 到 25 秒自动换边并继续
    await page.clock.runFor(5000);
    assert(await page.locator('#poolSide_con.active').count() === 1, '25 秒到自动换到反方');
    const t = Number(await txt('#poolTurn'));
    assert(t >= 24 && t <= 25, '自动换边后单次重置', t);
    assert(await page.evaluate(() => document.getElementById('startLabel').textContent) === '暂停', '自动换边后仍在计时');

    // 5. 总池不足 25 秒时，单次上限 = 总池剩余
    await page.keyboard.press('Space'); // 暂停
    const left = await page.evaluate(() => {
      const m = document.getElementById('poolLeft').textContent.split(':'); return Number(m[0]) * 60 + Number(m[1]);
    });
    // 连续换边把总池快速消耗：每次跑 24 秒再换边
    await page.keyboard.press('Space');
    let guard = 0;
    while (guard++ < 40) {
      const l = await page.evaluate(() => { const m = document.getElementById('poolLeft').textContent.split(':'); return Number(m[0]) * 60 + Number(m[1]); });
      if (l < 32) break;
      await page.clock.fastForward(20000);
      await page.clock.runFor(50);
      await page.keyboard.press('s');
    }
    await page.clock.runFor(10000);
    await page.keyboard.press('s');
    const capInfo = { turn: await txt('#poolTurn'), left: await txt('#poolLeft') };
    const capLeft = Number(capInfo.left.split(':')[1]) + Number(capInfo.left.split(':')[0]) * 60;
    assert(capLeft < 25 && Number(capInfo.turn) === capLeft, '总池不足 25 秒时换边，单次上限 = 总池剩余', capInfo);
    assert(left > 0, 'sanity', left);

    // 6. 总池归零即停，指向讨论结论
    await page.clock.runFor(20000);
    const end = { turn: await txt('#poolTurn'), left: await txt('#poolLeft'), label: await page.evaluate(() => document.getElementById('startLabel').textContent) };
    assert(end.left === '00:00' && end.turn === '0' && end.label === '已结束', '总池归零停下并显示已结束', end);
    await page.clock.runFor(3000);
    assert(await txt('#poolLeft') === '00:00', '归零后不再变化');
    await page.keyboard.press('ArrowRight');
    assert((await page.textContent('.single-label')).includes('讨论结论'), '下一环节是讨论结论');

    // 重置
    await page.keyboard.press('ArrowLeft');
    await page.click('#poolReset');
    assert(await txt('#poolTurn') === '25' && await txt('#poolLeft') === '10:00', '重置恢复 25 / 10:00');

    // 其他赛制的自由辩论不受影响
    await page.click('#btnSettings');
    await page.locator('.preset-item-builtin', { hasText: '世界杯' }).locator('[data-action="load"]').click();
    await page.click('#drawerClose');
    await gotoTab(page, '自由辩论');
    assert(await page.locator('#duel').count() === 1 && await page.locator('#pool').count() === 0, '世界杯的自由辩论仍是双计时');

    // 布局：所有共用画面元素必须在舞台框内（留呼吸空间），大数字仍是最大元素
    const THEMES = ['neo', 'arena', 'academy', 'soft', 'broadcast', 'terminal', 'poster'];
    const VPS = [[1920, 1080, 1], [1024, 560, 1.25], [1366, 768, 1]];
    for (const [w, h, dsf] of VPS) {
      const lp = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
      await lp.goto(`http://localhost:${PORT}/`);
      await lp.evaluate(() => localStorage.clear());
      await lp.reload();
      for (const theme of THEMES) {
        await lp.evaluate((t) => {
          document.querySelector('#btnSettings').click();
          [...document.querySelectorAll('.preset-item-builtin')].find(x => x.textContent.includes('雅哲杯')).querySelector('[data-action=load]').click();
          document.querySelector(`#themeGroup .chip[data-theme="${t}"]`).click();
          document.querySelector('#drawerClose').click();
          [...document.querySelectorAll('#modeTabs .mode-tab')].find(b => b.textContent.trim() === '自由辩论').click();
        }, theme);
        await lp.waitForTimeout(250);
        const r = await lp.evaluate(() => {
          const st = document.querySelector('.stage').getBoundingClientRect();
          const M = 8, bad = [];
          let biggest = null, bigH = 0;
          document.querySelectorAll('#pool *').forEach(e => {
            const b = e.getBoundingClientRect();
            if (!b.width || !b.height || e.offsetParent === null) return;
            if (b.top < st.top + M - 0.5 || b.bottom > st.bottom - M + 0.5 || b.left < st.left - 0.5 || b.right > st.right + 0.5)
              bad.push((e.id || e.className) + ' ' + Math.round(b.top) + '-' + Math.round(b.bottom) + ' in ' + Math.round(st.top) + '-' + Math.round(st.bottom));
            if (e.parentElement && e.parentElement.id === 'pool' && b.height > bigH) { bigH = b.height; biggest = e.id || e.className; }
          });
          const fs = (sel) => parseFloat(getComputedStyle(document.querySelector(sel)).fontSize);
          return { bad, biggest, turnFs: fs('#poolTurn'), labelFs: fs('.pool-side-label') };
        });
        const tag = `${theme} ${w}x${h}`;
        assert(r.bad.length === 0, `${tag}: 所有元素都在舞台框内`, r.bad.slice(0, 3));
        assert(r.biggest === 'poolTurn' && r.turnFs >= r.labelFs * 2.5, `${tag}: 25 秒数字是最大元素`, r);
      }
      await lp.close();
    }

  } finally {
    await browser.close();
    server.close();
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
