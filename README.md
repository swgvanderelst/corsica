# Corsica

A travel planner that learns your taste. You sign in with Google and swipe 25 accommodation cards and 25 activity cards.
Then you plan a trip: when (fixed dates, or flexible months plus a number of nights), who goes (names and birth years; your
household is the default) and which highlights of the destination you want to see. The app proposes routes of exactly that
length with a day-by-day plan, 3 stays per stop and a map of activities. Travel companions open the trip link, plan along
and their taste counts.

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
| `app.js`, `deck.js`, `maps.js`, `styles.css`, `index.html` | UI: login, decks (drag physics), profile + household, trips (wizard, detail, day plan), stops; Leaflet + SVG maps |
| `store.js` | picks the adapter: `store-dev.js` on localhost, `store-firebase.js` everywhere else |
| `dev-server.mjs` | zero-dependency dev backend that mirrors the rules |
| `scripts/gen-rules.mjs` | generates `database.rules.json` (edit the generator, never the JSON) |
| `sw.js`, `scripts/sw-hash.mjs` | offline shell; `test/sw-version.json` fails the tests when the shell changed without a `VERSION` bump |
| `tools/simulate.mjs` | proposal from a swipes file for k = 5, 10, 15, 20, 25 cards per deck |
| `tools/trip-proposal.mjs` | one trip (nights, party, highlights) as readable text: ranking, day plan, stays (persona tests) |
| `destinations/` | all destination data (below) |

## Data model (Firebase)

All reads and writes need a real (Google) sign-in: the production rules refuse anonymous users. The dev server ignores that check.

- `users/{uid}`: `{ name, swipes{cardId: -1|1|2}, overrides{tag: -1|0|1}, prefs{airco, ev, budget 1-4}, household{p0..p11: {name, born?}}, groups{gid: true}, updatedAt }`. Own read/write only. `name` is the name shown in shared trips (the Google first name, editable in the profile). `household` is the default party of a new trip.
- `groups/{gid}` is a **trip**: `{ name, owner, createdAt, members{uid: {name, via}}, codes{token: time}, banned{uid: true}, trip }`. **Readable by its members only.**
  `trip` = `{ dest, nights 3-28, start+end (YYYY-MM-DD) or months ("2027-07 2027-08", max 3), party{p0..p11: {name, born?, uid?}}, highlights "id id ...", pace calm|normal|active, updatedAt }`.
  **Every member** writes it (not a banned one); it only goes with the group. A step edit in the app replaces only that step's fields on the latest version.
  Joining writes `members/{uid} = {name, via: <invite token>}`, and the rules check that the token belongs to this group (`codes/{token}.gid`). The owner's own entry has `via: "owner"`.
  The owner removes a member and bans them in the same write: a removed member cannot read, and cannot rejoin even with a valid link until the owner lifts the ban. Leaving yourself is not a ban.
  The owner can delete the group together with its codes.
- `groups/{gid}/profiles/{uid}` = `{ w{tag: -1..1}, c{tag: evidence}, n, prefs?, updatedAt }`: a swipe summary plus travel preferences that only the member writes for themselves. A trip combines the preferences (strictest budget, union of the must-haves); "with kids" follows from the party's ages (under 12 in the trip year).
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
3. **`routes.json`**: route templates `routes[]` with `id` (one letter), `name, sub, title, lead, ferry, stops, stays, nights, profile{...}, legs[{from,to,km,min,via}]`, optional `maxNights`.
   `nights` are proportions: a trip stretches or shrinks them to its own length (at least 2 per stop); `maxNights` keeps a short-trip template out of longer trips. Texts must not name a number of nights.
   **`highlights.json`**: `[{id: "hl-...", name, cat: beaches|towns|nature|boat|culture, desc, lat, lon, acts: [activity ids]}]`, listed in `destination.json` as `highlights`.
   `stays` use the same keys as `places.stays` and the `region` of the catalog accommodations. `profile` is the 0..1 share of each trait.
4. **Catalog** (`catalog-*.json`, any number of files, each `{accommodations: [...], activities: [...]}`):
   - accommodation `{id, name, region, url, lat, lon, priceLevel 1-4, tags, desc, photo, photoGeneric, sleeps?, familyRooms?, adultsOnly?, minAge?}`
   - activity `{id, name, region, url, lat, lon, durationH, tags, desc, photo, minAge?, kidFriendly?: yes|older|no}`
   - party facts: `sleeps` = most people in one unit (a party that does not fit gets "meer kamers nodig", an unknown capacity counts a little against a party of 3+); `adultsOnly`/`minAge` exclude a stay for a party with children; an activity with `minAge` above the youngest, or `kidFriendly` older (under 8) / no (under 16), is left out.
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
- Routes: the hand-made templates plus a generated route for every set of 1-4 stays (`generateRoutes`: from Bastia or Ajaccio, in the order with the least driving; known template legs, chained through other places, else 1.4 min per straight km on the east coast and 2.8 elsewhere). All are fitted to the trip length; per stop the best stay, the activities within 30 km and how many favourite kinds are near, plus a little region match, minus driving burden, weak stops and over-budget stays. One night may move to the best-matching stay.
- Highlights come first: each chosen highlight goes to the nearest stop within 75 min (2.4 min per straight-line km, calibrated on real Corsican drives) that still has a free day; at a stop (under 30 min) it counts fully, as a day trip 0.75. A missing highlight costs more than any taste difference, and the route detail names the routes that do have it.
- Pace (chosen per trip, else calm with kids or a laid-back taste): at most nights/4.5 (calm), /3.5 (normal) or /3 (round trip) stops; driving above 120 + 20 x nights minutes costs 0.003 (calm), 0.0006 or 0.0003 per minute. Only the 30 most promising generated routes are planned in full. Next to the recommendation the app shows "Minder rijden" (at most 75% of its driving) and "Alle highlights" (if needed with one stop more).
- Day plan: day 1 and every move is a travel day (empty after a drive of 90 min or more); each placed highlight gets a day; the rest are activities near the stop (a calm party only a clear fit, else a free day; an active party anything that fits), another kind than the day before; a calm party gets a quiet day after two heavy ones; people who like going out or food get an evening suggestion; the last day is the way back to the ferry.
- Group: the mean of the members' weights per tag, minus a least-misery penalty when somebody dislikes an item strongly.

## Learning curve

```
node tools/simulate.mjs swipes.json --out out/      # k05..k25 as JSON + text, plus summary.json
node tools/simulate.mjs swipes.json --json --k 10,25 --routes 3
node tools/simulate.mjs swipes.json --group other.json   # proposal for two people
```
