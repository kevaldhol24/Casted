import * as THREE from 'three';
import { LevelController, SCORE_SIZE, type LevelResult } from '../levels/LevelController';
import { HINTS_FROM_LEVEL, LEVELS } from '../levels/levels';
import type { Portal } from '../portal/Portal';
import { MaskRenderer } from '../shadow/MaskRenderer';
import { ATTIC, OBJECT_POS, ShadowScene } from '../shadow/ShadowScene';
import { DebugView } from '../ui/DebugView';
import { HintPanel } from '../ui/HintPanel';
import { Hud } from '../ui/Hud';
import { LevelSelect } from '../ui/LevelSelect';
import { ObjectArrow } from '../ui/ObjectArrow';
import { PausePanel } from '../ui/PausePanel';
import { WinScreen } from '../ui/WinScreen';
import { Tweens } from '../util/tween';
import { Arcball } from './Arcball';
import { GameAudio } from './Audio';
import { Input } from './Input';
import { Renderer } from './Renderer';
import { BULBS, HINT_COST, type HintTier, type SaveData, Store } from './Store';

/** After using the video option on the hint panel, it stays off this long. */
const REWARDED_COOLDOWN_S = 60;
const NO_VIDEO = 'No video available right now — try again soon.';

/** Main loop and flow: play → win → next, pause/settings, hints and Bulbs, ads through the portal. */
export class Game {
  private renderer: Renderer;
  private scene: ShadowScene;
  private level: LevelController;
  private hud: Hud;
  private arrow: ObjectArrow;
  private win: WinScreen;
  private levelSelect: LevelSelect;
  private hintPanel: HintPanel;
  private pause: PausePanel;
  private input: Input;
  private audio = new GameAudio();
  private tweens = new Tweens();
  private timer = new THREE.Timer();
  private elapsed = 0;
  private index = 0;
  private hidden = false;
  private inAd = false;
  private firstTransition = true;
  private rewardedReadyAt = 0;
  private projected = new THREE.Vector3();

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

    this.arrow = new ObjectArrow(ui);
    this.hud = new Hud(ui);
    this.win = new WinScreen(ui);
    this.levelSelect = new LevelSelect(ui);
    this.hintPanel = new HintPanel(ui);
    this.pause = new PausePanel(ui);
    const debug = new URLSearchParams(location.search).has('debug') ? new DebugView(ui, SCORE_SIZE) : null;

    const arcball = new Arcball(this.scene.objectRoot, mask.camera);
    this.input = new Input(canvas, {
      onGrab: () => this.level.grab(),
      onDrag: (i) => arcball.drag(i),
      onRelease: () => arcball.release(),
      onKey: (code) => this.onKey(code),
    });

    this.level = new LevelController({
      renderer: this.renderer,
      scene: this.scene,
      mask,
      arcball,
      input: this.input,
      hud: this.hud,
      arrow: this.arrow,
      audio: this.audio,
      tweens: this.tweens,
      portal,
      palette: ATTIC,
      debug,
    });
    this.level.onComplete = (r) => this.onComplete(r);
    this.applySettings(store.data.settings);

