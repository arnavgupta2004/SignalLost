import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Activity, ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Check, ChevronDown, ChevronRight, CircleHelp, Crosshair, ExternalLink, Link as LinkIcon, LoaderCircle, Monitor, Pause, Play, Radio, RotateCcw, Send, Shield, Sparkles, Users, Volume2, VolumeX, X, Zap } from 'lucide-react';
import { GLYPHS, RELAYS, SECTORS, type HostAction, type RoomState, type Specialty } from '../shared/protocol';
import { api, enableAudio, formatTime, getToken, navigate, saveToken, tone, usePath, useRoom } from './lib';
import { Badge, CopyButton, CrewRoster, Footer, GlyphIcon, Logo, MissionStats, Radar, Ship, SignalFeed, SPECIALTIES, STAGE_NAMES, Steps } from './components';

export default function App() {
  const path = usePath();
  const route = /^\/(host|crew|overlay)\/([a-zA-Z0-9]{6})\/?$/.exec(path);
  if (route) return <Room key={`${route[1]}:${route[2]}`} role={route[1] === 'crew' ? 'viewer' : route[1] as 'host' | 'overlay'} roomId={route[2].toUpperCase()}/>;
  if (path === '/manual') return <Manual/>;
  return <Home/>;
}
function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button')?.focus();
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab') return;
      const elements = ref.current?.querySelectorAll<HTMLElement>('button, input, a[href]');
      if (!elements?.length) return;
      const first = elements[0], last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); previous?.focus(); };
  }, [onClose]);
  return <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
      <button className="icon-button modal-close" aria-label="Close dialog" onClick={onClose}><X size={20}/></button>
      <span className="eyebrow">MISSION CONTROL</span><h2>{title}</h2>{children}
    </div>
  </div>;
}
function Home() {
  const [loading, setLoading] = useState<'training' | 'twitch' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [join, setJoin] = useState(false);
  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [online, setOnline] = useState(false);
  useEffect(() => { void api('/api/health').then(() => setOnline(true)).catch(() => setOnline(false)); }, []);
  async function launch(mode: 'training' | 'twitch') {
    setLoading(mode); setError(null);
    try {
      const room = await api<{ roomId: string; hostToken: string }>('/api/rooms', { mode });
      saveToken(room.roomId, room.hostToken); navigate(`/host/${room.roomId}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Cannot reach mission control. Start the server and try again.'); }
    finally { setLoading(null); }
  }
  async function joinRoom(e: FormEvent) {
    e.preventDefault(); setJoining(true); setError(null);
    try { await api(`/api/rooms/${code.toUpperCase()}`); navigate(`/crew/${code.toUpperCase()}`); }
    catch (e) { setError(e instanceof Error ? e.message : 'Room not found.'); }
    finally { setJoining(false); }
  }
  return <div className="home">
    <nav className="topbar"><Logo/><div className="nav-links"><a href="#how-it-works">The mission</a><a href="/manual" onClick={e => { e.preventDefault(); navigate('/manual'); }}>Field manual <ArrowUpRight size={12}/></a></div><button className="button button-outline nav-join" onClick={() => { setJoin(true); setError(null); }}>Join a crew <ArrowUpRight size={15}/></button></nav>
    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="hero-kicker"><span className="small-cross">+</span><span>AN ASYMMETRIC RESCUE. A SHARED ADVENTURE.</span></div>
          <h1>BRING<br/>THEM <span className="lime">HOME<span className="title-period">.</span></span></h1>
          <p className="hero-description">The streamer has the controls.<br/>Chat has the answers.<br/><span>Six lives depend on you working together.</span></p>
          <div className="hero-actions">
            <button className="button button-lime button-large" onClick={() => void launch('training')} disabled={!!loading}>{loading === 'training' ? <LoaderCircle size={17} className="spin"/> : <Play size={17} fill="currentColor"/>}Start training <ArrowUpRight size={18}/></button>
            <button className="button button-outline button-large" onClick={() => void launch('twitch')} disabled={!!loading}>{loading === 'twitch' ? <LoaderCircle size={17} className="spin"/> : <TwitchIcon/>}Launch with Twitch</button>
          </div>
          {error && !join && <p className="inline-error" role="alert">{error}</p>}
          <div className="hero-fine"><span className="status-dot"/><span>FREE TO PLAY</span><span className="fine-divider">/</span><span>1 STREAMER + YOUR COMMUNITY</span></div>
        </div>
        <div className="hero-visual">
          <div className="visual-top"><Badge tone="coral">DISTRESS SIGNAL DETECTED</Badge><span className="mono">SL—006</span></div>
          <div className="orbital-ring ring-one"/><div className="orbital-ring ring-two"/>
          <Ship/>
          <div className="distress-card"><div><Radio size={17}/><span className="eyebrow">INCOMING TRANSMISSION</span><span className="transmission-bars"><i/><i/><i/><i/><i/><i/><i/></span></div><p>“If anyone can hear this…<br/>we’re still here.”</p><span className="mono subtle">KEPLER—9 / 6 SURVIVORS / O₂ CRITICAL</span></div>
          <div className="visual-coordinate">RESCUE UNIT ACTIVE<span>34° 08′ 52.1″</span></div>
        </div>
      </section>
      <div className="mission-ticker"><span><span className="status-dot"/> {online ? 'MISSION CONTROL ONLINE' : 'ESTABLISHING UPLINK'}</span><span>01 PILOT</span><span>03 SYSTEMS TO RESTORE</span><span>06 MINUTES TO RESPOND</span><span>∞ WAYS TO BE A HERO <ArrowUpRight size={14}/></span></div>
      <section className="how-section" id="how-it-works">
        <div className="section-intro"><span className="eyebrow">THE MISSION / HOW IT WORKS</span><h2>You can’t do this alone.<br/><span className="subtle">That’s the whole point.</span></h2><p>A cooperative mission built for the people on both sides of a stream. No installs for viewers. No paywalls. Just a crew and a ticking clock.</p></div>
        <div className="how-cards">
          {[{ icon: Monitor, number: '01', title: 'Take the pilot’s seat.', text: 'Launch a rescue in your browser. Capture the cockpit in OBS. Your sensors are offline—your community will guide you.' }, { icon: Crosshair, number: '02', title: 'Give chat the intel.', text: 'Share your crew link. Viewers see the star map, power schematics, and distress clues that you can’t.' }, { icon: Radio, number: '03', title: 'Listen. Act. Bring them home.', text: 'Chat sends signals through Twitch. You choose a route, restore power, and transmit the rescue code. Every voice counts.' }].map(c => <article className="how-card" key={c.number}><div className="how-card-top"><c.icon size={23} strokeWidth={1.5}/><span>{c.number}</span></div><h3>{c.title}</h3><p>{c.text}</p></article>)}
        </div>
      </section>
      <section className="bottom-cta"><div><span className="eyebrow">THE BEST PART OF A STREAM IS ITS PEOPLE.</span><h2>Give them a mission.</h2></div><button className="button button-lime button-large" onClick={() => void launch('training')} disabled={!!loading}>Try a rescue <ArrowRight size={18}/></button></section>
    </main>
    <Footer/>
    {join && <Modal title="Your crew is waiting." onClose={() => setJoin(false)}><p>Enter the six-character room code shared by your streamer. You’ll get the intel they need to survive.</p><form onSubmit={e => void joinRoom(e)}><label className="field-label" htmlFor="room-code">RESCUE ROOM CODE</label><input id="room-code" className="room-code-input" value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} placeholder="A1B2C3" maxLength={6} autoComplete="off" required pattern="[A-Z0-9]{6}"/>{error && <p className="inline-error" role="alert">{error}</p>}<button className="button button-lime full-width" disabled={joining || code.length !== 6}>{joining ? <LoaderCircle size={17} className="spin"/> : <Users size={17}/>}Get my intel <ArrowRight size={17}/></button></form></Modal>}
  </div>;
}
function TwitchIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M4 2 2 6v16h6v2h4l4-4h4l4-4V2H4Zm18 13-4 4h-5l-3 3v-3H6V4h16v11ZM12 7h2v6h-2V7Zm5 0h2v6h-2V7Z"/></svg>;
}
function Room({ roomId, role }: { roomId: string; role: 'host' | 'viewer' | 'overlay' }) {
  const { state, connection, error, action, remaining } = useRoom(roomId, role);
  const [sound, setSound] = useState(false);
  const lastFeedback = useRef(0);
  useEffect(() => {
    if (state?.feedback && state.feedback.time !== lastFeedback.current) {
      if (sound && lastFeedback.current !== 0) tone(state.feedback.kind);
      lastFeedback.current = state.feedback.time;
    }
  }, [state?.feedback, sound]);
  useEffect(() => {
    document.title = `${role === 'host' ? 'Cockpit' : role === 'viewer' ? 'Crew intel' : 'OBS overlay'} ${roomId} — SignalLost`;
    return () => { document.title = 'SignalLost — Bring them home.'; };
  }, [roomId, role]);
  if (!state) return <div className={`connection-screen ${role === 'overlay' ? 'overlay-loading' : ''}`}><Logo/><div>{error ? <><Radio size={42}/><h1>Uplink unavailable.</h1><p>{error}</p><button className="button button-lime" onClick={() => navigate('/')}>Back to mission control <ArrowRight size={16}/></button></> : <><Activity size={38} className="pulse"/><h1>Establishing uplink<span className="lime">.</span></h1><p>Connecting to rescue room {roomId}.</p><button className="button button-quiet" onClick={() => navigate('/')}>Return home</button></>}</div></div>;
  if (role === 'overlay') return <Overlay state={state} remaining={remaining} connected={connection === 'connected'}/>;
  return <div className={`room-shell ${role === 'viewer' ? 'viewer-shell' : ''}`}>
    <header className="room-topbar"><Logo small/><div className="room-identifier"><span className="topbar-divider"/><span className="eyebrow">{role === 'host' ? 'FLIGHT DECK' : 'CREW INTELLIGENCE'}</span><span className="room-code mono">#{roomId}</span></div><div className="room-topbar-right"><Badge tone={state.mode === 'training' ? 'amber' : 'purple'}>{state.mode === 'training' ? 'TRAINING FLIGHT' : state.twitch.channel ? `TWITCH / ${state.twitch.channel}` : 'TWITCH MISSION'}</Badge><button className="icon-button" title={sound ? 'Mute mission sounds' : 'Enable mission sounds'} aria-label={sound ? 'Mute mission sounds' : 'Enable mission sounds'} onClick={() => { if (!sound) { enableAudio(); tone('info'); } setSound(!sound); }}>{sound ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button><a className="icon-button" href="/manual" onClick={e => { e.preventDefault(); navigate('/manual'); }} title="Field manual" aria-label="Open field manual"><CircleHelp size={18}/></a></div></header>
    {connection !== 'connected' && <div className="connection-banner" role="alert"><LoaderCircle className="spin" size={15}/>{error || 'Connection interrupted. Reconnecting to mission control… Cockpit controls are temporarily disabled.'}</div>}
    <main className="room-main">
      {role === 'host' ? <Host state={state} action={action} remaining={remaining} connected={connection === 'connected'}/> : <Viewer state={state} remaining={remaining}/>}
    </main>
    <Footer/>
  </div>;
}
function Host({ state, remaining, action, connected }: { state: RoomState; remaining: number; action: (a: HostAction) => boolean; connected: boolean }) {
  const [setup, setSetup] = useState(state.phase === 'lobby');
  const [resetConfirm, setResetConfirm] = useState(false);
  const active = state.phase === 'active';
  const finished = state.phase === 'rescued' || state.phase === 'lost';
  const disabled = !connected || !active || state.paused;
  const crewUrl = `${location.origin}/crew/${state.roomId}`;
  const [busy, setBusy] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  async function connectTwitch() {
    setBusy(true); setConnectionError(null);
    try {
      const data = await api<{ url: string }>(`/api/rooms/${state.roomId}/twitch`, {}, getToken(state.roomId));
      location.assign(data.url);
    } catch (e) { setConnectionError(e instanceof Error ? e.message : 'Twitch connection failed.'); setBusy(false); }
  }
  async function disconnectTwitch() {
    setBusy(true);
    try { await api(`/api/rooms/${state.roomId}/twitch/disconnect`, {}, getToken(state.roomId)); }
    catch (e) { setConnectionError(e instanceof Error ? e.message : 'Could not disconnect Twitch.'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="page-title-row"><div><span className="eyebrow">RESCUE OPERATION / SL—006</span><h1>The last light<span className="lime">.</span></h1><p>Six survivors. One failing beacon. Your crew is their only way home.</p></div><div className="mission-controls"><button className="button button-quiet" onClick={() => setSetup(!setup)}><LinkIcon size={15}/>Stream setup <ChevronDown size={14} className={setup ? 'rotate' : ''}/></button>{active && <button className="button button-outline" onClick={() => action({ type: 'pause' })} disabled={!connected}>{state.paused ? <Play size={14}/> : <Pause size={14}/>} {state.paused ? 'Resume' : 'Pause'}</button>}{active && <button className="icon-button" aria-label="Restart mission" title="Restart mission" onClick={() => setResetConfirm(true)} disabled={!connected}><RotateCcw size={17}/></button>}</div></div>
    {setup && <section className="stream-setup panel">
      <div className="setup-grid">
        <div className="setup-block"><span className="eyebrow"><span className="mini-number">01</span> CONNECT YOUR CHANNEL</span><p>{state.mode === 'training' ? 'Training uses simulated chat. Connect Twitch whenever you’re ready for a real crew.' : 'Authorize your own Twitch channel to receive chat signals. Only chat-reading permission is requested.'}</p>{state.twitch.status === 'connected' ? <div className="connected-twitch"><Badge tone="purple">/{state.twitch.channel} CONNECTED</Badge><button className="button button-quiet" onClick={() => void disconnectTwitch()} disabled={busy}>Disconnect</button></div> : <button className="button button-twitch" onClick={() => void connectTwitch()} disabled={busy}>{busy || state.twitch.status === 'connecting' || state.twitch.status === 'reconnecting' ? <LoaderCircle className="spin" size={15}/> : <TwitchIcon/>}{state.twitch.status === 'reconnecting' ? 'Reconnecting…' : 'Connect Twitch'}<ArrowUpRight size={14}/></button>}{(connectionError || state.twitch.error) && <p className="inline-error" role="alert">{connectionError || state.twitch.error}</p>}{!state.twitch.configured && <a className="text-link" href="/manual#twitch" onClick={e => { e.preventDefault(); navigate('/manual'); setTimeout(() => document.getElementById('twitch')?.scrollIntoView(), 50); }}>First time? Configure your Twitch app <ArrowUpRight size={12}/></a>}</div>
        <div className="setup-block"><span className="eyebrow"><span className="mini-number">02</span> SHARE THE CREW INTEL</span><p>Paste this link into chat. Viewers get the information your cockpit cannot see.</p><div className="share-link"><input readOnly aria-label="Crew intel link" value={crewUrl} onFocus={e => e.target.select()}/><CopyButton text={crewUrl} label="Copy"/></div><div className="setup-inline"><a className="text-link" href={crewUrl} target="_blank" rel="noreferrer">Open crew panel <ExternalLink size={12}/></a><span className="subtle mono">{state.viewers} connected</span></div></div>
        <div className="setup-block"><span className="eyebrow"><span className="mini-number">03</span> PUT IT ON STREAM</span><p>Capture this cockpit in OBS, or use the transparent browser-source overlay on top of your scene.</p><CopyButton text={`${location.origin}/overlay/${state.roomId}`} label="Copy OBS overlay URL"/><span className="setup-help mono">BROWSER SOURCE / 1920 × 1080</span></div>
      </div>
    </section>}
    <MissionStats state={state} remaining={remaining} large/>
    <div className="cockpit-grid">
      <div className="cockpit-main">
        {finished ? <Debrief state={state} onRestart={() => { action({ type: 'reset' }); setSetup(false); }}/>: <section className="panel flight-panel">
          <div className="panel-heading"><span className="eyebrow"><Crosshair size={14}/> {state.phase === 'lobby' ? 'PRE-FLIGHT BRIEFING' : `${SPECIALTIES[state.stage].name.toUpperCase()} SYSTEM`}</span><Badge tone={state.phase === 'lobby' ? 'neutral' : state.paused ? 'amber' : 'lime'}>{state.phase === 'lobby' ? 'STANDBY' : state.paused ? 'PAUSED' : 'MISSION ACTIVE'}</Badge></div>
          <Steps state={state}/>
          {state.phase === 'lobby' ? <div className="briefing"><div className="briefing-art"><Radar/><span className="briefing-art-label">LAST KNOWN POSITION / KEPLER—9</span></div><div className="briefing-copy"><span className="eyebrow">INCOMING / PRIORITY ONE</span><h2>They’re still out there.</h2><p>A research capsule has gone dark beyond the Kepler belt. Six people are alive inside, but their oxygen won’t last.</p><p>Your ship’s sensors are damaged. <strong>You have the controls. Your viewers have the missing telemetry.</strong> Listen to their signals, choose carefully, and bring everyone home.</p><div className="briefing-rules"><span><Shield size={14}/>Mistake: −20% hull, −20 sec</span><span><Users size={14}/>Works with 1+ viewers</span></div><button className="button button-lime button-large" onClick={() => { action({ type: 'start' }); setSetup(false); }} disabled={!connected}><Play size={17} fill="currentColor"/>Launch rescue <ArrowRight size={18}/></button><span className="briefing-note">The six-minute oxygen clock starts when you launch.</span></div></div> : <>
            <div className="system-intro"><span className="system-index">0{state.stage + 1}</span><div><h2>{STAGE_NAMES[state.stage]}</h2><p>{['Your star map is blind. Ask navigation which sector is safe.', 'The airlock has no power. Ask engineering which relays to engage.', 'The capsule needs a four-symbol handshake. Ask decoders for the sequence.'][state.stage]}</p></div></div>
            {state.stage === 0 && <><Radar active={!state.paused}/><div className="control-console"><div className="console-label"><span className="eyebrow">SELECT A FLIGHT CORRIDOR</span><span className="mono subtle">CONFIRM WITH YOUR CREW FIRST</span></div><div className="sector-controls">{SECTORS.map((sector, i) => <button className="sector-button" key={sector} disabled={disabled} onClick={() => action({ type: 'route', sector })}><span className="mono subtle">CORRIDOR 0{i + 1}</span><strong>{sector}</strong><span>Set course <ArrowUpRight size={15}/></span></button>)}</div></div></>}
            {state.stage === 1 && <div className="power-console"><div className="power-schematic"><div className="power-source"><Zap size={23}/><span>EMERGENCY BUS</span></div><div className="power-wires"/><div className="relay-controls">{RELAYS.map((relay, index) => <button className={`relay-button ${state.relays[index] ? 'on' : ''}`} aria-label={`Relay ${relay}`} aria-pressed={state.relays[index]} key={relay} disabled={disabled} onClick={() => action({ type: 'relay', index })}><span className="relay-id">{relay}</span><span className="relay-switch"><i/></span><span className="mono">{state.relays[index] ? 'ON' : 'OFF'}</span><span className="relay-description">RELAY 0{index + 1}</span></button>)}</div><div className="power-destination"><Shield size={18}/><span>RESCUE AIRLOCK</span><span className="badge badge-coral">OFFLINE</span></div></div><div className="console-action"><p>Match all four relays to the crew’s schematic.<br/><span className="subtle">Incorrect routing will damage the hull.</span></p><button className="button button-lime" disabled={disabled} onClick={() => action({ type: 'power' })}><Zap size={16}/>Engage power <ArrowRight size={16}/></button></div></div>}
            {state.stage === 2 && <div className="decoder-console"><div className="signal-wave">{Array.from({ length: 45 }, (_, i) => <i key={i} style={{ height: `${10 + Math.abs(Math.sin(i * 1.7)) * (i < 8 || i > 36 ? 12 : 46)}px`, animationDelay: `${i * .06}s` }}/>)}</div><span className="eyebrow">DISTRESS HANDSHAKE / ENTER 4 SYMBOLS</span><div className="code-slots">{[0, 1, 2, 3].map(i => <div className={`code-slot ${state.enteredCode[i] ? 'filled' : ''}`} key={i}>{state.enteredCode[i] ? <><GlyphIcon glyph={state.enteredCode[i]} size={34}/><span>{state.enteredCode[i]}</span></> : <><span className="slot-placeholder">+</span><span>0{i + 1}</span></>}</div>)}</div><div className="glyph-controls">{GLYPHS.map(glyph => <button key={glyph} disabled={disabled || state.enteredCode.length >= 4} onClick={() => action({ type: 'glyph', glyph })}><GlyphIcon glyph={glyph} size={23}/>{glyph}</button>)}</div><div className="console-action"><button className="button button-quiet" disabled={disabled || state.enteredCode.length === 0} onClick={() => action({ type: 'clear-code' })}><RotateCcw size={14}/>Clear sequence</button><button className="button button-lime" disabled={disabled || state.enteredCode.length !== 4} onClick={() => action({ type: 'transmit' })}><Send size={16}/>Transmit rescue code <ArrowRight size={16}/></button></div></div>}
          </>}
          {state.paused && <div className="paused-notice"><Pause size={16}/>Mission paused. Your crew can still review the intel.</div>}
          {state.feedback && <div className={`feedback feedback-${state.feedback.kind}`} role="status" aria-live="polite">{state.feedback.kind === 'success' ? <Check size={17}/> : state.feedback.kind === 'error' ? <Shield size={17}/> : <Radio size={17}/>}<span>{state.feedback.text}</span></div>}
        </section>}
        {state.mode === 'training' && <Training state={state} action={action} connected={connected}/>}
        <div className="cockpit-footnote"><Shield size={13}/><span>YOUR COCKPIT HAS NO PUZZLE ANSWERS. TRUST YOUR CREW.</span><span>FLIGHT RECORDER ACTIVE <span className="status-dot"/></span></div>
      </div>
      <aside className="cockpit-sidebar"><SignalFeed state={state}/><CrewRoster state={state}/><div className="crew-invite-mini"><span className="eyebrow">CALLING ALL CREW</span><p>Intel room <strong className="mono">#{state.roomId}</strong></p><CopyButton text={crewUrl} label="Copy crew link"/></div></aside>
    </div>
    {resetConfirm && <Modal title="Launch a fresh rescue?" onClose={() => setResetConfirm(false)}><p>This ends your current attempt and generates new puzzles. Your room link and Twitch connection stay active.</p><div className="modal-actions"><button className="button button-outline" onClick={() => setResetConfirm(false)}>Keep flying</button><button className="button button-lime" onClick={() => { action({ type: 'reset' }); setResetConfirm(false); }}><RotateCcw size={15}/>New rescue</button></div></Modal>}
  </>;
}
function Training({ state, action, connected }: { state: RoomState; action: (a: HostAction) => boolean; connected: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState('Training_Crew');
  const [text, setText] = useState('!join nav');
  const [sending, setSending] = useState(false);
  function simulate() {
    setSending(true); action({ type: 'simulate-crew' }); setTimeout(() => setSending(false), 1700);
  }
  function submit(e: FormEvent) {
    e.preventDefault(); action({ type: 'training-signal', name, text, specialty: 'navigator' }); setSending(true); setTimeout(() => setSending(false), 1700);
  }
  return <section className="training-panel"><div className="training-header"><span className="eyebrow"><Sparkles size={14}/> TRAINING COMMS</span><span className="training-description">Flying solo? A simulated crew can help.</span><button className="button button-outline" onClick={simulate} disabled={!connected || sending || state.phase === 'rescued' || state.phase === 'lost'}>{sending ? <Check size={14}/> : <Radio size={14}/>}Request simulated intel</button><button className="icon-button" onClick={() => setExpanded(!expanded)} title="Send a custom simulated chat message" aria-label="Show custom training message"><ChevronDown size={17} className={expanded ? 'rotate' : ''}/></button></div>{expanded && <form className="training-form" onSubmit={submit}><label>CREW NAME<input value={name} onChange={e => setName(e.target.value.slice(0, 30))} maxLength={30} required/></label><label>SIMULATED TWITCH COMMAND<input value={text} onChange={e => setText(e.target.value.slice(0, 160))} maxLength={160} required placeholder="!nav ORION"/></label><button className="button button-outline" disabled={!connected || sending}><Send size={14}/>Send</button><p>Training messages are labeled SIM. Live mode accepts Twitch chat only.</p></form>}</section>;
}
function Viewer({ state, remaining }: { state: RoomState; remaining: number }) {
  const [specialty, setSpecialty] = useState<Specialty>('navigator');
  const [revealed, setRevealed] = useState(false);
  const [selectedGlyphs, setSelectedGlyphs] = useState<string[]>([]);
  useEffect(() => { setSpecialty(SPECIALTIES[state.stage].id); setRevealed(false); setSelectedGlyphs([]); }, [state.stage, state.startedAt]);
  const intel = state.intel!;
  const finished = state.phase === 'rescued' || state.phase === 'lost';
  const relayCommand = `!power ${intel.relayTarget.map((on, i) => on ? RELAYS[i] : null).filter(Boolean).join(' ')} ON, others OFF`;
  const command = specialty === 'navigator' ? `!nav ${intel.safeSector}` : specialty === 'engineer' ? relayCommand : `!code ${(selectedGlyphs.length === 4 ? selectedGlyphs : intel.code).join(' ')}`;
  return <>
    <div className="page-title-row"><div><span className="eyebrow">YOU ARE THE EYES OF THIS RESCUE</span><h1>Every signal matters<span className="lime">.</span></h1><p>The pilot can’t see this intel. Read it, decode it, and guide them through chat.</p></div><Badge tone={finished ? state.phase === 'rescued' ? 'lime' : 'coral' : 'cyan'}>{state.phase === 'lobby' ? 'AWAITING PILOT' : state.phase === 'rescued' ? 'CREW RESCUED' : state.phase === 'lost' ? 'SIGNAL LOST' : state.paused ? 'MISSION PAUSED' : `SYSTEM 0${state.stage + 1} ACTIVE`}</Badge></div>
    <MissionStats state={state} remaining={remaining}/>
    {finished ? <Debrief state={state}/> : <div className="viewer-grid">
      <section className="panel intel-panel">
        <div className="panel-heading"><span className="eyebrow"><Crosshair size={14}/> CLASSIFIED CREW TELEMETRY</span><span className="intel-access mono"><Shield size={12}/> VIEWERS ONLY</span></div>
        <div className="specialty-tabs" role="tablist" aria-label="Crew specialties">{SPECIALTIES.map((s, i) => <button role="tab" aria-selected={specialty === s.id} id={`tab-${s.id}`} aria-controls={`intel-${s.id}`} key={s.id} className={specialty === s.id ? 'selected' : ''} onClick={() => setSpecialty(s.id)}><s.icon size={16}/>{s.name}<span className={`tab-stage ${state.stage === i ? 'needed' : ''}`}>{state.stage === i ? 'NEEDED NOW' : `0${i + 1}`}</span></button>)}</div>
        <div role="tabpanel" id={`intel-${specialty}`} aria-labelledby={`tab-${specialty}`}>
          {specialty === 'navigator' && <><div className="intel-intro"><span className="eyebrow">NAVIGATION / MISSING STAR MAP</span><h2>Find the safe way through.</h2><p>Your radar works. The pilot’s doesn’t. Two corridors are dangerous. One will get them to the capsule.</p></div><Radar intel={intel} active={state.phase === 'active'} stage={state.stage}/><div className="intel-sector-list">{intel.sectors.map(sector => <div className={sector.danger ? 'danger' : 'safe'} key={sector.name}><span className="sector-indicator">{sector.danger ? <X size={14}/> : <Check size={14}/>}</span><div><strong>{sector.name}</strong><span>{sector.detail}</span></div><span className="mono">{sector.distance}</span></div>)}</div></>}
          {specialty === 'engineer' && <><div className="intel-intro"><span className="eyebrow">ENGINEERING / EMERGENCY POWER SCHEMATIC</span><h2>Bring the airlock back online.</h2><p>Only the emergency relays should be active. Tell the pilot exactly which switches must be on—and which must stay off.</p></div><div className="intel-power"><div className="schematic-heading"><Zap size={22}/><span className="mono">KEPLER—9 EMERGENCY POWER BUS</span></div><div className="intel-relays">{RELAYS.map((relay, i) => <div className={`intel-relay ${intel.relayTarget[i] ? 'target-on' : ''}`} key={relay}><span className="eyebrow">RELAY</span><strong>{relay}</strong><span className="relay-switch"><i/></span><span className="mono">{intel.relayTarget[i] ? 'MUST BE ON' : 'MUST BE OFF'}</span></div>)}</div><div className="schematic-note"><Shield size={17}/>{intel.relayHint}</div></div><div className="intel-warning"><CircleHelp size={17}/><p>Switches are controlled by the pilot. Once every relay matches this schematic, tell them to press <strong>Engage power</strong>.</p></div></>}
          {specialty === 'decoder' && <><div className="intel-intro"><span className="eyebrow">SIGNAL DECODING / SURVIVOR HANDSHAKE</span><h2>A message between the static.</h2><p>The survivors encoded four symbols as clues. Decode them in order, then send the sequence to your pilot.</p></div><div className="clue-grid">{intel.codeHints.map((clue, i) => <div className="clue-card" key={i}><span className="eyebrow">SYMBOL 0{i + 1}</span><p>“{clue}”</p>{revealed ? <div className="clue-answer"><GlyphIcon glyph={intel.code[i]} size={24}/>{intel.code[i]}</div> : <span className="clue-question">?</span>}</div>)}</div><div className="decoder-helper"><span className="eyebrow">ASSEMBLE YOUR FINDINGS</span><div className="viewer-glyphs">{GLYPHS.map(g => <button className="button button-outline" key={g} disabled={selectedGlyphs.length >= 4} onClick={() => setSelectedGlyphs([...selectedGlyphs, g])}><GlyphIcon glyph={g} size={19}/>{g}</button>)}</div><div className="assembled-code"><code>{selectedGlyphs.length ? selectedGlyphs.join(' → ') : 'Choose four symbols in clue order'}</code><button className="icon-button" aria-label="Clear decoded symbols" onClick={() => setSelectedGlyphs([])}><RotateCcw size={14}/></button></div><button className="text-link" onClick={() => setRevealed(!revealed)}><CircleHelp size={13}/>{revealed ? 'Hide hints' : 'Need a hand? Reveal decoded hints'}</button></div></>}
        </div>
        <div className="intel-command"><div><span className="eyebrow">SEND YOUR FINDING TO THE PILOT</span><code>{specialty === 'decoder' && selectedGlyphs.length !== 4 && !revealed ? '!code [your four symbols]' : command}</code></div><CopyButton text={command} label="Copy signal" className="button-lime" /></div>
      </section>
      <aside className="viewer-sidebar">
        <section className="panel crew-instructions"><div className="panel-heading"><span className="eyebrow"><Radio size={14}/> YOUR NEXT MOVE</span><ArrowUpRight size={15}/></div><div className="instructions-body"><h3>Tell the pilot what you see.</h3><ol><li><span>01</span><p>Join the crew in Twitch chat.<code>!join {specialty === 'navigator' ? 'nav' : specialty === 'engineer' ? 'engineer' : 'decoder'}</code></p></li><li><span>02</span><p>Read the intel in this panel.<br/>You see what the pilot can’t.</p></li><li><span>03</span><p>Copy your finding and paste it into Twitch chat. The pilot sees it on their uplink.</p></li></ol>{state.twitch.channel ? <a className="button button-twitch full-width" href={`https://www.twitch.tv/${state.twitch.channel}`} target="_blank" rel="noreferrer"><TwitchIcon/>Open /{state.twitch.channel}<ExternalLink size={14}/></a> : <div className="training-viewer-note"><Badge tone="amber">TRAINING MISSION</Badge><p>Have the pilot paste your command into <strong>Training comms</strong>, or connect Twitch for live participation.</p></div>}<p className="viewer-privacy"><Shield size={12}/>No Twitch sign-in needed to read intel.</p></div></section>
        <CrewRoster state={state}/>
        <div className="newcomer-card"><Sparkles size={20}/><h3>Just got here? You’re right on time.</h3><p>The crew currently needs <strong>{SPECIALTIES[state.stage].name.toLowerCase()}</strong>. You don’t need the whole story to help with the next step.</p><button className="text-link" onClick={() => setSpecialty(SPECIALTIES[state.stage].id)}>Show me the current intel <ArrowRight size={13}/></button></div>
      </aside>
    </div>}
    <div className="viewer-bottom"><Radio size={14}/><span>YOU SEND THE SIGNAL. THE PILOT MAKES THE CALL. EVERY RESCUE BELONGS TO THE WHOLE CREW.</span></div>
  </>;
}
function Debrief({ state, onRestart }: { state: RoomState; onRestart?: () => void }) {
  const rescued = state.phase === 'rescued';
  const heroes = [...state.crew].sort((a, b) => b.contributions - a.contributions).slice(0, 8);
  return <section className={`panel debrief ${rescued ? 'debrief-success' : 'debrief-lost'}`}><div className="debrief-orbit"><div/><div/><span>{rescued ? <Shield size={42} strokeWidth={1.3}/> : <Radio size={42} strokeWidth={1.3}/>}</span></div><Badge tone={rescued ? 'lime' : 'coral'}>{rescued ? 'ALL SIX SURVIVORS RECOVERED' : 'FLIGHT RECORDER RECOVERED'}</Badge><h2>{rescued ? <>You brought them <span className="lime">home.</span></> : <>The signal went <span className="coral">quiet.</span></>}</h2><p>{rescued ? 'Somewhere out there, six people get another tomorrow. Because your community showed up.' : 'The beacon faded before you reached them. Regroup, listen to your crew, and launch another rescue.'}</p><div className="debrief-stats"><div><span className="eyebrow">CREW RATING</span><strong>{state.debrief?.rank}</strong></div><div><span className="eyebrow">MISSION SCORE</span><strong className="lime">{state.debrief?.score.toLocaleString()}</strong></div><div><span className="eyebrow">RESCUE TIME</span><strong>{formatTime(state.stats.timeUsedMs)}</strong></div></div><div className="medals">{state.debrief?.medals.map(medal => <span key={medal}><Check size={13}/>{medal}</span>)}</div>{heroes.length > 0 && <div className="debrief-heroes"><span className="eyebrow">THE PEOPLE WHO MADE IT HAPPEN</span><div>{heroes.map(c => <span key={c.id}>{c.name}<small>{c.contributions} signal{c.contributions !== 1 ? 's' : ''}</small></span>)}</div></div>}{onRestart ? <button className="button button-lime button-large" onClick={onRestart}><RotateCcw size={16}/>Launch another rescue <ArrowRight size={16}/></button> : <p className="debrief-wait">Stay on this link. A new mission appears when your pilot launches again.</p>}<span className="debrief-signoff mono">NO ONE GETS LEFT BEHIND. / SIGNALLOST</span></section>;
}
function Overlay({ state, remaining, connected }: { state: RoomState; remaining: number; connected: boolean }) {
  const lastSignal = state.signals.at(-1);
  return <main className="obs-overlay"><div className="overlay-top"><Logo small/><div className="overlay-room"><span className="eyebrow">JOIN THE RESCUE</span><strong>#{state.roomId}</strong><span>{location.host}/crew/{state.roomId}</span></div></div><div className="overlay-bottom"><div className="overlay-mission"><span className="eyebrow">{state.mode === 'training' ? 'TRAINING FLIGHT' : 'LIVE RESCUE'} / {!connected ? 'RECONNECTING' : state.phase === 'rescued' ? 'MISSION COMPLETE' : state.phase === 'lost' ? 'SIGNAL LOST' : state.phase === 'lobby' ? 'AWAITING LAUNCH' : state.paused ? 'PAUSED' : `SYSTEM 0${state.stage + 1}`}</span><h2>{state.phase === 'rescued' ? 'Six lives saved.' : state.phase === 'lost' ? 'The beacon went quiet.' : STAGE_NAMES[state.stage]}</h2><div><span className={remaining < 60_000 ? 'coral' : 'lime'}>{formatTime(remaining)}</span><span>HULL {state.integrity}%</span><span>{state.crew.length} CREW</span></div></div>{lastSignal && <div className="overlay-signal"><span className="eyebrow"><Radio size={13}/> {lastSignal.source === 'training' ? 'SIMULATED CREW SIGNAL' : 'TWITCH CREW SIGNAL'}</span><strong>{lastSignal.name}</strong><p>{lastSignal.text}</p></div>}</div></main>;
}
function Manual() {
  return <div className="manual-shell"><nav className="topbar"><Logo/><button className="button button-outline" onClick={() => navigate('/')}><ArrowLeft size={15}/>Mission control</button></nav><main className="manual-main"><span className="eyebrow"><BookOpen size={14}/> SIGNALLOST / FIELD MANUAL</span><h1>A little preparation.<br/><span className="lime">A better rescue.</span></h1><p className="manual-lead">Everything you need to put your community in the mission.</p>
    <section><h2>Try it in two minutes.</h2><p>Choose <strong>Start training</strong> on the home page, then launch your rescue. Press <strong>Request simulated intel</strong> to receive a crew message. Follow its instructions to operate each system. All simulated messages are clearly labeled.</p><p>For the full cooperative experience, open the crew link in a second browser window. Keep that panel off stream—the missing information is the game.</p></section>
    <section><h2>One pilot. Three crew specialties.</h2><div className="manual-role-grid">{SPECIALTIES.map((s, i) => <div key={s.id}><s.icon size={23}/><h3>{s.name}</h3><p>{['Read the working radar. Identify the only safe flight corridor.', 'Read the emergency bus schematic. Specify all four relay positions.', 'Decode four distress clues into symbols. Send them in the correct order.'][i]}</p><code>{['!nav VEGA', '!power A C ON, others OFF', '!code SUN WAVE STAR MOON'][i]}</code></div>)}</div><p>Commands are guidance for the pilot, not automatic controls. The pilot makes each decision. Anyone can read intel; <code>!join nav</code>, <code>!join engineer</code>, or <code>!join decoder</code> adds their name to the crew manifest. <code>!ping message</code> sends a general signal. Commands have a 1.5-second cooldown per viewer.</p></section>
    <section id="twitch"><h2>Connect real Twitch chat.</h2><ol className="manual-list"><li>Register a confidential application at <a href="https://dev.twitch.tv/console/apps" target="_blank" rel="noreferrer">the Twitch developer console <ArrowUpRight size={12}/></a>. Select the applicable application category and register your callback URL.</li><li>For local development, use <code>http://localhost:3001/auth/twitch/callback</code> as the exact OAuth redirect URL.</li><li>Copy <code>.env.example</code> to <code>.env</code>. Set <code>TWITCH_CLIENT_ID</code>, <code>TWITCH_CLIENT_SECRET</code>, and <code>APP_URL=http://localhost:5173</code>. Restart <code>npm run dev</code>.</li><li>Create a rescue, expand <strong>Stream setup</strong>, and press <strong>Connect Twitch</strong>. Sign in as the broadcaster whose chat you want to use. Approve the <code>user:read:chat</code> permission.</li><li>Wait for the connected badge. Share your crew link in chat, ask someone to send <code>!join nav</code>, and verify it appears on the cockpit uplink.</li></ol><p>SignalLost reads chat using Twitch EventSub WebSockets. It does not post to chat. Tokens stay in server memory, are refreshed automatically, and are removed when the connection stops. Restarting the server requires reconnecting Twitch.</p><div className="manual-callout"><Radio size={18}/><p><strong>Viewers need an accessible crew link.</strong> A localhost link only works on your computer. Deploy the server at a public HTTPS URL, or use an HTTPS tunnel to the production server. Set <code>APP_URL</code> and the callback URL to that public address and register the callback with Twitch. See the repository’s deployment guide.</p></div></section>
    <section><h2>Put it in OBS.</h2><p>Capture the cockpit browser window for the complete experience. Alternatively, copy the <strong>OBS overlay URL</strong> from Stream setup into an OBS Browser Source at <strong>1920 × 1080</strong>. The overlay background is transparent and includes the room link, objective, timer, hull, and latest crew signal.</p><p>Keep the crew panel out of the broadcast. Use your own licensed stream assets and audio when recording the demonstration.</p></section>
    <section><h2>When things go sideways.</h2><p>A wrong route, power configuration, or handshake costs 20% hull and 20 seconds of oxygen. Losing all hull or reaching zero oxygen ends the mission. The pilot can pause to accommodate the audience; crew intel and chat remain available.</p><p>Browser connections recover automatically. If the pilot disappears for five seconds, mission control pauses the rescue. Reopening the cockpit in the same browser restores access. Rooms and progress are stored in server memory; a server restart clears them.</p></section>
    <section><h2>Make the rescue yours.</h2><p>Invite viewers to specialize, read their messages aloud, and celebrate the debrief’s crew credits. Missions generate fresh answers each time. It works with a single viewer, and late arrivals can help with the current system immediately.</p><button className="button button-lime button-large" onClick={() => navigate('/')}>Let’s bring them home <ArrowRight size={17}/></button></section>
  </main><Footer/></div>;
}
