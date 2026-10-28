/* Gedeelde data en helpers voor de desktop- en mobiele versie */
const P = {
  bastia:[9.45,42.70], stflorent:[9.30,42.68], iler:[8.94,42.63], calvi:[8.76,42.57], pontel:[9.20,42.47],
  corte:[9.15,42.30], vivario:[9.18,42.12], vizzavona:[9.12,42.12], bocognano:[8.95,42.08], aleria:[9.51,42.10],
  ghiso:[9.40,42.02], solenzara:[9.40,41.86], portov:[9.28,41.59], zonza:[9.17,41.75], porto:[8.70,42.26],
  piana:[8.63,42.23], cargese:[8.60,42.14], sagone:[8.70,42.12], ajaccio:[8.74,41.92], petreto:[8.99,41.80],
  propriano:[8.90,41.68], sartene:[8.97,41.62], figari:[9.10,41.50], bonifacio:[9.16,41.39], folelli:[9.50,42.45],
  agriates:[9.10,42.67]
};
const OUTLINE = [[9.35,43.00],[9.46,42.93],[9.50,42.80],[9.46,42.70],[9.52,42.55],[9.55,42.40],[9.56,42.20],[9.51,42.05],[9.40,41.90],[9.40,41.72],[9.33,41.58],[9.29,41.47],[9.23,41.38],[9.10,41.37],[9.00,41.45],[8.88,41.55],[8.78,41.66],[8.62,41.80],[8.60,41.93],[8.55,42.05],[8.60,42.15],[8.60,42.30],[8.66,42.40],[8.60,42.50],[8.68,42.56],[8.80,42.60],[8.94,42.66],[9.15,42.73],[9.28,42.72],[9.30,42.80],[9.33,42.90]];
const PLACE = { // naam, labelkant
  bastia:["Bastia","r"], stflorent:["Saint-Florent","l"], calvi:["Calvi","l"], corte:["Corte","r"], vivario:["Vivario","r"],
  portov:["Porto-Vecchio","r"], zonza:["Zonza","r"], porto:["Porto","l"], ajaccio:["Ajaccio","l"], propriano:["Propriano","l"],
  bonifacio:["Bonifacio","r"], figari:["Figari","l"], iler:["Île-Rousse","r"], sartene:["Sartène","l"]
};
const X = lon => ((lon - 8.45) * 300).toFixed(1), Y = lat => ((43.05 - lat) * 400).toFixed(1);
const pathOf = keys => keys.map((k, i) => (i ? "L" : "M") + X(P[k][0]) + " " + Y(P[k][1])).join(" ");

const AIRBNB = n => "https://www.airbnb.nl/s/" + encodeURIComponent(n + ", Corsica") + "/homes?refinement_paths%5B%5D=%2Fhomes&amenities%5B%5D=5";
const BOOKING = n => "https://www.booking.com/searchresults.nl.html?ss=" + encodeURIComponent(n + ", Corsica") + "&nflt=hotelfacility%3D5";
const GMAPS_RESTO = n => "https://www.google.com/maps/search/" + encodeURIComponent("restaurants " + n + " Corsica");
const PITCHUP = "https://www.pitchup.com/en-au/glamping/france/corse";

