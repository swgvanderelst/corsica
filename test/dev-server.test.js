import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer } from '../dev-server.mjs';

const NOW = 1_800_000_000_000;
async function withServer(opts, fn) {
  const srv = await startServer({ port: 0, now: () => NOW, ...opts });
  const base = `http://localhost:${srv.port}`;
  const login = async (uid, name) => {
    const r = await fetch(base + '/api/session', { method: 'POST', body: JSON.stringify({ ...(uid ? { uid } : {}), ...(name ? { name } : {}) }) });
    const s = await r.json();
    return { ...s, status: r.status, h: { 'x-uid': s.uid, 'x-secret': s.secret, 'content-type': 'application/json' } };
  };
  try { await fn({ srv, base, login }); } finally { await srv.close(); }
}

test('sessions: fake sign-in, unique uids, names validated', async () => {
  await withServer({}, async ({ base, login }) => {
    const a = await login('anna', 'Anna');
    assert.equal(a.status, 201); assert.equal(a.name, 'Anna');
    assert.equal((await login('anna')).status, 409);
    assert.equal((await login('bad uid!')).status, 400);
    assert.equal((await fetch(base + '/api/session', { method: 'POST', body: JSON.stringify({ name: '' }) })).status, 400);
    const r = await login();
    assert.match(r.uid, /^u-[0-9a-f]{16}$/); assert.match(r.name, /^Dev /);
    assert.equal((await fetch(base + '/api/me', { headers: a.h })).status, 200);
    assert.equal((await fetch(base + '/api/me', { headers: { ...a.h, 'x-secret': 'wrong' } })).status, 401);
    assert.equal((await fetch(base + '/api/me')).status, 401);
    assert.equal((await fetch(base + '/api/me', { headers: { 'x-uid': 'nobody', 'x-secret': 'x' } })).status, 401);
  });
});

test('users: own record, empty swipes do not exist, missing record reads as null', async () => {
  await withServer({}, async ({ base, login }) => {
    const a = await login('anna', 'Anna'), b = await login('bob', 'Bob');
    const put = (who, uid, body) => fetch(`${base}/api/users/${uid}`, { method: 'PUT', headers: who.h, body: JSON.stringify(body) });
    assert.equal(await (await fetch(base + '/api/users/anna', { headers: a.h })).json(), null);
    assert.equal((await put(a, 'anna', { name: 'Anna', swipes: { c1: 1, c2: -1 }, groups: { g1: true } })).status, 200);
    const u = await (await fetch(base + '/api/users/anna', { headers: a.h })).json();
    assert.deepEqual(u, { name: 'Anna', swipes: { c1: 1, c2: -1 }, groups: { g1: true }, updatedAt: NOW });
    assert.equal((await put(a, 'anna', { name: 'Anna', swipes: {}, groups: {} })).status, 200);
    assert.deepEqual(await (await fetch(base + '/api/users/anna', { headers: a.h })).json(), { name: 'Anna', updatedAt: NOW });
    assert.equal((await put(b, 'anna', { name: 'Hack' })).status, 403);
    assert.equal((await fetch(base + '/api/users/anna', { headers: b.h })).status, 403);
    assert.equal((await put(a, 'anna', 'nope')).status, 400);
    assert.equal((await fetch(base + '/api/users/anna', { method: 'DELETE', headers: a.h })).status, 404);
  });
});

