const fs = require('fs');
const path = require('path');

const IMAGE_DB_PATH = path.join(process.cwd(), 'data', 'forum-image-posts-db.json');

const BROAD_LABELS = [
  'meal prep food',
  'fitness progress selfie',
  'exercise in gym',
  'workout plan notebook',
  'supplement bottle',
  'general gym scene'
];

const DETAIL_LABELS = {
  'meal prep food': [
    'rice and meat meal prep',
    'protein breakfast or oats',
    'wrap or sandwich meal',
    'salmon or fish meal',
    'yogurt or parfait bowl'
  ],
  'fitness progress selfie': [
    'glute progress selfie',
    'upper body progress selfie',
    'abs progress selfie',
    'full body physique progress',
    'arm progress selfie'
  ],
  'exercise in gym': [
    'bench press or incline press',
    'back row or pulldown',
    'lateral raise or shoulder exercise',
    'bicep curl or arm exercise',
    'tricep extension or pushdown',
    'squat or leg press',
    'hip thrust or glute exercise',
    'hamstring curl or rdl',
    'calf raise exercise'
  ],
  'workout plan notebook': [
    'written workout split',
    'phone notes or calendar planning',
    'notebook or journal workout plan',
    'meal plan notes'
  ],
  'supplement bottle': [
    'creatine container',
    'protein powder or shaker bottle',
    'pre workout supplement'
  ],
  'general gym scene': [
    'gym mirror selfie',
    'athlete training scene',
    'women sports training',
    'barbell or equipment setup'
  ]
};

function mapVisionToPost(top, detail) {
  const result = {
    imageType: 'general_gym',
    imageSubject: 'gym session',
    imageMuscleGroup: null,
    postAngle: 'check_in'
  };

  if (top === 'meal prep food') {
    result.imageType = 'food';
    result.postAngle = 'protein_question';
    if (/rice and meat/i.test(detail)) result.imageSubject = 'rice and protein meal prep';
    else if (/breakfast|oats/i.test(detail)) result.imageSubject = 'high protein breakfast';
    else if (/wrap|sandwich/i.test(detail)) result.imageSubject = 'high protein wrap';
    else if (/salmon|fish/i.test(detail)) result.imageSubject = 'salmon meal prep';
    else if (/yogurt|parfait/i.test(detail)) result.imageSubject = 'protein yogurt bowl';
    else result.imageSubject = 'high protein meal prep';
    result.imageMuscleGroup = 'nutrition';
    return result;
  }

  if (top === 'fitness progress selfie') {
    result.imageType = 'physique';
    result.postAngle = 'progress';
    if (/glute/i.test(detail)) {
      result.imageSubject = 'glute progress check';
      result.imageMuscleGroup = 'glutes';
    } else if (/upper body/i.test(detail)) {
      result.imageSubject = 'upper body progress check';
      result.imageMuscleGroup = 'upper body';
    } else if (/abs/i.test(detail)) {
      result.imageSubject = 'ab progress check';
      result.imageMuscleGroup = 'abs';
    } else if (/arm/i.test(detail)) {
      result.imageSubject = 'arm progress check';
      result.imageMuscleGroup = 'arms';
    } else {
      result.imageSubject = 'physique progress check';
      result.imageMuscleGroup = 'full body';
    }
    return result;
  }

  if (top === 'exercise in gym') {
    result.imageType = 'exercise';
    result.postAngle = 'technique';
    if (/bench|incline/i.test(detail)) {
      result.imageSubject = 'bench or incline pressing';
      result.imageMuscleGroup = 'chest';
    } else if (/back row|pulldown/i.test(detail)) {
      result.imageSubject = 'back pulling';
      result.imageMuscleGroup = 'back';
    } else if (/lateral raise|shoulder/i.test(detail)) {
      result.imageSubject = 'shoulder isolation';
      result.imageMuscleGroup = 'side delts';
    } else if (/bicep|arm/i.test(detail)) {
      result.imageSubject = 'arm training';
      result.imageMuscleGroup = 'biceps';
    } else if (/tricep/i.test(detail)) {
      result.imageSubject = 'triceps work';
      result.imageMuscleGroup = 'triceps';
    } else if (/squat|leg press/i.test(detail)) {
      result.imageSubject = 'quad focused leg work';
      result.imageMuscleGroup = 'quads';
    } else if (/hip thrust|glute/i.test(detail)) {
      result.imageSubject = 'glute focused exercise';
      result.imageMuscleGroup = 'glutes';
    } else if (/hamstring|rdl/i.test(detail)) {
      result.imageSubject = 'hamstring focused exercise';
      result.imageMuscleGroup = 'hamstrings';
    } else if (/calf/i.test(detail)) {
      result.imageSubject = 'calf training';
      result.imageMuscleGroup = 'calves';
    } else {
      result.imageSubject = 'training variation';
    }
    return result;
  }

  if (top === 'workout plan notebook') {
    result.imageType = 'planning';
    result.postAngle = 'split_review';
    if (/phone notes|calendar/i.test(detail)) result.imageSubject = 'phone workout notes';
    else if (/meal plan/i.test(detail)) result.imageSubject = 'meal planning notes';
    else if (/written workout split|notebook|journal/i.test(detail)) result.imageSubject = 'training split';
    result.imageMuscleGroup = 'programming';
    return result;
  }

  if (top === 'supplement bottle') {
    result.imageType = 'supplement';
    result.postAngle = 'worth_it';
    if (/creatine/i.test(detail)) result.imageSubject = 'creatine';
    else if (/protein/i.test(detail)) result.imageSubject = 'protein powder';
    else if (/pre workout/i.test(detail)) result.imageSubject = 'pre workout';
    else result.imageSubject = 'supplement';
    result.imageMuscleGroup = 'supplements';
    return result;
  }

  result.imageType = 'general_gym';
  result.postAngle = 'check_in';
  if (/mirror/i.test(detail)) result.imageSubject = 'gym mirror check in';
  else if (/women sports/i.test(detail)) result.imageSubject = 'sports training session';
  else if (/barbell|equipment/i.test(detail)) result.imageSubject = 'gym setup';
  else result.imageSubject = 'gym session';
  return result;
}

