const { parentPort, workerData } = require('worker_threads');
const trainingRoutes = require('./trainingRoutes');
const {
  DEBUG_COMBO_LABEL,
  evaluateGlutesLegsCoreDebugCombo,
  matchesGlutesLegsCoreDebugCombo
} = require('../js/training-debug-combo');

if (String(process.env.TRAINING_MATRIX_QUIET || '').trim() === '1') {
  console.log = () => {};
  console.info = () => {};
  console.warn = () => {};
  console.error = () => {};
}

const workerStartedAt = Date.now();
let lastHeartbeatStage = 'worker boot';
const HEARTBEAT_HISTORY_LIMIT = 25;
const comboEval = evaluateGlutesLegsCoreDebugCombo(workerData?.payload || {});
const comboDebug = matchesGlutesLegsCoreDebugCombo(workerData?.payload || {});
const diagnosticState = {
  failedCombo: Array.isArray(workerData?.payload?.priorityGroups) ? workerData.payload.priorityGroups.map((value) => String(value || '')) : [],
  priorityGroups: Array.isArray(workerData?.payload?.priorityGroups) ? workerData.payload.priorityGroups.map((value) => String(value || '')) : [],
  lastHeartbeatStage,
  heartbeatStageHistory: [],
  lastBuilderStage: '',
  lastRepairOrPolishFunction: '',
  lastValidatorSection: '',
  lastFailedInvariant: '',
  lastSectionStarted: '',
  lastSectionCompleted: '',
  assertFinallyReached: false,
  assertReturnedSuccessfully: false,
  assertCallStarted: false,
  assertCallReturnedSuccess: false,
  assertCallThrew: false,
  assertCallFinally: false,
  thrownMessage: '',
  lastKnownWeek: null,
  lastKnownDay: '',
  lastKnownDayType: '',
  selectedSplit: [],
  weeklyTargets: null,
  calfTargetSets: null,
  calfExposureByWeek: [],
  crashKind: '',
  crashMessage: '',
  crashStack: '',
  uncaughtExceptionMessage: '',
  uncaughtExceptionStack: '',
  unhandledRejectionMessage: '',
  unhandledRejectionStack: '',
  processExitCalled: false,
  processExitCode: null,
  processExitStack: '',
  workerAfterAssertSuccess: false,
  workerSuccessPayloadBuildStarted: false,
  workerSuccessPayloadBuildCompleted: false,
  workerSuccessPostMessageStarted: false,
  workerSuccessPostMessageCompleted: false,
  workerAssertErrorCaught: false,
  workerErrorSerializeStarted: false,
  workerErrorSerializeCompleted: false,
  workerErrorPostMessageStarted: false,
  workerErrorPostMessageCompleted: false,
  workerBeforeAssertCall: false,
  workerAfterAssertFinally: false,
  workerBeforeFinalResultBuild: false,
  workerAfterFinalResultBuild: false,
  workerBeforeFinalPostMessage: false,
  workerAfterFinalPostMessage: false,
  workerBeforeProcessNaturalExit: false,
  assertStartedAt: null,
  assertFinishedAt: null,
  assertElapsedMs: null
};
let failurePosted = false;

function recordWorkerHeartbeatHistory(stage, payload = {}) {
  const next = {
    stage: String(stage || '').trim() || lastHeartbeatStage,
    elapsedMs: Date.now() - workerStartedAt,
    builderStage: payload?.lastBuilderStage ? String(payload.lastBuilderStage || '').trim() : '',
    repairOrPolishFunction: payload?.lastRepairOrPolishFunction ? String(payload.lastRepairOrPolishFunction || '').trim() : '',
    validatorSection: payload?.validatorSection ? String(payload.validatorSection || '').trim() : '',
    failedInvariant: payload?.failedInvariant ? String(payload.failedInvariant || '').trim() : '',
    functionName: payload?.functionName ? String(payload.functionName || '').trim() : '',
    fileName: payload?.fileName ? String(payload.fileName || '').trim() : '',
    dayCount: Number.isFinite(Number(payload?.requestedDayCount)) ? Number(payload.requestedDayCount) : undefined,
    priorityCount: Number.isFinite(Number(payload?.requestedPriorityCount)) ? Number(payload.requestedPriorityCount) : undefined,
    selectedPriorities: Array.isArray(payload?.selectedPriorities) ? payload.selectedPriorities.map((value) => String(value || '')) : [],
    planExists: typeof payload?.planExists === 'boolean' ? payload.planExists : undefined,
    weeksLength: Number.isFinite(Number(payload?.weeksLength)) ? Number(payload.weeksLength) : undefined,
    callBoundary: payload?.callBoundary ? String(payload.callBoundary || '').trim() : ''
  };
  diagnosticState.heartbeatStageHistory = [
    ...(Array.isArray(diagnosticState.heartbeatStageHistory) ? diagnosticState.heartbeatStageHistory : []),
    next
  ].slice(-HEARTBEAT_HISTORY_LIMIT);
  return diagnosticState.heartbeatStageHistory;
}

