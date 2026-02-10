/*
POWERLIFTING ENGINE CONTRACT

- Main lift prescriptions come ONLY from intensity_type
- Block schemes do NOT override powerlifting prescriptions
- Frequency is resolved strictly by daysPerWeek
- Bench is always highest priority
- Deloads may be scheduled OR reactive
*/

const { selectExerciseIdsByIntent, getExerciseById, equipmentClass, mapMuscles, isValidForIntent } = require('./exerciseCatalog');

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function normalizeExperience(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'beginner' || v === 'novice') return 'beginner';
  if (v === 'intermediate') return 'intermediate';
  if (v === 'advanced') return 'advanced';
  return 'beginner';
}

const MUSCLE_KEYS = [
  'chest', 'lats', 'upperBack', 'deltsFront', 'deltsSide', 'deltsRear', 'biceps', 'triceps',
  'quads', 'hamstrings', 'glutes', 'calves', 'abs'
];

const EMPHASIS_TO_MUSCLES = {
  chest: [{ key: 'chest', w: 1 }],
  back: [{ key: 'lats', w: 0.6 }, { key: 'upperBack', w: 0.4 }],
  shoulders: [{ key: 'deltsFront', w: 0.25 }, { key: 'deltsSide', w: 0.45 }, { key: 'deltsRear', w: 0.30 }],
  arms: [{ key: 'biceps', w: 0.5 }, { key: 'triceps', w: 0.5 }],
  quads: [{ key: 'quads', w: 1 }],
  hamstrings_glutes: [{ key: 'hamstrings', w: 0.55 }, { key: 'glutes', w: 0.45 }],
  calves: [{ key: 'calves', w: 1 }],
  abs: [{ key: 'abs', w: 1 }]
};

const INTENT_NEIGHBORS = {
  chest_press_horizontal_compound: ['chest_press_incline_compound', 'chest_press_horizontal_machine'],
  chest_press_incline_compound: ['chest_press_horizontal_compound', 'chest_fly_isolation'],
  lats_vertical_pull_compound: ['upperBack_horizontal_row_compound'],
  upperBack_horizontal_row_compound: ['lats_vertical_pull_compound'],
  quads_knee_dominant_compound: ['quads_knee_dominant_machine', 'hamstrings_hip_hinge_compound'],
  hamstrings_hip_hinge_compound: ['hamstrings_hip_hinge_machine', 'quads_knee_dominant_compound'],
  delts_overhead_press_compound: ['delts_side_isolation', 'chest_press_incline_compound'],
  biceps_curl_isolation: ['arms_superset_isolation'],
  triceps_extension_isolation: ['arms_superset_isolation'],
  calves_isolation: ['calves_isolation'],
  abs_isolation: ['abs_isolation']
};

function normalizeEmphasisList(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const out = [];
  for (const x of list) {
    const v = String(x || '').trim().toLowerCase();
    if (!v) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out.slice(0, 2);
}

function resolveEmphasisWeights(emphasis) {
  const picks = normalizeEmphasisList(emphasis);
  const weights = {};
  for (const key of MUSCLE_KEYS) weights[key] = 1;
  for (const e of picks) {
    const mapping = EMPHASIS_TO_MUSCLES[e];
    if (!mapping) continue;
    for (const part of mapping) {
      weights[part.key] = Math.max(weights[part.key] || 1, 1.2 + 0.2 * part.w);
    }
  }
  return weights;
}

function trainingAgeBand(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === '0_6') return '0_6';
  if (v === '6_18') return '6_18';
  if (v === '18_36') return '18_36';
  if (v === '3_5') return '3_5';
  if (v === '5_plus') return '5_plus';
  return '6_18';
}

function volumeTargetsForAge(band) {
  if (band === '0_6') return { min: 8, max: 12 };
  if (band === '6_18' || band === '18_36') return { min: 10, max: 16 };
  return { min: 12, max: 20 };
}

function timeToWseRange(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === '30_45') return { min: 30, max: 45 };
  if (v === '45_60') return { min: 45, max: 60 };
  if (v === '60_75') return { min: 60, max: 75 };
  if (v === '75_90_plus') return { min: 75, max: 90 };
  return { min: 45, max: 60 };
}

function wseMultiplierForStimulus(stimulus) {
  return stimulus === 'compound' ? 1.25 : 1.0;
}

function intentAllowedByInjury(intentKey, injuryProfile) {
  const sev = injuryProfile && typeof injuryProfile === 'object' ? injuryProfile : {};
  const shoulder = Number(sev.shoulder || 0);
  const elbow = Number(sev.elbow || 0);
  const wrist = Number(sev.wrist || 0);
  const back = Number(sev.back || 0);
  const hip = Number(sev.hip || 0);
  const knee = Number(sev.knee || 0);
  const ankle = Number(sev.ankle || 0);

  if (shoulder >= 6 && (intentKey.includes('overhead') || intentKey.includes('dip'))) return false;
  if (elbow >= 6 && (intentKey.includes('triceps_extension') || intentKey.includes('biceps_curl'))) return false;
  if (wrist >= 6 && (intentKey.includes('curl') || intentKey.includes('press'))) return false;
  if (back >= 6 && (intentKey.includes('hinge') || intentKey.includes('row_compound'))) return false;
  if (hip >= 6 && intentKey.includes('hip')) return false;
  if (knee >= 6 && intentKey.includes('knee_dominant')) return false;
  if (ankle >= 6 && intentKey.includes('calves')) return false;
  return true;
}

function experienceRank(exp) {
  const e = normalizeExperience(exp);
  if (e === 'beginner') return 0;
  if (e === 'intermediate') return 1;
  return 2;
}

function meetsExperienceMin(exp, min) {
  return experienceRank(exp) >= experienceRank(min);
}

function normalizePowerliftingEventType(raw) {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'bench_only' || v === 'bench-only') return 'bench_only';
  if (v === 'full_power' || v === 'full-power') return 'full_power';
  return 'full_power';
}

function roundTo(value, increment) {
  const v = Number(value);
  const inc = Number(increment);
  if (!Number.isFinite(v)) return null;
  if (!Number.isFinite(inc) || inc <= 0) return Math.round(v);
  return Math.round(v / inc) * inc;
}

function epley1rm(weight, reps) {
  const w = Number(weight);
  const r = Number(reps);
  if (!Number.isFinite(w) || w <= 0) return null;
  if (!Number.isFinite(r) || r <= 0) return w;
  return w * (1 + r / 30);
}

function normalizeWeekdayIndexList(input) {
  const raw = Array.isArray(input) ? input : [];
  const out = [];
  for (const x of raw) {
    const n = Number(x);
    if (!Number.isFinite(n)) continue;
    const i = Math.max(0, Math.min(6, Math.floor(n)));
    if (!out.includes(i)) out.push(i);
  }
  return out;
}

function preferredWeekdayPattern(daysPerWeek) {
  const n = Math.max(0, Math.floor(Number(daysPerWeek) || 0));
  if (n <= 0) return [];
  if (n === 1) return [1];
  if (n === 2) return [1, 4];
  if (n === 3) return [1, 3, 5];
  if (n === 4) return [1, 2, 4, 5];
  if (n === 5) return [1, 2, 3, 4, 5];
  if (n === 6) return [1, 2, 3, 4, 5, 6];
  return [0, 1, 2, 3, 4, 5, 6];
}

function buildTrainingSchedule(daysPerWeek, unavailableDays) {
  const n = Math.max(0, Math.floor(Number(daysPerWeek) || 0));
  const unavailable = new Set(normalizeWeekdayIndexList(unavailableDays));
  const available = [1, 2, 3, 4, 5, 6, 0].filter((d) => !unavailable.has(d));
  if (!n) return [];
  if (available.length < n) return [];

  const pattern = preferredWeekdayPattern(n);
  const chosen = [];
  for (const d of pattern) {
    if (chosen.length >= n) break;
    if (!unavailable.has(d) && !chosen.includes(d)) chosen.push(d);
  }
  for (const d of available) {
    if (chosen.length >= n) break;
    if (!chosen.includes(d)) chosen.push(d);
  }
  const weekdayOrder = new Map([[1, 0], [2, 1], [3, 2], [4, 3], [5, 4], [6, 5], [0, 6]]);
  chosen.sort((a, b) => (weekdayOrder.get(a) ?? 99) - (weekdayOrder.get(b) ?? 99));
  return chosen.slice(0, n);
}

function bodybuildingRules(experience) {
  const exp = normalizeExperience(experience);
  if (exp === 'beginner') {
    return {
      structure: ['3–4 training days/week', 'Simple Upper/Lower or PPL', 'Fixed weekly structure'],
      intensity: ['RPE cap ≤ 8', 'No failure training', 'No intensity techniques'],
      volume: ['2–3 working sets/exercise', '4–5 exercises/session'],
      progression: ['Hit top reps on all sets → +2.5–5 lb next session', 'Otherwise keep load the same'],
      deload: ['Every 6–8 weeks', 'Volume −40% • Load −10% • RPE cap ≤ 7']
    };
  }
  return {
    structure: ['Asynchronous microcycle (6–10 days)', 'PPL + Arms/Weak points', 'Rest days autoregulated'],
    intensity: ['Most sets RPE 8–9', 'Main lifts final set RPE 9–10', 'Failure only on machines/isolations (final set)'],
    volume: ['2–4 working sets/exercise', '4–6 exercises/session', 'Max 1 intensity technique/exercise'],
    progression: ['If performance ↑ and recovery good → +1 rep OR +2.5–5 lb', 'If stall + recovery good → +1 set OR adjust rep target', 'If performance ↓ or recovery poor → reduce volume or load'],
    deload: ['Trigger: stall 2 exposures OR strength ↓ 2 sessions OR joint pain ↑ OR RPE harder at same load', 'Deload 1 microcycle: Volume −40–50% • Load −10–15% • RPE cap ≤ 7']
  };
}

function exerciseSubstitutions({ discipline, baseId }) {
  const d = String(discipline || '').toLowerCase();
  const b = String(baseId || '').toLowerCase();
  if (d === 'calisthenics') {
    const map = {
      push: ['Incline Push-up', 'Ring Push-up'],
      dip: ['Assisted Dips', 'Ring Dips'],
      pull: ['Band-Assisted Pull-up', 'Chin-up'],
      row: ['Ring Rows', 'Inverted Rows'],
      leg: ['Split Squat', 'Step-up'],
      hinge: ['Hip Hinge', 'Single-Leg RDL'],
      core: ['Dead Bug', 'Hollow Hold Regression'],
      endurance: ['Easy EMOM', 'Zone 2 (walk/bike)'],
      skill_handstand: ['Wall Handstand Hold', 'Pike Handstand Hold'],
      skill_muscle_up: ['Transition Drills', 'Chest-to-Bar Pull-up'],
      skill_l_sit: ['Tuck Sit', 'Compression Hold'],
      skill_front_lever: ['Tuck Lever', 'Scap Pulls']
    };
    return Array.isArray(map[b]) ? map[b] : [];
  }
  if (d !== 'bodybuilding') return [];

  const map = {
    press: ['Dumbbell Bench Press', 'Machine Chest Press'],
    press2: ['Incline Dumbbell Press', 'Machine Incline Press'],
    row: ['Chest-Supported Row', 'Seated Cable Row'],
    row2: ['Machine Row', 'One-Arm Dumbbell Row'],
    pull: ['Lat Pulldown', 'Assisted Pull-up'],
    pull2: ['Neutral-Grip Pulldown', 'Pull-ups'],
    leg: ['Leg Press', 'Hack Squat'],
    leg2: ['Leg Press', 'Goblet Squat'],
    leg3: ['Hack Squat', 'Bulgarian Split Squat'],
    hinge: ['Romanian Deadlift', 'Hip Hinge Machine'],
    ohp: ['Machine Shoulder Press', 'Dumbbell Shoulder Press'],
    delts: ['Cable Lateral Raise', 'Machine Lateral Raise'],
    rear: ['Cable Rear Delt Fly', 'Reverse Pec Deck'],
    bi: ['Dumbbell Curl', 'Cable Curl'],
    tri: ['Rope Pushdown', 'Machine Dip'],
    tri2: ['Overhead Cable Extension', 'Skull Crusher'],
    arms: ['Cable Curl', 'Rope Pushdown'],
    calf: ['Seated Calf Raise', 'Leg Press Calf Raise'],
    core: ['Machine Crunch', 'Weighted Cable Crunch'],
    core2: ['Hanging Knee Raise', 'Captain’s Chair Raise']
  };

  return Array.isArray(map[b]) ? map[b] : [];
}

function lbs(value) {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return null;
  return v;
}

function asDateIso(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return s;
}

function recencyFactor(dateIso) {
  const iso = asDateIso(dateIso);
  if (!iso) return 1;
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(t)) return 1;
  const days = Math.max(0, Math.floor((Date.now() - t) / (24 * 60 * 60 * 1000)));
  // <= 6w: no penalty. 3mo: small. 6mo: moderate. 1y+: aggressive.
  if (days <= 42) return 1.0;
  if (days <= 90) return 0.97;
  if (days <= 180) return 0.92;
  if (days <= 365) return 0.85;
  if (days <= 730) return 0.80;
  return 0.75;
}

function pctOfTrainingMax(trainingMax, pct, increment) {
  const tm = Number(trainingMax);
  const p = Number(pct);
  if (!Number.isFinite(tm) || tm <= 0) return null;
  if (!Number.isFinite(p) || p <= 0) return null;
  return roundTo(tm * p, increment);
}

function experienceDefaults(exp) {
  const e = normalizeExperience(exp);
  if (e === 'advanced') return { mainIncUpper: 2.5, mainIncLower: 5 };
  if (e === 'intermediate') return { mainIncUpper: 2.5, mainIncLower: 5 };
  return { mainIncUpper: 2.5, mainIncLower: 5 };
}

function weekProgressionPattern(discipline, experience) {
  const exp = normalizeExperience(experience);
  if (discipline === 'powerlifting') {
    // 8-week block with two deloads. Load ramps are applied per intensity type (see prescribing()).
    const ramp = exp === 'advanced'
      ? [0.00, 0.01, 0.02, -0.06, 0.01, 0.02, 0.03, -0.05]
      : exp === 'intermediate'
        ? [0.00, 0.01, 0.02, -0.06, 0.01, 0.02, 0.03, -0.05]
        : [0.00, 0.01, 0.02, -0.06, 0.01, 0.02, 0.03, -0.05];

    const deloadWeeks = new Set([4, 8]);
    return ramp.map((delta, i) => {
      const w = i + 1;
      return {
        label: `Week ${w}`,
        pl: { delta, deload: deloadWeeks.has(w) }
      };
    });
  }

  if (discipline === 'bodybuilding') {
    // Progression is driven by the autoreg engine (applyLogAdjustments), not a fixed 4-week deload.
    // Provide a longer runway of normal weeks; deload weeks are marked in plan.meta.autoreg.deloadWeeks.
    const weeks = [];
    const total = 12;
    for (let i = 1; i <= total; i += 1) {
      const phase = (i - 1) % 3;
      weeks.push({ label: `Week ${i}`, repBias: phase === 0 ? 'base' : 'plus' });
    }
    return weeks;
  }

  return [
    { label: 'Week 1', repBias: 'base' },
    { label: 'Week 2', repBias: 'plus' },
    { label: 'Week 3', repBias: 'plus' },
    { label: 'Week 4', repBias: 'deload' }
  ];
}

function parseRepRange(rawReps) {
  const s = String(rawReps || '').trim().toLowerCase();
  const m = s.match(/(\d+)\s*-\s*(\d+)/);
  if (m) {
    const lo = Number(m[1]);
    const hi = Number(m[2]);
    if (Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && hi >= lo && hi <= 50) return { min: lo, max: hi };
  }
  const n = s.match(/(\d+)/);
  if (n) {
    const v = Number(n[1]);
    if (Number.isFinite(v) && v > 0 && v <= 50) return { min: v, max: v };
  }
  return null;
}

function isLowerBaseId(baseId) {
  const b = String(baseId || '').toLowerCase();
  return b.startsWith('leg')
    || b.startsWith('hinge')
    || b.includes('squat')
    || b.includes('dead')
    || b.includes('quad')
    || b.includes('hamstring')
    || b.includes('glute')
    || b.includes('knee_dominant')
    || b.includes('hip_hinge');
}

function isBadRepQuality(noteText) {
  const t = String(noteText || '').toLowerCase();
  return /(cheat|cheated|momentum|bounce|bounced|partial|half\s*reps?|short\s*rom|bad\s*form|ugly\s*reps?|eg[o0]\s*reps?)/.test(t);
}

