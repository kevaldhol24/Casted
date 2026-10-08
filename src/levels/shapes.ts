import * as THREE from 'three';

/**
 * A silhouette is a union of simple 2D parts (each may have holes), drawn in a ~2-unit box centred on
 * the origin. Parts may overlap: the shadow is their union. junkify() extrudes and scatters them in depth.
 */
export type Silhouette = THREE.Shape[];

const poly = (pts: [number, number][]) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));

const circlePath = (cx: number, cy: number, r: number, path: THREE.Path) => {
  path.absarc(cx, cy, r, 0, Math.PI * 2, false);
  return path;
};

const circle = (cx: number, cy: number, r: number) => circlePath(cx, cy, r, new THREE.Shape()) as THREE.Shape;
const hole = (cx: number, cy: number, r: number) => circlePath(cx, cy, r, new THREE.Path());

const ellipse = (cx: number, cy: number, rx: number, ry: number, rot = 0) => {
  const s = new THREE.Shape();
  s.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, false, rot);
  return s;
};

const rectPath = (x0: number, y0: number, x1: number, y1: number, path: THREE.Path) => {
  path.moveTo(x0, y0);
  path.lineTo(x1, y0);
  path.lineTo(x1, y1);
  path.lineTo(x0, y1);
  path.closePath();
  return path;
};
const rect = (x0: number, y0: number, x1: number, y1: number) => rectPath(x0, y0, x1, y1, new THREE.Shape()) as THREE.Shape;
const rectHole = (x0: number, y0: number, x1: number, y1: number) => rectPath(x0, y0, x1, y1, new THREE.Path());

/** A thick stroke along a curve, as a closed polygon (tails, handles, wires). */
function stroke(curve: THREE.Curve<THREE.Vector2>, width: number, segments = 24): THREE.Shape {
  const left: THREE.Vector2[] = [];
  const right: THREE.Vector2[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const n = new THREE.Vector2(-tan.y, tan.x).multiplyScalar(width / 2);
    left.push(p.clone().add(n));
    right.push(p.clone().sub(n));
  }
  return new THREE.Shape([...left, ...right.reverse()]);
}

function heart(): Silhouette {
  const s = new THREE.Shape();
  s.moveTo(0, -0.95);
  s.bezierCurveTo(-0.35, -0.6, -1.0, -0.25, -1.0, 0.25);
  s.bezierCurveTo(-1.0, 0.7, -0.6, 0.95, -0.3, 0.95);
  s.bezierCurveTo(-0.12, 0.95, 0, 0.82, 0, 0.62);
  s.bezierCurveTo(0, 0.82, 0.12, 0.95, 0.3, 0.95);
  s.bezierCurveTo(0.6, 0.95, 1.0, 0.7, 1.0, 0.25);
  s.bezierCurveTo(1.0, -0.25, 0.35, -0.6, 0, -0.95);
  return [s];
}

function star(): Silhouette {
  const pts: [number, number][] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1.0 : 0.42;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    pts.push([Math.cos(a) * r, Math.sin(a) * r - 0.08]);
  }
  return [poly(pts)];
}

function house(): Silhouette {
  const body = rect(-0.7, -0.85, 0.7, 0.15);
  body.holes.push(rectHole(-0.48, -0.32, -0.12, 0.0));
  body.holes.push(rectHole(0.12, -0.85 + 0.12, 0.42, -0.15));
  const roof = poly([[-0.92, 0.12], [0.92, 0.12], [0, 0.92]]);
  const chimney = rect(0.36, 0.3, 0.56, 0.86);
  return [body, roof, chimney];
}

function fish(): Silhouette {
  const body = ellipse(0.18, 0, 0.72, 0.42);
  body.holes.push(hole(0.6, 0.1, 0.075));
  const tail = poly([[-0.42, 0], [-1.0, 0.48], [-0.86, 0], [-1.0, -0.48]]);
  const fin = poly([[-0.1, 0.36], [0.35, 0.38], [-0.2, 0.68]]);
  const belly = poly([[0.05, -0.36], [0.35, -0.38], [0.0, -0.6]]);
  return [body, tail, fin, belly];
}

function catSitting(): Silhouette {
  const body = ellipse(-0.05, -0.38, 0.52, 0.58);
  const head = circle(0.02, 0.42, 0.34);
  const earL = poly([[-0.3, 0.58], [-0.06, 0.72], [-0.27, 0.95]]);
  const earR = poly([[0.1, 0.72], [0.34, 0.58], [0.31, 0.95]]);
  const tail = stroke(
    new THREE.CubicBezierCurve(
      new THREE.Vector2(0.3, -0.85),
      new THREE.Vector2(0.95, -0.95),
      new THREE.Vector2(1.0, -0.3),
      new THREE.Vector2(0.72, 0.0),
    ),
    0.16,
  );
  const paws = ellipse(0.1, -0.92, 0.42, 0.08);
  return [body, head, earL, earR, tail, paws];
}

export const SILHOUETTES: Record<string, () => Silhouette> = {
  heart,
  star,
  house,
  fish,
  cat: catSitting,
};

// --- geometry helpers used by junkify ------------------------------------------------------------

interface PolyPart {
  outer: THREE.Vector2[];
  holes: THREE.Vector2[][];
}

function pointInPolygon(p: THREE.Vector2, poly: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Point-inside test against the union of a silhouette's parts (holes respected per part). */
export function makeInsideTest(sil: Silhouette): (p: THREE.Vector2) => boolean {
  const parts: PolyPart[] = sil.map((s) => {
    const { shape, holes } = s.extractPoints(24);
    return { outer: shape, holes };
  });
  return (p) => parts.some((part) => pointInPolygon(p, part.outer) && !part.holes.some((h) => pointInPolygon(p, h)));
}

export function silhouetteBounds(sil: Silhouette): THREE.Box2 {
  const box = new THREE.Box2();
  for (const s of sil) for (const p of s.getPoints(24)) box.expandByPoint(p);
  return box;
}
