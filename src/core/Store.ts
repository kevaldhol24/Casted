export interface LevelRecord {
  stars: number;
  bestTime: number;
}

export interface SaveData {
  saveVersion: 1;
  levels: Record<string, LevelRecord>;
  bulbs: number;
  settings: { sensitivity: number; reduceMotion: boolean; muted: boolean };
}

const KEY = 'casted.save';

export const defaultSave = (): SaveData => ({
  saveVersion: 1,
  levels: {},
  bulbs: 3,
  settings: { sensitivity: 1, reduceMotion: false, muted: false },
});

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

  /** Records a solve; returns true if it improved the stored result. */
  recordSolve(id: string, stars: number, time: number): boolean {
    const prev = this.data.levels[id];
    const next = { stars: Math.max(prev?.stars ?? 0, stars), bestTime: Math.min(prev?.bestTime ?? Infinity, time) };
    this.data.levels[id] = next;
    this.save();
    return !prev || next.stars > prev.stars || next.bestTime < prev.bestTime;
  }

  isSolved(id: string) {
    return (this.data.levels[id]?.stars ?? 0) > 0;
  }

  stars(id: string) {
    return this.data.levels[id]?.stars ?? 0;
  }
}
