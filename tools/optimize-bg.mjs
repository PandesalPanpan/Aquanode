// Optimize a background photo for the Dashboard hero.
// Usage: node optimize-bg.mjs <photo.jpg>   -> web/public/bg/hero-{1920,1080}.{avif,webp}
// When you photograph your own AquaNode tank, run this on the photo, then adjust the
// --waterline / --pump-x / --feeder-x values at the top of web/src/styles.css to match.
import sharp from 'sharp';
import { mkdirSync, statSync } from 'node:fs';
const src = process.argv[2];
if (!src) { console.error('Usage: node optimize-bg.mjs <photo.jpg>'); process.exit(1); }
const out = new URL('../web/public/bg/', import.meta.url);
mkdirSync(out, { recursive: true });
const meta = await sharp(src).metadata();
console.log(`source ${meta.width}x${meta.height} (aspect ${(meta.width / meta.height).toFixed(3)})`);
for (const w of [1920, 1080]) {
  const base = sharp(src).rotate().resize({ width: w, withoutEnlargement: true });
  for (const [fmt, opts] of [['avif', { quality: 50, effort: 6 }], ['webp', { quality: 72 }]]) {
    const file = new URL(`hero-${w}.${fmt}`, out);
    await base.clone()[fmt](opts).toFile(file.pathname.replace(/^\/([A-Z]:)/, '$1'));
    console.log(`hero-${w}.${fmt}  ${(statSync(file).size / 1024).toFixed(0)} KB`);
  }
}