/* sights: [titel, afbeeldingssleutel]; food: [naam, toelichting, isNaam]; acc.k: tent|chalet|hotel|camp|house */
const STAYS = {
calvi: {
  name:"Calvi & de Balagne", short:"Calvi", kind:"Noordwestkust", coast:true, img:"calvi", q:"Calvi",
  desc:"Lange zandstrand met ondiep water, een citadel op de rots en bergen op de achtergrond. De Balagne is groen, met kleine dorpjes dicht bij elkaar. Een goede eerste plek met jonge kinderen.",
  sights:[["Citadel van Calvi","calvi","Avondwandeling met zeezicht"],["Stranden bij Calvi","calvibeach","Zand en ondiep water, ook bij Revellata"],["Trinichellu-treintje","ilerousse","Calvi - Île-Rousse langs de kust"],["Île-Rousse","ilerousse","Palmen, markthal en stadsstrand"],["Pigna","pigna","Bergdorp met ambachtswinkels"],["Lumio","lumio","Bergdorp boven de baai van Arinella"]],
  food:[["Chez Tao","Pianobar in de citadel met uitzicht, vooral een avondplek met livemuziek. Minder geschikt met jonge kinderen",1],["A Candella","Corsicaanse keuken in de citadel, terras met baaizicht",1],["Pizzeria met houtoven","Zoek langs de haven van Calvi, makkelijk met kinderen",0]],
  acc:[
   {n:"Lodge Saleccia, Camping La Pinède", u:"https://camping-calvi.com/hebergement/lodge-saleccia/", t:"Safaritent op palen", k:"tent", ac:"no", note:"Safaritent voor 4 personen. De site meldt ventilatoren in plaats van airco."},
   {n:"Camping Les Castors", u:"https://www.camping-castors.fr/", t:"Mobil-home 4*", k:"camp", ac:"yes", note:"Mobil-homes met airco in meerdere maten. Tentplekken hebben dat niet. Geen lodgetenten."},
   {n:"La Clé des Champs", u:"https://en.balagne-corsica.com/camping/la-cle-des-champs/", t:"Bungalow/chalet", k:"chalet", ac:"maybe", note:"Schaduwrijk eucalyptusterrein bij Calvi, verhuur vanaf ca. 250 euro per week. Airco navragen."},
   {n:"Camping Paradella, Calenzana", u:"https://camplinq.com/camps/camping-paradella-43145", t:"Camping met restaurant", k:"camp", ac:"maybe", note:"Grote camping met 120 plekken en eigen restaurant. Verhuur en airco navragen."},
   {n:"Pavillon Les Amandiers, Lumio", u:"https://www.travelocity.com/es/Lumio-Hoteles-Pavillon-Les-Amandiers.h90895759.Informacion-Hotel", t:"Vakantiepaviljoen", k:"house", ac:"maybe", note:"Zelfstandig paviljoen vlak bij het strand van Arinella. Airco navragen."}
  ]},
corte: {
  name:"Corte & de Restonica", short:"Corte", kind:"Binnenland, bergen", coast:false, img:"corte", q:"Corte",
  desc:"De oude hoofdstad van Corsica ligt tussen granietbergen. Vanaf hier loop je de Restonica in met zijn rivier vol natuurlijke zwempoelen. 's Nachts is het koeler dan aan de kust.",
  sights:[["Citadel van Corte","corte","Museu di a Corsica"],["Restonica-vallei","restonica","Zwempoelen en korte wandelingen"],["Scala di Santa Regina","santaregina","Spectaculaire kloof, korte stop"],["Bos van Vizzavona","vizzavona","Koel en schaduwrijk"],["Cascade des Anglais","vizzavona","Waterval met poelen"]],
  food:[["Oude stad van Corte","Zoek Corsicaanse kaas, brocciu en wildzwijnstoof",0],["Eetplekken langs de Restonica","Eenvoudige lunch bij de poelen",0]],
  acc:[
   {n:"Tent bij Omessa (Airbnb)", u:AIRBNB("Omessa"), t:"Tent met terras", k:"tent", ac:"maybe", note:"Ca. 9 km van Corte, eigen keuken en douche, beoordeling 5/5 (21 reviews). Airco niet vermeld."},
   {n:"Hôtel U Palazzu & Spa, Venaco", u:"https://www.fr.lastminute.com/hotel/fr_france/venaco-d1147141590", t:"Hotel", k:"hotel", ac:"yes", note:"Kamers met airco en eigen badkamer. Geen tent. Standaardkamers zijn klein (ca. 10 m2), vraag naar een familiekamer voor vier."},
   {n:"Hotelkamer in Vivario", u:"https://www.alentoor.fr/vivario/hebergement", t:"Hotel", k:"hotel", ac:"yes", note:"Compacte kamers (15 m2) met airco. Voor vier personen een familiekamer navragen."},
   {n:"Camping Restonica", u:"https://alanrogers.com/campsite/camping-restonica-corsica", t:"Camping", k:"camp", ac:"no", note:"Klassieke camping aan de rivier, open 1 mei tot 1 oktober, geen lodges."}
  ]},
portov: {
  name:"Porto-Vecchio", short:"Porto-Vecchio", kind:"Zuidoostkust", coast:true, img:"portov", q:"Porto-Vecchio",
  desc:"De mooiste stranden van het eiland liggen hier bij elkaar: Santa Giulia, Palombaggia en Rondinara. Veel baaien zijn ondiep. Hier is glamping met airco het best te vinden.",
  sights:[["Santa Giulia","santagiulia","Bijna een zwembad van een baai"],["Palombaggia","palombaggia","Rode rotsen en parasoldennen"],["Rondinara","rondinara","Bijna ronde, ondiepe baai"],["Porto-Vecchio","portov","Oude stad en haven"],["Col de Bavella","bavella","Dagtocht, de Aiguilles"],["Bonifacio","bonifacio","Dagtocht met boot langs de krijtrotsen"]],
  food:[["Tamaricciu (Palombaggia)","Strandrestaurant met voeten in het zand, reserveren in juli en augustus",1],["Pizzeria's in de oude stad","Houtovenpizza en ijs",0],["Lunch in Bavella-dorpen","Charcuterie en Corsicaanse kaas",0]],
  acc:[
   {n:"Domaine de Sonia", u:"https://domainedesonia.com/", t:"Koepeltent (dome)", k:"tent", ac:"yes", note:"Tussen Porto-Vecchio en Palombaggia. Alle domes hebben reversibele airco, een zwembad is op de foto's van de site te zien. Ze zijn voor 2 tot 3 personen, dus voor jullie vier twee domes boeken."},
   {n:"Santa Giulia Camara, Lecci Lodge", u:"https://www.fr.lastminute.com/hotel/france/lecci/santa-giulia-room-lecci-lodge_hid-15099978", t:"Lodge", k:"chalet", ac:"yes", note:"Zwembad, tuin en terras, airco vermeld. Vanaf ca. 139 euro per nacht."},
   {n:"Camping Sole di Sari, Solenzara", u:"https://www.campings.com/en-gb/campsite/camping-sole-di-sari-79182", t:"Lodgetenten voor 5", k:"tent", ac:"maybe", note:"Ligt in Solenzara, ca. 45 minuten van Porto-Vecchio. Buitenzwembad. Airco staat alleen bij de mobil-homes vermeld. Navragen voor de lodges."},
   {n:"Camping La Vetta", u:"https://www.pitchup.com/en-us/campsites/france/corse/corse-du-sud/porto-vecchio/camping-la-vetta", t:"Familiecamping", k:"camp", ac:"maybe", note:"In La Trinité, 10 minuten van Porto-Vecchio, in een park met bomen. Open vanaf 1 juni."},
   {n:"Tipi bij paardenranch (Airbnb)", u:AIRBNB("Porto-Vecchio"), t:"Tipi", k:"tent", ac:"no", note:"15 km ten noorden van Porto-Vecchio. Geen airco vermeld."}
  ]},
porto: {
  name:"Porto, Piana & Calanques", short:"Porto", kind:"Westkust", coast:true, img:"piana", q:"Porto",
  desc:"De rode rotsen van de Calanques de Piana staan op de werelderfgoedlijst. De kust is hier woest en de zee diepblauw. Rondvaarten naar Girolata en Scandola vertrekken vanuit Porto.",
  sights:[["Calanques de Piana","piana","Rode rotsen langs de D81"],["Reserve Scandola","scandola","Per boot vanuit Porto"],["Girolata","girolata","Dorp zonder weg"],["Gorges de Spelunca","spelunca","Kloof met Genuese bruggen"],["Bos van Aïtone","aitone","Koel bos bij Évisa"]],
  food:[["Havenrestaurants in Porto","Verse vis en pizza, veel terrassen",0],["Hotelrestaurants in Piana","Uitzicht op de rotsen bij zonsondergang",0],["Évisa","Kastanjegerechten en ijs van kastanjemeel",0]],
  acc:[
   {n:"Camping Les Oliviers, Porto/Ota", u:"https://www.fr.lastminute.com/hotel/france/ota/camping-les-oliviers_hid-4462680", t:"Camping", k:"camp", ac:"yes", note:"Verwarmd buitenbad met jacuzzi en pierenbadje. Alle accommodaties hebben een gekoelde woonruimte, de slaapkamers niet altijd."},
   {n:"Camping Sole e Vista, Porto", u:"https://www.toocamp.com/france/camping-sole-e-vista-c26736.html", t:"Camping", k:"camp", ac:"maybe", note:"Zwembad met glijbaan, kinderclub, zee op minder dan 1 km."},
   {n:"Camping Torraccia, Cargèse", u:"https://www.toocamp.com/france/camping-torraccia-c26631.html", t:"Bungalow", k:"chalet", ac:"maybe", note:"Ligt in Cargèse, ca. 1 uur rijden van Porto (de boot naar Girolata vertrekt in Porto). Zwembad met glijbanen, bungalows voor 4 tot 6 personen."}
  ]},
zonza: {
  name:"Zonza & Bavella", short:"Zonza", kind:"Binnenland, bergen", coast:false, img:"bavella", q:"Zonza",
  desc:"Dennenbossen, granietnaalden en bergrivieren met zwempoelen. Zonza ligt op 800 m en is 's avonds koel. Hier is de beste kans op een tent in de natuur, al is airco nergens bevestigd.",
  sights:[["Aiguilles de Bavella","bavella","Bergpas en uitzichtpunten"],["Dorp Zonza","zonza","Op 800 m hoogte"],["Rivier bij Solenzara","solenzara","Zwempoelen"],["Cucuruzzu bij Levie","cucuruzzu","Prehistorische site, ruimte voor kinderen"]],
  food:[["Auberge du Col de Bavella","Charcuterie, wild en kastanjepolenta bovenop de pas",1],["Dorpscafés in Zonza","Lunch met kaas en hammen van de regio",0]],
  acc:[
   {n:"Le Pré aux Biches, Yourtes de Zonza", u:"https://greengo.voyage/hote/yourte-corse-le-pre-aux-biches", t:"Yurts en tipi", k:"tent", ac:"maybe", note:"Ca. 8 yurts en een tipi op een terrein van enkele hectares. Geen bevestigde safaritent. Airco niet vermeld, 's nachts is het koel."},
   {n:"Lodgetent bij Zonza (Airbnb)", u:AIRBNB("Zonza"), t:"Lodgetent voor 2", k:"tent", ac:"maybe", note:"4 km van Zonza, toegang tot de rivier, 4,81 (26 reviews). Voor twee personen, te klein voor jullie."},
   {n:"Boomhut A Pignata, Levie", u:AIRBNB("Levie"), t:"Boomhut tot 5 personen", k:"house", ac:"maybe", note:"Een slaapkamer plus suite. Past bij een gezin."}
  ]},
bonifacio: {
  name:"Bonifacio & Figari", short:"Bonifacio", kind:"Zuidkust", coast:true, img:"bonifacio", q:"Bonifacio",
  desc:"Witte krijtrotsen, een citadel op de klif en het zuidelijkste puntje van Frankrijk. Figari ligt tussen wijngaarden en stranden. Hier staan lodges met bevestigde airco.",
  sights:[["Citadel en haven van Bonifacio","bonifacio","Uitzicht tot Sardinië"],["Îles Lavezzi","lavezzi","Snorkelen in helder water"],["Rondinara","rondinara","Ondiepe strandbaai"],["Leeuw van Roccapina","roccapina","Rots in de vorm van een leeuw"],["Sartène","sartene","Granieten stad"]],
  food:[["Kissing Pigs, Bonifacio","Bekend adres bij de haven, reserveren verstandig",1],["Stella d'Oro, Bonifacio","Klassieker in de oude stad",1],["Wijnboeren bij Figari","Proeverij en lunch met sap voor de kinderen",0]],
  acc:[
   {n:"Lodge Pinède, Pianottoli-Caldarello", u:"https://www.expedia.com/es/Pianotolli-Caldarello.dx6259910", t:"Lodge voor 5", k:"chalet", ac:"yes", note:"Airco, 200 m van het strand."},
   {n:"Résidence A Santa Trinita, Bonifacio", u:"https://www.booking.com/searchresults.nl.html?ss=Residence+A+Santa+Trinita+Bonifacio", t:"Chalets", k:"chalet", ac:"yes", note:"Tuin en airco, score 9,3 op basis van ca. 190 reviews."}
  ]},
stflorent: {
  name:"Saint-Florent & Cap Corse", short:"Saint-Florent", kind:"Noordkust", coast:true, img:"stflorent", q:"Saint-Florent",
  desc:"Een jachthaventje met terrassen, vlakbij de stranden van de Désert des Agriates. Cap Corse ligt ten noorden met Genuese torens en kleine havens. Rustig na de ferry.",
  sights:[["Haven van Saint-Florent","stflorent","Terrassen en citadel"],["Plage de Saleccia","saleccia","Wit zand in de Agriates"],["Plage du Lotu","lotu","Per boot of 4x4"],["Nonza","nonza","Zwart strand en toren"]],
  food:[["Haven van Saint-Florent","Veel terrassen met vis, pizza en ijs",0],["Wijnhuizen van Patrimonio","Eenvoudige lunch bij een wijnboer",0]],
  acc:[
   {n:"Camping Kalliste (Homair)", u:"https://www.homair.com/camping-saint-florent", t:"Camping 4*", k:"camp", ac:"maybe", note:"Zwembaden. Airco en tentenhuisjes niet bevestigd, bij Homair navragen."},
   {n:"Camping d'Olzo", u:"https://fr.camping-and-co.com/camping-d-olzo", t:"Camping", k:"camp", ac:"maybe", note:"Veel schaduw, populair bij gezinnen. Reserveren alleen per telefoon."},
   {n:"Appartement bij de haven met zwembad", u:"https://www.mediavacances.com/locations-vacances-bastia/000620000/htg-117d8d8f9e504d22", t:"Appartement", k:"house", ac:"yes", note:"Met airco en gedeeld zwembad. Geen tent. De advertentie staat onder Bastia, controleer de ligging."}
  ]},
vivario: {
  name:"Vivario & Vizzavona", short:"Vivario", kind:"Binnenland, bergen", coast:false, img:"vizzavona", q:"Vivario",
  desc:"Beukenbossen, watervallen en het hoogste treinstation van Corsica. Vizzavona ligt midden op het eiland en is koel, ook in augustus. Een rustige halte voor de lange rit naar het zuidwesten.",
  sights:[["Bos van Vizzavona","vizzavona","Korte boswandelingen"],["Cascade des Anglais","vizzavona","Waterval met poelen"],["Treinstation Vizzavona","ilerousse","Chemins de fer de la Corse"],["Restonica (dagtocht)","restonica","Zwempoelen"],["Corte (dagtocht)","corte","Citadel en museum"]],
  food:[["Hôtel-restaurant U Castellu","Lunch in het bos, bekende pleisterplaats in Vizzavona",1],["Brasseries in Vivario en Venaco","Eenvoudige bergkeuken en brocciu",0]],
  acc:[
   {n:"Hôtel-restaurant U Castellu, Vizzavona", u:"https://www.fr.lastminute.com/hotel/france/vivario/hotel-restaurant-u-castellu-vizzavona_hid-252017", t:"Hotel", k:"hotel", ac:"maybe", note:"In het bos. Airco niet bevestigd, op deze hoogte vaak niet nodig."},
   {n:"Tent in Vizzavona (Airbnb)", u:"https://www.airbnb.co.uk/rooms/7447564", t:"Tent", k:"tent", ac:"maybe", note:"Zie de advertentie voor voorzieningen."},
   {n:"Hôtel U Palazzu & Spa, Venaco", u:"https://www.fr.lastminute.com/hotel/fr_france/venaco-d1147141590", t:"Hotel", k:"hotel", ac:"yes", note:"Kamers met airco en eigen badkamer."}
  ]},
propriano: {
  name:"Propriano & Golf van Valinco", short:"Propriano", kind:"Zuidwestkust", coast:true, img:"propriano", q:"Propriano",
  desc:"Een brede baai met zandstrand, een gezellig havenstadje en prehistorische sites vlakbij. Tussen Ajaccio en Bonifacio is dit een logische tussenstop.",
  sights:[["Propriano","propriano","Haven en strand"],["Filitosa","filitosa","Prehistorische beelden, kindvriendelijk"],["Sartène","sartene","Granieten stad"],["Leeuw van Roccapina","roccapina","Rotsformatie bij het strand"]],
  food:[["Haven van Propriano","Terrassen met vis en pizza",0],["Plein van Sartène","Corsicaanse specialiteiten",0]],
  acc:[
   {n:"Camping L'Esplanade, Olmeto", u:"https://www.visit-corsica.com/fr/Mes-Favoris/L-ESPLANADE", t:"Tentenlodge en mobil-home 4*", k:"tent", ac:"maybe", note:"Zwembad en direct strand, 5 km van Propriano (in Olmeto). Mobil-homes hebben reversibele airco. Voor de lodgetenten is dat niet bevestigd."},
   {n:"Camping Tikiti, Propriano", u:"https://www.toocamp.com/france/camping-tikiti-c26731.html", t:"Bungalow", k:"chalet", ac:"maybe", note:"56 bungalows, zwembad van 200 m2 met waterval en kinderbad."},
   {n:"Domaine Sarra di Sole, Pietrosella", u:"https://www.airbnb.com/rooms/34070863", t:"Safaritent op palen", k:"tent", ac:"maybe", note:"Zicht over de Golf van Ajaccio, met zwembad. Ca. 1 uur van Propriano. Airco niet vermeld."}
  ]}
};

