// Favicon set and Open Graph images.
//
//   node scripts/make-brand.mjs
//
// Favicon: an "AA" monogram drawn as two condensed A's sharing one leg, crossbars in amber.
// OG images (1200x630, EN + AR): rendered from an HTML layout with headless Chrome or Edge,
// using the site's own fonts and the hero photo, then saved as JPEG in public/.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = join(here, '..');
const PUBLIC = join(SITE, 'public');
const NM = join(SITE, 'node_modules');

const GROUND = '#151311';
const TEXT = '#ede7dd';
const AMBER = '#dba25b';

// ---------- Favicon ----------

const monogram = (pad = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${64 + pad * 2} ${64 + pad * 2}">
  <rect x="${-pad}" y="${-pad}" width="${64 + pad * 2}" height="${64 + pad * 2}" fill="${GROUND}"/>
  <defs><clipPath id="b"><rect x="0" y="6" width="64" height="47"/></clipPath></defs>
  <g clip-path="url(#b)">
    <path d="M10 40.5 H29 M35 40.5 H54" stroke="${AMBER}" stroke-width="4.5"/>
    <path d="M6.5 60 L19.5 11 L32 58 L44.5 11 L57.5 60" fill="none" stroke="${TEXT}" stroke-width="6.5" stroke-linejoin="miter" stroke-miterlimit="10"/>
  </g>
</svg>
`;

writeFileSync(join(PUBLIC, 'favicon.svg'), monogram());

const png = (size, pad) => sharp(Buffer.from(monogram(pad)), { density: 384 }).resize(size, size).png().toBuffer();

// ICO with embedded PNGs (valid in every current browser).
async function ico(sizes) {
  const images = await Promise.all(sizes.map((s) => png(s, 0)));
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach((img, i) => {
    const e = 6 + i * 16;
    header.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], e);
    header.writeUInt8(sizes[i] >= 256 ? 0 : sizes[i], e + 1);
    header.writeUInt16LE(1, e + 4);
    header.writeUInt16LE(32, e + 6);
    header.writeUInt32LE(img.length, e + 8);
    header.writeUInt32LE(offset, e + 12);
    offset += img.length;
  });
  return Buffer.concat([header, ...images]);
}

writeFileSync(join(PUBLIC, 'favicon.ico'), await ico([16, 32, 48]));
writeFileSync(join(PUBLIC, 'apple-touch-icon.png'), await png(180, 8));
writeFileSync(join(PUBLIC, 'icon-512.png'), await png(512, 8));
console.log('favicon.svg, favicon.ico, apple-touch-icon.png, icon-512.png');

// ---------- OG images ----------

const browser = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find((p) => existsSync(p));
if (!browser) {
  console.log('No Chrome/Edge found; OG images not regenerated.');
  process.exit(0);
}

const font = (pkg, file) => pathToFileURL(join(NM, pkg, 'files', file)).href;
const photo = pathToFileURL(join(SITE, 'src', 'assets', 'media', 'speaker', 'speaker-01.jpg')).href;
const en = JSON.parse(readFileSync(join(SITE, 'content', 'en.json'), 'utf8'));
const ar = JSON.parse(readFileSync(join(SITE, 'content', 'ar.json'), 'utf8'));

const og = (t) => `<!doctype html><html lang="${t.lang}" dir="${t.dir}"><head><meta charset="utf-8"><style>
@font-face { font-family: Display; src: url(${font('@fontsource-variable/sofia-sans-extra-condensed', 'sofia-sans-extra-condensed-latin-wght-normal.woff2')}); font-weight: 100 900; }
@font-face { font-family: Text; src: url(${font('@fontsource-variable/hanken-grotesk', 'hanken-grotesk-latin-wght-normal.woff2')}); font-weight: 100 900; }
@font-face { font-family: ArDisplay; src: url(${font('@fontsource-variable/alexandria', 'alexandria-arabic-wght-normal.woff2')}); font-weight: 100 900; }
@font-face { font-family: ArText; src: url(${font('@fontsource/ibm-plex-sans-arabic', 'ibm-plex-sans-arabic-arabic-500-normal.woff2')}); font-weight: 500; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: ${GROUND}; color: ${TEXT}; }
.photo { position: absolute; inset-block: 0; inset-inline-end: 0; width: 640px; background: url(${photo}) 50% 22% / cover; filter: brightness(.86) contrast(1.06) saturate(.86); }
.photo::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to ${t.dir === 'rtl' ? 'left' : 'right'}, ${GROUND} 0, rgba(21,19,17,.55) 22%, rgba(21,19,17,0) 48%); }
.copy { position: absolute; inset-inline-start: 72px; inset-block-end: 72px; width: 640px; }
h1 { margin: 0; font: 700 ${t.lang === 'ar' ? '128px/1.15 ArDisplay' : '176px/.84 Display'}; ${t.lang === 'ar' ? '' : 'text-transform: uppercase;'} }
.rule { width: 72px; height: 2px; background: ${AMBER}; margin: 34px 0 24px; }
p { margin: 0; font: 600 ${t.lang === 'ar' ? '38px/1.4 ArDisplay' : '46px/1.05 Display'}; }
.tags { margin-top: 10px; color: #cfc8bd; font: ${t.lang === 'ar' ? '500 28px/1.5 ArText' : '500 26px/1.3 Text'}; }
</style></head><body>
<div class="photo"></div>
<div class="copy"><h1>${t.hero.name}</h1><div class="rule"></div><p>${t.hero.role}</p><div class="tags">${t.hero.tags.join(' · ')}</div></div>
</body></html>`;

const tmp = join(tmpdir(), `og-${Date.now()}`);
mkdirSync(tmp, { recursive: true });
for (const [t, name] of [[en, 'og.jpg'], [ar, 'og-ar.jpg']]) {
  const html = join(tmp, `${t.lang}.html`);
  const shot = join(tmp, `${t.lang}.png`);
  writeFileSync(html, og(t));
  execFileSync(browser, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    '--force-device-scale-factor=1', '--window-size=1200,630', '--virtual-time-budget=4000',
    `--screenshot=${shot}`, pathToFileURL(html).href,
  ], { stdio: 'ignore' });
  await sharp(shot).resize(1200, 630).jpeg({ quality: 86, mozjpeg: true }).toFile(join(PUBLIC, name));
  console.log(name);
}
rmSync(tmp, { recursive: true, force: true });
