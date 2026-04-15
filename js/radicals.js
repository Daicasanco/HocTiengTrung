// js/radicals.js — Radical modal, variants, decomposition, radicals page
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$, $$ = CW.$$;
  const allWords = CW.allWords;
  const characters = CW.characters;
  const radicals = CW.radicals;

  // ===== RADICAL VARIANT MAP =====
  const RADICAL_VARIANTS = {
    '心': ['心', '忄'], '水': ['水', '氵'], '手': ['手', '扌'],
    '火': ['火', '灬'], '刀': ['刀', '刂'], '人': ['人', '亻'],
    '犬': ['犬', '犭'], '言': ['言', '讠'], '金': ['金', '钅'],
    '食': ['食', '饣'], '糸': ['糸', '纟'], '衣': ['衣', '衤'],
    '示': ['示', '礻'], '竹': ['竹', '⺮'], '艸': ['艸', '艹'],
    '网': ['网', '罒'], '阜': ['阜', '阝'], '邑': ['邑', '阝'],
    '肉': ['肉', '⺼', '月'], '老': ['老', '耂'], '辵': ['辵', '辶'],
    '門': ['門', '门'], '車': ['車', '车'], '馬': ['馬', '马'],
    '長': ['長', '长'], '魚': ['魚', '鱼'], '鳥': ['鳥', '鸟'],
    '貝': ['貝', '贝'], '見': ['見', '见'], '頁': ['頁', '页'],
    '風': ['風', '风'], '飛': ['飛', '飞'], '齒': ['齒', '齿'],
    '龍': ['龍', '龙'], '龜': ['龜', '龟'],
  };

  const _variantToMain = {};
  for (const [main, variants] of Object.entries(RADICAL_VARIANTS)) {
    for (const v of variants) {
      if (!_variantToMain[v]) _variantToMain[v] = [];
      _variantToMain[v].push(main);
    }
  }

  function getRadicalGroup(radical) {
    if (RADICAL_VARIANTS[radical]) return RADICAL_VARIANTS[radical];
    const mains = _variantToMain[radical];
    if (mains) {
      const all = new Set();
      for (const m of mains) { for (const v of RADICAL_VARIANTS[m]) all.add(v); }
      return [...all];
    }
    return [radical];
  }

  const _radicalCache = {};

  function getCharsByRadical(radical) {
    const key = 'chars_' + radical;
    if (_radicalCache[key]) return _radicalCache[key];
    const group = getRadicalGroup(radical);
    const groupSet = new Set(group);
    const result = [];
    for (const [ch, data] of Object.entries(characters)) {
      if (data.radical && groupSet.has(data.radical)) result.push({ char: ch, ...data });
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

  // Expose on CW for other modules
  CW.getCharsByRadical = getCharsByRadical;
  CW.getWordsByRadical = getWordsByRadical;

  // ===== DECOMP CLICKABLE =====
  function makeDecompClickable(decomp, radicalChar) {
    const parts = [...(decomp || '')];
    return parts.map(p => {
      const code = p.codePointAt(0);
      const isSt = code >= 0x2FF0 && code <= 0x2FFF;
      if (isSt) return `<span class="inline-flex items-center justify-center w-10 h-10 rounded-lg font-cn text-lg bg-blue-50 border border-blue-200 text-primary text-sm">${p}</span>`;
      const isRad = radicals[p];
      const isChar = characters[p];
      const clickable = isRad || isChar;
      const isRadicalOfChar = p === radicalChar;
      const bgClass = isRadicalOfChar ? 'bg-red-50 border-red-300 text-red-700 ring-2 ring-red-200' : 'bg-amber-50 border border-amber-200 text-hanzi';
      const cursorClass = clickable ? 'cursor-pointer hover:scale-110 hover:shadow-md active:scale-95' : '';
      const onclick = clickable ? `onclick="showRadicalModal('${p.replace(/'/g, "\\\\'")}')"` : '';
      const title = isRad ? `title="Bộ ${radicals[p].viet} - Click xem chi tiết"` : (isChar ? `title="Click xem chi tiết"` : '');
      return `<span class="inline-flex items-center justify-center w-10 h-10 rounded-lg font-cn text-lg ${bgClass} ${cursorClass} transition-all" ${onclick} ${title}>${p}</span>`;
    }).join('');
  }
  CW.makeDecompClickable = makeDecompClickable;

  // ===== RADICAL MODAL =====
  let _modalTab = 'info';

  window.showRadicalModal = async function (char) {
    await CW.ensureCharacters();
    const old = document.getElementById('radical-modal-overlay');
    if (old) old.remove();
    const rad = radicals[char];
    const charData = characters[char];
    if (!rad && !charData) { CW.showToast('Không có dữ liệu cho "' + char + '"'); return; }
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
      overlay.querySelectorAll('.rm-tab').forEach(btn => {
        const t = btn.dataset.tab;
        btn.classList.toggle('border-primary', t === _modalTab);
        btn.classList.toggle('text-primary', t === _modalTab);
        btn.classList.toggle('border-transparent', t !== _modalTab);
        btn.classList.toggle('text-slate-400', t !== _modalTab);
      });
    }

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
    history.pushState({ page: CW._currentPage, modal: 'radical' }, '');
    if (!document.getElementById('radical-modal-style')) {
      const style = document.createElement('style');
      style.id = 'radical-modal-style';
      style.textContent = `.animate-in { animation: modalIn 0.2s ease-out; } @keyframes modalIn { from { opacity:0; transform: scale(0.95) translateY(10px); } to { opacity:1; transform: scale(1) translateY(0); } }`;
      document.head.appendChild(style);
    }
    render();
    window._switchRadTab = function (tab) { _modalTab = tab; render(); };
  };

  function buildInfoTab(char, rad, charData, variantGroup, charsCount, wordsCount) {
    let html = '';
    html += `<div class="text-center mb-4"><div class="font-cn text-6xl font-bold text-hanzi mb-2">${char}</div>`;
    if (rad) {
      html += `<div class="text-primary font-medium text-lg">${rad.pinyin}</div>`;
      html += `<div class="text-sm text-slate-500 mt-1">Bộ thủ #${rad.num} · ${rad.strokes} nét</div>`;
      if (charsCount || wordsCount) html += `<div class="text-xs text-slate-400 mt-1">${charsCount} chữ Hán · ${wordsCount} từ vựng HSK</div>`;
    }
    html += `</div>`;
    if (rad) {
      html += `<div class="bg-gradient-to-r from-red-50 to-amber-50 rounded-xl p-4 mb-3 border border-red-100">`;
      html += `<h4 class="text-sm font-bold text-red-600 mb-2">📕 Thông tin Bộ thủ</h4>`;
      html += `<div class="grid grid-cols-2 gap-2 text-sm">`;
      html += `<div><span class="text-slate-400">Âm Hán Việt:</span> <strong class="text-red-700">${rad.viet}</strong></div>`;
      html += `<div><span class="text-slate-400">Pinyin:</span> <strong>${rad.pinyin}</strong></div>`;
      html += `<div><span class="text-slate-400">Nghĩa EN:</span> <strong>${rad.meaning}</strong></div>`;
      html += `<div><span class="text-slate-400">Số nét:</span> <strong>${rad.strokes}</strong></div></div>`;
      if (variantGroup.length > 1) {
        html += `<div class="mt-3"><span class="text-xs font-bold text-slate-500 uppercase tracking-wide">Các biến thể:</span><div class="flex flex-wrap gap-2 mt-1.5">`;
        for (const v of variantGroup) {
          const vRad = radicals[v]; const label = vRad ? vRad.meaning : '';
          html += `<span class="inline-flex items-center gap-1 bg-white border border-red-200 rounded-lg px-2.5 py-1.5"><span class="font-cn text-xl font-bold text-red-700">${v}</span>${label ? `<span class="text-xs text-slate-400">${label}</span>` : ''}</span>`;
        }
        html += `</div>`;
        if (variantGroup.includes('阝')) html += `<p class="text-xs text-amber-600 mt-2 italic">⚠️ 阝 bên trái = bộ Phụ 阜 (đồi núi), bên phải = bộ Ấp 邑 (thành phố)</p>`;
        if (variantGroup.includes('⺼') || variantGroup.includes('月')) html += `<p class="text-xs text-amber-600 mt-2 italic">⚠️ Khi ở bên trái/dưới, 月 thường là biến thể của bộ Nhục 肉, không phải bộ Nguyệt 月</p>`;
        html += `</div>`;
      }
      if (rad.examples) {
        const exChars = [...rad.examples];
        html += `<div class="mt-3"><span class="text-xs font-bold text-slate-500 uppercase tracking-wide">Ví dụ:</span><div class="flex flex-wrap gap-1.5 mt-1.5">`;
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
      if (charsCount > 0) {
        const charEscR = char.replace(/'/g, "\\\\'");
        html += `<button onclick="exportRadicalPdf('${charEscR}')" class="w-full mt-3 py-2.5 text-sm font-medium text-red-700 border-2 border-red-200 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2">📄 Xuất PDF luyện viết (${charsCount} chữ)</button>`;
      }
      html += `</div>`;
    }
    if (charData) {
      html += `<div class="bg-white rounded-xl border p-4 mb-3"><h4 class="text-sm font-bold text-primary mb-2">✏️ Thông tin chữ</h4>`;
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
      if (charData.decomp) html += `<div class="mt-2"><span class="text-xs font-bold text-primary uppercase tracking-wide">Phân tách:</span><div class="flex flex-wrap gap-2 mt-1.5">${makeDecompClickable(charData.decomp, charData.radical)}</div></div>`;
      if (charData.etymology) {
        try {
          const ety = typeof charData.etymology === 'string' ? JSON.parse(charData.etymology) : charData.etymology;
          if (ety.hint) html += `<div class="mt-2 text-xs text-slate-500 italic">💡 ${ety.hint}</div>`;
        } catch (e) { }
      }
      html += `</div>`;
      const charEsc = char.replace(/'/g, "\\\\'");
      html += `<div class="flex gap-2"><button onclick="closeRadicalModal();strokeQuick('${charEsc}')" class="flex-1 py-2.5 text-sm font-medium text-primary border-2 border-primary rounded-lg hover:bg-blue-50 transition-colors">✏️ Xem bút thuận</button>`;
      html += `<button onclick="speakWord('${charEsc}')" class="px-4 py-2.5 text-sm font-medium bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors">🔊</button></div>`;
    }
    return html;
  }

  function buildCharsTab(charsList, radicalChar) {
    if (!charsList.length) return '<p class="text-center text-slate-400 py-8">Không tìm thấy chữ Hán nào</p>';
    const groups = {};
    for (const c of charsList) { const sc = c.strokeCount || 0; if (!groups[sc]) groups[sc] = []; groups[sc].push(c); }
    const sortedKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);
    let html = `<div class="text-xs text-slate-400 mb-3">${charsList.length} chữ Hán thuộc bộ này, sắp xếp theo số nét</div>`;
    for (const sc of sortedKeys) {
      html += `<div class="mb-3"><div class="text-xs font-bold text-slate-500 mb-1.5 sticky top-0 bg-white py-1">${sc} nét <span class="text-slate-300">(${groups[sc].length})</span></div><div class="flex flex-wrap gap-1.5">`;
      for (const c of groups[sc]) {
        const w = allWords.find(x => x.hanzi === c.char);
        const vi = w ? (w.vietnamese || w.english || '').split(/[;；]/)[0].trim() : (c.def || '');
        const viShort = vi.length > 12 ? vi.substring(0, 11) + '…' : vi;
        const charEsc = c.char.replace(/'/g, "\\\\'");
        html += `<span class="inline-flex items-center gap-1 bg-white border rounded-lg px-2 py-1.5 cursor-pointer hover:bg-blue-50 hover:border-primary hover:shadow-sm transition-all group/ch" onclick="closeRadicalModal();strokeQuick('${charEsc}')">`;
        html += `<span class="font-cn text-xl font-bold text-hanzi group-hover/ch:text-primary transition-colors">${c.char}</span>`;
        if (viShort) html += `<span class="text-[10px] text-slate-400 max-w-[70px] truncate leading-tight">${viShort}</span>`;
        html += `</span>`;
      }
      html += `</div></div>`;
    }
    return html;
  }

  function buildWordsTab(wordsList) {
    if (!wordsList.length) return '<p class="text-center text-slate-400 py-8">Không tìm thấy từ vựng HSK nào</p>';
    const sorted = [...wordsList].sort((a, b) => (a.hsk - b.hsk) || (a.pinyin || '').localeCompare(b.pinyin || ''));
    const groups = {};
    for (const w of sorted) { const lv = w.hsk || 0; if (!groups[lv]) groups[lv] = []; groups[lv].push(w); }
    const sortedKeys = Object.keys(groups).map(Number).sort((a, b) => a - b);
    let html = `<div class="text-xs text-slate-400 mb-3">${wordsList.length} từ vựng HSK chứa bộ này</div>`;
    for (const lv of sortedKeys) {
      html += `<div class="mb-3"><div class="text-xs font-bold text-amber-600 mb-1.5 sticky top-0 bg-white py-1">HSK ${lv} <span class="text-slate-300">(${groups[lv].length} từ)</span></div><div class="divide-y">`;
      for (const w of groups[lv]) {
        const vi = (w.vietnamese || '').split(/[;；]/)[0].trim();
        const en = (w.english || '').split(/[;；]/)[0].trim();
        const def = vi || en;
        const hanziEsc = w.hanzi.replace(/'/g, "\\\\'");
        html += `<div class="flex items-center gap-3 py-2 cursor-pointer hover:bg-blue-50 rounded-lg px-1 transition-colors" onclick="closeRadicalModal();openDetailByHanzi('${hanziEsc}')">`;
        html += `<span class="font-cn text-xl font-bold text-hanzi min-w-[50px]">${w.hanzi}</span>`;
        html += `<div class="flex-1 min-w-0"><div class="text-xs text-primary font-medium">${w.pinyin || ''}</div>`;
        if (def) html += `<div class="text-xs text-slate-500 truncate">${def}</div>`;
        html += `</div><span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 flex-shrink-0">HSK${w.hsk}</span>`;
        html += `<button onclick="event.stopPropagation();speakWord('${hanziEsc}')" class="w-7 h-7 rounded-lg flex items-center justify-center text-primary hover:bg-primary hover:text-white transition-colors flex-shrink-0">🔊</button></div>`;
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

  async function renderRadicalsPage() {
    await CW.ensureCharacters();
    const grid = $('#rad-grid');
    const chips = $('#rad-stroke-chips');
    const countEl = $('#rad-count');
    if (!grid || !Object.keys(radicals).length) return;
    const strokeGroups = {};
    for (const [ch, r] of Object.entries(radicals)) { const s = r.strokes || 0; if (!strokeGroups[s]) strokeGroups[s] = []; strokeGroups[s].push({ char: ch, ...r }); }
    const strokeKeys = Object.keys(strokeGroups).map(Number).sort((a, b) => a - b);
    let chipsH = `<button class="hsk-chip ${radStrokeFilter === 0 ? 'active' : ''}" onclick="filterRadStroke(0)">Tất cả</button>`;
    for (const s of strokeKeys) chipsH += `<button class="hsk-chip ${radStrokeFilter === s ? 'active' : ''}" onclick="filterRadStroke(${s})">${s} nét <span class="text-xs opacity-60">(${strokeGroups[s].length})</span></button>`;
    chips.innerHTML = chipsH;
    const q = ($('#rad-search')?.value || '').trim().toLowerCase();
    let items = [];
    const keys = radStrokeFilter > 0 ? [radStrokeFilter] : strokeKeys;
    for (const s of keys) { if (!strokeGroups[s]) continue; for (const r of strokeGroups[s]) items.push(r); }
    if (q) items = items.filter(r => r.char.includes(q) || (r.viet || '').toLowerCase().includes(q) || (r.meaning || '').toLowerCase().includes(q) || (r.pinyin || '').toLowerCase().includes(q));
    countEl.textContent = items.length + ' bộ';
    grid.innerHTML = items.map(r => {
      const charsCount = getCharsByRadical(r.char).length;
      return `<div class="bg-white border-2 rounded-xl p-3 text-center cursor-pointer hover:border-primary hover:shadow-md transition-all group" onclick="showRadicalModal('${r.char.replace(/'/g, "\\\\'")}')">
        <div class="font-cn text-3xl font-bold text-hanzi group-hover:text-primary transition-colors">${r.char}</div>
        <div class="text-[10px] text-slate-500 mt-1 truncate">${r.viet}</div>
        <div class="text-[10px] text-slate-400">${r.strokes}画 · ${charsCount}字</div>
      </div>`;
    }).join('');
  }

  window.filterRadStroke = function (s) { radStrokeFilter = s; renderRadicalsPage(); };
  window.filterRadicalsPage = function () { renderRadicalsPage(); };

  window.exportRadicalPdf = function (radical) {
    const chars = getCharsByRadical(radical);
    if (!chars.length) { CW.showToast('Không có chữ Hán nào'); return; }
    closeRadicalModal();
    CW.showPage('pdf');
    setPdfMode('custom');
    const input = $('#pdf-custom-input');
    if (input) input.value = chars.map(c => c.char).join(', ');
    const radInfo = radicals[radical];
    const name = radInfo ? radInfo.viet : radical;
    CW.showToast(`Đã điền ${chars.length} chữ thuộc bộ "${name}" vào trang PDF`);
  };

  CW.registerPageHook('radicals', renderRadicalsPage);
})();