/* day: [plaatsId, titel, tekst, rit] */
const ROUTES = {
a: {
  color:"--route-a", name:"Route A", sub:"Balagne, Corte, Porto-Vecchio", title:"Klassiek: Balagne, de bergen en het zuidoosten",
  lead:"Eerst het groene noordwesten rond Calvi, dan drie nachten de bergen in bij Corte en daarna zes nachten aan de stranden van Porto-Vecchio. Korte ritten. De ferry vertrekt en komt aan in Bastia.",
  ferry:"Ferry naar Bastia, bijvoorbeeld vanaf Livorno of Savona. Boek in juli en augustus zo vroeg mogelijk, ook voor de EV.",
  stops:["bastia","calvi","corte","portov","bastia"], stays:["calvi","corte","portov"], nights:[4,3,6],
  legs:[
   {from:"Bastia", to:"Calvi", km:92, min:120, via:["bastia","stflorent","agriates","iler","calvi"]},
   {from:"Calvi", to:"Corte", km:95, min:115, via:["calvi","iler","pontel","corte"]},
   {from:"Corte", to:"Porto-Vecchio", km:135, min:150, via:["corte","aleria","ghiso","solenzara","portov"]},
   {from:"Porto-Vecchio", to:"Bastia", km:135, min:140, via:["portov","solenzara","ghiso","aleria","folelli","bastia"]}
  ],
  days:[
   ["calvi","Aankomst en eerste strandmiddag","Ferry komt aan in Bastia. Rijd via Saint-Florent naar Calvi (2 uur). Inchecken, zwemmen in de baai en vroeg naar bed.","Bastia - Calvi, 2 u"],
   ["calvi","Strand en citadel","Ochtend op het strand van Calvi, ondiep en rustig. Aan het eind van de middag de citadel op voor ijsjes en uitzicht.",""],
   ["calvi","Treinrit naar Île-Rousse","Met het Trinichellu-treintje langs de kust naar Île-Rousse. Lunch, schaduw onder de markthal en zwemmen bij het stadsstrand.",""],
   ["calvi","Bergdorpjes of rustdag","Pigna en Sant'Antonino met winkeltjes van ambachtslieden, of een luie dag aan de baai van Arinella bij Lumio met snorkelmasker.",""],
   ["corte","Naar de bergen","Via Île-Rousse en Ponte-Leccia naar Corte (2 uur). Citadel van Corte beklimmen en eten in de oude stad.","Calvi - Corte, 1 u 55"],
   ["corte","Restonica-rivier","Rijd de Restonica-vallei in en zoek een natuurlijk zwempoeltje. Korte wandeling langs de rivier. Neem eten mee.",""],
   ["corte","Kloof en dorpjes","Stop bij Scala di Santa Regina en wandel een stukje in de Gorges du Tavignano. Rustige middag in Corte.",""],
   ["portov","Naar het zuiden","Via de oostkust naar Porto-Vecchio, ca. 2,5 uur. Pauze bij de Romeinse opgraving in Aléria. Middag zwemmen op Santa Giulia.","Corte - Porto-Vecchio, 2 u 30"],
   ["portov","Palombaggia","Dagje op het strand van Palombaggia met rode rotsen en parasoldennen. Lunch bij een strandtent.",""],
   ["portov","Bavella, halve dag","Autotocht (ca. 1 uur) naar de Col de Bavella, kijken bij de Aiguilles en zwemmen in een rivierpoel. Geen lange wandeling met kinderen van 5 en 7.",""],
   ["portov","Bonifacio","Bonifacio: citadel en een bootje langs de krijtrotsen (ca. 1 uur rijden heen). Terug via Rondinara voor een late duik.",""],
   ["portov","Rondinara en Santa Manza","Ondiepe baaien en een rustige dag. Kinderen kunnen ver het water in.",""],
   ["portov","Laatste strandmiddag","Oude stad van Porto-Vecchio, souvenirs en een afscheidsdiner bij Tamaricciu of in de stad.",""],
   ["bastia","Terug naar de ferry","Via de oostkust terug naar Bastia (2 uur 20). Kies een ferry aan het eind van de dag.","Porto-Vecchio - Bastia, 2 u 20"]
  ]
},
b: {
  color:"--route-b", name:"Route B", sub:"Westkust, Bavella, zuiden", title:"Wilde westkust, Bavella en het zuiden",
  lead:"Aankomst in Ajaccio en direct naar de rode rotsen van Piana en Porto. Dan naar de koele bergen bij Zonza en als laatste zes nachten naar de zuidkust bij Bonifacio en Figari, met bevestigde airco. De rit Porto - Zonza is lang (ruim 4 uur), dus houd er een hele dag voor vrij.",
  ferry:"Ferry naar Ajaccio, bijvoorbeeld vanaf Marseille, Toulon of Nice. De nachtboot scheelt een hotelnacht.",
  stops:["ajaccio","porto","zonza","bonifacio","ajaccio"], stays:["porto","zonza","bonifacio"], nights:[4,3,6],
  legs:[
   {from:"Ajaccio", to:"Porto", km:85, min:135, via:["ajaccio","sagone","cargese","piana","porto"]},
   {from:"Porto", to:"Zonza", km:187, min:255, via:["porto","piana","cargese","sagone","ajaccio","petreto","zonza"]},
   {from:"Zonza", to:"Bonifacio / Figari", km:85, min:110, via:["zonza","portov","figari","bonifacio"]},
   {from:"Figari", to:"Ajaccio", km:125, min:140, via:["figari","sartene","propriano","petreto","ajaccio"]}
  ],
  days:[
   ["porto","Ferry en de rode kust","Aankomst in Ajaccio. Rijd de D81 langs de golf van Sagone en Cargèse naar Porto (2 uur 15). Stop in Cargèse voor een ijsje.","Ajaccio - Porto, 2 u 15"],
   ["porto","Calanques de Piana","Korte stops en uitkijkpunten langs de D81. De Chien de Pierre is te zwaar voor een kind van 5. Zwemmen bij Porto.",""],
   ["porto","Boot naar Girolata","Rondvaart naar Girolata en Scandola (kies de korte route, ongeveer 3 uur). Snorkelen kan bij de stop.",""],
   ["porto","Aïtone en kloven","Rijd naar Évisa en het Aïtone-bos voor frisse lucht en een korte wandeling naar de poelen. Terug langs de Gorges de Spelunca.",""],
   ["zonza","Naar Zonza (lange rit)","Reisdag van ca. 4 uur 15, met kinderen van 5 en 7 plan je er een hele dag voor. Lunch in Ajaccio en een uur bij het stadsstrand of Maison Bonaparte, daarna verder naar Zonza.","Porto - Zonza, 4 u 15"],
   ["zonza","Col de Bavella","De Aiguilles de Bavella zien, korte wandeling bij de pas en lunch bij de auberge.",""],
   ["zonza","Rivier en megalieten","Zwempoelen in de Solenzara-rivier. Namiddag bij de prehistorische site Cucuruzzu bij Levie.",""],
   ["bonifacio","Naar het zuiden","Via Porto-Vecchio en de kust naar Figari/Bonifacio (ca. 2 uur). Check-in en zwembad.","Zonza - Figari, 1 u 50"],
   ["bonifacio","Bonifacio","Citadel, haven en een bootje langs de krijtrotsen en grotten.",""],
   ["bonifacio","Îles Lavezzi","Boottocht naar de Lavezzi-eilanden. Snorkelen in het heldere water. Zonnehoed mee.",""],
   ["bonifacio","Rondinara en Santa Manza","Ondiepe baaien dicht bij het zuiden. Rustig dagje aan het water.",""],
   ["bonifacio","Wijndomein en Roccapina","Bezoek aan een wijnboer bij Figari met sap voor de kinderen, daarna het strand bij de Leeuw van Roccapina.",""],
   ["bonifacio","Rustdag","Zwembad, lui ontbijt en een wandeling door de oude stad.",""],
   ["ajaccio","Terug naar de ferry","Via Sartène en Propriano naar Ajaccio (2 uur 20). Stop bij Filitosa als het past.","Figari - Ajaccio, 2 u 20"]
  ]
},
c: {
  color:"--route-c", name:"Route C", sub:"Grand Tour, 4 plekken", title:"Grand Tour met vier verblijfplaatsen",
  lead:"Het meeste afwisseling: noordkust, bergbos van Vizzavona, zuidwestelijke golf en oostelijke stranden. De ferry vertrekt en komt aan in Bastia. Vier verblijfplaatsen betekent drie keer inpakken, dus de dagen zijn rustig gehouden.",
  ferry:"Ferry naar Bastia, bijvoorbeeld vanaf Livorno of Savona.",
  stops:["bastia","stflorent","vivario","propriano","portov","bastia"], stays:["stflorent","vivario","propriano","portov"], nights:[3,3,3,4],
  legs:[
   {from:"Bastia", to:"Saint-Florent", km:22, min:40, via:["bastia","stflorent"]},
   {from:"Saint-Florent", to:"Vivario", km:110, min:135, via:["stflorent","pontel","corte","vivario"]},
   {from:"Vivario", to:"Propriano", km:135, min:160, via:["vivario","vizzavona","bocognano","ajaccio","propriano"]},
   {from:"Propriano", to:"Porto-Vecchio", km:85, min:105, via:["propriano","sartene","figari","portov"]},
   {from:"Porto-Vecchio", to:"Bastia", km:135, min:140, via:["portov","solenzara","ghiso","aleria","folelli","bastia"]}
  ],
  days:[
   ["stflorent","Aankomst","Ferry naar Bastia, korte rit naar Saint-Florent (40 minuten). Rond de haven wandelen en eten.","Bastia - Saint-Florent, 40 min"],
   ["stflorent","Agriates met de boot","Boottaxi naar Lotu of Saleccia, witte stranden met turquoise water. Neem water en schaduw mee.",""],
   ["stflorent","Nonza en wijngaarden","Via Patrimonio naar Nonza (zwart strand, ca. 45 minuten rijden). Rustige middag bij de haven.",""],
   ["vivario","Naar de bergen","Over Ponte-Leccia en Corte naar Vivario (2 uur 15). Boswandeling en zwemmen in de Vecchio.","Saint-Florent - Vivario, 2 u 15"],
   ["vivario","Cascade des Anglais","Korte wandeling naar de waterval en poelen. Met het treintje van Vizzavona een stukje meerijden.",""],
   ["vivario","Corte en Restonica","Dagtocht naar Corte en de Restonica-vallei voor zwemmen in de rivier.",""],
   ["propriano","Naar de golf van Valinco","Over de Col de Vizzavona en door Ajaccio naar Propriano, ca. 2,5 uur. Lunch in Ajaccio.","Vivario - Propriano, 2 u 40"],
   ["propriano","Filitosa","Bezoek aan de prehistorische beelden van Filitosa, een ontdekkingstocht voor kinderen. Strand daarna.",""],
   ["propriano","Sartène en Roccapina","Rondje Sartène en de Leeuw van Roccapina. Strand voor de rest van de dag.",""],
   ["portov","Naar het oosten","Via Sartène en de zuidkust naar Porto-Vecchio. Een middag op Santa Giulia.","Propriano - Porto-Vecchio, 1 u 45"],
   ["portov","Palombaggia","Strand van Palombaggia en lunch aan het water.",""],
   ["portov","Bavella of Bonifacio","Dagtocht naar de Col de Bavella of een bootje bij Bonifacio.",""],
   ["portov","Rondinara en laatste strand","Ondiepe baai voor een vrije dag. Afscheidsdiner in Porto-Vecchio.",""],
   ["bastia","Terug naar de ferry","Via de oostkust naar Bastia (2 uur 20). Plan een ferry aan het eind van de dag.","Porto-Vecchio - Bastia, 2 u 20"]
  ]
}
};

