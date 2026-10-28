// Pure logic: taste profile, ranking, groups, learning curve. No DOM, no I/O (tested in test/logic.test.js).
// Profile shape everywhere: { w: {tag: -1..1}, c: {tag: evidence >= 0}, n: swipes }. A group profile adds members: [profile].

export const SWIPE = { NO: -1, YES: 1, SUPER: 2 };
export const SWIPE_VALUES = [-1, 1, 2];
export const MIN_SKIP = 10; // a deck may be skipped after this many cards
export const ID_RE = /^[-_A-Za-z0-9]{1,32}$/;
export const CODE_RE = /^[A-Za-z0-9]{10,32}$/; // join token: nobody types it, it travels in the link
export const TAG_RE = /^[a-z_]{1,24}$/;
export const TYPE_TAGS = ['hotel', 'boutique', 'villa', 'apartment', 'bnb', 'glamping', 'camping', 'agriturismo'];
export const MISERY = { threshold: 0.15, weight: 1 }; // least-misery penalty for a group
export const REGION_KEYS = ['coast', 'mountains', 'town', 'quiet', 'lively'];
export const DISLIKE = { w: -0.5, c: 2 }; // a tag is "disliked" when its weight is this negative with evidence from at least two cards (or the person set it)
export const SOFT_PENALTY = { factor: 0.5, cap: 0.3 }; // negative tags cost an item score, scaled by certainty, at most this much
export const KIDS_TAGS = ['kids', 'family'];
export const TOP_ACTS = 5; // activities that count in a stop's score
export const KIDS_COAST = 0.8; // minimum coast affinity of a profile that likes kids or family

// a tag name from outside: the right shape, never __proto__, and (when a list is given) one of tags.json
const isTag = (t, allowed) => TAG_RE.test(t) && t !== '__proto__' && (!allowed || allowed.has(t));
const r3 = x => Math.round(x * 1000) / 1000;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ---- tags ----
// card/item tags are either ['pool', 'spa'] (weight 1) or {pool: 0.8}; anything else is ignored
export function tagWeights(item) {
  const t = item && item.tags;
  const out = {};
  if (Array.isArray(t)) { for (const k of t) if (typeof k === 'string' && k !== '__proto__') out[k] = 1; }
  else if (t && typeof t === 'object') { for (const [k, v] of Object.entries(t)) if (isNum(v) && v > 0 && k !== '__proto__') out[k] = clamp(v, 0, 1); }
  return out;
}
// tags.json -> {tag: label} over all groups
export function flattenLabels(tagsJson) {
  const out = {};
  for (const [group, map] of Object.entries(tagsJson || {})) if (!group.startsWith('_') && map && typeof map === 'object') Object.assign(out, map);
  return out;
}

// ---- profile ----
export const emptyProfile = () => ({ w: {}, c: {}, n: 0 });

// pure: returns a new accumulator {raw, c, n}; value is -1 (nope), 1 (like), 2 (super like)
export function applySwipe(state, card, value) {
  const s = state || { raw: {}, c: {}, pos: {}, n: 0 };
  if (!SWIPE_VALUES.includes(value)) return s;
  const raw = { ...s.raw }, c = { ...s.c }, pos = { ...(s.pos || {}) };
  for (const [t, w] of Object.entries(tagWeights(card))) { raw[t] = (raw[t] || 0) + value * w; c[t] = (c[t] || 0) + w; if (value > 0) pos[t] = (pos[t] || 0) + w; }
  return { raw, c, pos, n: s.n + 1 };
}
// profile.l (not enumerable, local only): the tags that were liked at least once
const withLiked = (p, l) => Object.defineProperty(p, 'l', { value: l, enumerable: false, writable: true });
// normalise: shrink towards 0 with one unit of prior evidence, so one like is +0.5, two are +0.67, a super like is +1
export function finalize(state) {
  const w = {}, c = {};
  for (const t of Object.keys(state.c)) { w[t] = r3(clamp(state.raw[t] / (state.c[t] + 1), -1, 1)); c[t] = r3(state.c[t]); }
  return withLiked({ w, c, n: state.n }, { ...(state.pos || {}) });
}
// manual corrections from the profile screen: {tag: 1 (like) | -1 (dislike) | 0 (forget what the swipes said)}
export function applyOverrides(profile, overrides) {
  if (!overrides) return profile;
  const w = { ...profile.w }, c = { ...profile.c }, l = { ...(profile.l || {}) };
  for (const [t, v] of Object.entries(overrides)) {
    if (v === 1 || v === -1) { w[t] = v; c[t] = Math.max(c[t] || 0, 3); if (v === 1) l[t] = Math.max(l[t] || 0, 1); else delete l[t]; }
    else if (v === 0) { delete w[t]; delete c[t]; delete l[t]; }
  }
  return withLiked({ w, c, n: profile.n }, l);
}
// "with children" counts as liking kids and family unless the person set those tags themselves
export function effectiveOverrides(overrides, prefs) {
  const out = { ...(overrides || {}) };
  if (prefs && prefs.kids) for (const t of ['kids', 'family']) if (out[t] === undefined) out[t] = 1;
  return out;
}
export function cleanOverrides(raw, allowed = null) {
  const out = {};
  for (const [t, v] of Object.entries(raw || {})) if (isTag(t, allowed) && (v === -1 || v === 0 || v === 1)) out[t] = v;
  return out;
}
// switches and a budget (1-4 euro signs); only what is on is kept
export function cleanPrefs(raw) {
  const out = {};
  const r = raw || {};
  for (const k of ['airco', 'ev', 'kids']) if (r[k] === true) out[k] = true;
  if (Number.isInteger(r.budget) && r.budget >= 1 && r.budget <= 4) out.budget = r.budget;
  return out;
}
const asList = deck => (Array.isArray(deck) ? deck : Object.values(deck || {}));
export function profileFrom(swipes, deck, overrides) {
  let st = { raw: {}, c: {}, n: 0 };
  const sw = swipes || {};
  for (const card of asList(deck)) if (card && Object.hasOwn(sw, card.id)) st = applySwipe(st, card, sw[card.id]);
  return applyOverrides(finalize(st), overrides);
}
// profile from only the first k cards (presentation order) of each deck; decks: [deckA, deckB] or one deck
export function profileAfter(swipes, k, decks, overrides) {
  const list = Array.isArray(decks) && decks.length && Array.isArray(decks[0]) ? decks : [decks || []];
  const part = [];
  for (const d of list) part.push(...asList(d).slice(0, k));
  return profileFrom(swipes, part, overrides);
}
export function certainty(profile, tag) {
  const e = (profile && profile.c && profile.c[tag]) || 0;
  return e / (e + 2);
}
// cosine similarity of two profiles' weights (1 = same taste); used to see how fast the profile settles
export function profileSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  const wa = (a && a.w) || {}, wb = (b && b.w) || {};
  for (const t of new Set([...Object.keys(wa), ...Object.keys(wb)])) { const x = wa[t] || 0, y = wb[t] || 0; dot += x * y; na += x * x; nb += y * y; }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

// ---- stored summaries (what a member writes to groups/{gid}/profiles/{uid}) ----
// prefs travel with the summary (only what is on), so a group can combine them
export function summarize(profile, now = Date.now(), prefs = null, allowed = null) {
  const w = {}, c = {};
  for (const t of Object.keys(profile.w)) if (isTag(t, allowed) && isNum(profile.w[t])) { w[t] = r3(clamp(profile.w[t], -1, 1)); c[t] = r3(clamp(profile.c[t] || 0, 0, 500)); }
  const out = { w, c, n: clamp(Math.round(profile.n || 0), 0, 500), updatedAt: now };
  const p = cleanPrefs(prefs);
  if (Object.keys(p).length) out.prefs = p;
  return out;
}
// untrusted data from the database -> a safe profile
export function readSummary(raw, allowed = null) {
  const p = emptyProfile();
  if (!raw || typeof raw !== 'object') return p;
  for (const [t, v] of Object.entries(raw.w || {})) if (isTag(t, allowed) && isNum(v)) { p.w[t] = clamp(v, -1, 1); p.c[t] = isNum(raw.c && raw.c[t]) ? clamp(raw.c[t], 0, 500) : 1; }
  p.n = isNum(raw.n) ? clamp(Math.round(raw.n), 0, 500) : 0;
  return p;
}
// the strictest budget and the union of the must-haves (kids is on when anybody travels with kids)
export function combinePrefs(list) {
  const out = {};
  const budgets = [];
  for (const raw of list || []) {
    const p = cleanPrefs(raw);
    for (const k of ['airco', 'ev', 'kids']) if (p[k]) out[k] = true;
    if (p.budget) budgets.push(p.budget);
  }
  if (budgets.length) out.budget = Math.min(...budgets);
  return out;
}
export const readPrefs = raw => cleanPrefs(raw && raw.prefs);
// a member entry is {name, via}; older data may be a plain name
export const memberName = m => (m && typeof m === 'object' ? String(m.name ?? '') : String(m ?? ''));
export function cleanSwipes(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) if (ID_RE.test(k) && SWIPE_VALUES.includes(v)) out[k] = v;
  return out;
}

