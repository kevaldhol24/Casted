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
  onMenu = () => {};
  onSettings = (_s: Settings) => {};
  private settings!: Settings;
  private inputs: Record<string, HTMLInputElement> = {};
  private quality = el('select', 'interactive');
  private back!: () => void;

  constructor(parent: HTMLElement) {
    const card = el('div', 'card interactive');
    const resume = el('button', 'btn-primary interactive', 'Resume');
    const restart = el('button', 'btn-secondary interactive', 'Restart');
    const levels = el('button', 'btn-secondary interactive', 'Levels');
    const settings = el('button', 'btn-secondary interactive', 'Settings');
    const menu = el('button', 'btn-secondary interactive', 'Menu');
    const row = el('div', 'btn-row');
    row.append(restart, levels);
    const row2 = el('div', 'btn-row');
    row2.append(settings, menu);
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
    const qualityRow = el('label', 'setting');
    for (const [v, t] of [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']] as const) {
      const o = el('option');
      o.value = v;
      o.textContent = t;
      this.quality.append(o);
    }
    this.quality.addEventListener('change', () => {
      this.settings.quality = this.quality.value as Settings['quality'];
      this.onSettings(this.settings);
    });
    qualityRow.append(el('span', '', 'Quality'), this.quality);
    const back = el('button', 'btn-secondary interactive', 'Back');
    const backRow = el('div', 'btn-row');
    backRow.append(back);
    this.settingsView.append(
      slider('music', 'Music', 0, 1, 0.05),
      slider('sfx', 'Sounds', 0, 1, 0.05),
      slider('sensitivity', 'Rotation speed', 0.4, 2, 0.05),
      qualityRow,
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
    menu.addEventListener('click', () => this.fire(this.onMenu));
    back.addEventListener('click', () => this.back());
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target !== this.overlay) return;
      if (this.menu.style.display === 'none') this.back();
      else this.fire(this.onResume);
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

  /**
   * `standalone` opens Settings on its own (from the main menu): Back closes the card instead of returning
   * to the pause menu.
   */
  show(settings: Settings, standalone = false, onClose: () => void = () => {}) {
    const startIn = standalone ? 'settings' : 'menu';
    this.back = standalone ? () => this.fire(onClose) : () => this.view('menu');
    this.settings = settings;
    this.inputs.music.value = String(settings.music);
    this.inputs.sfx.value = String(settings.sfx);
    this.inputs.sensitivity.value = String(settings.sensitivity);
    this.inputs.reduceMotion.checked = settings.reduceMotion;
    this.quality.value = settings.quality;
    this.view(startIn);
    this.overlay.classList.add('show');
  }

  hide() {
    this.overlay.classList.remove('show');
  }
}
