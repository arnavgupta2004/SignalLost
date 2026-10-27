import { mkdir, copyFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.CAPTURE_URL || 'http://127.0.0.1:4317';
const videoEnabled = process.env.CAPTURE_VIDEO === '1';
await mkdir('docs/images', { recursive: true });
if (videoEnabled) await mkdir('.local/rehearsal', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  ...(videoEnabled
    ? { recordVideo: { dir: '.local/rehearsal', size: { width: 1440, height: 1080 } } }
    : { reducedMotion: 'reduce' }),
});
const page = await context.newPage();
const video = page.video();
let completed = false;
async function shot(target, name, fullPage = false) {
  await target.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await target.waitForTimeout(videoEnabled ? 800 : 200);
  if (!videoEnabled) await target.screenshot({ path: `docs/images/${name}.png`, fullPage });
}
async function snapshot(roomId) {
  return page.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const socket = new WebSocket(
          `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
        );
        const timer = setTimeout(() => {
          socket.close();
          reject(new Error('Crew snapshot timed out'));
        }, 5000);
        socket.onopen = () =>
          socket.send(JSON.stringify({ type: 'hello', roomId: id, role: 'viewer' }));
        socket.onmessage = (e) => {
          const message = JSON.parse(e.data);
          if (message.type === 'state') {
            clearTimeout(timer);
            socket.close();
            resolve(message.state);
          }
        };
      }),
    roomId,
  );
}
async function crewSignal() {
  const button = page.getByRole('button', { name: 'Request simulated intel' });
  await button.waitFor({ state: 'visible' });
  while (!(await button.isEnabled())) await page.waitForTimeout(100);
  await button.click();
  await page.waitForTimeout(300);
}
try {
  await page.goto(base);
  await shot(page, 'home', true);
  await page.getByRole('button', { name: 'Start training' }).click();
  await page.getByRole('button', { name: 'Launch rescue' }).waitFor();
  await page.getByRole('button', { name: /Commander.*05:00/ }).click();
  await page.waitForTimeout(300);
  const id = page.url().split('/').at(-1);
  const initial = await snapshot(id);
  const intel = initial.intel;
  const crew = await context.newPage();
  await crew.goto(`${base}/crew/${id}`);
  await crew.getByRole('heading', { name: 'Find the safe way through.' }).waitFor();
  await page.getByRole('button', { name: 'Launch rescue' }).click();
  await page.getByRole('button', { name: 'Broadcast layout', exact: true }).click();
  await crewSignal();
  await shot(page, 'cockpit');
  await crew.getByRole('button', { name: `Propose ${intel.safeSector}` }).click();
  await shot(crew, 'crew', true);
  await crew.getByRole('tab', { name: /Engineering/ }).click();
  for (let i = 0; i < 4; i++)
    if (intel.relayTarget[i])
      await crew
        .getByRole('button', { name: `Propose relay ${String.fromCharCode(65 + i)}` })
        .click();
  await shot(crew, 'engineering', true);
  await crew.getByRole('tab', { name: /Signal decoding/ }).click();
  for (const glyph of intel.code)
    await crew.getByRole('button', { name: glyph, exact: true }).click();
  await shot(crew, 'decoding', true);
  await page.getByRole('button', { name: new RegExp(`CORRIDOR.*${intel.safeSector}`) }).click();
  await page.getByRole('heading', { name: 'Restore the airlock' }).waitFor();
  await crewSignal();
  for (let i = 0; i < 4; i++)
    if (intel.relayTarget[i]) {
      const button = page.getByRole('button', {
        name: `Relay ${String.fromCharCode(65 + i)}`,
        exact: true,
      });
      await button.click();
      while ((await button.getAttribute('aria-pressed')) !== 'true') await page.waitForTimeout(50);
    }
  await page.getByRole('button', { name: 'Engage power' }).click();
  await page.getByRole('heading', { name: 'Decode the signal' }).waitFor();
  await crewSignal();
  await shot(page, 'pilot-decoding');
  for (let i = 0; i < 4; i++) {
    await page
      .getByRole('button', { name: intel.code[initial.decoderOrder[i]], exact: true })
      .click();
    while ((await page.locator('.code-slot.filled').count()) !== i + 1)
      await page.waitForTimeout(50);
  }
  await page.getByRole('button', { name: 'Transmit rescue code' }).click();
  await page.getByRole('heading', { name: 'Bring them aboard' }).waitFor();
  await crewSignal();
  await shot(crew, 'extraction-intel', true);
  await crew.setViewportSize({ width: 390, height: 844 });
  await shot(crew, 'mobile-crew', true);
  await crew.setViewportSize({ width: 1440, height: 1080 });
  const target = [-70, -35, 0, 35, 70][intel.dockingLane];
  let pressed = null,
    engaged = false,
    boosted = false,
    captured = false;
  const deadline = Date.now() + 22_000;
  while (Date.now() < deadline) {
    if (await page.getByRole('heading', { name: 'You brought them home.' }).isVisible()) break;
    const position = await page.evaluate(() =>
      Number(document.querySelector('[data-testid="ship-position"]')?.textContent ?? 'NaN'),
    );
    if (!Number.isFinite(position)) break;
    const desired =
      position > target + 6 ? 'ArrowLeft' : position < target - 6 ? 'ArrowRight' : null;
    if (desired !== pressed) {
      if (pressed) await page.keyboard.up(pressed);
      if (desired) await page.keyboard.down(desired);
      pressed = desired;
    }
    if (Math.abs(position - target) <= 10 && !engaged) {
      await page.getByRole('button', { name: 'Engage tractor', exact: true }).click();
      engaged = true;
    }
    if (engaged && !boosted) {
      await page.getByRole('button', { name: /Simulate crew boost/ }).click();
      boosted = true;
    }
    const progress = await page
      .locator('.docking-instruments strong')
      .first()
      .textContent()
      .catch(() => '100');
    if (!captured && Number.parseInt(progress, 10) >= 35) {
      await shot(page, 'docking');
      captured = true;
    }
    await page.waitForTimeout(100);
  }
  if (pressed) await page.keyboard.up(pressed);
  await page.getByRole('heading', { name: 'You brought them home.' }).waitFor();
  await shot(page, 'debrief', true);
  const overlay = await context.newPage();
  await overlay.goto(`${base}/overlay/${id}`);
  await overlay.locator('.obs-overlay').waitFor();
  if (!videoEnabled)
    await overlay.screenshot({ path: 'docs/images/overlay.png', omitBackground: true });
  completed = true;
  console.log(
    'Captured Commander training, extraction, and crew-home screenshots in docs/images/.',
  );
} finally {
  await context.close();
  if (videoEnabled && video && completed) {
    await copyFile(await video.path(), '.local/SignalLost-quality-rehearsal.webm');
    console.log('Private training rehearsal: .local/SignalLost-quality-rehearsal.webm');
  }
  await browser.close();
}
