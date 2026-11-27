import test from "node:test";
import assert from "node:assert/strict";
import { G, GestureRecognizer, analyzeHand, scoreGestures, classify, explainGesture } from "../js/ai/gestures.js";
import { POSES, makeHand } from "./handModel.mjs";

const memStorage = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

const FRAME = 33;

/** Feeds `pose` for `ms` milliseconds; returns all emitted events. */
function run(rec, state, pose, ms) {
  const events = [];
  const end = state.t + ms;
  while (state.t < end) {
    state.t += FRAME;
    rec.update(typeof pose === "function" ? pose() : pose, state.t);
    events.push(...rec.tick(state.t));
  }
  return events;
}
const count = (events, name) => events.filter((e) => e === name).length;
const fresh = () => [new GestureRecognizer(memStorage()), { t: 1000 }];

test("static classification of all six poses", () => {
  const expect = {
    gunUp: G.FINGER_GUN,
    gunDown: G.FINGER_GUN,
    fist: G.FIST,
    open: G.OPEN_PALM,
    ok: G.OK_PINCH,
    vsign: G.V_SIGN,
  };
  for (const [name, want] of Object.entries(expect)) {
    const scores = scoreGestures(analyzeHand(POSES[name]().world));
    const { label, conf } = classify(scores, 0.55);
    assert.equal(label, want, `${name}: got ${label} (${JSON.stringify(scores)})`);
    assert.ok(conf >= 0.75, `${name} confidence ${conf}`);
  }
});

test("two-finger gun (index+middle together) is a gun, not a V sign", () => {
  for (const name of ["gun2Up", "gun2Down"]) {
    const f = analyzeHand(POSES[name]().world);
    assert.ok(f.spread < 0.26, `${name} spread ${f.spread}`);
    assert.equal(classify(scoreGestures(f), 0.55).label, G.FINGER_GUN, name);
  }
});

test("feature vectors recorded from a real webcam session", () => {
  // Captured from the live lab: sideways two-finger gun, ring/pinky only partly curled.
  const real = [
    { ext: [1, 1, 0.27, 0], thumbOut: 0.46, pinch: 0.84, spread: 0.17 },
    { ext: [0.74, 1, 0.38, 0], thumbOut: 0.78, pinch: 1.37, spread: 0.24 },
    { ext: [0.87, 1, 0.1, 0], thumbOut: 0.28, pinch: 0.59, spread: 0.22 },
    { ext: [1, 0.9, 0.2, 0.2], thumbOut: 0.55, pinch: 0.75, spread: 0.24 },
  ];
  // Real fists, including one with the thumb resting near the index tip (pinch 0.28).
  for (const f of [
    { ext: [0, 0, 0, 0], thumbOut: 0.78, pinch: 1.18, spread: 0.88 },
    { ext: [0.1, 0, 0, 0], thumbOut: 0.48, pinch: 0.28, spread: 0.13 },
    { ext: [0.01, 0.07, 0.42, 0.29], thumbOut: 0.31, pinch: 0.5, spread: 0.87 },
  ]) {
    assert.equal(classify(scoreGestures(f), 0.55).label, G.FIST, JSON.stringify(f));
  }
  // Real V signs.
  for (const sp of [0.61, 0.7]) {
    assert.equal(classify(scoreGestures({ ext: [1, 0.78, 0.04, 0], thumbOut: 0.55, pinch: 1.2, spread: sp }), 0.55).label, G.V_SIGN);
  }
  for (const f of real) assert.equal(classify(scoreGestures(f), 0.55).label, G.FINGER_GUN, JSON.stringify(f));
  const vReal = { ext: [1, 1, 0.1, 0.05], thumbOut: 0.4, pinch: 1.2, spread: 0.55 };
  assert.equal(classify(scoreGestures(vReal), 0.55).label, G.V_SIGN);
});

