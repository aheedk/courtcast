// One-shot icon generator. Run when the SVG sources change:
//   node scripts/generate-icons.mjs
import sharp from 'sharp';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, 'public', 'icons');
await mkdir(out, { recursive: true });

const standardSvg = await readFile(resolve(root, 'public', 'icon.svg'));
const maskableSvg = await readFile(resolve(root, 'public', 'maskable-icon.svg'));

const targets = [
  { svg: standardSvg, size: 192, name: 'icon-192.png' },
  { svg: standardSvg, size: 512, name: 'icon-512.png' },
  { svg: standardSvg, size: 180, name: 'apple-touch-icon.png' },
  { svg: maskableSvg, size: 512, name: 'icon-maskable-512.png' },
];

for (const t of targets) {
  const buf = await sharp(t.svg).resize(t.size, t.size).png().toBuffer();
  await writeFile(resolve(out, t.name), buf);
  console.log(`wrote ${t.name} (${t.size}x${t.size}, ${buf.length} bytes)`);
}
