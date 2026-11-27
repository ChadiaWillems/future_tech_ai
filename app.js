// =====================================================================
// Doodle Quest – teken wat gevraagd wordt en toon het aan de camera
// =====================================================================

// ---------- INSTELLINGEN ----------
const CONFIG = {
  // Plak hier de link van je Teachable Machine-model (Export > Upload my model),
  // bv. "https://teachablemachine.withgoogle.com/models/AbCdEf123/"
  // of "./model/" als je de bestanden (model.json, metadata.json, weights.bin) in de map /model zet.
  // Leeg laten = testmodus met knoppen.
  MODEL_URL: "./model/v3/",   // nieuw model? zet het in een nieuwe map (v4, v5, …) zodat de browser geen oude bestanden uit de cache gebruikt

  ROUNDS: 3,               // aantal rondes per spel (elke tekening maar één keer)
  ROUND_TIME: 60,          // seconden per tekening
  THRESHOLD: 0.8,          // minimale zekerheid (80%)
  HOLD_MS: 1000,           // zo lang moet de voorspelling stabiel blijven
  PREDICT_EVERY_MS: 150,   // hoe vaak het model voorspelt
  REQUIRE_EMPTY_FIRST: true, // ronde start pas als het model eerst een leeg blad ziet (anti-foppen)
  EMPTY_LABEL: "leeg blad",  // moet exact overeenkomen met je klasnaam in Teachable Machine

  // Supabase (backend voor de scores). Vind je onder Project Settings > API.
  // Leeg laten = scores enkel lokaal in de browser.
  SUPABASE_URL: "https://vflauustfbekavvgvygg.supabase.co",
  SUPABASE_KEY: "sb_publishable_NeuhJxpwrjhFne9PYRfJew_cBLDwZ1a", // publishable key (publiek). NOOIT de secret key hier zetten!
};

// De labels moeten EXACT overeenkomen met de klasnamen in Teachable Machine.
const DRAWINGS = [
  { label: "bloem", text: "Teken een bloem", emoji: "🌸" },
  { label: "zon",   text: "Teken een zon",   emoji: "☀️" },
  { label: "huis",  text: "Teken een huis",  emoji: "🏠" },
];

// ---------- ELEMENTEN ----------
const $ = (id) => document.getElementById(id);
const screens = { start: $("screen-start"), game: $("screen-game"), end: $("screen-end") };
const video = $("camera");

// ---------- STATUS ----------
let model = null;
let stream = null;
let rounds = [];
let roundIndex = 0;
let score = 0;
let results = [];
let phase = "idle";        // idle | countdown | waitEmpty | drawing | result
let deadline = 0;
let recent = [];          // laatste voorspellingen voor het doel (voor een gemiddelde)
let lastPredict = 0;
let predicting = false;
let rafId = null;

// ---------- SCHERMEN ----------
function show(name) {
  Object.values(screens).forEach((s) => s.classList.remove("active"));
  screens[name].classList.add("active");
}

function overlay(html, type = "") {
  const el = $("overlay");
  el.className = "overlay " + type;
  el.innerHTML = html;
}
function hideOverlay() { $("overlay").className = "overlay hidden"; }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- MODEL ----------
async function loadModel() {
  const badge = $("mode-badge");
  if (!CONFIG.MODEL_URL) {
    badge.textContent = "🧪 Testmodus: nog geen model";
    badge.className = "badge test";
    return;
  }
  try {
    const base = CONFIG.MODEL_URL.endsWith("/") ? CONFIG.MODEL_URL : CONFIG.MODEL_URL + "/";
    model = await tmImage.load(base + "model.json", base + "metadata.json");
    // Klasnamen hoofdletterongevoelig vergelijken ("Zon" = "zon")
    const labels = model.getClassLabels().map(norm);
    console.log("Model geladen met klassen:", labels);

    // Waarschuw als labels niet overeenkomen
    const missing = DRAWINGS.map((d) => d.label).filter((l) => !labels.includes(norm(l)));
    if (CONFIG.REQUIRE_EMPTY_FIRST && !labels.includes(norm(CONFIG.EMPTY_LABEL))) missing.push(CONFIG.EMPTY_LABEL);
    if (missing.length) {
      badge.textContent = "⚠️ Model mist klassen: " + missing.join(", ");
      badge.className = "badge test";
    } else {
      badge.textContent = "🤖 Model geladen (" + labels.length + " klassen)";
      badge.className = "badge model";
    }
  } catch (err) {
    console.error(err);
    model = null;
    // Toon de reden, zodat je weet wat er misliep
    const reason = location.protocol === "file:"
      ? "open de pagina via http://localhost:8000, niet door te dubbelklikken"
      : (typeof tmImage === "undefined" ? "TensorFlow-bibliotheek niet geladen (internet?)" : err.message);
    badge.textContent = "⚠️ Model laden mislukt: " + reason;
    badge.className = "badge test";
  }
}

