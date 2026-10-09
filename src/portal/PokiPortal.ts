import type { SaveData } from '../core/Store';
import type { AdCallbacks, Portal } from './Portal';

/**
 * Poki build (vite --mode poki). The SDK script tag is injected by vite.config.ts; in `dev --mode poki`
 * PokiMock stands in for it. If the script never loaded (adblock, offline) every call is a safe no-op and
 * rewarded breaks return false. Saves stay in localStorage (Store), not Poki's cloud.
 */
export class PokiPortal implements Portal {
  private playing = false;

  private get sdk() {
    return window.PokiSDK;
  }

  private warn(msg: string) {
    if (import.meta.env.DEV) console.warn(`[poki] ${msg}`);
  }

  private call(fn: (sdk: PokiSDKApi) => void) {
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
  }

  loadingFinished() {
    this.call((s) => s.gameLoadingFinished());
  }

  gameplayStart() {
    if (this.playing) return this.warn('gameplayStart while already playing (ignored)');
    this.playing = true;
    this.call((s) => s.gameplayStart());
  }

  gameplayStop() {
    if (!this.playing) return this.warn('gameplayStop while not playing (ignored)');
    this.playing = false;
    this.call((s) => s.gameplayStop());
  }

  async midgame(cb?: AdCallbacks) {
    const sdk = this.sdk;
    if (!sdk) return;
    if (this.playing) this.gameplayStop();
    try {
      await sdk.commercialBreak(() => cb?.onStart?.());
    } catch (e) {
      this.warn(`commercialBreak rejected: ${e}`);
    }
  }

  async rewarded(cb?: AdCallbacks) {
    const sdk = this.sdk;
    if (!sdk) return false;
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
    if (!sdk) throw new Error('Poki SDK missing');
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
