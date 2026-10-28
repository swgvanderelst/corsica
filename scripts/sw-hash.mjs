// Writes test/sw-version.json: a hash of the precached files (shell + destination data) plus the VERSION they were released under.
// Run after bumping VERSION in sw.js:  node scripts/sw-hash.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const list = (src, name) => JSON.parse(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`).exec(src)[1].replace(/'/g, '"'));
const TEXT = /\.(js|mjs|json|html|css|webmanifest|svg)$/;
export function shellHash() {
  const src = fs.readFileSync(new URL('sw.js', root), 'utf8');
  const shell = list(src, 'SHELL'), data = list(src, 'DATA');
  const files = [...new Set([...shell, ...data].map(f => (f === './' ? 'index.html' : f)))].sort();
  const h = crypto.createHash('sha256');
  for (const f of files) {
    const buf = fs.readFileSync(new URL(f, root));
    h.update(f + '|');
    h.update(TEXT.test(f) ? buf.toString('latin1').replace(/\r\n/g, '\n') : buf); // text is CRLF-independent, images are hashed as they are
    h.update('|');
  }
  return { version: /const VERSION = '([^']+)'/.exec(src)[1], hash: h.digest('hex'), files, data };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version, hash } = shellHash();
  fs.writeFileSync(new URL('test/sw-version.json', root), JSON.stringify({ version, hash }, null, 2) + '\n');
  console.log('test/sw-version.json updated:', version, hash.slice(0, 12));
}
