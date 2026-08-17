#!/usr/bin/env node
'use strict';
/* Engine v2 Phase 0 §1.3 — normalise stored plans onto weekIndex.

   The legacy generator wrote week.index; the oblueprint generator writes
   week.weekIndex. Plans are persisted as verbatim JSON with no normalisation
   step, so both shapes exist in app_training_plans. Server-side plan mutators
   now read weekIndex, and old rows only need to RENDER — every existing plan is
   deactivated by the Engine v2 migration and its owner re-onboards, so nothing
   here regenerates. That makes this a one-way rewrite with no dual-write and no
   rollout window.

   Also stamps the per-exercise id (§1.2) on old rows, so a read-only render of
   an old plan can still correlate with logged history.

   Usage:
     node scripts/migrate-plan-week-index.js --dry-run     # report only
     node scripts/migrate-plan-week-index.js               # apply
     node --env-file .env scripts/migrate-plan-week-index.js
*/
const db = require('../core/db');

const DRY_RUN = process.argv.includes('--dry-run');

function normalizePlanShape(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.weeks)) {
    return { changed: false, renamedWeeks: 0, stampedExercises: 0 };
  }
  let renamedWeeks = 0;
  let stampedExercises = 0;
  plan.weeks.forEach((week, weekOffset) => {
    if (!week || typeof week !== 'object') return;
    if (!Number.isFinite(Number(week.weekIndex))) {
      const legacy = Number(week.index);
      week.weekIndex = Number.isFinite(legacy) ? legacy : weekOffset + 1;
      renamedWeeks += 1;
    }
    delete week.index;
    const days = Array.isArray(week.days) ? week.days : [];
    days.forEach((day, dayOffset) => {
      const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
      exercises.forEach((ex, exerciseOffset) => {
        if (!ex || typeof ex !== 'object') return;
        if (ex.id) return;
        ex.id = `${Number(week.weekIndex)}-${dayOffset + 1}-0-${exerciseOffset + 1}`;
        stampedExercises += 1;
      });
    });
  });
  return { changed: renamedWeeks > 0 || stampedExercises > 0, renamedWeeks, stampedExercises };
}

async function main() {
  const started = Date.now();
  const result = await db.query('SELECT id, user_id, active, plan FROM app_training_plans ORDER BY updated_at ASC;');
  const rows = result.rows || [];
  let scanned = 0;
  let migrated = 0;
  let totalWeeks = 0;
  let totalExercises = 0;
  const failures = [];

  for (const row of rows) {
    scanned += 1;
    let plan;
    try {
      plan = row.plan && typeof row.plan === 'object' ? row.plan : JSON.parse(String(row.plan || '{}'));
    } catch (err) {
      failures.push({ id: row.id, reason: `unparseable plan json: ${err.message}` });
      continue;
    }
    const { changed, renamedWeeks, stampedExercises } = normalizePlanShape(plan);
    if (!changed) continue;
    migrated += 1;
    totalWeeks += renamedWeeks;
    totalExercises += stampedExercises;
    if (DRY_RUN) continue;
    try {
      await db.query(
        'UPDATE app_training_plans SET plan = $2::jsonb, updated_at = updated_at WHERE id = $1;',
        [row.id, JSON.stringify(plan)]
      );
    } catch (err) {
      failures.push({ id: row.id, reason: err.message });
    }
  }

  console.log(`${DRY_RUN ? '[dry run] ' : ''}plans scanned: ${scanned}`);
  console.log(`${DRY_RUN ? '[dry run] ' : ''}plans needing migration: ${migrated}`);
  console.log(`${DRY_RUN ? '[dry run] ' : ''}weeks renamed index -> weekIndex: ${totalWeeks}`);
  console.log(`${DRY_RUN ? '[dry run] ' : ''}exercises given a stable id: ${totalExercises}`);
  console.log(`elapsed: ${Date.now() - started}ms`);
  if (failures.length) {
    console.error(`FAILURES (${failures.length}):`);
    for (const f of failures.slice(0, 20)) console.error(`  ${f.id}: ${f.reason}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('migration failed:', err?.message || err);
  process.exitCode = 1;
});
