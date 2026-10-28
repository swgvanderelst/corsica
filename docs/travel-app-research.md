# Corsica naar een echte reisapp: onderzoek en plan

Datum: 2026-10-27. Status: onderzoek, geen code gewijzigd.

## Conclusie (lees dit eerst)

1. **De markt is vol met planners, maar niemand heeft een smaakprofiel.** Wanderlog, Stippl en TripIt organiseren een reis die je al hebt bedacht. Layla en Mindtrip (AI) bedenken er een, maar zonder gestructureerd, zichtbaar en deelbaar profiel. Onze kern is dus: *swipen leert je smaak, het profiel stuurt route, verblijf en activiteiten, en een groep combineert profielen*. Dat is nu al gebouwd en werkt als differentiator.
2. **Table stakes die we missen:** zoeken op willekeurige bestemming, echte foto's, prijzen/beschikbaarheid via boeklinks, een bewerkbare reis (dagplanning), offline kaarten en export/delen. Zonder deze is het een demo, geen app.
3. **Foto's:** aanbevolen is een **hybride**. Activiteiten en plaatsen: Wikimedia Commons (en Unsplash als aanvulling), opgeslagen met licentie en naamsvermelding. Accommodaties: **Google Places (New) Photos, live opgehaald via een Cloud Function**, niet permanent opgeslagen, met de verplichte naamsvermelding. Fallback: een generieke Commons-foto met label "illustratief". Reken op circa 7 USD per 1.000 foto-aanroepen (eerste 1.000/maand gratis, [Google prijslijst](https://developers.google.com/maps/billing-and-pricing/pricing)).
4. **Backend:** de statische catalogus + Firebase Realtime Database volstaat tot en met de MVP+ (Fase 1). **Zodra we externe API's willen (Google Places, prijzen, AI) is een backend verplicht, want de keys mogen niet in de browser.** Dat betekent Firebase **Cloud Functions op het Blaze-plan** (betaal-per-gebruik, wel een creditcard; bij ons volume vrijwel gratis). Dat is Fase 2.
5. **Wat Stefan moet regelen:** Google Cloud-project met billing (Blaze), een Places API-key (beperkt tot de functie), een Unsplash developer-account (gratis), en een affiliate-aanmelding (Booking.com via een netwerk zoals Awin, of Tripadvisor). Details in paragraaf 4.
6. **Grootste risico's:** (a) licenties/ToS van foto's en prijsdata, (b) kosten die ongemerkt oplopen zonder cache en quota, (c) catalogus-schaal: handmatig onderzoek per bestemming houdt het niet vol, dus een data-pijplijn (Fase 3).

Totale schatting: Fase 1 ca. 2 weken, Fase 2 ca. 4 weken, Fase 3 ca. 4 weken, Fase 4 ca. 6 weken (deeltijd, met agents). Kosten: 0 euro in Fase 1, ca. 5 tot 30 euro/maand in Fase 2 en 3, daarna afhankelijk van gebruik.

> Eerlijkheidsnotitie: de zoekresultaten bestonden voor een groot deel uit vergelijkingsblogs van concurrenten (o.a. Stippl, Layla) en aggregators. Prijzen en reviewcijfers zijn **indicatief** en genoemd met bron; verifieer ze vóór je er iets op bouwt. Waar ik geen bron vond, staat "(algemene kennis, niet geverifieerd)".

---

## 1. De 10 onderzochte apps

**Selectie en onderbouwing.** Ik koos op drie assen: (1) planners die ons direct concurreren (Wanderlog, Stippl, TripIt, Polarsteps, Layla), (2) bronnen waar reizigers inspiratie en verblijven vinden (Google Maps, Tripadvisor, Booking.com, Airbnb), (3) de specialist met een eigen route-/POI-aanpak (Roadtrippers). Afgevallen: Komoot (alleen outdoor-routes, wel een goede bron van ideeën voor wandelactiviteiten), Sygic (offline navigatie), Hopper (vluchten/prijsvoorspelling, buiten onze scope), Lonely Planet (gidsen, geen planner). Over Komoot, Sygic en Hopper vond ik in dit onderzoek geen bruikbare bronnen.

