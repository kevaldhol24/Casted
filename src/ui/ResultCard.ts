import { el, ICONS } from './dom';

export interface CardButton {
  label: string;
  /** Primary = the big accent button; the rest share a row underneath. */
  primary?: boolean;
  /** Shows the video icon: the button plays a rewarded ad. */
  video?: boolean;
  disabled?: boolean;
  onClick(): void;
}

export interface CardInfo {
  title: string;
  /** Stars to pop in, or omitted for no star row (Endless). */
  stars?: number;
  /** HTML lines under the title / stars. */
  lines: string[];
  buttons: CardButton[];
}

/** End-of-puzzle card for the modes (Daily result, Endless game over): title, optional stars, lines, buttons. */
export class ResultCard {
  private overlay = el('div', 'overlay center');
  private card = el('div', 'card interactive result-card');
  onStar = (_index: number) => {};

  constructor(parent: HTMLElement) {
    this.overlay.append(this.card);
    parent.append(this.overlay);
  }

  get open() {
    return this.overlay.classList.contains('show');
  }

  show(info: CardInfo) {
    this.card.innerHTML = '';
    this.card.append(el('h2', 'win-title', info.title));
    if (info.stars !== undefined) {
      const row = el('div', 'stars');
      const stars = [0, 1, 2].map(() => el('div', 'star', ICONS.star));
      row.append(...stars);
      this.card.append(row);
      stars.forEach((s, i) =>
        setTimeout(() => {
          s.classList.add(i < info.stars! ? 'on' : 'off-shown');
          if (i < info.stars!) this.onStar(i);
        }, 250 + i * 220),
      );
    }
    for (const line of info.lines) this.card.append(el('p', 'win-sub', line));
    const row = el('div', 'btn-row');
    for (const b of info.buttons) {
      const btn = el('button', `${b.primary ? 'btn-primary' : 'btn-secondary'} interactive`, `${b.video ? `<span class="btn-icon">${ICONS.video}</span>` : ''}${b.label}`);
      btn.disabled = !!b.disabled;
      btn.addEventListener('click', () => {
        if (!this.open) return;
        b.onClick();
      });
      if (b.primary) this.card.append(btn);
      else row.append(btn);
    }
    if (row.childElementCount) this.card.append(row);
    this.overlay.classList.add('show');
  }

  hide() {
    this.overlay.classList.remove('show');
  }
}
