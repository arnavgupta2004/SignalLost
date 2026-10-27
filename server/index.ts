import { existsSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { createRoom, hostAction, projectState, receiveChat, tick, type Room } from './game.ts';
import { exchangeCode, validateToken, TwitchConnection, type TwitchConfig } from './twitch.ts';
import { json, text, parseJson, serveStatic, RequestError } from './http.ts';
import type { ClientMessage, HostAction, Role, ServerMessage } from '../shared/protocol.ts';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(path.join(projectRoot, '.env'))) process.loadEnvFile(path.join(projectRoot, '.env'));
const port = Number(process.env.PORT || 3001);
const appUrl = (process.env.APP_URL || `http://localhost:${port}`).replace(/\/$/, '');
const config: TwitchConfig = {
  clientId: process.env.TWITCH_CLIENT_ID || '',
  clientSecret: process.env.TWITCH_CLIENT_SECRET || '',
  redirectUri: process.env.TWITCH_REDIRECT_URI || `http://localhost:${port}/auth/twitch/callback`,
};
const configured = Boolean(config.clientId && config.clientSecret);
const rooms = new Map<string, Room>();
const connections = new Map<string, TwitchConnection>();
const oauthStates = new Map<string, { roomId: string; cookie: string; expires: number }>();
const ipRequests = new Map<string, { count: number; expires: number }>();
interface Client {
  roomId: string;
  role: Role;
  alive: boolean;
  actionWindow: number;
  actionCount: number;
}
const clients = new Map<WebSocket, Client>();
const allowedOrigins = new Set([
  new URL(appUrl).origin,
  `http://localhost:${port}`,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]);
