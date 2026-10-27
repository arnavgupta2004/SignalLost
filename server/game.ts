import { randomBytes, randomInt } from 'node:crypto';
import { GLYPHS, SECTORS, type CrewMember, type HostAction, type Intel, type PublicState, type RoomState, type Signal, type Specialty } from '../shared/protocol.ts';

export const MISSION_DURATION = 6 * 60_000;
export interface Room {
  state: PublicState;
  hostToken: string;
  intel: Intel;
  lastTick: number;
  lastActive: number;
  chatCooldowns: Map<string, number>;
}
export function makeIntel(): Intel {
  const safeSector = SECTORS[randomInt(SECTORS.length)];
  const relayTarget = [true, false, true, false].sort(() => randomInt(2) ? 1 : -1);
  const code = Array.from({ length: 4 }, () => GLYPHS[randomInt(GLYPHS.length)]);
  const clues = {
    SUN: 'The star that gives our home its daylight.',
    WAVE: 'The shape of an ocean in motion.',
    STAR: 'A distant point of light with five rays.',
    MOON: 'The crescent that watches over the night.',
  };
  return {
    safeSector,
    sectors: SECTORS.map((name, i) => ({
      name, danger: name !== safeSector, distance: `${[2.4, 3.1, 1.8][i]} AU`,
      detail: name === safeSector ? 'Clear corridor · stable beacon' : i === 1 ? 'Ion storm · lethal interference' : 'Debris field · collision predicted',
    })),
    relayTarget,
    relayHint: `Emergency bus requires ${relayTarget.map((on, i) => on ? String.fromCharCode(65 + i) : null).filter(Boolean).join(' + ')} ON. Other relays must be OFF.`,
    code,
    codeHints: code.map(g => clues[g]),
  };
}
export function createRoom(mode: 'training' | 'twitch', configured = false, now = Date.now()): Room {
  const roomId = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  return {
    hostToken: randomBytes(32).toString('hex'),
    intel: makeIntel(),
    lastTick: now,
    lastActive: now,
    chatCooldowns: new Map(),
    state: {
      roomId, missionName: 'The last light', mode, phase: 'lobby', stage: 0,
      oxygen: 100, integrity: 100, remainingMs: MISSION_DURATION, durationMs: MISSION_DURATION,
      startedAt: null, paused: false, strikes: 0, relays: [false, false, false, false],
      enteredCode: [], crew: [], signals: [], feedback: null, viewers: 0,
      twitch: { status: 'offline', channel: null, error: null, configured },
      stats: { actions: 0, messages: 0, timeUsedMs: 0 }, debrief: null,
    },
  };
}
export function projectState(room: Room, role: 'host' | 'viewer' | 'overlay'): RoomState {
  // Never send puzzle solutions to cockpit or OBS clients.
  return role === 'viewer' ? { ...room.state, intel: room.intel } : { ...room.state };
}
function feedback(room: Room, kind: 'success' | 'error' | 'info', text: string, now: number) {
  room.state.feedback = { kind, text, time: now };
}
function finish(room: Room, rescued: boolean, now: number) {
  const s = room.state;
  s.phase = rescued ? 'rescued' : 'lost';
  s.paused = false;
  s.stats.timeUsedMs = s.durationMs - s.remainingMs;
  const score = rescued ? Math.max(0, Math.round(500 + s.remainingMs / 1000 * 2 + s.integrity * 3 + Math.min(s.crew.length, 20) * 15 - s.strikes * 25)) : 0;
  s.debrief = {
    score, rank: rescued ? score >= 1200 ? 'Legendary crew' : score >= 900 ? 'Elite rescue' : 'Mission accomplished' : 'Signal lost',
    medals: rescued ? [
      ...(s.strikes === 0 ? ['Flawless flight'] : []),
      ...(s.remainingMs > s.durationMs / 2 ? ['Against the clock'] : []),
      ...(s.crew.length >= 3 ? ['Better together'] : []),
      'Six lives saved',
    ] : ['Flight recorder recovered'],
  };
  feedback(room, rescued ? 'success' : 'error', rescued ? 'Escape capsule recovered. All six survivors are coming home.' : 'The beacon went silent. Your crew can launch a new rescue.', now);
}
function strike(room: Room, text: string, now: number) {
  const s = room.state;
  s.strikes++;
  s.integrity = Math.max(0, s.integrity - 20);
  s.remainingMs = Math.max(0, s.remainingMs - 20_000);
  s.oxygen = Math.ceil(s.remainingMs / s.durationMs * 100);
  feedback(room, 'error', `${text} Hull −20%. Oxygen reserve −20 seconds.`, now);
  if (s.integrity === 0 || s.remainingMs === 0) finish(room, false, now);
}
export function tick(room: Room, now = Date.now()): boolean {
  const delta = Math.max(0, now - room.lastTick);
  room.lastTick = now;
  const s = room.state;
  if (s.phase !== 'active' || s.paused) return false;
  s.remainingMs = Math.max(0, s.remainingMs - delta);
  s.oxygen = Math.ceil(s.remainingMs / s.durationMs * 100);
  s.stats.timeUsedMs = s.durationMs - s.remainingMs;
  if (s.remainingMs === 0) finish(room, false, now);
  return true;
}
export function hostAction(room: Room, action: HostAction, now = Date.now()): boolean {
  tick(room, now);
  room.lastActive = now;
  const s = room.state;
  if (action.type === 'reset') {
    const fresh = createRoom(s.mode, s.twitch.configured, now);
    const twitch = s.twitch;
    const viewers = s.viewers;
    room.intel = fresh.intel;
    room.state = { ...fresh.state, roomId: s.roomId, twitch, viewers };
    room.chatCooldowns.clear();
    room.lastTick = now;
    return true;
  }
  if (action.type === 'start' && s.phase === 'lobby') {
    s.phase = 'active'; s.startedAt = now; room.lastTick = now;
    feedback(room, 'info', 'Rescue launched. Ask your navigators for the safe corridor.', now);
    return true;
  }
  if (action.type === 'training-signal' && s.mode === 'training') {
    return receiveChat(room, `training:${action.name}`, action.name, action.text, 'training', now, action.specialty);
  }
  if (action.type === 'simulate-crew' && s.mode === 'training') {
    const name = ['Echo_Nav', 'Nova_Eng', 'Lyra_Sig'][s.stage];
    const text = s.phase === 'lobby' ? '!join nav' : s.stage === 0
      ? `!nav ${room.intel.safeSector} — clear corridor. Other sectors are dangerous!`
      : s.stage === 1
        ? `!power ${room.intel.relayTarget.map((on, i) => on ? String.fromCharCode(65 + i) : null).filter(Boolean).join(' ')} ON, all others OFF. Then engage the bus.`
        : `!code ${room.intel.code.join(' ')} — transmit in this order. Six survivors are waiting.`;
    return receiveChat(room, `training:${name}`, name, text, 'training', now, ['navigator', 'engineer', 'decoder'][s.stage] as Specialty);
  }
  if (action.type === 'pause' && s.phase === 'active') {
    s.paused = !s.paused;
    feedback(room, 'info', s.paused ? 'Mission paused. Take a breath, crew.' : 'Mission resumed. The clock is running.', now);
    return true;
  }
  if (s.phase !== 'active' || s.paused) return false;
  if (action.type === 'route' && s.stage === 0 && SECTORS.includes(action.sector)) {
    s.stats.actions++;
    if (action.sector !== room.intel.safeSector) strike(room, 'Unsafe corridor. Emergency evasive maneuver.', now);
    else {
      s.stage = 1;
      feedback(room, 'success', 'Safe corridor locked. Now restore power to the rescue airlock.', now);
    }
    return true;
  }
  if (action.type === 'relay' && s.stage === 1 && Number.isInteger(action.index) && action.index >= 0 && action.index < 4) {
    s.relays[action.index] = !s.relays[action.index]; s.stats.actions++; return true;
  }
  if (action.type === 'power' && s.stage === 1) {
    s.stats.actions++;
    if (!s.relays.every((on, i) => on === room.intel.relayTarget[i])) strike(room, 'Power configuration rejected. Ask engineering to check every relay.', now);
    else {
      s.stage = 2;
      feedback(room, 'success', 'Airlock powered. Decode the four-symbol distress handshake.', now);
    }
    return true;
  }
  if (action.type === 'glyph' && s.stage === 2 && GLYPHS.includes(action.glyph) && s.enteredCode.length < 4) {
    s.enteredCode.push(action.glyph); s.stats.actions++; return true;
  }
  if (action.type === 'clear-code' && s.stage === 2) { s.enteredCode = []; return true; }
  if (action.type === 'transmit' && s.stage === 2 && s.enteredCode.length === 4) {
    s.stats.actions++;
    if (!s.enteredCode.every((g, i) => g === room.intel.code[i])) {
      s.enteredCode = []; strike(room, 'Handshake rejected. The survivors need the symbols in the correct order.', now);
    } else finish(room, true, now);
    return true;
  }
  return false;
}
export function receiveChat(
  room: Room, id: string, displayName: string, text: string, source: 'twitch' | 'training',
  now = Date.now(), defaultSpecialty: Specialty = 'navigator',
): boolean {
  const clean = text.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 160);
  const match = /^!(join|nav|power|code|ping|help)(?:\s+(.*))?$/i.exec(clean);
  if (!match) return false;
  if (now - (room.chatCooldowns.get(id) ?? 0) < 1500) return false;
  room.chatCooldowns.set(id, now);
  const [, rawCommand, arg = ''] = match;
  const command = rawCommand.toLowerCase();
  const roleArg = arg.toLowerCase();
  const specialties: Record<string, Specialty> = { nav: 'navigator', navigator: 'navigator', engineer: 'engineer', engineering: 'engineer', decoder: 'decoder', decode: 'decoder' };
  const specialty: Specialty = command === 'join' ? specialties[roleArg] ?? defaultSpecialty : command === 'power' ? 'engineer' : command === 'code' ? 'decoder' : command === 'nav' ? 'navigator' : defaultSpecialty;
  let member = room.state.crew.find(c => c.id === id);
  if (!member && room.state.crew.length < 200) {
    member = { id, name: displayName.slice(0, 30), specialty, contributions: 0 } satisfies CrewMember;
    room.state.crew.push(member);
  }
  if (member) { member.specialty = specialty; if (command !== 'join' && command !== 'help') member.contributions++; }
  let signalText = clean;
  if (command === 'join') signalText = `Joined ${specialty === 'navigator' ? 'navigation' : specialty === 'engineer' ? 'engineering' : 'signal decoding'}. Ready to bring them home.`;
  if (command === 'help') signalText = 'Open the crew link for intel. Send !nav SECTOR, !power A C, or !code SUN WAVE STAR MOON.';
  const signal: Signal = {
    id: randomBytes(6).toString('hex'), name: displayName.slice(0, 30), text: signalText,
    source, time: now, specialty,
  };
  room.state.signals = [...room.state.signals.slice(-29), signal];
  room.state.stats.messages++;
  room.lastActive = now;
  return true;
}