// ---- scoring ----
function cosScore(p, it) {
  let dot = 0, ni = 0, np = 0;
  for (const [t, v] of Object.entries(it)) { ni += v * v; if (p[t]) dot += p[t] * v; }
  for (const v of Object.values(p)) np += v * v;
  return ni && np ? dot / Math.sqrt(ni * np) : 0;
}
// the weighted mean of the profile's weights over the item's own tags (untested tags count 0). Unlike a cosine it does not shrink
// when the profile learns more tags, so scores stay comparable from the 5th to the 50th swipe.
function meanScore(p, it) {
  let num = 0, den = 0;
  for (const [t, v] of Object.entries(it)) { den += v; if (p[t]) num += p[t] * v; }
  return den ? num / den : 0;
}
const isGroup = p => !!(p && Array.isArray(p.members) && p.members.length > 1);
const membersOf = p => (isGroup(p) ? p.members : p ? [p] : []);
// tags the person rejected: net weight <= -0.5 with evidence from two cards, or set by hand. In a group: anything one member rejected.
const memberDis = new WeakMap();
function dislikedOf(m) {
  let out = memberDis.get(m);
  if (!out) {
    out = new Set();
    for (const [t, v] of Object.entries(m.w || {})) if (v <= DISLIKE.w && ((m.c && m.c[t]) || 0) >= DISLIKE.c) out.add(t);
    memberDis.set(m, out);
  }
  return out;
}
export function dislikedTags(profile) {
  const out = new Set();
  for (const m of membersOf(profile)) for (const t of dislikedOf(m)) out.add(t);
  return out;
}
// accommodation types to leave out: the type tag itself is rejected and was never liked (by that member)
export function rejectedTypes(profile) {
  const out = new Set();
  for (const m of membersOf(profile)) for (const t of TYPE_TAGS) if (dislikedOf(m).has(t) && !((m.l && m.l[t]) > 0)) out.add(t);
  return out;
}
const certaintyOf = (p, t) => { const e = (p.c && p.c[t]) || 0; return e / (e + 2); };
// a soft penalty for every negative tag, scaled by certainty and capped
function softPenalty(p, it) {
  let sum = 0;
  for (const [t, v] of Object.entries(it)) { const w = p.w && p.w[t]; if (w < 0) sum += v * -w * certaintyOf(p, t); }
  return Math.min(SOFT_PENALTY.cap, SOFT_PENALTY.factor * sum);
}
function memberScore(p, it) { return meanScore(p.w || {}, it) - softPenalty(p, it); }
// about -1..1. A group score is the mean of the members' scores minus a penalty when somebody dislikes the item strongly.
export function scoreItem(profile, item) {
  const it = tagWeights(item);
  if (isGroup(profile)) {
    const s = profile.members.map(m => memberScore(m, it));
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    return mean - MISERY.weight * Math.max(0, -Math.min(...s) - MISERY.threshold);
  }
  return memberScore(profile || {}, it);
}
// how family-oriented a place is: a private villa or apartment that suits children is no family resort for the ones without
const familyness = tw => (tw.villa >= 0.5 || tw.apartment >= 0.5 ? 0 : Math.max(tw.family || 0, tw.kids || 0));
// children: without kids a family resort or kids club costs 0.25; with kids adults-only costs a little
export function prefDelta(item, prefs) {
  const tw = tagWeights(item);
  return prefs && prefs.kids ? -0.1 * (tw.adults_only || 0) : -0.25 * familyness(tw) || 0;
}
const likes = (p, t) => !!p && !!p.w && p.w[t] >= 0.3 && ((p.c && p.c[t]) || 0) >= 1;
const negative = (p, t) => !!p && !!p.w && p.w[t] < 0 && ((p.c && p.c[t]) || 0) >= 1;
const likedOnce = (p, t) => membersOf(p).some(m => (m.l && m.l[t]) > 0);
// laid-back signal: the person likes culture, relax or little effort and turned down something strenuous (even once)
export const STRENUOUS = ['canyoning', 'adrenaline', 'boat', 'hike_hard'];
export const laidBackDrops = p => (['culture', 'relax', 'effort_low'].some(t => likes(p, t)) && STRENUOUS.some(t => negative(p, t)) ? STRENUOUS : []);
// long hikes (4 hours or more, hiking tags) and effort_high count as strenuous too
const strenuousItem = tw => tw.effort_high >= 0.5;
export const hiddenReasons = prefs => (prefs && prefs.kids ? [] : KIDS_TAGS); // "kindvriendelijk" is no reason when travelling without kids
// why an item fits: the best matching tags (never a rejected or hidden one), the rejected tags it carries ("let op"), and one honest con:
// a rejected tag it has, else a strongly liked tag it lacks (only for tags in opts.vocab)
export function explain(profile, item, labels = {}, n = 2, { vocab = null, hide = [] } = {}) {
  const it = tagWeights(item), p = (profile && profile.w) || {}, dis = dislikedTags(profile);
  const lab = t => labels[t] || t;
  const rows = Object.keys(it).filter(t => p[t]).map(t => ({ tag: t, label: lab(t), v: p[t] * it[t] }));
  const pick = list => list.slice(0, n).map(({ tag, label }) => ({ tag, label }));
  const by = (a, b) => b.v - a.v || a.tag.localeCompare(b.tag);
  const match = pick(rows.filter(r => r.v > 0 && !dis.has(r.tag) && !hide.includes(r.tag)).sort(by));
  const warn = pick(rows.filter(r => dis.has(r.tag) && !hide.includes(r.tag)).sort((a, b) => -by(a, b)));
  let con = null;
  if (warn.length) con = { tag: warn[0].tag, label: warn[0].label, text: 'let op: ' + warn[0].label.toLowerCase() };
  else if (vocab) {
    const lack = vocab.filter(t => !it[t] && p[t] >= 0.5 && ((profile.c && profile.c[t]) || 0) >= 2 && !dis.has(t) && !hide.includes(t)).sort((a, b) => p[b] - p[a] || a.localeCompare(b))[0];
    if (lack) con = { tag: lack, label: lab(lack), text: 'minder: geen ' + lab(lack).toLowerCase() };
  }
  const text = match.length ? 'Past bij jouw smaak: ' + match.map(m => m.label).join(', ') : 'Nog weinig bekend over jouw smaak voor deze keuze';
  return { match, warn, con, text };
}

// ---- diversity (MMR: maximal marginal relevance) ----
// pick n items, each time the best score minus lambda * similarity to what is already picked
// minRel: after the best item, only items scoring at least minRel * best take part in the diversity pick;
// when none are left the rest is filled by plain score (a poor match never wins just for being different)
export function mmr(items, n, { score, sim, lambda = 0.3, minRel = 0 }) {
  const cand = items.map(item => ({ item, s: score(item) })).sort((a, b) => b.s - a.s || String(a.item.id).localeCompare(String(b.item.id)));
  const out = [];
  const top = cand.length ? cand[0].s : 0;
  while (out.length < n && cand.length) {
    let bi = 0, bv = -Infinity;
    const gate = out.length && top > 0 ? minRel * top : -Infinity;
    cand.forEach((c, i) => {
      if (c.s < gate) return;
      const v = c.s - lambda * Math.max(0, ...out.map(o => sim(o.item, c.item)));
      if (v > bv + 1e-12) { bv = v; bi = i; }
    });
    out.push(cand.splice(bi, 1)[0]);
  }
  return out;
}
const typeOf = item => { const t = tagWeights(item); return TYPE_TAGS.find(k => t[k]) || null; };
const tagSim = (a, b) => { const x = tagWeights(a), y = tagWeights(b); return cosScore(x, y); };
const accSim = (a, b) => { const ta = typeOf(a); return ta && ta === typeOf(b) ? 1 : 0.25 * tagSim(a, b); };