const dist = path.join(projectRoot, 'dist');
function originAllowed(req: IncomingMessage) {
  const origin = req.headers.origin;
  return (
    !origin ||
    allowedOrigins.has(origin) ||
    origin === `http://${req.headers.host}` ||
    origin === `https://${req.headers.host}`
  );
}
function secureEqual(a: string, b: string) {
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function authorized(req: IncomingMessage, room: Room) {
  return secureEqual(req.headers.authorization?.replace(/^Bearer /, '') || '', room.hostToken);
}
function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
function broadcast(room: Room) {
  room.state.viewers = [...clients.values()].filter(
    (c) => c.roomId === room.state.roomId && c.role === 'viewer',
  ).length;
  for (const [socket, client] of clients)
    if (client.roomId === room.state.roomId)
      send(socket, { type: 'state', state: projectState(room, client.role) });
}
async function callback(req: IncomingMessage, res: ServerResponse, url: URL) {
  const state = url.searchParams.get('state') || '',
    pending = oauthStates.get(state);
  const cookie =
    (req.headers.cookie || '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('signallost_oauth='))
      ?.slice('signallost_oauth='.length) || '';
  oauthStates.delete(state);
  res.setHeader(
    'Set-Cookie',
    'signallost_oauth=; Path=/auth/twitch/callback; HttpOnly; SameSite=Lax; Max-Age=0',
  );
  if (!pending || pending.expires < Date.now() || !secureEqual(cookie, pending.cookie)) {
    text(
      res,
      400,
      'Authorization session expired or invalid. Return to SignalLost and connect again.',
    );
    return;
  }
  const room = rooms.get(pending.roomId);
  if (!room) {
    text(res, 404, 'Rescue room expired. Create a new mission.');
    return;
  }
  try {
    const code = url.searchParams.get('code');
    if (url.searchParams.has('error') || !code)
      throw new Error('Twitch connection cancelled. You can try again from the cockpit.');
    const tokens = await exchangeCode(config, code);
    const identity = await validateToken(config, tokens.access_token);
    for (const [id, other] of rooms)
      if (id !== pending.roomId && other.state.twitch.channel === identity.login) {
        connections.get(id)?.stop();
        connections.delete(id);
        other.state.twitch = {
          status: 'offline',
          channel: null,
          error: 'This channel connected to another rescue room.',
          configured,
        };
        broadcast(other);
      }
    connections.get(pending.roomId)?.stop();
    room.state.mode = 'twitch';
    room.state.twitch.channel = identity.login;
    room.state.twitch.error = null;
    const connection = new TwitchConnection(config, tokens, identity, {
      status: (status, error) => {
        room.state.twitch.status = status;
        room.state.twitch.error = error || null;
        broadcast(room);
      },
      chat: (id, name, message) => {
        if (receiveChat(room, id, name, message, 'twitch')) broadcast(room);
      },
    });
    connections.set(pending.roomId, connection);
    connection.start();
  } catch (error) {
    room.state.twitch.status = 'error';
    room.state.twitch.error = error instanceof Error ? error.message : 'Unable to connect Twitch.';
    broadcast(room);
  }
  res.writeHead(302, {
    Location: `${appUrl}/host/${room.state.roomId}`,
    'Cache-Control': 'no-store',
  });
  res.end();
}
async function handle(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  const url = new URL(req.url || '/', 'http://signallost.local'),
    method = req.method || 'GET';
  if (url.pathname.startsWith('/api/') && !originAllowed(req)) {
    json(res, 403, { error: 'Origin not allowed.' });
    return;
  }
  if (method === 'GET' && url.pathname === '/api/health') {
    json(res, 200, { ok: true, twitchConfigured: configured });
    return;
  }
  if (method === 'GET' && url.pathname === '/auth/twitch/callback') {
    await callback(req, res, url);
    return;
  }
  if (method === 'POST' && url.pathname === '/api/rooms') {
    const body = await parseJson(req),
      ip = req.socket.remoteAddress || 'unknown',
      now = Date.now(),
      rate = ipRequests.get(ip);
    if (rate && rate.expires > now && rate.count >= 15) {
      json(res, 429, { error: 'Too many rescue rooms. Please wait a minute.' });
      return;
    }
    ipRequests.set(ip, {
      count: rate && rate.expires > now ? rate.count + 1 : 1,
      expires: rate && rate.expires > now ? rate.expires : now + 60_000,
    });
    if (rooms.size >= 200) {
      json(res, 503, { error: 'Mission control is full. Try again soon.' });
      return;
    }
    const mode = body.mode === 'twitch' ? 'twitch' : 'training';
    let room = createRoom(mode, configured);
    while (rooms.has(room.state.roomId)) room = createRoom(mode, configured);
    rooms.set(room.state.roomId, room);
    json(res, 201, { roomId: room.state.roomId, hostToken: room.hostToken });
    return;
  }
  const match = /^\/api\/rooms\/([a-zA-Z0-9]{6})(\/twitch(?:\/disconnect)?)?$/.exec(url.pathname);
  if (match) {
    const room = rooms.get(match[1].toUpperCase());
    if (method === 'GET' && !match[2]) {
      if (!room) {
        json(res, 404, { error: 'This rescue room does not exist or has expired.' });
        return;
      }
      json(res, 200, { roomId: room.state.roomId, phase: room.state.phase, mode: room.state.mode });
      return;
    }
    if (method === 'POST' && match[2]) {
      if (!room || !authorized(req, room)) {
        json(res, 403, { error: 'Only the pilot can manage Twitch.' });
        return;
      }
      await parseJson(req);
      if (match[2] === '/twitch/disconnect') {
        connections.get(room.state.roomId)?.stop();
        connections.delete(room.state.roomId);
        room.state.twitch = { status: 'offline', channel: null, error: null, configured };
        broadcast(room);
        json(res, 200, { ok: true });
        return;
      }
      if (!configured) {
        json(res, 400, {
          error:
            'Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in your server .env, then restart. Training mode is ready now.',
        });
        return;
      }
      const state = randomBytes(24).toString('hex'),
        cookie = randomBytes(24).toString('hex');
      oauthStates.set(state, {
        roomId: room.state.roomId,
        cookie,
        expires: Date.now() + 10 * 60_000,
      });
      res.setHeader(
        'Set-Cookie',
        `signallost_oauth=${cookie}; Path=/auth/twitch/callback; HttpOnly; SameSite=Lax; Max-Age=600${config.redirectUri.startsWith('https:') ? '; Secure' : ''}`,
      );
      const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
      authUrl.search = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'user:read:chat',
        state,
        force_verify: 'true',
      }).toString();
      json(res, 200, { url: authUrl.toString() });
      return;
    }
  }
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    json(res, 404, { error: 'Not found.' });
    return;
  }
  if (method !== 'GET' && method !== 'HEAD') {
    json(res, 405, { error: 'Method not allowed.' });
    return;
  }
  await serveStatic(req, res, url.pathname, dist);
}
const server = createServer({ maxHeaderSize: 16_384 }, (req, res) => {
  void handle(req, res).catch((error) => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (error instanceof RequestError) {
      res.setHeader('Connection', 'close');
      json(res, error.status, { error: error.message });
      req.resume();
      return;
    }
    console.error('Request failed:', error instanceof Error ? error.name : 'Unknown error');
    json(res, 500, { error: 'Mission control encountered a problem. Try again.' });
  });
});
server.requestTimeout = 15_000;
server.headersTimeout = 10_000;

const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  const sameHost =
    origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
  if (
    req.url !== '/ws' ||
    (origin && !allowedOrigins.has(origin) && !sameHost) ||
    wss.clients.size > 1000
  ) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});
