const fs = require('fs');
const path = require('path');

const localExercises = require('../src/localExercises');
const { normalizeKey, tokenize } = require('../src/localExercises/normalize');
const { readProgramAliases } = require('../src/localExercises/programAliases');

function readText(p) {
  return fs.readFileSync(p, 'utf8');
}

function uniq(arr) {
  return Array.from(new Set(arr));
}

function extractExerciseNamesFromTrainingEngine(trainingEnginePath) {
  const src = readText(trainingEnginePath);
  const names = [];

  const reSingle = /name\s*:\s*'([^']+)'/g;
  const reDouble = /name\s*:\s*"([^"]+)"/g;
  let m;
  while ((m = reSingle.exec(src))) names.push(String(m[1]).trim());
  while ((m = reDouble.exec(src))) names.push(String(m[1]).trim());

  return uniq(names).filter(Boolean);
}

function scoreName(query, candidate) {
  const q = String(query || '').trim();
  const c = String(candidate || '').trim();
  if (!q || !c) return 1_000_000;

  const qKey = normalizeKey(q);
  const cKey = normalizeKey(c);
  if (qKey && cKey && qKey === cKey) return 0;
  if (cKey && qKey && (cKey.startsWith(qKey) || qKey.startsWith(cKey))) return 1;
  if (cKey && qKey && (cKey.includes(qKey) || qKey.includes(cKey))) return 2;

  const qTokens = tokenize(q);
  const cTokens = new Set(tokenize(c));
  let missing = 0;
  for (const t of qTokens) if (!cTokens.has(t)) missing += 1;
  return 10 + (missing * 6) + Math.min(24, Math.max(0, c.length - q.length));
}

function simplifyProgramNameForMatch(name) {
  const raw = String(name || '').trim();
  if (!raw) return [];
  const parts = raw.split('/').map((x) => String(x || '').trim()).filter(Boolean);
  const out = [];
  for (const p of (parts.length ? parts : [raw])) {
    const cleaned = p.replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
    if (cleaned) out.push(cleaned);
  }
  return uniq(out);
}

function pickAutoIdForName(programName, { maxCandidates = 8 } = {}) {
  const variants = simplifyProgramNameForMatch(programName);
  if (!variants.length) return { ok: false, reason: 'empty' };

  // Merge candidates across variants.
  const all = [];
  for (const v of variants) {
    const hits = localExercises.searchByName(v, { projectRoot: process.cwd() }).slice(0, maxCandidates);
    for (const ex of hits) {
      all.push(ex);
    }
  }

  if (!all.length) return { ok: false, reason: 'no_candidates' };

  // Dedup by id
  const byId = new Map();
  for (const ex of all) {
    const id = String(ex?.id || '').trim();
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, ex);
  }
  const uniqCandidates = Array.from(byId.values());

  const scored = uniqCandidates.map((ex) => ({
    id: String(ex.id),
    name: String(ex.name || ''),
    gifUrl: ex.gifUrl || null,
    score: scoreName(programName, ex.name)
  })).sort((a, b) => a.score - b.score);

  const best = scored[0];
  const second = scored[1] || null;

  // Exact linking rule: only auto-pick if it is clearly best.
  // - score <= 8 means pretty tight match
  // - and either no second, or a meaningful gap
  const ok = best && best.score <= 8 && (!second || (second.score - best.score) >= 4);

  return {
    ok,
    best,
    second,
    scored: scored.slice(0, 6),
    reason: ok ? 'auto' : 'ambiguous_or_weak'
  };
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const trainingEnginePath = path.join(projectRoot, 'core', 'trainingEngine.js');
  const datasetDir = path.join(projectRoot, 'exercise-data');

  const status = localExercises.datasetStatus({ projectRoot, datasetDir });
  if (!status.ok) throw new Error(status.error);
  localExercises.ensureLoaded({ projectRoot, datasetDir });

  const existing = readProgramAliases({ projectRoot, datasetDir });
  const manualOverrides = existing?.overrides || {};

  const names = extractExerciseNamesFromTrainingEngine(trainingEnginePath);
  const outOverrides = {};
  const unresolved = [];
  const ambiguous = [];
  let autoCount = 0;
  let manualCount = 0;

  for (const n of names) {
    const key = normalizeKey(n);
    if (!key) continue;
    if (manualOverrides[key]) {
      outOverrides[key] = manualOverrides[key];
      manualCount += 1;
      continue;
    }

    const pick = pickAutoIdForName(n);
    if (pick.ok && pick.best?.id) {
      outOverrides[key] = { id: pick.best.id, note: 'auto' };
      autoCount += 1;
      continue;
    }

    const top = pick.scored || [];
    if (!top.length) {
      unresolved.push({ name: n, key, reason: pick.reason || 'no_candidates' });
    } else {
      ambiguous.push({ name: n, key, reason: pick.reason || 'ambiguous', candidates: top });
    }
  }

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'trainingEngine.js',
    stats: {
      totalProgramNames: names.length,
      manualPreserved: manualCount,
      autoAssigned: autoCount,
      unresolved: unresolved.length,
      ambiguous: ambiguous.length
    },
    overrides: outOverrides,
    unresolved,
    ambiguous
  };

  const outPath = path.join(datasetDir, 'processed', 'program-gif-aliases.auto.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`[exercise-data] wrote ${outPath}`);
  console.log(`[exercise-data] stats:`, payload.stats);
  if (unresolved.length) console.log('[exercise-data] unresolved examples:', unresolved.slice(0, 8).map((x) => x.name).join(', '));
  if (ambiguous.length) console.log('[exercise-data] ambiguous examples:', ambiguous.slice(0, 5).map((x) => x.name).join(', '));
}

try {
  main();
} catch (err) {
  console.error('[exercise-data] alias-gen failed:', err?.message || err);
  process.exit(1);
}

