import * as THREE from 'three';
import { PostFX } from './PostFX';
import type { TierSpec } from './Quality';

/**
 * WebGL renderer + the fixed gameplay camera. The camera is re-fitted on every resize so the object and its
 * shadow both stay in view in landscape and portrait (portrait naturally stacks the wall above the object).
 */
export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  /** Points that must stay on screen; set by the scene. */
  private focus: THREE.Vector3[] = [];
  private lookAt = new THREE.Vector3();
  private baseDistance = 10;
  /** Extra push-in (world units) for the reveal camera move. */
  push = 0;
  private dprCap = 2;
  private post: PostFX | null = null;
  private spec: TierSpec | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  /** Apply a quality tier: pixel-ratio cap and post-processing. Returns whether a CSS vignette is wanted. */
  setTier(spec: TierSpec, scene: THREE.Scene): boolean {
    this.spec = spec;
    this.dprCap = spec.dprCap;
    this.post ??= new PostFX(this.gl, scene, this.camera);
    this.post.configure(spec);
    this.resize();
    return this.post.cssVignette;
  }

  setFocus(points: THREE.Vector3[]) {
    this.focus = points;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.dprCap));
    this.gl.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.fit();
  }

  /**
   * Back the camera off until every focus point fits inside the safe band (room for the HUD on top), then
   * slide the view vertically so the content is centred in that band (portrait otherwise leaves a gap on top).
   */
  private fit() {
    if (this.focus.length === 0) return;
    const box = new THREE.Box3().setFromPoints(this.focus);
    box.getCenter(this.lookAt);
    const portrait = this.camera.aspect < 1;
    const top = portrait ? 0.74 : 0.78;
    const bottom = -0.9;
    const v = new THREE.Vector3();
    const extent = () => {
      let lo = Infinity;
      let hi = -Infinity;
      let wide = 0;
      for (const p of this.focus) {
        v.copy(p).project(this.camera);
        lo = Math.min(lo, v.y);
        hi = Math.max(hi, v.y);
        wide = Math.max(wide, Math.abs(v.x));
      }
      return { lo, hi, wide };
    };
    let d = 4;
    for (; d < 40; d += 0.1) {
      this.place(d);
      const e = extent();
      if (e.wide < 0.9 && e.hi - e.lo < top - bottom) break;
    }
    // Centre vertically: NDC offset → world offset at the look-at distance.
    for (let i = 0; i < 4; i++) {
      const e = extent();
      const offset = (e.hi + e.lo) / 2 - (top + bottom) / 2;
      const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * d;
      this.lookAt.y += offset * halfH;
      this.place(d);
    }
    this.baseDistance = d;
  }

  private place(distance: number) {
    // Camera slightly above the lamp, looking at the wall: object low-front, shadow high on the wall.
    const dir = new THREE.Vector3(0, 0.12, 1).normalize();
    this.camera.position.copy(this.lookAt).addScaledVector(dir, distance);
    this.camera.lookAt(this.lookAt);
    this.camera.updateMatrixWorld();
  }

  render(scene: THREE.Scene, dt: number) {
    if (this.push !== 0) this.place(this.baseDistance - this.push);
    if (this.post && this.spec) this.post.render(dt);
    else this.gl.render(scene, this.camera);
    if (this.push !== 0) this.place(this.baseDistance);
  }
}
