import * as THREE from 'three';
import type { LevelObjectInstance } from '../levels/LevelLoader';
import { REVEALS, type RevealKind } from '../levels/levels';
import { MASK_LAYER } from './MaskRenderer';
import { buildDecor, floorMap, pool, poolify, type DecorKind, type FloorPattern } from './Room';

export const WALL_Z = -2.6;
/** Assembly: opacity of the pieces the player isn't turning. */
const GHOST_OPACITY = 0.15;
/** Where the object floats (before idle bob). */
export const OBJECT_POS = new THREE.Vector3(0, -0.85, 1.2);
/** Direction the light travels: from a lamp low and in front, up onto the wall, slightly offset to the right. */
export const LIGHT_DIR = new THREE.Vector3(0.1, 0.5, -1).normalize();
/**
 * How far the lamp can move from the default light (World 3 light control), degrees: yaw each way, pitch up and
 * down. Small on purpose: scoring is on the wall, 3.8 units behind the object, where a degree slides the shadow
 * about 0.07 units, so the lamp mostly moves the shadow onto the outline. Down is shorter: a low lamp throws the
 * shadow up the wall, out of view.
 */
export const LIGHT_RANGE = { yaw: 15, up: 12, down: 8 };
/** Dual-shadow levels: each lamp's strength (one lamp alone is 3.2); a shadow is lit by the other lamp only. */
const DUAL_INTENSITY = 2.1;

/** Lamp degrees → lamp pad position (x right, y up; the pad's edge is the unit circle). */
export const lampToPad = (yaw: number, pitch: number) => ({ x: yaw / LIGHT_RANGE.yaw, y: pitch / (pitch >= 0 ? LIGHT_RANGE.up : LIGHT_RANGE.down) });
/** Lamp pad position → lamp degrees. */
export const padToLamp = (x: number, y: number) => ({ yaw: x * LIGHT_RANGE.yaw, pitch: y * (y >= 0 ? LIGHT_RANGE.up : LIGHT_RANGE.down) });

/**
 * Light direction with the lamp moved `yaw` degrees right and `pitch` degrees up from the default, on a hemisphere
 * around the object (spherical angles of the lamp as seen from the object).
 */
export function lightDirection(yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  const az = Math.atan2(-LIGHT_DIR.x, -LIGHT_DIR.z) + THREE.MathUtils.degToRad(yaw);
  const el = Math.asin(-LIGHT_DIR.y) + THREE.MathUtils.degToRad(pitch);
  // Lamp direction from the object, then flipped: the light travels from the lamp towards the object.
  return out.set(-Math.sin(az) * Math.cos(el), -Math.sin(el), -Math.cos(az) * Math.cos(el));
}

export interface WorldPalette {
  background: string;
  wall: string;
  floor: string;
  light: string;
  accent: string;
  objects: string[];
  /** Wall surface: Attic plaster, Kitchen tiles, Workshop pegboard or Theatre backdrop (generated normal maps). */
  wallPattern: 'plaster' | 'tiles' | 'pegboard' | 'curtain';
  skirting: string;
  floorPattern: FloorPattern;
  /** Props at the edges of the room. */
  decor: DecorKind;
  /**
   * Dual-shadow levels (World 4): the second lamp's colour (`light` is the first's), and the outline colour of each
   * lamp's shadow. A lamp's shadow is lit only by the other lamp, so it takes that lamp's colour; its outline
   * matches.
   */
  dual?: { light: string; outlines: [string, string] };
}

/** World 1 — The Attic: dusty brown, warm tungsten, amber accent. */
export const ATTIC: WorldPalette = {
  background: '#2b2019',
  wall: '#d8c3a0',
  floor: '#8a6646',
  light: '#ffd9a8',
  accent: '#f2a43a',
  objects: ['#b8a58c', '#a8917a', '#c9b79c', '#9c8a76'],
  wallPattern: 'plaster',
  skirting: '#6b4e38',
  floorPattern: 'planks',
  decor: 'attic',
};

/** World 2 — The Kitchen: cream tiles, cool morning white, mint accent. */
export const KITCHEN: WorldPalette = {
  background: '#b7ad98',
  wall: '#efe5d1',
  floor: '#8f8574',
  light: '#eef3ff',
  accent: '#5fc9a4',
  objects: ['#d7d2c6', '#b9c6c1', '#cdbb9f', '#a7b5ae'],
  wallPattern: 'tiles',
  skirting: '#a3998a',
  floorPattern: 'checker',
  decor: 'kitchen',
};

/** World 3 — The Workshop: dark teal, yellow lamp, orange accent, pegboard wall. */
export const WORKSHOP: WorldPalette = {
  background: '#163a3a',
  wall: '#cdb58f',
  floor: '#6b7572',
  light: '#ffe49a',
  accent: '#f08a3c',
  objects: ['#c9b48f', '#9fa8a3', '#b98c5f', '#8c9a96'],
  wallPattern: 'pegboard',
  skirting: '#24504f',
  floorPattern: 'concrete',
  decor: 'workshop',
};

