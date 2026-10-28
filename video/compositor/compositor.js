// SignalLost film compositor. Every visual is a pure function of time: window.__render(frame)
// positions all layers for that frame and resolves once footage images have decoded, so the
// renderer can capture frames one by one and get identical output on every run.
const json = (url) => fetch(url).then((r) => r.json());
const T = await json('/video/timeline.json');
const E = await json('/video/build/edl.json');
const clipMeta = Object.fromEntries(
  (await json('/video/build/footage/clips.json')).map((c) => [c.name, c]),
);
const M = E.mission;
const FPS = T.fps;
const stage = document.getElementById('stage');

// ---------- helpers ----------
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const prog = (t, a, b) => clamp((t - a) / (b - a));
const out3 = (x) => 1 - (1 - x) ** 3;
const inout = (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2);
function el(tag, cls, parent = stage, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  parent.append(e);
  return e;
}
function box(e, x, y, w, h) {
  Object.assign(e.style, { left: `${x}px`, top: `${y}px` });
  if (w != null) e.style.width = `${w}px`;
  if (h != null) e.style.height = `${h}px`;
  return e;
}
function show(e, opacity, { dx = 0, dy = 0, scale = 1 } = {}) {
  e.style.opacity = opacity.toFixed(4);
  e.style.visibility = opacity <= 0.001 ? 'hidden' : 'visible';
  e.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${scale.toFixed(4)})`;
}
// Fade and rise in at `at`; optionally fade out at `off`.
function rise(e, t, at, { dur = 0.6, dist = 16, off = null, offDur = 0.35 } = {}) {
  const p = out3(prog(t, at, at + dur));
  const o = off == null ? p : p * (1 - prog(t, off, off + offDur));
  show(e, o, { dy: (1 - p) * dist });
  return o;
}
const icon = {
  check: (c = 'var(--lime)') =>
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>`,
  ring: (c = 'var(--amber)') =>
    `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><circle cx="12" cy="12" r="8" stroke-dasharray="3 3"/></svg>`,
  cross: (c = 'var(--coral)') =>
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>`,
  lock: (c = 'var(--amber)') =>
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>`,
  pulse: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c6fa6b" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l3-8 4 16 3-8h6"/></svg>`,
};

// ---------- footage ----------
const pending = [];
function frameSrc(clip, time) {
  const meta = clipMeta[clip];
  const index = clamp(Math.floor(time * FPS + 1e-6), 0, meta.frames - 1);
  return `/video/build/footage/${clip}/f${String(index).padStart(5, '0')}.jpg`;
}
function setSrc(img, src) {
  if (img.dataset.src === src) return;
  img.dataset.src = src;
  img.src = src;
  pending.push(img.decode().catch(() => {}));
}
const clipTime = (e, t) => e.in + (clamp(t, e.start, e.end - 1e-4) - e.start) * e.speed;
const markFilm = (e, kind, n = 0) => {
  const mark = clipMeta[e.clip].marks.filter((m) => m.kind === kind)[n];
  return mark ? e.start + (mark.time - e.in) / e.speed : null;
};
function monitor(parent, x, y, w, h) {
  const m = box(el('div', 'monitor abs', parent), x, y, w, h);
  const imgs = [el('img', '', m), el('img', '', m)];
  for (const img of imgs) Object.assign(img.style, { width: `${w}px`, height: `${h}px` });
  return { el: m, imgs };
}
// Show the edit active at t, dissolving briefly from the previous edit at each cut.
function playEdits(mon, edits, t, dissolve = 0.18) {
  let i = edits.findIndex((e) => t >= e.start && t < e.end);
  if (i < 0) i = t < edits[0].start ? 0 : edits.length - 1;
  const current = edits[i],
    previous = edits[i - 1];
  const mixing = previous && previous.end === current.start && t < current.start + dissolve;
  const [under, over] = mon.imgs;
  if (mixing) {
    setSrc(under, frameSrc(previous.clip, clipTime(previous, previous.end - 1 / FPS)));
    setSrc(over, frameSrc(current.clip, clipTime(current, t)));
    show(under, 1);
    show(over, inout(prog(t, current.start, current.start + dissolve)));
  } else {
    setSrc(under, frameSrc(current.clip, clipTime(current, t)));
    show(under, 1);
    show(over, 0);
  }
  return current;
}
// A zoomed crop of one captured frame, positioned by rectangles recorded during capture.
function lens(parent, x, y, w, still, pad = 14) {
  const r = E.rects[still.clip][still.rect];
  const crop = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
  const s = w / crop.w,
    h = Math.round(crop.h * s);
  const frame = box(el('div', 'lens abs', parent), x, y, w, h);
  const img = el('img', '', frame);
  Object.assign(img.style, {
    width: `${1920 * s}px`,
    height: `${1080 * s}px`,
    transform: `translate(${-crop.x * s}px, ${-crop.y * s}px)`,
  });
  setSrc(img, frameSrc(still.clip, still.time));
  // Map a rectangle from frame pixels into this lens.
  const map = (rect) => ({
    x: (rect.x - crop.x) * s,
    y: (rect.y - crop.y) * s,
    w: rect.w * s,
    h: rect.h * s,
  });
  return { el: frame, h, s, map };
}
function still(parent, x, y, w, h, clip, time) {
  const frame = box(el('div', 'lens abs', parent), x, y, w, h);
  const img = el('img', '', frame);
  Object.assign(img.style, { width: `${w}px`, height: `${h}px` });
  setSrc(img, frameSrc(clip, time));
  return frame;
}

// ---------- layers ----------
el('div', 'layer backdrop');
el('div', 'layer grid');
const scenesLayer = el('div', 'layer');
const chrome = el('div', 'layer');
el('div', 'layer vignette');
const grain = el('div', 'layer grain');
// Deterministic film grain: four seeded noise tiles, cycled every other frame.
const grainTiles = [1, 2, 3, 4].map((seed) => {
  let a = seed * 2654435761;
  const rand = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d');
  const data = g.createImageData(256, 256);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = rand() * 255;
    data.data.set([v, v, v, 255], i);
  }
  g.putImageData(data, 0, 0);
  return `url(${c.toDataURL()})`;
});

const sceneDef = Object.fromEntries(T.scenes.map((s) => [s.id, s]));
const scenes = [];
function scene(id, start = sceneDef[id].start, end = sceneDef[id].end) {
  const root = el('div', 'scene', scenesLayer);
  const s = { id, start, end, root, update: () => {} };
  scenes.push(s);
  return s;
}
function envelope(t, start, end, fade = 0.28) {
  const a = start <= 0 ? 1 : prog(t, start - fade, start + fade);
  const b = end >= T.duration ? 1 : 1 - prog(t, end - fade, end + fade);
  return Math.min(a, b);
}

// Chrome: brand, chapter label, footage provenance.
const brand = el(
  'div',
  'abs brand',
  chrome,
  `<div class="mark">${icon.pulse}</div><div><b>SIGNAL</b><span>LOST</span><i>.</i></div>`,
);
const chapter = el('div', 'abs chapter mono', chrome);
const provenance = el(
  'div',
  'abs provenance mono',
  chrome,
  'Real app footage · training mode · simulated crew signals are labelled SIM',
);
function sceneAt(t) {
  return T.scenes.find((s) => t >= s.start && t < s.end) ?? T.scenes.at(-1);
}
function updateChrome(t) {
  const current = sceneAt(t);
  let o = current.chapter ? 1 : 0;
  for (const s of T.scenes)
    for (const b of [s.start, s.end]) {
      const before = sceneAt(b - 0.01).chapter,
        after = sceneAt(b + 0.01).chapter;
      if (before !== after && Math.abs(t - b) < 0.3) o = Math.min(o, Math.abs(t - b) / 0.3);
    }
  chapter.textContent = current.chapter ?? '';
  show(chapter, o);
  const branded = T.scenes.filter((s) => s.chapter);
  show(brand, envelope(t, branded[0].start, branded.at(-1).end));
  const footage = ['S02', 'S04', 'S05'].map((id) =>
    envelope(t, sceneDef[id].start, sceneDef[id].end),
  );
  show(provenance, Math.max(...footage) * (t > 10.4 && t < 16 ? 0 : 1));
}

// ---------- S01 · cold open ----------
{
  const s = scene('S01');
  const cx = 960,
    cy = 540;
  const ticks = Array.from({ length: 72 }, (_, i) => {
    const a = (i * 5 * Math.PI) / 180,
      len = i % 6 === 0 ? 16 : 7;
    const p = (r) => `${(Math.sin(a) * r).toFixed(1)} ${(-Math.cos(a) * r).toFixed(1)}`;
    return `<path d="M${p(440)} L${p(440 - len)}"/>`;
  }).join('');
  const radar = box(el('div', 'abs', s.root), cx - 450, cy - 450, 900, 900);
  radar.innerHTML = `<svg width="900" height="900" viewBox="-450 -450 900 900">
    <g fill="none" stroke="#223038" stroke-width="1.5">
      <circle class="r" r="150" pathLength="1"/><circle class="r" r="300" pathLength="1"/><circle class="r" r="440" pathLength="1"/>
      <circle class="d" r="225" stroke-dasharray="2 10" stroke="#1a252b"/>
      <path class="r" pathLength="1" d="M-440 0H440"/><path class="r" pathLength="1" d="M0 -440V440"/>
    </g>
    <g class="ticks" stroke="#2b3a40" stroke-width="1.5">${ticks}</g>
    <g class="ship" fill="none" stroke="#c6fa6b" stroke-width="2" stroke-linejoin="round"><path d="M0 -20 L13 16 L0 9 L-13 16 Z"/></g>
  </svg>`;
  const rings = [...radar.querySelectorAll('.r')];
  const tickGroup = radar.querySelector('.ticks'),
    dashed = radar.querySelector('.d'),
    ship = radar.querySelector('.ship');
  const sweep = box(el('div', 'abs', s.root), cx - 440, cy - 440, 880, 880);
  Object.assign(sweep.style, {
    borderRadius: '50%',
    background: 'conic-gradient(from 0deg, transparent 0deg 285deg, rgba(198,250,107,0.14) 360deg)',
  });
  const edge = box(el('div', 'abs', sweep), 439, 0, 2, 440);
  edge.style.background = 'linear-gradient(to top, rgba(198,250,107,0), rgba(198,250,107,0.65))';

  // The capsule: six windows, one per survivor, as drawn in the app's docking scene.
  const angle = (50 * Math.PI) / 180,
    capX = cx + Math.sin(angle) * 255,
    capY = cy - Math.cos(angle) * 255;
  const cap = box(el('div', 'abs', s.root), capX - 70, capY - 30, 140, 60);
  Object.assign(cap.style, {
    border: '1px solid #3a474c',
    borderRadius: '14px',
    background: '#0e141a',
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 18px)',
    gap: '9px 12px',
    placeContent: 'center',
  });
  const windows = Array.from({ length: 6 }, () => {
    const w = el('div', '', cap);
    Object.assign(w.style, { width: '18px', height: '11px', borderRadius: '3px' });
    return w;
  });
  const capLabel = box(
    el('div', 'abs mono muted', s.root, 'Kepler-9 · capsule'),
    capX - 70,
    capY - 62,
  );
  capLabel.style.fontSize = '12px';
  const lifeLabel = box(el('div', 'abs mono', s.root, '6 life signs'), capX - 70, capY + 44);
  Object.assign(lifeLabel.style, { fontSize: '13px', color: 'var(--coral)' });
  const names = box(
    el('div', 'abs mono muted', s.root, 'Mira · Theo · Lina · Oren · Ada · Jun'),
    capX - 70,
    capY + 70,
  );
  names.style.fontSize = '12px';
  const pings = T.lifeSigns.map(() => {
    const p = box(el('div', 'abs', s.root), capX - 40, capY - 40, 80, 80);
    Object.assign(p.style, { borderRadius: '50%', border: '1.5px solid rgba(198,250,107,0.8)' });
    return p;
  });
  const sensors = box(
    el('div', 'abs chip pilot mono', s.root, '● Sensors offline'),
    cx - 112,
    cy + 62,
  );
  const kicker = box(el('div', 'abs mono', s.root), 120, 940);
  Object.assign(kicker.style, { color: 'var(--coral)', fontSize: '15px' });
  const kickerText = 'Distress signal · Kepler-9 · O₂ critical';
  const word = box(
    el('div', 'abs', s.root, '<b>SIGNAL</b><span>LOST</span><i>.</i>'),
    0,
    430,
    1920,
  );
  Object.assign(word.style, {
    textAlign: 'center',
    fontSize: '156px',
    letterSpacing: '-0.02em',
    whiteSpace: 'nowrap',
  });
  word.querySelector('b').style.fontWeight = 700;
  word.querySelector('span').style.fontWeight = 300;
  Object.assign(word.querySelector('i').style, { fontStyle: 'normal', color: 'var(--lime)' });
  const sub = box(
    el('div', 'abs mono muted', s.root, 'A cooperative rescue for Twitch'),
    0,
    640,
    1920,
  );
  Object.assign(sub.style, { textAlign: 'center', fontSize: '17px' });

  s.update = (t) => {
    rings.forEach(
      (r, i) => (r.style.strokeDashoffset = 1 - inout(prog(t, 0.15 + i * 0.12, 1.5 + i * 0.12))),
    );
    tickGroup.style.opacity = prog(t, 0.9, 1.6);
    dashed.style.opacity = prog(t, 1.0, 1.8);
    ship.style.opacity = prog(t, 0.6, 1.1);
    const dim = 1 - 0.72 * inout(prog(t, 4.6, 5.6));
    const zoom = 1 + 0.06 * inout(prog(t, 4.6, 7));
    show(radar, dim, { scale: zoom });
    show(sweep, prog(t, 0.8, 1.5) * dim, { scale: zoom });
    sweep.style.transform += ` rotate(${((t - 0.9) * 95).toFixed(2)}deg)`;
    const capFade = prog(t, 1.2, 1.7) * (1 - 0.7 * inout(prog(t, 4.6, 5.6)));
    for (const e of [cap, capLabel]) show(e, capFade);
    windows.forEach((w, i) => {
      const lit = prog(t, T.lifeSigns[i], T.lifeSigns[i] + 0.25);
      w.style.background = lit > 0 ? `rgba(198,250,107,${0.25 + 0.75 * lit})` : '#1c262c';
      w.style.boxShadow = lit > 0 ? `0 0 ${10 * lit}px rgba(198,250,107,${0.6 * lit})` : 'none';
    });
    pings.forEach((p, i) => {
      const k = prog(t, T.lifeSigns[i], T.lifeSigns[i] + 0.9);
      show(p, k > 0 && k < 1 ? (1 - k) * 0.7 * capFade : 0, { scale: 0.4 + 2.2 * out3(k) });
    });
    rise(lifeLabel, t, 3.5, { off: 4.6 });
    rise(names, t, 3.75, { off: 4.6 });
    rise(sensors, t, 3.95, { off: 4.6 });
    const chars = Math.round(kickerText.length * prog(t, 0.6, 2.0));
    kicker.textContent = kickerText.slice(0, chars);
    show(kicker, 1 - prog(t, 4.6, 5.0));
    const w = out3(prog(t, 4.9, 6.0));
    word.style.letterSpacing = `${(0.32 - 0.34 * w).toFixed(4)}em`;
    show(word, prog(t, 4.9, 5.6));
    rise(sub, t, 5.5);
  };
}

// ---------- S02 · premise ----------
{
  const s = scene('S02');
  const landing = E.edits.filter((e) => e.scene === 'S02');
  const mon = monitor(s.root, 210, 150, 1500, 844);
  const tab = box(el('div', 'abs chip quiet mono', s.root, 'The live app · landing page'), 210, 96);

  const kicker = box(el('div', 'abs mono kicker', s.root, 'Same mission · two screens'), 210, 150);
  const title = box(el('div', 'abs display', s.root, 'Neither screen holds the answer.'), 210, 182);
  title.style.fontSize = '64px';
  const pilotLabel = box(
    el(
      'div',
      'abs',
      s.root,
      `<span class="chip pilot mono">Pilot · flight deck</span><span class="muted" style="font-size:22px;margin-left:18px">knows the ship's limits</span>`,
    ),
    210,
    282,
  );
  const pilotLens = lens(s.root, 210, 334, 1500, T.stills.pilotLimits);
  const crewY = 334 + pilotLens.h + 40;
  const crewLabel = box(
    el(
      'div',
      'abs',
      s.root,
      `<span class="chip crew mono">Crew · intel panel</span><span class="muted" style="font-size:22px;margin-left:18px">has the scans</span>`,
    ),
    210,
    crewY,
  );
  const crewLens = lens(s.root, 210, crewY + 52, 1500, T.stills.crewReadings);
  const { radiationLimit, beaconMinimum } = M.navigation;
  const verdicts = M.readings.map((r, i) => {
    const rect = crewLens.map(E.rects[T.stills.crewReadings.clip][r.sector]);
    const ok = r.radiation <= radiationLimit && r.beacon >= beaconMinimum;
    const reason = ok
      ? 'Within both limits'
      : r.radiation > radiationLimit
        ? `Radiation ${r.radiation.toFixed(1)} > ${radiationLimit.toFixed(1)}`
        : `Beacon ${r.beacon}% < ${beaconMinimum}%`;
    const chip = el(
      'div',
      `abs chip mono ${ok ? 'lime' : 'coral'}`,
      crewLens.el,
      `${ok ? icon.check() : icon.cross()}${reason}`,
    );
    box(chip, rect.x + rect.w - 470, rect.y + rect.h / 2 - 19);
    chip.style.width = '440px';
    chip.style.justifyContent = 'flex-start';
    chip.style.background = ok ? 'rgba(20,32,18,0.96)' : 'rgba(34,20,18,0.96)';
    let outline = null;
    if (ok) {
      outline = box(el('div', 'abs', crewLens.el), rect.x - 4, rect.y - 4, rect.w + 8, rect.h + 8);
      Object.assign(outline.style, {
        border: '2px solid var(--lime)',
        borderRadius: '8px',
        boxShadow: '0 0 24px rgba(198,250,107,0.25)',
      });
    }
    return { chip, outline, at: 12.5 + i * 0.35 };
  });

  s.update = (t) => {
    // 2a: the real landing page.
    const p = prog(t, 10.35, 10.8);
    playEdits(mon, landing, t);
    show(mon.el, 1 - p, { scale: (1 + 0.025 * inout(prog(t, 7, 10.6))) * (1 - 0.03 * p) });
    show(tab, prog(t, 7.2, 7.6) * (1 - p));
    // 2b: the same moment, as each role sees it.
    rise(kicker, t, 10.7);
    rise(title, t, 10.8, { dist: 22 });
    rise(pilotLabel, t, 11.1);
    rise(pilotLens.el, t, 11.2, { dist: 24 });
    rise(crewLabel, t, 11.6);
    rise(crewLens.el, t, 11.7, { dist: 24 });
    for (const v of verdicts) {
      rise(v.chip, t, v.at, { dist: 0 });
      v.chip.style.transform += ` translateX(${(1 - out3(prog(t, v.at, v.at + 0.5))) * 24}px)`;
      if (v.outline) show(v.outline, prog(t, 13.2, 13.6));
    }
  };
}

