// Monotonicity check of the learning curve: for every persona in test/fixtures/personas/ and k = 5..25 swipes per deck it prints
//   top = mean score of the best stay over the stops of the recommended route, judged by the profile at that k,
//   fit = the same stays judged by the profile at k = 25 (the best-known taste): the real quality of the proposal, should not fall with k,
//   overlap = share of the top-3 stays per stop that is still in the top-3 at k = 25 (should rise towards 1),
//   route = recommended route, same = whether it equals the recommendation at k = 25, match = its match percentage.
// Usage: node tools/curve.mjs [--fixtures] [--json]     (--fixtures: use test/fixtures instead of the real catalog)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../logic.js';
import { loadData, swipesOf, extrasOf, simulate, toText, DEFAULT_KS } from './simulate.mjs';

const ROOT = new URL('../', import.meta.url);
export function loadPersonas() {
  const dir = new URL('test/fixtures/personas/', ROOT);
  return fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => ({ name: f.replace('.json', ''), raw: JSON.parse(fs.readFileSync(new URL(f, dir), 'utf8')) }));
}

export const TRIP_NIGHTS = 13; // the persona experiment judged trips of about 13 nights
function ctxOf(data, prefs) {
  return { acc: data.catalog.acc, act: data.catalog.act, places: data.places.places, stays: data.places.stays, regionTags: data.places.regionTags, regionVeto: data.places.regionVeto, labels: data.labels, prefs, nights: TRIP_NIGHTS,
    vocab: { acc: Object.keys(data.tags.accommodation), act: Object.keys(data.tags.activity) } };
}

