// core/scoringEngine.js
// v2 scoring (SCORING_ENGINE_V2): pure, testable functions; ZERO DB imports.
// Every tunable comes from core/scoringConstants.js (C.*). SQL lives in
// core/scoringGather.js which hands this module one plain inputs object.
//
// Pipeline per axis: gather signal -> normalize -> blend with self-improvement
// -> apply trust multiplier -> window/decay/pause -> push explanatory events.
'use strict';

const C = require('./scoringConstants');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const AXES = ['strength', 'cardio', 'consistency', 'nutrition', 'recovery', 'progress'];

function ageFrom(profile, today) {
  if (profile.dob) return Math.floor((today - new Date(profile.dob)) / (365.25 * 864e5));
  return Number(profile.age) || null;
}

function trustMultiplier(p) {
  return p === 'device' ? C.trust.device : p === 'self_report' ? C.trust.self_report : C.trust.implausible;
}

// Exponential recency weight: 1.0 today, halves every recencyHalfLifeDays.
function recencyWeight(daysAgo) {
  return Math.pow(0.5, Math.max(0, daysAgo) / C.windows.recencyHalfLifeDays);
}

// STRENGTH standard: allometric-adjusted e1RM mapped to 0-100 via
// bodyweight-multiple bands.
// Returns { standard:0..100|null, normalized:bool }. sex missing -> self-only.
function normalizeStrength(bestE1rmByLift, profile) {
  const sex = profile.sex;
  if (sex !== 'male' && sex !== 'female') return { standard: null, normalized: false };
  const bwLb = Number(profile.bodyweightLb) || 0;
  if (bwLb <= 0) return { standard: null, normalized: true };
  const bands = C.strength.bwMultipleStandards[sex];
  const ap = C.strength.anchorPoints;
  let sum = 0, n = 0;
  for (const lift of C.strength.mainLifts) {
    const e1 = bestE1rmByLift[lift];
    if (!e1 || !bands[lift]) continue;
    const mult = e1 / bwLb;                               // relative strength
    const b = bands[lift];
    // piecewise-linear map novice->intermediate->advanced->elite onto anchorPoints
    let pts;
    if (mult <= b.novice)            pts = (mult / b.novice) * ap.novice;
    else if (mult <= b.intermediate) pts = ap.novice + (mult - b.novice) / (b.intermediate - b.novice) * (ap.intermediate - ap.novice);
    else if (mult <= b.advanced)     pts = ap.intermediate + (mult - b.intermediate) / (b.advanced - b.intermediate) * (ap.advanced - ap.intermediate);
    else if (mult <= b.elite)        pts = ap.advanced + (mult - b.advanced) / (b.elite - b.advanced) * (ap.elite - ap.advanced);
    else                             pts = ap.elite;
    sum += clamp(pts, 0, 100); n += 1;
  }
  if (!n) return { standard: null, normalized: true };
  // age handicap
  const age = ageFrom(profile, new Date());
  let ageAdj = 1;
  if (age && age > 40) ageAdj = 1 + C.age.strengthPerYearOver40 * (age - 40); // credit older lifters
  if (age && age < 20) ageAdj = 1 + C.age.strengthPerYearUnder20 * (20 - age); // credit younger lifters
  return { standard: clamp((sum / n) * ageAdj, 0, 100), normalized: true };
}

function selfImprovement(current, baseline) {
  if (!baseline || baseline <= 0) return 50;
  return clamp(50 + (current / baseline - 1) * 200, 0, 100);   // +25% over baseline ~ full
}

function blend(standard, self) {
  return standard === null ? self : C.blend.standardWeight * standard + C.blend.selfWeight * self;
}

function applyDecayOrPause(prev, axis, idleDays, pauseActive, seed) {
  if (pauseActive) return prev;
  const d = C.decay[axis];
  return idleDays <= d.graceDays ? prev : Math.max(seed, prev - d.perDay * (idleDays - d.graceDays));
}

