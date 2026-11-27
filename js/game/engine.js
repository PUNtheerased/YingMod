import { Emitter } from "../core/events.js";
import { SHIPS, WEAPONS, POWERUPS, PLAYER, LIMITS, DIFFICULTY, COLORS } from "./defs.js";
import { levelConfig, pickWeighted, FINAL_LEVEL } from "./levels.js";
import { Pool, Bullet, Enemy, PowerUp, Particle, FloatText } from "./entities.js";
import { createBoss, bossHomeY } from "./bosses.js";

const STEP = 1 / 120;
const MAX_STEPS = 10;
const SHIP_MARGIN = 36;
// Leaves room for the bottom HUD status row under the ship.
const PLAYER_Y_OFFSET = 96;
const COMBO_WINDOW = 2.5;
const INTRO_TIME = 3.2;
const CLEAR_TIME = 2;
const BOSS_WARN_TIME = 3;
const BOSS_DOWN_TIME = 3.5;

const hit = (a, b) => {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const r = a.r + b.r;
  return dx * dx + dy * dy < r * r;
};

/**
 * Pure gameplay simulation (no DOM, no audio). Talks to the outside through events:
 *  "sfx" (name), "music" (track), "end" (stats), "level" (n), "toast" ({ text, color }).
 * state: idle | running | paused | over | victory
 * phase: intro | wave | clear | bossWarn | boss | bossDown
 */
export class GameEngine extends Emitter {
  constructor() {
    super();
    this.W = 800;
    this.H = 600;
    this.state = "idle";
    this.difficulty = DIFFICULTY.normal;
    this.autoFire = false;
    this.bullets = new Pool(() => new Bullet(), LIMITS.playerBullets);
    this.enemyBullets = new Pool(() => new Bullet(), LIMITS.enemyBullets);
    this.enemies = new Pool(() => new Enemy(), LIMITS.enemies);
    this.powerups = new Pool(() => new PowerUp(), LIMITS.powerups);
    this.particles = new Pool(() => new Particle(), LIMITS.particles);
    this.texts = new Pool(() => new FloatText(), LIMITS.texts);
    this.shipId = "falcon";
    this.reset();
  }

  configure({ difficulty, autoFire } = {}) {
    if (difficulty && DIFFICULTY[difficulty] && this.state !== "running" && this.state !== "paused") {
      this.difficulty = DIFFICULTY[difficulty];
      this.difficultyId = difficulty;
    }
    if (autoFire !== undefined) this.autoFire = autoFire;
  }

  resize(W, H) {
    this.W = W;
    this.H = H;
    this.player.y = H - PLAYER_Y_OFFSET;
    if (this.boss) this.boss.homeY = bossHomeY(this.boss.h, H);
  }

  reset() {
    const ship = SHIPS[this.shipId];
    this.ship = ship;
    const hpBonus = this.difficulty === DIFFICULTY.easy ? 1 : 0;
    this.player = {
      x: this.W / 2,
      y: this.H - PLAYER_Y_OFFSET,
      r: ship.radius,
      vx: 0,
      tilt: 0,
      hp: ship.maxHp + hpBonus,
      maxHp: ship.maxHp + hpBonus,
      invuln: 0,
      muzzle: 0,
      hurtFlash: 0,
      shield: 0,
      shieldMax: 1,
      shieldCd: 0,
      multi: 0,
      rapid: 0,
      heal: 0,
      healTick: 0,
      bombs: ship.startBombs ?? PLAYER.startBombs,
      bombCd: 0,
      weapon: 0,
      alive: true,
    };
    for (const p of [this.bullets, this.enemyBullets, this.enemies, this.powerups, this.particles, this.texts]) p.clear();
    this.boss = null;
    this.score = 0;
    this.level = 1;
    this.levelCfg = null;
    this.phase = "intro";
    this.phaseT = 0;
    this.combo = 0;
    this.comboT = 0;
    this.time = 0;
    this.acc = 0;
    this.spawnT = 1;
    this.levelKills = 0;
    this.spawned = 0;
    this.shotCd = 0;
    this.queuedShot = false;
    this.shake = 0;
    this.bombFlash = 0;
    this.powerT = 14;
    this.lastCountdown = -1;
    this.stats = { shots: 0, hits: 0, kills: 0, bosses: 0, maxCombo: 0, damageTaken: 0 };
  }

