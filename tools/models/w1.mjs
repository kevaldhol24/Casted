/**
 * The 20 World 1 (Attic) junk objects. Each target silhouette (src/levels/shapes.ts, the same outlines the
 * Album shows) is shattered into boards and sheets scattered in depth, pinned with struts, and buried in
 * attic clutter. From the light the pieces line up into the target; from anywhere else it's a junk heap.
 *
 * Readability ramps with the level (design doc): the teaching levels 1–3 come apart into a few shallow
 * pieces, 4–5 into more, and from level 6 ("first looks-like-nothing object") into many deep ones. Levels 16–20
 * are the hard tail: detailed, asymmetric outlines in 12–15 deep pieces under heavy clutter.
 */
import * as THREE from 'three';
import { SILHOUETTES, makeInsideTest, silhouetteBounds } from '../../src/levels/shapes.ts';
import { C, Model } from './kit.mjs';

const BOARDS = [C.wood, C.darkWood, C.sand, C.taupe];
const SHEETS = [C.tin, C.pale, C.cream, C.sand];
const MIXED = [C.wood, C.darkWood, C.tin, C.sand, C.pale, C.red, C.blue];

/** Level tuning: pieces the outline breaks into, how far they scatter (±z), clutter count. */
const LEVELS = [
  ['w1-01', 'heart', 101, { pieces: 3, depth: 0.35, junk: 4, colors: [C.red, C.wood, C.sand] }],
  ['w1-02', 'star', 202, { pieces: 3, depth: 0.35, junk: 4, colors: [C.brass, C.tin, C.wood] }],
  ['w1-03', 'house', 303, { pieces: 4, depth: 0.7, junk: 6, colors: BOARDS }],
  ['w1-04', 'fish', 404, { pieces: 5, depth: 0.6, junk: 6, colors: SHEETS }],
  ['w1-05', 'cat', 505, { pieces: 6, depth: 0.7, junk: 7, colors: BOARDS }],
  ['w1-06', 'teapot', 606, { pieces: 8, depth: 0.85, junk: 9, colors: MIXED }],
  ['w1-07', 'bird', 707, { pieces: 8, depth: 0.85, junk: 8, colors: SHEETS }],
  ['w1-08', 'umbrella', 808, { pieces: 8, depth: 0.85, junk: 8, colors: MIXED }],
  ['w1-09', 'bicycle', 909, { pieces: 9, depth: 0.85, junk: 6, colors: MIXED }],
  ['w1-10', 'rockingHorse', 1010, { pieces: 10, depth: 0.85, junk: 8, colors: BOARDS }],
  ['w1-11', 'key', 1111, { pieces: 7, depth: 0.85, junk: 5, colors: [C.brass, C.tin, C.darkWood] }],
  ['w1-12', 'rabbit', 1212, { pieces: 9, depth: 0.85, junk: 9, colors: MIXED }],
  ['w1-13', 'guitar', 1313, { pieces: 10, depth: 0.85, junk: 8, colors: BOARDS }],
  ['w1-14', 'anchor', 1414, { pieces: 10, depth: 0.85, junk: 6, colors: [C.tin, C.darkWood, C.wood, C.brass] }],
  ['w1-15', 'elephant', 1515, { pieces: 11, depth: 0.9, junk: 10, colors: MIXED }],
  // Hard levels: more and deeper pieces, more clutter (they look like nothing until nearly solved).
  ['w1-16', 'scissors', 1616, { pieces: 12, depth: 1.0, junk: 12, colors: [C.tin, C.brass, C.darkWood, C.pale] }],
  ['w1-17', 'spider', 1717, { pieces: 13, depth: 1.0, junk: 12, colors: MIXED }],
  ['w1-18', 'rockingChair', 1818, { pieces: 13, depth: 1.0, junk: 13, colors: BOARDS }],
  ['w1-19', 'gramophone', 1919, { pieces: 14, depth: 1.05, junk: 14, colors: [C.brass, C.darkWood, C.wood, C.tin] }],
  ['w1-20', 'tRex', 2020, { pieces: 15, depth: 1.1, junk: 15, colors: MIXED }],
];

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

/**
 * Hard levels that aren't shattered boards: one solid carved from the target (front) and a decoy outline (side),
 * plus edge-on decoy sheets. No gaps to line up and no boards to face the light; the side throws a clean, wrong
 * picture. id → (seed) => Model.
 */
const CARVED = {
  'w1-16': { side: 'cat', sheets: 6, junk: 5, colors: [C.tin, C.brass, C.darkWood, C.pale] },
};

/** id → { name (GLB file), build() } */
export const W1_MODELS = Object.fromEntries(
  LEVELS.map(([id, shape, seed, t]) => [
    id,
    {
      name: `${shape.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)}_junk`,
      build() {
        const carved = CARVED[id];
        if (carved) {
          const m = new Model(seed);
          const front = outline(shape);
          const side = outline(carved.side);
          m.lost = m.carve(front.inside, side.inside, { colors: carved.colors, band: 5, width: Math.max(front.half, side.half) + 0.05 });
          m.edgeSheets(front.inside, { count: carved.sheets, half: front.half, z: side.half + 0.25, colors: [C.tin, C.pale, C.sand] });
          m.junkify(carved.junk, side.half + 0.1);
          return m;
        }
        const m = new Model(seed);
        m.shatter(SILHOUETTES[shape](), { pieces: t.pieces, depth: t.depth, colors: t.colors });
        m.junkify(t.junk, t.depth + 0.1);
        return m;
      },
    },
  ]),
);
