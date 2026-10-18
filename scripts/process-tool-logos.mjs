// Tool logos for the Tools section.
//
// Sources live in scripts/tool-logos/src/ (one file per logo id, as used by `logo` in the content files).
// Output: public/tools/<id>.svg|webp, plus src/lib/tool-logos.json with each logo's display size.
//
// Sizing is optical, not by bounding box: every logo is scaled so its perceived area (half its ink,
// half its trimmed bounding box) matches the same target. A wide mark and a filled square app icon
// then read at the same weight.
//
//   node scripts/process-tool-logos.mjs
//
// Where each source came from is listed in scripts/tool-logos/SOURCES.md.

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SRC = 'scripts/tool-logos/src';
const OUT = 'public/tools';
const MAP = 'src/lib/tool-logos.json';

// Store icons (512px PNG) that sit on a white app plate: the plate is removed so the mark sits on the page.
const STRIP_PLATE = new Set(['meta-business-suite', 'meta-ads-manager', 'snapseed', 'youtube-studio']);
// Full-bleed store icons: given the rounded corners a phone launcher shows.
const ROUND = new Set(['blackmagic-camera']);

// Area matching under-weights solid, high-contrast marks: a block of pure white reads heavier
// than the same area in mid-tone colour. These are trimmed by eye after the area match.
const NUDGE = { elevenlabs: 0.88, notion: 0.92 };

const TARGET = 0.56; // perceived area, as a share of the square box
const MAX_SIDE = 1.12; // no side may exceed this share of the box
const R = 256; // measuring resolution

async function stripPlate(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;
  const at = (x, y) => (y * w + x) * 4;
  const isPlate = (i) => data[i + 3] < 8 || Math.min(data[i], data[i + 1], data[i + 2]) > 236;
  const bg = new Uint8Array(w * h);
  const stack = [0, w - 1, (h - 1) * w, h * w - 1];
  while (stack.length) {
    const p = stack.pop();
    if (bg[p]) continue;
    if (!isPlate(p * 4)) continue;
    bg[p] = 1;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  // Edge pixels were blended against white: recover their alpha from the nearest solid colour inward.
  const out = Buffer.from(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x, i = p * 4;
      if (bg[p]) { out[i + 3] = 0; continue; }
      const edge = (x > 0 && bg[p - 1]) || (x < w - 1 && bg[p + 1]) || (y > 0 && bg[p - w]) || (y < h - 1 && bg[p + w]);
      if (!edge) continue;
      let f = null;
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [3, 3], [-3, -3], [3, -3], [-3, 3]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || bg[ny * w + nx]) continue;
        const j = at(nx, ny);
        if (Math.min(data[j], data[j + 1], data[j + 2]) < 230) { f = j; break; }
      }
      if (f === null) continue;
      let a = 0, n = 0;
      for (let c = 0; c < 3; c++) {
        const d = 255 - data[f + c];
        if (d > 25) { a += (255 - data[i + c]) / d; n++; }
      }
      a = n ? Math.max(0, Math.min(1, a / n)) : 1;
      out[i] = data[f]; out[i + 1] = data[f + 1]; out[i + 2] = data[f + 2];
      out[i + 3] = Math.round(a * 255);
    }
  }
  return sharp(out, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
}

async function roundCorners(file) {
  const { width: w, height: h } = await sharp(file).metadata();
  const r = Math.round(w * 0.225);
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#fff"/></svg>`);
  return sharp(file).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

async function measure(input) {
  // Rasterise vectors at ~1024px on their long side, whatever size their file declares.
  const meta = await sharp(input).metadata();
  const density = meta.format === 'svg' ? Math.min(2400, (72 * 1024) / Math.max(meta.width, meta.height)) : 72;
  const img = sharp(input, { density });
  const { data, info } = await img
    .resize(R, R, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let ink = 0, x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      const a = data[(y * info.width + x) * 4 + 3];
      if (a < 16) continue;
      ink += a / 255;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const box = ((x1 - x0 + 1) * (y1 - y0 + 1)) / (R * R);
  return {
    w: info.width / R,
    h: info.height / R,
    perceived: 0.5 * (ink / (R * R)) + 0.5 * box,
    // Ink bounds as fractions of the image, for cropping padded viewBoxes.
    bounds: [x0 / info.width, y0 / info.height, (x1 + 1) / info.width, (y1 + 1) / info.height],
  };
}

// Crop an SVG's viewBox to its ink (plus a hair of margin), so padding baked into a file doesn't
// shrink that logo next to the others. Fixed width/height attributes go; CSS sizes the image.
async function cropSvg(svg) {
  const vb = svg.match(/viewBox="([^"]+)"/);
  if (!vb) return svg;
  const [x, y, w, h] = vb[1].trim().split(/[\s,]+/).map(Number);
  const { bounds: [bx0, by0, bx1, by1] } = await measure(Buffer.from(svg));
  const m = 0.01 * Math.max(w, h);
  const nx = x + bx0 * w - m, ny = y + by0 * h - m;
  const nw = (bx1 - bx0) * w + 2 * m, nh = (by1 - by0) * h + 2 * m;
  const r = (n) => +n.toFixed(2);
  return svg
    .replace(/(<svg\b[^>]*?)\s(?:width|height)="[^"]*"/g, '$1')
    .replace(/(<svg\b[^>]*?)\s(?:width|height)="[^"]*"/g, '$1')
    .replace(vb[0], `viewBox="${r(nx)} ${r(ny)} ${r(nw)} ${r(nh)}"`);
}

await fs.mkdir(OUT, { recursive: true });
const files = (await fs.readdir(SRC)).filter((f) => /\.(svg|png)$/.test(f)).sort();
const map = {};

for (const f of files) {
  const id = f.replace(/\.(svg|png)$/, '');
  const from = path.join(SRC, f);
  let file, buf;

  if (f.endsWith('.svg')) {
    const svg = await cropSvg((await fs.readFile(from, 'utf8')).replace(/<\?xml[^>]*>\s*|<!--[\s\S]*?-->\s*/g, '').replace(/>\s+</g, '><').trim());
    file = `${id}.svg`;
    await fs.writeFile(path.join(OUT, file), svg);
    buf = Buffer.from(svg);
  } else {
    const png = STRIP_PLATE.has(id) ? await stripPlate(from) : ROUND.has(id) ? await roundCorners(from) : await fs.readFile(from);
    // Trim the transparent margin a stripped plate leaves, so sizing works from the mark itself.
    const trimmed = await sharp(png).trim({ threshold: 1 }).png().toBuffer();
    file = `${id}.webp`;
    await sharp(trimmed).resize(192, 192, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 90, alphaQuality: 100, effort: 6 }).toFile(path.join(OUT, file));
    buf = trimmed;
  }

  const m = await measure(buf);
  let s = Math.sqrt(TARGET / m.perceived);
  s = Math.min(s * (NUDGE[id] ?? 1), MAX_SIDE / Math.max(m.w, m.h));
  map[id] = { src: `/tools/${file}`, w: +(m.w * s).toFixed(3), h: +(m.h * s).toFixed(3) };
  console.log(id.padEnd(22), `perceived ${m.perceived.toFixed(2)}  ->  ${map[id].w} x ${map[id].h}`);
}

await fs.writeFile(MAP, JSON.stringify(map, null, 2) + '\n');
console.log(`\n${files.length} logos -> ${OUT}/, sizes -> ${MAP}`);
