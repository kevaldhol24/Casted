import * as THREE from 'three';
import { LevelController, SCORE_SIZE, type LevelResult } from '../levels/LevelController';
import { HINTS_FROM_LEVEL, LEVELS } from '../levels/levels';
import { MODE_UNLOCKS, WORLDS, unlockText, type WorldDef } from '../levels/worlds';
import type { Portal } from '../portal/Portal';
import { MaskRenderer } from '../shadow/MaskRenderer';
import { ATTIC, OBJECT_POS, ShadowScene } from '../shadow/ShadowScene';
import { Album } from '../ui/Album';
import { DebugView } from '../ui/DebugView';
import { el } from '../ui/dom';
import { HintPanel } from '../ui/HintPanel';
import { Hud } from '../ui/Hud';
import { LevelSelect } from '../ui/LevelSelect';
import { MainMenu, type ModeTile } from '../ui/MainMenu';
import { ObjectArrow } from '../ui/ObjectArrow';
import { PausePanel } from '../ui/PausePanel';
import { WinScreen } from '../ui/WinScreen';
import { WorldSelect } from '../ui/WorldSelect';
import { Tweens } from '../util/tween';
import { Arcball } from './Arcball';
import { GameAudio } from './Audio';
import { Input } from './Input';
import { FrameMonitor, TIERS, detectTier, lowerTier, type Tier } from './Quality';
import { Renderer } from './Renderer';
import { BULBS, HINT_COST, type HintTier, type SaveData, Store } from './Store';

/** After using the video option on the hint panel, it stays off this long. */
const REWARDED_COOLDOWN_S = 60;
const NO_VIDEO = 'No video available right now — try again soon.';

/**
 * Main loop and screen flow (design doc): Loading → Main menu → World / level select → Level play → Win → next.
 * A first visit skips the menu and lands in level 1. Also owns hints/Bulbs, pause/settings, ads and quality.
 */
export class Game {
  private renderer: Renderer;
  private scene: ShadowScene;
  private level: LevelController;
  private hud: Hud;
  private arrow: ObjectArrow;
  private menu: MainMenu;
  private worlds: WorldSelect;
  private album: Album;
  private win: WinScreen;
  private levelSelect: LevelSelect;
  private hintPanel: HintPanel;
  private pause: PausePanel;
  private vignette = el('div', 'css-vignette');
  private input: Input;
  private audio = new GameAudio();
  private tweens = new Tweens();
  private timer = new THREE.Timer();
  private monitor = new FrameMonitor();
  private autoTier: Tier = detectTier();
  private tier: Tier = this.autoTier;
  private elapsed = 0;
  private index = 0;
  private hidden = false;
  private inAd = false;
  private inMenus = false;
  /** Where the level grid's Back button goes: the world list (from the menu) or back into the level. */
  private levelSelectFrom: 'worlds' | 'level' = 'level';
  private firstTransition = true;
  private rewardedReadyAt = 0;
  private projected = new THREE.Vector3();

