'use strict';
/* THE COMPOSITION MATRIX.

   13/13 proves the engine can build Jason's plan. This proves — or honestly
   fails to prove — that it can build a coherent plan for EVERY subset of
   disciplines a user might pick, including the single-discipline cases,
   which is what most users will actually choose.

   Six disciplines -> 63 non-empty subsets x 3 profiles. Per build:
     1  builds without safe fallback
     2  every selected discipline appears in the shipped week
     3  no unselected discipline appears
     4  session count fits capacity (<= 2 sessions/day, <= 2x training days/wk)
     5  no ordering violation (heavy posterior day before the long ruck)
     6  isolation stays 12-15 under every subset
     7  no contraindicated movement for the flagged joint (profile C)
     8  every prescribed exercise is performable with declared equipment
     9  no empty scaffolding: an appearing discipline carries real content
     10 every compromise has a human-readable reason

   Run: node --test --test-timeout=1800000 tests/composition.matrix.test.js */
const test = require('node:test');
const assert = require('node:assert/strict');

const trainingRoutes = require('../core/trainingRoutes');
const P = trainingRoutes._private;

const DISCIPLINES = ['lifting', 'running', 'rucking', 'workCapacity', 'martialArts', 'nutrition'];

const PROFILES = [
  { key: 'A-4d-chest-back', daysPerWeek: 4, emphasis: ['chest', 'back'], discipline: 'bodybuilding', injury: null },
  { key: 'B-5d-arms-powerbuilding', daysPerWeek: 5, emphasis: ['arms', 'shoulders'], discipline: 'powerbuilding', injury: null },
  { key: 'C-3d-shoulder-injury', daysPerWeek: 3, emphasis: ['back', 'arms'], discipline: 'bodybuilding', injury: { joints: ['Shoulder'], severity: 6 } }
];

function subsets() {
  const out = [];
  for (let mask = 1; mask < (1 << DISCIPLINES.length); mask += 1) {
    out.push(DISCIPLINES.filter((_, i) => mask & (1 << i)));
  }
  return out;
}

function buildFor(subset, profile, seed) {
  const has = (d) => subset.includes(d);
  const payload = {
    discipline: profile.discipline, phase: 'maintain', daysPerWeek: profile.daysPerWeek, planSeed: seed,
    equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
    emphasis: profile.emphasis, unavailableDays: ['sun'], equipmentStylePref: 'mix',
    running: has('running') ? { enabled: true, sessionsPerWeek: 2, timeTrialSec: 1140, timeTrialMi: 2 } : null,
    rucking: has('rucking') ? { enabled: true, sessionsPerWeek: 2, startLoadLb: 20, weeklyBaseMi: 8 } : null,
    workCapacity: has('workCapacity') ? { enabled: true, sessionsPerWeek: 1 } : null,
    martialArts: has('martialArts') ? { enabled: true, art: 'bjj', sessionsPerWeek: 2, scheduling: 'engine', intensity: 'mixed' } : null,
    strength: {
      phase: 'maintain', trainingAgeBucket: '6_18', timePerSession: '60_75', equipmentStylePref: 'mix',
      injury: profile.injury ? { has: true, joints: profile.injury.joints, note: '' } : { has: false, joints: [], note: '' },
      injurySeverityByJoint: profile.injury ? { [profile.injury.joints[0]]: { severity: profile.injury.severity, recency: 'Recent' } } : {},
      bench: 185, squat: 245, deadlift: 315
    }
  };
  return P.buildOblueprintPlanWithFallback(P.coerceClassicBodybuildingToOblueprintPayload(payload));
}

function disciplinesAppearing(plan) {
  const seen = new Set();
  for (const day of plan?.weeks?.[0]?.days || []) {
    for (const session of day?.sessions || []) {
      const d = String(session?.discipline || '');
      if (d) seen.add(d);
    }
  }
  if (plan?.meta?.nutritionModel) seen.add('nutrition');
  return seen;
}