const norm = (label) => label.trim().toLowerCase();

// Knipt precies het stuk van de camera uit dat binnen het gestippelde kader zichtbaar is.
// De video wordt met "object-fit: cover" getoond, dus we rekenen schermcoördinaten om naar videopixels.
const cropCanvas = document.createElement("canvas");
cropCanvas.width = cropCanvas.height = 224;
const cropCtx = cropCanvas.getContext("2d");
const scanFrame = document.querySelector(".scan-frame");

function cropToFrame() {
  const vw = video.videoWidth, vh = video.videoHeight;
  if (!vw || !vh) return null;
  const vr = video.getBoundingClientRect();
  const fr = scanFrame.getBoundingClientRect();
  const scale = Math.max(vr.width / vw, vr.height / vh); // zoals object-fit: cover
  const offsetX = (vr.width - vw * scale) / 2;
  const offsetY = (vr.height - vh * scale) / 2;
  const sx = (fr.left - vr.left - offsetX) / scale;
  const sy = (fr.top - vr.top - offsetY) / scale;
  const sw = fr.width / scale;
  const sh = fr.height / scale;
  cropCtx.drawImage(video, sx, sy, sw, sh, 0, 0, cropCanvas.width, cropCanvas.height);
  return cropCanvas;
}

// Geeft { label: zekerheid } terug (enkel voor wat in het kader staat)
async function predict() {
  const input = cropToFrame();
  if (!input) return {};
  const preds = await model.predict(input);
  const out = {};
  preds.forEach((p) => (out[norm(p.className)] = p.probability));
  return out;
}

// ---------- CAMERA ----------
async function startCamera() {
  if (stream) return;
  stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 640 }, height: { ideal: 640 } },
    audio: false,
  });
  video.srcObject = stream;
  // iOS Safari: wacht tot de video klaar is, maar blijf niet eeuwig hangen
  await new Promise((resolve) => {
    if (video.readyState >= 2) return resolve();
    video.onloadeddata = () => resolve();
    setTimeout(resolve, 3000);
  });
  try { await video.play(); } catch (err) { console.warn("video.play():", err); }
}

// ---------- GELUID ----------
// Geluiden worden met de Web Audio API zelf gegenereerd: geen geluidsbestanden nodig.
let audioCtx = null;

// iOS laat pas geluid toe na een tik van de gebruiker: roep dit aan bij "Start spel".
function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch (_) { audioCtx = null; }
}

// Speelt een reeks tonen: [frequentie (Hz), start (s), duur (s)]
function playTones(notes, type = "sine", volume = 0.25) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  notes.forEach(([freq, start, dur]) => {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + start);
    gain.gain.exponentialRampToValueAtTime(volume, now + start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(now + start);
    osc.stop(now + start + dur + 0.05);
  });
}

const sound = {
  // Start met tekenen: twee korte stijgende piepjes
  start: () => playTones([[660, 0, 0.12], [990, 0.15, 0.2]], "triangle"),
  // Juist: vrolijk stijgend akkoordje
  success: () => playTones([[523, 0, 0.15], [659, 0.12, 0.15], [784, 0.24, 0.15], [1047, 0.36, 0.35]], "triangle"),
  // Fout / tijd op: twee dalende lage tonen
  fail: () => playTones([[330, 0, 0.25], [220, 0.25, 0.45]], "sawtooth", 0.15),
};

// ---------- SPEL ----------
// Elke tekening komt precies één keer voor, in willekeurige volgorde,
// zodat je een tekening niet opnieuw kunt gebruiken.
function makeRounds() {
  const list = [...DRAWINGS];
  for (let i = list.length - 1; i > 0; i--) {   // Fisher-Yates shuffle
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, Math.min(CONFIG.ROUNDS, list.length));
}

