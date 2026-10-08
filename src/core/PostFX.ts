import * as THREE from 'three';
import {
  BlendFunction,
  BloomEffect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
  VignetteEffect,
} from 'postprocessing';
import type { TierSpec } from './Quality';

/**
 * Bloom on the light and bright fills, vignette, film grain (pmndrs postprocessing: effects merge into one
 * pass). The composer only runs on tiers with bloom or grain; a vignette-only tier uses a free CSS overlay
 * instead (see `cssVignette`), so mid phones keep native MSAA and skip the extra full-screen passes.
 */
export class PostFX {
  private composer: EffectComposer;
  private renderPass: RenderPass;
  private effectPass: EffectPass | null = null;
  private enabled = false;
  /** True when the tier wants a vignette but the composer is off: draw it as a CSS overlay. */
  cssVignette = false;

  constructor(private gl: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.Camera) {
    this.composer = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType, multisampling: 4 });
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
  }

  configure(spec: TierSpec) {
    if (this.effectPass) {
      this.composer.removePass(this.effectPass);
      this.effectPass.dispose();
      this.effectPass = null;
    }
    // Rendering into the composer's buffer skips the renderer's own tone mapping, so the chain does it.
    // Order: bloom (HDR) → tone map → vignette → grain.
    this.enabled = spec.bloom || spec.grain;
    this.cssVignette = spec.vignette && !this.enabled;
    if (this.enabled) {
      const effects: (BloomEffect | VignetteEffect | NoiseEffect | ToneMappingEffect)[] = [];
      if (spec.bloom) effects.push(new BloomEffect({ intensity: 0.55, luminanceThreshold: 0.72, luminanceSmoothing: 0.2, mipmapBlur: true }));
      effects.push(new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }));
      if (spec.vignette) effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.55 }));
      if (spec.grain) {
        const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
        noise.blendMode.opacity.value = 0.18;
        effects.push(noise);
      }
      this.effectPass = new EffectPass(this.camera, ...effects);
      this.composer.addPass(this.effectPass);
    }
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h, false);
  }

  render(dt: number) {
    if (this.enabled) this.composer.render(dt);
    else this.gl.render(this.scene, this.camera);
  }
}
