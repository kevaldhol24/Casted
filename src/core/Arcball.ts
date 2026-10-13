import * as THREE from 'three';
import type { Axis } from '../levels/levels';
import type { RotateIntent } from './Input';

const DAMPING_PER_60HZ_FRAME = 0.92;
const KEY_SPEED_DEG = 110;
const DEG = Math.PI / 180;

/** Turntable pose: degrees of tilt (about the frame's right axis) and turn (about the tilted up axis) from `base`. */
export interface TurntablePose {
  pitch: number;
  yaw: number;
}

/**
 * Screen-space rotation: dragging right always turns the object right as seen, never around its local axes.
 * The axes come from `frame` — the light's view (mask camera), which faces the wall like the player's camera but
 * is aligned with the shadow, so a yaw-only level squeezes the shadow sideways without skewing it.
 * Locked axes are dropped from the intent. Releasing keeps spinning with damping until a new grab.
 *
 * Free rotation lets turns build up roll (right, down, left, up leaves the object twisted: rotations don't
 * commute). Objects with roll locked use a turntable instead: the pose is tilt × turn × base, set only by how far
 * each has gone, so no order of drags ever twists the object.
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
  private q2 = new THREE.Quaternion();
  private axis = new THREE.Vector3();
  /** Turntable objects: their unrotated pose and how far they are tilted and turned from it. */
  private turntables = new WeakMap<THREE.Object3D, { base: THREE.Quaternion } & TurntablePose>();

  /** @param target what rotates (assembly levels switch it to the active piece) */
  constructor(public target: THREE.Object3D, private frame: THREE.Object3D) {}

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
    // Roll-only object: a plain sideways drag spins it (like Shift-drag), so nothing needs a modifier.
    if (this.freeAxes.length === 1 && this.freeAxes[0] === 'z') {
      this.frameIntent.roll += i.roll - i.yaw;
      return;
    }
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

  /**
   * Make `obj` a turntable around `base` (its solved pose), starting at `pose`; null makes it free again.
   * The level calls this for pieces with roll locked.
   */
  setTurntable(obj: THREE.Object3D, base: THREE.Quaternion | null, pose: TurntablePose = { pitch: 0, yaw: 0 }) {
    if (!base) {
      this.turntables.delete(obj);
      return;
    }
    this.turntables.set(obj, { base: base.clone(), ...pose });
    this.compose(obj);
  }

  /** A turntable object's tilt and turn (null if it rotates freely). */
  pose(obj: THREE.Object3D): TurntablePose | null {
    const t = this.turntables.get(obj);
    return t ? { pitch: t.pitch, yaw: t.yaw } : null;
  }

  /** Put a turntable object at a tilt and turn (hints and the snap move it this way, so it never picks up roll). */
  setPose(obj: THREE.Object3D, pose: TurntablePose) {
    const t = this.turntables.get(obj);
    if (!t) return;
    t.pitch = pose.pitch;
    t.yaw = pose.yaw;
    this.compose(obj);
  }

  private compose(obj: THREE.Object3D) {
    const t = this.turntables.get(obj)!;
    const m = this.frame.matrixWorld;
    this.q.setFromAxisAngle(this.axis.setFromMatrixColumn(m, 0).normalize(), t.pitch * DEG);
    this.q2.setFromAxisAngle(this.axis.setFromMatrixColumn(m, 1).normalize(), t.yaw * DEG);
    obj.quaternion.copy(this.q).multiply(this.q2).multiply(t.base);
  }

  /** Rotate by screen-space degrees around the frame's up (yaw), right (pitch) and forward (roll) axes. */
  apply(yaw: number, pitch: number, roll: number) {
    const free = this.freeAxes;
    const t = this.turntables.get(this.target);
    if (t) {
      const dp = free.includes('x') ? pitch : 0;
      const dy = free.includes('y') ? yaw : 0;
      if (dp === 0 && dy === 0) return;
      t.pitch += dp;
      t.yaw += dy;
      this.compose(this.target);
      this.changed = true;
      return;
    }
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
