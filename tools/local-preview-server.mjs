/**
 * Localhost-only, dependency-free server for an already-built Tallybook frontend.
 * This serves a LOCAL DEVELOPMENT PREVIEW, not a production-certified release.
 * No /api/sync endpoint is enabled here. Never bind this to a public interface.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const thisDir = path.dirname(fileURLToPath(import.meta.url));
const defaultDist = path.resolve(thisDir, '..', 'dist', 'public');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8', '.wasm': 'application/wasm',
};

export function createPreviewServer({ distRoot = defaultDist } = {}) {
  const root = path.resolve(distRoot);
  return http.createServer(async (req, res) => {
    const respond = (status, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(status, {
        'Content-Type': type, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(req.method === 'HEAD' ? undefined : body);
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return respond(405, 'Local preview is read-only.');
    let url;
    try { url = new URL(req.url ?? '/', 'http://127.0.0.1'); }
    catch { return respond(400, 'Invalid request URL'); }
    if (url.pathname === '/_local/healthz') {
      return respond(200, JSON.stringify({ ready: true, mode: 'unverified-local-preview', cloudSync: false, livePayments: false }), 'application/json');
    }
    if (url.pathname.startsWith('/api/')) {
      return respond(503, JSON.stringify({ error: 'Server features are disabled in this local preview.' }), 'application/json');
    }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return respond(400, 'Invalid URL encoding'); }
    // Disallow hidden assets, encoded separators, and traversal outside dist/public.
    if (pathname.includes('\\') || pathname.includes('\0') || pathname.split('/').some(p => p.startsWith('.') && p !== '.')) {
      return respond(404, 'Not found');
    }
    const requested = path.resolve(root, '.' + pathname);
    if (requested !== root && !requested.startsWith(root + path.sep)) return respond(404, 'Not found');
    let target = requested;
    try {
      const stat = await fs.promises.stat(target);
      if (!stat.isFile()) target = path.join(root, 'index.html');
    } catch (err) {
      if (err?.code !== 'ENOENT') return respond(500, 'Unable to read local preview');
      if (path.extname(pathname)) return respond(404, 'Not found');
      target = path.join(root, 'index.html');
    }
    // Do not follow symlinks into arbitrary files outside the static output.
    let real;
    try { real = await fs.promises.realpath(target); }
    catch { return respond(404, 'Not found'); }
    const realRoot = await fs.promises.realpath(root).catch(() => root);
    if (real !== realRoot && !real.startsWith(realRoot + path.sep)) return respond(404, 'Not found');
    try {
      const data = await fs.promises.readFile(real);
      const extension = path.extname(real).toLowerCase();
      res.writeHead(200, {
        'Content-Type': mimeTypes[extension] ?? 'application/octet-stream',
        'Cache-Control': extension === '.html' || extension === '.webmanifest' ? 'no-store' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'no-referrer',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch { respond(500, 'Unable to read local preview'); }
  });
}

function maybeOpen(url) {
  if (process.platform !== 'win32') return;
  execFile('cmd.exe', ['/d', '/s', '/c', `start "" "${url}"`], { windowsHide: true }, () => {});
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const portText = process.env.TALLYBOOK_PREVIEW_PORT ?? '4173';
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    console.error('Invalid preview port (expected 1024..65535).');
    process.exitCode = 1;
  } else if (!fs.existsSync(path.join(defaultDist, 'index.html'))) {
    console.error('No compiled application found at dist/public/index.html. Run START_TALLYBOOK_WINDOWS.cmd to install and build.');
    process.exitCode = 1;
  } else {
    const server = createPreviewServer();
    server.on('error', e => { console.error('Local preview server could not start:', e.message); process.exitCode = 1; });
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${port}/`;
      console.log('\nTALLYBOOK LOCAL PREVIEW (NOT RELEASE-CERTIFIED)');
      console.log('URL:', url);
      console.log('Local browser data is tied to this exact URL and browser profile.');
      console.log('Cloud sync, live payments, and server APIs are disabled.');
      console.log('Use sample data only until the complete QA suite passes.');
      console.log('Press Ctrl+C to stop.\n');
      if (!process.argv.includes('--no-open')) maybeOpen(url);
    });
  }
}
