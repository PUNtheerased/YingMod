// Synthetic 21-point hand (MediaPipe topology, meters, palm in the XY plane, fingers up).
const FINGERS = [
  { base: [-0.025, 0.085], seg: [0.04, 0.025, 0.02], spread: -0.12 },
  { base: [0, 0.09], seg: [0.045, 0.028, 0.022], spread: 0 },
  { base: [0.02, 0.085], seg: [0.042, 0.026, 0.02], spread: 0.1 },
  { base: [0.038, 0.075], seg: [0.032, 0.02, 0.018], spread: 0.22 },
];

const add = (a, d, s) => ({ x: a.x + d.x * s, y: a.y + d.y * s, z: a.z + d.z * s });

/** curl: 0 straight .. 1 fully curled. spread overrides the sideways tilt. */
function finger(curl, f, spread = f.spread) {
  const pts = [{ x: f.base[0], y: f.base[1], z: 0 }];
  const bends = [80, 100, 70].map((b) => (b * curl * Math.PI) / 180);
  let phi = 0;
  for (let i = 0; i < 3; i++) {
    phi += bends[i];
    const d = { x: Math.sin(spread) * Math.cos(phi), y: Math.cos(spread) * Math.cos(phi), z: -Math.sin(phi) };
    pts.push(add(pts[i], d, f.seg[i]));
  }
  return pts;
}

/**
 * thumb: "up" (gun, cocked), "down" (trigger pressed), "wide" (open palm),
 * "tuck" (across palm), "pinch" (tip on index tip), or a number = thumb-index distance ratio.
 */
export function makeHand({ curls = [0, 0, 0, 0], thumb = "up", spreads = [], jitter = 0, seed = 1 } = {}) {
  const fingers = FINGERS.map((f, i) => finger(curls[i], f, spreads[i] ?? f.spread));
  const p = new Array(21);
  p[0] = { x: 0, y: 0, z: 0 };
  p[1] = { x: -0.02, y: 0.02, z: 0 };
  p[2] = { x: -0.04, y: 0.04, z: 0 };
  fingers.forEach((pts, i) => pts.forEach((pt, j) => (p[5 + i * 4 + j] = pt)));
  const palm = 0.09;
  let tip;
  if (thumb === "pinch") tip = { ...p[8], x: p[8].x - 0.004 };
  else if (thumb === "tuck") tip = { x: 0.01, y: 0.05, z: -0.03 };
  else {
    const ratio = typeof thumb === "number" ? thumb : { up: 0.48, down: 0.18, wide: 0.75 }[thumb];
    tip = { x: p[5].x - ratio * palm * 0.8, y: p[5].y - ratio * palm * 0.6, z: 0 };
  }
  p[4] = tip;
  p[3] = { x: (p[2].x + tip.x) / 2, y: (p[2].y + tip.y) / 2, z: (p[2].z + tip.z) / 2 };
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2;
  const world = p.map((q) => ({ x: q.x + rnd() * jitter, y: q.y + rnd() * jitter, z: q.z + rnd() * jitter }));
  // Normalised image landmarks: hand centred in frame, y flipped.
  const landmarks = world.map((q) => ({ x: 0.5 + q.x * 3, y: 0.7 - q.y * 3, z: q.z }));
  return { landmarks, world, score: 0.98 };
}

export const POSES = {
  gunUp: () => makeHand({ curls: [0, 1, 1, 1], thumb: "up" }),
  gunDown: () => makeHand({ curls: [0, 1, 1, 1], thumb: "down" }),
  gunThumb: (r) => makeHand({ curls: [0, 1, 1, 1], thumb: r }),
  fist: () => makeHand({ curls: [1, 1, 1, 1], thumb: "tuck" }),
  open: () => makeHand({ curls: [0, 0, 0, 0], thumb: "wide", spreads: [-0.3, -0.1, 0.1, 0.3] }),
  ok: () => makeHand({ curls: [0.55, 0, 0, 0], thumb: "pinch" }),
  vsign: () => makeHand({ curls: [0, 0, 1, 1], thumb: "tuck", spreads: [-0.3, 0.25] }),
  // index + middle held together, as many people make a finger gun
  gun2Up: () => makeHand({ curls: [0, 0, 1, 1], thumb: "up", spreads: [-0.05, -0.25] }),
  gun2Down: () => makeHand({ curls: [0, 0, 1, 1], thumb: "down", spreads: [-0.05, -0.25] }),
  // one-finger gun with the middle finger only half-curled (very common, used to read as V)
  gunHalfMid: (curl = 0.4, thumb = "up") => makeHand({ curls: [0, curl, 1, 1], thumb }),
};
