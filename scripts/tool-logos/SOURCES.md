# Tool logo sources

Collected 2026-10-18. Every file is self-hosted from `public/tools/`; nothing is hotlinked.
Run `npm run logos` after changing anything in `src/`.

| Logo id | Used for | Source | Changes made |
|---|---|---|---|
| meta | Meta Insights | svgl.app `meta.svg` (Meta's blue mark) | none. Meta Insights has no mark of its own, so it uses the parent Meta mark |
| meta-business-suite | Meta Business Suite | Google Play store icon, `com.facebook.pages.app` (512px PNG) | white app plate removed |
| meta-ads-manager | Meta Ads Manager | Google Play store icon, `com.facebook.adsmanager` (512px PNG) | white app plate removed |
| buffer | Buffer | Iconify `logos:buffer` (gilbarbara/logos) | filled white: Buffer's mark is one-colour, white on dark backgrounds |
| tiktok | TikTok Ads Manager, TikTok Analytics | svgl.app `tiktok-icon-dark.svg` (TikTok's on-dark mark) | none. Neither product has a mark of its own |
| google-ads | Google Ads | Iconify `logos:google-ads` | none |
| snapchat | Snapchat Ads | svgl.app `snapchat.svg` | none. Snapchat Ads uses the Snapchat mark |
| instagram | Instagram Insights | svgl.app `instagram-icon.svg` | none |
| google-analytics | Google Analytics | svgl.app `google-analytics.svg` | none |
| youtube-studio | YouTube Studio | Google Play store icon, `com.google.android.apps.youtube.creator` (512px PNG) | white app plate removed |
| canva | Canva | svgl.app `canva.svg` | none |
| figma | Figma | svgl.app `figma.svg` | none |
| lightroom | Adobe Lightroom | svgl.app `lightroom.svg` | none |
| adobe | Adobe Camera Raw | svgl.app `adobe.svg` (Adobe's red mark) | none. Camera Raw ships inside Photoshop and Lightroom without a product icon, so it uses the Adobe mark |
| snapseed | Snapseed | Google Play store icon, `com.niksoftware.snapseed` (512px PNG) | white app plate removed |
| blackmagic-camera | Blackmagic Camera | Google Play store icon, `com.blackmagicdesign.android.blackmagiccam` (512px PNG) | launcher-style rounded corners |
| chatgpt | ChatGPT | svgl.app `openai_dark.svg` (OpenAI's on-dark mark) | none |
| claude | Claude | svgl.app `claude-ai-icon.svg` | none |
| gemini | Gemini | svgl.app `gemini.svg` | none |
| elevenlabs | ElevenLabs | Wikimedia Commons `ElevenLabs Logo 01.svg` (white wordmark) | kept only the "II" symbol from the wordmark |
| higgsfield | Higgsfield | higgsfield.ai: the logo glyph SVG in the site header, on the lime of their app icon (`higgsfield.ai/icon.png`, #D1FE17) | glyph placed on a rounded lime square to match their app icon |
| notion | Notion | svgl.app `notion.svg` | none |
| google-workspace | Google Workspace | svgl.app `google.svg` (Google "G") | Google Workspace's own logo is the "Google Workspace" wordmark, whose grey "Workspace" fails contrast on the dark page and repeats the label under it, so it uses the parent Google mark |
| discord | Discord | svgl.app `discord.svg` | none |

The script also crops each SVG's viewBox to its ink and removes fixed width/height, so files with
baked-in padding don't render smaller than the rest.
