# ⚡ Zoom Web Tools (v1.0.0)

> A lightweight, open-source utility toolkit for the Zoom Web Client (`app.zoom.us`). Adds handy features missing in the browser: screen presentation curtain, quick nickname & host cloning, reaction/hand spammers, meeting inspector (passcode & policies), and activity monitoring.

[🇷🇺 Читать на русском (README_RU.md)](./README_RU.md) | [🧠 Architecture & AI Guide (ARCHITECTURE.md)](./ARCHITECTURE.md)

---

> [!NOTE]
> 🤖 **AI-Created Project:** The code, architecture, Zoom Web reverse-engineering, and documentation were entirely generated and tested using AI (LLMs). This project is open for experimentation, refactoring, and exploration.

> [!IMPORTANT]
> **This script works EXCLUSIVELY in the BROWSER version of Zoom (`app.zoom.us` or `*.zoom.us/wc/*`)**.  
> It does **NOT** work in the installed desktop client (`.exe` on Windows or `.app` on macOS), as client-side userscripts only run within browser web pages.

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
1. Open [**`zoom-tools-console.js`**](./zoom-tools-console.js) and copy all its contents (`Ctrl+A`, `Ctrl+C`).
2. Paste the code into the browser console (`Ctrl+V`) and hit **Enter**.
3. A sleek dark widget titled **Zoom Tools** will immediately appear in the bottom-right corner of the page.

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

## 🛠 Features Overview (Simple & Straightforward)

* **🌐 Language Switcher (RU / EN):** Click `🌐 RU` / `🌐 EN` in the widget header to switch the interface language on the fly without page reloads.
* **🪟 Screen Curtain (`Alt + S`):** Draws a solid dark blackout rectangle across the shared canvas. Ideal for quickly concealing confidential presentations. Supports temporary ghost nickname spoofing during the curtain with automatic restoration.
* **🗑 Clear Canvas (`Alt + D`):** Triggers Zoom's built-in annotation trash button in one click, instantly wiping all drawn layers.
* **🌈 Disco Strobe Mode:** Test tool that smoothly alternates canvas fill colors in a non-blocking loop.
* **🏷 Nickname & Host Clone:** Instantly change your display name without Zoom modal prompts.
  * `👻` button: Inserts an invisible character (Hangul Filler `\u3164`).
  * `👑 Host` button: Instantly adopts the current meeting host's nickname.
* **📸 Participants & Doppelganger:** Reads attendee data from Redux. One-click avatar cloning (including a transparent avatar for full ghost stealth).
* **💥 Reaction Flood (`Alt + Z`):** Dispatches emoji reactions directly over the internal WebSocket without opening the reactions drawer. Includes a 30-emoji burst button.
* **✋ Hand Jumper:** Automatically toggles raise/lower hand with fine-tuned delays to maintain the #1 spot in the attendee list.
* **📋 Activity Monitor & Live Log:** Displays live counts for online users, active mics, and cameras. Logs joins, leaves, renames, and audio unmute events in chronological order.
* **🔍 Meeting Inspector:** One-click copy for the room **Passcode** and Meeting ID. Displays topic and live host security policies (lock state, waiting room, chat permissions, self-unmute, and camera permissions). Green indicators denote open/allowed states.

---

## ⌨️ Keyboard Shortcuts

| Hotkey | Action | What it does |
|---|---|---|
| **`Alt + S`** | **Instant Curtain** | Instantly blacks out the shared screen |
| **`Alt + D`** | **Clear Canvas** | Wipes all drawing layers in 1 click |
| **`Alt + Z`** | **Reaction Burst** | Fires a quick burst of 30 emoji reactions |

---

## 🤖 For Developers & AI Prompting (Claude / GPT / DeepSeek)

This project was built and refined with the assistance of Large Language Models (LLMs). If you want to customize features, reverse-engineer additional WebSocket actions, or modify the interface using Claude, ChatGPT, or DeepSeek:

* Check the **[`ARCHITECTURE.md`](./ARCHITECTURE.md)** guide for technical breakdowns of Zoom's internal Webpack modules, Redux hooks, WebSocket event dispatching, and ready-to-use AI prompt templates.
* The codebase is written in pure vanilla ES6+ JavaScript without build steps, bundlers, or npm dependencies — easy to read and easy to feed into an LLM context window.

---

## 📁 Repository Files

* [`zoom-tools-console.js`](./zoom-tools-console.js) — Primary file for quick F12 console pasting (comments stripped to avoid paste truncation).
* [`zoom-tools.user.js`](./zoom-tools.user.js) — Full script for Tampermonkey / Violentmonkey.
* [`zoom-tools-dense.js`](./zoom-tools-dense.js) — Ultra-compact edition without indentation.
* [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Technical architecture, internal hook guide, and AI prompting instructions.
* [`README.md`](./README.md) — English documentation.
* [`README_RU.md`](./README_RU.md) — Russian documentation.
* [`LICENSE`](./LICENSE) — MIT License.

---

## ⚠️ Disclaimer

This project is created strictly for **educational and research purposes** to explore client-side web application behavior and DOM interoperability. The author assumes no liability for misuse. This project is not affiliated with, sponsored by, or endorsed by Zoom Video Communications, Inc.