  constructor(canvas: HTMLCanvasElement, ui: HTMLElement, private portal: Portal, private store: Store) {
    this.renderer = new Renderer(canvas);
    this.scene = new ShadowScene(ATTIC, TIERS[this.tier].shadowMap);
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

    // DOM order = stacking order: HUD under the menus, panels on top.
    ui.append(this.vignette);
    this.arrow = new ObjectArrow(ui);
    this.hud = new Hud(ui);
    this.menu = new MainMenu(ui);
    this.worlds = new WorldSelect(ui);
    this.album = new Album(ui);
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
    this.monitor.onSlow = () => this.downgrade();

    // UI wiring. Every button gets the paper-tick click sound.
    ui.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.audio.click();
    });
    this.win.onNext = () => this.next();
    this.win.onReplay = () => this.transition(this.index);
    this.win.onMenu = () => this.showMenu();
    this.win.onStar = (i) => this.audio.star(i);
    this.hud.pauseBtn.addEventListener('click', () => this.openPause());
    this.hud.muteBtn.addEventListener('click', () => this.toggleMute());
    this.hud.hintBtn.addEventListener('click', () => this.openHints());

    this.menu.onPlay = () => this.openWorlds();
    this.menu.onMode = (key) => {
      if (key === 'album') this.album.show(WORLDS[0].name, WORLDS[0].levels, (id) => this.store.isSolved(id), ATTIC.accent);
      else this.showMenu();
    };
    this.menu.settingsBtn.addEventListener('click', () => this.pause.show(this.store.data.settings, true));
    this.menu.muteBtn.addEventListener('click', () => this.toggleMute());
    this.album.onBack = () => this.showMenu();
    this.worlds.onPick = (id) => this.openLevels(WORLDS.find((w) => w.id === id)!, 'worlds');
    this.worlds.onBack = () => this.showMenu();
    this.levelSelect.onPick = (i) => {
      this.inMenus = false;
      this.play(i);
    };
    this.levelSelect.onClose = () => {
      if (this.levelSelectFrom === 'worlds') this.openWorlds();
      else this.level.resume();
    };

    this.pause.onResume = () => this.level.resume();
    this.pause.onRestart = () => this.play(this.index);
    this.pause.onLevels = () => this.openLevels(WORLDS[0], 'level');
    this.pause.onMenu = () => this.showMenu();
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
    const next = firstUnsolved === -1 ? 0 : firstUnsolved;
    const returning = LEVELS.some((l) => this.store.isSolved(l.id));
    const loginBulb = this.store.claimDailyLogin();
    if (param >= 1 && param <= LEVELS.length) this.play(param - 1);
    else if (returning) {
      // Return visit: the menu, with the next level already built behind it.
      this.index = next;
      this.level.hintsEnabled = this.hintsUnlocked(next);
      this.level.start(LEVELS[next], true);
      this.showMenu();
    } else this.play(next);
    if (loginBulb) setTimeout(() => this.hud.toast(`+${BULBS.dailyLogin} Bulb`), 900);
    this.renderer.gl.setAnimationLoop(() => this.frame());
  }

  // --- settings & quality -----------------------------------------------------------------------

  private applySettings(s: SaveData['settings']) {
    this.input.sensitivity = s.sensitivity;
    this.audio.setVolumes(s.music, s.sfx);
    this.audio.setMuted(s.muted);
    this.hud.setMuted(s.muted);
    this.menu.setMuted(s.muted);
    this.level.reduceMotion = s.reduceMotion;
    this.applyQuality(s.quality === 'auto' ? this.autoTier : s.quality);
  }

  private applyQuality(tier: Tier) {
    const first = this.tier !== tier || !this.vignette.dataset.init;
    this.tier = tier;
    const spec = TIERS[tier];
    const cssVignette = this.renderer.setTier(spec, this.scene.scene);
    this.scene.setShadowQuality(spec.shadowMap, spec.shadowRadius / 3);
    this.vignette.style.display = cssVignette ? '' : 'none';
    this.vignette.dataset.init = '1';
    this.monitor.reset();
    if (first && import.meta.env.DEV) console.debug('[event] quality_tier', { tier, auto: this.store.data.settings.quality === 'auto' });
  }

  /** Auto mode only: drop one tier when frames stay slow. Never upgrades on its own. */
  private downgrade() {
    if (this.store.data.settings.quality !== 'auto') return;
    const lower = lowerTier(this.tier);
    if (!lower) return;
    this.autoTier = lower;
    this.applyQuality(lower);
  }

  private toggleMute() {
    const s = this.store.data.settings;
    s.muted = !s.muted;
    this.applySettings(s);
    this.store.save();
  }

  // --- flow -------------------------------------------------------------------------------------

  private unlocked(i: number) {
    return i === 0 || this.store.isSolved(LEVELS[i - 1].id);
  }

  private hintsUnlocked(i: number) {
    return i + 1 >= HINTS_FROM_LEVEL || this.store.isSolved(LEVELS[HINTS_FROM_LEVEL - 2].id);
  }

  private play(i: number) {
    this.inMenus = false;
    this.index = i;
    this.win.hide();
    this.level.hintsEnabled = this.hintsUnlocked(i);
    this.hud.setBulbs(this.store.data.bulbs);
    this.level.start(LEVELS[i]);
    this.monitor.reset();
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
    if (this.index >= LEVELS.length - 1) this.showMenu();
    else this.transition(this.index + 1);
  }

  private showMenu() {
    this.inMenus = true;
    this.level.suspend();
    this.win.hide();
    this.arrow.hide();
    this.hud.showHand(null);
    this.hud.visible = false;
    const solved = (id: string) => this.store.isSolved(id);
    const mode = (key: 'daily' | 'endless' | 'zen', label: string): ModeTile => {
      const u = MODE_UNLOCKS[key];
      // Modes arrive in Phase 3: unlocked ones say so instead of opening.
      return { key, label, note: solved(u.levelId) ? 'Coming soon' : u.text, enabled: false };
    };
    this.menu.show(this.store.data.bulbs, [
      mode('daily', 'Daily'),
      mode('endless', 'Endless'),
      mode('zen', 'Zen'),
      { key: 'album', label: 'Album', note: `${LEVELS.filter((l) => solved(l.id)).length} / ${LEVELS.length}`, enabled: true },
    ]);
  }

  private openWorlds() {
    this.inMenus = true;
    const total = this.store.totalStars(LEVELS.map((l) => l.id));
    this.worlds.show(
      WORLDS.map((w) => {
        const unlocked =
          w.unlock.kind === 'start' ||
          (w.unlock.kind === 'stars' && total >= w.unlock.stars) ||
          (w.unlock.kind === 'world' && WORLDS[w.unlock.world - 1].levels.every((l) => this.store.isSolved(l.id)));
        const built = w.levels.length > 0;
        return {
          id: w.id,
          name: w.name,
          colors: w.colors,
          stars: this.store.totalStars(w.levels.map((l) => l.id)),
          maxStars: w.levels.length * 3,
          open: unlocked && built,
          note: unlocked ? 'Coming soon' : unlockText(w.unlock),
        };
      }),
      total,
    );
  }

  private openLevels(world: WorldDef, from: 'worlds' | 'level') {
    this.levelSelectFrom = from;
    if (from === 'level') this.level.suspend();
    this.win.hide();
    this.levelSelect.show(
      world.name,
      world.levels.map((l) => {
        const i = LEVELS.indexOf(l);
        return { level: l, stars: this.store.stars(l.id), unlocked: this.unlocked(i), current: i === this.index };
      }),
    );
  }

  // --- ads, hints, Bulbs ------------------------------------------------------------------------

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
    if (!this.level.playing || !this.level.hintsEnabled || this.inMenus) return;
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
    if (!this.level.playing || this.inMenus) return;
    this.level.suspend();
    this.pause.show(this.store.data.settings);
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
    if (this.inAd || this.inMenus) return;
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
    const menuOpen = this.inMenus || this.levelSelect.open || this.pause.open || this.hintPanel.open || this.inAd;
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
    const raw = this.timer.getDelta();
    const dt = Math.min(0.05, raw);
    if (this.hidden) return;
    if (!this.inMenus) this.monitor.sample(raw);
    this.elapsed += dt;
    this.tweens.update(dt);
    this.level.update(dt);
    this.win.update(dt);
    this.scene.update(dt, this.elapsed);
    // Behind the menus the object turns slowly, as a teaser.
    if (this.inMenus) this.scene.objectRoot.rotateY(dt * 0.35);
    this.placeArrow();
    this.renderer.render(this.scene.scene, dt);
  }
}
