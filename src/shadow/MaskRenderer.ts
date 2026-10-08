import * as THREE from 'three';

/** Layer the object root's meshes join so the mask camera renders nothing else. */
export const MASK_LAYER = 1;

/**
 * Renders the object's silhouette as the light sees it: white on black, orthographic (directional light),
 * into a small render target, and reads it back. Scoring uses this, never the soft visible shadow map,
 * so blur, bias and quality tiers can't change the result.
 */
export class MaskRenderer {
  readonly camera: THREE.OrthographicCamera;
  private targets = new Map<number, { rt: THREE.WebGLRenderTarget; pixels: Uint8Array }>();
  private white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private black = new THREE.Color(0x000000);

  constructor(
    private renderer: THREE.WebGLRenderer,
    private scene: THREE.Scene,
    /** Half-size of the light-space square the mask covers, in world units. */
    readonly halfSize: number,
  ) {
    this.camera = new THREE.OrthographicCamera(-halfSize, halfSize, halfSize, -halfSize, 0.1, 40);
    this.camera.layers.set(MASK_LAYER);
  }

  /** Point the mask camera down the light direction, centred on `center`. */
  aim(center: THREE.Vector3, lightDir: THREE.Vector3) {
    this.camera.position.copy(center).addScaledVector(lightDir, -15);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(center);
    this.camera.updateMatrixWorld();
  }

  private target(size: number) {
    let t = this.targets.get(size);
    if (!t) {
      const rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, samples: 0 });
      rt.texture.generateMipmaps = false;
      t = { rt, pixels: new Uint8Array(size * size * 4) };
      this.targets.set(size, t);
    }
    return t;
  }

  /** Render the current silhouette; returns RGBA pixels (row 0 = bottom). The array is reused per size. */
  render(size: number): Uint8Array {
    const { rt, pixels } = this.target(size);
    this.draw(rt);
    this.renderer.readRenderTargetPixels(rt, 0, 0, size, size, pixels);
    return pixels;
  }

  private asyncTarget: { rt: THREE.WebGLRenderTarget; pixels: Uint8Array; size: number } | null = null;
  private asyncBusy = false;

  /**
   * Live scoring path: renders now, reads back without stalling the GPU (WebGL2 pixel buffer + fence).
   * Uses its own render target so a sync render (level load) can't overwrite a read in flight.
   * Returns null if a read is already pending — the caller simply scores again next frame.
   */
  renderAsync(size: number): Promise<Uint8Array> | null {
    if (this.asyncBusy) return null;
    if (!this.asyncTarget || this.asyncTarget.size !== size) {
      this.asyncTarget?.rt.dispose();
      const rt = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true, samples: 0 });
      rt.texture.generateMipmaps = false;
      this.asyncTarget = { rt, pixels: new Uint8Array(size * size * 4), size };
    }
    const t = this.asyncTarget;
    this.draw(t.rt);
    this.asyncBusy = true;
    return this.renderer
      .readRenderTargetPixelsAsync(t.rt, 0, 0, size, size, t.pixels)
      .then(() => t.pixels)
      .catch(() => {
        this.renderer.readRenderTargetPixels(t.rt, 0, 0, size, size, t.pixels);
        return t.pixels;
      })
      .finally(() => {
        this.asyncBusy = false;
      });
  }

  private draw(rt: THREE.WebGLRenderTarget) {
    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevBg = this.scene.background;
    const prevOverride = this.scene.overrideMaterial;
    const prevAutoShadow = r.shadowMap.autoUpdate;
    this.scene.background = this.black;
    this.scene.overrideMaterial = this.white;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(rt);
    r.clear();
    r.render(this.scene, this.camera);
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = prevAutoShadow;
    this.scene.background = prevBg;
    this.scene.overrideMaterial = prevOverride;
  }

  dispose() {
    this.targets.forEach((t) => t.rt.dispose());
    this.asyncTarget?.rt.dispose();
    this.white.dispose();
  }
}
