// Differential test: the same scenario runs against dev-server.mjs (HTTP) and against
// database.rules.json (via the mini rules evaluator). Both must allow/deny identically,
// and both must match the hand-written expectation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../dev-server.mjs';
import { loadRules, checkUpdate, checkRead } from './rules-eval.js';

const NOW = 1_800_000_000_000;
const GID = 'grp-test-0001';
const rules = loadRules();
const uidOf = who => 'uid-' + who;
const A = 'TokAlpha0001', B = 'TokBravo0002', C = 'TokCharlie03';
const prof = (extra = {}) => ({ w: { pool: 0.5, beach: -0.25 }, c: { pool: 1, beach: 2 }, n: 3, ...extra });
const firstCode = (tree, gid) => Object.keys(tree.groups?.[gid]?.codes ?? {})[0] ?? 'NoSuchToken01';
const nameOf = (tree, gid, fallback = 'Reis') => tree.groups?.[gid]?.name ?? fallback;

// ---- rules side: op -> atomic writes ----
function toWrites(op, a, tree, who) {
  const uid = uidOf(who);
  const gid = a.gid ?? GID;
  const G = ['groups', gid];
  const group = tree.groups?.[gid];
  const target = a.target ? uidOf(a.target) : uid;
  // codes/{token} = {gid, name}; groups/{gid}/codes/{token} = time
  const codeWrites = (list, v, name = nameOf(tree, gid)) => list.flatMap(c => [{ path: ['codes', c], value: v === null ? null : { gid, name } }, { path: [...G, 'codes', c], value: v }]);
  switch (op) {
    case 'setUser': {
      const v = { name: a.name ?? 'Test', updatedAt: NOW };
      if (a.swipes && Object.keys(a.swipes).length) v.swipes = a.swipes;
      if (a.groups && Object.keys(a.groups).length) v.groups = a.groups;
      if (a.overrides && Object.keys(a.overrides).length) v.overrides = a.overrides;
      if (a.prefs && Object.keys(a.prefs).length) v.prefs = a.prefs;
      if (a.household) v.household = a.household;
      return [{ path: ['users', a.target ?? uid], value: v }];
    }
    case 'createGroup': {
      const codes = a.codes ?? [];
      const name = a.name ?? 'Reis';
      const value = { name, owner: uid, createdAt: NOW, members: { [uid]: { name: a.memberName ?? 'Ik', via: 'owner' } } };
      if (codes.length) value.codes = Object.fromEntries(codes.map(c => [c, NOW]));
      return [{ path: G, value }, ...codes.map(c => ({ path: ['codes', c], value: { gid, name } }))];
    }
    case 'rename': return [{ path: [...G, 'name'], value: a.name }, ...Object.keys(group?.codes ?? {}).map(c => ({ path: ['codes', c, 'name'], value: a.name }))];
    case 'renameOnly': return [{ path: [...G, 'name'], value: a.name }]; // codes keep the old name: the preview would lie
    case 'addCode': return codeWrites([a.code], NOW);
    case 'rotate': return [...codeWrites([a.code], NOW), ...codeWrites(a.old, null)];
    case 'delCode': return codeWrites([a.code], null);
    case 'forgeCodeName': return [{ path: ['codes', a.code], value: { gid, name: 'Something else' } }, { path: [...G, 'codes', a.code], value: NOW }];
    case 'join': return [{ path: [...G, 'members', uid], value: { name: a.name ?? 'Gast', via: a.via ?? firstCode(tree, gid) } }];
    case 'remove': { // leave (target = self) or kick (the owner bans the member in the same write)
      const w = [{ path: [...G, 'members', target], value: null }];
      if (group?.profiles?.[target]) w.push({ path: [...G, 'profiles', target], value: null });
      if (target !== uid) w.push({ path: [...G, 'banned', target], value: true });
      return w;
    }
    case 'kickNoBan': return [{ path: [...G, 'members', target], value: null }];
    case 'unban': return [{ path: [...G, 'banned', target], value: null }];
    case 'banSelf': return [{ path: [...G, 'banned', uid], value: true }];
    case 'deleteGroup': return [{ path: G, value: null }, ...Object.keys(group?.codes ?? {}).map(c => ({ path: ['codes', c], value: null }))];
    case 'setProfile': return [{ path: [...G, 'profiles', target], value: { ...(a.p ?? prof()), updatedAt: NOW } }];
    case 'delProfile': return [{ path: [...G, 'profiles', target], value: null }];
    case 'setTrip': return [{ path: [...G, 'trip'], value: { ...a.t, updatedAt: NOW } }];
    default: throw new Error('op ' + op);
  }
}

