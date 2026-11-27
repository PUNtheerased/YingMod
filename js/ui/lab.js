import { $, setText, setStyle, toggle } from "./dom.js";
import { G, GESTURE_INFO, explainGesture } from "../ai/gestures.js";

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
      btnTrain: $("btnTrain"),
      btnTrainReset: $("btnTrainReset"),
      trainMsg: $("trainMsg"),
      overlay: $("trainOverlay"),
      trainImg: $("trainImg"),
      trainStep: $("trainStep"),
      trainCount: $("trainCount"),
      why: $("labWhy"),
      stats: $("labStats"),
      hint: $("labHint"),
    };
    this.el.btnCalibrate.addEventListener("click", () => this.calibrate());
    $("btnAutoCalib").addEventListener("click", () => {
      this.rec.resetCalibration();
      this.el.calibMsg.textContent = "กลับเป็นโหมดอัตโนมัติแล้ว ทำท่าปืนตั้งนิ้วโป้งขึ้นสักครู่ให้เกมจำระยะ";
    });
    this.el.btnTrain.addEventListener("click", () => (this.rec.training ? this.rec.cancelTraining() : this.train()));
    this.el.btnTrainReset.addEventListener("click", () => {
      this.rec.resetTraining();
      this.setTrainMsg("ลบท่าที่ฝึกไว้แล้ว กลับไปใช้ระบบจับท่ามาตรฐาน", "");
      this.syncTrainButtons();
    });
    this.syncTrainButtons();
    if (this.rec.trained) this.setTrainMsg("ใช้ท่ามือที่คุณฝึกไว้อยู่ (บันทึกในเบราว์เซอร์นี้)", "ok");
  }

  setTrainMsg(text, cls) {
    const m = this.el.trainMsg;
    m.textContent = text;
    toggle(m, "ok", cls === "ok");
    toggle(m, "bad", cls === "bad");
  }

  syncTrainButtons() {
    const { btnTrain, btnTrainReset, btnCalibrate } = this.el;
    const training = this.rec.training;
    btnTrain.lastChild.textContent = training ? "CANCEL" : this.rec.trained ? "TRAIN AGAIN" : "TRAIN MY GESTURES";
    btnTrainReset.disabled = training || !this.rec.trained;
    btnCalibrate.disabled = training;
  }

  async train() {
    if (!this.rec.handPresent) {
      this.setTrainMsg("ยังไม่เจอมือ เปิดกล้องแล้วยกมือขึ้นในกรอบก่อน", "bad");
      return;
    }
    const { overlay, trainImg, trainStep, trainCount } = this.el;
    toggle(overlay, "hidden", false);
    const run = this.rec.train((step, index, phase, left) => {
      trainImg.src = step.img;
      setText(trainStep, `${index + 1}/6 ${step.th}`);
      toggle(overlay, "rec", phase === "record");
      setText(trainCount, phase === "record" ? "กำลังบันทึก... ค้างไว้ ขยับมือเล็กน้อยได้" : `เตรียมท่า... ${left}`);
      if (phase === "record") this.audio.play("ui");
    });
    this.syncTrainButtons();
    try {
      const report = await run;
      const weak = Object.entries(report).filter(([, r]) => r.accuracy < 0.8);
      if (weak.length) {
        const names = weak
          .map(([k, r]) => {
            const other = Object.keys(r.confused).sort((a, b) => r.confused[b] - r.confused[a])[0];
            return `${GESTURE_INFO[k].label}${other ? ` กับ ${GESTURE_INFO[other].label}` : ""}`;
          })
          .join(", ");
        this.setTrainMsg(`บันทึกแล้ว แต่ท่า ${names} ยังคล้ายกันเกินไป ลองทำให้ต่างกันชัดขึ้นแล้วฝึกใหม่`, "bad");
      } else {
        this.setTrainMsg("ฝึกเสร็จ เกมจำท่ามือของคุณแล้ว ลองทำแต่ละท่าดูว่าไฟติดถูกไหม", "ok");
      }
      this.audio.play("power");
    } catch (err) {
      this.setTrainMsg(err.message, "bad");
    } finally {
      toggle(overlay, "hidden", true);
      this.syncTrainButtons();
    }
  }

  /** Under the lamps: which finger stops the closest gesture from being recognized. */
  updateWhy() {
    const rec = this.rec;
    const el = this.el.why;
    if (!rec.handPresent || !rec.features || rec.training) {
      setText(el, "");
      return;
    }
    const scores = rec.scores || {};
    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [top, topScore] = ranked[0] ?? [G.NONE, 0];
    if (rec.stable !== G.NONE) {
      const second = ranked.find(([k]) => k !== rec.stable);
      const close = second && second[1] > (scores[rec.stable] ?? 0) - 0.25;
      toggle(el, "ok", !close);
      setText(el, close ? `จับได้ ${GESTURE_INFO[rec.stable].label} แต่ใกล้กับท่า ${GESTURE_INFO[second[0]].label} ทำให้ชัดขึ้นอีกนิด` : `จับได้ ${GESTURE_INFO[rec.stable].label}`);
      return;
    }
    toggle(el, "ok", false);
    const tips = explainGesture(rec.features, top).slice(0, 2).map((t) => t.hint);
    setText(
      el,
      tips.length
        ? `ใกล้ท่า ${GESTURE_INFO[top].label} (${Math.round(topScore * 100)}%) ลอง: ${tips.join(" · ")}`
        : `ใกล้ท่า ${GESTURE_INFO[top].label} (${Math.round(topScore * 100)}%) แต่ยังก้ำกึ่งกับท่าอื่น`,
    );
  }

  updateStatus(tracker, hint) {
    const on = tracker.cameraOn;
    setText(this.el.stats, on ? `AI ${tracker.detectFps.toFixed(0)} FPS · ${tracker.inferMs.toFixed(0)} ms · ${tracker.delegate}${this.rec.trained ? " · TRAINED" : ""}` : "");
    toggle(this.el.hint, "hidden", !hint);
    if (hint) setText(this.el.hint, hint);
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
    this.updateWhy();
  }
}

export function gestureLabel(rec) {
  if (!rec.handPresent) return "NO HAND";
  if (rec.triggerDown) return "FIRE";
  return (GESTURE_INFO[rec.stable] ?? GESTURE_INFO[G.NONE]).label;
}