const TIER_NOTE = ['', 'unknown', 'excluded', 'over_budget', 'absent'];
export const ROOMS_PENALTY = 0.15; // the party does not fit in one unit
export const UNKNOWN_FIT_PENALTY = 0.08; // a party of 3 or more and nobody knows whether they fit in one unit
const fitPenalty = (a, size) => { const f = roomFit(a, size); return f === 'rooms' ? ROOMS_PENALTY : f === 'unknown' ? UNKNOWN_FIT_PENALTY : 0; };
// the must-haves: preference key, tag, and the flag that says "confirmed absent"
const MUST = [['airco', 'airco', 'noAirco'], ['ev', 'ev_charging', 'noEv']];
// top accommodations for a region. Tiers: 0 = fits everything (required extras confirmed); 1 = a required extra is unknown (shown "onbekend, vraag na");
// 2 = soft-excluded: a rejected type, family/kids-club stays for an adults-only traveller without kids, budget hostels at a high budget when no budget
// card was liked, hotels and pool resorts for an adventure profile; 3 = above the budget; 4 = a required extra is confirmed absent.
// Tiers 2 to 4 only fill slots when nothing better exists; over-budget stays are hidden once two stays fit. prefs: {airco, ev, kids, budget}. Within a tier: best matches, but a different type when scores are close.
export function topAccommodations(accs, region, profile, n = 3, { labels = {}, lambda = 0.3, minRel = 0.8, prefs = null, vocab = null } = {}) {
  const pool = accs.filter(a => a.region === region && !refusesParty(a, prefs));
  const size = prefs && prefs.size;
  const ex = rejectedTypes(profile), hide = hiddenReasons(prefs);
  const need = MUST.filter(([k]) => prefs && prefs[k]);
  const noKids = !(prefs && prefs.kids);
  const hostelsOut = !!(prefs && prefs.budget >= 3) && !likedOnce(profile, 'budget');
  const adventure = (likes(profile, 'camping') || likes(profile, 'budget')) && (negative(profile, 'hotel') || negative(profile, 'pool'));
  const info = a => {
    const tw = tagWeights(a);
    return {
      confirmed: need.filter(([, t]) => tw[t] >= 0.5).map(([k]) => k),
      absent: need.filter(([, t, flag]) => a[flag] === true && !(tw[t] >= 0.5)).map(([k]) => k),
      unknown: need.filter(([, t, flag]) => !(tw[t] >= 0.5) && a[flag] !== true).map(([k]) => k),
    };
  };
  const soft = a => {
    const tw = tagWeights(a), ty = typeOf(a);
    return (ty && ex.has(ty)) || (noKids && familyness(tw) >= 0.8) || (hostelsOut && tw.budget >= 0.5)
      || (adventure && (ty === 'hotel' || (tw.pool >= 0.8 && ty !== 'camping' && ty !== 'glamping')));
  };
  const tierOf = (a, i) => {
    if (i.absent.length) return 4;
    if (prefs && prefs.budget && typeof a.priceLevel === 'number' && a.priceLevel > prefs.budget) return 3;
    if (soft(a)) return 2;
    return i.unknown.length ? 1 : 0;
  };
  const tiers = [[], [], [], [], []];
  for (const a of pool) tiers[tierOf(a, info(a))].push(a);
  // inside tier 1 the stays with more confirmed must-haves come first
  const groups = [[0, tiers[0]]];
  for (let c = need.length - 1; c >= 0; c--) groups.push([1, tiers[1].filter(a => info(a).confirmed.length === c)]);
  groups.push([2, tiers[2]], [4, tiers[4]], [3, tiers[3]]); // above the budget is always last
  const out = [];
  groups.forEach(([tier, list]) => {
    if (out.length >= n || !list.length) return;
    if (tier === 3 && out.length >= 2) return; // above the budget: never next to two or more stays that fit
    for (const { item, s } of mmr(list, n - out.length, { score: a => scoreItem(profile, a) + prefDelta(a, prefs) - fitPenalty(a, size), sim: accSim, lambda, minRel })) {
      const i = info(item);
      out.push({ item, score: s, tier, note: TIER_NOTE[tier], confirmed: i.confirmed, unconfirmed: i.unknown, absent: i.absent, fit: roomFit(item, size), why: explain(profile, item, labels, 2, { vocab, hide }) });
    }
  });
  // the first stay should not say "nog weinig bekend" when a near-equal stay has a known match
  if (out.length > 1 && !out[0].why.match.length) {
    const j = out.findIndex(o => o.why.match.length && o.tier === out[0].tier && o.score >= out[0].score - 0.15);
    if (j > 0) [out[0], out[j]] = [out[j], out[0]];
  }
  return out;
}
// how many of the shown stays confirm each required extra: [{key, confirmed, total}]
export function mustHaveLine(accs, prefs) {
  return MUST.filter(([k]) => prefs && prefs[k]).map(([k]) => ({ key: k, confirmed: accs.filter(a => a.confirmed.includes(k)).length, total: accs.length }));
}

// ---- geography ----
export function distanceKm(a, b) {
  const R = 6371, rad = d => (d * Math.PI) / 180;
  const dl = rad(b.lat - a.lat), dn = rad(b.lon - a.lon);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
// approximate driving minutes: mountain roads 1.4 x the distance at 50 km/h, coast roads 1.2 x at 60 km/h
export const driveMin = (km, coast = false) => Math.round(coast ? (km * 1.2 / 60) * 60 : (km * 1.4 / 50) * 60);

const STOP_WORDS = new Set(['des', 'du', 'van', 'bij', 'the', 'and', 'het', 'een', 'les', 'aux', 'sur', 'del', 'della', 'dei']);
export function nameTokens(name) {
  const base = String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\([^)]*\)/g, ' ');
  const toks = base.split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !STOP_WORDS.has(t)).map(t => (t.length > 4 && t.endsWith('s') ? t.slice(0, -1) : t));
  return new Set(toks);
}
// near-duplicates: the same name stem, or within 300 m with overlapping tags
export function isDuplicate(a, b) {
  const x = nameTokens(a.name), y = nameTokens(b.name);
  const both = [...x].filter(t => y.has(t)).length, small = Math.min(x.size, y.size), union = x.size + y.size - both;
  if (union && both / union >= 0.6) return true;
  if (small >= 2 && both === small) return true;
  const close = typeof a.lat === 'number' && typeof b.lat === 'number' && distanceKm(a, b) < 0.3;
  return close && cosScore(tagWeights(a), tagWeights(b)) > 0;
}
const CLUSTER = {
  hike: 'hike', hike_hard: 'hike', climbing: 'hike', swim_river: 'river', canyoning: 'river', beach: 'sea', snorkel: 'sea', diving: 'sea', kayak: 'sea', boat: 'sea',
  culture: 'culture', town: 'culture', village: 'culture', food: 'food', wine: 'food', market: 'food', viewpoint: 'view', photo: 'view', train: 'view',
  relax: 'relax', wellness: 'relax', nightlife: 'night', adrenaline: 'adrenaline', cycling: 'adrenaline', nature: 'nature', kids: 'kids',
};
export function clusterOf(item) {
  const best = Object.entries(tagWeights(item)).filter(([t]) => CLUSTER[t]).sort((a, b) => b[1] - a[1])[0];
  return best ? CLUSTER[best[0]] : 'other';
}
// an activity the person turned down: its dominant tag is disliked; for a laid-back profile anything strenuous (canyoning, boats, adrenaline,
// hard or long hikes, high effort); nightlife as the dominant tag once nightlife got a negative weight
function isBadActivity(item, dis, calm, nightOut) {
  const tw = tagWeights(item);
  if (Object.entries(tw).some(([t, w]) => dis.has(t) && w >= 0.8)) return true;
  if (nightOut && tw.nightlife >= 0.8) return true;
  if (!calm.length) return false;
  return calm.some(t => tw[t] >= 0.3) || strenuousItem(tw) || (item.durationH >= 4 && Math.max(tw.hike || 0, tw.hike_hard || 0) >= 0.3);
}
// activities within radiusKm of a stop ({lat, lon}), best match first. Rejected kinds are left out (unless nothing else is near),
// near-duplicates are dropped and a type cluster gets one slot first, a second only to fill the list.
export function activitiesNear(acts, stop, profile, { radiusKm = 30, n = 8, labels = {}, coast = false, vocab = null, prefs = null } = {}) {
  const dis = dislikedTags(profile), hide = hiddenReasons(prefs), calm = laidBackDrops(profile), nightOut = negative(profile, 'nightlife');
  const youngest = prefs ? prefs.youngest : null;
  const scored = acts.filter(item => !tooYoung(item, youngest)).map(item => ({ item, km: distanceKm(stop, item) })).filter(x => x.km <= radiusKm)
    .map(x => ({ ...x, s: scoreItem(profile, x.item) + prefDelta(x.item, prefs), bad: isBadActivity(x.item, dis, calm, nightOut) }))
    .sort((a, b) => b.s - a.s || String(a.item.id).localeCompare(String(b.item.id)));
  const choose = list => {
    const chosen = [], count = {};
    for (const cap of [1, 2]) for (const x of list) {
      const cl = clusterOf(x.item);
      if (chosen.length >= n || chosen.includes(x) || (count[cl] || 0) >= cap || chosen.some(c => isDuplicate(c.item, x.item))) continue;
      chosen.push(x); count[cl] = (count[cl] || 0) + 1;
    }
    return chosen.sort((a, b) => b.s - a.s || String(a.item.id).localeCompare(String(b.item.id)));
  };
  let picks = choose(scored.filter(x => !x.bad));
  if (!picks.length) picks = choose(scored); // nothing else is near: better something than nothing
  return picks.map(x => ({ item: x.item, score: x.s, km: x.km, driveMin: driveMin(x.km, coast), why: explain(profile, x.item, labels, 2, { vocab, hide }) }));
}

// ---- routes ----
// how much the profile likes each region trait (coast, mountains, ...): mean weight of the tags that map to it, 0 when untested
export function regionAffinity(profile, regionTags) {
  const out = {};
  for (const k of REGION_KEYS) {
    const vals = (regionTags[k] || []).filter(t => profile.c && profile.c[t] > 0).map(t => profile.w[t]);
    out[k] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }
  // children want a beach, whatever else they (do not) care about
  if (["kids", "family"].some(t => profile.w[t] >= 0.3 && (profile.c[t] || 0) >= 1)) out.coast = Math.max(out.coast, KIDS_COAST);
  return out;
}
// only the profile's strongest axes count (topN), so a clear preference is not diluted by axes the person does not care about
export function regionMatch(routeProfile, affinity, topN = 2) {
  const axes = REGION_KEYS.slice().sort((a, b) => Math.abs(affinity[b]) - Math.abs(affinity[a]) || a.localeCompare(b)).slice(0, topN);
  let num = 0, den = 0;
  for (const k of axes) { const r = (routeProfile && routeProfile[k]) || 0; num += r * affinity[k]; den += Math.abs(affinity[k]); }
  return den ? num / den : 0;
}
// the total nights stay the same: one night moves from the worst to the best scoring stay when the gap is clear
export function adjustNights(nights, stayScores, { minNights = 2, gap = 0.15 } = {}) {
  const out = nights.slice();
  if (out.length < 2) return out;
  let best = 0, worst = 0;
  stayScores.forEach((s, i) => { if (s > stayScores[best]) best = i; if (s < stayScores[worst]) worst = i; });
  if (best !== worst && stayScores[best] - stayScores[worst] >= gap && out[worst] > minNights) { out[worst]--; out[best]++; }
  return out;
}
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

