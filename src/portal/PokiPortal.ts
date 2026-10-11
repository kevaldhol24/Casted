import type { SaveData } from '../core/Store';
import type { AdCallbacks, Portal } from './Portal';

/**
 * Poki build (vite --mode poki). The SDK script tag is injected by vite.config.ts; in `dev --mode poki`
 * PokiMock stands in for it. If the script never loaded (adblock, offline) every call is a safe no-op and
 * rewarded breaks return false. Saves stay in localStorage (Store), not Poki's cloud.
 *
 * main.ts doesn't wait for init (on a slow connection it waits for Poki's whole ad stack). Poki's own loader only
 * queues calls until its core script arrives; between that and init resolving, a call such as gameplayStart logs
 * "The Poki SDK was not yet booted". So calls made before init settles are queued here and replayed in order, and a
 * break asked for before then is skipped (rewarded: "no video").
 *
 * Poki wants gameplayStart only after the player has interacted (Inspector: "Gameplay was fired without a player
 * interaction"). A first visit opens straight into level 1, so the SDK hears about gameplay only from the first
 * tap, click or key press; if the level stops before that, the SDK hears nothing.
 */
export class PokiPortal implements Portal {
  /** The game is in gameplay (what the game asked for). */
  private playing = false;
  /** What the SDK has been told (lags `playing` until the first interaction). */
  private sdkPlaying = false;
  private interacted = false;
  /** init() has resolved or rejected. */
  private ready = false;
  private pending: ((sdk: PokiSDKApi) => void)[] = [];

  constructor() {
    const first = () => {
      this.interacted = true;
      for (const t of ['pointerdown', 'keydown'] as const) removeEventListener(t, first, true);
      if (this.playing && !this.sdkPlaying) this.sendStart();
    };
    for (const t of ['pointerdown', 'keydown'] as const) addEventListener(t, first, true);
  }

  private get sdk() {
    return window.PokiSDK;
  }

  private warn(msg: string) {
    if (import.meta.env.DEV) console.warn(`[poki] ${msg}`);
  }

  private call(fn: (sdk: PokiSDKApi) => void) {
    if (!this.ready) {
      this.pending.push(fn);
      return;
    }
    const sdk = this.sdk;
    if (!sdk) return;
    try {
      fn(sdk);
    } catch (e) {
      this.warn(`SDK call threw: ${e}`);
    }
  }

  async init() {
    // The game continues whatever happens here.
    await this.sdk?.init().catch((e) => this.warn(`init rejected: ${e}`));
    this.ready = true;
    for (const fn of this.pending.splice(0)) this.call(fn);
  }

  loadingFinished() {
    this.call((s) => s.gameLoadingFinished());
  }

  gameplayStart() {
    if (this.playing) return this.warn('gameplayStart while already playing (ignored)');
    this.playing = true;
    if (this.interacted) this.sendStart();
  }

  gameplayStop() {
    if (!this.playing) return this.warn('gameplayStop while not playing (ignored)');
    this.playing = false;
    if (this.sdkPlaying) {
      this.sdkPlaying = false;
      this.call((s) => s.gameplayStop());
    }
  }

  private sendStart() {
    this.sdkPlaying = true;
    this.call((s) => s.gameplayStart());
  }

  async midgame(cb?: AdCallbacks) {
    const sdk = this.sdk;
    if (!sdk || !this.ready) return;
    if (this.playing) this.gameplayStop();
    try {
      await sdk.commercialBreak(() => cb?.onStart?.());
    } catch (e) {
      this.warn(`commercialBreak rejected: ${e}`);
    }
  }

  async rewarded(cb?: AdCallbacks) {
    const sdk = this.sdk;
    if (!sdk || !this.ready) return false;
    if (this.playing) this.gameplayStop();
    try {
      return (await sdk.rewardedBreak({ size: 'small', onStart: () => cb?.onStart?.() })) === true;
    } catch (e) {
      this.warn(`rewardedBreak rejected: ${e}`);
      return false;
    }
  }

  /** Poki has no "ad available" query; a break that can't fill resolves false and the game says so. */
  rewardedAvailable() {
    return true;
  }

  measure(category: string, what: string, action: string) {
    this.call((s) => s.measure(category, what, action));
  }

  async shareableURL(params: Record<string, string | number>) {
    const sdk = this.sdk;
    if (!sdk || !this.ready) throw new Error('Poki SDK not ready');
    return sdk.shareableURL(params);
  }

  getURLParam(name: string) {
    try {
      return this.sdk?.getURLParam(name) || null;
    } catch {
      return null;
    }
  }

  async save(_data: SaveData) {}
  async load() {
    return null;
  }
}
