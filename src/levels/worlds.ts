import { LEVELS, type LevelDef } from './levels';

export type Unlock = { kind: 'start' } | { kind: 'world'; world: number } | { kind: 'stars'; stars: number };

export interface WorldDef {
  id: number;
  name: string;
  /** Card colours: background and accent, from the design doc's palette table. */
  colors: [string, string];
  unlock: Unlock;
  levels: LevelDef[];
}

/** Launch worlds. The Attic, Kitchen and Workshop have levels; the rest show their unlock rule and "Coming soon". */
export const WORLDS: WorldDef[] = [
  { id: 1, name: 'The Attic', colors: ['#5a4232', '#f2a43a'], unlock: { kind: 'start' }, levels: LEVELS.filter((l) => l.world === 1) },
  { id: 2, name: 'The Kitchen', colors: ['#d9cfb8', '#5fc9a4'], unlock: { kind: 'world', world: 1 }, levels: LEVELS.filter((l) => l.world === 2) },
  { id: 3, name: 'The Workshop', colors: ['#1f4a4a', '#f08a3c'], unlock: { kind: 'stars', stars: 25 }, levels: LEVELS.filter((l) => l.world === 3) },
  { id: 4, name: 'The Theatre', colors: ['#5a1820', '#e8c25a'], unlock: { kind: 'stars', stars: 55 }, levels: [] },
];

export function unlockText(u: Unlock): string {
  if (u.kind === 'world') return `Finish World ${u.world}`;
  if (u.kind === 'stars') return `${u.stars} stars`;
  return '';
}

/** Mode unlocks from the design doc. */
export const MODE_UNLOCKS = {
  daily: { levelId: 'w1-05', text: 'Solve level 5' },
  endless: { levelId: 'w1-15', text: 'Finish World 1' },
  zen: { levelId: 'w2-15', text: 'Finish World 2' },
} as const;
