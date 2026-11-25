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
_(max. 200 woorden: hoe trigger moeilijker te foppen, welke bias in de dataset)_

## AI-verantwoording
_(welke tool, welke prompts, wat paste je aan)_
