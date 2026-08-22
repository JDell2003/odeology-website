'use strict';

/* generator/safeFallbackPlan.js  (Selection work order — Task 5, the floor)
   When the main builder cannot converge on a plan for extreme constraints, this
   assembles a COMPLETE, SAFE, RENDERABLE plan directly from the guaranteed-safe
   pool — never a throw, never an empty plan. It reuses the engine's own
   preprocessed exercise objects (full truth fields + images + requiredEquipment),
   so the output renders and validates like any other plan.

   Safety line (never crossed): respects the user's real equipment, every logged
   injury contraindication, and the session-length cap. Everything else is
   simplified. Each simplification is recorded as a visible plan note. */

const DAY_TEMPLATES = {
  // Balanced full-body rotation — one entry per training day, listing the
  // movement "roles" to fill in order. Works for any day count 2-6.
  roles: ['squat', 'horizontal_push', 'horizontal_pull', 'hinge', 'vertical_push', 'vertical_pull', 'core', 'lunge', 'isolation']
};

// Map a movement role to the exercise patterns that satisfy it.
const ROLE_PATTERNS = {
  squat: ['Squat'],
  hinge: ['Hinge'],
  lunge: ['Lunge', 'Squat'],
  horizontal_push: ['HorizontalPush'],
  vertical_push: ['VerticalPush', 'HorizontalPush'],
  horizontal_pull: ['HorizontalPull'],
  vertical_pull: ['VerticalPull', 'HorizontalPull'],
  core: ['CoreFlexion', 'CoreStability', 'CoreRotation'],
  isolation: ['Isolation']
};

function isEquipmentCompatible(ex, allowed) {
  const req = Array.isArray(ex.requiredEquipment) && ex.requiredEquipment.length ? ex.requiredEquipment : [];
  if (!req.length) return true;
  const A = new Set(allowed || []);
  for (const t of req) { if (t === 'bodyweight' && A.has('bodyweight')) continue; if (!A.has(t)) return false; }
  return true;
}

// Unambiguous name-based contraindications per joint (kept in sync with the
// engine floor gate + the fuzz test).
const NAME_CONTRA = {
  'lower back': [/good morning/i, /conventional deadlift/i],
  knee: [/pistol squat/i, /sissy squat/i],
  shoulder: [/behind the neck/i, /upright row/i],
  wrist: [/\bfront squat\b/i]
};
// Conservative injury contraindication check using the exercise truth flags +
// unambiguous name patterns. Only excludes clearly high-risk movements for a
// logged joint — never the whole pattern (substitutes remain).
function isInjurySafe(ex, injuryMap) {
  const m = injuryMap || {};
  // The nine risk flags live on canonicalTruth, not on the pool object this is
  // handed. Reading them off `ex` returned undefined for all 549 pooled
  // exercises, so this entire screen was inert for EVERY joint - the safe
  // fallback was equipment-honest and injury-blind. Two vocabularies for one
  // concept again: the exercise, and its truth.
  const t = (ex && ex.canonicalTruth) ? ex.canonicalTruth : (ex || {});
  // The engine screens on graded joint stress; mirror that here so a severe
  // joint is protected even when a flag is absent.
  const stress = (joint) => Number((ex && ex[joint]) || 0);
  // The engine keys injuryMap by JOINT (INJURY_JOINT_MAP: Back -> spine), while
  // this file asks for anatomical names like "lower back". That mismatch meant a
  // severity-9 back never matched anything here and Back Squat kept shipping.
  const JOINT_ALIASES = {
    'lower back': ['spine', 'lower back', 'back'],
    back: ['spine', 'back', 'lower back'],
    spine: ['spine', 'back', 'lower back'],
    knee: ['knee'],
    hip: ['hip'],
    shoulder: ['shoulder'],
    elbow: ['elbow'],
    wrist: ['wrist', 'Wrist', 'elbow'],
    ankle: ['ankle']
  };
  const sev = (joint) => {
    const key = String(joint).toLowerCase();
    const keys = JOINT_ALIASES[key] || [key];
    let worst = 0;
    for (const k of keys) worst = Math.max(worst, Number(m[k] || m[String(k).toLowerCase()] || 0));
    return worst;
  };
  if (sev('lower back') >= 4 && (t.axialLoadHigh || (t.hingeLoadingHigh && !t.controlledHingeAllowed))) return false;
  if (sev('knee') >= 4 && (t.forwardKneeTravelHigh || t.deepKneeFlexionHigh)) return false;
  if (sev('shoulder') >= 4 && t.shoulderOverhead) return false;
  if (sev('hip') >= 4 && t.deepHipFlexionHigh) return false;
  if (sev('elbow') >= 4 && t.elbowSupinationStress) return false;
  if (sev('wrist') >= 4 && t.wristExtensionHeavy) return false;
  // Graded stress backstop, matching evaluateJoint in the main selector:
  // severity >= 7 rejects max stress, >= 5 rejects it too at this tier.
  for (const [joint, key] of [['lower back', 'spine'], ['back', 'spine'], ['knee', 'knee'], ['hip', 'hip'], ['shoulder', 'shoulder'], ['elbow', 'elbow'], ['wrist', 'elbow']]) {
    if (sev(joint) >= 5 && stress(key) >= 3) return false;
  }
  const name = String(ex.name || ex.displayName || '');
  for (const joint of Object.keys(NAME_CONTRA)) {
    if (sev(joint) >= 1) for (const re of NAME_CONTRA[joint]) if (re.test(name)) return false;
  }
  return true;
}

