import { el } from './dom';

export type Control = 'turn' | 'twist' | 'lamp' | 'switch';

/** What the current level lets the player do (decides which rows show). */
export interface ControlsContext {
  turn: boolean;
  twist: boolean;
  lamp: boolean;
  /** Only the lamp moves: a plain drag moves it. */
  lightOnly: boolean;
  switch: boolean;
}

const STORAGE_KEY = 'casted.controls';
/** A mouse is the main pointer (PC). Touch devices get the wordless hand instead. */
export const isDesktop = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

/**
 * Keys are read by physical position (KeyboardEvent.code), so WASD sits under the left hand on any layout (ZQSD on
 * AZERTY). Labels follow the player's layout where the browser tells us (Keyboard Map API, Chromium); else QWERTY.
 */
let layout: Map<string, string> | null = null;
export async function loadKeyboardLayout() {
  try {
    const kb = (navigator as Navigator & { keyboard?: { getLayoutMap(): Promise<Map<string, string>> } }).keyboard;
    if (kb?.getLayoutMap) layout = await kb.getLayoutMap();
  } catch {}
}
/** The label printed on the key at physical position `code` (e.g. 'KeyW' → 'Z' on AZERTY). */
export const keyLabel = (code: string) => (layout?.get(code) ?? code.replace(/^Key/, '')).toUpperCase();

const key = (k: string) => `<kbd>${k}</kbd>`;
const keys = (...codes: string[]) => codes.map((c) => key(keyLabel(c))).join('');
const MOUSE = '<span class="kbd-mouse">Drag</span>';

/** One row per control: the keys, then what it does. Shared with the pause menu's Controls page. */
export function controlRow(c: Control, lightOnly = false): string {
  switch (c) {
    case 'turn':
      return `<span class="keys">${MOUSE} <i>or</i> ${keys('KeyW', 'KeyA', 'KeyS', 'KeyD')}</span><span>Turn</span>`;
    case 'twist':
      return `<span class="keys">${key('Shift')} + ${MOUSE} <i>or</i> ${keys('KeyQ', 'KeyE')}</span><span>Twist</span>`;
    case 'lamp':
      return `<span class="keys">${lightOnly ? `${MOUSE} <i>or</i> ` : ''}${key('←')}${key('↑')}${key('↓')}${key('→')}</span><span>Move the lamp</span>`;
    case 'switch':
      return `<span class="keys">${key('Tab')}</span><span>Switch object</span>`;
  }
}

/**
 * PC-only controls strip (bottom-left) while a level is playing: only the controls this level uses, each ticked off
 * the first time the player uses it. A control used once is learned for good on this device (localStorage), and
 * once every row of a level is learned the strip stays away.
 */
export class ControlsHint {
  private root = el('div', 'controls-hint');
  private rows = new Map<Control, HTMLElement>();
  private learned: Partial<Record<Control, boolean>>;
  private shown = false;
  private wanted = false;
  private desktop = isDesktop();
  private hideTimer = 0;

  constructor(parent: HTMLElement) {
    this.learned = ControlsHint.load();
    parent.append(this.root);
    void loadKeyboardLayout();
  }

  private static load(): Partial<Record<Control, boolean>> {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') ?? {};
    } catch {
      return {};
    }
  }

  /** A level started: build the rows it needs (none if everything is already learned). */
  setLevel(ctx: ControlsContext) {
    clearTimeout(this.hideTimer);
    this.rows.clear();
    this.root.innerHTML = '';
    if (!this.desktop) return (this.wanted = false);
    const needed: Control[] = [];
    if (ctx.turn) needed.push('turn');
    if (ctx.twist) needed.push('twist');
    if (ctx.lamp) needed.push('lamp');
    if (ctx.switch) needed.push('switch');
    this.wanted = needed.some((c) => !this.learned[c]);
    if (!this.wanted) return;
    this.root.append(el('div', 'controls-title', 'Controls'));
    for (const c of needed) {
      const row = el('div', `controls-row${this.learned[c] ? ' done' : ''}`, controlRow(c, ctx.lightOnly));
      this.rows.set(c, row);
      this.root.append(row);
    }
  }

  /** Touch screens have no strip: the first level that lets the player twist says how, once, until they have. */
  touchTip(ctx: ControlsContext): string | null {
    return !this.desktop && ctx.twist && !this.learned.twist ? 'Twist with two fingers' : null;
  }

  /** The player used a control: tick its row, remember it, and leave once every row is ticked. */
  used(c: Control) {
    if (!this.learned[c]) {
      this.learned[c] = true;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.learned));
      } catch {}
    }
    const row = this.rows.get(c);
    if (!row || row.classList.contains('done')) return;
    row.classList.add('done');
    if ([...this.rows.keys()].every((k) => this.learned[k])) this.hideTimer = window.setTimeout(() => (this.wanted = false), 1500);
  }

  /** Called every frame: shown only while the level is actually being played. */
  setActive(active: boolean) {
    const show = active && this.wanted;
    if (show === this.shown) return;
    this.shown = show;
    this.root.classList.toggle('show', show);
  }
}
