const crypto = require('crypto');

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function seedFrom(input) {
  const h = sha256Hex(String(input || 'seed'));
  return Number.parseInt(h.slice(0, 8), 16) >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeList(list) {
  return (Array.isArray(list) ? list : [])
    .map((x) => String(x || '').trim())
    .filter(Boolean);
}

function uniqBy(list, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function shuffle(list, rnd) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function includesOne(target, needles) {
  const t = String(target || '').toLowerCase();
  if (!t) return false;
  return needles.some((n) => t.includes(String(n).toLowerCase()));
}

function templateConfig(template) {
  const t = String(template || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (t === 'push') {
    return {
      name: 'Push Day',
      groups: [
        { label: 'chest', needles: ['chest', 'pector', 'pecs'] },
        { label: 'shoulders', needles: ['delts', 'shoulder'] },
        { label: 'triceps', needles: ['triceps'] }
      ]
    };
  }
  if (t === 'pull') {
    return {
      name: 'Pull Day',
      groups: [
        { label: 'back', needles: ['lats', 'upper back', 'middle back', 'lower back', 'back', 'traps'] },
        { label: 'biceps', needles: ['biceps'] },
        { label: 'rear_delts', needles: ['rear delts', 'delts'] }
      ]
    };
  }
  if (t === 'legs') {
    return {
      name: 'Leg Day',
      groups: [
        { label: 'quads', needles: ['quads', 'quadriceps'] },
        { label: 'hamstrings', needles: ['hamstrings'] },
        { label: 'glutes', needles: ['glutes'] },
        { label: 'calves', needles: ['calves'] }
      ]
    };
  }
  if (t === 'upper') {
    return { name: 'Upper Body', groups: [] };
  }
  if (t === 'lower') {
    return { name: 'Lower Body', groups: [] };
  }
  if (t === 'full_body' || t === 'fullbody') {
    return { name: 'Full Body', groups: [] };
  }
  return { name: 'Workout', groups: [] };
}

function toWorkoutExercise(ex) {
  if (!ex) return null;
  return {
    id: ex.id,
    name: ex.name,
    bodyPart: ex.bodyPart || null,
    target: ex.target || null,
    equipment: ex.equipment || null,
    gifUrl: ex.gifUrl || null,
    instructions: Array.isArray(ex.instructions) ? ex.instructions : [],
    secondaryMuscles: Array.isArray(ex.secondaryMuscles) ? ex.secondaryMuscles : []
  };
}

function generateWorkout({ exercises, template, count, seed, allowedEquipment, excludedEquipment } = {}) {
  const safeCount = Math.max(1, Math.min(30, Number(count || 6) || 6));
  const allow = new Set(normalizeList(allowedEquipment).map((x) => x.toLowerCase()));
  const exclude = new Set(normalizeList(excludedEquipment).map((x) => x.toLowerCase()));

  const filtered = (Array.isArray(exercises) ? exercises : []).filter((ex) => {
    if (!ex || !ex.id || !ex.name) return false;
    const eq = String(ex.equipment || '').toLowerCase();
    if (exclude.size && exclude.has(eq)) return false;
    if (allow.size && !allow.has(eq)) return false;
    return true;
  });

  const unique = uniqBy(filtered, (x) => String(x.id || x.name || '').trim());
  if (!unique.length) return { ok: false, error: 'No exercises match your filters.' };

  const cfg = templateConfig(template);
  const rnd = mulberry32(seedFrom(seed || `${cfg.name}:${new Date().toISOString().slice(0, 10)}`));

  const pool = shuffle(unique, rnd);
  const picked = [];
  const pickedIds = new Set();

  const add = (ex) => {
    if (!ex) return false;
    const id = String(ex.id || '').trim() || String(ex.name || '').trim();
    if (!id || pickedIds.has(id)) return false;
    pickedIds.add(id);
    picked.push(ex);
    return true;
  };

  if (cfg.groups.length) {
    const buckets = cfg.groups.map((g) => ({
      ...g,
      list: pool.filter((ex) => includesOne(ex.target, g.needles) || includesOne(ex.bodyPart, g.needles))
    }));

    let safety = 0;
    while (picked.length < safeCount && safety < 300) {
      safety += 1;
      const g = buckets[safety % buckets.length];
      const candidate = g.list[Math.floor(rnd() * g.list.length)];
      if (!candidate) continue;
      add(candidate);
    }
  }

  // Fill the rest from the full pool.
  for (const ex of pool) {
    if (picked.length >= safeCount) break;
    add(ex);
  }

  const outExercises = picked.map(toWorkoutExercise).filter(Boolean);
  return {
    ok: true,
    workout: {
      name: cfg.name,
      template: String(template || '').trim() || null,
      count: outExercises.length,
      exercises: outExercises
    }
  };
}

module.exports = {
  generateWorkout
};