function logDebugComboMatchEval(locationTag, evaluation) {
  const evalObj = evaluation && typeof evaluation === 'object' ? evaluation : {};
  try {
    console.info('DEBUG_COMBO_MATCH_EVAL', {
      location: locationTag,
      matched: Boolean(evalObj.matched),
      reasonIfFalse: String(evalObj.reasonIfFalse || ''),
      rawPriorityGroups: Array.isArray(evalObj.rawPriorityGroups) ? evalObj.rawPriorityGroups : [],
      normalizedPriorityGroups: Array.isArray(evalObj.normalizedPriorityGroups) ? evalObj.normalizedPriorityGroups : [],
      discipline: evalObj.discipline || '',
      trainingFeel: evalObj.trainingFeel || '',
      daysPerWeek: Number(evalObj.daysPerWeek || 0) || 0,
      sessionLengthMin: evalObj.sessionLengthMin || '',
      locationValue: evalObj.location || '',
      primaryGoal: evalObj.primaryGoal || '',
      phase: evalObj.phase || '',
      normalizedEquipmentAccess: Array.isArray(evalObj.normalizedEquipmentAccess) ? evalObj.normalizedEquipmentAccess : [],
      painAreas: Array.isArray(evalObj.painAreas) ? evalObj.painAreas : [],
      injuryMap: Array.isArray(evalObj.injuryMapKeys) ? evalObj.injuryMapKeys : [],
      injuryNotes: evalObj.injuryNotes || ''
    });
  } catch {
    // ignore logging failures
  }
}

function emitWorkerHeartbeat(stage, payload = {}) {
  lastHeartbeatStage = String(stage || '').trim() || lastHeartbeatStage;
  diagnosticState.lastHeartbeatStage = lastHeartbeatStage;
  const heartbeatStageHistory = recordWorkerHeartbeatHistory(lastHeartbeatStage, payload);
  if (payload && typeof payload === 'object') {
    if (payload.lastBuilderStage) diagnosticState.lastBuilderStage = String(payload.lastBuilderStage || '').trim();
    if (payload.lastRepairOrPolishFunction) diagnosticState.lastRepairOrPolishFunction = String(payload.lastRepairOrPolishFunction || '').trim();
    if (payload.validatorSection) diagnosticState.lastValidatorSection = String(payload.validatorSection || '').trim();
    if (payload.failedInvariant) diagnosticState.lastFailedInvariant = String(payload.failedInvariant || '').trim();
    if (payload.lastSectionStarted) diagnosticState.lastSectionStarted = String(payload.lastSectionStarted || '').trim();
    if (payload.lastSectionCompleted) diagnosticState.lastSectionCompleted = String(payload.lastSectionCompleted || '').trim();
    if (typeof payload.assertFinallyReached === 'boolean') diagnosticState.assertFinallyReached = payload.assertFinallyReached;
    if (typeof payload.assertReturnedSuccessfully === 'boolean') diagnosticState.assertReturnedSuccessfully = payload.assertReturnedSuccessfully;
    if (payload.validatorSection === 'assert_call_started') diagnosticState.assertCallStarted = true;
    if (payload.validatorSection === 'assert_call_returned_success') diagnosticState.assertCallReturnedSuccess = true;
    if (payload.validatorSection === 'assert_call_threw') diagnosticState.assertCallThrew = true;
    if (payload.validatorSection === 'assert_call_finally') diagnosticState.assertCallFinally = true;
    if (payload.validatorSection === 'assert_call_started' && Number.isFinite(Number(payload.assertStartedAt))) diagnosticState.assertStartedAt = Number(payload.assertStartedAt);
    if (payload.validatorSection === 'assert_call_finally' && Number.isFinite(Number(payload.assertFinishedAt))) diagnosticState.assertFinishedAt = Number(payload.assertFinishedAt);
    if (payload.validatorSection === 'assert_call_finally' && Number.isFinite(Number(payload.assertElapsedMs))) diagnosticState.assertElapsedMs = Number(payload.assertElapsedMs);
    if (payload.thrownMessage) diagnosticState.thrownMessage = String(payload.thrownMessage || '').trim();
    if (Number.isFinite(Number(payload.lastKnownWeek))) diagnosticState.lastKnownWeek = Number(payload.lastKnownWeek);
    if (payload.lastKnownDay) diagnosticState.lastKnownDay = String(payload.lastKnownDay || '').trim();
    if (payload.lastKnownDayType) diagnosticState.lastKnownDayType = String(payload.lastKnownDayType || '').trim();
    if (Array.isArray(payload.selectedSplit)) diagnosticState.selectedSplit = payload.selectedSplit;
    if (payload.weeklyTargets && typeof payload.weeklyTargets === 'object') diagnosticState.weeklyTargets = payload.weeklyTargets;
    if (Number.isFinite(Number(payload.calfTargetSets))) diagnosticState.calfTargetSets = Number(payload.calfTargetSets);
    if (Array.isArray(payload.calfExposureByWeek)) diagnosticState.calfExposureByWeek = payload.calfExposureByWeek;
    if (Array.isArray(payload.priorityGroups)) diagnosticState.priorityGroups = payload.priorityGroups.map((value) => String(value || ''));
    if (Array.isArray(payload.failedCombo)) diagnosticState.failedCombo = payload.failedCombo.map((value) => String(value || ''));
  }
  const eventPayload = {
    type: 'heartbeat',
    label: DEBUG_COMBO_LABEL,
    stage: lastHeartbeatStage,
    elapsedMs: Date.now() - workerStartedAt,
    heartbeatStageHistory,
    failedCombo: diagnosticState.failedCombo,
    priorityGroups: diagnosticState.priorityGroups,
    ...payload
  };
  if (!comboDebug && String(process.env.TRAINING_MATRIX_QUIET || '').trim() === '1') {
    try {
      parentPort.postMessage(eventPayload);
    } catch {
      // ignore heartbeat post failures
    }
    return;
  }
  if (!comboDebug) return;
  try {
    console.info(`[training-debug][${DEBUG_COMBO_LABEL}][worker] ${lastHeartbeatStage}`, {
      at: new Date().toISOString(),
      elapsedMs: eventPayload.elapsedMs,
      ...payload
    });
  } catch {
    // ignore logging failures
  }
  try {
    parentPort.postMessage(eventPayload);
  } catch {
    // ignore heartbeat post failures
  }
}

