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
  private timer = el('div', 'chip hud-timer');
  private toastEl = el('div', 'toast');
  private hand = el('div', 'hand', ICONS.hand);
  /**
   * Assembly levels: one Switch button (cycles the object being turned) with a dot per object under it. No
   * shapes on it: a picture of each piece would give the answer away.
   */
  private switchWrap = el('div', 'piece-switch');
  readonly switchBtn = el('button', 'switch-btn interactive', `${ICONS.swap}<span>Switch</span>`);
  private dots = el('div', 'piece-dots');
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
    right.append(this.timer, this.hintBtn);
    this.setTimer(null);
    this.root.append(left, this.meter, right);
    this.switchBtn.setAttribute('aria-label', 'Switch object');
    // A drag that starts on the button must not spin the object.
    this.switchBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.switchWrap.append(this.switchBtn, this.dots);
    this.switchWrap.style.display = 'none';
    parent.append(this.root, this.switchWrap, this.toastEl, this.hand);
  }

  setLevel(text: string) {
    this.levelLabel.textContent = text;
  }

  setMeter(v: number) {
    this.fill.style.transform = `scaleX(${v.toFixed(3)})`;
    this.pctLabel.textContent = `${Math.round(v * 100)}%`;
    this.meter.classList.toggle('glow', v >= 0.7);
  }

  /** Endless countdown (null hides it). Under 10 s it turns red and pulses. */
  setTimer(seconds: number | null) {
    this.timer.style.display = seconds === null ? 'none' : '';
    if (seconds === null) return;
    const s = Math.max(0, Math.ceil(seconds));
    this.timer.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    this.timer.classList.toggle('low', seconds < 10);
  }

  setBulbs(n: number) {
    this.bulbCount.textContent = String(n);
  }

  setMuted(m: boolean) {
    this.muteBtn.innerHTML = m ? ICONS.soundOff : ICONS.soundOn;
    this.muteBtn.setAttribute('aria-label', m ? 'Unmute' : 'Mute');
  }

  set hintVisible(v: boolean) {
    this.hintBtn.style.display = v ? '' : 'none';
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
    this.switchWrap.classList.toggle('hidden', !v);
  }

  /** Assembly: show the Switch button when at least two objects can be turned (dots: one per object, locked dim). */
  setPieces(locked: boolean[]) {
    this.dots.innerHTML = '';
    for (const l of locked) this.dots.append(el('span', l ? 'dot locked' : 'dot'));
    this.switchWrap.style.display = locked.filter((l) => !l).length >= 2 ? '' : 'none';
  }

  setActivePiece(i: number) {
    [...this.dots.children].forEach((d, k) => d.classList.toggle('on', k === i));
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

