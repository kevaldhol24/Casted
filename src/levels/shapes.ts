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

// --- World 2 (Kitchen) assembly targets: each split into the pieces the player turns separately, all drawn in
// --- the target's own frame so the pieces line up when every one is solved.

function mushroomCap(): Silhouette {
  const s = new THREE.Shape();
  s.moveTo(-1.0, 0.05);
  s.bezierCurveTo(-1.0, 0.7, -0.5, 0.98, 0, 0.98);
  s.bezierCurveTo(0.5, 0.98, 1.0, 0.7, 1.0, 0.05);
  s.bezierCurveTo(0.55, -0.08, -0.55, -0.08, -1.0, 0.05);
  s.holes.push(hole(-0.42, 0.48, 0.12), hole(0.28, 0.66, 0.1), hole(0.55, 0.3, 0.09));
  return [s];
}

function mushroomStem(): Silhouette {
  const s = new THREE.Shape();
  s.moveTo(-0.26, 0.05);
  s.lineTo(0.26, 0.05);
  s.bezierCurveTo(0.3, -0.4, 0.42, -0.8, 0.4, -0.95);
  s.lineTo(-0.4, -0.95);
  s.bezierCurveTo(-0.42, -0.8, -0.3, -0.4, -0.26, 0.05);
  return [s];
}

const iceScoop = (): Silhouette => [
  circle(0, 0.38, 0.55),
  circle(-0.4, -0.05, 0.2),
  circle(0.02, -0.12, 0.22),
  circle(0.42, -0.04, 0.19),
  circle(0.14, 0.98, 0.11),
];

function iceCone(): Silhouette {
  const s = poly([[-0.5, -0.02], [0.5, -0.02], [0, -1.0]]);
  s.holes.push(rectHole(-0.06, -0.3, 0.06, -0.18), rectHole(-0.2, -0.16, -0.1, -0.06), rectHole(0.1, -0.16, 0.2, -0.06));
  return [s];
}

const sails = (): Silhouette => [
  poly([[-0.06, -0.3], [-0.06, 0.95], [-0.78, -0.3]]),
  poly([[0.06, -0.3], [0.06, 0.78], [0.62, -0.3]]),
  rect(-0.05, -0.42, 0.05, 1.02),
  poly([[0.05, 1.02], [0.32, 0.94], [0.05, 0.86]]),
];

const hull = (): Silhouette => [poly([[-0.98, -0.38], [0.98, -0.38], [0.68, -0.78], [-0.7, -0.78]])];

function balloon(): Silhouette {
  const s = new THREE.Shape();
  s.moveTo(0, -0.22);
  s.bezierCurveTo(-0.25, -0.15, -0.72, 0.15, -0.72, 0.52);
  s.bezierCurveTo(-0.72, 0.85, -0.4, 1.0, 0, 1.0);
  s.bezierCurveTo(0.4, 1.0, 0.72, 0.85, 0.72, 0.52);
  s.bezierCurveTo(0.72, 0.15, 0.25, -0.15, 0, -0.22);
  return [s, rect(-0.16, -0.32, 0.16, -0.16)];
}

const basket = (): Silhouette => [
  rect(-0.2, -0.98, 0.2, -0.68),
  stroke(new THREE.LineCurve(new THREE.Vector2(-0.17, -0.7), new THREE.Vector2(-0.13, -0.26)), 0.06, 2),
  stroke(new THREE.LineCurve(new THREE.Vector2(0.17, -0.7), new THREE.Vector2(0.13, -0.26)), 0.06, 2),
];

function rocketBody(): Silhouette {
  const body = poly([[0, 1.0], [0.24, 0.62], [0.26, -0.45], [-0.26, -0.45], [-0.24, 0.62]]);
  body.holes.push(hole(0, 0.25, 0.11));
  return [
    body,
    poly([[0.25, -0.05], [0.58, -0.55], [0.58, -0.7], [0.25, -0.45]]),
    poly([[-0.25, -0.05], [-0.25, -0.45], [-0.58, -0.7], [-0.58, -0.55]]),
    rect(-0.16, -0.56, 0.16, -0.44),
  ];
}

const rocketFlame = (): Silhouette => [poly([[-0.15, -0.52], [0.15, -0.52], [0.1, -0.72], [0, -1.0], [-0.1, -0.72]])];

