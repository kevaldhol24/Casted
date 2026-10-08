/**
 * Builds the authored World 1 models (npm run models):
 *   tools/w1-models/models.mjs → public/models/w1/<name>.glb (Draco), public/masks/<id>.png,
 *   and points src/data/levels/w1/<id>.json at the model (other level fields are kept).
 * Run it again after editing a model; output is deterministic.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { draco, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { rasterize } from './w1-models/kit.mjs';
import { W1_MODELS } from './w1-models/models.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Must match src/levels/LevelLoader.ts (MODEL_RADIUS, normalizeModel's farthest-vertex radius) and the mask camera. */
const MODEL_RADIUS = 1.3;
const MASK_HALF = 1.45;
const MASK_SIZE = 128;

const write = (rel, data) => {
  const p = resolve(root, rel);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, data);
};

// --- PNG ------------------------------------------------------------------------------------------
const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
};
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
/** Mask PNG like the level editor's: shape opaque white, background transparent, top row first. */
function maskPng(bits, size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const row = (size - 1 - y) * (size * 4 + 1);
    for (let x = 0; x < size; x++) if (bits[y * size + x]) raw.fill(255, row + 1 + x * 4, row + 5 + x * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

/** Same pretty-printing as the level editor's save endpoint (vite.config.ts). */
const formatJson = (v) => JSON.stringify(v, null, 2).replace(/\[\n\s+([^[\]{}]*?)\n\s+\]/g, (_m, inner) => `[${inner.split(/,\n\s+/).join(', ')}]`) + '\n';

// --- build ----------------------------------------------------------------------------------------
const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

let failed = false;
for (const [id, def] of Object.entries(W1_MODELS)) {
  const model = def.build();

  // Safety: everything that isn't core must stay inside the core's footprint, or the target would change.
  const all = model.parts.map((p) => p.geo);
  const bb = new THREE.Box3();
  for (const g of all) {
    g.computeBoundingBox();
    bb.union(g.boundingBox);
  }
  const cell = 0.01;
  const W = Math.ceil((bb.max.x - bb.min.x) / cell) + 4;
  const H = Math.ceil((bb.max.y - bb.min.y) / cell) + 4;
  const x0 = bb.min.x - 2 * cell;
  const y0 = bb.min.y - 2 * cell;
  const coreBits = rasterize(model.parts.filter((p) => p.core).map((p) => p.geo), x0, y0, cell, W, H);
  const allBits = rasterize(all, x0, y0, cell, W, H);
  let extra = 0;
  for (let i = 0; i < allBits.length; i++) if (allBits[i] && !coreBits[i]) extra++;

  // The game normalises a model to a bounding sphere of MODEL_RADIUS around the box centre; do the same for the mask.
  const sphere = new THREE.Sphere(bb.getCenter(new THREE.Vector3()), 0);
  const v = new THREE.Vector3();
  for (const g of all) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) sphere.radius = Math.max(sphere.radius, v.fromBufferAttribute(pos, i).distanceTo(sphere.center));
  }
  const s = MODEL_RADIUS / sphere.radius;
  const px = (2 * MASK_HALF) / MASK_SIZE;
  const shifted = all.map((g) => g.clone().translate(-sphere.center.x, -sphere.center.y, -sphere.center.z).scale(s, s, s));
  const mask = rasterize(shifted, -MASK_HALF, -MASK_HALF, px, MASK_SIZE, MASK_SIZE);
  let filled = 0;
  let edge = false;
  for (let y = 0; y < MASK_SIZE; y++)
    for (let x = 0; x < MASK_SIZE; x++)
      if (mask[y * MASK_SIZE + x]) {
        filled++;
        if (!x || !y || x === MASK_SIZE - 1 || y === MASK_SIZE - 1) edge = true;
      }

  // glTF: one primitive per colour, flat normals, Draco.
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh(def.name);
  for (const { color, geo } of model.meshes()) {
    const c = new THREE.Color(color); // linear, as glTF base colours are
    const mat = doc.createMaterial(color).setBaseColorFactor([c.r, c.g, c.b, 1]).setRoughnessFactor(0.85).setMetallicFactor(0).setDoubleSided(true);
    const acc = (name, type) => doc.createAccessor().setType('VEC3').setArray(geo.getAttribute(name).array).setBuffer(buffer);
    mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION', acc('position')).setAttribute('NORMAL', acc('normal')).setMaterial(mat));
  }
  doc.createScene(def.name).addChild(doc.createNode(def.name).setMesh(mesh));
  await doc.transform(weld(), draco({ method: 'edgebreaker' }));
  const glb = await io.writeBinary(doc);
  write(`public/models/w1/${def.name}.glb`, glb);
  write(`public/masks/${id}.png`, maskPng(mask, MASK_SIZE));

  const jsonPath = `src/data/levels/w1/${id}.json`;
  const level = JSON.parse(readFileSync(resolve(root, jsonPath), 'utf8'));
  const { solution: _drop, mask: _m, ...rest } = level;
  const updated = { ...rest, object: { kind: 'model', url: `models/w1/${def.name}.glb` }, mask: `masks/${id}.png` };
  // Keep the hand-written key order: object right after targetName.
  const ordered = {};
  for (const k of ['id', 'world', 'targetName', 'object', 'freeAxes', 'startOffset', 'threshold', 'parTime', 'allowMirror', 'reveal', 'endless', 'mask']) if (k in updated) ordered[k] = updated[k];
  write(jsonPath, formatJson(ordered));

  const tris = model.meshes().reduce((n, m) => n + m.geo.getAttribute('position').count / 3, 0);
  const warn = [extra ? `${extra} px outside core!` : '', edge ? 'touches mask edge!' : ''].filter(Boolean).join(' ');
  if (warn) failed = true;
  console.log(`${id} ${def.name.padEnd(16)} ${(glb.byteLength / 1024).toFixed(1).padStart(5)} KB  ${String(tris).padStart(5)} tris  ${model.parts.length} parts  mask ${((filled / MASK_SIZE ** 2) * 100).toFixed(0)}%  ${warn}`);
}
if (failed) process.exitCode = 1;
