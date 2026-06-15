const WEEKDAY_DEFAULT_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const WEEKDAY_INDEX = new Map([
  ['su', 0], ['sun', 0], ['sunday', 0],
  ['mo', 1], ['mon', 1], ['monday', 1],
  ['tu', 2], ['tue', 2], ['tuesday', 2],
  ['we', 3], ['wed', 3], ['wednesday', 3],
  ['th', 4], ['thu', 4], ['thursday', 4],
  ['fr', 5], ['fri', 5], ['friday', 5],
  ['sa', 6], ['sat', 6], ['saturday', 6]
]);

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeList(values) {
  return Array.isArray(values) ? values.map((value) => String(value || '').trim()).filter(Boolean) : [];
}

function canonicalPriority(value) {
  const key = normalizeText(value);
  if (key === 'chest') return 'Chest';
  if (key === 'back') return 'Back';
  if (key === 'shoulder' || key === 'shoulders') return 'Shoulders';
  if (key === 'arm' || key === 'arms') return 'Arms';
  if (key === 'leg' || key === 'legs' || key === 'quads') return 'Legs';
  if (key === 'glute' || key === 'glutes' || key.includes('hamstring')) return 'Glutes';
  if (key === 'calf' || key === 'calves') return 'Calves';
  if (key === 'abs' || key === 'core') return 'Core';
  return String(value || '').trim();
}

function buildPriorityRanks(priorityGroups) {
  const ranks = {};
  normalizeList(priorityGroups).slice(0, 3).forEach((entry, index) => {
    const key = canonicalPriority(entry);
    if (key && !ranks[key]) ranks[key] = index + 1;
  });
  return ranks;
}

function painSeverity(user, key) {
  return Math.max(0, Number(user?.injuryMap?.[key] || user?.injuryMap?.[String(key || '').toLowerCase()] || 0));
}

function hasAvoidToken(user, tokens) {
  const avoid = normalizeList(user?.movementsToAvoid).map(normalizeText);
  return tokens.some((token) => avoid.some((entry) => entry === token || entry.includes(token)));
}

function hasEquipment(user, tokens) {
  const allowed = new Set(normalizeList(user?.allowedEquipment).map(normalizeText));
  return tokens.some((token) => allowed.has(normalizeText(token)));
}

function buildRecoveryTier(user) {
  const sleep = Number(user?.sleepHours || 0);
  const stress = normalizeText(user?.stress);
  const deficit = String(user?.phase || '') === 'deficit';
  const maxPain = Math.max(
    painSeverity(user, 'back'),
    painSeverity(user, 'hip'),
    painSeverity(user, 'knee'),
    painSeverity(user, 'ankle'),
    painSeverity(user, 'shoulder'),
    painSeverity(user, 'elbow'),
    painSeverity(user, 'wrist')
  );
  if (sleep < 6 || stress === 'high' || maxPain >= 8 || (deficit && sleep < 7)) return 'low';
  if (sleep >= 8 && stress === 'low' && maxPain <= 3 && !deficit) return 'high';
  return 'normal';
}

function buildMilitaryProfile(user) {
  if (String(user?.discipline || '') !== 'military') return null;
  const recoveryTier = buildRecoveryTier(user);
  const lowerPain = Math.max(painSeverity(user, 'knee'), painSeverity(user, 'hip'), painSeverity(user, 'ankle'));
  const hingePain = Math.max(painSeverity(user, 'back'), painSeverity(user, 'hip'));
  const upperPain = Math.max(painSeverity(user, 'shoulder'), painSeverity(user, 'elbow'), painSeverity(user, 'wrist'));
  const avoidRunning = hasAvoidToken(user, ['running', 'run', 'sprint', 'shuttle']);
  const avoidDeadlift = hasAvoidToken(user, ['deadlift', 'barbell hinge']);
  const avoidSquat = hasAvoidToken(user, ['squat']);
  const runningBlocked = avoidRunning || lowerPain >= 8;
  const impactRestricted = lowerPain >= 6;
  const hingeBlocked = avoidDeadlift || hingePain >= 8;
  const pushupRestricted = upperPain >= 7;
  const days = Math.max(2, Math.min(6, Number(user?.daysPerWeek || 4)));
  return {
    recoveryTier,
    priorityRanks: buildPriorityRanks(user?.priorityGroups),
    runningBlocked,
    impactRestricted,
    hingeBlocked,
    squatBlocked: avoidSquat,
    pushupRestricted,
    kneePain: painSeverity(user, 'knee'),
    hasSled: hasEquipment(user, ['sled']),
    hasCarryLoad: hasEquipment(user, ['dumbbell', 'kettlebell', 'barbell']),
    hasMedicineBall: hasEquipment(user, ['medicineball']),
    hardConditioningCap: recoveryTier === 'low' ? 1 : 2,
    zone2Target: days <= 2 ? 1 : recoveryTier === 'low' ? 1 : 2,
    accessoryMultiplier: recoveryTier === 'low' ? 0.7 : recoveryTier === 'high' ? 1 : 0.85,
    calfDailyCap: Number.isFinite(buildPriorityRanks(user?.priorityGroups).Calves) ? 2 : 1,
    calfWeeklyExposureCap: Number.isFinite(buildPriorityRanks(user?.priorityGroups).Calves) ? 2 : 1,
    maxTasksPerSession: String(user?.sessionLengthMin || '') === '30'
      ? 4
      : String(user?.sessionLengthMin || '') === '45'
        ? 5
        : String(user?.sessionLengthMin || '') === '75+'
          ? 8
          : 6
  };
}

function buildMilitarySplit(user) {
  const daysPerWeek = Math.max(2, Math.min(6, Number(user?.daysPerWeek || 4)));
  const splits = {
    2: ['FullBodyA', 'FullBodyB'],
    3: ['FullBodyA', 'LowerFocus', 'FullBodyB'],
    4: ['Upper', 'LowerFocus', 'UpperFocus', 'Lower'],
    5: ['Upper', 'LowerFocus', 'Pull', 'FullBodyA', 'Lower'],
    6: ['Upper', 'LowerFocus', 'Pull', 'FullBodyA', 'Lower', 'DeltsArms']
  };
  const selected = splits[daysPerWeek] || splits[4];
  const days = Array.isArray(user?.preferredDays) && user.preferredDays.length === daysPerWeek
    ? user.preferredDays.slice(0, daysPerWeek)
    : WEEKDAY_DEFAULT_ORDER.slice(0, daysPerWeek);
  return selected.map((dayType, index) => ({ day: days[index], dayType }));
}

function prependSlot(slots, createSlot, id, pattern, muscleTarget, opts = {}) {
  if (slots.some((slot) => String(slot?.id || '') === id)) return;
  slots.unshift(createSlot(id, pattern, 'Compound', muscleTarget, opts));
}

function requirePatternSlot(slots, createSlot, id, pattern, muscleTarget, opts = {}) {
  const existingIndex = slots.findIndex((slot) => (
    String(slot?.pattern || '').toLowerCase() === String(pattern || '').toLowerCase()
    && String(slot?.styleRequired || 'Compound') === 'Compound'
  ));
  if (existingIndex >= 0) {
    slots[existingIndex] = {
      ...slots[existingIndex],
      id,
      optional: false,
      muscleTarget,
      ...opts
    };
    if (existingIndex > 0) {
      const [slot] = slots.splice(existingIndex, 1);
      slots.unshift(slot);
    }
    return;
  }
  prependSlot(slots, createSlot, id, pattern, muscleTarget, opts);
}

function markOptional(slots, ids) {
  const wanted = new Set(ids);
  slots.forEach((slot) => {
    if (wanted.has(String(slot?.id || ''))) slot.optional = true;
  });
}