// ---- dev side: op -> HTTP (null = the dev API cannot express it) ----
function toHttp(op, a, who, tree) {
  const uid = uidOf(who);
  const gid = a.gid ?? GID;
  const base = `/api/groups/${gid}`;
  const target = a.target ? uidOf(a.target) : uid;
  switch (op) {
    case 'setUser': return ['PUT', `/api/users/${a.target ?? uid}`, { name: a.name ?? 'Test', ...(a.swipes ? { swipes: a.swipes } : {}), ...(a.groups ? { groups: a.groups } : {}), ...(a.overrides ? { overrides: a.overrides } : {}), ...(a.prefs ? { prefs: a.prefs } : {}), ...(a.household ? { household: a.household } : {}) }];
    case 'createGroup': return ['POST', '/api/groups', { id: gid, name: a.name ?? 'Reis', memberName: a.memberName ?? 'Ik', codes: a.codes ?? [] }];
    case 'rename': return ['PATCH', base, { name: a.name }];
    case 'renameOnly': case 'forgeCodeName': case 'kickNoBan': case 'banSelf': return null;
    case 'addCode': return ['POST', `${base}/codes`, { code: a.code }];
    case 'rotate': return ['POST', `${base}/codes/rotate`, { code: a.code, old: a.old }];
    case 'delCode': return ['DELETE', `${base}/codes/${a.code}`];
    case 'join': return ['POST', `${base}/members`, { name: a.name ?? 'Gast', via: a.via ?? firstCode(tree, gid) }];
    case 'remove': return ['DELETE', `${base}/members/${target}`];
    case 'unban': return ['DELETE', `${base}/banned/${target}`];
    case 'deleteGroup': return ['DELETE', base];
    case 'setProfile': return ['PUT', `${base}/profiles/${target}`, a.p ?? prof()];
    case 'delProfile': return ['DELETE', `${base}/profiles/${target}`];
    case 'setTrip': return ['PUT', `${base}/trip`, a.t];
    default: throw new Error('op ' + op);
  }
}

const mkSession = async (srv, uid) => (await (await fetch(`http://localhost:${srv.port}/api/session`, { method: 'POST', body: JSON.stringify({ uid }) })).json()).secret;
const H = (srv, who, secrets) => async () => ({ 'x-uid': uidOf(who), 'x-secret': secrets[who] ??= await mkSession(srv, uidOf(who)), 'content-type': 'application/json' });

async function run(steps) {
  const srv = await startServer({ port: 0, now: () => NOW });
  const tree = {};
  const secrets = {};
  try {
    for (const [who, op, args, expected] of steps) {
      const label = `${who} ${op} ${JSON.stringify(args)}`;
      let rulesOk;
      if (op.startsWith('read')) { // reads: readUser / readGroup / readCode
        const t = args.target ?? who;
        const [rpath, url] = op === 'readUser' ? [['users', uidOf(t)], `/api/users/${uidOf(t)}`] : op === 'readGroup' ? [['groups', args.gid ?? GID], `/api/groups/${args.gid ?? GID}`] : [['codes', args.code], `/api/codes/${args.code}`];
        rulesOk = checkRead(rules, tree, rpath, { uid: uidOf(who) }, NOW);
        const res = await fetch(`http://localhost:${srv.port}${url}`, { headers: await H(srv, who, secrets)() });
        assert.equal(res.status < 300, expected === 'ok', `dev server: ${label}`);
      } else {
        const writes = toWrites(op, args, tree, who);
        const http = toHttp(op, args, who, tree);
        rulesOk = checkUpdate(rules, tree, writes, { uid: uidOf(who) }, NOW);
        if (http) {
          const [method, url, body] = http;
          const res = await fetch(`http://localhost:${srv.port}${url}`, { method, headers: await H(srv, who, secrets)(), body: body ? JSON.stringify(body) : undefined });
          assert.equal(res.status < 300, expected === 'ok', `dev server: ${label}`);
        }
      }
      assert.equal(rulesOk, expected === 'ok', `rules: ${label}`);
    }
  } finally { await srv.close(); }
}

