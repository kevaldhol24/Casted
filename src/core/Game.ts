import * as THREE from 'three';
import { LevelController, SCORE_SIZE, type LevelResult } from '../levels/LevelController';
import { dailyLevel, dailyNumber, shareText, utcDate } from '../levels/Daily';
import { ENDLESS_CONTINUE_S, EndlessRun } from '../levels/Endless';
import { LevelLoader } from '../levels/LevelLoader';
import { HINTS_FROM_LEVEL, LEVELS, levelPieces, type LevelDef } from '../levels/levels';
import { MODE_UNLOCKS, WORLDS, unlockText, type WorldDef } from '../levels/worlds';
import type { Portal } from '../portal/Portal';
import { MaskRenderer } from '../shadow/MaskRenderer';
import { ATTIC, OBJECT_POS, ShadowScene, paletteFor } from '../shadow/ShadowScene';
import { Album } from '../ui/Album';
import { DebugView } from '../ui/DebugView';
import { el, ICONS } from '../ui/dom';
import { ControlsHint } from '../ui/ControlsHint';
import { HintPanel } from '../ui/HintPanel';
import { Hud } from '../ui/Hud';
import { LevelSelect } from '../ui/LevelSelect';
import { MainMenu, type ModeTile } from '../ui/MainMenu';
import { ObjectArrow } from '../ui/ObjectArrow';
import { PausePanel } from '../ui/PausePanel';
import { ResultCard } from '../ui/ResultCard';
import { WinScreen } from '../ui/WinScreen';
import { WorldSelect } from '../ui/WorldSelect';
import { Tweens } from '../util/tween';
import { Arcball } from './Arcball';
import { GameAudio } from './Audio';
import { Input } from './Input';
import { FrameMonitor, TIERS, detectTier, lowerTier, type Tier } from './Quality';
import type { Analytics, Placement } from '../analytics/Analytics';
import { Renderer } from './Renderer';
import { BULBS, HINT_COST, type HintTier, type SaveData, Store } from './Store';

/** After a rewarded video, the video buttons stay off this long. CrazyGames paces its own ads, so none there. */
const REWARDED_COOLDOWN_S = import.meta.env.MODE === 'crazygames' ? 0 : 60;
const NO_VIDEO = 'No video available right now — try again soon.';

type Mode = 'campaign' | 'daily' | 'endless';
const flame = (n: number) => `<span class="flame">${ICONS.flame}</span>${n}`;

/**
 * Main loop and screen flow (design doc): Loading → Main menu → World / level select → Level play → Win → next.
 * A first visit skips the menu and lands in level 1. Also owns hints/Bulbs, pause/settings, ads and quality.
 */
export class Game {
  private renderer: Renderer;
  private scene: ShadowScene;
  private level: LevelController;
  private loader = new LevelLoader(ATTIC.objects);
  /** Bumped per level request, so a slow model load can't replace a level picked after it. */
  private loadToken = 0;
  private hud: Hud;
  private arrow: ObjectArrow;
  private menu: MainMenu;
  private worlds: WorldSelect;
  private album: Album;
  private win: WinScreen;
  /** Daily result and Endless game-over card. */
  private card: ResultCard;
  private levelSelect: LevelSelect;
  private hintPanel: HintPanel;
  private pause: PausePanel;
  private controls: ControlsHint;
  private vignette = el('div', 'css-vignette');
  /** Covers the whole UI during an ad so no button or the lamp pad can be pressed. */
  private adBlock = el('div', 'ad-block');
  private input: Input;
  private audio = new GameAudio();
  private tweens = new Tweens();
  private timer = new THREE.Timer();
  private monitor = new FrameMonitor();
  private autoTier: Tier = detectTier();
  private tier: Tier = this.autoTier;
  private elapsed = 0;
  private index = 0;
  private mode: Mode = 'campaign';
  private run: EndlessRun | null = null;
  private endlessNewBest = false;
  /** The Daily Shadow's UTC date (fixed for the session; ?date=YYYY-MM-DD in dev builds). */
  private today = utcDate();
  private hidden = false;
  private inAd = false;
  private inMenus = false;
  /** Where the level grid's Back button goes: the world list (from the menu) or back into the level. */
  private levelSelectFrom: 'worlds' | 'level' = 'level';
  private firstTransition = true;
  private rewardedReadyAt = 0;
  private projected = new THREE.Vector3();
  private scaleTmp = new THREE.Vector3();

