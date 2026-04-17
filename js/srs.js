// js/srs.js — Anki-like SRS (SM-2) + Dashboard (heatmap, forecast, retention)
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$;
  const allWords = CW.allWords;

  // ===== Storage keys =====
  const SRS_KEY = 'cw_srs';
  const SRS_HISTORY_KEY = 'cw_srs_history';          // session-level (legacy, giữ lại)
  const SRS_REVIEWS_KEY = 'cw_srs_reviews';          // per-review log (NEW)
  const SRS_STREAK_KEY = 'cw_srs_streak';
  const SRS_SETTINGS_KEY = 'cw_srs_settings';
  const SRS_DAILY_KEY = 'cw_srs_daily';              // {date: {new: n, review: n}}
  const SRS_MIGRATED_FLAG = 'cw_srs_migrated_v2';

  // ===== Defaults =====
  const DEFAULT_SETTINGS = {
    newPerDay: 20,
    maxReviewPerDay: 200,
    learningStepsMin: [10, 1440], // 10 phút, 1 ngày
    relearnStepsMin: [10],
    graduatingInterval: 1,        // ngày khi tốt nghiệp learning
    easyInterval: 4,              // ngày khi Easy ngay từ new
    minEase: 1.3,
    startEase: 2.5,
    easyBonus: 1.3,
    hardFactor: 1.2,
    intervalModifier: 1.0,
    leechThreshold: 8,
  };

  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SRS_SETTINGS_KEY) || '{}');
      return Object.assign({}, DEFAULT_SETTINGS, s);
    } catch (e) { return Object.assign({}, DEFAULT_SETTINGS); }
  }
  function saveSettings(s) { localStorage.setItem(SRS_SETTINGS_KEY, JSON.stringify(s)); }

  // ===== Utils =====
  function loadSrs() { try { return JSON.parse(localStorage.getItem(SRS_KEY)) || {}; } catch (e) { return {}; } }
  function saveSrs(d) { localStorage.setItem(SRS_KEY, JSON.stringify(d)); }

  function pad2(n) { return String(n).padStart(2, '0'); }
  function dateStr(d) { d = d || new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function todayStr() { return dateStr(new Date()); }
  function nowISO() { return new Date().toISOString(); }
  function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }
  function addMinutes(date, n) { const d = new Date(date); d.setMinutes(d.getMinutes() + n); return d; }
  function diffDays(aStr, bStr) {
    const a = new Date(aStr + (aStr.length === 10 ? 'T00:00:00' : '')).getTime();
    const b = new Date(bStr + (bStr.length === 10 ? 'T00:00:00' : '')).getTime();
    return Math.round((a - b) / (1000 * 60 * 60 * 24));
  }

  // Convert a card's level (0-5) based on its state/reps for backward compatibility with existing UI bars.
  function computeLevel(card) {
    if (card.state === 'new' || !card.state) return 0;
    if (card.state === 'learning') return 1;
    if (card.state === 'relearning') return Math.max(1, Math.min(2, card.level || 1));
    // review
    const iv = card.interval || 1;
    if (iv < 7) return 2;
    if (iv < 21) return 3;
    if (iv < 60) return 4;
    return 5;
  }

  // ===== Migration v1 → v2 =====
  function migrateIfNeeded() {
    if (localStorage.getItem(SRS_MIGRATED_FLAG) === '1') return;
    const d = loadSrs();
    let changed = false;
    for (const [h, c] of Object.entries(d)) {
      if (c.state) continue;
      // Legacy card → map to v2
      const reps = c.correct || 0;
      c.state = reps > 0 ? 'review' : 'new';
      c.step = 0;
      c.reps = reps;
      c.lapses = c.wrong || 0;
      c.easeFactor = c.easeFactor || DEFAULT_SETTINGS.startEase;
      c.interval = c.interval || 1;
      c.history = [];
      if (c.state === 'new') c.nextReview = todayStr();
      changed = true;
    }
    if (changed) saveSrs(d);
    localStorage.setItem(SRS_MIGRATED_FLAG, '1');
  }
  migrateIfNeeded();

  // ===== Public API =====
  CW.getSrsData = function (hanzi) { const d = loadSrs(); return d[hanzi] || null; };
  window.getSrsData = CW.getSrsData;

  CW.srsGetSettings = loadSettings;
  CW.srsSaveSettings = saveSettings;

  // Predict interval (minutes) for a rating, without saving
  function predictInterval(card, rating, settings) {
    settings = settings || loadSettings();
    card = card || { state: 'new', step: 0, easeFactor: settings.startEase, interval: 1, reps: 0, lapses: 0 };
    const s = card.state || 'new';

    if (s === 'new' || s === 'learning') {
      const steps = settings.learningStepsMin;
      if (rating === 1) return { minutes: steps[0], state: 'learning', step: 0 };
      if (rating === 2) return { minutes: steps[card.step] || steps[0], state: 'learning', step: card.step };
      if (rating === 3) {
        const nextStep = (card.step || 0) + 1;
        if (nextStep >= steps.length) return { minutes: settings.graduatingInterval * 1440, state: 'review', step: 0 };
        return { minutes: steps[nextStep], state: 'learning', step: nextStep };
      }
      if (rating === 4) return { minutes: settings.easyInterval * 1440, state: 'review', step: 0 };
    }
    if (s === 'relearning') {
      const steps = settings.relearnStepsMin;
      if (rating === 1) return { minutes: steps[0], state: 'relearning', step: 0 };
      if (rating === 2) return { minutes: steps[card.step] || steps[0], state: 'relearning', step: card.step };
      if (rating === 3 || rating === 4) return { minutes: Math.max(1, card.interval || 1) * 1440, state: 'review', step: 0 };
    }
    // review
    const mod = settings.intervalModifier;
    let newIv;
    if (rating === 1) {
      newIv = settings.relearnStepsMin[0] / 1440;
      return { minutes: settings.relearnStepsMin[0], state: 'relearning', step: 0 };
    } else if (rating === 2) {
      newIv = Math.max(card.interval + 1, card.interval * settings.hardFactor * mod);
    } else if (rating === 3) {
      newIv = Math.max(card.interval + 1, card.interval * (card.easeFactor || settings.startEase) * mod);
    } else {
      newIv = Math.max(card.interval + 1, card.interval * (card.easeFactor || settings.startEase) * settings.easyBonus * mod);
    }
    newIv = Math.round(newIv);
    return { minutes: newIv * 1440, state: 'review', step: 0 };
  }

  function formatInterval(minutes) {
    if (minutes < 60) return Math.max(1, Math.round(minutes)) + 'm';
    if (minutes < 1440) return Math.round(minutes / 60) + 'h';
    const days = Math.round(minutes / 1440);
    if (days < 30) return days + 'd';
    if (days < 365) return Math.round(days / 30 * 10) / 10 + 'mo';
    return Math.round(days / 365 * 10) / 10 + 'y';
  }
  CW.srsPredictInterval = function (hanzi, rating) {
    const d = loadSrs();
    const card = d[hanzi] || null;
    const p = predictInterval(card, rating, loadSettings());
    return formatInterval(p.minutes);
  };
  CW.srsFormatInterval = formatInterval;

  // Core: update by rating 1..4
  CW.updateSrsRating = function (hanzi, rating) {
    const settings = loadSettings();
    const d = loadSrs();
    if (!d[hanzi]) {
      d[hanzi] = {
        state: 'new', step: 0, interval: 1,
        easeFactor: settings.startEase,
        reps: 0, lapses: 0, correct: 0, wrong: 0,
        nextReview: todayStr(), lastReview: todayStr(),
        level: 0, history: []
      };
    }
    const card = d[hanzi];
    const prevIv = card.interval;
    const prevState = card.state;
    const pred = predictInterval(card, rating, settings);

    // Update EF (review state only)
    if (prevState === 'review') {
      if (rating === 1) { card.easeFactor = Math.max(settings.minEase, (card.easeFactor || settings.startEase) - 0.2); card.lapses++; }
      else if (rating === 2) card.easeFactor = Math.max(settings.minEase, (card.easeFactor || settings.startEase) - 0.15);
      else if (rating === 4) card.easeFactor = (card.easeFactor || settings.startEase) + 0.15;
      // rating 3: EF unchanged
    }

    card.state = pred.state;
    card.step = pred.step;
    if (pred.state === 'review') {
      card.interval = Math.round(pred.minutes / 1440);
      const next = addDays(new Date(), card.interval);
      card.nextReview = dateStr(next);
    } else {
      // learning/relearning → store exact datetime
      const next = addMinutes(new Date(), pred.minutes);
      card.interval = Math.max(1, Math.round(pred.minutes / 1440));
      card.nextReview = next.toISOString();
    }

    // Counters
    if (rating === 1) card.wrong++;
    else { card.correct++; card.reps++; }

    card.lastReview = todayStr();
    card.level = computeLevel(card);

    // Per-card mini history (last 20)
    card.history = card.history || [];
    card.history.push({ t: nowISO(), r: rating, iv: card.interval });
    if (card.history.length > 20) card.history.splice(0, card.history.length - 20);

    d[hanzi] = card;
    saveSrs(d);

    // Global reviews log
    appendReview({ ts: nowISO(), hanzi, rating, prevIv, newIv: card.interval, state: card.state });

    // Daily counter
    bumpDaily(prevState === 'new' ? 'new' : 'review');

    return card;
  };

  // Legacy boolean API → map to rating
  CW.updateSrs = function (hanzi, correct) {
    return CW.updateSrsRating(hanzi, correct ? 3 : 1);
  };
  window.updateSrs = CW.updateSrs;
  window.updateSrsRating = CW.updateSrsRating;

  // ===== Reviews log =====
  function loadReviews() { try { return JSON.parse(localStorage.getItem(SRS_REVIEWS_KEY)) || []; } catch (e) { return []; } }
  function saveReviews(a) { localStorage.setItem(SRS_REVIEWS_KEY, JSON.stringify(a)); }
  function appendReview(r) {
    const a = loadReviews();
    a.push(r);
    if (a.length > 3000) a.splice(0, a.length - 3000);
    saveReviews(a);
  }
  CW.srsLoadReviews = loadReviews;

  // ===== Daily counters =====
  function loadDaily() { try { return JSON.parse(localStorage.getItem(SRS_DAILY_KEY)) || {}; } catch (e) { return {}; } }
  function saveDaily(d) { localStorage.setItem(SRS_DAILY_KEY, JSON.stringify(d)); }
  function bumpDaily(kind) {
    const d = loadDaily(); const k = todayStr();
    if (!d[k]) d[k] = { new: 0, review: 0 };
    d[k][kind] = (d[k][kind] || 0) + 1;
    saveDaily(d);
  }
  CW.srsGetDaily = loadDaily;

  // ===== Due selection =====
  function isDue(card) {
    if (!card.nextReview) return true;
    if (card.nextReview.length <= 10) return card.nextReview <= todayStr();
    return new Date(card.nextReview) <= new Date();
  }
  function getDueWords() {
    const d = loadSrs();
    const due = [];
    for (const [hanzi, card] of Object.entries(d)) {
      if (isDue(card)) { const w = allWords.find(x => x.hanzi === hanzi); if (w) due.push(w); }
    }
    return due;
  }
  window.getSrsDueCount = function () { return getDueWords().length; };
  window.getSrsDueWords = function () { return getDueWords(); };

  // ===== Legacy session history (giữ lại cho compatibility) =====
  CW.srsLoadHistory = function () { try { return JSON.parse(localStorage.getItem(SRS_HISTORY_KEY)) || []; } catch (e) { return []; } };
  CW.srsSaveHistory = function (h) { localStorage.setItem(SRS_HISTORY_KEY, JSON.stringify(h)); };

  // ===== Streak =====
  function srsLoadStreak() { try { return JSON.parse(localStorage.getItem(SRS_STREAK_KEY)) || { count: 0, lastDate: '' }; } catch (e) { return { count: 0, lastDate: '' }; } }
  function srsSaveStreak(s) { localStorage.setItem(SRS_STREAK_KEY, JSON.stringify(s)); }
  CW.srsUpdateStreak = function () {
    const s = srsLoadStreak();
    const today = todayStr();
    if (s.lastDate === today) return s;
    const yStr = dateStr(addDays(new Date(), -1));
    if (s.lastDate === yStr) s.count++; else s.count = 1;
    s.lastDate = today;
    srsSaveStreak(s);
    return s;
  };

  // ===== Retention (last 30 days) =====
  function computeRetention(days) {
    days = days || 30;
    const reviews = loadReviews();
    const cutoff = addDays(new Date(), -days).getTime();
    let good = 0, total = 0;
    for (const r of reviews) {
      const t = new Date(r.ts).getTime();
      if (t < cutoff) continue;
      total++;
      if (r.rating >= 3) good++;
    }
    return { good, total, pct: total ? Math.round(good / total * 100) : 0 };
  }

  // ===== Forecast (cards due in next N days) =====
  function computeForecast(days) {
    days = days || 30;
    const d = loadSrs();
    const buckets = new Array(days).fill(0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    for (const card of Object.values(d)) {
      if (!card.nextReview) continue;
      const nd = card.nextReview.length <= 10
        ? new Date(card.nextReview + 'T00:00:00')
        : new Date(card.nextReview);
      const diff = Math.floor((nd - today) / (1000 * 60 * 60 * 24));
      if (diff < 0) buckets[0]++;
      else if (diff < days) buckets[diff]++;
    }
    return buckets;
  }

  // ===== Heatmap (last 52 weeks) =====
  function computeHeatmap(weeks) {
    weeks = weeks || 26;
    const reviews = loadReviews();
    const map = {};
    for (const r of reviews) {
      const k = dateStr(new Date(r.ts));
      map[k] = (map[k] || 0) + 1;
    }
    // Also include legacy session data as floor
    const daily = loadDaily();
    for (const k in daily) {
      const total = (daily[k].new || 0) + (daily[k].review || 0);
      if (total > (map[k] || 0)) map[k] = total;
    }
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const start = addDays(today, -(weeks * 7 - 1));
    // align start to Monday (getDay 1) for clean columns — we'll go back to previous Monday
    const dow = (start.getDay() + 6) % 7; // 0=Mon
    const alignedStart = addDays(start, -dow);
    const cells = [];
    for (let i = 0; i < weeks * 7 + dow; i++) {
      const d = addDays(alignedStart, i);
      const k = dateStr(d);
      cells.push({ date: k, count: map[k] || 0, future: d > today });
    }
    return cells;
  }

  // ===== Dashboard render =====
  function srsLoadDashboard() {
    const d = loadSrs();
    const entries = Object.entries(d);
    const total = entries.length;
    const due = getDueWords();
    const dueCount = due.length;
    const mastered = entries.filter(([, c]) => computeLevel(c) >= 5).length;
    const streak = srsLoadStreak();

    const dueEl = document.getElementById('srs-due-count');
    const totalEl = document.getElementById('srs-total-count');
    const masteredEl = document.getElementById('srs-mastered-count');
    const streakEl = document.getElementById('srs-streak-days');
    if (dueEl) dueEl.textContent = dueCount;
    if (totalEl) totalEl.textContent = total;
    if (masteredEl) masteredEl.textContent = mastered;
    if (streakEl) streakEl.textContent = streak.count;

    const startArea = document.getElementById('srs-start-area');
    const noDue = document.getElementById('srs-no-due');
    const dueLabel = document.getElementById('srs-due-label');
    if (dueCount > 0) {
      if (startArea) startArea.classList.remove('hidden');
      if (noDue) noDue.classList.add('hidden');
      if (dueLabel) dueLabel.textContent = dueCount;
    } else {
      if (startArea) startArea.classList.add('hidden');
      if (noDue) noDue.classList.toggle('hidden', total === 0);
    }

    // Level bars
    const lvLabels = ['🆕 Mới', '📖 Đang học', '🔁 Ôn tập', '🙂 Quen thuộc', '😎 Nhớ lâu', '🏆 Thành thạo'];
    const lvColors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-blue-400', 'bg-purple-400'];
    const lvCounts = [0, 0, 0, 0, 0, 0];
    for (const [, card] of entries) lvCounts[Math.min(computeLevel(card), 5)]++;
    const barsEl = document.getElementById('srs-level-bars');
    if (barsEl) {
      if (total === 0) barsEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Chưa có dữ liệu. Ôn tập Flashcard/Quiz để bắt đầu.</p>';
      else {
        barsEl.innerHTML = lvCounts.map((cnt, i) => {
          const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
          return `<div class="flex items-center gap-3">
            <span class="text-sm w-28 flex-shrink-0">${lvLabels[i]}</span>
            <div class="flex-1 bg-slate-100 rounded-full h-5 overflow-hidden">
              <div class="${lvColors[i]} h-full rounded-full transition-all flex items-center justify-end pr-1" style="width:${Math.max(pct, 2)}%">
                ${pct >= 10 ? `<span class="text-white text-[10px] font-bold">${cnt}</span>` : ''}
              </div>
            </div>
            <span class="text-xs text-slate-400 w-12 text-right">${cnt} (${pct}%)</span>
          </div>`;
        }).join('');
      }
    }

    // Today stats
    const todayEl = document.getElementById('srs-today-stats');
    if (todayEl) {
      const daily = loadDaily()[todayStr()] || { new: 0, review: 0 };
      const retToday = (function () {
        const reviews = loadReviews();
        const k = todayStr();
        let good = 0, tot = 0;
        for (const r of reviews) { if (dateStr(new Date(r.ts)) === k) { tot++; if (r.rating >= 3) good++; } }
        return { good, tot, pct: tot ? Math.round(good / tot * 100) : 0 };
      })();
      const ret30 = computeRetention(30);
      todayEl.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-slate-50 rounded-lg p-3 text-center"><div class="text-xs text-slate-500">Hôm nay</div><div class="text-xl font-bold text-slate-700">${daily.new + daily.review}</div><div class="text-[10px] text-slate-400">${daily.new} mới · ${daily.review} ôn</div></div>
          <div class="bg-slate-50 rounded-lg p-3 text-center"><div class="text-xs text-slate-500">Độ nhớ hôm nay</div><div class="text-xl font-bold text-green-600">${retToday.pct}%</div><div class="text-[10px] text-slate-400">${retToday.good}/${retToday.tot}</div></div>
          <div class="bg-slate-50 rounded-lg p-3 text-center"><div class="text-xs text-slate-500">Độ nhớ 30d</div><div class="text-xl font-bold text-blue-600">${ret30.pct}%</div><div class="text-[10px] text-slate-400">${ret30.good}/${ret30.total}</div></div>
          <div class="bg-slate-50 rounded-lg p-3 text-center"><div class="text-xs text-slate-500">Tổng review</div><div class="text-xl font-bold text-purple-600">${loadReviews().length}</div><div class="text-[10px] text-slate-400">mọi thời điểm</div></div>
        </div>`;
    }

    // Forecast chart (30 days)
    const fcEl = document.getElementById('srs-forecast');
    if (fcEl) {
      const fc = computeForecast(30);
      const max = Math.max(1, ...fc);
      fcEl.innerHTML = '<div class="flex items-end gap-[2px] h-28">' + fc.map((v, i) => {
        const h = Math.round(v / max * 100);
        const date = addDays(new Date(), i);
        const label = (date.getMonth() + 1) + '/' + date.getDate();
        const color = i === 0 ? 'bg-red-400' : (v > 0 ? 'bg-blue-400' : 'bg-slate-100');
        return `<div class="flex-1 flex flex-col items-center justify-end group relative">
          <div class="w-full ${color} rounded-t transition-all hover:opacity-80" style="height:${Math.max(h, 2)}%" title="${label}: ${v} thẻ"></div>
          ${i % 5 === 0 ? `<div class="text-[9px] text-slate-400 mt-0.5">${label}</div>` : ''}
          ${v > 0 ? `<div class="absolute bottom-full mb-1 px-1.5 py-0.5 bg-slate-800 text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap">${label}: ${v}</div>` : ''}
        </div>`;
      }).join('') + '</div>';
    }

    // Heatmap (26 weeks)
    const hmEl = document.getElementById('srs-heatmap');
    if (hmEl) {
      const cells = computeHeatmap(26);
      const cols = Math.ceil(cells.length / 7);
      const grid = [];
      for (let c = 0; c < cols; c++) {
        const col = [];
        for (let r = 0; r < 7; r++) {
          const cell = cells[c * 7 + r];
          if (!cell) { col.push('<div class="w-[10px] h-[10px]"></div>'); continue; }
          let cls = 'bg-slate-100';
          if (cell.future) cls = 'bg-slate-50';
          else if (cell.count >= 30) cls = 'bg-green-600';
          else if (cell.count >= 15) cls = 'bg-green-500';
          else if (cell.count >= 5) cls = 'bg-green-400';
          else if (cell.count > 0) cls = 'bg-green-200';
          col.push(`<div class="w-[10px] h-[10px] rounded-sm ${cls}" title="${cell.date}: ${cell.count} lượt"></div>`);
        }
        grid.push('<div class="flex flex-col gap-[2px]">' + col.join('') + '</div>');
      }
      hmEl.innerHTML = '<div class="flex gap-[2px] overflow-x-auto">' + grid.join('') + '</div>' +
        '<div class="flex items-center gap-2 mt-2 text-[10px] text-slate-400"><span>Ít</span>' +
        '<div class="w-[10px] h-[10px] rounded-sm bg-slate-100"></div>' +
        '<div class="w-[10px] h-[10px] rounded-sm bg-green-200"></div>' +
        '<div class="w-[10px] h-[10px] rounded-sm bg-green-400"></div>' +
        '<div class="w-[10px] h-[10px] rounded-sm bg-green-500"></div>' +
        '<div class="w-[10px] h-[10px] rounded-sm bg-green-600"></div><span>Nhiều</span></div>';
    }

    // Due list
    const lvEmoji = ['🆕', '📖', '🔁', '🙂', '😎', '🏆'];
    const dueListEl = document.getElementById('srs-due-list');
    if (dueListEl) {
      if (!due.length) dueListEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Không có từ nào cần ôn</p>';
      else {
        const shown = due.slice(0, 50);
        dueListEl.innerHTML = '<div class="flex flex-wrap gap-1.5">' + shown.map(w => {
          const c = d[w.hanzi]; const lvIdx = c ? Math.min(computeLevel(c), 5) : 0;
          const vi = (w.vietnamese || w.english || '').split(/[;；]/)[0].trim().substring(0, 15);
          return `<span class="inline-flex items-center gap-1 bg-white border rounded-lg px-2 py-1.5 text-sm cursor-pointer hover:border-primary hover:shadow transition-all" onclick="openDetailByHanzi('${w.hanzi.replace(/'/g, "\\\\'")}')">
            <span class="text-[10px]">${lvEmoji[lvIdx]}</span><span class="font-cn font-bold text-hanzi">${w.hanzi}</span><span class="text-xs text-slate-400">${vi}</span>
          </span>`;
        }).join('') + '</div>' + (due.length > 50 ? `<p class="text-xs text-slate-400 mt-2">+${due.length - 50} từ nữa</p>` : '');
      }
    }

    // History (recent reviews)
    const histEl = document.getElementById('srs-history');
    if (histEl) {
      const reviews = loadReviews().slice(-15).reverse();
      const rLabel = ['', '😵 Again', '😐 Hard', '🙂 Good', '😎 Easy'];
      const rColor = ['', 'text-red-500', 'text-orange-500', 'text-green-600', 'text-blue-600'];
      if (!reviews.length) histEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Chưa có dữ liệu</p>';
      else {
        histEl.innerHTML = '<div class="space-y-1.5">' + reviews.map(r => {
          const dt = new Date(r.ts);
          const dstr = dt.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
          const tstr = dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          return `<div class="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 last:border-0">
            <span class="text-slate-500">${dstr} ${tstr}</span>
            <span class="font-cn text-base text-hanzi font-bold">${r.hanzi}</span>
            <span class="${rColor[r.rating]} font-medium">${rLabel[r.rating]}</span>
            <span class="text-slate-400">→ ${r.newIv}d</span>
          </div>`;
        }).join('') + '</div>';
      }
    }

    // Settings panel
    const stEl = document.getElementById('srs-settings');
    if (stEl) {
      const s = loadSettings();
      stEl.innerHTML = `
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <label class="block"><span class="text-xs text-slate-500">Thẻ mới / ngày</span><input id="srs-st-new" type="number" min="0" max="500" value="${s.newPerDay}" class="mt-1 w-full px-2 py-1.5 border rounded-lg text-sm"></label>
          <label class="block"><span class="text-xs text-slate-500">Tối đa ôn / ngày</span><input id="srs-st-max" type="number" min="10" max="2000" value="${s.maxReviewPerDay}" class="mt-1 w-full px-2 py-1.5 border rounded-lg text-sm"></label>
          <label class="block"><span class="text-xs text-slate-500">Learning steps (phút)</span><input id="srs-st-lsteps" type="text" value="${s.learningStepsMin.join(' ')}" class="mt-1 w-full px-2 py-1.5 border rounded-lg text-sm"></label>
          <label class="block"><span class="text-xs text-slate-500">Interval modifier</span><input id="srs-st-mod" type="number" step="0.1" min="0.5" max="2" value="${s.intervalModifier}" class="mt-1 w-full px-2 py-1.5 border rounded-lg text-sm"></label>
        </div>
        <div class="flex gap-2 mt-3">
          <button onclick="srsSaveSettingsFromUI()" class="px-4 py-1.5 bg-primary text-white rounded-lg text-sm hover:bg-primary-dark">💾 Lưu</button>
          <button onclick="srsResetSettings()" class="px-4 py-1.5 border-2 rounded-lg text-sm hover:bg-slate-50">↺ Mặc định</button>
          <button onclick="srsExport()" class="px-4 py-1.5 border-2 rounded-lg text-sm hover:bg-slate-50">📤 Xuất JSON</button>
          <button onclick="srsImport()" class="px-4 py-1.5 border-2 rounded-lg text-sm hover:bg-slate-50">📥 Nhập JSON</button>
        </div>`;
    }
  }

  // ===== Settings UI handlers =====
  window.srsSaveSettingsFromUI = function () {
    const s = loadSettings();
    s.newPerDay = parseInt(document.getElementById('srs-st-new').value) || s.newPerDay;
    s.maxReviewPerDay = parseInt(document.getElementById('srs-st-max').value) || s.maxReviewPerDay;
    const lst = (document.getElementById('srs-st-lsteps').value || '').split(/\s+/).map(x => parseInt(x)).filter(x => x > 0);
    if (lst.length) s.learningStepsMin = lst;
    const mod = parseFloat(document.getElementById('srs-st-mod').value);
    if (mod > 0) s.intervalModifier = mod;
    saveSettings(s);
    CW.showToast('✅ Đã lưu cài đặt SRS');
    srsLoadDashboard();
  };
  window.srsResetSettings = function () {
    saveSettings(Object.assign({}, DEFAULT_SETTINGS));
    CW.showToast('↺ Đã khôi phục cài đặt mặc định');
    srsLoadDashboard();
  };

  // ===== Export / Import =====
  window.srsExport = function () {
    const data = {
      version: 2,
      exportedAt: nowISO(),
      srs: loadSrs(),
      reviews: loadReviews(),
      daily: loadDaily(),
      streak: srsLoadStreak(),
      settings: loadSettings(),
      history: CW.srsLoadHistory()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'ChineseWriter_SRS_' + todayStr() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    CW.showToast('📤 Đã xuất dữ liệu SRS');
  };
  window.srsImport = function () {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        const text = await f.text();
        const data = JSON.parse(text);
        if (!confirm('Ghi đè dữ liệu SRS hiện tại bằng file này?')) return;
        if (data.srs) saveSrs(data.srs);
        if (data.reviews) saveReviews(data.reviews);
        if (data.daily) saveDaily(data.daily);
        if (data.streak) localStorage.setItem(SRS_STREAK_KEY, JSON.stringify(data.streak));
        if (data.settings) saveSettings(data.settings);
        if (data.history) CW.srsSaveHistory(data.history);
        CW.showToast('📥 Đã nhập dữ liệu SRS');
        srsLoadDashboard();
      } catch (e) { CW.showToast('❌ File không hợp lệ'); }
    };
    inp.click();
  };

  // ===== Start review =====
  window.srsStartReview = function () {
    const due = getDueWords();
    if (!due.length) { CW.showToast('Không có từ cần ôn!'); return; }
    const settings = loadSettings();
    const limited = due.slice(0, settings.maxReviewPerDay);
    CW.fcStartWithDeck(limited, 'review', { srs: true });
    setTimeout(() => { if (CW.fcUpdateRatingPreview) CW.fcUpdateRatingPreview(); }, 100);
  };

  window.srsReset = function () {
    if (!confirm('Xóa toàn bộ dữ liệu SRS? Hành động không thể hoàn tác.')) return;
    [SRS_KEY, SRS_HISTORY_KEY, SRS_REVIEWS_KEY, SRS_STREAK_KEY, SRS_DAILY_KEY, SRS_MIGRATED_FLAG].forEach(k => localStorage.removeItem(k));
    CW.showToast('Đã xóa dữ liệu SRS');
    srsLoadDashboard();
  };

  CW.registerPageHook('srs', srsLoadDashboard);
})();
