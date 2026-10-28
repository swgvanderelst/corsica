# Plan: Corsica als /firebase-app, met smaakprofiel via swipen

## Context
De Corsica-reisplanner bestaat nu als statische HTML. Hij staat in een tijdelijke Claude Desktop-map:
`C:\Users\Stefan\AppData\Local\Packages\Claude_pzs8sxrjxfjjc\LocalCache\Roaming\Claude\scratch-workspaces\…\scratch-2026-10-23-140a6d\site\`
De belangrijkste bestanden daar:
- `data.js` met `P` (coördinaten), `STAYS` (9 verblijfsregio's met `acc[]`, `sights`, `food`) en `ROUTES` (a, b en c, met `stops`, `stays`, `nights` en `legs`);
- `index.html` en `mobile.html`;
- `img/` met 34 foto's van Wikimedia Commons, plus `credits.json`.

Stefan wil dat de app zijn smaak leert:
- Bij de eerste login swipe je 25 accommodatiekaarten en 25 activiteitenkaarten, zoals bij Tinder.
- Het profiel wordt opgeslagen.
- De app vult daarmee de drie reisschema's opnieuw in: per stop **3 accommodatie-opties** en een **kaart met activiteiten in de buurt**.
- Onafhankelijke reviewer-agents testen dit met eigen persona's. We meten **hoeveel swipes nodig zijn voor een goed profiel**.
- Later moet het een algemene reisapp worden, dus de bestemming is data en geen code.
- Alles komt in een nieuw project **Corsica**.

**Besluiten van Stefan:**
- inloggen met **Google**;
- **iedereen een eigen profiel**, en de reis kan op een combinatie van profielen;
- een **vooraf onderzochte catalogus**, die in de app gerankt wordt;
- het profiel mag **ook de route** beïnvloeden.

## Aanpak

### 0. Project
- Kopieer de scratch-map naar `C:\Users\Stefan\Coding\Corsica`, en doe `git init -b main`.
- Volg de **`firebase-app`-skill**. De Michel (`C:\Users\Stefan\Coding\Michel`) is de referentie voor:
  - `store.js`, `store-firebase.js` en `store-dev.js`;
  - `dev-server.mjs`, `scripts/gen-rules.mjs` en `sw.js` met `scripts/sw-hash.mjs`;
  - `tools/edge.mjs`, `tools/smoke.mjs` en `tools/firebase-smoke.mjs`;
  - de parity-, rules- en sw-tests.
- Er komt een nieuw Firebase-project `corsica`, met Google-login én Anonymous als fallback voor de testers. Daarnaast een GitHub-repo `swgvanderelst/corsica` met Pages.

### 1. Datamodel (bestemming als data, zodat het later algemeen wordt)
`destinations/corsica/` als statische bestanden in de repo (niet in de database):
- **`places.json`:** de huidige `P`, `PLACE` en `OUTLINE`, plus regio-tags (kust, bergen, stad, rustig).
- **`catalog.json`:** echte items met naam, url, foto (met licentie), coördinaten, regio en kenmerk-tags.
  - **Accommodaties:** ~6–10 per verblijfsregio. Tags zijn bijvoorbeeld `pool`, `gym`, `sea_view`, `glamping`, `hotel`, `villa`, `b&b`, `camping`, `adults_only`, `kids`, `airco`, `luxury`, `budget`, `design`, `rustic`, `walk_to_beach` en `restaurant`.
  - **Activiteiten:** ~10–20 per regio, met tags als `hike`, `swim_river`, `beach`, `boat`, `diving`, `culture`, `food`, `nightlife`, `kayak`, `canyoning`, `viewpoint`, `village`, `wine`, `relax`, `kids`, `adrenaline`, `effort_low/med/high` en `duration`.
- **`swipe-deck.json`:** 25 accommodatiekaarten en 25 activiteitenkaarten. Elke kaart heeft een foto, een korte titel en tag-gewichten.
  - De kaarten zijn zo gekozen dat ze de tag-ruimte goed afdekken; elke tag zit in ≥3 kaarten.
  - Volgorde: eerst brede contrasten, daarna verfijning.
- **`routes.json`:** kandidaat-routes, de huidige A, B en C plus 3–5 varianten. Elke route heeft stops, nachten en een regioprofiel (bergen/strand/cultuur).

### 2. Profiel en ranking (pure functies in `logic.js`, 100% getest)
- **Profiel:** `weights[tag]`, bijgewerkt per swipe.
  - Rechts telt +1 × kaartgewicht, links −1. Een "super" (omhoog) telt +2.
  - Daarna normaliseren, met een zekerheidsscore per tag op basis van hoeveel kaarten die tag raakten.
- **`scoreItem(profile, item)`:** de cosinus van profiel en item-tags. Nog niet geteste tags tellen neutraal.
- **Per stop 3 accommodaties:** de top-3 op score, met **diversiteit**: maximaal één per type als scores dicht bij elkaar liggen (MMR-achtig).
- **Activiteiten per stop:** de top-N binnen ~30 km of 45 min, getoond op een **Leaflet-kaart** (OSM-tiles, pins in ADE-geel), met een lijst eronder.
- **`rankRoutes(profile)`:** kies of herschik de route met de beste match tussen regioprofiel en de activiteiten in de buurt. Het nachten-schema blijft binnen de reisduur.
- **Groep:** het combinatieprofiel is het gemiddelde van de geselecteerde profielen. Een item dat **door iemand sterk is afgewezen**, krijgt een strafpunt ("least misery").
- **Leerkromme:** `profileAfter(swipes[0..k])`, nodig voor het experiment in stap 5.

### 3. App (mobile-first, native gevoel zoals De Michel)
- **Inloggen met Google** (Firebase Auth, `signInWithRedirect` op iOS en een popup op desktop).
- **Eerste login:**
  - een uitlegscherm;
  - het **swipe-deck** met accommodaties (25 kaarten): sleep met fysica, LEUK / NIET-knoppen, ongedaan maken en een voortgangsbalk;
  - daarna het activiteiten-deck (25).
  - Overslaan mag na ≥10 kaarten.
- **Profielscherm:**
  - top-likes en top-dislikes per tag, als "jij houdt van: zwembad, zeezicht, wandelen…";
  - "opnieuw swipen" en "meer kaarten" (extra kaarten voor onzekere tags).
- **Reisschema's:** de routes in jouw volgorde. Per stop staan er 3 accommodatiekaarten met een "waarom deze?"-regel (de matchende tags), plus de activiteitenkaart en -lijst.
  - De bestaande teksten, ferry-informatie, legs en `credits` blijven.
- **Samen:** reisgenoten uitnodigen via een link (token, zoals De Michel). De reis toont het combinatieprofiel, met een schakelaar per persoon.
- **Firebase-data:**
  - `users/{uid}`: `{ name, swipes{cardId: -1|1|2}, updatedAt }`, alleen eigen lezen en schrijven;
  - `groups/{gid}`: `{ owner, members{uid: name}, codes }`, met de join-token-rules uit De Michel;
  - de groep leest swipe-samenvattingen van leden via `groups/{gid}/profiles/{uid}`, dat elk lid alleen voor zichzelf mag schrijven.
- **Huisstijl:** behoud de bestaande stijl van de Corsica-app.

### 4. Catalogus vullen (parallel, Sonnet-agents)
- **3 onderzoeksagents:** één per route-regiogroep (noord/west, binnenland, zuid/oost).
  - Elk zoekt per verblijfsregio echte accommodaties en activiteiten, met officiële url, coördinaten, tags en een foto.
  - **Foto's:** Wikimedia Commons met licentie in `credits.json`, net als nu. Voor accommodaties waar geen vrije foto van is, gebruiken we een generieke Commons-foto van het kenmerk, met de url naar de echte site.
  - Bestaande `acc[]` en `sights` uit `data.js` dienen als startpunt.
- **1 agent voor het swipe-deck:** 50 kaarten met Commons-foto's en tag-gewichten, plus een dekkingscontrole.
- **1 bouw-agent (Sonnet):** app, logic en Firebase, in een eigen worktree. De catalogus komt los binnen als JSON.

### 5. Testen: reviewers en een leerkromme-experiment
- **Persona's:** ~8 onafhankelijke Haiku-reviewers, elk met een eigen verborgen persona. Voorbeelden: luxe-stel, actief avontuur, gezin met kinderen, budget-backpacker, cultuur en eten, rust en strand, groep vrienden met nightlife, en een gemengd stel.
  - Elke persona is vooraf beschreven als tekst, zonder tag-gewichten.
  - Elke reviewer swipet zelf alle 50 kaarten via puppeteer op de echte UI. Hij beslist per kaart vanuit zijn persona.
- **Na het swipen:**
  - de app genereert het reisvoorstel;
  - de reviewer beoordeelt elke accommodatie en activiteit (1–5) en de route als geheel, met "past bij mij?" en uitleg;
  - hij geeft een totaaloordeel **TEVREDEN** of **NIET**, met verbeterpunten.
- **Leerkromme:**
  - voor k = 5, 10, 15, 20, 25 (per deck) berekent een script het voorstel uit de eerste k swipes;
  - de reviewer scoort dat voorstel blind, zonder te weten welke k het is;
  - het resultaat is een grafiek van tevredenheid tegen het aantal swipes. Het antwoord op "**hoeveel kaarten zijn genoeg?**" is de k waarbij de score afvlakt.
  - Dat komt in een kort rapport (artifact/HTML) met de kromme.
- **Groepstest:** 2 persona's samen, waarbij beide reviewers het groepsvoorstel beoordelen.
- **Itereren:** zijn ≥7 van de 8 tevreden en is de gemiddelde score ≥4, dan zijn we klaar. Anders passen we de tags, de deck-samenstelling of de ranking aan en draaien we opnieuw. Elke ronde wordt gelogd.
- **Plus de standaard uit de skill:**
  - een onafhankelijke code- en rules-reviewer;
  - een admin/groep-tester op de echte Firebase;
  - `npm test`;
  - `tools/smoke.mjs`;
  - `tools/firebase-smoke.mjs`.

### 6. Opleveren
- Push naar GitHub Pages. Daarna deploy ik de rules via de console in Edge, en voeg ik Stefans Google-uid toe waar nodig.
- **README:** hoe je een nieuwe bestemming toevoegt, met de `destinations/<naam>/`-structuur.
- **`lessons.md`** bijwerken.
- Het **leerkromme-rapport** delen.

## Tests
- **`test/logic.test.js`:**
  - profiel-updates en normalisatie;
  - `scoreItem`;
  - top-3 met diversiteit;
  - de activiteiten-radius;
  - `rankRoutes`;
  - het groepsprofiel met least misery;
  - `profileAfter(k)`.
  - Doel: ≥95% branch-coverage.
- **`test/catalog.test.js`:**
  - het schema: elk item heeft url, coördinaten binnen Corsica, geldige tags en een foto met licentie;
  - elke stop heeft ≥3 accommodaties en ≥5 activiteiten;
  - elke tag zit in ≥3 swipe-kaarten.
- **Parity- en rules-tests**, zoals bij De Michel:
  - `users` alleen eigen;
  - groep-join via token;
  - profielen in een groep alleen voor jezelf schrijven.
- **Smoke-tests (Edge, `--mute-audio`):**
  - login (anoniem in dev);
  - beide decks swipen (sleep + knoppen + ongedaan maken);
  - het profielscherm;
  - de routes met 3 opties per stop en een kaart met pins;
  - groep uitnodigen en combineren.
- **Firebase-smoke** tegen de echte rules.

## Verificatie end-to-end
1. `npm test` is groen, en de smoke-tests zijn groen in Edge op 390×844.
2. Het reviewer-experiment: ≥7/8 TEVREDEN, plus het rapport met de leerkromme.
3. Live op `https://swgvanderelst.github.io/corsica/`. Stefan logt in met Google, swipet en ziet zijn persoonlijke reis. Een reisgenoot doet mee via een link en het combinatievoorstel verschijnt.
