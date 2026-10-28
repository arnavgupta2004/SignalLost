# SignalLost — storyboard

90 seconds, 16:9, 1920×1080 at 30 fps. Exact times live in [`timeline.json`](timeline.json); footage edits are resolved against the recorded interaction events at build time (see [README](README.md)).

**Visual system.** The film reuses the app's own design language: near-black `#080c11` panels, hairline `#263036` borders, lime `#c6fa6b` for state and success, cyan `#83d6d8` for the crew, amber `#e4c879` for the pilot, coral for danger. Type is Barlow Condensed for headlines, DM Sans for statements and IBM Plex Mono for labels, all bundled locally. A faint 64 px grid, a soft vignette and fine seeded grain unify footage and graphics. Colour carries meaning throughout: **cyan is always the crew, amber always the pilot.**

**Narrative arc.** Hook (six lives, a blind ship) → premise (two screens, one answer) → how it is built (authoritative server, role projection) → proof in the real interface (four systems, solved for real) → how live chat gets in → what is and is not proven → close.

| ID  | Time      | Scene          | Picture                                                                                                                                                                                                                                                                                                                                                         | Sound and music                                                                             |
| --- | --------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| S01 | 0:00–0:07 | Cold open      | Radar rings draw in; a sweep finds the Kepler-9 capsule. Its six windows light one by one (one per survivor, as in the app's docking art). "Sensors offline" under the ship. The radar dims and the SIGNALLOST. wordmark tracks in.                                                                                                                             | Low impact; six sonar pings; shimmer on the title. Music: low D drone and air.              |
| S02 | 0:07–0:16 | The premise    | The real landing page, cursor to **Start training**. Then two real frames as zoomed lenses: the pilot's flight limits (amber) above the crew's sector scans (cyan). Each sector gets a verdict computed from the captured mission data; the one safe sector is outlined.                                                                                        | Transition whoosh; a confirm tone as the safe sector resolves. Pads begin.                  |
| S03 | 0:16–0:29 | Architecture   | Mission-engine card with `projectState(room, role)`. Connectors draw to three real-thumbnail cards: pilot cockpit, crew panel, OBS overlay. Lime state packets flow to all three; cyan intel packets flow only to the crew; "Intel withheld" appears on the other two. Amber control packets return from the pilot beside `secureEqual(token, room.hostToken)`. | Data blips; ping on the intel reveal; tick on the token check.                              |
| S04 | 0:29–0:49 | Split evidence | Three beats in one layout: real footage at 1280×720, a step tracker, and a rail showing what the crew has and what the pilot has (the active role lights up). Each beat cuts from crew to pilot and ends on the real success, followed by a result card.                                                                                                        | UI ticks on every real click; confirm tones on each real stage success. Muted 96 BPM pulse. |
| S05 | 0:49–1:04 | Extraction     | Crew sees the safe lane; the pilot flies the docking console against drift, engages the tractor, and a simulated crew boost lands. The tail of the approach plays faster, labelled with its exact speed, into the real "You brought them home." debrief.                                                                                                        | Tractor hum and the boost riser on the real events. Pulse brightens, then resolves.         |
| S06 | 1:04–1:15 | Live chat      | Five-stage pipeline: Broadcaster OAuth (`user:read:chat`) → EventSub (`channel.chat.message`) → de-duplicate → parse → mission engine. A `!boost` message hops stage to stage; a replayed duplicate is dropped. Server-side resilience chips follow.                                                                                                            | A blip at each hop; a confirm on arrival. Steady pads, pulse out.                           |
| S07 | 1:15–1:26 | What is proven | "Tested is not the same as live." Synthetic validation (this footage, 29 unit tests, 13 browser tests, CI image check) beside real-world validation (real viewers, live broadcast, not shown in this footage).                                                                                                                                                  | Music thins to a low pad so the caveat is clear.                                            |
| S08 | 1:26–1:30 | End card       | Wordmark, "The streamer has the controls. Chat has the answers.", live URL and repository. Fade to black.                                                                                                                                                                                                                                                       | A soft resolving hit; D major colour; silence by 1:30.                                      |

## Honesty rules the film follows

- Every frame of the app is a real recording of the current build, captured in **training mode**. Crew messages are simulated by the app's own training feature and carry its **SIM** label. A footer says so whenever footage is on screen.
- No outcome is staged: the corridor, relays, handshake and docking were solved through the real interface, and the verdicts in S02 are computed from the captured mission's data.
- Speed changes are labelled on screen with the exact factor.
- S07 separates synthetic validation from real-world validation and states that live Twitch chat is not shown.

## Music cue sheet

| Time      | Section          | Direction                                                              |
| --------- | ---------------- | ---------------------------------------------------------------------- |
| 0:00–0:07 | Intro drone      | Low D drone and air; no melody, leaves room for the cold-open line.    |
| 0:07–0:29 | Pad progression  | Dm9 → B♭maj7 → Fadd9 → Csus2, eight-second chords, very soft.          |
| 0:29–0:49 | Working pulse    | Adds a muted 96 BPM pulse under the pads while the systems are solved. |
| 0:49–1:04 | Extraction build | Pulse brightens and rises toward the rescue; resolves on the debrief.  |
| 1:04–1:15 | Pipeline         | Pulse drops out; steady pads under the diagram.                        |
| 1:15–1:26 | Validation       | Thinned to a low pad so the honest caveat is clearly heard.            |
| 1:26–1:30 | Resolve          | D major add9 colour, fading to silence by 1:30.                        |

The included score is synthesised by `render/audio.py` as a placeholder that follows this sheet. To use a licensed track instead, replace `build/audio/music.wav` with a 90-second, 48 kHz file and run `render/mux.sh`.
