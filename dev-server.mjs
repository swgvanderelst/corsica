// Zero-dependency dev backend: static files + in-memory store (users, groups, codes) + SSE.
// Permissions and validation mirror database.rules.json exactly (see test/parity.test.js).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FUTURE_MS = 5 * 60 * 1000;
const KEY_RE = /^[-_A-Za-z0-9]{1,32}$/; // ids and uids: safe to put in HTML attributes
const CODE_RE = /^[A-Za-z0-9]{10,32}$/; // long random join tokens (nobody types them)
const TAG_RE = /^[a-z_]{1,24}$/;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
const STATIC_BLOCK = /^(dev-server\.mjs|package(-lock)?\.json|test(?!\/fixtures\/)|scripts|tools|node_modules|database\.rules\.json|legacy)(\/|$)/;

const isNum = v => typeof v === 'number' && Number.isFinite(v);
const isStr = (v, min, max) => typeof v === 'string' && v.length >= min && v.length <= max;
const isKey = v => typeof v === 'string' && KEY_RE.test(v);
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

class HttpError extends Error {
  constructor(status, msg) { super(msg); this.status = status; }
}
const deny = (msg = 'forbidden') => new HttpError(403, msg);
const bad = (msg = 'invalid') => new HttpError(400, msg);

function onlyKeys(body, keys) {
  if (!isObj(body)) throw bad('body');
  for (const k of Object.keys(body)) if (!keys.includes(k)) throw bad('unknown field ' + k);
}
const sameSecret = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const PERSON_KEY_RE = /^p([0-9]|1[01])$/; // p0..p11: at most 12 people
const DATE_RE = /^20[2-9][0-9]-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/;
const MONTHS_RE = /^20[2-9][0-9]-(0[1-9]|1[0-2])( 20[2-9][0-9]-(0[1-9]|1[0-2])){0,2}$/;
// a household or travel party: {p0: {name, born?, uid?}, ...}; an empty one is simply absent (as in the database)
const peopleOk = v => isObj(v) && Object.entries(v).every(([k, p]) => PERSON_KEY_RE.test(k) && isObj(p)
  && Object.keys(p).every(f => ['name', 'born', 'uid'].includes(f)) && isStr(p.name, 1, 40)
  && (!('born' in p) || (isNum(p.born) && p.born >= 1920 && p.born <= 2040 && p.born % 1 === 0)) && (!('uid' in p) || isKey(p.uid)));
const tripOk = t => isObj(t) && Object.keys(t).every(f => ['dest', 'nights', 'start', 'end', 'months', 'party', 'highlights', 'pace', 'maxLeg'].includes(f))
  && isKey(t.dest) && isNum(t.nights) && t.nights >= 3 && t.nights <= 28 && t.nights % 1 === 0
  && (!('start' in t) || (typeof t.start === 'string' && DATE_RE.test(t.start))) && (!('end' in t) || (typeof t.end === 'string' && DATE_RE.test(t.end)))
  && (!('months' in t) || (typeof t.months === 'string' && MONTHS_RE.test(t.months))) && (!('party' in t) || peopleOk(t.party))
  && (!('pace' in t) || ['calm', 'normal', 'active'].includes(t.pace))
  && (!('maxLeg' in t) || (isNum(t.maxLeg) && t.maxLeg >= 60 && t.maxLeg <= 600 && t.maxLeg % 1 === 0))
  && (!('highlights' in t) || (typeof t.highlights === 'string' && t.highlights.length <= 1000 && /^[-a-z0-9 ]*$/.test(t.highlights)));
const numMap = (v, keyRe, lo, hi) => isObj(v) && Object.keys(v).length > 0 && Object.entries(v).every(([k, x]) => keyRe.test(k) && isNum(x) && x >= lo && x <= hi);

/**
 * Everything the rules allow, as a small API. Server time stands in for serverTimestamp(): a client value is never trusted.
 */