test("one-finger gun with a half-curled middle finger is a gun, not a V sign", () => {
  assert.ok(analyzeHand(POSES.vsign().world).midBend < 0.1);
  for (const curl of [0.2, 0.3, 0.4, 0.5, 0.6]) {
    const f = analyzeHand(POSES.gunHalfMid(curl).world);
    const { label } = classify(scoreGestures(f), 0.55);
    assert.equal(label, G.FINGER_GUN, `curl ${curl}: ext ${f.ext} spread ${f.spread} midBend ${f.midBend}`);
  }
  const [rec, s] = fresh();
  assert.equal(count(run(rec, s, () => POSES.gunHalfMid(0.4), 1500), "weapon"), 0);
  const ev = run(rec, s, () => POSES.gunHalfMid(0.4, "down"), 200);
  assert.equal(count(ev, "shoot"), 1);
  assert.equal(count(ev, "weapon"), 0);
});

test("two-finger gun fires on thumb press and never switches weapon", () => {
  const [rec, s] = fresh();
  assert.equal(count(run(rec, s, POSES.gun2Up, 1200), "weapon"), 0);
  const ev = run(rec, s, POSES.gun2Down, 200);
  assert.equal(count(ev, "shoot"), 1);
  assert.equal(count(ev, "weapon"), 0);
});

test("classification survives landmark jitter", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const h = makeHand({ curls: [0, 0, 1, 1], thumb: "tuck", spreads: [-0.3, 0.25], jitter: 0.003, seed });
    assert.equal(classify(scoreGestures(analyzeHand(h.world)), 0.55).label, G.V_SIGN);
    const g = makeHand({ curls: [0, 1, 1, 1], thumb: "up", jitter: 0.003, seed });
    assert.equal(classify(scoreGestures(analyzeHand(g.world)), 0.55).label, G.FINGER_GUN);
  }
});

test("gun: thumb up never fires, one press = one shot, hold repeats, release stops", () => {
  const [rec, s] = fresh();
  assert.equal(count(run(rec, s, POSES.gunUp, 1500), "shoot"), 0);
  assert.equal(count(run(rec, s, POSES.gunDown, 200), "shoot"), 1);
  assert.equal(count(run(rec, s, POSES.gunDown, 800), "shoot"), 2);
  assert.equal(count(run(rec, s, POSES.gunUp, 600), "shoot"), 0);
  assert.equal(count(run(rec, s, POSES.gunDown, 200), "shoot"), 1);
});

test("gun: half-raised thumb (~0.54 of the old meter) does not fire", () => {
  const [rec, s] = fresh();
  run(rec, s, () => POSES.gunThumb(0.75), 1000);
  assert.equal(count(run(rec, s, () => POSES.gunThumb(0.54), 1500), "shoot"), 0);
});

test("gun: low thumb-up level (hand sideways) still fires on a press", () => {
  const [rec, s] = fresh();
  run(rec, s, () => POSES.gunThumb(0.42), 1200);
  assert.equal(count(run(rec, s, () => POSES.gunThumb(0.26), 200), "shoot"), 1);
  run(rec, s, () => POSES.gunThumb(0.42), 300);
  assert.equal(count(run(rec, s, () => POSES.gunThumb(0.26), 200), "shoot"), 1);
});

test("gun: a brief thumb-stretch spike does not lock the trigger", () => {
  const [rec, s] = fresh();
  run(rec, s, () => POSES.gunThumb(0.6), 1500);
  run(rec, s, () => POSES.gunThumb(1), 100);
  run(rec, s, () => POSES.gunThumb(0.6), 300);
  for (let i = 0; i < 3; i++) {
    assert.equal(count(run(rec, s, () => POSES.gunThumb(0.3), 150), "shoot"), 1, `press ${i}`);
    run(rec, s, () => POSES.gunThumb(0.6), 250);
    assert.equal(rec.triggerDown, false, `released ${i}`);
  }
});

