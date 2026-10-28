// Dev adapter: talks to dev-server.mjs (fetch + Server-Sent Events) with a fake sign-in. Same interface as store-firebase.js.
const err = (code, msg) => Object.assign(new Error(msg || code), { code });

export async function createStore() {
  const q = new URLSearchParams(location.search);
  const read = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const write = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* private mode */ } };
  let me = null; // {uid, name, secret}
  const listeners = new Set();
  const emit = () => listeners.forEach(f => f(me && { uid: me.uid, name: me.name }));

  async function register(uid, name) {
    const res = await fetch('/api/session', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(uid ? { uid } : {}), ...(name ? { name } : {}) }) });
    return res.ok ? res.json() : null;
  }
  const valid = async (u, s) => {
    try { return (await fetch('/api/me', { headers: { 'x-uid': u, 'x-secret': s } })).status !== 401; } catch { return true; }
  };
  const remember = s => { me = s; write('corsica_dev_uid', s.uid); write('corsica_dev_secret', s.secret); write('corsica_dev_name', s.name); };

  // restore a previous dev sign-in
  const su = read('corsica_dev_uid'), ss = read('corsica_dev_secret');
  if (su && ss && await valid(su, ss)) me = { uid: su, secret: ss, name: read('corsica_dev_name') || 'Dev' };
  // test hook (localhost only, this adapter only runs there): ?devuid=anna&devname=Anna signs in without a click
  const forced = q.get('devuid');
  if (forced && (!me || me.uid !== forced)) {
    const secret = q.get('devsecret');
    if (secret && await valid(forced, secret)) remember({ uid: forced, secret, name: q.get('devname') || forced });
    else { const s = await register(forced, q.get('devname') || undefined); if (s) remember(s); }
  }

  async function api(method, url, body) {
    if (!me) throw err('denied');
    let res;
    try {
      res = await fetch('/api' + url, { method, headers: { 'x-uid': me.uid, 'x-secret': me.secret, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    } catch { throw err('network'); }
    const json = await res.json().catch(() => null);
    if (res.status === 409) throw err('taken');
    if (res.status === 403) throw err('denied');
    if (res.status === 404) return { notFound: true };
    if (!res.ok) throw err('invalid', json && json.error);
    return json;
  }

  const online = new Set();
  let open = 0, isOnline = true;
  const setOnline = v => { if (v !== isOnline) { isOnline = v; online.forEach(f => f(v)); } };

  return {
    kind: 'dev',
    auth: {
      get user() { return me && { uid: me.uid, name: me.name }; },
      canAnonymous: true,
      onChange(cb) { listeners.add(cb); cb(me && { uid: me.uid, name: me.name }); return () => listeners.delete(cb); },
      async signInGoogle() { // fake: a new dev identity, named by ?devname
        const s = await register(null, q.get('devname') || 'Dev Tester');
        if (!s) throw err('network');
        remember(s); emit();
      },
      async signInAnonymous() { // the dev server has no rules about it (production refuses anonymous users)
        const s = await register(null, 'Gast');
        if (!s) throw err('network');
        remember(s); emit();
      },
      async signOut() { me = null; write('corsica_dev_uid', null); write('corsica_dev_secret', null); write('corsica_dev_name', null); emit(); },
    },
    now: () => Date.now(),
    onOnline(cb) { online.add(cb); cb(isOnline); return () => online.delete(cb); },
    async getUser() { const r = await api('GET', '/users/' + me.uid); return r && !r.notFound ? r : null; },
    async saveUser({ name, swipes, groups, overrides, prefs }) {
      await api('PUT', '/users/' + me.uid, { name, ...(swipes ? { swipes } : {}), ...(groups ? { groups } : {}), ...(overrides ? { overrides } : {}), ...(prefs ? { prefs } : {}) });
    },
    // the invite preview: {gid, name} or null
    async resolveCode(code) { const r = await api('GET', '/codes/' + code); return r.notFound ? null : { gid: r.groupId, name: r.name }; },
    async fetchGroup(gid) { try { const r = await api('GET', '/groups/' + gid); return r.notFound ? null : r; } catch (e) { if (e.code === 'denied') return null; throw e; } },
    watchGroup(gid, cb) {
      const es = new EventSource(`/api/groups/${gid}/events?uid=${encodeURIComponent(me.uid)}&secret=${encodeURIComponent(me.secret)}`);
      let up = false;
      es.onopen = () => { if (!up) { up = true; open++; } setOnline(true); };
      es.onerror = () => { if (up) { up = false; open--; } if (open <= 0) setOnline(false); };
      es.onmessage = e => cb(JSON.parse(e.data));
      return () => { es.close(); if (up) open--; };
    },
    createGroup: ({ id, name, memberName, codes }) => api('POST', '/groups', { id, name, memberName, codes }),
    renameGroup: (gid, name) => api('PATCH', '/groups/' + gid, { name }), // the dev server renames the invite previews too
    addCode: (gid, code) => api('POST', `/groups/${gid}/codes`, { code }),
    rotateLink: (gid, code, old) => api('POST', `/groups/${gid}/codes/rotate`, { code, old }),
    deleteCode: (gid, code) => api('DELETE', `/groups/${gid}/codes/${code}`),
    join: (gid, name, via) => api('POST', `/groups/${gid}/members`, { name, via }),
    setMemberName: (gid, name) => api('POST', `/groups/${gid}/members`, { name }),
    removeMember: (gid, uid) => api('DELETE', `/groups/${gid}/members/${uid}`), // the owner removing somebody bans them
    unban: (gid, uid) => api('DELETE', `/groups/${gid}/banned/${uid}`),
    deleteGroup: gid => api('DELETE', '/groups/' + gid),
    setProfile: (gid, { w, c, n, prefs }) => api('PUT', `/groups/${gid}/profiles/${me.uid}`, { w, c, n, ...(prefs && Object.keys(prefs).length ? { prefs } : {}) }),
    deleteProfile: (gid, uid = me.uid) => api('DELETE', `/groups/${gid}/profiles/${uid}`),
  };
}
