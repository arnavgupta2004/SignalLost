import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createRoom,
  hostAction,
  MISSION_DURATION,
  projectState,
  receiveChat,
  tick,
  DOCKING_POSITIONS,
} from '../server/game.ts';

const now = 100_000;
function started(mode: 'training' | 'twitch' = 'training') {
  const room = createRoom(mode, false, now);
  if (mode === 'twitch') room.state.twitch.status = 'connected';
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
    assert.ok(!json.includes('"dockingLane"'));
    assert.ok(!json.includes('"readings"'));
    assert.ok(!json.includes(room.hostToken));
  }
  assert.equal(projectState(room, 'viewer').intel?.safeSector, room.intel.safeSector);
});
test('crew-guided route, power, and handshake rescue all survivors', () => {
  const room = started();
  assert.equal(hostAction(room, { type: 'transmit' }, now), false);
  hostAction(room, { type: 'route', sector: room.intel.safeSector }, now + 1000);
  assert.equal(room.state.stage, 1);
  room.intel.relayTarget.forEach((on, index) => {
    if (on) hostAction(room, { type: 'relay', index }, now + 2000);
  });
  hostAction(room, { type: 'power' }, now + 3000);
  assert.equal(room.state.stage, 2);
  room.intel.code.forEach((glyph) => hostAction(room, { type: 'glyph', glyph }, now + 4000));
  hostAction(room, { type: 'transmit' }, now + 5000);
  assert.equal(room.state.stage, 3);
  assert.equal(room.state.phase, 'active');
  room.state.docking.position = DOCKING_POSITIONS[room.intel.dockingLane];
  hostAction(room, { type: 'tractor' }, now + 5000);
  tick(room, now + 11_000);
  assert.equal(room.state.phase, 'rescued');
  assert.ok(room.state.debrief!.score > 1000);
  assert.ok(room.state.debrief!.medals.includes('Six lives saved'));
  tick(room, now + MISSION_DURATION * 2);
  assert.equal(room.state.phase, 'rescued');
});
test('navigation measurements identify exactly one corridor satisfying the pilot’s limits', () => {
  for (let i = 0; i < 30; i++) {
    const room = createRoom('twitch', false, now);
    const safe = room.intel.readings.filter(
      (reading) =>
        reading.radiation <= room.state.navigationLimits.radiationLimit &&
        reading.beacon >= room.state.navigationLimits.beaconMinimum,
    );
    assert.equal(safe.length, 1);
    assert.equal(safe[0].sector, room.intel.safeSector);
    assert.equal(new Set(room.intel.code).size, 4);
    assert.ok(room.state.decoderOrder.some((value, index) => value !== index));
  }
});
test('live missions wait for a connected Twitch uplink while training remains available', () => {
  const live = createRoom('twitch', false, now);
  hostAction(live, { type: 'start' }, now);
  assert.equal(live.state.phase, 'lobby');
  assert.match(live.state.feedback!.text, /Connect Twitch/);
  live.state.twitch.status = 'connected';
  hostAction(live, { type: 'start' }, now);
  assert.equal(live.state.phase, 'active');
  const training = createRoom('training', false, now);
  hostAction(training, { type: 'start' }, now);
  assert.equal(training.state.phase, 'active');
});
test('every generated engineering schematic has exactly one solution', () => {
  for (let i = 0; i < 30; i++) {
    const room = createRoom('twitch', false, now);
    const rules = room.intel.powerRules;
    const indices = rules.map((rule) =>
      [...rule.matchAll(/\b[A-D]\b/g)].map((m) => m[0].charCodeAt(0) - 65),
    );
    const solutions = Array.from({ length: 16 }, (_, mask) =>
      [0, 1, 2, 3].map((bit) => Boolean(mask & (1 << bit))),
    ).filter(
      (values) =>
        values[indices[0][0]] !== values[indices[0][1]] &&
        values[indices[1][0]] !== values[indices[1][1]] &&
        values[indices[2][0]] === values[indices[2][1]] &&
        !(values[indices[3][0]] && values[indices[3][1]]),
    );
    assert.equal(solutions.length, 1);
    assert.deepEqual(solutions[0], room.intel.relayTarget);
  }
});
test('commander handshake requires meanings in the pilot’s transmission order', () => {
  const room = createRoom('training', false, now, 'commander');
  hostAction(room, { type: 'start' }, now);
  hostAction(room, { type: 'route', sector: room.intel.safeSector }, now);
  room.intel.relayTarget.forEach((on, index) => {
    if (on) hostAction(room, { type: 'relay', index }, now);
  });
  hostAction(room, { type: 'power' }, now);
  room.state.decoderOrder = [2, 0, 3, 1];
  room.intel.code = ['SUN', 'MOON', 'WAVE', 'STAR'];
  room.intel.code.forEach((glyph) => hostAction(room, { type: 'glyph', glyph }, now));
  hostAction(room, { type: 'transmit' }, now);
  assert.equal(room.state.stage, 2);
  assert.equal(room.state.strikes, 1);
  room.state.decoderOrder.forEach((index) =>
    hostAction(room, { type: 'glyph', glyph: room.intel.code[index] }, now),
  );
  hostAction(room, { type: 'transmit' }, now);
  assert.equal(room.state.stage, 3);
});
test('an unsafe approach heats the beam and overheating disengages it with damage', () => {
  const room = started();
  room.state.stage = 3;
  room.state.docking.position = DOCKING_POSITIONS[room.intel.dockingLane] + 40;
  hostAction(room, { type: 'tractor' }, now);
  tick(room, now + 6000);
  assert.equal(room.state.docking.tractor, false);
  assert.equal(room.state.docking.progress, 0);
  assert.equal(room.state.integrity, 80);
  assert.equal(room.state.phase, 'active');
});
test('steering moves the ship and releasing controls stops cadet thrust', () => {
  const room = started();
  room.state.stage = 3;
  hostAction(room, { type: 'steer', direction: -1 }, now);
  tick(room, now + 1000);
  assert.equal(room.state.docking.position, -32);
  hostAction(room, { type: 'steer', direction: 0 }, now + 1000);
  tick(room, now + 2000);
  assert.equal(room.state.docking.position, -32);
});
test('boosts use one cell per distinct viewer and never exceed the three-cell budget', () => {
  const room = started('twitch');
  room.state.stage = 3;
  receiveChat(room, '1', 'Ada', '!boost', 'twitch', now);
  assert.equal(room.state.docking.boostsUsed, 1);
  receiveChat(room, '1', 'Ada', '!boost', 'twitch', now + 2000);
  assert.equal(room.state.docking.boostsUsed, 1);
  receiveChat(room, '2', 'Lin', '!boost', 'twitch', now + 2000);
  receiveChat(room, '3', 'Kai', '!boost', 'twitch', now + 2000);
  receiveChat(room, '4', 'Rin', '!boost', 'twitch', now + 2000);
  assert.equal(room.state.docking.boostsUsed, 3);
  assert.equal(room.boosters.size, 3);
  assert.equal(room.state.flightLog.filter((event) => event.kind === 'boost').length, 3);
});
test('crew power cells cancel drift for exactly their remaining stabilization time', () => {
  const room = started('twitch');
  room.state.stage = 3;
  receiveChat(room, '1', 'Ada', '!boost', 'twitch', now);
  tick(room, now + 5000);
  assert.equal(room.state.docking.position, 0);
  assert.equal(room.state.docking.stabilizedMs, 1000);
  tick(room, now + 7000);
  assert.ok(room.state.docking.position > 0);
  assert.equal(room.state.docking.stabilizedMs, 0);
});
test('pause freezes approach and power cells and releases steering and tractor controls', () => {
  const room = started('twitch');
  room.state.stage = 3;
  hostAction(room, { type: 'steer', direction: 1 }, now);
  hostAction(room, { type: 'tractor' }, now);
  receiveChat(room, '1', 'Ada', '!boost', 'twitch', now);
  hostAction(room, { type: 'pause' }, now);
  tick(room, now + 200_000);
  assert.equal(room.state.docking.position, 0);
  assert.equal(room.state.docking.stabilizedMs, 6000);
  assert.equal(room.state.docking.steering, 0);
  assert.equal(room.state.docking.tractor, false);
  receiveChat(room, '2', 'Lin', '!boost', 'twitch', now + 200_000);
  assert.equal(room.state.docking.boostsUsed, 1);
});
test('profile changes preserve crew and access and are only allowed before launch', () => {
  const room = createRoom('training', false, now);
  const token = room.hostToken;
  receiveChat(room, '1', 'Ada', '!join nav', 'training', now);
  assert.equal(hostAction(room, { type: 'configure', difficulty: 'commander' }, now), true);
  assert.equal(room.state.crew.length, 1);
  assert.equal(room.hostToken, token);
  assert.equal(room.state.durationMs, 300_000);
  assert.deepEqual([...room.state.decoderOrder].sort(), [0, 1, 2, 3]);
  hostAction(room, { type: 'start' }, now);
  assert.equal(hostAction(room, { type: 'configure', difficulty: 'cadet' }, now), false);
  assert.equal(room.state.difficulty, 'commander');
  hostAction(room, { type: 'reset' }, now);
  assert.equal(room.state.difficulty, 'commander');
  assert.equal(room.state.docking.boostsUsed, 0);
});
test('flight recorder measures active flight time separately from oxygen penalties', () => {
  const room = started();
  tick(room, now + 4000);
  const wrong = room.intel.sectors.find((sector) => sector.danger)!.name;
  hostAction(room, { type: 'route', sector: wrong }, now + 4000);
  assert.equal(room.state.stats.timeUsedMs, 4000);
  assert.equal(room.state.remainingMs, MISSION_DURATION - 24_000);
  assert.equal(room.state.flightLog.at(-1)!.timeUsedMs, 4000);
});
test('wrong choices apply damage and time penalties, and five strikes end the mission', () => {
  const room = started();
  const wrong = room.intel.sectors.find((s) => s.danger)!.name;
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
  assert.equal(
    hostAction(room, { type: 'route', sector: room.intel.safeSector }, now + 200_000),
    false,
  );
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
  assert.equal(
    hostAction(
      room,
      { type: 'training-signal', text: '!nav VEGA', name: 'Fake', specialty: 'navigator' },
      now,
    ),
    false,
  );
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
  for (const index of [-1, 4, 1.5, NaN])
    assert.equal(hostAction(room, { type: 'relay', index }, now), false);
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