// Driving burden of a route in minutes: the legs plus 45 minutes a night (at most 3) in an inland hub such as Zonza or Corte,
// from where every beach is a drive away.
export const HUB_MIN = 45;
export function travelBurden(route, stays = {}) {
  const legs = (route.legs || []).reduce((a, l) => a + (l.min || 0), 0);
  const hubs = route.stays.reduce((a, s, i) => a + (stays[s] && stays[s].coast === false ? HUB_MIN * Math.min(3, route.nights[i]) : 0), 0);
  return legs + hubs;
}
// people who want it easy (relax, little effort, children) are bothered by driving; everybody else hardly
export function burdenWeight(profile, prefs) {
  const p = profile || {}, w = p.w || {}, c = p.c || {};
  const likes = t => w[t] >= 0.3 && (c[t] || 0) >= 1;
  return (prefs && prefs.kids) || ['relax', 'effort_low', 'kids', 'family'].some(likes) ? 0.3 : p.n > 0 ? 0.05 : 0;
}
// the activity tags this person likes most (certain, positive), the ones a route should offer
export function likedActivityTags(profile, vocab, k = 5) {
  const w = (profile && profile.w) || {}, c = (profile && profile.c) || {};
  return vocab.filter(t => !t.startsWith('effort_') && w[t] >= 0.3 && (c[t] || 0) >= 1).sort((a, b) => w[b] - w[a] || c[b] - c[a] || a.localeCompare(b)).slice(0, k);
}
// how much a route leans on a region trait the person turned down (key tags per trait, e.g. coast -> beach)
export function regionVeto(routeProfile, profile, veto) {
  let worst = 0;
  for (const k of REGION_KEYS) {
    const r = (routeProfile && routeProfile[k]) || 0;
    for (const t of (veto && veto[k]) || []) if (negative(profile, t) && profile.w[t] <= -0.3) worst = Math.max(worst, r * r * -profile.w[t]);
  }
  return worst;
}
// whether evening suggestions fit: the person likes going out, food or wine
export const likesEvenings = profile => eveningKinds(profile).size > 0;
// an evening place for these kinds: a going-out or food place, and for people who go out also a food place with real nightlife (a harbour)
const eveningFits = (a, kinds) => { const c = clusterOf(a); return (c === 'night' || c === 'food') && (kinds.has(c) || (kinds.has('night') && tagWeights(a).nightlife >= 0.5)); };
// which evenings: going out only for people who like it, eating for people who like food or wine
export function eveningKinds(profile) {
  const liked = t => likes(profile, t) || membersOf(profile).some(m => likes(m, t));
  return new Set([...(liked('nightlife') ? ['night'] : []), ...(liked('food') || liked('wine') ? ['food'] : [])]);
}
const WEAK = 0.1; // a stop whose best stay and activities both score below this is "weak"
// ctx: { acc, act, places: {key: [lon, lat]}, stays: {key: {coast}}, regionTags, labels, vocab: {acc, act}, prefs }
// A stop scores on its best stay, its activities and how many of the person's favourite activity kinds are near (coverage).
// A route is the mean over its stops plus a little region match, minus the driving burden and a penalty for weak stops.
export function planRoute(route, profile, ctx, { radiusKm = 30, nActs = 8 } = {}) {
  const labels = ctx.labels || {}, stays = ctx.stays || {}, vocab = ctx.vocab || {};
  const actVocab = vocab.act || [...new Set(ctx.act.flatMap(a => Object.keys(tagWeights(a))))];
  const liked = likedActivityTags(profile, actVocab);
  const stops = route.stays.map((stay, i) => {
    const xy = ctx.places[stay];
    const acc = topAccommodations(ctx.acc, stay, profile, 3, { labels, prefs: ctx.prefs, vocab: vocab.acc });
    const near = { labels, coast: !!(stays[stay] && stays[stay].coast), vocab: vocab.act, prefs: ctx.prefs };
    // the day programme is what counts: going out is an evening thing and never a day activity or part of the score
    const acts = xy ? activitiesNear(ctx.act.filter(a => clusterOf(a) !== 'night'), { lat: xy[1], lon: xy[0] }, profile, { ...near, radiusKm, n: nActs }) : [];
    // only suggestions for the evenings (a bonus, not scored): going out and eating near the stay
    const kinds = eveningKinds(profile);
    const evenings = xy && kinds.size ? activitiesNear(ctx.act.filter(a => eveningFits(a, kinds)), { lat: xy[1], lon: xy[0] }, profile, { ...near, radiusKm: 20, n: 6 }) : [];
    const accBest = acc.length ? acc[0].score : 0, actMean = mean(acts.slice(0, TOP_ACTS).map(a => a.score));
    const cover = liked.length ? liked.filter(t => acts.some(a => tagWeights(a.item)[t] >= 0.5)).length / liked.length : 0;
    const score = 0.55 * accBest + 0.25 * actMean + 0.2 * 0.5 * cover;
    return { stay, nights: route.nights[i], acc, acts, evenings, score, cover, must: mustHaveLine(acc, ctx.prefs), weak: accBest < WEAK && actMean < WEAK };
  });
  const nights = adjustNights(route.nights, stops.map(s => s.score));
  stops.forEach((s, i) => { s.baseNights = s.nights; s.nights = nights[i]; });
  const burden = travelBurden(route, stays);
  // the chosen highlights: the share that gets a day at a stop within reach
  const hls = ctx.highlights || [];
  const placed = hls.length ? placeHighlights(route.stays, hls, ctx.places, nights.map(n => Math.max(0, n - 1))) : [];
  // a highlight at a stop counts fully, a day trip for less, one that does not fit not at all
  const hlCover = hls.length ? placed.reduce((a, p) => a + (p.stop < 0 ? 0 : p.min <= HL_NEAR_MIN ? 1 : HL_TRIP_CREDIT), 0) / hls.length : 1;
  const parts = {
    region: regionMatch(route.profile, regionAffinity(profile, ctx.regionTags || {})),
    activity: mean(stops.map(s => mean(s.acts.slice(0, TOP_ACTS).map(a => a.score)))),
    acc: mean(stops.map(s => (s.acc.length ? s.acc[0].score : 0))),
    cover: mean(stops.map(s => s.cover)),
    veto: regionVeto(route.profile, profile, ctx.regionVeto),
    over: mean(stops.map(s => (s.acc.some(a => a.tier === 3) ? 1 : 0))),
    burden: ctx.trip && ctx.nights ? drivePenalty(burden, ctx.nights, resolvePace(ctx.pace, profile, ctx.prefs)) : burdenWeight(profile, ctx.prefs) * clamp((burden - 300) / 600, 0, 1),
    weak: 0.2 * mean(stops.map(s => (s.weak || s.acc.length && s.acc[0].score < 0 ? 1 : 0))),
    highlights: hlCover,
  };
  const score = 0.8 * mean(stops.map(s => s.score)) + 0.2 * parts.region - parts.burden - parts.weak - parts.veto - 0.5 * parts.over - HL_WEIGHT * (1 - hlCover);
  return { route, stops, parts, score, burden, placed, overBudget: parts.over > 0, shifted: nights.some((x, i) => x !== route.nights[i]) };
}
// all routes, best match for the profile first (the plan of every route is included)
// Scores are stretched around their mean so a profile with clear preferences separates the routes by at least MIN_SPREAD
// (the stretch is capped, a really flat profile stays flat). plan.rawScore keeps the unstretched value.
// The alternatives (after the first) are varied: a route that starts in the same place as one already listed is nudged down.
export const MIN_SPREAD = 0.2, MAX_STRETCH = 4, SAME_START = 0.04;
export const MIN_SHOWN_PCT = 30;
// A readable match percentage from the ranking score itself, so the percentages follow the order by construction:
// the top route shows 85-95% (more when its absolute score is strong), the others are relative to it. Under 30%: null = "minder passend".
export function matchPercentages(scores) {
  if (!scores.length) return [];
  const SHIFT = 0.3, best = Math.max(...scores), base = Math.max(best + SHIFT, 0.05);
  const top = 85 + 10 * clamp((best + SHIFT) / 0.7, 0, 1); // the best route is always on the 85-95 scale
  return scores.map(v => { if (v === best) return Math.round(top); if (v + SHIFT <= 0) return null; const p = Math.round(top * (v + SHIFT) / base); return p < MIN_SHOWN_PCT ? null : p; });
}
// ---- driving on a trip ----
// a fair amount of driving for the trip length; more costs the route, twice as much for a calm party (kids, rest, little effort)
export const DRIVE_FREE = (nights) => 150 + 30 * nights; // a 14-night round trip of 4 stays may drive about 10 hours without a cost
// the pace of a trip: calm (little moving), normal, active (a round trip). Chosen in the trip, else calm with kids or a laid-back taste.
export const PACES = ['calm', 'normal', 'active'];
const PACE = { calm: { perStop: 4.5, rate: 0.003 }, normal: { perStop: 3.5, rate: 0.0003 }, active: { perStop: 3, rate: 0.0001 } };
const paceOf = p => PACE[p === true ? 'calm' : p === false ? 'normal' : p] || PACE.normal; // true/false: calm or not
export const resolvePace = (pace, profile, prefs) => (PACES.includes(pace) ? pace : burdenWeight(profile, prefs) >= 0.3 ? 'calm' : 'normal');
export const drivePenalty = (minutes, nights, pace) => Math.min(1.2, paceOf(pace).rate * Math.max(0, minutes - DRIVE_FREE(nights)));
// how many places to stay at most: packing up costs a day, more so for a calm party
export const maxStopsFor = (nights, pace) => clamp(Math.floor(nights / paceOf(pace).perStop), 1, 4);
export const GEN_KEEP = 30; // generated routes that get a full plan, the most promising first
const hlCredit = placed => placed.reduce((a, p) => a + (p.stop < 0 ? 0 : p.min <= HL_NEAR_MIN ? 1 : HL_TRIP_CREDIT), 0);
// ctx.nights: the trip length; every route is stretched or shrunk to exactly that. Routes that cannot fit (2 nights per stop) or
// are meant for short trips only (maxNights) drop out. ctx.trip (a real trip in the app): also routes with more stops than the trip allows. Of the generated routes only the
// GEN_KEEP most promising (chosen highlights, region match, little driving) are planned in full.
// With a trip the list leads with the best route, then "less driving" and "all highlights" when they are different routes (plan.tag).
export function rankRoutes(routes, profile, ctx, opts) {
  let fitted = ctx.nights ? routes.map(r => { const n = r.maxNights && ctx.nights > r.maxNights ? null : fitNights(r.nights, ctx.nights); return n ? { ...r, nights: n } : null; }).filter(Boolean) : routes;
  let extra = []; // one stop more than the trip allows: only a candidate for "all highlights"
  if (ctx.trip && ctx.nights) {
    // the longest drive the party accepts on one day (ctx.maxLeg minutes): longer routes drop out, unless nothing is left
    if (ctx.maxLeg) { const ok = fitted.filter(r => r.legs.every(l => l.min <= ctx.maxLeg)); if (ok.length) fitted = ok; }
    const limit = maxStopsFor(ctx.nights, resolvePace(ctx.pace, profile, ctx.prefs));
    const hls = ctx.highlights || [], aff = regionAffinity(profile, ctx.regionTags || {});
    const promise = r => (hls.length ? 10 * hlCredit(placeHighlights(r.stays, hls, ctx.places, r.nights.map(n => Math.max(0, n - 1)))) / hls.length : 0)
      + 2 * regionMatch(r.profile, aff) - r.legs.reduce((a, l) => a + l.min, 0) / 300;
    const best = (list, n) => list.map(r => ({ r, v: promise(r) })).sort((a, b) => b.v - a.v || a.r.id.localeCompare(b.r.id)).slice(0, n).map(x => x.r);
    if (hls.length) extra = best(fitted.filter(r => r.stays.length === limit + 1), 8);
    const fewer = fitted.filter(r => r.stays.length <= limit);
    if (fewer.length) fitted = fewer;
    const gen = fitted.filter(r => r.generated);
    if (gen.length > GEN_KEEP) { const keep = new Set(best(gen, GEN_KEEP)); fitted = fitted.filter(r => !r.generated || keep.has(r)); }
  }
  const plans = fitted.map(r => planRoute(r, profile, ctx, opts));
  if (!plans.length) return plans;
  const sc = plans.map(p => p.score), spread = Math.max(...sc) - Math.min(...sc);
  const f = spread > 1e-9 ? Math.min(MAX_STRETCH, Math.max(1, MIN_SPREAD / spread)) : 1, m = mean(sc);
  plans.forEach(p => { p.rawScore = p.score; p.score = m + (p.score - m) * f; });
  const byScore = (a, b) => b.score - a.score || String(a.route.id).localeCompare(String(b.route.id));
  const rest = plans.sort(byScore);
  const fit = rest.findIndex(p => !p.overBudget);
  const out = [rest.splice(fit > 0 ? fit : 0, 1)[0]];
  const opening = p => p.route.stays.slice(0, 2).join('>');
  while (rest.length) {
    let bi = -1, bv = -Infinity;
    // the top 3 must open differently; later places only get the small nudge
    const strict = out.length < 3 && rest.some(p => !out.some(o => opening(o) === opening(p)));
    rest.forEach((p, i) => {
      if (strict && out.some(o => opening(o) === opening(p))) return;
      const v = p.score - SAME_START * out.slice(1).filter(o => o.route.stays[0] === p.route.stays[0]).length;
      if (v > bv + 1e-12) { bv = v; bi = i; }
    });
    const pick = rest.splice(bi, 1)[0];
    pick.score = Math.min(bv, out[out.length - 1].score); // the list stays sorted by the percentage shown
    out.push(pick);
  }
  const pcts = matchPercentages(out.map(p => p.score)); // after the final order: monotone with it
  out.forEach((p, k) => { p.matchPct = pcts[k]; });
  if (ctx.trip && ctx.nights && out.length > 1) {
    // the trade-offs next to the recommendation: noticeably less driving, and every chosen highlight when the best misses one
    const best = out[0], hls = (ctx.highlights || []).length;
    const drive = p => p.route.legs.reduce((a, l) => a + l.min, 0); // the driving the app shows
    const less = out.findIndex((p, i) => i > 0 && drive(p) <= 0.75 * drive(best) && p.parts.highlights >= best.parts.highlights - 0.4);
    let all = hls && best.placed.some(x => x.stop < 0) ? out.findIndex((p, i) => i > 0 && p.placed.every(x => x.stop >= 0)) : -1;
    if (all < 0 && hls && best.placed.some(x => x.stop < 0)) { // none within the stop limit: the best with one stop more
      const more = extra.map(r => planRoute(r, profile, ctx, opts)).filter(p => p.placed.every(x => x.stop >= 0)).sort((a, b) => b.score - a.score)[0];
      if (more) { more.rawScore = more.score; more.matchPct = null; out.push(more); all = out.length - 1; }
    }
    const lead = [];
    if (all > 0) { out[all].tag = 'all'; lead.push(out[all]); }
    if (less > 0 && less !== all) { out[less].tag = 'less'; lead.push(out[less]); }
    const rest = out.slice(1).filter(p => !lead.includes(p));
    out.splice(1, out.length - 1, ...lead, ...rest);
  }
  return out;
}

