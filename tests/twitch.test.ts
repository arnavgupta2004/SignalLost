import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { test, mock } from 'node:test';
import type WebSocket from 'ws';
import { TwitchConnection, exchangeCode, validateToken } from '../server/twitch.ts';
import type { TwitchStatus } from '../shared/protocol.ts';

const config = { clientId: 'fixture-client', clientSecret: 'fixture-secret', redirectUri: 'http://localhost/callback' };
const tokens = { access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600 };
class FixtureSocket extends EventEmitter {
  close() { this.emit('close'); }
  terminate() { this.emit('close'); }
  event(type: string, payload: unknown, id = type) {
    this.emit('message', Buffer.from(JSON.stringify({ metadata: { message_type: type, message_id: id }, payload })));
  }
}
test('OAuth code exchange uses the registered redirect and does not accept denied tokens', async () => {
  const fetchMock = mock.method(globalThis, 'fetch', async (_url: unknown, init: RequestInit) => {
    const body = init.body as URLSearchParams;
    assert.equal(body.get('grant_type'), 'authorization_code');
    assert.equal(body.get('redirect_uri'), config.redirectUri);
    assert.equal(body.get('code'), 'fixture-code');
    return new Response(JSON.stringify(tokens), { status: 200 });
  });
  try { assert.deepEqual(await exchangeCode(config, 'fixture-code'), tokens); }
  finally { fetchMock.mock.restore(); }
  const denied = mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 401 }));
  try { await assert.rejects(exchangeCode(config, 'bad'), /authorization/); }
  finally { denied.mock.restore(); }
});
test('token validation rejects a different client or missing chat scope', async () => {
  for (const identity of [
    { client_id: 'other-client', user_id: '42', login: 'fixture', scopes: ['user:read:chat'] },
    { client_id: config.clientId, user_id: '42', login: 'fixture', scopes: [] },
  ]) {
    const fetchMock = mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(identity)));
    try { await assert.rejects(validateToken(config, tokens.access_token), /permission/); }
    finally { fetchMock.mock.restore(); }
  }
});
test('EventSub subscribes to broadcaster chat and deduplicates Twitch message IDs', async () => {
  const socket = new FixtureSocket();
  const statuses: TwitchStatus[] = [], chat: string[] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async (url: unknown, init: RequestInit) => {
    assert.equal(String(url), 'https://api.twitch.tv/helix/eventsub/subscriptions');
    assert.deepEqual(JSON.parse(init.body as string), {
      type: 'channel.chat.message', version: '1',
      condition: { broadcaster_user_id: '42', user_id: '42' },
      transport: { method: 'websocket', session_id: 'fixture-session' },
    });
    return new Response('{}', { status: 202 });
  });
  const connection = new TwitchConnection(config, { ...tokens }, { userId: '42', login: 'fixture' }, {
    status: status => statuses.push(status), chat: (_id, _name, text) => chat.push(text),
  }, () => socket as unknown as WebSocket);
  try {
    connection.start();
    socket.event('session_welcome', { session: { id: 'fixture-session', keepalive_timeout_seconds: 30 } });
    await delay(10);
    assert.ok(statuses.includes('connected'));
    const payload = { subscription: { type: 'channel.chat.message' }, event: { chatter_user_id: '7', chatter_user_name: 'Crew', message: { text: '!nav VEGA' } } };
    socket.event('notification', payload, 'message-1');
    socket.event('notification', payload, 'message-1');
    socket.event('notification', payload, 'message-2');
    assert.deepEqual(chat, ['!nav VEGA', '!nav VEGA']);
  } finally { connection.stop(); fetchMock.mock.restore(); }
});
test('EventSub session migration keeps subscriptions and closes the old socket after welcome', async () => {
  const sockets: FixtureSocket[] = [], statuses: TwitchStatus[] = [];
  const fetchMock = mock.method(globalThis, 'fetch', async () => new Response('{}', { status: 202 }));
  const connection = new TwitchConnection(config, { ...tokens }, { userId: '42', login: 'fixture' }, {
    status: status => statuses.push(status), chat: () => {},
  }, () => { const socket = new FixtureSocket(); sockets.push(socket); return socket as unknown as WebSocket; });
  try {
    connection.start();
    sockets[0].event('session_welcome', { session: { id: 'first' } });
    await delay(10);
    let oldClosed = false;
    sockets[0].on('close', () => { oldClosed = true; });
    sockets[0].event('session_reconnect', { session: { reconnect_url: 'wss://eventsub.wss.twitch.tv/ws?reconnect=fixture' } });
    assert.equal(sockets.length, 2);
    assert.equal(oldClosed, false);
    sockets[1].event('session_welcome', { session: { id: 'migrated' } });
    assert.equal(oldClosed, true);
    assert.equal(fetchMock.mock.callCount(), 1, 'migration must not create duplicate subscriptions');
    assert.equal(statuses.at(-1), 'connected');
  } finally { connection.stop(); fetchMock.mock.restore(); }
});
test('revoked subscription stops chat and reports an actionable reconnect error', async () => {
  const socket = new FixtureSocket();
  let error = '';
  const connection = new TwitchConnection(config, { ...tokens }, { userId: '42', login: 'fixture' }, {
    status: (_status, message) => { error = message || ''; }, chat: () => {},
  }, () => socket as unknown as WebSocket);
  try {
    connection.start();
    socket.event('revocation', { subscription: { status: 'authorization_revoked' } });
    assert.match(error, /revoked/);
  } finally { connection.stop(); }
});
