/**
 * World 3 (Workshop) light-control levels: one junk object each (shattered like World 1), and the player moves the
 * lamp around a hemisphere. The object is built facing the solution lamp (its junk runs along that light), so the
 * target appears only with the lamp in the right place. The build script writes the whole level JSON from this file.
 *
 * Teaching ramp (design doc): 3-1 and 3-2 move only the lamp (the object is fixed); from 3-3 the object turns
 * too. Scoring is on the wall, so the jobs split: turning the object fixes the shape, the lamp slides the shadow
 * onto the outline (and leans it a little).
 *
 * light: [yaw, pitch] in degrees from the default light (lamp right / up), inside LIGHT_RANGE (±15° yaw, 12° up,
 * 8° down: the pad's edge is that ellipse).
 */
import { SILHOUETTES } from '../../src/levels/shapes.ts';
import { C, Model } from './kit.mjs';

const TOOLS = [C.tin, C.brass, C.darkWood, C.orange, C.teal];
const BENCH = [C.wood, C.darkWood, C.sand, C.orange];

function object(shape, seed, { pieces, depth, junk, colors }) {
  return () => {
    const m = new Model(seed);
    m.shatter(SILHOUETTES[shape](), { pieces, depth, colors });
    m.junkify(junk, depth + 0.1);
    return m;
  };
}

export const W3_LEVELS = [
  {
    id: 'w3-01',
    name: 'snail_junk',
    targetName: 'Snail',
    build: object('snail', 3101, { pieces: 5, depth: 1.0, junk: 6, colors: BENCH }),
    freeAxes: [],
    startOffset: [0, 0, 0],
    light: { solution: [-3, 2], start: [13, 1] },
    threshold: 0.75,
    parTime: 20,
    reveal: 'roll',
    tip: 'Move the lamp to put the shadow on the outline',
  },
  {
    id: 'w3-02',
    name: 'owl_junk',
    targetName: 'Owl',
    build: object('owl', 3201, { pieces: 7, depth: 1.05, junk: 7, colors: TOOLS }),
    freeAxes: [],
    startOffset: [0, 0, 0],
    light: { solution: [5, -3], start: [-10, 6] },
    threshold: 0.75,
    parTime: 30,
    reveal: 'rock',
  },
  {
    id: 'w3-03',
    name: 'squirrel_junk',
    targetName: 'Squirrel',
    build: object('squirrel', 3301, { pieces: 7, depth: 1.05, junk: 7, colors: BENCH }),
    freeAxes: ['x', 'y'],
    startOffset: [60, -75, 0],
    light: { solution: [-5, -2], start: [10, 6] },
    threshold: 0.75,
    parTime: 40,
    reveal: 'hop',
    tip: 'Turn it for the shape · the lamp moves the shadow',
  },
  {
    id: 'w3-04',
    name: 'turtle_junk',
    targetName: 'Turtle',
    build: object('turtle', 3401, { pieces: 8, depth: 1.1, junk: 8, colors: TOOLS }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [80, -60, 40],
    light: { solution: [3, 4], start: [-10, -3] },
    threshold: 0.75,
    parTime: 45,
    reveal: 'roll',
  },
  {
    id: 'w3-05',
    name: 'dragonfly_junk',
    targetName: 'Dragonfly',
    build: object('dragonfly', 3501, { pieces: 9, depth: 0.8, junk: 6, colors: TOOLS }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [-90, 100, 50],
    light: { solution: [-6, 3], start: [9, -3] },
    threshold: 0.75,
    parTime: 50,
    reveal: 'flap',
  },
  {
    id: 'w3-06',
    name: 'frog_junk',
    targetName: 'Frog',
    build: object('frog', 3601, { pieces: 8, depth: 1.05, junk: 7, colors: BENCH }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [70, 95, -45],
    light: { solution: [7, 5], start: [-11, -4] },
    threshold: 0.75,
    parTime: 50,
    reveal: 'hop',
  },
  {
    id: 'w3-07',
    name: 'hedgehog_junk',
    targetName: 'Hedgehog',
    build: object('hedgehog', 3701, { pieces: 9, depth: 1.1, junk: 8, colors: TOOLS }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [-85, -90, 55],
    light: { solution: [-8, -4], start: [10, 8] },
    threshold: 0.75,
    parTime: 55,
    reveal: 'roll',
  },
  {
    id: 'w3-08',
    name: 'bee_junk',
    targetName: 'Bee',
    build: object('bee', 3801, { pieces: 9, depth: 1.05, junk: 7, colors: [C.brass, C.orange, C.darkWood, C.tin] }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [100, -80, 60],
    light: { solution: [9, 6], start: [-8, -5] },
    threshold: 0.75,
    parTime: 55,
    reveal: 'flap',
  },
  {
    id: 'w3-09',
    name: 'mouse_junk',
    targetName: 'Mouse',
    build: object('mouse', 3901, { pieces: 9, depth: 1.1, junk: 8, colors: BENCH }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [-95, 85, -60],
    light: { solution: [-10, 2], start: [10, -4] },
    threshold: 0.75,
    parTime: 60,
    reveal: 'hop',
  },
  {
    id: 'w3-10',
    name: 'fox_junk',
    targetName: 'Fox',
    build: object('fox', 4001, { pieces: 10, depth: 1.1, junk: 8, colors: [C.orange, C.darkWood, C.sand, C.tin] }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [90, 105, 50],
    light: { solution: [4, -5], start: [-11, 6] },
    threshold: 0.75,
    parTime: 60,
    reveal: 'sway',
  },
  {
    id: 'w3-11',
    name: 'crab_junk',
    targetName: 'Crab',
    build: object('crab', 4101, { pieces: 10, depth: 1.05, junk: 6, colors: [C.orange, C.tin, C.brass, C.darkWood] }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [-100, -95, 65],
    light: { solution: [11, -2], start: [-9, 8] },
    threshold: 0.75,
    parTime: 65,
    reveal: 'strum',
  },
  {
    id: 'w3-12',
    name: 'seahorse_junk',
    targetName: 'Seahorse',
    build: object('seahorse', 4201, { pieces: 10, depth: 1.1, junk: 7, colors: TOOLS }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [95, -100, -70],
    light: { solution: [-7, 7], start: [11, -4] },
    threshold: 0.75,
    parTime: 65,
    reveal: 'swim',
  },
  {
    id: 'w3-13',
    name: 'hen_junk',
    targetName: 'Hen',
    build: object('hen', 4301, { pieces: 11, depth: 1.1, junk: 8, colors: BENCH }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [-105, 90, 55],
    light: { solution: [6, -6], start: [-12, 6] },
    threshold: 0.75,
    parTime: 70,
    reveal: 'stomp',
  },
  {
    id: 'w3-14',
    name: 'bat_junk',
    targetName: 'Bat',
    build: object('bat', 4401, { pieces: 11, depth: 1.05, junk: 6, colors: [C.darkWood, C.tin, C.teal, C.wood] }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [110, 85, -65],
    light: { solution: [-12, -3], start: [9, 8] },
    threshold: 0.75,
    parTime: 75,
    reveal: 'flap',
  },
  {
    id: 'w3-15',
    name: 'deer_junk',
    targetName: 'Deer',
    build: object('deer', 4501, { pieces: 12, depth: 1.15, junk: 9, colors: TOOLS }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [-100, -110, 70],
    light: { solution: [9, 8], start: [-10, -4] },
    threshold: 0.75,
    parTime: 80,
    reveal: 'stomp',
  },
];