const cupcakeTop = (): Silhouette => [
  ellipse(0, 0.08, 0.7, 0.18),
  ellipse(0, 0.3, 0.55, 0.17),
  ellipse(0.02, 0.5, 0.38, 0.15),
  poly([[-0.16, 0.58], [0.16, 0.58], [0.04, 0.78]]),
  circle(0.02, 0.84, 0.12),
  curve([[0.04, 0.94], [0.08, 1.04], [0.24, 1.06]], 0.04),
];

function cupcakeCase(): Silhouette {
  const s = poly([[-0.62, -0.04], [0.62, -0.04], [0.46, -0.95], [-0.46, -0.95]]);
  for (const x of [-0.28, 0, 0.28]) s.holes.push(rectHole(x - 0.03, -0.8, x + 0.03, -0.2));
  return [s];
}

function lighthouseTower(): Silhouette {
  const s = poly([[-0.38, -0.92], [0.38, -0.92], [0.24, 0.35], [-0.24, 0.35]]);
  s.holes.push(rectHole(-0.1, -0.84, 0.1, -0.6), rectHole(-0.06, -0.38, 0.06, -0.2), rectHole(-0.05, 0.02, 0.05, 0.16));
  return [s, rect(-0.62, -1.0, 0.62, -0.9)];
}

function lighthouseLamp(): Silhouette {
  const room = rect(-0.2, 0.42, 0.2, 0.68);
  room.holes.push(rectHole(-0.14, 0.48, -0.03, 0.63), rectHole(0.03, 0.48, 0.14, 0.63));
  return [
    rect(-0.36, 0.33, 0.36, 0.43),
    room,
    poly([[-0.27, 0.67], [0.27, 0.67], [0, 0.9]]),
    circle(0, 0.93, 0.05),
    poly([[0.19, 0.56], [0.95, 0.76], [0.95, 0.4]]),
    poly([[-0.19, 0.56], [-0.95, 0.46], [-0.95, 0.66]]),
  ];
}

function pineappleFruit(): Silhouette {
  const s = ellipse(0, -0.36, 0.48, 0.62);
  for (const [x, y] of [[0, 0.02], [-0.2, -0.2], [0.2, -0.2], [0, -0.44], [-0.2, -0.68], [0.2, -0.68]]) s.holes.push(hole(x, y, 0.06));
  return [s];
}

const pineappleCrown = (): Silhouette => [
  poly([[-0.1, 0.18], [0.1, 0.18], [0.02, 1.0]]),
  poly([[-0.14, 0.18], [0.06, 0.24], [-0.42, 0.86]]),
  poly([[-0.06, 0.24], [0.14, 0.18], [0.46, 0.78]]),
  poly([[-0.2, 0.18], [0.0, 0.2], [-0.66, 0.5]]),
  poly([[0.0, 0.2], [0.2, 0.18], [0.62, 0.42]]),
];

function windmillTower(): Silhouette {
  const s = poly([[-0.4, -0.98], [0.4, -0.98], [0.22, 0.02], [-0.22, 0.02]]);
  s.holes.push(rectHole(-0.09, -0.9, 0.09, -0.62), hole(0, -0.3, 0.07));
  return [s, poly([[-0.29, 0.0], [0.29, 0.0], [0, 0.28]])];
}

/** Four lattice sails round a hub at (0, 0.12), turned 45° off the cross. */
function windmillSails(): Silhouette {
  const hub = V(0, 0.12);
  const out: Silhouette = [circle(hub.x, hub.y, 0.09)];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const at = (along: number, side: number): [number, number] => {
      const p = V(along, side).rotateAround(V(0, 0), a).add(hub);
      return [p.x, p.y];
    };
    out.push(poly([at(0, -0.025), at(0.86, -0.025), at(0.86, 0.025), at(0, 0.025)]));
    const sail = poly([at(0.26, 0.02), at(0.84, 0.02), at(0.84, 0.22), at(0.26, 0.22)]);
    const pane = (a0: number, a1: number) => {
      const h = new THREE.Path();
      const pts = [at(a0, 0.07), at(a1, 0.07), at(a1, 0.17), at(a0, 0.17)];
      h.moveTo(...pts[0]);
      for (const p of pts.slice(1)) h.lineTo(...p);
      h.closePath();
      return h;
    };
    sail.holes.push(pane(0.32, 0.52), pane(0.58, 0.78));
    out.push(sail);
  }
  return out;
}

