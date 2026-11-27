export const FINAL_LEVEL = 15;
const BOSS_ORDER = ["destroyer", "shadow", "titan"];

/**
 * Levels 1-4 introduce enemies, 5 is a boss; then the cycle repeats with
 * scaling ("loop" grows every 5 levels). Level 15 is the final boss.
 */
export function levelConfig(level) {
  const loop = Math.floor((level - 1) / 5);
  const stage = ((level - 1) % 5) + 1;
  const scale = 1 + loop * 0.35 + (stage - 1) * 0.06;
  if (stage === 5) {
    return {
      level,
      boss: BOSS_ORDER[Math.min(loop, BOSS_ORDER.length - 1)],
      bossScale: 1 + loop * 0.25,
      scale,
      final: level >= FINAL_LEVEL,
    };
  }
  const pool = { drone: 4 };
  if (stage >= 2 || loop > 0) pool.scout = 2;
  if (stage >= 3 || loop > 0) pool.shooter = 2;
  if (stage >= 4 || loop > 0) {
    pool.tank = 1;
    pool.kamikaze = 2;
  }
  if (loop > 0) {
    pool.drone = 2;
    pool.shooter += loop;
    pool.kamikaze = (pool.kamikaze || 0) + loop;
  }
  return {
    level,
    boss: null,
    pool,
    kills: 14 + stage * 4 + loop * 6,
    spawnEvery: Math.max(0.32, 1.15 - stage * 0.08 - loop * 0.18),
    maxAlive: 6 + stage * 2 + loop * 3,
    scale,
    speedScale: 1 + loop * 0.15 + (stage - 1) * 0.04,
    fireScale: 1 + loop * 0.3,
  };
}

export function pickWeighted(pool, rnd = Math.random) {
  let total = 0;
  for (const w of Object.values(pool)) total += w;
  let r = rnd() * total;
  for (const [k, w] of Object.entries(pool)) {
    r -= w;
    if (r <= 0) return k;
  }
  return Object.keys(pool)[0];
}
