/**
 * Modelling kit for the authored World 1 objects (run by tools/build-w1-models.mjs, Node only).
 *
 * Coordinates are the level's solution frame: the light looks down -Z, +Y is up on the wall, so the shadow is
 * the object's outline in the XY plane. A model's "core" casts the target (shatter(): the silhouette cut into
 * plates at different depths); everything else (struts, junkify() clutter) has a footprint inside the core's
 * and spreads only along Z. From the solution the shadow is exactly the core's; elsewhere it's a junk heap.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Attic palette: dusty, warm, desaturated (the four ATTIC.objects tones plus a few accents). */
export const C = {
  sand: '#b8a58c',
  taupe: '#a8917a',
  pale: '#c9b79c',
  grey: '#9c8a76',
  wood: '#8a6a4a',
  darkWood: '#6e5238',
  brass: '#b08d57',
  tin: '#8f9496',
  red: '#a0645a',
  blue: '#6f7f99',
  cream: '#d8c8a8',
  green: '#7f8a62',
  // Workshop tools and paint
  orange: '#b8713a',
  teal: '#5f7f7c',
  // Theatre props
  velvet: '#8e3a3e',
  gold: '#c4a052',
  ivory: '#ddd0b2',
  ebony: '#4a3a33',
};

/** Mulberry32 (same as src/util/rng.ts): a model rebuilds identically from its seed. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const V2 = (pts) => pts.map(([x, y]) => new THREE.Vector2(x, y));
const V3 = (pts) => pts.map(([x, y, z = 0]) => new THREE.Vector3(x, y, z));

// --- primitives (Y-up unless noted) ------------------------------------------------------------

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rTop, rBottom, h, seg = 10) => new THREE.CylinderGeometry(rTop, rBottom, h, seg);
export const sphere = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
/** Ellipsoid with radii rx, ry, rz. */
export const blob = (rx, ry, rz, w = 12, h = 8) => sphere(1, w, h).scale(rx, ry, rz);
export const cone = (r, h, seg = 8) => new THREE.ConeGeometry(r, h, seg);
/** Surface of revolution about Y from [radius, y] pairs, bottom to top. */
export const lathe = (pts, seg = 12) => new THREE.LatheGeometry(V2(pts), seg);
/** Tube along a smooth curve through 3D points. */
export const tube = (pts, r, seg = 24, radial = 7) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(V3(pts)), seg, r, radial, false);
/** Ring lying in the XY plane (seen face-on from the light). */
export const torus = (R, r, arc = Math.PI * 2, radial = 7, seg = 28) => new THREE.TorusGeometry(R, r, radial, seg, arc);

/** Straight round bar between two 3D points. */
export function rod(a, b, r, seg = 8) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = cyl(r, r, len, seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  const mid = A.add(B).multiplyScalar(0.5);
  return g.translate(mid.x, mid.y, mid.z);
}

export const polyShape = (pts) => new THREE.Shape(V2(pts));

export function circleShape(cx, cy, r) {
  const s = new THREE.Shape();
  s.absarc(cx, cy, r, 0, Math.PI * 2, false);
  return s;
}

export function circleHole(cx, cy, r) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
}

/** A flat 2D shape given thickness along Z (centred on z = 0), with a soft bevel. */
export function slab(shape, depth, bevel = 0.03, curveSegments = 14) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.6,
    bevelSegments: 1,
    curveSegments,
  });
  return g.translate(0, 0, -depth / 2);
}

/** Move / rotate (degrees, XYZ order) / scale a geometry in place. */
export function T(g, { p = [0, 0, 0], r = [0, 0, 0], s = 1 } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...r.map((d) => THREE.MathUtils.degToRad(d)))),
    new THREE.Vector3(...(Array.isArray(s) ? s : [s, s, s])),
  );
  return g.applyMatrix4(m);
}

// --- footprint raster ----------------------------------------------------------------------------

