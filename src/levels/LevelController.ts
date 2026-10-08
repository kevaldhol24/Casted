import * as THREE from 'three';
import type { Arcball } from '../core/Arcball';
import type { GameAudio } from '../core/Audio';
import type { Input } from '../core/Input';
import type { Renderer } from '../core/Renderer';
import type { HintTier } from '../core/Store';
import type { Portal } from '../portal/Portal';
import { MaskRenderer } from '../shadow/MaskRenderer';
import { TargetMask, blurToBytes, meterFromIou, rgbaToMask } from '../shadow/Matcher';
import { LIGHT_DIR, OBJECT_POS, type ShadowScene } from '../shadow/ShadowScene';
import type { DebugView } from '../ui/DebugView';
import type { Hud } from '../ui/Hud';
import type { ArrowKind, ObjectArrow } from '../ui/ObjectArrow';
import { easeInOutCubic, easeOutBack, easeOutCubic, type Tweens } from '../util/tween';
import type { LevelObjectInstance } from './LevelLoader';
import { levelPieces, type Axis, type LevelDef, type LevelPiece } from './levels';

export type LevelState = 'idle' | 'intro' | 'playing' | 'hinting' | 'snapping' | 'reveal' | 'done';

export const SCORE_SIZE = 128;
const DISPLAY_MASK_SIZE = 512;
const SNAP_HOLD_S = 0.3;
const SNAP_TWEEN_S = 0.4;
const DRAG_SCORE_INTERVAL_S = 1 / 15;
const MAX_START_IOU = 0.5;
/** Hint button pulses once after this long with the meter never above 50%. */
const HINT_PULSE_S = 45;
/** Reveal hint leaves the player this far from the solution. */
const REVEAL_LEFT_DEG = 15;
/** Assembly: if the player hasn't switched objects after this long, point at the Switch button. */
const SWITCH_TIP_S = 8;

const AXIS_ARROW: Record<Axis, ArrowKind> = { x: 'pitch', y: 'yaw', z: 'roll' };

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
  arrow: ObjectArrow;
  audio: GameAudio;
  tweens: Tweens;
  portal: Portal;
  debug: DebugView | null;
}

/** One object the player turns. A single-object level has one piece whose pivot is the scene's objectRoot. */
interface Piece {
  pivot: THREE.Object3D;
  def: LevelPiece;
  /** Every rotation whose shadow matches (the authored one + symmetric flips that also match). */
  solutions: THREE.Quaternion[];
  lastQ: THREE.Quaternion;
}

