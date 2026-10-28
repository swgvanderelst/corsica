// Rules-only attacks (no dev-server equivalent: the dev API cannot even express them) plus generator drift.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { loadRules, checkUpdate, checkRead } from './rules-eval.js';

const NOW = 1_800_000_000_000;
const rules = loadRules();
const G = ['groups', 'grp-1'];
const T1 = 'TokAlpha0001';
const prof = { w: { pool: 0.5 }, c: { pool: 1 }, n: 1, updatedAt: NOW };
const mem = (name, via = T1) => ({ name, via });
const asAuth = (uid, anonymous) => (uid === null ? null : { uid, ...(anonymous ? { anonymous: true } : {}) });

function world() {
  const tree = {};
  const ok = (writes, uid, anonymous = false) => checkUpdate(rules, tree, writes, asAuth(uid === undefined ? 'anna' : uid, anonymous), NOW);
  assert.ok(ok([{ path: G, value: { name: 'Reis', owner: 'anna', createdAt: NOW, members: { anna: mem('Anna', 'owner') }, codes: { [T1]: NOW } } }, { path: ['codes', T1], value: { gid: 'grp-1', name: 'Reis' } }]));
  assert.ok(ok([{ path: [...G, 'members', 'bob'], value: mem('Bob') }], 'bob'));
  assert.ok(ok([{ path: [...G, 'profiles', 'bob'], value: prof }], 'bob'));
  assert.ok(ok([{ path: ['users', 'anna'], value: { name: 'Anna', updatedAt: NOW, swipes: { c1: 1 } } }]));
  return { tree, ok };
}

test('rules: signed-out clients can do nothing', () => {
  const { tree, ok } = world();
  assert.equal(ok([{ path: ['users', 'anna'], value: { name: 'x', updatedAt: NOW } }], null), false);
  assert.equal(ok([{ path: ['groups', 'new'], value: { name: 'N', owner: 'x', createdAt: NOW, members: { x: mem('X', 'owner') } } }], null), false);
  assert.equal(checkRead(rules, tree, ['groups', 'grp-1'], null), false);
  assert.equal(checkRead(rules, tree, ['codes', T1], null), false);
  assert.equal(checkRead(rules, tree, ['users', 'anna'], null), false);
});

test('rules: anonymous users (the test fallback) are refused for every read and write in production', () => {
  const { tree, ok } = world();
  const anon = uid => ({ uid, anonymous: true });
  assert.equal(ok([{ path: ['users', 'anna'], value: { name: 'A', updatedAt: NOW } }], 'anna', true), false);
  assert.equal(ok([{ path: ['groups', 'g2'], value: { name: 'N', owner: 'zed', createdAt: NOW, members: { zed: mem('Z', 'owner') } } }], 'zed', true), false);
  assert.equal(ok([{ path: [...G, 'members', 'zed'], value: mem('Z') }], 'zed', true), false, 'not even a join with a valid link');
  assert.equal(ok([{ path: [...G, 'name'], value: 'Hack' }], 'anna', true), false, 'not even the owner when signed in anonymously');
  assert.equal(checkRead(rules, tree, ['users', 'anna'], anon('anna')), false);
  assert.equal(checkRead(rules, tree, ['groups', 'grp-1'], anon('anna')), false);
  assert.equal(checkRead(rules, tree, ['codes', T1], anon('zed')), false);
  assert.equal(checkRead(rules, tree, ['users', 'anna'], { uid: 'anna' }), true); // the same identity with a real provider works
});

test('rules: keys and values must be HTML-safe', () => {
  const { ok } = world();
  const evil = '"><img src=x onerror=alert(1)>';
  assert.equal(ok([{ path: ['groups', evil], value: { name: 'N', owner: 'anna', createdAt: NOW, members: { anna: mem('A', 'owner') } } }]), false);
  assert.equal(ok([{ path: ['users', 'anna'], value: { name: 'A', updatedAt: NOW, swipes: { [evil]: 1 } } }]), false);
  assert.equal(ok([{ path: ['users', 'anna'], value: { name: 'A', updatedAt: NOW, groups: { [evil]: true } } }]), false);
  assert.equal(ok([{ path: [...G, 'members', evil], value: mem('X') }], evil), false);
  assert.equal(ok([{ path: [...G, 'profiles', 'bob'], value: { ...prof, w: { [evil]: 0.5 } } }], 'bob'), false);
  assert.equal(ok([{ path: ['codes', 'Tok1234Alpha'], value: { gid: evil, name: 'Reis' } }, { path: [...G, 'codes', 'Tok1234Alpha'], value: NOW }]), false);
  assert.equal(ok([{ path: ['users', 'anna'], value: { name: 'A', updatedAt: NOW, photo: 'x' } }]), false); // unknown field
  assert.equal(ok([{ path: [...G, 'secret'], value: 'x' }]), false); // unknown field on a group
});

