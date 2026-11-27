// Pure logic (no DOM) so it can be unit-tested in Node.
export const G = {
  NONE: "NONE",
  FIST: "FIST",
  OPEN_PALM: "OPEN_PALM",
  OK_PINCH: "OK_PINCH",
  V_SIGN: "V_SIGN",
  FINGER_GUN: "FINGER_GUN",
};

export const GESTURE_INFO = {
  NONE: { label: "NO GESTURE", th: "ไม่พบท่า", action: "" },
  FIST: { label: "FIST", th: "กำมือ", action: "เปิดโล่" },
  OPEN_PALM: { label: "OPEN PALM", th: "แบมือ", action: "หยุดเกม" },
  OK_PINCH: { label: "OK PINCH", th: "จีบนิ้ว OK", action: "ระเบิด" },
  V_SIGN: { label: "V SIGN", th: "ชู 2 นิ้ว", action: "เปลี่ยนอาวุธ" },
  FINGER_GUN: { label: "FINGER GUN", th: "ท่าปืน", action: "ยิง" },
};

/**
 * Dwell = how long the stable gesture must be held; fires once per entry
 * (edge trigger), then the gesture must change before it can fire again.
 */
export const GESTURE_ACTIONS = {
  FIST: { event: "shield", dwell: 250, cooldown: 1200 },
  OK_PINCH: { event: "bomb", dwell: 350, cooldown: 1500 },
  V_SIGN: { event: "weapon", dwell: 300, cooldown: 900 },
  OPEN_PALM: { event: "pause", dwell: 800, cooldown: 2000 },
  FINGER_GUN: { event: "gunHold", dwell: 1000, cooldown: 1500 },
};