/** Bounds of the filled pixels as UV (0–1) min x, min y, max x, max y. */
function maskBounds(mask: Uint8Array, size: number): THREE.Vector4 {
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++)
      if (mask[y * size + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return new THREE.Vector4(0, 0, 1, 1);
  return new THREE.Vector4(x0 / size, y0 / size, (x1 + 1) / size, (y1 + 1) / size);
}

/**
 * One level's life: intro → playing (⇄ hinting) → (hold ≥ threshold for 0.3 s) → snapping → reveal → done.
 * gameplayStart fires on entering playing; gameplayStop on snapping, pause and leaving the level.
 * Assembly levels (World 2) have several pieces; the arcball turns the active one, and the score is the IoU of
 * all their shadows together against the target.
 */
export class LevelController {
  state: LevelState = 'idle';
  level!: LevelDef;
  private target!: TargetMask;
  private pieces: Piece[] = [];
  private active = 0;
  private time = 0;
  private iou = 0;
  private peakIou = 0;
  private meter = 0;
  private meterFloor = 0.5;
  private holdT = 0;
  private closeT = 0;
  private closeShown = false;
  private stuckT = 0;
  private pulsed = false;
  private switched = false;
  private switchT = 0;
  private scoreDirty = true;
  private sinceScore = 0;
  /** Bumped on every level start so a stale async readback from the previous level is ignored. */
  private generation = 0;
  private bobT = 0;
  private bobAmp = 1;
  private touched = false;
  private hintsUsed = 0;
  /** Pause / menu / ad open: the clock stops and input is ignored. */
  private suspended = false;
  private displayTex: THREE.DataTexture | null = null;
  reduceMotion = false;
  hintsEnabled = false;
  onComplete: (r: LevelResult) => void = () => {};

  constructor(private c: Ctx) {}

  get playing() {
    return this.state === 'playing';
  }

  /** Playing and not paused: the clock is running (Endless drains its timer only then). */
  get running() {
    return this.state === 'playing' && !this.suspended;
  }

  /** The first piece's matching rotations (tests set the object to solutions[0]). */
  get solutions(): THREE.Quaternion[] {
    return this.pieces[0]?.solutions ?? [];
  }

  /** More than one piece: the player can switch which one they turn. */
  get isAssembly() {
    return this.pieces.length > 1;
  }

  /** What the player is turning (the on-object arrow follows it). */
  get activePivot(): THREE.Object3D {
    return this.pieces[this.active]?.pivot ?? this.c.scene.objectRoot;
  }

  /** Dev/tests: put every piece at its first solution and score. */
  solveAll() {
    for (const p of this.pieces) p.pivot.quaternion.copy(p.solutions[0]);
    this.scoreSync();
  }

  start(level: LevelDef, objects: LevelObjectInstance[], suspended = false) {
    const { scene, mask, arcball, hud, tweens, arrow } = this.c;
    tweens.clear();
    this.generation++;
    this.level = level;
    this.state = 'intro';
    this.time = 0;
    this.holdT = 0;
    this.closeT = 0;
    this.closeShown = false;
    this.stuckT = 0;
    this.pulsed = false;
    this.switched = false;
    this.switchT = 0;
    this.peakIou = 0;
    this.hintsUsed = 0;
    this.touched = false;
    this.suspended = suspended;
    this.c.renderer.push = 0;
    arrow.hide();

    const defs = levelPieces(level);
    const pivots = scene.setPieces(objects);
    const root = scene.objectRoot;
    root.position.copy(OBJECT_POS);
    root.scale.setScalar(1);
    mask.aim(OBJECT_POS, LIGHT_DIR);

    // Solutions are stored in light space: identity = local Z points back at the light, local Y is light-space up.
    // Assembly pieces sit at their light-space offsets under an unrotated root, so world and local rotations agree.
    const cam = mask.camera;
    const axes = [0, 1, 2].map((col) => new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, col).normalize());
    const solved = defs.map((d) => {
      const q = cam.quaternion.clone();
      if (d.solution) q.multiply(new THREE.Quaternion().fromArray(d.solution).normalize());
      return q;
    });
    this.pieces = pivots.map((pivot, i) => {
      const d = defs[i];
      if (pivot !== root) {
        pivot.position.set(0, 0, 0).addScaledVector(axes[0], d.offset[0]).addScaledVector(axes[1], d.offset[1]).addScaledVector(axes[2], d.offset[2]);
        pivot.scale.setScalar(d.scale);
      }
      pivot.quaternion.copy(solved[i]);
      return { pivot, def: d, solutions: [], lastQ: new THREE.Quaternion() };
    });
    root.updateMatrixWorld(true);

    // Target masks come from the same render path as live scoring, so a perfect solve scores 1.0.
    this.target = new TargetMask(rgbaToMask(mask.render(SCORE_SIZE), SCORE_SIZE), SCORE_SIZE);
    const big = rgbaToMask(mask.render(DISPLAY_MASK_SIZE), DISPLAY_MASK_SIZE);
    this.displayTex?.dispose();
    this.displayTex = new THREE.DataTexture(blurToBytes(big, DISPLAY_MASK_SIZE, 5), DISPLAY_MASK_SIZE, DISPLAY_MASK_SIZE, THREE.RedFormat);
    this.displayTex.magFilter = THREE.LinearFilter;
    this.displayTex.minFilter = THREE.LinearFilter;
    this.displayTex.needsUpdate = true;
    scene.placeOutline(cam, mask.halfSize, this.displayTex);
    scene.setReveal(level.reveal, maskBounds(big, DISPLAY_MASK_SIZE));
    scene.objectShadow = true;

    this.pieces.forEach((p, i) => (p.solutions = this.findSolutions(i, solved[i])));
    hud.setPieces(this.isAssembly ? this.pieces.map((p) => !!p.def.locked) : []);
    this.placeStart(solved);

    scene.fill = 0;
    scene.glow = 0;
    scene.shadowSoftness = 3;
    scene.outlineOpacity = 0;
    this.scoreSync();
    this.meterFloor = Math.max(0.5, Math.min(this.iou + 0.03, level.threshold - 0.2));
    this.meter = meterFromIou(this.iou, level.threshold, this.meterFloor);
    hud.setMeter(this.meter);
    hud.setLevel(`${level.world}-${level.id.slice(-2).replace(/^0/, '')}`);
    // Loaded behind the menu (suspended): the HUD appears when the level is actually played.
    hud.visible = !suspended;
    hud.hintVisible = this.hintsEnabled;

    arcball.enabled = false;
    arcball.stop();
    this.select(Math.max(0, this.pieces.findIndex((p) => !p.def.locked)), false);
    for (const p of this.pieces) p.lastQ.copy(p.pivot.quaternion);

    tweens
      .to(0.6, (k) => {
        root.scale.setScalar(Math.max(0.001, k));
        scene.outlineOpacity = k;
      }, this.reduceMotion ? easeOutCubic : easeOutBack)
      .then(() => {
        this.state = 'playing';
        // Loaded behind the main menu: stay suspended until resume() (which fires gameplayStart).
        if (this.suspended) return;
        arcball.enabled = true;
        this.c.portal.gameplayStart();
        this.showAxisGuide();
      });
  }

  /** Axis-locked piece: the wordless hand (until first touch) and the faint arc showing which way it turns. */
  private showAxisGuide() {
    const single = this.singleAxis();
    if (!single) return this.c.arrow.hide();
    if (!this.touched) this.c.hud.showHand(single === 'y' ? 'h' : 'v');
    this.c.arrow.guide(AXIS_ARROW[single]);
  }

  private singleAxis(): Axis | null {
    const axes = this.pieces[this.active]?.def.freeAxes ?? [];
    return axes.length === 1 ? axes[0] : null;
  }

  /** Make piece `i` the one the arcball turns (locked pieces can't be picked). Returns true if it changed. */
  select(i: number, byPlayer = true): boolean {
    const p = this.pieces[i];
    if (!p || p.def.locked) return false;
    const changed = i !== this.active;
    const { arcball, scene } = this.c;
    if (changed) arcball.stop();
    this.active = i;
    arcball.target = p.pivot;
    arcball.freeAxes = p.def.freeAxes;
    scene.highlight(this.isAssembly ? i : -1);
    this.c.hud.setActivePiece(i);
    if (changed && byPlayer) {
      this.switched = true;
      if (this.state === 'playing') this.showAxisGuide();
    }
    return changed;
  }

  /** Tab: the next piece that can be turned. */
  cycle() {
    if (!this.isAssembly || (this.state !== 'playing' && this.state !== 'intro')) return;
    for (let k = 1; k < this.pieces.length; k++) if (this.select((this.active + k) % this.pieces.length)) return;
  }

  /** The piece's authored solution plus 180° flips about the light-space axes whose shadow also matches. */
  private findSolutions(i: number, solution: THREE.Quaternion): THREE.Quaternion[] {
    const { mask } = this.c;
    const pivot = this.pieces[i].pivot;
    const cam = mask.camera.matrixWorld;
    const out = [solution.clone()];
    for (let col = 0; col < 3; col++) {
      const axis = new THREE.Vector3().setFromMatrixColumn(cam, col).normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(axis, Math.PI).multiply(solution);
      pivot.quaternion.copy(q);
      pivot.updateMatrixWorld(true);
      if (this.target.iou(mask.render(SCORE_SIZE)) >= 0.97) out.push(q);
    }
    pivot.quaternion.copy(solution);
    pivot.updateMatrixWorld(true);
    return out;
  }

  /** Turn every unlocked piece by its start offset times k (sign flips the direction), from its solution. */
  private applyStart(solved: THREE.Quaternion[], k: number) {
    const { arcball } = this.c;
    const savedTarget = arcball.target;
    const savedAxes = arcball.freeAxes;
    arcball.freeAxes = ['x', 'y', 'z'];
    this.pieces.forEach((p, i) => {
      p.pivot.quaternion.copy(solved[i]);
      if (p.def.locked) return;
      const [px, py, pz] = p.def.startOffset;
      arcball.target = p.pivot;
      arcball.apply(py * k, px * k, pz * k);
    });
    arcball.target = savedTarget;
    arcball.freeAxes = savedAxes;
    this.c.scene.objectRoot.updateMatrixWorld(true);
  }

  /**
   * Start offsets in screen space. If the authored offsets start too close to a match (IoU ≥ 0.5), scale them up
   * and try the mirrored direction too; take the first candidate under 0.5, else the lowest-scoring one.
   */
  private placeStart(solved: THREE.Quaternion[]) {
    const { mask } = this.c;
    let best = 1;
    let bestIou = Infinity;
    for (const k of [1, 1.2, 1.4, 1.6, 1.8, 2.0]) {
      let done = false;
      for (const sk of [k, -k]) {
        this.applyStart(solved, sk);
        const iou = this.target.iou(mask.render(SCORE_SIZE));
        if (iou < bestIou) {
          bestIou = iou;
          best = sk;
        }
        if (iou < MAX_START_IOU) {
          done = true;
          break;
        }
      }
      if (done) break;
    }
    if (bestIou >= MAX_START_IOU && import.meta.env.DEV)
      console.info(`[level ${this.level.id}] no start under IoU ${MAX_START_IOU}; using ${bestIou.toFixed(2)} (meter floor raised)`);
    this.applyStart(solved, best);
  }

  grab() {
    if (this.state !== 'playing') return;
    this.c.arcball.grab();
    if (!this.touched) {
      this.touched = true;
      this.c.hud.showHand(null);
    }
  }

  private prepareMask() {
    const { mask, scene } = this.c;
    // The mask camera follows the bobbing object, so the score depends on rotation only.
    mask.aim(scene.objectRoot.position, LIGHT_DIR);
    scene.objectRoot.updateMatrixWorld(true);
  }

  private applyScore(rgba: Uint8Array) {
    this.iou = this.target.iou(rgba);
    this.peakIou = Math.max(this.peakIou, this.iou);
    this.c.debug?.draw(rgba, this.target.mask, this.iou, `${this.state} solutions:${this.pieces.map((p) => p.solutions.length).join('+')}`);
  }

  /** Synchronous score (level load, tests). */
  scoreSync() {
    this.prepareMask();
    this.applyScore(this.c.mask.render(SCORE_SIZE));
    this.scoreDirty = false;
    this.sinceScore = 0;
  }

  /** Live score: async readback, at most one in flight; results from an older level are dropped. */
  private scoreAsync() {
    this.prepareMask();
    const pending = this.c.mask.renderAsync(SCORE_SIZE);
    if (!pending) return;
    this.scoreDirty = false;
    this.sinceScore = 0;
    const gen = this.generation;
    pending.then((rgba) => {
      if (gen === this.generation && (this.state === 'playing' || this.state === 'hinting')) this.applyScore(rgba);
    });
  }

  update(dt: number) {
    const { arcball, input, hud, scene, audio } = this.c;
    this.bobT += dt;
    const moving = arcball.moving;
    const bobGoal = this.state === 'playing' && !moving && !this.reduceMotion ? 1 : 0;
    this.bobAmp += (bobGoal - this.bobAmp) * Math.min(1, dt * 3);
    if (this.state === 'intro' || this.state === 'playing') {
      scene.objectRoot.position.y = OBJECT_POS.y + Math.sin(this.bobT * 1.6) * 0.035 * this.bobAmp;
    }

    // Creak follows how fast the objects are turning, whatever turned them (drag, inertia, hint tween).
    let turned = 0;
    for (const p of this.pieces) {
      turned += (p.pivot.quaternion.angleTo(p.lastQ) * 180) / Math.PI;
      p.lastQ.copy(p.pivot.quaternion);
    }
    audio.setRotateSpeed(dt > 0 && this.state !== 'snapping' ? turned / dt : 0);

    if ((this.state !== 'playing' && this.state !== 'hinting') || this.suspended) {
      audio.setMatch(0);
      return;
    }
    if (this.state === 'playing') {
      this.time += dt;
      hud.dim = input.dragging;
      arcball.update(dt, input.keyAxes());
      if (arcball.changed) this.scoreDirty = true;
    } else this.scoreDirty = true;
    this.sinceScore += dt;
    if (this.scoreDirty && (!input.dragging || this.sinceScore >= DRAG_SCORE_INTERVAL_S)) this.scoreAsync();

    const goal = meterFromIou(this.iou, this.level.threshold, this.meterFloor);
    this.meter += (goal - this.meter) * Math.min(1, dt * 12);
    hud.setMeter(this.meter);
    audio.setMatch(this.meter);
    scene.glow = THREE.MathUtils.smoothstep(this.meter, 0.7, 1.0);
    if (this.state !== 'playing') return;

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

    // Assembly with more than one turnable piece: if the player never switched, say how once.
    if (!this.switched && this.pieces.filter((p) => !p.def.locked).length > 1) {
      this.switchT += dt;
      if (this.switchT > SWITCH_TIP_S) {
        this.switched = true;
        hud.toast('Tap Switch to turn the other object', 2.6);
      }
    }

    // No progress above 50% for 45 s → pulse the hint button once.
    if (this.meter > 0.5) this.stuckT = 0;
    else this.stuckT += dt;
    if (this.hintsEnabled && !this.pulsed && this.stuckT > HINT_PULSE_S) {
      this.pulsed = true;
      hud.pulseHint();
    }
  }

  private nearestSolution(p: Piece): THREE.Quaternion {
    const q = p.pivot.quaternion;
    let best = p.solutions[0];
    for (const s of p.solutions) if (q.angleTo(s) < q.angleTo(best)) best = s;
    return best;
  }

  /** Assembly hints help the turnable piece furthest from its solution (and make it the active one). */
  private hintPiece(): Piece {
    let pick = this.pieces[this.active];
    let far = -1;
    for (const p of this.pieces) {
      if (p.def.locked) continue;
      const a = p.pivot.quaternion.angleTo(this.nearestSolution(p));
      if (a > far) {
        far = a;
        pick = p;
      }
    }
    this.select(this.pieces.indexOf(pick), false);
    return pick;
  }

  /**
   * Apply a hint. Any hint caps the level at 1 star.
   * Nudge: an arrow for 2 s showing which way to drag next. Peek: auto-rotate halfway to the solution.
   * Reveal: rotate to within 15° of the solution and flash the solved shadow; the player finishes it.
   */
  async useHint(tier: HintTier) {
    if (this.state !== 'playing') return;
    const { arcball, scene, tweens, audio, arrow } = this.c;
    this.hintsUsed++;
    this.stuckT = 0;
    audio.hint();
    this.touched = true;
    this.c.hud.showHand(null);
    const piece = this.hintPiece();

    if (tier === 'nudge') {
      const n = this.nudgeDirection(piece);
      const single = this.singleAxis();
      arrow.nudge(n.kind, n.sign, 2, single ? AXIS_ARROW[single] : null);
      return;
    }

    const obj = piece.pivot;
    const from = obj.quaternion.clone();
    const to = this.nearestSolution(piece).clone();
    const total = from.angleTo(to);
    const k = tier === 'peek' ? this.peekAmount(piece, from, to) : Math.max(0, 1 - THREE.MathUtils.degToRad(REVEAL_LEFT_DEG) / Math.max(total, 1e-6));
    const goal = from.clone().slerp(to, k);
    this.state = 'hinting';
    arcball.enabled = false;
    arcball.stop();
    await tweens.to(tier === 'peek' ? 0.9 : 1.2, (t) => obj.quaternion.slerpQuaternions(from, goal, t), easeInOutCubic);
    if (tier === 'reveal') {
      await tweens.to(0.35, (t) => (scene.fill = 0.55 * t));
      await tweens.to(0.6, (t) => (scene.fill = 0.55 * (1 - t)));
    }
    if (this.state !== 'hinting') return;
    this.state = 'playing';
    arcball.enabled = true;
    this.scoreDirty = true;
  }

  /**
   * Peek turns halfway to the solution — but halfway in rotation doesn't always look closer in shadow, so if
   * it wouldn't visibly raise the score, go further (up to 80%) so the hint always moves the meter.
   */
  private peekAmount(piece: Piece, from: THREE.Quaternion, to: THREE.Quaternion): number {
    const obj = piece.pivot;
    const start = this.iou;
    let pick = 0.8;
    for (const k of [0.5, 0.6, 0.7, 0.8]) {
      obj.quaternion.slerpQuaternions(from, to, k);
      this.prepareMask();
      if (this.target.iou(this.c.mask.render(SCORE_SIZE)) > start + 0.08) {
        pick = k;
        break;
      }
    }
    obj.quaternion.copy(from);
    return pick;
  }

  /** Which way to drag next: the free screen axis with the largest share of the piece's remaining rotation. */
  private nudgeDirection(piece: Piece): { kind: ArrowKind; sign: number } {
    const { mask } = this.c;
    const q = piece.pivot.quaternion;
    const delta = this.nearestSolution(piece).clone().multiply(q.clone().invert());
    if (delta.w < 0) delta.set(-delta.x, -delta.y, -delta.z, -delta.w);
    const angle = 2 * Math.acos(Math.min(1, delta.w));
    const s = Math.sqrt(1 - delta.w * delta.w);
    const axis = s < 1e-6 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(delta.x / s, delta.y / s, delta.z / s);
    const m = mask.camera.matrixWorld;
    const comp: Record<Axis, number> = {
      x: axis.dot(new THREE.Vector3().setFromMatrixColumn(m, 0)) * angle,
      y: axis.dot(new THREE.Vector3().setFromMatrixColumn(m, 1)) * angle,
      z: axis.dot(new THREE.Vector3().setFromMatrixColumn(m, 2)) * angle,
    };
    const free = piece.def.freeAxes;
    let best: Axis = free[0];
    for (const a of free) if (Math.abs(comp[a]) > Math.abs(comp[best])) best = a;
    // Positive yaw = drag right, positive pitch = drag down; positive roll turns anticlockwise on screen,
    // and the roll arc is drawn clockwise, so roll flips.
    const sign = Math.sign(comp[best]) || 1;
    return { kind: AXIS_ARROW[best], sign: best === 'z' ? -sign : sign };
  }

  private snap() {
    const { arcball, scene, tweens, hud, portal, audio, arrow } = this.c;
    this.state = 'snapping';
    arcball.enabled = false;
    arcball.release();
    arcball.stop();
    portal.gameplayStop();
    hud.showHand(null);
    hud.dim = false;
    arrow.hide();
    audio.setRotateSpeed(0);
    scene.highlight(-1);

    const root = scene.objectRoot;
    const moves = this.pieces.map((p) => ({ p, from: p.pivot.quaternion.clone(), to: this.nearestSolution(p) }));
    const fromY = root.position.y;
    tweens
      .to(SNAP_TWEEN_S, (k) => {
        for (const m of moves) m.p.pivot.quaternion.slerpQuaternions(m.from, m.to, k);
        root.position.y = fromY + (OBJECT_POS.y - fromY) * k;
        hud.setMeter(this.meter + (1 - this.meter) * k);
        scene.glow = 1;
      }, easeOutCubic)
      .then(() => this.reveal());
  }

  private async reveal() {
    const { scene, tweens, renderer, portal, audio } = this.c;
    this.state = 'reveal';
    this.iou = 1;
    audio.chime();
    audio.duck(true);
    if (!this.reduceMotion) scene.burst();
    portal.happyTime?.();
    tweens.to(0.5, (k) => (scene.shadowSoftness = 3 - 2.5 * k));
    tweens.to(0.8, (k) => (scene.fill = k), easeInOutCubic);
    if (!this.reduceMotion) {
      await tweens.to(0.15, (k) => (renderer.push = 0.45 * k), easeOutCubic);
      await tweens.to(0.7, (k) => (renderer.push = 0.45 * (1 - k)), easeInOutCubic);
    } else await tweens.to(0.85, () => {});
    renderer.push = 0;
    // The paint now covers the real shadow: hide that and let the painted shape come alive (rabbit hops, fish swims).
    if (!this.reduceMotion && this.level.reveal && this.level.reveal !== 'none') {
      scene.objectShadow = false;
      tweens.to(0.4, (k) => (scene.revealAmount = k), easeOutCubic);
      await tweens.to(1.1, () => {});
    } else await tweens.to(0.5, () => {});
    audio.duck(false);

    const stars = this.hintsUsed > 0 ? 1 : this.time <= this.level.parTime ? 3 : 2;
    this.state = 'done';
    this.c.hud.visible = false;
    this.onComplete({ level: this.level, time: this.time, stars, hintsUsed: this.hintsUsed, peakIou: this.peakIou });
  }

  /** Leaving the level (pause, menu, ad): stop gameplay without completing. */
  suspend() {
    this.suspended = true;
    if (this.state === 'playing') this.c.portal.gameplayStop();
    this.c.arcball.enabled = false;
    this.c.arcball.release();
    this.c.audio.setRotateSpeed(0);
  }

  resume() {
    this.suspended = false;
    if (this.state === 'playing') {
      this.c.portal.gameplayStart();
      this.c.arcball.enabled = true;
    }
  }
}
