const { loadDataset } = require('../core/exerciseCatalog');

function normalizeText(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeToken(raw) {
  return normalizeText(raw).replace(/\s+/g, '');
}

function primarySecondary(entry) {
  const primary = Array.isArray(entry?.primaryMuscles)
    ? entry.primaryMuscles.map((m) => String(m || '')).filter(Boolean)
    : [];
  const secondary = Array.isArray(entry?.secondaryMuscles)
    ? entry.secondaryMuscles.map((m) => String(m || '')).filter(Boolean)
    : [];
  return { primary, secondary };
}

function majorFromToken(rawToken) {
  const token = normalizeToken(rawToken);
  if (!token) return '';
  if (token.includes('chest') || token.includes('pectoral') || token.includes('pec')) return 'chest';
  if (token.includes('lat') || token.includes('back') || token.includes('trap') || token.includes('rhomboid') || token.includes('erector') || token.includes('upperback')) return 'back';
  if (token.includes('shoulder') || token.includes('deltoid') || token.includes('rotator') || token.includes('delt')) return 'shoulders';
  if (token.includes('bicep') || token.includes('tricep') || token.includes('forearm') || token.includes('brachialis') || token.includes('brachioradialis')) return 'arms';
  if (token.includes('quad') || token.includes('hamstring') || token.includes('glute') || token.includes('calf') || token.includes('adductor') || token.includes('abductor') || token.includes('hipflexor') || token.includes('leg')) return 'legs';
  if (token === 'abs' || token.includes('abdom') || token.includes('oblique') || token.includes('serratus') || token.includes('transverse') || token.includes('core')) return 'core';
  if (token.includes('neck')) return 'neck';
  if (token.includes('fullbody')) return 'full_body';
  return '';
}

function inferMajorFromName(rawName) {
  const n = normalizeText(rawName);
  if (/(bench|chest|push up|push-up|dips|crossover|pec deck|fly)/.test(n)) return 'chest';
  if (/(row|pulldown|pull up|pull-up|chin up|chin-up|lat|deadlift|good morning|back extension)/.test(n)) return 'back';
  if (/(overhead|shoulder press|military press|arnold|lateral raise|rear delt|front raise)/.test(n)) return 'shoulders';
  if (/(bicep|curl|tricep|pushdown|skull crusher|kickback|forearm)/.test(n)) return 'arms';
  if (/(squat|lunge|leg press|hack squat|leg extension|leg curl|rdl|hip thrust|calf)/.test(n)) return 'legs';
  if (/(plank|crunch|sit up|sit-up|oblique|woodchop|hollow|dead bug|ab wheel|ab roller)/.test(n)) return 'core';
  if (/neck/.test(n)) return 'neck';
  return 'other';
}

function subgroupFromName(major, rawName) {
  const name = normalizeText(rawName);
  const hasAny = (parts) => parts.some((part) => name.includes(part));
  if (major === 'chest') {
    if (hasAny(['incline', 'clavicular', 'low to high'])) return 'upperchest';
    if (hasAny(['decline', 'high to low'])) return 'lowerchest';
    if (hasAny(['inner', 'squeeze', 'hex press'])) return 'innerchest';
    return 'middlechest';
  }
  if (major === 'back') {
    if (hasAny(['pull-up', 'pull up', 'chin-up', 'chin up', 'pulldown', 'lat pull'])) return 'lats';
    if (hasAny(['shrug', 'trap'])) return 'traps';
    if (hasAny(['rhomboid'])) return 'rhomboids';
    if (hasAny(['deadlift', 'back extension', 'hyperextension', 'good morning', 'erector'])) return 'lowerback';
    if (hasAny(['row', 't-bar', 'seated row'])) return 'middleback';
    return 'upperback';
  }
  if (major === 'shoulders') {
    if (hasAny(['lateral raise', 'side raise'])) return 'sidedelts';
    if (hasAny(['rear delt', 'reverse fly', 'face pull'])) return 'reardelts';
    if (hasAny(['external rotation', 'internal rotation', 'rotator cuff'])) return 'rotatorcuff';
    if (hasAny(['front raise'])) return 'frontdelts';
    return 'shoulders';
  }
  if (major === 'arms') {
    if (hasAny(['tricep', 'pushdown', 'skull', 'extension', 'kickback', 'close grip bench'])) return 'triceps';
    if (hasAny(['wrist', 'grip', 'reverse curl'])) return 'forearms';
    if (hasAny(['hammer curl', 'brachialis'])) return 'brachialis';
    return 'biceps';
  }
  if (major === 'legs') {
    if (hasAny(['calf'])) return 'calves';
    if (hasAny(['hamstring', 'leg curl', 'rdl', 'stiff'])) return 'hamstrings';
    if (hasAny(['glute', 'hip thrust', 'bridge', 'kickback'])) return 'glutes';
    if (hasAny(['adductor'])) return 'adductors';
    if (hasAny(['abductor'])) return 'abductors';
    if (hasAny(['hip flexor'])) return 'hipflexors';
    return 'quadriceps';
  }
  if (major === 'core') {
    if (hasAny(['oblique', 'side plank', 'russian twist', 'woodchop'])) return 'obliques';
    if (hasAny(['leg raise', 'reverse crunch', 'hanging knee'])) return 'lowerabs';
    if (hasAny(['crunch', 'sit-up', 'sit up'])) return 'upperabs';
    if (hasAny(['plank', 'hollow', 'dead bug', 'brace'])) return 'transverseabs';
    return 'abdominals';
  }
  if (major === 'neck') return 'neck';
  return 'general';
}

function movementFamily(major, subgroup, rawName) {
  const name = normalizeText(rawName);
  if (major === 'chest') {
    if (/(fly|crossover|pec deck)/.test(name)) return 'chest_fly';
    if (/(bench|press|push up|push-up|dip)/.test(name)) return 'chest_press';
  }
  if (major === 'back') {
    if (/(pulldown|pull up|pull-up|chin up|chin-up|lat pull)/.test(name)) return 'vertical_pull';
    if (/(row|seal row|t bar|single arm row)/.test(name)) return 'row';
    if (/(deadlift|good morning|back extension|hyperextension)/.test(name)) return 'hip_hinge';
  }
  if (major === 'shoulders') {
    if (/(overhead|shoulder press|military press|arnold)/.test(name)) return 'shoulder_press';
    if (/(lateral raise|side raise|front raise|rear delt|reverse fly|face pull)/.test(name)) return 'shoulder_raise';
  }
  if (major === 'arms') {
    if (subgroup === 'triceps' || /(tricep|pushdown|skull|extension|kickback|close grip bench)/.test(name)) return 'triceps_extension';
    if (subgroup === 'biceps' || subgroup === 'brachialis' || /(curl|chin up|chin-up)/.test(name)) return 'biceps_curl';
    if (subgroup === 'forearms' || /(wrist curl|grip|reverse curl)/.test(name)) return 'forearm_work';
  }
  if (major === 'legs') {
    if (subgroup === 'quadriceps' && /(leg extension|extension)/.test(name)) return 'leg_extension';
    if (subgroup === 'hamstrings' && /(leg curl|hamstring curl)/.test(name)) return 'leg_curl';
    if (/(calf raise)/.test(name) || subgroup === 'calves') return 'calf_raise';
    if (/(lunge|split squat|step up|step-up|bulgarian)/.test(name)) return 'single_leg';
    if (/(deadlift|rdl|romanian|good morning|hip thrust|glute bridge|back extension)/.test(name) || subgroup === 'hamstrings' || subgroup === 'glutes') return 'hip_hinge';
    if (/(squat|leg press|hack squat|front squat|goblet squat)/.test(name) || subgroup === 'quadriceps') return 'knee_dominant';
  }
  if (major === 'core') {
    if (/(plank|hollow|dead bug|ab wheel rollout)/.test(name)) return 'core_brace';
    if (/(crunch|sit up|sit-up|leg raise|knee raise)/.test(name)) return 'core_flexion';
    if (/(twist|rotation|woodchop|oblique)/.test(name)) return 'core_rotation';
  }
  return '';
}

function buildProfile(entry) {
  const { primary, secondary } = primarySecondary(entry);
  let major = 'other';
  for (const token of primary) {
    const m = majorFromToken(token);
    if (m) {
      major = m;
      break;
    }
  }
  if (major === 'other') {
    for (const token of secondary) {
      const m = majorFromToken(token);
      if (m) {
        major = m;
        break;
      }
    }
  }
  if (major === 'other') major = inferMajorFromName(entry?.name || '');
  const subgroup = subgroupFromName(major, entry?.name || '');
  return {
    major,
    subgroup,
    movementFamily: movementFamily(major, subgroup, entry?.name || ''),
    name: String(entry?.name || ''),
    id: String(entry?.id || '')
  };
}

function derivePainTags({ location, trigger, painType }) {
  const text = [location, trigger, painType].map((v) => normalizeText(v)).join(' ');
  const tags = new Set();
  if (!text) return tags;
  if (/(shoulder|rotator|delt|ac joint|scap)/.test(text)) tags.add('shoulder');
  if (/(elbow|tricep tendon|bicep tendon)/.test(text)) tags.add('elbow');
  if (/(wrist|hand|grip|thumb|forearm)/.test(text)) tags.add('wrist');
  if (/(neck|cervical|trap)/.test(text)) tags.add('neck');
  if (/(back|spine|lumbar|thoracic|si joint)/.test(text)) tags.add('back');
  if (/(hip|glute|groin)/.test(text)) tags.add('hip');
  if (/(knee|patella|acl|mcl|meniscus)/.test(text)) tags.add('knee');
  if (/(ankle|achilles|foot|heel|toe|calf)/.test(text)) tags.add('ankle');
  return tags;
}

function buildPainContext(s) {
  const sev = Number.isFinite(Number(s.severity)) ? Math.max(1, Math.min(10, Math.round(Number(s.severity)))) : 0;
  const painTypeNorm = normalizeText(s.painType);
  const onsetNorm = normalizeText(s.onset);
  const tags = derivePainTags(s);
  return {
    severity: sev,
    painTypeNorm,
    onsetNorm,
    tags,
    romNormal: Boolean(s.romNormal),
    pop: Boolean(s.pop),
    redFlag: sev >= 8
      || /numbness|tingling|electric|burning/.test(painTypeNorm)
      || Boolean(s.pop)
      || (!s.romNormal && sev >= 6)
  };
}

function painAction(ctx) {
  if (!ctx || !Number.isFinite(ctx.severity) || ctx.severity <= 0) return 'invalid';
  if (ctx.redFlag) return 'stop';
  if (ctx.severity >= 5) return 'swap';
  return 'continue';
}

function painGuidance(ctx, action) {
  const tagText = Array.from(ctx.tags || []).join(', ');
  const areaText = tagText ? ` around ${tagText}` : '';
  if (action === 'stop') return `High-risk pain signal detected${areaText}. Stop this session now and seek medical evaluation if symptoms persist or worsen.`;
  if (action === 'swap') return `Moderate pain detected${areaText}. This exercise should be replaced with a lower-stress option now.`;
  return `Low-severity pain detected${areaText}. Continue cautiously and stop if pain increases.`;
}

function penalty(profile, ctx) {
  const tags = ctx.tags || new Set();
  const major = String(profile.major || '');
  const subgroup = String(profile.subgroup || '');
  const family = String(profile.movementFamily || '');
  let score = 0;

  if (tags.has('shoulder')) {
    if (major === 'shoulders') score += 34;
    if (family === 'shoulder_press') score += 72;
    if (family === 'shoulder_raise') score += 36;
    if (family === 'chest_press') score += 42;
    if (['frontdelts', 'sidedelts', 'reardelts', 'triceps'].includes(subgroup)) score += 36;
  }
  if (tags.has('elbow')) {
    if (family === 'triceps_extension' || family === 'biceps_curl' || family === 'forearm_work') score += 56;
    if (['triceps', 'biceps', 'forearms', 'brachialis'].includes(subgroup)) score += 22;
  }
  if (tags.has('wrist')) {
    if (family === 'forearm_work' || family === 'biceps_curl') score += 82;
    if (family === 'chest_press' || family === 'shoulder_press') score += 26;
    if (['forearms', 'biceps', 'triceps'].includes(subgroup)) score += 28;
  }
  if (tags.has('back')) {
    if (family === 'hip_hinge') score += 96;
    if (family === 'row') score += 60;
    if (family === 'vertical_pull') score += 44;
    if (major === 'back') score += 26;
  }
  if (tags.has('hip')) {
    if (family === 'hip_hinge' || family === 'single_leg') score += 92;
    if (['glutes', 'hamstrings', 'hipflexors', 'adductors', 'abductors'].includes(subgroup)) score += 56;
  }
  if (tags.has('knee')) {
    if (family === 'knee_dominant' || family === 'single_leg' || family === 'leg_extension') score += 94;
    if (subgroup === 'quadriceps') score += 64;
  }
  if (tags.has('ankle')) {
    if (family === 'calf_raise' || family === 'single_leg') score += 88;
    if (subgroup === 'calves') score += 58;
  }
  if (tags.has('neck')) {
    if (family === 'shoulder_press' || family === 'shoulder_raise') score += 88;
    if (subgroup === 'traps' || subgroup === 'upperback') score += 44;
  }
  if (ctx.onsetNorm === 'during this set') score += 12;
  if (!ctx.romNormal) score += 18;
  if (ctx.pop) score += 24;
  if (/numbness|tingling|electric|burning/.test(ctx.painTypeNorm || '')) score += 22;
  return score;
}

function pickPainAwareSwap(sourceEntry, sourceProfile, datasetProfiles, ctx) {
  const badName = /(stretch|mobility|warmup|activation|rehab|therapy|prehab)/;
  const options = datasetProfiles
    .filter((p) => p.id !== sourceProfile.id)
    .filter((p) => p.major && p.major !== 'other')
    .filter((p) => p.major === sourceProfile.major)
    .filter((p) => !badName.test(normalizeText(p.name)))
    .map((p) => ({ ...p, penalty: penalty(p, ctx) }))
    .sort((a, b) => a.penalty - b.penalty || a.name.localeCompare(b.name));
  if (!options.length) return null;
  const maxPenalty = ctx.severity >= 7 ? 18 : ctx.severity >= 5 ? 48 : 9999;
  const safe = options.find((item) => item.penalty <= maxPenalty);
  if (safe) return { ...safe, usedFallback: false };
  if (ctx.severity <= 6 && options[0].penalty <= 90) return { ...options[0], usedFallback: true };
  return null;
}

const scenarios = [
  { location: 'shoulder', painType: 'dull ache', severity: 3, onset: 'during this set', trigger: 'pressing', romNormal: true, pop: false },
  { location: 'shoulder', painType: 'sharp', severity: 5, onset: 'during this set', trigger: 'overhead press', romNormal: true, pop: false },
  { location: 'knee', painType: 'stabbing', severity: 6, onset: 'earlier today', trigger: 'squat', romNormal: true, pop: false },
  { location: 'back', painType: 'pulling', severity: 7, onset: 'during this set', trigger: 'deadlift', romNormal: false, pop: false },
  { location: 'elbow', painType: 'shooting', severity: 5, onset: 'last few days', trigger: 'extensions', romNormal: true, pop: false },
  { location: 'hip', painType: 'dull ache', severity: 4, onset: 'earlier today', trigger: 'lunges', romNormal: true, pop: false },
  { location: 'wrist', painType: 'sharp', severity: 6, onset: 'during this set', trigger: 'curl', romNormal: true, pop: false },
  { location: 'ankle', painType: 'stabbing', severity: 8, onset: 'during this set', trigger: 'calf raises', romNormal: false, pop: true },
  { location: 'neck', painType: 'numbness/tingling', severity: 6, onset: 'during this set', trigger: 'shrug', romNormal: false, pop: false },
  { location: 'core', painType: 'dull ache', severity: 2, onset: 'earlier today', trigger: 'crunches', romNormal: true, pop: false }
];

const dataset = loadDataset();
const profiles = dataset.map((entry) => {
  const p = buildProfile(entry);
  return { ...p, id: String(entry?.id || ''), name: String(entry?.name || '') };
}).filter((p) => p.id);
const usableSources = profiles.filter((p) => ['chest', 'back', 'shoulders', 'arms', 'legs', 'core'].includes(p.major));

let pass = 0;
let fail = 0;
const failures = [];
const actionCounts = { continue: 0, swap: 0, stop: 0, invalid: 0 };

for (let i = 0; i < 100; i += 1) {
  const source = usableSources[(i * 37) % usableSources.length];
  const scenario = scenarios[i % scenarios.length];
  const ctx = buildPainContext(scenario);
  const action = painAction(ctx);
  actionCounts[action] = (actionCounts[action] || 0) + 1;
  const guidance = painGuidance(ctx, action);

  const loopInfo = {
    loop: i + 1,
    source: source.name,
    sourceMajor: source.major,
    action,
    scenario
  };

  if (action === 'stop') {
    if (!/stop/i.test(guidance)) {
      fail += 1;
      failures.push({ ...loopInfo, reason: 'stop guidance missing stop text' });
      continue;
    }
    pass += 1;
    continue;
  }

  if (action === 'continue') {
    if (!/continue/i.test(guidance)) {
      fail += 1;
      failures.push({ ...loopInfo, reason: 'continue guidance missing continue text' });
      continue;
    }
    pass += 1;
    continue;
  }

  if (action === 'swap') {
    const pick = pickPainAwareSwap(source, source, profiles, ctx);
    if (!pick) {
      fail += 1;
      failures.push({ ...loopInfo, reason: 'swap action produced no candidate' });
      continue;
    }
    if (pick.major !== source.major) {
      fail += 1;
      failures.push({ ...loopInfo, reason: 'swap candidate major mismatch', pick: pick.name, pickMajor: pick.major });
      continue;
    }
    pass += 1;
    continue;
  }

  fail += 1;
  failures.push({ ...loopInfo, reason: 'invalid action' });
}

console.log('Pain report feedback loops: 100');
console.log('Pass:', pass);
console.log('Fail:', fail);
console.log('Actions:', actionCounts);
if (failures.length) {
  console.log('Failure samples:', failures.slice(0, 8));
}

process.exit(fail ? 1 : 0);
