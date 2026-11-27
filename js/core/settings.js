import { Emitter } from "./events.js";
import { storage } from "./storage.js";

export const DEFAULT_SETTINGS = {
  audio: { master: 0.8, music: 0.5, sfx: 0.8, muted: false },
  gameplay: { difficulty: "normal", sensitivity: 1, autoFire: false, damageFx: true, screenShake: true },
  ai: {
    // Preference only: the camera is still opened exclusively from a user click (START / TURN ON CAMERA).
    cameraEnabled: true,
    trackingSensitivity: 0.5,
    gestureCooldown: 1,
    showGuide: true,
    showLandmarks: true,
    mirror: true,
  },
  display: { quality: "high", reduceMotion: false },
};

function mergeKnown(defaults, saved) {
  const out = {};
  for (const [k, v] of Object.entries(defaults)) {
    if (v && typeof v === "object") out[k] = mergeKnown(v, saved?.[k]);
    else out[k] = saved && typeof saved[k] === typeof v ? saved[k] : v;
  }
  return out;
}

/** Persistent settings. Emits "change" with { path, value }. */
export class Settings extends Emitter {
  constructor() {
    super();
    this.data = mergeKnown(DEFAULT_SETTINGS, storage.get("settings", {}));
  }

  get(path) {
    return path.split(".").reduce((o, k) => o?.[k], this.data);
  }

  set(path, value) {
    const keys = path.split(".");
    const last = keys.pop();
    const obj = keys.reduce((o, k) => o[k], this.data);
    if (obj[last] === value) return;
    obj[last] = value;
    storage.set("settings", this.data);
    this.emit("change", { path, value });
  }

  reset() {
    this.data = mergeKnown(DEFAULT_SETTINGS, {});
    storage.set("settings", this.data);
    this.emit("change", { path: "*", value: null });
  }
}
