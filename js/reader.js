// js/reader.js — Reader mode (đọc hiểu văn bản)
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$;
  const $$ = CW.$$;
  const allWords = CW.allWords;
  const characters = CW.characters;
  const radicals = CW.radicals;

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

  window.readerAnalyze = function () {
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
    distEl.innerHTML = Object.entries(hskDist).sort((a, b) => {
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

  window.readerClosePopup = function () {
    const p = document.getElementById('reader-popup');
    if (p) p.classList.add('hidden');
  };

  window.readerShowPopup = function (e, idx) {
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
      if (w.vietnamese) html += `<div class="text-sm mb-1">🇻🇳 ${w.vietnamese.split(/[;；]/).slice(0, 3).join('; ')}</div>`;
      if (w.english) html += `<div class="text-xs text-slate-400 mb-2">🇬🇧 ${w.english.split(/[;；]/).slice(0, 3).join('; ')}</div>`;
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
  document.addEventListener('click', function (e) {
    const popup = $('#reader-popup');
    if (popup && !popup.classList.contains('hidden') && !popup.contains(e.target) && !e.target.closest('#reader-text ruby')) {
      popup.classList.add('hidden');
    }
  });

  window.readerTogglePinyin = function () {
    readerPinyinVisible = !readerPinyinVisible;
    const btn = $('#reader-pinyin-btn');
    btn.textContent = readerPinyinVisible ? '拼 Ẩn Pinyin' : '拼 Hiện Pinyin';
    renderReaderText();
  };

  window.readerSaveUnknown = function () {
    const unknowns = [...new Set(readerTokens.filter(t => t.type === 'char').map(t => t.text))];
    if (!unknowns.length) { CW.showToast('Không có từ chưa biết!'); return; }
    const sets = CW.loadBookmarks();
    let targetSet = sets.find(s => s.name === 'Reader - Từ chưa biết');
    if (!targetSet) {
      targetSet = { id: Date.now().toString(), name: 'Reader - Từ chưa biết', words: [], created: new Date().toISOString() };
      sets.push(targetSet);
    }
    let added = 0;
    for (const ch of unknowns) {
      if (!targetSet.words.includes(ch)) { targetSet.words.push(ch); added++; }
    }
    CW.saveBookmarks(sets);
    CW.showToast(`Đã lưu ${added} từ vào "Reader - Từ chưa biết"`);
  };

  window.readerSpeakAll = function () {
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

  window.readerTranslateVi = function () {
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

  window.readerHideTranslation = function () {
    const transEl = document.getElementById('reader-translation');
    const btn = document.getElementById('reader-translate-btn');
    if (transEl) transEl.classList.add('hidden');
    if (btn) btn.textContent = '🇻🇳 Dịch Việt';
  };

  window.readerReset = function () {
    $('#reader-input-area').classList.remove('hidden');
    $('#reader-results').classList.add('hidden');
    $('#reader-popup').classList.add('hidden');
    readerTokens = [];
    readerOrigText = '';
  };

  window.readerLoadSample = function () {
    const samples = [
      '今天天气很好，我和朋友一起去公园散步。我们看到了很多美丽的花，还有一些小鸟在树上唱歌。公园里有很多人在锻炼身体，有的人在跑步，有的人在打太极拳。',
      '学习中文需要很多时间和耐心。每天我都会花两个小时练习听力和阅读。虽然汉字很难写，但是我觉得很有意思。我的老师说，只要坚持学习，一定能学好中文。',
      '中国有很长的历史和丰富的文化。从古代的四大发明到现代的高速铁路，中国人一直在创新和发展。中国的美食也非常有名，每个地方都有自己的特色菜。',
      '上个周末我去了一家中国餐厅吃饭。我点了宫保鸡丁、麻婆豆腐和一碗米饭。服务员很友好，用中文跟我说话。虽然我听不太懂，但是我很高兴能练习中文。',
      '北京是中国的首都，也是一个非常古老的城市。这里有很多名胜古迹，比如长城、故宫和天坛。每年都有很多游客从世界各地来北京旅游。北京的冬天很冷，但是夏天很热。'
    ];
    $('#reader-input').value = samples[Math.floor(Math.random() * samples.length)];
  };
})();
