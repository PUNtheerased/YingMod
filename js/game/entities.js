import { ENEMIES, POWERUPS } from "./defs.js";

/** Fixed-capacity object pool: reuses dead objects instead of allocating each frame. */
export class Pool {
  constructor(create, max) {
    this.create = create;
    this.max = max;
    this.items = [];
    this.free = [];
  }
  spawn() {
    if (this.items.length >= this.max) return null;
    const o = this.free.pop() ?? this.create();
    o.dead = false;
    this.items.push(o);
    return o;
  }
  sweep() {
    const a = this.items;
    let j = 0;
    for (let i = 0; i < a.length; i++) {
      const o = a[i];
      if (o.dead) this.free.push(o);
      else a[j++] = o;
    }
    a.length = j;
  }
  clear() {
    for (const o of this.items) {
      o.dead = true;
      this.free.push(o);
    }
    this.items.length = 0;
  }
  get size() {
    return this.items.length;
  }
}

let nextId = 1;

export class Bullet {
  init(x, y, vx, vy, o = {}) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.hostile = !!o.hostile;
    this.damage = o.damage ?? 1;
    this.r = o.r ?? (this.hostile ? 6 : 4);
    this.color = o.color ?? "#35E5F2";
    this.kind = o.kind ?? "bullet"; // bullet | laser | orb | spark
    this.pierce = o.pierce ?? 0;
    this.hits = 0;
    this.hitIds = this.hitIds ?? [];
    this.hitIds.length = 0;
    this.counted = false;
    this.accel = o.accel ?? 0;
    this.life = o.life ?? 8;
    return this;
  }
  update(dt, W, H) {
    if (this.accel) {
      const s = Math.hypot(this.vx, this.vy) || 1;
      this.vx += (this.vx / s) * this.accel * dt;
      this.vy += (this.vy / s) * this.accel * dt;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.life -= dt;
    if (this.life <= 0 || this.y < -40 || this.y > H + 40 || this.x < -40 || this.x > W + 40) this.dead = true;
  }
}

export class Enemy {
  init(type, x, y, mods) {
    const d = ENEMIES[type];
    this.id = nextId++;
    this.type = type;
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.r = d.r;
    this.maxHp = Math.max(1, Math.round(d.hp * mods.hp));
    this.hp = this.maxHp;
    this.score = d.score;
    this.color = d.color;
    this.speed = d.speed * mods.speed;
    this.fireMul = mods.fire;
    this.vx = 0;
    this.vy = this.speed;
    this.t = Math.random() * 6;
    this.flash = 0;
    this.state = 0;
    this.stateT = 0;
    this.shootTimer = 1 + Math.random() * 1.5;
    this.burst = 0;
    this.burstT = 0;
    this.holdY = 0;
    return this;
  }

  update(dt, g) {
    this.t += dt;
    this.stateT += dt;
    this.flash = Math.max(0, this.flash - dt);
    const H = g.H;
    switch (this.type) {
      case "drone":
        this.y += this.vy * dt;
        this.x = this.baseX + Math.sin(this.t * 2) * 30;
        break;
      case "scout":
        this.y += this.vy * dt;
        this.x = this.baseX + Math.sin(this.t * 4.2) * 80;
        break;
      case "tank":
        this.y += this.vy * dt;
        this.x = this.baseX + Math.sin(this.t * 0.6) * 20;
        this.shootTimer -= dt * this.fireMul;
        if (this.shootTimer <= 0 && this.y > 20) {
          this.shootTimer = 2.4 + Math.random();
          for (const a of [-0.25, 0, 0.25]) g.enemyFire(this.x, this.y + this.r * 0.7, Math.PI / 2 + a, 170, "orb", 8);
        }
        break;
      case "shooter":
        if (this.state === 0) {
          // fly in, then strafe at a fixed height
          if (!this.holdY) this.holdY = H * (0.14 + Math.random() * 0.2);
          this.y += this.vy * 1.6 * dt;
          if (this.y >= this.holdY) {
            this.state = 1;
            this.stateT = 0;
            this.vx = (Math.random() < 0.5 ? -1 : 1) * this.speed * 1.4;
          }
        } else {
          this.x += this.vx * dt;
          if (this.x < 40 || this.x > g.W - 40) this.vx = -this.vx;
          this.x = Math.max(40, Math.min(g.W - 40, this.x));
          this.y += Math.sin(this.t * 1.5) * 10 * dt;
          this.shootTimer -= dt * this.fireMul;
          if (this.shootTimer <= 0 && this.burst === 0) {
            this.burst = 3;
            this.burstT = 0;
            this.shootTimer = 2.2 + Math.random() * 0.8;
          }
          if (this.burst > 0) {
            this.burstT -= dt;
            if (this.burstT <= 0) {
              this.burst--;
              this.burstT = 0.12;
              g.enemyFireAt(this.x, this.y + this.r * 0.6, 240, "bullet", 5);
            }
          }
          if (this.stateT > 9) this.y += this.speed * 2 * dt;
        }
        break;
      case "kamikaze":
        if (this.state === 0) {
          if (!this.holdY) this.holdY = H * (0.15 + Math.random() * 0.15);
          this.y += this.vy * dt;
          this.x = this.baseX + Math.sin(this.t * 3) * 25;
          if (this.y >= this.holdY) {
            this.state = 1;
            this.stateT = 0;
          }
        } else if (this.state === 1) {
          // telegraph: shake and lock on before diving
          this.x += Math.sin(this.t * 60) * 1.2;
          if (this.stateT > 0.7) {
            const a = Math.atan2(g.player.y - this.y, g.player.x - this.x);
            this.vx = Math.cos(a) * this.speed * 3.6;
            this.vy = Math.sin(a) * this.speed * 3.6;
            this.state = 2;
          }
        } else {
          this.x += this.vx * dt;
          this.y += this.vy * dt;
        }
        break;
    }
    if (this.y - this.r > H + 10 || this.x < -80 || this.x > g.W + 80) {
      this.dead = true;
      this.escaped = true;
    }
  }
}

export class PowerUp {
  init(key, x, y) {
    const d = POWERUPS[key];
    this.key = key;
    this.def = d;
    this.color = d.color;
    this.x = x;
    this.y = y;
    this.r = 16;
    this.vy = 95;
    this.t = 0;
    return this;
  }
  update(dt, g) {
    this.t += dt;
    this.y += this.vy * dt;
    this.x += Math.sin(this.t * 2) * 30 * dt;
    if (this.y - this.r > g.H) this.dead = true;
  }
}

export class Particle {
  init(x, y, vx, vy, life, size, color, kind = "dot") {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.color = color;
    this.kind = kind; // dot | ring | spark | flash
    return this;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const drag = 1 - 2.5 * dt;
    this.vx *= drag;
    this.vy *= drag;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}

export class FloatText {
  init(x, y, text, color, size = 18) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.size = size;
    this.life = 1;
    return this;
  }
  update(dt) {
    this.y -= 46 * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
}