/** World 4 — The Theatre: deep red velvet, warm + cool spotlights, gold accent, a draped backdrop. */
export const THEATRE: WorldPalette = {
  background: '#3a0f16',
  wall: '#d6c6b4',
  floor: '#6a3c2a',
  light: '#ffc583',
  accent: '#e8c25a',
  objects: ['#c4a052', '#8e3a3e', '#ddd0b2', '#4a3a33'],
  wallPattern: 'curtain',
  skirting: '#6e1c24',
  floorPattern: 'planks',
  decor: 'theatre',
  dual: { light: '#93bbff', outlines: ['#7fb0ff', '#ffab4f'] },
};

/** Palette per world number; worlds without their own palette use the Attic's. */
export const WORLD_PALETTES: Record<number, WorldPalette> = { 1: ATTIC, 2: KITCHEN, 3: WORKSHOP, 4: THEATRE };
export const paletteFor = (world: number) => WORLD_PALETTES[world] ?? ATTIC;

const outlineVert = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    vUv = uv;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;

// The blurred target mask drives everything: a band around m = 0.5 is the outline, m > 0.5 is the paint fill.
const outlineFrag = /* glsl */ `
  uniform sampler2D uMask;
  uniform vec3 uColor;
  uniform float uGlow;
  uniform float uFill;
  uniform float uTime;
  uniform float uOpacity;
  uniform int uAnim;
  uniform float uAnimT;
  uniform float uAnimAmp;
  uniform vec4 uBox; // target bounds in mask UV: min.xy, max.xy
  uniform int uPattern; // dual shadows: 1 = stripes, 2 = dots inside the outline (colour-blind safe)
  uniform float uShine; // reveal: 0 → 1 sweeps a highlight across the painted shape
  uniform float uPop;   // reveal: how much the painted shape swells (0 = still)
  varying vec2 vUv;
  varying vec3 vWorld;

  vec2 rot(vec2 p, vec2 pivot, float a) {
    float c = cos(a), s = sin(a);
    p -= pivot;
    return pivot + vec2(c * p.x - s * p.y, s * p.x + c * p.y);
  }

  // Reveal animation as an inverse warp: for each wall pixel, where in the still mask to sample.
  // Moving the shape by +d means sampling at uv - d; rotating by a means sampling rotated by -a.
  vec2 warp(vec2 uv) {
    if (uAnim == 0 || uAnimAmp <= 0.0) return uv;
    float t = uAnimT;
    float k = uAnimAmp;
    vec2 lo = uBox.xy, hi = uBox.zw;
    vec2 size = hi - lo;
    vec2 c = (lo + hi) * 0.5;
    vec2 bottom = vec2(c.x, lo.y);
    vec2 top = vec2(c.x, hi.y);
    if (uAnim == 1) { // pulse: two quick beats, then a rest
      float ph = mod(t, 1.1);
      float beat = exp(-pow((ph - 0.12) * 16.0, 2.0)) + 0.7 * exp(-pow((ph - 0.36) * 16.0, 2.0));
      return c + (uv - c) / (1.0 + 0.09 * k * beat);
    }
    if (uAnim == 2) { // spin: one full turn, then a twinkle wobble
      float a = 6.2831853 * smoothstep(0.0, 1.3, t) + 0.12 * sin(t * 5.0) * smoothstep(1.2, 1.8, t);
      return rot(uv, c, -a * k);
    }
    if (uAnim == 3) { // hop: up in an arc, squash on landing
      float ph = fract(t * 0.8);
      float h = 4.0 * ph * (1.0 - ph);
      float squash = exp(-pow((ph - 0.02) * 14.0, 2.0)) + exp(-pow((ph - 0.98) * 14.0, 2.0));
      vec2 p = uv - vec2(0.0, min(h * 0.16 * size.y, 0.99 - hi.y) * k); // never above the mask quad
      vec2 sc = vec2(1.0 + 0.1 * squash * k, 1.0 - 0.12 * squash * k);
      return bottom + (p - bottom) / sc;
    }
    if (uAnim == 4) { // swim: travelling body wave, drifting forward and back
      float x = (uv.x - lo.x) / max(size.x, 1e-3);
      vec2 p = uv - vec2(0.06 * size.x * sin(t * 1.3) * k, 0.0);
      p.y -= 0.07 * size.y * k * sin(x * 9.0 - t * 8.0) * (0.3 + 0.7 * (1.0 - x));
      return p;
    }
    if (uAnim == 5) { // flap: outer parts bend up and down, body bobs
      float dx = (uv.x - c.x) / max(size.x * 0.5, 1e-3);
      float flap = sin(t * 9.0);
      return uv + vec2(0.0, (0.22 * dx * dx * flap - 0.05 * sin(t * 4.5)) * size.y * k);
    }
    if (uAnim == 6) return rot(uv, bottom, -0.2 * k * sin(t * 3.2));           // rock on the base
    if (uAnim == 7) return rot(uv, vec2(lo.x, lo.y), -0.16 * k * (0.5 - 0.5 * cos(t * 2.6))); // tilt forward (pour)
    if (uAnim == 8) return rot(uv, bottom, -0.1 * k * sin(t * 2.4));           // sway
    if (uAnim == 9) return rot(uv, top, -0.22 * k * sin(t * 2.8));             // swing from the top
    if (uAnim == 10) {                                                          // roll back and forth
      return uv - vec2(0.12 * size.x * k * sin(t * 2.2), 0.0);
    }
    if (uAnim == 11) {                                                          // stomp: squash and stretch
      float s = sin(t * 5.0);
      vec2 sc = vec2(1.0 - 0.05 * s * k, 1.0 + 0.07 * s * k);
      return bottom + (uv - bottom) / sc;
    }
    if (uAnim == 12) {                                                          // strum: a quick shiver
      float e = exp(-mod(t, 1.4) * 4.0);
      return rot(uv, c, -0.07 * k * e * sin(t * 40.0));
    }
    return uv;
  }

  void main() {
    vec2 lo = uBox.xy, hi = uBox.zw;
    vec2 uv = vUv;
    // Reveal pop: the painted shape swells briefly about its centre.
    if (uPop != 0.0) {
      vec2 c = (lo + hi) * 0.5;
      uv = c + (uv - c) / (1.0 + uPop);
    }
    float m = texture2D(uMask, warp(uv)).r;
    float w = fwidth(m) * 1.5 + 0.02;
    // A solid line (dashes broke up on thin and busy shapes), with a soft light running along it.
    float edge = 1.0 - smoothstep(0.0, w + 0.07, abs(m - 0.5));
    float run = 0.5 + 0.5 * sin((vWorld.x * 0.8 + vWorld.y) * 7.0 - uTime * 2.4);
    float line = edge * mix(0.7 + 0.2 * run, 1.0, uGlow);
    float halo = (1.0 - smoothstep(0.0, 0.35, abs(m - 0.5))) * uGlow * 0.35;
    float inside = smoothstep(0.5, 0.62, m);
    // The target zone: a faint wash of the accent inside the outline, so the shape reads at a glance.
    float ghost = uPattern == 0 ? inside * (0.14 + 0.1 * uGlow) * (1.0 - uFill) : 0.0;
    float fill = smoothstep(0.45, 0.6, m) * uFill;
    float pat = 0.0;
    if (uPattern == 1) pat = step(0.62, fract((vWorld.x + vWorld.y) * 5.0));
    else if (uPattern == 2) pat = 1.0 - step(0.16, length(fract(vWorld.xy * 6.0) - 0.5));
    pat *= inside * 0.3 * (1.0 - uFill);
    // Reveal shine: a bright diagonal band sweeps across the painted shape once.
    vec2 size = max(hi - lo, vec2(1e-3));
    float diag = ((uv.x - lo.x) / size.x + (uv.y - lo.y) / size.y) * 0.5;
    float shine = exp(-pow((diag - mix(-0.3, 1.3, uShine)) * 7.0, 2.0)) * step(0.001, uShine) * step(uShine, 0.999) * fill;
    vec3 col = uColor * (1.0 + uGlow * 0.6);
    float a = max(max(max(max(line, halo), fill * 0.92), pat), ghost) * uOpacity;
    gl_FragColor = vec4(mix(col, uColor * 0.85, fill) + vec3(1.0, 0.95, 0.85) * shine * 0.7, a);
    #include <colorspace_fragment>
  }
`;

