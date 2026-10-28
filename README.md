# Corsica

A travel planner that learns your taste. You sign in with Google, swipe 25 accommodation cards and 25 activity cards,
and the app ranks the routes, picks 3 stays per stop and shows the activities nearby on a map. Travel companions join through
a link and the trip is planned on the combined profile.

Plain ES modules on GitHub Pages plus Firebase (Auth + Realtime Database). No build step. Same setup as De Michel (see the `firebase-app` skill).

## Run

```
npm install
npm run dev            # dev server on http://localhost:8788 (fake Google sign-in, in-memory + .devdata.json)
npm test               # unit, parity, rules, catalog, sw and simulate tests
npm run coverage       # coverage of logic.js (target >= 95% branches)
node tools/smoke.mjs   # Edge, 390x844: sign-in, both decks (drag + buttons + undo), profile, routes, map pins, group
node tools/firebase-smoke.mjs   # against the real Firebase rules (needs firebase-config.js)
```

Test data: `node tools/make-fixtures.mjs` writes `test/fixtures/`; open the app on any catalog with `?dest=test/fixtures/destination.json`.
`REAL=1 node tools/smoke.mjs` runs the smoke test on the real catalog. Screenshots go to `SHOTS` (default `./shots`).

## Layout

| File | What |
|---|---|
| `logic.js` | pure: profile, scoring, MMR diversity, route ranking, groups, learning curve (`test/logic.test.js`) |
| `app.js`, `deck.js`, `maps.js`, `styles.css`, `index.html` | UI: login, decks (drag physics), profile, routes, stops, groups; Leaflet + SVG maps |
| `store.js` | picks the adapter: `store-dev.js` on localhost, `store-firebase.js` everywhere else |
| `dev-server.mjs` | zero-dependency dev backend that mirrors the rules |
| `scripts/gen-rules.mjs` | generates `database.rules.json` (edit the generator, never the JSON) |
| `sw.js`, `scripts/sw-hash.mjs` | offline shell; `test/sw-version.json` fails the tests when the shell changed without a `VERSION` bump |
| `tools/simulate.mjs` | proposal from a swipes file for k = 5, 10, 15, 20, 25 cards per deck |
| `destinations/` | all destination data (below) |

## Data model (Firebase)

All reads and writes need a real (Google) sign-in: the production rules refuse anonymous users. The dev server ignores that check.

- `users/{uid}`: `{ name, swipes{cardId: -1|1|2}, overrides{tag: -1|0|1}, prefs{airco, ev, kids, budget 1-4}, groups{gid: true}, updatedAt }`. Own read/write only. `name` is the name shown in groups (the Google first name, editable in the profile).
- `groups/{gid}`: `{ name, owner, createdAt, members{uid: {name, via}}, codes{token: time}, banned{uid: true} }`. **Readable by its members only.**
  Joining writes `members/{uid} = {name, via: <invite token>}`, and the rules check that the token belongs to this group (`codes/{token}.gid`). The owner's own entry has `via: "owner"`.
  The owner removes a member and bans them in the same write: a removed member cannot read, and cannot rejoin even with a valid link until the owner lifts the ban. Leaving yourself is not a ban.
  The owner can delete the group together with its codes.
- `groups/{gid}/profiles/{uid}` = `{ w{tag: -1..1}, c{tag: evidence}, n, prefs?, updatedAt }`: a swipe summary plus travel preferences that only the member writes for themselves. Groups combine the preferences (strictest budget, union of the must-haves).
- `codes/{token}` = `{ gid, name }`: the invite link `?g=<token>` and the only thing a stranger can see before joining (the group name). Direct get only, never listed. Any signed-in user may create a group. Renaming a group renames its codes in the same write.

Changing a rule: edit `scripts/gen-rules.mjs` AND `dev-server.mjs`, add a case to `test/parity.test.js` (and `test/rules-attacks.test.js` for rules-only attacks), run `node scripts/gen-rules.mjs`, deploy `database.rules.json` in the console.
`tools/firebase-smoke.mjs` against the real project only proves that anonymous users are denied; the full multi-user flows run with `node tools/firebase-smoke.mjs --dev` and in `tools/smoke.mjs`.

## Untrusted data

