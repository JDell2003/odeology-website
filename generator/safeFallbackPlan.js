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
  const sev = (joint) => Number(m[joint] || m[String(joint).toLowerCase()] || 0);
  if (sev('lower back') >= 4 && (ex.axialLoadHigh || (ex.hingeLoadingHigh && !ex.controlledHingeAllowed))) return false;
  if (sev('knee') >= 4 && (ex.forwardKneeTravelHigh || ex.deepKneeFlexionHigh)) return false;
  if (sev('shoulder') >= 4 && ex.shoulderOverhead) return false;
  if (sev('hip') >= 4 && ex.deepHipFlexionHigh) return false;
  if (sev('elbow') >= 4 && ex.elbowSupinationStress) return false;
  if (sev('wrist') >= 4 && ex.wristExtensionHeavy) return false;
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
      const roles = DAY_TEMPLATES.roles.slice(0, perDay);
      // Rotate the role start per day so days aren't identical.
      const rotated = roles.slice(d % roles.length).concat(roles.slice(0, d % roles.length));
      const exercises = [];
      for (const role of rotated) {
        if (exercises.length >= perDay) break;
        const candidate = pickForRole(role, safe.filter((ex) => !usedToday.has(ex.name) && !usedThisWeek.has(ex.name)), usedToday)
          || pickForRole(role, safe.filter((ex) => !usedToday.has(ex.name)), usedToday);
        if (!candidate) continue;
        usedToday.add(candidate.name);
        usedThisWeek.add(candidate.name);
        exercises.push(exerciseEntry(candidate, candidate.style === 'Compound'));
      }
      // Guarantee non-empty: if role-fill came up short, top up from the pool.
      while (exercises.length < 3 && safe.length) {
        const filler = safe.find((ex) => !usedToday.has(ex.name)) || safe[0];
        if (!filler) break;
        usedToday.add(filler.name);
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