const ISLAND = {
 regions:[
  ["Cap Corse & Bastia","Genuese torens, wijngaarden, kleine havens. Bastia heeft een oude haven en een citadel.","nonza",["Nonza","Erbalunga","Centuri","Macinaggio"]],
  ["Balagne","Calvi, Île-Rousse en bergdorpjes vol ambachtslieden. Groen en vruchtbaar.","calvi",["Calvi","Île-Rousse","Pigna","Lumio"]],
  ["Westkust","Rode rotsen van Piana, Porto, Scandola, Girolata en de Spelunca-kloof.","piana",["Calanques de Piana","Scandola","Girolata","Évisa"]],
  ["Ajaccio & omgeving","Napoleons geboortestad met musea en een stadsstrand.","ajaccio",["Maison Bonaparte","Îles Sanguinaires","Cargèse"]],
  ["Midden en bergen","Corte, Restonica, Vizzavona en het GR20-pad. Koel, groen en vol rivieren.","restonica",["Corte","Restonica","Vizzavona","Scala di Santa Regina"]],
  ["Alta Rocca & Bavella","Dennenbossen, Aiguilles, zwempoelen en dorpjes op 800 m.","bavella",["Bavella","Zonza","Levie","Cucuruzzu"]],
  ["Zuiden","Bonifacio, Porto-Vecchio, Figari en de stranden Palombaggia en Santa Giulia.","bonifacio",["Bonifacio","Lavezzi","Rondinara","Palombaggia"]],
  ["Zuidwesten","Golf van Valinco met Propriano, Sartène, Filitosa en Roccapina.","sartene",["Filitosa","Sartène","Roccapina","Propriano"]]
 ],
 highlights:[
  ["Calanques de Piana","UNESCO-werelderfgoed. Rode granietrotsen langs de D81.","piana"],
  ["Réserve de Scandola","Natuurreservaat, alleen per boot vanuit Porto of Calvi.","scandola"],
  ["Girolata","Dorpje dat je alleen per boot of te voet bereikt.","girolata"],
  ["Bonifacio","Citadel op krijtrotsen, uitzicht tot Sardinië.","bonifacio"],
  ["Îles Lavezzi","Granieten eilandjes met helder water, snorkelen.","lavezzi"],
  ["Palombaggia","Rode rotsen en parasoldennen, een van de bekendste stranden.","palombaggia"],
  ["Santa Giulia","Lagune-achtige baai met ondiep water.","santagiulia"],
  ["Rondinara","Bijna ronde baai, ondiep water.","rondinara"],
  ["Saleccia","Wit strand in de Désert des Agriates.","saleccia"],
  ["Lotu","Strand in de Agriates, per boot of 4x4.","lotu"],
  ["Col de Bavella","Bergpas met de Aiguilles de Bavella.","bavella"],
  ["Restonica","Rivier met zwempoelen en meren hoger op.","restonica"],
  ["Gorges de Spelunca","Diepe kloof bij Évisa met Genuese bruggen.","spelunca"],
  ["Filitosa","Prehistorische beelden (neolithicum tot bronstijd).","filitosa"],
  ["Corte","Hart van Corsica, universiteit en citadel.","corte"],
  ["Ajaccio","Geboorteplaats van Napoleon.","ajaccio"],
  ["Sartène","Donkere granieten stad op een heuvel.","sartene"],
  ["Nonza","Zwart strand en toren op Cap Corse.","nonza"]
 ],
 kids:[
  ["Trinichellu","Treintje Calvi - Île-Rousse langs de kust.","ilerousse"],
  ["Bootjes","Rondvaart Bonifacio-grotten, Scandola, Lavezzi, Agriates.","lavezzi"],
  ["Zwempoelen","Restonica, Solenzara, Vecchio, Tavignano.","restonica"],
  ["Filitosa en Cucuruzzu","Prehistorische stenen met ruimte om te rennen.","filitosa"],
  ["Ondiepe baaien","Santa Giulia, Rondinara, Calvi, Santa Manza.","rondinara"],
  ["Treinreis in de bergen","Chemins de fer de la Corse tussen Bastia, Ajaccio, Corte en Calvi.","ilerousse"]
 ],
 tips:[
  ["Hitte","In juli en augustus loopt het kwik tot 35 graden. Plan activiteiten 's ochtends of na 17 uur. Hoogte brengt verkoeling."],
  ["Wegen","Bergwegen zijn smal en bochtig, gemiddeld ca. 40 km/u. Plan liefst maximaal 3 uur rijden per dag."],
  ["Ferry's","Corsica Ferries, Corsica Linea, La Méridionale en Moby varen onder meer vanuit Livorno, Savona, Genua, Nice, Toulon en Marseille. Boek de auto vroeg mee."],
  ["EV","Laadpunten zijn niet in kaart gebracht. Vraag bij elke accommodatie of er stroom of een laadpunt is."],
  ["Brandgevaar","Sommige bossen zijn in de zomer afgesloten. Vuur stoken is verboden."],
  ["Kinderen","Autostoelen en zonnecrème mee. Strandschoenen helpen bij kiezelstrandjes."]
 ]
};