function hasImage(ex) { return Array.isArray(ex.images) && ex.images.length > 0 && !!ex.images[0]; }

function pickForRole(role, pool, usedNames) {
  const patterns = ROLE_PATTERNS[role] || [];
  for (const pattern of patterns) {
    const candidate = pool.find((ex) => ex.pattern === pattern && !usedNames.has(ex.name));
    if (candidate) return candidate;
  }
  // Any unused safe exercise as a last resort — completeness beats role purity.
  return pool.find((ex) => !usedNames.has(ex.name)) || pool[0] || null;
}

function exerciseEntry(ex, isCompound) {
  return {
    ...ex,
    /* The strict path stamps canonicalExerciseId during selection; fallback
       rows come straight off the pool and shipped WITHOUT one, which broke
       progression-state keying and route parity for every fallback plan.
       Same derivation the engine uses (id, else normalized name). */
    canonicalExerciseId: ex.canonicalExerciseId
      || String(ex.id || '').trim()
      || String(ex.name || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, '-'),
    displayName: ex.displayName || ex.name,
    muscleTarget: ex.primary || ex.primaryMuscle || 'Full body',
    sets: 3,
    reps: isCompound ? '6-10' : '10-15',
    restSec: isCompound ? 120 : 75,
    rir: '2-3',
    progressionRule: 'Add a rep each session; when you hit the top of the range on all sets, add a small load.',
    flags: ['safeFallback'],
    projected: null,
    projectedWeight: null,
    projectedUnit: 'lb'
  };
}