function applyMilitaryBlueprint(dayType, user, slots, createSlot) {
  const profile = user?.profile?.military;
  if (!profile) return slots;
  const out = slots.map((slot) => ({ ...slot }));
  const type = String(dayType || '');
  if (['LowerFocus', 'Lower', 'FullBodyB'].includes(type)) {
    if (!profile.hingeBlocked) {
      requirePatternSlot(out, createSlot, 'mh_hinge_strength', 'Hinge', 'Glutes', {
        primaryAllowed: ['Legs', 'Glutes'],
        subPreferred: ['Hamstrings-Hinge', 'Glutes']
      });
    } else {
      markOptional(out, ['lf_hinge', 'fbb_hinge']);
    }
    if (!profile.squatBlocked) {
      requirePatternSlot(out, createSlot, profile.hingeBlocked ? 'mh_lower_strength' : 'mil_lower_support', 'Squat', 'Legs', {
        primaryAllowed: ['Legs'],
        subPreferred: ['Quads']
      });
    } else {
      markOptional(out, ['lf_squat', 'lower_squat', 'fbb_squat']);
    }
  }
  if (['Upper', 'UpperFocus', 'FullBodyA'].includes(type)) {
    requirePatternSlot(out, createSlot, 'mh_upper_strength', 'HorizontalPush', 'Chest', {
      primaryAllowed: ['Chest']
    });
  }
  if (profile.pushupRestricted) {
    markOptional(out, ['push_hp', 'push_vp', 'fba_hp', 'fbb_press', 'uf_hp', 'upper_hp']);
  }
  return out;
}

function repOverride(slotId, weekType) {
  const slot = String(slotId || '');
  if (!slot.startsWith('mh_')) return null;
  return {
    reps: weekType === 'intensification' ? '3-5' : '4-6',
    restSec: 180
  };
}

function rirOverride(user, weekType, slotId) {
  if (!String(slotId || '').startsWith('mh_')) return null;
  if (String(user?.outputStyle || '') === 'Simple sets x reps') return null;
  if (weekType === 'deload') return '3-4';
  return '2-3';
}

function progressionRuleOverride(slotId) {
  if (!String(slotId || '').startsWith('mh_')) return null;
  return 'Readiness progression: add clean reps before load, keep 2-3 reps in reserve, and never trade conditioning quality for a failed strength rep.';
}

function task({
  id,
  name,
  style,
  pattern,
  role,
  sets = 1,
  reps = '',
  duration = '',
  restSec = 60,
  requiredEquipment = [],
  notes = '',
  hardConditioning = false,
  zone2 = false
}) {
  return {
    id,
    exerciseId: id,
    canonicalExerciseId: id,
    name,
    displayName: name,
    style,
    pattern,
    primary: role === 'Core endurance' ? 'Core' : role === 'Explosive power' ? 'Legs' : 'Conditioning',
    primaryMuscle: role === 'Core endurance' ? 'Core' : 'Full Body',
    subMuscle: role,
    bodyPart: role === 'Core endurance' ? 'Core' : 'Full Body',
    taskType: 'military_readiness',
    militaryRole: role,
    sets,
    reps,
    duration,
    restSec,
    rir: null,
    requiredEquipment,
    equipment: requiredEquipment,
    mediaPath: null,
    mediaPathAlt: null,
    mediaIcon: pattern === 'Carry' ? 'carry' : pattern === 'Power' ? 'power' : pattern === 'CoreStability' ? 'core' : 'run',
    notes,
    hardConditioning,
    zone2,
    directAb: role === 'Core endurance',
    directCalf: false,
    progressionRule: zone2
      ? 'Keep the effort conversational. Add 2-5 minutes only when recovery and running mechanics remain stable.'
      : hardConditioning
        ? 'Keep repeat quality consistent. Add one repeat or a small amount of work only when speed does not fall off.'
        : 'Progress quality before volume. Stop the set when posture or speed breaks down.'
  };
}

function zone2Prescription(user) {
  const bucket = String(user?.sessionLengthMin || '').trim();
  if (bucket === '30') return '12-15 min conversational pace';
  if (bucket === '45') return '18-25 min conversational pace';
  if (bucket === '75+') return '30-45 min conversational pace';
  return '20-35 min conversational pace';
}

function zone2Task(user, weekIndex, ordinal) {
  const profile = user?.profile?.military;
  const prescription = zone2Prescription(user);
  if (profile.runningBlocked) {
    return task({
      id: `mh_zone2_low_impact_w${weekIndex}_${ordinal}`,
      name: hasEquipment(user, ['machine']) ? 'Low-Impact Zone 2 Cardio' : 'Brisk Walk Zone 2',
      style: 'Cardio',
      pattern: 'Cardio',
      role: 'Aerobic base',
      reps: prescription,
      duration: prescription,
      restSec: 0,
      notes: 'Conversational pace. Choose the most joint-tolerant available modality.',
      zone2: true
    });
  }
  return task({
    id: `mh_zone2_run_w${weekIndex}_${ordinal}`,
    name: 'Zone 2 Run',
    style: 'Cardio',
    pattern: 'Cardio',
    role: 'Aerobic base',
    reps: prescription,
    duration: prescription,
    restSec: 0,
    notes: 'Easy conversational running. Finish with the same mechanics you started with.',
    zone2: true
  });
}

function intervalTask(user, weekIndex) {
  const profile = user?.profile?.military;
  if (profile.runningBlocked || profile.impactRestricted) {
    return task({
      id: `mh_intervals_low_impact_w${weekIndex}`,
      name: 'Low-Impact Conditioning Intervals',
      style: 'Cardio',
      pattern: 'Cardio',
      role: 'Work capacity',
      sets: profile.recoveryTier === 'low' ? 5 : 6,
      reps: '30 sec hard / 90 sec easy',
      restSec: 90,
      notes: 'Use a joint-tolerant modality. Keep every repeat crisp and submaximal.',
      hardConditioning: true
    });
  }
  return task({
    id: `mh_run_intervals_w${weekIndex}`,
    name: 'Run Intervals',
    style: 'Cardio',
    pattern: 'Cardio',
    role: 'Running speed endurance',
    sets: profile.recoveryTier === 'low' ? 4 : 6,
    reps: '60 sec hard / 120 sec easy',
    restSec: 120,
    notes: 'Fast but controlled. Stop before stride quality deteriorates.',
    hardConditioning: true
  });
}