A destination is a set of files: ids and numbers are sanitised on load (`sanitizeRoutes`, `sanitizePlaces`, `sanitizeItems`, `sanitizeCards` in `logic.js`), every file must be same-origin, and `?dest=` only works on localhost for files under `destinations/` or `test/fixtures/`.
Tags in other people's data must be in `destinations/tags.json`.

## Adding a destination

Everything about a place is data under `destinations/<name>/`; no code changes.

1. **`destinations/<name>/destination.json`**: manifest with `id`, `name`, `center`, `zoom`, `tags`, `places`, `routes`, `catalogs` (list), `deck`, `credits`, `base`, `stayImages`.
   The app loads `destinations/corsica/destination.json`, or another one with `?dest=path/to/destination.json`.
2. **`places.json`**: `places` (`key: [lon, lat]` of every stop and via-point), `names` (map labels), `outline` (island polygon for the SVG map),
   `stays` (one entry per accommodation region: `name, short, kind, desc, img, profile{coast,mountains,town,quiet,lively}, sights, food`),
   `regionTags` (which tags make up each region trait), `tips`.
3. **`routes.json`**: `routes[]` with `id` (one letter), `name, sub, title, lead, ferry, stops, stays, nights, profile{...}, legs[{from,to,km,min,via}]`, optional `days`.
   `stays` use the same keys as `places.stays` and the `region` of the catalog accommodations. `profile` is the 0..1 share of each trait.
4. **Catalog** (`catalog-*.json`, any number of files, each `{accommodations: [...], activities: [...]}`):
   - accommodation `{id, name, region, url, lat, lon, priceLevel 1-4, tags, desc, photo, photoGeneric}`
   - activity `{id, name, region, url, lat, lon, durationH, tags, desc, photo}`
   - `tags`: array (weight 1) or `{tag: 0..1}`, only tags from `destinations/tags.json` (the closed vocabulary; add a tag there first).
   - `photo`: `{file|url, license, author, source}`, or a path that has a licence entry in `credits.json`. Local files live next to the destination files; `photoGeneric` is an illustrative photo of the kind of place.
5. **`destinations/swipe-deck.json`**: `{accommodations: [25 cards], activities: [25 cards]}`; card `{id, title, sub, tags, photo}`.
   Order matters: broad contrasts first, refinement later (the learning curve uses the first k cards). Card ids are database keys: `[-_A-Za-z0-9]{1,32}`.
6. **Check**: `npm test`. `test/catalog.test.js` runs on the real files as soon as they exist: items have an https url, coordinates on the island,
   valid tags and a licensed photo; at least 3 accommodations per region, at least 5 activities within 30 km of every stop; every tag is on at least 2 deck cards.
7. **Release**: run `node scripts/gen-sw-data.mjs` (lists every file under `destinations/` in `sw.js`, they are precached), bump `VERSION` in `sw.js`, run `node scripts/sw-hash.mjs`, commit, push. The hash covers the data files, so the tests fail until you do.

## Deploy

1. Create the Firebase project: Realtime Database (europe-west1), Authentication with Google (and Anonymous for testers), register a Web app, paste the config in `firebase-config.js`.
2. Add `<user>.github.io` to the authorized domains of Authentication. Publish `database.rules.json` in the console.
3. `node tools/firebase-smoke.mjs` against the real rules, then `gh repo create`, push `main`, enable Pages.

## Ranking in short

- Profile: per tag `raw / (evidence + 1)`, a like is +1, a super like +2, a nope -1 (times the card's tag weight); untested tags are neutral.
- Item score: cosine of profile and item tags. Top 3 accommodations per stop use MMR (a different type beats a near-equal same type).
- Routes: 40% region match (coast, mountains, ...), 35% activities within 30 km, 25% accommodations. One night may move to the best-matching stay.
- Group: the mean of the members' weights per tag, minus a least-misery penalty when somebody dislikes an item strongly.

## Learning curve

```
node tools/simulate.mjs swipes.json --out out/      # k05..k25 as JSON + text, plus summary.json
node tools/simulate.mjs swipes.json --json --k 10,25 --routes 3
node tools/simulate.mjs swipes.json --group other.json   # proposal for two people
```
