import { localSaveStorage, type Portal } from './Portal';

/** Dev / own-site build: no ads, localStorage saves. Logs SDK events in dev to check coverage. */
export class LocalPortal implements Portal {
  private playing = false;
  private log(...args: unknown[]) {
    if (import.meta.env.DEV) console.debug('[portal]', ...args);
  }

  async init() {
    this.log('init');
  }
  loadingFinished() {
    this.log('loadingFinished');
  }
  gameplayStart() {
    if (this.playing) return;
    this.playing = true;
    this.log('gameplayStart');
  }
  gameplayStop() {
    if (!this.playing) return;
    this.playing = false;
    this.log('gameplayStop');
  }
  async midgame() {
    this.log('midgame (skipped)');
  }
  async rewarded() {
    this.log('rewarded (granted in local build)');
    return true;
  }
  rewardedAvailable() {
    return true;
  }
  happyTime() {
    this.log('happyTime');
  }
  storage() {
    return localSaveStorage();
  }
}
