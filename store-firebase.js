// Firebase adapter: Realtime Database + Google sign-in (modular SDK from the gstatic CDN, pinned).
// Anonymous sign-in exists only as a test fallback on localhost (?test=1); the production rules refuse anonymous users anyway.
const V = '12.0.0';
const CDN = `https://www.gstatic.com/firebasejs/${V}/`;
const err = (code, msg) => Object.assign(new Error(msg || code), { code });

export async function createStore(config) {
  const [{ initializeApp }, A, db] = await Promise.all([
    import(CDN + 'firebase-app.js'),
    import(CDN + 'firebase-auth.js'),
    import(CDN + 'firebase-database.js'),
  ]);
  const { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } = A;
  const { getDatabase, ref, onValue, get, set, update, serverTimestamp } = db;
  const app = initializeApp(config);
  const auth = getAuth(app);
  let authError = null; // the last sign-in problem (popup or redirect), shown by the app as a toast
  await getRedirectResult(auth).catch(e => { authError = e && e.code ? e.code : 'unknown'; }); // finish a Google redirect before reading the user
  let current = await new Promise(resolve => { const off = onAuthStateChanged(auth, u => { off(); resolve(u); }); });
  const listeners = new Set();
  const view = u => (u ? { uid: u.uid, name: u.displayName || 'Reiziger' } : null);
  onAuthStateChanged(auth, u => { current = u; listeners.forEach(f => f(view(u))); });

  const d = getDatabase(app);
  const R = p => ref(d, p);
  const ts = () => serverTimestamp(); // timestamps are server time: a skewed phone clock cannot break the rules
  const wrap = async fn => {
    try { return await fn(); } catch (e) {
      if (/permission[_ ]denied/i.test(String(e && e.code) + " " + String(e && e.message))) throw err('denied');
      throw err('network', e && e.message);
    }
  };
  const multi = updates => wrap(() => update(ref(d), updates)); // ref(d) = root; ref(d, '') is an invalid path in v12
  const uid = () => { if (!current) throw err('denied'); return current.uid; };
  const taken = async (e, code, self) => { if (e.code === 'denied' && await self.resolveCode(code).catch(() => null)) throw err('taken'); throw e; };
  // codes/{token} = {gid, name}: the name is the invite preview and always equals the group name
  const codeValue = (gid, name) => ({ gid, name });

  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const anonymousOk = local && new URLSearchParams(location.search).get('test') === '1';

  const authApi = {
    get user() { return view(current); },
    canAnonymous: anonymousOk,
    onChange(cb) { listeners.add(cb); cb(view(current)); return () => listeners.delete(cb); },
    takeError() { const e = authError; authError = null; return e; },
    // a popup everywhere: it works when it is opened from the tap handler (also on iOS); the redirect is only the fallback for a blocked popup
    async signInGoogle() {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      try { await signInWithPopup(auth, provider); } catch (e) {
        const code = (e && e.code) || 'unknown';
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
          try { return await signInWithRedirect(auth, provider); } catch (e2) { throw err('auth', (e2 && e2.code) || 'unknown'); }
        }
        if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return; // the person closed it
        throw err('auth', code);
      }
    },
    signOut: () => signOut(auth),
  };
  if (anonymousOk) authApi.signInAnonymous = async () => { await A.signInAnonymously(auth); }; // tests only: the rules refuse anonymous users

  return {
    kind: 'firebase',
    auth: authApi,
    now: () => Date.now(),
    onOnline(cb) { return onValue(R('.info/connected'), s => cb(s.val() === true)); },
    getUser: () => wrap(async () => (await get(R('users/' + uid()))).val()),
    saveUser({ name, swipes, groups, overrides, prefs, household }) {
      const v = { name, updatedAt: ts() };
      if (swipes && Object.keys(swipes).length) v.swipes = swipes; // an empty map does not exist in RTDB
      if (groups && Object.keys(groups).length) v.groups = groups;
      if (overrides && Object.keys(overrides).length) v.overrides = overrides;
      if (prefs && Object.keys(prefs).length) v.prefs = prefs;
      if (household && Object.keys(household).length) v.household = household;
      return wrap(() => set(R('users/' + uid()), v));
    },
    // the invite preview: {gid, name} or null
    resolveCode: code => wrap(async () => { const v = (await get(R('codes/' + code))).val(); return v && v.gid ? { gid: v.gid, name: v.name } : null; }),
    fetchGroup: gid => wrap(async () => (await get(R('groups/' + gid))).val()),
    watchGroup(gid, cb, onErr) { return onValue(R('groups/' + gid), s => cb(s.val()), e => onErr && onErr(e)); },
    async createGroup({ id, name, memberName, codes }) {
      const g = { name, owner: uid(), createdAt: ts(), members: { [uid()]: { name: memberName, via: 'owner' } } };
      if (codes.length) g.codes = Object.fromEntries(codes.map(c => [c, ts()]));
      const u = { ['groups/' + id]: g };
      for (const c of codes) u['codes/' + c] = codeValue(id, name);
      try { await multi(u); } catch (e) {
        if (e.code === 'denied') for (const c of codes) if (await this.resolveCode(c).catch(() => null)) throw err('taken');
        throw e;
      }
    },
    // the group and its invite previews change together
    renameGroup(gid, name, codes = []) {
      const u = { [`groups/${gid}/name`]: name };
      for (const c of codes) u[`codes/${c}/name`] = name;
      return multi(u);
    },
    async addCode(gid, code, name) {
      try { await multi({ ['codes/' + code]: codeValue(gid, name), [`groups/${gid}/codes/${code}`]: ts() }); } catch (e) { await taken(e, code, this); }
    },
    // new link in ONE write: the new token in, the old ones out
    async rotateLink(gid, code, old, name) {
      const u = { ['codes/' + code]: codeValue(gid, name), [`groups/${gid}/codes/${code}`]: ts() };
      for (const c of old) { u['codes/' + c] = null; u[`groups/${gid}/codes/${c}`] = null; }
      try { await multi(u); } catch (e) { await taken(e, code, this); }
    },
    deleteCode: (gid, code) => multi({ ['codes/' + code]: null, [`groups/${gid}/codes/${code}`]: null }),
    // joining proves a valid invite token (via)
    join: (gid, name, via) => wrap(() => set(R(`groups/${gid}/members/${uid()}`), { name, via })),
    setMemberName: (gid, name) => wrap(() => set(R(`groups/${gid}/members/${uid()}/name`), name)),
    // leaving, or the owner removing somebody (who is then banned in the same write: no way back with any link)
    removeMember(gid, who) {
      const u = { [`groups/${gid}/members/${who}`]: null, [`groups/${gid}/profiles/${who}`]: null };
      if (who !== uid()) u[`groups/${gid}/banned/${who}`] = true;
      return multi(u);
    },
    unban: (gid, who) => wrap(() => set(R(`groups/${gid}/banned/${who}`), null)),
    // the owner deletes the group together with its invite codes
    deleteGroup(gid, codes = []) {
      const u = { ['groups/' + gid]: null };
      for (const c of codes) u['codes/' + c] = null;
      return multi(u);
    },
    setProfile: (gid, { w, c, n, prefs }) => wrap(() => set(R(`groups/${gid}/profiles/${uid()}`), { w, c, n, ...(prefs && Object.keys(prefs).length ? { prefs } : {}), updatedAt: ts() })),
    // the trip settings: any member writes them (dates, party, highlights)
    setTrip: (gid, trip) => wrap(() => set(R(`groups/${gid}/trip`), { ...trip, updatedAt: ts() })),
    deleteProfile: (gid, who = uid()) => wrap(() => set(R(`groups/${gid}/profiles/${who}`), null)),
  };
}
