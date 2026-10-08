export type Ease = (t: number) => number;

export const easeOutCubic: Ease = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutBack: Ease = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

interface Tween {
  elapsed: number;
  duration: number;
  ease: Ease;
  onUpdate: (k: number) => void;
  resolve: () => void;
}

/** Minimal tween runner, ticked by the game loop (so it pauses with the game). */
export class Tweens {
  private list: Tween[] = [];

  to(duration: number, onUpdate: (k: number) => void, ease: Ease = easeOutCubic): Promise<void> {
    return new Promise((resolve) => {
      this.list.push({ elapsed: 0, duration, ease, onUpdate, resolve });
      onUpdate(0);
    });
  }

  update(dt: number) {
    if (this.list.length === 0) return;
    const done: Tween[] = [];
    for (const tw of this.list) {
      tw.elapsed += dt;
      const t = Math.min(1, tw.elapsed / tw.duration);
      tw.onUpdate(tw.ease(t));
      if (t >= 1) done.push(tw);
    }
    if (done.length) {
      this.list = this.list.filter((tw) => !done.includes(tw));
      done.forEach((tw) => tw.resolve());
    }
  }

  clear() {
    this.list = [];
  }
}

export const wait = (tweens: Tweens, seconds: number) => tweens.to(seconds, () => {}, (t) => t);
