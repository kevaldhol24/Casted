import type { SaveData } from '../core/Store';

/** Hides Poki / CrazyGames SDK differences. One implementation is chosen at build time (import.meta.env.MODE). */
export interface Portal {
  init(): Promise<void>;
  loadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  /** Resolves after the ad or the skip; never rejects. */
  midgame(): Promise<void>;
  /** True only if the ad completed. */
  rewarded(): Promise<boolean>;
  happyTime?(): void;
  save(data: SaveData): Promise<void>;
  load(): Promise<SaveData | null>;
}
