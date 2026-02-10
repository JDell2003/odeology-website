const fs = require('fs');
const path = require('path');

const DATASET_PATH = path.join(__dirname, '..', 'free-exercise-db', 'dist', 'exercises.json');

let datasetCache = null;

function safeReadJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function loadDataset() {
  if (datasetCache) return datasetCache;
  const data = safeReadJson(DATASET_PATH);
  datasetCache = Array.isArray(data) ? data : [];
  return datasetCache;
}

function resolveWorkoutExercises(plan, userProfile, dataset) {
  if (!plan || typeof plan !== 'object') return plan;
  const data = Array.isArray(dataset) ? dataset : loadDataset();
  if (!Array.isArray(data) || !data.length) return plan;

  const idIndex = new Map();
  for (const ex of data) {
    const id = String(ex?.id || '').trim();
    if (!id) continue;
    idIndex.set(id, ex);
  }

  for (const week of plan.weeks || []) {
    for (const day of week?.days || []) {
      const nextExercises = [];
      for (const ex of day?.exercises || []) {
        const exerciseId = String(ex?.exerciseId || '').trim();
        const entry = idIndex.get(exerciseId) || null;
        if (!exerciseId || !entry) {
          nextExercises.push({
            ...ex,
            displayName: ex.displayName || ex.name || 'Unknown exercise',
            mediaPath: null,
            mediaPathAlt: null
          });
          continue;
        }
        const image0 = entry.images?.[0] ? `/free-exercise-db/exercises/${entry.images[0]}` : null;
        const image1 = entry.images?.[1] ? `/free-exercise-db/exercises/${entry.images[1]}` : null;
        nextExercises.push({
          ...ex,
          displayName: entry.name || ex.displayName || ex.name,
          mediaPath: image0,
          mediaPathAlt: image1
        });
      }
      day.exercises = nextExercises;
    }
  }
  return plan;
}

module.exports = {
  resolveWorkoutExercises,
  loadExerciseDataset: loadDataset,
  BASE_ID_MOVEMENT_MAP: {}
};