test('parity: users/{uid} is own read/write only, with validated fields', async () => {
  await run([
    ['anna', 'setUser', { swipes: { 'acc-01': 1, 'acc-02': -1, 'act-03': 2 } }, 'ok'],
    ['bob', 'setUser', { target: 'uid-anna', swipes: { x: 1 } }, 'deny'], // someone else's profile
    ['anna', 'readUser', {}, 'ok'],
    ['bob', 'readUser', { target: 'anna' }, 'deny'],
    ['anna', 'setUser', { name: '' }, 'deny'],
    ['anna', 'setUser', { name: 'x'.repeat(41) }, 'deny'],
    ['anna', 'setUser', { name: 'x'.repeat(40) }, 'ok'],
    ['anna', 'setUser', { swipes: { 'acc-01': 3 } }, 'deny'], // not -1 | 1 | 2
    ['anna', 'setUser', { swipes: { 'acc-01': 0 } }, 'deny'],
    ['anna', 'setUser', { swipes: { 'acc 01': 1 } }, 'deny'], // key regex
    ['anna', 'setUser', { swipes: { '<img>': 1 } }, 'deny'],
    ['anna', 'setUser', { swipes: { ['k'.repeat(33)]: 1 } }, 'deny'],
    ['anna', 'setUser', { swipes: { a: 1 }, groups: { [GID]: true } }, 'ok'],
    ['anna', 'setUser', { groups: { [GID]: false } }, 'deny'],
    ['anna', 'setUser', { groups: { 'bad id': true } }, 'deny'],
    ['anna', 'setUser', { swipes: {} }, 'ok'], // an empty map simply does not exist
    // overrides: tag -> -1 | 0 | 1
    ['anna', 'setUser', { overrides: { pool: 1, camping: -1, spa: 0 } }, 'ok'],
    ['anna', 'setUser', { overrides: { pool: 2 } }, 'deny'],
    ['anna', 'setUser', { overrides: { pool: 0.5 } }, 'deny'],
    ['anna', 'setUser', { overrides: { pool: true } }, 'deny'],
    ['anna', 'setUser', { overrides: { Pool: 1 } }, 'deny'], // tag regex
    ['anna', 'setUser', { overrides: { '<b>': 1 } }, 'deny'],
    ['bob', 'setUser', { target: 'uid-anna', overrides: { pool: 1 } }, 'deny'], // someone else's record
    // prefs: switches and a budget cap
    ['anna', 'setUser', { prefs: { airco: true, ev: false, kids: true, budget: 3 } }, 'ok'],
    ['anna', 'setUser', { prefs: { budget: 5 } }, 'deny'],
    ['anna', 'setUser', { prefs: { budget: 0 } }, 'deny'],
    ['anna', 'setUser', { prefs: { budget: 2.5 } }, 'deny'],
    ['anna', 'setUser', { prefs: { airco: 1 } }, 'deny'],
    ['anna', 'setUser', { prefs: { kids: 'yes' } }, 'deny'],
    ['anna', 'setUser', { prefs: { wifi: true } }, 'deny'], // unknown field
    ['anna', 'setUser', { prefs: { airco: true }, overrides: { gym: -1 }, swipes: { c1: 1 } }, 'ok'],
  ]);
});


