const MUTE_KEY = "ss_muted";

/** Synthesized sound effects (no audio files). */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.muted = localStorage.getItem(MUTE_KEY) === "1";
  }

  /** Must be called from a user gesture before sounds can play. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.35;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }

  get ok() {
    return this.ctx && this.ctx.state === "running" && !this.muted;
  }

  tone(type, f0, f1, dur, vol, delay = 0) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  burst(dur, vol, f0, f1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(f0, t);
    filter.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  shoot() {
    this.tone("square", 880, 260, 0.09, 0.18);
  }

  explode() {
    this.burst(0.45, 0.6, 1800, 120);
  }

  hit() {
    this.tone("sawtooth", 220, 40, 0.45, 0.4);
    this.burst(0.3, 0.5, 900, 100);
  }

  power() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone("triangle", f, f, 0.12, 0.25, i * 0.07));
  }
}
