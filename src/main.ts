import './ui/style.css';
import nunitoUrl from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url';
import { Analytics } from './analytics/Analytics';
import { Game } from './core/Game';
import { Store } from './core/Store';
import { LocalPortal } from './portal/LocalPortal';
import { CrazyGamesPortal } from './portal/CrazyGamesPortal';
import { localSaveStorage, type Portal } from './portal/Portal';

/** The one display font: Nunito (variable weight, Latin subset, ~39 KB woff2), bundled — no font CDN. */
function loadFont() {
  const face = new FontFace('Nunito', `url(${nunitoUrl}) format('woff2')`, { weight: '200 1000', display: 'swap' });
  document.fonts.add(face);
  return face.load().catch(() => {});
}

/** How long a CrazyGames build waits for the SDK before booting on localStorage alone. */
const INIT_TIMEOUT_MS = 4000;

async function boot() {
  const font = loadFont();
  // `--mode crazygames` builds talk to CrazyGames; every other build (Netlify, plain dev) runs locally.
  const portal: Portal = import.meta.env.MODE === 'crazygames' ? new CrazyGamesPortal() : new LocalPortal();
  // The save lives in the SDK's Data module, so wait for init before reading it, but not forever: init never
  // rejects, and on a timeout the game boots on localStorage (calls made meanwhile are queued by the portal).
  const ready = await Promise.race([portal.init().then(() => true), new Promise<boolean>((r) => setTimeout(() => r(false), INIT_TIMEOUT_MS))]);
  const storage = ready ? portal.storage() : localSaveStorage();
  const store = new Store(storage);
  // A returning player sees the menu first: give the font a moment so it doesn't re-flow. A first visit goes straight
  // into level 1, so don't hold it up (the HUD's few words swap in when the font lands).
  if (Store.exists(storage)) await Promise.race([font, new Promise((r) => setTimeout(r, 800))]);
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ui.innerHTML = '<div class="overlay center show"><button class="btn-primary interactive" style="width:240px" onclick="location.reload()">Tap to reload</button></div>';
  });

  const analytics = new Analytics();
  const game = new Game(canvas, ui, portal, store, analytics);
  game.start();
  if (import.meta.env.DEV) (window as unknown as { __casted: Game }).__casted = game;
  // The Android app (Capacitor, `--mode android`) routes its back button here; see tools/android/MainActivity.java.
  if (import.meta.env.MODE === 'android') (window as unknown as { __castedBack: () => boolean }).__castedBack = () => game.back();
  portal.loadingFinished();
  analytics.track({ type: 'loaded' });
  // Let the bar finish, then fade the loading screen out over the first frame.
  const boot = document.getElementById('boot');
  if (boot) {
    requestAnimationFrame(() => boot.classList.add('done'));
    setTimeout(() => boot.remove(), 600);
  }
}

/**
 * A boot that throws (most often WebGL unavailable: blocked GPU, old driver, a VM without a GPU) used to leave the
 * loading screen up for good. Say what happened instead and offer a reload.
 */
function bootFailed(e: unknown) {
  console.error('[casted] boot failed', e);
  const webgl = /webgl/i.test(String(e));
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.innerHTML =
    `<div class="name">CASTED</div>` +
    `<p style="max-width:300px;margin:0;text-align:center;line-height:1.4;opacity:.85">${
      webgl ? 'Your browser could not start 3D graphics (WebGL). Try enabling hardware acceleration or another browser.' : 'Something went wrong while loading.'
    }</p>` +
    `<button onclick="location.reload()" style="font:inherit;font-weight:800;padding:12px 28px;border:0;border-radius:99px;background:#f2a43a;color:#2b2019;cursor:pointer">Reload</button>`;
}

boot().catch(bootFailed);
