import { Settings } from "./core/settings.js";
import { Records } from "./core/storage.js";
import { AudioManager } from "./audio/audio.js";
import { Renderer, drawShipPreview } from "./render/renderer.js";
import { GameEngine } from "./game/engine.js";
import { SHIPS, COLORS } from "./game/defs.js";
import { HandTracker } from "./ai/handTracker.js";
import { GestureRecognizer, GESTURE_INFO } from "./ai/gestures.js";
import { Controls } from "./ai/controls.js";
import { ScreenManager, ShipSelect, renderLeaderboard, renderEnd } from "./ui/screens.js";
import { Hud } from "./ui/hud.js";
import { SettingsView } from "./ui/settingsView.js";
import { GestureLab, gestureLabel } from "./ui/lab.js";
import { $, setText, toggle, icon } from "./ui/dom.js";

const RESUME_GUARD_MS = 1200;
const PAUSE_GUARD_MS = 1000;
const CAMERA_SCREENS = new Set(["howto"]);

const CAMERA_TEXT = {
  off: { label: "OFF", msg: "กล้องปิดอยู่ กดปุ่มเปิดกล้องเพื่อควบคุมด้วยมือ หรือเล่นด้วยคีย์บอร์ด/เมาส์" },
  starting: { label: "STARTING", msg: "กำลังเปิดกล้อง... ถ้าเบราว์เซอร์ถาม ให้กด \"อนุญาต\"" },
  on: { label: "ON", msg: "กล้องพร้อม ยกมือขึ้นแล้วทำท่าปืน" },
  lost: { label: "RECONNECTING", msg: "กล้องหลุด กำลังเชื่อมต่อใหม่ (ปิดโปรแกรม/แท็บอื่นที่ใช้กล้องอยู่)" },
  denied: { label: "DENIED", msg: "ไม่ได้รับอนุญาตให้ใช้กล้อง กดไอคอนกล้อง/แม่กุญแจที่แถบที่อยู่ แล้วเลือก \"อนุญาต\" จากนั้นกดเปิดกล้องอีกครั้ง" },
  error: { label: "ERROR", msg: "เปิดกล้องไม่ได้" },
};
const CAMERA_ERRORS = {
  insecure: "ต้องเปิดเว็บผ่าน https หรือ localhost เท่านั้นจึงจะใช้กล้องได้",
  busy: "กล้องถูกใช้งานโดยโปรแกรมอื่น (Zoom, Meet, OBS หรือแท็บอื่น) ปิดแล้วลองใหม่",
  notfound: "ไม่พบกล้องในเครื่องนี้ เล่นด้วยคีย์บอร์ด/เมาส์ได้",
};

class App {
  constructor() {
    this.settings = new Settings();
    this.records = new Records();
    this.audio = new AudioManager();
    this.renderer = new Renderer($("game"));
    this.engine = new GameEngine();
    this.tracker = new HandTracker($("webcam"));
    this.rec = new GestureRecognizer();
    this.controls = new Controls($("game"));
    this.screens = new ScreenManager();
    this.hud = new Hud();
    this.lab = new GestureLab(this.rec, this.audio);
    this.ships = new ShipSelect((id) => this.audio.play("hover"));
    this.input = { target: null, axis: 0, fireHeld: false };
    this.ai = { cameraState: "off", cameraLabel: "OFF", handPresent: false, gesture: "NONE", triggerDown: false, ready: false };
    this.menuCameraPinned = false;
    this.pausedAt = 0;
    this.resumedAt = 0;
    this.last = performance.now();
    this.t = 0;
    this.fireworkT = 0;
    this.lastEntry = null;
    this.ac = new AbortController();

    new SettingsView($("settings"), this.settings);
    this.bindEngine();
    this.bindUi();
    this.bindTracker();
    this.settings.on("change", ({ path }) => this.applySettings(path));
    this.applySettings("*");
    this.onResize();
    this.screens.onChange = (name, prev) => this.onScreen(name, prev);
    this.screens.show("menu");
    this.refreshMenu();
    this.audio.playMusic("menu");
    this.tracker.init(this.settings.get("ai.trackingSensitivity"));
    requestAnimationFrame((t) => this.frame(t));
  }

  // ------------------------------------------------------------ wiring

