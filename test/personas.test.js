// The eight blind-test personas (test/fixtures/personas/p1..p8.json = their swipes, prefs and overrides on the real swipe deck).
// More cards must sharpen the profile, never wash it out or flip it.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../logic.js';
import { loadData } from '../tools/simulate.mjs';
import { loadPersonas, curve } from '../tools/curve.mjs';

const root = new URL('../', import.meta.url);
const hasDeck = fs.existsSync(new URL('destinations/swipe-deck.json', root));
const personas = loadPersonas();

test('eight personas are present', () => { assert.equal(personas.length, 8); });

test('profileAfter(k=10) vs k=25: the top-5 liked tags keep their sign for every persona', { skip: !hasDeck && 'swipe deck not delivered' }, () => {
  const deck = L.normalizeDeck(JSON.parse(fs.readFileSync(new URL('destinations/swipe-deck.json', root), 'utf8')));
  for (const p of personas) {
    const sw = L.cleanSwipes(p.raw.swipes);
    const a = L.profileAfter(sw, 10, [deck.acc, deck.act]), b = L.profileAfter(sw, 25, [deck.acc, deck.act]);
    const top = L.topTags(a, { n: 5, sign: 1 });
    assert.equal(top.length, 5, p.name);
    for (const t of top) assert.ok(b.w[t.tag] >= 0, `${p.name}: ${t.tag} ${t.w} -> ${b.w[t.tag]}`); // never flips to a dislike
    assert.ok(top.filter(t => b.w[t.tag] > 0).length >= 4, p.name + ': at least 4 of the top 5 stay liked');
  }
});

test('profile strength does not dilute: the score of an item on its liked tags stays level from k=10 to k=25', { skip: !hasDeck && 'swipe deck not delivered' }, () => {
  const deck = L.normalizeDeck(JSON.parse(fs.readFileSync(new URL('destinations/swipe-deck.json', root), 'utf8')));
  for (const p of personas) {
    const sw = L.cleanSwipes(p.raw.swipes);
    const a = L.profileAfter(sw, 10, [deck.acc, deck.act]), b = L.profileAfter(sw, 25, [deck.acc, deck.act]);
    const best = L.topTags(a, { n: 1, sign: 1 })[0].tag;
    assert.ok(L.scoreItem(b, { tags: [best] }) >= 0.3, `${p.name}: ${best} still scores well`);
  }
});

test('curve: quality judged by the final profile does not fall with k (real catalog)', { skip: !hasDeck && 'swipe deck not delivered' }, () => {
  const data = loadData();
  const rows = personas.map(p => curve(data, p));
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const fit = rows[0].map((_, i) => mean(rows.map(r => r[i].fit)));
  for (let i = 1; i < fit.length; i++) assert.ok(fit[i] >= fit[i - 1] - 0.01, 'fit@25 per k: ' + fit.map(x => x.toFixed(3)).join(' '));
  const overlap = rows[0].map((_, i) => mean(rows.map(r => r[i].overlap)));
  for (let i = 1; i < overlap.length; i++) assert.ok(overlap[i] >= overlap[i - 1] - 1e-9, 'overlap with k25 rises: ' + overlap.map(x => x.toFixed(2)).join(' '));
  assert.equal(overlap.at(-1), 1);
});

test('curve runs on the fixtures too', () => {
  const data = loadData('test/fixtures/destination.json');
  const rows = curve(data, { name: 'x', raw: { swipes: {}, prefs: { airco: true } } });
  assert.equal(rows.length, 5); assert.equal(rows.at(-1).overlap, 1);
});
