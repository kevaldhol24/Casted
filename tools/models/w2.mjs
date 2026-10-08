/**
 * World 2 (Kitchen) assembly levels: each target split into pieces the player turns separately. Every piece is
 * its part of the silhouette (src/levels/shapes.ts) shattered into kitchen junk, like World 1. The build script
 * places and sizes the pieces and writes the whole level JSON from this file.
 *
 * Teaching ramp (design doc): 2-1 has one piece pre-solved (locked); from 2-2 both pieces turn and the player
 * switches between them (tap / click / Tab). Every piece turns on all three axes (World 1 already taught full
 * rotation); easier pieces just start with no roll.
 */
import { SILHOUETTES } from '../../src/levels/shapes.ts';
import { C, Model } from './kit.mjs';

const CROCKERY = [C.cream, C.pale, C.blue, C.tin];
const TINS = [C.tin, C.red, C.cream, C.green];
const WOODEN = [C.wood, C.darkWood, C.sand, C.pale];

/** A piece built from silhouette `shape`: shattered into `pieces` plates within ±depth, plus `junk` clutter. */
function piece(name, shape, seed, { pieces, depth, junk, colors }, play) {
  return {
    name,
    ...play,
    build() {
      const m = new Model(seed);
      m.shatter(SILHOUETTES[shape](), { pieces, depth, colors });
      m.junkify(junk, depth + 0.1);
      return m;
    },
  };
}

export const W2_LEVELS = [
  {
    id: 'w2-01',
    targetName: 'Mushroom',
    threshold: 0.9,
    parTime: 25,
    reveal: 'pulse',
    pieces: [
      piece('mushroom_cap_junk', 'mushroomCap', 2101, { pieces: 4, depth: 0.5, junk: 5, colors: CROCKERY }, { freeAxes: ['x', 'y', 'z'], startOffset: [70, -95, 0] }),
      piece('mushroom_stem_junk', 'mushroomStem', 2102, { pieces: 3, depth: 0.4, junk: 3, colors: WOODEN }, { freeAxes: ['x', 'y', 'z'], startOffset: [0, 0, 0], locked: true }),
    ],
  },
  {
    id: 'w2-02',
    targetName: 'Ice cream',
    threshold: 0.9,
    parTime: 40,
    reveal: 'tilt',
    pieces: [
      piece('ice_scoop_junk', 'iceScoop', 2201, { pieces: 5, depth: 0.55, junk: 5, colors: CROCKERY }, { freeAxes: ['x', 'y', 'z'], startOffset: [80, -70, 0] }),
      piece('ice_cone_junk', 'iceCone', 2202, { pieces: 4, depth: 0.5, junk: 4, colors: WOODEN }, { freeAxes: ['x', 'y', 'z'], startOffset: [-60, 100, 0] }),
    ],
  },
  {
    id: 'w2-03',
    targetName: 'Sailboat',
    threshold: 0.9,
    parTime: 55,
    reveal: 'rock',
    pieces: [
      piece('sails_junk', 'sails', 2301, { pieces: 6, depth: 0.6, junk: 4, colors: TINS }, { freeAxes: ['x', 'y', 'z'], startOffset: [90, -80, 40] }),
      piece('hull_junk', 'hull', 2302, { pieces: 4, depth: 0.55, junk: 5, colors: WOODEN }, { freeAxes: ['x', 'y', 'z'], startOffset: [-70, 95, 0] }),
    ],
  },
  {
    id: 'w2-04',
    targetName: 'Hot-air balloon',
    threshold: 0.9,
    parTime: 60,
    reveal: 'sway',
    pieces: [
      piece('balloon_junk', 'balloon', 2401, { pieces: 6, depth: 0.6, junk: 6, colors: TINS }, { freeAxes: ['x', 'y', 'z'], startOffset: [-85, 100, 35] }),
      piece('basket_junk', 'basket', 2402, { pieces: 4, depth: 0.5, junk: 2, colors: WOODEN }, { freeAxes: ['x', 'y', 'z'], startOffset: [100, -75, -50] }),
    ],
  },
  {
    id: 'w2-05',
    targetName: 'Rocket',
    threshold: 0.9,
    parTime: 60,
    reveal: 'pulse',
    pieces: [
      piece('rocket_body_junk', 'rocketBody', 2501, { pieces: 6, depth: 0.6, junk: 5, colors: TINS }, { freeAxes: ['x', 'y', 'z'], startOffset: [95, -110, 45] }),
      piece('rocket_flame_junk', 'rocketFlame', 2502, { pieces: 3, depth: 0.45, junk: 2, colors: [C.red, C.brass, C.cream] }, { freeAxes: ['x', 'y', 'z'], startOffset: [80, 80, 0] }),
    ],
  },
];
