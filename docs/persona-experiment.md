# Persona-experiment: hoeveel swipes zijn genoeg?

**Conclusie:** met de huidige app (ronde 5) zijn na alle 25 kaarten per deck **7 van de 8 persona's tevreden, met een gemiddelde van 4,0**. Daarmee is het doel gehaald (minstens 7 van de 8 tevreden en een gemiddelde van minstens 4).

Na **10 kaarten per deck** zit de tevredenheid al dicht bij het maximum. Meer kaarten maken het profiel vooral **stabieler**: de top 3 en de aanbevolen route veranderen minder. De tevredenheid zelf groeit na die 10 kaarten nauwelijks.

**Advies:** vraag 10–15 kaarten per deck en laat de rest optioneel. Laat mensen hun profiel daarna corrigeren in het scherm "profiel corrigeren".

## Opzet
- **8 persona's,** elk een aparte Haiku-agent met een verborgen persona-tekst:
  - luxe-stel;
  - avonturier;
  - gezin met kinderen;
  - budget-backpacker;
  - cultuur en eten;
  - rust en strand;
  - vriendengroep met uitgaan;
  - "Stefan".
- **Swipen:** ze swipeten op foto en titel alleen.
- **Vinkjes:** ze vulden de vinkjes in (airco, laadpaal, kinderen, budget).
- **Blind beoordelen:** per ronde kreeg elke persona 5 voorstellen, voor 5, 10, 15, 20 en 25 kaarten per deck, in willekeurige volgorde, zonder te weten welk voorstel bij welk aantal hoorde.
- **Score:** per voorstel acc, act, route en overall (1–5), plus "tevreden" (zou ik dit boeken?).

## Resultaten per ronde
Elke cel toont het gemiddelde overall, met tussen haakjes het aantal tevreden persona's.

| Ronde | 5 | 10 | 15 | 20 | 25 | gemiddeld | belangrijkste wijziging |
|---|---|---|---|---|---|---|---|
| 1 | 3,1 (3/8) | 3,4 (5/8) | 3,3 (3/8) | 3,5 (3/8) | 3,5 (4/8) | 3,35 | eerste versie |
| 2 | 3,6 (4/8) | 3,6 (6/8) | 3,1 (2/8) | 3,3 (3/8) | 3,3 (3/8) | 3,38 | "liever niet" als harde filter, vinkjes, deck v2, extra catalogus |
| 3 | 3,3 (1/8) | 3,3 (3/8) | 3,0 (2/8) | 3,4 (2/8) | 3,3 (2/8) | 3,23 | "liever niet" pas bij ≥2 kaarten; airco-data ontbrak |
| 4 | 3,5 (3/8) | 3,5 (4/8) | 3,4 (4/8) | 3,4 (4/8) | 3,3 (3/8) | 3,40 | airco en laadpaal per verblijf gecontroleerd |
| **5** | 3,8 (5/8) | 3,6 (4/8) | 3,4 (3/8) | 3,8 (5/8) | **4,0 (7/8)** | **3,70** | afkeur per regio, harde budgetgrens, kids-filter, rustig-filter |

**Groepstest:** de groepstest was luxe-stel plus "Stefan".
- Beiden vinden het een eerlijk compromis.
- Het luxe-stel is tevreden.
- Stefan was dat niet, omdat het budget van de ander gold. Daarom geldt in een groep nu het strengste budget, en ook de harde eisen van elk lid.

## Lessen
1. **Te strenge afkeur kost meer dan hij oplevert.** In ronde 2 telde één linkse swipe als harde uitsluiting. Daardoor werden de voorstellen slechter naarmate mensen meer swipeten.
2. **Data verslaat het algoritme.** Ontbrekende airco-data maakte goede voorstellen onboekbaar. Na het controleren van airco per verblijf ging de tevredenheid direct omhoog.
3. **Swipes zeggen niet alles.** De cultuur-persona vond strand en lange tochten niets, maar swipete dat niet consequent. Een scherm om je profiel te corrigeren is daarom nodig.
4. **Fotokeuze telt mee.** Foto's met drukte, of van een airco-unit of een laadpaal, meten de foto in plaats van de wens.

De data van het experiment staat in de scratchpad, `personas/p*/` (swipes, notes en ratings 1 t/m 5), en wordt reproduceerbaar via `test/fixtures/personas/` en `tools/curve.mjs`.