  start(shipId) {
    this.shipId = SHIPS[shipId] ? shipId : "falcon";
    this.reset();
    this.state = "running";
    this.beginLevel(1);
  }

  pause() {
    if (this.state !== "running") return false;
    this.state = "paused";
    return true;
  }

  resume() {
    if (this.state !== "paused") return false;
    this.state = "running";
    return true;
  }

  get running() {
    return this.state === "running";
  }

  get comboMul() {
    return Math.min(4, 1 + Math.floor(this.combo / 5) * 0.5);
  }

  get weapon() {
    return WEAPONS[this.player.weapon];
  }

  get canFire() {
    return this.state === "running" && this.player.alive && this.phase !== "intro" && this.phase !== "bossDown";
  }

  // ---------------------------------------------------------------- actions

  queueShot() {
    if (this.canFire) this.queuedShot = true;
  }

  cycleWeapon(index) {
    if (this.state !== "running") return;
    const p = this.player;
    p.weapon = index === undefined ? (p.weapon + 1) % WEAPONS.length : index;
    this.emit("sfx", "weapon");
    this.toast(`WEAPON: ${this.weapon.name}`, this.weapon.color);
  }

  activateShield() {
    if (this.state !== "running") return false;
    const p = this.player;
    if (p.shieldCd > 0) {
      this.toast(`SHIELD COOLDOWN ${p.shieldCd.toFixed(1)}s`, COLORS.text2);
      this.emit("sfx", "denied");
      return false;
    }
    const dur = PLAYER.shieldDuration * (this.ship.shieldMul ?? 1);
    p.shield = Math.max(p.shield, dur);
    p.shieldMax = Math.max(p.shield, dur);
    p.shieldCd = PLAYER.shieldCooldown * (this.ship.shieldCooldownMul ?? 1);
    this.emit("sfx", "shield");
    this.toast("SHIELD ON", COLORS.cyan);
    return true;
  }

  useBomb() {
    if (this.state !== "running") return false;
    const p = this.player;
    if (p.bombs <= 0 || p.bombCd > 0 || this.phase === "intro") {
      this.toast(p.bombs <= 0 ? "NO BOMBS" : "BOMB COOLDOWN", COLORS.text2);
      this.emit("sfx", "denied");
      return false;
    }
    p.bombs--;
    p.bombCd = 1.5;
    this.bombFlash = 0.6;
    this.shake = Math.max(this.shake, 0.5);
    for (const e of this.enemies.items) if (!e.dead) this.killEnemy(e, true);
    for (const b of this.enemyBullets.items) b.dead = true;
    if (this.boss && !this.boss.entering && this.phase === "boss") {
      this.damageBoss(this.boss.maxHp * PLAYER.bombBossDamage, this.boss.x, this.boss.y);
    }
    this.ring(p.x, p.y, COLORS.pink, 0.7, 60);
    this.emit("sfx", "bomb");
    this.toast("BOMB!", COLORS.pink);
    return true;
  }

  toast(text, color = COLORS.text) {
    this.emit("toast", { text, color });
  }

  // ------------------------------------------------------------- levels

  beginLevel(n) {
    this.level = n;
    this.levelCfg = levelConfig(n);
    this.levelKills = 0;
    this.spawned = 0;
    this.spawnT = 0.6;
    this.lastCountdown = -1;
    this.emit("level", n);
    if (this.levelCfg.boss) {
      this.setPhase("bossWarn");
      this.emit("sfx", "bossWarn");
      this.emit("music", "boss");
    } else {
      this.setPhase("intro");
      this.emit("music", "game");
    }
  }

  setPhase(phase) {
    this.phase = phase;
    this.phaseT = 0;
  }

