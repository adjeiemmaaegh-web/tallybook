import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

// Static discovery only. A permission token in a function does not prove that
// all branches authorize, or that scope remains stable across asynchronous work.
const mutations = new Set(['add', 'put', 'update', 'delete', 'clear', 'bulkAdd', 'bulkPut', 'bulkDelete', 'modify']);
const entries = [];
async function scan(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const filename = path.join(directory, item.name);
    if (item.isDirectory()) { await scan(filename); continue; }
    if (!/\.(ts|tsx|mjs)$/.test(item.name) || /\.(test|d)\./.test(item.name)) continue;
    const source = await readFile(filename, 'utf8');
    const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
    const visit = node => {
      if ((ts.isFunctionDeclaration(node) && node.body) || (ts.isVariableDeclaration(node) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer)))) {
        const body = ts.isFunctionDeclaration(node) ? node.body : node.initializer.body;
        const writes = [];
        const calls = child => {
          if (ts.isCallExpression(child) && ts.isPropertyAccessExpression(child.expression) && mutations.has(child.expression.name.text)) {
            const target = child.expression.expression.getText(ast);
            if (/database|\bdb\b|transaction|\btx\b/.test(target)) writes.push({ method: child.expression.name.text, target, line: ast.getLineAndCharacterOfPosition(child.getStart()).line + 1 });
          }
          ts.forEachChild(child, calls);
        };
        calls(body);
        if (writes.length) entries.push({ file: filename.replaceAll('\\', '/'), name: node.name?.getText(ast) ?? '(anonymous)', line: ast.getLineAndCharacterOfPosition(node.getStart()).line + 1, writes, permissionCalls: [...new Set(body.getText(ast).match(/\b(?:requirePermission|requireOwner|activeStaffShift|authorize[A-Za-z]+)\b/g) ?? [])], status: 'requires-service-boundary-review' });
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
}
await scan('client/src/features');
await writeFile('docs/release/write-entrypoints.json', JSON.stringify({ limitations: 'Static candidate inventory; delegation and all backend/restore/callback paths require manual review and executable tests.', entries }, null, 2) + '\n');
console.log(`Recorded ${entries.length} mutating function candidates for service-boundary review.`);
