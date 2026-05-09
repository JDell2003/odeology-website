(function initTrainingDebugCombo(root, factory) {
  const exported = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = exported;
  }
  if (root && typeof root === 'object') {
    root.TrainingDebugCombo = exported;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createTrainingDebugCombo() {
  const DEBUG_COMBO_LABEL = 'glutes-legs-core';

  function normalizePriorityKey(value) {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return '';
    if (key === 'abs' || key === 'core') return 'core';
    if (key === 'glutes' || key === 'glute' || key === 'hamstrings/glutes' || key === 'hamstrings & glutes' || key === 'hamstrings and glutes') return 'glutes';
    if (key === 'legs' || key === 'leg' || key === 'quads' || key === 'quadriceps') return 'legs';
    return key;
  }

  function buildPrioritySet(values) {
    return new Set((Array.isArray(values) ? values : []).map((value) => normalizePriorityKey(value)).filter(Boolean));
  }

  function normalizeEquipmentAlias(value) {
    const key = String(value || '').trim().toLowerCase();
    if (!key) return '';
    if (key === 'dumbbells' || key === 'dumbbell') return 'dumbbell';
    if (key === 'barbells' || key === 'barbell') return 'barbell';
    if (key === 'machines' || key === 'machine') return 'machine';
    if (key === 'cables' || key === 'cable') return 'cable';
    if (key === 'bodyweight') return 'bodyweight';
    return key;
  }

  function normalizeEquipmentAccess(raw) {
    if (Array.isArray(raw)) return raw.map((value) => normalizeEquipmentAlias(value)).filter(Boolean);
    if (!raw || typeof raw !== 'object') return [];
    return Object.entries(raw)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => normalizeEquipmentAlias(key))
      .filter(Boolean);
  }

  function hasCommercialGymLowerBodyCapability(raw) {
    const equipment = new Set(normalizeEquipmentAccess(raw));
    if (!equipment.size) return false;
    const lowerBodyGymTokens = ['barbell', 'dumbbell', 'machine', 'smith', 'bands', 'pull-up bar', 'cable'];
    return lowerBodyGymTokens.some((token) => equipment.has(token));
  }

  function hasFullGymEquipment(raw) {
    const equipment = new Set(normalizeEquipmentAccess(raw));
    return equipment.has('bodyweight')
      && equipment.has('barbell')
      && equipment.has('dumbbell')
      && equipment.has('machine')
      && equipment.has('cable');
  }

  function isTargetPriorityCombo(values) {
    const priorities = buildPrioritySet(values);
    return priorities.size === 3
      && priorities.has('glutes')
      && priorities.has('legs')
      && priorities.has('core');
  }

  function normalizePriorityList(values) {
    return Array.from(buildPrioritySet(values));
  }

  function normalizeInjuryMap(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return Object.keys(src).map((key) => String(key || '').trim()).filter(Boolean);
  }

  function evaluateGlutesLegsCoreDebugCombo(payload, options = {}) {
    const src = payload && typeof payload === 'object' ? payload : {};
    const mode = options?.rawClassic ? 'rawClassic' : (options?.builderNormalized ? 'builderNormalized' : 'coerced');
    const daysPerWeek = Number(src?.daysPerWeek || 0);
    const trainingFeel = String(src?.trainingFeel || '').trim();
    const discipline = String(src?.discipline || '').trim();
    const sessionLengthMin = String(src?.sessionLengthMin || src?.strength?.timePerSession || src?.timePerSession || '').trim();
    const primaryGoal = String(src?.primaryGoal || '').trim();
    const phase = String(src?.phase || src?.strength?.phase || '').trim();
    const location = String(src?.location || '').trim();
    const rawPriorityGroups = options?.rawClassic
      ? (Array.isArray(src?.emphasis) ? src.emphasis.map((value) => String(value || '')) : [])
      : (Array.isArray(src?.priorityGroups) ? src.priorityGroups.map((value) => String(value || '')) : []);
    const normalizedPriorityGroups = normalizePriorityList(rawPriorityGroups);
    const normalizedEquipment = normalizeEquipmentAccess(
      options?.builderNormalized ? (src?.allowedEquipment || src?.equipmentAccess) : src?.equipmentAccess
    );
    const painAreas = Array.isArray(src?.painAreas) ? src.painAreas.map((value) => String(value || '')).filter(Boolean) : [];
    const injuryMapKeys = normalizeInjuryMap(src?.injuryMap);
    const injuryNotes = String(src?.injuryNotes || '').trim();
    const injuryJoints = Array.isArray(src?.strength?.injury?.joints)
      ? src.strength.injury.joints.map((value) => String(value || '')).filter(Boolean)
      : [];
    const hasInjury = options?.rawClassic
      ? (Boolean(src?.strength?.injury?.has) || injuryJoints.length > 0)
      : (painAreas.length > 0 || injuryMapKeys.length > 0 || Boolean(injuryNotes));
    const locationIsCommercialGym = String(location).toLowerCase() === 'commercial gym';
    const fullGymMatch = options?.builderNormalized
      ? (
        locationIsCommercialGym
        || hasFullGymEquipment(src?.allowedEquipment)
        || hasFullGymEquipment(src?.equipmentAccess)
        || hasCommercialGymLowerBodyCapability(src?.allowedEquipment)
        || hasCommercialGymLowerBodyCapability(src?.equipmentAccess)
      )
      : (
        locationIsCommercialGym
        || hasFullGymEquipment(src?.equipmentAccess)
        || hasCommercialGymLowerBodyCapability(src?.equipmentAccess)
      );
    const checks = [];
    const pushCheck = (ok, reason) => checks.push({ ok: Boolean(ok), reason });

    pushCheck(daysPerWeek === 5, 'daysPerWeek_mismatch');
    pushCheck(isTargetPriorityCombo(rawPriorityGroups), 'priority_combo_mismatch');
    if (options?.rawClassic) {
      pushCheck(String(discipline).toLowerCase() === 'bodybuilding', 'discipline_mismatch');
      pushCheck(['maintain', 'recomp', 'build size', 'bulk', 'gain size', 'hypertrophy'].includes(String(phase).toLowerCase()), 'phase_mismatch');
      pushCheck(['75+', '60-75', '75'].includes(String(sessionLengthMin).toLowerCase()), 'session_length_mismatch');
      pushCheck(!hasInjury, 'injury_present');
      pushCheck(fullGymMatch, 'equipment_alias_mismatch');
    } else if (options?.builderNormalized) {
      pushCheck(String(discipline).toLowerCase() === 'bodybuilding', 'discipline_mismatch');
      pushCheck(['recomp', 'surplus'].includes(String(phase).toLowerCase()), 'phase_mismatch');
      pushCheck(['75+', '75'].includes(String(sessionLengthMin)), 'session_length_mismatch');
      pushCheck(!hasInjury, 'injury_present');
      pushCheck(fullGymMatch, 'equipment_alias_mismatch');
    } else {
      pushCheck(String(trainingFeel).toLowerCase() === 'aesthetic bodybuilding', 'training_feel_mismatch');
      pushCheck(String(location).toLowerCase() === 'commercial gym', 'location_mismatch');
      pushCheck(['recomp', 'build size'].includes(String(primaryGoal).toLowerCase()), 'primary_goal_mismatch');
      pushCheck(['75+', '75'].includes(String(sessionLengthMin)), 'session_length_mismatch');
      pushCheck(!hasInjury, 'injury_present');
      pushCheck(fullGymMatch, 'equipment_alias_mismatch');
    }

    const failed = checks.find((entry) => !entry.ok) || null;
    return {
      mode,
      matched: !failed,
      reasonIfFalse: failed ? failed.reason : '',
      rawPriorityGroups,
      normalizedPriorityGroups,
      discipline,
      trainingFeel,
      daysPerWeek,
      sessionLengthMin,
      location,
      primaryGoal,
      phase,
      normalizedEquipmentAccess: normalizedEquipment,
      painAreas,
      injuryMapKeys,
      injuryNotes,
      injuryJoints
    };
  }

  function matchesGlutesLegsCoreDebugCombo(payload, options = {}) {
    return evaluateGlutesLegsCoreDebugCombo(payload, options).matched;
  }

  return {
    DEBUG_COMBO_LABEL,
    normalizePriorityKey,
    buildPrioritySet,
    normalizePriorityList,
    normalizeEquipmentAlias,
    normalizeEquipmentAccess,
    hasFullGymEquipment,
    hasCommercialGymLowerBodyCapability,
    evaluateGlutesLegsCoreDebugCombo,
    matchesGlutesLegsCoreDebugCombo
  };
});