export function startServer({ port = 8787, host = '127.0.0.1', persistFile = null, now = () => Date.now() } = {}) {
  let db = { users: {}, groups: {}, codes: {}, sessions: {} };
  if (persistFile && fs.existsSync(persistFile)) {
    try { db = { users: {}, groups: {}, codes: {}, sessions: {}, ...JSON.parse(fs.readFileSync(persistFile, 'utf8')) }; } catch { /* start empty */ }
  }
  let saveT = null;
  const flush = () => { clearTimeout(saveT); saveT = null; if (persistFile) fs.writeFileSync(persistFile, JSON.stringify(db)); };
  const dirty = () => { if (persistFile && !saveT) saveT = setTimeout(flush, 200); };

  const watchers = new Map(); // gid -> Set<res>
  const push = gid => {
    const set = watchers.get(gid);
    if (set) { // a watcher gets the group only while they are a member (a removed member's stream sees null)
      const g = db.groups[gid] ?? null;
      for (const res of set) res.write(`data: ${JSON.stringify(g && g.members && g.members[res.uid] !== undefined ? g : null)}\n\n`);
    }
    dirty();
  };

  const group = gid => db.groups[gid] ?? null;
  const needGroup = gid => { const g = group(gid); if (!g) throw new HttpError(404, 'no such group'); return g; };
  const needOwner = (g, uid) => { if (g.owner !== uid) throw deny('owner only'); };

  function api(method, parts, uid, body) {
    // ---- users/{uid}: own read/write only ----
    if (parts[0] === 'users' && parts.length === 2) {
      if (parts[1] !== uid) throw deny('own data only');
      if (method === 'GET') return [200, db.users[uid] ?? null]; // like a database read: a missing record is just null
      if (method === 'PUT') {
        onlyKeys(body, ['name', 'swipes', 'groups', 'overrides', 'prefs', 'household']);
        if ('household' in body && !peopleOk(body.household)) throw bad('household');
        if (!isStr(body.name, 1, 40)) throw bad('name');
        if ('swipes' in body && !(isObj(body.swipes) && Object.entries(body.swipes).every(([k, v]) => KEY_RE.test(k) && [-1, 1, 2].includes(v)))) throw bad('swipes');
        if ('groups' in body && !(isObj(body.groups) && Object.entries(body.groups).every(([k, v]) => KEY_RE.test(k) && v === true))) throw bad('groups');
        if ('overrides' in body && !(isObj(body.overrides) && Object.entries(body.overrides).every(([k, v]) => TAG_RE.test(k) && [-1, 0, 1].includes(v)))) throw bad('overrides');
        if ('prefs' in body) {
          const p = body.prefs;
          if (!isObj(p) || Object.keys(p).some(k => !['airco', 'ev', 'kids', 'budget'].includes(k))) throw bad('prefs');
          for (const k of ['airco', 'ev', 'kids']) if (k in p && typeof p[k] !== 'boolean') throw bad('prefs');
          if ('budget' in p && !(isNum(p.budget) && p.budget >= 1 && p.budget <= 4 && p.budget % 1 === 0)) throw bad('prefs');
        }
        const u = { name: body.name, updatedAt: now() };
        if (body.swipes && Object.keys(body.swipes).length) u.swipes = body.swipes; // an empty map does not exist in the database
        if (body.groups && Object.keys(body.groups).length) u.groups = body.groups;
        if (body.overrides && Object.keys(body.overrides).length) u.overrides = body.overrides;
        if (body.prefs && Object.keys(body.prefs).length) u.prefs = body.prefs;
        if (body.household && Object.keys(body.household).length) u.household = body.household;
        db.users[uid] = u;
        dirty();
        return [200, { ok: true }];
      }
      throw new HttpError(404, 'not found');
    }
    // ---- codes/{token} = {gid, name}: direct get (the invite preview), never listed ----
    if (parts[0] === 'codes' && parts.length === 2 && method === 'GET') {
      const c = db.codes[parts[1]];
      if (!c) throw new HttpError(404, 'unknown code');
      return [200, { groupId: c.gid, name: c.name }];
    }
    if (parts[0] === 'me' && parts.length === 1 && method === 'GET') return [200, { uid, name: db.sessions[uid].name }]; // session check
    if (parts[0] !== 'groups') throw new HttpError(404, 'not found');

    const prefsOk = p => {
      if (!isObj(p) || !Object.keys(p).length || Object.keys(p).some(k => !['airco', 'ev', 'kids', 'budget'].includes(k))) return false;
      for (const k of ['airco', 'ev', 'kids']) if (k in p && typeof p[k] !== 'boolean') return false;
      return !('budget' in p) || (isNum(p.budget) && p.budget >= 1 && p.budget <= 4 && p.budget % 1 === 0);
    };
    const mine = g => g && g.members && g.members[uid] !== undefined; // a group can only be read by its members
    const setCode = (c, g, gid) => { db.codes[c] = { gid, name: g.name }; (g.codes ||= {})[c] = now(); };

    if (parts.length === 1) {
      if (method !== 'POST') throw new HttpError(404, 'groups cannot be listed');
      onlyKeys(body, ['id', 'name', 'memberName', 'codes']);
      if (!isKey(body.id)) throw bad('id');
      if (!isStr(body.name, 1, 30)) throw bad('name');
      if (!isStr(body.memberName, 1, 40)) throw bad('memberName');
      const codes = body.codes ?? [];
      if (!Array.isArray(codes) || new Set(codes).size !== codes.length) throw bad('codes');
      for (const c of codes) if (typeof c !== 'string' || !CODE_RE.test(c)) throw bad('code');
      if (group(body.id)) throw deny('exists');
      for (const c of codes) if (db.codes[c]) throw new HttpError(409, 'code taken');
      const g = { name: body.name, owner: uid, createdAt: now(), members: { [uid]: { name: body.memberName, via: 'owner' } } };
      for (const c of codes) setCode(c, g, body.id);
      db.groups[body.id] = g;
      push(body.id);
      return [201, { id: body.id }];
    }
    const gid = parts[1];
    const g = group(gid);
    const rest = parts.slice(2);
    if (!g) throw new HttpError(404, 'no such group');

    if (rest.length === 0 && method === 'GET') { if (!mine(g)) throw deny('members only'); return [200, g]; }
    if (rest.length === 0 && method === 'PATCH') { // rename: the invite previews follow
      needOwner(g, uid);
      onlyKeys(body, ['name']);
      if (!isStr(body.name, 1, 30)) throw bad('name');
      g.name = body.name;
      for (const c of Object.keys(g.codes || {})) if (db.codes[c]) db.codes[c].name = body.name;
      push(gid);
      return [200, { ok: true }];
    }
    if (rest.length === 0 && method === 'DELETE') { // the owner deletes the group together with its codes
      needOwner(g, uid);
      for (const c of Object.keys(g.codes || {})) delete db.codes[c];
      delete db.groups[gid];
      push(gid);
      return [200, { ok: true }];
    }
    if (rest[0] === 'events' && method === 'GET') { if (!mine(g)) throw deny('members only'); return ['sse', gid]; }

    if (rest[0] === 'codes') {
      const free = c => { if (typeof c !== 'string' || !CODE_RE.test(c)) throw bad('code'); if (db.codes[c]) throw new HttpError(409, 'code taken'); };
      if (rest.length === 1 && method === 'POST') {
        needOwner(g, uid);
        onlyKeys(body, ['code']);
        free(body.code);
        setCode(body.code, g, gid);
        push(gid);
        return [201, { code: body.code }];
      }
      if (rest.length === 2 && rest[1] === 'rotate' && method === 'POST') { // new link: the new token in, the old ones out, atomically
        needOwner(g, uid);
        onlyKeys(body, ['code', 'old']);
        free(body.code);
        if (!Array.isArray(body.old) || body.old.some(c => g.codes?.[c] === undefined || db.codes[c]?.gid !== gid)) throw bad('old');
        for (const c of body.old) { delete g.codes[c]; delete db.codes[c]; }
        setCode(body.code, g, gid);
        push(gid);
        return [200, { code: body.code }];
      }
      if (rest.length === 2 && method === 'DELETE') {
        needOwner(g, uid);
        if (g.codes?.[rest[1]] === undefined || db.codes[rest[1]]?.gid !== gid) throw new HttpError(404, 'no such code');
        delete g.codes[rest[1]];
        delete db.codes[rest[1]];
        if (!Object.keys(g.codes).length) delete g.codes;
        push(gid);
        return [200, { ok: true }];
      }
    }

    if (rest[0] === 'members') {
      if (rest.length === 1 && method === 'POST') { // join (proving an invite token) or rename myself
        onlyKeys(body, ['name', 'via']);
        if (!isStr(body.name, 1, 40)) throw bad('name');
        if (g.banned?.[uid]) throw deny('removed by the owner');
        if (g.members[uid] === undefined) { // joining: the token must belong to this group (the owner's own entry says "owner")
          const ok = (body.via === 'owner' && uid === g.owner) || (typeof body.via === 'string' && db.codes[body.via]?.gid === gid);
          if (!ok) throw deny('a valid invite link is needed');
          g.members[uid] = { name: body.name, via: body.via };
        } else g.members[uid].name = body.name;
        push(gid);
        return [201, { ok: true }];
      }
      if (rest.length === 2 && method === 'DELETE') {
        const target = rest[1];
        if (g.members[target] === undefined) throw new HttpError(404, 'no such member');
        const self = target === uid;
        if (self ? g.owner === uid : g.owner !== uid) throw deny(self ? 'the owner cannot leave' : 'owner only');
        delete g.members[target];
        if (g.profiles) { delete g.profiles[target]; if (!Object.keys(g.profiles).length) delete g.profiles; }
        if (!self) (g.banned ||= {})[target] = true; // removed by the owner: no rejoin, even with a valid link
        push(gid);
        return [200, { ok: true }];
      }
    }

    if (rest[0] === 'trip' && rest.length === 1 && method === 'PUT') { // every member plans along
      if (!mine(g) || g.banned?.[uid]) throw deny('members only');
      if (!tripOk(body)) throw bad('trip');
      g.trip = { ...body, updatedAt: now() };
      if (g.trip.party && !Object.keys(g.trip.party).length) delete g.trip.party;
      push(gid);
      return [200, { ok: true }];
    }
    if (rest[0] === 'banned' && rest.length === 2 && method === 'DELETE') { // the owner lifts the ban
      needOwner(g, uid);
      if (g.banned) { delete g.banned[rest[1]]; if (!Object.keys(g.banned).length) delete g.banned; }
      push(gid);
      return [200, { ok: true }];
    }

    if (rest[0] === 'profiles' && rest.length === 2) {
      const target = rest[1];
      if (method === 'PUT') {
        if (target !== uid || g.members[uid] === undefined) throw deny('members write only their own profile');
        onlyKeys(body, ['w', 'c', 'n', 'prefs']);
        if (!numMap(body.w, TAG_RE, -1, 1) || !numMap(body.c, TAG_RE, 0, 500)) throw bad('w/c');
        if (!isNum(body.n) || body.n < 0 || body.n > 500 || body.n % 1 !== 0) throw bad('n');
        if ('prefs' in body && !prefsOk(body.prefs)) throw bad('prefs');
        const prof = { w: body.w, c: body.c, n: body.n, updatedAt: now() };
        if (body.prefs) prof.prefs = body.prefs;
        (g.profiles ||= {})[uid] = prof;
        push(gid);
        return [200, { ok: true }];
      }
      if (method === 'DELETE') {
        if (target !== uid && g.owner !== uid) throw deny('not yours');
        if (g.profiles) { delete g.profiles[target]; if (!Object.keys(g.profiles).length) delete g.profiles; }
        push(gid);
        return [200, { ok: true }];
      }
    }
    throw new HttpError(404, 'not found');
  }

  const readBody = req => new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 200000) { reject(bad('too large')); req.destroy(); } });
    req.on('end', () => {
      if (!s) return resolve(undefined);
      try { resolve(JSON.parse(s)); } catch { reject(bad('json')); }
    });
    req.on('error', reject);
  });

  const json = (res, status, obj) => {
    res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    res.end(JSON.stringify(obj));
  };

  function serveStatic(req, res, pathname) {
    let rel;
    try { rel = decodeURIComponent(pathname).replace(/^\/+/, ''); } catch { return json(res, 400, { error: 'bad path' }); }
    if (rel === '' || rel.endsWith('/')) rel += 'index.html';
    const abs = path.resolve(ROOT, rel);
    const relOut = path.relative(ROOT, abs).replace(/\\/g, '/');
    if (relOut.startsWith('..') || path.isAbsolute(relOut) || relOut.split('/').some(s => s.startsWith('.')) || STATIC_BLOCK.test(relOut)) {
      return json(res, 404, { error: 'not found' });
    }
    fs.readFile(abs, (err, buf) => {
      if (err) return json(res, 404, { error: 'not found' });
      res.writeHead(200, { 'content-type': MIME[path.extname(abs)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(buf);
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method' });
        return serveStatic(req, res, url.pathname);
      }
      const body = ['POST', 'PATCH', 'PUT'].includes(req.method) ? await readBody(req) : undefined;
      // POST /api/session {uid?, name?} -> {uid, secret, name}: the dev stand-in for the Google sign-in
      if (url.pathname === '/api/session' && req.method === 'POST') {
        const want = body && body.uid;
        if (want !== undefined && !isKey(want)) throw bad('uid');
        const uid = want ?? 'u-' + crypto.randomBytes(8).toString('hex');
        if (db.sessions[uid]) throw new HttpError(409, 'uid taken');
        const name = body && body.name !== undefined ? body.name : 'Dev ' + uid.slice(-4);
        if (!isStr(name, 1, 40)) throw bad('name');
        db.sessions[uid] = { secret: crypto.randomBytes(16).toString('hex'), name };
        dirty();
        return json(res, 201, { uid, secret: db.sessions[uid].secret, name });
      }
      // EventSource cannot set headers, so SSE may pass uid/secret as query parameters
      const uid = req.headers['x-uid'] || url.searchParams.get('uid');
      const secret = req.headers['x-secret'] || url.searchParams.get('secret');
      if (!isKey(uid) || typeof secret !== 'string' || !db.sessions[uid] || !sameSecret(db.sessions[uid].secret, secret)) throw new HttpError(401, 'auth required');
      const parts = url.pathname.split('/').slice(2).filter(Boolean);
      const out = api(req.method, parts, uid, body);
      if (out[0] === 'sse') {
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
        res.write(`retry: 1000\ndata: ${JSON.stringify(group(out[1]))}\n\n`);
        if (!watchers.has(out[1])) watchers.set(out[1], new Set());
        res.uid = uid;
        watchers.get(out[1]).add(res);
        req.on('close', () => watchers.get(out[1])?.delete(res));
        return;
      }
      json(res, out[0], out[1]);
    } catch (e) {
      if (e instanceof HttpError) return json(res, e.status, { error: e.message });
      console.error(e);
      json(res, 500, { error: 'server error' });
    }
  });

  const ping = setInterval(() => { for (const set of watchers.values()) for (const r of set) r.write(': ping\n\n'); }, 20000);
  ping.unref();

  return new Promise(resolve => {
    server.listen(port, host, () => {
      resolve({
        server,
        port: server.address().port,
        db: () => db,
        close() {
          clearInterval(ping);
          flush();
          for (const set of watchers.values()) for (const r of set) r.end();
          return new Promise(r => { server.close(r); server.closeAllConnections(); });
        },
      });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const persist = process.env.DEV_PERSIST === '0' ? null : path.join(ROOT, '.devdata.json');
  const s = await startServer({ port: Number(process.env.PORT) || 8788, host: process.env.HOST || '127.0.0.1', persistFile: persist });
  console.log(`Corsica dev server: http://localhost:${s.port}/`);
}
