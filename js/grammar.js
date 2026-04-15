// js/grammar.js — Grammar page (load, filter, render)
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$;
  const $$ = CW.$$;

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

  window.gramFilterHsk = function (lv) {
    gramSelectedHsk = lv;
    $$('#gram-chips .hsk-chip').forEach(c => c.classList.toggle('active', parseInt(c.dataset.lv) === lv));
    gramApplyFilters();
  };

  window.gramSearch = function () {
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

  window.gramLoadMore = function () {
    gramPage++;
    gramRender();
  };

  window.gramRelatedClick = function (w) {
    const input = $('#gram-search');
    if (input) { input.value = w; gramApplyFilters(); }
  };

  // Register page hook: load grammar data when grammar page is shown
  CW.registerPageHook('grammar', function () {
    if (grammarData.length === 0) loadGrammar();
  });
})();
