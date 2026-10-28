// Static and data-level security checks (the browser checks are in tools/smoke.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { sanitizeRoutes, sanitizePlaces, sanitizeItems } from '../logic.js';

const read = p => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const json = p => JSON.parse(read(p));

test('a hostile destination: markup in ids and numbers does not survive the sanitiser', () => {
  const evil = json('test/fixtures/evil-routes.json').routes;
  assert.equal(evil.length, 3);
  const out = sanitizeRoutes(evil);
  assert.deepEqual(out.map(r => r.id), ['a'], 'only the route with a safe id');
  const r = out[0];
  assert.ok(r.nights.every(n => Number.isInteger(n) && n >= 1));
  assert.ok(r.legs.every(l => l.km === 0 && l.min === 0), 'string km / min become 0');
  assert.ok(JSON.stringify(r.nights) === JSON.stringify([1, 3, 4]));
  // the text fields stay text (they are escaped when rendered)
  assert.equal(typeof r.title, 'string');
});

test('the real destination passes the sanitiser unchanged in size', () => {
  const routes = json('destinations/corsica/routes.json').routes;
  assert.equal(sanitizeRoutes(routes).length, routes.length);
  const places = json('destinations/corsica/places.json');
  const p = sanitizePlaces(places);
  assert.equal(Object.keys(p.places).length, Object.keys(places.places).length);
  assert.equal(Object.keys(p.stays).length, Object.keys(places.stays).length);
  assert.equal(p.outline.length, places.outline.length);
  assert.deepEqual(p.regionTags.coast, places.regionTags.coast);
  const cat = json('test/fixtures/catalog.json');
  assert.equal(sanitizeItems(cat.accommodations, 'accommodation').length, cat.accommodations.length);
  assert.equal(sanitizeItems(cat.activities, 'activity').length, cat.activities.length);
});

test('?dest is local-only and restricted; every destination file must be same-origin', () => {
  const app = read('app.js');
  assert.match(app, /const custom = isLocalHost \? q\.get\('dest'\) : null/);
  assert.match(app, /if \(typeof url !== 'string' \|\| !sameOrigin\(url\)\) throw/);
  const re = new RegExp(/const DEST_RE = \/(.*)\/;/.exec(app)[1]); // the pattern the app really uses
  assert.equal(re.source, '^(destinations|test\\/fixtures)\\/[\\w-]+(\\/[\\w-]+)*\\.json$');
  for (const ok of ['destinations/corsica/destination.json', 'test/fixtures/destination.json', 'test/fixtures/evil-destination.json']) assert.ok(re.test(ok), ok);
  for (const bad of ['../package.json', 'destinations/../package.json', 'http://evil.example/x.json', '//evil.example/x.json', 'test/fixtures/x.html', 'destinations/a b.json', 'javascript:alert(1)', 'destinations/corsica/destination.json?x=1']) assert.ok(!re.test(bad), bad);
});

test('route ids are escaped where they are written into attributes', () => {
  const maps = read('maps.js');
  assert.ok(!/\$\{route\.id\}/.test(maps), 'maps.js must not interpolate route.id raw');
  const app = read('app.js');
  assert.ok(!/\$\{r\.id\}|\$\{p\.route\.id\}/.test(app), 'app.js must not interpolate a route id raw');
});

test('sign-in: a popup in the tap handler, the redirect only as the fallback; errors are surfaced; anonymous exists only for local tests', () => {
  const fb = read('store-firebase.js');
  assert.ok(!/isIos/.test(fb), 'no iOS special case that goes straight to the redirect');
  const popup = fb.indexOf('await signInWithPopup(auth, provider)'), redirect = fb.indexOf('signInWithRedirect(auth, provider)');
  assert.ok(popup > 0 && redirect > popup, 'the popup comes first');
  assert.match(fb, /auth\/popup-blocked/);
  assert.match(fb, /getRedirectResult\(auth\)\.catch\(e => \{ authError =/, 'redirect errors are kept, not swallowed');
  assert.match(fb, /takeError\(\)/);
  assert.match(fb, /if \(anonymousOk\) authApi\.signInAnonymous/, 'no anonymous path unless this is a local test');
  assert.ok(!/signInAnonymous[^\n]*\n[^\n]*anonymousOk/.test(fb));
  const app = read('app.js');
  assert.match(app, /auth\/unauthorized-domain/);
  assert.match(app, /takeError/);
  assert.ok(app.includes("S.store.auth.canAnonymous && (q.get('test') === '1')"), 'the anonymous button needs canAnonymous and ?test=1');
});

test('production rules: every .read and .write demands a non-anonymous sign-in', () => {
  const rules = json('database.rules.json');
  const walk = (node, path) => {
    for (const [k, v] of Object.entries(node)) {
      if ((k === '.read' || k === '.write') && typeof v === 'string') assert.ok(v.includes("auth.token.firebase.sign_in_provider !== 'anonymous'"), path + '/' + k);
      else if (k === '.read' || k === '.write') assert.fail(path + '/' + k + ' must be an expression');
      else if (v && typeof v === 'object') walk(v, path + '/' + k);
    }
  };
  walk(rules.rules, '');
  assert.equal(rules.rules['.read'], undefined); assert.equal(rules.rules['.write'], undefined);
});

test('docs: the robust iOS sign-in option is described', () => {
  const doc = read('docs/auth-ios.md');
  assert.match(doc, /swgvanderelst\.github\.io/);
  assert.match(doc, /__\/auth/);
  assert.match(doc, /authDomain/);
});

test('a Firebase permission error maps to "denied" whatever its shape (code PERMISSION_DENIED or message "Permission denied")', () => {
  const fb = read('store-firebase.js');
  const m = /(\/permission\[_ \]denied\/i)\.test\(String\(e && e\.code\) \+ " " \+ String\(e && e\.message\)\)/.exec(fb);
  assert.ok(m, 'the wrap() test');
  const re = /permission[_ ]denied/i;
  for (const e of [{ code: 'PERMISSION_DENIED' }, { message: 'Permission denied' }, { code: 'permission_denied', message: 'x' }]) assert.ok(re.test(String(e.code) + ' ' + String(e.message)));
  assert.ok(!re.test('undefined Network request failed'));
});
