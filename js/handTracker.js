import { createLandmarker } from "./landmarker.js";

const WORKER_INIT_TIMEOUT_MS = 40000;

/**
 * Runs Hand Landmarker in a Web Worker so inference never blocks the game loop.
 * Falls back to running on the main thread if the worker can't start.
 */
export class HandTracker {
  constructor(video) {
    this.video = video;
    this.ready = false;
    this.cameraOn = false;
    this.mode = "";
    this.delegate = "";
    this.worker = null;
    this.landmarker = null;
    this.busy = false;
    this.lastVideoTime = -1;
    this.pending = null;
    this.landmarks = null;
    this.world = null;
    this.inferMs = 0;
    this.detectFps = 0;
    this.fpsCount = 0;
    this.fpsStart = performance.now();
  }

  async init() {
    try {
      await this.initWorker();
      this.mode = "Worker";
    } catch (err) {
      console.warn("Worker mode failed, running on main thread", err);
      const r = await createLandmarker(false);
      this.landmarker = r.landmarker;
      this.delegate = r.delegate;
      this.mode = "Main";
    }
    this.ready = true;
  }

  initWorker() {
    if (typeof Worker === "undefined" || typeof createImageBitmap === "undefined") {
      return Promise.reject(new Error("Worker or createImageBitmap not supported"));
    }
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL("./handWorker.js", import.meta.url), { type: "module" });
      const fail = (err) => {
        clearTimeout(timer);
        worker.terminate();
        reject(err);
      };
      const timer = setTimeout(() => fail(new Error("worker init timeout")), WORKER_INIT_TIMEOUT_MS);
      worker.onerror = (e) => fail(new Error(e.message || "worker error"));
      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === "ready") {
          clearTimeout(timer);
          this.delegate = msg.delegate;
          this.worker = worker;
          worker.onerror = (ev) => console.error("hand worker error", ev.message);
          worker.onmessage = (ev) => this.onWorkerMessage(ev.data);
          resolve();
        } else if (msg.type === "error") {
          fail(new Error(msg.message));
        }
      };
      worker.postMessage({ type: "init" });
    });
  }

  onWorkerMessage(msg) {
    if (msg.type === "delegate") {
      this.delegate = msg.delegate;
      return;
    }
    this.busy = false;
    if (msg.type === "result") {
      this.inferMs = msg.inferMs;
      this.setResult(msg.landmarks, msg.world);
    } else if (msg.type === "error") {
      console.error("hand worker:", msg.message);
    }
  }

  setResult(landmarks, world) {
    this.landmarks = landmarks;
    this.world = world;
    this.pending = { landmarks, world };
    this.fpsCount++;
    const now = performance.now();
    if (now - this.fpsStart >= 1000) {
      this.detectFps = (this.fpsCount * 1000) / (now - this.fpsStart);
      this.fpsCount = 0;
      this.fpsStart = now;
    }
  }

  startCamera() {
    if (this.cameraOn) return Promise.resolve();
    this.cameraPromise ??= this.openCamera().finally(() => (this.cameraPromise = null));
    return this.cameraPromise;
  }

  async openCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("เบราว์เซอร์นี้ไม่รองรับกล้อง (ต้องเปิดผ่าน https หรือ localhost)");
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: "user" },
      audio: false,
    });
    this.video.srcObject = stream;
    await this.video.play();
    this.cameraOn = true;
    this.lastVideoTime = -1;
    stream.getVideoTracks()[0]?.addEventListener("ended", () => this.handleCameraLost());
  }

  /** The track ends when another app takes the webcam or it is unplugged; keep retrying. */
  handleCameraLost() {
    this.cameraOn = false;
    this.landmarks = null;
    this.world = null;
    this.video.srcObject = null;
    const retry = () =>
      this.startCamera().catch(() => {
        this.retryTimer = setTimeout(retry, 2000);
      });
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(retry, 1000);
  }

  get aspect() {
    return (this.video.videoWidth || 4) / (this.video.videoHeight || 3);
  }

  /** Call every frame. Sends a new camera frame when idle; returns a result once per finished detection. */
  pump(now) {
    if (!this.ready || !this.cameraOn) return null;
    const v = this.video;
    if (!this.busy && v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      if (this.worker) {
        this.busy = true;
        createImageBitmap(v)
          .then((bitmap) => this.worker.postMessage({ type: "frame", bitmap, ts: performance.now() }, [bitmap]))
          .catch(() => (this.busy = false));
      } else {
        const t0 = performance.now();
        const r = this.landmarker.detectForVideo(v, now);
        this.inferMs = performance.now() - t0;
        this.setResult(r.landmarks?.[0] ?? null, r.worldLandmarks?.[0] ?? null);
      }
    }
    const out = this.pending;
    this.pending = null;
    return out;
  }
}