export class ShadowScene {
  readonly scene = new THREE.Scene();
  readonly light: THREE.DirectionalLight;
  /** Dual-shadow levels: the second lamp (hidden otherwise). */
  readonly light2: THREE.DirectionalLight;
  /** Where the light travels now (the lamp moves in World 3), and the direction the target was cast along. */
  readonly lightDir = LIGHT_DIR.clone();
  readonly targetDir = LIGHT_DIR.clone();
  /** Where each outline's shadow is cast from (one per outline). */
  private targetDirs = [LIGHT_DIR.clone(), LIGHT_DIR.clone()];
  readonly objectRoot = new THREE.Group();
  /** The level's objects. A single object sits directly in objectRoot (it is the pivot); assembly pieces get their own. */
  private pieces: { pivot: THREE.Object3D; obj: LevelObjectInstance; mats: THREE.MeshStandardMaterial[]; ghost: number; opacity: number }[] = [];
  private palette: WorldPalette;
  private skirtingMat: THREE.MeshStandardMaterial;
  private wallMaps = new Map<WorldPalette['wallPattern'], THREE.DataTexture>();
  readonly outline: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /** The target outlines: one, or one per lamp on dual-shadow levels (the first is `outline`). */
  private outlines: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>[];
  private dualOn = false;
  private wallMat: THREE.MeshStandardMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  private hemi: THREE.HemisphereLight;
  private particles: Particles;
  private ripple: Ripple;
  private decor = new Map<DecorKind, THREE.Group>();
  private floorMaps = new Map<FloorPattern, THREE.DataTexture>();

