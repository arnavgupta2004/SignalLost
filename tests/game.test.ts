import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRoom, hostAction, MISSION_DURATION, projectState, receiveChat, tick } from '../server/game.ts';

const now = 100_000;
function started(mode: 'training' | 'twitch' = 'training') {
  const room = createRoom(mode, false, now);
  hostAction(room, { type: 'start' }, now);
  return room;
}
test('cockpit and OBS projections never contain puzzle solutions or host credentials', () => {
  const room = started();
  for (const role of ['host', 'overlay'] as const) {
    const json = JSON.stringify(projectState(room, role));
    assert.ok(!json.includes('safeSector'));
    assert.ok(!json.includes('relayTarget'));
    assert.ok(!json.includes('codeHints'));
    assert.ok(!json.includes(room.hostToken));
  }
  assert.equal(projectState(room, 'viewer').intel?.safeSector, room.intel.safeSector);
});
test('crew-guided route, power, and handshake rescue all survivors', () => {
  const room = started();
  assert.equal(hostAction(room, { type: 'transmit' }, now), false);
  hostAction(room, { type: 'route', sector: room.intel.safeSector }, now + 1000);
  assert.equal(room.state.stage, 1);
  room.intel.relayTarget.forEach((on, index) => { if (on) hostAction(room, { type: 'relay', index }, now + 2000); });
  hostAction(room, { type: 'power' }, now + 3000);
  assert.equal(room.state.stage, 2);
  room.intel.code.forEach(glyph => hostAction(room, { type: 'glyph', glyph }, now + 4000));
  hostAction(room, { type: 'transmit' }, now + 5000);
  assert.equal(room.state.phase, 'rescued');
  assert.ok(room.state.debrief!.score > 1000);
  assert.ok(room.state.debrief!.medals.includes('Six lives saved'));
  tick(room, now + MISSION_DURATION * 2);
  assert.equal(room.state.phase, 'rescued');
});
test('wrong choices apply damage and time penalties, and five strikes end the mission', () => {
  const room = started();
  const wrong = room.intel.sectors.find(s => s.danger)!.name;
  hostAction(room, { type: 'route', sector: wrong }, now);
  assert.equal(room.state.stage, 0);
  assert.equal(room.state.integrity, 80);
  assert.equal(room.state.remainingMs, MISSION_DURATION - 20_000);
  for (let i = 0; i < 4; i++) hostAction(room, { type: 'route', sector: wrong }, now);
  assert.equal(room.state.phase, 'lost');
  assert.equal(room.state.integrity, 0);
  assert.equal(room.state.debrief!.score, 0);
});
test('pause freezes oxygen and actions, resume continues without consuming paused time', () => {
  const room = started();
  hostAction(room, { type: 'pause' }, now + 1000);
  const remaining = room.state.remainingMs;
  tick(room, now + 200_000);
  assert.equal(room.state.remainingMs, remaining);
  assert.equal(hostAction(room, { type: 'route', sector: room.intel.safeSector }, now + 200_000), false);
  hostAction(room, { type: 'pause' }, now + 200_000);
  tick(room, now + 201_000);
  assert.equal(room.state.remainingMs, remaining - 1000);
});
test('zero oxygen ends the mission and expired actions cannot revive it', () => {
  const room = started();
  hostAction(room, { type: 'route', sector: room.intel.safeSector }, now + MISSION_DURATION);
  assert.equal(room.state.phase, 'lost');
  assert.equal(room.state.stage, 0);
  assert.equal(room.state.oxygen, 0);
});
test('reset changes puzzles, keeps room access and Twitch, and clears contributions', () => {
  const room = started('twitch');
  const token = room.hostToken;
  const roomId = room.state.roomId;
  room.state.twitch.channel = 'testchannel';
  room.state.twitch.status = 'connected';
  room.state.viewers = 2;
  const oldIntel = room.intel;
  receiveChat(room, '123', 'Crew', '!join engineer', 'twitch', now);
  hostAction(room, { type: 'reset' }, now + 1000);
  assert.equal(room.hostToken, token);
  assert.equal(room.state.roomId, roomId);
  assert.equal(room.state.phase, 'lobby');
  assert.equal(room.state.twitch.channel, 'testchannel');
  assert.equal(room.state.twitch.status, 'connected');
  assert.equal(room.state.viewers, 2);
  assert.equal(room.state.crew.length, 0);
  assert.notEqual(room.intel, oldIntel);
});
test('Twitch commands enlist crew, record contributions, and respect viewer cooldown', () => {
  const room = started('twitch');
  assert.equal(receiveChat(room, '123', 'Ada', 'ordinary conversation', 'twitch', now), false);
  assert.equal(receiveChat(room, '123', 'Ada', '!JOIN engineer', 'twitch', now), true);
  assert.equal(room.state.crew[0].specialty, 'engineer');
  assert.equal(room.state.crew[0].contributions, 0);
  assert.equal(receiveChat(room, '123', 'Ada', '!power A C', 'twitch', now + 500), false);
  assert.equal(receiveChat(room, '123', 'Ada', '!power A C', 'twitch', now + 2000), true);
  assert.equal(room.state.crew[0].contributions, 1);
  assert.equal(room.state.stats.messages, 2);
  assert.equal(room.state.signals[1].source, 'twitch');
  assert.equal(room.state.stage, 0, 'chat never directly operates the cockpit');
});
test('training simulations are unavailable in real Twitch mode', () => {
  const room = started('twitch');
  assert.equal(hostAction(room, { type: 'simulate-crew' }, now), false);
  assert.equal(hostAction(room, { type: 'training-signal', text: '!nav VEGA', name: 'Fake', specialty: 'navigator' }, now), false);
  assert.equal(room.state.signals.length, 0);
});
test('simulated intel guides solo training without putting solutions in host state', () => {
  const room = started();
  hostAction(room, { type: 'simulate-crew' }, now);
  assert.ok(room.state.signals[0].text.includes(room.intel.safeSector));
  assert.equal(room.state.signals[0].source, 'training');
  assert.equal(projectState(room, 'host').intel, undefined);
});
test('bad relay indexes and excessive glyphs cannot mutate the mission', () => {
  const room = started();
  hostAction(room, { type: 'route', sector: room.intel.safeSector }, now);
  for (const index of [-1, 4, 1.5, NaN]) assert.equal(hostAction(room, { type: 'relay', index }, now), false);
  assert.deepEqual(room.state.relays, [false, false, false, false]);
});
test('signal log and crew manifest stay bounded under heavy participation', () => {
  const room = started('twitch');
  for (let i = 0; i < 300; i++) receiveChat(room, `${i}`, `Crew${i}`, '!ping ready', 'twitch', now);
  assert.equal(room.state.crew.length, 200);
  assert.equal(room.state.signals.length, 30);
  assert.equal(room.state.stats.messages, 300);
});
test('crew readback counts distinct voices, replaces changed findings, and clears for the next system', () => {
  const room = started('twitch');
  receiveChat(room, '1', 'Ada', '!nav VEGA', 'twitch', now);
  receiveChat(room, '2', 'Lin', '!nav VEGA', 'twitch', now);
  receiveChat(room, '3', 'Kai', '!nav ORION', 'twitch', now);
  assert.deepEqual(room.state.findings[0], { label: 'VEGA', votes: 2, total: 3 });
  receiveChat(room, '1', 'Ada', '!nav ORION', 'twitch', now + 2000);
  assert.deepEqual(room.state.findings[0], { label: 'ORION', votes: 2, total: 3 });
  hostAction(room, { type: 'route', sector: room.intel.safeSector }, now + 3000);
  assert.deepEqual(room.state.findings, []);
});
