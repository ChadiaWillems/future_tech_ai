# ✏️ Doodle Quest

Campus Quest – Future Technologies, lesweek 8 (AI)

De app vraagt een tekening (bloem, zon of huis). Je tekent die op papier en houdt ze voor de camera van je smartphone. Herkent het model je tekening binnen 1 minuut met minstens 80% zekerheid, dan krijg je punten: hoe sneller, hoe meer.

## Hoe starten

### Op je smartphone
De camera werkt alleen via **HTTPS**. Zet de repo dus online met **GitHub Pages**:
1. Push de repo naar GitHub.
2. Ga naar *Settings → Pages → Deploy from a branch → main / root*.
3. Open de link (`https://<gebruikersnaam>.github.io/<repo>/`) op je iPhone en geef de camera toestemming.

### Lokaal op je computer
```bash
python3 -m http.server 8000
```
Open daarna `http://localhost:8000`. Localhost mag de camera gebruiken, een gewoon IP-adres niet.

## Model toevoegen
1. Train je model in [Teachable Machine](https://teachablemachine.withgoogle.com/) (Image Project).
2. De klassen moeten zo heten: `bloem`, `zon`, `huis`, `leeg blad` (hoofdletters maken niet uit). Extra klassen, zoals `niets`, mogen ook.
3. Kies *Export Model → TensorFlow.js*:
   - **Upload my model**: kopieer de link, **of**
   - **Download**: zet `model.json`, `metadata.json` en `weights.bin` in een nieuwe map, bv. `/model/v4`. Gebruik voor elk nieuw model een nieuwe map, anders kan de browser een oud `weights.bin` uit de cache halen.
4. Vul in `app.js` bij `MODEL_URL` je link in, of het pad naar de map (bv. `"./model/v4/"`).

Zonder model draait de app in **testmodus** en kun je rondes handmatig afronden met knoppen.

## Werking
- De ronde start pas als het model eerst een **leeg blad** ziet, en pas dan verschijnt wat je moet tekenen. Daardoor kun je niet foppen met een tekening die je vooraf al gemaakt had.
- Een tekening telt pas als de zekerheid **gemiddeld ≥ 80%** is over ongeveer **1 seconde**. Zo telt één toevallige uitschieter niet, maar ook één wiebelend beeld onder de drempel breekt het niet af.
- Punten: 100 + 10 per resterende seconde.
- Het model draait volledig in de browser (TensorFlow.js). **Camerabeelden verlaten het toestel nooit**, alleen naam + score worden opgeslagen.

## Backend (Supabase)
- De scores (naam, score, datum) worden opgeslagen in een **Supabase**-tabel `scores`. Op het eindscherm staat een **top 10**.
- De tabel maak je aan met [`supabase.sql`](supabase.sql) (SQL Editor → Run).
- **Row Level Security:** iedereen mag scores lezen en toevoegen, niemand mag ze aanpassen of verwijderen. Een score kan hoogstens 2100 zijn.
- In `app.js` staat alleen de **publishable key** (publiek). De secret key staat nergens in de code.
- **Camerabeelden worden nooit opgeslagen of verstuurd.**

## Dataset
_(nog in te vullen: aantal tekeningen per klas, hoe gemaakt, digitaal vs. papier, verschillend licht/momenten)_

## Faaltabel
| Situatie | Wat gebeurde er? | Wat paste ik aan? |
|---|---|---|
| Gezicht en achtergrond mee in beeld tijdens "toon een leeg blad" | Het model keek naar het hele camerabeeld in plaats van alleen het kader. "Leeg blad" haalde maar 15%. | De app knipt nu alleen het stuk binnen het gestippelde kader uit en geeft enkel dat aan het model. |
| Tekening getoond met een licht bewegende hand | De zekerheid schommelde rond de drempel (80%) en zakte telkens kort onder. De tekening werd nooit aanvaard, omdat ze 1 seconde onafgebroken boven 80% moest blijven. | De app kijkt nu naar het gemiddelde over ongeveer 1 seconde in plaats van 1 seconde zonder onderbreking. |
| _(zelf testen: ander licht / andere persoon / foto van een tekening op een scherm)_ | | |

## Maatregelen tegen foppen
| Truc | Maatregel in de app |
|---|---|
| Vooraf een tekening klaarleggen | Elke ronde start pas als het model een **leeg blad** herkent, en pas dan verschijnt wat je moet tekenen. |
| Dezelfde tekening in meerdere rondes gebruiken | 3 rondes, en elke tekening (bloem, zon, huis) komt **maar één keer** voor. |
| Een toevallige uitschieter van het model | De zekerheid moet **gemiddeld ≥ 80%** zijn over ongeveer 1 seconde. |
| Iets anders of niets tonen | Extra klas **"Niets"**, zodat het model niet moet gokken tussen de tekeningen. |
| Achtergrond of andere dingen in beeld | Alleen wat **binnen het kader** staat, gaat naar het model. |
| **Nog niet opgelost:** een foto van een tekening op een gsm- of laptopscherm | Mogelijke uitbreiding: een extra klas "scherm", of MediaPipe Object Detector om schermen in beeld te herkennen. |

## Reflectie

**Moeilijker te foppen**
Mijn app gebruikt al een paar maatregelen tegen foppen. Een ronde start pas als er een leeg blad getoond wordt, en pas daarna verschijnt wat je moet tekenen. Elke tekening komt ook maar één keer voor. Zo ben je zekerder dat spelers geen tekeningen klaarleggen of hergebruiken.
_[aanvullen: welke zwakte is er nog (bv. een foto van een tekening op een gsm-scherm) en hoe zou je die oplossen?]_
_[aanvullen: hoe kan de backend misbruikt worden en wat heb je ingesteld om dat te beperken?]_

**Bias in mijn dataset**
Mijn dataset bestaat vooral uit mijn eigen tekeningen, gemaakt met een zwarte balpen. Het model kent daardoor vooral mijn tekenstijl, en zal een tekening in potlood waarschijnlijk minder goed herkennen. Toen ik testte met een tekening van iemand anders of bij ander licht, werd die niet meteen herkend. Daarom heb ik de drempel verlaagd. Om dit te verbeteren zou ik meer tekeningen van andere mensen toevoegen, op ander papier, bij ander licht en in andere kleuren.

## AI-verantwoording

**Tool:** Claude (Anthropic), model Claude Opus 5.5, via de Claude-app.

**Waarvoor wel AI**
| Onderdeel | Hoe ik AI gebruikte |
|---|---|
| Idee | Brainstorm op basis van mijn interesses (muziek/creatief, koken, sport, een spel, voorwerpen herkennen). Uit de voorstellen koos ik zelf Doodle Quest. |
| Webapp | Claude schreef `index.html`, `style.css` en `app.js`: camera, rondes, timer, punten, geluid, het uitsnijden van het kader en de maatregelen tegen foppen. |
| Backend | Koppeling met Supabase, `supabase.sql` (tabel + Row Level Security) en het top 10-scorebord. |
| Fouten oplossen | Camera bleef hangen op iOS, cacheprobleem met `weights.bin`, de 80%-drempel die nooit gehaald werd, model laden voor het spel startte. |
| Documentatie | Eerste versie van deze README, de faaltabel (rijen 1–2) en de tabel "Maatregelen tegen foppen". |

**Waarvoor geen AI**
- De dataset: alle tekeningen en foto's maakte ik zelf.
- Het trainen en testen van het model in Teachable Machine.
- De inhoud van de reflectie (Claude herschreef mijn tekst alleen taalkundig).
- De korte uitleg over AutoML, overfitting en underfitting (voorbereiding).

**Voorbeelden van prompts**
- "Maak in deze folder (mijn repo) een webapp voor op mijn iPhone die de volgende tekeningen vraagt: bloem, zon & huis, en dan een timer die begint te lopen."
- "Vervang het Teachable Machine-model door dit."
- "Pas de opdracht pas aan nadat het lege blad herkend is, en maak de timer 40 seconden." (later: 1 minuut)
- "Kijkt hij over heel de camera of enkel wat in dat vierkant zit?"
- "Zet 3 rondes in plaats van 5, zodat er geen tekeningen hergebruikt kunnen worden."
- "Voeg geluid toe als ze moeten beginnen met tekenen, als het juist is en als het fout is."

**Wat ik zelf besliste of aanpaste**
- De klassen (bloem, zon, huis, leeg blad) en later de extra klas **Niets**.
- Eerst het lege blad tonen en pas daarna de opdracht laten zien.
- 3 rondes met elke tekening maar één keer, timer van 1 minuut, drempel van 80%.
- Drie keer opnieuw getraind met meer en betere foto's.