function chooseDeloadPct() {
  // Deterministic mid-point defaults within required bands.
  return { loadMult: 0.88, setMult: 0.65 }; // load -12%, sets -35%
}

function midRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return Math.floor((min + max) / 2);
}

function chooseIncrementLb(exp, baseId, defaults) {
  const isBeginner = normalizeExperience(exp) === 'beginner';
  if (isBeginner) return isLowerBaseId(baseId) ? 10 : 5;
  const inc = isLowerBaseId(baseId) ? defaults.mainIncLower : defaults.mainIncUpper;
  return Number.isFinite(inc) && inc > 0 ? inc : (isLowerBaseId(baseId) ? 5 : 2.5);
}

function resolvePowerliftingFrequencies(daysPerWeek) {
  const d = clampInt(daysPerWeek, 2, 6, 4);
  if (d === 3) return { bench: 3, squat: 2, deadlift: 1 };
  if (d === 4) return { bench: 4, squat: 3, deadlift: 1 };
  if (d === 5) return { bench: 4, squat: 3, deadlift: 2 };
  return { bench: 4, squat: 3, deadlift: 2 };
}

function fatigueCostToPoints(cost) {
  const c = String(cost || '').trim().toLowerCase();
  if (c === 'low') return 1;
  if (c === 'medium') return 2;
  if (c === 'high') return 3;
  return 2;
}

function pickDeterministic(list, keyFn) {
  const items = Array.isArray(list) ? list.slice() : [];
  items.sort((a, b) => String(keyFn(a) || '').localeCompare(String(keyFn(b) || ''), 'en'));
  return items[0] || null;
}

function buildPowerliftingTemplate(daysPerWeek) {
  const d = clampInt(daysPerWeek, 2, 6, 3);
  if (d === 2) {
    return [
      {
        label: 'Day 1',
        focus: 'Squat + Bench',
        exercises: [
          { baseId: 'squat', name: 'Back Squat', kind: 'main_lower' },
          { baseId: 'bench', name: 'Bench Press', kind: 'main_upper' },
          { baseId: 'row', name: 'Chest-Supported Row', kind: 'assist_upper' },
          { baseId: 'core', name: 'Plank', kind: 'assist_core' }
        ]
      },
      {
        label: 'Day 2',
        focus: 'Deadlift + Press',
        exercises: [
          { baseId: 'deadlift', name: 'Deadlift', kind: 'main_lower' },
          { baseId: 'bench_var', name: 'Close-Grip Bench Press', kind: 'main_upper' },
          { baseId: 'ohp', name: 'Overhead Press', kind: 'assist_upper' },
          { baseId: 'pull', name: 'Lat Pulldown / Pull-ups', kind: 'assist_upper' }
        ]
      }
    ];
  }
  if (d === 3) {
    return [
      {
        label: 'Day 1',
        focus: 'Squat + Bench',
        exercises: [
          { baseId: 'squat', name: 'Back Squat', kind: 'main_lower' },
          { baseId: 'bench', name: 'Bench Press', kind: 'main_upper' },
          { baseId: 'row', name: 'Row', kind: 'assist_upper' },
          { baseId: 'ham', name: 'Romanian Deadlift', kind: 'assist_lower' }
        ]
      },
      {
        label: 'Day 2',
        focus: 'Deadlift + Press',
        exercises: [
          { baseId: 'deadlift', name: 'Deadlift', kind: 'main_lower' },
          { baseId: 'ohp', name: 'Overhead Press', kind: 'main_upper' },
          { baseId: 'pull', name: 'Pull-ups / Pulldown', kind: 'assist_upper' },
          { baseId: 'core', name: 'Hanging Knee Raise', kind: 'assist_core' }
        ]
      },
      {
        label: 'Day 3',
        focus: 'Bench + Squat Variant',
        exercises: [
          { baseId: 'bench_vol', name: 'Bench Press (Volume)', kind: 'main_upper' },
          { baseId: 'squat_var', name: 'Paused Squat', kind: 'assist_lower' },
          { baseId: 'tri', name: 'Triceps Pressdown', kind: 'assist_upper' },
          { baseId: 'rear', name: 'Rear Delt Fly', kind: 'assist_upper' }
        ]
      }
    ];
  }
  if (d === 4) {
    return [
      {
        label: 'Day 1',
        focus: 'Squat (Heavy)',
        exercises: [
          { baseId: 'squat', name: 'Back Squat', kind: 'main_lower' },
          { baseId: 'bench_light', name: 'Bench Press (Technique)', kind: 'assist_upper' },
          { baseId: 'ham', name: 'Romanian Deadlift', kind: 'assist_lower' },
          { baseId: 'core', name: 'Cable Crunch', kind: 'assist_core' }
        ]
      },
      {
        label: 'Day 2',
        focus: 'Bench (Heavy)',
        exercises: [
          { baseId: 'bench', name: 'Bench Press', kind: 'main_upper' },
          { baseId: 'row', name: 'Row', kind: 'assist_upper' },
          { baseId: 'ohp', name: 'Overhead Press', kind: 'assist_upper' },
          { baseId: 'bi', name: 'Biceps Curl', kind: 'assist_upper' }
        ]
      },
      {
        label: 'Day 3',
        focus: 'Deadlift (Heavy)',
        exercises: [
          { baseId: 'deadlift', name: 'Deadlift', kind: 'main_lower' },
          { baseId: 'squat_var', name: 'Front Squat', kind: 'assist_lower' },
          { baseId: 'pull', name: 'Lat Pulldown / Pull-ups', kind: 'assist_upper' },
          { baseId: 'glute', name: 'Back Extension', kind: 'assist_lower' }
        ]
      },
      {
        label: 'Day 4',
        focus: 'Bench (Volume) + Squat (Volume)',
        exercises: [
          { baseId: 'bench_vol', name: 'Bench Press (Volume)', kind: 'main_upper' },
          { baseId: 'squat_vol', name: 'Back Squat (Volume)', kind: 'main_lower' },
          { baseId: 'tri', name: 'Triceps Extension', kind: 'assist_upper' },
          { baseId: 'delts', name: 'Lateral Raise', kind: 'assist_upper' }
        ]
      }
    ];
  }
  const template = [
    {
      label: 'Day 1',
      focus: 'Squat (Heavy)',
      exercises: [
        { baseId: 'squat', name: 'Back Squat', kind: 'main_lower' },
        { baseId: 'bench_light', name: 'Bench Press (Technique)', kind: 'assist_upper' },
        { baseId: 'ham', name: 'Romanian Deadlift', kind: 'assist_lower' },
        { baseId: 'core', name: 'Plank', kind: 'assist_core' }
      ]
    },
    {
      label: 'Day 2',
      focus: 'Bench (Heavy)',
      exercises: [
        { baseId: 'bench', name: 'Bench Press', kind: 'main_upper' },
        { baseId: 'row', name: 'Row', kind: 'assist_upper' },
        { baseId: 'tri', name: 'Triceps Pressdown', kind: 'assist_upper' },
        { baseId: 'rear', name: 'Rear Delt Fly', kind: 'assist_upper' }
      ]
    },
    {
      label: 'Day 3',
      focus: 'Deadlift (Heavy)',
      exercises: [
        { baseId: 'deadlift', name: 'Deadlift', kind: 'main_lower' },
        { baseId: 'squat_var', name: 'Front Squat', kind: 'assist_lower' },
        { baseId: 'pull', name: 'Pulldown / Pull-ups', kind: 'assist_upper' },
        { baseId: 'glute', name: 'Hip Thrust', kind: 'assist_lower' }
      ]
    },
    {
      label: 'Day 4',
      focus: 'Bench (Volume)',
      exercises: [
        { baseId: 'bench_vol', name: 'Bench Press (Volume)', kind: 'main_upper' },
        { baseId: 'ohp', name: 'Overhead Press', kind: 'assist_upper' },
        { baseId: 'row2', name: 'Cable Row', kind: 'assist_upper' },
        { baseId: 'bi', name: 'Biceps Curl', kind: 'assist_upper' }
      ]
    },
    {
      label: 'Day 5',
      focus: 'Squat (Volume)',
      exercises: [
        { baseId: 'squat_vol', name: 'Back Squat (Volume)', kind: 'main_lower' },
        { baseId: 'dead_var', name: 'Paused Deadlift', kind: 'assist_lower' },
        { baseId: 'leg', name: 'Leg Curl', kind: 'assist_lower' },
        { baseId: 'calf', name: 'Calf Raise', kind: 'assist_lower' }
      ]
    },
    {
      label: 'Day 6',
      focus: 'Hypertrophy Upper',
      exercises: [
        { baseId: 'press', name: 'Incline Dumbbell Press', kind: 'assist_upper' },
        { baseId: 'pull3', name: 'Lat Pulldown', kind: 'assist_upper' },
        { baseId: 'delts', name: 'Lateral Raise', kind: 'assist_upper' },
        { baseId: 'tri2', name: 'Overhead Triceps Extension', kind: 'assist_upper' }
      ]
    }
  ];
  return template.slice(0, d);
}

