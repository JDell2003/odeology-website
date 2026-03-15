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
    post.imageAlt,
    post.imageUrl,
    post.imagePageUrl,
    post.imageCreator,
    post.title,
    post.body
  ].filter(Boolean).join(' ').toLowerCase();
}

function isUsableImageRecord(post) {
  const text = imageTextBlob(post);
  if (!post.imageUrl) return false;
  if (/\b(pdf|page\d+-|ia_|manual|guidebook|yearbook|book scan|scanned|pamphlet|catalog|brochure)\b/.test(text)) return false;
  if (/(\/pdf\/|\.pdf|page\d+-\d+px|practical_child_training|ia_)/.test(text)) return false;
  if (/\b(statue|building|artifact|monument|ruins|sculpture|church|cathedral|temple|museum)\b/.test(text)) return false;
  return true;
}

function resolveImageRecord(post) {
  const text = imageTextBlob(post);
  const subject = pretty(post.imageSubject || post.imageMainObject || '');
  const muscle = pretty(post.imageMuscleGroup || '');
  const resolved = {
    imageType: post.imageType || 'general_gym',
    subject: subject || 'training',
    muscleGroup: muscle || null
  };

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

  if (/\b(incline|bench|press|curl|tricep|triceps|bicep|biceps|lat|row|pullup|pull-up|squat|leg press|hack squat|rdl|hip thrust|lateral raise|cable fly|cable row|leg curl|calf)\b/.test(text)) {
    resolved.imageType = 'exercise';
    resolved.subject = subject || muscle || 'training variation';
    return resolved;
  }

  resolved.imageType = 'general_gym';
  resolved.subject = subject || 'gym session';
  return resolved;
}

function buildImageCopy(post) {
  const random = seededValue(post.id);
  const resolved = resolveImageRecord(post);
  const subject = pretty(resolved.subject || post.category || 'training');
  const category = post.category || 'training';
  const postType = post.postType || 'question';
  const imageType = resolved.imageType || 'general_gym';
  const muscleGroup = pretty(resolved.muscleGroup || '');

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
          `one of the only supplements i havent fully dropped`,
          `still not sure this matters but i keep buying it`
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

  const pool = families[imageType] || families.general_gym;
  const family = pool[postType] || pool.question;
  const title = compactText(pick(family.titles, random));
  const body = compactText(pick(family.bodies, random));
  return { title, body, resolved };
}

function main() {
  const forum = JSON.parse(fs.readFileSync(FORUM_PATH, 'utf8'));
  const items = Array.isArray(forum.items) ? forum.items : [];
  const imageDbItems = [];

  const rewritten = items.map((post) => {
    if (!(post.format === 'image' && post.imageUrl)) return post;
    if (!isUsableImageRecord(post)) {
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

    const copy = buildImageCopy(post);
    const fingerprint = imageFingerprint(post);
    const updated = {
      ...post,
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
      imageType: post.imageType || null,
      imageMainObject: post.imageMainObject || null,
      imageSubject: post.imageSubject || null,
      imageMuscleGroup: post.imageMuscleGroup || null,
      imagePostAngle: post.imagePostAngle || null,
      imageUrl: post.imageUrl,
      imageAlt: post.imageAlt || null,
      imageSource: post.imageSource || null,
      imageCreator: post.imageCreator || null,
      imageLicense: post.imageLicense || null,
      imageLicenseUrl: post.imageLicenseUrl || null,
      imagePageUrl: post.imagePageUrl || null,
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
