# Devpost submission draft

## Project name

SignalLost

## Tagline

The streamer has the controls. Chat has the answers. Six lives depend on working together.

## Inspiration

The best moments on Twitch happen when a streamer and their community create something together. We wanted to give viewers a role with real responsibility: seeing the information the streamer is missing and guiding a rescue through chat.

SignalLost turns the familiar relationship between streamer and chat into an asymmetric cooperative game. A pilot with broken sensors must trust their community's navigation, engineering, and decoding.

## What it does

Six survivors are stranded in a failing research capsule. The streamer has six minutes to recover them.

The cockpit deliberately hides the mission's answers. Viewers open a shareable intelligence panel that shows the safe flight corridor, emergency power schematic, and encoded distress clues. They communicate their findings through Twitch chat. The streamer selects a route, sets four power relays, and transmits a four-symbol rescue handshake.

Recognized chat commands appear in a live crew uplink. A readback panel aggregates viewers' latest findings, giving each viewer one voice while leaving the final decision to the pilot. Late arrivals receive guidance for the current system and can contribute immediately.

The project includes fresh puzzle generation, damage and time penalties, accessible pause controls, optional original synthesized sounds, a transparent OBS overlay, and a rescue debrief that credits participating viewers. A clearly labeled training mode lets anyone test a complete mission without credentials.

## How we built it with Codex

OpenAI Codex was used throughout this repository's development: designing the authoritative mission engine, implementing Twitch OAuth and EventSub, building the React/TypeScript cockpit and viewer panels, creating original SVG spacecraft and radar artwork, and writing tests.

Codex used automated browser testing to discover and fix a control throttle that dropped rapid clicks. It also replaced an affected HTTP-framework dependency with Node's built-in HTTP server and bounded request parsing, then verified the revised application.

The work was newly created during the submission period. The actual build thread is:

**Codex session/thread ID: `01a17ca8-f1c2-7ec1-846f-60149169589e`**

## Challenges

The central technical challenge was keeping the puzzle answers out of the cockpit and OBS state while synchronizing the rescue across multiple clients. The server generates viewer-specific state projections and validates pilot authorization before accepting controls.

The interaction challenge was making a new viewer useful immediately. Each system has a clear specialty, actionable intel, and a command to send. Crew signals provide guidance rather than automatically operating the game, preserving the tension of communication and trust.

## Accomplishments

- A complete, replayable rescue with three distinct cooperative systems.
- Separate cockpit, viewer intelligence, and OBS experiences.
- Twitch OAuth/EventSub integration and protocol tests.
- A crew manifest, distinct-voice readback, and shared rescue credits.
- Original vector assets and locally bundled fonts.
- Free training access, installation instructions, deployment configuration, and automated tests.

## What's next

More missions, difficulty levels, and richer clues for individual crew specialties. A future cross-channel mode could let a raid bring an experienced rescue crew into a new stream.

## Built with

OpenAI Codex, TypeScript, React, Vite, Node.js, WebSockets, Twitch OAuth, Twitch EventSub, OBS Browser Sources, Playwright.

## Repository

https://github.com/arnavgupta2004/SignalLost

## Testing instructions for judges

Requires Node.js 22 or newer:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`, choose **Start training**, and launch the mission. Use **Request simulated intel** for crew guidance. For the complete asymmetric experience, open the crew link in another window and communicate its intel to the cockpit.

For Twitch setup, follow the README and `docs/DEPLOYMENT.md`. No runtime OpenAI API key, subscription, or payment is needed to test the project.

## Fill in before submitting

- Public YouTube demonstration URL, **under three minutes**.
- Public application URL, if deployed.
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