/** Rasterise the XY projection of geometries into a bitmap (pixel centres; row 0 = bottom). */
export function rasterize(geos, x0, y0, cell, W, H, out = new Uint8Array(W * H)) {
  for (const g of geos) {
    const pos = g.getAttribute('position');
    const idx = g.index;
    const tris = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < tris; t++) {
      const i0 = idx ? idx.getX(t * 3) : t * 3;
      const i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
      const ax = pos.getX(i0), ay = pos.getY(i0);
      const bx = pos.getX(i1), by = pos.getY(i1);
      const cx = pos.getX(i2), cy = pos.getY(i2);
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-12) continue;
      const s = Math.sign(area);
      const minI = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell));
      const maxI = Math.min(W - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / cell));
      const minJ = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / cell));
      const maxJ = Math.min(H - 1, Math.ceil((Math.max(ay, by, cy) - y0) / cell));
      for (let j = minJ; j <= maxJ; j++) {
        const py = y0 + (j + 0.5) * cell;
        for (let i = minI; i <= maxI; i++) {
          const px = x0 + (i + 0.5) * cell;
          const e0 = ((bx - ax) * (py - ay) - (by - ay) * (px - ax)) * s;
          const e1 = ((cx - bx) * (py - by) - (cy - by) * (px - bx)) * s;
          const e2 = ((ax - cx) * (py - cy) - (ay - cy) * (px - cx)) * s;
          if (e0 >= 0 && e1 >= 0 && e2 >= 0) out[j * W + i] = 1;
        }
      }
    }
  }
  return out;
}

/** Shrink a bitmap by k pixels (square neighbourhood). */
function erode(bits, W, H, k) {
  const out = new Uint8Array(W * H);
  for (let j = k; j < H - k; j++)
    for (let i = k; i < W - k; i++) {
      let ok = 1;
      for (let dj = -k; dj <= k && ok; dj++) for (let di = -k; di <= k; di++) if (!bits[(j + dj) * W + i + di]) { ok = 0; break; }
      out[j * W + i] = ok;
    }
  return out;
}

// --- shatter helpers -------------------------------------------------------------------------------

/** Split a 2D triangle on its longest edge until every edge is ≤ maxEdge (keeps the area exact). */
function refine(a, b, c, maxEdge, out) {
  const ab = a.distanceTo(b), bc = b.distanceTo(c), ca = c.distanceTo(a);
  const m = Math.max(ab, bc, ca);
  if (m > maxEdge) {
    if (m === ab) { const p = a.clone().lerp(b, 0.5); refine(a, p, c, maxEdge, out); refine(p, b, c, maxEdge, out); }
    else if (m === bc) { const p = b.clone().lerp(c, 0.5); refine(a, b, p, maxEdge, out); refine(a, p, c, maxEdge, out); }
    else { const p = c.clone().lerp(a, 0.5); refine(a, b, p, maxEdge, out); refine(p, b, c, maxEdge, out); }
    return;
  }
  const area = ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
  if (Math.abs(area) < 1e-9) return;
  const [p, q] = area > 0 ? [b, c] : [c, b]; // counter-clockwise
  out.push({ a, b: p, c: q, area: Math.abs(area), mid: new THREE.Vector2((a.x + b.x + c.x) / 3, (a.y + b.y + c.y) / 3) });
}

