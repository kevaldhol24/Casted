/**
 * Zips a build folder for upload (npm run build:poki → release/casted-poki-<version>.zip), with index.html at the
 * zip's root as Poki expects. Before zipping it checks the build is portable: every path in index.html is
 * relative, and no text file loads anything from another host except the Poki SDK script tag.
 */
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(root, process.argv[2] ?? 'dist-poki');
const name = process.argv[3] ?? 'poki';
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else files.push(p);
  }
})(dir);

const problems = [];
const html = readFileSync(join(dir, 'index.html'), 'utf8');
for (const [, url] of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
  if (url.startsWith('data:') || url === 'https://game-cdn.poki.com/scripts/v2/poki-sdk.js') continue;
  if (/^(\/|[a-z]+:)/i.test(url)) problems.push(`index.html: non-relative ${url}`);
}
// Remote loads in code/styles: url(http…), fetch("http…"), import("http…"), src="http…". Plain URL strings
// (comments, XML namespaces) don't load anything and are ignored.
const remote = /(?:url\(\s*['"]?|fetch\(\s*['"`]|import\(\s*['"`]|src\s*=\s*['"])(https?:)?\/\/(?!game-cdn\.poki\.com)/gi;
for (const f of files.filter((f) => /\.(js|css|html)$/.test(f))) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(remote)) problems.push(`${relative(dir, f)}: remote load "${text.slice(m.index, m.index + 60)}"`);
}
if (problems.length) {
  console.error(`✗ ${relative(root, dir)} is not portable:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

const entries = Object.fromEntries(files.map((f) => [relative(dir, f).split('\\').join('/'), readFileSync(f)]));
const zip = zipSync(entries, { level: 9 });
const out = join(root, 'release', `casted-${name}-${version}.zip`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, zip);
const raw = files.reduce((n, f) => n + statSync(f).size, 0);
console.log(`✓ ${relative(root, out)}: ${files.length} files, ${(raw / 1024 / 1024).toFixed(2)} MB → ${(zip.length / 1024 / 1024).toFixed(2)} MB zipped (paths relative, no remote loads besides the Poki SDK)`);
