# Corsica: project guide for Claude

A mobile travel planner. You swipe 25 accommodation cards and 25 activity cards (Tinder-style), which builds a taste profile. From that profile the app ranks itineraries with 3 stays per stop and an activity map, and groups can combine profiles. Built with the **`firebase-app` skill**: GitHub Pages + Firebase Realtime Database + Google login. Reference project: `C:\Users\Stefan\Coding\Michel`.

This file is a **router**. Details live in the documents below.

## Documents
| Topic | File |
|---|---|
| Original plan and test design | [`PLAN.md`](PLAN.md) |
| Running, adding a destination, spelregels | [`README.md`](README.md) |
| Lessons learned (read at session start) | [`lessons.md`](lessons.md) |
| Competitor research and roadmap to a real travel app | [`docs/travel-app-research.md`](docs/travel-app-research.md) |

## Map
- **App:** `index.html`, `styles.css`, `app.js` (UI), `deck.js` (swipe physics), `maps.js` (Leaflet), `logic.js` (pure: profile, ranking, plan, filters).
- **Data per destination:** `destinations/<name>/` holds `places.json`, `routes.json`, `catalog-*.json` and `img/`. Shared files are `destinations/tags.json` (a CLOSED tag vocabulary) and `destinations/swipe-deck.json` with `img/deck/`.
- **Backend:** `store.js` picks `store-dev.js` on localhost and `store-firebase.js` everywhere else. `dev-server.mjs` mirrors the rules.
- **Rules:** `scripts/gen-rules.mjs` generates `database.rules.json`. Never edit the JSON by hand.
- **Tools:**
  - `tools/smoke.mjs`, `firebase-smoke.mjs`, `simulate.mjs` (proposal per k);
  - `curve.mjs` (learning curve; `--check` gives 0 violations);
  - `edge.mjs`.

## Rules for Claude
- **Tags:** only tags from `tags.json`. Add a new tag there first.
- **Catalog changes:** only real, verified places, with `verified: YYYY-MM-DD`, an official URL, and Commons photos with a licence. `photoGeneric: true` means the photo is illustrative.
- **Service worker:** for every shell or catalog change, bump `VERSION` in `sw.js` and run `node scripts/sw-hash.mjs`.
- **Rules change:** change `gen-rules.mjs` and `dev-server.mjs` together, then run the parity tests. Deploy by pasting the rules in the Firebase console for **corsica-84e88**. Then run `node tools/firebase-smoke.mjs`.
- **Tests:**
  - `npm test` and `CORSICA_REAL=1 npm test` must be green;
  - `REAL=1 node tools/smoke.mjs`;
  - `node tools/curve.mjs --check` for ranking changes.
  - Headless Edge always with `--mute-audio`.
- **Ranking changes:** test them with the persona fixtures (`test/fixtures/personas/`). Quality must not drop as k rises.

## Commands
```bash
npm run dev                       # dev server on localhost (dev adapter, fake login)
npm test                          # all tests (CORSICA_REAL=1: real catalog required)
node tools/simulate.mjs swipes.json --k 10,25 --routes 3
node tools/curve.mjs --check
```

## Live
- **URL:** `https://swgvanderelst.github.io/corsica/`. Pushing to `main` deploys to Pages.
- **Firebase:** `corsica-84e88` (RTDB europe-west1; Auth: Google, plus Anonymous for tests only).
- **Authorized domain:** `swgvanderelst.github.io`.