  bindEngine() {
    const e = this.engine;
    e.on("sfx", (name) => this.audio.play(name));
    e.on("music", (track) => this.audio.playMusic(track));
    e.on("toast", ({ text, color }) => this.renderer.toast(text, color));
    e.on("level", (n) => this.records.noteLevel(n));
    e.on("end", (stats) => this.onEnd(stats));
  }

  bindUi() {
    const o = { signal: this.ac.signal };
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest("button");
      if (!btn) return;
      this.audio.unlock();
      this.audio.play(btn.dataset.action === "back" ? "back" : "ui");
      const action = btn.dataset.action;
      if (action) this.doAction(action);
    }, o);
    document.addEventListener("mouseover", (ev) => {
      const btn = ev.target.closest(".btn, .ship-card, .icon-btn");
      if (btn && !btn.contains(ev.relatedTarget)) this.audio.play("hover");
    }, o);
    const unlock = () => this.audio.unlock();
    window.addEventListener("pointerdown", unlock, o);
    window.addEventListener("keydown", unlock, o);
    window.addEventListener("resize", () => this.onResize(), o);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.pauseGame();
    }, o);

    $("hudPause").addEventListener("click", () => this.pauseGame(), o);
    $("hudMute").addEventListener("click", () => this.toggleMute(), o);
    $("shipConfirm").addEventListener("click", () => {
      this.records.setShip(this.ships.selected);
      this.refreshMenu();
      this.screens.back();
    }, o);
    for (const id of ["menuCamera", "labCamera", "camToggle"]) {
      $(id).addEventListener("click", () => this.toggleCamera(id === "menuCamera"), o);
    }
    $("camLandmarks").addEventListener("click", () => this.settings.set("ai.showLandmarks", !this.settings.get("ai.showLandmarks")), o);
    $("settingsReset").addEventListener("click", () => this.settings.reset(), o);
    $("boardClear").addEventListener("click", () => {
      if (confirm("ล้างตารางคะแนนทั้งหมด?")) {
        this.records.clearBoard();
        renderLeaderboard(this.records);
      }
    }, o);
    $("btnFullscreen").addEventListener("click", () => {
      if (document.fullscreenElement) document.exitFullscreen?.();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    }, o);
    $("endName").addEventListener("change", (ev) => {
      this.records.setPlayerName(ev.target.value.trim() || "PLAYER");
      this.records.rename(this.lastEntry, this.records.playerName);
    }, o);
  }

  bindTracker() {
    this.tracker.on("status", () => this.onTrackerStatus());
  }

  doAction(action) {
    switch (action) {
      case "start":
      case "restart":
        this.startGame();
        break;
      case "ships":
        this.ships.open(this.records.shipId ?? "falcon");
        this.screens.show("ships", { push: true });
        break;
      case "howto":
        this.screens.show("howto", { push: true });
        break;
      case "settings":
        this.screens.show("settings", { push: true });
        break;
      case "leaderboard":
        renderLeaderboard(this.records);
        this.screens.show("leaderboard", { push: true });
        break;
      case "back":
        this.screens.back();
        break;
      case "resume":
        this.resumeGame();
        break;
      case "menu":
        this.toMenu();
        break;
    }
  }

  // ------------------------------------------------------------ settings

  applySettings(path) {
    const s = this.settings;
    const all = path === "*";
    if (all || path.startsWith("audio.")) {
      this.audio.setVolumes(s.data.audio);
      this.hud.setMuted(s.get("audio.muted"));
    }
    if (all || path.startsWith("gameplay.") || path.startsWith("display.")) {
      this.engine.configure({ difficulty: s.get("gameplay.difficulty"), autoFire: s.get("gameplay.autoFire") });
      this.renderer.configure({
        quality: s.get("display.quality"),
        reduceMotion: s.get("display.reduceMotion"),
        screenShake: s.get("gameplay.screenShake"),
        damageFx: s.get("gameplay.damageFx"),
      });
      this.controls.handSensitivity = s.get("gameplay.sensitivity");
      document.body.classList.toggle("reduce-motion", s.get("display.reduceMotion"));
    }
    if (all || path.startsWith("ai.")) {
      const sens = s.get("ai.trackingSensitivity");
      this.rec.configure({ minConf: 0.75 - sens * 0.4, cooldownMul: s.get("ai.gestureCooldown"), mirror: s.get("ai.mirror") });
      if (path === "ai.trackingSensitivity") this.tracker.setSensitivity(sens);
      this.hud.setGuide(s.get("ai.showGuide"));
      toggle($("camLandmarks"), "off", !s.get("ai.showLandmarks"));
      if (path === "ai.cameraEnabled") this.syncCamera(true);
    }
  }

  toggleMute() {
    this.settings.set("audio.muted", !this.settings.get("audio.muted"));
  }

  // ------------------------------------------------------------ camera

  get cameraNeeded() {
    if (!this.settings.get("ai.cameraEnabled")) return false;
    const st = this.engine.state;
    if (st === "running" || st === "paused") return true;
    if (CAMERA_SCREENS.has(this.screens.current)) return true;
    return this.menuCameraPinned && this.screens.current === "menu";
  }

  /** Starts the camera only in response to a user action; stops it whenever it isn't needed. */
  syncCamera(userAction) {
    const need = this.cameraNeeded;
    const st = this.tracker.cameraState;
    if (need && userAction && (st === "off" || st === "denied" || st === "error")) {
      this.tracker.startCamera().catch(() => {});
    } else if (!need && st !== "off") {
      this.tracker.stopCamera();
    }
  }

  toggleCamera(fromMenu) {
    const st = this.tracker.cameraState;
    if (st === "on" || st === "starting" || st === "lost") {
      this.settings.set("ai.cameraEnabled", false);
      this.menuCameraPinned = false;
      this.tracker.stopCamera();
      return;
    }
    if (this.tracker.modelState === "error") this.tracker.init(this.settings.get("ai.trackingSensitivity"));
    if (fromMenu) this.menuCameraPinned = true;
    if (!this.settings.get("ai.cameraEnabled")) this.settings.set("ai.cameraEnabled", true);
    this.syncCamera(true);
  }

  onTrackerStatus() {
    const tr = this.tracker;
    const ct = CAMERA_TEXT[tr.cameraState] ?? CAMERA_TEXT.error;
    const camMsg = tr.cameraState === "error" ? CAMERA_ERRORS[tr.cameraError] ?? `${ct.msg}: ${tr.cameraError}` : ct.msg;
    this.ai.cameraState = tr.cameraState;
    this.ai.cameraLabel = ct.label;
    this.ai.ready = tr.ready;

    const model = { idle: "WAITING", loading: "LOADING", ready: `READY (${tr.delegate || "-"})`, error: "FAILED" }[tr.modelState];
    setText($("aiModel"), model);
    setText($("aiCamera"), ct.label);
    const rows = $("aiStatus").querySelectorAll(".ai-row");
    const cls = (el, c) => ["ok", "warn", "bad"].forEach((k) => el.classList.toggle(k, k === c));
    cls(rows[0], tr.modelState === "ready" ? "ok" : tr.modelState === "error" ? "bad" : "warn");
    cls(rows[1], tr.cameraState === "on" ? "ok" : tr.cameraState === "off" ? "" : tr.cameraState === "starting" || tr.cameraState === "lost" ? "warn" : "bad");
    let msg = camMsg;
    if (tr.modelState === "loading") msg = "กำลังโหลดโมเดล MediaPipe Hand Landmarker... (ครั้งแรกอาจใช้เวลาสักครู่)";
    else if (tr.modelState === "error") msg = "โหลดโมเดล AI ไม่สำเร็จ (ตรวจอินเทอร์เน็ต) ยังเล่นด้วยคีย์บอร์ด/เมาส์ได้ กดปุ่มด้านล่างเพื่อลองใหม่";
    setText($("aiMsg"), msg);

    const on = tr.cameraState === "on" || tr.cameraState === "starting" || tr.cameraState === "lost";
    const btnHtml = (label) => `${icon(on ? "camera-off" : "camera")}${label}`;
    $("menuCamera").innerHTML = btnHtml(tr.modelState === "error" ? "RETRY AI" : on ? "TURN OFF CAMERA" : "TURN ON CAMERA");
    $("labCamera").innerHTML = btnHtml(on ? "TURN OFF CAMERA" : "TURN ON CAMERA");
    $("camToggle").innerHTML = icon(on ? "camera" : "camera-off");
    toggle($("camToggle"), "off", !on);
    $("loading").classList.toggle("hidden", tr.modelState !== "loading" && tr.cameraState !== "starting");

    const cm = $("camMsg");
    let overlay = "";
    if (tr.cameraState !== "on") overlay = tr.cameraState === "off" ? "CAMERA OFF" : camMsg;
    else if (tr.modelState === "loading") overlay = "LOADING AI...";
    else if (tr.modelState === "error") overlay = "AI FAILED";
    setText(cm, overlay);
    toggle(cm, "thai", /[\u0E00-\u0E7F]/.test(overlay));
    if (tr.cameraState !== "on") this.rec.reset();
  }

  // ------------------------------------------------------------ game flow

  startGame() {
    this.audio.unlock();
    this.menuCameraPinned = false;
    this.engine.configure({ difficulty: this.settings.get("gameplay.difficulty") });
    this.engine.start(this.records.shipId ?? "falcon");
    this.engine.resize(this.renderer.W, this.renderer.H);
    this.controls.clearHeld();
    this.renderer.toasts = [];
    this.resumedAt = performance.now();
    this.screens.hideAll();
    this.syncCamera(true);
  }

  pauseGame() {
    if (!this.engine.pause()) return;
    this.pausedAt = performance.now();
    this.controls.clearHeld();
    this.audio.play("ui");
    this.screens.show("pause");
  }

  resumeGame() {
    if (!this.engine.resume()) return;
    this.resumedAt = performance.now();
    this.controls.clearHeld();
    this.screens.hideAll();
  }

  toMenu() {
    this.engine.reset();
    this.engine.state = "idle";
    this.screens.show("menu");
    this.audio.playMusic("menu");
    this.refreshMenu();
  }

  onEnd(stats) {
    const entry = {
      name: this.records.playerName,
      score: stats.score,
      level: stats.level,
      ship: stats.ship,
      difficulty: stats.difficulty,
      date: Date.now(),
    };
    const { isNewHigh, rank } = this.records.submit(entry);
    this.lastEntry = rank >= 0 ? entry : null;
    renderEnd(stats, this.records, isNewHigh);
    $("endName").value = this.records.playerName;
    toggle($("nameEntry"), "hidden", rank < 0);
    this.fireworkT = 0;
    // Short delay so the final explosion is visible before the panel covers it.
    this.endShowAt = performance.now() + (stats.result === "victory" ? 1200 : 900);
  }

  refreshMenu() {
    setText($("menuHigh"), this.records.high.toLocaleString());
    setText($("menuLevel"), this.records.highestLevel);
    const ship = SHIPS[this.records.shipId ?? "falcon"];
    setText($("menuShipName"), ship.name);
    $("menuShipName").style.color = ship.color;
  }

  onScreen(name, prev) {
    const st = this.engine.state;
    const inGame = st === "running" || st === "paused";
    this.hud.show(inGame && (name === null || name === "pause"));
    this.updateCamPanel();
    if (name === "settings" || name === "howto" || name === "pause") this.controls.clearHeld();
    this.syncCamera(false);
  }

  updateCamPanel() {
    const st = this.engine.state;
    const cur = this.screens.current;
    const show = (st === "running" || st === "paused") && (cur === null || cur === "pause");
    toggle($("camPanel"), "hidden", !show);
  }

  // ------------------------------------------------------------ input

  handleGestureEvents(events, now) {
    const engine = this.engine;
    const running = engine.state === "running" && this.screens.current === null;
    for (const ev of events) {
      if (this.screens.current === "howto") this.lab.onEvent(ev);
      if (running) {
        switch (ev) {
          case "shoot":
            engine.queueShot();
            break;
          case "shield":
            engine.activateShield();
            break;
          case "bomb":
            engine.useBomb();
            break;
          case "weapon":
            engine.cycleWeapon();
            break;
          case "pause":
            if (now - this.resumedAt > RESUME_GUARD_MS) this.pauseGame();
            break;
          case "handLost":
          case "handFound":
            break;
          default:
            if (ev.startsWith("cooldown:")) this.renderer.toast(`${ev.slice(9).toUpperCase()} COOLDOWN`, COLORS.text2);
        }
      } else if (engine.state === "paused" && this.screens.current === "pause" && ev === "gunHold") {
        if (now - this.pausedAt > PAUSE_GUARD_MS) this.resumeGame();
      }
    }
  }

  handleKeyActions() {
    const engine = this.engine;
    for (const a of this.controls.drain()) {
      if (a === "mute") {
        this.toggleMute();
        continue;
      }
      if (a === "pause") {
        if (engine.state === "running" && this.screens.current === null) this.pauseGame();
        else if (engine.state === "paused" && this.screens.current === "pause") this.resumeGame();
        else if (this.screens.stack.length) this.screens.back();
        continue;
      }
      if (engine.state !== "running" || this.screens.current !== null) continue;
      if (a === "weapon") engine.cycleWeapon();
      else if (a.startsWith("weapon:")) engine.cycleWeapon(Number(a.slice(7)));
      else if (a === "bomb") engine.useBomb();
      else if (a === "shield") engine.activateShield();
    }
  }

  // ------------------------------------------------------------ loop

  onResize() {
    this.renderer.resize();
    this.engine.resize(this.renderer.W, this.renderer.H);
  }

  frame(now) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.t += dt;

    const result = this.tracker.pump(now);
    this.rec.update(result, now);
    const events = this.rec.tick(now);
    this.controls.setHand(this.rec.handPresent, this.rec.palmX);
    this.handleGestureEvents(events, now);
    this.handleKeyActions();

    const engine = this.engine;
    const input = this.input;
    input.target = this.controls.target(now);
    input.axis = this.controls.axis;
    input.fireHeld = this.controls.fireHeld || (this.rec.handPresent && this.rec.triggerDown);
    engine.update(dt, input);

    if ((engine.state === "over" || engine.state === "victory") && this.endShowAt && now >= this.endShowAt) {
      this.endShowAt = 0;
      this.screens.show("end");
    }
    if (engine.state === "victory") {
      this.fireworkT -= dt;
      if (this.fireworkT <= 0) {
        this.fireworkT = 0.35;
        const cols = [COLORS.cyan, COLORS.pink, COLORS.yellow, COLORS.green, COLORS.purple];
        engine.explode(Math.random() * engine.W, Math.random() * engine.H * 0.6, cols[Math.floor(Math.random() * cols.length)], 26);
      }
    }

    this.renderer.draw(engine, dt);
    this.updateAiState();
    const cur = this.screens.current;
    if (engine.state === "running" || engine.state === "paused") this.hud.update(engine, this.records.high, this.ai);
    if (cur === "pause") {
      const p = this.rec.stable === "FINGER_GUN" && this.rec.handPresent ? this.rec.dwellProgress(now) : 0;
      $("resumeFill").style.width = `${(p * 100).toFixed(0)}%`;
    }
    this.drawPreviews(cur, now);
    if (cur === "menu") drawShipPreview($("menuShip"), this.records.shipId ?? "falcon", this.t, true);
    else if (cur === "ships") this.ships.draw(this.t);
    else if (cur === "howto") this.lab.update(dt);
    this.audio.update();
    requestAnimationFrame((t) => this.frame(t));
  }

  updateAiState() {
    const ai = this.ai;
    ai.handPresent = this.rec.handPresent;
    ai.gesture = this.rec.stable;
    ai.triggerDown = this.rec.triggerDown;
  }

  drawPreviews(cur, now) {
    const tr = this.tracker;
    const camVisible = !$("camPanel").classList.contains("hidden");
    if (!camVisible && cur !== "howto") return;
    const half = 0.36 / this.controls.handSensitivity;
    const info = {
      mirror: this.settings.get("ai.mirror"),
      showLandmarks: this.settings.get("ai.showLandmarks"),
      triggerDown: this.rec.triggerDown,
      dwell: this.rec.dwellProgress(now),
      zone: half < 0.5 ? [0.5 - half, 0.5 + half] : null,
    };
    const lms = this.rec.handPresent ? tr.landmarks : null;
    if (camVisible) {
      this.renderer.drawPreview($("preview").getContext("2d"), tr.video, tr.cameraOn ? lms : null, info);
      setText($("camGesture"), tr.cameraOn ? gestureLabel(this.rec) : "CAMERA OFF");
      setText($("camConf"), tr.cameraOn && this.rec.handPresent && this.rec.stable !== "NONE" ? `${Math.round(this.rec.conf * 100)}%` : "");
      const g = GESTURE_INFO[this.rec.stable];
      $("camGesture").style.color = this.rec.triggerDown ? COLORS.pink : this.rec.handPresent && g && this.rec.stable !== "NONE" ? COLORS.green : COLORS.text2;
    }
    if (cur === "howto") this.renderer.drawPreview($("livePreview").getContext("2d"), tr.video, tr.cameraOn ? lms : null, info);
  }
}

export const app = new App();
window.__app = app;