  updatePhase(dt) {
    this.phaseT += dt;
    const cfg = this.levelCfg;
    switch (this.phase) {
      case "intro": {
        const n = Math.ceil(INTRO_TIME - this.phaseT);
        if (this.phaseT > 1.4 && n !== this.lastCountdown && n > 0 && n <= 3) {
          this.lastCountdown = n;
          this.emit("sfx", "countdown");
        }
        if (this.phaseT >= INTRO_TIME) {
          this.setPhase("wave");
          this.emit("sfx", "go");
        }
        break;
      }
      case "wave":
        // Only kills advance the level; enemies that fly past don't count.
        if (this.levelKills < cfg.kills) {
          this.spawnT -= dt * this.difficulty.spawn;
          if (this.spawnT <= 0 && this.enemies.size < cfg.maxAlive && this.levelKills + this.enemies.size < cfg.kills + 4) {
            this.spawnEnemy(pickWeighted(cfg.pool));
            this.spawned++;
            this.spawnT = cfg.spawnEvery * (0.6 + Math.random() * 0.8);
          }
        } else if (this.enemies.size === 0) {
          this.score += Math.round(500 * this.level * this.difficulty.score);
          this.toast(`LEVEL CLEAR  +${Math.round(500 * this.level * this.difficulty.score)}`, COLORS.green);
          this.emit("sfx", "levelUp");
          this.setPhase("clear");
        }
        break;
      case "clear":
        if (this.phaseT >= CLEAR_TIME) this.beginLevel(this.level + 1);
        break;
      case "bossWarn":
        if (this.phaseT >= BOSS_WARN_TIME) {
          this.boss = createBoss(cfg.boss, this, cfg.bossScale * this.difficulty.bossHp);
          this.setPhase("boss");
          this.emit("sfx", "bossAppear");
        }
        break;
      case "boss":
        break;
      case "bossDown":
        if (this.phaseT >= BOSS_DOWN_TIME) {
          if (cfg.final) this.finish("victory");
          else this.beginLevel(this.level + 1);
        }
        break;
    }
  }

  // ------------------------------------------------------------- loop

  update(dt, input) {
    if (this.state === "paused" || this.state === "idle") return;
    this.acc += Math.min(dt, 0.1);
    let steps = 0;
    while (this.acc >= STEP && steps < MAX_STEPS) {
      this.step(STEP, input);
      this.acc -= STEP;
      steps++;
    }
    if (steps >= MAX_STEPS) this.acc = 0;
  }

  step(dt, input) {
    const over = this.state !== "running";
    for (const p of this.particles.items) p.update(dt);
    for (const t of this.texts.items) t.update(dt);
    this.particles.sweep();
    this.texts.sweep();
    this.shake = Math.max(0, this.shake - dt);
    this.bombFlash = Math.max(0, this.bombFlash - dt);
    if (over) return;

    this.time += dt;
    this.updatePhase(dt);
    if (this.state !== "running") return;
    this.updatePlayer(dt, input);

    this.comboT -= dt;
    if (this.comboT <= 0) this.combo = 0;

    if (this.phase === "wave" || this.phase === "boss") {
      this.powerT -= dt;
      if (this.powerT <= 0) {
        this.dropPowerUp(40 + Math.random() * (this.W - 80), -20);
        this.powerT = 16 + Math.random() * 8;
      }
    }

    const W = this.W;
    const H = this.H;
    for (const b of this.bullets.items) b.update(dt, W, H);
    for (const b of this.enemyBullets.items) b.update(dt, W, H);
    for (const e of this.enemies.items) e.update(dt, this);
    for (const u of this.powerups.items) u.update(dt, this);
    if (this.boss) this.boss.update(dt, this);

    this.collide();

    for (const b of this.bullets.items) {
      if (b.dead && !b.counted && b.hits > 0) {
        b.counted = true;
        this.stats.hits++;
      }
    }
    this.bullets.sweep();
    this.enemyBullets.sweep();
    this.enemies.sweep();
    this.powerups.sweep();
  }

