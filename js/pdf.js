// js/pdf.js — PDF export (tập viết + flashcard PDF)
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$, $$ = CW.$$;
  const allWords = CW.allWords;
  const characters = CW.characters;

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
        if (found) result.push(found);
        else result.push({ hanzi: tok, pinyin: '', vietnamese: '', hsk: 0 });
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
    if (!words.length) { $('#pdf-preview-info').innerHTML = '<span class="text-red-500">⚠️ Chưa chọn từ nào.</span>'; return; }
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

  // Expose render helpers on CW for flashcard PDF
  CW.renderCharPng = function (char, sizePx) {
    const cd = characters[char];
    if (!cd || !cd.strokes) return null;
    const cvs = document.createElement('canvas');
    cvs.width = sizePx; cvs.height = sizePx;
    const c = cvs.getContext('2d');
    const scale = sizePx / 1024;
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
      c.fillStyle = '#333'; c.fill();
    }
    return cvs.toDataURL('image/png');
  };

  function renderGuidePng(char, sizePx, alpha) {
    const cd = characters[char];
    if (!cd || !cd.strokes) return null;
    const cvs = document.createElement('canvas');
    cvs.width = sizePx; cvs.height = sizePx;
    const c = cvs.getContext('2d');
    const scale = sizePx / 1024;
    c.globalAlpha = alpha;
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
        const parsed = CW.parseSvgPath(strokes[s]);
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
        c.fillStyle = s === step ? '#cc0000' : '#333'; c.fill();
      }
      c.restore();
    }
    return { img: cvs.toDataURL('image/png'), count: n };
  }

  window.generatePdf = async function () {
    await CW.ensureCharacters();
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
        try { doc.addImage(title.url, 'PNG', mL, 6, tW, tH); } catch (e) { }
        const pg = textToPng('Trang ' + pageNum, 24, '#666666', false);
        const pgH = 3, pgW = pgH * (pg.w / pg.h);
        try { doc.addImage(pg.url, 'PNG', pageW - mR - pgW, 6.5, pgW, pgH); } catch (e) { }
        doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3);
        doc.line(mL, 10, pageW - mR, 10);
      }
      drawHeader();

      function newPage() { doc.addPage(); pageNum++; curY = mT; drawHeader(); }

      function drawGridCell(x, y, size) {
        doc.setDrawColor(200, 190, 170); doc.setLineWidth(0.25); doc.rect(x, y, size, size);
        doc.setDrawColor(215, 205, 185); doc.setLineWidth(0.15);
        doc.setLineDashPattern([1.5, 1.5], 0);
        doc.line(x, y + size / 2, x + size, y + size / 2);
        doc.line(x + size / 2, y, x + size / 2, y + size);
        doc.line(x, y, x + size, y + size);
        doc.line(x + size, y, x, y + size);
        doc.setLineDashPattern([], 0);
      }

      const MAIN_PX = 80, GUIDE_PX = 48, STRIP_PX = 60;
      const charImageCache = {};
      for (const item of charList) {
        const mainImg = CW.renderCharPng(item.char, MAIN_PX);
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
        doc.setDrawColor(180, 180, 180); doc.setLineWidth(0.3); doc.rect(mL, y1, gridW, previewH);
        if (cache.main) { try { doc.addImage(cache.main, 'PNG', mL + 1, y1 + 1, cellSize - 2, cellSize - 2); } catch (e) { } }
        const stepSize = Math.min(cellSize * 0.55, 10);
        if (cache.strip) {
          const n = cache.strip.count, stripW = n * stepSize, maxW = gridW - cellSize - 4;
          try { doc.addImage(cache.strip.img, 'PNG', mL + cellSize + 2, y1 + 1, Math.min(stripW, maxW), stepSize); } catch (e) { }
        }
        if (showPinyin && item.pinyin) {
          const pCvs = document.createElement('canvas');
          pCvs.width = 800; pCvs.height = 50;
          const pc = pCvs.getContext('2d');
          pc.font = 'bold 36px Inter, Segoe UI, Arial, sans-serif';
          const pTw = pc.measureText('/' + item.pinyin + '/').width;
          pCvs.width = Math.ceil(pTw) + 12; pCvs.height = 50;
          const pc2 = pCvs.getContext('2d');
          pc2.font = 'bold 36px Inter, Segoe UI, Arial, sans-serif';
          pc2.fillStyle = '#444444'; pc2.textBaseline = 'middle';
          pc2.fillText('/' + item.pinyin + '/', 4, 26);
          const pH = 4.2, pW = pH * (pCvs.width / pCvs.height);
          try { doc.addImage(pCvs.toDataURL('image/png'), 'PNG', mL + 1, y1 + cellSize - 0.8, pW, pH); } catch (e) { }
        }
        if (showMeaning) {
          const w = wordMap[item.char];
          if (w) {
            const viDef = (w.vietnamese || '').split(/[;；]/)[0].trim();
            const enDef = (w.english || '').split(/[;；]/)[0].trim();
            let mt = ''; if (viDef && enDef) mt = viDef + ' | ' + enDef; else mt = viDef || enDef;
            if (mt) {
              if (mt.length > 55) mt = mt.substring(0, 52) + '...';
              const mCvs = document.createElement('canvas');
              mCvs.width = 1200; mCvs.height = 40;
              const mc = mCvs.getContext('2d');
              mc.font = '28px Inter, Segoe UI, Arial, sans-serif';
              const mTw = mc.measureText(mt).width;
              mCvs.width = Math.ceil(mTw) + 12; mCvs.height = 40;
              const mc2 = mCvs.getContext('2d');
              mc2.font = '28px Inter, Segoe UI, Arial, sans-serif';
              mc2.fillStyle = '#555555'; mc2.textBaseline = 'middle'; mc2.fillText(mt, 4, 21);
              const mH = 3.5, maxMW = gridW - cellSize - 4, mW = Math.min(maxMW, mH * (mCvs.width / mCvs.height));
              try { doc.addImage(mCvs.toDataURL('image/png'), 'PNG', mL + cellSize + 2, y1 + stepSize + 3, mW, mH); } catch (e) { }
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
              try { doc.addImage(cache.guide[guideIdx], 'PNG', cx + 0.5, rowY + 0.5, cellSize - 1, cellSize - 1); } catch (e) { }
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
})();
