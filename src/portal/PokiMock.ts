/**
 * Dev-only stand-in for the Poki SDK (`npm run dev:poki`): logs every call to the console and to
 * window.__pokiLog, and shows a 1.5 s "MOCK AD" screen for every break. Rewarded breaks succeed or fail by the toggle
 * in the bottom-left corner (or ?rewarded=fail). Never part of a build: main.ts imports it only in dev.
 */
type LogEntry = { t: number; call: string; args: unknown[] };

export function installPokiMock() {
  const log: LogEntry[] = [];
  const t0 = performance.now();
  const record = (call: string, ...args: unknown[]) => {
    log.push({ t: Math.round(performance.now() - t0), call, args });
    console.info(`[PokiSDK mock] ${call}`, ...args);
  };
  const state = { rewarded: new URLSearchParams(location.search).get('rewarded') !== 'fail' };
  /** A visible stand-in for the ad: a full-screen card for 1.5 s (a real commercialBreak often shows nothing). */
  const fakeAd = async (kind: string, onStart?: () => void) => {
    await new Promise((r) => setTimeout(r, 50));
    onStart?.();
    const ad = document.createElement('div');
    ad.className = 'poki-mock-ad';
    ad.style.cssText =
      'position:fixed;inset:0;z-index:2000;display:grid;place-items:center;background:rgba(10,10,20,0.92);color:#fff;font:700 22px system-ui;text-align:center';
    ad.innerHTML = `<div>MOCK AD<br><span style="font-size:15px;font-weight:400">${kind}</span></div>`;
    document.body.append(ad);
    await new Promise((r) => setTimeout(r, 1500));
    ad.remove();
  };

  const sdk: PokiSDKApi = {
    async init() {
      record('init');
    },
    gameLoadingFinished: () => record('gameLoadingFinished'),
    gameplayStart: () => record('gameplayStart'),
    gameplayStop: () => record('gameplayStop'),
    async commercialBreak(onStart) {
      record('commercialBreak');
      await fakeAd('commercialBreak', onStart);
    },
    async rewardedBreak(opts) {
      record('rewardedBreak', opts?.size);
      await fakeAd(`rewardedBreak · will ${state.rewarded ? 'succeed' : 'fail'}`, opts?.onStart);
      record('rewardedBreak →', state.rewarded);
      return state.rewarded;
    },
    async shareableURL(params) {
      record('shareableURL', params);
      const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [`gd${k}`, String(v)]));
      return `${location.origin}${location.pathname}?${q}`;
    },
    getURLParam(name) {
      const q = new URLSearchParams(location.search);
      const v = q.get(`gd${name}`) ?? q.get(name) ?? '';
      record('getURLParam', name, v);
      return v;
    },
    measure: (category, what, action) => record('measure', category, what, action),
  };
  window.PokiSDK = sdk;
  Object.assign(window, { __pokiLog: log, __pokiMock: state });

  const toggle = document.createElement('button');
  const label = () => (toggle.textContent = `mock rewarded: ${state.rewarded ? 'success' : 'fail'}`);
  toggle.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99;font:12px monospace;padding:4px 8px;opacity:0.7';
  toggle.addEventListener('click', () => {
    state.rewarded = !state.rewarded;
    label();
  });
  label();
  document.body.append(toggle);
}
