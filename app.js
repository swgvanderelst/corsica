// Corsica app: sign-in, swipe decks, taste profile, trips (dates, party, highlights, shared with the travel party),
// ranked routes of exactly the trip length with a day-by-day plan, 3 stays per stop and a map of activities.
import {
  MIN_SKIP, SWIPE, profileFrom, certainty, summarize, readSummary, cleanSwipes, topTags, moreCards, tagWeights, flattenLabels,
  groupProfile, rankRoutes, effectiveOverrides, tripPrefs, tripNights, tripStart, highlightIds, readPeople, writePeople, ageOn, routesWith, generateRoutes, dayPlan, resolvePace, likesEvenings, burdenWeight, sanitizeHighlights, nightsBetween, tooYoung, NIGHTS_RANGE, cleanOverrides, cleanPrefs, hiddenReasons, sanitizeRoutes, sanitizePlaces, sanitizeItems, sanitizeCards, combinePrefs, readPrefs, memberName, regionAffinity, mergeCatalogs, normalizeDeck, photoOf, mapsUrl, newToken, isValidCode, tokenFromLink, shareUrl, shareText,
  escapeHtml as esc, fmtMin,
} from './logic.js';
import { createDeck } from './deck.js';
import { routeSvg, mountMap } from './maps.js';

