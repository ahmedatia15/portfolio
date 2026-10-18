# Ahmed Atia — portfolio

Static Astro site, English at `/` and Arabic at `/ar/`. Deploys to Vercel.

```
npm install          # once
npm run dev          # local site at http://localhost:4321
npm run build        # production build into dist/
npm run deploy       # build and publish to Vercel (asks you to log in the first time)
```

## Update text

All copy lives in two files. Edit them and save; the dev server reloads.

- `content/en.json`: English
- `content/ar.json`: Arabic. Delete the `_REVIEW_BY_AHMED` line once you've checked every line.

Each file has the same keys: `hero`, `snapshot`, `cases` (one block per project), `photography`, `about`, `skills`, `contact`, and `alt` (the description screen readers hear for every image). If you change a fact, change it in both files.

Numbers stay in Western digits in both languages, to match the campaign data.

## Add your CV

Put the PDF at `public/cv/Ahmed-Atia-CV.pdf`. The Download CV button already points there.

## Swap or add images

Originals stay in `../Portfolio/` and are never modified. To change what's on the site:

1. Put the new photo or video in the right `Portfolio/` folder (HEIC, JPEG, PNG and MP4 are all fine).
2. Run `npm run assets`. This converts HEIC, strips EXIF/GPS, removes duplicates, and re-encodes videos (H.264, under ~3 MB, poster frame included). Output goes to `src/assets/media/` and `public/media/video/`. Files are numbered per folder, e.g. `booth-01.jpg`, `photography-07.jpg`.
3. Use the new file name in `src/components/Page.astro` (search for the project, e.g. `g-booth`), and add its description under `alt` in both content files.

Astro builds the AVIF and WebP sizes (640 / 1280 / 1920) at build time.

To pick a different poster frame for a video, change its number in `POSTER_AT` at the top of `scripts/process-assets.mjs` (0.5 = halfway) and run `npm run assets -- --videos`.

To regenerate the favicon or the link-preview images (`public/og.jpg`, `public/og-ar.jpg`) after changing your name or title: `npm run brand`. It needs Chrome or Edge installed.

### Attribution rules (keep these when you add work)

- Only photos from `Portfolio/07-My-Photography/` sit under the "Photographed by Ahmed Atia" credit.
- Event photos (CAT Booth through CAT Scoop) carry the "Media I led" credit.
- Every event video carries "Produced by the Video Editing circle under my direction."

## Deploy and connect a domain

First deploy:

```
npm i -g vercel      # or use npx, as `npm run deploy` does
vercel login
npm run deploy
```

Vercel prints the live URL. Later deploys are the same single command.

Custom domain:

1. In the Vercel dashboard: Project → Settings → Domains → Add, and enter your domain (e.g. `ahmedatia.com`).
2. At your domain registrar, add the DNS records Vercel shows (an `A` record to `76.76.21.21` for the root, a `CNAME` to `cname.vercel-dns.com` for `www`). HTTPS is set up automatically.
3. Change `SITE` in `astro.config.mjs` to the new domain and deploy again. The canonical, `hreflang` and link-preview URLs are built from it.

Send recruiters `https://<your-domain>/ar/` for the Arabic version.
