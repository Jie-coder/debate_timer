/* vote-host.js — 主持端：生成房间 / 二维码，订阅 Supabase Realtime Broadcast 计票，
 * 维护投票阶段，导出结果。单独的 IIFE，不依赖 app.js，也不往 app.js 里加钩子。
 */
(function () {
  'use strict';

  var VC = window.VoteCore;
  if (!VC) { console.error('vote-host.js: VoteCore 未加载'); return; }

  var STORAGE_KEY = 'debate-timer-v2-vote';
  var TIMER_STORAGE_KEY = 'debate-timer-v2';
  var HISTORY_KEY = 'debate-timer-v2-vote-history';
  var ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var BACKOFF_MAX = 15000;

  function readTimerVoteEnabled() {
    var saved = loadJSON(TIMER_STORAGE_KEY, null);
    return !!(saved && saved.voteEnabled);
  }

  function genRoomCode() {
    var s = '';
    for (var i = 0; i < 6; i++) s += ROOM_CHARS[Math.floor(Math.random() * ROOM_CHARS.length)];
    return s;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function fmtDelta(n) {
    if (n > 0) return '+' + n;
    if (n < 0) return '−' + Math.abs(n);
    return '+0';
  }

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) return fallback;
      var v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  /* ---------------- State ---------------- */
  var savedSession = loadJSON(STORAGE_KEY, null);
  var state = {
    enabled: readTimerVoteEnabled(),
    room: (savedSession && savedSession.room) || genRoomCode(),
    phase: (savedSession && savedSession.phase) || 'idle', // idle | collecting | paused | live | closed
    baseline: (savedSession && savedSession.baseline) || null,
    tally: (savedSession && savedSession.votes) ? VC.restoreVotes(savedSession.votes) : VC.createTally(),
    ratioBarOn: savedSession ? !!savedSession.ratioBarOn : true,
    result: (savedSession && savedSession.result) || null,
    history: loadJSON(HISTORY_KEY, []),
  };

  function persistSession() {
    saveJSON(STORAGE_KEY, {
      room: state.room,
      phase: state.phase,
      baseline: state.baseline,
      votes: VC.serializeVotes(state.tally),
      ratioBarOn: state.ratioBarOn,
      result: state.result,
      updatedAt: Date.now(),
    });
  }

  /* ---------------- DOM ---------------- */
  var dom = {};
  function cacheDom() {
    [
      'btnVote', 'votePanel', 'voteOverlay', 'voteClose',
      'voteConfigWarning', 'voteMainSection',
      'voteRoomCode', 'voteQrWrap', 'voteLinkInput', 'voteCopyLink', 'voteNewRoom',
      'votePhase', 'voteCounts', 'voteStartBtn', 'voteLockBaseline', 'voteReopenBtn', 'voteEndBtn', 'voteResetBtn',
      'voteResultSection', 'voteResultBox', 'voteExportJson', 'voteExportCsv',
      'voteSwRatioBar', 'voteHistoryList',
      'voteRatioBar', 'vrbPro', 'vrbCon', 'vrbFillPro', 'vrbFillCon',
      'voteQrFullscreenBtn', 'voteQrFullscreen', 'vqfRoom', 'vqfQr', 'vqfUrl',
    ].forEach(function (id) { dom[id] = document.getElementById(id); });
  }

  function hasConfig() {
    var cfg = window.DEBATE_VOTE_CONFIG || {};
    return !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase && typeof window.supabase.createClient === 'function');
  }

  function defaultVoteBaseUrl() {
    var dir = location.pathname.replace(/[^/]*$/, '');
    return location.origin + dir + 'vote.html';
  }
  function voteBaseUrl() {
    var cfg = window.DEBATE_VOTE_CONFIG || {};
    var v = (cfg.VOTE_BASE_URL || '').trim();
    return v || defaultVoteBaseUrl();
  }
  function voteUrlFor(room) {
    var base = voteBaseUrl().replace(/\/+$/, '');
    var sep = base.indexOf('?') >= 0 ? '&' : '?';
    return base + sep + 'room=' + encodeURIComponent(room);
  }

  function renderQrInto(wrap, url) {
    if (!wrap) return;
    wrap.innerHTML = '';
    if (typeof window.qrcode !== 'function') {
      wrap.textContent = '二维码库加载失败，用下方链接';
      return;
    }
    try {
      var qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      wrap.innerHTML = qr.createSvgTag({ scalable: true });
    } catch (e) {
      wrap.textContent = '二维码生成失败';
    }
  }

  function renderRoomInfo() {
    var url = voteUrlFor(state.room);
    if (dom.voteRoomCode) dom.voteRoomCode.textContent = state.room;
    if (dom.voteLinkInput) dom.voteLinkInput.value = url;
    renderQrInto(dom.voteQrWrap, url);
    if (dom.voteQrFullscreen && !dom.voteQrFullscreen.hidden) renderFullscreenQr();
  }

  function renderFullscreenQr() {
    var url = voteUrlFor(state.room);
    if (dom.vqfRoom) dom.vqfRoom.textContent = '房间 ' + state.room;
    if (dom.vqfUrl) dom.vqfUrl.textContent = url;
    renderQrInto(dom.vqfQr, url);
  }

  function openQrFullscreen() {
    if (!dom.voteQrFullscreen) return;
    renderFullscreenQr();
    dom.voteQrFullscreen.hidden = false;
  }
  function closeQrFullscreen() {
    if (!dom.voteQrFullscreen) return;
    dom.voteQrFullscreen.hidden = true;
  }

  var PHASE_LABEL = {
    idle: '未开始',
    collecting: '投票中（初始立场）',
    paused: '已锁票（初始立场已锁定）',
    live: '投票中（直播）',
    closed: '已结束',
  };

  function updateRatioBar() {
    var bar = dom.voteRatioBar;
    if (!bar) return;
    var show = state.enabled && state.ratioBarOn && state.phase !== 'idle';
    if (!show) { bar.hidden = true; return; }
    var c = VC.counts(state.tally);
    var showDelta = !!state.baseline;
    var proText = '正方 ' + c.pro + (showDelta ? ' (' + fmtDelta(c.pro - state.baseline.pro) + ')' : '');
    var conText = '反方 ' + c.con + (showDelta ? ' (' + fmtDelta(c.con - state.baseline.con) + ')' : '');
    if (dom.vrbPro) dom.vrbPro.textContent = proText;
    if (dom.vrbCon) dom.vrbCon.textContent = conText;
    // 票数条里的占比条：0 票时各占一半，避免看起来像"没有数据"
    var proPct = c.total > 0 ? (c.pro / c.total * 100) : 50;
    var conPct = c.total > 0 ? (c.con / c.total * 100) : 50;
    if (dom.vrbFillPro) dom.vrbFillPro.style.width = proPct + '%';
    if (dom.vrbFillCon) dom.vrbFillCon.style.width = conPct + '%';
    bar.hidden = false;
  }

  function updateCountsUI() {
    var c = VC.counts(state.tally);
    if (dom.voteCounts) dom.voteCounts.textContent = '正方 ' + c.pro + ' · 反方 ' + c.con + '（共 ' + c.total + ' 人）';
    updateRatioBar();
  }

  function notifyUpdate() {
    try { window.dispatchEvent(new CustomEvent('vote:update')); } catch (e) {}
  }

  function getSnapshot() {
    var c = VC.counts(state.tally);
    return {
      counts: { pro: c.pro, con: c.con },
      baseline: state.baseline ? { pro: state.baseline.pro, con: state.baseline.con } : null,
      phase: state.phase,
    };
  }

  function setEnabled(on) {
    state.enabled = !!on;
    if (dom.btnVote) dom.btnVote.hidden = !state.enabled;
    if (dom.votePanel) dom.votePanel.hidden = !state.enabled;
    if (!state.enabled) {
      closeVotePanel();
      if (dom.voteRatioBar) dom.voteRatioBar.hidden = true;
      return;
    }
    updateRatioBar();
  }

  function setHidden(el, hidden) { if (el) el.hidden = !!hidden; }

  function updatePhaseUI() {
    if (dom.votePhase) dom.votePhase.textContent = PHASE_LABEL[state.phase] || state.phase;
    setHidden(dom.voteStartBtn, state.phase !== 'idle');
    setHidden(dom.voteLockBaseline, state.phase !== 'collecting');
    setHidden(dom.voteEndBtn, state.phase !== 'collecting' && state.phase !== 'live' && state.phase !== 'paused');
    setHidden(dom.voteReopenBtn, state.phase !== 'paused');
    setHidden(dom.voteResultSection, state.phase !== 'closed' || !state.result);
    if (state.phase === 'closed' && state.result) renderResult(state.result);
  }

  function renderResult(result) {
    if (!dom.voteResultBox) return;
    function cell(label, base, final, delta) {
      return '<div class="vote-result-cell">' +
        '<div class="vrc-label">' + label + '</div>' +
        '<div class="vrc-value">' + final + '</div>' +
        '<div class="vrc-delta">初始 ' + base + ' · ' + fmtDelta(delta) + '</div>' +
      '</div>';
    }
    dom.voteResultBox.innerHTML =
      cell('正方', result.baseline.pro, result.final.pro, result.delta.pro) +
      cell('反方', result.baseline.con, result.final.con, result.delta.con) +
      '<div class="vote-result-total">共 ' + result.total + ' 人投票</div>';
  }

  function renderHistory() {
    var list = dom.voteHistoryList;
    if (!list) return;
    if (!state.history.length) {
      list.innerHTML = '<div class="preset-empty">还没有历史记录</div>';
      return;
    }
    var html = '';
    for (var i = state.history.length - 1; i >= 0; i--) {
      var r = state.history[i];
      var time = '';
      try { time = new Date(r.timestamp).toLocaleString(); } catch (e) {}
      html += '<div class="preset-item">' +
        '<div class="preset-info">' +
          '<div class="preset-title">' + escapeHtml(r.room) + ' <span class="preset-tag">' + r.total + ' 票</span></div>' +
          '<div class="preset-meta">' + escapeHtml(time) + ' · 正 ' + r.final.pro + ' / 反 ' + r.final.con + '</div>' +
        '</div>' +
        '<div class="preset-actions">' +
          '<button class="preset-chip" type="button" data-hist-json="' + i + '">JSON</button>' +
          '<button class="preset-chip" type="button" data-hist-csv="' + i + '">CSV</button>' +
          '<button class="preset-chip preset-chip-danger" type="button" data-hist-del="' + i + '">删除</button>' +
        '</div>' +
      '</div>';
    }
    list.innerHTML = html;
  }

  function renderConfigState() {
    var ok = hasConfig();
    setHidden(dom.voteConfigWarning, ok);
    setHidden(dom.voteMainSection, !ok);
  }

  function getPhase() { return state.phase; }

  function render() {
    renderConfigState();
    renderRoomInfo();
    updatePhaseUI();
    updateCountsUI();
    if (dom.voteSwRatioBar) dom.voteSwRatioBar.classList.toggle('on', state.ratioBarOn);
    renderHistory();
    notifyUpdate();
  }

  /* ---------------- Export ---------------- */
  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function resultForExport() {
    return state.result || VC.buildResult(state.room, state.baseline, state.tally);
  }

  /* ---------------- Supabase channel ----------------
   * 两条频道分流，避免票数一多就把 Realtime 的消息配额用爆：
   * - room-<code>      只用来收观众的投票广播，主持端订阅它；观众发票不订阅这条
   *   （见 vote.html，走 REST 广播），所以一条投票只产生"发到主持端"这一次投递，
   *   不会再广播给同房间的其他观众。
   * - room-<code>-ctl  主持端在这条频道广播 open/closed/sync，观众只订阅这条来
   *   接收主持端的状态；这条才是观众真正保持的 Realtime 订阅。
   */
  var client = null;
  var channel = null; // room-<code>，收票
  var ctlChannel = null; // room-<code>-ctl，发 open/closed/sync
  var backoff = 1000;
  var reconnectTimer = null;
  var destroyed = false;

  function ensureClient() {
    if (client || !hasConfig()) return client;
    var cfg = window.DEBATE_VOTE_CONFIG;
    try {
      client = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    } catch (e) {
      console.error('vote-host.js: 初始化 Supabase 客户端失败', e);
      client = null;
    }
    return client;
  }

  function openOrClosedType() {
    return (state.phase === 'idle' || state.phase === 'closed' || state.phase === 'paused') ? 'closed' : 'open';
  }

  // 计时器当前主题（app.js 设在 <body data-theme>），投票页要跟着同步显示。
  function currentTheme() {
    var t = document.body && document.body.dataset ? document.body.dataset.theme : '';
    return t || 'neo';
  }

  function broadcastMsg(payload) {
    if (!ctlChannel) return;
    try { ctlChannel.send({ type: 'broadcast', event: 'msg', payload: payload }); } catch (e) {}
  }
  function broadcastPhase() { broadcastMsg({ type: openOrClosedType(), theme: currentTheme() }); }
  function broadcastSync() { broadcastMsg({ type: 'sync', theme: currentTheme() }); }
  function broadcastTheme() { broadcastMsg({ type: 'theme', theme: currentTheme() }); }

  // 主题切换时（设置抽屉里选新主题）同步广播给已连接的观众。
  var themeObserver = null;
  function watchTheme() {
    if (themeObserver || typeof MutationObserver === 'undefined' || !document.body) return;
    themeObserver = new MutationObserver(broadcastTheme);
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
  }

  function handleIncoming(payload) {
    if (!payload || payload.type !== 'vote') return;
    if (openOrClosedType() === 'closed') return; // 锁票 / 结束后到达的票一律不计
    if (VC.applyVote(state.tally, payload)) {
      persistSession();
      updateCountsUI();
      notifyUpdate();
    }
  }

  // 观众刚连上控制频道时会主动要一次 sync（见 vote.html 的 hello），
  // 这样晚进来的观众也能拿到当前的开/关状态和主题，不用等下一次主持端操作。
  function handleCtlIncoming(payload) {
    if (!payload || payload.type !== 'hello') return;
    broadcastPhase();
    broadcastSync();
  }

  function scheduleReconnect() {
    if (reconnectTimer || destroyed) return;
    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      backoff = Math.min(backoff * 2, BACKOFF_MAX);
      connect();
    }, backoff);
  }

  function connect() {
    if (destroyed || !ensureClient()) return;
    if (channel) { try { client.removeChannel(channel); } catch (e) {} channel = null; }
    if (ctlChannel) { try { client.removeChannel(ctlChannel); } catch (e) {} ctlChannel = null; }

    var ch = client.channel('room-' + state.room);
    ch.on('broadcast', { event: 'msg' }, function (msg) { handleIncoming(msg && msg.payload); });
    ch.subscribe(function (status) {
      if (destroyed) return;
      if (status === 'SUBSCRIBED') {
        channel = ch;
        backoff = 1000;
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (channel === ch) channel = null;
        scheduleReconnect();
      }
    });

    var ctl = client.channel('room-' + state.room + '-ctl');
    ctl.on('broadcast', { event: 'msg' }, function (msg) { handleCtlIncoming(msg && msg.payload); });
    ctl.subscribe(function (status) {
      if (destroyed) return;
      if (status === 'SUBSCRIBED') {
        ctlChannel = ctl;
        backoff = 1000;
        // 主持端刚连上（或刷新恢复）：告诉观众当前开/关状态，并要求大家重发一次自己的票
        broadcastPhase();
        broadcastSync();
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        if (ctlChannel === ctl) ctlChannel = null;
        scheduleReconnect();
      }
    });
  }

  function reconnectToCurrentRoom() {
    backoff = 1000;
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    connect();
  }

  // 仅供 e2e 测试读取频道订阅状态，不影响正常运行
  window.__voteHostChannelsForTest = { get vote() { return channel; }, get ctl() { return ctlChannel; } };

  /* ---------------- Actions ---------------- */
  function doStart() {
    if (state.phase !== 'idle') return;
    state.phase = 'collecting';
    persistSession();
    broadcastPhase();
    render();
  }
  function doLockBaseline() {
    if (state.phase !== 'collecting') return;
    state.baseline = VC.snapshotBaseline(state.tally);
    state.phase = 'live';
    persistSession();
    render();
  }
  // 赛前票数页的「锁票」：冻结初始立场作为赛后增减的基准，同时关闭投票（手机显示已结束、按钮禁用、迟到的票不计）。
  function doLockPre() {
    if (state.phase !== 'collecting') return;
    state.baseline = VC.snapshotBaseline(state.tally);
    state.phase = 'paused';
    persistSession();
    broadcastPhase();
    render();
  }
  // 锁票后重新开放 = 进入赛后投票（直播），基准保持不变。
  function doReopen() {
    if (state.phase !== 'paused') return;
    state.phase = 'live';
    persistSession();
    broadcastPhase();
    broadcastSync();
    render();
  }
  function doEnd() {
    if (state.phase !== 'collecting' && state.phase !== 'live' && state.phase !== 'paused') return;
    state.result = VC.buildResult(state.room, state.baseline, state.tally);
    state.phase = 'closed';
    state.history.push(state.result);
    saveJSON(HISTORY_KEY, state.history);
    persistSession();
    broadcastPhase();
    render();
  }
  function doReset() {
    if (!confirm('重置当前房间的投票数据？已结束的结果仍会保留在历史记录里。')) return;
    state.tally = VC.createTally();
    state.baseline = null;
    state.result = null;
    state.phase = 'idle';
    persistSession();
    broadcastPhase();
    render();
  }
  function doNewRoom() {
    if (!confirm('新建房间会生成新的二维码，当前房间的投票会停止接收。继续？')) return;
    broadcastMsg({ type: 'closed' }); // best-effort：告诉旧房间已经结束
    state.room = genRoomCode();
    state.tally = VC.createTally();
    state.baseline = null;
    state.result = null;
    state.phase = 'idle';
    persistSession();
    render();
    reconnectToCurrentRoom();
  }

  function copyLink() {
    var url = dom.voteLinkInput ? dom.voteLinkInput.value : '';
    if (!url) return;
    var done = function () {};
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(done, function () { fallbackCopy(url); });
    } else {
      fallbackCopy(url);
    }
  }
  function fallbackCopy(text) {
    if (!dom.voteLinkInput) return;
    dom.voteLinkInput.focus();
    dom.voteLinkInput.select();
    try { document.execCommand('copy'); } catch (e) {}
  }

  function toggleRatioBar() {
    state.ratioBarOn = !state.ratioBarOn;
    persistSession();
    render();
  }

  function openVotePanel() {
    // 和设置抽屉互斥，避免两个面板叠在一起
    var settingsDrawer = document.getElementById('drawer');
    var settingsOverlay = document.getElementById('overlay');
    if (settingsDrawer) settingsDrawer.classList.remove('open');
    if (settingsOverlay) settingsOverlay.classList.remove('show');
    dom.votePanel.classList.add('open');
    dom.voteOverlay.classList.add('show');
    render();
  }
  function closeVotePanel() {
    if (!dom.votePanel) return;
    dom.votePanel.classList.remove('open');
    dom.voteOverlay.classList.remove('show');
  }

  function wireEvents() {
    if (dom.btnVote) dom.btnVote.addEventListener('click', function () {
      if (dom.votePanel.classList.contains('open')) closeVotePanel();
      else openVotePanel();
    });
    if (dom.voteClose) dom.voteClose.addEventListener('click', closeVotePanel);
    if (dom.voteOverlay) dom.voteOverlay.addEventListener('click', closeVotePanel);
    var btnSettings = document.getElementById('btnSettings');
    if (btnSettings) btnSettings.addEventListener('click', closeVotePanel);

    if (dom.voteQrFullscreenBtn) dom.voteQrFullscreenBtn.addEventListener('click', openQrFullscreen);
    if (dom.voteQrFullscreen) dom.voteQrFullscreen.addEventListener('click', closeQrFullscreen);

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      if (dom.voteQrFullscreen && !dom.voteQrFullscreen.hidden) { closeQrFullscreen(); return; }
      if (dom.votePanel && dom.votePanel.classList.contains('open')) closeVotePanel();
    });

    if (dom.voteStartBtn) dom.voteStartBtn.addEventListener('click', doStart);
    if (dom.voteLockBaseline) dom.voteLockBaseline.addEventListener('click', doLockBaseline);
    if (dom.voteReopenBtn) dom.voteReopenBtn.addEventListener('click', doReopen);
    if (dom.voteEndBtn) dom.voteEndBtn.addEventListener('click', doEnd);
    if (dom.voteResetBtn) dom.voteResetBtn.addEventListener('click', doReset);
    if (dom.voteNewRoom) dom.voteNewRoom.addEventListener('click', doNewRoom);
    if (dom.voteCopyLink) dom.voteCopyLink.addEventListener('click', copyLink);
    if (dom.voteSwRatioBar) dom.voteSwRatioBar.addEventListener('click', toggleRatioBar);

    if (dom.voteExportJson) dom.voteExportJson.addEventListener('click', function () {
      var r = resultForExport();
      download('vote-' + r.room + '-' + r.timestamp + '.json', VC.toJSON(r), 'application/json');
    });
    if (dom.voteExportCsv) dom.voteExportCsv.addEventListener('click', function () {
      var r = resultForExport();
      download('vote-' + r.room + '-' + r.timestamp + '.csv', VC.toCSV(r), 'text/csv');
    });

    if (dom.voteHistoryList) dom.voteHistoryList.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-hist-json], button[data-hist-csv], button[data-hist-del]');
      if (!btn) return;
      var idx;
      if (btn.hasAttribute('data-hist-json')) {
        idx = Number(btn.getAttribute('data-hist-json'));
        var r1 = state.history[idx];
        if (r1) download('vote-' + r1.room + '-' + r1.timestamp + '.json', VC.toJSON(r1), 'application/json');
      } else if (btn.hasAttribute('data-hist-csv')) {
        idx = Number(btn.getAttribute('data-hist-csv'));
        var r2 = state.history[idx];
        if (r2) download('vote-' + r2.room + '-' + r2.timestamp + '.csv', VC.toCSV(r2), 'text/csv');
      } else if (btn.hasAttribute('data-hist-del')) {
        idx = Number(btn.getAttribute('data-hist-del'));
        state.history.splice(idx, 1);
        saveJSON(HISTORY_KEY, state.history);
        renderHistory();
      }
    });
  }

  function init() {
    cacheDom();
    if (!dom.btnVote || !dom.votePanel) return; // 页面结构不对就安静退出，不影响主计时器
    wireEvents();
    setEnabled(state.enabled);
    render();
    watchTheme();
    if (hasConfig()) connect();
  }

  window.VoteHost = { setEnabled: setEnabled, getSnapshot: getSnapshot, getPhase: getPhase, lockPre: doLockPre, reopen: doReopen };

  init();
})();