function computeRank(axisScores, weeksAtCandidate) {
  const g = C.ranks, v = AXES.map((a) => axisScores[a]);
  const avg = v.reduce((x, y) => x + y, 0) / v.length, min = Math.min(...v), spike = Math.max(...v);
  let rank = 'peasant';
  for (const [id, gate] of Object.entries(g)) {
    const byAvg = avg >= gate.avg && min >= (gate.floor || 0);
    const byPierce = !gate.noPierce && spike >= (gate.spike || 999);
    const sustainOk = ((weeksAtCandidate || {})[id] || 0) >= (gate.sustainWeeks || 0);
    if ((byAvg || byPierce) && sustainOk) rank = id;
  }
  let caste = null;
  if (rank === 'specialist') {
    for (const [id, fn] of Object.entries(C.castes)) {
      if (fn(axisScores)) { caste = id; break; }
    }
  }
  return { rank, caste };
}

// ---------------------------------------------------------------------------
// Per-day trust helpers. Signals carry a provenance string; credit for a day
// is weighted by the trust ladder. Implausible signals score exactly zero.
// ---------------------------------------------------------------------------
function trustedCredit(rawCredit, provenance) {
  return rawCredit * trustMultiplier(provenance || 'self_report');
}

// ---------------------------------------------------------------------------
// STRENGTH
// inputs.strength = {
//   bestE1rmByLift: { bench, squat, deadlift, ohp },      // window best, lb
//   baselineAvgRelStrength, currentAvgRelStrength,        // e1RM/bw means (own history)
//   idleDays, provenance ('device'|'self_report'), pauseActive
// }
// ---------------------------------------------------------------------------
function computeStrength(inputs, prev, events) {
  const s = inputs.strength || {};
  const { standard, normalized } = normalizeStrength(s.bestE1rmByLift || {}, inputs.profile || {});
  const self = selfImprovement(s.currentAvgRelStrength, s.baselineAvgRelStrength);
  const mult = trustMultiplier(s.provenance || 'self_report');
  const fresh = clamp(blend(standard, self) * mult, 0, 100);
  const idleDays = Number.isFinite(s.idleDays) ? s.idleDays : 999;
  let score;
  if (idleDays > C.decay.strength.graceDays) {
    // Idle past grace: decay from the banked level (whichever is higher).
    score = applyDecayOrPause(Math.max(prev, fresh), 'strength', idleDays, !!s.pauseActive, 0);
  } else {
    // Best-recent bank: a lower fresh reading inside the window never CRASHES
    // the score (owner's 350 -> 320 example) — while active it can only glide
    // down at the axis decay rate, so old peaks age out honestly.
    score = s.pauseActive ? prev : Math.max(fresh, prev - C.decay.strength.perDay);
  }
  events.push({
    axis: 'strength', delta: round2(score - prev), reason_code: 'strength_recompute',
    provenance: s.provenance || 'self_report', trust_multiplier: mult,
    detail: { standard: roundOrNull(standard), self: round2(self), normalized, idleDays }
  });
  return { score, normalized };
}

// ---------------------------------------------------------------------------
// CARDIO — graded minutes-at-intensity (WHO anchors), VO2max when known,
// steps only as a capped weak fallback.
// inputs.cardio = {
//   weeklyModerateMinutes, weeklyVigorousMinutes,   // trust-weighted by gather? no: raw + provenance
//   provenance, stepsAvgPerDay, vo2max, idleDays, pauseActive
// }
// ---------------------------------------------------------------------------
function gradeWhoMinutes(weeklyEquivalentMinutes) {
  const a = C.cardio.whoMinutesAnchors;
  const m = Math.max(0, weeklyEquivalentMinutes);
  if (m <= 150) return (m / 150) * a.moderateMin150Points;
  if (m <= 300) return a.moderateMin150Points + ((m - 150) / 150) * (a.moderateMin300Points - a.moderateMin150Points);
  // continue the 150->300 slope past 300, capped at 100
  const slope = (a.moderateMin300Points - a.moderateMin150Points) / 150;
  return clamp(a.moderateMin300Points + (m - 300) * slope, 0, 100);
}

function gradeVo2max(vo2max, profile, today) {
  if (!Number.isFinite(vo2max) || vo2max <= 0) return null;
  const sex = profile.sex === 'female' ? 'female' : profile.sex === 'male' ? 'male' : null;
  if (!sex) return null;
  const age = ageFrom(profile, today) || 30;
  const decade = String(clamp(Math.floor(age / 10) * 10, 20, 70));
  const mid = C.cardio.vo2max50thBySexDecade[sex][decade];
  if (!mid) return null;
  return clamp((vo2max / mid) * 50, 0, 100);   // 50th percentile anchors 50 pts
}

