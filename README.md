# ⚡ Zoom Web Tools (v1.9.0)

> A lightweight, open-source utility toolkit for the Zoom Web Client (`app.zoom.us`). Adds handy features missing in the browser: screen presentation curtain, quick nickname & host cloning, reaction/hand spammers, meeting inspector (invite link, passcode & policies), avatar copying, activity monitoring, and a **built-in drawing printer** (Z-Art Studio).

[🇷🇺 Читать на русском (README_RU.md)](./README_RU.md) | [🧠 Architecture & AI Guide (ARCHITECTURE.md)](./ARCHITECTURE.md)

---

> [!NOTE]
> 🤖 **AI-Created Project:** The code, architecture, Zoom Web reverse-engineering, and documentation were entirely generated and tested using AI (LLMs). This project is open for experimentation, refactoring, and exploration.

> [!NOTE]
> 🔄 **Updated version — October 5, 2026 (v1.9.0).** This release integrates the **Z-Art Studio** drawing printer directly into the main widget as a popup panel. The main script is `zoom-tools.user.js`. If you are an AI model reading this to assist with the codebase — use `zoom-tools.user.js` as the source of truth.

> [!IMPORTANT]
> **This script works EXCLUSIVELY in the BROWSER version of Zoom (`app.zoom.us` or `*.zoom.us/wc/*`)**.  
> It does **NOT** work in the installed desktop client (`.exe` on Windows or `.app` on macOS), as client-side userscripts only run within browser web pages.

