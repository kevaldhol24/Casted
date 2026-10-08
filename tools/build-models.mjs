/**
 * Builds the authored models (npm run models). Output is deterministic; run it again after editing a model.
 *   World 1 (tools/models/w1.mjs): one object per level → public/models/w1/<name>.glb, public/masks/<id>.png,
 *     and points src/data/levels/w1/<id>.json at the model (other level fields are kept).
 *   World 2 (tools/models/w2.mjs): assembly levels, one GLB per piece → public/models/w2/<name>.glb; writes the
 *     whole level JSON, with each piece's offset and scale worked out so the pieces fit the mask together.
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
import { rasterize } from './models/kit.mjs';
import { W1_MODELS } from './models/w1.mjs';
import { W2_LEVELS } from './models/w2.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** Must match src/levels/LevelLoader.ts (MODEL_RADIUS, normalizeModel's farthest-vertex radius) and the mask camera. */
const MODEL_RADIUS = 1.3;
const MASK_HALF = 1.45;
const MASK_SIZE = 128;
/** Assembly pieces keep this share of the mask half-size free, so no piece's shadow can touch the edge. */
const ASSEMBLY_FIT = 0.97;

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
const round = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

// --- model helpers --------------------------------------------------------------------------------
const io = new NodeIO().registerExtensions([KHRDracoMeshCompression]).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});

/**
 * Bounds as the game sees them (normalizeModel: box centre, farthest-vertex radius), plus the safety check:
 * pixels covered by non-core parts outside the core's footprint (must be 0, or the target would change).
 */
function analyse(model) {
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
  const center = bb.getCenter(new THREE.Vector3());
  let radius = 0;
  const v = new THREE.Vector3();
  for (const g of all) {
    const pos = g.getAttribute('position');
    for (let i = 0; i < pos.count; i++) radius = Math.max(radius, v.fromBufferAttribute(pos, i).distanceTo(center));
  }
  return { all, center, radius, extra };
}

/** glTF: one primitive per colour, flat normals, Draco. */
async function writeGlb(rel, name, model) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const mesh = doc.createMesh(name);
  for (const { color, geo } of model.meshes()) {
    const c = new THREE.Color(color); // linear, as glTF base colours are
    const mat = doc.createMaterial(color).setBaseColorFactor([c.r, c.g, c.b, 1]).setRoughnessFactor(0.85).setMetallicFactor(0).setDoubleSided(true);
    const acc = (attr) => doc.createAccessor().setType('VEC3').setArray(geo.getAttribute(attr).array).setBuffer(buffer);
    mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION', acc('position')).setAttribute('NORMAL', acc('normal')).setMaterial(mat));
  }
  doc.createScene(name).addChild(doc.createNode(name).setMesh(mesh));
  await doc.transform(weld(), draco({ method: 'edgebreaker' }));
  const glb = await io.writeBinary(doc);
  write(rel, glb);
  return glb.byteLength;
}

/** Rasterise geometries already in mask space; returns the bitmap, its coverage and whether it touches the edge. */
function maskOf(geos) {
  const px = (2 * MASK_HALF) / MASK_SIZE;
  const mask = rasterize(geos, -MASK_HALF, -MASK_HALF, px, MASK_SIZE, MASK_SIZE);
  let filled = 0;
  let edge = false;
  for (let y = 0; y < MASK_SIZE; y++)
    for (let x = 0; x < MASK_SIZE; x++)
      if (mask[y * MASK_SIZE + x]) {
        filled++;
        if (!x || !y || x === MASK_SIZE - 1 || y === MASK_SIZE - 1) edge = true;
      }
  return { mask, cover: filled / MASK_SIZE ** 2, edge };
}

const tris = (model) => model.meshes().reduce((n, m) => n + m.geo.getAttribute('position').count / 3, 0);
let failed = false;
const report = (label, kb, model, cover, problems) => {
  const warn = problems.filter(Boolean).join(' ');
  if (warn) failed = true;
  console.log(`${label.padEnd(34)} ${kb.toFixed(1).padStart(5)} KB  ${String(tris(model)).padStart(5)} tris  ${String(model.parts.length).padStart(2)} parts  mask ${(cover * 100).toFixed(0)}%  ${warn}`);
};