const $ = id => document.getElementById(id);
const q = new URLSearchParams(location.search);
const rd = k => { try { return localStorage.getItem(k); } catch { return null; } };
const wr = (k, v) => { try { if (v === null || v === undefined) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
const rdj = (k, d) => { try { return JSON.parse(rd(k)) ?? d; } catch { return d; } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------- state ----------
const S = {
  store: null, user: null, displayName: '', allowed: new Set(), mode: 'loading', tab: 'routes', online: true,
  dest: null, places: null, routes: [], catalog: { acc: [], act: [] }, deck: { acc: [], act: [] }, labels: {}, tagsJson: {}, credits: {}, base: '', deckBase: '',
  swipes: {}, overrides: {}, prefs: {}, skipped: {}, groups: [], gdata: {}, unwatch: {}, toggles: {}, household: [], highlights: [], wiz: null,
  deckKind: null, deckFrom: null, deckSession: null, interstitial: null,
  ranked: {}, joinPending: null,
};
const pushed = []; // open pushed screens
let deckCtl = null, persistT = null, saving = Promise.resolve();

// ---------- helpers ----------
const GRAD = ['#0f6e7c,#4c6b3a', '#c27a1d,#7a4a8a', '#4c6b3a,#0f6e7c', '#7a4a8a,#0f6e7c', '#9a5b2a,#4c6b3a', '#2a6f97,#c27a1d'];
const grad = key => GRAD[String(key || 'x').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % GRAD.length];
const safeUrl = u => (typeof u === 'string' && /^https?:\/\//i.test(u) ? u : '');
const phHtml = (src, key, cls = '', inner = '') => `<span class="ph ${cls}" style="--g:${grad(key)}">${src ? `<img src="${esc(src)}" alt="" draggable="false" onerror="this.remove()">` : ''}${inner}</span>`;
const stayImg = key => S.dest.stayImages + key + '.jpg';
const label = t => S.labels[t] || t;
const euro = n => (typeof n === 'number' && n > 0 ? '€'.repeat(Math.min(4, Math.round(n))) : '');
const dur = h => (typeof h !== 'number' ? '' : h < 1 ? Math.round(h * 60) + ' min' : 'ca. ' + (Math.round(h * 2) / 2).toString().replace('.', ',') + ' u');
const CHEV = '<svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const BACK = '<svg viewBox="0 0 12 20" aria-hidden="true"><path d="M10 2 2 10l8 8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const GOOGLE = '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>';
const TABS = [
  ['routes', 'Reizen', '<svg viewBox="0 0 24 24"><path d="M3 18c3-8 6-8 9-3s6 3 9-6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><circle cx="3.5" cy="18" r="1.6" fill="currentColor"/><circle cx="20.5" cy="9" r="1.6" fill="currentColor"/></svg>'],
  ['profile', 'Profiel', '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.9"/><path d="M4 20c1-4 4-6 8-6s7 2 8 6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>'],
];

function toast(msg, ms = 2600) {
  const t = $('toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), ms);
}
const AUTH_MSG = {
  'auth/unauthorized-domain': 'Dit domein staat nog niet toe dat je inlogt met Google.', 'auth/network-request-failed': 'Geen verbinding. Probeer het opnieuw.',
  'auth/popup-blocked': 'De inlogpopup werd geblokkeerd. Sta popups toe en probeer opnieuw.', 'auth/web-storage-unsupported': 'Je browser blokkeert opslag, en die is nodig om in te loggen.',
  'auth/operation-not-allowed': 'Inloggen met Google staat nog niet aan.', 'auth/account-exists-with-different-credential': 'Dit e-mailadres hoort bij een ander inlogtype.',
  'auth/user-disabled': 'Dit account is geblokkeerd.', 'auth/too-many-requests': 'Te veel pogingen. Wacht even en probeer opnieuw.',
};
const authMsg = code => AUTH_MSG[code] || `Inloggen met Google is niet gelukt (${String(code || 'onbekend').slice(0, 60)}).`;
const errMsg = e => (e && e.code === 'auth' ? authMsg(e.message) : { network: 'Geen verbinding. Probeer het zo nog eens.', denied: 'Dat mag niet.', taken: 'Die link bestaat al, probeer opnieuw.' }[e && e.code] || 'Er ging iets mis.');
function fatal(title, text, retry = true) {
  const f = $('fatal');
  f.hidden = false;
  f.innerHTML = `<h2>${esc(title)}</h2><p>${esc(text)}</p>${retry ? '<button class="btn" data-a="reload">Opnieuw proberen</button>' : ''}`;
}

// ---------- data ----------
const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
// ?dest only on localhost and only for files under destinations/ or test/fixtures/ (the github.io origin is shared with other apps)
const DEST_RE = /^(destinations|test\/fixtures)\/[\w-]+(\/[\w-]+)*\.json$/;
const sameOrigin = u => { try { return new URL(u, location.href).origin === location.origin; } catch { return false; } };
async function fetchJson(url, optional = false) {
  try {
    if (typeof url !== 'string' || !sameOrigin(url)) throw new Error('not a file of this app: ' + url);
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) { if (optional) return null; throw new Error(url + ' ' + r.status); }
    return await r.json();
  } catch (e) { if (optional) return null; throw e; }
}
const cleanTags = t => {
  const out = {};
  for (const g of ['accommodation', 'activity', 'region']) { out[g] = {}; for (const [k, v] of Object.entries((t && t[g]) || {})) if (/^[a-z_]{1,24}$/.test(k) && k !== '__proto__' && typeof v === 'string') out[g][k] = v; }
  return out;
};
async function loadDestination() {
  const custom = isLocalHost ? q.get('dest') : null; // e.g. ?dest=test/fixtures/destination.json (test data)
  const url = custom && DEST_RE.test(custom) ? custom : 'destinations/corsica/destination.json';
  const dest = await fetchJson(url);
  const path = p => (typeof p === 'string' && sameOrigin(p) && !/^[a-z][a-z0-9+.-]*:/i.test(p) ? p : '');
  for (const k of ['tags', 'places', 'routes', 'deck', 'credits', 'base', 'stayImages', 'highlights']) dest[k] = path(dest[k]);
  dest.catalogs = (Array.isArray(dest.catalogs) ? dest.catalogs : []).map(path).filter(Boolean);
  const [tags, places, routes, deck, credits, highlights, ...catalogs] = await Promise.all([
    fetchJson(dest.tags), fetchJson(dest.places), fetchJson(dest.routes), dest.deck ? fetchJson(dest.deck, true) : null, dest.credits ? fetchJson(dest.credits, true) : null, dest.highlights ? fetchJson(dest.highlights, true) : null,
    ...dest.catalogs.map(c => fetchJson(c, true)),
  ]);
  S.dest = dest; S.base = dest.base; S.deckBase = dest.deck.replace(/[^/]*$/, '');
  S.tagsJson = cleanTags(tags); S.labels = flattenLabels(S.tagsJson);
  S.allowed = new Set(Object.keys(S.labels)); // the only tags that may appear in other people's data
  S.places = sanitizePlaces(places); S.routes = sanitizeRoutes(routes && routes.routes);
  S.routes.push(...generateRoutes(S.routes, S.places.places, S.places.stays)); // tailor-made combinations next to the templates S.credits = credits && typeof credits === 'object' ? credits : {};
  const cat = mergeCatalogs(catalogs.filter(Boolean));
  S.catalog = { acc: sanitizeItems(cat.acc, 'accommodation'), act: sanitizeItems(cat.act, 'activity') };
  S.highlights = sanitizeHighlights(highlights);
  const dk = deck ? normalizeDeck(deck) : { acc: [], act: [] };
  S.deck = { acc: sanitizeCards(dk.acc), act: sanitizeCards(dk.act) };
}
const allCards = () => [...S.deck.acc, ...S.deck.act];
const myProfile = () => profileFrom(S.swipes, allCards(), effectiveOverrides(S.overrides, S.prefs));
const deckOf = kind => S.deck[kind] || [];
const doneIn = kind => deckOf(kind).filter(c => Object.hasOwn(S.swipes, c.id)).length;
const deckDone = kind => !!S.skipped[kind] || (deckOf(kind).length > 0 ? doneIn(kind) >= deckOf(kind).length : true);
const key = k => `corsica_${k}_${S.user.uid}`;
const firstName = n => String(n || '').trim().split(/\s+/)[0].slice(0, 40) || 'Reiziger';
const myName = () => (S.displayName || 'Reiziger').slice(0, 40);

// ---------- persistence ----------
function saveLocal() { wr(key('name'), S.displayName); wr(key('overrides'), JSON.stringify(S.overrides)); wr(key('prefs'), JSON.stringify(S.prefs)); wr(key('swipes'), JSON.stringify(S.swipes)); wr(key('skipped'), JSON.stringify(S.skipped)); wr(key('groups'), JSON.stringify(S.groups)); wr(key('household'), JSON.stringify(writePeople(S.household))); }
function schedulePersist() {
  saveLocal();
  clearTimeout(persistT);
  persistT = setTimeout(persist, 600);
}
function persist() {
  clearTimeout(persistT); persistT = null;
  saving = saving.then(async () => {
    if (!S.user) return;
    try {
      await S.store.saveUser({ name: myName(), swipes: S.swipes, overrides: S.overrides, prefs: S.prefs, household: writePeople(S.household), groups: Object.fromEntries(S.groups.map(g => [g, true])) });
      await syncProfiles();
      wr(key('dirty'), null);
    } catch (e) { wr(key('dirty'), '1'); if (e.code === 'network') toast('Offline: je swipes worden later opgeslagen.'); }
  });
  return saving;
}
async function syncProfiles() {
  const p = myProfile();
  for (const gid of S.groups) {
    const g = S.gdata[gid];
    if (g && (!g.members || g.members[S.user.uid] === undefined)) continue; // not (or no longer) a member
    try { if (p.n > 0) await S.store.setProfile(gid, summarize(p, Date.now(), S.prefs, S.allowed)); else await S.store.deleteProfile(gid); } catch { /* retried at the next save */ }
  }
}
addEventListener('pagehide', () => { if (persistT) persist(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && persistT) persist(); });

// ---------- sign-in ----------
async function onUser(user) {
  if (user && S.user && S.user.uid === user.uid) return; // the same sign-in announced twice
  if (!user) { teardown(); S.user = null; S.mode = 'login'; render(); return; }
  S.user = user;
  S.swipes = cleanSwipes(rdj(key('swipes'), {}));
  S.skipped = rdj(key('skipped'), {});
  S.overrides = cleanOverrides(rdj(key('overrides'), {}), S.allowed);
  S.displayName = firstName(rd(key('name')) || user.name);
  S.prefs = cleanPrefs(rdj(key('prefs'), {}));
  S.groups = rdj(key('groups'), []).filter(g => typeof g === 'string');
  S.household = readPeople(rdj(key('household'), {}));
  S.toggles = rdj(key('toggles'), {});
  S.mode = 'loading'; render();
  let server = null, offline = false;
  try { server = await S.store.getUser(); } catch { offline = true; }
  if (server) {
    const remote = cleanSwipes(server.swipes);
    if (Object.keys(remote).length || !Object.keys(S.swipes).length) S.swipes = remote; // the server is authoritative once it has swipes
    S.groups = [...new Set([...Object.keys(server.groups || {}), ...S.groups])];
    if (rd(key('dirty')) !== '1') { S.overrides = cleanOverrides(server.overrides, S.allowed); S.prefs = cleanPrefs(server.prefs); S.household = readPeople(server.household); if (typeof server.name === 'string' && server.name) S.displayName = server.name.slice(0, 40); } // the server record wins unless local changes never arrived
    if (rd(key('dirty')) === '1') { /* local changes that never arrived: keep them */ }
  }
  saveLocal();
  if (!server && !offline) persist(); // first login: create the user record
  if (server && rd(key('dirty')) === '1') persist();
  S.groups.forEach(watchGroup);
  S.interstitial = null;
  await handlePendingJoin();
  S.mode = nextMode();
  S.tab = 'routes';
  render();
}
function nextMode() {
  if (!Object.keys(S.swipes).length && !S.skipped.acc && !S.skipped.act) return 'intro';
  for (const kind of ['acc', 'act']) {
    if (!deckDone(kind) && deckOf(kind).length) { // resume where the person stopped
      S.deckKind = kind; S.deckFrom = null; S.interstitial = null;
      S.deckSession = deckOf(kind).filter(c => !Object.hasOwn(S.swipes, c.id));
      return 'deck';
    }
  }
  return 'app';
}
function teardown() {
  for (const f of Object.values(S.unwatch)) f();
  S.unwatch = {}; S.gdata = {}; pushed.length = 0; $('pushed').innerHTML = '';
  if (deckCtl) { deckCtl.destroy(); deckCtl = null; }
}

// ---------- profile / ranking (per trip) ----------
const tripOf = gid => (S.gdata[gid] && S.gdata[gid].trip) || null;
// the taste of a trip: the members who count (switch) and have swiped; the preferences of all of them plus what the party says
function tripProfile(gid) {
  const me = myProfile();
  const g = S.gdata[gid];
  if (!g) return { profile: me, members: me.n ? 1 : 0, missing: [], names: [], prefs: S.prefs, trip: null };
  const tog = S.toggles[gid] || {};
  const list = [], names = [], missing = [], prefList = [];
  for (const [uid, m] of Object.entries(g.members || {})) {
    if (tog[uid] === false) continue;
    const name = memberName(m);
    const p = uid === S.user.uid ? me : readSummary(g.profiles && g.profiles[uid], S.allowed);
    prefList.push(uid === S.user.uid ? S.prefs : readPrefs(g.profiles && g.profiles[uid])); // the strictest budget, the union of the must-haves
    if (p.n > 0) { list.push(p); names.push(name); } else missing.push(name);
  }
  return { profile: groupProfile(list), members: list.length, missing, names, prefs: tripPrefs(prefList, g.trip), trip: g.trip || null };
}
const hlById = id => S.highlights.find(h => h.id === id);
const actById = id => S.catalog.act.find(a => a.id === id);
function ctx(prefs, trip) {
  return { acc: S.catalog.acc, act: S.catalog.act, places: S.places.places, stays: S.places.stays, regionTags: S.places.regionTags, regionVeto: S.places.regionVeto, labels: S.labels, prefs,
    trip: true, pace: trip && trip.pace, nights: tripNights(trip) || undefined, highlights: highlightIds(trip).map(hlById).filter(Boolean), vocab: { acc: Object.keys(S.tagsJson.accommodation || {}), act: Object.keys(S.tagsJson.activity || {}) } };
}
function rankedFor(gid) {
  const tp = tripProfile(gid);
  const k = JSON.stringify([tp.profile, tp.prefs, tp.trip, S.catalog.acc.length, S.catalog.act.length]);
  if (!S.ranked[gid] || S.ranked[gid].k !== k) S.ranked[gid] = { k, plans: rankRoutes(S.routes, tp.profile, ctx(tp.prefs, tp.trip)) };
  return { plans: S.ranked[gid].plans, tp };
}
function prefsChanged() { S.ranked = {}; schedulePersist(); if (S.mode === 'deck') render(); else if (S.mode === 'app') refreshLive(); }
const pctText = p => (p.matchPct == null ? 'minder passend' : p.matchPct + '%');

// ---------- rendering ----------
function render() {
  const root = $('root');
  $('tabs').hidden = S.mode !== 'app';
  root.classList.toggle('withtabs', S.mode === 'app');
  if (deckCtl && S.mode !== 'deck') { deckCtl.destroy(); deckCtl = null; }
  if (S.mode === 'loading') root.innerHTML = '<div class="login"><div class="spin"></div></div>';
  else if (S.mode === 'login') renderLogin(root);
  else if (S.mode === 'intro') renderIntro(root);
  else if (S.mode === 'deck') renderDeck(root);
  else renderApp(root);
}
function renderLogin(root) {
  const anon = S.store.auth.canAnonymous && (q.get('test') === '1');
  root.innerHTML = `<div class="login">
    ${phHtml(stayImg('piana'), 'piana', '', '<span class="ov"><b>Corsica</b><span>Een reis die past bij jouw smaak</span></span>')}
    <div class="box">
      <p style="margin:0 0 4px">Swipe door accommodaties en activiteiten. De app leert wat jij leuk vindt en stelt daar de reis bij samen.</p>
      <button class="btn google" data-a="google">${GOOGLE}<span>Inloggen met Google</span></button>
      ${anon ? '<button class="btn alt" data-a="anon">Doorgaan als testgebruiker</button>' : ''}
      ${S.store.kind === 'dev' ? '<p class="note">Lokale testomgeving: inloggen is nagebootst.</p>' : ''}
    </div></div>`;
}
function renderIntro(root) {
  const na = deckOf('acc').length, nb = deckOf('act').length;
  root.innerHTML = `<div class="scroll pad" style="padding-top:calc(24px + env(safe-area-inset-top,0px))">
    <div class="large">Hoi ${esc(firstName(S.displayName))}</div>
    <p class="subt">Zo leert Corsica jouw smaak kennen.</p>
    <ol class="steps">
      <li><div><b>Swipe ${na || 25} accommodaties</b><span>Rechts of LEUK als het je aanspreekt, links of NIET als het niets voor je is. Omhoog is super leuk.</span></div></li>
      <li><div><b>Swipe ${nb || 25} activiteiten</b><span>Wandelen, strand, eten, uitgaan: laat zien wat je wilt doen.</span></div></li>
      <li><div><b>Plan je reis</b><span>Kies wanneer, met wie en welke highlights. Je krijgt een schema voor elke dag, per stop de 3 beste verblijven en een kaart met activiteiten. Deel de reis met je reisgenoten.</span></div></li>
    </ol>
    <button class="btn" data-a="start">Beginnen</button>
    <p class="note">Je kunt na 10 kaarten overslaan en later altijd verder swipen.</p>
  </div>`;
}

// ---------- deck ----------
function cardHtml(card) {
  const w = Object.entries(tagWeights(card)).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([t]) => `<i>${esc(label(t))}</i>`).join('');
  const src = photoOf(card, S.deckBase);
  return `${phHtml(src, card.id)}<div class="ov"><b>${esc(card.title)}</b><span>${esc(card.sub || '')}</span><div class="tg">${w}</div></div>`;
}
function startDeck(kind, { from = null, cards = null } = {}) {
  S.deckKind = kind; S.deckFrom = from; S.interstitial = null;
  S.deckSession = cards || deckOf(kind).filter(c => !Object.hasOwn(S.swipes, c.id));
  S.mode = 'deck';
  render();
}
function deckTotal() { return S.deckKind === 'more' ? S.deckSession.length : deckOf(S.deckKind).length; }
function deckCount() { return S.deckKind === 'more' ? S.deckSession.filter(c => Object.hasOwn(S.swipes, c.id)).length : doneIn(S.deckKind); }
const KIND_NAME = { acc: 'Accommodaties', act: 'Activiteiten', more: 'Extra kaarten' };
function renderDeck(root) {
  if (S.interstitial) return renderInterstitial(root);
  const kind = S.deckKind;
  root.innerHTML = `<div class="deckscreen">
    <div class="dhead"><div class="dtop"><span class="kick">${KIND_NAME[kind]}</span><span class="cnt" id="dcnt"></span>
      <button class="skip" data-a="skip" id="dskip" hidden>Overslaan</button>${S.deckFrom ? '<button class="close" data-a="deck-close">Sluiten</button>' : ''}</div>
      <div class="progress" role="progressbar" aria-label="Voortgang"><i id="dbar"></i></div></div>
    <div class="deckwrap"><div class="deck" id="deck"></div></div>
    <div class="dbtns">
      <button class="rb undo" data-a="undo" id="bundo" aria-label="Ongedaan maken" disabled>&#8630;</button>
      <button class="rb no" data-a="nope" aria-label="Niet leuk">NIET</button>
      <button class="rb sup" data-a="super" aria-label="Super leuk">&#9733;</button>
      <button class="rb yes" data-a="like" aria-label="Leuk">LEUK</button>
    </div></div>`;
  deckCtl = createDeck($('deck'), {
    cards: S.deckSession,
    render: cardHtml,
    onSwipe: (card, v) => { S.swipes[card.id] = v; schedulePersist(); updateDeckUi(); if (!remaining()) deckFinished(); },
    onUndo: card => { delete S.swipes[card.id]; schedulePersist(); updateDeckUi(); },
    onChange: () => updateDeckUi(),
  });
  updateDeckUi();
  if (!S.deckSession.length) deckFinished();
}
const remaining = () => deckCtl ? S.deckSession.length - deckCtl.index : 0;
function updateDeckUi() {
  const total = deckTotal(), done = deckCount();
  const c = $('dcnt'); if (!c) return;
  c.textContent = `${done} van ${total}`;
  $('dbar').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
  $('bundo').disabled = !deckCtl || !deckCtl.canUndo;
  const sk = $('dskip');
  if (sk) { sk.hidden = !(remaining() > 0 && (S.deckKind === 'more' || done >= MIN_SKIP)); sk.textContent = S.deckKind === 'more' ? 'Klaar' : 'Overslaan'; }
}
function deckFinished(skipped = false) {
  const kind = S.deckKind;
  if (skipped && kind !== 'more') { S.skipped[kind] = true; schedulePersist(); }
  if (deckCtl) { deckCtl.destroy(); deckCtl = null; }
  if (S.deckFrom) { S.mode = 'app'; S.tab = S.deckFrom; S.deckFrom = null; render(); toast('Je profiel is bijgewerkt'); return; }
  if (kind === 'acc' && !deckDone('act') && deckOf('act').length) S.interstitial = { next: 'act', title: 'Accommodaties klaar', text: 'Nu de activiteiten: wat wil je doen op Corsica?', btn: 'Verder met activiteiten' };
  else S.interstitial = { next: 'app', title: 'Je profiel staat', text: 'Op basis van jouw swipes hebben we de reizen voor je gerangschikt.', btn: 'Bekijk mijn reizen', prefs: true };
  S.mode = 'deck'; render();
}
function renderInterstitial(root) {
  const i = S.interstitial;
  root.innerHTML = `<div class="interstitial${i.prefs ? ' long' : ''}"><div class="big" aria-hidden="true">&#10003;</div><div class="large">${esc(i.title)}</div><p class="subt">${esc(i.text)}</p>${i.prefs ? prefsHtml() : ''}<button class="btn" data-a="next-deck">${esc(i.btn)}</button></div>`;
}

// ---------- app shell: tabs ----------
function renderApp(root) {
  $('tabs').innerHTML = TABS.map(([id, name, svg]) => `<button role="tab" data-a="tab" data-tab="${id}" aria-selected="${S.tab === id}">${svg}<span>${name}</span></button>`).join('');
  root.innerHTML = `<div class="scroll pad" id="rootscroll" style="padding-top:calc(14px + env(safe-area-inset-top,0px))">${S.tab === 'profile' ? profileHtml() : tripsHtml()}</div>`;
}
const PREF_ROWS = [['airco', 'Airco nodig'], ['ev', 'Laadpaal nodig']];
function prefsHtml() {
  const rows = PREF_ROWS.map(([k, t]) => `<div class="row"><div class="grow"><div class="t">${t}</div></div><button class="switch" role="switch" aria-checked="${!!S.prefs[k]}" data-a="pref" data-k="${k}" aria-label="${t}"></button></div>`).join('');
  const budget = [0, 1, 2, 3, 4].map(v => `<button data-a="budget" data-v="${v}" aria-pressed="${(S.prefs.budget || 0) === v}">${v ? '€'.repeat(v) : 'Geen'}</button>`).join('');
  return `<div class="group-h" style="text-align:left">Voorkeuren</div><div class="group" id="prefs" style="text-align:left">${rows}<div class="row"><div class="grow"><div class="t">Budget per nacht</div><div class="s">Hoogste prijsniveau dat je wilt zien</div></div></div></div>
    <div class="scrollchips" role="group" aria-label="Budget" style="margin-top:8px">${budget}</div><p class="note" style="text-align:left">Airco en laadpaal tellen hard mee: verblijven zonder bevestiging krijgen een waarschuwing. Het budget filtert verblijven. Kinderen volgen uit de leeftijden in je reisgezelschap.</p>`;
}

// ---------- trips ----------
const MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];
const WEEKDAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'];
const monthLabel = m => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const dayLabel = d => { const t = new Date(d + 'T00:00:00Z'); return `${WEEKDAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]}`; };
function upcomingMonths(n) {
  const now = new Date(), out = [];
  for (let i = 1; i <= n; i++) { const d = new Date(Date.UTC(now.getFullYear(), now.getMonth() + i, 1)); out.push(d.toISOString().slice(0, 7)); }
  return out;
}
function whenText(trip) {
  if (!trip || !tripNights(trip)) return 'Nog niet ingesteld';
  const n = tripNights(trip);
  if (trip.start && trip.end) return `${dayLabel(trip.start)} tot ${dayLabel(trip.end)} ${trip.end.slice(0, 4)} · ${n} nachten`;
  const ms = String(trip.months || '').split(' ').filter(Boolean);
  return `${ms.length ? ms.map(monthLabel).join(' of ') : 'Datum nog open'} · ${n} nachten`;
}
function partyText(trip) {
  const day = tripStart(trip), ppl = readPeople(trip && trip.party);
  return ppl.length ? ppl.map(p => { const a = ageOn(p.born, day); return a !== null && a < 18 ? `${p.name} (${a})` : p.name; }).join(', ') : 'Nog niemand';
}
function tripsHtml() {
  const mine = S.groups.filter(g => S.gdata[g]);
  const rows = mine.map(gid => {
    const g = S.gdata[gid], t = g.trip, n = Object.keys(g.members || {}).length;
    return `<button class="row" data-a="trip-open" data-gid="${esc(gid)}"><div class="grow"><div class="t">${esc(g.name)}</div><div class="s">${esc(whenText(t))}</div><div class="s">${esc(t ? partyText(t) : 'Stel datum, gezelschap en highlights in')}${n > 1 ? ` · ${n} in de app` : ''}</div></div>${CHEV}</button>`;
  }).join('');
  return `<div class="large">Jouw reizen</div><p class="subt">Per reis kies je wanneer, met wie en wat jullie willen zien. De app maakt er een schema van, dag voor dag.</p>
    ${myProfile().n === 0 ? '<div class="warnbox">Swipe eerst een paar kaarten (Profiel), dan passen de voorstellen bij jouw smaak.</div>' : ''}
    ${rows ? `<div class="group" id="triplist">${rows}</div>` : ''}
    <button class="btn" data-a="trip-new">Nieuwe reis</button>`;
}

// ---------- trip settings: a wizard for a new trip, one step at a time to edit ----------
const WIZ_STEPS = ['when', 'who', 'highlights'];
const PACE_OPTS = [['', 'Kies voor ons'], ['calm', 'Rustig'], ['normal', 'Gemiddeld'], ['active', 'Rondreis']];
const PACE_NOTE = { '': 'Met kinderen of een rustig profiel plant de app rustig, anders gemiddeld.', calm: 'Weinig verhuizen en weinig rijden: liever langer op één plek.', normal: 'Een paar verblijfplaatsen en af en toe een langere rit.', active: 'Veel zien: meer verblijfplaatsen, rijden hoort erbij.' };
const HL_CATS = [['beaches', 'Stranden'], ['towns', 'Stadjes'], ['nature', 'Natuur en bergen'], ['boat', 'Boottochten'], ['culture', 'Cultuur en dorpen']];
function wizFrom(gid) {
  const g = gid && S.gdata[gid], t = g && g.trip;
  if (t) return { gid, name: g.name, pace: t.pace || '', mode: t.start && t.end ? 'fixed' : 'flex', start: t.start || '', savedStart: t.start || '', end: t.end || '', months: String(t.months || '').split(' ').filter(Boolean), nights: tripNights(t) || 14, party: readPeople(t.party), hl: new Set(highlightIds(t)) };
  const party = S.household.length ? S.household.map(p => ({ ...p })) : [{ name: myName(), uid: S.user.uid }];
  return { gid: g ? gid : null, name: g ? g.name : 'Corsica ' + (new Date().getFullYear() + 1), pace: '', mode: 'flex', start: '', end: '', months: [], nights: 14, party, hl: new Set() };
}
function openWizard(gid = null, only = null) {
  S.wiz = { ...wizFrom(gid), step: only || 'when', only };
  pushScreen({ title: gid ? 'Reis aanpassen' : 'Nieuwe reis', back: prevTitle(), render: wizHtml });
}
function openHousehold() {
  S.wiz = { household: true, step: 'who', only: 'who', party: S.household.map(p => ({ ...p })), months: [], start: '', end: '', mode: 'flex', nights: 14, hl: new Set() };
  pushScreen({ title: 'Mijn gezin', back: 'Profiel', render: wizHtml });
}
const wizNights = w => (w.mode === 'fixed' ? nightsBetween(w.start, w.end) : w.nights);
function wizHtml() {
  const w = S.wiz;
  if (!w) return '';
  const idx = WIZ_STEPS.indexOf(w.step);
  const body = w.step === 'when' ? wizWhen(w) : w.step === 'who' ? wizWho(w) : wizHl(w);
  const last = w.only || idx === WIZ_STEPS.length - 1;
  return `<div class="pad" id="wiz">${w.only ? '' : `<p class="note" style="margin:0 0 6px">Stap ${idx + 1} van ${WIZ_STEPS.length}</p>`}${body}
    <button class="btn" data-a="wiz-next">${last ? (w.gid || w.household ? 'Bewaar' : 'Maak reis') : 'Volgende'}</button>
    ${!w.only && idx > 0 ? '<button class="btn alt" data-a="wiz-prev">Vorige</button>' : ''}</div>`;
}
function wizWhen(w) {
  // stored months stay visible, also once they are past
  const months = [...new Set([...w.months, ...upcomingMonths(18)])].sort().map(m => `<button data-a="wiz-month" data-m="${m}" aria-pressed="${w.months.includes(m)}">${monthLabel(m)}</button>`).join('');
  const n = nightsBetween(w.start, w.end);
  return `<div class="large">Wanneer?</div>
    <div class="group-h">Naam van de reis</div><input class="field" data-f="name" maxlength="30" value="${esc(w.name)}" aria-label="Naam van de reis"${canRename(w) ? '' : ' readonly'}>${canRename(w) ? '' : '<p class="note">Alleen de maker van de reis kan de naam wijzigen.</p>'}
    <div class="scrollchips" role="group" aria-label="Soort datum" style="margin-top:12px"><button data-a="wiz-mode" data-m="flex" aria-pressed="${w.mode === 'flex'}">Flexibel</button><button data-a="wiz-mode" data-m="fixed" aria-pressed="${w.mode === 'fixed'}">Vaste data</button></div>
    ${w.mode === 'flex' ? `<div class="group-h">In welke maand? Kies er maximaal 3</div><div class="chips" id="months">${months}</div>
      <div class="group-h">Hoeveel nachten?</div><div class="stepper"><button class="chip" data-a="wiz-n" data-d="-1" aria-label="Een nacht minder">&minus;</button><b id="wnights">${w.nights}</b><span>nachten</span><button class="chip" data-a="wiz-n" data-d="1" aria-label="Een nacht meer">+</button></div>`
    : `<div class="group-h">Eerste nacht</div><input class="field" type="date" data-f="start" value="${esc(w.start)}" aria-label="Eerste nacht">
      <div class="group-h">Vertrekdag</div><input class="field" type="date" data-f="end" value="${esc(w.end)}" aria-label="Vertrekdag">
      <p class="note" id="fixedn">${n ? n + ' nachten' : 'Kies beide data.'}</p>`}
    <div class="group-h">Hoeveel willen jullie onderweg zijn?</div>
    <div class="scrollchips" role="group" aria-label="Reistempo" id="pace">${PACE_OPTS.map(([v, t]) => `<button data-a="wiz-pace" data-v="${v}" aria-pressed="${(w.pace || '') === v}">${t}</button>`).join('')}</div>
    <p class="note">${PACE_NOTE[w.pace || '']}</p>`;
}
function wizWho(w) {
  const day = tripStart({ start: w.start, months: w.months.join(' ') }) || `${new Date().getFullYear()}-07-01`;
  const rows = w.party.map((p, i) => {
    const a = ageOn(p.born, day);
    return `<div class="row person"><input class="field" data-f="pname" data-i="${i}" maxlength="40" value="${esc(p.name)}" aria-label="Naam" style="margin:0;flex:1;min-width:0">
      <input class="field" data-f="pborn" data-i="${i}" inputmode="numeric" maxlength="4" placeholder="Geb. jaar" value="${Number.isInteger(p.born) ? p.born : ''}" aria-label="Geboortejaar" style="margin:0;width:96px">
      <span class="s age" data-age="${i}" style="width:44px;text-align:center">${a !== null ? a + ' jr' : ''}</span>
      <button class="chip" data-a="wiz-del" data-i="${i}" aria-label="Verwijder ${esc(p.name || 'persoon')}">&times;</button></div>`;
  }).join('');
  return `<div class="large">${w.household ? 'Mijn gezin' : 'Wie gaan er mee?'}</div>
    <p class="subt">${w.household ? 'Je gezin is het standaard reisgezelschap van een nieuwe reis.' : 'Met geboortejaar, zodat verblijven en activiteiten passen bij de leeftijden. Volwassenen zonder geboortejaar kan ook.'}</p>
    <div class="group" id="people">${rows || '<div class="row"><div class="grow"><div class="s">Nog niemand.</div></div></div>'}</div>
    ${w.party.length < 12 ? '<button class="btn alt" data-a="wiz-add">Persoon toevoegen</button>' : ''}
    ${w.household ? '' : '<button class="btn alt" data-a="wiz-household">Bewaar ook als mijn gezin</button><p class="note">Reisgenoten met de app nodig je uit met de deellink in de reis. Hun smaak telt dan mee.</p>'}`;
}
function wizHl(w) {
  const n = wizNights(w);
  const tile = h => {
    const it = actById(h.acts[0]), src = it ? photoOf(it, S.base) : '';
    return `<button class="hltile" data-a="wiz-hl" data-id="${esc(h.id)}" aria-pressed="${w.hl.has(h.id)}" aria-label="${esc(h.name)}">${phHtml(src, h.id, '', `<span class="ov"><b>${esc(h.name)}</b></span>`)}<span class="tick" aria-hidden="true">&#10003;</span></button>`;
  };
  const groups = HL_CATS.map(([c, t]) => { const list = S.highlights.filter(h => h.cat === c); return list.length ? `<div class="group-h">${t}</div><div class="hlgrid">${list.map(tile).join('')}</div>` : ''; }).join('');
  const many = n && w.hl.size > Math.max(1, n - 3);
  return `<div class="large">Wat willen jullie zien?</div><p class="subt">Kies de hoogtepunten die in het schema moeten. De app zoekt de route die ze het best combineert.</p>
    <div class="warnbox" id="hlcount">${w.hl.size} gekozen${many ? ` · veel voor ${n} nachten: misschien past niet alles` : ''}</div>${groups || '<p class="subt">Voor deze bestemming zijn nog geen highlights.</p>'}`;
}
function tripFromWiz(w) {
  const n = wizNights(w);
  const t = { dest: (S.dest && /^[-_A-Za-z0-9]{1,32}$/.test(S.dest.id) && S.dest.id) || 'corsica', nights: n, party: writePeople(w.party) };
  if (w.mode === 'fixed') { t.start = w.start; t.end = w.end; } else if (w.months.length) t.months = w.months.slice().sort().join(' ');
  if (w.pace) t.pace = w.pace;
  if (w.hl.size) t.highlights = [...w.hl].join(' ');
  if (!Object.keys(t.party).length) delete t.party;
  return t;
}
// the fields each step owns: an edit replaces only those, on top of the latest trip (another member may have changed the rest meanwhile)
const STEP_FIELDS = { when: ['nights', 'start', 'end', 'months', 'pace'], who: ['party'], highlights: ['highlights'] };
function tripToSave(w) {
  const mine = tripFromWiz(w), cur = w.gid && S.gdata[w.gid] && S.gdata[w.gid].trip;
  if (!w.only || !cur) return mine;
  const { updatedAt, ...out } = cur; void updatedAt;
  for (const f of STEP_FIELDS[w.only]) { if (f in mine) out[f] = mine[f]; else delete out[f]; }
  return out;
}
// a real calendar day in the years the rules accept (a typed 2026-02-31 or 2100-01-01 is not)
const realDay = d => { if (!/^20[2-9][0-9]-[01][0-9]-[0-3][0-9]$/.test(d)) return false; const t = Date.parse(d + 'T00:00:00Z'); return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === d; };
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const canRename = w => !w.gid || !S.gdata[w.gid] || S.gdata[w.gid].owner === S.user.uid;
// a problem with this step, or '' when it is fine
function wizProblem(w) {
  if (w.step === 'when') {
    if (!w.household && !String(w.name).trim()) return 'Geef de reis een naam.';
    if (w.mode === 'fixed' && !(realDay(w.start) && realDay(w.end))) return 'Kies de eerste nacht en de vertrekdag.';
    if (w.mode === 'fixed' && w.start !== w.savedStart && w.start < localToday()) return 'De eerste nacht ligt in het verleden.'; // a trip that already started keeps its dates
    const n = wizNights(w);
    if (n < NIGHTS_RANGE[0] || n > NIGHTS_RANGE[1]) return `Een reis duurt ${NIGHTS_RANGE[0]} tot ${NIGHTS_RANGE[1]} nachten.`;
  }
  if (w.step === 'who') {
    if (!w.party.some(p => String(p.name).trim())) return 'Voeg minstens één persoon toe.';
    const year = new Date().getFullYear();
    if (w.party.some(p => p.born !== undefined && !(Number.isInteger(p.born) && p.born >= 1920 && p.born <= year))) return `Een geboortejaar is een jaar tussen 1920 en ${year}.`;
  }
  return '';
}
async function wizSave() {
  const w = S.wiz;
  if (w.household) { S.household = readPeople(writePeople(w.party)); schedulePersist(); popScreen(); refreshLive(); toast('Gezin bewaard'); return; }
  const trip = tripToSave(w), edit = !!w.gid;
  try {
    if (!w.gid) w.gid = await createGroup(String(w.name).trim().slice(0, 30)); // remembered at once: a failed trip write never makes a second trip
    else if (canRename(w) && w.name.trim() && w.name.trim() !== S.gdata[w.gid].name) await S.store.renameGroup(w.gid, w.name.trim().slice(0, 30), Object.keys(S.gdata[w.gid].codes || {}));
    await S.store.setTrip(w.gid, trip);
    const gid = w.gid;
    S.ranked = {};
    popScreen();
    if (!edit) { await sleep(150); openTrip(gid); } else refreshLive();
    toast(edit ? 'Reis bijgewerkt' : 'Reis gemaakt');
  } catch (e) { toast(errMsg(e)); }
}

// ---------- trip detail ----------
function openTrip(gid) {
  pushScreen({ title: (S.gdata[gid] || {}).name || 'Reis', back: 'Reizen', live: true, render: () => tripDetail(gid) });
}
function tripDetail(gid) {
  const g = S.gdata[gid];
  if (!g) return '<div class="pad"><p class="subt">Deze reis bestaat niet meer.</p></div>';
  const t = g.trip, G = esc(gid);
  if (!t || !tripNights(t)) return `<div class="pad"><div class="large">${esc(g.name)}</div><p class="subt">Stel eerst in wanneer jullie gaan, met wie en wat jullie willen zien.</p>
    <button class="btn" data-a="trip-setup" data-gid="${G}">Reis instellen</button>${membersHtml(gid)}</div>`;
  const { plans, tp } = rankedFor(gid);
  const hls = highlightIds(t).map(hlById).filter(Boolean), empty = tp.profile.n === 0;
  const edit = (step, title, sub) => `<button class="row" data-a="trip-edit" data-gid="${G}" data-step="${step}"><div class="grow"><div class="t">${title}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div><span class="chip">Wijzig</span></button>`;
  return `<div class="pad">
    <div class="large">${esc(g.name)}</div><p class="subt">${esc(whenText(t))}</p>
    ${tp.missing.length ? `<div class="warnbox">Nog geen swipes van: ${tp.missing.map(esc).join(', ')}.</div>` : ''}
    <div class="group-h">${empty ? 'Routes' : 'Aanbevolen voor jullie'}</div>
    <div id="routelist">${plans.length ? plans.slice(0, 3).map((p, i) => routeCard(p, i, empty, gid) + (i === 0 && !empty ? '<div class="group-h">Alternatieven</div>' : '')).join('') : '<div class="warnbox">Geen route past in dit aantal nachten.</div>'}
    ${plans.length > 3 ? `<details class="more"><summary class="btn alt">Toon alle ${plans.length} routes</summary>${plans.slice(3).map((p, i) => routeCard(p, i + 3, empty, gid)).join('')}</details>` : ''}</div>
    <div class="group-h">Wanneer</div><div class="group">${edit('when', esc(whenText(t)), '')}</div>
    <div class="group-h">Reisgezelschap</div><div class="group" id="party">${edit('who', esc(partyText(t)), `${readPeople(t.party).length} personen`)}</div>
    <div class="group-h">Highlights</div><div class="group" id="hls">${edit('highlights', hls.length ? hls.map(h => esc(h.name)).join(', ') : 'Nog geen highlights gekozen', '')}</div>
    ${membersHtml(gid)}</div>`;
}
function routeCard(p, i, empty, gid) {
  const r = p.route, km = r.legs.reduce((a, l) => a + Number(l.km), 0), nights = p.stops.reduce((a, s) => a + Number(s.nights), 0);
  const m = p.matchPct, miss = (p.placed || []).filter(x => x.stop < 0).length;
  const TAG = { all: 'Alle highlights', less: 'Minder rijden' };
  return `<button class="rcard${i === 0 && !empty ? ' best' : ''}" data-a="open-route" data-gid="${esc(gid)}" data-id="${esc(r.id)}" style="--c:var(--route-${esc(r.id)}, var(--accent))">
    <div class="top"><div class="badge"${r.generated ? ` aria-label="${p.stops.length} verblijfplaatsen"` : ''}>${r.generated ? String(p.stops.length) : esc(r.id.toUpperCase())}</div><div><div class="t">${esc(r.title)}</div><div class="s">${esc(r.sub)}</div>${p.tag ? `<span class="pill ok tag" style="margin-top:6px;display:inline-block">${TAG[p.tag]}</span>` : ''}</div>
    ${empty || (p.tag && m == null) ? '' : `<div class="match">${m == null ? '<b style="font-size:15px">minder passend</b>' : `<b>${m}%</b>`}<span>${i === 0 ? 'aanbevolen' : m == null ? '' : 'match'}</span></div>`}</div>
    ${empty || m == null ? '' : `<div class="bar"><i style="width:${m}%"></i></div>`}
    ${miss ? `<div class="s miss" style="color:var(--warn);margin:6px 14px 0">${miss} ${miss === 1 ? 'highlight past' : 'highlights passen'} niet in deze route</div>` : ''}
    <div class="foot"><span>${nights} nachten</span><span>${p.stops.map(s => `${esc(S.places.stays[s.stay] ? S.places.stays[s.stay].short : s.stay)} ${Number(s.nights)}`).join(' · ')}</span><span>${km} km · ca. ${fmtMin(r.legs.reduce((a, l) => a + Number(l.min), 0))} rijden</span></div></button>`;
}
// the app users of a trip: whose taste counts, invite link, remove, leave or delete
function membersHtml(gid) {
  const g = S.gdata[gid];
  const owner = g.owner === S.user.uid, tog = S.toggles[gid] || {}, link = groupLink(g), G = esc(gid);
  const rows = Object.entries(g.members || {}).map(([uid, m]) => {
    const name = memberName(m);
    const p = uid === S.user.uid ? myProfile() : readSummary(g.profiles && g.profiles[uid], S.allowed);
    return `<div class="row"><div class="grow"><div class="t">${esc(name)}${uid === S.user.uid ? ' (jij)' : ''}${uid === g.owner ? ' · maker' : ''}</div><div class="s">${p.n ? p.n + ' kaarten beoordeeld' : 'nog niet geswipet'}</div></div>
      ${owner && uid !== S.user.uid ? `<button class="chip" data-a="group-kick" data-gid="${G}" data-uid="${esc(uid)}" aria-label="Verwijder ${esc(name)}">Verwijder</button>` : ''}
      <button class="switch" role="switch" aria-checked="${tog[uid] !== false}" data-a="group-toggle" data-gid="${G}" data-uid="${esc(uid)}" aria-label="Smaak van ${esc(name)} telt mee"></button></div>`;
  }).join('');
  return `<div class="group-h">Plannen met reisgenoten</div><p class="note" style="margin-top:0">Wie de link opent, plant mee en past de reis aan. Zet iemand uit als diens smaak niet mee moet tellen.</p>
    <div class="group" id="members">${rows}</div>
    ${link ? `<button class="btn alt" data-a="group-share" data-gid="${G}">Deel de reis</button><button class="btn alt" data-a="group-copy" data-gid="${G}">Kopieer link</button>
      ${owner ? `<button class="btn alt" data-a="group-rotate" data-gid="${G}">Nieuwe link maken</button>` : ''}`
      : owner ? `<button class="btn alt" data-a="group-rotate" data-gid="${G}">Deellink maken</button>` : ''}
    ${owner ? `<button class="btn danger" data-a="group-delete" data-gid="${G}">Reis verwijderen</button>` : `<button class="btn danger" data-a="group-leave" data-gid="${G}">Reis verlaten</button>`}`;
}

function profileHtml() {
  const p = myProfile();
  const hide = hiddenReasons(S.prefs); // no kids words in the profile when travelling without kids
  const likes = topTags(p, { n: 8, sign: 1, hide }), dislikes = topTags(p, { n: 6, sign: -1, hide });
  const row = (t, neg) => `<button class="trow${neg ? ' neg' : ''}" data-a="tagedit" data-tag="${esc(t.tag)}" aria-label="Pas ${esc(label(t.tag))} aan"><span class="tn">${esc(label(t.tag))}${S.overrides[t.tag] !== undefined ? ' <small>(door jou aangepast)</small>' : ''}</span><span class="tb"><i style="width:${Math.round(Math.abs(t.w) * 100)}%"></i></span><span class="tc">${Math.round(certainty(p, t.tag) * 100)}% zeker</span></button>`;
  const total = allCards().length, done = Object.keys(S.swipes).length;
  const sentence = likes.length ? `Jij houdt van: ${likes.slice(0, 5).map(t => `<b>${esc(label(t.tag).toLowerCase())}</b>`).join(', ')}.` : 'We kennen je smaak nog niet. Swipe een paar kaarten.';
  const more = moreCards(allCards(), S.swipes, p, 10).length;
  const year = new Date().getFullYear();
  const fam = S.household.map(m => { const a = ageOn(m.born, `${year}-07-01`); return esc(m.name) + (a !== null && a < 18 ? ` (${a})` : ''); }).join(', ');
  return `<div class="large">${esc(S.displayName)}</div><p class="subt">${done} van ${total} kaarten beoordeeld</p>
    <div class="group-h">Je naam in gedeelde reizen</div><div class="group"><div class="row"><input class="field" id="dname" maxlength="40" value="${esc(S.displayName)}" aria-label="Je naam in gedeelde reizen" style="margin:0"><button class="chip on" data-a="setname">Bewaar</button></div></div>
    <div class="group-h">Mijn gezin</div><div class="group" id="household"><button class="row" data-a="household"><div class="grow"><div class="t">${fam || 'Nog niemand toegevoegd'}</div><div class="s">Het standaard reisgezelschap van een nieuwe reis</div></div><span class="chip">Wijzig</span></button></div>
    <p class="sentence">${sentence}</p>
    ${dislikes.length ? `<p class="subt" style="margin-top:0">Liever niet: ${dislikes.slice(0, 4).map(t => esc(label(t.tag).toLowerCase())).join(', ')}.</p>` : ''}
    ${likes.length ? `<div class="group-h">Dit vind je leuk</div><div class="likes">${likes.map(t => row(t, false)).join('')}</div>` : ''}
    ${dislikes.length ? `<div class="group-h">Dit vind je minder</div><div class="likes">${dislikes.map(t => row(t, true)).join('')}</div>` : ''}
    <button class="btn alt" data-a="taglist">Tag toevoegen of aanpassen</button><p class="note">Tik op een regel om iets te verwijderen of om te draaien.</p>
    ${prefsHtml()}
    <button class="btn" data-a="more" ${more ? '' : 'disabled'}>Meer kaarten swipen</button>
    <p class="note">Extra kaarten over wat we nog het minst zeker weten${more ? '' : ' (alle kaarten zijn al beoordeeld)'}.</p>
    <div class="group-h">Opnieuw beginnen</div>
    <div class="group">
      <button class="row" data-a="reswipe" data-kind="acc"><div class="grow"><div class="t">Accommodaties opnieuw swipen</div><div class="s">${doneIn('acc')} van ${deckOf('acc').length} beoordeeld</div></div>${CHEV}</button>
      <button class="row" data-a="reswipe" data-kind="act"><div class="grow"><div class="t">Activiteiten opnieuw swipen</div><div class="s">${doneIn('act')} van ${deckOf('act').length} beoordeeld</div></div>${CHEV}</button>
    </div>
    <div class="group-h">Over</div>
    <div class="group">
      <button class="row" data-a="credits"><div class="grow"><div class="t">Fotocredits</div></div>${CHEV}</button>
      <button class="row" data-a="signout"><div class="grow"><div class="t" style="color:var(--no)">Uitloggen</div></div></button>
    </div>`;
}

// ---------- pushed screens ----------
function pushScreen({ title, back = 'Terug', render: renderFn, mount, unmount, live = false }) {
  const el = document.createElement('section');
  el.className = 'screen push';
  el.innerHTML = `<div class="nav"><span class="ttl">${esc(title)}</span><button class="back" data-a="back" aria-label="Terug">${BACK}<span>${esc(back)}</span></button></div><div class="scroll"></div>`;
  const entry = { el, title, renderFn, mount, unmount, live };
  $('pushed').appendChild(el);
  pushed.push(entry);
  const sc = el.querySelector('.scroll'), nav = el.querySelector('.nav');
  sc.addEventListener('scroll', () => nav.classList.toggle('solid', sc.scrollTop > 40), { passive: true });
  paint(entry);
  // swipe back from the left edge
  let x0 = null, y0 = 0;
  el.addEventListener('touchstart', e => { const t = e.touches[0]; x0 = t.clientX - $('app').getBoundingClientRect().left < 28 ? t.clientX : null; y0 = t.clientY; }, { passive: true });
  el.addEventListener('touchend', e => { if (x0 !== null && e.changedTouches[0].clientX - x0 > 70 && Math.abs(e.changedTouches[0].clientY - y0) < 60) popScreen(); x0 = null; }, { passive: true });
  return entry;
}
function paint(entry) {
  const sc = entry.el.querySelector('.scroll'), top = sc.scrollTop;
  if (entry.unmount) entry.unmount();
  sc.innerHTML = entry.renderFn();
  sc.scrollTop = top;
  if (entry.mount) entry.mount(entry.el);
}
const repaintTop = () => { const top = pushed[pushed.length - 1]; if (top) paint(top); };
// leaving the wizard in any way (back, swipe, tab, a trip that disappears) drops the draft, so live updates paint again
const dropDraft = e => { if (e.renderFn === wizHtml) S.wiz = null; };
function popScreen() {
  const e = pushed.pop();
  if (!e) return;
  dropDraft(e);
  e.el.classList.remove('push'); e.el.classList.add('pop');
  if (e.unmount) e.unmount();
  const done = () => e.el.remove();
  e.el.addEventListener('animationend', done, { once: true });
  setTimeout(done, 400);
}
function popAll() { while (pushed.length) { const e = pushed.pop(); dropDraft(e); if (e.unmount) e.unmount(); e.el.remove(); } }
const prevTitle = () => (pushed.length ? pushed[pushed.length - 1].title : { routes: 'Reizen', profile: 'Profiel' }[S.tab] || 'Terug');
function refreshLive() {
  if (S.mode === 'app' && !pushed.length) { const sc = $('rootscroll'); const t = sc ? sc.scrollTop : 0; renderApp($('root')); const n = $('rootscroll'); if (n) n.scrollTop = t; }
  for (const e of pushed) if (e.live) paint(e); // every live screen, also the ones under a pushed screen
}

// ---------- route detail: the day-by-day plan ----------
function routeWhy(plan, tp) {
  const aff = regionAffinity(tp.profile, S.places.regionTags);
  const rows = Object.keys(aff).map(k => ({ k, v: (plan.route.profile[k] || 0) * aff[k] })).filter(x => x.v > 0.05).sort((a, b) => b.v - a.v).slice(0, 2);
  const names = S.tagsJson.region || {};
  return rows.length ? `Past bij jullie voorkeur voor: ${rows.map(r => (names[r.k] || r.k).toLowerCase()).join(' en ')}.` : '';
}
function gmaps(route) {
  const nm = k => ((S.places.names[k] && S.places.names[k].name) || k) + ', Corsica';
  const s = route.stops.map(nm);
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(s[0]) + '&destination=' + encodeURIComponent(s[s.length - 1]) + '&waypoints=' + encodeURIComponent(s.slice(1, -1).join('|'));
}
let lastRoute = { gid: '', id: '' }; // the route whose detail screen is open: a stop opens with the same plan
function planOf(gid, id) {
  const { plans, tp } = rankedFor(gid);
  return { plan: plans.find(p => p.route.id === id), tp };
}
function daysOf(plan, tp) {
  const picks = (plan.placed || []).map(p => ({ ...p, item: actById(p.hl.acts[0]) }));
  const fixed = tp.trip && tp.trip.start && tp.trip.end ? tp.trip.start : '';
  return dayPlan(plan, { picks, calm: resolvePace(tp.trip && tp.trip.pace, tp.profile, tp.prefs) === 'calm', evening: likesEvenings(tp.profile), start: fixed });
}
function openRoute(gid, id) {
  lastRoute = { gid, id };
  const first = planOf(gid, id).plan;
  if (!first) return;
  pushScreen({ title: first.route.name, back: (S.gdata[gid] || {}).name || 'Reis', live: true, render: () => routeDetail(gid, id) });
}
function routeDetail(gid, id) {
  const { plan, tp } = planOf(gid, id);
  if (!plan) return '<div class="pad"><p class="subt">Deze route past niet meer bij de reis.</p></div>';
  const r = plan.route, km = r.legs.reduce((a, l) => a + Number(l.km), 0), min = r.legs.reduce((a, l) => a + Number(l.min), 0);
  const nights = plan.stops.reduce((a, s) => a + Number(s.nights), 0), first = S.places.stays[r.stays[0]];
  const { days, unplaced } = daysOf(plan, tp);
  const why = tp.profile.n ? routeWhy(plan, tp) : '';
  const youngest = tp.prefs.youngest ?? null;
  return `<div>${phHtml(first ? stayImg(first.img) : '', r.id, 'hero', `<span class="ov"><b>${esc(r.title)}</b><span>${esc(r.sub)}</span></span>`)}</div>
    <div class="pad">
      <p>${esc(r.lead)}</p>
      ${tp.profile.n ? `<div class="warnbox"><b>${plan.matchPct == null ? 'Minder passend.' : 'Match ' + plan.matchPct + '%.'}</b> ${esc(why)}</div>` : ''}
      <div class="stats"><div class="stat"><b>${nights}</b><span>nachten</span></div><div class="stat"><b>${km}</b><span>km rijden</span></div><div class="stat"><b>${fmtMin(min)}</b><span>rijtijd totaal</span></div></div>
      <div class="warnbox">${esc(r.ferry)}</div>
      <div class="mapcard" style="margin-top:12px">${routeSvg(S.places, r)}</div>
      <div class="group-h">Dag voor dag</div>
      ${unplaced.length ? `<div class="warnbox" id="unplaced">${unplaced.map(h => { const plans = rankedFor(gid).plans, other = routesWith(plans, h.id).filter(x => x !== r.id).slice(0, 2).map(id => plans.find(p => p.route.id === id).route.title); return `<b>${esc(h.name || h.id)}</b> past niet in deze route${other.length ? ` (wel in: ${other.map(esc).join(' / ')})` : ''}.`; }).join('<br>')} Kies een andere route, of meer nachten.</div>` : ''}
      <div class="group" id="days">${days.map(d => dayRow(d, youngest)).join('')}</div>
      <div class="group-h">Verblijfplaatsen</div>
      ${plan.stops.map((s, i) => stopCard(s, i)).join('')}
      <button class="btn alt" data-a="offline" data-gid="${esc(gid)}" data-id="${esc(r.id)}" id="offlinebtn">Download voor offline</button>
      <a class="btn alt" href="${esc(gmaps(r))}" target="_blank" rel="noopener">Route in Google Maps</a>
      <div class="group-h">Ritten</div>
      <div class="group">${r.legs.map((l, i) => `<div class="row"><span class="num" style="background:var(--route-${esc(r.id)}, var(--accent))">${'ABCDEFG'[i] || i + 1}</span><div class="grow"><div class="t">${esc(l.from)} naar ${esc(l.to)}</div><div class="s">${Number(l.km)} km · ca. ${fmtMin(Number(l.min))} rijden</div></div></div>`).join('')}</div>
    </div>`;
}
const legText = l => (!l ? '' : l.from === l.to ? 'De ferry komt hier aan' : `${l.from} naar ${l.to}, ca. ${fmtMin(Number(l.min))} rijden`);
function dayRow(d, youngest) {
  const st = S.places.stays[d.stay] || { short: d.stay };
  let title = '', sub = '', extra = '', warn = '';
  if (d.kind === 'travel') { title = d.n === 1 ? `Aankomst, naar ${st.short}` : `Naar ${st.short}`; sub = legText(d.leg); if (d.act) extra = 'Daarna: ' + d.act.item.name; }
  else if (d.kind === 'highlight') {
    title = d.hl.name; sub = d.hl.desc || ''; extra = d.min > 15 ? `ca. ${fmtMin(Number(d.min))} rijden vanaf ${st.short}` : `bij ${st.short}`;
    if (d.item && tooYoung(d.item, youngest)) warn = 'Let op: niet geschikt voor de jongste reisgenoot';
  } else if (d.kind === 'activity') { title = d.act.item.name; sub = [dur(Number(d.act.item.durationH) || undefined), d.act.driveMin ? `ca. ${Number(d.act.driveMin)} min rijden` : ''].filter(Boolean).join(' · '); if (d.alt) extra = 'Of: ' + d.alt.item.name; }
  else if (d.kind === 'rest') { title = 'Rustige dag'; sub = d.act ? d.act.item.name : 'Zwembad, strand of lekker niets'; }
  else if (d.kind === 'free') { title = 'Vrije dag'; sub = st.coast === false ? `Rustig rondkijken in en rond ${st.short}` : `Strand of zwembad, of rondkijken in ${st.short}`; }
  else { title = 'Terug naar de ferry'; sub = legText(d.leg); }
  return `<div class="row day ${esc(d.kind)}" style="align-items:flex-start"><span class="num sq" style="background:${d.kind === 'highlight' ? 'var(--accent)' : 'var(--fill)'};color:${d.kind === 'highlight' ? '#fff' : 'var(--fg)'};border-radius:9px;font-size:13px">${d.n}</span>
    <div class="grow"><div class="s">Dag ${d.n}${d.date ? ' · ' + esc(dayLabel(d.date)) : ''}${d.kind === 'highlight' ? ' · highlight' : ''}</div><div class="t">${esc(title)}</div>${sub ? `<div class="s" style="color:var(--fg)">${esc(sub)}</div>` : ''}${extra ? `<div class="s">${esc(extra)}</div>` : ''}${d.evening ? `<div class="s">'s Avonds: ${esc(d.evening.item.name)}</div>` : ''}${warn ? `<div class="s" style="color:var(--no)">${esc(warn)}</div>` : ''}</div></div>`;
}
function stopCard(s, i) {
  const st = S.places.stays[s.stay] || { name: s.stay, short: s.stay, kind: '' };
  return `<button class="stopcard" data-a="open-stop" data-i="${i}">${phHtml(stayImg(st.img || s.stay), s.stay, '', `<span class="ov"><b>${i + 1}. ${esc(st.name)}</b></span>`)}
    <div class="meta"><span>${Number(s.nights)} ${Number(s.nights) === 1 ? 'nacht' : 'nachten'}</span><span>${s.acc.length} verblijven · ${s.acts.length} activiteiten ${CHEV.replace('class="chev"', 'class="chev" style="display:inline;vertical-align:-1px"')}</span></div></button>`;
}
function openStop(gid, routeId, i) {
  const { plan, tp } = planOf(gid, routeId);
  const s = plan && plan.stops[i];
  if (!s) return;
  const st = S.places.stays[s.stay] || { name: s.stay, desc: '', sights: [], food: [] };
  const xy = S.places.places[s.stay] || [9.1, 42.15];
  const who = tp.members > 1 ? 'jullie' : 'jou';
  let mapCtl = null;
  pushScreen({
    title: st.short || st.name, back: plan.route.name,
    render: () => `<div>${phHtml(stayImg(st.img || s.stay), s.stay, 'hero', `<span class="ov"><b>${esc(st.name)}</b><span>${Number(s.nights)} ${Number(s.nights) === 1 ? 'nacht' : 'nachten'} · ${esc(st.kind || '')}</span></span>`)}</div>
      <div class="pad">
        <p>${esc(st.desc)}</p>
        <div class="group-h">Waar slaap je? Top 3 voor ${who}</div>
        ${(s.must || []).length ? `<div class="warnbox" id="must" style="margin:0 0 10px">${s.must.map(m => `${m.key === 'ev' ? 'Laadpaal' : 'Airco'}: ${m.confirmed} van ${m.total} bevestigd`).join(' · ')}</div>` : ''}
        ${s.acc.length ? s.acc.map((a, n) => accHtml(a, n, tp.prefs)).join('') : '<div class="warnbox">Nog geen accommodaties in de catalogus voor deze plek.</div>'}
        <div class="group-h">Activiteiten binnen 30 km</div>
        ${s.acts.length ? `<div class="map" id="stopmap" aria-label="Kaart met activiteiten"></div>
        <div class="group" style="margin-top:12px" id="actlist">${s.acts.map((a, n) => actHtml(a, n)).join('')}</div>` : '<div class="warnbox">Nog geen activiteiten in de catalogus voor deze plek.</div>'}
        ${(st.sights && st.sights.length) || (st.food && st.food.length) ? `<div class="group-h">Tips ter plaatse</div><div class="group">${(st.sights || []).map(x => `<div class="row"><div class="grow"><div class="t">${esc(x.title)}</div><div class="s">${esc(x.text)}</div></div></div>`).join('')}${(st.food || []).map(x => `<div class="row"><div class="grow"><div class="t">${esc(x.name)}</div><div class="s">${esc(x.text)}</div></div></div>`).join('')}</div>` : ''}
      </div>`,
    mount: el => {
      const mapEl = el.querySelector('#stopmap');
      if (mapEl) mountMap(mapEl, { center: [xy[1], xy[0]], stay: st.name, acts: s.acts, onPick: id => highlight(el, id) }).then(c => { mapCtl = c; }).catch(() => { mapEl.innerHTML = '<div class="warnbox" style="margin:12px">De kaart kon niet laden. De lijst hieronder werkt wel.</div>'; });
    },
    unmount: () => { if (mapCtl) { mapCtl.remove(); mapCtl = null; } },
  });
}
function highlight(el, id) {
  el.querySelectorAll('.actrow').forEach(r => { r.style.background = r.dataset.id === id ? 'var(--fill)' : ''; });
  const row = [...el.querySelectorAll('.actrow')].find(r => r.dataset.id === id);
  if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}
function accHtml(a, n, prefs) {
  const it = a.item, src = photoOf(it, S.base);
  const tags = Object.entries(tagWeights(it)).filter(([t]) => t !== 'airco' && t !== 'ev_charging' && !hiddenReasons(prefs).includes(t)).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([t]) => `<span class="chip">${esc(label(t))}</span>`).join('');
  const generic = it.photoGeneric === true;
  const url = safeUrl(it.url);
  const town = (S.places.stays[it.region] && S.places.stays[it.region].short) || '';
  const maps = mapsUrl(it, town);
  const tw = tagWeights(it);
  const NAMES = { airco: 'airco', ev: 'laadpaal' };
  const badges = [tw.airco >= 0.5 ? '<span class="pill ok">Airco</span>' : '', tw.ev_charging >= 0.5 ? '<span class="pill ok">Laadpaal</span>' : '',
    a.fit === 'ok' && prefs && prefs.size > 2 && Number.isInteger(it.sleeps) ? `<span class="pill ok">Tot ${Number(it.sleeps)} personen</span>` : '',
    a.fit === 'rooms' ? `<span class="pill warn">&#9888; max. ${Number(it.sleeps)} per kamer: meer kamers nodig</span>` : '',
    a.fit === 'unknown' ? '<span class="pill warn">&#9888; aantal personen onbekend, vraag na</span>' : '',
    ...(a.unconfirmed || []).map(t => `<span class="pill warn">&#9888; ${NAMES[t] || esc(t)} onbekend &mdash; vraag na</span>`),
    ...(a.absent || []).map(t => `<span class="pill warn">&#9888; geen ${NAMES[t] || esc(t)}</span>`)].join('');
  const con = a.why.con ? `<br>${esc(a.why.con.text.charAt(0).toUpperCase() + a.why.con.text.slice(1))}.` : '';
  return `<div class="acc" data-acc="${esc(it.id)}">${phHtml(src, it.id, '')}
    <div class="body"><div class="nm"><span class="rank">${n + 1}</span>${esc(it.name)}</div>
    <div class="meta">${esc(town || it.region)}${euro(Number(it.priceLevel)) ? ' · ' + euro(Number(it.priceLevel)) : ''}${generic ? ' · illustratieve foto' : ''}</div>
    <div class="badges">${badges}</div>
    <div class="chips">${tags}</div>
    ${a.tier === 3 ? '<div class="badges"><span class="pill warn">&#9888; boven je budget</span></div><div class="note" style="margin:6px 0 0">Alleen getoond omdat er in deze plaats niets anders is.</div>' : a.tier === 2 ? '<div class="note" style="margin:6px 0 0">Alleen getoond omdat er in deze plaats niets anders is.</div>' : ''}
    ${it.desc ? `<div class="desc">${esc(it.desc)}</div>` : ''}
    <div class="why"><button class="whybtn" data-a="why" aria-expanded="false">Waarom deze?</button><div class="whytxt" hidden>${esc(a.why.text)}${con}</div></div>
    ${url || maps ? `<div class="links">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener">Bekijk verblijf</a>` : ''}${maps ? `<a href="${esc(maps)}" target="_blank" rel="noopener" aria-label="Foto's en reviews van ${esc(it.name)} op Google Maps">Foto's op Google Maps</a>` : ''}</div>` : ''}</div></div>`;
}
function actHtml(a, n) {
  const it = a.item;
  const tw = tagWeights(it);
  const effort = tw.effort_high >= 0.5 ? 'veel inspanning' : tw.effort_low >= 0.5 ? 'weinig inspanning' : '';
  const bits = [Math.round(a.km) + ' km', 'ca. ' + Number(a.driveMin) + ' min rijden', dur(Number(it.durationH) || undefined), effort].filter(Boolean).join(' · ');
  const url = safeUrl(it.url);
  return `<div class="actrow" data-id="${esc(it.id)}"><span class="no">${n + 1}</span><div class="grow" style="flex:1;min-width:0"><div class="t">${esc(it.name)}</div><div class="s">${esc(bits)}${a.why.match.length ? ' · ' + a.why.match.map(m => esc(m.label)).join(', ') : ''}</div></div>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" aria-label="Meer over ${esc(it.name)}" style="padding:10px">Info</a>` : ''}</div>`;
}

