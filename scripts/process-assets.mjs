// Normalises the read-only originals in ../Portfolio into the site's own asset folders.
//
//   node scripts/process-assets.mjs            images + videos
//   node scripts/process-assets.mjs --images   images only
//   node scripts/process-assets.mjs --videos   videos only
//
// Images: HEIC/HEIF -> JPEG, EXIF orientation applied, all metadata (EXIF/GPS) stripped,
// long edge capped at 2400px, deduped by SHA-256 of the original bytes.
// They land in src/assets/media/<folder>/ where Astro's <Picture> builds the AVIF + WebP srcsets.
//
// Videos: H.264 MP4, <=1080p (never upscaled), CRF with a bitrate cap from a ~3 MB budget,
// 64 kbps AAC kept so a visitor can choose to unmute, +faststart, metadata stripped.
// They land in public/media/video/ with a poster JPEG in src/assets/media/posters/.
//
// Originals are only ever read. Nothing in ../Portfolio is written, renamed or deleted.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import heicConvert from 'heic-convert';

const here = dirname(fileURLToPath(import.meta.url));
const SITE = join(here, '..');
const ORIGINALS = join(SITE, '..', 'Portfolio');
const IMG_OUT = join(SITE, 'src', 'assets', 'media');
const VID_OUT = join(SITE, 'public', 'media', 'video');
const POSTER_OUT = join(IMG_OUT, 'posters');
const MAX_EDGE = 2400;
const VIDEO_BUDGET_BYTES = 3 * 1024 * 1024;

const args = new Set(process.argv.slice(2));
const doImages = !args.has('--videos');
const doVideos = !args.has('--images');

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.heic', '.heif']);
const VIDEO_EXT = new Set(['.mp4', '.mov']);

// Short, stable output names per source folder. The originals keep their own names.
const FOLDER_SLUG = {
  '': 'portrait',
  '00-Speaker-HelloWorldX': 'speaker',
  '01-CAT-Booth': 'booth',
  '02-Hello-World': 'helloworld',
  '03-PodCAT': 'podcat',
  '04-CAT-Station': 'station',
  '05-CATathon': 'catathon',
  '06-CAT-Scoop': 'scoop',
  '07-My-Photography': 'photography',
  '08-Canva-Course': 'canva',
};

// Poster frames chosen by eye from a contact sheet of each clip (fraction of duration).
const POSTER_AT = {
  'podcat-01': 0.55, // Osama Elzero mid-answer, no caption on screen
  'podcat-02': 0.88, // season teaser end card: The PodCAT wordmark
  'station-01': 0.4, // animated traveller under the CAT Station boards
  'catathon-01': 0.25, // team holding up the CATathon sign
};

// Files the brief or Ahmed asked to leave off the site.
const SKIP = new Set([join('08-Canva-Course', 'ad v.mp4')]);

function walk(dir, rel = '') {
  const out = [];
  for (const name of readdirSync(dir).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))) {
    const abs = join(dir, name);
    const r = rel ? join(rel, name) : name;
    if (statSync(abs).isDirectory()) out.push(...walk(abs, r));
    else out.push({ abs, rel: r, folder: rel, ext: extname(name).toLowerCase() });
  }
  return out;
}

const sha = (buf) => createHash('sha256').update(buf).digest('hex');

async function toJpegBuffer(file) {
  const raw = readFileSync(file.abs);
  if (file.ext === '.heic' || file.ext === '.heif') {
    return { raw, buf: Buffer.from(await heicConvert({ buffer: raw, format: 'JPEG', quality: 0.95 })) };
  }
  return { raw, buf: raw };
}

async function processImages(files) {
  const seen = new Map();
  const counters = {};
  const manifest = [];
  const problems = [];

  for (const file of files.filter((f) => IMAGE_EXT.has(f.ext))) {
    const slug = FOLDER_SLUG[file.folder];
    if (!slug) { problems.push(`no slug for folder "${file.folder}" (${file.rel})`); continue; }
    try {
      const { raw, buf } = await toJpegBuffer(file);
      const hash = sha(raw);
      if (seen.has(hash)) {
        manifest.push({ source: file.rel, duplicateOf: seen.get(hash) });
        continue;
      }
      counters[slug] = (counters[slug] ?? 0) + 1;
      const name = file.folder === '' ? 'portrait' : `${slug}-${String(counters[slug]).padStart(2, '0')}`;
      const outDir = join(IMG_OUT, file.folder === '' ? 'portrait' : slug);
      mkdirSync(outDir, { recursive: true });
      // Designed posts (PNG) stay lossless-ish PNG so type stays crisp; photos go to JPEG.
      const keepPng = file.ext === '.png';
      const out = join(outDir, `${name}${keepPng ? '.png' : '.jpg'}`);
      let img = sharp(buf, { failOn: 'none' }).rotate().resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
      img = keepPng ? img.png({ compressionLevel: 9, palette: false }) : img.jpeg({ quality: 88, mozjpeg: true });
      // sharp drops EXIF/XMP/GPS unless .withMetadata() is called; we never call it.
      const info = await img.toFile(out);
      const rel = out.slice(SITE.length + 1).replaceAll('\\', '/');
      seen.set(hash, rel);
      manifest.push({ source: file.rel, output: rel, width: info.width, height: info.height, sha256: hash.slice(0, 12) });
      console.log(`img  ${file.rel}  ->  ${rel}  ${info.width}x${info.height}`);
    } catch (err) {
      problems.push(`${file.rel}: ${err.message}`);
    }
  }
  return { manifest, problems };
}

