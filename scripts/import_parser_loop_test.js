/*
  Import parser stress test:
  - Exercises OCR-like noise handling for multiple workout text formats
  - Verifies >= 90% field accuracy on at least 80% of runs
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
    .replace(/\b(\d{1,2})\s+to\s+(\d{1,2})\b/gi, '$1-$2')
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
    .replace(/\b\d+\s*(x|sets?|rounds?|reps?|sec|secs|seconds?|mins?|minutes?)\b/gi, ' ')
    .replace(/\bx\b/gi, ' ')
    .replace(/\b(rir|rpe|tempo|rest)\b[^,;]*/gi, ' ')
    .replace(/\(\s*\d+[^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!value) return '';
  value = value.replace(/^[^a-zA-Z]+|[^a-zA-Z0-9]+$/g, '').trim();
  return value;
}

function normalizeImportWeightToLb(value, unitHint = 'lb') {
  const raw = Number(value);
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const unit = String(unitHint || '').trim().toLowerCase();
  const lb = unit.startsWith('kg') ? (raw * 2.2046226218) : raw;
  const rounded = Math.round(lb * 2) / 2;
  if (!Number.isFinite(rounded) || rounded <= 0) return null;
  return Math.max(5, Math.min(2000, rounded));
}

function extractImportLastWeightHint(rawLine) {
  const line = normalizeOcrLineText(rawLine);
  if (!line) return null;
  const weightMatch = line.match(/\b(\d{2,4}(?:\.\d+)?)\s*(kg|kgs|kilograms?|lb|lbs|pounds?)\b/i);
  if (!weightMatch) return null;
  const hasLiftHint = /\b(last|last week|previous|prev|prior|lifted|weight|working weight|top set|used)\b/i.test(line);
  if (!hasLiftHint) return null;
  return normalizeImportWeightToLb(weightMatch[1], weightMatch[2] || 'lb');
}

function isImportWeightNoteLine(rawLine) {
  const line = normalizeOcrLineText(rawLine);
  if (!line) return false;
  const lower = line.toLowerCase();
  const hasWeight = /\b\d{2,4}(?:\.\d+)?\s*(kg|kgs|kilograms?|lb|lbs|pounds?)\b/.test(lower);
  if (!hasWeight) return false;
  if (!/\b(last|last week|previous|prev|prior|working weight|top set|used|weight)\b/.test(lower)) return false;
  if (/\b(sets?|reps?|rest|x\s*\d|day|session)\b/.test(lower)) return false;
  return true;
}

function isLikelyExerciseName(raw) {
  const text = String(raw || '').trim();
  if (!text) return false;
  if (text.length < 3 || text.length > 80) return false;
  if (!/[a-zA-Z]/.test(text)) return false;
  const lowerText = text.toLowerCase();
  const hasExerciseKeyword = /(press|bench|row|curl|squat|deadlift|raise|pulldown|pushdown|pushdowns|crunch|fly|lunge|extension|ext\b|pullover|dip|pull\s?up|push\s?up|shrug|thrust|hinge|rdl|laterals?|preacher|hamstring curl|leg ext|leg curl)/.test(lowerText);
  if (!hasExerciseKeyword && /\b(goal|time|rule|rules|rest|workout|equipment|advice|cardio|target|main work|accessory work|arm finisher|load and pacing guidance|guidance|session|emphasis|purpose)\b/.test(lowerText)) return false;
  if (!hasExerciseKeyword && /\b(last|last week|previous|prev|prior|working weight|top set|used)\b/.test(lowerText) && /\b(lb|lbs|kg|kgs|pounds?|dumbbells?)\b/.test(lowerText)) return false;
  if (!hasExerciseKeyword && /:\s*/.test(text)) return false;
  if (/\b(if it'?s easy|if its easy|should be hard|raise the weight|big lifts|machines\/isolation|recover properly|light stretching|not a lifting day|no lifting|focus on food|focus on sleep|focus on recovery)\b/.test(lowerText)) return false;
  const normalized = normalizeImportToken(text);
  if (!normalized) return false;
  if (/^(set|sets|rep|reps|rest|tempo|rir|rpe|warmup|cooldown|workout|day|week|notes?|main work|accessory work|arm finisher|core)$/.test(normalized)) return false;
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

function inferImportDayHeader(rawLine) {
  const line = normalizeOcrLineText(rawLine);
  if (!line) return null;
  const lower = line.toLowerCase();
  if (/\b\d+\s*(?:sets?|x)\b/i.test(lower)) return null;
  if (/\bset\s*x\s*\d+\b/i.test(lower)) return null;
  const named = lower.match(/^\s*(?:day\s*)?(monday|mon|tuesday|tues|tue|wednesday|wed|thursday|thurs|thur|thu|friday|fri|saturday|sat|sunday|sun)\b/i);
  if (named) {
    const weekday = weekdayFromImportToken(named[1]);
    if (Number.isInteger(weekday)) return { weekday };
  }
  const ordinal = lower.match(/^\s*day\s*([1-7])\b/i);
  if (ordinal) {
    const dayOrdinal = Number(ordinal[1]);
    if (Number.isInteger(dayOrdinal) && dayOrdinal >= 1 && dayOrdinal <= 7) return { dayOrdinal };
  }
  const sessionOrdinal = lower.match(/^\s*session\s*([1-7])\b/i);
  if (sessionOrdinal) {
    const dayOrdinal = Number(sessionOrdinal[1]);
    if (Number.isInteger(dayOrdinal) && dayOrdinal >= 1 && dayOrdinal <= 7) return { dayOrdinal };
  }
  return null;
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
  if (isImportWeightNoteLine(sourceText)) return null;

  let working = sourceText;
  let sets = null;
  let reps = '';
  let restSec = null;
  let projectedLb = null;
  working = working.replace(/\b(\d{1,2})\s+to\s+(\d{1,2})\b/gi, '$1-$2');

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

  if (!sets || !reps) {
    const setRepCombinedMatch = working.match(/\b([1-8])\s*(?:working\s*)?(?:sets?|rounds?)\s*(?:,|of)?\s*(\d{1,2}(?:\s*[-\u2013\u2014]\s*\d{1,2})?)\s*(?:reps?|steps?)?\b/i);
    if (setRepCombinedMatch) {
      if (!sets) {
        const n = Number(setRepCombinedMatch[1]);
        if (Number.isFinite(n) && n >= 1 && n <= 8) sets = n;
      }
      if (!reps) reps = String(setRepCombinedMatch[2] || '').replace(/\s+/g, '');
      working = working.replace(setRepCombinedMatch[0], ' ');
    }
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
    if (Number.isFinite(left) && left >= 20 && !projectedLb) projectedLb = normalizeImportWeightToLb(left, 'lb');
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

  const hinted = extractImportLastWeightHint(sourceText);
  if (!projectedLb && Number.isFinite(Number(hinted)) && Number(hinted) > 0) {
    projectedLb = Number(hinted);
  }

  let name = cleanImportedEntry(
    working
      .replace(/\b(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})\b/g, ' ')
  );
  if (!isLikelyExerciseName(name)) name = cleanImportedEntry(sourceText);
  if (!isLikelyExerciseName(name)) return null;

  return {
    sourceText,
    name,
    sets: Number.isFinite(Number(sets)) ? Math.max(1, Math.min(8, Math.round(Number(sets)))) : null,
    reps: String(reps || '').trim().slice(0, 16) || '',
    restSec: Number.isFinite(Number(restSec)) ? Math.max(30, Math.min(300, Math.round(Number(restSec)))) : null,
    projected: Number.isFinite(Number(projectedLb)) ? { value: Number(projectedLb), unit: 'lb' } : null
  };
}

function mergeImportedEntryDetails(base, incoming) {
  const cur = base && typeof base === 'object' ? base : {};
  const next = incoming && typeof incoming === 'object' ? incoming : {};
  const merged = { ...cur };
  if (!merged.name && next.name) merged.name = String(next.name);
  if (!Number.isInteger(merged.weekday) && Number.isInteger(next.weekday)) merged.weekday = Number(next.weekday);
  if (!Number.isInteger(merged.dayOrdinal) && Number.isInteger(next.dayOrdinal)) merged.dayOrdinal = Number(next.dayOrdinal);
  if (!(Number.isFinite(merged.sets) && merged.sets > 0) && Number.isFinite(next.sets) && next.sets > 0) merged.sets = next.sets;
  if (!String(merged.reps || '').trim() && String(next.reps || '').trim()) merged.reps = String(next.reps).trim();
  if (!(Number.isFinite(merged.restSec) && merged.restSec > 0) && Number.isFinite(next.restSec) && next.restSec > 0) merged.restSec = next.restSec;
  const curProjected = merged?.projected && Number.isFinite(Number(merged.projected.value))
    ? Number(merged.projected.value)
    : null;
  const nextProjected = next?.projected && Number.isFinite(Number(next.projected.value))
    ? Number(next.projected.value)
    : null;
  if (nextProjected != null && (curProjected == null || nextProjected > curProjected)) {
    merged.projected = { value: nextProjected, unit: 'lb' };
  }
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
  let currentDayOrdinal = null;

  lines.forEach((line) => {
    const header = inferImportDayHeader(line);
    if (header && typeof header === 'object') {
      if (Number.isInteger(header.weekday)) {
        currentWeekday = Number(header.weekday);
        currentDayOrdinal = null;
      } else if (Number.isInteger(header.dayOrdinal)) {
        currentDayOrdinal = Number(header.dayOrdinal);
        currentWeekday = null;
      }
      return;
    }
    const parsed = parseImportedLineDetail(line);
    if (!parsed || !isLikelyExerciseName(parsed.name)) {
      const hintedWeight = extractImportLastWeightHint(line);
      if (Number.isFinite(Number(hintedWeight)) && Number(hintedWeight) > 0 && chunks.length) {
        const last = chunks[chunks.length - 1];
        if (last && (!last.projected || !Number.isFinite(Number(last.projected.value)))) {
          last.projected = { value: Number(hintedWeight), unit: 'lb' };
        }
      }
      return;
    }
    if (Number.isInteger(currentWeekday)) parsed.weekday = currentWeekday;
    if (Number.isInteger(currentDayOrdinal)) parsed.dayOrdinal = currentDayOrdinal;
    chunks.push(parsed);
  });

  const unique = [];
  const seen = new Map();
  chunks.forEach((entry) => {
    const dayKey = Number.isInteger(entry?.weekday)
      ? `w${entry.weekday}`
      : (Number.isInteger(entry?.dayOrdinal) ? `d${entry.dayOrdinal}` : 'x');
    const key = `${dayKey}:${normalizeImportToken(entry.name)}`;
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
  { weekday: 1, name: 'Seated Chest Press Machine', sets: 3, reps: '10-12' }
];

const MULTI_DAY_EXPECTED = [
  { weekday: 1, name: 'Barbell Bench Press', sets: 4, reps: '6-8' },
  { weekday: 1, name: 'Overhead Cable Triceps Extension', sets: 2, reps: '12-15' },
  { weekday: 2, name: 'Lat Pulldown', sets: 4, reps: '8-12' },
  { weekday: 2, name: 'Hammer Curl Variation', sets: 2, reps: '12-15' },
  { weekday: 3, name: 'Back Squat', sets: 4, reps: '6-8' },
  { weekday: 5, name: 'EZ-Bar Curl', sets: 2, reps: '10-12' },
  { weekday: 6, name: 'Hack Squat or Front Squat', sets: 4, reps: '8-10' }
];

const DAY_ORDINAL_EXPECTED = [
  { dayOrdinal: 1, name: 'Flat Barbell Bench Press', sets: 4, reps: '6-8' },
  { dayOrdinal: 1, name: 'Rope Pushdown', sets: 3, reps: '10-15' },
  { dayOrdinal: 2, name: 'Wide or Medium-Grip Lat Pulldown', sets: 4, reps: '8-12' },
  { dayOrdinal: 2, name: 'Preacher Curl Machine', sets: 3, reps: '10-12' },
  { dayOrdinal: 3, name: 'Back Squat', sets: 4, reps: '6-8' },
  { dayOrdinal: 3, name: 'Cable or Machine Crunch', sets: 3, reps: '15-20' },
  { dayOrdinal: 5, name: 'Incline Barbell Press', sets: 3, reps: '6-8' },
  { dayOrdinal: 6, name: 'Seated Calf Raise', sets: 4, reps: '15-20' }
];

const SHORTHAND_EXPECTED = [
  { weekday: 1, name: 'Bench', sets: 4, reps: '6-8' },
  { weekday: 1, name: 'OH Triceps Ext', sets: 2, reps: '12-15' },
  { weekday: 2, name: 'Pulldown', sets: 4, reps: '8-12' },
  { weekday: 2, name: 'DB Curl', sets: 3, reps: '10-12' },
  { weekday: 3, name: 'RDL', sets: 3, reps: '8-10' },
  { weekday: 3, name: 'Leg Ext', sets: 3, reps: '12-15' }
];

const SESSION_EXPECTED = [
  { dayOrdinal: 1, name: 'Barbell Bench Press', sets: 4, reps: '6-8' },
  { dayOrdinal: 1, name: 'Machine Shoulder Press', sets: 3, reps: '8-10' },
  { dayOrdinal: 1, name: 'Overhead Cable Triceps Extension', sets: 2, reps: '12-15' },
  { dayOrdinal: 2, name: 'Lat Pulldown', sets: 4, reps: '8-12' },
  { dayOrdinal: 2, name: 'Straight-Arm Pulldown', sets: 2, reps: '12-15' },
  { dayOrdinal: 2, name: 'Hammer Curl', sets: 2, reps: '12-15' },
  { dayOrdinal: 3, name: 'Back Squat', sets: 4, reps: '6-8' },
  { dayOrdinal: 3, name: 'Standing Calf Raise', sets: 4, reps: '12-20' },
  { dayOrdinal: 5, name: 'Pull-Ups or Assisted Pull-Ups', sets: 3, reps: '6-10' },
  { dayOrdinal: 6, name: 'Hack Squat or Front Squat', sets: 4, reps: '8-10' }
];

const LAST_WEEK_NOTES_EXPECTED = [
  { weekday: 1, name: 'Bench Press', sets: 4, reps: '6-8', projected: 185 },
  { weekday: 1, name: 'Incline Dumbbell Press', sets: 3, reps: '8-10', projected: 70 },
  { weekday: 1, name: 'Seated Shoulder Press', sets: 3, reps: '8-12', projected: 55 },
  { weekday: 1, name: 'Cable Lateral Raise', sets: 3, reps: '12-15', projected: 20 },
  { weekday: 1, name: 'Rope Triceps Pushdown', sets: 3, reps: '10-15', projected: 50 },
  { weekday: 2, name: 'Lat Pulldown', sets: 4, reps: '8-10', projected: 140 },
  { weekday: 2, name: 'Barbell Row', sets: 3, reps: '6-8', projected: 165 },
  { weekday: 2, name: 'Seated Cable Row', sets: 3, reps: '10-12', projected: 130 },
  { weekday: 2, name: 'Rear Delt Fly', sets: 3, reps: '12-15', projected: 25 },
  { weekday: 2, name: 'Dumbbell Curl', sets: 3, reps: '10-12', projected: 35 },
  { weekday: 3, name: 'Back Squat', sets: 4, reps: '6-8', projected: 225 },
  { weekday: 3, name: 'Romanian Deadlift', sets: 3, reps: '8-10', projected: 185 },
  { weekday: 3, name: 'Leg Press', sets: 3, reps: '10-12', projected: 405 }
];

function mutateLine(line, rand) {
  let out = line;
  if (rand() < 0.35) out = out.replace(/ \u2014 /g, ' - ');
  if (rand() < 0.2) out = out.replace(/ x /gi, ' X ');
  if (rand() < 0.2) out = out.replace(/ x /gi, ' \u00D7 ');
  if (rand() < 0.18) out = out.replace(/([0-9]+)-([0-9]+)/g, '$1\u2013$2');
  if (rand() < 0.12) out = out.replace(/sets/gi, 'set');
  if (rand() < 0.08) out = out.replace(/^\d+\./, (m) => `${m} `);
  return out;
}

function random(seed) {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

function buildSimpleDoc(seed) {
  const rand = random(seed);
  const lines = ['Monday Workout', ''];
  SIMPLE_EXPECTED.forEach((ex, i) => lines.push(mutateLine(`${i + 1}. ${ex.name} \u2014 ${ex.sets} sets x ${ex.reps}`, rand)));
  lines.push('Rule: last reps should be hard');
  return lines.join('\n');
}

function buildMultiDoc(seed) {
  const rand = random(seed);
  const lines = [
    'Monday \u2014 Chest, Shoulders, Triceps',
    mutateLine('1. Barbell Bench Press \u2014 4 x 6-8', rand),
    mutateLine('7. Overhead Cable Triceps Extension \u2014 2 x 12-15', rand),
    '',
    'Tuesday \u2014 Back, Biceps',
    mutateLine('1. Lat Pulldown \u2014 4 x 8-12', rand),
    mutateLine('7. Hammer Curl Variation \u2014 2 x 12-15', rand),
    '',
    'Wednesday \u2014 Legs',
    mutateLine('1. Back Squat \u2014 4 working sets of 6-8', rand),
    '',
    'Thursday \u2014 Rest or Light Cardio',
    '• light stretching',
    '',
    'Friday \u2014 Upper Body',
    mutateLine('8. EZ-Bar Curl \u2014 2 x 10-12', rand),
    '',
    'Saturday \u2014 Lower Body',
    mutateLine('1. Hack Squat or Front Squat \u2014 4 x 8-10', rand)
  ];
  return lines.join('\n');
}

function buildDayOrdinalDoc(seed) {
  const rand = random(seed);
  const lines = [
    '5-Day Gym Split',
    '',
    'Day 1 \u2014 Push Focus',
    'Target: chest, shoulders, triceps',
    mutateLine('• Flat Barbell Bench Press \u2014 4 rounds of 6-8 reps', rand),
    mutateLine('• Rope Pushdown \u2014 3 rounds of 10-15 reps', rand),
    '',
    'Day 2 \u2014 Pull Focus',
    mutateLine('• Wide or Medium-Grip Lat Pulldown \u2014 4 sets of 8-12', rand),
    mutateLine('• Preacher Curl Machine \u2014 3 sets of 10-12', rand),
    '',
    'Day 3 \u2014 Lower Body Session',
    mutateLine('• Back Squat \u2014 4 working sets of 6-8', rand),
    mutateLine('• Cable or Machine Crunch \u2014 3 working sets of 15-20', rand),
    '',
    'Day 4 \u2014 Recovery Day',
    'Not a lifting day',
    '',
    'Day 5 \u2014 Upper Body Mix',
    mutateLine('• Incline Barbell Press \u2014 3 x 6-8', rand),
    '',
    'Day 6 \u2014 Lower Body Variation',
    mutateLine('• Seated Calf Raise \u2014 4 x 15-20', rand)
  ];
  return lines.join('\n');
}

function buildShorthandDoc(seed) {
  const rand = random(seed);
  const lines = [
    'Monday / Push',
    mutateLine('Bench 4x6-8', rand),
    mutateLine('OH Triceps Ext 2x12-15', rand),
    '',
    'Tuesday / Pull',
    mutateLine('Pulldown 4x8-12', rand),
    mutateLine('DB Curl 3x10-12', rand),
    '',
    'Wednesday / Legs',
    mutateLine('RDL 3x8-10', rand),
    mutateLine('Leg Ext 3x12-15', rand)
  ];
  return lines.join('\n');
}

function buildSessionDoc(seed) {
  const rand = random(seed);
  const lines = [
    'Session 1: Chest / Delts / Triceps',
    'Primary emphasis: pressing muscles',
    'Main work',
    mutateLine('• Barbell Bench Press — 4 sets, 6 to 8 reps', rand),
    mutateLine('• Incline Dumbbell Press — 3 sets, 8 to 10 reps', rand),
    mutateLine('• Seated Chest Press Machine — 3 sets, 10 to 12 reps', rand),
    'Accessory work',
    mutateLine('• Machine Shoulder Press — 3 sets, 8 to 10 reps', rand),
    mutateLine('• Cable Lateral Raise — 3 sets, 12 to 15 reps', rand),
    'Arm finisher',
    mutateLine('• Triceps Pushdown — 3 sets, 10 to 15 reps', rand),
    mutateLine('• Overhead Cable Triceps Extension — 2 sets, 12 to 15 reps', rand),
    '',
    'Session 2: Back / Biceps',
    'Primary emphasis: lats, upper back, arm flexors',
    mutateLine('• Lat Pulldown — 4 sets, 8 to 12 reps', rand),
    mutateLine('• Seated Cable Row — 3 sets, 8 to 12 reps', rand),
    mutateLine('• Chest-Supported Row — 3 sets, 10 to 12 reps', rand),
    mutateLine('• Straight-Arm Pulldown — 2 sets, 12 to 15 reps', rand),
    mutateLine('• Hammer Curl — 2 sets, 12 to 15 reps', rand),
    '',
    'Session 3: Lower Body',
    mutateLine('• Back Squat — 4 sets, 6 to 8 reps', rand),
    mutateLine('• Standing Calf Raise — 4 sets, 12 to 20 reps', rand),
    '',
    'Session 4: Recovery / Low Output Day',
    'No lifting.',
    'Focus on food, sleep, and recovery.',
    '',
    'Session 5: Upper Body Combination',
    mutateLine('• Pull-Ups or Assisted Pull-Ups — 3 sets, 6 to 10 reps', rand),
    '',
    'Session 6: Lower Body Variation',
    mutateLine('• Hack Squat or Front Squat — 4 sets, 8 to 10 reps', rand)
  ];
  return lines.join('\n');
}

function buildLastWeekNotesDoc(seed) {
  const rand = random(seed);
  const lines = [
    'Monday — Push',
    mutateLine('• Bench Press — 4 x 6-8 — Rest 2 min', rand),
    mutateLine('  Last week: 185 lb', rand),
    mutateLine('• Incline Dumbbell Press — 3 x 8-10 — Rest 90 sec', rand),
    mutateLine('  Last week: 70 lb dumbbells', rand),
    mutateLine('• Seated Shoulder Press — 3 x 8-12 — Rest 90 sec', rand),
    mutateLine('  Last week: 55 lb dumbbells', rand),
    mutateLine('• Cable Lateral Raise — 3 x 12-15 — Rest 60 sec', rand),
    mutateLine('  Last week: 20 lb', rand),
    mutateLine('• Rope Triceps Pushdown — 3 x 10-15 — Rest 60 sec', rand),
    mutateLine('  Last week: 50 lb', rand),
    '',
    'Tuesday — Pull',
    mutateLine('• Lat Pulldown — 4 x 8-10 — Rest 90 sec', rand),
    mutateLine('  Last week: 140 lb', rand),
    mutateLine('• Barbell Row — 3 x 6-8 — Rest 2 min', rand),
    mutateLine('  Last week: 165 lb', rand),
    mutateLine('• Seated Cable Row — 3 x 10-12 — Rest 75 sec', rand),
    mutateLine('  Last week: 130 lb', rand),
    mutateLine('• Rear Delt Fly — 3 x 12-15 — Rest 60 sec', rand),
    mutateLine('  Last week: 25 lb dumbbells', rand),
    mutateLine('• Dumbbell Curl — 3 x 10-12 — Rest 60 sec', rand),
    mutateLine('  Last week: 35 lb dumbbells', rand),
    '',
    'Wednesday — Legs',
    mutateLine('• Back Squat — 4 x 6-8 — Rest 2-3 min', rand),
    mutateLine('  Last week: 225 lb', rand),
    mutateLine('• Romanian Deadlift — 3 x 8-10 — Rest 2 min', rand),
    mutateLine('  Last week: 185 lb', rand),
    mutateLine('• Leg Press — 3 x 10-12 — Rest 90 sec', rand),
    mutateLine('  Last week: 405 lb', rand)
  ];
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

function projectedEq(a, b) {
  const aa = Number(a);
  const bb = Number(b);
  if (!Number.isFinite(aa) || !Number.isFinite(bb)) return false;
  return Math.abs(aa - bb) <= 5;
}

function scoreDataset(parsed, expected) {
  let correct = 0;
  let total = 0;
  expected.forEach((exp) => {
    total += 4;
    if (Number.isFinite(Number(exp?.projected))) total += 1;
    let best = null;
    let bestSim = -1;
    parsed.forEach((p) => {
      const sim = similarityScore(exp.name, p.name);
      const dayMatch = Number.isInteger(exp.weekday)
        ? (Number(p.weekday) === Number(exp.weekday))
        : (Number(p.dayOrdinal) === Number(exp.dayOrdinal));
      const metric = sim + (dayMatch ? 0.25 : 0);
      if (metric > bestSim) {
        bestSim = metric;
        best = p;
      }
    });
    if (!best) return;
    const dayOk = Number.isInteger(exp.weekday)
      ? (Number(best.weekday) === Number(exp.weekday))
      : (Number(best.dayOrdinal) === Number(exp.dayOrdinal));
    if (dayOk) correct += 1;
    if (bestSim >= 0.6) correct += 1;
    if (Number(best.sets) === Number(exp.sets)) correct += 1;
    if (repsEq(best.reps, exp.reps)) correct += 1;
    if (Number.isFinite(Number(exp?.projected))) {
      const projected = Number(best?.projected?.value);
      if (projectedEq(projected, Number(exp.projected))) correct += 1;
    }
  });
  const extra = Math.max(0, parsed.length - expected.length);
  const penalty = Math.min(extra, Math.max(1, Math.round(expected.length * 0.1)));
  return Math.max(0, (correct - penalty) / Math.max(1, total));
}

function run() {
  const datasets = [
    { expected: SIMPLE_EXPECTED, build: buildSimpleDoc },
    { expected: MULTI_DAY_EXPECTED, build: buildMultiDoc },
    { expected: DAY_ORDINAL_EXPECTED, build: buildDayOrdinalDoc },
    { expected: SHORTHAND_EXPECTED, build: buildShorthandDoc },
    { expected: SESSION_EXPECTED, build: buildSessionDoc },
    { expected: LAST_WEEK_NOTES_EXPECTED, build: buildLastWeekNotesDoc }
  ];

  let attempts = 0;
  let passes = 0;
  const minPassAccuracy = 0.9;
  const minPassRatio = 0.8;
  const minAttempts = 120;
  const maxAttempts = 240;
  const accs = [];

  while (attempts < maxAttempts) {
    attempts += 1;
    const ds = datasets[(attempts - 1) % datasets.length];
    const doc = ds.build(1000 + attempts);
    const parsed = parseImportedEntries(doc);
    const acc = scoreDataset(parsed, ds.expected);
    accs.push(acc);
    if (acc >= minPassAccuracy) passes += 1;
    if (attempts >= minAttempts) {
      const ratio = passes / Math.max(1, attempts);
      if (ratio >= minPassRatio) break;
    }
  }

  const avg = accs.reduce((a, b) => a + b, 0) / Math.max(1, accs.length);
  const min = accs.length ? Math.min(...accs) : 0;
  const max = accs.length ? Math.max(...accs) : 0;
  const passRatio = passes / Math.max(1, attempts);

  const summary = {
    attempts,
    passes,
    passRatio: Number(passRatio.toFixed(4)),
    requiredPassRatio: minPassRatio,
    passThreshold: minPassAccuracy,
    minimumAttempts: minAttempts,
    averageAccuracy: Number(avg.toFixed(4)),
    minAccuracy: Number(min.toFixed(4)),
    maxAccuracy: Number(max.toFixed(4)),
    passed: attempts >= minAttempts && passRatio >= minPassRatio
  };

  console.log(JSON.stringify(summary, null, 2));
  if (!summary.passed) process.exit(1);
}

run();