test('groups: not listable, unknown routes 404, bad json and oversized bodies rejected', async () => {
  await withServer({}, async ({ base, login }) => {
    const a = await login('anna', 'Anna');
    assert.equal((await fetch(base + '/api/groups', { headers: a.h })).status, 404);
    assert.equal((await fetch(base + '/api/groups/nope', { headers: a.h })).status, 404);
    assert.equal((await fetch(base + '/api/codes/nope', { headers: a.h })).status, 404);
    assert.equal((await fetch(base + '/api/whatever', { headers: a.h })).status, 404);
    assert.equal((await fetch(base + '/api/groups', { method: 'POST', headers: a.h, body: '{bad' })).status, 400);
    assert.equal((await fetch(base + '/api/groups', { method: 'POST', headers: a.h, body: JSON.stringify({ id: 'g', name: 'N', memberName: 'x'.repeat(250000) }) }).catch(() => ({ status: 400 }))).status, 400);
    assert.equal((await fetch(base + '/api/groups', { method: 'POST', headers: a.h, body: JSON.stringify({ id: 'g', name: 'N', memberName: 'A', codes: ['TokAlpha0001', 'TokAlpha0001'] }) })).status, 400);
    assert.equal((await fetch(base + '/api/groups', { method: 'POST', headers: a.h, body: JSON.stringify({ id: 'g', name: 'N', memberName: 'A', extra: 1 }) })).status, 400);
    const ok = await fetch(base + '/api/groups', { method: 'POST', headers: a.h, body: JSON.stringify({ id: 'g', name: 'N', memberName: 'A', codes: ['TokAlpha0001'] }) });
    assert.equal(ok.status, 201);
    assert.deepEqual(await (await fetch(base + '/api/codes/TokAlpha0001', { headers: a.h })).json(), { groupId: 'g', name: 'N' });
    const g = await (await fetch(base + '/api/groups/g', { headers: a.h })).json();
    assert.deepEqual(g, { name: 'N', owner: 'anna', createdAt: NOW, members: { anna: { name: 'A', via: 'owner' } }, codes: { TokAlpha0001: NOW } });
    const b = await login('bob', 'Bob');
    assert.equal((await fetch(base + '/api/groups/g', { headers: b.h })).status, 403, 'a group is read by its members only');
  });
});

function sse(url, headers, onMessage) {
  return new Promise(resolve => {
    const req = http.get(url, { headers }, res => {
      res.setEncoding('utf8');
      res.on('data', chunk => { for (const m of chunk.matchAll(/^data: (.*)$/gm)) onMessage(JSON.parse(m[1])); });
      resolve(() => req.destroy());
    });
  });
}
test('SSE: members get the current state and every change; others are refused', async () => {
  await withServer({}, async ({ base, login }) => {
    const a = await login('anna', 'Anna'), b = await login('bob', 'Bob');
    await fetch(base + '/api/groups', { method: 'POST', headers: a.h, body: JSON.stringify({ id: 'g', name: 'N', memberName: 'A', codes: ['TokAlpha0001'] }) });
    assert.equal((await fetch(`${base}/api/groups/g/events?uid=bob&secret=${b.secret}`)).status, 403, 'not a member yet');
    assert.equal((await fetch(base + '/api/groups/g/members', { method: 'POST', headers: b.h, body: JSON.stringify({ name: 'Bob', via: 'NoSuchToken01' }) })).status, 403);
    await fetch(base + '/api/groups/g/members', { method: 'POST', headers: b.h, body: JSON.stringify({ name: 'Bob', via: 'TokAlpha0001' }) });
    const seen = [];
    const stop = await sse(`${base}/api/groups/g/events?uid=bob&secret=${b.secret}`, {}, m => seen.push(m));
    await new Promise(r => setTimeout(r, 150));
    assert.equal(seen.length, 1); assert.equal(seen[0].name, 'N'); assert.equal(seen[0].members.bob.name, 'Bob'); assert.equal(seen[0].members.bob.via, 'TokAlpha0001');
    await fetch(base + '/api/groups/g', { method: 'PATCH', headers: a.h, body: JSON.stringify({ name: 'Nieuw' }) });
    await new Promise(r => setTimeout(r, 150));
    assert.equal(seen.length, 2); assert.equal(seen[1].name, 'Nieuw');
    assert.equal((await (await fetch(base + '/api/codes/TokAlpha0001', { headers: a.h })).json()).name, 'Nieuw', 'the invite preview follows the rename');
    stop();
    assert.equal((await fetch(`${base}/api/groups/g/events?uid=bob&secret=wrong`)).status, 401); // SSE needs auth too
    // removed by the owner: the stream is refused, a rejoin too, until the ban is lifted
    await fetch(base + '/api/groups/g/members/uid-bob'.replace('uid-bob', 'bob'), { method: 'DELETE', headers: a.h });
    assert.equal((await fetch(`${base}/api/groups/g/events?uid=bob&secret=${b.secret}`)).status, 403);
    assert.equal((await fetch(base + '/api/groups/g/members', { method: 'POST', headers: b.h, body: JSON.stringify({ name: 'Bob', via: 'TokAlpha0001' }) })).status, 403);
    await fetch(base + '/api/groups/g/banned/bob', { method: 'DELETE', headers: a.h });
    assert.equal((await fetch(base + '/api/groups/g/members', { method: 'POST', headers: b.h, body: JSON.stringify({ name: 'Bob', via: 'TokAlpha0001' }) })).status, 201);
    // the owner deletes the group and its codes
    assert.equal((await fetch(base + '/api/groups/g', { method: 'DELETE', headers: b.h })).status, 403);
    assert.equal((await fetch(base + '/api/groups/g', { method: 'DELETE', headers: a.h })).status, 200);
    assert.equal((await fetch(base + '/api/codes/TokAlpha0001', { headers: a.h })).status, 404);
  });
});

