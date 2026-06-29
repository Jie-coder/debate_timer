(() => {
'use strict';

/* ============================================================
     Debate Timer — core logic
     ============================================================ */
  const DEFAULT_STAGES = [
    { id: 'cover', name: '\u9996\u9875', type: 'cover', duration: 0 },
    { id: 's1', name: '\u6b63\u65b9\u9648\u8bcd', type: 'single', duration: 180 },
    { id: 's2', name: '\u53cd\u65b9\u8d28\u8be2', type: 'single', duration: 90 },
    { id: 's3', name: '\u53cd\u65b9\u9648\u8bcd', type: 'single', duration: 180 },
    { id: 's4', name: '\u5bf9\u8fa9', type: 'duel', duration: 120 },
    { id: 's5', name: '\u6b63\u65b9\u9648\u8bcd', type: 'single', duration: 180 },
    { id: 's6', name: '\u81ea\u7531\u8fa9\u8bba', type: 'duel', duration: 240 },
    { id: 's7', name: '\u7ed3\u8fa9', type: 'single', duration: 240 },
  ];

  // Built-in competition formats (selectable from the drawer, not deletable)
  const BUILT_IN_PRESETS = [
    {
      name: '华中杯',
      stages: [
        { name: '一辩申论', type: 'single', duration: 240 },
        { name: '二辩质询', type: 'single', duration: 180 },
        { name: '一辩申论', type: 'single', duration: 240 },
        { name: '三辩质询', type: 'single', duration: 180 },
        { name: '二辩申论', type: 'single', duration: 240 },
        { name: '三辩质询', type: 'single', duration: 180 },
        { name: '二辩申论', type: 'single', duration: 240 },
        { name: '一辩质询', type: 'single', duration: 180 },
        { name: '三辩申论', type: 'single', duration: 240 },
        { name: '一辩质询', type: 'single', duration: 180 },
        { name: '三辩申论', type: 'single', duration: 240 },
        { name: '二辩质询', type: 'single', duration: 180 },
        { name: '中休', type: 'single', duration: 120 },
        { name: '结辩', type: 'single', duration: 240 },
        { name: '结辩', type: 'single', duration: 240 },
      ],
    },
  ];

  // Per-stage runtime cache: stageId -> { remaining, duelPro, duelCon, duelActive }
  const runtimeCache = {};
  function getRuntime(id) {
    if (!runtimeCache[id]) {
      const stg = state.stages.find(s => s.id === id);
      if (!stg) return null;
      runtimeCache[id] = stg.type === 'duel'
        ? { duelPro: stg.duration, duelCon: stg.duration, duelActive: 'pro' }
        : { remaining: stg.duration };
    }
    return runtimeCache[id];
  }

  const state = {
    stages: DEFAULT_STAGES.map(s => ({...s})),
    currentId: 'cover',
    theme: 'warm',
    fontScale: 1,
    sound: true,
    tick: true,
    autoFlow: false,
    proName: '\u5a01\u5357\u65e5\u65b0\u56fd\u6c11\u578b\u4e2d\u5b66',
    conName: '\u97e9\u6c5f\u4e2d\u5b66',
    topic: '',
    matchStage: '2026 \u534e\u4e2d\u676f \u521d\u8d5b',
    // runtime
    running: false,
    remaining: 180,
    duel: { pro: 120, con: 120, active: 'pro' },
    lastTick: 0,
  };

  function curStage() {
    return state.stages.find(s => s.id === state.currentId) || state.stages[0];
  }
  function curMode() { return curStage().type; } // 'single' | 'duel'
  function curDuration() { return curStage().duration; }
  function curName() { return curStage().name; }
  function ensureCoverStage() {
    const base = DEFAULT_STAGES.find(s => s.type === 'cover') || { id: 'cover', name: '\u9996\u9875', type: 'cover', duration: 0 };
    if (!Array.isArray(state.stages)) state.stages = [];
    let coverIndex = state.stages.findIndex(s => s.type === 'cover' || s.id === 'cover');
    let cover = coverIndex >= 0 ? state.stages.splice(coverIndex, 1)[0] : { ...base };
    cover.id = 'cover';
    cover.type = 'cover';
    cover.duration = 0;
    cover.name = cover.name || base.name;
    state.stages = state.stages.map(s => ({
      ...s,
      type: s.type === 'duel' ? 'duel' : (s.type === 'cover' ? 'cover' : 'single'),
      duration: s.type === 'cover' ? 0 : Math.max(10, Number(s.duration) || 60),
    }));
    state.stages.unshift(cover);
  }

  /* ---------------- LocalStorage ---------------- */
  const STORAGE_KEY = 'debate-timer-v2';
  const PRESETS_KEY = 'debate-timer-v2-presets';
  let timerPresets = [];
  function saveState() {
    const s = {
      stages: state.stages, currentId: state.currentId,
      theme: state.theme,
      fontScale: state.fontScale, sound: state.sound, tick: state.tick,
      autoFlow: state.autoFlow, proName: state.proName, conName: state.conName,
      topic: state.topic, matchStage: state.matchStage,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch (e) {}
  }
  function loadState() {
    try {
      const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!s) return;
      Object.assign(state, s);
      if (typeof state.matchStage !== 'string') state.matchStage = '2026 \u534e\u4e2d\u676f \u521d\u8d5b';
      if (!Array.isArray(state.stages) || state.stages.length === 0) {
        state.stages = DEFAULT_STAGES.map(x => ({...x}));
        state.currentId = state.stages[0].id;
      }
      ensureCoverStage();
      if (!state.stages.find(x => x.id === state.currentId)) {
        state.currentId = state.stages[0].id;
      }
      delete state['display'];
      delete state['timerScale'];
      saveState();
    } catch (e) {}
  }

  /* ---------------- Audio (WebAudio) ---------------- */
  let audioCtx;
  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function beep(freq = 660, duration = 0.12, type = 'sine', gain = 0.15) {
    if (!state.sound) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.02);
  }
  function beepEnd() {
    if (!state.sound) return;
    beep(880, 0.2, 'sine', 0.2);
    setTimeout(() => beep(660, 0.25, 'sine', 0.2), 220);
    setTimeout(() => beep(440, 0.4, 'sine', 0.2), 480);
    // vibrate if supported
    if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
  }
  function beepTick() {
    if (!state.sound || !state.tick) return;
    beep(880, 0.06, 'square', 0.08);
  }
  function beep30() {
    if (!state.sound) return;
    beep(520, 0.18, 'triangle', 0.12);
  }

  /* ---------------- Rendering ---------------- */
  const stage = document.getElementById('stage');

  function formatTime(sec) {
    const over = sec < 0;
    const abs = Math.abs(sec);
    const m = Math.floor(abs / 60);
    const s = Math.floor(abs % 60);
    return (over ? '-' : '') + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  }

  function renderStage() {
    stage.innerHTML = '';
    const mode = curMode();
    document.body.dataset.screen = mode;
    stage.className = 'stage stage-' + mode;
    if (mode === 'cover') {
      renderCover();
    } else if (mode === 'duel') {
      renderDuel();
    } else {
      renderSingle();
    }
    updateTimes();
  }

  function renderCover() {
    stage.innerHTML =
      '<section class="cover-page" aria-label="\u6bd4\u8d5b\u9996\u9875">' +
        '<div class="cover-head">' +
          '<div class="cover-kicker">' +
            '<label class="cover-visually-hidden" for="coverMatchStage">\u6bd4\u8d5b\u8d5b\u6bb5</label>' +
            '<input id="coverMatchStage" class="cover-input cover-match-input" maxlength="40" value="' + escapeHtml(state.matchStage || '') + '" placeholder="2026 \u534e\u4e2d\u676f \u521d\u8d5b">' +
          '</div>' +
          '<textarea id="coverTopic" class="cover-input cover-topic-input" rows="2" maxlength="80" placeholder="\u8fa9\u9898">' + escapeHtml(state.topic || '') + '</textarea>' +
          '<div class="cover-title-rule"></div>' +
        '</div>' +
        '<div class="cover-matchup">' +
          '<label class="cover-team cover-team-pro" for="coverProSchool">' +
            '<span class="cover-team-tag">\u6b63\u65b9</span>' +
            '<input id="coverProSchool" class="cover-input cover-team-name" maxlength="32" value="' + escapeHtml(state.proName || '') + '" placeholder="\u6b63\u65b9\u5b66\u6821">' +
          '</label>' +
          '<div class="cover-vs" aria-hidden="true">VS</div>' +
          '<label class="cover-team cover-team-con" for="coverConSchool">' +
            '<span class="cover-team-tag">\u53cd\u65b9</span>' +
            '<input id="coverConSchool" class="cover-input cover-team-name" maxlength="32" value="' + escapeHtml(state.conName || '') + '" placeholder="\u53cd\u65b9\u5b66\u6821">' +
          '</label>' +
        '</div>' +
      '</section>';
    wireCoverInputs();
  }

  function setFieldValue(id, value) {
    const el = document.getElementById(id);
    if (el && el !== document.activeElement) el.value = value || '';
  }

  function syncCoverFields() {
    setFieldValue('coverMatchStage', state.matchStage || '');
    setFieldValue('coverTopic', state.topic || '');
    setFieldValue('coverProSchool', state.proName || '');
    setFieldValue('coverConSchool', state.conName || '');
  }

  function syncHeaderTopic() {
    setFieldValue('topicInput', state.topic || '');
  }

  function wireCoverInputs() {
    const bind = (id, key, max, after) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', e => {
        state[key] = e.target.value.slice(0, max);
        if (typeof after === 'function') after();
        saveState();
      });
    };
    bind('coverMatchStage', 'matchStage', 40);
    bind('coverTopic', 'topic', 80, () => { syncHeaderTopic(); });
    bind('coverProSchool', 'proName', 32, () => { updateTimes(); applyInputs(); });
    bind('coverConSchool', 'conName', 32, () => { updateTimes(); applyInputs(); });
  }

  
  function renderSingle() {
    const total = curDuration();
    const name = curName();
    stage.innerHTML = `
      <div class="single-timer">
        <div class="single-label">${name}</div>
        <div class="single-time editable-time" id="timeDisplay" data-target="single">${formatTime(state.remaining)}</div>
        <div class="progress-wrap">
          <div class="progress-meta">
            <span id="elapsedLabel">已用 00:00</span>
            <span id="totalLabel">共 ${formatTime(total)}</span>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" id="progressFill" style="width: 100%"></div>
          </div>
        </div>
        <div class="timer-actions">
          <button class="timer-action-btn" id="btnResetSingle" title="重置 (R)">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            重置
          </button>
        </div>
      </div>`;
    document.getElementById('btnResetSingle').addEventListener('click', () => {
      state.running = false;
      state.remaining = curDuration();
      updateStartButton();
      updateTimes();
    });
    wireEditableTime();
  }

  function wireEditableTime() {
    document.querySelectorAll('.editable-time').forEach(el => {
      el.addEventListener('click', () => startEditTime(el));
    });
  }

  function startEditTime(el) {
    if (state.running) return;
    const target = el.dataset.target; // single | pro | con
    const cur = target === 'single' ? state.remaining
              : target === 'pro' ? state.duel.pro : state.duel.con;
    const initial = formatTime(Math.max(0, Math.ceil(cur)));
    el.classList.add('editing');
    const orig = el.textContent;
    el.contentEditable = 'true';
    el.textContent = initial;
    const range = document.createRange();
    range.selectNodeContents(el);
    const sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(range);
    el.focus();
    const finish = (commit) => {
      el.contentEditable = 'false';
      el.classList.remove('editing');
      el.removeEventListener('blur', onBlur);
      el.removeEventListener('keydown', onKey);
      if (commit) {
        const v = parseTimeStr(el.textContent.trim());
        if (v != null && v >= 0) {
          // update both duration of stage and remaining
          const stg = curStage();
          stg.duration = Math.max(10, v || 10);
          if (target === 'single') state.remaining = v;
          else if (target === 'pro') state.duel.pro = v;
          else if (target === 'con') state.duel.con = v;
          // refresh runtime cache
          getRuntime(stg.id);
          if (stg.type === 'duel') {
            runtimeCache[stg.id].duelPro = state.duel.pro;
            runtimeCache[stg.id].duelCon = state.duel.con;
          } else {
            runtimeCache[stg.id].remaining = state.remaining;
          }
          saveState();
          renderStagesList();
          renderStage();
          return;
        }
      }
      el.textContent = orig;
    };
    const onBlur = () => finish(true);
    const onKey = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); el.blur(); }
      else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };
    el.addEventListener('blur', onBlur);
    el.addEventListener('keydown', onKey);
  }

  function parseTimeStr(s) {
    if (!s) return null;
    s = s.replace(/[–—−]/g, '-').trim();
    if (/^\d+$/.test(s)) return parseInt(s);
    const m = s.match(/^(-?)(\d+):(\d{1,2})$/);
    if (!m) return null;
    const sign = m[1] === '-' ? -1 : 1;
    const min = parseInt(m[2]); const sec = parseInt(m[3]);
    if (sec >= 60) return null;
    return sign * (min * 60 + sec);
  }

  
  
  function renderDuel() {
    stage.innerHTML = `
      <div class="duel" id="duel">
        <div class="duel-panel active" data-side="pro" id="panelPro">
          <div class="duel-side">
            <div class="duel-side-label">A · 正方</div>
            <div class="duel-side-name" id="proNameEl">\u6b63\u65b9</div>
            <div class="duel-status">计时中</div>
          </div>
          <div class="duel-time editable-time" id="proTime" data-target="pro">${formatTime(state.duel.pro)}</div>
          <button class="duel-reset-btn" id="btnResetPro" title="重置正方">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            <span>重置</span>
          </button>
          <div class="duel-progress"><div class="duel-progress-fill" id="proProgress" style="width:100%"></div></div>
        </div>
        <div class="duel-panel inactive" data-side="con" id="panelCon">
          <div class="duel-side">
            <div class="duel-side-label">B · 反方</div>
            <div class="duel-side-name" id="conNameEl">\u53cd\u65b9</div>
            <div class="duel-status">待命</div>
          </div>
          <div class="duel-time editable-time" id="conTime" data-target="con">${formatTime(state.duel.con)}</div>
          <button class="duel-reset-btn" id="btnResetCon" title="重置反方">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 109-9 9.75 9.75 0 00-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            <span>重置</span>
          </button>
          <div class="duel-progress"><div class="duel-progress-fill" id="conProgress" style="width:100%"></div></div>
        </div>
        <div class="duel-divider">VS</div>
      </div>`;
    document.getElementById('panelPro').addEventListener('click', (e) => {
      if (e.target.closest('.duel-reset-btn') || e.target.closest('.editable-time')) return;
      if (curMode() !== 'duel') return;
      if (!state.running) { state.duel.active = 'pro'; toggleRun(); }
      else { state.duel.active = state.duel.active === 'pro' ? 'con' : 'pro'; }
      updateDuelActive();
    });
    document.getElementById('panelCon').addEventListener('click', (e) => {
      if (e.target.closest('.duel-reset-btn') || e.target.closest('.editable-time')) return;
      if (curMode() !== 'duel') return;
      if (!state.running) { state.duel.active = 'con'; toggleRun(); }
      else { state.duel.active = state.duel.active === 'pro' ? 'con' : 'pro'; }
      updateDuelActive();
    });
    document.getElementById('btnResetPro').addEventListener('click', (e) => {
      e.stopPropagation();
      state.duel.pro = curDuration();
      const rt = getRuntime(curStage().id);
      if (rt) rt.duelPro = state.duel.pro;
      updateTimes();
    });
    document.getElementById('btnResetCon').addEventListener('click', (e) => {
      e.stopPropagation();
      state.duel.con = curDuration();
      const rt = getRuntime(curStage().id);
      if (rt) rt.duelCon = state.duel.con;
      updateTimes();
    });
    wireEditableTime();
  }

  function updateDuelActive() {
    const pro = document.getElementById('panelPro');
    const con = document.getElementById('panelCon');
    if (!pro || !con) return;
    if (state.duel.active === 'pro') {
      pro.classList.add('active'); pro.classList.remove('inactive');
      con.classList.add('inactive'); con.classList.remove('active');
      pro.querySelector('.duel-status').textContent = '计时中';
      con.querySelector('.duel-status').textContent = state.running ? '暂停中' : '待命';
    } else {
      con.classList.add('active'); con.classList.remove('inactive');
      pro.classList.add('inactive'); pro.classList.remove('active');
      con.querySelector('.duel-status').textContent = '计时中';
      pro.querySelector('.duel-status').textContent = state.running ? '暂停中' : '待命';
    }
  }

  
  function updateTimes() {
    if (curMode() === 'cover') {
      syncCoverFields();
      syncHeaderTopic();
      return;
    }
    if (curMode() === 'duel') {
      const proEl = document.getElementById('proTime');
      const conEl = document.getElementById('conTime');
      const proProg = document.getElementById('proProgress');
      const conProg = document.getElementById('conProgress');
      const total = curDuration();
      if (proEl && !proEl.classList.contains('editing')) {
        proEl.textContent = formatTime(state.duel.pro);
        proEl.className = 'duel-time editable-time' + warnClass(state.duel.pro, total);
      }
      if (conEl && !conEl.classList.contains('editing')) {
        conEl.textContent = formatTime(state.duel.con);
        conEl.className = 'duel-time editable-time' + warnClass(state.duel.con, total);
      }
      if (proProg) proProg.style.width = Math.max(0, state.duel.pro / total * 100) + '%';
      if (conProg) conProg.style.width = Math.max(0, state.duel.con / total * 100) + '%';
      const proName = document.getElementById('proNameEl');
      const conName = document.getElementById('conNameEl');
      if (proName) proName.textContent = '\u6b63\u65b9';
      if (conName) conName.textContent = '\u53cd\u65b9';
    } else {
      const total = curDuration();
      const disp = document.getElementById('timeDisplay');
      if (disp && !disp.classList.contains('editing')) {
        disp.textContent = formatTime(state.remaining);
        disp.className = 'single-time editable-time' + warnClass(state.remaining, total);
      }
      const fill = document.getElementById('progressFill');
      if (fill) {
        fill.style.width = Math.max(0, state.remaining / total * 100) + '%';
        fill.className = 'progress-fill' + (state.remaining <= 30 && state.remaining > 0 ? ' warning' : '');
      }
      const elapsed = document.getElementById('elapsedLabel');
      if (elapsed) elapsed.textContent = '\u5df2\u7528 ' + formatTime(total - Math.max(0, state.remaining));
    }
  }

  function warnClass(sec, total) {
    if (sec <= 0) return ' overtime';
    if (sec <= 30) return ' warning';
    return '';
  }

  /* ---------------- Tick loop ---------------- */
  let rafId = null;
  function loop(ts) {
    if (!state.running) { rafId = null; return; }
    if (!state.lastTick) state.lastTick = ts;
    const delta = (ts - state.lastTick) / 1000;
    state.lastTick = ts;

    let prevWhole;
    if (curMode() === 'duel') {
      const k = state.duel.active;
      prevWhole = Math.ceil(state.duel[k]);
      state.duel[k] -= delta;
      checkBeeps(prevWhole, state.duel[k], curDuration());
    } else {
      prevWhole = Math.ceil(state.remaining);
      state.remaining -= delta;
      checkBeeps(prevWhole, state.remaining, curDuration());
    }
    updateTimes();
    rafId = requestAnimationFrame(loop);
  }

  function checkBeeps(prev, now, total) {
    const prevSec = Math.ceil(prev);
    const nowSec = Math.ceil(now);
    if (prevSec === nowSec) return;
    // 30s warning
    if (prevSec === 31 && nowSec <= 30 && nowSec > 0) {
      beep30();
    }
    // last 10s ticks
    if (nowSec <= 10 && nowSec > 0 && prevSec !== nowSec) {
      beepTick();
    }
    // zero
    if (prevSec > 0 && nowSec <= 0) {
      beepEnd();
      flashScreen();
      handleTimeUp();
    }
  }

  function handleTimeUp() {
    if (curMode() === 'duel') {
      // Auto-switch to the other side if it still has time
      const other = state.duel.active === 'pro' ? 'con' : 'pro';
      if (state.duel[other] > 0) {
        state.duel.active = other;
        // keep running
        updateDuelActive();
        updateTimes();
      } else {
        state.running = false;
        updateStartButton();
      }
    } else {
      state.running = false;
      updateStartButton();
      if (state.autoFlow) {
        setTimeout(() => nextStage(), 1200);
      }
    }
  }

  function flashScreen() {
    const f = document.getElementById('flash');
    f.classList.add('on');
    setTimeout(() => f.classList.remove('on'), 180);
    setTimeout(() => f.classList.add('on'), 320);
    setTimeout(() => f.classList.remove('on'), 520);
  }

  /* ---------------- Controls ---------------- */
  function toggleRun() {
    if (curMode() === 'cover') return;
    ensureAudio();
    state.running = !state.running;
    state.lastTick = 0;
    if (state.running && !rafId) rafId = requestAnimationFrame(loop);
    updateStartButton();
    if (curMode() === 'duel') updateDuelActive();
  }

  function resetTimer() {
    state.running = false;
    updateStartButton();
    if (curMode() === 'cover') {
      updateTimes();
      return;
    }
    if (curMode() === 'duel') {
      state.duel.pro = curDuration();
      state.duel.con = curDuration();
      state.duel.active = 'pro';
      const rt = getRuntime(curStage().id);
      rt.duelPro = state.duel.pro; rt.duelCon = state.duel.con; rt.duelActive = 'pro';
    } else {
      state.remaining = curDuration();
      const rt = getRuntime(curStage().id);
      rt.remaining = state.remaining;
    }
    updateTimes();
    if (curMode() === 'duel') updateDuelActive();
  }

  function setCurrent(id) {
    if (!state.stages.find(s => s.id === id)) return;
    // Save current runtime to cache
    saveCurrentRuntime();
    state.currentId = id;
    state.running = false;
    // Restore from cache (preserves remaining)
    const rt = getRuntime(id);
    if (curMode() === 'cover') {
      state.remaining = 0;
    } else if (curMode() === 'duel') {
      state.duel.pro = rt.duelPro;
      state.duel.con = rt.duelCon;
      state.duel.active = rt.duelActive || 'pro';
    } else {
      state.remaining = rt.remaining;
    }
    renderModeTabs();
    renderStage();
    updateStartButton();
    updateFlowDots();
    saveState();
  }

  function saveCurrentRuntime() {
    const id = state.currentId;
    const rt = getRuntime(id);
    if (!rt) return;
    if (curMode() === 'cover') {
      return;
    }
    if (curMode() === 'duel') {
      rt.duelPro = state.duel.pro;
      rt.duelCon = state.duel.con;
      rt.duelActive = state.duel.active;
    } else {
      rt.remaining = state.remaining;
    }
  }

  function nextStage() {
    const i = state.stages.findIndex(s => s.id === state.currentId);
    const n = (i + 1) % state.stages.length;
    setCurrent(state.stages[n].id);
  }
  function prevStage() {
    const i = state.stages.findIndex(s => s.id === state.currentId);
    const n = (i - 1 + state.stages.length) % state.stages.length;
    setCurrent(state.stages[n].id);
  }

  function renderModeTabs() {
    const tabs = document.getElementById('modeTabs');
    tabs.innerHTML = '';
    state.stages.forEach(s => {
      const b = document.createElement('button');
      b.className = 'mode-tab' + (s.id === state.currentId ? ' active' : '');
      b.dataset.id = s.id;
      b.textContent = s.name;
      tabs.appendChild(b);
    });
  }

  function updateStartButton() {
    const label = document.getElementById('startLabel');
    const icon = document.getElementById('iconPlay');
    const btn = document.getElementById('btnStart');
    if (curMode() === 'cover') {
      if (btn) { btn.disabled = true; btn.classList.add('disabled'); }
      label.textContent = '\u65e0\u8ba1\u65f6';
      icon.innerHTML = '<path d="M5 12h14"/>';
      return;
    }
    if (btn) { btn.disabled = false; btn.classList.remove('disabled'); }
    if (state.running) {
      label.textContent = '\u6682\u505c';
      icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    } else {
      label.textContent = state.remaining <= 0 && curMode() !== 'duel' ? '\u5df2\u7ed3\u675f' : '\u5f00\u59cb';
      icon.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"/>';
    }
  }

  function updateFlowDots() {
    const dots = document.getElementById('flowDots');
    dots.innerHTML = '';
    const curIdx = state.stages.findIndex(s => s.id === state.currentId);
    state.stages.forEach((stg, i) => {
      const d = document.createElement('div');
      d.className = 'flow-dot' + (i === curIdx ? ' current' : i < curIdx ? ' done' : '');
      d.title = stg.name;
      dots.appendChild(d);
    });
    const ft = document.getElementById('flowText');
    if (ft) ft.textContent = '流程：' + state.stages.map(s => s.name).join(' → ');
  }

  /* ---------------- Stages drawer list ---------------- */
  function renderStagesList() {
    const list = document.getElementById('stagesList');
    list.innerHTML = '';
    state.stages.forEach((stg, idx) => {
      const isCover = stg.type === 'cover';
      const row = document.createElement('div');
      row.className = 'stage-row';
      row.draggable = true;
      row.dataset.idx = idx;
      row.innerHTML = `
        <span class="stage-grip">⋮⋮</span>
        <input class="stage-name-input" value="${stg.name.replace(/"/g, '&quot;')}" maxlength="10">
        <button class="stage-type-pill" data-type="${stg.type}" title="${isCover ? '\u9996\u9875\u4e0d\u53c2\u4e0e\u8ba1\u65f6' : '\u5207\u6362\u7c7b\u578b'}" ${isCover ? 'disabled' : ''}>${isCover ? '\u9996\u9875' : (stg.type === 'duel' ? '\u53cc' : '\u5355')}</button>
        <input type="number" class="stage-dur-input" value="${stg.duration}" min="0" step="10" ${isCover ? 'disabled' : ''}>
        <span style="font-size:10px;color:var(--ink-3);font-family:'JetBrains Mono',monospace;">s</span>
        <button class="stage-del" title="\u5220\u9664" ${isCover ? 'disabled' : ''}>\u00d7</button>
      `;
      // name
      row.querySelector('.stage-name-input').addEventListener('input', (e) => {
        stg.name = e.target.value.slice(0, 10) || '环节';
        renderModeTabs(); updateFlowDots();
        if (stg.id === state.currentId) renderStage();
        saveState();
      });
      // type toggle
      row.querySelector('.stage-type-pill').addEventListener('click', (e) => {
        if (stg.type === 'cover') return;
        stg.type = stg.type === 'duel' ? 'single' : 'duel';
        delete runtimeCache[stg.id];
        renderStagesList(); renderModeTabs(); updateFlowDots();
        if (stg.id === state.currentId) { resetTimer(); renderStage(); }
        saveState();
      });
      // duration
      row.querySelector('.stage-dur-input').addEventListener('change', (e) => {
        if (stg.type === 'cover') return;
        const v = Math.max(10, parseInt(e.target.value) || 10);
        stg.duration = v; e.target.value = v;
        // invalidate cache so the new duration takes effect
        delete runtimeCache[stg.id];
        if (stg.id === state.currentId && !state.running) { resetTimer(); renderStage(); }
        saveState();
      });
      // delete
      row.querySelector('.stage-del').addEventListener('click', () => {
        if (stg.type === 'cover') return;
        if (state.stages.length <= 1) return;
        const wasCurrent = stg.id === state.currentId;
        state.stages = state.stages.filter(s => s.id !== stg.id);
        if (wasCurrent) state.currentId = state.stages[0].id;
        renderStagesList(); renderModeTabs(); updateFlowDots();
        if (wasCurrent) { resetTimer(); renderStage(); }
        saveState();
      });
      // drag
      row.addEventListener('dragstart', (e) => {
        row.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(idx));
      });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('drag-over'); });
      row.addEventListener('dragleave', () => row.classList.remove('drag-over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault();
        row.classList.remove('drag-over');
        const from = parseInt(e.dataTransfer.getData('text/plain'));
        const to = idx;
        if (from === to) return;
        const item = state.stages.splice(from, 1)[0];
        state.stages.splice(to, 0, item);
        ensureCoverStage();
        renderStagesList(); renderModeTabs(); updateFlowDots();
        saveState();
      });
      list.appendChild(row);
    });
  }

  function addStage(name, type, dur) {
    const id = 's' + Date.now() + Math.floor(Math.random()*1000);
    state.stages.push({ id, name, type, duration: dur });
    ensureCoverStage();
    renderStagesList(); renderModeTabs(); updateFlowDots();
    saveState();
  }

  /* ---------------- Preset storage ---------------- */
  function clearRuntimeCache() {
    Object.keys(runtimeCache).forEach(k => delete runtimeCache[k]);
  }

  function cloneStages(stages) {
    return stages.map(s => ({ id: s.id, name: s.name, type: s.type, duration: s.duration }));
  }

  function loadTimerPresets() {
    try {
      const data = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]');
      return Array.isArray(data) ? data.slice(0, 3) : [];
    } catch (e) {
      return [];
    }
  }

  function saveTimerPresets() {
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(timerPresets.slice(0, 3))); } catch (e) {}
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function currentPresetSnapshot(name) {
    return {
      id: 'p' + Date.now() + Math.floor(Math.random() * 1000),
      name,
      currentId: state.currentId,
      stages: cloneStages(state.stages),
      savedAt: Date.now(),
    };
  }

  function setPresetStatus(text) {
    const el = document.getElementById('presetStatus');
    if (!el) return;
    el.textContent = text || '';
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 1800);
  }

  function renderPresetList() {
    const list = document.getElementById('presetList');
    if (!list) return;
    list.innerHTML = '';

    const makeItem = (preset, builtin) => {
      const item = document.createElement('div');
      item.className = 'preset-item' + (builtin ? ' preset-item-builtin' : '');
      const totalSeconds = preset.stages.reduce((sum, stg) => sum + (Number(stg.duration) || 0), 0);
      const tag = builtin ? ' <span class="preset-tag">内置</span>' : '';
      let actions = '<button class="chip preset-chip" data-action="load">套用</button>';
      if (!builtin) {
        actions += '<button class="chip preset-chip" data-action="rename">改名</button>' +
                   '<button class="chip preset-chip" data-action="update">更新</button>' +
                   '<button class="chip preset-chip preset-chip-danger" data-action="delete">删除</button>';
      }
      item.innerHTML = '<div class="preset-info">' +
        '<div class="preset-title">' + escapeHtml(preset.name) + tag + '</div>' +
        '<div class="preset-meta">' + preset.stages.length + ' 环节 · ' + formatTime(totalSeconds) + '</div>' +
        '</div>' +
        '<div class="preset-actions">' + actions + '</div>';
      const on = (act, fn) => { const b = item.querySelector('[data-action="' + act + '"]'); if (b) b.addEventListener('click', fn); };
      if (builtin) {
        on('load', () => loadBuiltInPreset(preset.name));
      } else {
        on('load', () => loadTimerPreset(preset.id));
        on('rename', () => renameTimerPreset(preset.id));
        on('update', () => updateTimerPreset(preset.id));
        on('delete', () => deleteTimerPreset(preset.id));
      }
      return item;
    };

    const label = (text) => {
      const el = document.createElement('div');
      el.className = 'preset-group-label';
      el.textContent = text;
      list.appendChild(el);
    };

    label('内置赛制');
    BUILT_IN_PRESETS.forEach(p => list.appendChild(makeItem(p, true)));

    label('我的计时器 (' + timerPresets.length + '/3)');
    if (timerPresets.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'preset-empty';
      empty.textContent = '还没有。设置好环节后，点上方「新建」保存为计时器。';
      list.appendChild(empty);
    } else {
      timerPresets.forEach(p => list.appendChild(makeItem(p, false)));
    }
  }

  function saveTimerPresetFromInput() {
    const input = document.getElementById('presetNameInput');
    const name = (input ? input.value : '').trim();
    if (!name) { setPresetStatus('先输入名称'); return; }
    const existing = timerPresets.find(p => p.name === name);
    if (existing) {
      existing.currentId = state.currentId;
      existing.stages = cloneStages(state.stages);
      existing.savedAt = Date.now();
      setPresetStatus('已修改');
    } else {
      if (timerPresets.length >= 3) { setPresetStatus('最多 3 个'); return; }
      timerPresets.push(currentPresetSnapshot(name));
      setPresetStatus('已保存');
    }
    if (input) input.value = '';
    saveTimerPresets();
    renderPresetList();
  }

  function applyStageSet(stages, label) {
    state.running = false;
    const base = Date.now();
    state.stages = stages.map((st, i) => ({
      id: 'b' + base + '_' + i,
      name: st.name, type: st.type, duration: st.duration,
    }));
    ensureCoverStage();
    state.currentId = state.stages[0].id;
    clearRuntimeCache();
    resetTimer();
    renderStagesList();
    renderModeTabs();
    renderStage();
    updateFlowDots();
    updateStartButton();
    saveState();
    setPresetStatus(label ? ('已套用 ' + label) : '已套用');
  }

  function loadBuiltInPreset(name) {
    const preset = BUILT_IN_PRESETS.find(p => p.name === name);
    if (!preset) return;
    applyStageSet(preset.stages, preset.name);
  }

  function loadTimerPreset(id) {
    const preset = timerPresets.find(p => p.id === id);
    if (!preset) return;
    state.running = false;
    state.stages = cloneStages(preset.stages);
    ensureCoverStage();
    state.currentId = state.stages.find(s => s.id === preset.currentId) ? preset.currentId : state.stages[0].id;
    clearRuntimeCache();
    resetTimer();
    renderStagesList();
    renderModeTabs();
    renderStage();
    updateFlowDots();
    updateStartButton();
    saveState();
    setPresetStatus('已套用');
  }

  function updateTimerPreset(id) {
    const preset = timerPresets.find(p => p.id === id);
    if (!preset) return;
    preset.currentId = state.currentId;
    preset.stages = cloneStages(state.stages);
    preset.savedAt = Date.now();
    saveTimerPresets();
    renderPresetList();
    setPresetStatus('已修改');
  }

  function renameTimerPreset(id) {
    const preset = timerPresets.find(p => p.id === id);
    if (!preset) return;
    const name = (window.prompt('计时器名称', preset.name) || '').trim();
    if (!name) return;
    preset.name = name.slice(0, 24);
    saveTimerPresets();
    renderPresetList();
    setPresetStatus('已改名');
  }

  function deleteTimerPreset(id) {
    timerPresets = timerPresets.filter(p => p.id !== id);
    saveTimerPresets();
    renderPresetList();
    setPresetStatus('已删除');
  }

  /* ---------------- Drawer ---------------- */
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('overlay');
  function openDrawer() { drawer.classList.add('open'); overlay.classList.add('show'); }
  function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('show'); }

  /* ---------------- Theme + font ---------------- */
  function applyTheme() {
    document.body.dataset.theme = state.theme;
    document.documentElement.style.setProperty('--font-scale', state.fontScale);
    document.querySelectorAll('#themeGroup .chip').forEach(c => {
      c.classList.toggle('active', c.dataset.theme === state.theme);
    });
    document.querySelectorAll('#fontGroup .chip').forEach(c => {
      c.classList.toggle('active', parseFloat(c.dataset.scale) === state.fontScale);
    });
  }

  

  function applyInputs() {
    document.getElementById('proName').value = state.proName;
    document.getElementById('conName').value = state.conName;
    document.getElementById('swSound').classList.toggle('on', state.sound);
    document.getElementById('swTick').classList.toggle('on', state.tick);
    document.getElementById('swAutoFlow').classList.toggle('on', state.autoFlow);
    const iconSound = document.getElementById('iconSound');
    const btnSound = document.getElementById('btnSound');
    btnSound.classList.toggle('active', state.sound);
  }

  /* ---------------- Event wiring ---------------- */
  function wire() {
    document.getElementById('modeTabs').addEventListener('click', (e) => {
      const b = e.target.closest('.mode-tab');
      if (b) setCurrent(b.dataset.id);
    });
    document.querySelectorAll('.add-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        addStage(btn.dataset.add, btn.dataset.type, parseInt(btn.dataset.dur));
      });
    });
    document.getElementById('btnStart').addEventListener('click', toggleRun);
    document.getElementById('btnPrev').addEventListener('click', prevStage);
    document.getElementById('btnNext').addEventListener('click', nextStage);
    const topicEl = document.getElementById('topicInput');
    if (topicEl) {
      topicEl.value = state.topic || '';
      topicEl.addEventListener('input', e => { state.topic = e.target.value; syncCoverFields(); saveState(); });
    }
    document.getElementById('btnSettings').addEventListener('click', openDrawer);
    document.getElementById('drawerClose').addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);

    document.getElementById('btnSound').addEventListener('click', () => {
      state.sound = !state.sound;
      applyInputs(); saveState();
    });

    document.getElementById('btnFullscreen').addEventListener('click', () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    });

    document.getElementById('themeGroup').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      state.theme = b.dataset.theme;
      applyTheme(); saveState();
    });

    document.getElementById('fontGroup').addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      state.fontScale = parseFloat(b.dataset.scale);
      applyTheme(); saveState();
    });

    document.getElementById('savePresetBtn').addEventListener('click', saveTimerPresetFromInput);
    document.getElementById('presetNameInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') saveTimerPresetFromInput();
    });

    document.getElementById('proName').addEventListener('input', (e) => {
      state.proName = e.target.value.slice(0, 20) || '正方';
      updateTimes(); saveState();
    });
    document.getElementById('conName').addEventListener('input', (e) => {
      state.conName = e.target.value.slice(0, 20) || '反方';
      updateTimes(); saveState();
    });

    document.getElementById('swSound').addEventListener('click', () => {
      state.sound = !state.sound; applyInputs(); saveState();
    });
    document.getElementById('swTick').addEventListener('click', () => {
      state.tick = !state.tick; applyInputs(); saveState();
    });
    document.getElementById('swAutoFlow').addEventListener('click', () => {
      state.autoFlow = !state.autoFlow; applyInputs(); saveState();
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.code === 'Space') { e.preventDefault(); toggleRun(); }
      else if (e.key.toLowerCase() === 'r') resetTimer();
      else if (e.key === ',' || e.key === '<' || e.key === 'ArrowLeft') { e.preventDefault(); prevStage(); }
      else if (e.key === '.' || e.key === '>' || e.key === 'ArrowRight') { e.preventDefault(); nextStage(); }
      else if (e.key === '1' && curMode() === 'duel') {
        state.duel.active = 'pro';
        if (!state.running) toggleRun();
        updateDuelActive();
      }
      else if (e.key === '2' && curMode() === 'duel') {
        state.duel.active = 'con';
        if (!state.running) toggleRun();
        updateDuelActive();
      }
      else if (e.key === 'Tab') { e.preventDefault(); nextStage(); }
      else if (e.key.toLowerCase() === 'f') {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
      }
      else if (e.key.toLowerCase() === 'm') {
        state.sound = !state.sound; applyInputs(); saveState();
      }
    });
  }

  /* ---------------- Init ---------------- */
  loadState();
  timerPresets = loadTimerPresets();
  applyTheme();
  applyInputs();
  renderStagesList();
  renderPresetList();
  renderModeTabs();
  ensureCoverStage();
  if (!state.stages.find(s => s.id === state.currentId)) state.currentId = state.stages[0].id;
  if (curMode() === 'cover') {
    state.remaining = 0;
  } else if (curMode() === 'duel') {
    state.duel.pro = curDuration();
    state.duel.con = curDuration();
  } else {
    state.remaining = curDuration();
  }
  renderStage();
  updateFlowDots();
  updateStartButton();
  wire();
})();
