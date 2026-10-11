/**
 * World 4 (Theatre) dual-shadow levels: two lamps (warm and cool) light one object from either side of the middle
 * light, and it throws a different picture from each. The object is built by Model.dualShadow() from the two
 * outlines; the build script writes the whole level JSON from this file.
 *
 * spread: degrees each lamp sits from the middle light (left lamp A, right lamp B, turning about the wall's up).
 * The shadows land that far apart on the wall: wider spreads part them more, narrower ones make a deeper object.
 *
 * Teaching ramp: 4-1 turns on one axis, so the player sees both shadows change together; 4-2 adds a second
 * axis; from 4-3 all three. 4-11 to 4-15 pair busier outlines (thin parts, holes) and ask for a closer match.
 */
import * as THREE from 'three';
import { SILHOUETTES, makeInsideTest, silhouetteBounds } from '../../src/levels/shapes.ts';
import { C, Model } from './kit.mjs';

/** Stage props: painted bands of velvet, gold, ivory and ebony. */
const STAGE = [C.velvet, C.gold, C.ivory, C.ebony];
const BRASS = [C.gold, C.ivory, C.velvet];

/** Outline `name` scaled to y within ±1 (centred), as an (x, y) inside test plus its half-width in that frame. */
function outline(name) {
  const sil = SILHOUETTES[name]();
  const box = silhouetteBounds(sil);
  const inside = makeInsideTest(sil);
  const cx = (box.min.x + box.max.x) / 2;
  const cy = (box.min.y + box.max.y) / 2;
  const k = (box.max.y - box.min.y) / 2;
  const p = new THREE.Vector2();
  return { inside: (x, y) => inside(p.set(cx + x * k, cy + y * k)), half: (box.max.x - box.min.x) / 2 / k };
}

function dual(a, b, seed, { colors, band }) {
  return (spread) => {
    const m = new Model(seed);
    const A = outline(a);
    const B = outline(b);
    m.lost = m.dualShadow(A.inside, B.inside, { spread, colors, band, width: Math.max(A.half, B.half) + 0.05 });
    return m;
  };
}

export const W4_LEVELS = [
  {
    id: 'w4-01',
    name: 'moon_star_prop',
    targetName: 'Moon & Star',
    spread: 26,
    build: dual('moon', 'star', 4101, { colors: STAGE, band: 9 }),
    freeAxes: ['y'],
    startOffset: [0, 110, 0],
    threshold: 0.8,
    parTime: 25,
    reveal: 'pulse',
    tip: 'Two lamps, two shadows · match both outlines',
  },
  {
    id: 'w4-02',
    name: 'hat_rabbit_prop',
    targetName: 'Hat & Rabbit',
    spread: 26,
    build: dual('topHat', 'rabbit', 4201, { colors: BRASS, band: 8 }),
    freeAxes: ['x', 'y'],
    startOffset: [55, -95, 0],
    threshold: 0.8,
    parTime: 40,
    reveal: 'hop',
  },
  {
    id: 'w4-03',
    name: 'crown_mask_prop',
    targetName: 'Crown & Mask',
    spread: 26,
    build: dual('crown', 'comedyMask', 4301, { colors: STAGE, band: 7 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [70, -80, 35],
    threshold: 0.8,
    parTime: 50,
    reveal: 'rock',
  },
  {
    id: 'w4-04',
    name: 'note_guitar_prop',
    targetName: 'Note & Guitar',
    spread: 26,
    build: dual('note', 'guitar', 4401, { colors: BRASS, band: 6 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [-65, 90, 40],
    threshold: 0.8,
    parTime: 55,
    reveal: 'strum',
  },
  {
    id: 'w4-05',
    name: 'anchor_heart_prop',
    targetName: 'Anchor & Heart',
    spread: 26,
    build: dual('anchor', 'heart', 4501, { colors: STAGE, band: 8 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [80, 70, -45],
    threshold: 0.8,
    parTime: 60,
    reveal: 'pulse',
  },
  // 4-6 to 4-10: famous stage pairs, all axes free.
  {
    id: 'w4-06',
    name: 'comedy_tragedy_prop',
    targetName: 'Comedy & Tragedy',
    spread: 26,
    build: dual('comedyMask', 'tragedyMask', 4601, { colors: BRASS, band: 9 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [100, 140, 70],
    threshold: 0.8,
    parTime: 60,
    reveal: 'rock',
  },
  {
    id: 'w4-07',
    name: 'skull_sword_prop',
    targetName: 'Skull & Sword',
    spread: 26,
    build: dual('skull', 'sword', 4701, { colors: STAGE, band: 6 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [-85, 70, 50],
    threshold: 0.8,
    parTime: 65,
    reveal: 'tilt',
  },
  {
    id: 'w4-08',
    name: 'bell_candle_prop',
    targetName: 'Bell & Candle',
    spread: 26,
    build: dual('bell', 'candle', 4801, { colors: BRASS, band: 7 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [90, 60, -40],
    threshold: 0.8,
    parTime: 65,
    reveal: 'swing',
  },
  {
    id: 'w4-09',
    name: 'rose_heart_prop',
    targetName: 'Rose & Heart',
    spread: 26,
    build: dual('rose', 'heart', 4901, { colors: STAGE, band: 8 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [-70, -95, 45],
    threshold: 0.8,
    parTime: 70,
    reveal: 'pulse',
  },
  {
    id: 'w4-10',
    name: 'owl_cat_prop',
    targetName: 'Owl & Cat',
    spread: 26,
    build: dual('owl', 'cat', 41001, { colors: BRASS, band: 6 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [80, -75, -55],
    threshold: 0.8,
    parTime: 70,
    reveal: 'sway',
  },
  // 4-11 to 4-15: busier outlines (thin parts, holes) and a tighter match.
  {
    id: 'w4-11',
    name: 'umbrella_note_prop',
    targetName: 'Umbrella & Note',
    spread: 26,
    build: dual('umbrella', 'note', 41101, { colors: STAGE, band: 7 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [-95, 80, 35],
    threshold: 0.82,
    parTime: 75,
    reveal: 'strum',
  },
  {
    id: 'w4-12',
    name: 'fox_hen_prop',
    targetName: 'Fox & Hen',
    spread: 26,
    build: dual('fox', 'hen', 41201, { colors: BRASS, band: 6 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [85, 95, -40],
    threshold: 0.82,
    parTime: 80,
    reveal: 'hop',
  },
  {
    id: 'w4-13',
    name: 'rocket_moon_prop',
    targetName: 'Rocket & Moon',
    spread: 26,
    build: dual('rocketBody', 'moon', 41301, { colors: STAGE, band: 8 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [-80, -85, 60],
    threshold: 0.82,
    parTime: 80,
    reveal: 'spin',
  },
  {
    id: 'w4-14',
    name: 'crown_sword_prop',
    targetName: 'Crown & Sword',
    spread: 26,
    build: dual('crown', 'sword', 41401, { colors: BRASS, band: 7 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [95, -70, -50],
    threshold: 0.82,
    parTime: 85,
    reveal: 'tilt',
  },
  {
    id: 'w4-15',
    name: 'dragonfly_deer_prop',
    targetName: 'Dragonfly & Deer',
    spread: 26,
    build: dual('dragonfly', 'deer', 41501, { colors: STAGE, band: 6 }),
    freeAxes: ['x', 'y', 'z'],
    startOffset: [-90, 90, -60],
    threshold: 0.82,
    parTime: 90,
    reveal: 'flap',
  },
];