function workCapacityTask(user, weekIndex) {
  const profile = user?.profile?.military;
  if (profile.runningBlocked || profile.impactRestricted) {
    return task({
      id: `mh_capacity_circuit_w${weekIndex}`,
      name: profile.hasCarryLoad ? 'Carry + Bodyweight Work-Capacity Circuit' : 'Bodyweight Work-Capacity Circuit',
      style: 'Cardio',
      pattern: profile.hasCarryLoad ? 'Carry' : 'Cardio',
      role: 'Sprint-drag-carry qualities',
      sets: profile.recoveryTier === 'low' ? 3 : 4,
      reps: profile.hasCarryLoad
        ? '20 m carry, 8 controlled step-ups/side, 20 sec plank'
        : '8 controlled step-ups/side, 6 push-ups, 20 sec plank',
      restSec: 120,
      requiredEquipment: profile.hasCarryLoad ? [hasEquipment(user, ['kettlebell']) ? 'kettlebell' : 'dumbbell'] : [],
      notes: 'Build repeatable work capacity without impact-heavy sprinting.',
      hardConditioning: true
    });
  }
  if (profile.hasSled) {
    return task({
      id: `mh_sdc_w${weekIndex}`,
      name: 'Sprint-Drag-Carry Circuit',
      style: 'Cardio',
      pattern: 'Carry',
      role: 'Sprint-drag-carry qualities',
      sets: profile.recoveryTier === 'low' ? 3 : 4,
      reps: '1 round = 25 m sprint + 25 m sled drag + 25 m lateral shuffle + 25 m carry',
      restSec: 150,
      requiredEquipment: ['sled'],
      notes: 'Treat each set as one clean round. Move fast, keep transitions organized, and rest 150 sec before the next round.',
      hardConditioning: true
    });
  }
  if (profile.hasCarryLoad) {
    return task({
      id: `mh_shuttle_carry_w${weekIndex}`,
      name: 'Shuttle + Loaded Carry Circuit',
      style: 'Cardio',
      pattern: 'Carry',
      role: 'Sprint-drag-carry qualities',
      sets: profile.recoveryTier === 'low' ? 3 : 4,
      reps: '1 round = 20 m shuttle out + 20 m shuttle back + 30 m loaded carry',
      restSec: 150,
      requiredEquipment: [hasEquipment(user, ['kettlebell']) ? 'kettlebell' : 'dumbbell'],
      notes: 'Treat each set as one round. Accelerate under control, stay tall on the carry, and recover fully between rounds.',
      hardConditioning: true
    });
  }
  return task({
    id: `mh_shuttle_bodyweight_w${weekIndex}`,
    name: 'Shuttle + Bodyweight Circuit',
    style: 'Cardio',
    pattern: 'Cardio',
    role: 'Sprint-drag-carry qualities',
    sets: profile.recoveryTier === 'low' ? 3 : 4,
    reps: '20 m out-and-back shuttle, 8 push-ups, 20 sec plank',
    restSec: 150,
    notes: 'Treat each set as one round. Keep transitions clean and stop before mechanics break down.',
    hardConditioning: true
  });
}

function powerTask(user, weekIndex) {
  const profile = user?.profile?.military;
  if (profile.impactRestricted) {
    return task({
      id: `mh_power_low_impact_w${weekIndex}`,
      name: 'Low-Impact Power Step-Up',
      style: 'Power',
      pattern: 'Power',
      role: 'Explosive power',
      sets: 3,
      reps: '4/side',
      restSec: 90,
      notes: 'Drive fast, land quietly, and keep the range pain-free.'
    });
  }
  if (profile.hasMedicineBall) {
    return task({
      id: `mh_medball_power_w${weekIndex}`,
      name: 'Medicine Ball Power Throw',
      style: 'Power',
      pattern: 'Power',
      role: 'Explosive power',
      sets: 4,
      reps: '3',
      restSec: 90,
      requiredEquipment: ['medicineball'],
      notes: 'Every throw should be fast. Stop when power output drops.'
    });
  }
  return task({
    id: `mh_broad_jump_w${weekIndex}`,
    name: 'Broad Jump Practice',
    style: 'Plyo',
    pattern: 'Plyo',
    role: 'Explosive power',
    sets: 4,
    reps: '3',
    restSec: 90,
    notes: 'Use full recovery and stick each landing before the next rep.'
  });
}

function pushupTask(user, weekIndex) {
  const profile = user?.profile?.military;
  if (profile.pushupRestricted) {
    return task({
      id: `mh_upper_endurance_safe_w${weekIndex}`,
      name: 'Pain-Free Upper-Body Endurance',
      style: 'Skill',
      pattern: 'HorizontalPush',
      role: 'Bodyweight endurance',
      sets: 3,
      reps: 'Submaximal technical sets',
      restSec: 90,
      notes: 'Use the safest pressing angle available and stop well before joint irritation.'
    });
  }
  return task({
    id: `mh_pushup_endurance_w${weekIndex}`,
    name: 'Push-Up Endurance',
    style: 'Skill',
    pattern: 'HorizontalPush',
    role: 'Bodyweight endurance',
    sets: 3,
    reps: 'AMRAP leaving 2 reps in reserve',
    restSec: 90,
    notes: 'Keep a rigid trunk and stop before repetition quality changes.'
  });
}

function plankTask(weekIndex) {
  return task({
    id: `mh_plank_endurance_w${weekIndex}`,
    name: 'Plank Endurance',
    style: 'Skill',
    pattern: 'CoreStability',
    role: 'Core endurance',
    sets: 3,
    reps: '30-60 sec',
    restSec: 60,
    notes: 'Brace hard and finish each set before the hips or ribs lose position.'
  });
}

function safePosteriorAccessory(weekIndex) {
  return {
    id: `mh_safe_posterior_w${weekIndex}`,
    exerciseId: `mh_safe_posterior_w${weekIndex}`,
    canonicalExerciseId: 'mh_safe_posterior_glute_bridge',
    name: 'Glute Bridge',
    displayName: 'Glute Bridge',
    style: 'Isolation',
    pattern: 'Hinge',
    primary: 'Glutes',
    primaryMuscle: 'Glutes',
    muscleTarget: 'Glutes',
    subMuscle: 'Hamstrings',
    bodyPart: 'Lower Body',
    militaryRole: 'Safe posterior-chain support',
    sets: 3,
    reps: '10-15',
    restSec: 75,
    rir: '2-3',
    requiredEquipment: [],
    equipment: [],
    mediaPath: null,
    mediaPathAlt: null,
    mediaIcon: 'glutes',
    directHamstring: true,
    progressionRule: 'Add clean reps before load. Keep the range pain-free and stop before the lower back takes over.'
  };
}

function safeKneeDominantAccessory(weekIndex, profile) {
  const painRestricted = Number(profile?.kneePain || 0) >= 6;
  return {
    id: `mh_safe_knee_dominant_w${weekIndex}`,
    exerciseId: `mh_safe_knee_dominant_w${weekIndex}`,
    canonicalExerciseId: painRestricted ? 'mh_safe_wall_sit' : 'mh_safe_step_up',
    name: painRestricted ? 'Pain-Free Wall Sit' : 'Controlled Step-Up',
    displayName: painRestricted ? 'Pain-Free Wall Sit' : 'Controlled Step-Up',
    style: painRestricted ? 'Isolation' : 'Compound',
    pattern: painRestricted ? 'Isometric' : 'SingleLeg',
    primary: 'Legs',
    primaryMuscle: 'Quads',
    muscleTarget: 'Legs',
    subMuscle: painRestricted ? 'Quad isometric' : 'Single-leg strength',
    bodyPart: 'Lower Body',
    militaryRole: 'Safe knee-dominant support',
    sets: 3,
    reps: painRestricted ? '20-40 sec' : '8-12/side',
    restSec: 75,
    rir: '2-3',
    requiredEquipment: [],
    equipment: [],
    mediaPath: null,
    mediaPathAlt: null,
    mediaIcon: 'legs',
    progressionRule: painRestricted
      ? 'Use a pain-free knee angle and add time before depth.'
      : 'Add clean reps before load and keep the step height pain-free.'
  };
}