function serializeError(err) {
  const src = err && typeof err === 'object' ? err : {};
  return {
    error: String(src?.error || src?.code || 'PLAN_BUILD_FAILED'),
    message: String(src?.message || src?.reason || 'Failed to build plan'),
    reason: src?.reason ? String(src.reason) : undefined,
    functionName: String(src?.functionName || src?.fn || 'buildOblueprintPlanWithFallback'),
    stage: src?.stage ? String(src.stage) : undefined,
    failedStage: src?.failedStage ? String(src.failedStage) : undefined,
    slotId: src?.slotId ? String(src.slotId) : undefined,
    exerciseName: src?.exerciseName ? String(src.exerciseName) : (src?.exercise ? String(src.exercise) : undefined),
    week: Number.isFinite(Number(src?.week)) ? Number(src.week) : undefined,
    dayIndex: Number.isFinite(Number(src?.dayIndex)) ? Number(src.dayIndex) : undefined,
    day: src?.day ? String(src.day) : undefined,
    dayType: src?.dayType ? String(src.dayType) : undefined,
    exerciseIndex: Number.isFinite(Number(src?.exerciseIndex)) ? Number(src.exerciseIndex) : undefined,
    muscleTarget: src?.muscleTarget ? String(src.muscleTarget) : undefined,
    priorityGroups: Array.isArray(src?.priorityGroups) ? src.priorityGroups.map((value) => String(value || '')) : undefined,
    selectedSplit: Array.isArray(src?.selectedSplit) ? src.selectedSplit : undefined,
    lastAttemptedRepair: src?.lastAttemptedRepair ? String(src.lastAttemptedRepair) : undefined,
    missingRequirement: src?.missingRequirement ? String(src.missingRequirement) : undefined,
    attempt: Number.isFinite(Number(src?.attempt)) ? Number(src.attempt) : undefined,
    maxAttempts: Number.isFinite(Number(src?.maxAttempts)) ? Number(src.maxAttempts) : undefined,
    lastRepairSucceeded: typeof src?.lastRepairSucceeded === 'boolean' ? src.lastRepairSucceeded : undefined,
    currentStructuralResult: src?.currentStructuralResult || undefined,
    guardKey: src?.guardKey ? String(src.guardKey) : undefined,
    lastHeartbeatStage: src?.lastHeartbeatStage ? String(src.lastHeartbeatStage) : lastHeartbeatStage,
    heartbeatStageHistory: Array.isArray(src?.heartbeatStageHistory) ? src.heartbeatStageHistory : (Array.isArray(diagnosticState.heartbeatStageHistory) ? diagnosticState.heartbeatStageHistory : undefined),
    lastBuilderStage: src?.lastBuilderStage ? String(src.lastBuilderStage) : diagnosticState.lastBuilderStage || undefined,
    failedCombo: Array.isArray(src?.failedCombo) ? src.failedCombo.map((value) => String(value || '')) : diagnosticState.failedCombo,
    lastRepairOrPolishFunction: src?.lastRepairOrPolishFunction ? String(src.lastRepairOrPolishFunction) : diagnosticState.lastRepairOrPolishFunction || undefined,
    lastKnownWeek: Number.isFinite(Number(src?.lastKnownWeek)) ? Number(src.lastKnownWeek) : (Number.isFinite(Number(diagnosticState.lastKnownWeek)) ? Number(diagnosticState.lastKnownWeek) : undefined),
    lastKnownDay: src?.lastKnownDay ? String(src.lastKnownDay) : (diagnosticState.lastKnownDay || undefined),
    lastKnownDayType: src?.lastKnownDayType ? String(src.lastKnownDayType) : (diagnosticState.lastKnownDayType || undefined),
    validatorSection: src?.validatorSection ? String(src.validatorSection) : undefined,
    failedInvariant: src?.failedInvariant ? String(src.failedInvariant) : undefined,
    lastSectionStarted: src?.lastSectionStarted ? String(src.lastSectionStarted) : (diagnosticState.lastSectionStarted || undefined),
    lastSectionCompleted: src?.lastSectionCompleted ? String(src.lastSectionCompleted) : (diagnosticState.lastSectionCompleted || undefined),
    assertFinallyReached: typeof src?.assertFinallyReached === 'boolean' ? src.assertFinallyReached : diagnosticState.assertFinallyReached,
    assertReturnedSuccessfully: typeof src?.assertReturnedSuccessfully === 'boolean' ? src.assertReturnedSuccessfully : diagnosticState.assertReturnedSuccessfully,
    assertCallStarted: typeof src?.assertCallStarted === 'boolean' ? src.assertCallStarted : diagnosticState.assertCallStarted,
    assertCallReturnedSuccess: typeof src?.assertCallReturnedSuccess === 'boolean' ? src.assertCallReturnedSuccess : diagnosticState.assertCallReturnedSuccess,
    assertCallThrew: typeof src?.assertCallThrew === 'boolean' ? src.assertCallThrew : diagnosticState.assertCallThrew,
    assertCallFinally: typeof src?.assertCallFinally === 'boolean' ? src.assertCallFinally : diagnosticState.assertCallFinally,
    thrownMessage: src?.thrownMessage ? String(src.thrownMessage) : (diagnosticState.thrownMessage || undefined),
    exerciseNames: Array.isArray(src?.exerciseNames) ? src.exerciseNames.map((value) => String(value || '')) : undefined,
    weekExerciseList: Array.isArray(src?.weekExerciseList) ? src.weekExerciseList : undefined,
    failedDayExercises: Array.isArray(src?.failedDayExercises) ? src.failedDayExercises.map((value) => String(value || '')) : undefined,
    hingeDeadliftExercisesInWeek: Array.isArray(src?.hingeDeadliftExercisesInWeek) ? src.hingeDeadliftExercisesInWeek : undefined,
    heavyDeadliftExercisesInWeek: Array.isArray(src?.heavyDeadliftExercisesInWeek) ? src.heavyDeadliftExercisesInWeek : undefined,
    countedHeavyDeadliftExerciseNames: Array.isArray(src?.countedHeavyDeadliftExerciseNames) ? src.countedHeavyDeadliftExerciseNames.map((value) => String(value || '')) : undefined,
    heavyDeadliftByDay: Array.isArray(src?.heavyDeadliftByDay) ? src.heavyDeadliftByDay : undefined,
    legsSelected: typeof src?.legsSelected === 'boolean' ? src.legsSelected : undefined,
    glutesSelected: typeof src?.glutesSelected === 'boolean' ? src.glutesSelected : undefined,
    sameDayHeavyHingeCount: Number.isFinite(Number(src?.sameDayHeavyHingeCount)) ? Number(src.sameDayHeavyHingeCount) : undefined,
    weeklyHeavyHingeExposureDays: Number.isFinite(Number(src?.weeklyHeavyHingeExposureDays)) ? Number(src.weeklyHeavyHingeExposureDays) : undefined,
    repeatedHeavyHingeRole: src?.repeatedHeavyHingeRole ? String(src.repeatedHeavyHingeRole) : undefined,
    sameDayHeavyHingeStacking: typeof src?.sameDayHeavyHingeStacking === 'boolean' ? src.sameDayHeavyHingeStacking : undefined,
    weeklyHeavyHingeStacking: typeof src?.weeklyHeavyHingeStacking === 'boolean' ? src.weeklyHeavyHingeStacking : undefined,
    heavyDeadliftFalsePositiveCount: Number.isFinite(Number(src?.heavyDeadliftFalsePositiveCount)) ? Number(src.heavyDeadliftFalsePositiveCount) : undefined,
    falsePositiveClassification: typeof src?.falsePositiveClassification === 'boolean' ? src.falsePositiveClassification : undefined,
    safeHeavyHingeReplacementExists: typeof src?.safeHeavyHingeReplacementExists === 'boolean' ? src.safeHeavyHingeReplacementExists : undefined,
    safeHeavyHingeReplacementCandidate: src?.safeHeavyHingeReplacementCandidate || undefined,
    removingOrReplacingWouldBreakLowerDayStructure: typeof src?.removingOrReplacingWouldBreakLowerDayStructure === 'boolean' ? src.removingOrReplacingWouldBreakLowerDayStructure : undefined,
    heavyDeadliftIssueKind: src?.heavyDeadliftIssueKind ? String(src.heavyDeadliftIssueKind) : undefined,
    hardFailReason: src?.hardFailReason ? String(src.hardFailReason) : undefined,
    softenedToWarning: typeof src?.softenedToWarning === 'boolean' ? src.softenedToWarning : undefined,
    exerciseKeys: Array.isArray(src?.exerciseKeys) ? src.exerciseKeys.map((value) => String(value || '')) : undefined,
    rawExercisePreview: src?.rawExercisePreview ? String(src.rawExercisePreview) : undefined,
    rawDayPreview: src?.rawDayPreview ? String(src.rawDayPreview) : undefined,
    dayObjectKeys: Array.isArray(src?.dayObjectKeys) ? src.dayObjectKeys.map((value) => String(value || '')) : undefined,
    dayExercisesIsArray: typeof src?.dayExercisesIsArray === 'boolean' ? src.dayExercisesIsArray : undefined,
    exerciseType: src?.exerciseType ? String(src.exerciseType) : undefined,
    exerciseIsArray: typeof src?.exerciseIsArray === 'boolean' ? src.exerciseIsArray : undefined,
    exerciseId: src?.exerciseId ? String(src.exerciseId) : undefined,
    exerciseSets: src?.exerciseSets,
    exerciseReps: src?.exerciseReps,
    weeklyTargets: src?.weeklyTargets || diagnosticState.weeklyTargets || undefined,
    calfTargetSets: Number.isFinite(Number(src?.calfTargetSets)) ? Number(src.calfTargetSets) : (Number.isFinite(Number(diagnosticState.calfTargetSets)) ? Number(diagnosticState.calfTargetSets) : undefined),
    calfDirectSets: Number.isFinite(Number(src?.calfDirectSets)) ? Number(src.calfDirectSets) : undefined,
    calfExposureDays: Array.isArray(src?.calfExposureDays) ? src.calfExposureDays : undefined,
    calfExposureByWeek: Array.isArray(src?.calfExposureByWeek) ? src.calfExposureByWeek : (Array.isArray(diagnosticState.calfExposureByWeek) ? diagnosticState.calfExposureByWeek : undefined),
    crashKind: src?.crashKind ? String(src.crashKind) : (diagnosticState.crashKind || undefined),
    uncaughtExceptionMessage: src?.uncaughtExceptionMessage ? String(src.uncaughtExceptionMessage) : (diagnosticState.uncaughtExceptionMessage || undefined),
    uncaughtExceptionStack: src?.uncaughtExceptionStack ? String(src.uncaughtExceptionStack) : (diagnosticState.uncaughtExceptionStack || undefined),
    unhandledRejectionMessage: src?.unhandledRejectionMessage ? String(src.unhandledRejectionMessage) : (diagnosticState.unhandledRejectionMessage || undefined),
    unhandledRejectionStack: src?.unhandledRejectionStack ? String(src.unhandledRejectionStack) : (diagnosticState.unhandledRejectionStack || undefined),
    processExitCalled: typeof src?.processExitCalled === 'boolean' ? src.processExitCalled : diagnosticState.processExitCalled,
    processExitCode: Number.isFinite(Number(src?.processExitCode)) ? Number(src.processExitCode) : (Number.isFinite(Number(diagnosticState.processExitCode)) ? Number(diagnosticState.processExitCode) : undefined),
    processExitStack: src?.processExitStack ? String(src.processExitStack) : (diagnosticState.processExitStack || undefined),
    workerAfterAssertSuccess: typeof src?.workerAfterAssertSuccess === 'boolean' ? src.workerAfterAssertSuccess : diagnosticState.workerAfterAssertSuccess,
    workerSuccessPayloadBuildStarted: typeof src?.workerSuccessPayloadBuildStarted === 'boolean' ? src.workerSuccessPayloadBuildStarted : diagnosticState.workerSuccessPayloadBuildStarted,
    workerSuccessPayloadBuildCompleted: typeof src?.workerSuccessPayloadBuildCompleted === 'boolean' ? src.workerSuccessPayloadBuildCompleted : diagnosticState.workerSuccessPayloadBuildCompleted,
    workerSuccessPostMessageStarted: typeof src?.workerSuccessPostMessageStarted === 'boolean' ? src.workerSuccessPostMessageStarted : diagnosticState.workerSuccessPostMessageStarted,
    workerSuccessPostMessageCompleted: typeof src?.workerSuccessPostMessageCompleted === 'boolean' ? src.workerSuccessPostMessageCompleted : diagnosticState.workerSuccessPostMessageCompleted,
    workerAssertErrorCaught: typeof src?.workerAssertErrorCaught === 'boolean' ? src.workerAssertErrorCaught : diagnosticState.workerAssertErrorCaught,
    workerErrorSerializeStarted: typeof src?.workerErrorSerializeStarted === 'boolean' ? src.workerErrorSerializeStarted : diagnosticState.workerErrorSerializeStarted,
    workerErrorSerializeCompleted: typeof src?.workerErrorSerializeCompleted === 'boolean' ? src.workerErrorSerializeCompleted : diagnosticState.workerErrorSerializeCompleted,
    workerErrorPostMessageStarted: typeof src?.workerErrorPostMessageStarted === 'boolean' ? src.workerErrorPostMessageStarted : diagnosticState.workerErrorPostMessageStarted,
    workerErrorPostMessageCompleted: typeof src?.workerErrorPostMessageCompleted === 'boolean' ? src.workerErrorPostMessageCompleted : diagnosticState.workerErrorPostMessageCompleted,
    workerBeforeAssertCall: typeof src?.workerBeforeAssertCall === 'boolean' ? src.workerBeforeAssertCall : diagnosticState.workerBeforeAssertCall,
    workerAfterAssertFinally: typeof src?.workerAfterAssertFinally === 'boolean' ? src.workerAfterAssertFinally : diagnosticState.workerAfterAssertFinally,
    workerBeforeFinalResultBuild: typeof src?.workerBeforeFinalResultBuild === 'boolean' ? src.workerBeforeFinalResultBuild : diagnosticState.workerBeforeFinalResultBuild,
    workerAfterFinalResultBuild: typeof src?.workerAfterFinalResultBuild === 'boolean' ? src.workerAfterFinalResultBuild : diagnosticState.workerAfterFinalResultBuild,
    workerBeforeFinalPostMessage: typeof src?.workerBeforeFinalPostMessage === 'boolean' ? src.workerBeforeFinalPostMessage : diagnosticState.workerBeforeFinalPostMessage,
    workerAfterFinalPostMessage: typeof src?.workerAfterFinalPostMessage === 'boolean' ? src.workerAfterFinalPostMessage : diagnosticState.workerAfterFinalPostMessage,
    workerBeforeProcessNaturalExit: typeof src?.workerBeforeProcessNaturalExit === 'boolean' ? src.workerBeforeProcessNaturalExit : diagnosticState.workerBeforeProcessNaturalExit,
    assertStartedAt: Number.isFinite(Number(src?.assertStartedAt)) ? Number(src.assertStartedAt) : (Number.isFinite(Number(diagnosticState.assertStartedAt)) ? Number(diagnosticState.assertStartedAt) : undefined),
    assertFinishedAt: Number.isFinite(Number(src?.assertFinishedAt)) ? Number(src.assertFinishedAt) : (Number.isFinite(Number(diagnosticState.assertFinishedAt)) ? Number(diagnosticState.assertFinishedAt) : undefined),
    assertElapsedMs: Number.isFinite(Number(src?.assertElapsedMs)) ? Number(src.assertElapsedMs) : (Number.isFinite(Number(diagnosticState.assertElapsedMs)) ? Number(diagnosticState.assertElapsedMs) : undefined),
    stack: src?.stack ? String(src.stack) : undefined
  };
}