const duckBody = (): Silhouette => [
  ellipse(0, -0.42, 0.74, 0.38),
  poly([[-0.56, -0.3], [-0.92, 0.06], [-0.72, -0.52]]),
  ellipse(0.2, -0.12, 0.3, 0.14),
];

function duckHead(): Silhouette {
  const head = circle(0.34, 0.3, 0.32);
  head.holes.push(hole(0.44, 0.38, 0.05));
  return [head, poly([[0.6, 0.3], [0.96, 0.2], [0.62, 0.12]])];
}

const snowmanBase = (): Silhouette => [circle(0, -0.6, 0.38), ellipse(0, -0.94, 0.62, 0.07)];

function snowmanMiddle(): Silhouette {
  const body = circle(0, -0.02, 0.28);
  body.holes.push(hole(0, 0.06, 0.04), hole(0, -0.1, 0.04));
  return [
    body,
    line(0.2, 0.05, 0.72, 0.36, 0.05),
    line(0.56, 0.27, 0.62, 0.46, 0.04),
    line(-0.2, 0.05, -0.74, 0.24, 0.05),
    line(-0.6, 0.19, -0.68, 0.02, 0.04),
  ];
}

function snowmanHead(): Silhouette {
  const head = circle(0, 0.42, 0.2);
  head.holes.push(hole(-0.07, 0.47, 0.03), hole(0.07, 0.47, 0.03));
  return [head, poly([[0.02, 0.43], [0.34, 0.38], [0.02, 0.36]]), rect(-0.22, 0.57, 0.22, 0.62), rect(-0.13, 0.6, 0.13, 0.88)];
}

const carBody = (): Silhouette => [
  poly([[-0.96, -0.46], [0.96, -0.46], [0.96, -0.12], [0.72, -0.02], [-0.84, -0.02], [-0.96, -0.16]]),
  rect(0.86, -0.3, 1.0, -0.2),
];

function carCabin(): Silhouette {
  const s = poly([[-0.55, -0.05], [0.45, -0.05], [0.25, 0.38], [-0.4, 0.38]]);
  s.holes.push(rectHole(-0.36, 0.03, -0.08, 0.3), rectHole(0.0, 0.03, 0.22, 0.3));
  return [s];
}

const carWheels = (): Silhouette => [
  ring(-0.55, -0.5, 0.23, 0.1),
  ring(0.55, -0.5, 0.23, 0.1),
  circle(-0.55, -0.5, 0.05),
  circle(0.55, -0.5, 0.05),
  line(-0.55, -0.5, 0.55, -0.5, 0.05),
];

const giraffeLegs = (): Silhouette => [
  rect(-0.55, -0.32, 0.42, -0.2),
  ...[-0.5, -0.32, 0.18, 0.36].flatMap((x) => [rect(x - 0.05, -0.92, x + 0.05, -0.22), rect(x - 0.07, -0.98, x + 0.07, -0.9)]),
];

function giraffeBody(): Silhouette {
  const body = ellipse(-0.05, -0.08, 0.6, 0.25);
  body.holes.push(hole(-0.3, -0.04, 0.07), hole(0.04, -0.12, 0.08), hole(0.3, 0.0, 0.06));
  return [body, curve([[-0.62, -0.04], [-0.8, -0.14], [-0.82, -0.46]], 0.05)];
}

function giraffeNeck(): Silhouette {
  const head = ellipse(0.74, 0.76, 0.21, 0.11, -0.3);
  head.holes.push(hole(0.7, 0.8, 0.03));
  return [
    poly([[0.24, 0.02], [0.5, 0.02], [0.72, 0.7], [0.58, 0.76]]),
    head,
    line(0.62, 0.82, 0.6, 0.98, 0.04),
    line(0.69, 0.84, 0.72, 0.99, 0.04),
    poly([[0.56, 0.8], [0.44, 0.9], [0.6, 0.86]]),
  ];
}

