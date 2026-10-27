import { useState, type ReactNode } from 'react';
import { Activity, ArrowDownLeft, ArrowUpRight, Check, ChevronRight, Copy, Crosshair, Radio, Shield, Users, Zap } from 'lucide-react';
import { copy, formatTime, navigate } from './lib';
import type { PublicState, RoomState, Specialty } from '../shared/protocol';

export const STAGE_NAMES = ['Find the corridor', 'Restore the airlock', 'Decode the signal'];
export const SPECIALTIES: { id: Specialty; name: string; icon: typeof Crosshair; short: string }[] = [
  { id: 'navigator', name: 'Navigation', icon: Crosshair, short: 'NAV' },
  { id: 'engineer', name: 'Engineering', icon: Zap, short: 'ENG' },
  { id: 'decoder', name: 'Signal decoding', icon: Radio, short: 'SIG' },
];
export function Logo({ small = false }: { small?: boolean }) {
  return <a className={`logo ${small ? 'small' : ''}`} href="/" onClick={e => { e.preventDefault(); navigate('/'); }} aria-label="SignalLost home">
    <span className="logo-mark"><Activity size={23} strokeWidth={2.3} /></span><span>SIGNAL<span className="logo-light">LOST</span><span className="logo-dot">.</span></span>
  </a>;
}
export function Badge({ children, tone = 'lime' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}><span className="status-dot" />{children}</span>;
}
export function CopyButton({ text, label = 'Copy link', className = '' }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);
  async function handle() {
    try { await copy(text); setCopied(true); setError(false); setTimeout(() => setCopied(false), 2200); }
    catch { setError(true); }
  }
  return <button className={`button button-quiet ${className}`} onClick={handle} title={text}>
    {copied ? <Check size={15} /> : <Copy size={15} />}{copied ? 'Copied' : error ? 'Select text to copy' : label}
  </button>;
}
export function GlyphIcon({ glyph, size = 32 }: { glyph: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    {glyph === 'SUN' && <><circle cx="20" cy="20" r="7" />{Array.from({ length: 8 }, (_, i) => <path key={i} d="M20 3v5" transform={`rotate(${i * 45} 20 20)`} />)}</>}
    {glyph === 'WAVE' && <><path d="M4 16c4-9 8 9 12 0s8 9 12 0 8 9 8 0M4 25c4-9 8 9 12 0s8 9 12 0 8 9 8 0" /></>}
    {glyph === 'STAR' && <path d="m20 4 4.8 10.1 11.2 1.5-8 7.8 1.9 11.1-9.9-5.3-9.9 5.3L12 23.4l-8-7.8 11.2-1.5Z" />}
    {glyph === 'MOON' && <path d="M28 5a15 15 0 1 0 7 24A15 15 0 0 1 28 5Z" />}
  </svg>;
}
export function Ship({ className = '' }: { className?: string }) {
  return <svg className={`ship-art ${className}`} viewBox="0 0 600 520" fill="none" aria-label="Original rescue spacecraft illustration" role="img">
    <defs>
      <linearGradient id="hull" x1="180" y1="140" x2="410" y2="410" gradientUnits="userSpaceOnUse"><stop stopColor="#e4e7d9"/><stop offset=".5" stopColor="#929d91"/><stop offset="1" stopColor="#363f40"/></linearGradient>
      <linearGradient id="wing" x1="170" y1="210" x2="390" y2="410" gradientUnits="userSpaceOnUse"><stop stopColor="#687777"/><stop offset="1" stopColor="#151d24"/></linearGradient>
      <linearGradient id="engine" x1="290" y1="340" x2="230" y2="450" gradientUnits="userSpaceOnUse"><stop stopColor="#c6fa6b" stopOpacity=".9"/><stop offset="1" stopColor="#c6fa6b" stopOpacity="0"/></linearGradient>
      <radialGradient id="planet"><stop stopColor="#253232"/><stop offset=".65" stopColor="#172526"/><stop offset="1" stopColor="#0b1217"/></radialGradient>
    </defs>
    <circle cx="398" cy="151" r="96" fill="url(#planet)" stroke="#516c5e" strokeOpacity=".2"/>
    <ellipse cx="398" cy="151" rx="140" ry="24" transform="rotate(-28 398 151)" stroke="#8da78a" strokeOpacity=".2"/>
    <ellipse cx="398" cy="151" rx="147" ry="28" transform="rotate(-28 398 151)" stroke="#8da78a" strokeOpacity=".08"/>
    <g className="ship-float">
      <path d="m268 330-60 132 44-13 55-106" fill="url(#engine)" className="engine-flame"/>
      <path d="m323 358-44 113 41-27 36-86" fill="url(#engine)" className="engine-flame"/>
      <path d="m272 185-134 101-3 54 136-40 98 84 58-2-53-158Z" fill="url(#wing)" stroke="#83948b" strokeWidth="1.3"/>
      <path d="m300 91-84 219 52 43 39-13 28 33 37-41-25-146Z" fill="url(#hull)" stroke="#d5ded0" strokeWidth="1.4"/>
      <path d="m300 91-27 189 34 60 28 33 37-41-25-146Z" fill="#202d32" fillOpacity=".45"/>
      <path d="m300 131-30 110 29 22 28-28-9-87Z" fill="#0c1c23" stroke="#8dbaad"/>
      <path d="m289 160-10 63 17 12 16-15-5-50" fill="#5ab1b7" fillOpacity=".24"/>
      <path d="m227 281 29 25 12 47-32-27Zm106 17 18 11 14 34-30 30-12-33Z" fill="#29383b" stroke="#778881"/>
      <path d="m138 286 88-44-18 61-72 36Zm220-18 53 37 15 77-59-35Z" fill="#45534f" stroke="#718277"/>
      <path d="m181 297 40-16M372 314l29 21M275 278l38 18M288 267l8 33M324 249l9 48" stroke="#c3d1bd" strokeOpacity=".5"/>
      <path d="m223 310 26 20m93 12 12-9" stroke="#c6fa6b" strokeWidth="5"/>
      <path d="m301 98 14 69" stroke="#e2e8d4" strokeWidth="2"/>
      <circle cx="294" cy="285" r="4" fill="#c6fa6b"/>
      <text x="152" y="319" fontSize="10" fontFamily="monospace" fill="#c5d0c0" transform="rotate(-17 152 319)">SL—06</text>
    </g>
    <path d="M68 131h44m-22-22v44M475 372h44m-22-22v44" stroke="#a1b69d" strokeOpacity=".3"/>
    <path d="M78 395h62l39-37M472 214h47v-46" stroke="#91a48c" strokeOpacity=".3"/>
    <circle cx="78" cy="395" r="3" fill="#c6fa6b"/>
    <text x="53" y="417" fontFamily="monospace" fontSize="9" fill="#899788">RESCUE UNIT / 06</text>
    <text x="485" y="158" fontFamily="monospace" fontSize="9" fill="#899788">KEPLER—9</text>
  </svg>;
}
export function Radar({ intel, active = false, stage = 0, compact = false }: { intel?: RoomState['intel']; active?: boolean; stage?: number; compact?: boolean }) {
  return <div className={`radar ${compact ? 'radar-compact' : ''}`}>
    <svg viewBox="0 0 680 310" role="img" aria-label={intel ? 'Navigation radar showing the safe corridor and dangerous sectors' : 'Cockpit radar. Telemetry unavailable; ask viewers for navigation intelligence.'}>
      <defs>
        <pattern id="radar-grid" width="34" height="31" patternUnits="userSpaceOnUse"><path d="M34 0H0v31" fill="none" stroke="#829b89" strokeOpacity=".08"/></pattern>
        <radialGradient id="radar-glow"><stop stopColor="#a9ed68" stopOpacity=".07"/><stop offset="1" stopColor="#a9ed68" stopOpacity="0"/></radialGradient>
      </defs>
      <rect width="680" height="310" fill="url(#radar-grid)"/>
      <circle cx="340" cy="155" r="150" fill="url(#radar-glow)"/>
      {[50, 95, 140].map(r => <circle key={r} cx="340" cy="155" r={r} fill="none" stroke="#7f9786" strokeOpacity=".16" strokeDasharray={r === 140 ? '3 6' : undefined}/>)}
      <path d="M180 155h320M340 0v310" stroke="#7f9786" strokeOpacity=".16"/>
      <g className={active ? 'radar-sweep' : ''} style={{ transformOrigin: '340px 155px' }}><path d="M340 155 466 92A140 140 0 0 1 480 155Z" fill="#c6fa6b" fillOpacity=".04"/><path d="M340 155h140" stroke="#c6fa6b" strokeOpacity=".2"/></g>
      {[{ x: 182, y: 80, name: 'KESTREL' }, { x: 475, y: 68, name: 'ORION' }, { x: 485, y: 246, name: 'VEGA' }].map((sector, i) => {
        const safe = intel?.safeSector === sector.name;
        const color = intel ? safe ? '#c6fa6b' : '#ed8d7b' : '#7a928c';
        return <g key={sector.name}>
          <path d={`M340 155 ${sector.x} ${sector.y}`} stroke={color} strokeOpacity={intel ? '.5' : '.22'} strokeDasharray="4 6"/>
          <circle cx={sector.x} cy={sector.y} r="17" fill={color} fillOpacity=".07" stroke={color} strokeOpacity=".5"/>
          <circle cx={sector.x} cy={sector.y} r="4" fill={color}/>
          <text x={sector.x + (i === 0 ? -60 : 25)} y={sector.y - 7} fill={color} fontFamily="monospace" fontSize="11" letterSpacing="1.5">{sector.name}</text>
          <text x={sector.x + (i === 0 ? -60 : 25)} y={sector.y + 10} fill={color} opacity=".65" fontFamily="monospace" fontSize="9">{intel ? safe ? 'CLEAR CORRIDOR' : 'DO NOT ENTER' : 'NO TELEMETRY'}</text>
        </g>;
      })}
      <path d="m340 141 9 25-9-5-9 5Z" fill="#e7e9df" stroke="#e7e9df"/>
      <circle cx="340" cy="155" r="27" fill="none" stroke="#c6fa6b" strokeOpacity=".35"/>
      <text x="28" y="30" fontFamily="monospace" fontSize="9" fill="#73817d" letterSpacing="2">DEEP SPACE TELEMETRY</text>
      <text x="28" y="289" fontFamily="monospace" fontSize="9" fill="#73817d">34° 08′ 52.1″ N</text>
      <text x="520" y="289" fontFamily="monospace" fontSize="9" fill="#73817d">SCAN / {active ? `0${stage + 1}` : 'STANDBY'}</text>
    </svg>
    {!intel && <div className="radar-notice"><span className="status-dot" />{active ? 'Sensors offline. Your crew is your eyes.' : 'Awaiting rescue launch'}</div>}
  </div>;
}
export function MissionStats({ state, remaining, large = false }: { state: PublicState; remaining: number; large?: boolean }) {
  return <div className={`mission-stats ${large ? 'stats-large' : ''}`}>
    <div className={`stat timer-stat ${remaining < 60_000 ? 'critical' : ''}`}><span className="eyebrow">OXYGEN WINDOW</span><strong>{formatTime(remaining)}<span className="stat-unit"> / 06:00</span></strong><div className="meter"><span style={{ width: `${state.oxygen}%` }}/></div></div>
    <div className={`stat ${state.integrity <= 40 ? 'critical' : ''}`}><span className="eyebrow"><Shield size={12} /> HULL INTEGRITY</span><strong>{state.integrity}<span className="stat-unit">%</span></strong><div className="meter"><span style={{ width: `${state.integrity}%` }}/></div></div>
    <div className="stat"><span className="eyebrow"><Users size={12} /> RESCUE CREW</span><strong>{state.crew.length.toString().padStart(2, '0')}<span className="stat-unit"> / {state.viewers} viewing</span></strong><span className="stat-caption">{state.stats.messages} signals received</span></div>
  </div>;
}
export function Steps({ state }: { state: PublicState }) {
  return <div className="mission-steps">{STAGE_NAMES.map((name, i) => {
    const done = state.phase === 'rescued' || state.stage > i;
    const current = state.stage === i && state.phase !== 'rescued';
    return <div key={name} className={`mission-step ${done ? 'done' : ''} ${current ? 'current' : ''}`}>
      <span className="step-number">{done ? <Check size={13}/> : `0${i + 1}`}</span><span>{name}</span>{i < 2 && <ChevronRight size={15} className="step-chevron"/>}
    </div>;
  })}</div>;
}
export function SignalFeed({ state }: { state: PublicState }) {
  const signals = [...state.signals].reverse().slice(0, 12);
  return <section className="panel signal-panel">
    <div className="panel-heading"><span className="eyebrow"><Radio size={14}/> CREW UPLINK</span><span className="mono subtle">{state.stats.messages.toString().padStart(3, '0')}</span></div>
    <div className="signal-feed" aria-label="Crew signals">
      {signals.length === 0 ? <div className="empty-signals"><Radio size={30} strokeWidth={1}/><strong>The silence is temporary.</strong><p>Your crew’s signals will appear here.<br/>Share the intel link to get them aboard.</p><code>!join nav</code></div> : signals.map(signal => <div className={`signal-item signal-${signal.specialty}`} key={signal.id}>
        <div className="signal-meta"><span className="signal-avatar">{signal.name.slice(0, 1).toUpperCase()}</span><strong>{signal.name}</strong><span className="signal-source">{signal.source === 'training' ? 'SIM' : 'TWITCH'}</span></div>
        <p>{signal.text}</p><span className="signal-time"><ArrowDownLeft size={10}/> {new Date(signal.time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>)}
    </div>
    <div className="signal-footer"><span className={`status-dot ${state.twitch.status === 'connected' ? '' : 'dim'}`}/>{state.mode === 'training' ? 'Training uplink · simulated chat' : state.twitch.status === 'connected' ? `Connected to /${state.twitch.channel}` : 'Waiting for Twitch connection'}</div>
  </section>;
}
export function CrewRoster({ state }: { state: PublicState }) {
  return <section className="panel crew-panel">
    <div className="panel-heading"><span className="eyebrow"><Users size={14}/> ON THE MANIFEST</span><span className="mono subtle">{state.crew.length} crew</span></div>
    <div className="crew-roles">{SPECIALTIES.map(role => <div key={role.id}><role.icon size={15}/><span>{role.short}</span><strong>{state.crew.filter(c => c.specialty === role.id).length.toString().padStart(2, '0')}</strong></div>)}</div>
    {state.crew.length > 0 && <div className="crew-names">{[...state.crew].sort((a, b) => b.contributions - a.contributions).slice(0, 6).map(c => <span key={c.id}>{c.name}<span className="subtle"> {c.contributions}</span></span>)}</div>}
    <p className="crew-note">One pilot. A whole community of heroes.</p>
  </section>;
}
export function Footer() {
  return <footer className="footer"><span>SIGNALLOST / AN EXPERIMENT IN TOGETHER.</span><a href="https://github.com/arnavgupta2004/SignalLost" target="_blank" rel="noreferrer">Built with Codex <ArrowUpRight size={13}/></a><span>NO ONE GETS LEFT BEHIND.</span></footer>;
}
