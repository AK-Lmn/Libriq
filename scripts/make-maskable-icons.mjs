// Renders the maskable app icons from the LibriQ mark in icon.svg.
//
// Android crops maskable icons to a circle, squircle or rounded square, and
// only the central circle (radius 40% of the icon) is always visible. So the
// background fills the whole square, and the mark is scaled so its bounding
// box fits inside that circle.
//
// Run: node scripts/make-maskable-icons.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const BACKGROUND = '#111424';
const SAFE_RADIUS = 0.4; // of the icon size
const ICON_DIR = path.join(process.cwd(), 'frontend', 'assets', 'icons');

const svg = await readFile(path.join(ICON_DIR, 'icon.svg'), 'utf8');
const markPath = svg.match(/<path[\s\S]*?\/>/)[0];
// The mark's bounding box in icon.svg's 64-unit viewBox: x 11–53, y 7–57.
const box = { x: 11, y: 7, width: 42, height: 50 };
const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
const halfDiagonal = Math.hypot(box.width / 2, box.height / 2);

const browser = await chromium.launch();
try {
  for (const size of [192, 512]) {
    const scale = (SAFE_RADIUS * size) / halfDiagonal;
    const markup = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BACKGROUND}"/>
  <g transform="translate(${size / 2} ${size / 2}) scale(${scale}) translate(${-centre.x} ${-centre.y})">${markPath}</g>
</svg>`;
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0;background:${BACKGROUND}}svg{display:block}</style>${markup}`);
    await page.screenshot({ path: path.join(ICON_DIR, `maskable-icon-${size}.png`), clip: { x: 0, y: 0, width: size, height: size } });
    await page.close();
    console.log(`maskable-icon-${size}.png`);
  }
} finally {
  await browser.close();
}
