# Deployment and live stream setup

SignalLost needs a Node server with WebSocket support. A static-only host such as GitHub Pages cannot run the rescue engine or Twitch EventSub connection.

## Render

[Deploy this repository using Render](https://render.com/deploy?repo=https://github.com/arnavgupta2004/SignalLost).

The repository includes a Dockerfile and `render.yaml` blueprint. Connect your own Render account and deploy the web service. In its environment configuration, use:

```text
PORT=10000
APP_URL=https://YOUR-SERVICE.onrender.com
TWITCH_REDIRECT_URI=https://YOUR-SERVICE.onrender.com/auth/twitch/callback
TWITCH_CLIENT_ID=your Twitch application client ID
TWITCH_CLIENT_SECRET=your Twitch application client secret
```

Render health-checks port 10000, so set `PORT=10000`; the image otherwise defaults to 3001. Use the actual service URL assigned by Render, which may include a suffix such as `signallost-vpnz`. Set `APP_URL` to a valid URL before startup. You can initially omit the Twitch keys to test training mode. Register the exact callback URL in your Twitch application's OAuth redirect list before connecting.

The server honors the platform's `PORT` environment variable. `/api/health` is the health endpoint. Use one instance: room state lives in process memory.

Free or sleeping hosts can restart or suspend idle applications, clearing rooms and requiring Twitch reconnection. For the public demonstration and judging, choose hosting that remains available and leave access free through **November 15, 2026, 5:00 p.m. Pacific Time**.

## Any Docker host

```sh
docker build -t signallost .
docker run --rm -p 3001:3001 --env-file .env signallost
```

Set `APP_URL` and `TWITCH_REDIRECT_URI` to the externally visible HTTPS URLs. Configure your reverse proxy to forward `/ws` upgrades. The application itself serves all frontend files and routes.

The image runs as the unprivileged `node` user. Production dependencies include the `tsx` runtime. Browser testing tools are excluded from the final image.

## Local production and an HTTPS tunnel

```sh
npm ci
npm run build
npm start
```

Expose port 3001 through your preferred HTTPS tunnel. Set `.env` to the tunnel's public URL, register the matching Twitch callback, and restart the server.

If port 3001 is occupied, use another `PORT`, such as 4317. Development proxies read the same `.env` port. For development, `APP_URL` should point to the Vite frontend at `http://localhost:5173`; for production, it should point to the public server URL.

A temporary tunnel is suitable for a rehearsal. It must remain accessible for any testing period you promise judges.

## Verify the Twitch connection

1. Open the deployed homepage and create a Twitch mission.
2. In **Stream setup**, connect as the broadcaster whose channel will host the game.
3. Verify the channel badge says connected.
4. Open that channel on Twitch and send `!join nav`.
5. Confirm the display name appears in the cockpit's crew manifest and uplink with the **TWITCH** source label.
6. Open the crew link on another device. Check that it loads without a Twitch login.
7. Launch the rescue. Send `!nav SECTOR` based on the viewer's radar; verify the crew readback reflects the signal.
8. Operate the cockpit and complete the three systems.

Only recognized commands are shown in the game. Ordinary conversation is ignored. The app requests `user:read:chat` and subscribes to `channel.chat.message` through Twitch EventSub. It reads chat; it does not post messages.

## OBS and recording

- Capture the cockpit browser window for the complete interface. Toggle **Broadcast layout** for larger timer, crew signals, and controls at desktop/OBS resolutions.
- For a transparent HUD, add the overlay URL as a Browser Source at **1920 × 1080**.
- Keep crew intel out of the broadcast; viewers should discover it through the shared link.
- To show the asymmetric mechanic in your demonstration video, briefly cut to the crew panel, then return to the cockpit.
- Use audio and stream visuals you have permission to include. The application's spacecraft, radar, glyphs, and synthesized tones are original.

## Current validation limits

Automated tests cover the full training mission, client permissions, HTTP parsing, state isolation, and Twitch protocol behavior using fixtures. **A live broadcaster OAuth/EventSub session and a public deployment still require the entrant's accounts and must be verified before submission.** Training footage alone does not satisfy the rule requiring footage functioning on Twitch.

Live missions wait for a connected Twitch uplink before launch. During the rehearsal, verify `!dock` and a real viewer's `!boost`, including the credited power-cell signal, stabilization countdown, and recovery progress.

The production Docker image has been built and smoke-tested successfully in GitHub CI, including health and frontend responses. Verify the environment configuration and live Twitch connection on your selected public host before recording.
