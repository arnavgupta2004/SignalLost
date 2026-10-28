// Records authentic SignalLost footage: a complete Commander training rescue, driven through
// the real interface by a pilot window and a crew window. Each step is a separate clip,
// captured with the Chrome DevTools screencast and resampled to a constant 30 fps.
//
// Usage: CAPTURE_URL=http://127.0.0.1:4317 node video/capture/capture.mjs
import { mkdir, rm, writeFile, link, rename } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = process.env.CAPTURE_URL || 'http://127.0.0.1:4317';
// Written to a staging folder and swapped in only after a complete, successful run.
const final = path.resolve('video/build/footage');
const out = `${final}.partial`;
await rm(out, { recursive: true, force: true });
const FPS = 30;
// A 1440×810 desktop layout. The screencast delivers frames at this CSS-pixel size (1440×810),
// not at the 4/3 device scale; recorded rectangles are in 1920-wide device pixels and the
// compositor maps both onto a 1920-wide frame.
const viewport = { width: 1440, height: 810 };
const deviceScaleFactor = 4 / 3;

const cursorScript = () => {
  const install = () => {
    if (document.getElementById('__film-cursor')) return;
    const style = document.createElement('style');
    style.textContent = `
      #__film-cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;
        pointer-events:none;transform:translate(-100px,-100px);will-change:transform}
      #__film-cursor svg{filter:drop-shadow(0 2px 4px rgba(0,0,0,.55))}
      .__film-ring{position:fixed;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;
        border:1.5px solid rgba(198,250,107,.9);pointer-events:none;z-index:2147483646;
        animation:__film-ring .42s ease-out forwards}
      @keyframes __film-ring{from{transform:scale(.35);opacity:1}to{transform:scale(1.25);opacity:0}}`;
    document.head.append(style);
    const cursor = document.createElement('div');
    cursor.id = '__film-cursor';
    cursor.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2 L3 18 L7.5 13.8 L10.6 20.4 L13.4 19.1 L10.4 12.7 L16.6 12.7 Z" fill="#f4f6ee" stroke="#080c11" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    document.body.append(cursor);
    addEventListener(
      'mousemove',
      (e) => (cursor.style.transform = `translate(${e.clientX - 3}px,${e.clientY - 2}px)`),
      true,
    );
    addEventListener(
      'mousedown',
      (e) => {
        const ring = document.createElement('div');
        ring.className = '__film-ring';
        ring.style.left = `${e.clientX}px`;
        ring.style.top = `${e.clientY}px`;
        document.body.append(ring);
        setTimeout(() => ring.remove(), 500);
      },
      true,
    );
  };
  if (document.body) install();
  else addEventListener('DOMContentLoaded', install);
};

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
async function window() {
  const context = await browser.newContext({ viewport, deviceScaleFactor });
  await context.addInitScript(cursorScript);
  const page = await context.newPage();
  page.cursor = { x: viewport.width * 0.62, y: viewport.height * 0.55 };
  return page;
}
const pilot = await window();
const crew = await window();

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const wait = (page, ms) => page.waitForTimeout(ms);
async function glide(page, x, y, ms = 750) {
  const from = { ...page.cursor };
  const steps = Math.max(8, Math.round(ms / 16));
  // A slight arc reads as a hand-held mouse rather than a robotic straight line.
  const bow = Math.min(60, Math.hypot(x - from.x, y - from.y) * 0.08);
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    const lift = Math.sin(Math.PI * k) * bow;
    await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k - lift);
    await page.waitForTimeout(ms / steps);
  }
  page.cursor = { x, y };
}
async function centre(locator) {
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox();
  return { x: box.x + box.width * 0.5, y: box.y + box.height * 0.5 };
}
async function click(page, locator, { ms = 700, settle = 260 } = {}) {
  let target = await centre(locator);
  if (target.y < 70 || target.y > viewport.height - 60) {
    await smoothScroll(page, locator, { offset: viewport.height * 0.55, ms: 800 });
    await wait(page, 200);
    target = await centre(locator);
  }
  await glide(page, target.x, target.y, ms);
  await wait(page, settle);
  recorder.mark('click');
  await page.mouse.down();
  await wait(page, 70);
  await page.mouse.up();
}
async function smoothScroll(page, locator, { offset = 90, ms = 900 } = {}) {
  const top = await locator.evaluate(
    (el, o) => el.getBoundingClientRect().top + scrollY - o,
    offset,
  );
  await page.evaluate(
    ([target, duration]) =>
      new Promise((resolve) => {
        const start = scrollY,
          t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / duration);
          const k = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
          scrollTo({ top: start + (Math.max(0, target) - start) * k, behavior: 'instant' });
          if (p < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    [top, ms],
  );
}

const recorder = {
  session: null,
  frames: [],
  marks: [],
  name: '',
  async start(page, name) {
    await page.bringToFront();
    this.name = name;
    this.frames = [];
    this.marks = [];
    this.rects = {};
    this.session = await page.context().newCDPSession(page);
    this.session.on('Page.screencastFrame', ({ data, sessionId }) => {
      this.frames.push({ time: Date.now(), data });
      void this.session.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
    });
    await this.session.send('Page.startScreencast', {
      format: 'jpeg',
      quality: 94,
      maxWidth: 1920,
      maxHeight: 1080,
    });
    // Nudge the compositor so the first frame exists even on a static page.
    await page.mouse.move(page.cursor.x, page.cursor.y);
    await wait(page, 120);
    this.t0 = Date.now();
  },
  mark(kind) {
    this.marks.push({ kind, time: (Date.now() - this.t0) / 1000 });
  },
  // Where an element sits in the recorded frame (device pixels) at this moment.
  async rect(name, locator) {
    const box = await locator.boundingBox();
    const k = deviceScaleFactor;
    this.rects[name] = {
      time: (Date.now() - this.t0) / 1000,
      x: Math.round(box.x * k),
      y: Math.round(box.y * k),
      w: Math.round(box.width * k),
      h: Math.round(box.height * k),
    };
  },
  async stop() {
    const t1 = Date.now();
    await this.session.send('Page.stopScreencast');
    await this.session.detach();
    const dir = path.join(out, this.name);
    await rm(dir, { recursive: true, force: true });
    await mkdir(path.join(dir, 'raw'), { recursive: true });
    const raw = [];
    for (const [i, frame] of this.frames.entries()) {
      const file = path.join(dir, 'raw', `${String(i).padStart(5, '0')}.jpg`);
      await writeFile(file, Buffer.from(frame.data, 'base64'));
      raw.push({ file, time: frame.time });
    }
    // Resample by wall-clock time: each output frame shows the latest captured frame.
    const count = Math.floor(((t1 - this.t0) / 1000) * FPS);
    let source = 0;
    for (let i = 0; i < count; i++) {
      const at = this.t0 + (i * 1000) / FPS;
      while (source + 1 < raw.length && raw[source + 1].time <= at) source++;
      await link(raw[source].file, path.join(dir, `f${String(i).padStart(5, '0')}.jpg`));
    }
    const manifest = {
      name: this.name,
      fps: FPS,
      frames: count,
      duration: count / FPS,
      marks: this.marks,
      rects: this.rects,
    };
    await writeFile(path.join(dir, 'clip.json'), JSON.stringify(manifest, null, 2));
    console.log(`${this.name}: ${manifest.duration.toFixed(2)} s, ${raw.length} unique frames`);
    return manifest;
  },
};

async function viewerState(roomId) {
  return crew.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(
          `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`,
        );
        const timer = setTimeout(() => reject(new Error('Viewer state timeout')), 5000);
        ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', roomId: id, role: 'viewer' }));
        ws.onmessage = (e) => {
          const message = JSON.parse(e.data);
          if (message.type === 'state') {
            clearTimeout(timer);
            ws.close();
            resolve(message.state);
          }
        };
      }),
    roomId,
  );
}
async function simulatedIntel() {
  const button = pilot.getByRole('button', { name: 'Request simulated intel' });
  await button.waitFor({ state: 'visible' });
  while (!(await button.isEnabled())) await wait(pilot, 100);
  const received = () =>
    pilot
      .getByText(/\d+ signals received/)
      .textContent()
      .then((t) => Number.parseInt(t, 10));
  const before = await received();
  await click(pilot, button);
  const deadline = Date.now() + 3000;
  while ((await received()) === before) {
    if (Date.now() > deadline) throw new Error(`${recorder.name}: simulated intel did not arrive`);
    await wait(pilot, 50);
  }
  await wait(pilot, 900);
}
const ready = (page) => page.evaluate(() => document.fonts.ready.then(() => true));
const heading = (page, name) => page.getByRole('heading', { name });

