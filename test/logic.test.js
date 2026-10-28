import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../logic.js';

const json = p => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const places = json('../destinations/corsica/places.json');
const routes = json('../destinations/corsica/routes.json').routes;
const tags = json('../destinations/tags.json');
const catalog = L.mergeCatalogs([json('./fixtures/catalog.json')]);
const deck = L.normalizeDeck(json('./fixtures/deck.json'));
const labels = L.flattenLabels(tags);
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} !~ ${b}`);

// ---- tags ----
test('tagWeights: arrays weigh 1, objects keep 0..1 weights, junk is ignored', () => {
  assert.deepEqual(L.tagWeights({ tags: ['pool', 'spa', 5] }), { pool: 1, spa: 1 });
  assert.deepEqual(L.tagWeights({ tags: { pool: 0.8, spa: 3, gym: 0, bad: 'x', neg: -1 } }), { pool: 0.8, spa: 1 });
  assert.deepEqual(L.tagWeights({ tags: 'pool' }), {});
  assert.deepEqual(L.tagWeights({}), {});
  assert.deepEqual(L.tagWeights(null), {});
});
test('flattenLabels: merges the groups, skips _doc', () => {
  const l = L.flattenLabels({ _doc: 'x', accommodation: { pool: 'Zwembad' }, activity: { hike: 'Wandelen' }, region: null });
  assert.deepEqual(l, { pool: 'Zwembad', hike: 'Wandelen' });
  assert.deepEqual(L.flattenLabels(null), {});
  assert.equal(labels.pool, 'Zwembad');
});

// ---- profile ----
const A = { id: 'a', tags: ['pool', 'sea_view'] }, B = { id: 'b', tags: { pool: 0.5, camping: 1 } }, C = { id: 'c', tags: ['hotel'] };
test('applySwipe is pure and ignores invalid values', () => {
  const s0 = { raw: {}, c: {}, pos: {}, n: 0 };
  const s1 = L.applySwipe(s0, A, 1);
  assert.deepEqual(s0, { raw: {}, c: {}, pos: {}, n: 0 });
  assert.deepEqual(s1, { raw: { pool: 1, sea_view: 1 }, c: { pool: 1, sea_view: 1 }, pos: { pool: 1, sea_view: 1 }, n: 1 });
  assert.deepEqual(L.applySwipe(s1, A, -1).pos, { pool: 1, sea_view: 1 }, 'a nope is no like');
  assert.equal(L.applySwipe(s1, A, 7), s1);
  assert.equal(L.applySwipe(s1, A, 0), s1);
  assert.deepEqual(L.applySwipe(null, C, 2), { raw: { hotel: 2 }, c: { hotel: 1 }, pos: { hotel: 1 }, n: 1 });
});
test('profileFrom: shrinkage, super like, dislike, cancel, evidence and card weights', () => {
  let p = L.profileFrom({ a: 1 }, [A, B]);
  assert.deepEqual(p.w, { pool: 0.5, sea_view: 0.5 }); // one like = +0.5
  assert.deepEqual(p.c, { pool: 1, sea_view: 1 });
  assert.equal(p.n, 1);
  p = L.profileFrom({ a: 1, b: 1 }, [A, B]);
  near(p.w.pool, 1.5 / 2.5); near(p.c.pool, 1.5); // weighted: 1 + 0.5 evidence
  p = L.profileFrom({ a: 2 }, [A]);
  assert.equal(p.w.pool, 1); // a super like saturates
  p = L.profileFrom({ a: -1 }, [A]);
  assert.equal(p.w.pool, -0.5);
  p = L.profileFrom({ a: 1, b: -1, c: 1 }, [{ id: 'a', tags: ['x'] }, { id: 'b', tags: ['x'] }, C]);
  assert.equal(p.w.x, 0); assert.equal(p.n, 3); assert.equal(p.w.hotel, 0.5);
  p = L.profileFrom({ a: 2, b: 2, c: 2 }, [{ id: 'a', tags: ['x'] }, { id: 'b', tags: ['x'] }, { id: 'c', tags: ['x'] }]);
  assert.equal(p.w.x, 1); // clamped (6 / 4 = 1.5)
});
test('profileFrom: unknown ids and missing input are harmless; deck may be an object', () => {
  assert.deepEqual(L.profileFrom({ zzz: 1 }, [A]), { w: {}, c: {}, n: 0 });
  assert.deepEqual(L.profileFrom(null, [A]), { w: {}, c: {}, n: 0 });
  assert.deepEqual(L.profileFrom({ a: 1 }, null), { w: {}, c: {}, n: 0 });
  assert.equal(L.profileFrom({ a: 1 }, { x: A }).n, 1);
  assert.equal(L.profileFrom({ a: 5 }, [A]).n, 0); // invalid swipe value is not counted
  assert.deepEqual(L.profileFrom({}, [null, A]), L.emptyProfile());
});
test('profileAfter(k): only the first k cards of each deck count', () => {
  const d1 = [A, B, C], d2 = [{ id: 'd', tags: ['hike'] }, { id: 'e', tags: ['beach'] }];
  const sw = { a: 1, b: 1, c: 1, d: 1, e: -1 };
  assert.equal(L.profileAfter(sw, 0, [d1, d2]).n, 0);
  assert.equal(L.profileAfter(sw, 1, [d1, d2]).n, 2); // a and d
  const p2 = L.profileAfter(sw, 2, [d1, d2]);
  assert.equal(p2.n, 4); assert.equal(p2.w.beach, -0.5); assert.equal(p2.w.hotel, undefined);
  assert.equal(L.profileAfter(sw, 99, [d1, d2]).n, 5);
  assert.equal(L.profileAfter(sw, 2, d1).n, 2); // a single deck works too
  assert.equal(L.profileAfter(sw, 2, undefined).n, 0);
  assert.equal(L.profileAfter({}, 5, []).n, 0);
});
test('certainty grows with evidence; similarity compares tastes', () => {
  const p = { w: { x: 0.5 }, c: { x: 2 }, n: 2 };
  near(L.certainty(p, 'x'), 0.5); assert.equal(L.certainty(p, 'y'), 0); assert.equal(L.certainty(null, 'y'), 0); assert.equal(L.certainty({}, 'y'), 0);
  const q = { w: { x: 1, y: 1 } }, r = { w: { x: -1 } };
  near(L.profileSimilarity(q, q), 1); near(L.profileSimilarity(q, r), -1 / Math.sqrt(2));
  assert.equal(L.profileSimilarity({ w: {} }, q), 0); assert.equal(L.profileSimilarity(null, null), 0);
});
test('summarize / readSummary: only safe, bounded data goes in and comes out', () => {
  const s = L.summarize({ w: { pool: 0.123456, 'Bad Tag': 1, nan: NaN, big: 5, neg: -9 }, c: { pool: 1.23456, big: 9999 }, n: 3.6 }, 42);
  assert.deepEqual(s, { w: { pool: 0.123, big: 1, neg: -1 }, c: { pool: 1.235, big: 500, neg: 0 }, n: 4, updatedAt: 42 });
  assert.equal(L.summarize({ w: {}, c: {} }, 1).n, 0);
  assert.equal(L.summarize({ w: {}, c: {}, n: 9999 }, 1).n, 500);
  const r = L.readSummary({ w: { pool: 0.5, '<x>': 1, bad: 'a', big: 7 }, c: { pool: 2 }, n: 2 });
  assert.deepEqual(r, { w: { pool: 0.5, big: 1 }, c: { pool: 2, big: 1 }, n: 2 });
  assert.deepEqual(L.readSummary(null), L.emptyProfile());
  assert.deepEqual(L.readSummary('x'), L.emptyProfile());
  assert.deepEqual(L.readSummary({ w: { a: 1 } }), { w: { a: 1 }, c: { a: 1 }, n: 0 });
  assert.equal(L.readSummary({ w: {}, n: 'x' }).n, 0);
  assert.deepEqual(L.cleanSwipes({ ok: 1, up: 2, down: -1, zero: 0, 'bad key': 1, s: '1' }), { ok: 1, up: 2, down: -1 });
  assert.deepEqual(L.cleanSwipes(null), {});
});

// ---- scoring ----
const prof = L.profileFrom({ a: 1, b: -1, c: 2, d: -1 }, [{ id: 'a', tags: ['pool'] }, { id: 'b', tags: ['camping'] }, { id: 'c', tags: ['sea_view'] }, { id: 'd', tags: ['camping'] }]);
test('scoreItem: weighted mean of the profile over the item tags, untested tags are neutral', () => {
  assert.ok(L.scoreItem(prof, { tags: ['pool', 'sea_view'] }) > 0.7);
  assert.ok(L.scoreItem(prof, { tags: ['camping'] }) < -0.3);
  assert.equal(L.scoreItem(prof, { tags: ['luxury'] }), 0); // never tested: neutral
  assert.equal(L.scoreItem(prof, { tags: [] }), 0);
  assert.equal(L.scoreItem(null, { tags: ['pool'] }), 0);
  assert.equal(L.scoreItem(L.emptyProfile(), { tags: ['pool'] }), 0);
  const diluted = L.scoreItem(prof, { tags: ['pool', 'luxury', 'gym'] });
  assert.ok(diluted > 0 && diluted < L.scoreItem(prof, { tags: ['pool'] }), 'untested tags dilute, they never penalise');
  assert.ok(Math.abs(L.scoreItem(prof, { tags: { pool: 1 } })) <= 1);
  // the score does not shrink when the profile learns unrelated tags (no dilution)
  const more = L.profileFrom({ a: 1, c: 2, d: -1, e: 1, f: 1, g: 2 }, [{ id: 'a', tags: ['pool'] }, { id: 'c', tags: ['sea_view'] }, { id: 'd', tags: ['camping'] }, { id: 'e', tags: ['hike'] }, { id: 'f', tags: ['beach'] }, { id: 'g', tags: ['spa'] }]);
  near(L.scoreItem(more, { tags: ['sea_view'] }), L.scoreItem(prof, { tags: ['sea_view'] }));
});
test('explain: matching tags with Dutch labels, rejected tags as warnings, fallback text', () => {
  const e = L.explain(prof, { tags: ['pool', 'sea_view', 'camping', 'luxury'] }, labels, 2);
  assert.deepEqual(e.match.map(m => m.tag), ['sea_view', 'pool']); // strongest first
  assert.equal(e.match[1].label, 'Zwembad');
  assert.deepEqual(e.warn.map(m => m.tag), ['camping']);
  assert.equal(e.text, 'Past bij jouw smaak: Zeezicht, Zwembad');
  assert.match(L.explain(prof, { tags: ['luxury'] }, labels).text, /Nog weinig bekend/);
  assert.equal(L.explain(prof, { tags: ['hotel', 'pool'] }).match[0].label, 'pool'); // unknown label falls back to the tag
  assert.deepEqual(L.explain(null, { tags: ['pool'] }, labels).match, []);
  assert.equal(L.explain(prof, { tags: ['pool'] }, labels, 0).match.length, 0);
  // a single nope is not a rejection: no "let op"
  const once = L.profileFrom({ b: -1 }, [{ id: 'b', tags: ['camping'] }]);
  assert.deepEqual(L.explain(once, { tags: ['camping'] }, labels).warn, []);
});

// ---- diversity ----
test('mmr: best first, ties by id, diversity beats a near-equal same-kind item', () => {
  const items = [{ id: 'b', s: 1 }, { id: 'a', s: 1 }, { id: 'c', s: 0.9 }];
  const sim = (x, y) => (x.id === 'a' && y.id === 'b') || (x.id === 'b' && y.id === 'a') ? 1 : 0;
  const out = L.mmr(items, 3, { score: i => i.s, sim, lambda: 0.35 });
  assert.deepEqual(out.map(o => o.item.id), ['a', 'c', 'b']); // a first (id tie-break), c jumps over its twin b
  assert.equal(L.mmr(items, 10, { score: i => i.s, sim }).length, 3);
  assert.equal(L.mmr([], 3, { score: () => 0, sim }).length, 0);
  assert.deepEqual(L.mmr(items, 1, { score: i => i.s, sim }).map(o => o.item.id), ['a']);
});
const acc = (id, type, extra, region = 'calvi') => ({ id, region, name: id, tags: [type, ...extra] });
test('topAccommodations: region filter, top 3, one per type when scores are close', () => {
  const p = L.profileFrom({ x: 1 }, [{ id: 'x', tags: ['pool', 'sea_view'] }]);
  const list = [acc('h1', 'hotel', ['pool', 'sea_view']), acc('h2', 'hotel', ['pool', 'sea_view']), acc('h3', 'hotel', ['pool', 'sea_view']), acc('v1', 'villa', ['pool', 'sea_view']), acc('c1', 'camping', ['pool', 'sea_view']),
    acc('other', 'hotel', ['pool', 'sea_view'], 'corte')];
  const top = L.topAccommodations(list, 'calvi', p, 3, { labels });
  assert.equal(top.length, 3);
  assert.equal(new Set(top.map(t => t.item.tags[0])).size, 3, 'three different types');
  assert.ok(top.every(t => t.item.region === 'calvi'));
  assert.ok(top.every(t => t.score > 0.2));
  assert.match(top[0].why.text, /Zwembad/);
  assert.equal(L.topAccommodations(list, 'corte', p).length, 1);
  assert.equal(L.topAccommodations(list, 'nowhere', p).length, 0);
  assert.equal(L.topAccommodations([{ id: 'n1', region: 'r', tags: ['pool'] }, { id: 'n2', region: 'r', tags: ['pool'] }], 'r', p, 2).length, 2);
  // minimum relative score: a poor match never wins a slot just for being a different type
  const mixed = [acc('h1', 'hotel', ['pool', 'sea_view']), acc('h2', 'hotel', ['pool', 'sea_view']), acc('h3', 'hotel', ['pool', 'sea_view']), acc('camp', 'camping', ['pool', 'gym', 'spa'])];
  assert.deepEqual(L.topAccommodations(mixed, 'calvi', p, 3).map(t => t.item.id), ['h1', 'h2', 'h3'], 'the weaker camping (below 80% of the best) stays out');
  assert.ok(L.topAccommodations(mixed, 'calvi', p, 3, { minRel: 0, lambda: 0.9 }).some(t => t.item.id === 'camp'), 'without the gate the diverse pick wins');
  assert.deepEqual(L.topAccommodations(mixed.slice(0, 1).concat(mixed.slice(3)), 'calvi', p, 2).map(t => t.item.id), ['h1', 'camp'], 'too few good matches: filled by plain score');
  assert.equal(L.topAccommodations(mixed, 'calvi', L.emptyProfile(), 3).length, 3);
  // the first stay does not say "nog weinig bekend" when a near-equal stay has a known match
  const q = L.profileFrom({ x: 1 }, [{ id: 'x', tags: ['pool'] }]);
  const swapped = L.topAccommodations([acc('aaa', 'hotel', ['gym']), acc('zzz', 'villa', ['pool'])], 'calvi', q, 2);
  assert.equal(swapped[0].item.id, 'zzz');
});

// ---- geography ----
test('distanceKm: haversine', () => {
  near(L.distanceKm({ lat: 42.57, lon: 8.76 }, { lat: 42.57, lon: 8.76 }), 0);
  const calviCorte = L.distanceKm({ lat: 42.57, lon: 8.76 }, { lat: 42.30, lon: 9.15 });
  assert.ok(calviCorte > 40 && calviCorte < 55, String(calviCorte));
});
test('activitiesNear: radius, best match first, n limit, km and why', () => {
  const stop = { lat: 42.0, lon: 9.0 };
  const mk = (id, dLat, tg) => ({ id, name: id, lat: 42.0 + dLat, lon: 9.0, tags: tg });
  const acts = [mk('hike', 0.05, ['hike']), mk('beach', 0.1, ['beach']), mk('far', 1, ['hike']), mk('bar', 0.02, ['nightlife']), mk('hike2', 0.06, ['hike'])];
  const p = L.profileFrom({ h: 1, b: -1, c: -1 }, [{ id: 'h', tags: ['hike'] }, { id: 'b', tags: ['beach'] }, { id: 'c', tags: ['beach'] }]);
  const out = L.activitiesNear(acts, stop, p, { radiusKm: 30, n: 8, labels });
  assert.ok(!out.some(o => o.item.id === 'far'), 'outside the radius');
  assert.equal(out.length, 3, 'the rejected beach (its dominant tag) is left out');
  assert.ok(!out.some(o => o.item.id === 'beach'));
  assert.equal(out[0].item.id, 'hike');
  near(out[0].km, 5.56, 0.1);
  assert.match(out[0].why.text, /Wandelen/);
  assert.equal(L.activitiesNear(acts, stop, p, { n: 2 }).length, 2);
  assert.equal(L.activitiesNear(acts, stop, p, { radiusKm: 1 }).length, 0);
  assert.equal(L.activitiesNear(acts, stop, p).length, 3);
  assert.equal(out[0].driveMin, Math.round(out[0].km * 1.68));
  // a single nope does not reject anything, and a rejected tag that is not the dominant one only costs a little
  const once = L.profileFrom({ b: -1 }, [{ id: 'b', tags: ['beach'] }]);
  assert.ok(L.activitiesNear(acts, stop, once).some(o => o.item.id === 'beach'));
  const minor = L.activitiesNear([mk('mix', 0.01, { hike: 1, beach: 0.5 })], stop, p);
  assert.equal(minor.length, 1);
});

// ---- routes ----
test('regionAffinity / regionMatch / adjustNights', () => {
  const rt = { coast: ['beach', 'boat'], mountains: ['hike'], town: [], quiet: ['relax'], lively: ['nightlife'] };
  const p = L.profileFrom({ a: 1, b: -1, c: 2 }, [{ id: 'a', tags: ['beach'] }, { id: 'b', tags: ['hike'] }, { id: 'c', tags: ['beach'] }]);
  const aff = L.regionAffinity(p, rt);
  assert.ok(aff.coast > 0.5); assert.ok(aff.mountains < 0); assert.equal(aff.town, 0); assert.equal(aff.quiet, 0); // untested = neutral
  assert.equal(L.regionAffinity(p, {}).coast, 0);
  assert.ok(L.regionMatch({ coast: 1, mountains: 0 }, aff) > 0.5);
  assert.ok(L.regionMatch({ coast: 0, mountains: 1 }, aff) < 0);
  assert.equal(L.regionMatch({}, aff), 0);
  assert.equal(L.regionMatch(undefined, aff), 0);
  assert.deepEqual(L.adjustNights([4, 3, 6], [0.1, 0.5, 0.2]), [3, 4, 6]); // worst -> best
  assert.deepEqual(L.adjustNights([4, 3, 6], [0.1, 0.2, 0.15]), [4, 3, 6]); // gap too small
  assert.deepEqual(L.adjustNights([2, 3], [0, 0.9]), [2, 3]); // never below the minimum
  assert.deepEqual(L.adjustNights([5], [1]), [5]);
  assert.deepEqual(L.adjustNights([3, 3], [0.5, 0.5]), [3, 3]); // best === worst
  const n = [4, 3, 6]; L.adjustNights(n, [0, 1, 0]); assert.deepEqual(n, [4, 3, 6], 'input is not mutated');
});
const ctx = { acc: catalog.acc, act: catalog.act, places: places.places, regionTags: places.regionTags, labels };
test('planRoute: 3 stays per stop, activities near, nights preserved', () => {
  const p = L.profileFrom({ [deck.act[0].id]: 1 }, deck.act);
  const plan = L.planRoute(routes[0], p, ctx);
  assert.equal(plan.stops.length, routes[0].stays.length);
  for (const s of plan.stops) { assert.ok(s.acc.length <= 3 && s.acc.length > 0); assert.ok(s.acts.length > 0); assert.ok(s.acts.every(a => a.km <= 30)); assert.ok(s.cover >= 0 && s.cover <= 1); }
  assert.equal(plan.stops.reduce((a, s) => a + s.nights, 0), routes[0].nights.reduce((a, b) => a + b, 0));
  assert.equal(plan.shifted, plan.stops.some(s => s.nights !== s.baseNights));
  for (const k of ['region', 'activity', 'acc', 'cover', 'weak']) assert.ok(Number.isFinite(plan.parts[k]), k);
  const odd = L.planRoute({ id: 'z', stays: ['nowhere'], nights: [3], profile: {} }, p, ctx);
  assert.deepEqual(odd.stops[0].acts, []); assert.deepEqual(odd.stops[0].acc, []);
  assert.equal(odd.stops[0].weak, true, 'no stay and no activity: a weak stop');
  assert.ok(odd.parts.weak > 0);
  const bare = L.planRoute({ id: 'z', stays: ['calvi'], nights: [3], profile: {} }, p, { acc: [], act: [], places: places.places });
  assert.ok(bare.score <= 0);
});
test('likedActivityTags: the favourite kinds, certain and positive, without effort tags', () => {
  const p = { w: { hike: 0.9, beach: 0.7, effort_low: 0.9, wine: 0.2, culture: 0.5, boat: 0.4 }, c: { hike: 2, beach: 1, effort_low: 3, wine: 3, culture: 1, boat: 0.5 }, n: 5 };
  assert.deepEqual(L.likedActivityTags(p, ['hike', 'beach', 'effort_low', 'wine', 'culture', 'boat', 'nightlife'], 3), ['hike', 'beach', 'culture']);
  assert.deepEqual(L.likedActivityTags(null, ['hike']), []);
});
test('planRoute: coverage counts how many favourite kinds are offered near the stops', () => {
  const stay = Object.keys(places.stays)[0], [lon, lat] = places.places[stay];
  const mk = (id, tg) => ({ id, name: 'Plek ' + id.repeat(4), lat, lon: lon + (id.charCodeAt(0) - 96) * 0.001, tags: tg });
  const p = L.profileFrom({ a: 2, b: 2 }, [{ id: 'a', tags: ['hike'] }, { id: 'b', tags: ['wine'] }]);
  const base = { acc: [], places: places.places, vocab: { act: ['hike', 'wine'] } };
  const both = L.planRoute({ id: 'z', stays: [stay], nights: [3], profile: {} }, p, { ...base, act: [mk('a', ['hike']), mk('b', ['wine'])] });
  const one = L.planRoute({ id: 'z', stays: [stay], nights: [3], profile: {} }, p, { ...base, act: [mk('a', ['hike'])] });
  assert.equal(both.stops[0].cover, 1); assert.equal(one.stops[0].cover, 0.5);
  assert.ok(both.score > one.score);
});

test('rankRoutes: mountain lovers get the mountain route, beach lovers the beach route', () => {
  const tagsOf = (id, t) => ({ id, tags: t });
  const mountain = L.profileFrom({ m1: 1, m2: 2, m3: 1, b1: -1 }, [tagsOf('m1', ['hike', 'swim_river']), tagsOf('m2', ['hike_hard', 'village']), tagsOf('m3', ['mountain_view', 'nature']), tagsOf('b1', ['beach', 'boat'])]);
  const beach = L.profileFrom({ m1: -1, m2: -1, b1: 2, b2: 1 }, [tagsOf('m1', ['hike', 'swim_river']), tagsOf('m2', ['hike_hard', 'village']), tagsOf('b1', ['beach', 'boat']), tagsOf('b2', ['snorkel', 'sea_view'])]);
  const rm = L.rankRoutes(routes, mountain, ctx), rb = L.rankRoutes(routes, beach, ctx);
  assert.equal(rm.length, routes.length);
  assert.equal(rm[0].route.id, 'd', 'the mountain route wins for mountain lovers');
  assert.equal(rb[0].route.id, 'e', 'the beach route wins for beach lovers');
  // the first is the best; the alternatives are only varied a little (same first stop = small nudge)
  for (const r of [rm, rb]) assert.ok(r.slice(1).every(x => x.score <= r[0].score));
  const flat = L.rankRoutes(routes, L.emptyProfile(), ctx);
  assert.deepEqual(flat.map(x => x.route.id).sort(), routes.map(r => r.id).sort());
  assert.equal(L.rankRoutes(routes.slice(0, 2), mountain, ctx, { radiusKm: 10, nActs: 3 })[0].stops[0].acts.length <= 3, true);
});
test('rankRoutes: alternatives do not all start in the same place', () => {
  const mk = (id, first, score) => ({ id, stays: [first], nights: [3], profile: { coast: score, mountains: 0, town: 0, quiet: 0, lively: 0 } });
  const rs = [mk('a', 'calvi', 0.9), mk('b', 'calvi', 0.85), mk('c', 'calvi', 0.83), mk('d', 'porto', 0.8)];
  const p = L.profileFrom({ x: 2 }, [{ id: 'x', tags: ['beach'] }]);
  const out = L.rankRoutes(rs, p, { acc: [], act: [], places: places.places, regionTags: { coast: ['beach'] } });
  assert.equal(out[0].route.id, 'a');
  assert.equal(out[1].route.id, 'd', 'the top 3 do not open with the same first two stops');
  assert.equal(out[2].route.id, 'b', 'when every route left opens the same way, plain score decides');
});

// ---- groups ----
test('groupProfile: mean over those who tested, evidence summed, empty members ignored', () => {
  const a = { w: { pool: 1, hike: -0.5 }, c: { pool: 2, hike: 1 }, n: 4 }, b = { w: { pool: 0.5, beach: 1 }, c: { pool: 1, beach: 3 }, n: 3 }, none = L.emptyProfile();
  const g = L.groupProfile([a, b, none, null]);
  assert.equal(g.members.length, 2);
  near(g.w.pool, 0.75); assert.equal(g.w.hike, -0.5); assert.equal(g.w.beach, 1);
  assert.equal(g.c.pool, 3); assert.equal(g.n, 7);
  assert.equal(L.groupProfile([a, none]), a, 'one real profile stays as it is');
  assert.deepEqual(L.groupProfile([]).members, []);
  assert.equal(L.groupProfile(null).n, 0);
});
test('least misery: a strong dislike by one member costs the group score', () => {
  const lover = L.profileFrom({ x: 2 }, [{ id: 'x', tags: ['camping'] }]);
  const hater = L.profileFrom({ x: -1, y: -1 }, [{ id: 'x', tags: ['camping'] }, { id: 'y', tags: ['camping'] }]);
  const other = L.profileFrom({ y: 1 }, [{ id: 'y', tags: ['pool'] }]);
  const item = { tags: ['camping'] };
  const g = L.groupProfile([lover, hater]);
  const mean = (L.scoreItem(lover, item) + L.scoreItem(hater, item)) / 2;
  assert.ok(L.scoreItem(hater, item) < -0.6, 'the hater scores it low (and the soft penalty applies)');
  assert.ok(L.scoreItem(g, item) < mean - 0.3, 'penalty applies');
  const happy = L.groupProfile([lover, L.profileFrom({ x: 1 }, [{ id: 'x', tags: ['camping'] }])]);
  assert.ok(L.scoreItem(happy, item) > 0.7);
  const mild = L.groupProfile([lover, other]);
  assert.equal(L.scoreItem(mild, { tags: ['camping'] }), L.scoreItem(lover, { tags: ['camping'] }) / 2);
  assert.equal(L.scoreItem(L.groupProfile([lover]), item), L.scoreItem(lover, item));
});

// ---- profile screen ----
test('topTags: sign, order, limit', () => {
  const p = { w: { a: 0.9, b: 0.9, c: 0.2, d: -0.7, e: -0.1, z: 0 }, c: { a: 1, b: 3, c: 1, d: 1, e: 1, z: 1 }, n: 5 };
  assert.deepEqual(L.topTags(p).map(t => t.tag), ['b', 'a', 'c']); // b has more evidence than a
  assert.deepEqual(L.topTags(p, { sign: -1 }).map(t => t.tag), ['d', 'e']);
  assert.deepEqual(L.topTags(p, { n: 1 }).map(t => t.tag), ['b']);
  assert.deepEqual(L.topTags({ w: { q: 1, p: 1 }, c: {}, n: 1 }).map(t => t.tag), ['p', 'q']); // alphabetical on a full tie
});
test('moreCards: unseen cards that clear up the least certain tags', () => {
  const cards = [{ id: '1', tags: ['pool'] }, { id: '2', tags: ['pool'] }, { id: '3', tags: ['hike'] }, { id: '4', tags: ['hike', 'beach'] }];
  const sw = { 1: 1 };
  const p = L.profileFrom(sw, cards);
  assert.deepEqual(L.moreCards(cards, sw, p, 2).map(c => c.id), ['4', '3']); // pool is known; hike + beach are not
  assert.deepEqual(L.moreCards(cards, sw, p, 10).map(c => c.id), ['4', '3', '2']);
  assert.deepEqual(L.moreCards(cards, { 1: 1, 2: 1, 3: 1, 4: 1 }, p).map(c => c.id), []);
  assert.equal(L.moreCards(cards.slice(0, 2), null, L.emptyProfile(), 1)[0].id, '1'); // ties keep deck order
});

// ---- loading ----
test('mergeCatalogs / normalizeDeck accept the plausible file layouts', () => {
  const m = L.mergeCatalogs([{ accommodations: [{ id: 'a1' }], activities: [{ id: 'b1' }] }, { acc: [{ id: 'a1' }, { id: 'a2' }], act: [] }, [{ id: 't1', type: 'activity' }, { id: 't2', type: 'accommodation' }, { id: 'x', type: 'other' }], { accommodation: [{ id: 'a3' }, null, {}], activity: [{ id: 'b2' }] }, {}]);
  assert.deepEqual(m.acc.map(x => x.id), ['a1', 'a2', 't2', 'a3']);
  assert.deepEqual(m.act.map(x => x.id), ['b1', 't1', 'b2']);
  assert.deepEqual(L.mergeCatalogs([]), { acc: [], act: [] });
  assert.deepEqual(L.normalizeDeck({ accommodations: [1], activities: [2] }), { acc: [1], act: [2] });
  assert.deepEqual(L.normalizeDeck({ accommodation: [1], activity: [2] }), { acc: [1], act: [2] });
  assert.deepEqual(L.normalizeDeck(null), { acc: [], act: [] });
});
test('photoSrc / photoOf: paths, objects, absolute urls and the generic fallback', () => {
  assert.equal(L.photoSrc({ photo: 'img/a.jpg' }, 'destinations/corsica/'), 'destinations/corsica/img/a.jpg');
  assert.equal(L.photoSrc({ photo: './img/a.jpg' }, 'x/'), 'x/img/a.jpg');
  assert.equal(L.photoSrc({ photo: { file: 'a.jpg' } }, 'x/'), 'x/a.jpg');
  assert.equal(L.photoSrc({ photo: { url: 'https://u.org/a.jpg' } }, 'x/'), 'https://u.org/a.jpg');
  assert.equal(L.photoSrc({ photo: { src: 's.jpg' } }), 's.jpg');
  assert.equal(L.photoSrc({ photo: { path: 'p.jpg' } }), 'p.jpg');
  assert.equal(L.photoSrc({ photo: '/abs/a.jpg' }, 'x/'), '/abs/a.jpg');
  assert.equal(L.photoSrc({ photo: 'data:image/png;base64,xx' }), 'data:image/png;base64,xx');
  assert.equal(L.photoSrc({}), ''); assert.equal(L.photoSrc(null), ''); assert.equal(L.photoSrc({ photo: {} }), '');
  assert.equal(L.photoOf({ photo: 'a.jpg', photoGeneric: 'g.jpg' }, 'x/'), 'x/a.jpg');
  assert.equal(L.photoOf({ photo: null, photoGeneric: { file: 'g.jpg' } }, 'x/'), 'x/g.jpg');
  assert.equal(L.photoOf(null), '');
});

// ---- tokens, links, text ----
test('newToken: right length and alphabet, unbiased (bytes >= 248 are rejected)', () => {
  const t = L.newToken();
  assert.match(t, /^[A-Za-z0-9]{12}$/);
  assert.match(L.newToken(20), /^[A-Za-z0-9]{20}$/);
  let first = true;
  const rand = n => { const a = new Uint8Array(n); a.fill(first ? 250 : 61); first = false; return a; };
  assert.equal(L.newToken(5, rand), '99999'); // 250 rejected, 61 % 62 = '9'
  assert.notEqual(L.newToken(), L.newToken());
});
test('tokenFromLink: only full links of this app', () => {
  const app = { origin: 'https://x.github.io', pathname: '/corsica/' };
  assert.equal(L.tokenFromLink('https://x.github.io/corsica/?g=AbCdEf123456', app), 'AbCdEf123456');
  assert.equal(L.tokenFromLink('  https://x.github.io/corsica/index.html?g=AbCdEf123456 ', app), 'AbCdEf123456');
  assert.equal(L.tokenFromLink('https://evil.example/corsica/?g=AbCdEf123456', app), '');
  assert.equal(L.tokenFromLink('https://x.github.io/other/?g=AbCdEf123456', app), '');
  assert.equal(L.tokenFromLink('https://x.github.io/other/?g=AbCdEf123456'), 'AbCdEf123456'); // no app: any origin
  assert.equal(L.tokenFromLink('AbCdEf123456'), ''); // a bare token is not a link
  assert.equal(L.tokenFromLink('https://x.github.io/corsica/?g=short', app), '');
  assert.equal(L.tokenFromLink('https://x.github.io/corsica/', app), '');
  assert.equal(L.tokenFromLink(null), '');
  assert.ok(L.isValidCode('AbCdEf123456')); assert.ok(!L.isValidCode('AbC')); assert.ok(!L.isValidCode(7));
});
test('share text, escaping, formatting', () => {
  assert.equal(L.shareUrl('https://x.github.io', '/corsica/', 'Tok1234567890'), 'https://x.github.io/corsica/?g=Tok1234567890');
  assert.equal(L.shareText('Zomer', 'https://u'), 'Plan mee de reis naar Corsica (Zomer): https://u'); // the link is inside the text
  assert.equal(L.escapeHtml(`<a href="x" onclick='y'>&`), '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
  assert.equal(L.escapeHtml(null), '');
  assert.equal(L.fmtMin(125), '2 u 05'); assert.equal(L.fmtMin(40), '0 u 40');
});

// ---- the whole chain on the fixtures ----
test('end to end: swipes -> profile -> ranked routes -> plan with 3 stays and activities', () => {
  const swipes = {};
  deck.acc.forEach((c, i) => { swipes[c.id] = i % 3 ? 1 : -1; });
  deck.act.forEach((c, i) => { swipes[c.id] = i % 2 ? 2 : -1; });
  const p = L.profileFrom(swipes, [...deck.acc, ...deck.act]);
  assert.equal(p.n, 50);
  const ranked = L.rankRoutes(routes, p, ctx);
  assert.equal(ranked.length, routes.length);
  for (const r of ranked) for (const s of r.stops) assert.equal(s.acc.length, 3);
  // learning curve: more swipes never make the profile less similar to the final one on average
  const sims = [5, 10, 15, 20, 25].map(k => L.profileSimilarity(L.profileAfter(swipes, k, [deck.acc, deck.act]), p));
  assert.ok(sims[4] > 0.999);
  assert.ok(sims[0] < sims[4]);
});


test('rankRoutes: a clear profile separates the routes by at least 10 pp, a flat one is not stretched', () => {
  const tg = (id, t) => ({ id, tags: t });
  const family = L.profileFrom({ a: 1, b: 1, c: 1, d: -1 }, [tg('a', ['family', 'kids']), tg('b', ['beach', 'walk_to_beach']), tg('c', ['camping', 'effort_low']), tg('d', ['nightlife', 'hike_hard'])]);
  const r = L.rankRoutes(routes, family, ctx);
  const pp = r.map(x => x.score * 100);
  assert.ok(Math.max(...pp) - Math.min(...pp) >= 10, 'spread ' + (Math.max(...pp) - Math.min(...pp)));
  assert.ok(r.every(x => Number.isFinite(x.rawScore)));
  assert.ok(r.every(x => x.score <= r[0].score));
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  assert.deepEqual(r.map(x => x.score), r.map(x => x.score).slice().sort((a, b) => b - a), "the list is sorted by the score shown");
  // the stretch is capped: a nearly flat profile does not blow up
  const tiny = L.rankRoutes(routes.slice(0, 2), L.profileFrom({ a: 1 }, [tg('a', ['pool'])]), ctx);
  assert.ok(Math.abs(tiny[0].score - tiny[1].score) <= L.MAX_STRETCH * Math.abs(tiny[0].rawScore - tiny[1].rawScore) + 1e-9);
  assert.deepEqual(L.rankRoutes([], family, ctx), []);
});
test('regionMatch: only the strongest axes of the profile count', () => {
  const aff = { coast: 0.9, mountains: -0.8, town: 0.05, quiet: 0.04, lively: 0.03 };
  const beach = L.regionMatch({ coast: 1, mountains: 0, town: 1, quiet: 1, lively: 1 }, aff);
  const hills = L.regionMatch({ coast: 0, mountains: 1, town: 1, quiet: 1, lively: 1 }, aff);
  assert.ok(beach > 0.5 && hills < -0.4);
  assert.equal(L.regionMatch({ coast: 1 }, aff, 1) > L.regionMatch({ coast: 1 }, aff, 5) - 1, true);
  assert.equal(L.regionMatch({ coast: 1 }, { coast: 0, mountains: 0, town: 0, quiet: 0, lively: 0 }), 0);
});
// ---- iteration 2: dislikes, overrides, prefs, duplicates, drive time, burden ----
test('overrides: like / dislike / forget a tag; kids preference counts as liking kids and family', () => {
  const p = L.profileFrom({ a: 1, b: -1 }, [{ id: 'a', tags: ['pool'] }, { id: 'b', tags: ['camping'] }], { camping: 0, spa: 1, pool: -1 });
  assert.equal(p.w.camping, undefined); assert.equal(p.c.camping, undefined);
  assert.equal(p.w.spa, 1); assert.ok(p.c.spa >= 3);
  assert.equal(p.w.pool, -1); assert.ok(p.c.pool >= 3);
  assert.equal(p.n, 2);
  assert.equal(L.applyOverrides(p, null), p);
  assert.deepEqual(L.applyOverrides({ w: { x: 0.2 }, c: { x: 9 }, n: 1 }, { x: 1, y: 7 }).c, { x: 9 }, 'invalid values are ignored, evidence never shrinks');
  assert.deepEqual(L.effectiveOverrides({ kids: -1 }, { kids: true }), { kids: -1, family: 1 });
  assert.deepEqual(L.effectiveOverrides(null, { kids: true }), { kids: 1, family: 1 });
  assert.deepEqual(L.effectiveOverrides(undefined, null), {});
  assert.equal(L.profileAfter({ a: 1 }, 5, [[{ id: 'a', tags: ['pool'] }]], { pool: -1 }).w.pool, -1);
  assert.deepEqual(L.cleanOverrides({ pool: 1, spa: 0, gym: -1, bad: 2, 'Bad Tag': 1, x: '1' }), { pool: 1, spa: 0, gym: -1 });
  assert.deepEqual(L.cleanOverrides(null), {});
  assert.deepEqual(L.cleanPrefs({ airco: true, ev: false, kids: true, budget: 3, junk: 1 }), { airco: true, kids: true, budget: 3 });
  assert.deepEqual(L.cleanPrefs({ budget: 9 }), {}); assert.deepEqual(L.cleanPrefs({ budget: 2.5 }), {}); assert.deepEqual(L.cleanPrefs(null), {});
});
test('dislikedTags: net weight <= -0.5 from two cards, or set by hand; one member is enough in a group', () => {
  const p = { w: { a: -0.5, b: -0.2, c: -0.9, d: 0.5, e: -0.7 }, c: { a: 2, b: 5, c: 1, d: 3, e: 3 }, n: 3 };
  assert.deepEqual([...L.dislikedTags(p)].sort(), ['a', 'e']);
  assert.equal(L.dislikedTags(p).has('c'), false, 'one card is not enough');
  const g = L.groupProfile([p, { w: { z: -1 }, c: { z: 2 }, n: 2 }]);
  assert.deepEqual([...L.dislikedTags(g)].sort(), ['a', 'e', 'z']);
  assert.equal(L.dislikedTags(null).size, 0);
  assert.equal(L.dislikedTags({}).size, 0);
  const once = L.profileFrom({ x: -1 }, [{ id: 'x', tags: ['camping'] }]);
  assert.equal(L.dislikedTags(once).size, 0, 'a single left swipe never rejects a tag');
  assert.equal(L.dislikedTags(L.profileFrom({}, [], { camping: -1 })).has('camping'), true, 'an override does');
});
test('rejectedTypes: a type is rejected only when disliked and never liked', () => {
  const nope = L.profileFrom({ a: -1, b: -1 }, [{ id: 'a', tags: ['camping', 'pool'] }, { id: 'b', tags: ['camping', 'spa'] }]);
  assert.deepEqual([...L.rejectedTypes(nope)], ['camping']);
  const mixed = L.profileFrom({ a: -1, b: -1, c: -1, e: -1, d: 1 }, 'abced'.split('').map(id => ({ id, tags: ['camping'] })));
  assert.ok(L.dislikedTags(mixed).has('camping'), 'net negative with four nopes and one like');
  assert.equal(L.rejectedTypes(mixed).size, 0, 'but it was liked once: not excluded, only a soft penalty');
  assert.equal(L.rejectedTypes(L.profileFrom({ a: -1, b: -1 }, [{ id: 'a', tags: ['pool'] }, { id: 'b', tags: ['pool'] }])).size, 0, 'only accommodation types');
  const g = L.groupProfile([nope, L.profileFrom({ a: 1 }, [{ id: 'a', tags: ['hotel'] }])]);
  assert.deepEqual([...L.rejectedTypes(g)], ['camping'], 'one member is enough');
  assert.equal(L.rejectedTypes(null).size, 0);
  assert.equal(L.rejectedTypes(L.profileFrom({ a: 1, b: 1 }, [{ id: 'a', tags: ['camping'] }, { id: 'b', tags: ['camping'] }], { camping: -1 })).has('camping'), true, 'an override beats earlier likes');
  assert.equal(L.rejectedTypes(L.profileFrom({ a: -1, b: -1 }, [{ id: 'a', tags: ['camping'] }, { id: 'b', tags: ['camping'] }], { camping: 1 })).size, 0);
});
test('prefDelta and hiddenReasons: kids on or off', () => {
  assert.ok(L.prefDelta({ tags: ['family'] }, null) < 0); assert.ok(L.prefDelta({ tags: ['kids'] }, {}) < 0);
  assert.ok(L.prefDelta({ tags: ['pool'] }, null) === 0);
  assert.ok(L.prefDelta({ tags: ['family'] }, { kids: true }) === 0);
  assert.ok(L.prefDelta({ tags: ['adults_only'] }, { kids: true }) < 0); assert.ok(L.prefDelta({ tags: ['adults_only'] }, {}) === 0);
  assert.deepEqual(L.hiddenReasons(null), L.KIDS_TAGS); assert.deepEqual(L.hiddenReasons({ kids: true }), []);
  const p = L.profileFrom({ a: 2, b: 2 }, [{ id: 'a', tags: ['family', 'pool'] }, { id: 'b', tags: ['kids'] }]);
  assert.ok(!L.explain(p, { tags: ['family', 'pool'] }, labels, 2, { hide: L.KIDS_TAGS }).match.some(m => m.tag === 'family'));
});

test('soft penalty: negative tags cost an item score, scaled by certainty and capped', () => {
  const p = L.profileFrom({ x: -1, z: -1, y: 1 }, [{ id: 'x', tags: ['camping'] }, { id: 'z', tags: ['camping'] }, { id: 'y', tags: ['pool'] }]);
  assert.ok(L.scoreItem(p, { tags: ['camping', 'pool'] }) < L.scoreItem(p, { tags: ['pool'] }) - 0.3, 'pool does not save a camping');
  assert.ok(L.scoreItem(p, { tags: ['pool'] }) > 0.4);
  const base = L.scoreItem(p, { tags: ['camping'] });
  assert.ok(base > -1.1 && base < -0.6);
  const certain = L.profileFrom({ a: -1, b: -1, c: -1, d: -1, e: -1, f: -1 }, 'abcdef'.split('').map(id => ({ id, tags: ['camping'] })));
  assert.ok(L.scoreItem(certain, { tags: ['camping'] }) >= -1 - L.SOFT_PENALTY.cap - 1e-9, 'the penalty is capped');
});

test('explain: never a rejected tag as a reason, "let op" only for rejected tags, plus one honest con', () => {
  const p = L.profileFrom({ a: 2, b: -1, c: -1, d: 1 }, [{ id: 'a', tags: ['pool', 'spa'] }, { id: 'b', tags: ['camping', 'budget'] }, { id: 'c', tags: ['camping'] }, { id: 'd', tags: ['gym'] }]);
  const withCamp = L.explain(p, { tags: ['camping', 'pool'] }, labels);
  assert.ok(withCamp.match.every(m => m.tag !== 'camping'));
  assert.equal(withCamp.con.text, 'let op: ' + labels.camping.toLowerCase());
  const lacking = L.explain(p, { tags: ['pool'] }, labels, 2, { vocab: ['pool', 'spa', 'camping', 'gym'] });
  assert.equal(lacking.con, null, 'one swipe of evidence is too little for a "minder" con');
  const strong = L.profileFrom({ a: 2, e: 2 }, [{ id: 'a', tags: ['pool', 'spa'] }, { id: 'e', tags: ['spa'] }]);
  assert.equal(L.explain(strong, { tags: ['pool'] }, labels, 2, { vocab: ['pool', 'spa'] }).con.text, 'minder: geen spa / wellness');
  assert.equal(L.explain(strong, { tags: ['pool'] }, labels).con, null, 'no vocab: no missing-tag con');
  assert.equal(L.explain(strong, { tags: ['pool', 'spa'] }, labels, 2, { vocab: ['pool', 'spa'] }).con, null, 'nothing missing');
  assert.equal(L.explain(strong, { tags: ['pool', 'spa'] }, labels, 1).match.length, 1);
  const soft = L.profileFrom({ b: -1 }, [{ id: 'b', tags: ['camping'] }]);
  assert.deepEqual(L.explain(soft, { tags: ['camping'] }, labels).warn, [], 'one nope is no rejection');
  const g = L.groupProfile([L.profileFrom({ a: 2 }, [{ id: 'a', tags: ['camping'] }]), L.profileFrom({ b: -1, c: -1 }, [{ id: 'b', tags: ['camping'] }, { id: 'c', tags: ['camping'] }]), L.profileFrom({ c: 2 }, [{ id: 'c', tags: ['camping'] }])]);
  assert.ok(g.w.camping > 0.1);
  assert.deepEqual(L.explain(g, { tags: ['camping'] }, labels).match, []);
});

const acc2 = (id, type, extra, region = 'calvi', price = 2) => ({ id, region, name: id, priceLevel: price, tags: [type, ...extra] });
test('topAccommodations: a rejected type is excluded unless nothing else exists', () => {
  const p = L.profileFrom({ x: -1, w: -1, y: 1 }, [{ id: 'x', tags: ['camping'] }, { id: 'w', tags: ['camping'] }, { id: 'y', tags: ['pool'] }]);
  const list = [acc2('h1', 'hotel', ['pool']), acc2('v1', 'villa', ['pool']), acc2('b1', 'bnb', ['pool']), acc2('c1', 'camping', ['pool']), acc2('c2', 'camping', ['pool'])];
  const top = L.topAccommodations(list, 'calvi', p, 3);
  assert.deepEqual(top.map(t => t.item.id).sort(), ['b1', 'h1', 'v1']);
  assert.ok(top.every(t => t.tier === 0));
  const few = L.topAccommodations([list[0], list[3]], 'calvi', p, 3);
  assert.deepEqual(few.map(t => [t.item.id, t.tier, t.note]), [['h1', 0, ''], ['c1', 2, 'excluded']], 'campings only fill what nothing else can');
  // one nope is no exclusion
  const once = L.profileFrom({ x: -1 }, [{ id: 'x', tags: ['camping'] }]);
  assert.ok(L.topAccommodations(list, 'calvi', once, 5).every(t => t.tier === 0));
});

test('topAccommodations: airco / charger / budget preferences', () => {
  const p = L.profileFrom({ y: 1 }, [{ id: 'y', tags: ['pool'] }]);
  const list = [acc2('top', 'hotel', ['pool', 'luxury'], 'calvi', 4), acc2('cool', 'villa', ['airco'], 'calvi', 2), acc2('warm', 'bnb', ['pool'], 'calvi', 1), acc2('half', 'apartment', [], 'calvi', 1)];
  list[3].tags = { apartment: 1, airco: 0.4 };
  const air = L.topAccommodations(list, 'calvi', p, 3, { prefs: { airco: true } });
  assert.equal(air[0].item.id, 'cool'); assert.equal(air[0].tier, 0); assert.deepEqual(air[0].unconfirmed, []);
  assert.ok(air.slice(1).every(a => a.tier === 1 && a.unconfirmed.includes('airco') && a.note === 'unknown'), 'the rest is shown as unknown');
  const ev = L.topAccommodations([acc2('e', 'hotel', ['ev_charging']), acc2('n', 'hotel', ['pool'])], 'calvi', p, 2, { prefs: { ev: true } });
  assert.deepEqual(ev.map(x => [x.item.id, x.unconfirmed.join()]), [['e', ''], ['n', 'ev']]);
  const cheap = L.topAccommodations(list, 'calvi', p, 3, { prefs: { budget: 2 } });
  assert.ok(cheap.every(c => c.item.priceLevel <= 2 && c.tier === 0));
  const over = L.topAccommodations(list, 'calvi', p, 4, { prefs: { budget: 2 } });
  assert.equal(over.length, 3, 'with three stays that fit, the over-budget one is hidden');
  const oneFits = L.topAccommodations([list[0], list[1]], 'calvi', p, 3, { prefs: { budget: 2 } });
  assert.deepEqual(oneFits.map(t => [t.item.id, t.tier, t.note]), [['cool', 0, ''], ['top', 3, 'over_budget']], 'one that fits: the dear one fills the slot, labelled');
  const onlyPricey = L.topAccommodations([list[0]], 'calvi', p, 3, { prefs: { budget: 1 } });
  assert.equal(onlyPricey[0].tier, 3, 'over budget only when nothing else exists');
  assert.equal(L.topAccommodations([{ id: 'u', region: 'calvi', tags: ['hotel'] }], 'calvi', p, 1, { prefs: { budget: 1 } })[0].tier, 0, 'unknown price is not filtered');
  // without kids a family resort costs a little, with kids adults-only does; "kindvriendelijk" is no reason without kids
  const fam = [acc2('fam', 'hotel', ['pool', 'family']), acc2('plain', 'bnb', ['pool'])];
  const q = L.profileFrom({ k: 2, y: 1 }, [{ id: 'k', tags: ['family'] }, { id: 'y', tags: ['pool'] }]);
  assert.ok(!L.topAccommodations(fam, 'calvi', q, 2, { prefs: {} }).find(a => a.item.id === 'fam').why.match.some(m => m.tag === 'family'));
  assert.ok(L.topAccommodations(fam, 'calvi', q, 2, { prefs: { kids: true } }).find(a => a.item.id === 'fam').why.match.some(m => m.tag === 'family'));
});

test('activitiesNear: no near-duplicates, one slot per type cluster first, rejected kinds out', () => {
  const stop = { lat: 42, lon: 9 };
  const mk = (id, name, dLat, tg) => ({ id, name, lat: 42 + dLat, lon: 9, tags: tg });
  const acts = [
    mk('c1', 'Cascade de Purcaraccia', 0.05, ['swim_river', 'hike']), mk('c2', 'Cascades de Purcaraccia (Bavella)', 0.06, ['swim_river']),
    mk('c3', 'Canyoning Purcaraccia', 0.0505, ['canyoning', 'swim_river']),
    mk('h1', 'Crête de la Punta', 0.04, ['hike']), mk('h2', 'Lac de Nino', 0.07, ['hike']), mk('h3', 'Monte Rotondo', 0.08, ['hike']),
    mk('b1', 'Plage de Palombaggia', 0.09, ['beach']), mk('t1', 'Bar du port', 0.03, ['nightlife']), mk('cu', 'Citadelle', 0.02, ['culture']),
  ];
  const p = L.profileFrom({ a: 2, b: 1, c: -1, d: -1 }, [{ id: 'a', tags: ['hike'] }, { id: 'b', tags: ['swim_river'] }, { id: 'c', tags: ['nightlife'] }, { id: 'd', tags: ['nightlife'] }]);
  const out = L.activitiesNear(acts, stop, p, { n: 8 }).map(o => o.item.id);
  assert.ok(!out.includes('t1'), 'nightlife was rejected (two nopes)');
  assert.equal(out.filter(i => ['c1', 'c2', 'c3'].includes(i)).length, 1, 'the cascade appears once');
  assert.ok(out.includes('b1') && out.includes('cu'), 'other clusters get their slot');
  assert.ok(out.filter(i => i.startsWith('h')).length <= 2, 'at most 2 hikes (1 first, a second only to fill)');
  assert.equal(L.activitiesNear(acts, stop, p, { n: 3 }).filter(o => o.item.id.startsWith('h')).length <= 1, true);
  assert.deepEqual(L.activitiesNear([mk('t1', 'Bar du port', 0.03, ['nightlife'])], stop, p).map(o => o.item.id), ['t1'], 'nothing else near: better something than nothing');
  assert.ok(L.activitiesNear([acts[3]], stop, L.emptyProfile(), { coast: true })[0].driveMin < L.activitiesNear([acts[3]], stop, L.emptyProfile(), { coast: false })[0].driveMin);
});

test('isDuplicate / nameTokens / clusterOf / driveMin', () => {
  assert.deepEqual([...L.nameTokens('Cascades de Purcaraccia (Bavella)')], ['cascade', 'purcaraccia']);
  assert.equal(L.nameTokens(null).size, 0);
  assert.equal(L.isDuplicate({ name: 'Cascade des Anglais' }, { name: 'Cascade des Anglais (Vizzavona)' }), true);
  assert.equal(L.isDuplicate({ name: 'Calvi' }, { name: 'Citadelle de Calvi' }), false, 'one shared word is not enough');
  assert.equal(L.isDuplicate({ name: 'Sentier des Crêtes du Cinto' }, { name: 'Crêtes du Cinto' }), true, 'a two-word name contained in the other');
  assert.equal(L.isDuplicate({ name: 'A1', lat: 42, lon: 9, tags: ['hike'] }, { name: 'B2', lat: 42.001, lon: 9, tags: ['hike'] }), true, 'within 300 m, same kind');
  assert.equal(L.isDuplicate({ name: 'A1', lat: 42, lon: 9, tags: ['hike'] }, { name: 'B2', lat: 42.001, lon: 9, tags: ['wine'] }), false);
  assert.equal(L.isDuplicate({ name: 'A1', lat: 42, lon: 9, tags: ['hike'] }, { name: 'B2', lat: 42.1, lon: 9, tags: ['hike'] }), false);
  assert.equal(L.isDuplicate({ name: 'A1', tags: ['hike'] }, { name: 'B2', tags: ['hike'] }), false, 'no coordinates');
  assert.equal(L.clusterOf({ tags: { hike: 0.5, beach: 1 } }), 'sea'); assert.equal(L.clusterOf({ tags: ['effort_low'] }), 'other');
  assert.equal(L.driveMin(50, false), 84); assert.equal(L.driveMin(50, true), 60); assert.equal(L.driveMin(0), 0);
});
test('travelBurden / burdenWeight', () => {
  const stays = { zonza: { coast: false }, calvi: { coast: true } };
  const r = { stays: ['calvi', 'zonza'], nights: [3, 5], legs: [{ min: 100 }, { min: 50 }] };
  assert.equal(L.travelBurden(r, stays), 150 + 3 * L.HUB_MIN, 'an inland hub counts at most 3 nights');
  assert.equal(L.travelBurden({ stays: ['x'], nights: [2], legs: undefined }, {}), 0);
  const calm = { w: { relax: 0.6 }, c: { relax: 2 }, n: 3 }, plain = { w: { food: 0.9 }, c: { food: 2 }, n: 3 };
  assert.equal(L.burdenWeight(calm, null), 0.3); assert.equal(L.burdenWeight(plain, null), 0.05);
  assert.equal(L.burdenWeight(plain, { kids: true }), 0.3); assert.equal(L.burdenWeight(L.emptyProfile(), null), 0); assert.equal(L.burdenWeight(null, null), 0);
});
test('route ranking: families get beach routes, culture people culture routes, rest people beach and spa', () => {
  const tg = (id, t) => ({ id, tags: t });
  const cards = [tg('k', ['kids', 'family']), tg('b', ['beach', 'walk_to_beach']), tg('r', ['relax', 'spa']), tg('c', ['culture', 'town']), tg('h', ['hike_hard', 'effort_high']), tg('n', ['nightlife'])];
  const fam = L.profileFrom({ k: 2, b: 1, h: -1, n: -1 }, cards);
  const kidsCtx = { ...ctx, stays: places.stays, prefs: { kids: true } };
  assert.notEqual(L.rankRoutes(routes, fam, kidsCtx)[0].route.id, 'd', 'never the mountain route for a family');
  const rest = L.profileFrom({ r: 2, b: 1, h: -1 }, cards);
  assert.notEqual(L.rankRoutes(routes, rest, { ...ctx, stays: places.stays })[0].route.id, 'd', 'never the long mountain route');
  assert.equal(L.rankRoutes(routes, rest, { ...ctx, stays: places.stays }).at(-1).route.id, 'd');
  const culture = L.profileFrom({ c: 2, r: -1, b: -1 }, cards);
  const regionOnly = L.rankRoutes(routes, culture, { acc: [], act: [], places: places.places, stays: places.stays, regionTags: places.regionTags });
  assert.ok(regionOnly[0].route.profile.town >= 0.5, 'culture lovers get a town-heavy route');
  // the burden costs a calm profile the long inland route
  const d = L.planRoute(routes.find(x => x.id === 'd'), rest, { ...ctx, stays: places.stays }), e = L.planRoute(routes.find(x => x.id === 'e'), rest, { ...ctx, stays: places.stays });
  assert.ok(d.parts.burden > e.parts.burden && d.burden > e.burden);
});

test('regionAffinity: a profile that likes kids or family always wants the coast', () => {
  const rt = { coast: ['beach'], mountains: ['hike'], town: ['culture'], quiet: [], lively: [] };
  const fam = L.profileFrom({ k: 1, h: 2 }, [{ id: 'k', tags: ['kids'] }, { id: 'h', tags: ['hike'] }]);
  assert.equal(L.regionAffinity(fam, rt).coast, L.KIDS_COAST);
  assert.ok(L.regionAffinity(fam, rt).mountains > 0.5);
  const hateBeach = L.profileFrom({ k: 1, b: -1 }, [{ id: 'k', tags: ['family'] }, { id: 'b', tags: ['beach'] }]);
  assert.equal(L.regionAffinity(hateBeach, rt).coast, L.KIDS_COAST, 'the floor beats a dislike of the beach tag');
  const strong = { w: { beach: 1, kids: 0.5 }, c: { beach: 3, kids: 1 }, n: 4 };
  assert.equal(L.regionAffinity(strong, rt).coast, 1, 'a stronger coast affinity stays');
  assert.equal(L.regionAffinity(L.profileFrom({ h: 1 }, [{ id: 'h', tags: ['hike'] }]), rt).coast, 0);
});

// ---- iteration 4: must-haves, kids, hostels, laid-back, adventure, variety ----
test('airco / ev must-haves: confirmed first, unknown below, confirmed absent last', () => {
  const p = L.profileFrom({ y: 1 }, [{ id: 'y', tags: ['pool'] }]);
  const a = (id, extra, flags = {}) => ({ ...acc2(id, 'hotel', ['pool', ...extra]), ...flags });
  const list = [a('yes', ['airco']), a('unk', []), a('no', [], { noAirco: true }), a('noButTag', ['airco'], { noAirco: true })];
  const top = L.topAccommodations(list, 'calvi', p, 4, { prefs: { airco: true } });
  assert.deepEqual(top.map(t => [t.item.id, t.tier, t.note]), [['noButTag', 0, ''], ['yes', 0, ''], ['unk', 1, 'unknown'], ['no', 4, 'absent']], 'a tag beats a stray flag');
  assert.deepEqual(top[0].confirmed, ['airco']); assert.deepEqual(top[2].unconfirmed, ['airco']); assert.deepEqual(top[3].absent, ['airco']);
  // a confirmed-absent stay is only a last resort
  assert.deepEqual(L.topAccommodations(list, 'calvi', p, 2, { prefs: { airco: true } }).map(t => t.item.id).sort(), ['noButTag', 'yes']);
  // not required: nothing changes
  assert.ok(L.topAccommodations(list, 'calvi', p, 4, { prefs: {} }).every(t => t.tier === 0));
  // ev works the same way
  const ev = L.topAccommodations([a('e', ['ev_charging']), a('n', [], { noEv: true }), a('u', [])], 'calvi', p, 3, { prefs: { ev: true } });
  assert.deepEqual(ev.map(t => [t.item.id, t.tier]), [['e', 0], ['u', 1], ['n', 4]]);
  // the must-have line per stop
  assert.deepEqual(L.mustHaveLine(top.slice(0, 3), { airco: true }), [{ key: 'airco', confirmed: 2, total: 3 }]);
  assert.deepEqual(L.mustHaveLine(ev, { airco: true, ev: true }), [{ key: 'airco', confirmed: 0, total: 3 }, { key: 'ev', confirmed: 1, total: 3 }]);
  assert.deepEqual(L.mustHaveLine(top, null), []);
});
test('kids off: an adults-only traveller loses family stays, otherwise a family stay costs 0.25', () => {
  const fam = [acc2('fam', 'hotel', ['pool', 'family']), acc2('adult', 'villa', ['pool'])];
  fam[0].tags = { hotel: 1, pool: 1, family: 0.9 };
  const adults = L.profileFrom({ a: 2, p: 1 }, [{ id: 'a', tags: ['adults_only'] }, { id: 'p', tags: ['pool'] }]);
  const out = L.topAccommodations(fam, 'calvi', adults, 2, { prefs: {} });
  assert.deepEqual(out.map(t => [t.item.id, t.tier]), [['adult', 0], ['fam', 2]], 'family is only a filler for adults-only without kids');
  assert.deepEqual(L.topAccommodations(fam, 'calvi', adults, 2, { prefs: { kids: true } }).map(t => t.tier), [0, 0], 'with kids it is allowed');
  const plain = L.profileFrom({ p: 1 }, [{ id: 'p', tags: ['pool'] }]);
  const soft = L.topAccommodations([acc2('a', 'hotel', ['pool']), { ...acc2('b', 'hotel', ['pool']), tags: { hotel: 1, pool: 1, family: 0.5 } }], 'calvi', plain, 2, { prefs: {} });
  assert.deepEqual(soft.map(t => t.tier), [0, 0]);
  assert.equal(soft[0].item.id, 'a', 'just a penalty without the adults-only signal');
  assert.ok(L.prefDelta({ tags: ['family'] }, {}) === -0.25);
});
test('budget >= 3 without a liked budget card: hostels and gites rank below every other stay', () => {
  const hostel = { ...acc2('hostel', 'bnb', ['pool', 'budget'], 'calvi', 1), tags: { bnb: 1, pool: 1, budget: 1 } }, nice = acc2('nice', 'hotel', [], 'calvi', 3);
  const p = L.profileFrom({ y: 1 }, [{ id: 'y', tags: ['pool'] }]);
  assert.deepEqual(L.topAccommodations([hostel, nice], 'calvi', p, 2, { prefs: { budget: 3 } }).map(t => [t.item.id, t.tier]), [['nice', 0], ['hostel', 2]]);
  assert.deepEqual(L.topAccommodations([hostel, nice], 'calvi', p, 2, { prefs: { budget: 2 } }).map(t => [t.item.id, t.tier]), [['hostel', 0], ['nice', 3]], 'a low budget keeps hostels and puts the dear one last');
  const likesBudget = L.profileFrom({ y: 1, b: 1 }, [{ id: 'y', tags: ['pool'] }, { id: 'b', tags: ['budget'] }]);
  assert.ok(L.topAccommodations([hostel, nice], 'calvi', likesBudget, 2, { prefs: { budget: 4 } }).every(t => t.tier === 0), 'liked once: no exclusion');
});
test('adventure profile: hotels and pool resorts are only fillers (campings with a pool are fine)', () => {
  const p = L.profileFrom({ c: 2, h: -1, o: -1 }, [{ id: 'c', tags: ['camping'] }, { id: 'h', tags: ['hotel'] }, { id: 'o', tags: ['pool'] }]);
  const list = [acc2('hotel', 'hotel', []), acc2('resort', 'villa', []), acc2('camp', 'camping', []), acc2('tent', 'glamping', [])];
  list[1].tags = { villa: 1, pool: 1 }; list[2].tags = { camping: 1, pool: 1 }; list[3].tags = { glamping: 1, pool: 1 };
  const out = L.topAccommodations(list, 'calvi', p, 4);
  assert.deepEqual(out.map(t => t.tier), [0, 0, 2, 2]);
  assert.deepEqual(out.slice(0, 2).map(t => t.item.id).sort(), ['camp', 'tent']);
  const noSignal = L.profileFrom({ c: 2 }, [{ id: 'c', tags: ['camping'] }]);
  assert.ok(L.topAccommodations(list, 'calvi', noSignal, 4).every(t => t.tier === 0));
});
test('laid-back profile: strenuous activities are dropped once turned down', () => {
  const stop = { lat: 42, lon: 9 };
  const mk = (id, name, d, tg) => ({ id, name, lat: 42 + d, lon: 9, tags: tg });
  const acts = [mk('v', 'Village walk', 0.01, ['village', 'culture']), mk('c', 'Canyon run', 0.05, ['canyoning', 'adrenaline']), mk('b', 'Boat trip', 0.09, ['boat', 'beach']), mk('w', 'Wine tasting', 0.12, ['wine', 'relax'])];
  const calm = L.profileFrom({ a: 1, b: -1 }, [{ id: 'a', tags: ['culture', 'relax'] }, { id: 'b', tags: ['canyoning', 'boat'] }]);
  assert.deepEqual(L.laidBackDrops(calm), L.STRENUOUS, 'one strenuous nope plus the culture/relax signal is enough');
  assert.deepEqual(L.activitiesNear(acts, stop, calm).map(o => o.item.id).sort(), ['v', 'w']);
  const active = L.profileFrom({ b: -1 }, [{ id: 'b', tags: ['canyoning', 'boat'] }]);
  assert.deepEqual(L.laidBackDrops(active), [], 'needs the culture/relax signal');
  assert.ok(L.activitiesNear(acts, stop, active).some(o => o.item.id === 'c'));
  assert.deepEqual(L.laidBackDrops(null), []);
});
test('top 3 routes never share their first two stops', () => {
  const real = L.rankRoutes(routes, L.profileFrom({ x: 2 }, [{ id: 'x', tags: ['culture', 'town'] }]), { ...ctx, stays: places.stays });
  const open = r => r.route.stays.slice(0, 2).join('>');
  assert.equal(new Set(real.slice(0, 3).map(open)).size, 3);
  assert.deepEqual(real.map(r => r.score), real.map(r => r.score).slice().sort((a, b) => b - a), 'still sorted by the percentage shown');
});

test('must-haves: among unknown stays the one with more confirmed extras comes first', () => {
  const p = L.profileFrom({ y: 1 }, [{ id: 'y', tags: ['pool'] }]);
  const mk = (id, tg) => acc2(id, 'hotel', ['pool', ...tg]);
  const out = L.topAccommodations([mk('none', []), mk('one', ['airco']), mk('both', ['airco', 'ev_charging'])], 'calvi', p, 3, { prefs: { airco: true, ev: true } });
  assert.deepEqual(out.map(t => [t.item.id, t.tier]), [['both', 0], ['one', 1], ['none', 1]]);
  const out2 = L.topAccommodations([mk('none', []), mk('one', ['airco'])], 'calvi', p, 2, { prefs: { airco: true, ev: true } });
  assert.deepEqual(out2.map(t => t.item.id), ['one', 'none'], 'the confirmed one leads although neither is complete');
});

// ---- iteration 5 ----
test('laid-back: long hikes, high effort and nightlife go too', () => {
  const stop = { lat: 42, lon: 9 };
  const mk = (id, name, d, tg, extra = {}) => ({ id, name, lat: 42 + d, lon: 9, tags: tg, ...extra });
  const acts = [mk('v', 'Dorpje', 0.01, ['village', 'culture']), mk('long', 'Lange tocht', 0.05, ['hike', 'nature'], { durationH: 6 }), mk('short', 'Korte wandeling', 0.08, ['hike', 'nature'], { durationH: 1.5 }),
    mk('eff', 'Zware klim', 0.11, { viewpoint: 1, effort_high: 0.9 }), mk('night', 'Discotheek', 0.14, ['nightlife'])];
  const calm = L.profileFrom({ a: 1, b: -1, c: -1 }, [{ id: 'a', tags: ['culture'] }, { id: 'b', tags: ['boat'] }, { id: 'c', tags: ['nightlife'] }]);
  assert.deepEqual(L.activitiesNear(acts, stop, calm).map(o => o.item.id).sort(), ['short', 'v']);
  // nightlife is dropped after a single nope when it is the dominant tag, for anyone
  const nightNope = L.profileFrom({ c: -1 }, [{ id: 'c', tags: ['nightlife'] }]);
  assert.ok(!L.activitiesNear(acts, stop, nightNope).some(o => o.item.id === 'night'));
  assert.ok(L.activitiesNear([acts[4], mk('bar', 'Cocktailbar', 0.02, { nightlife: 0.5, food: 1 })], stop, nightNope).some(o => o.item.id === 'bar'), 'only when nightlife is the dominant tag');
});
test('region veto: a route that leans on a turned-down trait loses score', () => {
  const veto = { coast: ['beach'], town: ['culture'] };
  const noBeach = L.profileFrom({ b: -1 }, [{ id: 'b', tags: ['beach'] }]);
  assert.ok(Math.abs(L.regionVeto({ coast: 0.9, town: 0.1 }, noBeach, veto) - 0.405) < 1e-9);
  assert.equal(L.regionVeto({ coast: 0, town: 0.5 }, noBeach, veto), 0);
  assert.equal(L.regionVeto({ coast: 0.9 }, L.emptyProfile(), veto), 0);
  assert.equal(L.regionVeto(null, noBeach, undefined), 0);
  const p = L.profileFrom({ b: -1, c: 2 }, [{ id: 'b', tags: ['beach'] }, { id: 'c', tags: ['culture', 'town'] }]);
  const base = { acc: [], act: [], places: places.places, stays: places.stays, regionTags: places.regionTags };
  const coastal = routes.find(r => r.id === 'e');
  assert.ok(L.planRoute(coastal, p, { ...base, regionVeto: places.regionVeto }).score < L.planRoute(coastal, p, base).score);
  const top = L.rankRoutes(routes, p, { ...base, regionVeto: places.regionVeto })[0].route;
  assert.ok(top.profile.coast < 0.7, 'the beach route is not on top for someone who rejected the beach');
});
test('budget: over-budget stays come last and the recommended route has none when another route fits', () => {
  const accs = [];
  for (const stay of ['calvi', 'corte', 'portov', 'bonifacio']) for (let i = 0; i < 3; i++) accs.push(acc2(stay + i, 'hotel', ['pool'], stay, stay === 'portov' || stay === 'bonifacio' ? 4 : 1));
  const p = L.profileFrom({ y: 1 }, [{ id: 'y', tags: ['pool', 'beach'] }]);
  const base = { acc: accs, act: [], places: places.places, stays: places.stays, regionTags: places.regionTags, prefs: { budget: 1 } };
  const ranked = L.rankRoutes(routes, p, base);
  const top = ranked[0];
  assert.equal(top.overBudget, false);
  assert.ok(top.stops.every(s => s.acc.every(a => a.tier !== 3)), 'no "boven je budget" stay in the recommended route');
  assert.ok(ranked.some(r => r.overBudget), 'other routes do have them');
  // within a stop the order is: in budget, then confirmed absent, then over budget
  const mixed = [acc2('dear', 'hotel', ['pool'], 'calvi', 4), { ...acc2('noac', 'hotel', ['pool'], 'calvi', 1), noAirco: true }, acc2('ok', 'hotel', ['pool'], 'calvi', 1)];
  assert.deepEqual(L.topAccommodations(mixed, 'calvi', p, 3, { prefs: { budget: 2, airco: true } }).map(t => t.item.id), ['ok', 'noac'], 'two stays fit: the dear one is hidden');
});
test('kids words: no kids reason, con, warning or profile line when travelling without kids; family stays rank last', () => {
  const p = L.profileFrom({ f: -1, g: -1, h: 2 }, [{ id: 'f', tags: ['family'] }, { id: 'g', tags: ['family'] }, { id: 'h', tags: ['pool'] }]);
  const e = L.explain(p, { tags: ['family', 'pool'] }, labels, 2, { hide: L.KIDS_TAGS });
  assert.deepEqual(e.warn, []); assert.ok(e.con === null || !/kind/i.test(e.con.text));
  assert.ok(!L.topTags(p, { sign: -1, hide: L.KIDS_TAGS }).some(t => t.tag === 'family'));
  assert.ok(L.topTags(p, { sign: -1 }).some(t => t.tag === 'family'));
  const kind = [{ ...acc2('fam', 'hotel', ['pool']), tags: { hotel: 1, pool: 1, family: 0.9 } }, acc2('plain', 'bnb', [])];
  const q = L.profileFrom({ y: 2 }, [{ id: 'y', tags: ['pool', 'family'] }]);
  assert.deepEqual(L.topAccommodations(kind, 'calvi', q, 2, { prefs: {} }).map(t => [t.item.id, t.tier]), [['plain', 0], ['fam', 2]]);
});

test('matchPercentages: the top shows 85-95%, the others relative, weak ones none; never out of order', () => {
  const p = L.matchPercentages([0.4, 0.2, -0.1, -0.25, -0.4]);
  assert.equal(p[0], 95); assert.ok(p[1] > p[2]); assert.equal(p[3], null); assert.equal(p[4], null);
  const weak = L.matchPercentages([-0.2, -0.25]);
  assert.ok(weak[0] >= 85 && weak[0] <= 95, 'the recommended route is always on the 85-95 scale'); assert.ok(weak[1] <= weak[0]);
  assert.ok(L.matchPercentages([0.1, 0.09]).every(x => x >= 30));
  assert.deepEqual(L.matchPercentages([]), []);
  assert.deepEqual(L.matchPercentages([-0.5, -0.6]), [85, null], 'even a weak best route is shown, at the bottom of the scale');
});
test('rankRoutes: matchPct is monotone with the order (null counts as the lowest)', () => {
  for (const profile of [L.profileFrom({ y: 2, z: -1, w: -1 }, [{ id: 'y', tags: ['pool', 'beach'] }, { id: 'z', tags: ['beach'] }, { id: 'w', tags: ['beach'] }]), L.profileFrom({ m: 2 }, [{ id: 'm', tags: ['hike', 'swim_river'] }])]) {
    for (const prefs of [undefined, { budget: 1, airco: true }]) {
      const r = L.rankRoutes(routes, profile, { ...ctx, stays: places.stays, regionVeto: places.regionVeto, prefs });
      const v = r.map(x => (x.matchPct === null ? -1 : x.matchPct));
      assert.deepEqual(v, v.slice().sort((a, b) => b - a), JSON.stringify(v));
      assert.ok(r[0].matchPct >= 85 && r[0].matchPct <= 95, 'the top route: ' + r[0].matchPct);
    }
  }
  assert.ok(L.rankRoutes(routes, L.emptyProfile(), ctx).every(x => x.matchPct === null || x.matchPct >= 30));
});

// ---- security round: untrusted data ----
const EVIL = '"><img src=x onerror=alert(1)>';
test('sanitizeRoutes: unsafe ids and broken routes are dropped, numbers are real numbers, strings stay strings', () => {
  const good = routes[0];
  const out = L.sanitizeRoutes([
    good,
    { ...good, id: EVIL }, // markup in the id
    { ...good, id: 'x', stays: ['calvi', EVIL], nights: [1, 2] },
    { ...good, id: 'y', stays: ['calvi'], nights: [1, 2] }, // lengths differ
    { ...good, id: 'z', nights: good.nights.map(() => '<b>'), legs: [{ from: 'A', to: 'B', km: '<img src=x>', min: { evil: 1 }, via: ['calvi', EVIL] }], profile: { coast: '9', mountains: 'x' } },
    null, 'str', { id: 5 },
  ]);
  assert.deepEqual(out.map(r => r.id), [good.id, 'z']);
  const z = out[1];
  assert.deepEqual(z.nights, good.nights.map(() => 1));
  assert.deepEqual(z.legs, [{ from: 'A', to: 'B', km: 0, min: 0, via: ['calvi'] }]);
  assert.equal(z.profile.coast, 1); assert.equal(z.profile.mountains, 0);
  assert.ok(out[0].legs.every(l => typeof l.km === 'number' && typeof l.min === 'number'));
  assert.deepEqual(L.sanitizeRoutes(null), []);
  assert.ok(Array.isArray(out[0].days) && out[0].days.every(d => typeof d.title === 'string'));
  assert.equal(L.sanitizeRoutes([{ ...good, id: 'q', days: undefined }])[0].days, undefined);
});
test('sanitizePlaces / sanitizeItems / sanitizeCards: numeric fields and keys', () => {
  const p = L.sanitizePlaces({ places: { calvi: [8.7, '42.5'], [EVIL]: [1, 2], bad: ['x', 1], odd: [1] }, names: { calvi: { name: 5, side: 'l' }, [EVIL]: {} }, outline: [[1, 2], ['a', 'b']],
    stays: { calvi: { name: 'C', img: '../../x', coast: false, profile: { coast: 'x', quiet: 0.5 }, sights: [{ title: 1, img: EVIL }], food: ['x'] }, [EVIL]: {} }, regionTags: { coast: ['beach', EVIL, 5, '__proto__'] }, tips: [{ title: 't', text: 'x' }, 5] });
  assert.deepEqual(p.places, { calvi: [8.7, 42.5] }); assert.deepEqual(p.names, { calvi: { name: '', side: 'l' } }); assert.deepEqual(p.outline, [[1, 2]]);
  assert.deepEqual(Object.keys(p.stays), ['calvi']); assert.equal(p.stays.calvi.img, ''); assert.equal(p.stays.calvi.coast, false); assert.equal(p.stays.calvi.profile.coast, 0);
  assert.equal(p.stays.calvi.sights[0].img, ''); assert.deepEqual(p.stays.calvi.food, []); assert.deepEqual(p.regionTags.coast, ['beach']); assert.equal(p.tips.length, 1);
  assert.deepEqual(L.sanitizePlaces(null).places, {});
  const acc = L.sanitizeItems([{ id: 'a1', lat: '42.5', lon: 9, priceLevel: '<b>', name: 5 }, { id: EVIL, lat: 1, lon: 1 }, { id: 'a2', lat: 'x', lon: 1 }, null, { id: 'a3', lat: 41, lon: 9, priceLevel: '3' }], 'accommodation');
  assert.deepEqual(acc.map(a => [a.id, a.lat, a.priceLevel, a.name]), [['a1', 42.5, undefined, ''], ['a3', 41, 3, '']]);
  const act = L.sanitizeItems([{ id: 'x1', lat: 1, lon: 2, durationH: '4' }, { id: 'x2', lat: 1, lon: 2, durationH: 'many' }], 'activity');
  assert.deepEqual(act.map(a => a.durationH), [4, undefined]);
  assert.deepEqual(L.sanitizeItems(null, 'activity'), []);
  assert.deepEqual(L.sanitizeCards([{ id: 'da01', title: 5, sub: 'x' }, { id: EVIL }, null]).map(c => [c.id, c.title]), [['da01', '']]);
  assert.deepEqual(L.sanitizeCards(undefined), []);
});
test('group preferences: the strictest budget and the union of the must-haves', () => {
  assert.deepEqual(L.combinePrefs([{ airco: true, budget: 3 }, { ev: true, kids: true, budget: 2 }, {}]), { airco: true, ev: true, kids: true, budget: 2 });
  assert.deepEqual(L.combinePrefs([{ budget: 4 }, null]), { budget: 4 });
  assert.deepEqual(L.combinePrefs([]), {}); assert.deepEqual(L.combinePrefs(null), {});
  assert.deepEqual(L.combinePrefs([{ airco: false, budget: 9 }]), {});
  // used by the ranking: the group's budget filters stays, a member's airco needs a confirmation for everybody
  const p = L.profileFrom({ y: 1 }, [{ id: 'y', tags: ['pool'] }]);
  const list = [{ ...acc2('cheap', 'hotel', ['pool', 'airco'], 'calvi', 1) }, { ...acc2('dear', 'hotel', ['pool'], 'calvi', 3) }];
  const prefs = L.combinePrefs([{ budget: 3 }, { budget: 1, airco: true }]);
  const out = L.topAccommodations(list, 'calvi', p, 2, { prefs });
  assert.deepEqual(out.map(t => [t.item.id, t.tier]), [['cheap', 0], ['dear', 3]], 'the strictest budget decides: the dear one is above it and only fills the second slot');
  void out;
});
test('profile summaries: prefs ride along; only tags of the allowed list; __proto__ and junk are ignored', () => {
  const s = L.summarize({ w: { pool: 0.5, nope: 1, __proto__: 1 }, c: { pool: 1 }, n: 2 }, 7, { airco: true, budget: 2, junk: 1 }, new Set(['pool']));
  assert.deepEqual(s, { w: { pool: 0.5 }, c: { pool: 1 }, n: 2, updatedAt: 7, prefs: { airco: true, budget: 2 } });
  assert.equal(L.summarize({ w: {}, c: {}, n: 0 }, 1).prefs, undefined);
  const raw = JSON.parse('{"w":{"__proto__":1,"pool":0.5,"zzz":1},"c":{"pool":1},"n":2,"prefs":{"kids":true,"x":1}}');
  const r = L.readSummary(raw, new Set(['pool']));
  assert.deepEqual(r, { w: { pool: 0.5 }, c: { pool: 1 }, n: 2 });
  assert.deepEqual(L.readPrefs(raw), { kids: true }); assert.deepEqual(L.readPrefs(null), {});
  assert.deepEqual(L.cleanOverrides(JSON.parse('{"__proto__":1,"pool":1,"zzz":-1}'), new Set(['pool'])), { pool: 1 });
  assert.equal({}.polluted, undefined);
  const g = L.groupProfile([JSON.parse('{"w":{"__proto__":1,"pool":0.5},"c":{"pool":1},"n":1}'), { w: { pool: 0.7 }, c: { pool: 1 }, n: 1 }]);
  assert.deepEqual(g.w, { pool: 0.6 }); assert.equal(({}).x, undefined);
  assert.deepEqual(L.tagWeights(JSON.parse('{"tags":{"__proto__":1,"pool":1}}')), { pool: 1 });
  assert.deepEqual(L.tagWeights({ tags: ['__proto__', 'pool'] }), { pool: 1 });
  assert.equal(L.memberName({ name: 'Anna', via: 'x' }), 'Anna'); assert.equal(L.memberName('Old'), 'Old'); assert.equal(L.memberName(null), '');
});

test('mapsUrl: Google Maps search link from name and town', () => {
  assert.equal(L.mapsUrl({ name: 'Hôtel La Villa' }, 'Calvi'), 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent('Hôtel La Villa, Calvi, Corse'));
  assert.equal(L.mapsUrl({ name: ' A & B ' }), 'https://www.google.com/maps/search/?api=1&query=A%20%26%20B%2C%20Corse');
  assert.equal(L.mapsUrl({ name: '' }, 'Calvi'), '');
  assert.equal(L.mapsUrl(null), '');
  assert.equal(L.mapsUrl({ name: 5 }), '');
});
