// Schema checks for a destination: catalog items, swipe deck, places and routes. Returns a list of problems (empty = fine).
// Used by test/catalog.test.js (on the fixtures and on the real files) and by tools/check-catalog.mjs.
import fs from 'node:fs';
import { tagWeights, distanceKm, ID_RE } from '../logic.js';

const ITEM_ID_RE = /^[-_A-Za-z0-9]{1,64}$/; // catalog ids only go into HTML attributes; deck card ids are database keys (ID_RE, max 32)

export const CORSICA_BBOX = { latMin: 41.3, latMax: 43.05, lonMin: 8.5, lonMax: 9.65 };
// minor tags with fewer deck cards than the usual minimum (accepted product decision): airco and ev_charging are preference toggles, train has one card
export const FEW_CARD_TAGS = { airco: 0, ev_charging: 0, train: 1 };
export const MIN_ACC_PER_REGION = 3, MIN_ACT_PER_STOP = 5, RADIUS_KM = 30, MIN_CARDS_PER_TAG = 2;
const onIsland = it => typeof it.lat === 'number' && typeof it.lon === 'number' && it.lat >= CORSICA_BBOX.latMin && it.lat <= CORSICA_BBOX.latMax && it.lon >= CORSICA_BBOX.lonMin && it.lon <= CORSICA_BBOX.lonMax;
const str = v => typeof v === 'string' && v.trim().length > 0;
const https = v => typeof v === 'string' && /^https?:\/\/[^\s]+$/.test(v);
const fileOf = p => (typeof p === 'string' ? p : p && (p.file || p.url || p.src || p.path));
const licenseOf = p => p && typeof p === 'object' && (p.license || p.lic);

