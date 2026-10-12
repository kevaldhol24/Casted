import { daysBetween } from '../levels/Daily';
import { localSaveStorage, type SaveStorage } from '../portal/Portal';
import type { QualitySetting } from './Quality';

export interface LevelRecord {
  stars: number;
  bestTime: number;
}

/** The latest Daily Shadow played, for the result card and share text. */
export interface DailyResult {
  date: string;
  stars: number;
  time: number;
  hints: number;
  /** The rewarded "second attempt at 3 stars" was used. */
  retried: boolean;
  /** The rewarded "double reward" was used. */
  doubled: boolean;
}

export interface SaveData {
  saveVersion: 1;
  levels: Record<string, LevelRecord>;
  bulbs: number;
  /** Level 8 gives one free hint, once ever. */
  freeHintUsed: boolean;
  /** UTC date (YYYY-MM-DD) of the last daily-login Bulb. */
  lastLogin: string;
  daily: {
    /** UTC date of the last solved Daily Shadow. */
    lastSolved: string;
    streak: number;
    bestStreak: number;
    /** Each one covers a missed day; one is earned every 7 streak days. */
    shields: number;
    last: DailyResult | null;
  };
  endlessBest: number;
  settings: {
    sensitivity: number;
    reduceMotion: boolean;
    muted: boolean;
    music: number;
    sfx: number;
    quality: QualitySetting;
  };
}

const KEY = 'casted.save';

export const defaultSave = (): SaveData => ({
  saveVersion: 1,
  levels: {},
  bulbs: 3,
  freeHintUsed: false,
  lastLogin: '',
  daily: { lastSolved: '', streak: 0, bestStreak: 0, shields: 0, last: null },
  endlessBest: 0,
  settings: { sensitivity: 1, reduceMotion: false, muted: false, music: 0.7, sfx: 0.8, quality: 'auto' },
});

/**
 * Bulb rewards. Levels pay only for skill: +1 the first time a level gets 3 stars (no hints, inside par time); a plain
 * solve pays nothing (the design doc's +1 first-solve reward was dropped: hints were too plentiful).
 */
export const BULBS = { threeStar: 1, rewardedAd: 2, dailyLogin: 1, dailySolve: 2 } as const;
const MAX_SHIELDS = 3;
const SHIELD_EVERY = 7;
export const HINT_COST = { nudge: 1, peek: 2, reveal: 3 } as const;
export type HintTier = keyof typeof HINT_COST;

/**
 * Versioned save in the portal's storage (CrazyGames: its Data module; otherwise localStorage). Corrupt or missing
 * data falls back to defaults; storage errors never crash the game.
 */
export class Store {
  data: SaveData;

  constructor(private storage: SaveStorage = localSaveStorage()) {
    this.data = Store.read(storage);
  }

  /** True when a save exists (a returning player). */
  static exists(storage: SaveStorage): boolean {
    try {
      return !!storage.getItem(KEY);
    } catch {
      return false;
    }
  }

  private static read(storage: SaveStorage): SaveData {
    try {
      // A portal save that is still empty picks up a save this browser already holds locally.
      const raw = storage.getItem(KEY) ?? localSaveStorage().getItem(KEY);
      if (!raw) return defaultSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      if (parsed.saveVersion !== 1) return defaultSave();
      const d = defaultSave();
      return {
        ...d,
        ...parsed,
        levels: { ...(parsed.levels ?? {}) },
        daily: { ...d.daily, ...(parsed.daily ?? {}) },
        settings: { ...d.settings, ...(parsed.settings ?? {}) },
      } as SaveData;
    } catch {
      return defaultSave();
    }
  }

  save() {
    try {
      this.storage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* private mode / quota: keep playing without persistence */
    }
  }

  /** Records a solve and pays Bulbs (+1 for the level's first 3 stars). Returns the Bulbs earned. */
  recordSolve(id: string, stars: number, time: number): number {
    const prev = this.data.levels[id];
    let earned = 0;
    if (stars === 3 && (prev?.stars ?? 0) < 3) earned += BULBS.threeStar;
    this.data.levels[id] = { stars: Math.max(prev?.stars ?? 0, stars), bestTime: Math.min(prev?.bestTime ?? Infinity, time) };
    this.data.bulbs += earned;
    this.save();
    return earned;
  }

  /**
   * Records a Daily Shadow solve. The first solve of a date pays Bulbs and moves the streak: +1 after
   * yesterday, shields cover missed days, otherwise it restarts at 1. A replay of the same date (the rewarded
   * retry) only keeps the better stars and time. Returns the Bulbs earned.
   */
  recordDaily(date: string, stars: number, time: number, hints: number): number {
    const d = this.data.daily;
    if (d.last?.date === date) {
      if (stars > d.last.stars || (stars === d.last.stars && time < d.last.time)) Object.assign(d.last, { stars, time, hints });
      this.save();
      return 0;
    }
    const missed = d.lastSolved ? daysBetween(d.lastSolved, date) - 1 : Infinity;
    // missed < 0 only if the clock went backwards: keep the streak as it is.
    if (missed < 0) d.streak = Math.max(1, d.streak);
    else if (missed <= d.shields) {
      d.shields -= missed;
      d.streak++;
    } else d.streak = 1;
    if (missed >= 0 && d.streak % SHIELD_EVERY === 0) d.shields = Math.min(MAX_SHIELDS, d.shields + 1);
    d.bestStreak = Math.max(d.bestStreak, d.streak);
    d.lastSolved = date;
    d.last = { date, stars, time, hints, retried: false, doubled: false };
    this.data.bulbs += BULBS.dailySolve;
    this.save();
    return BULBS.dailySolve;
  }

  /** The streak as it stands today: 0 once more days were missed than shields can cover. */
  dailyStreak(today: string): number {
    const d = this.data.daily;
    if (!d.lastSolved) return 0;
    const missed = daysBetween(d.lastSolved, today) - 1;
    return missed <= d.shields ? d.streak : 0;
  }

  /** Saves the run's score if it's a new best. Returns true for a new best. */
  recordEndless(score: number): boolean {
    if (score <= this.data.endlessBest) return false;
    this.data.endlessBest = score;
    this.save();
    return true;
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

  totalStars(ids: string[]) {
    return ids.reduce((a, id) => a + this.stars(id), 0);
  }

  stars(id: string) {
    return this.data.levels[id]?.stars ?? 0;
  }
}
