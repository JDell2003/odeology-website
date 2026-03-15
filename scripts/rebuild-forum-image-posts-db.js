const fs = require('fs');
const path = require('path');

const FORUM_PATH = path.join(process.cwd(), 'data', 'forum-posts.json');
const IMAGE_DB_PATH = path.join(process.cwd(), 'data', 'forum-image-posts-db.json');

function seededValue(seed) {
  let hash = 2166136261;
  const source = String(seed || 'forum-image');
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return () => {
    hash += 0x6D2B79F5;
    let result = Math.imul(hash ^ (hash >>> 15), 1 | hash);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function pretty(value) {
  return String(value || '').replace(/-/g, ' ').trim();
}

function pick(list, random) {
  return list[Math.floor(random() * list.length)];
}

function compactText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function titleCase(value) {
  const text = pretty(value);
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

function imageFingerprint(post) {
  const base = String(post.imagePageUrl || post.imageUrl || post.id || '').toLowerCase();
  const tail = decodeURIComponent(base.split('/').pop() || base);
  return tail
    .replace(/\?.*$/, '')
    .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
    .replace(/[_-]?\d+\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function imageTextBlob(post) {
  return [
    post.imageType,
    post.imageMainObject,
    post.imageSubject,
    post.imageMuscleGroup,
    post.imageCaption,
    post.imageAlt,
    post.imageUrl,
    post.imagePageUrl,
    post.imageCreator,
    post.visionAnalysis && post.visionAnalysis.broadLabel,
    post.visionAnalysis && post.visionAnalysis.detailLabel,
    post.title,
    post.body
  ].filter(Boolean).join(' ').toLowerCase();
}

function isUsableImageRecord(post) {
  const text = imageTextBlob(post);
  const caption = String(post.imageCaption || '').toLowerCase();
  if (!post.imageUrl) return false;
  if (/\b(pdf|page\d+-|ia_|manual|guidebook|yearbook|book scan|scanned|pamphlet|catalog|brochure)\b/.test(text)) return false;
  if (/(\/pdf\/|\.pdf|page\d+-\d+px|practical_child_training|ia_)/.test(text)) return false;
  if (/\b(statue|building|artifact|monument|ruins|sculpture|church|cathedral|temple|museum)\b/.test(text)) return false;
  if (/\b(bus|coach|carriage|truck|train|airplane|skateboard|piggy bank|elephant|toy|painting|birds|wine|television|screen tv|large screen|box|plastic sliding box)\b/.test(caption)) return false;
  if (post.imageType === 'food' && !/\b(food|meal|plate|bowl|tray|sandwich|wrap|salad|rice|fish|salmon|meat|vegetable|banana|counter|table|cooking|preparing)\b/.test(caption)) return false;
  if (post.imageType === 'supplement' && !/\b(bottle|container|powder|shaker|supplement|jar|tub|drink)\b/.test(caption)) return false;
  if (post.imageType === 'planning' && !/\b(notes|notebook|journal|paper|calendar|writing|written|plan)\b/.test(caption)) return false;
  if (post.imageType === 'exercise'
    && !/\b(gym|training|workout|weights|barbell|dumbbell|exercise|press|row|pulldown|squat|leg press|curl|raise|runner|running|lift|lifting)\b/.test(caption)) return false;
  if (post.imageType === 'physique'
    && !/\b(mirror|selfie|posing|physique|body|shirtless|abs|muscular|fitness)\b/.test(caption)) return false;
  if (post.imageType === 'general_gym'
    && !/\b(gym|training|workout|weights|barbell|dumbbell|runner|running|athlete|baseball|track|sport|sports|lift|lifting)\b/.test(caption)) return false;
  return true;
}

function resolveImageRecord(post) {
  const text = imageTextBlob(post);
  const caption = String(post.imageCaption || '').toLowerCase();
  const subject = pretty(post.imageSubject || post.imageMainObject || '');
  const muscle = pretty(post.imageMuscleGroup || '');
  const explicitType = post.imageType || null;
  const resolved = {
    imageType: explicitType || 'general_gym',
    subject: subject || 'training',
    muscleGroup: muscle || null
  };

  if (explicitType === 'food' || explicitType === 'planning' || explicitType === 'supplement' || explicitType === 'article') {
    return resolved;
  }
  if (explicitType === 'physique' && muscle) {
    return resolved;
  }
  if (explicitType === 'exercise' && (muscle || /\b(back pulling|glute focused|quad focused|arm training|shoulder isolation|bench|press|row|pull|curl|tricep|squat|leg|hip thrust|calf)\b/.test(subject.toLowerCase()))) {
    return resolved;
  }

  if (/\b(meal|protein|rice|beef|chicken|salmon|oats|yogurt|prep|food)\b/.test(text)) {
    resolved.imageType = 'food';
    resolved.subject = subject || 'high protein meal';
    resolved.muscleGroup = 'nutrition';
    return resolved;
  }

  if (/\b(split|planner|plan|notepad|notebook|calendar|schedule|notes)\b/.test(text)) {
    resolved.imageType = 'planning';
    resolved.subject = subject || 'training split';
    resolved.muscleGroup = 'programming';
    return resolved;
  }

  if (/\b(creatine|supplement|shaker|powder|pre workout|pre-workout|protein powder)\b/.test(text)) {
    resolved.imageType = 'supplement';
    resolved.subject = subject || 'creatine';
    resolved.muscleGroup = 'supplements';
    return resolved;
  }

  if (/\b(article|study|research|paper|screenshot)\b/.test(text)) {
    resolved.imageType = 'article';
    resolved.subject = subject || 'fitness article';
    return resolved;
  }

  if (/\b(glute|booty|butt|physique|pose|progress|mirror|selfie|model|bikini|shape|body check)\b/.test(text)) {
    resolved.imageType = 'physique';
    resolved.subject = subject || 'progress check';
    resolved.muscleGroup = muscle || (/\b(glute|booty|butt)\b/.test(text) ? 'glutes' : null);
    return resolved;
  }

  if (/\b(incline|bench|press|curl|tricep|triceps|bicep|biceps|lat|row|pullup|pull-up|pulling|squat|leg press|hack squat|rdl|hip thrust|lateral raise|cable fly|cable row|leg curl|calf|quad focused|glute focused)\b/.test(text)) {
    resolved.imageType = 'exercise';
    resolved.subject = subject || muscle || 'training variation';
    return resolved;
  }

  resolved.imageType = 'general_gym';
  resolved.subject = subject || 'gym session';
  return resolved;
}

function captionHas(caption, ...patterns) {
  return patterns.some((pattern) => new RegExp(pattern, 'i').test(caption));
}

function deriveVisualDetails(post, resolved) {
  const caption = String(post.imageCaption || '').toLowerCase();
  const detail = String(post.visionAnalysis && post.visionAnalysis.detailLabel || '').toLowerCase();
  const text = `${caption} ${detail} ${String(post.imageAlt || '')}`.toLowerCase();
  const derived = { ...resolved };

  if (derived.imageType === 'food') {
    if (captionHas(caption, '\\bsalmon\\b', '\\bfish\\b', '\\bfillet\\b')) derived.subject = 'salmon meal prep';
    else if (captionHas(caption, '\\bwrap\\b', '\\bsandwich\\b', '\\btortilla\\b')) derived.subject = 'high protein wrap';
    else if (captionHas(caption, '\\byogurt\\b', '\\bparfait\\b', '\\bgranola\\b', '\\bberries\\b')) derived.subject = 'protein yogurt bowl';
    else if (captionHas(caption, '\\boatmeal\\b', '\\boats\\b', '\\bporridge\\b')) derived.subject = 'high protein oats';
    else if (captionHas(caption, '\\begg\\b', '\\bomelet\\b')) derived.subject = 'high protein eggs';
    else if (captionHas(caption, '\\brace\\b', '\\btray\\b', '\\bcontainer\\b', '\\bmeal prep\\b', '\\bvegetables\\b', '\\bmeat\\b', '\\bchicken\\b')) derived.subject = 'rice and protein meal prep';
    else if (captionHas(caption, '\\bbowl\\b')) derived.subject = 'high protein bowl';
    else if (captionHas(caption, '\\bplate\\b')) derived.subject = 'high protein plate';
    else if (captionHas(caption, '\\bfood\\b', '\\bmeal\\b')) derived.subject = 'high protein meal';
    return derived;
  }

  if (derived.imageType === 'physique') {
    if (captionHas(text, '\\bglute\\b', '\\bbutt\\b', '\\bbooty\\b', '\\bshorts\\b', '\\bleggings\\b')) {
      derived.subject = 'glute progress check';
      derived.muscleGroup = 'glutes';
    } else if (captionHas(text, '\\babs\\b', '\\bmidriff\\b', '\\bwaist\\b', '\\bstomach\\b')) {
      derived.subject = 'ab progress check';
      derived.muscleGroup = 'abs';
    } else if (captionHas(text, '\\barm\\b', '\\bbicep\\b', '\\bflex\\b')) {
      derived.subject = 'arm progress check';
      derived.muscleGroup = 'arms';
    } else if (captionHas(text, '\\bback\\b', '\\blat\\b', '\\bshoulder blades\\b')) {
      derived.subject = 'back progress check';
      derived.muscleGroup = 'back';
    } else if (captionHas(text, '\\bmirror\\b', '\\bselfie\\b', '\\bposing\\b', '\\bphysique\\b', '\\bbody\\b')) {
      derived.subject = 'physique progress check';
      derived.muscleGroup = derived.muscleGroup || 'full body';
    }
    return derived;
  }

  if (derived.imageType === 'exercise') {
    if (captionHas(text, '\\bincline\\b', '\\bbench\\b', '\\bdumbbell press\\b', '\\bsmith\\b', '\\bcable fly\\b')) {
      derived.subject = captionHas(text, '\\bcable fly\\b') ? 'cable fly work' : 'incline or bench pressing';
      derived.muscleGroup = 'chest';
    } else if (captionHas(text, '\\brow\\b', '\\bpulldown\\b', '\\bpullup\\b', '\\blat\\b', '\\bcable row\\b')) {
      derived.subject = captionHas(text, '\\bcable row\\b') ? 'cable row work' : 'back pulling';
      derived.muscleGroup = 'back';
    } else if (captionHas(text, '\\blateral\\b', '\\braise\\b', '\\brear delt\\b', '\\bpec deck\\b')) {
      derived.subject = captionHas(text, '\\brear delt\\b', '\\bpec deck\\b') ? 'rear delt work' : 'side delt work';
      derived.muscleGroup = captionHas(text, '\\brear delt\\b', '\\bpec deck\\b') ? 'rear delts' : 'side delts';
    } else if (captionHas(text, '\\bcurl\\b', '\\bbicep\\b', '\\bdumbbell curl\\b')) {
      derived.subject = 'bicep curl work';
      derived.muscleGroup = 'biceps';
    } else if (captionHas(text, '\\bpushdown\\b', '\\bextension\\b', '\\btricep\\b')) {
      derived.subject = 'tricep extension work';
      derived.muscleGroup = 'triceps';
    } else if (captionHas(text, '\\bhip thrust\\b', '\\bglute bridge\\b')) {
      derived.subject = 'hip thrust work';
      derived.muscleGroup = 'glutes';
    } else if (captionHas(text, '\\brdl\\b', '\\bromanian deadlift\\b', '\\bleg curl\\b', '\\bhamstring\\b')) {
      derived.subject = captionHas(text, '\\bleg curl\\b') ? 'leg curl work' : 'hamstring hinge work';
      derived.muscleGroup = 'hamstrings';
    } else if (captionHas(text, '\\bsquat\\b', '\\bleg press\\b', '\\bhack squat\\b', '\\bsplit squat\\b', '\\bquad\\b')) {
      derived.subject = captionHas(text, '\\bleg press\\b') ? 'leg press work' : 'quad focused leg work';
      derived.muscleGroup = 'quads';
    } else if (captionHas(text, '\\bcalf\\b', '\\btoe raise\\b')) {
      derived.subject = 'calf training';
      derived.muscleGroup = 'calves';
    } else if (captionHas(text, '\\bcar\\b', '\\bvehicle\\b', '\\binterior\\b', '\\bsteering wheel\\b')) {
      derived.imageType = 'general_gym';
      derived.subject = 'beat up after leg day';
      derived.muscleGroup = null;
    }
    return derived;
  }

  if (derived.imageType === 'planning') {
    if (captionHas(text, '\\bnotes\\b', '\\bphone\\b', '\\bscreen\\b')) derived.subject = 'phone workout notes';
    else if (captionHas(text, '\\bnotebook\\b', '\\bjournal\\b', '\\bpaper\\b', '\\bhandwriting\\b')) derived.subject = 'written workout split';
    else if (captionHas(text, '\\bmeal\\b')) derived.subject = 'meal planning notes';
    return derived;
  }

  if (derived.imageType === 'supplement') {
    if (captionHas(text, '\\bcreatine\\b')) derived.subject = 'creatine';
    else if (captionHas(text, '\\bprotein\\b', '\\bshaker\\b')) derived.subject = 'protein powder';
    else if (captionHas(text, '\\bpre workout\\b', '\\bpre-workout\\b', '\\bcaffeine\\b')) derived.subject = 'pre workout';
    return derived;
  }

  if (captionHas(text, '\\bcar\\b', '\\bvehicle\\b', '\\bsteering wheel\\b')) {
    derived.imageType = 'general_gym';
    derived.subject = 'beat up after leg day';
    derived.muscleGroup = null;
  } else if (captionHas(text, '\\bmirror\\b', '\\bselfie\\b')) {
    derived.subject = 'gym mirror check in';
  } else if (captionHas(text, '\\bbarbell\\b', '\\bplates\\b', '\\brack\\b')) {
    derived.subject = 'barbell setup';
  }

  return derived;
}

function buildImageCopy(post) {
  const random = seededValue(post.id);
  const resolved = deriveVisualDetails(post, resolveImageRecord(post));
  const imageCaption = compactText(post.imageCaption || '');
  const subject = pretty(resolved.subject || post.category || 'training');
  const category = post.category || 'training';
  const postType = post.postType || 'question';
  const imageType = resolved.imageType || 'general_gym';
  const muscleGroup = pretty(resolved.muscleGroup || '');

  if (imageType === 'physique' && muscleGroup === 'glutes') {
    const titlePool = [
      'my glutes finally look like theyre starting to grow',
      'what actually got your glutes to finally grow',
      'first time my glutes have looked different in a while'
    ];
    const bodyPool = [
      'posting this because glutes were one of the slower areas for me and this is the first time it actually looks like the work is showing.',
      'curious what made glute growth finally start moving for other people because this is the first time i can really see a change.',
      'not saying i figured everything out, but this is the first progress check that makes me think glute work is finally paying off.'
    ];
    return { title: pick(titlePool, random), body: pick(bodyPool, random), resolved };
  }

  if (imageType === 'physique' && muscleGroup === 'back') {
    const titlePool = [
      'back is finally starting to look different',
      'what actually got your back to start showing more',
      'first time back progress has looked obvious to me'
    ];
    const bodyPool = [
      'back progress has been harder for me to notice than anything else, so this is the first time it has looked different enough to matter.',
      'posting this because i feel like back changes are easy to miss until they finally are not.',
      'curious what actually helped other people once they finally started seeing more back development.'
    ];
    return { title: pick(titlePool, random), body: pick(bodyPool, random), resolved };
  }

  if (imageType === 'supplement' && /creatine|protein powder|pre workout/i.test(subject)) {
    const titlePool = [
      `${titleCase(subject)} worth it or still just extra money`,
      `anybody actually notice enough from ${subject} to keep buying it`,
      `still not sure ${subject} matters but i keep buying it`
    ];
    const bodyPool = [
      `curious if ${subject} has actually felt worth it for other people or if it mostly just feels productive.`,
      `if food and training are still the real drivers here then i dont want to pretend ${subject} matters more than it does.`,
      `this is one of the few products i still think about keeping around, but im still trying to be honest about whether it really helps.`
    ];
    return { title: pick(titlePool, random), body: pick(bodyPool, random), resolved };
  }

  if (imageType === 'food') {
    const text = `${subject} ${imageCaption}`.toLowerCase();
    if (/salmon|fish/.test(text)) {
      return {
        title: pick([
          'salmon meals like this make protein way easier',
          'would you actually keep salmon meal prep like this in rotation',
          'this kind of salmon prep is boring in the best way',
          'salmon like this is exactly what i fall back on when i need easy protein'
        ], random),
        body: pick([
          'this is the kind of meal i can keep around without having to think too hard about protein.',
          'looks simple but meals like this are usually what keep the week from going off the rails.',
          'if a salmon meal is this easy to repeat i usually stop trying to make it more exciting.',
          'for a meal like this the main win is that it is easy enough to make again tomorrow.'
        ], random),
        resolved
      };
    }
    if (/wrap|sandwich|tortilla/.test(text)) {
      return {
        title: pick([
          'wraps like this save me on busy days',
          'good high protein wrap or would you switch it up',
          'this is exactly the kind of meal i use when i dont want to think',
          'portable meals like this do more for me than fancy meal prep ever did'
        ], random),
        body: pick([
          'portable food like this usually does more for consistency than perfect macros ever will.',
          'if i can eat it fast and still get protein in, it stays in the rotation.',
          'curious if you would actually keep a wrap like this all week or get tired of it fast.',
          'this is the type of food that keeps my day together when i dont have time to make a real meal.'
        ], random),
        resolved
      };
    }
    if (/yogurt|parfait|bowl|berries|granola/.test(text)) {
      return {
        title: pick([
          'protein bowls like this are hard to beat',
          'this is one of the easiest high protein snacks ive found',
          'would you count something like this as a real meal or just a snack',
          'stuff like this makes hitting protein feel way less annoying'
        ], random),
        body: pick([
          'stuff like this makes it easier to keep protein up when a full meal sounds annoying.',
          'not fancy at all but this type of bowl usually survives my week better than anything complicated.',
          'i end up leaning on food like this when appetite is weird and i still need something easy.',
          'this is the kind of thing i use when i need something quick that still feels decent.'
        ], random),
        resolved
      };
    }
    if (/oats|oatmeal|porridge/.test(text)) {
      return {
        title: pick([
          'oats like this are still one of the easiest ways to get food in',
          'would you actually eat something like this before training',
          'simple breakfasts like this save me more than meal prep does sometimes',
          'this is the kind of breakfast i default to when everything feels rushed'
        ], random),
        body: pick([
          'breakfast gets way easier when the food is simple enough to make half asleep.',
          'meals like this are not exciting but they do make it easier to get the day started right.',
          'curious if people here still use oats a lot or if most of you moved on to something faster.',
          'for me the big win is that food like this is easy to repeat without thinking.'
        ], random),
        resolved
      };
    }
    if (/egg|omelet/.test(text)) {
      return {
        title: pick([
          'eggs still carry way more of my week than i want to admit',
          'would you keep a meal like this in the breakfast rotation',
          'simple egg meals are hard to beat when i need real food fast',
          'this is the kind of meal i make when protein needs to be easy'
        ], random),
        body: pick([
          'this is the kind of meal that works because it is fast and hard to mess up.',
          'nothing fancy here, just food that actually makes it easier to hit protein.',
          'if breakfast is going to happen for me it usually looks more like this than something creative.',
          'the best meals are usually the ones you can keep making without getting annoyed.'
        ], random),
        resolved
      };
    }
    if (/plate/.test(text)) {
      return {
        title: pick([
          'meals like this are why simple food still wins',
          'would you keep a plate like this in rotation all week',
          'this is about as practical as food gets for me',
          'nothing fancy but this is the type of meal i repeat'
        ], random),
        body: pick([
          'this kind of plate is usually what keeps my food from getting way too complicated.',
          'if the meal is easy enough to repeat i care way more about that than it looking impressive.',
          'food like this tends to survive busy weeks better than the meals i overplan.',
          'curious if you guys would actually keep something like this in the regular rotation.'
        ], random),
        resolved
      };
    }
  }

  if (imageType === 'exercise') {
    const text = `${subject} ${imageCaption}`.toLowerCase();
    if (/hip thrust|glute bridge|glute/.test(text)) {
      return {
        title: pick([
          'my glutes finally started responding once i took hip thrusts seriously',
          'is this the kind of glute work that actually makes a difference',
          'hip thrusts like this finally made glute work click for me'
        ], random),
        body: pick([
          'this is the first time direct glute work has looked like it was actually doing something instead of just tiring me out.',
          'curious if glutes finally started moving for other people once they added more focused work like this.',
          'not saying this fixes everything, but this kind of setup felt way more direct than what i was doing before.'
        ], random),
        resolved
      };
    }
    if (/cable row|row|pulldown|pullup|lat/.test(text)) {
      return {
        title: pick([
          'cable rows finally started making sense to me',
          'does this kind of back work finally make lats click for you',
          'pretty sure this is the kind of pull work my back needed'
        ], random),
        body: pick([
          'this was one of the first pulling setups where it actually felt like back work instead of arms taking over.',
          'curious if a row like this was what finally helped other people feel their back properly.',
          'small change on paper but this looked and felt way more like actual back training.'
        ], random),
        resolved
      };
    }
    if (/bench|incline|cable fly|press/.test(text)) {
      return {
        title: pick([
          'incline work like this finally made my upper chest feel involved',
          'does this pressing variation hit better than the usual version for anyone else',
          'should a movement like this go earlier in the workout'
        ], random),
        body: pick([
          'this is one of those setups that finally felt like chest instead of shoulders doing all the work.',
          'curious if you would keep a press like this in the same spot or move it earlier in the session.',
          'first time a pressing setup like this actually looked repeatable to me instead of awkward.'
        ], random),
        resolved
      };
    }
    if (/lateral|rear delt|pec deck|shoulder/.test(text)) {
      return {
        title: pick([
          'shoulder work like this finally started clicking for me',
          'what actually made your side delts start responding',
          'rear delt work always looks simple until you try to make it count'
        ], random),
        body: pick([
          'this kind of shoulder setup finally felt direct instead of everything around it taking over.',
          'curious if delt work started moving for other people once they cleaned up a setup like this.',
          'still one of those movements where a small setup change matters way more than i expected.'
        ], random),
        resolved
      };
    }
    if (/squat|leg press|hack squat|split squat|quad/.test(text)) {
      return {
        title: pick([
          'leg work like this always makes me question my life choices',
          'do your quads respond better when work like this goes first',
          'pretty sure this is the kind of leg setup that humbles everybody'
        ], random),
        body: pick([
          'nothing complicated here, just the kind of leg work that reminds you effort is still the whole game.',
          'curious if you would keep this early in the session or move it after something heavier.',
          'this setup always looks manageable until the set actually starts.'
        ], random),
        resolved
      };
    }
  }

  if (imageType === 'general_gym' && /beat up after leg day|car|steering wheel/.test(`${subject} ${imageCaption}`.toLowerCase())) {
    return {
      title: pick([
        'me after leg day every single time',
        'the drive home after leg day is always different',
        'legs are cooked and i still have to get home somehow'
      ], random),
      body: pick([
        'not even trying to be deep here. this is just the exact feeling after a real lower body session.',
        'if youve ever sat in the car after leg day staring into space for a minute then you already get it.',
        'the session is over but the recovery discussion has already started.'
      ], random),
      resolved
    };
  }

  if (imageType === 'general_gym' && /baseball|bat|track|runner|sports training/.test(`${subject} ${imageCaption}`.toLowerCase())) {
    return {
      title: pick([
        'sports training still counts even when it isnt a normal gym day',
        'this kind of field work always reminds me conditioning matters too',
        'anyone else feel way more athletic when training looks like this'
      ], random),
      body: pick([
        'not every session needs to be a standard gym setup. stuff like this still does a lot more than people give it credit for.',
        'this is the kind of training that makes me remember general athleticism still matters outside the usual lift list.',
        'curious how many people here still mix sports style work in instead of only chasing gym numbers.'
      ], random),
      resolved
    };
  }

  const families = {
    food: {
      question: {
        titles: [
          `would you actually keep ${subject} in rotation or get sick of it fast`,
          `this ${subject} looks simple but would you run it all week`,
          `good ${category === 'cutting' ? 'cut' : 'high protein'} meal or too boring to repeat`
        ],
        bodies: [
          `screenshotting this because meals like ${subject} are the only reason i hit protein on busy weeks.`,
          `this is the kind of food setup i end up coming back to when i need something easy and repeatable.`,
          `curious if you guys would actually keep something like this in the rotation or change it after two days.`
        ]
      },
      personal: {
        titles: [
          `${titleCase(subject)} has been saving my week`,
          `kept ${subject} in the rotation because it just works`,
          `this is the type of meal i always come back to`
        ],
        bodies: [
          `nothing crazy here. it just makes protein and calories easier to handle when the week gets messy.`,
          `i end up leaning on meals like this whenever i need food that is fast, repeatable, and hard to mess up.`,
          `not glamorous at all, but this kind of meal prep is usually what keeps the rest of the plan together.`
        ]
      },
      advice: {
        titles: [
          `meals like this are boring but they work`,
          `if your week is busy this kind of food is hard to beat`,
          `simple high protein food usually wins`
        ],
        bodies: [
          `when the goal is staying consistent i would rather have a boring meal i can repeat than a perfect one i never make again.`,
          `food setups like this are usually better than overcomplicating every meal and falling off by thursday.`,
          `if someone asked me what to keep around for hectic weeks, it would be stuff like this.`
        ]
      },
      casual: {
        titles: [
          `meal prep still comes down to food you will actually repeat`,
          `this looks boring and thats exactly why it works`,
          `protein is easy when the food is this simple`
        ],
        bodies: [
          `meals like this are not exciting, they are just practical.`,
          `this is the kind of food that keeps a week from falling apart.`,
          `half the battle is having something easy enough to make again tomorrow.`
        ]
      }
    },
    planning: {
      question: {
        titles: [
          `does this ${subject} look simple enough to actually follow`,
          `would you leave this ${subject} alone or keep tweaking it`,
          `at what point do you stop changing the plan every week`
        ],
        bodies: [
          `this is the kind of layout i wish i used sooner because i usually overcomplicate the week for no reason.`,
          `trying to keep the structure obvious enough that i can follow it even when life gets messy.`,
          `curious if you would leave something this simple alone or if you would still want to adjust it.`
        ]
      },
      personal: {
        titles: [
          `rewrote my ${subject} because i kept overcomplicating everything`,
          `cleaned this up and the week already feels easier`,
          `simplifying the plan helped more than i expected`
        ],
        bodies: [
          `most of my inconsistency was not motivation. it was having a setup that was way too easy to second guess.`,
          `this kind of simple structure has been easier to follow than the more detailed versions i kept making.`,
          `posting it because i know im not the only one who turns a normal split into a project.`
        ]
      },
      advice: {
        titles: [
          `a plan this simple is usually easier to stick to`,
          `consistency usually starts with a cleaner setup`,
          `most people would do better with less plan tinkering`
        ],
        bodies: [
          `if the split only works on perfect weeks it probably needs to be simplified.`,
          `this kind of setup is not exciting, but it is a lot easier to repeat than something overly detailed.`,
          `i would take a basic structure i can actually run over a fancy one i rewrite every few days.`
        ]
      },
      casual: {
        titles: [
          `my notes app still causes more problems than progress`,
          `keeping the plan simple is harder than it should be`,
          `this week went better once the setup got boring`
        ],
        bodies: [
          `simple structure keeps saving me from my own bad ideas.`,
          `every time i make the plan cleaner the week gets easier to follow.`,
          `turns out less tweaking really does help.`
        ]
      }
    },
    exercise: {
      question: {
        titles: [
          `does ${subject} look better earlier in the workout or where it is now`,
          `this variation finally feels better but am i overthinking it`,
          `anybody else need a while before ${subject} actually clicks`
        ],
        bodies: [
          `this is the first time ${subject} has looked and felt close to what i wanted, so now im trying not to mess it up by changing too much.`,
          `curious if you would progress this as is or move it around in the workout first.`,
          `i feel like the setup finally makes sense here, but i still cant tell if the order is helping more than the movement itself.`
        ]
      },
      personal: {
        titles: [
          `${titleCase(subject)} finally started feeling right`,
          `this setup made ${subject} click way more`,
          `small change but ${subject} feels a lot better now`
        ],
        bodies: [
          `nothing dramatic changed. it just finally looked and felt like i was doing the exercise instead of surviving it.`,
          `the big thing here was slowing down and actually paying attention to the setup instead of rushing reps.`,
          `posting it because this was one of those exercises that stayed awkward until one small fix clicked.`
        ]
      },
      advice: {
        titles: [
          `if an exercise looks like this and still feels off i fix the setup first`,
          `a better setup usually beats random extra volume`,
          `this is why i check execution before changing the whole plan`
        ],
        bodies: [
          `most exercise problems feel like programming problems at first, but a lot of them are really setup and execution issues.`,
          `before i add sets or swap movements, i usually make sure the exercise actually looks repeatable first.`,
          `this kind of thing is why i try not to blame the whole split too early.`
        ]
      },
      casual: {
        titles: [
          `${titleCase(subject)} still humbles me`,
          `this movement always looks easier than it feels`,
          `some exercises never stop making you work for it`
        ],
        bodies: [
          `still one of those movements that can make a normal session feel serious fast.`,
          `simple on paper, rude in real life.`,
          `nothing deep here. just respect for the movement.`
        ]
      }
    },
    physique: {
      question: {
        titles: [
          muscleGroup === 'glutes' ? `are my glutes finally growing or am i reaching` : `am i being impatient or is progress finally showing here`,
          muscleGroup === 'glutes' ? `what actually made your glutes start growing` : `still feels behind but i can finally see something changing`,
          `bulk or keep leaning out a little more from here`
        ],
        bodies: [
          muscleGroup === 'glutes'
            ? `first progress shot in a while where it actually looks like glute work is doing something.`
            : `this is the first time in a while that progress has looked different enough for me to actually notice it.`,
          muscleGroup === 'glutes'
            ? `still trying to figure out if i just need more time or if something finally started clicking.`
            : `still not where i want it, but at least it finally looks like the work is doing something.`,
          `curious if you would keep pushing the same direction here or make a small change now.`
        ]
      },
      personal: {
        titles: [
          muscleGroup === 'glutes' ? `my glutes finally look like theyre doing something` : `progress is slow but it finally looks different`,
          muscleGroup === 'glutes' ? `this is the first progress pic where glutes actually look different` : `this is the first time the work has really shown up`,
          `trying not to overreact but i can finally see a change`
        ],
        bodies: [
          `posting it mostly to keep myself honest because day to day progress is way harder to notice than people think.`,
          `nothing insane here. just the kind of change that reminds you consistency does add up.`,
          `i still have lagging spots, but this is enough to make me stick with the plan a little longer.`
        ]
      },
      advice: {
        titles: [
          `photos like this are why i try not to judge progress week to week`,
          `boring progress still counts`,
          `small changes show up before perfect photos do`
        ],
        bodies: [
          `most people expect progress to look dramatic before it looks real, but usually it starts with little changes like this.`,
          `this is why i try not to panic every time progress feels slow for a couple weeks.`,
          `if the trend is moving, i would rather stay patient than force a change too early.`
        ]
      },
      casual: {
        titles: [
          `progress is progress even when it still feels slow`,
          `finally a little visual proof that the work is doing something`,
          `not perfect but definitely moving`
        ],
        bodies: [
          `this is the kind of progress that keeps you locked in.`,
          `small change, big morale boost.`,
          `sometimes thats all you need.`
        ]
      }
    },
    supplement: {
      question: {
        titles: [
          `anybody actually notice enough from ${subject} to keep buying it`,
          `${titleCase(subject)} worth it or still just extra money`,
          `would you buy this again or keep it basic`
        ],
        bodies: [
          `i still try to be honest about whether something like ${subject} is actually helping or just feels productive.`,
          `curious if people here actually notice a difference from this or if it mostly just makes the routine feel more serious.`,
          `if food and training are still the main drivers, i dont want to act like this matters more than it does.`
        ]
      },
      personal: {
        titles: [
          `${titleCase(subject)} is one of the few things i still keep around`,
          `${titleCase(subject)} is still one of the only supplements i havent dropped`,
          `still not sure ${subject} matters but i keep buying it`
        ],
        bodies: [
          `most tubs end up feeling optional pretty fast, but this is one of the few i still keep in the routine.`,
          `posting it because i know a lot of people keep trying to figure out where basics end and hype begins.`,
          `im still way more focused on food and training, but this is one of the rare things i havent cut.`
        ]
      },
      advice: {
        titles: [
          `if you buy anything keep it basic`,
          `supplements should stay boring`,
          `food and training still deserve more attention than this`
        ],
        bodies: [
          `if the main routine is messy i would not expect a product like this to save anything.`,
          `the only supplement advice i really trust is to keep the list short and the expectations lower.`,
          `most people would probably benefit more from cleaner basics than another product.`
        ]
      },
      casual: {
        titles: [
          `expensive tubs still try to become a personality`,
          `supplement shelves stay undefeated`,
          `this stuff always looks more important than it is`
        ],
        bodies: [
          `still funny how often packaging does half the job.`,
          `the marketing is always stronger than the actual effect.`,
          `same conversation every year.`
        ]
      }
    },
    article: {
      question: {
        titles: [
          `saw this and now im rethinking how im doing things`,
          `you guys actually agree with this take or not`,
          `saved this because it was better than the usual fitness post`
        ],
        bodies: [
          `the point here felt more useful than most random fitness content i run into, so i wanted to see what people thought.`,
          `not saying one screenshot should change a whole plan, but this did make me stop and think for a second.`,
          `curious if you actually change anything after reading stuff like this or just keep doing what already works.`
        ]
      },
      personal: {
        titles: [
          `this was one of the better fitness takeaways ive seen lately`,
          `saved this because the takeaway actually made sense`,
          `rare fitness post that was worth keeping`
        ],
        bodies: [
          `most stuff like this is forgettable, but this one at least connected back to something real in training.`,
          `posting it because it made me think more about what im actually doing instead of just collecting content.`,
          `if something like this changes one real decision in the week it is already more useful than most posts.`
        ]
      },
      advice: {
        titles: [
          `content like this is only useful if it changes one real thing`,
          `take one useful point and ignore the rest`,
          `most fitness posts are noise unless they change a real decision`
        ],
        bodies: [
          `i try to treat stuff like this as one possible takeaway, not a reason to rewrite everything.`,
          `the useful part is usually the one thing that makes you clean up an obvious mistake.`,
          `if the content does not change something real in your week then it is mostly entertainment.`
        ]
      },
      casual: {
        titles: [
          `fitness posts are either useless or weirdly helpful`,
          `rare screenshot that actually says something`,
          `every once in a while one of these is worth saving`
        ],
        bodies: [
          `most of them are noise. this one at least got my attention.`,
          `not life changing, just actually useful for once.`,
          `thats more than i can say for most fitness content.`
        ]
      }
    },
    general_gym: {
      question: {
        titles: [
          `anyone else train better when the setup stays this simple`,
          `is it normal to lose momentum after one messy week`,
          `what actually keeps you consistent when life gets loud`
        ],
        bodies: [
          `this kind of post is really more about routine than some deep training insight.`,
          `most of my bad weeks start with small friction stacking up until the whole thing feels heavier than it should.`,
          `curious what actually keeps you steady when life gets noisy and the gym stops feeling automatic.`
        ]
      },
      personal: {
        titles: [
          `kept the session basic and it still ended up being solid`,
          `not a perfect week but this still counted`,
          `showing up was probably the win here`
        ],
        bodies: [
          `this was one of those sessions where keeping it simple mattered more than trying to make it ideal.`,
          `posting it because real progress usually looks more like this than some huge breakthrough.`,
          `some weeks the goal is just to not let one bad day turn into four.`
        ]
      },
      advice: {
        titles: [
          `most weeks go better when the setup is lower friction`,
          `simple gym routines survive real life better`,
          `less setup usually means more consistency`
        ],
        bodies: [
          `if getting to the gym takes too much setup the plan usually starts breaking the second life gets busy.`,
          `a routine that survives a normal hectic week is worth more than one that only works when everything is calm.`,
          `this is why i usually simplify first before blaming motivation.`
        ]
      },
      casual: {
        titles: [
          `real life is still the hardest part of the program`,
          `basic sessions are underrated`,
          `busy week but the session still happened`
        ],
        bodies: [
          `not every gym post needs a lesson.`,
          `sometimes showing up is enough.`,
          `this felt like one of those days.`
        ]
      }
    }
  };

  if (imageType === 'exercise' && muscleGroup === 'glutes') {
    families.exercise = {
      ...families.exercise,
      question: {
        titles: [
          `did glutes finally start growing once you added something like this`,
          `is this the kind of glute work that finally makes a difference`,
          `would you put glute work like this earlier in the session`
        ],
        bodies: [
          `this is the kind of movement that makes me wonder if my glutes needed a more direct setup the whole time.`,
          `curious if this is the sort of exercise that finally gets glutes moving or if it still comes down to patience.`,
          `if youve had glutes lag for a while, was it a movement like this that actually helped.`
        ]
      },
      personal: {
        titles: [
          `my glutes finally started responding once i added something like this`,
          `this kind of glute work makes way more sense to me now`,
          `pretty sure this is the kind of movement my glutes were missing`
        ],
        bodies: [
          `this is the first time glute work has looked and felt like it was actually doing something instead of just tiring me out.`,
          `posting it because glutes were one of the slower areas for me and this kind of setup finally felt more direct.`,
          `not saying one exercise changes everything, but this definitely felt more targeted than what i was doing before.`
        ]
      },
      advice: families.exercise.advice,
      casual: families.exercise.casual
    };
  }

  if (imageType === 'exercise' && muscleGroup === 'back') {
    families.exercise = {
      ...families.exercise,
      question: {
        titles: [
          `does this kind of back work finally make lats click for you`,
          `back work like this feel way better than the usual version for anyone else`,
          `would you move this pulling work earlier in the session`
        ],
        bodies: [
          `this looks like the kind of setup that either makes back training click or still ends up in the arms.`,
          `curious if a movement like this was what finally helped you feel your back properly.`,
          `trying to figure out whether this is more about execution or just needing better back exercise choices.`
        ]
      },
      personal: {
        titles: [
          `back work finally started feeling more direct with this`,
          `pretty sure this is the kind of pull work my back needed`,
          `this setup made back training click way more`
        ],
        bodies: [
          `the big difference here was finally feeling back work where i was supposed to instead of everything else taking over.`,
          `posting it because this is the kind of pull variation that makes you realize setup matters a lot.`,
          `not a huge change on paper, but this definitely felt more like back training than what i was doing before.`
        ]
      },
      advice: families.exercise.advice,
      casual: families.exercise.casual
    };
  }

  const pool = families[imageType] || families.general_gym;
  const family = pool[postType] || pool.question;
  const title = compactText(pick(family.titles, random));
  const body = compactText(pick(family.bodies, random));
  return { title, body, resolved };
}

function main() {
  const forum = JSON.parse(fs.readFileSync(FORUM_PATH, 'utf8'));
  const existingImageDb = fs.existsSync(IMAGE_DB_PATH)
    ? JSON.parse(fs.readFileSync(IMAGE_DB_PATH, 'utf8'))
    : { items: [] };
  const imageIndex = new Map((Array.isArray(existingImageDb.items) ? existingImageDb.items : []).filter((item) => item && item.id).map((item) => [item.id, item]));
  const items = Array.isArray(forum.items) ? forum.items : [];
  const imageDbItems = [];

  const rewritten = items.map((post) => {
    if (!(post.format === 'image' && post.imageUrl)) return post;
    const imageRecord = imageIndex.get(post.id);
    const source = imageRecord ? { ...post, ...imageRecord } : post;
    if (!isUsableImageRecord(source)) {
      return {
        ...post,
        format: 'text',
        imageUrl: null,
        imageAlt: null,
        imageSource: null,
        imageCreator: null,
        imageLicense: null,
        imageLicenseUrl: null,
        imagePageUrl: null
      };
    }

    const copy = buildImageCopy(source);
    const fingerprint = imageFingerprint(source);
    const updated = {
      ...post,
      ...(imageRecord || {}),
      imageType: copy.resolved.imageType,
      imageMainObject: copy.resolved.subject,
      imageSubject: copy.resolved.subject,
      imageMuscleGroup: copy.resolved.muscleGroup,
      title: copy.title,
      body: copy.body
    };

    imageDbItems.push({
      id: post.id,
      slug: post.slug,
      imageFingerprint: fingerprint,
      imageType: updated.imageType || null,
      imageMainObject: updated.imageMainObject || null,
      imageSubject: updated.imageSubject || null,
      imageMuscleGroup: updated.imageMuscleGroup || null,
      imagePostAngle: updated.imagePostAngle || null,
      imageCaption: updated.imageCaption || null,
      imageUrl: updated.imageUrl,
      imageAlt: updated.imageAlt || null,
      imageSource: updated.imageSource || null,
      imageCreator: updated.imageCreator || null,
      imageLicense: updated.imageLicense || null,
      imageLicenseUrl: updated.imageLicenseUrl || null,
      imagePageUrl: updated.imagePageUrl || null,
      visionAnalysis: imageRecord ? imageRecord.visionAnalysis || null : null,
      postType: post.postType,
      category: post.category,
      scope: post.scope,
      title: copy.title,
      body: copy.body,
      score: post.score,
      comments: post.comments,
      viewCount: post.viewCount,
      saveCount: post.saveCount,
      ageMinutes: post.ageMinutes,
      isSeeded: post.isSeeded === true
    });

    return updated;
  });

  forum.generatedAt = new Date().toISOString();
  forum.summary = {
    ...(forum.summary || {}),
    imagePostDatabaseCount: imageDbItems.length
  };
  forum.items = rewritten;

  const imageDb = {
    generatedAt: new Date().toISOString(),
    total: imageDbItems.length,
    items: imageDbItems
  };

  fs.writeFileSync(FORUM_PATH, JSON.stringify(forum, null, 2), 'utf8');
  fs.writeFileSync(IMAGE_DB_PATH, JSON.stringify(imageDb, null, 2), 'utf8');
  console.log(`Saved ${imageDbItems.length} image posts to ${IMAGE_DB_PATH}`);
}

main();