// Build the safe fallback. `pool` = preprocessed catalog (array). `user` = the
// normalized user (allowedEquipment, injuryMap, daysPerWeek, timeline, sessionCap,
// discipline). `notes` = array of relaxations already applied (extended here).
function buildSafeFallbackPlan(user, pool, { notes = [] } = {}) {
  const allowed = Array.isArray(user?.allowedEquipment) && user.allowedEquipment.length
    ? user.allowedEquipment
    : ['bodyweight'];
  const injuryMap = user?.injuryMap || {};
  const days = Math.max(2, Math.min(6, Number(user?.daysPerWeek) || 3));
  const blockLength = user?.timeline === '4 weeks' ? 4 : 8;
  const sessionCap = Math.max(3, Math.min(8, Number(user?.sessionCap) || 6));

  // Safe pool: equipment-compatible, injury-safe, renderable. Widen if too small.
  let safe = (Array.isArray(pool) ? pool : []).filter((ex) => isEquipmentCompatible(ex, allowed) && isInjurySafe(ex, injuryMap) && hasImage(ex));
  if (safe.length < days * 3) {
    // Drop the image requirement before ever leaving a slot empty (icon fallback
    // still renders); safety + equipment stay.
    safe = (Array.isArray(pool) ? pool : []).filter((ex) => isEquipmentCompatible(ex, allowed) && isInjurySafe(ex, injuryMap));
    notes.push('Some movements shown without a photo — your equipment/injury constraints were tight.');
  }
  if (!safe.length) {
    // Absolute floor: bodyweight-safe basics always exist.
    safe = (Array.isArray(pool) ? pool : []).filter((ex) => isInjurySafe(ex, injuryMap) && (Array.isArray(ex.requiredEquipment) ? ex.requiredEquipment.every((t) => t === 'bodyweight') : true));
  }

  const perDay = Math.max(3, Math.min(sessionCap, 6));
  const buildOneWeekDays = () => {
    const usedThisWeek = new Set();
    const outDays = [];
    for (let d = 0; d < days; d += 1) {
      const usedToday = new Set();
      const usedCompoundPatterns = new Set();
      /* THE DAY CONTRACT, inherited by the fallback (it used to slice the
         role template to the session size, which at three slots cut the
         hinge from every day of the week — and its any-unused last resort
         could stack a second pressing compound onto a day, both of which
         the bodybuilding validator rightly rejects). Four or more slots:
         squat, hinge, push and pull all present, extras rotate. Three
         slots: squat days and hinge days alternate, push/pull every day. */
      const EXTRAS = ['vertical_push', 'vertical_pull', 'core', 'lunge', 'isolation'];
      const roles = perDay >= 4
        ? ['squat', 'hinge', 'horizontal_push', 'horizontal_pull']
          .concat(EXTRAS.slice(d % EXTRAS.length).concat(EXTRAS.slice(0, d % EXTRAS.length)))
          .slice(0, perDay)
        : [(d % 2 === 0 ? 'squat' : 'hinge'), 'horizontal_push', 'horizontal_pull'];
      const exercises = [];
      const pickDiverse = (role, pool) => {
        // A second COMPOUND of an already-used pattern is a contract
        // violation (two bench-press compounds on one day), never a fill.
        const diverse = pool.filter((ex) => String(ex.style) !== 'Compound' || !usedCompoundPatterns.has(String(ex.pattern)));
        return pickForRole(role, diverse, usedToday);
      };
      for (const role of roles) {
        if (exercises.length >= perDay) break;
        const candidate = pickDiverse(role, safe.filter((ex) => !usedToday.has(ex.name) && !usedThisWeek.has(ex.name)))
          || pickDiverse(role, safe.filter((ex) => !usedToday.has(ex.name)));
        if (!candidate) continue;
        usedToday.add(candidate.name);
        usedThisWeek.add(candidate.name);
        if (String(candidate.style) === 'Compound') usedCompoundPatterns.add(String(candidate.pattern));
        exercises.push(exerciseEntry(candidate, candidate.style === 'Compound'));
      }
      // Guarantee non-empty: if role-fill came up short, top up from the pool
      // (isolation first — a filler must not break the pattern contract).
      while (exercises.length < 3 && safe.length) {
        const filler = safe.find((ex) => !usedToday.has(ex.name) && (String(ex.style) !== 'Compound' || !usedCompoundPatterns.has(String(ex.pattern))))
          || safe.find((ex) => !usedToday.has(ex.name)) || safe[0];
        if (!filler) break;
        usedToday.add(filler.name);
        if (String(filler.style) === 'Compound') usedCompoundPatterns.add(String(filler.pattern));
        exercises.push(exerciseEntry(filler, filler.style === 'Compound'));
        if (exercises.length >= safe.length) break;
      }
      outDays.push({ dayType: `Day ${d + 1}`, exercises });
    }
    return outDays;
  };

  const weeks = [];
  for (let w = 0; w < blockLength; w += 1) {
    weeks.push({ weekIndex: w + 1, weekType: 'base', days: buildOneWeekDays() });
  }

  notes.push('Simplified safe plan: your constraints were tight, so this is a complete, safe, full-body starting plan you can progress from.');

  return {
    meta: {
      version: 1,
      discipline: String(user?.discipline || 'bodybuilding'),
      daysPerWeek: days,
      blockLength,
      sessionCap,
      allowedEquipment: allowed,
      safeFallback: true,
      notes: notes.slice(),
      progressionModel: { note: 'Double progression: add reps, then load.' }
    },
    schedule: weeks[0].days.map((d) => d.dayType),
    weeks
  };
}

module.exports = { buildSafeFallbackPlan, isEquipmentCompatible, isInjurySafe };
