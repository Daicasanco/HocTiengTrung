// js/library.js — Library page (search, filter, word list) + Detail page
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$, $$ = CW.$$;
  const allWords = CW.allWords;
  const characters = CW.characters;
  const radicals = CW.radicals;

  // ===== LIBRARY STATE =====
  let filtered = [];
  let rendered = 0;
  let selectedHsk = 0;
  let searchQuery = '';
  let searchTimeout = null;
  const BATCH = 40;

  // ===== CHIPS =====
  function buildChips() {
    const levels = [...new Set(allWords.map(w => w.hsk))].sort((a, b) => a - b);
    let html = '<button class="hsk-chip active" data-lv="0">Tất cả</button>';
    for (const lv of levels) {
      const count = allWords.filter(w => w.hsk === lv).length;
      html += `<button class="hsk-chip" data-lv="${lv}">HSK ${lv} <span class="text-xs opacity-60">(${count})</span></button>`;
    }
    $('#lib-chips').innerHTML = html;
  }

  window.filterHsk = function (lv) {
    selectedHsk = lv;
    $$('.hsk-chip').forEach(c => c.classList.toggle('active', parseInt(c.dataset.lv) === selectedHsk));
    applyFilters();
  };

  // ===== SEARCH & FILTER =====
  function applyFilters() {
    const q = searchQuery.trim().toLowerCase();
    const qStripped = CW.stripTones(q);
    filtered = allWords.filter(w => {
      if (selectedHsk > 0 && w.hsk !== selectedHsk) return false;
      if (q) {
        if (w.hanzi.includes(q)) return true;
        const py = w.pinyin.toLowerCase();
        if (py.includes(q) || CW.stripTones(py).includes(qStripped)) return true;
        if ((w.vietnamese || '').toLowerCase().includes(q)) return true;
        if ((w.english || '').toLowerCase().includes(q)) return true;
        return false;
      }
      return true;
    });
    rendered = 0;
    $('#lib-list').innerHTML = '';
    $('#lib-count').textContent = `${filtered.length.toLocaleString()} từ`;
    $('#lib-empty').classList.toggle('hidden', filtered.length > 0);
    $('#lib-more').classList.add('hidden');
    renderMore();
  }

  window.renderMore = function () {
    if (rendered >= filtered.length) return;
    const end = Math.min(rendered + BATCH, filtered.length);
    const frag = document.createDocumentFragment();
    for (let i = rendered; i < end; i++) {
      frag.appendChild(createWordRow(filtered[i]));
    }
    $('#lib-list').appendChild(frag);
    rendered = end;
    $('#lib-more').classList.toggle('hidden', rendered >= filtered.length);
  };

  function createWordRow(w) {
    const div = document.createElement('div');
    div.className = 'word-card flex items-center gap-3 cursor-pointer group';
    const def = w.vietnamese || w.english || '';
    const hskLv = Math.min(w.hsk || 1, 7);
    div.innerHTML = `
      <span class="font-cn text-2xl font-bold text-hanzi min-w-[56px] text-center leading-tight">${w.hanzi}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-sm text-primary font-medium">${w.pinyin}</span>
          <span class="hsk-badge hsk-badge-${hskLv}">HSK${w.hsk}</span>
        </div>
        <div class="text-xs text-slate-500 truncate mt-0.5">${def}</div>
      </div>
      <div class="quick-actions flex items-center gap-1 flex-shrink-0">
        <button class="speak-btn w-8 h-8 rounded-lg flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-colors" title="Phát âm">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5z" fill="currentColor"/></svg>
        </button>
        <button class="bm-btn w-8 h-8 rounded-lg flex items-center justify-center hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors" title="Lưu">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
        </button>
      </div>`;
    div.addEventListener('click', e => {
      if (e.target.closest('.speak-btn')) { e.stopPropagation(); CW.speakText(w.hanzi); return; }
      if (e.target.closest('.bm-btn')) { e.stopPropagation(); addToBookmark(w.hanzi); return; }
      CW.openDetail(w);
    });
    return div;
  }

  window.doSearch = function () {
    searchQuery = $('#lib-search').value;
    $('#lib-clear').classList.toggle('hidden', !searchQuery);
    applyFilters();
  };

  function setupLibraryEvents() {
    $('#lib-search').addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(doSearch, 200);
    });
    $('#lib-chips').addEventListener('click', e => {
      const chip = e.target.closest('.hsk-chip');
      if (!chip) return;
      filterHsk(parseInt(chip.dataset.lv));
    });
  }

  // ===== DETAIL PAGE =====
  CW.openDetail = async function (w) {
    CW.showPage('detail');
    await CW.ensureCharacters();
    const charData = [];
    for (const ch of w.hanzi) { if (characters[ch]) charData.push(characters[ch]); }

    let viHtml = '', enHtml = '';
    if (w.vietnamese) {
      const defs = [...new Set(w.vietnamese.split(/[;；]/).map(s => s.trim()).filter(Boolean))];
      viHtml = `<div class="bg-white rounded-xl border p-4 shadow-sm"><h3 class="text-sm font-bold text-primary mb-2 pb-2 border-b">🇻🇳 Nghĩa tiếng Việt</h3>${defs.map((d, i) => `<p class="text-sm py-0.5">${i + 1}. ${d}</p>`).join('')}</div>`;
    }
    if (w.english) {
      const defs = [...new Set(w.english.split(/[;；]/).map(s => s.trim()).filter(Boolean))];
      enHtml = `<div class="bg-white rounded-xl border p-4 shadow-sm"><h3 class="text-sm font-bold text-primary mb-2 pb-2 border-b">🇬🇧 English</h3>${defs.map((d, i) => `<p class="text-sm py-0.5">${i + 1}. ${d}</p>`).join('')}</div>`;
    }

    let decompHtml = '';
    for (const c of charData) {
      const partsH = CW.makeDecompClickable(c.decomp, c.radical);
      const radInfo = radicals[c.radical];
      const radClick = radInfo || characters[c.radical] ? `onclick="showRadicalModal('${(c.radical || '').replace(/'/g, "\\\\'")}')" class="cursor-pointer text-red-700 hover:underline"` : '';
      const radLabel = radInfo ? `${c.radical} ${radInfo.viet}` : (c.radical || '—');
      decompHtml += `<div class="flex items-center gap-3 mb-2"><span class="font-cn text-3xl font-bold text-hanzi">${c.char}</span><div class="text-sm"><span class="text-slate-400">Bộ thủ:</span> <strong ${radClick}>${radLabel}</strong> · <span class="text-slate-400">Nét:</span> <strong>${c.strokeCount}</strong></div></div>${c.decomp ? `<div class="flex flex-wrap gap-2 mb-2">${partsH}</div>` : ''}${c.def ? `<p class="text-sm text-slate-500">${c.def}</p>` : ''}`;
    }

    const hanziEsc = w.hanzi.replace(/'/g, "\\\\'");

    $('#detail-content').innerHTML = `
      <div class="bg-gradient-to-br from-blue-50 to-amber-50 rounded-xl p-6 mb-4 border">
        <div class="font-cn text-5xl font-bold text-hanzi mb-2">${w.hanzi}</div>
        <div class="text-lg text-primary font-medium">${w.pinyin}</div>
        <div class="text-sm text-slate-400 mt-1">HSK ${w.hsk}</div>
        <div class="flex gap-2 mt-3">
          <button onclick="speakWord('${hanziEsc}')" class="inline-flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-primary-dark transition-colors">
            <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5z" fill="currentColor"/></svg> Phát âm
          </button>
          <button onclick="addToBookmark('${hanziEsc}')" class="inline-flex items-center gap-2 border-2 border-amber-400 text-amber-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-50 transition-colors">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> Lưu vào hồ sơ
          </button>
        </div>
      </div>
      <div class="space-y-3">
        ${viHtml}${enHtml}
        ${decompHtml ? `<div class="bg-white rounded-xl border p-4 shadow-sm"><h3 class="text-sm font-bold text-primary mb-3 pb-2 border-b">🧩 Phân tách</h3>${decompHtml}</div>` : ''}
      </div>
      ${charData.length ? `<div class="mt-4"><button onclick="showStrokeForWord('${hanziEsc}')" class="w-full py-3 text-sm font-medium text-primary border-2 border-primary rounded-lg hover:bg-blue-50 transition-colors">✏️ Xem bút thuận</button></div>` : ''}`;
  };

  window.openDetailByHanzi = function (hanzi) {
    const w = allWords.find(x => x.hanzi === hanzi);
    if (w) CW.openDetail(w);
  };

  window.speakWord = function (text) { CW.speakText(text); };
  window.showStrokeForWord = function (text) {
    $('#stroke-input').value = text;
    CW.showPage('stroke');
    doStrokeLookup();
  };

  // ===== INIT =====
  CW.onDataLoaded(function () {
    buildChips();
    setupLibraryEvents();
  });

  CW.registerPageHook('library', function () {
    if (allWords.length && !rendered) applyFilters();
  });
})();
