export interface RotateIntent {
  /** Screen-space degrees: yaw (left/right), pitch (up/down), roll (twist). */
  yaw: number;
  pitch: number;
  roll: number;
}

export interface InputHandlers {
  onGrab(): void;
  onDrag(intent: RotateIntent): void;
  onRelease(): void;
  onKey(code: string): void;
}

const DEG_PER_PX_MOUSE = 0.5;
const DEG_PER_PX_TOUCH = 0.8;
/** Keys the host portal page must never scroll on. */
const BLOCKED_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'PageUp', 'PageDown']);

/**
 * Pointer / touch / keyboard → rotate intents. One-finger or left drag rotates; Shift-drag, right-drag or a
 * two-finger twist rolls. Keyboard rotation (WASD/arrows, Q/E) is exposed as held-key state for smooth steps.
 */
export class Input {
  sensitivity = 1;
  enabled = true;
  readonly keys = new Set<string>();
  private pointers = new Map<number, { x: number; y: number; type: string }>();
  private twistAngle: number | null = null;
  private rollDrag = false;

  constructor(private el: HTMLElement, private h: InputHandlers) {
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // The host portal page must not scroll; scrollable panels (album) keep their own wheel scrolling.
    window.addEventListener(
      'wheel',
      (e) => {
        if (!(e.target as HTMLElement).closest?.('.album-grid')) e.preventDefault();
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if (BLOCKED_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.h.onKey(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  get dragging() {
    return this.pointers.size > 0;
  }

  private down = (e: PointerEvent) => {
    if (!this.enabled) return;
    this.el.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    this.rollDrag = e.shiftKey || e.button === 2;
    if (this.pointers.size === 2) this.twistAngle = this.angleBetween();
    if (this.pointers.size === 1) this.h.onGrab();
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p || !this.enabled) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    const k = (p.type === 'touch' ? DEG_PER_PX_TOUCH : DEG_PER_PX_MOUSE) * this.sensitivity;

    if (this.pointers.size >= 2) {
      // Two-finger twist → roll. Ignore translation so a pinch-ish wobble doesn't also rotate.
      const a = this.angleBetween();
      if (this.twistAngle !== null) {
        let d = a - this.twistAngle;
        if (d > Math.PI) d -= Math.PI * 2;
        if (d < -Math.PI) d += Math.PI * 2;
        this.h.onDrag({ yaw: 0, pitch: 0, roll: (-d * 180) / Math.PI });
      }
      this.twistAngle = a;
      return;
    }
    if (this.rollDrag || e.shiftKey) this.h.onDrag({ yaw: 0, pitch: 0, roll: -dx * k });
    else this.h.onDrag({ yaw: dx * k, pitch: dy * k, roll: 0 });
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.delete(e.pointerId)) return;
    if (this.pointers.size < 2) this.twistAngle = null;
    if (this.pointers.size === 0) this.h.onRelease();
  };

  private angleBetween() {
    const [a, b] = [...this.pointers.values()];
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  /** Held-key rotation direction, in units of "full speed" per axis. */
  keyAxes(): RotateIntent {
    return { ...this.wasdAxes(), yaw: this.axis('KeyD', 'ArrowRight') - this.axis('KeyA', 'ArrowLeft'), pitch: this.axis('KeyS', 'ArrowDown') - this.axis('KeyW', 'ArrowUp') };
  }

  /** WASD + Q/E only (light-control levels keep the arrow keys for the lamp). */
  wasdAxes(): RotateIntent {
    return { yaw: this.axis('KeyD') - this.axis('KeyA'), pitch: this.axis('KeyS') - this.axis('KeyW'), roll: this.axis('KeyQ') - this.axis('KeyE') };
  }

  /** Arrow keys only: x right, y down. */
  arrowAxes() {
    return { x: this.axis('ArrowRight') - this.axis('ArrowLeft'), y: this.axis('ArrowDown') - this.axis('ArrowUp') };
  }

  private axis(...codes: string[]) {
    return codes.some((c) => this.keys.has(c)) ? 1 : 0;
  }
}
