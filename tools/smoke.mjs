// Browser smoke test (needs Edge): sign in, swipe both decks (drag + buttons + undo), profile, routes with 3 options and map pins, group invite and combine.
// Runs against the dev server with the fixture data (?dest=test/fixtures/destination.json), or with the real catalog when REAL=1.
// Screenshots go to SHOTS (default: <repo>/shots). Usage: node tools/smoke.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../dev-server.mjs';
import { launchEdge } from './edge.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHOTS = process.env.SHOTS || path.join(ROOT, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const DEST = process.env.REAL === '1' ? '' : 'dest=test/fixtures/destination.json&';
const srv = await startServer({ port: 0 });
const base = `http://localhost:${srv.port}`;
const { browser, close } = await launchEdge();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const errors = [];
const click = (page, sel) => page.evaluate(s => document.querySelector(s).click(), sel);
const text = (page, sel) => page.$eval(sel, e => e.textContent);
const shot = (page, name) => page.screenshot({ path: path.join(SHOTS, name + '.png') });

async function phone(query) {
  const ctx = await browser.createBrowserContext(); // separate storage per person
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !(m.text().includes('status of 403') && (m.location().url || '').includes('/api/'))) errors.push('console: ' + m.text() + ' ' + (m.location().url || '')); });
  page.on('response', r => { if (r.status() >= 400 && !r.url().includes('/api/') && !r.url().includes('catalog-') && !r.url().includes('swipe-deck')) errors.push('http ' + r.status() + ' ' + r.url()); });
  await page.goto(base + '/?' + DEST + query, { waitUntil: 'domcontentloaded' });
  return page;
}
const count = async page => { const t = await text(page, '#dcnt'); return +/^(\d+) van/.exec(t)[1]; };
async function waitCount(page, n) { await page.waitForFunction(n => { const e = document.getElementById('dcnt'); return e && e.textContent.startsWith(n + ' van'); }, { timeout: 5000 }, n); }
async function drag(page, dx, dy) { // drag the top card with the mouse (pointer events)
  const box = await (await page.$('.swcard[data-pos="0"]')).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) { await page.mouse.move(x + dx * i / 8, y + dy * i / 8); await sleep(16); }
  await page.mouse.up();
}
const getUser = uid => srv.db().users[uid];

