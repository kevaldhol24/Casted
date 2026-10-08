import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

export default defineConfig({
  base: './',
  plugins: [levelEditor()],
  build: { target: 'es2020', assetsInlineLimit: 0, chunkSizeWarningLimit: 800 },
  server: { host: true },
  // Model loaders are imported lazily; pre-bundle them so the first model level doesn't hit a dev re-optimise (504).
  optimizeDeps: { include: ['three/addons/loaders/GLTFLoader.js', 'three/addons/loaders/DRACOLoader.js'] },
});