// ---------- trips are groups: members, invite links, live updates ----------
// no ghost trips: when I am not (or no longer) a member, or the trip is gone, it leaves my list
function dropGroup(gid) {
  if (S.unwatch[gid]) { S.unwatch[gid](); delete S.unwatch[gid]; }
  delete S.gdata[gid]; delete S.ranked[gid];
  if (S.groups.includes(gid)) { S.groups = S.groups.filter(x => x !== gid); schedulePersist(); }
  if (S.mode === 'app') { popAll(); refreshLive(); }
}
function watchGroup(gid) {
  if (S.unwatch[gid]) return;
  S.unwatch[gid] = S.store.watchGroup(gid, g => {
    if (!g || !g.members || g.members[S.user.uid] === undefined) return dropGroup(gid);
    S.gdata[gid] = g;
    if (S.mode === 'app' && !S.wiz) refreshLive(); // never repaint a form somebody is typing in
  }, () => dropGroup(gid)); // permission denied: removed, or the trip does not exist
}
function groupLink(g) { const code = Object.keys(g.codes || {})[0]; return code ? shareUrl(location.origin, location.pathname.replace(/index\.html$/, ''), code) : ''; }
async function createGroup(name) {
  const id = newToken(20), code = newToken(12);
  await S.store.createGroup({ id, name, memberName: myName(), codes: [code] });
  S.groups.push(id); schedulePersist(); watchGroup(id);
  await persist();
  return id;
}
async function handlePendingJoin() {
  const token = rd('corsica_join') || '';
  if (!token) return;
  let preview = null; // codes/{token} = {gid, name}: all a stranger can see before joining
  try { preview = await S.store.resolveCode(token); } catch { return; } // offline: keep the token for later
  wr('corsica_join', null);
  history.replaceState(null, '', location.pathname);
  if (!preview) { setTimeout(() => toast('Deze uitnodiging is niet (meer) geldig.'), 400); return; }
  if (S.groups.includes(preview.gid)) { watchGroup(preview.gid); return; } // already in
  S.joinPending = { gid: preview.gid, name: String(preview.name || ''), token };
}
// after joining: I am in the travel party (linked to a person with my name, else added)
async function linkMeInParty(gid) {
  const g = await S.store.fetchGroup(gid).catch(() => null);
  const t = g && g.trip;
  if (!t) return;
  const ppl = readPeople(t.party);
  if (ppl.some(p => p.uid === S.user.uid)) return;
  const mine = ppl.find(p => !p.uid && p.name.trim().toLowerCase() === myName().trim().toLowerCase());
  if (mine) mine.uid = S.user.uid; else if (ppl.length < 12) ppl.push({ name: myName(), uid: S.user.uid }); else return;
  const { updatedAt, ...rest } = t; void updatedAt;
  await S.store.setTrip(gid, { ...rest, party: writePeople(ppl) });
}
async function joinGroup() {
  const j = S.joinPending; if (!j) return;
  try {
    await S.store.join(j.gid, myName(), j.token); // the invite token is the proof
    S.groups.push(j.gid); watchGroup(j.gid); S.joinPending = null;
    await persist();
    await linkMeInParty(j.gid).catch(() => {});
    closeSheet(); toast('Je plant mee');
    S.tab = 'routes'; popAll(); render();
    if (S.mode === 'app') { await sleep(150); openTrip(j.gid); } // a new person swipes first; the trip is then in the list
  } catch (e) { toast(e && e.code === 'denied' ? 'Meedoen lukt niet: de uitnodiging is niet meer geldig, of je bent uit de reis gehaald.' : errMsg(e)); }
}
async function shareGroup(gid, copy) {
  const g = S.gdata[gid], url = groupLink(g);
  if (!url) return;
  const text = shareText(g.name, url);
  if (!copy && navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } } // the link goes inside the text: WhatsApp drops a separate url
  try { await navigator.clipboard.writeText(url); toast('Link gekopieerd'); } catch { openSheet(`<h3>Uitnodigingslink</h3><p style="word-break:break-all">${esc(url)}</p>`); }
}