function computeCardio(inputs, prev, events, today) {
  const c = inputs.cardio || {};
  const a = C.cardio.whoMinutesAnchors;
  const weeklyEq = (Number(c.weeklyModerateMinutes) || 0)
    + (Number(c.weeklyVigorousMinutes) || 0) * a.vigorousMultiplier;
  const minutesScore = gradeWhoMinutes(weeklyEq);
  const vo2Score = gradeVo2max(c.vo2max, inputs.profile || {}, today);
  const stepsScore = clamp(((Number(c.stepsAvgPerDay) || 0) / C.cardio.stepGoal) * C.cardio.stepsFallbackCapPoints,
    0, C.cardio.stepsFallbackCapPoints);
  const mult = trustMultiplier(c.provenance || 'self_report');
  let raw;
  let basis;
  if (minutesScore > 0 || vo2Score !== null) {
    raw = Math.max(minutesScore, vo2Score || 0);
    basis = vo2Score !== null && (vo2Score >= minutesScore) ? 'vo2max' : 'minutes_at_intensity';
  } else {
    raw = stepsScore;                              // weak fallback, hard-capped
    basis = 'steps_fallback';
  }
  const idleDays = Number.isFinite(c.idleDays) ? c.idleDays : 999;
  let score;
  if (idleDays > C.decay.cardio.graceDays) {
    score = applyDecayOrPause(prev, 'cardio', idleDays, !!c.pauseActive, 0);
  } else {
    score = c.pauseActive ? prev : clamp(raw * mult, 0, 100);
  }
  events.push({
    axis: 'cardio', delta: round2(score - prev), reason_code: 'cardio_recompute',
    provenance: c.provenance || 'self_report', trust_multiplier: mult,
    detail: { basis, weeklyEquivalentMinutes: Math.round(weeklyEq), minutesScore: round2(minutesScore), vo2Score: roundOrNull(vo2Score), stepsScore: round2(stepsScore), idleDays }
  });
  return { score };
}

// ---------------------------------------------------------------------------
// CONSISTENCY — recency-weighted fraction of active days in the window.
// inputs.consistency = { days: [{ daysAgo, active, provenance }], idleDays, pauseActive }
// ---------------------------------------------------------------------------
function computeConsistency(inputs, prev, events) {
  const k = inputs.consistency || {};
  const days = Array.isArray(k.days) ? k.days : [];
  let got = 0, possible = 0;
  for (const d of days) {
    const w = recencyWeight(d.daysAgo);
    possible += w;
    if (d.active) got += w * trustMultiplier(d.provenance || 'self_report');
  }
  const raw = possible > 0 ? (got / possible) * 100 : 0;
  let score = clamp(raw, 0, 100);
  const idleDays = Number.isFinite(k.idleDays) ? k.idleDays : 999;
  if (idleDays > C.decay.consistency.graceDays) {
    score = applyDecayOrPause(prev, 'consistency', idleDays, !!k.pauseActive, 0);
  }
  events.push({
    axis: 'consistency', delta: round2(score - prev), reason_code: 'consistency_recompute',
    provenance: 'self_report', trust_multiplier: null,
    detail: { activeWeighted: round2(got), possibleWeighted: round2(possible), idleDays }
  });
  return { score };
}