wss.on('connection', (socket) => {
  const helloTimeout = setTimeout(() => {
    if (!clients.has(socket)) socket.close(1008, 'Identify your rescue room.');
  }, 5000);
  socket.on('pong', () => {
    const client = clients.get(socket);
    if (client) client.alive = true;
  });
  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString()) as ClientMessage;
      if (message.type === 'hello') {
        if (clients.has(socket)) return;
        if (
          typeof message.roomId !== 'string' ||
          !['host', 'viewer', 'overlay'].includes(message.role)
        ) {
          socket.close(1008, 'Invalid role.');
          return;
        }
        const room = rooms.get(message.roomId.toUpperCase());
        if (!room) {
          send(socket, { type: 'error', message: 'Rescue room expired or not found.' });
          socket.close(1008);
          return;
        }
        if (
          message.role === 'host' &&
          !secureEqual(typeof message.token === 'string' ? message.token : '', room.hostToken)
        ) {
          send(socket, {
            type: 'error',
            message:
              'Pilot access is saved in the browser that created this room. Open it there or create a new rescue.',
          });
          socket.close(1008);
          return;
        }
        clearTimeout(helloTimeout);
        clients.set(socket, {
          roomId: room.state.roomId,
          role: message.role,
          alive: true,
          actionWindow: 0,
          actionCount: 0,
        });
        room.lastActive = Date.now();
        broadcast(room);
        return;
      }
      const client = clients.get(socket);
      if (!client) {
        socket.close(1008);
        return;
      }
      if (client.role !== 'host') {
        send(socket, {
          type: 'error',
          message: 'The pilot operates the cockpit. Send your findings through Twitch chat.',
        });
        return;
      }
      const now = Date.now();
      // Limit floods while preserving legitimate quick actions and accessibility input.
      if (now - client.actionWindow >= 1000) {
        client.actionWindow = now;
        client.actionCount = 0;
      }
      if (++client.actionCount > 30) {
        socket.close(1008, 'Too many cockpit commands.');
        return;
      }
      const room = rooms.get(client.roomId);
      if (!room) return;
      // Validate fields before letting a client reach game logic.
      if (
        message.type === 'training-signal' &&
        (typeof message.text !== 'string' ||
          typeof message.name !== 'string' ||
          !['navigator', 'engineer', 'decoder'].includes(message.specialty) ||
          message.name.length < 1 ||
          message.name.length > 30 ||
          message.text.length > 160)
      )
        return;
      if (hostAction(room, message as HostAction, now)) broadcast(room);
    } catch {
      send(socket, { type: 'error', message: 'Invalid cockpit command.' });
    }
  });
  socket.on('close', () => {
    clearTimeout(helloTimeout);
    const client = clients.get(socket);
    clients.delete(socket);
    const room = client && rooms.get(client.roomId);
    if (room) {
      const pilotLeft =
        client?.role === 'host' &&
        ![...clients.values()].some((c) => c.roomId === client.roomId && c.role === 'host');
      if (pilotLeft && room.state.phase === 'active' && room.state.stage === 3) {
        hostAction(room, { type: 'steer', direction: 0 });
        if (room.state.docking.tractor) hostAction(room, { type: 'tractor' });
      }
      broadcast(room);
      if (client?.role === 'host')
        setTimeout(() => {
          const hasPilot = [...clients.values()].some(
            (c) => c.roomId === client.roomId && c.role === 'host',
          );
          if (!hasPilot && room.state.phase === 'active' && !room.state.paused) {
            hostAction(room, { type: 'pause' });
            broadcast(room);
          }
        }, 5000);
    }
  });
  socket.on('error', () => {
    /* Socket close cleans up membership. */
  });
});
const lastBroadcast = new Map<string, number>();
const ticker = setInterval(() => {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (
      tick(room, now) &&
      (room.state.stage === 3 ||
        now - (lastBroadcast.get(room.state.roomId) || 0) >= 1000 ||
        room.state.phase !== 'active')
    ) {
      broadcast(room);
      lastBroadcast.set(room.state.roomId, now);
    }
  }
}, 250);
const heartbeat = setInterval(() => {
  for (const [socket, client] of clients) {
    if (!client.alive) {
      socket.terminate();
      continue;
    }
    client.alive = false;
    socket.ping();
  }
  const now = Date.now();
  for (const [state, pending] of oauthStates) if (pending.expires < now) oauthStates.delete(state);
  for (const [ip, rate] of ipRequests) if (rate.expires < now) ipRequests.delete(ip);
  for (const [id, room] of rooms) {
    const hasClients = [...clients.values()].some((c) => c.roomId === id);
    if (!hasClients && room.lastActive < now - 6 * 60 * 60_000) {
      connections.get(id)?.stop();
      connections.delete(id);
      rooms.delete(id);
      lastBroadcast.delete(id);
    }
  }
}, 30_000);
server.listen(port, '0.0.0.0', () => {
  console.log(`SignalLost mission control: http://localhost:${port}`);
  console.log(
    `Twitch: ${configured ? 'configured' : 'training ready; configure .env for live chat'}`,
  );
});
function shutdown() {
  clearInterval(ticker);
  clearInterval(heartbeat);
  for (const connection of connections.values()) connection.stop();
  for (const socket of wss.clients) socket.close(1001, 'Mission control restarting.');
  server.close();
  setTimeout(() => process.exit(0), 1500).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
