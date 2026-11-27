import { Player, Enemy, Bullet, PowerUp, Particle, FloatText } from "./entities.js";

const STEP = 1 / 120;
const HIGH_KEY = "ss_high";
const SHIP_MARGIN = 40;
const SPREAD_SECONDS = 8;

const collide = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.r + b.r;
  return dx * dx + dy * dy < r * r;
};

export class Game {
  constructor(sfx) {
    this.sfx = sfx;
    this.state = "idle"; // idle | playing | paused | over
    this.W = 800;
    this.H = 600;
    this.high = Number(localStorage.getItem(HIGH_KEY)) || 0;
    this.onGameOver = null;
    this.reset();
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this.player.y = H - 70;
  }

  reset() {
    this.player = new Player();
    this.player.x = this.W / 2;
    this.player.y = this.H - 70;
    this.player.invuln = 1.5;
    this.bullets = [];
    this.enemyBullets = [];
    this.enemies = [];
    this.powerups = [];
    this.particles = [];
    this.texts = [];
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.time = 0;
    this.acc = 0;
    this.spawnTimer = 1.2;
    this.shotCooldown = 0;
    this.shake = 0;
    this.nextPowerAt = 10 + Math.random() * 6;
  }

  start() {
    this.reset();
    this.state = "playing";
  }

  pause() {
    if (this.state === "playing") this.state = "paused";
  }

  resume() {
    if (this.state === "paused") this.state = "playing";
  }

  update(dt, input) {
    if (this.state === "paused") return;
    for (const p of this.particles) p.update(dt);
    for (const t of this.texts) t.update(dt);
    this.particles = this.particles.filter((p) => p.life > 0);
    this.texts = this.texts.filter((t) => t.life > 0);
    this.shake = Math.max(0, this.shake - dt);
    if (this.state !== "playing") return;

    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 12) {
      this.step(STEP, input);
      this.acc -= STEP;
      steps++;
    }
    if (steps >= 12) this.acc = 0;
  }

  step(dt, input) {
    const p = this.player;
    this.time += dt;
    this.level = 1 + Math.floor(this.score / 600);

    const target = SHIP_MARGIN + input.x * (this.W - SHIP_MARGIN * 2);
    const prevX = p.x;
    p.x += (target - p.x) * (1 - Math.exp(-dt * 16));
    const vx = (p.x - prevX) / dt;
    p.tilt += (Math.max(-1, Math.min(1, vx / 700)) - p.tilt) * (1 - Math.exp(-dt * 10));
    p.invuln = Math.max(0, p.invuln - dt);
    p.spread = Math.max(0, p.spread - dt);
    p.muzzle = Math.max(0, p.muzzle - dt);

    this.shotCooldown -= dt;
    if (this.shotCooldown <= 0) {
      const handShot = input.takeShot();
      if (handShot || input.holdFire) {
        this.fire();
        this.shotCooldown = handShot ? 0.1 : 0.16;
      }
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnEnemy();
      this.spawnTimer = Math.max(0.35, 1.1 - this.level * 0.07) * (0.7 + Math.random() * 0.6);
    }
    if (this.time >= this.nextPowerAt) {
      this.powerups.push(new PowerUp(60 + Math.random() * (this.W - 120), -20));
      this.nextPowerAt = this.time + 12 + Math.random() * 8;
    }

    for (const b of this.bullets) b.update(dt, this);
    for (const b of this.enemyBullets) b.update(dt, this);
    for (const e of this.enemies) e.update(dt, this);
    for (const u of this.powerups) u.update(dt, this);

    this.handleCollisions();

    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemyBullets = this.enemyBullets.filter((b) => !b.dead);
    this.enemies = this.enemies.filter((e) => !e.dead);
    this.powerups = this.powerups.filter((u) => !u.dead);
  }

  fire() {
    const p = this.player;
    const speed = 760;
    const angles = p.spread > 0 ? [-0.2, 0, 0.2] : [0];
    for (const a of angles) {
      this.bullets.push(new Bullet(p.x + a * 30, p.y - 28, Math.sin(a) * speed, -Math.cos(a) * speed));
    }
    p.muzzle = 0.06;
    this.sfx.shoot();
  }

  enemyShoot(e) {
    const p = this.player;
    const a = Math.atan2(p.y - e.y, p.x - e.x);
    const speed = 210 + this.level * 10;
    this.enemyBullets.push(new Bullet(e.x, e.y + e.r * 0.6, Math.cos(a) * speed, Math.sin(a) * speed, true));
  }

  spawnEnemy() {
    const pool = ["drone", "drone"];
    if (this.level >= 2) pool.push("zig", "zig");
    if (this.level >= 3) pool.push("diver", "diver");
    if (this.level >= 4) pool.push("tank");
    if (this.level >= 6) pool.push("tank", "diver");
    const type = pool[Math.floor(Math.random() * pool.length)];
    const pad = type === "zig" ? Math.min(110, this.W / 3) : 40;
    const x = pad + Math.random() * Math.max(1, this.W - pad * 2);
    const speedMul = 1 + (this.level - 1) * 0.1;
    this.enemies.push(new Enemy(type, x, -40, speedMul));
  }

  handleCollisions() {
    const p = this.player;
    for (const b of this.bullets) {
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || !collide(b, e)) continue;
        b.dead = true;
        e.hp--;
        e.flash = 0.08;
        if (e.hp <= 0) this.killEnemy(e);
        else this.sparks(b.x, b.y, e.color, 5);
        break;
      }
    }

    for (const u of this.powerups) {
      if (!u.dead && collide(u, p)) {
        u.dead = true;
        p.spread = SPREAD_SECONDS;
        this.texts.push(new FloatText(p.x, p.y - 40, "ยิงกระจาย!", "#3dff8a"));
        this.sfx.power();
      }
    }

    if (p.invuln > 0) return;
    for (const e of this.enemies) {
      if (!e.dead && collide(e, p)) {
        this.killEnemy(e, false);
        this.hurt();
        return;
      }
    }
    for (const b of this.enemyBullets) {
      if (!b.dead && collide(b, p)) {
        b.dead = true;
        this.hurt();
        return;
      }
    }
  }

  killEnemy(e, award = true) {
    e.dead = true;
    if (award) {
      this.score += e.score;
      this.texts.push(new FloatText(e.x, e.y, `+${e.score}`, e.color));
    }
    this.explode(e.x, e.y, e.color, e.type === "tank" ? 34 : 20);
    this.sfx.explode();
  }

  hurt() {
    const p = this.player;
    this.lives--;
    p.invuln = 2;
    p.spread = 0;
    this.shake = 0.4;
    this.explode(p.x, p.y, "#3df5ff", 26);
    this.sfx.hit();
    if (this.lives <= 0) this.gameOver();
  }

  gameOver() {
    this.state = "over";
    this.explode(this.player.x, this.player.y, "#ffd166", 50);
    const isNew = this.score > this.high;
    if (isNew) {
      this.high = this.score;
      localStorage.setItem(HIGH_KEY, String(this.high));
    }
    this.onGameOver?.({ score: this.score, high: this.high, isNew });
  }

  explode(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 280;
      this.particles.push(
        new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + Math.random() * 0.5, 2 + Math.random() * 3, color)
      );
    }
    this.particles.push(new Particle(x, y, 0, 0, 0.35, 8, color, true));
  }

  sparks(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2;
      const s = 80 + Math.random() * 160;
      this.particles.push(new Particle(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25, 2, color));
    }
  }
}
