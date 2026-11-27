import { ENEMY_TYPES } from "./entities.js";

const TAU = Math.PI * 2;
const FONT = '"Orbitron", "Kanit", sans-serif';
const THAI_FONT = '"Kanit", Tahoma, sans-serif';

const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];
const THUMB = new Set(["0-1", "1-2", "2-3", "3-4"]);

/** Glow is baked into offscreen sprites once; shadowBlur per frame is the main Canvas 2D cost. */
function makeSprite(size, dpr, draw) {
  const c = document.createElement("canvas");
  c.width = c.height = Math.ceil(size * dpr);
  const g = c.getContext("2d");
  g.scale(dpr, dpr);
  g.translate(size / 2, size / 2);
  draw(g);
  return { c, size };
}

function shipPath(g) {
  g.beginPath();
  g.moveTo(0, -32);
  g.lineTo(10, -8);
  g.lineTo(28, 12);
  g.lineTo(26, 18);
  g.lineTo(10, 12);
  g.lineTo(6, 20);
  g.lineTo(-6, 20);
  g.lineTo(-10, 12);
  g.lineTo(-26, 18);
  g.lineTo(-28, 12);
  g.lineTo(-10, -8);
  g.closePath();
}

function enemyShape(g, type, r, color) {
  g.fillStyle = color;
  g.strokeStyle = "rgba(255,255,255,0.6)";
  g.lineWidth = 1.5;
  g.beginPath();
  switch (type) {
    case "drone":
      g.ellipse(0, 0, r, r * 0.55, 0, 0, TAU);
      g.fill();
      g.shadowBlur = 0;
      g.beginPath();
      g.fillStyle = color === "#ffffff" ? "#ffffff" : "#ffd6de";
      g.arc(0, -r * 0.25, r * 0.4, Math.PI, 0);
      g.fill();
      break;
    case "zig":
      g.moveTo(0, -r);
      g.lineTo(r, 0);
      g.lineTo(0, r);
      g.lineTo(-r, 0);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    case "diver":
      g.moveTo(0, r * 1.2);
      g.lineTo(r, -r);
      g.lineTo(0, -r * 0.4);
      g.lineTo(-r, -r);
      g.closePath();
      g.fill();
      g.stroke();
      break;
    case "tank":
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = "#05061a";
      g.beginPath();
      g.arc(0, 0, r * 0.4, 0, TAU);
      g.fill();
      break;
  }
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.W = 0;
    this.H = 0;
    this.t = 0;
    this.stars = [];
    this.sprites = {};
    this.bg = null;
  }

  resize() {
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.round(this.W * dpr);
    this.canvas.height = Math.round(this.H * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.makeStars();
    this.makeBackground();
    this.makeSprites();
  }

  makeBackground() {
    const { W, H, dpr } = this;
    const c = document.createElement("canvas");
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#05061a");
    bg.addColorStop(1, "#140a33");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);
    const n1 = g.createRadialGradient(W * 0.2, H * 0.3, 0, W * 0.2, H * 0.3, W * 0.5);
    n1.addColorStop(0, "rgba(120, 40, 200, 0.18)");
    n1.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = n1;
    g.fillRect(0, 0, W, H);
    const n2 = g.createRadialGradient(W * 0.85, H * 0.75, 0, W * 0.85, H * 0.75, W * 0.45);
    n2.addColorStop(0, "rgba(0, 160, 255, 0.12)");
    n2.addColorStop(1, "rgba(0, 0, 0, 0)");
    g.fillStyle = n2;
    g.fillRect(0, 0, W, H);
    this.bg = c;
  }

  makeSprites() {
    const dpr = this.dpr;
    const s = {};
    s.ship = makeSprite(96, dpr, (g) => {
      g.shadowColor = "#3df5ff";
      g.shadowBlur = 18;
      const body = g.createLinearGradient(0, -30, 0, 20);
      body.addColorStop(0, "#e0fbfc");
      body.addColorStop(1, "#3a86ff");
      g.fillStyle = body;
      shipPath(g);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "#ff3b8d";
      g.beginPath();
      g.ellipse(0, -6, 5, 10, 0, 0, TAU);
      g.fill();
    });
    for (const [type, def] of Object.entries(ENEMY_TYPES)) {
      const size = def.r * 2 + 40;
      s[type] = makeSprite(size, dpr, (g) => {
        g.shadowColor = def.color;
        g.shadowBlur = 14;
        enemyShape(g, type, def.r, def.color);
      });
      s[`${type}Flash`] = makeSprite(size, dpr, (g) => enemyShape(g, type, def.r, "#ffffff"));
    }
    s.power = makeSprite(60, dpr, (g) => {
      g.shadowColor = "#3dff8a";
      g.shadowBlur = 18;
      g.strokeStyle = "#3dff8a";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(0, 0, 15, 0, TAU);
      g.stroke();
      g.fillStyle = "rgba(61,255,138,0.25)";
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "#eafff2";
      g.font = `800 16px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText("S", 0, 1);
    });
    s.bullet = makeSprite(30, dpr, (g) => {
      g.shadowColor = "#3df5ff";
      g.shadowBlur = 10;
      g.fillStyle = "#7df9ff";
      g.beginPath();
      g.roundRect(-3, -10, 6, 20, 3);
      g.fill();
    });
    s.enemyBullet = makeSprite(30, dpr, (g) => {
      g.shadowColor = "#ff3b8d";
      g.shadowBlur = 10;
      g.fillStyle = "#ff5ca8";
      g.beginPath();
      g.arc(0, 0, 6, 0, TAU);
      g.fill();
    });
    this.sprites = s;
  }

  sprite(name, x, y, rot = 0, scale = 1) {
    const sp = this.sprites[name];
    const size = sp.size * scale;
    if (!rot) {
      this.ctx.drawImage(sp.c, x - size / 2, y - size / 2, size, size);
      return;
    }
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.drawImage(sp.c, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  makeStars() {
    const area = Math.min(2, (this.W * this.H) / (1280 * 720));
    const layers = [
      [70, 18, 1, "#7f8cff"],
      [45, 45, 1.6, "#bfe9ff"],
      [22, 110, 2.2, "#ffffff"],
    ];
    this.stars = [];
    for (const [n, speed, size, c] of layers) {
      for (let i = 0; i < n * area; i++) {
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

  draw(game, input, tracker, dt) {
    const { ctx, W, H } = this;
    this.t += dt;

    ctx.drawImage(this.bg, 0, 0, W, H);

    const speedMul = game.state === "playing" ? 1 + (game.level - 1) * 0.06 : game.state === "paused" ? 0 : 0.35;
    for (const s of this.stars) {
      s.y += s.speed * dt * speedMul;
      if (s.y > H) {
        s.y -= H;
        s.x = Math.random() * W;
      }
      ctx.globalAlpha = s.a;
      ctx.fillStyle = s.c;
      ctx.fillRect(s.x, s.y, s.size, s.speed > 80 ? s.size * 3 : s.size);
    }
    ctx.globalAlpha = 1;

    if (game.state === "idle") return;

    ctx.save();
    if (game.shake > 0) {
      const m = game.shake * 16;
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    for (const u of game.powerups) this.sprite("power", u.x, u.y, 0, 1 + Math.sin(u.t * 6) * 0.08);
    for (const e of game.enemies) this.drawEnemy(e);
    for (const b of game.bullets) this.sprite("bullet", b.x, b.y, Math.atan2(b.vx, -b.vy));
    for (const b of game.enemyBullets) this.sprite("enemyBullet", b.x, b.y);
    if (game.lives > 0) this.drawPlayer(game.player);
    this.drawParticles(game);
    this.drawTexts(game);
    ctx.restore();

    this.drawHUD(game, input, tracker);
  }

  drawPlayer(p) {
    if (p.invuln > 0 && Math.floor(p.invuln * 12) % 2 === 0) return;
    const { ctx } = this;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.tilt * 0.3);

    const fl = 16 + Math.sin(this.t * 40) * 5;
    const flame = ctx.createLinearGradient(0, 16, 0, 20 + fl);
    flame.addColorStop(0, "rgba(255, 240, 160, 1)");
    flame.addColorStop(0.5, "rgba(255, 120, 40, 0.8)");
    flame.addColorStop(1, "rgba(255, 60, 120, 0)");
    ctx.fillStyle = flame;
    ctx.beginPath();
    ctx.moveTo(-8, 18);
    ctx.lineTo(8, 18);
    ctx.lineTo(0, 20 + fl);
    ctx.closePath();
    ctx.fill();

    const sp = this.sprites.ship;
    ctx.drawImage(sp.c, -sp.size / 2, -sp.size / 2, sp.size, sp.size);

    ctx.globalCompositeOperation = "lighter";
    if (p.muzzle > 0) {
      ctx.fillStyle = "rgba(125, 249, 255, 0.9)";
      ctx.beginPath();
      ctx.arc(0, -34, 9, 0, TAU);
      ctx.fill();
    }
    if (p.spread > 0) {
      ctx.strokeStyle = `rgba(61, 255, 138, ${0.35 + Math.sin(this.t * 10) * 0.15})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -2, 36, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawEnemy(e) {
    const rot = e.type === "zig" ? this.t * 3 : 0;
    this.sprite(e.flash > 0 ? `${e.type}Flash` : e.type, e.x, e.y, rot);
    if (e.type === "tank") {
      const { ctx } = this;
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2, 4);
      ctx.fillStyle = "#3dff8a";
      ctx.fillRect(e.x - e.r, e.y - e.r - 10, (e.r * 2 * e.hp) / e.maxHp, 4);
    }
  }

  drawParticles(game) {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const p of game.particles) {
      const k = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = k;
      if (p.ring) {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size + (1 - k) * 60, 0, TAU);
        ctx.stroke();
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
    ctx.font = `600 18px ${THAI_FONT}`;
    for (const t of game.texts) {
      ctx.globalAlpha = Math.max(0, t.life / 0.9);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  drawHUD(game, input, tracker) {
    const { ctx, W, H } = this;
    ctx.save();
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = "#e0fbfc";
    ctx.font = `800 24px ${FONT}`;
    ctx.fillText(`SCORE ${game.score}`, 20, 16);
    ctx.font = `600 14px ${FONT}`;
    ctx.globalAlpha = 0.8;
    ctx.fillText(`HI ${Math.max(game.high, game.score)}   LV ${game.level}`, 20, 46);
    ctx.globalAlpha = 1;

    ctx.fillStyle = "#ff3b8d";
    for (let i = 0; i < 3; i++) {
      ctx.globalAlpha = i < game.lives ? 1 : 0.2;
      heart(ctx, 32 + i * 30, 70, 22);
    }
    ctx.globalAlpha = 1;

    let y = 102;
    if (game.player.spread > 0) {
      ctx.fillStyle = "rgba(255,255,255,0.15)";
      ctx.fillRect(20, y, 120, 6);
      ctx.fillStyle = "#3dff8a";
      ctx.fillRect(20, y, (120 * game.player.spread) / 8, 6);
      ctx.font = `400 12px ${THAI_FONT}`;
      ctx.fillText("ยิงกระจาย", 148, y - 4);
      y += 16;
    }

    ctx.font = `400 14px ${THAI_FONT}`;
    let label;
    if (input.handPresent) label = input.gunPose ? "✋ ควบคุมด้วยมือ · ท่าปืน OK" : "✋ ควบคุมด้วยมือ";
    else if (tracker.cameraOn) label = "✋ ไม่เจอมือ — ใช้คีย์บอร์ด/เมาส์ได้";
    else if (tracker.retryTimer) label = "📷 กล้องหลุด กำลังเชื่อมต่อใหม่... (ปิดโปรแกรม/แท็บอื่นที่ใช้กล้อง)";
    else label = "⌨️ คีย์บอร์ด / 🖱️ เมาส์";
    ctx.fillStyle = "rgba(224,251,252,0.8)";
    ctx.fillText(label, 20, y);
    if (input.handPresent) {
      ctx.fillStyle = input.triggerDown ? "#ff3b8d" : "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.arc(26, y + 30, 6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(224,251,252,0.8)";
      ctx.fillText(input.triggerDown ? "ไกปืน: ยิง!" : "ไกปืน: ง้าง", 38, y + 21);
    }

    if (tracker.cameraOn && tracker.ready) {
      ctx.font = `400 12px ${THAI_FONT}`;
      ctx.fillStyle = "rgba(224,251,252,0.45)";
      ctx.textBaseline = "bottom";
      ctx.fillText(
        `AI ${tracker.delegate}/${tracker.mode} · ${Math.round(tracker.inferMs)} ms · ${Math.round(tracker.detectFps)} fps`,
        12,
        H - 8
      );
    }

    if (game.state === "playing" && tracker.cameraOn && tracker.ready && !input.handPresent) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 22px ${THAI_FONT}`;
      ctx.globalAlpha = 0.6 + Math.sin(this.t * 4) * 0.3;
      ctx.fillStyle = "#ffd166";
      ctx.fillText("ยกมือขึ้นหน้ากล้อง แล้วทำท่าปืน 👉", W / 2, H * 0.45);
    }
    ctx.restore();
  }

  /** Mirrored webcam view with the hand skeleton; thumb turns red when the trigger is pulled. */
  drawPreview(pctx, video, lms, input) {
    const { width: w, height: h } = pctx.canvas;
    pctx.save();
    if (video.readyState >= 2) {
      pctx.translate(w, 0);
      pctx.scale(-1, 1);
      pctx.drawImage(video, 0, 0, w, h);
    } else {
      pctx.fillStyle = "#0b1033";
      pctx.fillRect(0, 0, w, h);
    }
    pctx.restore();

    pctx.save();
    pctx.strokeStyle = "rgba(61,245,255,0.45)";
    pctx.setLineDash([6, 6]);
    pctx.lineWidth = 2;
    for (const fx of [0.15, 0.85]) {
      pctx.beginPath();
      pctx.moveTo(w * fx, 0);
      pctx.lineTo(w * fx, h);
      pctx.stroke();
    }
    pctx.restore();

    if (!lms) return;
    const P = (i) => [(1 - lms[i].x) * w, lms[i].y * h];
    const thumbColor = input.triggerDown ? "#ff3b5c" : "#ffd166";
    pctx.save();
    pctx.lineWidth = 3;
    pctx.lineCap = "round";
    for (const [a, b] of HAND_CONNECTIONS) {
      pctx.strokeStyle = THUMB.has(`${a}-${b}`) ? thumbColor : "#3dff8a";
      const [x1, y1] = P(a);
      const [x2, y2] = P(b);
      pctx.beginPath();
      pctx.moveTo(x1, y1);
      pctx.lineTo(x2, y2);
      pctx.stroke();
    }
    for (let i = 0; i < lms.length; i++) {
      const [x, y] = P(i);
      pctx.fillStyle = i <= 4 && i > 0 ? thumbColor : i === 8 ? "#3df5ff" : "#ffffff";
      pctx.beginPath();
      pctx.arc(x, y, i === 4 || i === 8 ? 6 : 3.5, 0, TAU);
      pctx.fill();
    }
    if (input.triggerDown) {
      const [x, y] = P(8);
      pctx.font = `800 22px ${FONT}`;
      pctx.textAlign = "center";
      pctx.fillStyle = "#ff3b8d";
      pctx.fillText("BANG!", x, Math.max(24, y - 16));
    }
    pctx.restore();
  }
}

function heart(ctx, cx, y, s) {
  const h = s / 2;
  ctx.beginPath();
  ctx.moveTo(cx, y + s * 0.3);
  ctx.bezierCurveTo(cx, y, cx - h, y, cx - h, y + s * 0.3);
  ctx.bezierCurveTo(cx - h, y + s * 0.6, cx, y + s * 0.75, cx, y + s * 0.95);
  ctx.bezierCurveTo(cx, y + s * 0.75, cx + h, y + s * 0.6, cx + h, y + s * 0.3);
  ctx.bezierCurveTo(cx + h, y, cx, y, cx, y + s * 0.3);
  ctx.fill();
}
