export const SECTORS = ['KESTREL', 'ORION', 'VEGA'] as const;
export const GLYPHS = ['SUN', 'WAVE', 'STAR', 'MOON'] as const;
export const RELAYS = ['A', 'B', 'C', 'D'] as const;
export type Sector = (typeof SECTORS)[number];
export type Glyph = (typeof GLYPHS)[number];
export type Role = 'host' | 'viewer' | 'overlay';
export type Specialty = 'navigator' | 'engineer' | 'decoder';
export type Phase = 'lobby' | 'active' | 'rescued' | 'lost';
export type Stage = 0 | 1 | 2 | 3;
export type Difficulty = 'cadet' | 'commander';
export type TwitchStatus = 'offline' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export interface CrewMember {
  id: string;
  name: string;
  specialty: Specialty;
  contributions: number;
}
export interface Signal {
  id: string;
  name: string;
  text: string;
  source: 'twitch' | 'training' | 'system';
  time: number;
  specialty?: Specialty;
}
export interface Intel {
  safeSector: Sector;
  sectors: { name: Sector; danger: boolean; distance: string; detail: string }[];
  relayTarget: boolean[];
  relayHint: string;
  code: Glyph[];
  codeHints: string[];
  navigation: { radiationLimit: number; beaconMinimum: number };
  readings: { sector: Sector; radiation: number; beacon: number }[];
  powerRules: string[];
  dockingLane: number;
}
export interface DockingState {
  position: number;
  steering: -1 | 0 | 1;
  tractor: boolean;
  progress: number;
  heat: number;
  stabilizedMs: number;
  boostsUsed: number;
}
export interface FlightEvent {
  id: string;
  label: string;
  timeUsedMs: number;
  kind: 'milestone' | 'damage' | 'boost';
  actor?: string;
}
export interface PublicState {
  roomId: string;
  missionName: string;
  mode: 'training' | 'twitch';
  difficulty: Difficulty;
  phase: Phase;
  stage: Stage;
  oxygen: number;
  integrity: number;
  remainingMs: number;
  durationMs: number;
  startedAt: number | null;
  paused: boolean;
  strikes: number;
  relays: boolean[];
  enteredCode: Glyph[];
  decoderOrder: number[];
  navigationLimits: { radiationLimit: number; beaconMinimum: number };
  docking: DockingState;
  flightLog: FlightEvent[];
  crew: CrewMember[];
  signals: Signal[];
  findings: { label: string; votes: number; total: number }[];
  feedback: { kind: 'success' | 'error' | 'info'; text: string; time: number } | null;
  viewers: number;
  twitch: {
    status: TwitchStatus;
    channel: string | null;
    error: string | null;
    configured: boolean;
  };
  stats: { actions: number; messages: number; timeUsedMs: number };
  debrief: { score: number; rank: string; medals: string[] } | null;
}
export interface RoomState extends PublicState {
  intel?: Intel;
}
export type HostAction =
  | { type: 'start' }
  | { type: 'pause' }
  | { type: 'reset' }
  | { type: 'configure'; difficulty: Difficulty }
  | { type: 'route'; sector: Sector }
  | { type: 'relay'; index: number }
  | { type: 'power' }
  | { type: 'glyph'; glyph: Glyph }
  | { type: 'clear-code' }
  | { type: 'transmit' }
  | { type: 'steer'; direction: -1 | 0 | 1 }
  | { type: 'tractor' }
  | { type: 'simulate-boost' }
  | { type: 'simulate-crew' }
  | { type: 'training-signal'; text: string; name: string; specialty: Specialty };
export type ClientMessage =
  HostAction | { type: 'hello'; roomId: string; role: Role; token?: string };
export type ServerMessage =
  { type: 'state'; state: RoomState } | { type: 'error'; message: string };
