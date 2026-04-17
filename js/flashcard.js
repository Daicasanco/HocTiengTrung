// js/flashcard.js — Flashcard system (setup, play, Leitner boxes, result, PDF export)
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$, $$ = CW.$$;
  const allWords = CW.allWords;
  const characters = CW.characters;
  const radicals = CW.radicals;

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
  let fcCorrectSet = new Set();

  // Expose state for SRS module to start review
  CW.fc = {
    get source() { return fcSource; }, set source(v) { fcSource = v; },
    get mode() { return fcMode; }, set mode(v) { fcMode = v; },
    get deck() { return fcDeck; }, set deck(v) { fcDeck = v; },
  };

  function fcLoadStats() { try { return JSON.parse(localStorage.getItem(FC_STATS_KEY) || '{}'); } catch (e) { return {}; } }
  function fcSaveStats(s) { localStorage.setItem(FC_STATS_KEY, JSON.stringify(s)); }
  function fcLoadSessions() { try { return JSON.parse(localStorage.getItem(FC_SESSIONS_KEY) || '[]'); } catch (e) { return []; } }
  function fcSaveSessions(s) { localStorage.setItem(FC_SESSIONS_KEY, JSON.stringify(s)); }

  window.fcSelectSource = function (src) {
    fcSource = src;
    document.querySelectorAll('.fc-src-btn').forEach(b => {
      b.classList.toggle('border-primary', b.dataset.src === src);
      b.classList.toggle('bg-blue-50', b.dataset.src === src);
    });
    const optsEl = $('#fc-source-options');
    optsEl.classList.remove('hidden');
    let html = '';
    if (src === 'hsk') {
      const levels = [...new Set(allWords.map(w => w.hsk))].sort((a, b) => a - b);
      html = '<div class="bg-slate-50 rounded-xl p-4"><p class="text-xs text-slate-500 mb-2">Chọn cấp HSK:</p><div class="flex flex-wrap gap-2 mb-3">';
      for (const lv of levels) {
        const cnt = allWords.filter(w => w.hsk === lv).length;
        html += `<label class="flex items-center gap-1.5 bg-white border-2 rounded-lg px-3 py-2 cursor-pointer hover:border-primary transition-colors"><input type="checkbox" class="fc-hsk-cb accent-primary" value="${lv}" ${lv <= 2 ? 'checked' : ''}><span class="text-sm font-medium">HSK ${lv}</span><span class="text-[10px] text-slate-400">(${cnt})</span></label>`;
      }
      html += '</div><div class="flex items-center gap-3"><label class="text-xs text-slate-500">Giới hạn:</label><input type="number" id="fc-hsk-limit" value="30" min="5" max="500" class="w-20 px-2 py-1 border rounded-lg text-sm"></div></div>';
    } else if (src === 'bookmark') {
      const sets = CW.loadBookmarks();
      if (!sets.length) {
        html = '<div class="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">⚠️ Chưa có bộ bookmark nào. Hãy tạo bộ từ vựng trong <a href="#" onclick="showPage(\'bookmarks\')" class="underline font-medium">Hồ sơ học</a> trước.</div>';
      } else {
        html = '<div class="bg-slate-50 rounded-xl p-4"><p class="text-xs text-slate-500 mb-2">Chọn bộ từ vựng:</p><div class="space-y-2">';
        for (const s of sets) html += `<label class="flex items-center gap-2 bg-white border-2 rounded-lg px-3 py-2 cursor-pointer hover:border-primary transition-colors"><input type="radio" name="fc-bm-set" class="accent-primary" value="${s.id}" ${s.id === sets[0].id ? 'checked' : ''}><span class="text-sm font-medium">${s.name}</span><span class="text-[10px] text-slate-400">(${s.words.length} từ)</span></label>`;
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

  window.fcRadicalChanged = function () {
    const sel = document.querySelector('input[name="fc-rad"]:checked');
    const modeEl = document.querySelector('input[name="fc-rad-mode"]:checked');
    const mode = modeEl ? modeEl.value : 'all';
    const randomOpts = document.getElementById('fc-rad-random-opts');
    const pickList = document.getElementById('fc-rad-pick-list');
    if (randomOpts) randomOpts.classList.toggle('hidden', mode !== 'random');
    if (pickList) pickList.classList.toggle('hidden', mode !== 'pick');
    if (mode === 'pick' && sel && pickList) {
      const words = CW.getWordsByRadical(sel.value);
      if (!words.length) { pickList.innerHTML = '<p class="text-xs text-slate-400 py-2">Không có từ nào</p>'; }
      else {
        let h = '<div class="flex items-center justify-between mb-2"><span class="text-xs text-slate-500">' + words.length + ' từ</span>';
        h += '<button onclick="fcRadPickToggleAll()" class="text-xs text-primary font-medium hover:underline">Chọn/Bỏ tất cả</button></div>';
        h += '<div class="flex flex-wrap gap-1.5">';
        for (const w of words) {
          const vi = (w.vietnamese || '').split(/[;；]/)[0].trim();
          const esc = w.hanzi.replace(/'/g, "\\\\'");
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

  window.fcRadPickToggleAll = function () {
    const cbs = document.querySelectorAll('.fc-rad-pick-cb');
    const allChecked = [...cbs].every(c => c.checked);
    cbs.forEach(c => c.checked = !allChecked);
    setTimeout(fcUpdateStartInfo, 50);
  };

  window.fcSelectMode = function (mode) {
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
      for (const lv of checked) words = words.concat(allWords.filter(w => w.hsk === lv).slice(0, limit));
    } else if (fcSource === 'bookmark') {
      const sel = document.querySelector('input[name="fc-bm-set"]:checked');
      if (!sel) return [];
      const sets = CW.loadBookmarks();
      const s = sets.find(x => x.id === sel.value);
      if (!s) return [];
      words = s.words.map(h => allWords.find(w => w.hanzi === h)).filter(Boolean);
    } else if (fcSource === 'radical') {
      const sel = document.querySelector('input[name="fc-rad"]:checked');
      if (!sel) return [];
      const radModeEl = document.querySelector('input[name="fc-rad-mode"]:checked');
      const radMode = radModeEl ? radModeEl.value : 'all';
      if (radMode === 'pick') {
        const checked = [...document.querySelectorAll('.fc-rad-pick-cb:checked')].map(c => c.value);
        for (const h of checked) { const found = allWords.find(w => w.hanzi === h); if (found) words.push(found); }
      } else {
        words = CW.getWordsByRadical(sel.value);
        if (radMode === 'random') {
          const count = parseInt($('#fc-rad-random-count')?.value) || 10;
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

  window.fcStart = function () {
    let words = fcGetWordsFromSource();
    if (!words.length) return;
    if ($('#fc-shuffle')?.checked) { for (let i = words.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [words[i], words[j]] = [words[j], words[i]]; } }
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

  // Expose startWithDeck for SRS
  CW.fcStartWithDeck = function (words, mode, opts) {
    opts = opts || {};
    fcSource = 'custom'; fcMode = mode || 'review';
    CW.fcSrsMode = !!opts.srs;
    fcDeck = words;
    for (let i = fcDeck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [fcDeck[i], fcDeck[j]] = [fcDeck[j], fcDeck[i]]; }
    fcIdx = 0; fcFlipped = false; fcCorrect = 0; fcWrong = 0; fcReviewed = 0;
    fcWrongList = []; fcTotalCards = fcDeck.length; fcCorrectSet = new Set();
    fcBoxes = { 1: fcDeck.map(w => ({ word: w, wrongCount: 0 })), 2: [], 3: [] };
    fcQueue = [...fcBoxes[1]];
    CW.showPage('flashcard');
    $('#fc-setup').classList.add('hidden'); $('#fc-play').classList.remove('hidden'); $('#fc-result').classList.add('hidden');
    $('#fc-progress-total').textContent = fcTotalCards;
    $('#fc-ctrl-browse').classList.add('hidden');
    const srsCtrl = $('#fc-ctrl-srs');
    if (CW.fcSrsMode && srsCtrl) {
      srsCtrl.classList.remove('hidden');
      $('#fc-ctrl-review').classList.add('hidden');
    } else {
      if (srsCtrl) srsCtrl.classList.add('hidden');
      $('#fc-ctrl-review').classList.remove('hidden');
    }
    $('#fc-boxes').classList.remove('hidden');
    fcTimerStart = Date.now(); if (fcTimerId) clearInterval(fcTimerId); fcTimerId = setInterval(fcUpdateTimer, 1000);
    fcNextReviewCard(); fcUpdateProgress(); fcUpdateBoxCounts(); fcSetupSwipe();
  };

  function fcUpdateTimer() {
    const elapsed = Math.floor((Date.now() - fcTimerStart) / 1000);
    const el = $('#fc-timer');
    if (el) el.textContent = Math.floor(elapsed / 60) + ':' + (elapsed % 60 < 10 ? '0' : '') + (elapsed % 60);
  }

  function fcUpdateProgress() {
    if (fcMode === 'browse') {
      const cur = fcIdx + 1;
      $('#fc-progress-cur').textContent = cur;
      $('#fc-progress-bar').style.width = Math.round((cur / fcTotalCards) * 100) + '%';
    } else {
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
    const vi = (w.vietnamese || '').split(/[;；]/).map(s => s.trim()).filter(Boolean);
    const en = (w.english || '').split(/[;；]/).map(s => s.trim()).filter(Boolean);
    const viFirst = vi[0] || en[0] || '';
    let frontH = '', backH = '';
    if (!reverse) {
      frontH = `<div class="font-cn text-6xl font-bold text-hanzi mb-4">${w.hanzi}</div>`;
      if (!hidePinyin && w.pinyin) frontH += `<div class="text-lg text-primary font-medium">${w.pinyin}</div>`;
      if (w.hsk) frontH += `<div class="mt-2 text-xs text-amber-600 font-bold">HSK ${w.hsk}</div>`;
      backH = `<div class="font-cn text-4xl font-bold text-hanzi mb-2">${w.hanzi}</div><div class="text-sm text-primary font-medium mb-3">${w.pinyin || ''}</div>`;
      if (vi.length) backH += `<div class="mb-2"><div class="text-xs font-bold text-red-500 mb-1">🇻🇳 Tiếng Việt</div>${vi.map((d, i) => `<p class="text-sm">${i + 1}. ${d}</p>`).join('')}</div>`;
      if (en.length) backH += `<div class="mb-2"><div class="text-xs font-bold text-blue-500 mb-1">🇬🇧 English</div>${en.map((d, i) => `<p class="text-sm">${i + 1}. ${d}</p>`).join('')}</div>`;
    } else {
      frontH = `<div class="text-2xl font-bold text-slate-700 mb-3">${viFirst || '—'}</div>`;
      if (w.pinyin) frontH += `<div class="text-sm text-primary">${w.pinyin}</div>`;
      frontH += `<div class="text-xs text-slate-400 mt-2">Chữ Hán là gì?</div>`;
      backH = `<div class="font-cn text-6xl font-bold text-hanzi mb-3">${w.hanzi}</div><div class="text-lg text-primary font-medium mb-2">${w.pinyin || ''}</div>`;
      if (vi.length) backH += `<div class="text-sm text-slate-600">${vi.join('; ')}</div>`;
    }
    const cd = characters[w.hanzi];
    if (cd && cd.decomp) backH += `<div class="mt-3 pt-2 border-t text-xs text-slate-400">🧩 ${cd.decomp} · ${cd.strokeCount || '?'} nét</div>`;
    if (w.hsk) backH += `<div class="mt-1 text-xs text-amber-600 font-bold">HSK ${w.hsk}</div>`;
    $('#fc-front-content').innerHTML = frontH;
    $('#fc-back-content').innerHTML = backH;
    const frontEl = $('#fc-front'), backEl = $('#fc-back');
    frontEl.style.minHeight = ''; backEl.style.minHeight = '';
    setTimeout(() => { const h = Math.max(frontEl.offsetHeight, backEl.offsetHeight, 280); frontEl.style.minHeight = h + 'px'; backEl.style.minHeight = h + 'px'; }, 10);
  }

  window.fcFlip = function () { fcFlipped = !fcFlipped; $('#fc-card').style.transform = fcFlipped ? 'rotateY(180deg)' : ''; };
  window.fcPrev = function () { if (fcIdx > 0) { fcIdx--; fcRenderCard(fcDeck[fcIdx]); fcUpdateProgress(); } };
  window.fcNext = function () { if (fcIdx < fcDeck.length - 1) { fcIdx++; fcRenderCard(fcDeck[fcIdx]); fcUpdateProgress(); } else fcShowResult(); };

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

  // SRS 4-button rating: 1=Again, 2=Hard, 3=Good, 4=Easy
  window.fcAnswerRating = function (rating) {
    const entry = window._fcCurrentEntry; if (!entry) return;
    // Auto-flip to show answer briefly if not flipped (visual feedback)
    if (CW.updateSrsRating) CW.updateSrsRating(entry.word.hanzi, rating);
    // Map rating to correct/incorrect for Leitner + stats
    window.fcAnswer(rating >= 3);
  };

  // Update rating button interval previews
  function fcUpdateRatingPreview() {
    const entry = window._fcCurrentEntry; if (!entry) return;
    if (!CW.srsPredictInterval) return;
    const h = entry.word.hanzi;
    const pv = id => { const el = document.getElementById(id); if (el) el.textContent = CW.srsPredictInterval(h, parseInt(id.slice(-1))); };
    pv('fc-rating-iv-1'); pv('fc-rating-iv-2'); pv('fc-rating-iv-3'); pv('fc-rating-iv-4');
  }
  CW.fcUpdateRatingPreview = fcUpdateRatingPreview;

  window.fcAnswer = function (correct) {
    const entry = window._fcCurrentEntry; if (!entry) return;
    fcReviewed++;
    // Only use legacy updateSrs if not already rated through fcAnswerRating
    if (!CW.fcSrsMode && CW.updateSrs) CW.updateSrs(entry.word.hanzi, correct);
    const stats = fcLoadStats();
    const key = entry.word.hanzi;
    if (!stats[key]) stats[key] = { correct: 0, wrong: 0, lastReview: '' };
    stats[key].lastReview = new Date().toISOString();
    if (correct) {
      fcCorrect++; fcCorrectSet.add(key); stats[key].correct++;
      const curBox = fcFindBox(entry); fcRemoveFromBox(entry, curBox);
      if (curBox < 3) fcBoxes[curBox + 1].push(entry);
    } else {
      fcWrong++; stats[key].wrong++; entry.wrongCount++;
      if (!fcWrongList.includes(entry.word)) fcWrongList.push(entry.word);
      const curBox = fcFindBox(entry);
      if (curBox > 1) { fcRemoveFromBox(entry, curBox); fcBoxes[1].push(entry); }
      fcQueue.push(entry);
    }
    fcSaveStats(stats); fcUpdateBoxCounts();
    if (fcBoxes[1].length === 0 && fcBoxes[2].length === 0) fcShowResult();
    else {
      if (fcBoxes[2].length && fcReviewed % 3 === 0) fcQueue.unshift(fcBoxes[2][0]);
      fcNextReviewCard();
      setTimeout(fcUpdateRatingPreview, 30);
    }
  };

  // Keyboard: 1/2/3/4 rating in SRS mode
  document.addEventListener('keydown', function (e) {
    if (!CW.fcSrsMode) return;
    const playEl = document.getElementById('fc-play');
    if (!playEl || playEl.classList.contains('hidden')) return;
    if (e.target && /input|textarea|select/i.test(e.target.tagName)) return;
    if (e.key >= '1' && e.key <= '4') { e.preventDefault(); window.fcAnswerRating(parseInt(e.key)); }
    else if (e.key === ' ') { e.preventDefault(); window.fcFlip(); }
  });

  function fcFindBox(entry) { for (let b = 1; b <= 3; b++) { if (fcBoxes[b].includes(entry)) return b; } return 1; }
  function fcRemoveFromBox(entry, box) { fcBoxes[box] = fcBoxes[box].filter(e => e !== entry); }

  window.fcSpeak = function () {
    const w = fcMode === 'browse' ? fcDeck[fcIdx] : window._fcCurrentEntry?.word;
    if (w) CW.speakText(w.hanzi);
  };

  window.fcStop = function () { if (!confirm('Dừng phiên ôn tập?')) return; fcShowResult(); };

  function fcShowResult() {
    if (fcTimerId) { clearInterval(fcTimerId); fcTimerId = null; }
    const elapsed = Math.floor((Date.now() - fcTimerStart) / 1000);
    const m = Math.floor(elapsed / 60), s = elapsed % 60;
    $('#fc-play').classList.add('hidden'); $('#fc-result').classList.remove('hidden');
    let statsH = '';
    if (fcMode === 'review') {
      const uniqueCorrect = fcCorrectSet.size;
      const uniquePct = fcTotalCards > 0 ? Math.round((uniqueCorrect / fcTotalCards) * 100) : 0;
      const stillWrong = fcWrongList.filter(w => !fcCorrectSet.has(w.hanzi));
      const wrongCount = stillWrong.length;
      statsH = `<div class="flex justify-between"><span class="text-slate-500">✅ Đã nhớ</span><strong class="text-green-600">${uniqueCorrect}/${fcTotalCards} (${uniquePct}%)</strong></div>
        <div class="flex justify-between"><span class="text-slate-500">❌ Chưa nhớ</span><strong class="text-red-500">${wrongCount}</strong></div>
        <div class="flex justify-between"><span class="text-slate-500">🔄 Tổng lượt ôn</span><strong>${fcReviewed}</strong></div>
        <div class="flex justify-between"><span class="text-slate-500">⏱️ Thời gian</span><strong>${m}p ${s}s</strong></div>`;
      if (stillWrong.length) {
        $('#fc-replay-wrong-btn').classList.remove('hidden');
        fcWrongList = stillWrong;
        statsH += `<div class="pt-2 border-t"><div class="text-xs text-red-500 font-bold mb-1">Từ chưa nhớ:</div><div class="flex flex-wrap gap-1">${stillWrong.map(w => `<span class="font-cn text-sm bg-red-50 border border-red-200 rounded px-1.5 py-0.5">${w.hanzi}</span>`).join('')}</div></div>`;
      } else { $('#fc-replay-wrong-btn').classList.add('hidden'); }
    } else {
      statsH = `<div class="flex justify-between"><span class="text-slate-500">📖 Đã xem</span><strong>${fcIdx + 1}/${fcDeck.length}</strong></div>
        <div class="flex justify-between"><span class="text-slate-500">⏱️ Thời gian</span><strong>${m}p ${s}s</strong></div>`;
      $('#fc-replay-wrong-btn').classList.add('hidden');
    }
    $('#fc-result-stats').innerHTML = statsH;
    const sessions = fcLoadSessions();
    sessions.push({ date: new Date().toISOString(), mode: fcMode, source: fcSource, total: fcTotalCards, correct: fcCorrect, wrong: fcWrongList.length, time: elapsed });
    if (sessions.length > 100) sessions.splice(0, sessions.length - 100);
    fcSaveSessions(sessions);
    if (CW.srsLoadHistory) {
      const hist = CW.srsLoadHistory();
      hist.push({ date: new Date().toISOString(), total: fcTotalCards, correct: fcCorrect, wrong: fcWrongList.length, mode: fcMode });
      if (hist.length > 100) hist.splice(0, hist.length - 100);
      CW.srsSaveHistory(hist);
      if (CW.srsUpdateStreak) CW.srsUpdateStreak();
    }
  }

  window.fcReplayWrong = function () {
    if (!fcWrongList.length) return;
    fcDeck = [...fcWrongList];
    if ($('#fc-shuffle')?.checked) { for (let i = fcDeck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [fcDeck[i], fcDeck[j]] = [fcDeck[j], fcDeck[i]]; } }
    fcIdx = 0; fcFlipped = false; fcCorrect = 0; fcWrong = 0; fcReviewed = 0; fcWrongList = []; fcTotalCards = fcDeck.length;
    fcBoxes = { 1: fcDeck.map(w => ({ word: w, wrongCount: 0 })), 2: [], 3: [] }; fcQueue = [...fcBoxes[1]];
    $('#fc-result').classList.add('hidden'); $('#fc-play').classList.remove('hidden');
    $('#fc-progress-total').textContent = fcTotalCards;
    fcTimerStart = Date.now(); if (fcTimerId) clearInterval(fcTimerId); fcTimerId = setInterval(fcUpdateTimer, 1000);
    if (fcMode === 'browse') fcRenderCard(fcDeck[0]); else fcNextReviewCard();
    fcUpdateProgress(); fcUpdateBoxCounts();
  };

  window.fcReplayAll = function () { $('#fc-result').classList.add('hidden'); $('#fc-play').classList.add('hidden'); $('#fc-setup').classList.remove('hidden'); };
  window.fcBackToSetup = function () { $('#fc-result').classList.add('hidden'); $('#fc-play').classList.add('hidden'); $('#fc-setup').classList.remove('hidden'); };

  function fcSetupSwipe() {
    const area = $('#fc-card-area');
    let startX = 0, startY = 0, dx = 0, swiping = false;
    area.ontouchstart = function (e) { startX = e.touches[0].clientX; startY = e.touches[0].clientY; dx = 0; swiping = true; };
    area.ontouchmove = function (e) {
      if (!swiping) return;
      dx = e.touches[0].clientX - startX;
      const dy = Math.abs(e.touches[0].clientY - startY);
      if (dy > Math.abs(dx)) { swiping = false; return; }
      if (Math.abs(dx) > 20) e.preventDefault();
      const wrapper = $('#fc-card-wrapper');
      wrapper.style.transform = `translateX(${dx * 0.5}px) rotate(${Math.max(-15, Math.min(15, dx * 0.15))}deg)`;
      wrapper.style.opacity = Math.max(0.4, 1 - Math.abs(dx) / 400);
    };
    area.ontouchend = function () {
      if (!swiping) { resetSwipeVisual(); return; }
      swiping = false;
      if (dx > 80) animateSwipeOut('right', () => { if (fcMode === 'browse') fcNext(); else fcAnswer(true); resetSwipeVisual(); });
      else if (dx < -80) animateSwipeOut('left', () => { if (fcMode === 'browse') fcPrev(); else fcAnswer(false); resetSwipeVisual(); });
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
    w.style.transform = `translateX(${x}px) rotate(${x * 0.05}deg)`; w.style.opacity = '0';
    setTimeout(() => { w.style.transition = 'none'; w.style.transform = 'translateX(0)'; w.style.opacity = '1'; cb(); setTimeout(() => { w.style.transition = ''; }, 50); }, 250);
  }

  // ===== FLASHCARD PDF EXPORT =====
  window.fcExportPdf = function () {
    if (!fcDeck.length) { CW.showToast('Không có từ vựng để xuất'); return; }
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
              <span class="text-xs font-medium">Nhỏ</span><span class="text-[10px] text-slate-400">60×40mm</span><span class="text-[10px] text-slate-400">12 thẻ/trang</span>
            </label>
            <label class="flex flex-col items-center p-3 border-2 rounded-xl cursor-pointer hover:border-primary transition-colors border-primary bg-blue-50">
              <input type="radio" name="fc-pdf-size" value="medium" class="accent-primary mb-1" checked>
              <span class="text-xs font-medium">Vừa</span><span class="text-[10px] text-slate-400">85×55mm</span><span class="text-[10px] text-slate-400">8 thẻ/trang</span>
            </label>
            <label class="flex flex-col items-center p-3 border-2 rounded-xl cursor-pointer hover:border-primary transition-colors">
              <input type="radio" name="fc-pdf-size" value="large" class="accent-primary mb-1">
              <span class="text-xs font-medium">Lớn</span><span class="text-[10px] text-slate-400">95×65mm</span><span class="text-[10px] text-slate-400">6 thẻ/trang</span>
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
    modal.querySelectorAll('input[name="fc-pdf-size"]').forEach(r => {
      r.addEventListener('change', () => {
        modal.querySelectorAll('input[name="fc-pdf-size"]').forEach(r2 => {
          r2.closest('label').classList.toggle('border-primary', r2.checked);
          r2.closest('label').classList.toggle('bg-blue-50', r2.checked);
        });
      });
    });
  };

  window.doFcExportPdf = async function () {
    await CW.ensureCharacters();
    const sizeVal = document.querySelector('input[name="fc-pdf-size"]:checked')?.value || 'medium';
    const showPinyin = document.getElementById('fc-pdf-pinyin')?.checked;
    const showMeaning = document.getElementById('fc-pdf-meaning')?.checked;
    const showHsk = document.getElementById('fc-pdf-hsk-badge')?.checked;
    const showCutLines = document.getElementById('fc-pdf-cut-lines')?.checked;
    const sizes = { small: { w: 60, h: 40 }, medium: { w: 85, h: 55 }, large: { w: 95, h: 65 } };
    const card = sizes[sizeVal];
    const pageW = 210, pageH = 297, mL = 10, mR = 10, mT = 10, mB = 10;
    const usableW = pageW - mL - mR, usableH = pageH - mT - mB;
    const cols = Math.floor(usableW / card.w);
    const rows = Math.floor(usableH / card.h);
    const cardsPerPage = cols * rows;
    const gapX = (usableW - cols * card.w) / Math.max(cols - 1, 1);
    const gapY = (usableH - rows * card.h) / Math.max(rows - 1, 1);
    if (!window.jspdf && !window.jsPDF) {
      CW.showToast('Đang tải jsPDF...');
      const script = document.createElement('script');
      script.src = 'jspdf.umd.min.js';
      script.onload = () => doFcExportPdf();
      script.onerror = () => CW.showToast('Không thể tải jsPDF');
      document.head.appendChild(script);
      return;
    }
    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    const doc = new jsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });

    function textImg(text, fontSize, color, bold, maxW) {
      const cvs = document.createElement('canvas');
      const dpr = 4;
      const lineH = Math.ceil(fontSize * 2.2);
      cvs.width = (maxW || 800) * dpr; cvs.height = lineH * dpr;
      const c = cvs.getContext('2d');
      c.scale(dpr, dpr);
      const fontStr = (bold ? 'bold ' : '') + fontSize + 'px "Segoe UI", Inter, "Noto Sans", "Noto Sans SC", "Microsoft YaHei", Arial, sans-serif';
      c.font = fontStr;
      let t = text;
      if (maxW) { while (c.measureText(t).width > maxW && t.length > 1) t = t.substring(0, t.length - 1); if (t !== text) t += '…'; }
      const tw = Math.ceil(c.measureText(t).width) + 10;
      cvs.width = tw * dpr; cvs.height = lineH * dpr;
      const c2 = cvs.getContext('2d');
      c2.scale(dpr, dpr);
      c2.font = fontStr; c2.fillStyle = color;
      c2.textBaseline = 'alphabetic';
      const baselineY = lineH * 0.7;
      c2.fillText(t, 4, baselineY);
      return { url: cvs.toDataURL('image/png'), w: tw, h: lineH };
    }

    function renderMultiCharPng(hanzi, sizePx) {
      const chars = [...hanzi];
      const totalW = sizePx * chars.length;
      const cvs = document.createElement('canvas');
      cvs.width = totalW; cvs.height = sizePx;
      const c = cvs.getContext('2d');
      for (let i = 0; i < chars.length; i++) {
        const cd = characters[chars[i]];
        if (!cd || !cd.strokes) {
          c.font = `bold ${sizePx * 0.8}px "Noto Sans SC", "Microsoft YaHei", sans-serif`;
          c.fillStyle = '#cc0000'; c.textBaseline = 'middle'; c.textAlign = 'center';
          c.fillText(chars[i], i * sizePx + sizePx / 2, sizePx / 2);
          continue;
        }
        const scale = sizePx / 1024;
        c.save(); c.translate(i * sizePx, 0);
        for (const strokeD of cd.strokes) {
          const parsed = CW.parseSvgPath(strokeD);
          c.beginPath();
          let cx2 = 0, cy2 = 0, lcx2 = 0, lcy2 = 0;
          for (const cmd of parsed) {
            const px = v => v * scale, py = v => (900 - v) * scale;
            switch (cmd.type) {
              case 'M': cx2 = cmd.x; cy2 = cmd.y; c.moveTo(px(cx2), py(cy2)); break;
              case 'L': cx2 = cmd.x; cy2 = cmd.y; c.lineTo(px(cx2), py(cy2)); break;
              case 'Q': lcx2 = cmd.x1; lcy2 = cmd.y1; cx2 = cmd.x; cy2 = cmd.y; c.quadraticCurveTo(px(lcx2), py(lcy2), px(cx2), py(cy2)); break;
              case 'C': lcx2 = cmd.x2; lcy2 = cmd.y2; cx2 = cmd.x; cy2 = cmd.y; c.bezierCurveTo(px(cmd.x1), py(cmd.y1), px(lcx2), py(lcy2), px(cx2), py(cy2)); break;
              case 'S': { const rx = 2 * cx2 - lcx2, ry = 2 * cy2 - lcy2; lcx2 = cmd.x2; lcy2 = cmd.y2; cx2 = cmd.x; cy2 = cmd.y; c.bezierCurveTo(px(rx), py(ry), px(lcx2), py(lcy2), px(cx2), py(cy2)); break; }
              case 'Z': c.closePath(); break;
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
          if (showCutLines) {
            doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.2);
            doc.setLineDashPattern([2, 2], 0); doc.rect(cx, cy, card.w, card.h);
            doc.setLineDashPattern([], 0);
          } else {
            doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3); doc.rect(cx, cy, card.w, card.h, 'S');
          }
          const hanziRenderPx = sizeVal === 'small' ? 120 : (sizeVal === 'medium' ? 160 : 200);
          const charCount = [...w.hanzi].length;
          if (charCount === 1) {
            const charImg = CW.renderCharPng(w.hanzi, hanziRenderPx);
            if (charImg) {
              const imgS = Math.min(card.w * 0.45, card.h * 0.5);
              try { doc.addImage(charImg, 'PNG', cx + (card.w - imgS) / 2, cy + 2, imgS, imgS); } catch (e) { }
            } else {
              const hImg = textImg(w.hanzi, hanziRenderPx / 2, '#cc0000', true, card.w * 4);
              const hH = Math.min(card.h * 0.4, 18); const hW = hH * (hImg.w / hImg.h);
              try { doc.addImage(hImg.url, 'PNG', cx + (card.w - hW) / 2, cy + 3, hW, hH); } catch (e) { }
            }
          } else {
            const mcData = renderMultiCharPng(w.hanzi, hanziRenderPx);
            const imgH = Math.min(card.h * 0.45, 22); const imgW = imgH * charCount;
            const maxW = card.w - 6; const finalW = Math.min(imgW, maxW); const finalH = finalW / charCount;
            try { doc.addImage(mcData.url, 'PNG', cx + (card.w - finalW) / 2, cy + 2, finalW, finalH); } catch (e) { }
          }
          if (showPinyin && w.pinyin) {
            const pFs = sizeVal === 'small' ? 16 : 20;
            const pImg = textImg(w.pinyin, pFs, '#2563eb', false, card.w * 3);
            const pH = 3.5, pW = Math.min(card.w - 4, pH * (pImg.w / pImg.h));
            const pY = cy + card.h * 0.55;
            try { doc.addImage(pImg.url, 'PNG', cx + (card.w - pW) / 2, pY, pW, pH); } catch (e) { }
          }
          if (showMeaning) {
            const vi = (w.vietnamese || '').split(/[;；]/)[0].trim();
            const en = (w.english || '').split(/[;；]/)[0].trim();
            const def = vi || en;
            if (def) {
              const mFs = sizeVal === 'small' ? 12 : 14;
              const mImg = textImg(def, mFs, '#555', false, card.w * 3);
              const mH = 2.8, mW = Math.min(card.w - 4, mH * (mImg.w / mImg.h));
              const mY = cy + card.h * 0.72;
              try { doc.addImage(mImg.url, 'PNG', cx + (card.w - mW) / 2, mY, mW, mH); } catch (e) { }
            }
          }
          if (showHsk && w.hsk) {
            const bImg = textImg('HSK' + w.hsk, 14, '#b45309', true, 200);
            const bH = 2.5, bW = bH * (bImg.w / bImg.h);
            try { doc.addImage(bImg.url, 'PNG', cx + card.w - bW - 1.5, cy + 1, bW, bH); } catch (e) { }
          }
        }
      }
    }
    doc.save('ChineseWriter_Flashcards.pdf');
    const modalEl = document.getElementById('fc-pdf-modal');
    if (modalEl) modalEl.remove();
    CW.showToast(`✅ Đã xuất ${fcDeck.length} flashcard ra PDF!`);
  };
})();
