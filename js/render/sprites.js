import { SHIPS, ENEMIES, BOSSES, POWERUPS, COLORS } from "../game/defs.js";

const TAU = Math.PI * 2;
export const FONT = '"Orbitron", "Rajdhani", sans-serif';

/** Glow is baked once into offscreen canvases; per-frame shadowBlur is the main Canvas 2D cost. */
export function bake(w, h, dpr, draw) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w * dpr);
  c.height = Math.ceil(h * dpr);
  const g = c.getContext("2d");
  g.scale(dpr, dpr);
  g.translate(w / 2, h / 2);
  draw(g);
  return { c, w, h };
}

function poly(g, pts) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
}

function glow(g, color, blur) {
  g.shadowColor = color;
  g.shadowBlur = blur;
}

function hull(g, top, bottom, a, b) {
  const grad = g.createLinearGradient(0, top, 0, bottom);
  grad.addColorStop(0, "#F4F7FF");
  grad.addColorStop(0.35, a);
  grad.addColorStop(1, b);
  return grad;
}

/** Ships are drawn nose-up in a ~64x64 box centred on 0,0. */
export function drawShip(g, id, flat = false) {
  const s = SHIPS[id];
  if (!flat) glow(g, s.color, 16);
  g.lineJoin = "round";
  switch (id) {
    case "falcon":
      g.fillStyle = hull(g, -32, 20, s.color, s.accent);
      poly(g, [0, -32, 10, -8, 28, 12, 26, 18, 10, 12, 6, 20, -6, 20, -10, 12, -26, 18, -28, 12, -10, -8]);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = COLORS.pink;
      g.beginPath();
      g.ellipse(0, -6, 5, 10, 0, 0, TAU);
      g.fill();
      break;
    case "phantom":
      g.fillStyle = hull(g, -34, 18, s.color, "#3a1d7a");
      poly(g, [0, -34, 6, -14, 22, 4, 24, 16, 8, 8, 4, 18, -4, 18, -8, 8, -24, 16, -22, 4, -6, -14]);
      g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = s.accent;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-18, 8);
      g.lineTo(0, -22);
      g.lineTo(18, 8);
      g.stroke();
      g.fillStyle = s.accent;
      poly(g, [0, -18, 3, -6, -3, -6]);
      g.fill();
      break;
    case "titan":
      g.fillStyle = hull(g, -26, 24, s.color, "#8a4b10");
      poly(g, [-8, -26, 8, -26, 12, -10, 30, -2, 32, 18, 20, 24, 10, 16, -10, 16, -20, 24, -32, 18, -30, -2, -12, -10]);
      g.fill();
      g.shadowBlur = 0;
      g.fillStyle = "#3b2a10";
      g.fillRect(-26, -12, 6, 16);
      g.fillRect(20, -12, 6, 16);
      g.fillStyle = s.color;
      g.fillRect(-25, -18, 4, 8);
      g.fillRect(21, -18, 4, 8);
      g.fillStyle = COLORS.cyan;
      g.fillRect(-5, -16, 10, 12);
      break;
    case "nova": {
      g.fillStyle = hull(g, -30, 20, s.color, "#0d6b55");
      poly(g, [0, -30, 8, -12, 8, 14, -8, 14, -8, -12]);
      g.fill();
      g.strokeStyle = s.color;
      g.lineWidth = 4;
      g.beginPath();
      g.ellipse(0, 2, 26, 12, 0, 0, TAU);
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = COLORS.cyan;
      g.beginPath();
      g.arc(0, 2, 6, 0, TAU);
      g.fill();
      g.fillStyle = "#F4F7FF";
      g.beginPath();
      g.arc(0, 2, 2.5, 0, TAU);
      g.fill();
      break;
    }
  }
}

