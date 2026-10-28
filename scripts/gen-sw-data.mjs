// Rewrites the DATA list in sw.js: the JSON data under destinations/ and the swipe-deck images are precached (about 50 images).
// Catalog and stay images (tens of MB) are cached when they are viewed, or by the "Download voor offline" button on a route.
// Run it after the catalog changes, then bump VERSION and run scripts/sw-hash.mjs (the test fails until you do).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
export function dataFiles() {
  const out = [];
  const walk = dir => {
    for (const e of fs.readdirSync(new URL(dir, root), { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      const rel = dir + e.name;
      if (e.isDirectory()) walk(rel + '/'); else if (rel.endsWith('.json') || rel.startsWith('destinations/img/deck/')) out.push(rel);
    }
  };
  walk('destinations/');
  return out.sort();
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = new URL('sw.js', root);
  const src = fs.readFileSync(file, 'utf8');
  const list = '[\n' + dataFiles().map(f => `  '${f}'`).join(',\n') + '\n]';
  fs.writeFileSync(file, src.replace(/const DATA = \[[\s\S]*?\];/, () => `const DATA = ${list};`));
  console.log('sw.js DATA updated:', dataFiles().length, 'files');
}