test('parity: any signed-in user creates a group; ids and tokens are validated; groups are read by members only', async () => {
  await run([
    ['anna', 'createGroup', { codes: [A] }, 'ok'],
    ['bob', 'createGroup', {}, 'deny'], // id exists
    ['bob', 'createGroup', { gid: 'grp-test-0002', codes: [A] }, 'deny'], // token taken
    ['bob', 'createGroup', { gid: 'grp-test-0003', codes: ['short'] }, 'deny'], // not a token
    ['bob', 'createGroup', { gid: 'grp-test-0004', codes: ['has space 123456'] }, 'deny'],
    ['bob', 'createGroup', { gid: 'bad id!', codes: [] }, 'deny'],
    ['bob', 'createGroup', { gid: 'grp-test-0005', name: '' }, 'deny'],
    ['bob', 'createGroup', { gid: 'grp-test-0006', name: 'y'.repeat(31) }, 'deny'],
    ['bob', 'createGroup', { gid: 'grp-test-0007', memberName: '' }, 'deny'],
    ['bob', 'createGroup', { gid: 'grp-test-0008', name: 'y'.repeat(30), memberName: 'z'.repeat(40), codes: [B] }, 'ok'],
    ['bob', 'createGroup', { gid: 'grp-test-0009', codes: [] }, 'ok'], // a group without a link
    ['anna', 'readGroup', {}, 'ok'], // the owner is a member
    ['carl', 'readGroup', {}, 'deny'], // groups are read by members only, an id is not enough
    ['carl', 'readCode', { code: A }, 'ok'], // the invite preview {gid, name} is readable by any signed-in user
  ]);
});

test('parity: join links (owner only), rename (previews follow), rotate', async () => {
  await run([
    ['anna', 'createGroup', { codes: [A] }, 'ok'],
    ['bob', 'addCode', { code: B }, 'deny'], // not the owner
    ['anna', 'addCode', { code: B }, 'ok'],
    ['anna', 'addCode', { code: B }, 'deny'], // taken
    ['anna', 'addCode', { code: 'tooShort' }, 'deny'],
    ['bob', 'delCode', { code: B }, 'deny'],
    ['anna', 'delCode', { code: B }, 'ok'],
    ['anna', 'delCode', { code: B }, 'deny'], // gone
    ['anna', 'rotate', { code: C, old: [A] }, 'ok'],
    ['bob', 'rotate', { code: B, old: [C] }, 'deny'],
    ['anna', 'rotate', { code: B, old: ['TokNotThere1'] }, 'deny'], // old does not exist
    ['anna', 'readCode', { code: C }, 'ok'],
    ['bob', 'rename', { name: 'Hack' }, 'deny'],
    ['anna', 'rename', { name: 'Zomer 2027' }, 'ok'], // the group and its invite preview change together
    ['anna', 'renameOnly', { name: 'Najaar' }, 'ok'], // (rules only) the group name alone is allowed, the app always renames both
    ['anna', 'forgeCodeName', { code: B }, 'deny'], // (rules only) a code preview that lies about the group name
    ['anna', 'rename', { name: '' }, 'deny'],
    ['anna', 'rename', { name: 'x'.repeat(31) }, 'deny'],
  ]);
});

test('parity: joining proves an invite token; the owner removes (and bans); nobody can slip back in', async () => {
  await run([
    ['anna', 'createGroup', { codes: [A] }, 'ok'],
    ['dora', 'createGroup', { gid: 'grp-test-0002', codes: [B] }, 'ok'], // another group with its own link
    ['bob', 'join', { name: 'Bob' }, 'ok'], // valid link
    ['bob', 'join', { name: 'Bobby' }, 'ok'], // rename myself
    ['bob', 'join', { name: '' }, 'deny'],
    ['carl', 'join', { name: 'Carl', via: 'NoSuchToken01' }, 'deny'], // no valid token
    ['carl', 'join', { name: 'Carl', via: B }, 'deny'], // a token of another group
    ['carl', 'join', { name: 'Carl', via: 'owner' }, 'deny'], // only the owner's own entry says owner
    ['carl', 'join', { name: 'x'.repeat(41) }, 'deny'],
    ['carl', 'join', { name: 'Carl', gid: 'grp-nonexistent', via: A }, 'deny'], // no such group
    ['carl', 'readGroup', {}, 'deny'], // not a member yet
    ['carl', 'join', { name: 'Carl' }, 'ok'],
    ['carl', 'readGroup', {}, 'ok'],
    ['dora', 'remove', { target: 'carl' }, 'deny'], // not the owner
    ['bob', 'remove', { target: 'carl' }, 'deny'],
    ['anna', 'remove', { target: 'anna' }, 'deny'], // the owner cannot leave
    ['anna', 'banSelf', {}, 'deny'], // (rules only) the owner cannot ban themselves
    ['bob', 'unban', { target: 'carl' }, 'deny'],
    ['anna', 'remove', { target: 'carl' }, 'ok'], // removed: banned in the same write
    ['anna', 'remove', { target: 'carl' }, 'deny'], // already gone
    ['carl', 'readGroup', {}, 'deny'], // read after removal denied
    ['carl', 'join', { name: 'Carl' }, 'deny'], // rejoin with a valid link after being removed: denied
    ['carl', 'setProfile', {}, 'deny'],
    ['anna', 'rotate', { code: C, old: [A] }, 'ok'], // a new link: the old one is gone
    ['bob', 'remove', {}, 'ok'], // leave myself (no ban)
    ['bob', 'join', { name: 'Bob', via: A }, 'deny'], // the old token no longer proves anything
    ['bob', 'join', { name: 'Bob' }, 'ok'], // the new one does
    ['carl', 'join', { name: 'Carl', via: C }, 'deny'], // still banned with the new link
    ['bob', 'unban', { target: 'carl' }, 'deny'],
    ['anna', 'unban', { target: 'carl' }, 'ok'],
    ['carl', 'join', { name: 'Carl' }, 'ok'], // the owner lifted the ban
    ['anna', 'kickNoBan', { target: 'carl' }, 'ok'], // (rules only) a bare removal is possible but the app always bans
  ]);
});

