import * as THREE from 'three';
import type { Arcball } from '../core/Arcball';
import type { Input } from '../core/Input';
import type { Renderer } from '../core/Renderer';
import type { Portal } from '../portal/Portal';
import { MaskRenderer } from '../shadow/MaskRenderer';
import { TargetMask, blurToBytes, meterFromIou, rgbaToMask } from '../shadow/Matcher';
import { LIGHT_DIR, OBJECT_POS, type ShadowScene, type WorldPalette } from '../shadow/ShadowScene';
import type { DebugView } from '../ui/DebugView';
import type { Hud } from '../ui/Hud';
import { easeInOutCubic, easeOutBack, easeOutCubic, type Tweens } from '../util/tween';
import { junkify } from './junkify';
import type { LevelDef } from './levels';
import { SILHOUETTES } from './shapes';

export type LevelState = 'idle' | 'intro' | 'playing' | 'snapping' | 'reveal' | 'done';

export const SCORE_SIZE = 128;
const DISPLAY_MASK_SIZE = 512;
const SNAP_HOLD_S = 0.3;
const SNAP_TWEEN_S = 0.4;
const DRAG_SCORE_INTERVAL_S = 1 / 15;
const OBJECT_SIZE = 1.9;
const MAX_START_IOU = 0.5;

export interface LevelResult {
  level: LevelDef;
  time: number;
  stars: number;
  hintsUsed: number;
  peakIou: number;
}

interface Ctx {
  renderer: Renderer;
  scene: ShadowScene;
  mask: MaskRenderer;
  arcball: Arcball;
  input: Input;
  hud: Hud;
  tweens: Tweens;
  portal: Portal;
  palette: WorldPalette;
  debug: DebugView | null;
}

/**
 * One level's life: intro → playing → (hold ≥ threshold for 0.3 s) → snapping → reveal → done.
 * gameplayStart fires on entering playing; gameplayStop on snapping, pause and leaving the level.
 */
export class LevelController {
  state: LevelState = 'idle';
  level!: LevelDef;
  private target!: TargetMask;
  /** Every rotation whose shadow matches the target (the authored one + symmetric flips that also match). */
  private solutions: THREE.Quaternion[] = [];
  private time = 0;
  private iou = 0;
  private peakIou = 0;
  private meter = 0;
  private meterFloor = 0.5;
  private holdT = 0;
  private closeT = 0;
  private closeShown = false;
  private scoreDirty = true;
  private sinceScore = 0;
  private bobT = 0;
  private bobAmp = 1;
  private touched = false;
  private hintsUsed = 0;
  private displayTex: THREE.DataTexture | null = null;
  onComplete: (r: LevelResult) => void = () => {};

  constructor(private c: Ctx) {}

  get playing() {
    return this.state === 'playing';
  }