function safeUpperPressAnchor(weekIndex, user) {
  const useDumbbellBench = hasEquipment(user, ['dumbbell']) && hasEquipment(user, ['bench']);
  const useMachinePress = !useDumbbellBench && hasEquipment(user, ['machine']);
  const useBarbellBench = !useDumbbellBench && !useMachinePress && hasEquipment(user, ['barbell']) && hasEquipment(user, ['bench']);
  const name = useDumbbellBench
    ? 'Dumbbell Bench Press'
    : useMachinePress
      ? 'Machine Chest Press'
      : useBarbellBench
        ? 'Barbell Bench Press'
        : 'Push-Up';
  const requiredEquipment = useDumbbellBench
    ? ['dumbbell', 'bench']
    : useMachinePress
      ? ['machine']
      : useBarbellBench
        ? ['barbell', 'bench']
        : [];
  return {
    id: `mh_safe_upper_press_w${weekIndex}`,
    exerciseId: `mh_safe_upper_press_w${weekIndex}`,
    canonicalExerciseId: normalizeText(name).replace(/[^a-z0-9]+/g, '_'),
    name,
    displayName: name,
    style: 'Compound',
    pattern: 'HorizontalPush',
    primary: 'Chest',
    primaryMuscle: 'Chest',
    muscleTarget: 'Chest',
    subMuscle: 'Pressing strength',
    bodyPart: 'Upper Body',
    sets: 3,
    reps: '4-6',
    restSec: 180,
    rir: '2-3',
    requiredEquipment,
    equipment: requiredEquipment,
    mediaPath: null,
    mediaPathAlt: null,
    mediaIcon: 'press',
    progressionRule: progressionRuleOverride('mh_upper_strength')
  };
}

function safeTrueHingeAnchor(weekIndex, user) {
  const useTrapBar = hasEquipment(user, ['trap bar', 'hex bar']);
  const useBarbell = !useTrapBar && hasEquipment(user, ['barbell']);
  const useDumbbell = !useTrapBar && !useBarbell && hasEquipment(user, ['dumbbell']);
  const name = useTrapBar
    ? 'Trap Bar Deadlift'
    : useBarbell
      ? 'Barbell Deadlift'
      : useDumbbell
        ? 'Dumbbell Romanian Deadlift'
        : 'Glute Bridge';
  const requiredEquipment = useTrapBar
    ? ['trap bar']
    : useBarbell
      ? ['barbell']
      : useDumbbell
        ? ['dumbbell']
        : [];
  const pattern = /deadlift/i.test(name) ? 'Hinge' : 'Hinge';
  return {
    id: `mh_safe_true_hinge_w${weekIndex}`,
    exerciseId: `mh_safe_true_hinge_w${weekIndex}`,
    canonicalExerciseId: normalizeText(name).replace(/[^a-z0-9]+/g, '_'),
    name,
    displayName: name,
    style: /Glute Bridge/i.test(name) ? 'Isolation' : 'Compound',
    pattern,
    primary: 'Glutes',
    primaryMuscle: 'Glutes',
    muscleTarget: 'Glutes',
    subMuscle: 'Posterior-chain strength',
    bodyPart: 'Lower Body',
    sets: 3,
    reps: '4-6',
    restSec: 180,
    rir: '2-3',
    requiredEquipment,
    equipment: requiredEquipment,
    mediaPath: null,
    mediaPathAlt: null,
    mediaIcon: 'hinge',
    progressionRule: progressionRuleOverride('mh_hinge_strength')
  };
}

function isStrengthAnchor(exercise) {
  return String(exercise?.slotId || '').startsWith('mh_')
    || /readiness progression/i.test(String(exercise?.progressionRule || ''))
    || (
      String(exercise?.style || '') === 'Compound'
      && /rep-first progression/i.test(String(exercise?.progressionRule || ''))
      && /3-5|4-6|5-8/.test(String(exercise?.reps || ''))
    );
}

function isHypertrophySupport(exercise) {
  if (!exercise || exercise?.taskType === 'military_readiness' || isStrengthAnchor(exercise)) return false;
  if (String(exercise?.style || '') === 'Isolation') return true;
  return String(exercise?.style || '') === 'Compound' && /6-10|6-12|8-12|8-15|10-15|10-20/.test(String(exercise?.reps || ''));
}

function isPriorityAccessory(exercise, profile) {
  const primary = canonicalPriority(exercise?.muscleTarget || exercise?.primary || '');
  return Number(profile?.priorityRanks?.[primary] || 99) <= 3;
}

function trimForSession(exercises, additions, user) {
  const profile = user?.profile?.military;
  const cap = Number(profile?.maxTasksPerSession || 6);
  const source = Array.isArray(exercises) ? exercises.slice() : [];
  const neededLiftingSlots = Math.max(1, cap - additions.length);
  if (source.length <= neededLiftingSlots) return source;
  const scored = source.map((exercise, index) => {
    let score = 0;
    if (isStrengthAnchor(exercise)) score += 100;
    if (exercise?.militaryIdentityKeep) score += 80;
    if (String(exercise?.style || '') === 'Compound') score += 35;
    if (isPriorityAccessory(exercise, profile)) score += 25;
    if (exercise?.directAb || exercise?.directCalf) score += 8;
    score -= index * 0.25;
    return { exercise, index, score };
  });
  const keep = scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, neededLiftingSlots)
    .sort((a, b) => a.index - b.index)
    .map((entry) => entry.exercise);
  return keep;
}

function preserveMilitaryDayIdentityLift(exercises, baseDayType) {
  const list = Array.isArray(exercises) ? exercises.slice() : [];
  const base = String(baseDayType || '').trim();
  if (!list.length) return list;

  const promoteIdentitySlot = (predicate, slotId) => {
    const index = list.findIndex(predicate);
    if (index < 0) return;
    list[index] = {
      ...list[index],
      militaryIdentityKeep: true,
      slotId: String(list[index]?.slotId || '').startsWith('mh_') ? list[index].slotId : slotId
    };
  };

  if (['Upper', 'FullBodyA'].includes(base)) {
    promoteIdentitySlot((exercise) => militaryExerciseFamily(exercise) === 'horizontal_press', 'mil_upper_identity');
    return list;
  }
  if (base === 'LowerFocus') {
    promoteIdentitySlot((exercise) => {
      const family = militaryExerciseFamily(exercise);
      return family === 'knee_dominant' || family === 'posterior' || family === 'core';
    }, 'mil_lowerfocus_identity');
    return list;
  }
  if (['Lower', 'FullBodyB'].includes(base)) {
    promoteIdentitySlot((exercise) => isTrueHingeName(exercise), 'mil_lower_identity');
    return list;
  }
  return list;
}

function ensureMilitaryUpperPressPresence(exercises, baseDayType, weekIndex, user) {
  const list = Array.isArray(exercises) ? exercises.slice() : [];
  const base = String(baseDayType || '').trim();
  if (!['Upper', 'FullBodyA'].includes(base)) return list;
  if (list.some((exercise) => militaryExerciseFamily(exercise) === 'horizontal_press')) return list;
  const replacement = safeUpperPressAnchor(weekIndex, user);
  const dropIndex = list.findIndex((exercise) => (
    !isStrengthAnchor(exercise)
    && !exercise?.taskType
    && String(exercise?.style || '') === 'Isolation'
    && !isPriorityAccessory(exercise, user?.profile?.military)
  ));
  if (dropIndex >= 0) {
    list.splice(dropIndex, 1, replacement);
  } else {
    list.unshift(replacement);
    const cap = Number(user?.profile?.military?.maxTasksPerSession || 6);
    if (list.length > cap) {
      const removableIndex = (() => {
        for (let i = list.length - 1; i >= 0; i -= 1) {
          const exercise = list[i];
          if (exercise?.taskType) continue;
          if (isStrengthAnchor(exercise)) continue;
          return i;
        }
        return -1;
      })();
      if (removableIndex >= 0) list.splice(removableIndex, 1);
      if (list.length > cap) list.length = cap;
    }
  }
  return orderMilitaryDay(list);
}