function buildMinimalValidationError(err) {
  const src = err && typeof err === 'object' ? err : {};
  return {
    error: 'FINAL_ROUTE_VALIDATION_FAILED',
    code: 'FINAL_ROUTE_VALIDATION_FAILED',
    message: String(src?.message || 'Final bodybuilding validation failed'),
    functionName: 'assertBodybuildingPlanByEngine',
    stage: String(src?.stage || src?.validatorSection || diagnosticState.lastValidatorSection || 'assertBodybuildingPlanByEngine'),
    failedStage: String(src?.failedStage || src?.validatorSection || diagnosticState.lastValidatorSection || 'assertBodybuildingPlanByEngine'),
    validatorSection: String(src?.validatorSection || diagnosticState.lastValidatorSection || ''),
    failedInvariant: String(src?.failedInvariant || diagnosticState.lastFailedInvariant || ''),
    priorityGroups: Array.isArray(src?.priorityGroups) ? src.priorityGroups.map((value) => String(value || '')) : diagnosticState.priorityGroups,
    combo: Array.isArray(src?.failedCombo) ? src.failedCombo.map((value) => String(value || '')) : diagnosticState.failedCombo,
    week: Number.isFinite(Number(src?.week)) ? Number(src.week) : (Number.isFinite(Number(diagnosticState.lastKnownWeek)) ? Number(diagnosticState.lastKnownWeek) : undefined),
    day: String(src?.day || diagnosticState.lastKnownDay || ''),
    dayType: String(src?.dayType || diagnosticState.lastKnownDayType || ''),
    exerciseNames: Array.isArray(src?.exerciseNames) ? src.exerciseNames.map((value) => String(value || '')) : undefined,
    weekExerciseList: Array.isArray(src?.weekExerciseList) ? src.weekExerciseList : undefined,
    failedDayExercises: Array.isArray(src?.failedDayExercises) ? src.failedDayExercises.map((value) => String(value || '')) : undefined,
    hingeDeadliftExercisesInWeek: Array.isArray(src?.hingeDeadliftExercisesInWeek) ? src.hingeDeadliftExercisesInWeek : undefined,
    heavyDeadliftExercisesInWeek: Array.isArray(src?.heavyDeadliftExercisesInWeek) ? src.heavyDeadliftExercisesInWeek : undefined,
    countedHeavyDeadliftExerciseNames: Array.isArray(src?.countedHeavyDeadliftExerciseNames) ? src.countedHeavyDeadliftExerciseNames.map((value) => String(value || '')) : undefined,
    heavyDeadliftByDay: Array.isArray(src?.heavyDeadliftByDay) ? src.heavyDeadliftByDay : undefined,
    legsSelected: typeof src?.legsSelected === 'boolean' ? src.legsSelected : undefined,
    glutesSelected: typeof src?.glutesSelected === 'boolean' ? src.glutesSelected : undefined,
    sameDayHeavyHingeCount: Number.isFinite(Number(src?.sameDayHeavyHingeCount)) ? Number(src.sameDayHeavyHingeCount) : undefined,
    weeklyHeavyHingeExposureDays: Number.isFinite(Number(src?.weeklyHeavyHingeExposureDays)) ? Number(src.weeklyHeavyHingeExposureDays) : undefined,
    repeatedHeavyHingeRole: src?.repeatedHeavyHingeRole ? String(src.repeatedHeavyHingeRole) : undefined,
    sameDayHeavyHingeStacking: typeof src?.sameDayHeavyHingeStacking === 'boolean' ? src.sameDayHeavyHingeStacking : undefined,
    weeklyHeavyHingeStacking: typeof src?.weeklyHeavyHingeStacking === 'boolean' ? src.weeklyHeavyHingeStacking : undefined,
    heavyDeadliftFalsePositiveCount: Number.isFinite(Number(src?.heavyDeadliftFalsePositiveCount)) ? Number(src.heavyDeadliftFalsePositiveCount) : undefined,
    falsePositiveClassification: typeof src?.falsePositiveClassification === 'boolean' ? src.falsePositiveClassification : undefined,
    safeHeavyHingeReplacementExists: typeof src?.safeHeavyHingeReplacementExists === 'boolean' ? src.safeHeavyHingeReplacementExists : undefined,
    safeHeavyHingeReplacementCandidate: src?.safeHeavyHingeReplacementCandidate || undefined,
    removingOrReplacingWouldBreakLowerDayStructure: typeof src?.removingOrReplacingWouldBreakLowerDayStructure === 'boolean' ? src.removingOrReplacingWouldBreakLowerDayStructure : undefined,
    heavyDeadliftIssueKind: src?.heavyDeadliftIssueKind ? String(src.heavyDeadliftIssueKind) : undefined,
    hardFailReason: src?.hardFailReason ? String(src.hardFailReason) : undefined,
    softenedToWarning: typeof src?.softenedToWarning === 'boolean' ? src.softenedToWarning : undefined,
    stack: String(src?.stack || '')
  };
}

