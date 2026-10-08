# Casted — shadow puzzle game

3D browser puzzle game: rotate junk-looking objects under a light until the shadow matches a target silhouette. Three.js + TypeScript + Vite, targeting Poki and CrazyGames.

## Start every session here

1. **Read the progress tracker first:** https://claude.ai/artifact/Th6xfTo4ovp7BZ6GG8KfzR
   ("Casted — Development Progress", a Claude Doc, id `d827075c-e240-4019-aa30-14e88cffed3a`).
   Read it with the Claude Docs connector (`read` the project, then its tab's prose node). It holds the current phase,
   the task checklist, decisions/deviations from the design doc, known issues and the session log.
2. **Design source of truth:** https://claude.ai/artifact/Vmv2eYiddc6QSdZkcRwuDG
   ("Casted — Shadow Puzzle Game Design Document", Claude Doc id `e90549cc-5395-4d76-a59c-7520255dffa7`).
   It is long (~136k chars of XML); read only the sections you need (`payload: {"kind":"search","text":"..."}`
   or an outline projection) instead of pulling it whole.
3. Pick the next unticked task in the tracker's current phase.

## Before ending every session (required)

Update the progress tracker doc through the Claude Docs connector:
- Tick finished tasks in **Task checklist** (set `checked: true` on the listItem), add new tasks discovered.
- Rewrite **Current status** (phase, what works, the next task).
- Add a row at the top of **Session log** (date · what was done · next step).
- Record any deviation from the design doc in **Decisions and deviations**, bugs in **Known issues**.
- Update the **Phases** table status when a phase or gate changes.

Make targeted edits (don't rewrite the whole doc); read the doc's latest state first, the user may edit it too.

## Repository

GitHub: https://github.com/kevaldhol24/Casted (branch `main`). Commit/push only when the user asks.
Never add Claude/AI attribution (no `Co-Authored-By`, no "Generated with Claude Code") to commits, PRs or files.

## Commands

- `npm install` — install deps
- `npm run dev` — dev server (http://localhost:5173)
- `npm run build` — type-check + production build into `dist/` (relative paths, works from any subfolder)
- `npm run preview` — serve the built `dist/`

Level editor (dev only, never built): `npm run dev`, then open http://localhost:5173/tools/level-editor.html.
Load a GLB (Draco OK) or an existing level, rotate to the solution, "Set solution here", fill the form, "Save to project"
(writes `src/data/levels/w<world>/<id>.json`, `public/masks/<id>.png`, `public/models/w<world>/<name>.glb`).

Dev URL params: `?level=N` jumps to level N (1-based), `?debug=1` shows the live mask + IoU overlay.

Automated checks: in dev builds `window.__casted` is the `Game` instance (`__casted.level` is the
`LevelController`: `state`, `iou`, `solutions`, `target`). Headless Chrome via puppeteer-core works with
`--use-angle=swiftshader --enable-unsafe-swiftshader`; set the object to `solutions[0]` to verify IoU 1.0 and the
snap → reveal → done flow, and drag with `page.mouse` to verify input. Swiftshader runs slowly, so allow ~4 s for the reveal.

## Code layout (mirrors the design doc's folder structure)

- `src/main.ts` — boot
- `src/core/` — `Game` (loop, level flow), `Renderer` (WebGL, resize/DPR, camera fit), `Input` + `Arcball`
  (screen-space rotation, inertia, axis locks), `Store` (versioned localStorage save)
- `src/shadow/` — `ShadowScene` (wall, floor, light, object root, target outline/fill shader),
  `MaskRenderer` (light-space orthographic mask render to 128×128), `Matcher` (IoU)
- `src/data/levels/w<N>/*.json` — one JSON per level (schema: `LevelDef` in `src/levels/levels.ts`)
- `src/levels/` — `levels.ts` (schema + loads the JSON), `LevelLoader.ts` (procedural objects + GLB/Draco, lazy-loaded),
  `shapes.ts` (2D silhouettes), `junkify.ts` (procedural junk objects),
  `LevelController.ts` (state machine: intro → playing → snapping → reveal → win)
- `src/tools/LevelEditor.ts` + `tools/level-editor.html` — dev-only level editor; its save endpoint is a dev-server
  plugin in `vite.config.ts`
- `src/ui/` — HTML/CSS overlay (HUD, win screen, toasts)
- `src/portal/` — `Portal` interface + `LocalPortal` (Poki/CrazyGames adapters come in Phase 3)
- `src/util/` — tweens, seeded RNG

## Conventions

- No frameworks for UI: vanilla TS + CSS over the canvas.
- Target masks are rendered at level load from the solution rotation with the same mask code path, so a perfect
  solve always scores 1.0. (The editor's PNG masks are only used by the Album.)
- Level `solution` quaternions are stored in light space (relative to the mask camera); omitted = identity.
  GLB models are normalised to a bounding-sphere radius of 1.3 by `normalizeModel`, in both the editor and the game.
- Keep Vite `base: './'` (portals require relative paths).
