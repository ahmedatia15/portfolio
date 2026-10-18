import type { ImageMetadata } from 'astro';

// Every processed image under src/assets/media, keyed by file name without extension
// (e.g. "booth-09", "photography-04", "posters/podcat-01" -> "poster:podcat-01").
const files = import.meta.glob<{ default: ImageMetadata }>('../assets/media/**/*.{jpg,png}', { eager: true });

const byId = new Map<string, ImageMetadata>();
for (const [path, mod] of Object.entries(files)) {
  const name = path.split('/').pop()!.replace(/\.(jpg|png)$/, '');
  byId.set(path.includes('/posters/') ? `poster:${name}` : name, mod.default);
}

export function image(id: string): ImageMetadata {
  const img = byId.get(id);
  if (!img) throw new Error(`No processed image "${id}". Run: node scripts/process-assets.mjs`);
  return img;
}

// Srcset widths: the brief's 640 / 1280 / 1920 plus in-between steps so phones at 2-3x
// density don't jump straight to 1280. Never wider than the source.
export function widthsFor(img: ImageMetadata, wanted = [480, 640, 960, 1280, 1600, 1920]) {
  const ws = wanted.filter((w) => w < img.width);
  return [...ws, Math.min(img.width, wanted[wanted.length - 1])];
}

export interface Clip {
  id: string;
  src: string;
  width: number;
  height: number;
}

export const clips: Record<string, Clip> = {
  'podcat-01': { id: 'podcat-01', src: '/media/video/podcat-01.mp4', width: 720, height: 1280 },
  'podcat-02': { id: 'podcat-02', src: '/media/video/podcat-02.mp4', width: 720, height: 720 },
  'station-01': { id: 'station-01', src: '/media/video/station-01.mp4', width: 1280, height: 720 },
  'catathon-01': { id: 'catathon-01', src: '/media/video/catathon-01.mp4', width: 1276, height: 718 },
};