export function curve(data, persona, ks = DEFAULT_KS) {
  const swipes = swipesOf(persona.raw), { overrides, prefs } = extrasOf(persona.raw);
  const ov = L.effectiveOverrides(overrides, prefs), decks = [data.deck.acc, data.deck.act], ctx = ctxOf(data, prefs);
  const rows = ks.map(k => {
    const ranked = L.rankRoutes(data.routes, L.profileAfter(swipes, k, decks, ov), ctx);
    return { k, ranked };
  });
  const last = rows[rows.length - 1], finalId = last.ranked[0].route.id;
  const ids = plan => plan.stops.map(s => new Set(s.acc.map(a => a.item.id)));
  const finalSets = ids(last.ranked[0]);
  const finalProfile = L.profileAfter(swipes, ks[ks.length - 1], decks, ov);
  return rows.map(({ k, ranked }) => {
    const top = ranked[0], atFinal = ranked.find(p => p.route.id === finalId);
    const sets = ids(atFinal);
    const overlap = mean(sets.map((s, i) => [...s].filter(x => finalSets[i].has(x)).length / Math.max(1, finalSets[i].size)));
    const fit = mean(top.stops.map(s => (s.acc.length ? L.scoreItem(finalProfile, s.acc[0].item) : 0)));
    return { k, fit, route: top.route.id, same: top.route.id === finalId, match: top.matchPct ?? 0, topStay: mean(top.stops.map(s => (s.acc.length ? s.acc[0].score : 0))), overlap };
  });
}
// Consistency at k = 25: things the person turned down or required must not show up. Returns a list of violations (the target is none).
export function violations(data, persona, k = 25) {
  const swipes = swipesOf(persona.raw), { overrides, prefs } = extrasOf(persona.raw);
  const ov = L.effectiveOverrides(overrides, prefs), decks = [data.deck.acc, data.deck.act];
  const profile = L.profileAfter(swipes, k, decks, ov);
  const ranked = L.rankRoutes(data.routes, profile, ctxOf(data, prefs)), top = ranked[0];
  const out = [];
  // 1. a beach route on top although the beach was turned down
  if (profile.w.beach <= -0.3 && (profile.c.beach || 0) >= 1 && top.route.profile.coast >= 0.7) out.push({ rule: 'beach', text: `route ${top.route.id} (coast ${top.route.profile.coast}) on top, beach weight ${profile.w.beach}` });
  // 2. an over-budget stay in the recommended route while another route fits
  if (ranked.some(p => !p.overBudget)) for (const st of top.stops) for (const a of st.acc) if (a.tier === 3) out.push({ rule: 'budget', text: `${a.item.name} (${st.stay}) is above the budget in route ${top.route.id}` });
  // 3. kids words without kids
  const sim = simulate(swipes, data, { ks: [k], routes: 3, overrides, prefs })[0];
  if (!prefs.kids) { const m = toText(sim).match(/kindvriendelijk|leuk voor kinderen/gi); if (m) out.push({ rule: 'kids', text: `kids words in the proposal text: ${[...new Set(m.map(x => x.toLowerCase()))].join(', ')}` }); }
  // 4 and 5. activities of a dropped kind (strenuous for a laid-back profile, nightlife after a nope, a rejected dominant tag)
  const calm = L.laidBackDrops(profile), dis = L.dislikedTags(profile), nightOut = profile.w.nightlife < 0 && (profile.c.nightlife || 0) >= 1;
  for (const plan of ranked.slice(0, 3)) for (const st of plan.stops) for (const a of st.acts) {
    const tw = L.tagWeights(a.item), why = [];
    if (calm.some(t => tw[t] >= 0.3)) why.push('strenuous tag'); if (calm.length && tw.effort_high >= 0.5) why.push('effort_high');
    if (calm.length && a.item.durationH >= 4 && Math.max(tw.hike || 0, tw.hike_hard || 0) >= 0.3) why.push('long hike');
    if (nightOut && tw.nightlife >= 0.8) why.push('nightlife'); if (Object.entries(tw).some(([t, w]) => dis.has(t) && w >= 0.8)) why.push('disliked dominant tag');
    if (why.length) out.push({ rule: 'activity', text: `${a.item.name} (${st.stay}, route ${plan.route.id}): ${why.join(', ')}` });
  }
  return out;
}
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = loadData(process.argv.includes('--fixtures') ? 'test/fixtures/destination.json' : undefined);
  const personas = loadPersonas();
  if (process.argv.includes('--check')) {
    let total = 0;
    console.log('persona  beach budget kids activity  (violations at k=25, target 0)');
    for (const p of personas) {
      const v = violations(data, p);
      total += v.length;
      const n = r => String(v.filter(x => x.rule === r).length).padStart(6);
      console.log(p.name.padEnd(8), n('beach'), n('budget'), n('kids'), n('activity'), v.length ? '   ' + v.slice(0, 3).map(x => x.text).join(' | ') : '');
    }
    console.log('total violations:', total);
    process.exit(total ? 1 : 0);
  }
  const all = personas.map(p => ({ persona: p.name, rows: curve(data, p) }));
  if (process.argv.includes('--json')) console.log(JSON.stringify(all, null, 2));
  else {
    for (const { persona, rows } of all) console.log(persona.padEnd(4), rows.map(r => `k${r.k}:${r.route}${r.same ? '=' : ' '}${String(r.match).padStart(3)}% top${r.topStay.toFixed(2)} fit${r.fit.toFixed(2)} ov${r.overlap.toFixed(2)}`).join('  '));
    console.log('\nper k (mean over personas):');
    DEFAULT_KS.forEach((k, i) => {
      const rs = all.map(a => a.rows[i]);
      console.log(`k${String(k).padStart(2)}  top-stay ${mean(rs.map(r => r.topStay)).toFixed(3)}  fit@25 ${mean(rs.map(r => r.fit)).toFixed(3)}  top-3 overlap with k25 ${mean(rs.map(r => r.overlap)).toFixed(2)}  same route as k25 ${rs.filter(r => r.same).length}/${rs.length}  match ${mean(rs.map(r => r.match)).toFixed(0)}%`);
    });
  }
}
