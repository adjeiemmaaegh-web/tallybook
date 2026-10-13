import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, resolve, relative } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const sourcesRoot = join(repositoryRoot, 'client', 'src');

function* sourceFiles(folder) {
  for (const item of readdirSync(folder, { withFileTypes: true })) {
    const path = join(folder, item.name);
    if (item.isDirectory()) yield* sourceFiles(path);
    else if (/\.(?:ts|tsx|js|mjs)$/.test(item.name)) yield path;
  }
}

test('browser modules cannot use extensionless imports that collide between .ts and .mjs', () => {
  const ambiguous = [];
  for (const file of sourceFiles(sourcesRoot)) {
    const contents = readFileSync(file, 'utf8');
    const references = /\b(?:from\s*|import\s*\()\s*['"]([^'"\r\n]+)['"]/g;
    for (const match of contents.matchAll(references)) {
      const specifier = match[1];
      if (!specifier.startsWith('@/') && !specifier.startsWith('./') && !specifier.startsWith('../')) continue;
      const resolved = specifier.startsWith('@/')
        ? resolve(sourcesRoot, specifier.slice(2))
        : resolve(dirname(file), specifier);
      if (extname(resolved)) continue;
      if (existsSync(`${resolved}.ts`) && existsSync(`${resolved}.mjs`)) {
        ambiguous.push(`${relative(repositoryRoot,file)}: ${specifier}`);
      }
    }
  }
  assert.deepEqual(ambiguous.sort(), [], 'Disambiguate runtime imports explicitly: Vite chooses .mjs before .ts');
});
