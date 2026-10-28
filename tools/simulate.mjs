// Simulate the app's proposal from a swipes file, for the first k cards of each deck (k = 5, 10, 15, 20, 25).
// Used by the learning-curve experiment: every k gives one blind-scorable proposal (JSON + readable Dutch text).
//
//   node tools/simulate.mjs swipes.json                      all k, text on stdout
//   node tools/simulate.mjs swipes.json --json               JSON on stdout
//   node tools/simulate.mjs swipes.json --k 10,25 --routes 3 detail for the 3 best routes
//   node tools/simulate.mjs swipes.json --out out/           writes out/k05.json, out/k05.txt, ... and out/summary.json
//   node tools/simulate.mjs swipes.json --fixtures           use test/fixtures instead of the real catalog
//   node tools/simulate.mjs swipes.json --group other.json   combine with another person's swipes (group proposal)
// swipes.json: {cardId: -1|1|2} or a user record {swipes: {...}}; the first k cards of a deck are the first k in deck order.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../logic.js';

const ROOT = new URL('../', import.meta.url);
const read = p => JSON.parse(fs.readFileSync(new URL(p, ROOT), 'utf8'));
const readOpt = p => { try { return read(p); } catch { return null; } };
export const DEFAULT_KS = [5, 10, 15, 20, 25];

export function loadData(destFile = 'destinations/corsica/destination.json') {
  const dest = read(destFile);
  const catalogs = dest.catalogs.map(readOpt).filter(Boolean);
  const tags = read(dest.tags), places = read(dest.places);
  return {
    dest, tags, places, routes: read(dest.routes).routes,
    catalog: L.mergeCatalogs(catalogs), deck: L.normalizeDeck(readOpt(dest.deck) || {}), labels: L.flattenLabels(tags),
  };
}
export const swipesOf = raw => L.cleanSwipes(raw && raw.swipes ? raw.swipes : raw);
// optional profile corrections in swipes.json: {swipes, overrides: {tag: -1|0|1}, prefs: {airco, ev, kids, budget}}
export const extrasOf = raw => ({ overrides: L.cleanOverrides(raw && raw.overrides), prefs: L.cleanPrefs(raw && raw.prefs) });

const euro = n => (n > 0 ? '€'.repeat(Math.round(n)) : '');
const dur = h => (typeof h !== 'number' ? '' : h < 1 ? Math.round(h * 60) + ' min' : 'ca. ' + (Math.round(h * 2) / 2) + ' u');

function proposalFor(k, swipes, data, { routes: nDetail = 1, profile: given = null, ov = {}, prefs = {} } = {}) {
  const decks = [data.deck.acc, data.deck.act];
  const profile = given || L.profileAfter(swipes, k, decks, ov);
  const ctx = { acc: data.catalog.acc, act: data.catalog.act, places: data.places.places, stays: data.places.stays, regionTags: data.places.regionTags, regionVeto: data.places.regionVeto, labels: data.labels, prefs, nights: 13, vocab: { acc: Object.keys(data.tags.accommodation), act: Object.keys(data.tags.activity) } };
  const ranked = L.rankRoutes(data.routes, profile, ctx);
  const label = t => data.labels[t] || t;
  const itinerary = ranked.slice(0, nDetail).map(p => ({
    route: p.route.id, title: p.route.title, matchPct: p.matchPct, shifted: p.shifted, nights: p.route.nights.reduce((a, b) => a + b, 0),
    stops: p.stops.map(s => ({
      stay: s.stay, name: (data.places.stays[s.stay] || {}).name || s.stay, nights: s.nights, baseNights: s.baseNights, must: s.must,
      accommodations: s.acc.map(a => ({ id: a.item.id, name: a.item.name, priceLevel: a.item.priceLevel ?? null, tags: Object.keys(L.tagWeights(a.item)), score: +a.score.toFixed(3), why: a.why.text, con: a.why.con ? a.why.con.text : null, tier: a.tier, unconfirmed: a.unconfirmed, airco: (L.tagWeights(a.item).airco || 0) >= 0.5, ev: (L.tagWeights(a.item).ev_charging || 0) >= 0.5 })),
      activities: s.acts.map(a => ({ id: a.item.id, name: a.item.name, km: Math.round(a.km), driveMin: a.driveMin, durationH: a.item.durationH ?? null, tags: Object.keys(L.tagWeights(a.item)), score: +a.score.toFixed(3) })),
    })),
  }));
  return {
    k, swipes: profile.n,
    profile: { likes: L.topTags(profile, { n: 6, sign: 1, hide: L.hiddenReasons(prefs) }).map(t => label(t.tag)), dislikes: L.topTags(profile, { n: 4, sign: -1, hide: L.hiddenReasons(prefs) }).map(t => label(t.tag)) },
    ranking: ranked.map(p => ({ route: p.route.id, title: p.route.title, matchPct: p.matchPct, score: +p.score.toFixed(3) })),
    itinerary, _profile: profile,
  };
}

