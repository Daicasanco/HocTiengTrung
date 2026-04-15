// js/quiz.js — Quiz system (8 quiz types, source, play, answer, result)
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$, $$ = CW.$$;
  const allWords = CW.allWords;
  const characters = CW.characters;
  const radicals = CW.radicals;
  const contextQuizData = CW.contextQuizData;

  let qzSource = '', qzSelectedTypes = ['hanzi_to_viet'];
  let qzQuestions = [], qzIdx = 0, qzScore = 0, qzStreak = 0, qzMaxStreak = 0;
  let qzWrongList = [], qzAnswered = false;
  let qzTimerStart = 0, qzTimerId = null;
  let qzQTimerId = null, qzTimeLimit = 0;
  let qzAutoAdvanceId = null; // auto-advance timer after answering
  let qzSettings = {};
  let qzSourceWords = [];

  // --- Quiz type checkbox toggling ---
  document.addEventListener('click', function (e) {
    const label = e.target.closest('.qz-type-label');
    if (!label) return;
    const cb = label.querySelector('.qz-type-cb');
    if (!cb) return;
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
  window.qzSelectSource = function (src) {
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
      for (let i = 1; i <= 7; i++) html += `<label class="flex items-center gap-1.5 bg-white border-2 rounded-lg px-3 py-2 cursor-pointer hover:border-primary transition-colors"><input type="checkbox" class="qz-hsk-cb accent-primary" value="${i}" ${i <= 2 ? 'checked' : ''}><span class="text-sm font-medium">HSK ${i}</span></label>`;
      html += '</div><div class="flex items-center gap-2"><label class="text-xs text-slate-500">Giới hạn mỗi cấp:</label><input type="number" id="qz-hsk-limit" value="50" min="5" max="500" class="w-20 px-2 py-1 border rounded-lg text-sm"></div></div>';
    } else if (src === 'bookmark') {
      const sets = CW.loadBookmarks();
      if (!sets.length) { html = '<div class="bg-amber-50 rounded-xl p-4 text-sm text-amber-700">Chưa có bộ bookmark nào. Hãy tạo bộ từ ở trang Hồ sơ học.</div>'; }
      else {
        const totalWords = sets.reduce((sum, s) => sum + s.words.length, 0);
        html = '<div class="bg-slate-50 rounded-xl p-4 space-y-2">';
        html += `<div class="flex items-center justify-between mb-3 pb-2 border-b border-slate-200"><label class="flex items-center gap-2 cursor-pointer font-medium text-sm"><input type="checkbox" id="qz-bm-select-all" class="accent-primary w-4 h-4"><span>Chọn tất cả bộ bookmark</span><span class="text-xs text-slate-400">(${sets.length} bộ · ${totalWords} từ)</span></label></div>`;
        html += '<div class="space-y-1.5">';
        for (const s of sets) html += `<label class="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white transition-colors"><input type="checkbox" name="qz-bm-set" value="${s.id}" class="qz-bm-cb accent-primary w-4 h-4"><span class="text-sm">${s.name}</span><span class="text-xs text-slate-400">(${s.words.length} từ)</span></label>`;
        html += '</div></div>';
      }
    } else if (src === 'radical') {
      html = '<div class="bg-slate-50 rounded-xl p-4"><p class="text-xs text-slate-500 mb-2">Chọn bộ thủ:</p><div class="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto">';
      const sortedRads = Object.entries(radicals).sort((a, b) => a[1].strokes - b[1].strokes);
      for (const [rad, info] of sortedRads) html += `<label class="qz-rad-label inline-flex items-center gap-1 bg-white border-2 rounded-lg px-2 py-1 cursor-pointer hover:border-primary transition-colors"><input type="radio" name="qz-rad" value="${rad}" class="accent-primary hidden" onchange="qzHighlightRad(this)"><span class="font-cn text-lg">${rad}</span><span class="text-[10px] text-slate-400">${info.viet || ''}</span></label>`;
      html += '</div></div>';
    } else if (src === 'custom') {
      html = '<div class="bg-slate-50 rounded-xl p-4"><p class="text-xs text-slate-500 mb-2">Nhập từ vựng (phẩy hoặc xuống dòng):</p><textarea id="qz-custom-input" rows="3" class="w-full px-3 py-2 border rounded-lg text-sm font-cn" placeholder="你好, 谢谢, 学习"></textarea></div>';
    }
    optsEl.innerHTML = html;
    setTimeout(qzUpdateStartInfo, 50);
    optsEl.addEventListener('change', () => setTimeout(qzUpdateStartInfo, 50));
  };

  window.qzHighlightRad = function (radio) {
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
      for (const lv of checked) words = words.concat(allWords.filter(w => w.hsk === lv).slice(0, limit));
    } else if (qzSource === 'bookmark') {
      const checked = [...document.querySelectorAll('input[name="qz-bm-set"]:checked')];
      if (!checked.length) return [];
      const sets = CW.loadBookmarks();
      const selectedIds = new Set(checked.map(c => c.value));
      const selectedSets = sets.filter(s => selectedIds.has(s.id));
      const seenHanzi = new Set();
      for (const s of selectedSets) {
        for (const h of s.words) {
          if (!seenHanzi.has(h)) { seenHanzi.add(h); const found = allWords.find(w => w.hanzi === h); if (found) words.push(found); }
        }
      }
    } else if (qzSource === 'radical') {
      const sel = document.querySelector('input[name="qz-rad"]:checked');
      if (!sel) return [];
      words = CW.getWordsByRadical(sel.value);
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
  function qzShuffle(arr) { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function qzPickRandom(arr, n) { return qzShuffle(arr).slice(0, n); }

  // Filter out dictionary notation from Vietnamese definitions for clean quiz display
  function qzCleanViDef(text) {
    return text
      // Remove LT:... patterns (classifier references like LT:個|个[ge4],位[wei4])
      .replace(/LT:[^;；]*/g, '')
      // Remove patterns like 變體|biến thể của X[y], viết tắt của X[y]
      .replace(/biến thể của\s+\S+/gi, '')
      .replace(/viết tắt của\s+\S+/gi, '')
      // Remove standalone pinyin references like [ge4], [wei4], [bei1]
      .replace(/\[[a-zA-Z]+\d\]/g, '')
      // Remove traditional|simplified patterns like 貼吧|贴吧, 個|个, 場|场
      .replace(/[\u4E00-\u9FFF]+\|[\u4E00-\u9FFF]+/g, '')
      // Remove patterns like "họ [Xxx]"
      .replace(/họ\s*\[[^\]]*\]/gi, '')
      // Remove (hình thức kết hợp) prefix
      .replace(/\(hình thức kết hợp\)\s*/gi, '')
      // Clean up leftover artifacts
      .replace(/\(\s*\)/g, '') // empty parentheses
      .replace(/\s{2,}/g, ' ') // multiple spaces
      .trim();
  }

  function qzGetViDef(w, maxDefs) {
    const max = maxDefs || 6;
    const raw = (w.vietnamese || w.english || '').split(/[;；]/).map(s => qzCleanViDef(s)).filter(Boolean);
    const meaningful = raw.filter(d => 
      !/^(biến thể|dạng khác|xem |như |tương tự|giống với)/i.test(d) &&
      d.length > 0
    );
    const defs = meaningful.length ? meaningful : raw;
    if (!defs.length) return w.hanzi;
    return [...new Set(defs)].slice(0, max).join('; ');
  }
  function qzGetViDefShort(w) { return qzGetViDef(w, 1); }

  // --- Question generators ---
  function qzGenHanziToViet(word, pool) {
    const correct = qzGetViDef(word);
    const sameHsk = pool.filter(w => w.hanzi !== word.hanzi && qzGetViDef(w) !== correct);
    const distractors = qzPickRandom(sameHsk.length >= 3 ? sameHsk : pool.filter(w => w.hanzi !== word.hanzi), 3).map(w => qzGetViDef(w));
    return { type: 'hanzi_to_viet', typeLabel: 'Hán → Nghĩa Việt', questionHtml: `<div class="font-cn text-5xl font-bold text-hanzi">${word.hanzi}</div>`, hint: word.pinyin || '', correctAnswer: correct, options: qzShuffle([correct, ...distractors]), word: word };
  }

  function qzGenVietToHanzi(word, pool) {
    const questionText = qzGetViDef(word);
    const correct = word.hanzi;
    const correctLen = [...correct].length;
    const sameLenPool = pool.filter(w => w.hanzi !== word.hanzi && [...w.hanzi].length === correctLen);
    const fallbackPool = pool.filter(w => w.hanzi !== word.hanzi);
    const distPool = sameLenPool.length >= 3 ? sameLenPool : fallbackPool;
    const distractors = qzPickRandom(distPool, 3).map(w => w.hanzi);
    return { type: 'viet_to_hanzi', typeLabel: 'Nghĩa Việt → Hán', questionHtml: `<div class="text-2xl font-bold text-slate-700">${questionText}</div>`, hint: word.pinyin || '', correctAnswer: correct, options: qzShuffle([correct, ...distractors]), word: word };
  }

  function qzGenListenToHanzi(word, pool) {
    const correct = word.hanzi;
    const correctLen = [...correct].length;
    const sameLenPool = pool.filter(w => w.hanzi !== word.hanzi && [...w.hanzi].length === correctLen);
    const fallbackPool = pool.filter(w => w.hanzi !== word.hanzi);
    const distPool = sameLenPool.length >= 3 ? sameLenPool : fallbackPool;
    const distractors = qzPickRandom(distPool, 3).map(w => w.hanzi);
    return { type: 'listen_to_hanzi', typeLabel: 'Nghe → Chọn Hán', questionHtml: `<button onclick="qzPlayAudio()" class="text-5xl hover:scale-110 transition-transform">🔊</button><div class="text-sm text-slate-400 mt-2">Bấm để nghe</div>`, hint: '', audioText: word.hanzi, correctAnswer: correct, options: qzShuffle([correct, ...distractors]), word: word };
  }

  function qzGenListenToViet(word, pool) {
    const correct = qzGetViDef(word);
    const sameHsk = pool.filter(w => w.hanzi !== word.hanzi && qzGetViDef(w) !== correct);
    const distractors = qzPickRandom(sameHsk.length >= 3 ? sameHsk : pool.filter(w => w.hanzi !== word.hanzi), 3).map(w => qzGetViDef(w));
    return { type: 'listen_to_viet', typeLabel: 'Nghe → Nghĩa Việt', questionHtml: `<button onclick="qzPlayAudio()" class="text-5xl hover:scale-110 transition-transform">🔊</button><div class="text-sm text-slate-400 mt-2">Nghe phát âm, chọn nghĩa Việt đúng</div>`, hint: '', audioText: word.hanzi, correctAnswer: correct, options: qzShuffle([correct, ...distractors]), word: word };
  }

  function qzGenHanziToPinyin(word, pool) {
    if (!word.pinyin) return null;
    const correct = word.pinyin;
    const sameHsk = pool.filter(w => w.hanzi !== word.hanzi && w.pinyin && w.pinyin !== correct);
    const distractors = qzPickRandom(sameHsk.length >= 3 ? sameHsk : pool.filter(w => w.hanzi !== word.hanzi && w.pinyin), 3).map(w => w.pinyin);
    return { type: 'hanzi_to_pinyin', typeLabel: 'Hán → Pinyin', questionHtml: `<div class="font-cn text-5xl font-bold text-hanzi">${word.hanzi}</div>`, hint: qzGetViDef(word), correctAnswer: correct, options: qzShuffle([correct, ...distractors]), word: word };
  }

  function qzGenGuessRadical(word, pool) {
    const char = [...word.hanzi][0];
    const cd = characters[char];
    if (!cd || !cd.radical) return null;
    const correctRad = cd.radical;
    const radInfo = radicals[correctRad];
    if (!radInfo) return null;
    const allRads = Object.entries(radicals).filter(([r]) => r !== correctRad);
    const similarRads = allRads.filter(([, info]) => Math.abs((info.strokes || 0) - (radInfo.strokes || 0)) <= 3);
    const distPool = similarRads.length >= 3 ? similarRads : allRads;
    const distractors = qzPickRandom(distPool, 3).map(([r]) => r);
    const correctLabel = `${correctRad} ${radInfo.viet || ''}`.trim();
    return { type: 'guess_radical', typeLabel: 'Đoán Bộ thủ', questionHtml: `<div class="font-cn text-5xl font-bold text-hanzi">${char}</div><div class="text-sm text-slate-500 mt-2">Bộ thủ của chữ này là gì?</div>`, hint: '', correctAnswer: correctRad, correctLabel: correctLabel, optionLabels: Object.fromEntries([[correctRad, correctLabel], ...distractors.map(r => [r, `${r} ${(radicals[r] || {}).viet || ''}`.trim()])]), options: qzShuffle([correctRad, ...distractors]), word: word };
  }

  function qzGenFillBlank(word, pool) {
    const chars = [...word.hanzi];
    if (chars.length < 2) return null;
    const blankIdx = Math.floor(Math.random() * chars.length);
    const correctChar = chars[blankIdx];
    const display = chars.map((c, i) => i === blankIdx ? '<span class="text-primary font-bold">___</span>' : c).join('');
    const otherChars = pool.filter(w => w.hanzi !== word.hanzi).flatMap(w => [...w.hanzi]).filter(c => c !== correctChar);
    const uniqueOther = [...new Set(otherChars)];
    const distractors = qzPickRandom(uniqueOther.length >= 3 ? uniqueOther : [...new Set(allWords.flatMap(w => [...w.hanzi]).filter(c => c !== correctChar))], 3);
    return { type: 'fill_blank', typeLabel: 'Điền chữ thiếu', questionHtml: `<div class="font-cn text-4xl font-bold text-hanzi">${display}</div>`, hint: `${word.pinyin || ''} — ${qzGetViDef(word)}`, correctAnswer: correctChar, options: qzShuffle([correctChar, ...distractors]), word: word };
  }

  function qzGenContextFill(word, pool) {
    if (!contextQuizData.length) return null;
    const items = contextQuizData.filter(q => q.word === word.hanzi);
    if (!items.length) return null;
    const item = items[Math.floor(Math.random() * items.length)];
    const correct = item.answer || word.hanzi;
    let distractors = item.distractors || [];
    if (distractors.length < 3) {
      const extra = pool.filter(w => w.hanzi !== word.hanzi && !distractors.includes(w.hanzi));
      const picks = qzPickRandom(extra, 3 - distractors.length).map(w => w.hanzi);
      distractors = [...distractors, ...picks];
    }
    distractors = distractors.slice(0, 3);
    let qHtml = `<div class="font-cn text-2xl font-bold text-slate-800 leading-relaxed mb-3">${item.sentence || ''}</div>`;
    if (item.pinyin) qHtml += `<div class="text-sm text-primary mb-1">${item.pinyin}</div>`;
    if (item.viet) qHtml += `<div class="text-sm text-slate-500">${item.viet}</div>`;
    return { type: 'context_fill', typeLabel: '📖 Điền từ vào câu', questionHtml: qHtml, hint: '', correctAnswer: correct, options: qzShuffle([correct, ...distractors]), word: word, explanation: item.explanation || '' };
  }

  const qzGenerators = {
    hanzi_to_viet: qzGenHanziToViet, viet_to_hanzi: qzGenVietToHanzi,
    listen_to_hanzi: qzGenListenToHanzi, listen_to_viet: qzGenListenToViet,
    hanzi_to_pinyin: qzGenHanziToPinyin, guess_radical: qzGenGuessRadical,
    fill_blank: qzGenFillBlank, context_fill: qzGenContextFill
  };

  function qzGenerateQuestions(words, types, count) {
    const questions = [];
    const shuffledWords = qzShuffle(words);
    const usedCombos = new Set();
    let attempts = 0, maxAttempts = count * 5;
    let wordIdx = 0, round = 0;
    while (questions.length < count && attempts < maxAttempts) {
      const word = shuffledWords[wordIdx % shuffledWords.length];
      const shuffledTypes = qzShuffle(types);
      let generated = false;
      for (const type of shuffledTypes) {
        const comboKey = word.hanzi + '|' + type;
        if (round < types.length && usedCombos.has(comboKey)) continue;
        const gen = qzGenerators[type]; if (!gen) continue;
        const q = gen(word, words); if (!q) continue;
        const uniqueOpts = [...new Set(q.options)]; if (uniqueOpts.length < 4) continue;
        q.options = uniqueOpts.slice(0, 4); q.userAnswer = null; q.isCorrect = null; q.timeSpent = 0;
        questions.push(q); usedCombos.add(comboKey); generated = true; break;
      }
      if (!generated) {
        const type = types[Math.floor(Math.random() * types.length)];
        const gen = qzGenerators[type];
        if (gen) {
          const q = gen(word, words);
          if (q) { const uo = [...new Set(q.options)]; if (uo.length >= 4) { q.options = uo.slice(0, 4); q.userAnswer = null; q.isCorrect = null; q.timeSpent = 0; questions.push(q); } }
        }
      }
      wordIdx++; if (wordIdx % shuffledWords.length === 0) round++; attempts++;
    }
    return questions;
  }

  // --- Start Quiz ---
  window.qzStart = function () {
    qzUpdateSelectedTypes();
    const words = qzGetWordsFromSource();
    if (words.length < 4) { CW.showToast('Cần ít nhất 4 từ'); return; }
    if (!qzSelectedTypes.length) { CW.showToast('Chọn ít nhất 1 dạng quiz'); return; }
    const count = parseInt($('#qz-count')?.value) || 20;
    qzTimeLimit = parseInt($('#qz-time-limit')?.value) || 0;
    qzSourceWords = words;
    qzQuestions = qzGenerateQuestions(words, qzSelectedTypes, count);
    if (!qzQuestions.length) { CW.showToast('Không tạo được câu hỏi. Thử đổi dạng quiz.'); return; }
    qzIdx = 0; qzScore = 0; qzStreak = 0; qzMaxStreak = 0; qzWrongList = []; qzAnswered = false;
    qzSettings = { count, types: [...qzSelectedTypes], source: qzSource, timeLimit: qzTimeLimit };
    $('#qz-setup').classList.add('hidden'); $('#qz-play').classList.remove('hidden'); $('#qz-result').classList.add('hidden');
    $('#qz-total').textContent = qzQuestions.length;
    qzTimerStart = Date.now(); if (qzTimerId) clearInterval(qzTimerId); qzTimerId = setInterval(qzUpdateTimer, 1000);
    qzRenderQuestion();
  };

  function qzUpdateTimer() {
    const elapsed = Math.floor((Date.now() - qzTimerStart) / 1000);
    const el = $('#qz-timer');
    if (el) el.textContent = Math.floor(elapsed / 60) + ':' + (elapsed % 60 < 10 ? '0' : '') + (elapsed % 60);
  }

  function qzRenderQuestion() {
    const q = qzQuestions[qzIdx]; if (!q) return;
    qzAnswered = false;
    // Clear any pending auto-advance timer
    if (qzAutoAdvanceId) { clearTimeout(qzAutoAdvanceId); qzAutoAdvanceId = null; }
    const showPinyin = $('#qz-show-pinyin')?.checked !== false;
    const vietFirst = $('#qz-viet-first')?.checked === true;
    $('#qz-cur').textContent = qzIdx + 1;
    $('#qz-progress-bar').style.width = Math.round(((qzIdx) / qzQuestions.length) * 100) + '%';
    if (vietFirst && q.type === 'hanzi_to_viet') {
      const questionText = qzGetViDef(q.word);
      const correct = q.word.hanzi;
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
    const streakBadge = $('#qz-streak-badge');
    if (qzStreak >= 2) { streakBadge.classList.remove('hidden'); streakBadge.textContent = '🔥 ' + qzStreak; }
    else streakBadge.classList.add('hidden');
    const optsEl = $('#qz-options');
    let optsHtml = '';
    for (let i = 0; i < q.options.length; i++) {
      const opt = q.options[i];
      const displayText = (q.optionLabels && q.optionLabels[opt]) ? q.optionLabels[opt] : opt;
      const isCn = q.type === 'viet_to_hanzi' || q.type === 'listen_to_hanzi' || q.type === 'guess_radical' || q.type === 'fill_blank' || q.type === 'context_fill';
      const fontClass = isCn ? 'font-cn text-xl' : 'text-sm';
      optsHtml += `<button onclick="qzAnswer(${i})" class="qz-opt-btn w-full text-left px-5 py-4 border-2 rounded-xl hover:border-primary hover:bg-blue-50 transition-all ${fontClass}" data-idx="${i}"><span class="inline-flex items-center justify-center w-6 h-6 rounded-md bg-slate-100 text-slate-500 text-xs font-bold mr-3 flex-shrink-0">${i + 1}</span>${displayText}</button>`;
    }
    optsEl.innerHTML = optsHtml;
    if ((q.type === 'listen_to_hanzi' || q.type === 'listen_to_viet') && q.audioText) setTimeout(() => CW.speakText(q.audioText), 300);
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
        if (remaining <= 0) { clearInterval(qzQTimerId); qzQTimerId = null; qzAnswer(-1); }
      }, 100);
    } else {
      $('#qz-q-timer-bar').classList.add('hidden');
      if (qzQTimerId) { clearInterval(qzQTimerId); qzQTimerId = null; }
    }
  }

  window.qzPlayAudio = function () {
    const q = qzQuestions[qzIdx];
    if (q && q.audioText) CW.speakText(q.audioText);
  };

  // --- Keyboard shortcuts ---
  document.addEventListener('keydown', function (e) {
    const playEl = $('#qz-play');
    if (!playEl || playEl.classList.contains('hidden')) return;
    const resultEl = $('#qz-result');
    if (resultEl && !resultEl.classList.contains('hidden')) return;
    if ((e.key === 'ArrowRight' || e.key === 'Enter' || e.key === ' ') && qzAnswered) { e.preventDefault(); qzNext(); return; }
    if (!qzAnswered && e.key >= '1' && e.key <= '4') { e.preventDefault(); const idx = parseInt(e.key) - 1; const q = qzQuestions[qzIdx]; if (q && idx < q.options.length) qzAnswer(idx); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); qzPlayAudio(); return; }
  });

  // --- Answer handling ---
  window.qzAnswer = function (optIdx) {
    if (qzAnswered) return;
    qzAnswered = true;
    if (qzQTimerId) { clearInterval(qzQTimerId); qzQTimerId = null; }
    const q = qzQuestions[qzIdx];
    const showAnswer = $('#qz-show-answer')?.checked;
    const isTimeout = optIdx === -1;
    const userAnswer = isTimeout ? null : q.options[optIdx];
    const isCorrect = !isTimeout && userAnswer === q.correctAnswer;
    q.userAnswer = userAnswer; q.isCorrect = isCorrect;
    if (q.word && q.word.hanzi && CW.updateSrs) CW.updateSrs(q.word.hanzi, isCorrect);
    if (isCorrect) { qzScore++; qzStreak++; if (qzStreak > qzMaxStreak) qzMaxStreak = qzStreak; }
    else { qzStreak = 0; qzWrongList.push(q); }
    const streakBadge = $('#qz-streak-badge');
    if (qzStreak >= 2) { streakBadge.classList.remove('hidden'); streakBadge.textContent = '🔥 ' + qzStreak; }
    else streakBadge.classList.add('hidden');
    const btns = document.querySelectorAll('.qz-opt-btn');
    btns.forEach((btn, i) => {
      btn.disabled = true; btn.classList.add('cursor-not-allowed');
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
    const fb = $('#qz-feedback'), fbc = $('#qz-feedback-content');
    fb.classList.remove('hidden');
    if (isCorrect) {
      fb.classList.remove('border-red-200', 'bg-red-50'); fb.classList.add('border-green-200', 'bg-green-50');
      const msgs = ['🎉 Chính xác!', '👏 Xuất sắc!', '✨ Tuyệt vời!', '💪 Giỏi lắm!', '🏆 Đúng rồi!'];
      let correctHtml = `<div class="font-bold text-green-700">${msgs[Math.floor(Math.random() * msgs.length)]}</div>`;
      if (q.explanation) correctHtml += `<div class="mt-2 text-xs text-blue-700 bg-blue-50 rounded-lg p-2">💡 ${q.explanation}</div>`;
      fbc.innerHTML = correctHtml;
    } else {
      fb.classList.remove('border-green-200', 'bg-green-50'); fb.classList.add('border-red-200', 'bg-red-50');
      let wrongHtml = isTimeout ? '<div class="font-bold text-red-700">⏰ Hết giờ!</div>' : '<div class="font-bold text-red-700">❌ Sai rồi!</div>';
      if (showAnswer) {
        const correctDisplay = (q.optionLabels && q.optionLabels[q.correctAnswer]) ? q.optionLabels[q.correctAnswer] : q.correctAnswer;
        wrongHtml += `<div class="mt-1 text-slate-600">Đáp án đúng: <strong class="text-green-700">${correctDisplay}</strong></div>`;
        wrongHtml += `<div class="mt-1 text-slate-500">${q.word.hanzi} · ${q.word.pinyin || ''} · ${qzGetViDef(q.word)}</div>`;
        if (q.explanation) wrongHtml += `<div class="mt-2 text-xs text-blue-700 bg-blue-50 rounded-lg p-2">💡 ${q.explanation}</div>`;
      }
      fbc.innerHTML = wrongHtml;
    }
    $('#qz-next-btn').classList.remove('hidden');
    if (q.word && q.word.hanzi) setTimeout(() => CW.speakText(q.word.hanzi), 200);
    if (qzIdx >= qzQuestions.length - 1) $('#qz-next-btn').textContent = '📊 Xem kết quả';
    else $('#qz-next-btn').textContent = 'Câu tiếp theo →';
    // Auto-advance to next question after 2.5 seconds
    if (qzAutoAdvanceId) { clearTimeout(qzAutoAdvanceId); qzAutoAdvanceId = null; }
    qzAutoAdvanceId = setTimeout(() => { qzAutoAdvanceId = null; qzNext(); }, 2500);
  };

  window.qzNext = function () {
    qzIdx++;
    if (qzIdx >= qzQuestions.length) qzShowResult();
    else { const fill = $('#qz-q-timer-fill'); if (fill) { fill.classList.remove('bg-red-500'); fill.classList.add('bg-amber-400'); } qzRenderQuestion(); }
  };

  window.qzStop = function () { if (!confirm('Dừng quiz?')) return; qzShowResult(); };

  function qzShowResult() {
    if (qzTimerId) { clearInterval(qzTimerId); qzTimerId = null; }
    if (qzQTimerId) { clearInterval(qzQTimerId); qzQTimerId = null; }
    if (qzAutoAdvanceId) { clearTimeout(qzAutoAdvanceId); qzAutoAdvanceId = null; }
    const elapsed = Math.floor((Date.now() - qzTimerStart) / 1000);
    const m = Math.floor(elapsed / 60), s = elapsed % 60;
    const total = qzQuestions.length;
    const pct = total > 0 ? Math.round((qzScore / total) * 100) : 0;
    $('#qz-play').classList.add('hidden'); $('#qz-result').classList.remove('hidden');
    let emoji = '🎉', badgeText = 'Xuất sắc!', badgeClass = 'bg-green-100 text-green-700';
    if (pct >= 90) { emoji = '🏆'; } else if (pct >= 70) { emoji = '😊'; badgeText = 'Tốt lắm!'; badgeClass = 'bg-blue-100 text-blue-700'; }
    else if (pct >= 50) { emoji = '😐'; badgeText = 'Cần cải thiện'; badgeClass = 'bg-amber-100 text-amber-700'; }
    else { emoji = '😢'; badgeText = 'Cố gắng thêm!'; badgeClass = 'bg-red-100 text-red-700'; }
    $('#qz-result-emoji').textContent = emoji;
    const badge = $('#qz-result-badge');
    badge.textContent = badgeText; badge.className = `inline-flex items-center rounded-full px-4 py-1 text-sm font-bold mb-4 ${badgeClass}`;
    $('#qz-result-stats').innerHTML = `
      <div class="flex justify-between"><span class="text-slate-500">✅ Đúng</span><strong class="text-green-600">${qzScore}/${total} (${pct}%)</strong></div>
      <div class="flex justify-between"><span class="text-slate-500">❌ Sai</span><strong class="text-red-500">${qzWrongList.length}</strong></div>
      <div class="flex justify-between"><span class="text-slate-500">🔥 Chuỗi dài nhất</span><strong class="text-amber-600">${qzMaxStreak}</strong></div>
      <div class="flex justify-between"><span class="text-slate-500">⏱️ Thời gian</span><strong>${m}p ${s}s</strong></div>`;
    $('#qz-progress-bar').style.width = '100%';
    if (qzWrongList.length > 0) {
      $('#qz-result-wrong').classList.remove('hidden'); $('#qz-replay-wrong-btn').classList.remove('hidden');
      let wHtml = '';
      for (const q of qzWrongList) {
        const correctDisplay = (q.optionLabels && q.optionLabels[q.correctAnswer]) ? q.optionLabels[q.correctAnswer] : q.correctAnswer;
        const userDisplay = q.userAnswer ? ((q.optionLabels && q.optionLabels[q.userAnswer]) ? q.optionLabels[q.userAnswer] : q.userAnswer) : '(hết giờ)';
        wHtml += `<div class="flex items-start gap-2 bg-white rounded-lg p-2 border"><span class="font-cn text-lg text-hanzi">${q.word.hanzi}</span><div class="flex-1 min-w-0"><div class="text-xs text-slate-500">${q.typeLabel}</div><div class="text-xs"><span class="text-red-500 line-through">${userDisplay}</span> → <span class="text-green-600 font-bold">${correctDisplay}</span></div></div></div>`;
      }
      $('#qz-wrong-list').innerHTML = wHtml;
    } else { $('#qz-result-wrong').classList.add('hidden'); $('#qz-replay-wrong-btn').classList.add('hidden'); }
    const sessions = JSON.parse(localStorage.getItem('cw_quiz_sessions') || '[]');
    sessions.push({ date: new Date().toISOString(), source: qzSource, total, correct: qzScore, wrong: qzWrongList.length, maxStreak: qzMaxStreak, time: elapsed, pct });
    if (sessions.length > 50) sessions.splice(0, sessions.length - 50);
    localStorage.setItem('cw_quiz_sessions', JSON.stringify(sessions));
    if (CW.srsLoadHistory) {
      const srsHist = CW.srsLoadHistory();
      srsHist.push({ date: new Date().toISOString(), total, correct: qzScore, wrong: qzWrongList.length });
      if (srsHist.length > 100) srsHist.splice(0, srsHist.length - 100);
      CW.srsSaveHistory(srsHist);
      if (CW.srsUpdateStreak) CW.srsUpdateStreak();
    }
  }

  window.qzReplayWrong = function () {
    if (!qzWrongList.length) return;
    const wrongWords = qzWrongList.map(q => q.word);
    qzSourceWords = wrongWords;
    qzQuestions = qzGenerateQuestions(wrongWords, qzSelectedTypes, wrongWords.length);
    if (!qzQuestions.length) { CW.showToast('Không tạo được câu hỏi từ bộ sai'); return; }
    qzIdx = 0; qzScore = 0; qzStreak = 0; qzMaxStreak = 0; qzWrongList = []; qzAnswered = false;
    $('#qz-result').classList.add('hidden'); $('#qz-play').classList.remove('hidden');
    $('#qz-total').textContent = qzQuestions.length;
    qzTimerStart = Date.now(); if (qzTimerId) clearInterval(qzTimerId); qzTimerId = setInterval(qzUpdateTimer, 1000);
    qzRenderQuestion();
  };

  window.qzReplayAll = function () {
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

  window.qzBackToSetup = function () {
    $('#qz-result').classList.add('hidden'); $('#qz-play').classList.add('hidden'); $('#qz-setup').classList.remove('hidden');
  };
})();