function orderMilitaryDay(exercises) {
  return (Array.isArray(exercises) ? exercises : []).slice().sort((a, b) => {
    const rank = (exercise) => {
      if (String(exercise?.style || '') === 'Power' || String(exercise?.style || '') === 'Plyo') return 0;
      if (isStrengthAnchor(exercise)) return 1;
      if (String(exercise?.style || '') === 'Compound') return 2;
      if (exercise?.taskType === 'military_readiness' && exercise?.hardConditioning) return 4;
      if (exercise?.taskType === 'military_readiness' && exercise?.zone2) return 5;
      if (exercise?.taskType === 'military_readiness') return 4;
      return 3;
    };
    return rank(a) - rank(b);
  });
}

function weekdayIndex(value, fallback) {
  const key = normalizeText(value);
  return WEEKDAY_INDEX.has(key) ? WEEKDAY_INDEX.get(key) : fallback;
}

function cyclicDayDistance(a, b) {
  const distance = Math.abs(Number(a) - Number(b));
  return Math.min(distance, 7 - distance);
}

function chooseHardConditioningIndexes(user, dayCount, count) {
  if (count <= 0 || dayCount <= 0) return [];
  if (count === 1 || dayCount < 4) return [0];
  const preferred = Array.isArray(user?.preferredDays) && user.preferredDays.length === dayCount
    ? user.preferredDays
    : WEEKDAY_DEFAULT_ORDER.slice(0, dayCount);
  const indexed = preferred.map((day, index) => ({
    index,
    weekday: weekdayIndex(day, index + 1)
  }));
  let best = [0, dayCount - 1];
  let bestScore = -1;
  for (let left = 0; left < indexed.length; left += 1) {
    for (let right = left + 1; right < indexed.length; right += 1) {
      const distance = cyclicDayDistance(indexed[left].weekday, indexed[right].weekday);
      const sessionSpread = right - left;
      const score = (distance * 10) + sessionSpread;
      if (score > bestScore) {
        bestScore = score;
        best = [indexed[left].index, indexed[right].index];
      }
    }
  }
  return best;
}

function chooseAerobicIndexes(dayCount, hardIndexes, target) {
  const blocked = new Set(hardIndexes);
  const candidates = Array.from({ length: dayCount }, (_, index) => index)
    .filter((index) => !blocked.has(index));
  const selected = [];
  while (selected.length < target && candidates.length) {
    const next = candidates.shift();
    selected.push(next);
    if (candidates.length > 1) candidates.push(candidates.shift());
  }
  return selected;
}

function militaryExerciseFamily(exercise) {
  const name = normalizeText(exercise?.name);
  if (exercise?.directCalf || /\bcalf\b/.test(name)) return 'calves';
  if (/\b(pulldown|pull-up|pull up|chin-up|chin up|rope climb)\b/.test(name)) return 'vertical_pull';
  if (/\brow\b/.test(name)) return 'row';
  if (/\b(bench press|chest press|push-up|push up)\b/.test(name)) return 'horizontal_press';
  if (/\b(squat|leg press|hack squat|lunge|split squat|step[- ]?up|leg extension|wall sit)\b/.test(name)) return 'knee_dominant';
  if (/\b(deadlift|romanian deadlift|\brdl\b|hip thrust|glute bridge|pull[- ]?through|leg curl|hamstring curl|back extension|hyperextension)\b/.test(name)) return 'posterior';
  if (/\b(lateral raise|rear delt|reverse fly|upright row|shoulder press|overhead press)\b/.test(name)) return 'shoulder_accessory';
  if (/\b(curl|preacher)\b/.test(name)) return 'biceps';
  if (/\b(triceps|pushdown|extension|skullcrusher)\b/.test(name)) return 'triceps';
  if (exercise?.directAb || /\b(plank|crunch|pallof|side bend|twist|leg raise)\b/.test(name)) return 'core';
  return '';
}

function polishMilitaryLifting(exercises, additions, profile) {
  const caps = {
    vertical_pull: 2,
    row: 2,
    horizontal_press: 2,
    knee_dominant: 2,
    posterior: 2,
    shoulder_accessory: Number.isFinite(profile?.priorityRanks?.Shoulders) ? 2 : 1,
    biceps: Number.isFinite(profile?.priorityRanks?.Arms) ? 1 : 1,
    triceps: Number.isFinite(profile?.priorityRanks?.Arms) ? 1 : 1,
    core: additions.some((exercise) => exercise?.militaryRole === 'Core endurance') ? 0 : 2,
    calves: Number(profile?.calfDailyCap || 1)
  };
  const counts = {};
  const seenNames = new Set();
  return (Array.isArray(exercises) ? exercises : []).filter((exercise) => {
    const name = normalizeText(exercise?.name);
    if (!name || seenNames.has(name)) return false;
    seenNames.add(name);
    const family = militaryExerciseFamily(exercise);
    if (!family || !Object.hasOwn(caps, family)) return true;
    counts[family] = Number(counts[family] || 0);
    if (counts[family] >= caps[family] && !isStrengthAnchor(exercise)) return false;
    counts[family] += 1;
    return true;
  });
}

function promoteWeeklyStrengthAnchor(week, user) {
  const days = Array.isArray(week?.days) ? week.days : [];
  const allExercises = days.flatMap((day) => Array.isArray(day?.exercises) ? day.exercises : []);
  if (allExercises.some(isStrengthAnchor)) return week;
  const weekType = String(week?.weekType || 'base');
  for (const day of days) {
    const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
    const candidateIndex = exercises.findIndex((exercise) => (
      String(exercise?.style || '') === 'Compound'
      && exercise?.taskType !== 'military_readiness'
    ));
    if (candidateIndex < 0) continue;
    const candidate = {
      ...exercises[candidateIndex],
      reps: weekType === 'intensification' ? '3-5' : weekType === 'deload' ? '6-8' : '4-6',
      restSec: Math.max(150, Number(exercises[candidateIndex]?.restSec || 0)),
      rir: String(user?.outputStyle || '') === 'Simple sets x reps' ? null : weekType === 'deload' ? '3-4' : '2-3',
      progressionRule: progressionRuleOverride('mh_promoted_strength')
    };
    const nextExercises = exercises.slice();
    nextExercises.splice(candidateIndex, 1, candidate);
    day.exercises = orderMilitaryDay(nextExercises);
    return week;
  }
  return week;
}

function isTrueHingeName(exercise) {
  const name = normalizeText(exercise?.name);
  return /\b(trap bar|hex bar|deadlift|rack pull|romanian deadlift|\brdl\b)\b/.test(name);
}

function trueHingePriority(exercise) {
  const name = normalizeText(exercise?.name);
  if (/\b(trap bar|hex bar|deadlift)\b/.test(name) && !/\bromanian\b/.test(name)) return 0;
  if (/\brack pull\b/.test(name)) return 1;
  if (/\bromanian deadlift|\brdl\b/.test(name)) return 2;
  return 9;
}

function normalizeAnchorExercise(exercise, weekType, { preferTrueHinge = false } = {}) {
  const next = { ...exercise };
  next.sets = Math.max(2, Math.min(4, Number(next?.sets || 3)));
  next.reps = weekType === 'intensification' ? '3-5' : weekType === 'deload' ? '6-8' : '4-6';
  next.restSec = Math.max(180, Number(next?.restSec || 0));
  next.rir = weekType === 'deload' ? '3-4' : '2-3';
  next.progressionRule = progressionRuleOverride('mh_promoted_strength');
  if (preferTrueHinge) next.slotId = 'mh_hinge_strength';
  return next;
}

