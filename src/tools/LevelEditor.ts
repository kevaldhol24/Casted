/**
 * Dev-only level editor (tools/level-editor.html, served by `npm run dev` at /tools/level-editor.html; never built).
 * Loads a GLB or an existing level into the real ShadowScene, lets you rotate it to the solution, renders the
 * target mask with the game's own MaskRenderer, checks the level, and saves JSON + mask PNG (+ GLB) to the project.
 */
import * as THREE from 'three';
import { Arcball } from '../core/Arcball';
import { Renderer } from '../core/Renderer';
import { LevelLoader, type LevelObjectInstance } from '../levels/LevelLoader';
import { LEVELS, REVEALS, isSingle, type Axis, type LevelObject, type RevealKind, type SingleLevel } from '../levels/levels';

/** The editor authors single-object levels; assembly levels (World 2) come from npm run models. */
/** Single-object levels with a fixed light (light-control levels come from tools/models). */
const SINGLE = LEVELS.filter(isSingle).filter((l) => !l.light);
import { MaskRenderer } from '../shadow/MaskRenderer';
import { TargetMask, blurToBytes, rgbaToMask, type Mask } from '../shadow/Matcher';
import { ATTIC, LIGHT_DIR, OBJECT_POS, ShadowScene } from '../shadow/ShadowScene';

const SIZE = 128;
const MAX_START_IOU = 0.5;
const SOLUTION_MATCH = 0.97;

const $ = <T extends HTMLElement = HTMLInputElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('game');
const statusEl = $<HTMLDivElement>('status');
const checksEl = $<HTMLDivElement>('checks');

const renderer = new Renderer(canvas);
const scene = new ShadowScene(ATTIC, 1024);
const mask = new MaskRenderer(renderer.gl, scene.scene, 1.45);
const loader = new LevelLoader(ATTIC.objects);
const arcball = new Arcball(scene.objectRoot, mask.camera);
const sc = scene.shadowCenter();
renderer.setFocus([
  OBJECT_POS.clone().add(new THREE.Vector3(-1.4, -1.4, 0)),
  OBJECT_POS.clone().add(new THREE.Vector3(1.4, -1.4, 0)),
  sc.clone().add(new THREE.Vector3(-1.3, 1.3, 0)),
  sc.clone().add(new THREE.Vector3(1.3, 1.3, 0)),
]);
mask.aim(OBJECT_POS, LIGHT_DIR);
scene.outlineOpacity = 0;

/** What is loaded: the object description to save, and the GLB bytes when it came from a file. */
let source: { object: LevelObject; upload: ArrayBuffer | null } | null = null;
let solution: THREE.Quaternion | null = null; // world space
let target: TargetMask | null = null;
let targetMask: Mask | null = null;

const say = (msg: string, cls = '') => {
  statusEl.className = cls;
  statusEl.textContent = msg;
};

// --- object loading ---------------------------------------------------------------------------

const existing = $<HTMLSelectElement>('existing');
existing.append(new Option('—', ''));
for (const l of SINGLE) existing.append(new Option(`${l.id} · ${l.targetName}`, l.id));
const reveal = $<HTMLSelectElement>('reveal');
for (const r of REVEALS) reveal.append(new Option(r, r));

function useObject(obj: LevelObjectInstance) {
  scene.setObject(obj);
  scene.objectRoot.position.copy(OBJECT_POS);
  scene.objectRoot.quaternion.copy(mask.camera.quaternion);
  scene.objectRoot.updateMatrixWorld(true);
  solution = null;
  target = null;
  targetMask = null;
  scene.outlineOpacity = 0;
  drawMask($('targetMask'), null);
  checksEl.textContent = '';
}

existing.addEventListener('change', async () => {
  const level = SINGLE.find((l) => l.id === existing.value);
  if (!level) return;
  try {
    useObject((await loader.load(level))[0]);
  } catch (e) {
    return say(`Could not load ${level.id}: ${(e as Error).message}`, 'bad');
  }
  source = { object: level.object, upload: null };
  fillForm(level);
  // Existing levels open at their stored solution.
  const q = mask.camera.quaternion.clone();
  if (level.solution) q.multiply(new THREE.Quaternion().fromArray(level.solution).normalize());
  scene.objectRoot.quaternion.copy(q);
  setSolution();
  say(`Loaded ${level.id}. Its stored solution is set.`);
});

