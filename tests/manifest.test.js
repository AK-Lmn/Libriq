import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';

const read = file => readFile(new URL(`../${file}`, import.meta.url));
const local = src => `frontend/${src.replace(/^\.\//, '').replace(/\?.*$/, '')}`;

// Width, height, colour type and the first pixel of a PNG. Row 0's first
// pixel is stored unchanged by every PNG filter, so it can be read without
// undoing the filters.
function pngInfo(buffer) {
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  const idat = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : 3;
  return { width, height, colorType, corner: [...raw.subarray(1, 1 + channels)] };
}

function jpegSize(buffer) {
  for (let offset = 2; offset < buffer.length;) {
    const marker = buffer.readUInt16BE(offset);
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xffc0 && marker <= 0xffc2) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  throw new Error('no SOF marker');
}

test('every manifest icon exists at its declared size', async () => {
  const manifest = JSON.parse(await read('frontend/manifest.json'));
  for (const icon of manifest.icons) {
    const { width, height } = pngInfo(await read(local(icon.src)));
    assert.equal(`${width}x${height}`, icon.sizes, icon.src);
  }
});

// Android crops maskable icons to a circle or squircle. The icon must fill
// the whole square (opaque corners) and must not be a copy of the regular
// icon, which has transparent rounded corners and a mark that would be cut.
test('maskable icons come in 192 and 512 and are full-bleed', async () => {
  const manifest = JSON.parse(await read('frontend/manifest.json'));
  const maskable = manifest.icons.filter(icon => icon.purpose === 'maskable');
  assert.deepEqual(maskable.map(icon => icon.sizes).sort(), ['192x192', '512x512']);
  const regular = await read('frontend/assets/icons/icon-512.png');
  for (const icon of maskable) {
    const file = await read(local(icon.src));
    assert.notDeepEqual(file, regular, `${icon.src} is a copy of the regular icon`);
    const { corner, colorType } = pngInfo(file);
    if (colorType === 6) assert.equal(corner[3], 255, `${icon.src}: transparent corner`);
  }
});

test('manifest screenshots exist at their declared sizes, one wide and one narrow', async () => {
  const manifest = JSON.parse(await read('frontend/manifest.json'));
  assert.deepEqual(manifest.screenshots.map(shot => shot.form_factor).sort(), ['narrow', 'wide']);
  for (const shot of manifest.screenshots) {
    const { width, height } = jpegSize(await read(local(shot.src)));
    assert.equal(`${width}x${height}`, shot.sizes, shot.src);
    assert.ok(shot.label, `${shot.src} has a label`);
    if (shot.form_factor === 'narrow') assert.ok(height > width, 'narrow is portrait');
    else assert.ok(width > height, 'wide is landscape');
  }
});
