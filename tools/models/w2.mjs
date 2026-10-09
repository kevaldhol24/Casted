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
  {
    id: 'w2-06',
    targetName: 'Cupcake',
    threshold: 0.9,
    parTime: 60,
    reveal: 'stomp',
    pieces: [
      piece('cupcake_top_junk', 'cupcakeTop', 2601, { pieces: 6, depth: 0.6, junk: 5, colors: CROCKERY }, { freeAxes: ['x', 'y', 'z'], startOffset: [-90, 85, 40] }),
      piece('cupcake_case_junk', 'cupcakeCase', 2602, { pieces: 5, depth: 0.55, junk: 4, colors: TINS }, { freeAxes: ['x', 'y', 'z'], startOffset: [85, -100, -35] }),
    ],
  },
  {
    id: 'w2-07',
    targetName: 'Lighthouse',
    threshold: 0.9,
    parTime: 65,
    reveal: 'pulse',
    pieces: [
      piece('lighthouse_lamp_junk', 'lighthouseLamp', 2701, { pieces: 6, depth: 0.6, junk: 3, colors: [C.brass, C.cream, C.tin, C.red] }, { freeAxes: ['x', 'y', 'z'], startOffset: [100, 80, -45] }),
      piece('lighthouse_tower_junk', 'lighthouseTower', 2702, { pieces: 6, depth: 0.6, junk: 6, colors: CROCKERY }, { freeAxes: ['x', 'y', 'z'], startOffset: [-80, -105, 50] }),
    ],
  },
  {
    id: 'w2-08',
    targetName: 'Pineapple',
    threshold: 0.9,
    parTime: 65,
    reveal: 'sway',
    pieces: [
      piece('pineapple_crown_junk', 'pineappleCrown', 2801, { pieces: 6, depth: 0.6, junk: 3, colors: [C.green, C.teal, C.tin] }, { freeAxes: ['x', 'y', 'z'], startOffset: [-95, -80, 60] }),
      piece('pineapple_fruit_junk', 'pineappleFruit', 2802, { pieces: 7, depth: 0.65, junk: 7, colors: WOODEN }, { freeAxes: ['x', 'y', 'z'], startOffset: [90, 110, -40] }),
    ],
  },
  {
    id: 'w2-09',
    targetName: 'Windmill',
    threshold: 0.9,
    parTime: 75,
    reveal: 'spin',
    pieces: [
      piece('windmill_sails_junk', 'windmillSails', 2901, { pieces: 8, depth: 0.65, junk: 3, colors: [C.cream, C.wood, C.tin, C.pale] }, { freeAxes: ['x', 'y', 'z'], startOffset: [105, -95, 55] }),
      piece('windmill_tower_junk', 'windmillTower', 2902, { pieces: 6, depth: 0.6, junk: 6, colors: WOODEN }, { freeAxes: ['x', 'y', 'z'], startOffset: [-85, 90, -60] }),
    ],
  },
  {
    id: 'w2-10',
    targetName: 'Rubber duck',
    threshold: 0.9,
    parTime: 70,
    reveal: 'rock',
    pieces: [
      piece('duck_head_junk', 'duckHead', 3001, { pieces: 5, depth: 0.6, junk: 4, colors: [C.brass, C.orange, C.cream] }, { freeAxes: ['x', 'y', 'z'], startOffset: [-110, 75, -50] }),
      piece('duck_body_junk', 'duckBody', 3002, { pieces: 7, depth: 0.65, junk: 7, colors: [C.brass, C.cream, C.tin, C.sand] }, { freeAxes: ['x', 'y', 'z'], startOffset: [95, -90, 70] }),
    ],
  },
  // From 2-11: three pieces.
  {
    id: 'w2-11',
    targetName: 'Snowman',
    threshold: 0.9,
    parTime: 80,
    reveal: 'hop',
    pieces: [
      piece('snowman_head_junk', 'snowmanHead', 3101, { pieces: 5, depth: 0.55, junk: 3, colors: [C.cream, C.darkWood, C.orange] }, { freeAxes: ['x', 'y', 'z'], startOffset: [90, -85, 45] }),
      piece('snowman_middle_junk', 'snowmanMiddle', 3102, { pieces: 6, depth: 0.6, junk: 4, colors: [C.pale, C.wood, C.cream] }, { freeAxes: ['x', 'y', 'z'], startOffset: [-80, 100, -40] }),
      piece('snowman_base_junk', 'snowmanBase', 3103, { pieces: 5, depth: 0.55, junk: 6, colors: CROCKERY }, { freeAxes: ['x', 'y', 'z'], startOffset: [70, 90, 0] }),
    ],
  },
  {
    id: 'w2-12',
    targetName: 'Car',
    threshold: 0.9,
    parTime: 90,
    reveal: 'rock',
    pieces: [
      piece('car_cabin_junk', 'carCabin', 3201, { pieces: 5, depth: 0.55, junk: 4, colors: TINS }, { freeAxes: ['x', 'y', 'z'], startOffset: [-95, 80, 50] }),
      piece('car_body_junk', 'carBody', 3202, { pieces: 7, depth: 0.65, junk: 7, colors: [C.red, C.tin, C.cream, C.blue] }, { freeAxes: ['x', 'y', 'z'], startOffset: [100, -90, -45] }),
      piece('car_wheels_junk', 'carWheels', 3203, { pieces: 6, depth: 0.6, junk: 2, colors: [C.darkWood, C.tin, C.wood] }, { freeAxes: ['x', 'y', 'z'], startOffset: [85, 100, 60] }),
    ],
  },
  {
    id: 'w2-13',
    targetName: 'Giraffe',
    threshold: 0.9,
    parTime: 95,
    reveal: 'sway',
    pieces: [
      piece('giraffe_neck_junk', 'giraffeNeck', 3301, { pieces: 6, depth: 0.6, junk: 3, colors: [C.brass, C.sand, C.wood] }, { freeAxes: ['x', 'y', 'z'], startOffset: [-100, -85, 55] }),
      piece('giraffe_body_junk', 'giraffeBody', 3302, { pieces: 6, depth: 0.6, junk: 5, colors: [C.brass, C.wood, C.cream] }, { freeAxes: ['x', 'y', 'z'], startOffset: [95, 90, -50] }),
      piece('giraffe_legs_junk', 'giraffeLegs', 3303, { pieces: 7, depth: 0.6, junk: 3, colors: WOODEN }, { freeAxes: ['x', 'y', 'z'], startOffset: [-85, 105, 40] }),
    ],
  },
  {
    id: 'w2-14',
    targetName: 'Robot',
    threshold: 0.9,
    parTime: 100,
    reveal: 'strum',
    pieces: [
      piece('robot_head_junk', 'robotHead', 3401, { pieces: 5, depth: 0.55, junk: 4, colors: TINS }, { freeAxes: ['x', 'y', 'z'], startOffset: [110, -80, -55] }),
      piece('robot_torso_junk', 'robotTorso', 3402, { pieces: 8, depth: 0.65, junk: 6, colors: [C.tin, C.blue, C.cream, C.red] }, { freeAxes: ['x', 'y', 'z'], startOffset: [-90, 95, 65] }),
      piece('robot_legs_junk', 'robotLegs', 3403, { pieces: 5, depth: 0.55, junk: 4, colors: [C.tin, C.darkWood, C.blue] }, { freeAxes: ['x', 'y', 'z'], startOffset: [80, 110, -40] }),
    ],
  },
  {
    id: 'w2-15',
    targetName: 'Castle',
    threshold: 0.9,
    parTime: 110,
    reveal: 'pulse',
    pieces: [
      piece('castle_left_junk', 'castleLeft', 3501, { pieces: 6, depth: 0.6, junk: 5, colors: CROCKERY }, { freeAxes: ['x', 'y', 'z'], startOffset: [-95, 105, 50] }),
      piece('castle_keep_junk', 'castleKeep', 3502, { pieces: 9, depth: 0.7, junk: 8, colors: [C.cream, C.pale, C.tin, C.sand] }, { freeAxes: ['x', 'y', 'z'], startOffset: [100, -95, -60] }),
      piece('castle_right_junk', 'castleRight', 3503, { pieces: 7, depth: 0.6, junk: 5, colors: [C.cream, C.red, C.tin, C.blue] }, { freeAxes: ['x', 'y', 'z'], startOffset: [85, 90, 70] }),
    ],
  },
];
