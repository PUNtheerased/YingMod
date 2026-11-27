const $ = (id) => document.getElementById(id);
const METER_MAX = 1.2;
const pct = (v) => `${Math.max(0, Math.min(1, v / METER_MAX)) * 100}%`;

/** Live gesture check + calibration on the How to Play screen. */
export class Tutorial {
  constructor(input, sfx) {
    this.input = input;
    this.sfx = sfx;
    this.active = false;
    this.shots = 0;
    this.el = {
      lampHand: $("lampHand"),
      lampGun: $("lampGun"),
      lampFire: $("lampFire"),
      meterDown: $("meterDown"),
      meterUp: $("meterUp"),
      meterVal: $("meterVal"),
      trackShip: $("trackShip"),
      shotCount: $("shotCount"),
      btnCalibrate: $("btnCalibrate"),
      calibMsg: $("calibMsg"),
    };

    input.onShot(() => {
      if (!this.active) return;
      this.shots++;
      this.el.shotCount.textContent = this.shots;
      this.sfx.shoot();
    });

    this.el.btnCalibrate.addEventListener("click", () => this.calibrate());
  }

  async calibrate() {
    const { btnCalibrate, calibMsg } = this.el;
    this.sfx.unlock();
    if (!this.input.handPresent) {
      calibMsg.textContent = "⚠️ ยังไม่เจอมือ — เปิดกล้องแล้วยกมือขึ้นในกรอบก่อน";
      return;
    }
    btnCalibrate.disabled = true;
    try {
      const r = await this.input.calibrate((msg) => (calibMsg.textContent = msg));
      calibMsg.textContent = `✅ ปรับเทียบเสร็จ (ขึ้น ${r.up.toFixed(2)} / ลง ${r.down.toFixed(2)}) ลองยิงดูได้เลย`;
      this.sfx.power();
    } catch (err) {
      calibMsg.textContent = `⚠️ ${err.message}`;
    } finally {
      btnCalibrate.disabled = false;
    }
  }

  update() {
    const { input, el } = this;
    el.lampHand.classList.toggle("on", input.handPresent);
    el.lampGun.classList.toggle("on", input.handPresent && input.gunPose);
    el.lampFire.classList.toggle("on", input.triggerDown);

    el.meterDown.style.left = pct(input.thresholdDown);
    el.meterUp.style.left = pct(input.thresholdUp);
    el.meterVal.style.display = input.handPresent ? "block" : "none";
    el.meterVal.style.left = pct(input.d);
    el.trackShip.style.left = `${input.x * 100}%`;
  }
}
