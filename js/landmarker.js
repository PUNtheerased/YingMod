// Shared by the main thread and the worker, so it must not touch the DOM.
export const MP_VERSION = "1.2.3";
export const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
export const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const OPTIONS = {
  runningMode: "VIDEO",
  numHands: 1,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.4,
  minTrackingConfidence: 0.4,
};

/** Loads the library, WASM and model from the CDN. Tries the delegates in order. */
export async function createLandmarker(useModuleLoader, delegates = ["GPU", "CPU"]) {
  const { FilesetResolver, HandLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
  const vision = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`, useModuleLoader);
  for (const delegate of delegates) {
    try {
      const landmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate },
        ...OPTIONS,
      });
      return { landmarker, delegate };
    } catch (err) {
      if (delegate === delegates[delegates.length - 1]) throw err;
      console.warn("GPU delegate unavailable, falling back to CPU", err);
    }
  }
}
