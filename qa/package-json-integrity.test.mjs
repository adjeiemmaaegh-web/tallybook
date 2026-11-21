import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

/** An auto-merge once produced the same dependency twice in package.json (esbuild warned, nothing failed). */
function parseStrict(text, label) {
  JSON.parse(text); // must at least be valid JSON
  return (() => {
    const duplicates = [];
    // Re-scan with a duplicate-aware tokenizer: track keys per object literal.
    const stack = []; let i = 0;
    const skipString = () => { let j = i + 1; while (text[j] !== '"') { if (text[j] === '\\') j++; j++; } const s = text.slice(i + 1, j); i = j + 1; return s; };
    let expectKey = false;
    while (i < text.length) {
      const c = text[i];
      if (c === '{') { stack.push(new Set()); expectKey = true; i++; }
      else if (c === '[') { stack.push(null); i++; }
      else if (c === '}' || c === ']') { stack.pop(); i++; expectKey = false; }
      else if (c === ',') { expectKey = stack.at(-1) instanceof Set; i++; }
      else if (c === '"') {
        const s = skipString();
        if (expectKey && stack.at(-1) instanceof Set) {
          if (stack.at(-1).has(s)) duplicates.push(s);
          stack.at(-1).add(s); expectKey = false;
        }
      } else i++;
    }
    return duplicates;
  })();
}
test('the duplicate-key scanner itself detects duplicates', () => {
  assert.deepEqual(parseStrict('{"a":1,"b":{"x":1,"x":2},"a":3}', 'sample').sort(), ['a', 'x']);
  assert.deepEqual(parseStrict('{"a":[{"k":1},{"k":2}],"b":"a"}', 'sample'), []);
});
test('package.json has no duplicate keys at any level', () => {
  assert.deepEqual(parseStrict(readFileSync(new URL('../package.json', import.meta.url), 'utf8'), 'package.json'), []);
});