function demoteAnchorExercise(exercise) {
  const next = { ...exercise };
  delete next.progressionRule;
  delete next.slotId;
  if (String(next?.reps || '').trim() === '4-6' || String(next?.reps || '').trim() === '3-5') {
    next.reps = '6-10';
  }
  next.restSec = Math.min(150, Math.max(90, Number(next?.restSec || 120)));
  next.rir = '2-4';
  return next;
}

function enforceTrueHingeAnchor(week, user) {
  const profile = user?.profile?.military;
  if (!week || !profile || profile.hingeBlocked || !hasEquipment(user, ['barbell', 'trap bar', 'hex bar', 'dumbbell'])) return week;
  const days = Array.isArray(week?.days) ? week.days : [];
  const weekType = String(week?.weekType || 'base');
  const preferredDays = days
    .filter((day) => ['Lower', 'FullBodyB', 'LowerFocus'].includes(String(day?.militaryBaseDayType || day?.dayType || '')))
    .sort((left, right) => {
      const rank = (day) => {
        const base = String(day?.militaryBaseDayType || day?.dayType || '');
        if (base === 'Lower') return 0;
        if (base === 'FullBodyB') return 1;
        if (base === 'LowerFocus') return 2;
        return 9;
      };
      return rank(left) - rank(right);
    });
  const fallbackDays = days.filter((day) => ['FullBodyA'].includes(String(day?.militaryBaseDayType || day?.dayType || '')));
  for (const day of [...preferredDays, ...fallbackDays]) {
    const baseDayType = String(day?.militaryBaseDayType || day?.dayType || '');
    const exercises = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
    const hingeIndex = exercises
      .map((exercise, index) => ({ exercise, index, priority: trueHingePriority(exercise) }))
      .filter((entry) => entry.priority < 9)
      .sort((a, b) => a.priority - b.priority || a.index - b.index)[0]?.index ?? -1;
    const anchorCandidate = safeTrueHingeAnchor(Number(week?.weekIndex || 1), user);
    let finalAnchorIndex = hingeIndex;
    if (hingeIndex < 0) {
      if (!['Lower', 'FullBodyB'].includes(baseDayType)) continue;
      const replaceIndex = exercises.findIndex((exercise) => (
        !exercise?.taskType
        && !isStrengthAnchor(exercise)
        && String(exercise?.style || '') !== 'Power'
        && String(exercise?.style || '') !== 'Plyo'
      ));
      if (replaceIndex >= 0) {
        exercises.splice(replaceIndex, 1, normalizeAnchorExercise(anchorCandidate, weekType, { preferTrueHinge: true }));
        finalAnchorIndex = replaceIndex;
      } else {
        exercises.unshift(normalizeAnchorExercise(anchorCandidate, weekType, { preferTrueHinge: true }));
        finalAnchorIndex = 0;
      }
    } else {
      const bestExisting = exercises[hingeIndex];
      const shouldUpgrade = trueHingePriority(bestExisting) > 0 && ['Lower', 'FullBodyB'].includes(baseDayType);
      exercises[hingeIndex] = normalizeAnchorExercise(
        shouldUpgrade ? anchorCandidate : bestExisting,
        weekType,
        { preferTrueHinge: true }
      );
      finalAnchorIndex = hingeIndex;
    }
    for (let i = 0; i < exercises.length; i += 1) {
      if (i === finalAnchorIndex) continue;
      if (!isStrengthAnchor(exercises[i])) continue;
      if (militaryExerciseFamily(exercises[i]) !== 'posterior') continue;
      exercises[i] = {
        ...exercises[i],
        reps: '6-10',
        restSec: Math.min(150, Math.max(90, Number(exercises[i]?.restSec || 120))),
        rir: '2-4'
      };
    }
    day.exercises = orderMilitaryDay(exercises);
    return week;
  }
  return week;
}

function enforceDayIdentityAnchors(week) {
  const days = Array.isArray(week?.days) ? week.days : [];
  const weekType = String(week?.weekType || 'base');
  for (const day of days) {
    const baseDayType = String(day?.militaryBaseDayType || day?.dayType || '');
    const exercises = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
    if (!exercises.length) continue;
    if (['Pull', 'UpperFocus', 'DeltsArms'].includes(baseDayType)) continue;

    const currentAnchorIndex = exercises.findIndex(isStrengthAnchor);
    const currentAnchor = currentAnchorIndex >= 0 ? exercises[currentAnchorIndex] : null;
    const currentFamily = currentAnchor ? militaryExerciseFamily(currentAnchor) : '';
    let candidateIndex = -1;
    let shouldReplaceExistingAnchor = currentAnchorIndex < 0;
    if (['Lower', 'FullBodyB'].includes(baseDayType)) {
      candidateIndex = exercises.findIndex(isTrueHingeName);
      if (candidateIndex >= 0) {
        shouldReplaceExistingAnchor = !currentAnchor || !isTrueHingeName(currentAnchor);
      }
      if (candidateIndex < 0) {
        candidateIndex = exercises.findIndex((exercise) => (
          militaryExerciseFamily(exercise) === 'posterior' || militaryExerciseFamily(exercise) === 'knee_dominant'
        ));
        shouldReplaceExistingAnchor = !currentAnchor || !['posterior', 'knee_dominant'].includes(currentFamily);
      }
    } else if (baseDayType === 'LowerFocus') {
      continue;
    } else {
      candidateIndex = exercises.findIndex((exercise) => militaryExerciseFamily(exercise) === 'horizontal_press');
      if (candidateIndex >= 0) {
        shouldReplaceExistingAnchor = !currentAnchor || currentFamily !== 'horizontal_press';
      }
      if (candidateIndex < 0) {
        candidateIndex = exercises.findIndex((exercise) => (
          String(exercise?.style || '') === 'Compound' && !exercise?.taskType
        ));
        shouldReplaceExistingAnchor = currentAnchorIndex < 0;
      }
    }
    if (candidateIndex < 0) continue;
    if (!shouldReplaceExistingAnchor) continue;
    if (currentAnchorIndex >= 0 && currentAnchorIndex !== candidateIndex) {
      exercises[currentAnchorIndex] = demoteAnchorExercise(exercises[currentAnchorIndex]);
    }
    exercises[candidateIndex] = normalizeAnchorExercise(exercises[candidateIndex], weekType, {
      preferTrueHinge: isTrueHingeName(exercises[candidateIndex])
    });
    day.exercises = orderMilitaryDay(exercises);
  }
  return week;
}

function militaryCoreSubtype(exercise) {
  const name = normalizeText(exercise?.name);
  if (/\bpallof\b/.test(name)) return 'anti_rotation';
  if (/\bplank\b/.test(name)) return 'bracing';
  if (/\bcrunch|leg raise\b/.test(name)) return 'flexion';
  if (/\boblique|twist|side bend\b/.test(name)) return 'rotation';
  return 'other';
}

function isMilitaryHardConditioningTask(exercise) {
  return exercise?.taskType === 'military_readiness' && exercise?.hardConditioning;
}