// ---------- S03 · architecture ----------
{
  const s = scene('S03');
  const kicker = box(
    el('div', 'abs mono kicker', s.root, 'One authoritative server · role-based state'),
    120,
    150,
  );
  const title = box(
    el('div', 'abs display', s.root, 'One mission. Three different views.'),
    120,
    182,
  );
  title.style.fontSize = '64px';

  const server = box(el('div', 'abs card', s.root), 120, 345, 640, 400);
  server.innerHTML = `<div style="padding:34px 38px">
    <div class="mono kicker">Mission engine</div>
    <div class="node-title" style="font-size:38px;margin:16px 0 22px">Node.js + WebSockets</div>
    <ul class="list" style="font-size:22px">
      <li style="font-size:23px;margin-bottom:14px">${icon.check()}Holds every answer</li>
      <li style="font-size:23px;margin-bottom:14px">${icon.check()}Advances the clock every 250 ms</li>
      <li style="font-size:23px;margin-bottom:14px">${icon.check()}Applies controls only from the pilot</li>
    </ul>
    <div class="codechip" style="margin-top:14px">projectState(room, role)</div>
  </div>`;
  const clients = [
    {
      y: 250,
      name: 'Pilot cockpit',
      role: 'pilot',
      gets: ['State'],
      extra: `${icon.lock()} Sends controls`,
      img: ['nav_pilot', 0.05],
    },
    {
      y: 495,
      name: 'Crew intel panel',
      role: 'crew',
      gets: ['State', 'Intel'],
      extra: 'Viewers · no sign-in',
      img: ['nav_crew', 2.6],
    },
    {
      y: 740,
      name: 'OBS overlay',
      role: 'overlay',
      gets: ['State'],
      extra: 'Safe to broadcast',
      img: null,
    },
  ].map((c) => {
    const card = box(el('div', 'abs card', s.root), 1180, c.y, 620, 210);
    const thumb = c.img
      ? still(card, 22, 37, 240, 135, ...c.img)
      : box(el('div', 'lens abs', card), 22, 37, 240, 135);
    if (!c.img) {
      thumb.style.background = 'linear-gradient(135deg,#1a2a2e,#0d1418 60%,#20241a)';
      const o = el('img', '', thumb);
      o.src = '/video/build/footage/overlay.png';
      Object.assign(o.style, { width: '240px', height: '135px', objectFit: 'cover' });
    }
    const chips = c.gets
      .map(
        (g) =>
          `<span class="chip mono ${g === 'Intel' ? 'crew' : 'lime'}" style="height:32px;font-size:12px">${g}</span>`,
      )
      .join(' ');
    el(
      'div',
      'abs',
      card,
      `<div class="node-title">${c.name}</div><div style="margin:14px 0;display:flex;gap:8px">${chips}</div><div class="mono muted" style="font-size:12px;display:flex;gap:8px;align-items:center">${c.extra}</div>`,
    ).style.cssText += 'left:290px;top:36px';
    return { ...c, card };
  });
  // Connectors and the packets that travel them.
  const svg = el('div', 'layer', s.root);
  const paths = clients.map((c) => {
    const y = c.y + 105;
    return `M760 545 C 960 545, 980 ${y}, 1180 ${y}`;
  });
  svg.innerHTML = `<svg width="1920" height="1080">${paths
    .map(
      (d, i) =>
        `<path id="link${i}" d="${d}" fill="none" stroke="#2b3a40" stroke-width="2" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"/>`,
    )
    .join('')}</svg>`;
  const links = [...svg.querySelectorAll('path')];
  const dot = (color, size, square = false) => {
    const d = el('div', 'abs', s.root);
    Object.assign(d.style, {
      width: `${size}px`,
      height: `${size}px`,
      marginLeft: `${-size / 2}px`,
      marginTop: `${-size / 2}px`,
      background: color,
      borderRadius: square ? '3px' : '50%',
      boxShadow: `0 0 14px ${color}`,
    });
    return d;
  };
  const statePackets = links.flatMap((_, i) =>
    [0, 1].map((k) => ({ link: i, phase: k / 2, d: dot('#c6fa6b', 9) })),
  );
  const intelPackets = [0, 1, 2].map((k) => ({
    link: 1,
    phase: k / 3,
    d: dot('#83d6d8', 13, true),
  }));
  const controlPackets = [0, 1].map((k) => ({ link: 0, phase: k / 2, d: dot('#e4c879', 9) }));
  const withheld = [0, 2].map((i) => {
    const label = el(
      'div',
      'abs chip quiet mono',
      s.root,
      `${icon.cross('var(--muted)')}Intel withheld`,
    );
    Object.assign(label.style, { height: '30px', fontSize: '11px', padding: '0 10px' });
    box(label, 840, i === 0 ? 372 : 742);
    return label;
  });
  const tokenChip = box(
    el('div', 'abs codechip', s.root, 'secureEqual(token, room.hostToken)'),
    790,
    288,
  );
  tokenChip.style.color = 'var(--amber)';
  function along(i, u) {
    const p = links[i].getPointAtLength(u * links[i].getTotalLength());
    return p;
  }
  s.update = (t) => {
    rise(kicker, t, 16.2);
    rise(title, t, 16.3, { dist: 22 });
    rise(server, t, 16.6, { dist: 24 });
    links.forEach((l, i) =>
      l.setAttribute(
        'stroke-dashoffset',
        (1 - inout(prog(t, 17.4 + i * 0.15, 18.4 + i * 0.15))).toFixed(4),
      ),
    );
    clients.forEach((c, i) => rise(c.card, t, 17.9 + i * 0.25, { dist: 20 }));
    for (const p of statePackets) {
      const on = prog(t, 19.0, 19.4);
      const u = ((((t - 19) / 1.7 + p.phase) % 1) + 1) % 1;
      const pt = along(p.link, u);
      box(p.d, pt.x, pt.y);
      show(p.d, t < 19 ? 0 : on * Math.sin(Math.PI * u));
    }
    for (const p of intelPackets) {
      const on = prog(t, 21.6, 22.0);
      const u = ((((t - 21.6) / 1.5 + p.phase) % 1) + 1) % 1;
      const pt = along(p.link, u);
      box(p.d, pt.x, pt.y);
      show(p.d, t < 21.6 ? 0 : on * Math.sin(Math.PI * u), { scale: 1 });
      p.d.style.transform += ' rotate(45deg)';
    }
    withheld.forEach((w, i) => rise(w, t, 23.4 + i * 0.25));
    for (const p of controlPackets) {
      const on = prog(t, 25.0, 25.4);
      const u = ((((t - 25) / 1.4 + p.phase) % 1) + 1) % 1;
      const pt = along(p.link, 1 - u);
      box(p.d, pt.x, pt.y);
      show(p.d, t < 25 ? 0 : on * Math.sin(Math.PI * u));
    }
    rise(tokenChip, t, 25.1);
    clients[1].card.style.borderColor = `rgba(131,214,216,${0.15 + 0.6 * prog(t, 21.8, 22.4)})`;
    clients[0].card.style.borderColor = `rgba(228,200,121,${0.15 + 0.5 * prog(t, 25.2, 25.8)})`;
  };
}

// ---------- S04 + S05 · the four systems, as one continuous layout ----------
{
  const start = sceneDef.S04.start,
    end = sceneDef.S05.end;
  const s = scene('SYS', start, end);
  const edits = E.edits.filter((e) => e.scene === 'S04' || e.scene === 'S05');
  const beats = [
    ...T.beats,
    {
      index: '04',
      title: 'Extraction',
      pilot: 'Steering and tractor beam',
      crew: 'The safe approach lane',
    },
  ];
  const beatStarts = [29, 35.8, 42.4, 49];
  const beatAt = (t) => beatStarts.filter((b) => t >= b - 0.001).length - 1;

  const tracker = box(el('div', 'abs mono', s.root), 120, 104);
  tracker.style.fontSize = '13px';
  const steps = beats.map((b, i) => {
    const span = el('span', '', tracker, `${b.index} ${b.title}`);
    if (i < beats.length - 1) el('span', '', tracker, '  —  ').style.color = '#2f3b40';
    return span;
  });
  const titles = beats.map((b) => {
    const tl = box(
      el(
        'div',
        'abs display',
        s.root,
        `<span style="color:var(--lime)">${b.index}</span>&nbsp;&nbsp;${b.title}`,
      ),
      120,
      136,
    );
    tl.style.fontSize = '76px';
    return tl;
  });
  const mon = monitor(s.root, 120, 250, 1280, 720);
  const speedChip = el('div', 'abs chip lime mono', s.root);
  Object.assign(speedChip.style, { right: '520px', top: '182px' });

  const card = (y, h, cls) => box(el('div', `abs card ${cls ?? ''}`, s.root), 1440, y, 360, h);
  const rail = beats.map((b) => {
    const crew = card(250, 160);
    crew.innerHTML = `<div style="padding:24px 26px"><div class="mono" style="color:var(--cyan)">Crew has</div><div class="node-title" style="margin-top:12px">${b.crew}</div><div class="mono muted" style="margin-top:12px;font-size:11px">Intel panel · viewers</div></div>`;
    const pilot = card(434, 160);
    pilot.innerHTML = `<div style="padding:24px 26px"><div class="mono" style="color:var(--amber)">Pilot has</div><div class="node-title" style="margin-top:12px">${b.pilot}</div><div class="mono muted" style="margin-top:12px;font-size:11px">Cockpit · streamer</div></div>`;
    return { crew, pilot };
  });
  const on = M.relayTarget.map((v, i) => (v ? 'ABCD'[i] : null)).filter(Boolean);
  const outcomes = [
    `Corridor ${M.safeSector} cleared`,
    `Relays ${on.join(' + ')} on · airlock powered`,
    'Distress handshake verified',
  ];
  const results = [0, 1, 2].map((i) => {
    const pilotEdit = edits.find((e) => e.beat === i && e.role === 'pilot');
    const c = card(618, 180);
    c.innerHTML = `<div style="padding:24px 26px"><div class="mono kicker" style="display:flex;gap:10px;align-items:center">${icon.check()}Result</div><div class="node-title" style="margin-top:14px">${outcomes[i]}</div></div>`;
    c.style.borderColor = 'rgba(198,250,107,0.45)';
    return { c, at: markFilm(pilotEdit, 'success') };
  });
  const dockA = edits.find((e) => e.clip === 'dock_pilot');
  const boostAt = markFilm(dockA, 'boost');
  const drift = card(618, 170);
  drift.innerHTML = `<div style="padding:24px 26px"><div class="mono" style="color:var(--amber)">Ion drift · Commander</div><div class="node-title" style="margin-top:12px">Pushes the ship off its lane</div><div class="node-sub" style="margin-top:8px;font-size:17px">The pilot corrects it by hand.</div></div>`;
  const boost = card(812, 158);
  boost.innerHTML = `<div style="padding:22px 26px"><div class="mono kicker">Chat · !boost</div><div class="node-title" style="margin-top:10px">6 s without drift</div><div class="node-sub" style="margin-top:6px;font-size:17px">One per viewer · three per mission</div></div>`;
  boost.style.borderColor = 'rgba(198,250,107,0.45)';

  s.update = (t) => {
    const b = beatAt(t);
    steps.forEach(
      (span, i) => (span.style.color = i === b ? 'var(--lime)' : i < b ? '#7d898a' : '#3b474b'),
    );
    show(tracker, 1);
    titles.forEach((tl, i) => {
      const a = beatStarts[i],
        z = beatStarts[i + 1] ?? end + 1;
      const o = (i === 0 ? 1 : prog(t, a - 0.05, a + 0.3)) * (1 - prog(t, z - 0.25, z));
      show(tl, o, { dy: (1 - out3(prog(t, a - 0.05, a + 0.45))) * (i === 0 ? 0 : 14) });
    });
    const current = playEdits(mon, edits, t);
    show(mon.el, 1, { scale: 1 + 0.012 * prog(t, current.start, current.end) });
    const fast = current.speed > 1.05;
    speedChip.textContent = `${current.speed.toFixed(1)}× speed`;
    show(
      speedChip,
      fast
        ? prog(t, current.start, current.start + 0.25) *
            (1 - prog(t, current.end - 0.2, current.end))
        : 0,
    );
    rail.forEach((r, i) => {
      const a = beatStarts[i],
        z = beatStarts[i + 1] ?? end + 1;
      const o = (i === 0 ? 1 : prog(t, a - 0.05, a + 0.3)) * (1 - prog(t, z - 0.25, z));
      const crewActive = current.role === 'crew';
      show(r.crew, o * (crewActive ? 1 : 0.42));
      show(r.pilot, o * (crewActive ? 0.42 : 1));
      r.crew.style.borderColor = crewActive ? 'rgba(131,214,216,0.6)' : 'var(--border)';
      r.pilot.style.borderColor = crewActive ? 'var(--border)' : 'rgba(228,200,121,0.6)';
    });
    results.forEach((r, i) => {
      const z = beatStarts[i + 1];
      rise(r.c, t, r.at, { dur: 0.45, dist: 14, off: z - 0.25, offDur: 0.25 });
    });
    rise(drift, t, 52.0, { dist: 14 });
    rise(boost, t, boostAt, { dur: 0.45, dist: 14 });
  };
}

// ---------- S06 · live chat pipeline ----------
{
  const s = scene('S06');
  const kicker = box(
    el('div', 'abs mono kicker', s.root, 'Twitch EventSub · read-only chat scope'),
    120,
    150,
  );
  const title = box(
    el('div', 'abs display', s.root, 'From a chat message to a game event.'),
    120,
    182,
  );
  title.style.fontSize = '64px';
  const nodes = [
    ['Broadcaster', 'OAuth sign-in', "scope: 'user:read:chat'"],
    ['EventSub', 'WebSocket session', 'channel.chat.message'],
    ['De-duplicate', 'Drops replayed IDs', 'seen.has(message_id)'],
    ['Parse', 'Commands only', '!nav !power !code !dock !boost'],
    ['Mission engine', 'Updates every screen', 'broadcast(room)'],
  ].map(([name, sub, code], i) => {
    const c = box(el('div', 'abs card', s.root), 120 + i * 345, 470, 300, 230);
    c.innerHTML = `<div style="padding:26px 24px"><div class="mono muted">0${i + 1}</div><div class="node-title" style="margin-top:14px">${name}</div><div class="node-sub" style="margin:6px 0 18px">${sub}</div><div class="codechip" style="font-size:${code.length > 24 ? 13 : 15}px">${code}</div></div>`;
    return c;
  });
  const arrows = [0, 1, 2, 3].map((i) => {
    const a = box(el('div', 'abs', s.root), 120 + i * 345 + 300, 584, 45, 2);
    a.style.background = '#2b3a40';
    return a;
  });
  const arrive = [65.6, 67.6, 69.6, 71.6];
  const bubble = el('div', 'abs chip lime mono', s.root, 'Viewer · !boost');
  Object.assign(bubble.style, {
    height: '44px',
    fontSize: '15px',
    background: 'rgba(16,24,14,0.96)',
  });
  const ghost = el('div', 'abs chip coral mono', s.root, `${icon.cross()}Duplicate delivery`);
  Object.assign(ghost.style, {
    height: '40px',
    fontSize: '13px',
    background: 'rgba(34,20,18,0.96)',
  });
  const resilience = [
    'Session migration',
    'Reconnect backoff ≤ 30 s',
    'Hourly token validation',
    'Revocation handling',
  ].map((label, i) => {
    const c = box(
      el('div', 'abs chip quiet mono', s.root, `${icon.check('var(--muted)')}${label}`),
      120 + i * 430,
      860,
    );
    c.style.fontSize = '13px';
    return c;
  });
  const resLabel = box(el('div', 'abs mono muted', s.root, 'Handled on the server'), 120, 822);
  resLabel.style.fontSize = '12px';
  s.update = (t) => {
    rise(kicker, t, 64.2);
    rise(title, t, 64.3, { dist: 22 });
    nodes.forEach((n, i) => {
      rise(n, t, 64.5 + i * 0.12, { dist: 18 });
      const lit = i === 0 ? prog(t, 64.9, 65.3) : prog(t, arrive[i - 1], arrive[i - 1] + 0.3);
      n.style.borderColor =
        lit > 0 ? `rgba(198,250,107,${(0.15 + 0.5 * lit).toFixed(3)})` : 'var(--border)';
    });
    arrows.forEach((a, i) => show(a, prog(t, 64.9 + i * 0.1, 65.4 + i * 0.1)));
    // The message hops node to node, pausing on each.
    let x = 120 + 150;
    const hops = [64.9, ...arrive];
    for (let i = 0; i < hops.length; i++) if (t >= hops[i]) x = 120 + i * 345 + 150;
    for (let i = 1; i < hops.length; i++) {
      const k = inout(prog(t, hops[i] - 0.8, hops[i]));
      if (k > 0 && k < 1) x = 120 + (i - 1 + k) * 345 + 150;
    }
    box(bubble, x - 92, 398);
    show(bubble, prog(t, 64.9, 65.3) * (1 - prog(t, 72.6, 73.0)));
    // A replayed copy reaches the de-duplicator and is dropped.
    const g = inout(prog(t, 67.9, 68.7));
    box(ghost, 120 + 345 + 150 + g * 345 - 110, 722);
    show(ghost, g > 0 ? 1 - prog(t, 69.2, 69.6) : 0);
    resilience.forEach((r, i) => rise(r, t, 72.2 + i * 0.15));
    rise(resLabel, t, 72.1);
  };
}

// ---------- S07 · what is proven ----------
{
  const s = scene('S07');
  const kicker = box(
    el('div', 'abs mono kicker', s.root, 'What this film shows — and what it cannot'),
    120,
    150,
  );
  const title = box(el('div', 'abs display', s.root, 'Tested is not the same as live.'), 120, 182);
  title.style.fontSize = '64px';
  const synthetic = box(el('div', 'abs card', s.root), 120, 330, 820, 440);
  synthetic.style.borderColor = 'rgba(198,250,107,0.35)';
  synthetic.innerHTML = `<div style="padding:38px 40px"><div class="mono kicker">Synthetic validation</div><ul class="list" style="margin-top:30px">
    <li>${icon.check()}<span>This footage: the real app in training mode, with simulated crew messages labelled SIM</span></li>
    <li>${icon.check()}<span>29 unit tests: mission rules and Twitch protocol fixtures</span></li>
    <li>${icon.check()}<span>13 browser tests: complete Cadet and Commander rescues</span></li>
    <li>${icon.check()}<span>CI builds the Docker image and checks its health endpoint</span></li></ul></div>`;
  const real = box(el('div', 'abs card', s.root), 980, 330, 820, 440);
  real.style.border = '1px dashed rgba(228,200,121,0.5)';
  real.innerHTML = `<div style="padding:38px 40px"><div class="mono" style="color:var(--amber)">Real-world validation</div><ul class="list" style="margin-top:30px">
    <li>${icon.ring()}<span>Real viewers typing in a real Twitch chat</span></li>
    <li>${icon.ring()}<span>Needs a live broadcast and the streamer's own Twitch account</span></li>
    <li>${icon.ring()}<span>Not shown in this footage</span></li></ul></div>`;
  const items = [...synthetic.querySelectorAll('li'), ...real.querySelectorAll('li')];
  const foot = box(
    el('div', 'abs mono muted', s.root, 'Test counts from the project’s GitHub CI · October 2026'),
    120,
    812,
  );
  foot.style.fontSize = '12px';
  s.update = (t) => {
    rise(kicker, t, 75.2);
    rise(title, t, 75.3, { dist: 22 });
    rise(synthetic, t, 75.8, { dist: 20 });
    rise(real, t, 76.1, { dist: 20 });
    items.forEach((li, i) => {
      const at = i < 4 ? 76.4 + i * 0.45 : 79.6 + (i - 4) * 0.5;
      const p = out3(prog(t, at, at + 0.5));
      li.style.opacity = p.toFixed(3);
      li.style.transform = `translateY(${((1 - p) * 10).toFixed(2)}px)`;
    });
    rise(foot, t, 80.6);
  };
}

// ---------- S08 · end card ----------
{
  const s = scene('S08');
  const word = box(
    el('div', 'abs', s.root, '<b>SIGNAL</b><span>LOST</span><i>.</i>'),
    0,
    368,
    1920,
  );
  Object.assign(word.style, { textAlign: 'center', fontSize: '128px', letterSpacing: '-0.02em' });
  word.querySelector('b').style.fontWeight = 700;
  word.querySelector('span').style.fontWeight = 300;
  Object.assign(word.querySelector('i').style, { fontStyle: 'normal', color: 'var(--lime)' });
  const line = box(
    el('div', 'abs', s.root, 'The streamer has the controls. Chat has the answers.'),
    0,
    548,
    1920,
  );
  Object.assign(line.style, {
    textAlign: 'center',
    fontSize: '34px',
    color: '#c9cfc4',
    fontWeight: 300,
  });
  const links = box(
    el(
      'div',
      'abs mono',
      s.root,
      `<span class="muted">Play</span>&nbsp;&nbsp;signallost-vpnz.onrender.com<span style="display:inline-block;width:70px"></span><span class="muted">Code</span>&nbsp;&nbsp;github.com/arnavgupta2004/SignalLost`,
    ),
    0,
    668,
    1920,
  );
  Object.assign(links.style, {
    textAlign: 'center',
    fontSize: '18px',
    letterSpacing: '0.12em',
    textTransform: 'none',
  });
  const black = el('div', 'layer', s.root);
  black.style.background = '#000';
  s.update = (t) => {
    rise(word, t, 86.2, { dur: 0.9, dist: 0 });
    word.style.letterSpacing = `${(0.12 - 0.14 * out3(prog(t, 86.2, 87.4))).toFixed(4)}em`;
    rise(line, t, 86.9);
    rise(links, t, 87.4);
    show(black, inout(prog(t, 89.2, 90)));
  };
}

// ---------- frame entry point ----------
async function render(frame) {
  const t = frame / FPS;
  pending.length = 0;
  for (const s of scenes) {
    const o = envelope(t, s.start, s.end);
    s.root.style.opacity = o.toFixed(4);
    s.root.style.visibility = o > 0.001 ? 'visible' : 'hidden';
    if (o > 0.001) s.update(t);
  }
  updateChrome(t);
  grain.style.backgroundImage = grainTiles[Math.floor(frame / 2) % grainTiles.length];
  await Promise.all(pending);
}
await Promise.all(
  [
    '300 20px "DM Sans"',
    '400 20px "DM Sans"',
    '500 20px "DM Sans"',
    '700 20px "DM Sans"',
    '600 20px "Barlow Condensed"',
    '400 20px "IBM Plex Mono"',
    '500 20px "IBM Plex Mono"',
  ].map((f) => document.fonts.load(f)),
);
await document.fonts.ready;
// Lenses and thumbnails request their stills during setup; wait for them once.
await Promise.all([...document.images].map((img) => img.decode().catch(() => {})));
window.__frames = Math.round(T.duration * FPS);
window.__render = render;
window.__ready = true;
