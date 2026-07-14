// Seed demo clients for the dirtydog trainer account so the Clients UI is
// testable (varied plan + payment states). Idempotent: re-running upserts.
// Run: node --env-file .env scripts/seed-dirtydog-clients.js
'use strict';
const db = require('../core/db');

const TRAINER_ID = 'a36537b9-5b5d-4346-9d2b-913280db93af'; // dirtydog

const CLIENTS = [
  { key: 'demo_dd_maya', name: 'Maya Chen', email: 'maya.demo@riseforit.test', status: 'active', workout: true, nutrition: true },
  { key: 'demo_dd_theo', name: 'Theo Barnes', email: 'theo.demo@riseforit.test', status: 'past_due', workout: true, nutrition: false },
  { key: 'demo_dd_nia', name: 'Nia Okafor', email: 'nia.demo@riseforit.test', status: 'paused', workout: false, nutrition: false },
  { key: 'demo_dd_sam', name: 'Sam Rivera', email: 'sam.demo@riseforit.test', status: 'active', workout: false, nutrition: true }
];

async function upsertUser(c) {
  const existing = await db.query('SELECT id FROM app_users WHERE username = $1 LIMIT 1', [c.key]);
  if (existing.rows[0]) return existing.rows[0].id;
  const res = await db.query(
    `INSERT INTO app_users (username, email, display_name, auth_provider, subscription_status)
     VALUES ($1, $2, $3, 'demo', $4) RETURNING id`,
    [c.key, c.email, c.name, c.status === 'active' ? 'active' : c.status]
  );
  return res.rows[0].id;
}

async function upsertClientLink(userId, c) {
  const existing = await db.query(
    'SELECT id FROM app_trainer_clients WHERE trainer_user_id = $1 AND linked_user_id = $2 LIMIT 1',
    [TRAINER_ID, userId]
  );
  if (existing.rows[0]) {
    await db.query('UPDATE app_trainer_clients SET display_name=$2, email=$3, status=$4, updated_at=now() WHERE id=$1',
      [existing.rows[0].id, c.name, c.email, c.status]);
    return;
  }
  await db.query(
    `INSERT INTO app_trainer_clients (trainer_user_id, linked_user_id, display_name, email, status, source)
     VALUES ($1, $2, $3, $4, $5, 'demo')`,
    [TRAINER_ID, userId, c.name, c.email, c.status]
  );
}

async function ensureWorkoutPlan(userId, on) {
  const has = await db.query('SELECT id FROM app_training_plans WHERE user_id = $1 LIMIT 1', [userId]);
  if (on && !has.rows[0]) {
    await db.query(
      `INSERT INTO app_training_plans (user_id, active, version, discipline, days_per_week, plan)
       VALUES ($1, true, 1, 'bodybuilding', 4, $2)`,
      [userId, JSON.stringify({ demo: true, note: 'Demo training plan for dirtydog client' })]
    );
  } else if (!on && has.rows[0]) {
    await db.query('DELETE FROM app_training_plans WHERE user_id = $1', [userId]);
  }
}

async function ensureNutritionPlan(userId, on) {
  const has = await db.query('SELECT id FROM app_grocery_lists WHERE user_id = $1 LIMIT 1', [userId]);
  if (on && !has.rows[0]) {
    await db.query(
      `INSERT INTO app_grocery_lists (user_id, source, items, totals, meta)
       VALUES ($1, 'demo', $2, $3, $4)`,
      [userId, JSON.stringify([{ name: 'chicken breast', quantity: '4 lb' }]),
        JSON.stringify({ totalEstimatedCost: 320 }), JSON.stringify({ demo: true, notes: 'demo_nutrition' })]
    );
  } else if (!on && has.rows[0]) {
    await db.query("DELETE FROM app_grocery_lists WHERE user_id = $1 AND source = 'demo'", [userId]);
  }
}

(async () => {
  for (const c of CLIENTS) {
    const uid = await upsertUser(c);
    await upsertClientLink(uid, c);
    await ensureWorkoutPlan(uid, c.workout);
    await ensureNutritionPlan(uid, c.nutrition);
    console.log(`seeded ${c.name} (${c.key}) uid=${uid} status=${c.status} workout=${c.workout} nutrition=${c.nutrition}`);
  }
  const n = await db.query('SELECT count(*)::int n FROM app_trainer_clients WHERE trainer_user_id = $1', [TRAINER_ID]);
  console.log('dirtydog now has', n.rows[0].n, 'clients');
  await db.close();
})().catch((e) => { console.error(e); process.exit(1); });
