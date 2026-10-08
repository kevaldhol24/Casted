import './ui/style.css';
import { Game } from './core/Game';
import { Store } from './core/Store';
import { LocalPortal } from './portal/LocalPortal';

async function boot() {
  const portal = new LocalPortal();
  // The game continues even if the portal SDK fails to init (adblock, offline).
  await portal.init().catch(() => {});
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