function hasValidationContext(err) {
  const src = err && typeof err === 'object' ? err : {};
  return Boolean(
    String(src?.error || src?.code || '').trim() === 'FINAL_ROUTE_VALIDATION_FAILED'
    || String(src?.functionName || '').trim() === 'assertBodybuildingPlanByEngine'
    || String(src?.validatorSection || diagnosticState.lastValidatorSection || '').trim()
    || String(src?.failedInvariant || diagnosticState.lastFailedInvariant || '').trim()
    || diagnosticState.assertCallThrew
    || diagnosticState.workerAssertErrorCaught
  );
}

function postFailure(kind, err) {
  if (failurePosted) return;
  failurePosted = true;
  if (kind === 'uncaughtException') {
    diagnosticState.crashKind = 'uncaughtException';
    diagnosticState.uncaughtExceptionMessage = String(err?.message || err || 'Uncaught exception');
    diagnosticState.uncaughtExceptionStack = String(err?.stack || '').trim();
  } else if (kind === 'unhandledRejection') {
    diagnosticState.crashKind = 'unhandledRejection';
    diagnosticState.unhandledRejectionMessage = String(err?.message || err || 'Unhandled rejection');
    diagnosticState.unhandledRejectionStack = String(err?.stack || '').trim();
  }
  const normalized = serializeError({
    error: 'PLAN_BUILD_WORKER_CRASH',
    message: String(err?.message || err || 'Worker crashed during plan build'),
    functionName: 'buildOblueprintPlanWithFallback',
    lastHeartbeatStage,
    lastBuilderStage: diagnosticState.lastBuilderStage,
    failedCombo: diagnosticState.failedCombo,
    priorityGroups: diagnosticState.priorityGroups,
    lastRepairOrPolishFunction: diagnosticState.lastRepairOrPolishFunction,
    lastKnownWeek: diagnosticState.lastKnownWeek,
    lastKnownDay: diagnosticState.lastKnownDay,
    lastKnownDayType: diagnosticState.lastKnownDayType,
    selectedSplit: diagnosticState.selectedSplit,
    weeklyTargets: diagnosticState.weeklyTargets,
    calfTargetSets: diagnosticState.calfTargetSets,
    calfExposureByWeek: diagnosticState.calfExposureByWeek,
    crashKind: diagnosticState.crashKind,
    uncaughtExceptionMessage: diagnosticState.uncaughtExceptionMessage,
    uncaughtExceptionStack: diagnosticState.uncaughtExceptionStack,
    unhandledRejectionMessage: diagnosticState.unhandledRejectionMessage,
    unhandledRejectionStack: diagnosticState.unhandledRejectionStack,
    stack: String(err?.stack || '').trim() || undefined
  });
  try {
    parentPort.postMessage({ type: 'worker-crash', ok: false, error: normalized });
  } catch {
    // ignore crash post failures
  }
}

