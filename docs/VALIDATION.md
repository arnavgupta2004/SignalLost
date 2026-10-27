# Validation record

Validated locally on October 27, 2026 using Windows, Node.js 24.19.0, and Playwright Chromium.

| Check | Result |
| --- | --- |
| TypeScript type checking | Passed |
| Vite production build | Passed |
| Mission-engine tests | 12 passed |
| Twitch OAuth/EventSub fixture tests | 5 passed |
| Browser integration tests | 10 passed |
| Production dependency audit | 0 reported vulnerabilities |
| Rendered interface inspection | Homepage, cockpit, and crew panel checked |
| Original application screenshots | Captured in `docs/images/` |

Browser tests verify a complete rescue synchronizes across cockpit, viewer intel, and OBS. They also cover simulated crew labels and readback, pilot authorization, pause and reload, damage and restart, unknown rooms, OAuth state rejection, mobile overflow, transparent overlays, bounded request bodies, and protected Twitch management.

Protocol fixtures verify the OAuth code exchange, chat permission checks, EventSub subscription condition, message deduplication, session migration without duplicate subscriptions, and revocation handling.

## Pending live checks

- Connect the entrant's real Twitch app and broadcaster account, then verify a real chat command appears with the TWITCH label.
- Deploy at a public HTTPS address and verify crew access from another device.
- Build the Docker image on a host with a running Docker daemon; the local Docker daemon was unavailable.
- Record and upload the publicly visible YouTube demonstration showing real Twitch functionality and the actual Codex build session.

Automated fixture tests establish implementation behavior; they do not establish that a live Twitch authorization or public deployment has occurred.

## Reproduce

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
npm audit --omit=dev
```

For screenshots, start a production server on port 4317 and run:

```sh
node scripts/capture.mjs
```

Set `CAPTURE_URL` to use another application URL. Screenshots of training mode are examples of the interface, not proof of live Twitch participation.