function rebalanceConditioningDays(week) {
  const days = Array.isArray(week?.days) ? week.days : [];
  for (const day of days) {
    const baseDayType = String(day?.militaryBaseDayType || day?.dayType || '');
    const exercises = Array.isArray(day?.exercises) ? day.exercises.slice() : [];
    if (!exercises.length) continue;

    const hasIntervals = exercises.some((exercise) => exercise?.militaryRole === 'Running speed endurance');
    const hasCarryCircuit = exercises.some((exercise) => exercise?.militaryRole === 'Sprint-drag-carry qualities');
    if (!hasIntervals && !hasCarryCircuit) continue;

    const next = [];
    let keptRow = false;
    let keptPosterior = false;
    let keptArms = 0;
    let keptShoulders = 0;
    for (const exercise of exercises) {
      if (exercise?.taskType) {
        next.push(exercise);
        continue;
      }
      const family = militaryExerciseFamily(exercise);
      if (hasIntervals && family === 'posterior' && ['FullBodyA', 'Upper'].includes(baseDayType)) {
        if (next.some((entry) => militaryExerciseFamily(entry) === 'horizontal_press')) continue;
      }
      if (family === 'row') {
        if (keptRow) continue;
        keptRow = true;
      }
      if (hasCarryCircuit && family === 'posterior') {
        if (keptPosterior && !isStrengthAnchor(exercise)) continue;
        keptPosterior = true;
      }
      if (family === 'shoulder_accessory') {
        if (keptShoulders >= 1 && !exercise?.militaryIdentityKeep) continue;
        keptShoulders += 1;
      }
      if (family === 'biceps' || family === 'triceps') {
        if (keptArms >= 2 && !exercise?.militaryIdentityKeep) continue;
        keptArms += 1;
      }
      next.push(exercise);
    }
    day.exercises = orderMilitaryDay(next);
  }
  return week;
}

function pruneWeeklyAccessorySpam(week, user) {
  const profile = user?.profile?.military;
  const days = Array.isArray(week?.days) ? week.days : [];
  if (!profile || !days.length) return week;

  const calfDays = [];
  days.forEach((day, dayIndex) => {
    (Array.isArray(day?.exercises) ? day.exercises : []).forEach((exercise, exerciseIndex) => {
      if (militaryExerciseFamily(exercise) === 'calves') {
        calfDays.push({ day, dayIndex, exerciseIndex, baseDayType: String(day?.militaryBaseDayType || day?.dayType || '') });
      }
    });
  });

  if (calfDays.length > Number(profile.calfWeeklyExposureCap || 1)) {
    const keepPreferred = new Set(
      calfDays
        .slice()
        .sort((a, b) => {
          const aLower = /Lower/.test(a.baseDayType) ? 0 : 1;
          const bLower = /Lower/.test(b.baseDayType) ? 0 : 1;
          return aLower - bLower || a.dayIndex - b.dayIndex;
        })
        .slice(0, Number(profile.calfWeeklyExposureCap || 1))
        .map((entry) => `${entry.dayIndex}:${entry.exerciseIndex}`)
    );

    days.forEach((day, dayIndex) => {
      day.exercises = (Array.isArray(day?.exercises) ? day.exercises : []).filter((exercise, exerciseIndex) => {
        if (militaryExerciseFamily(exercise) !== 'calves') return true;
        return keepPreferred.has(`${dayIndex}:${exerciseIndex}`);
      });
    });
  }

  const seenRows = new Set();
  const seenCoreSubtypes = new Set();
  days.forEach((day) => {
    day.exercises = (Array.isArray(day?.exercises) ? day.exercises : []).filter((exercise) => {
      const family = militaryExerciseFamily(exercise);
      if (family === 'row') {
        const nameKey = normalizeText(exercise?.name);
        if (seenRows.has(nameKey) && !isStrengthAnchor(exercise)) return false;
        seenRows.add(nameKey);
      }
      if (family === 'core') {
        const subtype = militaryCoreSubtype(exercise);
        if (subtype === 'anti_rotation') {
          if (seenCoreSubtypes.has(subtype) && !exercise?.militaryIdentityKeep) return false;
          seenCoreSubtypes.add(subtype);
        }
      }
      return true;
    });
  });

  return week;
}

function buildWeeklyTaskAssignments(user, weekIndex, days) {
  const profile = user?.profile?.military;
  const safeDays = Array.isArray(days) ? days : [];
  const dayCount = safeDays.length;
  const assignments = Array.from({ length: dayCount }, () => []);
  const add = (index, item) => {
    if (!item || index < 0 || index >= assignments.length) return;
    assignments[index].push(item);
  };
  const findBase = (baseDayType) => safeDays.findIndex((day) => String(day?.dayType || '') === baseDayType);

  if (dayCount === 5) {
    add(findBase('Upper') >= 0 ? findBase('Upper') : 0, powerTask(user, weekIndex));
    add(findBase('LowerFocus') >= 0 ? findBase('LowerFocus') : 1, zone2Task(user, weekIndex, 1));
    add(findBase('LowerFocus') >= 0 ? findBase('LowerFocus') : 1, plankTask(weekIndex));
    add(findBase('Pull') >= 0 ? findBase('Pull') : 2, pushupTask(user, weekIndex));
    add(findBase('FullBodyA') >= 0 ? findBase('FullBodyA') : 3, intervalTask(user, weekIndex));
    if (profile.hardConditioningCap >= 2) add(findBase('Lower') >= 0 ? findBase('Lower') : 4, workCapacityTask(user, weekIndex));
  } else if (dayCount === 4) {
    add(findBase('Upper') >= 0 ? findBase('Upper') : 0, powerTask(user, weekIndex));
    if (profile.hardConditioningCap >= 1) add(findBase('Upper') >= 0 ? findBase('Upper') : 0, intervalTask(user, weekIndex));
    add(findBase('LowerFocus') >= 0 ? findBase('LowerFocus') : 1, zone2Task(user, weekIndex, 1));
    add(findBase('LowerFocus') >= 0 ? findBase('LowerFocus') : 1, plankTask(weekIndex));
    add(findBase('UpperFocus') >= 0 ? findBase('UpperFocus') : 2, pushupTask(user, weekIndex));
    if (profile.hardConditioningCap >= 2) add(findBase('Lower') >= 0 ? findBase('Lower') : 3, workCapacityTask(user, weekIndex));
  } else {
    const hardIndexes = chooseHardConditioningIndexes(user, dayCount, profile.hardConditioningCap);
    const aerobicIndexes = chooseAerobicIndexes(dayCount, hardIndexes, profile.zone2Target);
    add(0, powerTask(user, weekIndex));
    if (dayCount >= 2) add(aerobicIndexes[0] ?? dayCount - 1, zone2Task(user, weekIndex, 1));
    if (dayCount >= 3) add(1, plankTask(weekIndex));
    if (dayCount >= 3) add(Math.min(dayCount - 1, 2), pushupTask(user, weekIndex));
    if (profile.hardConditioningCap >= 1) add(hardIndexes[0] ?? 0, intervalTask(user, weekIndex));
    if (profile.hardConditioningCap >= 2 && dayCount >= 4) add(hardIndexes[1] ?? dayCount - 1, workCapacityTask(user, weekIndex));
    if (profile.zone2Target >= 2 && dayCount >= 6) add(aerobicIndexes[1] ?? Math.max(0, dayCount - 2), zone2Task(user, weekIndex, 2));
  }

  if (String(user?.sessionLengthMin || '') === '30') {
    return assignments.map((items) => items.slice(0, 2));
  }
  if (String(user?.sessionLengthMin || '') === '45') {
    return assignments.map((items) => items.slice(0, 2));
  }
  return assignments;
}