// ---------- sheet ----------
function openSheet(html) { $('sheetBody').innerHTML = html; $('sheet').classList.add('on'); $('bd').classList.add('on'); }
function closeSheet() { $('sheet').classList.remove('on'); $('bd').classList.remove('on'); }
function creditsSheet() {
  const rows = [];
  for (const [k, c] of Object.entries(S.credits || {})) rows.push(`<div class="row"><div class="grow"><div class="t">${esc(c.title || k)}</div><div class="s">${esc(c.author || '')} · ${esc(c.lic || '')}</div></div></div>`);
  for (const it of [...S.catalog.acc, ...S.catalog.act]) {
    const p = it.photo;
    if (p && typeof p === 'object') rows.push(`<div class="row"><div class="grow"><div class="t">${esc(it.name)}</div><div class="s">${esc(p.author || '')} · ${esc(p.license || p.lic || '')}</div></div></div>`);
  }
  openSheet(`<h3>Fotocredits</h3><p class="note">Foto's komen van Wikimedia Commons en OpenStreetMap-bijdragers (kaart).</p><div class="group" style="margin-top:12px">${rows.join('') || '<div class="row"><div class="grow"><div class="s">Geen credits beschikbaar.</div></div></div>'}</div>`);
}

// ---------- actions ----------
const actions = {
  reload: () => location.reload(),
  async google() { try { await S.store.auth.signInGoogle(); } catch (e) { toast(errMsg(e)); } },
  async anon() { try { await S.store.auth.signInAnonymous(); } catch (e) { toast(errMsg(e)); } },
  start: () => startDeck(deckDone('acc') ? 'act' : 'acc'),
  like: () => deckCtl && deckCtl.swipe(SWIPE.YES),
  nope: () => deckCtl && deckCtl.swipe(SWIPE.NO),
  super: () => deckCtl && deckCtl.swipe(SWIPE.SUPER),
  undo: () => deckCtl && deckCtl.undo(),
  skip: () => deckFinished(true),
  'deck-close': () => deckFinished(false),
  'next-deck': () => { const n = S.interstitial.next; S.interstitial = null; if (n === 'app') { S.mode = 'app'; S.tab = 'routes'; S.deckFrom = null; render(); } else startDeck(n); },
  tab: d => { popAll(); S.tab = d.tab; renderApp($('root')); },
  'open-route': d => openRoute(d.gid, d.id),
  'open-stop': d => openStop(lastRoute.gid, lastRoute.id, +d.i),
  back: () => popScreen(),
  why: (d, el) => { const t = el.parentElement.querySelector('.whytxt'); t.hidden = !t.hidden; el.setAttribute('aria-expanded', String(!t.hidden)); },
  more: () => { const p = myProfile(); const cards = moreCards(allCards(), S.swipes, p, 10); if (!cards.length) return toast('Alle kaarten zijn al beoordeeld.'); startDeck('more', { from: 'profile', cards }); },
  reswipe: d => openSheet(`<h3>Opnieuw swipen?</h3><p>Je eerdere antwoorden voor ${d.kind === 'acc' ? 'accommodaties' : 'activiteiten'} worden gewist.</p><button class="btn danger" data-a="reswipe-yes" data-kind="${esc(d.kind)}">Ja, wis en begin opnieuw</button><button class="btn alt" data-a="sheet-close">Annuleren</button>`),
  'reswipe-yes': d => { for (const c of deckOf(d.kind)) delete S.swipes[c.id]; delete S.skipped[d.kind]; S.ranked = {}; schedulePersist(); closeSheet(); startDeck(d.kind, { from: 'profile' }); },
  credits: creditsSheet,
  async signout() { await persist(); await S.store.auth.signOut(); },
  'sheet-close': closeSheet,
  // fetch the images of this route (stays, accommodations, activities): the service worker caches them as they pass through
  async offline(d, el) {
    const plan = planOf(d.gid, d.id).plan;
    if (!plan) return;
    const urls = new Set();
    for (const st of plan.stops) {
      const info = S.places.stays[st.stay];
      if (info && info.img) urls.add(stayImg(info.img));
      for (const a of st.acc) { const u = photoOf(a.item, S.base); if (u) urls.add(u); }
      for (const a of st.acts) { const u = photoOf(a.item, S.base); if (u) urls.add(u); }
    }
    const list = [...urls].filter(u => sameOrigin(u) || u.startsWith("https://"));
    let done = 0, failed = 0;
    el.disabled = true;
    for (let i = 0; i < list.length; i += 6) {
      await Promise.all(list.slice(i, i + 6).map(u => fetch(u, { mode: sameOrigin(u) ? 'same-origin' : 'no-cors' }).then(r => { if (!r.ok && r.type !== 'opaque') failed++; }).catch(() => { failed++; })));
      done = Math.min(list.length, i + 6);
      el.textContent = `Downloaden... ${done} van ${list.length}`;
    }
    el.disabled = false;
    el.textContent = failed ? `Download voor offline (${failed} mislukt, probeer opnieuw)` : 'Offline beschikbaar';
    toast(failed ? 'Niet alles kon worden gedownload.' : `${list.length} afbeeldingen bewaard voor offline`);
  },
  pref: d => { if (S.prefs[d.k]) delete S.prefs[d.k]; else S.prefs[d.k] = true; prefsChanged(); },
  budget: d => { if (+d.v) S.prefs.budget = +d.v; else delete S.prefs.budget; prefsChanged(); },
  tagedit: d => {
    const v = S.overrides[d.tag], now = v === 1 ? 'Je vindt dit leuk (door jou ingesteld).' : v === -1 ? 'Je wilt dit liever niet (door jou ingesteld).' : v === 0 ? 'Verwijderd uit je profiel (door jou ingesteld).' : 'Zo volgt het uit je swipes.';
    openSheet(`<h3>${esc(label(d.tag))}</h3><p>${now}</p><button class="btn" data-a="tagset" data-tag="${esc(d.tag)}" data-v="1">Dit vind ik leuk</button><button class="btn alt" data-a="tagset" data-tag="${esc(d.tag)}" data-v="-1">Liever niet</button><button class="btn alt" data-a="tagset" data-tag="${esc(d.tag)}" data-v="0">Verwijder uit mijn profiel</button>${v !== undefined ? `<button class="btn alt" data-a="tagset" data-tag="${esc(d.tag)}" data-v="reset">Terug naar mijn swipes</button>` : ''}`);
  },
  tagset: d => { if (d.v === 'reset') delete S.overrides[d.tag]; else S.overrides[d.tag] = +d.v; closeSheet(); prefsChanged(); },
  taglist: () => {
    const grp = (title, map) => `<div class="group-h" style="margin-top:14px">${title}</div><div class="chips">${Object.keys(map).map(t => `<button class="chip" data-a="tagedit" data-tag="${esc(t)}">${esc(map[t])}</button>`).join('')}</div>`;
    openSheet(`<h3>Tag toevoegen</h3><p>Kies wat je wilt aanpassen.</p>${grp('Verblijf', S.tagsJson.accommodation || {})}${grp('Activiteiten', S.tagsJson.activity || {})}`);
  },
  'group-toggle': d => { const t = (S.toggles[d.gid] ||= {}); t[d.uid] = t[d.uid] === false; wr(key('toggles'), JSON.stringify(S.toggles)); delete S.ranked[d.gid]; refreshLive(); },
  'group-share': d => shareGroup(d.gid, false),
  'group-copy': d => shareGroup(d.gid, true),
  async 'group-rotate'(d) {
    const g = S.gdata[d.gid], old = Object.keys(g.codes || {}), code = newToken(12);
    try { if (old.length) await S.store.rotateLink(d.gid, code, old, g.name); else await S.store.addCode(d.gid, code, g.name); toast('Nieuwe link gemaakt'); } catch (e) { toast(errMsg(e)); }
  },
  'group-leave': d => openSheet(`<h3>Reis verlaten?</h3><p>Je profiel wordt uit de reis gehaald.</p><button class="btn danger" data-a="group-leave-yes" data-gid="${esc(d.gid)}">Ja, verlaat de reis</button><button class="btn alt" data-a="sheet-close">Annuleren</button>`),
  async 'group-leave-yes'(d) {
    try {
      await S.store.removeMember(d.gid, S.user.uid);
      S.groups = S.groups.filter(g => g !== d.gid); if (S.unwatch[d.gid]) { S.unwatch[d.gid](); delete S.unwatch[d.gid]; }
      delete S.gdata[d.gid]; delete S.ranked[d.gid];
      await persist(); closeSheet(); popAll(); renderApp($('root'));
    } catch (e) { toast(errMsg(e)); }
  },
  'group-delete': d => openSheet(`<h3>Reis verwijderen?</h3><p>De reis, de deellinks en de gedeelde profielen verdwijnen voor iedereen.</p><button class="btn danger" data-a="group-delete-yes" data-gid="${esc(d.gid)}">Ja, verwijder de reis</button><button class="btn alt" data-a="sheet-close">Annuleren</button>`),
  async 'group-delete-yes'(d) {
    const g = S.gdata[d.gid];
    try { await S.store.deleteGroup(d.gid, Object.keys((g && g.codes) || {})); dropGroup(d.gid); await persist(); closeSheet(); popAll(); renderApp($('root')); toast('Reis verwijderd'); } catch (e) { toast(errMsg(e)); }
  },
  async setname() {
    const n = ($('dname').value || '').trim().slice(0, 40);
    if (!n) return toast('Geef een naam op.');
    S.displayName = n; schedulePersist();
    for (const gid of S.groups) if (S.gdata[gid] && S.gdata[gid].members && S.gdata[gid].members[S.user.uid] !== undefined) { try { await S.store.setMemberName(gid, n); } catch { /* retried next time */ } }
    toast('Naam bewaard');
  },
  async 'group-kick'(d) { try { await S.store.removeMember(d.gid, d.uid); } catch (e) { toast(errMsg(e)); } },
  'trip-new': () => openWizard(),
  'trip-open': d => openTrip(d.gid),
  'trip-setup': d => openWizard(d.gid),
  'trip-edit': d => openWizard(d.gid, d.step),
  household: () => openHousehold(),
  'wiz-mode': d => { S.wiz.mode = d.m; repaintTop(); },
  'wiz-pace': d => { S.wiz.pace = d.v; repaintTop(); },
  'wiz-month': d => { const m = S.wiz.months; if (m.includes(d.m)) m.splice(m.indexOf(d.m), 1); else if (m.length < 3) m.push(d.m); else return toast('Kies maximaal 3 maanden.'); repaintTop(); },
  'wiz-n': d => { S.wiz.nights = Math.min(NIGHTS_RANGE[1], Math.max(NIGHTS_RANGE[0], S.wiz.nights + Number(d.d))); $('wnights').textContent = S.wiz.nights; },
  'wiz-add': () => { S.wiz.party.push({ name: '' }); repaintTop(); const ins = document.querySelectorAll('#people [data-f=pname]'); if (ins.length) ins[ins.length - 1].focus(); },
  'wiz-del': d => { S.wiz.party.splice(+d.i, 1); repaintTop(); },
  'wiz-household': () => { const p = wizProblem(S.wiz); if (p) return toast(p); S.household = readPeople(writePeople(S.wiz.party.map(({ uid, ...x }) => (uid === S.user.uid ? { ...x, uid } : x)))); schedulePersist(); toast('Bewaard als je gezin'); },
  'wiz-hl': (d, el) => { const h = S.wiz.hl; if (h.has(d.id)) h.delete(d.id); else h.add(d.id); el.setAttribute('aria-pressed', String(h.has(d.id))); const n = wizNights(S.wiz), many = n && h.size > Math.max(1, n - 3); $('hlcount').textContent = h.size + ' gekozen' + (many ? ` · veel voor ${n} nachten: misschien past niet alles` : ''); },
  'wiz-prev': () => { S.wiz.step = WIZ_STEPS[Math.max(0, WIZ_STEPS.indexOf(S.wiz.step) - 1)]; repaintTop(); },
  'wiz-next': () => {
    const w = S.wiz, p = wizProblem(w);
    if (p) return toast(p);
    const i = WIZ_STEPS.indexOf(w.step);
    if (w.only || i === WIZ_STEPS.length - 1) return wizSave();
    w.step = WIZ_STEPS[i + 1]; repaintTop();
    const sc = pushed.length && pushed[pushed.length - 1].el.querySelector('.scroll'); if (sc) sc.scrollTop = 0;
  },
  'join-yes': joinGroup,
  'join-no': () => { S.joinPending = null; closeSheet(); },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-a]');
  if (!el) return;
  const fn = actions[el.dataset.a];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});
