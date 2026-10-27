import { useEffect, useRef } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Check,
  Heart,
  Radio,
  Shield,
  Target,
  Zap,
} from 'lucide-react';
import { RELAYS, type HostAction, type RoomState, type Sector } from '../shared/protocol';
import { Badge, CopyButton } from './components';
import { formatTime } from './lib';

export const SURVIVORS = [
  { name: 'Mira', role: 'Botanist', color: '#c6fa6b' },
  { name: 'Theo', role: 'Geologist', color: '#83d6d8' },
  { name: 'Lina', role: 'Medic', color: '#ed8d7b' },
  { name: 'Oren', role: 'Navigator', color: '#bda1f6' },
  { name: 'Ada', role: 'Systems', color: '#e4c879' },
  { name: 'Jun', role: 'Researcher', color: '#8bb6e1' },
];

export function MissionProfile({
  state,
  action,
  disabled,
}: {
  state: RoomState;
  action: (action: HostAction) => boolean;
  disabled: boolean;
}) {
  return (
    <div className="mission-profile" aria-label="Mission difficulty">
      <span className="eyebrow">CHOOSE YOUR FLIGHT</span>
      <div>
        {[
          {
            id: 'cadet' as const,
            title: 'Cadet',
            time: '06:00',
            description: 'Guided intel. Calm approach. Learn to fly together.',
          },
          {
            id: 'commander' as const,
            title: 'Commander',
            time: '05:00',
            description: 'Split clues. Logical wiring. A drifting final approach.',
          },
        ].map((profile) => (
          <button
            key={profile.id}
            className={state.difficulty === profile.id ? 'selected' : ''}
            disabled={disabled}
            aria-pressed={state.difficulty === profile.id}
            onClick={() => action({ type: 'configure', difficulty: profile.id })}
          >
            <span>
              <strong>{profile.title}</strong>
              <code>{profile.time}</code>
            </span>
            <p>{profile.description}</p>
            {state.difficulty === profile.id && <Check size={14} />}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SurvivorManifest({ state }: { state: RoomState }) {
  const rescued = state.phase === 'rescued';
  const lost = state.phase === 'lost';
  const quote = rescued
    ? 'We’re all here. You didn’t leave anyone behind.'
    : lost
      ? 'The last transmission is in your flight recorder.'
      : [
          'We can see a light. Is that you?',
          'You found us. The outer hatch is still dark.',
          'There’s power again. Please answer the beacon.',
          'We’re at the hatch. Keep your lights steady.',
        ][state.stage];
  return (
    <section className={`panel survivor-panel ${rescued ? 'survivors-home' : ''}`}>
      <div className="panel-heading">
        <span className="eyebrow">
          <Heart size={14} /> SIX LIFE SIGNS
        </span>
        <span className="mono subtle">
          {rescued ? 'SAFE' : lost ? 'UNREACHABLE' : `${state.oxygen}% O₂`}
        </span>
      </div>
      <div className="survivor-faces">
        {SURVIVORS.map((person, index) => (
          <div key={person.name}>
            <svg viewBox="0 0 44 48" aria-hidden="true" style={{ color: person.color }}>
              <path
                d="M7 44v-5c0-8 5-13 15-13s15 5 15 13v5"
                fill="currentColor"
                fillOpacity=".12"
                stroke="currentColor"
                strokeOpacity=".55"
              />
              <path
                d="M11 16C11 8 15 4 22 4s11 4 11 12v8c0 7-4 12-11 12s-11-5-11-12Z"
                fill="#132025"
                stroke="currentColor"
                strokeOpacity=".6"
              />
              <rect
                x="12"
                y="13"
                width="20"
                height="13"
                rx="5"
                fill="currentColor"
                fillOpacity=".14"
              />
              <path
                d="M18 19h2m4 0h2M19 29h6"
                stroke="currentColor"
                strokeLinecap="round"
                strokeOpacity=".8"
              />
              <path d={`M${14 + (index % 3)} 9h12`} stroke="currentColor" strokeOpacity=".25" />
            </svg>
            <strong>{person.name}</strong>
            <span>{rescued ? 'HOME' : person.role}</span>
          </div>
        ))}
      </div>
      <div className="survivor-transmission">
        <Radio size={13} />
        <p>“{quote}”</p>
      </div>
    </section>
  );
}

export function FlightRecorder({ state }: { state: RoomState }) {
  return (
    <div className="flight-recorder">
      <span className="eyebrow">
        <Activity size={13} /> YOUR CREW’S FLIGHT RECORD
      </span>
      <ol>
        {state.flightLog.map((event) => (
          <li key={event.id} className={`flight-event-${event.kind}`}>
            <time>{formatTime(event.timeUsedMs)}</time>
            <span>
              {event.label}
              {event.actor && <strong> · {event.actor}</strong>}
            </span>
            {event.kind === 'boost' ? (
              <Zap size={13} />
            ) : event.kind === 'damage' ? (
              <Shield size={13} />
            ) : (
              <Check size={13} />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function NavigationLimits({ state }: { state: RoomState }) {
  return (
    <div className="navigation-limits">
      <span className="eyebrow">
        <Shield size={12} /> YOUR SHIP’S FLIGHT LIMITS
      </span>
      <span>
        Radiation ≤ <strong>{state.navigationLimits.radiationLimit.toFixed(1)} rad</strong>
      </span>
      <span>
        Beacon ≥ <strong>{state.navigationLimits.beaconMinimum}%</strong>
      </span>
      <p>The crew has the scans. Tell them these two limits.</p>
    </div>
  );
}

export function NavigationReadings({
  state,
  selected,
  onPick,
}: {
  state: RoomState;
  selected: Sector | null;
  onPick: (sector: Sector) => void;
}) {
  return (
    <div className="navigation-readings">
      <div className="readings-head">
        <span>SECTOR</span>
        <span>RADIATION</span>
        <span>BEACON</span>
        <span>YOUR CALL</span>
      </div>
      {state.intel!.readings.map((reading) => (
        <button
          key={reading.sector}
          className={selected === reading.sector ? 'selected' : ''}
          onClick={() => onPick(reading.sector)}
          aria-pressed={selected === reading.sector}
          aria-label={`Propose ${reading.sector}`}
        >
          <strong>{reading.sector}</strong>
          <span>{reading.radiation.toFixed(1)} rad</span>
          <span>{reading.beacon}%</span>
          <span>{selected === reading.sector ? <Check size={16} /> : <Target size={16} />}</span>
        </button>
      ))}
      <p>
        <Radio size={13} />
        Ask the pilot for their radiation limit and minimum beacon strength. One sector meets both.
      </p>
    </div>
  );
}

export function EngineeringRules({
  state,
  proposed,
  onToggle,
}: {
  state: RoomState;
  proposed: boolean[];
  onToggle: (index: number) => void;
}) {
  return (
    <div className="engineering-puzzle">
      <div className="engineering-rules">
        {state.intel!.powerRules.map((rule, index) => (
          <div key={rule}>
            <span className="mono">0{index + 1}</span>
            <p>{rule}</p>
          </div>
        ))}
      </div>
      <span className="eyebrow">BUILD YOUR PROPOSED ROUTING</span>
      <div className="proposed-relays">
        {RELAYS.map((relay, index) => (
          <button
            key={relay}
            className={proposed[index] ? 'on' : ''}
            aria-label={`Propose relay ${relay}`}
            aria-pressed={proposed[index]}
            onClick={() => onToggle(index)}
          >
            <strong>{relay}</strong>
            <span className="relay-switch">
              <i />
            </span>
            <span>{proposed[index] ? 'ON' : 'OFF'}</span>
          </button>
        ))}
      </div>
      <p>
        The pilot operates the real switches. Your job is to find a configuration satisfying all
        four rules.
      </p>
    </div>
  );
}

export function TransmissionOrder({ state }: { state: RoomState }) {
  return (
    <div className="transmission-order">
      <div>
        <span className="eyebrow">
          <Radio size={13} /> YOUR TRANSMISSION ORDER
        </span>
        <p>Chat knows what each band means. You know which order to send them.</p>
      </div>
      <div>
        {state.decoderOrder.map((band, index) => (
          <span key={index}>
            <small>0{index + 1}</small>
            <strong>{RELAYS[band]}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

export function DockingConsole({
  state,
  action,
  disabled,
}: {
  state: RoomState;
  action: (action: HostAction) => boolean;
  disabled: boolean;
}) {
  const steering = useRef<-1 | 0 | 1>(0);
  const actionRef = useRef(action);
  actionRef.current = action;
  function thrust(direction: -1 | 0 | 1) {
    if (steering.current === direction) return;
    steering.current = direction;
    actionRef.current({ type: 'steer', direction });
  }
  useEffect(() => {
    if (disabled) return;
    const keys = new Set<string>();
    const controlled = ['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'];
    const sync = () => {
      const left = keys.has('ArrowLeft') || keys.has('KeyA');
      const right = keys.has('ArrowRight') || keys.has('KeyD');
      thrust(left === right ? 0 : left ? -1 : 1);
    };
    const down = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (
        !controlled.includes(event.code) ||
        target?.matches('input, textarea, [contenteditable="true"]')
      )
        return;
      event.preventDefault();
      keys.add(event.code);
      sync();
    };
    const up = (event: KeyboardEvent) => {
      if (!controlled.includes(event.code)) return;
      event.preventDefault();
      keys.delete(event.code);
      sync();
    };
    const release = () => {
      keys.clear();
      thrust(0);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      release();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, [disabled]);
  const d = state.docking;
  const shipX = 450 + d.position * 3.7;
  const capsuleX = 450 + ((shipX - 450) * d.progress) / 100;
  const capsuleY = 87 + d.progress * 0.98;
  return (
    <div className="docking-console">
      <div
        className={`docking-scene ${d.tractor ? 'tractor-active' : ''} ${d.stabilizedMs > 0 ? 'stabilized' : ''}`}
      >
        <svg
          viewBox="0 0 900 300"
          role="img"
          aria-label="Rescue capsule and pilot spacecraft in five approach lanes"
        >
          <defs>
            <radialGradient id="docking-space">
              <stop stopColor="#243b35" />
              <stop offset="1" stopColor="#0a111a" />
            </radialGradient>
            <linearGradient id="docking-beam" x1="0" y1="0" x2="0" y2="1">
              <stop stopColor="#83d6d8" stopOpacity=".12" />
              <stop offset="1" stopColor="#c6fa6b" stopOpacity=".5" />
            </linearGradient>
          </defs>
          <rect width="900" height="300" fill="url(#docking-space)" />
          {Array.from({ length: 38 }, (_, i) => (
            <circle
              key={i}
              cx={(i * 137 + 41) % 900}
              cy={(i * 73 + 17) % 300}
              r={i % 4 ? 0.8 : 1.4}
              fill="#afcbb0"
              opacity={0.18 + (i % 3) * 0.12}
            />
          ))}
          <circle cx="750" cy="36" r="116" fill="#8bb6a905" stroke="#8bb6a915" />
          {[-70, -35, 0, 35, 70].map((position, i) => (
            <g key={i}>
              <path
                d={`M${450 + position * 3.7} 150v117`}
                stroke="#85a78e"
                strokeOpacity=".17"
                strokeDasharray="3 8"
              />
              <text
                x={450 + position * 3.7}
                y="289"
                fill="#839b85"
                fontSize="10"
                fontFamily="monospace"
                textAnchor="middle"
              >
                LANE 0{i + 1}
              </text>
            </g>
          ))}
          {d.tractor && (
            <g className="capture-beam">
              <path
                d={`M${shipX - 10} 221 ${capsuleX - 28} ${capsuleY + 13} ${capsuleX + 28} ${capsuleY + 13} ${shipX + 10} 221Z`}
                fill="url(#docking-beam)"
              />
              <path
                d={`M${shipX} 221 ${capsuleX} ${capsuleY + 13}`}
                stroke={d.heat > 65 ? '#ed8d7b' : '#83d6d8'}
                strokeWidth="2"
                strokeDasharray="7 6"
              />
            </g>
          )}
          <g transform={`translate(${capsuleX} ${capsuleY})`} className="rescue-capsule">
            <ellipse cy="17" rx="45" ry="6" fill="#000" opacity=".25" />
            <path
              d="M-37-10-27-23h54l10 13v25h-74Z"
              fill="#405351"
              stroke="#95afa1"
              strokeWidth="1.2"
            />
            <path d="M-21-18h42v24h-42Z" fill="#11262b" stroke="#83d6d8" strokeOpacity=".5" />
            {[-12, 0, 12].map((x) => (
              <g key={x}>
                <circle cx={x} cy="-9" r="3" fill="#c6fa6b" opacity=".75" />
                <circle cx={x} cy="0" r="3" fill="#c6fa6b" opacity=".65" />
              </g>
            ))}
            <path d="M-36 9h16m40 0h16" stroke="#c6fa6b" strokeWidth="3" />
            <text y="-32" fill="#b8cbb5" fontSize="9" fontFamily="monospace" textAnchor="middle">
              KEPLER—9 / SIX ABOARD
            </text>
          </g>
          <g transform={`translate(${shipX} 231)`} className="pilot-craft">
            <path d="m-8 16-7 25 11-6 4-18m8-1 7 25-11-6-4-18" fill="#c6fa6b" fillOpacity=".3" />
            <path
              d="m0-30-12 25-25 13 5 12 22-5 10 7 10-7 22 5 5-12-25-13Z"
              fill="#84968d"
              stroke="#c6d5c2"
              strokeWidth="1.2"
            />
            <path d="m0-20-6 15 6 7 6-7Z" fill="#102a34" stroke="#83d6d8" strokeOpacity=".6" />
            <path d="M-21 15h8m26 0h8" stroke="#c6fa6b" strokeWidth="2" />
          </g>
          <text x="25" y="26" fill="#9bb7a0" fontSize="9" fontFamily="monospace" letterSpacing="2">
            FINAL APPROACH / TRUST YOUR CREW
          </text>
          <text
            x="875"
            y="26"
            fill={d.stabilizedMs > 0 ? '#83d6d8' : '#7e9785'}
            fontSize="9"
            fontFamily="monospace"
            textAnchor="end"
          >
            {d.stabilizedMs > 0
              ? `CREW STABILIZATION / ${Math.ceil(d.stabilizedMs / 1000)}s`
              : state.difficulty === 'commander'
                ? 'ION DRIFT ACTIVE'
                : 'CALM APPROACH'}
          </text>
        </svg>
      </div>
      <div className="docking-instruments">
        <div>
          <span className="eyebrow">CAPSULE RECOVERY</span>
          <strong>
            {Math.floor(d.progress)}
            <small>%</small>
          </strong>
          <div className="meter">
            <span style={{ width: `${d.progress}%` }} />
          </div>
        </div>
        <div className={d.heat > 65 ? 'critical' : ''}>
          <span className="eyebrow">BEAM HEAT</span>
          <strong>
            {Math.ceil(d.heat)}
            <small>%</small>
          </strong>
          <div className="meter heat-meter">
            <span style={{ width: `${d.heat}%` }} />
          </div>
        </div>
        <div>
          <span className="eyebrow">LATERAL POSITION</span>
          <strong data-testid="ship-position">{Math.round(d.position)}</strong>
          <span className="position-caption">CREW KNOWS THE SAFE LANE</span>
        </div>
      </div>
      <div className="dock-steer">
        {([-1, 1] as const).map((direction) => (
          <button
            key={direction}
            className={`button button-outline steer-${direction < 0 ? 'left' : 'right'}`}
            aria-label={direction < 0 ? 'Steer left' : 'Steer right'}
            disabled={disabled}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              thrust(direction);
            }}
            onPointerUp={() => thrust(0)}
            onPointerCancel={() => thrust(0)}
            onLostPointerCapture={() => thrust(0)}
            onKeyDown={(event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                thrust(direction);
              }
            }}
            onKeyUp={(event) => {
              if (event.key === ' ' || event.key === 'Enter') {
                event.preventDefault();
                thrust(0);
              }
            }}
          >
            {direction < 0 ? <ArrowLeft size={18} /> : <ArrowRight size={18} />}
            <span>{direction < 0 ? 'Left thrust' : 'Right thrust'}</span>
            <kbd>{direction < 0 ? 'A / ←' : 'D / →'}</kbd>
          </button>
        ))}
        <button
          className={`button ${d.tractor ? 'button-outline' : 'button-lime'} tractor-button`}
          disabled={disabled}
          aria-pressed={d.tractor}
          onClick={() => action({ type: 'tractor' })}
        >
          <Target size={17} />
          {d.tractor ? 'Disengage tractor' : 'Engage tractor'}
        </button>
      </div>
      <div className="docking-hint">
        <Radio size={15} />
        <p>
          Ask chat for <code>!dock 1–5</code>. Hold A/D or the thrust buttons to approach that lane.
          Engage the tractor and stay steady.
        </p>
      </div>
      <div className="boost-status">
        <Zap size={15} />
        <span>
          {3 - d.boostsUsed} community power cell{3 - d.boostsUsed !== 1 ? 's' : ''} left
        </span>
        <span>
          Chat: <code>!boost</code> → six seconds without drift
        </span>
        {state.mode === 'training' && (
          <button
            className="button button-outline simulated-boost"
            disabled={disabled || d.boostsUsed >= 3}
            onClick={() => action({ type: 'simulate-boost' })}
          >
            <Zap size={13} />
            Simulate crew boost
          </button>
        )}
      </div>
    </div>
  );
}

export function DockingIntel({ state }: { state: RoomState }) {
  const lane = state.intel!.dockingLane + 1;
  return (
    <section className="panel docking-intel">
      <div className="panel-heading">
        <span className="eyebrow">
          <Target size={14} /> FINAL APPROACH TELEMETRY
        </span>
        <Badge tone="cyan">CREW ONLY</Badge>
      </div>
      <div className="intel-intro">
        <span className="eyebrow">THE LAST FEW METERS ARE YOURS TO GUIDE</span>
        <h2>Bring them aboard.</h2>
        <p>
          Ion currents distort the pilot’s sensors. Your telemetry identifies the safe approach
          lane. Send it now, then watch their beam and help them hold steady.
        </p>
      </div>
      <div className="crew-lanes">
        {[1, 2, 3, 4, 5].map((value) => (
          <div key={value} className={lane === value ? 'safe' : ''}>
            <Target size={23} />
            <strong>0{value}</strong>
            <span>{lane === value ? 'CLEAR APPROACH' : 'ION CURRENT'}</span>
          </div>
        ))}
      </div>
      <div className="intel-command">
        <div>
          <span className="eyebrow">YOUR PILOT NEEDS THIS</span>
          <code>!dock {lane}</code>
        </div>
        <CopyButton text={`!dock ${lane}`} label="Copy approach" />
      </div>
      <div className="crew-boost-call">
        <Zap size={30} />
        <div>
          <span className="eyebrow">YOUR MESSAGE CAN CHANGE THE FLIGHT</span>
          <h3>Give them six clear seconds.</h3>
          <p>
            Once the tractor is engaged, send <code>!boost</code> through Twitch. Your power cell
            cancels drift and helps an aligned beam recover the capsule. Three cells per mission,
            one per viewer.
          </p>
        </div>
        <CopyButton
          text="!boost"
          label={state.docking.boostsUsed >= 3 ? 'All cells delivered' : 'Copy !boost'}
          disabled={state.docking.boostsUsed >= 3}
        />
      </div>
      <div className="crew-extraction-live">
        <span>
          <Activity size={14} /> RECOVERY {Math.floor(state.docking.progress)}%
        </span>
        <span>
          <Zap size={14} /> {3 - state.docking.boostsUsed} CELLS LEFT
        </span>
        <span>{state.docking.tractor ? 'TRACTOR ACTIVE' : 'AWAITING PILOT'}</span>
      </div>
    </section>
  );
}
