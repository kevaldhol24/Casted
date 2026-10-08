import * as THREE from 'three';
import type { LevelObjectInstance } from '../levels/LevelLoader';
import { REVEALS, type RevealKind } from '../levels/levels';
import { MASK_LAYER } from './MaskRenderer';

export const WALL_Z = -2.6;
/** Where the object floats (before idle bob). */
export const OBJECT_POS = new THREE.Vector3(0, -0.85, 1.2);
/** Direction the light travels: from a lamp low and in front, up onto the wall, slightly offset to the right. */
export const LIGHT_DIR = new THREE.Vector3(0.1, 0.5, -1).normalize();

export interface WorldPalette {
  background: string;
  wall: string;
  floor: string;
  light: string;
  accent: string;
  objects: string[];
}

/** World 1 — The Attic: dusty brown, warm tungsten, amber accent. */
export const ATTIC: WorldPalette = {
  background: '#2b2019',
  wall: '#d8c3a0',
  floor: '#5e4634',
  light: '#ffd9a8',
  accent: '#f2a43a',
  objects: ['#b8a58c', '#a8917a', '#c9b79c', '#9c8a76'],
};

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
    float m = texture2D(uMask, warp(vUv)).r;
    float w = fwidth(m) * 1.5 + 0.02;
    float edge = 1.0 - smoothstep(0.0, w + 0.06, abs(m - 0.5));
    float dash = step(0.0, sin((vWorld.x * 0.8 + vWorld.y) * 26.0 - uTime * 1.5));
    float line = edge * mix(0.6 * dash, 1.0, uGlow);
    float halo = (1.0 - smoothstep(0.0, 0.35, abs(m - 0.5))) * uGlow * 0.35;
    float fill = smoothstep(0.45, 0.6, m) * uFill;
    vec3 col = uColor * (1.0 + uGlow * 0.6);
    float a = max(max(line, halo), fill * 0.92) * uOpacity;
    gl_FragColor = vec4(mix(col, uColor * 0.85, fill), a);
    #include <colorspace_fragment>
  }
