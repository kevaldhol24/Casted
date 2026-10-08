import type { SaveData } from '../core/Store';
import { el } from './dom';

type Settings = SaveData['settings'];

/** Pause menu (Resume, Restart, Levels, Settings) and the Settings view in the same card. */
export class PausePanel {
  private overlay = el('div', 'overlay center');
  private menu = el('div', 'pause-menu');
  private settingsView = el('div', 'settings');
  private title = el('h2', 'levels-title');
  onResume = () => {};
  onRestart = () => {};
  onLevels = () => {};
  onSettings = (_s: Settings) => {};
  private settings!: Settings;
  private inputs: Record<string, HTMLInputElement> = {};

  constructor(parent: HTMLElement) {
    const card = el('div', 'card interactive');
    const resume = el('button', 'btn-primary interactive', 'Resume');
    const restart = el('button', 'btn-secondary interactive', 'Restart');
    const levels = el('button', 'btn-secondary interactive', 'Levels');
    const settings = el('button', 'btn-secondary interactive', 'Settings');
    const row = el('div', 'btn-row');
    row.append(restart, levels);
    const row2 = el('div', 'btn-row');
    row2.append(settings);
    this.menu.append(resume, row, row2);

    const slider = (key: 'music' | 'sfx' | 'sensitivity', label: string, min: number, max: number, step: number) => {
      const wrap = el('label', 'setting');
      const input = el('input');
      input.type = 'range';
      input.min = String(min);
      input.max = String(max);
      input.step = String(step);
      input.className = 'interactive';
      input.addEventListener('input', () => {
        this.settings[key] = Number(input.value);
        this.onSettings(this.settings);
      });
      wrap.append(el('span', '', label), input);
      this.inputs[key] = input;
      return wrap;
    };
    const toggle = el('label', 'setting toggle');
    const reduce = el('input');
    reduce.type = 'checkbox';
    reduce.className = 'interactive';
    reduce.addEventListener('change', () => {
      this.settings.reduceMotion = reduce.checked;
      this.onSettings(this.settings);
    });
    this.inputs.reduceMotion = reduce;
    toggle.append(el('span', '', 'Reduce motion'), reduce);
    const back = el('button', 'btn-secondary interactive', 'Back');
    const backRow = el('div', 'btn-row');
    backRow.append(back);
    this.settingsView.append(
      slider('music', 'Music', 0, 1, 0.05),
      slider('sfx', 'Sounds', 0, 1, 0.05),
      slider('sensitivity', 'Rotation speed', 0.4, 2, 0.05),
      toggle,
      backRow,
    );

    card.append(this.title, this.menu, this.settingsView);
    this.overlay.append(card);
    parent.append(this.overlay);

    resume.addEventListener('click', () => this.fire(this.onResume));
    restart.addEventListener('click', () => this.fire(this.onRestart));
    levels.addEventListener('click', () => this.fire(this.onLevels));
    settings.addEventListener('click', () => this.view('settings'));
    back.addEventListener('click', () => this.view('menu'));
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.fire(this.onResume);
    });
  }

  get open() {
    return this.overlay.classList.contains('show');
  }

  private fire(fn: () => void) {
    this.hide();
    fn();
  }

  private view(v: 'menu' | 'settings') {
    this.title.textContent = v === 'menu' ? 'Paused' : 'Settings';
    this.menu.style.display = v === 'menu' ? '' : 'none';
    this.settingsView.style.display = v === 'settings' ? '' : 'none';
  }

  show(settings: Settings, startIn: 'menu' | 'settings' = 'menu') {
    this.settings = settings;
    this.inputs.music.value = String(settings.music);
    this.inputs.sfx.value = String(settings.sfx);
    this.inputs.sensitivity.value = String(settings.sensitivity);
    this.inputs.reduceMotion.checked = settings.reduceMotion;
    this.view(startIn);
    this.overlay.classList.add('show');
  }

  hide() {
    this.overlay.classList.remove('show');
  }
}
