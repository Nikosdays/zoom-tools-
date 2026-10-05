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
    const direct = doc.querySelector('canvas.annot-canvas, canvas.annotation-canvas, canvas[id*="annot"], canvas.upper-canvas, .sharee-sp-container__canvas, #canvas-wrap canvas, .z-annotation-layer canvas');
    if (direct) return direct;
    function scan(root) {
      try {
        const el = root.querySelector('.upper-canvas'); if (el) return el;
        for (const c of root.querySelectorAll('*')) {
          if (c.shadowRoot) { const f = scan(c.shadowRoot); if (f) return f; }
        }
      } catch {} return null;
    }
    return scan(doc) || doc.querySelector('.meeting-app') || doc.body;
  }

  // ─── УПРАВЛЕНИЕ ТУЛЗАМИ ZOOM ───
  let lastTool = null;
  let lastColor = null;

  function getVisible(selector) {
    return queryAllList(selector).filter(b => {
      // Надежная проверка видимости без привязки к пикселям (решает баг с offsetHeight === 0)
      const style = (b.ownerDocument?.defaultView || window).getComputedStyle(b);
      return style.display !== 'none' && style.visibility !== 'hidden' && b.offsetParent !== null;
    });
  }

  async function setZoomColor(colorIdx) {
    if (lastColor === colorIdx) return;
    const paletteBtns = getVisible('button[aria-label*="Цвет" i], button[aria-label*="Формат" i]');
    const paletteBtn = paletteBtns[0];
    if (!paletteBtn) { console.error("Palette btn not found"); return; }
    
    clickToolbarButton(paletteBtn);
    await new Promise(r => setTimeout(r, 200)); 
    
    const colorBtns = getVisible('.popover button[aria-label], [role="dialog"] button[aria-label], .dropdown-menu button[aria-label], [role="radiogroup"] button[aria-label]');
    let targetBtn = null;
    
    const targetLabel = labelMap[colorIdx];
    if (targetLabel) {
      targetBtn = colorBtns.find(b => (b.getAttribute('aria-label') || '').toLowerCase() === targetLabel.toLowerCase());
    }
    
    if (!targetBtn && colorBtns.length > colorIdx) targetBtn = colorBtns[colorIdx];
    
    if (targetBtn) {
      clickMenuReal(targetBtn, targetBtn.ownerDocument?.defaultView || window);
      lastColor = colorIdx;
      await new Promise(r => setTimeout(r, 100));
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  async function setZoomTool(toolName) {
    if (lastTool === toolName) return;
    
    // Если это ластик, он находится в главном меню, а не в меню фигур!
    if (toolName === 'eraser') {
      const eraserBtn = getVisible('button[aria-label="Ластик"], button[aria-label*="Eraser" i]')[0];
      if (eraserBtn) clickToolbarButton(eraserBtn);
      lastTool = toolName;
      await new Promise(r => setTimeout(r, 100));
      return;
    }

    const drawBtns = getVisible('button[aria-label="Рисовать"], button[aria-label*="Draw" i]');
    const drawBtn = drawBtns[0];
    if (!drawBtn) { console.error("Draw btn not found"); return; }
    
    clickToolbarButton(drawBtn);
    await new Promise(r => setTimeout(r, 200)); 
    
    const menuBtns = getVisible('.popover button, [role="menu"] button, .dropdown-menu button');
    let target = null;
    
    const exactLabels = {
      'line': ['Линия', 'Line'],
      'rect_empty': ['Прямоугольник', 'Rectangle'],
      'rect_solid': ['Закрашенный прямоугольник', 'Filled rectangle'],
      'ellipse_empty': ['Эллипс', 'Ellipse'],
      'ellipse_solid': ['Закрашенный эллипс', 'Filled ellipse']
    };
    
    const labels = exactLabels[toolName] || [];
    target = menuBtns.find(b => labels.includes(b.getAttribute('aria-label')));
    
    // Фолбек
    if (!target) {
      for (let b of menuBtns) {
        const a = (b.getAttribute('aria-label') || '').toLowerCase();
        if (!a) continue;
        if (toolName === 'line' && (a.includes('линия') || a.includes('line'))) target = b;
        else if (toolName === 'rect_empty' && a.includes('прямоугольник') && !a.includes('закраш')) target = b;
        else if (toolName === 'rect_solid' && a.includes('закраш') && a.includes('прямоугольник')) target = b;
        else if (toolName === 'ellipse_empty' && (a.includes('эллипс') || a.includes('круг')) && !a.includes('закраш')) target = b;
        else if (toolName === 'ellipse_solid' && a.includes('закраш') && (a.includes('эллипс') || a.includes('круг'))) target = b;
        if (target) break;
      }
    }
    
    if (target) {
      clickMenuReal(target, target.ownerDocument?.defaultView || window);
      lastTool = toolName;
      await new Promise(r => setTimeout(r, 100));
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
    
    if (stroke.tool === 'eraser') {
      canvas.dispatchEvent(mk('mouseup', stroke.x1, stroke.y1));
      await new Promise(r => setTimeout(r, 10));
      return;
    }
    
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
    
    // Автоматическое открытие панели аннотаций (клик по зеленому карандашу)
    const drawBtns = getVisible('button[aria-label="Рисовать"], button[aria-label*="Draw" i], .anno-toolbar');
    if (drawBtns.length === 0) {
      // Ищем везде (внутри iframe и снаружи)
      const svg = doc.querySelector('svg.SvgAnnotationBtn') || document.querySelector('svg.SvgAnnotationBtn');
      const trigger = doc.getElementById('anno-trigger') || document.getElementById('anno-trigger') ||
                      doc.querySelector('.anno-trigger') || document.querySelector('.anno-trigger') ||
                      (svg ? svg.closest('button') : null) || 
                      doc.querySelector('button[aria-label*="Комментир" i], button[aria-label*="Annot" i]') ||
                      document.querySelector('button[aria-label*="Комментир" i], button[aria-label*="Annot" i]');
      
      console.log("🔎 Поиск кнопки карандаша...", trigger);
      if (!trigger) {
         console.warn("⚠️ Кнопка карандаша не найдена в DOM!");
         alert("❌ Кнопка аннотаций не найдена на экране! Пожалуйста, откройте панель инструментов Zoom вручную (Настройки просмотра -> Комментировать) перед печатью.");
         return; // Останавливаем выполнение!
      } else {
        trigger.click();
        clickToolbarButton(trigger);
        
        // Ждем пока панель реально появится в DOM (до 2 секунд)
        let opened = false;
        for (let i = 0; i < 20; i++) {
          await new Promise(r => setTimeout(r, 100));
          const check = getVisible('button[aria-label="Рисовать"], button[aria-label*="Draw" i], .anno-toolbar');
          if (check.length > 0) { opened = true; break; }
        }
        
        if (!opened) {
           alert("❌ Не удалось автоматически открыть панель инструментов! Откройте её вручную.");
           return; // Останавливаем выполнение!
        }
        
        // --- АВТО-ЗАКРЕПЛЕНИЕ ПАНЕЛИ ---
        await new Promise(r => setTimeout(r, 400));
        // Ищем СТРОГО внутри панели аннотаций, чтобы не кликнуть по главному меню Зума (где реакции)
        const svgMore = doc.querySelector('.anno-toolbar .SvgMore') || document.querySelector('.anno-toolbar .SvgMore');
        const moreBtn = (svgMore ? svgMore.closest('button') : null) || getVisible('.anno-toolbar button[aria-label*="Параметры" i], .anno-toolbar button[aria-label*="Еще" i]')[0];
        
        if (moreBtn) {
          console.log("Кликаем по кнопке 'Параметры'...");
          // Открываем меню
          moreBtn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
          moreBtn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
          moreBtn.click();
          
          let pinBtn = null;
          for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 100));
            pinBtn = doc.querySelector('button[aria-label*="Закрепить" i], button[aria-label*="Pin" i]') || document.querySelector('button[aria-label*="Закрепить" i], button[aria-label*="Pin" i]');
            if (!pinBtn) {
              const dropdownBtns = getVisible('button, [role="menuitem"]');
              pinBtn = dropdownBtns.find(b => b.textContent && (b.textContent.includes('Закрепить') || b.textContent.includes('Pin')));
            }
            if (pinBtn) break;
          }
          
          console.log("Кнопка 'Закрепить' найдена:", pinBtn);
          if (pinBtn) {
            const isPinned = pinBtn.getAttribute('aria-checked') === 'true' || pinBtn.getAttribute('aria-selected') === 'true' || pinBtn.textContent.includes('✓') || pinBtn.innerHTML.includes('SvgCheck');
            console.log("Состояние закрепления:", isPinned);
            
            if (!isPinned) {
              pinBtn.dispatchEvent(new MouseEvent('mousedown', {bubbles: true}));
              pinBtn.dispatchEvent(new MouseEvent('mouseup', {bubbles: true}));
              pinBtn.click();
            } else {
              moreBtn.click(); // Закрываем меню
            }
            await new Promise(r => setTimeout(r, 300));
          } else {
            moreBtn.click(); // Закрываем меню, если не нашли
          }
        }
      }
    }
    
    const canvas = findUpperCanvas(doc) || findUpperCanvas(window.document);
    if (!canvas) { alert("❌ Холст Zoom не найден! Убедитесь, что открыты аннотации."); return; }
    
    let strokes = [];
    try { strokes = JSON.parse(artDataStr); } catch { alert("❌ Ошибка парсинга кода рисунка!"); return; }
    if (!Array.isArray(strokes) || !strokes.length) { alert("⚠ Код пуст."); return; }

    // ОПТИМИЗАЦИЯ СКОРОСТИ: Группируем штрихи по инструменту и цвету!
    // Так принтеру не придется открывать меню перед каждой линией.
    if (document.getElementById('zap-opt-sort')?.checked) {
      strokes.sort((a, b) => {
        const toolA = a.tool || '';
        const toolB = b.tool || '';
        if (toolA !== toolB) return toolA.localeCompare(toolB);
        return (a.color || 0) - (b.color || 0);
      });
    }

    const stat = document.getElementById('zap-status');
    const r = canvas.getBoundingClientRect();
    const offsetX = r.left, offsetY = r.top;

    lastTool = null; lastColor = null; // Сброс кэша

    for (let i = 0; i < strokes.length; i++) {
      if (stat) { stat.textContent = `Печатаю... (${i+1}/${strokes.length})`; stat.style.color = '#f59e0b'; }
      const s = strokes[i];
      
      // Переключаем инструмент и цвет, если нужно
      await setZoomColor(s.color !== undefined ? s.color : 1); // 1 = Red by default
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

  const labelMap = {
      0: 'White',
      1: 'Red',
      2: 'Yellow',
      3: 'Green',
      4: 'Blue',
      5: 'Light purple',
      6: 'Pink',
      7: 'Orange',
      8: 'Lime-tree green',
      9: 'Ice blue',
      10: 'Dark grey',
      11: 'Dark red',
      12: 'Brown',
      13: 'Dark green',
      14: 'Dark blue'
    };
    
    
  const COLOR_MAP = {
    0: '#ffffff',
    1: '#ff1919',
    2: '#ffde32',
    3: '#82c786',
    4: '#2e8cff',
    5: '#b479ff',
    6: '#ff38c7',
    7: '#ff8a00',
    8: '#49d61e',
    9: '#51d8eb',
    10: '#000000',
    11: '#7f0000',
    12: '#774408',
    13: '#0b7228',
    14: '#144fc3'
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

  
  // Находим оригинальный холст Зума (самый большой canvas на странице)
  function getZoomCanvasRect() {
    const topMargin = parseInt(document.getElementById('zap-margin-top')?.value || 0);
    const bottomMargin = parseInt(document.getElementById('zap-margin-bottom')?.value || 0);
    return {
      left: 0,
      top: topMargin,
      width: window.innerWidth,
      height: window.innerHeight - topMargin - bottomMargin
    };
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

      const stat = document.getElementById('zap-status');
      if (recordedStrokes.length > 0) {
        const r = getZoomCanvasRect();
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

      const getActiveTool = () => activeDraftTool;
      const getActiveColor = () => activeDraftColor;

            recordingCanvas.addEventListener('mousedown', e => {
        const tool = getActiveTool();
        
        if (tool === 'bucket') {
          const zRect = getZoomCanvasRect();
          recordedStrokes.push({ 
            tool: 'rect_solid', color: getActiveColor(), 
            absX1: zRect.left, absY1: zRect.top, 
            absX2: zRect.left + zRect.width, absY2: zRect.top + zRect.height 
          });
          renderRecording();
          return;
        }
        
        if (tool === 'eraser') {
          // Ищем фигуру под курсором (удаление объектов как в Зуме)
          let hitIdx = -1;
          for (let i = recordedStrokes.length - 1; i >= 0; i--) {
            const s = recordedStrokes[i];
            const minX = Math.min(s.absX1, s.absX2) - 15, maxX = Math.max(s.absX1, s.absX2) + 15;
            const minY = Math.min(s.absY1, s.absY2) - 15, maxY = Math.max(s.absY1, s.absY2) + 15;
            if (e.clientX >= minX && e.clientX <= maxX && e.clientY >= minY && e.clientY <= maxY) {
              hitIdx = i; break;
            }
          }
          if (hitIdx !== -1) {
            recordedStrokes.splice(hitIdx, 1); // Удаляем из кода
            renderRecording();
          } // Больше никаких записей ластика в итоговый код. Ластик существует только для черновика!
          return;
        }
        
        currentStroke = { 
          tool: tool, color: getActiveColor(),
          absX1: e.clientX, absY1: e.clientY, absX2: e.clientX, absY2: e.clientY 
        };
        renderRecording();
      });
      recordingCanvas.addEventListener('mousemove', e => {
        if (currentStroke && currentStroke.tool !== 'eraser') {
          currentStroke.absX2 = e.clientX;
          currentStroke.absY2 = e.clientY;
          renderRecording();
        }
      });
      recordingCanvas.addEventListener('mouseup', e => {
        if (currentStroke && currentStroke.tool !== 'eraser') {
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
  
  let activeDraftTool = 'line';
  let activeDraftColor = 10; // Black

  window.openZArtPrinter = function() {
    const oldWidget = document.getElementById('zoom-art-printer-widget');
    if (oldWidget) oldWidget.remove();
    const oldCanvas = document.getElementById('zap-recording-canvas');
    if (oldCanvas) oldCanvas.remove();

    const w = document.createElement('div');
    w.id = 'zoom-art-printer-widget';
    w.style.cssText = `
      position: fixed; top: 80px; right: 20px; z-index: 999999;
      background: #111116; border: 1px solid #3730a3; border-radius: 8px;
      padding: 12px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; color: #fff; width: 280px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.8);
    `;
    
    // Внедряем CSS для новых красивых кнопок
    const style = document.createElement('style');
    style.textContent = `
      .zap-tb { width: 32px; height: 32px; border: 1px solid #3730a3; background: #1e1e24; color: #fff; cursor: pointer; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: 0.1s; }
      .zap-tb:hover { background: #2d2d36; }
      .zap-tb.active { background: #4f46e5; border-color: #818cf8; transform: scale(1.05); }
      .zap-cb { width: 22px; height: 22px; border: 1px solid #555; cursor: pointer; border-radius: 50%; transition: 0.1s; }
      .zap-cb:hover { transform: scale(1.1); }
      .zap-cb.active { border: 2px solid #fff; transform: scale(1.15); box-shadow: 0 0 5px rgba(255,255,255,0.5); }
    `;
    w.appendChild(style);

    w.innerHTML += `
      <div style="font-size: 14px; font-weight: bold; margin-bottom: 12px; color: #c7d2fe; display:flex; justify-content:space-between; border-bottom: 1px solid #3730a3; padding-bottom: 6px;">
        <span>🎨 Z-Art Studio <span style="font-size:10px;color:#818cf8">v2.3</span></span>
        <div style="display:flex; gap: 16px; align-items: center;">
            <button id="zap-clear-zoom-btn" title="Очистить рисунки в Zoom" style="background:transparent; border:none; color:#f87171; cursor:pointer; padding:0;">🗑️</button>
            <button id="zap-close-modal-btn" title="Закрыть Принтер" style="background:transparent; border:none; color:#f87171; cursor:pointer; padding:0; font-weight:bold;">❌</button>
        </div>
      </div>
      <div id="zap-widget-body">
      
      <div id="zap-draft-tools" style="display:none; flex-direction:column; gap: 10px; margin-bottom: 12px; background: #1a1a21; padding: 8px; border-radius: 6px;">
        <!-- Кисти -->
        <div id="zap-tool-palette" style="display:flex; gap:6px; flex-wrap:wrap;">
          <button class="zap-tb active" data-val="line" title="Линия">📏</button>
          <button class="zap-tb" data-val="rect_empty" title="Пустой квадрат">⬜</button>
          <button class="zap-tb" data-val="rect_solid" title="Залитый квадрат">⬛</button>
          <button class="zap-tb" data-val="ellipse_empty" title="Пустой круг">⭕</button>
          <button class="zap-tb" data-val="ellipse_solid" title="Залитый круг">🔴</button>
          <button class="zap-tb" data-val="eraser" title="Ластик">🧽</button>
          <button class="zap-tb" data-val="bucket" title="Заливка экрана">🪣</button>
        </div>
        <!-- Цвета -->
        <div id="zap-color-palette" style="display:flex; gap:6px; flex-wrap:wrap;">
        </div>
      </div>

      <div style="margin-bottom: 8px; background: #1a1a21; padding: 6px 8px; border-radius: 6px;">
         <div style="display:flex; justify-content:space-between; margin-bottom:6px; color:#818cf8; font-size:10px;">
           <label>Отступ сверху: <input id="zap-margin-top" type="number" value="227" style="width:36px; background:#0d0d10; color:#fff; border:1px solid #3730a3; border-radius:3px; padding:2px;"></label>
           <label>Снизу: <input id="zap-margin-bottom" type="number" value="59" style="width:36px; background:#0d0d10; color:#fff; border:1px solid #3730a3; border-radius:3px; padding:2px;"></label>
         </div>
         <label style="font-size: 11px; color: #a5b4fc; display: flex; align-items: center; gap: 6px; cursor: pointer;">
           <input type="checkbox" id="zap-opt-sort" style="cursor: pointer; width: 14px; height: 14px;">
           <span>Быстрая печать (сбивает слои)</span>
         </label>
      </div>

      <button id="zap-record-btn" style="width: 100%; margin-bottom: 8px; padding: 8px; background: #dc2626; border: none; border-radius: 6px; color: #fff; font-weight: bold; font-size: 12px; cursor: pointer; transition: 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🔴 Начать черновик (Запись)</button>
      <textarea id="zap-code" style="width: 100%; height: 70px; background: #0d0d10; color: #818cf8; border: 1px solid #3730a3; border-radius: 6px; padding: 6px; font-size: 10px; resize: none; box-sizing: border-box; font-family: monospace;" placeholder="Здесь появится JSON-код..."></textarea>
      <button id="zap-print-btn" style="width: 100%; margin-top: 8px; padding: 8px; background: #4f46e5; border: none; border-radius: 6px; color: #fff; font-weight: bold; font-size: 12px; cursor: pointer; transition: 0.2s; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🚀 Напечатать на холсте</button>
      <div id="zap-status" style="margin-top: 8px; font-size: 11px; text-align: center; min-height: 14px; font-weight: bold;"></div>
      </div>
    `;
    document.body.appendChild(w);

    // Инициализация палитры цветов
    const colorPalette = document.getElementById('zap-color-palette');
    const colorOrder = [10, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14];
    colorOrder.forEach(c => {
      const btn = document.createElement('div');
      btn.className = 'zap-cb' + (c === activeDraftColor ? ' active' : '');
      btn.style.backgroundColor = COLOR_MAP[c];
      btn.dataset.val = c;
      btn.title = labelMap[c];
      colorPalette.appendChild(btn);
    });

    // Обработчики кликов по инструментам
    document.querySelectorAll('.zap-tb').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.zap-tb').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        activeDraftTool = e.currentTarget.dataset.val;
      });
    });

    // Обработчики кликов по цветам
    document.querySelectorAll('.zap-cb').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('.zap-cb').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        activeDraftColor = parseInt(e.currentTarget.dataset.val);
      });
    });

    document.getElementById('zap-record-btn').addEventListener('click', toggleRecording);
    
    
    // Логика сворачивания
    document.getElementById('zap-close-modal-btn').addEventListener('click', () => {
      const w = document.getElementById('zoom-art-printer-widget');
      if (w) w.remove();
      
      const rCanvas = document.getElementById('zap-recording-canvas');
      if (rCanvas) rCanvas.remove();
      
      isRecording = false;
      recordedStrokes = [];
    });

    // Логика очистки экрана Zoom (Корзина)
    document.getElementById('zap-clear-zoom-btn').addEventListener('click', async () => {
      const drawBtns = getVisible('button[aria-label="Рисовать"], button[aria-label*="Draw" i], .anno-toolbar');
      if (drawBtns.length === 0) {
        alert("❌ Откройте панель инструментов Zoom перед очисткой!");
        return;
      }
      
      const trashBtn = getVisible('button:has(svg.SvgClear), button[aria-label*="Очистить" i], button[aria-label*="Clear" i]')[0];
      if (!trashBtn) {
        alert("❌ Кнопка 'Очистить' (Корзина) не найдена на панели Zoom!");
        return;
      }
      clickToolbarButton(trashBtn);
      await new Promise(r => setTimeout(r, 200));
      
      const clearAllBtns = getVisible('button, [role="menuitem"], .popover span, .popover div');
      const clearAllBtn = clearAllBtns.find(b => b.textContent && (b.textContent.includes('все') || b.textContent.includes('All') || b.textContent.includes('Очистить')));
      if (clearAllBtn) {
        clickToolbarButton(clearAllBtn);
      }
      
      const stat = document.getElementById('zap-status');
      if (stat) { stat.textContent = `🧹 Холст очищен!`; stat.style.color = '#10b981'; }
    });

    document.getElementById('zap-print-btn').addEventListener('click', () => {
      const code = document.getElementById('zap-code').value.trim();
      if (!code) { alert("Вставьте код рисунка!"); return; }
      printZart(code);
    });
  }


  // === ИМИТАЦИЯ ВАШЕГО ГЛАВНОГО МЕНЮ ===
  function initDummyLauncher() {
    if (document.getElementById('zap-dummy-launcher')) return;
    const btn = document.createElement('button');
    btn.id = 'zap-dummy-launcher';
    btn.innerText = '🎨 Открыть Принтер';
    btn.style.cssText = 'position:fixed; top:20px; left:20px; z-index:9999998; padding:10px 15px; background:#4f46e5; color:#fff; border:none; border-radius:6px; cursor:pointer; font-weight:bold; box-shadow:0 4px 10px rgba(0,0,0,0.5);';
    btn.onclick = window.openZArtPrinter;
    document.body.appendChild(btn);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initDummyLauncher);
  else initDummyLauncher();
})();