$('bd').addEventListener('click', closeSheet);
document.addEventListener('input', e => {
  const el = e.target, w = S.wiz, f = el.dataset && el.dataset.f;
  if (!w || !f) return;
  if (f === 'name' || f === 'start' || f === 'end') w[f] = el.value;
  if (f === 'start' || f === 'end') { const n = nightsBetween(w.start, w.end), out = $('fixedn'); if (out) out.textContent = n ? n + ' nachten' : 'Kies beide data.'; }
  if (f === 'pname') w.party[+el.dataset.i].name = el.value.slice(0, 40);
  if (f === 'pborn') {
    const v = el.value.trim(), p = w.party[+el.dataset.i];
    if (v === '') delete p.born; else p.born = /^[0-9]{4}$/.test(v) ? Number(v) : NaN;
    const a = ageOn(p.born, tripStart({ start: w.start, months: w.months.join(' ') }) || `${new Date().getFullYear()}-07-01`), out = document.querySelector(`[data-age="${el.dataset.i}"]`);
    if (out) out.textContent = a !== null ? a + ' jr' : '';
  }
});
document.addEventListener('keydown', e => {
  if (S.mode === 'deck' && deckCtl && !e.target.closest('input')) {
    if (e.key === 'ArrowRight') deckCtl.swipe(SWIPE.YES);
    else if (e.key === 'ArrowLeft') deckCtl.swipe(SWIPE.NO);
    else if (e.key === 'ArrowUp') deckCtl.swipe(SWIPE.SUPER);
    else if (e.key === 'Backspace' || e.key === 'z') deckCtl.undo();
  }
  if (e.key === 'Escape') closeSheet();
});

