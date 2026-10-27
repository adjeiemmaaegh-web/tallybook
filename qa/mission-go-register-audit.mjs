#!/usr/bin/env node
/**
 * Mission GO Increment 01: dependency-free, read-only requirements inventory.
 * Does not assert release acceptance and never changes ledger/database records.
 * Usage: node qa/mission-go-register-audit.mjs [repository-root]
 */
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(process.argv[2] ?? '.');
const files = [
  { family: 'release', name: 'docs/release/blockers.json', key: 'blockers' },
  { family: 'acceptance', name: 'docs/release/traceability.json', key: 'units' },
  { family: 'central', name: 'docs/central/CENTRAL_WORKSPACE_BLOCKERS.json', key: 'blockers' },
];
const audit = { decision: 'NO-GO', source: 'files in selected repository root', families: {}, errors: [] };
let total = 0;
for (const f of files) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(join(root, f.name), 'utf8'));
  } catch (err) {
    audit.errors.push(`${f.family}: cannot read/parse ${f.name}: ${err.message}`);
    continue;
  }
  const records = parsed[f.key];
  if (!Array.isArray(records)) {
    audit.errors.push(`${f.family}: ${f.key} must be an array`);
    continue;
  }
  const ids = new Set();
  const statuses = {};
  for (const [index, record] of records.entries()) {
    if (!record || typeof record.id !== 'string' || !record.id.trim()) {
      audit.errors.push(`${f.family}: record ${index} missing nonempty ID`);
      continue;
    }
    if (ids.has(record.id)) audit.errors.push(`${f.family}: duplicate ID ${record.id}`);
    ids.add(record.id);
    if (typeof record.status !== 'string' || !record.status.trim()) {
      audit.errors.push(`${f.family}: ${record.id} missing status`);
    } else statuses[record.status] = (statuses[record.status] || 0) + 1;
  }
  total += records.length;
  audit.families[f.family] = { count: records.length, uniqueIds: ids.size, historicalStatuses: statuses };
}
audit.totalRecords = total;
audit.validStructure = audit.errors.length === 0;
console.log(JSON.stringify(audit, null, 2));
if (audit.errors.length) process.exitCode = 1;
