// ==UserScript==
// @name         Zoom Art Printer (v2.0 Beta)
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Standalone script for rendering saved canvas drawings in Zoom Web Client
// @author       Nikosdays | tg: @nikosdayz
// @match        *://*.zoom.us/wc/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // Helper to find the active Zoom Iframe
  const getIwin = () => {
    try {
      const el = document.getElementById('webclient');
      if (el?.contentWindow) return el.contentWindow;
    } catch {}
    try {
      const ifrs = document.querySelectorAll('iframe');
      for (const f of ifrs) {
        if (f.contentWindow?.webpackChunkwebclient || f.contentWindow?.document?.querySelector('#root')) {
          return f.contentWindow;
        }
      }
    } catch {}
    if (window.webpackChunkwebclient || document.querySelector('#root')) return window;
    return null;
  };

  // Helper to find Zoom canvas
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

  // Draw a single line stroke on canvas
  async function drawLine(canvas, doc, stroke, iwin) {
    const win = iwin || window;
    const mk = (t, x, y) => new (win.MouseEvent || window.MouseEvent)(t, {
      bubbles: true, cancelable: true, view: win,
      clientX: x, clientY: y, button: 0, buttons: t === 'mouseup' ? 0 : 1
    });

    // Start stroke
    canvas.dispatchEvent(mk('mousemove', stroke.x1, stroke.y1));
    canvas.dispatchEvent(mk('mousedown', stroke.x1, stroke.y1));
    
    // Tiny delay to let DOM register the mousedown
    await new Promise(r => setTimeout(r, 5));

    // Middle points (interpolate if needed, but for line we can just go to end)
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const curX = stroke.x1 + (stroke.x2 - stroke.x1) * t;
      const curY = stroke.y1 + (stroke.y2 - stroke.y1) * t;
      doc.dispatchEvent(mk('mousemove', curX, curY));
      await new Promise(r => setTimeout(r, 2)); // very fast
    }

    // End stroke
    doc.dispatchEvent(mk('mouseup', stroke.x2, stroke.y2));
    
    // Wait slightly before next shape
    await new Promise(r => setTimeout(r, 15));
  }

  // Master function to execute drawing code
  async function printZart(artDataStr) {
    const iwin = getIwin();
    const targetWin = iwin || window;
    const doc = targetWin.document || document;
    const canvas = findUpperCanvas(doc) || findUpperCanvas(window.document);
    
    if (!canvas) {
      alert("❌ Ошибка: Холст Zoom не найден! Убедитесь, что открыт режим аннотаций.");
      return;
    }

    let strokes = [];
    try {
      strokes = JSON.parse(artDataStr);
    } catch (e) {
      alert("❌ Ошибка парсинга кода рисунка!");
      return;
    }

    if (!Array.isArray(strokes) || strokes.length === 0) {
      alert("⚠ Код рисунка пуст или некорректен.");
      return;
    }

    const stat = document.getElementById('zap-status');
    if(stat) {
      stat.textContent = `Печатаю... (0/${strokes.length})`;
      stat.style.color = '#f59e0b';
    }

    // Offset based on current canvas position
    const r = canvas.getBoundingClientRect();
    const offsetX = r.left;
    const offsetY = r.top;

    // Execute each stroke
    for (let i = 0; i < strokes.length; i++) {
      const s = strokes[i];
      // Map relative coordinates (0-1000) to actual canvas size if needed, 
      // but for now assume absolute coordinates or direct offsets.
      
      const absStroke = {
        x1: s.x1 + offsetX,
        y1: s.y1 + offsetY,
        x2: s.x2 + offsetX,
        y2: s.y2 + offsetY
      };

      // TODO: Tool selection logic (requires UI DOM clicking, keeping it simple for v0.1)
      await drawLine(canvas, doc, absStroke, targetWin);

      if (stat) stat.textContent = `Печатаю... (${i+1}/${strokes.length})`;
    }

    if(stat) {
      stat.textContent = `✅ Готово! Нарисовано ${strokes.length} фигур.`;
      stat.style.color = '#10b981';
      setTimeout(() => stat.textContent = '', 3000);
    }
  }

  // Build the minimal UI
  function buildArtWidget() {
    if (document.getElementById('zoom-art-printer-widget')) return;

    const w = document.createElement('div');
    w.id = 'zoom-art-printer-widget';
    w.style.cssText = `
      position: fixed; top: 80px; right: 20px; z-index: 999999;
      background: #0d0d10; border: 1px solid #3730a3; border-radius: 8px;
      padding: 10px; font-family: sans-serif; color: #fff; width: 260px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.8);
    `;
    
    w.innerHTML = `
      <div style="font-size: 13px; font-weight: bold; margin-bottom: 8px; color: #c7d2fe;">🎨 Zoom Art Printer v2.0</div>
      <textarea id="zap-code" style="width: 100%; height: 80px; background: #1e1e24; color: #fff; border: 1px solid #27272f; border-radius: 4px; padding: 4px; font-size: 10px; resize: none;" placeholder="Вставьте JSON код рисунка сюда...
Пример:
[{&quot;x1&quot;:50,&quot;y1&quot;:50,&quot;x2&quot;:200,&quot;y2&quot;:200}]"></textarea>
      <button id="zap-print-btn" style="width: 100%; margin-top: 8px; padding: 6px; background: #4f46e5; border: none; border-radius: 4px; color: #fff; font-weight: bold; cursor: pointer;">🚀 Напечатать на холсте</button>
      <div id="zap-status" style="margin-top: 6px; font-size: 11px; text-align: center; min-height: 14px;"></div>
    `;
    
    document.body.appendChild(w);

    document.getElementById('zap-print-btn').addEventListener('click', () => {
      const code = document.getElementById('zap-code').value.trim();
      if (!code) {
        alert("Вставьте код рисунка!");
        return;
      }
      printZart(code);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildArtWidget);
  } else {
    buildArtWidget();
  }
})();
