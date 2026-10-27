# SignalLost quality review

SignalLost gives a Twitch community two different kinds of responsibility: solve information the pilot cannot see, then help stabilize a rescue the pilot must physically fly.

## Judging criteria and shipped behavior

| Criterion                    | Shipped behavior                                                                                                                                                                                                                       | Evidence to show                                                                                              |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Innovation / idea            | In Commander, scans must be combined with the pilot's flight limits, and symbol meanings must be combined with a different transmission order. Viewers also deliver finite power cells during extraction.                              | Cut between the pilot and crew panels, then show a real `!boost` changing drift and recovery.                 |
| Potential impact             | A single viewer can help across specialties. Late arrivals can guide the current stage or deliver a power cell. Viewers need no install or intel-panel login.                                                                          | Open the crew link on a phone and have a new viewer contribute during the final approach.                     |
| Technological implementation | The server owns time, puzzle validation, steering, heat, recovery, and boost budgets. Cockpit and overlay clients do not receive full solution fields. Twitch uses OAuth/EventSub with refresh, deduplication, and reconnect handling. | Show passing tests, role projections, and the Docker CI result.                                               |
| Design                       | Original ship/capsule artwork, a moving extraction scene, six named survivors, readable broadcast layout, contextual crew guidance, and a flight recorder make the rescue watchable and understandable.                                | Capture the cockpit at 1080p, show the beam stabilize, and finish on the crew credits and survivor portraits. |

## Completed local checks

- Strict TypeScript compilation, including unused-code checks.
- 23 mission tests and 5 Twitch protocol fixture tests.
- 13 browser integration tests, including complete Cadet and Commander rescues.
- Unique engineering solutions and unique safe navigation corridors.
- Commander glyphs are distinct and its transmission order is never the default band order.
- One power cell per viewer, three per mission, and exactly six seconds of drift stabilization.
- Pause, pointer capture/release, and pilot-disconnect control safety.
- Crew preparations survive stage handoffs.
- Mobile cockpit and crew-panel overflow checks.
- Portable, integrity-pinned public npm package sources.
- Original application screenshots and a private training rehearsal.

The final CI result is recorded in `VALIDATION.md` after the exact release commit is checked.

## Last gate before submission

A real-channel rehearsal is still required. Authorize the entrant's Twitch app and broadcaster account, then confirm that another viewer's `!dock` and `!boost` arrive with the **TWITCH** source label and change the actual extraction. Live missions deliberately wait for a connected uplink before launch.

Record that real Twitch behavior and the genuine Codex build thread for the public YouTube demonstration. The locally recorded training rehearsal is for product review and does not replace the required live Twitch footage.
