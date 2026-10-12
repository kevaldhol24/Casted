export interface AdCallbacks {
  /** The ad actually started playing (not every requested break shows one). */
  onStart?(): void;
}

/** Where the save lives: localStorage, or the portal's cloud save. Same calls as localStorage. */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The game's view of the portal SDK. One implementation is chosen at build time (import.meta.env.MODE). */
export interface Portal {
  /** Resolves once the SDK is usable (or has failed); never rejects. */
  init(): Promise<void>;
  loadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Resolves after the ad or the skip; never rejects. */
  midgame(cb?: AdCallbacks): Promise<void>;
  /** True only if the ad completed. */
  rewarded(cb?: AdCallbacks): Promise<boolean>;
  /** Rewarded buttons are disabled with a notice when false. */
  rewardedAvailable(): boolean;
  /** A rare celebration (a new best), never a plain level solve. */
  happyTime?(): void;
  /** The portal forces silence (CrazyGames' muteAudio setting); calls back now and on every change. */
  onForcedMute?(fn: (muted: boolean) => void): void;
  /** A link that opens the game with these params (the portal's own game page). */
  shareableURL?(params: Record<string, string | number>): Promise<string>;
  /** A param from the portal page's URL (set by shareableURL) or the game's own URL. */
  getURLParam?(name: string): string | null;
  /** The save backend. Call after init() has settled. */
  storage(): SaveStorage;
}

/** localStorage, or a stand-in that keeps nothing when storage is blocked (private mode). */
export function localSaveStorage(): SaveStorage {
  try {
    if (window.localStorage) return window.localStorage;
  } catch {}
  return { getItem: () => null, setItem: () => {} };
}
