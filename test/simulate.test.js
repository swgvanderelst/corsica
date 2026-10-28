import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { simulate, toText, loadData, swipesOf, extrasOf, DEFAULT_KS } from '../tools/simulate.mjs';

const data = loadData('test/fixtures/destination.json');
const swipes = {};
data.deck.acc.forEach((c, i) => { swipes[c.id] = i % 3 ? 1 : -1; });
data.deck.act.forEach((c, i) => { swipes[c.id] = i % 2 ? 2 : -1; });
const other = {};
data.deck.acc.forEach((c, i) => { other[c.id] = i % 2 ? -1 : 1; });

test('simulate: one proposal per k with ranking, 3 stays and activities per stop', () => {
  const out = simulate(swipes, data);
  assert.deepEqual(out.map(p => p.k), DEFAULT_KS);
  assert.deepEqual(out.map(p => p.swipes), [10, 20, 30, 40, 50]);
  for (const p of out) {
    assert.equal(p.ranking.length, data.routes.filter(r => !(r.maxNights < 13)).length); // a 13-night trip: short-trip templates drop out
    assert.equal(p.itinerary.length, 1);
    for (const s of p.itinerary[0].stops) { assert.equal(s.accommodations.length, 3); assert.ok(s.activities.length >= 1); }
    assert.ok(p.similarityToFull > 0 && p.similarityToFull <= 1);
    assert.equal(typeof p.sameTopRouteAsFull, 'boolean');
    assert.equal(p._profile, undefined);
  }
  assert.equal(out[4].similarityToFull, 1);
  assert.equal(out[4].sameTopRouteAsFull, true);
  assert.ok(out[0].similarityToFull < out[4].similarityToFull);
});
test('simulate: options (k list, several detailed routes, group)', () => {
  const out = simulate(swipes, data, { ks: [3], routes: 3 });
  assert.equal(out.length, 1); assert.equal(out[0].itinerary.length, 3);
  const g = simulate(swipes, data, { ks: [10, 25], other });
  assert.equal(g.length, 2); assert.equal(g[1].similarityToFull, 1);
  assert.notDeepEqual(g[1].ranking, simulate(swipes, data, { ks: [25] })[0].ranking, 'a second person changes the proposal');
});
test('toText: readable Dutch proposal', () => {
  const t = toText(simulate(swipes, data, { ks: [10] })[0]);
  assert.match(t, /=== 10 kaarten per deck \(20 swipes verwerkt\) ===/);
  assert.match(t, /Jij houdt van:/);
  assert.match(t, /Gerangschikte routes: [A-K] \d+%/);
  assert.match(t, /Verblijven:\n {7}1\) /);
  assert.match(t, /Activiteiten in de buurt:/);
  assert.match(t, /\d+ km/);
  const none = toText(simulate({}, data, { ks: [5] })[0]);
  assert.match(none, /\(nog niets\)/);
  assert.ok(!/Liever niet/.test(none));
});
test('swipesOf accepts a bare map or a user record', () => {
  assert.deepEqual(swipesOf({ a: 1, b: 7 }), { a: 1 });
  assert.deepEqual(swipesOf({ name: 'x', swipes: { a: -1 } }), { a: -1 });
  assert.deepEqual(swipesOf(null), {});
});
test('CLI: text, json and --out', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'corsica-sim-'));
  const file = path.join(dir, 'swipes.json'), file2 = path.join(dir, 'other.json');
  fs.writeFileSync(file, JSON.stringify({ swipes })); fs.writeFileSync(file2, JSON.stringify(other));
  const cli = (...args) => spawnSync(process.execPath, [new URL('../tools/simulate.mjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1'), ...args], { encoding: 'utf8' });
  const text = cli(file, '--fixtures', '--k', '10,25');
  assert.equal(text.status, 0, text.stderr); assert.match(text.stdout, /=== 25 kaarten/);
  const js = cli(file, '--fixtures', '--json', '--k', '5', '--routes', '2', '--group', file2);
  assert.equal(JSON.parse(js.stdout)[0].itinerary.length, 2);
  const out = path.join(dir, 'out');
  assert.equal(cli(file, '--fixtures', '--out', out).status, 0);
  assert.deepEqual(fs.readdirSync(out).sort(), ['k05.json', 'k05.txt', 'k10.json', 'k10.txt', 'k15.json', 'k15.txt', 'k20.json', 'k20.txt', 'k25.json', 'k25.txt', 'summary.json']);
  assert.equal(JSON.parse(fs.readFileSync(path.join(out, 'summary.json'), 'utf8')).length, 5);
  assert.equal(cli().status, 2);
});

test('simulate: overrides and prefs from swipes.json change the proposal', () => {
  const base = simulate(swipes, data, { ks: [25] })[0];
  const pref = simulate(swipes, data, { ks: [25], overrides: { camping: -1, glamping: -1 }, prefs: { airco: true, budget: 3, kids: true } })[0];
  assert.notDeepEqual(pref.profile, base.profile);
  assert.ok(pref.itinerary[0].stops.every(s => s.accommodations.every(a => a.priceLevel === null || a.priceLevel <= 3 || a.tier === 2)));
  assert.ok(pref.itinerary[0].stops.every(s => s.accommodations.every(a => a.airco || a.unconfirmed.includes('airco'))));
  const t = toText(pref);
  assert.match(t, /min rijden/);
  assert.deepEqual(extrasOf({ overrides: { pool: 1, bad: 3 }, prefs: { airco: true, budget: 9 } }), { overrides: { pool: 1 }, prefs: { airco: true } });
  assert.deepEqual(extrasOf(null), { overrides: {}, prefs: {} });
  assert.ok(simulate({}, data, { ks: [5], overrides: { pool: 1 } }).length === 1);
});
