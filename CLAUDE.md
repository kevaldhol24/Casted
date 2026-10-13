# Casted — shadow puzzle game

3D browser puzzle game: rotate junk-looking objects under a light until the shadow matches a target silhouette. Three.js + TypeScript + Vite, targeting CrazyGames
(Poki was dropped in October 2026: the submission stalled).

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
- `npm run dev:crazygames` — dev server in CrazyGames mode: `CrazyGamesPortal` against the real SDK v3, which runs
  in its `local` environment on localhost (demo ad overlays, SDK calls logged to the console, Data module backed by
  localStorage; `?muteAudio=true` forces the mute setting). Needs network for the SDK script
- `npm run build:crazygames` — CrazyGames build into `dist-crazygames/` plus
  `release/casted-crazygames-<version>.zip` for upload: same game plus the SDK script tag
  (`https://sdk.crazygames.com/crazygames-sdk-v3.js`, its only off-bundle request). `tools/zip-build.mjs` fails the
  build if a path isn't relative or anything loads from another host. Every other build uses `LocalPortal`
- `npm run models` — rebuild the authored models from `tools/models/` (`kit.mjs` shatter/junk/dual-shadow tools,
  `w1.mjs` … `w4.mjs`) → `public/models/w<N>/*.glb` (Draco) + `public/masks/*.png`; `npm run models -- 4` rebuilds
  only World 4 (any list of worlds); `npm run models -- w1-16 w1-17` rebuilds only those World 1 levels (use it for
  new World 1 levels so existing ones are left alone). World 1 hard levels listed in `CARVED` (`w1.mjs`) are one solid carved from
  the target (front) and a decoy outline (side, a red herring) by `Model.carve()`, plus edge-on decoy sheets
  (`Model.edgeSheets()`): no gaps or boards to line up. Calibrate their `threshold` so ~3° off still snaps World 1: points the level JSONs at the models (other fields kept). Worlds 2–4:
  write the whole level JSON from `w2.mjs` / `w3.mjs` / `w4.mjs` (World 2 piece offsets/scales computed; World 3 lamp
  solution/start copied; World 4 object scale computed, mask PNG = both shadows side by side)

Level editor (dev only, never built): `npm run dev`, then open http://localhost:5173/tools/level-editor.html.
Load a GLB (Draco OK) or an existing level, rotate to the solution, "Set solution here", fill the form, "Save to project"
(writes `src/data/levels/w<world>/<id>.json`, `public/masks/<id>.png`, `public/models/w<world>/<name>.glb`).

Dev URL params: `?level=N` jumps to level N (1-based), `?debug=1` shows the live mask + IoU overlay,
`?mode=daily` / `?mode=endless` starts a mode, `?date=YYYY-MM-DD` (dev only) picks another Daily Shadow date.

Automated checks: in dev builds `window.__casted` is the `Game` instance (`__casted.level` is the
`LevelController`: `state`, `iou`, `solutions`, `target`). Headless Chrome via puppeteer-core works with
`--use-angle=swiftshader --enable-unsafe-swiftshader`; set the object to `solutions[0]` to verify IoU 1.0 and the
snap → reveal → done flow (assembly and light levels: `__casted.level.solveAll()`, which also puts the lamp at its
solution), and drag with `page.mouse` to verify input (the lamp pad is `.light-pad`). Swiftshader runs slowly, so allow ~4 s for the reveal.

## Code layout (mirrors the design doc's folder structure)

