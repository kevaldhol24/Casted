import { el, ICONS } from './dom';

/**
 * Level-play HUD, per the design doc: pause (top left), match meter + level number (top centre),
 * Bulbs + hint button (top right). A mute button stays visible next to pause (portal requirement).
 */
export class Hud {
  readonly root = el('div', 'hud');
  readonly pauseBtn = el('button', 'icon-btn interactive', ICONS.pause);
  readonly muteBtn = el('button', 'icon-btn interactive', ICONS.soundOn);
  readonly hintBtn = el('button', 'hint-btn interactive');
  private bulbCount = el('span', 'bulb-count');
  private meter = el('div', 'meter');
  private fill = el('div', 'meter-fill');
  private levelLabel = el('span');
  private pctLabel = el('span');
  private toastEl = el('div', 'toast');
  private hand = el('div', 'hand', ICONS.hand);
  private toastTimer = 0;

  constructor(parent: HTMLElement) {
    this.pauseBtn.setAttribute('aria-label', 'Pause');
    this.muteBtn.setAttribute('aria-label', 'Mute');
    this.hintBtn.setAttribute('aria-label', 'Hint');
    this.hintBtn.innerHTML = ICONS.bulb;
    this.hintBtn.append(this.bulbCount);
    const left = el('div', 'hud-left');
    left.append(this.pauseBtn, this.muteBtn);
    const track = el('div', 'meter-track');
    track.append(this.fill);
    const label = el('div', 'meter-label');
    label.append(this.levelLabel, this.pctLabel);
    this.meter.append(track, label);
    const right = el('div', 'hud-right');
    right.append(this.hintBtn);
    this.root.append(left, this.meter, right);
    parent.append(this.root, this.toastEl, this.hand);
  }

  setLevel(text: string) {
    this.levelLabel.textContent = text;
  }

  setMeter(v: number) {
    this.fill.style.transform = `scaleX(${v.toFixed(3)})`;
    this.pctLabel.textContent = `${Math.round(v * 100)}%`;
    this.meter.classList.toggle('glow', v >= 0.7);
  }

  setBulbs(n: number) {
    this.bulbCount.textContent = String(n);
  }

  setMuted(m: boolean) {
    this.muteBtn.innerHTML = m ? ICONS.soundOff : ICONS.soundOn;
    this.muteBtn.setAttribute('aria-label', m ? 'Unmute' : 'Mute');
  }

  set hintVisible(v: boolean) {
    this.hintBtn.style.visibility = v ? 'visible' : 'hidden';
  }

  /** One attention pulse on the hint button (never auto-opens the panel). */
  pulseHint() {
    this.hintBtn.classList.remove('pulse');
    void this.hintBtn.offsetWidth;
    this.hintBtn.classList.add('pulse');
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
