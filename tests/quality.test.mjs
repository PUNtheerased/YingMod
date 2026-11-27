import test from "node:test";
import assert from "node:assert/strict";
import { handGeometry, pickHint } from "../js/ai/quality.js";
import { makeHand } from "./handModel.mjs";

/** Image-space landmarks: the model hand scaled to `size` and centred at (cx, cy). */
function imageHand(size, cx = 0.5, cy = 0.5) {
  const w = makeHand({ curls: [0, 1, 1, 1] }).world;
  return w.map((p) => ({ x: cx + p.x * size, y: cy + p.y * size, z: 0 }));
}

const base = { cameraOn: true, brightness: 0.5, handScore: 0.95, fps: 14 };

test("no hint when conditions are fine or the camera is off", () => {
  assert.equal(pickHint({ ...base, hand: handGeometry(imageHand(1.5)) }), null);
  assert.equal(pickHint({ ...base, cameraOn: false, brightness: 0.05 }), null);
});

test("hints for dark image, far/near hand, edge and slow detection", () => {
  assert.match(pickHint({ ...base, brightness: 0.1, hand: null }), /แสงน้อย/);
  const far = handGeometry(imageHand(0.5));
  const near = handGeometry(imageHand(5));
  assert.ok(far.palm < near.palm);
  assert.match(pickHint({ ...base, hand: far }), /ไกล/);
  assert.match(pickHint({ ...base, hand: near }), /ใกล้กล้องเกินไป/);
  assert.match(pickHint({ ...base, hand: handGeometry(imageHand(1.5, 0.03)) }), /ขอบภาพ/);
  assert.match(pickHint({ ...base, hand: handGeometry(imageHand(1.5)), handScore: 0.5 }), /ไม่ชัด/);
  assert.match(pickHint({ ...base, hand: null, fps: 5 }), /ช้า/);
});