async function loadFile(file: File) {
  const buf = await file.arrayBuffer();
  try {
    const template = await loader.modelFromBuffer(buf.slice(0));
    useObject({ root: template, dispose() {} });
  } catch (e) {
    return say(`Could not read ${file.name}: ${(e as Error).message}`, 'bad');
  }
  const name = file.name.replace(/\.glb$/i, '').replace(/[^a-z0-9_-]+/gi, '_');
  $('modelName').value = name;
  existing.value = '';
  source = { object: { kind: 'model', url: '' }, upload: buf };
  if (!$('id').value) $('id').value = nextId(Number($('world').value) || 1);
  say(`Loaded ${file.name} (${(buf.byteLength / 1024).toFixed(0)} KB). Rotate until the shadow reads, then "Set solution here".`);
}

$('file').addEventListener('change', () => {
  const f = $('file').files?.[0];
  if (f) loadFile(f);
});
const drop = $<HTMLDivElement>('drop');
window.addEventListener('dragover', (e) => {
  e.preventDefault();
  drop.classList.add('show');
});
window.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) drop.classList.remove('show');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('show');
  const f = e.dataTransfer?.files[0];
  if (f) loadFile(f);
});

function nextId(world: number) {
  const n = LEVELS.filter((l) => l.world === world).length + 1;
  return `w${world}-${String(n).padStart(2, '0')}`;
}

// --- rotation ---------------------------------------------------------------------------------