function robotHead(): Silhouette {
  const head = rect(-0.28, 0.4, 0.28, 0.78);
  head.holes.push(hole(-0.12, 0.62, 0.06), hole(0.12, 0.62, 0.06), rectHole(-0.12, 0.46, 0.12, 0.5));
  return [head, line(0, 0.77, 0, 0.92, 0.04), circle(0, 0.95, 0.05), rect(-0.35, 0.54, -0.27, 0.66), rect(0.27, 0.54, 0.35, 0.66)];
}

function robotTorso(): Silhouette {
  const torso = rect(-0.4, -0.34, 0.4, 0.36);
  torso.holes.push(rectHole(-0.22, -0.08, 0.06, 0.16), hole(0.2, 0.04, 0.06));
  return [
    torso,
    line(-0.36, 0.24, -0.7, -0.16, 0.12),
    poly([[-0.78, -0.12], [-0.62, -0.2], [-0.7, -0.4], [-0.74, -0.26], [-0.86, -0.3]]),
    line(0.36, 0.24, 0.72, 0.58, 0.12),
    poly([[0.68, 0.64], [0.78, 0.52], [0.98, 0.62], [0.84, 0.66], [0.88, 0.8]]),
  ];
}

const robotLegs = (): Silhouette => [
  rect(-0.3, -0.9, -0.1, -0.33),
  rect(0.1, -0.9, 0.3, -0.33),
  rect(-0.42, -0.98, -0.06, -0.88),
  rect(0.06, -0.98, 0.42, -0.88),
];

const crenels = (x0: number, x1: number, y: number, n: number) => {
  const w = (x1 - x0) / (2 * n - 1);
  return Array.from({ length: n }, (_, i) => rect(x0 + 2 * i * w, y - 0.01, x0 + (2 * i + 1) * w, y + 0.1));
};

function castleLeft(): Silhouette {
  const tower = rect(-0.95, -0.95, -0.55, 0.45);
  tower.holes.push(rectHole(-0.8, 0.0, -0.7, 0.2), rectHole(-0.8, -0.5, -0.7, -0.32));
  return [tower, ...crenels(-0.95, -0.55, 0.45, 3)];
}

function castleKeep(): Silhouette {
  const keep = rect(-0.58, -0.95, 0.58, 0.15);
  const gate = new THREE.Path();
  gate.moveTo(-0.18, -0.88);
  gate.lineTo(0.18, -0.88);
  gate.lineTo(0.18, -0.52);
  gate.absarc(0, -0.52, 0.18, 0, Math.PI, false);
  gate.lineTo(-0.18, -0.88);
  keep.holes.push(gate, rectHole(-0.4, -0.2, -0.3, -0.04), rectHole(0.3, -0.2, 0.4, -0.04));
  return [keep, ...crenels(-0.5, 0.5, 0.15, 5)];
}

function castleRight(): Silhouette {
  const tower = rect(0.55, -0.95, 0.95, 0.55);
  tower.holes.push(hole(0.75, 0.15, 0.07), rectHole(0.7, -0.5, 0.8, -0.3));
  return [tower, poly([[0.5, 0.54], [1.0, 0.54], [0.75, 0.88]]), line(0.75, 0.86, 0.75, 1.02, 0.03), poly([[0.76, 1.02], [0.96, 0.97], [0.76, 0.92]])];
}

// --- World 3 (Workshop) ---------------------------------------------------------------------------

function snail(): Silhouette {
  const shell = circle(0.18, 0.1, 0.56);
  shell.holes.push(hole(0.26, 0.08, 0.14));
  return [
    shell,
    poly([[-0.95, -0.62], [0.82, -0.62], [0.98, -0.5], [0.62, -0.38], [-0.62, -0.38]]),
    ellipse(-0.74, -0.28, 0.19, 0.3),
    line(-0.8, -0.1, -0.95, 0.38, 0.07),
    line(-0.66, -0.1, -0.6, 0.42, 0.07),
    circle(-0.95, 0.4, 0.08),
    circle(-0.6, 0.44, 0.08),
  ];
}

function owl(): Silhouette {
  const body = ellipse(0, -0.12, 0.56, 0.72);
  body.holes.push(hole(-0.21, 0.22, 0.12), hole(0.21, 0.22, 0.12));
  return [
    body,
    poly([[-0.5, 0.3], [-0.16, 0.52], [-0.52, 0.88]]),
    poly([[0.16, 0.52], [0.5, 0.3], [0.52, 0.88]]),
    poly([[-0.07, 0.12], [0.07, 0.12], [0, -0.06]]),
    rect(-0.98, -0.94, 0.98, -0.8),
    rect(-0.24, -0.86, -0.1, -0.74),
    rect(0.1, -0.86, 0.24, -0.74),
  ];
}

