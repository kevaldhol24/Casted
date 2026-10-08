import { el } from './dom';

export type ArrowKind = 'yaw' | 'pitch' | 'roll';

const ARROW_HEAD = '<path d="M0 0 L-7 -5 L-7 5 Z" fill="currentColor"/>';

/** Curved arcs drawn around the object, in a 200×200 box centred on it. */
const PATHS: Record<ArrowKind, string> = {
  yaw: 'M 30 150 Q 100 190 170 150',
  pitch: 'M 165 40 Q 200 100 165 160',
  roll: 'M 100 22 A 78 78 0 1 1 33 60',
};

/**
 * A curved arrow overlaid on the object. Two uses from the design doc:
 * a faint, double-headed arc on axis-locked levels (which way the object can turn), and the Nudge hint
 * (a bold single-headed arc for 2 s showing which way to drag next).
 */
export class ObjectArrow {
  private root = el('div', 'obj-arrow');
  private svg: SVGSVGElement;
  private hideTimer = 0;

  constructor(parent: HTMLElement) {
    this.root.innerHTML = `<svg viewBox="0 0 200 200"><defs>
      <marker id="ah" viewBox="-8 -6 10 12" refX="0" refY="0" markerWidth="5" markerHeight="5" orient="auto-start-reverse">${ARROW_HEAD}</marker>
      </defs><path class="arc" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/></svg>`;
    this.svg = this.root.querySelector('svg')!;
    parent.append(this.root);
  }

  /** Centre on the object's screen position; size in CSS px. */
  place(x: number, y: number, size: number) {
    this.root.style.transform = `translate(${x - size / 2}px, ${y - size / 2}px)`;
    this.root.style.width = this.root.style.height = `${size}px`;
  }

  /** Faint double-headed guide; null hides it. */
  guide(kind: ArrowKind | null) {
    if (this.root.classList.contains('nudge')) return;
    if (!kind) {
      this.root.classList.remove('show', 'guide');
      return;
    }
    this.draw(kind, 1, true);
    this.root.classList.add('show', 'guide');
  }

  /** Bold single-headed arrow for `seconds`; sign = direction along the arc. */
  nudge(kind: ArrowKind, sign: number, seconds = 2, after: ArrowKind | null = null) {
    this.draw(kind, sign, false);
    this.root.classList.remove('guide');
    this.root.classList.add('show', 'nudge');
    clearTimeout(this.hideTimer);
    this.hideTimer = window.setTimeout(() => {
      this.root.classList.remove('show', 'nudge');
      if (after) this.guide(after);
    }, seconds * 1000);
  }

  hide() {
    clearTimeout(this.hideTimer);
    this.root.classList.remove('show', 'guide', 'nudge');
  }

  private draw(kind: ArrowKind, sign: number, both: boolean) {
    const path = this.svg.querySelector('.arc')!;
    path.setAttribute('d', PATHS[kind]);
    path.setAttribute('marker-end', 'url(#ah)');
    if (both) path.setAttribute('marker-start', 'url(#ah)');
    else path.removeAttribute('marker-start');
    // Paths are drawn left→right / top→bottom / anticlockwise; mirror the arc to flip direction.
    const flip = sign < 0 ? (kind === 'pitch' ? 'scale(1,-1)' : 'scale(-1,1)') : '';
    this.svg.style.transform = flip;
  }
}