test('rules: maps must hold something (hasChildren); a scalar where a map belongs is refused', () => {
  const { ok } = world();
  assert.equal(ok([{ path: ['users', 'anna', 'swipes'], value: 'text' }]), false);
  assert.equal(ok([{ path: [...G, 'profiles', 'bob', 'w'], value: 0.5 }], 'bob'), false);
  assert.equal(ok([{ path: ['users', 'anna', 'prefs'], value: true }]), false);
  assert.equal(ok([{ path: ['users', 'anna', 'overrides'], value: 1 }]), false);
  assert.equal(ok([{ path: ['users', 'anna', 'groups'], value: 'x' }]), false);
  assert.equal(ok([{ path: [...G, 'codes'], value: 7 }], 'anna'), false);
});

test('rules: timestamps are server time (not far in the future, not zero)', () => {
  const { ok } = world();
  assert.equal(ok([{ path: ['users', 'anna'], value: { name: 'A', updatedAt: NOW + 3_600_000 } }]), false);
  assert.equal(ok([{ path: ['users', 'anna'], value: { name: 'A', updatedAt: 0 } }]), false);
  assert.equal(ok([{ path: ['users', 'anna'], value: { name: 'A', updatedAt: 'now' } }]), false);
  assert.equal(ok([{ path: ['users', 'anna'], value: { name: 'A', updatedAt: NOW + 60_000 } }]), true); // within 5 minutes
  assert.equal(ok([{ path: [...G, 'profiles', 'bob'], value: { ...prof, updatedAt: NOW + 3_600_000 } }], 'bob'), false);
  assert.equal(ok([{ path: ['groups', 'g2'], value: { name: 'N', owner: 'anna', createdAt: NOW + 3_600_000, members: { anna: mem('A', 'owner') } } }]), false);
});

test('rules: a group is created complete, by its owner, with only the owner as member and no profiles or bans', () => {
  const { ok } = world();
  const base = { name: 'N', owner: 'carl', createdAt: NOW, members: { carl: mem('Carl', 'owner') } };
  assert.equal(ok([{ path: ['groups', 'g2'], value: base }], 'carl'), true);
  assert.equal(ok([{ path: ['groups', 'g3'], value: { ...base, owner: 'dora' } }], 'carl'), false, 'cannot name someone else the owner');
  assert.equal(ok([{ path: ['groups', 'g3'], value: { ...base, members: { dora: mem('Dora') } } }], 'carl'), false, 'cannot create without being a member');
  assert.equal(ok([{ path: ['groups', 'g3'], value: { ...base, members: { carl: mem('Carl', 'owner'), dora: mem('Dora', 'owner') } } }], 'carl'), false, 'cannot add others as members');
  assert.equal(ok([{ path: ['groups', 'g3'], value: { ...base, members: { carl: mem('Carl', T1) } } }], 'carl'), false, 'the owner entry says owner');
  assert.equal(ok([{ path: ['groups', 'g3'], value: { ...base, profiles: { carl: prof } } }], 'carl'), false, 'no seeded profiles');
  assert.equal(ok([{ path: ['groups', 'g3'], value: { ...base, banned: { dora: true } } }], 'carl'), false, 'no seeded bans');
  const { members, ...noMembers } = base; void members;
  assert.equal(ok([{ path: ['groups', 'g3'], value: noMembers }], 'carl'), false);
  assert.equal(ok([{ path: ['groups', 'g3'], value: { ...base, name: '' } }], 'carl'), false);
  assert.equal(ok([{ path: ['groups', 'grp-1'], value: { ...base } }], 'carl'), false, 'an existing group cannot be overwritten');
});

test('rules: nobody can squat or hijack an existing or non-existing group', () => {
  const { ok } = world();
  assert.equal(ok([{ path: ['groups', 'ghost', 'members', 'dora'], value: mem('Dora') }], 'dora'), false);
  assert.equal(ok([{ path: ['groups', 'ghost', 'profiles', 'dora'], value: prof }], 'dora'), false);
  assert.equal(ok([{ path: [...G, 'owner'], value: 'bob' }], 'bob'), false);
  assert.equal(ok([{ path: [...G, 'owner'], value: 'bob' }], 'anna'), false);
  assert.equal(ok([{ path: [...G, 'name'], value: 'Hacked' }], 'bob'), false);
  assert.equal(ok([{ path: [...G, 'name'], value: 'Fine' }], 'anna'), true);
  assert.equal(ok([{ path: ['codes', T1], value: null }, { path: [...G, 'codes', T1], value: null }], 'bob'), false);
  assert.equal(ok([{ path: G, value: null }], 'bob'), false, 'a member cannot delete the group');
  assert.equal(ok([{ path: [...G, 'members'], value: null }], 'anna'), false);
  assert.equal(ok([{ path: [...G, 'members'], value: { bob: mem('Bob') } }], 'bob'), false);
});

