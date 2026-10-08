import { HINT_COST, type HintTier } from '../core/Store';
import { el, ICONS } from './dom';

export interface HintPanelState {
  bulbs: number;
  freeHint: boolean;
  /** Rewarded ads usable right now (no adblock, not cooling down). */
  adReady: boolean;
  adCooldown: number;
}

const TIERS: { tier: HintTier; name: string; what: string }[] = [
  { tier: 'nudge', name: 'Nudge', what: 'Which way to turn' },
  { tier: 'peek', name: 'Peek', what: 'Turn halfway there' },
  { tier: 'reveal', name: 'Reveal', what: 'Almost solved' },
];

/**
 * Three hint tiers with Bulb costs; Reveal can also be paid with a rewarded video. When the player can't
 * afford a tier, a "+2 Bulbs" video offer appears. "Close" is the same size as the offers.
 */
export class HintPanel {
  private overlay = el('div', 'overlay center');
  private list = el('div', 'hint-list');
  private balance = el('p', 'levels-sub');
  private note = el('p', 'hint-note');
  onPick = (_tier: HintTier, _withAd: boolean) => {};
  onGetBulbs = () => {};
  onClose = () => {};

  constructor(parent: HTMLElement) {
    const card = el('div', 'card interactive');
    const title = el('h2', 'levels-title', 'Hints');
    const close = el('button', 'btn-secondary interactive', 'Close');
    const closeRow = el('div', 'btn-row');
    closeRow.append(close);
    card.append(title, this.balance, this.list, this.note, closeRow);
    this.overlay.append(card);
    parent.append(this.overlay);
    close.addEventListener('click', () => this.close());
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.close();
    });
  }

  get open() {
    return this.overlay.classList.contains('show');
  }

  private close() {
    this.hide();
    this.onClose();
  }

  show(s: HintPanelState) {
    this.list.innerHTML = '';
    this.balance.innerHTML = `<span class="bulb-inline">${ICONS.bulb}</span> ${s.bulbs} Bulbs`;
    this.note.textContent = s.adReady ? '' : 'No video available right now — try again soon.';
    for (const t of TIERS) {
      const cost = HINT_COST[t.tier];
      const free = s.freeHint;
      const afford = free || s.bulbs >= cost;
      const row = el('div', 'hint-row');
      const b = el('button', 'hint-option interactive');
      b.innerHTML = `<span class="hint-name">${t.name}</span><span class="hint-what">${t.what}</span>
        <span class="hint-cost">${free ? 'Free' : `${ICONS.bulb}${cost}`}</span>`;
      b.disabled = !afford;
      b.addEventListener('click', () => {
        this.hide();
        this.onPick(t.tier, false);
      });
      row.append(b);
      if (t.tier === 'reveal' && !free) {
        const v = el('button', 'hint-video interactive', `${ICONS.video}<span>Watch</span>`);
        v.disabled = !s.adReady;
        v.setAttribute('aria-label', 'Reveal for a video');
        v.addEventListener('click', () => {
          this.hide();
          this.onPick('reveal', true);
        });
        row.append(v);
      }
      this.list.append(row);
    }
    if (!s.freeHint && s.bulbs < HINT_COST.reveal) {
      const more = el('button', 'btn-primary interactive get-bulbs', `${ICONS.video} +2 Bulbs`);
      more.disabled = !s.adReady;
      more.addEventListener('click', () => {
        this.hide();
        this.onGetBulbs();
      });
      this.list.append(more);
    }
    this.overlay.classList.add('show');
  }

  hide() {
    this.overlay.classList.remove('show');
  }
}
