// js/topics.js — Từ vựng theo chủ đề
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$, $$ = CW.$$;

  // ===== STATE =====
  let topics = [];                  // [{id, name_vi, icon, color, count, order}]
  let vocabTopics = {};             // { wordId: [topicId, ...] }
  let topicWords = {};              // { topicId: [wordObj, ...] }  (built lazily)
  let currentTopicId = null;
  let searchQuery = '';
  const PAGE_SIZE = 60;
  let renderedCount = 0;

  // ===== DATA LOAD =====
  async function loadData() {
    if (topics.length) return;
    try {
      const [topicsData, vtData] = await Promise.all([
        fetch('data/topics.json').then(r => r.json()),
        fetch('data/vocab_topics.json').then(r => r.json())
      ]);
      topics = (topicsData || []).slice().sort((a, b) => (a.order || 0) - (b.order || 0));
      vocabTopics = vtData || {};
      buildTopicIndex();
      console.log('[Topics] Loaded', topics.length, 'topics,', Object.keys(vocabTopics).length, 'mappings');
    } catch (e) {
      console.error('[Topics] Load error:', e);
      const c = $('#topics-grid');
      if (c) c.innerHTML = `<div class="col-span-full text-center py-12 text-red-500">❌ Không tải được dữ liệu chủ đề: ${e.message}</div>`;
    }
  }

  function buildTopicIndex() {
    topicWords = {};
    topics.forEach(t => { topicWords[t.id] = []; });
    const byId = new Map(CW.allWords.map(w => [String(w.id), w]));
    Object.entries(vocabTopics).forEach(([wid, tids]) => {
      const w = byId.get(String(wid));
      if (!w) return;
      tids.forEach(tid => {
        if (topicWords[tid]) topicWords[tid].push(w);
      });
    });
    // Sort each topic's words by HSK then hanzi length
    Object.values(topicWords).forEach(arr => {
      arr.sort((a, b) => {
        const ha = a.hsk || 99, hb = b.hsk || 99;
        if (ha !== hb) return ha - hb;
        return (a.hanzi || '').length - (b.hanzi || '').length;
      });
    });
    // Refresh count from real index (ignore stale topics.json count)
    topics.forEach(t => { t.count = (topicWords[t.id] || []).length; });
  }

  // ===== RENDER: TOPIC GRID =====
  function renderGrid() {
    const grid = $('#topics-grid');
    if (!grid) return;
    const q = searchQuery.trim().toLowerCase();
    const list = topics.filter(t => {
      if (!q) return true;
      return (t.name_vi || '').toLowerCase().includes(q) ||
             (t.id || '').toLowerCase().includes(q);
    });
    if (!list.length) {
      grid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400"><div class="text-4xl mb-2">🔍</div>Không tìm thấy chủ đề.</div>`;
      return;
    }
    grid.innerHTML = list.map(t => {
      const color = t.color || '#3b82f6';
      const icon = t.icon || '📚';
      return `
        <button onclick="topicOpen('${t.id}')"
          class="topic-card text-left p-4 rounded-2xl border-2 border-slate-100 hover:border-primary hover:shadow-lg transition-all bg-white group"
          style="--c:${color}">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0"
                 style="background:${color}20;color:${color}">${icon}</div>
            <div class="flex-1 min-w-0">
              <div class="font-bold text-sm text-slate-800 line-clamp-2 leading-tight">${t.name_vi}</div>
              <div class="text-xs text-slate-400 mt-0.5">${t.count} từ</div>
            </div>
          </div>
          <div class="h-1 rounded-full overflow-hidden bg-slate-100">
            <div class="h-full transition-all group-hover:w-full" style="background:${color};width:${Math.min(100, t.count / 2)}%"></div>
          </div>
        </button>`;
    }).join('');
    $('#topics-count').textContent = `${list.length} / ${topics.length} chủ đề`;
  }

  // ===== RENDER: WORD LIST OF A TOPIC =====
  window.topicOpen = function (tid) {
    currentTopicId = tid;
    const t = topics.find(x => x.id === tid);
    if (!t) return;
    $('#topics-grid-view').classList.add('hidden');
    $('#topics-detail-view').classList.remove('hidden');
    const head = $('#topics-detail-head');
    const color = t.color || '#3b82f6';
    head.innerHTML = `
      <div class="flex items-start gap-3">
        <button onclick="topicBack()" class="p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-500" title="Quay lại">
          <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>
        </button>
        <div class="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style="background:${color}20;color:${color}">${t.icon || '📚'}</div>
        <div class="flex-1 min-w-0">
          <h3 class="font-bold text-lg leading-tight">${t.name_vi}</h3>
          <p class="text-xs text-slate-400">${(topicWords[tid] || []).length} từ vựng</p>
        </div>
      </div>
      <div class="flex flex-wrap gap-2 mt-4">
        <button onclick="topicSaveBookmark()" class="inline-flex items-center gap-1.5 text-xs px-3 py-2 border-2 border-amber-300 text-amber-700 rounded-lg hover:bg-amber-50 transition-colors">🔖 Lưu thành Bookmark</button>
        <button onclick="topicGoFlashcard()" class="inline-flex items-center gap-1.5 text-xs px-3 py-2 border-2 border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 transition-colors">🃏 Học Flashcard</button>
        <button onclick="topicGoQuiz()" class="inline-flex items-center gap-1.5 text-xs px-3 py-2 border-2 border-pink-300 text-pink-700 rounded-lg hover:bg-pink-50 transition-colors">🧩 Quiz</button>
        <button onclick="topicExportPdf()" class="inline-flex items-center gap-1.5 text-xs px-3 py-2 border-2 border-green-400 text-green-700 rounded-lg hover:bg-green-50 transition-colors">📄 Xuất PDF tập viết</button>
      </div>
      <div class="relative mt-4">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <input type="text" id="topic-word-search" placeholder="Tìm trong chủ đề..." 
          class="w-full pl-9 pr-3 py-2 border-2 border-slate-200 rounded-lg focus:border-primary outline-none text-sm"
          oninput="topicFilterWords()">
      </div>
    `;
    renderedCount = 0;
    $('#topics-word-list').innerHTML = '';
    renderMoreWords();
  };

  window.topicBack = function () {
    currentTopicId = null;
    $('#topics-detail-view').classList.add('hidden');
    $('#topics-grid-view').classList.remove('hidden');
  };

  function getCurrentWords() {
    if (!currentTopicId) return [];
    const all = topicWords[currentTopicId] || [];
    const q = ($('#topic-word-search')?.value || '').trim().toLowerCase();
    if (!q) return all;
    const qs = CW.stripTones(q);
    return all.filter(w =>
      w.hanzi.includes(q) ||
      w.pinyin.toLowerCase().includes(q) ||
      CW.stripTones(w.pinyin.toLowerCase()).includes(qs) ||
      (w.vietnamese || '').toLowerCase().includes(q) ||
      (w.english || '').toLowerCase().includes(q)
    );
  }

  window.topicFilterWords = function () {
    renderedCount = 0;
    $('#topics-word-list').innerHTML = '';
    renderMoreWords();
  };

  function renderMoreWords() {
    const list = getCurrentWords();
    const more = $('#topics-word-more');
    if (!list.length) {
      $('#topics-word-list').innerHTML = `<div class="text-center py-12 text-slate-400"><div class="text-4xl mb-2">📭</div>Không có từ vựng phù hợp.</div>`;
      more.classList.add('hidden');
      return;
    }
    const end = Math.min(renderedCount + PAGE_SIZE, list.length);
    const frag = document.createDocumentFragment();
    for (let i = renderedCount; i < end; i++) frag.appendChild(createWordRow(list[i]));
    $('#topics-word-list').appendChild(frag);
    renderedCount = end;
    more.classList.toggle('hidden', renderedCount >= list.length);
    more.textContent = `Xem thêm (${list.length - renderedCount} từ còn lại)`;
  }
  window.topicLoadMore = renderMoreWords;

  function createWordRow(w) {
    const div = document.createElement('div');
    div.className = 'word-card flex items-center gap-3 cursor-pointer';
    const def = w.vietnamese || w.english || '';
    const hskLv = Math.min(w.hsk || 0, 7);
    const hskBadge = w.hsk
      ? `<span class="hsk-badge hsk-badge-${hskLv}">HSK${w.hsk}</span>`
      : `<span class="hsk-badge bg-slate-100 text-slate-500">📌 Chủ đề</span>`;
    div.innerHTML = `
      <span class="font-cn text-2xl font-bold text-hanzi min-w-[56px] text-center leading-tight">${w.hanzi}</span>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-sm text-primary font-medium">${w.pinyin || ''}</span>
          ${hskBadge}
        </div>
        <div class="text-sm text-slate-600 line-clamp-2">${def}</div>
      </div>
      <div class="quick-actions flex items-center gap-1 flex-shrink-0">
        <button onclick="event.stopPropagation();speakText('${w.hanzi.replace(/'/g, "\\'")}')" class="p-2 hover:bg-blue-50 rounded-lg text-primary" title="Phát âm">🔊</button>
        <button onclick="event.stopPropagation();addToBookmark('${w.hanzi.replace(/'/g, "\\'")}')" class="p-2 hover:bg-amber-50 rounded-lg text-amber-600" title="Lưu">🔖</button>
      </div>
    `;
    div.onclick = () => {
      if (typeof window.openDetailByHanzi === 'function') window.openDetailByHanzi(w.hanzi);
    };
    return div;
  }

  // ===== ACTIONS =====
  window.topicSaveBookmark = function () {
    if (!currentTopicId) return;
    const t = topics.find(x => x.id === currentTopicId);
    const words = topicWords[currentTopicId] || [];
    if (!words.length) { CW.showToast('Chủ đề trống!', 'warning'); return; }
    const sets = CW.loadBookmarks();
    const setName = `${t.icon || '📚'} ${t.name_vi}`;
    let exist = sets.find(s => s.name === setName);
    if (exist) {
      const before = exist.words.length;
      const union = [...new Set([...exist.words, ...words.map(w => w.hanzi)])];
      exist.words = union;
      CW.saveBookmarks(sets);
      CW.showToast(`Đã cập nhật bookmark "${setName}" (+${union.length - before} từ mới)`, 'success');
    } else {
      const newSet = {
        id: Date.now().toString(),
        name: setName,
        words: [...new Set(words.map(w => w.hanzi))],
        created: new Date().toISOString()
      };
      sets.push(newSet);
      CW.saveBookmarks(sets);
      CW.showToast(`Đã tạo bookmark "${setName}" (${newSet.words.length} từ)`, 'success');
    }
  };

  window.topicExportPdf = function () {
    if (!currentTopicId) return;
    const words = topicWords[currentTopicId] || [];
    if (!words.length) { CW.showToast('Chủ đề trống!', 'warning'); return; }
    showPage('pdf');
    if (typeof window.setPdfMode === 'function') setPdfMode('custom');
    setTimeout(() => {
      const input = $('#pdf-custom-input');
      if (input) input.value = words.map(w => w.hanzi).join(', ');
      CW.showToast(`Đã điền ${words.length} từ vào trang PDF`, 'success');
    }, 100);
  };

  // Pre-fill bookmark then jump to flashcard/quiz with bookmark source
  function _ensureTopicBookmark() {
    const t = topics.find(x => x.id === currentTopicId);
    const words = topicWords[currentTopicId] || [];
    if (!words.length) return null;
    const sets = CW.loadBookmarks();
    const setName = `${t.icon || '📚'} ${t.name_vi}`;
    let s = sets.find(x => x.name === setName);
    if (!s) {
      s = { id: Date.now().toString(), name: setName, words: [...new Set(words.map(w => w.hanzi))], created: new Date().toISOString() };
      sets.push(s); CW.saveBookmarks(sets);
    } else {
      s.words = [...new Set([...s.words, ...words.map(w => w.hanzi)])];
      CW.saveBookmarks(sets);
    }
    return s;
  }

  window.topicGoFlashcard = function () {
    const s = _ensureTopicBookmark();
    if (!s) { CW.showToast('Chủ đề trống!', 'warning'); return; }
    showPage('flashcard');
    setTimeout(() => {
      if (typeof window.fcSelectSource === 'function') {
        window.fcSelectSource('bookmark');
        // Pick the just-created/updated set after dropdown renders
        setTimeout(() => {
          const sel = document.querySelector('#fc-source-options select, #fc-source-options [data-bm-id]');
          if (sel && sel.tagName === 'SELECT') {
            sel.value = s.id;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, 80);
      }
    }, 200);
    CW.showToast(`📚 Đã chọn nguồn "${s.name}" cho Flashcard`, 'info');
  };

  window.topicGoQuiz = function () {
    const s = _ensureTopicBookmark();
    if (!s) { CW.showToast('Chủ đề trống!', 'warning'); return; }
    showPage('quiz');
    setTimeout(() => {
      if (typeof window.qzSelectSource === 'function') {
        window.qzSelectSource('bookmark');
        setTimeout(() => {
          const sel = document.querySelector('#qz-source-options select, #qz-source-options [data-bm-id]');
          if (sel && sel.tagName === 'SELECT') {
            sel.value = s.id;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, 80);
      }
    }, 200);
    CW.showToast(`🧩 Đã chọn nguồn "${s.name}" cho Quiz`, 'info');
  };

  // ===== SEARCH HANDLER =====
  window.topicsSearch = function (e) {
    searchQuery = e.target.value || '';
    renderGrid();
  };

  // ===== PAGE HOOK =====
  CW.registerPageHook('topics', async function () {
    await loadData();
    if (!currentTopicId) {
      $('#topics-grid-view').classList.remove('hidden');
      $('#topics-detail-view').classList.add('hidden');
      renderGrid();
    }
  });

  // Build index when words are ready (in case loadData runs before allWords filled)
  CW.onDataLoaded(function () {
    if (topics.length) buildTopicIndex();
  });
})();
