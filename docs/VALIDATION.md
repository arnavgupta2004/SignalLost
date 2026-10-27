# Validation record

The quality-upgraded application passed on October 27, 2026 in [GitHub CI run 40552524553](https://github.com/arnavgupta2004/SignalLost/actions/runs/40552524553), application commit `1d98194eccb19bfd171bf67283b89eb022c2f2c2`.

Local verification used Windows, Node.js 24.19.0, and Playwright Chromium. CI used Ubuntu, Node.js 24, and the production Node 24 Alpine Docker image.

| Check                                                         | Result                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Strict TypeScript compilation and unused-code checks          | Passed                                                                     |
| Source formatting                                             | Passed                                                                     |
| Portable public-registry dependency URLs and integrity hashes | Passed                                                                     |
| Vite production build                                         | Passed                                                                     |
| Mission-engine tests                                          | 23 passed                                                                  |
| Twitch OAuth/EventSub fixture tests                           | 5 passed                                                                   |
| Browser integration tests                                     | 13 passed                                                                  |
| Total automated tests                                         | **41 passed**                                                              |
| Public-registry dependency audits                             | **0 reported vulnerabilities**, including production-only dependencies     |
| Production Docker image build                                 | Passed                                                                     |
| Container health and frontend responses                       | Passed                                                                     |
| Original rendered interface inspection                        | Homepage, cockpit, Commander intel, docking, and crew-home debrief checked |
| Updated application screenshots                               | Captured in `docs/images/`                                                 |
| Private training rehearsal                                    | Completed; playable 21-second 1440 × 1080 WebM, with training/SIM labels   |

## What the tests establish

The browser suite completes both Cadet and Commander rescues through navigation, engineering, symbol decoding, and keyboard-controlled extraction. It checks complementary Commander information, retained crew preparations, mobile pointer capture and release, pilot-disconnect disarming, unauthorized cockpit access, pause/reload, damage/restart, room errors, OAuth state rejection, transparent overlays, bounded JSON requests, protected Twitch management, and room-code typing focus.

Mission tests check uniquely solvable wiring and navigation, distinct Commander symbols and a non-default transmission order, authoritative time and heat, correct docking alignment, one cell per viewer and three per mission, exactly six seconds of stabilization, pause behavior, and flight-recorder timing independent of oxygen penalties. Live missions wait for a connected Twitch uplink before launch; training remains available without credentials.

Protocol fixtures verify code exchange, chat permission checks, the EventSub subscription condition, message deduplication, session migration without duplicate subscriptions, and revocation handling.

## Final gate before submission

- Authorize the entrant's real Twitch app and broadcaster account.
- Confirm a real viewer's `!dock` and `!boost` arrive with the **TWITCH** label and affect extraction.
- Verify the public HTTPS crew link from another device.
- Record real Twitch functionality and the genuine Codex thread, then upload the demonstration publicly on YouTube.
- If the repository stays private, share it with `testing@devpost.com` for judge access.

The local rehearsal and protocol fixtures establish product behavior; they do not establish that a live Twitch session or public deployment has occurred. The quality review and recording plan are in `QUALITY_REVIEW.md` and `DEMO_SCRIPT.md`.

## Reproduce

```sh
npm ci
npm run format:check
npm run check
npx playwright install chromium
npm run test:e2e
```

For screenshots, start a production server on port 4317 and run:

```sh
node scripts/capture.mjs
```

Set `CAPTURE_URL` to use another application URL. Set `CAPTURE_VIDEO=1` to record a private training rehearsal under `.local/`; screenshot exports run separately to avoid simultaneous Chromium capture conflicts.
