import * as THREE from 'three';
import { LevelController, SCORE_SIZE, type LevelResult } from '../levels/LevelController';
import { dailyLevel, dailyNumber, shareText, utcDate } from '../levels/Daily';
import { ENDLESS_CONTINUE_S, EndlessRun } from '../levels/Endless';
import { LevelLoader } from '../levels/LevelLoader';
import { HINTS_FROM_LEVEL, LEVELS, type LevelDef } from '../levels/levels';
import { MODE_UNLOCKS, WORLDS, unlockText, type WorldDef } from '../levels/worlds';
import type { Portal } from '../portal/Portal';
import { MaskRenderer } from '../shadow/MaskRenderer';
import { ATTIC, OBJECT_POS, ShadowScene, paletteFor } from '../shadow/ShadowScene';
import { Album } from '../ui/Album';
import { DebugView } from '../ui/DebugView';
import { el, ICONS } from '../ui/dom';
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
import { Renderer } from './Renderer';
import { BULBS, HINT_COST, type HintTier, type SaveData, Store } from './Store';

/** After using the video option on the hint panel, it stays off this long. */
const REWARDED_COOLDOWN_S = 60;
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
    this.card = new ResultCard(ui);
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
    this.card.onStar = (i) => this.audio.star(i);
    this.hud.pauseBtn.addEventListener('click', () => this.openPause());
    this.hud.muteBtn.addEventListener('click', () => this.toggleMute());
    this.hud.hintBtn.addEventListener('click', () => this.openHints());
    this.hud.switchBtn.addEventListener('click', () => this.level.playing && this.level.cycle());

    this.menu.onPlay = () => this.openWorlds();
    this.menu.onMode = (key) => {
      if (key === 'album')
        this.album.show(
          WORLDS.filter((w) => w.levels.length).map((w) => ({ name: w.name, levels: w.levels, color: paletteFor(w.id).accent })),
          (id) => this.store.isSolved(id),
        );
      else if (key === 'daily') this.openDaily();
      else if (key === 'endless') this.startEndless();
      else this.showMenu();
    };
    this.menu.settingsBtn.addEventListener('click', () => this.pause.show(this.store.data.settings, true));
    this.menu.muteBtn.addEventListener('click', () => this.toggleMute());
    this.album.onBack = () => this.showMenu();
    this.worlds.onPick = (id) => this.openLevels(WORLDS.find((w) => w.id === id)!, 'worlds');
    this.worlds.onBack = () => this.showMenu();
    this.levelSelect.onPick = (level) => {
      this.inMenus = false;
      this.play(LEVELS.indexOf(level));
    };
    this.levelSelect.onClose = () => {
      if (this.levelSelectFrom === 'worlds') this.openWorlds();
      else this.level.resume();
    };

    this.pause.onResume = () => this.level.resume();
    this.pause.onRestart = () => {
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
    this.hintPanel.onPick = (tier, withAd) => this.buyHint(tier, withAd);
    this.hintPanel.onGetBulbs = () => this.watchForBulbs();
    this.hintPanel.onClose = () => this.level.resume();

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
    if (params.get('mode') === 'daily') this.playDaily();
    else if (params.get('mode') === 'endless') this.startEndless();
    else if (param >= 1 && param <= LEVELS.length) this.play(param - 1);
    else if (returning) {
      // Return visit: the menu, with the next level already built behind it.
      this.index = next;
      this.level.hintsEnabled = this.hintsUnlocked(next);
      this.showMenu();
      this.load(LEVELS[next], true);
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
    this.enter('campaign');
    this.index = i;
    this.level.hintsEnabled = this.hintsUnlocked(i);
    this.load(LEVELS[i], false);
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

  /** Fetch/build the level's object, then start it — unless another level was requested meanwhile. */
  private async load(level: LevelDef, suspended: boolean) {
    const token = ++this.loadToken;
    try {
      const palette = paletteFor(level.world);
      const objs = await this.loader.load(level, palette.objects);
      if (token !== this.loadToken) return objs.forEach((o) => o.dispose());
      this.scene.setWorld(palette);
      // The player may have opened the menu while a model was downloading.
      this.level.start(level, objs, suspended || this.inMenus);
      this.updateLabel();
      this.monitor.reset();
      if (this.mode === 'campaign') this.loader.preload(LEVELS[LEVELS.indexOf(level) + 1]);
    } catch (e) {
      console.error(`[level ${level.id}] failed to load`, e);
      if (token === this.loadToken) this.hud.toast("Couldn't load this level — check your connection", 3);
    }
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
    if (this.mode === 'daily') return this.dailyComplete(r);
    if (this.mode === 'endless') return this.endlessSolved(r);
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

  // --- Daily Shadow -------------------------------------------------------------------------------

  private dailyDone() {
    return this.store.data.daily.last?.date === this.today;
  }

  /** From the menu: today's puzzle, or today's result card if it's already solved. */
  private openDaily() {
    if (this.dailyDone()) this.showDailyResult(0);
    else this.playDaily();
  }

  private playDaily() {
    this.enter('daily');
    this.level.hintsEnabled = this.store.isSolved(LEVELS[HINTS_FROM_LEVEL - 2].id);
    this.load(dailyLevel(this.today), false);
  }

  private dailyComplete(r: LevelResult) {
    const earned = this.store.recordDaily(this.today, r.stars, r.time, r.hintsUsed);
    this.hud.setBulbs(this.store.data.bulbs);
    if (import.meta.env.DEV) console.debug('[event] daily_complete', { date: this.today, time: r.time, stars: r.stars, hints: r.hintsUsed });
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
  }

  private async shareDaily() {
    const res = this.store.data.daily.last!;
    const text = shareText(this.today, res.stars, res.time, res.hints, location.origin + location.pathname);
    if (import.meta.env.DEV) console.debug('[event] daily_share', { date: this.today });
    this.hud.toast((await copyText(text)) ? 'Copied — paste it anywhere' : "Couldn't copy", 2);
  }

  /** Rewarded "second attempt at 3 stars": once per day; the better result is kept. */
  private async retryDaily() {
    this.card.hide();
    if (await this.rewarded()) {
      this.store.data.daily.last!.retried = true;
      this.store.save();
      this.playDaily();
    } else this.showDailyResult(0);
  }

  /** Rewarded "double reward": the base Bulbs were already paid. */
  private async doubleDaily() {
    this.card.hide();
    if (await this.rewarded()) {
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
    this.hud.toast(`+${g.points}${g.mult > 1 ? ` (×${g.mult})` : ''} · +${g.bonus}s`);
    this.hud.setTimer(run.timeLeft);
    this.load(run.nextTarget(), false);
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
    if (import.meta.env.DEV) console.debug('[event] endless_over', { score: run.score, solved: run.solved, continued: run.continued });
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
  }

  /** Rewarded continue, once per run, offered only on the game-over card. */
  private async endlessContinue() {
    this.card.hide();
    const run = this.run!;
    if (await this.rewarded()) {
      run.continued = true;
      run.timeLeft = ENDLESS_CONTINUE_S;
      this.hud.setTimer(run.timeLeft);
      this.level.resume();
    } else this.showEndlessOver();
  }

  /** "Play again" requests a midgame, unless the player already watched a continue this run. */
  private async endlessAgain() {
    this.card.hide();
    if (!this.run?.continued) await this.runAd(() => this.portal.midgame({ onStart: () => this.audio.setAdMuted(true) }));
    this.startEndless();
  }

  /** The HUD's level label: "1-4" in the campaign, the Daily number, or the Endless score. */
  private updateLabel() {
    if (this.mode === 'daily') this.hud.setLevel(`Daily #${dailyNumber(this.today)}`);
    else if (this.mode === 'endless' && this.run) this.hud.setLevel(`${this.run.score} pts${this.run.mult > 1 ? ` ×${this.run.mult}` : ''}`);
  }

  private onKey(code: string) {
    if (this.inAd || this.inMenus || this.card.open) return;
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