async function startGame() {
  unlockAudio();
  // Eerst het spelscherm tonen: iOS speelt geen video af in een verborgen element
  show("game");
  $("status").textContent = "Camera starten…";
  try {
    await startCamera();
  } catch (err) {
    console.error(err);
    alert("Camera niet beschikbaar. Geef toestemming en open de pagina via HTTPS.");
    show("start");
    return;
  }
  rounds = makeRounds();
  roundIndex = 0;
  score = 0;
  results = [];
  $("test-controls").classList.toggle("hidden", !!model);
  startRound();
}

async function startRound() {
  const d = rounds[roundIndex];
  $("hud-round").textContent = `Ronde ${roundIndex + 1}/${rounds.length}`;
  $("hud-score").textContent = `${score} pt`;
  $("confidence").textContent = "";
  setTimer(CONFIG.ROUND_TIME);
  recent = [];

  if (model && CONFIG.REQUIRE_EMPTY_FIRST) {
    phase = "waitEmpty";
    // Opdracht pas tonen na het lege blad: zo kan niemand vooraf tekenen (anti-foppen)
    showPrompt("📄", "Toon een leeg blad");
    $("status").textContent = "De opdracht verschijnt zodra het lege blad herkend is";
    hideOverlay();
    loop();
    return;
  }

  // Zonder model: korte countdown
  phase = "countdown";
  showPrompt(d.emoji, d.text);
  for (const n of [3, 2, 1]) {
    overlay(`${n}<small>${d.emoji} ${d.text}</small>`);
    await sleep(700);
  }
  hideOverlay();
  startDrawing();
}

function showPrompt(emoji, text) {
  $("prompt-emoji").textContent = emoji;
  $("prompt-text").textContent = text;
}

function startDrawing() {
  const d = rounds[roundIndex];
  showPrompt(d.emoji, d.text);
  sound.start();
  phase = "drawing";
  recent = [];
  deadline = performance.now() + CONFIG.ROUND_TIME * 1000;
  $("status").textContent = model ? "Teken en houd je tekening in het kader" : "Testmodus: druk op 'Gelukt' als je klaar bent";
  loop();
}

function setTimer(secondsLeft) {
  const pct = Math.max(0, secondsLeft / CONFIG.ROUND_TIME) * 100;
  const bar = $("timer-bar");
  bar.style.width = pct + "%";
  bar.classList.toggle("low", secondsLeft <= 5);
  $("timer-text").textContent = Math.ceil(Math.max(0, secondsLeft)) + " s";
}

function loop() {
  cancelAnimationFrame(rafId);
  const tick = async (now) => {
    if (phase !== "waitEmpty" && phase !== "drawing") return;

    if (phase === "drawing") {
      const left = (deadline - now) / 1000;
      setTimer(left);
      if (left <= 0) return endRound(false);
    }

    if (model && !predicting && now - lastPredict > CONFIG.PREDICT_EVERY_MS) {
      lastPredict = now;
      predicting = true;
      try {
        await handlePrediction(await predict());
      } catch (err) {
        console.error(err);
      }
      predicting = false;
    }

    if (phase === "waitEmpty" || phase === "drawing") rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);
}

async function handlePrediction(probs) {
  const target = norm(phase === "waitEmpty" ? CONFIG.EMPTY_LABEL : rounds[roundIndex].label);
  const p = probs[target] ?? 0;
  $("confidence").textContent = `${target}: ${Math.round(p * 100)}%`;

  // Gemiddelde over ongeveer de laatste seconde: één wiebelend beeld onder de drempel
  // reset de teller niet meteen meer.
  const needed = Math.max(1, Math.round(CONFIG.HOLD_MS / CONFIG.PREDICT_EVERY_MS));
  recent.push(p);
  if (recent.length > needed) recent.shift();
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

  if (recent.length >= needed && avg >= CONFIG.THRESHOLD) {
    recent = [];
    if (phase === "waitEmpty") startDrawing();
    else if (phase === "drawing") endRound(true);
  }
}

