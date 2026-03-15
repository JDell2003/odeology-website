(function () {
  const feed = document.getElementById('forum-feed');
  const filterControls = Array.from(document.querySelectorAll('.forum-filter-control'));
  const addPostButton = document.getElementById('forum-add-post');
  const composeModal = document.getElementById('forum-compose-modal');
  const composeForm = document.getElementById('forum-compose-form');
  const composeTitleInput = document.getElementById('forum-compose-title-input');
  const composeBodyInput = document.getElementById('forum-compose-body');
  const composeCategoryInput = document.getElementById('forum-compose-category');
  const composeImageUrlInput = document.getElementById('forum-compose-image-url');
  const composeImageFileInput = document.getElementById('forum-compose-image-file');
  const composePreview = document.getElementById('forum-compose-preview');

  if (!feed || !filterControls.length) return;

  const CUSTOM_POST_STORAGE_KEY = 'ode_forum_custom_posts_v1';

  const avatarByCategory = {
    training: 'https://images.unsplash.com/photo-1704223524532-c5b4e8490297?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=120&h=120',
    nutrition: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=120&h=120',
    recovery: 'https://images.unsplash.com/photo-1547852355-61348aeea17c?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=120&h=120',
    cutting: 'https://images.unsplash.com/photo-1508170754725-6e9a5cfbcabf?auto=format&fit=crop&fm=jpg&ixlib=rb-4.1.0&q=80&w=120&h=120',
    bulking: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=120&h=120',
    supplements: 'https://images.unsplash.com/photo-1579722821273-0f6c7d44362f?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=120&h=120',
    lifestyle: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&fm=jpg&ixlib=rb-4.0.3&q=80&w=120&h=120'
  };

  const state = {
    sort: 'best',
    scope: 'all',
    time: 'all'
  };

  let posts = [];
  const imagePostIndex = new Map();
  const openComments = new Set();
  const commentCache = new Map();
  let currentUser = null;
  let pendingComposeFileUrl = '';

  const commentNamePool = ['matt', 'derek', 'sarah', 'alex', 'jason', 'mia', 'tyler', 'josh', 'noah', 'emma', 'ash', 'luke', 'nina', 'ella', 'brad', 'zoe'];
  const commentFitnessHandles = ['ironmike', 'benchbeast', 'squatdad', 'platepusher', 'cutmode', 'bulkseason', 'latlover', 'barpath', 'repfiend', 'chalkhands'];
  const commentUnderscoreHandles = ['jay_train', 'lifter_matt', 'sarah_lifts', 'alex_cuts', 'bench_ben', 'plates_n_prep', 'coach_jay', 'derek_rows'];
  const commentCasualHandles = ['bro_lifts', 'gymrat', 'late_night_lifter', 'mealguy', 'cardiohater', 'legdaypain', 'preworkoutbrain', 'restdayvibes'];

  const shortCommentReactions = [
    'same thing happened to me lol',
    'this is actually solid',
    'id keep it simple',
    'you are overthinking it',
    'that makes sense',
    'yeah that helped me too',
    'bulgarian split squats should be illegal',
    'this makes way more sense',
    'same here 😭',
    'i learned that the hard way'
  ];

  const categoryCommentPools = {
    training: {
      topics: ['exercise order', 'weekly volume', 'rep quality', 'range of motion', 'effort on last sets', 'upper body day structure'],
      observations: ['you are probably doing too much junk volume', 'the first exercise is carrying the whole session', 'your curls look better when they come after rows', 'the weekly split matters more than one perfect workout', 'the hard sets need to stay hard'],
      suggestions: ['trim one accessory and push the main lift harder', 'keep one curl pattern and progress it for four weeks', 'track the first working set instead of changing everything', 'put the hardest biceps work earlier in the session', 'stop adding sets when the reps are slowing down']
    },
    nutrition: {
      topics: ['meal prep', 'protein target', 'hunger management', 'food volume', 'weekday consistency', 'grocery choices'],
      observations: ['the meal looks lean enough but probably too light for the day', 'most people undercount sauces and snacks here', 'the food quality is solid but the portions decide everything', 'consistency usually matters more than perfect macros', 'the grocery setup is doing most of the work'],
      suggestions: ['build one repeatable breakfast and lunch first', 'keep protein the same and adjust carbs around training', 'add one higher volume side so hunger stays calm', 'pick foods you can actually repeat for ten days', 'weigh the high calorie extras once so you know the real numbers']
    },
    recovery: {
      topics: ['sleep debt', 'soreness', 'rest days', 'fatigue management', 'deload timing', 'stress load'],
      observations: ['the recovery issue usually shows up before the lift stalls', 'people call this a motivation problem when it is really fatigue', 'your body is probably carrying more stress than the plan assumes', 'the soreness is a sign the week is not balancing out', 'recovery habits matter more than another accessory day'],
      suggestions: ['pull one hard day back before adding more work', 'lock in sleep and steps for a full week first', 'use one lighter day to keep quality high', 'take the easy week before you feel forced into it', 'separate hard lower body work from your busiest day']
    },
    cutting: {
      topics: ['diet fatigue', 'adherence', 'food choice', 'satiety', 'step count', 'training energy'],
      observations: ['cutting gets messy when the plan is too aggressive on busy days', 'that usually happens when calories are low and activity is inconsistent', 'the hard part is not the deficit but repeating it cleanly', 'energy drops when food timing is all over the place', 'most stalls on a cut are routine problems first'],
      suggestions: ['keep calories steady for four days before making changes', 'move more carbs closer to training', 'build one fallback meal for the nights you are cooked', 'use a smaller deficit if the lifts are crashing', 'watch the weekends before slashing more food']
    },
    bulking: {
      topics: ['rate of gain', 'appetite', 'food quality', 'training push', 'meal frequency', 'bodyweight trend'],
      observations: ['most bulks go sideways when the surplus gets sloppy', 'the scale trend matters more than one heavy day of eating', 'you want enough food to perform without feeling wrecked', 'the extra calories should support better sessions', 'bulking works best when the routine is boring on purpose'],
      suggestions: ['raise intake in small steps instead of free styling weekends', 'anchor one liquid calorie meal if appetite is low', 'keep the same weigh in routine every morning', 'push performance markers before pushing more food', 'add one easy carb source you can repeat daily']
    },
    supplements: {
      topics: ['stack choice', 'dosage timing', 'routine simplicity', 'expectations', 'budget', 'consistency'],
      observations: ['most stacks are doing too much for too little return', 'consistency beats a longer supplement list', 'the basics cover more than people think', 'timing matters less than taking it daily', 'a clean routine is easier to judge'],
      suggestions: ['keep creatine and protein then audit the rest', 'drop anything you cannot explain in one sentence', 'run the basics for a month before adding more', 'spend the money on food and sleep if the budget is tight', 'separate what helps performance from what just sounds good']
    },
    lifestyle: {
      topics: ['schedule control', 'routine friction', 'travel weeks', 'consistency', 'work stress', 'daily habits'],
      observations: ['the plan usually breaks where the routine gets inconvenient', 'this reads like a schedule problem more than a willpower problem', 'small habits are carrying the big results here', 'consistency always looks boring from the outside', 'real life logistics matter more than the perfect template'],
      suggestions: ['reduce the setup time for the habit you keep missing', 'build a version of the plan for your busiest day', 'make the first action automatic and keep it short', 'stop waiting for the ideal week to start', 'set the routine around your real calendar instead of the perfect one']
    }
  };

  const coachingSupportReplies = [
    'you can still make solid progress with free plans if youre consistent',
    'probably fix sleep and food first',
    'you might not need coaching yet',
    'free plans work fine if you actually run them long enough'
  ];

  const coachingLeanReplies = [
    'if youve been stuck for months you probably need something more tailored',
    'free plans are fine to start but custom usually helps once you plateau',
    'sounds like you need better progression not just random workouts',
    'a trainer helps if you keep second guessing everything'
  ];

  const coachingDisagreeReplies = [
    'nah dont pay for coaching yet',
    'honestly most people just dont train hard enough',
    'trainer wont fix bad consistency',
    'i wouldnt spend money until the basics are actually locked in'
  ];

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatCompactNumber(value) {
    const number = Number(value || 0);
    if (number >= 1000) {
      const compact = Math.round(number / 100) / 10;
      return `${compact % 1 === 0 ? compact.toFixed(0) : compact}K`;
    }
    return String(number);
  }

  function getAgeMinutes(item, index) {
    if (Number.isFinite(Number(item.ageMinutes))) return Number(item.ageMinutes);
    if (Number.isFinite(Number(item.ageHours))) return Math.round(Number(item.ageHours) * 60);
    return Math.max(1, (index + 1) * 45);
  }

  function formatAge(minutes) {
    const value = Math.max(0, Number(minutes || 0));
    if (value < 3) return 'just now';
    if (value < 60) return `${Math.max(1, Math.round(value))}m ago`;
    if (value < 1440) {
      const hours = Math.round(value / 60);
      return `${hours}h ago`;
    }
    if (value < 2880) return 'yesterday';
    const days = Math.round(value / 1440);
    return `${days} days ago`;
  }

  function readStoredCustomPosts() {
    try {
      const raw = window.localStorage.getItem(CUSTOM_POST_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeStoredCustomPosts(items) {
    try {
      window.localStorage.setItem(CUSTOM_POST_STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      // Ignore storage failures and keep the live feed working.
    }
  }

  function setComposePreview(src) {
    if (!composePreview) return;
    if (!src) {
      composePreview.removeAttribute('src');
      composePreview.classList.remove('is-visible');
      return;
    }
    composePreview.src = src;
    composePreview.classList.add('is-visible');
  }

  function closeComposeModal() {
    if (!composeModal) return;
    composeModal.classList.remove('is-open');
    composeModal.setAttribute('aria-hidden', 'true');
  }

  function resetComposeForm() {
    if (!composeForm) return;
    if (pendingComposeFileUrl) {
      URL.revokeObjectURL(pendingComposeFileUrl);
    }
    composeForm.reset();
    pendingComposeFileUrl = '';
    setComposePreview('');
  }

  function openComposeModal() {
    if (!composeModal) return;
    composeModal.classList.add('is-open');
    composeModal.setAttribute('aria-hidden', 'false');
    composeTitleInput?.focus();
  }

  async function refreshCurrentUser() {
    try {
      const response = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store'
      });
      if (!response.ok) {
        currentUser = null;
        return null;
      }
      const payload = await response.json();
      currentUser = payload && payload.user ? payload.user : null;
      return currentUser;
    } catch (error) {
      currentUser = null;
      return null;
    }
  }

  function ensureSignedInForCompose() {
    if (currentUser) return true;
    window.alert('Create an account to make a forum post.');
    if (typeof window.odeOpenAuthModal === 'function') {
      window.odeOpenAuthModal('signup');
    }
    return false;
  }

  function bestScore(item) {
    return Number(item.score || 0) + Number(item.comments || 0) * 2;
  }

  function closeMenus() {
    filterControls.forEach((control) => {
      control.classList.remove('is-open');
      const trigger = control.querySelector('.forum-filter-pill');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function postMatches(item) {
    const scopeMatch = state.scope === 'all'
      || (state.scope === 'pictures' && item.format === 'image' && item.imageUrl)
      || item.scope === state.scope;
    const minutes = Number(item.ageMinutes || 0);
    const timeMatch = state.time === 'all'
      || (state.time === 'today' && minutes <= 1440)
      || (state.time === 'week' && minutes <= 10080);

    return scopeMatch && timeMatch;
  }

  function sortedPosts(items) {
    const list = items.slice();
    if (state.sort === 'new') {
      return list.sort((a, b) => Number(a.ageMinutes || 0) - Number(b.ageMinutes || 0));
    }
    if (state.sort === 'discussed') {
      return list.sort((a, b) => Number(b.comments || 0) - Number(a.comments || 0));
    }
    return list.sort((a, b) => bestScore(b) - bestScore(a));
  }

  function seededValue(seed) {
    let hash = 2166136261;
    const source = String(seed || 'forum');
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

  function pickFrom(list, random) {
    return list[Math.floor(random() * list.length)];
  }

  function buildUsername(random) {
    const roll = random();
    if (roll < 0.3) return pickFrom(commentNamePool, random);
    if (roll < 0.6) return `${pickFrom(commentNamePool, random)}${pickFrom(['21', '24', '27', '31', '88', '92'], random)}`;
    if (roll < 0.8) return pickFrom(commentFitnessHandles, random);
    if (roll < 0.9) return pickFrom(commentUnderscoreHandles, random);
    return pickFrom(commentCasualHandles, random);
  }

  function addImperfection(text, random) {
    let value = String(text || '');
    if (random() < 0.08) value = value.toLowerCase();
    if (random() < 0.06) value += ` ${pickFrom(['lol', '😭', 'tbh', 'ngl'], random)}`;
    if (random() < 0.05) value = value.replace(/bench/i, 'benhc').replace(/about/i, 'abt');
    if (random() < 0.1) value = value.replace(/\byou are\b/i, 'youre').replace(/\bgoing to\b/i, 'gonna');
    return value;
  }

  function getCategoryPool(item) {
    return categoryCommentPools[item.category] || categoryCommentPools.training;
  }

  function getImageRecord(item) {
    if (!item || !item.id) return null;
    return imagePostIndex.get(item.id) || null;
  }

  function getImageAwareCommentSet(item) {
    const record = getImageRecord(item) || item;
    const imageType = record.imageType || item.imageType;
    const subject = String(record.imageSubject || record.imageMainObject || item.imageSubject || '').toLowerCase();
    const muscle = String(record.imageMuscleGroup || item.imageMuscleGroup || '').toLowerCase();
    const detail = String(record.visionAnalysis && record.visionAnalysis.detailLabel || '').toLowerCase();
    const caption = String(record.imageCaption || item.imageCaption || '').toLowerCase();
    const subjectLabel = String(record.imageSubject || record.imageMainObject || item.imageSubject || 'this').toLowerCase();
    const imageText = `${subject} ${muscle} ${detail} ${caption}`.trim();

    if (!imageType) return null;

    if (imageType === 'physique' && /glute|butt|booty/.test(imageText)) {
      return {
        advice: ['glutes finally started moving for me when i added more direct work and actually progressed it', 'hip thrusts and controlled glute work helped mine way more than i expected', 'if glutes are lagging i would look at exercise order and direct volume first'],
        experience: ['glutes took forever for me until i trained them on purpose instead of hoping compounds covered it', 'mine finally looked different once i treated glute work like a real priority'],
        question: ['what finally got your glutes growing', 'are you doing any direct glute work right now'],
        blunt: ['glutes usually need more direct work than people admit tbh', 'if theyre not growing id stop hoping random leg work fixes it'],
        support: ['glute progress is easy to miss until it suddenly isnt', 'thats real progress honestly'],
        disagree: ['nah i would not change direction too fast if progress is finally showing', 'i wouldnt rush to overhaul things if glutes are finally moving'],
        joke: ['glutes take their sweet time and then randomly show up']
      };
    }

    if ((imageType === 'exercise' || imageType === 'physique') && /back pulling|back|lat|row|pulldown|pull up|cable row/.test(imageText)) {
      return {
        advice: ['back started making more sense for me once i cleaned up elbow path and setup', 'if a pull finally feels more direct i would keep that variation in for a while', 'better back setup usually matters more than adding random extra pulling'],
        experience: ['my back only started showing more once i could actually feel rows and pulldowns where they were supposed to', 'back progress was way easier to notice once pull work finally clicked'],
        question: ['was this the kind of pull variation that finally made back work click for you', 'do you feel back more here or mostly arms'],
        blunt: ['if pull work still turns into arm work nothing changes tbh', 'back progress usually starts once execution stops being sloppy'],
        support: ['back changes are easy to miss for a while', 'that kind of pull work can finally make things click'],
        disagree: ['nah i wouldnt change too much if back work is finally feeling better', 'i think you keep the variation before rewriting the whole day'],
        joke: ['back day loves pretending it is arm day']
      };
    }

    if (imageType === 'supplement' && /creatine/.test(imageText)) {
      return {
        advice: ['creatine is still one of the only boring supplements i trust', 'if youre already handling food and training then creatine is at least a reasonable basic', 'i would keep creatine simple and ignore most of the hype around everything else'],
        experience: ['creatine is one of the few things i never really overthought once i started taking it daily', 'most supplements felt optional to me but creatine always felt like the easiest basic'],
        question: ['are you taking it consistently or just on training days', 'do you actually notice anything from it or do you just keep it in because its a basic'],
        blunt: ['creatine still isnt fixing a messy routine tbh', 'if food and training are off this is not the main issue'],
        support: ['fair thing to keep in the stack honestly', 'at least creatine has a better case than most supplements'],
        disagree: ['nah i still wouldnt expect miracles from it', 'i would not act like creatine matters more than the boring basics'],
        joke: ['creatine might be the only tub with less drama than the people taking it']
      };
    }

    if (imageType === 'food' && /salmon|fish/.test(imageText)) {
      return {
        advice: ['salmon like that is solid if it actually fits the week and you will repeat it', 'if a meal like this keeps protein easy i would keep it around', 'for something that looks this simple the main question is whether you will actually keep making it'],
        experience: ['meals like this are exactly what save my week when i stop wanting to think about food', 'simple salmon meals always worked better for me than trying to make every meal interesting'],
        question: ['would you actually keep salmon like that in rotation', 'how easy is that to prep ahead'],
        blunt: ['boring repeatable meals usually win tbh', 'if it keeps protein easy i wouldnt overcomplicate it'],
        support: ['that looks like the kind of meal that actually works in real life', 'simple food setups like that are underrated'],
        disagree: ['nah i would not ditch that just because it looks basic', 'meals do not need to be fancy to be useful'],
        joke: ['meal prep always looks the same once it starts working']
      };
    }

    if (imageType === 'food' && /wrap|sandwich|tortilla/.test(imageText)) {
      return {
        advice: ['wraps like that are hard to beat when you need portable protein', 'if the goal is consistency a meal like that makes a lot of sense', 'easy food you can actually repeat usually matters more than perfect macros'],
        experience: ['wrap type meals saved me on workdays more than anything else', 'stuff like that is what kept my protein from falling apart on busy weeks'],
        question: ['would you actually keep a meal like that in rotation all week', 'how often do you use wraps like that when life gets busy'],
        blunt: ['practical food usually beats impressive food tbh', 'if its easy to repeat that already matters a lot'],
        support: ['that kind of meal is way more useful than people give it credit for', 'looks simple in a good way'],
        disagree: ['nah i would not overthink a meal like that', 'if it works i would keep it boring and repeatable'],
        joke: ['the best meal prep always looks the least exciting']
      };
    }

    if (imageType === 'food' && /yogurt|parfait|berries|granola|bowl/.test(imageText)) {
      return {
        advice: ['protein bowls like that are great when a full meal sounds like too much work', 'stuff like this is useful because it is quick and still gets protein in', 'if you can keep a bowl like that easy to repeat it earns its spot'],
        experience: ['i use food like that when appetite is weird but i still need something with protein', 'yogurt bowls end up doing more work for me than a lot of bigger meals'],
        question: ['do you count that as a snack or a real meal', 'what do you usually add to a bowl like that for more staying power'],
        blunt: ['easy protein wins more often than perfect protein tbh', 'if it is simple enough to repeat thats already a plus'],
        support: ['that actually looks like something you would keep making', 'simple food like that is underrated'],
        disagree: ['nah i would not overthink a bowl like that', 'if it helps you hit protein it is doing its job'],
        joke: ['the least exciting meals are always the most useful']
      };
    }

    if (imageType === 'exercise' && /hip thrust|glute bridge|glute focused/.test(imageText)) {
      return {
        advice: ['hip thrusts helped my glutes once i stopped rushing them', 'if glutes are lagging this kind of direct work usually matters', 'i would keep that glute work in and actually progress it before changing anything else'],
        experience: ['glutes finally moved for me once i started taking direct work like that seriously', 'that kind of setup was a lot more useful for my glutes than hoping compounds covered it'],
        question: ['are you doing glute work like that once or twice a week', 'did you put that earlier in the session'],
        blunt: ['glutes usually need more direct work than people want to hear', 'if theyre not growing id stop hoping random leg days fix it'],
        support: ['that kind of glute work can definitely move things', 'makes sense if glutes finally started responding'],
        disagree: ['nah i wouldnt cut that out if it is finally working', 'i think you stick with direct glute work before changing course'],
        joke: ['glutes really do make you earn it']
      };
    }

    if (imageType === 'exercise' && /bench|incline|press|cable fly/.test(imageText)) {
      return {
        advice: ['pressing like that usually works better once setup is locked in', 'if chest is finally feeling involved i would not change much yet', 'a movement like that probably belongs earlier if chest is the goal'],
        experience: ['incline work finally made upper chest make sense for me', 'my chest only started growing once pressing felt more like this and less shoulder dominant'],
        question: ['does that hit chest or mostly shoulders for you', 'would you keep that where it is or move it earlier'],
        blunt: ['if shoulders still take over then the setup is still off tbh', 'pressing volume is useless if chest never actually gets the work'],
        support: ['that looks like a much better chest setup', 'makes sense if this finally clicked'],
        disagree: ['nah i wouldnt swap it out if it is finally feeling right', 'i think you keep running that before overthinking it'],
        joke: ['every chest setup is one inch away from turning into shoulders']
      };
    }

    if (imageType === 'exercise' && /lateral|rear delt|shoulder isolation|pec deck/.test(imageText)) {
      return {
        advice: ['delt work like that usually responds to cleaner reps more than extra ego', 'i would keep shoulder work controlled and actually count the hard reps', 'movements like that tend to work better once you stop turning them into traps'],
        experience: ['side delts only started moving once i slowed everything down', 'rear delt work clicked for me after i stopped loading it like a row'],
        question: ['do you feel that in delts or does traps still take over', 'how often are you hitting shoulder work right now'],
        blunt: ['most people let traps steal these reps tbh', 'if delt work never feels direct the setup is probably still off'],
        support: ['that kind of shoulder work can definitely finally make things click', 'makes sense if delts started responding once the setup got cleaner'],
        disagree: ['nah i wouldnt scrap that if it is finally hitting', 'i think you keep the movement and clean up execution first'],
        joke: ['side delts stay humble until they randomly show up']
      };
    }

    if (imageType === 'general_gym' && /car|steering wheel|vehicle|beat up after leg day/.test(imageText)) {
      return {
        advice: ['nothing to fix here this is just the cost of a real leg day', 'if the drive home looks like that the session probably counted', 'hydrate and walk a bit before you lock up completely'],
        experience: ['i have definitely sat in the car like that after a hard lower day', 'the post leg day drive home is always its own event'],
        question: ['was this after squats or split squats', 'what did you hit that session'],
        blunt: ['yeah thats just leg day collecting its payment', 'no notes thats normal'],
        support: ['everybody who trains legs knows that feeling', 'realest post in the feed honestly'],
        disagree: ['nah this is not a sign you need more volume lol', 'i would not take that as a reason to go lighter'],
        joke: ['manual transmission after leg day should be illegal']
      };
    }

    if (imageType === 'general_gym' && /baseball|bat|track|runner|sports training/.test(imageText)) {
      return {
        advice: ['sports work like that still counts if it keeps you athletic and consistent', 'conditioning from field work is still useful even if it is not a normal gym session', 'i like keeping some sports movement in instead of only chasing gym numbers'],
        experience: ['stuff like that always reminds me i feel better when training is not only lifting', 'i grew up doing sports so sessions like that still scratch a different itch'],
        question: ['do you still mix sports work in during the week', 'does that kind of session replace cardio for you'],
        blunt: ['people act like only barbell work counts and that is dumb tbh', 'athletic work is still training even if it is not a lift'],
        support: ['this kind of training is underrated', 'looks like a good break from the usual gym routine'],
        disagree: ['nah i would not cut that out just because it isnt bodybuilding style', 'i think some sports work makes a lot of people feel better overall'],
        joke: ['field work has a way of humbling gym only legs']
      };
    }

    const byType = {
      food: {
        advice: [
          `i would keep ${subjectLabel} in rotation if its easy to repeat`,
          'meals like this are usually better than chasing variety every day',
          'if it helps you hit protein consistently i would not overcomplicate it'
        ],
        experience: [
          'food like this saved me on busy weeks',
          `i always come back to stuff like ${subjectLabel} when life gets chaotic`
        ],
        question: [
          'would you actually eat that three days in a row',
          'how easy is that to prep ahead'
        ],
        blunt: [
          'boring meals usually work better tbh',
          'if it fits protein and calories i wouldnt overthink it'
        ],
        support: [
          'that kind of meal is practical honestly',
          'simple food setups are underrated'
        ],
        disagree: [
          'nah i would not swap this out just because it looks boring',
          'i dont think meals need to be exciting to be useful'
        ],
        joke: [
          'meal prep really is just dishes and protein'
        ]
      },
      planning: {
        advice: [
          'i would run that exact setup for two weeks before changing anything',
          'cleaner structure usually helps more than adding more detail',
          'simple plans survive bad weeks a lot better'
        ],
        experience: [
          'my progress got better once i stopped rewriting the split every few days',
          'leaving the plan alone helped me more than tweaking it'
        ],
        question: [
          'how often are you changing the plan right now',
          'have you actually run that setup long enough to judge it'
        ],
        blunt: [
          'this mostly sounds like overthinking it tbh',
          'you probably need less tweaking not more'
        ],
        support: [
          'simple usually wins here',
          'that looks easier to stick to than most plans people make'
        ],
        disagree: [
          'nah i still would not pay for help yet',
          'i think that is fixable without making it more custom'
        ],
        joke: [
          'notes apps have ended a lot of gains'
        ]
      },
      exercise: {
        advice: [
          `if ${subjectLabel} finally feels right i would keep it there for a few weeks`,
          'i usually check setup and order before blaming the exercise itself',
          'one small execution fix can matter more than extra sets'
        ],
        experience: [
          `i had the same thing happen when ${subjectLabel} finally clicked`,
          'most exercise problems get easier once the setup feels repeatable'
        ],
        question: [
          'would you move it earlier in the workout or leave it there',
          'does it actually feel better or just look better'
        ],
        blunt: [
          'this still looks like setup more than programming tbh',
          'if the movement finally clicks i would not mess with it too fast'
        ],
        support: [
          'thats the kind of fix that actually matters',
          'good sign if it finally feels repeatable'
        ],
        disagree: [
          'nah i would not rewrite the whole day over that',
          'i think you stay with the variation before changing more stuff'
        ],
        joke: [
          'some exercises really make you earn the right to keep them'
        ]
      },
      physique: {
        advice: [
          'if progress is finally showing i would stay patient a little longer',
          'small visual changes usually mean the boring stuff is working',
          'i would not panic change things if the trend is finally moving'
        ],
        experience: [
          'that is exactly how my progress looked before it became more obvious',
          'i almost missed the early changes too because they were subtle'
        ],
        question: [
          'would you keep pushing the same direction from there',
          'are you trying to lean out more or just hold the pace'
        ],
        blunt: [
          'looks like progress to me tbh',
          'i think youre being harder on it than you need to be'
        ],
        support: [
          'thats real progress even if its not dramatic',
          'progress is progress honestly'
        ],
        disagree: [
          'nah i would not rush a change yet',
          'i dont think that means you need to switch direction right now'
        ],
        joke: [
          'the mirror loves hiding progress until it randomly doesnt'
        ]
      },
      supplement: {
        advice: [
          `i would only keep ${subjectLabel} if the basics are already handled`,
          'food and training still matter more than another supplement',
          'keeping supplements boring is usually the move'
        ],
        experience: [
          `i bought way more stuff than ${subjectLabel} ever ended up replacing`,
          'most supplements felt optional once i cleaned up everything else'
        ],
        question: [
          'have you already handled food and sleep first',
          'do you actually notice a difference from it'
        ],
        blunt: [
          'powder is not fixing a messy routine tbh',
          'this could still be expensive coping'
        ],
        support: [
          'fair question because most of this stuff is overhyped',
          'everybody goes through the supplement rabbit hole'
        ],
        disagree: [
          'nah i wouldnt buy it yet',
          'i still think food comes first here'
        ],
        joke: [
          'supplement labels always promise a new life'
        ]
      },
      article: {
        advice: [
          'i would take one useful point from that and ignore the rest',
          'stuff like that is only helpful if it changes one real decision',
          'the takeaway matters more than the screenshot itself'
        ],
        experience: [
          'sometimes one article just gives better words to what you already noticed',
          'i usually save those and keep maybe one useful point'
        ],
        question: [
          'did anything in it actually change what youre doing',
          'what part of it stood out most to you'
        ],
        blunt: [
          'most article screenshots are noise tbh',
          'i wouldnt rewrite training over one post'
        ],
        support: [
          'still worth discussing if it made you rethink something',
          'i get why you saved that'
        ],
        disagree: [
          'nah i would not let one screenshot change the whole week',
          'id keep what works before overreacting to content'
        ],
        joke: [
          'one screenshot and everybody becomes a coach'
        ]
      },
      general_gym: {
        advice: [
          'lower friction routines usually beat higher motivation routines',
          'if the week still happened that counts more than people think',
          'simple sessions survive real life better'
        ],
        experience: [
          'a lot of my better weeks start with keeping things basic',
          'showing up on messy weeks helped me more than perfect sessions did'
        ],
        question: [
          'what part of the week usually throws you off most',
          'does keeping it simple help you stay on track'
        ],
        blunt: [
          'this is mostly a routine problem tbh',
          'real life is usually the part people forget to program for'
        ],
        support: [
          'that is a normal kind of week honestly',
          'basic sessions are underrated'
        ],
        disagree: [
          'nah i dont think you need to complicate it more',
          'i would keep the setup simple before changing much else'
        ],
        joke: [
          'real life stays undefeated'
        ]
      }
    };

    if (imageType === 'physique' && /\b(chest|pecs|upper chest)\b/.test(subject)) return null;
    return byType[imageType] || null;
  }

  function detectPostFocus(item) {
    if (item.imageType === 'food') return 'nutrition';
    if (item.imageType === 'planning') return 'planning';
    if (item.imageType === 'supplement') return 'supplement';
    if (item.imageType === 'article') return 'article';
    if (item.imageType === 'physique' && /\b(chest|pecs|upper chest)\b/.test(String(item.imageMuscleGroup || '').toLowerCase())) return 'chest';
    if (item.imageType === 'physique' && /\b(back|lats|upper back|traps)\b/.test(String(item.imageMuscleGroup || '').toLowerCase())) return 'back';
    if (item.imageType === 'physique' && /\b(side delts|rear delts|shoulders)\b/.test(String(item.imageMuscleGroup || '').toLowerCase())) return 'delts';
    if (item.imageType === 'physique' && /\b(biceps|triceps|forearms)\b/.test(String(item.imageMuscleGroup || '').toLowerCase())) return 'biceps';
    if (item.imageType === 'physique' && /\b(quads|hamstrings|glutes|calves)\b/.test(String(item.imageMuscleGroup || '').toLowerCase())) return 'squat';
    const text = `${item.title || ''} ${item.body || ''}`.toLowerCase();
    if (/\b(pecs?|chest|bench|incline)\b/.test(text)) return 'chest';
    if (/\b(calves|calf)\b/.test(text)) return 'calves';
    if (/\b(hamstrings?|rdl|leg curl)\b/.test(text)) return 'hamstrings';
    if (/\b(biceps|curl|preacher curl|dumbbell curl)\b/.test(text)) return 'biceps';
    if (/\b(triceps)\b/.test(text)) return 'triceps';
    if (/\b(traps|shrug|carry|carries)\b/.test(text)) return 'traps';
    if (/\b(side delts?|rear delts?|delts?|shoulders?|lateral raise)\b/.test(text)) return 'delts';
    if (/\b(back|lats?|wider|pull up|pullups|rows?|upper back|mid back)\b/.test(text)) return 'back';
    if (/\b(squat|quads?|leg press|hip thrust|split squat)\b/.test(text)) return 'squat';
    if (/\b(deadlift|knees|plates|chalk)\b/.test(text)) return 'deadlift';
    if (/\b(trainer|coaching|custom|basic program|accountability)\b|free plan|free training|free workouts/.test(text)) return 'coaching';
    if (/\b(consistent|consistency|skipping)\b|falling off/.test(text)) return 'consistency';
    if (/\b(gain weight|bulk|eating|protein|meal|food|diet)\b/.test(text)) return 'nutrition';
    return 'generic';
  }

  function topicCommentPools(focus) {
    const pools = {
      chest: {
        advice: ['upper chest responded better for me when i put incline smith first', 'if shoulders take over every press your chest stimulus probably sucks', 'i had to add more pressing volume before chest started moving'],
        experience: ['chest didnt grow for me until i stopped making flat bench the only thing i cared about', 'mine changed once i added incline work and slowed the reps down'],
        question: ['how much pressing are you doing compared to fly work', 'are your shoulders taking over on most presses'],
        blunt: ['could just be bad chest stimulus tbh', 'if all you do is flat bench im not surprised'],
        support: ['chest can be stubborn for a while', 'youre probably closer than you think'],
        disagree: ['idk i wouldnt jump to coaching over chest lagging', 'nah this still sounds like execution more than needing a trainer'],
        joke: ['chest days always turn into shoulder days somehow']
      },
      calves: {
        advice: ['i had to train calves 3x a week before they moved at all', 'pause reps at the bottom helped mine way more than extra weight', 'full stretch and more frequency did more than anything else'],
        experience: ['calves barely moved for me until i hit them almost every session', 'mine were a joke until i started taking them seriously'],
        question: ['how often are you training them right now', 'are you actually pausing the reps'],
        blunt: ['calves are genetics and frequency tbh', 'most people barely train them hard enough'],
        support: ['calves are evil lol', 'same issue here'],
        disagree: ['i dont think a trainer fixes calves by itself', 'nah i wouldnt pay for help just because calves are lagging'],
        joke: ['calves got their own attitude problem']
      },
      hamstrings: {
        advice: ['mine didnt move until i added rdls and stopped rushing reps', 'if glutes take over every hinge your hamstrings might not be getting enough work', 'leg curls plus slower hinges finally got mine moving'],
        experience: ['hamstrings changed for me once i stopped treating rdls like a lower back lift', 'i needed more hinge work than i thought'],
        question: ['how often are you training hamstrings right now', 'are you doing any real hip hinge work'],
        blunt: ['sounds like glutes are stealing all the work tbh', 'could just be weak hinge mechanics'],
        support: ['hamstrings can take forever to notice', 'that body part is annoying for a lot of people'],
        disagree: ['i still think this is execution not coaching', 'nah you probably need better exercise choice first'],
        joke: ['hamstrings only show up when they feel like it']
      },
      biceps: {
        advice: ['biceps started growing faster when i put curls earlier in the workout', 'one curl you progress hard usually beats five random ones', 'i had better luck once i stopped rushing the lowering phase'],
        experience: ['my arms finally moved once i kept the same curl pattern for a month', 'biceps changed fast once i treated them like a priority'],
        question: ['how many hard arm sets are you doing', 'are your back exercises wiping you out before curls'],
        blunt: ['could just be too much junk volume tbh', 'if you change exercises every week that probably isnt helping'],
        support: ['arms can take a while', 'youre probably not far off'],
        disagree: ['i wouldnt pay for coaching over biceps yet', 'nah this still sounds fixable without a custom plan'],
        joke: ['arm day math never works the way we think']
      },
      triceps: {
        advice: ['my triceps moved more once i got stronger on close grip pressing', 'if elbows hate all your extensions you might need a different angle', 'triceps finally grew when i trained them twice a week'],
        experience: ['mine were stuck until i stopped relying on one pushdown variation', 'close grip stuff helped me more than endless extensions'],
        question: ['what pressing are you doing besides isolation work', 'are your elbows getting beat up right now'],
        blunt: ['might just be not enough hard pressing tbh', 'pushdowns alone probably wont do it'],
        support: ['triceps can be weird to judge', 'same thing happened to me'],
        disagree: ['i wouldnt call this a coaching problem yet', 'nah this still sounds like exercise selection'],
        joke: ['triceps always hide until the lighting is perfect']
      },
      traps: {
        advice: ['traps responded better for me when i added shrugs and heavy carries', 'mine grew once i stopped assuming rows alone were enough', 'upper back work plus direct shrugging helped a lot'],
        experience: ['traps didnt really move for me until i trained them on purpose', 'mine looked better once i took carries seriously'],
        question: ['are you doing any direct shrug work', 'do rows and carries already feel trap heavy for you'],
        blunt: ['rows alone might not be enough tbh', 'could just be that traps need more direct work'],
        support: ['traps can be weird to notice', 'same problem here'],
        disagree: ['i wouldnt jump to coaching over traps lagging', 'nah this still sounds like exercise choice first'],
        joke: ['traps only show up when you stop caring']
      },
      delts: {
        advice: ['side delts moved once i added more frequency and cleaner lateral raises', 'rear delts finally showed up when i stopped turning every rep into traps', 'lighter laterals with better control helped a ton'],
        experience: ['delts took forever until i stopped swinging everything', 'mine only changed when i trained them more than once a week'],
        question: ['how much lateral raise work are you doing', 'are traps taking over your raises'],
        blunt: ['this sounds like execution more than programming tbh', 'if every rep is a shrug youre not hitting delts well'],
        support: ['delts are annoying for a lot of people', 'same problem here'],
        disagree: ['i dont think a trainer is step one here', 'nah id fix technique first'],
        joke: ['side delts are all ego and dumbbells']
      },
      back: {
        advice: ['back got wider for me once i took pullups and pulldowns more seriously', 'lats finally showed up when i stopped turning rows into shrugging', 'more stable row setups helped my back way more than extra sets'],
        experience: ['my back looked flat until i cleaned up elbow path', 'lats took way longer to notice than arms did for me'],
        question: ['are you doing enough vertical pulling', 'do you feel lats or mostly arms on pull days'],
        blunt: ['could just be bad back execution tbh', 'if biceps are taking over everything that explains a lot'],
        support: ['back progress is harder to notice at first', 'same issue here'],
        disagree: ['i still wouldnt jump to coaching over this', 'nah sounds more like setup than custom programming'],
        joke: ['back day always turns into arm day somehow']
      },
      squat: {
        advice: ['my squat moved once i pulled fatigue down for a week', 'squat stalls usually mean recovery or technique for me', 'leg press helped but only after i cleaned up the main squat work'],
        experience: ['mine was stuck until i stopped burying myself every session', 'squat finally moved when i ate more and recovered better'],
        question: ['how often are you squatting right now', 'are you recovering between lower days'],
        blunt: ['honestly you might just be carrying too much fatigue', 'this could be food and effort tbh'],
        support: ['squat stalls happen to everyone', 'youre probably not far off'],
        disagree: ['i wouldnt pay for help over one squat stall yet', 'nah i think you need recovery more than coaching'],
        joke: ['squat has a talent for humbling people']
      },
      deadlift: {
        advice: ['deadlift moved faster for me once i stopped maxing my effort every week', 'if it always stalls at the knees id look at position and fatigue first', 'more back strength and cleaner setup helped mine most'],
        experience: ['my deadlift stayed stuck until i fixed the start position', 'plates only started moving once i stopped grinding every rep'],
        question: ['where is it actually stalling for you', 'how beat up are you by the time you pull'],
        blunt: ['could just be too much fatigue tbh', 'if setup changes every rep thats probably part of it'],
        support: ['deadlift stalls are brutal', 'same thing happened to me'],
        disagree: ['i dont think coaching is the first fix here', 'nah id look at technique before paying anyone'],
        joke: ['deadlift always acts dramatic for no reason']
      },
      coaching: {
        advice: ['free plan is solid for getting started but once you plateau it probably needs more personalization', 'if youve been stuck for months you probably need something more tailored', 'sounds like you need better progression not just random workouts'],
        experience: ['the free stuff was actually better than random training for me, then i hit a point where i needed more structure', 'coach helped mostly because i stopped second guessing everything'],
        question: ['how long have you actually been consistent with the free plan', 'are you stuck because of the plan or because execution is inconsistent'],
        blunt: ['trainer wont fix bad consistency', 'honestly most people just dont train hard enough'],
        support: ['free stuff is fine for most beginners honestly', 'site gives a decent base, problem is most people change too much too early'],
        disagree: ['nah dont pay for coaching yet', 'i wouldnt spend money until youve really been consistent for a while'],
        joke: ['coaching wont magically make monday show up']
      },
      consistency: {
        advice: ['the biggest fix for me was making the plan easier to follow on bad weeks', 'accountability helps but lowering friction helped me more', 'i needed a smaller version of the routine for chaotic days'],
        experience: ['i used to disappear every other week too until i shortened the plan', 'consistency got better once i stopped trying to be perfect'],
        question: ['what part of the week do you usually fall off', 'is it motivation or just life getting messy'],
        blunt: ['could just be discipline tbh', 'if the setup is too annoying you wont keep doing it'],
        support: ['a lot of people deal with this', 'youre not the only one'],
        disagree: ['i dont think coaching fixes this by itself', 'nah accountability alone is not the whole answer'],
        joke: ['consistency really hates thursdays']
      },
      nutrition: {
        advice: ['if youre not gaining id audit calories before changing everything else', 'food usually matters more than people want to admit here', 'one repeatable high calorie meal can fix a lot'],
        experience: ['i thought programming was the issue and it was mostly food', 'once i cleaned up meals progress looked way different'],
        question: ['are you actually eating enough every day', 'how repeatable is your food right now'],
        blunt: ['could just be not enough food tbh', 'this might be calories before anything else'],
        support: ['food is harder than people make it sound', 'same problem here'],
        disagree: ['i wouldnt jump to coaching before fixing food', 'nah if calories are off no program will save it'],
        joke: ['eating enough is the real workout']
      },
      planning: {
        advice: ['i would run the split as written for two weeks before tweaking anything else', 'simpler structure usually beats perfect structure you never stick to', 'pick one progression target and stop rewriting the week'],
        experience: ['i made better progress once i stopped touching the plan every few days', 'cleaning up the split helped more than another fancy exercise swap'],
        question: ['how often are you changing the plan right now', 'have you actually run the setup long enough to judge it'],
        blunt: ['this sounds like overcomplicating it tbh', 'you might just need to leave the plan alone'],
        support: ['most people overbuild their split at first', 'simple usually wins here'],
        disagree: ['i still wouldnt jump to paying for help yet', 'nah this sounds fixable without coaching'],
        joke: ['the notes app has ended a lot of gains']
      },
      supplement: {
        advice: ['id keep creatine or protein and stop there for now', 'food and training quality still matter more than another tub', 'run the basics and ignore the hype for a month'],
        experience: ['i bought way more supplements than i ever actually needed', 'creatine was the only one that ever felt boring enough to trust'],
        question: ['have you already handled food and sleep', 'what are you expecting this to fix exactly'],
        blunt: ['this could still just be expensive coping tbh', 'powder is not fixing a messy routine'],
        support: ['everybody falls into the supplement rabbit hole at some point', 'fair question honestly'],
        disagree: ['nah i wouldnt spend on this yet', 'i still think food is the move first'],
        joke: ['supplement labels do way too much talking']
      },
      article: {
        advice: ['i would take one useful point from the article and ignore the rest', 'articles are only helpful if they actually change one decision in your week', 'the takeaway matters more than trying to copy every detail'],
        experience: ['sometimes an article just gives better wording to something you already felt in training', 'i usually read those and keep maybe one thing'],
        question: ['what part of the article actually stood out to you', 'did it change anything specific for you or just get you thinking'],
        blunt: ['fitness articles are noise unless you actually apply one thing', 'most of those posts just tell people what they already know'],
        support: ['still worth discussing if it made you rethink something', 'i get why that would catch your attention'],
        disagree: ['idk i wouldnt rewrite training over one article', 'nah i would not let one study screenshot change the whole plan'],
        joke: ['one article and everybody becomes a scientist for a day']
      },
      generic: {
        advice: ['id keep it simple and fix one thing first', 'usually the boring fix works better than the fancy one', 'i would clean up execution before rewriting everything'],
        experience: ['same thing happened to me and it got better once i simplified it', 'i had a similar issue and the basic fix worked'],
        question: ['what have you tried so far', 'how long has it been stuck'],
        blunt: ['could just be food and effort tbh', 'you might be overthinking it'],
        support: ['youre probably not as far off as you think', 'this is more common than people admit'],
        disagree: ['i wouldnt jump to paying for help yet', 'nah i think this is still fixable on your own'],
        joke: ['fitness has a way of making simple stuff annoying']
      }
    };
    return pools[focus] || pools.generic;
  }

  function buildCommentBody(item, random, mode, usedBodies) {
    const genericPool = getCategoryPool(item);
    const focus = detectPostFocus(item);
    const imagePool = getImageAwareCommentSet(item);
    const pool = imagePool || topicCommentPools(focus);
    const titleText = String(item.title || '').toLowerCase();
    const bodyText = String(item.body || '').toLowerCase();
    const isCoachPrompt = /trainer|coaching|custom|free plan|free training|basic program|accountability/.test(titleText);
    const advice = pool.advice || genericPool.suggestions || ['id simplify the plan and give it two weeks'];
    const experience = pool.experience || ['same issue happened to me for a while'];
    const questions = pool.question || ['what have you tried so far'];
    const blunt = pool.blunt || ['could just be food and effort tbh'];
    const support = pool.support || ['youre probably not as far off as you think'];
    const disagree = pool.disagree || ['nah i wouldnt jump to paying for help yet'];
    const jokes = pool.joke || ['fitness makes simple stuff annoying'];
    const freeSupport = [
      'free stuff is fine for most beginners honestly',
      'site gives a decent base, problem is most people change too much too early',
      'free plan can work if sleep and food are handled',
      'i wouldnt pay yet unless youve actually been consistent for a while'
    ];
    const freeLean = [
      'free plan is solid for getting started but once you plateau it probably needs more personalization',
      'if youve been stuck for months you probably need something more tailored',
      'sounds like you need better progression not just random workouts',
      'custom structure matters more once progress slows down'
    ];
    const followUp = [
      ...questions,
      'how many hard sets are you doing right now',
      'how long has this actually been stalled',
      'did anything else change when this started'
    ];
    const shortReaction = uniq([
      ...support,
      ...jokes,
      ...shortCommentReactions,
      'same issue here',
      'that tracks honestly'
    ]);
    const practical = uniq([
      ...advice,
      ...advice.map((line) => `${line} that helped me most.`),
      ...advice.map((line) => `id start with ${line.replace(/^i had to |^if |^mine |^my /i, '')}`)
    ]);
    const personal = uniq([
      ...experience,
      ...experience.map((line) => `${line}. that was the turning point for me.`),
      ...experience.map((line) => `same thing happened to me. ${line}.`)
    ]);
    const supportive = uniq([
      ...support,
      'youre probably closer than it feels right now',
      'this is more common than people admit',
      'youre not crazy for asking this'
    ]);
    const bluntList = uniq([
      ...blunt,
      'honestly this could still just be recovery and effort',
      'if food and sleep are off no plan is saving this'
    ]);
    const disagreeList = uniq([
      ...disagree,
      ...(isCoachPrompt ? coachingDisagreeReplies : []),
      'nah i still wouldnt pay for help yet'
    ]);
    const freeMix = uniq([
      ...freeSupport,
      ...freeLean,
      'the free workouts are better than random training for most people',
      'the free plan cleaned up a lot of dumb stuff for me before i changed anything else'
    ]);
    const paragraph = uniq([
      `${pickFrom(experience, random)}. ${pickFrom(advice, random)}. id leave that alone for two weeks before rewriting the whole thing.`,
      `${pickFrom(blunt, random)}. if it were me i would ${pickFrom(advice, random).replace(/\.$/, '')} and see if the trend changes.`,
      `${pickFrom(support, random)}. ${pickFrom(questions, random)}. thats probably the part that tells you whether this is a programming issue or just execution.`
    ]);

    let candidates = [];
    if (mode === 'disagree') {
      candidates = isCoachPrompt ? [...disagreeList, ...freeSupport] : disagreeList;
    } else if (mode === 'reply') {
      candidates = [...followUp, ...supportive, ...(isCoachPrompt ? freeMix : [])];
    } else {
      const roll = random();
      if (roll < 0.25) candidates = practical;
      else if (roll < 0.45) candidates = personal;
      else if (roll < 0.6) candidates = followUp;
      else if (roll < 0.75) candidates = bluntList;
      else if (roll < 0.85) candidates = supportive;
      else if (roll < 0.92) candidates = isCoachPrompt || /free plan|free workouts|free training|site/.test(bodyText) ? freeMix : disagreeList;
      else candidates = paragraph;
    }

    for (let tries = 0; tries < 6; tries += 1) {
      const candidate = addImperfection(pickFrom(candidates, random), random);
      const key = candidate.toLowerCase();
      if (!usedBodies.has(key)) {
        usedBodies.add(key);
        return candidate;
      }
    }

    const fallback = addImperfection(pickFrom([...practical, ...personal, ...supportive], random), random);
    usedBodies.add(fallback.toLowerCase());
    return fallback;
  }

  function generateComments(item) {
    if (commentCache.has(item.id)) return commentCache.get(item.id);

    const total = Math.max(0, Number(item.comments || 0));
    const random = seededValue(item.id);
    const replyIndex = total >= 4 && random() < 0.72 ? Math.min(total - 1, 2 + Math.floor(random() * Math.max(1, total - 2))) : -1;
    const replyParentIndex = replyIndex > 1 ? Math.max(0, replyIndex - 1) : -1;
    const disagreeIndex = total >= 3 && random() < 0.36 ? 1 : -1;
    const usedBodies = new Set();
    const comments = Array.from({ length: total }, (_, index) => {
      const baseMinutes = Math.max(1, Number(item.ageMinutes || 120));
      const ageMinutes = Math.max(1, Math.round(baseMinutes * (0.08 + random() * 0.82)));
      let score = 0;
      if (index === 0) score = Math.round(5 + random() * 20);
      else {
        const tierRoll = random();
        if (tierRoll < 0.3) score = Math.round(random() * 3);
        else if (tierRoll < 0.82) score = Math.round(1 + random() * 11);
        else score = Math.round(5 + random() * 20);
      }

      const mode = index === disagreeIndex ? 'disagree' : index === replyIndex ? 'reply' : 'base';
      const lengthRoll = random();
      let body = buildCommentBody(item, random, mode, usedBodies);
      if (lengthRoll < 0.4) {
        body = buildCommentBody(item, random, mode, usedBodies);
      } else if (lengthRoll > 0.95) {
        body = `${buildCommentBody(item, random, mode, usedBodies)} ${buildCommentBody(item, random, 'reply', usedBodies)}`;
      }

      return {
        id: `${item.id}-comment-${index + 1}`,
        parentId: index === replyIndex && replyParentIndex >= 0 ? `${item.id}-comment-${replyParentIndex + 1}` : null,
        author: buildUsername(random),
        ageLabel: formatAge(ageMinutes),
        score,
        body
      };
    });

    commentCache.set(item.id, comments);
    return comments;
  }

  function buildCommentMarkup(comment) {
    return `
      <article class="forum-comment${comment.parentId ? ' is-reply' : ''}" data-comment-id="${escapeHtml(comment.id)}">
        <div class="forum-comment-meta">
          <strong class="forum-comment-author">u/${escapeHtml(comment.author)}</strong>
          <span>&bull;</span>
          <span>${escapeHtml(comment.ageLabel)}</span>
        </div>
        <p class="forum-comment-body">${escapeHtml(comment.body)}</p>
        <div class="forum-comment-footer">
          <span class="forum-comment-votes">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 13 5-5 5 5"></path></svg>
            <span>${escapeHtml(formatCompactNumber(comment.score))}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 11 5 5 5-5"></path></svg>
          </span>
        </div>
      </article>`;
  }

  function buildCommentsSection(item) {
    const isOpen = openComments.has(item.id);
    const commentsMarkup = isOpen
      ? generateComments(item).map((comment) => buildCommentMarkup(comment)).join('')
      : '';

    return `
      <section class="forum-post-comments${isOpen ? ' is-open' : ''}" id="comments-${escapeHtml(item.id)}" data-comments-for="${escapeHtml(item.id)}"${isOpen ? '' : ' hidden'}>
        <div class="forum-post-comments-header">
          <strong>${escapeHtml(formatCompactNumber(item.comments))} comments</strong>
        </div>
        <div class="forum-post-comments-list">
          ${commentsMarkup}
        </div>
      </section>`;
  }

  function assignAnchorIds() {
    const articles = Array.from(feed.querySelectorAll('.forum-post'));
    articles.forEach((article) => article.removeAttribute('id'));

    const featured = articles[0];
    if (featured) featured.id = 'featured-post';

    const recovery = articles.find((article) => article.dataset.scope === 'recovery' && article !== featured);
    if (recovery) recovery.id = 'recovery-post';

    const cutting = articles.find((article) => article.dataset.category === 'cutting' && article !== featured && article !== recovery);
    if (cutting) cutting.id = 'cutting-post';

    const meal = articles.find((article) => article.dataset.category === 'nutrition' && article !== featured && article !== recovery && article !== cutting);
    if (meal) meal.id = 'meal-post';
  }

  function buildPostMarkup(item, index) {
    const titleTag = index === 0 ? 'h1' : 'h2';
    const avatarUrl = avatarByCategory[item.category] || avatarByCategory.training;
    const title = escapeHtml(item.title);
    const body = escapeHtml(item.body);
    const community = escapeHtml(item.community);
    const author = escapeHtml(item.author || 'communitystarter');
    const ageLabel = escapeHtml(formatAge(item.ageMinutes));
    const mediaMarkup = item.imageUrl
      ? `
        <a class="forum-post-media" href="forum-search.html">
          <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.imageAlt || item.title)}" loading="lazy">
        </a>`
      : '';
    const signalsMarkup = `
      <div class="forum-post-signals">
        <span>${escapeHtml(formatCompactNumber(item.viewCount || 0))} views</span>
        <span>&bull;</span>
        <span>${escapeHtml(formatCompactNumber(item.comments))} comments</span>
        <span>&bull;</span>
        <span>${escapeHtml(formatCompactNumber(item.saveCount || 0))} saves</span>
      </div>`;

    return `
      <article class="forum-post" data-post-id="${escapeHtml(item.id)}" data-scope="${escapeHtml(item.scope)}" data-category="${escapeHtml(item.category)}" data-minutes="${escapeHtml(item.ageMinutes)}" data-score="${escapeHtml(item.score)}" data-comments="${escapeHtml(item.comments)}">
        <div class="forum-post-head">
          <div class="forum-post-meta">
            <span class="forum-post-avatar"><img src="${escapeHtml(avatarUrl)}" alt="${community} avatar" loading="lazy"></span>
            <span class="forum-post-meta-main">
              <strong>u/${author}</strong>
              <span>&bull;</span>
              <span>${community}</span>
              <span>&bull;</span>
              <span>${ageLabel}</span>
            </span>
          </div>
          <div class="forum-post-actions">
            <span class="forum-menu-dot">...</span>
          </div>
        </div>

        <${titleTag} class="forum-post-title">${title}</${titleTag}>
        <p class="forum-post-copy">${body}</p>
        ${mediaMarkup}
        ${buildCommentsSection(item)}
        <div class="forum-post-stats">
          <span class="forum-post-stat-pill is-vote">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 13 5-5 5 5"></path></svg>
            <span>${escapeHtml(formatCompactNumber(item.score))}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 11 5 5 5-5"></path></svg>
          </span>
          <button class="forum-post-stat-pill is-comments" type="button" data-comment-toggle="${escapeHtml(item.id)}" aria-expanded="${openComments.has(item.id) ? 'true' : 'false'}" aria-controls="comments-${escapeHtml(item.id)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 11.5c0 4.1-3.8 7.5-8.5 7.5H8l-4 3v-7c0-4.7 3.8-8.5 8.5-8.5h.5c4.4 0 8 3.1 8 7Z"></path></svg>
            <span>${escapeHtml(formatCompactNumber(item.comments))}</span>
          </button>
          <span class="forum-post-stat-pill">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 3H7a2 2 0 0 0-2 2v16l7-4 7 4V5a2 2 0 0 0-2-2Z"></path></svg>
            <span>${escapeHtml(formatCompactNumber(item.saveCount || 0))}</span>
          </span>
        </div>
        ${signalsMarkup}
      </article>`;
  }

  function renderPosts() {
    const visible = sortedPosts(posts.filter(postMatches));

    if (!visible.length) {
      feed.innerHTML = '<div class="forum-empty-state">No posts match that filter yet.</div>';
      return;
    }

    feed.innerHTML = visible.map((item, index) => buildPostMarkup(item, index)).join('');
    assignAnchorIds();
  }

  function wireCommentToggles() {
    feed.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-comment-toggle]');
      if (!trigger) return;

      const postId = trigger.getAttribute('data-comment-toggle');
      if (!postId) return;

      if (openComments.has(postId)) {
        openComments.delete(postId);
      } else {
        openComments.add(postId);
      }

      renderPosts();

      const refreshedPost = feed.querySelector(`[data-post-id="${CSS.escape(postId)}"]`);
      if (!refreshedPost) return;

      refreshedPost.scrollIntoView({
        block: 'nearest',
        behavior: 'auto'
      });
    });
  }

  function wireFilters() {
    filterControls.forEach((control) => {
      const filterName = control.dataset.filter;
      const trigger = control.querySelector('.forum-filter-pill');
      const label = control.querySelector('.forum-filter-label');
      const options = Array.from(control.querySelectorAll('.forum-filter-option'));

      trigger.addEventListener('click', (event) => {
        event.stopPropagation();
        const willOpen = !control.classList.contains('is-open');
        closeMenus();
        if (willOpen) {
          control.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
        }
      });

      options.forEach((option) => {
        option.addEventListener('click', () => {
          state[filterName] = option.dataset.value;
          label.textContent = option.textContent.trim();
          options.forEach((item) => item.classList.remove('is-active'));
          option.classList.add('is-active');
          closeMenus();
          renderPosts();
        });
      });
    });

    document.addEventListener('click', closeMenus);
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenus();
    });
  }

  function wireCompose() {
    if (!addPostButton || !composeModal || !composeForm) return;

    addPostButton.addEventListener('click', async () => {
      if (currentUser === null) {
        await refreshCurrentUser();
      }
      if (!ensureSignedInForCompose()) return;
      openComposeModal();
    });

    composeModal.querySelectorAll('[data-compose-close]').forEach((element) => {
      element.addEventListener('click', () => {
        closeComposeModal();
        resetComposeForm();
      });
    });

    composeImageUrlInput?.addEventListener('input', () => {
      if (composeImageUrlInput.value.trim()) {
        pendingComposeFileUrl = '';
        if (composeImageFileInput) composeImageFileInput.value = '';
        setComposePreview(composeImageUrlInput.value.trim());
        return;
      }
      setComposePreview(pendingComposeFileUrl);
    });

    composeImageFileInput?.addEventListener('change', () => {
      const file = composeImageFileInput.files && composeImageFileInput.files[0];
      if (!file) {
        pendingComposeFileUrl = '';
        setComposePreview(composeImageUrlInput?.value.trim() || '');
        return;
      }
      if (pendingComposeFileUrl) {
        URL.revokeObjectURL(pendingComposeFileUrl);
      }
      pendingComposeFileUrl = URL.createObjectURL(file);
      if (composeImageUrlInput) composeImageUrlInput.value = '';
      setComposePreview(pendingComposeFileUrl);
    });

    composeForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (currentUser === null) {
        await refreshCurrentUser();
      }
      if (!ensureSignedInForCompose()) return;

      const title = String(composeTitleInput?.value || '').trim();
      const body = String(composeBodyInput?.value || '').trim();
      const category = String(composeCategoryInput?.value || 'training').trim();
      const imageUrl = String(composeImageUrlInput?.value || '').trim() || pendingComposeFileUrl;
      if (!title || !body) return;

      const authorBase = currentUser?.username || currentUser?.displayName || currentUser?.email || 'member';
      const author = String(authorBase).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '') || 'member';
      const now = Date.now();
      const post = {
        id: `custom-post-${now}`,
        slug: `custom-post-${now}`,
        title,
        body,
        category,
        scope: category,
        community: `r/${category}`,
        author,
        postType: 'personal',
        format: imageUrl ? 'image' : 'text',
        imageUrl: imageUrl || null,
        imageAlt: imageUrl ? title : null,
        imageType: imageUrl ? 'general_gym' : null,
        imageSubject: imageUrl ? 'member post' : null,
        imageMainObject: imageUrl ? 'member post' : null,
        imageMuscleGroup: null,
        score: 1,
        comments: 0,
        viewCount: 3,
        saveCount: 0,
        ageMinutes: 1,
        isSeeded: false
      };

      const stored = readStoredCustomPosts();
      stored.unshift(post);
      writeStoredCustomPosts(stored);
      posts.unshift(post);
      closeComposeModal();
      resetComposeForm();
      renderPosts();
      feed.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && composeModal.classList.contains('is-open')) {
        closeComposeModal();
        resetComposeForm();
      }
    });

    window.addEventListener('odeauth', (event) => {
      currentUser = event?.detail?.user || null;
    });
  }

  async function loadPosts() {
    feed.innerHTML = '<div class="forum-empty-state">Loading forum posts...</div>';

    try {
      const [forumResponse, imageDbResponse] = await Promise.all([
        fetch('/data/forum-posts.json', {
          headers: { Accept: 'application/json' }
        }),
        fetch('/data/forum-image-posts-db.json', {
          headers: { Accept: 'application/json' }
        }).catch(() => null)
      ]);

      if (!forumResponse.ok) {
        throw new Error(`Forum feed failed with ${forumResponse.status}`);
      }

      const payload = await forumResponse.json();
      imagePostIndex.clear();

      if (imageDbResponse && imageDbResponse.ok) {
        const imagePayload = await imageDbResponse.json();
        const imageItems = Array.isArray(imagePayload.items) ? imagePayload.items : [];
        imageItems.forEach((item) => {
          if (item && item.id) imagePostIndex.set(item.id, item);
        });
      }

      const basePosts = (Array.isArray(payload.items) ? payload.items : []).map((item, index) => ({
        ...item,
        ...(imagePostIndex.get(item.id) || {}),
        ageMinutes: getAgeMinutes(item, index)
      }));
      const customPosts = readStoredCustomPosts().map((item) => ({
        ...item,
        ageMinutes: getAgeMinutes(item, 0)
      }));
      posts = [...customPosts, ...basePosts];

      renderPosts();
    } catch (error) {
      feed.innerHTML = '<div class="forum-empty-state">Unable to load the forum feed right now.</div>';
    }
  }

  wireFilters();
  wireCommentToggles();
  wireCompose();
  refreshCurrentUser();
  loadPosts();
}());