  updatePlayer(dt, input) {
    const p = this.player;
    const ship = this.ship;
    const prevX = p.x;
    const target = input.target;
    const maxSpeed = 1100 * ship.speed;
    if (input.axis) {
      p.x += input.axis * 520 * ship.speed * dt;
    } else if (target !== null && target !== undefined) {
      const tx = SHIP_MARGIN + target * (this.W - SHIP_MARGIN * 2);
      const want = (tx - p.x) * Math.min(1, dt * 12 * Math.sqrt(ship.speed));
      p.x += Math.max(-maxSpeed * dt, Math.min(maxSpeed * dt, want));
    }
    p.x = Math.max(SHIP_MARGIN, Math.min(this.W - SHIP_MARGIN, p.x));
    p.vx = (p.x - prevX) / dt;
    p.tilt += (Math.max(-1, Math.min(1, p.vx / 700)) - p.tilt) * Math.min(1, dt * 10);

    p.invuln = Math.max(0, p.invuln - dt);
    p.muzzle = Math.max(0, p.muzzle - dt);
    p.hurtFlash = Math.max(0, p.hurtFlash - dt);
    p.shieldCd = Math.max(0, p.shieldCd - dt);
    p.bombCd = Math.max(0, p.bombCd - dt);
    if (p.shield > 0) {
      p.shield -= dt;
      if (p.shield <= 0) {
        p.shield = 0;
        this.emit("sfx", "shieldDown");
      }
    }
    p.multi = Math.max(0, p.multi - dt);
    p.rapid = Math.max(0, p.rapid - dt);
    if (p.heal > 0) {
      p.healTick -= dt;
      if (p.healTick <= 1e-6) {
        p.healTick += POWERUPS.H.tick;
        this.healPlayer(1);
      }
      p.heal = p.heal - dt <= 1e-6 ? 0 : p.heal - dt;
    }

    this.shotCd -= dt;
    if (this.canFire && this.shotCd <= 0 && (this.queuedShot || input.fireHeld || this.autoFire)) {
      this.queuedShot = false;
      this.fire();
    }
  }

  fire() {
    const p = this.player;
    const w = this.weapon;
    const ship = this.ship;
    this.shotCd = ship.fireRate * w.rate * (p.rapid > 0 ? 0.5 : 1);
    const angles = w.spread ? [...w.spread] : [0];
    if (p.multi > 0) {
      const extra = w.spread ? [-0.36, 0.36] : [-0.2, 0.2];
      angles.push(...extra);
    }
    const damage = ship.damage * w.damage;
    for (const a of angles) {
      const b = this.bullets.spawn();
      if (!b) break;
      b.init(p.x + Math.sin(a) * 24, p.y - 26, Math.sin(a) * w.speed, -Math.cos(a) * w.speed, {
        damage,
        color: w.pierceAll ? w.color : ship.pierce ? COLORS.green : w.color,
        kind: w.pierceAll ? "laser" : "bullet",
        r: w.pierceAll ? 5 : 4,
        pierce: w.pierceAll ? 99 : ship.pierce ?? 0,
      });
      this.stats.shots++;
    }
    p.muzzle = 0.07;
    this.emit("sfx", w.pierceAll ? "laser" : "shoot");
  }

  // ------------------------------------------------------------- spawning

  enemyMods() {
    const cfg = this.levelCfg;
    const d = this.difficulty;
    return {
      hp: d.enemyHp * (1 + (cfg.scale - 1) * 0.6),
      speed: d.enemySpeed * (cfg.speedScale ?? 1),
      fire: d.enemyFire * (cfg.fireScale ?? 1),
    };
  }

  spawnEnemy(type) {
    const e = this.enemies.spawn();
    if (!e) return;
    const pad = type === "scout" ? Math.min(100, this.W / 3) : 40;
    const x = pad + Math.random() * Math.max(1, this.W - pad * 2);
    e.init(type, x, -40, this.enemyMods());
  }

  spawnMinion(type, x, y) {
    if (this.enemies.size >= 12) return;
    const e = this.enemies.spawn();
    if (!e) return;
    e.init(type, x, y, { hp: this.difficulty.enemyHp, speed: this.difficulty.enemySpeed, fire: this.difficulty.enemyFire });
    e.minion = true;
  }

  enemyFire(x, y, angle, speed, kind = "bullet", r = 6) {
    const b = this.enemyBullets.spawn();
    if (!b) return;
    const s = speed * this.difficulty.enemySpeed;
    b.init(x, y, Math.cos(angle) * s, Math.sin(angle) * s, {
      hostile: true,
      r,
      kind,
      color: kind === "orb" ? COLORS.pink : COLORS.red,
    });
  }

