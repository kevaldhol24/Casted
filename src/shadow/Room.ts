import * as THREE from 'three';

/**
 * The room around the puzzle: a pool of lamplight on the wall and floor (everything darkens away from the shadow),
 * a generated floor texture, and a few props per world at the edges of the view. Props sit well outside the
 * light's shadow camera and the mask layer, so they never touch the shadow or the score.
 */

export type FloorPattern = 'planks' | 'checker' | 'concrete';
export type DecorKind = 'attic' | 'kitchen' | 'workshop' | 'theatre';

/** Shared by every material in the room: where the light pool is centred and how wide it is. */
export const pool = {
  uPoolCenter: { value: new THREE.Vector3(0, 1.5, -2.6) },
  /** Inner radius (full light), outer radius (edge darkness reached), edge brightness. */
  uPool: { value: new THREE.Vector3(1.6, 5.5, 0.38) },
};

/**
 * Darken a material away from the pool's centre. `scale` weights each world axis in the distance (the wall uses
 * x and y, the floor x and z), so the falloff is an ellipse on that surface.
 */
export function poolify(mat: THREE.Material, scale: THREE.Vector3) {
  const uScale = { value: scale };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, pool, { uPoolScale: uScale });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPoolWorld;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvPoolWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPoolWorld;\nuniform vec3 uPoolCenter;\nuniform vec3 uPool;\nuniform vec3 uPoolScale;')
      .replace(
        '#include <opaque_fragment>',
        `float poolD = length((vPoolWorld - uPoolCenter) * uPoolScale);
        outgoingLight *= mix(1.0, uPool.z, smoothstep(uPool.x, uPool.y, poolD));
        #include <opaque_fragment>`,
      );
  };
  mat.customProgramCacheKey = () => 'pool';
}

/** Greyscale floor detail (the palette's floor colour tints it): boards, tiles or poured concrete. Tiles seamlessly. */
export function floorMap(pattern: FloorPattern): THREE.DataTexture {
  const w = 256;
  const h = 256;
  const data = new Uint8Array(w * h * 4);
  let st = 11;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
  const boards = 8;
  const tone = Array.from({ length: boards * 2 }, () => 0.82 + rnd() * 0.16);
  const joint = Array.from({ length: boards }, () => Math.floor(rnd() * h));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 1;
      if (pattern === 'planks') {
        const bw = w / boards;
        const b = Math.floor(x / bw);
        const inB = x - b * bw;
        const second = (y - joint[b] + h) % h < h / 2 ? 0 : 1;
        v = tone[b * 2 + second];
        // Wood grain: fine stripes along the board that wander a little.
        v *= 0.94 + 0.06 * Math.sin((inB + Math.sin(y * 0.05 + b) * 2.5) * 1.3);
        if (inB < 1.5 || inB > bw - 1.5) v *= 0.5;
        if (Math.abs(((y - joint[b] + h) % (h / 2))) < 1.2) v *= 0.6;
      } else if (pattern === 'checker') {
        const c = 32;
        const odd = (Math.floor(x / c) + Math.floor(y / c)) % 2;
        v = odd ? 0.78 : 1;
        if (x % c < 1 || y % c < 1) v *= 0.7;
      } else {
        v = 0.86 + rnd() * 0.08 + 0.06 * Math.sin(x * 0.07) * Math.sin(y * 0.05);
      }
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.min(255, v * 255);
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

const FLOOR_Y = -2.6;
const WALL_Z = -2.6;

/** A flat-shaded standard material that also sits in the light pool. */
function mat(color: string, extra: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
  poolify(m, new THREE.Vector3(0.6, 0.6, 0.6));
  return m;
}

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, rz = 0, ry = 0) {
  const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  b.position.set(x, y, z);
  b.rotation.set(0, ry, rz);
  return b;
}

function cyl(r: number, h: number, m: THREE.Material, x: number, y: number, z: number, seg = 16, rTop = r) {
  const c = new THREE.Mesh(new THREE.CylinderGeometry(rTop, r, h, seg), m);
  c.position.set(x, y, z);
  return c;
}

/** Both sides of the room at once: `make(side)` builds one side, side = -1 (left) or 1 (right). */
function mirrored(g: THREE.Group, make: (s: number) => THREE.Object3D[]) {
  for (const s of [-1, 1]) g.add(...make(s));
}

