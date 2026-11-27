const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const CALIB_KEY = "ss_thumb_calib";
const ZONE_MIN = 0.15;
const ZONE_MAX = 0.85;
const HAND_LOST_MS = 300;

/**
 * Finger-gun controls:
 *  - hand X (index MCP + wrist, mirrored) -> ship X in [0,1]
 *  - thumb tip close to index MCP -> trigger pulled (fires on the down edge, slow repeat while held)
 * Falls back to keyboard (A/D, arrows, Space) and pointer (move + press).
 */
export class FingerGunInput {
  constructor(canvas) {
    this.x = 0.5;
    this.handX = 0.5;
    this.handPresent = false;
    this.lastSeen = -1e9;
    this.source = "keyboard";

    this.d = 1;
    this.dFresh = false;
    this.gunPose = false;
    this.triggerDown = false;
    this.thresholdDown = 0.45;
    this.thresholdUp = 0.65;
    this.repeatMs = 400;
    this.lastFire = 0;
    this.pending = 0;
    this.listeners = [];
    this.calibrating = false;

    this.keys = new Set();
    this.pointerFire = false;

    this.loadCalibration();
    this.bind(canvas);
  }

  bind(canvas) {
    window.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
      this.keys.add(e.code);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.pointerFire = false;
    });

    canvas.addEventListener("pointermove", (e) => {
      if (this.handPresent) return;
      this.x = clamp(e.clientX / window.innerWidth, 0, 1);
      this.source = "mouse";
    });
    canvas.addEventListener("pointerdown", (e) => {
      this.pointerFire = true;
      if (!this.handPresent) {
        this.x = clamp(e.clientX / window.innerWidth, 0, 1);
        this.source = "mouse";
      }
    });
    const up = () => (this.pointerFire = false);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", up);
  }

  get holdFire() {
    return this.keys.has("Space") || this.pointerFire;
  }

  onShot(fn) {
    this.listeners.push(fn);
  }

  fire(now) {
    this.lastFire = now;
    this.pending = Math.min(this.pending + 1, 2);
    for (const fn of this.listeners) fn();
  }

  takeShot() {
    if (this.pending > 0) {
      this.pending--;
      return true;
    }
    return false;
  }

  clearShots() {
    this.pending = 0;
  }

  /** Called with fresh landmarks (or null) after each detection. */
  onHand(lms, now, aspect) {
    if (!lms) return;
    const first = !this.handPresent;
    this.lastSeen = now;
    this.handPresent = true;
    this.source = "hand";

    const raw = 1 - (lms[5].x + lms[0].x) / 2;
    const mapped = clamp((raw - ZONE_MIN) / (ZONE_MAX - ZONE_MIN), 0, 1);
    this.handX = first ? mapped : this.handX + (mapped - this.handX) * 0.55;

    const dist = (a, b) => Math.hypot((a.x - b.x) * aspect, a.y - b.y);
    const size = dist(lms[0], lms[9]) || 1e-3;
    this.d = dist(lms[4], lms[5]) / size;
    this.dFresh = true;

    const indexTip = dist(lms[8], lms[0]);
    const indexExtended = indexTip > dist(lms[6], lms[0]) * 1.05;
    const othersCurled = Math.max(dist(lms[12], lms[0]), dist(lms[16], lms[0])) < indexTip * 0.8;
    this.gunPose = indexExtended && othersCurled;

    if (this.calibrating) return;
    if (!this.triggerDown && this.d < this.thresholdDown) {
      this.triggerDown = true;
      this.fire(now);
    } else if (this.triggerDown && this.d > this.thresholdUp) {
      this.triggerDown = false;
    }
  }

  /** Called every frame. */
  tick(now, dt) {
    if (this.handPresent && now - this.lastSeen > HAND_LOST_MS) {
      this.handPresent = false;
      this.triggerDown = false;
      this.gunPose = false;
    }
    if (this.triggerDown && now - this.lastFire >= this.repeatMs) this.fire(now);

    if (this.handPresent) {
      this.x = this.handX;
      return;
    }
    const left = this.keys.has("ArrowLeft") || this.keys.has("KeyA");
    const right = this.keys.has("ArrowRight") || this.keys.has("KeyD");
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (dir) {
      this.x = clamp(this.x + dir * dt * 1.2, 0, 1);
      this.source = "keyboard";
    }
  }

  loadCalibration() {
    try {
      const c = JSON.parse(localStorage.getItem(CALIB_KEY));
      if (c && c.down < c.up) {
        this.thresholdDown = c.down;
        this.thresholdUp = c.up;
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  /** Measures the thumb-up and thumb-down poses and sets thresholds between them. */
  async calibrate(onStep) {
    this.calibrating = true;
    this.triggerDown = false;
    const sample = async (ms) => {
      const values = [];
      const end = performance.now() + ms;
      while (performance.now() < end) {
        await sleep(40);
        if (this.handPresent && this.dFresh) {
          values.push(this.d);
          this.dFresh = false;
        }
      }
      return values;
    };
    try {
      for (let i = 3; i > 0; i--) {
        onStep(`👉 ทำท่าปืน ตั้งนิ้วโป้งขึ้นค้างไว้... ${i}`);
        await sleep(600);
      }
      onStep("📏 กำลังวัดนิ้วโป้งขึ้น... ค้างไว้");
      const up = await sample(1200);
      for (let i = 3; i > 0; i--) {
        onStep(`👇 กดนิ้วโป้งลงแตะนิ้วชี้ค้างไว้... ${i}`);
        await sleep(600);
      }
      onStep("📏 กำลังวัดนิ้วโป้งลง... ค้างไว้");
      const down = await sample(1200);

      if (up.length < 4 || down.length < 4) throw new Error("ไม่เจอมือ ลองยกมือให้อยู่ในกล้องแล้วลองใหม่");
      const mu = median(up);
      const md = median(down);
      if (mu - md < 0.12) throw new Error("นิ้วโป้งขึ้นกับลงต่างกันน้อยเกินไป ลองกดนิ้วโป้งลงให้ชัดขึ้น");

      const mid = (mu + md) / 2;
      const gap = (mu - md) * 0.18;
      this.thresholdDown = mid - gap;
      this.thresholdUp = mid + gap;
      localStorage.setItem(CALIB_KEY, JSON.stringify({ down: this.thresholdDown, up: this.thresholdUp }));
      return { up: mu, down: md };
    } finally {
      this.calibrating = false;
    }
  }
}