  enemyFireAt(x, y, speed, kind, r, offset = 0) {
    const p = this.player;
    this.enemyFire(x, y, Math.atan2(p.y - y, p.x - x) + offset, speed, kind, r);
  }

  dropPowerUp(x, y, key) {
    if (!key) {
      const p = this.player;
      const weights = { S: 3, F: 3, B: 2, H: p.hp < p.maxHp ? 3 : 0.5, X: p.bombs < PLAYER.maxBombs ? 1.2 : 0 };
      key = pickWeighted(weights);
    }
    const u = this.powerups.spawn();
    if (u) u.init(key, Math.max(30, Math.min(this.W - 30, x)), y);
  }

  // ------------------------------------------------------------- collisions

  collide() {
    const p = this.player;
    for (const b of this.bullets.items) {
      if (b.dead) continue;
      for (const e of this.enemies.items) {
        if (e.dead || !hit(b, e) || b.hitIds.includes(e.id)) continue;
        b.hitIds.push(e.id);
        b.hits++;
        e.hp -= b.damage;
        e.flash = 0.08;
        if (e.hp <= 0) this.killEnemy(e, true);
        else this.sparks(b.x, b.y, e.color, 4);
        if (b.hits > b.pierce) {
          b.dead = true;
          break;
        }
      }
      const boss = this.boss;
      if (!b.dead && boss && !boss.entering && boss.hitTest(b.x, b.y, b.r)) {
        b.hits++;
        b.dead = true;
        this.damageBoss(b.damage, b.x, b.y);
      }
    }

    for (const u of this.powerups.items) {
      if (!u.dead && hit(u, p)) {
        u.dead = true;
        this.applyPowerUp(u.key);
      }
    }

    if (!p.alive) return;
    for (const e of this.enemies.items) {
      if (!e.dead && hit(e, p)) {
        this.killEnemy(e, false);
        this.hurtPlayer();
      }
    }
    for (const b of this.enemyBullets.items) {
      if (!b.dead && hit(b, p)) {
        b.dead = true;
        this.hurtPlayer();
      }
    }
    if (this.boss && !this.boss.entering && this.boss.hitTest(p.x, p.y, p.r * 0.6)) this.hurtPlayer();
  }

  killEnemy(e, award) {
    e.dead = true;
    if (award) {
      this.combo++;
      this.comboT = COMBO_WINDOW;
      this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
      this.stats.kills++;
      if (!e.minion) this.levelKills++;
      const pts = Math.round(e.score * this.comboMul * this.difficulty.score);
      this.score += pts;
      this.floatText(e.x, e.y, `+${pts}`, e.color);
      const chance = e.type === "tank" ? 0.35 : e.type === "shooter" ? 0.12 : 0.06;
      if (Math.random() < chance) this.dropPowerUp(e.x, e.y);
    }
    this.explode(e.x, e.y, e.color, e.type === "tank" ? 34 : 18);
    this.emit("sfx", "explode");
  }

  damageBoss(amount, x, y) {
    const boss = this.boss;
    if (!boss || boss.dead) return;
    boss.hp -= amount;
    boss.flash = 0.06;
    this.sparks(x, y, boss.color, 3);
    this.emit("sfx", "hitBoss");
    if (boss.hp <= 0) this.defeatBoss();
  }

  defeatBoss() {
    const boss = this.boss;
    boss.hp = 0;
    boss.dead = true;
    this.stats.bosses++;
    const pts = Math.round(boss.score * this.difficulty.score);
    this.score += pts;
    for (let i = 0; i < 6; i++) {
      this.explode(boss.x + (Math.random() - 0.5) * boss.w, boss.y + (Math.random() - 0.5) * boss.h, i % 2 ? boss.color : COLORS.yellow, 26);
    }
    this.ring(boss.x, boss.y, boss.color, 0.9, 80);
    this.shake = 0.8;
    for (const b of this.enemyBullets.items) b.dead = true;
    for (const e of this.enemies.items) if (!e.dead) this.killEnemy(e, false);
    const p = this.player;
    p.hp = Math.min(p.maxHp, p.hp + 1);
    p.bombs = Math.min(PLAYER.maxBombs, p.bombs + 1);
    this.dropPowerUp(boss.x, boss.y, "S");
    this.floatText(boss.x, boss.y, `+${pts}`, COLORS.yellow, 30);
    this.toast("BOSS DEFEATED  +1 HP  +1 BOMB", COLORS.green);
    this.boss = null;
    this.setPhase("bossDown");
    this.emit("sfx", "bossDown");
    this.emit("music", "game");
  }