async function endRound(success) {
  if (phase !== "drawing") return;
  phase = "result";
  cancelAnimationFrame(rafId);

  const d = rounds[roundIndex];
  const secondsLeft = Math.max(0, (deadline - performance.now()) / 1000);
  let points = 0;
  if (success) points = 100 + Math.round(secondsLeft * 10); // sneller = meer punten
  score += points;
  results.push({ drawing: d, success, points });

  if (success) sound.success();
  else sound.fail();

  if (success) overlay(`✅ +${points}<small>${d.emoji} herkend!</small>`, "ok");
  else overlay(`⏰ Tijd op<small>${d.emoji} niet herkend</small>`, "bad");

  $("hud-score").textContent = `${score} pt`;
  await sleep(1600);

  roundIndex++;
  if (roundIndex < rounds.length) startRound();
  else endGame();
}

async function endGame() {
  hideOverlay();
  phase = "idle";
  $("end-score").textContent = `${score} punten`;
  $("end-results").innerHTML = results
    .map((r) => `<li><span>${r.drawing.emoji} ${r.drawing.label}</span><span>${r.success ? "+" + r.points : "❌"}</span></li>`)
    .join("");
  show("end");
  await saveScore(getName(), score);
  showHighscore();
  showLeaderboard();
}

// ---------- SCORES ----------
function getName() {
  return $("player-name").value.trim() || "Anoniem";
}

// ---------- BACKEND (Supabase) ----------
// We bewaren enkel naam + score + datum, NOOIT camerabeelden.
let db = null;
function getDb() {
  if (db) return db;
  if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY || typeof supabase === "undefined") return null;
  db = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
  return db;
}

async function saveScore(name, points) {
  // Lokale highscore (per toestel)
  try {
    const best = Number(localStorage.getItem("dq-highscore") || 0);
    if (points > best) localStorage.setItem("dq-highscore", String(points));
  } catch (_) { /* localStorage niet beschikbaar */ }

  // Online opslaan
  const client = getDb();
  if (!client) return;
  const { error } = await client.from("scores").insert({ name: name.slice(0, 20), score: points });
  if (error) console.error("Score opslaan mislukt:", error);
}

async function showLeaderboard() {
  const list = $("leaderboard");
  list.innerHTML = "";
  const client = getDb();
  if (!client) {
    list.innerHTML = '<li class="small">Nog geen backend gekoppeld</li>';
    return;
  }
  const { data, error } = await client
    .from("scores")
    .select("name, score, created_at")
    .order("score", { ascending: false })
    .limit(10);
  if (error) {
    console.error(error);
    const li = document.createElement("li");
    li.className = "small";
    li.textContent = "Scorebord laden mislukt: " + (error.message || error.code || "onbekende fout");
    list.innerHTML = "";
    list.append(li);
    return;
  }
  if (!data.length) {
    list.innerHTML = '<li class="small">Nog geen scores, jij bent de eerste!</li>';
    return;
  }
  data.forEach((row) => {
    const li = document.createElement("li");
    const n = document.createElement("span");
    const sc = document.createElement("span");
    n.textContent = row.name;          // textContent: geen HTML-injectie via namen
    sc.textContent = row.score;
    li.append(n, sc);
    list.append(li);
  });
}

function showHighscore() {
  try {
    const best = localStorage.getItem("dq-highscore");
    $("highscore").textContent = best ? `🏆 Jouw beste score: ${best}` : "";
  } catch (_) { /* negeren */ }
}

// ---------- KNOPPEN ----------
$("btn-start").addEventListener("click", startGame);
$("btn-again").addEventListener("click", () => {
  show("start");
});
$("btn-success").addEventListener("click", () => endRound(true));
$("btn-skip").addEventListener("click", () => endRound(false));

// ---------- INIT ----------
try {
  $("player-name").value = localStorage.getItem("dq-name") || "";
  $("player-name").addEventListener("input", (e) => localStorage.setItem("dq-name", e.target.value));
} catch (_) { /* negeren */ }
showHighscore();

// Startknop pas activeren als het model klaar is met laden,
// anders start het spel per ongeluk in testmodus.
const startBtn = $("btn-start");
startBtn.disabled = true;
startBtn.textContent = "Model laden…";
loadModel().finally(() => {
  startBtn.disabled = false;
  startBtn.textContent = "Start spel";
});