/** A solid plate from 2D triangles: front and back caps at z ± th/2, walls on the piece's outer edges. */
function plate(tris, z, th) {
  const f = z + th / 2, k = z - th / 2;
  const pos = [];
  const key = (p) => `${p.x.toFixed(5)},${p.y.toFixed(5)}`;
  const edges = new Map();
  for (const t of tris) {
    const { a, b: b2, c: c2 } = t;
    pos.push(a.x, a.y, f, b2.x, b2.y, f, c2.x, c2.y, f);
    pos.push(a.x, a.y, k, c2.x, c2.y, k, b2.x, b2.y, k);
    for (const [p, q] of [[a, b2], [b2, c2], [c2, a]]) {
      const id = [key(p), key(q)].sort().join('|');
      const e = edges.get(id);
      if (e) e.n++;
      else edges.set(id, { p, q, n: 1 });
    }
  }
  for (const { p, q, n } of edges.values()) {
    if (n !== 1) continue;
    pos.push(p.x, p.y, f, p.x, p.y, k, q.x, q.y, k);
    pos.push(p.x, p.y, f, q.x, q.y, k, q.x, q.y, f);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** The runs [x0, x1] where `inside` holds along the row at height y, for x within ±width; edges found by bisection. */
function runs(inside, y, width, steps = 520) {
  const out = [];
  const dx = (2 * width) / steps;
  const edge = (lo, hi, rising) => {
    for (let k = 0; k < 14; k++) {
      const m = (lo + hi) / 2;
      if (inside(m, y) === rising) hi = m;
      else lo = m;
    }
    return (lo + hi) / 2;
  };
  let start = null;
  let prev = inside(-width, y);
  if (prev) start = -width;
  for (let i = 1; i <= steps; i++) {
    const x = -width + i * dx;
    const now = inside(x, y);
    if (now && !prev) start = edge(x - dx, x, true);
    if (!now && prev) {
      const end = edge(x - dx, x, false);
      if (end - start > 0.004) out.push([start, end]);
      start = null;
    }
    prev = now;
  }
  if (start !== null) out.push([start, width]);
  return out;
}

// --- junk ------------------------------------------------------------------------------------------

/** Attic clutter, each built with its long axis along Y (junkify turns it to run along Z). */
const JUNK = [
  (r) => [lathe([[0, -0.3], [0.1, -0.3], [0.1, 0.06], [0.045, 0.16], [0.04, 0.3], [0, 0.3]].map(([x, y]) => [x * (0.8 + r() * 0.5), y * (0.8 + r() * 0.6)]), 10), [C.green, C.blue, C.tin][Math.floor(r() * 3)]], // bottle
  (r) => [cyl(0.09 + r() * 0.05, 0.09 + r() * 0.05, 0.2 + r() * 0.25, 12), C.tin], // tin can
  (r) => { const R = 0.1 + r() * 0.05, h = 0.22 + r() * 0.15; return [lathe([[0, -h / 2], [R, -h / 2], [R, -h / 2 + 0.035], [R * 0.55, -h / 2 + 0.035], [R * 0.55, h / 2 - 0.035], [R, h / 2 - 0.035], [R, h / 2], [0, h / 2]], 12), C.wood]; }, // spool
  (r) => [cyl(0.055, 0.06, 0.3 + r() * 0.35, 8), C.cream], // candle
  (r) => [box(0.08 + r() * 0.06, 0.28 + r() * 0.2, 0.18 + r() * 0.1), [C.red, C.blue, C.green, C.darkWood][Math.floor(r() * 4)]], // book
  (r) => [cyl(0.04, 0.04, 0.6 + r() * 0.5, 6), C.wood], // stick / pencil
  (r) => [box(0.18 + r() * 0.15, 0.2 + r() * 0.15, 0.18 + r() * 0.15), C.darkWood], // crate
  (r) => { // gear: a toothed disc lying across the long axis
    const R = 0.1 + r() * 0.07;
    const parts = [cyl(R, R, 0.07, 14)];
    for (let i = 0; i < 8; i++) parts.push(T(box(0.05, 0.07, 0.06), { p: [Math.cos((i / 8) * Math.PI * 2) * (R + 0.02), 0, Math.sin((i / 8) * Math.PI * 2) * (R + 0.02)], r: [0, (-i / 8) * 360, 0] }));
    return [mergeGeometries(parts.map((g) => g.toNonIndexed()))];
  },
];
// The gear borrows a colour after construction (merge drops nothing but needs one).
const junkColor = (fn, r) => {
  const out = fn(r);
  return [out[0], out[1] ?? C.brass];
};

export class Model {
  /** @param {number} seed */
  constructor(seed) {
    this.rng = makeRng(seed);
    /** @type {{ geo: THREE.BufferGeometry, color: string, core: boolean }[]} */
    this.parts = [];
  }

  /** A part of the recognisable object (its outline is the target). */
  core(geo, color, t) {
    this.parts.push({ geo: T(geo, t), color, core: true });
    return this;
  }

  /** A part whose footprint the caller guarantees lies inside the core's. */
  extra(geo, color, t) {
    this.parts.push({ geo: T(geo, t), color, core: false });
    return this;
  }

  /**
   * Add `count` pieces of attic junk running along Z (z within ±depth), each tilted a little and placed only
   * where its whole footprint, with a small margin, falls inside the core's footprint.
   */
  junkify(count, depth = 0.7) {
    const r = this.rng;
    const core = this.parts.filter((p) => p.core).map((p) => p.geo);
    const bb = new THREE.Box3();
    for (const g of core) {
      g.computeBoundingBox();
      bb.union(g.boundingBox);
    }
    const cell = 0.01;
    const x0 = bb.min.x - 0.05;
    const y0 = bb.min.y - 0.05;
    const W = Math.ceil((bb.max.x - bb.min.x + 0.1) / cell);
    const H = Math.ceil((bb.max.y - bb.min.y + 0.1) / cell);
    const safe = erode(rasterize(core, x0, y0, cell, W, H), W, H, 3);
    const fits = (g) => {
      const own = rasterize([g], x0, y0, cell, W, H);
      for (let i = 0; i < own.length; i++) if (own[i] && !safe[i]) return false;
      return true;
    };
    let placed = 0;
    for (let tries = 0; tries < count * 120 && placed < count; tries++) {
      const [g, color] = junkColor(JUNK[Math.floor(r() * JUNK.length)], r);
      g.computeBoundingBox();
      const half = (g.boundingBox.max.y - g.boundingBox.min.y) / 2;
      const zc = (r() * 2 - 1) * Math.max(0, depth - half);
      T(g, { r: [90 + (r() * 2 - 1) * 14, (r() * 2 - 1) * 14, r() * 360] });
      T(g, { p: [bb.min.x + r() * (bb.max.x - bb.min.x), bb.min.y + r() * (bb.max.y - bb.min.y), zc] });
      if (!fits(g)) {
        g.dispose();
        continue;
      }
      this.parts.push({ geo: g, color, core: false });
      placed++;
    }
    return placed;
  }

  /**
   * Cut a flat silhouette (THREE.Shape[], parts may overlap) into `pieces` irregular plates and scatter them in
   * depth (z within ±depth). The plates tile the outline exactly, so from the light their shadow is the
   * silhouette; from anywhere else they are loose boards and sheets. Struts along Z pin the pieces together.
   */
  shatter(shapes, { pieces, depth, colors, thick = [0.06, 0.16] }) {
    const r = this.rng;
    const tris = [];
    for (const s of shapes) {
      const { shape, holes } = s.extractPoints(16);
      // triangulateShape drops duplicated end points in place, so index the points only after it has run.
      const faces = THREE.ShapeUtils.triangulateShape(shape, holes);
      const pts = shape.concat(...holes);
      for (const [a, b, c] of faces) refine(pts[a], pts[b], pts[c], 0.16, tris);
    }
    // Voronoi-style pieces: each triangle joins the nearest of `pieces` seeds (seeded inside the outline).
    const seeds = [];
    for (let i = 0; i < pieces; i++) seeds.push(tris[Math.floor(r() * tris.length)].mid);
    const groups = seeds.map(() => []);
    for (const t of tris) {
      let best = 0;
      for (let i = 1; i < seeds.length; i++) if (t.mid.distanceToSquared(seeds[i]) < t.mid.distanceToSquared(seeds[best])) best = i;
      groups[best].push(t);
    }
    const placed = [];
    for (const g of groups) {
      if (!g.length) continue;
      const th = thick[0] + r() * (thick[1] - thick[0]);
      const z = (r() * 2 - 1) * Math.max(0, depth - th / 2);
      this.parts.push({ geo: plate(g, z, th), color: colors[Math.floor(r() * colors.length)], core: true });
      // The piece's biggest triangle centre: a safe spot for a strut.
      const big = g.reduce((a, b) => (b.area > a.area ? b : a));
      placed.push({ z, at: big.mid, size: Math.sqrt(big.area) });
    }
    // Struts: a bar along Z from each piece towards another piece's depth, inside the piece's own footprint.
    for (const p of placed) {
      const other = placed[Math.floor(r() * placed.length)];
      if (other === p || Math.abs(other.z - p.z) < 0.1) continue;
      const rad = Math.min(0.045, p.size * 0.2);
      if (rad < 0.02) continue;
      this.parts.push({ geo: rod([p.at.x, p.at.y, p.z], [p.at.x, p.at.y, other.z], rad, 6), color: C.tin, core: false });
    }
    return this;
  }

  /**
   * World 4 dual shadows: one solid whose shadow is silhouette A from lamp A and silhouette B from lamp B. The lamps
   * travel along (∓sin s, 0, -cos s) (`spread` = s in degrees, either side of the middle light, which looks down
   * -Z). Lamp A sees u = x cos s - z sin s, lamp B u = x cos s + z sin s, both with y up. Each horizontal slab of
   * the two outlines becomes one block per pair of runs (A run × B run), so each lamp's shadow is exactly its row
   * of the silhouette. The block's sides are planes, so a run that widens through the slab stays exact (only the
   * rows where an outline changes topology are cut square). Both outlines must cover every row between their
   * common top and bottom: the caller scales them to the same height.
   *
   * @param a inside test of outline A (x, y) → boolean, already in the shared frame (y within ±1)
   * @param b the same for B
   */
  dualShadow(a, b, { spread, rows = 72, colors, band = 6, width = 1.3 }) {
    const s = Math.sin(THREE.MathUtils.degToRad(spread));
    const c = Math.cos(THREE.MathUtils.degToRad(spread));
    return this.rowBlocks(a, b, (ua, ub, y) => [(ua + ub) / (2 * c), y, (ub - ua) / (2 * s)], { rows, colors, band, width });
  }

  /**
   * A solid carved from two outlines at right angles (World 1 hard levels): from the light (looking down -Z) its
   * shadow is exactly `front` (x, y); from the side (looking along X) it is `side` (z, y). Built like dualShadow:
   * each horizontal slab is one block per pair of runs (front run in x × side run in z). Unlike shattered plates
   * it has no gaps and no flat boards, so off the solution its shadow is a lump that gives nothing away; the side
   * outline is a second, wrong picture (a red herring) the player can find first. Both outlines must cover every
   * row (the caller scales them to the same height).
   */
  carve(front, side, { rows = 72, colors, band = 6, width = 1.3 }) {
    return this.rowBlocks(front, side, (ua, ub, y) => [ua, y, ub], { rows, colors, band, width });
  }

  /**
   * Decoy sheets: thin irregular panels standing edge-on to the light (each in a plane holding the light direction
   * and a segment that lies inside `inside` with a margin), so at the solution each one casts only a hairline inside
   * the outline; turned away, they throw large shapes that bury the real shadow. Non-core (the build checks their
   * footprint stays inside the core's).
   *
   * @param inside (x, y) → boolean in model space
   */
  edgeSheets(inside, { count, half = 1, z = 0.9, thick = 0.014, minLen = 0.3, colors }) {
    const r = this.rng;
    const margin = thick / 2 + 0.045;
    const ok = (x, y, nx, ny) => inside(x, y) && inside(x + nx * margin, y + ny * margin) && inside(x - nx * margin, y - ny * margin);
    let placed = 0;
    for (let tries = 0; placed < count && tries < 4000; tries++) {
      const x = (r() * 2 - 1) * half;
      const y = r() * 2 - 1;
      const a = r() * Math.PI;
      const dx = Math.cos(a), dy = Math.sin(a);
      const nx = -dy, ny = dx;
      if (!ok(x, y, nx, ny)) continue;
      // Grow both ways while the segment (and its margin) stays inside.
      let lo = 0, hi = 0;
      while (lo > -2 && ok(x + dx * (lo - 0.01), y + dy * (lo - 0.01), nx, ny)) lo -= 0.01;
      while (hi < 2 && ok(x + dx * (hi + 0.01), y + dy * (hi + 0.01), nx, ny)) hi += 0.01;
      const len = hi - lo;
      if (len < minLen) continue;
      // An irregular panel in the (along-segment s, depth z) plane: s within [0, len], z within ±z.
      const z0 = -z + r() * z * 0.6, z1 = z - r() * z * 0.6;
      const pts = [
        [0, z0 + r() * 0.2],
        [len * (0.3 + r() * 0.4), z0],
        [len, z0 + r() * 0.3],
        [len, z1 - r() * 0.3],
        [len * (0.3 + r() * 0.4), z1],
        [0, z1 - r() * 0.2],
      ];
      const g = new THREE.ExtrudeGeometry(new THREE.Shape(V2(pts)), { depth: thick, bevelEnabled: false });
      // Shape x → along the segment, shape y → light direction (z), extrusion → minus the segment's normal (keeps
      // the basis right-handed, so faces stay outward).
      const ox = x + dx * lo + nx * (thick / 2), oy = y + dy * lo + ny * (thick / 2);
      g.applyMatrix4(new THREE.Matrix4().set(dx, 0, -nx, ox, dy, 0, -ny, oy, 0, 1, 0, 0, 0, 0, 0, 1));
      this.parts.push({ geo: g, color: colors[Math.floor(r() * colors.length)], core: false });
      placed++;
    }
    return placed;
  }

  /** The slab loop shared by dualShadow and carve: P maps (run A coord, run B coord, y) to a model-space point. */
  rowBlocks(a, b, P, { rows, colors, band, width }) {
    const eps = 1e-4;
    const lost = { a: 0, b: 0 };
    for (let r = 0; r < rows; r++) {
      const y0 = -1 + (2 * r) / rows;
      const y1 = -1 + (2 * (r + 1)) / rows;
      const ym = (y0 + y1) / 2;
      const runsOf = (inside) => {
        const lo = runs(inside, y0 + eps, width);
        const hi = runs(inside, y1 - eps, width);
        if (lo.length && lo.length === hi.length) return lo.map((l, i) => [l, hi[i]]);
        return runs(inside, ym, width).map((m) => [m, m]);
      };
      const ra = runsOf(a);
      const rb = runsOf(b);
      if (!ra.length || !rb.length) {
        if (ra.length) lost.a++;
        if (rb.length) lost.b++;
        continue;
      }
      const pos = [];
      for (const [aLo, aHi] of ra)
        for (const [bLo, bHi] of rb) {
          // Corners: bottom ring at y0 (runs at the slab's bottom), top ring at y1.
          const B = [P(aLo[0], bLo[0], y0), P(aLo[1], bLo[0], y0), P(aLo[1], bLo[1], y0), P(aLo[0], bLo[1], y0)];
          const T = [P(aHi[0], bHi[0], y1), P(aHi[1], bHi[0], y1), P(aHi[1], bHi[1], y1), P(aHi[0], bHi[1], y1)];
          const quad = (p, q, r2, t) => pos.push(...p, ...q, ...r2, ...p, ...r2, ...t);
          quad(B[0], B[3], B[2], B[1]);
          quad(T[0], T[1], T[2], T[3]);
          for (let k = 0; k < 4; k++) quad(B[k], B[(k + 1) % 4], T[(k + 1) % 4], T[k]);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      this.parts.push({ geo: g, color: colors[Math.floor(r / band) % colors.length], core: true });
    }
    return lost;
  }

  /** One flat-shaded, non-indexed geometry per colour. */
  meshes() {
    const byColor = new Map();
    for (const p of this.parts) {
      const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
      for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
      if (!byColor.has(p.color)) byColor.set(p.color, []);
      byColor.get(p.color).push(g);
    }
    return [...byColor].map(([color, geos]) => {
      const g = mergeGeometries(geos);
      g.computeVertexNormals();
      return { color, geo: g };
    });
  }
}
