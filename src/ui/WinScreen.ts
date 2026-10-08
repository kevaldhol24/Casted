import { el, ICONS } from './dom';

const AUTO_ADVANCE_S = 4;

export interface WinInfo {
  title: string;
  stars: number;
  time: number;
  parTime: number;
  isLast: boolean;
}

/** Win card: stars, time, a big "Next" (auto-advances after 4 s idle), small Replay / Levels. */
export class WinScreen {
  private overlay = el('div', 'overlay');
  private title = el('h2', 'win-title');
  private sub = el('p', 'win-sub');
  private stars: HTMLElement[] = [];
  private next = el('button', 'btn-primary interactive', 'Next<span class="auto"></span>');
  private replay = el('button', 'btn-secondary interactive', 'Replay');
  private levels = el('button', 'btn-secondary interactive', 'Levels');
  private autoBar: HTMLElement;
  private autoT = -1;
  onNext = () => {};
  onReplay = () => {};
  onLevels = () => {};

  constructor(parent: HTMLElement) {
    const card = el('div', 'card');
    const starRow = el('div', 'stars');
    for (let i = 0; i < 3; i++) {
      const s = el('div', 'star', ICONS.star);
      this.stars.push(s);
      starRow.append(s);
    }
    const row = el('div', 'btn-row');
    row.append(this.replay, this.levels);
    card.append(this.title, starRow, this.sub, this.next, row);
    this.overlay.append(card);
    parent.append(this.overlay);
    this.autoBar = this.next.querySelector('.auto')!;
    this.next.addEventListener('click', () => this.fire(this.onNext));
    this.replay.addEventListener('click', () => this.fire(this.onReplay));
    this.levels.addEventListener('click', () => this.fire(this.onLevels));
    // Any interaction with the card cancels the auto-advance.
    card.addEventListener('pointerdown', () => this.cancelAuto());
  }

  private fire(fn: () => void) {
    if (!this.overlay.classList.contains('show')) return;
    this.hide();
    fn();
  }

  show(info: WinInfo) {
    this.title.textContent = info.title;
    const t = Math.round(info.time);
    const parHit = info.time <= info.parTime;
    this.sub.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}${parHit ? ' · under par' : ` · par ${info.parTime}s`}`;
    this.next.firstChild!.textContent = info.isLast ? 'Levels' : 'Next';
    this.levels.style.display = info.isLast ? 'none' : '';
    this.stars.forEach((s) => s.classList.remove('on', 'off-shown'));
    this.overlay.classList.add('show');
    this.stars.forEach((s, i) =>
      setTimeout(() => s.classList.add(i < info.stars ? 'on' : 'off-shown'), 250 + i * 220),
    );
    this.autoT = info.isLast ? -1 : 0;
    this.autoBar.style.transform = 'scaleX(0)';
  }

  hide() {
    this.overlay.classList.remove('show');
    this.autoT = -1;
  }

  private cancelAuto() {
    this.autoT = -1;
    this.autoBar.style.transform = 'scaleX(0)';
  }

  update(dt: number) {
    if (this.autoT < 0) return;
    this.autoT += dt;
    this.autoBar.style.transform = `scaleX(${Math.min(1, this.autoT / AUTO_ADVANCE_S)})`;
    if (this.autoT >= AUTO_ADVANCE_S) this.fire(this.onNext);
  }
}
