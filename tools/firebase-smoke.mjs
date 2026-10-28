// Smoke test of the Firebase rules, two modes.
//
//   node tools/firebase-smoke.mjs         REAL Firebase (rules deployed, firebase-config.js filled in, Anonymous sign-in enabled in Auth).
//        The production rules refuse anonymous users for every read and write, so this only proves that: an anonymous
//        test user is DENIED everywhere (own record, creating a group, reading an invite preview). Real Google users cannot be
//        automated; the full flows below are tested through the dev server, which mirrors the rules (test/parity.test.js).
//   node tools/firebase-smoke.mjs --dev   dev adapter (dev-server.mjs): the full multi-user flows through the real store interface.
//
// Needs Edge. A throwaway static server serves the page; ?prod=1&test=1 forces Firebase on localhost (anonymous test sign-in).
// Each "phone" is its own browser context, so each gets its own identity. The real mode creates nothing (everything is denied).
import assert from 'node:assert/strict';
import { startServer } from '../dev-server.mjs';
import { launchEdge } from './edge.mjs';

const DEV = process.argv.includes('--dev');
const srv = await startServer({ port: 0 });
const base = `http://localhost:${srv.port}`;
const { browser, close } = await launchEdge();
const logs = [];
async function phone() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await page.goto(`${base}/?${DEV ? '' : 'prod=1&'}test=1&dest=test/fixtures/destination.json`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('[data-a=google]'), { timeout: 20000 });
  return page;
}
// run a store call in the page: {ok, v} or {ok: false, code}
const call = (page, src, arg) => page.evaluate(async (src, arg) => {
  const { store } = await import('/store.js');
  try { return { ok: true, v: await new Function('store', 'arg', 'return (async () => (' + src + '))()')(store, arg) }; } catch (e) { return { ok: false, code: e.code || String(e) }; }
}, src, arg);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms, what) => { const t0 = Date.now(); for (;;) { if (await fn()) return; if (Date.now() - t0 > ms) throw new Error('timeout: ' + what); await sleep(250); } };
const results = [];
const step = async (name, fn) => { try { await fn(); results.push(['ok', name]); console.log('ok  ', name); } catch (e) { results.push(['FAIL', name, e.message]); console.log('FAIL', name, '-', e.message); } };
const expectOk = r => { assert.equal(r.ok, true, JSON.stringify(r)); return r.v; };
const expectDenied = (r, what) => assert.deepEqual([r.ok, r.code], [false, 'denied'], what + ' -> ' + JSON.stringify(r));

