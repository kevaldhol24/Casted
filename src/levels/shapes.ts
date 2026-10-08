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

const V = (x: number, y: number) => new THREE.Vector2(x, y);
const line = (x0: number, y0: number, x1: number, y1: number, w: number) => stroke(new THREE.LineCurve(V(x0, y0), V(x1, y1)), w, 2);
const curve = (pts: [number, number][], w: number) =>
  stroke(
    pts.length === 3
      ? new THREE.QuadraticBezierCurve(V(...pts[0]), V(...pts[1]), V(...pts[2]))
      : new THREE.CubicBezierCurve(V(...pts[0]), V(...pts[1]), V(...pts[2]), V(...pts[3])),
    w,
  );
const ring = (cx: number, cy: number, r: number, inner: number) => {
  const s = circle(cx, cy, r);
  s.holes.push(hole(cx, cy, inner));
  return s;
};

function teapot(): Silhouette {
  return [
    ellipse(0, -0.15, 0.62, 0.48),
    ellipse(0, 0.33, 0.32, 0.1),
    circle(0, 0.47, 0.08),
    curve([[0.45, -0.2], [0.8, -0.15], [0.98, 0.28]], 0.14),
    curve([[-0.5, 0.15], [-1.0, 0.2], [-1.0, -0.35], [-0.52, -0.35]], 0.1),
    rect(-0.36, -0.7, 0.36, -0.56),
  ];
}

function bird(): Silhouette {
  return [
    ellipse(0, 0, 0.46, 0.14, 0.08),
    circle(0.46, 0.1, 0.13),
    poly([[0.56, 0.13], [0.74, 0.08], [0.56, 0.03]]),
    poly([[-0.12, 0.06], [0.16, 0.06], [-0.22, 0.72], [-0.58, 0.86], [-0.36, 0.48]]),
    poly([[0.0, 0.04], [0.22, 0.02], [0.48, 0.62], [0.3, 0.7]]),
    poly([[-0.38, 0.02], [-0.86, 0.2], [-0.8, -0.14]]),
  ];
}

function umbrella(): Silhouette {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI;
    pts.push([Math.cos(a), 0.68 * Math.sin(a)]);
  }
  for (let i = 1; i < 24; i++) {
    const x = -1 + (i / 24) * 2;
    pts.push([x, 0.1 * Math.abs(Math.sin(((x + 1) / 0.5) * Math.PI))]);
  }
  return [
    poly(pts),
    rect(-0.04, -0.85, 0.04, 0.1),
    curve([[0, -0.82], [0, -1.02], [-0.26, -1.02], [-0.26, -0.84]], 0.08),
    poly([[-0.05, 0.64], [0.05, 0.64], [0, 0.82]]),
  ];
}

function bicycle(): Silhouette {
  const w = 0.08;
  return [
    ring(-0.56, -0.28, 0.42, 0.33),
    ring(0.56, -0.28, 0.42, 0.33),
    circle(-0.56, -0.28, 0.07),
    circle(0.56, -0.28, 0.07),
    line(-0.56, -0.28, 0.56, -0.28, 0.07),
    line(-0.05, -0.28, -0.2, 0.28, w),
    line(-0.2, 0.25, 0.34, 0.25, w),
    line(-0.05, -0.28, 0.34, 0.22, w),
    line(0.34, 0.25, 0.56, -0.28, w),
    line(-0.05, -0.28, -0.56, -0.28, w),
    line(-0.2, 0.25, -0.56, -0.28, w),
    curve([[0.34, 0.25], [0.3, 0.45], [0.48, 0.48]], w),
    rect(-0.34, 0.3, -0.06, 0.37),
    circle(-0.05, -0.28, 0.1),
  ];
}

function rockingHorse(): Silhouette {
  return [
    curve([[-0.95, -0.55], [-0.4, -0.95], [0.4, -0.95], [0.95, -0.55]], 0.1),
    ellipse(-0.05, 0.0, 0.52, 0.2),
    line(-0.4, -0.05, -0.55, -0.7, 0.1),
    line(-0.22, -0.05, -0.25, -0.8, 0.1),
    line(0.18, -0.05, 0.22, -0.8, 0.1),
    line(0.35, -0.05, 0.52, -0.72, 0.1),
    poly([[0.25, 0.05], [0.48, 0.12], [0.66, 0.55], [0.44, 0.62]]),
    ellipse(0.66, 0.55, 0.22, 0.11, -0.45),
    poly([[0.5, 0.66], [0.56, 0.86], [0.62, 0.66]]),
    curve([[-0.52, 0.06], [-0.8, 0.05], [-0.88, -0.32]], 0.09),
    poly([[0.32, 0.5], [0.4, 0.75], [0.24, 0.6], [0.2, 0.2]]),
  ];
}

function key(): Silhouette {
  return [
    ring(-0.6, 0, 0.32, 0.15),
    rect(-0.32, -0.065, 0.88, 0.065),
    rect(0.52, -0.3, 0.63, -0.06),
    rect(0.72, -0.24, 0.84, -0.06),
    rect(-0.18, -0.12, -0.08, 0.12),
  ];
}

function rabbit(): Silhouette {
  return [
    ellipse(-0.05, -0.42, 0.52, 0.44),
    circle(0.26, 0.1, 0.27),
    ellipse(0.14, 0.56, 0.085, 0.32, 0.15),
    ellipse(0.38, 0.52, 0.085, 0.3, -0.3),
    circle(-0.54, -0.48, 0.13),
    ellipse(0.26, -0.84, 0.26, 0.075),
  ];
}

function guitar(): Silhouette {
  const lower = circle(0, -0.48, 0.42);
  lower.holes.push(hole(0, -0.48, 0.12));
  return [
    lower,
    ellipse(0, -0.02, 0.32, 0.3),
    rect(-0.06, 0.24, 0.06, 0.84),
    rect(-0.11, 0.82, 0.11, 1.0),
    rect(-0.18, -0.74, 0.18, -0.66),
  ];
}

function anchor(): Silhouette {
  return [
    rect(-0.06, -0.78, 0.06, 0.6),
    ring(0, 0.76, 0.17, 0.08),
    rect(-0.4, 0.4, 0.4, 0.5),
    curve([[-0.72, -0.2], [-0.6, -0.95], [0.6, -0.95], [0.72, -0.2]], 0.11),
    poly([[-0.88, -0.3], [-0.62, -0.08], [-0.66, -0.38]]),
    poly([[0.88, -0.3], [0.62, -0.08], [0.66, -0.38]]),
  ];
}

function elephant(): Silhouette {
  const head = circle(0.6, 0.12, 0.3);
  head.holes.push(hole(0.72, 0.22, 0.045));
  return [
    ellipse(-0.05, -0.08, 0.62, 0.42),
    head,
    ellipse(0.42, 0.1, 0.2, 0.28),
    curve([[0.82, 0.0], [0.95, -0.3], [0.9, -0.62], [1.04, -0.6]], 0.13),
    rect(-0.52, -0.82, -0.32, -0.3),
    rect(-0.24, -0.82, -0.06, -0.3),
    rect(0.12, -0.82, 0.3, -0.3),
    rect(0.36, -0.82, 0.54, -0.3),
    curve([[-0.64, 0.05], [-0.8, -0.05], [-0.82, -0.35]], 0.07),
  ];
}

export const SILHOUETTES: Record<string, () => Silhouette> = {
  heart,
  star,
  house,
  fish,
  cat: catSitting,
  teapot,
  bird,
  umbrella,
  bicycle,
  rockingHorse,
  key,
  rabbit,
  guitar,
  anchor,
  elephant,
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
