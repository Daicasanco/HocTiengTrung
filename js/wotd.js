// js/wotd.js — Word of the Day + Related Words + Detail related words observer
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$;
  const allWords = CW.allWords;
  const characters = CW.characters;

  let wotdWord = null;
  let wotdRandom = false;

  function getWotdIndex(dateStr) {
    // Simple hash of date string to get a stable index
    let h = 0;
    for (let i = 0; i < dateStr.length; i++) h = ((h << 5) - h + dateStr.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  function initWotd() {
    if (!allWords.length) return;
    const sec = $('#wotd-section');
    if (!sec) return;

    if (!wotdRandom) {
      const today = new Date();
      const dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
      const idx = getWotdIndex(dateStr) % allWords.length;
      wotdWord = allWords[idx];
      const el = $('#wotd-date');
      if (el) el.textContent = today.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    }

    sec.classList.remove('hidden');
    const w = wotdWord;
    $('#wotd-hanzi').textContent = w.hanzi;
    $('#wotd-pinyin').textContent = w.pinyin;
    const viDef = (w.vietnamese || '').split(/[;；]/)[0].trim();
    $('#wotd-vi').textContent = viDef ? '🇻🇳 ' + viDef : '';
    const enDef = (w.english || '').split(/[;；]/)[0].trim();
    $('#wotd-en').textContent = enDef ? '🇬🇧 ' + enDef : '';

    // SRS info
    const srs = CW.getSrsData ? CW.getSrsData(w.hanzi) : null;
    const srsEl = $('#wotd-srs-info');
    if (srs && srsEl) {
      srsEl.classList.remove('hidden');
      const lvLabels = ['Mới', 'Đang học', 'Ôn tập', 'Quen thuộc', 'Nhớ lâu', 'Thành thạo'];
      srsEl.textContent = '📊 SRS: ' + (lvLabels[srs.level] || 'Mới') + ' · Ôn lại: ' + srs.nextReview;
    } else if (srsEl) {
      srsEl.classList.add('hidden');
    }

    // Mini stroke canvas
    const canvas = $('#wotd-canvas');
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 160, 160);
      // Draw grid
      ctx.strokeStyle = '#fde68a'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(80, 0); ctx.lineTo(80, 160); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 80); ctx.lineTo(160, 80); ctx.stroke();
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(160, 160); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(160, 0); ctx.lineTo(0, 160); ctx.stroke();
      ctx.setLineDash([]);
      // Draw first character
      const firstChar = w.hanzi[0];
      if (characters[firstChar] && characters[firstChar].strokes) {
        const strokes = characters[firstChar].strokes;
        ctx.save();
        // Transform from 1024x1024 to 160x160, flip Y
        ctx.translate(10, 150);
        ctx.scale(140 / 1024, -140 / 1024);
        strokes.forEach(s => {
          const p = new Path2D(s);
          ctx.fillStyle = '#1e293b';
          ctx.fill(p);
        });
        ctx.restore();
      } else {
        ctx.font = 'bold 100px "Noto Sans SC", sans-serif';
        ctx.fillStyle = '#dc2626';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(firstChar, 80, 85);
      }
    }

    // Related words
    const related = findRelatedWords(w.hanzi, 8);
    const relSec = $('#wotd-related');
    const relList = $('#wotd-related-list');
    if (related.length && relSec && relList) {
      relSec.classList.remove('hidden');
      relList.innerHTML = related.map(r =>
        `<span class="inline-flex items-center gap-1 bg-white border rounded-lg px-2 py-1 text-sm cursor-pointer hover:border-primary hover:shadow transition-all" onclick="openDetailByHanzi('${r.hanzi.replace(/'/g, "\\'")}')">
          <span class="font-cn font-bold text-hanzi">${r.hanzi}</span>
          <span class="text-xs text-slate-400">${(r.vietnamese || r.english || '').split(/[;；]/)[0].trim().substring(0, 15)}</span>
        </span>`
      ).join('');
    } else if (relSec) {
      relSec.classList.add('hidden');
    }
  }

  window.wotdSpeak = function () { if (wotdWord) CW.speakText(wotdWord.hanzi); };
  window.wotdStroke = function () { if (wotdWord) { showPage('stroke'); strokeQuick(wotdWord.hanzi); } };
  window.wotdBookmark = function () { if (wotdWord) CW.showBookmarkPicker(wotdWord.hanzi); };
  window.wotdNext = function () {
    if (!allWords.length) return;
    wotdRandom = true;
    wotdWord = allWords[Math.floor(Math.random() * allWords.length)];
    initWotd();
  };

  // ====================================================================
  // ===== FEATURE: RELATED WORDS (Từ liên quan) =====
  // ====================================================================
  function findRelatedWords(hanzi, limit) {
    if (!allWords.length) return [];
    limit = limit || 12;
    const chars = [...new Set(hanzi.split(''))];
    const results = [];
    const seen = new Set([hanzi]);

    // 1. Words sharing characters (highest priority)
    for (const w of allWords) {
      if (seen.has(w.hanzi)) continue;
      let matchCount = 0;
      for (const ch of chars) { if (w.hanzi.includes(ch)) matchCount++; }
      if (matchCount > 0) {
        results.push({ word: w, score: matchCount * 10 + (w.hanzi.length <= 2 ? 3 : 0) });
        seen.add(w.hanzi);
      }
    }

    // 2. Sort by score desc, then HSK asc
    results.sort((a, b) => b.score - a.score || a.word.hsk - b.word.hsk);
    return results.slice(0, limit).map(r => r.word);
  }

  // Expose for detail page
  window.getRelatedWordsHtml = function (hanzi) {
    const related = findRelatedWords(hanzi, 15);
    if (!related.length) return '';
    const chips = related.map(r => {
      const vi = (r.vietnamese || r.english || '').split(/[;；]/)[0].trim().substring(0, 20);
      return `<span class="inline-flex items-center gap-1 bg-white border rounded-lg px-2.5 py-1.5 text-sm cursor-pointer hover:border-primary hover:shadow-md transition-all" onclick="openDetailByHanzi('${r.hanzi.replace(/'/g, "\\'")}')">
        <span class="font-cn font-bold text-hanzi">${r.hanzi}</span>
        <span class="text-xs text-slate-400">${vi}</span>
        <span class="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-primary font-bold">HSK${r.hsk}</span>
      </span>`;
    }).join('');
    return `<div class="bg-white rounded-xl border p-4 shadow-sm mt-4">
      <h3 class="text-sm font-bold text-primary mb-3 pb-2 border-b">🔗 Từ liên quan</h3>
      <div class="flex flex-wrap gap-1.5">${chips}</div>
    </div>`;
  };

  // ====================================================================
  // ===== INJECT RELATED WORDS INTO DETAIL PAGE =====
  // ====================================================================
  // MutationObserver on detail-content to auto-inject related words
  const detailObserver = new MutationObserver(function () {
    const el = $('#detail-content');
    if (!el || !el.children.length) return;
    // Check if related section already exists
    if (el.querySelector('.related-words-section')) return;
    // Find the current word from detail content
    const hanziEl = el.querySelector('.font-cn.text-hanzi');
    if (!hanziEl) return;
    const hanzi = hanziEl.textContent.trim();
    const relHtml = window.getRelatedWordsHtml(hanzi);
    if (relHtml) {
      const div = document.createElement('div');
      div.className = 'related-words-section';
      div.innerHTML = relHtml;
      el.appendChild(div);
    }
  });
  // Start observing when DOM ready
  setTimeout(() => {
    const dc = $('#detail-content');
    if (dc) detailObserver.observe(dc, { childList: true });
  }, 100);

  // Register page hook: init WOTD when home page is shown
  CW.registerPageHook('home', initWotd);

  // Also run initWotd after data is loaded
  CW.onDataLoaded(function () {
    initWotd();
  });
})();
