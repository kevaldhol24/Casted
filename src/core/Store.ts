export interface LevelRecord {
  stars: number;
  bestTime: number;
}

export interface SaveData {
  saveVersion: 1;
  levels: Record<string, LevelRecord>;
  bulbs: number;
  /** Level 8 gives one free hint, once ever. */
  freeHintUsed: boolean;
  /** UTC date (YYYY-MM-DD) of the last daily-login Bulb. */
  lastLogin: string;
  settings: { sensitivity: number; reduceMotion: boolean; muted: boolean; music: number; sfx: number };
}

const KEY = 'casted.save';

export const defaultSave = (): SaveData => ({
  saveVersion: 1,
  levels: {},
  bulbs: 3,
  freeHintUsed: false,
  lastLogin: '',
  settings: { sensitivity: 1, reduceMotion: false, muted: false, music: 0.7, sfx: 0.8 },
});

/** Bulb rewards from the design doc's economy table. */
export const BULBS = { firstSolve: 1, threeStarBonus: 1, rewardedAd: 2, dailyLogin: 1 } as const;
export const HINT_COST = { nudge: 1, peek: 2, reveal: 3 } as const;
export type HintTier = keyof typeof HINT_COST;

/** Versioned local save. Corrupt or missing data falls back to defaults; storage errors never crash the game. */
export class Store {
  data: SaveData;

  constructor() {
    this.data = Store.read();
  }

  private static read(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.saveVersion !== 1) return defaultSave();
      const d = defaultSave();
      return {
        ...d,
        ...parsed,
        levels: { ...(parsed.levels ?? {}) },
        settings: { ...d.settings, ...(parsed.settings ?? {}) },
      } as SaveData;
    } catch {
      return defaultSave();
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode / quota: keep playing without persistence */
    }
  }

  /** Records a solve and pays Bulbs (first solve +1, first 3-star +1). Returns the Bulbs earned. */
  recordSolve(id: string, stars: number, time: number): number {
    const prev = this.data.levels[id];
    let earned = 0;
    if (!prev) earned += BULBS.firstSolve;
    if (stars === 3 && (prev?.stars ?? 0) < 3) earned += BULBS.threeStarBonus;
    this.data.levels[id] = { stars: Math.max(prev?.stars ?? 0, stars), bestTime: Math.min(prev?.bestTime ?? Infinity, time) };
    this.data.bulbs += earned;
    this.save();
    return earned;
  }

  /** +1 Bulb once per UTC day. Returns true when granted. */
  claimDailyLogin(): boolean {
    const today = new Date().toISOString().slice(0, 10);
    if (this.data.lastLogin === today) return false;
    const first = this.data.lastLogin === '';
    this.data.lastLogin = today;
    if (!first) this.data.bulbs += BULBS.dailyLogin;
    this.save();
    return !first;
  }

  addBulbs(n: number) {
    this.data.bulbs += n;
    this.save();
  }

  spendBulbs(n: number): boolean {
    if (this.data.bulbs < n) return false;
    this.data.bulbs -= n;
    this.save();
    return true;
  }

  isSolved(id: string) {
    return (this.data.levels[id]?.stars ?? 0) > 0;
  }

  stars(id: string) {
    return this.data.levels[id]?.stars ?? 0;
  }
}
