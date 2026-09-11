# ⚡ Zoom Web Tools (v1.0.0)

> A lightweight, open-source utility toolkit for the Zoom Web Client (`app.zoom.us`). Adds handy features missing in the browser: screen presentation curtain, quick nickname & host cloning, reaction/hand spammers, meeting inspector (passcode & policies), and activity monitoring.

[🇷🇺 Читать на русском (README_RU.md)](./README_RU.md) | [🧠 Architecture & AI Guide (ARCHITECTURE.md)](./ARCHITECTURE.md)

---

> [!NOTE]
> 🤖 **AI-Created Project:** The code, architecture, Zoom Web reverse-engineering, and documentation were entirely generated and tested using AI (LLMs). This project is open for experimentation, refactoring, and exploration.

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

* **🪟 Screen Curtain (`Alt + S`):** Draws a solid dark blackout rectangle across the shared canvas. Ideal for quickly concealing confidential presentations. Supports temporary ghost nickname spoofing during the curtain with automatic restoration.
  * **Annotation permissions:** The meeting host must allow attendee annotations. If the host disabled annotations in room security settings, Zoom does not mount the drawing canvas and the script cannot cast the curtain.
  * **Open annotation toolbar:** The annotation toolbar must be active in Zoom (*View Options* at top of Zoom screen → *Annotate*). The script attempts to activate it automatically, but opening it manually once ensures readiness.
  * **Screen share idle timeout:** If the shared screen remains completely stationary for several minutes (or your Zoom window was minimized/inactive), the Zoom web client puts the drawing canvas to sleep and hides the toolbar. If you see a warning, simply move your mouse over the screen share or click *Annotate* again to wake the canvas.
* **🗑 Clear Canvas (`Alt + D`):** Triggers Zoom's built-in annotation trash button in one click, instantly wiping all drawn layers.
* **🌈 Disco Strobe Mode:** Test tool that smoothly alternates canvas fill colors in a non-blocking loop.
* **🏷 Nickname & Host Clone:** Instantly change your display name without Zoom modal prompts.
  * `👻` button: Inserts an invisible character (Hangul Filler `\u3164`).
  * `👑 Host` button: Instantly adopts the current meeting host's nickname.
* **🔀 Nick Roulette (Mimic):** A toggle switch in the nickname section that automatically mimics random conference attendees in real time.
  * **Speed presets:**
    * `⚡ 200ms` — **Turbo (Maximum speed):** 5 switches per second, pushing Zoom WebSocket limits to maximum pace.
    * `🚀 400ms` — **Fast:** 2.5 switches per second, highly dynamic and reliable.
    * `⏱ 750ms` — **Optimal (Default):** smooth, balanced rotation.
    * `🐢 1.5s` — **Relaxed:** steady and calm background mimicry.
  * **Protection:** Excludes yourself by `userId`, never repeats the same nickname twice in a row (if $\ge 2$ others present), and avoids cluttering manual recent nicks history.
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
* [`ARCHITECTURE.md`](./ARCHITECTURE.md) — Technical architecture, internal hook guide, and AI prompting instructions.
* [`README.md`](./README.md) — English documentation.
* [`README_RU.md`](./README_RU.md) — Russian documentation.
* [`LICENSE`](./LICENSE) — MIT License.

---

## 🔄 Zoom Updates & Compatibility

Zoom Web Client is periodically updated by Zoom Video Communications. The toolkit uses two distinct integration layers:
1. **Update-resilient features:**
   * **Meeting Inspector** (passcode, room ID, host security policies) and **participant lists** connect to Redux Store via React Fiber tree traversal (`__reactFiber$`).
   * **Screen Curtain** and **canvas clear** operate through native DOM events on the annotation canvas.
   * These features remain functional across frontend updates.
2. **Direct WebSocket features (nickname rename and reaction flood):**
   * These hook directly into internal Webpack module IDs: `MOD_SOCKET = 61142` and `MOD_EVENTS = 22371`.
   * **If a Zoom update breaks reactions or renaming:** it indicates Zoom re-indexed its Webpack bundle. You can discover the updated module IDs in 10 seconds using the snippet in [**`ARCHITECTURE.md`**](./ARCHITECTURE.md#5-troubleshooting-webpack-module-ids-after-zoom-updates).

---

## ⚠️ Disclaimer

This project is created strictly for **educational and research purposes** to explore client-side web application behavior and DOM interoperability. The author assumes no liability for misuse. This project is not affiliated with, sponsored by, or endorsed by Zoom Video Communications, Inc.
