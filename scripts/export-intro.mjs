// Render the 9:16 intro to MP4 for socials: 1080x1920, 30 fps, one file per language, with the intro's
// sound effects mixed in, plus a silent copy of each for adding your own music.
//
//   npm run build && npm run export-intro
//
// Deterministic: the built site is served locally, the intro's own timeline is paused and seeked
// frame by frame (no real-time playback), each frame is screenshotted in headless Chrome and piped
// to ffmpeg. Needs Google Chrome (or Edge) and ffmpeg on PATH (or set FFMPEG=path\to\ffmpeg.exe).
// Output: ../exports/intro-en.mp4, intro-ar.mp4 (with sound effects) and intro-en-silent.mp4, intro-ar-silent.mp4

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright-core';

const DIST = resolve('dist');
const OUT = resolve('../exports');
const FPS = 30;
const W = 360; // CSS px; x3 device scale = 1080 x 1920
const H = 640;
const SCALE = 3;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('No build found. Run `npm run build` first.');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

// ---- A tiny static server for dist/
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };
const server = createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
  if (!p.startsWith(DIST) || !existsSync(p)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
  createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

// ---- Chrome, falling back to Edge
let browser;
for (const channel of ['chrome', 'msedge']) {
  try {
    browser = await chromium.launch({ channel });
    break;
  } catch {}
}
if (!browser) {
  console.error('Could not start Chrome or Edge.');
  process.exit(1);
}

// The stage fills the whole viewport; the 9:16 layout applies because the viewport is phone-width.
const STAGE_ONLY = `
  html, body { overflow: hidden !important; }
  .intro-stage { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; aspect-ratio: auto !important; z-index: 2147483647; }
  .intro-controls, .topbar, astro-dev-toolbar { display: none !important; }
`;

async function render(lang) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  await page.goto(`${base}${lang === 'ar' ? '/ar/' : '/'}`, { waitUntil: 'load' });
  // Bring the section near so page.ts loads the intro, then take the controller and stop the clock.
  await page.evaluate(() => document.querySelector('[data-intro]').scrollIntoView({ block: 'center' }));
  await page.waitForFunction(() => document.querySelector('[data-intro]').intro, null, { timeout: 15000 });
  await page.evaluate(async () => {
    const s = document.querySelector('[data-intro]');
    s.intro.pause();
    s.querySelectorAll('img').forEach((i) => (i.loading = 'eager'));
    await Promise.all([...s.querySelectorAll('img')].map((i) => (i.complete ? 0 : new Promise((r) => (i.onload = i.onerror = r)))));
    await Promise.all([...s.querySelectorAll('img')].map((i) => i.decode().catch(() => {})));
    await document.fonts.ready;
  });
  await page.addStyleTag({ content: STAGE_ONLY });

  // The soundtrack, rendered by the page's own sound code (OfflineAudioContext), so it matches the site.
  const wav = join(OUT, `.intro-${lang}.wav`);
  writeFileSync(wav, Buffer.from(await page.evaluate(() => document.querySelector('[data-intro]').intro.renderAudio()), 'base64'));

  const file = join(OUT, `intro-${lang}.mp4`);
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((r, j) => ff.on('close', (code) => (code === 0 ? r() : j(new Error(`ffmpeg exited ${code}`)))));

  const total = Math.round(18 * FPS);
  for (let f = 0; f < total; f++) {
    await page.evaluate(async (t) => {
      document.querySelector('[data-intro]').intro.seek(t);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, f / FPS);
    const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
    if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
    if (f % 90 === 0) process.stdout.write(`  ${lang}: ${f}/${total}\r`);
  }
  ff.stdin.end();
  await done;
  rmSync(wav);
  // A silent copy (same picture, no audio track), for adding music.
  const silent = join(OUT, `intro-${lang}-silent.mp4`);
  await new Promise((r, j) => spawn(FFMPEG, ['-y', '-loglevel', 'error', '-i', file, '-an', '-c:v', 'copy', '-movflags', '+faststart', silent], { stdio: 'inherit' }).on('close', (c) => (c === 0 ? r() : j(new Error('ffmpeg (silent) failed')))));
  await ctx.close();
  console.log(`  ${lang}: ${total} frames -> ${file} (${(statSync(file).size / 1048576).toFixed(1)} MB), silent copy ${(statSync(silent).size / 1048576).toFixed(1)} MB`);
}

try {
  for (const lang of ['en', 'ar']) await render(lang);
} finally {
  await browser.close();
  server.close();
}