// Plain pointer handling (the game's Input blocks keys and wheel page-wide, which would break the form).
let drag: { x: number; y: number; roll: boolean } | null = null;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => {
  canvas.setPointerCapture(e.pointerId);
  drag = { x: e.clientX, y: e.clientY, roll: e.shiftKey || e.button === 2 };
  arcball.grab();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x;
  const dy = e.clientY - drag.y;
  drag.x = e.clientX;
  drag.y = e.clientY;
  arcball.drag(drag.roll || e.shiftKey ? { yaw: 0, pitch: 0, roll: -dx * 0.4 } : { yaw: dx * 0.4, pitch: dy * 0.4, roll: 0 });
});
const endDrag = () => {
  drag = null;
  arcball.release();
  arcball.stop(); // no inertia while authoring
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

// Precise steps about the light's axes.
const nudges = $<HTMLDivElement>('nudges');
for (const axis of ['x', 'y', 'z'] as const) {
  nudges.append(Object.assign(document.createElement('span'), { textContent: axis }));
  for (const deg of [-90, -15, -1, 1, 15, 90]) {
    const b = document.createElement('button');
    b.textContent = deg > 0 ? `+${deg}` : String(deg);
    b.addEventListener('click', () => {
      arcball.freeAxes = ['x', 'y', 'z'];
      arcball.apply(axis === 'y' ? deg : 0, axis === 'x' ? deg : 0, axis === 'z' ? deg : 0);
    });
    nudges.append(b);
  }
}

// --- solution, checks -------------------------------------------------------------------------

function render(): Uint8Array {
  scene.objectRoot.updateMatrixWorld(true);
  return mask.render(SIZE);
}

function setSolution() {
  solution = scene.objectRoot.quaternion.clone();
  targetMask = rgbaToMask(render(), SIZE).slice();
  target = new TargetMask(targetMask, SIZE);
  drawMask($('targetMask'), targetMask);
  // Show the target outline on the wall exactly as the game will.
  const big = 512;
  const tex = new THREE.DataTexture(blurToBytes(rgbaToMask(mask.render(big), big), big, 5), big, big, THREE.RedFormat);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  scene.placeOutline(mask.camera, mask.halfSize, tex);
  scene.outlineOpacity = 0.9;
  runChecks();
}

$('setSolution').addEventListener('click', () => {
  if (!source) return say('Load an object first.', 'bad');
  setSolution();
  say('Solution set. Check the list below, then fill in the level and save.');
});
$('toSolution').addEventListener('click', () => solution && scene.objectRoot.quaternion.copy(solution));

function startOffset(): [number, number, number] {
  return [Number($('so-x').value) || 0, Number($('so-y').value) || 0, Number($('so-z').value) || 0];
}
function freeAxes(): Axis[] {
  return (['x', 'y', 'z'] as const).filter((a) => $(`ax-${a}`).checked);
}

/** Put the object at the level's start (same order as the game: x, y, z screen-space offsets from the solution). */
function placeStart(): number {
  if (!solution || !target) return NaN;
  const [px, py, pz] = startOffset();
  scene.objectRoot.quaternion.copy(solution);
  arcball.freeAxes = ['x', 'y', 'z'];
  arcball.apply(py, px, pz);
  return target.iou(render());
}

$('toStart').addEventListener('click', () => {
  const iou = placeStart();
  if (Number.isNaN(iou)) return say('Set a solution first.', 'bad');
  say(`Start IoU ${iou.toFixed(2)} ${iou < MAX_START_IOU ? '(good: under 0.5)' : '(high — the game will push the start further out)'}`, iou < MAX_START_IOU ? 'good' : 'bad');
});

function runChecks() {
  if (!solution || !target || !targetMask) return;
  const lines: [boolean, string][] = [];
  let filled = 0;
  let edge = false;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      if (targetMask[y * SIZE + x]) {
        filled++;
        if (x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1) edge = true;
      }
  const pct = (filled / (SIZE * SIZE)) * 100;
  lines.push([!edge, edge ? 'Shadow touches the mask edge (clipped)' : 'Shadow fits inside the mask']);
  lines.push([pct >= 10 && pct <= 60, `Shadow covers ${pct.toFixed(0)}% of the mask (10–60% reads well)`]);

  // Symmetric flips: these also count as solutions in the game.
  const cam = mask.camera.matrixWorld;
  let flips = 0;
  for (let col = 0; col < 3; col++) {
    const axis = new THREE.Vector3().setFromMatrixColumn(cam, col).normalize();
    scene.objectRoot.quaternion.copy(new THREE.Quaternion().setFromAxisAngle(axis, Math.PI).multiply(solution));
    if (target.iou(render()) >= SOLUTION_MATCH) flips++;
  }
  lines.push([true, `${1 + flips} matching rotation${flips ? 's' : ''} (solution + ${flips} symmetric flip${flips === 1 ? '' : 's'})`]);

  const startIou = placeStart();
  lines.push([startIou < MAX_START_IOU, `Start IoU ${startIou.toFixed(2)} (should be under ${MAX_START_IOU})`]);
  scene.objectRoot.quaternion.copy(solution);
  render();

  checksEl.innerHTML = '';
  for (const [ok, text] of lines) {
    const div = document.createElement('div');
    div.className = ok ? 'good' : 'bad';
    div.textContent = `${ok ? '✓' : '✗'} ${text}`;
    checksEl.append(div);
  }
}
for (const id of ['so-x', 'so-y', 'so-z']) $(id).addEventListener('change', runChecks);

// --- form, export -----------------------------------------------------------------------------

function fillForm(l: SingleLevel) {
  $('world').value = String(l.world);
  $('id').value = l.id;
  $('targetName').value = l.targetName;
  $('modelName').value = l.object.kind === 'model' ? (l.object.url.split('/').pop() ?? '').replace(/\.glb$/, '') : '';
  for (const a of ['x', 'y', 'z'] as const) $(`ax-${a}`).checked = l.freeAxes.includes(a);
  [$('so-x').value, $('so-y').value, $('so-z').value] = l.startOffset.map(String);
  $('threshold').value = String(l.threshold);
  $('parTime').value = String(l.parTime);
  reveal.value = l.reveal ?? 'none';
  $('allowMirror').checked = l.allowMirror;
}

function buildLevel(): SingleLevel {
  if (!source || !solution) throw new Error('Load an object and set its solution first.');
  const world = Number($('world').value);
  const id = $('id').value.trim();
  const targetName = $('targetName').value.trim();
  if (!targetName) throw new Error('Give the target a name.');
  if (freeAxes().length === 0) throw new Error('At least one axis must be free.');
  let object = source.object;
  if (object.kind === 'model') {
    const name = $('modelName').value.trim();
    if (!/^[a-z0-9_-]+$/i.test(name)) throw new Error('Model file name: letters, digits, - and _ only.');
    object = { kind: 'model', url: `models/w${world}/${name}.glb` };
  }
  // Store the solution in light space, so the level survives a change of light direction.
  const local = mask.camera.quaternion.clone().invert().multiply(solution).normalize();
  if (local.w < 0) local.set(-local.x, -local.y, -local.z, -local.w);
  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  const identity = local.angleTo(new THREE.Quaternion()) < 1e-4;
  // Key order matches the hand-written files, so diffs stay readable.
  return {
    id,
    world,
    targetName,
    object,
    ...(identity ? {} : { solution: [round(local.x), round(local.y), round(local.z), round(local.w)] as SingleLevel['solution'] }),
    freeAxes: freeAxes(),
    startOffset: startOffset(),
    threshold: Number($('threshold').value),
    parTime: Number($('parTime').value),
    allowMirror: $('allowMirror').checked,
    reveal: reveal.value as RevealKind,
    mask: `masks/${id}.png`,
  };
}

/** Target mask as a PNG: shape opaque white, background transparent, top row first. */
async function maskPng(): Promise<Blob> {
  if (!targetMask) throw new Error('Set a solution first.');
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const on = targetMask[y * SIZE + x];
      const i = ((SIZE - 1 - y) * SIZE + x) * 4;
      img.data.set(on ? [255, 255, 255, 255] : [0, 0, 0, 0], i);
    }
  ctx.putImageData(img, 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('PNG encode failed'))), 'image/png'));
}

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

