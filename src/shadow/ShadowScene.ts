import * as THREE from 'three';
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
  varying vec2 vUv;
  varying vec3 vWorld;
  void main() {
    float m = texture2D(uMask, vUv).r;
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
  readonly objectMesh: THREE.Mesh;
  readonly outline: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private wallMat: THREE.MeshStandardMaterial;
  private floorMat: THREE.MeshStandardMaterial;
  private objectMat: THREE.MeshStandardMaterial;
  private hemi: THREE.HemisphereLight;
  private particles: Particles;

  constructor(palette: WorldPalette, shadowMapSize: number) {
    const s = this.scene;
    s.background = new THREE.Color(palette.background);
    s.fog = new THREE.Fog(palette.background, 12, 26);

    this.wallMat = new THREE.MeshStandardMaterial({ color: palette.wall, roughness: 0.95 });
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

    this.objectMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true });
    this.objectMesh = new THREE.Mesh(new THREE.BufferGeometry(), this.objectMat);
    this.objectMesh.castShadow = true;
    this.objectMesh.receiveShadow = true;
    this.objectMesh.layers.enable(MASK_LAYER);
    this.objectRoot.position.copy(OBJECT_POS);
    this.objectRoot.add(this.objectMesh);
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
        },
      }),
    );
    this.outline.renderOrder = 2;
    s.add(this.outline);

    this.particles = new Particles(palette.accent);
    s.add(this.particles.points);
  }

  setObjectGeometry(geo: THREE.BufferGeometry) {
    this.objectMesh.geometry.dispose();
    this.objectMesh.geometry = geo;
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
    this.outline.material.uniforms.uTime.value = time;
    this.particles.update(dt);
  }
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
