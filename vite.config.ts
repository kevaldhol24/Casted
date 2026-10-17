import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

interface SaveRequest {
  level: { id: string; world: number };
  /** Base64 PNG of the target mask. */
  maskPng: string;
  /** An uploaded GLB to copy into public/models/w<world>/<name>.glb. */
  model?: { name: string; base64: string };
}

/** Pretty JSON with short arrays of numbers/strings kept on one line, like the hand-written level files. */
function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(/\[\n\s+([^[\]{}]*?)\n\s+\]/g, (_m, inner: string) => `[${inner.split(/,\n\s+/).join(', ')}]`) + '\n';
}

/**
 * Dev-only endpoint for tools/level-editor.html: POST /__editor/save writes the level JSON into
 * src/data/levels/, the mask PNG into public/masks/ and (optionally) the GLB into public/models/.
 */
function levelEditor(): Plugin {
  const write = (path: string, data: string | Buffer) => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  };
  return {
    name: 'casted-level-editor',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__editor/save', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405;
          return res.end();
        }
        const chunks: Buffer[] = [];
        req.on('data', (c: Buffer) => chunks.push(c));
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as SaveRequest;
            const { id, world } = body.level;
            // Names become file paths: allow only the level id pattern and plain model names.
            if (!/^w\d+-\d{2}$/.test(id) || !Number.isInteger(world) || id.split('-')[0] !== `w${world}`)
              throw new Error(`level id must look like w${world}-07`);
            if (body.model && !/^[a-z0-9_-]+$/i.test(body.model.name)) throw new Error('model name: letters, digits, - and _ only');
            const root = server.config.root;
            const written: string[] = [];
            const jsonPath = resolve(root, `src/data/levels/w${world}/${id}.json`);
            const existed = existsSync(jsonPath);
            write(jsonPath, formatJson(body.level));
            written.push(`src/data/levels/w${world}/${id}.json${existed ? ' (replaced)' : ''}`);
            write(resolve(root, `public/masks/${id}.png`), Buffer.from(body.maskPng, 'base64'));
            written.push(`public/masks/${id}.png`);
            if (body.model) {
              write(resolve(root, `public/models/w${world}/${body.model.name}.glb`), Buffer.from(body.model.base64, 'base64'));
              written.push(`public/models/w${world}/${body.model.name}.glb`);
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ written }));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: (e as Error).message }));
          }
        });
      });
    },
  };
}

export const CRAZYGAMES_SDK = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

/**
 * CrazyGames build and dev server (`--mode crazygames`): the SDK v3 script tag goes in before the game's module, so
 * window.CrazyGames exists at boot. It is the build's only off-bundle request. On localhost the SDK runs in its
 * 'local' environment (demo ad overlays, no real ads), so dev needs no mock.
 */
function crazyGamesSdk(): Plugin {
  return {
    name: 'casted-crazygames-sdk',
    transformIndexHtml: {
      order: 'pre',
      handler: () => [{ tag: 'script', attrs: { src: CRAZYGAMES_SDK }, injectTo: 'head' }],
    },
  };
}

/**
 * CrazyGames build only: every file at the build root. Their uploader dropped every folder and served all files from
 * the root, so assets/, models/ and masks/ were 404 and the game hung on its loading screen. Bundled assets go to the
 * root via `assetsDir: ''`; this moves the public/ folders' files up and points index.html's preload at the root.
 * The game resolves "models/w1/x.glb" to "x.glb" in this build (src/util/assetUrl.ts).
 */
function flatBuild(): Plugin {
  let outDir = '';
  return {
    name: 'casted-flat-build',
    apply: 'build',
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    transformIndexHtml: (html) => html.replace(/(href|src)="\.\/(?:[\w-]+\/)+([^"/]+)"/g, '$1="./$2"'),
    closeBundle() {
      const flatten = (dir: string) => {
        for (const f of readdirSync(dir)) {
          const p = join(dir, f);
          if (statSync(p).isDirectory()) {
            flatten(p);
            rmSync(p, { recursive: true });
          } else if (dir !== outDir) {
            const to = join(outDir, f);
            if (existsSync(to)) throw new Error(`flat build: two files named ${f}`);
            renameSync(p, to);
          }
        }
      };
      flatten(outDir);
    },
  };
}

/**
 * DRACOLoader points at its default decoders with `new URL('../libs/draco/…', import.meta.url)`, which makes Vite
 * bundle all five files (~1.3 MB, incl. a 719 KB asm.js fallback). LevelLoader sets the glTF WASM decoder itself, so
 * blank those defaults and only the two files it imports ship.
 */
function dracoDefaultsOff(): Plugin {
  return {
    name: 'casted-draco-defaults-off',
    apply: 'build',
    transform(code, id) {
      if (!/[\\/]three[\\/]examples[\\/]jsm[\\/]loaders[\\/]DRACOLoader\.js$/.test(id)) return null;
      const out = code.replace(/new URL\(\s*'\.\.\/libs\/draco\/[^']+',\s*import\.meta\.url\s*\)\.toString\(\)/g, "''");
      if (out === code) this.warn('DRACOLoader default decoder URLs not found; the unused decoders will ship');
      return { code: out, map: null };
    },
  };
}

const VERSION = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version;

export default defineConfig(({ mode }) => ({
  base: './',
  define: { __CASTED_BUILD__: JSON.stringify(`${VERSION}-${mode === 'crazygames' || mode === 'android' ? mode : 'web'}`) },
  plugins: [levelEditor(), dracoDefaultsOff(), ...(mode === 'crazygames' ? [crazyGamesSdk(), flatBuild()] : [])],
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 900, ...(mode === 'crazygames' ? { assetsDir: '' } : {}) },
  server: { host: true },
  // Model loaders are imported lazily; pre-bundle them so the first model level doesn't hit a dev re-optimise (504).
  optimizeDeps: { include: ['three/addons/loaders/GLTFLoader.js', 'three/addons/loaders/DRACOLoader.js'] },
}));