try {
  const A = await phone(), B = await phone(), C = await phone();
  const ids = {};
  const rnd = n => Array.from({ length: n }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  const gid = 'smoke' + rnd(10), code = 'Smoke' + rnd(10);

  await step('anonymous test sign-in', async () => {
    for (const [k, P] of [['a', A], ['b', B], ['c', C]]) {
      expectOk(await call(P, 'store.auth.signInAnonymous()'));
      ids[k] = expectOk(await call(P, 'store.auth.user.uid'));
      assert.match(ids[k], /^[-_A-Za-z0-9]{1,32}$/);
    }
  });

  if (!DEV) {
    await step('production: an anonymous user is denied everywhere', async () => {
      expectDenied(await call(A, 'store.saveUser({ name: "Anna", swipes: { c1: 1 } })'), 'write own record');
      expectDenied(await call(A, 'store.getUser()'), 'read own record');
      expectDenied(await call(A, 'store.createGroup(arg)', { id: gid, name: 'smoke-test', memberName: 'Anna', codes: [code] }), 'create a group');
      expectDenied(await call(B, 'store.resolveCode(arg)', code), 'read an invite preview');
      expectDenied(await call(B, 'store.join(arg.gid, "Bob", arg.code)', { gid, code }), 'join');
    });
  } else {
    await step('own user record: write and read back; unknown swipe values are rejected', async () => {
      expectOk(await call(A, 'store.saveUser({ name: "Anna", swipes: { c1: 1, c2: -1, c3: 2 }, overrides: { pool: 1 }, prefs: { airco: true, budget: 3 }, groups: {} })'));
      const u = expectOk(await call(A, 'store.getUser()'));
      assert.deepEqual(u.swipes, { c1: 1, c2: -1, c3: 2 }); assert.deepEqual(u.prefs, { airco: true, budget: 3 });
      assert.equal((await call(A, 'store.saveUser({ name: "Anna", swipes: { c1: 3 } })')).ok, false, 'swipe value 3 must be refused');
    });

    await step('A creates a group with an invite; B sees only the preview, then joins with the token', async () => {
      expectOk(await call(A, 'store.createGroup(arg)', { id: gid, name: 'smoke-test', memberName: 'Anna', codes: [code] }));
      const prev = expectOk(await call(B, 'store.resolveCode(arg)', code));
      assert.deepEqual(prev, { gid, name: 'smoke-test' });
      assert.equal(expectOk(await call(B, 'store.fetchGroup(arg)', gid)), null, 'the group itself is not readable before joining');
      expectDenied(await call(B, 'store.join(arg.gid, "Bob", "NoSuchToken01")', { gid }), 'join without a valid token');
      expectDenied(await call(B, 'store.join(arg.gid, "Bob", "owner")', { gid }), 'join claiming to be the owner');
      expectOk(await call(B, 'store.join(arg.gid, "Bob", arg.code)', { gid, code }));
      const g = expectOk(await call(A, 'store.fetchGroup(arg)', gid));
      assert.deepEqual(Object.keys(g.members).sort(), [ids.a, ids.b].sort());
      assert.equal(g.members[ids.b].via, code);
    });

    await step('profiles (with preferences): each member writes their own; live updates reach the other phone', async () => {
      const p = { w: { pool: 0.5, beach: -0.25 }, c: { pool: 1, beach: 2 }, n: 3, prefs: { airco: true, budget: 2 } };
      expectOk(await call(A, 'store.setProfile(arg.gid, arg.p)', { gid, p }));
      expectOk(await call(B, 'store.setProfile(arg.gid, arg.p)', { gid, p: { ...p, n: 4 } }));
      const g = expectOk(await call(A, 'store.fetchGroup(arg)', gid));
      assert.equal(g.profiles[ids.a].n, 3); assert.equal(g.profiles[ids.b].n, 4); assert.deepEqual(g.profiles[ids.a].prefs, { airco: true, budget: 2 });
      expectOk(await call(B, '(() => { window.__seen = []; window.__off = store.watchGroup(arg.gid, g => window.__seen.push(g && g.profiles && g.profiles[arg.a] && g.profiles[arg.a].n)); return true; })()', { gid, a: ids.a }));
      expectOk(await call(A, 'store.setProfile(arg.gid, arg.p)', { gid, p: { ...p, n: 9 } }));
      await waitFor(() => B.evaluate(() => window.__seen.includes(9)), 15000, 'B sees the new profile live');
      await B.evaluate(() => window.__off());
    });

    await step('B is denied: rename, new link, deleting A\'s profile, removing A, deleting the group; the owner cannot leave', async () => {
      expectDenied(await call(B, 'store.renameGroup(arg.gid, "Hack", [arg.c])', { gid, c: code }), 'rename');
      expectDenied(await call(B, 'store.addCode(arg.gid, arg.c, "smoke-test")', { gid, c: 'Hack' + rnd(10) }), 'addCode');
      expectDenied(await call(B, 'store.deleteProfile(arg.gid, arg.a)', { gid, a: ids.a }), 'delete A profile');
      expectDenied(await call(B, 'store.removeMember(arg.gid, arg.a)', { gid, a: ids.a }), 'remove A');
      expectDenied(await call(B, 'store.deleteGroup(arg.gid, [arg.c])', { gid, c: code }), 'delete the group');
      expectDenied(await call(A, 'store.removeMember(arg.gid, arg.a)', { gid, a: ids.a }), 'the owner cannot leave');
    });

    await step('a stranger C: cannot read the group, cannot join without the token, cannot write a profile', async () => {
      assert.equal(expectOk(await call(C, 'store.fetchGroup(arg)', gid)), null);
      expectDenied(await call(C, 'store.setProfile(arg.gid, arg.p)', { gid, p: { w: { pool: 1 }, c: { pool: 1 }, n: 1 } }), 'profile without membership');
    });

    await step('owner removes B: B is out, cannot read, cannot rejoin with the old or a new link until the ban is lifted', async () => {
      expectOk(await call(A, 'store.renameGroup(arg.gid, "smoke-test 2", [arg.c])', { gid, c: code }));
      assert.equal(expectOk(await call(B, 'store.resolveCode(arg)', code)).name, 'smoke-test 2', 'the preview follows the rename');
      const code2 = 'Smoke' + rnd(10);
      expectOk(await call(A, 'store.rotateLink(arg.gid, arg.c, arg.old, "smoke-test 2")', { gid, c: code2, old: [code] }));
      assert.equal(expectOk(await call(B, 'store.resolveCode(arg)', code)), null, 'the old link is gone');
      expectOk(await call(A, 'store.removeMember(arg.gid, arg.b)', { gid, b: ids.b }));
      const g = expectOk(await call(A, 'store.fetchGroup(arg)', gid));
      assert.deepEqual(Object.keys(g.members), [ids.a]); assert.deepEqual(Object.keys(g.profiles), [ids.a]); assert.deepEqual(Object.keys(g.banned), [ids.b]);
      assert.equal(expectOk(await call(B, 'store.fetchGroup(arg)', gid)), null, 'read after removal is denied');
      expectDenied(await call(B, 'store.setProfile(arg.gid, arg.p)', { gid, p: { w: { pool: 1 }, c: { pool: 1 }, n: 1 } }), 'profile after removal');
      expectDenied(await call(B, 'store.join(arg.gid, "Bob", arg.c)', { gid, c: code2 }), 'rejoin with a valid new link after removal');
      expectOk(await call(A, 'store.unban(arg.gid, arg.b)', { gid, b: ids.b }));
      expectOk(await call(B, 'store.join(arg.gid, "Bob", arg.c)', { gid, c: code2 }));
      expectOk(await call(B, 'store.removeMember(arg.gid, arg.b)', { gid, b: ids.b })); // leaving is not a ban
      expectOk(await call(B, 'store.join(arg.gid, "Bob", arg.c)', { gid, c: code2 }));
    });

    await step('the owner deletes the group together with its codes', async () => {
      const g = expectOk(await call(A, 'store.fetchGroup(arg)', gid));
      expectOk(await call(A, 'store.deleteGroup(arg.gid, arg.codes)', { gid, codes: Object.keys(g.codes) }));
      assert.equal(expectOk(await call(A, 'store.fetchGroup(arg)', gid)), null);
      assert.equal(expectOk(await call(B, 'store.resolveCode(arg)', Object.keys(g.codes)[0])), null);
    });
  }

  console.log(logs.length ? 'page errors: ' + logs.join(' | ') : 'no page errors');
  const failed = results.filter(r => r[0] === 'FAIL');
  console.log(failed.length ? `${failed.length} step(s) failed` : `firebase smoke (${DEV ? 'dev adapter' : 'real Firebase'}): all steps ok`);
  process.exitCode = failed.length ? 1 : 0;
} finally { await close(); await srv.close(); }
