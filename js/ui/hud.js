import { $, setText, setStyle, toggle, formatTime, icon } from "./dom.js";
import { POWERUPS, PLAYER } from "../game/defs.js";
import { GESTURE_INFO } from "../ai/gestures.js";

const POWER_TIMERS = [
  ["multi", "S"],
  ["rapid", "F"],
  ["shield", "B"],
  ["heal", "H"],
];

/** In-game HUD (DOM). Updated every frame, but only touches nodes whose value changed. */
export class Hud {
  constructor() {
    this.root = $("hud");
    this.el = {
      score: $("hudScore"),
      high: $("hudHigh"),
      level: $("hudLevel"),
      time: $("hudTime"),
      combo: $("hudCombo"),
      bossBar: $("bossBar"),
      bossName: $("bossName"),
      bossFill: $("bossFill"),
      hp: $("hudHp"),
      weapon: $("hudWeapon").querySelector("b"),
      shield: $("hudShield"),
      shieldText: $("hudShield").querySelector("b"),
      bombs: $("hudBombs").querySelector("b"),
      powers: $("hudPowers"),
      hand: $("hudHand"),
      gesture: $("hudGesture"),
      cam: $("hudCam"),
      handLost: $("handLost"),
      guide: $("gestureGuide"),
      mute: $("hudMute"),
    };
    this.hpKey = "";
    this.powerRows = {};
    for (const [prop, key] of POWER_TIMERS) {
      const d = POWERUPS[key];
      const row = document.createElement("div");
      row.className = "power-timer hidden";
      row.style.setProperty("--c", d.color);
      row.innerHTML = `<span>${d.name}</span><div class="bar"><i></i></div>`;
      this.el.powers.appendChild(row);
      this.powerRows[prop] = { row, fill: row.querySelector("i"), max: 0 };
    }
  }

  show(on) {
    toggle(this.root, "hidden", !on);
  }

  setMuted(muted) {
    this.el.mute.innerHTML = icon(muted ? "mute" : "sound");
    this.el.mute.classList.toggle("off", muted);
  }

  setGuide(on) {
    toggle(this.el.guide, "hidden", !on);
  }

  update(game, high, ai) {
    const el = this.el;
    const p = game.player;
    setText(el.score, game.score.toLocaleString());
    setText(el.high, Math.max(high, game.score).toLocaleString());
    setText(el.level, game.level);
    setText(el.time, formatTime(game.time));

    const comboOn = game.combo >= 3;
    toggle(el.combo, "hidden", !comboOn);
    if (comboOn) {
      setText(el.combo.firstElementChild, `x${game.combo}`);
      setText(el.combo.lastElementChild, `SCORE x${game.comboMul}`);
    }

    const hpKey = `${p.hp}/${p.maxHp}`;
    if (hpKey !== this.hpKey) {
      this.hpKey = hpKey;
      let html = "";
      for (let i = 0; i < p.maxHp; i++) html += icon("heart", i < p.hp ? "" : "empty");
      el.hp.innerHTML = html;
      el.hp.setAttribute("aria-label", `HP ${p.hp} of ${p.maxHp}`);
    }
    setText(el.weapon, game.weapon.name);
    setStyle(el.weapon, "color", game.weapon.color);

    const shieldState = p.shield > 0 ? "active" : p.shieldCd > 0 ? "cd" : "ready";
    toggle(el.shield, "active", shieldState === "active");
    toggle(el.shield, "ready", shieldState === "ready");
    setText(el.shieldText, shieldState === "active" ? `${p.shield.toFixed(1)}s` : shieldState === "cd" ? `${Math.ceil(p.shieldCd)}s` : "READY");
    setText(el.bombs, `x${p.bombs}/${PLAYER.maxBombs}`);

    for (const [prop] of POWER_TIMERS) {
      const r = this.powerRows[prop];
      const v = prop === "shield" ? (p.shield > 0 ? p.shield : 0) : p[prop];
      toggle(r.row, "hidden", v <= 0);
      if (v > 0) {
        if (v > r.max) r.max = v;
        setStyle(r.fill, "width", `${((v / r.max) * 100).toFixed(0)}%`);
      } else {
        r.max = 0;
      }
    }

    const boss = game.boss;
    toggle(el.bossBar, "hidden", !boss);
    if (boss) {
      setText(el.bossName, boss.name);
      const pct = Math.max(0, (boss.hp / boss.maxHp) * 100);
      setStyle(el.bossFill, "width", `${pct.toFixed(1)}%`);
      el.bossBar.setAttribute("aria-valuenow", pct.toFixed(0));
      toggle(el.bossBar, "hit", boss.flash > 0);
    }

    this.updateAi(ai, game.state === "running");
  }

  updateAi(ai, running) {
    const el = this.el;
    const setStatus = (node, cls, text) => {
      toggle(node, "ok", cls === "ok");
      toggle(node, "warn", cls === "warn");
      toggle(node, "bad", cls === "bad");
      setText(node.querySelector("b"), text);
    };
    const camOn = ai.cameraState === "on";
    const camCls = { on: "ok", off: "", starting: "warn", lost: "warn" }[ai.cameraState] ?? "bad";
    setStatus(el.cam, camCls, ai.cameraLabel);
    setStatus(el.hand, !camOn ? "" : ai.handPresent ? "ok" : "warn", !camOn ? "KEYBOARD" : ai.handPresent ? "DETECTED" : "NOT DETECTED");
    const info = GESTURE_INFO[ai.gesture] ?? GESTURE_INFO.NONE;
    setStatus(el.gesture, ai.handPresent && ai.gesture !== "NONE" ? "ok" : "", ai.handPresent ? (ai.triggerDown ? "FIRE" : info.label) : "-");
    toggle(el.handLost, "hidden", !(running && camOn && ai.ready && !ai.handPresent));
  }
}
