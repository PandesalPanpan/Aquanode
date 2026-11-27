// Render the AquaNode app icons from the logo mark (assets/logo/aquanode-mark.svg) for the installable Dashboard.
// Usage: node make-icons.mjs   -> web/public/icons/*.png and web/public/favicon.svg
import sharp from 'sharp';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const path = (rel) => fileURLToPath(new URL(rel, import.meta.url));
const out = path('../web/public/icons/');
mkdirSync(out, { recursive: true });

const mark = readFileSync(path('../assets/logo/aquanode-mark.svg'), 'utf8');
const inner = mark.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');

// `scale` is how much of the square the mark fills: maskable icons need it inside the
// central 80% safe zone, so they get a smaller mark.
const svg = (scale) => {
  const size = 512 * scale, off = (512 - size) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#18211f"/>
  <svg x="${off}" y="${off}" width="${size}" height="${size}" viewBox="0 0 64 64">${inner}</svg>
</svg>`);
};

const icons = [
  ['icon-192.png', 192, 0.72],
  ['icon-512.png', 512, 0.72],
  ['maskable-512.png', 512, 0.56],
  ['apple-touch-icon.png', 180, 0.64], // iPhone home screen; iOS rounds the corners itself
];
for (const [name, size, scale] of icons) {
  await sharp(svg(scale), { density: 300 }).resize(size, size).png().toFile(out + name);
  console.log('wrote', name);
}

// Browser-tab icon: the bare mark on a transparent background.
writeFileSync(path('../web/public/favicon.svg'), mark);
console.log('wrote favicon.svg');