try {
  // ================= Anna: sign in, decks, profile, routes =================
  const anna = await phone('devname=Anna');
  await anna.waitForSelector('[data-a=google]', { timeout: 9000 });
  await shot(anna, '01-login');
  await click(anna, '[data-a=google]');
  await anna.waitForSelector('[data-a=start]');
  assert.match(await text(anna, '#root'), /Hoi Anna/);
  await shot(anna, '02-intro');
  await click(anna, '[data-a=start]');
  await anna.waitForSelector('.swcard[data-pos="0"]');
  assert.equal(await count(anna), 0);
  assert.equal(await anna.$eval('#dskip', e => e.hidden), true, 'skip is hidden before 10 cards');

  // drag right = like, drag left = nope, drag up = super, short drag = springs back
  await drag(anna, 40, 0); await sleep(600);
  assert.equal(await count(anna), 0, 'a short drag springs back');
  await drag(anna, 220, 10); await waitCount(anna, 1);
  await drag(anna, -220, 10); await waitCount(anna, 2);
  await drag(anna, 10, -260); await waitCount(anna, 3);
  const ids = await anna.evaluate(() => 0); void ids;
  await shot(anna, '03-deck-after-drags');
  // reload in the middle of the deck: the person resumes at the same card
  await sleep(1000);
  await anna.reload({ waitUntil: 'domcontentloaded' });
  await anna.waitForSelector('.swcard[data-pos="0"]', { timeout: 9000 });
  assert.equal(await count(anna), 3, 'resumes after a reload');
  // buttons + undo
  await click(anna, '[data-a=like]'); await waitCount(anna, 4);
  await click(anna, '[data-a=undo]'); await waitCount(anna, 3);
  assert.equal(await anna.$eval('#bundo', e => e.disabled), true, 'nothing left to undo after the undo');
  await click(anna, '[data-a=like]'); await waitCount(anna, 4);
  await click(anna, '[data-a=nope]'); await waitCount(anna, 5);
  await click(anna, '[data-a=super]'); await waitCount(anna, 6);
  for (let n = 7; n <= 10; n++) { await click(anna, n % 3 ? '[data-a=like]' : '[data-a=nope]'); await waitCount(anna, n); }
  assert.equal(await anna.$eval('#dskip', e => e.hidden), false, 'skip appears after 10 cards');
  for (let n = 11; n <= 24; n++) { await click(anna, n % 4 ? '[data-a=like]' : '[data-a=nope]'); await waitCount(anna, n); }
  await click(anna, '[data-a=like]'); // the last card: the deck turns into the interstitial
  await anna.waitForSelector('[data-a=next-deck]');
  assert.match(await text(anna, '#root'), /Accommodaties klaar/);
  await shot(anna, '04-interstitial');
  await sleep(1200); // debounce, then the server has the swipes
  const aUid = Object.keys(srv.db().users)[0];
  const sw = getUser(aUid).swipes;
  assert.equal(Object.keys(sw).length, 25);
  assert.ok(Object.values(sw).every(v => [-1, 1, 2].includes(v)));
  assert.ok(Object.values(sw).includes(2) && Object.values(sw).includes(-1));
  assert.equal(getUser(aUid).name, 'Anna');

  // activities: 12 cards then skip
  await click(anna, '[data-a=next-deck]');
  await anna.waitForSelector('.swcard[data-pos="0"]');
  assert.match(await text(anna, '.kick'), /Activiteiten/);
  for (let n = 1; n <= 12; n++) { await click(anna, n % 3 ? '[data-a=like]' : '[data-a=nope]'); await waitCount(anna, n); }
  await shot(anna, '05-activities');
  await click(anna, '[data-a=skip]');
  await anna.waitForSelector('[data-a=next-deck]');
  // onboarding preferences after the decks: airco needed, budget up to three euro signs
  await anna.waitForSelector('#prefs');
  await shot(anna, '05b-onboarding-prefs');
  await click(anna, '[data-a=pref][data-k=airco]'); await click(anna, '[data-a=budget][data-v="3"]'); await sleep(1300);
  assert.deepEqual(getUser(aUid).prefs, { airco: true, budget: 3 }, 'preferences are saved in the user record');
  await click(anna, '[data-a=next-deck]');
  await anna.waitForSelector('.sentence');
  assert.match(await text(anna, '.sentence'), /Jij houdt van/);
  await shot(anna, '06-profile');
  assert.ok((await anna.$$('.trow')).length >= 3);
  // profile correction: flip the first liked tag to 'liever niet', add a tag from the list, preferences are on the screen
  assert.equal((await anna.$$('#prefs .switch')).length, 3);
  const firstTag = await anna.$eval('.trow', e => e.dataset.tag);
  await click(anna, '.trow'); await anna.waitForSelector('#sheet.on [data-a=tagset]');
  await click(anna, '[data-a=tagset][data-v="-1"]'); await sleep(1300);
  assert.equal(getUser(aUid).overrides[firstTag], -1, 'the override is stored');
  assert.match(await text(anna, '#rootscroll'), /door jou aangepast/);
  await click(anna, '[data-a=taglist]'); await anna.waitForSelector('#sheet.on .chip[data-tag="pool"]');
  await click(anna, '#sheet .chip[data-tag="pool"]'); await anna.waitForSelector('[data-a=tagset]');
  await click(anna, '[data-a=tagset][data-v="1"]'); await sleep(1300);
  assert.equal(getUser(aUid).overrides.pool, 1);
  // the name in groups: the Google first name by default, editable in the profile
  assert.match(await anna.$eval('#dname', e => e.value), /^Anna$/);
  await anna.$eval('#dname', e => { e.value = 'Anni'; }); await click(anna, '[data-a=setname]'); await sleep(1300);
  assert.equal(getUser(aUid).name, 'Anni', 'the chosen name is saved');
  await shot(anna, '06b-profile-overrides');

  // routes: 7 ranked, best first
  await click(anna, '[data-tab=routes]');
  await anna.waitForSelector('.rcard');
  const cards = await anna.$$eval('.rcard', els => els.map(e => ({ id: e.dataset.id, pct: (/(\d+)%/.exec(e.textContent) || [0, null])[1] })));
  assert.equal(cards.length, 7);
  assert.match(await text(anna, '#routelist'), /Aanbevolen voor jou[^]*Alternatieven/);
  assert.equal((await anna.$$('#routelist .rcard.best')).length, 1, 'one clearly recommended route');
  assert.match(await text(anna, '#routelist .rcard'), /aanbevolen/);
  const shown = cards.map(c => (c.pct === null ? -1 : +c.pct));
  assert.deepEqual(shown, shown.slice().sort((a, b) => b - a), 'percentages follow the order (minder passend last)');
  await shot(anna, '07-routes');
  await click(anna, '.rcard');
  await anna.waitForSelector('.stopcard');
  assert.ok((await anna.$$('.stopcard')).length >= 2);
  await sleep(500); await shot(anna, '08-route-detail');
  await click(anna, '#offlinebtn');
  await anna.waitForFunction(() => /Offline beschikbaar|mislukt/.test(document.getElementById('offlinebtn').textContent), { timeout: 20000 });
  assert.match(await text(anna, '#offlinebtn'), /Offline beschikbaar/, 'the route images were fetched');
  await click(anna, '.stopcard');
  await anna.waitForSelector('.acc');
  assert.equal((await anna.$$('.acc')).length, 3, '3 accommodation options per stop');
  for (const h of await anna.$$eval('.acc .links a[href*="google.com/maps/search"]', els => els.map(e => e.href))) assert.match(h, /^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=.+Corse$/);
  assert.equal((await anna.$$('.acc .links a[href*="google.com/maps"]')).length, 3, 'every stay links to Google Maps');
  await click(anna, '.acc .whybtn'); await sleep(100);
  assert.match(await anna.$eval('.acc .whytxt', e => e.textContent), /Past bij|Nog weinig/);
  await anna.waitForSelector('.pin[data-act]', { timeout: 15000 }); // Leaflet from cdnjs + OSM tiles
  const pins = await anna.$$eval('.pin[data-act]', e => e.length);
  assert.ok(pins >= (process.env.REAL === '1' ? 5 : 1) && pins === (await anna.$$('.actrow')).length, 'a pin per listed activity');
  assert.match(await text(anna, '.actrow'), /min rijden/);
  assert.match(await text(anna, '#must'), /Airco: [0-9] van [0-9] bevestigd/);
  for (const b of await anna.$$eval('.acc', els => els.map(e => e.querySelector('.badges').textContent))) assert.match(b, /Airco|airco onbekend|geen airco/, 'airco is required: every stay shows a badge or a warning');
  await anna.$eval('.acc', e => e.scrollIntoView()); await sleep(300);
  await shot(anna, '09-stop-stays');
  await anna.$eval('#stopmap', e => e.scrollIntoView()); await sleep(1500);
  await shot(anna, '10-stop-map');
  assert.match(await text(anna, '.leaflet-control-attribution'), /OpenStreetMap/);
  await click(anna, '[data-a=back]'); await sleep(500); await click(anna, '[data-a=back]'); await sleep(500);

  // ================= groups: Anna creates, Bob joins by link =================
  await click(anna, '[data-tab=groups]');
  await click(anna, '[data-a=group-new]');
  await anna.waitForSelector('#gname');
  await anna.$eval('#gname', e => { e.value = 'Zomer 2027'; });
  await click(anna, '[data-a=group-create]');
  await anna.waitForSelector('#glink', { timeout: 6000 });
  const link = await text(anna, '#glink');
  assert.match(link, /\?g=[A-Za-z0-9]{12}$/);
  await sleep(600); await shot(anna, '11-group');
  await sleep(800);

  const bob = await phone('devuid=bob&devname=Bob&' + link.split('?')[1]);
  await bob.waitForSelector('#sheet.on', { timeout: 9000 });
  assert.match(await text(bob, '#sheetBody'), /Meedoen met Zomer 2027/);
  await sleep(600); await shot(bob, '12-join');
  await click(bob, '[data-a=join-yes]');
  await sleep(1200);
  const gid = Object.keys(srv.db().groups)[0];
  assert.equal(Object.keys(srv.db().groups[gid].members).length, 2);
  await click(bob, '[data-a=start]');
  await bob.waitForSelector('.swcard[data-pos="0"]');
  for (let n = 1; n <= 10; n++) { await click(bob, n % 2 ? '[data-a=nope]' : '[data-a=like]'); await waitCount(bob, n); }
  await click(bob, '[data-a=skip]'); await bob.waitForSelector('[data-a=next-deck]');
  await click(bob, '[data-a=next-deck]'); await bob.waitForSelector('.swcard[data-pos="0"]');
  for (let n = 1; n <= 10; n++) { await click(bob, n % 2 ? '[data-a=like]' : '[data-a=nope]'); await waitCount(bob, n); }
  await click(bob, '[data-a=skip]'); await bob.waitForSelector('[data-a=next-deck]'); await click(bob, '[data-a=next-deck]');
  await bob.waitForSelector('.sentence');
  await sleep(1800);
  const profiles = srv.db().groups[gid].profiles;
  assert.equal(Object.keys(profiles).length, 2, 'both members wrote a profile summary');
  assert.ok(Object.values(profiles).every(p => p.n > 0 && Object.keys(p.w).length > 0));

  // Anna sees Bob's summary, combines, toggles Bob off and on
  await click(anna, '[data-a=back]').catch(() => {});
  await sleep(300);
  await anna.waitForFunction(() => document.getElementById('members') && document.querySelectorAll('#members .row').length === 2, { timeout: 6000 }).catch(async () => {
    await click(anna, '[data-tab=groups]'); await click(anna, '[data-a=group-open]');
  });
  await anna.waitForSelector('#members .row');
  assert.match(await text(anna, '#members'), /Bob/);
  assert.match(await text(anna, '#combined'), /2 profielen/);
  await click(anna, '[data-a=group-toggle][data-uid]:not([data-uid="' + aUid + '"])'); await sleep(300);
  assert.match(await text(anna, '#combined'), /1 profiel\)/);
  await click(anna, '[data-a=group-toggle][data-uid]:not([data-uid="' + aUid + '"])'); await sleep(300);
  assert.match(await text(anna, '#combined'), /2 profielen/);
  await click(anna, '[data-a=group-use]'); await anna.waitForSelector('#routelist');
  assert.match(await text(anna, '#root'), /Gerangschikt voor groep Zomer 2027 \(2 profielen\)/);
  await shot(anna, '13-group-routes');
  const groupOrder = await anna.$$eval('.rcard', els => els.map(e => e.dataset.id));
  assert.equal(groupOrder.length, 7);

  // Bob is not the owner: no kick buttons, can leave
  await click(bob, '[data-tab=groups]'); await click(bob, '[data-a=group-open]');
  await bob.waitForSelector('#members .row');
  assert.equal(await bob.$('[data-a=group-kick]'), null);
  await click(bob, '[data-a=group-leave]'); await click(bob, '[data-a=group-leave-yes]'); await sleep(1200);
  assert.equal(Object.keys(srv.db().groups[gid].members).length, 1);
  assert.equal(srv.db().groups[gid].profiles && Object.keys(srv.db().groups[gid].profiles).length, 1, 'the leaving member took their profile away');


  // ================= owner tools: new link, remove a member; profile tools: more cards, re-swipe, credits, sign out =================
  const oldCode = Object.keys(srv.db().groups[gid].codes)[0];
  await click(anna, '[data-tab=groups]'); await click(anna, '[data-a=group-open]');
  await anna.waitForSelector('[data-a=group-rotate]');
  await click(anna, '[data-a=group-rotate]');
  await anna.waitForFunction(old => !document.getElementById('glink').textContent.includes(old), { timeout: 6000 }, oldCode);
  const codes = Object.keys(srv.db().groups[gid].codes);
  assert.equal(codes.length, 1); assert.notEqual(codes[0], oldCode);
  assert.equal(srv.db().codes[oldCode], undefined, 'the old link is switched off in the same write');
  const link2 = await text(anna, '#glink');
  const bob2 = await phone('devuid=bob2&devname=Bobby&' + link2.split('?')[1]);
  await bob2.waitForSelector('#sheet.on', { timeout: 9000 });
  await click(bob2, '[data-a=join-yes]'); await sleep(1200);
  assert.equal(Object.keys(srv.db().groups[gid].members).length, 2);
  await anna.waitForSelector('[data-a=group-kick]', { timeout: 6000 });
  await click(anna, '[data-a=group-kick]'); await sleep(1000);
  assert.equal(Object.keys(srv.db().groups[gid].members).length, 1, 'the owner removed the member');
  // no ghost group on the removed member's phone, and the link no longer lets them back in
  await sleep(800);
  assert.deepEqual(JSON.parse(await bob2.evaluate(() => localStorage.getItem('corsica_groups_bob2'))), [], 'the removed member drops the group from the list');
  await bob2.goto(base + '/?' + DEST + 'devuid=bob2&devname=Bobby&' + link2.split('?')[1], { waitUntil: 'domcontentloaded' });
  await bob2.waitForSelector('#sheet.on', { timeout: 9000 });
  await click(bob2, '[data-a=join-yes]'); await sleep(1000);
  assert.match(await text(bob2, '#toast'), /Meedoen lukt niet/);
  assert.equal(Object.keys(srv.db().groups[gid].members).length, 1, 'banned: a valid link does not help');
  assert.ok(srv.db().groups[gid].banned, 'the ban is recorded');
  // the owner deletes the group together with its codes
  await click(anna, '[data-a=group-delete]'); await click(anna, '[data-a=group-delete-yes]'); await sleep(1200);
  assert.equal(srv.db().groups[gid], undefined); assert.deepEqual(Object.keys(srv.db().codes), [], 'its codes went with it');
  await anna.waitForSelector('[data-a=group-new]');

  await click(anna, '[data-tab=profile]'); await anna.waitForSelector('[data-a=more]');
  await click(anna, '[data-a=more]');
  await anna.waitForSelector('.swcard[data-pos="0"]');
  assert.match(await text(anna, '.kick'), /Extra kaarten/);
  const before = Object.keys(getUser(aUid).swipes).length;
  await click(anna, '[data-a=like]'); await waitCount(anna, 1);
  await click(anna, '[data-a=nope]'); await waitCount(anna, 2);
  await click(anna, '[data-a=skip]'); // "Klaar"
  await anna.waitForSelector('.sentence');
  await sleep(1200);
  assert.equal(Object.keys(getUser(aUid).swipes).length, before + 2, 'extra cards are saved');
  await click(anna, '[data-a=reswipe][data-kind=acc]');
  await anna.waitForSelector('[data-a=reswipe-yes]');
  await click(anna, '[data-a=reswipe-yes]');
  await anna.waitForSelector('.swcard[data-pos="0"]');
  assert.equal(await count(anna), 0, 're-swipe starts at 0');
  await click(anna, '[data-a=deck-close]'); await anna.waitForSelector('.sentence'); await sleep(1200);
  assert.ok(Object.keys(getUser(aUid).swipes).length < before, 'the old accommodation swipes are gone');
  await click(anna, '[data-a=credits]'); await anna.waitForSelector('#sheet.on');
  assert.match(await text(anna, '#sheetBody'), /Fotocredits/);
  await click(anna, '[data-a=sheet-close]'); await sleep(400);
  await click(anna, '[data-a=signout]');
  await anna.waitForSelector('[data-a=google]');
  assert.ok(getUser(aUid).swipes, 'swipes were saved before signing out');

  // ================= a hostile destination renders no element and runs nothing =================
  {
    const foreign = [];
    const ctx = await browser.createBrowserContext();
    const evil = await ctx.newPage();
    await evil.setViewport({ width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    evil.on('pageerror', e => errors.push('pageerror: ' + e.message));
    evil.on('request', r => { if (!r.url().startsWith(base)) foreign.push(r.url()); });
    const deckIds = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/fixtures/deck.json'), 'utf8'));
    const sw = Object.fromEntries([...deckIds.accommodations, ...deckIds.activities].map((c, i) => [c.id, i % 3 ? 1 : -1]));
    await evil.goto(base + '/?devuid=evil1&devname=Evil&dest=test/fixtures/evil-destination.json', { waitUntil: 'domcontentloaded' });
    await sleep(1500);
    await evil.evaluate(s => localStorage.setItem('corsica_swipes_evil1', JSON.stringify(s)), sw);
    await evil.reload({ waitUntil: 'domcontentloaded' });
    await evil.waitForSelector('.rcard', { timeout: 9000 });
    assert.equal(await evil.$('img[src="x"]'), null, 'no injected <img>');
    assert.equal(await evil.$('svg[onload]'), null);
    assert.equal(await evil.evaluate(() => window.__pwned), undefined, 'no injected script ran');
    assert.deepEqual(await evil.$$eval('.rcard', els => els.map(e => e.dataset.id)), ['a'], 'only the route with a safe id survives');
    assert.doesNotMatch(await evil.$eval('#root', e => e.innerHTML), /<img src=x|<svg onload/i, 'markup in titles and numbers is text');
    await evil.$eval('.rcard', e => e.click());
    await evil.waitForSelector('.stopcard');
    assert.equal(await evil.$('img[src="x"]'), null);
    assert.equal(await evil.evaluate(() => window.__pwned), undefined);
    assert.doesNotMatch(await evil.$eval('#pushed', e => e.innerHTML), /<img src=x|<svg onload/i);
    assert.deepEqual(foreign, [], 'no request to a foreign origin');
    // ?dest with a foreign or odd path is ignored (the real destination loads); the app never fetches it
    await evil.goto(base + '/?devuid=evil1&dest=//evil.example/d.json', { waitUntil: 'domcontentloaded' });
    await evil.waitForSelector('.swcard[data-pos="0"]', { timeout: 9000 }); // the real destination: its deck is unswiped for this person
    assert.match(await evil.$eval('#dcnt', e => e.textContent), /^0 van 25/);
    for (const bad of ['../package.json', 'destinations/../package.json', 'http://evil.example/x.json', 'test/fixtures/x.html']) {
      await evil.goto(base + '/?devuid=evil1&dest=' + encodeURIComponent(bad), { waitUntil: 'domcontentloaded' });
      await evil.waitForSelector('#root > *', { timeout: 9000 });
    }
    assert.deepEqual(foreign, [], 'still no foreign request');
    await ctx.close();
  }

  assert.deepEqual(errors, [], 'no console / page errors');
  console.log('smoke OK: screenshots in', SHOTS);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally { await close(); await srv.close(); }
