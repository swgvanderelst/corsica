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
  await anna.waitForSelector('[data-a=trip-new]'); // after the decks: the trips
  await click(anna, '[data-tab=profile]');
  await anna.waitForSelector('.sentence');
  assert.match(await text(anna, '.sentence'), /Jij houdt van/);
  await shot(anna, '06-profile');
  assert.ok((await anna.$$('.trow')).length >= 3);
  // profile correction: flip the first liked tag to 'liever niet', add a tag from the list, preferences are on the screen
  assert.equal((await anna.$$('#prefs .switch')).length, 2, 'airco and charger; kids follow from the travel party');
  const firstTag = await anna.$eval('.trow', e => e.dataset.tag);
  await click(anna, '.trow'); await anna.waitForSelector('#sheet.on [data-a=tagset]');
  await click(anna, '[data-a=tagset][data-v="-1"]'); await sleep(1300);
  assert.equal(getUser(aUid).overrides[firstTag], -1, 'the override is stored');
  assert.match(await text(anna, '#rootscroll'), /door jou aangepast/);
  await click(anna, '[data-a=taglist]'); await anna.waitForSelector('#sheet.on .chip[data-tag="pool"]');
  await click(anna, '#sheet .chip[data-tag="pool"]'); await anna.waitForSelector('[data-a=tagset]');
  await click(anna, '[data-a=tagset][data-v="1"]'); await sleep(1300);
  assert.equal(getUser(aUid).overrides.pool, 1);
  // the name in shared trips: the Google first name by default, editable in the profile
  assert.match(await anna.$eval('#dname', e => e.value), /^Anna$/);
  await anna.$eval('#dname', e => { e.value = 'Anni'; }); await click(anna, '[data-a=setname]'); await sleep(1300);
  assert.equal(getUser(aUid).name, 'Anni', 'the chosen name is saved');
  await shot(anna, '06b-profile-overrides');

  // ================= household in the profile: the default party of a new trip =================
  const typeIn = async (page, sel, value) => { await page.$eval(sel, e => { e.value = ''; }); await page.type(sel, value); };
  await click(anna, '[data-a=household]');
  await anna.waitForSelector('#people');
  await click(anna, '[data-a=wiz-del][data-i="0"]').catch(() => {}); // start from an empty household
  await click(anna, '[data-a=wiz-add]'); await anna.waitForSelector('#people [data-f=pname][data-i="0"]');
  await typeIn(anna, '#people [data-f=pname][data-i="0"]', 'Anna'); await typeIn(anna, '#people [data-f=pborn][data-i="0"]', '1985');
  await click(anna, '[data-a=wiz-add]'); await anna.waitForSelector('#people [data-f=pname][data-i="1"]');
  await typeIn(anna, '#people [data-f=pname][data-i="1"]', 'Mila'); await typeIn(anna, '#people [data-f=pborn][data-i="1"]', '1800');
  await click(anna, '[data-a=wiz-next]'); await sleep(300);
  assert.match(await text(anna, '#toast'), /geboortejaar/i, 'an impossible birth year is refused');
  await typeIn(anna, '#people [data-f=pborn][data-i="1"]', '2022');
  await click(anna, '[data-a=wiz-next]');
  await anna.waitForSelector('#household'); await sleep(1300);
  assert.deepEqual(getUser(aUid).household, { p0: { name: 'Anna', born: 1985 }, p1: { name: 'Mila', born: 2022 } }, 'the household is saved in the user record');
  assert.match(await text(anna, '#household'), /Anna, Mila \(\d\)/);

  // ================= a new trip: when, who, highlights =================
  await click(anna, '[data-tab=routes]');
  await anna.waitForSelector('[data-a=trip-new]');
  assert.match(await text(anna, '#rootscroll'), /Jouw reizen/);
  assert.equal(await anna.$('[data-tab=groups]'), null, 'no separate "Samen" tab any more');
  await click(anna, '[data-a=trip-new]');
  await anna.waitForSelector('#wiz [data-f=name]');
  await typeIn(anna, '#wiz [data-f=name]', 'Zomer 2027');
  const months = await anna.$$eval('[data-a=wiz-month]', els => els.map(e => e.dataset.m));
  await click(anna, `[data-a=wiz-month][data-m="${months[8]}"]`); await click(anna, `[data-a=wiz-month][data-m="${months[9]}"]`);
  assert.equal((await anna.$$('[data-a=wiz-month][aria-pressed=true]')).length, 2);
  for (let i = 0; i < 3; i++) await click(anna, '[data-a=wiz-n][data-d="-1"]');
  for (let i = 0; i < 3; i++) await click(anna, '[data-a=wiz-n][data-d="1"]');
  assert.equal(await text(anna, '#wnights'), '14');
  await sleep(400); await shot(anna, '07-trip-when');
  await click(anna, '[data-a=wiz-next]');
  await anna.waitForSelector('#people');
  assert.equal((await anna.$$('#people .person')).length, 2, 'the household is the default party');
  await sleep(400); await shot(anna, '07b-trip-who');
  await click(anna, '[data-a=wiz-next]');
  await anna.waitForSelector('.hltile');
  assert.ok((await anna.$$('.hltile')).length >= 30, 'the highlights of Corsica to choose from');
  for (const id of ['hl-calvi', 'hl-corte', 'hl-palombaggia']) await click(anna, `.hltile[data-id="${id}"]`);
  assert.match(await text(anna, '#hlcount'), /^3 gekozen/);
  await sleep(400); await shot(anna, '07c-trip-highlights');
  await click(anna, '[data-a=wiz-next]'); // "Maak reis"
  await anna.waitForSelector('#routelist .rcard', { timeout: 9000 });
  const gid = Object.keys(srv.db().groups)[0];
  const trip = srv.db().groups[gid].trip;
  assert.equal(srv.db().groups[gid].name, 'Zomer 2027');
  assert.equal(trip.nights, 14);
  assert.deepEqual(trip.months, [months[8], months[9]].sort().join(' '));
  assert.deepEqual(trip.party, { p0: { name: 'Anna', born: 1985 }, p1: { name: 'Mila', born: 2022 } });
  assert.deepEqual(trip.highlights.split(' ').sort(), ['hl-calvi', 'hl-corte', 'hl-palombaggia']);
  const cards = await anna.$$eval('#routelist > .rcard', els => els.map(e => ({ id: e.dataset.id, txt: e.textContent, pct: (/(\d+)%/.exec(e.textContent) || [0, null])[1] })));
  assert.equal(cards.length, 3, 'three proposals, more behind "toon alle"');
  assert.ok(cards.every(c => /14 nachten/.test(c.txt)), 'every proposal lasts exactly the trip');
  assert.equal((await anna.$$('#routelist .rcard.best')).length, 1, 'one clearly recommended route');
  const shown = cards.map(c => (c.pct === null ? -1 : +c.pct));
  assert.deepEqual(shown, shown.slice().sort((a, b) => b - a), 'percentages follow the order');
  assert.match(await text(anna, '#party'), /Anna, Mila \(5\)/);
  assert.match(await text(anna, '#hls'), /Calvi/);
  await sleep(400); await shot(anna, '07d-trip');

  // the recommended route: 15 days, the three highlights in it
  await click(anna, '#routelist .rcard.best');
  await anna.waitForSelector('#days .row.day');
  assert.equal((await anna.$$('#days .row.day')).length, 15, '14 nights = 15 days');
  const daysText = await text(anna, '#days');
  for (const name of ['Calvi', 'Corte', 'Palombaggia']) assert.match(daysText, new RegExp(name), `${name} is in the plan`);
  assert.equal(await anna.$('#unplaced'), null, 'every chosen highlight has a day');
  assert.equal((await anna.$$('#days .row.day.highlight')).length, 3);
  assert.match(daysText, /Dag 1[^]*Aankomst/); assert.match(daysText, /Terug naar de ferry/);
  await sleep(500); await shot(anna, '08-route-days');
  assert.ok((await anna.$$('.stopcard')).length >= 2);
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
  await anna.waitForSelector('#members');

  // ================= sharing: Bob opens the trip link, plans along =================
  const code = Object.keys(srv.db().groups[gid].codes)[0];
  assert.match(code, /^[A-Za-z0-9]{12}$/);
  await shot(anna, '11-trip-members');
  const bob = await phone('devuid=bob&devname=Bob&g=' + code);
  await bob.waitForSelector('#sheet.on', { timeout: 9000 });
  assert.match(await text(bob, '#sheetBody'), /Meeplannen met Zomer 2027/);
  await sleep(600); await shot(bob, '12-join');
  await click(bob, '[data-a=join-yes]');
  await sleep(1500);
  assert.equal(Object.keys(srv.db().groups[gid].members).length, 2);
  assert.deepEqual(srv.db().groups[gid].trip.party.p2, { name: 'Bob', uid: 'bob' }, 'Bob is added to the travel party');
  await click(bob, '[data-a=start]');
  await bob.waitForSelector('.swcard[data-pos="0"]');
  for (let n = 1; n <= 10; n++) { await click(bob, n % 2 ? '[data-a=nope]' : '[data-a=like]'); await waitCount(bob, n); }
  await click(bob, '[data-a=skip]'); await bob.waitForSelector('[data-a=next-deck]');
  await click(bob, '[data-a=next-deck]'); await bob.waitForSelector('.swcard[data-pos="0"]');
  for (let n = 1; n <= 10; n++) { await click(bob, n % 2 ? '[data-a=like]' : '[data-a=nope]'); await waitCount(bob, n); }
  await click(bob, '[data-a=skip]'); await bob.waitForSelector('[data-a=next-deck]'); await click(bob, '[data-a=next-deck]');
  await bob.waitForSelector('[data-a=trip-open]');
  await sleep(1800);
  const profiles = srv.db().groups[gid].profiles;
  assert.equal(Object.keys(profiles).length, 2, 'both members wrote a profile summary');
  assert.ok(Object.values(profiles).every(p => p.n > 0 && Object.keys(p.w).length > 0));

  // Bob edits the party (every member plans along); Anna sees it live
  await click(bob, '[data-a=trip-open]'); await bob.waitForSelector('[data-a=trip-edit][data-step=who]');
  assert.equal(await bob.$('[data-a=group-kick]'), null, 'only the maker removes people');
  await click(bob, '[data-a=trip-edit][data-step=who]'); await bob.waitForSelector('#people');
  await click(bob, '[data-a=wiz-add]'); await bob.waitForSelector('#people [data-f=pname][data-i="3"]');
  await typeIn(bob, '#people [data-f=pname][data-i="3"]', 'Oma');
  await click(bob, '[data-a=wiz-next]'); // "Bewaar"
  await anna.waitForFunction(() => /Oma/.test(document.getElementById('party').textContent), { timeout: 6000 });
  assert.equal(Object.keys(srv.db().groups[gid].trip.party).length, 4);
  // Anna: Bob in the members list, his taste can be switched off and on
  await anna.waitForFunction(() => document.querySelectorAll('#members .row').length === 2, { timeout: 6000 });
  assert.match(await text(anna, '#members'), /Bob/);
  const bobSwitch = '[data-a=group-toggle]:not([data-uid="' + aUid + '"])';
  await click(anna, bobSwitch); await sleep(300);
  assert.equal(await anna.$eval(bobSwitch, e => e.getAttribute('aria-checked')), 'false');
  await click(anna, bobSwitch); await sleep(300);
  assert.equal(await anna.$eval(bobSwitch, e => e.getAttribute('aria-checked')), 'true');
  await shot(anna, '13-trip-together');
  // Bob leaves
  await bob.waitForSelector('[data-a=group-leave]'); // after saving, Bob is back on the trip
  await click(bob, '[data-a=group-leave]'); await click(bob, '[data-a=group-leave-yes]'); await sleep(1200);
  assert.equal(Object.keys(srv.db().groups[gid].members).length, 1);
  assert.equal(srv.db().groups[gid].profiles && Object.keys(srv.db().groups[gid].profiles).length, 1, 'the leaving member took their profile away');

  // ================= owner tools: new link, remove a member, delete the trip =================
  const oldCode = code;
  await anna.waitForSelector('[data-a=group-rotate]');
  await click(anna, '[data-a=group-rotate]');
  await anna.waitForFunction(() => true); await sleep(1000);
  const codes = Object.keys(srv.db().groups[gid].codes);
  assert.equal(codes.length, 1); assert.notEqual(codes[0], oldCode);
  assert.equal(srv.db().codes[oldCode], undefined, 'the old link is switched off in the same write');
  const bob2 = await phone('devuid=bob2&devname=Bobby&g=' + codes[0]);
  await bob2.waitForSelector('#sheet.on', { timeout: 9000 });
  await click(bob2, '[data-a=join-yes]'); await sleep(1200);
  assert.equal(Object.keys(srv.db().groups[gid].members).length, 2);
  await anna.waitForSelector('[data-a=group-kick]', { timeout: 6000 });
  await click(anna, '[data-a=group-kick]'); await sleep(1000);
  assert.equal(Object.keys(srv.db().groups[gid].members).length, 1, 'the owner removed the member');
  // no ghost trip on the removed member's phone, and the link no longer lets them back in
  await sleep(800);
  assert.deepEqual(JSON.parse(await bob2.evaluate(() => localStorage.getItem('corsica_groups_bob2'))), [], 'the removed member drops the trip from the list');
  await bob2.goto(base + '/?' + DEST + 'devuid=bob2&devname=Bobby&g=' + codes[0], { waitUntil: 'domcontentloaded' });
  await bob2.waitForSelector('#sheet.on', { timeout: 9000 });
  await click(bob2, '[data-a=join-yes]'); await sleep(1000);
  assert.match(await text(bob2, '#toast'), /Meedoen lukt niet/);
  assert.equal(Object.keys(srv.db().groups[gid].members).length, 1, 'banned: a valid link does not help');
  assert.ok(srv.db().groups[gid].banned, 'the ban is recorded');
  await click(anna, '[data-a=group-delete]'); await click(anna, '[data-a=group-delete-yes]'); await sleep(1200);
  assert.equal(srv.db().groups[gid], undefined); assert.deepEqual(Object.keys(srv.db().codes), [], 'its codes went with it');
  await anna.waitForSelector('[data-a=trip-new]');


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
    await evil.waitForSelector('[data-a=trip-new]', { timeout: 9000 });
    await evil.$eval('[data-a=trip-new]', e => e.click()); await evil.waitForSelector('#wiz');
    await evil.$eval('[data-a=wiz-next]', e => e.click()); await evil.waitForSelector('#people');
    await evil.$eval('[data-a=wiz-next]', e => e.click()); await evil.waitForSelector('.hltile');
    assert.deepEqual(await evil.$$eval('.hltile', els => els.map(e => e.dataset.id)), ['hl-ok'], 'only the highlight with a safe id, a category and coordinates');
    assert.equal(await evil.$('img[src="x"]'), null, 'no injected <img> in the highlights');
    await evil.$eval('.hltile', e => e.click());
    await evil.$eval('[data-a=wiz-next]', e => e.click());
    await evil.waitForSelector('.rcard', { timeout: 9000 });
    assert.equal(await evil.$('img[src="x"]'), null, 'no injected <img>');
    assert.equal(await evil.$('svg[onload]'), null);
    assert.equal(await evil.evaluate(() => window.__pwned), undefined, 'no injected script ran');
    assert.deepEqual(await evil.$$eval('.rcard', els => els.map(e => e.dataset.id)), ['a'], 'only the route with a safe id survives');
    assert.doesNotMatch(await evil.$eval('#root', e => e.innerHTML), /<img src=x|<svg onload/i, 'markup in titles and numbers is text');
    await evil.$eval('.rcard', e => e.click());
    await evil.waitForSelector('.stopcard');
    assert.match(await evil.$eval('#days', e => e.textContent), /Calvi <img src=x/, 'the hostile highlight name is shown as text');
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
