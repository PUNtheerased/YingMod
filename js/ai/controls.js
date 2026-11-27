const KEY_ACTIONS = {
  KeyQ: "weapon",
  KeyE: "weapon",
  Digit1: "weapon:0",
  Digit2: "weapon:1",
  Digit3: "weapon:2",
  KeyB: "bomb",
  KeyX: "bomb",
  KeyC: "shield",
  ShiftLeft: "shield",
  ShiftRight: "shield",
  KeyP: "pause",
  Escape: "pause",
  KeyM: "mute",
};
const MOVE_KEYS = ["ArrowLeft", "ArrowRight", "KeyA", "KeyD"];
const POINTER_IDLE_MS = 2500;

/**
 * Merges keyboard, mouse/touch and hand position into one control state.
 * Discrete actions are queued and drained once per frame by the game loop.
 */
export class Controls {
  constructor(canvas) {
    this.canvas = canvas;
    this.ac = new AbortController();
    this.keys = new Set();
    this.actions = [];
    this.pointerDown = false;
    this.pointerX = 0.5;
    this.pointerAt = -1e9;
    this.handPresent = false;
    this.handX = 0.5;
    this.handSensitivity = 1;
    this.bind();
  }

  bind() {
    const o = { signal: this.ac.signal };
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.target.closest?.("input, select, textarea")) return;
        if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
        this.keys.add(e.code);
        if (!e.repeat && KEY_ACTIONS[e.code]) this.actions.push(KEY_ACTIONS[e.code]);
      },
      o,
    );
    window.addEventListener("keyup", (e) => this.keys.delete(e.code), o);
    window.addEventListener("blur", () => {
      this.keys.clear();
      this.pointerDown = false;
    }, o);

    const toX = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    };
    this.canvas.addEventListener("pointermove", (e) => {
      this.pointerX = toX(e);
      this.pointerAt = performance.now();
    }, o);
    this.canvas.addEventListener("pointerdown", (e) => {
      this.pointerX = toX(e);
      this.pointerAt = performance.now();
      this.pointerDown = true;
      this.canvas.setPointerCapture?.(e.pointerId);
    }, o);
    const up = () => (this.pointerDown = false);
    this.canvas.addEventListener("pointerup", up, o);
    this.canvas.addEventListener("pointercancel", up, o);
  }

  push(action) {
    this.actions.push(action);
  }

  drain() {
    const a = this.actions;
    this.actions = [];
    return a;
  }

  setHand(present, x) {
    this.handPresent = present;
    if (present) this.handX = x;
  }

  /** Hand x 0..1 mapped so the middle of the camera covers the whole screen (higher sensitivity = less movement needed). */
  get handTarget() {
    const half = 0.36 / this.handSensitivity;
    return Math.max(0, Math.min(1, (this.handX - 0.5) / (2 * half) + 0.5));
  }

  /** Absolute target x (0..1) or null when only keys / nothing is steering. */
  target(now) {
    if (this.handPresent) return this.handTarget;
    if (now - this.pointerAt < POINTER_IDLE_MS || this.pointerDown) return this.pointerX;
    return null;
  }

  get axis() {
    let a = 0;
    if (this.keys.has("ArrowLeft") || this.keys.has("KeyA")) a -= 1;
    if (this.keys.has("ArrowRight") || this.keys.has("KeyD")) a += 1;
    return a;
  }

  get keyboardSteering() {
    return MOVE_KEYS.some((k) => this.keys.has(k));
  }

  get fireHeld() {
    return this.keys.has("Space") || this.pointerDown;
  }

  clearHeld() {
    this.keys.clear();
    this.pointerDown = false;
    this.actions = [];
  }

  destroy() {
    this.ac.abort();
  }
}