// the join sheet appears once the app is showing
const joinWatcher = setInterval(() => {
  if (S.joinPending && (S.mode === 'app' || S.mode === 'intro') && !$('sheet').classList.contains('on')) {
    openSheet(`<h3>Meeplannen met ${esc(S.joinPending.name)}?</h3><p>Je ziet de reis, kunt hem aanpassen en jouw smaakprofiel telt mee. Je kunt altijd weer vertrekken.</p><button class="btn" data-a="join-yes">Meedoen</button><button class="btn alt" data-a="join-no">Niet nu</button>`);
  }
}, 400);
void joinWatcher;

// ---------- boot ----------
function injectManifest() { // never on iOS: "add to home screen" would then use start_url and lose the ?g= invite
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (ios) return;
  const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; document.head.appendChild(l);
}
async function boot() {
  injectManifest();
  const g = q.get('g');
  if (g && isValidCode(g)) wr('corsica_join', g);
  else { const t = tokenFromLink(location.href); if (t) wr('corsica_join', t); }
  try { ({ store: S.store } = await import('./store.js')); } catch (e) {
    fatal(e && e.code === 'no-config' ? 'Nog niet ingesteld' : 'Geen verbinding', e && e.code === 'no-config' ? 'De Firebase-configuratie ontbreekt (firebase-config.js).' : 'De app kan de server niet bereiken.', !(e && e.code === 'no-config'));
    return;
  }
  try { await loadDestination(); } catch (e) { fatal('Kon de gegevens niet laden', String(e && e.message), true); return; }
  S.store.onOnline(v => { S.online = v; });
  const authProblem = S.store.auth.takeError && S.store.auth.takeError(); // a failed redirect sign-in
  if (authProblem) setTimeout(() => toast(authMsg(authProblem), 6000), 700);
  S.store.auth.onChange(u => { onUser(u).catch(e => fatal('Er ging iets mis', String(e && e.message))); });
  if ('serviceWorker' in navigator && !['localhost', '127.0.0.1'].includes(location.hostname)) navigator.serviceWorker.register('sw.js').catch(() => {});
}
boot();
