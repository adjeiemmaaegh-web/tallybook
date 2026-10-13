/** Offline sanity check for a Vite-produced frontend bundle. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const defaultRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'public');

export async function checkStaticAssets(root = defaultRoot) {
  const absoluteRoot = path.resolve(root);
  const html = await fs.readFile(path.join(absoluteRoot, 'index.html'), 'utf8');
  if (!html.includes('id="root"')) throw new Error('Missing React root mount in compiled index.html');
  if (html.includes('src="/src/main.tsx"')) throw new Error('Source HTML found instead of a compiled Vite build');
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[A-Za-z0-9_./-]+)"/g)].map(m => m[1]);
  if (!assets.some(p => p.endsWith('.js'))) throw new Error('No compiled JavaScript asset referenced by index.html');
  for (const uri of assets) {
    const disk = path.resolve(absoluteRoot, '.' + uri);
    if (!disk.startsWith(absoluteRoot + path.sep)) throw new Error('Invalid compiled asset path');
    const stat = await fs.stat(disk);
    if (!stat.isFile() || stat.size === 0) throw new Error(`Invalid compiled asset: ${uri}`);
  }
  return { assets: assets.length };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const summary = await checkStaticAssets();
    console.log(`Static-build asset check passed (${summary.assets} referenced files). This does not replace browser tests.`);
  } catch (err) {
    console.error('Static-build asset check FAILED:', err.message);
    process.exitCode = 1;
  }
}