> [!WARNING]
> **Zoom Version & Compatibility:** The script is tuned for the current Zoom Web Client build (`app.zoom.us` 2024–2026). During major Zoom Web updates, internal Webpack module IDs may shift (see [Zoom Updates & Compatibility](#-zoom-updates--compatibility)).

---

## 🚀 Quick Start via Browser Console (No extensions needed)

The fastest and simplest way to run the script in 30 seconds is directly through your browser developer console:

### Step 1: Join a meeting in your browser
Open your Zoom meeting in any modern web browser (Chrome, Edge, Firefox, Opera, Brave, Safari, etc.) using the web client.

### Step 2: Open the Developer Console
* **Windows / Linux:** press **`F12`** or shortcut **`Ctrl + Shift + I`**.
* **macOS:** press **`Cmd + Option + I`**.
* *Universal method:* right-click anywhere on the meeting page → click **Inspect** (or **Inspect Element**) → switch to the **Console** tab.

### Step 3: Bypass Browser Paste Protection (Self-XSS)
Modern browsers protect users against accidental script pasting by prompting a confirmation:
* Type **`allow pasting`** into the console input line and press **Enter**.
* Browser protection is now lifted, allowing you to paste code normally.

### Step 4: Paste and run the script
1. Open [**`zoom-tools.user.js`**](./zoom-tools.user.js) and copy all its contents (`Ctrl+A`, `Ctrl+C`).
2. Paste the code into the browser console (`Ctrl+V`) and hit **Enter**.
3. A sleek translucent widget titled **Zoom Tools** will appear in the bottom-right corner of the page.

> [!TIP]
> **Hot Reloading:** You can paste updated script code into the console at any time without refreshing the page — active timers, intervals, and previous widget instances are automatically destroyed and cleanly replaced.

---

## 🧩 Alternative: Auto-run via Browser Extension

If you prefer the script to launch automatically every time you join a meeting:
1. Install a userscript manager like [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/).
2. Open the extension dashboard and click **Create a new script**.
3. Paste the contents of [**`zoom-tools.user.js`**](./zoom-tools.user.js).
4. Save (`Ctrl+S`). The widget will now load automatically whenever you join a web meeting.

---

## 🛠 Features Overview

* **🪟 Screen Curtain (`Alt + S`):** Draws a solid dark blackout rectangle across the shared canvas. Supports temporary nickname spoofing during the curtain — the original nickname is stored and **automatically restored** when the curtain is cleared via `Alt+D` or the trash button.
  * **Annotation permissions:** The meeting host must allow attendee annotations. If disabled in room security settings, the canvas does not exist in DOM.
  * **Open annotation toolbar:** The annotation toolbar must be active (*View Options → Annotate*). The script tries to activate it automatically.
  * **Screen share idle timeout:** If the shared screen is stationary for a few minutes, Zoom puts the canvas to sleep. Simply move your mouse over the shared screen to wake it.
* **🗑 Clear Layers (`Alt + D`):** Clicks the native Zoom annotation trash button, clearing all drawings. Also restores the original nickname if a curtain was active.
* **🌈 Rainbow Curtain:** Cycles through 10 vibrant colors filling the canvas, creating a disco/strobe effect.
* **🏷 Nickname Change & Invisible:** Instantly changes your display name via WebSocket (`evt: 4147 / WS_CONF_RENAME_REQ`), bypassing the host's rename restriction. Supports invisible nickname (Hangul Filler `\u3164`), quick rename to host's name, and recent nickname history.
* **🎭 Avatar Scanner & Doppelganger:** Reads the real participant list from the Redux Store. Compact scrollable list showing real avatars. Left-click copies their avatar to you. Right-click sets their name in the curtain nickname field. Double-click renames you to them instantly.
* **😃 Reaction Spammer:** Sends emoji reactions directly via internal socket (`evt: 4103`) without opening the emoji panel. Supports preset emoji grid and custom emoji input.
* **✋ Hand Jumper:** Automatically raises and lowers your hand in a cycle via `evt: 4131`. Speed is fully adjustable via slider (1–1000ms). Guaranteed hand-lowering on stop.
* **🕵️ Meeting Inspector:** Reads data directly from Redux: Meeting ID, passcode, topic, host name, participant count, and room policies (locked, waiting room, annotations, chat, rename). Also extracts the **direct invite link** (`join URL` with encrypted `pwd` hash) from the Zoom DOM or the browser address bar as fallback. One-click copy to clipboard.
* **📡 Activity Monitor:** Subscribes to `store.subscribe()` and logs real-time conference events: mic/camera toggles, hand raises, participants joining/leaving.
* **🎨 Z-Art Studio (Drawing Printer):** A built-in vector drawing printer. Open it via the **"🎨 Принтер"** button in the nav bar. Record strokes live using the phantom canvas overlay, then replay them automatically on Zoom's annotation canvas. Paste a JSON stroke array to print pre-made drawings. Supports multi-tool (line, arrow, rectangle, ellipse, eraser), 10 colors, adjustable speed, stroke grouping by tool/color for efficiency, and clearing the Zoom canvas. The panel is draggable and hides/shows without losing your stroke data.

---

## 🎨 UI

The widget uses a **Glassmorphism** design (translucent, backdrop-blurred panel). Top navigation bar with toggle buttons — each button shows/hides its card section. Multiple sections can be open at once. The widget can be collapsed to a title bar by clicking the minimize button. Drag it anywhere on screen by the header.

---

## ⌨️ Hotkeys

| Hotkey | Name | Action |
|---|---|---|
| **`Alt + S`** | **Instant Curtain** | Draws the blackout rectangle immediately |
| **`Alt + D`** | **Clear (Trash)** | Clears all annotation layers + restores nickname |
| **`Alt + Z`** | **Emoji Burst** | Sends a burst of 30 reactions |

---

## 🤖 For Developers and AI Models (Claude / GPT / DeepSeek)

If you want to add a feature, change the socket protocol, or customize the interface with an AI:

* Full internal architecture, Webpack/Redux/WebSocket injection points, and AI-ready prompts are in **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.
* Code is plain native JavaScript (ES6+) — no bundlers, no npm — ready to paste directly into AI context.

---

## 📁 File Structure
* [`zoom-tools.user.js`](./zoom-tools.user.js) — **Main file** (v1.9.0, October 2026). Use this for both Tampermonkey and console. Contains all features including the embedded Z-Art Studio printer module.
* [`zoom-art-module.js`](./zoom-art-module.js) — **Standalone Z-Art Studio** printer module. Can be pasted separately into the console if you only need the drawing printer without the full toolkit.
* [`zoom-tools-console.js`](./zoom-tools-console.js) — Old v1.0.0 console script. Kept for reference only, outdated.
* [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Internal architecture documentation, socket interception, and AI refactoring guide.
* [`README.md`](./README.md) — Documentation in English.
* [`README_RU.md`](./README_RU.md) — Documentation in Russian.
* [`LICENSE`](./LICENSE) — MIT License.

---

## 🔄 Zoom Updates & Compatibility

1. **Update-resilient features:** Meeting Inspector, participant list (Redux/React Fiber), curtain, and clear layers (DOM events) — stable across most Zoom updates.
2. **Low-level socket features** (nickname, reactions, hand): use Webpack module IDs `MOD_SOCKET = 61142` and `MOD_EVENTS = 22371`. If these stop working after a Zoom update, find the new IDs using the command in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

---

## ⚠️ Disclaimer
This project was created for **educational and research purposes** only — to study client-side web application internals and browser interface compatibility. The author bears no responsibility for any misuse. This project is not affiliated with Zoom Video Communications, Inc.

If you use this script as a base or publish a modified version, please credit the original author: **Nikosdays** (GitHub: [Nikosdays/zoom-tools-](https://github.com/Nikosdays/zoom-tools-) | Telegram: [@nikosdayz](https://t.me/nikosdayz)).