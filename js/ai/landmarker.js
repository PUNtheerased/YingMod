// Shared by the main thread and the worker, so it must not touch the DOM.
export const MP_VERSION = "1.2.3";
export const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
export const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

/** Maps the 0..1 "tracking sensitivity" setting to MediaPipe confidence options. */
export function confidenceOptions(sensitivity = 0.5) {
  const c = Math.max(0.25, Math.min(0.8, 0.7 - sensitivity * 0.4));
  return {
    minHandDetectionConfidence: c + 0.1,
    minHandPresenceConfidence: c,
    minTrackingConfidence: c,
  };
}

/** Loads the library, WASM and model from the CDN. Tries the delegates in order. */
export async function createLandmarker(useModuleLoader, delegates = ["GPU", "CPU"], sensitivity = 0.5) {
  const { FilesetResolver, HandLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
  const vision = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`, useModuleLoader);
  for (const delegate of delegates) {
    try {
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        runningMode: "VIDEO",
        numHands: 1,
        ...confidenceOptions(sensitivity),
      });
      return { landmarker, delegate };
    } catch (err) {
      if (delegate === delegates[delegates.length - 1]) throw err;
      console.warn("GPU delegate unavailable, falling back to CPU", err);
    }
  }
}

/** Plain-object result that can cross the worker boundary. */
export function packResult(r, inferMs) {
  return {
    landmarks: r.landmarks?.[0] ?? null,
    world: r.worldLandmarks?.[0] ?? null,
    score: r.handedness?.[0]?.[0]?.score ?? null,
    inferMs,
  };
}
