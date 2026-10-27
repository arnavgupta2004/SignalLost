import { test, expect, type Page } from '@playwright/test';
import type { RoomState, ServerMessage } from '../../shared/protocol.ts';

async function create(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start training' }).click();
  await expect(page.getByRole('button', { name: 'Launch rescue' })).toBeEnabled();
  return page.url().split('/').at(-1)!;
}
async function getViewerState(page: Page, roomId: string): Promise<RoomState> {
  return page.evaluate(id => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${location.host}/ws`);
    const timer = setTimeout(() => { ws.close(); reject(new Error('Viewer state timeout')); }, 5000);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', roomId: id, role: 'viewer' }));
    ws.onmessage = e => {
      const message = JSON.parse(e.data) as ServerMessage;
      if (message.type === 'state') { clearTimeout(timer); ws.close(); resolve(message.state); }
    };
  }), roomId) as Promise<RoomState>;
}
async function solve(page: Page, roomId: string) {
  const intel = (await getViewerState(page, roomId)).intel!;
  await page.getByRole('button', { name: 'Launch rescue' }).click();
  await expect(page.getByRole('heading', { name: 'Find the corridor' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`CORRIDOR.*${intel.safeSector}`) }).click();
  await expect(page.getByRole('heading', { name: 'Restore the airlock' })).toBeVisible();
  for (let i = 0; i < intel.relayTarget.length; i++) {
    if (intel.relayTarget[i]) {
      await page.getByRole('button', { name: `Relay ${String.fromCharCode(65 + i)}`, exact: true }).click();
      await expect(page.getByRole('button', { name: `Relay ${String.fromCharCode(65 + i)}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    }
  }
  await page.getByRole('button', { name: 'Engage power' }).click();
  await expect(page.getByRole('heading', { name: 'Decode the signal' })).toBeVisible();
  for (let i = 0; i < intel.code.length; i++) {
    await page.getByRole('button', { name: intel.code[i], exact: true }).click();
    await expect(page.locator('.code-slot.filled')).toHaveCount(i + 1);
    // Each new command must pass the deliberate 80ms server input throttle.
    await page.waitForTimeout(100);
  }
  await page.getByRole('button', { name: 'Transmit rescue code' }).click();
  await expect(page.getByRole('heading', { name: 'You brought them home.' })).toBeVisible();
}

