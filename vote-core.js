/* vote-core.js — 纯函数计票逻辑，不依赖 DOM / 网络，浏览器和 Node 都能跑。
 * 浏览器：<script src="vote-core.js"> 之后用 window.VoteCore。
 * Node：const VoteCore = require('./vote-core.js')。
 */
(function () {
  'use strict';

  // 同一观众在这个时间窗内重复投同一边，视为重发/抖动，不计入变化。
  var DEDUPE_MS = 300;

  function createTally() {
    return { votes: new Map() };
  }

  function isValidSide(side) {
    return side === 'pro' || side === 'con';
  }

  /**
   * 把一条 {type:'vote', voter_id, side, ts} 消息计入 tally。
   * Map 按 voter_id 覆盖，天然支持“改票”。
   * 返回 true 表示真正改变了计票结果，false 表示被丢弃（陈旧 / 抖动重复）。
   */
  function applyVote(tally, msg) {
    if (!tally || !msg || msg.type !== 'vote') return false;
    if (typeof msg.voter_id !== 'string' || !msg.voter_id) return false;
    if (!isValidSide(msg.side)) return false;
    var ts = typeof msg.ts === 'number' && isFinite(msg.ts) ? msg.ts : Date.now();
    var prev = tally.votes.get(msg.voter_id);
    if (prev) {
      if (ts < prev.ts) return false; // 比已记录的还旧，丢弃
      if (prev.side === msg.side && ts - prev.ts < DEDUPE_MS) return false; // 短时间内的重复重发
    }
    tally.votes.set(msg.voter_id, { side: msg.side, ts: ts });
    return true;
  }

  function counts(tally) {
    var pro = 0, con = 0;
    if (tally && tally.votes) {
      tally.votes.forEach(function (v) {
        if (v.side === 'pro') pro++;
        else if (v.side === 'con') con++;
      });
    }
    return { pro: pro, con: con, total: pro + con };
  }

  function snapshotBaseline(tally) {
    var c = counts(tally);
    return { pro: c.pro, con: c.con };
  }

  function buildResult(room, baseline, tally) {
    var final = counts(tally);
    var base = baseline || { pro: 0, con: 0 };
    var basePro = base.pro || 0;
    var baseCon = base.con || 0;
    return {
      room: room || '',
      baseline: { pro: basePro, con: baseCon },
      final: { pro: final.pro, con: final.con },
      delta: { pro: final.pro - basePro, con: final.con - baseCon },
      total: final.total,
      timestamp: Date.now(),
    };
  }

  function csvField(v) {
    var s = String(v == null ? '' : v);
    if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(result) {
    var headers = ['room', 'baseline_pro', 'baseline_con', 'final_pro', 'final_con', 'delta_pro', 'delta_con', 'total', 'timestamp'];
    var row = [
      result.room,
      result.baseline.pro, result.baseline.con,
      result.final.pro, result.final.con,
      result.delta.pro, result.delta.con,
      result.total,
      new Date(result.timestamp).toISOString(),
    ];
    return headers.map(csvField).join(',') + '\r\n' + row.map(csvField).join(',') + '\r\n';
  }

  function toJSON(result) {
    return JSON.stringify(result, null, 2);
  }

  function serializeVotes(tally) {
    var arr = [];
    if (tally && tally.votes) {
      tally.votes.forEach(function (v, voterId) {
        arr.push([voterId, v.side, v.ts]);
      });
    }
    return arr;
  }

  function restoreVotes(arr) {
    var tally = createTally();
    if (Array.isArray(arr)) {
      arr.forEach(function (entry) {
        if (Array.isArray(entry) && entry.length >= 3 && isValidSide(entry[1])) {
          tally.votes.set(entry[0], { side: entry[1], ts: entry[2] });
        }
      });
    }
    return tally;
  }

  var VoteCore = {
    DEDUPE_MS: DEDUPE_MS,
    createTally: createTally,
    applyVote: applyVote,
    counts: counts,
    snapshotBaseline: snapshotBaseline,
    buildResult: buildResult,
    toCSV: toCSV,
    toJSON: toJSON,
    serializeVotes: serializeVotes,
    restoreVotes: restoreVotes,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = VoteCore;
  }
  if (typeof window !== 'undefined') {
    window.VoteCore = VoteCore;
  }
})();
