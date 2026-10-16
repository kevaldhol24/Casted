import { localSaveStorage, type AdCallbacks, type Portal, type SaveStorage } from './Portal';

/**
 * CrazyGames build (vite --mode crazygames). The SDK v3 script tag is injected by vite.config.ts (dev too: on
 * localhost the SDK runs in its 'local' environment and shows demo ads). If the script never loaded (adblock,
 * offline) or the environment is 'disabled' (any other host, where every call throws), every call is a safe no-op,
 * breaks are skipped, rewarded breaks return false and saves fall back to localStorage.
 *
 * main.ts awaits init (with a timeout) before reading the save, because the save lives in the SDK's Data module:
 * cloud-synced for signed-in players, localStorage for guests. Calls made before init settles are queued and
 * replayed in order.
 */
export class CrazyGamesPortal implements Portal {
  readonly videoAds = true;
  private playing = false;
  /** init() has settled. */
  private ready = false;
  /** The SDK initialised in a usable environment. */
  private live = false;
  private adblock = false;
  private pending: ((sdk: CrazyGamesSDKApi) => void)[] = [];

  private get sdk() {
    return this.live ? window.CrazyGames?.SDK : undefined;
  }

  private warn(msg: string) {
    if (import.meta.env.DEV) console.warn(`[crazygames] ${msg}`);
  }

  private call(fn: (sdk: CrazyGamesSDKApi) => void) {
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
    const sdk = window.CrazyGames?.SDK;
    try {
      if (sdk) {
        await sdk.init();
        this.live = sdk.environment !== 'disabled';
        if (!this.live) this.warn('environment is "disabled" (not a CrazyGames host): running without the SDK');
      }
    } catch (e) {
      this.warn(`init failed: ${e}`);
    }
    this.ready = true;
    this.call((s) => s.game.loadingStart());
    for (const fn of this.pending.splice(0)) this.call(fn);
    this.sdk
      ?.ad.hasAdblock()
      .then((b) => (this.adblock = b))
      .catch(() => {});
  }

  loadingFinished() {
    this.call((s) => s.game.loadingStop());
  }

  gameplayStart() {
    if (this.playing) return this.warn('gameplayStart while already playing (ignored)');
    this.playing = true;
    this.call((s) => s.game.gameplayStart());
  }

  gameplayStop() {
    if (!this.playing) return this.warn('gameplayStop while not playing (ignored)');
    this.playing = false;
    this.call((s) => s.game.gameplayStop());
  }

  /** One ad request: resolves true when the ad finished, false on any error (unfilled, adblock, cooldown…). */
  private requestAd(type: 'midgame' | 'rewarded', cb?: AdCallbacks): Promise<boolean> {
    const sdk = this.sdk;
    if (!sdk) return Promise.resolve(false);
    if (this.playing) this.gameplayStop();
    return new Promise((resolve) => {
      try {
        sdk.ad.requestAd(type, {
          adStarted: () => cb?.onStart?.(),
          adFinished: () => resolve(true),
          adError: (e) => {
            if (e?.code === 'adblock') this.adblock = true;
            if (import.meta.env.DEV) console.info(`[crazygames] ${type} ad: ${e?.code}`);
            resolve(false);
          },
        });
      } catch (e) {
        this.warn(`requestAd threw: ${e}`);
        resolve(false);
      }
    });
  }

  async midgame(cb?: AdCallbacks) {
    await this.requestAd('midgame', cb);
  }

  rewarded(cb?: AdCallbacks) {
    return this.requestAd('rewarded', cb);
  }

  /** Off without the SDK or with an adblocker; otherwise a break that can't fill resolves false and the game says so. */
  rewardedAvailable() {
    return !!this.sdk && !this.adblock;
  }

  happyTime() {
    this.call((s) => s.game.happytime());
  }

  onForcedMute(fn: (muted: boolean) => void) {
    this.call((s) => {
      fn(!!s.game.settings?.muteAudio);
      s.game.addSettingsChangeListener((st) => fn(!!st.muteAudio));
    });
  }

  async shareableURL(params: Record<string, string | number>) {
    const sdk = this.sdk;
    if (!sdk) throw new Error('CrazyGames SDK not available');
    return await sdk.game.inviteLink(params);
  }

  getURLParam(name: string) {
    try {
      return this.sdk?.game.getInviteParam(name) ?? new URLSearchParams(location.search).get(name);
    } catch {
      return null;
    }
  }

  /**
   * The Data module first; every write is mirrored to localStorage, so progress still survives if the module is off
   * (the game was submitted without "Progress Save") or a write fails (1 MB cap).
   */
  storage(): SaveStorage {
    const data = this.sdk?.data;
    const local = localSaveStorage();
    if (!data) return local;
    return {
      getItem: (k) => {
        try {
          const v = data.getItem(k);
          if (v != null) return v;
        } catch {}
        return local.getItem(k);
      },
      setItem: (k, v) => {
        try {
          data.setItem(k, v);
        } catch (e) {
          this.warn(`data.setItem failed: ${e}`);
        }
        try {
          local.setItem(k, v);
        } catch {}
      },
    };
  }
}
