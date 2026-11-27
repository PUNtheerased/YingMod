// Everything is synthesised with WebAudio: no audio files, no licensing issues.
const MAX_VOICES = 28;
const LOOKAHEAD = 0.25;

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** Minimum seconds between two plays of the same effect (prevents stacking on rapid fire). */
const THROTTLE = {
  shoot: 0.045,
  laser: 0.06,
  explode: 0.035,
  hitBoss: 0.07,
  shieldHit: 0.1,
  ui: 0.05,
  hover: 0.06,
  countdown: 0.2,
};

/** Original chord loops (MIDI root + chord tones), one chord per bar of 8 eighth-notes. */
const TRACKS = {
  menu: { bpm: 92, chords: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]], bass: [0, 4], arp: "up", drums: false, lead: 0.35 },
  game: { bpm: 128, chords: [[52, 55, 59], [48, 52, 55], [50, 54, 57], [47, 51, 54]], bass: [0, 2, 3, 4, 6, 7], arp: "updown", drums: true, lead: 0.3 },
  boss: { bpm: 150, chords: [[45, 48, 52], [46, 49, 53], [45, 48, 52], [44, 47, 50]], bass: [0, 1, 2, 3, 4, 5, 6, 7], arp: "down", drums: true, heavy: true, lead: 0.32 },
  gameover: { bpm: 70, chords: [[57, 60, 64], [53, 57, 60], [50, 53, 57], [52, 56, 59]], bass: [0], arp: "up", drums: false, lead: 0.25 },
};

export class AudioManager {
  constructor() {
    this.ctx = null;
    this.voices = 0;
    this.lastPlay = {};
    this.volumes = { master: 0.8, music: 0.5, sfx: 0.8, muted: false };
    this.track = null;
    this.wantTrack = null;
    this.nextNote = 0;
    this.step = 0;
  }

