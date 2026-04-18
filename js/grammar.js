// js/grammar.js — Grammar page v2: 3-pane layout, grouping, search, bookmark, SRS examples
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$;
  const $$ = CW.$$;

  // ===== State =====
  let grammarData = [];
  let gramFiltered = [];
  let currentRule = null;
  const filters = { hsk: 0, status: '', search: '' };

  const STORAGE = {
    bookmarks: 'cw_gram_bookmarks',
    learned: 'cw_gram_learned',
    last: 'cw_gram_last',
    srsCards: 'cw_gram_srs_cards',
    groupState: 'cw_gram_group_state',
  };

  // ===== Group definitions (pattern-based auto-classify) =====
  const GROUPS = [
    { key: 'question', name: '❓ Câu hỏi', patterns: [/\bquestion|吗\b|呢\b|\b几\b|\b多少\b|什么|怎么|\b哪\b|\b谁\b|为什么|\bhow\b|\bwhat\b|\bwhy\b/i] },
    { key: 'aspect', name: '🔄 Thì / Thể', patterns: [/\b(le|guo|zhe)\b|\baspect\b|\btense\b|\bingressive\b|过去|完成|进行|\bcontinuous\b|\bperfect|正在|着\b/i] },
    { key: 'comparison', name: '⚖️ So sánh', patterns: [/compar|比\b|更\b|最\b|一样|不如|跟.*一样|as.*as/i] },
    { key: 'conjunction', name: '🔗 Liên từ & Điều kiện', patterns: [/conjunct|虽然|但是|因为|所以|如果|即使|不但|而且|尽管|只要|只有|除非|\bif\b|\bthough\b|\bbecause\b|\bso that\b/i] },
    { key: 'complement', name: '🎯 Bổ ngữ', patterns: [/complement|resultative|directional|potential|得\b|极了|起来|下去|上来|出来|不了|得了/i] },
    { key: 'preposition', name: '📍 Giới từ', patterns: [/preposit|\b在\b.*verb|\b从\b|\b到\b|\b对\b|\b给\b|\b向\b|\b跟\b|\b被\b|\b把\b|coverb/i] },
    { key: 'particle', name: '💬 Ngữ khí', patterns: [/particle|modal|exclamation|\b吧\b|\b呢\b|\b呗\b|\b啊\b|\b嘛\b|语气/i] },
    { key: 'negation', name: '🚫 Phủ định', patterns: [/negat|\b不\b|\b没\b|\b别\b|\b甭\b|\bno\b|\bnot\b/i] },
    { key: 'time', name: '⏰ Thời gian', patterns: [/\btime\b|以前|以后|的时候|\bwhen\b|\bafter\b|\bbefore\b|时间|during|\bsince\b/i] },
    { key: 'measure', name: '📏 Lượng từ & Số', patterns: [/measure|量词|\bnumber|quantit|几|一点|一些|多少/i] },
    { key: 'structure', name: '🧩 Cấu trúc đặc biệt', patterns: [/是.*的|\b把\b|\b被\b|连.*也|除了|不是.*而是|越.*越|一.*就/i] },
    { key: 'expression', name: '🗣️ Cách diễn đạt', patterns: [/express|idiom|usage|way to|\bsay\b/i] },
    { key: 'other', name: '📋 Khác', patterns: [] },
  ];

  function classifyRule(rule) {
    const text = (rule.pattern + ' ' + (rule.structure || '') + ' ' + (rule.name_vi || '') + ' ' + (rule.explanation_vi || ''));
    for (const g of GROUPS) {
      for (const p of g.patterns) if (p.test(text)) return g.key;
    }
    return 'other';
  }

  // ===== Storage helpers =====
  function loadSet(key) {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); }
    catch (e) { return new Set(); }
  }
  function saveSet(key, set) { localStorage.setItem(key, JSON.stringify([...set])); }
  function loadObj(key) { try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; } }
  function saveObj(key, obj) { localStorage.setItem(key, JSON.stringify(obj)); }

  let bookmarks, learned, groupState, srsCards;
  function reloadStorage() {
    bookmarks = loadSet(STORAGE.bookmarks);
    learned = loadSet(STORAGE.learned);
    groupState = Object.assign({}, ...GROUPS.map(g => ({ [g.key]: true })), loadObj(STORAGE.groupState));
    srsCards = loadObj(STORAGE.srsCards); // { id: { zh, pinyin, vi, en, box, nextReview } }
  }
  reloadStorage();

  function ruleId(rule) { return `hsk${rule.hsk_level}:${rule.pattern}`; }

  // ===== Load data =====
  async function loadGrammar() {
    try {
      const resp = await fetch('data/grammar.json');
      grammarData = await resp.json();
      // Pre-classify
      grammarData.forEach(r => { r._group = classifyRule(r); r._id = ruleId(r); });
      $('#gram-loading').classList.add('hidden');
      $('#gram-shell').classList.remove('hidden');
      buildChips();
      applyFilters();
      renderHskProgress();
      updateSrsCount();
      const gc = $('#gram-count');
      if (gc) gc.textContent = grammarData.length + ' điểm ngữ pháp · ' +
        grammarData.reduce((s, r) => s + (r.examples || []).length, 0) + ' ví dụ';
      // Restore last rule
      const lastId = localStorage.getItem(STORAGE.last);
      if (lastId) {
        const r = grammarData.find(x => x._id === lastId);
        if (r) selectRule(r);
      }
    } catch (e) {
      const gl = $('#gram-loading');
      if (gl) gl.innerHTML = '<div class="text-center py-16 text-slate-400"><div class="text-5xl mb-3">📐</div><p>Không tải được dữ liệu ngữ pháp.</p></div>';
    }
  }

  // ===== HSK chips =====
  function buildChips() {
    const levels = [...new Set(grammarData.map(g => g.hsk_level))].sort((a, b) => a - b);
    let html = `<button class="hsk-chip text-xs !px-2.5 !py-1 active" data-lv="0" onclick="gramFilterHsk(0)">Tất cả (${grammarData.length})</button>`;
    for (const lv of levels) {
      const count = grammarData.filter(g => g.hsk_level === lv).length;
      html += `<button class="hsk-chip text-xs !px-2.5 !py-1" data-lv="${lv}" onclick="gramFilterHsk(${lv})">HSK ${lv} <span class="opacity-60">(${count})</span></button>`;
    }
    $('#gram-chips').innerHTML = html;
  }

  window.gramFilterHsk = function (lv) {
    filters.hsk = lv;
    $$('#gram-chips .hsk-chip').forEach(c => c.classList.toggle('active', parseInt(c.dataset.lv) === lv));
    applyFilters();
  };

  window.gramFilterStatus = function (st) {
    filters.status = st;
    $$('.gram-status-btn').forEach(b => {
      const a = b.dataset.status === st;
      b.classList.toggle('active', a);
      b.classList.toggle('bg-slate-100', a);
      b.classList.toggle('font-semibold', a);
    });
    applyFilters();
  };

  window.gramSearch = function () {
    filters.search = ($('#gram-search')?.value || '').trim().toLowerCase();
    applyFilters();
  };

  function applyFilters() {
    const q = filters.search;
    gramFiltered = grammarData.filter(r => {
      if (filters.hsk > 0 && r.hsk_level !== filters.hsk) return false;
      if (filters.status === 'bookmark' && !bookmarks.has(r._id)) return false;
      if (filters.status === 'learned' && !learned.has(r._id)) return false;
      if (filters.status === 'unlearned' && learned.has(r._id)) return false;
      if (q) {
        const hay = (r.pattern + '|' + r.name_vi + '|' + r.explanation_vi + '|' + r.structure + '|' +
          (r.examples || []).map(e => e.zh + '|' + e.vi + '|' + e.pinyin + '|' + e.en).join('|')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    renderSidebarList();
    updateProgress();
  }

  // ===== Sidebar list (grouped) =====
  function renderSidebarList() {
    const list = $('#gram-list');
    if (!list) return;
    if (!gramFiltered.length) {
      list.innerHTML = '<div class="text-center text-slate-400 py-8 text-sm">Không có kết quả</div>';
      return;
    }
    // Group
    const byGroup = {};
    for (const r of gramFiltered) (byGroup[r._group] = byGroup[r._group] || []).push(r);

    let html = '';
    for (const g of GROUPS) {
      const items = byGroup[g.key];
      if (!items || !items.length) continue;
      const open = groupState[g.key] !== false;
      const learnedCount = items.filter(x => learned.has(x._id)).length;
      html += `<div class="gram-group" data-group="${g.key}">
        <div class="gram-group-header" onclick="gramToggleGroup('${g.key}')">
          <span>${open ? '▾' : '▸'} ${g.name}</span>
          <span class="text-[10px] text-slate-400 font-normal">${learnedCount}/${items.length}</span>
        </div>
        <div class="gram-group-body ${open ? '' : 'hidden'}">`;
      for (const r of items) {
        const isActive = currentRule && currentRule._id === r._id;
        const isBm = bookmarks.has(r._id);
        const isLn = learned.has(r._id);
        const statusIcon = isLn ? '<span class="gram-status-icon text-green-500">✓</span>'
          : isBm ? '<span class="gram-status-icon text-amber-500">⭐</span>'
          : '<span class="gram-status-icon"></span>';
        const hskColor = hskDotColor(r.hsk_level);
        html += `<div class="gram-sidebar-item ${isActive ? 'active' : ''}" onclick="gramSelectById('${escAttr(r._id)}')" data-id="${escAttr(r._id)}">
          <span class="gram-hsk-dot" style="background:${hskColor}" title="HSK ${r.hsk_level}"></span>
          ${statusIcon}
          <span class="flex-1 truncate" title="${escAttr(r.name_vi)}">${escapeHtml(r.name_vi)}</span>
        </div>`;
      }
      html += `</div></div>`;
    }
    list.innerHTML = html;
  }

  function hskDotColor(lv) {
    return ['#94a3b8', '#22c55e', '#3b82f6', '#eab308', '#f97316', '#ec4899', '#8b5cf6', '#ef4444'][lv] || '#94a3b8';
  }

  window.gramToggleGroup = function (key) {
    groupState[key] = !(groupState[key] !== false);
    saveObj(STORAGE.groupState, groupState);
    renderSidebarList();
  };

  window.gramSelectById = function (id) {
    const r = grammarData.find(x => x._id === id);
    if (r) selectRule(r);
  };

  // ===== Main detail =====
  function selectRule(rule) {
    currentRule = rule;
    localStorage.setItem(STORAGE.last, rule._id);
    renderDetail(rule);
    renderRelated(rule);
    // Update sidebar active
    $$('.gram-sidebar-item').forEach(el => el.classList.toggle('active', el.dataset.id === rule._id));
    // Close mobile drawer
    if (window.innerWidth < 1024) gramToggleSidebar(false);
    // Scroll main to top
    const main = $('#gram-detail');
    if (main) main.scrollTop = 0;
  }

  function renderDetail(r) {
    const main = $('#gram-detail');
    if (!main) return;
    const isBm = bookmarks.has(r._id);
    const isLn = learned.has(r._id);
    const exs = r.examples || [];
    const urlHtml = r.url ? `<a href="${escapeHtml(r.url)}" target="_blank" rel="noopener" class="text-xs text-blue-500 hover:underline inline-flex items-center gap-1">🔗 AllSet Learning</a>` : '';

    main.innerHTML = `
      <div class="max-w-3xl mx-auto">
        <!-- Header -->
        <div class="flex items-start justify-between gap-3 mb-3 pb-3 border-b border-slate-100">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="hsk-badge hsk-badge-${r.hsk_level}">HSK ${r.hsk_level}</span>
              <span class="text-[11px] text-slate-400">${GROUPS.find(g => g.key === r._group)?.name || ''}</span>
            </div>
            <h1 class="text-xl lg:text-2xl font-bold text-slate-800 leading-tight">${escapeHtml(r.name_vi)}</h1>
            ${r.name_vi !== r.pattern ? `<div class="text-xs text-slate-400 italic mt-0.5">${escapeHtml(r.pattern)}</div>` : ''}
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button onclick="gramToggleBookmark()" class="p-2 rounded-lg hover:bg-amber-50 ${isBm ? 'text-amber-500' : 'text-slate-300'}" title="Lưu (B)">⭐</button>
            <button onclick="gramToggleLearned()" class="p-2 rounded-lg hover:bg-green-50 ${isLn ? 'text-green-600' : 'text-slate-300'}" title="Đã học (N)">✓</button>
            <button onclick="gramCopyLink()" class="p-2 rounded-lg hover:bg-slate-100 text-slate-400" title="Sao chép link">🔗</button>
          </div>
        </div>

        <!-- Structure formula -->
        ${r.structure ? `
          <div class="mb-4">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Cấu trúc</div>
            <div class="gram-formula">${renderFormula(r.structure)}</div>
          </div>
        ` : ''}

        <!-- Explanation -->
        ${r.explanation_vi ? `
          <div class="mb-5">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Ý nghĩa</div>
            <p class="text-sm text-slate-700 leading-relaxed">${escapeHtml(r.explanation_vi)}</p>
          </div>
        ` : ''}

        ${r.note_vi ? `<div class="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">💡 ${escapeHtml(r.note_vi)}</div>` : ''}

        <!-- Examples section -->
        <div class="mb-4">
          <div class="flex items-center justify-between mb-2">
            <div class="text-xs font-bold text-slate-500 uppercase tracking-wider">Ví dụ (${exs.length})</div>
            <div class="flex gap-1 text-[11px]" id="gram-ex-tabs">
              <button data-view="all" class="gram-ex-tab active px-2 py-0.5 rounded bg-primary text-white" onclick="gramSetExView('all')">Tất cả</button>
              <button data-view="zh" class="gram-ex-tab px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200" onclick="gramSetExView('zh')">Chỉ ZH</button>
              <button data-view="vi" class="gram-ex-tab px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200" onclick="gramSetExView('vi')">ZH+VI</button>
              <button data-view="en" class="gram-ex-tab px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200" onclick="gramSetExView('en')">ZH+EN</button>
            </div>
          </div>
          <div id="gram-ex-list" class="grid gap-2" data-view="all">
            ${exs.map((ex, i) => renderExample(ex, r._id + ':' + i)).join('')}
          </div>
        </div>

        ${urlHtml ? `<div class="pt-3 border-t border-slate-100">${urlHtml}</div>` : ''}
      </div>
    `;
  }

  function renderFormula(structure) {
    // Split by + or spaces, colorize tokens
    const parts = structure.split(/\s*\+\s*/);
    return parts.map((p, i) => {
      p = p.trim(); if (!p) return '';
      const hasZh = /[\u4e00-\u9fff]/.test(p);
      const cls = hasZh ? 'gram-tok gram-tok-zh' : 'gram-tok';
      const sep = i > 0 ? '<span class="gram-tok-plus">+</span>' : '';
      return sep + `<span class="${cls}">${escapeHtml(p)}</span>`;
    }).join('');
  }

  function renderExample(ex, exId) {
    const zh = escapeHtml(ex.zh || '');
    const py = escapeHtml(ex.pinyin || '');
    const vi = escapeHtml(ex.vi || '');
    const en = escapeHtml(ex.en || '');
    const inSrs = !!srsCards[exId];
    return `<div class="gram-ex" data-ex-id="${escAttr(exId)}">
      <div class="flex items-start justify-between gap-2 mb-0.5">
        <div class="gram-ex-zh flex-1" data-view-part="zh">${zh}</div>
        <div class="flex items-center gap-0.5 shrink-0">
          <button onclick="gramSpeak('${escAttr(ex.zh || '')}')" class="text-slate-400 hover:text-primary p-1" title="Phát âm">🔊</button>
          <button onclick="gramToggleExSrs('${escAttr(exId)}')" class="p-1 ${inSrs ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}" title="Thêm vào bộ ôn ví dụ">⭐</button>
        </div>
      </div>
      ${py ? `<div class="text-xs text-primary mb-0.5" data-view-part="py">${py}</div>` : ''}
      ${vi ? `<div class="text-sm text-slate-700" data-view-part="vi">🇻🇳 ${vi}</div>` : ''}
      ${en && en !== vi ? `<div class="text-xs text-slate-400 italic mt-0.5" data-view-part="en">🇬🇧 ${en}</div>` : ''}
    </div>`;
  }

  window.gramSetExView = function (view) {
    const list = $('#gram-ex-list'); if (!list) return;
    list.dataset.view = view;
    $$('#gram-ex-tabs .gram-ex-tab').forEach(b => {
      const a = b.dataset.view === view;
      b.classList.toggle('active', a);
      b.classList.toggle('bg-primary', a);
      b.classList.toggle('text-white', a);
      b.classList.toggle('bg-slate-100', !a);
    });
    // Hide/show parts
    list.querySelectorAll('.gram-ex').forEach(ex => {
      const py = ex.querySelector('[data-view-part="py"]');
      const vi = ex.querySelector('[data-view-part="vi"]');
      const en = ex.querySelector('[data-view-part="en"]');
      if (view === 'zh') { py && (py.style.display = ''); vi && (vi.style.display = 'none'); en && (en.style.display = 'none'); }
      else if (view === 'vi') { py && (py.style.display = ''); vi && (vi.style.display = ''); en && (en.style.display = 'none'); }
      else if (view === 'en') { py && (py.style.display = ''); vi && (vi.style.display = 'none'); en && (en.style.display = ''); }
      else { py && (py.style.display = ''); vi && (vi.style.display = ''); en && (en.style.display = ''); }
    });
  };

  window.gramSpeak = function (text) {
    if (!text) return;
    if (CW.speakText) CW.speakText(text);
    else if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN'; window.speechSynthesis.speak(u);
    }
  };

  // ===== Bookmark / Learned =====
  window.gramToggleBookmark = function () {
    if (!currentRule) return;
    if (bookmarks.has(currentRule._id)) bookmarks.delete(currentRule._id);
    else bookmarks.add(currentRule._id);
    saveSet(STORAGE.bookmarks, bookmarks);
    CW.showToast && CW.showToast(bookmarks.has(currentRule._id) ? '⭐ Đã lưu' : 'Đã bỏ lưu');
    renderDetail(currentRule);
    renderSidebarList();
    updateProgress();
  };

  window.gramToggleLearned = function () {
    if (!currentRule) return;
    if (learned.has(currentRule._id)) learned.delete(currentRule._id);
    else learned.add(currentRule._id);
    saveSet(STORAGE.learned, learned);
    CW.showToast && CW.showToast(learned.has(currentRule._id) ? '✓ Đã đánh dấu đã học' : 'Đã bỏ đánh dấu');
    renderDetail(currentRule);
    renderSidebarList();
    updateProgress();
    renderHskProgress();
  };

  window.gramCopyLink = function () {
    if (!currentRule) return;
    const url = location.origin + location.pathname + '#/grammar/' + encodeURIComponent(currentRule._id);
    navigator.clipboard.writeText(url).then(() => CW.showToast && CW.showToast('🔗 Đã sao chép link'));
  };

  window.gramRandomRule = function () {
    const pool = gramFiltered.length ? gramFiltered : grammarData;
    if (!pool.length) return;
    selectRule(pool[Math.floor(Math.random() * pool.length)]);
  };

  // ===== Related =====
  function renderRelated(rule) {
    const box = $('#gram-related'); if (!box) return;
    const same = grammarData.filter(r => r._id !== rule._id && r._group === rule._group && r.hsk_level === rule.hsk_level).slice(0, 6);
    if (!same.length) { box.innerHTML = '<span class="text-slate-300">—</span>'; return; }
    box.innerHTML = same.map(r => `<div class="py-1 border-b border-slate-50 last:border-0 cursor-pointer hover:text-primary" onclick="gramSelectById('${escAttr(r._id)}')">${escapeHtml(r.name_vi)}</div>`).join('');
  }

  // ===== Progress bars =====
  function updateProgress() {
    const total = gramFiltered.length;
    const done = gramFiltered.filter(r => learned.has(r._id)).length;
    const pct = total ? Math.round(done / total * 100) : 0;
    const bar = $('#gram-progress-bar'); const txt = $('#gram-progress-text');
    if (bar) bar.style.width = pct + '%';
    if (txt) txt.textContent = `${done}/${total} (${pct}%)`;
  }

  function renderHskProgress() {
    const box = $('#gram-hsk-progress'); if (!box) return;
    let html = '';
    for (let lv = 1; lv <= 6; lv++) {
      const rules = grammarData.filter(r => r.hsk_level === lv);
      if (!rules.length) continue;
      const done = rules.filter(r => learned.has(r._id)).length;
      const pct = Math.round(done / rules.length * 100);
      html += `<div>
        <div class="flex justify-between mb-0.5"><span>HSK ${lv}</span><span class="text-slate-400">${done}/${rules.length}</span></div>
        <div class="h-1 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-gradient-to-r from-blue-400 to-primary" style="width:${pct}%"></div></div>
      </div>`;
    }
    box.innerHTML = html || '<span class="text-slate-300">—</span>';
  }

  // ===== SRS examples mini-deck (Leitner) =====
  window.gramToggleExSrs = function (exId) {
    if (srsCards[exId]) {
      delete srsCards[exId];
      CW.showToast && CW.showToast('Đã bỏ khỏi bộ ôn ví dụ');
    } else {
      // Find the example
      const [rid, idx] = [exId.substring(0, exId.lastIndexOf(':')), parseInt(exId.substring(exId.lastIndexOf(':') + 1))];
      const rule = grammarData.find(r => r._id === rid);
      if (!rule) return;
      const ex = (rule.examples || [])[idx];
      if (!ex) return;
      srsCards[exId] = {
        zh: ex.zh, pinyin: ex.pinyin, vi: ex.vi, en: ex.en,
        ruleName: rule.name_vi, hsk: rule.hsk_level,
        box: 1, nextReview: new Date().toISOString().slice(0, 10),
      };
      CW.showToast && CW.showToast('⭐ Đã thêm vào bộ ôn ví dụ');
    }
    saveObj(STORAGE.srsCards, srsCards);
    // Refresh only the affected example button
    const el = document.querySelector(`[data-ex-id="${CSS.escape(exId)}"]`);
    if (el) {
      const btn = el.querySelector('button[onclick*="gramToggleExSrs"]');
      const inSrs = !!srsCards[exId];
      btn.classList.toggle('text-amber-500', inSrs);
      btn.classList.toggle('text-slate-300', !inSrs);
    }
    updateSrsCount();
  };

  function updateSrsCount() {
    const n = Object.keys(srsCards).length;
    const el = $('#gram-srs-count'); if (el) el.textContent = n;
  }

  window.gramReviewExamples = function () {
    const cards = Object.entries(srsCards);
    if (!cards.length) { CW.showToast && CW.showToast('Chưa có ví dụ nào được lưu'); return; }
    // Filter due
    const today = new Date().toISOString().slice(0, 10);
    const due = cards.filter(([, c]) => !c.nextReview || c.nextReview <= today);
    const pool = due.length ? due : cards;
    openExReviewer(pool);
  };

  function openExReviewer(pool) {
    // Simple modal flashcard reviewer
    let idx = 0; let flipped = false;
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4';
    modal.innerHTML = `<div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
      <div class="flex items-center justify-between mb-3">
        <div class="text-xs text-slate-500"><span id="grex-i">1</span>/<span id="grex-n">${pool.length}</span></div>
        <button id="grex-close" class="text-slate-400 hover:text-red-500">✕</button>
      </div>
      <div id="grex-card" class="min-h-[200px] border-2 rounded-xl p-5 text-center cursor-pointer hover:border-primary"></div>
      <div class="flex gap-2 mt-4" id="grex-ctrl"></div>
    </div>`;
    document.body.appendChild(modal);

    function render() {
      const [id, c] = pool[idx];
      const card = modal.querySelector('#grex-card');
      modal.querySelector('#grex-i').textContent = idx + 1;
      if (!flipped) {
        card.innerHTML = `<div class="font-cn text-3xl text-hanzi mb-2">${escapeHtml(c.zh)}</div>
          <div class="text-sm text-slate-400">Bấm để xem nghĩa</div>`;
      } else {
        card.innerHTML = `<div class="font-cn text-2xl text-hanzi mb-1">${escapeHtml(c.zh)}</div>
          <div class="text-xs text-primary mb-2">${escapeHtml(c.pinyin || '')}</div>
          <div class="text-sm text-slate-700 mb-1">🇻🇳 ${escapeHtml(c.vi || '')}</div>
          ${c.en ? `<div class="text-xs text-slate-400 italic">🇬🇧 ${escapeHtml(c.en)}</div>` : ''}
          <div class="mt-3 text-[11px] text-slate-400">Từ: <em>${escapeHtml(c.ruleName || '')}</em> (HSK ${c.hsk})</div>`;
      }
      const ctrl = modal.querySelector('#grex-ctrl');
      if (!flipped) {
        ctrl.innerHTML = `<button id="grex-flip" class="flex-1 py-2 bg-primary text-white rounded-lg">🔄 Lật thẻ</button>`;
      } else {
        ctrl.innerHTML = `
          <button data-r="1" class="grex-r flex-1 py-2 bg-red-100 text-red-700 rounded-lg text-sm">😵 Lại</button>
          <button data-r="2" class="grex-r flex-1 py-2 bg-amber-100 text-amber-700 rounded-lg text-sm">😐 Khó</button>
          <button data-r="3" class="grex-r flex-1 py-2 bg-green-100 text-green-700 rounded-lg text-sm">🙂 OK</button>
          <button data-r="4" class="grex-r flex-1 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm">😎 Dễ</button>`;
      }
    }
    render();

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.id === 'grex-close') { modal.remove(); updateSrsCount(); return; }
      if (e.target.id === 'grex-card' || e.target.closest('#grex-card')) { flipped = !flipped; render(); return; }
      if (e.target.id === 'grex-flip') { flipped = true; render(); return; }
      if (e.target.classList.contains('grex-r')) {
        const r = parseInt(e.target.dataset.r);
        const [id, c] = pool[idx];
        // Simple Leitner-ish: box 1->1d, 2->3d, 3->7d, 4->14d
        const days = r === 1 ? 1 : r === 2 ? 3 : r === 3 ? 7 : 14;
        c.box = Math.max(1, Math.min(5, (c.box || 1) + (r >= 3 ? 1 : -1)));
        const nd = new Date(); nd.setDate(nd.getDate() + days);
        c.nextReview = nd.toISOString().slice(0, 10);
        srsCards[id] = c;
        saveObj(STORAGE.srsCards, srsCards);
        idx++; flipped = false;
        if (idx >= pool.length) { modal.remove(); CW.showToast && CW.showToast('🎉 Hoàn thành!'); updateSrsCount(); return; }
        render();
      }
    });
  }

  // ===== Mobile drawer =====
  window.gramToggleSidebar = function (force) {
    const sb = $('#gram-sidebar'); const ov = $('#gram-overlay');
    const willOpen = force === true ? true : force === false ? false : !sb.classList.contains('open');
    sb.classList.toggle('open', willOpen);
    ov.classList.toggle('open', willOpen);
  };

  // ===== Keyboard shortcuts =====
  document.addEventListener('keydown', (e) => {
    if (!$('#page-grammar').classList.contains('active')) return;
    const inInput = /INPUT|TEXTAREA/.test(document.activeElement.tagName);
    if (e.key === '/' && !inInput) { e.preventDefault(); $('#gram-search').focus(); return; }
    if (inInput) return;
    if (e.key === 'Escape') { gramToggleSidebar(false); return; }
    if (e.key === 'r' || e.key === 'R') { gramRandomRule(); return; }
    if (currentRule) {
      if (e.key === 'b' || e.key === 'B') { gramToggleBookmark(); return; }
      if (e.key === 'n' || e.key === 'N') { gramToggleLearned(); return; }
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!gramFiltered.length) return;
      e.preventDefault();
      const curIdx = currentRule ? gramFiltered.findIndex(r => r._id === currentRule._id) : -1;
      let ni = curIdx + (e.key === 'ArrowDown' ? 1 : -1);
      if (ni < 0) ni = gramFiltered.length - 1;
      if (ni >= gramFiltered.length) ni = 0;
      selectRule(gramFiltered[ni]);
    }
  });

  // ===== Deep link =====
  function handleHash() {
    const m = location.hash.match(/^#\/grammar\/(.+)$/);
    if (!m || !grammarData.length) return;
    const id = decodeURIComponent(m[1]);
    const r = grammarData.find(x => x._id === id);
    if (r) selectRule(r);
  }
  window.addEventListener('hashchange', handleHash);

  // ===== Utils =====
  function escapeHtml(s) {
    return (s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function escAttr(s) { return (s || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '&quot;'); }

  // ===== Page hook =====
  CW.registerPageHook('grammar', function () {
    reloadStorage();
    if (grammarData.length === 0) loadGrammar();
    else { applyFilters(); renderHskProgress(); updateSrsCount(); handleHash(); }
  });
})();
