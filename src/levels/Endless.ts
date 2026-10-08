import * as THREE from 'three';
import { makeRng } from '../util/rng';
import { isSingle, type SingleLevel } from './levels';
import { makeInsideTest, silhouetteBounds, SILHOUETTES } from './shapes';
import { WORLDS } from './worlds';

/** Design doc: Endless starts with 60 s, and its threshold is a little looser than the campaign's 0.90. */
export const ENDLESS_START_S = 60;
export const ENDLESS_THRESHOLD = 0.85;
/** The rewarded continue (once per run) puts this much time back. */
export const ENDLESS_CONTINUE_S = 30;
/** Silhouettes fuller than this share of their convex hull read as blobs (design doc rejection rule). */
const MAX_HULL_FILL = 0.92;
/** Time bonus per solve shrinks with each target, down to a floor. */
const BONUS_START_S = 20;
const BONUS_MIN_S = 8;
/** The score multiplier climbs while targets are solved within this many seconds, up to MAX_MULT. */
const FAST_SOLVE_S = 20;
const MAX_MULT = 5;
const BASE_POINTS = 100;

/** Share of a silhouette's convex hull that the silhouette fills (1 = convex blob). */
export function hullFill(name: string): number {
  const sil = SILHOUETTES[name]();
  const pts: THREE.Vector2[] = [];
  for (const s of sil) pts.push(...s.getPoints(24));
  const hull = convexHull(pts);
  let hullArea = 0;
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    hullArea += a.x * b.y - b.x * a.y;
  }
  hullArea = Math.abs(hullArea) / 2;
  // Parts overlap (a cat's head on its body), so measure the filled area on a grid instead of summing parts.
  const inside = makeInsideTest(sil);
  const box = silhouetteBounds(sil);
  const n = 64;
  const size = box.getSize(new THREE.Vector2());
  const p = new THREE.Vector2();
  let hits = 0;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) if (inside(p.set(box.min.x + ((x + 0.5) / n) * size.x, box.min.y + ((y + 0.5) / n) * size.y))) hits++;
  const filled = (hits / (n * n)) * size.x * size.y;
  return hullArea > 0 ? filled / hullArea : 1;
}

function convexHull(points: THREE.Vector2[]): THREE.Vector2[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: THREE.Vector2, a: THREE.Vector2, b: THREE.Vector2) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: THREE.Vector2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: THREE.Vector2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** World 1 objects Endless may use: not flagged out, and (procedural) whose silhouette isn't a blob. */
function endlessPool(): SingleLevel[] {
  return WORLDS[0].levels.filter(isSingle).filter((l) => l.endless !== false && (l.object.kind === 'model' || hullFill(l.object.silhouette) <= MAX_HULL_FILL));
}

/**
 * One Endless run: score, multiplier, timer and target generation. Targets reuse World 1 objects, each with a
 * random roll of its shadow on the wall (so it's always solvable), more clutter and all axes free as the run goes on.
 */
export class EndlessRun {
  score = 0;
  solved = 0;
  mult = 1;
  timeLeft = ENDLESS_START_S;
  continued = false;
  private rng: () => number;
  private pool = endlessPool();
  private lastId = '';

  constructor(seed = Math.floor(Math.random() * 2 ** 31)) {
    this.rng = makeRng(seed);
  }

  /** Seconds added for the next solve. */
  get bonus(): number {
    return Math.max(BONUS_MIN_S, BONUS_START_S - this.solved);
  }

  nextTarget(): SingleLevel {
    const r = this.rng;
    let base = this.pool[Math.floor(r() * this.pool.length)];
    if (base.id === this.lastId && this.pool.length > 1) base = this.pool[(this.pool.indexOf(base) + 1) % this.pool.length];
    this.lastId = base.id;
    const n = this.solved;
    const sign = () => (r() < 0.5 ? -1 : 1);
    // Roll the solution about the light axis: the target is the same silhouette, turned on the wall.
    const roll = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(sign() * (10 + r() * 50)));
    if (base.solution) roll.multiply(new THREE.Quaternion().fromArray(base.solution));
    const full = n >= 3;
    const object =
      base.object.kind === 'procedural'
        ? { ...base.object, seed: Math.floor(r() * 1e6), junk: Math.min(1, 0.45 + n * 0.06) }
        : base.object;
    return {
      ...base,
      id: `endless-${n + 1}`,
      object,
      solution: roll.toArray() as [number, number, number, number],
      freeAxes: full ? ['x', 'y', 'z'] : ['x', 'y'],
      startOffset: [sign() * (50 + r() * 50), sign() * (60 + r() * 60), full ? sign() * (20 + r() * 40) : 0],
      threshold: ENDLESS_THRESHOLD,
      parTime: FAST_SOLVE_S,
    };
  }

  /** Score a solve that took `time` seconds; returns the points and seconds it earned. */
  recordSolve(time: number): { points: number; bonus: number; mult: number } {
    const mult = this.mult;
    const points = BASE_POINTS * mult;
    const bonus = this.bonus;
    this.score += points;
    this.timeLeft += bonus;
    this.solved++;
    this.mult = time <= FAST_SOLVE_S ? Math.min(MAX_MULT, this.mult + 1) : 1;
    return { points, bonus, mult };
  }
}
