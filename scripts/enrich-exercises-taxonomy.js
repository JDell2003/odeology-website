const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const MASTER_PATH = path.join(ROOT, 'data', 'exercises.master.js');
const CANON_PATH = path.join(ROOT, 'free-exercise-db', 'dist', 'exercises.json');

const STYLE_SET = new Set(['Compound', 'Isolation', 'Mobility', 'Cardio', 'Skill']);
const MOVEMENT_TAG_SET = new Set(['unilateral', 'bilateral', 'supported', 'freeWeight', 'machineStable']);

function normalizeText(v) {
  return String(v || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseMaster(filePath) {
  const src = fs.readFileSync(filePath, 'utf8');
  const start = src.indexOf('[');
  const end = src.lastIndexOf('];');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Unable to parse exercises.master.js array literal');
  }
  const arrText = src.slice(start, end + 1);
  return JSON.parse(arrText);
}

function getFolderId(images) {
  const first = Array.isArray(images) ? String(images[0] || '') : '';
  const m = first.match(/free-exercise-db\/exercises\/([^/]+)\//i);
  return m ? m[1] : null;
}

function toMuscleToken(raw) {
  const m = normalizeText(raw);
  if (!m) return null;
  const table = [
    [/^abdom/, 'Abs'],
    [/oblique/, 'Obliques'],
    [/transvers|tva/, 'TVA'],
    [/hip flex/, 'HipFlexors'],
    [/serratus/, 'Serratus'],
    [/quadriceps|quads?/, 'Quads'],
    [/hamstring/, 'Hamstrings'],
    [/glute/, 'Glutes'],
    [/adductor/, 'Adductors'],
    [/abductor/, 'Abductors'],
    [/calf|gastrocnemius|soleus/, 'Calves'],
    [/latissimus|\blats?\b/, 'Lats'],
    [/middle back|mid back|rhomboid/, 'MidBack'],
    [/upper back|trapezius|\btraps?\b/, 'UpperBack'],
    [/lower back|erector|spinal/, 'SpinalErectors'],
    [/chest|pector/, 'Chest'],
    [/front deltoid|anterior deltoid|anterior delt|front delt/, 'FrontDelts'],
    [/rear deltoid|posterior deltoid|rear delt/, 'RearDelts'],
    [/side deltoid|lateral deltoid|lateral delt/, 'LateralDelts'],
    [/rotator cuff/, 'RotatorCuff'],
    [/shoulder/, 'Delts'],
    [/biceps/, 'Biceps'],
    [/triceps/, 'Triceps'],
    [/brachialis/, 'Brachialis'],
    [/forearm/, 'Forearms'],
    [/neck/, 'Neck']
  ];
  for (const [re, tok] of table) {
    if (re.test(m)) return tok;
  }
  return null;
}

function canonicalEquipmentTokens(eqRaw, nameRaw) {
  const tokens = new Set();
  const eq = normalizeText(eqRaw);
  const name = normalizeText(nameRaw);

  const add = (t) => tokens.add(t);
  if (/smith/.test(eq) || /smith/.test(name)) add('Smith');
  if (/barbell|ez curl|ez bar|trap bar|axle|log\b/.test(eq) || /barbell|ez\s?bar|trap\s?bar|axle|log\s+lift/.test(name)) add('Barbell');
  if (/dumbbell/.test(eq) || /dumbbell/.test(name)) add('Dumbbell');
  if (/kettlebell/.test(eq) || /kettlebell/.test(name)) add('Kettlebell');
  if (/cable|pulley|rope/.test(eq) || /cable|pulley|rope/.test(name)) add('Cable');
  if (/machine|leverage/.test(eq) || /machine|leg press|hack squat|pec deck|calf machine|dip machine|leverage/.test(name)) add('Machine');
  if (/band/.test(eq) || /\bband\b|\bbands\b/.test(name)) add('Bands');
  if (/body only|bodyweight|body weight/.test(eq) || /push up|pull up|chin up|dip\b|inverted row|mountain climber|plank|sit up|crunch/.test(name)) add('Bodyweight');
  if (/exercise ball|stability ball|bosu/.test(eq) || /exercise ball|stability ball|bosu/.test(name)) add('StabilityBall');
  if (/medicine ball/.test(eq) || /medicine ball/.test(name)) add('MedicineBall');
  if (/sled/.test(eq) || /sled/.test(name)) add('Sled');
  if (/rope/.test(name) && !tokens.has('Cable')) add('Ropes');

  if (!tokens.size) {
    if (/treadmill|elliptical|stationary|bike/.test(name)) add('Machine');
    else add('Bodyweight');
  }

  return Array.from(tokens);
}

function classifyMovementTags(ex, canon, equipmentTokens) {
  const tags = new Set();
  const name = normalizeText(ex?.name);
  const eq = normalizeText(canon?.equipment || '');

  const has = (token) => Array.isArray(equipmentTokens) && equipmentTokens.includes(token);

  const unilateralName = /(^| )one arm( |$)|(^| )one leg( |$)|(^| )single arm( |$)|(^| )single leg( |$)|alternating|split squat|lunge|pistol squat|step ups?|kickback|side laterals|one handed|turkish get up|crossover reverse lunge/;
  const bilateralName = /(^| )two arm( |$)|double kettlebell|barbell|back squat|front squat|deadlift|bench press|pull up|chin up|lat pulldown|leg press|hack squat|machine|seated row|overhead press|shrug/;

  if (unilateralName.test(name)) tags.add('unilateral');
  if (!tags.has('unilateral') && bilateralName.test(name)) tags.add('bilateral');
  if (!tags.has('unilateral') && !tags.has('bilateral')) {
    // Default to bilateral for most non-lateralized strength/cardio tasks.
    tags.add('bilateral');
  }

  const supportedName = /seated|lying|chest supported|supported|on bench|against|machine|smith|leg press|hack squat|preacher|cable|pulley|dip machine|stability ball|exercise ball|bosu|treadmill|elliptical|stationary/;
  if (supportedName.test(name) || /machine|cable|smith/.test(eq) || has('Machine') || has('Cable') || has('Smith')) {
    tags.add('supported');
  }

  if (has('Barbell') || has('Dumbbell') || has('Kettlebell') || has('MedicineBall')) {
    tags.add('freeWeight');
  }
  const loadedFreeWeightName = /farmer|suitcase carry|carry|atlas stone|keg load|log lift|sandbag|conan s wheel|medicine ball/;
  if (!tags.has('freeWeight') && loadedFreeWeightName.test(name) && !has('Machine') && !has('Smith') && !has('Cable')) {
    tags.add('freeWeight');
  }

  if (has('Machine') || has('Smith')) {
    tags.add('machineStable');
  }

  return Array.from(tags);
}

function classifyStyle(ex, canon) {
  const name = normalizeText(ex.name);
  const pattern = normalizeText(ex.pattern);
  const primary = normalizeText(ex.primary);
  const mech = normalizeText(canon?.mechanic || '');
  const category = normalizeText(canon?.category || '');

  if (primary === 'mobility' || pattern === 'mobility' || category === 'stretching') return 'Mobility';
  if (primary === 'cardio' || pattern === 'cardio' || category === 'cardio') return 'Cardio';
  if (pattern === 'isolation' || mech === 'isolation') return 'Isolation';

  const skilly = /(snatch|clean|jerk|muscle up|turkish get up|handstand|pistol squat|kipping|atlas stone|windmill|thruster|olympic|plyo|depth jump|box jump|overhead squat)/;
  if (pattern === 'power' || pattern === 'plyo' || skilly.test(name)) return 'Skill';

  return 'Compound';
}

function styleFromPatternFallback(patternRaw) {
  const p = normalizeText(patternRaw);
  if (p === 'mobility') return 'Mobility';
  if (p === 'cardio') return 'Cardio';
  if (p === 'isolation') return 'Isolation';
  if (p === 'power' || p === 'plyo') return 'Skill';
  return 'Compound';
}

function classifyDifficulty(ex, canon, style) {
  const level = normalizeText(canon?.level || '');
  const name = normalizeText(ex.name);

  let score = 3;
  if (level === 'beginner') score = 2;
  else if (level === 'intermediate') score = 3;
  else if (level === 'expert' || level === 'advanced') score = 4;
  else {
    if (style === 'Mobility' || style === 'Cardio') score = 2;
    if (style === 'Isolation') score = 2;
    if (style === 'Skill') score = 4;
  }

  const maxJointLoad = Math.max(Number(ex.spine || 0), Number(ex.knee || 0), Number(ex.hip || 0), Number(ex.shoulder || 0), Number(ex.elbow || 0));
  if (maxJointLoad >= 3) score += 1;
  if (maxJointLoad === 0 && (style === 'Mobility' || style === 'Isolation')) score -= 1;

  if (/(competition|single\)|advanced|technique|one arm chin up|muscle up|handstand|overhead squat|snatch|jerk)/.test(name)) score += 1;
  if (/(assisted|knee push up|incline\s*\/\s*knee push up|stretch|warm up|drill)/.test(name)) score -= 1;

  if (style === 'Skill') score += 1;

  return Math.max(1, Math.min(5, score));
}

function inferSecondaryFromRules(ex, style) {
  const out = new Set();
  const primary = normalizeText(ex.primary);
  const sub = normalizeText(ex.sub);
  const pattern = normalizeText(ex.pattern);
  const name = normalizeText(ex.name);

  if (style === 'Mobility' || style === 'Cardio') return [];

  if (primary === 'chest') {
    if (pattern.includes('push') || style === 'Compound') {
      out.add('Triceps');
      out.add('FrontDelts');
    } else {
      out.add('FrontDelts');
    }
  }

  if (primary === 'back') {
    if (pattern.includes('pull') || style === 'Compound') {
      out.add('Biceps');
      out.add('RearDelts');
    }
    if (sub.includes('width')) out.add('UpperBack');
    if (sub.includes('thickness')) out.add('MidBack');
  }

  if (primary === 'shoulders') {
    if (sub.includes('front') || pattern.includes('verticalpush')) out.add('Triceps');
    if (sub.includes('rear')) out.add('UpperBack');
    if (sub.includes('lateral')) out.add('UpperBack');
  }

  if (primary === 'legs') {
    if (pattern.includes('squat') || pattern.includes('lunge')) {
      out.add('Glutes');
      out.add('Hamstrings');
      out.add('Core');
    }
    if (pattern.includes('hinge')) {
      out.add('Glutes');
      out.add('SpinalErectors');
    }
    if (sub.includes('quads')) out.add('Glutes');
    if (sub.includes('hamstrings')) out.add('Glutes');
  }

  if (primary === 'core') {
    if (sub.includes('upperabs') || sub.includes('lowerabs')) out.add('HipFlexors');
    if (sub.includes('obliques') || pattern.includes('rotation')) out.add('TVA');
  }

  if (primary === 'arms') {
    if (sub.includes('biceps') || sub.includes('brachialis')) out.add('Forearms');
    if (sub.includes('triceps')) out.add('FrontDelts');
  }

  if (primary === 'fullbody') {
    out.add('Quads');
    out.add('Hamstrings');
    out.add('Glutes');
    out.add('UpperBack');
  }

  if (name.includes('farmer') || pattern.includes('carry')) {
    out.add('Forearms');
    out.add('UpperBack');
    out.add('Core');
  }

  return Array.from(out);
}

function buildSecondary(ex, canon, style) {
  if (style === 'Mobility' || style === 'Cardio') return [];

  const out = new Set();

  if (Array.isArray(canon?.secondaryMuscles)) {
    for (const m of canon.secondaryMuscles) {
      const tok = toMuscleToken(m);
      if (tok) out.add(tok);
    }
  }

  for (const tok of inferSecondaryFromRules(ex, style)) {
    out.add(tok);
  }

  // keep list compact and stable
  return Array.from(out).slice(0, 6);
}

function run() {
  const canon = JSON.parse(fs.readFileSync(CANON_PATH, 'utf8'));
  const canonById = new Map();
  const canonByName = new Map();

  for (const c of canon) {
    canonById.set(String(c.id || ''), c);
    canonByName.set(normalizeText(c.name), c);
  }

  const master = parseMaster(MASTER_PATH);

  let matchedById = 0;
  let matchedByName = 0;

  const enriched = master.map((ex) => {
    const folderId = getFolderId(ex.images);
    let c = null;
    if (folderId && canonById.has(folderId)) {
      c = canonById.get(folderId);
      matchedById += 1;
    } else {
      const nameKey = normalizeText(ex.name);
      if (canonByName.has(nameKey)) {
        c = canonByName.get(nameKey);
        matchedByName += 1;
      }
    }

    const style = classifyStyle(ex, c);
    const equipment = canonicalEquipmentTokens(c?.equipment || '', ex.name);
    const difficulty = classifyDifficulty(ex, c, style);
    const secondaryMuscles = buildSecondary(ex, c, style);
    const movementTags = classifyMovementTags(ex, c, equipment);

    return {
      ...ex,
      equipment,
      difficulty,
      style,
      secondaryMuscles,
      movementTags
    };
  });

  const output = `export const exercises = ${JSON.stringify(enriched, null, 2)};\n`;
  fs.writeFileSync(MASTER_PATH, output, 'utf8');

  const invalidStyle = enriched.filter((e) => !STYLE_SET.has(e.style)).length;
  const invalidMovementTags = enriched.filter((e) => !Array.isArray(e.movementTags) || e.movementTags.some((t) => !MOVEMENT_TAG_SET.has(t))).length;
  const invalidDifficulty = enriched.filter((e) => !Number.isInteger(e.difficulty) || e.difficulty < 1 || e.difficulty > 5).length;
  const missingEquipment = enriched.filter((e) => !Array.isArray(e.equipment) || !e.equipment.length).length;

  const styleCounts = {};
  const diffCounts = {};
  const equipCounts = {};
  const movementTagCounts = {};
  for (const e of enriched) {
    styleCounts[e.style] = (styleCounts[e.style] || 0) + 1;
    diffCounts[e.difficulty] = (diffCounts[e.difficulty] || 0) + 1;
    for (const eq of e.equipment) equipCounts[eq] = (equipCounts[eq] || 0) + 1;
    for (const mt of (Array.isArray(e.movementTags) ? e.movementTags : [])) {
      movementTagCounts[mt] = (movementTagCounts[mt] || 0) + 1;
    }
  }

  const unmatched = enriched.length - matchedById - matchedByName;

  const report = {
    total: enriched.length,
    matchedById,
    matchedByName,
    unmatched,
    invalidStyle,
    invalidMovementTags,
    invalidDifficulty,
    missingEquipment,
    styleCounts,
    difficultyCounts: diffCounts,
    equipmentCounts: equipCounts,
    movementTagCounts
  };

  console.log(JSON.stringify(report, null, 2));
}

run();
