import { el, ICONS } from './dom';

export interface WorldCard {
  id: number;
  name: string;
  colors: [string, string];
  stars: number;
  maxStars: number;
  /** Playable now. */
  open: boolean;
  /** Unlock rule, or "Coming soon" when unlocked but not built yet. */
  note: string;
}

/** World cards with star totals; locked cards say what unlocks them. */
export class WorldSelect {
  private overlay = el('div', 'overlay center');
  private list = el('div', 'world-list');
  private total = el('p', 'levels-sub');
  onPick = (_id: number) => {};
  onBack = () => {};

  constructor(parent: HTMLElement) {
    const card = el('div', 'card interactive');
    const title = el('h2', 'levels-title', 'Worlds');
    const back = el('button', 'btn-secondary interactive', 'Back');
    const row = el('div', 'btn-row');
    row.append(back);
    card.append(title, this.total, this.list, row);
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

  show(cards: WorldCard[], totalStars: number) {
    this.total.innerHTML = `<span class="bulb-inline star-inline">${ICONS.star}</span> ${totalStars} stars`;
    this.list.innerHTML = '';
    for (const c of cards) {
      const b = el('button', 'world-card interactive');
      b.style.setProperty('--w-bg', c.colors[0]);
      b.style.setProperty('--w-accent', c.colors[1]);
      b.innerHTML = `<span class="world-num">${c.id}</span><span class="world-name">${c.name}</span>
        <span class="world-meta">${c.open ? `${ICONS.star} ${c.stars} / ${c.maxStars}` : c.note}</span>`;
      b.disabled = !c.open;
      b.addEventListener('click', () => {
        this.hide();
        this.onPick(c.id);
      });
      this.list.append(b);
    }
    this.overlay.classList.add('show');
  }

  hide() {
    this.overlay.classList.remove('show');
  }
}