// photo: {file|url, license|lic, author?, source|page?}, or a path that has an entry (with licence) in credits.json
export function photoProblems(photo, { credits = {}, exists = () => true } = {}) {
  const f = fileOf(photo);
  if (!str(f)) return ['no file/url'];
  const out = [];
  let lic = licenseOf(photo);
  if (!lic) { const c = Object.values(credits).find(x => x && x.file === f); lic = c && c.lic; }
  if (!str(lic)) out.push('no licence');
  if (!/^https:\/\//.test(f) && !exists(f)) out.push('file does not exist: ' + f);
  return out;
}

export function checkItems(kind, items, ctx) {
  const { vocab, regions, credits, exists } = ctx;
  const out = [], seen = new Set();
  for (const it of items) {
    const id = it && it.id;
    const at = `${kind} ${id}`;
    if (typeof id !== 'string' || !ITEM_ID_RE.test(id)) { out.push(`${kind}: id "${id}" is not HTML-safe (1-64 of A-Z a-z 0-9 - _)`); continue; }
    if (seen.has(id)) out.push(`${at}: duplicate id`);
    seen.add(id);
    if (!str(it.name)) out.push(`${at}: no name`);
    if (!https(it.url)) out.push(`${at}: url must be an http(s) link`);
    if (!onIsland(it)) out.push(`${at}: coordinates are not on Corsica (${it.lat}, ${it.lon})`);
    if (kind === 'accommodation') {
      if (!regions.includes(it.region)) out.push(`${at}: region "${it.region}" is not a stay region`);
      if (typeof it.priceLevel !== 'number' || it.priceLevel < 1 || it.priceLevel > 4) out.push(`${at}: priceLevel must be 1-4`);
      // photo: the real photo, or (photoGeneric: true) a generic photo of that kind of place; either way with a licence
      const p = it.photo ? photoProblems(it.photo, { credits, exists }) : ['no photo'];
      if (p.length) out.push(`${at}: photo: ${p.join(', ')}`);
      if (it.photoGeneric !== undefined && typeof it.photoGeneric !== 'boolean') out.push(`${at}: photoGeneric must be true or false`);
    } else {
      if (typeof it.durationH !== 'number' || it.durationH <= 0 || it.durationH > 24) out.push(`${at}: durationH must be 0-24`);
      if (it.photo) { const p = photoProblems(it.photo, { credits, exists }); if (p.length) out.push(`${at}: photo: ${p.join(', ')}`); } // optional: the app lists activities without photos
    }
    if (!str(it.desc)) out.push(`${at}: no desc`);
    const tw = tagWeights(it);
    if (!Object.keys(tw).length) out.push(`${at}: no tags`);
    for (const t of Object.keys(tw)) if (!vocab[t]) out.push(`${at}: tag "${t}" is not in tags.json`);
  }
  return out;
}

export function checkDeck(deck, ctx) {
  const { tags, credits, exists } = ctx;
  const out = [];
  for (const [kind, key, n] of [['acc', 'accommodation', 25], ['act', 'activity', 25]]) {
    const cards = deck[kind];
    if (cards.length !== n) out.push(`deck ${kind}: expected ${n} cards, found ${cards.length}`);
    const seen = new Set(), count = {};
    for (const c of cards) {
      if (typeof c.id !== 'string' || !ID_RE.test(c.id)) { out.push(`deck ${kind}: id "${c.id}" is not key-safe`); continue; }
      if (seen.has(c.id)) out.push(`deck card ${c.id}: duplicate id`);
      seen.add(c.id);
      if (!str(c.title)) out.push(`deck card ${c.id}: no title`);
      if (!str(c.sub)) out.push(`deck card ${c.id}: no sub`);
      const p = c.photo ? photoProblems(c.photo, { credits, exists }) : ['no photo'];
      if (p.length) out.push(`deck card ${c.id}: photo: ${p.join(', ')}`);
      const tw = tagWeights(c);
      if (!Object.keys(tw).length) out.push(`deck card ${c.id}: no tags`);
      for (const t of Object.keys(tw)) { if (!tags[key][t]) out.push(`deck card ${c.id}: tag "${t}" is not a ${key} tag`); count[t] = (count[t] || 0) + 1; }
    }
    for (const t of Object.keys(tags[key])) if ((count[t] || 0) < (t in FEW_CARD_TAGS ? FEW_CARD_TAGS[t] : MIN_CARDS_PER_TAG)) out.push(`deck ${kind}: tag "${t}" is on ${count[t] || 0} cards (need ${MIN_CARDS_PER_TAG})`);
  }
  return out;
}

export function checkCoverage({ catalog, places, routes }) {
  const out = [];
  const stays = [...new Set(routes.flatMap(r => r.stays))];
  for (const s of Object.keys(places.stays)) {
    const n = catalog.acc.filter(a => a.region === s).length;
    if (n < MIN_ACC_PER_REGION) out.push(`region ${s}: ${n} accommodations (need ${MIN_ACC_PER_REGION})`);
  }
  for (const s of stays) {
    const xy = places.places[s];
    if (!xy) { out.push(`stop ${s}: no coordinates in places.json`); continue; }
    const n = catalog.act.filter(a => distanceKm({ lat: xy[1], lon: xy[0] }, a) <= RADIUS_KM).length;
    if (n < MIN_ACT_PER_STOP) out.push(`stop ${s}: ${n} activities within ${RADIUS_KM} km (need ${MIN_ACT_PER_STOP})`);
  }
  return out;
}

const KEYS = ['coast', 'mountains', 'town', 'quiet', 'lively'];
export function checkPlacesRoutes({ places, routes, tags }) {
  const out = [];
  const P = places.places;
  for (const [k, xy] of Object.entries(P)) if (!(Array.isArray(xy) && xy.length === 2 && xy[0] > 8 && xy[0] < 10 && xy[1] > 41 && xy[1] < 43.5)) out.push(`place ${k}: bad coordinates`);
  for (const [k, s] of Object.entries(places.stays)) {
    if (!P[k]) out.push(`stay ${k}: no coordinates`);
    for (const key of KEYS) if (!(s.profile && s.profile[key] >= 0 && s.profile[key] <= 1)) out.push(`stay ${k}: profile.${key} must be 0..1`);
  }
  for (const [trait, list] of Object.entries(places.regionTags)) {
    if (!KEYS.includes(trait)) out.push(`regionTags: unknown trait ${trait}`);
    for (const t of list) if (!tags.accommodation[t] && !tags.activity[t]) out.push(`regionTags.${trait}: tag "${t}" is not in tags.json`);
  }
  const ids = new Set();
  for (const r of routes) {
    if (ids.has(r.id)) out.push(`route ${r.id}: duplicate`);
    ids.add(r.id);
    if (!/^[a-z]$/.test(r.id)) out.push(`route ${r.id}: id must be one letter`);
    if (r.stays.length !== r.nights.length) out.push(`route ${r.id}: stays and nights differ in length`);
    if (!r.nights.every(n => Number.isInteger(n) && n >= 1)) out.push(`route ${r.id}: nights must be positive integers`);
    for (const s of r.stays) if (!places.stays[s]) out.push(`route ${r.id}: stay ${s} has no entry in places.stays`);
    for (const s of r.stops) if (!P[s]) out.push(`route ${r.id}: stop ${s} has no coordinates`);
    for (const key of KEYS) if (!(r.profile && r.profile[key] >= 0 && r.profile[key] <= 1)) out.push(`route ${r.id}: profile.${key} must be 0..1`);
    for (const l of r.legs) { for (const v of l.via) if (!P[v]) out.push(`route ${r.id}: leg via ${v} has no coordinates`); if (!(l.km > 0 && l.min > 0)) out.push(`route ${r.id}: leg ${l.from}-${l.to} needs km and min`); }
    if (r.legs.length !== r.stops.length - 1) out.push(`route ${r.id}: ${r.stops.length} stops need ${r.stops.length - 1} legs`);
    if (r.days && !r.days.every(d => r.stays.includes(d.stay) || r.stops.includes(d.stay))) out.push(`route ${r.id}: a day refers to an unknown stay`);
  }
  return out;
}

export function fileExists(root, base) {
  return f => [base + f, 'destinations/' + f, f].some(p => fs.existsSync(new URL(p, root)));
}