  /** Must be called from a user gesture the first time (browser autoplay policy). */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.musicBus = this.ctx.createGain();
      this.sfxBus = this.ctx.createGain();
      const comp = this.ctx.createDynamicsCompressor();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      this.noise = this.makeNoise();
      this.applyVolumes();
      if (this.wantTrack) this.playMusic(this.wantTrack);
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }

  makeNoise() {
    const len = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  setVolumes(v) {
    Object.assign(this.volumes, v);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const v = this.volumes;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(v.muted ? 0 : v.master, t, 0.02);
    this.musicBus.gain.setTargetAtTime(v.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(v.sfx, t, 0.02);
  }

  get muted() {
    return this.volumes.muted;
  }

  // ---------------------------------------------------------------- primitives

  tone({ freq, freq2, dur = 0.12, type = "square", vol = 0.12, at = 0, bus: target, attack = 0.005 }) {
    const isMusic = target === this.musicBus;
    if (!this.ctx || (!isMusic && this.voices >= MAX_VOICES)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freq2) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq2), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(target ?? this.sfxBus);
    if (!isMusic) this.voices++;
    o.onended = () => {
      g.disconnect();
      if (!isMusic) this.voices--;
    };
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  burst({ dur = 0.3, vol = 0.3, filter = 1200, filter2, type = "lowpass", at = 0, bus: target }) {
    const isMusic = target === this.musicBus;
    if (!this.ctx || (!isMusic && this.voices >= MAX_VOICES)) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filter, t);
    if (filter2) f.frequency.exponentialRampToValueAtTime(filter2, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(target ?? this.sfxBus);
    if (!isMusic) this.voices++;
    src.onended = () => {
      g.disconnect();
      if (!isMusic) this.voices--;
    };
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  // ---------------------------------------------------------------- effects

  play(name) {
    if (!this.ctx || this.volumes.muted) return;
    const now = this.ctx.currentTime;
    const gap = THROTTLE[name] ?? 0.03;
    if (now - (this.lastPlay[name] ?? -1) < gap) return;
    this.lastPlay[name] = now;
    const fx = SFX[name];
    if (fx) fx(this);
  }

  // ---------------------------------------------------------------- music

  playMusic(name) {
    this.wantTrack = name;
    if (!this.ctx) return;
    if (this.track === TRACKS[name]) return;
    this.track = TRACKS[name] ?? null;
    this.step = 0;
    this.nextNote = this.ctx.currentTime + 0.1;
  }

  stopMusic() {
    this.wantTrack = null;
    this.track = null;
  }

  /** Called every animation frame: schedules the next notes slightly ahead of time. */
  update() {
    const tr = this.track;
    if (!this.ctx || !tr || this.ctx.state !== "running") return;
    const now = this.ctx.currentTime;
    if (this.nextNote < now - 0.5) this.nextNote = now + 0.05;
    const stepDur = 60 / tr.bpm / 2;
    while (this.nextNote < now + LOOKAHEAD) {
      this.scheduleStep(tr, this.step, this.nextNote - now, stepDur);
      this.step++;
      this.nextNote += stepDur;
    }
  }

  scheduleStep(tr, step, at, dur) {
    const bar = Math.floor(step / 8) % tr.chords.length;
    const s = step % 8;
    const chord = tr.chords[bar];
    const bus = this.musicBus;
    if (tr.bass.includes(s)) {
      this.tone({ freq: midi(chord[0] - 24), dur: dur * 0.9, type: tr.heavy ? "sawtooth" : "triangle", vol: tr.heavy ? 0.16 : 0.22, at, bus });
    }
    const order = tr.arp === "down" ? [2, 1, 0, 1] : tr.arp === "updown" ? [0, 1, 2, 1] : [0, 1, 2, 0];
    const note = chord[order[s % 4]] + (s >= 4 ? 12 : 0);
    this.tone({ freq: midi(note + 12), dur: dur * 0.8, type: "square", vol: tr.lead * 0.12, at, bus, attack: 0.01 });
    if (s === 0) {
      for (const n of chord) this.tone({ freq: midi(n), dur: dur * 7.5, type: "sine", vol: 0.05, at, bus, attack: 0.3 });
    }
    if (tr.drums) {
      if (s % 4 === 0) this.tone({ freq: 140, freq2: 40, dur: 0.18, type: "sine", vol: 0.5, at, bus });
      if (s % 4 === 2 && tr.heavy) this.burst({ dur: 0.12, vol: 0.18, filter: 2500, type: "bandpass", at, bus });
      if (s % 2 === 1) this.burst({ dur: 0.04, vol: 0.06, filter: 8000, type: "highpass", at, bus });
    }
  }
}

const SFX = {
  shoot: (a) => a.tone({ freq: 880, freq2: 220, dur: 0.08, vol: 0.06 }),
  laser: (a) => {
    a.tone({ freq: 1600, freq2: 300, dur: 0.14, type: "sawtooth", vol: 0.05 });
    a.tone({ freq: 2400, freq2: 1200, dur: 0.06, type: "sine", vol: 0.04 });
  },
  explode: (a) => {
    a.burst({ dur: 0.35, vol: 0.25, filter: 1600, filter2: 120 });
    a.tone({ freq: 160, freq2: 40, dur: 0.25, type: "sine", vol: 0.18 });
  },
  hurt: (a) => {
    a.burst({ dur: 0.5, vol: 0.4, filter: 900, filter2: 80 });
    a.tone({ freq: 220, freq2: 55, dur: 0.4, type: "sawtooth", vol: 0.12 });
  },
  power: (a) => [523, 659, 784, 1047].forEach((f, i) => a.tone({ freq: f, dur: 0.1, vol: 0.07, at: i * 0.06, type: "triangle" })),
  shield: (a) => {
    a.tone({ freq: 300, freq2: 900, dur: 0.35, type: "sine", vol: 0.12 });
    a.tone({ freq: 600, freq2: 1800, dur: 0.3, type: "triangle", vol: 0.05, at: 0.05 });
  },
  shieldDown: (a) => a.tone({ freq: 900, freq2: 250, dur: 0.3, type: "sine", vol: 0.08 }),
  shieldHit: (a) => a.tone({ freq: 1200, freq2: 600, dur: 0.12, type: "triangle", vol: 0.08 }),
  bomb: (a) => {
    a.burst({ dur: 1.1, vol: 0.5, filter: 3000, filter2: 60 });
    a.tone({ freq: 90, freq2: 25, dur: 0.9, type: "sine", vol: 0.35 });
  },
  weapon: (a) => {
    a.tone({ freq: 440, dur: 0.06, type: "square", vol: 0.06 });
    a.tone({ freq: 880, dur: 0.08, type: "square", vol: 0.06, at: 0.07 });
  },
  denied: (a) => a.tone({ freq: 180, dur: 0.15, type: "square", vol: 0.06 }),
  hitBoss: (a) => a.tone({ freq: 300, freq2: 180, dur: 0.06, type: "square", vol: 0.04 }),
  bossWarn: (a) => {
    for (let i = 0; i < 4; i++) {
      a.tone({ freq: 440, freq2: 330, dur: 0.32, type: "sawtooth", vol: 0.1, at: i * 0.7 });
      a.tone({ freq: 880, freq2: 660, dur: 0.32, type: "square", vol: 0.04, at: i * 0.7 });
    }
  },
  bossAppear: (a) => {
    a.tone({ freq: 60, freq2: 120, dur: 1.2, type: "sawtooth", vol: 0.15 });
    a.burst({ dur: 1.2, vol: 0.2, filter: 200, filter2: 2000 });
  },
  bossDown: (a) => {
    for (let i = 0; i < 5; i++) a.burst({ dur: 0.6, vol: 0.35, filter: 1500, filter2: 80, at: i * 0.18 });
    [523, 659, 784, 1047, 1319].forEach((f, i) => a.tone({ freq: f, dur: 0.25, vol: 0.08, at: 0.9 + i * 0.1, type: "triangle" }));
  },
  levelUp: (a) => [392, 523, 659, 784].forEach((f, i) => a.tone({ freq: f, dur: 0.14, vol: 0.08, at: i * 0.09, type: "square" })),
  countdown: (a) => a.tone({ freq: 660, dur: 0.12, type: "square", vol: 0.07 }),
  go: (a) => a.tone({ freq: 1320, dur: 0.25, type: "square", vol: 0.08 }),
  gameover: (a) => [392, 330, 262, 196].forEach((f, i) => a.tone({ freq: f, dur: 0.35, vol: 0.1, at: i * 0.22, type: "triangle" })),
  victory: (a) => [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => a.tone({ freq: f, dur: 0.2, vol: 0.09, at: i * 0.12, type: "square" })),
  ui: (a) => a.tone({ freq: 1200, freq2: 900, dur: 0.05, type: "square", vol: 0.04 }),
  hover: (a) => a.tone({ freq: 1800, dur: 0.025, type: "sine", vol: 0.025 }),
  back: (a) => a.tone({ freq: 700, freq2: 400, dur: 0.07, type: "square", vol: 0.04 }),
};
