export const COLORS = {
  bg: "#070B1D",
  bg2: "#101831",
  panel: "#151F3D",
  cyan: "#35E5F2",
  blue: "#438AFF",
  purple: "#9765FF",
  pink: "#FF4FC3",
  red: "#FF5364",
  green: "#42E8A1",
  yellow: "#FFD166",
  text: "#F4F7FF",
  text2: "#A8B4D0",
};

/**
 * stats (1..5) are for the UI bars; the numbers below them drive gameplay.
 * fireRate = seconds between shots, damage = per bullet.
 */
export const SHIPS = {
  falcon: {
    name: "FALCON",
    role: "ALL-ROUNDER",
    color: COLORS.cyan,
    accent: COLORS.blue,
    stats: { speed: 3, attack: 3, defense: 3 },
    speed: 1,
    maxHp: 4,
    fireRate: 0.2,
    damage: 1,
    radius: 20,
    ability: "Overdrive",
    abilityTh: "ได้รับพลังเสริมนานขึ้น 30%",
    powerupMul: 1.3,
  },
  phantom: {
    name: "PHANTOM",
    role: "INTERCEPTOR",
    color: COLORS.purple,
    accent: COLORS.pink,
    stats: { speed: 5, attack: 2, defense: 2 },
    speed: 1.55,
    maxHp: 3,
    fireRate: 0.18,
    damage: 0.9,
    radius: 15,
    ability: "Phase Shift",
    abilityTh: "ตัวเล็ก หลบง่าย และอมตะนานขึ้นหลังโดนยิง",
    invulnAfterHit: 2.6,
  },
  titan: {
    name: "TITAN",
    role: "HEAVY GUNSHIP",
    color: COLORS.yellow,
    accent: "#FF9F43",
    stats: { speed: 1, attack: 5, defense: 5 },
    speed: 0.68,
    maxHp: 6,
    fireRate: 0.3,
    damage: 2.2,
    radius: 25,
    ability: "Heavy Payload",
    abilityTh: "เริ่มเกมพร้อมระเบิด 3 ลูก และกระสุนแรงมาก",
    startBombs: 3,
  },
  nova: {
    name: "NOVA",
    role: "ENERGY SUPPORT",
    color: COLORS.green,
    accent: COLORS.cyan,
    stats: { speed: 3, attack: 4, defense: 3 },
    speed: 1.1,
    maxHp: 4,
    fireRate: 0.14,
    damage: 0.75,
    radius: 19,
    ability: "Energy Core",
    abilityTh: "กระสุนทะลุศัตรู 1 ตัว โล่อยู่นานขึ้นและชาร์จเร็วขึ้น",
    pierce: 1,
    shieldMul: 1.5,
    shieldCooldownMul: 0.7,
  },
};
export const SHIP_ORDER = ["falcon", "phantom", "titan", "nova"];

export const WEAPONS = [
  { id: "normal", name: "NORMAL", th: "ปืนปกติ", rate: 1, damage: 1, speed: 760, color: COLORS.cyan },
  { id: "laser", name: "LASER", th: "เลเซอร์ทะลุ", rate: 1.6, damage: 0.8, speed: 1200, color: COLORS.pink, pierceAll: true },
  { id: "multi", name: "MULTI", th: "ยิงกระจาย", rate: 1.25, damage: 0.7, speed: 720, color: COLORS.green, spread: [-0.18, 0, 0.18] },
];

export const ENEMIES = {
  drone: { name: "DRONE", r: 18, hp: 1, score: 100, speed: 100, color: COLORS.red },
  scout: { name: "SCOUT", r: 14, hp: 1, score: 150, speed: 210, color: COLORS.yellow },
  shooter: { name: "SHOOTER", r: 20, hp: 3, score: 250, speed: 70, color: COLORS.pink },
  tank: { name: "TANK", r: 30, hp: 8, score: 400, speed: 45, color: COLORS.blue },
  kamikaze: { name: "KAMIKAZE", r: 15, hp: 1, score: 200, speed: 120, color: "#FF9F43" },
};

export const POWERUPS = {
  S: { id: "multi", name: "MULTI SHOT", th: "ยิง 3 ทาง", duration: 10, color: COLORS.green },
  H: { id: "heal", name: "HEAL", th: "ฟื้นเลือดทันที +1 และฟื้นต่อเนื่อง", duration: 6, tick: 3, color: COLORS.red },
  B: { id: "shield", name: "SHIELD", th: "โล่ป้องกัน", duration: 5, color: COLORS.cyan },
  F: { id: "rapid", name: "RAPID FIRE", th: "ยิงรัว", duration: 8, color: COLORS.yellow },
  X: { id: "bomb", name: "BOMB", th: "ระเบิด +1", duration: 0, color: COLORS.pink },
};

export const BOSSES = {
  destroyer: { name: "DESTROYER", hp: 140, w: 220, h: 110, score: 5000, color: COLORS.red },
  shadow: { name: "SHADOW", hp: 150, w: 150, h: 90, score: 8000, color: COLORS.purple },
  titan: { name: "GALACTIC TITAN", hp: 320, w: 280, h: 150, score: 15000, color: COLORS.yellow },
};

export const DIFFICULTY = {
  easy: { label: "EASY", enemyHp: 0.75, enemySpeed: 0.85, enemyFire: 0.7, spawn: 0.8, damageTaken: 1, score: 0.8, bossHp: 0.75 },
  normal: { label: "NORMAL", enemyHp: 1, enemySpeed: 1, enemyFire: 1, spawn: 1, damageTaken: 1, score: 1, bossHp: 1 },
  hard: { label: "HARD", enemyHp: 1.35, enemySpeed: 1.15, enemyFire: 1.35, spawn: 1.25, damageTaken: 1, score: 1.4, bossHp: 1.35 },
};

export const PLAYER = {
  shieldDuration: 3,
  shieldCooldown: 8,
  maxBombs: 5,
  startBombs: 2,
  bombBossDamage: 0.08,
  invulnAfterHit: 1.8,
};

export const LIMITS = {
  playerBullets: 90,
  enemyBullets: 220,
  enemies: 40,
  particles: 500,
  texts: 30,
  powerups: 6,
};
