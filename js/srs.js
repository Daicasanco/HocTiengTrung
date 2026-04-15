// js/srs.js — Spaced Repetition System + Dashboard
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$;
  const allWords = CW.allWords;

  const SRS_KEY = 'cw_srs';
  const SRS_HISTORY_KEY = 'cw_srs_history';
  const SRS_STREAK_KEY = 'cw_srs_streak';

  function loadSrs() { try { return JSON.parse(localStorage.getItem(SRS_KEY)) || {}; } catch (e) { return {}; } }
  function saveSrs(data) { localStorage.setItem(SRS_KEY, JSON.stringify(data)); }

  function todayStr() {
    const t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }

  CW.getSrsData = function (hanzi) { const d = loadSrs(); return d[hanzi] || null; };
  window.getSrsData = CW.getSrsData;

  CW.updateSrs = function (hanzi, correct) {
    const d = loadSrs();
    if (!d[hanzi]) d[hanzi] = { level: 0, interval: 1, easeFactor: 2.5, correct: 0, wrong: 0, nextReview: todayStr(), lastReview: todayStr() };
    const card = d[hanzi];
    card.lastReview = todayStr();
    if (correct) {
      card.correct++;
      if (card.level < 5) card.level++;
      const intervals = [1, 3, 7, 14, 30, 60];
      card.interval = intervals[Math.min(card.level, 5)];
      card.easeFactor = Math.max(1.3, card.easeFactor + 0.1);
    } else {
      card.wrong++; card.level = 0; card.interval = 1;
      card.easeFactor = Math.max(1.3, card.easeFactor - 0.2);
    }
    const next = new Date();
    next.setDate(next.getDate() + card.interval);
    card.nextReview = next.getFullYear() + '-' + String(next.getMonth() + 1).padStart(2, '0') + '-' + String(next.getDate()).padStart(2, '0');
    d[hanzi] = card;
    saveSrs(d);
    return card;
  };
  window.updateSrs = CW.updateSrs;

  function getDueWords() {
    const d = loadSrs();
    const today = todayStr();
    const due = [];
    for (const [hanzi, card] of Object.entries(d)) {
      if (card.nextReview <= today) { const w = allWords.find(x => x.hanzi === hanzi); if (w) due.push(w); }
    }
    return due;
  }

  window.getSrsDueCount = function () { return getDueWords().length; };
  window.getSrsDueWords = function () { return getDueWords(); };

  CW.srsLoadHistory = function () { try { return JSON.parse(localStorage.getItem(SRS_HISTORY_KEY)) || []; } catch (e) { return []; } };
  CW.srsSaveHistory = function (h) { localStorage.setItem(SRS_HISTORY_KEY, JSON.stringify(h)); };

  function srsLoadStreak() { try { return JSON.parse(localStorage.getItem(SRS_STREAK_KEY)) || { count: 0, lastDate: '' }; } catch (e) { return { count: 0, lastDate: '' }; } }
  function srsSaveStreak(s) { localStorage.setItem(SRS_STREAK_KEY, JSON.stringify(s)); }

  CW.srsUpdateStreak = function () {
    const s = srsLoadStreak();
    const today = todayStr();
    if (s.lastDate === today) return s;
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth() + 1).padStart(2, '0') + '-' + String(yesterday.getDate()).padStart(2, '0');
    if (s.lastDate === yStr) s.count++; else if (s.lastDate !== today) s.count = 1;
    s.lastDate = today;
    srsSaveStreak(s);
    return s;
  };

  function srsLoadDashboard() {
    const d = loadSrs();
    const entries = Object.entries(d);
    const total = entries.length;
    const due = getDueWords();
    const dueCount = due.length;
    const mastered = entries.filter(([, c]) => c.level >= 5).length;
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

    const lvLabels = ['Mới', 'Đang học', 'Ôn tập', 'Quen thuộc', 'Nhớ lâu', 'Thành thạo'];
    const lvColors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-blue-400', 'bg-purple-400'];
    const lvEmoji = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];
    const lvCounts = [0, 0, 0, 0, 0, 0];
    for (const [, card] of entries) lvCounts[Math.min(card.level || 0, 5)]++;
    const barsEl = document.getElementById('srs-level-bars');
    if (barsEl) {
      if (total === 0) barsEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Chưa có dữ liệu. Ôn tập Flashcard/Quiz để bắt đầu.</p>';
      else {
        barsEl.innerHTML = lvCounts.map((cnt, i) => {
          const pct = total > 0 ? Math.round((cnt / total) * 100) : 0;
          return `<div class="flex items-center gap-3">
            <span class="text-sm w-24 flex-shrink-0">${lvEmoji[i]} ${lvLabels[i]}</span>
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

    const dueListEl = document.getElementById('srs-due-list');
    if (dueListEl) {
      if (!due.length) dueListEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Không có từ nào cần ôn</p>';
      else {
        const shown = due.slice(0, 30);
        dueListEl.innerHTML = '<div class="flex flex-wrap gap-1.5">' + shown.map(w => {
          const srsCard = d[w.hanzi]; const lvIdx = srsCard ? Math.min(srsCard.level || 0, 5) : 0;
          const vi = (w.vietnamese || w.english || '').split(/[;；]/)[0].trim().substring(0, 15);
          return `<span class="inline-flex items-center gap-1 bg-white border rounded-lg px-2 py-1.5 text-sm cursor-pointer hover:border-primary hover:shadow transition-all" onclick="openDetailByHanzi('${w.hanzi.replace(/'/g, "\\\\'")}')">
            <span class="text-[10px]">${lvEmoji[lvIdx]}</span><span class="font-cn font-bold text-hanzi">${w.hanzi}</span><span class="text-xs text-slate-400">${vi}</span>
          </span>`;
        }).join('') + '</div>' + (due.length > 30 ? `<p class="text-xs text-slate-400 mt-2">+${due.length - 30} từ nữa</p>` : '');
      }
    }

    const histEl = document.getElementById('srs-history');
    const hist = CW.srsLoadHistory();
    if (histEl) {
      if (!hist.length) histEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Chưa có dữ liệu</p>';
      else {
        const recent = hist.slice(-10).reverse();
        histEl.innerHTML = '<div class="space-y-2">' + recent.map(h => {
          const dt = new Date(h.date);
          const dateStr = dt.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
          const timeStr = dt.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          return `<div class="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
            <span class="text-slate-500">${dateStr} ${timeStr}</span>
            <span>✅ ${h.correct || 0} · ❌ ${h.wrong || 0} · <span class="text-slate-400">${h.total || 0} từ</span></span>
          </div>`;
        }).join('') + '</div>';
      }
    }
  }

  window.srsStartReview = function () {
    const due = getDueWords();
    if (!due.length) { CW.showToast('Không có từ cần ôn!'); return; }
    CW.fcStartWithDeck(due, 'review');
  };

  window.srsReset = function () {
    if (!confirm('Xóa toàn bộ dữ liệu SRS? Hành động không thể hoàn tác.')) return;
    localStorage.removeItem(SRS_KEY);
    localStorage.removeItem(SRS_HISTORY_KEY);
    localStorage.removeItem(SRS_STREAK_KEY);
    CW.showToast('Đã xóa dữ liệu SRS');
    srsLoadDashboard();
  };

  CW.registerPageHook('srs', srsLoadDashboard);
})();