    // UI wiring. Every button gets the paper-tick click sound.
    ui.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.audio.click();
    });
    this.win.onNext = () => this.next();
    this.win.onReplay = () => this.transition(this.index);
    this.win.onLevels = () => this.openLevels();
    this.win.onStar = (i) => this.audio.star(i);
    this.hud.pauseBtn.addEventListener('click', () => this.openPause());
    this.hud.muteBtn.addEventListener('click', () => this.toggleMute());
    this.hud.hintBtn.addEventListener('click', () => this.openHints());
    this.levelSelect.onPick = (i) => this.play(i);
    this.levelSelect.onClose = () => this.level.resume();
    this.pause.onResume = () => this.level.resume();
    this.pause.onRestart = () => this.play(this.index);
    this.pause.onLevels = () => this.openLevels();
    this.pause.onSettings = (s) => {
      this.applySettings(s);
      this.store.save();
    };
    this.hintPanel.onPick = (tier, withAd) => this.buyHint(tier, withAd);
    this.hintPanel.onGetBulbs = () => this.watchForBulbs();
    this.hintPanel.onClose = () => this.level.resume();

    document.addEventListener('visibilitychange', () => this.setHidden(document.hidden));
  }

  start() {
    const param = Number(new URLSearchParams(location.search).get('level'));
    const firstUnsolved = LEVELS.findIndex((l) => !this.store.isSolved(l.id));
    const start = param >= 1 && param <= LEVELS.length ? param - 1 : firstUnsolved === -1 ? 0 : firstUnsolved;
    const loginBulb = this.store.claimDailyLogin();
    this.play(start);
    if (loginBulb) setTimeout(() => this.hud.toast(`+${BULBS.dailyLogin} Bulb`), 900);
    this.renderer.gl.setAnimationLoop(() => this.frame());
  }

  private applySettings(s: SaveData['settings']) {
    this.input.sensitivity = s.sensitivity;
    this.audio.setVolumes(s.music, s.sfx);
    this.audio.setMuted(s.muted);
    this.hud.setMuted(s.muted);
    this.level.reduceMotion = s.reduceMotion;
  }

  private toggleMute() {
    const s = this.store.data.settings;
    s.muted = !s.muted;
    this.applySettings(s);
    this.store.save();
  }

  private unlocked(i: number) {
    return i === 0 || this.store.isSolved(LEVELS[i - 1].id);
  }

  private hintsUnlocked(i: number) {
    return i + 1 >= HINTS_FROM_LEVEL || this.store.isSolved(LEVELS[HINTS_FROM_LEVEL - 2].id);
  }

  private play(i: number) {
    this.index = i;
    this.win.hide();
    this.level.hintsEnabled = this.hintsUnlocked(i);
    this.hud.setBulbs(this.store.data.bulbs);
    this.level.start(LEVELS[i]);
  }

  /**
   * Level transitions (Next / Replay) request a midgame from level 3 on; the SDK decides if an ad plays.
   * The first transition of a session never shows one.
   */
  private async transition(i: number) {
    if (!this.firstTransition && i + 1 >= 3) {
      await this.runAd(() => this.portal.midgame({ onStart: () => this.audio.setAdMuted(true) }));
    }
    this.firstTransition = false;
    this.play(i);
  }

  private next() {
    if (this.index >= LEVELS.length - 1) this.openLevels();
    else this.transition(this.index + 1);
  }

  /** Pause and block input for the whole ad request; audio mutes only when the ad starts. */
  private async runAd<T>(request: () => Promise<T>): Promise<T> {
    this.inAd = true;
    this.input.enabled = false;
    this.level.suspend();
    try {
      return await request();
    } finally {
      this.audio.setAdMuted(false);
      this.input.enabled = true;
      this.inAd = false;
    }
  }

  private async rewarded(): Promise<boolean> {
    if (!this.portal.rewardedAvailable() || performance.now() < this.rewardedReadyAt) {
      this.hud.toast(NO_VIDEO, 2.5);
      return false;
    }
    const ok = await this.runAd(() => this.portal.rewarded({ onStart: () => this.audio.setAdMuted(true) }));
    if (ok) this.rewardedReadyAt = performance.now() + REWARDED_COOLDOWN_S * 1000;
    else this.hud.toast(NO_VIDEO, 2.5);
    return ok;
  }

  private openHints() {
    if (!this.level.playing || !this.level.hintsEnabled) return;
    this.level.suspend();
    this.hintPanel.show({
      bulbs: this.store.data.bulbs,
      freeHint: !this.store.data.freeHintUsed,
      adReady: this.portal.rewardedAvailable() && performance.now() >= this.rewardedReadyAt,
      adCooldown: Math.max(0, this.rewardedReadyAt - performance.now()) / 1000,
    });
  }

  private async buyHint(tier: HintTier, withAd: boolean) {
    let paid = false;
    if (withAd) paid = await this.rewarded();
    else if (!this.store.data.freeHintUsed) {
      this.store.data.freeHintUsed = true;
      this.store.save();
      paid = true;
    } else paid = this.store.spendBulbs(HINT_COST[tier]);
    this.hud.setBulbs(this.store.data.bulbs);
    this.level.resume();
    if (paid) {
      if (import.meta.env.DEV) console.debug('[event] hint_used', { id: this.level.level.id, tier, paidWith: withAd ? 'ad' : 'bulbs' });
      this.level.useHint(tier);
    }
  }

  private async watchForBulbs() {
    if (await this.rewarded()) {
      this.store.addBulbs(BULBS.rewardedAd);
      this.hud.setBulbs(this.store.data.bulbs);
      this.hud.toast(`+${BULBS.rewardedAd} Bulbs`);
    }
    this.openHints();
  }

  private openPause() {
    if (!this.level.playing) return;
    this.level.suspend();
    this.pause.show(this.store.data.settings);
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
    const earned = this.store.recordSolve(r.level.id, r.stars, r.time);
    this.hud.setBulbs(this.store.data.bulbs);
    if (import.meta.env.DEV) console.debug('[event] level_complete', { id: r.level.id, time: r.time, stars: r.stars, hints: r.hintsUsed, peakIou: r.peakIou });
    this.win.show({
      title: r.level.targetName,
      stars: r.stars,
      time: r.time,
      parTime: r.level.parTime,
      isLast: this.index >= LEVELS.length - 1,
      bulbsEarned: earned,
    });
  }

  private onKey(code: string) {
    if (this.inAd) return;
    if (code === 'Escape' || code === 'KeyP') {
      if (this.levelSelect.open) {
        this.levelSelect.hide();
        this.level.resume();
      } else if (this.hintPanel.open) {
        this.hintPanel.hide();
        this.level.resume();
      } else if (this.pause.open) {
        this.pause.hide();
        this.level.resume();
      } else this.openPause();
    } else if (code === 'KeyH') this.openHints();
  }

  private setHidden(h: boolean) {
    if (h === this.hidden) return;
    this.hidden = h;
    const menuOpen = this.levelSelect.open || this.pause.open || this.hintPanel.open || this.inAd;
    if (h) this.level.suspend();
    else if (!menuOpen) this.level.resume();
  }

  /** Keep the on-object arrow centred on the object's screen position. */
  private placeArrow() {
    const cam = this.renderer.camera;
    const p = this.projected.copy(this.scene.objectRoot.position).project(cam);
    const w = this.renderer.canvas.clientWidth;
    const h = this.renderer.canvas.clientHeight;
    const dist = cam.position.distanceTo(this.scene.objectRoot.position);
    const pxPerUnit = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist);
    this.arrow.place((p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h, pxPerUnit * 2.6);
  }

  private frame() {
    this.timer.update();
    const dt = Math.min(0.05, this.timer.getDelta());
    if (this.hidden) return;
    this.elapsed += dt;
    this.tweens.update(dt);
    this.level.update(dt);
    this.win.update(dt);
    this.scene.update(dt, this.elapsed);
    this.placeArrow();
    this.renderer.render(this.scene.scene);
  }
}
