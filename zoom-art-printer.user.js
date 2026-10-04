// ==UserScript==
// @name         Zoom Art Studio (v2.0 Beta)
// @namespace    http://tampermonkey.net/
// @version      0.2
// @description  Record, save, and print canvas drawings in Zoom Web Client
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

  // ─── ДВИЖОК ПРИНТЕРА (PLAY) ───
  async function drawLine(canvas, doc, stroke, iwin) {
    const win = iwin || window;
    const mk = (t, x, y) => new (win.MouseEvent || window.MouseEvent)(t, {
      bubbles: true, cancelable: true, view: win, clientX: x, clientY: y, button: 0, buttons: t === 'mouseup' ? 0 : 1
    });
    
    canvas.dispatchEvent(mk('mousemove', stroke.x1, stroke.y1));
    canvas.dispatchEvent(mk('mousedown', stroke.x1, stroke.y1));
    
    await new Promise(r => setTimeout(r, 5));
    
    const steps = 5;
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

    for (let i = 0; i < strokes.length; i++) {
      if (stat) { stat.textContent = `Печатаю... (${i+1}/${strokes.length})`; stat.style.color = '#f59e0b'; }
      const s = strokes[i];
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

  function renderRecording() {
    if (!recordingCanvas) return;
    const ctx = recordingCanvas.getContext('2d');
    ctx.clearRect(0, 0, recordingCanvas.width, recordingCanvas.height);
    
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    // Отрисовка уже сохранённых штрихов (красные)
    ctx.strokeStyle = '#ef4444';
    for (const s of recordedStrokes) {
      ctx.beginPath(); ctx.moveTo(s.absX1, s.absY1); ctx.lineTo(s.absX2, s.absY2); ctx.stroke();
    }

    // Отрисовка текущего натягиваемого штриха (синий)
    if (currentStroke) {
      ctx.strokeStyle = '#3b82f6'; 
      ctx.beginPath(); ctx.moveTo(currentStroke.absX1, currentStroke.absY1); ctx.lineTo(currentStroke.absCurX, currentStroke.absCurY); ctx.stroke();
    }
  }

  function toggleRecording() {
    const btn = document.getElementById('zap-record-btn');
    if (isRecording) {
      // ⏹ Остановка записи и генерация кода
      isRecording = false;
      btn.textContent = '🔴 Начать черновик (Запись)';
      btn.style.background = '#dc2626';
      
      if (recordingCanvas) {
        recordingCanvas.remove();
        recordingCanvas = null;
      }

      const iwin = getIwin(), doc = (iwin || window).document || document;
      const zCanvas = findUpperCanvas(doc) || findUpperCanvas(window.document);
      const stat = document.getElementById('zap-status');

      if (zCanvas && recordedStrokes.length > 0) {
        const r = zCanvas.getBoundingClientRect();
        // Переводим абсолютные координаты экрана в относительные координаты холста Zoom
        const finalData = recordedStrokes.map(s => ({
          x1: Math.round(s.absX1 - r.left),
          y1: Math.round(s.absY1 - r.top),
          x2: Math.round(s.absX2 - r.left),
          y2: Math.round(s.absY2 - r.top)
        }));
        document.getElementById('zap-code').value = JSON.stringify(finalData);
        if (stat) { stat.textContent = `💾 Записано ${finalData.length} штрихов!`; stat.style.color = '#38bdf8'; }
      } else if (!zCanvas && recordedStrokes.length > 0) {
        if (stat) { stat.textContent = `❌ Ошибка: Откройте холст Zoom перед записью!`; stat.style.color = '#ef4444'; }
      }
      recordedStrokes = [];
    } else {
      // 🔴 Старт записи (Появление стекла)
      recordedStrokes = [];
      isRecording = true;
      btn.innerHTML = '⏹ <b>Сохранить в код</b>';
      btn.style.background = '#f59e0b';
      document.getElementById('zap-code').value = '';

      recordingCanvas = document.createElement('canvas');
      // Немного затемняем экран, чтобы было понятно, что включен черновик
      recordingCanvas.style.cssText = 'position:fixed; top:0; left:0; width:100vw; height:100vh; z-index:999998; cursor:crosshair; background:rgba(0,0,0,0.15);';
      recordingCanvas.width = window.innerWidth;
      recordingCanvas.height = window.innerHeight;
      document.body.appendChild(recordingCanvas);

      recordingCanvas.addEventListener('mousedown', e => {
        currentStroke = { absX1: e.clientX, absY1: e.clientY, absCurX: e.clientX, absCurY: e.clientY };
        renderRecording();
      });
      recordingCanvas.addEventListener('mousemove', e => {
        if (currentStroke) {
          currentStroke.absCurX = e.clientX;
          currentStroke.absCurY = e.clientY;
          renderRecording();
        }
      });
      recordingCanvas.addEventListener('mouseup', e => {
        if (currentStroke) {
          recordedStrokes.push({
            absX1: currentStroke.absX1, absY1: currentStroke.absY1,
            absX2: e.clientX, absY2: e.clientY
          });
          currentStroke = null;
          renderRecording();
        }
      });
    }
  }

  // ─── ИНТЕРФЕЙС ───
  function buildArtWidget() {
    if (document.getElementById('zoom-art-printer-widget')) return;
    const w = document.createElement('div');
    w.id = 'zoom-art-printer-widget';
    w.style.cssText = `
      position: fixed; top: 80px; right: 20px; z-index: 999999;
      background: #0d0d10; border: 1px solid #3730a3; border-radius: 8px;
      padding: 10px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #fff; width: 260px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.8);
    `;
    w.innerHTML = `
      <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #c7d2fe; display:flex; justify-content:space-between;">
        <span>🎨 Z-Art Studio <span style="font-size:9px;color:#818cf8">v2.0 Beta</span></span>
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
