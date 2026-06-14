const WEEKDAY_DEFAULT_ORDER = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeList(values) {
  return Array.isArray(values) ? values.map((value) => String(value || '').trim()) : [];
}

function hasToken(values, token) {
  const wanted = normalizeText(token);
  return normalizeList(values).some((value) => normalizeText(value) === wanted);
}

function hasAnyToken(values, tokens) {
  return tokens.some((token) => hasToken(values, token));
}

function painSeverity(user, key) {
  return Math.max(0, Number(user?.injuryMap?.[key] || 0));
}

function hasAnyEquipment(user, tokens) {
  const allowed = new Set((Array.isArray(user?.allowedEquipment) ? user.allowedEquipment : []).map((value) => normalizeText(value)));
  return tokens.some((token) => allowed.has(normalizeText(token)));
}

function hasMovementData(value, weight, reps) {
  return Number(value) > 0 || (Number(weight) > 0 && Number(reps) > 0);
}

function rankScore(rank, weights) {
  if (rank === 1) return weights[0];
  if (rank === 2) return weights[1];
  if (rank === 3) return weights[2];
  return 0;
}

function canonicalPriority(value) {
  const key = normalizeText(value);
  if (key === 'chest') return 'Chest';
  if (key === 'back') return 'Back';
  if (key === 'shoulders' || key === 'shoulder') return 'Shoulders';
  if (key === 'arms' || key === 'arm') return 'Arms';
  if (key === 'legs' || key === 'quads' || key === 'quadriceps') return 'Legs';
  if (key === 'glutes' || key === 'hamstrings/glutes' || key === 'hamstrings & glutes' || key === 'hamstrings and glutes') return 'Glutes';
  if (key === 'calves' || key === 'calf') return 'Calves';
  if (key === 'core' || key === 'abs') return 'Core';
  return String(value || '').trim();
}

function buildPriorityRanks(priorityGroups) {
  const out = {};
  normalizeList(priorityGroups).slice(0, 3).forEach((entry, index) => {
    const canonical = canonicalPriority(entry);
    if (canonical && !out[canonical]) out[canonical] = index + 1;
  });
  return out;
}

