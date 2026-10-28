# Devpost submission draft

## Project name

SignalLost

## Tagline

The streamer has the controls. Chat has the answers. Six lives depend on working together.

## Inspiration

The best moments on Twitch happen when a streamer and their community create something together. We wanted to give viewers a role with real responsibility: seeing the information the streamer is missing and guiding a rescue through chat.

SignalLost turns the familiar relationship between streamer and chat into an asymmetric cooperative game. A pilot with broken sensors must trust their community's navigation, engineering, and decoding.

## What it does

Six named survivors are stranded in a failing research capsule. The pilot chooses a six-minute guided Cadet flight or a five-minute Commander mission.

The cockpit deliberately hides full puzzle solutions. In Commander, viewers receive navigation scans, four wiring constraints, and labeled symbol clues. The pilot holds their ship's flight limits and a different transmission order. Both sides combine their information through Twitch chat to choose a corridor, restore the airlock, and answer the distress beacon.

The final approach is a playable extraction. The pilot steers with A/D or arrow keys, engages a tractor beam, and counters ion drift. Viewers send `!dock` to identify the safe lane and `!boost` to deliver a power cell: six seconds without drift and recovery help for an aligned beam. There are three cells per mission and one per viewer, giving chat a visible, limited way to affect the rescue.

Recognized chat commands appear in a live crew uplink. A readback panel aggregates viewers' latest findings, giving each viewer one voice while leaving the final decision to the pilot. Late arrivals receive guidance for the current system and can contribute immediately.

The project includes uniquely solvable puzzle generation, damage and time penalties, accessible steering and pause controls, original spacecraft and survivor artwork, synthesized mission sounds, a readable broadcast layout, a transparent OBS overlay, and a debrief that credits the crew and shows their flight record. A clearly labeled training mode supports both profiles without credentials.

## How we built it with Codex

OpenAI Codex was used throughout this repository's development: designing the authoritative mission engine, implementing Twitch OAuth and EventSub, building the React/TypeScript cockpit and viewer panels, creating original SVG spacecraft and radar artwork, and writing tests.

Codex used automated browser testing to discover and fix a control throttle that dropped rapid clicks. It also replaced an affected HTTP-framework dependency with Node's built-in HTTP server and bounded request parsing, then verified the revised application.

A further Codex quality pass added complementary Commander clues, solvable relay constraints, a controllable docking finale, limited community boosts, original survivor portraits, and automated keyboard and touch playthroughs. The source is formatted, strictly type-checked, and checked for portable public dependency URLs.

The work was newly created during the submission period. The actual build thread is:

**Codex session/thread ID: `01a17ca8-f1c2-7ec1-846f-60149169589e`**

## Challenges

The central technical challenge was keeping the puzzle answers out of the cockpit and OBS state while synchronizing the rescue across multiple clients. The server generates viewer-specific state projections and validates pilot authorization before accepting controls.

The interaction challenge was making a new viewer useful immediately. Each stage has contextual intel and a command to send. Finding commands guide the pilot; `!boost` lets a late arrival help the final approach directly. The pilot still steers and operates the ship.

## Accomplishments

- A complete, replayable four-stage rescue with two difficulty profiles.
- Complementary information, uniquely solvable wiring, and a physical extraction finale.
- A limited Twitch-chat power-cell mechanic with credited contributions.
- Separate cockpit, viewer intelligence, and OBS experiences.
- Twitch OAuth/EventSub integration and protocol tests.
- A crew manifest, distinct-voice readback, and shared rescue credits.
- Original vector assets and locally bundled fonts.
- Free training access, installation instructions, deployment configuration, and automated tests.

## What's next

More missions, difficulty levels, and richer clues for individual crew specialties. A future cross-channel mode could let a raid bring an experienced rescue crew into a new stream.

## Built with

OpenAI Codex, TypeScript, React, Vite, Node.js, WebSockets, Twitch OAuth, Twitch EventSub, OBS Browser Sources, Playwright.

## Live application

https://signallost-vpnz.onrender.com

## Repository

https://github.com/arnavgupta2004/SignalLost

## Testing instructions for judges

Requires Node.js 22 or newer:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`, choose **Start training**, and launch the mission. Use **Request simulated intel** for crew guidance. During extraction, hold A/D or the thrust buttons to approach the suggested lane, engage the tractor, and use **Simulate crew boost** to test the community power-cell effect. Choose Commander before launch to try the complementary clues and drifting approach. For the asymmetric experience, open the crew link in another window.

For Twitch setup, follow the README and `docs/DEPLOYMENT.md`. No runtime OpenAI API key, subscription, or payment is needed to test the project.

## Fill in before submitting

- Public YouTube demonstration URL, **under three minutes**.
- Entrant/team details and the authorized team representative, if applicable.
- Confirm live Twitch OAuth/EventSub works with the actual demonstration channel.
- Confirm all screenshots and footage match the final submitted version.

## Final rules checklist

- [ ] Confirm entrant eligibility and any team members' eligibility.
- [ ] Register on the hackathon's Devpost page.
- [ ] Include this repository URL and keep source, assets, and run instructions accessible.
- [ ] If the repository remains private, share it with **testing@devpost.com** for judging and testing, as required by the rules.
- [ ] Include the text description and actual Codex session ID above.
- [ ] Upload an English demonstration to **publicly visible YouTube**.
- [ ] Show the application functioning on Twitch and show how it was built with Codex.
- [ ] Keep the video under three minutes and use only permitted visual/audio material.
- [ ] Submit before **November 2, 2026, 2:00 p.m. Pacific Time**.
- [ ] Keep judge access free and available through **November 15, 2026, 5:00 p.m. Pacific Time**.

India-time equivalents: submission closes **November 3, 2026, 3:30 a.m. IST**; judging ends **November 16, 2026, 6:30 a.m. IST**. Pacific Time is UTC−8 on those dates.

This is a prepared draft, not a submitted Devpost entry. Live Twitch verification and the final video are pending entrant account access.