// --- World 1: one object per level ---------------------------------------------------------------
for (const [id, def] of Object.entries(W1_MODELS)) {
  const model = def.build();
  const { all, center, radius, extra } = analyse(model);
  const s = MODEL_RADIUS / radius;
  const m = maskOf(all.map((g) => g.clone().translate(-center.x, -center.y, -center.z).scale(s, s, s)));
  const bytes = await writeGlb(`public/models/w1/${def.name}.glb`, def.name, model);
  write(`public/masks/${id}.png`, maskPng(m.mask, MASK_SIZE));

  const jsonPath = `src/data/levels/w1/${id}.json`;
  const level = JSON.parse(readFileSync(resolve(root, jsonPath), 'utf8'));
  const { solution: _drop, mask: _m, ...rest } = level;
  const updated = { ...rest, object: { kind: 'model', url: `models/w1/${def.name}.glb` }, mask: `masks/${id}.png` };
  // Keep the hand-written key order: object right after targetName.
  const ordered = {};
  for (const k of ['id', 'world', 'targetName', 'object', 'freeAxes', 'startOffset', 'threshold', 'parTime', 'allowMirror', 'reveal', 'endless', 'mask']) if (k in updated) ordered[k] = updated[k];
  write(jsonPath, formatJson(ordered));
  report(`${id} ${def.name}`, bytes / 1024, model, m.cover, [extra && `${extra} px outside core!`, m.edge && 'touches mask edge!']);
}

// --- World 2: assembly levels --------------------------------------------------------------------
for (const lv of W2_LEVELS) {
  // All pieces are modelled in one shared frame (the target's). One scale k maps that frame to the mask, chosen
  // so every piece's bounding sphere stays inside the mask square however the piece is turned.
  const built = lv.pieces.map((p) => ({ def: p, model: p.build() }));
  for (const b of built) Object.assign(b, analyse(b.model));
  const reach = Math.max(...built.map((b) => Math.max(Math.abs(b.center.x), Math.abs(b.center.y)) + b.radius));
  const k = (MASK_HALF * ASSEMBLY_FIT) / reach;
  // Push pieces apart along the light (z) until their spheres can't intersect: no clipping while they turn,
  // and depth never changes a shadow.
  const zs = built.map((b) => b.center.z * k);
  for (let i = 1; i < built.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = built[j];
      const b = built[i];
      const dxy = Math.hypot(a.center.x - b.center.x, a.center.y - b.center.y) * k;
      const need = (a.radius + b.radius) * k * 1.02;
      if (dxy < need) zs[i] = Math.min(zs[i], zs[j] - Math.sqrt(need * need - dxy * dxy));
    }
  }
  const zMid = (Math.max(...zs) + Math.min(...zs)) / 2;

  const pieces = [];
  for (const [i, b] of built.entries()) {
    const url = `models/w2/${b.def.name}.glb`;
    const bytes = await writeGlb(`public/${url}`, b.def.name, b.model);
    report(`${lv.id} ${b.def.name}`, bytes / 1024, b.model, 0, [b.extra && `${b.extra} px outside core!`]);
    pieces.push({
      object: { kind: 'model', url },
      offset: [round(b.center.x * k), round(b.center.y * k), round(zs[i] - zMid)],
      scale: round((b.radius * k) / MODEL_RADIUS),
      freeAxes: b.def.freeAxes,
      startOffset: b.def.startOffset,
      ...(b.def.locked ? { locked: true } : {}),
    });
  }
  const m = maskOf(built.flatMap((b) => b.all.map((g) => g.clone().scale(k, k, k))));
  write(`public/masks/${lv.id}.png`, maskPng(m.mask, MASK_SIZE));
  write(
    `src/data/levels/w2/${lv.id}.json`,
    formatJson({
      id: lv.id,
      world: 2,
      targetName: lv.targetName,
      pieces,
      threshold: lv.threshold,
      parTime: lv.parTime,
      allowMirror: false,
      reveal: lv.reveal,
      ...(lv.endless === false ? { endless: false } : {}),
      mask: `masks/${lv.id}.png`,
    }),
  );
  console.log(`${lv.id} ${lv.targetName}: k ${k.toFixed(3)}, mask ${(m.cover * 100).toFixed(0)}%${m.edge ? '  touches mask edge!' : ''}`);
  if (m.edge) failed = true;
}
if (failed) process.exitCode = 1;