  start(level: LevelDef) {
    const { scene, mask, arcball, hud, tweens } = this.c;
    tweens.clear();
    this.level = level;
    this.state = 'intro';
    this.time = 0;
    this.holdT = 0;
    this.closeT = 0;
    this.closeShown = false;
    this.peakIou = 0;
    this.hintsUsed = 0;
    this.touched = false;
    this.c.renderer.push = 0;

    const geo = junkify(SILHOUETTES[level.silhouette](), {
      seed: level.seed,
      junk: level.junk,
      size: OBJECT_SIZE,
      palette: this.c.palette.objects,
    });
    scene.setObjectGeometry(geo);
    const obj = scene.objectRoot;
    obj.position.copy(OBJECT_POS);
    obj.scale.setScalar(1);
    mask.aim(OBJECT_POS, LIGHT_DIR);

    // The solution: object's local Z points back at the light, local Y is light-space up.
    const solution = mask.camera.quaternion.clone();
    obj.quaternion.copy(solution);
    obj.updateMatrixWorld(true);

    // Target masks come from the same render path as live scoring, so a perfect solve scores 1.0.
    this.target = new TargetMask(rgbaToMask(mask.render(SCORE_SIZE), SCORE_SIZE), SCORE_SIZE);
    const big = rgbaToMask(mask.render(DISPLAY_MASK_SIZE), DISPLAY_MASK_SIZE);
    this.displayTex?.dispose();
    this.displayTex = new THREE.DataTexture(blurToBytes(big, DISPLAY_MASK_SIZE, 5), DISPLAY_MASK_SIZE, DISPLAY_MASK_SIZE, THREE.RedFormat);
    this.displayTex.magFilter = THREE.LinearFilter;
    this.displayTex.minFilter = THREE.LinearFilter;
    this.displayTex.needsUpdate = true;
    scene.placeOutline(mask.camera, mask.halfSize, this.displayTex);

    this.solutions = this.findSolutions(solution);
    this.placeStart(solution);

    scene.fill = 0;
    scene.glow = 0;
    scene.shadowSoftness = 3;
    scene.outlineOpacity = 0;
    this.scoreNow();
    this.meterFloor = Math.max(0.5, Math.min(this.iou + 0.03, level.threshold - 0.2));
    this.meter = meterFromIou(this.iou, level.threshold, this.meterFloor);
    hud.setMeter(this.meter);
    hud.setTime(0);
    hud.setLevel(`${level.world}-${level.id.slice(-2).replace(/^0/, '')}`);
    hud.visible = true;

    arcball.freeAxes = level.freeAxes;
    arcball.enabled = false;
    arcball.stop();

    const finalQ = obj.quaternion.clone();
    tweens
      .to(0.6, (k) => {
        obj.scale.setScalar(Math.max(0.001, k));
        scene.outlineOpacity = k;
      }, easeOutBack)
      .then(() => {
        obj.quaternion.copy(finalQ);
        this.state = 'playing';
        arcball.enabled = true;
        this.c.portal.gameplayStart();
        const single = level.freeAxes.length === 1 ? level.freeAxes[0] : null;
        if (single && !this.touched) hud.showHand(single === 'y' ? 'h' : 'v');
      });
  }

