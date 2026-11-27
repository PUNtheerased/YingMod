import { BOSSES } from "./defs.js";

const TAU = Math.PI * 2;

/** Low enough to clear the top HUD rows, high enough to leave room to dodge. */
export function bossHomeY(h, H) {
  return Math.max(h / 2 + 80, H * 0.24);
}

/** Shared boss body; subclasses implement `fight(dt, g)`. All timing is game-time driven. */
class Boss {
  constructor(type, g, hpScale) {
    this.type = type;
    this.def = BOSSES[type];
    this.name = this.def.name;
    this.color = this.def.color;
    this.w = this.def.w;
    this.h = this.def.h;
    this.maxHp = Math.round(this.def.hp * hpScale);
    this.hp = this.maxHp;
    this.score = this.def.score;
    this.x = g.W / 2;
    this.y = -this.h;
    this.homeY = bossHomeY(this.h, g.H);
    this.t = 0;
    this.flash = 0;
    this.entering = true;
    this.dead = false;
    this.timers = {};
  }

  get rage() {
    return this.hp / this.maxHp < 0.5;
  }

  /** Ellipse hit test, slightly inset so bullets must actually touch the hull. */
  hitTest(x, y, r) {
    const rx = this.w * 0.46 + r;
    const ry = this.h * 0.42 + r;
    const dx = (x - this.x) / rx;
    const dy = (y - this.y) / ry;
    return dx * dx + dy * dy < 1;
  }

  timer(name, interval, dt) {
    this.timers[name] = (this.timers[name] ?? interval) - dt;
    if (this.timers[name] <= 0) {
      this.timers[name] += interval;
      return true;
    }
    return false;
  }

  update(dt, g) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.entering) {
      this.y += (this.homeY - this.y) * Math.min(1, dt * 1.6);
      if (Math.abs(this.y - this.homeY) < 2) this.entering = false;
      return;
    }
    this.fight(dt, g);
    this.x = Math.max(this.w / 2, Math.min(g.W - this.w / 2, this.x));
  }
}

/** Sweeps left-right, fires aimed bursts; in rage adds a wide fan. */
class Destroyer extends Boss {
  fight(dt, g) {
    const range = Math.max(0, g.W / 2 - this.w / 2 - 10);
    this.x = g.W / 2 + Math.sin(this.t * (this.rage ? 0.9 : 0.6)) * range;
    this.y = this.homeY + Math.sin(this.t * 1.3) * 12;
    if (this.timer("burst", this.rage ? 1.3 : 1.7, dt)) this.burst = 5;
    if (this.burst > 0 && this.timer("burstGap", 0.09, dt)) {
      this.burst--;
      for (const side of [-1, 1]) g.enemyFireAt(this.x + side * this.w * 0.3, this.y + this.h * 0.3, 280, "bullet", 6);
    }
    if (this.rage && this.timer("fan", 2.6, dt)) {
      for (let i = -3; i <= 3; i++) g.enemyFire(this.x, this.y + this.h * 0.4, Math.PI / 2 + i * 0.16, 200, "orb", 8);
    }
  }
}

/** Fast and erratic: dashes between points, dodges incoming shots, fires radial and aimed volleys. */
class Shadow extends Boss {
  constructor(type, g, hpScale) {
    super(type, g, hpScale);
    this.tx = this.x;
    this.ty = this.homeY;
    this.dodgeCd = 0;
    this.spin = 0;
  }
  fight(dt, g) {
    this.dodgeCd -= dt;
    if (this.timer("move", this.rage ? 1.1 : 1.6, dt)) {
      this.tx = this.w / 2 + Math.random() * (g.W - this.w);
      this.ty = this.homeY * (0.7 + Math.random() * 0.8);
    }
    if (this.dodgeCd <= 0) {
      for (const b of g.bullets.items) {
        if (b.y > this.y && b.y - this.y < 170 && Math.abs(b.x - this.x) < this.w * 0.45) {
          // dodges only sometimes, otherwise the fight becomes a slog
          if (Math.random() < 0.55) this.tx = this.x + (b.x < this.x ? 1 : -1) * (this.w * 1.1);
          this.dodgeCd = this.rage ? 1.1 : 1.6;
          break;
        }
      }
    }
    const k = Math.min(1, dt * 4.5);
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    if (this.timer("radial", this.rage ? 1.5 : 2.1, dt)) {
      const n = this.rage ? 16 : 12;
      this.spin += 0.2;
      for (let i = 0; i < n; i++) g.enemyFire(this.x, this.y, this.spin + (i / n) * TAU, 170, "orb", 7);
    }
    if (this.timer("aim", 1.2, dt)) {
      for (const a of [-0.2, 0, 0.2]) g.enemyFireAt(this.x, this.y + this.h * 0.3, 330, "bullet", 5, a);
    }
  }
}

/** Huge HP; cycles ring / spiral / heavy aimed shots / minion summon. Faster cycle in rage. */
class GalacticTitan extends Boss {
  constructor(type, g, hpScale) {
    super(type, g, hpScale);
    this.pattern = 0;
    this.patternT = 0;
    this.spiral = 0;
  }
  fight(dt, g) {
    this.x = g.W / 2 + Math.sin(this.t * 0.35) * Math.max(0, g.W / 2 - this.w / 2 - 20);
    this.y = this.homeY + Math.sin(this.t * 0.8) * 10;
    this.patternT += dt;
    const len = this.rage ? 3 : 4;
    if (this.patternT > len) {
      this.patternT = 0;
      this.pattern = (this.pattern + 1) % 4;
      this.timers = {};
    }
    switch (this.pattern) {
      case 0:
        if (this.timer("ring", this.rage ? 0.9 : 1.3, dt)) {
          const n = 22;
          const off = Math.random() * TAU;
          for (let i = 0; i < n; i++) g.enemyFire(this.x, this.y, off + (i / n) * TAU, 150, "orb", 8);
        }
        break;
      case 1:
        if (this.timer("spiral", this.rage ? 0.06 : 0.09, dt)) {
          this.spiral += 0.38;
          for (const s of [0, Math.PI]) g.enemyFire(this.x, this.y + 10, this.spiral + s, 190, "bullet", 6);
        }
        break;
      case 2:
        if (this.timer("heavy", 0.7, dt)) {
          for (const side of [-1, 0, 1]) g.enemyFireAt(this.x + side * this.w * 0.35, this.y + this.h * 0.35, 260, "orb", 11);
        }
        break;
      case 3:
        if (this.timer("summon", 1.9, dt)) {
          for (const side of [-1, 1]) g.spawnMinion(this.rage ? "kamikaze" : "drone", this.x + side * this.w * 0.45, this.y + 20);
        }
        break;
    }
  }
}

const CLASSES = { destroyer: Destroyer, shadow: Shadow, titan: GalacticTitan };

export function createBoss(type, g, hpScale) {
  return new CLASSES[type](type, g, hpScale);
}
