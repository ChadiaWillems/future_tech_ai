// =====================================================================
// Doodle Quest – teken wat gevraagd wordt en toon het aan de camera
// =====================================================================

// ---------- INSTELLINGEN ----------
const CONFIG = {
  // Plak hier de link van je Teachable Machine-model (Export > Upload my model),
  // bv. "https://teachablemachine.withgoogle.com/models/AbCdEf123/"
  // of "./model/" als je de bestanden (model.json, metadata.json, weights.bin) in de map /model zet.
  // Leeg laten = testmodus met knoppen.
  MODEL_URL: "",

  ROUNDS: 5,               // aantal rondes per spel
  ROUND_TIME: 20,          // seconden per tekening
  THRESHOLD: 0.9,          // minimale zekerheid (90%)
  HOLD_MS: 1000,           // zo lang moet de voorspelling stabiel blijven
  PREDICT_EVERY_MS: 150,   // hoe vaak het model voorspelt
  REQUIRE_EMPTY_FIRST: true, // ronde start pas als het model eerst een leeg blad ziet (anti-foppen)
  EMPTY_LABEL: "leeg blad",  // moet exact overeenkomen met je klasnaam in Teachable Machine
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
let holdStart = null;
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
    const labels = model.getClassLabels();
    console.log("Model geladen met klassen:", labels);

    // Waarschuw als labels niet overeenkomen
    const missing = DRAWINGS.map((d) => d.label).filter((l) => !labels.includes(l));
    if (CONFIG.REQUIRE_EMPTY_FIRST && !labels.includes(CONFIG.EMPTY_LABEL)) missing.push(CONFIG.EMPTY_LABEL);
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
    badge.textContent = "⚠️ Model laden mislukt, testmodus";
    badge.className = "badge test";
  }
}

// Geeft { label: zekerheid } terug
async function predict() {
  const preds = await model.predict(video);
  const out = {};
  preds.forEach((p) => (out[p.className] = p.probability));
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
  await video.play();
}

// ---------- SPEL ----------
function makeRounds() {
  const list = [];
  for (let i = 0; i < CONFIG.ROUNDS; i++) {
    let pick;
    do {
      pick = DRAWINGS[Math.floor(Math.random() * DRAWINGS.length)];
    } while (list.length && pick === list[list.length - 1] && DRAWINGS.length > 1);
    list.push(pick);
  }
  return list;
}

async function startGame() {
  try {
    await startCamera();
  } catch (err) {
    console.error(err);
    alert("Camera niet beschikbaar. Geef toestemming en open de pagina via HTTPS.");
    return;
  }
  rounds = makeRounds();
  roundIndex = 0;
  score = 0;
  results = [];
  $("test-controls").classList.toggle("hidden", !!model);
  show("game");
  startRound();
}

async function startRound() {
  const d = rounds[roundIndex];
  $("hud-round").textContent = `Ronde ${roundIndex + 1}/${CONFIG.ROUNDS}`;
  $("hud-score").textContent = `${score} pt`;
  $("prompt-emoji").textContent = d.emoji;
  $("prompt-text").textContent = d.text;
  $("confidence").textContent = "";
  setTimer(CONFIG.ROUND_TIME);
  holdStart = null;

  if (model && CONFIG.REQUIRE_EMPTY_FIRST) {
    phase = "waitEmpty";
    $("status").textContent = "📄 Toon eerst een leeg blad om te starten";
    hideOverlay();
    loop();
    return;
  }

  // Zonder model: korte countdown
  phase = "countdown";
  for (const n of [3, 2, 1]) {
    overlay(`${n}<small>${d.emoji} ${d.text}</small>`);
    await sleep(700);
  }
  hideOverlay();
  startDrawing();
}

function startDrawing() {
  phase = "drawing";
  holdStart = null;
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
  const target = phase === "waitEmpty" ? CONFIG.EMPTY_LABEL : rounds[roundIndex].label;
  const p = probs[target] ?? 0;
  $("confidence").textContent = `${target}: ${Math.round(p * 100)}%`;

  if (p >= CONFIG.THRESHOLD) {
    holdStart ??= performance.now();
    if (performance.now() - holdStart >= CONFIG.HOLD_MS) {
      holdStart = null;
      if (phase === "waitEmpty") startDrawing();
      else if (phase === "drawing") endRound(true);
    }
  } else {
    holdStart = null;
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

  if (success) overlay(`✅ +${points}<small>${d.emoji} herkend!</small>`, "ok");
  else overlay(`⏰ Tijd op<small>${d.emoji} niet herkend</small>`, "bad");

  $("hud-score").textContent = `${score} pt`;
  await sleep(1600);

  roundIndex++;
  if (roundIndex < CONFIG.ROUNDS) startRound();
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
}

// ---------- SCORES ----------
function getName() {
  return $("player-name").value.trim() || "Anoniem";
}

// TODO: vervang door je eigen backend (Firebase / Supabase).
// Bewaar enkel naam + score + datum, NOOIT camerabeelden.
async function saveScore(name, points) {
  const entry = { name, score: points, date: new Date().toISOString() };
  console.log("Score om op te slaan:", entry);
  try {
    const best = Number(localStorage.getItem("dq-highscore") || 0);
    if (points > best) localStorage.setItem("dq-highscore", String(points));
  } catch (_) { /* localStorage niet beschikbaar */ }
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
loadModel();
