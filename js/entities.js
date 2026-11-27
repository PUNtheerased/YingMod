export class Player {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.r = 22;
    this.tilt = 0;
    this.invuln = 0;
    this.spread = 0;
    this.muzzle = 0;
  }
}

export const ENEMY_TYPES = {
  drone: { r: 18, hp: 1, score: 100, speed: 110, color: "#ff4d6d" },
  zig: { r: 16, hp: 1, score: 150, speed: 125, color: "#ffb703" },
  diver: { r: 15, hp: 1, score: 200, speed: 80, color: "#c77dff" },
  tank: { r: 28, hp: 4, score: 400, speed: 55, color: "#4cc9f0" },
};

export class Enemy {
  constructor(type, x, y, speedMul) {
    const def = ENEMY_TYPES[type];
    this.type = type;
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.r = def.r;
    this.hp = def.hp;
    this.maxHp = def.hp;
    this.score = def.score;
    this.color = def.color;
    this.vy = def.speed * speedMul;
    this.t = Math.random() * 6;
    this.flash = 0;
    this.shootTimer = 1.2 + Math.random() * 1.5;
    this.dead = false;
  }

  update(dt, game) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    switch (this.type) {
      case "drone":
        this.y += this.vy * dt;
        this.x = this.baseX + Math.sin(this.t * 2) * 30;
        break;
      case "zig":
        this.y += this.vy * dt;
        this.x = this.baseX + Math.sin(this.t * 3.5) * 90;
        break;
      case "diver": {
        const dx = game.player.x - this.x;
        this.x += Math.sign(dx) * Math.min(Math.abs(dx), 110 * dt);
        this.vy += 140 * dt;
        this.y += this.vy * dt;
        break;
      }
      case "tank":
        this.y += this.vy * dt;
        this.shootTimer -= dt;
        if (this.shootTimer <= 0 && this.y > 0) {
          game.enemyShoot(this);
          this.shootTimer = 1.6 + Math.random();
        }
        break;
    }
    if (this.y - this.r > game.H) this.dead = true;
  }
}

export class Bullet {
  constructor(x, y, vx, vy, hostile = false) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.hostile = hostile;
    this.r = hostile ? 6 : 4;
    this.dead = false;
  }

  update(dt, game) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -30 || this.y > game.H + 30 || this.x < -30 || this.x > game.W + 30) this.dead = true;
  }
}

export class PowerUp {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.r = 15;
    this.vy = 110;
    this.t = 0;
    this.dead = false;
  }

  update(dt, game) {
    this.t += dt;
    this.y += this.vy * dt;
    this.x += Math.sin(this.t * 2) * 30 * dt;
    if (this.y - this.r > game.H) this.dead = true;
  }
}

export class Particle {
  constructor(x, y, vx, vy, life, size, color, ring = false) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.color = color;
    this.ring = ring;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx *= 1 - 2.5 * dt;
    this.vy *= 1 - 2.5 * dt;
    this.life -= dt;
  }
}

export class FloatText {
  constructor(x, y, text, color) {
    this.x = x;
    this.y = y;
    this.text = text;
    this.color = color;
    this.life = 0.9;
  }

  update(dt) {
    this.y -= 50 * dt;
    this.life -= dt;
  }
}