// ---- groups ----
// combined profile: per tag the mean weight of the members who tested it; members without swipes do not count
export function groupProfile(profiles) {
  const list = (profiles || []).filter(p => p && p.n > 0);
  if (list.length === 1) return list[0];
  const sum = Object.create(null), cnt = Object.create(null), ev = Object.create(null); // keys come from other people's data
  for (const p of list) for (const [t, v] of Object.entries(p.w)) {
    if (t === '__proto__') continue; sum[t] = (sum[t] || 0) + v; cnt[t] = (cnt[t] || 0) + 1; ev[t] = (ev[t] || 0) + (p.c[t] || 0); }
  const w = {};
  for (const t of Object.keys(sum)) w[t] = r3(sum[t] / cnt[t]);
  return { w, c: Object.fromEntries(Object.keys(ev).map(t => [t, r3(ev[t])])), n: list.reduce((a, p) => a + p.n, 0), members: list };
}

// ---- profile screen ----
// strongest likes / dislikes as [{tag, w, c}], strongest first
// strongest likes / dislikes as [{tag, w, c}]: ordered by weight times certainty
export function topTags(profile, { n = 6, sign = 1, hide = [] } = {}) {
  return Object.keys(profile.w)
    .filter(t => Math.sign(profile.w[t]) === sign && !hide.includes(t))
    .map(t => ({ tag: t, w: profile.w[t], c: profile.c[t] || 0 }))
    .sort((a, b) => Math.abs(b.w) * (b.c / (b.c + 2)) - Math.abs(a.w) * (a.c / (a.c + 2)) || b.c - a.c || a.tag.localeCompare(b.tag)) // strongest first, but well-evidenced beats a lucky single card
    .slice(0, n);
}
// unswiped cards that clear up the least certain tags first
export function moreCards(deck, swipes, profile, n = 10) {
  const seen = swipes || {};
  return asList(deck)
    .map((card, i) => ({ card, i, v: Object.entries(tagWeights(card)).reduce((a, [t, w]) => a + w * (1 - certainty(profile, t)), 0) }))
    .filter(x => !Object.hasOwn(seen, x.card.id))
    .sort((a, b) => b.v - a.v || a.i - b.i)
    .slice(0, n)
    .map(x => x.card);
}