| # | App | Kern | Wat gebruikers waarderen | Klachten | Verdienmodel | Databronnen |
|---|---|---|---|---|---|---|
| 1 | [Wanderlog](https://wanderlog.com) | Kaartgestuurde, collaboratieve reisplanner met dagplanning | Beste kaart-UI, groepen plannen samen, import van boekingsmails; zeer hoge App Store-score (aggregator: 4,9 uit 30,9K, [marlvel](https://marlvel.ai/apps/wanderlog-travel-planner/reviews)) | Paywall op offline, route-optimalisatie, PDF en zelfs dark mode; betaalbugs; Trustpilot 1,8 (45 reviews, kleine steekproef, [Trustpilot](https://www.trustpilot.com/review/wanderlog.com?page=2)) | Freemium, Pro circa 40 USD/jaar (bronnen verschillen, [Stippl-vergelijking](https://docs.stippl.io/blog/stippl-vs-wanderlog)), affiliate | Google Places voor plaatsen en foto's (algemene kennis, niet geverifieerd), hotelaffiliates |
| 2 | [TripIt](https://www.tripit.com) | Boekingen automatisch uit e-mail tot één reisschema | Betrouwbare import, alerts, delen met reisgenoten | Weinig inspiratie/planning, beste functies in Pro, oogt gedateerd (algemene kennis) | Freemium, Pro-abonnement | Mailparsing, vluchtdata (FlightStats-achtig, algemene kennis) |
| 3 | Google Maps / Travel (lijsten) | Kaart + opgeslagen lijsten, reviews, routes, offline kaarten | Gratis, grootste POI-database, vertrouwde foto's en reviews | Lijsten zijn geen planning; geen groepsprofiel; niet gedeeld als reis | Advertenties, Maps Platform-licenties | Eigen data + gebruikersfoto's |
| 4 | Airbnb | Verblijven + Experiences | Foto's en beschrijvingen van echte hosts, sterke zoek- en kaartervaring | Verborgen schoonmaak-/servicekosten, annuleringen, hostkwaliteit (algemene kennis) | Servicekosten op boekingen | Hostgeleverde foto's en prijzen |
| 5 | Booking.com | Verblijven (hotels e.d.) wereldwijd | Veel aanbod, filters, gratis annuleren | Prijs verandert bij afrekenen, review-vertrouwen, opdringerige urgentieberichten (algemene kennis) | Commissie op boekingen; affiliatepartners | Hotelpartners leveren foto's en inventaris; API alleen voor [Managed Affiliate Partners](https://developers.booking.com/demand/docs/getting-started/prerequisites) |
| 6 | Tripadvisor | Reviews, "things to do", restaurants | Enorme reviewdatabase, ranglijsten van activiteiten | Reviewmanipulatie, advertentiedruk, rommelige UI (algemene kennis) | Advertenties, Viator-boekingen, hotel-meta | Eigen gebruikersreviews en foto's; [Content API](https://tripadvisor-content-api.readme.io/reference) |
| 7 | [Polarsteps](https://www.polarsteps.com) | Reis vastleggen (tracker, fotoboek) | Mooie reisverhalen, social, gratis start; gratis planning, Plus 8,99/maand of 29,99/jaar ([Polarsteps](https://stories.polarsteps.com/stories/best-travel-planning-apps)) | Planning/groepssamenwerking zwakker, boekingsimport minder compleet | Freemium + fotoboeken kopen | Gebruikersdata, OSM-kaarten (algemene kennis) |
| 8 | [Stippl](https://www.stippl.io) | AI-dagplanning, budget, paklijst, groepen | Alles-in-één, EU-prijs (24,99 EUR/jaar volgens Stippl zelf, vooringenomen bron) | Jonger product, minder volwassen kaart dan Wanderlog | Freemium, premium | Eigen/gelicentieerde POI-data (niet geverifieerd) |
| 9 | [Layla](https://layla.ai) (en Mindtrip) | Chat-AI die een reis voorstelt; Layla heeft een menselijke afrondingscontrole; Mindtrip kan ook boeken | Snel een eerste voorstel; goed in "waar moet ik heen" | Betaalde live prijzen (Layla 49 USD/jaar volgens eigen blog), AI verzint of mist details, weinig controle | Abonnement + boekingscommissie | LLM + partnerdata (hotel/vlucht) |
| 10 | [Roadtrippers](https://roadtrippers.com) | Road-trip routes met POI's langs de weg | Detour-aanpak, route-instellingen, Plus 29,99 USD/jaar volgens een roundup ([lijst](https://vacation-planner-blog.pages.dev/blog/best-travel-planning-apps-2026/)) | Beperkt buiten road trips, POI-kwaliteit wisselt | Freemium Plus | Eigen POI-database, Yelp/Google-achtig (niet geverifieerd) |

Patronen: (1) de beste planners verdienen op **freemium + affiliate**, (2) hun grootste ergernis is **paywall op basisdingen** (offline, export), (3) alle grote spelers halen hun **foto's en prijzen uit partnerfeeds of Google**, niet uit eigen opslag, (4) **geen enkele** bouwt de reis op een expliciet smaakprofiel van meerdere mensen.

---

## 2. Feature-matrix

Legenda: ● = sterk aanwezig, ○ = beperkt, leeg = niet. "Wij nu" = huidige Corsica-app. "Rol": **TS** = table stakes, **D** = onderscheidend, **N** = nice-to-have.

| Feature | Wanderlog | TripIt | Google | Airbnb | Booking | Tripadv. | Polarsteps | Stippl | Layla | Roadtr. | **Wij nu** | **Rol** |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Zoeken op elke bestemming | ● | ○ | ● | ● | ● | ● | ● | ● | ● | ○ | nee (alleen Corsica) | TS |
| Echte foto's per plek | ● | ○ | ● | ● | ● | ● | ○ | ● | ● | ● | ○ (34 Commons-foto's) | TS |
| Kaart met pins/route | ● | ○ | ● | ● | ● | ○ | ● | ● | ○ | ● | ● | TS |
| Bewerkbare dagplanning (slepen) | ● | ○ | ○ | | | ○ | ○ | ● | ○ | ● | nee (vaste routes) | TS |
| Groepssamenwerking live | ● | ○ | ○ | | | | ○ | ● | | ○ | ○ (profielen combineren, geen live editor) | TS |
| Offline gebruik / offline kaarten | ● (Pro) | ● | ● | ○ | ○ | ○ | ● | ○ | | ● | ○ (alleen app-schil) | TS |
| Prijzen en beschikbaarheid | ○ | | ○ | ● | ● | ○ | | ○ | ● | | nee | TS (via boeklink) |
| Boeken / affiliate-link | ● | | ○ | ● | ● | ● | | ○ | ● | ○ | nee | TS |
| Import boekingen uit e-mail | ● | ● | ○ | | | | ○ | ● | | | nee | N |
| Budget en kosten delen | ○ | | | | | | | ● | | | nee | N |
| AI-reisvoorstel | ○ | | ○ | | | ○ | | ● | ● | | nee (regelgebaseerd) | N (AI als uitleg) |
| Reviews/beoordelingen | | | ● | ● | ● | ● | | | | ○ | nee | N (link naar bron) |
| Export/delen (PDF, link, agenda) | ● (Pro) | ● | ○ | | | | ● | ● | ○ | ● | nee | TS |
| Notificaties/herinneringen | ○ | ● | | ● | ● | | ○ | ○ | ○ | | nee | N |
| Reisverslag/fotoboek achteraf | | | | | | | ● | | | | nee | N |
| **Smaakprofiel uit swipen** | | | | | | | | | ○ (chat) | | **● (50 kaarten)** | **D** |
| **Leercurve (hoeveel swipes genoeg)** | | | | | | | | | | | **● (gemeten)** | **D** |
| **Groepsprofiel (gemiddeld + least misery)** | | | | | | | | | | | **●** | **D** |
| **"Waarom deze?" uitleg via tags** | | | | | | | | | ○ | | **●** | **D** |
| Route-ranking op profiel | | | | | | | | ○ | ○ | | **●** | **D** |
| Dorpen/regio's als data, bestemming generiek | | | | | | | | | | | ● (data-gedreven) | D (basis) |

**Voortbouwen op het smaakprofiel (kansen):**
- **Profiel gaat mee naar elke bestemming.** Eén keer swipen, daarna in Sardinië of Portugal direct een voorstel (tags zijn universeel). Dit is het echte schaalvoordeel.
- **Groepsverschillen zichtbaar maken:** "jullie verschillen op wandelen; compromis-activiteiten: kajak, dorpje met strand". Laat een groep tegen elkaar stemmen op de top-5, geen taak voor de organisator alleen.
- **Dagritme uit profiel:** actief/rustig, nachtleven, kinderen bepalen dichtheid van de dag (2 of 5 activiteiten).
- **Budgetas** als tag uitbreiden (priceLevel is er al).
- **AI als uitlegger en zoeker, niet als bron van feiten:** een LLM zet een vrije vraag om in tags ("rustig, zwembad, geen kinderen") en schrijft de "waarom"-regel. Feiten (prijs, adres, foto) komen altijd uit data.
- **Profiel-leercurve als kwaliteitsmaat** blijft ons testinstrument voor elke nieuwe bestemming.

---

## 3. Foto's: legale opties

| Optie | Kosten | Licentie en voorwaarden | Moeite | Kwaliteit | Opmerking |
|---|---|---|---|---|---|
| **Google Places (New) Photos** | 7 USD per 1.000 aanroepen (1.000/maand gratis), schalend ([prijzen](https://developers.google.com/maps/billing-and-pricing/pricing)); Text Search Pro 32 USD per 1.000 (5.000 gratis) | Mag **niet** Places-content cachen/prefetchen, behalve place_id (onbeperkt opslaan); **naamsvermelding verplicht**; Google-logo als er geen Google-kaart staat ([beleid](https://developers.google.com/maps/documentation/places/web-service/policies)) | Middel: Cloud Function die place_id opslaat en foto live doorstuurt | Zeer goed, echte accommodaties en activiteiten, bijna wereldwijd | Beste dekking. Vereist Blaze + billing + key-restricties |
| **Booking.com / Expedia API** | Gratis, maar **alleen na contract** | Booking Demand API vereist [Managed Affiliate Partner](https://developers.booking.com/demand/docs/getting-started/prerequisites) met accountmanager; foto's niet downloaden of wijzigen (niet geverifieerd, controleer het contract); [content-only flow](https://developers.booking.com/demand/docs/development-guide/application-flows/content-only) bestaat | Hoog (aanvraag, contract, goedkeuring); onrealistisch voor een hobbyproject | Goed (hotelfoto's) | Pas zinvol bij echte traffic. Alternatief: gewone affiliate-links via een netwerk, zonder API |
| **Tripadvisor Content API** | Gratis tier en pay-as-you-go; bronnen verschillen (1.000 of 5.000 gratis calls/maand), "rate shown at signup" | Weergave-eisen: ratings, datums en credit tonen; [voorwaarden](https://tripadvisor-content-api.readme.io/reference/terms-of-use); één bron meldt een sunset van de oude API per 31-08-2026 (niet bevestigd; verifieer) | Laag tot middel (key aanvragen) | Matig (beperkt aantal foto's per locatie), goede reviews | Handig voor reviewscores en deeplinks; foto's aanvullend |
| **Unsplash / Pexels API** | Gratis. Unsplash: 50 req/uur in demo, 5.000/uur na goedkeuring (bron: derden) | Unsplash-API-richtlijnen: hotlinken, fotograaf en Unsplash vermelden, download-endpoint aanroepen ([richtlijnen](https://help.unsplash.com/api-guidelines/unsplash-api-guidelines)); Pexels-voorwaarden niet in dit onderzoek geverifieerd | Laag | Mooi, maar generiek (sfeerbeelden, geen specifiek hotel) | Goed voor regio-/sfeerbeelden en swipekaarten, niet voor "dit hotel" |
| **Wikimedia Commons** | Gratis | Per bestand CC BY, CC BY-SA of publiek domein: naamsvermelding en licentie verplicht; dit doen we al (`credits.json`) | Laag (API/scripts), wel licentiecontrole per foto | Wisselend; goed voor bezienswaardigheden en natuur, bijna nooit voor commerciële accommodaties | Beste bron voor activiteiten en plaatsen |
| **Door hotel geleverd** | Gratis | Meest zuiver: expliciete toestemming per hotel | Hoog (outreach per object) | Beste voor dat object | Alleen voor een klein premium-segment of partners |
| **Mapillary** | Gratis API | [CC BY-SA](https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data); share-alike geldt ook voor bewerkingen; naamsvermelding | Middel | Straatbeelden, niet geschikt als "mooie kaartfoto" | Alleen bruikbaar voor context ("zo ziet de straat eruit") |
| **AI-gegenereerd** | Laag (cent per beeld) | Geen rechtenprobleem, wel **misleidend** als het als echt hotel wordt getoond | Laag | Mooi maar niet echt | Alleen als expliciet gelabeld "AI-illustratie" en nooit voor een bestaand verblijf; liever een generieke Commons-foto |

**Aanbeveling**
1. **Activiteiten en plaatsen:** Commons (bestaand `photo`-schema met licentie) met Unsplash als aanvulling. Opslaan met credits. Kosten nul.
2. **Accommodaties:** Google Places Photos, **live** via Cloud Function (place_id opslaan in de catalogus, foto-URL niet permanent bewaren, korte HTTP-cache van de browser mag), met auteursvermelding en link naar Google Maps. Zet een **quotum en budget-alert** in Google Cloud. Verwachte kosten: 1.000 foto-views/maand gratis; daarna circa 7 USD per 1.000.
3. **Fallback:** generieke Commons-foto met label "illustratief" (bestaat al als `photoGeneric`), en alleen als laatste redmiddel een AI-beeld met zichtbaar label.
4. **Later:** Tripadvisor voor reviewscores en Booking-affiliate zodra er traffic is.

**Wat dit van Stefan vraagt**
- Google Cloud-project (kan hetzelfde zijn als Firebase) met **billing aan** (Blaze), Places API (New) ingeschakeld, key beperkt tot de Cloud Function-IP/service en een budgetmelding op bijvoorbeeld 10 EUR/maand.
- Unsplash developer-account (gratis) en later een aanvraag voor productie-rate-limit.
- Affiliate-aanmelding: een netwerk zoals Awin (daar zit de Booking.com-affiliate), of Tripadvisor-key. De Demand API zelf vraagt een contract; die niet nu aanvragen.
- Akkoord op de juridische lijn: geen scraping, geen foto's van boekingssites kopiëren.

---

## 4. Implementatieplan in fasen

**Wanneer stopt "statisch + Firebase" met volstaan?** Zodra een van deze nodig is: een API-key die geheim moet blijven (Google Places, LLM), een zoekopdracht op een onbekende bestemming, prijzen/beschikbaarheid, of notificaties. Tot dan kan alles in de browser met JSON en Realtime Database. Het omslagpunt is **Fase 2**: Cloud Functions op het **Blaze-plan**. Daaronder blijft de huidige opzet (GitHub Pages + Realtime Database, geen build) intact.

### Fase 1: MVP+ (nog zonder backend), ca. 2 weken, 0 EUR
- **Features:** bewerkbare reis (verplaats stop, nachten wijzigen, eigen stop toevoegen), deelbare reislink en kopieerbare tekst/ICS-export, "waarom deze?" verbeteren, groepsverschillen tonen ("jullie verschillen op ..."), tweede bestemming als echte proef (bijv. Sardinië, handmatig), boeklink per verblijf (gewone deeplink naar officiële site, evt. affiliate-parameter).
- **Architectuur:** `destination.json`-schema versturen als vaste versie (`schemaVersion`), `destinations/index.json` met bestemmingskiezer, `trips/{tid}` in Realtime Database (eigenaar + leden, rules via `gen-rules.mjs` en `dev-server.mjs` gespiegeld), service-worker cachet per bestemming.
- **Datapijplijn:** nog handmatig/agents, zoals PLAN.md (3 onderzoeksagents + validatie in `catalog.test.js`).
- **Testen:** unit voor de nieuwe trip-logica, parity- en rules-tests voor `trips`, smoke in Edge voor bewerken en delen; schemavalidatie voor de tweede bestemming.
- **Kosten:** geen.

### Fase 2: Backend en echte foto's, ca. 4 weken, circa 5 tot 15 EUR/maand
**Hier wordt Blaze verplicht.**
- **Features:** foto's via Google Places (live), zoeken naar verblijven/activiteiten op een nieuwe plek (zoekbalk), reviewscore-badge (Tripadvisor of Google rating, met bronvermelding), verfijnd profiel per bestemmingstype, AI-uitleg ("waarom past dit bij jullie") en vrije-tekst-naar-tags.
- **Architectuur (Cloud Functions, Node 20):**
  - `placePhoto(placeId, w)`: haalt de foto bij Google, zet auteursinfo in de response, zet `Cache-Control` kort en past per-user rate limiting toe (Auth-token controleren). Geen permanente opslag van de afbeelding.
  - `placeSearch(q, bbox)`: Text Search met field-mask (alleen IDs/Pro-velden om kosten te drukken); resultaat naar `placeId` + eigen tags in `catalog-user`.
  - `explain(profile, item)` en `parseQuery(text)`: LLM-aanroepen met vaste JSON-uitvoer en **deterministische fallback** (tag-regels) als de LLM faalt.
  - Secrets in Firebase Secret Manager, App Check aan, budget-alerts.
- **Datapijplijn:** CLI-script `tools/enrich.mjs`: voor elk catalogusitem place_id zoeken en opslaan; `catalog.test.js` eist een place_id of een gelicentieerde foto.
- **Testen:** Functions met emulator en gemockte Google-responses; contracttest op veldmaskers (kostenbewaking); een kostensimulatie (aantal calls per sessie) als test; smoke met `REAL=1`.
- **Kosten:** Blaze zelf gratis tot de gratis quota; Places foto's 7 USD per 1.000 na de eerste 1.000; Text Search Pro 32 USD per 1.000 na de eerste 5.000 ([prijzen](https://developers.google.com/maps/billing-and-pricing/pricing)); LLM-aanroepen cent-niveau per sessie.

### Fase 3: Elke bestemming, catalogus op schaal, ca. 4 weken, circa 10 tot 30 EUR/maand
- **Features:** kies willekeurige bestemming, automatisch gegenereerde route-kandidaten, verblijven met indicatieve prijsklasse en boeklink, openingstijden/seizoen ("niet in augustus").
- **Architectuur:** catalogus verhuist van statische bestanden naar **Firestore** (of Realtime Database-subtree) met per bestemming een versie, plus een **ontdekfunctie** die POI's ophaalt uit OpenStreetMap/Overpass, Wikidata en Wikipedia (gratis, open licentie) en met Places verrijkt. Geplande Function (cron) ververst de catalogus per bestemming.
- **Datapijplijn nieuwe bestemming (geautomatiseerd):**
  1. Bestemming + bounding box + regio's (agent of handmatig),
  2. POI's uit OSM/Wikidata trekken,
  3. Tags afleiden (OSM-tags naar ons woordenschat, LLM met validatie),
  4. Foto's: Commons per Wikidata-item, Places voor verblijven,
  5. Kwaliteitscontrole: schema-test, dekkingscontrole tags in swipedeck, steekproef door reviewer-agent,
  6. Publiceren als versie.
- **Testen:** de leercurve-simulatie per nieuwe bestemming (zelfde persona's), schematests op elke gegenereerde catalogus, regressietest die het Corsica-resultaat gelijk houdt (before/after).
- **Kosten:** vooral Places-calls bij het verrijken (eenmalig per bestemming; buiten de geldende cachebeperking houden: alleen place_id en eigen afgeleide data opslaan).

### Fase 4: Echte app, ca. 6 weken, circa 30 tot 100+ EUR/maand (afhankelijk van gebruik)
- **Features:** live collaboratieve reisbewerker (meerdere mensen tegelijk), stemmen op voorstellen, prijzen en beschikbaarheid (alleen via een partner-API, dus eerst een affiliateovereenkomst), notificaties (FCM-push voor groepsuitnodiging en wijzigingen; op iOS vereist een PWA op het beginscherm), offline kaarten (vectortegels van een eigen host of MapLibre met voorgeladen gebieden, geen OSM-tegelserver zwaar bevragen), mogelijk een native wrapper (Capacitor) voor betere iOS-notificaties.
- **Architectuur:** Realtime Database blijft goed voor een collaboratieve editor (eenvoudige last-writer-wins per veld); alleen bij complexe gelijktijdige bewerking overwegen we Firestore of een CRDT. Functions voor affiliate-redirects en klik-logging. Kaarttegels: eigen host (Protomaps/PMTiles op goedkope opslag) i.p.v. gratis OSM-tegels, omdat het OSM-beleid zware app-gebruikers afraadt.
- **Testen:** multi-client-test met twee headless browsers op dezelfde reis, rules-attack-tests uitbreiden, een load-test op Functions, privacy- en juridische check (AVG: profielen zijn persoonsgegevens; export en verwijderen per gebruiker).
- **Kosten:** tegelhosting, Functions, Places, push (FCM gratis), App Store als er een native versie komt (99 USD/jaar Apple developer).

### Doorlopend in elke fase
- Tests: unit (`vitest`/node), parity/rules, catalogusschema, smoke in Edge, firebase-smoke; geen fase af zonder groene tests.
- Kostenbewaking: budget-alerts, quota per gebruiker, korte cache, field masks.
- Juridisch: `credits.json` en naamsvermelding per bron, privacy-tekst, label bij AI-content.
- Verdienmodel (later): affiliate op verblijven en activiteiten (GetYourGuide/Viator via een netwerk), optioneel Pro voor groepen; **geen paywall op basis-functies** (de grootste klacht bij Wanderlog).

---

## 5. Beslispunten voor Stefan

1. Akkoord op Blaze-plan en een Google Cloud-budgetlimiet (bijv. 10 EUR/maand)?
2. Akkoord op de foto-aanpak (Commons + Unsplash voor activiteiten, Google Places live voor verblijven)?
3. Welke tweede bestemming als proef (voorstel: Sardinië of Kreta, makkelijk vergelijkbaar met Corsica)?
4. Affiliate nu of later? Aanbeveling: later, pas na Fase 2, en eerst via een gewoon netwerk.
5. Blijft het een PWA, of wil je op termijn in de App Store (Capacitor)? Aanbeveling: eerst PWA.

## Bronnen
- [Stippl vs Wanderlog](https://docs.stippl.io/blog/stippl-vs-wanderlog), [Polarsteps: beste planningsapps](https://stories.polarsteps.com/stories/best-travel-planning-apps), [vergelijking AI-planners](https://layla.ai/blog/destinations/ai-trip-planners-tier-list), [overzicht 2026](https://vacation-planner-blog.pages.dev/blog/best-travel-planning-apps-2026/) (let op: leveranciers- en affiliatebronnen)
- [Wanderlog-reviews (aggregator)](https://marlvel.ai/apps/wanderlog-travel-planner/reviews), [Trustpilot Wanderlog](https://www.trustpilot.com/review/wanderlog.com?page=2)
- [Google Maps Platform prijzen](https://developers.google.com/maps/billing-and-pricing/pricing), [Places beleid](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Booking.com Demand API prerequisites](https://developers.booking.com/demand/docs/getting-started/prerequisites), [content-only flow](https://developers.booking.com/demand/docs/development-guide/application-flows/content-only)
- [Tripadvisor Content API](https://tripadvisor-content-api.readme.io/reference), [terms](https://tripadvisor-content-api.readme.io/reference/terms-of-use)
- [Unsplash API-richtlijnen](https://help.unsplash.com/api-guidelines/unsplash-api-guidelines)
- [Mapillary licentie](https://help.mapillary.com/hc/en-us/articles/115001770409-CC-BY-SA-license-for-open-data)
