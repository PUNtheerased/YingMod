import { createLandmarker, confidenceOptions, packResult } from "./landmarker.js";
import { Emitter } from "../core/events.js";

const WORKER_INIT_TIMEOUT_MS = 40000;

/**
 * Camera + MediaPipe Hand Landmarker. Inference runs in a Web Worker so it never
 * blocks the game loop; falls back to the main thread if the worker can't start.
 * Emits "status" whenever model/camera state changes.
 */
export class HandTracker extends Emitter {
  constructor(video) {
    super();
    this.video = video;
    this.modelState = "idle"; // idle | loading | ready | error
    this.cameraState = "off"; // off | starting | on | denied | error | lost
    this.cameraError = "";
    this.mode = "";
    this.delegate = "";
    this.worker = null;
    this.landmarker = null;
    this.stream = null;
    this.busy = false;
    this.lastVideoTime = -1;
    this.pending = null;
    this.landmarks = null;
    this.inferMs = 0;
    this.detectFps = 0;
    this.fpsCount = 0;
    this.fpsStart = performance.now();
    this.sensitivity = 0.5;
    this.retryTimer = 0;
  }

  get ready() {
    return this.modelState === "ready";
  }

  get cameraOn() {
    return this.cameraState === "on";
  }

  setStatus(patch) {
    Object.assign(this, patch);
    this.emit("status", this);
  }

  async init(sensitivity = 0.5) {
    this.sensitivity = sensitivity;
    this.setStatus({ modelState: "loading" });
    try {
      try {
        await this.initWorker();
        this.mode = "Worker";
      } catch (err) {
        console.warn("Worker mode failed, running on main thread", err);
        const r = await createLandmarker(false, ["GPU", "CPU"], sensitivity);
        this.landmarker = r.landmarker;
        this.delegate = r.delegate;
        this.mode = "Main";
      }
      this.setStatus({ modelState: "ready" });
    } catch (err) {
      console.error(err);
      this.setStatus({ modelState: "error" });
    }
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
      worker.postMessage({ type: "init", sensitivity: this.sensitivity });
    });
  }

  setSensitivity(value) {
    this.sensitivity = value;
    if (this.worker) this.worker.postMessage({ type: "options", sensitivity: value });
    else this.landmarker?.setOptions(confidenceOptions(value)).catch(() => {});
  }

  onWorkerMessage(msg) {
    if (msg.type === "delegate") {
      this.delegate = msg.delegate;
      this.emit("status", this);
      return;
    }
    this.busy = false;
    if (msg.type === "result") this.setResult(msg);
    else if (msg.type === "error") console.error("hand worker:", msg.message);
  }

  setResult(result) {
    if (!this.cameraOn) return;
    this.inferMs = result.inferMs;
    this.landmarks = result.landmarks;
    this.pending = result;
    this.fpsCount++;
    const now = performance.now();
    if (now - this.fpsStart >= 1000) {
      this.detectFps = (this.fpsCount * 1000) / (now - this.fpsStart);
      this.fpsCount = 0;
      this.fpsStart = now;
    }
  }

  /** Must be called from a user action (button) the first time, so the browser can ask permission. */
  startCamera() {
    clearTimeout(this.retryTimer);
    if (this.cameraOn) return Promise.resolve();
    this.cameraPromise ??= this.openCamera().finally(() => (this.cameraPromise = null));
    return this.cameraPromise;
  }

  async openCamera() {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      this.setStatus({ cameraState: "error", cameraError: "insecure" });
      throw new Error("insecure");
    }
    this.setStatus({ cameraState: "starting", cameraError: "" });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 }, facingMode: "user" },
        audio: false,
      });
      this.stream = stream;
      this.video.srcObject = stream;
      await this.video.play();
      this.lastVideoTime = -1;
      stream.getVideoTracks()[0]?.addEventListener("ended", () => this.handleCameraLost());
      this.setStatus({ cameraState: "on" });
    } catch (err) {
      const denied = err?.name === "NotAllowedError" || err?.name === "SecurityError";
      const busy = err?.name === "NotReadableError" || err?.name === "AbortError";
      const notFound = err?.name === "NotFoundError" || err?.name === "OverconstrainedError";
      this.setStatus({
        cameraState: denied ? "denied" : "error",
        cameraError: denied ? "denied" : busy ? "busy" : notFound ? "notfound" : String(err?.message || err),
      });
      throw err;
    }
  }

  /** Releases the webcam completely (the browser's camera indicator turns off). */
  stopCamera() {
    clearTimeout(this.retryTimer);
    this.retryTimer = 0;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.landmarks = null;
    this.pending = null;
    this.busy = false;
    this.setStatus({ cameraState: "off", cameraError: "" });
  }

  /** The track ends when another app takes the webcam or it is unplugged; keep retrying. */
  handleCameraLost() {
    this.stream = null;
    this.video.srcObject = null;
    this.landmarks = null;
    this.setStatus({ cameraState: "lost" });
    const retry = () => {
      if (this.cameraState === "off") return;
      this.startCamera().catch(() => {
        if (this.cameraState !== "off" && this.cameraState !== "denied") this.retryTimer = setTimeout(retry, 2500);
      });
    };
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
        this.setResult(packResult(r, performance.now() - t0));
      }
    }
    const out = this.pending;
    this.pending = null;
    return out;
  }
}
