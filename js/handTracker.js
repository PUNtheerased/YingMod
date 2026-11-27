const MP_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

export class HandTracker {
  constructor(video) {
    this.video = video;
    this.landmarker = null;
    this.ready = false;
    this.cameraOn = false;
    this.delegate = "";
    this.lastVideoTime = -1;
    this.landmarks = null;
    this.inferMs = 0;
  }

  async init() {
    const { FilesetResolver, HandLandmarker } = await import(`${MP_BASE}/vision_bundle.mjs`);
    const vision = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
    const options = (delegate) => ({
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      this.landmarker = await HandLandmarker.createFromOptions(vision, options("GPU"));
      this.delegate = "GPU";
    } catch (err) {
      console.warn("GPU delegate unavailable, falling back to CPU", err);
      this.landmarker = await HandLandmarker.createFromOptions(vision, options("CPU"));
      this.delegate = "CPU";
    }
    this.ready = true;
  }

  async startCamera() {
    if (this.cameraOn) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("เบราว์เซอร์นี้ไม่รองรับกล้อง (ต้องเปิดผ่าน https หรือ localhost)");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
    this.cameraOn = true;
  }

  get aspect() {
    return (this.video.videoWidth || 4) / (this.video.videoHeight || 3);
  }

  /** Runs detection when a new camera frame is available. Returns null if nothing new. */
  detect(now) {
    if (!this.ready || !this.cameraOn) return null;
    const v = this.video;
    if (v.readyState < 2 || v.currentTime === this.lastVideoTime) return null;
    this.lastVideoTime = v.currentTime;
    const t0 = performance.now();
    const result = this.landmarker.detectForVideo(v, now);
    this.inferMs = performance.now() - t0;
    this.landmarks = result.landmarks?.[0] ?? null;
    return { landmarks: this.landmarks };
  }
}