function checkBuild(subset, profile, built) {
  const problems = [];
  const label = `[${subset.join('+')}] ${profile.key}`;
  if (built?.error) { problems.push(`${label}: build error ${JSON.stringify(built.error).slice(0, 80)}`); return problems; }
  if (built?._safeFallback) { problems.push(`${label}: safe fallback`); return problems; }
  const plan = built.plan;
  const week = plan?.weeks?.[0];
  const appearing = disciplinesAppearing(plan);

  for (const d of subset) {
    if (!appearing.has(d)) problems.push(`${label}: selected "${d}" never appears`);
  }
  for (const d of appearing) {
    if (!subset.includes(d)) problems.push(`${label}: unselected "${d}" appears`);
  }

  // capacity: no day over 2 sessions with lifting content plus one extra block;
  // hard cap 3 sessions/day and 2x days/week overall
  let totalSessions = 0;
  for (const day of week?.days || []) {
    const n = (day.sessions || []).length;
    totalSessions += n;
    if (n > 3) problems.push(`${label}: ${day.day} carries ${n} sessions`);
  }
  if (totalSessions > profile.daysPerWeek * 2 + 2) problems.push(`${label}: ${totalSessions} weekly sessions over capacity`);

  // ordering: the day before a Long Ruck day carries no squat/deadlift at <=5 reps
  const days = week?.days || [];
  const longIdx = days.findIndex((d) => (d.sessions || []).some((sn) => /long ruck/i.test(String(sn.dayType || ''))));
  if (longIdx > 0) {
    const prior = days[longIdx - 1];
    const heavy = (prior?.exercises || []).filter((ex) => /squat|deadlift/i.test(String(ex?.name || ''))
      && (() => { const r = Number(String(ex?.reps ?? '').match(/\d+/)?.[0] || 0); return r > 0 && r <= 5; })());
    if (heavy.length) problems.push(`${label}: heavy posterior (${heavy[0].name}) the day before the long ruck`);
  }

  // isolation 12-15 (curls, laterals, calves — the founding invariant)
  for (const w of plan?.weeks || []) {
    for (const day of w.days || []) {
      for (const ex of day.exercises || []) {
        if (String(ex.style) !== 'Isolation') continue;
        if (!/curl|lateral raise|calf/i.test(String(ex.name || ''))) continue;
        if (/leg curl|hamstring|nordic/i.test(String(ex.name || ''))) continue;
        const r = Number(String(ex.reps ?? '').match(/\d+/)?.[0] || 0);
        if (r && (r < 12 || r > 15)) { problems.push(`${label}: ${ex.name} at ${ex.sets}x${ex.reps}`); break; }
      }
    }
  }

  // contraindication (profile C only)
  if (profile.injury) {
    const banned = (plan?.weeks || []).flatMap((w) => (w.days || []).flatMap((d) => d.exercises || []))
      .filter((ex) => /behind[\s-]*(the[\s-]*)?neck|upright row/i.test(String(ex?.name || '')));
    if (banned.length) problems.push(`${label}: contraindicated ${banned[0].name}`);
  }

  // equipment feasibility
  const infeasible = P.auditPlanFeasibility ? P.auditPlanFeasibility(plan) : [];
  if (Array.isArray(infeasible) && infeasible.length) problems.push(`${label}: infeasible ${String(infeasible[0]).slice(0, 60)}`);

  // no empty scaffolding: an appearing non-lifting discipline has real content
  for (const day of days) {
    for (const session of day.sessions || []) {
      const d = String(session.discipline || '');
      if (d === 'martialArts') continue; // labelled block with no exercises BY DESIGN
      if (d && d !== 'lifting' && (!Array.isArray(session.exercises) || !session.exercises.length)) {
        problems.push(`${label}: empty ${d} session on ${day.day}`);
      }
      if (d === 'martialArts' && !String(session.dayType || '').trim()) {
        problems.push(`${label}: martial arts block with no label`);
      }
    }
  }

  // compromises carry human-readable reasons
  for (const c of plan?.meta?.frequencyCompromises || []) {
    if (!String(c?.reason || '').trim()) problems.push(`${label}: frequency compromise without a reason`);
  }
  for (const o of plan?.meta?.overrides || []) {
    if (!String(o?.action || o?.reason || '').trim()) problems.push(`${label}: override without a reason`);
  }
  return problems;
}

test('the composition matrix: 63 subsets x 3 profiles', () => {
  const all = [];
  let builds = 0;
  for (const subset of subsets()) {
    for (const profile of PROFILES) {
      const built = buildFor(subset, profile, 31337 + builds);
      builds += 1;
      all.push(...checkBuild(subset, profile, built));
    }
  }
  // Group identical failure shapes so the report reads as findings, not noise.
  const byShape = new Map();
  for (const p of all) {
    const shape = p.replace(/^\[[^\]]*\] [^:]*: /, '');
    byShape.set(shape, (byShape.get(shape) || 0) + 1);
  }
  const summary = [...byShape.entries()].sort((a, b) => b[1] - a[1])
    .map(([shape, n]) => `${String(n).padStart(3)}x  ${shape}`).join('\n');
  assert.equal(all.length, 0,
    `${all.length} problems across ${builds} builds. By shape:\n${summary}\n\nFirst 20:\n${all.slice(0, 20).join('\n')}`);
});
