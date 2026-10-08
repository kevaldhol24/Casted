import type { LevelDef } from '../levels/levels';
import { el } from './dom';

export interface LevelTileState {
  level: LevelDef;
  stars: number;
  unlocked: boolean;
  current: boolean;
}

/** One world's level grid; locked tiles are disabled until the previous level is solved. */
export class LevelSelect {
  private overlay = el('div', 'overlay center');
  private grid = el('div', 'level-grid');
  private sub = el('p', 'levels-sub');
  private title = el('h2', 'levels-title');
  /** The picked level (tiles are numbered within their world, so pass the level, not the tile index). */
  onPick = (_level: LevelDef) => {};
  onClose = () => {};

  constructor(parent: HTMLElement) {
    const card = el('div', 'card interactive');
    const close = el('button', 'btn-secondary interactive', 'Back');
    const row = el('div', 'btn-row');
    row.append(close);
    card.append(this.title, this.sub, this.grid, row);
    this.overlay.append(card);
    parent.append(this.overlay);
    close.addEventListener('click', () => {
      this.hide();
      this.onClose();
    });
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) {
        this.hide();
        this.onClose();
      }
    });
  }

  get open() {
    return this.overlay.classList.contains('show');
  }

  show(worldName: string, tiles: LevelTileState[]) {
    this.title.textContent = worldName;
    this.grid.innerHTML = '';
    const total = tiles.reduce((a, t) => a + t.stars, 0);
    this.sub.textContent = `${total} / ${tiles.length * 3} stars`;
    tiles.forEach((t, i) => {
      const b = el('button', `level-tile interactive${t.current ? ' current' : ''}`);
      b.innerHTML = `<span>${i + 1}</span><span class="mini">${[0, 1, 2]
        .map((s) => (s < t.stars ? '★' : '<span class="off">★</span>'))
        .join('')}</span>`;
      if (!t.unlocked) b.disabled = true;
      b.setAttribute('aria-label', `Level ${i + 1}${t.unlocked ? '' : ' (locked)'}`);
      b.addEventListener('click', () => {
        this.hide();
        this.onPick(t.level);
      });
      this.grid.append(b);
    });
    this.overlay.classList.add('show');
  }

  hide() {
    this.overlay.classList.remove('show');
  }
}
