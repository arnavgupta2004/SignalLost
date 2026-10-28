import { test, expect, type Page } from '@playwright/test';
import type { RoomState, ServerMessage } from '../../shared/protocol.ts';

async function create(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start training' }).click();
  await expect(page.getByRole('button', { name: 'Launch rescue' })).toBeEnabled();
  return page.url().split('/').at(-1)!;
}
async function getViewerState(page: Page, roomId: string): Promise<RoomState> {
  return page.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(`ws://${location.host}/ws`);
        const timer = setTimeout(() => {
          ws.close();
          reject(new Error('Viewer state timeout'));
        }, 5000);
        ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', roomId: id, role: 'viewer' }));
        ws.onmessage = (e) => {
          const message = JSON.parse(e.data) as ServerMessage;
          if (message.type === 'state') {
            clearTimeout(timer);
            ws.close();
            resolve(message.state);
          }
        };
      }),
    roomId,
  ) as Promise<RoomState>;
}
async function solve(
  page: Page,
  roomId: string,
  finish = true,
  beforeDecode?: () => Promise<void>,
) {
  const initial = await getViewerState(page, roomId);
  const intel = initial.intel!;
  await page.getByRole('button', { name: 'Launch rescue' }).click();
  await expect(page.getByRole('heading', { name: 'Find the corridor' })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(`CORRIDOR.*${intel.safeSector}`) }).click();
  await expect(page.getByRole('heading', { name: 'Restore the airlock' })).toBeVisible();
  for (let i = 0; i < intel.relayTarget.length; i++) {
    if (intel.relayTarget[i]) {
      await page
        .getByRole('button', { name: `Relay ${String.fromCharCode(65 + i)}`, exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: `Relay ${String.fromCharCode(65 + i)}`, exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
    }
  }
  await page.getByRole('button', { name: 'Engage power' }).click();
  await expect(page.getByRole('heading', { name: 'Decode the signal' })).toBeVisible();
  if (beforeDecode) await beforeDecode();
  for (let i = 0; i < intel.code.length; i++) {
    await page
      .getByRole('button', { name: intel.code[initial.decoderOrder[i]], exact: true })
      .click();
    await expect(page.locator('.code-slot.filled')).toHaveCount(i + 1);
  }
  await page.getByRole('button', { name: 'Transmit rescue code' }).click();
  await expect(page.getByRole('heading', { name: 'Bring them aboard' })).toBeVisible();
  if (!finish) return;
  await flyDocking(page, intel.dockingLane);
  await expect(page.getByRole('heading', { name: 'You brought them home.' })).toBeVisible();
}

test('commander requires crew proposals and combines band meanings with pilot order', async ({
  page,
  context,
}) => {
  // A full rescue plus docking can exceed the default timeout on slow CI runners.
  test.slow();
  const roomId = await create(page);
  await page.getByRole('button', { name: /Commander.*05:00/ }).click();
  await expect(page.getByRole('button', { name: /Commander.*05:00/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const state = await getViewerState(page, roomId);
  const viewer = await context.newPage();
  await viewer.goto(`/crew/${roomId}`);
  await expect(viewer.getByRole('button', { name: 'Copy signal' })).toBeDisabled();
  await expect(viewer.getByText('CLEAR CORRIDOR', { exact: true })).toHaveCount(0);
  await viewer.getByRole('button', { name: `Propose ${state.intel!.safeSector}` }).click();
  await expect(viewer.getByRole('button', { name: 'Copy signal' })).toBeEnabled();
  await viewer.getByRole('tab', { name: /Engineering/ }).click();
  await expect(viewer.locator('.engineering-rules > div')).toHaveCount(4);
  for (let i = 0; i < 4; i++)
    if (state.intel!.relayTarget[i])
      await viewer
        .getByRole('button', { name: `Propose relay ${String.fromCharCode(65 + i)}` })
        .click();
  await expect(viewer.getByRole('button', { name: 'Copy signal' })).toBeEnabled();
  await viewer.getByRole('tab', { name: /Signal decoding/ }).click();
  for (const glyph of state.intel!.code)
    await viewer.getByRole('button', { name: glyph, exact: true }).click();
  await expect(viewer.locator('.intel-command code')).toContainText(`A:${state.intel!.code[0]}`);
  await solve(page, roomId, true, async () => {
    await expect(viewer.locator('.assembled-code code')).toContainText(`A:${state.intel!.code[0]}`);
  });
  await expect(page.getByText('Commander flight', { exact: true })).toBeVisible();
  await expect(page.locator('.flight-recorder')).toContainText('Echo_Nav');
  await expect(page.locator('.debrief .survivor-faces strong')).toHaveCount(6);
});
test('mobile docking releases captured steering and disarms controls when the pilot leaves', async ({
  page,
  context,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const roomId = await create(page);
  await solve(page, roomId, false);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const button = page.getByRole('button', { name: 'Steer left', exact: true });
  await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await expect
    .poll(async () => Number(await page.getByTestId('ship-position').textContent()))
    .toBeLessThan(-4);
  await page.mouse.move(2, 2);
  await page.mouse.up();
  await page.waitForTimeout(350);
  const stopped = await page.getByTestId('ship-position').textContent();
  await page.waitForTimeout(400);
  expect(await page.getByTestId('ship-position').textContent()).toBe(stopped);
  const viewer = await context.newPage();
  await viewer.setViewportSize({ width: 390, height: 844 });
  await viewer.goto(`/crew/${roomId}`);
  await expect(viewer.locator('.crew-lanes .safe')).toHaveCount(1);
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Engage tractor', exact: true }).click();
  await page.goto('/');
  await expect.poll(async () => (await getViewerState(viewer, roomId)).docking.tractor).toBe(false);
});
async function flyDocking(page: Page, lane: number) {
  const target = [-70, -35, 0, 35, 70][lane];
  let pressed: 'ArrowLeft' | 'ArrowRight' | null = null;
  let engaged = false;
  let boosted = false;
  const deadline = Date.now() + 45_000;
  try {
    while (Date.now() < deadline) {
      if (await page.getByRole('heading', { name: 'You brought them home.' }).isVisible()) return;
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
      await page.waitForTimeout(100);
    }
    await expect(page.getByRole('heading', { name: 'You brought them home.' })).toBeVisible();
  } finally {
    if (pressed) await page.keyboard.up(pressed);
  }
}

test('complete cooperative mission updates pilot, viewer and OBS with no browser errors', async ({
  page,
  context,
}) => {
  // A full rescue plus docking can exceed the default timeout on slow CI runners.
  test.slow();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
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
  await expect(page.locator('.readback-findings .leading strong')).toHaveText(/KESTREL|ORION|VEGA/);
  await expect(page.locator('.readback-findings .leading span')).toHaveText('1/1');
});
test('viewer cannot operate the cockpit and host token is required', async ({ page }) => {
  const id = await create(page);
  const data = await page.evaluate(
    (id) =>
      new Promise<{ before: number; after: number; error: string; hasIntel: boolean }>(
        (resolve, reject) => {
          const socket = new WebSocket(`ws://${location.host}/ws`);
          let initial: RoomState | null = null;
          const timer = setTimeout(() => reject(new Error('timeout')), 5000);
          socket.onopen = () =>
            socket.send(JSON.stringify({ type: 'hello', roomId: id, role: 'viewer' }));
          socket.onmessage = (e) => {
            const message = JSON.parse(e.data) as ServerMessage;
            if (message.type === 'state' && !initial) {
              initial = message.state;
              socket.send(JSON.stringify({ type: 'start' }));
            } else if (message.type === 'error') {
              clearTimeout(timer);
              socket.close();
              resolve({
                before: initial!.stage,
                after: initial!.stage,
                error: message.message,
                hasIntel: !!initial!.intel,
              });
            }
          };
        },
      ),
    id,
  );
  expect(data.error).toContain('pilot');
  expect(data.hasIntel).toBe(true);
  const stranger = await page.context().browser()!.newContext();
  const strangerPage = await stranger.newPage();
  await strangerPage.goto(`http://127.0.0.1:4317/host/${id}`);
  await expect(
    strangerPage.getByText('Pilot access is saved in the browser', { exact: false }),
  ).toBeVisible();
  await stranger.close();
});
test('pause freezes controls and countdown, reconnect restores cockpit access', async ({
  page,
}) => {
  await create(page);
  await page.getByRole('button', { name: 'Launch rescue' }).click();
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(
    page.getByText('Mission paused. Your crew can still review the intel.'),
  ).toBeVisible();
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
  const wrong = intel.sectors.find((s) => s.danger)!.name;
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
test('mobile cockpit and crew panel remain usable without horizontal overflow', async ({
  page,
  context,
}) => {
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
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
  await viewer.getByRole('tab', { name: /Signal decoding/ }).click();
  await expect(
    viewer.getByRole('heading', { name: 'A message between the static.' }),
  ).toBeVisible();
  expect(await viewer.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
    true,
  );
});
test('OBS background is transparent and excludes viewer-only intel', async ({ page }) => {
  const id = await create(page);
  await page.goto(`/overlay/${id}`);
  await expect(page.locator('.obs-overlay')).toBeVisible();
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    'rgba(0, 0, 0, 0)',
  );
  await expect(page.getByText('VIEWERS ONLY')).toHaveCount(0);
  await expect(page.getByText('CLEAR CORRIDOR')).toHaveCount(0);
});
test('HTTP parser rejects compressed, oversized and malformed JSON without crashing', async ({
  request,
}) => {
  const compressed = await request.post('/api/rooms', {
    headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
    data: '{}',
  });
  expect(compressed.status()).toBe(415);
  const oversized = await request.post('/api/rooms', { data: { text: 'x'.repeat(5000) } });
  expect(oversized.status()).toBe(413);
  const malformed = await request.post('/api/rooms', {
    headers: { 'Content-Type': 'application/json' },
    data: '{invalid',
  });
  expect(malformed.status()).toBe(400);
  expect((await request.get('/api/health')).ok()).toBe(true);
});
test('Twitch connection management rejects callers without pilot authorization', async ({
  page,
  request,
}) => {
  const id = await create(page);
  const response = await request.post(`/api/rooms/${id}/twitch`, { data: {} });
  expect(response.status()).toBe(403);
  const info = await (await request.get(`/api/rooms/${id}`)).json();
  expect(info.hostToken).toBeUndefined();
  expect(info.intel).toBeUndefined();
});
test('room-code dialog keeps keyboard focus and successfully joins an existing crew', async ({
  page,
}) => {
  const roomId = await create(page);
  await page.getByRole('link', { name: 'SignalLost home' }).click();
  await page.getByRole('button', { name: 'Join a crew' }).click();
  const input = page.getByRole('textbox', { name: 'RESCUE ROOM CODE' });
  await expect(input).toBeFocused();
  await input.pressSequentially(roomId, { delay: 20 });
  await expect(input).toHaveValue(roomId);
  await expect(input).toBeFocused();
  await page.getByRole('button', { name: 'Get my intel' }).click();
  await expect(page.getByRole('heading', { name: 'Every signal matters.' })).toBeVisible();
});
