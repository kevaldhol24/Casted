import * as THREE from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { junkify } from './junkify';
import { levelPieces, type LevelDef, type LevelObject } from './levels';
import { SILHOUETTES } from './shapes';

/** Largest silhouette side of a procedural object, in world units. */
export const OBJECT_SIZE = 1.9;
/**
 * Authored models are centred and scaled so their bounding sphere has this radius. The mask camera covers
 * ±1.45, so the shadow fits from every angle; the editor uses the same normalisation, so stored rotations hold.
 */
export const MODEL_RADIUS = 1.3;

export interface LevelObjectInstance {
  root: THREE.Object3D;
  dispose(): void;
}

const proceduralMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true });

/**
 * Builds or fetches a level's object. Procedural objects are built on the spot; GLB models are fetched once
 * (GLTFLoader + DRACOLoader are imported only when the first model level loads) and cloned per play.
 */
export class LevelLoader {
  private loader: Promise<GLTFLoader> | null = null;
  private models = new Map<string, Promise<THREE.Object3D>>();

  /** @param palette procedural object colours (the world's palette; load() can override per level). */
  constructor(private palette: string[]) {}

  /** Every piece's object for a level (one for a single-object level), in piece order. */
  load(level: LevelDef, palette = this.palette): Promise<LevelObjectInstance[]> {
    return Promise.all(levelPieces(level).map((p) => this.loadObject(p.object, palette, level.id)));
  }

  async loadObject(o: LevelObject, palette = this.palette, id = '?'): Promise<LevelObjectInstance> {
    if (o.kind === 'procedural') return this.procedural(o, palette, id);
    const template = await this.model(o.url);
    return { root: template.clone(true), dispose() {} };
  }

  /** Start fetching a level's models in the background (the next level, while this one plays). */
  preload(level: LevelDef | undefined) {
    if (!level) return;
    for (const p of levelPieces(level)) if (p.object.kind === 'model') this.model(p.object.url).catch(() => {});
  }

  private procedural(o: Extract<LevelObject, { kind: 'procedural' }>, palette: string[], id: string): LevelObjectInstance {
    const make = SILHOUETTES[o.silhouette];
    if (!make) throw new Error(`[level ${id}] unknown silhouette "${o.silhouette}"`);
    const geo = junkify(make(), { seed: o.seed, junk: o.junk, size: OBJECT_SIZE, palette });
    return { root: prepare(new THREE.Mesh(geo, proceduralMat)), dispose: () => geo.dispose() };
  }

  /** Load a GLB by site-relative URL (cached). */
  model(url: string): Promise<THREE.Object3D> {
    let p = this.models.get(url);
    if (!p) {
      p = this.gltf()
        .then((l) => l.loadAsync(import.meta.env.BASE_URL + url))
        .then((g) => normalizeModel(g.scene));
      p.catch(() => this.models.delete(url));
      this.models.set(url, p);
    }
    return p;
  }

  /** Load a GLB the editor was handed as a file. */
  async modelFromBuffer(buffer: ArrayBuffer): Promise<THREE.Object3D> {
    const l = await this.gltf();
    const g = await l.parseAsync(buffer, '');
    return normalizeModel(g.scene);
  }

  private gltf(): Promise<GLTFLoader> {
    this.loader ??= Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/loaders/DRACOLoader.js')]).then(
      // DRACOLoader finds its decoder through import.meta.url; Vite bundles those files, fetched only on first use.
      ([{ GLTFLoader }, { DRACOLoader }]) => new GLTFLoader().setDRACOLoader(new DRACOLoader()),
    );
    return this.loader;
  }
}

/** Centre a model on the origin and scale its bounding sphere to MODEL_RADIUS; enable shadows + the mask layer. */
export function normalizeModel(scene: THREE.Object3D): THREE.Object3D {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(scene);
  // Radius = farthest vertex from the box centre: tighter than the box's own sphere (its corners are usually
  // empty), and still a true bound, so the shadow fits the mask from every angle.
  const sphere = new THREE.Sphere(box.getCenter(new THREE.Vector3()), 0);
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    const pos = (o as THREE.Mesh).isMesh ? (o as THREE.Mesh).geometry.getAttribute('position') : null;
    if (!pos) return;
    for (let i = 0; i < pos.count; i++) sphere.radius = Math.max(sphere.radius, v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).distanceTo(sphere.center));
  });
  const s = sphere.radius > 0 ? MODEL_RADIUS / sphere.radius : 1;
  const root = new THREE.Group();
  scene.position.sub(sphere.center);
  const inner = new THREE.Group();
  inner.scale.setScalar(s);
  inner.add(scene);
  root.add(inner);
  return prepare(root);
}

/** Every mesh casts and receives shadows. (ShadowScene adds the mask layer when the object goes in.) */
function prepare(obj: THREE.Object3D): THREE.Object3D {
  obj.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}
