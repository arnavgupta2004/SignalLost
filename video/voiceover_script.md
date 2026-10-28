# SignalLost — voice-over script

**Length:** 185 words over 90 seconds (about 145 words per minute, with deliberate pauses).
**Timing:** every line has a start and end time in [`voiceover_timing.csv`](voiceover_timing.csv). Record one continuous take from 0:00, or record lines separately and place each at its start time.
**Delivery:** calm and precise, like a flight engineer explaining a system they trust. No hype. Let the pauses marked `[pause]` breathe; they sit on visual moments.

Pronunciation: _SignalLost_ is one word, stress on SIG. _EventSub_ is "event sub". _OBS_ is spelled out.

---

### S01 · Cold open · 0:00.9 – 0:06.4

> Six people are stranded in a failing capsule. [short pause] The rescue ship's sensors are dark.

_Radar sweep finds six life signs. Leave the last half-second clean for the title reveal._

### S02 · The premise · 0:07.4 – 0:15.4

> SignalLost is a rescue game for a Twitch stream. The streamer flies the ship. [pause] The audience sees what the pilot cannot.

_The real landing page, then the pilot's limits beside the crew's scans. The last sentence should land as the safe sector lights up (about 0:13.4)._

### S03 · Architecture · 0:16.5 – 0:28.3

> One Node server runs the mission and sends each screen only what its role allows. [pause] Viewers receive the intel. [pause] The cockpit and the stream overlay never do.

_"Viewers receive the intel" should coincide with the cyan intel packets (from 0:21.6); "never do" with the "Intel withheld" labels (0:23.4)._

### S04 · Split evidence · 0:29.4 – 0:48.6

> Every system splits the evidence. The pilot knows the hull's limits; chat holds the scans.

> [pause] Engineers reason through four wiring rules that allow exactly one answer.

> [pause] Chat decodes the symbols, but the order to send them appears only in the cockpit.

_Three beats, about 6.5 seconds each, each ending as a stage is solved on screen._

### S05 · Extraction · 0:49.4 – 1:02.4

> The final approach is flown by hand against ion drift.

> [long pause, let the docking play] Any viewer can send boost to steady the ship for six seconds: one cell each, three per mission.

_"Boost" should fall near 0:58.3, when the power cell lands on screen. Say "boost" plainly; the on-screen command is `!boost`._

### S06 · Live chat · 1:04.6 – 1:14.6

> Live chat reaches the server through Twitch EventSub, with a read-only scope. [pause] Messages are de-duplicated, parsed into commands, and survive reconnects.

### S07 · What is proven · 1:15.5 – 1:25.8

> Everything shown is the real app in training mode, with a simulated crew. [pause] Forty-two automated tests cover the rules; real chat is proven only on stream.

_This is the honesty beat. Keep it level and unhurried._

### S08 · End card · 1:26.4 – 1:29.4

> Six lives. One pilot. A whole crew.

_Three short phrases with a beat between each. The picture fades to black by 1:30._

---

## Accuracy notes for each claim

| Line                                              | Source of truth                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "sends each screen only what its role allows"     | `projectState()` in `server/game.ts` adds `intel` only for the `viewer` role                       |
| "four wiring rules that allow exactly one answer" | `makeIntel()` builds four relay constraints with a single valid configuration                      |
| "the order … appears only in the cockpit"         | `TransmissionOrder` is rendered only in the pilot cockpit (`src/Rescue.tsx`)                       |
| "six seconds … one cell each, three per mission"  | `receiveChat()` in `server/game.ts`: `stabilizedMs = 6000`, one boost per viewer, `boostsUsed < 3` |
| "read-only scope"                                 | OAuth requests only `user:read:chat` (`server/index.ts`)                                           |
| "de-duplicated … survive reconnects"              | Message-ID de-duplication, session migration and reconnect backoff in `server/twitch.ts`           |
| "Forty-two automated tests"                       | 29 unit tests + 13 browser tests, passing in GitHub CI on October 28, 2026                         |
| "training mode, with a simulated crew"            | All footage was captured in training mode; simulated crew messages carry the app's **SIM** label   |

If the test count changes before you record, update the S07 line and the on-screen card in `compositor/compositor.js`.
