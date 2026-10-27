import { randomBytes, randomInt } from 'node:crypto';
import {
  GLYPHS,
  SECTORS,
  RELAYS,
  type CrewMember,
  type Difficulty,
  type HostAction,
  type Intel,
  type PublicState,
  type RoomState,
  type Signal,
  type Specialty,
} from '../shared/protocol.ts';

export const MISSION_DURATION = 6 * 60_000;
export const DOCKING_POSITIONS = [-70, -35, 0, 35, 70];
export interface Room {
  state: PublicState;
  hostToken: string;
  intel: Intel;
  lastTick: number;
  lastActive: number;
  chatCooldowns: Map<string, number>;
  votes: Map<string, string>;
  boosters: Set<string>;
}
function shuffled<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function makeIntel(): Intel {
  const safeSector = SECTORS[randomInt(SECTORS.length)];
  const wiring = shuffled([0, 1, 2, 3]);
  const relayTarget = RELAYS.map((_, i) => i === wiring[1] || i === wiring[3]);
  const code = Array.from({ length: 4 }, () => GLYPHS[randomInt(GLYPHS.length)]);
  const clues = {
    SUN: [
      'The star that gives our home its daylight.',
      'The light at the center of our solar system.',
    ],
    WAVE: ['The shape of an ocean in motion.', 'A rising crest, then a falling trough.'],
    STAR: [
      'A distant point of light with five rays.',
      'Five points of light guide a traveler home.',
    ],
    MOON: [
      'The crescent that watches over the night.',
      'A silver crescent, reflecting borrowed light.',
    ],
  };
  const radiationLimit = [3.6, 4.2, 4.8][randomInt(3)];
  const beaconMinimum = [75, 80, 85][randomInt(3)];
  let dangerIndex = 0;
  const readings = SECTORS.map((sector) => {
    if (sector === safeSector)
      return {
        sector,
        radiation: Number((radiationLimit - 0.8).toFixed(1)),
        beacon: beaconMinimum + 8,
      };
    const radiationDanger = dangerIndex++ === 0;
    return {
      sector,
      radiation: Number((radiationLimit + (radiationDanger ? 1.3 : -1.4)).toFixed(1)),
      beacon: beaconMinimum + (radiationDanger ? 6 : -22),
    };
  });
  return {
    safeSector,
    sectors: SECTORS.map((name, i) => ({
      name,
      danger: name !== safeSector,
      distance: `${[2.4, 3.1, 1.8][i]} AU`,
      detail:
        name === safeSector
          ? 'Clear corridor · stable beacon'
          : i === 1
            ? 'Ion storm · lethal interference'
            : 'Debris field · collision predicted',
    })),
    navigation: { radiationLimit, beaconMinimum },
    readings,
    relayTarget,
    relayHint: `Emergency bus requires ${relayTarget
      .map((on, i) => (on ? RELAYS[i] : null))
      .filter(Boolean)
      .join(' + ')} ON. Other relays must be OFF.`,
    powerRules: [
      `Primary supply: exactly one of ${RELAYS[wiring[0]]} / ${RELAYS[wiring[1]]} must be ON.`,
      `Backup supply: exactly one of ${RELAYS[wiring[2]]} / ${RELAYS[wiring[3]]} must be ON.`,
      `Linked coupler: ${RELAYS[wiring[1]]} and ${RELAYS[wiring[3]]} must have the same state.`,
      `Overload protection: ${RELAYS[wiring[0]]} and ${RELAYS[wiring[2]]} cannot both be ON.`,
    ],
    code,
    codeHints: code.map((g) => clues[g][randomInt(clues[g].length)]),
    dockingLane: randomInt(DOCKING_POSITIONS.length),
  };
}
export function createRoom(
  mode: 'training' | 'twitch',
  configured = false,
  now = Date.now(),
  difficulty: Difficulty = mode === 'twitch' ? 'commander' : 'cadet',
): Room {
  const roomId = randomBytes(4).toString('hex').slice(0, 6).toUpperCase();
  const durationMs = difficulty === 'cadet' ? MISSION_DURATION : 5 * 60_000;
  const intel = makeIntel();
  return {
    hostToken: randomBytes(32).toString('hex'),
    intel,
    lastTick: now,
    lastActive: now,
    chatCooldowns: new Map(),
    votes: new Map(),
    boosters: new Set(),
    state: {
      roomId,
      missionName: 'The last light',
      mode,
      difficulty,
      phase: 'lobby',
      stage: 0,
      oxygen: 100,
      integrity: 100,
      remainingMs: durationMs,
      durationMs,
      startedAt: null,
      paused: false,
      strikes: 0,
      relays: [false, false, false, false],
      enteredCode: [],
      decoderOrder: difficulty === 'cadet' ? [0, 1, 2, 3] : shuffled([0, 1, 2, 3]),
      navigationLimits: intel.navigation,
      docking: {
        position: 0,
        steering: 0,
        tractor: false,
        progress: 0,
        heat: 0,
        stabilizedMs: 0,
        boostsUsed: 0,
      },
      flightLog: [],
      crew: [],
      signals: [],
      findings: [],
      feedback: null,
      viewers: 0,
      twitch: { status: 'offline', channel: null, error: null, configured },
      stats: { actions: 0, messages: 0, timeUsedMs: 0 },
      debrief: null,
    },
  };
}
export function projectState(room: Room, role: 'host' | 'viewer' | 'overlay'): RoomState {
  // Ordering is visible on stream. Symbol meanings and all full solutions stay crew-only.
  return role === 'viewer' ? { ...room.state, intel: room.intel } : { ...room.state };
}
function feedback(room: Room, kind: 'success' | 'error' | 'info', message: string, now: number) {
  room.state.feedback = { kind, text: message, time: now };
}
function record(
  room: Room,
  label: string,
  kind: 'milestone' | 'damage' | 'boost' = 'milestone',
  actor?: string,
) {
  room.state.flightLog = [
    ...room.state.flightLog.slice(-19),
    {
      id: randomBytes(5).toString('hex'),
      label,
      kind,
      actor,
      timeUsedMs: room.state.stats.timeUsedMs,
    },
  ];
}
function finish(room: Room, rescued: boolean, now: number) {
  const s = room.state;
  s.phase = rescued ? 'rescued' : 'lost';
  s.paused = false;
  s.docking.steering = 0;
  s.docking.tractor = false;
  record(room, rescued ? 'Six survivors safely aboard' : 'Beacon went silent');
  const score = rescued
    ? Math.max(
        0,
        Math.round(
          500 +
            (s.remainingMs / 1000) * 2 +
            s.integrity * 3 +
            Math.min(s.crew.length, 20) * 15 -
            s.strikes * 25 +
            (s.difficulty === 'commander' ? 250 : 0),
        ),
      )
    : 0;
  s.debrief = {
    score,
    rank: rescued
      ? score >= 1200
        ? 'Legendary crew'
        : score >= 900
          ? 'Elite rescue'
          : 'Mission accomplished'
      : 'Signal lost',
    medals: rescued
      ? [
          ...(s.strikes === 0 ? ['Flawless flight'] : []),
          ...(s.remainingMs > s.durationMs / 2 ? ['Against the clock'] : []),
          ...(s.crew.length >= 3 ? ['Better together'] : []),
          ...(s.docking.boostsUsed ? ['A community brought them home'] : []),
          ...(s.difficulty === 'commander' ? ['Commander flight'] : []),
          'Six lives saved',
        ]
      : ['Flight recorder recovered'],
  };
  feedback(
    room,
    rescued ? 'success' : 'error',
    rescued
      ? 'Airlock sealed. All six survivors are aboard. Your crew brought them home.'
      : 'The beacon went silent. Your crew can launch a new rescue.',
    now,
  );
}
function strike(room: Room, message: string, now: number) {
  const s = room.state;
  s.strikes++;
  s.integrity = Math.max(0, s.integrity - 20);
  s.remainingMs = Math.max(0, s.remainingMs - 20_000);
  s.oxygen = Math.ceil((s.remainingMs / s.durationMs) * 100);
  record(room, message, 'damage');
  feedback(room, 'error', `${message} Hull −20%. Oxygen reserve −20 seconds.`, now);
  if (s.integrity === 0 || s.remainingMs === 0) finish(room, false, now);
}
export function tick(room: Room, now = Date.now()): boolean {
  const delta = Math.max(0, now - room.lastTick);
  room.lastTick = now;
  const s = room.state;
  if (s.phase !== 'active' || s.paused) return false;
  s.stats.timeUsedMs += Math.min(delta, s.remainingMs);
  s.remainingMs = Math.max(0, s.remainingMs - delta);
  s.oxygen = Math.ceil((s.remainingMs / s.durationMs) * 100);
  if (s.remainingMs === 0) {
    finish(room, false, now);
    return true;
  }
  if (s.stage === 3) {
    const d = s.docking,
      seconds = delta / 1000;
    const drift = s.difficulty === 'cadet' ? 0 : 5 + 2 * Math.sin(s.stats.timeUsedMs / 2200);
    const driftSeconds = Math.max(0, delta - d.stabilizedMs) / 1000;
    d.position = Math.max(
      -95,
      Math.min(95, d.position + d.steering * 32 * seconds + drift * driftSeconds),
    );
    d.stabilizedMs = Math.max(0, d.stabilizedMs - delta);
    const aligned = Math.abs(d.position - DOCKING_POSITIONS[room.intel.dockingLane]) <= 14;
    if (d.tractor) {
      if (aligned) {
        d.progress = Math.min(100, d.progress + seconds * (s.difficulty === 'cadet' ? 18 : 13));
        d.heat = Math.max(0, d.heat - seconds * 15);
      } else {
        d.heat = Math.min(100, d.heat + seconds * 19);
        d.progress = Math.max(0, d.progress - seconds * 5);
      }
      if (d.heat >= 100) {
        d.heat = 35;
        d.tractor = false;
        strike(room, 'Tractor overheated. Ask the crew to confirm your approach lane.', now);
      }
      if (d.progress >= 100 && s.phase === 'active') finish(room, true, now);
    } else d.heat = Math.max(0, d.heat - seconds * 9);
  }
  return true;
}
function reset(room: Room, now: number, difficulty: Difficulty, preserveCrew = false) {
  const old = room.state,
    fresh = createRoom(old.mode, old.twitch.configured, now, difficulty);
  room.intel = fresh.intel;
  room.state = {
    ...fresh.state,
    roomId: old.roomId,
    twitch: old.twitch,
    viewers: old.viewers,
    ...(preserveCrew ? { crew: old.crew } : {}),
  };
  room.chatCooldowns.clear();
  room.votes.clear();
  room.boosters.clear();
  room.lastTick = now;
}
export function hostAction(room: Room, action: HostAction, now = Date.now()): boolean {
  tick(room, now);
  room.lastActive = now;
  const s = room.state;
  if (action.type === 'reset') {
    reset(room, now, s.difficulty);
    return true;
  }
  if (
    action.type === 'configure' &&
    s.phase === 'lobby' &&
    ['cadet', 'commander'].includes(action.difficulty)
  ) {
    reset(room, now, action.difficulty, true);
    return true;
  }
  if (action.type === 'start' && s.phase === 'lobby') {
    s.phase = 'active';
    s.startedAt = now;
    room.lastTick = now;
    record(room, `${s.difficulty === 'cadet' ? 'Cadet' : 'Commander'} rescue launched`);
    feedback(
      room,
      'info',
      'Six life signs detected. Ask navigation for a corridor your hull can survive.',
      now,
    );
    return true;
  }
  if (action.type === 'training-signal' && s.mode === 'training')
    return receiveChat(
      room,
      `training:${action.name}`,
      action.name,
      action.text,
      'training',
      now,
      action.specialty,
    );
  if (action.type === 'simulate-boost' && s.mode === 'training' && s.stage === 3) {
    const name = ['Echo_Nav', 'Nova_Eng', 'Lyra_Sig'].find(
      (n) => !room.boosters.has(`training:${n}`),
    );
    return name
      ? receiveChat(room, `training:${name}`, name, '!boost', 'training', now, 'engineer')
      : false;
  }
  if (action.type === 'simulate-crew' && s.mode === 'training') {
    const name = ['Echo_Nav', 'Nova_Eng', 'Lyra_Sig', 'Atlas_Dock'][s.stage];
    const code = s.decoderOrder.map((i) => room.intel.code[i]);
    const message =
      s.phase === 'lobby'
        ? '!join nav'
        : s.stage === 0
          ? `!nav ${room.intel.safeSector} — radiation and beacon readings are within your flight limits.`
          : s.stage === 1
            ? `!power ${room.intel.relayTarget
                .map((on, i) => (on ? RELAYS[i] : null))
                .filter(Boolean)
                .join(' ')} ON, all others OFF. Engage the bus.`
            : s.stage === 2
              ? `!code ${code.join(' ')} — decoded in the pilot's band order.`
              : `!dock ${room.intel.dockingLane + 1} — approach this lane, engage the tractor, and hold steady. Crew can send !boost.`;
    return receiveChat(
      room,
      `training:${name}`,
      name,
      message,
      'training',
      now,
      s.stage === 1 ? 'engineer' : s.stage === 2 ? 'decoder' : 'navigator',
    );
  }
  if (action.type === 'steer' && action.direction === 0) {
    s.docking.steering = 0;
    return true;
  }
  if (action.type === 'pause' && s.phase === 'active') {
    s.paused = !s.paused;
    s.docking.steering = 0;
    if (s.paused) s.docking.tractor = false;
    feedback(
      room,
      'info',
      s.paused ? 'Mission paused. Take a breath, crew.' : 'Mission resumed. The clock is running.',
      now,
    );
    return true;
  }
  if (s.phase !== 'active' || s.paused) return false;
  if (action.type === 'route' && s.stage === 0 && SECTORS.includes(action.sector)) {
    s.stats.actions++;
    if (action.sector !== room.intel.safeSector)
      strike(room, 'Unsafe corridor. Emergency evasive maneuver.', now);
    else {
      s.stage = 1;
      room.votes.clear();
      s.findings = [];
      record(room, 'Safe corridor identified');
      feedback(
        room,
        'success',
        'Corridor clear. The survivors can see your lights. Restore power to their airlock.',
        now,
      );
    }
    return true;
  }
  if (
    action.type === 'relay' &&
    s.stage === 1 &&
    Number.isInteger(action.index) &&
    action.index >= 0 &&
    action.index < 4
  ) {
    s.relays[action.index] = !s.relays[action.index];
    s.stats.actions++;
    return true;
  }
  if (action.type === 'power' && s.stage === 1) {
    s.stats.actions++;
    if (!s.relays.every((on, i) => on === room.intel.relayTarget[i]))
      strike(room, 'Power configuration rejected. Ask engineering to check every relay.', now);
    else {
      s.stage = 2;
      room.votes.clear();
      s.findings = [];
      record(room, 'Airlock emergency power restored');
      feedback(
        room,
        'success',
        'Airlock powered. Combine the crew’s symbol meanings with your transmission order.',
        now,
      );
    }
    return true;
  }
  if (
    action.type === 'glyph' &&
    s.stage === 2 &&
    GLYPHS.includes(action.glyph) &&
    s.enteredCode.length < 4
  ) {
    s.enteredCode.push(action.glyph);
    s.stats.actions++;
    return true;
  }
  if (action.type === 'clear-code' && s.stage === 2) {
    s.enteredCode = [];
    return true;
  }
  if (action.type === 'transmit' && s.stage === 2 && s.enteredCode.length === 4) {
    s.stats.actions++;
    if (!s.enteredCode.every((g, i) => g === room.intel.code[s.decoderOrder[i]])) {
      s.enteredCode = [];
      strike(room, 'Handshake rejected. Check both the symbol meanings and your band order.', now);
    } else {
      s.stage = 3;
      room.votes.clear();
      s.findings = [];
      record(room, 'Distress handshake verified');
      feedback(
        room,
        'success',
        'Capsule acquired. Ask the crew for the approach lane, then bring all six aboard.',
        now,
      );
    }
    return true;
  }
  if (action.type === 'steer' && s.stage === 3 && [-1, 0, 1].includes(action.direction)) {
    s.docking.steering = action.direction;
    return true;
  }
  if (action.type === 'tractor' && s.stage === 3) {
    s.docking.tractor = !s.docking.tractor;
    s.stats.actions++;
    return true;
  }
  return false;
}
export function receiveChat(
  room: Room,
  id: string,
  displayName: string,
  message: string,
  source: 'twitch' | 'training',
  now = Date.now(),
  defaultSpecialty: Specialty = 'navigator',
): boolean {
  tick(room, now);
  const clean = message
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 160);
  const match = /^!(join|nav|power|code|dock|boost|ping|help)(?:\s+(.*))?$/i.exec(clean);
  if (!match || now - (room.chatCooldowns.get(id) ?? 0) < 1500) return false;
  room.chatCooldowns.set(id, now);
  const [, rawCommand, arg = ''] = match,
    command = rawCommand.toLowerCase();
  const specialties: Record<string, Specialty> = {
    nav: 'navigator',
    navigator: 'navigator',
    engineer: 'engineer',
    engineering: 'engineer',
    decoder: 'decoder',
    decode: 'decoder',
  };
  const specialty: Specialty =
    command === 'join'
      ? (specialties[arg.toLowerCase()] ?? defaultSpecialty)
      : command === 'power' || command === 'boost'
        ? 'engineer'
        : command === 'code'
          ? 'decoder'
          : command === 'nav' || command === 'dock'
            ? 'navigator'
            : defaultSpecialty;
  let member = room.state.crew.find((c) => c.id === id);
  if (!member && room.state.crew.length < 200) {
    member = {
      id,
      name: displayName.slice(0, 30),
      specialty,
      contributions: 0,
    } satisfies CrewMember;
    room.state.crew.push(member);
  }
  if (member) {
    member.specialty = specialty;
    if (command !== 'join' && command !== 'help') member.contributions++;
  }
  let signalText = clean;
  if (command === 'join')
    signalText = `Joined ${specialty === 'navigator' ? 'navigation' : specialty === 'engineer' ? 'engineering' : 'signal decoding'}. Ready to bring them home.`;
  if (command === 'help')
    signalText =
      'Read the crew panel. Guide with !nav, !power, !code, !dock. During extraction, !boost stabilizes the rescue beam.';
  if (command === 'boost') {
    const s = room.state;
    if (
      s.phase === 'active' &&
      s.stage === 3 &&
      !s.paused &&
      !room.boosters.has(id) &&
      s.docking.boostsUsed < 3
    ) {
      room.boosters.add(id);
      s.docking.boostsUsed++;
      s.docking.stabilizedMs = 6000;
      if (
        s.docking.tractor &&
        Math.abs(s.docking.position - DOCKING_POSITIONS[room.intel.dockingLane]) <= 14
      )
        s.docking.progress = Math.min(99, s.docking.progress + 12);
      signalText = 'Delivered a power cell. Drift stabilized for 6 seconds. Bring them home!';
      record(room, 'Crew stabilized the approach', 'boost', displayName.slice(0, 30));
      feedback(
        room,
        'success',
        `${displayName.slice(0, 30)} stabilized the rescue beam. Six seconds of clear approach.`,
        now,
      );
    } else
      signalText =
        s.stage !== 3
          ? 'Power cell ready. Save !boost for capsule extraction.'
          : room.boosters.has(id)
            ? 'You already delivered your power cell. Guide the pilot through the final approach.'
            : s.paused
              ? 'Mission paused. Hold your power cell until the pilot resumes.'
              : 'All three community power cells have been delivered.';
  }
  const signal: Signal = {
    id: randomBytes(6).toString('hex'),
    name: displayName.slice(0, 30),
    text: signalText,
    source,
    time: now,
    specialty,
  };
  room.state.signals = [...room.state.signals.slice(-29), signal];
  room.state.stats.messages++;
  let finding: string | null = null;
  if (room.state.stage === 0 && command === 'nav') {
    const sector = arg.toUpperCase().split(/[\s,]+/)[0];
    if (SECTORS.some((s) => s === sector)) finding = sector;
  } else if (room.state.stage === 1 && command === 'power') {
    const relays = [
      ...new Set(
        arg
          .toUpperCase()
          .split(/\bON\b/)[0]
          .match(/\b[A-D]\b/g) || [],
      ),
    ].sort();
    if (relays.length) finding = `${relays.join(' + ')} ON`;
  } else if (room.state.stage === 2 && command === 'code') {
    const bands = [...arg.toUpperCase().matchAll(/\b([A-D])\s*[:=]\s*(SUN|WAVE|STAR|MOON)\b/g)];
    if (new Set(bands.map((m) => m[1])).size === 4)
      finding = bands
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map((m) => `${m[1]}:${m[2]}`)
        .join(' · ');
    else {
      const symbols =
        arg
          .toUpperCase()
          .match(/\b(SUN|WAVE|STAR|MOON)\b/g)
          ?.slice(0, 4) || [];
      if (symbols.length === 4) finding = symbols.join(' → ');
    }
  } else if (room.state.stage === 3 && command === 'dock') {
    const lane = /^([1-5])(?:\s|$)/.exec(arg);
    if (lane) finding = `LANE ${lane[1]}`;
  }
  if (finding && (room.votes.has(id) || room.votes.size < 200)) {
    room.votes.set(id, finding);
    const counts = new Map<string, number>();
    for (const value of room.votes.values()) counts.set(value, (counts.get(value) || 0) + 1);
    room.state.findings = [...counts]
      .map(([label, votes]) => ({ label, votes, total: room.votes.size }))
      .sort((a, b) => b.votes - a.votes);
  }
  room.lastActive = now;
  return true;
}