test('parity: the owner deletes the group with its codes; nobody else can', async () => {
  await run([
    ['anna', 'createGroup', { codes: [A] }, 'ok'],
    ['bob', 'join', { name: 'Bob' }, 'ok'],
    ['bob', 'deleteGroup', {}, 'deny'],
    ['carl', 'deleteGroup', {}, 'deny'],
    ['anna', 'deleteGroup', {}, 'ok'],
    ['bob', 'join', { name: 'Bob', via: A }, 'deny'], // the group and its link are gone
    ['bob', 'readGroup', {}, 'deny'],
    ['anna', 'createGroup', { codes: [A] }, 'ok'], // the id and the token are free again
  ]);
});
test('parity: profiles in a group are written by the member for themselves only', async () => {
  await run([
    ['anna', 'createGroup', { codes: [A] }, 'ok'],
    ['bob', 'setProfile', {}, 'deny'], // not a member yet
    ['bob', 'join', { name: 'Bob' }, 'ok'],
    ['bob', 'setProfile', {}, 'ok'],
    ['anna', 'setProfile', { target: 'bob', p: prof({ n: 9 }) }, 'deny'], // not for someone else, not even the owner
    ['carl', 'setProfile', { target: 'bob' }, 'deny'],
    ['anna', 'setProfile', {}, 'ok'],
    ['bob', 'setProfile', { p: prof({ w: { pool: 1.5 }, c: { pool: 1 } }) }, 'deny'], // weight out of range
    ['bob', 'setProfile', { p: prof({ w: { pool: -1.5 }, c: { pool: 1 } }) }, 'deny'],
    ['bob', 'setProfile', { p: prof({ w: { Pool: 0.5 }, c: { pool: 1 } }) }, 'deny'], // tag regex
    ['bob', 'setProfile', { p: prof({ w: { '<b>': 0.5 }, c: { pool: 1 } }) }, 'deny'],
    ['bob', 'setProfile', { p: prof({ c: { pool: -1 } }) }, 'deny'],
    ['bob', 'setProfile', { p: prof({ c: { pool: 501 } }) }, 'deny'],
    ['bob', 'setProfile', { p: prof({ n: 1.5 }) }, 'deny'],
    ['bob', 'setProfile', { p: prof({ n: 501 }) }, 'deny'],
    ['bob', 'setProfile', { p: prof({ n: -1 }) }, 'deny'],
    ['bob', 'setProfile', { p: { w: { pool: 0.5 }, c: { pool: 1 } } }, 'deny'], // n missing
    ['bob', 'setProfile', { p: prof({ extra: 1 }) }, 'deny'], // unknown field
    ['bob', 'setProfile', { p: prof({ w: { pool: 0 }, c: { pool: 1 }, n: 0 }) }, 'ok'], // 0 is a value, not "missing"
    ['carl', 'delProfile', { target: 'bob' }, 'deny'],
    ['bob', 'delProfile', {}, 'ok'],
    ['bob', 'setProfile', {}, 'ok'],
    ['anna', 'delProfile', { target: 'bob' }, 'ok'], // the owner may clear a profile
    ['bob', 'setProfile', {}, 'ok'],
    ['anna', 'remove', { target: 'bob' }, 'ok'], // removing a member removes the profile too
    ['bob', 'setProfile', {}, 'deny'], // no longer a member
  ]);
});

