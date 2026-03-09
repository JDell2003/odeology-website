/*
  Import parser stress test:
  - Generates noisy OCR-like workout text variants
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
  if (!hasExerciseKeyword && /\b(goal|time|rule|rest|workout|equipment)\b/.test(lowerText)) return false;
  if (!hasExerciseKeyword && /:\s*/.test(text)) return false;
  if (/\b(if it'?s easy|if its easy|should be hard|raise the weight|big lifts|machines\/isolation)\b/.test(lowerText)) return false;
  const normalized = normalizeImportToken(text);
  if (!normalized) return false;
  if (/^(set|sets|rep|reps|rest|tempo|rir|rpe|warmup|cooldown|workout|day|week|notes?)$/.test(normalized)) return false;
  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/.test(normalized)) return false;
  return true;
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
  if (!(Number.isFinite(merged.sets) && merged.sets > 0) && Number.isFinite(next.sets) && next.sets > 0) merged.sets = next.sets;
  if (!String(merged.reps || '').trim() && String(next.reps || '').trim()) merged.reps = String(next.reps).trim();
  if (!(Number.isFinite(merged.restSec) && merged.restSec > 0) && Number.isFinite(next.restSec) && next.restSec > 0) merged.restSec = next.restSec;
  return merged;
}

function parseImportedEntries(raw) {
  const source = normalizeOcrDocumentText(raw).trim();
  if (!source) return [];
  const chunks = source
    .split(/[\n,;]+/g)
    .map((line) => parseImportedLineDetail(line))
    .filter(Boolean)
    .filter((entry) => isLikelyExerciseName(entry.name));
  const unique = [];
  const seen = new Map();
  chunks.forEach((entry) => {
    const key = normalizeImportToken(entry.name);
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

const EXPECTED = [
  { name: 'Barbell Bench Press', sets: 4, reps: '6-8' },
  { name: 'Lat Pulldown Machine', sets: 4, reps: '8-12' },
  { name: 'Seated Chest Press Machine', sets: 3, reps: '10-12' },
  { name: 'Cable Row', sets: 3, reps: '8-12' },
  { name: 'Shoulder Press Machine', sets: 3, reps: '10-12' },
  { name: 'Cable Lateral Raises', sets: 3, reps: '12-15' },
  { name: 'Triceps Pushdowns', sets: 3, reps: '12-15' },
  { name: 'EZ Bar Curls', sets: 3, reps: '10-12' },
  { name: 'Cable Crunches', sets: 3, reps: '15-20' }
];

function mutateLine(line, rand) {
  let out = line;
  if (rand() < 0.4) out = out.replace(/ \u2014 /g, ' - ');
  if (rand() < 0.3) out = out.replace(/ x /gi, ' X ');
  if (rand() < 0.28) out = out.replace(/ x /gi, ' \u00D7 ');
  if (rand() < 0.25) out = out.replace(/sets/gi, 'set');
  if (rand() < 0.2) out = out.replace(/Bench/gi, '8ench');
  if (rand() < 0.2) out = out.replace(/Lat/gi, 'Laf');
  if (rand() < 0.2) out = out.replace(/Cable/gi, 'CabIe');
  if (rand() < 0.2) out = out.replace(/Machine/gi, 'Mach1ne');
  if (rand() < 0.16) out = out.replace(/Pushdowns/gi, 'Pushd0wns');
  if (rand() < 0.14) out = out.replace(/Crunches/gi, 'Crunches.');
  if (rand() < 0.2) out = out.replace(/([0-9]+)-([0-9]+)/g, '$1\u2013$2');
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

function buildSyntheticDoc(loopSeed) {
  const rand = random(loopSeed);
  const lines = [
    'Monday Workout (Gym Equipment Only)',
    'Goal: Upper body strength + muscle',
    'Time: 60-75 min',
    ''
  ];
  EXPECTED.forEach((ex, idx) => {
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

function scoreLoop(parsed) {
  let correct = 0;
  let total = EXPECTED.length * 3; // name + sets + reps

  EXPECTED.forEach((exp) => {
    let best = null;
    let bestScore = -1;
    parsed.forEach((p) => {
      const s = similarityScore(exp.name, p.name);
      if (s > bestScore) {
        bestScore = s;
        best = p;
      }
    });
    if (!best) return;
    if (bestScore >= 0.6) correct += 1;
    if (Number(best.sets) === Number(exp.sets)) correct += 1;
    if (String(best.reps || '').replace(/\s+/g, '') === String(exp.reps || '').replace(/\s+/g, '')) correct += 1;
  });

  return correct / Math.max(1, total);
}

function run() {
  let attempts = 0;
  let passes = 0;
  const minPassAccuracy = 0.9;
  const targetPasses = 50;
  const maxAttempts = 300;
  const accs = [];

  while (attempts < maxAttempts && passes < targetPasses) {
    attempts += 1;
    const doc = buildSyntheticDoc(1000 + attempts);
    const parsed = parseImportedEntries(doc);
    const acc = scoreLoop(parsed);
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


