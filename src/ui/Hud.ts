import { el, ICONS } from './dom';

/** Level-play HUD: level number (top left), match meter (top centre), timer (top right). Nothing else. */
export class Hud {
  readonly root = el('div', 'hud');
  readonly levelsBtn = el('button', 'icon-btn interactive', ICONS.grid);
  private levelChip = el('div', 'chip');
  private timeChip = el('div', 'chip dim');
  private meter = el('div', 'meter');
  private fill = el('div', 'meter-fill');
  private label = el('div', 'meter-label');
  private toastEl = el('div', 'toast');
  private hand = el('div', 'hand', ICONS.hand);
  private toastTimer = 0;

  constructor(parent: HTMLElement) {
    this.levelsBtn.setAttribute('aria-label', 'Levels');
    const left = el('div', 'hud-left');
    left.append(this.levelsBtn, this.levelChip);
    const track = el('div', 'meter-track');
    track.append(this.fill);
    this.meter.append(track, this.label);
    const right = el('div', 'hud-right');
    right.append(this.timeChip);
    this.root.append(left, this.meter, right);
    parent.append(this.root, this.toastEl, this.hand);
  }

  setLevel(text: string) {
    this.levelChip.textContent = text;
  }

  setTime(seconds: number) {
    const s = Math.floor(seconds);
    this.timeChip.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  setMeter(v: number) {
    this.fill.style.transform = `scaleX(${v.toFixed(3)})`;
    this.label.textContent = `${Math.round(v * 100)}%`;
    this.meter.classList.toggle('glow', v >= 0.7);
  }

  set dim(v: boolean) {
    this.root.classList.toggle('dim', v);
  }
  set visible(v: boolean) {
    this.root.classList.toggle('hidden', !v);
  }

  toast(text: string, seconds = 1.6) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), seconds * 1000);
  }

  /** Wordless drag demo: a hand swiping along the level's free axis. */
  showHand(direction: 'h' | 'v' | null) {
    this.hand.classList.remove('show', 'h', 'v');
    if (direction) this.hand.classList.add('show', direction);
  }
}
