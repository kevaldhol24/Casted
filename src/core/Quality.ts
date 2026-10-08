export type Tier = 'high' | 'medium' | 'low';
export type QualitySetting = 'auto' | Tier;

export interface TierSpec {
  dprCap: number;
  shadowMap: number;
  /** PCF blur radius for the visible (not scored) shadow. */
  shadowRadius: number;
  bloom: boolean;
  vignette: boolean;
  grain: boolean;
}

/** The design doc's quality table. */
export const TIERS: Record<Tier, TierSpec> = {
  high: { dprCap: 2, shadowMap: 1024, shadowRadius: 3, bloom: true, vignette: true, grain: true },
  medium: { dprCap: 1.5, shadowMap: 1024, shadowRadius: 3, bloom: false, vignette: true, grain: false },
  low: { dprCap: 1, shadowMap: 512, shadowRadius: 1.5, bloom: false, vignette: false, grain: false },
};

const ORDER: Tier[] = ['high', 'medium', 'low'];

/** Desktop GPU → high, most phones → medium, low-memory devices → low. */
export function detectTier(): Tier {
  const nav = navigator as Navigator & { deviceMemory?: number };
  if ((nav.deviceMemory !== undefined && nav.deviceMemory <= 2) || (nav.hardwareConcurrency ?? 4) <= 2) return 'low';
  if (matchMedia('(pointer: coarse)').matches) return 'medium';
  return 'high';
}

export const lowerTier = (t: Tier): Tier | null => ORDER[ORDER.indexOf(t) + 1] ?? null;

const SLOW_FRAME_MS = 22;
const WINDOW_S = 2;
/** Frames right after a level load are heavy (geometry + mask setup) and don't count. */
const SETTLE_S = 1.5;

/**
 * Watches frame time; if the average stays above 22 ms for 2 s, asks for one tier down.
 * Never upgrades on its own (an upgrade mid-level would flicker).
 */
export class FrameMonitor {
  private acc = 0;
  private frames = 0;
  private settle = SETTLE_S;
  onSlow: () => void = () => {};

  reset() {
    this.acc = 0;
    this.frames = 0;
    this.settle = SETTLE_S;
  }

  /** dt in seconds, unclamped. */
  sample(dt: number) {
    if (this.settle > 0) {
      this.settle -= dt;
      return;
    }
    this.acc += dt;
    this.frames++;
    if (this.acc < WINDOW_S) return;
    const avgMs = (this.acc / this.frames) * 1000;
    this.acc = 0;
    this.frames = 0;
    if (avgMs > SLOW_FRAME_MS) {
      this.settle = SETTLE_S;
      this.onSlow();
    }
  }
}
