// ==UserScript==
// @name         Zoom Tools — Dark Edition (Rename + Завеса + Аватарки + Flood + Мониторинг + Рука)
// @namespace    zoom-tools
// @version      1.0.0
// @description  Темная тема, Завеса демонстрации, Дискотека, Рулетка ников, невидимый ник, прозрачная аватарка, WS спам, Мониторинг, Спам рукой, Инспектор митинга
// @match        https://app.zoom.us/*
// @match        https://*.zoom.us/wc/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  if (typeof window.__zt_cleanup === 'function') {
    try { window.__zt_cleanup(); } catch {}
  }

  // ══════════════════════════════════════════════
  // ЛОКАЛИЗАЦИЯ (RU / EN)
  // ══════════════════════════════════════════════
  let _ztLang = 'ru';
  try { _ztLang = sessionStorage.getItem('zt_lang') || 'ru'; } catch {}
  const T = (ru, en) => (_ztLang === 'en' ? en : ru);

  const MOD_SOCKET = 61142;
  const MOD_EVENTS = 22371;

  // Знаменитый невидимый символ (Hangul Filler), используемый на blanktext и работающий в Zoom
  const INVISIBLE_NICK = '\u3164';

  const isGhostNick = n => {
    if (!n) return false;
    return n === INVISIBLE_NICK || /^[\s\u3164\u2800\u200B-\u200D\uFEFF]+$/.test(n);
  };

  // ══════════════════════════════════════════════
  // ЯДРО & СЕТЬ (МУЛЬТИФРЕЙМОВОЕ ОБНАРУЖЕНИЕ)
  // ══════════════════════════════════════════════
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
    if (window.webpackChunkwebclient || document.querySelector('#root')) {
      return window;
    }
    try {
      if (window.parent && window.parent !== window && (window.parent.webpackChunkwebclient || window.parent.document?.querySelector('#root'))) {
        return window.parent;
      }
    } catch {}
    return null;
  };

  const getReq = iwin => {
    const winList = [iwin, window];
    try {
      const el = document.getElementById('webclient')?.contentWindow;
      if (el && !winList.includes(el)) winList.push(el);
    } catch {}
    for (const w of winList) {
      if (w?.webpackChunkwebclient) {
        let r = null;
        try {
          w.webpackChunkwebclient.push([[Symbol()], {}, x => { r = x; }]);
          if (r) return r;
        } catch {}
      }
    }
    return null;
  };

  let _cachedStore = null;

  function findStoreInWindow(w) {
    if (!w) return null;
    try {
      const doc = w.document;
      if (!doc) return null;

      const candidates = [
        doc.querySelector('#root'),
        doc.querySelector('#app-root'),
        doc.querySelector('#wc-container-left'),
        doc.querySelector('[id*="root"]'),
        doc.body
      ].filter(Boolean);

      for (const el of candidates) {
        const fk = Object.keys(el).find(k => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'));
        if (!fk || !el[fk]) continue;

        const queue = [el[fk]], vis = new WeakSet();
        let steps = 0;
        while (queue.length && steps < 1200) {
          steps++;
          const n = queue.shift();
          if (!n || vis.has(n)) continue;
          vis.add(n);

          for (const s of [n.memoizedProps?.store, n.memoizedProps?.value?.store, n.stateNode?.store]) {
            if (typeof s?.dispatch === 'function' && typeof s?.getState === 'function') {
              return s;
            }
          }
          if (n.child) queue.push(n.child);
          if (n.sibling) queue.push(n.sibling);
        }
      }

      // Дополнительный поиск по элементам div с react
      const allDivs = doc.querySelectorAll('div');
      for (let i = 0; i < Math.min(allDivs.length, 40); i++) {
        const d = allDivs[i];
        const fk = Object.keys(d).find(k => k.startsWith('__reactContainer$') || k.startsWith('__reactFiber$'));
        if (!fk || !d[fk]) continue;
        const queue = [d[fk]], vis = new WeakSet();
        let steps = 0;
        while (queue.length && steps < 600) {
          steps++;
          const n = queue.shift();
          if (!n || vis.has(n)) continue;
          vis.add(n);
          for (const s of [n.memoizedProps?.store, n.memoizedProps?.value?.store, n.stateNode?.store]) {
            if (typeof s?.dispatch === 'function' && typeof s?.getState === 'function') {
              return s;
            }
          }
          if (n.child) queue.push(n.child);
          if (n.sibling) queue.push(n.sibling);
        }
      }
    } catch {}
    return null;
  }

  function getStore(iwin) {
    if (_cachedStore && typeof _cachedStore.getState === 'function') {
      try {
        if (_cachedStore.getState()) return _cachedStore;
      } catch {}
    }

    const winList = [];
    if (iwin) winList.push(iwin);
    try {
      const ifr = document.getElementById('webclient')?.contentWindow;
      if (ifr && !winList.includes(ifr)) winList.push(ifr);
    } catch {}
    if (!winList.includes(window)) winList.push(window);
    try {
      if (window.top && !winList.includes(window.top)) winList.push(window.top);
      if (window.parent && !winList.includes(window.parent)) winList.push(window.parent);
      document.querySelectorAll('iframe').forEach(f => {
        try {
          if (f.contentWindow && !winList.includes(f.contentWindow)) winList.push(f.contentWindow);
        } catch {}
      });
    } catch {}

    for (const w of winList) {
      const s = findStoreInWindow(w);
      if (s) {
        _cachedStore = s;
        return s;
      }
    }
    return null;
  }

  const getCurrentUser = store => store?.getState()?.meeting?.currentUser ?? null;

  function getHostNick(store) {
    if (!store) return null;
    const attendees = store.getState()?.attendeesList?.attendeesList ?? [];
    const list = Array.isArray(attendees) ? attendees : Object.values(attendees);
    const host = list.find(a => a.isHost);
    return host?.displayName || null;
  }

  // Безопасный клик по кнопкам тулбара Zoom (БЕЗ mousedown и БЕЗ всплытия, чтобы react-draggable НЕ залипал!)
  function clickToolbarButton(btn) {
    if (!btn) return false;
    try {
      btn.focus?.();
      btn.dispatchEvent(new MouseEvent('click', { bubbles: false, cancelable: true, view: window }));
      btn.click?.();
      return true;
    } catch (e) {
      console.warn('[ZT] clickToolbarButton error:', e);
      return false;
    }
  }

  // Клик для компонентов React-Aria (палитра / дропдауны)
  function clickMenuReal(el, win = window) {
    if (!el) return;
    const evts = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
    evts.forEach(t => {
      try {
        el.dispatchEvent(new win.MouseEvent(t, { bubbles: true, cancelable: true, view: win, buttons: t.includes('up') || t === 'click' ? 0 : 1 }));
      } catch {}
    });
    try { el.click?.(); } catch {}
  }

  function getAllDocs() {
    const docs = [window.document];
    const iwin = getIwin();
    if (iwin?.document && !docs.includes(iwin.document)) {
      docs.push(iwin.document);
    }
    try {
      document.querySelectorAll('iframe').forEach(f => {
        try {
          if (f.contentDocument && !docs.includes(f.contentDocument)) {
            docs.push(f.contentDocument);
          }
        } catch {}
      });
    } catch {}
    if (window.parent && window.parent !== window) {
      try {
        if (!docs.includes(window.parent.document)) docs.push(window.parent.document);
      } catch {}
    }
    return docs;
  }

  function queryAll(selector) {
    for (const d of getAllDocs()) {
      const el = d.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function queryAllList(selector) {
    const res = [];
    for (const d of getAllDocs()) {
      res.push(...d.querySelectorAll(selector));
    }
    return res;
  }

  // RENAME & ИСТОРИЯ НИКОВ (ОЧИЩАЕТСЯ ПОСЛЕ КАЖДОГО СЕАНСА)
  try { localStorage.removeItem('zt_recent_nicks'); } catch {}

  function getRecentNicks() {
    try {
      const raw = JSON.parse(sessionStorage.getItem('zt_recent_nicks') || '[]');
      let list = Array.isArray(raw)
        ? raw.filter(n => typeof n === 'string' && (isGhostNick(n) || n.trim().length > 0))
        : [];
      if (!list.some(isGhostNick)) {
        list.unshift(INVISIBLE_NICK);
      }
      return list;
    } catch {
      return [INVISIBLE_NICK];
    }
  }

  function addRecentNick(nick) {
    if (!nick || typeof nick !== 'string') return;
    const isGhost = isGhostNick(nick);
    const val = isGhost ? INVISIBLE_NICK : nick.trim();
    if (!val) return;

    let list = getRecentNicks().filter(n => isGhost ? !isGhostNick(n) : n !== val);
    list.unshift(val);
    if (list.length > 7) list = list.slice(0, 7);
    try { sessionStorage.setItem('zt_recent_nicks', JSON.stringify(list)); } catch {}
    renderRecentNicks();
  }

  function clearRecentNicks() {
    try {
      sessionStorage.setItem('zt_recent_nicks', JSON.stringify([INVISIBLE_NICK]));
      localStorage.removeItem('zt_recent_nicks');
    } catch {}
    renderRecentNicks();
  }

  window.addEventListener('beforeunload', () => {
    try {
      sessionStorage.removeItem('zt_recent_nicks');
      localStorage.removeItem('zt_recent_nicks');
    } catch {}
  });

  function renderRecentNicks() {
    const cRename = document.getElementById('zt-recent-nicks');
    const cStora  = document.getElementById('zt-stora-recent-nicks');
    const list = getRecentNicks();

    if (cRename) {
      cRename.innerHTML = '';
      list.forEach(n => {
        const isGhost = isGhostNick(n);
        const chip = document.createElement('span');
        chip.className = 'zt-chip' + (isGhost ? ' ghost' : '');
        chip.textContent = isGhost ? T('👻 [ㅤ]', '👻 [Ghost]') : (n.length > 12 ? n.slice(0, 11) + '…' : n);
        chip.title = isGhost ? T('Поставить невидимый символ (Hangul Filler \\u3164)', 'Set invisible symbol (Hangul Filler \\u3164)') : T(`Подставить "${n}"`, `Set "${n}"`);
        chip.addEventListener('click', () => {
          const inp = document.getElementById('zt-name');
          if (inp) {
            inp.value = isGhost ? INVISIBLE_NICK : n;
            const charEl = document.getElementById('zt-char');
            if (charEl) {
              if (isGhost) {
                charEl.textContent = T('👻 Невидимка (1/80)', '👻 Ghost (1/80)');
                charEl.style.color = '#a855f7';
              } else {
                charEl.textContent = `${inp.value.length}/80`;
                charEl.style.color = '#52525b';
              }
            }
            if (isGhost) showStatus(T('👻 Невидимый ник выбран (нажми ✓)', '👻 Invisible nick selected (click ✓)'), '#a855f7');
          }
        });
        cRename.appendChild(chip);
      });
    }

    if (cStora) {
      cStora.innerHTML = '';
      list.forEach(n => {
        const isGhost = isGhostNick(n);
        const chip = document.createElement('span');
        chip.className = 'zt-chip' + (isGhost ? ' ghost' : '');
        chip.textContent = isGhost ? T('👻 [ㅤ]', '👻 [Ghost]') : (n.length > 10 ? n.slice(0, 9) + '…' : n);
        chip.title = isGhost ? T('Невидимый ник для завесы (Hangul Filler \\u3164)', 'Invisible nickname for curtain (Hangul Filler \\u3164)') : T(`В завесу: "${n}"`, `To curtain: "${n}"`);
        chip.addEventListener('click', () => {
          const inp = document.getElementById('zt-temp-nick');
          if (inp) {
            inp.value = isGhost ? INVISIBLE_NICK : n;
            showStatus(T(`🎭 Ник для завесы: ${isGhost ? '👻 [Невидимка]' : `"${n}"`}`, `🎭 Curtain nick: ${isGhost ? '👻 [Ghost]' : `"${n}"`}`), '#a855f7');
          }
        });
        cStora.appendChild(chip);
      });
    }
  }

  function doRename(newName, oldName, req, store, addToRecent = true) {
    const ac = req?.(MOD_SOCKET)?.h;
    const enc = n => btoa(unescape(encodeURIComponent(n)));
    if (!ac || !store) return false;
    store.dispatch(ac({
      evt: req(MOD_EVENTS).WS_CONF_RENAME_REQ,
      body: { id: getCurrentUser(store)?.userId, dn2: enc(newName), olddn2: enc(oldName) }
    }));
    if (addToRecent) addRecentNick(newName);
    return true;
  }

  // ══════════════════════════════════════════════
  // РУЛЕТКА НИКОВ (ХАМЕЛЕОН)
  // ══════════════════════════════════════════════
  let _mimicTimer = null;
  let _mimicActive = false;
  let _lastMimicNick = '';
  let _mimicSpeed = 750;
  try {
    const s = parseInt(sessionStorage.getItem('zt_mimic_speed'), 10);
    if (s >= 100 && s <= 5000) _mimicSpeed = s;
  } catch {}

  function getOtherAttendees(store) {
    if (!store) return [];
    const raw = store.getState()?.attendeesList?.attendeesList ?? [];
    const list = Array.isArray(raw) ? raw : Object.values(raw);
    const me = getCurrentUser(store);
    const myId = me?.userId;

    const others = [];
    const seen = new Set();
    for (const a of list) {
      if (!a) continue;
      const id = a.userId ?? a.id;
      if (myId != null && id === myId) continue;
      if (a === me) continue;
      const name = (a.displayName || '').trim();
      if (!name) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      others.push(name);
    }
    return others;
  }

  function pickRandomAttendeeNick(store) {
    const others = getOtherAttendees(store);
    if (!others.length) return null;
    if (others.length === 1) return others[0];
    const candidates = others.filter(n => n !== _lastMimicNick);
    const pool = candidates.length ? candidates : others;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    _lastMimicNick = chosen;
    return chosen;
  }

  function updateMimicUI(active) {
    const sw = document.getElementById('zt-mimic-toggle');
    if (sw) sw.checked = active;
    const stText = document.getElementById('zt-mimic-status-text');
    if (stText) {
      stText.textContent = active ? `🟢 ${T('ВКЛ', 'ON')}` : T('ВЫКЛ', 'OFF');
      stText.style.color = active ? '#10b981' : '#71717a';
    }
  }

  function updateMimicSpeedUI() {
    const valEl = document.getElementById('zt-mimic-speed-val');
    if (valEl) {
      valEl.textContent = _mimicSpeed >= 1000
        ? (_mimicSpeed / 1000).toFixed(1) + T('с', 's')
        : _mimicSpeed + T('мс', 'ms');
    }
    const btns = [
      { id: 'zt-mimic-spd-turbo', spd: 200 },
      { id: 'zt-mimic-spd-fast',  spd: 400 },
      { id: 'zt-mimic-spd-norm',  spd: 750 },
      { id: 'zt-mimic-spd-slow',  spd: 1500 }
    ];
    btns.forEach(b => {
      const el = document.getElementById(b.id);
      if (el) {
        if (_mimicSpeed === b.spd) {
          el.style.borderColor = '#10b981';
          el.style.color = '#fff';
          el.style.fontWeight = '700';
        } else {
          el.style.borderColor = '#27272f';
          el.style.color = '#a1a1aa';
          el.style.fontWeight = '600';
        }
      }
    });
  }

  function setMimicSpeed(ms) {
    if (typeof ms !== 'number' || ms < 100) ms = 750;
    _mimicSpeed = ms;
    try { sessionStorage.setItem('zt_mimic_speed', ms); } catch {}
    updateMimicSpeedUI();
    if (_mimicActive) {
      if (_mimicTimer) clearInterval(_mimicTimer);
      _mimicTimer = setInterval(tickMimic, _mimicSpeed);
    }
    showStatus(T(`⚡ Скорость рулетки: ${_mimicSpeed}мс`, `⚡ Roulette speed: ${_mimicSpeed}ms`), '#10b981');
  }

  function stopMimicRoulette() {
    if (_mimicTimer) {
      clearInterval(_mimicTimer);
      _mimicTimer = null;
    }
    _mimicActive = false;
    updateMimicUI(false);
  }

  function tickMimic() {
    if (!_mimicActive) return;
    const curIwin = getIwin();
    const curStore = getStore(curIwin);
    const curReq = getReq(curIwin);
    if (!curStore || !curReq) return;
    const nick = pickRandomAttendeeNick(curStore);
    if (!nick) {
      stopMimicRoulette();
      showStatus(T('⚠ Все участники вышли, рулетка остановлена', '⚠ All attendees left, roulette stopped'), '#f59e0b');
      return;
    }
    const me = getCurrentUser(curStore);
    const curNick = me?.displayName ?? '';
    if (nick !== curNick) {
      doRename(nick, curNick, curReq, curStore, false);
    }
  }

  function startMimicRoulette(speed = _mimicSpeed) {
    const iwin = getIwin(), req = getReq(iwin), store = getStore(iwin);
    if (!store || !req) {
      showStatus(T('❌ Войди в митинг', '❌ Join a meeting first'), '#ef4444');
      stopMimicRoulette();
      return false;
    }
    const others = getOtherAttendees(store);
    if (!others.length) {
      showStatus(T('⚠ Нет других участников в митинге', '⚠ No other attendees in meeting'), '#f59e0b');
      stopMimicRoulette();
      return false;
    }

    if (speed && typeof speed === 'number' && speed >= 100) {
      _mimicSpeed = speed;
      try { sessionStorage.setItem('zt_mimic_speed', speed); } catch {}
    }

    _mimicActive = true;
    updateMimicUI(true);
    updateMimicSpeedUI();
    showStatus(T(`🔀 Рулетка ников (${_mimicSpeed}мс)`, `🔀 Nick roulette (${_mimicSpeed}ms)`), '#10b981');

    tickMimic();
    if (_mimicTimer) clearInterval(_mimicTimer);
    _mimicTimer = setInterval(tickMimic, _mimicSpeed);
    return true;
  }

  function toggleMimicRoulette() {
    if (_mimicActive) {
      stopMimicRoulette();
      showStatus(T('⏹ Рулетка ников остановлена', '⏹ Nick roulette stopped'), '#71717a');
      return false;
    } else {
      return startMimicRoulette();
    }
  }

  // ══════════════════════════════════════════════
  // ЗАВЕСА ДЕМОНСТРАЦИИ & ИНСТРУМЕНТЫ АННОТАЦИЙ
  // ══════════════════════════════════════════════
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

  function findAnnoToolbar() {
    return queryAll('.anno-toolbar, [class*="anno-toolbar"]');
  }

  async function ensureAnnoOpen() {
    if (findAnnoToolbar()) return true;
    const trigger = queryAll('#anno-trigger, button[aria-label*="Аннот" i], button[aria-label*="Коммент" i], button[title*="Коммент" i]');
    if (trigger) {
      clickToolbarButton(trigger);
      await new Promise(r => setTimeout(r, 200));
      return !!findAnnoToolbar();
    }
    return false;
  }

  function ensureRectActive() {
    const drawBtn = queryAll('[class*="anno-toolbar__item--draw"] button, button[aria-label*="Рисовать" i], button[aria-label*="прямоугольник" i]');
    if (drawBtn) {
      clickToolbarButton(drawBtn);
      return true;
    }
    return false;
  }

  function resetToMouseTool() {
    const mouseBtn = queryAll('button[aria-label*="Мышь" i], [class*="anno-toolbar"] [aria-label*="Мышь" i], button[aria-label*="Mouse" i]');
    if (mouseBtn) {
      clickToolbarButton(mouseBtn);
      console.log('[ZT] Инструмент сброшен на: Мышь (безопасно)');
      return true;
    }
    return false;
  }

  // 1. Выбор цвета: Dark grey (1-й кружок в 3-м ряду палитры Zoom)
  async function selectPaletteDarkGrey() {
    const paletteBtn = queryAll('[class*="anno-toolbar__item--palette"] button, button[aria-label*="Цвет" i]');
    if (!paletteBtn) return false;

    const win = paletteBtn.ownerDocument.defaultView || window;
    clickToolbarButton(paletteBtn);
    await new Promise(r => setTimeout(r, 120));

    const colorButtons = queryAllList('[role="dialog"] button, .popover button, [class*="palette"] button, [class*="color-picker"] button');
    let targetBtn = colorButtons.find(b => {
      const a = (b.getAttribute('aria-label') || b.title || '').toLowerCase();
      return a.includes('dark grey') || a.includes('темно-сер') || a.includes('черн') || a.includes('black');
    });

    if (!targetBtn && colorButtons.length >= 11) {
      targetBtn = colorButtons[10]; // Индекс 10 (Ряд 3, Колонка 1)
    }

    if (targetBtn) {
      clickMenuReal(targetBtn, targetBtn.ownerDocument.defaultView || win);
      console.log('[ZT] Выбран цвет: Dark grey (палитра)');
      await new Promise(r => setTimeout(r, 100));
      return true;
    } else {
      clickToolbarButton(paletteBtn);
      await new Promise(r => setTimeout(r, 80));
      return false;
    }
  }

  // 2. Выбор фигуры Закрашенный прямоугольник
  async function selectFilledRectTool() {
    const drawBtn = queryAll('[class*="anno-toolbar__item--draw"] button, button[aria-label*="Рисовать" i]');
    if (!drawBtn) return false;

    const win = drawBtn.ownerDocument.defaultView || window;
    clickToolbarButton(drawBtn);
    await new Promise(r => setTimeout(r, 120));

    const menuButtons = queryAllList('[role="menu"] button, .dropdown-menu button, .popover button');
    const rectBtn = menuButtons.find(b => {
      const a = (b.getAttribute('aria-label') || b.title || '').toLowerCase();
      return a.includes('закрашенный прямоугольник') || a.includes('заполненный прямоугольник') || a.includes('filled rectangle');
    });

    if (rectBtn) {
      clickMenuReal(rectBtn, rectBtn.ownerDocument.defaultView || win);
      console.log('[ZT] Выбрана фигура: Закрашенный прямоугольник');
      await new Promise(r => setTimeout(r, 100));
    }

    return true;
  }

  async function prepareStoraTools() {
    await ensureAnnoOpen();
    const tb = findAnnoToolbar();
    if (!tb) return false;
    await selectPaletteDarkGrey();
    await selectFilledRectTool();
    return true;
  }

  function drawFillRect(iwin, offset = 0) {
    const doc = iwin?.document || document;
    const canvas = findUpperCanvas(doc) || findUpperCanvas(window.document);
    if (!canvas) {
      console.error('[ZT] Ошибка: Canvas аннотаций (.upper-canvas) не найден!');
      return false;
    }

    // Wake-up
    try {
      canvas.focus?.();
      canvas.dispatchEvent(new iwin.Event('pointerenter', { bubbles: true }));
      canvas.dispatchEvent(new iwin.WheelEvent('wheel', { bubbles: true, deltaY: 0 }));
    } catch {}

    const r = canvas.getBoundingClientRect();
    const x1 = Math.round(r.left - offset);
    const y1 = Math.round(r.top - offset);
    const x2 = Math.round(r.right + offset);
    const y2 = Math.round(r.bottom + offset);

    console.log(`[ZT] Холст: [x:${Math.round(r.left)}, y:${Math.round(r.top)}, w:${Math.round(r.width)}, h:${Math.round(r.height)}]`);
    console.log(`[ZT] Бросок: (${x1}, ${y1}) ➔ (${x2}, ${y2}) | отступ: ${offset}px`);

    const mk = (t, x, y) => new (iwin?.MouseEvent || MouseEvent)(t, {
      bubbles: true, cancelable: true, view: iwin || window,
      clientX: x, clientY: y, button: 0, buttons: t === 'mouseup' ? 0 : 1
    });

    canvas.dispatchEvent(mk('mousemove', x1, y1));
    canvas.dispatchEvent(mk('mousedown', x1, y1));
    setTimeout(() => {
      for (let i = 1; i <= 20; i++) {
        const t = i / 20;
        doc.dispatchEvent(mk('mousemove', x1 + (x2 - x1) * t, y1 + (y2 - y1) * t));
      }
      setTimeout(() => {
        doc.dispatchEvent(mk('mouseup', x2, y2));
        console.log('[ZT] ✅ Бросок успешно завершен!');
      }, 30);
    }, 30);
    return true;
  }

  async function runStora(tempNick, req, store, iwin, autoSetup = false, offset = 0) {
    const me = getCurrentUser(store), orig = me?.displayName ?? '';
    const shouldRestore = document.getElementById('zt-stora-restore')?.checked ?? true;
    console.log(`[ZT] Запуск runStora (autoSetup=${autoSetup}, offset=${offset}, restore=${shouldRestore})`);

    if (autoSetup) {
      showStatus(T('⚙ Настройка кисти...', '⚙ Configuring brush...'), '#8e8e99');
      await prepareStoraTools();
    } else {
      ensureRectActive();
    }

    const doDraw = () => {
      if (!drawFillRect(iwin, offset)) {
        showStatus(T('❌ Открой «Комментировать» (или хост отключил)', '❌ Open «Annotate» (or host disabled it)'), '#ef4444');
        return;
      }
      const isGhost = isGhostNick(tempNick);
      showStatus(isGhost ? T('⬛ Завеса активна (👻 Невидимка)!', '⬛ Screen curtain active (👻 Invisible)!') : T('⬛ Завеса активна!', '⬛ Screen curtain active!'), '#10b981');

      setTimeout(() => {
        resetToMouseTool();
      }, 350);

      if (shouldRestore && tempNick && tempNick !== orig) {
        setTimeout(() => doRename(orig, tempNick, req, store), 900);
      }
    };

    if (tempNick && tempNick !== orig) {
      doRename(tempNick, orig, req, store);
      setTimeout(doDraw, autoSetup ? 250 : 80);
    } else {
      doDraw();
    }
  }

  async function clearAllAnno() {
    console.log('[ZT] Полная очистка всех слоев аннотации (Корзина)...');
    // Ищем кнопку Корзины в тулбаре аннотаций
    const clearBtn = queryAll(
      '[class*="anno-toolbar__item--clear"] button, ' +
      'button[aria-label*="Очистить" i], ' +
      'button[aria-label*="Clear" i], ' +
      '[class*="anno-toolbar"] [class*="clear"] button, ' +
      '[class*="anno-toolbar"] button[title*="Очистить" i]'
    );

    if (clearBtn) {
      const win = clearBtn.ownerDocument.defaultView || window;
      clickToolbarButton(clearBtn);
      await new Promise(r => setTimeout(r, 70));

      // Проверяем выпадающее меню после клика на корзину (если Zoom открывает меню выбора)
      const menuButtons = queryAllList('[role="menu"] button, .dropdown-menu button, .popover button, [role="menuitem"]');
      const targetItem = menuButtons.find(b => {
        const txt = (b.textContent || b.getAttribute('aria-label') || '').toLowerCase();
        return txt.includes('все рисунки') || txt.includes('all drawings') ||
               txt.includes('мои рисунки') || txt.includes('my drawings') ||
               txt.includes('очистить');
      });

      if (targetItem) {
        clickMenuReal(targetItem, targetItem.ownerDocument?.defaultView || win);
        console.log('[ZT] Выбран пункт очистки:', targetItem.textContent.trim());
      }
      setTimeout(() => resetToMouseTool(), 80);
      return true;
    }

    // Fallback: жмем Undo 5 раз
    const undoBtn = queryAll('button[aria-label="Отменить"], [class*="anno-toolbar"] [aria-label*="Отменить"], button[aria-label*="Undo" i]');
    if (undoBtn) {
      for (let i = 0; i < 5; i++) clickToolbarButton(undoBtn);
      setTimeout(() => resetToMouseTool(), 80);
      return true;
    }

    resetToMouseTool();
    return false;
  }

  function removeStora(iwin) {
    console.log('[ZT] Снятие завесы...');
    stopDisco();
    clearAllAnno();
    return true;
  }

  function drawFillRectAsync(iwin, offset = 0) {
    return new Promise(resolve => {
      const doc = iwin?.document || document;
      const canvas = findUpperCanvas(doc) || findUpperCanvas(window.document);
      if (!canvas) { resolve(false); return; }

      const r = canvas.getBoundingClientRect();
      const x1 = r.left - 50 + offset;
      const y1 = r.top - 50 + offset;
      const x2 = r.right + 300;
      const y2 = r.bottom + 300;

      const win = iwin || window;
      const mk = (t, x, y) => new (win.MouseEvent || window.MouseEvent)(t, {
        bubbles: true, cancelable: true, view: win,
        clientX: x, clientY: y, button: 0,
        buttons: t === 'mouseup' ? 0 : 1
      });

      canvas.dispatchEvent(mk('mousemove', x1, y1));
      canvas.dispatchEvent(mk('mousedown', x1, y1));

      setTimeout(() => {
        for (let i = 1; i <= 10; i++) {
          const t = i / 10;
          doc.dispatchEvent(mk('mousemove', x1 + (x2 - x1) * t, y1 + (y2 - y1) * t));
        }
        setTimeout(() => {
          doc.dispatchEvent(mk('mouseup', x2, y2));
          resolve(true);
        }, 25);
      }, 25);
    });
  }

  // ── ЗАВЕСА-СТРОБОСКОП / ДИСКОТЕКА ──
  let _discoRunning = false;

  function updateDiscoUI(running) {
    const btn = document.getElementById('zt-stora-disco-btn');
    const stopBtn = document.getElementById('zt-stora-disco-stop');
    if (btn) {
      btn.textContent = running ? '🌈 Идёт строб...' : '🌈 Дискотека (Строб)';
      btn.style.boxShadow = running ? '0 0 10px rgba(219,39,119,0.7)' : 'none';
    }
    if (stopBtn) {
      stopBtn.style.background = running ? '#dc2626' : '#27272f';
      stopBtn.style.color = running ? '#fff' : '#a1a1aa';
    }
  }

  async function startDisco(iwin) {
    if (_discoRunning) {
      stopDisco();
      return;
    }
    await ensureAnnoOpen();
    const tb = findAnnoToolbar();
    if (!tb) {
      showStatus(T('❌ Открой аннотации', '❌ Open annotations'), '#ef4444');
      return;
    }

    _discoRunning = true;
    updateDiscoUI(true);
    showStatus(T('🌈 Дискотека запущена!', '🌈 Disco started!'), '#ec4899');

    await selectFilledRectTool();

    let step = 0;
    const paletteIndices = [2, 0, 7, 3, 8, 6]; // Красный, Желтый, Синий, Зеленый, Пурпурный, Голубой

    while (_discoRunning) {
      try {
        const targetWin = iwin || getIwin();
        const doc = targetWin?.document || document;
        const canvas = findUpperCanvas(doc) || findUpperCanvas(window.document);
        if (!canvas) {
          await new Promise(r => setTimeout(r, 150));
          continue;
        }

        // 1. Меняем цвет
        const paletteBtn = queryAll('[class*="anno-toolbar__item--palette"] button, button[aria-label*="Цвет" i]');
        if (paletteBtn) {
          clickToolbarButton(paletteBtn);
          await new Promise(r => setTimeout(r, 65));
          if (!_discoRunning) break;

          const colorButtons = queryAllList('[role="dialog"] button, .popover button, [class*="palette"] button, [class*="color-picker"] button');
          if (colorButtons.length > 0) {
            const idx = paletteIndices[step % paletteIndices.length];
            const targetColorBtn = colorButtons[idx] || colorButtons[step % colorButtons.length];
            if (targetColorBtn) {
              clickMenuReal(targetColorBtn, targetColorBtn.ownerDocument?.defaultView || window);
              await new Promise(r => setTimeout(r, 45));
            }
          }
        }

        if (!_discoRunning) break;

        // 2. Убеждаемся, что режим прямоугольника активен
        ensureRectActive();

        // 3. Выполняем бросок без гонки событий
        await drawFillRectAsync(targetWin, (step % 4) * 20);
        step++;

        // Интервал между вспышками
        await new Promise(r => setTimeout(r, 110));
      } catch (err) {
        console.warn('[ZT Disco] Сбой цикла:', err);
        await new Promise(r => setTimeout(r, 200));
      }
    }

    updateDiscoUI(false);
  }

  async function stopDisco() {
    _discoRunning = false;
    updateDiscoUI(false);
    showStatus(T('⏹ Дискотека остановлена, сброс цвета на чёрный...', '⏹ Disco stopped, resetting color to black...'), '#8e8e99');
    try {
      await selectPaletteDarkGrey();
      await selectFilledRectTool();
    } catch {}
    resetToMouseTool();
    showStatus('⏹ Дискотека остановлена (цвет: Dark grey)', '#10b981');
  }

  // ══════════════════════════════════════════════
  // EMOJI FLOOD (ЧИСТЫЙ WEBSOCKET)
  // ══════════════════════════════════════════════
  const FLOOD_EMOJIS = [
    { e: '👍', label: 'thumbs' },
    { e: '❤️', label: 'heart' },
    { e: '😂', label: 'laugh' },
    { e: '😮', label: 'wow' },
    { e: '👏', label: 'clap' },
    { e: '🎉', label: 'party' },
    { e: '🔥', label: 'fire' },
    { e: '💀', label: 'skull' },
  ];

  const MIX_POOL = ['👍', '❤️', '😂', '😮', '👏', '🎉', '🔥', '💀', '🚀', '💯', '🗿', '✨', '⚡'];

  let _floodTimer    = null;
  let _floodCount    = 0;
  let _selectedEmoji = '👍';

  function sendWsReaction(emoji, req, store) {
    if (!req || !store) return false;
    const ac = req(MOD_SOCKET)?.h;
    const evtId = req(MOD_EVENTS)?.WS_CONF_SEND_REACTION_REQ;
    const userId = getCurrentUser(store)?.userId;
    if (!ac || !evtId || !userId) return false;

    store.dispatch(ac({
      evt: evtId,
      body: { uNodeID: userId, strEmojiContent: emoji }
    }));
    return true;
  }

  function startFlood(req, store, emojiKey, intervalMs, maxCount) {
    if (_floodTimer) stopFlood();
    if (!store) { showStatus(T('❌ Войди в митинг', '❌ Join a meeting first'), '#ef4444'); return; }

    _floodCount = 0;
    const isMix = (emojiKey === 'mix');
    const label = isMix ? 'Mix 🔀' : emojiKey;

    showStatus(T(`💥 Спам: ${label} запущен!`, `💥 Spam: ${label} started!`), '#f97316');

    _floodTimer = setInterval(() => {
      if (maxCount > 0 && _floodCount >= maxCount) {
        stopFlood();
        showStatus(T(`✅ Отправлено: ${_floodCount} шт.`, `✅ Sent: ${_floodCount} pcs`), '#10b981');
        return;
      }

      const current = isMix ? MIX_POOL[Math.floor(Math.random() * MIX_POOL.length)] : emojiKey;
      sendWsReaction(current, req, store);
      _floodCount++;

      if (_floodCount % 5 === 0 || _floodCount === 1) {
        showStatus(T(`💥 Спам: ${label} | ${_floodCount} шт.`, `💥 Spam: ${label} | ${_floodCount} pcs`), '#f97316');
      }
    }, intervalMs);
  }

  function stopFlood() {
    clearInterval(_floodTimer);
    _floodTimer = null;
  }

  // ══════════════════════════════════════════════
  // СПАМ РУКОЙ (HAND JUMPER)
  // ══════════════════════════════════════════════
  let _handSpamTimer = null;
  let _handSpamCount = 0;

  function findTopLowerHandButton() {
    for (const d of getAllDocs()) {
      const all = d.querySelectorAll('button, div[role="button"], [class*="lower-hand"], [class*="raise-hand"]');
      for (const el of all) {
        const txt = el.textContent || '';
        const aria = el.getAttribute('aria-label') || '';
        if (txt.includes('Опустить руку') || aria.includes('Опустить руку') || txt.includes('Lower hand') || aria.includes('Lower hand')) {
          return el;
        }
      }
    }
    return null;
  }

  function findReactButton() {
    for (const d of getAllDocs()) {
      const b = d.querySelector('button[aria-label="React"], button[aria-label*="React" i], button[aria-label*="Реакц" i]');
      if (b) return b;
      const btns = d.querySelectorAll('#wc-footer button, [class*="footer"] button');
      for (const btn of btns) {
        if ((btn.textContent || '').trim().toLowerCase() === 'react') return btn;
      }
    }
    return null;
  }

  function findRaiseHandButton() {
    for (const d of getAllDocs()) {
      const b = d.querySelector(
        '.reaction-simple-picker__block--raise-hand, ' +
        'button[class*="reaction-simple-picker__block--raise-hand"], ' +
        'button[class*="raise-hand"]'
      );
      if (b) return b;
      const allPicker = d.querySelectorAll('[class*="reaction"] button, [class*="picker"] button');
      for (const el of allPicker) {
        const txt = el.textContent || '';
        if (txt.includes('Поднять руку') || txt.includes('Raise hand') || txt.includes('Опустить руку') || txt.includes('Lower hand')) {
          return el;
        }
      }
    }
    return null;
  }

  async function toggleHandAction(req, store, iwin) {
    const win = iwin || window;

    // 1. Рука УЖЕ поднята -> мгновенный клик по верхней плашке "Опустить руку"
    const topBtn = findTopLowerHandButton();
    if (topBtn) {
      clickMenuReal(topBtn, win);
      return true;
    }

    // 2. Меню реакций уже открыто -> жмём кнопку руки в нём
    let handBtn = findRaiseHandButton();
    if (handBtn) {
      clickMenuReal(handBtn, win);
      return true;
    }

    // 3. Меню закрыто и рука опущена -> открываем меню через React и жмём руку
    const reactBtn = findReactButton();
    if (reactBtn) {
      clickMenuReal(reactBtn, win);
      await new Promise(r => setTimeout(r, 50));
      handBtn = findRaiseHandButton();
      if (handBtn) {
        clickMenuReal(handBtn, win);
        return true;
      }
    }

    // 4. WebSocket / Redux fallback:
    try {
      const modEvents = req?.(MOD_EVENTS) || {};
      const handKey = Object.keys(modEvents).find(k => /hand|raise|hold/i.test(k) && /req/i.test(k));
      if (handKey && store) {
        const ac = req(MOD_SOCKET)?.h;
        const me = getCurrentUser(store);
        const isRaised = !!(me?.bRaiseHand || me?.bHold);
        store.dispatch(ac({
          evt: modEvents[handKey],
          body: { id: me?.userId, bHold: !isRaised, bRaiseHand: !isRaised }
        }));
        return true;
      }
    } catch {}

    return false;
  }

  function startHandSpam(req, store, intervalMs = 180, maxCount = 0) {
    if (_handSpamTimer) stopHandSpam();
    if (!store && !findReactButton() && !findTopLowerHandButton()) {
      showStatus(T('❌ Войди в митинг', '❌ Join a meeting first'), '#ef4444');
      return;
    }

    _handSpamCount = 0;
    const statLabel = document.getElementById('zt-hand-count');
    const startBtn = document.getElementById('zt-hand-start');
    if (statLabel) statLabel.textContent = T('Спамит...', 'Spamming...');
    if (startBtn) {
      startBtn.textContent = T('✋ Идёт спам...', '✋ Spamming...');
      startBtn.style.background = '#dc2626';
      startBtn.style.borderColor = '#ef4444';
    }
    showStatus(T('✋ Спам рукой запущен!', '✋ Hand spam started!'), '#f59e0b');

    _handSpamTimer = setInterval(async () => {
      if (maxCount > 0 && _handSpamCount >= maxCount) {
        stopHandSpam();
        showStatus(T(`✅ Спам рукой завершен (${_handSpamCount} раз)`, `✅ Hand spam finished (${_handSpamCount} times)`), '#10b981');
        return;
      }

      await toggleHandAction(req, store, getIwin());
      _handSpamCount++;

      if (statLabel) statLabel.textContent = T(`Прыжков: ${_handSpamCount}`, `Jumps: ${_handSpamCount}`);
      if (_handSpamCount % 5 === 0) {
        showStatus(T(`✋ Спам рукой: ${_handSpamCount} раз`, `✋ Hand spam: ${_handSpamCount} times`), '#f59e0b');
      }
    }, intervalMs);
  }

  function stopHandSpam() {
    clearInterval(_handSpamTimer);
    _handSpamTimer = null;
    const statLabel = document.getElementById('zt-hand-count');
    const startBtn = document.getElementById('zt-hand-start');
    if (statLabel) statLabel.textContent = T(`Остановлен (${_handSpamCount})`, `Stopped (${_handSpamCount})`);
    if (startBtn) {
      startBtn.textContent = T('✋ Спам рукой', '✋ Hand Spam');
      startBtn.style.background = '#b45309';
      startBtn.style.borderColor = '#d97706';
    }
    showStatus(T('⏹ Спам рукой остановлен', '⏹ Hand spam stopped'), '#8e8e99');
  }

  function toggleHandSpam(req, store, intervalMs = 120) {
    if (_handSpamTimer) {
      stopHandSpam();
      return false;
    } else {
      startHandSpam(req, store, intervalMs);
      return true;
    }
  }

  // ══════════════════════════════════════════════
  // АВАТАРКИ & DOPPELGANGER
  // ══════════════════════════════════════════════
  function scanParticipants(store, iwin) {
    const doc = iwin?.document;
    const reduxList = store?.getState()?.attendeesList?.attendeesList ?? [];
    const attendees = Array.isArray(reduxList) ? reduxList : Object.values(reduxList);

    const domMap = new Map();
    const allAvatarDivs = doc?.querySelectorAll('.participants-item__avatar') ?? [];
    allAvatarDivs.forEach(av => {
      const row = av.closest('[aria-label]');
      const ariaName = (row?.getAttribute('aria-label') ?? '').split(',')[0].replace(/\s*\(.*?\)/g, '').trim();
      const nameEl = av.closest('[class*="participants-item"]')?.querySelector('[class*="display-name"],[class*="name-label"]');
      const name = ariaName || nameEl?.textContent?.replace(/\s*\(.*?\)/g, '').trim() || '';
      if (!name) return;
      const img = av.querySelector('img');
      domMap.set(name, {
        bgColor:  av.style.backgroundColor || '',
        initText: av.textContent?.trim() || name[0]?.toUpperCase() || '?',
        imgSrc:   img?.src || null,
      });
    });

    const out = [], seen = new Set();
    for (const a of attendees) {
      const name = (a.displayName || '').replace(/\s*\(.*?\)/g, '').trim() || '?';
      if (seen.has(a.userId ?? name)) continue;
      seen.add(a.userId ?? name);
      const dom = domMap.get(name) ?? {};
      out.push({
        name,
        avatarUrl: (a.avatar && a.avatar.startsWith('http')) ? a.avatar : (dom.imgSrc || null),
        bgColor:   dom.bgColor  || '',
        initText:  dom.initText || name.slice(0, 2).toUpperCase() || '?',
        userId:    a.userId,
        isHost:    !!a.isHost,
      });
    }

    if (!out.length) {
      for (const [name, dom] of domMap) {
        out.push({ name, avatarUrl: dom.imgSrc || null, bgColor: dom.bgColor, initText: dom.initText, userId: null, isHost: false });
      }
    }

    return out;
  }

  function makeInitialsCanvas(name, bgColor) {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const ctx = c.getContext('2d');

    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'none' && bgColor !== '') {
      ctx.fillStyle = bgColor;
    } else {
      const hue = [...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360;
      ctx.fillStyle = `hsl(${hue}, 60%, 40%)`;
    }

    ctx.beginPath();
    ctx.arc(128, 128, 128, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 110px Segoe UI, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initials = name.trim().split(/\s+/).slice(0, 2).map(w => (w[0] ?? '').toUpperCase()).join('');
    ctx.fillText(initials || '?', 128, 134);
    return c;
  }

  const GHOST_PARTICIPANT = {
    name: INVISIBLE_NICK,
    displayName: 'Невидимка',
    isGhost: true,
    isHost: false,
    avatarUrl: null,
    bgColor: '#1a102f',
    initText: '👻',
    userId: 'ghost'
  };

  async function copyParticipantAvatar(p, iwin) {
    if (p.isGhost) {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 256;
        // 100% прозрачный холст PNG
        const blob = await new Promise(res => c.toBlob(res, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return '👻 Прозрачная (невидимая) аватарка скопирована!';
      } catch (e) {
        return '❌ Ошибка копирования: ' + e.message;
      }
    }

    if (p.avatarUrl) {
      try {
        const res = await fetch(p.avatarUrl, { mode: 'cors', credentials: 'include' });
        const blob = await res.blob();
        if (blob.type.startsWith('image/')) {
          await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
          return '✅ Аватарка скопирована!';
        }
      } catch {}

      try {
        const iwin2 = getIwin();
        const img = new (iwin2?.Image || Image)();
        img.crossOrigin = 'anonymous';
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = p.avatarUrl; });
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 128; c.height = img.naturalHeight || 128;
        c.getContext('2d').drawImage(img, 0, 0);
        const blob = await new Promise(res => c.toBlob(res, 'image/png'));
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        return '✅ Аватарка скопирована!';
      } catch {}

      try {
        await navigator.clipboard.writeText(p.avatarUrl);
        return '✅ URL аватарки скопирован!';
      } catch {}
    }

    try {
      const c = makeInitialsCanvas(p.name, p.bgColor);
      const blob = await new Promise(res => c.toBlob(res, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return '✅ Аватарка сгенерирована и скопирована!';
    } catch (e) {
      return '❌ Ошибка копирования: ' + e.message;
    }
  }

  function renderAvatarList(participants, iwin) {
    const list = document.getElementById('zt-avatars-list');
    if (!list) return;
    list.innerHTML = '';

    const all = [GHOST_PARTICIPANT, ...(participants || []).filter(p => !p.isGhost)];

    all.forEach(p => {
      const card = document.createElement('div');
      card.className = 'zt-avatar-card' + (p.isGhost ? ' ghost' : '');
      card.title = p.isGhost
        ? T('👻 Невидимка (Ghost Mode)\n• ЛКМ: скопировать невидимую (прозрачную) аватарку\n• ПКМ: невидимый ник в Завесу 🎭\n• Двойной клик: стать невидимым прямо сейчас ⚡',
            '👻 Ghost Mode\n• LMB: copy invisible (transparent) avatar\n• RMB: invisible nick to Screen Curtain 🎭\n• Double click: become invisible right now ⚡')
        : `${p.name} ${p.isHost ? T('👑 (Хост)', '👑 (Host)') : ''}\n` +
          T(`• ЛКМ: скопировать аватар\n• ПКМ: подставить ник в Завесу 🎭\n• Двойной клик: переименоваться в "${p.name}" ⚡`,
            `• LMB: copy avatar\n• RMB: nick to Screen Curtain 🎭\n• Double click: rename to "${p.name}" ⚡`);

      const preview = document.createElement('div');
      preview.className = 'zt-avatar-preview';

      if (p.isHost) {
        const hostBadge = document.createElement('div');
        hostBadge.className = 'zt-host-badge';
        hostBadge.textContent = '👑';
        card.appendChild(hostBadge);
      }

      if (p.isGhost) {
        preview.innerHTML = '<span style="font-size:20px;filter:drop-shadow(0 0 6px rgba(168,85,247,.6))">👻</span>';
        preview.style.background = '#1a102f';
        preview.style.borderColor = '#5b21b6';
      } else if (p.avatarUrl) {
        const img = document.createElement('img');
        img.src = p.avatarUrl;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%';
        img.onerror = () => {
          preview.innerHTML = '';
          const c = makeInitialsCanvas(p.name, p.bgColor);
          c.style.cssText = 'width:42px;height:42px;border-radius:50%';
          preview.appendChild(c);
        };
        preview.appendChild(img);
      } else {
        const c = makeInitialsCanvas(p.name, p.bgColor);
        c.style.cssText = 'width:42px;height:42px;border-radius:50%';
        preview.appendChild(c);
      }

      const label = document.createElement('div');
      label.className = 'zt-avatar-name';
      if (p.isGhost) {
        label.textContent = T('👻 Невидимка', '👻 Ghost');
        label.style.color = '#c4b5fd';
      } else {
        label.textContent = p.name.length > 9 ? p.name.slice(0, 8) + '…' : p.name;
      }

      card.appendChild(preview);
      card.appendChild(label);

      card.addEventListener('click', async () => {
        card.style.opacity = '0.5';
        const msg = await copyParticipantAvatar(p, iwin);
        showStatus(msg, msg.startsWith('✅') || msg.startsWith('👻') ? '#10b981' : '#ef4444');
        setTimeout(() => card.style.opacity = '1', 300);
      });

      card.addEventListener('contextmenu', e => {
        e.preventDefault();
        const tempInp = document.getElementById('zt-temp-nick');
        if (tempInp) {
          tempInp.value = p.name;
          showStatus(p.isGhost ? T('👻 Завеса будет с невидимым ником!', '👻 Curtain will use invisible nick!') : T(`🎭 Завеса будет от: "${p.name}"`, `🎭 Curtain nick set to: "${p.name}"`), '#a855f7');
        }
      });

      card.addEventListener('dblclick', () => {
        const iwin2 = getIwin(), req = getReq(iwin2), store = getStore(iwin2);
        const me = getCurrentUser(store);
        const targetNick = p.name;
        if (store && req) {
          doRename(targetNick, me?.displayName ?? '', req, store);
          const inp = document.getElementById('zt-name');
          if (inp) {
            inp.value = targetNick;
            const charEl = document.getElementById('zt-char');
            if (charEl) {
              if (p.isGhost) {
                charEl.textContent = T('👻 Невидимка (1/80)', '👻 Ghost (1/80)');
                charEl.style.color = '#a855f7';
              } else {
                charEl.textContent = `${targetNick.length}/80`;
                charEl.style.color = '#52525b';
              }
            }
          }
          showStatus(p.isGhost ? T('👻 Ник стал невидимым!', '👻 Nickname became invisible!') : T(`🎭 Ник изменен на: "${targetNick}"`, `🎭 Renamed to: "${targetNick}"`), '#10b981');
        }
      });

      list.appendChild(card);
    });

    const realCount = (participants || []).filter(p => !p.isGhost).length;
    showStatus(realCount ? T(`Найдено ${realCount} участн. + 👻 Невидимка`, `Found ${realCount} participants + 👻 Ghost`) : T('👻 Невидимка готова (нажми Сканировать для остальных)', '👻 Ghost ready (click Scan for others)'), '#8e8e99');
  }

  // ══════════════════════════════════════════════
  // 5. МОНИТОРИНГ & ЛОГИ СОБЫТИЙ (AUDIT LOG)
  // ══════════════════════════════════════════════
  let _monitorActive = true;
  let _monitorUnsub = null;
  let _prevAttendeesMap = new Map();
  const _userStats = new Map(); // id => { name, micOnCount: 0, camOnCount: 0, handCount: 0 }
  let _totalMicOn = 0;
  let _totalCamOn = 0;
  const _logEntries = [];

  let _filterJoinLeave = true;
  let _filterRename = true;
  let _filterHand = true;
  let _filterMic = false;
  let _filterCam = false;

  const isVideoOn = a => !!(a?.bVideoOn ?? a?.video);
  const isAudioOn = a => {
    if (!a) return false;
    if (a.bMuteAudio !== undefined) return !a.bMuteAudio;
    if (a.muted !== undefined) return !a.muted;
    if (typeof a.audio === 'string') return a.audio.toLowerCase().includes('unmute') || a.audio === 'pass';
    return !!a.audio;
  };
  const isHandOn = a => !!(
    a?.bRaiseHand || a?.bHold || a?.bHoldHand || a?.isRaiseHand || 
    a?.raiseHandStatus || a?.bHandRaised || a?.handStatus || a?.raiseHand
  );

  function addLogEntry(text, color = '#d4d4d8') {
    const time = new Date().toLocaleTimeString();
    _logEntries.push({ time, text, color });
    if (_logEntries.length > 80) _logEntries.shift();

    const box = document.getElementById('zt-log-box');
    if (box) {
      if (box.children.length === 1 && box.children[0].textContent.includes('Ожидание')) {
        box.innerHTML = '';
      }
      const line = document.createElement('div');
      line.style.cssText = `color:${color};margin-bottom:3px;word-break:break-word;line-height:1.25`;
      line.innerHTML = `<span style="color:#52525b;font-size:10px">[${time}]</span> ${text}`;
      box.appendChild(line);
      box.scrollTop = box.scrollHeight;
    }
  }

  function updateMonitorUI() {
    const statEl = document.getElementById('zt-monitor-stats');
    if (!statEl) return;

    let micOn = 0, camOn = 0, hands = 0, total = _prevAttendeesMap.size;
    for (const u of _prevAttendeesMap.values()) {
      if (u.audio) micOn++;
      if (u.video) camOn++;
      if (u.hand)  hands++;
    }

    statEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11px">
        <span>👥 ${T('В сети:', 'Online:')} <b style="color:#f4f4f6">${total} ${T('чел.', '')}</b></span>
        <span>✋ ${T('Рук:', 'Hands:')} <b style="color:${hands ? '#f59e0b' : '#71717a'}">${hands}</b></span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#a1a1aa;margin-top:2px">
        <span>🎤 ${T('Микрофоны:', 'Mics:')} <b style="color:${micOn ? '#10b981' : '#71717a'}">${micOn} ${T('вкл', 'on')}</b> / ${total - micOn} ${T('выкл', 'off')}</span>
        <span style="color:#71717a">[${_totalMicOn} ${T('вкл.', 'on')}]</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#a1a1aa;margin-top:2px">
        <span>📷 ${T('Камеры:', 'Cams:')} <b style="color:${camOn ? '#10b981' : '#71717a'}">${camOn} ${T('вкл', 'on')}</b> / ${total - camOn} ${T('выкл', 'off')}</span>
        <span style="color:#71717a">[${_totalCamOn} ${T('вкл.', 'on')}]</span>
      </div>
    `;
  }

  function showLeaderboard() {
    const box = document.getElementById('zt-log-box');
    if (!box) return;
    box.innerHTML = '';
    addLogEntry(T('📊 <b>ТОП АКТИВНОСТИ В МИТИНГЕ:</b>', '📊 <b>MEETING ACTIVITY TOP:</b>'), '#a855f7');
    let hasData = false;
    for (const [id, s] of _userStats) {
      if (s.micOnCount > 0 || s.camOnCount > 0 || s.handCount > 0) {
        hasData = true;
        const line = document.createElement('div');
        line.style.cssText = 'color:#e4e4e7;margin-bottom:3px;font-size:10px;background:#18181c;padding:3px 6px;border-radius:4px;border:1px solid #27272f';
        line.innerHTML = `<b>${s.name}</b>: 🎤 ${s.micOnCount} ${T('вкл', 'on')} | 📷 ${s.camOnCount} ${T('вкл', 'on')} | ✋ ${s.handCount} ${T('рук', 'hands')}`;
        box.appendChild(line);
      }
    }
    if (!hasData) {
      addLogEntry(T('Пока никто ничего не включал', 'No activity recorded yet'), '#71717a');
    }
    box.scrollTop = box.scrollHeight;
  }

  function initMonitorListener(store) {
    if (!store || _monitorUnsub) return;

    const getSnapshot = () => {
      const raw = store.getState()?.attendeesList?.attendeesList ?? [];
      const list = Array.isArray(raw) ? raw : Object.values(raw);
      const m = new Map();
      list.forEach(a => {
        const id = a.userId ?? a.id;
        if (id != null) {
          const name = a.isHost ? T('👑 [Хост]', '👑 [Host]') : (a.displayName || T('Участник', 'Participant'));
          m.set(id, {
            name,
            isHost: !!a.isHost,
            audio: isAudioOn(a),
            video: isVideoOn(a),
            hand: isHandOn(a)
          });
          if (!_userStats.has(id)) {
            _userStats.set(id, { name, micOnCount: 0, camOnCount: 0, handCount: 0 });
          }
        }
      });
      return m;
    };

    _prevAttendeesMap = getSnapshot();
    updateMonitorUI();

    _monitorUnsub = store.subscribe(() => {
      if (!_monitorActive) return;
      const currMap = getSnapshot();
      let changed = false;

      // 1. Кто зашел
      for (const [id, curr] of currMap) {
        if (!_prevAttendeesMap.has(id)) {
          changed = true;
          if (_filterJoinLeave) {
            addLogEntry(T(`🟢 Вошел: <b>${curr.name}</b>`, `🟢 Joined: <b>${curr.name}</b>`), '#10b981');
          }
        }
      }

      // 2. Кто вышел
      for (const [id, prev] of _prevAttendeesMap) {
        if (!currMap.has(id)) {
          changed = true;
          if (_filterJoinLeave) {
            addLogEntry(T(`🔴 Вышел: <b>${prev.name}</b>`, `🔴 Left: <b>${prev.name}</b>`), '#ef4444');
          }
        }
      }

      // 3. Статусы участников
      for (const [id, curr] of currMap) {
        const prev = _prevAttendeesMap.get(id);
        if (!prev) continue;

        const uStat = _userStats.get(id) || { name: curr.name, micOnCount: 0, camOnCount: 0, handCount: 0 };
        uStat.name = curr.name;

        // Микрофон (только ВКЛЮЧЕНИЕ!)
        if (prev.audio !== curr.audio) {
          changed = true;
          if (curr.audio) {
            uStat.micOnCount++;
            _totalMicOn++;
            if (_filterMic) {
              addLogEntry(T(`🎤 <b>${curr.name}</b> ВКЛ микрофон <span style="color:#71717a">(${uStat.micOnCount}-й раз)</span>`, `🎤 <b>${curr.name}</b> unmuted mic <span style="color:#71717a">(#${uStat.micOnCount})</span>`), '#10b981');
            }
          } else {
            if (_filterMic) {
              addLogEntry(T(`🎤 <b>${curr.name}</b> ВЫКЛ микрофон`, `🎤 <b>${curr.name}</b> muted mic`), '#71717a');
            }
          }
        }

        // Камера (только ВКЛЮЧЕНИЕ!)
        if (prev.video !== curr.video) {
          changed = true;
          if (curr.video) {
            uStat.camOnCount++;
            _totalCamOn++;
            if (_filterCam) {
              addLogEntry(T(`📷 <b>${curr.name}</b> ВКЛ камеру <span style="color:#71717a">(${uStat.camOnCount}-й раз)</span>`, `📷 <b>${curr.name}</b> turned camera ON <span style="color:#71717a">(#${uStat.camOnCount})</span>`), '#10b981');
            }
          } else {
            if (_filterCam) {
              addLogEntry(T(`📷 <b>${curr.name}</b> ВЫКЛ камеру`, `📷 <b>${curr.name}</b> turned camera OFF`), '#71717a');
            }
          }
        }

        // Рука (только ПОДНЯТИЕ!)
        if (prev.hand !== curr.hand) {
          changed = true;
          if (curr.hand) {
            uStat.handCount++;
            if (_filterHand) {
              addLogEntry(T(`✋ <b>${curr.name}</b> ПОДНЯЛ руку <span style="color:#71717a">(${uStat.handCount}-й раз)</span>`, `✋ <b>${curr.name}</b> RAISED hand <span style="color:#71717a">(#${uStat.handCount})</span>`), '#f59e0b');
            }
          } else {
            if (_filterHand) {
              addLogEntry(T(`✋ <b>${curr.name}</b> опустил руку`, `✋ <b>${curr.name}</b> lowered hand`), '#71717a');
            }
          }
        }

        // Смена ника
        if (prev.name !== curr.name) {
          changed = true;
          if (_filterRename) {
            addLogEntry(T(`🏷 Ник: <s>${prev.name}</s> ➔ <b>${curr.name}</b>`, `🏷 Nick: <s>${prev.name}</s> ➔ <b>${curr.name}</b>`), '#38bdf8');
          }
        }
      }

      _prevAttendeesMap = currMap;
      if (changed) {
        updateMonitorUI();
      }
    });
  }

  // ══════════════════════════════════════════════
  // 6. ИНСПЕКТОР МИТИНГА (MEETING INSPECTOR & PASSCODE)
  // ══════════════════════════════════════════════
  function getMeetingInspectorData(store, iwin) {
    const state = store?.getState?.() || {};
    const m = state.meeting || {};
    const cfg = state.meetingConfig || {};
    const rules = state.confRules || {};
    const attendees = state.attendeesList?.attendeesList || [];
    const attendeesArr = Array.isArray(attendees) ? attendees : Object.values(attendees);

    // 1. Passcode / Пароль комнаты
    let passcode = null;
    for (const obj of [m, cfg, rules, state.meetingUI, state.joinMeeting]) {
      if (!obj || typeof obj !== 'object') continue;
      for (const k of ['password', 'pwd', 'passcode', 'meetingPassword', 'roomPassword']) {
        if (obj[k] && typeof obj[k] === 'string' && obj[k].trim()) {
          passcode = obj[k].trim();
          break;
        }
      }
      if (passcode) break;
    }

    // Рекурсивный поиск в объектах Redux state
    if (!passcode && state) {
      try {
        for (const k of Object.keys(state)) {
          const sub = state[k];
          if (sub && typeof sub === 'object' && !Array.isArray(sub)) {
            for (const prop of ['password', 'pwd', 'passcode', 'meetingPassword']) {
              if (sub[prop] && typeof sub[prop] === 'string' && sub[prop].length < 30) {
                passcode = sub[prop].trim();
                break;
              }
            }
            if (passcode) break;
          }
        }
      } catch {}
    }

    // Поиск в URL (window, top, parent, iframe)
    if (!passcode) {
      const urls = [];
      try { urls.push(window.location.href); } catch {}
      try { if (window.top) urls.push(window.top.location.href); } catch {}
      try { if (window.parent) urls.push(window.parent.location.href); } catch {}
      try {
        const ifr = document.getElementById('webclient');
        if (ifr?.contentWindow?.location?.href) urls.push(ifr.contentWindow.location.href);
      } catch {}

      for (const u of urls) {
        try {
          const parsed = new URL(u);
          const p = parsed.searchParams.get('pwd');
          if (p) { passcode = p; break; }
        } catch {}
        const match = u.match(/[?&#]pwd=([^&#]+)/);
        if (match && match[1]) { passcode = decodeURIComponent(match[1]); break; }
      }
    }

    // Поиск в sessionStorage
    if (!passcode) {
      try {
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          const v = sessionStorage.getItem(k);
          if (v && v.length < 1000) {
            const mPass = v.match(/"(?:password|pwd|passcode)":"([^"]+)"/i);
            if (mPass && mPass[1]) { passcode = mPass[1]; break; }
          }
        }
      } catch {}
    }

    // 2. Meeting ID
    let mid = m.meetingNumber || m.mid || m.meetingId || cfg.meetingNumber || null;
    if (!mid) {
      const urls = [window.location.href];
      try { if (window.top) urls.push(window.top.location.href); } catch {}
      try {
        const ifr = document.getElementById('webclient');
        if (ifr?.contentWindow?.location?.href) urls.push(ifr.contentWindow.location.href);
      } catch {}
      for (const u of urls) {
        const match = u.match(/(?:wc\/(?:join\/)?|meeting\/|j\/)(\d{9,11})/i) || u.match(/[?&]mn=(\d{9,11})/i);
        if (match && match[1]) { mid = match[1]; break; }
      }
    }

    // 3. Topic / Тема
    let topic = m.topic || m.meetingTopic || m.meetingName || cfg.topic || null;
    if (!topic || topic === 'Без названия') {
      try {
        const t = document.title || window.top?.document?.title || '';
        if (t && !t.toLowerCase().includes('zoom')) topic = t;
      } catch {}
    }
    if (!topic) topic = 'Конференция Zoom';

    // 4. Meeting UUID
    const uuid = m.meetingUUID || m.uuid || m.confUUID || '—';

    // 5. Хост
    const hostNick = getHostNick(store);
    let hostName = hostNick || '👑 [Хост]';
    if (!hostNick && attendeesArr.length > 0) {
      const hostUser = attendeesArr.find(a => a.isHost);
      if (hostUser) hostName = hostUser.displayName;
    }

    // 6. Права и политики — полный набор из панели организатора
    const p = m.policy || m.meetingPolicy || rules || {};

    // Хелпер: ищет значение в нескольких источниках по списку ключей
    const getFlag = (...keys) => {
      for (const key of keys) {
        for (const src of [m, p, cfg, rules, state.hostOptions, state.meetingOptions]) {
          if (src && src[key] !== undefined) return src[key];
        }
      }
      return null;
    };

    // ── Инструменты организатора ──
    // Реальные ключи из live dump state.meeting (подтверждено)
    const isLocked     = getFlag('bLock', 'isLocked', 'lockMeeting');
    // waitingRoomInfo.options: 0 = выкл, ненулевое = вкл
    const wri          = m.waitingRoomInfo;
    const waitingRoom  = wri != null
      ? (typeof wri.options === 'number' ? wri.options !== 0 : !!wri.enabled)
      : getFlag('isWaitingRoom', 'waitingRoom', 'isWaitingRoomEnabled');
    // bAllowedAvatar: true = аватарки разрешены (видны), false = скрыты
    const rawAvatar    = getFlag('bAllowedAvatar', 'hideProfilePicture', 'bHideProfilePicture');
    const hideProfiles = rawAvatar !== null
      ? (rawAvatar === false || rawAvatar === 0)   // инвертируем: false → "скрыты"
      : null;

    // ── Разрешить всем участникам ──
    // Реальные ключи из live dump state.meeting (подтверждено)
    const canChat      = getFlag('bAllowAttendeeChat', 'allowChat', 'isAllowChat');
    const canRename    = getFlag('bAllowAttendeeRename', 'allowRename', 'isAllowRename');
    const canUnmute    = getFlag('bCanUnmute', 'allowUnmute', 'isAllowUnmute');
    const canVideo     = getFlag('bCanUnmuteVideo', 'allowVideo', 'isAllowVideo');
    // bRecord — число (0/1), не boolean
    const rawRecord    = getFlag('bRecord', 'canRecording', 'allowLocalRecord');
    const canRecord    = rawRecord !== null ? (rawRecord !== 0 && rawRecord !== false) : null;
    const canRequestRec = getFlag('allowRequestLocalRecord', 'isAllowRequestLocalRecord', 'bRequestRecord');
    const canTranscribe = getFlag('allowTranscription', 'isAllowTranscription', 'bTranscription');
    // Бонусные флаги
    const mutedOnEntry = getFlag('bMutedUponEntry', 'muteUponEntry');
    const canRaiseHand = getFlag('bAllowRaiseHand', 'allowRaiseHand');

    if (!mid && !passcode && !store) return null;

    return {
      mid: mid ? String(mid).replace(/(\d{3})(\d{3,4})(\d{4})/, '$1 $2 $3') : 'Не найден',
      rawMid: mid ? String(mid) : '',
      passcode: passcode || 'Не задан / открытый',
      topic,
      uuid,
      hostName,
      attendeeCount: attendeesArr.length,
      policies: {
        // Инструменты организатора
        isLocked,
        waitingRoom,
        hideProfiles,
        // Разрешения участников
        canChat,
        canRename,
        canUnmute,
        canVideo,
        canRecord,
        canRequestRec,
        canTranscribe,
        // Бонусные флаги
        mutedOnEntry,
        canRaiseHand,
      }
    };
  }

  function updateInspectorUI() {
    const cont = document.getElementById('zt-inspector-content');
    if (!cont) return;
    const iwin = getIwin();
    const store = getStore(iwin);
    const data = getMeetingInspectorData(store, iwin);

    if (!data) {
      cont.innerHTML = `<span style="color:#ef4444;font-size:10px">${T('❌ Войди в митинг для сканирования данных', '❌ Join a meeting to scan data')}</span>`;
      return;
    }

    const pol = data.policies;
    // Улучшенный хелпер с поддержкой кастомных цветов
    const flag = (val, trueLabel = '🟢 Да', falseLabel = '🔴 Нет', trueColor = '#10b981', falseColor = '#ef4444') => {
      if (val === true)  return `<span style="color:${trueColor};font-weight:600">${trueLabel}</span>`;
      if (val === false) return `<span style="color:${falseColor};font-weight:600">${falseLabel}</span>`;
      return `<span style="color:#52525b">—</span>`;
    };
    const row = (label, val, trueLabel, falseLabel, trueColor = '#10b981', falseColor = '#ef4444') =>
      `<div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;padding:1px 0">
        <span style="color:#a1a1aa">${label}</span>
        ${flag(val, trueLabel, falseLabel, trueColor, falseColor)}
      </div>`;

    cont.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="color:#8e8e99;font-size:10px">${T('Пароль (Passcode):', 'Passcode:')}</span>
        <span id="zt-copy-pass-btn" style="font-size:11px;font-weight:700;color:#10b981;background:#064e3b;border:1px solid #059669;padding:1px 6px;border-radius:4px;cursor:pointer" title="${T('Нажми чтобы скопировать пароль', 'Click to copy passcode')}"><b>${data.passcode}</b> 📋</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
        <span style="color:#8e8e99;font-size:10px">Meeting ID:</span>
        <span id="zt-copy-mid-btn" style="font-size:11px;color:#e4e4e7;cursor:pointer;background:#18181c;padding:1px 5px;border-radius:4px;border:1px solid #27272f" title="${T('Нажми чтобы скопировать ID', 'Click to copy ID')}">${data.mid} 📋</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
        <span style="color:#8e8e99;font-size:10px">${T('Тема:', 'Topic:')}</span>
        <span style="color:#d4d4d8;font-size:10px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${data.topic}">${data.topic}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
        <span style="color:#8e8e99;font-size:10px">${T('Участников:', 'Attendees:')}</span>
        <span style="color:#d4d4d8;font-size:10px">${data.attendeeCount}</span>
      </div>

      <div style="border-top:1px solid #1f1f26;margin-top:5px;padding-top:4px">
        <span style="color:#71717a;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">${T('🔧 Инструменты организатора', '🔧 Host Tools')}</span>
        <div style="margin-top:3px;display:flex;flex-direction:column;gap:1px">
          ${row(T('🔒 Конференция заблокирована', '🔒 Meeting Locked'), pol.isLocked, T('🔒 Заблокирована', '🔒 Locked'), T('🟢 🔓 Открыта', '🟢 🔓 Open'), '#ef4444', '#10b981')}
          ${row(T('⏳ Зал ожидания', '⏳ Waiting Room'), pol.waitingRoom, T('🟡 ⏳ Вкл.', '🟡 ⏳ On'), T('🟢 Выкл.', '🟢 Off'), '#f59e0b', '#10b981')}
          ${row(T('🖼 Скрыть фото профиля', '🖼 Hide Profile Pictures'), pol.hideProfiles, T('🔴 Скрыты', '🔴 Hidden'), T('🟢 Видны', '🟢 Visible'), '#ef4444', '#10b981')}
        </div>
      </div>

      <div style="border-top:1px solid #1f1f26;margin-top:5px;padding-top:4px">
        <span style="color:#71717a;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.5px">${T('👥 Разрешить всем участникам', '👥 Participant Permissions')}</span>
        <div style="margin-top:3px;display:flex;flex-direction:column;gap:1px">
          ${row(T('💬 Чат', '💬 Chat'), pol.canChat, T('🟢 Разрешён', '🟢 Allowed'), T('🔴 Заблокирован', '🔴 Blocked'))}
          ${row(T('🏷 Переименовать себя', '🏷 Self Rename'), pol.canRename, T('🟢 Разрешено', '🟢 Allowed'), T('🔴 Запрещено', '🔴 Blocked'))}
          ${row(T('🎤 Включить звук у себя', '🎤 Self Unmute'), pol.canUnmute, T('🟢 Разрешено', '🟢 Allowed'), T('🔴 Запрещено', '🔴 Blocked'))}
          ${row(T('📹 Начать видео', '📹 Start Video'), pol.canVideo, T('🟢 Разрешено', '🟢 Allowed'), T('🔴 Запрещено', '🔴 Blocked'))}
          ${row(T('⏺ Записывать на компьютер', '⏺ Local Recording'), pol.canRecord, T('🟢 Разрешено', '🟢 Allowed'), T('🔴 Запрещено', '🔴 Blocked'))}
          ${row(T('📩 Запрос записи', '📩 Request Recording'), pol.canRequestRec, T('🟢 Разрешено', '🟢 Allowed'), T('🔴 Запрещено', '🔴 Blocked'))}
          ${row(T('📝 Транскрибировать', '📝 Transcription'), pol.canTranscribe, T('🟢 Разрешено', '🟢 Allowed'), T('🔴 Запрещено', '🔴 Blocked'))}
          ${row(T('✋ Поднять руку', '✋ Raise Hand'), pol.canRaiseHand, T('🟢 Разрешено', '🟢 Allowed'), T('🔴 Запрещено', '🔴 Blocked'))}
          ${row(T('🔇 Без звука при входе', '🔇 Mute Upon Entry'), pol.mutedOnEntry, T('🔇 Да', '🔇 Yes'), T('🟢 🎤 Нет', '🟢 🎤 No'), '#f59e0b', '#10b981')}
        </div>
      </div>
    `;

    document.getElementById('zt-copy-pass-btn')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(data.passcode);
      showStatus(T(`📋 Пароль "${data.passcode}" скопирован!`, `📋 Passcode "${data.passcode}" copied!`), '#10b981');
    });

    document.getElementById('zt-copy-mid-btn')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(data.rawMid || data.mid);
      showStatus(T(`📋 Meeting ID "${data.rawMid || data.mid}" скопирован!`, `📋 Meeting ID "${data.rawMid || data.mid}" copied!`), '#10b981');
    });
  }

  // ══════════════════════════════════════════════
  // UI & ЧЕРНАЯ ТЕМА (DEEP MATTE DARK)
  // ══════════════════════════════════════════════
  let stTimer = null;
  function showStatus(msg, color = '#10b981') {
    const el = document.getElementById('zt-status'); if (!el) return;
    el.textContent = msg; el.style.color = color;
    clearTimeout(stTimer); stTimer = setTimeout(() => el.textContent = '', 3500);
  }

  function buildWidget() {
    document.getElementById('zoom-tools-widget')?.remove();
    document.getElementById('zoom-tools-style')?.remove();

    const st = document.createElement('style');
    st.id = 'zoom-tools-style';
    st.textContent = `
      #zoom-tools-widget {
        position: fixed; z-index: 999999; bottom: 75px; right: 20px;
        background: #0d0d10; color: #f4f4f6;
        border: 1px solid #23232a; border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        font-size: 13px; box-shadow: 0 16px 40px rgba(0,0,0,.85), 0 0 0 1px rgba(255,255,255,.05);
        min-width: 320px; max-width: 345px; width: 330px; user-select: none; box-sizing: border-box;
      }
      #zoom-tools-widget * { box-sizing: border-box; }
      #zoom-tools-widget.minimized .zt-body { display: none; }
      .zt-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 9px 12px; cursor: move; background: #141418;
        border-radius: 12px 12px 0 0; border-bottom: 1px solid #23232a;
      }
      .zt-title { font-weight: 700; font-size: 13px; letter-spacing: .5px; color: #e4e4e7; display: flex; align-items: center; gap: 6px; }
      .zt-btns { display: flex; gap: 4px; }
      .zt-icon-btn {
        background: transparent; border: none; color: #71717a;
        cursor: pointer; font-size: 13px; padding: 2px 6px; border-radius: 4px; transition: all .15s;
      }
      .zt-icon-btn:hover { background: #23232a; color: #f4f4f6; }
      .zt-body { padding: 10px 12px; display: flex; flex-direction: column; gap: 10px; max-height: 82vh; overflow-y: auto; }
      .zt-body::-webkit-scrollbar { width: 4px; }
      .zt-body::-webkit-scrollbar-thumb { background: #27272f; border-radius: 4px; }
      .zt-section {
        background: #151519; border: 1px solid #1f1f26;
        border-radius: 8px; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;
      }
      .zt-section-title { font-size: 11px; color: #71717a; font-weight: 600; text-transform: uppercase; letter-spacing: .7px; }
      .zt-section-title.clickable { cursor: pointer; display: flex; justify-content: space-between; align-items: center; }
      .zt-section-title.clickable:hover { color: #d4d4d8; }
      .zt-row { display: flex; gap: 6px; align-items: center; width: 100%; }
      .zt-input {
        flex: 1; background: #0a0a0d; border: 1px solid #27272f;
        color: #f4f4f6; border-radius: 6px; padding: 6px 8px; font-size: 12px; outline: none; transition: border-color .15s;
        min-width: 0;
      }
      .zt-input:focus { border-color: #52525e; }
      .zt-hint { font-size: 10px; color: #52525b; text-align: right; margin-top: -2px; }
      .zt-btn {
        background: #222228; border: 1px solid #33333d; color: #f4f4f6;
        border-radius: 6px; padding: 6px 10px; cursor: pointer; font-size: 12px; font-weight: 600;
        white-space: nowrap; transition: all .15s; display: inline-flex; align-items: center; justify-content: center; gap: 4px;
        flex-shrink: 0;
      }
      .zt-btn:hover { background: #2a2a32; border-color: #444450; }
      .zt-btn:active { transform: translateY(1px); }
      .zt-btn.danger { background: #7f1d1d; border-color: #991b1b; color: #fecaca; }
      .zt-btn.danger:hover { background: #991b1b; border-color: #b91c1c; color: #fff; }
      .zt-btn.accent { background: #1e1b4b; border-color: #3730a3; color: #c7d2fe; }
      .zt-btn.accent:hover { background: #312e81; border-color: #4338ca; }
      .zt-btn.secondary { background: #18181c; border-color: #27272f; color: #a1a1aa; }
      .zt-btn.secondary:hover { background: #222228; color: #f4f4f6; }
      .zt-btn.ghost-btn { background: #271e38; border-color: #5b21b6; color: #c4b5fd; }
      .zt-btn.ghost-btn:hover { background: #3b2d54; border-color: #7c3aed; color: #ede9fe; }
      .zt-chip {
        font-size: 11px; color: #d4d4d8; background: #1c1c22;
        border: 1px solid #27272f; border-radius: 4px;
        padding: 2px 7px; cursor: pointer; transition: all .15s;
        white-space: nowrap; max-width: 140px; overflow: hidden; text-overflow: ellipsis;
      }
      .zt-chip:hover { background: #272730; color: #f4f4f6; border-color: #3f3f4e; }
      .zt-chip.ghost { background: #271e38; border-color: #5b21b6; color: #c4b5fd; font-weight: 500; }
      .zt-chip.ghost:hover { background: #3b2d54; border-color: #7c3aed; color: #ede9fe; }
      #zt-status { font-size: 11px; min-height: 16px; text-align: center; padding: 2px 0; font-weight: 500; }
      #zt-avatars-list { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; max-height: 180px; overflow-y: auto; }
      #zt-avatars-list::-webkit-scrollbar { width: 4px; }
      #zt-avatars-list::-webkit-scrollbar-thumb { background: #27272f; border-radius: 4px; }
      .zt-avatar-card {
        position: relative; display: flex; flex-direction: column; align-items: center; gap: 3px;
        cursor: pointer; padding: 5px 4px; border-radius: 8px; transition: background .15s; width: 56px;
      }
      .zt-avatar-card:hover { background: #1c1c22; }
      .zt-avatar-card:active { background: #24242c; }
      .zt-avatar-preview {
        width: 40px; height: 40px; border-radius: 50%; overflow: hidden;
        background: #0a0a0d; border: 1px solid #23232a; display: flex; align-items: center; justify-content: center; flex-shrink: 0;
      }
      .zt-host-badge { position: absolute; top: 2px; right: 8px; font-size: 11px; line-height: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,1)); }
      .zt-avatar-name { font-size: 10px; color: #a1a1aa; text-align: center; word-break: break-word; line-height: 1.2; }
      .zt-kbd { font-size: 9px; color: #52525b; background: #141418; padding: 1px 4px; border-radius: 3px; border: 1px solid #23232a; }
      .zt-switch { position: relative; display: inline-block; width: 34px; height: 18px; flex-shrink: 0; }
      .zt-switch input { opacity: 0; width: 0; height: 0; margin: 0; }
      .zt-slider {
        position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
        background-color: #27272f; border: 1px solid #3f3f46; transition: .2s; border-radius: 18px;
      }
      .zt-slider:before {
        position: absolute; content: ""; height: 12px; width: 12px; left: 2px; bottom: 2px;
        background-color: #d4d4d8; transition: .2s; border-radius: 50%;
      }
      .zt-switch input:checked + .zt-slider { background-color: #10b981; border-color: #059669; }
      .zt-switch input:checked + .zt-slider:before { transform: translateX(16px); background-color: #ffffff; }
    `;
    document.head.appendChild(st);

    const w = document.createElement('div');
    w.id = 'zoom-tools-widget';
    w.innerHTML = `
      <div class="zt-header" id="zt-drag-handle">
        <span class="zt-title">⚡ Zoom Tools <span class="zt-kbd">v1.0.0</span></span>
        <div class="zt-btns">
          <button class="zt-icon-btn" id="zt-lang" title="${T('Сменить язык (RU / EN)', 'Switch language (RU / EN)')}" style="font-size:10px;font-weight:700;padding:2px 5px">🌐 ${T('RU', 'EN')}</button>
          <button class="zt-icon-btn" id="zt-pin" title="${T('Закрепить позицию', 'Pin position')}">📌</button>
          <button class="zt-icon-btn" id="zt-min" title="${T('Свернуть', 'Minimize')}">━</button>
        </div>
      </div>
      <div class="zt-body">

        <!-- ── 1. СМЕНА НИКА ── -->
        <div class="zt-section">
          <div class="zt-section-title clickable" id="zt-rename-toggle">
            <span>${T('🏷 Смена ника', '🏷 Nickname')}</span>
            <span id="zt-rename-arrow">▾</span>
          </div>
          <div id="zt-rename-body" style="display:flex;flex-direction:column;gap:6px">
            <div class="zt-row">
              <input class="zt-input" id="zt-name" placeholder="${T('Новое имя (или 👻)...', 'New nickname (or 👻)...')}" maxlength="80"/>
              <button class="zt-btn" id="zt-rename-btn" title="${T('Применить ник', 'Apply')}">✓</button>
              <button class="zt-btn secondary" id="zt-name-host-btn" title="${T('Мгновенно стать Хостом', 'Immediately become Host')}" style="padding:4px 7px;font-size:11px">${T('👑 Хост', '👑 Host')}</button>
              <button class="zt-btn ghost-btn" id="zt-name-ghost-btn" title="${T('Мгновенно сделать ник невидимым (Hangul Filler)', 'Make nickname invisible (Hangul Filler)')}" style="padding:4px 7px;font-size:11px">👻</button>
            </div>
            <div class="zt-hint" id="zt-char">0/80</div>

            <!-- Недавние ники -->
            <div style="display:flex;flex-direction:column;gap:3px;margin-top:2px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:10px;color:#71717a">${T('Недавние:', 'Recent:')}</span>
                <span id="zt-recent-clear" style="font-size:9px;color:#52525b;cursor:pointer">${T('очистить', 'clear')}</span>
              </div>
              <div id="zt-recent-nicks" style="display:flex;flex-wrap:wrap;gap:4px"></div>
            </div>

            <!-- Переключатель: Рулетка ников (Хамелеон) -->
            <div style="display:flex;flex-direction:column;gap:5px;background:#0d0d11;border:1px solid #23232a;border-radius:6px;padding:6px 8px;margin-top:4px">
              <div style="display:flex;align-items:center;justify-content:space-between">
                <div style="display:flex;flex-direction:column;gap:1px">
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:11px;font-weight:600;color:#e4e4e7">🔀 ${T('Рулетка ников', 'Nick Roulette')}</span>
                    <span id="zt-mimic-status-text" style="font-size:10px;color:${_mimicActive ? '#10b981' : '#71717a'};font-weight:700">${_mimicActive ? `🟢 ${T('ВКЛ', 'ON')}` : T('ВЫКЛ', 'OFF')}</span>
                  </div>
                  <span style="font-size:9px;color:#71717a">${T('Скорость: ', 'Speed: ')}<b style="color:#10b981" id="zt-mimic-speed-val">${_mimicSpeed >= 1000 ? (_mimicSpeed / 1000).toFixed(1) + T('с', 's') : _mimicSpeed + T('мс', 'ms')}</b></span>
                </div>
                <label class="zt-switch" title="${T('Включить / остановить рулетку ников', 'Toggle random nickname roulette')}">
                  <input type="checkbox" id="zt-mimic-toggle"${_mimicActive ? ' checked' : ''}/>
                  <span class="zt-slider"></span>
                </label>
              </div>

              <!-- Пресеты скорости (Макс, Быстро, Норм, Медленно) -->
              <div style="display:flex;gap:3px">
                <button class="zt-btn secondary" id="zt-mimic-spd-turbo" style="padding:2px 3px;font-size:9.5px;flex:1${_mimicSpeed === 200 ? ';border-color:#10b981;color:#fff;font-weight:700' : ''}" title="${T('Максимальная скорость (200мс — предел Zoom)', 'Maximum speed (200ms — Zoom limits)')}">⚡ 200${T('мс', 'ms')}</button>
                <button class="zt-btn secondary" id="zt-mimic-spd-fast" style="padding:2px 3px;font-size:9.5px;flex:1${_mimicSpeed === 400 ? ';border-color:#10b981;color:#fff;font-weight:700' : ''}" title="${T('Быстро (400мс — 2.5 смены в сек)', 'Fast (400ms — 2.5/s)')}">🚀 400${T('мс', 'ms')}</button>
                <button class="zt-btn secondary" id="zt-mimic-spd-norm" style="padding:2px 3px;font-size:9.5px;flex:1${_mimicSpeed === 750 ? ';border-color:#10b981;color:#fff;font-weight:700' : ''}" title="${T('Оптимально (750мс — стабильно)', 'Optimal (750ms — stable)')}">⏱ 750${T('мс', 'ms')}</button>
                <button class="zt-btn secondary" id="zt-mimic-spd-slow" style="padding:2px 3px;font-size:9.5px;flex:1${_mimicSpeed === 1500 ? ';border-color:#10b981;color:#fff;font-weight:700' : ''}" title="${T('Спокойно (1.5с — безопасный режим)', 'Relaxed (1.5s — safe mode)')}">🐢 1.5${T('с', 's')}</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ── 2. ЗАВЕСА ДЕМОНСТРАЦИИ ── -->
        <div class="zt-section">
          <div class="zt-section-title clickable" id="zt-stora-toggle">
            <div style="display:flex;align-items:center;gap:6px">
              <span>${T('🪟 Завеса демонстрации', '🪟 Screen Curtain')}</span>
              <span class="zt-kbd">${T('Alt+S (Мгновенно)', 'Alt+S (Instant)')}</span>
            </div>
            <span id="zt-stora-arrow">▾</span>
          </div>
          <div id="zt-stora-body" style="display:flex;flex-direction:column;gap:6px">
            <div class="zt-row">
              <span style="font-size:11px;color:#8e8e99;white-space:nowrap">${T('Ник:', 'Nick:')}</span>
              <input class="zt-input" id="zt-temp-nick" value="${INVISIBLE_NICK}" placeholder="${T('Ник во время завесы (👻)', 'Nickname during curtain (👻)')}"/>
              <button class="zt-btn secondary" id="zt-host-clone-btn" title="${T('Подставить ник и аватарку Хоста', 'Clone Host nick & avatar')}" style="padding:4px 7px;font-size:11px">${T('👑 Хост', '👑 Host')}</button>
              <button class="zt-btn ghost-btn" id="zt-stora-ghost-btn" title="${T('Невидимый ник для завесы', 'Invisible nickname for curtain')}" style="padding:4px 7px;font-size:11px">👻</button>
            </div>

            <div style="display:flex;justify-content:space-between;align-items:center;padding:0 2px">
              <label style="font-size:10px;color:#71717a;display:inline-flex;align-items:center;gap:4px;cursor:pointer" title="${T('Если снято, то после завесы ник останется подставным / невидимым', 'If unchecked, nickname remains spoofed/invisible after curtain')}">
                <input type="checkbox" id="zt-stora-restore" checked style="accent-color:#10b981;cursor:pointer;margin:0"/>
                ${T('Вернуть ник после завесы', 'Restore nickname after curtain')}
              </label>
            </div>

            <!-- Недавние для завесы -->
            <div id="zt-stora-recent-nicks" style="display:flex;flex-wrap:wrap;gap:4px"></div>

            <!-- Основные кнопки (Ряд 1): Мгновенно и Корзина (очистить всё, Alt+D) -->
            <div class="zt-row" style="margin-top:2px">
              <button class="zt-btn danger" id="zt-stora-fast-btn" style="flex:1.4" title="${T('Мгновенный бросок (Alt+S)', 'Instant curtain (Alt+S)')}">${T('⚡ Мгновенно', '⚡ Instant')}</button>
              <button class="zt-btn secondary" id="zt-stora-clear-all" style="flex:1;font-size:11px" title="${T('Очистить все слои аннотаций (Alt+D) — Корзина Zoom', 'Clear all canvas layers (Alt+D)')}">${T('🗑 Корзина (Alt+D)', '🗑 Clear All (Alt+D)')}</button>
            </div>

            <!-- Доп. кнопки (Ряд 2): С настройкой и Сетап кисти -->
            <div class="zt-row">
              <button class="zt-btn" id="zt-stora-btn" style="flex:1.2;font-size:11px" title="${T('С полной проверкой Dark grey и фигуры', 'With tool & Dark grey setup')}">${T('⬛ С настройкой', '⬛ Configured')}</button>
              <button class="zt-btn secondary" id="zt-stora-setup-btn" style="flex:1;font-size:11px" title="${T('Заранее выбрать Dark grey и прямоугольник', 'Select Dark grey and rectangle')}">${T('⚙ Сетап кисти', '⚙ Setup Brush')}</button>
            </div>

            <!-- Доп. кнопки (Ряд 3): Дискотека / Стробоскоп -->
            <div class="zt-row">
              <button class="zt-btn" id="zt-stora-disco-btn" style="flex:1.4;font-size:11px;background:linear-gradient(90deg,#7c3aed,#db2777,#f59e0b);border:none;color:#fff" title="${T('Быстрое чередование ярких цветов и перекрестная заливка экрана', 'Rapid color shifting canvas strobe')}">${T('🌈 Дискотека (Строб)', '🌈 Disco Strobe')}</button>
              <button class="zt-btn secondary" id="zt-stora-disco-stop" style="flex:0.6;font-size:11px" title="${T('Остановить дискотеку и очистить слои', 'Stop disco and clear layers')}">${T('⏹ Стоп', '⏹ Stop')}</button>
            </div>
          </div>
        </div>

        <!-- ── 3. УЧАСТНИКИ & DOPPELGANGER ── -->
        <div class="zt-section">
          <div class="zt-section-title clickable" id="zt-avatars-toggle">
            <span>${T('📸 Участники & Клонирование', '📸 Participants & Clone')}</span>
            <span id="zt-avatars-arrow">▸</span>
          </div>
          <div id="zt-avatars-body" style="display:none;flex-direction:column;gap:6px">
            <div class="zt-row">
              <button class="zt-btn secondary" id="zt-avatars-scan" style="flex:1">${T('🔍 Сканировать Redux', '🔍 Scan Redux')}</button>
            </div>
            <div id="zt-avatars-list"></div>
          </div>
        </div>

        <!-- ── 4. СПАМ (ЭМОДЗИ & РУКА) ── -->
        <div class="zt-section">
          <div class="zt-section-title clickable" id="zt-flood-toggle">
            <span>${T('💥 Спам (Эмодзи & Рука)', '💥 Reactions & Hand')}</span>
            <span id="zt-flood-arrow">▸</span>
          </div>
          <div id="zt-flood-body" style="display:none;flex-direction:column;gap:8px">

            <!-- Пресеты (без клоуна) -->
            <div id="zt-flood-presets" style="display:flex;gap:4px;flex-wrap:wrap"></div>

            <!-- Свой эмодзи -->
            <div class="zt-row">
              <span style="font-size:11px;color:#8e8e99;white-space:nowrap">${T('Свой:', 'Custom:')}</span>
              <input class="zt-input" id="zt-flood-custom" placeholder="😈" maxlength="4" style="width:42px;flex:none;text-align:center;font-size:16px"/>
              <button class="zt-btn secondary" id="zt-flood-custom-sel" style="padding:4px 8px;font-size:11px">${T('Выбрать', 'Select')}</button>
            </div>

            <!-- Скорость -->
            <div>
              <div style="display:flex;justify-content:space-between;margin-bottom:3px">
                <span style="font-size:10px;color:#71717a">${T('Интервал:', 'Interval:')}</span>
                <span id="zt-flood-speed-val" style="font-size:10px;color:#10b981;font-weight:700">100${T('мс', 'ms')}</span>
              </div>
              <input type="range" id="zt-flood-speed" min="20" max="1000" value="100" step="10"
                     style="width:100%;accent-color:#10b981;cursor:pointer">
              <div style="display:flex;gap:4px;margin-top:4px">
                <button class="zt-btn secondary" id="zt-speed-turbo" style="padding:2px 6px;font-size:10px;flex:1">⚡ 20${T('мс', 'ms')}</button>
                <button class="zt-btn secondary" id="zt-speed-fast" style="padding:2px 6px;font-size:10px;flex:1">🚀 50${T('мс', 'ms')}</button>
                <button class="zt-btn secondary" id="zt-speed-norm" style="padding:2px 6px;font-size:10px;flex:1">⏱ 150${T('мс', 'ms')}</button>
              </div>
            </div>

            <!-- Лимит -->
            <div class="zt-row">
              <span style="font-size:11px;color:#8e8e99;white-space:nowrap">${T('Лимит:', 'Limit:')}</span>
              <input class="zt-input" type="number" id="zt-flood-max" value="50" min="0" max="9999" style="width:60px;flex:none"/>
              <span style="font-size:10px;color:#52525b">(0 = ∞)</span>
            </div>

            <!-- Кнопки управления эмодзи -->
            <div class="zt-row">
              <button class="zt-btn danger" id="zt-flood-start" style="flex:2">${T('💥 Спам', '💥 Spam')}</button>
              <button class="zt-btn accent" id="zt-flood-burst" style="flex:2" title="${T('Залп x30 (Alt+Z)', 'Burst x30 (Alt+Z)')}">${T('⚡ Залп x30', '⚡ Burst x30')}</button>
              <button class="zt-btn secondary" id="zt-flood-stop" style="flex:1">⏹</button>
            </div>

            <!-- ── Подблок: Спам рукой (Jumper) ── -->
            <div style="border-top:1px solid #23232a;padding-top:8px;margin-top:2px;display:flex;flex-direction:column;gap:6px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:11px;font-weight:700;color:#f59e0b;display:flex;align-items:center;gap:4px">${T('✋ Спам рукой (Jumper)', '✋ Hand Jumper')}</span>
                <span id="zt-hand-count" style="font-size:10px;color:#71717a">${T('Готов', 'Ready')}</span>
              </div>

              <!-- Скорость руки -->
              <div style="display:flex;align-items:center;justify-content:space-between">
                <span style="font-size:10px;color:#71717a">${T('Интервал:', 'Interval:')}</span>
                <span id="zt-hand-speed-val" style="font-size:10px;color:#f59e0b;font-weight:700">250мс</span>
              </div>
              <div style="display:flex;gap:4px">
                <button class="zt-btn secondary" id="zt-hand-fast" style="padding:2px 6px;font-size:10px;flex:1">⚡ 180мс</button>
                <button class="zt-btn secondary" id="zt-hand-norm" style="padding:2px 6px;font-size:10px;flex:1;border-color:#f59e0b">⏱ 250мс</button>
                <button class="zt-btn secondary" id="zt-hand-slow" style="padding:2px 6px;font-size:10px;flex:1">🐢 450мс</button>
              </div>

              <!-- Кнопки управления рукой -->
              <div class="zt-row">
                <button class="zt-btn danger" id="zt-hand-start" style="flex:2.5;background:#b45309;border-color:#d97706;color:#fff" title="${T('Запустить цикличное поднятие и опускание руки', 'Start cycle raise/lower hand')}">${T('✋ Спам рукой', '✋ Hand Spam')}</button>
                <button class="zt-btn secondary" id="zt-hand-stop" style="flex:1" title="${T('Остановить спам рукой', 'Stop hand spam')}">⏹</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ── 5. МОНИТОРИНГ & ЛОГИ СОБЫТИЙ ── -->
        <div class="zt-section">
          <div class="zt-section-title clickable" id="zt-monitor-toggle">
            <div style="display:flex;align-items:center;gap:6px">
              <span>${T('📋 Мониторинг & Логи', '📋 Activity Monitor & Logs')}</span>
              <span id="zt-monitor-badge" style="font-size:9px;background:#10b981;color:#000;padding:1px 4px;border-radius:3px;font-weight:700">LIVE</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px">
              <button class="zt-btn" id="zt-monitor-power" style="padding:1px 6px;font-size:10px;height:18px;background:#15803d;border-color:#16a34a;color:#fff" title="${T('Включить / приостановить мониторинг', 'Toggle activity monitoring')}">${T('ВКЛ', 'ON')}</button>
              <span id="zt-monitor-arrow">▾</span>
            </div>
          </div>
          <div id="zt-monitor-body" style="display:flex;flex-direction:column;gap:6px">

            <!-- Живое табло счетчиков -->
            <div id="zt-monitor-stats" style="background:#0a0a0d;border:1px solid #1f1f26;border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:3px">
              <span style="color:#71717a;font-size:10px">${T('Загрузка данных...', 'Loading data...')}</span>
            </div>

            <!-- Чекбоксы фильтрации -->
            <div style="display:flex;flex-wrap:wrap;gap:4px 8px;padding:1px 0;font-size:10px;color:#a1a1aa">
              <label style="display:flex;align-items:center;gap:3px;cursor:pointer">
                <input type="checkbox" id="zt-flt-join" checked style="accent-color:#10b981;cursor:pointer"/> ${T('Вход/Выход', 'Join/Leave')}
              </label>
              <label style="display:flex;align-items:center;gap:3px;cursor:pointer">
                <input type="checkbox" id="zt-flt-nick" checked style="accent-color:#10b981;cursor:pointer"/> ${T('Ники', 'Nicks')}
              </label>
              <label style="display:flex;align-items:center;gap:3px;cursor:pointer">
                <input type="checkbox" id="zt-flt-hand" checked style="accent-color:#10b981;cursor:pointer"/> ${T('Руки', 'Hands')}
              </label>
              <label style="display:flex;align-items:center;gap:3px;cursor:pointer" title="${T('Показывать в тексте лога каждое включение микрофона', 'Show each mic unmute in log')}">
                <input type="checkbox" id="zt-flt-mic" style="accent-color:#10b981;cursor:pointer"/> ${T('Мик в лог', 'Mic to log')}
              </label>
              <label style="display:flex;align-items:center;gap:3px;cursor:pointer" title="${T('Показывать в тексте лога каждое включение камеры', 'Show each cam turn-on in log')}">
                <input type="checkbox" id="zt-flt-cam" style="accent-color:#10b981;cursor:pointer"/> ${T('Кам в лог', 'Cam to log')}
              </label>
            </div>

            <!-- Окно лога -->
            <div id="zt-log-box" style="height:115px;max-height:130px;overflow-y:auto;background:#0a0a0d;border:1px solid #23232a;border-radius:6px;padding:6px 8px;font-family:Consolas,monospace;font-size:11px;display:flex;flex-direction:column">
              <span style="color:#52525b;font-size:10px">${T('Ожидание событий...', 'Waiting for events...')}</span>
            </div>

            <!-- Кнопки управления логом -->
            <div class="zt-row">
              <button class="zt-btn secondary" id="zt-log-top" style="flex:1.5;font-size:11px">${T('📊 Топ активности', '📊 Leaderboard')}</button>
              <button class="zt-btn secondary" id="zt-log-copy" style="flex:1;font-size:11px">${T('📋 Копия', '📋 Copy')}</button>
              <button class="zt-btn secondary" id="zt-log-clear" style="flex:1;font-size:11px">${T('🗑 Очистить', '🗑 Clear')}</button>
            </div>
          </div>
        </div>

        <!-- ── 6. ИНСПЕКТОР МИТИНГА (PASSCODE & DATA) ── -->
        <div class="zt-section">
          <div class="zt-section-title clickable" id="zt-inspector-toggle">
            <div style="display:flex;align-items:center;gap:6px">
              <span>${T('🔍 Инспектор митинга', '🔍 Meeting Inspector')}</span>
              <span class="zt-kbd" style="color:#10b981;font-weight:700">Passcode</span>
            </div>
            <span id="zt-inspector-arrow">▸</span>
          </div>
          <div id="zt-inspector-body" style="display:none;flex-direction:column;gap:6px">
            <div id="zt-inspector-content" style="background:#0a0a0d;border:1px solid #1f1f26;border-radius:6px;padding:7px 9px;display:flex;flex-direction:column;gap:5px;font-size:11px">
              <span style="color:#71717a;font-size:10px">${T('Нажми «Сканировать данные»...', 'Click «Scan Redux»...')}</span>
            </div>
            <div class="zt-row">
              <button class="zt-btn accent" id="zt-inspector-scan" style="flex:1.5;font-size:11px">${T('🔍 Сканировать Redux', '🔍 Scan Redux')}</button>
              <button class="zt-btn secondary" id="zt-inspector-copy-all" style="flex:1;font-size:11px">${T('📋 Скопировать всё', '📋 Copy All')}</button>
            </div>
          </div>
        </div>

        <!-- Статус -->
        <div id="zt-status"></div>
      </div>
    `;
    document.body.appendChild(w);

    // Подключаем функционал сворачивания ко всем 5 секциям
    function setupSectionToggle(toggleId, bodyId, arrowId, defaultOpen = false) {
      const toggle = document.getElementById(toggleId);
      const body   = document.getElementById(bodyId);
      const arrow  = document.getElementById(arrowId);
      if (!toggle || !body || !arrow) return;

      body.style.display = defaultOpen ? 'flex' : 'none';
      if (defaultOpen) body.style.flexDirection = 'column';
      arrow.textContent = defaultOpen ? '▾' : '▸';

      toggle.addEventListener('click', () => {
        const open = body.style.display === 'none';
        body.style.display = open ? 'flex' : 'none';
        if (open) body.style.flexDirection = 'column';
        arrow.textContent = open ? '▾' : '▸';
      });
    }

    setupSectionToggle('zt-rename-toggle',    'zt-rename-body',    'zt-rename-arrow',    true);
    setupSectionToggle('zt-stora-toggle',     'zt-stora-body',     'zt-stora-arrow',     true);
    setupSectionToggle('zt-avatars-toggle',   'zt-avatars-body',   'zt-avatars-arrow',   false);
    setupSectionToggle('zt-flood-toggle',     'zt-flood-body',     'zt-flood-arrow',     false);
    setupSectionToggle('zt-monitor-toggle',   'zt-monitor-body',   'zt-monitor-arrow',   true);
    setupSectionToggle('zt-inspector-toggle', 'zt-inspector-body', 'zt-inspector-arrow', false);

    document.getElementById('zt-inspector-toggle')?.addEventListener('click', () => {
      setTimeout(updateInspectorUI, 50);
    });

    // Автозаполнение имени и первоначальная отрисовка недавних
    setTimeout(() => {
      const iwin = getIwin(), store = getStore(iwin), me = getCurrentUser(store);
      if (me?.displayName) {
        const inp = document.getElementById('zt-name');
        if (inp && !inp.value) inp.value = me.displayName;
        addRecentNick(me.displayName);
      }
    }, 1500);

    renderRecentNicks();
    renderAvatarList([], getIwin());
    document.getElementById('zt-recent-clear')?.addEventListener('click', clearRecentNicks);

    // Счётчик длины ника
    document.getElementById('zt-name')?.addEventListener('input', e => {
      const v = e.target.value;
      const charEl = document.getElementById('zt-char');
      if (!charEl) return;
      if (isGhostNick(v)) {
        charEl.textContent = T('👻 Невидимка (1/80)', '👻 Ghost (1/80)');
        charEl.style.color = '#a855f7';
      } else {
        charEl.textContent = `${v.length}/80`;
        charEl.style.color = '#52525b';
      }
    });

    // Rename (обычный)
    document.getElementById('zt-rename-btn')?.addEventListener('click', () => {
      const iwin = getIwin(), req = getReq(iwin), store = getStore(iwin);
      const me = getCurrentUser(store), n = document.getElementById('zt-name').value;
      if (!n) { showStatus(T('⚠ Введи имя', '⚠ Enter name'), '#f59e0b'); return; }
      doRename(n, me?.displayName ?? '', req, store) ? showStatus(isGhostNick(n) ? T('👻 Ник → Невидимка', '👻 Nick → Ghost') : T(`✅ Ник → "${n}"`, `✅ Nick → "${n}"`), '#10b981') : showStatus(T('❌ Войди в митинг', '❌ Join a meeting first'), '#ef4444');
    });
    document.getElementById('zt-name')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('zt-rename-btn')?.click();
    });

    // Кнопка ника хоста в смене ника (МГНОВЕННАЯ СМЕНА КАК У 👻)
    document.getElementById('zt-name-host-btn')?.addEventListener('click', () => {
      const iwin = getIwin(), req = getReq(iwin), store = getStore(iwin);
      const hostNick = getHostNick(store);
      if (!hostNick) {
        showStatus(T('❌ Хост не найден', '❌ Host not found'), '#ef4444');
        return;
      }
      const inp = document.getElementById('zt-name');
      if (inp) {
        inp.value = hostNick;
        const charEl = document.getElementById('zt-char');
        if (charEl) {
          charEl.textContent = `${hostNick.length}/80`;
          charEl.style.color = '#52525b';
        }
      }
      const me = getCurrentUser(store);
      if (store && req) {
        doRename(hostNick, me?.displayName ?? '', req, store)
          ? showStatus(T(`👑 Ник изменён на Хоста: "${hostNick}"`, `👑 Renamed to Host: "${hostNick}"`), '#10b981')
          : showStatus(T('👑 Ник хоста подставлен!', '👑 Host nickname inserted!'), '#10b981');
      } else {
        showStatus(T('👑 Ник хоста подставлен!', '👑 Host nickname inserted!'), '#10b981');
      }
    });

    // Кнопка Невидимка в смене ника (👻)
    document.getElementById('zt-name-ghost-btn')?.addEventListener('click', () => {
      const iwin = getIwin(), req = getReq(iwin), store = getStore(iwin);
      const inp = document.getElementById('zt-name');
      if (inp) {
        inp.value = INVISIBLE_NICK;
        const charEl = document.getElementById('zt-char');
        if (charEl) {
          charEl.textContent = T('👻 Невидимка (1/80)', '👻 Ghost (1/80)');
          charEl.style.color = '#a855f7';
        }
      }
      const me = getCurrentUser(store);
      if (store && req) {
        doRename(INVISIBLE_NICK, me?.displayName ?? '', req, store)
          ? showStatus(T('👻 Ник стал невидимым!', '👻 Nickname became invisible!'), '#10b981')
          : showStatus(T('👻 Невидимый символ вставлен!', '👻 Invisible symbol inserted!'), '#10b981');
      } else {
        showStatus(T('👻 Невидимый символ вставлен!', '👻 Invisible symbol inserted!'), '#10b981');
      }
    });

    // Рулетка ников (Хамелеон) переключатель
    document.getElementById('zt-mimic-toggle')?.addEventListener('change', e => {
      if (e.target.checked) {
        startMimicRoulette();
      } else {
        stopMimicRoulette();
        showStatus(T('⏹ Рулетка ников остановлена', '⏹ Nick roulette stopped'), '#71717a');
      }
    });

    // Пресеты скорости рулетки ников
    document.getElementById('zt-mimic-spd-turbo')?.addEventListener('click', () => setMimicSpeed(200));
    document.getElementById('zt-mimic-spd-fast')?.addEventListener('click', () => setMimicSpeed(400));
    document.getElementById('zt-mimic-spd-norm')?.addEventListener('click', () => setMimicSpeed(750));
    document.getElementById('zt-mimic-spd-slow')?.addEventListener('click', () => setMimicSpeed(1500));

    // Кнопка Невидимка в Завесе (👻)
    document.getElementById('zt-stora-ghost-btn')?.addEventListener('click', () => {
      const tempInp = document.getElementById('zt-temp-nick');
      if (tempInp) tempInp.value = INVISIBLE_NICK;
      showStatus(T('👻 Завеса будет с невидимым ником!', '👻 Curtain will use invisible nick!'), '#a855f7');
    });

    // 1. Завеса Мгновенно
    document.getElementById('zt-stora-fast-btn')?.addEventListener('click', () => {
      const iwin = getIwin(), req = getReq(iwin), store = getStore(iwin), t = document.getElementById('zt-temp-nick').value;
      if (!store) { showStatus(T('❌ Войди в митинг', '❌ Join a meeting first'), '#ef4444'); return; }
      runStora(t, req, store, iwin, false, 0);
    });

    // 2. Завеса С настройкой
    document.getElementById('zt-stora-btn')?.addEventListener('click', () => {
      const iwin = getIwin(), req = getReq(iwin), store = getStore(iwin), t = document.getElementById('zt-temp-nick').value;
      if (!store) { showStatus(T('❌ Войди в митинг', '❌ Join a meeting first'), '#ef4444'); return; }
      runStora(t, req, store, iwin, true, 0);
    });

    // 3. Сетап кисти
    document.getElementById('zt-stora-setup-btn')?.addEventListener('click', async () => {
      showStatus(T('⚙ Настраиваю Dark grey и фигуру...', '⚙ Configuring Dark grey & shape...'), '#8e8e99');
      const ok = await prepareStoraTools();
      showStatus(ok ? T('✅ Кисть готова к броску!', '✅ Brush ready to cast!') : T('❌ Открой аннотацию', '❌ Open annotation toolbar first'), ok ? '#10b981' : '#ef4444');
    });

    // 4. Корзина (Alt+D) — очистить все слои аннотации
    document.getElementById('zt-stora-clear-all')?.addEventListener('click', async () => {
      stopDisco();
      await clearAllAnno();
      showStatus(T('🗑 Все слои очищены!', '🗑 All layers cleared!'), '#10b981');
    });

    // 5. Дискотека (Стробоскоп)
    document.getElementById('zt-stora-disco-btn')?.addEventListener('click', () => {
      startDisco(getIwin());
    });
    document.getElementById('zt-stora-disco-stop')?.addEventListener('click', async () => {
      stopDisco();
      await clearAllAnno();
      showStatus(T('⏹ Дискотека остановлена, слои очищены!', '⏹ Disco stopped, layers cleared!'), '#8e8e99');
    });

    // Клон Хоста в Завесе (ник + аватар)
    document.getElementById('zt-host-clone-btn')?.addEventListener('click', async () => {
      const iwin = getIwin(), store = getStore(iwin);
      if (!store) { showStatus(T('❌ Войди в митинг', '❌ Join a meeting first'), '#ef4444'); return; }
      const attendees = store.getState()?.attendeesList?.attendeesList ?? [];
      const list = Array.isArray(attendees) ? attendees : Object.values(attendees);
      const host = list.find(a => a.isHost) || list[0];
      if (!host) { showStatus(T('❌ Хост не найден', '❌ Host not found'), '#ef4444'); return; }

      const tempInp = document.getElementById('zt-temp-nick');
      if (tempInp) tempInp.value = host.displayName;

      await copyParticipantAvatar({
        name: host.displayName,
        avatarUrl: (host.avatar && host.avatar.startsWith('http')) ? host.avatar : null,
        bgColor: '',
        userId: host.userId
      }, iwin);

      showStatus(T('👑 Данные хоста скопированы!', '👑 Host credentials cloned!'), '#10b981');
    });

    // Сканирование участников
    document.getElementById('zt-avatars-scan')?.addEventListener('click', () => {
      const iwin  = getIwin();
      const store = getStore(iwin);
      if (!store) { showStatus(T('❌ Войди в митинг', '❌ Join a meeting first'), '#ef4444'); return; }
      showStatus(T('⏳ Сканирую Redux...', '⏳ Scanning Redux...'), '#8e8e99');
      const participants = scanParticipants(store, iwin);
      renderAvatarList(participants, iwin);
    });

    // Пресеты эмодзи (без клоуна)
    const presetsEl = document.getElementById('zt-flood-presets');
    [...FLOOD_EMOJIS, { e: '🔀', label: 'mix' }].forEach(({ e, label }) => {
      const btn = document.createElement('button');
      btn.className = 'zt-btn secondary';
      btn.textContent = e;
      btn.title = label;
      btn.style.cssText = 'padding:4px 7px;font-size:16px;line-height:1;flex:none';
      btn.dataset.emoji = e === '🔀' ? 'mix' : e;
      btn.addEventListener('click', () => {
        _selectedEmoji = btn.dataset.emoji;
        presetsEl.querySelectorAll('button').forEach(b => b.style.borderColor = '#27272f');
        btn.style.borderColor = '#10b981';
      });
      if (e === '👍') { btn.style.borderColor = '#10b981'; }
      presetsEl.appendChild(btn);
    });

    // Выбор своего эмодзи
    document.getElementById('zt-flood-custom-sel')?.addEventListener('click', () => {
      const val = document.getElementById('zt-flood-custom').value.trim();
      if (!val) return;
      _selectedEmoji = val;
      presetsEl.querySelectorAll('button').forEach(b => b.style.borderColor = '#27272f');
      showStatus(T(`✅ Выбрано: ${val}`, `✅ Selected: ${val}`), '#10b981');
    });

    // Слайдер скорости
    const speedInp = document.getElementById('zt-flood-speed');
    const speedVal = document.getElementById('zt-flood-speed-val');
    speedInp.addEventListener('input', e => {
      speedVal.textContent = `${e.target.value}мс`;
    });

    document.getElementById('zt-speed-turbo')?.addEventListener('click', () => {
      speedInp.value = 20; speedVal.textContent = '20мс';
    });
    document.getElementById('zt-speed-fast')?.addEventListener('click', () => {
      speedInp.value = 50; speedVal.textContent = '50мс';
    });
    document.getElementById('zt-speed-norm')?.addEventListener('click', () => {
      speedInp.value = 150; speedVal.textContent = '150мс';
    });

    // Запуск спама
    document.getElementById('zt-flood-start')?.addEventListener('click', () => {
      const iwin      = getIwin();
      const req       = getReq(iwin);
      const store     = getStore(iwin);
      const speed     = parseInt(speedInp.value);
      const maxCount  = parseInt(document.getElementById('zt-flood-max').value) || 0;
      startFlood(req, store, _selectedEmoji, speed, maxCount);
    });

    // Залп x30
    document.getElementById('zt-flood-burst')?.addEventListener('click', () => {
      const iwin  = getIwin();
      const req   = getReq(iwin);
      const store = getStore(iwin);
      if (!store) { showStatus(T('❌ Войди в митинг', '❌ Join a meeting first'), '#ef4444'); return; }
      showStatus(T('⚡ Залп 30 реакций...', '⚡ Burst of 30 reactions...'), '#c7d2fe');
      const isMix = (_selectedEmoji === 'mix');
      for (let i = 0; i < 30; i++) {
        setTimeout(() => {
          const em = isMix ? MIX_POOL[Math.floor(Math.random() * MIX_POOL.length)] : _selectedEmoji;
          sendWsReaction(em, req, store);
        }, i * 25);
      }
      setTimeout(() => showStatus(T('✅ Залп завершён!', '✅ Burst finished!'), '#10b981'), 30 * 25 + 200);
    });

    // Стоп спам
    document.getElementById('zt-flood-stop')?.addEventListener('click', () => {
      stopFlood();
      showStatus(T('⏹ Спам остановлен', '⏹ Flood stopped'), '#8e8e99');
    });

    // ── Спам рукой (Jumper) события ──
    let _handInterval = 250;
    const handSpeedVal = document.getElementById('zt-hand-speed-val');
    const updateHandSpeedBtns = (val, activeBtnId) => {
      _handInterval = val;
      if (handSpeedVal) handSpeedVal.textContent = val + 'мс';
      ['zt-hand-fast', 'zt-hand-norm', 'zt-hand-slow'].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.style.borderColor = (id === activeBtnId) ? '#f59e0b' : '#27272f';
      });
    };

    document.getElementById('zt-hand-fast')?.addEventListener('click', () => updateHandSpeedBtns(180, 'zt-hand-fast'));
    document.getElementById('zt-hand-norm')?.addEventListener('click', () => updateHandSpeedBtns(250, 'zt-hand-norm'));
    document.getElementById('zt-hand-slow')?.addEventListener('click', () => updateHandSpeedBtns(450, 'zt-hand-slow'));

    document.getElementById('zt-hand-start')?.addEventListener('click', () => {
      const iwin = getIwin();
      const req = getReq(iwin);
      const store = getStore(iwin);
      startHandSpam(req, store, _handInterval);
    });

    document.getElementById('zt-hand-stop')?.addEventListener('click', () => {
      stopHandSpam();
    });

    // ── Мониторинг & Логи события ──
    const pwrBtn = document.getElementById('zt-monitor-power');
    const badgeEl = document.getElementById('zt-monitor-badge');
    pwrBtn?.addEventListener('click', e => {
      e.stopPropagation();
      _monitorActive = !_monitorActive;
      if (_monitorActive) {
        pwrBtn.textContent = T('ВКЛ', 'ON');
        pwrBtn.style.background = '#15803d';
        pwrBtn.style.borderColor = '#16a34a';
        pwrBtn.style.color = '#fff';
        if (badgeEl) {
          badgeEl.textContent = 'LIVE';
          badgeEl.style.background = '#10b981';
          badgeEl.style.color = '#000';
        }
        showStatus(T('🟢 Мониторинг активен', '🟢 Monitoring active'), '#10b981');
      } else {
        pwrBtn.textContent = T('ВЫКЛ', 'OFF');
        pwrBtn.style.background = '#27272f';
        pwrBtn.style.borderColor = '#3f3f46';
        pwrBtn.style.color = '#a1a1aa';
        if (badgeEl) {
          badgeEl.textContent = 'PAUSE';
          badgeEl.style.background = '#3f3f46';
          badgeEl.style.color = '#a1a1aa';
        }
        showStatus(T('⏸ Мониторинг на паузе', '⏸ Monitoring paused'), '#71717a');
      }
    });

    // Чекбоксы фильтров
    document.getElementById('zt-flt-join')?.addEventListener('change', e => _filterJoinLeave = e.target.checked);
    document.getElementById('zt-flt-nick')?.addEventListener('change', e => _filterRename = e.target.checked);
    document.getElementById('zt-flt-hand')?.addEventListener('change', e => _filterHand = e.target.checked);
    document.getElementById('zt-flt-mic')?.addEventListener('change', e => _filterMic = e.target.checked);
    document.getElementById('zt-flt-cam')?.addEventListener('change', e => _filterCam = e.target.checked);

    // Кнопки лога
    document.getElementById('zt-log-top')?.addEventListener('click', showLeaderboard);
    document.getElementById('zt-log-clear')?.addEventListener('click', () => {
      _logEntries.length = 0;
      const box = document.getElementById('zt-log-box');
      if (box) box.innerHTML = '<span style="color:#52525b;font-size:10px">Лог очищен</span>';
    });
    document.getElementById('zt-log-copy')?.addEventListener('click', async () => {
      const text = _logEntries.map(e => `[${e.time}] ${e.text.replace(/<[^>]+>/g, '')}`).join('\n');
      await navigator.clipboard.writeText(text || 'Лог пуст');
      showStatus(T('📋 Лог скопирован в буфер!', '📋 Log copied to clipboard!'), '#10b981');
    });

    // ── Кнопки Инспектора митинга ──
    document.getElementById('zt-inspector-scan')?.addEventListener('click', () => {
      updateInspectorUI();
      showStatus(T('🔍 Данные митинга обновлены!', '🔍 Meeting data refreshed!'), '#10b981');
    });
    document.getElementById('zt-inspector-copy-all')?.addEventListener('click', async () => {
      const iwin = getIwin(), store = getStore(iwin);
      const d = getMeetingInspectorData(store, iwin);
      if (!d) { showStatus(T('❌ Данные не найдены', '❌ Data not found'), '#ef4444'); return; }
      const text = `=== ZOOM MEETING DATA ===\n` +
        `Тема: ${d.topic}\n` +
        `Meeting ID: ${d.rawMid || d.mid}\n` +
        `Пароль (Passcode): ${d.passcode}\n` +
        `UUID: ${d.uuid}\n` +
        `Хост: ${d.hostName}\n` +
        `Участников: ${d.attendeeCount}\n` +
        `Смена ника: ${d.policies.canRename === false ? 'Запрещено' : 'Разрешено'}\n` +
        `Включение микрофона: ${d.policies.canUnmute === false ? 'Запрещено' : 'Разрешено'}\n` +
        `Чат: ${d.policies.canChat === false ? 'Заблокирован' : 'Разрешен'}\n` +
        `Зал ожидания: ${d.policies.waitingRoom ? 'Включен' : 'Выключен'}`;
      await navigator.clipboard.writeText(text);
      showStatus(T('📋 Все данные митинга скопированы!', '📋 All meeting data copied!'), '#10b981');
    });

    // Запуск слушателя Redux для мониторинга
    setTimeout(() => {
      const iwin = getIwin(), store = getStore(iwin);
      if (store) initMonitorListener(store);
    }, 1200);

    // Свернуть виджет
    document.getElementById('zt-min')?.addEventListener('click', () => {
      w.classList.toggle('minimized');
      document.getElementById('zt-min').textContent = w.classList.contains('minimized') ? '□' : '━';
    });

    // Смена языка RU <-> EN
    document.getElementById('zt-lang')?.addEventListener('click', () => {
      _ztLang = (_ztLang === 'ru' ? 'en' : 'ru');
      try { sessionStorage.setItem('zt_lang', _ztLang); } catch {}
      buildWidget();
    });

    // Drag & Drop
    let pinned = false, ox = 0, oy = 0;
    document.getElementById('zt-pin')?.addEventListener('click', () => {
      pinned = !pinned;
      document.getElementById('zt-pin').textContent = pinned ? '📍' : '📌';
    });

    document.getElementById('zt-drag-handle')?.addEventListener('mousedown', e => {
      if (pinned || e.target.classList.contains('zt-icon-btn')) return;
      ox = e.clientX - w.offsetLeft; oy = e.clientY - w.offsetTop;
      const mv = e2 => {
        w.style.left = (e2.clientX - ox) + 'px';
        w.style.top  = (e2.clientY - oy) + 'px';
        w.style.right = 'auto';
        w.style.bottom = 'auto';
      };
      const up = () => {
        document.removeEventListener('mousemove', mv);
        document.removeEventListener('mouseup', up);
      };
      document.addEventListener('mousemove', mv);
      document.addEventListener('mouseup', up);
    });

    // Глобальные хоткеи:
    // Alt+S = Мгновенная завеса
    // Alt+D = Корзина (очистить все слои)
    // Alt+Z = Залп x30
    const handleKey = e => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return;
      if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'ы')) {
        e.preventDefault();
        document.getElementById('zt-stora-fast-btn')?.click();
      } else if (e.altKey && (e.code === 'KeyD' || e.key === 'd' || e.key === 'в')) {
        e.preventDefault();
        document.getElementById('zt-stora-clear-all')?.click();
      } else if (e.altKey && (e.code === 'KeyZ' || e.key === 'z' || e.key === 'я')) {
        e.preventDefault();
        document.getElementById('zt-flood-burst')?.click();
      }
    };
    window.addEventListener('keydown', handleKey);
    try { getIwin()?.addEventListener('keydown', handleKey); } catch {}

    window.__zt_cleanup = () => {
      try { stopDisco(); } catch {}
      try { stopFlood(); } catch {}
      try { stopHandSpam(); } catch {}
      try { stopMimicRoulette(); } catch {}
      window.removeEventListener('keydown', handleKey);
      try { getIwin()?.removeEventListener('keydown', handleKey); } catch {}
      document.getElementById('zoom-tools-widget')?.remove();
      document.getElementById('zoom-tools-style')?.remove();
      console.log('[ZT] Предыдущая версия выгружена для горячего обновления!');
    };
  }

  // Экспорт в глобальный объект для вызова из консоли по желанию
  window.zoomTools = window.zt = {
    startHandSpam: (ms = 250) => {
      const iwin = getIwin();
      startHandSpam(getReq(iwin), getStore(iwin), ms);
    },
    stopHandSpam,
    toggleHandSpam: (ms = 250) => {
      const iwin = getIwin();
      return toggleHandSpam(getReq(iwin), getStore(iwin), ms);
    },
    toggleHand: () => {
      const iwin = getIwin();
      return toggleHandAction(getReq(iwin), getStore(iwin), iwin);
    },
    startDisco: () => startDisco(getIwin()),
    stopDisco,
    clearAnno: clearAllAnno,
    inspectMeeting: () => {
      const iwin = getIwin(), store = getStore(iwin);
      return getMeetingInspectorData(store, iwin);
    },
    diagInspector: () => {
      const iwin = getIwin();
      const store = getStore(iwin);
      const state = store?.getState?.() || null;
      console.log('=== ZT DIAGNOSTICS ===');
      console.log('iwin:', iwin);
      console.log('store found:', !!store);
      console.log('state keys:', state ? Object.keys(state) : 'no state');
      console.log('meeting:', state?.meeting);
      console.log('meetingConfig:', state?.meetingConfig);
      console.log('inspector data:', getMeetingInspectorData(store, iwin));
      return { iwin, store: !!store, stateKeys: state ? Object.keys(state) : null };
    },
    startFlood: (emoji, speed = 100, max = 50) => {
      const iwin = getIwin();
      startFlood(getReq(iwin), getStore(iwin), emoji || _selectedEmoji, speed, max);
    },
    stopFlood,
    startMimicRoulette: (speed) => startMimicRoulette(speed),
    stopMimicRoulette: () => stopMimicRoulette(),
    toggleMimicRoulette: () => toggleMimicRoulette(),
    setMimicSpeed: (ms) => setMimicSpeed(ms),
    getMimicSpeed: () => _mimicSpeed
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildWidget);
  } else {
    buildWidget();
  }
})();
