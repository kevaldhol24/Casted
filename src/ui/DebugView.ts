import { el } from './dom';

/** ?debug=1: live mask vs target (green = both, red = live only, blue = target only) + IoU. */
export class DebugView {
  private canvas = el('canvas');
  private text = el('div');
  private ctx: CanvasRenderingContext2D;
  private img: ImageData;

  constructor(parent: HTMLElement, private size: number) {
    const box = el('div', 'debug');
    this.canvas.width = this.canvas.height = size;
    box.append(this.canvas, this.text);
    parent.append(box);
    this.ctx = this.canvas.getContext('2d')!;
    this.img = this.ctx.createImageData(size, size);
  }

  draw(live: Uint8Array, target: Uint8Array, iou: number, extra: string) {
    const s = this.size;
    const d = this.img.data;
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const src = y * s + x;
        const dst = ((s - 1 - y) * s + x) * 4; // flip: mask row 0 is the bottom
        const l = live[src * 4] > 127;
        const t = target[src] === 1;
        d[dst] = l && !t ? 230 : 20;
        d[dst + 1] = l && t ? 200 : 20;
        d[dst + 2] = t && !l ? 230 : 20;
        d[dst + 3] = 255;
      }
    this.ctx.putImageData(this.img, 0, 0);
    this.text.textContent = `IoU ${iou.toFixed(3)} ${extra}`;
  }
}