process.on('uncaughtException', (err) => {
  postFailure('uncaughtException', err);
});

process.on('unhandledRejection', (err) => {
  postFailure('unhandledRejection', err);
});

const originalProcessExit = process.exit.bind(process);
process.exit = ((code) => {
  diagnosticState.processExitCalled = true;
  diagnosticState.processExitCode = Number.isFinite(Number(code)) ? Number(code) : 0;
  diagnosticState.processExitStack = String(new Error('process.exit trap').stack || '').trim();
  const normalized = serializeError({
    error: 'PLAN_BUILD_PROCESS_EXIT',
    message: `process.exit(${diagnosticState.processExitCode}) called during plan build`,
    functionName: 'buildOblueprintPlanWithFallback',
    lastHeartbeatStage,
    lastBuilderStage: diagnosticState.lastBuilderStage,
    lastRepairOrPolishFunction: diagnosticState.lastRepairOrPolishFunction,
    validatorSection: diagnosticState.lastValidatorSection,
    failedInvariant: diagnosticState.lastFailedInvariant,
    lastSectionStarted: diagnosticState.lastSectionStarted,
    lastSectionCompleted: diagnosticState.lastSectionCompleted,
    assertFinallyReached: diagnosticState.assertFinallyReached,
    assertReturnedSuccessfully: diagnosticState.assertReturnedSuccessfully,
    lastKnownWeek: diagnosticState.lastKnownWeek,
    lastKnownDay: diagnosticState.lastKnownDay,
    lastKnownDayType: diagnosticState.lastKnownDayType,
    failedCombo: diagnosticState.failedCombo,
    priorityGroups: diagnosticState.priorityGroups,
    selectedSplit: diagnosticState.selectedSplit,
    weeklyTargets: diagnosticState.weeklyTargets,
    calfTargetSets: diagnosticState.calfTargetSets,
    calfExposureByWeek: diagnosticState.calfExposureByWeek,
    processExitCalled: true,
    processExitCode: diagnosticState.processExitCode,
    processExitStack: diagnosticState.processExitStack
  });
  try {
    parentPort.postMessage({ type: 'worker-process-exit', ok: false, error: normalized });
  } catch {
    // ignore process exit post failures
  }
  return originalProcessExit(code);
});

