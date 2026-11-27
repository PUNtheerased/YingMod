import { HandTracker } from "./handTracker.js";
import { FingerGunInput } from "./input.js";
import { Game } from "./game.js";
import { Renderer } from "./render.js";
import { Sfx } from "./audio.js";
import { Tutorial } from "./tutorial.js";

const $ = (id) => document.getElementById(id);
const SEEN_HOWTO_KEY = "ss_seen_howto";

const canvas = $("game");
const video = $("webcam");
const previewCtx = $("preview").getContext("2d");
const liveCtx = $("livePreview").getContext("2d");

const sfx = new Sfx();
const tracker = new HandTracker(video);
const input = new FingerGunInput(canvas);
const game = new Game(sfx);
const renderer = new Renderer(canvas);
const tutorial = new Tutorial(input, sfx);

const overlays = ["menu", "howto", "pause", "gameover"];
let overlay = "menu";
let howtoFrom = "menu";
let hintTimer = 0;

function show(name) {
  overlay = name;
  document.activeElement?.blur();
  for (const id of overlays) $(id).classList.toggle("hidden", id !== name);
  tutorial.active = name === "howto";
  const inGame = name === null || name === "pause";
  $("topbar").classList.toggle("hidden", !inGame);
  if (name === "menu") $("menuHigh").textContent = game.high;
  if (name === "howto") {
    $("howtoStart").textContent = howtoFrom === "pause" ? "▶ เล่นต่อ" : "▶ เริ่มเกม";
    $("btnCamera").classList.toggle("hidden", tracker.cameraOn);
  }
}

function setStatus(text, error = false) {
  const el = $("status");
  el.textContent = text;
  el.classList.toggle("error", error);
}

function resize() {
  renderer.resize();
  game.resize(renderer.W, renderer.H);
}
window.addEventListener("resize", resize);
resize();

setStatus("⏳ กำลังโหลดโมเดล Hand Landmarker จาก Google...");
tracker
  .init()
  .then(() =>
    setStatus(`✅ โมเดลพร้อมแล้ว (${tracker.delegate} · ${tracker.mode}) — กดเริ่มเกมแล้วอนุญาตให้ใช้กล้อง`)
  )
  .catch((err) => {
    console.error(err);
    setStatus("⚠️ โหลดโมเดลไม่สำเร็จ (ตรวจสอบอินเทอร์เน็ต) — ยังเล่นด้วยคีย์บอร์ด/เมาส์ได้", true);
  });

async function ensureCamera() {
  if (tracker.cameraOn) return true;
  try {
    await tracker.startCamera();
    $("btnCamera").classList.add("hidden");
    return true;
  } catch (err) {
    console.error(err);
    const msg =
      err.name === "NotAllowedError"
        ? "⚠️ ไม่ได้รับอนุญาตให้ใช้กล้อง — เล่นด้วยคีย์บอร์ด/เมาส์ได้"
        : `⚠️ เปิดกล้องไม่ได้: ${err.message}`;
    setStatus(msg, true);
    $("calibMsg").textContent = msg;
    return false;
  }
}

function showHint() {
  const hint = $("hint");
  hint.classList.remove("hidden", "fade");
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    hint.classList.add("fade");
    hintTimer = setTimeout(() => hint.classList.add("hidden"), 900);
  }, 6000);
}

function startGame() {
  sfx.unlock();
  ensureCamera();
  localStorage.setItem(SEEN_HOWTO_KEY, "1");
  input.clearShots();
  game.start();
  show(null);
  showHint();
}

function pauseGame() {
  if (game.state !== "playing") return;
  game.pause();
  show("pause");
}

function resumeGame() {
  input.clearShots();
  game.resume();
  show(null);
}

function openHowto(from) {
  howtoFrom = from;
  show("howto");
}

function toMenu() {
  game.state = "idle";
  show("menu");
}

// Menu
$("menuStart").addEventListener("click", () => {
  sfx.unlock();
  if (!localStorage.getItem(SEEN_HOWTO_KEY)) {
    ensureCamera();
    openHowto("menu");
  } else startGame();
});
$("menuHowto").addEventListener("click", () => {
  sfx.unlock();
  openHowto("menu");
});

// How to play
$("btnCamera").addEventListener("click", () => {
  sfx.unlock();
  ensureCamera();
});
$("howtoStart").addEventListener("click", () => (howtoFrom === "pause" ? resumeGame() : startGame()));
$("howtoBack").addEventListener("click", () => show(howtoFrom));

// Pause / in-game buttons
$("btnPause").addEventListener("click", pauseGame);
$("btnHelp").addEventListener("click", () => {
  pauseGame();
  openHowto("pause");
});
$("pauseResume").addEventListener("click", resumeGame);
$("pauseHowto").addEventListener("click", () => openHowto("pause"));
$("pauseMenu").addEventListener("click", toMenu);

const muteBtn = $("btnMute");
const syncMute = () => (muteBtn.textContent = sfx.muted ? "🔇" : "🔊");
syncMute();
muteBtn.addEventListener("click", () => {
  sfx.toggleMute();
  syncMute();
});

// Game over
game.onGameOver = ({ score, high, isNew }) => {
  setTimeout(() => {
    $("goScore").textContent = score;
    $("goHigh").textContent = high;
    $("goNew").classList.toggle("hidden", !isNew);
    show("gameover");
  }, 900);
};
$("goRetry").addEventListener("click", startGame);
$("goMenu").addEventListener("click", toMenu);

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP" || e.code === "Escape") {
    if (game.state === "playing") pauseGame();
    else if (game.state === "paused" && overlay === "pause") resumeGame();
  } else if (e.code === "KeyM") {
    sfx.toggleMute();
    syncMute();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const result = tracker.pump(now);
  if (result) input.onHand(result.landmarks, result.world, now, tracker.aspect);
  input.tick(now, dt);

  game.update(dt, input);
  renderer.draw(game, input, tracker, dt);

  if (tracker.cameraOn) {
    if (overlay === null || overlay === "pause") renderer.drawPreview(previewCtx, video, tracker.landmarks, input);
    if (overlay === "howto") renderer.drawPreview(liveCtx, video, tracker.landmarks, input);
  }
  if (overlay === "howto") tutorial.update();

  requestAnimationFrame(frame);
}

show("menu");
requestAnimationFrame(frame);