  /** The authored solution plus 180° flips about the light-space axes whose shadow also matches (symmetric shapes). */
  private findSolutions(solution: THREE.Quaternion): THREE.Quaternion[] {
    const { mask, scene } = this.c;
    const cam = mask.camera.matrixWorld;
    const out = [solution.clone()];
    for (let col = 0; col < 3; col++) {
      const axis = new THREE.Vector3().setFromMatrixColumn(cam, col).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI).multiply(solution);
      scene.objectRoot.quaternion.copy(q);
      scene.objectRoot.updateMatrixWorld(true);
      if (this.target.iou(mask.render(SCORE_SIZE)) >= 0.97) out.push(q);
    }
    return out;
  }

  /**
   * Start offset in screen space. If the authored offset starts too close to a match (IoU ≥ 0.5), scale it up
   * and try the mirrored direction too; take the first candidate under 0.5, else the lowest-scoring one.
   */
  private placeStart(solution: THREE.Quaternion) {
    const { arcball, scene, mask } = this.c;
    const obj = scene.objectRoot;
    const [px, py, pz] = this.level.startOffset;
    const saved = arcball.freeAxes;
    arcball.freeAxes = ['x', 'y', 'z'];
    const candidates: [number, number, number][] = [];
    for (const k of [1, 1.2, 1.4, 1.6, 1.8, 2.0]) {
      candidates.push([px * k, py * k, pz * k], [-px * k, -py * k, -pz * k]);
    }
    let best = candidates[0];
    let bestIou = Infinity;
    for (const c of candidates) {
      obj.quaternion.copy(solution);
      arcball.apply(c[1], c[0], c[2]);
      obj.updateMatrixWorld(true);
      const iou = this.target.iou(mask.render(SCORE_SIZE));
      if (iou < bestIou) {
        bestIou = iou;
        best = c;
      }
      if (iou < MAX_START_IOU) break;
    }
    if (bestIou >= MAX_START_IOU && import.meta.env.DEV)
      console.info(`[level ${this.level.id}] no start under IoU ${MAX_START_IOU}; using ${bestIou.toFixed(2)} (meter floor raised)`);
    obj.quaternion.copy(solution);
    arcball.apply(best[1], best[0], best[2]);
    arcball.freeAxes = saved;
  }

  grab() {
    if (this.state !== 'playing') return;
    this.c.arcball.grab();
    if (!this.touched) {
      this.touched = true;
      this.c.hud.showHand(null);
    }
  }

  private scoreNow() {
    const { mask, scene } = this.c;
    // The mask camera follows the bobbing object, so the score depends on rotation only.
    mask.aim(scene.objectRoot.position, LIGHT_DIR);
    scene.objectRoot.updateMatrixWorld(true);
    const rgba = mask.render(SCORE_SIZE);
    this.iou = this.target.iou(rgba);
    this.peakIou = Math.max(this.peakIou, this.iou);
    this.c.debug?.draw(rgba, this.target.mask, this.iou, `${this.state} solutions:${this.solutions.length}`);
    this.scoreDirty = false;
    this.sinceScore = 0;
  }

  update(dt: number) {
    const { arcball, input, hud, scene } = this.c;
    this.bobT += dt;
    const moving = arcball.moving;
    const bobGoal = this.state === 'playing' && !moving ? 1 : 0;
    this.bobAmp += (bobGoal - this.bobAmp) * Math.min(1, dt * 3);
    if (this.state === 'intro' || this.state === 'playing') {
      scene.objectRoot.position.y = OBJECT_POS.y + Math.sin(this.bobT * 1.6) * 0.035 * this.bobAmp;
    }

    if (this.state !== 'playing') return;
    this.time += dt;
    hud.setTime(this.time);
    hud.dim = input.dragging;

    arcball.update(dt, input.keyAxes());
    if (arcball.changed) this.scoreDirty = true;
    this.sinceScore += dt;
    if (this.scoreDirty && (!input.dragging || this.sinceScore >= DRAG_SCORE_INTERVAL_S)) this.scoreNow();

    const goal = meterFromIou(this.iou, this.level.threshold, this.meterFloor);
    this.meter += (goal - this.meter) * Math.min(1, dt * 12);
    hud.setMeter(this.meter);
    scene.glow = THREE.MathUtils.smoothstep(this.meter, 0.7, 1.0);

    if (this.iou >= this.level.threshold) {
      this.holdT += dt;
      if (this.holdT >= SNAP_HOLD_S) this.snap();
    } else this.holdT = 0;

    if (!this.closeShown && this.meter >= 0.75 && this.meter < 0.9) {
      this.closeT += dt;
      if (this.closeT > 5) {
        this.closeShown = true;
        hud.toast('Close!');
      }
    } else this.closeT = 0;
  }

  private snap() {
    const { arcball, scene, tweens, hud, portal } = this.c;
    this.state = 'snapping';
    arcball.enabled = false;
    arcball.release();
    arcball.stop();
    portal.gameplayStop();
    hud.showHand(null);
    hud.dim = false;

    const obj = scene.objectRoot;
    const from = obj.quaternion.clone();
    let best = this.solutions[0];
    for (const s of this.solutions) if (from.angleTo(s) < from.angleTo(best)) best = s;
    const fromY = obj.position.y;
    tweens
      .to(SNAP_TWEEN_S, (k) => {
        obj.quaternion.slerpQuaternions(from, best, k);
        obj.position.y = fromY + (OBJECT_POS.y - fromY) * k;
        hud.setMeter(this.meter + (1 - this.meter) * k);
        scene.glow = 1;
      }, easeOutCubic)
      .then(() => this.reveal());
  }

  private async reveal() {
    const { scene, tweens, renderer, portal } = this.c;
    this.state = 'reveal';
    this.iou = 1;
    scene.burst();
    portal.happyTime?.();
    tweens.to(0.5, (k) => (scene.shadowSoftness = 3 - 2.5 * k));
    tweens.to(0.8, (k) => (scene.fill = k), easeInOutCubic);
    await tweens.to(0.15, (k) => (renderer.push = 0.45 * k), easeOutCubic);
    await tweens.to(0.7, (k) => (renderer.push = 0.45 * (1 - k)), easeInOutCubic);
    renderer.push = 0;
    await tweens.to(0.5, () => {});

    const stars = this.hintsUsed > 0 ? 1 : this.time <= this.level.parTime ? 3 : 2;
    this.state = 'done';
    this.c.hud.visible = false;
    this.onComplete({ level: this.level, time: this.time, stars, hintsUsed: this.hintsUsed, peakIou: this.peakIou });
  }

  /** Leaving the level (menu, pause): stop gameplay without completing. */
  suspend() {
    if (this.state === 'playing') this.c.portal.gameplayStop();
    this.c.arcball.enabled = false;
  }

  resume() {
    if (this.state === 'playing') {
      this.c.portal.gameplayStart();
      this.c.arcball.enabled = true;
    }
  }
}
