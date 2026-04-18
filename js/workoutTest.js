(() => {
  const TEST_COUNT = 10;
  const STORAGE_KEY = 'ode_workout_test_last_batch_v3';
  const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const TIME_LABELS = {
    '30_45': '30-45 min',
    '45_60': '45-60 min',
    '60_75': '60-75 min',
    '75_90_plus': '75-90+ min'
  };
  const TRAINING_AGE_LABELS = {
    '0_6': '0-6 months',
    '6_18': '6-18 months',
    '18_36': '18-36 months',
    '3_5': '3-5 years',
    '5_plus': '5+ years'
  };
  const PHASE_LABELS = {
    bulk: 'Bulk',
    cut: 'Cut',
    maintain: 'Maintain'
  };
  const EXPERIENCE_LABELS = {
    beginner: 'Beginner',
    intermediate: 'Intermediate',
    advanced: 'Advanced'
  };
  const EQUIPMENT_STYLE_LABELS = {
    barbell: 'Barbell-focused',
    dumbbell: 'Dumbbell-focused',
    machine: 'Machine-focused',
    mix: 'Mix'
  };
  const EMPHASIS_LABELS = {
    chest: 'Chest',
    back: 'Back',
    shoulders: 'Shoulders',
    arms: 'Arms',
    quads: 'Quads',
    hamstrings_glutes: 'Hamstrings/Glutes',
    calves: 'Calves',
    abs: 'Abs'
  };
  const INJURY_LABELS = {
    shoulder: 'Shoulder',
    elbow: 'Elbow',
    wrist: 'Wrist',
    back: 'Lower back',
    hip: 'Hip',
    knee: 'Knee',
    ankle: 'Ankle'
  };

  const $ = (sel) => document.querySelector(sel);
  const escapeHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const state = {
    results: [],
    lastProfiles: [],
    selected: new Set(),
    batchLabel: 'None',
    aggregateReport: null
  };

  const randomPools = {
    names: {
      women: ['Lena Morales', 'Priya Shah', 'Serena Park', 'Naomi Brooks', 'Olivia Grant', 'Jade Walker', 'Alyssa Romero', 'Tessa Nguyen'],
      men: ['Theo Bennett', 'Darius Cole', 'Marcus Reed', 'Noah Kim', 'Hassan Malik', 'Victor Alvarez', 'Isaiah Turner', 'Miles Carter']
    },
    goals: {
      bulk: [
        'Push scale weight up while keeping training quality high.',
        'Add lean size without burying recovery.',
        'Grow with enough food to progress loads each week.'
      ],
      cut: [
        'Drop body fat while keeping muscle and performance steady.',
        'Lean out without losing lower-body strength.',
        'Cut weight while keeping as much size as possible.'
      ],
      maintain: [
        'Hold bodyweight steady while improving shape and execution.',
        'Recomp slowly and keep recovery predictable.',
        'Stay around current weight and bring up weak points.'
      ]
    },
    cities: [
      ['Baltimore', 'MD'],
      ['Austin', 'TX'],
      ['Denver', 'CO'],
      ['Tampa', 'FL'],
      ['Phoenix', 'AZ'],
      ['Chicago', 'IL'],
      ['Nashville', 'TN'],
      ['San Diego', 'CA']
    ]
  };

  const canonicalScenarios = [
    {
      name: 'Lena Morales',
      age: 27,
      locationCity: 'Baltimore',
      locationState: 'MD',
      stressReason: 'Two-day cut with narrow abs/calves emphasis, short sessions, and limited home setup. This pressures split efficiency and minimal-equipment exercise selection.',
      phase: 'cut',
      experience: 'beginner',
      daysPerWeek: 2,
      timePerSession: '30_45',
      trainingAgeBucket: '0_6',
      equipmentStylePref: 'dumbbell',
      emphasis: ['abs', 'calves'],
      equipmentAccess: { bodyweight: true, dumbbell: true, barbell: false, cable: false, machine: false },
      unavailableDays: [2, 4, 6, 0],
      targetWeightLb: 148,
      strength: {
        bodyweight: 156,
        height: 65,
        benchVariation: 'Flat Dumbbell Bench Press',
        benchWeight: 60,
        benchReps: 10,
        lowerMovement: 'Goblet Squat',
        lowerWeight: 60,
        lowerReps: 12,
        hingeMovement: 'Dumbbell Romanian Deadlift',
        hingeWeight: 70,
        hingeReps: 10
      },
      injury: { has: false, joints: [], note: '', severityByJoint: {} }
    },
    {
      name: 'Theo Bennett',
      age: 31,
      locationCity: 'Denver',
      locationState: 'CO',
      stressReason: 'Barbell-focused garage-gym user with short sessions, ankle pain, and upper-body priorities. This stresses lower-body filtering and whether style preference dominates exercise choice.',
      phase: 'bulk',
      experience: 'beginner',
      daysPerWeek: 4,
      timePerSession: '30_45',
      trainingAgeBucket: '6_18',
      equipmentStylePref: 'barbell',
      emphasis: ['shoulders', 'arms'],
      equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: false, machine: false },
      unavailableDays: [0, 3, 6],
      targetWeightLb: 192,
      strength: {
        bodyweight: 181,
        height: 70,
        benchVariation: 'Barbell Bench Press',
        benchWeight: 115,
        benchReps: 10,
        lowerMovement: 'Back Squat',
        lowerWeight: 145,
        lowerReps: 10,
        hingeMovement: 'Romanian Deadlift',
        hingeWeight: 155,
        hingeReps: 10
      },
      injury: {
        has: true,
        joints: ['ankle'],
        note: 'Left ankle gets cranky with jumping, running, or a lot of deep forward knee travel.',
        severityByJoint: { ankle: 4 }
      }
    },
    {
      name: 'Serena Park',
      age: 29,
      locationCity: 'Chicago',
      locationState: 'IL',
      stressReason: 'Dumbbell-only intermediate with elbow irritation and back/arms emphasis. This should expose weak upper-body variety and elbow-blind isolation choices.',
      phase: 'maintain',
      experience: 'intermediate',
      daysPerWeek: 3,
      timePerSession: '45_60',
      trainingAgeBucket: '18_36',
      equipmentStylePref: 'dumbbell',
      emphasis: ['back', 'arms'],
      equipmentAccess: { bodyweight: true, dumbbell: true, barbell: false, cable: false, machine: false },
      unavailableDays: [2, 4, 0, 6],
      targetWeightLb: null,
      strength: {
        bodyweight: 126,
        height: 64,
        benchVariation: 'Flat Dumbbell Bench Press',
        benchWeight: 80,
        benchReps: 10,
        lowerMovement: 'Dumbbell Bulgarian Split Squat',
        lowerWeight: 90,
        lowerReps: 10,
        hingeMovement: 'Dumbbell Romanian Deadlift',
        hingeWeight: 100,
        hingeReps: 10
      },
      injury: {
        has: true,
        joints: ['elbow'],
        note: 'Right elbow flares with aggressive supinated pulling and skull-crusher style elbow extension.',
        severityByJoint: { elbow: 5 }
      }
    },
    {
      name: 'Darius Cole',
      age: 38,
      locationCity: 'Phoenix',
      locationState: 'AZ',
      stressReason: 'Machine-heavy lower-body cut with knee pain and 5 training days. This stresses whether the engine can grow legs without sneaking in knee-hostile patterns.',
      phase: 'cut',
      experience: 'intermediate',
      daysPerWeek: 5,
      timePerSession: '60_75',
      trainingAgeBucket: '18_36',
      equipmentStylePref: 'machine',
      emphasis: ['quads', 'hamstrings_glutes'],
      equipmentAccess: { bodyweight: true, dumbbell: false, barbell: false, cable: true, machine: true },
      unavailableDays: [3, 6],
      targetWeightLb: 225,
      strength: {
        bodyweight: 242,
        height: 75,
        benchVariation: 'Machine Chest Press',
        benchWeight: 200,
        benchReps: 12,
        lowerMovement: 'Leg Press',
        lowerWeight: 450,
        lowerReps: 15,
        hingeMovement: 'Cable Pull-through',
        hingeWeight: 160,
        hingeReps: 12
      },
      injury: {
        has: true,
        joints: ['knee'],
        note: 'Both knees hate deep knee flexion under fatigue; keep squat pattern controlled and depth pain-free.',
        severityByJoint: { knee: 6 }
      }
    },
    {
      name: 'Marcus Reed',
      age: 34,
      locationCity: 'Austin',
      locationState: 'TX',
      stressReason: 'Full-gym intermediate with three upper-body priorities. This is a clean stress case for emphasis targeting without equipment excuses.',
      phase: 'maintain',
      experience: 'intermediate',
      daysPerWeek: 4,
      timePerSession: '60_75',
      trainingAgeBucket: '3_5',
      equipmentStylePref: 'mix',
      emphasis: ['chest', 'back', 'shoulders'],
      equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
      unavailableDays: [3, 6],
      targetWeightLb: null,
      strength: {
        bodyweight: 192,
        height: 72,
        benchVariation: 'Incline Barbell Bench Press',
        benchWeight: 185,
        benchReps: 8,
        lowerMovement: 'Hack Squat',
        lowerWeight: 340,
        lowerReps: 10,
        hingeMovement: 'Romanian Deadlift',
        hingeWeight: 235,
        hingeReps: 8
      },
      injury: { has: false, joints: [], note: '', severityByJoint: {} }
    },
    {
      name: 'Olivia Grant',
      age: 36,
      locationCity: 'Nashville',
      locationState: 'TN',
      stressReason: 'Advanced 6-day bulk with very long sessions and wrist limitations. This pressures high-frequency construction and whether wrist-sensitive users still get straight-bar loading.',
      phase: 'bulk',
      experience: 'advanced',
      daysPerWeek: 6,
      timePerSession: '75_90_plus',
      trainingAgeBucket: '5_plus',
      equipmentStylePref: 'mix',
      emphasis: ['quads', 'hamstrings_glutes', 'calves'],
      equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
      unavailableDays: [0],
      targetWeightLb: 176,
      strength: {
        bodyweight: 168,
        height: 67,
        benchVariation: 'Incline Dumbbell Bench Press',
        benchWeight: 130,
        benchReps: 10,
        lowerMovement: 'Hack Squat',
        lowerWeight: 360,
        lowerReps: 12,
        hingeMovement: 'Barbell Hip Thrust',
        hingeWeight: 315,
        hingeReps: 10
      },
      injury: {
        has: true,
        joints: ['wrist'],
        note: 'Wrist extension tolerance is limited on straight bars; dumbbells and neutral grips feel better.',
        severityByJoint: { wrist: 3 }
      }
    },
    {
      name: 'Noah Kim',
      age: 24,
      locationCity: 'San Diego',
      locationState: 'CA',
      stressReason: 'Pressing-oriented beginner with shoulder irritation, no barbell access, and moderate commercial-gym tools. This is aimed directly at shoulder filtering mistakes.',
      phase: 'maintain',
      experience: 'beginner',
      daysPerWeek: 3,
      timePerSession: '45_60',
      trainingAgeBucket: '6_18',
      equipmentStylePref: 'mix',
      emphasis: ['chest', 'abs'],
      equipmentAccess: { bodyweight: true, dumbbell: true, barbell: false, cable: true, machine: true },
      unavailableDays: [1, 4, 6, 0],
      targetWeightLb: null,
      strength: {
        bodyweight: 174,
        height: 69,
        benchVariation: 'Machine Chest Press',
        benchWeight: 110,
        benchReps: 12,
        lowerMovement: 'Leg Press',
        lowerWeight: 220,
        lowerReps: 12,
        hingeMovement: 'Dumbbell Romanian Deadlift',
        hingeWeight: 120,
        hingeReps: 10
      },
      injury: {
        has: true,
        joints: ['shoulder'],
        note: 'Front shoulder gets pinchy on deep stretch pressing and overhead volume; neutral grip feels better.',
        severityByJoint: { shoulder: 5 }
      }
    },
    {
      name: 'Priya Shah',
      age: 33,
      locationCity: 'Tampa',
      locationState: 'FL',
      stressReason: 'Advanced barbell-focused bulk with narrow chest/shoulders/arms priorities and constrained training days. This should show whether style and emphasis both materially shape the plan.',
      phase: 'bulk',
      experience: 'advanced',
      daysPerWeek: 4,
      timePerSession: '45_60',
      trainingAgeBucket: '5_plus',
      equipmentStylePref: 'barbell',
      emphasis: ['chest', 'shoulders', 'arms'],
      equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: false, machine: false },
      unavailableDays: [2, 5, 0],
      targetWeightLb: 146,
      strength: {
        bodyweight: 138,
        height: 63,
        benchVariation: 'Barbell Bench Press',
        benchWeight: 155,
        benchReps: 9,
        lowerMovement: 'Front Squat',
        lowerWeight: 185,
        lowerReps: 8,
        hingeMovement: 'Romanian Deadlift',
        hingeWeight: 205,
        hingeReps: 8
      },
      injury: { has: false, joints: [], note: '', severityByJoint: {} }
    },
    {
      name: 'Naomi Brooks',
      age: 35,
      locationCity: 'Austin',
      locationState: 'TX',
      stressReason: 'Five-day cut with posterior-chain emphasis, hip irritation, and long sessions. This stresses lower-body selection quality under hip-limited constraints.',
      phase: 'cut',
      experience: 'intermediate',
      daysPerWeek: 5,
      timePerSession: '75_90_plus',
      trainingAgeBucket: '3_5',
      equipmentStylePref: 'mix',
      emphasis: ['hamstrings_glutes', 'abs'],
      equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
      unavailableDays: [5, 0],
      targetWeightLb: 138,
      strength: {
        bodyweight: 147,
        height: 66,
        benchVariation: 'Incline Dumbbell Bench Press',
        benchWeight: 90,
        benchReps: 10,
        lowerMovement: 'Leg Press',
        lowerWeight: 250,
        lowerReps: 12,
        hingeMovement: 'Smith Romanian Deadlift',
        hingeWeight: 165,
        hingeReps: 10
      },
      injury: {
        has: true,
        joints: ['hip'],
        note: 'Left hip gets irritated with very deep flexion and wide-stance work; moderate stance is better.',
        severityByJoint: { hip: 5 }
      }
    },
    {
      name: 'Hassan Malik',
      age: 41,
      locationCity: 'Chicago',
      locationState: 'IL',
      stressReason: 'Advanced 6-day maintain user with lower-back history and upper-pull priorities. This is designed to catch hinge and axial-loading mistakes in high-frequency programming.',
      phase: 'maintain',
      experience: 'advanced',
      daysPerWeek: 6,
      timePerSession: '60_75',
      trainingAgeBucket: '5_plus',
      equipmentStylePref: 'mix',
      emphasis: ['back', 'shoulders', 'arms'],
      equipmentAccess: { bodyweight: true, dumbbell: true, barbell: true, cable: true, machine: true },
      unavailableDays: [4],
      targetWeightLb: null,
      strength: {
        bodyweight: 208,
        height: 74,
        benchVariation: 'Machine Chest Press',
        benchWeight: 230,
        benchReps: 10,
        lowerMovement: 'Leg Press',
        lowerWeight: 500,
        lowerReps: 10,
        hingeMovement: 'Romanian Deadlift',
        hingeWeight: 225,
        hingeReps: 8
      },
      injury: {
        has: true,
        joints: ['back'],
        note: 'Lower back does not like heavy axial loading or deadlifts from the floor; controlled hinges are okay.',
        severityByJoint: { back: 4 }
      }
    }
  ];

  function rand(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  function shuffle(arr) {
    const next = Array.isArray(arr) ? [...arr] : [];
    for (let i = next.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    return next;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function titleCase(value) {
    return String(value || '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function unique(arr) {
    return Array.from(new Set((Array.isArray(arr) ? arr : []).map((item) => String(item || '').trim()).filter(Boolean)));
  }

  function equipmentLabel(equipmentAccess) {
    const active = Object.entries(equipmentAccess || {})
      .filter(([, value]) => Boolean(value))
      .map(([key]) => titleCase(key));
    return active.length ? active.join(', ') : 'Bodyweight';
  }

  function formatPhase(phase) {
    return PHASE_LABELS[String(phase || '').trim().toLowerCase()] || titleCase(phase);
  }

  function formatExperience(experience) {
    return EXPERIENCE_LABELS[String(experience || '').trim().toLowerCase()] || titleCase(experience);
  }

  function formatTimePerSession(value) {
    return TIME_LABELS[String(value || '').trim()] || titleCase(value);
  }

  function formatTrainingAge(value) {
    return TRAINING_AGE_LABELS[String(value || '').trim()] || titleCase(value);
  }

  function formatEquipmentStyle(value) {
    return EQUIPMENT_STYLE_LABELS[String(value || '').trim().toLowerCase()] || titleCase(value);
  }

  function sessionBucketToEngineValue(value) {
    const key = String(value || '').trim();
    if (key === '30_45') return '30';
    if (key === '45_60') return '45';
    if (key === '60_75') return '60';
    if (key === '75_90_plus') return '75+';
    return '60';
  }

  function trainingAgeBucketToEngineExperience(value) {
    const key = String(value || '').trim();
    if (key === '0_6') return '<6m';
    if (key === '6_18') return '6-24m';
    if (key === '18_36' || key === '3_5') return '2-5y';
    if (key === '5_plus') return '5y+';
    return '6-24m';
  }

  function formatEmphasis(list) {
    return (Array.isArray(list) ? list : []).map((item) => EMPHASIS_LABELS[item] || titleCase(item)).join(', ') || 'None';
  }

  function formatCannotTrain(days) {
    return (Array.isArray(days) ? days : [])
      .map((idx) => DAY_NAMES[Math.max(0, Math.min(6, Number(idx) || 0))] || '')
      .filter(Boolean)
      .join(', ') || 'None';
  }

  function formatJoints(joints) {
    return (Array.isArray(joints) ? joints : []).map((joint) => INJURY_LABELS[joint] || titleCase(joint)).join(', ') || 'None';
  }

  function formatSeverityMap(map) {
    const entries = Object.entries(map && typeof map === 'object' ? map : {});
    if (!entries.length) return 'None';
    return entries.map(([joint, severity]) => `${INJURY_LABELS[joint] || titleCase(joint)} ${severity}/10`).join(', ');
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function jitterLift(weight, reps, deltaWeightRange, deltaRepRange, minWeight = 20) {
    const weightDelta = Math.floor((Math.random() * ((deltaWeightRange * 2) + 1)) - deltaWeightRange);
    const repsDelta = Math.floor((Math.random() * ((deltaRepRange * 2) + 1)) - deltaRepRange);
    return {
      weight: clamp(Math.round(Number(weight || 0) + weightDelta), minWeight, 900),
      reps: clamp(Math.round(Number(reps || 0) + repsDelta), 5, 20)
    };
  }

  function scenarioToProfile(scenario, index) {
    const phase = String(scenario.phase || 'maintain').trim().toLowerCase();
    const experience = String(scenario.experience || 'beginner').trim().toLowerCase();
    const trainingAgeBucket = String(scenario.trainingAgeBucket || '').trim();
    const engineExperience = trainingAgeBucketToEngineExperience(trainingAgeBucket);
    const sessionBucket = String(scenario.timePerSession || '').trim();
    const engineSessionLength = sessionBucketToEngineValue(sessionBucket);
    const firstName = String(scenario.name || `Simulation ${index + 1}`).trim();
    const strength = scenario.strength || {};
    const injury = scenario.injury || { has: false, joints: [], note: '', severityByJoint: {} };
    const emphasis = unique(scenario.emphasis).slice(0, 3);
    const equipmentAccess = {
      bodyweight: Boolean(scenario.equipmentAccess?.bodyweight),
      dumbbell: Boolean(scenario.equipmentAccess?.dumbbell),
      barbell: Boolean(scenario.equipmentAccess?.barbell),
      cable: Boolean(scenario.equipmentAccess?.cable),
      machine: Boolean(scenario.equipmentAccess?.machine)
    };
    const targetWeightLb = ['bulk', 'cut'].includes(phase)
      ? Number(scenario.targetWeightLb)
      : null;
    const goalText = String(scenario.goalText || '').trim()
      || rand(randomPools.goals[phase] || randomPools.goals.maintain);

    return {
      label: firstName,
      profileSummary: {
        name: firstName,
        stressReason: String(scenario.stressReason || '').trim(),
        phase,
        experience,
        targetWeightLb,
        daysPerWeek: Number(scenario.daysPerWeek),
        timePerSession: sessionBucket,
        trainingAgeBucket,
        emphasis,
        equipmentStylePref: String(scenario.equipmentStylePref || ''),
        equipmentAccess,
        unavailableDays: Array.isArray(scenario.unavailableDays) ? scenario.unavailableDays.slice() : [],
        bodyweight: Number(strength.bodyweight),
        height: Number(strength.height),
        benchVariation: String(strength.benchVariation || ''),
        benchWeight: Number(strength.benchWeight),
        benchReps: Number(strength.benchReps),
        lowerMovement: String(strength.lowerMovement || ''),
        lowerWeight: Number(strength.lowerWeight),
        lowerReps: Number(strength.lowerReps),
        hingeMovement: String(strength.hingeMovement || ''),
        hingeWeight: Number(strength.hingeWeight),
        hingeReps: Number(strength.hingeReps),
        injury: {
          has: Boolean(injury.has),
          joints: Array.isArray(injury.joints) ? injury.joints.slice() : [],
          note: String(injury.note || ''),
          severityByJoint: { ...(injury.severityByJoint || {}) }
        }
      },
      payload: {
        discipline: 'bodybuilding',
        experience: engineExperience,
        daysPerWeek: Number(scenario.daysPerWeek),
        phase,
        targetWeightLb,
        timePerSession: engineSessionLength,
        trainingAgeBucket,
        emphasis,
        equipmentStylePref: String(scenario.equipmentStylePref || ''),
        unavailableDays: Array.isArray(scenario.unavailableDays) ? scenario.unavailableDays.slice() : [],
        equipmentAccess,
        strength: {
          bodyweight: Number(strength.bodyweight),
          height: Number(strength.height),
          benchWeight: Number(strength.benchWeight),
          benchReps: Number(strength.benchReps),
          lowerMovement: String(strength.lowerMovement || ''),
          lowerWeight: Number(strength.lowerWeight),
          lowerReps: Number(strength.lowerReps),
          hingeMovement: String(strength.hingeMovement || ''),
          hingeWeight: Number(strength.hingeWeight),
          hingeReps: Number(strength.hingeReps),
          pullMovement: '',
          pullExerciseId: '',
          pullWeight: 0,
          pullReps: 0,
          goalMode: phase === 'maintain' ? 'maintain' : phase,
          phase,
          targetWeightLb,
          timePerSession: sessionBucket,
          trainingAgeBucket,
          emphasis,
          equipmentStylePref: String(scenario.equipmentStylePref || ''),
          injury: {
            has: Boolean(injury.has),
            joints: Array.isArray(injury.joints) ? injury.joints.slice() : [],
            note: String(injury.note || '')
          },
          injurySeverityByJoint: { ...(injury.severityByJoint || {}) }
        },
        profile: {
          firstName,
          age: Number(scenario.age) || null,
          locationCity: String(scenario.locationCity || ''),
          locationState: String(scenario.locationState || ''),
          goals: goalText,
          injuries: String(injury.note || '')
        }
      }
    };
  }

  function mutateUnavailableDays(daysPerWeek, currentDays) {
    const current = Array.isArray(currentDays) ? currentDays.slice() : [];
    const availableLimit = Math.max(0, 7 - Math.max(2, Math.min(6, Number(daysPerWeek) || 4)));
    const shuffledDays = shuffle([0, 1, 2, 3, 4, 5, 6]);
    let next = current.length ? current.slice(0, availableLimit) : shuffledDays.slice(0, availableLimit);
    if (Math.random() > 0.55 && next.length) {
      next[Math.floor(Math.random() * next.length)] = shuffledDays[0];
    }
    next = unique(next.map((value) => Number(value))).map((value) => Math.max(0, Math.min(6, value)));
    while (next.length > availableLimit) next.pop();
    if ((7 - next.length) < daysPerWeek) next = shuffledDays.slice(0, availableLimit);
    return next.sort((a, b) => a - b);
  }

  function mutateScenario(base, index) {
    const next = deepClone(base);
    const namePool = /Lena|Priya|Serena|Naomi|Olivia|Jade|Alyssa|Tessa/i.test(next.name)
      ? randomPools.names.women
      : randomPools.names.men;
    const [city, stateCode] = rand(randomPools.cities);
    next.name = rand(namePool);
    next.locationCity = city;
    next.locationState = stateCode;
    next.age = clamp((Number(next.age) || 30) + Math.floor((Math.random() * 5) - 2), 21, 52);

    const bodyweightDelta = Math.floor((Math.random() * 7) - 3);
    const heightDelta = Math.floor((Math.random() * 3) - 1);
    next.strength.bodyweight = clamp((Number(next.strength.bodyweight) || 150) + bodyweightDelta, 105, 310);
    next.strength.height = clamp((Number(next.strength.height) || 68) + heightDelta, 59, 79);

    const bench = jitterLift(next.strength.benchWeight, next.strength.benchReps, 10, 1);
    const lower = jitterLift(next.strength.lowerWeight, next.strength.lowerReps, 20, 1);
    const hinge = jitterLift(next.strength.hingeWeight, next.strength.hingeReps, 20, 1);
    next.strength.benchWeight = bench.weight;
    next.strength.benchReps = bench.reps;
    next.strength.lowerWeight = lower.weight;
    next.strength.lowerReps = lower.reps;
    next.strength.hingeWeight = hinge.weight;
    next.strength.hingeReps = hinge.reps;

    if (['bulk', 'cut'].includes(next.phase)) {
      const baseShift = next.phase === 'bulk' ? 8 : -9;
      const extraShift = Math.floor((Math.random() * 7) - 3);
      next.targetWeightLb = clamp(Math.round(next.strength.bodyweight + baseShift + extraShift), 95, 340);
      if (next.phase === 'bulk' && next.targetWeightLb <= next.strength.bodyweight) next.targetWeightLb = next.strength.bodyweight + 6;
      if (next.phase === 'cut' && next.targetWeightLb >= next.strength.bodyweight) next.targetWeightLb = next.strength.bodyweight - 6;
    }

    next.unavailableDays = mutateUnavailableDays(next.daysPerWeek, next.unavailableDays);
    next.goalText = rand(randomPools.goals[next.phase] || randomPools.goals.maintain);

    if (next.injury?.has && next.injury?.severityByJoint) {
      Object.keys(next.injury.severityByJoint).forEach((joint) => {
        next.injury.severityByJoint[joint] = clamp(Number(next.injury.severityByJoint[joint]) + Math.floor((Math.random() * 3) - 1), 2, 8);
      });
    }

    return scenarioToProfile(next, index);
  }

  function buildProfiles(randomize) {
    const scenarios = canonicalScenarios.slice(0, TEST_COUNT);
    if (!randomize) {
      return scenarios.map((scenario, index) => scenarioToProfile(scenario, index));
    }
    return shuffle(scenarios).map((scenario, index) => mutateScenario(scenario, index));
  }

  async function postBatch(profiles, timeoutMs = 60000) {
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timeoutId = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : 0;
    let resp;
    try {
      resp = await fetch('/api/training/workout-test-batch', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profiles }),
        signal: controller?.signal
      });
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error(`Batch timed out after ${Math.round(timeoutMs / 1000)}s`);
      }
      throw error;
    } finally {
      if (timeoutId) window.clearTimeout(timeoutId);
    }
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(String(json?.error || `Batch failed (${resp.status})`));
    return Array.isArray(json?.results) ? json.results : [];
  }

  function formatExercise(ex) {
    const name = String(ex?.displayName || ex?.name || 'Exercise').trim();
    const sets = Number(ex?.sets) || 0;
    const reps = String(ex?.reps || '').trim();
    const restSec = Number(ex?.restSec || ex?.rest) || 0;
    const pieces = [];
    if (sets) pieces.push(`${sets} sets`);
    if (reps) pieces.push(`${reps} reps`);
    if (restSec) pieces.push(`${restSec}s rest`);
    return `${name} | ${pieces.join(' | ')}`;
  }

  function getPlanDays(result) {
    const plan = result?.planRow?.plan || {};
    const week = Array.isArray(plan?.weeks) && plan.weeks.length ? plan.weeks[0] : { days: [] };
    return Array.isArray(week?.days) ? week.days : [];
  }

  function collectExerciseNames(result) {
    return getPlanDays(result)
      .flatMap((day) => (Array.isArray(day?.exercises) ? day.exercises : []))
      .map((ex) => String(ex?.displayName || ex?.name || '').trim())
      .filter(Boolean);
  }

  function collectExerciseEntries(result) {
    return getPlanDays(result)
      .flatMap((day) => (Array.isArray(day?.exercises) ? day.exercises : []))
      .filter(Boolean);
  }

  function inferExerciseEquipment(name) {
    const lower = String(name || '').trim().toLowerCase();
    if (!lower) return [];
    const requirements = new Set();
    if (/chest-supported row|supported dumbbell row/.test(lower)) requirements.add('dumbbell');
    if (/machine chest-supported row/.test(lower)) requirements.add('machine');
    if (/shotgun cable row|shotgun row/.test(lower)) requirements.add('cable');
    if (/\bcable\b|pushdown|pulldown|face pull|crossover|pulley|pallof|rope crunch|wood chop/.test(lower)) requirements.add('cable');
    if (/\bmachine\b|leg press|hack squat|smith|pec deck|seated row|chest press|leverage|glute ham|leg extension|leg curl|adductor|abductor/.test(lower)) requirements.add('machine');
    if (/\bbarbell\b|front squat|back squat|deadlift|hip thrust|good morning/.test(lower)) requirements.add('barbell');
    if (/\bdumbbell\b|goblet|bulgarian split squat/.test(lower)) requirements.add('dumbbell');
    if (/pull-up|push-up|chin-up|dip|bodyweight|plank|ab wheel|hollow|sit-up|platform hamstring slides|inverted row/.test(lower)) requirements.add('bodyweight');
    if (!requirements.size) {
      if (/row|curl|lateral raise|reverse fly|press/.test(lower)) requirements.add('dumbbell');
    }
    return Array.from(requirements);
  }

  function buildCanonicalFallback(ex) {
    const displayName = String(ex?.displayName || ex?.name || '').trim();
    const lower = displayName.toLowerCase();
    const requiredEquipment = Array.isArray(ex?.requiredEquipment) && ex.requiredEquipment.length
      ? [...new Set(ex.requiredEquipment.map((item) => {
        const token = String(item || '').trim().toLowerCase();
        return token === 'smith' ? 'machine' : token;
      }).filter(Boolean))]
      : inferExerciseEquipment(displayName);
    const directArmType = (ex?.directArmType && String(ex.directArmType).trim().toLowerCase()) || (
      isDirectBicepsText(lower) ? 'biceps' : isDirectTricepsText(lower) ? 'triceps' : /(wrist curl|reverse wrist|reverse curl|hammer curl|pronation|supination)/.test(lower) ? 'forearm' : 'none'
    );
    return {
      canonicalExerciseId: String(ex?.canonicalExerciseId || displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')).trim(),
      displayName,
      requiredEquipment,
      directArmType,
      directCalf: typeof ex?.directCalf === 'boolean' ? ex.directCalf : /\bcalf\b/.test(lower),
      directAb: typeof ex?.directAb === 'boolean' ? ex.directAb : /(ab|core|plank|crunch|sit-up|hollow|pallof|wood chop)/.test(lower),
      shoulderPressPattern: typeof ex?.shoulderPressPattern === 'boolean' ? ex.shoulderPressPattern : /shoulder press|overhead press|military press/.test(lower),
      lateralDeltPattern: typeof ex?.lateralDeltPattern === 'boolean' ? ex.lateralDeltPattern : /lateral raise|side lateral/.test(lower),
      rearDeltPattern: typeof ex?.rearDeltPattern === 'boolean' ? ex.rearDeltPattern : /rear delt|reverse fly|face pull|reverse pec deck/.test(lower),
      straightBar: typeof ex?.straightBar === 'boolean' ? ex.straightBar : /straight bar|barbell curl|incline barbell triceps extension|barbell shoulder press|military press|long bar row/.test(lower),
      wristExtensionHeavy: typeof ex?.wristExtensionHeavy === 'boolean' ? ex.wristExtensionHeavy : /wrist curl|reverse wrist curl|palms down|palms up/.test(lower),
      shoulderOverhead: typeof ex?.shoulderOverhead === 'boolean' ? ex.shoulderOverhead : /overhead press|shoulder press|military press|upright row/.test(lower),
      forwardKneeTravelHigh: typeof ex?.forwardKneeTravelHigh === 'boolean' ? ex.forwardKneeTravelHigh : /walking lunge|rear lunge|split squat|bulgarian|step up|step-up|sissy squat|pistol squat/.test(lower),
      deepKneeFlexionHigh: typeof ex?.deepKneeFlexionHigh === 'boolean' ? ex.deepKneeFlexionHigh : /hack squat|front squat|back squat|deep squat|sissy squat|pistol squat/.test(lower),
      axialLoadHigh: typeof ex?.axialLoadHigh === 'boolean' ? ex.axialLoadHigh : /back squat|front squat|good morning|conventional deadlift|barbell deadlift/.test(lower),
      deepHipFlexionHigh: typeof ex?.deepHipFlexionHigh === 'boolean' ? ex.deepHipFlexionHigh : /romanian deadlift from deficit|deficit rdl|stiff leg deadlift|good morning/.test(lower),
      hingeLoadingHigh: typeof ex?.hingeLoadingHigh === 'boolean' ? ex.hingeLoadingHigh : ((/bent over/.test(lower) && /row/.test(lower) && !/chest supported|head on bench|supported row|seal row/.test(lower)) || /conventional deadlift|stiff leg deadlift|romanian deadlift from deficit|good morning|bent over two-arm long bar row/.test(lower) || ((/deadlift|romanian deadlift|\brdl\b/.test(lower)) && /\bbarbell\b/.test(lower))),
      controlledHingeAllowed: typeof ex?.controlledHingeAllowed === 'boolean' ? ex.controlledHingeAllowed : /hip thrust|glute bridge|pull through|back extension|hyperextension/.test(lower),
      elbowSupinationStress: typeof ex?.elbowSupinationStress === 'boolean' ? ex.elbowSupinationStress : (directArmType === 'biceps' && !/hammer curl|reverse curl|neutral/.test(lower)),
      skullcrusherLike: typeof ex?.skullcrusherLike === 'boolean' ? ex.skullcrusherLike : /skull crusher|lying extension|incline barbell triceps extension|overhead triceps/.test(lower)
    };
  }

  function isDirectBicepsText(text) {
    const lower = String(text || '').trim().toLowerCase();
    return /(preacher|hammer curl|incline curl|barbell curl|dumbbell curl|cable curl|\breverse curl\b|\bcurl\b)/.test(lower)
      && !/(leg curl|hamstring curl|wrist curl|reverse wrist|palms-down|palms-up)/.test(lower);
  }

  function isDirectTricepsText(text) {
    const lower = String(text || '').trim().toLowerCase();
    return (
      /(triceps|pushdown|pressdown|skull crusher|kickback|overhead triceps|triceps extension|rope extension|lying extension)/.test(lower)
      || (/\bextension\b/.test(lower) && /(triceps|rope|cable|dumbbell|ez-bar|barbell|overhead|lying)/.test(lower))
    ) && !/(wrist|neck|leg extension|hip extension|back extension|shoulder extension)/.test(lower);
  }

  function muscleBucketsForText(text) {
    const lower = String(text || '').trim().toLowerCase();
    const hits = new Set();
    if (/bench|press|fly|pec/.test(lower)) hits.add('chest');
    if (/row|pull|lat|pulldown|chin/.test(lower)) hits.add('back');
    if (/shoulder|lateral raise|rear delt|overhead/.test(lower)) hits.add('shoulders');
    if (isDirectBicepsText(lower) || isDirectTricepsText(lower)) hits.add('arms');
    if (/squat|leg press|split squat|lunge|quad|leg extension/.test(lower)) hits.add('quads');
    if (/rdl|deadlift|hip thrust|hamstring|leg curl|glute/.test(lower)) hits.add('hamstrings_glutes');
    if (/calf/.test(lower)) hits.add('calves');
    if (/ab|core|plank|crunch|sit-up|hollow/.test(lower)) hits.add('abs');
    return hits;
  }

  function evaluateEquipmentMatch(summary, result, findings) {
    const access = summary?.equipmentAccess || {};
    const missing = new Set();
    collectExerciseEntries(result).forEach((exercise) => {
      buildCanonicalFallback(exercise).requiredEquipment.forEach((requirement) => {
        if (!access?.[requirement]) missing.add(requirement);
      });
    });
    if (missing.size) {
      findings.push({
        severity: 'fail',
        code: 'equipment_mismatch',
        message: `Plan uses equipment the user does not have: ${Array.from(missing).map(titleCase).join(', ')}.`
      });
    }
  }

  function evaluateScheduleMatch(summary, result, findings) {
    const expected = Number(summary?.daysPerWeek) || 0;
    const days = getPlanDays(result);
    if (!days.length) {
      findings.push({
        severity: 'fail',
        code: 'empty_plan',
        message: 'Generator returned no workout days.'
      });
      return;
    }
    if (expected && days.length !== expected) {
      findings.push({
        severity: 'fail',
        code: 'day_count_mismatch',
        message: `User requested ${expected} training days, but the plan returned ${days.length}.`
      });
    }
  }

  function evaluateEmphasisMatch(summary, result, findings) {
    const target = new Set(Array.isArray(summary?.emphasis) ? summary.emphasis : []);
    if (!target.size) return;
    const days = getPlanDays(result);
    const matched = new Set();
    days.forEach((day) => {
      const exercises = (Array.isArray(day?.exercises) ? day.exercises : []).map((exercise) => buildCanonicalFallback(exercise));
      exercises.forEach((exercise) => {
        if (exercise.directAb) matched.add('abs');
        if (exercise.directCalf) matched.add('calves');
        if (exercise.directArmType === 'biceps' || exercise.directArmType === 'triceps' || exercise.directArmType === 'forearm') matched.add('arms');
        if (exercise.shoulderPressPattern || exercise.lateralDeltPattern || exercise.rearDeltPattern) matched.add('shoulders');
      });
      const combined = [String(day?.focus || '').trim(), ...(Array.isArray(day?.exercises) ? day.exercises.map((ex) => ex?.displayName || ex?.name || '') : [])].join(' ');
      muscleBucketsForText(combined).forEach((bucket) => matched.add(bucket));
    });
    const missed = Array.from(target).filter((bucket) => !matched.has(bucket));
    if (missed.length) {
      findings.push({
        severity: 'questionable',
        code: 'emphasis_miss',
        message: `Plan does not clearly reflect the requested emphasis on ${formatEmphasis(missed)}.`
      });
    }
  }

  function evaluateStyleMatch(summary, result, findings) {
    const style = String(summary?.equipmentStylePref || '').trim().toLowerCase();
    if (!style) return;
    const entries = collectExerciseEntries(result);
    if (!entries.length) return;
    const counts = { barbell: 0, dumbbell: 0, machine: 0, cable: 0, bodyweight: 0 };
    entries.forEach((exercise) => {
      const reqs = buildCanonicalFallback(exercise).requiredEquipment;
      reqs.forEach((req) => {
        if (counts[req] != null) counts[req] += 1;
      });
    });
    const totalTagged = Object.values(counts).reduce((sum, value) => sum + value, 0);
    if (!totalTagged) return;

    if (style === 'barbell' && counts.barbell === 0) {
      findings.push({
        severity: 'questionable',
        code: 'style_barbell_ignored',
        message: 'Barbell-focused user did not clearly receive a barbell-focused exercise selection.'
      });
    }
    if (style === 'dumbbell' && counts.dumbbell === 0) {
      findings.push({
        severity: 'questionable',
        code: 'style_dumbbell_ignored',
        message: 'Dumbbell-focused user did not clearly receive a dumbbell-focused exercise selection.'
      });
    }
    if (style === 'machine' && (counts.machine + counts.cable) === 0) {
      findings.push({
        severity: 'questionable',
        code: 'style_machine_ignored',
        message: 'Machine-focused user did not clearly receive machine/cable-dominant exercise selection.'
      });
    }
  }

  function evaluateInjuryMatch(summary, result, findings) {
    const injury = summary?.injury || {};
    if (!injury?.has) return;
    const entries = collectExerciseEntries(result).map((exercise) => buildCanonicalFallback(exercise));
    const joined = `${String(injury.note || '').toLowerCase()} ${Array.isArray(injury.joints) ? injury.joints.join(' ') : ''}`;
    const pushFinding = (code, message) => findings.push({ severity: 'fail', code, message });

    if (joined.includes('shoulder') && entries.some((exercise) => exercise.shoulderOverhead)) {
      pushFinding('injury_shoulder', 'Shoulder-limited user received overhead-press style work that may ignore the note.');
    }
    if (joined.includes('elbow') && entries.some((exercise) => exercise.skullcrusherLike || exercise.elbowSupinationStress)) {
      pushFinding('injury_elbow', 'Elbow-limited user received elbow-irritating isolation choices.');
    }
    if (joined.includes('wrist') && entries.some((exercise) => exercise.straightBar || exercise.wristExtensionHeavy || exercise.shoulderOverhead && exercise.straightBar)) {
      pushFinding('injury_wrist', 'Wrist-limited user received straight-bar patterns that may clash with the note.');
    }
    if ((joined.includes('knee') || joined.includes('ankle')) && entries.some((exercise) => exercise.forwardKneeTravelHigh || exercise.deepKneeFlexionHigh)) {
      pushFinding('injury_knee_ankle', 'Knee/ankle-limited user received knee-travel heavy patterns that may conflict with the note.');
    }
    if ((joined.includes('back') || joined.includes('hip')) && entries.some((exercise) => exercise.hingeLoadingHigh || exercise.deepHipFlexionHigh)) {
      pushFinding('injury_back_hip', 'Back/hip-limited user received high-loading hinge work that may not respect the injury note.');
    }
  }

  function evaluatePlanQuality(summary, result, findings) {
    const days = getPlanDays(result);
    const entries = collectExerciseEntries(result);
    const truths = entries.map((exercise) => buildCanonicalFallback(exercise));
    const exerciseNames = entries.map((exercise) => String(exercise?.displayName || exercise?.name || '').trim()).filter(Boolean);
    const uniqueNames = new Set(exerciseNames.map((name) => String(name || '').toLowerCase()));
    if (exerciseNames.length && uniqueNames.size <= Math.max(2, Math.floor(exerciseNames.length * 0.45))) {
      findings.push({
        severity: 'questionable',
        code: 'too_repetitive',
        message: 'Plan looks unusually repetitive for this user profile.'
      });
    }
    const shortDays = days.filter((day) => (Array.isArray(day?.exercises) ? day.exercises.length : 0) < 4);
    if (shortDays.length >= Math.max(2, Math.ceil(days.length / 2))) {
      findings.push({
        severity: 'questionable',
        code: 'thin_day_design',
        message: 'Several days are very thin on exercise selection for a hypertrophy plan.'
      });
    }
    if ((summary?.timePerSession === '75_90_plus') && days.some((day) => (Array.isArray(day?.exercises) ? day.exercises.length : 0) <= 4)) {
      findings.push({
        severity: 'questionable',
        code: 'underfilled_long_sessions',
        message: 'High-session-time user received days that may be under-filled for the requested duration.'
      });
    }
    const emphasis = new Set(Array.isArray(summary?.emphasis) ? summary.emphasis : []);
    if (emphasis.has('shoulders')) {
      const shoulderDays = days.filter((day) => {
        return (Array.isArray(day?.exercises) ? day.exercises : []).map((exercise) => buildCanonicalFallback(exercise)).some((exercise) => exercise.shoulderPressPattern || exercise.lateralDeltPattern || exercise.rearDeltPattern);
      }).length;
      const hasPress = truths.some((exercise) => exercise.shoulderPressPattern);
      const hasLateralRear = truths.some((exercise) => exercise.lateralDeltPattern || exercise.rearDeltPattern);
      if ((Number(summary?.daysPerWeek) || 0) >= 4 && shoulderDays < 2) {
        findings.push({
          severity: 'questionable',
          code: 'shoulder_priority_soft',
          message: 'Shoulder-priority plan does not show repeated direct shoulder presence across the week.'
        });
      }
      if (!hasPress || !hasLateralRear) {
        findings.push({
          severity: 'questionable',
          code: 'shoulder_priority_incomplete',
          message: 'Shoulder-priority plan is missing either a shoulder press pattern or clear lateral/rear delt work.'
        });
      }
    }
    if (emphasis.has('arms')) {
      const hasBiceps = truths.some((exercise) => exercise.directArmType === 'biceps');
      const hasTriceps = truths.some((exercise) => exercise.directArmType === 'triceps');
      const armDays = days.filter((day) => {
        return (Array.isArray(day?.exercises) ? day.exercises : []).map((exercise) => buildCanonicalFallback(exercise)).some((exercise) => exercise.directArmType === 'biceps' || exercise.directArmType === 'triceps');
      }).length;
      if (!hasBiceps || !hasTriceps) {
        findings.push({
          severity: 'questionable',
          code: 'arm_priority_incomplete',
          message: 'Arm-priority plan is missing either direct biceps work or direct triceps work.'
        });
      }
      if ((Number(summary?.daysPerWeek) || 0) >= 4 && armDays < 2) {
        findings.push({
          severity: 'questionable',
          code: 'arm_priority_soft',
          message: 'Arm-priority plan does not show repeated direct arm presence across the week.'
        });
      }
    }
  }

  function evaluateResult(profile, result, runError = '') {
    if (!result?.planRow?.plan) {
      return {
        status: 'FAIL',
        findings: [{
          severity: 'fail',
          code: 'generation_failed',
          message: String(runError || 'Generator failed to return a workout.')
        }]
      };
    }

    const findings = [];
    const summary = profile?.profileSummary || result?.summary || {};
    evaluateScheduleMatch(summary, result, findings);
    evaluateEquipmentMatch(summary, result, findings);
    evaluateEmphasisMatch(summary, result, findings);
    evaluateStyleMatch(summary, result, findings);
    evaluateInjuryMatch(summary, result, findings);
    evaluatePlanQuality(summary, result, findings);

    const status = findings.some((item) => item.severity === 'fail')
      ? 'FAIL'
      : findings.length
        ? 'QUESTIONABLE'
        : 'PASS';

    return { status, findings };
  }

  function formatGeneratedWorkoutResult(result) {
    const days = getPlanDays(result);
    if (!days.length) return ['No workout days returned.'];
    return days.flatMap((day, dayIndex) => {
      const header = `Day ${dayIndex + 1}: ${String(day?.name || `Day ${dayIndex + 1}`).trim()}${day?.focus ? ` | Focus: ${String(day.focus).trim()}` : ''}`;
      const exercises = Array.isArray(day?.exercises) ? day.exercises : [];
      const lines = [header];
      if (!exercises.length) {
        lines.push('No exercises listed.');
      } else {
        exercises.forEach((ex, exIndex) => lines.push(`${exIndex + 1}. ${formatExercise(ex)}`));
      }
      lines.push('');
      return lines;
    });
  }

  function buildAggregateReport(results) {
    const coverage = {
      skill: {},
      phase: {},
      session: {},
      trainingAge: {},
      days: {},
      injury: { injured: 0, notInjured: 0 },
      equipmentStyle: {},
      equipmentPatterns: new Set()
    };
    const bugCounts = {};
    const statusCounts = { PASS: 0, QUESTIONABLE: 0, FAIL: 0 };
    const unstableCombos = {};

    results.forEach((result) => {
      const summary = result.summary || {};
      const qa = result.qa || { status: 'FAIL', findings: [] };
      statusCounts[qa.status] = (statusCounts[qa.status] || 0) + 1;
      coverage.skill[formatExperience(summary.experience)] = (coverage.skill[formatExperience(summary.experience)] || 0) + 1;
      coverage.phase[formatPhase(summary.phase)] = (coverage.phase[formatPhase(summary.phase)] || 0) + 1;
      coverage.session[formatTimePerSession(summary.timePerSession)] = (coverage.session[formatTimePerSession(summary.timePerSession)] || 0) + 1;
      coverage.trainingAge[formatTrainingAge(summary.trainingAgeBucket)] = (coverage.trainingAge[formatTrainingAge(summary.trainingAgeBucket)] || 0) + 1;
      coverage.days[String(summary.daysPerWeek || 'N/A')] = (coverage.days[String(summary.daysPerWeek || 'N/A')] || 0) + 1;
      coverage.equipmentStyle[formatEquipmentStyle(summary.equipmentStylePref)] = (coverage.equipmentStyle[formatEquipmentStyle(summary.equipmentStylePref)] || 0) + 1;
      coverage.equipmentPatterns.add(equipmentLabel(summary.equipmentAccess));
      const comboKey = [
        formatPhase(summary.phase),
        `${summary.daysPerWeek || 'N/A'}d`,
        formatTimePerSession(summary.timePerSession),
        formatEquipmentStyle(summary.equipmentStylePref),
        summary.injury?.has ? 'injured' : 'not injured'
      ].join(' | ');
      unstableCombos[comboKey] = unstableCombos[comboKey] || { total: 0, flagged: 0 };
      unstableCombos[comboKey].total += 1;
      if (qa.status !== 'PASS') unstableCombos[comboKey].flagged += 1;
      if (summary.injury?.has) coverage.injury.injured += 1;
      else coverage.injury.notInjured += 1;
      (qa.findings || []).forEach((finding) => {
        bugCounts[finding.code] = bugCounts[finding.code] || { count: 0, message: finding.message, severity: finding.severity };
        bugCounts[finding.code].count += 1;
      });
    });

    const bugList = Object.entries(bugCounts)
      .map(([code, value]) => ({ code, ...value }))
      .sort((a, b) => {
        const severityRank = { fail: 2, questionable: 1 };
        return (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0) || b.count - a.count;
      });

    const derivedFindingTotal = results.reduce((sum, result) => sum + ((result?.qa?.findings || []).length), 0);
    const aggregatedFindingTotal = bugList.reduce((sum, bug) => sum + Number(bug.count || 0), 0);
    const consistency = {
      findingTotalMatches: derivedFindingTotal === aggregatedFindingTotal,
      bugCategoriesMatch: bugList.every((bug) => results.some((result) => (result?.qa?.findings || []).some((finding) => finding.code === bug.code)))
    };

    return {
      coverage,
      statusCounts,
      bugList,
      hardFails: bugList.filter((bug) => bug.severity === 'fail'),
      softIssues: bugList.filter((bug) => bug.severity !== 'fail'),
      unstableCombos: Object.entries(unstableCombos)
        .filter(([, value]) => value.flagged > 0)
        .sort((a, b) => b[1].flagged - a[1].flagged || b[1].total - a[1].total)
        .slice(0, 6)
        .map(([combo, value]) => ({ combo, ...value })),
      mostConcerning: bugList.slice(0, 5),
      consistency
    };
  }

  function formatCountMap(map) {
    return Object.entries(map || {})
      .map(([key, value]) => `${key}: ${value}`)
      .join(' | ') || 'None';
  }

  function formatAggregateText(report) {
    if (!report) return '';
    const lines = [
      'QA COVERAGE SUMMARY',
      `Status Counts: PASS ${report.statusCounts.PASS || 0} | QUESTIONABLE ${report.statusCounts.QUESTIONABLE || 0} | FAIL ${report.statusCounts.FAIL || 0}`,
      `Skill Levels: ${formatCountMap(report.coverage.skill)}`,
      `Phases: ${formatCountMap(report.coverage.phase)}`,
      `Session Lengths: ${formatCountMap(report.coverage.session)}`,
      `Training Age: ${formatCountMap(report.coverage.trainingAge)}`,
      `Days / Week: ${formatCountMap(report.coverage.days)}`,
      `Injury Mix: Injured ${report.coverage.injury.injured} | Non-injured ${report.coverage.injury.notInjured}`,
      `Equipment Style: ${formatCountMap(report.coverage.equipmentStyle)}`,
      `Equipment Access Patterns: ${Array.from(report.coverage.equipmentPatterns).join(' | ')}`,
      '',
      'BUG SUMMARY'
    ];
    if (!report.bugList.length) {
      lines.push('No repeated failure patterns detected in this batch.');
    } else {
      report.bugList.forEach((bug, index) => {
        lines.push(`${index + 1}. ${bug.count}x | ${bug.message}`);
      });
    }
    lines.push('', 'HARD FAILS VS SOFTER QUALITY ISSUES');
    lines.push(`Hard Fails: ${report.hardFails.length ? report.hardFails.map((bug) => `${bug.count}x ${bug.message}`).join(' | ') : 'None'}`);
    lines.push(`Softer Issues: ${report.softIssues.length ? report.softIssues.map((bug) => `${bug.count}x ${bug.message}`).join(' | ') : 'None'}`);
    lines.push('', 'MOST CONCERNING ISSUES FIRST');
    if (!report.mostConcerning.length) {
      lines.push('No major issues detected.');
    } else {
      report.mostConcerning.forEach((bug, index) => {
        lines.push(`${index + 1}. ${bug.count}x | ${bug.message}`);
      });
    }
    lines.push('', 'MOST UNSTABLE INPUT COMBINATIONS');
    if (!report.unstableCombos.length) {
      lines.push('No unstable combinations detected.');
    } else {
      report.unstableCombos.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.flagged}/${item.total} flagged | ${item.combo}`);
      });
    }
    lines.push('', 'SUMMARY CONSISTENCY CHECK');
    lines.push(`Finding Totals Match: ${report.consistency?.findingTotalMatches ? 'Yes' : 'No'}`);
    lines.push(`Bug Categories Match Cases: ${report.consistency?.bugCategoriesMatch ? 'Yes' : 'No'}`);
    return lines.join('\n');
  }

  function renderAggregateCard(report) {
    if (!report) return '';
    const bugItems = report.bugList.length
      ? report.bugList.map((bug) => `<li>${escapeHtml(`${bug.count}x | ${bug.message}`)}</li>`).join('')
      : '<li>No repeated failure patterns detected.</li>';
    const topItems = report.mostConcerning.length
      ? report.mostConcerning.map((bug) => `<li>${escapeHtml(`${bug.count}x | ${bug.message}`)}</li>`).join('')
      : '<li>No major issues detected.</li>';

    return `
      <article class="workout-test-card">
        <div class="workout-test-card-head">
          <div>
            <div class="workout-test-card-title-row">
              <span class="workout-test-card-index">QA</span>
              <h3>Batch Summary</h3>
            </div>
            <p class="workout-test-card-sub">Coverage, repeated bug patterns, and highest-priority concerns from this live batch.</p>
          </div>
        </div>
        <div class="workout-test-meta-grid">
          <div class="workout-test-meta-box"><span>PASS</span><strong>${report.statusCounts.PASS || 0}</strong></div>
          <div class="workout-test-meta-box"><span>QUESTIONABLE</span><strong>${report.statusCounts.QUESTIONABLE || 0}</strong></div>
          <div class="workout-test-meta-box"><span>FAIL</span><strong>${report.statusCounts.FAIL || 0}</strong></div>
          <div class="workout-test-meta-box"><span>Days / Week</span><strong>${escapeHtml(formatCountMap(report.coverage.days))}</strong></div>
        </div>
        <pre class="workout-test-text">${escapeHtml(formatAggregateText(report))}</pre>
        <div class="workout-test-card-actions">
          <div style="font-weight:700;color:#5d6770;">Bug Summary</div>
        </div>
        <ul>${bugItems}</ul>
        <div class="workout-test-card-actions" style="margin-top:14px;">
          <div style="font-weight:700;color:#5d6770;">Most Concerning Issues First</div>
        </div>
        <ul>${topItems}</ul>
      </article>
    `;
  }

  function formatPlanText(result) {
    const summary = result.summary || {};
    const injury = summary.injury || {};
    const qa = result.qa || { status: 'FAIL', findings: [] };
    const lines = [
      `SIMULATED USER ${result.index}`,
      `Simulation Number: ${result.index}`,
      '',
      'FULL USER INPUT SUMMARY',
      `Name: ${result.label}`,
      `Program: Hypertrophy`,
      `Skill Level: ${formatExperience(summary.experience)}`,
      `Phase: ${formatPhase(summary.phase)}`,
      `Target Weight: ${summary.targetWeightLb ? `${summary.targetWeightLb} lb` : 'N/A'}`,
      `Bodyweight: ${summary.bodyweight || 'N/A'} lb`,
      `Height: ${summary.height || 'N/A'} in`,
      `Bench Variation: ${summary.benchVariation || 'N/A'}`,
      `Bench Working Weight: ${summary.benchWeight || 'N/A'} lb`,
      `Bench Reps: ${summary.benchReps || 'N/A'}`,
      `Lower-Body Lift: ${summary.lowerMovement || 'N/A'}`,
      `Lower-Body Working Weight: ${summary.lowerWeight || 'N/A'} lb`,
      `Lower-Body Reps: ${summary.lowerReps || 'N/A'}`,
      `Hinge Lift: ${summary.hingeMovement || 'N/A'}`,
      `Hinge Working Weight: ${summary.hingeWeight || 'N/A'} lb`,
      `Hinge Reps: ${summary.hingeReps || 'N/A'}`,
      `Pain/Injuries: ${injury.has ? 'Yes' : 'No'}`,
      `Joint(s): ${formatJoints(injury.joints)}`,
      `Severity: ${injury.has ? formatSeverityMap(injury.severityByJoint) : 'None'}`,
      `Avoid Notes: ${injury.has ? (injury.note || 'None listed') : 'None'}`,
      `Session Length: ${formatTimePerSession(summary.timePerSession)}`,
      `Training Age: ${formatTrainingAge(summary.trainingAgeBucket)}`,
      `Growth Emphasis: ${formatEmphasis(summary.emphasis)}`,
      `Equipment Style: ${formatEquipmentStyle(summary.equipmentStylePref)}`,
      `Equipment Access: ${equipmentLabel(summary.equipmentAccess)}`,
      `Days Per Week: ${summary.daysPerWeek || 'N/A'}`,
      `Cannot Train: ${formatCannotTrain(summary.unavailableDays)}`,
      '',
      `Why this case is a stress test: ${summary.stressReason || 'General live-flow hypertrophy coverage.'}`,
      '',
      'GENERATED WORKOUT RESULT',
      ...formatGeneratedWorkoutResult(result),
      `Status: ${qa.status}`,
      qa.findings.length ? 'Why Flagged:' : 'Why Flagged: None',
      ...(qa.findings.length ? qa.findings.map((finding, idx) => `${idx + 1}. ${finding.message}`) : []),
      ''
    ];

    return lines.join('\n').trim();
  }

  function resultMetaBoxes(result) {
    const summary = result.summary || {};
    return [
      { label: 'Phase', value: formatPhase(summary.phase) },
      { label: 'Skill', value: formatExperience(summary.experience) },
      { label: 'Days / Week', value: String(summary.daysPerWeek || 'N/A') },
      { label: 'Session', value: formatTimePerSession(summary.timePerSession) },
      { label: 'Training Age', value: formatTrainingAge(summary.trainingAgeBucket) },
      { label: 'Emphasis', value: formatEmphasis(summary.emphasis) },
      { label: 'Equipment', value: equipmentLabel(summary.equipmentAccess) },
      { label: 'Injury Flag', value: summary.injury?.has ? 'Yes' : 'No' },
      { label: 'Status', value: result?.qa?.status || 'Pending' }
    ];
  }

  function setStatus(message) {
    $('#workout-test-status').textContent = message;
  }

  function setLoading(message) {
    $('#workout-test-results').innerHTML = `<div class="workout-test-loading">${escapeHtml(message)}</div>`;
    setStatus(message);
  }

  function render() {
    const root = $('#workout-test-results');
    $('#workout-test-summary-batch').textContent = state.batchLabel;
    $('#workout-test-summary-count').textContent = String(state.results.length);
    $('#workout-test-summary-selected').textContent = String(state.selected.size);
    $('#workout-test-count-badge').textContent = `${state.selected.size} selected`;

    if (!state.results.length) {
      root.innerHTML = '<div class="workout-test-empty">No generated plans yet. Run a batch to preview 10 simulated users.</div>';
      return;
    }

    root.innerHTML = `${renderAggregateCard(state.aggregateReport)}${state.results.map((result) => {
      const boxes = resultMetaBoxes(result).map((row) => `
        <div class="workout-test-meta-box">
          <span>${escapeHtml(row.label)}</span>
          <strong>${escapeHtml(row.value)}</strong>
        </div>
      `).join('');
      return `
        <article class="workout-test-card" data-result-id="${escapeHtml(result.id)}">
          <div class="workout-test-card-head">
            <div>
              <div class="workout-test-card-title-row">
                <span class="workout-test-card-index">#${escapeHtml(result.index)}</span>
                <h3>${escapeHtml(result.label)}</h3>
              </div>
              <p class="workout-test-card-sub">${escapeHtml(result.tagline)}</p>
            </div>
            <label class="workout-test-card-check">
              <input type="checkbox" data-select-result="${escapeHtml(result.id)}" ${state.selected.has(result.id) ? 'checked' : ''}>
              <span>Select</span>
            </label>
          </div>
          <div class="workout-test-meta-grid">${boxes}</div>
          <pre class="workout-test-text">${escapeHtml(result.text)}</pre>
          <div class="workout-test-card-actions">
            <button class="btn btn-ghost" type="button" data-copy-one="${escapeHtml(result.id)}">Copy Text</button>
            <button class="btn btn-primary" type="button" data-pdf-one="${escapeHtml(result.id)}">Copy PDF</button>
          </div>
        </article>
      `;
    }).join('')}`;

    root.querySelectorAll('[data-select-result]').forEach((input) => {
      input.addEventListener('change', () => {
        const id = String(input.getAttribute('data-select-result') || '');
        if (!id) return;
        if (input.checked) state.selected.add(id);
        else state.selected.delete(id);
        render();
      });
    });

    root.querySelectorAll('[data-copy-one]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = String(btn.getAttribute('data-copy-one') || '');
        const found = state.results.find((row) => row.id === id);
        if (found) copyTextBlock([found]);
      });
    });

    root.querySelectorAll('[data-pdf-one]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = String(btn.getAttribute('data-pdf-one') || '');
        const found = state.results.find((row) => row.id === id);
        if (found) openPdf([found]);
      });
    });
  }

  function getSelectedResults() {
    const selected = state.results.filter((row) => state.selected.has(row.id));
    return selected.length ? selected : state.results;
  }

  async function copyTextBlock(results) {
    const batchSummary = formatAggregateText(state.aggregateReport);
    const text = `${batchSummary ? `${batchSummary}\n\n${'='.repeat(70)}\n\n` : ''}${results.map((row) => row.text).join('\n\n' + '='.repeat(70) + '\n\n')}`;
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Copied ${results.length} workout plan${results.length === 1 ? '' : 's'} to clipboard.`);
    } catch {
      setStatus('Clipboard copy failed. Your browser blocked the copy action.');
    }
  }

  function buildPdfHtml(results) {
    const batchSummary = formatAggregateText(state.aggregateReport);
    const sections = results.map((row) => `
      <section class="pdf-batch-card">
        <div class="pdf-batch-head">
          <div class="pdf-batch-index">Simulation ${escapeHtml(row.index)}</div>
          <div class="pdf-batch-title">${escapeHtml(row.label)}</div>
        </div>
        <pre class="pdf-batch-text">${escapeHtml(row.text)}</pre>
      </section>
    `).join('');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Workout Test Batch</title>
  <style>
    body { margin: 16mm; font-family: "Space Grotesk", Arial, sans-serif; color: #102738; }
    h1 { margin: 0 0 10px; font-size: 28px; letter-spacing: -0.05em; }
    .pdf-sub { margin: 0 0 22px; color: #5d6770; font-size: 12px; font-weight: 700; }
    .pdf-batch-card { border: 1px solid #d7dee6; border-radius: 16px; padding: 14px; margin-bottom: 16px; page-break-inside: avoid; }
    .pdf-batch-head { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; }
    .pdf-batch-index { display: inline-flex; align-items: center; justify-content: center; min-width: 88px; min-height: 32px; padding: 0 12px; border-radius: 999px; background: #102738; color: #fff; font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.08em; }
    .pdf-batch-title { font-size: 16px; font-weight: 900; }
    .pdf-batch-text { margin: 0; padding: 14px; border-radius: 12px; background: #f8fafc; border: 1px solid #e2e8f0; white-space: pre-wrap; word-break: break-word; font: 700 11px/1.6 "Space Grotesk", Arial, sans-serif; }
  </style>
</head>
<body>
  <h1>Workout Test Batch Export</h1>
  <div class="pdf-sub">${escapeHtml(state.batchLabel)} | ${results.length} generated workout plan${results.length === 1 ? '' : 's'}</div>
  ${batchSummary ? `<pre class="pdf-batch-text" style="margin-bottom:16px;">${escapeHtml(batchSummary)}</pre>` : ''}
  ${sections}
</body>
</html>`;
  }

  function openPdf(results) {
    if (!results.length) {
      setStatus('No workout plans selected for PDF export.');
      return;
    }
    const win = window.open('', '_blank');
    if (!win) {
      setStatus('Allow pop-ups to open the PDF export window.');
      return;
    }
    win.document.open();
    win.document.write(buildPdfHtml(results));
    win.document.close();
    win.focus();
    window.setTimeout(() => {
      try { win.print(); } catch {}
    }, 250);
    setStatus(`Opened PDF export for ${results.length} workout plan${results.length === 1 ? '' : 's'}.`);
  }

  function describeProfile(profile) {
    const summary = profile.profileSummary || {};
    return `${formatPhase(summary.phase)} | ${summary.daysPerWeek} day | ${formatTimePerSession(summary.timePerSession)} | ${formatEmphasis(summary.emphasis)} | ${profile?.qa?.status || 'Pending'}`;
  }

  function persistProfiles() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.lastProfiles));
    } catch {
      // ignore
    }
  }

  function hydrateProfiles() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(parsed) && parsed.length) state.lastProfiles = parsed;
    } catch {
      state.lastProfiles = [];
    }
  }

  async function runBatch({ randomize }) {
    const profiles = randomize ? buildProfiles(true) : (state.lastProfiles.length ? state.lastProfiles : buildProfiles(false));
    state.lastProfiles = profiles;
    state.results = [];
    state.selected = new Set();
    state.aggregateReport = null;
    state.batchLabel = randomize ? 'Random 10' : 'Same 10';
    $('#workout-test-run-mode').textContent = state.batchLabel;
    persistProfiles();
    render();

    setLoading(`Generating ${profiles.length} workout plans...`);
    try {
      const batchResults = await postBatch(
        profiles.map((profile) => ({
          label: profile.label,
          summary: profile.profileSummary,
          payload: profile.payload
        }))
      );
      state.results = batchResults.map((item, index) => {
        const profile = profiles[index];
        if (!item?.ok) {
          const qa = evaluateResult(profile, null, String(item?.error || 'Unknown generator failure'));
          return {
            id: `sim-${Date.now()}-${index}`,
            index: index + 1,
            label: profile?.label || item?.label || `Simulation ${index + 1}`,
            summary: profile?.profileSummary || item?.summary || {},
            planRow: null,
            qa,
            tagline: `${formatPhase(profile?.profileSummary?.phase)} | ${profile?.profileSummary?.daysPerWeek} day | Failed`,
            text: '',
            payload: profile?.payload || {}
          };
        }
        const result = {
          id: `sim-${Date.now()}-${index}`,
          index: index + 1,
          label: profile.label,
          summary: profile.profileSummary,
          planRow: item.plan,
          qa: null,
          tagline: '',
          text: '',
          payload: profile.payload
        };
        result.qa = evaluateResult(profile, result);
        result.tagline = describeProfile({ ...profile, qa: result.qa });
        result.text = formatPlanText(result);
        return result;
      });
      state.results.forEach((result) => {
        if (!result.text) result.text = formatPlanText(result);
      });
      state.aggregateReport = buildAggregateReport(state.results);
      state.selected = new Set(state.results.map((row) => row.id));
    } catch (error) {
      state.results = profiles.map((profile, index) => ({
        id: `sim-${Date.now()}-${index}`,
        index: index + 1,
        label: profile.label,
        summary: profile.profileSummary,
        planRow: null,
        qa: evaluateResult(profile, null, String(error?.message || error || 'Unknown batch failure')),
        tagline: `${formatPhase(profile?.profileSummary?.phase)} | ${profile?.profileSummary?.daysPerWeek} day | Failed`,
        text: '',
        payload: profile.payload
      }));
      state.results.forEach((result) => {
        result.text = formatPlanText(result);
      });
      state.aggregateReport = buildAggregateReport(state.results);
      state.selected = new Set(state.results.map((row) => row.id));
    }

    setStatus(`Finished generating ${state.results.length} workout simulations.`);
    render();
  }

  function bindEvents() {
    $('#workout-test-run-same')?.addEventListener('click', () => runBatch({ randomize: false }));
    $('#workout-test-run-random')?.addEventListener('click', () => runBatch({ randomize: true }));
    $('#workout-test-select-all')?.addEventListener('click', () => {
      state.selected = new Set(state.results.map((row) => row.id));
      render();
    });
    $('#workout-test-select-none')?.addEventListener('click', () => {
      state.selected.clear();
      render();
    });
    $('#workout-test-copy-selected')?.addEventListener('click', () => copyTextBlock(getSelectedResults()));
    $('#workout-test-pdf-selected')?.addEventListener('click', () => openPdf(getSelectedResults()));
  }

  function init() {
    hydrateProfiles();
    bindEvents();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