function squirrel(): Silhouette {
  return [
    ellipse(0.18, -0.42, 0.38, 0.5),
    circle(0.36, 0.22, 0.27),
    poly([[0.24, 0.42], [0.3, 0.74], [0.42, 0.44]]),
    curve([[0.0, -0.78], [-0.98, -0.62], [-0.98, 0.62], [-0.36, 0.78]], 0.36),
    circle(0.6, -0.12, 0.12),
    ellipse(0.24, -0.9, 0.36, 0.07),
  ];
}

function turtle(): Silhouette {
  const dome: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI;
    dome.push([Math.cos(a) * 0.72, -0.2 + Math.sin(a) * 0.55]);
  }
  return [
    poly(dome),
    rect(-0.78, -0.3, 0.78, -0.18),
    rect(0.6, -0.22, 0.86, -0.06),
    circle(0.92, -0.04, 0.17),
    rect(-0.52, -0.58, -0.3, -0.2),
    rect(0.26, -0.58, 0.48, -0.2),
    poly([[-0.7, -0.28], [-0.98, -0.38], [-0.72, -0.14]]),
  ];
}

function dragonfly(): Silhouette {
  return [
    rect(-0.06, -0.98, 0.06, 0.2),
    ellipse(0, 0.24, 0.1, 0.16),
    circle(0, 0.5, 0.14),
    ellipse(-0.46, 0.3, 0.5, 0.13, 0.16),
    ellipse(0.46, 0.3, 0.5, 0.13, -0.16),
    ellipse(-0.4, 0.04, 0.44, 0.11, -0.22),
    ellipse(0.4, 0.04, 0.44, 0.11, 0.22),
  ];
}

function frog(): Silhouette {
  const eyeL = circle(-0.34, 0.3, 0.2);
  eyeL.holes.push(hole(-0.34, 0.33, 0.07));
  const eyeR = circle(0.34, 0.3, 0.2);
  eyeR.holes.push(hole(0.34, 0.33, 0.07));
  return [
    ellipse(0, -0.2, 0.62, 0.46),
    eyeL,
    eyeR,
    ellipse(-0.64, -0.6, 0.32, 0.13, 0.25),
    ellipse(0.64, -0.6, 0.32, 0.13, -0.25),
    poly([[-0.3, -0.5], [-0.2, -0.5], [-0.26, -0.82], [-0.42, -0.86]]),
    poly([[0.2, -0.5], [0.3, -0.5], [0.42, -0.86], [0.26, -0.82]]),
    ellipse(-0.32, -0.86, 0.14, 0.05),
    ellipse(0.32, -0.86, 0.14, 0.05),
  ];
}

function hedgehog(): Silhouette {
  const back: [number, number][] = [[0.42, -0.62], [-0.78, -0.62]];
  for (let i = 0; i <= 16; i++) {
    const a = Math.PI * (0.98 - (i / 16) * 0.8);
    const r = i % 2 ? 0.86 : 0.62;
    back.push([-0.12 + Math.cos(a) * r, -0.5 + Math.sin(a) * r * 0.95]);
  }
  const head = ellipse(0.5, -0.44, 0.32, 0.18, -0.25);
  head.holes.push(hole(0.5, -0.36, 0.04));
  return [poly(back), head, circle(0.82, -0.53, 0.06), rect(-0.5, -0.74, -0.36, -0.58), rect(0.12, -0.74, 0.26, -0.58)];
}

function bee(): Silhouette {
  const body = ellipse(0, -0.15, 0.55, 0.34);
  body.holes.push(rectHole(-0.2, -0.36, -0.1, 0.06), rectHole(0.1, -0.38, 0.2, 0.06));
  const head = circle(0.64, -0.08, 0.22);
  head.holes.push(hole(0.72, -0.02, 0.05));
  return [
    body,
    head,
    poly([[-0.5, -0.08], [-0.88, -0.2], [-0.5, -0.26]]),
    ellipse(-0.14, 0.42, 0.22, 0.38, 0.35),
    ellipse(0.2, 0.38, 0.17, 0.3, -0.3),
    curve([[0.7, 0.1], [0.76, 0.4], [0.94, 0.46]], 0.04),
    curve([[0.58, 0.12], [0.54, 0.42], [0.66, 0.56]], 0.04),
  ];
}