function attic(): THREE.Group {
  const g = new THREE.Group();
  const beam = mat('#5a3d27');
  const beamDark = mat('#4a3120');
  const crate = mat('#8a6440');
  const crateEdge = mat('#6a4a2e');
  // Roof rafters sloping down to each side of the shadow, with an upright post under each.
  mirrored(g, (s) => [
    box(5.6, 0.45, 0.5, beam, s * 6.8, 2.7, WALL_Z + 0.3, -s * 0.6),
    box(0.42, 6.1, 0.42, beamDark, s * 5.7, FLOOR_Y + 3.05, WALL_Z + 0.25),
  ]);
  // Round attic window, left: pale glass and a cross of glazing bars.
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 8, 32), beam);
  frame.position.set(-6.9, 1.4, WALL_Z + 0.06);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.6, 32), new THREE.MeshBasicMaterial({ color: '#cfe0f0' }));
  glass.position.set(-6.9, 1.4, WALL_Z + 0.03);
  g.add(frame, glass, box(1.2, 0.07, 0.06, beam, -6.9, 1.4, WALL_Z + 0.07), box(0.07, 1.2, 0.06, beam, -6.9, 1.4, WALL_Z + 0.07));
  // Stacked crates on the left, a trunk and books on the right.
  g.add(box(1.3, 1.1, 1.1, crate, -4.7, FLOOR_Y + 0.55, -1.6, 0, 0.25));
  g.add(box(1.34, 0.12, 1.14, crateEdge, -4.7, FLOOR_Y + 0.55, -1.6, 0, 0.25));
  g.add(box(0.9, 0.8, 0.8, crate, -4.85, FLOOR_Y + 1.5, -1.7, 0, -0.2));
  g.add(box(1.7, 0.85, 0.95, mat('#6b3f2a'), 4.9, FLOOR_Y + 0.43, -1.5, 0, -0.18));
  g.add(box(1.76, 0.18, 1.0, mat('#3d2a1d'), 4.9, FLOOR_Y + 0.9, -1.5, 0, -0.18));
  const books = ['#8e3b32', '#3f5a6b', '#a68a4a', '#5a6b3f'];
  books.forEach((c, i) => g.add(box(0.85 - i * 0.06, 0.16, 0.6, mat(c), 4.7 + (i % 2) * 0.05, FLOOR_Y + 1.08 + i * 0.16, -1.45, 0, 0.1 * i)));
  return g;
}

function kitchen(): THREE.Group {
  const g = new THREE.Group();
  const cab = mat('#8fb3a4');
  const top = mat('#e9e2d2');
  const jar = mat('#d9c9a0', { roughness: 0.4 });
  mirrored(g, (s) => [
    box(3, 1.7, 1.2, cab, s * 6.2, FLOOR_Y + 0.85, WALL_Z + 0.6),
    box(3.1, 0.12, 1.3, top, s * 6.2, FLOOR_Y + 1.76, WALL_Z + 0.62),
    box(0.04, 1.2, 0.02, mat('#6f8f82'), s * 5.4, FLOOR_Y + 0.9, WALL_Z + 1.21),
    cyl(0.22, 0.5, jar, s * 5.3, FLOOR_Y + 2.07, WALL_Z + 0.5),
    cyl(0.17, 0.38, mat('#c98f5a', { roughness: 0.4 }), s * 5.85, FLOOR_Y + 2.0, WALL_Z + 0.45),
    cyl(0.24, 0.07, mat('#7a5a3a'), s * 5.3, FLOOR_Y + 2.36, WALL_Z + 0.5),
  ]);
  // A shelf with plates on the right wall, a rail of utensils on the left.
  g.add(box(2.2, 0.1, 0.4, mat('#b98c5f'), 6.0, 1.5, WALL_Z + 0.2));
  for (let i = 0; i < 4; i++) {
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.04, 24), mat(i % 2 ? '#f4efe4' : '#bcd6cc'));
    plate.rotation.x = Math.PI / 2 - 0.15;
    plate.position.set(5.3 + i * 0.45, 1.87, WALL_Z + 0.22);
    g.add(plate);
  }
  g.add(box(2.0, 0.06, 0.06, mat('#9aa3a0', { metalness: 0.6, roughness: 0.3 }), -5.9, 1.9, WALL_Z + 0.15));
  const steel = mat('#aab3b0', { metalness: 0.6, roughness: 0.3 });
  for (let i = 0; i < 3; i++) {
    g.add(box(0.06, 0.8, 0.03, steel, -6.5 + i * 0.6, 1.45, WALL_Z + 0.16));
    g.add(cyl(0.13, 0.05, steel, -6.5 + i * 0.6, 1.0, WALL_Z + 0.16, 12));
  }
  return g;
}

