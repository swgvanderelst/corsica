// Trips: dates, travel party, nights per template, highlights and the day plan (pure logic).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as L from '../logic.js';

const json = p => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), 'utf8'));
const places = json('../destinations/corsica/places.json');
const routes = json('../destinations/corsica/routes.json').routes;
const catalog = L.mergeCatalogs([json('./fixtures/catalog.json')]);
const ctx = { acc: catalog.acc, act: catalog.act, places: places.places, regionTags: places.regionTags, labels: {} };
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, `${a} !~ ${b}`);

test('trip dates: start, nights between, adding days, age reached in the trip year', () => {
  assert.equal(L.tripStart({ start: '2027-07-04', months: '2027-08' }), '2027-07-04');
  assert.equal(L.tripStart({ months: '2027-07 2027-08', nights: 14 }), '2027-07-01'); // flexible: the 1st of the first month
  assert.equal(L.tripStart({ months: 'juli' }), '');
  assert.equal(L.tripStart(null), '');
  assert.equal(L.nightsBetween('2027-07-04', '2027-07-18'), 14);
  assert.equal(L.nightsBetween('2027-03-27', '2027-03-29'), 2); // across the clock change
  assert.equal(L.nightsBetween('2027-07-18', '2027-07-04'), 0);
  assert.equal(L.nightsBetween('x', '2027-07-04'), 0);
  assert.equal(L.addDays('2027-07-30', 3), '2027-08-02');
  assert.equal(L.addDays('nope', 1), '');
  assert.equal(L.ageOn(2020, '2027-07-01'), 7);
  assert.equal(L.ageOn(2028, '2027-07-01'), 0); // not born yet: counts as a baby
  assert.equal(L.ageOn(undefined, '2027-07-01'), null);
  assert.equal(L.ageOn(2020, ''), null);
});

test('tripNights: from fixed dates, else the stored nights, within 3-28', () => {
  assert.equal(L.tripNights({ start: '2027-07-04', end: '2027-07-18', nights: 3 }), 14);
  assert.equal(L.tripNights({ nights: 10 }), 10);
  assert.equal(L.tripNights({ nights: 2 }), 0);
  assert.equal(L.tripNights({ nights: 29 }), 0);
  assert.equal(L.tripNights({ start: '2027-07-04', end: '2027-08-30' }), 0); // 57 nights: out of range
  assert.equal(L.tripNights(null), 0);
});

test('people: read and write the p0..p11 shape, junk is dropped', () => {
  const raw = { p1: { name: 'Lisa', born: 2020 }, p0: { name: 'Stefan', born: 1980, uid: 'u1' }, p12: { name: 'X' }, p2: { name: '' }, p3: { name: 'Bad', born: 1800, uid: '<b>' }, x: { name: 'Y' } };
  assert.deepEqual(L.readPeople(raw), [{ key: 'p0', name: 'Stefan', born: 1980, uid: 'u1' }, { key: 'p1', name: 'Lisa', born: 2020 }, { key: 'p3', name: 'Bad' }]);
  assert.deepEqual(L.readPeople(null), []);
  const many = Array.from({ length: 14 }, (_, i) => ({ name: ' P' + i + ' ', born: 2000 }));
  const out = L.writePeople([...many, { name: '' }]);
  assert.equal(Object.keys(out).length, 12);
  assert.deepEqual(out.p0, { name: 'P0', born: 2000 });
  assert.deepEqual(L.writePeople([{ name: 'A', born: 'x', uid: 'bad uid' }]), { p0: { name: 'A' } });
});

test('partyPrefs / tripPrefs: kids come from the ages on the trip, the size and the youngest travel along', () => {
  const trip = { months: '2027-07', nights: 14, party: { p0: { name: 'Stefan', born: 1980 }, p1: { name: 'Lisa', born: 2020 }, p2: { name: 'Oma' } } };
  assert.deepEqual(L.partyPrefs(trip.party, trip), { size: 3, youngest: 7, kids: true });
  assert.deepEqual(L.partyPrefs({ p0: { name: 'A', born: 2015 } }, { months: '2027-07' }), { size: 1, youngest: 12, kids: false }); // 12 is no longer a kid
  assert.deepEqual(L.partyPrefs({ p0: { name: 'A' } }, trip), { size: 1, youngest: null, kids: false }); // no birth year: an adult
  // the kids switch of a member is replaced by the party; airco and budget still combine
  const adults = { ...trip, party: { p0: { name: 'A', born: 1980 }, p1: { name: 'B', born: 1982 } } };
  assert.deepEqual(L.tripPrefs([{ kids: true, budget: 3 }, { airco: true, budget: 2 }], adults), { airco: true, budget: 2, size: 2, youngest: 45 });
  assert.deepEqual(L.tripPrefs([{ airco: true }], trip), { airco: true, kids: true, size: 3, youngest: 7 });
  assert.deepEqual(L.tripPrefs([{ kids: true }], { nights: 7 }), { kids: true }); // no party yet: the old switch still counts
  assert.deepEqual(L.highlightIds({ highlights: 'hl-a hl-b  <b> hl-c' }), ['hl-a', 'hl-b', 'hl-c']);
  assert.deepEqual(L.highlightIds(null), []);
});

