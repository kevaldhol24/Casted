import type { SaveData } from '../core/Store';
import { controlRow, isDesktop, keyLabel } from './ControlsHint';
import { el } from './dom';

type Settings = SaveData['settings'];

/** Pause menu (Resume, Restart, Levels, Settings, Controls) and the Settings and Controls views in the same card. */
export class PausePanel {
  private overlay = el('div', 'overlay center');
  private menu = el('div', 'pause-menu');
  private settingsView = el('div', 'settings');
  private controlsView = el('div', 'controls-page');
  private controlsBackRow = el('div', 'btn-row');
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
  private privacyView?: HTMLElement;

  constructor(parent: HTMLElement) {
    const card = el('div', 'card interactive');
    const resume = el('button', 'btn-primary interactive', 'Resume');
    const restart = el('button', 'btn-secondary interactive', 'Restart');
    const levels = el('button', 'btn-secondary interactive', 'Levels');
    const settings = el('button', 'btn-secondary interactive', 'Settings');
    const controls = el('button', 'btn-secondary interactive', 'Controls');
    const menu = el('button', 'btn-secondary interactive', 'Menu');
    const row = el('div', 'btn-row');
    row.append(restart, levels);
    const row2 = el('div', 'btn-row');
    row2.append(settings, controls);
    const row3 = el('div', 'btn-row');
    row3.append(menu);
    this.menu.append(resume, row, row2, row3);

    const controlsBack = el('button', 'btn-secondary interactive', 'Back');
    this.controlsBackRow.append(controlsBack);

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
    // Relative link: privacy.html ships inside every build, so it opens without leaving the game's own files.
    const privacy = el('a', 'privacy-link interactive', 'Privacy policy');
    privacy.href = 'privacy.html';
    privacy.target = '_blank';
    privacy.rel = 'noopener';
    // The Android app has no tabs: the link would replace the game in the WebView with no way back.
    if (import.meta.env.MODE === 'android') {
      privacy.addEventListener('click', (e) => {
        e.preventDefault();
        this.openPrivacy();
      });
    }
    const back = el('button', 'btn-secondary interactive', 'Back');
    const backRow = el('div', 'btn-row');
    backRow.append(back);
    this.settingsView.append(
      slider('music', 'Music', 0, 1, 0.05),
      slider('sfx', 'Sounds', 0, 1, 0.05),
      slider('sensitivity', 'Rotation speed', 0.4, 2, 0.05),
      qualityRow,
      toggle,
      privacy,
      backRow,
    );

    card.append(this.title, this.menu, this.settingsView, this.controlsView);
    this.overlay.append(card);
    parent.append(this.overlay);

    resume.addEventListener('click', () => this.fire(this.onResume));
    restart.addEventListener('click', () => this.fire(this.onRestart));
    levels.addEventListener('click', () => this.fire(this.onLevels));
    settings.addEventListener('click', () => this.view('settings'));
    controls.addEventListener('click', () => this.view('controls'));
    controlsBack.addEventListener('click', () => this.view('menu'));
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

  /** Android only: the privacy policy in a full-screen frame over the game, closed by its Back button or the system back. */
  private openPrivacy() {
    if (this.privacyView) return;
    const view = el('div', 'privacy-view interactive');
    const close = el('button', 'btn-secondary interactive', 'Back');
    const frame = el('iframe');
    frame.src = 'privacy.html';
    frame.title = 'Privacy policy';
    close.addEventListener('click', () => this.closePrivacy());
    view.append(close, frame);
    this.overlay.after(view);
    this.privacyView = view;
  }

  /** Closes the privacy policy if it is open; true when it was. */
  closePrivacy(): boolean {
    if (!this.privacyView) return false;
    this.privacyView.remove();
    this.privacyView = undefined;
    return true;
  }

  private fire(fn: () => void) {
    this.hide();
    fn();
  }

  /**
   * Mouse and keyboard on PC, gestures on touch screens. Built when opened: key labels follow the keyboard layout,
   * which loads after boot. No Escape anywhere: it leaves fullscreen in the browser (CrazyGames restricted keys).
   */
  private buildControls() {
    const rows = isDesktop()
      ? [
          controlRow('turn'),
          controlRow('twist'),
          `<span class="keys"><span class="kbd-mouse">Right-drag</span></span><span>Twist too</span>`,
          controlRow('lamp'),
          controlRow('switch'),
          `<span class="keys"><kbd>${keyLabel('KeyH')}</kbd></span><span>Hint</span>`,
          `<span class="keys"><kbd>${keyLabel('KeyP')}</kbd></span><span>Pause</span>`,
        ]
      : [
          `<span class="keys"><span class="kbd-mouse">Drag</span></span><span>Turn</span>`,
          `<span class="keys"><span class="kbd-mouse">Two-finger twist</span></span><span>Twist</span>`,
          `<span class="keys"><span class="kbd-mouse">Lamp pad</span></span><span>Move the lamp</span>`,
          `<span class="keys"><span class="kbd-mouse">Switch</span></span><span>Switch object</span>`,
        ];
    this.controlsView.innerHTML = '';
    for (const r of rows) this.controlsView.append(el('div', 'controls-row', r));
    this.controlsView.append(this.controlsBackRow);
  }

  private view(v: 'menu' | 'settings' | 'controls') {
    if (v === 'controls') this.buildControls();
    this.title.textContent = v === 'menu' ? 'Paused' : v === 'settings' ? 'Settings' : 'Controls';
    this.menu.style.display = v === 'menu' ? '' : 'none';
    this.settingsView.style.display = v === 'settings' ? '' : 'none';
    this.controlsView.style.display = v === 'controls' ? '' : 'none';
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
