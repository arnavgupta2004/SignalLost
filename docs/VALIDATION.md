# Validation record

Validated on October 27, 2026 locally using Windows, Node.js 24.19.0, and Playwright Chromium, and in GitHub Actions using Ubuntu and Node.js 24.

The complete final application run passed: [GitHub CI run 40521582904](https://github.com/arnavgupta2004/SignalLost/actions/runs/40521582904), application commit `bcc77c09279c05aedb3639e6513755f429613dd2`.

| Check | Result |
| --- | --- |
| TypeScript type checking | Passed |
| Vite production build | Passed |
| Mission-engine tests | 12 passed |
| Twitch OAuth/EventSub fixture tests | 5 passed |
| Browser integration tests | 11 passed |
| Public-registry dependency audits | 0 reported vulnerabilities in CI, including production-only dependencies |
| Clean production-only installation | Startup, frontend serving, and room creation passed |
| Production Docker image build | Passed in GitHub CI |
| Production container health and frontend | Passed in GitHub CI |
| Rendered interface inspection | Homepage, cockpit, and crew panel checked |
| Original application screenshots | Captured in `docs/images/` |

Browser tests verify a complete rescue synchronizes across cockpit, viewer intel, and OBS. They also cover simulated crew labels and readback, pilot authorization, pause and reload, damage and restart, unknown rooms, OAuth state rejection, mobile overflow, transparent overlays, bounded request bodies, protected Twitch management, and keyboard focus while joining a crew by room code.

Protocol fixtures verify the OAuth code exchange, chat permission checks, EventSub subscription condition, message deduplication, session migration without duplicate subscriptions, and revocation handling.

## Pending live checks

- Connect the entrant's real Twitch app and broadcaster account, then verify a real chat command appears with the TWITCH label.
- Deploy at a public HTTPS address and verify crew access from another device.
- Record and upload the publicly visible YouTube demonstration showing real Twitch functionality and the actual Codex build session.
- If the repository stays private, share it with `testing@devpost.com` for judge access.

The local Docker daemon was unavailable; the image was instead built and started successfully in GitHub CI.

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