function download(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('save').addEventListener('click', async () => {
  try {
    const level = buildLevel();
    const png = await maskPng();
    const body = {
      level,
      maskPng: toBase64(await png.arrayBuffer()),
      model: source?.upload && level.object.kind === 'model' ? { name: $('modelName').value.trim(), base64: toBase64(source.upload) } : undefined,
    };
    const res = await fetch('/__editor/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const out = await res.json();
    if (!res.ok) throw new Error(out.error ?? res.statusText);
    const msg = `Saved:\n${out.written.join('\n')}\n\nReload the game to play it (level select, or ?level=N).`;
    say(msg, 'good');
    // A new level file makes Vite reload this page; keep the message across it.
    try {
      sessionStorage.setItem('editor-status', msg);
    } catch {}
  } catch (e) {
    say((e as Error).message, 'bad');
  }
});
$('dlJson').addEventListener('click', () => {
  try {
    const level = buildLevel();
    download(`${level.id}.json`, new Blob([JSON.stringify(level, null, 2) + '\n'], { type: 'application/json' }));
  } catch (e) {
    say((e as Error).message, 'bad');
  }
});
$('dlMask').addEventListener('click', async () => {
  try {
    download(`${$('id').value.trim() || 'mask'}.png`, await maskPng());
  } catch (e) {
    say((e as Error).message, 'bad');
  }
});

// --- drawing, loop ----------------------------------------------------------------------------

function drawMask(c: HTMLCanvasElement, m: Mask | null, live?: Uint8Array) {
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const src = y * SIZE + x;
      const dst = ((SIZE - 1 - y) * SIZE + x) * 4;
      const l = live ? live[src * 4] > 127 : false;
      const t = m ? m[src] === 1 : false;
      // Same colours as ?debug=1: green both, red live only, blue target only.
      img.data.set(live ? [l && !t ? 230 : 20, l && t ? 200 : 20, t && !l ? 230 : 20, 255] : [t ? 240 : 0, t ? 240 : 0, t ? 240 : 0, 255], dst);
    }
  ctx.putImageData(img, 0, 0);
}

const clock = new THREE.Timer();
let sinceMask = 0;
renderer.gl.setAnimationLoop(() => {
  clock.update();
  const dt = Math.min(0.05, clock.getDelta());
  arcball.freeAxes = ['x', 'y', 'z'];
  arcball.update(dt, { yaw: 0, pitch: 0, roll: 0 });
  scene.update(dt, clock.getElapsed());
  sinceMask += dt;
  if (sinceMask > 0.1 && source) {
    sinceMask = 0;
    const live = render();
    drawMask($('liveMask'), targetMask, live);
    $('liveIou').textContent = target ? `live · IoU ${target.iou(live).toFixed(3)}` : 'live';
  }
  renderer.render(scene.scene, dt);
});
let saved: string | null = null;
try {
  saved = sessionStorage.getItem('editor-status');
  sessionStorage.removeItem('editor-status');
} catch {}
if (saved) say(saved, 'good');
else say('Pick an existing level or load a GLB.');
