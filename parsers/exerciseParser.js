const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MASTER_PATH = path.join(ROOT, 'data', 'exercises.master.js');
const REJECTED_LOG_PATH = path.join(ROOT, 'data', 'exercises.rejected.log');

const MASTER_SKELETON = `export const exercises = [
];
`;

function ensureFiles() {
  fs.mkdirSync(path.dirname(MASTER_PATH), { recursive: true });
  if (!fs.existsSync(MASTER_PATH)) {
    fs.writeFileSync(MASTER_PATH, MASTER_SKELETON, 'utf8');
  }
  if (!fs.existsSync(REJECTED_LOG_PATH)) {
    fs.writeFileSync(REJECTED_LOG_PATH, '', 'utf8');
  }
}

function countPipeSeparators(line) {
  return (String(line).match(/\|/g) || []).length;
}

function parseLoad(value) {
  const raw = String(value ?? '').trim();
  if (!/^-?\d+$/.test(raw)) return { ok: false, value: null };
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0 || n > 3) return { ok: false, value: null };
  return { ok: true, value: n };
}

function parseExerciseLine(line) {
  const raw = String(line ?? '');
  if (!raw.trim()) return { kind: 'blank' };

  if (countPipeSeparators(raw) !== 8) {
    return { kind: 'rejected', reason: 'invalid_pipe_count', raw };
  }

  const fields = raw.split('|').map((f) => f.trim());
  if (fields.length !== 9) {
    return { kind: 'rejected', reason: 'invalid_field_count', raw };
  }

  const [name, primary, sub, pattern, spineRaw, kneeRaw, hipRaw, shoulderRaw, elbowRaw] = fields;
  const spine = parseLoad(spineRaw);
  const knee = parseLoad(kneeRaw);
  const hip = parseLoad(hipRaw);
  const shoulder = parseLoad(shoulderRaw);
  const elbow = parseLoad(elbowRaw);

  if (!spine.ok || !knee.ok || !hip.ok || !shoulder.ok || !elbow.ok) {
    return { kind: 'rejected', reason: 'invalid_load_value', raw };
  }

  return {
    kind: 'accepted',
    exercise: {
      name,
      primary,
      sub,
      pattern,
      spine: spine.value,
      knee: knee.value,
      hip: hip.value,
      shoulder: shoulder.value,
      elbow: elbow.value
    }
  };
}

function parseExerciseChunk(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const accepted = [];
  const rejected = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const parsed = parseExerciseLine(line);
    if (parsed.kind === 'accepted') {
      accepted.push(parsed.exercise);
    } else if (parsed.kind === 'rejected') {
      rejected.push({
        lineNumber: i + 1,
        reason: parsed.reason,
        raw: parsed.raw
      });
    }
  }

  return { accepted, rejected };
}

function toObjectLiteral(ex) {
  return [
    '{',
    `  name: ${JSON.stringify(ex.name)},`,
    `  primary: ${JSON.stringify(ex.primary)},`,
    `  sub: ${JSON.stringify(ex.sub)},`,
    `  pattern: ${JSON.stringify(ex.pattern)},`,
    `  spine: ${ex.spine},`,
    `  knee: ${ex.knee},`,
    `  hip: ${ex.hip},`,
    `  shoulder: ${ex.shoulder},`,
    `  elbow: ${ex.elbow}`,
    '}'
  ].join('\n');
}

function appendAcceptedToMaster(exercises) {
  if (!Array.isArray(exercises) || !exercises.length) return;

  ensureFiles();
  const src = fs.readFileSync(MASTER_PATH, 'utf8');
  const endIdx = src.lastIndexOf('];');
  if (endIdx < 0) {
    throw new Error('Invalid master file format.');
  }

  const prefix = src.slice(0, endIdx);
  const suffix = src.slice(endIdx);
  const entries = exercises.map(toObjectLiteral).join(',\n');

  const hasAny = /\[\s*[\s\S]*\S[\s\S]*$/m.test(prefix) && !/\[\s*$/.test(prefix);
  const trimmedPrefix = prefix.trimEnd();
  const needsComma = !/\[\s*$/.test(trimmedPrefix);

  const next = needsComma
    ? `${trimmedPrefix},\n${entries}\n${suffix}`
    : `${trimmedPrefix}\n${entries}\n${suffix}`;

  fs.writeFileSync(MASTER_PATH, `${next.endsWith('\n') ? next : `${next}\n`}`, 'utf8');
}

function appendRejectedToLog(rejected) {
  if (!Array.isArray(rejected) || !rejected.length) return;

  ensureFiles();
  const stamp = new Date().toISOString();
  const block = rejected.map((r) => {
    const safeRaw = String(r.raw ?? '').replace(/\r/g, '\\r').replace(/\n/g, '\\n');
    return `${stamp}\tline=${r.lineNumber}\treason=${r.reason}\traw=${safeRaw}`;
  }).join('\n');
  fs.appendFileSync(REJECTED_LOG_PATH, `${block}\n`, 'utf8');
}

function ingestExerciseChunk(text) {
  const { accepted, rejected } = parseExerciseChunk(text);
  appendAcceptedToMaster(accepted);
  appendRejectedToLog(rejected);
  return { acceptedCount: accepted.length, rejectedCount: rejected.length, accepted, rejected };
}

module.exports = {
  parseExerciseLine,
  parseExerciseChunk,
  ingestExerciseChunk,
  paths: {
    master: MASTER_PATH,
    rejected: REJECTED_LOG_PATH
  }
};

if (require.main === module) {
  const fileArg = process.argv[2];
  let input = '';
  if (fileArg) {
    input = fs.readFileSync(path.resolve(process.cwd(), fileArg), 'utf8');
  } else {
    input = fs.readFileSync(0, 'utf8');
  }
  const result = ingestExerciseChunk(input);
  process.stdout.write(JSON.stringify({
    acceptedCount: result.acceptedCount,
    rejectedCount: result.rejectedCount
  }));
}

