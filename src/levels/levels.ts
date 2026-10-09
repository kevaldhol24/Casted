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

type Quat = [number, number, number, number];
type Vec3 = [number, number, number];

/** Fields every level has, whatever it asks the player to turn. */
interface LevelBase {
  id: string;
  world: number;
  targetName: string;
  threshold: number;
  parTime: number;
  allowMirror: boolean;
  reveal?: RevealKind;
  /** false = leave this object out of Endless (its shadow is a near-convex blob, like the heart). */
  endless?: boolean;
  /** Target mask PNG (relative to the site root) — the Album draws it for model levels. */
  mask?: string;
  /** Light control (World 3+): the player moves the lamp around a hemisphere. */
  light?: LevelLight;
  /** One-line toast when play starts (teaching levels). */
  tip?: string;
}

/**
 * Lamp position as degrees from the default light: yaw (lamp to the right, as the player sees it) and pitch
 * (lamp higher), inside LIGHT_RANGE (src/shadow/ShadowScene.ts: ±15° yaw, 12° up, 8° down).
 */
export interface LevelLight {
  /** Where the lamp must be. The object's solution is relative to this light's view. */
  solution: [number, number];
  start: [number, number];
}

/** One level, as stored in src/data/levels/w<world>/<id>.json (written by tools/level-editor.html). */
export interface SingleLevel extends LevelBase {
  object: LevelObject;
  /**
   * Solution rotation as a quaternion [x, y, z, w] in light space (relative to the mask camera's frame).
   * Omitted = identity: the object's local Z points at the light and local Y is light-space up (procedural objects).
   */
  solution?: Quat;
  /** Axes the player may rotate; others are locked. */
  freeAxes: Axis[];
  /** Start offset from the solution, as screen-space Euler degrees applied in x, y, z order. */
  startOffset: Vec3;
}

/** One object of an assembly level (World 2+): turned on its own; all pieces' shadows together make the target. */
export interface LevelPiece {
  object: LevelObject;
  /** Where the piece's centre sits, in light space (x right, y up on the wall, z towards the light), world units. */
  offset: Vec3;
  /** Size after the model's normalisation (procedural objects: after OBJECT_SIZE). */
  scale: number;
  solution?: Quat;
  freeAxes: Axis[];
  startOffset: Vec3;
  /** Starts solved and can't be turned (the design doc's first assembly level: one object pre-solved). */
  locked?: boolean;
}

/** Assembly level (design doc World 2): 2–3 objects rotated separately; tap / Tab switches the active one. */
export interface AssemblyLevel extends LevelBase {
  pieces: LevelPiece[];
}

export type LevelDef = SingleLevel | AssemblyLevel;

export const isAssembly = (l: LevelDef): l is AssemblyLevel => 'pieces' in l;
export const isSingle = (l: LevelDef): l is SingleLevel => !('pieces' in l);

/** A level's pieces; a single-object level is one piece at the centre, unscaled. */
export function levelPieces(l: LevelDef): LevelPiece[] {
  if (isAssembly(l)) return l.pieces;
  return [{ object: l.object, offset: [0, 0, 0], scale: 1, solution: l.solution, freeAxes: l.freeAxes, startOffset: l.startOffset }];
}

const files = import.meta.glob<LevelDef>('../data/levels/*/*.json', { eager: true, import: 'default' });

/** Every level, ordered by world then id. */
export const LEVELS: LevelDef[] = Object.values(files).sort((a, b) => a.world - b.world || a.id.localeCompare(b.id));

/** The hint button appears from this level on (design doc: level 8 introduces hints with one free use). */
export const HINTS_FROM_LEVEL = 8;
