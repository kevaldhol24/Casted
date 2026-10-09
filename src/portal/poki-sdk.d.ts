/** The parts of the Poki HTML5 SDK v2 (game-cdn.poki.com/scripts/v2/poki-sdk.js) the game uses. */
interface PokiSDKApi {
  init(): Promise<void>;
  gameLoadingFinished(): void;
  gameplayStart(): void;
  gameplayStop(): void;
  commercialBreak(onStart?: () => void): Promise<void>;
  rewardedBreak(opts?: { size?: 'small' | 'medium' | 'large'; onStart?: () => void }): Promise<boolean>;
  shareableURL(params: Record<string, string | number>): Promise<string>;
  getURLParam(name: string): string;
  measure(category: string, what?: string, action?: string): void;
}

interface Window {
  PokiSDK?: PokiSDKApi;
}
