// Schema checks. The checker is verified on the fixtures (and on deliberately broken copies);
// the same checks then run on the real catalog and swipe deck as soon as those files exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mergeCatalogs, normalizeDeck } from '../logic.js';
import { checkItems, checkDeck, checkCoverage, checkPlacesRoutes, photoProblems, fileExists } from './catalog-check.js';

const ROOT = new URL('../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, ROOT), 'utf8'));
const has = p => fs.existsSync(new URL(p, ROOT));
const tags = read('destinations/tags.json');
const places = read('destinations/corsica/places.json');
const routes = read('destinations/corsica/routes.json').routes;
const dest = read('destinations/corsica/destination.json');
const credits = read('destinations/corsica/credits.json');
const exists = fileExists(ROOT, dest.base);
const regions = Object.keys(places.stays);
const ctx = { vocab: null, regions, credits, exists, tags };
const clone = o => JSON.parse(JSON.stringify(o));

const fxCatalog = mergeCatalogs([read('test/fixtures/catalog.json')]);
const fxDeck = normalizeDeck(read('test/fixtures/deck.json'));

function all({ catalog, deck }) {
  return [
    ...checkItems('accommodation', catalog.acc, { ...ctx, vocab: tags.accommodation }),
    ...checkItems('activity', catalog.act, { ...ctx, vocab: tags.activity }),
    ...checkDeck(deck, ctx),
    ...checkCoverage({ catalog, places, routes }),
  ];
}

test('places.json and routes.json: complete and consistent', () => {
  assert.deepEqual(checkPlacesRoutes({ places, routes, tags }), []);
  assert.ok(routes.length >= 6, 'A, B, C plus 3-5 variants');
  assert.deepEqual(routes.slice(0, 3).map(r => r.id), ['a', 'b', 'c']);
  assert.deepEqual(regions.slice().sort(), ['ajaccio', 'bonifacio', 'calvi', 'corte', 'portov', 'propriano', 'porto', 'stflorent', 'vivario', 'zonza'].sort());
});

test('the checker accepts the fixtures', () => {
  assert.deepEqual(all({ catalog: fxCatalog, deck: fxDeck }), []);
});

test('the checker finds every kind of problem', () => {
  const bad = (mut) => { const c = clone(fxCatalog), d = clone(fxDeck); mut(c, d); return all({ catalog: c, deck: d }); };
  const has1 = (probs, re) => assert.ok(probs.some(p => re.test(p)), re + ' not found in ' + JSON.stringify(probs.slice(0, 5)));
  has1(bad(c => { c.acc[0].lat = 51; }), /not on Corsica/);
  has1(bad(c => { c.act[0].lon = 2; }), /not on Corsica/);
  has1(bad(c => { c.acc[0].tags = ['not_a_tag']; }), /not in tags.json/);
  has1(bad(c => { c.acc[0].tags = []; }), /no tags/);
  has1(bad(c => { c.acc[0].url = 'ftp://x.com'; }), /http/);
  has1(bad(c => { c.acc[0].region = 'mars'; }), /not a stay region/);
  has1(bad(c => { c.acc[0].priceLevel = 9; }), /priceLevel/);
  has1(bad(c => { c.acc[0].photo = { file: 'https://x.org/a.jpg' }; c.acc[0].photoGeneric = false; }), /no licence/);
  has1(bad(c => { c.acc[0].photo = null; }), /photo: no photo/);
  has1(bad(c => { c.acc[0].photoGeneric = { file: 'x.jpg' }; }), /photoGeneric must be true or false/);
  has1(bad(c => { c.acc[0].photo = { file: 'nope/missing.jpg', license: 'CC0' }; }), /does not exist/);
  assert.deepEqual(bad(c => { c.act[0].photo = null; c.act[1].photo = null; }), [], 'activity photos are optional');
  has1(bad(c => { c.act[0].photo = { file: 'https://x.org/a.jpg' }; }), /photo: no licence/);
  has1(bad(c => { c.act[0].durationH = 0; }), /durationH/);
  has1(bad(c => { c.act[0].desc = ''; }), /no desc/);
  has1(bad(c => { c.act[0].name = ''; }), /no name/);
  has1(bad(c => { c.act[1].id = c.act[0].id; }), /duplicate id/);
  has1(bad(c => { c.act[0].id = 'bad id!'; }), /not HTML-safe/);
  has1(bad(c => { c.act[0].id = 'x'.repeat(65); }), /not HTML-safe/);
  assert.deepEqual(bad(c => { c.act[0].id = 'x'.repeat(64); }), [], 'catalog ids may be longer than card ids');
  has1(bad((c, d) => { d.acc.pop(); }), /expected 25 cards/);
  const strip = tag => (c, d) => { for (const k of d.acc) { if (Array.isArray(k.tags)) k.tags = k.tags.filter(t => t !== tag); else delete k.tags[tag]; } };
  assert.deepEqual(bad(strip('airco')), [], 'airco and ev_charging are preference toggles: 0 cards is fine');
  const stripAct = tag => (c, d) => { for (const k of d.act) { if (Array.isArray(k.tags)) k.tags = k.tags.filter(t => t !== tag); else delete k.tags[tag]; } };
  has1(bad(stripAct('train')), /tag "train" is on 0 cards/); // train needs one card
  assert.deepEqual(bad((c, d) => { stripAct('train')(c, d); d.act[0].tags = Array.isArray(d.act[0].tags) ? [...d.act[0].tags, 'train'] : { ...d.act[0].tags, train: 1 }; }), [], 'train may sit on a single card');
  has1(bad((c, d) => { for (const k of d.acc) { if (Array.isArray(k.tags)) k.tags = k.tags.filter(t => t !== 'pool'); else delete k.tags.pool; } }), /tag "pool" is on \d cards/);
  has1(bad((c, d) => { d.acc[0].tags = ['hike']; }), /not a accommodation tag/);
  has1(bad((c, d) => { d.act[0].photo = null; }), /deck card .*photo/);
  has1(bad((c, d) => { d.act[0].title = ''; d.act[0].sub = ''; }), /no title/);
  has1(bad((c, d) => { d.act[1].id = d.act[0].id; }), /duplicate id/);
  has1(bad((c, d) => { d.act[0].id = 'x y'; }), /not key-safe/);
  has1(bad((c, d) => { d.act[0].tags = []; }), /no tags/);
  has1(bad(c => { c.acc = c.acc.filter(a => a.region !== 'corte'); }), /region corte: 0 accommodations/);
  has1(bad(c => { c.act = c.act.slice(0, 3); }), /stop zonza: \d+ activities/);
  has1(checkCoverage({ catalog: fxCatalog, places: { ...places, places: { ...places.places, zonza: undefined } }, routes }), /no coordinates/);
});

test('photo licence can come from credits.json', () => {
  assert.deepEqual(photoProblems('stay-img/piana.jpg', { credits, exists }), []);
  assert.deepEqual(photoProblems('stay-img/unknown.jpg', { credits, exists: () => true }), ['no licence']);
  assert.deepEqual(photoProblems({ file: 'https://upload.wikimedia.org/x.jpg', lic: 'CC BY 4.0' }), []);
  assert.deepEqual(photoProblems({}), ['no file/url']);
});

test('places and routes problems are detected', () => {
  const p = clone(places), r = clone(routes);
  p.places.zonza = [0, 0]; delete p.stays.vivario.profile.coast; p.regionTags.coast.push('nope'); p.regionTags.weird = [];
  r[0].stays.pop(); r[1].nights[0] = 0; r[2].stops.push('nowhere'); r[3].profile.coast = 2; r[3].id = 'dd'; r[4].legs[0].via.push('mars'); r[4].legs[0].km = 0; r[5].days = [{ stay: 'zzz' }]; r.push(clone(r[6]));
  const out = checkPlacesRoutes({ places: p, routes: r, tags }).join('\n');
  for (const re of [/place zonza: bad coordinates/, /profile.coast must be 0..1/, /tag "nope"/, /unknown trait weird/, /differ in length/, /positive integers/, /stop nowhere/, /id must be one letter/, /via mars/, /needs km and min/, /unknown stay/, /duplicate/, /need \d legs/]) assert.match(out, re);
});

// ---- the real data: runs once every catalog file and the swipe deck exist (CORSICA_REAL=1 makes missing files a failure) ----
const missing = [...dest.catalogs, dest.deck].filter(f => !has(f));
const forced = process.env.CORSICA_REAL === '1';
const real = (name, fn) => test(name, t => {
  if (missing.length && !forced) return t.skip('not delivered yet: ' + missing.join(', '));
  assert.deepEqual(missing, [], 'missing files');
  return fn();
});
real('real catalog: url, coordinates on Corsica, valid tags and a licensed photo per item; coverage per region and stop; deck covers the tags', () => {
  const catalog = mergeCatalogs(dest.catalogs.map(read));
  const deck = normalizeDeck(read(dest.deck));
  assert.deepEqual(all({ catalog, deck }), []);
});
real('real catalog: every file is valid on its own', () => {
  for (const f of dest.catalogs) {
    const c = mergeCatalogs([read(f)]);
    const probs = [...checkItems('accommodation', c.acc, { ...ctx, vocab: tags.accommodation }), ...checkItems('activity', c.act, { ...ctx, vocab: tags.activity })];
    assert.deepEqual(probs, [], f);
  }
});
