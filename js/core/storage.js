const PREFIX = "sfg_";
const BOARD_SIZE = 10;

export const storage = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      /* storage full or disabled: progress just won't persist */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  },
};

/** High score, best level, local leaderboard and last selected ship. */
export class Records {
  constructor() {
    const legacyHigh = Number(localStorage.getItem("ss_high")) || 0;
    this.high = storage.get("high", legacyHigh);
    this.highestLevel = storage.get("highestLevel", 1);
    this.board = storage.get("leaderboard", []);
    this.playerName = storage.get("playerName", "PLAYER");
    this.shipId = storage.get("ship", null);
  }

  setShip(id) {
    this.shipId = id;
    storage.set("ship", id);
  }

  setPlayerName(name) {
    this.playerName = (name || "PLAYER").slice(0, 16);
    storage.set("playerName", this.playerName);
  }

  noteLevel(level) {
    if (level > this.highestLevel) {
      this.highestLevel = level;
      storage.set("highestLevel", level);
    }
  }

  /** Never lowers the high score; returns leaderboard rank (or -1). */
  submit(entry) {
    const isNewHigh = entry.score > this.high;
    if (isNewHigh) {
      this.high = entry.score;
      storage.set("high", this.high);
    }
    this.noteLevel(entry.level);
    let rank = -1;
    if (entry.score > 0) {
      this.board.push(entry);
      this.board.sort((a, b) => b.score - a.score);
      this.board = this.board.slice(0, BOARD_SIZE);
      rank = this.board.indexOf(entry);
      storage.set("leaderboard", this.board);
    }
    return { isNewHigh, rank };
  }

  rename(entry, name) {
    if (!entry) return;
    entry.name = (name || "PLAYER").slice(0, 16);
    storage.set("leaderboard", this.board);
  }

  clearBoard() {
    this.board = [];
    storage.set("leaderboard", this.board);
  }
}