test('complete cooperative mission updates pilot, viewer and OBS with no browser errors', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const roomId = await create(page);
  const viewer = await context.newPage();
  await viewer.goto(`/crew/${roomId}`);
  await expect(viewer.getByRole('heading', { name: 'Every signal matters.' })).toBeVisible();
  await expect(viewer.getByText('VIEWERS ONLY', { exact: false })).toBeVisible();
  const overlay = await context.newPage();
  await overlay.goto(`/overlay/${roomId}`);
  await expect(overlay.locator('.overlay-room strong')).toHaveText(`#${roomId}`);
  await solve(page, roomId);
  await expect(viewer.getByRole('heading', { name: 'You brought them home.' })).toBeVisible();
  await expect(overlay.getByRole('heading', { name: 'Six lives saved.' })).toBeVisible();
  expect(errors).toEqual([]);
});
test('training intel is labeled, enlists crew and guides the pilot', async ({ page }) => {
  await create(page);
  await page.getByRole('button', { name: 'Launch rescue' }).click();
  await page.getByRole('button', { name: 'Request simulated intel' }).click();
  await expect(page.locator('.signal-item').first()).toContainText('Echo_Nav');
  await expect(page.locator('.signal-source').first()).toHaveText('SIM');
  await expect(page.locator('.signal-item').first()).toContainText('!nav');
  await expect(page.locator('.crew-names')).toContainText('Echo_Nav');
});
test('viewer cannot operate the cockpit and host token is required', async ({ page }) => {
  const id = await create(page);
  const data = await page.evaluate(id => new Promise<{ before: number; after: number; error: string; hasIntel: boolean }>((resolve, reject) => {
    const socket = new WebSocket(`ws://${location.host}/ws`);
    let initial: RoomState | null = null;
    const timer = setTimeout(() => reject(new Error('timeout')), 5000);
    socket.onopen = () => socket.send(JSON.stringify({ type: 'hello', roomId: id, role: 'viewer' }));
    socket.onmessage = e => {
      const message = JSON.parse(e.data) as ServerMessage;
      if (message.type === 'state' && !initial) {
        initial = message.state;
        socket.send(JSON.stringify({ type: 'start' }));
      } else if (message.type === 'error') {
        clearTimeout(timer); socket.close();
        resolve({ before: initial!.stage, after: initial!.stage, error: message.message, hasIntel: !!initial!.intel });
      }
    };
  }), id);
  expect(data.error).toContain('pilot');
  expect(data.hasIntel).toBe(true);
  const stranger = await page.context().browser()!.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(`http://localhost:3001/host/${id}`);
  await expect(strangerPage.getByText('Pilot access is saved in the browser', { exact: false })).toBeVisible();
  await stranger.close();
});
test('pause freezes controls and countdown, reconnect restores cockpit access', async ({ page }) => {
  await create(page);
  await page.getByRole('button', { name: 'Launch rescue' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.getByText('Mission paused. Your crew can still review the intel.')).toBeVisible();
  const timer = await page.locator('.timer-stat strong').textContent();
  await page.waitForTimeout(1500);
  expect(await page.locator('.timer-stat strong').textContent()).toEqual(timer);
  await expect(page.locator('.sector-button').first()).toBeDisabled();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Resume' })).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.locator('.sector-button').first()).toBeEnabled();
});
test('wrong route shows damage and restart creates a clean mission', async ({ page }) => {
  const roomId = await create(page);
  const intel = (await getViewerState(page, roomId)).intel!;
  await page.getByRole('button', { name: 'Launch rescue' }).click();
  const wrong = intel.sectors.find(s => s.danger)!.name;
  await page.getByRole('button', { name: new RegExp(`CORRIDOR.*${wrong}`) }).click();
  await expect(page.locator('.feedback-error')).toContainText('Unsafe corridor');
  await expect(page.locator('.stat').nth(1).locator('strong')).toContainText('80');
  await page.getByRole('button', { name: 'Restart mission', exact: true }).click();
  await page.getByRole('button', { name: 'New rescue', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Launch rescue' })).toBeVisible();
  await expect(page.locator('.stat').nth(1).locator('strong')).toContainText('100');
});
test('unknown room and denied OAuth callback give actionable errors', async ({ page, request }) => {
  await page.goto('/crew/ZZZZZZ');
  await expect(page.getByRole('heading', { name: 'Uplink unavailable.' })).toBeVisible();
  const response = await request.get('/auth/twitch/callback?state=fake&code=fake');
  expect(response.status()).toBe(400);
  expect(await response.text()).toContain('invalid');
});
test('mobile cockpit and crew panel remain usable without horizontal overflow', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const roomId = await create(page);
  await expect(page.getByRole('button', { name: 'Launch rescue' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Launch rescue' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const viewer = await context.newPage();
  await viewer.setViewportSize({ width: 390, height: 844 });
  await viewer.goto(`/crew/${roomId}`);
  await expect(viewer.getByRole('heading', { name: 'Find the safe way through.' })).toBeVisible();
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await viewer.getByRole('tab', { name: /Signal decoding/ }).click();
  await expect(viewer.getByRole('heading', { name: 'A message between the static.' })).toBeVisible();
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('OBS background is transparent and excludes viewer-only intel', async ({ page }) => {
  const id = await create(page);
  await page.goto(`/overlay/${id}`);
  await expect(page.locator('.obs-overlay')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await expect(page.getByText('VIEWERS ONLY')).toHaveCount(0);
  await expect(page.getByText('CLEAR CORRIDOR')).toHaveCount(0);
});
