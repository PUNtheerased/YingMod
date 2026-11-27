import { $, setText, setStyle, toggle } from "./dom.js";
import { G, GESTURE_INFO } from "../ai/gestures.js";

const METER_MAX = 1.2;
const pct = (v) => `${Math.max(0, Math.min(1, v / METER_MAX)) * 100}%`;
const EVENT_LABEL = {
  shoot: "FIRE — ยิง",
  shield: "FIST — เปิดโล่",
  weapon: "V SIGN — เปลี่ยนอาวุธ",
  bomb: "OK — ระเบิด",
  pause: "OPEN PALM — หยุดเกม",
  gunHold: "GUN ค้าง 1 วิ — เล่นต่อ",
};
const EVENT_LAMP = { shoot: "FIRE", shield: "FIST", weapon: "V_SIGN", bomb: "OK_PINCH", pause: "OPEN_PALM" };

/** Live gesture tester on the How to Play screen: lamps per gesture + confidence + event log. */
export class GestureLab {
  constructor(recognizer, audio) {
    this.rec = recognizer;
    this.audio = audio;
    this.lamps = {};
    for (const li of $("labLamps").querySelectorAll("li")) this.lamps[li.dataset.g] = { li, val: li.querySelector("b"), flash: 0 };
    this.counts = {};
    this.el = {
      meterDown: $("meterDown"),
      meterUp: $("meterUp"),
      meterVal: $("meterVal"),
      log: $("labLog"),
      calibMsg: $("calibMsg"),
      btnCalibrate: $("btnCalibrate"),
    };
    this.el.btnCalibrate.addEventListener("click", () => this.calibrate());
    $("btnAutoCalib").addEventListener("click", () => {
      this.rec.resetCalibration();
      this.el.calibMsg.textContent = "กลับเป็นโหมดอัตโนมัติแล้ว ทำท่าปืนตั้งนิ้วโป้งขึ้นสักครู่ให้เกมจำระยะ";
    });
  }

  onEvent(name) {
    const label = EVENT_LABEL[name];
    if (!label) return;
    this.counts[name] = (this.counts[name] || 0) + 1;
    this.el.log.textContent = `ล่าสุด: ${label} (ครั้งที่ ${this.counts[name]})`;
    const lamp = this.lamps[EVENT_LAMP[name]];
    if (lamp) lamp.flash = 0.35;
    this.audio.play(name === "shoot" ? "shoot" : name === "gunHold" ? "ui" : name === "pause" ? "ui" : name);
  }

  async calibrate() {
    const { btnCalibrate, calibMsg } = this.el;
    if (!this.rec.handPresent) {
      calibMsg.textContent = "ยังไม่เจอมือ — เปิดกล้องแล้วยกมือขึ้นในกรอบก่อน";
      return;
    }
    btnCalibrate.disabled = true;
    try {
      const r = await this.rec.calibrate((msg) => (calibMsg.textContent = msg));
      calibMsg.textContent = `ปรับเทียบเสร็จ (ขึ้น ${r.up.toFixed(2)} / ลง ${r.down.toFixed(2)}) ลองยิงดูได้เลย`;
      this.audio.play("power");
    } catch (err) {
      calibMsg.textContent = err.message;
    } finally {
      btnCalibrate.disabled = false;
    }
  }

  update(dt) {
    const rec = this.rec;
    const present = rec.handPresent;
    const scores = rec.scores || {};
    for (const [key, lamp] of Object.entries(this.lamps)) {
      lamp.flash = Math.max(0, lamp.flash - dt);
      let on = false;
      let text = "";
      if (key === "HAND") {
        on = present;
        text = present && rec.handScore ? `${Math.round(rec.handScore * 100)}%` : "";
      } else if (key === "FIRE") {
        on = present && rec.triggerDown;
        text = present ? rec.d.toFixed(2) : "";
      } else {
        on = present && rec.stable === key;
        text = present && scores[key] !== undefined ? `${Math.round(scores[key] * 100)}%` : "";
      }
      toggle(lamp.li, "on", on);
      toggle(lamp.li, "fired", lamp.flash > 0);
      setText(lamp.val, text);
    }
    setStyle(this.el.meterDown, "left", pct(rec.thresholdDown));
    setStyle(this.el.meterUp, "left", pct(rec.thresholdUp));
    setStyle(this.el.meterVal, "display", present ? "block" : "none");
    setStyle(this.el.meterVal, "left", pct(rec.d));
  }
}

export function gestureLabel(rec) {
  if (!rec.handPresent) return "NO HAND";
  if (rec.triggerDown) return "FIRE";
  return (GESTURE_INFO[rec.stable] ?? GESTURE_INFO[G.NONE]).label;
}