  constructor(
    canvas: HTMLCanvasElement,
    ui: HTMLElement,
    private portal: Portal,
    private store: Store,
    private analytics: Analytics,
  ) {
    this.renderer = new Renderer(canvas);
    this.scene = new ShadowScene(ATTIC, TIERS[this.tier].shadowMap);
    const mask = new MaskRenderer(this.renderer.gl, this.scene.scene, 1.45);
    const dualMasks: [MaskRenderer, MaskRenderer] = [
      new MaskRenderer(this.renderer.gl, this.scene.scene, 1.45),
      new MaskRenderer(this.renderer.gl, this.scene.scene, 1.45),
    ];
    this.fitView();

    // DOM order = stacking order: HUD under the menus, panels on top.
    ui.append(this.vignette);
    this.arrow = new ObjectArrow(ui);
    this.hud = new Hud(ui);
    this.menu = new MainMenu(ui);
    this.worlds = new WorldSelect(ui);
    this.album = new Album(ui);
    this.win = new WinScreen(ui);
    this.card = new ResultCard(ui);
    this.levelSelect = new LevelSelect(ui);
    this.hintPanel = new HintPanel(ui);
    this.pause = new PausePanel(ui);
    this.controls = new ControlsHint(ui);
    ui.append(this.adBlock);
    const debug = new URLSearchParams(location.search).has('debug') ? new DebugView(ui, SCORE_SIZE) : null;

    const arcball = new Arcball(this.scene.objectRoot, mask.camera);
    this.input = new Input(canvas, {
      onGrab: () => {
        this.level.grab();
        this.analytics.track({ type: 'input', kind: 'grab' });
      },
      // Light-only levels (World 3): a drag anywhere moves the lamp instead of turning the object.
      onDrag: (i) => {
        if (this.level.lightOnly) {
          this.level.dragLamp(i);
          this.controls.used('lamp');
          this.analytics.track({ type: 'input', kind: 'lamp' });
        } else {
          arcball.drag(i);
          this.controls.used(i.roll && !i.yaw && !i.pitch ? 'twist' : 'turn');
          this.analytics.track({ type: 'drag', yaw: i.yaw, pitch: i.pitch, roll: i.roll });
        }
      },
      onRelease: () => arcball.release(),
      onKey: (code) => {
        // Only keys that turn the object or move the lamp count as acting (not Tab, P, H).
        if (/^(Key[WASDQE]|Arrow)/.test(code)) this.analytics.track({ type: 'input', kind: 'key' });
        if (this.level.playing) {
          if (/^Key[QE]$/.test(code)) this.controls.used('twist');
          else if (/^Key[WASD]$/.test(code)) this.controls.used('turn');
          else if (code.startsWith('Arrow')) this.controls.used(this.level.hasLight ? 'lamp' : 'turn');
          else if (code === 'Tab') this.controls.used('switch');
        }
        this.onKey(code);
      },
    });

    this.level = new LevelController({
      renderer: this.renderer,
      scene: this.scene,
      mask,
      dualMasks,
      arcball,
      input: this.input,
      hud: this.hud,
      arrow: this.arrow,
      audio: this.audio,
      tweens: this.tweens,
      portal,
      debug,
    });
    this.level.onComplete = (r) => this.onComplete(r);
    this.level.onPrompt = (prompt) => this.analytics.track({ type: 'prompt', prompt });
    this.level.onSwitch = () => this.analytics.track({ type: 'switch' });
    this.level.onStart = () => {
      const ctx = this.level.controls;
      this.controls.setLevel(ctx);
      const tip = this.controls.touchTip(ctx);
      if (tip && !this.level.isSuspended) this.hud.toast(tip, 3.2);
    };
    this.applySettings(store.data.settings);
    // CrazyGames' muteAudio setting wins over the in-game sound toggle.
    portal.onForcedMute?.((m) => this.audio.setForcedMute(m));
    this.monitor.onSlow = () => this.downgrade();

    // UI wiring. Every button gets the paper-tick click sound.
    ui.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) this.audio.click();
    });
    this.win.onNext = (auto) => {
      this.analytics.track({ type: 'win-action', action: auto ? 'auto-advance' : 'next' });
      this.next();
    };
    this.win.onReplay = () => {
      this.analytics.track({ type: 'win-action', action: 'replay' });
      this.transition(this.index);
    };
    this.win.onMenu = () => {
      this.analytics.track({ type: 'win-action', action: 'menu' });
      this.showMenu();
    };
    this.card.onHide = () => this.analytics.track({ type: 'offers-closed' });
    this.win.onStar = (i) => this.audio.star(i);
    this.card.onStar = (i) => this.audio.star(i);
    this.hud.pauseBtn.addEventListener('click', () => this.openPause());
    this.hud.muteBtn.addEventListener('click', () => this.toggleMute());
    this.hud.hintBtn.addEventListener('click', () => this.tapHint());
    this.hud.switchBtn.addEventListener('click', () => {
      if (!this.level.playing) return;
      this.level.cycle();
      this.controls.used('switch');
    });
    this.hud.onLight = (x, y) => {
      this.level.setLampPad(x, y);
      this.controls.used('lamp');
      this.analytics.track({ type: 'input', kind: 'lamp' });
    };
    this.hud.onLightGrab = () => this.level.grabLamp();

    this.menu.onPlay = () => this.openWorlds();
    this.menu.onMode = (key) => {
      if (key === 'album')
        this.album.show(
          WORLDS.filter((w) => w.levels.length).map((w) => ({ name: w.name, levels: w.levels, color: paletteFor(w.id).accent })),
          (id) => this.store.isSolved(id),
        );
      else if (key === 'daily') this.openDaily();
      else if (key === 'endless') this.adBreak(null).then(() => this.startEndless());
      else this.showMenu();
    };
    this.menu.settingsBtn.addEventListener('click', () => this.pause.show(this.store.data.settings, true));
    this.menu.muteBtn.addEventListener('click', () => this.toggleMute());
    this.album.onBack = () => this.showMenu();
    this.worlds.onPick = (id) => this.openLevels(WORLDS.find((w) => w.id === id)!, 'worlds');
    this.worlds.onBack = () => this.showMenu();
    this.levelSelect.onPick = async (level) => {
      if (this.levelSelectFrom === 'level') this.analytics.track({ type: 'end', outcome: 'quit-levels', bulbs: this.store.data.bulbs });
      this.inMenus = false;
      const i = LEVELS.indexOf(level);
      await this.adBreak(i);
      this.play(i);
    };
    this.levelSelect.onClose = () => {
      if (this.levelSelectFrom === 'worlds') this.openWorlds();
      else this.unpause();
    };

    this.pause.onResume = () => this.unpause();
    this.pause.onRestart = async () => {
      this.analytics.track({ type: 'end', outcome: 'restart', bulbs: this.store.data.bulbs });
      await this.adBreak(this.mode === 'campaign' ? this.index : null);
      if (this.mode === 'daily') this.playDaily();
      else if (this.mode === 'endless') this.startEndless();
      else this.play(this.index);
    };
    this.pause.onLevels = () => this.openLevels(WORLDS.find((w) => w.id === this.level.level.world) ?? WORLDS[0], 'level');
    this.pause.onMenu = () => this.showMenu();
    this.pause.onSettings = (s) => {
      this.applySettings(s);
      this.store.save();
    };
    this.hintPanel.onPick = (tier, withAd) => {
      this.analytics.track({ type: 'offers-closed' });
      this.buyHint(tier, withAd);
    };
    this.hintPanel.onGetBulbs = () => {
      this.analytics.track({ type: 'offers-closed' });
      this.analytics.track({ type: 'hint-panel', action: 'close' });
      this.watchForBulbs();
    };
    this.hintPanel.onClose = () => {
      this.analytics.track({ type: 'offers-closed' });
      this.analytics.track({ type: 'hint-panel', action: 'close' });
      this.level.resume();
    };

    document.addEventListener('visibilitychange', () => this.setHidden(document.hidden));
  }

  start() {
    const params = new URLSearchParams(location.search);
    const param = Number(params.get('level'));
    const date = params.get('date');
    if (import.meta.env.DEV && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) this.today = date;
    const firstUnsolved = LEVELS.findIndex((l) => !this.store.isSolved(l.id));
    const next = firstUnsolved === -1 ? 0 : firstUnsolved;
    const returning = LEVELS.some((l) => this.store.isSolved(l.id));
    const loginBulb = this.store.claimDailyLogin();
    // A shared Daily link (shareDaily) opens today's Daily, or its result card if it's already solved.
    const dailyLink = !!this.portal.getURLParam?.('daily');
    if (params.get('mode') === 'daily') this.playDaily();
    else if (params.get('mode') === 'endless') this.startEndless();
    else if (param >= 1 && param <= LEVELS.length) this.play(param - 1);
    else if (dailyLink && !this.dailyDone()) this.playDaily();
    else if (returning || dailyLink) {
      // Return visit: the menu, with the next level already built behind it.
      this.index = next;
      this.level.hintsEnabled = this.hintsUnlocked(next);
      this.showMenu();
      this.load(LEVELS[next], true);
      if (dailyLink) this.showDailyResult(0);
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
    if (first) this.analytics.track({ type: 'quality', tier });
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
    this.enter('campaign');
    this.index = i;
    this.level.hintsEnabled = this.hintsUnlocked(i);
    this.load(LEVELS[i], false);
  }

  /**
   * Keep the floating object and every solved-shadow area on screen (two on dual-shadow levels). `objectScale`:
   * the level's object size (dual-shadow objects are bigger).
   */
  private fitView(objectScale = 1) {
    const r = 1.25;
    const ro = r * Math.max(1, objectScale);
    const v = (p: THREE.Vector3, x: number, y: number) => p.clone().add(new THREE.Vector3(x, y, 0));
    const points = [v(OBJECT_POS, -ro, -ro), v(OBJECT_POS, ro, -ro)];
    for (const sc of this.scene.shadowCenters()) points.push(v(sc, -r, r), v(sc, r, r), v(sc, -r, -r), v(sc, r, -r));
    this.renderer.setFocus(points);
    // The fog fades the room's far edges; a camera backed off to fit two shadows (portrait) mustn't sink into it.
    this.scene.fogFrom(this.renderer.distance);
  }

  /** Leave whatever was on screen and set up the HUD for a mode. */
  private enter(mode: Mode) {
    this.mode = mode;
    this.inMenus = false;
    this.win.hide();
    this.card.hide();
    this.hud.setBulbs(this.store.data.bulbs);
    this.hud.setTimer(mode === 'endless' && this.run ? this.run.timeLeft : null);
  }

  /**
   * Fetch/build the level's object, then start it — unless another level was requested meanwhile.
   * `endlessTarget`: the next target of a running Endless run (the same analytics attempt).
   */
  private async load(level: LevelDef, suspended: boolean, endlessTarget = false) {
    const token = ++this.loadToken;
    try {
      const palette = paletteFor(level.world);
      const objs = await this.loader.load(level, palette.objects);
      if (token !== this.loadToken) return objs.forEach((o) => o.dispose());
      this.scene.setWorld(palette);
      // The player may have opened the menu while a model was downloading.
      this.level.start(level, objs, suspended || this.inMenus);
      this.fitView(levelPieces(level)[0].scale);
      if (endlessTarget) this.analytics.track({ type: 'target', level });
      else
        this.analytics.track({
          type: 'attempt',
          level,
          mode: this.mode,
          startIou: this.level.score,
          bulbs: this.store.data.bulbs,
          replay: this.mode === 'daily' ? this.dailyDone() : this.mode === 'campaign' && this.store.isSolved(level.id),
          hintButton: this.level.hintsEnabled,
          ...(this.mode === 'daily' ? { dailyNo: dailyNumber(this.today), streak: this.store.dailyStreak(this.today) } : {}),
        });
      this.updateLabel();
      this.monitor.reset();
      if (this.mode === 'campaign') this.loader.preload(LEVELS[LEVELS.indexOf(level) + 1]);
    } catch (e) {
      console.error(`[level ${level.id}] failed to load`, e);
      if (token === this.loadToken) this.hud.toast("Couldn't load this level — check your connection", 3);
    }
  }

  private async transition(i: number) {
    await this.adBreak(i);
    this.play(i);
  }

  /**
   * A midgame ad before every gameplayStart the player asked for: next level, retry, unpause,
   * a level from the grid, a mode from the menu. Not before campaign levels 1-2 (`levelIndex` 0-1; null =
   * Daily / Endless), never on the session's first transition, and the SDK decides whether an ad plays
   * (CrazyGames enforces its own ~3 min cooldown and answers `adCooldown` in between).
   * Closing the hint panel, coming back to the tab and resuming after a rewarded video don't ask.
   */
  private async adBreak(levelIndex: number | null) {
    const allowed = !this.firstTransition && (levelIndex === null || levelIndex + 1 >= 3);
    this.firstTransition = false;
    if (!allowed) return;
    const t0 = performance.now();
    let shown = false;
    await this.runAd(() =>
      this.portal.midgame({
        onStart: () => {
          shown = true;
          this.audio.setAdMuted(true);
        },
      }),
    );
    this.analytics.track({ type: 'midgame', shown, durMs: performance.now() - t0 });
  }

  /** Back into the level from the pause menu or the level grid. */
  private async unpause() {
    if (!this.level.isSuspended) return this.level.resume();
    await this.adBreak(this.mode === 'campaign' ? this.index : null);
    if (!this.inMenus && !this.pause.open && !this.levelSelect.open) this.level.resume();
  }

  private next() {
    if (this.index >= LEVELS.length - 1) this.showMenu();
    else this.transition(this.index + 1);
  }

  private showMenu() {
    this.analytics.track({ type: 'menu' });
    this.inMenus = true;
    this.level.suspend();
    this.win.hide();
    this.card.hide();
    this.arrow.hide();
    this.hud.showHand(null);
    this.hud.setTimer(null);
    this.hud.visible = false;
    const solved = (id: string) => this.store.isSolved(id);
    const mode = (key: 'daily' | 'endless' | 'zen', label: string, note: string | null): ModeTile => {
      const u = MODE_UNLOCKS[key];
      const open = solved(u.levelId);
      // Zen arrives later: unlocked, it still says so instead of opening.
      return { key, label, note: open ? (note ?? 'Coming soon') : u.text, enabled: open && note !== null };
    };
    const streak = this.store.dailyStreak(this.today);
    const daily = `${this.dailyDone() ? 'Solved' : `#${dailyNumber(this.today)}`}${streak ? ` · ${flame(streak)}` : ''}`;
    const best = this.store.data.endlessBest;
    this.menu.show(this.store.data.bulbs, [
      mode('daily', 'Daily', daily),
      mode('endless', 'Endless', best ? `Best ${best}` : 'New'),
      mode('zen', 'Zen', null),
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

  /**
   * Pause, mute and block all input (keys, canvas, every button) for the whole ad request. Everything is
   * restored when the request settles, whether or not an ad actually started.
   */
  private async runAd<T>(request: () => Promise<T>): Promise<T> {
    this.inAd = true;
    this.input.enabled = false;
    this.adBlock.classList.add('show');
    this.audio.setAdMuted(true);
    this.level.suspend();
    try {
      return await request();
    } finally {
      this.audio.setAdMuted(false);
      this.adBlock.classList.remove('show');
      this.input.enabled = true;
      this.inAd = false;
    }
  }

  private async rewarded(placement: Placement): Promise<boolean> {
    this.analytics.track({ type: 'offer', placement, action: 'interact' });
    if (!this.portal.rewardedAvailable() || performance.now() < this.rewardedReadyAt) {
      this.hud.toast(NO_VIDEO, 2.5);
      this.analytics.track({ type: 'offer', placement, action: 'result', result: 'no-fill', durMs: 0 });
      return false;
    }
    const t0 = performance.now();
    let ok = false;
    let failed = false;
    try {
      ok = await this.runAd(() => this.portal.rewarded({ onStart: () => this.audio.setAdMuted(true) }));
    } catch {
      failed = true;
    }
    this.analytics.track({ type: 'offer', placement, action: 'result', result: ok ? 'rewarded' : failed ? 'error' : 'no-fill', durMs: performance.now() - t0 });
    if (ok) this.rewardedReadyAt = performance.now() + REWARDED_COOLDOWN_S * 1000;
    else this.hud.toast(NO_VIDEO, 2.5);
    return ok;
  }

  /** The HUD's hint button (or H). */
  private tapHint() {
    if (!this.level.playing || !this.level.hintsEnabled || this.inMenus) return;
    this.analytics.track({ type: 'hint-button' });
    this.openHints();
  }

  private openHints() {
    if (!this.level.playing || !this.level.hintsEnabled || this.inMenus) return;
    this.level.suspend();
    const offers = this.hintPanel.show({
      bulbs: this.store.data.bulbs,
      freeHint: !this.store.data.freeHintUsed,
      adReady: this.portal.rewardedAvailable() && performance.now() >= this.rewardedReadyAt,
      adCooldown: Math.max(0, this.rewardedReadyAt - performance.now()) / 1000,
    });
    this.analytics.track({ type: 'hint-panel', action: 'open' });
    for (const placement of offers) this.analytics.track({ type: 'offer', placement, action: 'visible' });
  }

  private async buyHint(tier: HintTier, withAd: boolean) {
    let paid = false;
    let paidWith: 'free' | 'bulb' | 'ad' = withAd ? 'ad' : 'bulb';
    if (withAd) paid = await this.rewarded('hint-reveal');
    else if (!this.store.data.freeHintUsed) {
      this.store.data.freeHintUsed = true;
      this.store.save();
      paid = true;
      paidWith = 'free';
    } else paid = this.store.spendBulbs(HINT_COST[tier]);
    this.hud.setBulbs(this.store.data.bulbs);
    this.level.resume();
    if (paid) {
      this.analytics.track({ type: 'hint', tier, paid: paidWith });
      this.level.useHint(tier);
    }
    this.analytics.track({ type: 'hint-panel', action: 'close' });
  }

  private async watchForBulbs() {
    if (await this.rewarded('bulbs')) {
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
    if (this.mode === 'daily') return this.dailyComplete(r);
    if (this.mode === 'endless') return this.endlessSolved(r);
    const earned = this.store.recordSolve(r.level.id, r.stars, r.time);
    this.hud.setBulbs(this.store.data.bulbs);
    this.analytics.track({ type: 'solved', stars: r.stars, timeS: r.time, bulbs: this.store.data.bulbs });
    this.win.show({
      title: r.level.targetName,
      stars: r.stars,
      time: r.time,
      parTime: r.level.parTime,
      isLast: this.index >= LEVELS.length - 1,
      bulbsEarned: earned,
      bulbFor3Stars: this.store.stars(r.level.id) < 3,
    });
  }

  // --- Daily Shadow -------------------------------------------------------------------------------

  private dailyDone() {
    return this.store.data.daily.last?.date === this.today;
  }

  /** From the menu: today's puzzle, or today's result card if it's already solved. */
  private async openDaily() {
    if (this.dailyDone()) return this.showDailyResult(0);
    await this.adBreak(null);
    this.playDaily();
  }

  private playDaily() {
    this.enter('daily');
    this.level.hintsEnabled = this.store.isSolved(LEVELS[HINTS_FROM_LEVEL - 2].id);
    this.load(dailyLevel(this.today), false);
  }

  private dailyComplete(r: LevelResult) {
    const earned = this.store.recordDaily(this.today, r.stars, r.time, r.hintsUsed);
    this.hud.setBulbs(this.store.data.bulbs);
    this.analytics.track({ type: 'solved', stars: r.stars, timeS: r.time, bulbs: this.store.data.bulbs });
    this.showDailyResult(earned);
  }

  private showDailyResult(earned: number) {
    const res = this.store.data.daily.last!;
    const t = Math.round(res.time);
    const hints = res.hints === 0 ? 'no hints' : res.hints === 1 ? '1 hint' : `${res.hints} hints`;
    const streak = this.store.dailyStreak(this.today);
    const bulbs = earned > 0 ? ` · +${earned} <span class="bulb-inline">${ICONS.bulb}</span>` : '';
    const shields = this.store.data.daily.shields;
    const adReady = this.portal.rewardedAvailable() && performance.now() >= this.rewardedReadyAt;
    this.card.show({
      title: `Daily #${dailyNumber(this.today)} · ${dailyLevel(this.today).targetName}`,
      stars: res.stars,
      lines: [
        `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')} · ${hints}`,
        `${flame(streak)} day streak${shields ? ` · ${shields} shield${shields > 1 ? 's' : ''}` : ''}${bulbs}`,
      ],
      buttons: [
        { label: 'Share', primary: true, onClick: () => this.shareDaily() },
        ...(res.stars < 3 && !res.retried
          ? [{ label: 'Try for 3 stars', video: true, disabled: !adReady, onClick: () => this.retryDaily() }]
          : []),
        ...(!res.doubled ? [{ label: `+${BULBS.dailySolve} Bulbs`, video: true, disabled: !adReady, onClick: () => this.doubleDaily() }] : []),
        { label: 'Menu', onClick: () => this.showMenu() },
      ],
    });
    if (adReady && res.stars < 3 && !res.retried) this.analytics.track({ type: 'offer', placement: 'daily-retry', action: 'visible' });
    if (adReady && !res.doubled) this.analytics.track({ type: 'offer', placement: 'daily-double', action: 'visible' });
  }

  private async shareDaily() {
    this.analytics.track({ type: 'daily-share' });
    const res = this.store.data.daily.last!;
    const text = shareText(this.today, res.stars, res.time, res.hints, await this.dailyLink());
    this.hud.toast((await copyText(text)) ? 'Copied — paste it anywhere' : "Couldn't copy", 2);
  }

  /** The portal's link to today's Daily (CrazyGames: an invite link to its game page with daily=n); this page otherwise. */
  private async dailyLink() {
    try {
      if (this.portal.shareableURL) return await this.portal.shareableURL({ daily: dailyNumber(this.today) });
    } catch {}
    return location.origin + location.pathname;
  }

  /** Rewarded "second attempt at 3 stars": once per day; the better result is kept. */
  private async retryDaily() {
    this.card.hide();
    if (await this.rewarded('daily-retry')) {
      this.store.data.daily.last!.retried = true;
      this.store.save();
      this.playDaily();
    } else this.showDailyResult(0);
  }

  /** Rewarded "double reward": the base Bulbs were already paid. */
  private async doubleDaily() {
    this.card.hide();
    if (await this.rewarded('daily-double')) {
      this.store.data.daily.last!.doubled = true;
      this.store.addBulbs(BULBS.dailySolve);
      this.hud.setBulbs(this.store.data.bulbs);
      this.hud.toast(`+${BULBS.dailySolve} Bulbs`);
    }
    this.showDailyResult(0);
  }

  // --- Endless ------------------------------------------------------------------------------------

  private startEndless() {
    this.run = new EndlessRun();
    this.enter('endless');
    this.level.hintsEnabled = false;
    this.load(this.run.nextTarget(), false);
  }

  private endlessSolved(r: LevelResult) {
    const run = this.run!;
    const g = run.recordSolve(r.time);
    this.analytics.track({ type: 'endless-solve', ms: r.time * 1000, score: run.score, mult: g.mult });
    this.hud.toast(`+${g.points}${g.mult > 1 ? ` (×${g.mult})` : ''} · +${g.bonus}s`);
    this.hud.setTimer(run.timeLeft);
    this.load(run.nextTarget(), false, true);
  }

  /** Called every frame in Endless: the timer runs only while the player can actually turn the object. */
  private tickEndless(dt: number) {
    const run = this.run;
    if (!run || !this.level.running || this.card.open || this.inAd) return;
    run.timeLeft = Math.max(0, run.timeLeft - dt);
    this.hud.setTimer(run.timeLeft);
    if (run.timeLeft <= 0) this.endlessOver();
  }

  private endlessOver() {
    const run = this.run!;
    this.level.suspend();
    this.arrow.hide();
    this.hud.showHand(null);
    this.endlessNewBest = this.store.recordEndless(run.score);
    // CrazyGames' happytime is for rare highs (a new best), never for a plain level solve.
    if (this.endlessNewBest) this.portal.happyTime?.();
    this.analytics.track({ type: 'endless-over', score: run.score, solves: run.solved });
    this.showEndlessOver();
  }

  private showEndlessOver() {
    const run = this.run!;
    const adReady = this.portal.rewardedAvailable() && performance.now() >= this.rewardedReadyAt;
    this.card.show({
      title: "Time's up",
      lines: [
        `${run.score} points · ${run.solved} shadow${run.solved === 1 ? '' : 's'}`,
        this.endlessNewBest ? 'New best!' : `Best ${this.store.data.endlessBest}`,
      ],
      buttons: [
        { label: 'Play again', primary: true, onClick: () => this.endlessAgain() },
        ...(!run.continued ? [{ label: `+${ENDLESS_CONTINUE_S}s`, video: true, disabled: !adReady, onClick: () => this.endlessContinue() }] : []),
        { label: 'Menu', onClick: () => this.showMenu() },
      ],
    });
    if (adReady && !run.continued) this.analytics.track({ type: 'offer', placement: 'endless-continue', action: 'visible' });
  }

  /** Rewarded continue, once per run, offered only on the game-over card. */
  private async endlessContinue() {
    this.card.hide();
    const run = this.run!;
    if (await this.rewarded('endless-continue')) {
      this.analytics.track({ type: 'endless-continue' });
      run.continued = true;
      run.timeLeft = ENDLESS_CONTINUE_S;
      this.hud.setTimer(run.timeLeft);
      this.level.resume();
    } else this.showEndlessOver();
  }

  /** "Play again" requests a midgame, unless the player already watched a continue this run. */
  private async endlessAgain() {
    this.card.hide();
    if (!this.run?.continued) await this.adBreak(null);
    this.startEndless();
  }

  /** The HUD's level label: "1-4" in the campaign, the Daily number, or the Endless score. */
  private updateLabel() {
    if (this.mode === 'daily') this.hud.setLevel(`Daily #${dailyNumber(this.today)}`);
    else if (this.mode === 'endless' && this.run) this.hud.setLevel(`${this.run.score} pts${this.run.mult > 1 ? ` ×${this.run.mult}` : ''}`);
  }

  private onKey(code: string) {
    if (this.inAd || this.inMenus || this.card.open) return;
    // P, never Escape: Escape leaves fullscreen in the browser (CrazyGames restricted keys).
    if (code === 'KeyP') {
      if (this.levelSelect.open) {
        this.levelSelect.hide();
        this.unpause();
      } else if (this.hintPanel.open) {
        this.hintPanel.hide();
        this.level.resume();
      } else if (this.pause.open) {
        this.pause.hide();
        this.unpause();
      } else this.openPause();
    } else if (code === 'KeyH') this.tapHint();
    else if (code === 'Tab') this.level.cycle();
    else if (/^Digit[1-9]$/.test(code) && this.level.isAssembly && this.level.playing) this.level.select(Number(code.slice(5)) - 1);
  }

  private setHidden(h: boolean) {
    if (h === this.hidden) return;
    this.hidden = h;
    const menuOpen = this.inMenus || this.card.open || this.levelSelect.open || this.pause.open || this.hintPanel.open || this.inAd;
    if (h) this.level.suspend();
    else if (!menuOpen) this.level.resume();
  }

  /** Keep the on-object arrow centred on the active object's screen position. */
  private placeArrow() {
    const cam = this.renderer.camera;
    const pivot = this.level.activePivot;
    const at = pivot.getWorldPosition(this.projected);
    const dist = cam.position.distanceTo(at);
    const size = 2.6 * pivot.getWorldScale(this.scaleTmp).x;
    const p = at.project(cam);
    const w = this.renderer.canvas.clientWidth;
    const h = this.renderer.canvas.clientHeight;
    const pxPerUnit = h / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist);
    this.arrow.place((p.x * 0.5 + 0.5) * w, (-p.y * 0.5 + 0.5) * h, pxPerUnit * size);
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
    this.controls.setActive(this.level.running && !this.inAd && !this.inMenus);
    const keys = this.input.keyAxes();
    const arrows = this.input.arrowAxes();
    this.analytics.track({
      type: 'tick',
      dt,
      iou: this.level.score,
      running: this.level.running,
      suspended: this.level.isSuspended,
      lamp: this.level.lampAngles,
      busy: this.input.dragging || this.hud.lightDragging || !!(keys.yaw || keys.pitch || keys.roll || arrows.x || arrows.y),
    });
    if (this.mode === 'endless') this.tickEndless(dt);
    this.win.update(dt);
    this.scene.update(dt, this.elapsed);
    // Behind the menus the object turns slowly, as a teaser.
    if (this.inMenus) this.scene.objectRoot.rotateY(dt * 0.35);
    this.placeArrow();
    this.renderer.render(this.scene.scene, dt);
  }
}

/** Clipboard API first; the old textarea + execCommand path for insecure contexts and older WebViews. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  }
}