const TRIP = { dest: 'corsica', nights: 14, months: '2027-07 2027-08', party: { p0: { name: 'Stefan', born: 1980, uid: 'uid-anna' }, p1: { name: 'Lisa', born: 2020 } }, highlights: 'hl-bonifacio hl-palombaggia' };
test('parity: every member edits the trip settings, validated; strangers and removed members cannot', async () => {
  const people = n => Object.fromEntries(Array.from({ length: n }, (_, i) => ['p' + i, { name: 'P' + i }]));
  await run([
    ['anna', 'createGroup', { codes: [A] }, 'ok'],
    ['anna', 'setTrip', { t: TRIP }, 'ok'],
    ['bob', 'setTrip', { t: TRIP }, 'deny'], // not a member
    ['bob', 'join', { name: 'Bob' }, 'ok'],
    ['bob', 'setTrip', { t: { ...TRIP, nights: 10, start: '2027-07-04', end: '2027-07-14' } }, 'ok'], // a member plans along
    ['bob', 'setTrip', { t: { ...TRIP, nights: 2 } }, 'deny'],
    ['bob', 'setTrip', { t: { ...TRIP, nights: 29 } }, 'deny'],
    ['bob', 'setTrip', { t: { ...TRIP, nights: 7.5 } }, 'deny'],
    ['bob', 'setTrip', { t: { ...TRIP, dest: 'bad dest' } }, 'deny'],
    ['bob', 'setTrip', { t: { ...TRIP, start: '2027-13-01' } }, 'deny'],
    ['bob', 'setTrip', { t: { ...TRIP, months: '2027-07 2027-08 2027-09 2027-10' } }, 'deny'], // at most 3 months
    ['bob', 'setTrip', { t: { ...TRIP, months: 'juli' } }, 'deny'],
    ['bob', 'setTrip', { t: { ...TRIP, highlights: 'hl-<b>' } }, 'deny'],
    ['bob', 'setTrip', { t: { ...TRIP, highlights: 'h'.repeat(1001) } }, 'deny'],
    ['bob', 'setTrip', { t: { ...TRIP, party: people(12) } }, 'ok'],
    ['bob', 'setTrip', { t: { ...TRIP, party: { ...people(12), p12: { name: 'X' } } } }, 'deny'], // at most 12 people
    ['bob', 'setTrip', { t: { ...TRIP, party: { p0: { name: '' } } } }, 'deny'],
    ['bob', 'setTrip', { t: { ...TRIP, party: { p0: { name: 'Kid', born: 1900 } } } }, 'deny'],
    ['bob', 'setTrip', { t: { ...TRIP, party: { p0: { name: 'Kid', born: 2019.5 } } } }, 'deny'],
    ['bob', 'setTrip', { t: { ...TRIP, party: { p0: { name: 'Kid', uid: 'bad uid' } } } }, 'deny'],
    ['bob', 'setTrip', { t: { ...TRIP, party: { p0: { name: 'Kid', age: 5 } } } }, 'deny'], // unknown field
    ['bob', 'setTrip', { t: { ...TRIP, budget: 3 } }, 'deny'],
    ['bob', 'setTrip', { t: { nights: 14 } }, 'deny'], // dest missing
    ['anna', 'remove', { target: 'bob' }, 'ok'],
    ['bob', 'setTrip', { t: TRIP }, 'deny'], // removed
  ]);
});
test('parity: the household lives in my own user record, validated like a party', async () => {
  await run([
    ['anna', 'setUser', { household: { p0: { name: 'Stefan', born: 1980 }, p1: { name: 'Lisa', born: 2020 } } }, 'ok'],
    ['anna', 'setUser', { household: { p12: { name: 'X' } } }, 'deny'],
    ['anna', 'setUser', { household: { p0: { name: 'X', born: 2041 } } }, 'deny'],
    ['bob', 'setUser', { target: 'uid-anna', household: { p0: { name: 'X' } } }, 'deny'],
  ]);
});
