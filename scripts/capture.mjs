import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const base = process.env.CAPTURE_URL || 'http://127.0.0.1:4317';
await mkdir('docs/images', { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 1080 },
  reducedMotion: 'reduce',
});
const page = await context.newPage();
async function shot(target, name, fullPage = false) {
  await target.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, 0);
  });
  await target.screenshot({ path: `docs/images/${name}.png`, fullPage });
}
try {
  await page.goto(base);
  await shot(page, 'home', true);
  await page.getByRole('button', { name: 'Start training' }).click();
  await page.getByRole('button', { name: 'Launch rescue' }).waitFor();
  const id = page.url().split('/').at(-1);
  const crew = await context.newPage();
  await crew.goto(`${base}/crew/${id}`);
  await crew.getByRole('heading', { name: 'Find the safe way through.' }).waitFor();
  await page.getByRole('button', { name: 'Launch rescue' }).click();
  await page.getByRole('button', { name: 'Request simulated intel' }).click();
  await page.locator('.signal-item').first().waitFor();
  await shot(page, 'cockpit');
  await shot(crew, 'crew');
  await crew.getByRole('tab', { name: /Engineering/ }).click();
  await shot(crew, 'engineering');
  await crew.getByRole('tab', { name: /Signal decoding/ }).click();
  await shot(crew, 'decoding');
  await crew.setViewportSize({ width: 390, height: 844 });
  await crew.getByRole('tab', { name: /Navigation/ }).click();
  await shot(crew, 'mobile-crew', true);
  const overlay = await context.newPage();
  await overlay.goto(`${base}/overlay/${id}`);
  await overlay.locator('.obs-overlay').waitFor();
  await overlay.screenshot({ path: 'docs/images/overlay.png', omitBackground: true });
  console.log('Captured original application screenshots in docs/images/.');
} finally {
  await browser.close();
}
