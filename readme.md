<p align="center">
  <img src="assets/logo/logo-128.png" alt="TimeWarp logo" width="96">
</p>

# TimeWarp

Speed up, slow down, or freeze time on any web page.

## Features

- **Speed control from 0× to 100×** with a logarithmic slider, so fine control at the slow end and quick jumps at the fast end
- **Freeze mode (0×)** halts timers, animations and media
- **One-click presets:** Freeze, 0.1×, 0.5×, 1×, 2×, 15×, 50×, 75×, 100×
- **Works in every tab and every frame**, including iframes
- **Remembers your settings** between sessions
- **Warp indicator** that shows a "Time warped" badge whenever the speed isn't 1×, so you never forget it's on


## Install (unpacked)

1. Download or clone this repo.
2. Open `chrome://extensions` in Chrome (or any Chromium browser).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and select the folder that contains `manifest.json`.
5. Pin TimeWarp from the puzzle-piece menu so the popup is one click away.

Requires a Chromium browser recent enough to support `"world": "MAIN"` content scripts.

## Usage

1. Click the TimeWarp icon.
2. Drag the slider or hit a preset.
3. Reload nothing. It applies instantly to open pages, and new pages pick it up on load.

## How it works

The extension is three small pieces:

- **`popup.html` / `popup.js`**: the UI. Maps the slider position to a speed, then saves it to `chrome.storage.local`.
- **`bridge.js`**: content script in the isolated world. It has access to the `chrome.*` APIs, reads the saved speed, listens for changes, and forwards the value to the page with `window.postMessage`.
- **`warp.js`**: content script in the page's **main world** at `document_start`, so it patches the clock APIs before any site code runs. It receives the speed from the bridge and applies it.

The split exists because only the main world can override the page's own `Date`, timers and so on, but only the isolated world can talk to extension storage.

## Known limitations

- **Effective speed is capped at 16×.** The popup offers up to 100×, but `warp.js` clamps the speed to the range -16 to 16, so anything above 16× behaves like 16×. Browsers also limit media `playbackRate` to roughly 16×.
- **Only the page's clock is changed.** Network requests, server-side timers, expiring sessions and anything the server decides based on real time are untouched.
- **Web Workers aren't patched.** Code running in a worker still sees real time.
- **Sites can detect it.** Pages that compare their clock against server time or use `Date` in unusual ways may break or misbehave.
- **`requestAnimationFrame` still fires at your display's refresh rate.** Only the timestamp it receives is warped.
- **Some pages won't cooperate.** Pages with strict CSP or unusual startup sequences may not warp perfectly, and some media elements reject rate changes.

## What it affects

| Thing | How it's warped |
| --- | --- |
| `Date` / `Date.now()` | Virtual clock that scales real elapsed time |
| `performance.now()` | Same virtual clock, kept continuous when speed changes |
| `setTimeout` / `setInterval` | Replaced with a virtual-time scheduler |
| `requestAnimationFrame` | Callbacks receive the virtual timestamp |
| CSS and Web Animations | `playbackRate` scaled on every animation |
| `<video>` and `<audio>` | `playbackRate` scaled, paused while frozen and resumed afterwards |