const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
const PALM = [0, 5, 9, 13, 17];
const WINDOW_MS = 300;
const LOST_MS = 400;
const STALE_MS = 200;
const REPEAT_MS = 400;
const STICKY = 0.1;
const OPEN_MIN = 0.3;
const OPEN_WINDOW_MS = 4000;
// Fire below 65% of the usual thumb-up distance, re-arm above 80%.
// (A half-raised thumb at ~72% must not fire.)
const DOWN_RATIO = 0.65;
const UP_RATIO = 0.8;
const GUN_GRACE_MS = 250;
const CALIB_KEY = "sfg_thumb_calib";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
/** 0 at a, 1 at b (works for a > b too). */
const ramp = (v, a, b) => clamp((v - a) / (b - a), 0, 1);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) });
const len = (v) => Math.hypot(v.x, v.y, v.z);
const dist = (a, b) => len(sub(a, b));
const angle = (u, v) => {
  const d = len(u) * len(v);
  if (d === 0) return 0;
  return (Math.acos(clamp((u.x * v.x + u.y * v.y + u.z * v.z) / d, -1, 1)) * 180) / Math.PI;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** 1 = straight finger, 0 = fully curled. Uses joint bend angles, so it ignores hand rotation. */
export function fingerExtension(p, [mcp, pip, dip, tip]) {
  const a0 = angle(sub(p[mcp], p[0]), sub(p[pip], p[mcp]));
  const a1 = angle(sub(p[pip], p[mcp]), sub(p[dip], p[pip]));
  const a2 = angle(sub(p[dip], p[pip]), sub(p[tip], p[dip]));
  return ramp(a0 * 0.5 + a1 + a2, 120, 45);
}

export function analyzeHand(p) {
  const palm = dist(p[0], p[9]) || 1e-6;
  return {
    ext: FINGERS.map((f) => fingerExtension(p, f)),
    thumbOut: dist(p[4], p[5]) / palm,
    pinch: dist(p[4], p[8]) / palm,
    spread: dist(p[8], p[12]) / palm,
    // How far the middle tip sits out of the palm plane relative to the index tip:
    // ~0 in a V (both fingers in the hand's plane), large when the middle is
    // half-curled toward the palm in a one-finger gun.
    midBend: Math.abs(dot(sub(p[12], p[8]), palmNormal(p))) / palm,
  };
}

const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
function palmNormal(p) {
  const a = sub(p[5], p[0]);
  const b = sub(p[17], p[0]);
  const n = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  const l = len(n) || 1e-6;
  return { x: n.x / l, y: n.y / l, z: n.z / l };
}

// Real hands rarely reach the extremes (a curled ring finger seen side-on reads ~0.4-0.6),
// so "straight" and "curled" saturate well before 1 and 0.
const straight = (e) => ramp(e, 0.3, 0.75);
const curled = (e) => 1 - ramp(e, 0.25, 0.7);
// In an OK sign the other three fingers are usually relaxed, not fully straight.
const relaxed = (e) => ramp(e, 0.15, 0.5);

/**
 * Fuzzy scores 0..1. Similar gestures are separated by the fingers that differ:
 *  FIST vs GUN: index straight or not.  OK vs GUN: middle/ring/pinky straight or curled.
 *  V vs GUN: index+middle tips apart (V) or held together (two-finger gun is common).
 *  OPEN vs OK: thumb-index tips apart or touching.
 */
/** Each gesture's conditions as [part, 0..1]; the gesture score is the weakest part. */
export function gestureParts(f) {
  const [i, m, r, p] = f.ext;
  const pinchClose = 1 - ramp(f.pinch, 0.28, 0.5);
  const thumbOpen = ramp(f.thumbOut, 0.32, 0.55);
  // Measured on a real webcam: two-finger gun 0.17-0.25, V sign 0.6-0.7.
  const apart = ramp(f.spread, 0.3, 0.45);
  const midFlat = 1 - ramp(f.midBend ?? 0, 0.3, 0.5);
  return {
    FIST: [["indexCurl", curled(i)], ["middleCurl", curled(m)], ["ringCurl", curled(r)], ["pinkyCurl", curled(p)]],
    OPEN_PALM: [
      ["indexUp", straight(i)],
      ["middleUp", straight(m)],
      ["ringUp", straight(r)],
      ["pinkyUp", straight(p)],
      ["thumbOut", thumbOpen],
      ["tipsApart", 1 - pinchClose],
    ],
    OK_PINCH: [["pinch", pinchClose], ["middleRelaxed", relaxed(m)], ["ringRelaxed", relaxed(r)], ["pinkyRelaxed", relaxed(p)]],
    V_SIGN: [
      ["indexUp", straight(i)],
      ["middleUp", straight(m)],
      ["middleFlat", midFlat],
      ["ringCurl", curled(r)],
      ["pinkyCurl", curled(p)],
      ["vApart", apart],
    ],
    FINGER_GUN: [
      ["indexUp", straight(i)],
      ["ringCurl", curled(r)],
      ["pinkyCurl", curled(p)],
      ["middleGun", Math.max(curled(m), 1 - midFlat, Math.min(straight(m), 1 - apart))],
    ],
  };
}

export function scoreGestures(f) {
  const out = {};
  for (const [k, parts] of Object.entries(gestureParts(f))) out[k] = Math.min(...parts.map((x) => x[1]));
  return out;
}

export const PART_HINTS = {
  indexCurl: "งอนิ้วชี้ลง",
  middleCurl: "กำนิ้วกลาง",
  ringCurl: "กำนิ้วนางให้สุด",
  pinkyCurl: "กำนิ้วก้อยให้สุด",
  indexUp: "เหยียดนิ้วชี้ให้ตรง",
  middleUp: "เหยียดนิ้วกลางให้ตรง",
  ringUp: "เหยียดนิ้วนาง",
  pinkyUp: "เหยียดนิ้วก้อย",
  thumbOut: "กางนิ้วโป้งออก",
  tipsApart: "แยกปลายนิ้วโป้งออกจากนิ้วชี้",
  pinch: "แตะปลายนิ้วโป้งกับปลายนิ้วชี้ให้ชิด",
  middleRelaxed: "ยกนิ้วกลางขึ้น",
  ringRelaxed: "ยกนิ้วนางขึ้น",
  pinkyRelaxed: "ยกนิ้วก้อยขึ้น",
  middleFlat: "เหยียดนิ้วกลางให้ตรงเท่านิ้วชี้",
  vApart: "แยกนิ้วชี้กับนิ้วกลางให้ห่างเป็นตัว V",
  middleGun: "กำนิ้วกลาง หรือชิดนิ้วกลางกับนิ้วชี้",
};

/** The weakest conditions of `label` for these features, weakest first (only those below `below`). */
export function explainGesture(f, label, below = 0.6) {
  const parts = gestureParts(f)[label];
  if (!parts) return [];
  return parts
    .filter(([, v]) => v < below)
    .sort((a, b) => a[1] - b[1])
    .map(([key, v]) => ({ key, value: v, hint: PART_HINTS[key] }));
}

// ---------- Personal training (k-nearest neighbours on the user's own samples) ----------

const TRAIN_KEY = "sfg_gesture_train";
const TRAIN_VERSION = 1;
const KNN_K = 3;
const KNN_WEIGHT = 0.8;

/** Feature vector for nearest-neighbour matching; each dimension is roughly 0..1. */
export function featureVector(f) {
  return [
    ...f.ext,
    Math.min(f.thumbOut, 1.2) * 0.5,
    Math.min(f.pinch, 1.5) / 1.5,
    Math.min(f.spread, 1.2) / 1.2,
    Math.min(f.midBend ?? 0, 1),
  ];
}

const vdist = (a, b) => {
  let s = 0;
  for (let k = 0; k < a.length; k++) s += (a[k] - b[k]) ** 2;
  return Math.sqrt(s);
};

function knnDistance(samples, v, skip = -1) {
  const ds = [];
  for (let n = 0; n < samples.length; n++) if (n !== skip) ds.push(vdist(samples[n], v));
  ds.sort((a, b) => a - b);
  const k = Math.min(KNN_K, ds.length);
  let s = 0;
  for (let n = 0; n < k; n++) s += ds[n];
  return k ? s / k : Infinity;
}

/** The user's recorded samples per gesture; scores a hand by closeness to them. */
export class TrainedModel {
  constructor(samples) {
    this.samples = samples;
    this.sigma = {};
    for (const [label, list] of Object.entries(samples)) {
      // Per-gesture width: how tightly this user's samples cluster.
      const loo = list.map((v, n) => knnDistance(list, v, n)).sort((a, b) => a - b);
      this.sigma[label] = clamp((loo[Math.floor(loo.length / 2)] ?? 0.1) * 2.5, 0.15, 0.35);
    }
  }

  get labels() {
    return Object.keys(this.samples);
  }

  scores(v) {
    const out = {};
    for (const [label, list] of Object.entries(this.samples)) {
      const d = knnDistance(list, v);
      const s = this.sigma[label];
      out[label] = Math.exp(-(d * d) / (2 * s * s));
    }
    return out;
  }

  /** Leave-one-out check: which recorded samples would be classified as another gesture. */
  validate() {
    const report = {};
    for (const [label, list] of Object.entries(this.samples)) {
      let ok = 0;
      const confused = {};
      list.forEach((v, n) => {
        let best = null;
        let bestD = Infinity;
        for (const [other, olist] of Object.entries(this.samples)) {
          const d = knnDistance(olist, v, other === label ? n : -1) / this.sigma[other];
          if (d < bestD) [best, bestD] = [other, d];
        }
        if (best === label) ok++;
        else confused[best] = (confused[best] || 0) + 1;
      });
      report[label] = { accuracy: list.length ? ok / list.length : 0, confused };
    }
    return report;
  }

  toJSON() {
    return { v: TRAIN_VERSION, samples: this.samples };
  }

  static fromJSON(data) {
    if (!data || data.v !== TRAIN_VERSION || !data.samples) return null;
    const ok = Object.values(data.samples).every((l) => Array.isArray(l) && l.length >= 4 && l.every((v) => v.length === 8));
    return ok ? new TrainedModel(data.samples) : null;
  }
}

/**
 * Rule scores blended with the personal model. The model only takes over in proportion to
 * how closely the hand matches something the user recorded; for poses unlike any of their
 * samples (e.g. a textbook gun they never trained), the built-in rules still decide.
 */
export function blendScores(rule, trained) {
  if (!trained) return rule;
  const match = Math.max(0, ...Object.values(trained));
  const w = KNN_WEIGHT * match;
  const out = {};
  for (const k of Object.keys(rule)) out[k] = (1 - w) * rule[k] + w * (trained[k] ?? 0);
  return out;
}

export const TRAIN_STEPS = [
  { label: G.FINGER_GUN, th: "ท่าปืน ตั้งนิ้วโป้งขึ้น", img: "img/gun-pose.svg" },
  { label: G.FINGER_GUN, th: "ท่าปืน กดนิ้วโป้งลง", img: "img/fire.svg" },
  { label: G.FIST, th: "กำมือ", img: "img/fist.svg" },
  { label: G.V_SIGN, th: "ชูสองนิ้วเป็นตัว V", img: "img/vsign.svg" },
  { label: G.OK_PINCH, th: "ท่า OK (ปลายโป้งแตะปลายนิ้วชี้)", img: "img/ok.svg" },
  { label: G.OPEN_PALM, th: "แบมือ", img: "img/palm.svg" },
];

export function classify(scores, minConf) {
  let best = G.NONE;
  let bestScore = 0;
  let second = 0;
  for (const [k, v] of Object.entries(scores)) {
    if (v > bestScore) {
      second = bestScore;
      bestScore = v;
      best = k;
    } else if (v > second) second = v;
  }
  if (bestScore < minConf || bestScore - second < 0.15) return { label: G.NONE, conf: bestScore };
  return { label: best, conf: bestScore };
}

/** One Euro filter: steady when the hand is still, low lag when it moves fast. */
class OneEuro {
  constructor(minCutoff, beta, dCutoff = 1) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.reset();
  }
  reset() {
    this.x = null;
    this.dx = 0;
    this.t = 0;
  }
  static alpha(cutoff, dt) {
    return 1 / (1 + 1 / (2 * Math.PI * cutoff) / dt);
  }
  filter(x, tMs) {
    if (this.x === null) {
      this.x = x;
      this.t = tMs;
      return x;
    }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000);
    this.t = tMs;
    this.dx += OneEuro.alpha(this.dCutoff, dt) * ((x - this.x) / dt - this.dx);
    this.x += OneEuro.alpha(this.minCutoff + this.beta * Math.abs(this.dx), dt) * (x - this.x);
    return this.x;
  }
}

