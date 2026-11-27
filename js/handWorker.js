import { createLandmarker } from "./landmarker.js";

// GPU is not always faster: weak integrated GPUs can lose to the CPU.
// After a warm-up, if GPU is slow, time the CPU on live frames and keep the faster one.
const SAMPLE_FRAMES = 30;
const SLOW_MS = 45;

let landmarker = null;
let delegate = "";
let phase = "measure-first";
let candidate = null;
let times = [];
let firstMedian = 0;

const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

async function tryOtherDelegate() {
  phase = "switching";
  try {
    const other = delegate === "GPU" ? "CPU" : "GPU";
    candidate = await createLandmarker(true, [other]);
    times = [];
    phase = "measure-second";
  } catch {
    phase = "done";
  }
}

function record(ms) {
  if (phase !== "measure-first" && phase !== "measure-second") return;
  times.push(ms);
  if (times.length < SAMPLE_FRAMES) return;
  const m = median(times.slice(5));
  if (phase === "measure-first") {
    firstMedian = m;
    if (m > SLOW_MS) tryOtherDelegate();
    else phase = "done";
    return;
  }
  if (m < firstMedian * 0.9) {
    landmarker.close();
    landmarker = candidate.landmarker;
    delegate = candidate.delegate;
    self.postMessage({ type: "delegate", delegate });
  } else {
    candidate.landmarker.close();
  }
  candidate = null;
  phase = "done";
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (msg.type === "init") {
    try {
      const r = await createLandmarker(true);
      landmarker = r.landmarker;
      delegate = r.delegate;
      self.postMessage({ type: "ready", delegate });
    } catch (err) {
      self.postMessage({ type: "error", message: String(err?.message || err) });
    }
    return;
  }
  if (msg.type === "frame") {
    const { bitmap, ts } = msg;
    try {
      const active = phase === "measure-second" ? candidate.landmarker : landmarker;
      const t0 = performance.now();
      const r = active.detectForVideo(bitmap, ts);
      const inferMs = performance.now() - t0;
      record(inferMs);
      self.postMessage({
        type: "result",
        landmarks: r.landmarks?.[0] ?? null,
        world: r.worldLandmarks?.[0] ?? null,
        inferMs,
      });
    } catch (err) {
      self.postMessage({ type: "error", message: String(err?.message || err) });
    } finally {
      bitmap.close();
    }
  }
};