test('tooYoung / roomFit / refusesParty: the party decides what is possible', () => {
  assert.equal(L.tooYoung({ minAge: 8 }, 7), true);
  assert.equal(L.tooYoung({ minAge: 8 }, 8), false);
  assert.equal(L.tooYoung({ kidFriendly: 'no' }, 15), true);
  assert.equal(L.tooYoung({ kidFriendly: 'no' }, 16), false);
  assert.equal(L.tooYoung({ kidFriendly: 'older' }, 5), true);
  assert.equal(L.tooYoung({ kidFriendly: 'older' }, 9), false);
  assert.equal(L.tooYoung({ kidFriendly: 'no', minAge: 18 }, null), false); // unknown ages: nothing is filtered
  assert.equal(L.roomFit({ sleeps: 2 }, 2), 'ok');
  assert.equal(L.roomFit({ sleeps: 4 }, 4), 'ok');
  assert.equal(L.roomFit({ sleeps: 2 }, 4), 'rooms');
  assert.equal(L.roomFit({}, 4), 'unknown');
  assert.equal(L.roomFit({ sleeps: 2 }, undefined), 'ok');
  assert.equal(L.refusesParty({ adultsOnly: true }, { kids: true }), true);
  assert.equal(L.refusesParty({ adultsOnly: true }, {}), false);
  assert.equal(L.refusesParty({ minAge: 16 }, { youngest: 12 }), true);
  assert.equal(L.refusesParty({ minAge: 16 }, { youngest: 16 }), false);
  assert.equal(L.refusesParty({ adultsOnly: true }, null), false);
});

test('fitNights: exactly n nights in the template proportions, at least 2 per stop, null when impossible', () => {
  assert.deepEqual(L.fitNights([4, 3, 6], 13), [4, 3, 6]);
  assert.deepEqual(L.fitNights([4, 3, 6], 7), [2, 2, 3]);
  assert.deepEqual(L.fitNights([4, 3, 6], 21), [6, 5, 10]);
  assert.deepEqual(L.fitNights([5], 9), [9]);
  assert.equal(L.fitNights([3, 3, 3, 4], 7), null); // 4 stops need 8 nights
  assert.equal(L.fitNights([], 7), null);
  assert.equal(L.fitNights([4, 4], 7.5), null);
  for (const n of [6, 9, 14, 20, 28]) {
    const out = L.fitNights([3, 3, 3, 4], n) || L.fitNights([4, 3, 6], n);
    assert.equal(out.reduce((a, b) => a + b, 0), n);
    assert.ok(out.every(x => x >= 2));
  }
});

test('rankRoutes with a trip length: every proposal has exactly that many nights; short templates stay short', () => {
  for (const n of [5, 7, 10, 14, 21]) {
    const out = L.rankRoutes(routes, L.emptyProfile(), { ...ctx, nights: n });
    assert.ok(out.length >= 3, `at least 3 proposals for ${n} nights`);
    for (const plan of out) assert.equal(plan.stops.reduce((a, s) => a + s.nights, 0), n, `${plan.route.id} at ${n}`);
    for (const plan of out) assert.ok(!(plan.route.maxNights < n));
  }
});