/* ---------- Helpers ---------- */
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const IMG = k => "img/" + k + ".jpg";
const GRAD = ["#0f6e7c,#4c6b3a","#c27a1d,#7a4a8a","#4c6b3a,#0f6e7c","#7a4a8a,#0f6e7c","#9a5b2a,#4c6b3a","#2a6f97,#c27a1d"];
const fmtT = m => Math.floor(m / 60) + " u " + String(m % 60).padStart(2, "0");
/* afbeelding met kleurverloop als terugval */
function photo(key, cls, alt) {
  const g = GRAD[(key || "x").length % GRAD.length];
  return `<span class="ph ${cls || ""}" style="--g:${g}"><img src="${IMG(key)}" alt="${esc(alt || "")}" loading="lazy" onerror="this.remove()"></span>`;
}
const ICONS = {
  tent:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 20 12 4l9 16M12 4v16M8.5 20 12 13l3.5 7" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  chalet:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-6h4v6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  hotel:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4h14v17M9 8h2M13 8h2M9 12h2M13 12h2M10 21v-4h4v4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  camp:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 20h20M5 20 12 7l7 13M12 7V4M9 20l3-5 3 5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  house:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 12 5l8 7v8H4zM10 20v-5h4v5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>'
};
const acLabel = a => a === "yes" ? ["yes","Airco vermeld"] : a === "no" ? ["no","Geen airco"] : ["maybe","Airco niet bevestigd"];
const stopNames = {bastia:"Bastia, Corsica", calvi:"Calvi, Corsica", corte:"Corte, Corsica", portov:"Porto-Vecchio, Corsica", ajaccio:"Ajaccio, Corsica",
  porto:"Porto, Corsica", zonza:"Zonza, Corsica", bonifacio:"Bonifacio, Corsica", stflorent:"Saint-Florent, Corsica", vivario:"Vivario, Corsica", propriano:"Propriano, Corsica"};