function workshop(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat('#a77a4a');
  const leg = mat('#5b4330');
  const metal = mat('#7d8a86', { metalness: 0.5, roughness: 0.45 });
  const handle = mat('#c4622f');
  mirrored(g, (s) => [
    box(3.2, 0.22, 1.4, wood, s * 6.3, FLOOR_Y + 1.6, WALL_Z + 0.75),
    box(0.18, 1.5, 0.18, leg, s * 5.0, FLOOR_Y + 0.75, WALL_Z + 1.3),
    box(0.18, 1.5, 0.18, leg, s * 7.6, FLOOR_Y + 0.75, WALL_Z + 1.3),
    box(2.8, 0.12, 1.1, leg, s * 6.3, FLOOR_Y + 0.4, WALL_Z + 0.75),
  ]);
  // Tools hung on the pegboard: a wrench, a hammer and a saw on the left; a screwdriver set on the right.
  g.add(box(0.14, 1.1, 0.05, metal, -5.4, 1.2, WALL_Z + 0.05, 0.3));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.07, 8, 16, Math.PI * 1.5), metal);
  ring.position.set(-5.22, 1.75, WALL_Z + 0.05);
  g.add(ring);
  g.add(box(0.1, 1.0, 0.06, mat('#6b4a2f'), -6.4, 1.0, WALL_Z + 0.05));
  g.add(box(0.55, 0.22, 0.12, metal, -6.4, 1.55, WALL_Z + 0.07));
  g.add(box(1.2, 0.42, 0.03, metal, -7.4, 1.3, WALL_Z + 0.04, -0.1));
  g.add(box(0.3, 0.42, 0.08, handle, -6.75, 1.36, WALL_Z + 0.06, -0.1));
  for (let i = 0; i < 4; i++) {
    g.add(box(0.06, 0.55, 0.05, metal, 5.3 + i * 0.4, 1.0, WALL_Z + 0.05));
    g.add(box(0.13, 0.35, 0.1, i % 2 ? handle : mat('#e2b13c'), 5.3 + i * 0.4, 1.42, WALL_Z + 0.07));
  }
  // A vice and an oil can on the benches.
  g.add(box(0.5, 0.35, 0.4, metal, -5.6, FLOOR_Y + 1.88, WALL_Z + 1.1));
  g.add(cyl(0.22, 0.45, mat('#c9453a', { metalness: 0.3 }), 5.6, FLOOR_Y + 1.94, WALL_Z + 0.8));
  return g;
}

/** A velvet curtain: a tall plane folded into soft pleats (sine displacement), hung at x. */
function curtain(x: number, width: number, m: THREE.Material) {
  const geo = new THREE.PlaneGeometry(width, 10, 40, 1);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 4.2) * 0.14 + Math.sin(p.getX(i) * 9) * 0.04);
  geo.computeVertexNormals();
  const c = new THREE.Mesh(geo, m);
  c.position.set(x, FLOOR_Y + 5, WALL_Z + 0.9);
  return c;
}

function theatre(): THREE.Group {
  const g = new THREE.Group();
  const velvet = new THREE.MeshStandardMaterial({ color: '#7a1420', roughness: 0.75, side: THREE.DoubleSide });
  poolify(velvet, new THREE.Vector3(0.6, 0.6, 0.6));
  mirrored(g, (s) => [curtain(s * 6.6, 3.4, velvet)]);
  // Stage lip at the front of the floor and footlights along it.
  g.add(box(30, 0.3, 0.4, mat('#3a1a14'), 0, FLOOR_Y + 0.15, 4.2));
  const bulb = new THREE.MeshBasicMaterial({ color: '#ffd98a' });
  for (let i = -6; i <= 6; i++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bulb);
    b.position.set(i * 1.1, FLOOR_Y + 0.36, 4.1);
    g.add(b);
  }
  return g;
}

/** The props for a world (cached by the scene; one group is shown at a time). */
export function buildDecor(kind: DecorKind): THREE.Group {
  const g = kind === 'kitchen' ? kitchen() : kind === 'workshop' ? workshop() : kind === 'theatre' ? theatre() : attic();
  g.traverse((o) => {
    o.castShadow = false;
    o.receiveShadow = false;
  });
  return g;
}
