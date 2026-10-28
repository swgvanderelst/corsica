// Corsica app: sign-in, swipe decks, taste profile, ranked routes with 3 stays per stop and a map of activities, groups.
import {
  MIN_SKIP, SWIPE, profileFrom, certainty, summarize, readSummary, cleanSwipes, topTags, moreCards, tagWeights, flattenLabels,
  groupProfile, rankRoutes, effectiveOverrides, cleanOverrides, cleanPrefs, hiddenReasons, sanitizeRoutes, sanitizePlaces, sanitizeItems, sanitizeCards, combinePrefs, readPrefs, memberName, regionAffinity, mergeCatalogs, normalizeDeck, photoOf, newToken, isValidCode, tokenFromLink, shareUrl, shareText,
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
  swipes: {}, overrides: {}, prefs: {}, skipped: {}, groups: [], gdata: {}, unwatch: {}, view: 'me', toggles: {},
  deckKind: null, deckFrom: null, deckSession: null, interstitial: null,
  rankKey: '', ranked: null, joinPending: null,
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
  ['groups', 'Samen', '<svg viewBox="0 0 24 24"><circle cx="9" cy="9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="17" cy="10" r="2.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 19c.7-3.2 3-5 6-5s5.3 1.8 6 5M15 14.3c3 0 5 1.4 6 4.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'],
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
  for (const k of ['tags', 'places', 'routes', 'deck', 'credits', 'base', 'stayImages']) dest[k] = path(dest[k]);
  dest.catalogs = (Array.isArray(dest.catalogs) ? dest.catalogs : []).map(path).filter(Boolean);
  const [tags, places, routes, deck, credits, ...catalogs] = await Promise.all([
    fetchJson(dest.tags), fetchJson(dest.places), fetchJson(dest.routes), dest.deck ? fetchJson(dest.deck, true) : null, dest.credits ? fetchJson(dest.credits, true) : null,
    ...dest.catalogs.map(c => fetchJson(c, true)),
  ]);
  S.dest = dest; S.base = dest.base; S.deckBase = dest.deck.replace(/[^/]*$/, '');
  S.tagsJson = cleanTags(tags); S.labels = flattenLabels(S.tagsJson);
  S.allowed = new Set(Object.keys(S.labels)); // the only tags that may appear in other people's data
  S.places = sanitizePlaces(places); S.routes = sanitizeRoutes(routes && routes.routes); S.credits = credits && typeof credits === 'object' ? credits : {};
  const cat = mergeCatalogs(catalogs.filter(Boolean));
  S.catalog = { acc: sanitizeItems(cat.acc, 'accommodation'), act: sanitizeItems(cat.act, 'activity') };
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
function saveLocal() { wr(key('name'), S.displayName); wr(key('overrides'), JSON.stringify(S.overrides)); wr(key('prefs'), JSON.stringify(S.prefs)); wr(key('swipes'), JSON.stringify(S.swipes)); wr(key('skipped'), JSON.stringify(S.skipped)); wr(key('groups'), JSON.stringify(S.groups)); }
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
      await S.store.saveUser({ name: myName(), swipes: S.swipes, overrides: S.overrides, prefs: S.prefs, groups: Object.fromEntries(S.groups.map(g => [g, true])) });
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
  S.view = rd(key('view')) || 'me';
  S.toggles = rdj(key('toggles'), {});
  S.mode = 'loading'; render();
  let server = null, offline = false;
  try { server = await S.store.getUser(); } catch { offline = true; }
  if (server) {
    const remote = cleanSwipes(server.swipes);
    if (Object.keys(remote).length || !Object.keys(S.swipes).length) S.swipes = remote; // the server is authoritative once it has swipes
    S.groups = [...new Set([...Object.keys(server.groups || {}), ...S.groups])];
    if (rd(key('dirty')) !== '1') { S.overrides = cleanOverrides(server.overrides, S.allowed); S.prefs = cleanPrefs(server.prefs); if (typeof server.name === 'string' && server.name) S.displayName = server.name.slice(0, 40); } // the server record wins unless local changes never arrived
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

// ---------- profile / ranking ----------
function activeProfile() {
  const me = myProfile();
  if (S.view === 'me' || !S.gdata[S.view]) return { profile: me, label: 'Jij', members: 1, missing: [], group: null, prefs: S.prefs };
  const g = S.gdata[S.view], tog = S.toggles[S.view] || {};
  const list = [], names = [], missing = [], prefList = [];
  for (const [uid, m] of Object.entries(g.members || {})) {
    if (tog[uid] === false) continue;
    const name = memberName(m);
    const p = uid === S.user.uid ? me : readSummary(g.profiles && g.profiles[uid], S.allowed);
    prefList.push(uid === S.user.uid ? S.prefs : readPrefs(g.profiles && g.profiles[uid])); // the strictest budget, the union of the must-haves
    if (p.n > 0) { list.push(p); names.push(name); } else missing.push(name);
  }
  return { profile: groupProfile(list), label: g.name, members: list.length, missing, group: g, names, prefs: combinePrefs(prefList) };
}
function ctx(prefs = S.prefs) { return { acc: S.catalog.acc, act: S.catalog.act, places: S.places.places, stays: S.places.stays, regionTags: S.places.regionTags, regionVeto: S.places.regionVeto, labels: S.labels, prefs, vocab: { acc: Object.keys(S.tagsJson.accommodation || {}), act: Object.keys(S.tagsJson.activity || {}) } }; }
function rankedRoutes() {
  const ap = activeProfile();
  const k = JSON.stringify([ap.profile, ap.prefs, S.catalog.acc.length, S.catalog.act.length]);
  if (S.rankKey !== k) { S.ranked = rankRoutes(S.routes, ap.profile, ctx(ap.prefs)); S.rankKey = k; }
  return { plans: S.ranked, ap };
}
function prefsChanged() { S.rankKey = ''; schedulePersist(); if (S.mode === 'deck') render(); else if (S.mode === 'app') refreshLive(); }
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
      <li><div><b>Je reis stelt zichzelf samen</b><span>Per stop de 3 beste verblijven en een kaart met activiteiten in de buurt. Je kunt ook samen met reisgenoten plannen.</span></div></li>
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
  root.innerHTML = `<div class="scroll pad" id="rootscroll" style="padding-top:calc(14px + env(safe-area-inset-top,0px))">${S.tab === 'routes' ? routesHtml() : S.tab === 'profile' ? profileHtml() : groupsHtml()}</div>`;
}
function viewChips() {
  const opts = [['me', 'Alleen ik'], ...S.groups.filter(g => S.gdata[g]).map(g => [g, S.gdata[g].name])];
  if (opts.length < 2) return '';
  return `<div class="scrollchips" role="group" aria-label="Voor wie">${opts.map(([id, n]) => `<button data-a="view" data-v="${esc(id)}" aria-pressed="${S.view === id}">${esc(n)}</button>`).join('')}</div>`;
}
const PREF_ROWS = [['airco', 'Airco nodig'], ['ev', 'Laadpaal nodig'], ['kids', 'Met kinderen']];
function prefsHtml() {
  const rows = PREF_ROWS.map(([k, t]) => `<div class="row"><div class="grow"><div class="t">${t}</div></div><button class="switch" role="switch" aria-checked="${!!S.prefs[k]}" data-a="pref" data-k="${k}" aria-label="${t}"></button></div>`).join('');
  const budget = [0, 1, 2, 3, 4].map(v => `<button data-a="budget" data-v="${v}" aria-pressed="${(S.prefs.budget || 0) === v}">${v ? '€'.repeat(v) : 'Geen'}</button>`).join('');
  return `<div class="group-h" style="text-align:left">Voorkeuren</div><div class="group" id="prefs" style="text-align:left">${rows}<div class="row"><div class="grow"><div class="t">Budget per nacht</div><div class="s">Hoogste prijsniveau dat je wilt zien</div></div></div></div>
    <div class="scrollchips" role="group" aria-label="Budget" style="margin-top:8px">${budget}</div><p class="note" style="text-align:left">Airco en laadpaal tellen hard mee: stays zonder bevestiging krijgen een waarschuwing. Het budget filtert verblijven.</p>`;
}
function routesHtml() {
  const { plans, ap } = rankedRoutes();
  const empty = ap.profile.n === 0;
  const who = ap.group ? `Gerangschikt voor groep <b>${esc(ap.label)}</b> (${ap.members} ${ap.members === 1 ? 'profiel' : 'profielen'})` : 'Gerangschikt op jouw smaak';
  const missing = ap.missing && ap.missing.length ? `<div class="warnbox">Nog geen swipes van: ${ap.missing.map(esc).join(', ')}.</div>` : '';
  return `<div class="large">Jouw reizen</div><p class="subt">${empty ? 'Swipe een paar kaarten om de reizen op jouw smaak te rangschikken.' : who}</p>${viewChips()}${missing}
    <div id="routelist">${empty ? plans.map((p, i) => routeCard(p, i, empty)).join('') : `<div class="group-h" style="margin-top:4px">Aanbevolen voor jou</div>${routeCard(plans[0], 0, empty)}${routeWhy(plans[0], ap) ? `<p class="note" id="reco" style="margin-top:-6px;margin-bottom:12px">${esc(routeWhy(plans[0], ap))}</p>` : ''}<div class="group-h">Alternatieven</div>${plans.slice(1).map((p, i) => routeCard(p, i + 1, empty)).join('')}`}</div>`;
}
function routeCard(p, i, empty) {
  const r = p.route, km = r.legs.reduce((a, l) => a + Number(l.km), 0), nights = r.nights.reduce((a, b) => a + Number(b), 0);
  const m = p.matchPct;
  return `<button class="rcard${i === 0 && !empty ? ' best' : ''}" data-a="open-route" data-id="${esc(r.id)}" style="--c:var(--route-${esc(r.id)})">
    <div class="top"><div class="badge">${esc(r.id.toUpperCase())}</div><div><div class="t">${esc(r.title)}</div><div class="s">${esc(r.sub)}</div></div>
    ${empty ? '' : `<div class="match">${m == null ? '<b style="font-size:15px">minder passend</b>' : `<b>${m}%</b>`}<span>${i === 0 ? 'aanbevolen' : m == null ? '' : 'match'}</span></div>`}</div>
    ${empty || m == null ? '' : `<div class="bar"><i style="width:${m}%"></i></div>`}
    <div class="foot"><span>${nights} nachten</span><span>${r.stays.map(s => esc(S.places.stays[s] ? S.places.stays[s].short : s)).join(' · ')}</span><span>${km} km · ca. ${fmtMin(r.legs.reduce((a, l) => a + Number(l.min), 0))} rijden</span></div></button>`;
}

function profileHtml() {
  const p = myProfile();
  const hide = hiddenReasons(S.prefs); // no kids words in the profile when travelling without kids
  const likes = topTags(p, { n: 8, sign: 1, hide }), dislikes = topTags(p, { n: 6, sign: -1, hide });
  const row = (t, neg) => `<button class="trow${neg ? ' neg' : ''}" data-a="tagedit" data-tag="${esc(t.tag)}" aria-label="Pas ${esc(label(t.tag))} aan"><span class="tn">${esc(label(t.tag))}${S.overrides[t.tag] !== undefined ? ' <small>(door jou aangepast)</small>' : ''}</span><span class="tb"><i style="width:${Math.round(Math.abs(t.w) * 100)}%"></i></span><span class="tc">${Math.round(certainty(p, t.tag) * 100)}% zeker</span></button>`;
  const total = allCards().length, done = Object.keys(S.swipes).length;
  const sentence = likes.length ? `Jij houdt van: ${likes.slice(0, 5).map(t => `<b>${esc(label(t.tag).toLowerCase())}</b>`).join(', ')}.` : 'We kennen je smaak nog niet. Swipe een paar kaarten.';
  const more = moreCards(allCards(), S.swipes, p, 10).length;
  return `<div class="large">${esc(S.displayName)}</div><p class="subt">${done} van ${total} kaarten beoordeeld</p>
    <div class="group-h">Naam in groepen</div><div class="group"><div class="row"><input class="field" id="dname" maxlength="40" value="${esc(S.displayName)}" aria-label="Je naam in groepen" style="margin:0"><button class="chip on" data-a="setname">Bewaar</button></div></div>
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

function groupsHtml() {
  const mine = S.groups.filter(g => S.gdata[g]);
  const rows = mine.map(g => { const d = S.gdata[g], n = Object.keys(d.members || {}).length; return `<button class="row" data-a="group-open" data-gid="${esc(g)}"><div class="grow"><div class="t">${esc(d.name)}</div><div class="s">${n} ${n === 1 ? 'deelnemer' : 'deelnemers'}${d.owner === S.user.uid ? ' · jij beheert deze groep' : ''}</div></div>${CHEV}</button>`; }).join('');
  return `<div class="large">Samen plannen</div><p class="subt">Maak een groep, stuur de link naar je reisgenoten en plan op een gecombineerd profiel.</p>
    ${rows ? `<div class="group">${rows}</div>` : '<div class="warnbox">Je zit nog in geen enkele groep.</div>'}
    <button class="btn" data-a="group-new">Nieuwe groep</button>`;
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
function popScreen() {
  const e = pushed.pop();
  if (!e) return;
  e.el.classList.remove('push'); e.el.classList.add('pop');
  if (e.unmount) e.unmount();
  const done = () => e.el.remove();
  e.el.addEventListener('animationend', done, { once: true });
  setTimeout(done, 400);
}
function popAll() { while (pushed.length) { const e = pushed.pop(); if (e.unmount) e.unmount(); e.el.remove(); } }
const prevTitle = () => (pushed.length ? pushed[pushed.length - 1].title : { routes: 'Reizen', profile: 'Profiel', groups: 'Samen' }[S.tab]);
function refreshLive() {
  if (S.mode === 'app' && !pushed.length) { const sc = $('rootscroll'); const t = sc ? sc.scrollTop : 0; renderApp($('root')); const n = $('rootscroll'); if (n) n.scrollTop = t; }
  const top = pushed[pushed.length - 1];
  if (top && top.live) paint(top);
}

// ---------- route detail ----------
function routeWhy(plan, ap) {
  const aff = regionAffinity(ap.profile, S.places.regionTags);
  const rows = Object.keys(aff).map(k => ({ k, v: (plan.route.profile[k] || 0) * aff[k] })).filter(x => x.v > 0.05).sort((a, b) => b.v - a.v).slice(0, 2);
  const names = S.tagsJson.region || {};
  return rows.length ? `Past bij jouw voorkeur voor: ${rows.map(r => (names[r.k] || r.k).toLowerCase()).join(' en ')}.` : '';
}
function gmaps(route) {
  const nm = k => ((S.places.names[k] && S.places.names[k].name) || k) + ', Corsica';
  const s = route.stops.map(nm);
  return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=' + encodeURIComponent(s[0]) + '&destination=' + encodeURIComponent(s[s.length - 1]) + '&waypoints=' + encodeURIComponent(s.slice(1, -1).join('|'));
}
let lastRouteId = ''; // the route whose detail screen is open: a stop opens with the same plan
function openRoute(id) {
  lastRouteId = id;
  const { plans, ap } = rankedRoutes();
  const plan = plans.find(p => p.route.id === id);
  if (!plan) return;
  const r = plan.route, km = r.legs.reduce((a, l) => a + Number(l.km), 0), min = r.legs.reduce((a, l) => a + Number(l.min), 0);
  const first = S.places.stays[r.stays[0]];
  pushScreen({
    title: r.name, back: prevTitle(),
    render: () => {
      const why = ap.profile.n ? routeWhy(plan, ap) : '';
      return `<div>${phHtml(first ? stayImg(first.img) : '', r.id, 'hero', `<span class="ov"><b>${esc(r.title)}</b><span>${esc(r.sub)}</span></span>`)}</div>
      <div class="pad">
        <p>${esc(r.lead)}</p>
        ${ap.profile.n ? `<div class="warnbox"><b>${plan.matchPct == null ? 'Minder passend.' : 'Match ' + plan.matchPct + '%.'}</b> ${esc(why)}${plan.shifted ? ' De nachten zijn iets verschoven naar de plekken die het best bij je passen.' : ''}</div>` : ''}
        <div class="stats"><div class="stat"><b>${r.nights.reduce((a, b) => a + Number(b), 0)}</b><span>nachten</span></div><div class="stat"><b>${km}</b><span>km rijden</span></div><div class="stat"><b>${fmtMin(min)}</b><span>rijtijd totaal</span></div></div>
        <div class="warnbox">${esc(r.ferry)}</div>
        <div class="mapcard" style="margin-top:12px">${routeSvg(S.places, r)}</div>
        <div class="group-h">Verblijfplaatsen</div>
        ${plan.stops.map((s, i) => stopCard(s, i)).join('')}
        <button class="btn alt" data-a="offline" data-id="${esc(r.id)}" id="offlinebtn">Download voor offline</button>
        <a class="btn alt" href="${esc(gmaps(r))}" target="_blank" rel="noopener">Route in Google Maps</a>
        <div class="group-h">Ritten</div>
        <div class="group">${r.legs.map((l, i) => `<div class="row"><span class="num" style="background:var(--route-${esc(r.id)})">${'ABCDEFG'[i] || i + 1}</span><div class="grow"><div class="t">${esc(l.from)} naar ${esc(l.to)}</div><div class="s">${Number(l.km)} km · ca. ${fmtMin(Number(l.min))} rijden</div></div></div>`).join('')}</div>
        ${r.days ? `<div class="group-h">Voorbeeld-dagprogramma</div><p class="note" style="margin-top:0">Voor de oorspronkelijke verdeling van nachten.</p><div class="group">${r.days.map((d, i) => `<div class="row" style="align-items:flex-start"><span class="num sq" style="background:var(--fill);color:var(--fg);border-radius:9px;font-size:13px">${i + 1}</span><div class="grow"><div class="t">${esc(d.title)}</div><div class="s" style="color:var(--fg)">${esc(d.text)}</div>${d.drive ? `<div class="s">${esc(d.drive)}</div>` : ''}</div></div>`).join('')}</div>` : ''}
      </div>`;
    },
  });
}
function stopCard(s, i) {
  const st = S.places.stays[s.stay] || { name: s.stay, short: s.stay, kind: '' };
  const changed = s.nights !== s.baseNights ? ` <span class="pill ok">was ${Number(s.baseNights)}</span>` : '';
  return `<button class="stopcard" data-a="open-stop" data-i="${i}">${phHtml(stayImg(st.img || s.stay), s.stay, '', `<span class="ov"><b>${i + 1}. ${esc(st.name)}</b></span>`)}
    <div class="meta"><span>${Number(s.nights)} ${Number(s.nights) === 1 ? 'nacht' : 'nachten'}${changed}</span><span>${s.acc.length} verblijven · ${s.acts.length} activiteiten ${CHEV.replace('class="chev"', 'class="chev" style="display:inline;vertical-align:-1px"')}</span></div></button>`;
}
function openStop(planId, i) {
  const { plans, ap } = rankedRoutes();
  const plan = plans.find(p => p.route.id === planId);
  const s = plan && plan.stops[i];
  if (!s) return;
  const st = S.places.stays[s.stay] || { name: s.stay, desc: '', sights: [], food: [] };
  const xy = S.places.places[s.stay] || [9.1, 42.15];
  let mapCtl = null;
  pushScreen({
    title: st.short || st.name, back: plan.route.name,
    render: () => `<div>${phHtml(stayImg(st.img || s.stay), s.stay, 'hero', `<span class="ov"><b>${esc(st.name)}</b><span>${Number(s.nights)} ${Number(s.nights) === 1 ? 'nacht' : 'nachten'} · ${esc(st.kind || '')}</span></span>`)}</div>
      <div class="pad">
        <p>${esc(st.desc)}</p>
        <div class="group-h">Waar slaap je? Top 3 voor ${esc(ap.label === 'Jij' ? 'jou' : ap.label)}</div>
        ${(s.must || []).length ? `<div class="warnbox" id="must" style="margin:0 0 10px">${s.must.map(m => `${m.key === 'ev' ? 'Laadpaal' : 'Airco'}: ${m.confirmed} van ${m.total} bevestigd`).join(' · ')}</div>` : ''}
        ${s.acc.length ? s.acc.map((a, n) => accHtml(a, n)).join('') : '<div class="warnbox">Nog geen accommodaties in de catalogus voor deze plek.</div>'}
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
function accHtml(a, n) {
  const it = a.item, src = photoOf(it, S.base);
  const tags = Object.entries(tagWeights(it)).filter(([t]) => t !== 'airco' && t !== 'ev_charging' && !hiddenReasons(S.prefs).includes(t)).sort((x, y) => y[1] - x[1]).slice(0, 5).map(([t]) => `<span class="chip">${esc(label(t))}</span>`).join('');
  const generic = it.photoGeneric === true;
  const url = safeUrl(it.url);
  const tw = tagWeights(it);
  const NAMES = { airco: 'airco', ev: 'laadpaal' };
  const badges = [tw.airco >= 0.5 ? '<span class="pill ok">Airco</span>' : '', tw.ev_charging >= 0.5 ? '<span class="pill ok">Laadpaal</span>' : '',
    ...(a.unconfirmed || []).map(t => `<span class="pill warn">&#9888; ${NAMES[t] || esc(t)} onbekend &mdash; vraag na</span>`),
    ...(a.absent || []).map(t => `<span class="pill warn">&#9888; geen ${NAMES[t] || esc(t)}</span>`)].join('');
  const con = a.why.con ? `<br>${esc(a.why.con.text.charAt(0).toUpperCase() + a.why.con.text.slice(1))}.` : '';
  return `<div class="acc" data-acc="${esc(it.id)}">${phHtml(src, it.id, '')}
    <div class="body"><div class="nm"><span class="rank">${n + 1}</span>${esc(it.name)}</div>
    <div class="meta">${esc((S.places.stays[it.region] && S.places.stays[it.region].short) || it.region)}${euro(Number(it.priceLevel)) ? ' · ' + euro(Number(it.priceLevel)) : ''}${generic ? ' · illustratieve foto' : ''}</div>
    <div class="badges">${badges}</div>
    <div class="chips">${tags}</div>
    ${a.tier === 3 ? '<div class="badges"><span class="pill warn">&#9888; boven je budget</span></div><div class="note" style="margin:6px 0 0">Alleen getoond omdat er in deze plaats niets anders is.</div>' : a.tier === 2 ? '<div class="note" style="margin:6px 0 0">Alleen getoond omdat er in deze plaats niets anders is.</div>' : ''}
    ${it.desc ? `<div class="desc">${esc(it.desc)}</div>` : ''}
    <div class="why"><button class="whybtn" data-a="why" aria-expanded="false">Waarom deze?</button><div class="whytxt" hidden>${esc(a.why.text)}${con}</div></div>
    ${url ? `<div class="links"><a href="${esc(url)}" target="_blank" rel="noopener">Bekijk verblijf</a></div>` : ''}</div></div>`;
}
function actHtml(a, n) {
  const it = a.item;
  const tw = tagWeights(it);
  const effort = tw.effort_high >= 0.5 ? 'veel inspanning' : tw.effort_low >= 0.5 ? 'weinig inspanning' : '';
  const bits = [Math.round(a.km) + ' km', 'ca. ' + Number(a.driveMin) + ' min rijden', dur(Number(it.durationH) || undefined), effort].filter(Boolean).join(' · ');
  const url = safeUrl(it.url);
  return `<div class="actrow" data-id="${esc(it.id)}"><span class="no">${n + 1}</span><div class="grow" style="flex:1;min-width:0"><div class="t">${esc(it.name)}</div><div class="s">${esc(bits)}${a.why.match.length ? ' · ' + a.why.match.map(m => esc(m.label)).join(', ') : ''}</div></div>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener" aria-label="Meer over ${esc(it.name)}" style="padding:10px">Info</a>` : ''}</div>`;
}

// ---------- groups ----------
// no ghost groups: when I am not (or no longer) a member, or the group is gone, it leaves my list
function dropGroup(gid) {
  if (S.unwatch[gid]) { S.unwatch[gid](); delete S.unwatch[gid]; }
  delete S.gdata[gid];
  if (S.groups.includes(gid)) { S.groups = S.groups.filter(x => x !== gid); schedulePersist(); }
  S.rankKey = '';
  if (S.view === gid) setView('me');
  if (S.mode === 'app') { popAll(); refreshLive(); }
}
function watchGroup(gid) {
  if (S.unwatch[gid]) return;
  S.unwatch[gid] = S.store.watchGroup(gid, g => {
    if (!g || !g.members || g.members[S.user.uid] === undefined) return dropGroup(gid);
    S.gdata[gid] = g;
    S.rankKey = '';
    if (S.mode === 'app') refreshLive();
  }, () => dropGroup(gid)); // permission denied: removed, or the group does not exist
}
function setView(v) { S.view = v; wr(key('view'), v); S.rankKey = ''; }
function groupLink(g) { const code = Object.keys(g.codes || {})[0]; return code ? shareUrl(location.origin, location.pathname.replace(/index\.html$/, ''), code) : ''; }
function openGroup(gid) {
  pushScreen({ title: (S.gdata[gid] || {}).name || 'Groep', back: 'Samen', live: true, render: () => groupDetail(gid) });
}
function groupDetail(gid) {
  const g = S.gdata[gid];
  if (!g) return '<div class="pad"><p class="subt">Deze groep bestaat niet meer.</p></div>';
  const owner = g.owner === S.user.uid, tog = S.toggles[gid] || {}, link = groupLink(g);
  const members = Object.entries(g.members || {});
  const rows = members.map(([uid, m]) => {
    const name = memberName(m);
    const p = uid === S.user.uid ? myProfile() : readSummary(g.profiles && g.profiles[uid], S.allowed);
    const on = tog[uid] !== false;
    return `<div class="row"><div class="grow"><div class="t">${esc(name)}${uid === S.user.uid ? ' (jij)' : ''}${uid === g.owner ? ' · beheerder' : ''}</div><div class="s">${p.n ? p.n + ' kaarten beoordeeld' : 'nog niet geswipet'}</div></div>
      ${owner && uid !== S.user.uid ? `<button class="chip" data-a="group-kick" data-gid="${esc(gid)}" data-uid="${esc(uid)}" aria-label="Verwijder ${esc(name)}">Verwijder</button>` : ''}
      <button class="switch" role="switch" aria-checked="${on}" data-a="group-toggle" data-gid="${esc(gid)}" data-uid="${esc(uid)}" aria-label="${esc(name)} meenemen"></button></div>`;
  }).join('');
  const comb = (() => { const old = S.view; S.view = gid; const a = activeProfile(); S.view = old; return a; })();
  const likes = topTags(comb.profile, { n: 5, sign: 1 });
  return `<div class="pad"><div class="large">${esc(g.name)}</div><p class="subt">${members.length} ${members.length === 1 ? 'deelnemer' : 'deelnemers'}</p>
    <div class="group-h">Wie telt mee in het gecombineerde profiel</div><div class="group" id="members">${rows}</div>
    <div class="group-h">Gecombineerd profiel</div>
    <div class="warnbox" id="combined">${comb.members ? (likes.length ? `Jullie houden van: ${likes.map(t => esc(label(t.tag).toLowerCase())).join(', ')}.` : 'Nog geen duidelijke voorkeuren.') + ` (${comb.members} ${comb.members === 1 ? 'profiel' : 'profielen'})` : 'Nog niemand heeft geswipet.'}</div>
    <button class="btn" data-a="group-use" data-gid="${esc(gid)}">Toon reizen voor deze groep</button>
    <div class="group-h">Uitnodigen</div>
    ${link ? `<div class="warnbox" style="word-break:break-all" id="glink">${esc(link)}</div>
    <button class="btn alt" data-a="group-share" data-gid="${esc(gid)}">Link delen</button>
    <button class="btn alt" data-a="group-copy" data-gid="${esc(gid)}">Kopieer link</button>
    ${owner ? `<button class="btn alt" data-a="group-rotate" data-gid="${esc(gid)}">Nieuwe link maken</button>` : ''}`
      : `<p class="note">Er is geen uitnodigingslink.</p>${owner ? `<button class="btn alt" data-a="group-rotate" data-gid="${esc(gid)}">Link maken</button>` : ''}`}
    ${owner ? `<button class="btn danger" data-a="group-delete" data-gid="${esc(gid)}">Groep verwijderen</button>` : `<button class="btn danger" data-a="group-leave" data-gid="${esc(gid)}">Groep verlaten</button>`}</div>`;
}
async function createGroup(name) {
  const id = newToken(20), code = newToken(12);
  try {
    await S.store.createGroup({ id, name, memberName: myName(), codes: [code] });
    S.groups.push(id); schedulePersist(); watchGroup(id);
    await persist();
    closeSheet(); toast('Groep gemaakt');
    await sleep(150);
    openGroup(id);
  } catch (e) { toast(errMsg(e)); }
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
async function joinGroup() {
  const j = S.joinPending; if (!j) return;
  try {
    await S.store.join(j.gid, myName(), j.token); // the invite token is the proof
    S.groups.push(j.gid); watchGroup(j.gid); S.joinPending = null;
    await persist();
    closeSheet(); toast('Je doet mee');
    setView(j.gid); S.tab = 'routes'; render();
  } catch (e) { toast(e && e.code === 'denied' ? 'Meedoen lukt niet: de uitnodiging is niet meer geldig, of je bent uit de groep gehaald.' : errMsg(e)); }
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
  'next-deck': () => { const n = S.interstitial.next; S.interstitial = null; if (n === 'app') { S.mode = 'app'; S.tab = 'profile'; S.deckFrom = null; render(); } else startDeck(n); },
  tab: d => { popAll(); S.tab = d.tab; renderApp($('root')); },
  view: d => { setView(d.v); refreshLive(); },
  'open-route': d => openRoute(d.id),
  'open-stop': d => openStop(lastRouteId, +d.i),
  back: () => popScreen(),
  why: (d, el) => { const t = el.parentElement.querySelector('.whytxt'); t.hidden = !t.hidden; el.setAttribute('aria-expanded', String(!t.hidden)); },
  more: () => { const p = myProfile(); const cards = moreCards(allCards(), S.swipes, p, 10); if (!cards.length) return toast('Alle kaarten zijn al beoordeeld.'); startDeck('more', { from: 'profile', cards }); },
  reswipe: d => openSheet(`<h3>Opnieuw swipen?</h3><p>Je eerdere antwoorden voor ${d.kind === 'acc' ? 'accommodaties' : 'activiteiten'} worden gewist.</p><button class="btn danger" data-a="reswipe-yes" data-kind="${esc(d.kind)}">Ja, wis en begin opnieuw</button><button class="btn alt" data-a="sheet-close">Annuleren</button>`),
  'reswipe-yes': d => { for (const c of deckOf(d.kind)) delete S.swipes[c.id]; delete S.skipped[d.kind]; S.rankKey = ''; schedulePersist(); closeSheet(); startDeck(d.kind, { from: 'profile' }); },
  credits: creditsSheet,
  async signout() { await persist(); await S.store.auth.signOut(); },
  'sheet-close': closeSheet,
  // fetch the images of this route (stays, accommodations, activities): the service worker caches them as they pass through
  async offline(d, el) {
    const plan = (rankedRoutes().plans || []).find(p => p.route.id === d.id);
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
  'group-new': () => openSheet('<h3>Nieuwe groep</h3><p>Geef de groep een naam, bijvoorbeeld de reis of de vriendengroep.</p><input class="field" id="gname" maxlength="30" value="Corsica samen" aria-label="Naam van de groep"><button class="btn" data-a="group-create">Maak groep</button>'),
  'group-create': () => { const n = $('gname').value.trim(); if (!n) return toast('Geef de groep een naam.'); createGroup(n.slice(0, 30)); },
  'group-open': d => openGroup(d.gid),
  'group-toggle': d => { const t = (S.toggles[d.gid] ||= {}); t[d.uid] = t[d.uid] === false; wr(key('toggles'), JSON.stringify(S.toggles)); S.rankKey = ''; refreshLive(); },
  'group-use': d => { setView(d.gid); popAll(); S.tab = 'routes'; renderApp($('root')); },
  'group-share': d => shareGroup(d.gid, false),
  'group-copy': d => shareGroup(d.gid, true),
  async 'group-rotate'(d) {
    const g = S.gdata[d.gid], old = Object.keys(g.codes || {}), code = newToken(12);
    try { if (old.length) await S.store.rotateLink(d.gid, code, old, g.name); else await S.store.addCode(d.gid, code, g.name); toast('Nieuwe link gemaakt'); } catch (e) { toast(errMsg(e)); }
  },
  'group-leave': d => openSheet(`<h3>Groep verlaten?</h3><p>Je profiel wordt uit de groep gehaald.</p><button class="btn danger" data-a="group-leave-yes" data-gid="${esc(d.gid)}">Ja, verlaat de groep</button><button class="btn alt" data-a="sheet-close">Annuleren</button>`),
  async 'group-leave-yes'(d) {
    try {
      await S.store.removeMember(d.gid, S.user.uid);
      S.groups = S.groups.filter(g => g !== d.gid); if (S.unwatch[d.gid]) { S.unwatch[d.gid](); delete S.unwatch[d.gid]; }
      delete S.gdata[d.gid]; if (S.view === d.gid) setView('me');
      await persist(); closeSheet(); popAll(); renderApp($('root'));
    } catch (e) { toast(errMsg(e)); }
  },
  'group-delete': d => openSheet(`<h3>Groep verwijderen?</h3><p>De groep, de uitnodigingslinks en de gedeelde profielen verdwijnen voor iedereen.</p><button class="btn danger" data-a="group-delete-yes" data-gid="${esc(d.gid)}">Ja, verwijder de groep</button><button class="btn alt" data-a="sheet-close">Annuleren</button>`),
  async 'group-delete-yes'(d) {
    const g = S.gdata[d.gid];
    try { await S.store.deleteGroup(d.gid, Object.keys((g && g.codes) || {})); dropGroup(d.gid); await persist(); closeSheet(); popAll(); renderApp($('root')); toast('Groep verwijderd'); } catch (e) { toast(errMsg(e)); }
  },
  async setname() {
    const n = ($('dname').value || '').trim().slice(0, 40);
    if (!n) return toast('Geef een naam op.');
    S.displayName = n; schedulePersist();
    for (const gid of S.groups) if (S.gdata[gid] && S.gdata[gid].members && S.gdata[gid].members[S.user.uid] !== undefined) { try { await S.store.setMemberName(gid, n); } catch { /* retried next time */ } }
    toast('Naam bewaard');
  },
  async 'group-kick'(d) { try { await S.store.removeMember(d.gid, d.uid); } catch (e) { toast(errMsg(e)); } },
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
    openSheet(`<h3>Meedoen met ${esc(S.joinPending.name)}?</h3><p>Jouw smaakprofiel wordt gedeeld met de deelnemers van deze groep. Je kunt altijd weer vertrekken.</p><button class="btn" data-a="join-yes">Meedoen</button><button class="btn alt" data-a="join-no">Niet nu</button>`);
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