test('placeHighlights: nearest stop with a free day; out of reach or no day left is reported', () => {
  const pl = { a: [9.0, 42.0], b: [9.0, 41.5] }; // [lon, lat]
  const hl = (id, lat) => ({ id, lat, lon: 9.0 });
  const out = L.placeHighlights(['a', 'b'], [hl('h1', 42.05), hl('h2', 41.52), hl('far', 43.0)], pl);
  assert.deepEqual(out.map(o => o.stop), [0, 1, -1]);
  assert.equal(out[2].why, 'far');
  assert.equal(out[0].min, L.hlMin(L.distanceKm({ lat: 42, lon: 9 }, hl('h1', 42.05))));
  assert.equal(L.hlMin(35), 84); // Porto - Calvi: no day trip
  // one free day at a and none at b: the second highlight near a has no day left
  const full = L.placeHighlights(['a', 'b'], [hl('x1', 42.0), hl('x2', 42.01)], pl, [1, 0]);
  assert.deepEqual(full.map(o => o.stop).sort(), [-1, 0]);
  assert.equal(full.find(o => o.stop < 0).why, 'full');
  assert.deepEqual(L.placeHighlights(['a'], [], pl), []);
  assert.deepEqual(L.placeHighlights(['zz'], [hl('h', 42)], pl).map(o => o.stop), [-1]); // a stop without coordinates
});

test('planRoute: missing the chosen highlights costs a route', () => {
  const r = routes.find(x => x.id === 'g'); // Calvi and Corte
  const bonifacio = { id: 'hl-x', lat: 41.39, lon: 9.16 }; // far from both
  const without = L.planRoute(r, L.emptyProfile(), ctx), withHl = L.planRoute(r, L.emptyProfile(), { ...ctx, highlights: [bonifacio] });
  assert.equal(withHl.parts.highlights, 0);
  near(without.score - withHl.score, L.HL_WEIGHT);
  const onRoute = L.planRoute(r, L.emptyProfile(), { ...ctx, highlights: [{ id: 'hl-c', lat: 42.567, lon: 8.757 }] }); // Calvi
  assert.equal(onRoute.parts.highlights, 1);
  assert.equal(onRoute.placed[0].stop, 0);
});

test('sanitizeHighlights: safe ids, real coordinates, activity ids only', () => {
  const out = L.sanitizeHighlights([{ id: 'hl-a', name: 'A', cat: 'beaches', lat: '41.5', lon: 9, acts: ['act-1', '<b>', 5], desc: 'x' }, { id: 'HL bad', lat: 1, lon: 1 }, { id: 'hl-b', lat: 'x', lon: 1 }, null]);
  assert.deepEqual(out, [{ id: 'hl-a', name: 'A', cat: 'beaches', desc: 'x', lat: 41.5, lon: 9, acts: ['act-1'] }]);
  assert.deepEqual(L.sanitizeHighlights('x'), []);
});

// a small plan for the day planner
const mkAct = (id, t, h = 2) => ({ id, name: id, lat: 42, lon: 9, durationH: h, tags: t });
const mkPlan = (stops, legs = [{ min: 60 }, { min: 30 }, { min: 90 }]) => ({ route: { id: 'x', legs }, stops });

