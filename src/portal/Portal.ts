import type { SaveData } from '../core/Store';

export interface AdCallbacks {
  /** The ad actually started playing (not every requested break shows one). */
  onStart?(): void;
}

/** The game's view of the portal SDK. One implementation is chosen at build time (import.meta.env.MODE). */
export interface Portal {
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
  happyTime?(): void;
  /** A link that opens the game with these params (the portal's own game page). */
  shareableURL?(params: Record<string, string | number>): Promise<string>;
  /** A param from the portal page's URL (set by shareableURL) or the game's own URL. */
  getURLParam?(name: string): string | null;
  save(data: SaveData): Promise<void>;
  load(): Promise<SaveData | null>;
}
