// Render the AquaNode app icons (drop + leaf, same as the favicon) for the installable Dashboard.
// Usage: node make-icons.mjs   -> web/public/icons/*.png
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const out = new URL('../web/public/icons/', import.meta.url);
mkdirSync(out, { recursive: true });

// The glyph lives in a 32x32 box. `scale` is how much of the square it fills:
// maskable icons need it inside the central 80% safe zone, so they get a smaller glyph.
const svg = (scale) => {
  const s = (512 * scale) / 32, off = (512 - 32 * s) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#18211f"/>
  <g transform="translate(${off} ${off}) scale(${s})">
    <path fill="#6fc3c9" d="M16 3c5 6 9 11 9 16a9 9 0 0 1-18 0c0-5 4-10 9-16z"/>
    <path fill="#7fb069" d="M16 21c0-5 3-8 8-9-1 5-4 8-8 9z"/>
  </g>
</svg>`);
};

const icons = [
  ['icon-192.png', 192, 0.7],
  ['icon-512.png', 512, 0.7],
  ['maskable-512.png', 512, 0.55],
  ['apple-touch-icon.png', 180, 0.62], // iPhone home screen; iOS rounds the corners itself
];
for (const [name, size, scale] of icons) {
  await sharp(svg(scale)).resize(size, size).png().toFile(new URL(name, out).pathname.replace(/^\/([A-Z]:)/, '$1'));
  console.log('wrote', name);
}
