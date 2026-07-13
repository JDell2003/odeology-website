// core/scoringGather.js
// v2 scoring (SCORING_ENGINE_V2): every piece of scoring SQL lives in this
// module so the engine (core/scoringEngine.js) stays pure and DB-free.
// This module owns:
//   - scoringV2Enabled(): the master feature flag (env var, default OFF)
//   - ensureScoringSchema(): additive-only migrations for the v2 score tables
//   - gatherUserScoringInputs(): reads raw rows -> one plain object for the engine
//     (added by Task 3)
'use strict';

const db = require('./db');

// Master feature flag. Default false — the owner flips SCORING_ENGINE_V2=true
// on Railway after reviewing DEPLOYMENT.md. Read per-call so tests can toggle it.
function scoringV2Enabled() {
  return String(process.env.SCORING_ENGINE_V2 || '').trim().toLowerCase() === 'true';
}

let schemaEnsured = false;
let schemaEnsurePromise = null;

async function ensureScoringSchema() {
  if (schemaEnsured) return;
  if (!db.isConfigured()) return;
  if (schemaEnsurePromise) return await schemaEnsurePromise;

  schemaEnsurePromise = (async () => {
    await db.query('CREATE EXTENSION IF NOT EXISTS pgcrypto;').catch(() => null);

    // 1b. Authoritative daily score snapshot (enables sustain gates + honest
    // decay + history). One row per user per day.
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_score_snapshots (
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        day date NOT NULL,
        strength numeric(5,2) NOT NULL DEFAULT 0,
        cardio numeric(5,2) NOT NULL DEFAULT 0,
        consistency numeric(5,2) NOT NULL DEFAULT 0,
        nutrition numeric(5,2) NOT NULL DEFAULT 0,
        recovery numeric(5,2) NOT NULL DEFAULT 0,
        progress numeric(5,2) NOT NULL DEFAULT 0,
        rank text NOT NULL DEFAULT 'peasant',
        caste text,
        weeks_at_rank int NOT NULL DEFAULT 0,
        normalized boolean NOT NULL DEFAULT false, -- false = self-improvement-only (sex missing)
        computed_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, day)
      );
    `);

    // 1c. Append-only event ledger (explainability + audit + anomaly flags).
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_score_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        axis text NOT NULL,
        delta numeric(6,2),
        reason_code text NOT NULL,
        provenance text,                    -- 'device' | 'self_report' | 'implausible'
        trust_multiplier numeric(3,2),
        source_ref text,
        detail jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await db.query('CREATE INDEX IF NOT EXISTS idx_score_events_user_time ON app_score_events (user_id, created_at DESC);');

    // 1d. Edit audit (fixes upsert-in-place destroying history).
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_edit_audit (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        table_name text NOT NULL,
        row_key text NOT NULL,
        field text,
        old_value jsonb,
        new_value jsonb,
        actor text NOT NULL DEFAULT 'user'
      );
    `);

    schemaEnsured = true;
  })().finally(() => {
    schemaEnsurePromise = null;
  });

  return await schemaEnsurePromise;
}

module.exports = { scoringV2Enabled, ensureScoringSchema };