await mkdir(out, { recursive: true });
const manifests = [];
try {
  // Home and lobby.
  await pilot.goto(base);
  await ready(pilot);
  await recorder.start(pilot, 'home');
  await wait(pilot, 1200);
  await click(pilot, pilot.getByRole('button', { name: 'Start training' }), {
    ms: 1100,
    settle: 500,
  });
  await pilot.getByRole('button', { name: 'Launch rescue' }).waitFor();
  await ready(pilot);
  await wait(pilot, 900);
  await click(pilot, pilot.getByRole('button', { name: /Commander.*05:00/ }), { ms: 900 });
  await wait(pilot, 1000);
  manifests.push(await recorder.stop());

  const roomId = pilot.url().split('/').at(-1);
  await crew.goto(`${base}/crew/${roomId}`);
  await heading(crew, 'Find the safe way through.').waitFor();
  await ready(crew);
  const { intel, decoderOrder } = await viewerState(roomId);
  await writeFile(
    path.join(out, 'mission.json'),
    JSON.stringify({ roomId, decoderOrder, ...intel }, null, 2),
  );

  await recorder.start(pilot, 'launch');
  await wait(pilot, 500);
  await click(pilot, pilot.getByRole('button', { name: 'Launch rescue' }), { ms: 900 });
  await heading(pilot, 'Find the corridor').waitFor();
  recorder.mark('success');
  await wait(pilot, 2200);
  manifests.push(await recorder.stop());

  // System 01 — navigation.
  await recorder.start(crew, 'nav_crew');
  await wait(crew, 600);
  await smoothScroll(crew, crew.locator('.readings-head'), { offset: 210, ms: 1100 });
  await recorder.rect('readings', crew.locator('.navigation-readings'));
  for (const reading of intel.readings)
    await recorder.rect(
      reading.sector,
      crew.getByRole('button', { name: `Propose ${reading.sector}` }),
    );
  await wait(crew, 1600);
  await click(crew, crew.getByRole('button', { name: `Propose ${intel.safeSector}` }));
  await wait(crew, 700);
  await smoothScroll(crew, crew.locator('.intel-command'), { offset: 260, ms: 900 });
  await wait(crew, 1500);
  manifests.push(await recorder.stop());

  // Park the cursor away from the flight limits before this clip starts.
  await glide(pilot, 1180, 120, 400);
  await recorder.start(pilot, 'nav_pilot');
  await recorder.rect('limits', pilot.locator('.navigation-limits'));
  await wait(pilot, 500);
  await simulatedIntel();
  await wait(pilot, 900);
  await smoothScroll(pilot, pilot.getByText('Select a flight corridor', { exact: false }), {
    offset: 330,
    ms: 1000,
  });
  await wait(pilot, 500);
  await click(
    pilot,
    pilot.getByRole('button', { name: new RegExp(`CORRIDOR.*${intel.safeSector}`) }),
    { ms: 900 },
  );
  await heading(pilot, 'Restore the airlock').waitFor();
  recorder.mark('success');
  await pilot.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await wait(pilot, 1800);
  manifests.push(await recorder.stop());

  // System 02 — power.
  await crew.bringToFront();
  const engineering = crew.getByRole('tab', { name: /Engineering/ });
  if ((await engineering.getAttribute('aria-selected')) !== 'true') await engineering.click();
  await crew.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await recorder.start(crew, 'power_crew');
  await wait(crew, 500);
  await smoothScroll(crew, crew.locator('.engineering-rules'), { offset: 150, ms: 1100 });
  await wait(crew, 2200);
  for (let i = 0; i < 4; i++)
    if (intel.relayTarget[i]) {
      await click(
        crew,
        crew.getByRole('button', { name: `Propose relay ${String.fromCharCode(65 + i)}` }),
        { ms: 650 },
      );
      await wait(crew, 450);
    }
  await smoothScroll(crew, crew.locator('.intel-command'), { offset: 300, ms: 900 });
  await wait(crew, 1400);
  manifests.push(await recorder.stop());

  await recorder.start(pilot, 'power_pilot');
  await wait(pilot, 400);
  await simulatedIntel();
  await smoothScroll(pilot, pilot.locator('.relay-controls'), { offset: 230, ms: 1000 });
  await wait(pilot, 500);
  for (let i = 0; i < 4; i++)
    if (intel.relayTarget[i]) {
      const relay = pilot.getByRole('button', {
        name: `Relay ${String.fromCharCode(65 + i)}`,
        exact: true,
      });
      await click(pilot, relay, { ms: 650 });
      while ((await relay.getAttribute('aria-pressed')) !== 'true') await wait(pilot, 40);
      await wait(pilot, 400);
    }
  await click(pilot, pilot.getByRole('button', { name: 'Engage power' }), { ms: 800 });
  await heading(pilot, 'Decode the signal').waitFor();
  recorder.mark('success');
  await pilot.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await wait(pilot, 1800);
  manifests.push(await recorder.stop());

  // System 03 — decoding.
  await crew.bringToFront();
  const decoding = crew.getByRole('tab', { name: /Signal decoding/ });
  if ((await decoding.getAttribute('aria-selected')) !== 'true') await decoding.click();
  await crew.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await recorder.start(crew, 'decode_crew');
  await wait(crew, 500);
  await smoothScroll(crew, crew.getByRole('button', { name: intel.code[0], exact: true }).first(), {
    offset: 330,
    ms: 1100,
  });
  await wait(crew, 1800);
  for (const glyph of intel.code) {
    await click(crew, crew.getByRole('button', { name: glyph, exact: true }).first(), { ms: 600 });
    await wait(crew, 380);
  }
  await smoothScroll(crew, crew.locator('.assembled-code'), { offset: 300, ms: 800 });
  await wait(crew, 1600);
  manifests.push(await recorder.stop());

  await recorder.start(pilot, 'decode_pilot');
  await wait(pilot, 400);
  await simulatedIntel();
  await smoothScroll(pilot, pilot.locator('.code-slots'), { offset: 330, ms: 1000 });
  await wait(pilot, 900);
  for (let i = 0; i < 4; i++) {
    await click(
      pilot,
      pilot.getByRole('button', { name: intel.code[decoderOrder[i]], exact: true }),
      { ms: 600 },
    );
    while ((await pilot.locator('.code-slot.filled').count()) !== i + 1) await wait(pilot, 40);
    await wait(pilot, 300);
  }
  await click(pilot, pilot.getByRole('button', { name: 'Transmit rescue code' }), { ms: 750 });
  await heading(pilot, 'Bring them aboard').waitFor();
  recorder.mark('success');
  await wait(pilot, 1200);
  manifests.push(await recorder.stop());

  // System 04 — extraction. The crew sees the safe lane; the pilot flies it.
  await crew.bringToFront();
  await crew.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await recorder.start(crew, 'dock_crew');
  await wait(crew, 500);
  await smoothScroll(crew, crew.locator('.crew-lanes'), { offset: 260, ms: 1000 });
  await wait(crew, 2200);
  manifests.push(await recorder.stop());

  await recorder.start(pilot, 'dock_pilot');
  await wait(pilot, 300);
  await simulatedIntel();
  await smoothScroll(pilot, pilot.locator('.docking-console'), { offset: 175, ms: 1000 });
  const target = [-70, -35, 0, 35, 70][intel.dockingLane];
  const engage = pilot.getByRole('button', { name: 'Engage tractor', exact: true });
  const boost = pilot.getByRole('button', { name: /Simulate crew boost/ });
  await glide(pilot, ...Object.values(await centre(engage)), 900);
  let pressed = null,
    boosted = false;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (await heading(pilot, 'You brought them home.').isVisible()) break;
    const position = Number(await pilot.getByTestId('ship-position').textContent());
    const desired = position > target + 6 ? 'a' : position < target - 6 ? 'd' : null;
    if (desired !== pressed) {
      if (pressed) await pilot.keyboard.up(pressed);
      if (desired) await pilot.keyboard.down(desired);
      pressed = desired;
    }
    if (Math.abs(position - target) <= 10 && (await engage.isVisible())) {
      await click(pilot, engage, { ms: 300, settle: 120 });
      recorder.mark('tractor');
    } else if (!boosted && !(await engage.isVisible())) {
      await wait(pilot, 1400);
      await click(pilot, boost, { ms: 800, settle: 200 });
      recorder.mark('boost');
      boosted = true;
    }
    await wait(pilot, 80);
  }
  if (pressed) await pilot.keyboard.up(pressed);
  await heading(pilot, 'You brought them home.').waitFor();
  recorder.mark('success');
  await wait(pilot, 1500);
  manifests.push(await recorder.stop());

  await pilot.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
  await recorder.start(pilot, 'debrief');
  await wait(pilot, 1500);
  await smoothScroll(pilot, pilot.locator('.debrief-heroes'), { offset: 200, ms: 2200 });
  await wait(pilot, 1500);
  manifests.push(await recorder.stop());

  // Stream overlay still, as OBS renders it (transparent background).
  const overlay = await pilot.context().newPage();
  await overlay.goto(`${base}/overlay/${roomId}`);
  await overlay.locator('.obs-overlay').waitFor();
  await ready(overlay);
  await overlay.screenshot({ path: path.join(out, 'overlay.png'), omitBackground: true });

  await writeFile(path.join(out, 'clips.json'), JSON.stringify(manifests, null, 2));
  await rm(final, { recursive: true, force: true });
  await rename(out, final);
} finally {
  await browser.close();
}
