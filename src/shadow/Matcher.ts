/** Binary masks are Uint8Array of 0/1, size × size, row 0 = bottom. */
export type Mask = Uint8Array;

export function rgbaToMask(rgba: Uint8Array, size: number, out?: Mask): Mask {
  const m = out ?? new Uint8Array(size * size);
  for (let i = 0, n = size * size; i < n; i++) m[i] = rgba[i * 4] > 127 ? 1 : 0;
  return m;
}

/** 1-px dilation (4-neighbour), so tiny edge errors don't block a near-perfect solve. */
export function dilate(mask: Mask, size: number): Mask {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      out[i] =
        mask[i] ||
        (x > 0 && mask[i - 1]) ||
        (x < size - 1 && mask[i + 1]) ||
        (y > 0 && mask[i - size]) ||
        (y < size - 1 && mask[i + size])
          ? 1
          : 0;
    }
  return out;
}

export function count(mask: Mask): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) c += mask[i];
  return c;
}

/** The level's target, prepared once at level load. */
export class TargetMask {
  readonly dilated: Mask;
  constructor(readonly mask: Mask, readonly size: number) {
    this.dilated = dilate(mask, size);
  }

  /**
   * Intersection-over-Union of the live silhouette (raw RGBA readback) against the target.
   * Intersection is taken against the 1-px dilated target; union against the exact target.
   */
  iou(liveRgba: Uint8Array): number {
    let inter = 0;
    let union = 0;
    const t = this.mask;
    const d = this.dilated;
    for (let i = 0, n = t.length; i < n; i++) {
      const live = liveRgba[i * 4] > 127 ? 1 : 0;
      inter += live & d[i];
      union += live | t[i];
    }
    return union === 0 ? 0 : Math.min(1, inter / union);
  }

  iouMask(live: Mask): number {
    let inter = 0;
    let union = 0;
    for (let i = 0; i < live.length; i++) {
      inter += live[i] & this.dilated[i];
      union += live[i] | this.mask[i];
    }
    return union === 0 ? 0 : Math.min(1, inter / union);
  }
}

/**
 * Display meter: raw IoU feels stingy, so `floor` → 0% and the threshold → 100%. The floor is 0.5 per the design
 * doc, raised to the level's start IoU when that is higher (axis-locked levels can't start below 0.5).
 */
export const meterFromIou = (iou: number, threshold: number, floor = 0.5) =>
  Math.max(0, Math.min(1, (iou - floor) / (threshold - floor)));

/** Box-blurred float copy of a mask (0..255 bytes), used for the smooth outline/fill texture on the wall. */
export function blurToBytes(mask: Mask, size: number, radius: number, passes = 2): Uint8Array {
  const src = new Float32Array(mask.length);
  for (let i = 0; i < mask.length; i++) src[i] = mask[i];
  const tmp = new Float32Array(mask.length);
  const win = radius * 2 + 1;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < size; y++) {
      let acc = 0;
      for (let x = -radius; x <= radius; x++) acc += src[y * size + Math.min(size - 1, Math.max(0, x))];
      for (let x = 0; x < size; x++) {
        tmp[y * size + x] = acc / win;
        acc += src[y * size + Math.min(size - 1, x + radius + 1)] - src[y * size + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < size; x++) {
      let acc = 0;
      for (let y = -radius; y <= radius; y++) acc += tmp[Math.min(size - 1, Math.max(0, y)) * size + x];
      for (let y = 0; y < size; y++) {
        src[y * size + x] = acc / win;
        acc += tmp[Math.min(size - 1, y + radius + 1) * size + x] - tmp[Math.max(0, y - radius) * size + x];
      }
    }
  }
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = Math.round(src[i] * 255);
  return out;
}