test("V sign switches weapon once and never shoots", () => {
  const [rec, s] = fresh();
  const ev = run(rec, s, POSES.vsign, 2500);
  assert.equal(count(ev, "shoot"), 0);
  assert.equal(count(ev, "weapon"), 1);
});

test("fist raises shield once; changing to gun with thumb down does not fire", () => {
  const [rec, s] = fresh();
  const ev = run(rec, s, POSES.fist, 1000);
  assert.equal(count(ev, "shield"), 1);
  assert.equal(count(run(rec, s, POSES.gunDown, 800), "shoot"), 0);
  run(rec, s, POSES.gunUp, 300);
  assert.equal(count(run(rec, s, POSES.gunDown, 200), "shoot"), 1);
});

test("open palm pauses only after the 0.8 s dwell, once", () => {
  const [rec, s] = fresh();
  assert.equal(count(run(rec, s, POSES.open, 600), "pause"), 0);
  run(rec, s, POSES.gunUp, 300);
  assert.equal(count(run(rec, s, POSES.open, 2500), "pause"), 1);
});

test("OK pinch drops a bomb and is not mistaken for the gun", () => {
  const [rec, s] = fresh();
  const ev = run(rec, s, POSES.ok, 1000);
  assert.equal(count(ev, "bomb"), 1);
  assert.equal(count(ev, "shoot"), 0);
});

test("held gun emits gunHold (resume) after 1 s", () => {
  const [rec, s] = fresh();
  assert.equal(count(run(rec, s, POSES.gunUp, 700), "gunHold"), 0);
  assert.equal(count(run(rec, s, POSES.gunUp, 600), "gunHold"), 1);
});

test("single-frame flicker does not trigger an action", () => {
  const [rec, s] = fresh();
  const ev = [];
  for (let i = 0; i < 60; i++) {
    s.t += FRAME;
    rec.update(i % 10 === 5 ? POSES.fist() : POSES.gunUp(), s.t);
    ev.push(...rec.tick(s.t));
  }
  assert.equal(count(ev, "shield"), 0);
});

test("hand lost stops firing immediately and recovers", () => {
  const [rec, s] = fresh();
  run(rec, s, POSES.gunUp, 500);
  run(rec, s, POSES.gunDown, 100);
  assert.equal(rec.triggerDown, true);
  const ev = run(rec, s, { landmarks: null }, 600);
  assert.equal(count(ev, "handLost"), 1);
  assert.equal(count(ev, "shoot"), 0);
  assert.equal(rec.triggerDown, false);
  assert.equal(rec.handPresent, false);
  assert.equal(count(run(rec, s, POSES.gunUp, 200), "handFound"), 1);
});

test("cooldown blocks rapid re-trigger of the same action", () => {
  const [rec, s] = fresh();
  rec.configure({ cooldownMul: 1 });
  assert.equal(count(run(rec, s, POSES.fist, 600), "shield"), 1);
  run(rec, s, POSES.gunUp, 300);
  assert.equal(count(run(rec, s, POSES.fist, 600), "shield"), 0);
  run(rec, s, POSES.gunUp, 300);
  assert.equal(count(run(rec, s, POSES.fist, 600), "shield"), 1);
});

test("explainGesture names the finger that blocks the gesture", () => {
  // Gun with the ring finger still half up: rules reject it, and the hint says why.
  const f = analyzeHand(makeHand({ curls: [0, 1, 0.35, 1], thumb: "up" }).world);
  const tips = explainGesture(f, G.FINGER_GUN).map((t) => t.key);
  assert.equal(tips[0], "ringCurl");
  assert.deepEqual(explainGesture(analyzeHand(POSES.gunUp().world), G.FINGER_GUN), []);
});

/** Runs rec.train() while feeding the pose that each step asks for. */
async function trainWith(rec, s, poseFor) {
  let current = null;
  const wait = async (ms) => {
    if (current !== null) run(rec, s, () => poseFor(current), ms);
    else s.t += ms;
  };
  return rec.train((step, index) => (current = index), { countdown: 1, recordMs: 600, wait });
}

