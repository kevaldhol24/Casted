import './ui/style.css';
import nunitoUrl from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url';
import { Analytics } from './analytics/Analytics';
import { Game } from './core/Game';
import { Store } from './core/Store';
import { LocalPortal } from './portal/LocalPortal';
import { PokiPortal } from './portal/PokiPortal';
import type { Portal } from './portal/Portal';

/** The one display font: Nunito (variable weight, Latin subset, ~39 KB woff2), bundled — no font CDN. */
function loadFont() {
  const face = new FontFace('Nunito', `url(${nunitoUrl}) format('woff2')`, { weight: '200 1000', display: 'swap' });
  document.fonts.add(face);
  return face.load().catch(() => {});
}

async function boot() {
  const font = loadFont();
  // `--mode poki` builds talk to Poki; every other build (Netlify, plain dev) runs locally.
  if (import.meta.env.DEV && import.meta.env.MODE === 'poki' && !window.PokiSDK) (await import('./portal/PokiMock')).installPokiMock();
  const portal: Portal = import.meta.env.MODE === 'poki' ? new PokiPortal() : new LocalPortal();
  // Init first, but don't wait for it: on a slow connection Poki's init waits for its whole ad stack (~800 KB). The
  // SDK's loader queues every later call (gameLoadingFinished, gameplayStart, breaks) and replays them in order once
  // init resolves, so the game loads in parallel. It also carries on if init fails (adblock, offline).
  void portal.init().catch(() => {});
  // A returning player sees the menu first: give the font a moment so it doesn't re-flow. A first visit goes straight
  // into level 1, so don't hold it up (the HUD's few words swap in when the font lands).
  let returning = false;
  try {
    returning = !!localStorage.getItem('casted.save');
  } catch {}
  if (returning) await Promise.race([font, new Promise((r) => setTimeout(r, 800))]);
  const store = new Store();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ui.innerHTML = '<div class="overlay center show"><button class="btn-primary interactive" style="width:240px" onclick="location.reload()">Tap to reload</button></div>';
  });

  const analytics = new Analytics(portal);
  const game = new Game(canvas, ui, portal, store, analytics);
  game.start();
  if (import.meta.env.DEV) (window as unknown as { __casted: Game }).__casted = game;
  portal.loadingFinished();
  analytics.track({ type: 'loaded' });
  // Let the bar finish, then fade the loading screen out over the first frame.
  const boot = document.getElementById('boot');
  if (boot) {
    requestAnimationFrame(() => boot.classList.add('done'));
    setTimeout(() => boot.remove(), 600);
  }
}

boot();
