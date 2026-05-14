// js/chiettu.js — Chiết tự: Character decomposition module
(function () {
  'use strict';

  const CW = window.CW;

  // ===== STATE =====
  let ctData = [];       // full data array
  let ctFiltered = [];   // current search results (or ctData when no query)
  let ctQuery = '';
  let ctCurrentIdx = -1; // index in ctFiltered of currently shown detail
  let ctLoaded = false;
  let ctLoading = false;

  // ===== LOAD DATA =====
  async function loadChiettuData() {
    if (ctLoaded || ctLoading) return;
    ctLoading = true;
    const loadingEl = document.getElementById('ct-loading');
    const listEl    = document.getElementById('ct-list');
    if (loadingEl) loadingEl.classList.remove('hidden');
    if (listEl)    listEl.innerHTML = '';

    try {
      const resp = await fetch('data/chiettu.json');
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      ctData = await resp.json();
      ctLoaded = true;
      console.log('[Chiettu] Loaded', ctData.length, 'entries');
    } catch (e) {
      console.error('[Chiettu] Load failed:', e);
      if (loadingEl) loadingEl.innerHTML =
        '<div class="text-center py-12 text-red-500"><div class="text-4xl mb-2">❌</div><p>Lỗi tải dữ liệu: ' + e.message + '</p></div>';
      ctLoading = false;
      return;
    }
    if (loadingEl) loadingEl.classList.add('hidden');
    ctLoading = false;
    ctFiltered = ctData;
    renderCtList(ctFiltered);
  }

  // ===== SEARCH =====
  function stripTones(s) {
    const map = {
      'ā':'a','á':'a','ǎ':'a','à':'a','ē':'e','é':'e','ě':'e','è':'e',
      'ī':'i','í':'i','ǐ':'i','ì':'i','ō':'o','ó':'o','ǒ':'o','ò':'o',
      'ū':'u','ú':'u','ǔ':'u','ù':'u','ǖ':'ü','ǘ':'ü','ǚ':'ü','ǜ':'ü',
    };
    return s.toLowerCase().replace(/./g, ch => map[ch] || ch);
  }

  window.ctSearch = function () {
    const input = document.getElementById('ct-search-input');
    const q = (input ? input.value : '').trim();
    ctQuery = q;
    const clearBtn = document.getElementById('ct-clear-btn');
    if (clearBtn) clearBtn.classList.toggle('hidden', !q);

    if (!q) {
      ctFiltered = ctData;
      renderCtList(ctFiltered);
      return;
    }
    const qLow = q.toLowerCase();
    const qStrip = stripTones(q);
    ctFiltered = ctData.filter(item => {
      if (!item) return false;
      if (item.word && item.word.includes(q)) return true;
      if (item.pinyin && (item.pinyin.toLowerCase().includes(qLow) || stripTones(item.pinyin).includes(qStrip))) return true;
      if (item.vietnamese_meaning && item.vietnamese_meaning.toLowerCase().includes(qLow)) return true;
      if (item.breakdown) {
        for (const b of item.breakdown) {
          if (b.mnemonic && b.mnemonic.toLowerCase().includes(qLow)) return true;
          if (b.components) {
            for (const c of b.components) {
              if ((c.radical && c.radical.includes(q)) ||
                  (c.meaning && c.meaning.toLowerCase().includes(qLow))) return true;
            }
          }
        }
      }
      return false;
    });
    renderCtList(ctFiltered);
  };

  window.ctClearSearch = function () {
    const input = document.getElementById('ct-search-input');
    if (input) { input.value = ''; input.focus(); }
    ctQuery = '';
    const clearBtn = document.getElementById('ct-clear-btn');
    if (clearBtn) clearBtn.classList.add('hidden');
    ctFiltered = ctData;
    renderCtList(ctFiltered);
  };

  // ===== RENDER LIST =====
  function renderCtList(items) {
    const listEl  = document.getElementById('ct-list');
    const emptyEl = document.getElementById('ct-empty');
    const countEl = document.getElementById('ct-count');
    if (!listEl) return;

    if (countEl) countEl.textContent = items.length + ' từ';

    if (!items.length) {
      listEl.innerHTML = '';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }
    if (emptyEl) emptyEl.classList.add('hidden');

    listEl.innerHTML = items.map((item, idx) => {
      const vi   = item.vietnamese_meaning || '';
      const py   = item.pinyin || '';
      const word = item.word || '';
      const firstBd    = item.breakdown && item.breakdown[0];
      const mnemonic   = firstBd ? firstBd.mnemonic : '';
      const compCount  = firstBd && firstBd.components ? firstBd.components.length : 0;

      return `
      <div class="word-card cursor-pointer group" onclick="ctOpenDetail(${idx})">
        <div class="flex items-center gap-4">
          <div class="flex-shrink-0 w-14 h-14 bg-gradient-to-br from-red-50 to-amber-50 border-2 border-red-100 rounded-xl flex items-center justify-center group-hover:border-red-300 transition-colors">
            <span class="font-cn text-3xl font-bold text-hanzi">${word}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-primary font-medium text-sm">${py}</span>
              ${compCount > 0 ? `<span class="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">${compCount} bộ thủ</span>` : ''}
            </div>
            <div class="text-sm text-slate-700 font-medium truncate">${vi}</div>
            ${mnemonic ? `<div class="text-xs text-slate-400 truncate mt-0.5">${mnemonic}</div>` : ''}
          </div>
          <div class="quick-actions flex items-center gap-1 flex-shrink-0">
            <button onclick="event.stopPropagation();ctSpeak('${word}')"
              class="w-8 h-8 rounded-lg bg-blue-50 hover:bg-blue-100 flex items-center justify-center text-primary transition-colors" title="Phát âm">🔊</button>
            <button onclick="event.stopPropagation();addToBookmark('${word}')"
              class="w-8 h-8 rounded-lg bg-amber-50 hover:bg-amber-100 flex items-center justify-center text-amber-600 transition-colors" title="Bookmark">🔖</button>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ===== SPEAK =====
  window.ctSpeak = function (text) {
    if (CW && CW.speakText) CW.speakText(text);
  };

  // ===== HIGHLIGHT RADICALS IN MNEMONIC =====
  function highlightRadicals(mnemonic, components) {
    if (!mnemonic || !components || !components.length) return mnemonic || '';
    const radicals = [...new Set(components.map(c => c.radical).filter(Boolean))]
      .sort((a, b) => b.length - a.length);
    let result = mnemonic;
    radicals.forEach(r => {
      const escaped = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      result = result.replace(
        new RegExp(escaped, 'g'),
        `<strong class="ct-radical-hl">${r}</strong>`
      );
    });
    return result;
  }

  // ===== RENDER DETAIL PAGE =====
  function renderDetailPage(item) {
    if (!item) return;

    const wordEntry = CW.allWords ? CW.allWords.find(w => w.hanzi === item.word) : null;
    const hsk       = wordEntry ? wordEntry.hsk : null;
    const strokes   = wordEntry ? wordEntry.strokes : null;

    // — Hero —
    const hanziEl   = document.getElementById('ctd-hanzi');
    const pinyinEl  = document.getElementById('ctd-pinyin');
    const meaningEl = document.getElementById('ctd-meaning');
    const badgesEl  = document.getElementById('ctd-badges');
    const actionsEl = document.getElementById('ctd-actions');

    if (hanziEl)   hanziEl.textContent = item.word || '';
    if (pinyinEl)  pinyinEl.textContent = item.pinyin || '';
    if (meaningEl) meaningEl.textContent = item.vietnamese_meaning || '';

    if (badgesEl) {
      badgesEl.innerHTML =
        (hsk    ? `<span class="hsk-badge hsk-badge-${hsk}">HSK ${hsk}</span>` : '') +
        (strokes ? `<span class="text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded-lg">${strokes} nét</span>` : '');
    }

    if (actionsEl) {
      actionsEl.innerHTML = `
        <button onclick="ctSpeak('${item.word}')"
          class="inline-flex items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors">
          🔊 Phát âm
        </button>
        <button onclick="showPage('stroke');document.getElementById('stroke-input').value='${item.word}';doStrokeLookup()"
          class="inline-flex items-center gap-2 border-2 border-primary text-primary px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-50 transition-colors">
          ✏️ Bút thuận
        </button>
        <button onclick="addToBookmark('${item.word}')"
          class="inline-flex items-center gap-2 border-2 border-amber-400 text-amber-700 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-50 transition-colors">
          🔖 Bookmark
        </button>
        ${wordEntry ? `<button onclick="openDetailByHanzi('${item.word}')"
          class="inline-flex items-center gap-2 border-2 border-slate-200 text-slate-600 px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 transition-colors">
          📖 Từ điển
        </button>` : ''}`;
    }

    // — Breakdown (left column) —
    const bdContent = document.getElementById('ctd-breakdown-content');
    if (bdContent) {
      const firstBd = item.breakdown && item.breakdown[0];
      const comps   = firstBd && firstBd.components ? firstBd.components : [];

      bdContent.innerHTML = `
        <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
          <span class="text-base">🧩</span> Phân tích thành phần
        </div>
        ${comps.length ? comps.map(c => `
          <div class="flex items-center gap-4 p-4 bg-slate-50 hover:bg-amber-50 rounded-2xl border-2 border-transparent hover:border-amber-200 transition-all mb-3">
            <div class="w-20 h-20 bg-white border-2 border-amber-200 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm">
              <span class="font-cn text-5xl font-bold" style="color:#b45309">${c.radical || ''}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Bộ thủ / Nét</div>
              <div class="text-base font-semibold text-slate-800">${c.meaning || ''}</div>
            </div>
          </div>`).join('') : '<p class="text-sm text-slate-400">Chưa có dữ liệu phân tích.</p>'}
      `;
    }

    // — Mnemonic (right column top) —
    const firstBd       = item.breakdown && item.breakdown[0];
    const mnemonic      = firstBd ? firstBd.mnemonic : '';
    const comps         = firstBd && firstBd.components ? firstBd.components : [];
    const mnemonicBox   = document.getElementById('ctd-mnemonic-box');
    const mnemonicText  = document.getElementById('ctd-mnemonic-text');

    if (mnemonicBox && mnemonicText) {
      if (mnemonic) {
        mnemonicText.innerHTML = highlightRadicals(mnemonic, comps);
        mnemonicBox.classList.remove('hidden');
      } else {
        mnemonicBox.classList.add('hidden');
      }
    }

    // — Compounds (right column bottom) —
    const compoundsBox  = document.getElementById('ctd-compounds-box');
    const compoundsList = document.getElementById('ctd-compounds-list');

    if (compoundsBox && compoundsList) {
      const compounds = item.compounds || [];
      if (compounds.length) {
        compoundsList.innerHTML = compounds.map(c => `
          <div class="bg-slate-50 hover:bg-blue-50 border-2 border-transparent hover:border-primary rounded-2xl p-3 text-center cursor-pointer transition-all" onclick="ctSpeak('${c.word}')">
            <div class="font-cn text-2xl font-bold text-hanzi mb-1">${c.word}</div>
            <div class="text-xs text-primary font-medium">${c.pinyin || ''}</div>
            <div class="text-xs text-slate-500 mt-0.5">${c.meaning || ''}</div>
          </div>`).join('');
        compoundsBox.classList.remove('hidden');
      } else {
        compoundsBox.classList.add('hidden');
      }
    }

    // — Prev / Next navigation —
    const posEl   = document.getElementById('ctd-position');
    const prevBtn = document.getElementById('ctd-prev-btn');
    const nextBtn = document.getElementById('ctd-next-btn');
    const total   = ctFiltered.length;

    if (posEl)   posEl.textContent = `${ctCurrentIdx + 1} / ${total}`;
    if (prevBtn) prevBtn.disabled = ctCurrentIdx <= 0;
    if (nextBtn) nextBtn.disabled = ctCurrentIdx >= total - 1;
  }

  // ===== OPEN DETAIL (navigate to page) =====
  window.ctOpenDetail = function (idx) {
    const item = ctFiltered[idx];
    if (!item) return;
    ctCurrentIdx = idx;
    renderDetailPage(item);
    showPage('chiettu-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ===== PREV / NEXT =====
  window.ctNavDetail = function (dir) {
    const next = ctCurrentIdx + dir;
    if (next < 0 || next >= ctFiltered.length) return;
    ctCurrentIdx = next;
    renderDetailPage(ctFiltered[next]);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ===== OPEN CHIETTU FROM EXTERNAL PAGE =====
  // Called from library.js / stroke.js — loads data if needed then opens detail
  window.openChiettuByHanzi = async function (hanzi) {
    // Load data if not yet loaded
    if (!ctLoaded) await loadChiettuData();
    // Search for entry: try exact single-char match, then first char of hanzi
    const chars = [...hanzi];
    let item = null;
    for (const ch of chars) {
      item = ctData.find(x => x.word === ch);
      if (item) break;
    }
    if (!item) {
      if (CW.showToast) CW.showToast('Chưa có dữ liệu chiết tự cho "' + hanzi + '"', 'info');
      showPage('chiettu');
      return;
    }
    ctFiltered = ctData;
    ctCurrentIdx = ctData.indexOf(item);
    renderDetailPage(item);
    showPage('chiettu-detail');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ===== PAGE HOOKS =====
  CW.registerPageHook('chiettu', function () {
    loadChiettuData();
    setTimeout(() => {
      const inp = document.getElementById('ct-search-input');
      if (inp) inp.focus();
    }, 300);
  });

})();
