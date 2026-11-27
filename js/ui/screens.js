import { $, setText, formatTime } from "./dom.js";
import { SHIPS, SHIP_ORDER } from "../game/defs.js";
import { drawShipPreview } from "../render/renderer.js";

const SCREENS = ["menu", "ships", "howto", "settings", "leaderboard", "pause", "end"];

/** Shows one overlay screen at a time and remembers where "BACK" should go. */
export class ScreenManager {
  constructor() {
    this.current = "menu";
    this.stack = [];
    this.onChange = null;
  }

  show(name, { push = false } = {}) {
    if (push && this.current && this.current !== name) this.stack.push(this.current);
    if (!push) this.stack = [];
    for (const s of SCREENS) $(s).classList.toggle("hidden", s !== name);
    const prev = this.current;
    this.current = name;
    this.onChange?.(name, prev);
    const first = name ? $(name).querySelector(".btn.primary, .btn, button") : null;
    if (first && document.activeElement?.closest?.(".screen") !== $(name)) first.focus({ preventScroll: true });
  }

  hideAll() {
    for (const s of SCREENS) $(s).classList.add("hidden");
    const prev = this.current;
    this.current = null;
    this.stack = [];
    this.onChange?.(null, prev);
  }

  back() {
    const to = this.stack.pop() ?? "menu";
    this.show(to, { push: false });
    return to;
  }
}

export class ShipSelect {
  constructor(onPick) {
    this.onPick = onPick;
    this.selected = "falcon";
    this.cards = {};
    const grid = $("shipGrid");
    for (const id of SHIP_ORDER) {
      const s = SHIPS[id];
      const card = document.createElement("button");
      card.className = "ship-card";
      card.type = "button";
      card.setAttribute("role", "radio");
      card.dataset.ship = id;
      card.innerHTML = `<canvas width="192" height="192" aria-hidden="true"></canvas><span>${s.name}</span><small>${s.role}</small><span class="tag"></span>`;
      card.addEventListener("click", () => this.select(id));
      card.addEventListener("keydown", (e) => {
        const i = SHIP_ORDER.indexOf(this.selected);
        if (e.key === "ArrowRight" || e.key === "ArrowDown") this.select(SHIP_ORDER[(i + 1) % 4], true);
        else if (e.key === "ArrowLeft" || e.key === "ArrowUp") this.select(SHIP_ORDER[(i + 3) % 4], true);
        else return;
        e.preventDefault();
      });
      grid.appendChild(card);
      this.cards[id] = { card, canvas: card.querySelector("canvas"), tag: card.querySelector(".tag") };
    }
  }

  open(current) {
    this.confirmed = current;
    this.select(current);
  }

  select(id, focus = false) {
    this.selected = id;
    const s = SHIPS[id];
    for (const [cid, c] of Object.entries(this.cards)) {
      c.card.setAttribute("aria-checked", String(cid === id));
      c.card.tabIndex = cid === id ? 0 : -1;
      setText(c.tag, cid === this.confirmed ? "SELECTED" : "");
    }
    if (focus) this.cards[id].card.focus();
    setText($("shipName"), s.name);
    $("shipName").style.color = s.color;
    setText($("shipRole"), s.role);
    $("statSpeed").style.width = `${s.stats.speed * 20}%`;
    $("statAttack").style.width = `${s.stats.attack * 20}%`;
    $("statDefense").style.width = `${s.stats.defense * 20}%`;
    setText($("shipAbility"), `ABILITY: ${s.ability}`);
    setText($("shipAbilityTh"), s.abilityTh);
    setText($("shipNumbers"), `HP ${s.maxHp} · ยิงทุก ${s.fireRate}s · ดาเมจ ${s.damage} · ความเร็ว x${s.speed}`);
    this.onPick?.(id, false);
  }

  draw(t) {
    drawShipPreview($("shipBig"), this.selected, t, true);
    for (const [id, c] of Object.entries(this.cards)) drawShipPreview(c.canvas, id, id === this.selected ? t : 0);
  }
}

export function renderLeaderboard(records) {
  const body = $("boardBody");
  if (!records.board.length) {
    body.innerHTML = `<tr><td colspan="5" class="empty">ยังไม่มีสถิติ ลองเล่นสักรอบ!</td></tr>`;
    return;
  }
  body.replaceChildren(
    ...records.board.map((e, i) => {
      const tr = document.createElement("tr");
      for (const v of [i + 1, e.name, e.score.toLocaleString(), e.level, SHIPS[e.ship]?.name ?? "-"]) {
        const td = document.createElement("td");
        td.textContent = v;
        tr.appendChild(td);
      }
      return tr;
    }),
  );
}

export function renderEnd(stats, records, isNewHigh) {
  const victory = stats.result === "victory";
  const title = $("endTitle");
  title.textContent = victory ? "VICTORY" : "GAME OVER";
  title.classList.toggle("victory", victory);
  $("endNew").classList.toggle("hidden", !isNewHigh);
  setText($("endScore"), stats.score.toLocaleString());
  setText($("endHigh"), records.high.toLocaleString());
  setText($("endLevel"), stats.level);
  setText($("endKills"), stats.kills);
  setText($("endBosses"), stats.bosses);
  setText($("endAcc"), `${Math.round(stats.accuracy * 100)}%`);
  setText($("endCombo"), stats.maxCombo);
  setText($("endTime"), formatTime(stats.time));
}
