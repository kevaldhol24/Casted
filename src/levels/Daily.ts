import { hashString, makeRng } from '../util/rng';
import type { LevelDef } from './levels';
import { WORLDS } from './worlds';

/** Daily #1 is this UTC date; the number in the share text counts up from it. */
const DAILY_EPOCH = '2026-10-01';
const DAY_MS = 86_400_000;
/** Full rotation takes longer than the campaign level the object comes from. */
const PAR_EXTRA_S = 15;

/** Today's UTC date as YYYY-MM-DD: every player in the world gets the same puzzle on the same date. */
export function utcDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Whole days from date a to date b (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY_MS);
}

export function dailyNumber(date: string): number {
  return daysBetween(DAILY_EPOCH, date) + 1;
}

/**
 * The Daily Shadow for a date, picked with no server: seed = hash of the date. It reuses a World 1 object
 * (never yesterday's), with all three axes free and a seeded start offset. Procedural objects also get a
 * fresh junk seed, so the clutter differs from the campaign level.
 */
export function dailyLevel(date: string): LevelDef {
  const pool = WORLDS[0].levels;
  const pick = (d: string) => hashString(`casted-daily-${d}`) % pool.length;
  let i = pick(date);
  const yesterday = utcDate(new Date(Date.parse(date) - DAY_MS));
  if (i === pick(yesterday)) i = (i + 1 + (hashString(date) % (pool.length - 1))) % pool.length;
  const base = pool[i];
  const rng = makeRng(hashString(`casted-daily-start-${date}`));
  const angle = () => (rng() < 0.5 ? -1 : 1) * (55 + rng() * 55);
  const object = base.object.kind === 'procedural' ? { ...base.object, seed: Math.floor(rng() * 1e6), junk: Math.max(base.object.junk, 0.7) } : base.object;
  return {
    ...base,
    id: `daily-${date}`,
    object,
    freeAxes: ['x', 'y', 'z'],
    startOffset: [angle(), angle(), angle() * 0.5],
    parTime: base.parTime + PAR_EXTRA_S,
  };
}

const fmtTime = (s: number) => {
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/** Design doc share text: "Casted Daily #142 ⭐⭐⭐ 0:38 no hints" plus a link to the game page. */
export function shareText(date: string, stars: number, time: number, hints: number, url: string): string {
  const starText = '⭐'.repeat(stars) + '☆'.repeat(3 - stars);
  const hintText = hints === 0 ? 'no hints' : hints === 1 ? '1 hint' : `${hints} hints`;
  return `Casted Daily #${dailyNumber(date)} ${starText} ${fmtTime(time)} ${hintText}\n${url}`;
}
