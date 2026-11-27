import test from "node:test";
import assert from "node:assert/strict";
import { GameEngine } from "../js/game/engine.js";
import { levelConfig, FINAL_LEVEL } from "../js/game/levels.js";
import { SHIP_ORDER } from "../js/game/defs.js";

const DT = 1 / 60;

function simulate(engine, seconds, input) {
  for (let t = 0; t < seconds && (engine.state === "running" || engine.state === "paused"); t += DT) {
    engine.update(DT, typeof input === "function" ? input(engine) : input);
  }
}

/** Steers toward the nearest target, like a decent player. */
const bot = (g) => {
  const targets = g.boss ? [g.boss] : g.enemies.items;
  let tx = g.W / 2;
  let best = Infinity;
  for (const e of targets) {
    const d = Math.abs(e.x - g.player.x);
    if (d < best) [best, tx] = [d, e.x];
  }
  return { target: tx / g.W, axis: 0, fireHeld: true };
};

test("level table: bosses on every 5th level, enemies unlocked in order", () => {
  assert.deepEqual(Object.keys(levelConfig(1).pool), ["drone"]);
  assert.ok(levelConfig(2).pool.scout);
  assert.ok(levelConfig(3).pool.shooter);
  assert.ok(levelConfig(4).pool.tank && levelConfig(4).pool.kamikaze);
  assert.equal(levelConfig(5).boss, "destroyer");
  assert.equal(levelConfig(10).boss, "shadow");
  assert.equal(levelConfig(15).boss, "titan");
  assert.equal(levelConfig(FINAL_LEVEL).final, true);
});

test("pause freezes the simulation completely", () => {
  const g = new GameEngine();
  g.resize(800, 600);
  g.start("falcon");
  simulate(g, 5, bot);
  g.pause();
  const snap = JSON.stringify([g.time, g.score, g.player.x, g.enemies.items.map((e) => [e.x, e.y]), g.phaseT]);
  simulate(g, 5, bot);
  assert.equal(JSON.stringify([g.time, g.score, g.player.x, g.enemies.items.map((e) => [e.x, e.y]), g.phaseT]), snap);
  g.resume();
  simulate(g, 0.5, bot);
  assert.ok(g.time > 5);
});

test("invincible bot can play all 15 levels with every ship and reach victory", () => {
  for (const ship of SHIP_ORDER) {
    const g = new GameEngine();
    g.resize(900, 700);
    const sfx = new Map();
    g.on("sfx", (n) => sfx.set(n, (sfx.get(n) || 0) + 1));
    let end = null;
    g.on("end", (s) => (end = s));
    g.start(ship);
    g.hurtPlayer = () => {};
    simulate(g, 60 * 30, bot);
    assert.equal(g.state, "victory", `${ship} stuck at level ${g.level} phase ${g.phase}`);
    assert.equal(end.result, "victory");
    assert.equal(end.bosses, 3);
    assert.ok(end.accuracy > 0 && end.accuracy <= 1, `accuracy ${end.accuracy}`);
    for (const name of ["shoot", "explode", "bossWarn", "bossAppear", "bossDown", "levelUp", "victory"]) {
      assert.ok(sfx.get(name) > 0, `${ship}: sfx ${name} never played`);
    }
    assert.ok(g.enemyBullets.size <= 220 && g.particles.size <= 500);
  }
});

test("enemies that escape do not advance the level", () => {
  const g = new GameEngine();
  g.resize(800, 600);
  g.start("falcon");
  g.hurtPlayer = () => {};
  simulate(g, 120, { target: 0.5, axis: 0, fireHeld: false });
  assert.equal(g.level, 1);
  assert.equal(g.phase, "wave");
});

test("player dies with no input and game over reports stats", () => {
  const g = new GameEngine();
  g.resize(800, 600);
  let end = null;
  g.on("end", (s) => (end = s));
  g.start("phantom");
  simulate(g, 60 * 20, { target: 0.5, axis: 0, fireHeld: false });
  assert.equal(g.state, "over");
  assert.equal(end.result, "over");
  assert.equal(g.player.hp, 0);
});

test("power-ups stack by max, not by sum; bomb clears enemies and has limited uses", () => {
  const g = new GameEngine();
  g.resize(800, 600);
  g.start("falcon");
  g.applyPowerUp("S");
  g.applyPowerUp("S");
  assert.ok(g.player.multi <= 10 * 1.3 + 1e-9);
  g.applyPowerUp("H");
  assert.equal(g.player.hp, g.player.maxHp);
  simulate(g, 6, { target: 0.5, axis: 0, fireHeld: false });
  for (let i = 0; i < 4; i++) g.spawnEnemy("drone");
  const bombs = g.player.bombs;
  assert.equal(g.useBomb(), true);
  assert.equal(g.enemies.items.filter((e) => !e.dead).length, 0);
  assert.equal(g.player.bombs, bombs - 1);
  assert.equal(g.useBomb(), false, "cooldown must block an immediate second bomb");
});

test("shield blocks damage and has a cooldown", () => {
  const g = new GameEngine();
  g.resize(800, 600);
  g.start("nova");
  simulate(g, 4, { target: 0.5, axis: 0, fireHeld: false });
  assert.equal(g.activateShield(), true);
  assert.equal(g.activateShield(), false);
  const hp = g.player.hp;
  g.hurtPlayer();
  assert.equal(g.player.hp, hp);
});

test("heal power-up heals instantly, then regenerates over time, capped at max HP", () => {
  const g = new GameEngine();
  g.resize(800, 600);
  g.start("titan");
  const p = g.player;
  for (let i = 0; i < 4; i++) {
    p.invuln = 0;
    g.hurtPlayer();
  }
  assert.equal(p.hp, p.maxHp - 4);
  g.applyPowerUp("H");
  assert.equal(p.hp, p.maxHp - 3, "instant +1");
  assert.ok(p.heal > 0, "heal buff active");
  p.invuln = 1e9;
  simulate(g, 10, { target: 0.5, axis: 0, fireHeld: false });
  assert.equal(p.heal, 0, "buff expires");
  assert.equal(p.hp, p.maxHp - 1, "+1 instant and +2 over time");

  p.hp = p.maxHp;
  const score = g.score;
  g.applyPowerUp("H");
  assert.equal(p.hp, p.maxHp, "never exceeds max HP");
  assert.ok(g.score > score, "overflow heal turns into score");
});