  constructor(palette: WorldPalette, shadowMapSize: number) {
    this.palette = palette;
    const s = this.scene;
    s.background = new THREE.Color(palette.background);
    s.fog = new THREE.Fog(palette.background, 12, 26);

    // Plaster: a tiny tiling normal map (generated, no download) repeated across the wall.
    this.wallMat = new THREE.MeshStandardMaterial({
      color: palette.wall,
      roughness: 0.95,
      normalMap: this.wallMap(palette.wallPattern),
      normalScale: new THREE.Vector2(0.55, 0.55),
    });
    // Lamplight pools around the shadow: the wall and floor darken towards the edges of the room.
    poolify(this.wallMat, new THREE.Vector3(0.6, 0.85, 0));
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), this.wallMat);
    wall.position.set(0, 3, WALL_Z);
    wall.receiveShadow = true;
    s.add(wall);

    this.floorMat = new THREE.MeshStandardMaterial({ color: palette.floor, roughness: 0.85, map: this.floorMap(palette.floorPattern) });
    poolify(this.floorMat, new THREE.Vector3(0.55, 0, 0.42));
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -2.6, WALL_Z + 10);
    floor.receiveShadow = true;
    s.add(floor);

    // Skirting board where floor meets wall, so the room reads as a diorama.
    this.skirtingMat = new THREE.MeshStandardMaterial({ color: palette.skirting, roughness: 0.8 });
    const skirting = new THREE.Mesh(new THREE.BoxGeometry(30, 0.25, 0.12), this.skirtingMat);
    skirting.position.set(0, -2.48, WALL_Z + 0.06);
    s.add(skirting);

    this.hemi = new THREE.HemisphereLight('#fff1dc', '#3a2a1e', 0.55);
    s.add(this.hemi);
    // Soft top light so the floor and object tops read; casts no shadow, so it never touches the puzzle.
    const top = new THREE.DirectionalLight('#ffe6c4', 0.6);
    top.position.set(-2, 8, 4);
    s.add(top);

    this.light = shadowLight(palette.light, shadowMapSize);
    this.light.position.copy(OBJECT_POS).addScaledVector(LIGHT_DIR, -12);
    this.light2 = shadowLight(palette.light, shadowMapSize);
    this.light2.visible = false;
    s.add(this.light, this.light.target, this.light2, this.light2.target);

    this.objectRoot.position.copy(OBJECT_POS);
    s.add(this.objectRoot);

    this.outline = new THREE.Mesh(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        vertexShader: outlineVert,
        fragmentShader: outlineFrag,
        transparent: true,
        depthWrite: false,
        uniforms: {
          uMask: { value: null },
          uColor: { value: new THREE.Color(palette.accent) },
          uGlow: { value: 0 },
          uFill: { value: 0 },
          uTime: { value: 0 },
          uOpacity: { value: 1 },
          uAnim: { value: 0 },
          uAnimT: { value: 0 },
          uAnimAmp: { value: 0 },
          uBox: { value: new THREE.Vector4(0, 0, 1, 1) },
          uPattern: { value: 0 },
          uShine: { value: 0 },
          uPop: { value: 0 },
        },
      }),
    );
    this.outline.renderOrder = 2;
    const outline2 = new THREE.Mesh(new THREE.BufferGeometry(), this.outline.material.clone());
    outline2.renderOrder = 2;
    outline2.visible = false;
    this.outlines = [this.outline, outline2];
    s.add(this.outline, outline2);

    this.particles = new Particles(palette.accent);
    this.ripple = new Ripple(palette.accent);
    s.add(this.particles.points, this.ripple.group);
    this.showDecor(palette.decor);
  }

  /** Props for the world at the room's edges (built once per world, then kept). */
  private showDecor(kind: DecorKind) {
    for (const [k, g] of this.decor) g.visible = k === kind;
    if (!this.decor.has(kind)) {
      const g = buildDecor(kind);
      this.decor.set(kind, g);
      this.scene.add(g);
    }
  }

  private floorMap(pattern: FloorPattern): THREE.DataTexture {
    let t = this.floorMaps.get(pattern);
    if (!t) {
      t = floorMap(pattern);
      // Boards 0.4 units wide (8 per texture) running towards the camera; checker tiles 0.5 units.
      if (pattern === 'checker') t.repeat.set(30 / 4, 20 / 4);
      else t.repeat.set(30 / 3.2, 20 / 4);
      this.floorMaps.set(pattern, t);
    }
    return t;
  }

  private wallMap(pattern: WorldPalette['wallPattern']): THREE.DataTexture {
    let t = this.wallMaps.get(pattern);
    if (!t) {
      t =
        pattern === 'tiles'
          ? tileNormalMap(128, 4)
          : pattern === 'pegboard'
            ? pegboardNormalMap(128, 4)
            : pattern === 'curtain'
              ? curtainNormalMap(128, 3)
              : plasterNormalMap(128, 7);
      // Plaster tiles every 2.5 units; a tile texture holds 4×4 tiles of 0.6 units; pegboard 4×4 holes 0.25 apart;
      // the backdrop hangs in folds 0.5 units apart (3 per texture).
      if (pattern === 'tiles') t.repeat.set(30 / 2.4, 16 / 2.4);
      else if (pattern === 'pegboard') t.repeat.set(30 / 1, 16 / 1);
      else if (pattern === 'curtain') t.repeat.set(30 / 1.5, 1);
      else t.repeat.set(12, 6.4);
      this.wallMaps.set(pattern, t);
    }
    return t;
  }

  /** Recolour the room for a world (wall, floor, light, accent). Cheap: materials and uniforms only. */
  setWorld(p: WorldPalette) {
    if (p === this.palette) return;
    this.palette = p;
    (this.scene.background as THREE.Color).set(p.background);
    this.scene.fog?.color.set(p.background);
    this.wallMat.color.set(p.wall);
    this.wallMat.normalMap = this.wallMap(p.wallPattern);
    this.wallMat.needsUpdate = true;
    this.floorMat.color.set(p.floor);
    this.floorMat.map = this.floorMap(p.floorPattern);
    this.floorMat.needsUpdate = true;
    this.skirtingMat.color.set(p.skirting);
    this.light.color.set(p.light);
    for (const o of this.outlines) (o.material.uniforms.uColor.value as THREE.Color).set(p.accent);
    this.particles.setColor(p.accent);
    this.ripple.setColor(p.accent);
    this.showDecor(p.decor);
    if (this.dualOn) this.setDual(null);
  }

  /**
   * Dual-shadow levels: lamp A travels along dirs[0], lamp B along dirs[1], each weaker than the usual lamp, in the
   * world's two lamp colours, and each lamp gets its own outline (its shadow's colour; stripes for A, dots for B).
   * null = one lamp and one outline, as in every other world.
   */
  setDual(dirs: [THREE.Vector3, THREE.Vector3] | null) {
    const d = this.palette.dual;
    const on = !!(dirs && d);
    this.dualOn = on;
    this.light2.visible = on;
    this.outlines[1].visible = on;
    this.light.intensity = on ? DUAL_INTENSITY : 3.2;
    this.light.color.set(this.palette.light);
    this.outlines.forEach((o, i) => {
      o.material.uniforms.uPattern.value = on ? i + 1 : 0;
      (o.material.uniforms.uColor.value as THREE.Color).set(on ? d!.outlines[i] : this.palette.accent);
    });
    if (!on || !dirs) return;
    this.setLightDir(dirs[0]);
    this.light2.color.set(d!.light);
    this.light2.intensity = DUAL_INTENSITY;
    this.light2.position.copy(OBJECT_POS).addScaledVector(dirs[1], -12);
  }

  get accent() {
    return this.palette.accent;
  }

  /** Start the fog a little behind the wall as seen from `cameraDistance` (fitted at 10 units: fog 12–26). */
  fogFrom(cameraDistance: number) {
    const fog = this.scene.fog as THREE.Fog;
    fog.near = Math.max(12, cameraDistance + 2);
    fog.far = fog.near + 14;
  }

  /** Dual-shadow outline colours (lamp A's shadow, lamp B's), for the HUD's meters. */
  get dualColors(): [string, string] | null {
    return this.palette.dual?.outlines ?? null;
  }

  /** Move the lamp: the visible light (and its shadow) now travels along `dir`. */
  setLightDir(dir: THREE.Vector3) {
    this.lightDir.copy(dir);
    this.light.position.copy(OBJECT_POS).addScaledVector(dir, -12);
  }

  /** Swap in a level's object; the previous objects are removed and disposed. */
  setObject(obj: LevelObjectInstance) {
    this.setPieces([obj]);
  }

  /**
   * Swap in a level's objects and return their pivots (what gets rotated). One object goes straight into
   * objectRoot, which is its pivot; several each get a pivot group under an unrotated objectRoot, with their own
   * materials so the active one can glow. Every mesh joins the mask layer.
   */
  setPieces(objs: LevelObjectInstance[]): THREE.Object3D[] {
    for (const p of this.pieces) {
      this.objectRoot.remove(p.pivot === this.objectRoot ? p.obj.root : p.pivot);
      p.obj.dispose();
      for (const m of p.mats) m.dispose();
    }
    this.pieces = [];
    this.objectRoot.quaternion.identity();
    for (const obj of objs) {
      obj.root.traverse((o) => o.layers.enable(MASK_LAYER));
      const mats: THREE.MeshStandardMaterial[] = [];
      if (objs.length === 1) {
        this.objectRoot.add(obj.root);
        this.pieces.push({ pivot: this.objectRoot, obj, mats, ghost: 1, opacity: 1 });
        continue;
      }
      obj.root.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh && (mesh.material as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          const m = (mesh.material as THREE.MeshStandardMaterial).clone();
          mesh.material = m;
          mats.push(m);
        }
      });
      const pivot = new THREE.Group();
      pivot.add(obj.root);
      this.objectRoot.add(pivot);
      this.pieces.push({ pivot, obj, mats, ghost: 1, opacity: 1 });
    }
    return this.pieces.map((p) => p.pivot);
  }

  /**
   * Assembly: tint piece `index` with the accent (the one the player is turning) and fade the others to a ghost,
   * so the active one is always clear and the one behind shows through. Shadows and scoring are unaffected
   * (the shadow map and the mask camera ignore opacity). -1 = all solid, no tint.
   */
  highlight(index: number, amount = 0.22) {
    const c = new THREE.Color(this.palette.accent);
    this.pieces.forEach((p, i) => {
      for (const m of p.mats) m.emissive.copy(c).multiplyScalar(i === index ? amount : 0);
      p.ghost = index < 0 || i === index ? 1 : GHOST_OPACITY;
    });
  }

  /** Ease each piece's opacity towards its target; a piece is transparent only while it isn't fully solid. */
  private updateGhosts(dt: number) {
    for (const p of this.pieces) {
      if (!p.mats.length || p.opacity === p.ghost) continue;
      p.opacity += (p.ghost - p.opacity) * Math.min(1, dt * 10);
      if (Math.abs(p.opacity - p.ghost) < 0.01) p.opacity = p.ghost;
      const see = p.opacity < 1;
      for (const m of p.mats) {
        if (m.transparent !== see) m.needsUpdate = true;
        m.transparent = see;
        m.depthWrite = !see;
        m.opacity = p.opacity;
      }
    }
  }

  /** The object's wall shadow; the reveal turns it off once the paint covers it, so the painted shape can move. */
  set objectShadow(on: boolean) {
    this.objectRoot.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = on;
    });
  }

  /**
   * Place an outline quad (`index` 1 = the second lamp's, dual shadows): the mask camera's square, projected along
   * the solution light `dir` onto the wall. Its UVs match the mask texture exactly, so the outline sits where the
   * solved shadow lands.
   */
  placeOutline(maskCam: THREE.OrthographicCamera, halfSize: number, maskTexture: THREE.Texture, dir: THREE.Vector3 = LIGHT_DIR, index = 0) {
    const outline = this.outlines[index];
    this.targetDirs[index].copy(dir);
    if (index === 0) this.targetDir.copy(dir);
    const right = new THREE.Vector3().setFromMatrixColumn(maskCam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(maskCam.matrixWorld, 1);
    const center = OBJECT_POS;
    const corners: number[] = [];
    const uvs: number[] = [];
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      const p = center
        .clone()
        .addScaledVector(right, (u * 2 - 1) * halfSize)
        .addScaledVector(up, (v * 2 - 1) * halfSize);
      const t = (WALL_Z + 0.004 - p.z) / dir.z;
      p.addScaledVector(dir, t);
      corners.push(p.x, p.y, p.z);
      uvs.push(u, v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    outline.geometry.dispose();
    outline.geometry = geo;
    const old = outline.material.uniforms.uMask.value as THREE.Texture | null;
    if (old && old !== maskTexture) old.dispose();
    outline.material.uniforms.uMask.value = maskTexture;
    // The lamplight pools where the solved shadow lands (between the two on dual-shadow levels, and wider).
    pool.uPoolCenter.value.copy(this.shadowCenter());
    pool.uPool.value.set(this.dualOn ? 3 : 1.6, this.dualOn ? 7.5 : 5.5, 0.38);
  }

  /** Centre of each solved shadow on the wall (two on dual-shadow levels). */
  shadowCenters(): THREE.Vector3[] {
    return this.targetDirs.slice(0, this.dualOn ? 2 : 1).map((d) => OBJECT_POS.clone().addScaledVector(d, (WALL_Z - OBJECT_POS.z) / d.z));
  }

  /** Centre of the solved shadow on the wall (midway between the two on dual-shadow levels). */
  shadowCenter(): THREE.Vector3 {
    const cs = this.shadowCenters();
    return cs.reduce((a, c) => a.add(c), new THREE.Vector3()).divideScalar(cs.length);
  }

  private uniform(name: string, v: number) {
    for (const o of this.outlines) o.material.uniforms[name].value = v;
  }
  set glow(v: number) {
    this.uniform('uGlow', v);
  }
  set fill(v: number) {
    this.uniform('uFill', v);
  }
  set outlineOpacity(v: number) {
    this.uniform('uOpacity', v);
  }
  /** Reveal: 0 → 1 sweeps a highlight across the painted shape. */
  set shine(v: number) {
    this.uniform('uShine', v);
  }
  /** Reveal: the painted shape swells by this share (0 = still). */
  set pop(v: number) {
    this.uniform('uPop', v);
  }

  /**
   * Prepare the painted shadow's reveal animation. `box` is the target's bounds in mask UV (min x, min y,
   * max x, max y); the animation pivots and scales relative to it. Strength starts at 0.
   */
  setReveal(kind: RevealKind | undefined, box: THREE.Vector4, index = 0) {
    const u = this.outlines[index].material.uniforms;
    u.uAnim.value = Math.max(0, REVEALS.indexOf(kind ?? 'none'));
    u.uAnimT.value = 0;
    u.uAnimAmp.value = 0;
    (u.uBox.value as THREE.Vector4).copy(box);
  }
  /** Reveal animation strength (0 = still shape, 1 = full motion); its clock runs while above 0. */
  set revealAmount(v: number) {
    this.uniform('uAnimAmp', v);
  }
  /** Scale applied to every softness value (low tier halves the blur). */
  private softnessScale = 1;
  set shadowSoftness(r: number) {
    this.light.shadow.radius = this.light2.shadow.radius = r * this.softnessScale;
  }

  /** Resize the visible shadow map (quality tier). Scoring never uses it, so this can change mid-level. */
  setShadowQuality(mapSize: number, softnessScale: number) {
    this.softnessScale = softnessScale;
    for (const l of [this.light, this.light2]) {
      if (l.shadow.mapSize.x === mapSize) continue;
      l.shadow.mapSize.set(mapSize, mapSize);
      l.shadow.map?.dispose();
      l.shadow.map = null;
    }
  }

  burst() {
    for (const c of this.shadowCenters()) this.ripple.burst(c);
    this.particles.burst(this.shadowCenter());
  }

  update(dt: number, time: number) {
    for (const o of this.outlines) {
      const u = o.material.uniforms;
      u.uTime.value = time;
      if (u.uAnimAmp.value > 0) u.uAnimT.value += dt;
    }
    this.particles.update(dt);
    this.ripple.update(dt);
    this.updateGhosts(dt);
  }
}

/** The object's lamp: a directional light whose shadow camera covers the object from every turn. */
function shadowLight(color: string, mapSize: number): THREE.DirectionalLight {
  const l = new THREE.DirectionalLight(color, 3.2);
  l.target.position.copy(OBJECT_POS);
  l.castShadow = true;
  l.shadow.mapSize.set(mapSize, mapSize);
  const sc = l.shadow.camera;
  sc.left = -2.4;
  sc.right = 2.4;
  sc.top = 2.4;
  sc.bottom = -2.4;
  sc.near = 2;
  sc.far = 30;
  l.shadow.bias = -0.0005;
  l.shadow.normalBias = 0.02;
  l.shadow.radius = 3;
  return l;
}

/** Theatre backdrop: soft vertical folds (`folds` per texture width), tiling sideways. */
function curtainNormalMap(size: number, folds: number): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const n = new THREE.Vector3();
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const a = (x / size) * Math.PI * 2 * folds;
      // Slope of the fold profile: one broad wave plus a smaller one, so the folds aren't all alike.
      const slope = Math.cos(a) * 0.9 + Math.cos(a * 2 + 1.3) * 0.35;
      n.set(-slope * 0.7, 0, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tileable plaster bumps: a few octaves of periodic value noise turned into a tangent-space normal map.
 * Built once on the CPU (128² is ~16k texels), so the wall texture costs no download.
 */
function plasterNormalMap(size: number, seed: number): THREE.DataTexture {
  let st = seed >>> 0;
  const rnd = () => ((st = (st * 1664525 + 1013904223) >>> 0) / 4294967296);
  const height = new Float32Array(size * size);
  for (const [cells, amp] of [[8, 1], [16, 0.5], [32, 0.3], [64, 0.18]] as const) {
    const lattice = Array.from({ length: cells * cells }, rnd);
    const at = (x: number, y: number) => lattice[((y + cells) % cells) * cells + ((x + cells) % cells)];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const fy = (y / size) * cells;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const tx = fx - x0;
        const ty = fy - y0;
        const sx = tx * tx * (3 - 2 * tx);
        const sy = ty * ty * (3 - 2 * ty);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
        const bot = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
        height[y * size + x] += (top + (bot - top) * sy) * amp;
      }
  }
  const data = new Uint8Array(size * size * 4);
  const h = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  const strength = 2.2;
  const n = new THREE.Vector3();
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      n.set((h(x - 1, y) - h(x + 1, y)) * strength, (h(x, y - 1) - h(x, y + 1)) * strength, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Kitchen tiles: a 4×4 grid of slightly domed tiles with recessed grout, tiling seamlessly. */
function tileNormalMap(size: number, tiles: number): THREE.DataTexture {
  const height = new Float32Array(size * size);
  const cell = size / tiles;
  const grout = 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = Math.min(x % cell, cell - 1 - (x % cell));
      const dy = Math.min(y % cell, cell - 1 - (y % cell));
      const edge = Math.min(dx, dy);
      // Grout lines sit low; tile faces rise over a few pixels to a flat top.
      height[y * size + x] = edge < grout ? 0 : Math.min(1, (edge - grout + 1) / 3);
    }
  const data = new Uint8Array(size * size * 4);
  const h = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  const n = new THREE.Vector3();
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      n.set((h(x - 1, y) - h(x + 1, y)) * 1.6, (h(x, y - 1) - h(x, y + 1)) * 1.6, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** Workshop pegboard: a grid of round holes (`holes` × `holes` per texture), each a soft dip. */
function pegboardNormalMap(size: number, holes: number): THREE.DataTexture {
  const height = new Float32Array(size * size);
  const cell = size / holes;
  const r = cell * 0.17;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (x % cell) - cell / 2 + 0.5;
      const dy = (y % cell) - cell / 2 + 0.5;
      const d = Math.hypot(dx, dy);
      height[y * size + x] = d < r ? 0 : Math.min(1, (d - r) / 2.5);
    }
  const data = new Uint8Array(size * size * 4);
  const h = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  const n = new THREE.Vector3();
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      n.set((h(x - 1, y) - h(x + 1, y)) * 2, (h(x, y - 1) - h(x, y + 1)) * 2, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

/** A soft round dot for the confetti (generated, no download). */
function dotTexture(): THREE.DataTexture {
  const n = 32;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2);
      const i = (y * n + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.max(0, Math.min(1, (1 - d) * 3)) * 255;
    }
  const t = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

/** Reveal: a bright ring that spreads out from each solved shadow and fades. */
class Ripple {
  readonly group = new THREE.Group();
  private rings: { mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; t: number }[] = [];
  private next = 0;

  constructor(color: string) {
    const geo = new THREE.RingGeometry(0.95, 1, 72);
    for (let i = 0; i < 2; i++) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
      mesh.renderOrder = 3;
      mesh.visible = false;
      this.rings.push({ mesh, t: -1 });
      this.group.add(mesh);
    }
  }

  setColor(color: string) {
    for (const r of this.rings) r.mesh.material.color.set(color);
  }

  burst(at: THREE.Vector3) {
    const r = this.rings[this.next++ % this.rings.length];
    r.mesh.position.copy(at).setZ(WALL_Z + 0.01);
    r.t = 0;
    r.mesh.visible = true;
  }

  update(dt: number) {
    for (const r of this.rings) {
      if (r.t < 0) continue;
      r.t += dt;
      const k = Math.min(1, r.t / 0.9);
      r.mesh.scale.setScalar(0.8 + 1.8 * (1 - (1 - k) * (1 - k)));
      r.mesh.material.opacity = 0.6 * (1 - k);
      if (k >= 1) {
        r.t = -1;
        r.mesh.visible = false;
      }
    }
  }
}

/** Reveal confetti: round dots in the world's accent thrown off the wall, falling with gravity, fading out. */
class Particles {
  readonly points: THREE.Points;
  private vel: Float32Array;
  private life = 0;
  private readonly count = 90;

  constructor(color: string) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
    this.setColor(color, geo);
    this.vel = new Float32Array(this.count * 3);
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.16, map: dotTexture(), vertexColors: true, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  /** Confetti in shades of the world's accent. */
  setColor(color: string, geo = this.points.geometry) {
    const cols = geo.getAttribute('color') as THREE.BufferAttribute;
    const base = new THREE.Color(color);
    const c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      // Mostly the accent, with a few white sparkles.
      if (Math.random() < 0.2) c.set('#fff6e0');
      else c.copy(base).offsetHSL((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.3) * 0.3);
      cols.setXYZ(i, c.r, c.g, c.b);
    }
    cols.needsUpdate = true;
  }

  burst(at: THREE.Vector3) {
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.count; i++) {
      pos.setXYZ(i, at.x + (Math.random() - 0.5) * 1.2, at.y + (Math.random() - 0.5) * 1.2, at.z + 0.1);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.4 + Math.random() * 3;
      this.vel.set([Math.cos(a) * sp, Math.sin(a) * sp + 1.5, 0.6 + Math.random() * 1.5], i * 3);
    }
    pos.needsUpdate = true;
    this.life = 1.8;
    this.points.visible = true;
  }

  update(dt: number) {
    if (this.life <= 0) return;
    this.life -= dt;
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.count; i++) {
      this.vel[i * 3 + 1] -= 5 * dt;
      pos.setXYZ(
        i,
        pos.getX(i) + this.vel[i * 3] * dt,
        pos.getY(i) + this.vel[i * 3 + 1] * dt,
        pos.getZ(i) + this.vel[i * 3 + 2] * dt,
      );
    }
    pos.needsUpdate = true;
    (this.points.material as THREE.PointsMaterial).opacity = Math.min(1, this.life / 0.6);
    if (this.life <= 0) this.points.visible = false;
  }
}