`;

export class ShadowScene {
  readonly scene = new THREE.Scene();
  readonly light: THREE.DirectionalLight;
  readonly objectRoot = new THREE.Group();
  private object: LevelObjectInstance | null = null;
  readonly outline: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private wallMat: THREE.MeshStandardMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  private hemi: THREE.HemisphereLight;
  private particles: Particles;

  constructor(palette: WorldPalette, shadowMapSize: number) {
    const s = this.scene;
    s.background = new THREE.Color(palette.background);
    s.fog = new THREE.Fog(palette.background, 12, 26);

    // Plaster: a tiny tiling normal map (generated, no download) repeated across the wall.
    const plaster = plasterNormalMap(128, 7);
    plaster.repeat.set(12, 6.4);
    this.wallMat = new THREE.MeshStandardMaterial({
      color: palette.wall,
      roughness: 0.95,
      normalMap: plaster,
      normalScale: new THREE.Vector2(0.55, 0.55),
    });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), this.wallMat);
    wall.position.set(0, 3, WALL_Z);
    wall.receiveShadow = true;
    s.add(wall);

    this.floorMat = new THREE.MeshStandardMaterial({ color: palette.floor, roughness: 0.9 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 20), this.floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -2.6, WALL_Z + 10);
    floor.receiveShadow = true;
    s.add(floor);

    // Skirting board where floor meets wall, so the room reads as a diorama.
    const skirting = new THREE.Mesh(
      new THREE.BoxGeometry(30, 0.25, 0.12),
      new THREE.MeshStandardMaterial({ color: '#6b4e38', roughness: 0.8 }),
    );
    skirting.position.set(0, -2.48, WALL_Z + 0.06);
    s.add(skirting);

    this.hemi = new THREE.HemisphereLight('#fff1dc', '#3a2a1e', 0.55);
    s.add(this.hemi);
    // Soft top light so the floor and object tops read; casts no shadow, so it never touches the puzzle.
    const top = new THREE.DirectionalLight('#ffe6c4', 0.6);
    top.position.set(-2, 8, 4);
    s.add(top);

    this.light = new THREE.DirectionalLight(palette.light, 3.2);
    this.light.position.copy(OBJECT_POS).addScaledVector(LIGHT_DIR, -12);
    this.light.target.position.copy(OBJECT_POS);
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    const sc = this.light.shadow.camera;
    sc.left = -2.4;
    sc.right = 2.4;
    sc.top = 2.4;
    sc.bottom = -2.4;
    sc.near = 2;
    sc.far = 30;
    this.light.shadow.bias = -0.0005;
    this.light.shadow.normalBias = 0.02;
    this.light.shadow.radius = 3;
    s.add(this.light, this.light.target);

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
        },
      }),
    );
    this.outline.renderOrder = 2;
    s.add(this.outline);

    this.particles = new Particles(palette.accent);
    s.add(this.particles.points);
  }

  /** Swap in a level's object; the previous one is removed and disposed. Its meshes join the mask layer. */
  setObject(obj: LevelObjectInstance) {
    if (this.object) {
      this.objectRoot.remove(this.object.root);
      this.object.dispose();
    }
    this.object = obj;
    obj.root.traverse((o) => o.layers.enable(MASK_LAYER));
    this.objectRoot.add(obj.root);
  }

  /** The object's wall shadow; the reveal turns it off once the paint covers it, so the painted shape can move. */
  set objectShadow(on: boolean) {
    this.objectRoot.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = on;
    });
  }

  /**
   * Place the outline quad: the mask camera's square, projected along the light onto the wall.
   * Its UVs match the mask texture exactly, so the outline sits where the solved shadow lands.
   */
  placeOutline(maskCam: THREE.OrthographicCamera, halfSize: number, maskTexture: THREE.Texture) {
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
      const t = (WALL_Z + 0.004 - p.z) / LIGHT_DIR.z;
      p.addScaledVector(LIGHT_DIR, t);
      corners.push(p.x, p.y, p.z);
      uvs.push(u, v);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(corners, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.outline.geometry.dispose();
    this.outline.geometry = geo;
    const old = this.outline.material.uniforms.uMask.value as THREE.Texture | null;
    if (old && old !== maskTexture) old.dispose();
    this.outline.material.uniforms.uMask.value = maskTexture;
  }

  /** Centre of the solved shadow on the wall. */
  shadowCenter(): THREE.Vector3 {
    const t = (WALL_Z - OBJECT_POS.z) / LIGHT_DIR.z;
    return OBJECT_POS.clone().addScaledVector(LIGHT_DIR, t);
  }

  set glow(v: number) {
    this.outline.material.uniforms.uGlow.value = v;
  }
  set fill(v: number) {
    this.outline.material.uniforms.uFill.value = v;
  }
  set outlineOpacity(v: number) {
    this.outline.material.uniforms.uOpacity.value = v;
  }

  /**
   * Prepare the painted shadow's reveal animation. `box` is the target's bounds in mask UV (min x, min y,
   * max x, max y); the animation pivots and scales relative to it. Strength starts at 0.
   */
  setReveal(kind: RevealKind | undefined, box: THREE.Vector4) {
    const u = this.outline.material.uniforms;
    u.uAnim.value = Math.max(0, REVEALS.indexOf(kind ?? 'none'));
    u.uAnimT.value = 0;
    u.uAnimAmp.value = 0;
    (u.uBox.value as THREE.Vector4).copy(box);
  }
  /** Reveal animation strength (0 = still shape, 1 = full motion); its clock runs while above 0. */
  set revealAmount(v: number) {
    this.outline.material.uniforms.uAnimAmp.value = v;
  }
  /** Scale applied to every softness value (low tier halves the blur). */
  private softnessScale = 1;
  set shadowSoftness(r: number) {
    this.light.shadow.radius = r * this.softnessScale;
  }

  /** Resize the visible shadow map (quality tier). Scoring never uses it, so this can change mid-level. */
  setShadowQuality(mapSize: number, softnessScale: number) {
    this.softnessScale = softnessScale;
    if (this.light.shadow.mapSize.x === mapSize) return;
    this.light.shadow.mapSize.set(mapSize, mapSize);
    this.light.shadow.map?.dispose();
    this.light.shadow.map = null;
  }

  burst() {
    this.particles.burst(this.shadowCenter());
  }

  update(dt: number, time: number) {
    const u = this.outline.material.uniforms;
    u.uTime.value = time;
    if (u.uAnimAmp.value > 0) u.uAnimT.value += dt;
    this.particles.update(dt);
  }
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

/** Reveal confetti: 36 small quads thrown off the wall, falling with gravity, fading out. */
class Particles {
  readonly points: THREE.Points;
  private vel: Float32Array;
  private life = 0;
  private readonly count = 36;

  constructor(color: string) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.count * 3), 3));
    const cols = new Float32Array(this.count * 3);
    const base = new THREE.Color(color);
    const c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      c.copy(base).offsetHSL((Math.random() - 0.5) * 0.15, 0, (Math.random() - 0.3) * 0.3);
      cols.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    this.vel = new Float32Array(this.count * 3);
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.09, vertexColors: true, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.points.frustumCulled = false;
    this.points.visible = false;
  }

  burst(at: THREE.Vector3) {
    const pos = this.points.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < this.count; i++) {
      pos.setXYZ(i, at.x + (Math.random() - 0.5) * 1.2, at.y + (Math.random() - 0.5) * 1.2, at.z + 0.1);
      const a = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 2.2;
      this.vel.set([Math.cos(a) * sp, Math.sin(a) * sp + 1.5, 0.6 + Math.random() * 1.5], i * 3);
    }
    pos.needsUpdate = true;
    this.life = 1.4;
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