function inferStrengthEmphasis(user) {
  const ranks = buildPriorityRanks(user?.priorityGroups);
  const focus = String(user?.focus || '');
  const avoid = new Set(normalizeList(user?.movementsToAvoid).map((value) => normalizeText(value)));
  const benchPain = Math.max(painSeverity(user, 'shoulder'), painSeverity(user, 'elbow'), painSeverity(user, 'wrist'));
  const squatPain = Math.max(painSeverity(user, 'knee'), painSeverity(user, 'hip'), painSeverity(user, 'back'));
  const hingePain = Math.max(painSeverity(user, 'back'), painSeverity(user, 'hip'));
  const benchScore = 0
    + (focus === 'Strength' ? 3 : focus === 'Size' ? 1 : 0)
    + rankScore(ranks.Chest, [5, 3, 2])
    + rankScore(ranks.Shoulders, [2, 1, 1])
    + rankScore(ranks.Arms, [2, 1, 1])
    + (hasMovementData(user?.bench, user?.benchWeight, user?.benchReps) ? 3 : 0)
    + (String(user?.benchVariation || '').trim() ? 2 : 0)
    - (avoid.has('bench press') || avoid.has('bench') ? 7 : 0)
    - (benchPain >= 8 ? 7 : benchPain >= 6 ? 4 : benchPain >= 4 ? 2 : 0)
    - (hasAnyEquipment(user, ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight']) ? 0 : 8);
  const squatScore = 0
    + (focus === 'Strength' ? 3 : focus === 'Size' ? 1 : 0)
    + rankScore(ranks.Legs, [5, 3, 2])
    + (hasMovementData(user?.squat, user?.lowerWeight, user?.lowerReps) ? 3 : 0)
    + (String(user?.lowerMovement || '').trim() ? 2 : 0)
    - (avoid.has('squat') ? 7 : 0)
    - (squatPain >= 8 ? 7 : squatPain >= 6 ? 4 : squatPain >= 4 ? 2 : 0)
    - (hasAnyEquipment(user, ['barbell', 'dumbbell', 'machine', 'bodyweight']) ? 0 : 8);
  const hingeScore = 0
    + (focus === 'Strength' ? 3 : focus === 'Size' ? 1 : 0)
    + rankScore(ranks.Back, [3, 2, 1])
    + rankScore(ranks.Glutes, [5, 3, 2])
    + (hasMovementData(user?.deadlift, user?.hingeWeight, user?.hingeReps) ? 3 : 0)
    + (String(user?.hingeMovement || '').trim() ? 2 : 0)
    - (avoid.has('deadlift') ? 7 : 0)
    - (hingePain >= 8 ? 7 : hingePain >= 6 ? 4 : hingePain >= 4 ? 2 : 0)
    - (hasAnyEquipment(user, ['barbell', 'dumbbell', 'machine', 'bodyweight']) ? 0 : 8);
  const scores = { bench: benchScore, squat: squatScore, hinge: hingeScore };
  const ordered = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topKey, topScore] = ordered[0];
  const runnerUp = ordered[1]?.[1] ?? -99;
  const emphasis = topScore >= 4 && topScore - runnerUp >= 2 ? topKey : 'balanced';
  return { emphasis, scores };
}

function buildRecoveryTier(user) {
  const sleep = Number(user?.sleepHours || 0);
  const stress = normalizeText(user?.stress);
  const deficit = String(user?.phase || '') === 'deficit';
  const maxPain = Math.max(
    painSeverity(user, 'shoulder'),
    painSeverity(user, 'elbow'),
    painSeverity(user, 'wrist'),
    painSeverity(user, 'back'),
    painSeverity(user, 'knee'),
    painSeverity(user, 'hip')
  );
  if (sleep < 6 || stress === 'high' || maxPain >= 7 || (deficit && sleep < 7)) return 'low';
  if (sleep >= 8 && stress === 'low' && !deficit && maxPain <= 3) return 'high';
  return 'normal';
}

function buildAccessoryMultiplier(user, recoveryTier) {
  let mult = 1;
  if (String(user?.sessionLengthMin || '') === '30') mult -= 0.25;
  else if (String(user?.sessionLengthMin || '') === '45') mult -= 0.1;
  if (String(user?.phase || '') === 'deficit') mult -= 0.1;
  if (recoveryTier === 'low') mult -= 0.2;
  else if (recoveryTier === 'high') mult += 0.05;
  return Math.max(0.5, Math.min(1.05, mult));
}

function buildPowerbuildingProfile(user) {
  if (String(user?.discipline || '') !== 'powerbuilding') return null;
  const { emphasis, scores } = inferStrengthEmphasis(user);
  const recoveryTier = buildRecoveryTier(user);
  const ranks = buildPriorityRanks(user?.priorityGroups);
  return {
    emphasis,
    scores,
    recoveryTier,
    accessoryMultiplier: buildAccessoryMultiplier(user, recoveryTier),
    maxAxialSlotsPerLowerDay: recoveryTier === 'low' ? 1 : 2,
    avoidBenchPattern: hasAnyToken(user?.movementsToAvoid, ['bench press', 'bench', 'flat bench']),
    avoidDeadliftPattern: hasAnyToken(user?.movementsToAvoid, ['deadlift', 'barbell hinge']),
    avoidSquatPattern: hasAnyToken(user?.movementsToAvoid, ['squat', 'deep squat']),
    avoidVerticalPress: painSeverity(user, 'shoulder') >= 6 || emphasis === 'bench',
    avoidAggressiveTriceps: painSeverity(user, 'elbow') >= 5 || painSeverity(user, 'wrist') >= 5,
    preferSupportedBackWork: painSeverity(user, 'back') >= 5,
    preserveCalves: Number.isFinite(ranks.Calves),
    preserveCore: Number.isFinite(ranks.Core),
    priorityRanks: ranks
  };
}

function isStrengthFocus(user) {
  return String(user?.focus || '') === 'Strength';
}

function isSizeFocus(user) {
  return String(user?.focus || '') === 'Size';
}

function isAestheticFocus(user) {
  return String(user?.focus || '') === 'Aesthetic';
}

function isBeginnerPowerbuilding(user) {
  return String(user?.experience || '') === '<6m' || String(user?.profile?.complexity || '') === 'low';
}

function isTightPowerbuildingSession(user) {
  return String(user?.sessionLengthMin || '') === '30' || String(user?.profile?.sessionBandwidth || '') === 'tight';
}

function isStrengthAnchorExercise(exercise) {
  const progression = String(exercise?.progressionRule || '');
  const reps = String(exercise?.reps || '');
  return String(exercise?.slotId || '').startsWith('pb_')
    || (/rep-first progression/i.test(progression) && /3-5|4-6|5-8/.test(reps));
}

function isCompound(exercise) {
  return String(exercise?.style || '') === 'Compound';
}

function isCoreExercise(exercise) {
  return Boolean(exercise?.directAb) || String(exercise?.muscleTarget || exercise?.primary || '') === 'Core';
}

function isCalfExercise(exercise) {
  return Boolean(exercise?.directCalf) || /calf/i.test(String(exercise?.sub || ''));
}

function isArmExercise(exercise) {
  return String(exercise?.muscleTarget || exercise?.primary || '') === 'Arms' || String(exercise?.directArmType || 'none') !== 'none';
}

function isShoulderAccessory(exercise) {
  return String(exercise?.muscleTarget || exercise?.primary || '') === 'Shoulders'
    || Boolean(exercise?.lateralDeltPattern)
    || Boolean(exercise?.rearDeltPattern);
}

function isPressingCompound(exercise) {
  return isCompound(exercise) && ['HorizontalPush', 'VerticalPush'].includes(String(exercise?.pattern || ''));
}

function isPullCompound(exercise) {
  return isCompound(exercise) && ['HorizontalPull', 'VerticalPull'].includes(String(exercise?.pattern || ''));
}

function isSquatPattern(exercise) {
  const name = normalizeText(exercise?.name);
  return String(exercise?.pattern || '') === 'Squat'
    || /\b(squat|leg press|hack squat|split squat|lunge|step up)\b/.test(name);
}

function isPosteriorPattern(exercise) {
  const name = normalizeText(exercise?.name);
  return String(exercise?.pattern || '') === 'Hinge'
    || /\b(deadlift|romanian deadlift|\brdl\b|hip thrust|glute bridge|pull[- ]?through|leg curl|hamstring curl|glute ham raise|back extension|hyperextension)\b/.test(name);
}

function isTrueHingePattern(exercise) {
  const name = normalizeText(exercise?.name);
  return String(exercise?.pattern || '') === 'Hinge'
    || /\b(deadlift|romanian deadlift|\brdl\b|hip thrust|glute bridge|pull[- ]?through|back extension|hyperextension)\b/.test(name);
}

function movementCapForDay(dayType, user, pb) {
  const type = String(dayType || '');
  const sessionCap = Number(user?.sessionCap || 6);
  let cap = sessionCap;
  if (isTightPowerbuildingSession(user)) cap = Math.min(cap, ['Lower', 'LowerFocus', 'Legs', 'FullBodyA', 'FullBodyB'].includes(type) ? 4 : 3);
  else if (isBeginnerPowerbuilding(user)) cap = Math.min(cap, ['FullBodyA', 'FullBodyB', 'LowerFocus'].includes(type) ? 4 : 5);
  if (isStrengthFocus(user)) cap -= 1;
  if (pb?.recoveryTier === 'low') cap -= 1;
  if (isSizeFocus(user) && !isTightPowerbuildingSession(user) && pb?.recoveryTier !== 'low') cap += 0;
  if (isAestheticFocus(user) && ['Upper', 'UpperFocus', 'Pull', 'Push', 'DeltsArms'].includes(type) && String(user?.sessionLengthMin || '') === '75+') cap += 0;
  return Math.max(3, Math.min(sessionCap, cap));
}

function priorityRankForExercise(exercise, pb) {
  const key = canonicalPriority(exercise?.muscleTarget || exercise?.primary || '');
  return Number(pb?.priorityRanks?.[key] || 99);
}

function exerciseKeepScore(exercise, index, dayType, user, pb) {
  let score = 0;
  const rank = priorityRankForExercise(exercise, pb);
  if (isStrengthAnchorExercise(exercise)) score += 1000;
  else if (isCompound(exercise)) score += 150;
  else score += 70;
  if (rank === 1) score += 120;
  else if (rank === 2) score += 80;
  else if (rank === 3) score += 45;
  if (isCoreExercise(exercise) && pb?.preserveCore) score += 45;
  if (isCalfExercise(exercise) && pb?.preserveCalves) score += 45;
  if (isStrengthFocus(user) && !isStrengthAnchorExercise(exercise) && !isCompound(exercise)) score -= 18;
  if (isSizeFocus(user) && !isCompound(exercise) && rank <= 3) score += 22;
  if (isAestheticFocus(user) && (isShoulderAccessory(exercise) || isArmExercise(exercise))) score += 20;
  if (rank === 1 && !isStrengthAnchorExercise(exercise)) score += 10;
  if (pb?.avoidVerticalPress && Boolean(exercise?.shoulderPressPattern)) score -= 35;
  if (pb?.avoidAggressiveTriceps && String(exercise?.directArmType || '') === 'triceps') score -= 18;
  if (pb?.preferSupportedBackWork && Boolean(exercise?.axialLoadHigh) && isCompound(exercise)) score -= 25;
  if (canonicalPriority(exercise?.muscleTarget || exercise?.primary || '') === 'Shoulders' && Boolean(exercise?.shoulderPressPattern)) score -= 12;
  if (isShoulderAccessory(exercise) && (Boolean(exercise?.lateralDeltPattern) || Boolean(exercise?.rearDeltPattern))) score += 18;
  if (canonicalPriority(exercise?.muscleTarget || exercise?.primary || '') === 'Chest' && isPressingCompound(exercise) && !isStrengthAnchorExercise(exercise) && !isStrengthFocus(user)) score -= 10;
  if (canonicalPriority(exercise?.muscleTarget || exercise?.primary || '') === 'Glutes' && Boolean(exercise?.axialLoadHigh) && pb?.recoveryTier === 'low') score -= 20;
  score -= Math.min(index, 6);
  if (String(dayType || '') === 'Push' && isPullCompound(exercise)) score -= 12;
  if (String(dayType || '') === 'Pull' && isPressingCompound(exercise)) score -= 12;
  return score;
}

function pushUniqueIndex(target, index, usedIndexes) {
  if (index < 0 || usedIndexes.has(index)) return;
  usedIndexes.add(index);
  target.push(index);
}

function selectPowerbuildingExerciseIndexes(exercises, dayType, user, pb, cap) {
  const type = String(dayType || '');
  const used = new Set();
  const selected = [];
  const anchorIndex = exercises.findIndex((exercise) => isStrengthAnchorExercise(exercise));
  if (anchorIndex >= 0) pushUniqueIndex(selected, anchorIndex, used);
  else pushUniqueIndex(selected, exercises.findIndex((exercise) => isCompound(exercise)), used);

  if (['FullBodyA', 'Upper', 'UpperFocus'].includes(type)) {
    pushUniqueIndex(selected, exercises.findIndex((exercise, index) => !used.has(index) && isPullCompound(exercise)), used);
    pushUniqueIndex(selected, exercises.findIndex((exercise, index) => !used.has(index) && isSquatPattern(exercise)), used);
  }
  if (['FullBodyB', 'Lower', 'LowerFocus', 'Legs'].includes(type)) {
    pushUniqueIndex(selected, exercises.findIndex((exercise, index) => !used.has(index) && isSquatPattern(exercise)), used);
    pushUniqueIndex(selected, exercises.findIndex((exercise, index) => !used.has(index) && isTrueHingePattern(exercise)), used);
    pushUniqueIndex(selected, exercises.findIndex((exercise, index) => !used.has(index) && isPosteriorPattern(exercise)), used);
  }
  if (type === 'Pull') {
    pushUniqueIndex(selected, exercises.findIndex((exercise, index) => !used.has(index) && isArmExercise(exercise)), used);
  }
  if (type === 'Push') {
    pushUniqueIndex(selected, exercises.findIndex((exercise, index) => !used.has(index) && canonicalPriority(exercise?.muscleTarget || exercise?.primary || '') === 'Chest' && !isStrengthAnchorExercise(exercise)), used);
  }

  const ranked = exercises
    .map((exercise, index) => ({ index, score: exerciseKeepScore(exercise, index, dayType, user, pb) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  for (const entry of ranked) {
    if (selected.length >= cap) break;
    const exercise = exercises[entry.index];
    if (used.has(entry.index)) continue;
    if (isBeginnerPowerbuilding(user) && selected.some((idx) => isStrengthAnchorExercise(exercises[idx])) && isStrengthAnchorExercise(exercise)) continue;
    pushUniqueIndex(selected, entry.index, used);
  }

  if (pb?.preserveCore && selected.length < cap) {
    pushUniqueIndex(selected, exercises.findIndex((exercise, index) => !used.has(index) && isCoreExercise(exercise)), used);
  }
  if (pb?.preserveCalves && selected.length < cap) {
    pushUniqueIndex(selected, exercises.findIndex((exercise, index) => !used.has(index) && isCalfExercise(exercise)), used);
  }

  const selectedExercises = selected.map((index) => exercises[index]).filter(Boolean);
  const hasIsolationAccessory = selectedExercises.some((exercise) => !isCompound(exercise));
  if (!hasIsolationAccessory) {
    const accessoryIndex = exercises.findIndex((exercise, index) => !used.has(index) && !isCompound(exercise));
    if (accessoryIndex >= 0) {
      if (selected.length < cap) {
        pushUniqueIndex(selected, accessoryIndex, used);
      } else {
        const replaceAt = selected
          .map((index, selectedIndex) => ({ index, selectedIndex, score: exerciseKeepScore(exercises[index], index, dayType, user, pb) }))
          .filter((entry) => !isStrengthAnchorExercise(exercises[entry.index]) && (!['FullBodyB', 'Lower', 'LowerFocus', 'Legs'].includes(type) || !isSquatPattern(exercises[entry.index]) || selectedExercises.some((exercise, exerciseIndex) => exerciseIndex !== entry.selectedIndex && isSquatPattern(exercise))))
          .sort((a, b) => a.score - b.score)[0];
        if (replaceAt) selected[replaceAt.selectedIndex] = accessoryIndex;
      }
    }
  }

  const shouldProtectTrueHinge = ['FullBodyB', 'Lower', 'LowerFocus', 'Legs'].includes(type)
    && Number(user?.daysPerWeek || 0) >= 4
    && !pb?.avoidDeadliftPattern
    && Math.max(painSeverity(user, 'back'), painSeverity(user, 'hip')) < 6;
  if (shouldProtectTrueHinge) {
    const hasSelectedTrueHinge = selected.some((index) => isTrueHingePattern(exercises[index]));
    const trueHingeIndex = exercises.findIndex((exercise, index) => !used.has(index) && isTrueHingePattern(exercise));
    if (!hasSelectedTrueHinge && trueHingeIndex >= 0) {
      if (selected.length < cap) {
        pushUniqueIndex(selected, trueHingeIndex, used);
      } else {
        const replaceAt = selected
          .map((index, selectedIndex) => ({ index, selectedIndex, score: exerciseKeepScore(exercises[index], index, dayType, user, pb) }))
          .filter((entry) => !isStrengthAnchorExercise(exercises[entry.index]) && !isCoreExercise(exercises[entry.index]) && !isCalfExercise(exercises[entry.index]))
          .sort((a, b) => a.score - b.score)[0];
        if (replaceAt) selected[replaceAt.selectedIndex] = trueHingeIndex;
      }
    }
  }

  return selected.sort((a, b) => a - b);
}

function polishPowerbuildingDay(day, user) {
  const pb = user?.profile?.powerbuilding || buildPowerbuildingProfile(user);
  if (!pb || !Array.isArray(day?.exercises) || !day.exercises.length) return day;
  const cap = movementCapForDay(day?.dayType, user, pb);
  if (day.exercises.length <= cap) return day;
  const indexes = selectPowerbuildingExerciseIndexes(day.exercises, day?.dayType, user, pb, cap);
  const exercises = indexes.map((index) => day.exercises[index]).filter(Boolean);
  return { ...day, exercises };
}

function buildPowerbuildingSplit(user) {
  const pb = user?.profile?.powerbuilding || buildPowerbuildingProfile(user);
  const d = Number(user?.daysPerWeek || 0);
  const lowComplexity = user?.profile?.complexity === 'low' || user?.profile?.sessionBandwidth === 'tight';
  let split;
  if (lowComplexity && d <= 3) {
    split = d === 2
      ? ['FullBodyA', 'FullBodyB']
      : isBeginnerPowerbuilding(user)
        ? ['FullBodyA', 'LowerFocus', 'Pull']
        : ['FullBodyA', 'LowerFocus', 'FullBodyB'];
  } else if (pb?.emphasis === 'bench') {
    split = d === 2 ? ['Push', 'LowerFocus']
      : d === 3 ? ['Push', 'LowerFocus', 'Pull']
        : d === 4 ? ['Push', 'LowerFocus', 'Pull', 'Lower']
          : d === 5 ? ['Push', 'LowerFocus', 'Pull', 'UpperFocus', 'Lower']
            : ['Push', 'LowerFocus', 'Pull', 'UpperFocus', 'Lower', 'DeltsArms'];
  } else if (pb?.emphasis === 'squat') {
    split = d === 2 ? ['Upper', 'LowerFocus']
      : d === 3 ? ['Upper', 'LowerFocus', 'Push']
        : d === 4 ? ['Upper', 'LowerFocus', 'Push', 'Lower']
          : d === 5 ? ['Upper', 'LowerFocus', 'Push', 'Pull', 'Lower']
            : ['Upper', 'LowerFocus', 'Push', 'Pull', 'Lower', 'DeltsArms'];
  } else if (pb?.emphasis === 'hinge') {
    split = d === 2 ? ['Pull', 'LowerFocus']
      : d === 3 ? ['Push', 'LowerFocus', 'Pull']
        : d === 4 ? ['Push', 'LowerFocus', 'Upper', 'Lower']
          : d === 5 ? ['Push', 'LowerFocus', 'Pull', 'Upper', 'Lower']
            : ['Push', 'LowerFocus', 'Pull', 'Upper', 'Lower', 'DeltsArms'];
  } else {
    split = d === 2 ? ['FullBodyA', 'FullBodyB']
      : d === 3 ? ['Push', 'LowerFocus', 'Pull']
        : d === 4 ? ['Push', 'LowerFocus', 'Upper', 'Lower']
          : d === 5 ? ['Push', 'LowerFocus', 'Pull', 'Upper', 'Lower']
            : ['Push', 'LowerFocus', 'Pull', 'Upper', 'Lower', 'DeltsArms'];
  }
  const days = user?.preferredDays?.length === d ? user.preferredDays.slice(0, d) : WEEKDAY_DEFAULT_ORDER.slice(0, d);
  return split.map((dayType, index) => ({ day: days[index], dayType }));
}

function markOptional(slots, ids) {
  const wanted = new Set(ids);
  slots.forEach((slot) => {
    if (wanted.has(String(slot?.id || ''))) slot.optional = true;
  });
}

function prependSlot(slots, createSlot, id, pattern, muscleTarget, opts = {}) {
  if (slots.some((slot) => String(slot?.id || '') === id)) return;
  slots.unshift(createSlot(id, pattern, 'Compound', muscleTarget, opts));
}

function applyPowerbuildingBlueprint(dayType, user, slots, createSlot) {
  const pb = user?.profile?.powerbuilding;
  if (!pb) return slots;
  const out = slots.map((slot) => ({ ...slot }));
  const type = String(dayType || '');
  const lowerPain = Math.max(painSeverity(user, 'back'), painSeverity(user, 'knee'), painSeverity(user, 'hip'));
  const chestPriorityLead = Number(pb.priorityRanks?.Chest || 99) === 1;
  const primaryPressSlotId = pb.avoidBenchPattern ? 'pb_press_primary' : 'pb_bench_primary';
  const secondaryPressSlotId = pb.avoidBenchPattern ? 'pb_press_secondary' : 'pb_bench_secondary';
  const supportPressSlotId = pb.avoidBenchPattern ? 'pb_press_support' : 'pb_bench_support';
  const fullbodyPressSlotId = pb.avoidBenchPattern ? 'pb_press_fullbody' : 'pb_bench_fullbody';

  if (type === 'Push') {
    prependSlot(out, createSlot, primaryPressSlotId, 'HorizontalPush', 'Chest', { primaryAllowed: ['Chest'] });
    if (pb.avoidVerticalPress) markOptional(out, ['push_vp']);
    if (pb.avoidAggressiveTriceps) markOptional(out, ['push_tri_iso']);
  } else if (type === 'UpperFocus') {
    if (pb.emphasis === 'bench' || pb.emphasis === 'balanced' || chestPriorityLead) {
      prependSlot(out, createSlot, secondaryPressSlotId, 'HorizontalPush', 'Chest', { primaryAllowed: ['Chest'] });
    }
    if (pb.avoidAggressiveTriceps) markOptional(out, ['uf_tri_iso']);
  } else if (type === 'Upper') {
    if ((pb.emphasis === 'bench' || chestPriorityLead) && Number(user?.daysPerWeek || 0) >= 4) {
      prependSlot(out, createSlot, supportPressSlotId, 'HorizontalPush', 'Chest', { primaryAllowed: ['Chest'] });
    }
  } else if (type === 'FullBodyA') {
    prependSlot(out, createSlot, fullbodyPressSlotId, 'HorizontalPush', 'Chest', { primaryAllowed: ['Chest'] });
  } else if (type === 'FullBodyB') {
    if (pb.avoidDeadliftPattern && !pb.avoidSquatPattern) {
      prependSlot(out, createSlot, 'pb_sq_fullbody', 'Squat', 'Legs', { primaryAllowed: ['Legs'] });
    } else if (pb.avoidSquatPattern && !pb.avoidDeadliftPattern) {
      prependSlot(out, createSlot, 'pb_hinge_fullbody', 'Hinge', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'] });
    } else if (!pb.avoidDeadliftPattern || !pb.avoidSquatPattern) {
      prependSlot(out, createSlot, pb.emphasis === 'hinge' ? 'pb_sq_fullbody' : 'pb_hinge_fullbody', pb.emphasis === 'hinge' ? 'Squat' : 'Hinge', pb.emphasis === 'hinge' ? 'Legs' : 'Glutes', {
        primaryAllowed: pb.emphasis === 'hinge' ? ['Legs'] : ['Legs', 'Glutes']
      });
    }
  } else if (type === 'LowerFocus') {
    if (pb.avoidDeadliftPattern && !pb.avoidSquatPattern) {
      prependSlot(out, createSlot, 'pb_sq_primary', 'Squat', 'Legs', { primaryAllowed: ['Legs'] });
      markOptional(out, ['lf_hinge']);
    } else if (pb.avoidSquatPattern && !pb.avoidDeadliftPattern) {
      prependSlot(out, createSlot, 'pb_hinge_primary', 'Hinge', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'] });
      markOptional(out, ['lf_squat']);
    } else if (pb.emphasis === 'hinge') {
      prependSlot(out, createSlot, 'pb_hinge_primary', 'Hinge', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'] });
      markOptional(out, ['lf_squat']);
    } else {
      prependSlot(out, createSlot, 'pb_sq_primary', 'Squat', 'Legs', { primaryAllowed: ['Legs'] });
    }
  } else if (type === 'Lower' || type === 'Legs') {
    const skipHingeSupport = pb.avoidDeadliftPattern || (pb.preferSupportedBackWork && pb.recoveryTier === 'low');
    if (pb.emphasis === 'squat' && !skipHingeSupport) {
      prependSlot(out, createSlot, 'pb_hinge_support', 'Hinge', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'] });
      markOptional(out, ['legs_lunge_opt', 'lower_core']);
    } else if (!skipHingeSupport) {
      prependSlot(out, createSlot, 'pb_hinge_support', 'Hinge', 'Glutes', { primaryAllowed: ['Legs', 'Glutes'] });
    }
  } else if (type === 'DeltsArms') {
    if (pb.avoidVerticalPress) markOptional(out, ['da_vp']);
  } else if (type === 'Pull' && pb.preferSupportedBackWork) {
    markOptional(out, ['pull_hpull']);
  }

  if (pb.preserveCalves && ['Lower', 'LowerFocus', 'Legs', 'FullBodyB'].includes(type)) {
    out.forEach((slot) => {
      if (String(slot?.muscleTarget || '') === 'Calves') slot.optional = false;
    });
  }
  if (pb.preserveCore && ['Push', 'Pull', 'Lower', 'LowerFocus', 'Legs', 'Upper', 'UpperFocus', 'FullBodyA', 'FullBodyB'].includes(type)) {
    out.forEach((slot) => {
      if (String(slot?.muscleTarget || '') === 'Core') slot.optional = false;
    });
  }
  return out;
}

function repOverride(slotId, weekType) {
  const slot = String(slotId || '');
  if (!slot.startsWith('pb_')) return null;
  if (slot.includes('bench') || slot.includes('press')) return { reps: weekType === 'intensification' ? '3-5' : '4-6', restSec: 180 };
  if (slot.includes('sq')) return { reps: weekType === 'intensification' ? '3-5' : '4-6', restSec: 180 };
  if (slot.includes('hinge')) return { reps: weekType === 'intensification' ? '3-5' : '4-6', restSec: 180 };
  return null;
}

function rirOverride(exercise, user, weekType, slotId) {
  const slot = String(slotId || '');
  if (!slot.startsWith('pb_')) return null;
  if (String(user?.outputStyle || '') === 'Simple sets x reps') return null;
  if (weekType === 'deload') return '3-4';
  return slot.includes('primary') ? '2-3' : '1-3';
}

function progressionRuleOverride(exercise, user, slotId) {
  if (!String(slotId || '').startsWith('pb_')) return null;
  return 'Rep-first progression: hold clean technique and target RIR, add reps before load, then increase load without failed grinders.';
}

function adjustPowerbuildingDayVolumes(days, user) {
  const pb = user?.profile?.powerbuilding;
  if (!pb) return days;
  return (Array.isArray(days) ? days : []).map((day) => {
    let axialCompounds = 0;
    let pressCompounds = 0;
    const exercises = (Array.isArray(day?.exercises) ? day.exercises : []).map((exercise) => {
      const next = { ...exercise };
      const rank = Number(pb.priorityRanks[canonicalPriority(next?.muscleTarget || next?.primary || '')] || 99);
      const rankMultiplier = rank === 1 ? 1 : rank === 2 ? 0.9 : rank === 3 ? 0.8 : 0.72;
      const isStrengthSlot = String(next?.slotId || '').startsWith('pb_');
      if (isStrengthSlot) {
        const primarySetTarget = isStrengthFocus(user) ? 4 : isAestheticFocus(user) ? 3 : 4;
        const supportSetTarget = isStrengthFocus(user) ? 3 : isSizeFocus(user) ? 4 : 3;
        next.sets = Math.max(3, Math.min(5, String(next.slotId).includes('primary') ? primarySetTarget : supportSetTarget));
      } else if (String(next?.style || '') === 'Isolation') {
        const focusMultiplier = isStrengthFocus(user) ? 0.85 : isSizeFocus(user) ? 1.08 : isAestheticFocus(user) ? 1.05 : 1;
        next.sets = Math.max(
          (next.directCalf && pb.preserveCalves) || (next.directAb && pb.preserveCore) ? 2 : 1,
          Math.min(4, Math.round(Number(next.sets || 2) * pb.accessoryMultiplier * rankMultiplier * focusMultiplier))
        );
      } else {
        const compoundMultiplier = isStrengthFocus(user) ? 0.9 : isSizeFocus(user) ? 1.02 : 0.95;
        next.sets = Math.max(2, Math.min(4, Math.round(Number(next.sets || 2) * Math.max(0.82, pb.accessoryMultiplier) * compoundMultiplier)));
      }
      if (next.axialLoadHigh && String(next?.style || '') === 'Compound') {
        axialCompounds += 1;
        if (axialCompounds > pb.maxAxialSlotsPerLowerDay && !isStrengthSlot) next.sets = Math.max(1, next.sets - 1);
      }
      if ((next.shoulderPressPattern || next.pressRole === 'chest_press' || next.pressRole === 'mixed') && String(next?.style || '') === 'Compound') {
        pressCompounds += 1;
        if (pb.avoidVerticalPress && next.shoulderPressPattern) next.sets = Math.max(1, next.sets - 1);
        if (pressCompounds > 2 && !isStrengthSlot) next.sets = Math.max(1, next.sets - 1);
      }
      return next;
    });
    return polishPowerbuildingDay({ ...day, exercises }, user);
  });
}

module.exports = {
  buildPowerbuildingProfile,
  buildPowerbuildingSplit,
  applyPowerbuildingBlueprint,
  repOverride,
  rirOverride,
  progressionRuleOverride,
  adjustPowerbuildingDayVolumes,
  polishPowerbuildingDay
};
