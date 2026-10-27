import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Request } from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createRoom, hostAction, projectState, receiveChat, tick, type Room } from './game.ts';
import { exchangeCode, validateToken, TwitchConnection, type TwitchConfig } from './twitch.ts';
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
interface Client { roomId: string; role: Role; alive: boolean; lastAction: number }
const clients = new Map<WebSocket, Client>();
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '4kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
const allowedOrigins = new Set([new URL(appUrl).origin, `http://localhost:${port}`, 'http://localhost:5173', 'http://127.0.0.1:5173']);
function originAllowed(req: Request) {
  const origin = req.headers.origin;
  return !origin || allowedOrigins.has(origin) || origin === `${req.protocol}://${req.headers.host}`;
}
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!originAllowed(req)) { res.status(403).json({ error: 'Origin not allowed.' }); return; }
  next();
});
function secureEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
function authorized(req: Request, room: Room) {
  const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
  return secureEqual(token, room.hostToken);
}
function send(socket: WebSocket, message: ServerMessage) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
function broadcast(room: Room) {
  const viewers = [...clients.values()].filter(c => c.roomId === room.state.roomId && c.role === 'viewer').length;
  room.state.viewers = viewers;
  for (const [socket, client] of clients) if (client.roomId === room.state.roomId) {
    send(socket, { type: 'state', state: projectState(room, client.role) });
  }
}
app.get('/api/health', (_req, res) => res.json({ ok: true, twitchConfigured: configured }));
app.post('/api/rooms', (req, res) => {
  const ip = req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const rate = ipRequests.get(ip);
  if (rate && rate.expires > now && rate.count >= 15) { res.status(429).json({ error: 'Too many rescue rooms. Please wait a minute.' }); return; }
  ipRequests.set(ip, { count: rate && rate.expires > now ? rate.count + 1 : 1, expires: rate && rate.expires > now ? rate.expires : now + 60_000 });
  if (rooms.size >= 200) { res.status(503).json({ error: 'Mission control is full. Try again soon.' }); return; }
  const mode = req.body?.mode === 'twitch' ? 'twitch' : 'training';
  let room = createRoom(mode, configured);
  while (rooms.has(room.state.roomId)) room = createRoom(mode, configured);
  rooms.set(room.state.roomId, room);
  res.status(201).json({ roomId: room.state.roomId, hostToken: room.hostToken });
});
app.get('/api/rooms/:id', (req, res) => {
  const room = rooms.get(req.params.id.toUpperCase());
  if (!room) { res.status(404).json({ error: 'This rescue room does not exist or has expired.' }); return; }
  res.json({ roomId: room.state.roomId, phase: room.state.phase, mode: room.state.mode });
});
app.post('/api/rooms/:id/twitch', (req, res) => {
  const room = rooms.get(req.params.id.toUpperCase());
  if (!room || !authorized(req, room)) { res.status(403).json({ error: 'Only the pilot can connect Twitch.' }); return; }
  if (!configured) { res.status(400).json({ error: 'Set TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET in your server .env, then restart. Training mode is ready now.' }); return; }
  const state = randomBytes(24).toString('hex');
  const cookie = randomBytes(24).toString('hex');
  oauthStates.set(state, { roomId: room.state.roomId, cookie, expires: Date.now() + 10 * 60_000 });
  res.cookie('signallost_oauth', cookie, {
    httpOnly: true, sameSite: 'lax', secure: config.redirectUri.startsWith('https:'),
    maxAge: 10 * 60_000, path: '/auth/twitch/callback',
  });
  const url = new URL('https://id.twitch.tv/oauth2/authorize');
  url.search = new URLSearchParams({
    client_id: config.clientId, redirect_uri: config.redirectUri,
    response_type: 'code', scope: 'user:read:chat', state, force_verify: 'true',
  }).toString();
  res.json({ url: url.toString() });
});
app.post('/api/rooms/:id/twitch/disconnect', (req, res) => {
  const room = rooms.get(req.params.id.toUpperCase());
  if (!room || !authorized(req, room)) { res.status(403).json({ error: 'Only the pilot can disconnect Twitch.' }); return; }
  connections.get(room.state.roomId)?.stop(); connections.delete(room.state.roomId);
  room.state.twitch = { status: 'offline', channel: null, error: null, configured };
  broadcast(room); res.json({ ok: true });
});
app.get('/auth/twitch/callback', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const pending = oauthStates.get(state);
  const cookie = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('signallost_oauth='))?.slice('signallost_oauth='.length) || '';
  oauthStates.delete(state);
  res.clearCookie('signallost_oauth', { path: '/auth/twitch/callback' });
  if (!pending || pending.expires < Date.now() || !secureEqual(cookie, pending.cookie)) {
    res.status(400).send('Authorization session expired or invalid. Return to SignalLost and connect again.'); return;
  }
  const room = rooms.get(pending.roomId);
  if (!room) { res.status(404).send('Rescue room expired. Create a new mission.'); return; }
  try {
    if (req.query.error || typeof req.query.code !== 'string') throw new Error('Twitch connection cancelled. You can try again from the cockpit.');
    const tokens = await exchangeCode(config, req.query.code);
    const identity = await validateToken(config, tokens.access_token);
    // A channel is bound to one rescue room, so messages cannot leak across missions.
    for (const [id, other] of rooms) if (id !== pending.roomId && other.state.twitch.channel === identity.login) {
      connections.get(id)?.stop(); connections.delete(id);
      other.state.twitch = { status: 'offline', channel: null, error: 'This channel connected to another rescue room.', configured };
      broadcast(other);
    }
    connections.get(pending.roomId)?.stop();
    room.state.mode = 'twitch';
    room.state.twitch.channel = identity.login;
    room.state.twitch.error = null;
    const connection = new TwitchConnection(config, tokens, identity, {
      status: (status, error) => {
        room.state.twitch.status = status; room.state.twitch.error = error || null; broadcast(room);
      },
      chat: (id, name, text) => { if (receiveChat(room, id, name, text, 'twitch')) broadcast(room); },
    });
    connections.set(pending.roomId, connection);
    connection.start();
  } catch (error) {
    room.state.twitch.status = 'error';
    room.state.twitch.error = error instanceof Error ? error.message : 'Unable to connect Twitch.';
    broadcast(room);
  }
  res.redirect(`${appUrl}/host/${room.state.roomId}`);
});
const dist = path.join(projectRoot, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*path}', (req, res) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) { res.status(404).json({ error: 'Not found.' }); return; }
    res.sendFile(path.join(dist, 'index.html'));
  });
}
app.use((error: Error, _req: Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof SyntaxError) { res.status(400).json({ error: 'Invalid request.' }); return; }
  console.error('Request failed:', error.name);
  res.status(500).json({ error: 'Mission control encountered a problem. Try again.' });
});
const server = createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
server.on('upgrade', (req, socket, head) => {
  const origin = req.headers.origin;
  const sameHost = origin === `http://${req.headers.host}` || origin === `https://${req.headers.host}`;
  if (req.url !== '/ws' || (origin && !allowedOrigins.has(origin) && !sameHost) || wss.clients.size > 1000) {
    socket.write('HTTP/1.1 403 Forbidden\r\n\r\n'); socket.destroy(); return;
  }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});
