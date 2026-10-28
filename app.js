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
    {
      name: '雅哲杯',
      stages: [
        { name: '正一立论', type: 'single', duration: 240 },
        { name: '反二质询正一', type: 'single', duration: 180 },
        { name: '反一立论', type: 'single', duration: 240 },
        { name: '正二质询反一', type: 'single', duration: 180 },
        { name: '反二申论', type: 'single', duration: 180 },
        { name: '正二申论', type: 'single', duration: 180 },
        { name: '小讨论', type: 'single', duration: 60 },
        { name: '自由辩论', type: 'pool', duration: 600, turn: 25, tag: '雅哲杯' },
        { name: '讨论结论', type: 'single', duration: 120 },
        { name: '反方总结', type: 'single', duration: 180 },
        { name: '正方总结', type: 'single', duration: 180 },
      ],
    },
  ];

  /* ---------------- 共用时间池（type 'pool'，雅哲杯自由辩论） ----------------
     双方共用一个总时长 stg.duration，谁在发言就扣谁的；每次发言另有 stg.turn 秒
     （默认 25）的单次上限，到点自动换边并重置。总池不足一次上限时，上限 = 总池剩余。
     总池归零即停，和其他环节结束一样。 */
  const POOL_TURN_DEFAULT = 25;
  function poolTurnCap(stg) {
    const t = Math.round(Number(stg && stg.turn));
    return t >= 5 && t <= 600 ? t : POOL_TURN_DEFAULT;
  }
  /* Duel flow multipliers for total time: duel counts twice, pool once */
  function stageTotalFactor(stg) { return stg && stg.type === 'duel' ? 2 : 1; }

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
        : stg.type === 'pool'
        ? { poolLeft: stg.duration, poolTurn: Math.min(poolTurnCap(stg), stg.duration), poolActive: 'pro' }
        : { remaining: stg.duration };
    }
    return runtimeCache[id];
  }

  const state = {
    stages: DEFAULT_STAGES.map(s => ({...s})),
    currentId: 'cover',
    theme: 'neo',
    fontScale: 1,
    sound: true,
    volume: 1, // 0–1，设置里的音量拉杆
    tick: true,
    autoFlow: false,
    proName: '',
    conName: '',
    proStance: '',
    conStance: '',
    topic: '',
    matchStage: '',
    voteEnabled: false,
    // runtime
    running: false,
    remaining: 180,
    duel: { pro: 120, con: 120, active: 'pro' },
    pool: { left: 600, turn: 25, active: 'pro' },
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
      const noTimer = s.type === 'cover' || s.type === 'vote-pre' || s.type === 'vote-final';
      const type = s.type === 'duel' || s.type === 'pool' ? s.type : (noTimer ? s.type : 'single');
      const out = {
        ...s,
        type,
        duration: noTimer ? 0 : Math.max(10, Number(s.duration) || 60),
      };
      // 只保留合法的显式设置，其余交给 duelFlowOf() 按环节名推断
      if (!isDuelFlow(out.duelFlow)) delete out.duelFlow;
      if (type === 'pool') out.turn = poolTurnCap(out); else { delete out.turn; delete out.tag; }
      return out;
    });
    state.stages.unshift(cover);
  }

  // 无计时的特殊环节：首页、赛前票数、最终票数——不参与倒计时、开始/重置按钮
  function isTimerless(mode) {
    return mode === 'cover' || mode === 'vote-pre' || mode === 'vote-final';
  }

  /* ---------------- Vote stages (赛前票数 / 最终票数) ----------------
     只在 state.voteEnabled 时存在；位置固定在首页之后、流程末尾，做法和
     ensureCoverStage() 一样：先从数组里摘掉，再按需要重新插回固定位置，
     调用后同样必须重新 renderStagesList()。关闭投票时整段移除，且绝不
     写进计时器预设（见 cloneStages()）。 */
  function ensureVoteStages() {
    if (!Array.isArray(state.stages)) state.stages = [];
    const takeOut = (match) => {
      const idx = state.stages.findIndex(match);
      return idx >= 0 ? state.stages.splice(idx, 1)[0] : null;
    };
    let pre = takeOut(s => s.type === 'vote-pre');
    let fin = takeOut(s => s.type === 'vote-final');
    if (!state.voteEnabled) return;
    pre = Object.assign({ id: 'vote-pre', name: '赛前票数' }, pre, { id: 'vote-pre', type: 'vote-pre', duration: 0 });
    fin = Object.assign({ id: 'vote-final', name: '最终票数' }, fin, { id: 'vote-final', type: 'vote-final', duration: 0 });
    const coverIdx = state.stages.findIndex(s => s.type === 'cover');
    state.stages.splice(coverIdx >= 0 ? coverIdx + 1 : 0, 0, pre);
    state.stages.push(fin);
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
      proStance: state.proStance, conStance: state.conStance,
      topic: state.topic, matchStage: state.matchStage, voteEnabled: state.voteEnabled,
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
      state.voteEnabled = !!state.voteEnabled;
      if (!Array.isArray(state.stages) || state.stages.length === 0) {
        state.stages = DEFAULT_STAGES.map(x => ({...x}));
        state.currentId = state.stages[0].id;
      }
      ensureCoverStage();
      ensureVoteStages();
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
    } else if (mode === 'vote-pre') {
      renderVotePre();
    } else if (mode === 'vote-final') {
      renderVoteFinal();
    } else if (mode === 'duel') {
      renderDuel();
    } else if (mode === 'pool') {
      renderPool();
    } else {
      renderSingle();
    }
    updateTimes();
    scrollTabsToActive();
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
            '<input id="coverProStance" class="cover-input cover-team-stance" maxlength="40" value="' + escapeHtml(state.proStance || '') + '" placeholder="\u6b63\u65b9\u7acb\u573a\uff08\u9009\u586b\uff09">' +
          '</label>' +
          '<div class="cover-vs" aria-hidden="true">VS</div>' +
          '<label class="cover-team cover-team-con" for="coverConSchool">' +
            '<span class="cover-team-tag">\u53cd\u65b9</span>' +
            '<input id="coverConSchool" class="cover-input cover-team-name" maxlength="32" value="' + escapeHtml(state.conName || '') + '" placeholder="\u53cd\u65b9\u5b66\u6821">' +
            '<input id="coverConStance" class="cover-input cover-team-stance" maxlength="40" value="' + escapeHtml(state.conStance || '') + '" placeholder="\u53cd\u65b9\u7acb\u573a\uff08\u9009\u586b\uff09">' +
          '</label>' +
        '</div>' +
      '</section>';
    wireCoverInputs();
    fitCoverTeamNames();
    fitCoverTopic();
  }

  // 辩题字号固定不缩；长辩题靠多撑行高来放完文字。实际行数量不出来（text-wrap: balance
  // 换行点跟字宽有关，没法从字数直接推算），所以让浏览器先按 scrollHeight 自己撑一次，
  // 量出高度后再换算成行数，写进 --cover-topic-lines 给 style.css 里按行数算的 max-height
  // 兜底规则用（field-sizing 不支持的浏览器、极矮视口等）。
  function fitCoverTopic() {
    const el = document.getElementById('coverTopic');
    if (!el || typeof getComputedStyle !== 'function') return;
    el.style.maxWidth = '';
    el.style.marginInline = '';
    el.style.textWrap = '';
    el.style.removeProperty('font-size');
    const measure = () => {
      preferCommaBreak(el);
      el.style.height = 'auto';
      const scrollH = el.scrollHeight;
      el.style.height = scrollH + 'px';
      const lineHeight = parseFloat(getComputedStyle(el).fontSize) * 1.25;
      const lines = lineHeight > 0 ? Math.max(2, Math.ceil(scrollH / lineHeight)) : 2;
      el.style.setProperty('--cover-topic-lines', lines);
    };
    measure();
    // 平常的题目保持大字号；只有超长题目把封面撑出屏幕时，才逐步缩小字号直到放得下。
    const card = el.closest('.cover-page') || el.parentElement;
    const bound = stage.getBoundingClientRect();
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const contentBottom = () => { let m = 0; card.querySelectorAll('*').forEach(n => { const r = n.getBoundingClientRect(); if (r.height > 0 && r.bottom > m) m = r.bottom; }); return m; };
    const overflows = () => card.scrollHeight > card.clientHeight + 1 || contentBottom() > bound.bottom + 1 ||
      card.getBoundingClientRect().bottom > vh - 4 || document.documentElement.scrollHeight > vh + 1;
    let guard = 14;
    while (bound.height > 0 && overflows() && guard-- > 0) {
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (!(fs > 16)) break;
      el.style.setProperty('font-size', Math.floor(fs * 0.92) + 'px', 'important');
      el.style.maxWidth = ''; el.style.marginInline = ''; el.style.textWrap = '';
      measure();
    }
  }

  // 两行就能放下的题目，如果中间附近有逗号等标点，就把输入框收窄到“逗号前/后”两段中较宽的那段，
  // 让换行落在标点后面，而不是把一个词（如“工作”）拆开。不改字号，也不改用户输入的文字。
  function preferCommaBreak(el) {
    const text = (el.value || '').trim();
    if (!text || /\n/.test(text)) return;
    const cs = getComputedStyle(el);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const avail = el.clientWidth - padX;
    if (avail <= 0) return;
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:-9999px;top:0';
    ['fontFamily', 'fontSize', 'fontWeight', 'letterSpacing', 'fontStyle'].forEach(k => { probe.style[k] = cs[k]; });
    document.body.appendChild(probe);
    const w = t => { probe.textContent = t; return probe.getBoundingClientRect().width; };
    try {
      const full = w(text);
      if (full <= avail || full > avail * 2) return;
      let best = null;
      for (let i = 0; i < text.length - 1; i++) {
        if (!/[，,；;：:？?！!、]/.test(text[i])) continue;
        const r = (i + 1) / text.length;
        if (r < 0.3 || r > 0.7) continue;
        const a = w(text.slice(0, i + 1)), b = w(text.slice(i + 1));
        const m = Math.max(a, b);
        if (m <= avail && (!best || Math.abs(r - 0.5) < best.d)) best = { m, d: Math.abs(r - 0.5) };
      }
      if (best) {
        el.style.maxWidth = Math.ceil(best.m + padX + 4) + 'px';
        el.style.marginInline = 'auto';
        el.style.textWrap = 'wrap'; // 宽度已卡在标点处，用普通换行，避免 balance 又把断点挪走
      }
    } finally {
      probe.remove();
    }
  }

  function voteSnapshot() {
    const host = window.VoteHost;
    if (host && typeof host.getSnapshot === 'function') {
      try {
        const snap = host.getSnapshot();
        if (snap && snap.counts) {
          const count = v => Math.max(0, Number(v) || 0);
          const baseline = snap.baseline
            ? { pro: count(snap.baseline.pro), con: count(snap.baseline.con) }
            : null;
          return {
            counts: { pro: count(snap.counts.pro), con: count(snap.counts.con) },
            baseline,
            phase: snap.phase || 'idle',
          };
        }
      } catch (e) {}
    }
    return { counts: { pro: 0, con: 0 }, baseline: null, phase: 'idle' };
  }

  function voteDeltaText(n) {
    if (n > 0) return '+' + n;
    if (n < 0) return '\u2212' + Math.abs(n);
    return '+0';
  }

  function voteChartHeightPct(n, max) {
    return n <= 0 ? 0 : Math.max(6, n / max * 100);
  }

  function prefersReducedMotion() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // \u8ba1\u6570\u6570\u5b57\u4ece\u65e7\u503c\u6570\u5230\u65b0\u503c\uff1a\u6587\u672c\u8282\u70b9\u6ca1\u6709 CSS transition \u53ef\u7528\uff0c\u8fd9\u91cc\u7528 rAF \u81ea\u5df1\u8ddf\u8fdb\u5ea6
  function tweenVoteCount(el, from, to) {
    if (el._voteCountRaf) { cancelAnimationFrame(el._voteCountRaf); el._voteCountRaf = null; }
    if (from === to) { el.textContent = String(to); return; }
    const duration = 500;
    const start = performance.now();
    const step = now => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = String(Math.round(from + (to - from) * eased));
      if (t < 1) {
        el._voteCountRaf = requestAnimationFrame(step);
      } else {
        el.textContent = String(to);
        el._voteCountRaf = null;
      }
    };
    el._voteCountRaf = requestAnimationFrame(step);
  }

  function voteChartColHTML(side, stance, delta) {
    return '<div class="vote-chart-col vote-chart-' + side + '">' +
      '<div class="vote-chart-track">' +
        '<div class="vote-chart-count" data-value="0">0</div>' +
        '<div class="vote-chart-fill" style="height:0%"></div>' +
      '</div>' +
      '<div class="vote-chart-stance">' + escapeHtml(stance) + '</div>' +
      (delta == null ? '' : '<div class="vote-chart-delta">' + voteDeltaText(delta) + '</div>') +
    '</div>';
  }

  function buildVoteChartHTML(counts, deltas) {
    return '<div class="vote-chart" role="img" aria-label="\u6b63\u65b9 ' + counts.pro + ' \u7968\uff0c\u53cd\u65b9 ' + counts.con + ' \u7968">' +
      voteChartColHTML('pro', state.proStance || '\u6b63\u65b9', deltas ? deltas.pro : null) +
      voteChartColHTML('con', state.conStance || '\u53cd\u65b9', deltas ? deltas.con : null) +
    '</div>';
  }

  // \u628a\u6570\u503c\u5199\u8fdb\u5df2\u5b58\u5728\u7684 DOM \u8282\u70b9\uff08\u800c\u4e0d\u91cd\u5efa innerHTML\uff09\uff0c
  // \u8fd9\u6837 .vote-chart-fill \u7684 CSS transition \u548c\u8ba1\u6570\u8ddf\u8fdb\u624d\u80fd\u751f\u6548
  function applyVoteChartValues(chart, counts, deltas, animate) {
    if (!chart) return;
    chart.setAttribute('aria-label', '\u6b63\u65b9 ' + counts.pro + ' \u7968\uff0c\u53cd\u65b9 ' + counts.con + ' \u7968');
    const max = Math.max(counts.pro, counts.con, 1);
    const stances = { pro: state.proStance || '正方', con: state.conStance || '反方' };
    ['pro', 'con'].forEach(side => {
      const col = chart.querySelector('.vote-chart-' + side);
      if (!col) return;
      const stanceEl = col.querySelector('.vote-chart-stance');
      if (stanceEl) stanceEl.textContent = stances[side];
      const fill = col.querySelector('.vote-chart-fill');
      // 领先一方用满「轨道高度 − 柱顶数字」的全部空间，另一方按比例
      if (fill) fill.style.height = 'calc((100% - var(--vc-reserve, 0px)) * ' + (voteChartHeightPct(counts[side], max) / 100).toFixed(4) + ')';
      const countEl = col.querySelector('.vote-chart-count');
      if (countEl) {
        const prev = Number(countEl.dataset.value || 0);
        const next = counts[side];
        countEl.dataset.value = String(next);
        if (animate && prev !== next) {
          tweenVoteCount(countEl, prev, next);
        } else {
          if (countEl._voteCountRaf) { cancelAnimationFrame(countEl._voteCountRaf); countEl._voteCountRaf = null; }
          countEl.textContent = String(next);
        }
      }
      if (deltas) {
        const deltaEl = col.querySelector('.vote-chart-delta');
        if (deltaEl) deltaEl.textContent = voteDeltaText(deltas[side]);
      }
    });
  }

  // \u521a\u63d2\u5165\u7684\u8282\u70b9\u8981\u5148\u8ba9\u6d4f\u89c8\u5668\u771f\u7684\u753b\u51fa 0% \u8fd9\u4e00\u5e27\uff0c\u4e0b\u4e00\u5e27\u518d\u8bbe\u76ee\u6807\u503c\uff0cCSS transition \u624d\u4f1a\u63a5\u7ba1
  // \uff08\u5355\u5c42 rAF \u4e0d\u591f\uff1a\u5b83\u5728\u4e0b\u4e00\u6b21\u91cd\u7ed8\u4e4b\u524d\u6267\u884c\uff0c\u53ef\u80fd\u8ddf\u63d2\u5165\u65f6\u7684\u90a3\u6b21\u91cd\u7ed8\u5408\u5e76\uff0c0% \u6839\u672c\u6ca1\u753b\u51fa\u6765\uff09\uff1b
  // \u51cf\u52a8\u6a21\u5f0f\u4e0b\u76f4\u63a5\u4e00\u6b65\u5230\u4f4d\uff0c\u4e0d\u8d70 rAF\uff0c\u907f\u514d\u95ea\u4e00\u4e0b 0
  function paintVoteChartFresh(chart, counts, deltas) {
    if (!chart) return;
    if (prefersReducedMotion()) {
      applyVoteChartValues(chart, counts, deltas, false);
    } else {
      requestAnimationFrame(() => requestAnimationFrame(() => applyVoteChartValues(chart, counts, deltas, true)));
    }
  }

  // \u8282\u70b9\u5df2\u7ecf\u5728\u9875\u9762\u4e0a\u3001\u53ea\u662f\u7968\u6570\u53d8\u4e86\uff1a\u76f4\u63a5\u6539\u503c\uff0c\u5df2\u7ecf\u753b\u51fa\u6765\u7684\u65e7\u9ad8\u5ea6/\u65e7\u6570\u5b57\u8ba9 CSS transition
  // \u548c\u6570\u5b57\u6eda\u52a8\u52a8\u753b\u81ea\u5df1\u4ece\u65e7\u503c\u52a8\u8fc7\u53bb\uff0c\u4e0d\u9700\u8981\u518d\u7ed5 rAF
  function paintVoteChartUpdate(chart, counts, deltas) {
    if (!chart) return;
    applyVoteChartValues(chart, counts, deltas, !prefersReducedMotion());
  }

  // 赛前票数页底下的「锁票」按钮：投票中 → 锁票；已锁票 → 重新开放（进入赛后投票）。
  function votePreLockState(snap) {
    const ph = snap.phase;
    if (ph === 'collecting') return { label: '\u9501\u7968', action: 'lock', disabled: false, locked: false };
    if (ph === 'paused') return { label: '\u91cd\u65b0\u5f00\u653e\u6295\u7968', action: 'reopen', disabled: false, locked: true };
    if (ph === 'live' || ph === 'closed') return { label: '\u5df2\u9501\u7968', action: '', disabled: true, locked: true };
    return { label: '\u9501\u7968', action: '', disabled: true, locked: false };
  }
  function votePreLockHTML(snap) {
    const st = votePreLockState(snap);
    return '<div class="vote-page-actions"><button type="button" class="btn btn-ghost vote-lock-btn' + (st.locked ? ' is-locked' : '') +
      '" data-vote-action="' + st.action + '"' + (st.disabled ? ' disabled' : '') + '>' +
      (st.locked ? '\ud83d\udd12 ' : '') + st.label + '</button></div>';
  }
  function paintVotePreLock(snap) {
    const btn = stage.querySelector('.vote-lock-btn');
    if (!btn) return;
    const st = votePreLockState(snap);
    btn.textContent = (st.locked ? '\ud83d\udd12 ' : '') + st.label;
    btn.disabled = st.disabled;
    btn.dataset.voteAction = st.action;
    btn.classList.toggle('is-locked', st.locked);
  }
  stage.addEventListener('click', e => {
    const btn = e.target.closest && e.target.closest('.vote-lock-btn');
    if (!btn || btn.disabled || !window.VoteHost) return;
    if (btn.dataset.voteAction === 'lock' && window.VoteHost.lockPre) window.VoteHost.lockPre();
    else if (btn.dataset.voteAction === 'reopen' && window.VoteHost.reopen) window.VoteHost.reopen();
  });

  function renderVotePre() {
    const snap = voteSnapshot();
    const locked = !!snap.baseline;
    const counts = locked ? snap.baseline : snap.counts;
    const total = counts.pro + counts.con;
    const chart = stage.querySelector('.vote-chart');
    if (stage.dataset.voteView === 'pre' && chart && !chart.querySelector('.vote-chart-delta')) {
      const statusEl = stage.querySelector('.vote-page-status');
      if (statusEl) statusEl.textContent = locked ? '\u521d\u59cb\u7acb\u573a' : '\u5b9e\u65f6';
      const totalEl = stage.querySelector('.vote-page-total');
      if (totalEl) totalEl.textContent = '\u5171 ' + total + ' \u4eba';
      const hintEl = stage.querySelector('.vote-page-hint');
      if (hintEl) hintEl.textContent = locked ? '\u521d\u59cb\u7acb\u573a\u5df2\u9501\u5b9a' : '\u9501\u7968\u540e\uff0c\u5f53\u524d\u7968\u6570\u4f5c\u4e3a\u8d5b\u540e\u589e\u51cf\u7684\u57fa\u51c6';
      paintVoteChartUpdate(chart, counts, null);
      paintVotePreLock(snap);
      return;
    }
    stage.innerHTML =
      '<section class="vote-page vote-page-pre" aria-label="\u8d5b\u524d\u7968\u6570">' +
        '<div class="vote-page-head">' +
          '<div class="vote-page-eyebrow">\u89c2\u4f17\u6295\u7968</div>' +
          '<h2 class="vote-page-title">\u8d5b\u524d\u7968\u6570</h2>' +
          '<div class="vote-page-sub">' +
            '<span class="vote-page-status">' + (locked ? '\u521d\u59cb\u7acb\u573a' : '\u5b9e\u65f6') + '</span>' +
            '<span class="vote-page-total">\u5171 ' + total + ' \u4eba</span>' +
          '</div>' +
        '</div>' +
        buildVoteChartHTML(counts, null) +
        '<p class="vote-page-hint">' + (locked ? '\u521d\u59cb\u7acb\u573a\u5df2\u9501\u5b9a' : '\u9501\u7968\u540e\uff0c\u5f53\u524d\u7968\u6570\u4f5c\u4e3a\u8d5b\u540e\u589e\u51cf\u7684\u57fa\u51c6') + '</p>' +
        votePreLockHTML(snap) +
      '</section>';
    stage.dataset.voteView = 'pre';
    paintVoteChartFresh(stage.querySelector('.vote-chart'), counts, null);
  }

  function renderVoteFinal() {
    const snap = voteSnapshot();
    const counts = snap.counts;
    const total = counts.pro + counts.con;
    const deltas = snap.baseline
      ? { pro: counts.pro - snap.baseline.pro, con: counts.con - snap.baseline.con }
      : null;
    const chart = stage.querySelector('.vote-chart');
    if (stage.dataset.voteView === 'final' && chart && !!chart.querySelector('.vote-chart-delta') === !!deltas) {
      const totalEl = stage.querySelector('.vote-page-total');
      if (totalEl) totalEl.textContent = '\u5171 ' + total + ' \u4eba\u6295\u7968';
      paintVoteChartUpdate(chart, counts, deltas);
      return;
    }
    stage.innerHTML =
      '<section class="vote-page vote-page-final" aria-label="\u6700\u7ec8\u7968\u6570">' +
        '<div class="vote-page-head">' +
          '<div class="vote-page-eyebrow">\u89c2\u4f17\u6295\u7968</div>' +
          '<h2 class="vote-page-title">\u6700\u7ec8\u7968\u6570</h2>' +
          '<div class="vote-page-sub">' +
            '<span class="vote-page-total">\u5171 ' + total + ' \u4eba\u6295\u7968</span>' +
          '</div>' +
        '</div>' +
        buildVoteChartHTML(counts, deltas) +
        (deltas ? '' : '<p class="vote-page-hint">\u672c\u6b21\u6295\u7968\u6ca1\u6709\u9501\u5b9a\u521d\u59cb\u7acb\u573a</p>') +
      '</section>';
    stage.dataset.voteView = 'final';
    paintVoteChartFresh(stage.querySelector('.vote-chart'), counts, deltas);
  }

  function onVoteUpdate() {
    const mode = curMode();
    if (mode === 'vote-pre') renderVotePre();
    else if (mode === 'vote-final') renderVoteFinal();
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
    setFieldValue('coverProStance', state.proStance || '');
    setFieldValue('coverConStance', state.conStance || '');
    fitCoverTeamNames();
    fitCoverTopic();
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
    bind('coverTopic', 'topic', 80, () => { syncHeaderTopic(); fitCoverTopic(); });
    // updateTimes() 在首页会走 syncCoverFields()，顺带重新适配队名字号
    bind('coverProSchool', 'proName', 32, () => { updateTimes(); applyInputs(); });
    bind('coverConSchool', 'conName', 32, () => { updateTimes(); applyInputs(); });
    bind('coverProStance', 'proStance', 40);
    bind('coverConStance', 'conStance', 40);
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

  function isTouchDevice() {
    return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  }

  function startEditTime(el) {
    if (state.running) return;
    const target = el.dataset.target; // single | pro | con
    // 触屏上点双计时的数字是开始 / 切换（见 renderDuel），改时间去设置里改环节时长
    if (target !== 'single' && isTouchDevice()) return;
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
    const onPanelTap = (side) => (e) => {
      if (e.target.closest('.duel-reset-btn')) return;
      // 数字占了面板大半：只有「桌面 + 暂停中」点数字才是改时间，
      // 计时中或触屏上点数字和点面板别处一样（否则手机上经常点了没反应）
      if (e.target.closest('.editable-time') && !state.running && !isTouchDevice()) return;
      if (curMode() !== 'duel') return;
      if (!state.running) { state.duel.active = side; toggleRun(); }
      else { state.duel.active = state.duel.active === 'pro' ? 'con' : 'pro'; }
      updateDuelActive();
    };
    document.getElementById('panelPro').addEventListener('click', onPanelTap('pro'));
    document.getElementById('panelCon').addEventListener('click', onPanelTap('con'));
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

  /* ---------------- 共用时间池（雅哲杯自由辩论） ---------------- */
  const SIDE_LABEL = { pro: '\u6b63\u65b9', con: '\u53cd\u65b9' };
  function renderPool() {
    const stg = curStage();
    const head = stg.tag ? escapeHtml(stg.tag) + ' · ' + escapeHtml(stg.name) : escapeHtml(stg.name);
    const sideBtn = (k) => `
          <button type="button" class="pool-side" data-side="${k}" id="poolSide_${k}">
            <span class="pool-side-label">${SIDE_LABEL[k]}</span>
            <span class="pool-side-name" id="poolSideName_${k}"></span>
            <span class="pool-side-status" id="poolSideStatus_${k}"></span>
          </button>`;
    stage.innerHTML = `
      <div class="pool" id="pool">
        <div class="pool-head">
          <span class="pool-title">${head}</span>
          <span class="pool-shared">共用 <b id="poolHeadLeft">${formatTime(state.pool.left)}</b></span>
        </div>
        <div class="pool-sides">${sideBtn('pro')}<span class="pool-vs">VS</span>${sideBtn('con')}</div>
        <div class="pool-turn" id="poolTurn">${Math.ceil(state.pool.turn)}</div>
        <div class="pool-turn-meta"><span>本次发言</span><span>上限 ${poolTurnCap(stg)} 秒</span></div>
        <div class="pool-bar pool-bar-turn"><div class="pool-bar-fill" id="poolTurnFill"></div></div>
        <div class="pool-left-row">双方共用剩余 <b id="poolLeft">${formatTime(state.pool.left)}</b></div>
        <div class="pool-bar pool-bar-left"><div class="pool-bar-fill" id="poolLeftFill"></div></div>
        <div class="pool-actions">
          <button type="button" class="pool-btn pool-btn-primary" id="poolStart" title="开始 / 暂停（空格）">开始</button>
          <button type="button" class="pool-btn" id="poolSwitch" title="换边并重置单次发言（S）">⇄ 换到反方</button>
          <button type="button" class="pool-btn" id="poolReset" title="重置（R）">重置</button>
        </div>
      </div>`;
    document.getElementById('poolStart').addEventListener('click', (e) => { e.currentTarget.blur(); toggleRun(); });
    document.getElementById('poolSwitch').addEventListener('click', (e) => { e.currentTarget.blur(); switchPoolSide(); });
    document.getElementById('poolReset').addEventListener('click', (e) => { e.currentTarget.blur(); resetTimer(); });
    ['pro', 'con'].forEach(k => document.getElementById('poolSide_' + k).addEventListener('click', (e) => {
      e.currentTarget.blur();
      if (state.pool.active !== k) switchPoolSide(k);
      else if (!state.running) toggleRun();
    }));
    updatePoolActive();
    fitPool();
  }

  // 自由辩论（共用）画面按舞台高度自适应：先压缩侧框、间距、进度条（--pf 1→0.55），
  // 仍放不下才缩小 25 秒大数字（--pt）。上下各留呼吸空间，保证所有元素都在舞台框内。
  function poolNeeded(pool) {
    const cs = getComputedStyle(pool);
    const pad = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    if (pool.classList.contains('pool-compact')) {
      // grid：按行累加（同一行取最高）
      const rows = new Map();
      [...pool.querySelectorAll(':scope > *, :scope > .pool-sides > *')].forEach(k => {
        if (k.classList.contains('pool-sides') || k.offsetParent === null) return;
        const r = k.getBoundingClientRect();
        const ga = getComputedStyle(k).gridRowStart;
        const key = (ga === 'pro' || ga === 'con' || ga === 'turn') ? 'mid' : ga;
        rows.set(key, Math.max(rows.get(key) || 0, r.height + (parseFloat(getComputedStyle(k).marginTop) || 0)));
      });
      const gap = parseFloat(cs.rowGap) || 0;
      let h = pad + gap * Math.max(0, rows.size - 1);
      rows.forEach(v => { h += v; });
      return h;
    }
    const kids = [...pool.children].filter(k => k.offsetParent !== null);
    const gap = parseFloat(cs.rowGap) || 0;
    let h = pad + gap * Math.max(0, kids.length - 1);
    kids.forEach(k => {
      const r = k.getBoundingClientRect(), m = getComputedStyle(k);
      h += r.height + (parseFloat(m.marginTop) || 0) + (parseFloat(m.marginBottom) || 0);
    });
    return h;
  }
  function fitPoolMode(pool, avail) {
    pool.style.removeProperty('--pf');
    pool.style.removeProperty('--pt');
    let pf = 1;
    while (poolNeeded(pool) > avail && pf > 0.55) {
      pf = Math.max(0.55, pf - 0.05);
      pool.style.setProperty('--pf', pf.toFixed(2));
    }
    const turn = document.getElementById('poolTurn');
    const fs0 = parseFloat(getComputedStyle(turn).fontSize);
    let fs = fs0, guard = 60;
    while (poolNeeded(pool) > avail && fs > 40 && guard--) {
      fs = Math.max(40, fs * 0.95);
      pool.style.setProperty('--pt', fs.toFixed(1) + 'px');
    }
    return fs;
  }
  function fitPool() {
    const pool = document.getElementById('pool');
    if (!pool) return;
    const st = pool.parentElement;
    const avail = st.clientHeight - Math.max(14, st.clientHeight * 0.035) * 2;
    if (avail <= 0) return;
    pool.classList.remove('pool-compact');
    const fsStack = fitPoolMode(pool, avail);
    // 竖排要把 25 秒数字缩到原来的 70% 以下才放得下时，改用侧框在两边的紧凑布局
    const natural = Math.min(400, Math.max(88, Math.min(innerHeight * 0.31, innerWidth * 0.24)));
    if (fsStack < natural * 0.7 && innerWidth > 640) {
      pool.classList.add('pool-compact');
      const fsCompact = fitPoolMode(pool, avail);
      if (fsCompact <= fsStack) { pool.classList.remove('pool-compact'); fitPoolMode(pool, avail); }
    }
  }
  if (typeof ResizeObserver !== 'undefined') {
    let poolFitRaf = 0;
    const ro = new ResizeObserver(() => { cancelAnimationFrame(poolFitRaf); poolFitRaf = requestAnimationFrame(fitPool); });
    const watchStage = () => { const st = document.querySelector('.stage'); if (st) ro.observe(st); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchStage); else watchStage();
    new MutationObserver(() => requestAnimationFrame(fitPool)).observe(document.body || document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-screen', 'class'] });
  }

  function resetPoolTurn() {
    state.pool.turn = Math.max(0, Math.min(poolTurnCap(curStage()), state.pool.left));
  }

  // 换边：切到对方（或指定一方）并重置单次发言；计时中接着跑，暂停时保持暂停
  function switchPoolSide(side) {
    if (curMode() !== 'pool') return;
    if (state.pool.left <= 0) return;
    const next = side === 'pro' || side === 'con' ? side : (state.pool.active === 'pro' ? 'con' : 'pro');
    state.pool.active = next;
    resetPoolTurn();
    updatePoolActive();
    updateTimes();
  }

  function updatePoolActive() {
    const ended = state.pool.left <= 0;
    ['pro', 'con'].forEach(k => {
      const b = document.getElementById('poolSide_' + k);
      if (!b) return;
      const on = state.pool.active === k;
      b.classList.toggle('active', on);
      b.classList.toggle('inactive', !on);
      const st = document.getElementById('poolSideStatus_' + k);
      if (st) st.textContent = ended ? '已结束' : on ? (state.running ? '发言中' : '待开始') : '待命';
      const nm = document.getElementById('poolSideName_' + k);
      if (nm) nm.textContent = (k === 'pro' ? state.proName : state.conName) || '';
    });
    const sw = document.getElementById('poolSwitch');
    if (sw) { sw.textContent = '⇄ 换到' + SIDE_LABEL[state.pool.active === 'pro' ? 'con' : 'pro']; sw.disabled = ended; }
    const st = document.getElementById('poolStart');
    if (st) {
      st.textContent = state.running ? '暂停' : (ended ? '已结束' : '开始');
      st.disabled = ended && !state.running;
    }
    const root = document.getElementById('pool');
    if (root) root.dataset.active = state.pool.active;
  }

  function updatePoolTimes() {
    const stg = curStage();
    const cap = poolTurnCap(stg);
    const turnEl = document.getElementById('poolTurn');
    const turn = Math.max(0, state.pool.turn);
    const warn = state.pool.left > 0 && turn <= 5;
    if (turnEl) {
      turnEl.textContent = String(Math.ceil(turn - 1e-6));
      turnEl.className = 'pool-turn' + (warn ? ' warning' : '') + (state.pool.left <= 0 ? ' overtime' : '');
    }
    const tf = document.getElementById('poolTurnFill');
    if (tf) { tf.style.width = Math.min(100, turn / cap * 100) + '%'; tf.className = 'pool-bar-fill' + (warn ? ' warning' : ''); }
    const leftTxt = formatTime(Math.ceil(state.pool.left - 1e-6));
    const l1 = document.getElementById('poolLeft'); if (l1) l1.textContent = leftTxt;
    const l2 = document.getElementById('poolHeadLeft'); if (l2) l2.textContent = leftTxt;
    const lf = document.getElementById('poolLeftFill');
    if (lf) lf.style.width = Math.min(100, Math.max(0, state.pool.left / stg.duration * 100)) + '%';
  }

  function updateTimes() {
    if (curMode() === 'cover') {
      syncCoverFields();
      syncHeaderTopic();
      return;
    }
    if (curMode() === 'pool') { updatePoolTimes(); return; }
    if (isTimerless(curMode())) return; // vote-pre / vote-final：票数由事件驱动的渲染负责，这里没有计时要同步
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
    if (curMode() === 'pool') {
      tickPool(delta);
    } else if (curMode() === 'duel') {
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

  function tickPool(delta) {
    const p = state.pool;
    if (p.left <= 0) { handleTimeUp(); return; }
    const prevTurn = Math.ceil(p.turn - 1e-6);
    p.left = Math.max(0, p.left - delta);
    p.turn = Math.max(0, p.turn - delta);
    if (p.turn > p.left) p.turn = p.left;
    if (p.left <= 0) {
      p.turn = 0;
      beepEnd(); flashScreen();
      handleTimeUp();
      return;
    }
    const nowTurn = Math.ceil(p.turn - 1e-6);
    if (nowTurn !== prevTurn && nowTurn <= 5 && nowTurn > 0) beepTick();
    if (p.turn <= 0) {
      // 单次发言到点：自动换边、重置，继续跑
      beep30();
      p.active = p.active === 'pro' ? 'con' : 'pro';
      resetPoolTurn();
      updatePoolActive();
    }
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
    if (curMode() === 'pool') {
      state.running = false;
      updateStartButton();
      updatePoolActive();
      updateTimes();
      if (state.autoFlow) setTimeout(() => nextStage(), 1200);
      return;
    }
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
    if (curMode() === 'pool') return state.pool.left;
    return curMode() === 'duel' ? state.duel[state.duel.active] : state.remaining;
  }

  function toggleRun() {
    if (isTimerless(curMode())) return;
    ensureAudio();
    // 时间到后不再继续计时：已归零的计时器不能再开始，只能重置
    if (!state.running && activeRemaining() <= 0) { updateStartButton(); return; }
    state.running = !state.running;
    state.lastTick = 0;
    if (state.running && !rafId) rafId = requestAnimationFrame(loop);
    updateStartButton();
    if (curMode() === 'duel') updateDuelActive();
    if (curMode() === 'pool') updatePoolActive();
  }

  // 手机底栏的「切换」：只换发言方。计时中换过去接着跑，暂停时不自动开始
  function switchDuelSide() {
    if (curMode() === 'pool') { switchPoolSide(); return; }
    if (curMode() !== 'duel') return;
    state.duel.active = state.duel.active === 'pro' ? 'con' : 'pro';
    updateDuelActive();
  }

  function resetTimer() {
    state.running = false;
    updateStartButton();
    if (isTimerless(curMode())) {
      updateTimes();
      return;
    }
    if (curMode() === 'duel') {
      state.duel.pro = curDuration();
      state.duel.con = curDuration();
      state.duel.active = 'pro';
      const rt = getRuntime(curStage().id);
      rt.duelPro = state.duel.pro; rt.duelCon = state.duel.con; rt.duelActive = 'pro';
    } else if (curMode() === 'pool') {
      state.pool.left = curDuration();
      state.pool.active = 'pro';
      resetPoolTurn();
      const rt = getRuntime(curStage().id);
      rt.poolLeft = state.pool.left; rt.poolTurn = state.pool.turn; rt.poolActive = 'pro';
    } else {
      state.remaining = curDuration();
      const rt = getRuntime(curStage().id);
      rt.remaining = state.remaining;
    }
    updateTimes();
    if (curMode() === 'duel') updateDuelActive();
    if (curMode() === 'pool') updatePoolActive();
  }

  function setCurrent(id) {
    if (!state.stages.find(s => s.id === id)) return;
    // Save current runtime to cache
    saveCurrentRuntime();
    state.currentId = id;
    state.running = false;
    // Restore from cache (preserves remaining)
    const rt = getRuntime(id);
    if (isTimerless(curMode())) {
      state.remaining = 0;
    } else if (curMode() === 'duel') {
      state.duel.pro = rt.duelPro;
      state.duel.con = rt.duelCon;
      state.duel.active = rt.duelActive || 'pro';
    } else if (curMode() === 'pool') {
      state.pool.left = rt.poolLeft;
      state.pool.turn = rt.poolTurn;
      state.pool.active = rt.poolActive || 'pro';
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
    if (isTimerless(curMode())) {
      return;
    }
    if (curMode() === 'duel') {
      rt.duelPro = state.duel.pro;
      rt.duelCon = state.duel.con;
      rt.duelActive = state.duel.active;
    } else if (curMode() === 'pool') {
      rt.poolLeft = state.pool.left;
      rt.poolTurn = state.pool.turn;
      rt.poolActive = state.pool.active;
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

  /* ---------------- 环节导航（一行横向滚动） + 全部环节面板 ---------------- */
  let modeTabsShown = false; // 页面初始化时直接定位，初始化完成后换环节才平滑滚动
  function renderModeTabs() {
    const tabs = document.getElementById('modeTabs');
    let buttons = Array.from(tabs.children);
    // 环节没增删、没换顺序时只改类名和文字，不重建：
    // 这样当前环节的色块有过渡，滚动位置也不会先跳回开头
    const same = buttons.length === state.stages.length &&
      state.stages.every((s, i) => buttons[i].dataset.id === s.id);
    if (!same) {
      const keep = tabs.scrollLeft || 0;
      tabs.innerHTML = '';
      buttons = state.stages.map(s => {
        const b = document.createElement('button');
        // 先带上样式类再插入：否则会从浏览器默认按钮样式过渡到 .mode-tab，
        // 0.2 秒内量到的宽度是错的，滚动位置也跟着算错
        b.className = 'mode-tab';
        b.dataset.id = s.id;
        tabs.appendChild(b);
        return b;
      });
      tabs.scrollLeft = keep;
    }
    state.stages.forEach((s, i) => {
      const b = buttons[i];
      b.className = 'mode-tab' + (s.id === state.currentId ? ' active' : '');
      if (b.textContent !== s.name) b.textContent = s.name;
      b.title = s.type === 'duel' ? '双计时 · ' + duelFlowTitle(duelFlowOf(s)) : '';
    });
    scrollTabsToActive();
    renderStagePanel();
  }

  // 把当前环节滚到这一行的中间：导航跟着环节往前走。
  // 首页不显示导航、量不到尺寸，所以 renderStage() 切完页面后还会再调一次
  function scrollTabsToActive(instant) {
    const tabs = document.getElementById('modeTabs');
    const active = Array.from(tabs.children).find(b => String(b.className).indexOf('active') >= 0);
    const box = tabs.getBoundingClientRect();
    if (active && box.width > 0) {
      const cur = active.getBoundingClientRect();
      const left = (tabs.scrollLeft || 0) + cur.left - box.left - (box.width - cur.width) / 2;
      const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const smooth = modeTabsShown && !instant && !reduce;
      if (typeof tabs.scrollTo === 'function') tabs.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
      else tabs.scrollLeft = left;
    }
    updateTabsFade();
  }

  // 还能往哪边滚，就给哪边加淡出（样式在 .mode-tabs.fade-left / .fade-right）
  function updateTabsFade() {
    const tabs = document.getElementById('modeTabs');
    const max = (tabs.scrollWidth || 0) - (tabs.clientWidth || 0);
    tabs.classList.toggle('fade-left', (tabs.scrollLeft || 0) > 2);
    tabs.classList.toggle('fade-right', (tabs.scrollLeft || 0) < max - 2);
  }

  // 「…」打开的面板：列出全部环节（序号、名称、时长），点一下直接跳过去
  function renderStagePanel() {
    const list = document.getElementById('stagePanelList');
    list.innerHTML = '';
    let no = 0, total = 0;
    state.stages.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-tab stage-panel-item' + (s.id === state.currentId ? ' active' : '');
      b.dataset.id = s.id;
      const add = (cls, text) => {
        const span = document.createElement('span');
        span.className = cls;
        span.textContent = text;
        b.appendChild(span);
      };
      if (isTimerless(s.type)) {
        add('stage-panel-no', '');
        add('stage-panel-name', s.name);
      } else {
        no += 1;
        total += (Number(s.duration) || 0) * stageTotalFactor(s);
        add('stage-panel-no', String(no));
        add('stage-panel-name', s.name);
        add('stage-panel-meta', (s.type === 'duel' ? '双 ' : s.type === 'pool' ? '共用 ' : '') + formatTime(s.duration));
      }
      list.appendChild(b);
    });
    document.getElementById('stagePanelTitle').textContent = '全部环节 · ' + no + ' 个 · 共 ' + formatTime(total);
  }

  function isStagePanelOpen() {
    return document.getElementById('stagePanel').classList.contains('open');
  }
  function setStagePanel(open) {
    const panel = document.getElementById('stagePanel');
    panel.classList.toggle('open', open);
    document.getElementById('btnAllStages').setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open || typeof panel.querySelector !== 'function') return;
    // 环节多到面板要滚动时，把当前环节露出来
    const cur = panel.querySelector('.stage-panel-item.active');
    if (cur && typeof cur.scrollIntoView === 'function') cur.scrollIntoView({ block: 'nearest' });
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
    if (isTimerless(curMode())) {
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
      const over = curMode() === 'pool' ? state.pool.left <= 0 : (state.remaining <= 0 && curMode() !== 'duel');
      label.textContent = over ? '\u5df2\u7ed3\u675f' : '\u5f00\u59cb';
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
      const isVote = stg.type === 'vote-pre' || stg.type === 'vote-final';
      const locked = isCover || isVote; // 不能切类型/改时长/删除
      const row = document.createElement('div');
      row.className = 'stage-row';
      row.draggable = !isVote; // 投票环节位置固定，不能拖拽重排
      row.dataset.idx = idx;
      const typeLabel = isCover ? '\u9996\u9875' : isVote ? '\u6295\u7968' : (stg.type === 'duel' ? '\u53cc' : stg.type === 'pool' ? '\u5171' : '\u5355');
      const typeTitle = isCover ? '\u9996\u9875\u4e0d\u53c2\u4e0e\u8ba1\u65f6' : isVote ? '\u6295\u7968\u73af\u8282\u4e0d\u53c2\u4e0e\u8ba1\u65f6\uff0c\u4f4d\u7f6e\u56fa\u5b9a' : stg.type === 'pool' ? ('共用时间池：双方共用总时长，单次发言上限 ' + poolTurnCap(stg) + ' 秒（点击改为单计时）') : '\u5207\u6362\u7c7b\u578b';
      row.innerHTML = `
        <span class="stage-grip">⋮⋮</span>
        <input class="stage-name-input" value="${escapeHtml(stg.name)}" maxlength="10" ${isVote ? 'disabled' : ''}>
        <button class="stage-type-pill" data-type="${stg.type}" title="${typeTitle}" ${locked ? 'disabled' : ''}>${typeLabel}</button>
        <button class="stage-flow-pill"></button>
        <input type="number" class="stage-dur-input" value="${stg.duration}" min="0" step="10" ${locked ? 'disabled' : ''}>
        <span style="font-size:10px;color:var(--ink-3);font-family:'JetBrains Mono',monospace;">s</span>
        <button class="stage-del" title="\u5220\u9664" ${locked ? 'disabled' : ''}>\u00d7</button>
      `;
      const flowPill = row.querySelector('.stage-flow-pill');
      syncFlowPill(flowPill, stg);
      // name
      row.querySelector('.stage-name-input').addEventListener('input', (e) => {
        if (isVote) return;
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
        if (locked) return;
        stg.type = stg.type === 'duel' || stg.type === 'pool' ? 'single' : 'duel';
        delete stg.turn; delete stg.tag;
        delete runtimeCache[stg.id];
        renderStagesList(); renderModeTabs(); updateFlowDots();
        if (stg.id === state.currentId) { resetTimer(); renderStage(); }
        saveState();
      });
      // duration
      row.querySelector('.stage-dur-input').addEventListener('change', (e) => {
        if (locked) return;
        const v = Math.max(10, parseInt(e.target.value) || 10);
        stg.duration = v; e.target.value = v;
        // invalidate cache so the new duration takes effect
        delete runtimeCache[stg.id];
        if (stg.id === state.currentId && !state.running) { resetTimer(); renderStage(); }
        saveState();
      });
      // delete
      row.querySelector('.stage-del').addEventListener('click', () => {
        if (locked) return;
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
        ensureVoteStages();
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
    ensureVoteStages();
    renderStagesList(); renderModeTabs(); updateFlowDots();
    saveState();
  }

  /* ---------------- Preset storage ---------------- */
  function clearRuntimeCache() {
    Object.keys(runtimeCache).forEach(k => delete runtimeCache[k]);
  }

  // 预设 / 计时器存储从不带 vote-pre / vote-final：它们是「开启观众投票」这个开关
  // 派生出来的，不是赛制的一部分，套用预设后 ensureVoteStages() 会按当前开关重新插回。
  function cloneStages(stages) {
    return stages.filter(s => s.type !== 'vote-pre' && s.type !== 'vote-final').map(s => {
      const out = { id: s.id, name: s.name, type: s.type, duration: s.duration };
      if (isDuelFlow(s.duelFlow)) out.duelFlow = s.duelFlow;
      if (s.type === 'pool') { out.turn = poolTurnCap(s); if (s.tag) out.tag = s.tag; }
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
      const totalSeconds = preset.stages.reduce((sum, stg) => sum + (Number(stg.duration) || 0) * stageTotalFactor(stg), 0);
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
      if (st.type === 'pool') { out.turn = poolTurnCap(st); if (st.tag) out.tag = String(st.tag).slice(0, 12); }
      return out;
    });
    ensureCoverStage();
    ensureVoteStages();
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
    ensureVoteStages();
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
    const rows = stages.filter(s => s.type !== 'cover' && s.type !== 'vote-pre' && s.type !== 'vote-final').map(s => {
      const row = [s.name, s.type === 'duel' ? 1 : s.type === 'pool' ? 2 : 0, s.duration];
      if (s.type === 'pool') { row.push(poolTurnCap(s)); if (s.tag) row.push(String(s.tag)); }
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
        const st = { name, type: row[1] === 1 ? 'duel' : row[1] === 2 ? 'pool' : 'single', duration: Math.min(5999, Math.max(10, duration)) };
        if (st.type === 'pool') {
          st.turn = poolTurnCap({ turn: row[3] });
          if (typeof row[4] === 'string' && row[4].trim()) st.tag = row[4].trim().slice(0, 12);
        }
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
    const stages = state.stages.filter(s => s.type !== 'cover' && s.type !== 'vote-pre' && s.type !== 'vote-final');
    if (!stages.length) { setShareStatus('还没有环节'); return; }
    const totalSeconds = stages.reduce((sum, stg) => sum + (Number(stg.duration) || 0) * stageTotalFactor(stg), 0);
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
  function openDrawer() { setStagePanel(false); drawer.classList.add('open'); overlay.classList.add('show'); }
  function closeDrawer() { drawer.classList.remove('open'); overlay.classList.remove('show'); }

  /* ---------------- 开启观众投票 ----------------
     只是把 vote-pre / vote-final 两个特殊环节和 vote-host.js 那一整套 UI
     （图标按钮、票数条、投票面板）挂上/摘下，计票逻辑本身一直在 vote-host.js
     里跑，这里只负责开关。initial=true 时只同步 VoteHost，不重复触发渲染
     （init() 后面自己会 renderStagesList() / renderStage() 一次）。 */
  function applyVoteEnabled(initial) {
    if (window.VoteHost && typeof window.VoteHost.setEnabled === 'function') {
      window.VoteHost.setEnabled(state.voteEnabled);
    }
    const swVote = document.getElementById('swVoteEnabled');
    if (swVote) swVote.classList.toggle('on', state.voteEnabled);
    if (initial) return;
    if (!state.stages.find(s => s.id === state.currentId)) state.currentId = state.stages[0].id;
    renderStagesList();
    renderModeTabs();
    updateFlowDots();
    renderStage();
    updateStartButton();
    saveState();
  }

  /* ---------------- Theme + font ---------------- */
  const THEMES = ['neo', 'arena', 'academy', 'soft', 'broadcast', 'terminal'];
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
    // 各主题字体、字重不同，队名和辩题都要重新量
    fitCoverTeamNames();
    fitCoverTopic();
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
    document.getElementById('swVoteEnabled').classList.toggle('on', state.voteEnabled);
    const iconSound = document.getElementById('iconSound');
    const btnSound = document.getElementById('btnSound');
    btnSound.classList.toggle('active', state.sound);
  }

  /* ---------------- Event wiring ---------------- */
  function wire() {
    const modeTabs = document.getElementById('modeTabs');
    modeTabs.addEventListener('click', (e) => {
      const b = e.target.closest('.mode-tab');
      if (!b) return;
      setStagePanel(false);
      setCurrent(b.dataset.id);
    });
    modeTabs.addEventListener('scroll', updateTabsFade, { passive: true });
    // 鼠标滚轮上下滚也能横向翻环节（触控板的横向滚动原样放行）
    modeTabs.addEventListener('wheel', (e) => {
      if (modeTabs.scrollWidth <= modeTabs.clientWidth) return;
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      modeTabs.scrollLeft += e.deltaY;
    }, { passive: false });

    // 全部环节面板：点「…」开关，点环节跳转并收起，点面板外或按 Esc 收起
    document.getElementById('btnAllStages').addEventListener('click', () => setStagePanel(!isStagePanelOpen()));
    document.getElementById('stagePanel').addEventListener('click', (e) => {
      const b = e.target.closest('.stage-panel-item');
      if (!b) return;
      setStagePanel(false);
      setCurrent(b.dataset.id);
    });
    document.addEventListener('click', (e) => {
      if (isStagePanelOpen() && !(e.target.closest && e.target.closest('#modeNav'))) setStagePanel(false);
    });
    document.querySelectorAll('.add-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        addStage(btn.dataset.add, btn.dataset.type, parseInt(btn.dataset.dur));
      });
    });
    document.getElementById('btnStart').addEventListener('click', toggleRun);
    document.getElementById('btnPrev').addEventListener('click', prevStage);
    document.getElementById('btnNext').addEventListener('click', nextStage);
    // 这两个只在手机的双计时页显示，顶替上一 / 下一环节（换环节用顶部导航）
    document.getElementById('btnSwitch').addEventListener('click', switchDuelSide);
    document.getElementById('btnResetAll').addEventListener('click', resetTimer);
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
    document.getElementById('swVoteEnabled').addEventListener('click', () => {
      state.voteEnabled = !state.voteEnabled;
      ensureVoteStages();
      applyVoteEnabled();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isStagePanelOpen()) { setStagePanel(false); return; }
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
      else if (curMode() === 'pool' && (e.key === '1' || e.key === '2')) {
        const side = e.key === '1' ? 'pro' : 'con';
        if (state.pool.active !== side) switchPoolSide(side);
        if (!state.running) toggleRun();
      }
      else if (curMode() === 'pool' && (e.key.toLowerCase() === 's' || e.key === 'Enter')) { e.preventDefault(); switchPoolSide(); }
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
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('vote:update', onVoteUpdate);
      window.addEventListener('resize', fitCoverTeamNames);
      window.addEventListener('resize', () => scrollTabsToActive(true));
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { fitCoverTeamNames(); scrollTabsToActive(true); });
  }

  /* ---------------- Init ---------------- */
  loadState();
  timerPresets = loadTimerPresets();
  // ensureCoverStage() 会用 map() 换掉整个 stages 数组，必须跑在 renderStagesList()
  // 之前，否则抽屉里每一行闭包住的都是已经被丢弃的环节对象，
  // 页面刚打开时的第一次改名/改时长/换类型会全部丢失。
  ensureCoverStage();
  ensureVoteStages();
  if (!state.stages.find(s => s.id === state.currentId)) state.currentId = state.stages[0].id;
  applyVoteEnabled(true);
  applyTheme();
  applyInputs();
  loadBackground();
  renderStagesList();
  renderPresetList();
  renderModeTabs();
  if (isTimerless(curMode())) {
    state.remaining = 0;
  } else if (curMode() === 'duel') {
    state.duel.pro = curDuration();
    state.duel.con = curDuration();
  } else if (curMode() === 'pool') {
    state.pool.left = curDuration();
    state.pool.active = 'pro';
    resetPoolTurn();
  } else {
    state.remaining = curDuration();
  }
  renderStage();
  updateFlowDots();
  updateStartButton();
  wire();
  modeTabsShown = true;
})();