function mouse(): Silhouette {
  const head = poly([[0.24, -0.06], [0.95, -0.44], [0.3, -0.64]]);
  head.holes.push(hole(0.52, -0.32, 0.04));
  const ear = circle(0.26, 0.1, 0.22);
  ear.holes.push(hole(0.27, 0.11, 0.1));
  return [
    ellipse(-0.08, -0.36, 0.55, 0.34),
    head,
    ear,
    circle(0.94, -0.44, 0.05),
    curve([[-0.58, -0.46], [-1.0, -0.62], [-0.98, 0.22], [-0.6, 0.18]], 0.06),
    ellipse(0.2, -0.72, 0.16, 0.05),
    ellipse(-0.32, -0.72, 0.16, 0.05),
    line(0.8, -0.4, 0.98, -0.3, 0.025),
    line(0.8, -0.48, 1.0, -0.52, 0.025),
  ];
}

function fox(): Silhouette {
  const head = circle(0.06, 0.32, 0.22);
  head.holes.push(hole(0.16, 0.38, 0.04));
  return [
    ellipse(0, -0.36, 0.36, 0.52),
    head,
    poly([[0.1, 0.18], [0.66, 0.26], [0.12, 0.46]]),
    poly([[-0.14, 0.44], [-0.08, 0.84], [0.08, 0.5]]),
    poly([[0.08, 0.5], [0.24, 0.8], [0.26, 0.42]]),
    curve([[-0.1, -0.84], [-0.96, -0.86], [-1.0, -0.1], [-0.62, 0.12]], 0.3),
    rect(0.12, -0.92, 0.24, -0.4),
    ellipse(0.06, -0.92, 0.3, 0.06),
  ];
}

function crab(): Silhouette {
  const out: Silhouette = [ellipse(0, -0.16, 0.5, 0.3)];
  for (const s of [-1, 1]) {
    const m = (pts: [number, number][]) => pts.map(([x, y]) => [x * s, y] as [number, number]);
    out.push(
      line(-0.38 * s, -0.02, -0.62 * s, 0.24, 0.08),
      poly(m([[-0.52, 0.16], [-0.95, 0.34], [-0.86, 0.72], [-0.74, 0.46], [-0.62, 0.64], [-0.5, 0.38]])),
      line(-0.4 * s, -0.24, -0.86 * s, -0.52, 0.06),
      line(-0.34 * s, -0.32, -0.76 * s, -0.74, 0.06),
      line(-0.22 * s, -0.4, -0.48 * s, -0.86, 0.06),
      line(-0.12 * s, 0.08, -0.15 * s, 0.32, 0.04),
      circle(-0.15 * s, 0.35, 0.06),
    );
  }
  return out;
}

function seahorse(): Silhouette {
  const head = circle(0.04, 0.62, 0.2);
  head.holes.push(hole(0.1, 0.66, 0.04));
  return [
    curve([[0.06, 0.5], [0.46, 0.2], [-0.12, -0.18], [0.18, -0.6]], 0.34),
    head,
    line(0.14, 0.62, 0.56, 0.56, 0.1),
    curve([[0.18, -0.62], [0.36, -1.0], [-0.18, -1.0], [-0.06, -0.74]], 0.12),
    poly([[-0.12, 0.42], [-0.34, 0.3], [-0.2, 0.16], [-0.34, 0.04], [-0.06, 0.02]]),
    poly([[-0.08, 0.78], [-0.02, 0.96], [0.08, 0.8]]),
  ];
}