function militaryDayLabel(baseDayType, exercises, fallback) {
  const list = Array.isArray(exercises) ? exercises : [];
  const base = String(baseDayType || fallback || '').trim();
  if (base === 'Upper' && list.some((exercise) => exercise?.militaryRole === 'Explosive power')) return 'Strength + Armor';
  if (base === 'LowerFocus' && list.some((exercise) => exercise?.militaryRole === 'Aerobic base')) return 'Zone 2 + Durability';
  if (base === 'Pull' && list.some((exercise) => exercise?.militaryRole === 'Bodyweight endurance')) return 'Upper + Push-Up Endurance';
  if (base === 'UpperFocus' && list.some((exercise) => exercise?.militaryRole === 'Bodyweight endurance')) return 'Upper + Push-Up Endurance';
  if (base === 'FullBodyA' && list.some((exercise) => exercise?.militaryRole === 'Running speed endurance')) return 'Intervals / SDC';
  if (base === 'FullBodyA' && list.some((exercise) => exercise?.militaryRole === 'Sprint-drag-carry qualities')) return 'Intervals / SDC';
  if (base === 'Lower' && list.some((exercise) => exercise?.militaryRole === 'Sprint-drag-carry qualities')) return 'Lower + Carry';
  if (list.some((exercise) => exercise?.militaryRole === 'Sprint-drag-carry qualities')) return 'Work Capacity';
  if (list.some((exercise) => exercise?.militaryRole === 'Running speed endurance')) return 'Intervals / SDC';
  if (list.some((exercise) => exercise?.militaryRole === 'Aerobic base')) return 'Zone 2 + Durability';
  if (list.some((exercise) => exercise?.militaryRole === 'Bodyweight endurance')) return 'Upper + Push-Up Endurance';
  if (list.some((exercise) => exercise?.militaryRole === 'Explosive power')) return 'Strength + Armor';
  return String(fallback || 'Military Hybrid');
}

function finalizeMilitaryPlan(plan, user) {
  if (!plan || plan.error || String(user?.discipline || '') !== 'military') return plan;
  const profile = user?.profile?.military;
  const weeks = (Array.isArray(plan?.weeks) ? plan.weeks : []).map((week, weekArrayIndex) => {
    const days = Array.isArray(week?.days) ? week.days : [];
    const assignments = buildWeeklyTaskAssignments(user, Number(week?.weekIndex || weekArrayIndex + 1), days);
    const nextWeek = {
      ...week,
      days: days.map((day, dayIndex) => {
        const additions = (assignments[dayIndex] || []).slice();
        const baseDayType = String(day?.dayType || '');
        const currentExercises = Array.isArray(day?.exercises) ? day.exercises : [];
        const hasPosteriorCoverage = currentExercises.some((exercise) => (
          /\b(deadlift|romanian deadlift|\brdl\b|hip thrust|glute bridge|leg curl|hamstring curl|pull[- ]?through|back extension|hyperextension)\b/i
            .test(String(exercise?.name || ''))
        ));
        const hasKneeDominantCoverage = currentExercises.some((exercise) => (
          /\b(squat|leg press|hack squat|lunge|split squat|step[- ]?up|leg extension|wall sit)\b/i
            .test(String(exercise?.name || ''))
        ));
        if (['Lower', 'LowerFocus', 'FullBodyB'].includes(baseDayType) && !hasPosteriorCoverage) {
          additions.unshift(safePosteriorAccessory(Number(week?.weekIndex || weekArrayIndex + 1)));
        }
        if (
          ['Lower', 'LowerFocus', 'FullBodyB'].includes(baseDayType)
          && !hasKneeDominantCoverage
        ) {
          additions.unshift(safeKneeDominantAccessory(Number(week?.weekIndex || weekArrayIndex + 1), profile));
        }
        const identityProtectedLifting = preserveMilitaryDayIdentityLift(currentExercises, baseDayType);
        const polishedLifting = polishMilitaryLifting(identityProtectedLifting, additions, profile);
        const lifting = trimForSession(polishedLifting, additions, user).map((exercise) => {
          if (String(exercise?.style || '') !== 'Isolation') return exercise;
          return {
            ...exercise,
            sets: Math.max(1, Math.min(3, Math.round(Number(exercise?.sets || 2) * profile.accessoryMultiplier)))
          };
        });
        const combined = ensureMilitaryUpperPressPresence(
          orderMilitaryDay([...lifting, ...additions]),
          baseDayType,
          Number(week?.weekIndex || weekArrayIndex + 1),
          user
        );
        return {
          ...day,
          dayType: militaryDayLabel(baseDayType, combined, day?.dayType),
          militaryBaseDayType: day?.dayType,
          exercises: combined
        };
      })
    };
    return pruneWeeklyAccessorySpam(
      rebalanceConditioningDays(
        enforceDayIdentityAnchors(
          enforceTrueHingeAnchor(
            promoteWeeklyStrengthAnchor(nextWeek, user),
            user
          )
        )
      ),
      user
    );
  });
  const schedule = weeks[0]?.days?.map((day, index) => ({
    day: plan?.schedule?.[index]?.day || user?.preferredDays?.[index] || WEEKDAY_DEFAULT_ORDER[index],
    dayType: day?.dayType || 'Military Hybrid'
  })) || plan?.schedule || [];
  return {
    ...plan,
    discipline: 'military',
    trainingFeel: 'Military Hybrid',
    meta: {
      ...(plan.meta || {}),
      discipline: 'military',
      trainingFeel: 'Military Hybrid',
      sessionCap: profile.maxTasksPerSession,
      militaryHybrid: {
        identity: 'ACFT-style readiness, strength, running, work capacity, bodyweight endurance, power, and targeted hypertrophy',
        recoveryTier: profile.recoveryTier,
        hardConditioningCap: profile.hardConditioningCap,
        hardConditioningDays: chooseHardConditioningIndexes(user, Number(user?.daysPerWeek || schedule.length), profile.hardConditioningCap)
          .map((index) => schedule[index]?.day || user?.preferredDays?.[index] || WEEKDAY_DEFAULT_ORDER[index]),
        zone2Target: profile.zone2Target,
        runningBlocked: profile.runningBlocked,
        impactRestricted: profile.impactRestricted,
        hingeBlocked: profile.hingeBlocked
      }
    },
    schedule,
    weeks
  };
}

function validateMilitaryPlan(plan) {
  if (String(plan?.meta?.discipline || '') !== 'military') throw new Error('Military validator received non-military plan.');
  const weeks = Array.isArray(plan?.weeks) ? plan.weeks : [];
  if (!weeks.length) throw new Error('Military plan must include weeks.');
  for (const week of weeks) {
    const days = Array.isArray(week?.days) ? week.days : [];
    if (!days.length) throw new Error('Military week must include training days.');
    const exercises = days.flatMap((day) => Array.isArray(day?.exercises) ? day.exercises : []);
    const anchors = exercises.filter(isStrengthAnchor);
    const conditioning = exercises.filter((exercise) => exercise?.taskType === 'military_readiness');
    const zone2 = conditioning.filter((exercise) => exercise?.zone2);
    const hardConditioning = conditioning.filter((exercise) => exercise?.hardConditioning);
    const accessories = exercises.filter(isHypertrophySupport);
    if (!anchors.length) throw new Error('Military week missing a strength anchor.');
    if (!conditioning.length) throw new Error('Military week missing readiness conditioning.');
    if (!zone2.length) throw new Error('Military week missing aerobic base work.');
    if (hardConditioning.length > Number(plan?.meta?.militaryHybrid?.hardConditioningCap || 2)) {
      throw new Error('Military week exceeds high-intensity conditioning cap.');
    }
    if (!accessories.length) throw new Error('Military week missing hypertrophy support.');
    for (const day of days) {
      if ((day?.exercises || []).length > Number(plan?.meta?.sessionCap || 6)) {
        throw new Error(`Military day exceeds session cap: ${day?.dayType || 'day'}.`);
      }
    }
  }
  return true;
}

module.exports = {
  buildMilitaryProfile,
  buildMilitarySplit,
  applyMilitaryBlueprint,
  repOverride,
  rirOverride,
  progressionRuleOverride,
  finalizeMilitaryPlan,
  validateMilitaryPlan,
  isStrengthAnchor
};
