import './ui/style.css';
import nunitoUrl from '@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2?url';
import { Game } from './core/Game';
import { Store } from './core/Store';
import { LocalPortal } from './portal/LocalPortal';

/** The one display font: Nunito (variable weight, Latin subset, ~39 KB woff2), bundled — no font CDN. */
function loadFont() {
  const face = new FontFace('Nunito', `url(${nunitoUrl}) format('woff2')`, { weight: '200 1000', display: 'swap' });
  document.fonts.add(face);
  return face.load().catch(() => {});
}

async function boot() {
  const font = loadFont();
  const portal = new LocalPortal();
  // The game continues even if the portal SDK fails to init (adblock, offline).
  await portal.init().catch(() => {});
  // Wait briefly for the font so the first menu doesn't re-flow; never block boot on it.
  await Promise.race([font, new Promise((r) => setTimeout(r, 800))]);
  const store = new Store();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    ui.innerHTML = '<div class="overlay center show"><button class="btn-primary interactive" style="width:240px" onclick="location.reload()">Tap to reload</button></div>';
  });

  const game = new Game(canvas, ui, portal, store);
  game.start();
  if (import.meta.env.DEV) (window as unknown as { __casted: Game }).__casted = game;
  portal.loadingFinished();
  // Let the bar finish, then fade the loading screen out over the first frame.
  const boot = document.getElementById('boot');
  if (boot) {
    requestAnimationFrame(() => boot.classList.add('done'));
    setTimeout(() => boot.remove(), 600);
  }
}

boot();