try {
  console.info('TRAINING_WORKER_STARTED', {
    priorityGroups: Array.isArray(workerData?.payload?.priorityGroups) ? workerData.payload.priorityGroups : [],
    matchedGlutesLegsCoreDebugCombo: Boolean(comboEval?.matched),
    reasonIfFalse: String(comboEval?.reasonIfFalse || '')
  });
  logDebugComboMatchEval('worker', comboEval);
  emitWorkerHeartbeat('worker received payload', {
    priorityGroups: Array.isArray(workerData?.payload?.priorityGroups) ? workerData.payload.priorityGroups : undefined
  });
  const build = trainingRoutes?._private?.buildOblueprintPlanWithFallback;
  if (typeof build !== 'function') {
    throw new Error('buildOblueprintPlanWithFallback is unavailable in worker.');
  }
  diagnosticState.workerBeforeAssertCall = true;
  emitWorkerHeartbeat('worker_before_assert_call', { workerBeforeAssertCall: true });
  emitWorkerHeartbeat('buildOblueprintPlanWithFallback started');
  const built = build(workerData?.payload || {}, {
    ...(workerData?.opts || {}),
    immediateValidationErrorHandoff: true,
    heartbeat: emitWorkerHeartbeat,
    debugComboLabel: DEBUG_COMBO_LABEL
  });
  diagnosticState.workerAfterAssertFinally = true;
  emitWorkerHeartbeat('worker_after_assert_finally', { workerAfterAssertFinally: true });
  diagnosticState.workerAfterAssertSuccess = true;
  emitWorkerHeartbeat('worker_after_assert_success', { workerAfterAssertSuccess: true });
  diagnosticState.workerBeforeFinalResultBuild = true;
  emitWorkerHeartbeat('worker_before_final_result_build', { workerBeforeFinalResultBuild: true });
  diagnosticState.workerSuccessPayloadBuildStarted = true;
  emitWorkerHeartbeat('worker_success_payload_build_started', { workerSuccessPayloadBuildStarted: true });
  const successPayload = { ok: true, built };
  diagnosticState.workerAfterFinalResultBuild = true;
  emitWorkerHeartbeat('worker_after_final_result_build', { workerAfterFinalResultBuild: true });
  diagnosticState.workerSuccessPayloadBuildCompleted = true;
  emitWorkerHeartbeat('worker_success_payload_build_completed', { workerSuccessPayloadBuildCompleted: true });
  diagnosticState.workerBeforeFinalPostMessage = true;
  emitWorkerHeartbeat('worker_before_final_postMessage', { workerBeforeFinalPostMessage: true });
  diagnosticState.workerSuccessPostMessageStarted = true;
  emitWorkerHeartbeat('worker_success_postMessage_started', { workerSuccessPostMessageStarted: true });
  parentPort.postMessage(successPayload);
  diagnosticState.workerAfterFinalPostMessage = true;
  emitWorkerHeartbeat('worker_after_final_postMessage', { workerAfterFinalPostMessage: true });
  diagnosticState.workerSuccessPostMessageCompleted = true;
  emitWorkerHeartbeat('worker_success_postMessage_completed', { workerSuccessPostMessageCompleted: true });
  diagnosticState.workerBeforeProcessNaturalExit = true;
  emitWorkerHeartbeat('worker_before_process_natural_exit', { workerBeforeProcessNaturalExit: true });
} catch (err) {
  if (err && typeof err === 'object' && !err.lastHeartbeatStage) err.lastHeartbeatStage = lastHeartbeatStage;
  failurePosted = true;
  diagnosticState.workerAssertErrorCaught = true;
  emitWorkerHeartbeat('worker_assert_error_caught', { workerAssertErrorCaught: true });
  const isValidationFailure = hasValidationContext(err);
  if (isValidationFailure) {
    emitWorkerHeartbeat('worker_minimal_error_build_started', { workerMinimalErrorBuildStarted: true });
    const minimalValidationError = buildMinimalValidationError(err);
    emitWorkerHeartbeat('worker_minimal_error_build_completed', { workerMinimalErrorBuildCompleted: true });
    diagnosticState.workerErrorPostMessageStarted = true;
    emitWorkerHeartbeat('worker_error_postMessage_started', { workerErrorPostMessageStarted: true });
    parentPort.postMessage({
      type: 'error',
      error: minimalValidationError,
      diagnostics: serializeError({
        ...minimalValidationError,
        lastHeartbeatStage,
        lastBuilderStage: diagnosticState.lastBuilderStage,
        lastRepairOrPolishFunction: diagnosticState.lastRepairOrPolishFunction,
        failedCombo: diagnosticState.failedCombo,
        lastKnownWeek: diagnosticState.lastKnownWeek,
        lastKnownDay: diagnosticState.lastKnownDay,
        lastKnownDayType: diagnosticState.lastKnownDayType
      })
    });
    diagnosticState.workerErrorPostMessageCompleted = true;
    emitWorkerHeartbeat('worker_error_postMessage_completed', { workerErrorPostMessageCompleted: true });
    emitWorkerHeartbeat('worker_returned_after_error_postMessage', { workerReturnedAfterErrorPostMessage: true });
  } else {
    diagnosticState.workerErrorSerializeStarted = true;
    emitWorkerHeartbeat('worker_error_serialize_started', { workerErrorSerializeStarted: true });
    const serialized = serializeError(err);
    diagnosticState.workerErrorSerializeCompleted = true;
    emitWorkerHeartbeat('worker_error_serialize_completed', { workerErrorSerializeCompleted: true });
    diagnosticState.workerErrorPostMessageStarted = true;
    emitWorkerHeartbeat('worker_error_postMessage_started', { workerErrorPostMessageStarted: true });
    parentPort.postMessage({ ok: false, error: serialized });
    diagnosticState.workerErrorPostMessageCompleted = true;
    emitWorkerHeartbeat('worker_error_postMessage_completed', { workerErrorPostMessageCompleted: true });
  }
}