wss.on('connection', socket => {
  const helloTimeout = setTimeout(() => { if (!clients.has(socket)) socket.close(1008, 'Identify your rescue room.'); }, 5000);
  socket.on('pong', () => { const client = clients.get(socket); if (client) client.alive = true; });
  socket.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString()) as ClientMessage;
      if (message.type === 'hello') {
        if (clients.has(socket)) return;
        if (typeof message.roomId !== 'string' || !['host', 'viewer', 'overlay'].includes(message.role)) { socket.close(1008, 'Invalid role.'); return; }
        const room = rooms.get(message.roomId.toUpperCase());
        if (!room) { send(socket, { type: 'error', message: 'Rescue room expired or not found.' }); socket.close(1008); return; }
        if (message.role === 'host' && !secureEqual(typeof message.token === 'string' ? message.token : '', room.hostToken)) {
          send(socket, { type: 'error', message: 'Pilot access is saved in the browser that created this room. Open it there or create a new rescue.' }); socket.close(1008); return;
        }
        clearTimeout(helloTimeout);
        clients.set(socket, { roomId: room.state.roomId, role: message.role, alive: true, lastAction: 0 });
        room.lastActive = Date.now();
        broadcast(room); return;
      }
      const client = clients.get(socket);
      if (!client) { socket.close(1008); return; }
      if (client.role !== 'host') { send(socket, { type: 'error', message: 'The pilot operates the cockpit. Send your findings through Twitch chat.' }); return; }
      const now = Date.now();
      if (now - client.lastAction < 80) return;
      client.lastAction = now;
      const room = rooms.get(client.roomId);
      if (!room) return;
      // Validate fields before letting a client reach game logic.
      if (message.type === 'training-signal' && (
        typeof message.text !== 'string' || typeof message.name !== 'string' ||
        !['navigator', 'engineer', 'decoder'].includes(message.specialty) ||
        message.name.length < 1 || message.name.length > 30 || message.text.length > 160
      )) return;
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
      broadcast(room);
      if (client?.role === 'host') setTimeout(() => {
        const hasPilot = [...clients.values()].some(c => c.roomId === client.roomId && c.role === 'host');
        if (!hasPilot && room.state.phase === 'active' && !room.state.paused) {
          hostAction(room, { type: 'pause' }); broadcast(room);
        }
      }, 5000);
    }
  });
  socket.on('error', () => { /* Socket close cleans up membership. */ });
});
const ticker = setInterval(() => { for (const room of rooms.values()) if (tick(room)) broadcast(room); }, 1000);
const heartbeat = setInterval(() => {
  for (const [socket, client] of clients) {
    if (!client.alive) { socket.terminate(); continue; }
    client.alive = false; socket.ping();
  }
  const now = Date.now();
  for (const [state, pending] of oauthStates) if (pending.expires < now) oauthStates.delete(state);
  for (const [ip, rate] of ipRequests) if (rate.expires < now) ipRequests.delete(ip);
  for (const [id, room] of rooms) {
    const hasClients = [...clients.values()].some(c => c.roomId === id);
    if (!hasClients && room.lastActive < now - 6 * 60 * 60_000) {
      connections.get(id)?.stop(); connections.delete(id); rooms.delete(id);
    }
  }
}, 30_000);
server.listen(port, '0.0.0.0', () => {
  console.log(`SignalLost mission control: http://localhost:${port}`);
  console.log(`Twitch: ${configured ? 'configured' : 'training ready; configure .env for live chat'}`);
});
function shutdown() {
  clearInterval(ticker); clearInterval(heartbeat);
  for (const connection of connections.values()) connection.stop();
  for (const socket of wss.clients) socket.close(1001, 'Mission control restarting.');
  server.close();
  setTimeout(() => process.exit(0), 1500).unref();
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);
