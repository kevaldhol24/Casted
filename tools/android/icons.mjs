// Renders the source images for `npx capacitor-assets generate --android` into the folder given as argv[2]:
// the boot screen's heart (index.html) on the room's dark brown. Runs in CI, where sharp comes with @capacitor/assets.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';

const out = resolve(process.argv[2] ?? 'build-assets');
mkdirSync(out, { recursive: true });

const HEART = 'M0 0.95C-0.35 0.6-1 0.25-1-0.25C-1-0.7-0.6-0.95-0.3-0.95C-0.12-0.95 0-0.82 0-0.62C0-0.82 0.12-0.95 0.3-0.95C0.6-0.95 1-0.7 1-0.25C1 0.25 0.35 0.6 0 0.95Z';
const BG = `<radialGradient id="bg" cx="50%" cy="40%" r="75%"><stop offset="0" stop-color="#3a2b21"/><stop offset="1" stop-color="#1d1510"/></radialGradient>`;

/** A size × size image: optional background, the heart `heart` × size wide, centred. */
function svg(size, { background, heart }) {
  const s = (size * heart) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><defs>${BG}</defs>` +
      (background ? `<rect width="100%" height="100%" fill="url(#bg)"/>` : '') +
      (heart ? `<path fill="#f2a43a" transform="translate(${size / 2} ${size / 2}) scale(${s})" d="${HEART}"/>` : '') +
      `</svg>`,
  );
}

const images = {
  'icon-only.png': svg(1024, { background: true, heart: 0.56 }),
  // Adaptive icon: the launcher crops the outer third, so the heart stays inside the middle 66%.
  'icon-foreground.png': svg(1024, { background: false, heart: 0.42 }),
  'icon-background.png': svg(1024, { background: true, heart: 0 }),
  'splash.png': svg(2732, { background: true, heart: 0.16 }),
  'splash-dark.png': svg(2732, { background: true, heart: 0.16 }),
};
for (const [name, image] of Object.entries(images)) await sharp(image).png().toFile(resolve(out, name));
console.log(`icons: ${Object.keys(images).length} images in ${out}`);
