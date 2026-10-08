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
  // 6–7: practice with full rotation; first "looks like nothing" object, then thin features.
  {
    id: 'w1-06', world: 1, targetName: 'Teapot', silhouette: 'teapot', seed: 606, junk: 1.4,
    freeAxes: ['x', 'y', 'z'], startOffset: [-80, 100, -30], threshold: 0.9, parTime: 40, allowMirror: false,
  },
  {
    id: 'w1-07', world: 1, targetName: 'Bird', silhouette: 'bird', seed: 707, junk: 1.3,
    freeAxes: ['x', 'y', 'z'], startOffset: [95, 70, 50], threshold: 0.9, parTime: 40, allowMirror: false,
  },
  // 8–12: challenge. Level 8 introduces the hint button (one free hint).
  {
    id: 'w1-08', world: 1, targetName: 'Umbrella', silhouette: 'umbrella', seed: 808, junk: 1.5,
    freeAxes: ['x', 'y', 'z'], startOffset: [110, -60, 70], threshold: 0.9, parTime: 45, allowMirror: false,
  },
  {
    id: 'w1-09', world: 1, targetName: 'Bicycle', silhouette: 'bicycle', seed: 909, junk: 1.4,
    freeAxes: ['x', 'y', 'z'], startOffset: [-70, 120, 35], threshold: 0.9, parTime: 60, allowMirror: false,
  },
  {
    id: 'w1-10', world: 1, targetName: 'Rocking horse', silhouette: 'rockingHorse', seed: 1010, junk: 1.5,
    freeAxes: ['x', 'y', 'z'], startOffset: [85, -95, -60], threshold: 0.9, parTime: 60, allowMirror: false,
  },
  {
    id: 'w1-11', world: 1, targetName: 'Key', silhouette: 'key', seed: 1111, junk: 1.6,
    freeAxes: ['x', 'y', 'z'], startOffset: [-100, -80, 45], threshold: 0.9, parTime: 50, allowMirror: false,
  },
  {
    id: 'w1-12', world: 1, targetName: 'Rabbit', silhouette: 'rabbit', seed: 1212, junk: 1.6,
    freeAxes: ['x', 'y', 'z'], startOffset: [75, 130, -40], threshold: 0.9, parTime: 55, allowMirror: false,
  },
  // 13–14: hard — more misleading junk and a stricter threshold.
  {
    id: 'w1-13', world: 1, targetName: 'Guitar', silhouette: 'guitar', seed: 1313, junk: 1.8,
    freeAxes: ['x', 'y', 'z'], startOffset: [-120, 75, 80], threshold: 0.91, parTime: 75, allowMirror: false,
  },
  {
    id: 'w1-14', world: 1, targetName: 'Anchor', silhouette: 'anchor', seed: 1414, junk: 1.9,
    freeAxes: ['x', 'y', 'z'], startOffset: [90, -125, -70], threshold: 0.92, parTime: 80, allowMirror: false,
  },
  // 15: showpiece, unlocks World 2.
  {
    id: 'w1-15', world: 1, targetName: 'Elephant', silhouette: 'elephant', seed: 1515, junk: 1.9,
    freeAxes: ['x', 'y', 'z'], startOffset: [-105, 140, 55], threshold: 0.92, parTime: 90, allowMirror: false,
  },
];

/** The hint button appears from this level on (design doc: level 8 introduces hints with one free use). */
export const HINTS_FROM_LEVEL = 8;