const gmapsDir = route => {
  const s = route.stops.map(k => stopNames[k]);
  return "https://www.google.com/maps/dir/?api=1&travelmode=driving&origin=" + encodeURIComponent(s[0]) + "&destination=" + encodeURIComponent(s[s.length-1]) +
    "&waypoints=" + encodeURIComponent(s.slice(1,-1).join("|"));
};
function totals(route) {
  const km = route.legs.reduce((a, l) => a + l.km, 0), min = route.legs.reduce((a, l) => a + l.min, 0);
  return { km, min, time: fmtT(min) };
}
const LEGLET = "ABCDE";
function mapSvg(route) {
  const col = `var(${route.color})`;
  let svg = `<svg viewBox="0 0 350 700" role="img" aria-label="Routekaart van Corsica" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<path d="M${OUTLINE.map(p => X(p[0]) + " " + Y(p[1])).join(" L")} Z" fill="var(--rock)" stroke="var(--line)" stroke-width="1.5" stroke-linejoin="round"/>`;
  svg += `<ellipse cx="${X(9.05)}" cy="${Y(42.20)}" rx="38" ry="105" fill="var(--maquis)" opacity=".18" transform="rotate(-8 ${X(9.05)} ${Y(42.20)})"/>`;
  svg += `<text x="${X(9.03)}" y="${Y(42.20)}" font-size="10" text-anchor="middle" fill="var(--muted)" font-style="italic">bergen</text>`;
  route.legs.forEach((l, i) => { svg += `<path d="${pathOf(l.via)}" fill="none" stroke="${col}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"${i === route.legs.length - 1 && route.stops[0] === route.stops[route.stops.length-1] ? ' stroke-dasharray="7 5"' : ''}/>`; });
  const shown = [];
  route.stops.forEach(k => {
    const c = P[k]; const first = !shown.includes(k); shown.push(k);
    const isStay = route.stays.includes(k);
    svg += `<circle cx="${X(c[0])}" cy="${Y(c[1])}" r="${isStay ? 8 : 6}" fill="${isStay ? col : 'var(--surface)'}" stroke="${col}" stroke-width="2.4"/>`;
    if (isStay && first) svg += `<text x="${X(c[0])}" y="${(+Y(c[1]) + 3.8).toFixed(1)}" font-size="10.5" font-weight="700" text-anchor="middle" fill="var(--surface)">${route.stays.indexOf(k) + 1}</text>`;
  });
  const label = (k, bold) => { // labels van stops en tussenpunten
    const c = P[k]; if (!PLACE[k]) return ""; const side = PLACE[k][1]; const dx = side === "l" ? -13 : 13;
    return `<text x="${(+X(c[0]) + dx).toFixed(1)}" y="${(+Y(c[1]) + 4).toFixed(1)}" font-size="${bold ? 12.5 : 10.5}" font-weight="${bold ? 700 : 500}" text-anchor="${side === 'l' ? 'end' : 'start'}" fill="${bold ? 'var(--fg)' : 'var(--muted)'}" stroke="var(--rock)" stroke-width="3" paint-order="stroke">${PLACE[k][0]}</text>`;
  };
  const done = new Set();
  route.legs.forEach(l => l.via.forEach(k => { if (!route.stops.includes(k) && PLACE[k] && !done.has(k)) { done.add(k); svg += `<circle cx="${X(P[k][0])}" cy="${Y(P[k][1])}" r="2.8" fill="var(--muted)"/>` + label(k, false); } }));
  [...new Set(route.stops)].forEach(k => svg += label(k, true));
  route.legs.forEach((l, i) => { // ritletters
    const m = l.via[Math.floor((l.via.length - 1) / 2)], n = l.via[Math.floor((l.via.length - 1) / 2) + 1] || m;
    const x = ((+X(P[m][0]) + +X(P[n][0])) / 2 + (i % 2 ? 12 : -12)).toFixed(1), y = ((+Y(P[m][1]) + +Y(P[n][1])) / 2).toFixed(1);
    svg += `<rect x="${x - 7}" y="${y - 7}" width="14" height="14" rx="4" fill="var(--surface)" stroke="${col}" stroke-width="1.5"/><text x="${x}" y="${(+y + 3.8).toFixed(1)}" font-size="10" font-weight="700" text-anchor="middle" fill="var(--fg)">${LEGLET[i]}</text>`;
  });
  return svg + `</svg>`;
}
function islandMapSvg() {
  const stops = ["bastia","calvi","porto","ajaccio","propriano","bonifacio","portov","corte"];
  let svg = `<svg viewBox="0 0 350 700" role="img" aria-label="Kaart van Corsica" xmlns="http://www.w3.org/2000/svg">`;
  svg += `<path d="M${OUTLINE.map(p => X(p[0]) + " " + Y(p[1])).join(" L")} Z" fill="var(--rock)" stroke="var(--line)" stroke-width="1.5" stroke-linejoin="round"/>`;
  svg += `<ellipse cx="${X(9.05)}" cy="${Y(42.20)}" rx="38" ry="105" fill="var(--maquis)" opacity=".18" transform="rotate(-8 ${X(9.05)} ${Y(42.20)})"/>`;
  svg += `<text x="${X(9.03)}" y="${Y(42.20)}" font-size="10" text-anchor="middle" fill="var(--muted)" font-style="italic">bergen</text>`;
  stops.forEach(k => { const c = P[k], side = PLACE[k][1], dx = side === "l" ? -11 : 11;
    svg += `<circle cx="${X(c[0])}" cy="${Y(c[1])}" r="5" fill="var(--sea)"/><text x="${(+X(c[0]) + dx).toFixed(1)}" y="${(+Y(c[1]) + 4).toFixed(1)}" font-size="12" font-weight="600" text-anchor="${side === 'l' ? 'end' : 'start'}" fill="var(--fg)" stroke="var(--rock)" stroke-width="3" paint-order="stroke">${PLACE[k][0]}</text>`; });
  return svg + `</svg>`;
}

