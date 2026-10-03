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
    {
      name: '世界杯',
      stages: [
        { name: '正一发言', type: 'single', duration: 180 },
        { name: '反二质询', type: 'single', duration: 90 },
        { name: '反一发言', type: 'single', duration: 180 },
        { name: '正二质询', type: 'single', duration: 90 },
        { name: '反二小结', type: 'single', duration: 120 },
        { name: '正二小结', type: 'single', duration: 120 },
        { name: '四辩对辩', type: 'duel', duration: 90 },
        { name: '正三盘问', type: 'single', duration: 90 },
        { name: '反三盘问', type: 'single', duration: 90 },
        { name: '正三小结', type: 'single', duration: 120 },
        { name: '反三小结', type: 'single', duration: 120 },
        { name: '自由辩论', type: 'duel', duration: 180 },
        { name: '反四总结', type: 'single', duration: 210 },
        { name: '正四总结', type: 'single', duration: 210 },
      ],
    },
    {
      name: '马中辩',
      stages: [
        { name: '正一立论', type: 'single', duration: 180 },
        { name: '反一立论', type: 'single', duration: 180 },
        { name: '反二质询', type: 'single', duration: 120 },
        { name: '正二质询', type: 'single', duration: 120 },
        { name: '反二申论', type: 'single', duration: 180 },
        { name: '正二申论', type: 'single', duration: 180 },
        { name: '一辩对辩', type: 'duel', duration: 120 },
        { name: '三辩申论', type: 'duel', duration: 120 },
        { name: '自由辩论', type: 'duel', duration: 180 },
        { name: '反三结辩', type: 'single', duration: 180 },
        { name: '正三结辩', type: 'single', duration: 180 },
      ],
    },
  ];

  /* ---------------- Duel flow (双计时环节的结束行为) ----------------
     'relay' 交锋：一方归零后自动接续对方，适合自由辩、对辩、攻辩。
     'solo'  独立：一方归零后停下，对方剩余时间原地保留，适合质询、申论。
     stg.duelFlow 只有用户手动切过才会写进环节对象；没写就按环节名推断，
     所以改名之后默认值会跟着改，手动设过的则一直保留。            */
  const DUEL_FLOWS = ['relay', 'solo'];
  const SOLO_NAME_HINTS = ['质询', '申论', '陈词', '陈述', '立论', '小结', '结辩', '总结', '驳论', '盘问', '答辩'];
  const RELAY_NAME_HINTS = ['自由辩', '对辩', '攻辩', '交锋', '混战', '缠斗'];

  function inferDuelFlow(name) {
    const n = String(name || '');
    // 先判独立：'攻辩小结'、'质询小结' 这类名字两边关键词都命中，应当算独立
    if (SOLO_NAME_HINTS.some(k => n.includes(k))) return 'solo';
    if (RELAY_NAME_HINTS.some(k => n.includes(k))) return 'relay';
    return 'relay';
  }
  function isDuelFlow(v) { return DUEL_FLOWS.indexOf(v) >= 0; }
  function duelFlowOf(stg) {
    if (!stg) return 'relay';
    return isDuelFlow(stg.duelFlow) ? stg.duelFlow : inferDuelFlow(stg.name);
  }
  function duelFlowLabel(flow) { return flow === 'solo' ? '独立' : '交锋'; }
  function duelFlowTitle(flow) {
    return flow === 'solo'
      ? '独立计时：一方归零后停下，对方剩余时间原地保留（质询、申论）'
      : '交锋计时：一方归零后自动接续对方（自由辩、对辩）';
  }

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
    theme: 'arena',
    fontScale: 1,
    sound: true,
    volume: 1, // 0–1，设置里的音量拉杆
    tick: true,
    autoFlow: false,
    proName: '',
    conName: '',
    topic: '',
    matchStage: '',
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
  function curDuelFlow() { return duelFlowOf(curStage()); }
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
    state.stages = state.stages.map(s => {
      const type = s.type === 'duel' ? 'duel' : (s.type === 'cover' ? 'cover' : 'single');
      const out = {
        ...s,
        type,
        duration: type === 'cover' ? 0 : Math.max(10, Number(s.duration) || 60),
      };
      // 只保留合法的显式设置，其余交给 duelFlowOf() 按环节名推断
      if (!isDuelFlow(out.duelFlow)) delete out.duelFlow;
      return out;
    });
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
      fontScale: state.fontScale, sound: state.sound, volume: state.volume, tick: state.tick,
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
      state.volume = clampVolume(state.volume);
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

  /* ---------------- Custom background ---------------- */
  // Keep image data separate so ordinary timer saves do not rewrite it.
  const BACKGROUND_KEY = 'debate-timer-v2-background';
  const BACKGROUND_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  let backgroundRequest = 0;

  function setBackgroundStatus(message) {
    document.getElementById('backgroundStatus').textContent = message;
  }

  function applyBackground(dataUrl) {
    document.body.classList.toggle('has-custom-background', !!dataUrl);
    if (dataUrl) document.body.style.setProperty('--custom-background', 'url("' + dataUrl + '")');
    else document.body.style.removeProperty('--custom-background');
    const preview = document.getElementById('backgroundPreview');
    preview.hidden = !dataUrl;
    if (dataUrl) preview.src = dataUrl;
    else preview.removeAttribute('src');
    document.getElementById('resetBackground').disabled = !dataUrl;
  }

  function loadBackground() {
    try {
      const saved = localStorage.getItem(BACKGROUND_KEY);
      if (saved && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(saved)) {
        applyBackground(saved);
      }
    } catch (e) {
      setBackgroundStatus('浏览器无法读取本地背景，仍可选择图片临时使用。');
    }
  }

  async function chooseBackground(event) {
    const file = event.target.files[0];
    event.target.value = ''; // Allow choosing the same file again, including after an error.
    if (!file) return;
    const request = ++backgroundRequest;
    if (!BACKGROUND_TYPES.includes(file.type)) {
      setBackgroundStatus('请选择 JPG、PNG 或 WebP 图片。');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setBackgroundStatus('图片超过 10 MB，请选择较小的图片。');
      return;
    }
    setBackgroundStatus('正在处理图片…');
    try {
      const source = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('read'));
        reader.onabort = () => reject(new Error('abort'));
        reader.readAsDataURL(file);
      });
      const image = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('decode'));
        img.src = source;
      });
      if (request !== backgroundRequest) return;
      // Bound storage use and resize large photographs before persisting them.
      const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/webp', 0.85);
      if (!/^data:image\/(webp|png);base64,/.test(dataUrl)) throw new Error('encode');
      applyBackground(dataUrl);
      try {
        localStorage.setItem(BACKGROUND_KEY, dataUrl);
        setBackgroundStatus('背景已保存，刷新后仍会保留。');
      } catch (e) {
        setBackgroundStatus('背景已应用，但本地存储不可用或空间不足；刷新后无法保留此次更改。');
      }
    } catch (e) {
      if (request === backgroundRequest) setBackgroundStatus('无法读取这张图片，请选择有效的 JPG、PNG 或 WebP 图片。');
    }
  }

  function resetBackground() {
    ++backgroundRequest; // A pending image read must not undo the reset.
    try {
      localStorage.removeItem(BACKGROUND_KEY);
      applyBackground('');
      setBackgroundStatus('已恢复当前主题的默认背景。');
    } catch (e) {
      setBackgroundStatus('无法清除本地背景，请允许浏览器使用本地存储后重试。');
    }
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
  // 旧存档没有 volume，或被改坏时，回到 100%
  function clampVolume(v) {
    const n = Number(v);
    return v == null || !isFinite(n) ? 1 : Math.min(1, Math.max(0, n));
  }
  // 音量：先顶到设定值并保持过半时长再衰减。原来一起音就开始衰减，听感很弱。
  function beep(freq = 660, duration = 0.12, type = 'sine', gain = 0.15) {
    if (!state.sound) return;
    // 拉杆按平方折算成增益：人耳对响度是对数感受，线性折算会让下半段几乎没变化
    const vol = clampVolume(state.volume);
    gain *= vol * vol;
    if (gain <= 0.001) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const t0 = ctx.currentTime;
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
    g.gain.setValueAtTime(gain, t0 + duration * 0.55);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start();
    osc.stop(t0 + duration + 0.02);
  }
  // 结束铃的一个音：正弦基音 + 少量方波泛音，同样峰值下更响、更穿透。
  // 两层峰值相加不超过 1，不会削波。
  function bellNote(freq, duration) {
    beep(freq, duration, 'sine', 0.8);
    beep(freq, duration, 'square', 0.15);
  }
  function beepEnd() {
    if (!state.sound) return;
    bellNote(880, 0.3);
    setTimeout(() => bellNote(660, 0.32), 260);
    setTimeout(() => bellNote(440, 0.7), 560);
    // vibrate if supported
    if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
  }
  function beepTick() {
    if (!state.sound || !state.tick) return;
    beep(880, 0.08, 'square', 0.3);
  }
  function beep30() {
    if (!state.sound) return;
    beep(520, 0.3, 'triangle', 0.7);
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
            '<input id="coverMatchStage" class="cover-input cover-match-input" maxlength="40" value="' + escapeHtml(state.matchStage || '') + '" placeholder="\u6bd4\u8d5b\u540d\u79f0">' +
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
    fitCoverTeamNames();
  }

  /* 首页队名：字多了就缩字号，正反方始终用同一个字号。
     先按正常版式量；放不下就把对阵区加宽（.is-long），还放不下再按较长的一方等比缩小。 */
  const TEAM_NAME_MIN_PX = 12;
  function fitCoverTeamNames() {
    if (typeof getComputedStyle !== 'function') return;
    const inputs = ['coverProSchool', 'coverConSchool'].map(id => document.getElementById(id)).filter(Boolean);
    const matchup = document.querySelector('.cover-matchup');
    if (inputs.length !== 2 || !matchup) return;
    // 量的是 CSS 给的基准字号下文字实际要多宽，再和输入框可用宽度比
    const measure = () => {
      const out = { ratio: 1, basePx: 0 };
      inputs.forEach(input => {
        const cs = getComputedStyle(input);
        const probe = document.createElement('span');
        probe.className = input.className;
        probe.textContent = input.value || '';
        probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;pointer-events:none;' +
          'white-space:pre;width:auto;padding:0;border:0;';
        input.parentNode.appendChild(probe);
        const need = probe.getBoundingClientRect().width;
        out.basePx = parseFloat(getComputedStyle(probe).fontSize) || out.basePx;
        probe.remove();
        const avail = input.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        if (need > 0 && avail > 0) out.ratio = Math.min(out.ratio, avail / need);
      });
      return out;
    };
    inputs.forEach(input => input.style.removeProperty('font-size'));
    matchup.classList.remove('is-long');
    let fit = measure();
    if (fit.ratio >= 1) return;
    matchup.classList.add('is-long');
    fit = measure();
    if (fit.ratio >= 1 || !fit.basePx) return;
    // 留 2% 余量，免得不同字形的舍入把最后一个字挤出去
    const px = Math.max(TEAM_NAME_MIN_PX, Math.floor(fit.basePx * fit.ratio * 0.98 * 10) / 10);
    inputs.forEach(input => input.style.setProperty('font-size', px + 'px', 'important'));
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
    fitCoverTeamNames();
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
    // updateTimes() 在首页会走 syncCoverFields()，顺带重新适配队名字号
    bind('coverProSchool', 'proName', 32, () => { updateTimes(); applyInputs(); });
    bind('coverConSchool', 'conName', 32, () => { updateTimes(); applyInputs(); });
  }

  
  function renderSingle() {
    const total = curDuration();
    const name = curName();
    stage.innerHTML = `
      <div class="single-timer">
        <div class="single-label">${escapeHtml(name)}</div>
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
    const flow = curDuelFlow();
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
        <button class="duel-divider" id="duelFlowToggle" data-flow="${flow}" title="${duelFlowTitle(flow)}（点击切换）">${duelFlowLabel(flow)}</button>
      </div>`;
    // 交锋 / 独立：在计时页直接点中间的圆钮切换，不用进设置
    document.getElementById('duelFlowToggle').addEventListener('click', (e) => {
      e.stopPropagation();
      e.currentTarget.blur(); // 避免之后按空格/回车又触发一次切换
      toggleDuelFlow(curStage());
    });
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
      updateDuelActive();
    });
    document.getElementById('btnResetCon').addEventListener('click', (e) => {
      e.stopPropagation();
      state.duel.con = curDuration();
      const rt = getRuntime(curStage().id);
      if (rt) rt.duelCon = state.duel.con;
      updateTimes();
      updateDuelActive();
    });
    wireEditableTime();
    // 恢复缓存里的当前方 / 已结束状态，而不是永远显示正方在跑
    updateDuelActive();
  }

  function updateDuelActive() {
    const pro = document.getElementById('panelPro');
    const con = document.getElementById('panelCon');
    if (!pro || !con) return;
    const activeSide = state.duel.active === 'con' ? 'con' : 'pro';
    const otherSide = activeSide === 'pro' ? 'con' : 'pro';
    const activeEl = activeSide === 'pro' ? pro : con;
    const otherEl = activeSide === 'pro' ? con : pro;
    activeEl.classList.add('active'); activeEl.classList.remove('inactive');
    otherEl.classList.add('inactive'); otherEl.classList.remove('active');
    activeEl.querySelector('.duel-status').textContent =
      state.duel[activeSide] <= 0 ? '已结束' : '计时中';
    otherEl.querySelector('.duel-status').textContent =
      state.duel[otherSide] <= 0 ? '已结束' : (state.running ? '暂停中' : '待命');
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
      // 改过某一方的时间会改环节总时长，另一方可能超过 100%，要夹住
      if (proProg) proProg.style.width = Math.min(100, Math.max(0, state.duel.pro / total * 100)) + '%';
      if (conProg) conProg.style.width = Math.min(100, Math.max(0, state.duel.con / total * 100)) + '%';
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
      if (state.duel[k] <= 0) {
        // 运行中切到了已归零的一方：不倒扣，按 duelFlow 接续或停下
        handleTimeUp();
      } else {
        prevWhole = Math.ceil(state.duel[k]);
        state.duel[k] = Math.max(0, state.duel[k] - delta);
        checkBeeps(prevWhole, state.duel[k], curDuration());
      }
    } else {
      prevWhole = Math.ceil(state.remaining);
      state.remaining = Math.max(0, state.remaining - delta);
      checkBeeps(prevWhole, state.remaining, curDuration());
    }
    updateTimes();
    if (!state.running) { rafId = null; return; }
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
      const other = state.duel.active === 'pro' ? 'con' : 'pro';
      if (curDuelFlow() === 'relay' && state.duel[other] > 0) {
        // 交锋：自动接续还有时间的一方，整体继续跑
        state.duel.active = other;
        updateDuelActive();
        updateTimes();
      } else {
        // 独立：停下，对方剩余时间原地保留，要用时点它或按 1/2 再开始
        state.running = false;
        updateStartButton();
        updateDuelActive();
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
  function activeRemaining() {
    return curMode() === 'duel' ? state.duel[state.duel.active] : state.remaining;
  }

  function toggleRun() {
    if (curMode() === 'cover') return;
    ensureAudio();
    // 时间到后不再继续计时：已归零的计时器不能再开始，只能重置
    if (!state.running && activeRemaining() <= 0) { updateStartButton(); return; }
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
    let active = null;
    state.stages.forEach(s => {
      const b = document.createElement('button');
      b.className = 'mode-tab' + (s.id === state.currentId ? ' active' : '');
      b.dataset.id = s.id;
      b.textContent = s.name;
      if (s.type === 'duel') b.title = '双计时 · ' + duelFlowTitle(duelFlowOf(s));
      tabs.appendChild(b);
      if (s.id === state.currentId) active = b;
    });
    // 手机上导航是一行横向滑动的，把当前环节滚到中间；桌面不滚动，这里不起作用
    if (active) {
      const box = tabs.getBoundingClientRect(), cur = active.getBoundingClientRect();
      tabs.scrollLeft = (tabs.scrollLeft || 0) + cur.left - box.left - (box.width - cur.width) / 2;
    }
  }

  // iPhone 的 Safari 不支持网页全屏：拿不到接口就什么都不做，按钮也会被隐藏
  function fullscreenApi() {
    const el = document.documentElement;
    const request = el.requestFullscreen || el.webkitRequestFullscreen;
    const exit = document.exitFullscreen || document.webkitExitFullscreen;
    return request && exit ? { el, request, exit } : null;
  }
  function toggleFullscreen() {
    const api = fullscreenApi();
    if (!api) return;
    if (!(document.fullscreenElement || document.webkitFullscreenElement)) api.request.call(api.el);
    else api.exit.call(document);
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

  // pill: 从设置抽屉点的就只同步那一个 pill；从计时页点的则重绘抽屉列表
  function toggleDuelFlow(stg, pill) {
    if (!stg || stg.type !== 'duel') return;
    stg.duelFlow = duelFlowOf(stg) === 'solo' ? 'relay' : 'solo';
    const flow = duelFlowOf(stg);
    const btn = stg.id === state.currentId && document.getElementById('duelFlowToggle');
    if (btn) {
      btn.dataset.flow = flow;
      btn.textContent = duelFlowLabel(flow);
      btn.title = duelFlowTitle(flow) + '（点击切换）';
    }
    if (pill) syncFlowPill(pill, stg);
    else renderStagesList();
    renderModeTabs();
    saveState();
  }

  /* ---------------- Stages drawer list ---------------- */
  function syncFlowPill(pill, stg) {
    if (!pill) return;
    const isDuel = stg.type === 'duel';
    const flow = duelFlowOf(stg);
    pill.dataset.flow = flow;
    pill.textContent = duelFlowLabel(flow);
    pill.disabled = !isDuel;
    pill.title = isDuel ? duelFlowTitle(flow) : '';
    // 单计时 / 首页保留占位，避免各行宽度跳动
    pill.style.visibility = isDuel ? 'visible' : 'hidden';
  }

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
        <input class="stage-name-input" value="${escapeHtml(stg.name)}" maxlength="10">
        <button class="stage-type-pill" data-type="${stg.type}" title="${isCover ? '\u9996\u9875\u4e0d\u53c2\u4e0e\u8ba1\u65f6' : '\u5207\u6362\u7c7b\u578b'}" ${isCover ? 'disabled' : ''}>${isCover ? '\u9996\u9875' : (stg.type === 'duel' ? '\u53cc' : '\u5355')}</button>
        <button class="stage-flow-pill"></button>
        <input type="number" class="stage-dur-input" value="${stg.duration}" min="0" step="10" ${isCover ? 'disabled' : ''}>
        <span style="font-size:10px;color:var(--ink-3);font-family:'JetBrains Mono',monospace;">s</span>
        <button class="stage-del" title="\u5220\u9664" ${isCover ? 'disabled' : ''}>\u00d7</button>
      `;
      const flowPill = row.querySelector('.stage-flow-pill');
      syncFlowPill(flowPill, stg);
      // name
      row.querySelector('.stage-name-input').addEventListener('input', (e) => {
        stg.name = e.target.value.slice(0, 10) || '环节';
        // 没手动设过交锋/独立的环节，默认值跟着名字走
        syncFlowPill(flowPill, stg);
        renderModeTabs(); updateFlowDots();
        if (stg.id === state.currentId) renderStage();
        saveState();
      });
      // 交锋 / 独立 toggle
      flowPill.addEventListener('click', () => toggleDuelFlow(stg, flowPill));
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
    return stages.map(s => {
      const out = { id: s.id, name: s.name, type: s.type, duration: s.duration };
      if (isDuelFlow(s.duelFlow)) out.duelFlow = s.duelFlow;
      return out;
    });
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
      // 双计时环节正反方各有一份时长，总时长要算两次
      const totalSeconds = preset.stages.reduce((sum, stg) => sum + (Number(stg.duration) || 0) * (stg.type === 'duel' ? 2 : 1), 0);
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
    state.stages = stages.map((st, i) => {
      const out = {
        id: 'b' + base + '_' + i,
        name: st.name, type: st.type, duration: st.duration,
      };
      if (isDuelFlow(st.duelFlow)) out.duelFlow = st.duelFlow;
      return out;
    });
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

  /* ---------------- Share format (分享赛制) ----------------
     只带环节（名称 / 单双计时 / 时长 / 交锋独立），不带主题、背景、辩题和队伍。
     复制出去的文本形如「【辩论计时器赛制】11 环节 · 32:00｜DT1.xxxx」，导入时只认其中的
     DT1.xxxx，所以连同聊天里的其他文字一起粘贴也能识别。 */
  const SHARE_PREFIX = 'DT1.';
  const SHARE_MAX_STAGES = 40;

  function encodeFormat(stages) {
    const rows = stages.filter(s => s.type !== 'cover').map(s => {
      const row = [s.name, s.type === 'duel' ? 1 : 0, s.duration];
      // 交锋 / 独立写成实际生效的值，对方不依赖按环节名推断也能得到同样的行为
      if (s.type === 'duel') row.push(duelFlowOf(s) === 'solo' ? 1 : 0);
      return row;
    });
    const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(rows))));
    return SHARE_PREFIX + b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // 粘贴来的内容不可信：逐项校验、截断，认不出来就返回 null
  function decodeFormat(text) {
    const m = String(text || '').match(/DT1\.([A-Za-z0-9_-]+)/);
    if (!m) return null;
    try {
      let b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
      while (b64.length % 4) b64 += '=';
      const rows = JSON.parse(decodeURIComponent(escape(atob(b64))));
      if (!Array.isArray(rows)) return null;
      const stages = [];
      rows.slice(0, SHARE_MAX_STAGES).forEach(row => {
        if (!Array.isArray(row)) return;
        const name = String(row[0] == null ? '' : row[0]).trim().slice(0, 10);
        const duration = Math.round(Number(row[2]));
        if (!name || !isFinite(duration)) return;
        const st = { name, type: row[1] === 1 ? 'duel' : 'single', duration: Math.min(5999, Math.max(10, duration)) };
        if (st.type === 'duel' && (row[3] === 0 || row[3] === 1)) st.duelFlow = row[3] === 1 ? 'solo' : 'relay';
        stages.push(st);
      });
      return stages.length ? stages : null;
    } catch (e) {
      return null;
    }
  }

  function setShareStatus(text) {
    const el = document.getElementById('shareStatus');
    if (!el) return;
    el.textContent = text || '';
    if (text) setTimeout(() => { if (el.textContent === text) el.textContent = ''; }, 2600);
  }

  function copyText(text) {
    const legacy = () => new Promise((resolve, reject) => {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e) {}
      ta.remove();
      if (ok) resolve(); else reject(new Error('copy'));
    });
    // 双击打开的单 HTML 等场景下 Clipboard API 可能不可用或被拒，退回旧办法
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      return navigator.clipboard.writeText(text).catch(legacy);
    }
    return legacy();
  }

  function shareFormat() {
    const stages = state.stages.filter(s => s.type !== 'cover');
    if (!stages.length) { setShareStatus('还没有环节'); return; }
    const totalSeconds = stages.reduce((sum, stg) => sum + (Number(stg.duration) || 0) * (stg.type === 'duel' ? 2 : 1), 0);
    const text = '【辩论计时器赛制】' + stages.length + ' 环节 · ' + formatTime(totalSeconds) + '｜' + encodeFormat(stages);
    // 同时填进输入框并选中：万一浏览器不让复制，还能手动 Ctrl+C
    const input = document.getElementById('shareCodeInput');
    if (input) { input.value = text; input.select(); }
    copyText(text).then(
      () => setShareStatus('已复制，发给对方即可'),
      () => {
        if (input) { input.focus(); input.select(); }
        setShareStatus('复制失败，请手动复制输入框里的代码');
      }
    );
  }

  function importFormat() {
    const input = document.getElementById('shareCodeInput');
    const text = (input ? input.value : '').trim();
    if (!text) { setShareStatus('先粘贴赛制代码'); return; }
    const stages = decodeFormat(text);
    if (!stages) { setShareStatus('认不出这段代码'); return; }
    applyStageSet(stages, '分享的赛制');
    if (input) input.value = '';
    setShareStatus('已导入 ' + stages.length + ' 个环节');
  }

  /* ---------------- Drawer ---------------- */
  const drawer = document.getElementById('drawer');
  const overlay = document.getElementById('overlay');
  function openDrawer() { drawer.classList.add('open'); overlay.classList.add('show'); }
  function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('show'); }

  /* ---------------- Theme + font ---------------- */
  const THEMES = ['arena', 'academy', 'soft', 'broadcast', 'terminal'];
  function applyTheme() {
    // 旧版的 warm / dark / paper 已下线，存档里的旧值统一落到默认主题
    if (THEMES.indexOf(state.theme) < 0) state.theme = THEMES[0];
    document.body.dataset.theme = state.theme;
    document.documentElement.style.setProperty('--font-scale', state.fontScale);
    document.querySelectorAll('#themeGroup .chip').forEach(c => {
      c.classList.toggle('active', c.dataset.theme === state.theme);
    });
    document.querySelectorAll('#fontGroup .chip').forEach(c => {
      c.classList.toggle('active', parseFloat(c.dataset.scale) === state.fontScale);
    });
    // 各主题字体、字重不同，队名要重新量
    fitCoverTeamNames();
  }

  

  function applyInputs() {
    document.getElementById('proName').value = state.proName;
    document.getElementById('conName').value = state.conName;
    document.getElementById('swSound').classList.toggle('on', state.sound);
    document.getElementById('swTick').classList.toggle('on', state.tick);
    const pct = Math.round(clampVolume(state.volume) * 100);
    document.getElementById('volumeRange').value = pct;
    document.getElementById('volumeValue').textContent = pct + '%';
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

    document.getElementById('chooseBackground').addEventListener('click', () => {
      document.getElementById('backgroundInput').click();
    });
    document.getElementById('backgroundInput').addEventListener('change', chooseBackground);
    document.getElementById('resetBackground').addEventListener('click', resetBackground);

    document.getElementById('btnSound').addEventListener('click', () => {
      state.sound = !state.sound;
      applyInputs(); saveState();
    });

    const btnFullscreen = document.getElementById('btnFullscreen');
    btnFullscreen.addEventListener('click', toggleFullscreen);
    if (!fullscreenApi()) btnFullscreen.style.display = 'none';

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

    document.getElementById('shareFormatBtn').addEventListener('click', shareFormat);
    document.getElementById('importFormatBtn').addEventListener('click', importFormat);
    document.getElementById('shareCodeInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') importFormat();
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
    const volumeRange = document.getElementById('volumeRange');
    volumeRange.addEventListener('input', (e) => {
      state.volume = clampVolume(Number(e.target.value) / 100);
      document.getElementById('volumeValue').textContent = Math.round(state.volume * 100) + '%';
      saveState();
    });
    // 松手时响一声，直接听到当前音量
    volumeRange.addEventListener('change', () => { beep30(); });
    document.getElementById('swTick').addEventListener('click', () => {
      state.tick = !state.tick; applyInputs(); saveState();
    });
    document.getElementById('swAutoFlow').addEventListener('click', () => {
      state.autoFlow = !state.autoFlow; applyInputs(); saveState();
    });

    document.addEventListener('keydown', (e) => {
      // Let settings controls keep native Tab / Space keyboard behavior.
      if (drawer.classList.contains('open')) {
        if (e.key === 'Escape') closeDrawer();
        return;
      }
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
      else if (e.key.toLowerCase() === 'f') toggleFullscreen();
      else if (e.key.toLowerCase() === 'm') {
        state.sound = !state.sound; applyInputs(); saveState();
      }
    });

    // 窗口大小、全屏、网页字体加载完成都会改变队名可用宽度或字宽
    if (typeof window.addEventListener === 'function') window.addEventListener('resize', fitCoverTeamNames);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitCoverTeamNames);
  }

  /* ---------------- Init ---------------- */
  loadState();
  timerPresets = loadTimerPresets();
  // ensureCoverStage() 会用 map() 换掉整个 stages 数组，必须跑在 renderStagesList()
  // 之前，否则抽屉里每一行闭包住的都是已经被丢弃的环节对象，
  // 页面刚打开时的第一次改名/改时长/换类型会全部丢失。
  ensureCoverStage();
  if (!state.stages.find(s => s.id === state.currentId)) state.currentId = state.stages[0].id;
  applyTheme();
  applyInputs();
  loadBackground();
  renderStagesList();
  renderPresetList();
  renderModeTabs();
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
