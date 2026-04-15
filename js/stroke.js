// js/stroke.js — Stroke animation engine, SVG path parser, canvas
(function () {
  'use strict';
  const CW = window.CW;
  const $ = CW.$, $$ = CW.$$;
  const characters = CW.characters;
  const allWords = CW.allWords;
  const radicals = CW.radicals;

  let currentStrokeChars = [];
  let currentStrokeIdx = 0;
  let animId = null;

  function setupStrokeEvents() {
    $('#stroke-input').addEventListener('keydown', e => { if (e.key === 'Enter') doStrokeLookup(); });
  }

  window.strokeQuick = function (text) {
    $('#stroke-input').value = text;
    CW.showPage('stroke');
    doStrokeLookup();
  };

  window.doStrokeLookup = async function () {
    const text = $('#stroke-input').value.trim();
    if (!text) return;
    await CW.ensureCharacters();
    currentStrokeChars = [];
    for (const ch of text) { if (characters[ch]) currentStrokeChars.push(characters[ch]); }
    if (!currentStrokeChars.length) {
      $('#stroke-area').classList.add('hidden');
      $('#stroke-empty').classList.remove('hidden');
      $('#stroke-empty').innerHTML = '<div class="text-5xl mb-3">🔍</div><p>Không tìm thấy dữ liệu bút thuận cho "' + text + '"</p>';
      return;
    }
    $('#stroke-area').classList.remove('hidden');
    $('#stroke-empty').classList.add('hidden');
    let tabsH = '';
    currentStrokeChars.forEach((c, i) => {
      tabsH += `<button onclick="selectStrokeChar(${i})" class="stroke-tab px-4 py-2 rounded-lg font-cn text-xl border-2 ${i === 0 ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 hover:border-primary'} transition-colors">${c.char}</button>`;
    });
    $('#stroke-char-tabs').innerHTML = tabsH;
    selectStrokeChar(0);
  };

  window.selectStrokeChar = function (idx) {
    currentStrokeIdx = idx;
    $$('.stroke-tab').forEach((t, i) => {
      t.classList.toggle('border-primary', i === idx);
      t.classList.toggle('bg-blue-50', i === idx);
      t.classList.toggle('text-primary', i === idx);
      t.classList.toggle('border-slate-200', i !== idx);
    });
    const c = currentStrokeChars[idx];
    const partsH = CW.makeDecompClickable(c.decomp, c.radical);
    const exactWord = allWords.find(w => w.hanzi === c.char);
    const containWord = !exactWord ? allWords.find(w => [...w.hanzi].includes(c.char)) : null;
    const wordData = exactWord || containWord;
    let viFullHtml = '', enLineHtml = '', pinyinText = '';
    if (wordData) {
      pinyinText = wordData.pinyin || '';
      if (wordData.vietnamese) {
        const viDefs = [...new Set(wordData.vietnamese.split(/[;；]/).map(s => s.trim()).filter(Boolean))];
        viFullHtml = `<div class="mt-3"><div class="text-xs font-bold text-red-500 uppercase tracking-wide mb-1">🇻🇳 Nghĩa tiếng Việt</div>${viDefs.map((d, i) => `<p class="text-sm text-slate-700 py-0.5">${i + 1}. ${d}</p>`).join('')}</div>`;
      }
      if (wordData.english) {
        const enFirst = wordData.english.split(/[;；]/)[0].trim();
        enLineHtml = `<p class="text-sm mt-1"><span class="text-blue-500 font-medium">🇬🇧</span> <span class="text-slate-500">${enFirst}</span></p>`;
      }
    }
    if (!viFullHtml && !enLineHtml && c.def) {
      enLineHtml = `<p class="text-sm mt-1"><span class="text-blue-500 font-medium">🇬🇧</span> <span class="text-slate-500">${c.def}</span></p>`;
    }
    const charEsc = c.char.replace(/'/g, "\\\\'");
    $('#stroke-info').innerHTML = `
      <div class="bg-white rounded-xl border p-4">
        <div class="flex items-center gap-4 mb-2">
          <span class="font-cn text-4xl font-bold text-hanzi">${c.char}</span>
          <div>
            ${pinyinText ? `<div class="text-sm text-primary font-medium mb-0.5">${pinyinText}</div>` : ''}
            <div class="text-sm"><span class="text-slate-400">Bộ thủ:</span> <strong ${(radicals[c.radical] || characters[c.radical]) ? `onclick="showRadicalModal('${(c.radical || '').replace(/'/g, "\\\\'")}')" class="cursor-pointer text-red-700 hover:underline"` : ''}>${radicals[c.radical] ? `${c.radical} ${radicals[c.radical].viet}` : (c.radical || '—')}</strong></div>
            <div class="text-sm"><span class="text-slate-400">Số nét:</span> <strong>${c.strokeCount}</strong></div>
          </div>
        </div>
        <div class="flex gap-2 mb-3">
          <button onclick="speakWord('${charEsc}')" class="inline-flex items-center gap-1.5 bg-primary text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-primary-dark transition-colors">
            <svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.5v7a4.47 4.47 0 002.5-3.5z" fill="currentColor"/></svg> Phát âm
          </button>
          <button onclick="addToBookmark('${charEsc}')" class="inline-flex items-center gap-1.5 border border-amber-400 text-amber-700 px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-amber-50 transition-colors">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg> Lưu
          </button>
        </div>
        ${viFullHtml}${enLineHtml}
        ${c.decomp ? `<div class="mt-3"><div class="text-xs font-bold text-primary uppercase tracking-wide mb-2">Phân tách</div><div class="flex flex-wrap gap-2">${partsH}</div></div>` : ''}
      </div>`;
    startAnimation(c);
  };

  window.replayStroke = function () {
    if (currentStrokeChars[currentStrokeIdx]) startAnimation(currentStrokeChars[currentStrokeIdx]);
  };

  // ===== STROKE ANIMATION ENGINE =====
  const canvas = document.getElementById('stroke-canvas');
  const ctx = canvas ? canvas.getContext('2d') : null;

  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  function precomputeMedianLengths(medians, scale) {
    return medians.map(median => {
      if (!median || median.length < 2) return { pts: [], totalLen: 0 };
      const pts = median.map(p => ({ x: p[0] * scale, y: (900 - p[1]) * scale }));
      let totalLen = 0;
      const segLens = [];
      for (let i = 1; i < pts.length; i++) {
        const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        segLens.push(len); totalLen += len;
      }
      return { pts, segLens, totalLen };
    });
  }

  function startAnimation(charData) {
    cancelAnim();
    const strokes = charData.strokes || [];
    const medians = charData.medians || [];
    const total = strokes.length;
    const dotsEl = $('#stroke-dots');
    dotsEl.innerHTML = '';
    for (let i = 0; i < Math.min(total, 30); i++) {
      const d = document.createElement('span');
      d.className = 'inline-block w-2 h-2 rounded-full bg-slate-200 transition-all stroke-dot';
      dotsEl.appendChild(d);
    }
    if (!total) { clearCanvas(); return; }
    initCanvas();
    const parsed = strokes.map(s => CW.parseSvgPath(s));
    const S = 400, scale = S / 1024;
    const medianData = precomputeMedianLengths(medians, scale);
    const strokeDurations = medianData.map(m => {
      const len = m.totalLen || 100;
      return Math.max(500, Math.min(1200, len * 3.5));
    });
    const pauseBetween = 200;
    const timeline = [];
    let t = 300;
    for (let i = 0; i < total; i++) {
      timeline.push({ start: t, dur: strokeDurations[i] || 500 });
      t += (strokeDurations[i] || 500) + pauseBetween;
    }
    const totalDuration = t;
    const startTime = performance.now();
    function frame(now) {
      const elapsed = now - startTime;
      drawFrameSmooth(parsed, medianData, total, scale, S, timeline, elapsed);
      updateDotsSmooth(total, timeline, elapsed);
      if (elapsed < totalDuration) animId = requestAnimationFrame(frame);
    }
    animId = requestAnimationFrame(frame);
  }

  function cancelAnim() { if (animId) { cancelAnimationFrame(animId); animId = null; } }

  function initCanvas() {
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = 400 * dpr, h = 400 * dpr;
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function clearCanvas() { initCanvas(); if (ctx) ctx.clearRect(0, 0, 400, 400); }

  function drawFrameSmooth(strokes, medianData, total, scale, S, timeline, elapsed) {
    if (!ctx) return;
    ctx.clearRect(0, 0, 400, 400);
    drawGrid(S);
    const brushWidth = 200 * scale;
    for (let i = 0; i < total; i++) {
      const tl = timeline[i];
      const path = strokes[i];
      if (!path) continue;
      if (elapsed < tl.start) { drawPath(path, scale, '#e8e0d0', 1); }
      else if (elapsed >= tl.start + tl.dur) { drawPath(path, scale, '#2c2c2c', 1); }
      else {
        const raw = (elapsed - tl.start) / tl.dur;
        const sp = easeInOutCubic(Math.max(0, Math.min(1, raw)));
        drawPath(path, scale, '#e8e0d0', 1);
        const md = medianData[i];
        if (md && md.pts.length >= 2) {
          ctx.save(); buildClipSmooth(md, sp, brushWidth);
          drawPath(path, scale, '#cc0000', 1); ctx.restore();
        } else { drawPath(path, scale, '#cc0000', sp); }
      }
    }
  }

  function drawGrid(s) {
    if (!ctx) return;
    ctx.strokeStyle = '#ccbb99'; ctx.lineWidth = 2;
    ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
    ctx.setLineDash([10, 6]); ctx.strokeStyle = '#ddccaa'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(s / 2, 0); ctx.lineTo(s / 2, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, s / 2); ctx.lineTo(s, s / 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(221,204,170,0.4)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s, s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(0, s); ctx.stroke();
    ctx.setLineDash([]);
  }

  function buildClipSmooth(md, progress, bw) {
    const { pts, segLens, totalLen } = md;
    if (!totalLen) return;
    const targetLen = totalLen * progress;
    const r = bw / 2;
    const stepSize = Math.max(r * 0.5, 3);
    ctx.beginPath();
    addCircle(pts[0].x, pts[0].y, r);
    let traveled = 0;
    for (let i = 0; i < segLens.length; i++) {
      const segLen = segLens[i];
      if (segLen === 0) continue;
      const p0 = pts[i], p1 = pts[i + 1];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      if (traveled + segLen <= targetLen) {
        const steps = Math.max(1, Math.ceil(segLen / stepSize));
        for (let j = 1; j <= steps; j++) { const t = j / steps; addCircle(p0.x + dx * t, p0.y + dy * t, r); }
        traveled += segLen;
      } else {
        const remain = targetLen - traveled;
        const frac = remain / segLen;
        const steps = Math.max(1, Math.ceil(remain / stepSize));
        for (let j = 1; j <= steps; j++) { const t = Math.min(frac, j / steps * frac); addCircle(p0.x + dx * t, p0.y + dy * t, r); }
        break;
      }
    }
    ctx.clip();
  }

  function addCircle(x, y, r) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }

  function updateDotsSmooth(total, timeline, elapsed) {
    $$('.stroke-dot').forEach((dot, i) => {
      if (i >= timeline.length) return;
      const tl = timeline[i];
      if (elapsed >= tl.start + tl.dur) { dot.classList.add('done'); dot.classList.remove('act'); }
      else if (elapsed >= tl.start) { dot.classList.remove('done'); dot.classList.add('act'); }
      else { dot.classList.remove('done'); dot.classList.remove('act'); }
    });
  }

  function drawPath(commands, scale, color, alpha) {
    if (!ctx) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.beginPath();
    let cx = 0, cy = 0, lcx = 0, lcy = 0;
    const tx = x => x * scale, ty = y => (900 - y) * scale;
    for (const cmd of commands) {
      switch (cmd.type) {
        case 'M': cx = cmd.x; cy = cmd.y; ctx.moveTo(tx(cx), ty(cy)); break;
        case 'L': cx = cmd.x; cy = cmd.y; ctx.lineTo(tx(cx), ty(cy)); break;
        case 'Q': lcx = cmd.x1; lcy = cmd.y1; cx = cmd.x; cy = cmd.y; ctx.quadraticCurveTo(tx(lcx), ty(lcy), tx(cx), ty(cy)); break;
        case 'C': lcx = cmd.x2; lcy = cmd.y2; cx = cmd.x; cy = cmd.y; ctx.bezierCurveTo(tx(cmd.x1), ty(cmd.y1), tx(lcx), ty(lcy), tx(cx), ty(cy)); break;
        case 'S': { const rx = 2 * cx - lcx, ry = 2 * cy - lcy; lcx = cmd.x2; lcy = cmd.y2; cx = cmd.x; cy = cmd.y; ctx.bezierCurveTo(tx(rx), ty(ry), tx(lcx), ty(lcy), tx(cx), ty(cy)); break; }
        case 'T': { const rx = 2 * cx - lcx, ry = 2 * cy - lcy; lcx = rx; lcy = ry; cx = cmd.x; cy = cmd.y; ctx.quadraticCurveTo(tx(lcx), ty(lcy), tx(cx), ty(cy)); break; }
        case 'Z': ctx.closePath(); break;
      }
    }
    ctx.fillStyle = color; ctx.fill(); ctx.restore();
  }

  // ===== SVG PATH PARSER (shared via CW) =====
  CW.parseSvgPath = function (d) {
    const cmds = [], tokens = tokenize(d);
    let i = 0;
    while (i < tokens.length) {
      switch (tokens[i]) {
        case 'M': cmds.push({ type: 'M', x: +tokens[i + 1], y: +tokens[i + 2] }); i += 3; break;
        case 'L': cmds.push({ type: 'L', x: +tokens[i + 1], y: +tokens[i + 2] }); i += 3; break;
        case 'Q': cmds.push({ type: 'Q', x1: +tokens[i + 1], y1: +tokens[i + 2], x: +tokens[i + 3], y: +tokens[i + 4] }); i += 5; break;
        case 'C': cmds.push({ type: 'C', x1: +tokens[i + 1], y1: +tokens[i + 2], x2: +tokens[i + 3], y2: +tokens[i + 4], x: +tokens[i + 5], y: +tokens[i + 6] }); i += 7; break;
        case 'S': cmds.push({ type: 'S', x2: +tokens[i + 1], y2: +tokens[i + 2], x: +tokens[i + 3], y: +tokens[i + 4] }); i += 5; break;
        case 'T': cmds.push({ type: 'T', x: +tokens[i + 1], y: +tokens[i + 2] }); i += 3; break;
        case 'Z': case 'z': cmds.push({ type: 'Z' }); i++; break;
        default: i++;
      }
    }
    return cmds;
  };

  function tokenize(d) {
    const t = []; let c = '';
    for (const ch of d) {
      if ('MLQCSZTmlqcszt'.includes(ch)) { if (c) { t.push(c); c = ''; } t.push(ch.toUpperCase()); }
      else if (',\t\n '.includes(ch)) { if (c) { t.push(c); c = ''; } }
      else if (ch === '-') { if (c) { t.push(c); c = ''; } c = ch; }
      else c += ch;
    }
    if (c) t.push(c);
    return t;
  }

  // ===== INIT =====
  CW.onDataLoaded(function () {
    setupStrokeEvents();
  });
})();