/* Foto bij een dag: zoekt een sleutelwoord in de titel en tekst, anders de foto van de verblijfplaats */
const DAYIMG = [[/Bavella|Aiguilles/i,"bavella"],[/Palombaggia/i,"palombaggia"],[/Lavezzi/i,"lavezzi"],[/Bonifacio/i,"bonifacio"],[/Rondinara/i,"rondinara"],[/Santa Giulia/i,"santagiulia"],
 [/Girolata|Scandola/i,"girolata"],[/Calanques/i,"piana"],[/Aïtone|Spelunca/i,"aitone"],[/Restonica/i,"restonica"],[/Cascade des Anglais/i,"vizzavona"],[/Santa Regina/i,"santaregina"],
 [/Agriates|Lotu|Saleccia/i,"saleccia"],[/Nonza/i,"nonza"],[/Filitosa/i,"filitosa"],[/Cucuruzzu/i,"cucuruzzu"],[/Roccapina|Sartène/i,"roccapina"],[/Trein|Trinichellu/i,"ilerousse"],
 [/Île-Rousse/i,"ilerousse"],[/Pigna|Arinella/i,"pigna"],[/citadel/i,"calvi"],[/Corte en/i,"corte"]];
function dayImg(d) {
  for (const [re, k] of DAYIMG) if (re.test(d[1])) return k;
  return STAYS[d[0]] ? STAYS[d[0]].img : d[0];
}