// ---- catalog / deck loading (tolerant about the exact file layout) ----
const pickList = (o, names) => { for (const k of names) if (Array.isArray(o && o[k])) return o[k]; return []; };
// ---- destination data comes from files: only safe ids and real numbers get through ----
export const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const ITEM_ID_RE = /^[-_A-Za-z0-9]{1,64}$/;
const numOr = (v, d = 0) => { const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN; return Number.isFinite(n) ? n : d; };
const strOr = (v, d = '') => (typeof v === 'string' ? v : d);
const safeKeys = list => (Array.isArray(list) ? list.filter(k => typeof k === 'string' && SAFE_ID_RE.test(k)) : []);
export function sanitizeRoutes(routes) {
  const out = [];
  for (const r of Array.isArray(routes) ? routes : []) {
    if (!r || typeof r.id !== 'string' || !SAFE_ID_RE.test(r.id) || !Array.isArray(r.stays) || !Array.isArray(r.nights) || r.stays.length !== r.nights.length) continue;
    const stays = safeKeys(r.stays);
    if (stays.length !== r.stays.length) continue;
    const profile = {};
    for (const k of REGION_KEYS) profile[k] = clamp(numOr(r.profile && r.profile[k]), 0, 1);
    out.push({
      id: r.id, name: strOr(r.name), sub: strOr(r.sub), title: strOr(r.title), lead: strOr(r.lead), ferry: strOr(r.ferry),
      stops: safeKeys(r.stops), stays, nights: r.nights.map(n => Math.max(1, Math.round(numOr(n, 1)))), profile,
      ...(Number.isInteger(r.maxNights) && r.maxNights > 0 ? { maxNights: r.maxNights } : {}),
      legs: (Array.isArray(r.legs) ? r.legs : []).filter(l => l && typeof l === 'object').map(l => ({ from: strOr(l.from), to: strOr(l.to), km: Math.max(0, numOr(l.km)), min: Math.max(0, numOr(l.min)), via: safeKeys(l.via) })),
    });
  }
  return out;
}
// places.json: numeric coordinates only, safe keys
export function sanitizePlaces(p) {
  const pair = v => (Array.isArray(v) && v.length === 2 && v.every(x => Number.isFinite(numOr(x, NaN))) ? [numOr(v[0]), numOr(v[1])] : null);
  const out = { places: {}, names: {}, outline: [], stays: {}, regionTags: {}, regionVeto: {}, tips: [] };
  for (const [k, v] of Object.entries((p && p.places) || {})) if (SAFE_ID_RE.test(k) && pair(v)) out.places[k] = pair(v);
  for (const [k, v] of Object.entries((p && p.names) || {})) if (SAFE_ID_RE.test(k) && v && typeof v === 'object') out.names[k] = { name: strOr(v.name), side: v.side === 'l' ? 'l' : 'r' };
  out.outline = ((p && p.outline) || []).map(pair).filter(Boolean);
  for (const [k, v] of Object.entries((p && p.stays) || {})) {
    if (!SAFE_ID_RE.test(k) || !v || typeof v !== 'object') continue;
    const profile = {};
    for (const rk of REGION_KEYS) profile[rk] = clamp(numOr(v.profile && v.profile[rk]), 0, 1);
    out.stays[k] = {
      name: strOr(v.name, k), short: strOr(v.short, k), kind: strOr(v.kind), coast: v.coast !== false, img: SAFE_ID_RE.test(strOr(v.img)) ? v.img : '', desc: strOr(v.desc), profile,
      sights: (Array.isArray(v.sights) ? v.sights : []).filter(x => x && typeof x === 'object').map(x => ({ title: strOr(x.title), img: SAFE_ID_RE.test(strOr(x.img)) ? x.img : '', text: strOr(x.text) })),
      food: (Array.isArray(v.food) ? v.food : []).filter(x => x && typeof x === 'object').map(x => ({ name: strOr(x.name), text: strOr(x.text) })),
    };
  }
  for (const [map, src] of [[out.regionTags, p && p.regionTags], [out.regionVeto, p && p.regionVeto]]) for (const k of REGION_KEYS) map[k] = (Array.isArray(src && src[k]) ? src[k] : []).filter(t => typeof t === 'string' && isTag(t));
  out.tips = (Array.isArray(p && p.tips) ? p.tips : []).filter(t => t && typeof t === 'object').map(t => ({ title: strOr(t.title), text: strOr(t.text) }));
  return out;
}
// catalog items: a safe id, real coordinates, numeric price level and duration; anything else is dropped or zeroed
export function sanitizeItems(list, kind) {
  const out = [];
  for (const it of Array.isArray(list) ? list : []) {
    if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !ITEM_ID_RE.test(it.id)) continue;
    const lat = numOr(it.lat, NaN), lon = numOr(it.lon, NaN);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const o = { ...it, lat, lon, name: strOr(it.name), region: strOr(it.region) };
    if (kind === 'accommodation') { if ('priceLevel' in it) o.priceLevel = numOr(it.priceLevel, 0) || undefined; } else if ('durationH' in it) o.durationH = numOr(it.durationH, 0) || undefined;
    // party facts: whole numbers, booleans and one of three words, or nothing
    for (const k of ['minAge', 'sleeps']) if (!(Number.isInteger(it[k]) && it[k] > 0 && it[k] < 100)) delete o[k];
    for (const k of ['familyRooms', 'adultsOnly']) if (typeof it[k] !== 'boolean') delete o[k];
    if (!['yes', 'older', 'no'].includes(it.kidFriendly)) delete o.kidFriendly;
    out.push(o);
  }
  return out;
}
// deck cards: a key-safe id and text
export function sanitizeCards(list) {
  return (Array.isArray(list) ? list : []).filter(c => c && typeof c.id === 'string' && ID_RE.test(c.id)).map(c => ({ ...c, title: strOr(c.title), sub: strOr(c.sub) }));
}
export function mergeCatalogs(parts) {
  const acc = [], act = [], seen = new Set();
  for (const p of parts) {
    const list = Array.isArray(p) ? p : null;
    const a = list ? list.filter(x => x.type === 'accommodation') : pickList(p, ['accommodations', 'accommodation', 'acc']);
    const b = list ? list.filter(x => x.type === 'activity') : pickList(p, ['activities', 'activity', 'act']);
    for (const [target, src] of [[acc, a], [act, b]]) for (const it of src) if (it && it.id && !seen.has(it.id)) { seen.add(it.id); target.push(it); }
  }
  return { acc, act };
}
export function normalizeDeck(raw) {
  return { acc: pickList(raw, ['accommodations', 'accommodation', 'acc']), act: pickList(raw, ['activities', 'activity', 'act']) };
}
// photo may be a path or {file|url|src}; relative paths belong to the destination folder
export function photoSrc(item, base = '') {
  const p = item && item.photo;
  const f = typeof p === 'string' ? p : p && (p.file || p.url || p.src || p.path);
  if (typeof f !== 'string' || !f) return '';
  return /^(https:\/\/|data:|\/)/.test(f) ? f : base + f.replace(/^\.\//, '');
}
export const photoOf = (item, base) => photoSrc(item, base) || photoSrc({ photo: item && item.photoGeneric }, base);

// Google Maps search link (no API key): opens the place listing with its photos and reviews
export function mapsUrl(item, town = '') {
  const name = item && typeof item.name === 'string' ? item.name.trim() : '';
  if (!name) return '';
  const q = [name, typeof town === 'string' ? town.trim() : '', 'Corse'].filter(Boolean).join(', ');
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q);
}