// ---------------------------------------------------------------------------
// NUTRITION — on-plan days out of logDaysForFullCredit per week.
// inputs.nutrition = { days: [{ daysAgo, calories, proteinG, mealsOnPlan, provenance }],
//                      calorieTargetKcal|null, weightKg|null, goalMode, idleDays, pauseActive }
// A day earns: 1.0 when calories within band AND protein floor hit;
// 0.5 when only one criterion is verifiable/met or mealsOnPlan==='yes'; else 0.
// ---------------------------------------------------------------------------
function nutritionDayCredit(day, targetKcal, weightKg, goalMode) {
  const cal = Number(day.calories);
  const pro = Number(day.proteinG);
  const goal = goalMode === 'cut' ? 'cut' : goalMode === 'bulk' ? 'gain' : 'maintain';
  const proteinFloor = weightKg ? C.nutrition.proteinGPerKg[goal] * weightKg : null;
  const calOk = targetKcal && Number.isFinite(cal) && cal > 0
    ? Math.abs(cal - targetKcal) <= targetKcal * C.nutrition.calorieBandPct : null;
  const proOk = proteinFloor && Number.isFinite(pro) && pro > 0 ? pro >= proteinFloor : null;
  if (calOk === true && proOk === true) return 1.0;
  if (calOk === true || proOk === true) return 0.5;
  if (calOk === null && proOk === null && String(day.mealsOnPlan || '').toLowerCase() === 'yes') return 0.5;
  return 0;
}

function computeNutrition(inputs, prev, events) {
  const n = inputs.nutrition || {};
  const days = Array.isArray(n.days) ? n.days : [];
  let got = 0, possible = 0;
  for (const d of days) {
    const w = recencyWeight(d.daysAgo);
    // full credit needs logDaysForFullCredit on-plan days out of every 7
    possible += w * (C.nutrition.logDaysForFullCredit / 7);
    got += w * trustedCredit(nutritionDayCredit(d, n.calorieTargetKcal, n.weightKg, n.goalMode), d.provenance);
  }
  const raw = possible > 0 ? (got / possible) * 100 : 0;
  let score = clamp(raw, 0, 100);
  const idleDays = Number.isFinite(n.idleDays) ? n.idleDays : 999;
  if (idleDays > C.decay.nutrition.graceDays) {
    score = applyDecayOrPause(prev, 'nutrition', idleDays, !!n.pauseActive, 0);
  }
  events.push({
    axis: 'nutrition', delta: round2(score - prev), reason_code: 'nutrition_recompute',
    provenance: 'self_report', trust_multiplier: null,
    detail: { onPlanWeighted: round2(got), possibleWeighted: round2(possible), idleDays }
  });
  return { score };
}

// ---------------------------------------------------------------------------
// RECOVERY — duration (bands) + regularity (wake-time spread) + restedness.
// inputs.recovery = { days: [{ daysAgo, sleepMinutes, wakeAtMinutesOfDay|null,
//                              restedness1to5|null, provenance }],
//                     consecutiveTrainingDays, isSenior, idleDays, pauseActive }
// ---------------------------------------------------------------------------
function sleepDurationPts(hours, isSenior) {
  const b = C.recovery.sleepBands;
  const x = C.engineExtras.sleep;
  const lo = isSenior ? b.seniorMinHours : b.adultMinHours;
  const hi = isSenior ? b.seniorMaxHours : b.adultMaxHours;
  if (!Number.isFinite(hours) || hours <= 0) return null;
  if (hours >= lo && hours <= hi) return 100;
  const floorZero = lo * x.floorZeroFraction;
  const ceilZero = hi * x.ceilingZeroFactor;
  if (hours < lo) return clamp(((hours - floorZero) / (lo - floorZero)) * 100, 0, 100);
  return clamp(((ceilZero - hours) / (ceilZero - hi)) * 100, 0, 100);
}

