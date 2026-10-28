# SignalLost — technical demo film

A 90-second, 1920×1080, 30 fps film introducing SignalLost, built from real footage of the current app and motion graphics in the app's own design system. Narration is **not** included: the film ships with a silent voice-over track and a script timed to the picture, ready for your recording.

## Deliverables

| Path                            | What it is                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| `out/SignalLost-demo.mp4`       | The film: H.264 High, 1080p30, four AAC audio tracks (see below). No narration.            |
| `out/stems/{bed,music,sfx}.wav` | 48 kHz, 24-bit stereo stems for your editor.                                               |
| `voiceover.wav`                 | Silent 48 kHz mono placeholder, exactly 90.0 s, to replace with your recording.            |
| `voiceover_script.md`           | Narration with delivery notes and the source for every technical claim.                    |
| `voiceover_timing.csv`          | Scene ID, start, end, narration and visual cue for each line.                              |
| `storyboard.md`                 | Scene-by-scene picture, sound and music plan, plus the music cue sheet.                    |
| `timeline.json`                 | Single source of truth for scenes, edits, narration timing, sound cues and music sections. |

Audio tracks in the MP4: **1** music + sound effects (default) · **2** music stem · **3** sound-effects stem · **4** silent voice-over placeholder.

Generated media (`build/`, `out/`, `voiceover.wav`) is git-ignored; run `video/build.sh` to reproduce it.

## Adding your narration

1. Record against `voiceover_timing.csv` (one take from 0:00, or separate lines placed at their start times). Export a WAV of 90 seconds or less.
2. Run:
   ```bash
   video/render/add-voiceover.sh path/to/your-voiceover.wav
   ```
   This writes `out/SignalLost-demo-with-voiceover.mp4`. Music and effects duck automatically under your voice, and the mix is loudness-normalised to −14 LUFS for YouTube.

If you edit elsewhere, import `out/stems/bed.wav` (or the separate music and SFX stems) with your recording, and drop `voiceover.wav` in place of the silent track.

## How it is made

```
video/build.sh
  1. capture/capture.mjs     drive the real app in Chromium, record each step (DevTools screencast → constant 30 fps JPEGs)
  2. render/resolve.mjs      align edits to recorded events → build/edl.json
  3. render/voiceover-csv.mjs  write voiceover_timing.csv from timeline.json
  4. render/audio.py         synthesise music, effects and the silent voice-over track (NumPy)
  5. render/render.mjs       render compositor/ frame by frame in Chromium → H.264 (FFmpeg, CRF 15, BT.709)
  6. render/mux.sh           package picture + four audio tracks → out/SignalLost-demo.mp4
  7. render/qa.sh            stream report, black and frozen-frame detection, loudness, scene contact sheets
```

`video/build.sh --reuse` skips the capture and rebuilds from the existing footage.

**Authentic footage.** `capture.mjs` starts a Commander training mission and plays it through the interface with two windows, pilot and crew, the way two people would. It uses visible, eased cursor movement and deliberate pauses. Each click, stage success, tractor engagement and boost is timestamped. A capture is all-or-nothing: it writes to a staging folder and replaces the previous footage only after a complete run.

**Event-anchored edits.** Missions are random and real interaction timing varies, so edits in `timeline.json` are not fixed clip in-points. Each one names a recorded event and the film time it must land on (for example "the boost click lands at 58.3 s"). `resolve.mjs` computes the in-points and any speed change, and fails loudly if an edit would run past the recorded footage. On-screen data such as the sector verdicts in S02 and the outcome cards in S04 comes from the captured mission, not hand-typed values.

**Deterministic rendering.** The compositor has no CSS animations or timers. `window.__render(frame)` sets every property as a pure function of the frame number and resolves only after the footage frames for that moment have decoded. Grain uses seeded noise, fonts are bundled from `node_modules/@fontsource`, and nothing is fetched from the network. Re-rendering the same footage gives the same frames. The audio uses fixed seeds, so it is identical on every run.

Requirements: Node 22+, the repository's npm dependencies, Python 3 with NumPy, and FFmpeg with libx264. If Playwright's bundled Chromium is not installed, set `CHROMIUM_PATH` to a Chromium binary.

## Limitations and what to check yourself

- **No live Twitch footage.** All app footage is training mode with simulated crew messages, which the film states on screen and in narration. If the competition requires showing the app working on Twitch, record a short live clip (a real viewer's `!boost` during docking is the strongest moment) and cut it in around S05 or after S06.
- **No build-process footage.** The film does not show how the project was built. If the rules ask for that, add a separate segment.
- **App footage is 1440×810.** Chrome's screencast records at CSS-pixel size. It is shown downscaled (1280×720) almost everywhere, but the zoomed lenses in S02 enlarge it about 1.5×, so that text is slightly soft. Replacing those two lens stills with device-scale screenshots would sharpen it.
- **The audio was checked by measurement, not by ear.** The production environment had no audio playback. Loudness, peaks, timing and waveforms were verified (see `build/qa/report.txt`), but listen to the music and effects before submitting. A licensed track can replace `build/audio/music.wav`.
- **The live URL on the end card** (`signallost-vpnz.onrender.com`) is shown as provided. Confirm it loads before you publish.
- **Test counts** (29 unit + 13 browser) reflect CI on October 28, 2026. Update S07 and the narration if they change.
