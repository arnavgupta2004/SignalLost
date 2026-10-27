import { createReadStream, existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';

export class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
export function text(res: ServerResponse, status: number, body: string) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
export function parseJson(req: IncomingMessage, limit = 4096): Promise<Record<string, unknown>> {
  if (req.headers['content-encoding'] && req.headers['content-encoding'] !== 'identity') throw new RequestError(415, 'Compressed request bodies are not accepted.');
  if (!req.headers['content-type']?.toLowerCase().startsWith('application/json')) throw new RequestError(415, 'Use application/json.');
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > limit) throw new RequestError(413, 'Request body is too large.');
  return new Promise((resolve, reject) => {
    let size = 0;
    let failed = false;
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      if (failed) return;
      size += chunk.length;
      if (size > limit) {
        failed = true; chunks.length = 0; reject(new RequestError(413, 'Request body is too large.')); return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try {
        const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (result === null || Array.isArray(result) || typeof result !== 'object') throw new Error('Invalid object');
        resolve(result);
      } catch { reject(new RequestError(400, 'Invalid JSON object.')); }
    });
    req.on('aborted', () => reject(new RequestError(400, 'Request interrupted.')));
    req.on('error', () => reject(new RequestError(400, 'Request interrupted.')));
  });
}
const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8',
};
export async function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string, dist: string) {
  if (!existsSync(dist)) { text(res, 503, 'Frontend is not built. Use npm run dev, or run npm run build then npm start.'); return; }
  let decoded: string;
  try { decoded = decodeURIComponent(pathname); } catch { throw new RequestError(400, 'Invalid URL.'); }
  if (decoded.includes('\0') || decoded.includes('\\')) throw new RequestError(400, 'Invalid path.');
  let filename = path.resolve(dist, `.${decoded}`);
  if (filename !== dist && !filename.startsWith(dist + path.sep)) throw new RequestError(403, 'Invalid path.');
  let file = await stat(filename).catch(() => null);
  if (!file?.isFile()) {
    if (path.extname(decoded)) { text(res, 404, 'Asset not found.'); return; }
    filename = path.join(dist, 'index.html');
    file = await stat(filename);
  }
  const extension = path.extname(filename);
  res.writeHead(200, {
    'Content-Type': contentTypes[extension] || 'application/octet-stream',
    'Content-Length': file.size,
    'Cache-Control': extension === '.html' ? 'no-cache' : pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  });
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = createReadStream(filename);
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
