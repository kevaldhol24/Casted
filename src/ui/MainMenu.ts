import { el, ICONS } from './dom';

export interface ModeTile {
  key: 'daily' | 'endless' | 'zen' | 'album';
  label: string;
  /** Shown under the label: unlock rule, "Coming soon", or a status like a streak. */
  note: string;
  enabled: boolean;
}

/**
 * Main menu (return visits): big Play, mode tiles, settings and mute, Bulbs. A first-time player never sees it;
 * page load goes straight into level 1. The bottom strip is kept clear for a CrazyGames banner.
 */
export class MainMenu {
  private overlay = el('div', 'overlay menu');
  private tiles = el('div', 'mode-grid');
  private bulbs = el('div', 'chip');
  readonly settingsBtn = el('button', 'icon-btn interactive', ICONS.cog);
  readonly muteBtn = el('button', 'icon-btn interactive', ICONS.soundOn);
  onPlay = () => {};
  onMode = (_key: ModeTile['key']) => {};

  constructor(parent: HTMLElement) {
    const top = el('div', 'menu-top');
    const right = el('div', 'hud-right');
    right.append(this.bulbs);
    const left = el('div', 'hud-left');
    left.append(this.settingsBtn, this.muteBtn);
    top.append(left, right);
    this.settingsBtn.setAttribute('aria-label', 'Settings');
    this.muteBtn.setAttribute('aria-label', 'Mute');

    const center = el('div', 'menu-center');
    const logo = el('h1', 'logo', 'CASTED');
    const play = el('button', 'btn-primary btn-play interactive', 'Play');
    center.append(logo, play, this.tiles);
    const banner = el('div', 'banner-slot');
    this.overlay.append(top, center, banner);
    parent.append(this.overlay);
    play.addEventListener('click', () => {
      this.hide();
      this.onPlay();
    });
  }

  get open() {
    return this.overlay.classList.contains('show');
  }

  setMuted(m: boolean) {
    this.muteBtn.innerHTML = m ? ICONS.soundOff : ICONS.soundOn;
  }

  show(bulbs: number, tiles: ModeTile[]) {
    this.bulbs.innerHTML = `<span class="bulb-inline">${ICONS.bulb}</span>&nbsp;${bulbs}`;
    this.tiles.innerHTML = '';
    for (const t of tiles) {
      const b = el('button', 'mode-tile interactive', `<span class="mode-label">${t.label}</span><span class="mode-note">${t.note}</span>`);
      b.disabled = !t.enabled;
      b.addEventListener('click', () => {
        this.hide();
        this.onMode(t.key);
      });
      this.tiles.append(b);
    }
    this.overlay.classList.add('show');
  }

  hide() {
    this.overlay.classList.remove('show');
  }
}