test('static files: the app is served, internals and dotfiles are not', async () => {
  await withServer({}, async ({ base }) => {
    const get = p => fetch(base + p);
    assert.equal((await get('/')).status, 200);
    assert.match(await (await get('/')).text(), /<title>Corsica<\/title>/);
    assert.equal((await get('/app.js')).headers.get('content-type').startsWith('text/javascript'), true);
    assert.equal((await get('/destinations/corsica/places.json')).status, 200);
    assert.equal((await get('/test/fixtures/catalog.json')).status, 200, 'fixtures are served for the smoke test');
    for (const p of ['/dev-server.mjs', '/package.json', '/database.rules.json', '/scripts/gen-rules.mjs', '/tools/smoke.mjs', '/node_modules/puppeteer-core/package.json', '/test/logic.test.js', '/.git/config', '/legacy/data.js', '/%2e%2e/etc/passwd', '/missing.html']) assert.equal((await get(p)).status, 404, p);
    assert.equal((await get('/%E0%A4%A')).status, 400);
    assert.equal((await fetch(base + '/', { method: 'POST' })).status, 405);
  });
});

test('persistence: state survives a restart', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'corsica-dev-')), 'db.json');
  let secret;
  await withServer({ persistFile: file }, async ({ base, login }) => {
    const a = await login('anna', 'Anna'); secret = a.secret;
    await fetch(base + '/api/users/anna', { method: 'PUT', headers: a.h, body: JSON.stringify({ name: 'Anna', swipes: { c1: 1 } }) });
  });
  assert.ok(fs.existsSync(file));
  await withServer({ persistFile: file }, async ({ base }) => {
    const h = { 'x-uid': 'anna', 'x-secret': secret };
    assert.equal((await (await fetch(base + '/api/users/anna', { headers: h })).json()).swipes.c1, 1);
  });
  fs.writeFileSync(file, '{not json');
  await withServer({ persistFile: file }, async ({ base }) => { assert.equal((await fetch(base + '/api/me')).status, 401); }); // a corrupt file starts empty
});

test('users: overrides and prefs round-trip; empty ones do not exist', async () => {
  await withServer({}, async ({ base, login }) => {
    const a = await login('anna', 'Anna');
    const put = body => fetch(base + '/api/users/anna', { method: 'PUT', headers: a.h, body: JSON.stringify(body) });
    assert.equal((await put({ name: 'Anna', overrides: { pool: 1, camping: -1 }, prefs: { airco: true, budget: 2 } })).status, 200);
    const u = await (await fetch(base + '/api/users/anna', { headers: a.h })).json();
    assert.deepEqual(u.overrides, { pool: 1, camping: -1 }); assert.deepEqual(u.prefs, { airco: true, budget: 2 });
    assert.equal((await put({ name: 'Anna', overrides: {}, prefs: {} })).status, 200);
    const e = await (await fetch(base + '/api/users/anna', { headers: a.h })).json();
    assert.equal(e.overrides, undefined); assert.equal(e.prefs, undefined);
    assert.equal((await put({ name: 'Anna', prefs: 'x' })).status, 400);
  });
});
