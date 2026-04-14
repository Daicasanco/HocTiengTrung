// ===== ChineseWriter Web App - Multi-page SPA =====
(function () {
  'use strict';

  // --- Data ---
  let allWords = [];
  let characters = {};
  let radicals = {};
  let contextQuizData = []; // AI-generated context quiz sentences
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
    overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); history.back(); } };
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
    // Push modal state to history so Back button closes picker
    history.pushState({ page: _currentPage, modal: 'bookmark-picker' }, '');
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
    if (overlay) { overlay.remove(); history.back(); }
  };

  window.pickerCreateNew = function (hanzi) {
    const overlay = document.getElementById('bm-picker-overlay');
    if (overlay) { overlay.remove(); history.back(); }
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

  // Enhanced toast notification with animation
  function showToast(msg, type) {
    const old = document.getElementById('cw-toast');
    if (old) { old.classList.add('hiding'); setTimeout(() => old.remove(), 300); }
    const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
    const icon = icons[type] || '';
    const t = document.createElement('div');
    t.id = 'cw-toast';
    t.className = 'cw-toast fixed bottom-20 md:bottom-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white px-5 py-3 rounded-xl text-sm font-medium shadow-2xl z-[200] flex items-center gap-2 max-w-[90vw]';
    t.innerHTML = (icon ? `<span>${icon}</span>` : '') + `<span>${msg}</span>`;
    document.body.appendChild(t);
    setTimeout(() => { t.classList.add('hiding'); setTimeout(() => t.remove(), 300); }, 2500);
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

  // ===== PAGE ROUTING with History API =====
  let _currentPage = 'home';
  let _skipPushState = false; // Flag to avoid pushing state during popstate handling

  function _doShowPage(name) {
    // Fade out current page
    const currentEl = $(`.page.active`);
    if (currentEl) {
      currentEl.style.opacity = '0';
      setTimeout(() => currentEl.classList.remove('active'), 150);
    }
    // Fade in new page
    const el = $(`#page-${name}`);
    if (el) {
      setTimeout(() => {
        $$('.page').forEach(p => { if (p !== el) p.classList.remove('active'); });
        el.classList.add('active');
        // Force reflow then fade in
        el.offsetHeight;
        el.style.opacity = '1';
      }, currentEl ? 150 : 0);
    }
    window.scrollTo(0, 0);
    _currentPage = name;
    if (name === 'library' && allWords.length && !rendered) {
      applyFilters();
    }
    if (name === 'bookmarks') {
      renderBookmarksPage();
    }
    // Sync bottom tab bar
    _syncBottomTabs(name);
  }

  function _syncBottomTabs(pageName) {
    const tabs = document.querySelectorAll('#bottom-tab-bar .btab');
    tabs.forEach(tab => {
      const tabPage = tab.getAttribute('data-page');
      const isActive = tabPage === pageName || 
        (tabPage === 'library' && pageName === 'detail') ||
        (tabPage === 'bookmarks' && pageName === 'srs');
      tab.classList.toggle('active', isActive);
    });
  }

  window.showPage = function (name) {
    // Close any open modals first
    const radModal = document.getElementById('radical-modal-overlay');
    if (radModal) radModal.remove();
    const bmPicker = document.getElementById('bm-picker-overlay');
    if (bmPicker) bmPicker.remove();

    _doShowPage(name);

    // Push to browser history (unless we're handling popstate)
    if (!_skipPushState) {
      history.pushState({ page: name }, '', '#' + name);
    }
  };

  // Handle browser Back/Forward buttons
  window.addEventListener('popstate', function (e) {
    // First check if there's a modal open — close it instead of navigating
    const radModal = document.getElementById('radical-modal-overlay');
    if (radModal) { radModal.remove(); return; }
    const bmPicker = document.getElementById('bm-picker-overlay');
    if (bmPicker) { bmPicker.remove(); return; }
    const fcPdfModal = document.getElementById('fc-pdf-modal');
    if (fcPdfModal) { fcPdfModal.remove(); return; }

    // Navigate to the page from history state
    _skipPushState = true;
    if (e.state && e.state.page) {
      _doShowPage(e.state.page);
      // Trigger extra page logic (radicals, flashcard, quiz)
      if (e.state.page === 'radicals') renderRadicalsPage();
    } else {
      // No state = initial page (home), or parse from hash
      const hash = location.hash.replace('#', '') || 'home';
      _doShowPage(hash);
      if (hash === 'radicals') renderRadicalsPage();
    }
    _skipPushState = false;
  });

  // Set initial history state
  (function initHistory() {
    const hash = location.hash.replace('#', '');
    const initialPage = hash || 'home';
    history.replaceState({ page: initialPage }, '', '#' + initialPage);
  })();

  window.toggleMobileMenu = function () {
    const menu = $('#mobile-menu');
    const backdrop = $('#mobile-backdrop');
    if (menu.classList.contains('open')) {
      closeMobile();
    } else {
      menu.classList.remove('hidden');
      backdrop.classList.remove('hidden');
      requestAnimationFrame(() => {
        menu.classList.add('open');
        backdrop.classList.add('open');
      });
    }
  };

  window.closeMobile = function () {
    const menu = $('#mobile-menu');
    const backdrop = $('#mobile-backdrop');
    menu.classList.remove('open');
    backdrop.classList.remove('open');
    setTimeout(() => {
      menu.classList.add('hidden');
      backdrop.classList.add('hidden');
    }, 300);
  };

  // ===== DATA LOADING =====
  async function init() {
    try {
      const [wordsData, charsData, radicalsData, contextData] = await Promise.all([
        fetch('data/words.json').then(r => r.json()),
        fetch('data/characters.json').then(r => r.json()),
        fetch('data/radicals.json').then(r => r.json()).catch(() => ({})),
        fetch('data/context_quiz.json').then(r => r.json()).catch(() => [])
      ]);
      allWords = wordsData;
      characters = charsData;
      radicals = radicalsData;
      contextQuizData = contextData;
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

  // ===== AUDIO PLAYBACK (MP3 first, TTS fallback) =====
  let currentAudio = null;
  let speakId = 0;
  let audioManifest = null; // Set of available audio file keys

  // Load audio manifest (list of available MP3 files)
  async function loadAudioManifest() {
    try {
      const data = await fetch('sounds/manifest.json').then(r => r.json());
      audioManifest = new Set(data);
      console.log('[Audio] Manifest loaded:', audioManifest.size, 'files');
    } catch (e) {
      console.warn('[Audio] Manifest not found, will try loading MP3 directly');
      audioManifest = null;
    }
  }

  function speakText(text) {
    // Stop any currently playing audio/TTS
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();

    // If manifest loaded and this text is NOT in manifest, skip MP3 entirely
    if (audioManifest && !audioManifest.has(text)) {
      fallbackTTS(text);
      return;
    }

    const thisId = ++speakId;
    let resolved = false;

    // Try MP3: sounds/cmn-{hanzi}.mp3 with proper URL encoding
    const audioUrl = 'sounds/cmn-' + encodeURIComponent(text) + '.mp3';
    const audio = new Audio(audioUrl);
    currentAudio = audio;

    audio.oncanplaythrough = function () {
      if (resolved || thisId !== speakId) return;
      resolved = true;
      audio.play().catch(function () { if (thisId === speakId) fallbackTTS(text); });
    };
    audio.onerror = function () {
      if (resolved || thisId !== speakId) return;
      resolved = true;
      fallbackTTS(text);
    };
    // Timeout fallback - 8s for slow connections (GitHub Pages CDN)
    setTimeout(function () {
      if (resolved || thisId !== speakId) return;
      resolved = true;
      audio.pause();
      currentAudio = null;
      fallbackTTS(text);
    }, 8000);
  }

  function fallbackTTS(text) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; u.rate = 0.8;
    const v = speechSynthesis.getVoices().find(function (v) { return v.lang.startsWith('zh'); });
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
      const partsH = makeDecompClickable(c.decomp, c.radical);
      const radInfo = radicals[c.radical];
      const radClick = radInfo || characters[c.radical] ? `onclick="showRadicalModal('${(c.radical||'').replace(/'/g, "\\'")}')" class="cursor-pointer text-red-700 hover:underline"` : '';
      const radLabel = radInfo ? `${c.radical} ${radInfo.viet}` : (c.radical || '—');
      decompHtml += `<div class="flex items-center gap-3 mb-2"><span class="font-cn text-3xl font-bold text-hanzi">${c.char}</span><div class="text-sm"><span class="text-slate-400">Bộ thủ:</span> <strong ${radClick}>${radLabel}</strong> · <span class="text-slate-400">Nét:</span> <strong>${c.strokeCount}</strong></div></div>${c.decomp ? `<div class="flex flex-wrap gap-2 mb-2">${partsH}</div>` : ''}${c.def ? `<p class="text-sm text-slate-500">${c.def}</p>` : ''}`;
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
    showPage('stroke');
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
    // Decomposition parts - clickable
    const partsH = makeDecompClickable(c.decomp, c.radical);

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
            <div class="text-sm"><span class="text-slate-400">Bộ thủ:</span> <strong ${(radicals[c.radical] || characters[c.radical]) ? `onclick="showRadicalModal('${(c.radical||'').replace(/'/g, "\\'")}')" class="cursor-pointer text-red-700 hover:underline"` : ''}>${radicals[c.radical] ? `${c.radical} ${radicals[c.radical].viet}` : (c.radical || '—')}</strong></div>
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

  // ===== VISITOR COUNTER =====
  function initVisitorCounter() {
    const el = document.getElementById('stat-visitors');
    if (!el) return;

    // Use CountAPI alternative: counterapi.dev (free, no signup needed)
    // Namespace = your GitHub username, Key = your repo name
    // Change these when you deploy!
    const namespace = 'HigherVn';
    const key = 'visits';

    // Method 1: Use counterapi.dev (works on GitHub Pages)
    fetch(`https://api.counterapi.dev/v1/${namespace}/${key}/up`)
      .then(r => r.json())
      .then(data => {
        if (data && data.count !== undefined) {
          el.textContent = data.count.toLocaleString();
          el.classList.add('transition-all');
        }
      })
      .catch(() => {
        // Fallback: localStorage counter (works offline/local)
        const VISIT_KEY = 'cw_visit_count';
        const VISITED_KEY = 'cw_visited_today';
        const today = new Date().toDateString();
        let count = parseInt(localStorage.getItem(VISIT_KEY) || '0');
        
        if (localStorage.getItem(VISITED_KEY) !== today) {
          count++;
          localStorage.setItem(VISIT_KEY, count.toString());
          localStorage.setItem(VISITED_KEY, today);
        }
        el.textContent = count.toLocaleString();
      });
  }

  // ===== RADICAL MODAL (with Variants + 2-Tab Lookup) =====

  // --- Radical Variant Map (main radical → all forms including variants) ---
  const RADICAL_VARIANTS = {
    '心': ['心', '忄'],     '水': ['水', '氵'],     '手': ['手', '扌'],
    '火': ['火', '灬'],     '刀': ['刀', '刂'],     '人': ['人', '亻'],
    '犬': ['犬', '犭'],     '言': ['言', '讠'],     '金': ['金', '钅'],
    '食': ['食', '饣'],     '糸': ['糸', '纟'],     '衣': ['衣', '衤'],
    '示': ['示', '礻'],     '竹': ['竹', '⺮'],     '艸': ['艸', '艹'],
    '网': ['网', '罒'],     '阜': ['阜', '阝'],     '邑': ['邑', '阝'],
    '肉': ['肉', '⺼', '月'], '老': ['老', '耂'],   '辵': ['辵', '辶'],
    '門': ['門', '门'],     '車': ['車', '车'],     '馬': ['馬', '马'],
    '長': ['長', '长'],     '魚': ['魚', '鱼'],     '鳥': ['鳥', '鸟'],
    '貝': ['貝', '贝'],     '見': ['見', '见'],     '頁': ['頁', '页'],
    '風': ['風', '风'],     '飛': ['飛', '飞'],     '齒': ['齒', '齿'],
    '龍': ['龍', '龙'],     '龜': ['龜', '龟'],
  };

  // Build reverse lookup: variant → main radical key
  const _variantToMain = {};
  for (const [main, variants] of Object.entries(RADICAL_VARIANTS)) {
    for (const v of variants) {
      if (!_variantToMain[v]) _variantToMain[v] = [];
      _variantToMain[v].push(main);
    }
  }

  // Get all variant forms for a given radical (input can be main or variant)
  function getRadicalGroup(radical) {
    if (RADICAL_VARIANTS[radical]) return RADICAL_VARIANTS[radical];
    const mains = _variantToMain[radical];
    if (mains) {
      const all = new Set();
      for (const m of mains) {
        for (const v of RADICAL_VARIANTS[m]) all.add(v);
      }
      return [...all];
    }
    return [radical];
  }

  // --- Cache for performance (avoid re-scanning 11k+ items on tab switch) ---
  const _radicalCache = {};

  function getCharsByRadical(radical) {
    const key = 'chars_' + radical;
    if (_radicalCache[key]) return _radicalCache[key];
    const group = getRadicalGroup(radical);
    const groupSet = new Set(group);
    const result = [];
    for (const [ch, data] of Object.entries(characters)) {
      if (data.radical && groupSet.has(data.radical)) {
        result.push({ char: ch, ...data });
      }
    }
    result.sort((a, b) => (a.strokeCount || 99) - (b.strokeCount || 99));
    _radicalCache[key] = result;
    return result;
  }

  function getWordsByRadical(radical) {
    const key = 'words_' + radical;
    if (_radicalCache[key]) return _radicalCache[key];
    const group = getRadicalGroup(radical);
    const groupSet = new Set(group);
    const result = [];
    for (const w of allWords) {
      const chars = [...w.hanzi];
      let found = false;
      for (const ch of chars) {
        const cd = characters[ch];
        if (cd && cd.radical && groupSet.has(cd.radical)) { found = true; break; }
      }
      if (found) result.push(w);
    }
    _radicalCache[key] = result;
    return result;
  }

  // --- Decomp clickable helper ---
  function makeDecompClickable(decomp, radicalChar) {
    const parts = [...(decomp || '')];
    return parts.map(p => {
      const code = p.codePointAt(0);
      const isSt = code >= 0x2FF0 && code <= 0x2FFF;
      if (isSt) {
        return `<span class="inline-flex items-center justify-center w-10 h-10 rounded-lg font-cn text-lg bg-blue-50 border border-blue-200 text-primary text-sm">${p}</span>`;
      }
      const isRad = radicals[p];
      const isChar = characters[p];
      const clickable = isRad || isChar;
      const isRadicalOfChar = p === radicalChar;
      const bgClass = isRadicalOfChar
        ? 'bg-red-50 border-red-300 text-red-700 ring-2 ring-red-200'
        : 'bg-amber-50 border border-amber-200 text-hanzi';
      const cursorClass = clickable ? 'cursor-pointer hover:scale-110 hover:shadow-md active:scale-95' : '';
      const onclick = clickable ? `onclick="showRadicalModal('${p.replace(/'/g, "\\'")}')"` : '';
      const title = isRad ? `title="Bộ ${radicals[p].viet} - Click xem chi tiết"` : (isChar ? `title="Click xem chi tiết"` : '');
      return `<span class="inline-flex items-center justify-center w-10 h-10 rounded-lg font-cn text-lg ${bgClass} ${cursorClass} transition-all" ${onclick} ${title}>${p}</span>`;
    }).join('');
  }

  // --- Main modal with 2 Tabs ---
  let _modalTab = 'info'; // 'info' | 'chars' | 'words'

  window.showRadicalModal = function (char) {
    const old = document.getElementById('radical-modal-overlay');
    if (old) old.remove();

    const rad = radicals[char];
    const charData = characters[char];
    if (!rad && !charData) { showToast('Không có dữ liệu cho "' + char + '"'); return; }

    // Determine if this is a radical (has entry in radicals.json) → show tabs
    const isRadical = !!rad;
    const charsByRad = isRadical ? getCharsByRadical(char) : [];
    const wordsByRad = isRadical ? getWordsByRadical(char) : [];
    const variantGroup = isRadical ? getRadicalGroup(char) : [];

    _modalTab = 'info';

    function buildTabContent(tab) {
      if (tab === 'info') return buildInfoTab(char, rad, charData, variantGroup, charsByRad.length, wordsByRad.length);
      if (tab === 'chars') return buildCharsTab(charsByRad, char);
      if (tab === 'words') return buildWordsTab(wordsByRad);
      return '';
    }

    function render() {
      const overlay = document.getElementById('radical-modal-overlay');
      if (!overlay) return;
      const content = overlay.querySelector('.rm-content');
      if (content) content.innerHTML = buildTabContent(_modalTab);
      // Update tab buttons
      overlay.querySelectorAll('.rm-tab').forEach(btn => {
        const t = btn.dataset.tab;
        btn.classList.toggle('border-primary', t === _modalTab);
        btn.classList.toggle('text-primary', t === _modalTab);
        btn.classList.toggle('border-transparent', t !== _modalTab);
        btn.classList.toggle('text-slate-400', t !== _modalTab);
      });
    }

    // Build tab bar
    const tabBar = isRadical ? `
      <div class="flex border-b bg-white px-2 gap-1">
        <button class="rm-tab px-3 py-2 text-xs font-bold border-b-2 transition-colors" data-tab="info" onclick="_switchRadTab('info')">📕 Thông tin</button>
        <button class="rm-tab px-3 py-2 text-xs font-bold border-b-2 transition-colors" data-tab="chars" onclick="_switchRadTab('chars')">🀄 Chữ Hán <span class="text-[10px] opacity-60">(${charsByRad.length})</span></button>
        <button class="rm-tab px-3 py-2 text-xs font-bold border-b-2 transition-colors" data-tab="words" onclick="_switchRadTab('words')">📖 Từ vựng <span class="text-[10px] opacity-60">(${wordsByRad.length})</span></button>
      </div>` : '';

    const title = isRadical ? `📕 Bộ ${char} ${rad.viet}` : `📕 Chi tiết`;

    const overlay = document.createElement('div');
    overlay.id = 'radical-modal-overlay';
    overlay.className = 'fixed inset-0 bg-black/40 z-[150] flex items-center justify-center p-4';
    overlay.onclick = e => { if (e.target === overlay) closeRadicalModal(); };
    overlay.innerHTML = `
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col animate-in">
        <div class="flex items-center justify-between px-5 py-3 border-b bg-gradient-to-r from-red-50 to-amber-50">
          <h3 class="font-bold text-lg">${title}</h3>
          <button onclick="closeRadicalModal()" class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-black/10 transition-colors text-lg">✕</button>
        </div>
        ${tabBar}
        <div class="rm-content overflow-y-auto p-5 flex-1">${buildTabContent('info')}</div>
      </div>`;
    document.body.appendChild(overlay);

    // Push modal state to history so Back button closes modal
    history.pushState({ page: _currentPage, modal: 'radical' }, '');

    // Style
    if (!document.getElementById('radical-modal-style')) {
      const style = document.createElement('style');
      style.id = 'radical-modal-style';
      style.textContent = `.animate-in { animation: modalIn 0.2s ease-out; } @keyframes modalIn { from { opacity:0; transform: scale(0.95) translateY(10px); } to { opacity:1; transform: scale(1) translateY(0); } }`;
      document.head.appendChild(style);
    }

    // Set initial tab active
    render();

    // Expose tab switch
    window._switchRadTab = function (tab) {
      _modalTab = tab;
      render();
    };
  };

  // --- Tab 1: Info ---
  function buildInfoTab(char, rad, charData, variantGroup, charsCount, wordsCount) {
    let html = '';
    // Header
    html += `<div class="text-center mb-4">`;
    html += `<div class="font-cn text-6xl font-bold text-hanzi mb-2">${char}</div>`;
    if (rad) {
      html += `<div class="text-primary font-medium text-lg">${rad.pinyin}</div>`;
      html += `<div class="text-sm text-slate-500 mt-1">Bộ thủ #${rad.num} · ${rad.strokes} nét</div>`;
      if (charsCount || wordsCount) {
        html += `<div class="text-xs text-slate-400 mt-1">${charsCount} chữ Hán · ${wordsCount} từ vựng HSK</div>`;
      }
    }
    html += `</div>`;

    // Radical info
    if (rad) {
      html += `<div class="bg-gradient-to-r from-red-50 to-amber-50 rounded-xl p-4 mb-3 border border-red-100">`;
      html += `<h4 class="text-sm font-bold text-red-600 mb-2">📕 Thông tin Bộ thủ</h4>`;
      html += `<div class="grid grid-cols-2 gap-2 text-sm">`;
      html += `<div><span class="text-slate-400">Âm Hán Việt:</span> <strong class="text-red-700">${rad.viet}</strong></div>`;
      html += `<div><span class="text-slate-400">Pinyin:</span> <strong>${rad.pinyin}</strong></div>`;
      html += `<div><span class="text-slate-400">Nghĩa EN:</span> <strong>${rad.meaning}</strong></div>`;
      html += `<div><span class="text-slate-400">Số nét:</span> <strong>${rad.strokes}</strong></div>`;
      html += `</div>`;
      // Variants
      if (variantGroup.length > 1) {
        html += `<div class="mt-3"><span class="text-xs font-bold text-slate-500 uppercase tracking-wide">Các biến thể:</span>`;
        html += `<div class="flex flex-wrap gap-2 mt-1.5">`;
        for (const v of variantGroup) {
          const vRad = radicals[v];
          const label = vRad ? vRad.meaning : '';
          html += `<span class="inline-flex items-center gap-1 bg-white border border-red-200 rounded-lg px-2.5 py-1.5">`;
          html += `<span class="font-cn text-xl font-bold text-red-700">${v}</span>`;
          if (label) html += `<span class="text-xs text-slate-400">${label}</span>`;
          html += `</span>`;
        }
        html += `</div>`;
        // Special note for 阝
        if (variantGroup.includes('阝')) {
          html += `<p class="text-xs text-amber-600 mt-2 italic">⚠️ 阝 bên trái = bộ Phụ 阜 (đồi núi), bên phải = bộ Ấp 邑 (thành phố)</p>`;
        }
        // Special note for 月/肉
        if (variantGroup.includes('⺼') || variantGroup.includes('月')) {
          html += `<p class="text-xs text-amber-600 mt-2 italic">⚠️ Khi ở bên trái/dưới, 月 thường là biến thể của bộ Nhục 肉, không phải bộ Nguyệt 月</p>`;
        }
        html += `</div>`;
      }
      // Examples
      if (rad.examples) {
        const exChars = [...rad.examples];
        html += `<div class="mt-3"><span class="text-xs font-bold text-slate-500 uppercase tracking-wide">Ví dụ:</span>`;
        html += `<div class="flex flex-wrap gap-1.5 mt-1.5">`;
        for (const ex of exChars) {
          const exWord = allWords.find(w => w.hanzi === ex);
          const viTip = exWord ? (exWord.vietnamese || exWord.english || '').split(/[;；]/)[0].trim() : '';
          const hasData = characters[ex];
          html += `<span class="inline-flex items-center gap-1 bg-white border rounded-lg px-2 py-1 ${hasData ? 'cursor-pointer hover:bg-blue-50 hover:border-primary' : ''} transition-colors" ${hasData ? `onclick="closeRadicalModal();strokeQuick('${ex}')"` : ''}>`;
          html += `<span class="font-cn text-lg font-bold text-hanzi">${ex}</span>`;
          if (viTip) html += `<span class="text-xs text-slate-400 max-w-[80px] truncate">${viTip}</span>`;
          html += `</span>`;
        }
        html += `</div></div>`;
      }
      // PDF export button
      if (charsCount > 0) {
        const charEscR = char.replace(/'/g, "\\'");
        html += `<button onclick="exportRadicalPdf('${charEscR}')" class="w-full mt-3 py-2.5 text-sm font-medium text-red-700 border-2 border-red-200 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2">📄 Xuất PDF luyện viết (${charsCount} chữ)</button>`;
      }
      html += `</div>`;
    }

    // Character data (if it's a single char, not just a radical)
    if (charData) {
      html += `<div class="bg-white rounded-xl border p-4 mb-3">`;
      html += `<h4 class="text-sm font-bold text-primary mb-2">✏️ Thông tin chữ</h4>`;
      if (charData.def) html += `<p class="text-sm text-slate-600 mb-2"><span class="text-slate-400">Nghĩa:</span> ${charData.def}</p>`;
      const wordMatch = allWords.find(w => w.hanzi === char);
      if (wordMatch && wordMatch.vietnamese) {
        const viDefs = [...new Set(wordMatch.vietnamese.split(/[;；]/).map(s => s.trim()).filter(Boolean))];
        html += `<div class="mb-2"><span class="text-xs font-bold text-red-500">🇻🇳 Tiếng Việt:</span>`;
        html += viDefs.slice(0, 5).map((d, i) => `<span class="text-sm text-slate-700 ml-1">${i > 0 ? '· ' : ''}${d}</span>`).join('');
        html += `</div>`;
      }
      html += `<div class="text-sm"><span class="text-slate-400">Số nét:</span> <strong>${charData.strokeCount}</strong>`;
      if (charData.radical) html += ` · <span class="text-slate-400">Bộ:</span> <strong>${charData.radical}</strong>`;
      html += `</div>`;
      if (charData.decomp) {
        html += `<div class="mt-2"><span class="text-xs font-bold text-primary uppercase tracking-wide">Phân tách:</span>`;
        html += `<div class="flex flex-wrap gap-2 mt-1.5">${makeDecompClickable(charData.decomp, charData.radical)}</div></div>`;
      }
      if (charData.etymology) {
        try {
          const ety = typeof charData.etymology === 'string' ? JSON.parse(charData.etymology) : charData.etymology;
          if (ety.hint) html += `<div class="mt-2 text-xs text-slate-500 italic">💡 ${ety.hint}</div>`;
        } catch (e) {}
      }
      html += `</div>`;
      const charEsc = char.replace(/'/g, "\\'");
      html += `<div class="flex gap-2">`;
      html += `<button onclick="closeRadicalModal();strokeQuick('${charEsc}')" class="flex-1 py-2.5 text-sm font-medium text-primary border-2 border-primary rounded-lg hover:bg-blue-50 transition-colors">✏️ Xem bút thuận</button>`;
      html += `<button onclick="speakWord('${charEsc}')" class="px-4 py-2.5 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">🔊</button>`;
      html += `</div>`;
    }
    return html;
  }

  // --- Tab 2: Chữ Hán (sorted by stroke count) ---
  function buildCharsTab(charsList, radicalChar) {
    if (!charsList.length) return '<p class="text-center text-slate-400 py-8">Không tìm thấy chữ Hán nào</p>';
    // Group by stroke count
    const groups = {};
    for (const c of charsList) {
      const sc = c.strokeCount || 0;
      if (!groups[sc]) groups[sc] = [];
      groups[sc].push(c);
    }
    const sortedKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);
    let html = `<div class="text-xs text-slate-400 mb-3">${charsList.length} chữ Hán thuộc bộ này, sắp xếp theo số nét</div>`;
    for (const sc of sortedKeys) {
      html += `<div class="mb-3">`;
      html += `<div class="text-xs font-bold text-slate-500 mb-1.5 sticky top-0 bg-white py-1">${sc} nét <span class="text-slate-300">(${groups[sc].length})</span></div>`;
      html += `<div class="flex flex-wrap gap-1.5">`;
      for (const c of groups[sc]) {
        const w = allWords.find(x => x.hanzi === c.char);
        const vi = w ? (w.vietnamese || w.english || '').split(/[;；]/)[0].trim() : (c.def || '');
        const viShort = vi.length > 12 ? vi.substring(0, 11) + '…' : vi;
        const charEsc = c.char.replace(/'/g, "\\'");
        html += `<span class="inline-flex items-center gap-1 bg-white border rounded-lg px-2 py-1.5 cursor-pointer hover:bg-blue-50 hover:border-primary hover:shadow-sm transition-all group/ch" onclick="closeRadicalModal();strokeQuick('${charEsc}')">`;
        html += `<span class="font-cn text-xl font-bold text-hanzi group-hover/ch:text-primary transition-colors">${c.char}</span>`;
        if (viShort) html += `<span class="text-[10px] text-slate-400 max-w-[70px] truncate leading-tight">${viShort}</span>`;
        html += `</span>`;
      }
      html += `</div></div>`;
    }
    return html;
  }

  // --- Tab 3: Từ Vựng HSK ---
  function buildWordsTab(wordsList) {
    if (!wordsList.length) return '<p class="text-center text-slate-400 py-8">Không tìm thấy từ vựng HSK nào</p>';
    // Sort by HSK level then pinyin
    const sorted = [...wordsList].sort((a, b) => (a.hsk - b.hsk) || (a.pinyin || '').localeCompare(b.pinyin || ''));
    // Group by HSK
    const groups = {};
    for (const w of sorted) {
      const lv = w.hsk || 0;
      if (!groups[lv]) groups[lv] = [];
      groups[lv].push(w);
    }
    const sortedKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);
    let html = `<div class="text-xs text-slate-400 mb-3">${wordsList.length} từ vựng HSK chứa bộ này</div>`;
    for (const lv of sortedKeys) {
      html += `<div class="mb-3">`;
      html += `<div class="text-xs font-bold text-amber-600 mb-1.5 sticky top-0 bg-white py-1">HSK ${lv} <span class="text-slate-300">(${groups[lv].length} từ)</span></div>`;
      html += `<div class="divide-y">`;
      for (const w of groups[lv]) {
        const vi = (w.vietnamese || '').split(/[;；]/)[0].trim();
        const en = (w.english || '').split(/[;；]/)[0].trim();
        const def = vi || en;
        const hanziEsc = w.hanzi.replace(/'/g, "\\'");
        html += `<div class="flex items-center gap-3 py-2 cursor-pointer hover:bg-blue-50 rounded-lg px-1 transition-colors" onclick="closeRadicalModal();openDetailByHanzi('${hanziEsc}')">`;
        html += `<span class="font-cn text-xl font-bold text-hanzi min-w-[50px]">${w.hanzi}</span>`;
        html += `<div class="flex-1 min-w-0">`;
        html += `<div class="text-xs text-primary font-medium">${w.pinyin || ''}</div>`;
        if (def) html += `<div class="text-xs text-slate-500 truncate">${def}</div>`;
        html += `</div>`;
        html += `<span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 flex-shrink-0">HSK${w.hsk}</span>`;
        html += `<button onclick="event.stopPropagation();speakWord('${hanziEsc}')" class="w-7 h-7 rounded-lg flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-colors flex-shrink-0">🔊</button>`;
        html += `</div>`;
      }
      html += `</div></div>`;
    }
    return html;
  }

  window.closeRadicalModal = function () {
    const el = document.getElementById('radical-modal-overlay');
    if (el) { el.remove(); history.back(); }
  };

  // ===== RADICALS PAGE =====
  let radStrokeFilter = 0;

  function renderRadicalsPage() {
    const grid = $('#rad-grid');
    const chips = $('#rad-stroke-chips');
    const countEl = $('#rad-count');
    if (!grid || !Object.keys(radicals).length) return;

    // Build stroke groups
    const strokeGroups = {};
    for (const [ch, r] of Object.entries(radicals)) {
      const s = r.strokes || 0;
      if (!strokeGroups[s]) strokeGroups[s] = [];
      strokeGroups[s].push({ char: ch, ...r });
    }
    const strokeKeys = Object.keys(strokeGroups).map(Number).sort((a, b) => a - b);

    // Chips
    let chipsH = `<button class="hsk-chip ${radStrokeFilter === 0 ? 'active' : ''}" onclick="filterRadStroke(0)">Tất cả</button>`;
    for (const s of strokeKeys) {
      chipsH += `<button class="hsk-chip ${radStrokeFilter === s ? 'active' : ''}" onclick="filterRadStroke(${s})">${s} nét <span class="text-xs opacity-60">(${strokeGroups[s].length})</span></button>`;
    }
    chips.innerHTML = chipsH;

    // Filter
    const q = ($('#rad-search')?.value || '').trim().toLowerCase();
    let items = [];
    const keys = radStrokeFilter > 0 ? [radStrokeFilter] : strokeKeys;
    for (const s of keys) {
      if (!strokeGroups[s]) continue;
      for (const r of strokeGroups[s]) items.push(r);
    }
    if (q) {
      items = items.filter(r =>
        r.char.includes(q) ||
        (r.viet || '').toLowerCase().includes(q) ||
        (r.meaning || '').toLowerCase().includes(q) ||
        (r.pinyin || '').toLowerCase().includes(q)
      );
    }
    countEl.textContent = items.length + ' bộ';

    // Grid
    grid.innerHTML = items.map(r => {
      const charsCount = getCharsByRadical(r.char).length;
      return `<div class="bg-white border-2 rounded-xl p-3 text-center cursor-pointer hover:border-primary hover:shadow-md transition-all group" onclick="showRadicalModal('${r.char.replace(/'/g, "\\'")}')">
        <div class="font-cn text-3xl font-bold text-hanzi group-hover:text-primary transition-colors">${r.char}</div>
        <div class="text-[10px] text-slate-500 mt-1 truncate">${r.viet}</div>
        <div class="text-[10px] text-slate-400">${r.strokes}画 · ${charsCount}字</div>
      </div>`;
    }).join('');
  }

  window.filterRadStroke = function (s) {
    radStrokeFilter = s;
    renderRadicalsPage();
  };

  window.filterRadicalsPage = function () {
    renderRadicalsPage();
  };

  // Export PDF by radical
  window.exportRadicalPdf = function (radical) {
    const chars = getCharsByRadical(radical);
    if (!chars.length) { showToast('Không có chữ Hán nào'); return; }
    closeRadicalModal();
    showPage('pdf');
    setPdfMode('custom');
    const input = $('#pdf-custom-input');
    if (input) input.value = chars.map(c => c.char).join(', ');
    const radInfo = radicals[radical];
    const name = radInfo ? radInfo.viet : radical;
    showToast(`Đã điền ${chars.length} chữ thuộc bộ "${name}" vào trang PDF`);
  };

  // ===== FLASHCARD SYSTEM =====
  const FC_STATS_KEY = 'cw_fc_stats';
  const FC_SESSIONS_KEY = 'cw_fc_sessions';
  let fcSource = 'hsk';
  let fcMode = 'review';
  let fcDeck = [];
  let fcIdx = 0;
  let fcFlipped = false;
  let fcTimerStart = 0;
  let fcTimerId = null;
  let fcBoxes = { 1: [], 2: [], 3: [] };
  let fcQueue = [];
  let fcCorrect = 0;
  let fcWrong = 0;
  let fcReviewed = 0;
  let fcTotalCards = 0;
  let fcWrongList = [];
  let fcCorrectSet = new Set(); // Track unique correct cards

  function fcLoadStats() { try { return JSON.parse(localStorage.getItem(FC_STATS_KEY) || '{}'); } catch(e) { return {}; } }
  function fcSaveStats(s) { localStorage.setItem(FC_STATS_KEY, JSON.stringify(s)); }
  function fcLoadSessions() { try { return JSON.parse(localStorage.getItem(FC_SESSIONS_KEY) || '[]'); } catch(e) { return []; } }
  function fcSaveSessions(s) { localStorage.setItem(FC_SESSIONS_KEY, JSON.stringify(s)); }

  window.fcSelectSource = function(src) {
    fcSource = src;
    document.querySelectorAll('.fc-src-btn').forEach(b => {
      b.classList.toggle('border-primary', b.dataset.src === src);
      b.classList.toggle('bg-blue-50', b.dataset.src === src);
    });
    const optsEl = $('#fc-source-options');
    optsEl.classList.remove('hidden');
    let html = '';
    if (src === 'hsk') {
      const levels = [...new Set(allWords.map(w => w.hsk))].sort((a,b)=>a-b);
      html = '<div class="bg-slate-50 rounded-xl p-4"><p class="text-xs text-slate-500 mb-2">Chọn cấp HSK:</p><div class="flex flex-wrap gap-2 mb-3">';
      for (const lv of levels) {
        const cnt = allWords.filter(w=>w.hsk===lv).length;
        html += `<label class="flex items-center gap-1.5 bg-white border-2 rounded-lg px-3 py-2 cursor-pointer hover:border-primary transition-colors"><input type="checkbox" class="fc-hsk-cb accent-primary" value="${lv}" ${lv<=2?'checked':''}><span class="text-sm font-medium">HSK ${lv}</span><span class="text-[10px] text-slate-400">(${cnt})</span></label>`;
      }
      html += '</div><div class="flex items-center gap-3"><label class="text-xs text-slate-500">Giới hạn:</label><input type="number" id="fc-hsk-limit" value="30" min="5" max="500" class="w-20 px-2 py-1 border rounded-lg text-sm"></div></div>';
    } else if (src === 'bookmark') {
      const sets = loadBookmarks();
      if (!sets.length) {
        html = '<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">⚠️ Chưa có bộ bookmark nào. Hãy tạo bộ từ vựng trong <a href="#" onclick="showPage(\'bookmarks\')" class="underline font-medium">Hồ sơ học</a> trước.</div>';
      } else {
        html = '<div class="bg-slate-50 rounded-xl p-4"><p class="text-xs text-slate-500 mb-2">Chọn bộ từ vựng:</p><div class="space-y-2">';
        for (const s of sets) {
          html += `<label class="flex items-center gap-2 bg-white border-2 rounded-lg px-3 py-2 cursor-pointer hover:border-primary transition-colors"><input type="radio" name="fc-bm-set" class="accent-primary" value="${s.id}" ${s.id===sets[0].id?'checked':''}><span class="text-sm font-medium">${s.name}</span><span class="text-[10px] text-slate-400">(${s.words.length} từ)</span></label>`;
        }
        html += '</div></div>';
      }
    } else if (src === 'radical') {
      const radKeys = Object.keys(radicals);
      html = '<div class="bg-slate-50 rounded-xl p-4"><p class="text-xs text-slate-500 mb-2">Chọn bộ thủ:</p><div class="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto mb-3">';
      for (const rk of radKeys) {
        const r = radicals[rk];
        html += `<label class="inline-flex items-center gap-1 bg-white border rounded-lg px-2 py-1 cursor-pointer hover:border-primary transition-colors"><input type="radio" name="fc-rad" class="accent-primary" value="${rk}" onchange="fcRadicalChanged()"><span class="font-cn text-lg">${rk}</span><span class="text-[10px] text-slate-400">${r.viet}</span></label>`;
      }
      html += '</div>';
      // Selection mode & random count
      html += '<div class="border-t pt-3 mt-2 space-y-3">';
      html += '<div class="flex items-center gap-3"><label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="fc-rad-mode" value="all" class="accent-primary" checked onchange="fcRadicalChanged()"><span class="text-sm">Tất cả từ</span></label>';
      html += '<label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="fc-rad-mode" value="random" class="accent-primary" onchange="fcRadicalChanged()"><span class="text-sm">Random</span></label>';
      html += '<label class="flex items-center gap-1.5 cursor-pointer"><input type="radio" name="fc-rad-mode" value="pick" class="accent-primary" onchange="fcRadicalChanged()"><span class="text-sm">Chọn từ</span></label></div>';
      html += '<div id="fc-rad-random-opts" class="hidden flex items-center gap-2"><label class="text-xs text-slate-500">Số lượng:</label><input type="number" id="fc-rad-random-count" value="10" min="1" max="500" class="w-20 px-2 py-1 border rounded-lg text-sm"></div>';
      html += '<div id="fc-rad-pick-list" class="hidden max-h-48 overflow-y-auto border rounded-lg bg-white p-2"></div>';
      html += '</div></div>';
    } else if (src === 'custom') {
      html = '<div class="bg-slate-50 rounded-xl p-4"><p class="text-xs text-slate-500 mb-2">Nhập từ vựng (phẩy hoặc xuống dòng):</p><textarea id="fc-custom-input" rows="3" class="w-full px-3 py-2 border rounded-lg text-sm font-cn" placeholder="你好, 谢谢, 学习"></textarea></div>';
    }
    optsEl.innerHTML = html;
    setTimeout(fcUpdateStartInfo, 50);
    optsEl.addEventListener('change', () => setTimeout(fcUpdateStartInfo, 50));
  };

  // Handle radical mode change (all/random/pick)
  window.fcRadicalChanged = function() {
    const sel = document.querySelector('input[name="fc-rad"]:checked');
    const modeEl = document.querySelector('input[name="fc-rad-mode"]:checked');
    const mode = modeEl ? modeEl.value : 'all';
    const randomOpts = document.getElementById('fc-rad-random-opts');
    const pickList = document.getElementById('fc-rad-pick-list');
    if (randomOpts) randomOpts.classList.toggle('hidden', mode !== 'random');
    if (pickList) pickList.classList.toggle('hidden', mode !== 'pick');
    // Build pick list when "pick" mode selected and a radical is chosen
    if (mode === 'pick' && sel && pickList) {
      const words = getWordsByRadical(sel.value);
      if (!words.length) {
        pickList.innerHTML = '<p class="text-xs text-slate-400 py-2">Không có từ nào</p>';
      } else {
        let h = '<div class="flex items-center justify-between mb-2"><span class="text-xs text-slate-500">' + words.length + ' từ</span>';
        h += '<button onclick="fcRadPickToggleAll()" class="text-xs text-primary font-medium hover:underline">Chọn/Bỏ tất cả</button></div>';
        h += '<div class="flex flex-wrap gap-1.5">';
        for (const w of words) {
          const vi = (w.vietnamese || '').split(/[;；]/)[0].trim();
          const esc = w.hanzi.replace(/'/g, "\\'");
          h += '<label class="inline-flex items-center gap-1 bg-slate-50 border rounded-lg px-2 py-1 cursor-pointer hover:border-primary transition-colors">';
          h += '<input type="checkbox" class="fc-rad-pick-cb accent-primary" value="' + esc + '" checked>';
          h += '<span class="font-cn text-base">' + w.hanzi + '</span>';
          if (vi) h += '<span class="text-[10px] text-slate-400 max-w-[60px] truncate">' + vi + '</span>';
          h += '</label>';
        }
        h += '</div>';
        pickList.innerHTML = h;
      }
    }
    setTimeout(fcUpdateStartInfo, 50);
  };

  window.fcRadPickToggleAll = function() {
    const cbs = document.querySelectorAll('.fc-rad-pick-cb');
    const allChecked = [...cbs].every(c => c.checked);
    cbs.forEach(c => c.checked = !allChecked);
    setTimeout(fcUpdateStartInfo, 50);
  };

  window.fcSelectMode = function(mode) {
    fcMode = mode;
    document.querySelectorAll('.fc-mode-btn').forEach(b => {
      b.classList.toggle('border-primary', b.dataset.mode === mode);
      b.classList.toggle('bg-blue-50', b.dataset.mode === mode);
    });
  };

  function fcGetWordsFromSource() {
    let words = [];
    if (fcSource === 'hsk') {
      const checked = [...document.querySelectorAll('.fc-hsk-cb:checked')].map(c => parseInt(c.value));
      if (!checked.length) return [];
      const limit = parseInt($('#fc-hsk-limit')?.value) || 30;
      for (const lv of checked) { words = words.concat(allWords.filter(w => w.hsk === lv).slice(0, limit)); }
    } else if (fcSource === 'bookmark') {
      const sel = document.querySelector('input[name="fc-bm-set"]:checked');
      if (!sel) return [];
      const sets = loadBookmarks();
      const s = sets.find(x => x.id === sel.value);
      if (!s) return [];
      words = s.words.map(h => allWords.find(w => w.hanzi === h)).filter(Boolean);
    } else if (fcSource === 'radical') {
      const sel = document.querySelector('input[name="fc-rad"]:checked');
      if (!sel) return [];
      const radModeEl = document.querySelector('input[name="fc-rad-mode"]:checked');
      const radMode = radModeEl ? radModeEl.value : 'all';
      if (radMode === 'pick') {
        // Only selected words
        const checked = [...document.querySelectorAll('.fc-rad-pick-cb:checked')].map(c => c.value);
        for (const h of checked) {
          const found = allWords.find(w => w.hanzi === h);
          if (found) words.push(found);
        }
      } else {
        words = getWordsByRadical(sel.value);
        if (radMode === 'random') {
          const count = parseInt($('#fc-rad-random-count')?.value) || 10;
          // Shuffle then slice
          for (let i = words.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [words[i], words[j]] = [words[j], words[i]]; }
          words = words.slice(0, count);
        }
      }
    } else if (fcSource === 'custom') {
      const raw = ($('#fc-custom-input')?.value || '').trim();
      if (!raw) return [];
      const tokens = raw.split(/[,，\n\r]+/).map(s => s.trim()).filter(Boolean);
      for (const tok of tokens) {
        const found = allWords.find(w => w.hanzi === tok);
        words.push(found || { hanzi: tok, pinyin: '', vietnamese: '', english: '', hsk: 0 });
      }
    }
    return words;
  }

  function fcUpdateStartInfo() {
    const words = fcGetWordsFromSource();
    const btn = $('#fc-start-btn');
    const info = $('#fc-start-info');
    if (words.length > 0) { btn.disabled = false; info.innerHTML = `📊 <strong>${words.length}</strong> từ sẽ được ôn tập`; }
    else { btn.disabled = true; info.innerHTML = '⚠️ Chưa chọn nguồn từ vựng hoặc không có từ nào'; }
  }

  window.fcStart = function() {
    let words = fcGetWordsFromSource();
    if (!words.length) return;
    if ($('#fc-shuffle')?.checked) { for (let i = words.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [words[i],words[j]]=[words[j],words[i]]; } }
    fcDeck = words; fcIdx = 0; fcFlipped = false; fcCorrect = 0; fcWrong = 0; fcReviewed = 0; fcWrongList = []; fcTotalCards = words.length; fcCorrectSet = new Set();
    fcBoxes = { 1: words.map(w => ({ word: w, wrongCount: 0 })), 2: [], 3: [] };
    fcQueue = [...fcBoxes[1]];
    $('#fc-setup').classList.add('hidden'); $('#fc-play').classList.remove('hidden'); $('#fc-result').classList.add('hidden');
    $('#fc-progress-total').textContent = fcTotalCards;
    if (fcMode === 'browse') { $('#fc-ctrl-browse').classList.remove('hidden'); $('#fc-ctrl-review').classList.add('hidden'); $('#fc-boxes').classList.add('hidden'); }
    else { $('#fc-ctrl-browse').classList.add('hidden'); $('#fc-ctrl-review').classList.remove('hidden'); $('#fc-boxes').classList.remove('hidden'); }
    fcTimerStart = Date.now(); if (fcTimerId) clearInterval(fcTimerId); fcTimerId = setInterval(fcUpdateTimer, 1000);
    if (fcMode === 'browse') fcRenderCard(fcDeck[0]); else fcNextReviewCard();
    fcUpdateProgress(); fcUpdateBoxCounts(); fcSetupSwipe();
  };

  function fcUpdateTimer() {
    const elapsed = Math.floor((Date.now() - fcTimerStart) / 1000);
    const el = $('#fc-timer');
    if (el) el.textContent = Math.floor(elapsed/60) + ':' + (elapsed%60 < 10 ? '0' : '') + (elapsed%60);
  }

  function fcUpdateProgress() {
    if (fcMode === 'browse') {
      const cur = fcIdx + 1;
      $('#fc-progress-cur').textContent = cur;
      $('#fc-progress-bar').style.width = Math.round((cur / fcTotalCards) * 100) + '%';
    } else {
      // Review mode: show unique cards that have been seen at least once
      const seenSet = new Set([...fcCorrectSet]);
      for (const w of fcWrongList) seenSet.add(w.hanzi);
      const seen = Math.min(seenSet.size, fcTotalCards);
      $('#fc-progress-cur').textContent = seen;
      $('#fc-progress-bar').style.width = Math.min(Math.round((seen / fcTotalCards) * 100), 100) + '%';
    }
  }

  function fcUpdateBoxCounts() {
    if (fcMode !== 'review') return;
    $('#fc-box1').textContent = fcBoxes[1].length;
    $('#fc-box2').textContent = fcBoxes[2].length;
    $('#fc-box3').textContent = fcBoxes[3].length;
  }

  function fcRenderCard(w) {
    if (!w) return;
    fcFlipped = false;
    $('#fc-card').style.transform = '';
    const reverse = $('#fc-reverse')?.checked;
    const hidePinyin = $('#fc-hide-pinyin')?.checked;
    const vi = (w.vietnamese || '').split(/[;；]/).map(s=>s.trim()).filter(Boolean);
    const en = (w.english || '').split(/[;；]/).map(s=>s.trim()).filter(Boolean);
    const viFirst = vi[0] || en[0] || '';
    let frontH = '', backH = '';
    if (!reverse) {
      frontH = `<div class="font-cn text-6xl font-bold text-hanzi mb-4">${w.hanzi}</div>`;
      if (!hidePinyin && w.pinyin) frontH += `<div class="text-lg text-primary font-medium">${w.pinyin}</div>`;
      if (w.hsk) frontH += `<div class="mt-2 text-xs text-amber-600 font-bold">HSK ${w.hsk}</div>`;
      backH = `<div class="font-cn text-4xl font-bold text-hanzi mb-2">${w.hanzi}</div><div class="text-sm text-primary font-medium mb-3">${w.pinyin||''}</div>`;
      if (vi.length) { backH += `<div class="mb-2"><div class="text-xs font-bold text-red-500 mb-1">🇻🇳 Tiếng Việt</div>${vi.map((d,i)=>`<p class="text-sm">${i+1}. ${d}</p>`).join('')}</div>`; }
      if (en.length) { backH += `<div class="mb-2"><div class="text-xs font-bold text-blue-500 mb-1">🇬🇧 English</div>${en.map((d,i)=>`<p class="text-sm">${i+1}. ${d}</p>`).join('')}</div>`; }
    } else {
      frontH = `<div class="text-2xl font-bold text-slate-700 mb-3">${viFirst||'—'}</div>`;
      if (w.pinyin) frontH += `<div class="text-sm text-primary">${w.pinyin}</div>`;
      frontH += `<div class="text-xs text-slate-400 mt-2">Chữ Hán là gì?</div>`;
      backH = `<div class="font-cn text-6xl font-bold text-hanzi mb-3">${w.hanzi}</div><div class="text-lg text-primary font-medium mb-2">${w.pinyin||''}</div>`;
      if (vi.length) backH += `<div class="text-sm text-slate-600">${vi.join('; ')}</div>`;
    }
    const cd = characters[w.hanzi];
    if (cd && cd.decomp) backH += `<div class="mt-3 pt-2 border-t text-xs text-slate-400">🧩 ${cd.decomp} · ${cd.strokeCount||'?'} nét</div>`;
    if (w.hsk) backH += `<div class="mt-1 text-xs text-amber-600 font-bold">HSK ${w.hsk}</div>`;
    $('#fc-front-content').innerHTML = frontH;
    $('#fc-back-content').innerHTML = backH;
    const frontEl = $('#fc-front'), backEl = $('#fc-back');
    frontEl.style.minHeight = ''; backEl.style.minHeight = '';
    setTimeout(() => { const h = Math.max(frontEl.offsetHeight, backEl.offsetHeight, 280); frontEl.style.minHeight = h+'px'; backEl.style.minHeight = h+'px'; }, 10);
  }

  window.fcFlip = function() { fcFlipped = !fcFlipped; $('#fc-card').style.transform = fcFlipped ? 'rotateY(180deg)' : ''; };
  window.fcPrev = function() { if (fcIdx > 0) { fcIdx--; fcRenderCard(fcDeck[fcIdx]); fcUpdateProgress(); } };
  window.fcNext = function() { if (fcIdx < fcDeck.length-1) { fcIdx++; fcRenderCard(fcDeck[fcIdx]); fcUpdateProgress(); } else fcShowResult(); };

  function fcNextReviewCard() {
    if (fcQueue.length === 0) {
      if (fcBoxes[1].length) fcQueue = [...fcBoxes[1]];
      else if (fcBoxes[2].length) fcQueue = [...fcBoxes[2]];
      else { fcShowResult(); return; }
    }
    const entry = fcQueue.shift();
    fcRenderCard(entry.word); fcUpdateProgress(); fcUpdateBoxCounts();
    window._fcCurrentEntry = entry;
  }

  window.fcAnswer = function(correct) {
    const entry = window._fcCurrentEntry; if (!entry) return;
    fcReviewed++;
    // Update SRS for this word
    updateSrs(entry.word.hanzi, correct);
    const stats = fcLoadStats();
    const key = entry.word.hanzi;
    if (!stats[key]) stats[key] = { correct: 0, wrong: 0, lastReview: '' };
    stats[key].lastReview = new Date().toISOString();
    if (correct) {
      fcCorrect++; fcCorrectSet.add(key); stats[key].correct++;
      const curBox = fcFindBox(entry); fcRemoveFromBox(entry, curBox);
      if (curBox < 3) fcBoxes[curBox+1].push(entry);
    } else {
      fcWrong++; stats[key].wrong++; entry.wrongCount++;
      if (!fcWrongList.includes(entry.word)) fcWrongList.push(entry.word);
      const curBox = fcFindBox(entry);
      if (curBox > 1) { fcRemoveFromBox(entry, curBox); fcBoxes[1].push(entry); }
      fcQueue.push(entry);
    }
    fcSaveStats(stats); fcUpdateBoxCounts();
    if (fcBoxes[1].length === 0 && fcBoxes[2].length === 0) { fcShowResult(); }
    else {
      if (fcBoxes[2].length && fcReviewed % 3 === 0) fcQueue.unshift(fcBoxes[2][0]);
      fcNextReviewCard();
    }
  };

  function fcFindBox(entry) { for (let b=1;b<=3;b++) { if (fcBoxes[b].includes(entry)) return b; } return 1; }
  function fcRemoveFromBox(entry, box) { fcBoxes[box] = fcBoxes[box].filter(e => e !== entry); }

  window.fcSpeak = function() {
    const w = fcMode === 'browse' ? fcDeck[fcIdx] : window._fcCurrentEntry?.word;
    if (w) speakText(w.hanzi);
  };

  window.fcStop = function() { if (!confirm('Dừng phiên ôn tập?')) return; fcShowResult(); };

  function fcShowResult() {
    if (fcTimerId) { clearInterval(fcTimerId); fcTimerId = null; }
    const elapsed = Math.floor((Date.now()-fcTimerStart)/1000);
    const m = Math.floor(elapsed/60), s = elapsed%60;
    $('#fc-play').classList.add('hidden'); $('#fc-result').classList.remove('hidden');
    const pct = fcTotalCards > 0 ? Math.round((fcCorrect/fcTotalCards)*100) : 0;
    let statsH = '';
    if (fcMode === 'review') {
      const uniqueCorrect = fcCorrectSet.size;
      const uniquePct = fcTotalCards > 0 ? Math.round((uniqueCorrect/fcTotalCards)*100) : 0;
      // Filter wrongList: only show words that are NOT in correctSet (still unmastered)
      const stillWrong = fcWrongList.filter(w => !fcCorrectSet.has(w.hanzi));
      const wrongCount = stillWrong.length;
      statsH = `<div class="flex justify-between"><span class="text-slate-500">✅ Đã nhớ</span><strong class="text-green-600">${uniqueCorrect}/${fcTotalCards} (${uniquePct}%)</strong></div>
        <div class="flex justify-between"><span class="text-slate-500">❌ Chưa nhớ</span><strong class="text-red-500">${wrongCount}</strong></div>
        <div class="flex justify-between"><span class="text-slate-500">🔄 Tổng lượt ôn</span><strong>${fcReviewed}</strong></div>
        <div class="flex justify-between"><span class="text-slate-500">⏱️ Thời gian</span><strong>${m}p ${s}s</strong></div>`;
      if (stillWrong.length) {
        $('#fc-replay-wrong-btn').classList.remove('hidden');
        fcWrongList = stillWrong; // Update for replay
        statsH += `<div class="pt-2 border-t"><div class="text-xs text-red-500 font-bold mb-1">Từ chưa nhớ:</div><div class="flex flex-wrap gap-1">${stillWrong.map(w=>`<span class="font-cn text-sm bg-red-50 border border-red-200 rounded px-1.5 py-0.5">${w.hanzi}</span>`).join('')}</div></div>`;
      } else { $('#fc-replay-wrong-btn').classList.add('hidden'); }
    } else {
      statsH = `<div class="flex justify-between"><span class="text-slate-500">📖 Đã xem</span><strong>${fcIdx+1}/${fcDeck.length}</strong></div>
        <div class="flex justify-between"><span class="text-slate-500">⏱️ Thời gian</span><strong>${m}p ${s}s</strong></div>`;
      $('#fc-replay-wrong-btn').classList.add('hidden');
    }
    $('#fc-result-stats').innerHTML = statsH;
    const sessions = fcLoadSessions();
    sessions.push({ date: new Date().toISOString(), mode: fcMode, source: fcSource, total: fcTotalCards, correct: fcCorrect, wrong: fcWrongList.length, time: elapsed });
    if (sessions.length > 100) sessions.splice(0, sessions.length-100);
    fcSaveSessions(sessions);
    // Also record SRS history for dashboard (both review and browse modes)
    const hist = srsLoadHistory();
    hist.push({ date: new Date().toISOString(), total: fcTotalCards, correct: fcCorrect, wrong: fcWrongList.length, mode: fcMode });
    if (hist.length > 100) hist.splice(0, hist.length - 100);
    srsSaveHistory(hist);
    srsUpdateStreak();
  }

  window.fcReplayWrong = function() {
    if (!fcWrongList.length) return;
    fcDeck = [...fcWrongList];
    if ($('#fc-shuffle')?.checked) { for (let i=fcDeck.length-1;i>0;i--) { const j=Math.floor(Math.random()*(i+1)); [fcDeck[i],fcDeck[j]]=[fcDeck[j],fcDeck[i]]; } }
    fcIdx=0; fcFlipped=false; fcCorrect=0; fcWrong=0; fcReviewed=0; fcWrongList=[]; fcTotalCards=fcDeck.length;
    fcBoxes = { 1: fcDeck.map(w=>({word:w,wrongCount:0})), 2: [], 3: [] }; fcQueue = [...fcBoxes[1]];
    $('#fc-result').classList.add('hidden'); $('#fc-play').classList.remove('hidden');
    $('#fc-progress-total').textContent = fcTotalCards;
    fcTimerStart = Date.now(); if (fcTimerId) clearInterval(fcTimerId); fcTimerId = setInterval(fcUpdateTimer, 1000);
    if (fcMode==='browse') fcRenderCard(fcDeck[0]); else fcNextReviewCard();
    fcUpdateProgress(); fcUpdateBoxCounts();
  };

  window.fcReplayAll = function() { $('#fc-result').classList.add('hidden'); $('#fc-play').classList.add('hidden'); $('#fc-setup').classList.remove('hidden'); };
  window.fcBackToSetup = function() { $('#fc-result').classList.add('hidden'); $('#fc-play').classList.add('hidden'); $('#fc-setup').classList.remove('hidden'); };

  function fcSetupSwipe() {
    const area = $('#fc-card-area');
    let startX=0, startY=0, dx=0, swiping=false;
    area.ontouchstart = function(e) { startX=e.touches[0].clientX; startY=e.touches[0].clientY; dx=0; swiping=true; };
    area.ontouchmove = function(e) {
      if (!swiping) return;
      dx = e.touches[0].clientX - startX;
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dy > Math.abs(dx)) { swiping=false; return; }
      if (Math.abs(dx)>20) e.preventDefault();
      const wrapper = $('#fc-card-wrapper');
      wrapper.style.transform = `translateX(${dx*0.5}px) rotate(${Math.max(-15,Math.min(15,dx*0.15))}deg)`;
      wrapper.style.opacity = Math.max(0.4, 1 - Math.abs(dx)/400);
    };
    area.ontouchend = function() {
      if (!swiping) { resetSwipeVisual(); return; }
      swiping = false;
      if (dx > 80) { animateSwipeOut('right', () => { if (fcMode==='browse') fcNext(); else fcAnswer(true); resetSwipeVisual(); }); }
      else if (dx < -80) { animateSwipeOut('left', () => { if (fcMode==='browse') fcPrev(); else fcAnswer(false); resetSwipeVisual(); }); }
      else resetSwipeVisual();
    };
  }

  function resetSwipeVisual() {
    const w = $('#fc-card-wrapper'); if (!w) return;
    w.style.transition = 'transform 0.3s, opacity 0.3s'; w.style.transform = ''; w.style.opacity = '';
    setTimeout(() => { w.style.transition = ''; }, 300);
  }

  function animateSwipeOut(dir, cb) {
    const w = $('#fc-card-wrapper');
    const x = dir === 'right' ? 300 : -300;
    w.style.transition = 'transform 0.25s ease-out, opacity 0.25s';
    w.style.transform = `translateX(${x}px) rotate(${x*0.05}deg)`; w.style.opacity = '0';
    setTimeout(() => { w.style.transition='none'; w.style.transform='translateX(0)'; w.style.opacity='1'; cb(); setTimeout(()=>{w.style.transition='';},50); }, 250);
  }

  // ===== FLASHCARD PDF EXPORT =====
  window.fcExportPdf = function() {
    if (!fcDeck.length) { showToast('Không có từ vựng để xuất'); return; }
    // Show card size picker modal
    const old = document.getElementById('fc-pdf-modal');
    if (old) old.remove();
    const modal = document.createElement('div');
    modal.id = 'fc-pdf-modal';
    modal.className = 'fixed inset-0 bg-black/40 z-[200] flex items-center justify-center p-4';
    modal.onclick = e => { if (e.target === modal) modal.remove(); };
    modal.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
      <div class="px-5 py-4 border-b bg-gradient-to-r from-blue-50 to-amber-50">
        <h3 class="font-bold text-lg">📄 Xuất Flashcard PDF</h3>
        <p class="text-xs text-slate-500 mt-1">${fcDeck.length} thẻ flashcard → PDF khổ A4</p>
      </div>
      <div class="p-5 space-y-4">
        <div>
          <label class="text-sm font-medium text-slate-700 block mb-2">Kích thước thẻ:</label>
          <div class="grid grid-cols-3 gap-2">
            <label class="flex flex-col items-center p-3 border-2 rounded-xl cursor-pointer hover:border-primary transition-colors">
              <input type="radio" name="fc-pdf-size" value="small" class="accent-primary mb-1">
              <span class="text-xs font-medium">Nhỏ</span>
              <span class="text-[10px] text-slate-400">60×40mm</span>
              <span class="text-[10px] text-slate-400">12 thẻ/trang</span>
            </label>
            <label class="flex flex-col items-center p-3 border-2 rounded-xl cursor-pointer hover:border-primary transition-colors border-primary bg-blue-50">
              <input type="radio" name="fc-pdf-size" value="medium" class="accent-primary mb-1" checked>
              <span class="text-xs font-medium">Vừa</span>
              <span class="text-[10px] text-slate-400">85×55mm</span>
              <span class="text-[10px] text-slate-400">8 thẻ/trang</span>
            </label>
            <label class="flex flex-col items-center p-3 border-2 rounded-xl cursor-pointer hover:border-primary transition-colors">
              <input type="radio" name="fc-pdf-size" value="large" class="accent-primary mb-1">
              <span class="text-xs font-medium">Lớn</span>
              <span class="text-[10px] text-slate-400">95×65mm</span>
              <span class="text-[10px] text-slate-400">6 thẻ/trang</span>
            </label>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="fc-pdf-pinyin" class="accent-primary" checked><span class="text-sm">Hiện Pinyin</span></label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="fc-pdf-meaning" class="accent-primary" checked><span class="text-sm">Hiện nghĩa</span></label>
        </div>
        <div class="flex items-center gap-3">
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="fc-pdf-hsk-badge" class="accent-primary" checked><span class="text-sm">HSK badge</span></label>
          <label class="flex items-center gap-2 cursor-pointer"><input type="checkbox" id="fc-pdf-cut-lines" class="accent-primary" checked><span class="text-sm">Đường cắt</span></label>
        </div>
        <button onclick="doFcExportPdf()" class="w-full py-3 bg-primary text-white rounded-xl font-medium text-sm hover:bg-primary-dark transition-colors">📄 Tạo PDF Flashcard</button>
      </div>
    </div>`;
    document.body.appendChild(modal);
    // Style radio groups
    modal.querySelectorAll('input[name="fc-pdf-size"]').forEach(r => {
      r.addEventListener('change', () => {
        modal.querySelectorAll('input[name="fc-pdf-size"]').forEach(r2 => {
          r2.closest('label').classList.toggle('border-primary', r2.checked);
          r2.closest('label').classList.toggle('bg-blue-50', r2.checked);
        });
      });
    });
  };

  window.doFcExportPdf = function() {
    const sizeVal = document.querySelector('input[name="fc-pdf-size"]:checked')?.value || 'medium';
    const showPinyin = document.getElementById('fc-pdf-pinyin')?.checked;
    const showMeaning = document.getElementById('fc-pdf-meaning')?.checked;
    const showHsk = document.getElementById('fc-pdf-hsk-badge')?.checked;
    const showCutLines = document.getElementById('fc-pdf-cut-lines')?.checked;
    // Card sizes in mm
    const sizes = { small: { w: 60, h: 40 }, medium: { w: 85, h: 55 }, large: { w: 95, h: 65 } };
    const card = sizes[sizeVal];
    const pageW = 210, pageH = 297, mL = 10, mR = 10, mT = 10, mB = 10;
    const usableW = pageW - mL - mR, usableH = pageH - mT - mB;
    const cols = Math.floor(usableW / card.w);
    const rows = Math.floor(usableH / card.h);
    const cardsPerPage = cols * rows;
    const gapX = (usableW - cols * card.w) / Math.max(cols - 1, 1);
    const gapY = (usableH - rows * card.h) / Math.max(rows - 1, 1);

    // Load jsPDF
    if (!window.jspdf && !window.jsPDF) {
      showToast('Đang tải jsPDF...');
      const script = document.createElement('script');
      script.src = 'jspdf.umd.min.js';
      script.onload = () => doFcExportPdf();
      script.onerror = () => showToast('Không thể tải jsPDF');
      document.head.appendChild(script);
      return;
    }

    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    const doc = new jsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

    function textImg(text, fontSize, color, bold, maxW) {
      const cvs = document.createElement('canvas');
      const dpr = 4; // Higher DPR for sharp text in PDF
      // Extra vertical space for Vietnamese diacritics (đấu sắc, huyền, hỏi, ngã, nặng on top of accented vowels)
      const lineH = Math.ceil(fontSize * 2.2);
      cvs.width = (maxW || 800) * dpr; cvs.height = lineH * dpr;
      const c = cvs.getContext('2d');
      c.scale(dpr, dpr);
      const fontStr = (bold ? 'bold ' : '') + fontSize + 'px "Segoe UI", Inter, "Noto Sans", "Noto Sans SC", "Microsoft YaHei", Arial, sans-serif';
      c.font = fontStr;
      let t = text;
      if (maxW) {
        while (c.measureText(t).width > maxW && t.length > 1) t = t.substring(0, t.length - 1);
        if (t !== text) t += '…';
      }
      const tw = Math.ceil(c.measureText(t).width) + 10;
      cvs.width = tw * dpr; cvs.height = lineH * dpr;
      const c2 = cvs.getContext('2d');
      c2.scale(dpr, dpr);
      c2.font = fontStr; c2.fillStyle = color;
      // Use 'alphabetic' baseline with generous top padding so diacritics aren't clipped
      c2.textBaseline = 'alphabetic';
      const baselineY = lineH * 0.7; // Position baseline at 70% from top - leaves 30% for diacritics above
      c2.fillText(t, 4, baselineY);
      return { url: cvs.toDataURL('image/png'), w: tw, h: lineH };
    }

    // Render multi-char hanzi using stroke data (SVG paths) - sharp at any size
    function renderMultiCharPng(hanzi, sizePx) {
      const chars = [...hanzi];
      const totalW = sizePx * chars.length;
      const cvs = document.createElement('canvas');
      cvs.width = totalW; cvs.height = sizePx;
      const c = cvs.getContext('2d');
      for (let i = 0; i < chars.length; i++) {
        const cd = characters[chars[i]];
        if (!cd || !cd.strokes) {
          // Fallback: draw text for chars without stroke data
          c.font = `bold ${sizePx * 0.8}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
          c.fillStyle = '#cc0000';
          c.textBaseline = 'middle'; c.textAlign = 'center';
          c.fillText(chars[i], i * sizePx + sizePx / 2, sizePx / 2);
          continue;
        }
        const scale = sizePx / 1024;
        c.save();
        c.translate(i * sizePx, 0);
        for (const strokeD of cd.strokes) {
          const parsed = parseSvgPath(strokeD);
          c.beginPath();
          let cx2 = 0, cy2 = 0, lcx2 = 0, lcy2 = 0;
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
          c.fillStyle = '#cc0000'; c.fill();
        }
        c.restore();
      }
      return { url: cvs.toDataURL('image/png'), charCount: chars.length };
    }

    let cardIdx = 0;
    const totalPages = Math.ceil(fcDeck.length / cardsPerPage);

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) doc.addPage();
      for (let r = 0; r < rows && cardIdx < fcDeck.length; r++) {
        for (let c = 0; c < cols && cardIdx < fcDeck.length; c++) {
          const w = fcDeck[cardIdx++];
          const cx = mL + c * (card.w + (cols > 1 ? gapX : 0));
          const cy = mT + r * (card.h + (rows > 1 ? gapY : 0));

          // Card border
          if (showCutLines) {
            doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.2);
            doc.setLineDashPattern([2, 2], 0);
            doc.rect(cx, cy, card.w, card.h);
            doc.setLineDashPattern([], 0);
          } else {
            doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
            doc.rect(cx, cy, card.w, card.h, 'S');
          }

          // Hanzi (center, large) - use stroke SVG rendering for crisp output
          const hanziRenderPx = sizeVal === 'small' ? 120 : (sizeVal === 'medium' ? 160 : 200);
          const charCount = [...w.hanzi].length;
          if (charCount === 1) {
            const charImg = renderCharPng(w.hanzi, hanziRenderPx);
            if (charImg) {
              const imgS = Math.min(card.w * 0.45, card.h * 0.5);
              try { doc.addImage(charImg, 'PNG', cx + (card.w - imgS) / 2, cy + 2, imgS, imgS); } catch(e) {}
            } else {
              // Fallback to text if no stroke data
              const hImg = textImg(w.hanzi, hanziRenderPx / 2, '#cc0000', true, card.w * 4);
              const hH = Math.min(card.h * 0.4, 18);
              const hW = hH * (hImg.w / hImg.h);
              try { doc.addImage(hImg.url, 'PNG', cx + (card.w - hW) / 2, cy + 3, hW, hH); } catch(e) {}
            }
          } else {
            // Multi-char: render each char using stroke paths side-by-side
            const mcData = renderMultiCharPng(w.hanzi, hanziRenderPx);
            const imgH = Math.min(card.h * 0.45, 22);
            const imgW = imgH * charCount;
            const maxW = card.w - 6;
            const finalW = Math.min(imgW, maxW);
            const finalH = finalW / charCount;
            try { doc.addImage(mcData.url, 'PNG', cx + (card.w - finalW) / 2, cy + 2, finalW, finalH); } catch(e) {}
          }

          // Pinyin
          let bottomY = cy + card.h - 3;
          if (showPinyin && w.pinyin) {
            const pFs = sizeVal === 'small' ? 16 : 20;
            const pImg = textImg(w.pinyin, pFs, '#2563eb', false, card.w * 3);
            const pH = 3.5, pW = Math.min(card.w - 4, pH * (pImg.w / pImg.h));
            const pY = cy + card.h * 0.55;
            try { doc.addImage(pImg.url, 'PNG', cx + (card.w - pW) / 2, pY, pW, pH); } catch(e) {}
          }

          // Meaning
          if (showMeaning) {
            const vi = (w.vietnamese || '').split(/[;；]/)[0].trim();
            const en = (w.english || '').split(/[;；]/)[0].trim();
            const def = vi || en;
            if (def) {
              const mFs = sizeVal === 'small' ? 12 : 14;
              const mImg = textImg(def, mFs, '#555', false, card.w * 3);
              const mH = 2.8, mW = Math.min(card.w - 4, mH * (mImg.w / mImg.h));
              const mY = cy + card.h * 0.72;
              try { doc.addImage(mImg.url, 'PNG', cx + (card.w - mW) / 2, mY, mW, mH); } catch(e) {}
            }
          }

          // HSK badge
          if (showHsk && w.hsk) {
            const bImg = textImg('HSK' + w.hsk, 14, '#b45309', true, 200);
            const bH = 2.5, bW = bH * (bImg.w / bImg.h);
            try { doc.addImage(bImg.url, 'PNG', cx + card.w - bW - 1.5, cy + 1, bW, bH); } catch(e) {}
          }
        }
      }
    }

    doc.save('ChineseWriter_Flashcards.pdf');
    const modalEl = document.getElementById('fc-pdf-modal');
    if (modalEl) modalEl.remove();
    showToast(`✅ Đã xuất ${fcDeck.length} flashcard ra PDF!`);
  };

  // ===== QUIZ SYSTEM =====
  let qzSource = '', qzSelectedTypes = ['hanzi_to_viet'];
  let qzQuestions = [], qzIdx = 0, qzScore = 0, qzStreak = 0, qzMaxStreak = 0;
  let qzWrongList = [], qzAnswered = false;
  let qzTimerStart = 0, qzTimerId = null;
  let qzQTimerId = null, qzTimeLimit = 0;
  let qzSettings = {};
  let qzSourceWords = [];

  // --- Quiz type checkbox toggling ---
  document.addEventListener('click', function(e) {
    const label = e.target.closest('.qz-type-label');
    if (!label) return;
    const cb = label.querySelector('.qz-type-cb');
    if (!cb) return;
    // Toggle visual
    setTimeout(() => {
      label.classList.toggle('border-primary', cb.checked);
      label.classList.toggle('bg-blue-50', cb.checked);
      qzUpdateSelectedTypes();
    }, 10);
  });

  function qzUpdateSelectedTypes() {
    qzSelectedTypes = [...document.querySelectorAll('.qz-type-cb:checked')].map(c => c.value);
  }

  // --- Source selection ---
  window.qzSelectSource = function(src) {
    qzSource = src;
    document.querySelectorAll('.qz-src-btn').forEach(b => {
      b.classList.toggle('border-primary', b.dataset.src === src);
      b.classList.toggle('bg-blue-50', b.dataset.src === src);
    });
    const optsEl = $('#qz-source-options');
    optsEl.classList.remove('hidden');
    let html = '';
    if (src === 'hsk') {
      html = '<div class="bg-slate-50 rounded-xl p-4"><div class="flex flex-wrap gap-2 mb-3">';
      for (let i = 1; i <= 7; i++) {
        html += `<label class="flex items-center gap-1.5 bg-white border-2 rounded-lg px-3 py-2 cursor-pointer hover:border-primary transition-colors"><input type="checkbox" class="qz-hsk-cb accent-primary" value="${i}" ${i<=2?'checked':''}><span class="text-sm font-medium">HSK ${i}</span></label>`;
      }
      html += '</div>';
      html += '<div class="flex items-center gap-2"><label class="text-xs text-slate-500">Giới hạn mỗi cấp:</label><input type="number" id="qz-hsk-limit" value="50" min="5" max="500" class="w-20 px-2 py-1 border rounded-lg text-sm"></div></div>';
    } else if (src === 'bookmark') {
      const sets = loadBookmarks();
      if (!sets.length) { html = '<div class="bg-amber-50 rounded-xl p-4 text-sm text-amber-700">Chưa có bộ bookmark nào. Hãy tạo bộ từ ở trang Hồ sơ học.</div>'; }
      else {
        const totalWords = sets.reduce((sum, s) => sum + s.words.length, 0);
        html = '<div class="bg-slate-50 rounded-xl p-4 space-y-2">';
        html += `<div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-200">
          <label class="flex items-center gap-2 cursor-pointer font-medium text-sm">
            <input type="checkbox" id="qz-bm-select-all" class="accent-primary w-4 h-4">
            <span>Chọn tất cả bộ bookmark</span>
            <span class="text-xs text-slate-400">(${sets.length} bộ · ${totalWords} từ)</span>
          </label>
        </div>`;
        html += '<div class="space-y-1.5">';
        for (const s of sets) { html += `<label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white transition-colors"><input type="checkbox" name="qz-bm-set" value="${s.id}" class="qz-bm-cb accent-primary w-4 h-4"><span class="text-sm">${s.name}</span><span class="text-xs text-slate-400">(${s.words.length} từ)</span></label>`; }
        html += '</div></div>';
      }
    } else if (src === 'radical') {
      html = '<div class="bg-slate-50 rounded-xl p-4"><p class="text-xs text-slate-500 mb-2">Chọn bộ thủ:</p><div class="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">';
      const sortedRads = Object.entries(radicals).sort((a,b) => a[1].strokes - b[1].strokes);
      for (const [rad, info] of sortedRads) {
        html += `<label class="qz-rad-label inline-flex items-center gap-1 bg-white border-2 rounded-lg px-2 py-1 cursor-pointer hover:border-primary transition-colors"><input type="radio" name="qz-rad" value="${rad}" class="accent-primary hidden" onchange="qzHighlightRad(this)"><span class="font-cn text-lg">${rad}</span><span class="text-[10px] text-slate-400">${info.viet||''}</span></label>`;
      }
      html += '</div></div>';
    } else if (src === 'custom') {
      html = '<div class="bg-slate-50 rounded-xl p-4"><p class="text-xs text-slate-500 mb-2">Nhập từ vựng (phẩy hoặc xuống dòng):</p><textarea id="qz-custom-input" rows="3" class="w-full px-3 py-2 border rounded-lg text-sm font-cn" placeholder="你好, 谢谢, 学习"></textarea></div>';
    }
    optsEl.innerHTML = html;
    setTimeout(qzUpdateStartInfo, 50);
    optsEl.addEventListener('change', () => setTimeout(qzUpdateStartInfo, 50));
  };

  // --- Highlight selected radical label ---
  window.qzHighlightRad = function(radio) {
    document.querySelectorAll('.qz-rad-label').forEach(lbl => {
      lbl.classList.remove('border-primary', 'bg-blue-50', 'ring-2', 'ring-primary/30');
      lbl.classList.add('border-slate-200');
    });
    const label = radio.closest('.qz-rad-label');
    if (label && radio.checked) {
      label.classList.remove('border-slate-200');
      label.classList.add('border-primary', 'bg-blue-50', 'ring-2', 'ring-primary/30');
    }
    setTimeout(qzUpdateStartInfo, 50);
  };

  function qzGetWordsFromSource() {
    let words = [];
    if (qzSource === 'hsk') {
      const checked = [...document.querySelectorAll('.qz-hsk-cb:checked')].map(c => parseInt(c.value));
      if (!checked.length) return [];
      const limit = parseInt($('#qz-hsk-limit')?.value) || 50;
      for (const lv of checked) { words = words.concat(allWords.filter(w => w.hsk === lv).slice(0, limit)); }
    } else if (qzSource === 'bookmark') {
      const checked = [...document.querySelectorAll('input[name="qz-bm-set"]:checked')];
      if (!checked.length) return [];
      const sets = loadBookmarks();
      // Collect all selected set IDs
      const selectedIds = new Set(checked.map(c => c.value));
      const selectedSets = sets.filter(s => selectedIds.has(s.id));
      // Deduplicate hanzi across all selected sets
      const seenHanzi = new Set();
      for (const s of selectedSets) {
        for (const h of s.words) {
          if (!seenHanzi.has(h)) {
            seenHanzi.add(h);
            const found = allWords.find(w => w.hanzi === h);
            if (found) words.push(found);
          }
        }
      }
    } else if (qzSource === 'radical') {
      const sel = document.querySelector('input[name="qz-rad"]:checked');
      if (!sel) return [];
      words = getWordsByRadical(sel.value);
    } else if (qzSource === 'custom') {
      const raw = ($('#qz-custom-input')?.value || '').trim();
      if (!raw) return [];
      const tokens = raw.split(/[,，\n\r]+/).map(s => s.trim()).filter(Boolean);
      for (const tok of tokens) {
        const found = allWords.find(w => w.hanzi === tok);
        words.push(found || { hanzi: tok, pinyin: '', vietnamese: '', english: '', hsk: 0 });
      }
    }
    return words;
  }

  function qzUpdateStartInfo() {
    const words = qzGetWordsFromSource();
    const btn = $('#qz-start-btn');
    const info = $('#qz-start-info');
    qzUpdateSelectedTypes();
    if (words.length >= 4 && qzSelectedTypes.length > 0) {
      btn.disabled = false;
      info.innerHTML = `📊 <strong>${words.length}</strong> từ khả dụng · <strong>${qzSelectedTypes.length}</strong> dạng quiz đã chọn`;
    } else {
      btn.disabled = true;
      if (words.length < 4) info.innerHTML = '⚠️ Cần ít nhất 4 từ để tạo quiz (đủ 4 đáp án)';
      else info.innerHTML = '⚠️ Hãy chọn ít nhất 1 dạng quiz';
    }
  }

  // --- Utility helpers ---
  function qzShuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function qzPickRandom(arr, n) {
    const shuffled = qzShuffle(arr);
    return shuffled.slice(0, n);
  }

  // Get Vietnamese definition - up to 3 meaningful definitions, skip "biến thể" lines
  function qzGetViDef(w, maxDefs) {
    const max = maxDefs || 3;
    const raw = (w.vietnamese || w.english || '').split(/[;；]/).map(s => s.trim()).filter(Boolean);
    // Filter out unhelpful definitions like "biến thể của...", "xem...", "như..."
    const meaningful = raw.filter(d => !/^(biến thể|dạng khác|xem |như |tương tự|giống với)/i.test(d));
    const defs = meaningful.length ? meaningful : raw; // fallback to all if all filtered
    if (!defs.length) return w.hanzi;
    return [...new Set(defs)].slice(0, max).join('; ');
  }
  // Get single short def for compact display
  function qzGetViDefShort(w) { return qzGetViDef(w, 1); }

  // --- Question generators ---
  function qzGenHanziToViet(word, pool) {
    const correct = qzGetViDef(word);
    const sameHsk = pool.filter(w => w.hanzi !== word.hanzi && qzGetViDef(w) !== correct);
    const distractors = qzPickRandom(sameHsk.length >= 3 ? sameHsk : pool.filter(w => w.hanzi !== word.hanzi), 3).map(w => qzGetViDef(w));
    return {
      type: 'hanzi_to_viet', typeLabel: 'Hán → Nghĩa Việt',
      questionHtml: `<div class="font-cn text-5xl font-bold text-hanzi">${word.hanzi}</div>`,
      hint: word.pinyin || '',
      correctAnswer: correct, options: qzShuffle([correct, ...distractors]),
      word: word
    };
  }

  function qzGenVietToHanzi(word, pool) {
    const questionText = qzGetViDef(word);
    const correct = word.hanzi;
    const correctLen = [...correct].length;
    // Filter distractors to match the same character count as the correct answer
    const sameLenPool = pool.filter(w => w.hanzi !== word.hanzi && [...w.hanzi].length === correctLen);
    const fallbackPool = pool.filter(w => w.hanzi !== word.hanzi);
    const distPool = sameLenPool.length >= 3 ? sameLenPool : fallbackPool;
    const distractors = qzPickRandom(distPool, 3).map(w => w.hanzi);
    return {
      type: 'viet_to_hanzi', typeLabel: 'Nghĩa Việt → Hán',
      questionHtml: `<div class="text-2xl font-bold text-slate-700">${questionText}</div>`,
      hint: word.pinyin || '',
      correctAnswer: correct, options: qzShuffle([correct, ...distractors]),
      word: word
    };
  }

  function qzGenListenToHanzi(word, pool) {
    const correct = word.hanzi;
    const correctLen = [...correct].length;
    // Filter distractors to match the same character count as the correct answer
    const sameLenPool = pool.filter(w => w.hanzi !== word.hanzi && [...w.hanzi].length === correctLen);
    const fallbackPool = pool.filter(w => w.hanzi !== word.hanzi);
    const distPool = sameLenPool.length >= 3 ? sameLenPool : fallbackPool;
    const distractors = qzPickRandom(distPool, 3).map(w => w.hanzi);
    return {
      type: 'listen_to_hanzi', typeLabel: 'Nghe → Chọn Hán',
      questionHtml: `<button onclick="qzPlayAudio()" class="text-5xl hover:scale-110 transition-transform">🔊</button><div class="text-sm text-slate-400 mt-2">Bấm để nghe</div>`,
      hint: '', audioText: word.hanzi,
      correctAnswer: correct, options: qzShuffle([correct, ...distractors]),
      word: word
    };
  }

  function qzGenListenToViet(word, pool) {
    const correct = qzGetViDef(word);
    const sameHsk = pool.filter(w => w.hanzi !== word.hanzi && qzGetViDef(w) !== correct);
    const distractors = qzPickRandom(sameHsk.length >= 3 ? sameHsk : pool.filter(w => w.hanzi !== word.hanzi), 3).map(w => qzGetViDef(w));
    return {
      type: 'listen_to_viet', typeLabel: 'Nghe → Nghĩa Việt',
      questionHtml: `<button onclick="qzPlayAudio()" class="text-5xl hover:scale-110 transition-transform">🔊</button><div class="text-sm text-slate-400 mt-2">Nghe phát âm, chọn nghĩa Việt đúng</div>`,
      hint: '', audioText: word.hanzi,
      correctAnswer: correct, options: qzShuffle([correct, ...distractors]),
      word: word
    };
  }

  function qzGenHanziToPinyin(word, pool) {
    if (!word.pinyin) return null;
    const correct = word.pinyin;
    // Pick distractors with similar-ish pinyin
    const sameHsk = pool.filter(w => w.hanzi !== word.hanzi && w.pinyin && w.pinyin !== correct);
    const distractors = qzPickRandom(sameHsk.length >= 3 ? sameHsk : pool.filter(w => w.hanzi !== word.hanzi && w.pinyin), 3).map(w => w.pinyin);
    return {
      type: 'hanzi_to_pinyin', typeLabel: 'Hán → Pinyin',
      questionHtml: `<div class="font-cn text-5xl font-bold text-hanzi">${word.hanzi}</div>`,
      hint: qzGetViDef(word),
      correctAnswer: correct, options: qzShuffle([correct, ...distractors]),
      word: word
    };
  }

  function qzGenGuessRadical(word, pool) {
    const char = [...word.hanzi][0];
    const cd = characters[char];
    if (!cd || !cd.radical) return null;
    const correctRad = cd.radical;
    const radInfo = radicals[correctRad];
    if (!radInfo) return null;
    // Get distractors: other radicals with similar stroke count
    const allRads = Object.entries(radicals).filter(([r]) => r !== correctRad);
    const similarRads = allRads.filter(([,info]) => Math.abs((info.strokes||0) - (radInfo.strokes||0)) <= 3);
    const distPool = similarRads.length >= 3 ? similarRads : allRads;
    const distractors = qzPickRandom(distPool, 3).map(([r]) => r);
    const correctLabel = `${correctRad} ${radInfo.viet || ''}`.trim();
    return {
      type: 'guess_radical', typeLabel: 'Đoán Bộ thủ',
      questionHtml: `<div class="font-cn text-5xl font-bold text-hanzi">${char}</div><div class="text-sm text-slate-500 mt-2">Bộ thủ của chữ này là gì?</div>`,
      hint: '',
      correctAnswer: correctRad,
      correctLabel: correctLabel,
      optionLabels: Object.fromEntries([[correctRad, correctLabel], ...distractors.map(r => [r, `${r} ${(radicals[r]||{}).viet||''}`.trim()])]),
      options: qzShuffle([correctRad, ...distractors]),
      word: word
    };
  }

  function qzGenFillBlank(word, pool) {
    const chars = [...word.hanzi];
    if (chars.length < 2) return null;
    const blankIdx = Math.floor(Math.random() * chars.length);
    const correctChar = chars[blankIdx];
    const display = chars.map((c, i) => i === blankIdx ? '<span class="text-primary font-bold">___</span>' : c).join('');
    // Distractors: random single chars from other words
    const otherChars = pool.filter(w => w.hanzi !== word.hanzi).flatMap(w => [...w.hanzi]).filter(c => c !== correctChar);
    const uniqueOther = [...new Set(otherChars)];
    const distractors = qzPickRandom(uniqueOther.length >= 3 ? uniqueOther : [...new Set(allWords.flatMap(w => [...w.hanzi]).filter(c => c !== correctChar))], 3);
    return {
      type: 'fill_blank', typeLabel: 'Điền chữ thiếu',
      questionHtml: `<div class="font-cn text-4xl font-bold text-hanzi">${display}</div>`,
      hint: `${word.pinyin || ''} — ${qzGetViDef(word)}`,
      correctAnswer: correctChar, options: qzShuffle([correctChar, ...distractors]),
      word: word
    };
  }

  // --- Context Fill (AI-generated sentences) ---
  function qzGenContextFill(word, pool) {
    if (!contextQuizData.length) return null;
    // Find context quiz items matching this word
    const items = contextQuizData.filter(q => q.word === word.hanzi);
    if (!items.length) return null;
    const item = items[Math.floor(Math.random() * items.length)];
    const correct = item.answer || word.hanzi;
    let distractors = item.distractors || [];
    // Ensure we have 3 distractors
    if (distractors.length < 3) {
      const extra = pool.filter(w => w.hanzi !== word.hanzi && !distractors.includes(w.hanzi));
      const needed = 3 - distractors.length;
      const picks = qzPickRandom(extra, needed).map(w => w.hanzi);
      distractors = [...distractors, ...picks];
    }
    distractors = distractors.slice(0, 3);
    // Build question HTML with sentence + translation
    let qHtml = `<div class="font-cn text-2xl font-bold text-slate-800 leading-relaxed mb-3">${item.sentence || ''}</div>`;
    if (item.pinyin) qHtml += `<div class="text-sm text-primary mb-1">${item.pinyin}</div>`;
    if (item.viet) qHtml += `<div class="text-sm text-slate-500">${item.viet}</div>`;
    // Build explanation for feedback
    const explanation = item.explanation || '';
    return {
      type: 'context_fill', typeLabel: '📖 Điền từ vào câu',
      questionHtml: qHtml,
      hint: '',
      correctAnswer: correct, options: qzShuffle([correct, ...distractors]),
      word: word,
      explanation: explanation
    };
  }

  const qzGenerators = {
    hanzi_to_viet: qzGenHanziToViet,
    viet_to_hanzi: qzGenVietToHanzi,
    listen_to_hanzi: qzGenListenToHanzi,
    listen_to_viet: qzGenListenToViet,
    hanzi_to_pinyin: qzGenHanziToPinyin,
    guess_radical: qzGenGuessRadical,
    fill_blank: qzGenFillBlank,
    context_fill: qzGenContextFill
  };

  // --- Generate questions ---
  // Each word can have multiple questions with different quiz types.
  // "count" = total number of questions to generate (can exceed word count).
  function qzGenerateQuestions(words, types, count) {
    const questions = [];
    const shuffledWords = qzShuffle(words);
    const usedCombos = new Set(); // Track "word+type" combos to prefer variety
    let attempts = 0;
    const maxAttempts = count * 5;

    // Round-robin: cycle through words, for each word try different types
    let wordIdx = 0;
    let round = 0; // how many full cycles through all words

    while (questions.length < count && attempts < maxAttempts) {
      const word = shuffledWords[wordIdx % shuffledWords.length];

      // Try to pick a type not yet used for this word
      const shuffledTypes = qzShuffle(types);
      let generated = false;
      for (const type of shuffledTypes) {
        const comboKey = word.hanzi + '|' + type;
        // In first rounds, prefer unused combos; later allow repeats
        if (round < types.length && usedCombos.has(comboKey)) continue;

        const gen = qzGenerators[type];
        if (!gen) continue;
        const q = gen(word, words);
        if (!q) continue;
        const uniqueOpts = [...new Set(q.options)];
        if (uniqueOpts.length < 4) continue;
        q.options = uniqueOpts.slice(0, 4);
        q.userAnswer = null;
        q.isCorrect = null;
        q.timeSpent = 0;
        questions.push(q);
        usedCombos.add(comboKey);
        generated = true;
        break;
      }

      if (!generated) {
        // Fallback: try any type (allow repeats)
        const type = types[Math.floor(Math.random() * types.length)];
        const gen = qzGenerators[type];
        if (gen) {
          const q = gen(word, words);
          if (q) {
            const uniqueOpts = [...new Set(q.options)];
            if (uniqueOpts.length >= 4) {
              q.options = uniqueOpts.slice(0, 4);
              q.userAnswer = null;
              q.isCorrect = null;
              q.timeSpent = 0;
              questions.push(q);
            }
          }
        }
      }

      wordIdx++;
      if (wordIdx % shuffledWords.length === 0) round++;
      attempts++;
    }
    return questions;
  }

  // --- Start Quiz ---
  window.qzStart = function() {
    qzUpdateSelectedTypes();
    const words = qzGetWordsFromSource();
    if (words.length < 4) { showToast('Cần ít nhất 4 từ'); return; }
    if (!qzSelectedTypes.length) { showToast('Chọn ít nhất 1 dạng quiz'); return; }
    const count = parseInt($('#qz-count')?.value) || 20;
    qzTimeLimit = parseInt($('#qz-time-limit')?.value) || 0;
    qzSourceWords = words;
    qzQuestions = qzGenerateQuestions(words, qzSelectedTypes, count);
    if (!qzQuestions.length) { showToast('Không tạo được câu hỏi. Thử đổi dạng quiz.'); return; }
    qzIdx = 0; qzScore = 0; qzStreak = 0; qzMaxStreak = 0; qzWrongList = []; qzAnswered = false;
    qzSettings = { count, types: [...qzSelectedTypes], source: qzSource, timeLimit: qzTimeLimit };
    $('#qz-setup').classList.add('hidden'); $('#qz-play').classList.remove('hidden'); $('#qz-result').classList.add('hidden');
    $('#qz-total').textContent = qzQuestions.length;
    qzTimerStart = Date.now();
    if (qzTimerId) clearInterval(qzTimerId);
    qzTimerId = setInterval(qzUpdateTimer, 1000);
    qzRenderQuestion();
  };

  function qzUpdateTimer() {
    const elapsed = Math.floor((Date.now() - qzTimerStart) / 1000);
    const el = $('#qz-timer');
    if (el) el.textContent = Math.floor(elapsed/60) + ':' + (elapsed%60 < 10 ? '0' : '') + (elapsed%60);
  }

  // --- Render question ---
  function qzRenderQuestion() {
    const q = qzQuestions[qzIdx];
    if (!q) return;
    qzAnswered = false;
    const showPinyin = $('#qz-show-pinyin')?.checked !== false;
    const vietFirst = $('#qz-viet-first')?.checked === true;
    $('#qz-cur').textContent = qzIdx + 1;
    $('#qz-progress-bar').style.width = Math.round(((qzIdx) / qzQuestions.length) * 100) + '%';

    // Apply viet-first mode for hanzi_to_viet type
    if (vietFirst && q.type === 'hanzi_to_viet') {
      const questionText = qzGetViDef(q.word);
      const correct = q.word.hanzi;
      // Re-generate options: correct hanzi + 3 distractors from same HSK
      const sameHsk = qzSourceWords.filter(w => w.hanzi !== q.word.hanzi && qzGetViDef(w) !== questionText);
      const distractors = qzPickRandom(sameHsk.length >= 3 ? sameHsk : qzSourceWords.filter(w => w.hanzi !== q.word.hanzi), 3).map(w => w.hanzi);
      q.options = qzShuffle([correct, ...distractors]);
      q.questionHtml = `<div class="text-2xl font-bold text-slate-700">${questionText}</div>`;
      q.hint = q.word.pinyin || '';
    }

    $('#qz-q-type-label').textContent = q.typeLabel;
    $('#qz-q-content').innerHTML = q.questionHtml;
    $('#qz-q-hint').textContent = (showPinyin && q.hint) ? q.hint : '';
    $('#qz-feedback').classList.add('hidden');
    $('#qz-next-btn').classList.add('hidden');
    // Streak badge
    const streakBadge = $('#qz-streak-badge');
    if (qzStreak >= 2) { streakBadge.classList.remove('hidden'); streakBadge.textContent = '🔥 ' + qzStreak; }
    else streakBadge.classList.add('hidden');
    // Render options
    const optsEl = $('#qz-options');
    let optsHtml = '';
    for (let i = 0; i < q.options.length; i++) {
      const opt = q.options[i];
      const displayText = (q.optionLabels && q.optionLabels[opt]) ? q.optionLabels[opt] : opt;
      const isCn = q.type === 'viet_to_hanzi' || q.type === 'listen_to_hanzi' || q.type === 'guess_radical' || q.type === 'fill_blank' || q.type === 'context_fill';
      const fontClass = isCn ? 'font-cn text-xl' : 'text-sm';
      optsHtml += `<button onclick="qzAnswer(${i})" class="qz-opt-btn w-full text-left px-5 py-4 border-2 rounded-xl hover:border-primary hover:bg-blue-50 transition-all ${fontClass}" data-idx="${i}"><span class="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 text-slate-500 text-xs font-bold mr-3 flex-shrink-0">${i+1}</span>${displayText}</button>`;
    }
    optsEl.innerHTML = optsHtml;
    // Auto-play audio for listen type
    if ((q.type === 'listen_to_hanzi' || q.type === 'listen_to_viet') && q.audioText) {
      setTimeout(() => speakText(q.audioText), 300);
    }
    // Per-question timer
    if (qzTimeLimit > 0) {
      $('#qz-q-timer-bar').classList.remove('hidden');
      $('#qz-q-timer-fill').style.width = '100%';
      let remaining = qzTimeLimit;
      const qStartTime = Date.now();
      if (qzQTimerId) clearInterval(qzQTimerId);
      qzQTimerId = setInterval(() => {
        const elapsed = (Date.now() - qStartTime) / 1000;
        remaining = qzTimeLimit - elapsed;
        const pct = Math.max(0, (remaining / qzTimeLimit) * 100);
        $('#qz-q-timer-fill').style.width = pct + '%';
        if (remaining <= 3) $('#qz-q-timer-fill').classList.replace('bg-amber-400', 'bg-red-500');
        if (remaining <= 0) {
          clearInterval(qzQTimerId); qzQTimerId = null;
          qzAnswer(-1); // Time's up
        }
      }, 100);
    } else {
      $('#qz-q-timer-bar').classList.add('hidden');
      if (qzQTimerId) { clearInterval(qzQTimerId); qzQTimerId = null; }
    }
  }

  window.qzPlayAudio = function() {
    const q = qzQuestions[qzIdx];
    if (q && q.audioText) speakText(q.audioText);
  };

  // --- Keyboard shortcuts for Quiz ---
  document.addEventListener('keydown', function(e) {
    // Only active when quiz play view is visible
    const playEl = $('#qz-play');
    if (!playEl || playEl.classList.contains('hidden')) return;
    const resultEl = $('#qz-result');
    if (resultEl && !resultEl.classList.contains('hidden')) return;

    // Arrow Right or Enter or Space → Next question (when answered)
    if ((e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') && qzAnswered) {
      e.preventDefault();
      qzNext();
      return;
    }

    // Number keys 1-4 → Select answer option
    if (!qzAnswered && e.key >= '1' && e.key <= '4') {
      e.preventDefault();
      const idx = parseInt(e.key) - 1;
      const q = qzQuestions[qzIdx];
      if (q && idx < q.options.length) {
        qzAnswer(idx);
      }
      return;
    }

    // Arrow Left → Replay audio (for listen type)
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      qzPlayAudio();
      return;
    }
  });

  // --- Answer handling ---
  window.qzAnswer = function(optIdx) {
    if (qzAnswered) return;
    qzAnswered = true;
    if (qzQTimerId) { clearInterval(qzQTimerId); qzQTimerId = null; }
    const q = qzQuestions[qzIdx];
    const showAnswer = $('#qz-show-answer')?.checked;
    const isTimeout = optIdx === -1;
    const userAnswer = isTimeout ? null : q.options[optIdx];
    const isCorrect = !isTimeout && userAnswer === q.correctAnswer;
    q.userAnswer = userAnswer;
    q.isCorrect = isCorrect;
    // Update SRS for this quiz word
    if (q.word && q.word.hanzi) {
      updateSrs(q.word.hanzi, isCorrect);
    }
    if (isCorrect) {
      qzScore++;
      qzStreak++;
      if (qzStreak > qzMaxStreak) qzMaxStreak = qzStreak;
    } else {
      qzStreak = 0;
      qzWrongList.push(q);
    }
    // Update streak badge
    const streakBadge = $('#qz-streak-badge');
    if (qzStreak >= 2) { streakBadge.classList.remove('hidden'); streakBadge.textContent = '🔥 ' + qzStreak; }
    else streakBadge.classList.add('hidden');
    // Highlight buttons
    const btns = document.querySelectorAll('.qz-opt-btn');
    btns.forEach((btn, i) => {
      btn.disabled = true;
      btn.classList.add('cursor-not-allowed');
      if (q.options[i] === q.correctAnswer) {
        btn.classList.remove('border-slate-200', 'hover:border-primary', 'hover:bg-blue-50');
        btn.classList.add('border-green-400', 'bg-green-50', 'text-green-800');
        btn.innerHTML = '✅ ' + btn.innerHTML;
      } else if (i === optIdx && !isCorrect) {
        btn.classList.remove('border-slate-200', 'hover:border-primary', 'hover:bg-blue-50');
        btn.classList.add('border-red-400', 'bg-red-50', 'text-red-700');
        btn.innerHTML = '❌ ' + btn.innerHTML;
      }
    });
    // Show feedback
    const fb = $('#qz-feedback');
    const fbc = $('#qz-feedback-content');
    fb.classList.remove('hidden');
    if (isCorrect) {
      fb.classList.remove('border-red-200', 'bg-red-50');
      fb.classList.add('border-green-200', 'bg-green-50');
      const msgs = ['🎉 Chính xác!', '👏 Xuất sắc!', '✨ Tuyệt vời!', '💪 Giỏi lắm!', '🏆 Đúng rồi!'];
      let correctHtml = `<div class="font-bold text-green-700">${msgs[Math.floor(Math.random()*msgs.length)]}</div>`;
      if (q.explanation) correctHtml += `<div class="mt-2 text-xs text-blue-700 bg-blue-50 rounded-lg p-2">💡 ${q.explanation}</div>`;
      fbc.innerHTML = correctHtml;
    } else {
      fb.classList.remove('border-green-200', 'bg-green-50');
      fb.classList.add('border-red-200', 'bg-red-50');
      let wrongHtml = isTimeout ? '<div class="font-bold text-red-700">⏰ Hết giờ!</div>' : '<div class="font-bold text-red-700">❌ Sai rồi!</div>';
      if (showAnswer) {
        const correctDisplay = (q.optionLabels && q.optionLabels[q.correctAnswer]) ? q.optionLabels[q.correctAnswer] : q.correctAnswer;
        wrongHtml += `<div class="mt-1 text-slate-600">Đáp án đúng: <strong class="text-green-700">${correctDisplay}</strong></div>`;
        wrongHtml += `<div class="mt-1 text-slate-500">${q.word.hanzi} · ${q.word.pinyin||''} · ${qzGetViDef(q.word)}</div>`;
        if (q.explanation) wrongHtml += `<div class="mt-2 text-xs text-blue-700 bg-blue-50 rounded-lg p-2">💡 ${q.explanation}</div>`;
      }
      fbc.innerHTML = wrongHtml;
    }
    // Show next button
    $('#qz-next-btn').classList.remove('hidden');
    // Auto-speak the word after answering (all quiz types)
    if (q.word && q.word.hanzi) {
      setTimeout(() => speakText(q.word.hanzi), 200);
    }
    if (qzIdx >= qzQuestions.length - 1) {
      $('#qz-next-btn').textContent = '📊 Xem kết quả';
    } else {
      $('#qz-next-btn').textContent = 'Câu tiếp theo →';
    }
  };

  // --- Next question ---
  window.qzNext = function() {
    qzIdx++;
    if (qzIdx >= qzQuestions.length) {
      qzShowResult();
    } else {
      // Reset timer fill color
      const fill = $('#qz-q-timer-fill');
      if (fill) { fill.classList.remove('bg-red-500'); fill.classList.add('bg-amber-400'); }
      qzRenderQuestion();
    }
  };

  // --- Stop ---
  window.qzStop = function() {
    if (!confirm('Dừng quiz?')) return;
    qzShowResult();
  };

  // --- Result ---
  function qzShowResult() {
    if (qzTimerId) { clearInterval(qzTimerId); qzTimerId = null; }
    if (qzQTimerId) { clearInterval(qzQTimerId); qzQTimerId = null; }
    const elapsed = Math.floor((Date.now() - qzTimerStart) / 1000);
    const m = Math.floor(elapsed/60), s = elapsed%60;
    const total = qzQuestions.length;
    const pct = total > 0 ? Math.round((qzScore/total)*100) : 0;
    $('#qz-play').classList.add('hidden'); $('#qz-result').classList.remove('hidden');
    // Emoji & badge
    let emoji = '🎉', badgeText = 'Xuất sắc!', badgeClass = 'bg-green-100 text-green-700';
    if (pct >= 90) { emoji = '🏆'; badgeText = 'Xuất sắc!'; badgeClass = 'bg-green-100 text-green-700'; }
    else if (pct >= 70) { emoji = '😊'; badgeText = 'Tốt lắm!'; badgeClass = 'bg-blue-100 text-blue-700'; }
    else if (pct >= 50) { emoji = '😐'; badgeText = 'Cần cải thiện'; badgeClass = 'bg-amber-100 text-amber-700'; }
    else { emoji = '😢'; badgeText = 'Cố gắng thêm!'; badgeClass = 'bg-red-100 text-red-700'; }
    $('#qz-result-emoji').textContent = emoji;
    const badge = $('#qz-result-badge');
    badge.textContent = badgeText; badge.className = `inline-flex items-center rounded-full px-4 py-1 text-sm font-bold mb-4 ${badgeClass}`;
    // Stats
    let statsH = `
      <div class="flex justify-between"><span class="text-slate-500">✅ Đúng</span><strong class="text-green-600">${qzScore}/${total} (${pct}%)</strong></div>
      <div class="flex justify-between"><span class="text-slate-500">❌ Sai</span><strong class="text-red-500">${qzWrongList.length}</strong></div>
      <div class="flex justify-between"><span class="text-slate-500">🔥 Chuỗi dài nhất</span><strong class="text-amber-600">${qzMaxStreak}</strong></div>
      <div class="flex justify-between"><span class="text-slate-500">⏱️ Thời gian</span><strong>${m}p ${s}s</strong></div>`;
    $('#qz-result-stats').innerHTML = statsH;
    // Progress bar update
    $('#qz-progress-bar').style.width = '100%';
    // Wrong answers list
    if (qzWrongList.length > 0) {
      $('#qz-result-wrong').classList.remove('hidden');
      $('#qz-replay-wrong-btn').classList.remove('hidden');
      let wHtml = '';
      for (const q of qzWrongList) {
        const correctDisplay = (q.optionLabels && q.optionLabels[q.correctAnswer]) ? q.optionLabels[q.correctAnswer] : q.correctAnswer;
        const userDisplay = q.userAnswer ? ((q.optionLabels && q.optionLabels[q.userAnswer]) ? q.optionLabels[q.userAnswer] : q.userAnswer) : '(hết giờ)';
        wHtml += `<div class="flex items-start gap-2 bg-white rounded-lg p-2 border">
          <span class="font-cn text-lg text-hanzi">${q.word.hanzi}</span>
          <div class="flex-1 min-w-0">
            <div class="text-xs text-slate-500">${q.typeLabel}</div>
            <div class="text-xs"><span class="text-red-500 line-through">${userDisplay}</span> → <span class="text-green-600 font-bold">${correctDisplay}</span></div>
          </div>
        </div>`;
      }
      $('#qz-wrong-list').innerHTML = wHtml;
    } else {
      $('#qz-result-wrong').classList.add('hidden');
      $('#qz-replay-wrong-btn').classList.add('hidden');
    }
    // Save session
    const sessions = JSON.parse(localStorage.getItem('cw_quiz_sessions') || '[]');
    sessions.push({ date: new Date().toISOString(), source: qzSource, total, correct: qzScore, wrong: qzWrongList.length, maxStreak: qzMaxStreak, time: elapsed, pct });
    if (sessions.length > 50) sessions.splice(0, sessions.length - 50);
    localStorage.setItem('cw_quiz_sessions', JSON.stringify(sessions));
    // Also record SRS history for dashboard
    const srsHist = srsLoadHistory();
    srsHist.push({ date: new Date().toISOString(), total, correct: qzScore, wrong: qzWrongList.length });
    if (srsHist.length > 100) srsHist.splice(0, srsHist.length - 100);
    srsSaveHistory(srsHist);
    srsUpdateStreak();
  }

  // --- Replay wrong ---
  window.qzReplayWrong = function() {
    if (!qzWrongList.length) return;
    const wrongWords = qzWrongList.map(q => q.word);
    qzSourceWords = wrongWords;
    qzQuestions = qzGenerateQuestions(wrongWords, qzSelectedTypes, wrongWords.length);
    if (!qzQuestions.length) { showToast('Không tạo được câu hỏi từ bộ sai'); return; }
    qzIdx = 0; qzScore = 0; qzStreak = 0; qzMaxStreak = 0; qzWrongList = []; qzAnswered = false;
    $('#qz-result').classList.add('hidden'); $('#qz-play').classList.remove('hidden');
    $('#qz-total').textContent = qzQuestions.length;
    qzTimerStart = Date.now(); if (qzTimerId) clearInterval(qzTimerId); qzTimerId = setInterval(qzUpdateTimer, 1000);
    qzRenderQuestion();
  };

  // --- Replay all ---
  window.qzReplayAll = function() {
    const words = qzGetWordsFromSource();
    if (words.length < 4) { qzBackToSetup(); return; }
    const count = parseInt($('#qz-count')?.value) || 20;
    qzSourceWords = words;
    qzQuestions = qzGenerateQuestions(words, qzSelectedTypes, count);
    if (!qzQuestions.length) { qzBackToSetup(); return; }
    qzIdx = 0; qzScore = 0; qzStreak = 0; qzMaxStreak = 0; qzWrongList = []; qzAnswered = false;
    $('#qz-result').classList.add('hidden'); $('#qz-play').classList.remove('hidden');
    $('#qz-total').textContent = qzQuestions.length;
    qzTimerStart = Date.now(); if (qzTimerId) clearInterval(qzTimerId); qzTimerId = setInterval(qzUpdateTimer, 1000);
    qzRenderQuestion();
  };

  // --- Back to setup ---
  window.qzBackToSetup = function() {
    $('#qz-result').classList.add('hidden'); $('#qz-play').classList.add('hidden'); $('#qz-setup').classList.remove('hidden');
  };

  // Override showPage to render radicals & flashcard when needed
  const _origShowPage = window.showPage;
  window.showPage = function (name) {
    _origShowPage(name);
    if (name === 'radicals') renderRadicalsPage();
    if (name === 'home') initWotd();
    if (name === 'flashcard') {
      const setup = $('#fc-setup'), play = $('#fc-play'), result = $('#fc-result');
      if (setup && play && result && play.classList.contains('hidden') && result.classList.contains('hidden')) {}
    }
    if (name === 'quiz') {
      const setup = $('#qz-setup'), play = $('#qz-play'), result = $('#qz-result');
      if (setup && play && result && play.classList.contains('hidden') && result.classList.contains('hidden')) {}
    }
    if (name === 'srs') srsLoadDashboard();
  };

  // ====================================================================
  // ===== FEATURE: WORD OF THE DAY (Từ của ngày) =====
  // ====================================================================
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
      const dateStr = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
      const idx = getWotdIndex(dateStr) % allWords.length;
      wotdWord = allWords[idx];
      const el = $('#wotd-date');
      if (el) el.textContent = today.toLocaleDateString('vi-VN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
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
    const srs = getSrsData(w.hanzi);
    const srsEl = $('#wotd-srs-info');
    if (srs && srsEl) {
      srsEl.classList.remove('hidden');
      const lvLabels = ['Mới','Đang học','Ôn tập','Quen thuộc','Nhớ lâu','Thành thạo'];
      srsEl.textContent = '📊 SRS: ' + (lvLabels[srs.level]||'Mới') + ' · Ôn lại: ' + srs.nextReview;
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
        ctx.scale(140/1024, -140/1024);
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
        `<span class="inline-flex items-center gap-1 bg-white border rounded-lg px-2 py-1 text-sm cursor-pointer hover:border-primary hover:shadow transition-all" onclick="openDetailByHanzi('${r.hanzi.replace(/'/g,"\\'")}')">
          <span class="font-cn font-bold text-hanzi">${r.hanzi}</span>
          <span class="text-xs text-slate-400">${(r.vietnamese||r.english||'').split(/[;；]/)[0].trim().substring(0,15)}</span>
        </span>`
      ).join('');
    } else if (relSec) {
      relSec.classList.add('hidden');
    }
  }

  window.wotdSpeak = function() { if (wotdWord) speakText(wotdWord.hanzi); };
  window.wotdStroke = function() { if (wotdWord) { showPage('stroke'); strokeQuick(wotdWord.hanzi); } };
  window.wotdBookmark = function() { if (wotdWord) showBookmarkPicker(wotdWord.hanzi); };
  window.wotdNext = function() {
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
  window.getRelatedWordsHtml = function(hanzi) {
    const related = findRelatedWords(hanzi, 15);
    if (!related.length) return '';
    const chips = related.map(r => {
      const vi = (r.vietnamese || r.english || '').split(/[;；]/)[0].trim().substring(0, 20);
      return `<span class="inline-flex items-center gap-1 bg-white border rounded-lg px-2.5 py-1.5 text-sm cursor-pointer hover:border-primary hover:shadow-md transition-all" onclick="openDetailByHanzi('${r.hanzi.replace(/'/g,"\\'")}')">
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
  // ===== FEATURE: SPACED REPETITION SYSTEM (SRS) =====
  // ====================================================================
  const SRS_KEY = 'cw_srs';

  function loadSrs() {
    try { return JSON.parse(localStorage.getItem(SRS_KEY)) || {}; } catch(e) { return {}; }
  }
  function saveSrs(data) { localStorage.setItem(SRS_KEY, JSON.stringify(data)); }

  function getSrsData(hanzi) {
    const d = loadSrs();
    return d[hanzi] || null;
  }

  function updateSrs(hanzi, correct) {
    const d = loadSrs();
    if (!d[hanzi]) {
      d[hanzi] = { level: 0, interval: 1, easeFactor: 2.5, correct: 0, wrong: 0, nextReview: todayStr(), lastReview: todayStr() };
    }
    const card = d[hanzi];
    card.lastReview = todayStr();
    if (correct) {
      card.correct++;
      if (card.level < 5) card.level++;
      // SM-2 simplified intervals: 1, 3, 7, 14, 30, 60
      const intervals = [1, 3, 7, 14, 30, 60];
      card.interval = intervals[Math.min(card.level, 5)];
      card.easeFactor = Math.max(1.3, card.easeFactor + 0.1);
    } else {
      card.wrong++;
      card.level = 0;
      card.interval = 1;
      card.easeFactor = Math.max(1.3, card.easeFactor - 0.2);
    }
    // Calculate next review date
    const next = new Date();
    next.setDate(next.getDate() + card.interval);
    card.nextReview = next.getFullYear() + '-' + String(next.getMonth()+1).padStart(2,'0') + '-' + String(next.getDate()).padStart(2,'0');
    d[hanzi] = card;
    saveSrs(d);
    return card;
  }

  function todayStr() {
    const t = new Date();
    return t.getFullYear() + '-' + String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0');
  }

  function getDueWords() {
    const d = loadSrs();
    const today = todayStr();
    const due = [];
    for (const [hanzi, card] of Object.entries(d)) {
      if (card.nextReview <= today) {
        const w = allWords.find(x => x.hanzi === hanzi);
        if (w) due.push(w);
      }
    }
    return due;
  }

  // Hook into flashcard answer to update SRS
  // (Integrated directly into fcAnswer and qzAnswer below - no monkey-patching needed)

  // Expose SRS due count for UI
  window.getSrsDueCount = function() { return getDueWords().length; };
  window.getSrsDueWords = function() { return getDueWords(); };
  window.updateSrs = updateSrs;
  window.getSrsData = getSrsData;

  // ===== SRS DASHBOARD =====
  const SRS_HISTORY_KEY = 'cw_srs_history';
  const SRS_STREAK_KEY = 'cw_srs_streak';

  function srsLoadHistory() { try { return JSON.parse(localStorage.getItem(SRS_HISTORY_KEY)) || []; } catch(e) { return []; } }
  function srsSaveHistory(h) { localStorage.setItem(SRS_HISTORY_KEY, JSON.stringify(h)); }
  function srsLoadStreak() { try { return JSON.parse(localStorage.getItem(SRS_STREAK_KEY)) || { count: 0, lastDate: '' }; } catch(e) { return { count: 0, lastDate: '' }; } }
  function srsSaveStreak(s) { localStorage.setItem(SRS_STREAK_KEY, JSON.stringify(s)); }

  function srsUpdateStreak() {
    const s = srsLoadStreak();
    const today = todayStr();
    if (s.lastDate === today) return s; // already updated today
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yStr = yesterday.getFullYear() + '-' + String(yesterday.getMonth()+1).padStart(2,'0') + '-' + String(yesterday.getDate()).padStart(2,'0');
    if (s.lastDate === yStr) { s.count++; } else if (s.lastDate !== today) { s.count = 1; }
    s.lastDate = today;
    srsSaveStreak(s);
    return s;
  }

  function srsLoadDashboard() {
    const d = loadSrs();
    const today = todayStr();
    const entries = Object.entries(d);
    const total = entries.length;
    const due = getDueWords();
    const dueCount = due.length;
    const mastered = entries.filter(([,c]) => c.level >= 5).length;
    const streak = srsLoadStreak();

    // Overview cards
    const dueEl = document.getElementById('srs-due-count');
    const totalEl = document.getElementById('srs-total-count');
    const masteredEl = document.getElementById('srs-mastered-count');
    const streakEl = document.getElementById('srs-streak-days');
    if (dueEl) dueEl.textContent = dueCount;
    if (totalEl) totalEl.textContent = total;
    if (masteredEl) masteredEl.textContent = mastered;
    if (streakEl) streakEl.textContent = streak.count;

    // Start area
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

    // Level distribution bars
    const lvLabels = ['Mới', 'Đang học', 'Ôn tập', 'Quen thuộc', 'Nhớ lâu', 'Thành thạo'];
    const lvColors = ['bg-red-400', 'bg-orange-400', 'bg-yellow-400', 'bg-green-400', 'bg-blue-400', 'bg-purple-400'];
    const lvEmoji = ['🔴', '🟠', '🟡', '🟢', '🔵', '🟣'];
    const lvCounts = [0, 0, 0, 0, 0, 0];
    for (const [, card] of entries) { lvCounts[Math.min(card.level || 0, 5)]++; }
    const barsEl = document.getElementById('srs-level-bars');
    if (barsEl) {
      if (total === 0) {
        barsEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Chưa có dữ liệu. Ôn tập Flashcard/Quiz để bắt đầu.</p>';
      } else {
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

    // Due words list
    const dueListEl = document.getElementById('srs-due-list');
    if (dueListEl) {
      if (!due.length) {
        dueListEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Không có từ nào cần ôn</p>';
      } else {
        const shown = due.slice(0, 30);
        dueListEl.innerHTML = '<div class="flex flex-wrap gap-1.5">' + shown.map(w => {
          const srsCard = d[w.hanzi];
          const lvIdx = srsCard ? Math.min(srsCard.level || 0, 5) : 0;
          const vi = (w.vietnamese || w.english || '').split(/[;；]/)[0].trim().substring(0, 15);
          return `<span class="inline-flex items-center gap-1 bg-white border rounded-lg px-2 py-1.5 text-sm cursor-pointer hover:border-primary hover:shadow transition-all" onclick="openDetailByHanzi('${w.hanzi.replace(/'/g,"\\'")}')">
            <span class="text-[10px]">${lvEmoji[lvIdx]}</span>
            <span class="font-cn font-bold text-hanzi">${w.hanzi}</span>
            <span class="text-xs text-slate-400">${vi}</span>
          </span>`;
        }).join('') + '</div>' + (due.length > 30 ? `<p class="text-xs text-slate-400 mt-2">+${due.length - 30} từ nữa</p>` : '');
      }
    }

    // History
    const histEl = document.getElementById('srs-history');
    const hist = srsLoadHistory();
    if (histEl) {
      if (!hist.length) {
        histEl.innerHTML = '<p class="text-sm text-slate-400 text-center py-4">Chưa có dữ liệu</p>';
      } else {
        const recent = hist.slice(-10).reverse();
        histEl.innerHTML = '<div class="space-y-2">' + recent.map(h => {
          const d = new Date(h.date);
          const dateStr = d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'short' });
          const timeStr = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
          return `<div class="flex items-center justify-between text-sm py-1.5 border-b border-slate-50 last:border-0">
            <span class="text-slate-500">${dateStr} ${timeStr}</span>
            <span>✅ ${h.correct || 0} · ❌ ${h.wrong || 0} · <span class="text-slate-400">${h.total || 0} từ</span></span>
          </div>`;
        }).join('') + '</div>';
      }
    }
  }

  window.srsStartReview = function() {
    const due = getDueWords();
    if (!due.length) { showToast('Không có từ cần ôn!'); return; }
    // Use flashcard system with SRS source
    fcSource = 'custom'; // we'll manually set deck
    fcMode = 'review';
    fcDeck = due;
    // Shuffle
    for (let i = fcDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [fcDeck[i], fcDeck[j]] = [fcDeck[j], fcDeck[i]];
    }
    fcIdx = 0; fcFlipped = false; fcCorrect = 0; fcWrong = 0; fcReviewed = 0;
    fcWrongList = []; fcTotalCards = fcDeck.length; fcCorrectSet = new Set();
    fcBoxes = { 1: fcDeck.map(w => ({ word: w, wrongCount: 0 })), 2: [], 3: [] };
    fcQueue = [...fcBoxes[1]];

    // Switch to flashcard page play mode
    showPage('flashcard');
    $('#fc-setup').classList.add('hidden');
    $('#fc-play').classList.remove('hidden');
    $('#fc-result').classList.add('hidden');
    $('#fc-progress-total').textContent = fcTotalCards;
    $('#fc-ctrl-browse').classList.add('hidden');
    $('#fc-ctrl-review').classList.remove('hidden');
    $('#fc-boxes').classList.remove('hidden');
    fcTimerStart = Date.now();
    if (fcTimerId) clearInterval(fcTimerId);
    fcTimerId = setInterval(fcUpdateTimer, 1000);
    fcNextReviewCard();
    fcUpdateProgress();
    fcUpdateBoxCounts();
    fcSetupSwipe();

    // fcAnswer already calls updateSrs() directly — no need to wrap it here
    // fcShowResult already records SRS history — no need for duplicate interval check
  };

  window.srsReset = function() {
    if (!confirm('Xóa toàn bộ dữ liệu SRS? Hành động không thể hoàn tác.')) return;
    localStorage.removeItem(SRS_KEY);
    localStorage.removeItem(SRS_HISTORY_KEY);
    localStorage.removeItem(SRS_STREAK_KEY);
    showToast('Đã xóa dữ liệu SRS');
    srsLoadDashboard();
  };

  // ====================================================================
  // ===== FEATURE: READER MODE (Đọc hiểu văn bản) =====
  // ====================================================================
  let readerTokens = [];
  let readerPinyinVisible = false;
  let readerOrigText = '';

  // Build a dictionary lookup for fast tokenization
  function buildDict() {
    const dict = new Set();
    for (const w of allWords) dict.add(w.hanzi);
    return dict;
  }

  // Greedy max-match tokenizer (left-to-right, longest match first)
  function readerTokenize(text) {
    const dict = buildDict();
    const maxLen = 6; // max word length to try
    const tokens = [];
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      // If not a CJK character, group non-CJK together
      if (!isCJK(ch)) {
        let j = i + 1;
        while (j < text.length && !isCJK(text[j])) j++;
        tokens.push({ text: text.substring(i, j), type: 'other' });
        i = j;
        continue;
      }
      // Try longest match first
      let matched = false;
      for (let len = Math.min(maxLen, text.length - i); len > 1; len--) {
        const candidate = text.substring(i, i + len);
        if (dict.has(candidate)) {
          tokens.push({ text: candidate, type: 'word' });
          i += len;
          matched = true;
          break;
        }
      }
      if (!matched) {
        // Single character - check allWords first, then characters dict
        const w = allWords.find(x => x.hanzi === ch);
        if (w) {
          tokens.push({ text: ch, type: 'word' });
        } else if (characters[ch]) {
          tokens.push({ text: ch, type: 'known_char' });
        } else {
          tokens.push({ text: ch, type: 'char' });
        }
        i++;
      }
    }
    return tokens;
  }

  function isCJK(ch) {
    const code = ch.charCodeAt(0);
    return (code >= 0x4E00 && code <= 0x9FFF) || (code >= 0x3400 && code <= 0x4DBF) || (code >= 0x2E80 && code <= 0x2EFF);
  }

  function getHskColor(level) {
    if (!level) return { bg: 'bg-slate-50', text: 'text-slate-500', border: 'border-slate-200', label: 'Ngoài HSK' };
    if (level <= 2) return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200', label: 'HSK ' + level };
    if (level <= 4) return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', label: 'HSK ' + level };
    if (level <= 6) return { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'HSK ' + level };
    return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'HSK ' + level };
  }

  window.readerAnalyze = function() {
    const input = $('#reader-input').value.trim();
    if (!input) return;
    readerOrigText = input;
    readerPinyinVisible = false;
    readerTokens = readerTokenize(input);

    // Stats
    const wordTokens = readerTokens.filter(t => t.type === 'word');
    const uniqueWords = [...new Set(wordTokens.map(t => t.text))];
    const unknownTokens = readerTokens.filter(t => t.type === 'char');
    const uniqueUnknown = [...new Set(unknownTokens.map(t => t.text))];

    $('#reader-stat-total').textContent = wordTokens.length;
    $('#reader-stat-unique').textContent = uniqueWords.length;
    $('#reader-stat-unknown').textContent = uniqueUnknown.length;

    // HSK distribution
    const hskDist = {};
    for (const tok of wordTokens) {
      const w = allWords.find(x => x.hanzi === tok.text);
      const lv = w ? w.hsk : 0;
      const key = lv || 'N/A';
      hskDist[key] = (hskDist[key] || 0) + 1;
    }
    const distEl = $('#reader-hsk-dist');
    distEl.innerHTML = Object.entries(hskDist).sort((a,b) => {
      const na = parseInt(a[0]) || 99, nb = parseInt(b[0]) || 99;
      return na - nb;
    }).map(([k, v]) => {
      const c = getHskColor(parseInt(k) || 0);
      return `<span class="text-xs px-2 py-0.5 rounded ${c.bg} ${c.text}">HSK${k}: ${v}</span>`;
    }).join('');

    // Render annotated text
    renderReaderText();

    $('#reader-input-area').classList.add('hidden');
    $('#reader-results').classList.remove('hidden');
  };

  function renderReaderText() {
    const el = $('#reader-text');
    el.innerHTML = readerTokens.map((tok, idx) => {
      if (tok.type === 'other') {
        return `<span>${tok.text.replace(/\n/g, '<br>')}</span>`;
      }
      const w = allWords.find(x => x.hanzi === tok.text);
      const charInfo = (!w && tok.text.length === 1) ? characters[tok.text] : null;
      const hsk = w ? w.hsk : 0;
      const c = getHskColor(hsk);
      // Get pinyin from allWords first, then from characters.json
      const pinyin = w ? w.pinyin : (charInfo && charInfo.pinyin ? charInfo.pinyin : '');
      const pinyinHtml = readerPinyinVisible && pinyin ? `<span class="text-[10px] ${c.text} block leading-tight">${pinyin}</span>` : '';
      const cls = tok.type === 'char' ? 'underline decoration-dotted decoration-red-300' : 
                  (tok.type === 'known_char' ? 'underline decoration-dotted decoration-amber-300' : '');
      return `<ruby class="inline-block cursor-pointer px-0.5 py-0.5 rounded ${c.bg} border ${c.border} hover:shadow-md transition-all ${cls}" onclick="readerShowPopup(event, ${idx})">${pinyinHtml ? `<span class="flex flex-col items-center">${pinyinHtml}<span class="font-cn font-bold">${tok.text}</span></span>` : `<span class="font-cn font-bold">${tok.text}</span>`}</ruby>`;
    }).join('');
  }

  window.readerClosePopup = function() {
    const p = document.getElementById('reader-popup');
    if (p) p.classList.add('hidden');
  };

  window.readerShowPopup = function(e, idx) {
    const tok = readerTokens[idx];
    if (!tok) return;
    const popup = $('#reader-popup');
    const content = $('#reader-popup-content');
    const w = allWords.find(x => x.hanzi === tok.text);
    const tokEsc = tok.text.replace(/'/g, "\\'");

    let html = `<div class="flex items-center justify-between mb-2">
      <span class="font-cn text-3xl font-bold text-hanzi">${tok.text}</span>
      <button onclick="readerClosePopup()" class="text-slate-400 hover:text-red-500 text-xl">✕</button>
    </div>`;

    if (w) {
      html += `<div class="text-sm text-primary font-medium mb-1">${w.pinyin}</div>`;
      html += `<div class="text-xs px-2 py-0.5 rounded-full inline-block mb-2 ${getHskColor(w.hsk).bg} ${getHskColor(w.hsk).text} font-bold">HSK ${w.hsk}</div>`;
      if (w.vietnamese) html += `<div class="text-sm mb-1">🇻🇳 ${w.vietnamese.split(/[;；]/).slice(0,3).join('; ')}</div>`;
      if (w.english) html += `<div class="text-xs text-slate-400 mb-2">🇬🇧 ${w.english.split(/[;；]/).slice(0,3).join('; ')}</div>`;
      html += `<div class="flex flex-wrap gap-2 mt-2">
        <button onclick="speakText('${tokEsc}')" class="text-xs px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-dark">🔊 Phát âm</button>
        <button onclick="readerClosePopup();openDetailByHanzi('${tokEsc}')" class="text-xs px-3 py-1.5 border border-primary text-primary rounded-lg hover:bg-blue-50">📖 Chi tiết</button>
        <button onclick="addToBookmark('${tokEsc}')" class="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50">🔖 Lưu</button>
        <button onclick="readerClosePopup();strokeQuick('${tokEsc}')" class="text-xs px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50">✏️ Bút thuận</button>
      </div>`;
    } else {
      // Check characters.json for pinyin/definition
      const charInfo = (tok.text.length === 1) ? characters[tok.text] : null;
      if (charInfo) {
        if (charInfo.pinyin) html += `<div class="text-sm text-primary font-medium mb-1">${charInfo.pinyin}</div>`;
        html += `<div class="text-xs px-2 py-0.5 rounded-full inline-block mb-2 bg-amber-50 text-amber-600 font-bold">Ngoài HSK</div>`;
        if (charInfo.vietnamese) html += `<div class="text-sm mb-1">🇻🇳 ${charInfo.vietnamese}</div>`;
        if (charInfo.def) html += `<div class="text-xs text-slate-400 mb-2">🇬🇧 ${charInfo.def}</div>`;
        if (charInfo.radical) {
          const radInfo = radicals[charInfo.radical];
          const radLabel = radInfo ? `${charInfo.radical} ${radInfo.viet}` : charInfo.radical;
          html += `<div class="text-xs text-slate-400 mb-2">Bộ thủ: <strong class="text-slate-600">${radLabel}</strong> · ${charInfo.strokeCount || '?'} nét</div>`;
        }
      } else {
        html += `<div class="text-sm text-slate-400 mt-2">Không tìm thấy trong từ điển</div>`;
        html += `<div class="text-xs text-slate-300 mt-1">Ký tự này chưa có trong hệ thống dữ liệu</div>`;
      }
      // Offer speak and stroke buttons
      html += `<div class="flex flex-wrap gap-2 mt-2">
        <button onclick="speakText('${tokEsc}')" class="text-xs px-3 py-1.5 bg-primary text-white rounded-lg hover:bg-primary-dark">🔊 Phát âm</button>
        ${charInfo ? `<button onclick="readerClosePopup();strokeQuick('${tokEsc}')" class="text-xs px-3 py-1.5 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50">✏️ Bút thuận</button>` : ''}
        <button onclick="addToBookmark('${tokEsc}')" class="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50">🔖 Lưu</button>
      </div>`;
    }
    content.innerHTML = html;
    popup.classList.remove('hidden');

    // Position near click - smart positioning
    const rect = e.target.getBoundingClientRect();
    const popW = 288; // w-72 = 18rem = 288px
    let leftPos = Math.max(8, Math.min(rect.left, window.innerWidth - popW - 8));
    let topPos = rect.bottom + 8;
    // If popup would go below viewport, show above instead
    if (rect.bottom + 300 > window.innerHeight) {
      topPos = rect.top - 8 - 200;
      if (topPos < 0) topPos = rect.bottom + 8;
    }
    popup.style.left = leftPos + 'px';
    popup.style.top = topPos + 'px';
  };

  // Close popup when clicking outside
  document.addEventListener('click', function(e) {
    const popup = $('#reader-popup');
    if (popup && !popup.classList.contains('hidden') && !popup.contains(e.target) && !e.target.closest('#reader-text ruby')) {
      popup.classList.add('hidden');
    }
  });

  window.readerTogglePinyin = function() {
    readerPinyinVisible = !readerPinyinVisible;
    const btn = $('#reader-pinyin-btn');
    btn.textContent = readerPinyinVisible ? '拼 Ẩn Pinyin' : '拼 Hiện Pinyin';
    renderReaderText();
  };

  window.readerSaveUnknown = function() {
    const unknowns = [...new Set(readerTokens.filter(t => t.type === 'char').map(t => t.text))];
    if (!unknowns.length) { showToast('Không có từ chưa biết!'); return; }
    const sets = loadBookmarks();
    let targetSet = sets.find(s => s.name === 'Reader - Từ chưa biết');
    if (!targetSet) {
      targetSet = { id: Date.now().toString(), name: 'Reader - Từ chưa biết', words: [], created: new Date().toISOString() };
      sets.push(targetSet);
    }
    let added = 0;
    for (const ch of unknowns) {
      if (!targetSet.words.includes(ch)) { targetSet.words.push(ch); added++; }
    }
    saveBookmarks(sets);
    showToast(`Đã lưu ${added} từ vào "Reader - Từ chưa biết"`);
  };

  // Expose these functions globally so inline onclick in reader popup works
  window.speakText = speakText;
  window.showBookmarkPicker = showBookmarkPicker;

  window.readerSpeakAll = function() {
    const text = readerOrigText;
    if (!text) return;
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; u.rate = 0.7;
      const v = speechSynthesis.getVoices().find(v => v.lang.startsWith('zh'));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    }
  };

  window.readerTranslateVi = function() {
    if (!readerOrigText) return;
    const transEl = document.getElementById('reader-translation');
    const contentEl = document.getElementById('reader-translation-content');
    const btn = document.getElementById('reader-translate-btn');
    if (!transEl || !contentEl) return;

    // If already visible, hide it (toggle behavior)
    if (!transEl.classList.contains('hidden')) {
      transEl.classList.add('hidden');
      if (btn) btn.textContent = '🇻🇳 Dịch Việt';
      return;
    }

    // Show loading state
    contentEl.innerHTML = '<div class="flex items-center gap-2 text-slate-400"><div class="w-4 h-4 border-2 border-slate-300 border-t-primary rounded-full spinner"></div> Đang dịch bằng Google Translate...</div>';
    transEl.classList.remove('hidden');
    if (btn) btn.textContent = '🇻🇳 Ẩn dịch';

    // Use Google Translate free API
    const text = readerOrigText.substring(0, 5000); // limit length
    const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=vi&dt=t&q=' + encodeURIComponent(text);

    fetch(url)
      .then(r => r.json())
      .then(data => {
        // Google returns array: data[0] = array of [translated, original, ...]
        let translated = '';
        if (data && data[0]) {
          for (const segment of data[0]) {
            if (segment && segment[0]) translated += segment[0];
          }
        }
        if (translated) {
          contentEl.innerHTML = `<div class="text-base leading-relaxed">${translated.replace(/\n/g, '<br>')}</div>`;
        } else {
          contentEl.innerHTML = '<span class="text-red-500">Không thể dịch. Hãy thử lại.</span>';
        }
      })
      .catch(err => {
        contentEl.innerHTML = `<span class="text-red-500">Lỗi kết nối: ${err.message}. Kiểm tra internet.</span>`;
      });
  };

  window.readerHideTranslation = function() {
    const transEl = document.getElementById('reader-translation');
    const btn = document.getElementById('reader-translate-btn');
    if (transEl) transEl.classList.add('hidden');
    if (btn) btn.textContent = '🇻🇳 Dịch Việt';
  };

  window.readerReset = function() {
    $('#reader-input-area').classList.remove('hidden');
    $('#reader-results').classList.add('hidden');
    $('#reader-popup').classList.add('hidden');
    readerTokens = [];
    readerOrigText = '';
  };

  window.readerLoadSample = function() {
    const samples = [
      '今天天气很好，我和朋友一起去公园散步。我们看到了很多美丽的花，还有一些小鸟在树上唱歌。公园里有很多人在锻炼身体，有的人在跑步，有的人在打太极拳。',
      '学习中文需要很多时间和耐心。每天我都会花两个小时练习听力和阅读。虽然汉字很难写，但是我觉得很有意思。我的老师说，只要坚持学习，一定能学好中文。',
      '中国有很长的历史和丰富的文化。从古代的四大发明到现代的高速铁路，中国人一直在创新和发展。中国的美食也非常有名，每个地方都有自己的特色菜。',
      '上个周末我去了一家中国餐厅吃饭。我点了宫保鸡丁、麻婆豆腐和一碗米饭。服务员很友好，用中文跟我说话。虽然我听不太懂，但是我很高兴能练习中文。',
      '北京是中国的首都，也是一个非常古老的城市。这里有很多名胜古迹，比如长城、故宫和天坛。每年都有很多游客从世界各地来北京旅游。北京的冬天很冷，但是夏天很热。'
    ];
    $('#reader-input').value = samples[Math.floor(Math.random() * samples.length)];
  };

  // ====================================================================
  // ===== INJECT RELATED WORDS INTO DETAIL PAGE =====
  // ====================================================================
  // Monkey-patch openDetail to add related words section
  const _origOpenDetail = window.openDetailByHanzi ? null : undefined;
  // We'll inject via a MutationObserver on detail-content
  const detailObserver = new MutationObserver(function() {
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

  // ===== GRAMMAR PAGE =====
  let grammarData = [], gramFiltered = [], gramSelectedHsk = 0, gramPage = 0;
  const GRAM_PAGE_SIZE = 15;

  async function loadGrammar() {
    try {
      const resp = await fetch('data/grammar.json');
      grammarData = await resp.json();
      const gl = $('#gram-loading');
      if (gl) gl.classList.add('hidden');
      buildGramChips();
      gramApplyFilters();
      const gc = $('#gram-count');
      if (gc) gc.textContent = grammarData.length + ' điểm ngữ pháp';
    } catch (e) {
      const gl = $('#gram-loading');
      if (gl) gl.innerHTML = '<div class="text-center py-16 text-slate-400"><div class="text-5xl mb-3">📐</div><p>Chưa có dữ liệu ngữ pháp. Chạy generate_grammar.py để tạo.</p></div>';
    }
  }

  function buildGramChips() {
    const levels = [...new Set(grammarData.map(g => g.hsk_level))].sort((a, b) => a - b);
    let html = '<button class="hsk-chip active" data-lv="0" onclick="gramFilterHsk(0)">Tất cả</button>';
    for (const lv of levels) {
      const count = grammarData.filter(g => g.hsk_level === lv).length;
      html += `<button class="hsk-chip" data-lv="${lv}" onclick="gramFilterHsk(${lv})">HSK ${lv} <span class="text-xs opacity-60">(${count})</span></button>`;
    }
    $('#gram-chips').innerHTML = html;
  }

  window.gramFilterHsk = function(lv) {
    gramSelectedHsk = lv;
    $$('#gram-chips .hsk-chip').forEach(c => c.classList.toggle('active', parseInt(c.dataset.lv) === lv));
    gramApplyFilters();
  };

  window.gramSearch = function() {
    gramApplyFilters();
  };

  function gramApplyFilters() {
    const q = ($('#gram-search')?.value || '').trim().toLowerCase();
    gramFiltered = grammarData.filter(g => {
      if (gramSelectedHsk > 0 && g.hsk_level !== gramSelectedHsk) return false;
      if (q) {
        const searchable = [g.pattern, g.name_vi, g.explanation_vi, g.structure, g.note_vi,
          ...(g.examples || []).map(e => e.zh + ' ' + e.vi + ' ' + e.pinyin),
          ...(g.related_words || [])
        ].join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      return true;
    });
    gramPage = 0;
    gramRender();
  }

  function gramRender() {
    const list = $('#gram-list');
    const empty = $('#gram-empty');
    const more = $('#gram-more');
    if (!list) return;
    const end = (gramPage + 1) * GRAM_PAGE_SIZE;
    const items = gramFiltered.slice(0, end);
    if (items.length === 0) {
      list.innerHTML = '';
      empty.classList.remove('hidden');
      more.classList.add('hidden');
      return;
    }
    empty.classList.add('hidden');
    more.classList.toggle('hidden', end >= gramFiltered.length);
    list.innerHTML = items.map((g, i) => {
      const exHtml = (g.examples || []).map(ex =>
        `<div class="bg-white rounded-lg p-3 border"><div class="font-cn text-base text-hanzi">${ex.zh}</div><div class="text-xs text-primary">${ex.pinyin}</div><div class="text-sm text-slate-600">${ex.vi}</div></div>`
      ).join('');
      const relHtml = (g.related_words || []).map(w =>
        `<span class="inline-block px-2 py-0.5 bg-blue-50 text-primary text-xs rounded-full font-cn cursor-pointer hover:bg-blue-100" onclick="gramRelatedClick('${w}')">${w}</span>`
      ).join(' ');
      return `<div class="bg-white border-2 rounded-xl p-5 hover:border-blue-200 hover:shadow-md transition-all">
        <div class="flex items-start justify-between mb-2">
          <div>
            <span class="font-cn text-2xl font-bold text-hanzi">${g.pattern}</span>
            <span class="hsk-badge hsk-badge-${g.hsk_level} ml-2">HSK ${g.hsk_level}</span>
          </div>
        </div>
        <div class="text-base font-medium text-primary mb-1">${g.name_vi || ''}</div>
        <div class="text-sm text-slate-500 mb-1"><strong>Cấu trúc:</strong> <code class="bg-slate-100 px-2 py-0.5 rounded text-xs">${g.structure || ''}</code></div>
        <div class="text-sm text-slate-600 mb-3">${g.explanation_vi || ''}</div>
        <div class="grid gap-2 mb-3">${exHtml}</div>
        ${g.note_vi ? `<div class="text-xs text-amber-700 bg-amber-50 rounded-lg p-2 mb-2">💡 ${g.note_vi}</div>` : ''}
        ${relHtml ? `<div class="mt-2">${relHtml}</div>` : ''}
      </div>`;
    }).join('');
  }

  window.gramLoadMore = function() {
    gramPage++;
    gramRender();
  };

  window.gramRelatedClick = function(w) {
    const input = $('#gram-search');
    if (input) { input.value = w; gramApplyFilters(); }
  };

  // Load grammar when page shown
  const _origShowPageForGrammar = window.showPage;
  window.showPage = function(page) {
    if (typeof _origShowPageForGrammar === 'function') _origShowPageForGrammar(page);
    if (page === 'grammar' && grammarData.length === 0) loadGrammar();
  };

  // ===== START =====
  init().then(() => { initWotd(); });
  loadAudioManifest(); // Pre-load audio manifest for fast MP3 lookup
  initVisitorCounter();
})();
