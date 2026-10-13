import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import ts from 'typescript';

// Extract schema declarations from the verified untouched archive commit.
// Values are parsed as AST string literals; no archived code is executed.
const source = execFileSync('git', ['show', 'a944037:client/src/db/TallybookDB.ts'], { encoding: 'utf8' });
const file = ts.createSourceFile('legacy.ts', source, ts.ScriptTarget.Latest, true);
const declarations = [];
function visit(node) {
  if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'stores') {
    const version = node.expression.expression;
    const stores = node.arguments[0];
    if (ts.isCallExpression(version) && ts.isPropertyAccessExpression(version.expression) && version.expression.name.text === 'version' && ts.isNumericLiteral(version.arguments[0]) && ts.isObjectLiteralExpression(stores)) {
      const schema = {};
      for (const property of stores.properties) {
        if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) throw new Error('Unexpected legacy schema syntax');
        schema[property.name.getText(file).replace(/^['"]|['"]$/g, '')] = property.initializer.text;
      }
      declarations.push([Number(version.arguments[0].text), schema]);
    }
  }
  ts.forEachChild(node, visit);
}
visit(file);
const schemas = {}, current = {};
for (const [version, changes] of declarations.sort((a,b)=>a[0]-b[0])) {
  Object.assign(current, changes);
  schemas[version] = { ...current };
}
if (Object.keys(schemas).length !== 25) throw new Error('Expected all 25 historical versions');
mkdirSync('qa/fixtures', { recursive: true });
writeFileSync('qa/fixtures/legacy-schemas.json', JSON.stringify({ sourceCommit: 'a944037', schemas }, null, 2) + '\n');
console.log('Extracted 25 schema fixtures from the verified baseline.');