  applyPowerUp(key) {
    const p = this.player;
    const d = POWERUPS[key];
    const mul = this.ship.powerupMul ?? 1;
    switch (key) {
      case "S":
        p.multi = Math.max(p.multi, d.duration * mul);
        break;
      case "F":
        p.rapid = Math.max(p.rapid, d.duration * mul);
        break;
      case "B":
        p.shield = Math.max(p.shield, d.duration * mul);
        p.shieldMax = Math.max(p.shieldMax, p.shield);
        break;
      case "H":
        this.healPlayer(1);
        p.heal = Math.max(p.heal, d.duration * mul);
        p.healTick = d.tick;
        break;
      case "X":
        p.bombs = Math.min(PLAYER.maxBombs, p.bombs + 1);
        break;
    }
    this.floatText(p.x, p.y - 40, d.name, d.color);
    this.emit("sfx", "power");
  }

  /** Heals up to `n` HP; HP that would overflow max HP is converted to score. */
  healPlayer(n) {
    const p = this.player;
    if (!p.alive) return;
    const gained = Math.min(n, p.maxHp - p.hp);
    p.hp += gained;
    if (gained > 0) {
      this.floatText(p.x, p.y - 26, `+${gained} HP`, COLORS.green);
      this.sparks(p.x, p.y, COLORS.green, 10);
    } else {
      this.score += 300 * n;
    }
  }

  hurtPlayer() {
    const p = this.player;
    if (p.invuln > 0 || !p.alive) return;
    if (p.shield > 0) {
      p.invuln = 0.25;
      this.sparks(p.x, p.y - 10, COLORS.cyan, 8);
      this.emit("sfx", "shieldHit");
      return;
    }
    p.hp -= 1;
    this.stats.damageTaken++;
    p.invuln = this.ship.invulnAfterHit ?? PLAYER.invulnAfterHit;
    p.hurtFlash = 0.35;
    p.multi = 0;
    this.combo = 0;
    this.shake = Math.max(this.shake, 0.4);
    this.explode(p.x, p.y, this.ship.color, 22);
    this.emit("sfx", "hurt");
    if (p.hp <= 0) {
      p.alive = false;
      this.explode(p.x, p.y, COLORS.yellow, 50);
      this.finish("over");
    }
  }

  finish(result) {
    this.state = result === "victory" ? "victory" : "over";
    this.emit("sfx", result === "victory" ? "victory" : "gameover");
    this.emit("music", result === "victory" ? "menu" : "gameover");
    const s = this.stats;
    this.emit("end", {
      result,
      score: this.score,
      level: this.level,
      kills: s.kills,
      bosses: s.bosses,
      accuracy: s.shots ? s.hits / s.shots : 0,
      maxCombo: s.maxCombo,
      time: this.time,
      ship: this.shipId,
      difficulty: this.difficultyId ?? "normal",
    });
  }

  // ------------------------------------------------------------- effects

  explode(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 280;
      this.particles.spawn()?.init(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + Math.random() * 0.5, 2 + Math.random() * 3, color);
    }
    this.particles.spawn()?.init(x, y, 0, 0, 0.35, 10, color, "ring");
    this.particles.spawn()?.init(x, y, 0, 0, 0.15, 30, "#ffffff", "flash");
  }

  ring(x, y, color, life, size) {
    this.particles.spawn()?.init(x, y, 0, 0, life, size, color, "ring");
  }

  sparks(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const s = 80 + Math.random() * 180;
      this.particles.spawn()?.init(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25, 2, color, "spark");
    }
  }

  floatText(x, y, text, color, size) {
    this.texts.spawn()?.init(x, y, text, color, size);
  }
}

export { FINAL_LEVEL };
