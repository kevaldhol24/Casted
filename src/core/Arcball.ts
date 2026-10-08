import * as THREE from 'three';
import type { Axis } from '../levels/levels';
import type { RotateIntent } from './Input';

const DAMPING_PER_60HZ_FRAME = 0.92;
const KEY_SPEED_DEG = 110;
const DEG = Math.PI / 180;

/**
 * Screen-space rotation: dragging right always turns the object right as seen, never around its local axes.
 * The axes come from `frame` — the light's view (mask camera), which faces the wall like the player's camera but
 * is aligned with the shadow, so a yaw-only level squeezes the shadow sideways without skewing it.
 * Locked axes are dropped from the intent. Releasing keeps spinning with damping until a new grab.
 */
export class Arcball {
  enabled = true;
  freeAxes: Axis[] = ['x', 'y', 'z'];
  /** Degrees per second, screen-space; estimated while dragging, decays after release. */
  private velocity = { yaw: 0, pitch: 0, roll: 0 };
  private frameIntent = { yaw: 0, pitch: 0, roll: 0 };
  private dragging = false;
  /** True when the rotation changed this frame (consumed by the scorer). */
  changed = false;
  private q = new THREE.Quaternion();
  private axis = new THREE.Vector3();

  constructor(private target: THREE.Object3D, private frame: THREE.Object3D) {}

  grab() {
    this.dragging = true;
    this.velocity = { yaw: 0, pitch: 0, roll: 0 };
  }

  release() {
    this.dragging = false;
  }

  stop() {
    this.velocity = { yaw: 0, pitch: 0, roll: 0 };
    this.frameIntent = { yaw: 0, pitch: 0, roll: 0 };
  }

  drag(i: RotateIntent) {
    if (!this.enabled) return;
    this.frameIntent.yaw += i.yaw;
    this.frameIntent.pitch += i.pitch;
    this.frameIntent.roll += i.roll;
  }

  get moving() {
    const v = this.velocity;
    return this.dragging || Math.abs(v.yaw) + Math.abs(v.pitch) + Math.abs(v.roll) > 0.5;
  }

  update(dt: number, keys: RotateIntent) {
    this.changed = false;
    if (!this.enabled) {
      this.stop();
      return;
    }
    const f = this.frameIntent;
    f.yaw += keys.yaw * KEY_SPEED_DEG * dt;
    f.pitch += keys.pitch * KEY_SPEED_DEG * dt;
    f.roll += keys.roll * KEY_SPEED_DEG * dt;

    if (this.dragging) {
      // Smoothed velocity estimate from this frame's movement, used for the release fling.
      const a = 0.35;
      const inv = dt > 0 ? 1 / dt : 0;
      this.velocity.yaw = this.velocity.yaw * (1 - a) + f.yaw * inv * a;
      this.velocity.pitch = this.velocity.pitch * (1 - a) + f.pitch * inv * a;
      this.velocity.roll = this.velocity.roll * (1 - a) + f.roll * inv * a;
      this.apply(f.yaw, f.pitch, f.roll);
    } else {
      const v = this.velocity;
      this.apply(f.yaw + v.yaw * dt, f.pitch + v.pitch * dt, f.roll + v.roll * dt);
      const damp = Math.pow(DAMPING_PER_60HZ_FRAME, dt * 60);
      v.yaw *= damp;
      v.pitch *= damp;
      v.roll *= damp;
      if (Math.abs(v.yaw) + Math.abs(v.pitch) + Math.abs(v.roll) < 0.5) this.velocity = { yaw: 0, pitch: 0, roll: 0 };
    }
    this.frameIntent = { yaw: 0, pitch: 0, roll: 0 };
  }

  /** Rotate by screen-space degrees around the frame's up (yaw), right (pitch) and forward (roll) axes. */
  apply(yaw: number, pitch: number, roll: number) {
    const free = this.freeAxes;
    const m = this.frame.matrixWorld;
    const steps: [Axis, number, number][] = [
      ['y', yaw, 1],
      ['x', pitch, 0],
      ['z', roll, 2],
    ];
    for (const [axis, deg, col] of steps) {
      if (deg === 0 || !free.includes(axis)) continue;
      this.axis.setFromMatrixColumn(m, col).normalize();
      this.q.setFromAxisAngle(this.axis, deg * DEG);
      this.target.quaternion.premultiply(this.q);
      this.changed = true;
    }
    if (this.changed) this.target.quaternion.normalize();
  }
}
