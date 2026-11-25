# ✏️ Doodle Quest

Campus Quest – Future Technologies, lesweek 8 (AI)

De app vraagt een tekening (bloem, zon of huis). Je tekent die op papier en houdt ze voor de camera van je smartphone. Herkent het model je tekening binnen 1 minuut met minstens 90% zekerheid, dan krijg je punten: hoe sneller, hoe meer.

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
2. De klassen moeten **exact** zo heten: `bloem`, `zon`, `huis`, `leeg blad`.
3. Kies *Export Model → TensorFlow.js*:
   - **Upload my model**: kopieer de link, **of**
   - **Download**: zet `model.json`, `metadata.json` en `weights.bin` in de map `/model`.
4. Vul in `app.js` bij `MODEL_URL` je link in, of `"./model/"`.

Zonder model draait de app in **testmodus** en kun je rondes handmatig afronden met knoppen.

## Werking
- De ronde start pas als het model eerst een **leeg blad** ziet, en pas dan verschijnt wat je moet tekenen. Daardoor kun je niet foppen met een tekening die je vooraf al gemaakt had.
- Een tekening telt pas als de zekerheid **≥ 90%** is en dat **1 seconde stabiel** blijft.
- Punten: 100 + 10 per resterende seconde.
- Het model draait volledig in de browser (TensorFlow.js). **Camerabeelden verlaten het toestel nooit**, alleen naam + score worden opgeslagen.

## Dataset
_(nog in te vullen: aantal tekeningen per klas, hoe gemaakt, digitaal vs. papier, verschillend licht/momenten)_

## Faaltabel
| Situatie | Wat gebeurde er? | Wat paste ik aan? |
|---|---|---|
| | | |
| | | |
| | | |

## Reflectie
_(max. 200 woorden: hoe trigger moeilijker te foppen, welke bias in de dataset)_

## AI-verantwoording
_(welke tool, welke prompts, wat paste je aan)_
