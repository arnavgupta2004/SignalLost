// Renders the compositor frame by frame into H.264.
//   node video/render/render.mjs                 → video/build/picture.mp4 (no audio)
//   node video/render/render.mjs --stills 0,300  → PNG stills in video/build/stills/ for QA
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { chromium } from '@playwright/test';

const root = path.resolve('.');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};
// Only the compositor, its data, the captured footage and the bundled fonts are served.
const allowed = [
  '/video/compositor/',
  '/video/timeline.json',
  '/video/build/',
  '/node_modules/@fontsource/',
];
const server = createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  const file = path.join(root, url);
  if (!allowed.some((p) => url.startsWith(p)) || !file.startsWith(root))
    return res.writeHead(403).end();
  try {
    if (!(await stat(file)).isFile()) throw new Error();
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
page.on('response', (r) => r.status() >= 400 && errors.push(`${r.status()} ${r.url()}`));
await page.goto(`${base}/video/compositor/index.html`);
await page
  .waitForFunction(() => window.__ready === true, null, { timeout: 60_000 })
  .catch(() => {
    throw new Error(`Compositor failed to start: ${errors.join('; ')}`);
  });
const total = await page.evaluate(() => window.__frames);
// Direct DevTools capture: lossless PNG, several times faster than an element screenshot.
const cdp = await page.context().newCDPSession(page);
const capture = async (frame) => {
  await page.evaluate((f) => window.__render(f), frame);
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    optimizeForSpeed: true,
    clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 },
  });
  return Buffer.from(data, 'base64');
};

const stillsArg = process.argv.indexOf('--stills');
try {
  if (stillsArg > 0) {
    const frames = process.argv[stillsArg + 1].split(',').map(Number);
    await mkdir('video/build/stills', { recursive: true });
    for (const f of frames)
      await writeFile(`video/build/stills/f${String(f).padStart(5, '0')}.png`, await capture(f));
    console.log(`Wrote ${frames.length} stills to video/build/stills/`);
  } else {
    const ffmpeg = spawn(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-f',
        'image2pipe',
        '-framerate',
        '30',
        '-c:v',
        'png',
        '-i',
        '-',
        '-vf',
        'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '15',
        '-profile:v',
        'high',
        '-tune',
        'film',
        '-g',
        '60',
        '-bf',
        '2',
        '-r',
        '30',
        '-fps_mode',
        'cfr',
        '-color_primaries',
        'bt709',
        '-color_trc',
        'bt709',
        '-colorspace',
        'bt709',
        '-color_range',
        'tv',
        '-movflags',
        '+faststart',
        'video/build/picture.mp4',
      ],
      { stdio: ['pipe', 'inherit', 'inherit'] },
    );
    const done = new Promise((resolve, reject) =>
      ffmpeg.on('close', (code) => (code ? reject(new Error(`ffmpeg exited ${code}`)) : resolve())),
    );
    const started = Date.now();
    for (let f = 0; f < total; f++) {
      const png = await capture(f);
      if (!ffmpeg.stdin.write(png)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
      if (f % 150 === 0)
        console.log(`frame ${f}/${total} · ${((Date.now() - started) / 1000).toFixed(0)} s`);
    }
    ffmpeg.stdin.end();
    await done;
    console.log(`Rendered ${total} frames to video/build/picture.mp4`);
  }
  if (errors.length) throw new Error(`Compositor reported errors:\n${errors.join('\n')}`);
} finally {
  await browser.close();
  server.close();
}