test('rules: joining needs a valid invite token; a ban and a missing group stop it', () => {
  const { ok } = world();
  assert.equal(ok([{ path: [...G, 'members', 'dora'], value: mem('Dora', 'NoSuchToken01') }], 'dora'), false, 'unknown token');
  assert.equal(ok([{ path: [...G, 'members', 'dora'], value: mem('Dora', 'owner') }], 'dora'), false, 'only the owner entry says owner');
  assert.equal(ok([{ path: [...G, 'members', 'dora'], value: { name: 'Dora' } }], 'dora'), false, 'no via at all');
  assert.equal(ok([{ path: [...G, 'members', 'dora'], value: { name: 'Dora', via: ['x'] } }], 'dora'), false);
  assert.equal(ok([{ path: [...G, 'members', 'dora'], value: mem('Dora') }], 'dora'), true);
  // a token of another group does not prove anything here
  assert.equal(ok([{ path: ['groups', 'g-other'], value: { name: 'O', owner: 'erik', createdAt: NOW, members: { erik: mem('Erik', 'owner') }, codes: { TokOther00001: NOW } } }, { path: ['codes', 'TokOther00001'], value: { gid: 'g-other', name: 'O' } }], 'erik'), true);
  assert.equal(ok([{ path: [...G, 'members', 'fred'], value: mem('Fred', 'TokOther00001') }], 'fred'), false);
  // the owner removes and bans: no way back with the same or a new link
  assert.equal(ok([{ path: [...G, 'members', 'dora'], value: null }, { path: [...G, 'banned', 'dora'], value: true }], 'anna'), true);
  assert.equal(ok([{ path: [...G, 'members', 'dora'], value: mem('Dora') }], 'dora'), false, 'banned');
  assert.equal(ok([{ path: ['codes', 'TokNew00000001'], value: { gid: 'grp-1', name: 'Reis' } }, { path: [...G, 'codes', 'TokNew00000001'], value: NOW }], 'anna'), true);
  assert.equal(ok([{ path: [...G, 'members', 'dora'], value: mem('Dora', 'TokNew00000001') }], 'dora'), false, 'banned even with a new link');
  assert.equal(ok([{ path: [...G, 'banned', 'dora'], value: true }], 'bob'), false, 'only the owner bans');
  assert.equal(ok([{ path: [...G, 'banned', 'anna'], value: true }], 'anna'), false);
  assert.equal(ok([{ path: [...G, 'banned', 'zed'], value: false }], 'anna'), false);
  assert.equal(ok([{ path: [...G, 'banned', 'dora'], value: null }], 'anna'), true, 'the owner lifts it');
});

test('rules: codes and group codes always pair, carry the group name and belong to a group the writer owns', () => {
  const { ok } = world();
  const code = (t, name = 'Reis', gid = 'grp-1') => ({ path: ['codes', t], value: { gid, name } });
  assert.equal(ok([code('TokBravo0002')], 'anna'), false, 'root code without the group entry');
  assert.equal(ok([{ path: [...G, 'codes', 'TokBravo0002'], value: NOW }], 'anna'), false, 'group entry without the root code');
  assert.equal(ok([code('TokBravo0002'), { path: [...G, 'codes', 'TokBravo0002'], value: NOW }], 'bob'), false, 'not the owner');
  assert.equal(ok([code('TokBravo0002', 'Lies'), { path: [...G, 'codes', 'TokBravo0002'], value: NOW }], 'anna'), false, 'the preview name must be the group name');
  assert.equal(ok([code('TokBravo0002'), { path: [...G, 'codes', 'TokBravo0002'], value: NOW }], 'anna'), true);
  assert.equal(ok([{ path: ['groups', 'g-bob'], value: { name: 'B', owner: 'bob', createdAt: NOW, members: { bob: mem('B', 'owner') } } }], 'bob'), true);
  assert.equal(ok([code('TokHijack0003', 'Reis', 'g-bob'), { path: [...G, 'codes', 'TokHijack0003'], value: NOW }], 'anna'), false);
  assert.equal(ok([{ path: ['codes', T1], value: { gid: 'g-bob', name: 'B' } }], 'bob'), false, 'cannot repoint an existing code');
  assert.equal(ok([{ path: ['codes', T1], value: null }], 'anna'), false);
  assert.equal(ok([{ path: ['codes', T1], value: null }, { path: [...G, 'codes', T1], value: null }], 'anna'), true);
});