function computeRecovery(inputs, prev, events) {
  const r = inputs.recovery || {};
  const days = Array.isArray(r.days) ? r.days : [];
  let durGot = 0, durW = 0, restGot = 0, restW = 0;
  const wakes = [];
  for (const d of days) {
    const w = recencyWeight(d.daysAgo);
    const pts = sleepDurationPts((Number(d.sleepMinutes) || 0) / 60, !!r.isSenior);
    if (pts !== null) {
      durGot += w * trustedCredit(pts, d.provenance);
      durW += w;
    }
    if (Number.isFinite(d.restedness1to5)) {
      restGot += w * clamp((d.restedness1to5 - 1) / 4, 0, 1) * 100;
      restW += w;
    }
    if (Number.isFinite(d.wakeAtMinutesOfDay)) wakes.push(d.wakeAtMinutesOfDay);
  }
  const duration = durW > 0 ? durGot / durW : 0;
  // Regularity: full credit when wake-time spread stays inside the tagged band
  // (C.engineExtras.regularity), fading to zero at the outer bound.
  let regularity = 0;
  if (C.recovery.regularityMatters && wakes.length >= 3) {
    const reg = C.engineExtras.regularity;
    const mean = wakes.reduce((x, y) => x + y, 0) / wakes.length;
    const sd = Math.sqrt(wakes.reduce((x, y) => x + (y - mean) ** 2, 0) / wakes.length);
    regularity = clamp((reg.zeroCreditStdMinutes - sd) / (reg.zeroCreditStdMinutes - reg.fullCreditStdMinutes), 0, 1) * 100;
  }
  const restedness = restW > 0 ? restGot / restW : duration; // fall back to duration signal
  const wts = C.recovery.weights;
  let raw = wts.duration * duration + wts.regularity * regularity + wts.restedness * restedness;
  // Punish 7-day/week grinding: no rest day in punishGrindAfterDaysStraight.
  if ((Number(r.consecutiveTrainingDays) || 0) >= C.recovery.punishGrindAfterDaysStraight) {
    raw = raw * (1 - C.engineExtras.grindPenaltyFraction);
  }
  let score = clamp(raw, 0, 100);
  const idleDays = Number.isFinite(r.idleDays) ? r.idleDays : 999;
  if (idleDays > C.decay.recovery.graceDays) {
    score = applyDecayOrPause(prev, 'recovery', idleDays, !!r.pauseActive, 0);
  }
  events.push({
    axis: 'recovery', delta: round2(score - prev), reason_code: 'recovery_recompute',
    provenance: 'self_report', trust_multiplier: null,
    detail: { duration: round2(duration), regularity: round2(regularity), restedness: round2(restedness), grindDays: Number(r.consecutiveTrainingDays) || 0, idleDays }
  });
  return { score };
}

// ---------------------------------------------------------------------------
// PROGRESS — EMA weight trend vs goal-appropriate safe rate; matching the
// safe rate scores higher than exceeding it (crash-cut protection).
// inputs.progress = { weighins: [{ daysAgo, weightLb }], goalMode,
//                     experience ('beginner'|'intermediate'|'advanced'),
//                     liftImprovementRatio|null, idleDays, pauseActive }
// ---------------------------------------------------------------------------
function emaWeightSeries(weighins, halfLifeDays) {
  // weighins sorted oldest -> newest (daysAgo descending)
  const sorted = [...weighins].sort((a, b) => b.daysAgo - a.daysAgo);
  let ema = null;
  const out = [];
  for (const p of sorted) {
    const w = Number(p.weightLb);
    if (!Number.isFinite(w) || w <= 0) continue;
    ema = ema === null ? w : ema + (w - ema) * (1 - Math.pow(0.5, 1 / halfLifeDays));
    out.push({ daysAgo: p.daysAgo, ema });
  }
  return out;
}

function weeklyTrendPctBw(series) {
  if (series.length < 2) return null;
  const first = series[0], last = series[series.length - 1];
  const spanDays = first.daysAgo - last.daysAgo;
  if (spanDays < 7) return null;                       // not enough spread to call a trend
  const totalPct = ((last.ema - first.ema) / first.ema) * 100;
  return totalPct / (spanDays / 7);                    // %BW per week (negative = loss)
}

function gradeProgressRate(ratePctPerWeek, goalMode, experience) {
  if (ratePctPerWeek === null) return null;
  const band = C.progress.safeFatLossPctBWPerWeek;
  if (goalMode === 'cut') {
    const loss = -ratePctPerWeek;                      // positive when losing
    if (loss >= band.min && loss <= band.max) return 100;
    if (loss < band.min) return clamp((loss / band.min) * 100, 0, 100); // slow but moving
    // exceeding the safe rate: crash-cut protection — score falls as rate grows
    if (C.progress.rewardMatchingNotExceeding) {
      return clamp(100 - ((loss - band.max) / band.max) * 100, 0, 100);
    }
    return 100;
  }
  if (goalMode === 'bulk') {
    const exp = ['beginner', 'intermediate', 'advanced'].includes(experience) ? experience : 'beginner';
    const targetWeekly = C.progress.muscleGainPctBWPerMonth[exp] / 4.345;   // %BW/week
    if (targetWeekly <= 0) return null;
    const gain = ratePctPerWeek;
    if (gain <= 0) return clamp(50 + gain * 100, 0, 100);   // flat-to-losing while bulking
    return clamp(100 - (Math.abs(gain - targetWeekly) / targetWeekly) * 50, 0, 100);
  }
  // maintain: a flat trend IS success — full credit inside daily scale noise
  // spread over a week, fading to zero at four times that.
  const tol = C.progress.dailyScaleNoisePct / 7;
  const drift = Math.abs(ratePctPerWeek);
  if (drift <= tol) return 100;
  return clamp(100 - ((drift - tol) / (3 * tol)) * 100, 0, 100);
}

