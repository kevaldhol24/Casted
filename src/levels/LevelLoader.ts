import * as THREE from 'three';
import type { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/gltf/draco_decoder.wasm?url';
import dracoWrapperUrl from 'three/examples/jsm/libs/draco/gltf/draco_wasm_wrapper.js?url';
import { junkify } from './junkify';
import { levelPieces, type LevelDef, type LevelObject } from './levels';
import { assetUrl } from '../util/assetUrl';
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
  /** The Draco decoder is fetched by preload() (once a level is playing), not at boot: level 1 needs none. */
  private draco: { preload(): unknown } | null = null;
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

  /** Start fetching a level's models, and the Draco decoder, in the background (the next level, while this one plays). */
  preload(level: LevelDef | undefined) {
    void this.gltf().then(() => this.draco?.preload());
    if (!level) return;
    for (const p of levelPieces(level)) if (p.object.kind === 'model') this.model(p.object.url).catch(() => {});
  }

  private procedural(o: Extract<LevelObject, { kind: 'procedural' }>, palette: string[], id: string): LevelObjectInstance {
    const make = SILHOUETTES[o.silhouette];
    if (!make) throw new Error(`[level ${id}] unknown silhouette "${o.silhouette}"`);
    const geo = junkify(make(), { seed: o.seed, junk: o.junk, size: OBJECT_SIZE, palette });
    return { root: prepare(new THREE.Mesh(geo, proceduralMat)), dispose: () => geo.dispose() };
  }

  /**
   * Load a GLB by site-relative URL (cached). The file downloads while the loader chunks and the Draco decoder do,
   * instead of after them: on a slow connection each step costs a round trip.
   */
  model(url: string): Promise<THREE.Object3D> {
    let p = this.models.get(url);
    if (!p) {
      const bytes = fetch(assetUrl(url)).then((r) => {
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.arrayBuffer();
      });
      p = Promise.all([this.gltf(), bytes])
        .then(([l, buf]) => l.parseAsync(buf, ''))
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
      // Only the glTF WASM decoder ships (bundled by the ?url imports above, fetched on first use); vite.config.ts
      // drops DRACOLoader's default decoder files, including the asm.js fallback no supported browser needs.
      // The decoder itself downloads on the first Draco model or on preload(), whichever comes first.
      ([{ GLTFLoader }, { DRACOLoader }]) => {
        const draco = new DRACOLoader().setDecoderPath({ js: dracoWrapperUrl, wasm: dracoWasmUrl });
        this.draco = draco;
        return new GLTFLoader().setDRACOLoader(draco);
      },
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
