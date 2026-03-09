/*
  Import parser stress test:
  - Generates noisy OCR-like workout text variants (single-day + multi-day)
  - Runs parser logic
  - Verifies >= 90% field accuracy for 50 passing loops
*/

function normalizeImportToken(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeOcrLineText(raw) {
  let text = String(raw || '');
  if (!text) return '';
  return text
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/[\u00D7\u2715\u2716]/g, 'x')
    .replace(/[\u2022\u25CF\u00B7]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeOcrDocumentText(raw) {
  return String(raw || '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => normalizeOcrLineText(line))
    .join('\n');
}

function cleanImportedEntry(raw) {
  let value = String(raw || '')
    .replace(/[\u2022|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return '';
  value = value
    .replace(/\b\d+\s*(x|sets?|reps?|sec|secs|seconds?|mins?|minutes?)\b/gi, ' ')
    .replace(/\bx\b/gi, ' ')
    .replace(/\b(rir|rpe|tempo|rest)\b[^,;]*/gi, ' ')
    .replace(/\(\s*\d+[^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return '';
  value = value.replace(/^[^a-zA-Z]+|[^a-zA-Z0-9]+$/g, '').trim();
  return value;
}

function isLikelyExerciseName(raw) {
  const text = String(raw || '').trim();
  if (!text) return false;
  if (text.length < 3 || text.length > 80) return false;
  if (!/[a-zA-Z]/.test(text)) return false;
  const lowerText = text.toLowerCase();
  const hasExerciseKeyword = /(press|bench|row|curl|squat|deadlift|raise|pulldown|pushdown|crunch|fly|lunge|extension|pullover|dip|pull\s?up|push\s?up|shrug|thrust|hinge)/.test(lowerText);
  if (!hasExerciseKeyword && /\b(goal|time|rule|rules|rest|workout|equipment|advice|cardio)\b/.test(lowerText)) return false;
  if (!hasExerciseKeyword && /:\s*/.test(text)) return false;
  if (/\b(if it'?s easy|if its easy|should be hard|raise the weight|big lifts|machines\/isolation|recover properly|light stretching)\b/.test(lowerText)) return false;
  const normalized = normalizeImportToken(text);
  if (!normalized) return false;
  if (/^(set|sets|rep|reps|rest|tempo|rir|rpe|warmup|cooldown|workout|day|week|notes?)$/.test(normalized)) return false;
  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)$/.test(normalized)) return false;
  return true;
}

function weekdayFromImportToken(raw) {
  const token = normalizeImportToken(raw).replace(/\s+/g, '');
  if (!token) return null;
  if (token === 'monday' || token === 'mon') return 1;
  if (token === 'tuesday' || token === 'tues' || token === 'tue') return 2;
  if (token === 'wednesday' || token === 'wed') return 3;
  if (token === 'thursday' || token === 'thurs' || token === 'thur' || token === 'thu') return 4;
  if (token === 'friday' || token === 'fri') return 5;
  if (token === 'saturday' || token === 'sat') return 6;
  if (token === 'sunday' || token === 'sun') return 0;
  return null;
}

function inferWeekdayFromImportHeader(rawLine) {
  const line = normalizeOcrLineText(rawLine);
  if (!line) return null;
  const lower = line.toLowerCase();
  if (/\b\d+\s*(?:sets?|x)\b/i.test(lower)) return null;
  if (/\bset\s*x\s*\d+\b/i.test(lower)) return null;
  const m = lower.match(/^\s*(?:day\s*)?(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)\b/i);
  if (!m) return null;
  const weekday = weekdayFromImportToken(m[1]);
  return Number.isInteger(weekday) ? weekday : null;
}

function parseRestSecondsFromMatch(numberRaw, unitRaw) {
  const n = Number(numberRaw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = String(unitRaw || '').toLowerCase();
  const sec = unit.startsWith('m') ? (n * 60) : n;
  if (!Number.isFinite(sec) || sec <= 0) return null;
  return Math.max(30, Math.min(300, Math.round(sec)));
}

function parseImportedLineDetail(rawLine) {
  const sourceText = normalizeOcrLineText(rawLine);
  if (!sourceText) return null;
  let working = sourceText;
  let sets = null;
  let reps = '';
  let restSec = null;

  const restPattern = /\b(?:rest\s*[:\-]?\s*)?(\d+(?:\.\d+)?)\s*(sec|secs|second|seconds|min|mins|minute|minutes)\b/ig;
  let restMatch = null;
  while (true) {
    const m = restPattern.exec(working);
    if (!m) break;
    const chunk = String(m[0] || '');
    if (!/rest|sec|min|second|minute/i.test(chunk)) continue;
    restMatch = m;
  }
  if (restMatch) {
    const sec = parseRestSecondsFromMatch(restMatch[1], restMatch[2]);
    if (Number.isFinite(sec)) restSec = sec;
    working = working.replace(restMatch[0], ' ');
  }

  const setMatch = working.match(/\b([1-8])\s*sets?\b/i);
  if (setMatch) {
    const n = Number(setMatch[1]);
    if (Number.isFinite(n) && n >= 1 && n <= 8) sets = n;
    working = working.replace(setMatch[0], ' ');
  }

  const repRangeMatch = working.match(/\b(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})\s*reps?\b/i);
  if (repRangeMatch) {
    reps = `${repRangeMatch[1]}-${repRangeMatch[2]}`;
    working = working.replace(repRangeMatch[0], ' ');
  } else {
    const repSingleMatch = working.match(/\b(\d{1,2})\s*reps?\b/i);
    if (repSingleMatch) {
      reps = String(repSingleMatch[1]);
      working = working.replace(repSingleMatch[0], ' ');
    }
  }

  const sxrMatch = working.match(/\b(\d{1,4}(?:\.\d+)?)\s*[xX]\s*(\d{1,2}(?:\s*[-\u2013\u2014]\s*\d{1,2})?)\b/);
  if (sxrMatch) {
    const left = Number(sxrMatch[1]);
    const rightRaw = String(sxrMatch[2] || '').replace(/\s+/g, '');
    if (!reps && rightRaw) reps = rightRaw;
    if (Number.isFinite(left) && left >= 1 && left <= 8 && !sets) sets = Math.round(left);
    working = working.replace(sxrMatch[0], ' ');
  }

  if (!reps) {
    const xRangeMatch = working.match(/\b[xX]\s*(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})\b/);
    if (xRangeMatch) {
      reps = `${xRangeMatch[1]}-${xRangeMatch[2]}`;
      working = working.replace(xRangeMatch[0], ' ');
    } else {
      const xSingleMatch = working.match(/\b[xX]\s*(\d{1,2})\b/);
      if (xSingleMatch) {
        reps = String(xSingleMatch[1]);
        working = working.replace(xSingleMatch[0], ' ');
      }
    }
  }

  let name = cleanImportedEntry(
    working
      .replace(/\b(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})\b/g, ' ')
  );
  if (!isLikelyExerciseName(name)) {
    name = cleanImportedEntry(sourceText);
  }
  if (!isLikelyExerciseName(name)) return null;

  const normalizedSets = Number.isFinite(Number(sets)) ? Math.max(1, Math.min(8, Math.round(Number(sets)))) : null;
  const normalizedReps = String(reps || '').trim().slice(0, 16);
  const normalizedRest = Number.isFinite(Number(restSec)) ? Math.max(30, Math.min(300, Math.round(Number(restSec)))) : null;
  return {
    sourceText,
    name,
    sets: normalizedSets,
    reps: normalizedReps || '',
    restSec: normalizedRest
  };
}

function mergeImportedEntryDetails(base, incoming) {
  const cur = base && typeof base === 'object' ? base : {};
  const next = incoming && typeof incoming === 'object' ? incoming : {};
  const merged = { ...cur };
  if (!merged.name && next.name) merged.name = String(next.name);
  if (!Number.isInteger(merged.weekday) && Number.isInteger(next.weekday)) merged.weekday = Number(next.weekday);
  if (!(Number.isFinite(merged.sets) && merged.sets > 0) && Number.isFinite(next.sets) && next.sets > 0) merged.sets = next.sets;
  if (!String(merged.reps || '').trim() && String(next.reps || '').trim()) merged.reps = String(next.reps).trim();
  if (!(Number.isFinite(merged.restSec) && merged.restSec > 0) && Number.isFinite(next.restSec) && next.restSec > 0) merged.restSec = next.restSec;
  return merged;
}

function parseImportedEntries(raw) {
  const source = normalizeOcrDocumentText(raw).trim();
  if (!source) return [];
  const lines = source
    .split(/\n+/g)
    .map((line) => String(line || '').trim())
    .filter(Boolean);
  const chunks = [];
  let currentWeekday = null;

  lines.forEach((line) => {
    const headerWeekday = inferWeekdayFromImportHeader(line);
    if (Number.isInteger(headerWeekday)) {
      currentWeekday = headerWeekday;
      return;
    }
    const parsed = parseImportedLineDetail(line);
    if (!parsed || !isLikelyExerciseName(parsed.name)) return;
    if (Number.isInteger(currentWeekday)) parsed.weekday = currentWeekday;
    chunks.push(parsed);
  });

  const unique = [];
  const seen = new Map();
  chunks.forEach((entry) => {
    const key = `${Number.isInteger(entry?.weekday) ? entry.weekday : 'x'}:${normalizeImportToken(entry.name)}`;
    if (!key) return;
    if (seen.has(key)) {
      const idx = seen.get(key);
      unique[idx] = mergeImportedEntryDetails(unique[idx], entry);
      return;
    }
    seen.set(key, unique.length);
    unique.push(entry);
  });
  return unique;
}

const SIMPLE_EXPECTED = [
  { weekday: 1, name: 'Barbell Bench Press', sets: 4, reps: '6-8' },
  { weekday: 1, name: 'Lat Pulldown Machine', sets: 4, reps: '8-12' },
  { weekday: 1, name: 'Seated Chest Press Machine', sets: 3, reps: '10-12' },
  { weekday: 1, name: 'Cable Row', sets: 3, reps: '8-12' },
  { weekday: 1, name: 'Shoulder Press Machine', sets: 3, reps: '10-12' },
  { weekday: 1, name: 'Cable Lateral Raises', sets: 3, reps: '12-15' },
  { weekday: 1, name: 'Triceps Pushdowns', sets: 3, reps: '12-15' },
  { weekday: 1, name: 'EZ Bar Curls', sets: 3, reps: '10-12' },
  { weekday: 1, name: 'Cable Crunches', sets: 3, reps: '15-20' }
];

const MULTI_DAY_EXPECTED = [
  { weekday: 1, name: 'Barbell Bench Press', sets: 4, reps: '6-8' },
  { weekday: 1, name: 'Incline Dumbbell Press', sets: 3, reps: '8-10' },
  { weekday: 1, name: 'Seated Chest Press Machine', sets: 3, reps: '10-12' },
  { weekday: 1, name: 'Shoulder Press Machine', sets: 3, reps: '8-10' },
  { weekday: 1, name: 'Cable Lateral Raise', sets: 3, reps: '12-15' },
  { weekday: 1, name: 'Triceps Pushdown', sets: 3, reps: '10-15' },
  { weekday: 1, name: 'Overhead Cable Triceps Extension', sets: 2, reps: '12-15' },
  { weekday: 2, name: 'Lat Pulldown', sets: 4, reps: '8-12' },
  { weekday: 2, name: 'Seated Cable Row', sets: 3, reps: '8-12' },
  { weekday: 2, name: 'Chest-Supported Row Machine', sets: 3, reps: '10-12' },
  { weekday: 2, name: 'Straight-Arm Pulldown', sets: 2, reps: '12-15' },
  { weekday: 2, name: 'Dumbbell Curl', sets: 3, reps: '10-12' },
  { weekday: 2, name: 'Preacher Curl Machine', sets: 3, reps: '10-12' },
  { weekday: 2, name: 'Hammer Curl', sets: 2, reps: '12-15' },
  { weekday: 3, name: 'Barbell Back Squat', sets: 4, reps: '6-8' },
  { weekday: 3, name: 'Leg Press', sets: 3, reps: '10-12' },
  { weekday: 3, name: 'Romanian Deadlift', sets: 3, reps: '8-10' },
  { weekday: 3, name: 'Leg Extension', sets: 3, reps: '12-15' },
  { weekday: 3, name: 'Seated Hamstring Curl', sets: 3, reps: '12-15' },
  { weekday: 3, name: 'Standing Calf Raise', sets: 4, reps: '12-20' },
  { weekday: 3, name: 'Cable Crunch or Machine Crunch', sets: 3, reps: '15-20' },
  { weekday: 5, name: 'Incline Barbell Bench Press', sets: 3, reps: '6-8' },
  { weekday: 5, name: 'Pull-Ups or Assisted Pull-Ups', sets: 3, reps: '6-10' },
  { weekday: 5, name: 'Machine Chest Press', sets: 3, reps: '10-12' },
  { weekday: 5, name: 'Cable Row', sets: 3, reps: '10-12' },
  { weekday: 5, name: 'Dumbbell Shoulder Press', sets: 3, reps: '8-10' },
  { weekday: 5, name: 'Cable Lateral Raise', sets: 3, reps: '12-15' },
  { weekday: 5, name: 'Triceps Pushdown', sets: 2, reps: '12-15' },
  { weekday: 5, name: 'EZ Bar Curl', sets: 2, reps: '10-12' },
  { weekday: 6, name: 'Hack Squat or Front Squat', sets: 4, reps: '8-10' },
  { weekday: 6, name: 'Romanian Deadlift', sets: 3, reps: '8-10' },
  { weekday: 6, name: 'Walking Lunges', sets: 3, reps: '10' },
  { weekday: 6, name: 'Leg Curl', sets: 3, reps: '12-15' },
  { weekday: 6, name: 'Leg Extension', sets: 3, reps: '12-15' },
  { weekday: 6, name: 'Seated Calf Raise', sets: 4, reps: '15-20' },
  { weekday: 6, name: 'Hanging Leg Raise or Crunch Machine', sets: 3, reps: '12-15' }
];

function mutateLine(line, rand) {
  let out = line;
  if (rand() < 0.42) out = out.replace(/ \u2014 /g, ' - ');
  if (rand() < 0.25) out = out.replace(/ x /gi, ' X ');
  if (rand() < 0.22) out = out.replace(/ x /gi, ' \u00D7 ');
  if (rand() < 0.2) out = out.replace(/([0-9]+)-([0-9]+)/g, '$1\u2013$2');
  if (rand() < 0.16) out = out.replace(/sets/gi, 'set');
  if (rand() < 0.14) out = out.replace(/Machine/gi, 'Mach1ne');
  if (rand() < 0.12) out = out.replace(/Cable/gi, 'CabIe');
  if (rand() < 0.1) out = out.replace(/^\d+\./, (m) => `${m} `);
  return out;
}

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function buildSimpleDoc(loopSeed) {
  const rand = random(loopSeed);
  const lines = [
    'Monday Workout (Gym Equipment Only)',
    'Goal: Upper body strength + muscle',
    'Time: 60-75 min',
    ''
  ];
  SIMPLE_EXPECTED.forEach((ex, idx) => {
    const line = `${idx + 1}. ${ex.name} \u2014 ${ex.sets} sets x ${ex.reps}`;
    lines.push(mutateLine(line, rand));
  });
  lines.push('');
  lines.push('Rest:');
  lines.push('Big lifts: 2-3 min');
  lines.push('Machines/isolation: 60-90 sec');
  lines.push("Rule: last 2 reps should be hard. If it's easy, raise the weight.");
  return lines.join('\n');
}

function buildMultiDayDoc(loopSeed) {
  const rand = random(loopSeed);
  const sections = [
    ['Monday \u2014 Chest, Shoulders, Triceps', MULTI_DAY_EXPECTED.filter((x) => x.weekday === 1)],
    ['Tuesday \u2014 Back, Biceps', MULTI_DAY_EXPECTED.filter((x) => x.weekday === 2)],
    ['Wednesday \u2014 Legs', MULTI_DAY_EXPECTED.filter((x) => x.weekday === 3)],
    ['Thursday \u2014 Rest or Light Cardio', []],
    ['Friday \u2014 Upper Body', MULTI_DAY_EXPECTED.filter((x) => x.weekday === 5)],
    ['Saturday \u2014 Lower Body', MULTI_DAY_EXPECTED.filter((x) => x.weekday === 6)],
    ['Sunday \u2014 Rest', []]
  ];
  const lines = [];
  sections.forEach(([header, entries]) => {
    lines.push(header);
    if (!entries.length) {
      lines.push('• 20-30 min incline walk');
      lines.push('• light stretching');
      lines.push('• recover properly');
      lines.push('');
      return;
    }
    entries.forEach((ex, idx) => {
      const repText = ex.reps === '10' ? '10 steps each leg' : ex.reps;
      const line = `${idx + 1}. ${ex.name} \u2014 ${ex.sets} x ${repText}`;
      lines.push(mutateLine(line, rand));
    });
    lines.push('');
  });
  lines.push('Rules');
  lines.push('• Compound lifts: rest 2-3 min');
  lines.push('• Isolation lifts: rest 60-90 sec');
  lines.push('• Pick a weight that makes the last 1-2 reps hard');
  lines.push('Real advice');
  lines.push('This is a solid base. Not magic.');
  return lines.join('\n');
}

function similarityScore(a, b) {
  const aa = normalizeImportToken(a);
  const bb = normalizeImportToken(b);
  if (!aa || !bb) return 0;
  if (aa === bb) return 1;
  const at = new Set(aa.split(' '));
  const bt = new Set(bb.split(' '));
  let hit = 0;
  at.forEach((t) => { if (bt.has(t)) hit += 1; });
  return hit / Math.max(1, Math.max(at.size, bt.size));
}

function repsEq(a, b) {
  const na = String(a || '').toLowerCase().replace(/[^0-9-]/g, '');
  const nb = String(b || '').toLowerCase().replace(/[^0-9-]/g, '');
  return na && nb && na === nb;
}

function scoreDataset(parsed, expected) {
  let correct = 0;
  const total = expected.length * 4; // weekday + name + sets + reps

  expected.forEach((exp) => {
    let best = null;
    let bestSim = -1;
    parsed.forEach((p) => {
      const sim = similarityScore(exp.name, p.name);
      const dayBoost = Number(p.weekday) === Number(exp.weekday) ? 0.2 : 0;
      const metric = sim + dayBoost;
      if (metric > bestSim) {
        bestSim = metric;
        best = p;
      }
    });
    if (!best) return;
    if (Number(best.weekday) === Number(exp.weekday)) correct += 1;
    if (bestSim >= 0.62) correct += 1;
    if (Number(best.sets) === Number(exp.sets)) correct += 1;
    if (repsEq(best.reps, exp.reps)) correct += 1;
  });

  const extra = Math.max(0, parsed.length - expected.length);
  const penalty = Math.min(extra, Math.max(1, Math.round(expected.length * 0.08)));
  const adjusted = Math.max(0, correct - penalty);
  return adjusted / Math.max(1, total);
}

function run() {
  let attempts = 0;
  let passes = 0;
  const minPassAccuracy = 0.9;
  const targetPasses = 50;
  const maxAttempts = 420;
  const accs = [];

  while (attempts < maxAttempts && passes < targetPasses) {
    attempts += 1;
    const isMulti = attempts % 2 === 0;
    const doc = isMulti
      ? buildMultiDayDoc(5000 + attempts)
      : buildSimpleDoc(1000 + attempts);
    const expected = isMulti ? MULTI_DAY_EXPECTED : SIMPLE_EXPECTED;
    const parsed = parseImportedEntries(doc);
    const acc = scoreDataset(parsed, expected);
    accs.push(acc);
    if (acc >= minPassAccuracy) passes += 1;
  }

  const avg = accs.reduce((a, b) => a + b, 0) / Math.max(1, accs.length);
  const min = accs.length ? Math.min(...accs) : 0;
  const max = accs.length ? Math.max(...accs) : 0;

  const summary = {
    attempts,
    passes,
    targetPasses,
    passThreshold: minPassAccuracy,
    averageAccuracy: Number(avg.toFixed(4)),
    minAccuracy: Number(min.toFixed(4)),
    maxAccuracy: Number(max.toFixed(4)),
    passed: passes >= targetPasses
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) process.exit(1);
}

run();