// ---- trips: dates, travel party, highlights, the day plan ----
export const KID_AGE = 12; // younger than this on the trip: "met kinderen"
export const MIN_NIGHTS = 2; // per stop
export const NIGHTS_RANGE = [3, 28];
export const HL_REACH_MIN = 75; // a highlight counts as reachable within this many minutes' drive of a stop
export const HL_NEAR_MIN = 30; // closer than this it is "at" the stop; further it is a day trip and counts for HL_TRIP_CREDIT
export const HL_TRIP_CREDIT = 0.75;
// minutes per straight-line km to a sight: calibrated on real drives (Porto - Calvi 35 km = 2 h 15, Zonza - Palombaggia 25 km = 1 h)
export const HL_ROAD = 2.4;
export const hlMin = km => Math.round(km * HL_ROAD);
export const HL_WEIGHT = 3; // what missing every chosen highlight costs a route: more than any taste difference, the chosen highlights come first
export const LONG_LEG_MIN = 90; // after a drive this long the travel day has nothing else planned
export const ACT_MIN = 0.1, ACT_REL = 0.4; // a planned activity scores at least this, and at least this share of the best one at the stop
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
// the first day: the fixed start, or the 1st of the first month of a flexible trip ('' when unknown)
export function tripStart(trip) {
  if (trip && typeof trip.start === 'string' && DAY_RE.test(trip.start)) return trip.start;
  const m = trip && typeof trip.months === 'string' ? trip.months.split(' ')[0] : '';
  return MONTH_RE.test(m) ? m + '-01' : '';
}
// whole days between two YYYY-MM-DD dates (0 when either is missing or the order is wrong)
export function nightsBetween(start, end) {
  if (!DAY_RE.test(String(start)) || !DAY_RE.test(String(end))) return 0;
  const d = (Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000;
  return Number.isFinite(d) && d > 0 ? Math.round(d) : 0;
}
export function addDays(day, n) {
  if (!DAY_RE.test(String(day))) return '';
  return new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
}
// the age a person reaches in the trip's year (only the birth year is known); null when unknown
export function ageOn(born, day) {
  const y = Number(String(day || '').slice(0, 4));
  return Number.isInteger(born) && y > 0 ? Math.max(0, y - born) : null;
}
// a household or party from the database -> [{key, name, born?, uid?}] (keys p0..p11)
export function readPeople(raw) {
  const out = [];
  for (const [k, p] of Object.entries(raw && typeof raw === 'object' ? raw : {})) {
    if (!/^p([0-9]|1[01])$/.test(k) || !p || typeof p !== 'object' || typeof p.name !== 'string' || !p.name.trim()) continue;
    out.push({ key: k, name: p.name.slice(0, 40), ...(Number.isInteger(p.born) && p.born >= 1920 && p.born <= 2040 ? { born: p.born } : {}), ...(typeof p.uid === 'string' && ID_RE.test(p.uid) ? { uid: p.uid } : {}) });
  }
  return out.sort((a, b) => Number(a.key.slice(1)) - Number(b.key.slice(1)));
}
// [{name, born?, uid?}] -> {p0: ..., p1: ...} (at most 12, the shape the rules accept)
export function writePeople(list) {
  const out = {};
  (list || []).filter(p => p && typeof p.name === 'string' && p.name.trim()).slice(0, 12).forEach((p, i) => {
    out['p' + i] = { name: p.name.trim().slice(0, 40), ...(Number.isInteger(p.born) ? { born: p.born } : {}), ...(typeof p.uid === 'string' && ID_RE.test(p.uid) ? { uid: p.uid } : {}) };
  });
  return out;
}
// what the party means for the plan: size, the youngest age (people without a birth year count as adults) and "with kids"
export function partyPrefs(party, trip) {
  const people = readPeople(party), day = tripStart(trip);
  const ages = people.map(p => ageOn(p.born, day)).filter(a => a !== null);
  const youngest = ages.length ? Math.min(...ages) : null;
  return { size: people.length, youngest, kids: youngest !== null && youngest < KID_AGE };
}
// the members' preferences (strictest budget, union of airco/ev) plus what the party says; kids then come from the ages, not from a switch
export function tripPrefs(memberPrefs, trip) {
  const base = combinePrefs(memberPrefs);
  if (!trip || !readPeople(trip.party).length) return base;
  const pp = partyPrefs(trip.party, trip);
  delete base.kids;
  return { ...base, ...(pp.kids ? { kids: true } : {}), size: pp.size, ...(pp.youngest !== null ? { youngest: pp.youngest } : {}) };
}
export function tripNights(trip) {
  const n = trip && trip.start && trip.end ? nightsBetween(trip.start, trip.end) : Number(trip && trip.nights);
  return Number.isInteger(n) && n >= NIGHTS_RANGE[0] && n <= NIGHTS_RANGE[1] ? n : 0;
}
export const highlightIds = trip => String((trip && trip.highlights) || '').split(' ').filter(h => /^[-a-z0-9]{1,40}$/.test(h));
// an activity that is not for the youngest of the party: a stated minimum age, or "not for kids" / "from about 8"
export function tooYoung(item, youngest) {
  if (youngest === null || youngest === undefined) return false;
  if (Number.isInteger(item && item.minAge) && youngest < item.minAge) return true;
  return (item && item.kidFriendly === 'no' && youngest < 16) || (item && item.kidFriendly === 'older' && youngest < 8);
}
// does the whole party fit in one unit? 'ok', 'rooms' (more than one room or unit needed) or 'unknown'
export function roomFit(item, size) {
  if (!size || size <= 2) return 'ok';
  if (!Number.isInteger(item && item.sleeps)) return 'unknown';
  return item.sleeps >= size ? 'ok' : 'rooms';
}
// a stay that refuses the party: adults only with a child along, or a minimum age above the youngest
export const refusesParty = (item, prefs) => !!prefs && ((prefs.kids && item.adultsOnly === true) || (Number.isInteger(item.minAge) && Number.isInteger(prefs.youngest) && prefs.youngest < item.minAge));
// spread n nights over a template's stops in its proportions, at least `min` per stop; null when they do not fit
export function fitNights(template, n, min = MIN_NIGHTS) {
  const k = (template || []).length;
  if (!k || !Number.isInteger(n) || n < k * min) return null;
  const sum = template.reduce((a, b) => a + b, 0);
  const raw = template.map(x => (x * n) / sum);
  const out = raw.map(x => Math.max(min, Math.floor(x)));
  let diff = n - out.reduce((a, b) => a + b, 0);
  const pick = (ok, key) => out.reduce((bi, _, i) => (ok(i) && (bi < 0 || key(i) > key(bi) + 1e-9) ? i : bi), -1);
  while (diff > 0) { out[pick(() => true, i => raw[i] - out[i])]++; diff--; }
  while (diff < 0) { out[pick(i => out[i] > min, i => out[i] - raw[i])]--; diff++; }
  return out;
}
// Chosen highlights over the stops: each goes to the nearest stop within HL_REACH_MIN that still has a free day (caps[i], the nights
// minus the travel day). Highlights with the fewest options are placed first. stop -1: out of reach (far) or no day left (full).
export function placeHighlights(stays, highlights, places, caps = null) {
  const left = caps ? caps.slice() : stays.map(() => Infinity);
  const rows = (highlights || []).map(hl => {
    const opts = [];
    stays.forEach((s, i) => {
      const xy = places[s];
      if (xy) opts.push({ i, min: hlMin(distanceKm({ lat: xy[1], lon: xy[0] }, hl)) });
    });
    opts.sort((a, b) => a.min - b.min || a.i - b.i);
    return { hl, opts, near: opts.filter(o => o.min <= HL_REACH_MIN) };
  });
  const order = rows.slice().sort((a, b) => a.near.length - b.near.length || (a.opts[0] ? a.opts[0].min : 1e9) - (b.opts[0] ? b.opts[0].min : 1e9) || a.hl.id.localeCompare(b.hl.id));
  const placed = new Map();
  for (const r of order) {
    const o = r.near.find(x => left[x.i] > 0);
    if (o) left[o.i]--;
    placed.set(r, o ? { stop: o.i, min: o.min } : { stop: -1, min: r.opts.length ? r.opts[0].min : null, why: r.near.length ? 'full' : 'far' });
  }
  return rows.map(r => ({ hl: r.hl, ...placed.get(r) }));
}
// ---- generated routes: every sensible combination of 1-4 stays from a ferry port, next to the hand-made templates ----
export const GEN_PORTS = ['bastia', 'ajaccio'];
export const EAST_LON = 9.25; // east of this the coast road is fast (Bastia, Porto-Vecchio, Solenzara; not the mountain villages)
// minutes between two places without a known drive: calibrated on the template legs (east coast about 1.4 min per straight km, elsewhere 2.8)
export const roadMin = (a, b) => Math.round(distanceKm(a, b) * (a.lon >= EAST_LON && b.lon >= EAST_LON ? 1.4 : 2.8));
const permutations = list => (list.length <= 1 ? [list] : list.flatMap((x, i) => permutations([...list.slice(0, i), ...list.slice(i + 1)]).map(p => [x, ...p])));
function combinations(list, k, from = 0) {
  if (!k) return [[]];
  const out = [];
  for (let i = from; i <= list.length - k; i++) for (const rest of combinations(list, k - 1, i + 1)) out.push([list[i], ...rest]);
  return out;
}
const placeName = (k, stays) => (stays[k] && stays[k].short) || k.charAt(0).toUpperCase() + k.slice(1);
// For each set of 1..maxStops stays: the port and order with the least driving (known template legs first, else roadMin).
// Routes with a leg over maxLegMin, or that are a template already, are left out. Ids are g1, g2, ... in a stable order.
export function generateRoutes(templates, places, stays, { ports = GEN_PORTS, maxStops = 4, maxLegMin = 270 } = {}) {
  const pt = k => (places[k] ? { lon: places[k][0], lat: places[k][1] } : null);
  const known = new Map();
  for (const r of templates || []) for (const l of r.legs || []) {
    const a = l.via && l.via[0], b = l.via && l.via[l.via.length - 1];
    if (a && b) for (const [x, y, via] of [[a, b, l.via], [b, a, l.via.slice().reverse()]]) if (!known.has(x + '>' + y)) known.set(x + '>' + y, { km: l.km, min: l.min, via });
  }
  const keys = Object.keys(stays).filter(k => pt(k)).sort();
  // shortest drives between all places: a known leg, else the estimate, improved through other places (Calvi - Porto-Vecchio goes via Corte)
  const nodes = [...new Set([...keys, ...ports.filter(pt)])];
  const D = {};
  for (const a of nodes) for (const b of nodes) D[a + '>' + b] = a === b ? { km: 0, min: 0, via: [a] } : known.get(a + '>' + b) || { km: Math.round(distanceKm(pt(a), pt(b)) * 1.3), min: roadMin(pt(a), pt(b)), via: [a, b] };
  for (const m of nodes) for (const a of nodes) for (const b of nodes) {
    const x = D[a + '>' + m], y = D[m + '>' + b];
    if (a !== b && m !== a && m !== b && x.min + y.min < D[a + '>' + b].min) D[a + '>' + b] = { km: x.km + y.km, min: x.min + y.min, via: [...x.via, ...y.via.slice(1)] };
  }
  const leg = (a, b) => D[a + '>' + b];
  const setKey = list => list.slice().sort().join('>'); // the same places in another order are the same trip
  const seen = new Set((templates || []).map(r => setKey(r.stays)));
  const ferry = Object.fromEntries(ports.map(p => [p, ((templates || []).find(r => r.stops && r.stops[0] === p && r.stops[r.stops.length - 1] === p) || {}).ferry || '']));
  const out = [];
  for (let k = 1; k <= maxStops; k++) for (const set of combinations(keys, k)) {
    let best = null;
    for (const port of ports.filter(pt)) for (const order of permutations(set)) {
      const path = [port, ...order, port], legs = path.slice(1).map((b, i) => leg(path[i], b));
      if (legs.some(l => l.min > maxLegMin)) continue;
      const total = legs.reduce((a, l) => a + l.min, 0);
      if (!best || total < best.total) best = { path, order, legs, total };
    }
    if (!best || seen.has(setKey(best.order))) continue;
    seen.add(setKey(best.order));
    const names = best.order.map(s => placeName(s, stays));
    const title = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' en ' + names[names.length - 1];
    const profile = {};
    for (const rk of REGION_KEYS) profile[rk] = r3(mean(best.order.map(s => numOr(stays[s].profile && stays[s].profile[rk]))));
    out.push({
      id: '', name: 'Op maat: ' + title, sub: k === 1 ? 'Eén verblijfplaats' : k + ' verblijfplaatsen', title, generated: true,
      lead: `Samengesteld voor jullie reis: ${best.order.map(s => placeName(s, stays) + (stays[s].kind ? ` (${stays[s].kind.toLowerCase()})` : '')).join(', ')}. De ferry komt aan en vertrekt in ${placeName(best.path[0], stays)}.`,
      ferry: ferry[best.path[0]], stops: best.path, stays: best.order, nights: best.order.map(() => 1), profile,
      legs: best.legs.map((l, i) => ({ from: placeName(best.path[i], stays), to: placeName(best.path[i + 1], stays), km: l.km, min: l.min, via: l.via })),
      ...(k === 1 ? { maxNights: 10 } : k === 2 ? { maxNights: 16 } : {}),
    });
  }
  out.sort((a, b) => a.stays.length - b.stays.length || a.stays.join().localeCompare(b.stays.join()));
  out.forEach((r, i) => { r.id = 'g' + (i + 1); });
  return out;
}

// the routes (ids, ranking order) that give this highlight a day: the explanation for a highlight that does not fit
export const routesWith = (plans, hlId) => (plans || []).filter(p => (p.placed || []).some(x => x.hl.id === hlId && x.stop >= 0)).map(p => p.route.id);
// chosen highlights far apart for the trip length: the warning in the wizard (both ends of the island in a week means a lot of driving)
export function highlightsFarApart(hls, nights) {
  let spread = 0;
  for (const a of hls || []) for (const b of hls || []) spread = Math.max(spread, distanceKm(a, b));
  return nights > 0 && ((spread >= 100 && nights <= 8) || (spread >= 150 && nights <= 11)) ? Math.round(spread) : 0;
}
// highlights from a file: safe ids, real coordinates, a category and the activity ids it stands for
export function sanitizeHighlights(list) {
  return (Array.isArray(list) ? list : []).filter(h => h && typeof h.id === 'string' && /^[-a-z0-9]{1,40}$/.test(h.id) && Number.isFinite(numOr(h.lat, NaN)) && Number.isFinite(numOr(h.lon, NaN)))
    .map(h => ({ id: h.id, name: strOr(h.name, h.id), cat: strOr(h.cat), desc: strOr(h.desc), lat: numOr(h.lat), lon: numOr(h.lon), acts: (Array.isArray(h.acts) ? h.acts : []).filter(a => typeof a === 'string' && ITEM_ID_RE.test(a)) }));
}
const heavy = it => { const tw = tagWeights(it); return (it.durationH || 0) >= 5 || tw.effort_high >= 0.5 || tw.hike_hard >= 0.5 || tw.canyoning >= 0.5; };
const light = it => (it.durationH || 0) <= 3 && !heavy(it);
// Day by day: day 1 and every change of stop is a travel day with something light nearby; each chosen highlight gets a day at its stop;
// the other days get the best activities near the stop that fit the taste (score > 0; no repeats, another kind than the day before when
// possible), else a free day; with kids or a laid-back profile a quiet day follows two heavy ones. After a long drive the travel day
// stays empty. Exactly nights + 1 days (the last one is the way back to the ferry).
// opts.evening: afterwards every day but the last gets an evening suggestion (going out or eating near the stay) while there are new
// ones. It is a bonus: it never takes an activity away from any day, and never one that is planned for a day.
// opts: { picks: placeHighlights() with .item (the activity), calm, evening, start (YYYY-MM-DD for fixed dates) }
export function dayPlan(plan, { picks = [], calm = false, evening = false, start = '' } = {}) {
  const days = [], used = new Set(), legs = plan.route.legs || [];
  const unplaced = picks.filter(p => p.stop < 0).map(p => p.hl);
  for (const p of picks) for (const id of [p.item && p.item.id, ...((p.hl && p.hl.acts) || [])]) if (id) used.add(id); // a highlight is never also a plain activity, at any stop
  let streak = 0, prevCluster = null;
  const push = d => { days.push({ n: days.length + 1, ...(start ? { date: addDays(start, days.length) } : {}), ...d }); };
  const next = (list, ok = () => true) => list.find(a => !used.has(a.item.id) && ok(a.item));
  plan.stops.forEach((s, si) => {
    const queue = picks.filter(p => p.stop === si).sort((a, b) => a.min - b.min || a.hl.id.localeCompare(b.hl.id));
    const top = Math.max(0, ...(s.acts || []).map(a => a.score));
    const clear = (s.acts || []).filter(a => a.score >= Math.max(ACT_MIN, ACT_REL * top));
    const acts = calm ? clear : (s.acts || []).filter(a => a.score > 0); // a calm party gets free days rather than a so-so outing; an active one a full programme
    const free = Math.max(0, s.nights - 1);
    if (queue.length > free) unplaced.push(...queue.splice(free).map(p => p.hl)); // more highlights than days at this stop
    for (let k = 0; k < s.nights; k++) {
      if (k === 0) {
        const long = legs[si] && legs[si].min >= LONG_LEG_MIN;
        const pick = long ? null : next(acts, light);
        if (pick) used.add(pick.item.id);
        push({ kind: 'travel', stay: s.stay, leg: legs[si] || null, ...(pick ? { act: pick } : {}) });
        streak = 0; prevCluster = null;
        continue;
      }
      if (queue.length) {
        const p = queue.shift();
        push({ kind: 'highlight', stay: s.stay, hl: p.hl, ...(p.item ? { item: p.item } : {}), min: p.min });
        streak = p.item && heavy(p.item) ? streak + 1 : 0; prevCluster = p.item ? clusterOf(p.item) : null;
        continue;
      }
      if (calm && streak >= 2) {
        const pick = next(acts, it => light(it) && ['sea', 'relax'].includes(clusterOf(it)));
        if (pick) used.add(pick.item.id);
        push({ kind: 'rest', stay: s.stay, ...(pick ? { act: pick } : {}) });
        streak = 0; prevCluster = null;
        continue;
      }
      const pick = next(acts, it => clusterOf(it) !== prevCluster) || next(acts);
      if (pick) {
        used.add(pick.item.id);
        push({ kind: 'activity', stay: s.stay, act: pick });
        streak = heavy(pick.item) ? streak + 1 : 0; prevCluster = clusterOf(pick.item);
      } else { push({ kind: 'free', stay: s.stay }); streak = 0; prevCluster = null; }
    }
    // an alternative per activity day: something at this stop that is nowhere else in the plan
    for (const d of days) if (d.stay === s.stay && d.kind === 'activity' && !d.alt) { const alt = next(clear); if (alt) { used.add(alt.item.id); d.alt = alt; } }
  });
  if (evening) {
    const eve = new Set();
    for (const s of plan.stops) for (const d of days) if (d.stay === s.stay) {
      const e = (s.evenings || []).find(a => a.score > 0 && !used.has(a.item.id) && !eve.has(a.item.id));
      if (e) { eve.add(e.item.id); d.evening = e; }
    }
  }
  push({ kind: 'depart', stay: plan.stops.length ? plan.stops[plan.stops.length - 1].stay : '', leg: legs[legs.length - 1] || null });
  return { days, unplaced };
}

// ---- tokens and links (same pattern as De Michel) ----
const TOKEN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export function newToken(len = 12, rand = n => globalThis.crypto.getRandomValues(new Uint8Array(n))) {
  let out = '';
  while (out.length < len) for (const b of rand(len * 2)) { if (b < 248 && out.length < len) out += TOKEN_CHARS[b % 62]; } // 248 = 4 * 62: unbiased
  return out;
}
export const isValidCode = c => typeof c === 'string' && CODE_RE.test(c);
// token from a pasted link ("...?g=TOKEN"); '' when there is none. Only full links count, never a bare token.
export function tokenFromLink(text, app = null) {
  let u;
  try { u = new URL(String(text ?? '').trim()); } catch { return ''; }
  if (app) {
    const path = x => x.replace(/index\.html$/, '');
    if (u.origin !== app.origin || path(u.pathname) !== path(app.pathname)) return '';
  }
  const g = u.searchParams.get('g') || '';
  return isValidCode(g) ? g : '';
}
export const shareUrl = (origin, pathname, code) => `${origin}${pathname}?g=${code}`;
export const shareText = (name, url) => `Plan mee de reis naar Corsica (${name}): ${url}`;
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmtMin = m => Math.floor(m / 60) + ' u ' + String(m % 60).padStart(2, '0');