function drawEnemy(g, type, color) {
  const r = ENEMIES[type].r;
  g.fillStyle = color;
  g.strokeStyle = "rgba(244,247,255,0.65)";
  g.lineWidth = 1.5;
  switch (type) {
    case "drone":
      g.beginPath();
      g.ellipse(0, 0, r, r * 0.55, 0, 0, TAU);
      g.fill();
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = "rgba(244,247,255,0.85)";
      g.beginPath();
      g.arc(0, -r * 0.2, r * 0.38, Math.PI, 0);
      g.fill();
      break;
    case "scout":
      poly(g, [0, r * 1.3, r, -r * 0.6, r * 0.35, -r * 0.2, 0, -r, -r * 0.35, -r * 0.2, -r, -r * 0.6]);
      g.fill();
      g.stroke();
      break;
    case "shooter":
      poly(g, [-r, -r * 0.5, r, -r * 0.5, r * 0.8, r * 0.4, r * 0.3, r * 0.6, 0, r, -r * 0.3, r * 0.6, -r * 0.8, r * 0.4]);
      g.fill();
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = "#2a0f2a";
      g.fillRect(-r * 0.75, r * 0.2, r * 0.3, r * 0.8);
      g.fillRect(r * 0.45, r * 0.2, r * 0.3, r * 0.8);
      g.fillStyle = "#F4F7FF";
      g.beginPath();
      g.arc(0, 0, r * 0.25, 0, TAU);
      g.fill();
      break;
    case "tank":
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU + Math.PI / 6;
        g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = COLORS.bg;
      g.beginPath();
      g.arc(0, 0, r * 0.45, 0, TAU);
      g.fill();
      g.fillStyle = color === "#ffffff" ? "#ffffff" : COLORS.cyan;
      g.beginPath();
      g.arc(0, 0, r * 0.2, 0, TAU);
      g.fill();
      break;
    case "kamikaze":
      poly(g, [0, r * 1.4, r * 0.5, 0, r * 1.1, -r * 0.9, 0, -r * 0.4, -r * 1.1, -r * 0.9, -r * 0.5, 0]);
      g.fill();
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = "#F4F7FF";
      poly(g, [0, r * 0.7, r * 0.2, 0, -r * 0.2, 0]);
      g.fill();
      break;
  }
}

function drawBoss(g, type, color) {
  const { w, h } = BOSSES[type];
  const hw = w / 2;
  const hh = h / 2;
  const grad = g.createLinearGradient(0, -hh, 0, hh);
  grad.addColorStop(0, color === "#ffffff" ? "#ffffff" : "#1b2448");
  grad.addColorStop(1, color);
  g.fillStyle = grad;
  g.strokeStyle = color === "#ffffff" ? "#ffffff" : "rgba(244,247,255,0.6)";
  g.lineWidth = 2;
  switch (type) {
    case "destroyer":
      poly(g, [-hw, -hh * 0.2, -hw * 0.6, -hh, hw * 0.6, -hh, hw, -hh * 0.2, hw * 0.75, hh * 0.6, hw * 0.25, hh, -hw * 0.25, hh, -hw * 0.75, hh * 0.6]);
      g.fill();
      g.stroke();
      g.shadowBlur = 0;
      for (const x of [-0.6, -0.3, 0.3, 0.6]) {
        g.fillStyle = COLORS.bg;
        g.fillRect(x * hw - 6, hh * 0.3, 12, hh * 0.6);
        g.fillStyle = color;
        g.fillRect(x * hw - 3, hh * 0.6, 6, hh * 0.5);
      }
      g.fillStyle = COLORS.yellow;
      g.beginPath();
      g.arc(0, -hh * 0.1, hh * 0.28, 0, TAU);
      g.fill();
      break;
    case "shadow":
      poly(g, [0, hh, hw * 0.3, hh * 0.2, hw, -hh * 0.2, hw * 0.75, -hh, hw * 0.35, -hh * 0.4, 0, -hh * 0.8, -hw * 0.35, -hh * 0.4, -hw * 0.75, -hh, -hw, -hh * 0.2, -hw * 0.3, hh * 0.2]);
      g.fill();
      g.stroke();
      g.shadowBlur = 0;
      g.fillStyle = COLORS.pink;
      for (const x of [-0.18, 0.18]) {
        g.beginPath();
        g.ellipse(x * hw, -hh * 0.05, hw * 0.08, hh * 0.12, 0, 0, TAU);
        g.fill();
      }
      break;
    case "titan":
      g.beginPath();
      g.ellipse(0, 0, hw, hh * 0.6, 0, 0, TAU);
      g.fill();
      g.stroke();
      poly(g, [-hw * 0.5, -hh * 0.4, -hw * 0.3, -hh, hw * 0.3, -hh, hw * 0.5, -hh * 0.4]);
      g.fill();
      g.stroke();
      g.shadowBlur = 0;
      g.strokeStyle = color === "#ffffff" ? "#ffffff" : COLORS.cyan;
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(0, 0, hw * 0.75, hh * 0.35, 0, 0, TAU);
      g.stroke();
      g.fillStyle = COLORS.red;
      for (const x of [-0.7, -0.35, 0, 0.35, 0.7]) {
        g.beginPath();
        g.arc(x * hw, hh * 0.45, 6, 0, TAU);
        g.fill();
      }
      g.fillStyle = "#F4F7FF";
      g.beginPath();
      g.arc(0, -hh * 0.55, hh * 0.18, 0, TAU);
      g.fill();
      break;
  }
}

