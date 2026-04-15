// js/core.js — Core: namespace, data, helpers, routing, bookmarks, audio, toast
(function () {
  'use strict';

  // ===== GLOBAL NAMESPACE =====
  const CW = window.CW = {};
  const $ = CW.$ = s => document.querySelector(s);
  const $$ = CW.$$ = s => document.querySelectorAll(s);

  // Pinyin tone marks → base letter mapping for search
  const toneMap = {
    'ā':'a','á':'a','ǎ':'a','à':'a','ē':'e','é':'e','ě':'e','è':'e',
    'ī':'i','í':'i','ǐ':'i','ì':'i','ō':'o','ó':'o','ǒ':'o','ò':'o',
    'ū':'u','ú':'u','ǔ':'u','ù':'u','ǖ':'ü','ǘ':'ü','ǚ':'ü','ǜ':'ü',
    'ü':'v'
  };
  CW.stripTones = function (str) {
    return str.toLowerCase().replace(/./g, ch => toneMap[ch] || ch);
  };

  // ===== DATA (shared arrays/objects — populated via push/assign in init to preserve references) =====
  CW.allWords = [];
  CW.characters = {};
  CW.radicals = {};
  CW.contextQuizData = [];

  // ===== HOOK SYSTEM =====
  CW._pageHooks = {};
  CW.registerPageHook = function (page, fn) {
    if (!CW._pageHooks[page]) CW._pageHooks[page] = [];
    CW._pageHooks[page].push(fn);
  };
  CW._initCallbacks = [];
  CW.onDataLoaded = function (fn) { CW._initCallbacks.push(fn); };

  // ===== TOAST =====
  CW.showToast = function (msg, type) {
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
  };

  // ===== BOOKMARK SYSTEM =====
  const BM_KEY = 'cw_bookmarks';

  CW.loadBookmarks = function () {
    try { const raw = localStorage.getItem(BM_KEY); return raw ? JSON.parse(raw) : []; }
    catch (e) { return []; }
  };
  CW.saveBookmarks = function (sets) { localStorage.setItem(BM_KEY, JSON.stringify(sets)); };

  window.createBookmarkSet = function (prefillName) {
    const name = prompt('Đặt tên cho bộ từ vựng mới:', prefillName || 'Bộ từ ' + (CW.loadBookmarks().length + 1));
    if (!name || !name.trim()) return null;
    const sets = CW.loadBookmarks();
    const newSet = { id: Date.now().toString(), name: name.trim(), words: [], created: new Date().toISOString() };
    sets.push(newSet);
    CW.saveBookmarks(sets);
    renderBookmarksPage();
    return newSet.id;
  };

  window.renameBookmarkSet = function (id) {
    const sets = CW.loadBookmarks();
    const s = sets.find(x => x.id === id);
    if (!s) return;
    const name = prompt('Đổi tên bộ:', s.name);
    if (!name || !name.trim()) return;
    s.name = name.trim();
    CW.saveBookmarks(sets);
    renderBookmarksPage();
  };

  window.deleteBookmarkSet = function (id) {
    if (!confirm('Xóa bộ từ vựng này? Hành động không thể hoàn tác.')) return;
    const sets = CW.loadBookmarks().filter(x => x.id !== id);
    CW.saveBookmarks(sets);
    renderBookmarksPage();
  };

  window.removeWordFromSet = function (setId, hanzi) {
    const sets = CW.loadBookmarks();
    const s = sets.find(x => x.id === setId);
    if (!s) return;
    s.words = s.words.filter(w => w !== hanzi);
    CW.saveBookmarks(sets);
    renderBookmarksPage();
  };

  window.addToBookmark = function (hanzi) {
    const sets = CW.loadBookmarks();
    if (!sets.length) {
      const id = createBookmarkSet('Từ vựng yêu thích');
      if (!id) return;
      const sets2 = CW.loadBookmarks();
      const s = sets2.find(x => x.id === id);
      if (s && !s.words.includes(hanzi)) { s.words.push(hanzi); CW.saveBookmarks(sets2); }
      CW.showToast('Đã thêm ' + hanzi + ' vào "' + s.name + '"');
      return;
    }
    if (sets.length === 1) {
      if (!sets[0].words.includes(hanzi)) {
        sets[0].words.push(hanzi); CW.saveBookmarks(sets);
        CW.showToast('Đã thêm ' + hanzi + ' vào "' + sets[0].name + '"');
      } else { CW.showToast(hanzi + ' đã có trong "' + sets[0].name + '"'); }
      return;
    }
    CW.showBookmarkPicker(hanzi);
  };

  CW.showBookmarkPicker = function (hanzi) {
    const old = document.getElementById('bm-picker-overlay');
    if (old) old.remove();
    const sets = CW.loadBookmarks();
    let optionsHtml = sets.map(s => {
      const has = s.words.includes(hanzi);
      return `<button onclick="pickBookmarkSet('${s.id}','${hanzi.replace(/'/g, "\\\\'")}')" class="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex items-center justify-between ${has ? 'bg-green-50' : ''}">
        <span class="text-sm font-medium">${has ? '✅' : '🔖'} ${s.name} <span class="text-xs text-slate-400">(${s.words.length} từ)</span></span>
        ${has ? '<span class="text-xs text-green-600">Đã có</span>' : '<span class="text-xs text-primary">+ Thêm</span>'}
      </button>`;
    }).join('');
    const overlay = document.createElement('div');
    overlay.id = 'bm-picker-overlay';
    overlay.className = 'fixed inset-0 bg-black/30 z-[100] flex items-center justify-center p-4';
    overlay.onclick = e => { if (e.target === overlay) { overlay.remove(); history.back(); } };
    overlay.innerHTML = `<div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
      <div class="px-5 py-4 border-b bg-slate-50"><h3 class="font-bold text-lg">🔖 Thêm <span class="font-cn text-hanzi">${hanzi}</span> vào bộ</h3></div>
      <div class="max-h-64 overflow-y-auto divide-y">${optionsHtml}</div>
      <div class="p-3 border-t"><button onclick="pickerCreateNew('${hanzi.replace(/'/g, "\\\\'")}')" class="w-full py-2 text-sm font-medium text-primary hover:bg-blue-50 rounded-lg transition-colors">+ Tạo bộ mới</button></div>
    </div>`;
    document.body.appendChild(overlay);
    history.pushState({ page: CW._currentPage, modal: 'bookmark-picker' }, '');
  };
  window.showBookmarkPicker = CW.showBookmarkPicker;

  window.pickBookmarkSet = function (setId, hanzi) {
    const sets = CW.loadBookmarks();
    const s = sets.find(x => x.id === setId);
    if (!s) return;
    if (!s.words.includes(hanzi)) {
      s.words.push(hanzi); CW.saveBookmarks(sets);
      CW.showToast('Đã thêm ' + hanzi + ' vào "' + s.name + '"');
    } else {
      s.words = s.words.filter(w => w !== hanzi); CW.saveBookmarks(sets);
      CW.showToast('Đã xóa ' + hanzi + ' khỏi "' + s.name + '"');
    }
    const overlay = document.getElementById('bm-picker-overlay');
    if (overlay) { overlay.remove(); history.back(); }
  };

  window.pickerCreateNew = function (hanzi) {
    const overlay = document.getElementById('bm-picker-overlay');
    if (overlay) { overlay.remove(); history.back(); }
    const id = createBookmarkSet();
    if (!id) return;
    const sets = CW.loadBookmarks();
    const s = sets.find(x => x.id === id);
    if (s && !s.words.includes(hanzi)) {
      s.words.push(hanzi); CW.saveBookmarks(sets);
      CW.showToast('Đã thêm ' + hanzi + ' vào "' + s.name + '"');
    }
  };

  // Render bookmarks page
  function renderBookmarksPage() {
    const allWords = CW.allWords;
    const sets = CW.loadBookmarks();
    const listEl = $('#bm-sets-list');
    const emptyEl = $('#bm-empty');
    if (!listEl) return;
    if (!sets.length) { listEl.innerHTML = ''; emptyEl.classList.remove('hidden'); return; }
    emptyEl.classList.add('hidden');
    listEl.innerHTML = sets.map(s => {
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
          <div><h3 class="font-bold text-lg">${s.name}</h3><span class="text-xs text-slate-400">${s.words.length} từ · Tạo ${new Date(s.created).toLocaleDateString('vi-VN')}</span></div>
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

  window.exportBookmarkPdf = function (setId) {
    const sets = CW.loadBookmarks();
    const s = sets.find(x => x.id === setId);
    if (!s || !s.words.length) { alert('Bộ từ vựng trống!'); return; }
    showPage('pdf');
    setPdfMode('custom');
    const input = $('#pdf-custom-input');
    if (input) input.value = s.words.join(', ');
    CW.showToast('Đã điền ' + s.words.length + ' từ từ "' + s.name + '" vào trang PDF');
  };

  // ===== BOOKMARK EXPORT / IMPORT =====
  window.bmExportAll = function () {
    const sets = CW.loadBookmarks();
    if (!sets.length) { CW.showToast('Chưa có bộ bookmark nào để xuất!', 'warning'); return; }
    const data = {
      app: 'ChineseWriter',
      version: 1,
      exportDate: new Date().toISOString(),
      bookmarks: sets
    };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    a.download = `ChineseWriter_Bookmarks_${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    CW.showToast(`Đã xuất ${sets.length} bộ bookmark (${sets.reduce((s, b) => s + b.words.length, 0)} từ)`, 'success');
  };

  window.bmImportFile = function (input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const raw = JSON.parse(e.target.result);
        // Support both formats: direct array or wrapped object with .bookmarks
        let importedSets = [];
        if (Array.isArray(raw)) {
          importedSets = raw;
        } else if (raw.bookmarks && Array.isArray(raw.bookmarks)) {
          importedSets = raw.bookmarks;
        } else {
          CW.showToast('File không đúng định dạng bookmark!', 'error');
          return;
        }
        // Validate structure
        const valid = importedSets.filter(s => s && s.id && s.name && Array.isArray(s.words));
        if (!valid.length) {
          CW.showToast('Không tìm thấy bộ bookmark hợp lệ trong file!', 'error');
          return;
        }
        // Ask user: merge or replace
        const existingSets = CW.loadBookmarks();
        const existingIds = new Set(existingSets.map(s => s.id));
        const newSets = valid.filter(s => !existingIds.has(s.id));
        const duplicateSets = valid.filter(s => existingIds.has(s.id));

        let msg = `File chứa ${valid.length} bộ bookmark.\n`;
        if (newSets.length) msg += `• ${newSets.length} bộ mới sẽ được thêm.\n`;
        if (duplicateSets.length) msg += `• ${duplicateSets.length} bộ trùng ID sẽ được cập nhật.\n`;
        if (existingSets.length) msg += `\nBạn hiện có ${existingSets.length} bộ bookmark.\nChọn OK để nhập (gộp), Cancel để hủy.`;

        if (!confirm(msg)) return;

        // Merge: update duplicates, add new
        const merged = [...existingSets];
        for (const s of valid) {
          const idx = merged.findIndex(x => x.id === s.id);
          if (idx >= 0) {
            // Merge words (union)
            const unionWords = [...new Set([...merged[idx].words, ...s.words])];
            merged[idx] = { ...merged[idx], ...s, words: unionWords };
          } else {
            merged.push(s);
          }
        }
        CW.saveBookmarks(merged);
        renderBookmarksPage();
        const totalNew = newSets.length;
        const totalUpdated = duplicateSets.length;
        CW.showToast(`Nhập thành công! +${totalNew} bộ mới, cập nhật ${totalUpdated} bộ.`, 'success');
      } catch (err) {
        CW.showToast('Lỗi đọc file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be imported again
    input.value = '';
  };

  // ===== PAGE ROUTING with History API =====
  CW._currentPage = 'home';
  let _skipPushState = false;

  function _doShowPage(name) {
    const currentEl = $(`.page.active`);
    if (currentEl) { currentEl.style.opacity = '0'; setTimeout(() => currentEl.classList.remove('active'), 150); }
    const el = $(`#page-${name}`);
    if (el) {
      setTimeout(() => {
        $$('.page').forEach(p => { if (p !== el) p.classList.remove('active'); });
        el.classList.add('active');
        el.offsetHeight;
        el.style.opacity = '1';
      }, currentEl ? 150 : 0);
    }
    window.scrollTo(0, 0);
    CW._currentPage = name;
    if (name === 'bookmarks') renderBookmarksPage();
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

  window.showPage = CW.showPage = function (name) {
    const radModal = document.getElementById('radical-modal-overlay');
    if (radModal) radModal.remove();
    const bmPicker = document.getElementById('bm-picker-overlay');
    if (bmPicker) bmPicker.remove();
    _doShowPage(name);
    if (!_skipPushState) history.pushState({ page: name }, '', '#' + name);
    // Call registered page hooks
    const hooks = CW._pageHooks[name];
    if (hooks) hooks.forEach(fn => fn());
  };

  // Handle browser Back/Forward buttons
  window.addEventListener('popstate', function (e) {
    const radModal = document.getElementById('radical-modal-overlay');
    if (radModal) { radModal.remove(); return; }
    const bmPicker = document.getElementById('bm-picker-overlay');
    if (bmPicker) { bmPicker.remove(); return; }
    const fcPdfModal = document.getElementById('fc-pdf-modal');
    if (fcPdfModal) { fcPdfModal.remove(); return; }
    _skipPushState = true;
    if (e.state && e.state.page) {
      _doShowPage(e.state.page);
      const hooks = CW._pageHooks[e.state.page];
      if (hooks) hooks.forEach(fn => fn());
    } else {
      const hash = location.hash.replace('#', '') || 'home';
      _doShowPage(hash);
      const hooks = CW._pageHooks[hash];
      if (hooks) hooks.forEach(fn => fn());
    }
    _skipPushState = false;
  });

  // Set initial history state
  (function initHistory() {
    const hash = location.hash.replace('#', '');
    const initialPage = hash || 'home';
    history.replaceState({ page: initialPage }, '', '#' + initialPage);
  })();

  // Mobile menu
  window.toggleMobileMenu = function () {
    const menu = $('#mobile-menu');
    const backdrop = $('#mobile-backdrop');
    if (menu.classList.contains('open')) { closeMobile(); } else {
      menu.classList.remove('hidden'); backdrop.classList.remove('hidden');
      requestAnimationFrame(() => { menu.classList.add('open'); backdrop.classList.add('open'); });
    }
  };
  window.closeMobile = function () {
    const menu = $('#mobile-menu');
    const backdrop = $('#mobile-backdrop');
    menu.classList.remove('open'); backdrop.classList.remove('open');
    setTimeout(() => { menu.classList.add('hidden'); backdrop.classList.add('hidden'); }, 300);
  };

  // ===== AUDIO PLAYBACK (MP3 first, TTS fallback) =====
  let currentAudio = null;
  let speakId = 0;
  let audioManifest = null;

  CW.loadAudioManifest = async function () {
    try {
      const data = await fetch('sounds/manifest.json').then(r => r.json());
      audioManifest = new Set(data);
      console.log('[Audio] Manifest loaded:', audioManifest.size, 'files');
    } catch (e) {
      console.warn('[Audio] Manifest not found, will try loading MP3 directly');
      audioManifest = null;
    }
  };

  CW.speakText = window.speakText = function (text) {
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    if (audioManifest && !audioManifest.has(text)) { fallbackTTS(text); return; }
    const thisId = ++speakId;
    let resolved = false;
    const audioUrl = 'sounds/cmn-' + encodeURIComponent(text) + '.mp3';
    const audio = new Audio(audioUrl);
    currentAudio = audio;
    audio.oncanplaythrough = function () {
      if (resolved || thisId !== speakId) return; resolved = true;
      audio.play().catch(function () { if (thisId === speakId) fallbackTTS(text); });
    };
    audio.onerror = function () {
      if (resolved || thisId !== speakId) return; resolved = true; fallbackTTS(text);
    };
    setTimeout(function () {
      if (resolved || thisId !== speakId) return; resolved = true;
      audio.pause(); currentAudio = null; fallbackTTS(text);
    }, 8000);
  };

  function fallbackTTS(text) {
    if (!('speechSynthesis' in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-CN'; u.rate = 0.8;
    const v = speechSynthesis.getVoices().find(function (v) { return v.lang.startsWith('zh'); });
    if (v) u.voice = v;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
  }

  // ===== DATA LOADING =====
  // Lazy-load flags for heavy data files
  let _charsLoaded = false, _charsLoading = null;
  let _ctxLoaded = false, _ctxLoading = null;

  // Lazy loader for characters.json (8.8MB) — only fetched when needed
  CW.ensureCharacters = function () {
    if (_charsLoaded) return Promise.resolve();
    if (_charsLoading) return _charsLoading;
    _charsLoading = fetch('data/characters.json')
      .then(r => r.json())
      .then(data => { Object.assign(CW.characters, data); _charsLoaded = true; })
      .catch(e => console.warn('[Data] characters.json load failed:', e))
      .finally(() => { _charsLoading = null; });
    return _charsLoading;
  };

  // Lazy loader for context_quiz.json (2.7MB) — only fetched when quiz needs it
  CW.ensureContextQuiz = function () {
    if (_ctxLoaded) return Promise.resolve();
    if (_ctxLoading) return _ctxLoading;
    _ctxLoading = fetch('data/context_quiz.json')
      .then(r => r.json())
      .then(data => { CW.contextQuizData.push(...data); _ctxLoaded = true; })
      .catch(e => console.warn('[Data] context_quiz.json load failed:', e))
      .finally(() => { _ctxLoading = null; });
    return _ctxLoading;
  };

  CW.init = async function () {
    try {
      // Only load essential data at startup: words (4MB) + radicals (38KB)
      // characters.json (8.8MB) and context_quiz.json (2.7MB) are lazy-loaded on demand
      const [wordsData, radicalsData] = await Promise.all([
        fetch('data/words.json').then(r => r.json()),
        fetch('data/radicals.json').then(r => r.json()).catch(() => ({}))
      ]);
      // Populate shared data (preserve references for module aliases)
      CW.allWords.push(...wordsData);
      Object.assign(CW.radicals, radicalsData);
      const sw = $('#stat-words');
      if (sw) sw.textContent = CW.allWords.length.toLocaleString() + '+';
      // Call module init callbacks
      CW._initCallbacks.forEach(fn => fn());
      const ll = $('#lib-loading');
      if (ll) ll.classList.add('hidden');
      // Start preloading characters.json in background (non-blocking)
      setTimeout(() => CW.ensureCharacters(), 2000);
    } catch (e) {
      const ll = $('#lib-loading');
      if (ll) ll.innerHTML = `<div class="text-center py-16 text-red-500"><div class="text-5xl mb-3">❌</div><p>Lỗi tải: ${e.message}</p></div>`;
    }
  };

  // ===== VISITOR COUNTER =====
  CW.initVisitorCounter = function () {
    const el = document.getElementById('stat-visitors');
    if (!el) return;
    const namespace = 'HigherVn';
    const key = 'visits';
    fetch(`https://api.counterapi.dev/v1/${namespace}/${key}/up`)
      .then(r => r.json())
      .then(data => {
        if (data && data.count !== undefined) {
          el.textContent = data.count.toLocaleString();
          el.classList.add('transition-all');
        }
      })
      .catch(() => {
        const VISIT_KEY = 'cw_visit_count';
        const VISITED_KEY = 'cw_visited_today';
        const today = new Date().toDateString();
        let count = parseInt(localStorage.getItem(VISIT_KEY) || '0');
        if (localStorage.getItem(VISITED_KEY) !== today) {
          count++; localStorage.setItem(VISIT_KEY, count.toString());
          localStorage.setItem(VISITED_KEY, today);
        }
        el.textContent = count.toLocaleString();
      });
  };

  // ===== APP START =====
  CW.start = async function () {
    // Init speech synthesis voices
    if ('speechSynthesis' in window) {
      speechSynthesis.getVoices();
      speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices();
    }
    await CW.init();
    CW.loadAudioManifest();
    CW.initVisitorCounter();
  };
})();