test('rules: members and profiles belong to their user', () => {
  const { ok } = world();
  assert.equal(ok([{ path: [...G, 'members', 'dora'], value: mem('Dora') }], 'bob'), false, 'cannot add someone else');
  assert.equal(ok([{ path: [...G, 'profiles', 'bob'], value: prof }], 'anna'), false, 'not even the owner writes it');
  assert.equal(ok([{ path: [...G, 'profiles', 'bob'], value: prof }], 'dora'), false);
  assert.equal(ok([{ path: [...G, 'profiles', 'dora'], value: prof }], 'dora'), false, 'only members');
  assert.equal(ok([{ path: [...G, 'members', 'dora'], value: mem('Dora') }, { path: [...G, 'profiles', 'dora'], value: prof }], 'dora'), true, 'join and share the profile in one write');
  assert.equal(ok([{ path: [...G, 'members', 'anna'], value: null }], 'anna'), false, 'the owner cannot leave');
  assert.equal(ok([{ path: [...G, 'members', 'anna'], value: null }], 'bob'), false);
  assert.equal(ok([{ path: [...G, 'members', 'bob'], value: null }, { path: [...G, 'profiles', 'bob'], value: null }], 'anna'), true, 'the owner removes a member and the profile');
  assert.equal(ok([{ path: [...G, 'members', 'dora', 'name'], value: 'Renamed' }], 'dora'), true, 'a member renames themselves');
  assert.equal(ok([{ path: [...G, 'members', 'dora', 'via'], value: 'owner' }], 'dora'), false, 'but cannot claim to be the owner');
});

test('rules: reads: users only own, codes (the invite preview) by token, groups by members only; nothing listable', () => {
  const { tree } = world();
  const a = { uid: 'anna' }, b = { uid: 'bob' }, z = { uid: 'zed' };
  assert.equal(checkRead(rules, tree, ['users', 'anna'], a), true);
  assert.equal(checkRead(rules, tree, ['users', 'anna'], b), false);
  assert.equal(checkRead(rules, tree, ['users'], a), false);
  assert.equal(checkRead(rules, tree, ['groups', 'grp-1'], b), true, 'a member');
  assert.equal(checkRead(rules, tree, ['groups', 'grp-1'], z), false, 'knowing the id is not enough');
  assert.equal(checkRead(rules, tree, ['groups', 'grp-1', 'members'], z), false);
  assert.equal(checkRead(rules, tree, ['groups', 'grp-1', 'profiles', 'bob'], z), false);
  assert.equal(checkRead(rules, tree, ['groups'], a), false, 'groups are not listable');
  assert.equal(checkRead(rules, tree, ['codes', T1], z), true);
  assert.equal(checkRead(rules, tree, ['codes'], a), false, 'codes are not listable');
  assert.equal(checkRead(rules, tree, [], a), false);
});

test('rules: after the owner removes a member the read is denied too', () => {
  const { tree, ok } = world();
  assert.equal(checkRead(rules, tree, ['groups', 'grp-1'], { uid: 'bob' }), true);
  assert.equal(ok([{ path: [...G, 'members', 'bob'], value: null }, { path: [...G, 'profiles', 'bob'], value: null }, { path: [...G, 'banned', 'bob'], value: true }], 'anna'), true);
  assert.equal(checkRead(rules, tree, ['groups', 'grp-1'], { uid: 'bob' }), false);
});

test('rules: the owner deletes the group; the invite stops working', () => {
  const { ok } = world();
  assert.equal(ok([{ path: ['codes', T1], value: null }, { path: G, value: null }], 'anna'), true, 'the group with its code');
  assert.equal(ok([{ path: [...G, 'members', 'carl'], value: mem('Carl') }], 'carl'), false, 'the group is gone: nobody joins');
});

test('rules: users/{uid} swipes only hold -1, 1 or 2', () => {
  const { ok } = world();
  for (const v of [0, 3, -2, '1', true, 1.5]) assert.equal(ok([{ path: ['users', 'anna'], value: { name: 'A', updatedAt: NOW, swipes: { c1: v } } }]), false, String(v));
  for (const v of [-1, 1, 2]) assert.equal(ok([{ path: ['users', 'anna'], value: { name: 'A', updatedAt: NOW, swipes: { c1: v } } }]), true, String(v));
});

test('database.rules.json is exactly what scripts/gen-rules.mjs generates (edit the generator, never the JSON)', () => {
  const before = fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
  const r = spawnSync(process.execPath, [new URL('../scripts/gen-rules.mjs', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const after = fs.readFileSync(new URL('../database.rules.json', import.meta.url), 'utf8');
  assert.equal(after, before);
});