function drawPower(g, key) {
  const d = POWERUPS[key];
  glow(g, d.color, 16);
  g.strokeStyle = d.color;
  g.lineWidth = 3;
  poly(g, [0, -17, 15, -8, 15, 8, 0, 17, -15, 8, -15, -8]);
  g.stroke();
  g.fillStyle = d.color + "40";
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = "#F4F7FF";
  g.font = `800 15px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(key, 0, 1);
}

export function buildSprites(dpr) {
  const s = {};
  for (const id of Object.keys(SHIPS)) s[`ship_${id}`] = bake(96, 96, dpr, (g) => drawShip(g, id));
  for (const [type, d] of Object.entries(ENEMIES)) {
    const size = d.r * 3 + 30;
    s[`enemy_${type}`] = bake(size, size, dpr, (g) => {
      glow(g, d.color, 14);
      drawEnemy(g, type, d.color);
    });
    s[`enemy_${type}_hit`] = bake(size, size, dpr, (g) => drawEnemy(g, type, "#ffffff"));
  }
  for (const [type, d] of Object.entries(BOSSES)) {
    s[`boss_${type}`] = bake(d.w + 40, d.h + 40, dpr, (g) => {
      glow(g, d.color, 22);
      drawBoss(g, type, d.color);
    });
    s[`boss_${type}_hit`] = bake(d.w + 40, d.h + 40, dpr, (g) => drawBoss(g, type, "#ffffff"));
  }
  for (const key of Object.keys(POWERUPS)) s[`power_${key}`] = bake(56, 56, dpr, (g) => drawPower(g, key));

  const bolt = (color, w, h) =>
    bake(w + 20, h + 20, dpr, (g) => {
      glow(g, color, 10);
      g.fillStyle = color;
      g.beginPath();
      g.roundRect(-w / 2, -h / 2, w, h, w / 2);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.roundRect(-w / 4, -h / 2 + 2, w / 2, h - 4, w / 4);
      g.fill();
    });
  s.bullet_cyan = bolt(COLORS.cyan, 6, 20);
  s.bullet_green = bolt(COLORS.green, 6, 20);
  s.bullet_laser = bolt(COLORS.pink, 6, 42);
  const orb = (color, r) =>
    bake(r * 2 + 20, r * 2 + 20, dpr, (g) => {
      glow(g, color, 10);
      g.fillStyle = color;
      g.beginPath();
      g.arc(0, 0, r, 0, TAU);
      g.fill();
      g.fillStyle = "#ffffff";
      g.beginPath();
      g.arc(0, 0, r * 0.45, 0, TAU);
      g.fill();
    });
  s.enemy_bullet = orb(COLORS.red, 6);
  s.enemy_orb = orb(COLORS.pink, 8);
  s.shield = bake(120, 120, dpr, (g) => {
    glow(g, COLORS.cyan, 18);
    const grad = g.createRadialGradient(0, 0, 20, 0, 0, 44);
    grad.addColorStop(0, "rgba(53,229,242,0)");
    grad.addColorStop(0.8, "rgba(53,229,242,0.18)");
    grad.addColorStop(1, "rgba(53,229,242,0.5)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(0, 0, 44, 0, TAU);
    g.fill();
    g.strokeStyle = COLORS.cyan;
    g.lineWidth = 2;
    g.stroke();
  });
  return s;
}
