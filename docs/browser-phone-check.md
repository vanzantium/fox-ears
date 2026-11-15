# Fox Ears browser and phone check

**Written:** 2026-11-15 by Riven, for Taylor (America/Dawson_Creek).
**Why:** every tempo, key and section number so far came from the offline harness, which replays the browser's analyser on the box. Since P0 (branch `p0/binding-timing-cleanup`), the app stamps analyser readings with the audio clock and resamples them onto a fixed 10 ms grid. So a laptop at 60 Hz and a phone at 90 or 120 Hz should read the same song the same way. This check confirms that on real devices.

It takes about 5 minutes, mostly listening. The phone pass is yours; the desktop pass has also been run headless on the box (see `docs/p0-log-2026-11-15.md`).

## What you need

- The dev build running somewhere your device can reach:
  ```bash
  cd app && npm ci && npm run dev      # serves http://0.0.0.0:8080
  ```
  On a phone, open `http://<computer's LAN IP>:8080/` on the same Wi-Fi.
  Node 24 with **npm 11** is required, because npm 10's `npm ci` rejects the lockfile.
- The master: `fox-at-the-gate-master.m4a` (or `.wav`) from the Fox Ears Drive folder, downloaded to the device.

## Steps (same on laptop and phone)

1. Open the dev build. Leave the screen on and keep the tab in front for the whole song: a locked screen or a background tab pauses the display clock. The P0 code tolerates a short gap, but this pass checks the clean case.
2. Tap the **upload** icon (arrow-up, labelled "Upload audio", in the bottom player bar) and choose the master. It starts playing; let it play to the end (about 1:48). Don't seek.
3. When it ends, the map seals on its own and the map panel opens. If it doesn't, go to **Maps** (top right) and open the newest one.
4. Write down:
   - **Tempo** (BPM) and its confidence;
   - **Key** (tonic, major or minor) and confidence;
   - **Sections**: how many, and roughly where they start;
   - the device, the browser and its version.
5. Optional: play it a second time with the tab in the background for about 5 seconds midway, and note whether tempo changes.

## What to expect (harness on the box, 2026-11-15, all SOFT)

| Reading | Harness (master) | Pass if |
|---|---|---|
| Tempo | 96 BPM | 95–97 BPM (±1%) |
| Key | G major | G major (D major means the old tonic/dominant confusion came back) |
| Sections | 7 (cuts near 9.8, 29.8, 54.8, 64.8, 74.8, 99.2 s) | 6–8 sections, cuts within about 1 s of these |

Tempo should not depend on the screen. If the phone reads 48, 72, 128, 144 or 192 instead of 96, that is a metrical-level slip. Note it; that's useful.

## Send back

One line per device, for example:

> Pixel 8, Chrome 156, 120 Hz screen: 96 BPM (0.85), G major (0.86), 7 sections.

Results become **SOLID** for that device once they match the harness and your own answer key. Anything else stays **SOFT**.
