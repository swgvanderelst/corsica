// Generates database.rules.json (kept as a script so the long expressions stay readable).
// dev-server.mjs must enforce exactly the same permissions (except the anonymous check, which only exists in production);
// test/parity.test.js checks that.
import fs from 'node:fs';

const KEY = '/^[-_A-Za-z0-9]{1,32}$/'; // every client-chosen key/id/uid: safe to put in HTML attributes
const TOKEN = '/^[A-Za-z0-9]{10,32}$/'; // join tokens: 12 random chars, never typed
const TAG = '/^[a-z_]{1,24}$/'; // tag names in a profile summary
const TIME = 'newData.isNumber() && newData.val() > 0 && newData.val() <= now + 300000'; // rules `now` is server time
// every read and write needs a real sign-in: anonymous users (the test fallback) are refused in production
const AUTHED = "auth != null && auth.token.firebase.sign_in_provider !== 'anonymous'";
const G = "root.child('groups').child($gid)"; // old state of this group
const OWNER = `${G}.child('owner').val()`;
const NEWG = 'newData.parent().parent()'; // from members/$uid, profiles/$uid: the group after this write
const NEWG3 = 'newData.parent().parent().parent()'; // from members/$uid/via: the group after this write
const NR = 'newData.parent().parent().parent().parent()'; // from groups/$gid/codes/$c: the root after this write
const NR5 = 'newData.parent().parent().parent().parent().parent()'; // from groups/$gid/members/$uid/via
const SWIPE = 'newData.val() === -1 || newData.val() === 1 || newData.val() === 2';
const PREFS = {
  '.validate': 'newData.hasChildren()',
  airco: { '.validate': 'newData.isBoolean()' }, ev: { '.validate': 'newData.isBoolean()' }, kids: { '.validate': 'newData.isBoolean()' },
  budget: { '.validate': 'newData.isNumber() && newData.val() >= 1 && newData.val() <= 4 && newData.val() % 1 === 0' },
  $other: { '.validate': false },
};

// a person in a household or a travel party: keys p0..p11 cap the list at 12 (rules cannot count)
const PERSON_KEY = '/^p([0-9]|1[01])$/';
const PEOPLE = {
  '.validate': 'newData.hasChildren()',
  $p: {
    '.validate': `$p.matches(${PERSON_KEY}) && newData.hasChildren(['name'])`,
    name: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 40' },
    born: { '.validate': 'newData.isNumber() && newData.val() >= 1920 && newData.val() <= 2040 && newData.val() % 1 === 0' },
    uid: { '.validate': `newData.isString() && newData.val().matches(${KEY})` },
    $other: { '.validate': false },
  },
};
const DATE = '/^20[2-9][0-9]-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/';
const MONTHS = '/^20[2-9][0-9]-(0[1-9]|1[0-2])( 20[2-9][0-9]-(0[1-9]|1[0-2])){0,2}$/';

// codes/$code: newData.parent().parent() is the root after the write
const CR = 'newData.parent().parent()';
const CODE_GID = "newData.child('gid').val()";
const CODE_GROUP = `${CR}.child('groups').child(${CODE_GID})`;

