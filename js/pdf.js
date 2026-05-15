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
    // Tăng độ phân giải gấp 4 lần để chữ sắc nét khi in
    const hiResPx = sizePx * 4;
    const cvs = document.createElement('canvas');
    cvs.width = hiResPx; cvs.height = hiResPx;
    const c = cvs.getContext('2d', { alpha: true, willReadFrequently: false });
    // Tắt image smoothing để giữ nét sắc
    c.imageSmoothingEnabled = false;
    const scale = hiResPx / 1024;
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
      // Nét đậm hơn cho chữ rõ ràng
      c.fillStyle = '#000000'; 
      c.fill();
      // Thêm stroke để nét chữ đậm và sắc hơn
      c.strokeStyle = '#000000';
      c.lineWidth = scale * 2;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.stroke();
    }
    return cvs.toDataURL('image/png');
  };

  // ============================================================
  // PRODUCTION-GRADE DOTTED RENDERING ENGINE
  // ============================================================
  
  // Flatten Bezier curves thành polyline với adaptive subdivision
  function flattenQuadratic(x0, y0, x1, y1, x2, y2, tolerance, result) {
    const midX = (x0 + 2*x1 + x2) / 4;
    const midY = (y0 + 2*y1 + y2) / 4;
    const dx = (x0 + x2) / 2 - midX;
    const dy = (y0 + y2) / 2 - midY;
    
    if (dx*dx + dy*dy < tolerance*tolerance) {
      result.push({ x: x2, y: y2 });
      return;
    }
    
    const mx0 = (x0 + x1) / 2, my0 = (y0 + y1) / 2;
    const mx1 = (x1 + x2) / 2, my1 = (y1 + y2) / 2;
    flattenQuadratic(x0, y0, mx0, my0, midX, midY, tolerance, result);
    flattenQuadratic(midX, midY, mx1, my1, x2, y2, tolerance, result);
  }
  
  function flattenCubic(x0, y0, x1, y1, x2, y2, x3, y3, tolerance, result) {
    const dx = x3 - x0, dy = y3 - y0;
    const d2 = Math.abs((x1 - x3) * dy - (y1 - y3) * dx);
    const d3 = Math.abs((x2 - x3) * dy - (y2 - y3) * dx);
    
    if ((d2 + d3) * (d2 + d3) < tolerance * (dx*dx + dy*dy)) {
      result.push({ x: x3, y: y3 });
      return;
    }
    
    const x01 = (x0 + x1) / 2, y01 = (y0 + y1) / 2;
    const x12 = (x1 + x2) / 2, y12 = (y1 + y2) / 2;
    const x23 = (x2 + x3) / 2, y23 = (y2 + y3) / 2;
    const x012 = (x01 + x12) / 2, y012 = (y01 + y12) / 2;
    const x123 = (x12 + x23) / 2, y123 = (y12 + y23) / 2;
    const x0123 = (x012 + x123) / 2, y0123 = (y012 + y123) / 2;
    
    flattenCubic(x0, y0, x01, y01, x012, y012, x0123, y0123, tolerance, result);
    flattenCubic(x0123, y0123, x123, y123, x23, y23, x3, y3, tolerance, result);
  }
  
  function flattenSvgPath(commands, tolerance = 0.5) {
    const points = [];
    let cx = 0, cy = 0, lastCx = 0, lastCy = 0;
    
    for (const cmd of commands) {
      switch (cmd.type) {
        case 'M':
          cx = cmd.x; cy = cmd.y;
          points.push({ x: cx, y: cy });
          break;
        
        case 'L':
          cx = cmd.x; cy = cmd.y;
          points.push({ x: cx, y: cy });
          break;
        
        case 'Q':
          flattenQuadratic(cx, cy, cmd.x1, cmd.y1, cmd.x, cmd.y, tolerance, points);
          lastCx = cmd.x1; lastCy = cmd.y1;
          cx = cmd.x; cy = cmd.y;
          break;
        
        case 'C':
          flattenCubic(cx, cy, cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y, tolerance, points);
          lastCx = cmd.x2; lastCy = cmd.y2;
          cx = cmd.x; cy = cmd.y;
          break;
        
        case 'S':
          const rx = 2 * cx - lastCx, ry = 2 * cy - lastCy;
          flattenCubic(cx, cy, rx, ry, cmd.x2, cmd.y2, cmd.x, cmd.y, tolerance, points);
          lastCx = cmd.x2; lastCy = cmd.y2;
          cx = cmd.x; cy = cmd.y;
          break;
        
        case 'T':
          const rtx = 2 * cx - lastCx, rty = 2 * cy - lastCy;
          flattenQuadratic(cx, cy, rtx, rty, cmd.x, cmd.y, tolerance, points);
          lastCx = rtx; lastCy = rty;
          cx = cmd.x; cy = cmd.y;
          break;
        
        case 'Z':
          break;
      }
    }
    
    return points;
  }
  
  // Sample points đều theo arc length
  function samplePathByArcLength(points, spacing) {
    if (points.length < 2) return points;
    
    const samples = [points[0]];
    let accumulated = 0;
    let nextSample = spacing;
    
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const segLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      
      while (accumulated + segLen >= nextSample) {
        const remain = nextSample - accumulated;
        const t = remain / segLen;
        
        samples.push({
          x: p0.x + (p1.x - p0.x) * t,
          y: p0.y + (p1.y - p0.y) * t
        });
        
        nextSample += spacing;
      }
      
      accumulated += segLen;
    }
    
    return samples;
  }
  
  // Render sampled points thành dots trong PDF
  function renderDotsToJsPDF(doc, samples, scale, offsetX, offsetY, radius, alpha) {
    const grayVal = Math.round(210 - 200 * alpha);
    doc.setFillColor(grayVal, grayVal, grayVal);
    
    for (const pt of samples) {
      const x = offsetX + pt.x * scale;
      const y = offsetY + (900 - pt.y) * scale;
      doc.circle(x, y, radius, 'F');
    }
  }
  
  // Main API: Render character với dotted strokes
  function renderCharacterDotted(doc, char, x, y, cellSize, alpha) {
    const cd = characters[char];
    if (!cd || !cd.strokes) {
      // Fallback: LXGWWenKai solid font
      doc.setFont('LXGWWenKai', 'normal');
      const grayVal = Math.round(210 - 200 * alpha);
      doc.setTextColor(grayVal, grayVal, grayVal);
      doc.setFontSize(cellSize / 25.4 * 72 * 0.85);
      doc.text(char, x + cellSize / 2, y + cellSize / 2, { 
        align: 'center', 
        baseline: 'middle' 
      });
      return;
    }
    
    const scale = cellSize / 1024;
    const strokeWidth = cellSize * 0.012;
    const dotRadius = strokeWidth * 0.45;
    const dotSpacing = dotRadius * 2.3;
    
    for (const strokePath of cd.strokes) {
      const commands = CW.parseSvgPath(strokePath);
      const polyline = flattenSvgPath(commands, 0.5);
      const samples = samplePathByArcLength(polyline, dotSpacing / scale);
      renderDotsToJsPDF(doc, samples, scale, x, y, dotRadius, alpha);
    }
  }

  function renderStrokeStripPng(char, stepH) {
    const cd = characters[char];
    if (!cd || !cd.strokes) return null;
    const strokes = cd.strokes;
    const n = strokes.length;
    if (!n) return null;
    // Tăng độ phân giải gấp 3 lần cho stroke strip
    const hiResH = stepH * 3;
    const cvs = document.createElement('canvas');
    cvs.width = hiResH * n; cvs.height = hiResH;
    const c = cvs.getContext('2d', { alpha: true, willReadFrequently: false });
    c.imageSmoothingEnabled = false;
    const scale = hiResH / 1024;
    for (let step = 0; step < n; step++) {
      c.save(); c.translate(step * hiResH, 0);
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
        c.fillStyle = s === step ? '#cc0000' : '#000000'; 
        c.fill();
        // Thêm stroke cho nét rõ hơn
        c.strokeStyle = s === step ? '#cc0000' : '#000000';
        c.lineWidth = scale * 1.5;
        c.lineJoin = 'round';
        c.lineCap = 'round';
        c.stroke();
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
      const fadeOpacity = $('#pdf-fade-opacity').checked;
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
      // Tắt compression để giữ chất lượng ảnh tối đa khi in
      const doc = new jsPDFClass({ 
        orientation: 'portrait', 
        unit: 'mm', 
        format: 'a4', 
        compress: false,
        precision: 16
      });

      // ── Load LXGWWenKai font cho fallback ─────────────────────────────────────────
      try {
        const fontResp = await fetch('LXGWWenKai-Medium.ttf');
        if (fontResp.ok) {
          const buf = await fontResp.arrayBuffer();
          let binary = '';
          const bytes = new Uint8Array(buf);
          for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
          const b64 = btoa(binary);
          doc.addFileToVFS('LXGWWenKai.ttf', b64);
          doc.addFont('LXGWWenKai.ttf', 'LXGWWenKai', 'normal');
        }
      } catch (e) { console.warn('Không load được LXGWWenKai font:', e); }
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
        // Outer border — solid, medium gray
        doc.setDrawColor(140, 130, 115); 
        doc.setLineWidth(0.35);
        doc.rect(x, y, size, size);
        
        // Center cross lines — solid (nét liền), slightly lighter
        doc.setDrawColor(170, 160, 145); 
        doc.setLineWidth(0.2);
        doc.line(x, y + size / 2, x + size, y + size / 2);   // horizontal
        doc.line(x + size / 2, y, x + size / 2, y + size);   // vertical
        
        // Diagonal lines — solid (nét liền), very faint
        doc.setDrawColor(200, 195, 185); 
        doc.setLineWidth(0.15);
        doc.line(x, y, x + size, y + size);           // top-left to bottom-right
        doc.line(x + size, y, x, y + size);           // top-right to bottom-left
      }

      // Cache preview images only (dotted rendering is now vector-based)
      const MAIN_PX = 120, STRIP_PX = 90;
      const charImageCache = {};
      for (const item of charList) {
        const mainImg = CW.renderCharPng(item.char, MAIN_PX);
        const stripData = renderStrokeStripPng(item.char, STRIP_PX);
        charImageCache[item.char] = { main: mainImg, strip: stripData };
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
            if (showGuide && guideIdx < guideCount) {
              // Tính alpha dựa trên fadeOpacity setting
              let alpha;
              if (fadeOpacity) {
                // Fade mode: giảm dần từ đậm → nhạt
                const t = guideIdx / Math.max(guideCount - 1, 1);
                const eased = t * (2 - t); // easeOutQuad
                alpha = 0.65 * (1 - eased) + 0.08;
              } else {
                // Uniform mode: tất cả đều đậm như nhau
                alpha = 0.65;
              }
              renderCharacterDotted(doc, item.char, cx, rowY, cellSize, alpha);
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

  // ============================================================
  // WORD (.docx) EXPORT
  // ============================================================
  async function loadDocxLib() {
    if (window.docx) return window.docx;
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      // Dùng file local trước, fallback CDN nếu không có
      s.src = 'docx.umd.min.js';
      s.onload = () => {
        if (window.docx) { resolve(window.docx); return; }
        reject(new Error('docx.js loaded nhưng window.docx không tồn tại'));
      };
      s.onerror = () => {
        // Fallback: thử CDN
        const s2 = document.createElement('script');
        s2.src = 'https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js';
        s2.onload = () => window.docx ? resolve(window.docx) : reject(new Error('Không thể tải docx.js từ CDN'));
        s2.onerror = () => reject(new Error('Không thể tải docx.js (local lẫn CDN đều thất bại)'));
        document.head.appendChild(s2);
      };
      document.head.appendChild(s);
    });
  }

  window.generateDocx = async function () {
    await CW.ensureCharacters();
    const statusEl = $('#pdf-status');
    try {
      const words = getPdfWords();
      if (!words.length) {
        statusEl.classList.remove('hidden');
        statusEl.className = 'mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700';
        statusEl.textContent = '⚠️ Chưa chọn từ nào!';
        return;
      }

      statusEl.classList.remove('hidden');
      statusEl.className = 'mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-700';
      statusEl.innerHTML = '⏳ Đang tạo file Word...';

      const docxLib = await loadDocxLib();
      const {
        Document, Packer, Paragraph, Table, TableRow, TableCell,
        TextRun, ImageRun, WidthType, BorderStyle, AlignmentType,
        TableLayoutType, ShadingType, HeightRule, convertInchesToTwip
      } = docxLib;

      const guideCount = parseInt($('#pdf-repeat').value) || 4;
      const practiceRows = parseInt($('#pdf-practice-rows').value) || 1;
      const showPinyin = $('#pdf-show-pinyin').checked;
      const showGuide = $('#pdf-show-guide').checked;
      const showMeaning = $('#pdf-show-meaning').checked;
      const cellSizeMM = parseInt($('#pdf-cell-size').value) || 18;
      // Convert mm → twips (1 inch = 1440 twips, 1 inch ≈ 25.4 mm)
      const cellTwips = Math.round(cellSizeMM / 25.4 * 1440);

      // Build char list
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

      // -------------------------------------------------------
      // Helper: build a single Tian Zi Ge cell (田字格)
      // -------------------------------------------------------
      const DASHED = BorderStyle.DASHED;
      const SINGLE = BorderStyle.SINGLE;
      const NONE = BorderStyle.NONE;
      const BW = 6; // border width (8ths of a point)

      function tzmBorder(style, color) {
        return { style, size: BW, color: color || '999999' };
      }

      // Guide cell: canvas PNG chứa cả đường kẻ 田字格 + chữ mờ
      function makeGuideImageCell(char, alpha) {
        const px = 256;
        const cvs = document.createElement('canvas');
        cvs.width = px; cvs.height = px;
        const c = cvs.getContext('2d');
        // Nền trắng
        c.fillStyle = '#FFFFFF';
        c.fillRect(0, 0, px, px);
        // Viền ngoài — đồng bộ với makeTianZiCell: outerB size=8 ≈ 5px tại 256px canvas
        c.strokeStyle = '#888888'; c.lineWidth = 5;
        c.strokeRect(2.5, 2.5, px - 5, px - 5);
        // Đường ngang dọc giữa — innerB size=4 ≈ 2.5px
        c.strokeStyle = '#AAAAAA'; c.lineWidth = 2.5;
        c.setLineDash([8, 8]);
        c.beginPath();
        c.moveTo(px / 2, 0); c.lineTo(px / 2, px);
        c.moveTo(0, px / 2); c.lineTo(px, px / 2);
        c.stroke();
        // Đường chéo — diagB size=3 ≈ 2px
        c.strokeStyle = '#CCCCCC'; c.lineWidth = 2;
        c.setLineDash([5, 10]);
        c.beginPath();
        c.moveTo(0, 0); c.lineTo(px, px);
        c.moveTo(px, 0); c.lineTo(0, px);
        c.stroke();
        c.setLineDash([]);
        // Chữ Hán mờ
        const cd = characters[char];
        if (cd && cd.strokes) {
          const scale = px / 1024;
          c.globalAlpha = alpha;
          for (const strokeD of cd.strokes) {
            const parsed = CW.parseSvgPath(strokeD);
            c.beginPath();
            let cx2 = 0, cy2 = 0, lcx2 = 0, lcy2 = 0;
            for (const cmd of parsed) {
              const spx = v => v * scale, spy = v => (900 - v) * scale;
              switch (cmd.type) {
                case 'M': cx2 = cmd.x; cy2 = cmd.y; c.moveTo(spx(cx2), spy(cy2)); break;
                case 'L': cx2 = cmd.x; cy2 = cmd.y; c.lineTo(spx(cx2), spy(cy2)); break;
                case 'Q': lcx2 = cmd.x1; lcy2 = cmd.y1; cx2 = cmd.x; cy2 = cmd.y; c.quadraticCurveTo(spx(lcx2), spy(lcy2), spx(cx2), spy(cy2)); break;
                case 'C': lcx2 = cmd.x2; lcy2 = cmd.y2; cx2 = cmd.x; cy2 = cmd.y; c.bezierCurveTo(spx(cmd.x1), spy(cmd.y1), spx(lcx2), spy(lcy2), spx(cx2), spy(cy2)); break;
                case 'S': { const rx = 2 * cx2 - lcx2, ry = 2 * cy2 - lcy2; lcx2 = cmd.x2; lcy2 = cmd.y2; cx2 = cmd.x; cy2 = cmd.y; c.bezierCurveTo(spx(rx), spy(ry), spx(lcx2), spy(lcy2), spx(cx2), spy(cy2)); break; }
                case 'Z': c.closePath(); break;
              }
            }
            c.fillStyle = '#111111'; c.fill();
          }
          c.globalAlpha = 1;
        }
        // Chuyển sang Uint8Array
        const b64 = cvs.toDataURL('image/png').split(',')[1];
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        // Kích thước ảnh trong docx (pixel @ 96dpi)
        const imgPx = Math.round(cellSizeMM / 25.4 * 96);
        const noB = { style: NONE, size: 0, color: 'FFFFFF' };
        return new TableCell({
          width: { size: cellTwips, type: WidthType.DXA },
          borders: { top: noB, bottom: noB, left: noB, right: noB },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0 },
            children: [new ImageRun({ data: bytes.buffer, transformation: { width: imgPx, height: imgPx } })],
          })],
        });
      }

      function makeEmptyCell() {
        return new TableCell({
          width: { size: cellTwips, type: WidthType.DXA },
          verticalAlign: 'center',
          borders: {
            top: tzmBorder(SINGLE, '999999'),
            bottom: tzmBorder(SINGLE, '999999'),
            left: tzmBorder(SINGLE, '999999'),
            right: tzmBorder(SINGLE, '999999'),
          },
          shading: { type: ShadingType.CLEAR, fill: 'FFFFFF' },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: ' ', size: 2 })],
          })],
        });
      }

      // Ô lưới đường kẻ ngang dọc (田字格) cho hàng luyện viết
      function makeTianZiCell() {
        const half = Math.round(cellTwips / 2);
        const outerB = { style: SINGLE, size: 8, color: '888888' };
        const innerB = { style: DASHED, size: 4, color: 'AAAAAA' };
        const diagB = { style: SINGLE, size: 3, color: 'CCCCCC' };
        const noB = { style: NONE, size: 0, color: 'FFFFFF' };
        const emptyPara = new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: ' ', size: 2 })],
        });
        function subCell(top, bottom, left, right, tl2br, tr2bl) {
          const borders = { top, bottom, left, right };
          if (tl2br) borders.tl2br = diagB;
          if (tr2bl) borders.tr2bl = diagB;
          return new TableCell({
            width: { size: half, type: WidthType.DXA },
            borders,
            shading: { type: ShadingType.CLEAR, fill: 'FFFFFF' },
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            children: [emptyPara],
          });
        }
        const nestedTable = new Table({
          layout: TableLayoutType.FIXED,
          width: { size: cellTwips, type: WidthType.DXA },
          rows: [
            new TableRow({
              height: { value: half, rule: HeightRule.EXACT },
              children: [
                subCell(outerB, innerB, outerB, innerB, true, false), // top-left:  \ diagonal
                subCell(outerB, innerB, innerB, outerB, false, true),  // top-right: / diagonal
              ],
            }),
            new TableRow({
              height: { value: half, rule: HeightRule.EXACT },
              children: [
                subCell(innerB, outerB, outerB, innerB, false, true),  // bottom-left:  / diagonal
                subCell(innerB, outerB, innerB, outerB, true, false), // bottom-right: \ diagonal
              ],
            }),
          ],
        });
        return new TableCell({
          width: { size: cellTwips, type: WidthType.DXA },
          borders: { top: noB, bottom: noB, left: noB, right: noB },
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
          children: [nestedTable],
        });
      }

      // Page width: A4 = 11906 twips, margins 720 each side → 10466
      const pageUsable = 10466;
      const colsPerRow = Math.floor(pageUsable / cellTwips);

      const docChildren = [];

      // Title paragraph
      docChildren.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 120 },
        children: [new TextRun({
          text: 'ChineseWriter – Tập Viết Chữ Hán',
          bold: true,
          size: 28,
          font: { name: 'Times New Roman' },
        })],
      }));

      // -------------------------------------------------------
      // For each character: info row + practice row(s)
      // -------------------------------------------------------
      for (const item of charList) {
        const w = wordMap[item.char];

        // --- Info line (pinyin + meaning as plain text paragraph) ---
        const infoParts = [];
        infoParts.push(new TextRun({
          text: item.char,
          font: { name: 'STKaiti', hint: 'eastAsia' },
          size: 28,
          bold: true,
          color: 'CC0000',
        }));
        if (showPinyin && item.pinyin) {
          infoParts.push(new TextRun({ text: '  /' + item.pinyin + '/', size: 22, color: '444444' }));
        }
        if (showMeaning && w) {
          const viDef = (w.vietnamese || '').split(/[;；]/)[0].trim();
          const enDef = (w.english || '').split(/[;；]/)[0].trim();
          let mt = viDef && enDef ? viDef + ' | ' + enDef : (viDef || enDef);
          if (mt) {
            if (mt.length > 60) mt = mt.substring(0, 57) + '...';
            infoParts.push(new TextRun({ text: '  — ' + mt, size: 20, color: '555555' }));
          }
        }
        docChildren.push(new Paragraph({
          spacing: { before: 120, after: 40 },
          children: infoParts,
        }));

        // --- Guide row (fading copies of the character) ---
        if (showGuide && guideCount > 0) {
          const guideCells = [];
          for (let g = 0; g < guideCount; g++) {
            const alpha = Math.max(0.08, 0.65 - g * (0.57 / Math.max(guideCount - 1, 1)));
            guideCells.push(makeGuideImageCell(item.char, alpha));
          }
          while (guideCells.length % colsPerRow !== 0) guideCells.push(makeTianZiCell());
          // Split into rows of colsPerRow
          for (let r = 0; r < guideCells.length / colsPerRow; r++) {
            const rowCells = guideCells.slice(r * colsPerRow, (r + 1) * colsPerRow);
            docChildren.push(new Table({
              layout: TableLayoutType.FIXED,
              width: { size: pageUsable, type: WidthType.DXA },
              rows: [new TableRow({
                height: { value: cellTwips, rule: HeightRule.EXACT },
                children: rowCells,
              })],
            }));
          }
        }

        // --- Practice rows (blank grid — ô 田字格 có đường kẻ ngang dọc) ---
        for (let row = 0; row < practiceRows; row++) {
          const gridCells = [];
          for (let col = 0; col < colsPerRow; col++) gridCells.push(makeTianZiCell());
          docChildren.push(new Table({
            layout: TableLayoutType.FIXED,
            width: { size: pageUsable, type: WidthType.DXA },
            rows: [new TableRow({
              height: { value: cellTwips, rule: HeightRule.EXACT },
              children: gridCells,
            })],
          }));
        }

        // Spacer
        docChildren.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
      }

      // Build document
      const doc = new Document({
        sections: [{
          properties: {
            page: {
              margin: { top: 720, bottom: 720, left: 720, right: 720 },
            },
          },
          children: docChildren,
        }],
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const hskLabels = [...$$('.pdf-hsk-check input:checked')].map(c => c.value).join('-');
      a.download = pdfMode === 'hsk'
        ? `ChineseWriter_HSK${hskLabels}_TapViet.docx`
        : 'ChineseWriter_TapViet_Custom.docx';
      a.href = url;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      statusEl.className = 'mt-4 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700';
      statusEl.innerHTML = `✅ Đã tạo Word! File <strong>${a.download}</strong> – ${charList.length} chữ Hán. Mở bằng Word/LibreOffice, font chữ sắc nét.`;
    } catch (err) {
      console.error('DOCX error:', err);
      statusEl.className = 'mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700';
      statusEl.innerHTML = `❌ Lỗi: ${err.message}`;
    }
  };
})();
