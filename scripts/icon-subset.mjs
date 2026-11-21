// Builds css/icons.css: the Phosphor icon stylesheet cut down to the icons
// the app uses. The vendor file defines ~3,000 icon rules (164 KB) and blocks
// first paint; LibriQ uses a few dozen of them.
//
// An icon is kept when its name appears in the app's HTML or JS either as a
// class (`ph-book-open`) or as a quoted string ('wifi-slash'). The second form
// covers markup like `ph-${icon}`, where the name is passed in as a string.
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const ICON_RULE = /\.ph(?:-fill)?\.ph-([a-z0-9-]+):before\s*\{[^}]*\}\s*/g;

async function listSources(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === 'vendor' ? [] : listSources(full);
    if (/^app\.bundle\.js/.test(entry.name)) return [];
    return /\.(html|js)$/.test(entry.name) ? [full] : [];
  }));
  return nested.flat();
}

export async function usedIconNames(frontendDir, allNames) {
  const files = await listSources(frontendDir);
  const text = (await Promise.all(files.map(file => readFile(file, 'utf8')))).join('\n');
  const used = new Set();
  for (const name of allNames) {
    const asClass = new RegExp(`\\bph-${name}(?![a-z0-9-])`);
    const asString = new RegExp(`['"\`]${name}['"\`]`);
    if (asClass.test(text) || asString.test(text)) used.add(name);
  }
  return used;
}

export async function buildIconCss(rootDir) {
  const frontendDir = path.join(rootDir, 'frontend');
  const vendorCss = await readFile(path.join(frontendDir, 'vendor', 'phosphor', 'style.css'), 'utf8');
  const allNames = new Set([...vendorCss.matchAll(ICON_RULE)].map(match => match[1]));
  const used = await usedIconNames(frontendDir, allNames);
  const css = vendorCss
    .replace(ICON_RULE, (rule, name) => (used.has(name) ? rule : ''))
    // The output lives in css/, the fonts stay next to the vendor file.
    .replace(/url\((['"]?)\.\/(Phosphor[^'")]*)\1\)/g, "url('../vendor/phosphor/$2')");
  return { css, used: [...used].sort(), total: allNames.size };
}
