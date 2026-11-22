#!/usr/bin/env node
// Dependency-free requirements integrity gate. This validates evidence structure,
// never certifies business behavior or grants production authorization.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function parseRoadmap(markdown) {
  const tasks = [];
  let stage;
  let order = 0;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^## Stage (\d+) — (.+)$/.exec(line);
    if (heading) { stage = Number(heading[1]); order = 0; }
    if (!/^- \[[ xX]\]/.test(line)) continue;
    const row = /^- \[([ xX])\] \*\*\[(CRITICAL|HIGH|MEDIUM)\] \[(.+?)\]\*\* — (.+) \(Status: (.+?); completion criterion: (.+)\)$/.exec(line);
    if (!row || !stage) throw new Error(`Unrecognized roadmap task: ${line}`);
    tasks.push({ id: `ST${stage}-${String(++order).padStart(2, '0')}`, stage,
      priority: row[2], name: row[3], requirement: row[4], initialAuditStatus: row[5],
      completionCriterion: row[6], checked: row[1] !== ' ' });
  }
  const priorities = Object.fromEntries(['CRITICAL', 'HIGH', 'MEDIUM'].map(p => [p, tasks.filter(t => t.priority === p).length]));
  if (tasks.length !== 119 || priorities.CRITICAL !== 24 || priorities.HIGH !== 75 || priorities.MEDIUM !== 20 ||
      new Set(tasks.map(t => t.stage)).size !== 12 || tasks.some(t => t.stage < 21 || t.stage > 32))
    throw new Error('Roadmap scope changed: expected 119 tasks in stages 21–32 (24/75/20). Review scope explicitly.');
  return tasks;
}

export const statuses = ['unreviewed', 'verified', 'implemented-pending-acceptance', 'partial', 'missing', 'owner-external-blocked'];
export function validateRegister(tasks, register) {
  const errors = [];
  const rows = register.tasks;
  if (!Array.isArray(rows)) return { errors: ['Register tasks must be an array'], totals: {} };
  const expected = new Map(tasks.map(t => [t.id, t]));
  const seen = new Set();
  const totals = Object.fromEntries(statuses.map(s => [s, 0]));
  for (const row of rows) {
    const task = expected.get(row.id);
    if (!task || seen.has(row.id)) { errors.push(`Unknown or duplicate task ${row.id}`); continue; }
    seen.add(row.id);
    for (const key of ['stage', 'priority', 'name', 'requirement', 'initialAuditStatus', 'completionCriterion'])
      if (row[key] !== task[key]) errors.push(`${row.id}: roadmap drift in ${key}`);
    if (!statuses.includes(row.status)) errors.push(`${row.id}: invalid status`);
    else totals[row.status]++;
    for (const field of ['files', 'existingCapabilityReused', 'changes', 'tests', 'blockers', 'acceptanceEvidence'])
      if (!Array.isArray(row[field])) errors.push(`${row.id}: ${field} must be an array`);
    if (typeof row.nextAction !== 'string' || !row.nextAction.trim()) errors.push(`${row.id}: missing next action`);
    if (row.status === 'verified' && (!row.acceptanceEvidence?.length || !row.tests?.length || row.blockers?.length ||
        row.tests.some(t => t.result !== 'pass' || !t.command || !t.evidence)))
      errors.push(`${row.id}: verified requires passed tests, evidence and no blockers`);
    if (task.checked && row.status !== 'verified') errors.push(`${row.id}: checked without verification`);
    if (row.status === 'owner-external-blocked' && !row.blockers?.length) errors.push(`${row.id}: blocked without reason`);
  }
  for (const task of tasks) if (!seen.has(task.id)) errors.push(`Missing task ${task.id}`);
  return { errors, totals };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const tasks = parseRoadmap(readFileSync('road-to-complete.md', 'utf8'));
    const register = JSON.parse(readFileSync('docs/release/ROAD_TO_COMPLETE_PROGRESS.json', 'utf8'));
    const result = validateRegister(tasks, register);
    console.log(JSON.stringify({ decision: 'NO-GO', taskCount: tasks.length, ...result }, null, 2));
    if (result.errors.length) process.exitCode = 1;
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