const rules = {
  rules: {
    // everybody reads and writes only their own taste profile
    users: {
      $uid: {
        '.read': `${AUTHED} && auth.uid === $uid`,
        '.write': `${AUTHED} && auth.uid === $uid`,
        '.validate': `$uid.matches(${KEY}) && newData.hasChildren(['name', 'updatedAt'])`,
        name: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 40' },
        swipes: { '.validate': 'newData.hasChildren()', $card: { '.validate': `$card.matches(${KEY}) && (${SWIPE})` } },
        groups: { '.validate': 'newData.hasChildren()', $g: { '.validate': `$g.matches(${KEY}) && newData.val() === true` } },
        // manual taste corrections from the profile screen: tag -> -1 | 0 | 1
        overrides: { '.validate': 'newData.hasChildren()', $t: { '.validate': `$t.matches(${TAG}) && (newData.val() === -1 || newData.val() === 0 || newData.val() === 1)` } },
        // switches and a budget cap (1-4 euro signs)
        prefs: PREFS,
        // my household: the default travel party of a new trip
        household: PEOPLE,
        updatedAt: { '.validate': TIME },
        $other: { '.validate': false },
      },
    },
    codes: {
      // invite links: codes/{token} = {gid, name}. Direct get allowed (the invite preview), no listing: no .read on "codes" itself
      $code: {
        '.read': AUTHED,
        '.write': `${AUTHED} && (`
          // create: free token, for a group I own, and the group lists it too
          + `(!data.exists() && ${CODE_GROUP}.child('owner').val() === auth.uid && ${CODE_GROUP}.child('codes').child($code).exists())`
          // delete: the owner, together with the group's own entry
          + " || (data.exists() && !newData.exists() && root.child('groups').child(data.child('gid').val()).child('owner').val() === auth.uid"
          + ` && !${CR}.child('groups').child(data.child('gid').val()).child('codes').child($code).exists())`
          // update: the owner renames the preview together with the group (the gid never changes)
          + " || (data.exists() && newData.exists() && newData.child('gid').val() === data.child('gid').val() && newData.child('name').val() !== data.child('name').val() && root.child('groups').child(data.child('gid').val()).child('owner').val() === auth.uid))",
        '.validate': `$code.matches(${TOKEN}) && newData.hasChildren(['gid', 'name'])`,
        gid: { '.validate': `newData.isString() && newData.val().matches(${KEY})` },
        // the preview name is the group's name
        name: { '.validate': "newData.isString() && newData.val() === newData.parent().parent().parent().child('groups').child(newData.parent().child('gid').val()).child('name').val()" },
        $other: { '.validate': false },
      },
    },
    groups: {
      // no .read here: groups cannot be listed; a group is readable by its members only
      $gid: {
        '.read': `${AUTHED} && data.child('members').child(auth.uid).exists()`,
        // any signed-in user may create a group (once per id); the owner may delete it (with its codes in the same write)
        '.write': `${AUTHED} && ((!data.exists() && newData.child('owner').val() === auth.uid) || (data.exists() && !newData.exists() && data.child('owner').val() === auth.uid))`,
        '.validate': `$gid.matches(${KEY}) && newData.hasChildren(['name', 'owner', 'createdAt', 'members'])`
          + " && (data.exists() || (newData.child('members').child(auth.uid).exists() && !newData.child('profiles').exists() && !newData.child('banned').exists()))",
        name: {
          '.write': `${AUTHED} && ${OWNER} === auth.uid`,
          '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 30',
        },
        owner: { '.validate': 'newData.val() === auth.uid' },
        createdAt: { '.validate': TIME },
        codes: {
          '.validate': 'newData.hasChildren()',
          $c: {
            '.write': `${AUTHED} && ${OWNER} === auth.uid && (newData.exists() || !${NR}.child('codes').child($c).exists())`,
            // must pair with codes/$c -> this group (checked on the data after the write)
            '.validate': `$c.matches(${TOKEN}) && newData.isNumber() && newData.val() > 0 && newData.val() <= now + 300000 && ${NR}.child('codes').child($c).child('gid').val() === $gid`,
          },
        },
        members: {
          // members/$uid = {name, via}: joining proves a valid invite token (via); the owner's own entry says "owner".
          $uid: {
            // self: join or rename (not when banned). Remove: the owner removes others, a member removes themselves, the owner cannot leave.
            '.write': `${AUTHED} && (($uid === auth.uid && newData.exists() && ${G}.child('owner').exists() && !${G}.child('banned').child(auth.uid).exists())`
              + ` || (data.exists() && !newData.exists() && (($uid === auth.uid && ${OWNER} !== auth.uid) || (${OWNER} === auth.uid && $uid !== auth.uid))))`,
            '.validate': `$uid.matches(${KEY}) && newData.hasChildren(['name', 'via']) && (data.exists() || $uid === auth.uid)`,
            name: { '.validate': 'newData.isString() && newData.val().length >= 1 && newData.val().length <= 40' },
            via: { '.validate': `newData.isString() && ((newData.val() === 'owner' && $uid === ${NEWG3}.child('owner').val()) || ${NR5}.child('codes').child(newData.val()).child('gid').val() === $gid)` },
            $other: { '.validate': false },
          },
        },
        // removed on purpose by the owner: cannot rejoin, even with a valid link
        banned: {
          '.validate': 'newData.hasChildren()',
          $uid: {
            '.write': `${AUTHED} && ${OWNER} === auth.uid && $uid !== auth.uid`,
            '.validate': `$uid.matches(${KEY}) && newData.val() === true`,
          },
        },
        profiles: {
          // a swipe summary (plus the travel preferences): only the member writes their own; the owner or the member removes it
          $uid: {
            '.write': `${AUTHED} && (`
              + `(newData.exists() && $uid === auth.uid && ${NEWG}.child('members').child(auth.uid).exists())`
              + ` || (!newData.exists() && ($uid === auth.uid || ${OWNER} === auth.uid)))`,
            '.validate': `$uid.matches(${KEY}) && newData.hasChildren(['w', 'c', 'n', 'updatedAt'])`,
            w: { '.validate': 'newData.hasChildren()', $t: { '.validate': `$t.matches(${TAG}) && newData.isNumber() && newData.val() >= -1 && newData.val() <= 1` } },
            c: { '.validate': 'newData.hasChildren()', $t: { '.validate': `$t.matches(${TAG}) && newData.isNumber() && newData.val() >= 0 && newData.val() <= 500` } },
            n: { '.validate': 'newData.isNumber() && newData.val() >= 0 && newData.val() <= 500 && newData.val() % 1 === 0' },
            prefs: PREFS,
            updatedAt: { '.validate': TIME },
            $other: { '.validate': false },
          },
        },
        // the trip settings: every member plans along (dates, party, highlights); removed only with the group
        trip: {
          '.write': `${AUTHED} && newData.exists() && ${G}.child('members').child(auth.uid).exists() && !${G}.child('banned').child(auth.uid).exists()`,
          '.validate': "newData.hasChildren(['dest', 'nights', 'updatedAt'])",
          dest: { '.validate': `newData.isString() && newData.val().matches(${KEY})` },
          nights: { '.validate': 'newData.isNumber() && newData.val() >= 3 && newData.val() <= 28 && newData.val() % 1 === 0' },
          start: { '.validate': `newData.isString() && newData.val().matches(${DATE})` },
          end: { '.validate': `newData.isString() && newData.val().matches(${DATE})` },
          months: { '.validate': `newData.isString() && newData.val().matches(${MONTHS})` },
          party: PEOPLE,
          // how much moving around the party wants
          pace: { '.validate': "newData.isString() && (newData.val() === 'calm' || newData.val() === 'normal' || newData.val() === 'active')" },
          // the longest drive on one moving day, in minutes
          maxLeg: { '.validate': 'newData.isNumber() && newData.val() >= 60 && newData.val() <= 600 && newData.val() % 1 === 0' },
          // chosen highlight ids, space separated
          highlights: { '.validate': 'newData.isString() && newData.val().length <= 1000 && newData.val().matches(/^[-a-z0-9 ]*$/)' },
          updatedAt: { '.validate': TIME },
          $other: { '.validate': false },
        },
        $other: { '.validate': false },
      },
    },
  },
};
fs.writeFileSync(new URL('../database.rules.json', import.meta.url), JSON.stringify(rules, null, 2) + '\n');