export class GestureRecognizer {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.minConf = 0.55;
    this.cooldownMul = 1;
    this.mirror = true;
    this.xFilter = new OneEuro(1.2, 6);
    this.queue = [];
    this.lastAction = {};
    this.calibrating = false;
    this.calibrated = false;
    this.thresholdDown = 0.33;
    this.thresholdUp = 0.42;
    this.openLevel = 0;
    this.dHist = [];
    this.model = null;
    this.training = false;
    this.loadCalibration();
    this.loadTraining();
    this.reset();
  }

  configure({ minConf, cooldownMul, mirror } = {}) {
    if (minConf !== undefined) this.minConf = minConf;
    if (cooldownMul !== undefined) this.cooldownMul = cooldownMul;
    if (mirror !== undefined) this.mirror = mirror;
  }

  reset() {
    this.handPresent = false;
    this.history = [];
    this.stable = G.NONE;
    this.stableSince = 0;
    this.actionFired = false;
    this.raw = G.NONE;
    this.conf = 0;
    this.handScore = null;
    this.scores = {};
    this.ruleScores = {};
    this.knnScores = null;
    this.features = null;
    this.featFresh = false;
    this.triggerDown = false;
    this.triggerArmed = false;
    this.gunSeenAt = -1e9;
    this.d = 1;
    this.dFresh = false;
    this.palmX = 0.5;
    this.lastSeen = -1e9;
  }

  /**
   * Feed one detection result ({ landmarks, world, score }).
   * null = no new detection this frame; { landmarks: null } = detector ran and saw no hand.
   */
  update(result, now) {
    if (!result) return;
    const lms = result.landmarks;
    if (!lms) {
      this.triggerDown = false;
      this.triggerArmed = false;
      return;
    }
    if (!this.handPresent) {
      this.handPresent = true;
      this.xFilter.reset();
      this.queue.push("handFound");
    }
    this.lastSeen = now;
    this.handScore = result.score ?? null;

    const pts = result.world ?? lms;
    this.features = analyzeHand(pts);
    this.featFresh = true;
    this.ruleScores = scoreGestures(this.features);
    this.knnScores = this.model ? this.model.scores(featureVector(this.features)) : null;
    this.scores = blendScores(this.ruleScores, this.knnScores);
    // Hysteresis: the gesture already held needs a clearly better rival to be replaced.
    const scores = { ...this.scores };
    if (scores[this.stable] !== undefined) scores[this.stable] = Math.min(1, scores[this.stable] + STICKY);
    const { label, conf } = classify(scores, this.minConf);
    this.raw = label;
    this.conf = conf;

    this.history.push({ t: now, label });
    while (this.history.length > 1 && now - this.history[0].t > WINDOW_MS) this.history.shift();
    const counts = {};
    for (const h of this.history) counts[h.label] = (counts[h.label] || 0) + 1;
    let top = G.NONE;
    let topCount = 0;
    for (const [k, c] of Object.entries(counts)) if (c > topCount) [top, topCount] = [k, c];
    const needed = Math.max(Math.min(2, this.history.length), Math.ceil(this.history.length * 0.6));
    if (topCount >= needed && top !== this.stable) {
      this.stable = top;
      this.stableSince = now;
      this.actionFired = false;
    }

    let cx = 0;
    for (const i of PALM) cx += lms[i].x;
    cx /= PALM.length;
    this.palmX = clamp(this.xFilter.filter(this.mirror ? 1 - cx : cx, now), 0, 1);

    this.updateTrigger(now);
  }

  /**
   * Shooting = thumb pressed onto the index while in FINGER_GUN. The trigger must be
   * "armed" by seeing the thumb up in gun pose first, so changing from FIST or V into
   * the gun never fires by accident, and it releases as soon as the gun pose is lost.
   */
  updateTrigger(now) {
    this.d = this.features.thumbOut;
    this.dFresh = true;
    const gun = this.stable === G.FINGER_GUN || this.raw === G.FINGER_GUN;
    if (gun) this.gunSeenAt = now;
    if (this.calibrating || now - this.gunSeenAt > GUN_GRACE_MS) {
      this.triggerDown = false;
      this.triggerArmed = false;
      return;
    }
    // Brief misclassification while the thumb moves: hold the trigger state as is.
    if (!gun) return;
    if (!this.calibrated && !this.triggerDown) this.adaptThresholds(now);
    if (this.d > this.thresholdUp) {
      this.triggerArmed = true;
      this.triggerDown = false;
    } else if (this.triggerArmed && !this.triggerDown && this.d < this.thresholdDown) {
      this.triggerDown = true;
      this.lastShot = now;
      this.queue.push("shoot");
    }
  }

  /** The thumb-up distance differs per person and hand angle, so trigger points follow it. */
  // A high percentile over a few seconds: one noisy spike can't push the trigger
  // points out of reach, and a new hand angle is picked up within seconds.
  adaptThresholds(now) {
    const h = this.dHist;
    h.push({ t: now, d: this.d });
    while (h.length > 1 && now - h[0].t > OPEN_WINDOW_MS) h.shift();
    const sorted = h.map((s) => s.d).sort((a, b) => a - b);
    this.openLevel = clamp(sorted[Math.floor((sorted.length - 1) * 0.85)], OPEN_MIN, 1);
    this.thresholdDown = this.openLevel * DOWN_RATIO;
    this.thresholdUp = this.openLevel * UP_RATIO;
  }

  /** Call every frame; returns the events since the last call. */
  tick(now) {
    if (this.handPresent && now - this.lastSeen > LOST_MS) {
      this.reset();
      this.queue.push("handLost");
    }
    if (this.handPresent) {
      const a = GESTURE_ACTIONS[this.stable];
      if (a && !this.actionFired && !this.calibrating && now - this.stableSince >= a.dwell) {
        // One attempt per entry: if still cooling down the attempt is consumed, so the
        // action can't fire late while the hand is already moving to another gesture.
        this.actionFired = true;
        if (now - (this.lastAction[a.event] ?? -1e9) >= a.cooldown * this.cooldownMul) {
          this.lastAction[a.event] = now;
          this.queue.push(a.event);
        } else {
          this.queue.push("cooldown:" + a.event);
        }
      }
      if (this.triggerDown && now - this.lastSeen < STALE_MS && now - this.lastShot >= REPEAT_MS) {
        this.lastShot = now;
        this.queue.push("shoot");
      }
    }
    const out = this.queue;
    this.queue = [];
    return out;
  }

  /** Progress 0..1 of the dwell for the current gesture (for UI feedback). */
  dwellProgress(now) {
    const a = GESTURE_ACTIONS[this.stable];
    if (!a || this.actionFired || !this.handPresent) return 0;
    return clamp((now - this.stableSince) / a.dwell, 0, 1);
  }

  loadCalibration() {
    try {
      const c = JSON.parse(this.storage?.getItem(CALIB_KEY));
      if (c && c.down < c.up) {
        this.thresholdDown = c.down;
        this.thresholdUp = c.up;
        this.calibrated = true;
      }
    } catch {
      /* ignore corrupt storage */
    }
  }

  resetCalibration() {
    this.calibrated = false;
    this.openLevel = 0;
    this.dHist = [];
    this.thresholdDown = 0.33;
    this.thresholdUp = 0.42;
    this.storage?.removeItem(CALIB_KEY);
  }

  /** Measures thumb-up and thumb-down in gun pose and sets the trigger thresholds between them. */
  async calibrate(onStep) {
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
    this.calibrating = true;
    try {
      for (let i = 3; i > 0; i--) {
        onStep(`ทำท่าปืน ตั้งนิ้วโป้งขึ้นค้างไว้... ${i}`);
        await sleep(600);
      }
      onStep("กำลังวัดนิ้วโป้งขึ้น... ค้างไว้");
      const up = await sample(1200);
      for (let i = 3; i > 0; i--) {
        onStep(`กดนิ้วโป้งลงแตะนิ้วชี้ค้างไว้... ${i}`);
        await sleep(600);
      }
      onStep("กำลังวัดนิ้วโป้งลง... ค้างไว้");
      const down = await sample(1200);
      if (up.length < 4 || down.length < 4) throw new Error("ไม่เจอมือ ลองยกมือให้อยู่ในกล้องแล้วลองใหม่");
      const mu = median(up);
      const md = median(down);
      if (mu - md < 0.12) throw new Error("นิ้วโป้งขึ้นกับลงต่างกันน้อยเกินไป ลองกดนิ้วโป้งลงให้ชัดขึ้น");
      const mid = (mu + md) / 2;
      const gap = (mu - md) * 0.18;
      this.thresholdDown = mid - gap;
      this.thresholdUp = mid + gap;
      this.calibrated = true;
      this.storage?.setItem(CALIB_KEY, JSON.stringify({ down: this.thresholdDown, up: this.thresholdUp }));
      return { up: mu, down: md };
    } finally {
      this.calibrating = false;
    }
  }

  get trained() {
    return !!this.model;
  }

  loadTraining() {
    try {
      this.model = TrainedModel.fromJSON(JSON.parse(this.storage?.getItem(TRAIN_KEY)));
    } catch {
      this.model = null;
    }
  }

  resetTraining() {
    this.model = null;
    this.storage?.removeItem(TRAIN_KEY);
  }

  cancelTraining() {
    this.trainCancel = true;
  }

  /**
   * Records the user's own version of each gesture (TRAIN_STEPS), then matches live hands
   * against those samples in addition to the built-in rules. The previous training is kept
   * if anything fails. onStep(step, index, phase, secondsLeft) drives the UI.
   */
  async train(onStep, { countdown = 3, recordMs = 1500, wait = sleep } = {}) {
    const samples = {};
    this.calibrating = true;
    this.trainCancel = false;
    this.training = true;
    try {
      for (let s = 0; s < TRAIN_STEPS.length; s++) {
        const step = TRAIN_STEPS[s];
        for (let c = countdown; c > 0; c--) {
          onStep(step, s, "ready", c);
          await wait(700);
          if (this.trainCancel) throw new Error("ยกเลิกการฝึกแล้ว ใช้ค่าเดิมต่อ");
        }
        onStep(step, s, "record", 0);
        const got = [];
        for (let t = 0; t < recordMs; t += 40) {
          await wait(40);
          if (this.trainCancel) throw new Error("ยกเลิกการฝึกแล้ว ใช้ค่าเดิมต่อ");
          if (this.handPresent && this.featFresh && this.features) {
            got.push(featureVector(this.features));
            this.featFresh = false;
          }
        }
        if (got.length < 6) throw new Error(`ไม่เจอมือตอนบันทึก "${step.th}" ลองยกมือให้อยู่กลางกล้องแล้วฝึกใหม่`);
        (samples[step.label] ??= []).push(...got);
      }
      for (const [k, list] of Object.entries(samples)) {
        if (list.length > 60) samples[k] = list.filter((_, n) => n % Math.ceil(list.length / 60) === 0);
      }
      const model = new TrainedModel(samples);
      const report = model.validate();
      this.model = model;
      this.storage?.setItem(TRAIN_KEY, JSON.stringify(model.toJSON()));
      return report;
    } finally {
      this.calibrating = false;
      this.training = false;
    }
  }
}