async function main() {
  const { pipeline } = await import('@xenova/transformers');
  const data = JSON.parse(fs.readFileSync(IMAGE_DB_PATH, 'utf8'));
  const items = Array.isArray(data.items) ? data.items : [];
  const classifier = await pipeline('zero-shot-image-classification', 'Xenova/clip-vit-base-patch32');

  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (!item.imageUrl) continue;
    if (item.visionAnalysis && item.visionAnalysis.broadLabel && item.visionAnalysis.detailLabel) {
      console.log(`[${index + 1}/${items.length}] ${item.id} -> skipped existing analysis`);
      continue;
    }

    try {
      const broad = await classifier(item.imageUrl, BROAD_LABELS);
      const top = broad[0] || { label: 'general gym scene', score: 0 };
      const detailLabels = DETAIL_LABELS[top.label] || DETAIL_LABELS['general gym scene'];
      const detail = await classifier(item.imageUrl, detailLabels);
      const topDetail = detail[0] || { label: detailLabels[0], score: 0 };
      const mapped = mapVisionToPost(top.label, topDetail.label);

      item.visionAnalysis = {
        broadLabel: top.label,
        broadScore: Number(top.score || 0),
        detailLabel: topDetail.label,
        detailScore: Number(topDetail.score || 0),
        allBroad: broad.slice(0, 6),
        allDetail: detail.slice(0, 6)
      };
      item.imageType = mapped.imageType;
      item.imageMainObject = mapped.imageSubject;
      item.imageSubject = mapped.imageSubject;
      item.imageMuscleGroup = mapped.imageMuscleGroup;
      item.imagePostAngle = mapped.postAngle;

      fs.writeFileSync(IMAGE_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
      console.log(`[${index + 1}/${items.length}] ${item.id} -> ${mapped.imageType} / ${mapped.imageSubject}`);
    } catch (error) {
      console.warn(`[${index + 1}/${items.length}] ${item.id} failed: ${error.message}`);
      item.visionAnalysis = {
        broadLabel: 'analysis_failed',
        broadScore: 0,
        detailLabel: 'analysis_failed',
        detailScore: 0,
        error: String(error.message || error)
      };
      fs.writeFileSync(IMAGE_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
    }
  }

  data.generatedAt = new Date().toISOString();
  fs.writeFileSync(IMAGE_DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  console.log(`Saved vision analysis for ${items.length} image posts to ${IMAGE_DB_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
