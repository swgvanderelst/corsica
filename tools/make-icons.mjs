// Renders the home-screen icons (island silhouette on teal) with headless Edge.
// Usage: node tools/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchEdge } from './edge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { outline } = JSON.parse(fs.readFileSync(path.join(ROOT, 'destinations/corsica/places.json'), 'utf8'));
const X = lon => ((lon - 8.45) * 300), Y = lat => ((43.05 - lat) * 400);
const d = 'M' + outline.map(p => X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1)).join(' L') + ' Z';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a7488"/><stop offset="1" stop-color="#2f5d4a"/></linearGradient></defs>
<rect width="512" height="512" fill="url(#g)"/><g transform="translate(150 66) scale(.62)"><path d="${d}" fill="#fff" stroke="#fff" stroke-width="6" stroke-linejoin="round"/></g>
<circle cx="296" cy="330" r="22" fill="#f2c230" stroke="#fff" stroke-width="7"/></svg>`;
const shots = [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]];
const { browser, close } = await launchEdge();
try {
  for (const [file, size] of shots) {
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(`<style>*{margin:0}html,body{width:100%;height:100%;overflow:hidden}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    await page.screenshot({ path: path.join(ROOT, file), type: 'png' });
    await page.close();
    console.log('wrote', file);
  }
} finally { await close(); }