function ffprobe(file) {
  const json = execFileSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file], { encoding: 'utf8' });
  const data = JSON.parse(json);
  const v = data.streams.find((s) => s.codec_type === 'video');
  return { duration: Number(data.format.duration), width: v.width, height: v.height, rotation: v.side_data_list?.find((d) => d.rotation != null)?.rotation ?? 0 };
}

function processVideos(files) {
  mkdirSync(VID_OUT, { recursive: true });
  mkdirSync(POSTER_OUT, { recursive: true });
  const counters = {};
  const manifest = [];
  const problems = [];

  for (const file of files.filter((f) => VIDEO_EXT.has(f.ext))) {
    if (SKIP.has(file.rel)) { manifest.push({ source: file.rel, skipped: 'left off the site at Ahmed\'s request' }); continue; }
    const slug = FOLDER_SLUG[file.folder];
    counters[slug] = (counters[slug] ?? 0) + 1;
    const name = `${slug}-${String(counters[slug]).padStart(2, '0')}`;
    const out = join(VID_OUT, `${name}.mp4`);
    const poster = join(POSTER_OUT, `${name}.jpg`);
    try {
      const meta = ffprobe(file.abs);
      // Fit inside 1080 on the short edge (portrait reels stay portrait), even dimensions for H.264.
      const scale = "scale='if(gt(iw,ih),-2,min(1080,iw))':'if(gt(iw,ih),min(1080,ih),-2)'";
      // Cap the bitrate from the size budget (audio share taken off first); CRF does the rest,
      // so clips that are already lean at source don't get inflated.
      const capKbps = Math.max(400, Math.floor((VIDEO_BUDGET_BYTES * 8 * 0.92) / meta.duration / 1000) - 64);
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', file.abs, '-vf', scale,
        '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-maxrate', `${capKbps}k`, '-bufsize', `${capKbps * 2}k`,
        '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '64k', '-ac', '2',
        '-map_metadata', '-1', '-movflags', '+faststart', out]);
      // Poster frame: hand-picked point in each clip (fraction of duration), default ~1/3 in.
      const at = Math.min(meta.duration * (POSTER_AT[name] ?? 0.33), Math.max(0, meta.duration - 0.5)).toFixed(2);
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', at, '-i', out, '-frames:v', '1', '-q:v', '2', poster]);
      const size = statSync(out).size;
      const rel = out.slice(SITE.length + 1).replaceAll('\\', '/');
      const after = ffprobe(out);
      manifest.push({ source: file.rel, output: rel, poster: poster.slice(SITE.length + 1).replaceAll('\\', '/'), width: after.width, height: after.height, duration: Number(meta.duration.toFixed(1)), bytes: size });
      console.log(`vid  ${file.rel}  ->  ${rel}  ${after.width}x${after.height}  ${(size / 1048576).toFixed(2)} MB  ${meta.duration.toFixed(1)}s`);
    } catch (err) {
      problems.push(`${file.rel}: ${err.message}`);
    }
  }
  return { manifest, problems };
}

// The only portrait of Ahmed sits inside a tilted CAT Reloaded "Media" card. Deskew it and
// keep just the photo for the About section.
async function cropPortrait() {
  const card = join(IMG_OUT, 'portrait', 'portrait.jpg');
  if (!existsSync(card)) return;
  const level = await sharp(card).rotate(5.7, { background: '#000' }).toBuffer();
  await sharp(level).extract({ left: 882, top: 578, width: 585, height: 945 }).jpeg({ quality: 90, mozjpeg: true })
    .toFile(join(IMG_OUT, 'portrait', 'portrait-crop.jpg'));
  console.log('img  portrait card  ->  src/assets/media/portrait/portrait-crop.jpg  585x945');

  // Hello World X needs the speaker frame cut differently from the hero: landscape, with the
  // "Media vs. Social Media" slide he was presenting.
  const speaker = join(IMG_OUT, 'speaker', 'speaker-01.jpg');
  await sharp(speaker).extract({ left: 520, top: 180, width: 1280, height: 960 }).jpeg({ quality: 88, mozjpeg: true })
    .toFile(join(IMG_OUT, 'speaker', 'speaker-slide.jpg'));
  console.log('img  speaker-01  ->  src/assets/media/speaker/speaker-slide.jpg  1280x960');
}

const files = walk(ORIGINALS);
const report = { generated: new Date().toISOString() };
if (doImages) { Object.assign(report, { images: await processImages(files) }); await cropPortrait(); }
if (doVideos) Object.assign(report, { videos: processVideos(files) });

const reportPath = join(SITE, 'scripts', `asset-report${doImages && doVideos ? '' : doImages ? '.images' : '.videos'}.json`);
writeFileSync(reportPath, JSON.stringify(report, null, 2));
const problems = [...(report.images?.problems ?? []), ...(report.videos?.problems ?? [])];
console.log(problems.length ? `\nProblems:\n  ${problems.join('\n  ')}` : '\nNo unreadable files.');
console.log(`Report: ${basename(reportPath)}`);