function hen(): Silhouette {
  const head = circle(0.46, 0.38, 0.2);
  head.holes.push(hole(0.52, 0.42, 0.04));
  return [
    ellipse(-0.05, -0.15, 0.58, 0.44),
    poly([[0.14, 0.1], [0.4, 0.24], [0.52, 0.2], [0.42, -0.06]]),
    head,
    circle(0.36, 0.6, 0.07),
    circle(0.47, 0.63, 0.07),
    circle(0.58, 0.58, 0.06),
    poly([[0.62, 0.42], [0.84, 0.36], [0.62, 0.32]]),
    ellipse(0.6, 0.22, 0.05, 0.08),
    poly([[-0.5, 0.0], [-0.92, 0.5], [-0.74, 0.58], [-0.42, 0.18]]),
    poly([[-0.46, 0.08], [-0.66, 0.74], [-0.48, 0.76], [-0.34, 0.2]]),
    poly([[-0.56, -0.08], [-0.98, 0.18], [-0.9, 0.32], [-0.5, 0.1]]),
    line(-0.1, -0.52, -0.12, -0.88, 0.05),
    line(0.14, -0.52, 0.16, -0.88, 0.05),
    line(-0.26, -0.9, 0.0, -0.9, 0.05),
    line(0.04, -0.9, 0.3, -0.9, 0.05),
  ];
}

function bat(): Silhouette {
  const wing = (s: number) =>
    poly(
      ([[-0.1, 0.22], [-0.46, 0.48], [-0.98, 0.32], [-0.86, 0.06], [-0.7, -0.12], [-0.52, 0.0], [-0.36, -0.18], [-0.16, -0.06]] as [number, number][]).map(
        ([x, y]) => [x * s, y] as [number, number],
      ),
    );
  const head = circle(0, 0.32, 0.14);
  head.holes.push(hole(-0.05, 0.34, 0.03), hole(0.05, 0.34, 0.03));
  return [
    ellipse(0, 0.0, 0.16, 0.32),
    head,
    poly([[-0.13, 0.36], [-0.12, 0.6], [-0.02, 0.42]]),
    poly([[0.02, 0.42], [0.12, 0.6], [0.13, 0.36]]),
    wing(1),
    wing(-1),
    line(-0.06, -0.3, -0.1, -0.5, 0.04),
    line(0.06, -0.3, 0.1, -0.5, 0.04),
  ];
}

function deer(): Silhouette {
  const head = ellipse(0.66, 0.38, 0.2, 0.1, -0.35);
  head.holes.push(hole(0.64, 0.42, 0.03));
  return [
    ellipse(-0.1, -0.2, 0.55, 0.24),
    line(-0.5, -0.3, -0.55, -0.95, 0.08),
    line(-0.32, -0.3, -0.3, -0.95, 0.08),
    line(0.2, -0.3, 0.18, -0.95, 0.08),
    line(0.35, -0.3, 0.42, -0.95, 0.08),
    poly([[0.18, -0.16], [0.42, -0.1], [0.62, 0.34], [0.45, 0.42]]),
    head,
    poly([[0.5, 0.45], [0.36, 0.58], [0.52, 0.52]]),
    curve([[0.55, 0.46], [0.45, 0.72], [0.3, 0.84], [0.14, 0.97]], 0.05),
    line(0.49, 0.64, 0.64, 0.84, 0.04),
    line(0.37, 0.79, 0.44, 0.98, 0.04),
    curve([[0.6, 0.46], [0.62, 0.7], [0.74, 0.82], [0.9, 0.95]], 0.05),
    line(0.65, 0.72, 0.84, 0.7, 0.04),
    poly([[-0.62, -0.1], [-0.8, -0.02], [-0.66, -0.22]]),
  ];
}

export const SILHOUETTES: Record<string, () => Silhouette> = {
  cupcakeTop,
  cupcakeCase,
  lighthouseTower,
  lighthouseLamp,
  pineappleFruit,
  pineappleCrown,
  windmillTower,
  windmillSails,
  duckBody,
  duckHead,
  snowmanBase,
  snowmanMiddle,
  snowmanHead,
  carBody,
  carCabin,
  carWheels,
  giraffeLegs,
  giraffeBody,
  giraffeNeck,
  robotHead,
  robotTorso,
  robotLegs,
  castleLeft,
  castleKeep,
  castleRight,
  frog,
  hedgehog,
  bee,
  mouse,
  fox,
  crab,
  seahorse,
  hen,
  bat,
  deer,
  snail,
  owl,
  squirrel,
  turtle,
  dragonfly,
  mushroomCap,
  mushroomStem,
  iceScoop,
  iceCone,
  sails,
  hull,
  balloon,
  basket,
  rocketBody,
  rocketFlame,
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