test('dayPlan: exactly nights + 1 days, travel days on every change, every placed highlight once', () => {
  const acts = n => Array.from({ length: n }, (_, i) => ({ item: mkAct('a' + i + '-' + n, i % 2 ? ['beach'] : ['culture']), score: 1 - i / 10 }));
  const plan = mkPlan([{ stay: 's1', nights: 4, acts: acts(6) }, { stay: 's2', nights: 3, acts: acts(5) }]);
  const picks = [{ hl: { id: 'hl-1' }, stop: 1, min: 20, item: mkAct('hlact', ['viewpoint']) }, { hl: { id: 'hl-far' }, stop: -1, min: 200 }];
  const { days, unplaced } = L.dayPlan(plan, { picks, start: '2027-07-04' });
  assert.equal(days.length, 8);
  assert.deepEqual(days.map(d => d.kind), ['travel', 'activity', 'activity', 'activity', 'travel', 'highlight', 'activity', 'depart']);
  assert.deepEqual(days.map(d => d.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(days[0].date, '2027-07-04');
  assert.equal(days[7].date, '2027-07-11');
  assert.equal(days[4].leg.min, 30);
  assert.equal(days[7].leg.min, 90);
  assert.equal(days[5].hl.id, 'hl-1');
  assert.deepEqual(unplaced.map(h => h.id), ['hl-far']);
  const ids = days.flatMap(d => (d.act ? [d.act.item.id] : []));
  assert.equal(new Set(ids).size, ids.length, 'no activity twice');
  assert.ok(days.every(d => !d.alt || d.alt.item.id !== d.act.item.id));
  assert.equal(L.dayPlan(plan).days[0].date, undefined); // flexible dates: no dates
});

test('dayPlan: more highlights than free days are reported; a calm party gets a quiet day after two heavy ones', () => {
  const h = i => ({ hl: { id: 'h' + i }, stop: 0, min: i, item: mkAct('hx' + i, ['hike']) });
  const r = L.dayPlan(mkPlan([{ stay: 's', nights: 2, acts: [] }]), { picks: [h(1), h(2), h(3)] });
  assert.deepEqual(r.days.map(d => d.kind), ['travel', 'highlight', 'depart']);
  assert.deepEqual(r.unplaced.map(x => x.id), ['h2', 'h3']);
  const heavyActs = [0, 1, 2, 3].map(i => ({ item: mkAct('heavy' + i, ['hike_hard'], 6), score: 1 }));
  const beach = { item: mkAct('beach', ['beach', 'relax'], 2), score: 0.1 };
  const calm = L.dayPlan(mkPlan([{ stay: 's', nights: 5, acts: [...heavyActs, beach] }]), { calm: true }).days.map(d => d.kind);
  assert.deepEqual(calm, ['travel', 'activity', 'activity', 'rest', 'activity', 'depart']);
  const busy = L.dayPlan(mkPlan([{ stay: 's', nights: 5, acts: [...heavyActs, beach] }])).days.map(d => d.kind);
  assert.ok(!busy.includes('rest'));
  assert.deepEqual(L.dayPlan(mkPlan([{ stay: 's', nights: 3, acts: [] }])).days.map(d => d.kind), ['travel', 'free', 'free', 'depart']);
});

test('activitiesNear / topAccommodations: the party filters what is too young or refuses children, and flags tight rooms', () => {
  const stop = { lat: 42, lon: 9 };
  const acts = [{ ...mkAct('dive', ['diving']), minAge: 8 }, mkAct('beach', ['beach'])];
  assert.deepEqual(L.activitiesNear(acts, stop, L.emptyProfile(), { prefs: { youngest: 5 } }).map(a => a.item.id), ['beach']);
  assert.equal(L.activitiesNear(acts, stop, L.emptyProfile(), { prefs: { youngest: 9 } }).length, 2);
  const acc = (id, extra) => ({ id, region: 'r', name: id, priceLevel: 2, tags: { hotel: 1 }, ...extra });
  const list = [acc('adults', { adultsOnly: true }), acc('small', { sleeps: 2 }), acc('big', { sleeps: 4 }), acc('unk', {})];
  const kids = L.topAccommodations(list, 'r', L.emptyProfile(), 3, { prefs: { kids: true, size: 4, youngest: 6 } });
  assert.ok(!kids.some(a => a.item.id === 'adults'));
  assert.equal(kids.find(a => a.item.id === 'small').fit, 'rooms');
  assert.equal(kids.find(a => a.item.id === 'big').fit, 'ok');
  assert.equal(kids.find(a => a.item.id === 'unk').fit, 'unknown');
  assert.equal(kids[kids.length - 1].item.id, 'small', 'a stay that needs two rooms comes last');
  assert.ok(L.topAccommodations(list, 'r', L.emptyProfile(), 4, { prefs: { size: 2 } }).some(a => a.item.id === 'adults'));
});

test('sanitizeItems: party facts are whole numbers, booleans or known words', () => {
  const [a] = L.sanitizeItems([{ id: 'x', lat: 42, lon: 9, sleeps: '4', minAge: 8.5, familyRooms: 'yes', adultsOnly: true, kidFriendly: 'maybe' }], 'accommodation');
  assert.equal(a.sleeps, undefined);
  assert.equal(a.minAge, undefined);
  assert.equal(a.familyRooms, undefined);
  assert.equal(a.adultsOnly, true);
  assert.equal(a.kidFriendly, undefined);
  const [b] = L.sanitizeItems([{ id: 'y', lat: 42, lon: 9, minAge: 8, kidFriendly: 'older' }], 'activity');
  assert.equal(b.minAge, 8);
  assert.equal(b.kidFriendly, 'older');
});

test('planRoute: a highlight at a stop counts more than a day trip to it', () => {
  const r = routes.find(x => x.id === 'g'); // Calvi and Corte
  const at = L.planRoute(r, L.emptyProfile(), { ...ctx, highlights: [{ id: 'hl-c', lat: 42.567, lon: 8.757 }] }); // Calvi itself
  const trip = L.planRoute(r, L.emptyProfile(), { ...ctx, highlights: [{ id: 'hl-r', lat: 42.638, lon: 8.94 }] }); // Île-Rousse direction, a day trip
  assert.equal(at.parts.highlights, 1);
  assert.equal(trip.parts.highlights, L.HL_TRIP_CREDIT);
});
test('rankRoutes: the route with the chosen highlights at its stops comes first', () => {
  const hls = json('../destinations/corsica/highlights.json').filter(h => ['hl-calvi', 'hl-corte', 'hl-palombaggia'].includes(h.id));
  const out = L.rankRoutes(routes, L.emptyProfile(), { ...ctx, nights: 14, highlights: hls });
  assert.equal(out[0].route.id, 'a', 'Calvi, Corte and Porto-Vecchio');
  assert.ok(out[0].placed.every(p => p.stop >= 0));
});

test('dayPlan: an alternative is never planned elsewhere in the trip', () => {
  const acts = Array.from({ length: 8 }, (_, i) => ({ item: mkAct('x' + i, i % 2 ? ['beach'] : ['culture']), score: 1 - i / 10 }));
  const { days } = L.dayPlan(mkPlan([{ stay: 's', nights: 5, acts }]));
  const main = days.flatMap(d => (d.act ? [d.act.item.id] : [])), alts = days.flatMap(d => (d.alt ? [d.alt.item.id] : []));
  assert.ok(alts.length > 0);
  assert.ok(alts.every(a => !main.includes(a)), 'alternatives are activities that are not in the plan');
  assert.equal(new Set(alts).size, alts.length);
});

test('routesWith: the routes that give a highlight a day, in ranking order', () => {
  const plans = [{ route: { id: 'a' }, placed: [{ hl: { id: 'h1' }, stop: 0 }, { hl: { id: 'h2' }, stop: -1 }] }, { route: { id: 'b' }, placed: [{ hl: { id: 'h2' }, stop: 1 }] }, { route: { id: 'c' } }];
  assert.deepEqual(L.routesWith(plans, 'h2'), ['b']);
  assert.deepEqual(L.routesWith(plans, 'h1'), ['a']);
  assert.deepEqual(L.routesWith(null, 'h1'), []);
});
test('dayPlan: activities that do not fit the taste leave a day free; a long drive leaves the travel day empty', () => {
  const acts = [{ item: mkAct('good', ['culture']), score: 0.4 }, { item: mkAct('bad', ['hike_hard'], 6), score: -0.2 }];
  const long = L.dayPlan(mkPlan([{ stay: 's', nights: 3, acts }], [{ min: 120 }, { min: 60 }]));
  assert.deepEqual(long.days.map(d => d.kind), ['travel', 'activity', 'free', 'depart']);
  assert.equal(long.days[0].act, undefined, 'nothing after a two-hour drive');
  assert.ok(!long.days.some(d => d.act && d.act.item.id === 'bad'));
  const short = L.dayPlan(mkPlan([{ stay: 's', nights: 3, acts }], [{ min: 40 }, { min: 60 }]));
  assert.equal(short.days[0].act.item.id, 'good');
});
test('dayPlan: a highlight activity is never also a plain activity at another stop', () => {
  const melo = mkAct('melo', ['hike']);
  const plan = mkPlan([{ stay: 's1', nights: 3, acts: [{ item: melo, score: 0.9 }, { item: mkAct('o1', ['culture']), score: 0.5 }] }, { stay: 's2', nights: 3, acts: [{ item: melo, score: 0.9 }] }]);
  const { days } = L.dayPlan(plan, { picks: [{ hl: { id: 'hl-melo', acts: ['melo'] }, stop: 1, min: 10, item: melo }] });
  assert.equal(days.filter(d => (d.act && d.act.item.id === 'melo') || (d.item && d.item.id === 'melo')).length, 1);
});

test('topAccommodations: for a party of 4 a stay that surely fits beats one with an unknown capacity', () => {
  const acc = (id, extra) => ({ id, region: 'r', name: id, priceLevel: 2, tags: { hotel: 1 }, ...extra });
  const out = L.topAccommodations([acc('unk', {}), acc('fits', { sleeps: 6 })], 'r', L.emptyProfile(), 2, { prefs: { size: 4 } });
  assert.deepEqual(out.map(a => a.item.id), ['fits', 'unk']);
  const two = L.topAccommodations([acc('unk', {}), acc('fits', { sleeps: 6 })], 'r', L.emptyProfile(), 2, { prefs: { size: 2 } });
  near(two[0].score, two[1].score); // a couple fits everywhere
});

// ---- generated routes ----
const sp = L.sanitizePlaces(places);
const generated = L.generateRoutes(routes, sp.places, sp.stays);
test('generateRoutes: every set of 1-4 stays once, from a ferry port, with real legs where they are known', () => {
  assert.ok(generated.length > 100);
  const sets = generated.map(r => r.stays.slice().sort().join('>'));
  assert.equal(new Set(sets).size, sets.length, 'no set twice (another order is the same trip)');
  const templateSets = new Set(routes.map(r => r.stays.slice().sort().join('>')));
  assert.ok(sets.every(s => !templateSets.has(s)), 'never a copy of a hand-made template');
  for (const r of generated) {
    assert.match(r.id, /^g[0-9]+$/);
    assert.ok(r.generated);
    assert.ok(L.GEN_PORTS.includes(r.stops[0]) && r.stops[0] === r.stops[r.stops.length - 1]);
    assert.deepEqual(r.stops.slice(1, -1), r.stays);
    assert.equal(r.legs.length, r.stays.length + 1);
    assert.ok(r.legs.every(l => l.min <= 270 && Number.isFinite(l.km)));
    assert.ok(Object.values(r.profile).every(v => v >= 0 && v <= 1));
  }
  // Calvi - Porto-Vecchio is not in any template: it is chained from known drives (via Bastia or Corte, 4 to 4.5 h), not the straight-line guess
  const cp = generated.find(r => r.stays.slice().sort().join() === 'calvi,portov');
  const mid = cp.legs[1];
  assert.ok(mid.min >= 240 && mid.min <= 270, String(mid.min));
  assert.ok(mid.via.includes('corte') || mid.via.includes('bastia'));
  // a known leg is used as it is
  const g = generated.find(r => r.stays.length === 1 && r.stays[0] === 'portov' );
  assert.equal(g, undefined, 'Porto-Vecchio alone is template H');
  assert.deepEqual(L.generateRoutes([], {}, {}), []);
});
test('drivePenalty / maxStopsFor: driving above a fair share costs, much more for a calm party; fewer stops for short or calm trips', () => {
  assert.equal(L.DRIVE_FREE(10), 450);
  assert.equal(L.drivePenalty(420, 10, false), 0);
  near(L.drivePenalty(550, 10, false), 0.03);
  near(L.drivePenalty(550, 10, true), 0.3); // calm: ten times the normal rate
  assert.equal(L.drivePenalty(5000, 10, true), 1.2);
  assert.deepEqual([7, 10, 13, 14, 16, 28].map(n => L.maxStopsFor(n, false)), [2, 2, 3, 4, 4, 4]);
  assert.deepEqual([5, 7, 10, 13, 14].map(n => L.maxStopsFor(n, true)), [1, 1, 2, 2, 3]);
});
test('rankRoutes on a trip: no more stops than the trip allows, the generated ones compete, and the trade-offs are tagged', () => {
  const all = [...routes, ...generated];
  const hls = json('../destinations/corsica/highlights.json').filter(h => ['hl-calvi', 'hl-palombaggia', 'hl-scandola-girolata'].includes(h.id));
  const kids = L.rankRoutes(all, L.emptyProfile(), { ...ctx, stays: sp.stays, trip: true, nights: 13, prefs: { kids: true }, highlights: hls });
  assert.ok(kids.every(p => p.stops.length <= 2), 'a calm party of 13 nights moves at most once');
  assert.ok(kids.some(p => p.route.generated));
  assert.ok(kids.filter(p => p.route.generated).length <= L.GEN_KEEP);
  for (const p of kids) assert.equal(p.stops.reduce((a, s) => a + s.nights, 0), 13);
  const tags = kids.slice(1, 3).map(p => p.tag).filter(Boolean);
  assert.ok(tags.every(t => ['all', 'less'].includes(t)));
  const less = kids.find(p => p.tag === 'less');
  if (less) assert.ok(less.route.legs.reduce((a, l) => a + l.min, 0) <= 0.75 * kids[0].route.legs.reduce((a, l) => a + l.min, 0));
  const all3 = kids.find(p => p.tag === 'all');
  if (all3) assert.ok(all3.placed.every(x => x.stop >= 0));
  assert.ok(!kids.slice(3).some(p => p.tag), 'tags only on the two places after the recommendation');
  // without a trip nothing changes: no tags, no stop limit
  assert.ok(L.rankRoutes(routes, L.emptyProfile(), ctx).every(p => !p.tag));
});

test('dayPlan: a calm party only gets a clear fit (else a free day); an active party a full programme; alternatives are always a clear fit', () => {
  const acts = [{ item: mkAct('best', ['culture']), score: 0.5 }, { item: mkAct('ok', ['town']), score: 0.25 }, { item: mkAct('meh', ['hike']), score: 0.15 }, { item: mkAct('low', ['hike']), score: 0.05 }, { item: mkAct('no', ['hike']), score: -0.1 }];
  const plan = () => mkPlan([{ stay: 's', nights: 6, acts }], [{ min: 120 }, { min: 60 }]);
  const calm = L.dayPlan(plan(), { calm: true }).days;
  assert.deepEqual(calm.flatMap(d => [d.act, d.alt].filter(Boolean).map(a => a.item.id)).sort(), ['best', 'ok']);
  assert.ok(calm.some(d => d.kind === 'free'));
  const busy = L.dayPlan(plan()).days;
  assert.deepEqual(busy.filter(d => d.kind === 'activity').map(d => d.act.item.id).sort(), ['best', 'low', 'meh', 'ok']);
  assert.ok(!busy.some(d => d.alt), 'no clear fit left for an alternative');
  assert.ok(!busy.some(d => d.act && d.act.item.id === 'no'));
});
test('topAccommodations: a villa that suits children is no family resort for a party without them', () => {
  const villa = { id: 'villa', region: 'r', name: 'v', priceLevel: 3, tags: { villa: 1, pool: 1, family: 0.9 } };
  const resort = { id: 'resort', region: 'r', name: 'r', priceLevel: 3, tags: { camping: 1, pool: 1, family: 0.9 } };
  const out = L.topAccommodations([resort, villa], 'r', L.emptyProfile(), 2, { prefs: { size: 4 } });
  assert.equal(out.find(a => a.item.id === 'villa').tier, 0);
  assert.equal(out.find(a => a.item.id === 'resort').tier, 2);
  assert.equal(L.prefDelta(villa, {}), 0);
  assert.equal(L.prefDelta(resort, {}), -0.225);
});

test('pace: the party chooses calm, normal or active; without a choice kids or a laid-back taste mean calm', () => {
  assert.deepEqual(['calm', 'normal', 'active'].map(p => L.maxStopsFor(14, p)), [3, 4, 4]);
  assert.deepEqual(['calm', 'normal', 'active'].map(p => L.maxStopsFor(9, p)), [2, 2, 3]);
  assert.equal(L.maxStopsFor(9, 'nonsense'), L.maxStopsFor(9, 'normal'));
  near(L.drivePenalty(550, 10, 'active'), 0.01);
  assert.equal(L.resolvePace('active', L.emptyProfile(), { kids: true }), 'active', 'a chosen pace wins');
  assert.equal(L.resolvePace(undefined, L.emptyProfile(), { kids: true }), 'calm');
  assert.equal(L.resolvePace('', L.emptyProfile(), {}), 'normal');
  const all = [...routes, ...generated];
  const calm = L.rankRoutes(all, L.emptyProfile(), { ...ctx, stays: sp.stays, trip: true, nights: 14, pace: 'calm' });
  const active = L.rankRoutes(all, L.emptyProfile(), { ...ctx, stays: sp.stays, trip: true, nights: 14, pace: 'active' });
  assert.ok(calm.filter(p => !p.tag).every(p => p.stops.length <= 3));
  assert.ok(active.some(p => p.stops.length === 4));
});
test('dayPlan: evening suggestions (going out, eating) when the party likes them, each once', () => {
  const eve = [{ item: mkAct('bar', ['nightlife']), score: 0.4 }, { item: mkAct('rest', ['food']), score: 0.3 }, { item: mkAct('nope', ['nightlife']), score: -0.2 }];
  const plan = () => mkPlan([{ stay: 's', nights: 4, acts: [], evenings: eve }], [{ min: 30 }, { min: 30 }]);
  const on = L.dayPlan(plan(), { evening: true }).days;
  assert.deepEqual(on.filter(d => d.evening).map(d => d.evening.item.id), ['bar', 'rest']);
  assert.ok(!L.dayPlan(plan()).days.some(d => d.evening));
  const foodie = L.profileFrom({ c1: 1, c2: 1 }, [{ id: 'c1', tags: ['food'] }, { id: 'c2', tags: ['food', 'wine'] }]);
  assert.equal(L.likesEvenings(foodie), true);
  assert.equal(L.likesEvenings(L.emptyProfile()), false);
});

test('eveningKinds: going out only for people who like it, eating for food or wine lovers', () => {
  const foodie = L.profileFrom({ c1: 1 }, [{ id: 'c1', tags: ['food', 'wine'] }]);
  const party = L.profileFrom({ c1: 1 }, [{ id: 'c1', tags: ['nightlife'] }]);
  assert.deepEqual([...L.eveningKinds(foodie)], ['food']);
  assert.deepEqual([...L.eveningKinds(party)], ['night']);
  assert.deepEqual([...L.eveningKinds(L.emptyProfile())], []);
});

test('evenings are a bonus: they never take a day activity, also not at a later stop', () => {
  const shared = mkAct('haven', ['food', 'town']);
  const plan = mkPlan([
    { stay: 's1', nights: 2, acts: [], evenings: [{ item: shared, score: 0.5 }] },
    { stay: 's2', nights: 3, acts: [{ item: shared, score: 0.5 }], evenings: [] },
  ], [{ min: 30 }, { min: 30 }, { min: 30 }]);
  const { days } = L.dayPlan(plan, { evening: true });
  assert.ok(days.some(d => d.stay === 's2' && d.act && d.act.item.id === 'haven'), 'the later stop still gets it as a day activity');
  assert.ok(!days.some(d => d.evening && d.evening.item.id === 'haven'), 'and it is then no evening suggestion');
  const without = L.dayPlan(plan).days.map(d => (d.act ? d.act.item.id : d.kind));
  assert.deepEqual(days.map(d => (d.act ? d.act.item.id : d.kind)), without, 'the day programme is the same with or without evenings');
});
test('planRoute: going out is never a day activity and never in the score', () => {
  const night = { id: 'disco', name: 'disco', lat: 42.56, lon: 8.76, durationH: 4, tags: { nightlife: 1 } };
  const r = routes.find(x => x.id === 'g');
  const partyGoer = L.profileFrom({ c1: 2 }, [{ id: 'c1', tags: ['nightlife'] }]);
  const plan = L.planRoute(r, partyGoer, { ...ctx, act: [...ctx.act, night] });
  assert.ok(plan.stops.every(s => !s.acts.some(a => a.item.id === 'disco')));
  assert.equal(plan.score, L.planRoute(r, partyGoer, ctx).score, 'adding a nightlife place changes nothing in the score');
  assert.ok(plan.stops[0].evenings.some(a => a.item.id === 'disco'), 'it is an evening suggestion instead');
});

test('evening places: a harbour with real nightlife is also for people who go out; a beach is never an evening', () => {
  const r = routes.find(x => x.id === 'g');
  const partyGoer = L.profileFrom({ c1: 2 }, [{ id: 'c1', tags: ['nightlife'] }]);
  const harbour = { id: 'harbour', name: 'h', lat: 42.56, lon: 8.76, durationH: 2, tags: { food: 1, nightlife: 0.6 } };
  const beach = { id: 'beachbar', name: 'b', lat: 42.56, lon: 8.76, durationH: 3, tags: { beach: 1, food: 0.6, nightlife: 0.3 } };
  const ev = L.planRoute(r, partyGoer, { ...ctx, act: [harbour, beach] }).stops[0].evenings.map(a => a.item.id);
  assert.deepEqual(ev, ['harbour']);
});

test('maxLeg: no route with a longer drive on one day than the party accepts (unless nothing is left)', () => {
  const all = [...routes, ...generated];
  const out = L.rankRoutes(all, L.emptyProfile(), { ...ctx, stays: sp.stays, trip: true, nights: 14, maxLeg: 150 });
  assert.ok(out.length > 0);
  assert.ok(out.every(p => p.route.legs.every(l => l.min <= 150)));
  const none = L.rankRoutes(all, L.emptyProfile(), { ...ctx, stays: sp.stays, trip: true, nights: 14, maxLeg: 60 });
  assert.ok(none.length > 0, 'an impossible limit keeps the proposals instead of an empty screen');
});
test('highlightsFarApart: both ends of the island in a short trip', () => {
  const H = json('../destinations/corsica/highlights.json');
  const pick = ids => H.filter(h => ids.includes(h.id));
  const far = pick(['hl-calvi', 'hl-palombaggia']);
  assert.ok(L.highlightsFarApart(far, 7) >= 100);
  assert.equal(L.highlightsFarApart(far, 14), 0, 'two weeks is enough time');
  assert.equal(L.highlightsFarApart(pick(['hl-palombaggia', 'hl-bonifacio']), 7), 0, 'close together');
  assert.equal(L.highlightsFarApart([], 7), 0);
});
