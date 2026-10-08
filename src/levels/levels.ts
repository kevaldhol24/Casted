/** Screen-space rotation axes: x = pitch (drag up/down), y = yaw (drag left/right), z = roll. */
export type Axis = 'x' | 'y' | 'z';

/** How the painted shadow comes alive in the reveal (see ShadowScene's outline shader). */
export const REVEALS = ['none', 'pulse', 'spin', 'hop', 'swim', 'flap', 'rock', 'tilt', 'sway', 'swing', 'roll', 'stomp', 'strum'] as const;
export type RevealKind = (typeof REVEALS)[number];

export type LevelObject =
  /** Built at load by junkify() from a 2D silhouette in shapes.ts. */
  | { kind: 'procedural'; silhouette: string; seed: number; junk: number }
  /** An authored GLB (Draco allowed), path relative to the site root, e.g. "models/w1/bird.glb". */
  | { kind: 'model'; url: string };

/** One level, as stored in src/data/levels/w<world>/<id>.json (written by tools/level-editor.html). */
export interface LevelDef {
  id: string;
  world: number;
  targetName: string;
  object: LevelObject;
  /**
   * Solution rotation as a quaternion [x, y, z, w] in light space (relative to the mask camera's frame).
   * Omitted = identity: the object's local Z points at the light and local Y is light-space up (procedural objects).
   */
  solution?: [number, number, number, number];
  /** Axes the player may rotate; others are locked. */
  freeAxes: Axis[];
  /** Start offset from the solution, as screen-space Euler degrees applied in x, y, z order. */
  startOffset: [number, number, number];
  threshold: number;
  parTime: number;
  allowMirror: boolean;
  reveal?: RevealKind;
  /** false = leave this object out of Endless (its shadow is a near-convex blob, like the heart). */
  endless?: boolean;
  /** Target mask PNG (relative to the site root) — the Album draws it for model levels. */
  mask?: string;
}

const files = import.meta.glob<LevelDef>('../data/levels/*/*.json', { eager: true, import: 'default' });

/** Every level, ordered by world then id. */
export const LEVELS: LevelDef[] = Object.values(files).sort((a, b) => a.world - b.world || a.id.localeCompare(b.id));

/** The hint button appears from this level on (design doc: level 8 introduces hints with one free use). */
export const HINTS_FROM_LEVEL = 8;
