'use strict';

/* Phase 2.4 — martial arts, behind the Discipline interface.

   The one that is structurally different: THE ENGINE NEVER WRITES A MARTIAL
   ARTS SESSION. It does not teach technique, prescribe drills, or plan
   rounds. Training is a fixed cost on the calendar that the rest of the plan
   must accommodate — which makes it the sharpest test of the fatigue model:
   if the engine can keep heavy deadlifts out of the day after hard sparring,
   the placement solver works.

   Different arts tax different systems. Grappling is brutal on connective
   tissue (grip, spine, shoulders); striking is aerobic and shoulder-heavy
   with far less lower-body cost; MMA is effectively both. Intensity scales
   the whole vector: technique work costs a fraction of hard sparring. */

const fatigue = require('../fatigueVector');

const ART_FATIGUE = {
  bjj: { systemic: 8, kneeExtensor: 4, posterior: 7, shoulderGirdle: 7, connective: 9, aerobic: 7 },
  wrestling: { systemic: 8, kneeExtensor: 4, posterior: 7, shoulderGirdle: 7, connective: 9, aerobic: 7 },
  judo: { systemic: 8, kneeExtensor: 4, posterior: 7, shoulderGirdle: 7, connective: 9, aerobic: 7 },
  muay_thai: { systemic: 7, kneeExtensor: 6, posterior: 5, shoulderGirdle: 6, connective: 7, aerobic: 9 },
  kickboxing: { systemic: 7, kneeExtensor: 6, posterior: 5, shoulderGirdle: 6, connective: 7, aerobic: 9 },
  boxing: { systemic: 6, kneeExtensor: 3, posterior: 3, shoulderGirdle: 7, connective: 5, aerobic: 9 },
  mma: { systemic: 8, kneeExtensor: 5, posterior: 7, shoulderGirdle: 7, connective: 9, aerobic: 9 },
  karate: { systemic: 5, kneeExtensor: 5, posterior: 4, shoulderGirdle: 4, connective: 5, aerobic: 7 },
  other: { systemic: 6, kneeExtensor: 4, posterior: 5, shoulderGirdle: 5, connective: 6, aerobic: 7 }
};

const INTENSITY_SCALE = { technique: 0.6, mixed: 1.0, hard_sparring: 1.35 };

const GRAPPLING = new Set(['bjj', 'wrestling', 'judo', 'mma']);
const STRIKING = new Set(['muay_thai', 'kickboxing', 'boxing', 'mma', 'karate']);

function artLabel(art) {
  const labels = { bjj: 'BJJ', muay_thai: 'Muay Thai', kickboxing: 'Kickboxing', mma: 'MMA' };
  return labels[art] || String(art || 'Martial Arts').charAt(0).toUpperCase() + String(art || 'martial arts').slice(1);
}

function sessionFatigue(art, intensity) {
  const base = ART_FATIGUE[String(art)] || ART_FATIGUE.other;
  return fatigue.normalizeVector(fatigue.scaleVector(base, INTENSITY_SCALE[String(intensity)] ?? 1));
}

/* Demand is the USER'S, not the engine's: martial arts is never demoted to
   maintain — the schedule is theirs. The engine only reports what the load
   does to everything else. */
function demand(profile) {
  const n = Math.max(1, Math.min(7, Number(profile?.sessionsPerWeek) || 2));
  return { sessionsPerWeek: { min: n, target: n, max: n }, sessionTypes: ['class'] };
}

/* No engine-owned progression and no engine-owned timeline. Belt and skill
   progression belong to the user's coach; pretending otherwise would be a
   fabricated number wearing a gi. */
function progress(state) { return state || {}; }
function projectTimeline() { return null; }

/* Session descriptors: a labelled block with NO exercises, plus the fatigue
   vector the placement layer needs and the flags the ordering rules key on. */
function build(request) {
  const cfg = request || {};
  const art = String(cfg.art || 'other');
  const n = Math.max(1, Math.min(7, Number(cfg.sessionsPerWeek) || 2));
  const intensity = String(cfg.intensity || 'mixed');
  const out = [];
  for (let i = 0; i < n; i += 1) {
    out.push({
      discipline: 'martialArts',
      sessionType: 'class',
      name: `${artLabel(art)}${cfg.typicalTime ? ' — ' + cfg.typicalTime : ''}`,
      art,
      intensity,
      grappling: GRAPPLING.has(art),
      striking: STRIKING.has(art),
      fatigue: sessionFatigue(art, intensity),
      fixedDay: Array.isArray(cfg.fixedDays) ? (cfg.fixedDays[i] || null) : null
    });
  }
  return out;
}

module.exports = {
  id: 'martialArts',
  ART_FATIGUE,
  INTENSITY_SCALE,
  sessionFatigue,
  demand,
  progress,
  projectTimeline,
  build
};
