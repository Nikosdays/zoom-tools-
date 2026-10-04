// ==UserScript==
// @name         Zoom Art Studio (v2.1 Beta)
// @namespace    http://tampermonkey.net/
// @version      0.3
// @description  Record, save, and print canvas drawings with tools and colors in Zoom
// @author       Nikosdays | tg: @nikosdayz
// @match        *://*.zoom.us/wc/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // ─── ХЕЛПЕРЫ ДЛЯ ZOOM ───
  const getIwin = () => {
    try { const el = document.getElementById('webclient'); if (el?.contentWindow) return el.contentWindow; } catch {}
    try { for (const f of document.querySelectorAll('iframe')) { if (f.contentWindow?.webpackChunkwebclient || f.contentWindow?.document?.querySelector('#root')) return f.contentWindow; } } catch {}
    if (window.webpackChunkwebclient || document.querySelector('#root')) return window;
    return null;
  };

  const queryAll = selector => {
    const docs = [document];
    const iw = getIwin(); if (iw?.document) docs.push(iw.document);
    for (const d of docs) { const el = d.querySelector(selector); if (el) return el; }
    return null;
  };

  const queryAllList = selector => {
    const docs = [document], res = [];
    const iw = getIwin(); if (iw?.document) docs.push(iw.document);
    for (const d of docs) res.push(...d.querySelectorAll(selector));
    return res;
  };

  function clickToolbarButton(btn) {
    if (!btn) return false;
    try {
      btn.focus?.();
      btn.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true, view: window }));
      btn.click?.();
      return true;
    } catch { return false; }
  }

  function clickMenuReal(el, win = window) {
    if (!el) return;
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(t => {
      try { el.dispatchEvent(new win.MouseEvent(t, { bubbles: true, cancelable: true, view: win, buttons: t.includes('up') || t === 'click' ? 0 : 1 })); } catch {}
    });
    try { el.click?.(); } catch {}
  }

  function findUpperCanvas(doc) {
    function scan(root) {
      try {
        const el = root.querySelector('.upper-canvas'); if (el) return el;
        for (const c of root.querySelectorAll('*')) {
          if (c.shadowRoot) { const f = scan(c.shadowRoot); if (f) return f; }
        }
      } catch {} return null;
    }
    return scan(doc);
  }

  // ─── УПРАВЛЕНИЕ ТУЛЗАМИ ZOOM ───
  let lastTool = null;
  let lastColor = null;

  function getVisible(selector) {
    return queryAllList(selector).filter(b => b.offsetWidth > 0 && b.offsetHeight > 0);
  }

  async function setZoomColor(colorIdx) {
    if (lastColor === colorIdx) return;
    // Ищем только ВИДИМУЮ кнопку палитры, чтобы не кликнуть по скрытому тулбару!
    const paletteBtns = getVisible('[class*="anno-toolbar__item--palette"] button, [class*="anno-toolbar__item--palette"], button[aria-label*="Формат" i], button[aria-label*="Format" i], button[aria-label*="Цвет" i]');
    const paletteBtn = paletteBtns[0];
    if (!paletteBtn) { console.error("Palette button not found!"); return; }
    
    clickToolbarButton(paletteBtn);
    await new Promise(r => setTimeout(r, 150)); // Ждем анимацию меню
    
    // Берем только ВИДИМЫЕ кнопки, иначе кликнем по скрытому меню
    const colorBtns = getVisible('[role="dialog"] button, .popover button, [class*="color-picker"] button');
    if (colorBtns.length > colorIdx) {
      clickMenuReal(colorBtns[colorIdx], colorBtns[colorIdx].ownerDocument?.defaultView || window);
      lastColor = colorIdx;
      await new Promise(r => setTimeout(r, 60));
    }
    // Закрываем меню на всякий случай
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  async function setZoomTool(toolName) {
    if (lastTool === toolName) return;
    const drawBtns = getVisible('[class*="anno-toolbar__item--draw"] button, [class*="anno-toolbar__item--draw"], button[aria-label*="Рисовать" i], button[aria-label*="Draw" i]');
    const drawBtn = drawBtns[0];
    if (!drawBtn) { console.error("Draw button not found!"); return; }
    
    clickToolbarButton(drawBtn);
    await new Promise(r => setTimeout(r, 150)); // Ждем анимацию меню
    
    // Берем только ВИДИМЫЕ кнопки
    const menuBtns = getVisible('[role="menu"] button, .popover button, .dropdown-menu button');
    let target = null;
    
    for (let b of menuBtns) {
      const a = (b.getAttribute('aria-label') || b.title || '').toLowerCase();
      if (!a) continue;
      
      if (toolName === 'line' && (a.includes('линия') || a.includes('line'))) target = b;
      else if (toolName === 'rect_empty' && (a.includes('прямоугольник') || a.includes('rectangle')) && !a.includes('закраш') && !a.includes('filled')) target = b;
      else if (toolName === 'rect_solid' && (a.includes('закраш') || a.includes('filled')) && (a.includes('прямоугольник') || a.includes('rectangle'))) target = b;
      else if (toolName === 'ellipse_empty' && (a.includes('эллипс') || a.includes('круг') || a.includes('ellipse')) && !a.includes('закраш') && !a.includes('filled')) target = b;
      else if (toolName === 'ellipse_solid' && (a.includes('закраш') || a.includes('filled')) && (a.includes('эллипс') || a.includes('круг') || a.includes('ellipse'))) target = b;
      
      if (target) break;
    }
    
    if (target) {
      clickMenuReal(target, target.ownerDocument?.defaultView || window);
      lastTool = toolName;
      await new Promise(r => setTimeout(r, 60));
    } else {
      clickToolbarButton(drawBtn);
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  // ─── ДВИЖОК ПРИНТЕРА (PLAY) ───
  async function drawLine(canvas, doc, stroke, iwin) {
    const win = iwin || window;
    const mk = (t, x, y) => new (win.MouseEvent || window.MouseEvent)(t, {
      bubbles: true, cancelable: true, view: win, clientX: x, clientY: y, button: 0, buttons: t === 'mouseup' ? 0 : 1
    });
    
    canvas.dispatchEvent(mk('mousemove', stroke.x1, stroke.y1));
    canvas.dispatchEvent(mk('mousedown', stroke.x1, stroke.y1));
    await new Promise(r => setTimeout(r, 5));
    
    // Для прямых фигур (линии, квадраты) достаточно одного движения в конец или пары промежуточных
    const steps = 3; 
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      doc.dispatchEvent(mk('mousemove', stroke.x1 + (stroke.x2 - stroke.x1) * t, stroke.y1 + (stroke.y2 - stroke.y1) * t));
      await new Promise(r => setTimeout(r, 2));
    }
    
    doc.dispatchEvent(mk('mouseup', stroke.x2, stroke.y2));
    await new Promise(r => setTimeout(r, 15));
  }

  async function printZart(artDataStr) {
    const iwin = getIwin(), targetWin = iwin || window, doc = targetWin.document || document;
    const canvas = findUpperCanvas(doc) || findUpperCanvas(window.document);
    if (!canvas) { alert("❌ Холст Zoom не найден! Убедитесь, что открыты аннотации."); return; }
    
    let strokes = [];
    try { strokes = JSON.parse(artDataStr); } catch { alert("❌ Ошибка парсинга кода рисунка!"); return; }
    if (!Array.isArray(strokes) || !strokes.length) { alert("⚠ Код пуст."); return; }

    const stat = document.getElementById('zap-status');
    const r = canvas.getBoundingClientRect();
    const offsetX = r.left, offsetY = r.top;

    lastTool = null; lastColor = null; // Сброс кэша

    for (let i = 0; i < strokes.length; i++) {
      if (stat) { stat.textContent = `Печатаю... (${i+1}/${strokes.length})`; stat.style.color = '#f59e0b'; }
      const s = strokes[i];
      
      // Переключаем инструмент и цвет, если нужно
      await setZoomColor(s.color || 1); // 1 = Red by default
      await setZoomTool(s.tool || 'line');

      await drawLine(canvas, doc, { x1: s.x1 + offsetX, y1: s.y1 + offsetY, x2: s.x2 + offsetX, y2: s.y2 + offsetY }, targetWin);
    }
    
    if (stat) {
      stat.textContent = `✅ Готово! Нарисовано ${strokes.length} штрихов.`;
      stat.style.color = '#10b981';
      setTimeout(() => stat.textContent = '', 3000);
    }
  }

  // ─── РЕКОРДЕР (ФАНТОМНЫЙ ХОЛСТ) ───
  let recordingCanvas = null;
  let recordedStrokes = [];
  let currentStroke = null;
  let isRecording = false;

  const COLOR_MAP = {
    1: '#ef4444', // Red
    4: '#3b82f6', // Blue
    3: '#22c55e', // Green
    11: '#000000' // Black
  };

  function renderShape(ctx, s) {
    const w = s.absX2 - s.absX1;
    const h = s.absY2 - s.absY1;
    
    ctx.strokeStyle = COLOR_MAP[s.color] || '#ef4444';
    ctx.fillStyle = COLOR_MAP[s.color] || '#ef4444';
    
    if (s.tool === 'line') {
      ctx.beginPath(); ctx.moveTo(s.absX1, s.absY1); ctx.lineTo(s.absX2, s.absY2); ctx.stroke();
    } else if (s.tool === 'rect_empty') {
      ctx.strokeRect(s.absX1, s.absY1, w, h);
    } else if (s.tool === 'rect_solid') {
      ctx.fillRect(s.absX1, s.absY1, w, h);
    } else if (s.tool.includes('ellipse')) {
      ctx.beginPath();
      // ellipse(x, y, radiusX, radiusY, rotation, startAngle, endAngle)
      ctx.ellipse(s.absX1 + w/2, s.absY1 + h/2, Math.abs(w/2), Math.abs(h/2), 0, 0, 2*Math.PI);
      if (s.tool === 'ellipse_solid') ctx.fill(); else ctx.stroke();
    }
  }

  function renderRecording() {
    if (!recordingCanvas) return;
    const ctx = recordingCanvas.getContext('2d');
    ctx.clearRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    for (const s of recordedStrokes) {
      renderShape(ctx, s);
    }

    if (currentStroke) {
      // Полупрозрачный для эффекта "в процессе натягивания"
      ctx.globalAlpha = 0.6;
      renderShape(ctx, currentStroke);
      ctx.globalAlpha = 1.0;
    }
  }

  function toggleRecording() {
    const btn = document.getElementById('zap-record-btn');
    const toolsUI = document.getElementById('zap-draft-tools');
    
    if (isRecording) {
      isRecording = false;
      btn.textContent = '🔴 Начать черновик (Запись)';
      btn.style.background = '#dc2626';
      toolsUI.style.display = 'none';
      
      if (recordingCanvas) {
        recordingCanvas.remove();
        recordingCanvas = null;
      }

      const iwin = getIwin(), doc = (iwin || window).document || document;
      const zCanvas = findUpperCanvas(doc) || findUpperCanvas(window.document);
      const stat = document.getElementById('zap-status');

      if (zCanvas && recordedStrokes.length > 0) {
        const r = zCanvas.getBoundingClientRect();
        const finalData = recordedStrokes.map(s => ({
          tool: s.tool,
          color: s.color,
          x1: Math.round(s.absX1 - r.left),
          y1: Math.round(s.absY1 - r.top),
          x2: Math.round(s.absX2 - r.left),
          y2: Math.round(s.absY2 - r.top)
        }));
        document.getElementById('zap-code').value = JSON.stringify(finalData);
        if (stat) { stat.textContent = `💾 Записано ${finalData.length} фигур!`; stat.style.color = '#38bdf8'; }
      } else if (!zCanvas && recordedStrokes.length > 0) {
        if (stat) { stat.textContent = `❌ Ошибка: Откройте холст Zoom перед записью!`; stat.style.color = '#ef4444'; }
      }
      recordedStrokes = [];
    } else {
      recordedStrokes = [];
      isRecording = true;
      btn.innerHTML = '⏹ <b>Сохранить в код</b>';
      btn.style.background = '#f59e0b';
      document.getElementById('zap-code').value = '';
      toolsUI.style.display = 'flex';

      recordingCanvas = document.createElement('canvas');
      recordingCanvas.id = 'zap-recording-canvas';
      recordingCanvas.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:999998; cursor:crosshair; background:rgba(0,0,0,0.15);';
      recordingCanvas.width = window.innerWidth;
      recordingCanvas.height = window.innerHeight;
      document.body.appendChild(recordingCanvas);

      const getActiveTool = () => document.getElementById('zap-tool-sel').value;
      const getActiveColor = () => parseInt(document.getElementById('zap-color-sel').value);

      recordingCanvas.addEventListener('mousedown', e => {
        currentStroke = { 
          tool: getActiveTool(), color: getActiveColor(),
          absX1: e.clientX, absY1: e.clientY, absX2: e.clientX, absY2: e.clientY 
        };
        renderRecording();
      });
      recordingCanvas.addEventListener('mousemove', e => {
        if (currentStroke) {
          currentStroke.absX2 = e.clientX;
          currentStroke.absY2 = e.clientY;
          renderRecording();
        }
      });
      recordingCanvas.addEventListener('mouseup', e => {
        if (currentStroke) {
          currentStroke.absX2 = e.clientX;
          currentStroke.absY2 = e.clientY;
          recordedStrokes.push(currentStroke);
          currentStroke = null;
          renderRecording();
        }
      });
    }
  }

  // ─── ИНТЕРФЕЙС ───
  function buildArtWidget() {
    // Удаляем старый виджет, чтобы скрипт можно было обновлять "на лету" в консоли
    const oldWidget = document.getElementById('zoom-art-printer-widget');
    if (oldWidget) oldWidget.remove();
    const oldCanvas = document.getElementById('zap-recording-canvas');
    if (oldCanvas) oldCanvas.remove();

    const w = document.createElement('div');
    w.id = 'zoom-art-printer-widget';
    w.style.cssText = `
      position: fixed; top: 80px; right: 20px; z-index: 999999;
      background: #0d0d10; border: 1px solid #3730a3; border-radius: 8px;
      padding: 10px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #fff; width: 280px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.8);
    `;
    w.innerHTML = `
      <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #c7d2fe; display:flex; justify-content:space-between;">
        <span>🎨 Z-Art Studio <span style="font-size:9px;color:#818cf8">v2.1 Beta</span></span>
      </div>
      
      <div id="zap-draft-tools" style="display:none; gap: 4px; margin-bottom: 8px;">
        <select id="zap-tool-sel" style="flex:1; background:#1e1e24; color:#fff; border:1px solid #3730a3; border-radius:4px; font-size:11px; padding:2px;">
          <option value="line">📏 Линия</option>
          <option value="rect_empty">⬜ Пустой квадрат</option>
          <option value="rect_solid">⬛ Залитый квадрат</option>
          <option value="ellipse_empty">⭕ Пустой круг</option>
          <option value="ellipse_solid">🔴 Залитый круг</option>
        </select>
        <select id="zap-color-sel" style="flex:1; background:#1e1e24; color:#fff; border:1px solid #3730a3; border-radius:4px; font-size:11px; padding:2px;">
          <option value="1">🟥 Красный</option>
          <option value="4">🟦 Синий</option>
          <option value="3">🟩 Зеленый</option>
          <option value="11">⬛ Черный</option>
        </select>
      </div>

      <button id="zap-record-btn" style="width: 100%; margin-bottom: 8px; padding: 6px; background: #dc2626; border: none; border-radius: 4px; color: #fff; font-weight: bold; cursor: pointer; transition: 0.2s;">🔴 Начать черновик (Запись)</button>
      <textarea id="zap-code" style="width: 100%; height: 80px; background: #1e1e24; color: #fff; border: 1px solid #27272f; border-radius: 4px; padding: 4px; font-size: 10px; resize: none; box-sizing: border-box;" placeholder="Здесь появится сгенерированный JSON-код вашего рисунка..."></textarea>
      <button id="zap-print-btn" style="width: 100%; margin-top: 8px; padding: 6px; background: #4f46e5; border: none; border-radius: 4px; color: #fff; font-weight: bold; cursor: pointer; transition: 0.2s;">🚀 Напечатать на холсте</button>
      <div id="zap-status" style="margin-top: 6px; font-size: 11px; text-align: center; min-height: 14px;"></div>
    `;
    document.body.appendChild(w);

    document.getElementById('zap-record-btn').addEventListener('click', toggleRecording);
    
    document.getElementById('zap-print-btn').addEventListener('click', () => {
      const code = document.getElementById('zap-code').value.trim();
      if (!code) { alert("Вставьте код рисунка!"); return; }
      printZart(code);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', buildArtWidget);
  else buildArtWidget();
})();
