// ===== ChineseWriter Web App - Multi-page SPA =====
(function () {
  'use strict';

  // --- Data ---
  let allWords = [];
  let characters = {};
  let filtered = [];
  let selectedHsk = 0;
  let searchQuery = '';
  let rendered = 0;
  const BATCH = 60;
  let searchTimeout = null;
  let animId = null;
  let currentStrokeChars = [];
  let currentStrokeIdx = 0;

  // --- Helpers ---
  const $ = s => document.querySelector(s);
  const $$ = s => document.querySelectorAll(s);

  // Pinyin tone marks → base letter mapping for search
  const toneMap = {
    'ā':'a','á':'a','ǎ':'a','à':'a','ē':'e','é':'e','ě':'e','è':'e',
    'ī':'i','í':'i','ǐ':'i','ì':'i','ō':'o','ó':'o','ǒ':'o','ò':'o',
    'ū':'u','ú':'u','ǔ':'u','ù':'u','ǖ':'ü','ǘ':'ü','ǚ':'ü','ǜ':'ü',
    'ü':'v'
  };
  function stripTones(str) {
    return str.toLowerCase().replace(/./g, ch => toneMap[ch] || ch);
  }

  // ===== BOOKMARK SYSTEM (localStorage) =====
  const BM_KEY = 'cw_bookmarks';

  function loadBookmarks() {
    try {
      const raw = localStorage.getItem(BM_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveBookmarks(sets) {
    localStorage.setItem(BM_KEY, JSON.stringify(sets));
  }

  function getBookmarkSets() { return loadBookmarks(); }

  // Check if a hanzi is in any set
  function isBookmarked(hanzi) {
    return loadBookmarks().some(s => s.words.includes(hanzi));
  }

  // Check which sets contain this hanzi
  function getSetsForWord(hanzi) {
    return loadBookmarks().filter(s => s.words.includes(hanzi)).map(s => s.id);
  }

  window.createBookmarkSet = function (prefillName) {
    const name = prompt('Đặt tên cho bộ từ vựng mới:', prefillName || 'Bộ từ ' + (loadBookmarks().length + 1));
    if (!name || !name.trim()) return null;
    const sets = loadBookmarks();
    const newSet = { id: Date.now().toString(), name: name.trim(), words: [], created: new Date().toISOString() };
    sets.push(newSet);
    saveBookmarks(sets);
    renderBookmarksPage();
    return newSet.id;
  };

  window.renameBookmarkSet = function (id) {
    const sets = loadBookmarks();
    const s = sets.find(x => x.id === id);
    if (!s) return;
    const name = prompt('Đổi tên bộ:', s.name);
    if (!name || !name.trim()) return;
    s.name = name.trim();
    saveBookmarks(sets);
    renderBookmarksPage();
  };

  window.deleteBookmarkSet = function (id) {
    if (!confirm('Xóa bộ từ vựng này? Hành động không thể hoàn tác.')) return;
    const sets = loadBookmarks().filter(x => x.id !== id);
    saveBookmarks(sets);
    renderBookmarksPage();
  };

  window.removeWordFromSet = function (setId, hanzi) {
    const sets = loadBookmarks();
    const s = sets.find(x => x.id === setId);
    if (!s) return;
    s.words = s.words.filter(w => w !== hanzi);
    saveBookmarks(sets);
    renderBookmarksPage();
  };

  // Add word to a specific set, or show picker
  window.addToBookmark = function (hanzi) {
    const sets = loadBookmarks();
    if (!sets.length) {
      const id = createBookmarkSet('Từ vựng yêu thích');
      if (!id) return;
      const sets2 = loadBookmarks();
      const s = sets2.find(x => x.id === id);
      if (s && !s.words.includes(hanzi)) {
        s.words.push(hanzi);
        saveBookmarks(sets2);
      }
      showToast('Đã thêm ' + hanzi + ' vào "' + s.name + '"');
      return;
    }
    if (sets.length === 1) {
      // Only one set, add directly
      if (!sets[0].words.includes(hanzi)) {
        sets[0].words.push(hanzi);
        saveBookmarks(sets);
        showToast('Đã thêm ' + hanzi + ' vào "' + sets[0].name + '"');
      } else {
        showToast(hanzi + ' đã có trong "' + sets[0].name + '"');
      }
      return;
    }
    // Multiple sets - show picker
    showBookmarkPicker(hanzi);
  };

  function showBookmarkPicker(hanzi) {
    // Remove existing picker
    const old = document.getElementById('bm-picker-overlay');
    if (old) old.remove();

    const sets = loadBookmarks();
    let optionsHtml = sets.map(s => {
      const has = s.words.includes(hanzi);
      return `<button onclick="pickBookmarkSet('${s.id}','${hanzi.replace(/'/g, "\\'")}')" class="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center justify-between ${has ? 'bg-green-50' : ''}">
        <span class="text-sm font-medium">${has ? '✅' : '🔖'} ${s.name} <span class="text-xs text-slate-400">(${s.words.length} từ)</span></span>
        ${has ? '<span class="text-xs text-green-600">Đã có</span>' : '<span class="text-xs text-primary">+ Thêm</span>'}
      </button>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'bm-picker-overlay';
    overlay.className = 'fixed inset-0 bg-black/30 z-[100] flex items-center justify-center p-4';
    overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
      <div class="px-5 py-4 border-b bg-slate-50">
        <h3 class="font-bold text-lg">🔖 Thêm <span class="font-cn text-hanzi">${hanzi}</span> vào bộ</h3>
      </div>
      <div class="max-h-64 overflow-y-auto divide-y">${optionsHtml}</div>
      <div class="p-3 border-t">
        <button onclick="pickerCreateNew('${hanzi.replace(/'/g, "\\'")}')" class="w-full py-2 text-sm font-medium text-primary hover:bg-blue-50 rounded-lg transition-colors">+ Tạo bộ mới</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
  }

  window.pickBookmarkSet = function (setId, hanzi) {
    const sets = loadBookmarks();
    const s = sets.find(x => x.id === setId);
    if (!s) return;
    if (!s.words.includes(hanzi)) {
      s.words.push(hanzi);
      saveBookmarks(sets);
      showToast('Đã thêm ' + hanzi + ' vào "' + s.name + '"');
    } else {
      // Toggle remove
      s.words = s.words.filter(w => w !== hanzi);
      saveBookmarks(sets);
      showToast('Đã xóa ' + hanzi + ' khỏi "' + s.name + '"');
    }
    const overlay = document.getElementById('bm-picker-overlay');
    if (overlay) overlay.remove();
  };

  window.pickerCreateNew = function (hanzi) {
    const overlay = document.getElementById('bm-picker-overlay');
    if (overlay) overlay.remove();
    const id = createBookmarkSet();
    if (!id) return;
    const sets = loadBookmarks();
    const s = sets.find(x => x.id === id);
    if (s && !s.words.includes(hanzi)) {
      s.words.push(hanzi);
      saveBookmarks(sets);
      showToast('Đã thêm ' + hanzi + ' vào "' + s.name + '"');
    }
  };

  // Simple toast notification
  function showToast(msg) {
    const old = document.getElementById('cw-toast');
    if (old) old.remove();
    const t = document.createElement('div');
    t.id = 'cw-toast';
    t.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm font-medium shadow-lg z-[200] transition-opacity';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 2000);
  }

  // Render bookmarks page
  function renderBookmarksPage() {
    const sets = loadBookmarks();
    const listEl = $('#bm-sets-list');
    const emptyEl = $('#bm-empty');
    if (!listEl) return;

    if (!sets.length) {
      listEl.innerHTML = '';
      emptyEl.classList.remove('hidden');
      return;
    }
    emptyEl.classList.add('hidden');

    listEl.innerHTML = sets.map(s => {
      const wordsData = s.words.map(h => allWords.find(w => w.hanzi === h)).filter(Boolean);
      const wordChips = s.words.slice(0, 30).map(h => {
        const w = allWords.find(x => x.hanzi === h);
        const vi = w ? (w.vietnamese || '').split(/[;；]/)[0].trim() : '';
        return `<div class="inline-flex items-center gap-1 bg-white border rounded-lg px-2 py-1 text-sm group/chip">
          <span class="font-cn font-bold text-hanzi cursor-pointer hover:underline" onclick="openDetailByHanzi('${h}')">${h}</span>
          ${vi ? `<span class="text-xs text-slate-400 max-w-[100px] truncate">${vi}</span>` : ''}
          <button onclick="removeWordFromSet('${s.id}','${h}')" class="text-slate-300 hover:text-red-500 text-xs ml-0.5 opacity-0 group-hover/chip:opacity-100 transition-opacity" title="Xóa">✕</button>
        </div>`;
      }).join('');
      const moreCount = s.words.length > 30 ? `<span class="text-xs text-slate-400">+${s.words.length - 30} từ nữa</span>` : '';

      return `<div class="bg-white border-2 rounded-xl p-5 hover:border-primary/30 transition-colors">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="font-bold text-lg">${s.name}</h3>
            <span class="text-xs text-slate-400">${s.words.length} từ · Tạo ${new Date(s.created).toLocaleDateString('vi-VN')}</span>
          </div>
          <div class="flex items-center gap-2">
            <button onclick="exportBookmarkPdf('${s.id}')" class="text-xs font-medium text-primary border border-primary px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors" title="Xuất PDF">📄 PDF</button>
            <button onclick="renameBookmarkSet('${s.id}')" class="text-xs text-slate-400 hover:text-primary px-2 py-1" title="Đổi tên">✏️</button>
            <button onclick="deleteBookmarkSet('${s.id}')" class="text-xs text-slate-400 hover:text-red-500 px-2 py-1" title="Xóa">🗑️</button>
          </div>
        </div>
        ${s.words.length ? `<div class="flex flex-wrap gap-1.5">${wordChips}${moreCount}</div>` : '<p class="text-sm text-slate-400">Chưa có từ nào. Thêm từ từ Thư viện hoặc Bút thuận.</p>'}
      </div>`;
    }).join('');
  }

  window.openDetailByHanzi = function (hanzi) {
    const w = allWords.find(x => x.hanzi === hanzi);
    if (w) openDetail(w);
  };

  // Export PDF from bookmark set
  window.exportBookmarkPdf = function (setId) {
    const sets = loadBookmarks();
    const s = sets.find(x => x.id === setId);
    if (!s || !s.words.length) { alert('Bộ từ vựng trống!'); return; }
    // Navigate to PDF page with custom mode pre-filled
    showPage('pdf');
    setPdfMode('custom');
    const input = $('#pdf-custom-input');
    if (input) input.value = s.words.join(', ');
    showToast('Đã điền ' + s.words.length + ' từ từ "' + s.name + '" vào trang PDF');
  };

  // ===== PAGE ROUTING =====
  window.showPage = function (name) {
    $$('.page').forEach(p => p.classList.remove('active'));
    const el = $(`#page-${name}`);
    if (el) el.classList.add('active');
    window.scrollTo(0, 0);
    if (name === 'library' && allWords.length && !rendered) {
      applyFilters();
    }
    if (name === 'bookmarks') {
      renderBookmarksPage();
    }
  };

  window.closeMobile = function () {
    $('#mobile-menu').classList.add('hidden');
  };

  // ===== DATA LOADING =====
  async function init() {
    try {
      const [wordsData, charsData] = await Promise.all([
        fetch('data/words.json').then(r => r.json()),
        fetch('data/characters.json').then(r => r.json())
      ]);
      allWords = wordsData;
      characters = charsData;
      const sw = $('#stat-words');
      if (sw) sw.textContent = allWords.length.toLocaleString() + '+';
      buildChips();
      setupLibraryEvents();
      setupStrokeEvents();
      const ll = $('#lib-loading');
      if (ll) ll.classList.add('hidden');
    } catch (e) {
      const ll = $('#lib-loading');
      if (ll) ll.innerHTML = `<div class="text-center py-16 text-red-500"><div class="text-5xl mb-3">❌</div><p>Lỗi tải: ${e.message}</p></div>`;
    }
  }

  // ===== LIBRARY: CHIPS =====
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

  // ===== LIBRARY: SEARCH & FILTER =====
  function applyFilters() {
    const q = searchQuery.trim().toLowerCase();
    const qStripped = stripTones(q);
    filtered = allWords.filter(w => {
      if (selectedHsk > 0 && w.hsk !== selectedHsk) return false;
      if (q) {
        if (w.hanzi.includes(q)) return true;
        const py = w.pinyin.toLowerCase();
        if (py.includes(q) || stripTones(py).includes(qStripped)) return true;
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
    div.className = 'flex items-center gap-4 py-3 px-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group';
    const def = w.vietnamese || w.english || '';
    div.innerHTML = `
      <span class="font-cn text-2xl font-bold text-hanzi min-w-[64px] text-center">${w.hanzi}</span>
      <div class="flex-1 min-w-0">
        <div class="text-sm text-primary font-medium">${w.pinyin}</div>
        <div class="text-xs text-slate-500 truncate">${def}</div>
      </div>
      <span class="text-xs font-bold px-2 py-1 rounded bg-amber-50 text-amber-700 flex-shrink-0">HSK${w.hsk}</span>
      <button class="bm-btn w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center hover:bg-amber-50 hover:border-amber-300 transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100" title="Thêm vào hồ sơ học">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
      </button>
      <button class="speak-btn w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-primary hover:bg-primary hover:text-white hover:border-primary transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100" title="Phát âm">
        <svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5z" fill="currentColor"/></svg>
      </button>`;
    div.addEventListener('click', e => {
      if (e.target.closest('.speak-btn')) { e.stopPropagation(); speakText(w.hanzi); return; }
      if (e.target.closest('.bm-btn')) { e.stopPropagation(); addToBookmark(w.hanzi); return; }
      openDetail(w);
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

  // ===== TTS =====
  function speakText(text) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; u.rate = 0.8;
    const v = speechSynthesis.getVoices().find(v => v.lang.startsWith('zh'));
    if (v) u.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // ===== DETAIL PAGE =====
  function openDetail(w) {
    showPage('detail');
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
      const parts = [...(c.decomp || '')];
      let partsH = '';
      for (const p of parts) {
        const code = p.codePointAt(0);
        const isSt = code >= 0x2FF0 && code <= 0x2FFF;
        partsH += `<span class="inline-flex items-center justify-center w-10 h-10 rounded-lg font-cn text-lg ${isSt ? 'bg-blue-50 border border-blue-200 text-primary text-sm' : 'bg-amber-50 border border-amber-200 text-hanzi'}">${p}</span>`;
      }
      decompHtml += `<div class="flex items-center gap-3 mb-2"><span class="font-cn text-3xl font-bold text-hanzi">${c.char}</span><div class="text-sm"><span class="text-slate-400">Bộ thủ:</span> <strong>${c.radical || '—'}</strong> · <span class="text-slate-400">Nét:</span> <strong>${c.strokeCount}</strong></div></div>${c.decomp ? `<div class="flex flex-wrap gap-2 mb-2">${partsH}</div>` : ''}${c.def ? `<p class="text-sm text-slate-500">${c.def}</p>` : ''}`;
    }

    const hanziEsc = w.hanzi.replace(/'/g, "\\'");

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
  }

  window.speakWord = function (text) { speakText(text); };
  window.showStrokeForWord = function (text) {
    $('#stroke-input').value = text;
    showPage('stroke');
    doStrokeLookup();
  };

  // ===== STROKE PAGE =====
  function setupStrokeEvents() {
    $('#stroke-input').addEventListener('keydown', e => { if (e.key === 'Enter') doStrokeLookup(); });
    if ('speechSynthesis' in window) {
      speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
    }
  }

  window.strokeQuick = function (text) {
    $('#stroke-input').value = text;
    doStrokeLookup();
  };

  window.doStrokeLookup = function () {
    const text = $('#stroke-input').value.trim();
    if (!text) return;
    currentStrokeChars = [];
    for (const ch of text) {
      if (characters[ch]) currentStrokeChars.push(characters[ch]);
    }
    if (!currentStrokeChars.length) {
      $('#stroke-area').classList.add('hidden');
      $('#stroke-empty').classList.remove('hidden');
      $('#stroke-empty').innerHTML = '<div class="text-5xl mb-3">🔍</div><p>Không tìm thấy dữ liệu bút thuận cho "' + text + '"</p>';
      return;
    }
    $('#stroke-area').classList.remove('hidden');
    $('#stroke-empty').classList.add('hidden');
    let tabsH = '';
    currentStrokeChars.forEach((c, i) => {
      tabsH += `<button onclick="selectStrokeChar(${i})" class="stroke-tab px-4 py-2 rounded-lg font-cn text-xl border-2 ${i === 0 ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 hover:border-primary'} transition-colors">${c.char}</button>`;
    });
    $('#stroke-char-tabs').innerHTML = tabsH;
    selectStrokeChar(0);
  };

  window.selectStrokeChar = function (idx) {
    currentStrokeIdx = idx;
    $$('.stroke-tab').forEach((t, i) => {
      t.classList.toggle('border-primary', i === idx);
      t.classList.toggle('bg-blue-50', i === idx);
      t.classList.toggle('text-primary', i === idx);
      t.classList.toggle('border-slate-200', i !== idx);
    });
    const c = currentStrokeChars[idx];
    // Decomposition parts
    const parts = [...(c.decomp || '')];
    let partsH = '';
    for (const p of parts) {
      const code = p.codePointAt(0);
      const isSt = code >= 0x2FF0 && code <= 0x2FFF;
      partsH += `<span class="inline-flex items-center justify-center w-10 h-10 rounded-lg font-cn text-lg ${isSt ? 'bg-blue-50 border border-blue-200 text-primary text-sm' : 'bg-amber-50 border border-amber-200 text-hanzi'}">${p}</span>`;
    }

    // Lookup all meanings from allWords (find best match: exact char first, then containing)
    const exactWord = allWords.find(w => w.hanzi === c.char);
    const containWord = !exactWord ? allWords.find(w => [...w.hanzi].includes(c.char)) : null;
    const wordData = exactWord || containWord;

    let viFullHtml = '', enLineHtml = '', pinyinText = '';
    if (wordData) {
      pinyinText = wordData.pinyin || '';
      // Full Vietnamese meanings
      if (wordData.vietnamese) {
        const viDefs = [...new Set(wordData.vietnamese.split(/[;；]/).map(s => s.trim()).filter(Boolean))];
        viFullHtml = `<div class="mt-3"><div class="text-xs font-bold text-red-500 uppercase tracking-wide mb-1">🇻🇳 Nghĩa tiếng Việt</div>${viDefs.map((d, i) => `<p class="text-sm text-slate-700 py-0.5">${i + 1}. ${d}</p>`).join('')}</div>`;
      }
      // Single line English
      if (wordData.english) {
        const enFirst = wordData.english.split(/[;；]/)[0].trim();
        enLineHtml = `<p class="text-sm mt-1"><span class="text-blue-500 font-medium">🇬🇧</span> <span class="text-slate-500">${enFirst}</span></p>`;
      }
    }
    // Also use makemeahanzi def as fallback
    if (!viFullHtml && !enLineHtml && c.def) {
      enLineHtml = `<p class="text-sm mt-1"><span class="text-blue-500 font-medium">🇬🇧</span> <span class="text-slate-500">${c.def}</span></p>`;
    }

    const charEsc = c.char.replace(/'/g, "\\'");

    $('#stroke-info').innerHTML = `
      <div class="bg-white rounded-xl border p-4">
        <div class="flex items-center gap-4 mb-2">
          <span class="font-cn text-4xl font-bold text-hanzi">${c.char}</span>
          <div>
            ${pinyinText ? `<div class="text-sm text-primary font-medium mb-0.5">${pinyinText}</div>` : ''}
            <div class="text-sm"><span class="text-slate-400">Bộ thủ:</span> <strong>${c.radical || '—'}</strong></div>
            <div class="text-sm"><span class="text-slate-400">Số nét:</span> <strong>${c.strokeCount}</strong></div>
          </div>
        </div>
        <!-- Action buttons -->
        <div class="flex gap-2 mb-3">
          <button onclick="speakWord('${charEsc}')" class="inline-flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary-dark transition-colors">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5z" fill="currentColor"/></svg> Phát âm
          </button>
          <button onclick="addToBookmark('${charEsc}')" class="inline-flex items-center gap-1.5 border border-amber-400 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-50 transition-colors">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> Lưu
          </button>
        </div>
        ${viFullHtml}
        ${enLineHtml}
        ${c.decomp ? `<div class="mt-3"><div class="text-xs font-bold text-primary uppercase tracking-wide mb-2">Phân tách</div><div class="flex flex-wrap gap-2">${partsH}</div></div>` : ''}
      </div>`;
    startAnimation(c);
  };

  window.replayStroke = function () {
    if (currentStrokeChars[currentStrokeIdx]) startAnimation(currentStrokeChars[currentStrokeIdx]);
  };

  // ===== STROKE ANIMATION ENGINE (Smooth) =====
  const canvas = $('#stroke-canvas');
  const ctx = canvas.getContext('2d');
  let canvasInited = false;

  // Easing: smooth ease-in-out for natural brush feel
  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  // Pre-compute median lengths for a character (once per char)
  function precomputeMedianLengths(medians, scale) {
    return medians.map(median => {
      if (!median || median.length < 2) return { pts: [], totalLen: 0 };
      const pts = median.map(p => ({ x: p[0] * scale, y: (900 - p[1]) * scale }));
      let totalLen = 0;
      const segLens = [];
      for (let i = 1; i < pts.length; i++) {
        const len = Math.hypot(pts[i].x - pts[i-1].x, pts[i].y - pts[i-1].y);
        segLens.push(len);
        totalLen += len;
      }
      return { pts, segLens, totalLen };
    });
  }

  function startAnimation(charData) {
    cancelAnim();
    const strokes = charData.strokes || [];
    const medians = charData.medians || [];
    const total = strokes.length;
    const dotsEl = $('#stroke-dots');
    dotsEl.innerHTML = '';
    for (let i = 0; i < Math.min(total, 30); i++) {
      const d = document.createElement('span');
      d.className = 'inline-block w-2 h-2 rounded-full bg-slate-200 transition-all stroke-dot';
      dotsEl.appendChild(d);
    }
    if (!total) { clearCanvas(); return; }

    // Init canvas once (not every frame!)
    initCanvas();

    const parsed = strokes.map(s => parseSvgPath(s));
    const S = 400, scale = S / 1024;
    const medianData = precomputeMedianLengths(medians, scale);

    // Adaptive timing: base per-stroke duration on median length
    const strokeDurations = medianData.map(m => {
      const len = m.totalLen || 100;
      // Slow & smooth: min 500ms, max 1200ms
      return Math.max(500, Math.min(1200, len * 3.5));
    });
    const pauseBetween = 200; // ms pause between strokes for clarity
    // Build timeline: each stroke has start time & duration
    const timeline = [];
    let t = 300; // initial delay
    for (let i = 0; i < total; i++) {
      timeline.push({ start: t, dur: strokeDurations[i] || 500 });
      t += (strokeDurations[i] || 500) + pauseBetween;
    }
    const totalDuration = t;

    const startTime = performance.now();

    function frame(now) {
      const elapsed = now - startTime;
      // Draw
      drawFrameSmooth(parsed, medianData, total, scale, S, timeline, elapsed);
      updateDotsSmooth(total, timeline, elapsed);
      if (elapsed < totalDuration) {
        animId = requestAnimationFrame(frame);
      }
    }
    animId = requestAnimationFrame(frame);
  }

  function cancelAnim() { if (animId) { cancelAnimationFrame(animId); animId = null; } }

  function initCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = 400 * dpr, h = 400 * dpr;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvasInited = true;
  }

  function clearCanvas() {
    initCanvas();
    ctx.clearRect(0, 0, 400, 400);
  }

  function drawFrameSmooth(strokes, medianData, total, scale, S, timeline, elapsed) {
    ctx.clearRect(0, 0, 400, 400);
    drawGrid(S);
    const brushWidth = 200 * scale; // slightly narrower for sharper look

    for (let i = 0; i < total; i++) {
      const tl = timeline[i];
      const path = strokes[i];
      if (!path) continue;

      if (elapsed < tl.start) {
        // Not started yet - ghost stroke
        drawPath(path, scale, '#e8e0d0', 1);
      } else if (elapsed >= tl.start + tl.dur) {
        // Completed - solid stroke
        drawPath(path, scale, '#2c2c2c', 1);
      } else {
        // In progress - animated
        const raw = (elapsed - tl.start) / tl.dur;
        const sp = easeInOutCubic(Math.max(0, Math.min(1, raw)));

        // Draw ghost first
        drawPath(path, scale, '#e8e0d0', 1);

        // Clip with median and draw red
        const md = medianData[i];
        if (md && md.pts.length >= 2) {
          ctx.save();
          buildClipSmooth(md, sp, brushWidth);
          drawPath(path, scale, '#cc0000', 1);
          ctx.restore();
        } else {
          drawPath(path, scale, '#cc0000', sp);
        }
      }
    }
  }

  function drawGrid(s) {
    ctx.strokeStyle = '#ccbb99'; ctx.lineWidth = 2;
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
    ctx.setLineDash([10, 6]); ctx.strokeStyle = '#ddccaa'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(221,204,170,0.4)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(0, s); ctx.stroke();
    ctx.setLineDash([]);
  }

  // Optimized clip builder using pre-computed data and fewer circles
  function buildClipSmooth(md, progress, bw) {
    const { pts, segLens, totalLen } = md;
    if (!totalLen) return;
    const targetLen = totalLen * progress;
    const r = bw / 2;
    // Use larger step for performance, still smooth enough visually
    const stepSize = Math.max(r * 0.5, 3);

    ctx.beginPath();
    // Start circle
    addCircle(pts[0].x, pts[0].y, r);

    let traveled = 0;
    for (let i = 0; i < segLens.length; i++) {
      const segLen = segLens[i];
      if (segLen === 0) continue;
      const p0 = pts[i], p1 = pts[i + 1];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;

      if (traveled + segLen <= targetLen) {
        // Full segment - just add endpoint
        const steps = Math.max(1, Math.ceil(segLen / stepSize));
        for (let j = 1; j <= steps; j++) {
          const t = j / steps;
          addCircle(p0.x + dx * t, p0.y + dy * t, r);
        }
        traveled += segLen;
      } else {
        // Partial segment
        const remain = targetLen - traveled;
        const frac = remain / segLen;
        const steps = Math.max(1, Math.ceil(remain / stepSize));
        for (let j = 1; j <= steps; j++) {
          const t = Math.min(frac, j / steps * frac);
          addCircle(p0.x + dx * t, p0.y + dy * t, r);
        }
        break;
      }
    }
    ctx.clip();
  }

  function addCircle(x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }

  function updateDotsSmooth(total, timeline, elapsed) {
    $$('.stroke-dot').forEach((dot, i) => {
      if (i >= timeline.length) return;
      const tl = timeline[i];
      if (elapsed >= tl.start + tl.dur) {
        dot.classList.add('done'); dot.classList.remove('act');
      } else if (elapsed >= tl.start) {
        dot.classList.remove('done'); dot.classList.add('act');
      } else {
        dot.classList.remove('done'); dot.classList.remove('act');
      }
    });
  }

  function drawPath(commands, scale, color, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath();
    let cx = 0, cy = 0, lcx = 0, lcy = 0;
    const tx = x => x * scale, ty = y => (900 - y) * scale;
    for (const cmd of commands) {
      switch (cmd.type) {
        case 'M': cx = cmd.x; cy = cmd.y; ctx.moveTo(tx(cx), ty(cy)); break;
        case 'L': cx = cmd.x; cy = cmd.y; ctx.lineTo(tx(cx), ty(cy)); break;
        case 'Q': lcx = cmd.x1; lcy = cmd.y1; cx = cmd.x; cy = cmd.y; ctx.quadraticCurveTo(tx(lcx), ty(lcy), tx(cx), ty(cy)); break;
        case 'C': lcx = cmd.x2; lcy = cmd.y2; cx = cmd.x; cy = cmd.y; ctx.bezierCurveTo(tx(cmd.x1), ty(cmd.y1), tx(lcx), ty(lcy), tx(cx), ty(cy)); break;
        case 'S': { const rx = 2 * cx - lcx, ry = 2 * cy - lcy; lcx = cmd.x2; lcy = cmd.y2; cx = cmd.x; cy = cmd.y; ctx.bezierCurveTo(tx(rx), ty(ry), tx(lcx), ty(lcy), tx(cx), ty(cy)); break; }
        case 'T': { const rx = 2 * cx - lcx, ry = 2 * cy - lcy; lcx = rx; lcy = ry; cx = cmd.x; cy = cmd.y; ctx.quadraticCurveTo(tx(lcx), ty(lcy), tx(cx), ty(cy)); break; }
        case 'Z': ctx.closePath(); break;
      }
    }
    ctx.fillStyle = color; ctx.fill(); ctx.restore();
  }

  function parseSvgPath(d) {
    const cmds = [], tokens = tokenize(d);
    let i = 0;
    while (i < tokens.length) {
      switch (tokens[i]) {
        case 'M': cmds.push({ type: 'M', x: +tokens[i + 1], y: +tokens[i + 2] }); i += 3; break;
        case 'L': cmds.push({ type: 'L', x: +tokens[i + 1], y: +tokens[i + 2] }); i += 3; break;
        case 'Q': cmds.push({ type: 'Q', x1: +tokens[i + 1], y1: +tokens[i + 2], x: +tokens[i + 3], y: +tokens[i + 4] }); i += 5; break;
        case 'C': cmds.push({ type: 'C', x1: +tokens[i + 1], y1: +tokens[i + 2], x2: +tokens[i + 3], y2: +tokens[i + 4], x: +tokens[i + 5], y: +tokens[i + 6] }); i += 7; break;
        case 'S': cmds.push({ type: 'S', x2: +tokens[i + 1], y2: +tokens[i + 2], x: +tokens[i + 3], y: +tokens[i + 4] }); i += 5; break;
        case 'T': cmds.push({ type: 'T', x: +tokens[i + 1], y: +tokens[i + 2] }); i += 3; break;
        case 'Z': case 'z': cmds.push({ type: 'Z' }); i++; break;
        default: i++;
      }
    }
    return cmds;
  }

  function tokenize(d) {
    const t = []; let c = '';
    for (const ch of d) {
      if ('MLQCSZTmlqcszt'.includes(ch)) { if (c) { t.push(c); c = ''; } t.push(ch.toUpperCase()); }
      else if (',\t\n '.includes(ch)) { if (c) { t.push(c); c = ''; } }
      else if (ch === '-') { if (c) { t.push(c); c = ''; } c = ch; }
      else c += ch;
    }
    if (c) t.push(c);
    return t;
  }


  // ===== PDF EXPORT =====
  let pdfMode = 'hsk';

  window.setPdfMode = function (mode) {
    pdfMode = mode;
    $$('.pdf-mode-tab').forEach(t => {
      const active = t.dataset.mode === mode;
      t.classList.toggle('border-primary', active);
      t.classList.toggle('text-primary', active);
      t.classList.toggle('border-transparent', !active);
      t.classList.toggle('text-slate-500', !active);
    });
    $('#pdf-hsk-mode').classList.toggle('hidden', mode !== 'hsk');
    $('#pdf-custom-mode').classList.toggle('hidden', mode !== 'custom');
  };

  function getPdfWords() {
    if (pdfMode === 'custom') {
      const raw = $('#pdf-custom-input').value.trim();
      if (!raw) return [];
      const tokens = raw.split(/[,，\n\r]+/).map(s => s.trim()).filter(Boolean);
      const result = [];
      for (const tok of tokens) {
        const found = allWords.find(w => w.hanzi === tok);
        if (found) { result.push(found); }
        else { result.push({ hanzi: tok, pinyin: '', vietnamese: '', hsk: 0 }); }
      }
      return result;
    }
    const checked = [...$$('.pdf-hsk-check input:checked')].map(c => parseInt(c.value));
    if (!checked.length) return [];
    const max = parseInt($('#pdf-max-words').value) || 20;
    let result = [];
    for (const lv of checked) {
      const lvWords = allWords.filter(w => w.hsk === lv);
      result = result.concat(lvWords.slice(0, max));
    }
    return result;
  }

  window.previewPdfInfo = function () {
    const words = getPdfWords();
    if (!words.length) {
      $('#pdf-preview-info').innerHTML = '<span class="text-red-500">⚠️ Chưa chọn từ nào.</span>';
      return;
    }
    const chars = new Set();
    words.forEach(w => { for (const ch of w.hanzi) chars.add(ch); });
    const repeat = parseInt($('#pdf-repeat').value) || 6;
    const cellSize = parseInt($('#pdf-cell-size').value) || 18;
    const colsPerRow = Math.floor((210 - 20) / cellSize);
    const totalCells = chars.size * repeat;
    const rows = Math.ceil(totalCells / colsPerRow);
    const showPinyin = $('#pdf-show-pinyin').checked;
    const rowH = cellSize + (showPinyin ? 5 : 0) + 1;
    const usableH = 297 - 25;
    const rowsPerPage = Math.floor(usableH / rowH);
    const pages = Math.ceil(rows / rowsPerPage);
    $('#pdf-preview-info').innerHTML = `📊 <strong>${words.length}</strong> từ → <strong>${chars.size}</strong> chữ duy nhất × ${repeat} ô = <strong>${totalCells}</strong> ô. Ước tính <strong>${pages}</strong> trang A4.`;
  };

  function renderCharPng(char, sizePx) {
    const cd = characters[char];
    if (!cd || !cd.strokes) return null;
    const cvs = document.createElement('canvas');
    cvs.width = sizePx; cvs.height = sizePx;
    const c = cvs.getContext('2d');
    const scale = sizePx / 1024;
    for (const strokeD of cd.strokes) {
      const parsed = parseSvgPath(strokeD);
      c.beginPath();
      let cx2=0,cy2=0,lcx2=0,lcy2=0;
      for (const cmd of parsed) {
        const px = v => v * scale, py = v => (900 - v) * scale;
        switch (cmd.type) {
          case 'M': cx2=cmd.x;cy2=cmd.y;c.moveTo(px(cx2),py(cy2));break;
          case 'L': cx2=cmd.x;cy2=cmd.y;c.lineTo(px(cx2),py(cy2));break;
          case 'Q': lcx2=cmd.x1;lcy2=cmd.y1;cx2=cmd.x;cy2=cmd.y;c.quadraticCurveTo(px(lcx2),py(lcy2),px(cx2),py(cy2));break;
          case 'C': lcx2=cmd.x2;lcy2=cmd.y2;cx2=cmd.x;cy2=cmd.y;c.bezierCurveTo(px(cmd.x1),py(cmd.y1),px(lcx2),py(lcy2),px(cx2),py(cy2));break;
          case 'S': {const rx=2*cx2-lcx2,ry=2*cy2-lcy2;lcx2=cmd.x2;lcy2=cmd.y2;cx2=cmd.x;cy2=cmd.y;c.bezierCurveTo(px(rx),py(ry),px(lcx2),py(lcy2),px(cx2),py(cy2));break;}
          case 'Z': c.closePath();break;
        }
      }
      c.fillStyle = '#333'; c.fill();
    }
    return cvs.toDataURL('image/png');
  }

  function renderGuidePng(char, sizePx, alpha) {
    const cd = characters[char];
    if (!cd || !cd.strokes) return null;
    const cvs = document.createElement('canvas');
    cvs.width = sizePx; cvs.height = sizePx;
    const c = cvs.getContext('2d');
    const scale = sizePx / 1024;
    c.globalAlpha = alpha;
    for (const strokeD of cd.strokes) {
      const parsed = parseSvgPath(strokeD);
      c.beginPath();
      let cx2=0,cy2=0,lcx2=0,lcy2=0;
      for (const cmd of parsed) {
        const px = v => v * scale, py = v => (900 - v) * scale;
        switch (cmd.type) {
          case 'M': cx2=cmd.x;cy2=cmd.y;c.moveTo(px(cx2),py(cy2));break;
          case 'L': cx2=cmd.x;cy2=cmd.y;c.lineTo(px(cx2),py(cy2));break;
          case 'Q': lcx2=cmd.x1;lcy2=cmd.y1;cx2=cmd.x;cy2=cmd.y;c.quadraticCurveTo(px(lcx2),py(lcy2),px(cx2),py(cy2));break;
          case 'C': lcx2=cmd.x2;lcy2=cmd.y2;cx2=cmd.x;cy2=cmd.y;c.bezierCurveTo(px(cmd.x1),py(cmd.y1),px(lcx2),py(lcy2),px(cx2),py(cy2));break;
          case 'S': {const rx=2*cx2-lcx2,ry=2*cy2-lcy2;lcx2=cmd.x2;lcy2=cmd.y2;cx2=cmd.x;cy2=cmd.y;c.bezierCurveTo(px(rx),py(ry),px(lcx2),py(lcy2),px(cx2),py(cy2));break;}
          case 'Z': c.closePath();break;
        }
      }
      c.fillStyle = '#cc3333'; c.fill();
    }
    return cvs.toDataURL('image/png');
  }

  function renderStrokeStripPng(char, stepH) {
    const cd = characters[char];
    if (!cd || !cd.strokes) return null;
    const strokes = cd.strokes;
    const n = strokes.length;
    if (!n) return null;
    const cvs = document.createElement('canvas');
    cvs.width = stepH * n; cvs.height = stepH;
    const c = cvs.getContext('2d');
    const scale = stepH / 1024;
    for (let step = 0; step < n; step++) {
      c.save(); c.translate(step * stepH, 0);
      for (let s = 0; s <= step; s++) {
        const parsed = parseSvgPath(strokes[s]);
        c.beginPath();
        let cx2=0,cy2=0,lcx2=0,lcy2=0;
        for (const cmd of parsed) {
          const px = v => v * scale, py = v => (900 - v) * scale;
          switch (cmd.type) {
            case 'M': cx2=cmd.x;cy2=cmd.y;c.moveTo(px(cx2),py(cy2));break;
            case 'L': cx2=cmd.x;cy2=cmd.y;c.lineTo(px(cx2),py(cy2));break;
            case 'Q': lcx2=cmd.x1;lcy2=cmd.y1;cx2=cmd.x;cy2=cmd.y;c.quadraticCurveTo(px(lcx2),py(lcy2),px(cx2),py(cy2));break;
            case 'C': lcx2=cmd.x2;lcy2=cmd.y2;cx2=cmd.x;cy2=cmd.y;c.bezierCurveTo(px(cmd.x1),py(cmd.y1),px(lcx2),py(lcy2),px(cx2),py(cy2));break;
            case 'S': {const rx=2*cx2-lcx2,ry=2*cy2-lcy2;lcx2=cmd.x2;lcy2=cmd.y2;cx2=cmd.x;cy2=cmd.y;c.bezierCurveTo(px(rx),py(ry),px(lcx2),py(lcy2),px(cx2),py(cy2));break;}
            case 'Z': c.closePath();break;
          }
        }
        c.fillStyle = s === step ? '#cc0000' : '#333'; c.fill();
      }
      c.restore();
    }
    return { img: cvs.toDataURL('image/png'), count: n };
  }

  window.generatePdf = function () {
    try {
      const words = getPdfWords();
      if (!words.length) {
        $('#pdf-status').classList.remove('hidden');
        $('#pdf-status').className = 'mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700';
        $('#pdf-status').textContent = '⚠️ Chưa chọn từ nào!';
        return;
      }
      const guideCount = parseInt($('#pdf-repeat').value) || 4;
      const practiceRows = parseInt($('#pdf-practice-rows').value) || 1;
      const cellSize = parseInt($('#pdf-cell-size').value) || 18;
      const showPinyin = $('#pdf-show-pinyin').checked;
      const showGuide = $('#pdf-show-guide').checked;
      const showMeaning = $('#pdf-show-meaning').checked;
      const charList = [];
      const seen = new Set();
      const wordMap = {};
      for (const w of words) {
        const chars = [...w.hanzi];
        const pinyinParts = w.pinyin ? w.pinyin.trim().split(/\s+/) : [];
        for (let i = 0; i < chars.length; i++) {
          const ch = chars[i];
          if (!wordMap[ch]) wordMap[ch] = w;
          if (seen.has(ch)) continue;
          seen.add(ch);
          charList.push({ char: ch, pinyin: pinyinParts[i] || '' });
        }
      }
      if (!window.jspdf && !window.jsPDF) {
        $('#pdf-status').classList.remove('hidden');
        $('#pdf-status').className = 'mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700';
        $('#pdf-status').innerHTML = '⏳ Đang tải jsPDF...';
        const script = document.createElement('script');
        script.src = 'jspdf.umd.min.js';
        script.onload = () => generatePdf();
        script.onerror = () => { $('#pdf-status').innerHTML = '❌ Không thể tải jsPDF.'; };
        document.head.appendChild(script);
        return;
      }
      const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
      const doc = new jsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
      const pageW = 210, pageH = 297, mL = 10, mR = 10, mT = 15, mB = 5;
      const usableW = pageW - mL - mR;
      const totalCols = Math.floor(usableW / cellSize);
      const gridW = totalCols * cellSize;
      const previewH = cellSize + 4;
      const blockGap = 1.5;
      let curY = mT, pageNum = 1;

      function textToPng(text, fontSize, color, bold) {
        const cvs = document.createElement('canvas');
        cvs.width = 1200; cvs.height = Math.ceil(fontSize * 1.5);
        const c = cvs.getContext('2d');
        const fontStr = (bold ? 'bold ' : '') + fontSize + 'px Inter, Segoe UI, Arial, sans-serif';
        c.font = fontStr;
        const tw = Math.ceil(c.measureText(text).width) + 10;
        cvs.width = tw; cvs.height = Math.ceil(fontSize * 1.5);
        const c2 = cvs.getContext('2d');
        c2.font = fontStr; c2.fillStyle = color; c2.textBaseline = 'middle';
        c2.fillText(text, 2, cvs.height / 2);
        return { url: cvs.toDataURL('image/png'), w: cvs.width, h: cvs.height };
      }

      function drawHeader() {
        const title = textToPng('ChineseWriter - Tập Viết Chữ Hán', 32, '#3c3c3c', true);
        const tH = 4, tW = tH * (title.w / title.h);
        try { doc.addImage(title.url, 'PNG', mL, 6, tW, tH); } catch(e) {}
        const pg = textToPng('Trang ' + pageNum, 24, '#666666', false);
        const pgH = 3, pgW = pgH * (pg.w / pg.h);
        try { doc.addImage(pg.url, 'PNG', pageW - mR - pgW, 6.5, pgW, pgH); } catch(e) {}
        doc.setDrawColor(200,200,200); doc.setLineWidth(0.3);
        doc.line(mL, 10, pageW - mR, 10);
      }
      drawHeader();

      function newPage() { doc.addPage(); pageNum++; curY = mT; drawHeader(); }

      function drawGridCell(x, y, size) {
        doc.setDrawColor(200,190,170); doc.setLineWidth(0.25); doc.rect(x, y, size, size);
        doc.setDrawColor(215,205,185); doc.setLineWidth(0.15);
        doc.setLineDashPattern([1.5,1.5], 0);
        doc.line(x, y+size/2, x+size, y+size/2);
        doc.line(x+size/2, y, x+size/2, y+size);
        doc.line(x, y, x+size, y+size);
        doc.line(x+size, y, x, y+size);
        doc.setLineDashPattern([], 0);
      }

      const MAIN_PX = 80, GUIDE_PX = 48, STRIP_PX = 60;
      const charImageCache = {};
      for (const item of charList) {
        const mainImg = renderCharPng(item.char, MAIN_PX);
        const stripData = renderStrokeStripPng(item.char, STRIP_PX);
        const guideImgs = [], alphaCache = {};
        for (let g = 0; g < guideCount; g++) {
          const alpha = Math.max(0.08, 0.6 - g * (0.52 / Math.max(guideCount - 1, 1)));
          const key = Math.round(alpha * 100);
          if (!alphaCache[key]) alphaCache[key] = renderGuidePng(item.char, GUIDE_PX, alpha);
          guideImgs.push(alphaCache[key]);
        }
        charImageCache[item.char] = { main: mainImg, strip: stripData, guide: guideImgs };
      }

      for (const item of charList) {
        const blockH = previewH + cellSize * practiceRows + blockGap;
        if (curY + blockH > pageH - mB) newPage();
        const cache = charImageCache[item.char];
        const y1 = curY;
        doc.setDrawColor(180,180,180); doc.setLineWidth(0.3); doc.rect(mL, y1, gridW, previewH);
        if (cache.main) { try { doc.addImage(cache.main, 'PNG', mL+1, y1+1, cellSize-2, cellSize-2); } catch(e) {} }
        const stepSize = Math.min(cellSize * 0.55, 10);
        if (cache.strip) {
          const n = cache.strip.count, stripW = n * stepSize, maxW = gridW - cellSize - 4;
          try { doc.addImage(cache.strip.img, 'PNG', mL+cellSize+2, y1+1, Math.min(stripW, maxW), stepSize); } catch(e) {}
        }
        if (showPinyin && item.pinyin) {
          const pCvs = document.createElement('canvas');
          pCvs.width = 800; pCvs.height = 50;
          const pc = pCvs.getContext('2d');
          pc.font = 'bold 36px Inter, Segoe UI, Arial, sans-serif';
          const pTw = pc.measureText('/'+item.pinyin+'/').width;
          pCvs.width = Math.ceil(pTw)+12; pCvs.height = 50;
          const pc2 = pCvs.getContext('2d');
          pc2.font = 'bold 36px Inter, Segoe UI, Arial, sans-serif';
          pc2.fillStyle = '#444444'; pc2.textBaseline = 'middle';
          pc2.fillText('/'+item.pinyin+'/', 4, 26);
          const pH = 4.2, pW = pH * (pCvs.width / pCvs.height);
          try { doc.addImage(pCvs.toDataURL('image/png'), 'PNG', mL+1, y1+cellSize-0.8, pW, pH); } catch(e) {}
        }
        if (showMeaning) {
          const w = wordMap[item.char];
          if (w) {
            const viDef = (w.vietnamese||'').split(/[;；]/)[0].trim();
            const enDef = (w.english||'').split(/[;；]/)[0].trim();
            let mt = ''; if (viDef && enDef) mt = viDef+' | '+enDef; else mt = viDef || enDef;
            if (mt) {
              if (mt.length > 55) mt = mt.substring(0,52)+'...';
              const mCvs = document.createElement('canvas');
              mCvs.width = 1200; mCvs.height = 40;
              const mc = mCvs.getContext('2d');
              mc.font = '28px Inter, Segoe UI, Arial, sans-serif';
              const mTw = mc.measureText(mt).width;
              mCvs.width = Math.ceil(mTw)+12; mCvs.height = 40;
              const mc2 = mCvs.getContext('2d');
              mc2.font = '28px Inter, Segoe UI, Arial, sans-serif';
              mc2.fillStyle = '#555555'; mc2.textBaseline = 'middle'; mc2.fillText(mt, 4, 21);
              const mH = 3.5, maxMW = gridW-cellSize-4, mW = Math.min(maxMW, mH*(mCvs.width/mCvs.height));
              try { doc.addImage(mCvs.toDataURL('image/png'), 'PNG', mL+cellSize+2, y1+stepSize+3, mW, mH); } catch(e) {}
            }
          }
        }
        let guideIdx = 0;
        for (let row = 0; row < practiceRows; row++) {
          const rowY = y1 + previewH + row * cellSize;
          if (rowY + cellSize > pageH - mB) newPage();
          for (let col = 0; col < totalCols; col++) {
            const cx = mL + col * cellSize;
            drawGridCell(cx, rowY, cellSize);
            if (showGuide && guideIdx < guideCount && cache.guide[guideIdx]) {
              try { doc.addImage(cache.guide[guideIdx], 'PNG', cx+0.5, rowY+0.5, cellSize-1, cellSize-1); } catch(e) {}
              guideIdx++;
            }
          }
        }
        curY += blockH;
      }

      const hskLabels = [...$$('.pdf-hsk-check input:checked')].map(c => c.value).join('-');
      const filename = pdfMode === 'hsk' ? `ChineseWriter_HSK${hskLabels}_TapViet.pdf` : 'ChineseWriter_TapViet_Custom.pdf';
      doc.save(filename);
      $('#pdf-status').classList.remove('hidden');
      $('#pdf-status').className = 'mt-4 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700';
      $('#pdf-status').innerHTML = `✅ Đã tạo PDF! File <strong>${filename}</strong> - ${charList.length} chữ Hán.`;
    } catch (err) {
      console.error('PDF error:', err);
      $('#pdf-status').classList.remove('hidden');
      $('#pdf-status').className = 'mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700';
      $('#pdf-status').innerHTML = `❌ Lỗi: ${err.message}`;
    }
  };

  // ===== START =====
  init();
})();
