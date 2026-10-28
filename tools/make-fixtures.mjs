// Writes small deterministic fixtures under test/fixtures/ (catalog, deck, destination manifest).
// They follow the same schemas as the researched catalog, so the app and the tests run before (or without) the real data.
// Usage: node tools/make-fixtures.mjs
import fs from 'node:fs';

const root = new URL('../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, root), 'utf8'));
const tags = read('destinations/tags.json'), places = read('destinations/corsica/places.json');
const ACC = Object.keys(tags.accommodation), ACT = Object.keys(tags.activity);
const TYPES = ['hotel', 'boutique', 'villa', 'apartment', 'bnb', 'glamping', 'camping', 'agriturismo'];
const REGIONS = ['calvi', 'stflorent', 'porto', 'corte', 'vivario', 'zonza', 'portov', 'bonifacio', 'propriano', 'ajaccio'];
const STAY_IMG = Object.fromEntries(REGIONS.map(r => [r, places.stays[r].img]));

let seed = 7;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pick = (arr, n) => { const a = arr.slice(), out = []; while (out.length < n && a.length) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
const photo = key => ({ file: `stay-img/${key}.jpg`, lic: 'CC BY-SA 4.0', author: 'Fixture', page: 'https://commons.wikimedia.org/' });

const accommodations = [];
for (const region of REGIONS) {
  const [lon, lat] = places.places[region];
  TYPES.slice(0, 4).forEach((type, i) => {
    const t = [type, ...pick(ACC.filter(x => !TYPES.includes(x)), 4)];
    accommodations.push({
      id: `fx-acc-${region}-${i}`, name: `Fixture ${places.stays[region].short} ${type}`, region, url: 'https://example.com/' + region + i,
      lat: +Math.max(41.4, lat + (rnd() - 0.5) * 0.06).toFixed(4), lon: +(lon + (rnd() - 0.5) * 0.06).toFixed(4), priceLevel: 1 + (i % 4), tags: t,
      desc: `Testverblijf ${i + 1} bij ${places.stays[region].short}.`, photo: photo(STAY_IMG[region]), photoGeneric: i % 2 === 0,
    });
  });
}
const activities = [];
for (const region of REGIONS) {
  const [lon, lat] = places.places[region];
  for (let i = 0; i < 7; i++) {
    activities.push({
      id: `fx-act-${region}-${i}`, name: `${['Kloof', 'Toren', 'Baai', 'Markt', 'Pad', 'Grot', 'Meer'][i]} ${places.stays[region].short}`, region, url: 'https://example.com/act/' + region + i,
      lat: +Math.max(41.4, lat + (rnd() - 0.5) * 0.3).toFixed(4), lon: +(lon + (rnd() - 0.5) * 0.3).toFixed(4), durationH: [1, 2, 3, 4, 0.5][i % 5],
      tags: pick(ACT, 3), desc: 'Testactiviteit.', photo: i % 2 ? photo(STAY_IMG[region]) : null,
    });
  }
}
// decks: every tag appears in at least 3 cards (round robin first, random after)
const mkDeck = (kind, vocab, n) => {
  const cards = [];
  for (let i = 0; i < n; i++) {
    const t = new Set([vocab[i % vocab.length], vocab[(i + 9) % vocab.length], vocab[(i + 18) % vocab.length]]);
    if (kind === 'acc' && i % 4 === 0) t.add(TYPES[i % TYPES.length]);
    const weights = i % 2 ? Object.fromEntries([...t].map((k, j) => [k, +(1 - j * 0.2).toFixed(1)])) : [...t];
    const region = REGIONS[i % REGIONS.length];
    cards.push({ id: `fx-${kind}-${String(i + 1).padStart(2, '0')}`, title: `Fixture ${kind === 'acc' ? 'verblijf' : 'activiteit'} ${i + 1}`, sub: [...t].map(k => tags[kind === 'acc' ? 'accommodation' : 'activity'][k] || k).join(' · '), tags: weights, photo: { ...photo(STAY_IMG[region]), file: '../../destinations/corsica/stay-img/' + STAY_IMG[region] + '.jpg' } });
  }
  return cards;
};
fs.mkdirSync(new URL('test/fixtures/', root), { recursive: true });
const w = (p, o) => fs.writeFileSync(new URL('test/fixtures/' + p, root), JSON.stringify(o, null, 1) + '\n');
w('catalog.json', { accommodations, activities });
w('deck.json', { accommodations: mkDeck('acc', ACC, 25), activities: mkDeck('act', ACT, 25) });
const dest = read('destinations/corsica/destination.json');
w('destination.json', { ...dest, catalogs: ['test/fixtures/catalog.json'], deck: 'test/fixtures/deck.json' });
console.log('fixtures written:', accommodations.length, 'accommodations,', activities.length, 'activities, 50 cards');

// A hostile destination for the XSS test: markup in route ids, titles and numeric fields, a foreign-origin file and a javascript: link
const base = read('destinations/corsica/routes.json').routes[0];
const bomb = '<img src=x onerror=window.__pwned=1>';
const evilRoutes = [
  { ...base, id: '"' + bomb, days: undefined },
  { ...base, id: 'a', title: bomb, sub: bomb, lead: bomb, ferry: bomb, nights: [bomb, 3, 4], legs: base.legs.map(l => ({ ...l, from: bomb, km: bomb, min: bomb })), days: [{ stay: 'calvi', title: bomb, text: bomb }] },
  { ...base, id: 'b</script><svg onload=window.__pwned=1>' },
];
w('evil-routes.json', { routes: evilRoutes });
w('evil-destination.json', { ...dest, catalogs: ['test/fixtures/catalog.json', 'https://evil.example/catalog.json'], deck: 'test/fixtures/deck.json', routes: 'test/fixtures/evil-routes.json', base: 'https://evil.example/', credits: 'https://evil.example/credits.json' });
console.log('evil fixtures written');
