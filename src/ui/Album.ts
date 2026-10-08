import { isSingle, type LevelDef } from '../levels/levels';
import { SILHOUETTES, silhouetteBounds } from '../levels/shapes';
import { el } from './dom';

/**
 * Shadow Album: every solved silhouette, a section per world (procedural levels drawn from shapes.ts, model
 * levels from their mask PNG).
 * Unsolved entries show a "?" card. Completion % per world.
 */
export class Album {
  private overlay = el('div', 'overlay center');
  private grid = el('div', 'album-grid');
  private sub = el('p', 'levels-sub');
  onBack = () => {};

  constructor(parent: HTMLElement) {
    const card = el('div', 'card interactive album-card');
    const title = el('h2', 'levels-title', 'Shadow Album');
    const back = el('button', 'btn-secondary interactive', 'Back');
    const row = el('div', 'btn-row');
    row.append(back);
    card.append(title, this.sub, this.grid, row);
    this.overlay.append(card);
    parent.append(this.overlay);
    back.addEventListener('click', () => {
      this.hide();
      this.onBack();
    });
  }

  get open() {
    return this.overlay.classList.contains('show');
  }

  /** One section per world (its silhouettes tinted with that world's accent). */
  show(worlds: { name: string; levels: LevelDef[]; color: string }[], solved: (id: string) => boolean) {
    const all = worlds.flatMap((w) => w.levels);
    const done = all.filter((l) => solved(l.id)).length;
    this.sub.textContent = `${done} / ${all.length} shadows · ${Math.round((done / Math.max(1, all.length)) * 100)}% complete`;
    this.grid.innerHTML = '';
    for (const w of worlds) {
      if (worlds.length > 1) this.grid.append(el('h3', 'album-world', w.name));
      for (const l of w.levels) {
        const cell = el('div', 'album-cell');
        if (solved(l.id)) {
          cell.append(isSingle(l) && l.object.kind === 'procedural' ? drawSilhouette(l.object.silhouette, 96, w.color) : maskImage(l, 96, w.color));
          cell.append(el('span', 'album-name', l.targetName));
        } else {
          cell.classList.add('unknown');
          cell.append(el('span', 'album-q', '?'));
        }
        this.grid.append(cell);
      }
    }
    this.overlay.classList.add('show');
  }

  hide() {
    this.overlay.classList.remove('show');
  }
}

/** Model levels: the editor's exported mask PNG (shape opaque, background transparent), tinted with the accent through a CSS mask. */
function maskImage(level: LevelDef, size: number, color: string): HTMLElement {
  const div = document.createElement('div');
  div.style.width = div.style.height = `${size}px`;
  if (!level.mask) return div;
  const url = `url("${import.meta.env.BASE_URL}${level.mask}")`;
  div.style.background = color;
  div.style.maskImage = div.style.webkitMaskImage = url;
  div.style.maskSize = div.style.webkitMaskSize = 'contain';
  return div;
}

function drawSilhouette(key: string, size: number, color: string): HTMLCanvasElement {
  const sil = SILHOUETTES[key]();
  const canvas = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = canvas.height = size * dpr;
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d')!;
  const b = silhouetteBounds(sil);
  const span = Math.max(b.max.x - b.min.x, b.max.y - b.min.y);
  const s = (size * dpr * 0.82) / span;
  const cx = (b.min.x + b.max.x) / 2;
  const cy = (b.min.y + b.max.y) / 2;
  ctx.translate((size * dpr) / 2, (size * dpr) / 2);
  ctx.scale(s, -s);
  ctx.translate(-cx, -cy);
  ctx.fillStyle = color;
  // Each part is filled on its own (holes cut with even-odd), so overlapping parts form a union.
  for (const shape of sil) {
    const { shape: outer, holes } = shape.extractPoints(24);
    ctx.beginPath();
    for (const ring of [outer, ...holes]) {
      ring.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
    }
    ctx.fill('evenodd');
  }
  return canvas;
}
