import { buildSprites, drawShip, FONT } from "./sprites.js";
import { COLORS, ENEMIES, SHIPS } from "../game/defs.js";
import { levelConfig } from "../game/levels.js";

const TAU = Math.PI * 2;
const THAI = '"Noto Sans Thai", "Rajdhani", sans-serif';
const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
const NEW_ENEMY = { 2: "scout", 3: "shooter", 4: ["tank", "kamikaze"] };
const MAX_TOASTS = 4;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.W = 0;
    this.H = 0;
    this.t = 0;
    this.stars = [];
    this.sprites = {};
    this.toasts = [];
    this.quality = "high";
    this.reduceMotion = false;
    this.screenShake = true;
    this.damageFx = true;
  }

  configure({ quality, reduceMotion, screenShake, damageFx }) {
    const rebuild = quality !== undefined && quality !== this.quality;
    if (quality !== undefined) this.quality = quality;
    if (reduceMotion !== undefined) this.reduceMotion = reduceMotion;
    if (screenShake !== undefined) this.screenShake = screenShake;
    if (damageFx !== undefined) this.damageFx = damageFx;
    if (rebuild && this.W) this.resize();
  }

  resize() {
    const maxDpr = this.quality === "low" ? 1 : 1.5;
    const dpr = Math.min(maxDpr, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.makeStars();
    this.makeBackground();
    this.sprites = buildSprites(dpr);
  }

  toast(text, color) {
    this.toasts.push({ text, color, life: 1.8 });
    if (this.toasts.length > MAX_TOASTS) this.toasts.shift();
  }

  makeBackground() {
    const { W, H, dpr } = this;
    const c = document.createElement("canvas");
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, COLORS.bg);
    bg.addColorStop(1, COLORS.bg2);
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    for (const [x, y, r, col] of [
      [0.2, 0.3, 0.5, "rgba(151,101,255,0.16)"],
      [0.85, 0.75, 0.45, "rgba(67,138,255,0.13)"],
      [0.6, 0.1, 0.3, "rgba(255,79,195,0.07)"],
    ]) {
      const n = g.createRadialGradient(W * x, H * y, 0, W * x, H * y, W * r);
      n.addColorStop(0, col);
      n.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = n;
      g.fillRect(0, 0, W, H);
    }
    this.bg = c;
  }

  makeStars() {
    const area = Math.min(2, (this.W * this.H) / (1280 * 720));
    const density = this.quality === "low" ? 0.5 : 1;
    const layers = [
      [70, 18, 1, "#7f8cff"],
      [45, 45, 1.6, "#bfe9ff"],
      [22, 110, 2.2, "#ffffff"],
    ];
    this.stars = [];
    for (const [n, speed, size, c] of layers) {
      for (let i = 0; i < n * area * density; i++) {
        this.stars.push({
          x: Math.random() * this.W,
          y: Math.random() * this.H,
          speed: speed * (0.8 + Math.random() * 0.4),
          size,
          c,
          a: 0.4 + Math.random() * 0.6,
        });
      }
    }
  }

  sprite(name, x, y, rot = 0, scale = 1) {
    const sp = this.sprites[name];
    if (!sp) return;
    const w = sp.w * scale;
    const h = sp.h * scale;
    if (!rot) {
      this.ctx.drawImage(sp.c, x - w / 2, y - h / 2, w, h);
      return;
    }
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(sp.c, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  /** Background + starfield only (menus). */
  drawBackdrop(dt, speedMul) {
    const { ctx, W, H } = this;
    ctx.drawImage(this.bg, 0, 0, W, H);
    const mul = this.reduceMotion ? speedMul * 0.3 : speedMul;
    for (const s of this.stars) {
      s.y += s.speed * dt * mul;
      if (s.y > H) {
        s.y -= H;
        s.x = Math.random() * W;
      }
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, s.size, s.speed > 80 && !this.reduceMotion ? s.size * 3 : s.size);
    }
    ctx.globalAlpha = 1;
  }

  draw(game, dt) {
    const { ctx } = this;
    this.t += dt;
    const active = game.state === "running";
    const starSpeed = game.state === "paused" ? 0 : active ? 1 + (game.level - 1) * 0.05 + (game.phase === "boss" ? 0.6 : 0) : 0.35;
    this.drawBackdrop(dt, starSpeed);
    for (const t of this.toasts) t.life -= dt;
    this.toasts = this.toasts.filter((t) => t.life > 0);
    if (game.state === "idle") return;

    ctx.save();
    if (game.shake > 0 && this.screenShake && !this.reduceMotion && game.state !== "paused") {
      const m = game.shake * 14;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    for (const u of game.powerups.items) {
      const pulse = 1 + Math.sin(u.t * 6) * 0.08;
      ctx.globalAlpha = 0.25;
      this.sprite(`power_${u.key}`, u.x, u.y, 0, pulse * 1.5);
      ctx.globalAlpha = 1;
      this.sprite(`power_${u.key}`, u.x, u.y, 0, pulse);
    }
    for (const e of game.enemies.items) this.drawEnemy(e);
    if (game.boss) this.drawBoss(game.boss);
    this.drawPlayerBullets(game);
    for (const b of game.enemyBullets.items) this.sprite(b.kind === "orb" ? "enemy_orb" : "enemy_bullet", b.x, b.y, 0, b.r / (b.kind === "orb" ? 8 : 6));
    if (game.player.alive) this.drawPlayer(game);
    this.drawParticles(game);
    this.drawTexts(game);
    ctx.restore();

    this.drawScreenFx(game);
    this.drawBanner(game);
    this.drawToasts();
  }

  drawPlayer(game) {
    const p = game.player;
    if (p.invuln > 0.3 && p.shield <= 0 && Math.floor(p.invuln * 12) % 2 === 0) return;
    const { ctx } = this;
    const scale = p.r / 20;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.tilt * 0.3);
    const fl = 16 + Math.sin(this.t * 40) * 5;
    const flame = ctx.createLinearGradient(0, 16, 0, 20 + fl);
    flame.addColorStop(0, "rgba(255,240,160,1)");
    flame.addColorStop(0.5, "rgba(255,120,40,0.8)");
    flame.addColorStop(1, "rgba(255,60,120,0)");
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-8 * scale, 18 * scale);
    ctx.lineTo(8 * scale, 18 * scale);
    ctx.lineTo(0, (20 + fl) * scale);
    ctx.closePath();
    ctx.fill();
    const sp = this.sprites[`ship_${game.shipId}`];
    ctx.drawImage(sp.c, (-sp.w / 2) * scale, (-sp.h / 2) * scale, sp.w * scale, sp.h * scale);
    ctx.globalCompositeOperation = "lighter";
    if (p.muzzle > 0) {
      const w = game.weapon;
      ctx.fillStyle = w.color;
      ctx.globalAlpha = p.muzzle / 0.07;
      ctx.beginPath();
      ctx.arc(0, -34 * scale, 10, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (p.rapid > 0 || p.multi > 0) {
      ctx.strokeStyle = p.rapid > 0 ? COLORS.yellow : COLORS.green;
      ctx.globalAlpha = 0.35 + Math.sin(this.t * 10) * 0.15;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -2, 36 * scale, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (p.heal > 0) {
      const k = (this.t * 1.5) % 1;
      ctx.strokeStyle = COLORS.green;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.6 * (1 - k);
      ctx.beginPath();
      ctx.arc(0, -2, (18 + k * 24) * scale, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (p.shield > 0) {
      const fading = p.shield < 1 && Math.floor(p.shield * 10) % 2 === 0;
      ctx.globalAlpha = fading ? 0.35 : 0.9;
      this.sprite("shield", p.x, p.y - 2, 0, scale * (1 + Math.sin(this.t * 6) * 0.03));
      ctx.globalAlpha = 1;
    }
  }

  drawPlayerBullets(game) {
    const { ctx } = this;
    for (const b of game.bullets.items) {
      const rot = Math.atan2(b.vx, -b.vy);
      if (b.kind === "laser") {
        ctx.globalAlpha = 0.35;
        this.sprite("bullet_laser", b.x - b.vx * 0.02, b.y - b.vy * 0.02, rot, 1);
        ctx.globalAlpha = 1;
        this.sprite("bullet_laser", b.x, b.y, rot);
      } else {
        ctx.globalAlpha = 0.3;
        const name = b.color === COLORS.green ? "bullet_green" : "bullet_cyan";
        this.sprite(name, b.x - b.vx * 0.015, b.y - b.vy * 0.015, rot, 0.8);
        ctx.globalAlpha = 1;
        this.sprite(name, b.x, b.y, rot);
      }
    }
  }

  drawEnemy(e) {
    const { ctx } = this;
    const rot = e.type === "kamikaze" && e.state === 2 ? Math.atan2(-e.vx, e.vy) : 0;
    if (e.type === "kamikaze" && e.state === 1) {
      ctx.strokeStyle = COLORS.red;
      ctx.globalAlpha = 0.5 + Math.sin(this.t * 30) * 0.4;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 8, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    this.sprite(e.flash > 0 ? `enemy_${e.type}_hit` : `enemy_${e.type}`, e.x, e.y, rot);
    if (e.maxHp > 1 && e.hp < e.maxHp) {
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2, 4);
      ctx.fillStyle = COLORS.green;
      ctx.fillRect(e.x - e.r, e.y - e.r - 10, (e.r * 2 * Math.max(0, e.hp)) / e.maxHp, 4);
    }
  }

  drawBoss(b) {
    const { ctx } = this;
    if (b.entering) {
      ctx.globalAlpha = 0.25 + Math.sin(this.t * 12) * 0.15;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, b.w * 0.7, b.h * 0.7, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const wobble = b.flash > 0 ? (Math.random() - 0.5) * 4 : 0;
    this.sprite(b.flash > 0 ? `boss_${b.type}_hit` : `boss_${b.type}`, b.x + wobble, b.y);
    if (b.rage) {
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.15 + Math.sin(this.t * 8) * 0.1;
      this.sprite(`boss_${b.type}`, b.x, b.y, 0, 1.06);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  drawParticles(game) {
    const { ctx } = this;
    ctx.save();
    if (this.quality !== "low") ctx.globalCompositeOperation = "lighter";
    for (const p of game.particles.items) {
      const k = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = k;
      if (p.kind === "ring") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + (1 - k) * 60, 0, TAU);
        ctx.stroke();
      } else if (p.kind === "flash") {
        ctx.globalAlpha = k * 0.6;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.2 - k * 0.4), 0, TAU);
        ctx.fill();
      } else {
        const s = p.size * (0.5 + k * 0.5) * 2;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
      }
    }
    ctx.restore();
  }

  drawTexts(game) {
    const { ctx } = this;
    ctx.save();
    ctx.textAlign = "center";
    for (const t of game.texts.items) {
      ctx.globalAlpha = Math.max(0, t.life);
      ctx.fillStyle = t.color;
      ctx.font = `700 ${t.size}px ${FONT}`;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  drawScreenFx(game) {
    const { ctx, W, H } = this;
    const p = game.player;
    if (p.hurtFlash > 0 && this.damageFx) {
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, "rgba(255,83,100,0)");
      g.addColorStop(1, `rgba(255,83,100,${(p.hurtFlash / 0.35) * 0.55})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (game.bombFlash > 0 && !this.reduceMotion) {
      ctx.fillStyle = `rgba(255,79,195,${game.bombFlash * 0.5})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (p.alive && p.hp === 1 && game.state === "running" && this.damageFx) {
      ctx.strokeStyle = `rgba(255,83,100,${0.25 + Math.sin(this.t * 5) * 0.15})`;
      ctx.lineWidth = 10;
      ctx.strokeRect(5, 5, W - 10, H - 10);
    }
  }

  text(str, x, y, size, color, weight = 800, font = FONT) {
    const { ctx } = this;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  drawBanner(game) {
    if (game.state !== "running" && game.state !== "paused") return;
    const { ctx, W, H } = this;
    const t = game.phaseT;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const cy = H * 0.4;
    const big = Math.min(72, W / 9);
    switch (game.phase) {
      case "intro": {
        if (t < 1.4) {
          const a = Math.min(1, t * 4, (1.4 - t) * 4);
          ctx.globalAlpha = a;
          this.text(`LEVEL ${game.level}`, W / 2, cy, big, COLORS.cyan);
          const stage = ((game.level - 1) % 5) + 1;
          const fresh = game.level <= 5 ? NEW_ENEMY[stage] : null;
          if (fresh) {
            const names = [].concat(fresh).map((k) => ENEMIES[k].name).join(" + ");
            this.text(`NEW ENEMY: ${names}`, W / 2, cy + big * 0.85, Math.min(22, W / 26), COLORS.yellow, 700);
          } else if (game.level > 5) {
            this.text("DIFFICULTY UP", W / 2, cy + big * 0.85, Math.min(22, W / 26), COLORS.yellow, 700);
          }
        } else {
          const n = Math.ceil(3.2 - t);
          const frac = 1 - ((3.2 - t) % 0.6) / 0.6;
          if (t < 1.8) {
            ctx.globalAlpha = 1;
            this.text("READY", W / 2, cy, big * 0.8, COLORS.text);
          } else if (n >= 1 && n <= 3) {
            ctx.globalAlpha = 1 - frac * 0.6;
            this.text(String(n), W / 2, cy, big * (1.4 - frac * 0.4), COLORS.cyan);
          }
        }
        break;
      }
      case "wave":
        if (t < 0.7) {
          ctx.globalAlpha = 1 - t / 0.7;
          this.text("GO!", W / 2, cy, big * (1 + t), COLORS.green);
        }
        break;
      case "clear":
        ctx.globalAlpha = Math.min(1, t * 4, (2 - t) * 3);
        this.text("LEVEL CLEAR", W / 2, cy, big * 0.8, COLORS.green);
        break;
      case "bossWarn": {
        const blink = Math.floor(t * 4) % 2 === 0;
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(0, cy - big, W, big * 2);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = COLORS.red;
        ctx.lineWidth = 3;
        for (const y of [cy - big, cy + big]) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
        if (blink || this.reduceMotion) this.text("WARNING", W / 2, cy - big * 0.15, big, COLORS.red, 900);
        const cfg = levelConfig(game.level);
        const name = { destroyer: "DESTROYER", shadow: "SHADOW", titan: "GALACTIC TITAN" }[cfg.boss];
        this.text(`BOSS APPROACHING: ${name}`, W / 2, cy + big * 0.6, Math.min(22, W / 28), COLORS.text, 700);
        break;
      }
      case "bossDown":
        ctx.globalAlpha = Math.min(1, t * 3, (3.5 - t) * 2);
        this.text("BOSS DEFEATED", W / 2, cy, big * 0.8, COLORS.yellow, 900);
        this.text("+1 HP   +1 BOMB", W / 2, cy + big * 0.75, Math.min(22, W / 28), COLORS.green, 700);
        break;
    }
    ctx.restore();
  }

  drawToasts() {
    const { ctx, W, H } = this;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    let y = H * 0.62;
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      ctx.globalAlpha = Math.min(1, t.life * 2);
      ctx.font = `700 ${Math.min(24, W / 24)}px ${FONT}`;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, W / 2, y);
      y += 32;
    }
    ctx.restore();
  }

  /** Mirrored webcam view with hand skeleton, gesture label and dwell ring. */
  drawPreview(pctx, video, lms, info) {
    const { width: w, height: h } = pctx.canvas;
    pctx.save();
    if (video.readyState >= 2) {
      if (info.mirror) {
        pctx.translate(w, 0);
        pctx.scale(-1, 1);
      }
      pctx.drawImage(video, 0, 0, w, h);
    } else {
      pctx.fillStyle = COLORS.bg2;
      pctx.fillRect(0, 0, w, h);
    }
    pctx.restore();
    if (info.zone) {
      pctx.save();
      pctx.strokeStyle = "rgba(53,229,242,0.4)";
      pctx.setLineDash([6, 6]);
      pctx.lineWidth = 2;
      for (const fx of info.zone) {
        pctx.beginPath();
        pctx.moveTo(w * fx, 0);
        pctx.lineTo(w * fx, h);
        pctx.stroke();
      }
      pctx.restore();
    }
    if (!lms || !info.showLandmarks) return;
    const P = (i) => [(info.mirror ? 1 - lms[i].x : lms[i].x) * w, lms[i].y * h];
    const thumbColor = info.triggerDown ? COLORS.red : COLORS.yellow;
    pctx.save();
    pctx.lineWidth = Math.max(2, w / 110);
    pctx.lineCap = "round";
    for (const [a, b] of HAND_CONNECTIONS) {
      pctx.strokeStyle = a < 4 && b <= 4 ? thumbColor : COLORS.green;
      const [x1, y1] = P(a);
      const [x2, y2] = P(b);
      pctx.beginPath();
      pctx.moveTo(x1, y1);
      pctx.lineTo(x2, y2);
      pctx.stroke();
    }
    const dot = Math.max(2.5, w / 90);
    for (let i = 0; i < lms.length; i++) {
      const [x, y] = P(i);
      pctx.fillStyle = i > 0 && i <= 4 ? thumbColor : i === 8 ? COLORS.cyan : "#ffffff";
      pctx.beginPath();
      pctx.arc(x, y, i === 4 || i === 8 ? dot * 1.6 : dot, 0, TAU);
      pctx.fill();
    }
    if (info.dwell > 0 && info.dwell < 1) {
      const [x, y] = P(9);
      pctx.strokeStyle = COLORS.cyan;
      pctx.lineWidth = 4;
      pctx.beginPath();
      pctx.arc(x, y, w / 12, -Math.PI / 2, -Math.PI / 2 + info.dwell * TAU);
      pctx.stroke();
    }
    if (info.triggerDown) {
      const [x, y] = P(8);
      pctx.font = `800 ${Math.round(w / 14)}px ${FONT}`;
      pctx.textAlign = "center";
      pctx.fillStyle = COLORS.pink;
      pctx.fillText("BANG!", x, Math.max(24, y - 16));
    }
    pctx.restore();
  }
}

/** Animated ship for menu / ship-select canvases (drawn directly, not baked: only a few per frame). */
export function drawShipPreview(canvas, shipId, t, big = false) {
  const g = canvas.getContext("2d");
  const { width: w, height: h } = canvas;
  g.clearRect(0, 0, w, h);
  const s = Math.min(w, h) / (big ? 90 : 80);
  const ship = SHIPS[shipId];
  g.save();
  g.translate(w / 2, h / 2 + Math.sin(t * 2) * 4 * s);
  g.scale(s, s);
  g.rotate(Math.sin(t * 1.3) * 0.06);
  const fl = 14 + Math.sin(t * 30) * 4;
  const flame = g.createLinearGradient(0, 16, 0, 22 + fl);
  flame.addColorStop(0, "rgba(255,240,160,1)");
  flame.addColorStop(0.5, "rgba(255,120,40,0.8)");
  flame.addColorStop(1, "rgba(255,60,120,0)");
  g.fillStyle = flame;
  g.beginPath();
  g.moveTo(-7, 17);
  g.lineTo(7, 17);
  g.lineTo(0, 22 + fl);
  g.closePath();
  g.fill();
  drawShip(g, shipId);
  g.restore();
  g.shadowBlur = 0;
  g.strokeStyle = ship.color;
  g.globalAlpha = 0.25;
  g.beginPath();
  g.ellipse(w / 2, h * 0.88, w * 0.28, h * 0.04, 0, 0, TAU);
  g.stroke();
  g.globalAlpha = 1;
}
