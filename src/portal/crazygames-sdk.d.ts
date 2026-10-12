/** The parts of the CrazyGames HTML5 SDK v3 (sdk.crazygames.com/crazygames-sdk-v3.js) the game uses. */
interface CrazyGamesAdError {
  code: 'adsDisabledBasicLaunch' | 'unfilled' | 'adblock' | 'adCooldown' | 'other' | string;
  message?: string;
}

interface CrazyGamesSettings {
  muteAudio: boolean;
  disableChat: boolean;
}

interface CrazyGamesSDKApi {
  init(): Promise<void>;
  /** 'local' on localhost (demo ads), 'crazygames' on their domains, 'disabled' elsewhere (every call throws). */
  readonly environment: 'local' | 'crazygames' | 'disabled';
  game: {
    loadingStart(): void;
    loadingStop(): void;
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    /** Documented without await; some wrappers return a promise, so callers await it either way. */
    inviteLink(params: Record<string, string | number>): string | Promise<string>;
    getInviteParam(name: string): string | null;
    readonly settings: CrazyGamesSettings;
    addSettingsChangeListener(fn: (s: CrazyGamesSettings) => void): void;
  };
  ad: {
    requestAd(
      type: 'midgame' | 'rewarded',
      callbacks?: { adStarted?(): void; adFinished?(): void; adError?(error: CrazyGamesAdError): void },
    ): void;
    hasAdblock(): Promise<boolean>;
  };
  /** Cloud save for signed-in players, localStorage for guests. Same API as localStorage; 1 MB cap. */
  data: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
  };
}

interface Window {
  CrazyGames?: { SDK: CrazyGamesSDKApi };
}