- `src/main.ts` — boot
- `src/core/` — `Game` (loop, level flow), `Renderer` (WebGL, resize/DPR, camera fit), `Input` + `Arcball`
  (screen-space rotation, inertia, axis locks), `Store` (versioned save in the portal's storage: CrazyGames Data module, else localStorage)
- `src/shadow/` — `ShadowScene` (wall, floor, light, object root, target outline/fill shader), `Room` (light pool
  that darkens the room away from the shadow, generated floor textures, per-world props at the view's edges,
  outside the shadow camera and the mask layer),
  `MaskRenderer` (light-space orthographic mask render to 128×128), `Matcher` (IoU)
- `src/data/levels/w<N>/*.json` — one JSON per level (schema: `LevelDef` in `src/levels/levels.ts`)
- `src/levels/` — `levels.ts` (schema + loads the JSON), `LevelLoader.ts` (procedural objects + GLB/Draco, lazy-loaded),
  `shapes.ts` (2D silhouettes), `junkify.ts` (procedural junk objects),
  `LevelController.ts` (state machine: intro → playing → snapping → reveal → win),
  `Daily.ts` (date-seeded Daily Shadow, share text), `Endless.ts` (run timer/score, target generator);
  world palettes (`ATTIC`, `KITCHEN`, `WORKSHOP`, `THEATRE`) and the lamp range (`LIGHT_RANGE`, `lightDirection`) live in
  `src/shadow/ShadowScene.ts`
- `src/tools/LevelEditor.ts` + `tools/level-editor.html` — dev-only level editor; its save endpoint is a dev-server
  plugin in `vite.config.ts`
- `src/ui/` — HTML/CSS overlay (HUD, win screen, toasts). `ControlsHint` is the PC-only controls strip (bottom-left,
  only the controls the level uses, each row ticked on first use, learned flags in localStorage `casted.controls`);
  the pause menu's Controls page lists every control (mouse/keyboard on PC, gestures on touch)
- `src/portal/` — `Portal` interface, `LocalPortal` (Netlify / dev), `CrazyGamesPortal` (`--mode crazygames`)
- `src/analytics/Analytics.ts` — the only analytics entry point, `track(event)`: funnel events (Layer A, in memory only since
  the CrazyGames SDK has no event API), one
  `[casted] …` console line per attempt (A+), session / attempt / ad records (B). B is sent only when the build sets
  `VITE_TELEMETRY_URL`; otherwise records stay in memory (`window.__castedAnalytics` in dev: `records`, `measures`,
  `summaries`). Game code never calls `fetch` for analytics
- `telemetry/` — Layer B backend, its own npm project (not part of the game build): Cloudflare Worker (`src/index.ts`,
  `POST /e`, origin allowlist, 64 KB cap, daily retention cron) + D1 (`schema.sql`), saved queries in `queries/`,
  `npm test` for the record validator. Deploy steps are in `telemetry/README.md`
- `public/privacy.html` — privacy policy (ships in every build; linked from Settings). Replace `CONTACT_EMAIL` before
  turning telemetry on
- `src/util/` — tweens, seeded RNG

## Conventions

- No frameworks for UI: vanilla TS + CSS over the canvas.
- Rotation: pieces with roll locked (no `z` in `freeAxes`) are turntables (`Arcball.setTurntable`): pose = tilt ×
  turn × solution, so no order of drags twists them (free rotation lets X/Y drags build up roll). The snap and hints
  move them along tilt/turn (`LevelController.moveToward`), never by slerp. Twist arrives as a "New move" toast;
  the Straighten hint (1 Bulb, offered only when a rollable piece is ≥ 2° off) removes just the roll.
- Keys: read by physical position (`KeyboardEvent.code`); on-screen labels go through `keyLabel()` (`ControlsHint.ts`,
  follows the player's layout, e.g. ZQSD on AZERTY). Never bind Escape (it leaves fullscreen; CrazyGames restricted
  keys): P pauses.
- Target masks are rendered at level load from the solution rotation with the same mask code path, so a perfect
  solve always scores 1.0. (The editor's PNG masks are only used by the Album.)
- Assembly levels (World 2+) have `pieces` instead of `object`: each piece has its own model, light-space `offset`,
  `scale`, axes, start offset and optional `locked` (starts solved). The target is all pieces' shadows together; the
  arcball turns the active piece (grab it, or Tab). Single-object levels are one piece pivoting on `objectRoot`.
- Light-control levels (World 3) have `light: {solution, start}` as lamp [yaw, pitch] degrees from the default light
  (range ±15° yaw, 12° up, 8° down). The target is cast with the lamp at its solution and the outline stays put on
  the wall. Scoring is on the wall: the mask camera keeps the solution light's view and `MaskRenderer.setLight` shears
  its projection so each point lands where the current light throws it onto the wall, i.e. the mask is the real
  shadow over the outline. A degree of lamp slides the shadow ~0.07 units, so the lamp positions the shadow and the
  object's rotation sets its shape. `freeAxes: []` = only the lamp moves (a drag anywhere moves it). Arrow keys move
  the lamp, WASD/QE turn the object.
- Dual-shadow levels (World 4) have `dual: {spread}`: two fixed lamps `spread`° either side of the default light
  (turned about its view's up), each with its own mask camera (`Ctx.dualMasks`), target and outline. The score is the
  lower IoU (`LevelController.scores` has both); the HUD shows it plus a meter per lamp. A lamp's shadow is lit only
  by the other lamp, so it takes that lamp's colour; its outline matches (stripes = left, dots = right). The default
  light's mask camera still sets the frame (arcball, `solution`). Objects come from `Model.dualShadow()` (both
  outlines scaled to one height, cut into slabs, one block per run pair); `scale` on the level enlarges the model.
- Level `solution` quaternions are stored in light space (relative to the mask camera; for light levels, the
  solution lamp's view); omitted = identity.
  GLB models are normalised to a bounding-sphere radius of 1.3 by `normalizeModel`, in both the editor and the game.
- Keep Vite `base: './'` (portals require relative paths).
- First load (Phase 3b Step 5): level 1's model (`w1-01`) is quantized, not Draco (`NO_DECODER` in
  `tools/build-models.mjs`), and preloaded from `index.html`; the Draco decoder (glTF WASM build only, the defaults are
  stripped by a plugin in `vite.config.ts`) downloads in the background once a level is playing. `main.ts` awaits
  `portal.init()` (capped at 4 s) before building the `Store`, since the CrazyGames save lives in the SDK's Data
  module; on a timeout it boots on localStorage and the portal queues SDK calls until init settles. If level 1's model changes, update the preload link in `index.html`.
- CrazyGames only (Poki dropped). Ad breaks go through `Game.adBreak()` (midgame ad before every gameplayStart
  the player asked for, from level 3, never on the session's first transition; the SDK enforces its own ~3 min
  cooldown) and `Game.rewarded()`; both run inside `runAd()`, which mutes, blocks all input and suspends the level.
  `LevelController.suspend()/resume()` fire gameplayStop/Start only on a real change, so they never double-fire.
  The SDK's `muteAudio` setting goes to `Audio.setForcedMute()` and overrides the in-game sound toggle.
  `happytime()` fires only on a new Endless best (CrazyGames: not for plain level solves). Rewarded buttons are off
  when the SDK reports an adblocker.