// swipes: {cardId: value}; other: optional second person (group proposal)
export function simulate(swipes, data, { ks = DEFAULT_KS, routes = 1, other = null, overrides = {}, prefs = {} } = {}) {
  const ov = L.effectiveOverrides(L.cleanOverrides(overrides), L.cleanPrefs(prefs)), pf = L.cleanPrefs(prefs);
  const decks = [data.deck.acc, data.deck.act];
  const full = L.profileAfter(swipes, 1e9, decks, ov);
  const fullOther = other ? L.profileAfter(other, 1e9, decks) : null;
  const finalProfile = other ? L.groupProfile([full, fullOther]) : full;
  const finalRank = proposalFor(0, swipes, data, { profile: finalProfile, prefs: pf }).ranking;
  const out = ks.map(k => {
    const profile = other ? L.groupProfile([L.profileAfter(swipes, k, decks, ov), L.profileAfter(other, k, decks)]) : null;
    const p = proposalFor(k, swipes, data, { routes, profile, ov, prefs: pf });
    const prof = profile || L.profileAfter(swipes, k, decks, ov);
    p.similarityToFull = +L.profileSimilarity(prof, finalProfile).toFixed(3);
    p.sameTopRouteAsFull = p.ranking[0].route === finalRank[0].route;
    delete p._profile;
    return p;
  });
  return out;
}

export function toText(p) {
  const lines = [];
  lines.push(`=== ${p.k} kaarten per deck (${p.swipes} swipes verwerkt) ===`);
  lines.push(`Jij houdt van: ${p.profile.likes.join(', ') || '(nog niets)'}`);
  if (p.profile.dislikes.length) lines.push(`Liever niet: ${p.profile.dislikes.join(', ')}`);
  lines.push('');
  lines.push('Gerangschikte routes: ' + p.ranking.map(r => `${r.route.toUpperCase()} ${r.matchPct == null ? 'minder passend' : r.matchPct + '%'}`).join(' > '));
  for (const it of p.itinerary) {
    lines.push('');
    lines.push(`Route ${it.route.toUpperCase()}: ${it.title} (${it.matchPct == null ? 'minder passend' : 'match ' + it.matchPct + '%'}, ${it.nights} nachten${it.shifted ? ', nachten aangepast aan jouw smaak' : ''})`);
    it.stops.forEach((s, i) => {
      lines.push(`  ${i + 1}. ${s.name}, ${s.nights} nachten${s.nights !== s.baseNights ? ` (was ${s.baseNights})` : ''}`);
      lines.push('     Verblijven' + (s.must && s.must.length ? ' (' + s.must.map(m => (m.key === 'ev' ? 'Laadpaal' : 'Airco') + ': ' + m.confirmed + ' van ' + m.total + ' bevestigd').join(', ') + ')' : '') + ':');
      s.accommodations.forEach((a, n) => lines.push(`       ${n + 1}) ${a.name}${euro(a.priceLevel) ? ' ' + euro(a.priceLevel) : ''} [${a.tags.join(', ')}] - ${a.why}${a.con ? ' (' + a.con + ')' : ''}${a.unconfirmed && a.unconfirmed.length ? ' ' + a.unconfirmed.map(t => '{' + t + ' onbekend}').join(' ') : ''}${a.absent && a.absent.length ? ' ' + a.absent.map(t => '{geen ' + t + '}').join(' ') : ''}${a.tier === 3 ? ' {boven je budget}' : a.tier === 2 ? ' {alleen omdat er niets anders is}' : ''}`));
      lines.push('     Activiteiten in de buurt:');
      s.activities.forEach((a, n) => lines.push(`       ${n + 1}) ${a.name} (${[a.km + ' km', 'ca. ' + a.driveMin + ' min rijden', dur(a.durationH)].filter(Boolean).join(', ')}) [${a.tags.join(', ')}]`));
    });
  }
  return lines.join('\n');
}

function parseArgs(argv) {
  const a = { files: [], ks: DEFAULT_KS, routes: 1, json: false, out: null, fixtures: false, group: null };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === '--json') a.json = true;
    else if (v === '--fixtures') a.fixtures = true;
    else if (v === '--k') a.ks = argv[++i].split(',').map(Number).filter(n => Number.isInteger(n) && n > 0);
    else if (v === '--routes') a.routes = Math.max(1, Number(argv[++i]) || 1);
    else if (v === '--out') a.out = argv[++i];
    else if (v === '--group') a.group = argv[++i];
    else a.files.push(v);
  }
  return a;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.files.length) { console.error('usage: node tools/simulate.mjs swipes.json [--json] [--k 5,10] [--routes N] [--out DIR] [--fixtures] [--group other.json]'); process.exit(2); }
  const data = loadData(args.fixtures ? 'test/fixtures/destination.json' : undefined);
  const json = f => JSON.parse(fs.readFileSync(f, 'utf8'));
  const mine = json(args.files[0]);
  const result = simulate(swipesOf(mine), data, { ks: args.ks, routes: args.routes, other: args.group ? swipesOf(json(args.group)) : null, ...extrasOf(mine) });
  if (args.out) {
    fs.mkdirSync(args.out, { recursive: true });
    for (const p of result) {
      const base = path.join(args.out, 'k' + String(p.k).padStart(2, '0'));
      fs.writeFileSync(base + '.json', JSON.stringify(p, null, 2));
      fs.writeFileSync(base + '.txt', toText(p) + '\n');
    }
    fs.writeFileSync(path.join(args.out, 'summary.json'), JSON.stringify(result.map(p => ({ k: p.k, swipes: p.swipes, top: p.ranking[0], similarityToFull: p.similarityToFull, sameTopRouteAsFull: p.sameTopRouteAsFull })), null, 2));
    console.log('written to', args.out);
  } else if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.map(toText).join('\n\n'));
}
