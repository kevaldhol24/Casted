import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRng, range } from '../util/rng';
import { makeInsideTest, silhouetteBounds, type Silhouette } from './shapes';

export interface JunkOptions {
  seed: number;
  /** How much junk to add (0 = plain extrusion, 1 = default, 2 = very misleading). */
  junk: number;
  /** Largest silhouette dimension in world units. */
  size: number;
  palette: string[];
}

/**
 * The design doc's authoring trick, done procedurally: start from the target silhouette, then add parts that
 * only extend along the light's depth axis (local Z). Seen down local Z the shadow is unchanged; from any other
 * angle it looks like junk. Every footprint is checked to lie inside the silhouette, so the solution is exact.
 */
export function junkify(sil: Silhouette, opts: JunkOptions): THREE.BufferGeometry {
  const rng = makeRng(opts.seed);
  const inside = makeInsideTest(sil);
  const bounds = silhouetteBounds(sil);
  const pieces: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  const pickColor = () => color.set(opts.palette[Math.floor(rng() * opts.palette.length)]).offsetHSL(0, 0, range(rng, -0.04, 0.04));

  const add = (geo: THREE.BufferGeometry) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    const c = pickColor();
    const n = g.getAttribute('position').count;
    const cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) cols.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    pieces.push(g);
  };

  // 1. Each silhouette part becomes a slab at its own depth, so the parts drift apart when rotated.
  const spread = 0.35 + 0.25 * opts.junk;
  for (const shape of sil) {
    const depth = range(rng, 0.22, 0.42);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.015,
      bevelSegments: 1,
      curveSegments: 18,
    });
    geo.translate(0, 0, range(rng, -spread, spread) - depth / 2);
    add(geo);
  }

  // Footprint checks sample the outline slightly enlarged, so junk never pokes past the silhouette edge.
  const tmp = new THREE.Vector2();
  const rectInside = (cx: number, cy: number, w: number, h: number, rot: number) => {
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    for (let i = 0; i <= 4; i++)
      for (let j = 0; j <= 4; j++) {
        const lx = ((i / 4 - 0.5) * w) * 1.15;
        const ly = ((j / 4 - 0.5) * h) * 1.15;
        if (!inside(tmp.set(cx + lx * cos - ly * sin, cy + lx * sin + ly * cos))) return false;
      }
    return true;
  };
  const discInside = (cx: number, cy: number, r: number) => {
    if (!inside(tmp.set(cx, cy))) return false;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      if (!inside(tmp.set(cx + Math.cos(a) * r * 1.15, cy + Math.sin(a) * r * 1.15))) return false;
    }
    return true;
  };
  const randomPoint = () => tmp.set(range(rng, bounds.min.x, bounds.max.x), range(rng, bounds.min.y, bounds.max.y));

  const tries = (n: number, fn: () => boolean) => {
    for (let i = 0; i < n * 40 && n > 0; i++) if (fn()) n--;
  };

  // 2. Rods: thin bars running along depth. From the solution they are dots inside the shape; otherwise long sticks.
  tries(Math.round(3 + 2 * opts.junk), () => {
    const p = randomPoint();
    const w = range(rng, 0.08, 0.14);
    const rot = rng() * Math.PI;
    if (!rectInside(p.x, p.y, w, w, rot)) return false;
    const len = range(rng, 1.0, 1.4 + 0.4 * opts.junk);
    const geo = new THREE.BoxGeometry(w, w, len);
    geo.rotateZ(rot);
    geo.translate(p.x, p.y, range(rng, -0.25, 0.25));
    add(geo);
    return true;
  });

  // 3. Slabs: flat blocks deep along Z, rotated only about Z so their footprint stays a checked rectangle.
  tries(Math.round(1 + 1.5 * opts.junk), () => {
    const p = randomPoint();
    const w = range(rng, 0.18, 0.4);
    const h = range(rng, 0.1, 0.22);
    const rot = rng() * Math.PI;
    if (!rectInside(p.x, p.y, w, h, rot)) return false;
    const len = range(rng, 0.6, 1.1 + 0.3 * opts.junk);
    const geo = new THREE.BoxGeometry(w, h, len);
    geo.rotateZ(rot);
    geo.translate(p.x, p.y, range(rng, -0.5, 0.5));
    add(geo);
    return true;
  });

  // 4. Knobs: low-poly balls far in front of or behind the main slab.
  tries(Math.round(1 + opts.junk), () => {
    const p = randomPoint();
    const r = range(rng, 0.1, 0.2);
    if (!discInside(p.x, p.y, r)) return false;
    const geo = new THREE.IcosahedronGeometry(r, 1);
    geo.translate(p.x, p.y, (rng() < 0.5 ? -1 : 1) * range(rng, 0.45, 0.8));
    add(geo);
    return true;
  });

  const merged = mergeGeometries(pieces, false)!;
  pieces.forEach((g) => g.dispose());

  // Centre on the origin and scale so the silhouette's largest side equals opts.size.
  merged.computeBoundingBox();
  const bb = merged.boundingBox!;
  const center = bb.getCenter(new THREE.Vector3());
  const silSize = bounds.getSize(new THREE.Vector2());
  merged.translate(-center.x, -center.y, -center.z);
  const s = opts.size / Math.max(silSize.x, silSize.y);
  merged.scale(s, s, s);
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}
