const engine = require('./generator/trainingEngine.oblueprint');
const trainingRoutes = require('./core/trainingRoutes');
const rawLog = console.log.bind(console);
console.log = (...args) => {
  const first = String(args[0] || '');
  if (first.startsWith('DEBUG_COMBO_MATCH_EVAL') || first.startsWith('[training-debug]')) return;
  rawLog(...args);
};
function buildLivePlan(payload) {
  const direct = engine.buildOblueprintPlan(payload, { fastBuild: true });
  if (!direct?.error) return { plan: direct, source: 'direct' };
  const routed = trainingRoutes._private.buildOblueprintPlanWithFallback(payload);
  if (routed?.error) return { error: routed.error, source: 'fallback' };
  return { plan: routed.plan, source: 'fallback' };
}
function normalizeName(value) { return String(value || '').trim().toLowerCase(); }
function isStrengthAnchor(exercise) {
  return String(exercise?.style || '') === 'Compound' && /rep-first progression/i.test(String(exercise?.progressionRule || '')) && /3-5|4-6|5-8/.test(String(exercise?.reps || ''));
}
function isBenchLike(exercise) { const name = normalizeName(exercise?.name); return String(exercise?.pattern || '').toLowerCase() === 'horizontalpush' || /\b(bench|chest press|incline press|decline press)\b/.test(name); }
function isSquatLike(exercise) { const name = normalizeName(exercise?.name); return String(exercise?.pattern || '').toLowerCase() === 'squat' || /\b(squat|leg press|hack squat)\b/.test(name); }
function isHingeLike(exercise) { const name = normalizeName(exercise?.name); return String(exercise?.pattern || '').toLowerCase() === 'hinge' || /\b(deadlift|romanian deadlift|rdl|hip thrust|glute bridge|stiff[- ]?leg)\b/.test(name); }
function isHypertrophyAccessory(exercise) { return String(exercise?.style || '') === 'Isolation' || (/10-15|10-20|12-20|12-15|15-20/.test(String(exercise?.reps || '')) && !isStrengthAnchor(exercise)); }
function flattenWeek(week) { return (week.days || []).flatMap((day) => (day.exercises || []).map((exercise) => ({ ...exercise, _dayType: day.dayType, _day: day.day }))); }
function priorityCoverage(week, priorities) {
  const exs = flattenWeek(week); const map = {};
  for (const key of priorities || []) map[key] = exs.filter((ex) => {
    const primary = String(ex?.primary || ex?.muscleTarget || '').toLowerCase();
    if (key === 'Chest') return primary === 'chest' || isBenchLike(ex);
    if (key === 'Back') return primary === 'back' || /pull/i.test(String(ex?.pattern || ''));
    if (key === 'Legs') return primary === 'legs' || isSquatLike(ex);
    if (key === 'Glutes') return primary === 'glutes' || isHingeLike(ex);
    if (key === 'Shoulders') return primary === 'shoulders' || !!ex?.lateralDeltPattern || !!ex?.rearDeltPattern || !!ex?.shoulderPressPattern;
    if (key === 'Arms') return primary === 'arms' || String(ex?.directArmType || '').toLowerCase() !== 'none';
    if (key === 'Core') return !!ex?.directAb;
    if (key === 'Calves') return !!ex?.directCalf;
    return false;
  }).map((ex) => ex.name);
  return map;
}
function manualAudit(payload, week) {
  const days = week.days || []; const all = flattenWeek(week); const issues = []; const notes = [];
  notes.push(all.some(isStrengthAnchor) ? 'Looks like powerbuilding: yes' : 'Looks like powerbuilding: no');
  notes.push(days.filter((d) => isStrengthAnchor(d.exercises?.[0])).length >= Math.max(1, Math.min(2, days.length)) ? 'Strength anchors early: yes' : 'Strength anchors early: weak');
  notes.push(all.filter((ex) => String(ex?.style || '') === 'Isolation').length >= 2 ? 'Accessories useful: yes' : 'Accessories useful: questionable');
  notes.push(days.every((d) => (d.exercises || []).length <= (payload.sessionLengthMin === 30 ? 4 : payload.sessionLengthMin === 45 ? 5 : payload.sessionLengthMin === 60 ? 6 : 7)) ? 'Volume realistic: yes' : 'Volume realistic: questionable');
  notes.push(((Number(payload.sleepHours || 0) <= 6) || normalizeName(payload.stress) === 'high' || payload.primaryGoal === 'Cut fat') ? 'Recovery respected: check conservative exercise count and overlap' : 'Recovery respected: baseline');
  notes.push((payload.priorityGroups || []).join(' > ') ? `Priority order: ${(payload.priorityGroups || []).join(' > ')}` : 'Priority order: none');
  if ((payload.priorityGroups || []).includes('Calves')) notes.push(all.some((ex) => ex.directCalf) ? 'Calves preserved: yes' : 'Calves preserved: no');
  if ((payload.priorityGroups || []).includes('Core')) notes.push(all.some((ex) => ex.directAb) ? 'Core preserved: yes' : 'Core preserved: no');
  if ((payload.painAreas || []).includes('Back')) {
    const axial = all.filter((ex) => !!ex.axialLoadHigh && String(ex.style) === 'Compound').length;
    if (axial > 2) issues.push(`Back pain still has high axial loading count (${axial}).`);
  }
  if ((payload.painAreas || []).includes('Shoulder')) {
    const risky = all.filter((ex) => !!ex.shoulderPressPattern).length;
    if (risky > 1) issues.push(`Shoulder pain still has notable overhead stress (${risky}).`);
  }
  if ((payload.painAreas || []).includes('Elbow')) {
    const elbow = all.filter((ex) => !!ex.skullcrusherLike || !!ex.wristExtensionHeavy).length;
    if (elbow > 1) issues.push(`Elbow pain still has provocative arm loading (${elbow}).`);
  }
  if ((payload.movementsToAvoid || []).includes('bench press') && all.some((ex) => /bench press/i.test(String(ex.name || '')))) issues.push('Bench press family leaked into a bench-avoid case.');
  if ((payload.movementsToAvoid || []).includes('deadlift') && all.some((ex) => /deadlift/i.test(String(ex.name || '')))) issues.push('Deadlift family leaked into a deadlift-avoid case.');
  return { notes, issues };
}
const cases = require('./tmp_pb_cases.json');
for (const entry of cases) {
  const result = buildLivePlan(entry.payload);
  rawLog('\n============================================================');
  rawLog(entry.title);
  if (result.error) { rawLog('BUILD ERROR:', result.error); continue; }
  const plan = result.plan; const week = plan.weeks[0]; const profile = plan.meta?.profile?.powerbuilding || {};
  rawLog('Source:', result.source);
  rawLog('Input summary:', JSON.stringify({ focus: entry.payload.focus, priorities: entry.payload.priorityGroups, daysPerWeek: entry.payload.daysPerWeek, sessionLengthMin: entry.payload.sessionLengthMin, experience: entry.payload.experience, primaryGoal: entry.payload.primaryGoal, trainingStyle: entry.payload.trainingStyle, location: entry.payload.location, equipmentAccess: entry.payload.equipmentAccess, painAreas: entry.payload.painAreas, movementsToAvoid: entry.payload.movementsToAvoid }));
  rawLog('Inferred strength emphasis:', JSON.stringify({ primary: profile.primaryEmphasis, scores: profile.scores, complexity: profile.complexity, recoveryPenalty: profile.recoveryPenalty, weeklyAnchorTarget: profile.weeklyAnchorTarget }));
  rawLog('Weekly split:', (week.days || []).map((d) => d.dayType).join(' | '));
  for (const day of (week.days || [])) {
    rawLog(`\n${day.day || ''} ${day.dayType}`.trim());
    for (const ex of (day.exercises || [])) {
      const tags = [];
      if (isStrengthAnchor(ex)) tags.push('STRENGTH_ANCHOR');
      if (isHypertrophyAccessory(ex)) tags.push('HYPERTROPHY_ACCESSORY');
      rawLog(`- ${ex.name} | ${ex.sets} x ${ex.reps}${ex.rir ? ` | RIR ${ex.rir}` : ''}${tags.length ? ` | [${tags.join(', ')}]` : ''}`);
    }
  }
  rawLog('\nStrength anchors:', flattenWeek(week).filter(isStrengthAnchor).map((ex) => `${ex._dayType}: ${ex.name}`).join(' ; ') || 'none');
  rawLog('Hypertrophy accessories:', flattenWeek(week).filter(isHypertrophyAccessory).map((ex) => `${ex._dayType}: ${ex.name}`).join(' ; ') || 'none');
  rawLog('Priority group coverage:', JSON.stringify(priorityCoverage(week, entry.payload.priorityGroups)));
  const audit = manualAudit(entry.payload, week);
  rawLog('Manual audit:', audit.notes.join(' | '));
  rawLog('Issues found:', audit.issues.length ? audit.issues.join(' | ') : 'none');
}
