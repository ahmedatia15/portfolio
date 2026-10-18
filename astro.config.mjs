// @ts-check
import { defineConfig } from 'astro/config';

// TODO(Ahmed): replace with the custom domain once it is connected (see README).
const SITE = 'https://ahmed-atia.vercel.app';

export default defineConfig({
  site: SITE,
  trailingSlash: 'ignore',
  build: { inlineStylesheets: 'always' },
  image: {
    // Responsive srcsets are set per image in src/components; keep the default sharp service.
    responsiveStyles: false,
  },
});