function buildBodybuildingTemplate(daysPerWeek) {
  const d = clampInt(daysPerWeek, 2, 6, 4);
  const makeSlot = (slotId, intentKey, movementPattern, stimulusType, muscleKeys, foundationFlag, allowedEquipmentClass = ['any']) => ({
    slotId,
    intentKey,
    movementPattern,
    stimulusType,
    muscleKeys,
    foundationFlag,
    allowedEquipmentClass
  });

  const day1 = {
    label: 'Day 1',
    focus: 'Push',
    exercises: [
      makeSlot('bb-d1-s1', 'chest_press_horizontal_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], true, ['barbell', 'dumbbell', 'machine', 'cable']),
      makeSlot('bb-d1-s2', 'chest_press_incline_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], true, ['dumbbell', 'barbell', 'machine']),
      makeSlot('bb-d1-s3', 'delts_side_isolation', 'isolation', 'isolation', ['deltsSide'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d1-s4', 'triceps_extension_isolation', 'isolation', 'isolation', ['triceps'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d1-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'])
    ]
  };

  const day2 = {
    label: 'Day 2',
    focus: 'Pull',
    exercises: [
      makeSlot('bb-d2-s1', 'lats_vertical_pull_compound', 'vertical_pull', 'compound', ['lats', 'biceps'], true, ['cable', 'machine', 'bodyweight']),
      makeSlot('bb-d2-s2', 'upperBack_horizontal_row_compound', 'row', 'compound', ['upperBack', 'lats'], true, ['machine', 'cable', 'dumbbell', 'barbell']),
      makeSlot('bb-d2-s3', 'delts_rear_isolation', 'isolation', 'isolation', ['deltsRear'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d2-s4', 'biceps_curl_isolation', 'isolation', 'isolation', ['biceps'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d2-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'])
    ]
  };

  const day3 = {
    label: 'Day 3',
    focus: 'Legs',
    exercises: [
      makeSlot('bb-d3-s1', 'quads_knee_dominant_compound', 'squat', 'compound', ['quads', 'glutes'], true, ['barbell', 'machine', 'dumbbell']),
      makeSlot('bb-d3-s2', 'hamstrings_hip_hinge_compound', 'hinge', 'compound', ['hamstrings', 'glutes'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-d3-s3', 'calves_isolation', 'isolation', 'isolation', ['calves'], false, ['machine', 'bodyweight', 'dumbbell']),
      makeSlot('bb-d3-s4', 'abs_isolation', 'core', 'isolation', ['abs'], false, ['bodyweight', 'cable', 'machine']),
      makeSlot('bb-d3-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'])
    ]
  };

  const day4 = {
    label: 'Day 4',
    focus: 'Upper + Arms',
    exercises: [
      makeSlot('bb-d4-s1', 'delts_overhead_press_compound', 'ohp', 'compound', ['deltsFront', 'triceps'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-d4-s2', 'chest_fly_isolation', 'isolation', 'isolation', ['chest'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d4-s3', 'arms_superset_isolation', 'isolation', 'isolation', ['biceps', 'triceps'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d4-s4', 'delts_side_isolation', 'isolation', 'isolation', ['deltsSide'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d4-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'])
    ]
  };

  const day5 = {
    label: 'Day 5',
    focus: 'Lower + Pull',
    exercises: [
      makeSlot('bb-d5-s1', 'quads_knee_dominant_compound', 'squat', 'compound', ['quads', 'glutes'], true, ['barbell', 'machine', 'dumbbell']),
      makeSlot('bb-d5-s2', 'upperBack_horizontal_row_compound', 'row', 'compound', ['upperBack', 'lats'], true, ['machine', 'cable', 'dumbbell', 'barbell']),
      makeSlot('bb-d5-s3', 'hamstrings_hip_hinge_compound', 'hinge', 'compound', ['hamstrings', 'glutes'], true, ['barbell', 'dumbbell', 'machine']),
      makeSlot('bb-d5-s4', 'calves_isolation', 'isolation', 'isolation', ['calves'], false, ['machine', 'bodyweight', 'dumbbell']),
      makeSlot('bb-d5-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'])
    ]
  };

  const day6 = {
    label: 'Day 6',
    focus: 'Upper Volume',
    exercises: [
      makeSlot('bb-d6-s1', 'chest_press_incline_compound', 'press', 'compound', ['chest', 'triceps', 'deltsFront'], true, ['dumbbell', 'barbell', 'machine']),
      makeSlot('bb-d6-s2', 'lats_vertical_pull_compound', 'vertical_pull', 'compound', ['lats', 'biceps'], true, ['cable', 'machine', 'bodyweight']),
      makeSlot('bb-d6-s3', 'delts_rear_isolation', 'isolation', 'isolation', ['deltsRear'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d6-s4', 'biceps_curl_isolation', 'isolation', 'isolation', ['biceps'], false, ['cable', 'machine', 'dumbbell']),
      makeSlot('bb-d6-s5', 'accessory_flex', 'isolation', 'isolation', [], false, ['any'])
    ]
  };

  const template = [day1, day2, day3, day4, day5, day6].slice(0, d);
  return template;
}

const INTENT_DEFS = {
  chest_press_horizontal_compound: { searchHint: 'bench press', stimulusType: 'compound' },
  chest_press_incline_compound: { searchHint: 'incline press', stimulusType: 'compound' },
  chest_fly_isolation: { searchHint: 'chest fly', stimulusType: 'isolation' },
  lats_vertical_pull_compound: { searchHint: 'lat pulldown pull-up', stimulusType: 'compound' },
  upperBack_horizontal_row_compound: { searchHint: 'row', stimulusType: 'compound' },
  delts_overhead_press_compound: { searchHint: 'overhead press', stimulusType: 'compound' },
  delts_side_isolation: { searchHint: 'lateral raise', stimulusType: 'isolation' },
  delts_rear_isolation: { searchHint: 'rear delt fly', stimulusType: 'isolation' },
  biceps_curl_isolation: { searchHint: 'biceps curl', stimulusType: 'isolation' },
  triceps_extension_isolation: { searchHint: 'triceps extension pushdown', stimulusType: 'isolation' },
  quads_knee_dominant_compound: { searchHint: 'squat leg press', stimulusType: 'compound' },
  hamstrings_hip_hinge_compound: { searchHint: 'romanian deadlift hip hinge', stimulusType: 'compound' },
  calves_isolation: { searchHint: 'calf raise', stimulusType: 'isolation' },
  abs_isolation: { searchHint: 'ab crunch', stimulusType: 'isolation' },
  arms_superset_isolation: { searchHint: 'biceps curl triceps extension', stimulusType: 'isolation' },
  accessory_flex: { searchHint: 'cable curl lateral raise', stimulusType: 'isolation' }
};

function computeVolumeTargets({ trainingAgeBucket, emphasis, phase }) {
  const band = trainingAgeBand(trainingAgeBucket);
  const base = volumeTargetsForAge(band);
  const weights = resolveEmphasisWeights(emphasis);
  const targets = {};
  const mid = Math.round((base.min + base.max) / 2);
  const phaseMult = phase === 'cut' ? 0.88 : phase === 'maintain' ? 1.0 : 1.05;
  for (const m of MUSCLE_KEYS) {
    const w = weights[m] || 1;
    const target = Math.round(mid * w * phaseMult);
    targets[m] = Math.max(6, target);
  }
  return targets;
}

function wseBudgetForPlan({ timePerSession, daysPerWeek }) {
  const range = timeToWseRange(timePerSession);
  const perSession = Math.round((range.min + range.max) / 2);
  const perWeek = perSession * Math.max(1, Number(daysPerWeek || 0));
  return { perSession, perWeek };
}

function computeWseForWeek(week) {
  let totalMinutes = 0;
  const workSetMin = 0.75; // 45 seconds
  const transitionMin = 1.0; // 1 minute per exercise
  for (const day of week.days || []) {
    for (const ex of day.exercises || []) {
      const sets = Number(ex.sets) || 0;
      if (sets <= 0) continue;
      const restSec = Number(ex.restSec) || 0;
      const restMin = Math.max(0, sets - 1) * (restSec / 60);
      const time = (sets * workSetMin) + restMin + transitionMin;
      totalMinutes += time;
    }
  }
  return totalMinutes;
}

function tuneSetsForWeek({ week, targets, wseBudgetWeek }) {
  const capFor = (stimulus) => (stimulus === 'compound' ? 5 : 4);
  const minFor = () => 1;

  const calcByMuscle = () => {
    const totals = {};
    for (const m of MUSCLE_KEYS) totals[m] = 0;
    for (const day of week.days || []) {
      for (const ex of day.exercises || []) {
        const sets = Number(ex.sets) || 0;
        const keys = Array.isArray(ex.muscleKeys) ? ex.muscleKeys : [];
        for (const k of keys) {
          if (totals[k] != null) totals[k] += sets;
        }
      }
    }
    return totals;
  };

  let totals = calcByMuscle();
  let wse = computeWseForWeek(week);

  const deficitScore = (ex) => {
    const keys = Array.isArray(ex.muscleKeys) ? ex.muscleKeys : [];
    let score = 0;
    for (const k of keys) {
      const target = targets[k] || 0;
      const cur = totals[k] || 0;
      if (target > cur) score += (target - cur);
    }
    return score;
  };

  // Add sets to fill deficits within WSE budget.
  for (let iter = 0; iter < 200; iter += 1) {
    if (wse >= wseBudgetWeek) break;
    let best = null;
    let bestScore = 0;
    for (const day of week.days || []) {
      for (const ex of day.exercises || []) {
        if (ex.blockType === 'superset') continue;
        const cap = capFor(ex.stimulusType || 'isolation');
        if ((Number(ex.sets) || 0) >= cap) continue;
        const score = deficitScore(ex);
        if (score > bestScore) {
          bestScore = score;
          best = ex;
        }
      }
    }
    if (!best || bestScore <= 0) break;
    best.sets = (Number(best.sets) || 0) + 1;
    totals = calcByMuscle();
    wse = computeWseForWeek(week);
  }

  // Reduce if over budget.
  for (let iter = 0; iter < 200; iter += 1) {
    if (wse <= wseBudgetWeek) break;
    let candidate = null;
    for (const day of week.days || []) {
      for (const ex of day.exercises || []) {
        if (ex.blockType === 'superset') continue;
        const min = minFor();
        if ((Number(ex.sets) || 0) <= min) continue;
        const isFoundation = Boolean(ex.foundationFlag);
        if (isFoundation) continue;
        candidate = ex;
        break;
      }
      if (candidate) break;
    }
    if (!candidate) break;
    candidate.sets = Math.max(minFor(), (Number(candidate.sets) || 0) - 1);
    wse = computeWseForWeek(week);
}
}

function chooseIntentForInjury(intentKey, injuryProfile) {
  if (intentAllowedByInjury(intentKey, injuryProfile)) return intentKey;
  const neighbors = INTENT_NEIGHBORS[intentKey] || [];
  for (const n of neighbors) {
    if (intentAllowedByInjury(n, injuryProfile)) return n;
  }
  return intentKey;
}

function signatureForSlot(movementPattern, muscleKeys, equipmentClassValue) {
  const keys = Array.isArray(muscleKeys) ? muscleKeys.slice().sort().join(',') : '';
  return `${movementPattern || ''}|${keys}|${equipmentClassValue || ''}`;
}

function chooseAccessoryFlexMuscle({ targets, weekTally, dayTally, avoid }) {
  const avoidSet = new Set(Array.isArray(avoid) ? avoid : []);
  let best = null;
  let bestDef = -Infinity;
  for (const m of MUSCLE_KEYS) {
    if (avoidSet.has(m)) continue;
    const t = Number(targets?.[m] || 0);
    const curWeek = Number(weekTally?.[m] || 0);
    const curDay = Number(dayTally?.[m] || 0);
    const deficit = t - (curWeek + curDay);
    if (deficit > bestDef) {
      bestDef = deficit;
      best = m;
    }
  }
  return best || 'chest';
}

const ACCESSORY_FLEX_HINTS = {
  chest: 'chest fly',
  lats: 'lat pulldown',
  upperBack: 'row',
  deltsFront: 'front raise',
  deltsSide: 'lateral raise',
  deltsRear: 'rear delt fly',
  biceps: 'biceps curl',
  triceps: 'triceps pushdown',
  quads: 'leg extension',
  hamstrings: 'leg curl',
  glutes: 'hip thrust',
  calves: 'calf raise',
  abs: 'ab crunch'
};

function requiredIntentGroupsForFocus(focus) {
  const f = String(focus || '').toLowerCase();
  if (f.includes('push')) {
    return [
      ['chest_press_horizontal_compound', 'chest_press_incline_compound']
    ];
  }
  if (f.includes('pull') && !f.includes('lower')) {
    return [
      ['lats_vertical_pull_compound'],
      ['upperBack_horizontal_row_compound']
    ];
  }
  if (f.includes('legs') || f.includes('lower')) {
    return [
      ['quads_knee_dominant_compound'],
      ['hamstrings_hip_hinge_compound']
    ];
  }
  return [];
}

function intentGroupForSlot(intentKey, focus) {
  const groups = requiredIntentGroupsForFocus(focus);
  return groups.find((g) => g.includes(intentKey)) || null;
}

function selectExerciseForIntent({ intentKey, slot, equipmentAccess, equipmentStylePref, usedDay, usedWeek, allowWeekRepeat, searchHintOverride, daySignatureSet, dayIntentSet, strict, injuryProfile, dayLeverageCount }) {
  const def = INTENT_DEFS[intentKey] || {};
  const intent = {
    intentKey,
    searchHint: searchHintOverride || def.searchHint || slot.intentKey,
    muscleKeys: slot.muscleKeys || [],
    allowedEquipmentClass: slot.allowedEquipmentClass || ['any'],
    stimulusType: slot.stimulusType || def.stimulusType || null,
    movementPattern: slot.movementPattern || null
  };
  const candidates = selectExerciseIdsByIntent(intent, {
    equipmentAccess,
    equipmentStylePref,
    stimulusType: intent.stimulusType,
    movementPattern: intent.movementPattern,
    injurySeverityByJoint: injuryProfile,
    dayLeverageCount
  });
  const filtered = candidates.filter((c) => !usedDay.has(c.id) && (allowWeekRepeat ? true : !usedWeek.has(c.id)));
  const nearFiltered = daySignatureSet
    ? filtered.filter((c) => !daySignatureSet.has(signatureForSlot(slot.movementPattern, slot.muscleKeys, c.eqClass)))
    : filtered;
  const pick = strict ? (nearFiltered[0] || null) : (nearFiltered[0] || filtered[0] || candidates[0] || null);
  const swapCandidates = nearFiltered
    .slice(1, 6)
    .map((c) => c.id)
    .filter((id) => {
      const entry = getExerciseById(id);
      const name = String(entry?.name || '').toLowerCase();
      return !/(^|\b)(band|bands|resistance band|mini band)(\b|$)/.test(name);
    })
    .slice(0, 3);
  if (!pick) return { exerciseId: null, swapCandidates: [] };
  usedDay.add(pick.id);
  if (!allowWeekRepeat) usedWeek.add(pick.id);
  if (dayIntentSet) dayIntentSet.add(intentKey);
  return { exerciseId: pick.id, swapCandidates, equipmentClass: pick.eqClass || null, isLeverage: /(leverage|smith)/.test(String(pick.name || '').toLowerCase()) };
}

function validateBodybuildingDay(day) {
  const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
  const ids = new Set();
  const sigs = new Set();
  let hasChestPress = false;
  let hasRow = false;
  let hasVerticalPull = false;
  let hasKnee = false;
  let hasHinge = false;
  let rowCount = 0;
  let verticalCount = 0;
  let firstRequiredIndex = null;

  for (let i = 0; i < exercises.length; i += 1) {
    const ex = exercises[i];
    if (ex.exerciseId) {
      if (ids.has(ex.exerciseId)) return false;
      ids.add(ex.exerciseId);
    }
    if (ex.signature) {
      if (sigs.has(ex.signature)) return false;
      sigs.add(ex.signature);
    }
    const intent = String(ex.intentKey || '').toLowerCase();
    if (intent.includes('chest_press')) hasChestPress = true;
    if (intent.includes('row_compound')) {
      hasRow = true;
      rowCount += 1;
    }
    if (intent.includes('vertical_pull')) {
      hasVerticalPull = true;
      verticalCount += 1;
    }
    if (intent.includes('knee_dominant')) hasKnee = true;
    if (intent.includes('hip_hinge')) hasHinge = true;
    if (String(ex.stimulusType || '') === 'compound' && Number(ex.restSec || 0) < 120) return false;

    if (ex.exerciseId) {
      const entry = getExerciseById(ex.exerciseId);
      if (!isValidForIntent(entry, { intentKey: ex.intentKey, stimulusType: ex.stimulusType, movementPattern: ex.movementPattern })) return false;
    }

    const isRequiredCompound = intent.includes('chest_press')
      || intent.includes('row_compound')
      || intent.includes('vertical_pull')
      || intent.includes('knee_dominant')
      || intent.includes('hip_hinge');
    if (firstRequiredIndex == null && isRequiredCompound) firstRequiredIndex = i;
    const isIsolation = String(ex.stimulusType || '').toLowerCase() === 'isolation'
      || intent.includes('calves')
      || intent.includes('abs');
    if (firstRequiredIndex == null && isIsolation) return false;
  }

  const focus = String(day?.focus || '').toLowerCase();
  const isLower = focus.includes('legs') || focus.includes('lower');
  const isPullDay = focus.includes('pull') && !focus.includes('lower');
  if (focus.includes('push') && !hasChestPress) return false;
  if (isPullDay && (!hasVerticalPull || !hasRow || rowCount > 1 || verticalCount < 1)) return false;
  if (isLower && (!hasKnee || !hasHinge)) return false;

  const first = exercises[0] || null;
  const second = exercises[1] || null;
  const intentFirst = String(first?.intentKey || '').toLowerCase();
  const intentSecond = String(second?.intentKey || '').toLowerCase();
  if (focus.includes('push')) {
    if (!(intentFirst.includes('chest_press') || intentSecond.includes('chest_press'))) return false;
  }
  if (isPullDay) {
    if (!(intentFirst.includes('row_compound') || intentFirst.includes('vertical_pull'))) return false;
    if (!(intentFirst.includes('row_compound') || intentSecond.includes('row_compound'))) return false;
    if (!(intentFirst.includes('vertical_pull') || intentSecond.includes('vertical_pull'))) return false;
  }
  if (isLower) {
    if (!(intentFirst.includes('knee_dominant') || intentFirst.includes('hip_hinge'))) return false;
    if (!(intentFirst.includes('knee_dominant') || intentSecond.includes('knee_dominant'))) return false;
    if (!(intentFirst.includes('hip_hinge') || intentSecond.includes('hip_hinge'))) return false;
  }
  return true;
}

function buildCalisthenicsTemplate(daysPerWeek, baselines) {
  const d = clampInt(daysPerWeek, 2, 6, 4);
  const b = baselines && typeof baselines === 'object' ? baselines : {};
  const equip = b.equipment && typeof b.equipment === 'object' ? b.equipment : { none: true };
  const goals = Array.isArray(b.goals) && b.goals.length ? b.goals : ['strength'];
  const exp = normalizeExperience(b.experience);

  // Persistent soreness/fatigue: reduce volume/intensity at generation time.
  const fatigue = String(b.fatigue || '').toLowerCase();
  const volumeMult = fatigue === 'high' ? 0.70 : fatigue === 'medium' ? 0.85 : 1.0;

  const canDo = {
    push5: Number(b.pushups || 0) >= 5,
    pull5: Number(b.pullups || 0) >= 5,
    dip5: Number(b.dips || 0) >= 5,
    hold3: (sec) => Number(sec || 0) >= 3
  };

  const repScheme = (() => {
    const has = (k) => goals.includes(k);
    // Volume precedes intensity for beginners.
    if (exp === 'beginner') {
      if (has('endurance')) return { strength: '6-10', assist: '12-20' };
      return { strength: has('strength') ? '5-8' : '6-12', assist: '10-20' };
    }
    if (has('strength') && !has('endurance')) return { strength: '3-6', assist: '8-15' };
    if (has('hypertrophy')) return { strength: '6-10', assist: '10-20' };
    if (has('endurance')) return { strength: '8-12', assist: '15-30' };
    return { strength: '5-8', assist: '10-20' };
  })();

  const restScheme = {
    skill: 150,
    strength: goals.includes('strength') ? 180 : 150,
    assist: 90
  };

  const scaleSets = (base) => {
    const scaled = Math.max(1, Math.round(Number(base || 1) * volumeMult));
    return exp === 'beginner' ? Math.min(4, scaled) : Math.min(6, scaled);
  };

  const rx = (sets, reps, restSec) => ({ sets, reps, restSec, pct: null });

  const warmup = (label) => ({
    baseId: `warmup_${label.replace(/\\s+/g, '_').toLowerCase()}`,
    name: `Warm-up: ${label} (6 min)`,
    kind: 'assist_mob',
    block: 'warmup',
    tempo: 'easy',
    coaching: {
      progress: 'Nasal breathing, full ROM, control the tempo.',
      regress: 'If anything pinches, cut range and slow down.'
    },
    prescription: rx(1, '6m', 0)
  });

  const mainPush = () => {
    const max = Number(b.pushups || 0);
    const wantsLoad = goals.includes('strength') && equip.weights && max >= 15 && exp !== 'beginner';
    if (!canDo.push5) {
      return {
        baseId: 'push',
        name: 'Incline / Knee Push-up',
        kind: 'main_upper',
        block: 'strength',
        tempo: '3111',
        coaching: {
          progress: 'Form → reps → sets → lower the incline (harder lever) → load.',
          regress: 'If you cannot hit 5 clean reps, increase incline or use knees.'
        },
        prescription: rx(scaleSets(3), '6-12', restScheme.strength)
      };
    }
    if (wantsLoad) {
      return {
        baseId: 'push',
        name: 'Weighted Push-up',
        kind: 'main_upper',
        block: 'strength',
        tempo: '2111',
        coaching: {
          progress: 'Form → reps → sets → load (small jumps).',
          regress: 'If reps drop below 5, remove load and rebuild reps.'
        },
        prescription: rx(scaleSets(4), '4-8', restScheme.strength)
      };
    }
    if (max >= 20 && exp !== 'beginner') {
      return {
        baseId: 'push',
        name: 'Archer Push-up / Pseudo Planche Push-up',
        kind: 'main_upper',
        block: 'strength',
        tempo: '2111',
        coaching: {
          progress: 'Form → reps → sets → leverage (lean/ROM) before load.',
          regress: 'If you can’t hold positions for 3s, return to strict push-ups.'
        },
        prescription: rx(scaleSets(4), '4-8', restScheme.strength)
      };
    }
    if (max >= 12) {
      return {
        baseId: 'push',
        name: equip.rings ? 'Ring Push-up (deep)' : 'Decline Push-up',
        kind: 'main_upper',
        block: 'strength',
        tempo: '3111',
        coaching: {
          progress: 'Reps first to the top of range; then add a set; then increase leverage.',
          regress: 'If reps drop below 5, go back to strict push-ups.'
        },
        prescription: rx(scaleSets(4), repScheme.strength, restScheme.strength)
      };
    }
    return {
      baseId: 'push',
      name: 'Strict Push-up',
      kind: 'main_upper',
      block: 'strength',
      tempo: '3111',
      coaching: {
        progress: 'Add reps until top of range, then add a set, then progress the variation.',
        regress: 'If you cannot get 5+ clean reps, use incline.'
      },
      prescription: rx(scaleSets(4), repScheme.strength, restScheme.strength)
    };
  };

  const mainDip = () => {
    const max = Number(b.dips || 0);
    const wantsLoad = goals.includes('strength') && equip.weights && max >= 15 && exp !== 'beginner';
    if (!canDo.dip5) {
      return {
        baseId: 'dip',
        name: 'Assisted Dips / Bench Dips',
        kind: 'main_upper',
        block: 'strength',
        tempo: '3111',
        coaching: {
          progress: 'Build strict 3×8 before moving to parallel-bar dips.',
          regress: 'Shorten ROM or add assistance if reps drop below 5.'
        },
        prescription: rx(scaleSets(3), '6-12', restScheme.strength)
      };
    }
    if (wantsLoad) {
      return {
        baseId: 'dip',
        name: 'Weighted Dips',
        kind: 'main_upper',
        block: 'strength',
        tempo: '2111',
        coaching: {
          progress: 'Reps → sets → load (small jumps).',
          regress: 'If reps fall below 5, remove load.'
        },
        prescription: rx(scaleSets(4), '3-6', restScheme.strength)
      };
    }
    return {
      baseId: 'dip',
      name: equip.rings && max >= 10 && exp !== 'beginner' ? 'Ring Dips' : 'Parallel-Bar Dips',
      kind: 'main_upper',
      block: 'strength',
      tempo: '3111',
      coaching: {
        progress: 'Add reps first; when you hit top of range, add a set, then increase difficulty.',
        regress: 'If you cannot hit 5 clean reps, add assistance.'
      },
      prescription: rx(scaleSets(3), repScheme.strength, restScheme.strength)
    };
  };

  const mainPull = () => {
    const max = Number(b.pullups || 0);
    const wantsLoad = goals.includes('strength') && equip.weights && max >= 12 && exp !== 'beginner';
    if (!canDo.pull5) {
      return {
        baseId: 'pull',
        name: equip.bands ? 'Band-Assisted Pull-up' : 'Eccentric Pull-up (negatives)',
        kind: 'main_upper',
        block: 'strength',
        tempo: equip.bands ? '3111' : '5010',
        coaching: {
          progress: 'Form → reps. Reduce assistance over time until you can do 5 strict reps.',
          regress: 'If you cannot control a 3s lower, use more assistance.'
        },
        prescription: rx(scaleSets(4), '3-6', restScheme.strength)
      };
    }
    if (wantsLoad) {
      return {
        baseId: 'pull',
        name: 'Weighted Pull-up',
        kind: 'main_upper',
        block: 'strength',
        tempo: '2111',
        coaching: {
          progress: 'Reps → sets → load (2.5–5 lb jumps).',
          regress: 'If reps drop below 3–4, remove load and rebuild.'
        },
        prescription: rx(scaleSets(4), '3-6', restScheme.strength)
      };
    }
    if (max >= 15 && exp !== 'beginner') {
      return {
        baseId: 'pull',
        name: 'Chest-to-Bar Pull-up',
        kind: 'main_upper',
        block: 'strength',
        tempo: '2111',
        coaching: {
          progress: 'Increase ROM and strictness before adding load.',
          regress: 'If you can’t get 5 reps, go back to strict pull-ups.'
        },
        prescription: rx(scaleSets(4), '4-8', restScheme.strength)
      };
    }
    return {
      baseId: 'pull',
      name: 'Strict Pull-up',
      kind: 'main_upper',
      block: 'strength',
      tempo: '2111',
      coaching: {
        progress: 'Add reps until top of range, then add a set, then progress leverage/load.',
        regress: 'If reps drop below 5, add a band or reduce sets.'
      },
      prescription: rx(scaleSets(4), repScheme.strength, restScheme.strength)
    };
  };

  const assistRow = () => ({
    baseId: 'row',
    name: equip.rings ? 'Ring Rows' : 'Inverted Rows',
    kind: 'assist_upper',
    block: 'assist',
    tempo: '3111',
    coaching: {
      progress: 'Reps → sets → lever length (feet forward / lower rings).',
      regress: 'Raise the bar/rings if you can’t get 8 reps.'
    },
    prescription: rx(scaleSets(3), repScheme.assist, restScheme.assist)
  });

  const mainLegs = () => {
    const name = exp === 'advanced' ? 'Pistol Squat'
      : exp === 'intermediate' ? 'Box Pistol / Shrimp Squat Progression'
        : 'Bulgarian Split Squat';
    return {
      baseId: 'leg',
      name,
      kind: 'main_lower',
      block: 'strength',
      tempo: '3111',
      coaching: {
        progress: 'Form → reps → sets → leverage before load.',
        regress: 'If you can’t control the bottom, reduce range or add support.'
      },
      prescription: rx(scaleSets(4), exp === 'beginner' ? '8-12/leg' : '6-10/leg', restScheme.strength)
    };
  };

  const assistHinge = () => ({
    baseId: 'hinge',
    name: equip.weights ? 'Single-Leg RDL (loaded)' : 'Hip Hinge (Good Morning / Single-Leg RDL)',
    kind: 'assist_lower',
    block: 'assist',
    tempo: '3111',
    coaching: {
      progress: 'Reps → sets → ROM before load.',
      regress: 'Shorten ROM if back rounds.'
    },
    prescription: rx(scaleSets(3), exp === 'beginner' ? '10-15' : repScheme.assist, restScheme.assist)
  });

  const assistCore = () => {
    const hollow = Number(b.holds?.hollowHoldSec || 0);
    const name = canDo.hold3(hollow) && hollow >= 30 ? 'Hollow Hold (hard)' : canDo.hold3(hollow) ? 'Hollow Hold' : 'Hollow Body Regression';
    return {
      baseId: 'core',
      name,
      kind: 'assist_core',
      block: 'assist',
      tempo: 'isometric',
      coaching: {
        progress: 'Time → lever length. Build to 30–45s holds.',
        regress: 'If you can’t hold 3s, bend knees and tuck.'
      },
      prescription: rx(scaleSets(3), '20-40s', 60)
    };
  };

  const enduranceBlock = () => ({
    baseId: 'endurance',
    name: 'Optional Endurance: EMOM / Density (8–12 min)',
    kind: 'assist_cond',
    block: 'endurance',
    tempo: 'smooth',
    coaching: {
      progress: 'Increase density before adding difficulty.',
      regress: 'If soreness persists, skip this block for 1–2 weeks.'
    },
    prescription: rx(1, '8-12m', 0)
  });

  const pickSkills = () => {
    const hsHold = Number(b.holds?.handstandHoldSec || 0);
    const support = Number(b.holds?.supportHoldSec || 0);
    const hollow = Number(b.holds?.hollowHoldSec || 0);
    const pullups = Number(b.pullups || 0);
    const dips = Number(b.dips || 0);

    const catalog = [
      {
        key: 'handstand',
        baseId: 'skill_handstand',
        name: hsHold >= 20 ? 'Handstand (quality practice)' : hsHold >= 3 ? 'Wall Handstand Hold' : 'Pike Handstand Hold',
        qualifies: true,
        prescription: rx(5, hsHold >= 20 ? '20-40s' : '10-25s', restScheme.skill),
        coaching: {
          progress: 'Quality holds → longer holds → harder variations before adding volume.',
          regress: 'If you can’t hold 3s with form, return to pike holds.'
        }
      },
      {
        key: 'muscle_up',
        baseId: 'skill_muscle_up',
        name: (equip.bar || equip.rings) && pullups >= 10 && dips >= 10 ? 'Muscle-up Practice' : 'Muscle-up Progression (transition drills)',
        qualifies: Boolean(equip.bar || equip.rings),
        prescription: rx(4, (pullups >= 10 && dips >= 10) ? '2-4' : '3-5', restScheme.skill),
        coaching: {
          progress: 'Pull height → transition → dip-out.',
          regress: 'If reps drop below 2, return to transition drills.'
        }
      },
      {
        key: 'l_sit',
        baseId: 'skill_l_sit',
        name: support >= 20 && hollow >= 20 ? 'L-sit Hold' : 'Tuck Sit / Compression Hold',
        qualifies: true,
        prescription: rx(5, '10-25s', restScheme.skill),
        coaching: {
          progress: 'Time → extend one leg → full L.',
          regress: 'If you can’t hold 3s, keep knees tucked.'
        }
      },
      {
        key: 'front_lever',
        baseId: 'skill_front_lever',
        name: pullups >= 8 && (equip.bar || equip.rings) ? 'Tuck Front Lever Holds' : 'Scap + Row Prep (Front Lever)',
        qualifies: Boolean(equip.bar || equip.rings),
        prescription: rx(5, pullups >= 8 ? '8-15s' : '6-10', restScheme.skill),
        coaching: {
          progress: 'Hold time → harder tuck → one-leg → straddle.',
          regress: 'If you can’t hold 3s, return to scap prep.'
        }
      }
    ].filter((s) => s.qualifies);

    const preferred = Array.isArray(b.preferredSkills) && b.preferredSkills.length ? b.preferredSkills : null;
    const preferredEligible = preferred ? catalog.filter((s) => preferred.includes(s.key)) : [];
    const pool = preferredEligible.length ? preferredEligible : catalog;
    const n = goals.includes('skill') ? 2 : 1;
    return pool.slice(0, n);
  };

  const skillBlock = () => pickSkills().map((s) => ({
    baseId: s.baseId,
    name: s.name,
    kind: 'skill',
    block: 'skill',
    tempo: 'quality',
    coaching: s.coaching,
    prescription: s.prescription
  }));

  const dayForPatterns = (label, focus, patterns) => {
    const out = [];
    const warmParts = [];
    if (patterns.includes('push')) warmParts.push('wrists + shoulders');
    if (patterns.includes('pull')) warmParts.push('scap + lats');
    if (patterns.includes('legs')) warmParts.push('hips + ankles');
    out.push(warmup(warmParts.length ? warmParts.join(' + ') : 'full body'));

    out.push(...skillBlock());

    if (patterns.includes('push')) out.push(mainDip(), mainPush());
    if (patterns.includes('pull')) out.push(mainPull(), assistRow());
    if (patterns.includes('legs')) out.push(mainLegs(), assistHinge());

    out.push(assistCore());

    const capacityOk = fatigue !== 'high'
      && goals.includes('endurance')
      && Number(b.pushups || 0) >= 8
      && Number(b.pullups || 0) >= 5
      && Number(b.dips || 0) >= 8;
    if (capacityOk) out.push(enduranceBlock());

    return { label, focus, exercises: out };
  };

  const schedule = (() => {
    // PUSH, PULL, LEGS roughly 2x/week. Combine patterns per day if needed.
    if (d === 2) return [['push', 'pull', 'legs'], ['push', 'pull', 'legs']];
    if (d === 3) return [['push', 'pull'], ['legs', 'push'], ['pull', 'legs']];
    if (d === 4) return [['push', 'pull'], ['legs'], ['push', 'pull'], ['legs']];
    if (d === 5) return [['push', 'pull'], ['legs'], ['push', 'pull'], ['legs'], ['skill']];
    return [['push', 'pull'], ['legs'], ['push', 'pull'], ['legs'], ['push', 'pull'], ['legs']];
  })();

  const days = schedule.map((patterns, idx) => {
    if (patterns.includes('skill')) {
      return {
        label: `Day ${idx + 1}`,
        focus: 'Skill + Recovery',
        exercises: [warmup('shoulders + hips + spine'), ...skillBlock(), assistCore()]
      };
    }
    const hasPush = patterns.includes('push');
    const hasPull = patterns.includes('pull');
    const hasLegs = patterns.includes('legs');
    const focus = hasPush && hasPull ? 'Push + Pull'
      : hasLegs ? 'Legs'
        : hasPush ? 'Push'
          : hasPull ? 'Pull'
            : 'Full Body';
    return dayForPatterns(`Day ${idx + 1}`, focus, patterns);
  });

  return days.slice(0, d);
}

function loadPowerliftingDb() {
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const raw = require('../data/powerlifting-exercises.json');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function resolvePowerliftingFrequenciesV2({ daysPerWeek, eventType } = {}) {
  const freq = resolvePowerliftingFrequencies(daysPerWeek);
  const ev = normalizePowerliftingEventType(eventType);
  if (ev === 'bench_only') {
    // Increase bench by +1 exposure, capped at 4 days/week (never above 4).
    freq.bench = Math.min(4, Number(freq.bench || 0) + 1);
    // Keep squat/deadlift exposures optional and low-fatigue via technique only.
    freq.squat = Math.min(1, Number(freq.squat || 0));
    freq.deadlift = Math.min(1, Number(freq.deadlift || 0));
  }
  return { ...freq, eventType: ev };
}

function buildPowerliftingTemplateV2({ daysPerWeek, experience, eventType } = {}) {
  const d = clampInt(daysPerWeek, 2, 6, 4);
  const exp = normalizeExperience(experience);
  const freq = resolvePowerliftingFrequenciesV2({ daysPerWeek: d, eventType });
  const db = loadPowerliftingDb();

  const maxFatiguePerDay = d >= 5 ? 8 : 7;

  const exposures = [];
  const add = (lift, weeklyRole, intensityType, fatiguePoints, priority) => {
    exposures.push({ lift, weeklyRole, intensityType, fatiguePoints, priority });
  };

  // Bench priority always. Build exposures deterministically by frequency targets.
  add('bench', 'heavy', exp === 'beginner' ? 'strength' : 'heavy_single', 3, 1);
  add('bench', 'volume', 'volume', 2, 3);
  add('bench', 'technique', 'technique', 1, 5);
  if (freq.bench >= 4) add('bench', exp === 'beginner' ? 'volume' : 'performance', exp === 'beginner' ? 'volume' : 'heavy_single', 3, 2);

  if (freq.eventType === 'bench_only') {
    // Bench-only: no heavy squat/deadlift exposures. Only optional light technique work (low fatigue).
    if (freq.squat >= 1) add('squat', 'technique', 'technique', 1, 6);
    if (freq.deadlift >= 1) add('deadlift', 'technique', 'technique', 1, 7);
  } else {
    add('squat', 'heavy', 'strength', 3, 4);
    add('squat', 'volume', 'volume', 3, 6);
    if (freq.squat >= 3) add('squat', 'technique', 'technique', 2, 7);

    add('deadlift', 'heavy', exp === 'beginner' ? 'strength' : 'heavy_single', 3, 8);
    if (freq.deadlift >= 2) add('deadlift', 'volume', 'volume', 2, 9);
  }

  exposures.sort((a, b) => (a.priority - b.priority) || String(a.lift).localeCompare(String(b.lift), 'en'));

  const days = Array.from({ length: d }, (_, i) => ({
    label: `Day ${i + 1}`,
    focus: '',
    fatigue: 0,
    exposures: []
  }));

  const placeExposure = (ex) => {
    // Greedy: place on lowest-fatigue day that can fit and avoids stacking squat+deadlift heavies together.
    const candidates = days
      .map((day, idx) => ({ day, idx }))
      .filter(({ day }) => (day.fatigue + ex.fatiguePoints) <= maxFatiguePerDay)
      // Prefer spreading the same lift across different days (e.g., bench frequency).
      .map(({ day, idx }) => ({ day, idx, hasSameLift: day.exposures.some((e) => e.lift === ex.lift) }))
      .filter(({ day }) => {
        if (ex.intensityType !== 'heavy_single' && ex.weeklyRole !== 'heavy') return true;
        const hasHeavyLower = day.exposures.some((e) => (e.lift === 'squat' || e.lift === 'deadlift') && (e.weeklyRole === 'heavy' || e.intensityType === 'heavy_single'));
        const isLowerHeavy = (ex.lift === 'squat' || ex.lift === 'deadlift') && (ex.weeklyRole === 'heavy' || ex.intensityType === 'heavy_single');
        return !(hasHeavyLower && isLowerHeavy);
      })
      .sort((a, b) => (Number(a.hasSameLift) - Number(b.hasSameLift)) || (a.day.fatigue - b.day.fatigue) || (a.idx - b.idx));

    const target = candidates[0]?.day || days.reduce((best, cur) => (cur.fatigue < best.fatigue ? cur : best), days[0]);
    target.exposures.push(ex);
    target.fatigue += ex.fatiguePoints;
  };

  exposures.forEach(placeExposure);

  const nameForLift = (lift) => lift === 'bench' ? 'Bench' : lift === 'squat' ? 'Squat' : 'Deadlift';
  for (const day of days) {
    const lifts = Array.from(new Set(day.exposures.map((e) => e.lift)));
    day.focus = lifts.length ? lifts.map(nameForLift).join(' + ') : 'Full body';
  }

  const findExercise = (lift, intensityType, weeklyRole) => {
    const candidates = db.filter((row) => {
      if (!row || typeof row !== 'object') return false;
      const rowLift = String(row.lift || '').trim().toLowerCase();
      const it = String(row.intensity_type || '').trim().toLowerCase();
      if (rowLift !== lift) return false;
      if (it !== intensityType) return false;
      if (!meetsExperienceMin(exp, row.experience_min)) return false;
      return true;
    });

    // Preference: competition_specific on heavy/performance, technique category on technique days.
    const desiredCategory = weeklyRole === 'technique' ? 'technique' : (weeklyRole === 'heavy' || weeklyRole === 'performance') ? 'competition_specific' : null;
    const filtered = desiredCategory
      ? candidates.filter((c) => String(c.category || '').trim().toLowerCase() === desiredCategory)
      : candidates;

    return pickDeterministic(filtered.length ? filtered : candidates, (x) => x.id) || null;
  };

  const accessoryPool = db.filter((row) => {
    if (!row || typeof row !== 'object') return false;
    const cat = String(row.category || '').trim().toLowerCase();
    if (cat !== 'accessory') return false;
    if (!meetsExperienceMin(exp, row.experience_min)) return false;
    return true;
  });

  const accessoryByLift = (liftHint) => {
    const mapped = accessoryPool.filter((x) => {
      const l = String(x.lift || '').trim().toLowerCase();
      if (liftHint === 'upper') return l === 'upper';
      if (liftHint === 'lower') return l === 'lower';
      if (liftHint === 'core') return l === 'core';
      return true;
    });
    return pickDeterministic(mapped, (x) => x.id) || pickDeterministic(accessoryPool, (x) => x.id);
  };

  return days.map((day) => {
    const exercises = [];

    for (const ex of day.exposures) {
      const chosen = findExercise(ex.lift, ex.intensityType, ex.weeklyRole);
      if (!chosen) continue;
      exercises.push({
        baseId: String(chosen.id),
        name: String(chosen.name),
        kind: ex.lift === 'bench' ? 'main_upper' : 'main_lower',
        powerlifting: {
          lift: ex.lift,
          weeklyRole: ex.weeklyRole,
          intensityType: ex.intensityType,
          fatigueCost: chosen.fatigue_cost,
          skillRequirement: chosen.skill_requirement,
          percentageRange: chosen.percentage_range,
          repRange: chosen.rep_range,
          rpeRange: chosen.rpe_range,
          category: chosen.category
        }
      });
    }

    // Accessories: 2 slots (upper pull + core) by default; 3 on 5-6 day plans.
    const accessorySlots = d >= 5 ? 3 : 2;
    const upper = accessoryByLift('upper');
    const core = accessoryByLift('core');
    const lower = accessoryByLift('lower');
    const acc = [upper, core, d >= 5 ? lower : null].filter(Boolean).slice(0, accessorySlots);
    for (const a of acc) {
      exercises.push({
        baseId: String(a.id),
        name: String(a.name),
        kind: a.lift === 'core' ? 'assist_core' : (a.lift === 'lower' ? 'assist_lower' : 'assist_upper'),
        powerlifting: {
          lift: String(a.lift || '').toLowerCase(),
          weeklyRole: 'accessory',
          intensityType: 'accessory',
          fatigueCost: a.fatigue_cost,
          skillRequirement: a.skill_requirement,
          percentageRange: a.percentage_range,
          repRange: a.rep_range,
          rpeRange: a.rpe_range,
          category: a.category
        }
      });
    }

    return { label: day.label, focus: day.focus, exercises };
  });
}

function prescribing(discipline, exerciseKind, weekMeta, experience, exercise) {
  const exp = normalizeExperience(experience);

  if (discipline === 'powerlifting') {
    const pl = exercise?.powerlifting && typeof exercise.powerlifting === 'object' ? exercise.powerlifting : null;
    const intensityType = String(pl?.intensityType || '').trim().toLowerCase() || null;
    const range = Array.isArray(pl?.percentageRange) ? pl.percentageRange : null;
    const delta = Number(weekMeta?.pl?.delta || 0);
    const deload = Boolean(weekMeta?.pl?.deload);
    const deloadPct = chooseDeloadPct();

    const maxIntensity = exp === 'advanced' ? 0.95 : exp === 'intermediate' ? 0.92 : 0.88;
    const clampPct = (p) => Math.max(0.50, Math.min(maxIntensity, p));
    const pctMid = (lo, hi) => (Number.isFinite(lo) && Number.isFinite(hi) ? (lo + hi) / 2 : null);

    const repRange = Array.isArray(pl?.repRange) ? pl.repRange : null;
    const repsFromRange = repRange && repRange.length === 2
      ? `${Math.max(1, Number(repRange[0]) || 1)}-${Math.max(1, Number(repRange[1]) || 1)}`
      : null;

    if (intensityType === 'heavy_single') {
      const lo = Number(range?.[0] ?? 0.88);
      const hi = Number(range?.[1] ?? 0.93);
      const pctBase = clampPct((pctMid(lo, hi) ?? 0.90) + delta);
      const pct = deload ? clampPct(pctBase * deloadPct.loadMult) : pctBase;
      const setsBase = exp === 'advanced' ? 3 : 2;
      const sets = deload ? Math.max(1, Math.round(setsBase * deloadPct.setMult)) : setsBase;
      return { sets, reps: '1', restSec: 240, pct };
    }

    if (intensityType === 'strength') {
      const lo = Number(range?.[0] ?? 0.75);
      const hi = Number(range?.[1] ?? 0.85);
      const pctBase = clampPct((pctMid(lo, hi) ?? 0.80) + delta);
      const pct = deload ? clampPct(pctBase * deloadPct.loadMult) : pctBase;
      const setsBase = 4;
      const sets = deload ? Math.max(1, Math.round(setsBase * deloadPct.setMult)) : setsBase;
      return { sets, reps: repRange ? String(Math.min(5, Math.max(3, Number(repRange[1]) || 5))) : '4', restSec: 210, pct };
    }

    if (intensityType === 'volume') {
      const lo = Number(range?.[0] ?? 0.62);
      const hi = Number(range?.[1] ?? 0.75);
      const pctBase = clampPct((pctMid(lo, hi) ?? 0.70) + delta);
      const pct = deload ? clampPct(pctBase * deloadPct.loadMult) : pctBase;
      const setsBase = 4;
      const sets = deload ? Math.max(1, Math.round(setsBase * deloadPct.setMult)) : setsBase;
      return { sets, reps: repsFromRange || '6-8', restSec: 150, pct };
    }

    if (intensityType === 'technique') {
      const lo = Number(range?.[0] ?? 0.60);
      const hi = Number(range?.[1] ?? 0.72);
      const pctBase = clampPct((pctMid(lo, hi) ?? 0.66) + delta);
      const pct = deload ? clampPct(pctBase * deloadPct.loadMult) : pctBase;
      const setsBase = 3;
      const sets = deload ? Math.max(1, Math.round(setsBase * deloadPct.setMult)) : setsBase;
      return { sets, reps: repsFromRange || '3', restSec: 150, pct };
    }

    // Accessories: no % prescription.
    if (exerciseKind === 'assist_lower') return { sets: 3, reps: exp === 'advanced' ? '8-12' : '10-12', restSec: 120, pct: null };
    if (exerciseKind === 'assist_upper') return { sets: 3, reps: exp === 'advanced' ? '8-12' : '10-15', restSec: 90, pct: null };
    if (exerciseKind === 'assist_core') return { sets: 3, reps: '10-15', restSec: 60, pct: null };
    return { sets: 3, reps: '10-15', restSec: 90, pct: null };
  }

  if (discipline === 'bodybuilding') {
    const deload = weekMeta?.repBias === 'deload';
    const isBeginner = exp === 'beginner';
    const stimulus = String(exercise?.stimulusType || '').toLowerCase() || (exerciseKind || '').includes('main') ? 'compound' : 'isolation';
    const isCompound = stimulus === 'compound';
    const compoundPctFromReps = (reps) => {
      const rr = parseRepRange(reps);
      const hi = rr?.max ?? null;
      if (!hi) return 0.72;
      if (hi <= 6) return 0.78;
      if (hi <= 8) return 0.75;
      if (hi <= 10) return 0.72;
      return 0.70;
    };
    if (isCompound) {
      const reps = deload ? '8-10' : '6-10';
      const pct = compoundPctFromReps(reps);
      if (isBeginner) return { sets: deload ? 2 : 3, reps, restSec: 150, pct };
      return { sets: deload ? 3 : 4, reps, restSec: 150, pct };
    }
    if (isBeginner) return { sets: deload ? 1 : 2, reps: deload ? '10-12' : '12-20', restSec: 75, pct: 0.60 };
    return { sets: deload ? 2 : 3, reps: deload ? '10-12' : '10-20', restSec: 75, pct: 0.65 };
  }

  const deload = weekMeta?.repBias === 'deload';
  if (exerciseKind === 'skill') return { sets: deload ? 2 : 3, reps: '10-15m', restSec: 60, pct: null };
  if (exerciseKind === 'assist_cond') return { sets: 1, reps: deload ? '15-20m' : '20-30m', restSec: 0, pct: null };
  if (exerciseKind === 'assist_mob') return { sets: 1, reps: deload ? '8-10m' : '10-15m', restSec: 0, pct: null };
  if (exerciseKind === 'main_lower') return { sets: deload ? 2 : 4, reps: deload ? '8-10' : '6-12', restSec: 90, pct: null };
  return { sets: deload ? 2 : 4, reps: deload ? '8-12' : '6-12', restSec: 90, pct: null };
}

function estimateStrengthBaselines(input) {
  const discipline = String(input?.discipline || '').trim().toLowerCase();
  const experience = normalizeExperience(input?.experience);

  if (discipline === 'powerlifting') {
    const squat = lbs(input?.strength?.squat);
    const bench = lbs(input?.strength?.bench);
    const deadlift = lbs(input?.strength?.deadlift);
    const squatAdj = squat ? squat * recencyFactor(input?.strength?.squatDate) : null;
    const benchAdj = bench ? bench * recencyFactor(input?.strength?.benchDate) : null;
    const deadliftAdj = deadlift ? deadlift * recencyFactor(input?.strength?.deadliftDate) : null;
    const tmFactor = 0.9;
    return {
      squat1rm: squatAdj ? roundTo(squatAdj, 5) : squat,
      bench1rm: benchAdj ? roundTo(benchAdj, 2.5) : bench,
      deadlift1rm: deadliftAdj ? roundTo(deadliftAdj, 5) : deadlift,
      trainingMax: {
        squat: squatAdj ? roundTo(squatAdj * tmFactor, 5) : (squat ? roundTo(squat * tmFactor, 5) : null),
        bench: benchAdj ? roundTo(benchAdj * tmFactor, 2.5) : (bench ? roundTo(bench * tmFactor, 2.5) : null),
        deadlift: deadliftAdj ? roundTo(deadliftAdj * tmFactor, 5) : (deadlift ? roundTo(deadlift * tmFactor, 5) : null)
      },
      experience
    };
  }

  if (discipline === 'bodybuilding') {
    const hasV2 = input?.strength?.benchWeight != null || input?.strength?.lowerWeight != null || input?.strength?.hingeWeight != null;
    const bw = lbs(input?.strength?.bodyweight);
    const height = clampInt(input?.strength?.height, 36, 96, null);
    const trainingAgeYears = experience === 'advanced'
      ? 6
      : experience === 'intermediate'
        ? 3
        : 1;
    const goalMode = String(input?.strength?.goalMode || '').trim().toLowerCase() || null;
    const injury = input?.strength?.injury && typeof input.strength.injury === 'object' ? input.strength.injury : null;
    const phase = String(input?.strength?.phase || input?.phase || '').trim().toLowerCase() || null;
    const targetWeightLb = Number(input?.strength?.targetWeightLb ?? input?.targetWeightLb);
    const trainingAgeBucket = trainingAgeBand(input?.strength?.trainingAgeBucket || input?.trainingAgeBucket);
    const timePerSession = String(input?.strength?.timePerSession || input?.timePerSession || '').trim().toLowerCase() || null;
    const equipmentStylePref = String(input?.strength?.equipmentStylePref || input?.equipmentStylePref || 'mix').trim().toLowerCase();
    const emphasis = normalizeEmphasisList(input?.strength?.emphasis || input?.emphasis);
    const injurySeverityByJoint = input?.strength?.injurySeverityByJoint && typeof input.strength.injurySeverityByJoint === 'object'
      ? input.strength.injurySeverityByJoint
      : {};

    let press1rm = null;
    let pull1rm = null;
    let leg1rm = null;
    let hinge1rm = null;
    let pullBaselineConfidence = 'low';
    const workingWeights = {
      press: lbs(input?.strength?.benchWeight),
      pull: lbs(input?.strength?.pullWeight),
      lower: lbs(input?.strength?.lowerWeight),
      hinge: lbs(input?.strength?.hingeWeight)
    };

    if (hasV2) {
      const bench1rmRaw = epley1rm(input?.strength?.benchWeight, input?.strength?.benchReps);
      const lower1rmRaw = epley1rm(input?.strength?.lowerWeight, input?.strength?.lowerReps);
      const hinge1rmRaw = epley1rm(input?.strength?.hingeWeight, input?.strength?.hingeReps);
      press1rm = bench1rmRaw ? roundTo(bench1rmRaw, 5) : null;
      hinge1rm = hinge1rmRaw ? roundTo(hinge1rmRaw, 5) : null;
      const legProxy = Math.max(Number(lower1rmRaw || 0), Number(hinge1rmRaw || 0) * 0.9);
      leg1rm = legProxy > 0 ? roundTo(legProxy, 5) : null;
      pull1rm = press1rm ? roundTo(press1rm * 0.9, 5) : null;
      const pullAnchor = epley1rm(input?.strength?.pullWeight, input?.strength?.pullReps);
      if (pullAnchor) {
        pull1rm = roundTo(pullAnchor, 5);
        pullBaselineConfidence = 'high';
      }
    } else {
      const press1rmRaw = epley1rm(input?.strength?.pressWeight, input?.strength?.pressReps);
      const pull1rmRaw = epley1rm(input?.strength?.pullWeight, input?.strength?.pullReps);
      const leg1rmRaw = epley1rm(input?.strength?.legWeight, input?.strength?.legReps);
      press1rm = press1rmRaw ? press1rmRaw * recencyFactor(input?.strength?.pressDate) : null;
      pull1rm = pull1rmRaw ? pull1rmRaw * recencyFactor(input?.strength?.pullDate) : null;
      leg1rm = leg1rmRaw ? leg1rmRaw * recencyFactor(input?.strength?.legDate) : null;
      press1rm = press1rm ? roundTo(press1rm, 5) : null;
      pull1rm = pull1rm ? roundTo(pull1rm, 5) : null;
      leg1rm = leg1rm ? roundTo(leg1rm, 5) : null;
    }

      return {
        bodyweight: bw,
        heightIn: height,
        trainingAgeYears,
        trainingAgeBucket,
        timePerSession,
        phase,
        targetWeightLb: Number.isFinite(targetWeightLb) ? targetWeightLb : null,
        equipmentStylePref,
        emphasis,
        injurySeverityByJoint,
        pullBaselineConfidence,
        goalMode,
        injury,
        press1rm,
        pull1rm,
        leg1rm,
        hinge1rm,
        workingWeights,
        experience
      };
  }

  if (discipline === 'calisthenics') {
    const normalizeGoalList = (raw) => {
      const src = Array.isArray(raw) ? raw : (typeof raw === 'string' ? raw.split(',') : []);
      const out = [];
      for (const x of src) {
        const v = String(x || '').trim().toLowerCase();
        if (!v) continue;
        const mapped = v === 'hypertrophy' ? 'hypertrophy'
          : v === 'strength' ? 'strength'
            : v === 'endurance' ? 'endurance'
              : v === 'skill' || v === 'skills' ? 'skill'
                : null;
        if (!mapped) continue;
        if (!out.includes(mapped)) out.push(mapped);
      }
      return out;
    };

    const normalizeEquipment = (raw) => {
      const src = raw && typeof raw === 'object' ? raw : {};
      const keys = ['bar', 'rings', 'bands', 'weights', 'none'];
      const out = {};
      keys.forEach((k) => { out[k] = Boolean(src[k]); });
      if (!Object.values(out).some(Boolean)) out.none = true;
      if (out.none) {
        out.bar = false;
        out.rings = false;
        out.bands = false;
        out.weights = false;
      }
      return out;
    };

    const normalizePreferredSkills = (raw) => {
      const src = Array.isArray(raw) ? raw : [];
      const out = [];
      for (const x of src) {
        const v = String(x || '').trim().toLowerCase();
        if (!v) continue;
        const mapped = v === 'handstand' ? 'handstand'
          : (v === 'muscleup' || v === 'muscle_up' || v === 'muscle-up') ? 'muscle_up'
            : (v === 'l_sit' || v === 'l-sit' || v === 'lsit') ? 'l_sit'
              : (v === 'front_lever' || v === 'front-lever' || v === 'frontlever') ? 'front_lever'
                : (v === 'planche') ? 'planche'
                  : null;
        if (!mapped) continue;
        if (!out.includes(mapped)) out.push(mapped);
      }
      return out.slice(0, 6);
    };

    const fatigueRaw = String(input?.strength?.fatigue || '').trim().toLowerCase();
    const fatigue = fatigueRaw === 'high' ? 'high' : fatigueRaw === 'medium' ? 'medium' : fatigueRaw === 'low' ? 'low' : null;

    return {
      pushups: clampInt(input?.strength?.pushups, 0, 300, 0),
      pullups: clampInt(input?.strength?.pullups, 0, 100, 0),
      dips: clampInt(input?.strength?.dips, 0, 200, 0),
      holds: {
        hollowHoldSec: clampNumber(input?.strength?.hollowHoldSec, 0, 600, null),
        supportHoldSec: clampNumber(input?.strength?.supportHoldSec, 0, 600, null),
        handstandHoldSec: clampNumber(input?.strength?.handstandHoldSec, 0, 600, null)
      },
      equipment: normalizeEquipment(input?.strength?.equipment),
      goals: normalizeGoalList(input?.strength?.goals),
      fatigue,
      preferredSkills: normalizePreferredSkills(input?.strength?.preferredSkills),
      skills: {
        handstand: Boolean(input?.strength?.handstand),
        muscleUp: Boolean(input?.strength?.muscleUp)
      },
      experience
    };
  }

  return { experience };
}

function projectedForExercise({ discipline, exercise, exerciseKind, baselines, prescription, weekIndex }) {
  if (discipline === 'powerlifting') {
    const inc = exercise.baseId === 'bench' || exercise.baseId.startsWith('bench') ? 2.5 : 5;
    const tms = baselines?.trainingMax || {};
    const tm = exercise.baseId.includes('squat') ? tms.squat
      : exercise.baseId.includes('dead') ? tms.deadlift
        : exercise.baseId.includes('bench') ? tms.bench
          : null;
    if (prescription?.pct && tm) return { value: pctOfTrainingMax(tm, prescription.pct, inc), unit: 'lb' };
    return { value: null, unit: 'lb' };
  }

  if (discipline === 'bodybuilding') {
    const kind = String(exerciseKind || '').toLowerCase();
    const stimulus = String(exercise?.stimulusType || '').toLowerCase();
    if (stimulus === 'isolation') return { value: null, unit: 'lb', confidence: 'low' };
    const movement = String(exercise?.movementPattern || '').toLowerCase();
    const key = movement === 'squat' || movement === 'hinge'
      ? 'leg1rm'
      : (movement === 'row' || movement === 'vertical_pull')
        ? 'pull1rm'
        : 'press1rm';
    const est = Number(baselines?.[key]);
    const pullConf = String(baselines?.pullBaselineConfidence || 'low').toLowerCase();
    const confidence = key === 'pull1rm' && pullConf === 'low' ? 'low' : 'high';
    if (Number.isFinite(est) && est > 0 && prescription?.pct) {
      const inc = key === 'leg1rm' ? 5 : 2.5;
      const bump = weekIndex >= 1 && weekIndex <= 2 ? 1.015 : 1;
      let value = roundTo(est * Number(prescription.pct) * bump, inc);
      const cap = Math.min(est, est * 0.85);
      if (Number.isFinite(value)) value = Math.min(value, cap);
      if (Number.isFinite(value)) value = Math.max(5, value);
      const ww = baselines?.workingWeights && typeof baselines.workingWeights === 'object' ? baselines.workingWeights : {};
      const clampWeight = key === 'press1rm'
        ? ww.press
        : key === 'pull1rm'
          ? ww.pull
          : (movement === 'hinge' ? ww.hinge : ww.lower);
      if (Number.isFinite(clampWeight) && clampWeight > 0 && Number.isFinite(value)) {
        value = Math.min(value, clampWeight * 1.25);
      }
      return { value: Number.isFinite(value) ? value : null, unit: 'lb', confidence };
    }
    return { value: null, unit: 'lb', confidence };
  }

  if (discipline === 'calisthenics') {
    const pullups = baselines?.pullups || 0;
    const dips = baselines?.dips || 0;
    const equip = baselines?.equipment && typeof baselines.equipment === 'object' ? baselines.equipment : {};
    const hasWeights = Boolean(equip.weights);
    if (exercise.baseId.includes('pull') && pullups >= 12 && hasWeights) return { value: 10, unit: 'lb', note: 'Add load' };
    if (exercise.baseId.includes('dip') && dips >= 15 && hasWeights) return { value: 15, unit: 'lb', note: 'Add load' };
    return { value: null, unit: 'bw', note: 'Bodyweight' };
  }

  return { value: null, unit: 'lb' };
}

function generatePlan(input) {
  const discipline = String(input?.discipline || '').trim().toLowerCase();
  if (!['powerlifting', 'bodybuilding', 'calisthenics'].includes(discipline)) {
    throw new Error('Invalid discipline');
  }

  const daysPerWeek = clampInt(input?.daysPerWeek, 2, 6, 3);
  const experience = normalizeExperience(input?.experience);
  const baselines = estimateStrengthBaselines({ discipline, strength: input?.strength, experience });
  const weeksMeta = weekProgressionPattern(discipline, experience);

  const powerliftingEventType = discipline === 'powerlifting'
    ? normalizePowerliftingEventType(input?.strength?.eventType)
    : null;
  const powerliftingSeedDeloadWeeks = discipline === 'powerlifting'
    ? weeksMeta
      .map((wm, idx) => (wm?.pl?.deload ? idx + 1 : null))
      .filter((n) => Number.isFinite(Number(n)) && Number(n) > 0)
    : [];

  const template = discipline === 'powerlifting'
    ? (buildPowerliftingTemplateV2({ daysPerWeek, experience, eventType: powerliftingEventType }) || buildPowerliftingTemplate(daysPerWeek))
    : discipline === 'bodybuilding'
      ? buildBodybuildingTemplate(daysPerWeek)
      : buildCalisthenicsTemplate(daysPerWeek, baselines);

  const bodybuildingMeta = discipline === 'bodybuilding'
    ? {
      phase: String(input?.strength?.phase || input?.phase || 'bulk').trim().toLowerCase(),
      targetWeightLb: Number(input?.strength?.targetWeightLb ?? input?.targetWeightLb) || null,
      trainingAgeBucket: trainingAgeBand(input?.strength?.trainingAgeBucket || input?.trainingAgeBucket),
      timePerSession: String(input?.strength?.timePerSession || input?.timePerSession || '').trim().toLowerCase(),
      equipmentStylePref: String(input?.strength?.equipmentStylePref || input?.equipmentStylePref || 'mix').trim().toLowerCase(),
      emphasis: normalizeEmphasisList(input?.strength?.emphasis || input?.emphasis),
      injuryProfile: input?.strength?.injurySeverityByJoint && typeof input.strength.injurySeverityByJoint === 'object'
        ? input.strength.injurySeverityByJoint
        : {},
      equipmentAccess: input?.equipmentAccess || input?.strength?.equipmentAccess || {}
    }
    : null;

  const defaults = experienceDefaults(experience);

  const bbTargets = discipline === 'bodybuilding'
    ? computeVolumeTargets({
      trainingAgeBucket: bodybuildingMeta?.trainingAgeBucket,
      emphasis: bodybuildingMeta?.emphasis,
      phase: bodybuildingMeta?.phase
    })
    : null;
  const bbWseBudget = discipline === 'bodybuilding'
    ? wseBudgetForPlan({ timePerSession: bodybuildingMeta?.timePerSession, daysPerWeek })
    : null;

  const weeks = weeksMeta.map((wm, weekIndex) => {
    const usedWeek = new Set();
    const weekMuscleTally = {};
    for (const m of MUSCLE_KEYS) weekMuscleTally[m] = 0;
    const days = template.map((day, dayIndex) => {
      if (discipline !== 'bodybuilding') {
        const exercises = [];
        for (const ex of day.exercises || []) {
          const templateRx = discipline === 'calisthenics' && ex?.prescription && typeof ex.prescription === 'object' ? ex.prescription : null;
          const prescription = templateRx || prescribing(discipline, ex.kind, wm, experience, ex);
          const projected = projectedForExercise({
            discipline,
            exercise: ex,
            exerciseKind: ex.kind,
            baselines,
            prescription,
            weekIndex
          });
          const baseId = String(ex.baseId);
          const increment = baseId.includes('bench') || baseId.includes('press') ? defaults.mainIncUpper : defaults.mainIncLower;

          exercises.push({
            id: `${baseId}:${weekIndex + 1}:${dayIndex + 1}:${exercises.length + 1}`,
            baseId,
            exerciseId: null,
            name: ex.name,
            sets: prescription.sets,
            reps: prescription.reps,
            restSec: prescription.restSec,
            projected,
            block: ex?.block || null,
            tempo: ex?.tempo || null,
            coaching: ex?.coaching && typeof ex.coaching === 'object' ? ex.coaching : null,
            tags: discipline === 'powerlifting'
              ? (ex.powerlifting && typeof ex.powerlifting === 'object' ? ex.powerlifting : null)
              : null,
            substitutions: exerciseSubstitutions({ discipline, baseId }),
            progression: (() => {
              if (discipline === 'calisthenics') {
                const rr = parseRepRange(prescription.reps);
                const repsTarget = rr ? rr.max : null;
                return { type: 'reps', repsTarget, technique: 'none' };
              }
              return { type: 'load', increment };
            })()
          });
        }
        return {
          id: `day:${weekIndex + 1}:${dayIndex + 1}`,
          label: day.label,
          focus: day.focus,
          exercises
        };
      }

      let usedWeekTemp = null;
      const buildBodybuildingDay = (strictMode) => {
        const usedDay = new Set();
        const daySignatureSet = new Set();
        const dayIntentSet = new Set();
        let dayLeverageCount = 0;
        const muscleTally = {};
        for (const m of MUSCLE_KEYS) muscleTally[m] = 0;
        const exercises = [];

        for (let slotIndex = 0; slotIndex < (day.exercises || []).length; slotIndex += 1) {
          const slot = (day.exercises || [])[slotIndex];
          let slotIntent = chooseIntentForInjury(String(slot.intentKey), bodybuildingMeta?.injuryProfile || {});
          let slotMuscles = Array.isArray(slot.muscleKeys) ? slot.muscleKeys.slice() : [];
          let searchHintOverride = null;
          const requiredGroup = intentGroupForSlot(slotIntent, day.focus);
          const focus = String(day.focus || '').toLowerCase();
          const isLower = focus.includes('legs') || focus.includes('lower');
          const isPullDay = focus.includes('pull') && !focus.includes('lower');

          if (focus.includes('push') && slotIndex === 0) {
            slotIntent = 'chest_press_horizontal_compound';
          }
          if (isPullDay && slotIndex === 0) {
            slotIntent = 'lats_vertical_pull_compound';
          }
          if (isLower && slotIndex === 0) {
            slotIntent = 'quads_knee_dominant_compound';
          }
          const requiredPlaced = dayIntentSet.has('chest_press_horizontal_compound')
            || dayIntentSet.has('chest_press_incline_compound')
            || dayIntentSet.has('lats_vertical_pull_compound')
            || dayIntentSet.has('upperBack_horizontal_row_compound')
            || dayIntentSet.has('quads_knee_dominant_compound')
            || dayIntentSet.has('hamstrings_hip_hinge_compound');
          const isIsolationSlot = String(slot.stimulusType || '').toLowerCase() === 'isolation'
            || String(slot.intentKey || '').includes('calves')
            || String(slot.intentKey || '').includes('abs');
          if (!requiredPlaced && isIsolationSlot) {
            if (focus.includes('push')) slotIntent = 'chest_press_incline_compound';
            else if (isPullDay) slotIntent = 'upperBack_horizontal_row_compound';
            else if (isLower) slotIntent = 'hamstrings_hip_hinge_compound';
          }

          if (slotIntent === 'accessory_flex') {
            const avoid = slotMuscles.slice();
            const pickMuscle = chooseAccessoryFlexMuscle({
              targets: bbTargets,
              weekTally: weekMuscleTally,
              dayTally: muscleTally,
              avoid
            });
            slotMuscles = [pickMuscle];
            searchHintOverride = ACCESSORY_FLEX_HINTS[pickMuscle] || null;
          }

          const supersetId = slotIntent === 'arms_superset_isolation'
            ? `ss:${weekIndex + 1}:${dayIndex + 1}:${slot.slotId}`
            : null;

          const buildExercise = (intentKey, muscleKeys, hintOverride) => {
            const intentSlot = { ...slot, intentKey, muscleKeys };
            const selection = selectExerciseForIntent({
              intentKey,
              slot: intentSlot,
              equipmentAccess: bodybuildingMeta?.equipmentAccess || {},
              equipmentStylePref: bodybuildingMeta?.equipmentStylePref || 'mix',
              usedDay,
              usedWeek: usedWeekTemp,
              allowWeekRepeat: Boolean(slot.foundationFlag),
              searchHintOverride: hintOverride,
              daySignatureSet,
              dayIntentSet,
              strict: strictMode,
              injuryProfile: bodybuildingMeta?.injuryProfile || {},
              dayLeverageCount
            });

            if (!selection.exerciseId && requiredGroup && requiredGroup.includes(intentKey)) {
              const relaxedSlot = { ...intentSlot, allowedEquipmentClass: ['any'] };
              const relaxedPick = selectExerciseForIntent({
                intentKey,
                slot: relaxedSlot,
                equipmentAccess: bodybuildingMeta?.equipmentAccess || {},
                equipmentStylePref: bodybuildingMeta?.equipmentStylePref || 'mix',
                usedDay,
                usedWeek: usedWeekTemp,
                allowWeekRepeat: Boolean(slot.foundationFlag),
                searchHintOverride: hintOverride,
                daySignatureSet,
                dayIntentSet,
                strict: strictMode,
                injuryProfile: bodybuildingMeta?.injuryProfile || {},
                dayLeverageCount
              });
              if (relaxedPick.exerciseId) {
                selection.exerciseId = relaxedPick.exerciseId;
                selection.swapCandidates = relaxedPick.swapCandidates;
                selection.equipmentClass = relaxedPick.equipmentClass;
              }
            }

            const def = INTENT_DEFS[intentKey] || {};
            const exerciseKind = def.stimulusType === 'compound' ? 'main_upper' : 'assist_upper';
            const prescription = prescribing(discipline, exerciseKind, wm, experience, { ...intentSlot, stimulusType: def.stimulusType || slot.stimulusType });
            const projected = projectedForExercise({
              discipline,
              exercise: intentSlot,
              exerciseKind,
              baselines,
              prescription,
              weekIndex
            });
            let projectedFinal = projected;
            if (discipline === 'bodybuilding' && selection.exerciseId) {
              const entry = getExerciseById(selection.exerciseId);
              const eqClass = entry ? equipmentClass(entry) : null;
              const mech = String(entry?.mechanic || '').toLowerCase();
              const name = String(entry?.name || '').toLowerCase();
              const cat = String(entry?.category || '').toLowerCase();
              if (/(stretch|mobility|warmup|activation|rehab|therapy|prehab)/.test(name)
                || /(stretch|mobility|warmup)/.test(cat)
                || /(stretch|mobility|warmup)/.test(mech)) {
                projectedFinal = { value: null, unit: 'lb', confidence: 'low' };
              } else if (!['barbell', 'dumbbell'].includes(eqClass) || (!mech.includes('compound') && !mech.includes('isolation'))) {
                projectedFinal = { value: null, unit: 'lb', confidence: 'low' };
              }
            }

            const increment = (muscleKeys || []).some((m) => ['quads', 'hamstrings', 'glutes'].includes(m))
              ? defaults.mainIncLower
              : defaults.mainIncUpper;

            const eqClass = selection.equipmentClass || null;
            const signature = signatureForSlot(slot.movementPattern, muscleKeys || slot.muscleKeys || [], eqClass);
            const out = {
              id: `${intentKey}:${weekIndex + 1}:${dayIndex + 1}:${exercises.length + 1}`,
              baseId: intentKey,
              exerciseId: selection.exerciseId,
              name: intentKey,
              slotId: slot.slotId,
              intentKey,
              muscleKeys: muscleKeys || slot.muscleKeys || [],
              movementPattern: slot.movementPattern,
              stimulusType: def.stimulusType || slot.stimulusType,
              foundationFlag: Boolean(slot.foundationFlag),
              allowedEquipmentClass: slot.allowedEquipmentClass || ['any'],
              equipmentClass: eqClass,
              signature,
              sets: prescription.sets,
              reps: prescription.reps,
              restSec: prescription.restSec,
              projected: projectedFinal,
              blockType: supersetId ? 'superset' : 'single',
              supersetId,
              swapCandidates: selection.swapCandidates || [],
              coaching: null,
              tags: null,
              substitutions: [],
              progression: (() => {
                const rr = parseRepRange(prescription.reps);
                const repsTarget = rr ? (experience === 'beginner' ? rr.max : rr.min) : null;
                return { type: 'load', increment, repsTarget, technique: 'none', setsCap: 6 };
              })()
            };
            for (const mk of out.muscleKeys || []) {
              muscleTally[mk] = (muscleTally[mk] || 0) + (Number(out.sets) || 0);
            }
            if (out.exerciseId && out.signature) daySignatureSet.add(out.signature);
            if (selection.isLeverage) dayLeverageCount += 1;
            return out;
          };

          if (slotIntent === 'arms_superset_isolation') {
            exercises.push(buildExercise('biceps_curl_isolation', ['biceps']));
            exercises.push(buildExercise('triceps_extension_isolation', ['triceps']));
          } else {
            let intentCandidates = [slotIntent];
            if (requiredGroup) {
              const ordered = [slotIntent, ...requiredGroup];
              intentCandidates = Array.from(new Set(ordered));
            } else {
              const neighbors = INTENT_NEIGHBORS[slotIntent] || [];
              intentCandidates = Array.from(new Set([slotIntent, ...neighbors]));
            }

            if (isPullDay && slotIndex === 1) {
              const needRow = !dayIntentSet.has('upperBack_horizontal_row_compound');
              const needPull = !dayIntentSet.has('lats_vertical_pull_compound');
              if (needRow) intentCandidates = ['upperBack_horizontal_row_compound'];
              else if (needPull) intentCandidates = ['lats_vertical_pull_compound'];
            }
            if (isLower && slotIndex === 1) {
              const needKnee = !dayIntentSet.has('quads_knee_dominant_compound');
              const needHinge = !dayIntentSet.has('hamstrings_hip_hinge_compound');
              if (needKnee) intentCandidates = ['quads_knee_dominant_compound'];
              else if (needHinge) intentCandidates = ['hamstrings_hip_hinge_compound'];
            }

            let built = null;
            for (const candidateIntent of intentCandidates) {
              if (dayIntentSet.has(candidateIntent)) continue;
              const out = buildExercise(candidateIntent, slotMuscles, searchHintOverride);
              if (out.exerciseId) {
                built = out;
                break;
              }
            }

            if (!built && slotIntent === 'accessory_flex') {
              const altMuscle = chooseAccessoryFlexMuscle({
                targets: bbTargets,
                weekTally: weekMuscleTally,
                dayTally: muscleTally,
                avoid: slotMuscles
              });
              const altHint = ACCESSORY_FLEX_HINTS[altMuscle] || null;
              const altOut = buildExercise(slotIntent, [altMuscle], altHint);
              built = altOut;
            }

            exercises.push(built || buildExercise(slotIntent, slotMuscles, searchHintOverride));
          }
        }
        return exercises;
      };

      // Attempt day build with validation; retry once if invalid.
      let attempts = 0;
      let finalExercises = [];
      while (attempts < 2) {
        attempts += 1;
        usedWeekTemp = new Set(usedWeek);
        const dayExercises = buildBodybuildingDay(attempts > 1);
        const dayObj = { ...day, exercises: dayExercises };
        if (validateBodybuildingDay(dayObj)) {
          // Commit usedWeek from temp by re-running selection to ensure usedWeek updated.
          for (const ex of dayExercises) {
            if (ex.exerciseId && !ex.foundationFlag) usedWeek.add(ex.exerciseId);
          }
          finalExercises = dayExercises;
          break;
        }
      }

      if (finalExercises.length) {
        for (const ex of finalExercises) {
          const keys = Array.isArray(ex.muscleKeys) ? ex.muscleKeys : [];
          const sets = Number(ex.sets) || 0;
          for (const k of keys) weekMuscleTally[k] = (weekMuscleTally[k] || 0) + sets;
        }
      }

      return {
        id: `day:${weekIndex + 1}:${dayIndex + 1}`,
        label: day.label,
        focus: day.focus,
        exercises: finalExercises
      };
    });

    const week = { index: weekIndex + 1, label: wm.label, days };
    if (discipline === 'bodybuilding') {
      tuneSetsForWeek({ week, targets: bbTargets, wseBudgetWeek: bbWseBudget?.perWeek || 0 });
    }
    return week;
  });

  const wseBudget = discipline === 'bodybuilding'
    ? bbWseBudget
    : null;
  const phase = discipline === 'bodybuilding' ? bodybuildingMeta?.phase || 'bulk' : null;
  const currentWeight = discipline === 'bodybuilding' ? Number(baselines?.bodyweight) : null;
  const targetWeightLb = discipline === 'bodybuilding' ? (bodybuildingMeta?.targetWeightLb || null) : null;
  const plannedRate = phase === 'bulk' ? 0.75 : phase === 'cut' ? 1.25 : 0;
  const plannedWeeksToGoal = (Number.isFinite(currentWeight) && Number.isFinite(targetWeightLb) && plannedRate)
    ? Math.ceil(Math.abs(targetWeightLb - currentWeight) / plannedRate)
    : null;
  const plannedGoalDate = plannedWeeksToGoal
    ? (() => {
      const d = new Date();
      d.setDate(d.getDate() + plannedWeeksToGoal * 7);
      return d.toISOString().slice(0, 10);
    })()
    : null;

  return {
    meta: {
      discipline,
      daysPerWeek,
      experience,
      units: 'lb',
      weeks: weeks.length,
      createdAt: new Date().toISOString(),
      phase,
      targetWeightLb,
      trainingAgeBucket: bodybuildingMeta?.trainingAgeBucket || null,
      timePerSession: bodybuildingMeta?.timePerSession || null,
      equipmentStylePref: bodybuildingMeta?.equipmentStylePref || null,
      emphasis: bodybuildingMeta?.emphasis || [],
      injuryProfile: bodybuildingMeta?.injuryProfile || {},
      wseBudgetPerSession: wseBudget?.perSession || null,
      wseBudgetPerWeek: wseBudget?.perWeek || null,
      plannedRate,
      plannedGoalDate,
      autoreg: discipline === 'powerlifting'
        ? {
          deloadWeeks: powerliftingSeedDeloadWeeks,
          nextScheduledDeloadWeek: (normalizeExperience(experience) === 'beginner' ? 6 : 5),
          eventType: powerliftingEventType
        }
        : null,
      schedule: {
        unavailableDays: normalizeWeekdayIndexList(input?.strength?.unavailableDays),
        weekdays: buildTrainingSchedule(daysPerWeek, input?.strength?.unavailableDays)
      },
      rules: discipline === 'bodybuilding' ? bodybuildingRules(experience) : null
    },
    baselines: {
      ...baselines,
      powerlifting: discipline === 'powerlifting'
        ? {
          lastPerformed: {
            squat: asDateIso(input?.strength?.squatDate),
            bench: asDateIso(input?.strength?.benchDate),
            deadlift: asDateIso(input?.strength?.deadliftDate)
          }
        }
        : null
      ,
      bodybuilding: discipline === 'bodybuilding'
        ? {
          lastPerformed: {
            press: asDateIso(input?.strength?.pressDate),
            pull: asDateIso(input?.strength?.pullDate),
            leg: asDateIso(input?.strength?.legDate)
          },
          movements: {
            press: String(input?.strength?.pressMovement || '').trim() || null,
            pull: String(input?.strength?.pullMovement || input?.strength?.pullAnchorMovement || '').trim() || null,
            leg: String(input?.strength?.legMovement || input?.strength?.lowerMovement || '').trim() || null,
            hinge: String(input?.strength?.hingeMovement || '').trim() || null
          }
        }
        : null
    },
    weeks
  };
}

function applyLogAdjustments({ plan, workoutLog, experience }) {
  if (!plan || typeof plan !== 'object') return plan;
  const discipline = String(plan?.meta?.discipline || '').trim().toLowerCase();
  const exp = normalizeExperience(experience || plan?.meta?.experience);
  const defaults = experienceDefaults(exp);

  const weekIndex = clampInt(workoutLog?.weekIndex, 1, 52, null);
  const dayIndex = clampInt(workoutLog?.dayIndex, 1, 7, null);
  if (!weekIndex || !dayIndex) return plan;

  const done = Array.isArray(workoutLog?.entries) ? workoutLog.entries : [];
  const byBase = new Map();
  for (const entry of done) {
    const baseId = String(entry?.baseId || '').trim();
    if (!baseId) continue;
    const actualW = Number(entry?.actual?.weight);
    const actualR = Number(entry?.actual?.reps);
    const actualRpe = Number(entry?.actual?.rpe);
    const targetW = Number(entry?.target?.weight ?? entry?.prescribed?.projectedWeight);
    const repsTarget = Number(entry?.prescribed?.repsTarget) || null;
    const noteText = String(entry?.notes || '').trim().toLowerCase();
    byBase.set(baseId, {
      actualW: Number.isFinite(actualW) ? actualW : null,
      actualR: Number.isFinite(actualR) ? actualR : null,
      actualRpe: Number.isFinite(actualRpe) ? actualRpe : null,
      targetW: Number.isFinite(targetW) ? targetW : null,
      repsTarget,
      noteText
    });
  }

  const updated = JSON.parse(JSON.stringify(plan));
  updated.meta = { ...(updated.meta || {}) };

  const autoreg = updated.meta.autoreg && typeof updated.meta.autoreg === 'object' ? updated.meta.autoreg : {};
  const deloadWeeks = Array.isArray(autoreg.deloadWeeks) ? autoreg.deloadWeeks : [];
  const states = autoreg.states && typeof autoreg.states === 'object' ? autoreg.states : {};
  const lastDecision = autoreg.lastDecision && typeof autoreg.lastDecision === 'object' ? autoreg.lastDecision : {};
  const weekRegs = autoreg.weekRegressions && typeof autoreg.weekRegressions === 'object' ? autoreg.weekRegressions : {};

  const isDeloadWeek = deloadWeeks.includes(weekIndex);

  const tmByLift = (() => {
    const tm = plan?.baselines?.trainingMax || {};
    return {
      squat: Number(tm.squat),
      bench: Number(tm.bench),
      deadlift: Number(tm.deadlift)
    };
  })();

  // Build rep ranges from the plan once (best-effort).
  const repRanges = new Map();
  for (const wk of updated.weeks || []) {
    for (const day of wk?.days || []) {
      for (const ex of day?.exercises || []) {
        const baseId = String(ex?.baseId || '').trim();
        if (!baseId || repRanges.has(baseId)) continue;
        const rr = parseRepRange(ex?.reps);
        if (rr) repRanges.set(baseId, rr);
      }
    }
  }

  const powerliftingTagByBase = (() => {
    if (discipline !== 'powerlifting') return new Map();
    const map = new Map();
    for (const wk of updated.weeks || []) {
      for (const day of wk?.days || []) {
        for (const ex of day?.exercises || []) {
          const baseId = String(ex?.baseId || '').trim();
          if (!baseId || map.has(baseId)) continue;
          const tags = ex?.tags && typeof ex.tags === 'object' ? ex.tags : null;
          if (tags) map.set(baseId, tags);
        }
      }
    }
    return map;
  })();

  const getOrInitState = (baseId) => {
    const key = String(baseId || '').trim();
    if (!key) return null;
    const existing = states[key] && typeof states[key] === 'object' ? states[key] : null;
    if (existing) return existing;

    // Seed from the current target weight when available.
    const perf = byBase.get(key);
    const seededW = Number.isFinite(perf?.targetW) ? perf.targetW : null;
    const rr = repRanges.get(key) || null;
    const repMin = rr?.min ?? null;
    const repMax = rr?.max ?? null;
    const repTarget = exp === 'beginner'
      ? (repMax ?? perf?.repsTarget ?? null)
      : (repMin ?? midRange(repMin, repMax) ?? perf?.repsTarget ?? null);
    states[key] = {
      workingWeight: seededW,
      repTarget: Number.isFinite(repTarget) ? repTarget : null,
      setsTarget: null,
      setsCap: 6,
      stallWeeks: 0,
      significantMissStreak: 0,
      regressStreak: 0,
      lastSuccessWeight: null,
      lastSuccessReps: null,
      technique: 'none'
    };
    return states[key];
  };

  const decisionsThisLog = {};
  let regressionsThisLog = 0;
  let poorRecoveryFlag = false;
  const dayNotesText = String(workoutLog?.notes || '').trim().toLowerCase();
  if (/(poor\s*recovery|low\s*energy|fatigue|run\s*down|exhaust|sick|sleep\s*depriv|no\s*sleep|stress(ed)?)/.test(dayNotesText)) {
    poorRecoveryFlag = true;
  }

  const techniqueScoresByLift = (() => {
    if (discipline !== 'powerlifting') return null;

    const keyPhrases = /(unstable|form|grindy)/;
    const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)));

    const dayPlan = (() => {
      const wk = (updated.weeks || []).find((w) => Number(w?.index) === Number(weekIndex)) || null;
      const d = wk ? (wk.days || [])[Number(dayIndex) - 1] : null;
      return d || null;
    })();

    const prescribedByBase = new Map();
    for (const ex of dayPlan?.exercises || []) {
      const baseId = String(ex?.baseId || '').trim();
      if (!baseId) continue;
      prescribedByBase.set(baseId, {
        reps: String(ex?.reps || '').trim(),
        tags: ex?.tags && typeof ex.tags === 'object' ? ex.tags : null
      });
    }

    const penalty = {
      bench: { miss: false, overshoot: false, keyword: false },
      squat: { miss: false, overshoot: false, keyword: false },
      deadlift: { miss: false, overshoot: false, keyword: false }
    };

    for (const entry of done) {
      const baseId = String(entry?.baseId || '').trim();
      if (!baseId) continue;
      const pres = prescribedByBase.get(baseId) || null;
      const tags = pres?.tags || powerliftingTagByBase.get(baseId) || null;
      const lift = String(tags?.lift || '').trim().toLowerCase();
      if (!['bench', 'squat', 'deadlift'].includes(lift)) continue;

      const actualR = Number(entry?.actual?.reps);
      const actualRpe = Number(entry?.actual?.rpe);
      const notes = String(entry?.notes || '').trim().toLowerCase();

      const repsTargetFromEntry = Number(entry?.prescribed?.repsTarget);
      const rr = parseRepRange(pres?.reps);
      const prescribedReps = Number.isFinite(repsTargetFromEntry)
        ? repsTargetFromEntry
        : rr ? rr.min : null;

      const rpeRange = Array.isArray(tags?.rpeRange) ? tags.rpeRange : null;
      const rpeTarget = rpeRange && rpeRange.length === 2
        ? (Number(rpeRange[0]) + Number(rpeRange[1])) / 2
        : 8;

      if (Number.isFinite(prescribedReps) && Number.isFinite(actualR) && actualR < prescribedReps) penalty[lift].miss = true;
      if (Number.isFinite(actualRpe) && Number.isFinite(rpeTarget) && actualRpe > rpeTarget) penalty[lift].overshoot = true;
      if (keyPhrases.test(notes) || keyPhrases.test(dayNotesText)) penalty[lift].keyword = true;
    }

    const scoreFor = (p) => {
      let score = 1.0;
      if (p.miss) score -= 0.15;
      if (p.overshoot) score -= 0.10;
      if (p.keyword) score -= 0.10;
      return clamp01(score);
    };

    return {
      bench: scoreFor(penalty.bench),
      squat: scoreFor(penalty.squat),
      deadlift: scoreFor(penalty.deadlift)
    };
  })();

  for (const [baseId, perf] of byBase.entries()) {
    const st = getOrInitState(baseId);
    if (!st) continue;

    const rr = repRanges.get(baseId) || null;
    const repMin = rr?.min ?? null;
    const repMax = rr?.max ?? null;
    const repMid = rr ? midRange(rr.min, rr.max) : null;

    const actualW = perf.actualW;
    const actualR = perf.actualR;
    const targetW = perf.targetW;
    const repTarget = Number.isFinite(st.repTarget)
      ? st.repTarget
      : (Number.isFinite(perf.repsTarget) ? perf.repsTarget : (repMax ?? null));

    const repQualityOk = !isBadRepQuality(perf.noteText);
    const painFlag = /(pain|hurt|ache|injur|tendon|joint)/.test(perf.noteText || '');
    if (painFlag) poorRecoveryFlag = true;

    const hasNumbers = Number.isFinite(actualW) && Number.isFinite(actualR) && Number.isFinite(targetW);
    if (!hasNumbers || !repQualityOk) {
      st.regressStreak = Math.min(6, Number(st.regressStreak || 0) + 1);
      regressionsThisLog += 1;
      decisionsThisLog[baseId] = {
        type: 'none',
        message: !repQualityOk ? 'Rep quality flagged; holding progression until reps are controlled.' : 'Missing numbers; no progression change applied.'
      };
      continue;
    }

    const exceeds = actualW > targetW && actualR >= repTarget;
    const hits = actualW === targetW && actualR >= repTarget;
    const slightMiss = actualW === targetW && actualR >= (repMin ?? 1) && (repTarget - actualR === 1 || repTarget - actualR === 2);
    const significantMiss = actualW === targetW && (!repMin ? (repTarget - actualR >= 3) : (actualR < repMin || repTarget - actualR >= 3));

    // No progression changes are applied during a deload week.
    if (isDeloadWeek) {
      st.stallWeeks = 0;
      st.regressStreak = 0;
      st.significantMissStreak = 0;
      st.technique = 'none';
      decisionsThisLog[baseId] = { type: 'deload', message: 'Deload week; progression paused.' };
      continue;
    }

    const inc = chooseIncrementLb(exp, baseId, defaults);

    if (exceeds) {
      st.workingWeight = actualW;
      st.lastSuccessWeight = actualW;
      st.lastSuccessReps = actualR;
      st.significantMissStreak = 0;
      st.regressStreak = 0;
      st.stallWeeks = 0;
      st.technique = 'none';

      // Do not force a load jump next time; push reps (or sets if reps maxed).
      if (repMax != null && repTarget >= repMax) {
        st.setsTarget = clampInt(Number(st.setsTarget || 0) + 1, 1, st.setsCap || 6, Number(st.setsTarget || 0) + 1);
        decisionsThisLog[baseId] = { type: 'sets', message: 'Exceeded target weight; keep load and add a set (reps already maxed).' };
      } else {
        const nextReps = repMax != null ? Math.min(repMax, repTarget + 1) : (repTarget + 1);
        st.repTarget = nextReps;
        decisionsThisLog[baseId] = { type: 'reps', message: 'Exceeded target weight; keep load and push reps next time.' };
      }
      continue;
    }

    if (hits) {
      st.lastSuccessWeight = actualW;
      st.lastSuccessReps = actualR;
      st.significantMissStreak = 0;
      st.regressStreak = 0;
      st.technique = 'none';

      if (exp === 'beginner') {
        // Beginners bias load, but never at the expense of falling below the rep range.
        st.workingWeight = roundTo((Number.isFinite(st.workingWeight) ? st.workingWeight : actualW) + inc, inc);
        decisionsThisLog[baseId] = { type: 'load', message: 'Hit target; increasing load next time.' };
      } else {
        // Double progression: reps -> load (then reset reps toward mid-range).
        if (repMax != null && repTarget >= repMax) {
          st.workingWeight = roundTo((Number.isFinite(st.workingWeight) ? st.workingWeight : actualW) + inc, inc);
          st.repTarget = repMid ?? (repMin ?? repTarget);
          decisionsThisLog[baseId] = { type: 'load', message: 'Hit top of range; adding small load and resetting reps to mid-range.' };
        } else {
          const nextReps = repMax != null ? Math.min(repMax, repTarget + 1) : (repTarget + 1);
          st.repTarget = nextReps;
          decisionsThisLog[baseId] = { type: 'reps', message: 'Hit target; keeping load and adding reps within range.' };
        }
      }
      continue;
    }

    if (slightMiss) {
      st.significantMissStreak = 0;
      st.regressStreak = 0;
      st.technique = 'none';
      st.workingWeight = Number.isFinite(st.workingWeight) ? st.workingWeight : targetW;
      const nextReps = repMax != null ? Math.min(repMax, Math.max(repMin ?? 1, actualR + 1)) : (actualR + 1);
      st.repTarget = nextReps;
      decisionsThisLog[baseId] = { type: 'reps', message: 'Slight miss; keep load and push reps next time.' };
      continue;
    }

    if (significantMiss) {
      st.significantMissStreak = Math.min(6, Number(st.significantMissStreak || 0) + 1);
      st.regressStreak = Math.min(6, Number(st.regressStreak || 0) + 1);
      regressionsThisLog += 1;
      st.technique = 'none';
      st.workingWeight = Number.isFinite(st.workingWeight) ? st.workingWeight : targetW;

      if (st.significantMissStreak >= 2) {
        const mult = 0.93; // 7% reset default inside 5-10%
        st.workingWeight = roundTo(st.workingWeight * mult, inc);
        st.repTarget = repMid ?? repTarget;
        st.significantMissStreak = 0;
        decisionsThisLog[baseId] = { type: 'load', message: 'Missed significantly twice; reduce load 5–10% and reset reps to mid-range.' };
      } else {
        st.repTarget = repMid ?? repTarget;
        decisionsThisLog[baseId] = { type: 'reps', message: 'Significant miss; keep load and retry with a mid-range rep target.' };
      }
      continue;
    }

    // Unclassified: treat as regression and hold.
    st.regressStreak = Math.min(6, Number(st.regressStreak || 0) + 1);
    regressionsThisLog += 1;
    decisionsThisLog[baseId] = { type: 'none', message: 'Performance did not meet target; holding load and reassessing next exposure.' };
  }

  // Technique gate (powerlifting): if score < 0.8, freeze next-week intensity progression for that lift.
  if (discipline === 'powerlifting' && techniqueScoresByLift) {
    const clamp01 = (v) => Math.max(0, Math.min(1, Number(v)));
    const nextWeek = (updated.weeks || []).find((w) => Number(w?.index) === Number(weekIndex + 1)) || null;
    const curWeek = (updated.weeks || []).find((w) => Number(w?.index) === Number(weekIndex)) || null;

    const pctFor = (lift, projectedValue) => {
      const tm = tmByLift?.[lift];
      if (!Number.isFinite(tm) || tm <= 0) return null;
      const v = Number(projectedValue);
      if (!Number.isFinite(v) || v <= 0) return null;
      return clamp01(v / tm);
    };

    const capMapForLift = (lift) => {
      const caps = new Map();
      for (const day of curWeek?.days || []) {
        for (const ex of day?.exercises || []) {
          const tags = ex?.tags && typeof ex.tags === 'object' ? ex.tags : null;
          if (!tags) continue;
          if (String(tags.lift || '').toLowerCase() !== lift) continue;
          const it = String(tags.intensityType || '').toLowerCase();
          if (!it || it === 'accessory') continue;
          const pct = pctFor(lift, ex?.projected?.value);
          if (!Number.isFinite(pct)) continue;
          const prev = caps.get(it);
          if (!Number.isFinite(prev) || pct > prev) caps.set(it, pct);
        }
      }
      // Fallback: overall cap for the lift.
      let overall = null;
      for (const v of caps.values()) overall = overall == null ? v : Math.max(overall, v);
      return { caps, overall };
    };

    const roundForLift = (lift, value) => {
      const inc = lift === 'bench' ? 2.5 : 5;
      return roundTo(value, inc);
    };

    const applyFreeze = (lift) => {
      const score = Number(techniqueScoresByLift[lift]);
      if (!Number.isFinite(score) || score >= 0.8) return;
      const { caps, overall } = capMapForLift(lift);
      if (!nextWeek) return;

      for (const day of nextWeek.days || []) {
        for (const ex of day.exercises || []) {
          const tags = ex?.tags && typeof ex.tags === 'object' ? ex.tags : null;
          if (!tags) continue;
          if (String(tags.lift || '').toLowerCase() !== lift) continue;
          const it = String(tags.intensityType || '').toLowerCase();
          if (!it || it === 'accessory') continue;
          if (!ex.projected || typeof ex.projected !== 'object') continue;
          if (!Number.isFinite(ex.projected.value)) continue;

          const nextPct = pctFor(lift, ex.projected.value);
          const cap = caps.get(it) ?? overall;
          if (!Number.isFinite(nextPct) || !Number.isFinite(cap)) continue;
          if (nextPct <= cap + 1e-6) continue;

          const tm = tmByLift?.[lift];
          if (!Number.isFinite(tm) || tm <= 0) continue;
          const capped = roundForLift(lift, tm * cap);
          if (Number.isFinite(capped) && capped > 0) ex.projected.value = capped;
        }
      }

      weekRegs[String(weekIndex + 1)] = {
        ...(weekRegs[String(weekIndex + 1)] || {}),
        techniqueGate: { lift, score, at: new Date().toISOString() }
      };
    };

    applyFreeze('bench');
    applyFreeze('squat');
    applyFreeze('deadlift');

    autoreg.techniqueScores = autoreg.techniqueScores && typeof autoreg.techniqueScores === 'object'
      ? autoreg.techniqueScores
      : {};
    autoreg.techniqueScores[`${weekIndex}:${dayIndex}`] = {
      byLift: techniqueScoresByLift,
      at: new Date().toISOString()
    };
  }

  // Deload scheduling logic (all disciplines).
  let triggerDeload = false;
  if (discipline === 'bodybuilding' || discipline === 'powerlifting' || discipline === 'calisthenics') {
    // Multiple lifts regressing in same logged workout.
    if (regressionsThisLog >= 2) triggerDeload = true;
    if (poorRecoveryFlag) triggerDeload = true;

    // Same lift regresses twice consecutively.
    for (const [baseId, st] of Object.entries(states)) {
      if (!st || typeof st !== 'object') continue;
      if (Number(st.regressStreak || 0) >= 2) triggerDeload = true;
    }

    // Scheduled deloads.
    const scheduleEvery = discipline === 'powerlifting'
      ? (exp === 'beginner' ? 6 : 5)
      : exp === 'beginner' ? 7 : 5; // inside 6–8 / 4–6
    const nextScheduled = clampInt(autoreg.nextScheduledDeloadWeek, 2, 52, null) || scheduleEvery;
    const nextWeekIndex = weekIndex + 1;
    const scheduledHit = nextWeekIndex >= nextScheduled;

    if (scheduledHit) triggerDeload = true;

    if (triggerDeload) {
      const nextIdx = weekIndex + 1;
      if (!deloadWeeks.includes(nextIdx)) deloadWeeks.push(nextIdx);

      // Move the next scheduled marker forward once we schedule a deload.
      const bumped = nextIdx + scheduleEvery;
      autoreg.nextScheduledDeloadWeek = bumped;

      // Reset regression streaks on deload scheduling.
      for (const st of Object.values(states)) {
        if (!st || typeof st !== 'object') continue;
        st.regressStreak = 0;
        st.stallWeeks = 0;
        st.technique = 'none';
      }
      weekRegs[String(nextIdx)] = { reason: poorRecoveryFlag ? 'poor_recovery' : (scheduledHit ? 'scheduled' : 'regression'), at: new Date().toISOString() };
    }
  }

  // Apply deload modifications to any deload weeks (forward-only).
  const deloadSet = new Set(deloadWeeks.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0));
  const deloadPct = chooseDeloadPct();

  // Reproject all future weeks from current states (bodybuilding only).
  if (discipline === 'bodybuilding') {
    // Snapshot current state for forward projection.
    const projState = {};
    for (const [baseId, st] of Object.entries(states)) projState[baseId] = JSON.parse(JSON.stringify(st));

    for (const week of updated.weeks || []) {
      const wi = Number(week?.index);
      if (!Number.isFinite(wi) || wi <= weekIndex) continue;
      const deload = deloadSet.has(wi);

      for (const day of week.days || []) {
        for (const ex of day.exercises || []) {
          const baseId = String(ex?.baseId || '').trim();
          if (!baseId) continue;
          if (!ex.projected || typeof ex.projected !== 'object') continue;
          if (ex.projected.unit !== 'lb') continue;
          if (!Number.isFinite(ex.projected.value)) continue;

          const st = projState[baseId] || getOrInitState(baseId);
          if (!st) continue;

          const inc = chooseIncrementLb(exp, baseId, defaults);
          const rr = repRanges.get(baseId) || null;
          const repMin = rr?.min ?? null;
          const repMax = rr?.max ?? null;

          const baseWorking = Number.isFinite(st.workingWeight) ? st.workingWeight : ex.projected.value;
          const setsBase = Number.isFinite(st.setsTarget) ? st.setsTarget : ex.sets;
          const repsTarget = Number.isFinite(st.repTarget)
            ? st.repTarget
            : (repMax ?? null);

          ex.progression = ex.progression && typeof ex.progression === 'object' ? ex.progression : {};
          ex.progression.repsTarget = Number.isFinite(repsTarget) ? repsTarget : null;
          ex.progression.technique = deload ? 'none' : (st.technique || 'none');
          ex.progression.setsCap = st.setsCap || 6;

          if (deload) {
            ex.sets = clampInt(Math.round(Number(setsBase || ex.sets) * deloadPct.setMult), 1, 10, ex.sets);
            ex.projected.value = roundTo(baseWorking * deloadPct.loadMult, inc);
          } else {
            ex.sets = clampInt(Number(setsBase || ex.sets), 1, 10, ex.sets);
            ex.projected.value = roundTo(baseWorking, inc);
          }
        }
      }

      // Advance projection state as-if the user hits targets (not deload weeks).
      if (!deload) {
        for (const [baseId, st] of Object.entries(projState)) {
          if (!st || typeof st !== 'object') continue;
          const rr = repRanges.get(baseId) || null;
          const repMin = rr?.min ?? null;
          const repMax = rr?.max ?? null;
          const repMid = rr ? midRange(rr.min, rr.max) : null;
          const inc = chooseIncrementLb(exp, baseId, defaults);

          if (exp === 'beginner') {
            st.workingWeight = Number.isFinite(st.workingWeight) ? roundTo(st.workingWeight + inc, inc) : st.workingWeight;
          } else if (repMax != null && Number.isFinite(st.repTarget) && st.repTarget >= repMax) {
            st.workingWeight = Number.isFinite(st.workingWeight) ? roundTo(st.workingWeight + inc, inc) : st.workingWeight;
            st.repTarget = repMid ?? repMin ?? st.repTarget;
          } else if (Number.isFinite(st.repTarget)) {
            st.repTarget = repMax != null ? Math.min(repMax, st.repTarget + 1) : (st.repTarget + 1);
          }
        }
      }
    }
  }

  // For non-bodybuilding plans, still apply deload multipliers to future weeks when scheduled.
  if (discipline !== 'bodybuilding' && deloadSet.size) {
    for (const week of updated.weeks || []) {
      const wi = Number(week?.index);
      if (!Number.isFinite(wi) || wi <= weekIndex) continue;
      const deload = deloadSet.has(wi);
      if (!deload) continue;
      for (const day of week.days || []) {
        for (const ex of day.exercises || []) {
          const baseId = String(ex?.baseId || '').trim();
          if (!baseId) continue;
          if (!ex.projected || typeof ex.projected !== 'object') continue;
          if (ex.projected.unit !== 'lb') continue;
          if (!Number.isFinite(ex.projected.value)) continue;
          const inc = chooseIncrementLb(exp, baseId, defaults);
          ex.sets = clampInt(Math.round(Number(ex.sets || 0) * deloadPct.setMult), 1, 12, ex.sets);
          ex.projected.value = roundTo(Number(ex.projected.value) * deloadPct.loadMult, inc);
          ex.progression = ex.progression && typeof ex.progression === 'object' ? ex.progression : {};
          ex.progression.technique = 'none';
        }
      }
    }
  }

  // Persist decisions for UI transparency.
  for (const [baseId, d] of Object.entries(decisionsThisLog)) {
    lastDecision[baseId] = { ...(d || {}), weekIndex, at: new Date().toISOString() };
  }

  updated.meta.autoreg = { ...autoreg, deloadWeeks, states, lastDecision, weekRegressions: weekRegs };
  updated.meta = { ...(updated.meta || {}), updatedAt: new Date().toISOString() };
  return updated;
}

module.exports = { generatePlan, applyLogAdjustments, normalizeExperience };


