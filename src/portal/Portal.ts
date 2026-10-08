import type { SaveData } from '../core/Store';

/** The game mutes audio only when an ad actually starts (CrazyGames adStarted), not when it is requested. */
export interface AdCallbacks {
  onStart?(): void;
}

/** Hides Poki / CrazyGames SDK differences. One implementation is chosen at build time (import.meta.env.MODE). */
export interface Portal {
  init(): Promise<void>;
  loadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Resolves after the ad or the skip; never rejects. */
  midgame(cb?: AdCallbacks): Promise<void>;
  /** True only if the ad completed. */
  rewarded(cb?: AdCallbacks): Promise<boolean>;
  /** Rewarded buttons are disabled with a notice when false (adblock, Basic Launch). */
  rewardedAvailable(): boolean;
  happyTime?(): void;
  save(data: SaveData): Promise<void>;
  load(): Promise<SaveData | null>;
}