function computeProgress(inputs, prev, events) {
  const p = inputs.progress || {};
  const weighins = Array.isArray(p.weighins) ? p.weighins : [];
  const series = emaWeightSeries(weighins, C.progress.emaHalfLifeDays);
  const rate = weeklyTrendPctBw(series);
  let raw = gradeProgressRate(rate, p.goalMode, p.experience);
  // Lift progression is corroborating evidence toward the goal.
  if (Number.isFinite(p.liftImprovementRatio) && p.liftImprovementRatio > 0) {
    const liftScore = selfImprovement(p.liftImprovementRatio, 1);
    raw = raw === null ? liftScore : Math.max(raw, (raw + liftScore) / 2);
  }
  const pauseForData = raw === null;                    // too little logging: pause, don't decay
  let score = raw === null ? prev : clamp(raw, 0, 100);
  const idleDays = Number.isFinite(p.idleDays) ? p.idleDays : 999;
  if (idleDays > C.decay.progress.graceDays && !pauseForData) {
    score = applyDecayOrPause(prev, 'progress', idleDays, !!p.pauseActive, 0);
  }
  events.push({
    axis: 'progress', delta: round2(score - prev), reason_code: pauseForData ? 'progress_paused_insufficient_data' : 'progress_recompute',
    provenance: 'self_report', trust_multiplier: null,
    detail: { weeklyTrendPctBw: roundOrNull(rate), goalMode: p.goalMode || null, idleDays }
  });
  return { score };
}

// ---------------------------------------------------------------------------
// Top-level: compute all six axes + rank + caste from one inputs object.
// prevScores: yesterday's snapshot (or zeros). Returns { axes, rank, caste,
// normalized, events } — the caller (scoringGather/persist layer) writes rows.
// ---------------------------------------------------------------------------
function computeAxes(inputs, prevScores = {}, today = new Date()) {
  const events = [];
  const prev = (a) => clamp(Number(prevScores[a]) || 0, 0, 100);
  const strength = computeStrength(inputs, prev('strength'), events);
  const cardio = computeCardio(inputs, prev('cardio'), events, today);
  const consistency = computeConsistency(inputs, prev('consistency'), events);
  const nutrition = computeNutrition(inputs, prev('nutrition'), events);
  const recovery = computeRecovery(inputs, prev('recovery'), events);
  const progress = computeProgress(inputs, prev('progress'), events);
  const axes = {
    strength: round2(strength.score),
    cardio: round2(cardio.score),
    consistency: round2(consistency.score),
    nutrition: round2(nutrition.score),
    recovery: round2(recovery.score),
    progress: round2(progress.score)
  };
  const { rank, caste } = computeRank(axes, inputs.weeksAtCandidate || {});
  return { axes, rank, caste, normalized: strength.normalized, events };
}

function round2(v) { return Math.round(Number(v) * 100) / 100; }
function roundOrNull(v) { return v === null || v === undefined || !Number.isFinite(Number(v)) ? null : round2(v); }

module.exports = {
  AXES, ageFrom, trustMultiplier, recencyWeight, normalizeStrength,
  selfImprovement, blend, applyDecayOrPause, computeRank,
  gradeWhoMinutes, gradeVo2max, nutritionDayCredit, sleepDurationPts,
  emaWeightSeries, weeklyTrendPctBw, gradeProgressRate,
  computeStrength, computeCardio, computeConsistency, computeNutrition,
  computeRecovery, computeProgress, computeAxes
};
