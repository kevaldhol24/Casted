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
      const pts = shape.concat(...holes);
      for (const [a, b, c] of THREE.ShapeUtils.triangulateShape(shape, holes)) refine(pts[a], pts[b], pts[c], 0.16, tris);
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
