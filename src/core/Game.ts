import * as THREE from 'three';
import { LevelController, SCORE_SIZE, type LevelResult } from '../levels/LevelController';
import { LEVELS } from '../levels/levels';
import type { Portal } from '../portal/Portal';
import { MaskRenderer } from '../shadow/MaskRenderer';
import { ATTIC, OBJECT_POS, ShadowScene } from '../shadow/ShadowScene';
import { DebugView } from '../ui/DebugView';
import { Hud } from '../ui/Hud';
import { LevelSelect } from '../ui/LevelSelect';
import { WinScreen } from '../ui/WinScreen';
import { Tweens } from '../util/tween';
import { Arcball } from './Arcball';
import { Input } from './Input';
import { Renderer } from './Renderer';
import { Store } from './Store';

/** Main loop, level flow (play → win → next), pause on tab hide. */
export class Game {
  private renderer: Renderer;
  private scene: ShadowScene;
  private level: LevelController;
  private hud: Hud;
  private win: WinScreen;
  private levelSelect: LevelSelect;
  private input: Input;
  private tweens = new Tweens();
  private timer = new THREE.Timer();
  private elapsed = 0;
  private index = 0;
  private paused = false;
  private firstLevel = true;

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement, private portal: Portal, private store: Store) {
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.renderer = new Renderer(canvas);
    this.scene = new ShadowScene(ATTIC, coarse ? 1024 : 2048);
    const mask = new MaskRenderer(this.renderer.gl, this.scene.scene, 1.45);

    // Keep the floating object and the whole solved-shadow area on screen.
    const sc = this.scene.shadowCenter();
    const r = 1.25;
    this.renderer.setFocus([
      OBJECT_POS.clone().add(new THREE.Vector3(-r, -r, 0)),
      OBJECT_POS.clone().add(new THREE.Vector3(r, -r, 0)),
      sc.clone().add(new THREE.Vector3(-r, r, 0)),
      sc.clone().add(new THREE.Vector3(r, r, 0)),
      sc.clone().add(new THREE.Vector3(-r, -r, 0)),
    ]);

    this.hud = new Hud(ui);
    this.win = new WinScreen(ui);
    this.levelSelect = new LevelSelect(ui);
    const debug = new URLSearchParams(location.search).has('debug') ? new DebugView(ui, SCORE_SIZE) : null;

    const arcball = new Arcball(this.scene.objectRoot, mask.camera);
    this.input = new Input(canvas, {
      onGrab: () => this.level.grab(),
      onDrag: (i) => arcball.drag(i),
      onRelease: () => arcball.release(),
      onKey: (code) => this.onKey(code),
    });
    this.input.sensitivity = store.data.settings.sensitivity;

    this.level = new LevelController({
      renderer: this.renderer,
      scene: this.scene,
      mask,
      arcball,
      input: this.input,
      hud: this.hud,
      tweens: this.tweens,
      portal,
      palette: ATTIC,
      debug,
    });
    this.level.onComplete = (r) => this.onComplete(r);

    this.win.onNext = () => this.next();
    this.win.onReplay = () => this.play(this.index);
    this.win.onLevels = () => this.openLevels();
    this.hud.levelsBtn.addEventListener('click', () => this.openLevels());
    this.levelSelect.onPick = (i) => this.play(i);
    this.levelSelect.onClose = () => this.level.resume();

    document.addEventListener('visibilitychange', () => this.setPaused(document.hidden));
  }

  start() {
    const param = Number(new URLSearchParams(location.search).get('level'));
    const firstUnsolved = LEVELS.findIndex((l) => !this.store.isSolved(l.id));
    const start = param >= 1 && param <= LEVELS.length ? param - 1 : firstUnsolved === -1 ? 0 : firstUnsolved;
    this.play(start);
    this.renderer.gl.setAnimationLoop(() => this.frame());
  }

  private unlocked(i: number) {
    return i === 0 || this.store.isSolved(LEVELS[i - 1].id);
  }

  private play(i: number) {
    this.index = i;
    this.win.hide();
    this.level.start(LEVELS[i]);
  }

  private async next() {
    if (this.index >= LEVELS.length - 1) {
      this.openLevels();
      return;
    }
    // Midgame requested at every transition from level 3 on; the SDK decides whether an ad actually plays.
    if (!this.firstLevel && this.index + 1 >= 3) await this.portal.midgame();
    this.firstLevel = false;
    this.play(this.index + 1);
  }

  private openLevels() {
    this.level.suspend();
    this.win.hide();
    this.levelSelect.show(
      LEVELS.map((l, i) => ({
        level: l,
        stars: this.store.stars(l.id),
        unlocked: this.unlocked(i),
        current: i === this.index,
      })),
    );
  }

  private onComplete(r: LevelResult) {
    this.store.recordSolve(r.level.id, r.stars, r.time);
    if (import.meta.env.DEV) console.debug('[event] level_complete', { id: r.level.id, ...r, level: undefined });
    this.win.show({
      title: r.level.targetName,
      stars: r.stars,
      time: r.time,
      parTime: r.level.parTime,
      isLast: this.index >= LEVELS.length - 1,
    });
  }

  private onKey(code: string) {
    if (code === 'Escape' || code === 'KeyP') {
      if (this.levelSelect.open) {
        this.levelSelect.hide();
        this.level.resume();
      } else if (this.level.playing) this.openLevels();
    }
  }

  private setPaused(p: boolean) {
    if (p === this.paused) return;
    this.paused = p;
    if (p) this.level.suspend();
    else if (!this.levelSelect.open) this.level.resume();
  }

  private frame() {
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    if (this.paused) return;
    this.elapsed += dt;
    this.tweens.update(dt);
    this.level.update(dt);
    this.win.update(dt);
    this.scene.update(dt, this.elapsed);
    this.renderer.render(this.scene.scene);
  }
}
