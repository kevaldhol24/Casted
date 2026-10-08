/** Screen-space rotation axes: x = pitch (drag up/down), y = yaw (drag left/right), z = roll. */
export type Axis = 'x' | 'y' | 'z';

export interface LevelDef {
  id: string;
  world: number;
  targetName: string;
  /** Key into SILHOUETTES. */
  silhouette: string;
  /** Procedural object: seed + how much junk. (Phase 2 replaces this with authored GLB models.) */
  seed: number;
  junk: number;
  /** Axes the player may rotate; others are locked. */
  freeAxes: Axis[];
  /** Start offset from the solution, as screen-space Euler degrees applied in x, y, z order. */
  startOffset: [number, number, number];
  threshold: number;
  parTime: number;
  allowMirror: boolean;
}

/** World 1 (The Attic), levels 1–5 — the prototype set from the design doc's "first 10 levels" table. */
export const LEVELS: LevelDef[] = [
  {
    id: 'w1-01', world: 1, targetName: 'Heart', silhouette: 'heart', seed: 101, junk: 0.6,
    freeAxes: ['y'], startOffset: [0, 90, 0], threshold: 0.9, parTime: 10, allowMirror: true,
  },
  {
    id: 'w1-02', world: 1, targetName: 'Star', silhouette: 'star', seed: 202, junk: 0.9,
    freeAxes: ['y'], startOffset: [0, -95, 0], threshold: 0.9, parTime: 15, allowMirror: true,
  },
  {
    id: 'w1-03', world: 1, targetName: 'House', silhouette: 'house', seed: 303, junk: 1.0,
    freeAxes: ['x'], startOffset: [118, 0, 0], threshold: 0.9, parTime: 20, allowMirror: false,
  },
  {
    id: 'w1-04', world: 1, targetName: 'Fish', silhouette: 'fish', seed: 404, junk: 1.1,
    freeAxes: ['x', 'y'], startOffset: [-72, 85, 0], threshold: 0.9, parTime: 25, allowMirror: false,
  },
  {
    id: 'w1-05', world: 1, targetName: 'Cat', silhouette: 'cat', seed: 505, junk: 1.3,
    freeAxes: ['x', 'y', 'z'], startOffset: [75, -110, 40], threshold: 0.9, parTime: 35, allowMirror: false,
  },
];