test("personal training: user's own odd gun pose becomes FINGER_GUN, other gestures stay correct", async () => {
  // This user's "gun": ring and pinky barely curled - the rules alone don't accept it.
  let seed = 1;
  const oddGun = (thumb) => makeHand({ curls: [0, 0.45, 0.3, 0.35], thumb, jitter: 0.002, seed: seed++ });
  const before = classify(scoreGestures(analyzeHand(oddGun("up").world)), 0.55).label;
  assert.notEqual(before, G.FINGER_GUN, "precondition: rules alone miss this pose");

  const storage = memStorage();
  const rec = new GestureRecognizer(storage);
  const s = { t: 1000 };
  const poses = [() => oddGun("up"), () => oddGun("down"), POSES.fist, POSES.vsign, POSES.ok, POSES.open];
  const report = await trainWith(rec, s, (i) => poses[i]());
  assert.ok(rec.trained);
  for (const [k, r] of Object.entries(report)) assert.ok(r.accuracy >= 0.8, `${k} accuracy ${r.accuracy}`);

  run(rec, s, () => oddGun("up"), 600);
  assert.equal(rec.stable, G.FINGER_GUN, `odd gun after training: ${JSON.stringify(rec.scores)}`);
  for (const [pose, want] of [
    [POSES.fist, G.FIST],
    [POSES.vsign, G.V_SIGN],
    [POSES.ok, G.OK_PINCH],
    [POSES.open, G.OPEN_PALM],
    [POSES.gunUp, G.FINGER_GUN],
  ]) {
    run(rec, s, pose, 600);
    assert.equal(rec.stable, want, `${want}: ${JSON.stringify(rec.scores)}`);
  }

  // Saved and reloaded from storage.
  const again = new GestureRecognizer(storage);
  assert.ok(again.trained);
  again.resetTraining();
  assert.equal(new GestureRecognizer(storage).trained, false);
});

test("personal training fixes a gun the rules read as V, while a wide V stays V", async () => {
  // This user's gun keeps index + middle up and slightly apart; their V is much wider.
  let seed = 100;
  const gun = (thumb) => makeHand({ curls: [0, 0, 1, 1], thumb, spreads: [-0.1, 0.1], jitter: 0.002, seed: seed++ });
  const wideV = () => makeHand({ curls: [0, 0, 1, 1], thumb: "tuck", spreads: [-0.45, 0.45], jitter: 0.002, seed: seed++ });
  assert.equal(classify(scoreGestures(analyzeHand(gun("up").world)), 0.55).label, G.V_SIGN, "precondition");

  const rec = new GestureRecognizer(memStorage());
  const s = { t: 1000 };
  const poses = [() => gun("up"), () => gun("down"), POSES.fist, wideV, POSES.ok, POSES.open];
  await trainWith(rec, s, (i) => poses[i]());

  const ev = run(rec, s, () => gun("up"), 1500);
  assert.equal(rec.stable, G.FINGER_GUN, JSON.stringify(rec.scores));
  assert.equal(count(ev, "weapon"), 0);
  assert.equal(count(run(rec, s, () => gun("down"), 200), "shoot"), 1);
  run(rec, s, wideV, 800);
  assert.equal(rec.stable, G.V_SIGN);
});

test("training emits no gesture actions and keeps the old model when cancelled", async () => {
  const rec = new GestureRecognizer(memStorage());
  const s = { t: 1000 };
  const events = [];
  let steps = 0;
  const wait = async (ms) => {
    events.push(...run(rec, s, POSES.fist, ms));
    if (++steps > 4) rec.cancelTraining();
  };
  await assert.rejects(rec.train(() => {}, { countdown: 1, recordMs: 400, wait }));
  assert.equal(count(events, "shield"), 0);
  assert.equal(rec.trained, false);
  assert.equal(rec.calibrating, false);
});
