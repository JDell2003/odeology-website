const fs = require('fs');
const path = require('path');

const FORUM_PATH = path.join(process.cwd(), 'data', 'forum-posts.json');
const TARGET_TOTAL_IMAGES = 90;
const OPENVERSE_MAX = 12;
const PAGE_SIZE = 20;
const OPEN_LICENSES = new Set(['by', 'by-sa', 'cc0', 'pdm']);
const CURATED_BY_PROFILE = {
  glutes: [
    {
      url: 'https://live.staticflickr.com/4265/34459240334_2f3cb93005.jpg',
      creator: 'Fitography',
      license: 'by',
      license_url: 'https://creativecommons.org/licenses/by/2.0/',
      foreign_landing_url: 'https://www.flickr.com/photos/154523227@N06/34459240334',
      source: 'flickr',
      manualVision: true,
      imageType: 'physique',
      imageSubject: 'glute progress check',
      imageMuscleGroup: 'glutes',
      imagePostAngle: 'progress',
      imageCaption: 'a fit woman posing in a progress-style fitness photo with visible lower body development'
    },
    {
      url: 'https://live.staticflickr.com/542/31536627862_9892587b2f_b.jpg',
      creator: 'cjquines',
      license: 'pdm',
      license_url: null,
      foreign_landing_url: 'https://www.flickr.com/photos/150595761@N04/31536627862',
      source: 'flickr',
      manualVision: true,
      imageType: 'physique',
      imageSubject: 'physique progress check',
      imageMuscleGroup: 'legs',
      imagePostAngle: 'progress',
      imageCaption: 'a muscular woman posing in a bodybuilding portrait with visible lower body and glute development'
    }
  ],
  arms: [
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Female_bodybuilder_Aleesha_Young_biceps_flex.jpg',
      creator: 'Lazymonsta',
      license: 'by-sa',
      license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      foreign_landing_url: 'https://commons.wikimedia.org/wiki/File:Female_bodybuilder_Aleesha_Young_biceps_flex.jpg',
      source: 'wikimedia',
      manualVision: true,
      imageType: 'physique',
      imageSubject: 'arm progress check',
      imageMuscleGroup: 'arms',
      imagePostAngle: 'progress',
      imageCaption: 'a muscular woman flexing her arms in a bodybuilding pose'
    },
    {
      url: 'https://live.staticflickr.com/4221/35263804916_e24b036f19.jpg',
      creator: 'Fitography',
      license: 'by',
      license_url: 'https://creativecommons.org/licenses/by/2.0/',
      foreign_landing_url: 'https://www.flickr.com/photos/154523227@N06/35263804916',
      source: 'flickr',
      manualVision: true,
      imageType: 'physique',
      imageSubject: 'arm progress check',
      imageMuscleGroup: 'arms',
      imagePostAngle: 'progress',
      imageCaption: 'a fit man posing with visible arm and shoulder definition'
    }
  ],
  chest: [
    {
      url: 'https://live.staticflickr.com/4209/35302740245_32b249a1d9.jpg',
      creator: 'Fitography',
      license: 'by',
      license_url: 'https://creativecommons.org/licenses/by/2.0/',
      foreign_landing_url: 'https://www.flickr.com/photos/154523227@N06/35302740245',
      source: 'flickr',
      manualVision: true,
      imageType: 'physique',
      imageSubject: 'upper body progress check',
      imageMuscleGroup: 'chest',
      imagePostAngle: 'progress',
      imageCaption: 'a fit woman in a fitness portrait showing upper body development'
    },
    {
      url: 'https://live.staticflickr.com/7291/8901359149_005bf212ff_b.jpg',
      creator: 'Felipe Pilotto',
      license: 'by',
      license_url: 'https://creativecommons.org/licenses/by/2.0/',
      foreign_landing_url: 'https://www.flickr.com/photos/felipepilotto/8901359149',
      source: 'flickr',
      manualVision: true,
      imageType: 'exercise',
      imageSubject: 'upper body training portrait',
      imageMuscleGroup: 'chest',
      imagePostAngle: 'technique',
      imageCaption: 'a fit man in a gym portrait during upper body training'
    }
  ],
  back: [
    {
      url: 'https://live.staticflickr.com/7291/8901359149_005bf212ff_b.jpg',
      creator: 'Felipe Pilotto',
      license: 'by',
      license_url: 'https://creativecommons.org/licenses/by/2.0/',
      foreign_landing_url: 'https://www.flickr.com/photos/felipepilotto/8901359149',
      source: 'flickr',
      manualVision: true,
      imageType: 'exercise',
      imageSubject: 'back training portrait',
      imageMuscleGroup: 'back',
      imagePostAngle: 'technique',
      imageCaption: 'a fit man in a gym portrait during upper body and back training'
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Former_Pro_Wrestler_%26_Male_Fitness_Model_John_Quinlan.jpg',
      creator: 'Gage Skidmore',
      license: 'by-sa',
      license_url: 'https://creativecommons.org/licenses/by-sa/2.0/',
      foreign_landing_url: 'https://commons.wikimedia.org/wiki/File:Former_Pro_Wrestler_%26_Male_Fitness_Model_John_Quinlan.jpg',
      source: 'wikimedia',
      manualVision: true,
      imageType: 'physique',
      imageSubject: 'back progress check',
      imageMuscleGroup: 'back',
      imagePostAngle: 'progress',
      imageCaption: 'a muscular man posing in a fitness model portrait with visible upper body development'
    }
  ],
  shoulders: [
    {
      url: 'https://live.staticflickr.com/4275/35135220152_a4caac83e9.jpg',
      creator: 'Fitography',
      license: 'by',
      license_url: 'https://creativecommons.org/licenses/by/2.0/',
      foreign_landing_url: 'https://www.flickr.com/photos/154523227@N06/35135220152',
      source: 'flickr',
      manualVision: true,
      imageType: 'physique',
      imageSubject: 'shoulder progress check',
      imageMuscleGroup: 'shoulders',
      imagePostAngle: 'progress',
      imageCaption: 'a fit woman in a weight training portrait with visible shoulder and arm definition'
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/0/07/Female_bodybuilder_Aleesha_Young_flexing_on_stage.jpg',
      creator: 'Lazymonsta',
      license: 'by-sa',
      license_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
      foreign_landing_url: 'https://commons.wikimedia.org/wiki/File:Female_bodybuilder_Aleesha_Young_flexing_on_stage.jpg',
      source: 'wikimedia',
      manualVision: true,
      imageType: 'physique',
      imageSubject: 'shoulder progress check',
      imageMuscleGroup: 'shoulders',
      imagePostAngle: 'progress',
      imageCaption: 'a muscular woman flexing on stage with visible shoulder and arm definition'
    }
  ],
  legs: [
    {
      url: 'https://live.staticflickr.com/6137/5992046962_ba1e6c8de7_b.jpg',
      creator: 'Gareth1953 All Right Now',
      license: 'by',
      license_url: 'https://creativecommons.org/licenses/by/2.0/',
      foreign_landing_url: 'https://www.flickr.com/photos/gareth1953/5992046962',
      source: 'flickr',
      manualVision: true,
      imageType: 'general_gym',
      imageSubject: 'sports training session',
      imageMuscleGroup: 'legs',
      imagePostAngle: 'check_in',
      imageCaption: 'a female runner during a race in a vertical sports photo'
    },
    {
      url: 'https://live.staticflickr.com/542/31536627862_9892587b2f_b.jpg',
      creator: 'cjquines',
      license: 'pdm',
      license_url: null,
      foreign_landing_url: 'https://www.flickr.com/photos/150595761@N04/31536627862',
      source: 'flickr',
      manualVision: true,
      imageType: 'physique',
      imageSubject: 'leg progress check',
      imageMuscleGroup: 'legs',
      imagePostAngle: 'progress',
      imageCaption: 'a muscular woman posing in a bodybuilding portrait with visible leg development'
    }
  ],
  coaching: [
    {
      url: 'https://live.staticflickr.com/4263/35263265856_455f146c88.jpg',
      creator: 'Fitography',
      license: 'by',
      license_url: 'https://creativecommons.org/licenses/by/2.0/',
      foreign_landing_url: 'https://www.flickr.com/photos/154523227@N06/35263265856',
      source: 'flickr',
      manualVision: true,
      imageType: 'physique',
      imageSubject: 'physique progress check',
      imageMuscleGroup: 'upper body',
      imagePostAngle: 'progress',
      imageCaption: 'a fit woman posing in a portrait-style gym progress photo'
    }
  ],
  sports: [
    {
      url: 'https://live.staticflickr.com/6137/5992046962_ba1e6c8de7_b.jpg',
      creator: 'Gareth1953 All Right Now',
      license: 'by',
      license_url: 'https://creativecommons.org/licenses/by/2.0/',
      foreign_landing_url: 'https://www.flickr.com/photos/gareth1953/5992046962',
      source: 'flickr',
      manualVision: true,
      imageType: 'general_gym',
      imageSubject: 'sports training session',
      imageMuscleGroup: 'legs',
      imagePostAngle: 'check_in',
      imageCaption: 'a female runner during a race in a vertical sports photo'
    }
  ],
  general: [
    {
      url: 'https://live.staticflickr.com/4263/35263265856_455f146c88.jpg',
      creator: 'Fitography',
      license: 'by',
      license_url: 'https://creativecommons.org/licenses/by/2.0/',
      foreign_landing_url: 'https://www.flickr.com/photos/154523227@N06/35263265856',
      source: 'flickr',
      manualVision: true,
      imageType: 'physique',
      imageSubject: 'physique progress check',
      imageMuscleGroup: 'upper body',
      imagePostAngle: 'progress',
      imageCaption: 'a fit woman posing in a portrait-style gym progress photo'
    },
    {
      url: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Former_Pro_Wrestler_%26_Male_Fitness_Model_John_Quinlan.jpg',
      creator: 'Gage Skidmore',
      license: 'by-sa',
      license_url: 'https://creativecommons.org/licenses/by-sa/2.0/',
      foreign_landing_url: 'https://commons.wikimedia.org/wiki/File:Former_Pro_Wrestler_%26_Male_Fitness_Model_John_Quinlan.jpg',
      source: 'wikimedia',
      manualVision: true,
      imageType: 'physique',
      imageSubject: 'upper body progress check',
      imageMuscleGroup: 'upper body',
      imagePostAngle: 'progress',
      imageCaption: 'a muscular man posing in a fitness model portrait with visible upper body development'
    }
  ]
};

function norm(value) {
  return String(value || '').trim().toLowerCase();
}

function uniq(list) {
  return [...new Set(list.filter(Boolean))];
}

function normalizeImageFamily(value) {
  const raw = decodeURIComponent(String(value || '').toLowerCase());
  const tail = raw.split('/').pop() || raw;
  return tail
    .replace(/\?.*$/, '')
    .replace(/\.(jpg|jpeg|png|webp|gif)$/i, '')
    .replace(/[_-]?\d+\b/g, '')
    .replace(/\b(copy|cropped|small|medium|large|thumb)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function personKeyForImage(value) {
  const raw = String(value || '').toLowerCase();
  if (!raw) return null;
  if (/aleesha_young/.test(raw)) return 'person_aleesha_young';
  if (/34459240334|35135220152|35302740245|35263265856/.test(raw)) return 'person_fitography_woman_a';
  if (/35263804916/.test(raw)) return 'person_fitography_man_a';
  if (/31536627862/.test(raw)) return 'person_cjquines_woman_a';
  if (/8901359149/.test(raw)) return 'person_felipe_pilotto_man_a';
  if (/john_quinlan|former_pro_wrestler/.test(raw)) return 'person_john_quinlan';
  if (/5992046962/.test(raw)) return 'person_runner_gareth_a';
  return null;
}

function pickAlt(profile) {
  const map = {
    glutes: 'glute progress selfie',
    abs: 'ab progress selfie',
    arms: 'arm progress selfie',
    chest: 'upper body progress selfie',
    back: 'back progress selfie',
    shoulders: 'shoulder progress selfie',
    legs: 'leg training portrait',
    coaching: 'gym mirror selfie',
    exercise: 'portrait workout photo',
    sports: 'sports training portrait',
    general: 'fitness progress selfie'
  };
  return map[profile] || map.general;
}

function postText(post) {
  return `${post.title || ''} ${post.body || ''}`.toLowerCase();
}

function detectProfile(post) {
  const text = postText(post);
  if (/\b(meal|food|protein|calorie|calories|oats|yogurt|rice|salmon|chicken|beef|meal prep|diet)\b/.test(text)) return null;
  if (/\b(glute|glutes|hip thrust|booty|butt)\b/.test(text)) return 'glutes';
  if (/\b(abs|ab work|core)\b/.test(text)) return 'abs';
  if (/\b(biceps|triceps|arms?|curl|pushdown)\b/.test(text)) return 'arms';
  if (/\b(chest|upper chest|bench|incline|pressing|pecs?)\b/.test(text)) return 'chest';
  if (/\b(back|lats?|lat pulldown|pulldown|pull up|rows?|mid back|upper back)\b/.test(text)) return 'back';
  if (/\b(side delts?|rear delts?|shoulders?|lateral raise)\b/.test(text)) return 'shoulders';
  if (/\b(quads?|hamstrings?|calves?|legs?|squat|leg press|split squat|rdl|deadlift)\b/.test(text)) return 'legs';
  if (/\b(trainer|coaching|accountability|consistency|free plan|free training|custom workout|split|program|programming)\b/.test(text)) return 'coaching';
  if (/\b(track|runner|running|baseball|wrestling|jiu jitsu|sport|sports)\b/.test(text)) return 'sports';
  if (/\b(progress|physique|mirror|selfie|growing|shape|bulk|cut)\b/.test(text)) return 'general';
  if (/\b(exercise|variation|setup|stimulus|machine|cable)\b/.test(text)) return 'exercise';
  return 'general';
}

function queriesForProfile(profile) {
  const map = {
    glutes: [
      'adult gym mirror selfie glutes vertical',
      'young adult fitness glute progress selfie',
      'adult athlete glute workout portrait',
      'adult gym selfie leggings glutes',
      'adult fitness selfie portrait'
    ],
    abs: [
      'adult gym mirror selfie abs vertical',
      'young adult fitness abs progress selfie',
      'adult physique check abs portrait',
      'adult gym selfie core progress'
    ],
    arms: [
      'adult gym mirror selfie arms vertical',
      'young adult fitness biceps selfie',
      'adult arm flex gym mirror portrait',
      'adult athlete arm workout portrait',
      'adult fitness selfie portrait'
    ],
    chest: [
      'adult gym mirror selfie upper body vertical',
      'young adult physique progress chest selfie',
      'adult incline dumbbell press portrait',
      'adult bench press vertical gym photo',
      'adult fitness selfie portrait'
    ],
    back: [
      'adult gym mirror selfie back vertical',
      'young adult back progress gym selfie',
      'adult cable row portrait gym',
      'adult pulldown vertical gym photo',
      'adult fitness selfie portrait'
    ],
    shoulders: [
      'adult gym mirror selfie shoulders vertical',
      'young adult shoulder progress selfie',
      'adult lateral raise portrait gym',
      'adult rear delt workout vertical',
      'adult fitness selfie portrait'
    ],
    legs: [
      'adult gym mirror selfie legs vertical',
      'young adult leg progress selfie',
      'adult squat portrait gym photo',
      'adult leg press vertical gym photo',
      'adult athlete training portrait'
    ],
    coaching: [
      'adult gym mirror selfie vertical',
      'young adult fitness progress selfie',
      'adult locker room mirror selfie gym',
      'adult phone camera gym selfie'
    ],
    exercise: [
      'adult vertical gym workout photo',
      'young adult training portrait gym',
      'adult dumbbell workout vertical photo',
      'adult barbell workout vertical gym',
      'adult athlete training portrait'
    ],
    sports: [
      'adult athlete track portrait vertical',
      'adult sports training portrait',
      'adult runner vertical training photo',
      'adult wrestling training portrait',
      'adult athlete training portrait'
    ],
    general: [
      'adult gym mirror selfie vertical',
      'young adult fitness progress selfie',
      'adult physique check portrait',
      'adult phone camera gym selfie',
      'adult athlete training portrait',
      'adult fitness portrait'
    ]
  };
  return map[profile] || map.general;
}

async function openverse(query, page = 1) {
  const url = new URL('https://api.openverse.org/v1/images/');
  url.searchParams.set('q', query);
  url.searchParams.set('license', 'by,by-sa,cc0,pdm');
  url.searchParams.set('page', String(page));
  url.searchParams.set('page_size', String(PAGE_SIZE));
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RiseForIt-portrait-image-fill/1.0'
    }
  });
  if (!response.ok) return { results: [] };
  return response.json();
}

function isPortraitCandidate(item, profile) {
  if (!(item && item.id && item.url)) return false;
  if (!OPEN_LICENSES.has(norm(item.license))) return false;
  if (item.mature) return false;
  const width = Number(item.width || 0);
  const height = Number(item.height || 0);
  if (width < 500 || height < 700) return false;
  if (height / width < 1.08) return false;
  const detail = `${String(item.title || '')} ${String(item.creator || '')} ${String(item.url || '')}`.toLowerCase();
  if (/\.(svg)(\?|$)/i.test(String(item.url || ''))) return false;
  if (/(diagram|illustration|drawing|icon|logo|vector|statue|building|architecture|artifact|museum|sculpture|monument|ruins|painting|bird|bear|car|bus|truck|church|cathedral|toy)/.test(detail)) return false;
  if (!/\b(person|people|man|woman|athlete|fitness|gym|workout|training|physique|selfie|mirror|sport|sports|runner|wrestling|lifting|weightlifting|bodybuilding|pose|posing|bench|squat|dumbbell|barbell)\b/.test(detail)) return false;

  if (profile === 'sports') return /\b(track|runner|wrestling|sport|sports|athlete|training|baseball)\b/.test(detail);
  return /\b(selfie|mirror|physique|gym|fitness|training|athlete|portrait|workout|bodybuilding|weightlifting|sport|sports|runner)\b/.test(detail);
}

class Finder {
  constructor(items) {
    this.cache = new Map();
    this.usedIds = new Set();
    this.usedUrls = new Set();
    this.usedFamilies = new Set();
    this.usedPeople = new Set();
    items.forEach((item) => {
      if (item.imageId) this.usedIds.add(norm(item.imageId));
      if (item.imageUrl) this.usedUrls.add(norm(item.imageUrl));
      const family = normalizeImageFamily(item.imageUrl || item.imagePageUrl);
      if (family) this.usedFamilies.add(family);
      const personKey = personKeyForImage(item.imageUrl || item.imagePageUrl);
      if (personKey) this.usedPeople.add(personKey);
    });
  }

  async next(query, profile) {
    const key = `${profile}::${norm(query)}`;
    let state = this.cache.get(key);
    if (!state) {
      state = { page: 1, index: 0, results: [], done: false };
      this.cache.set(key, state);
    }

    while (true) {
      while (state.index < state.results.length) {
        const item = state.results[state.index];
        state.index += 1;
        const itemId = norm(item.id);
        const itemUrl = norm(item.url);
        const family = normalizeImageFamily(item.url || item.foreign_landing_url || item.detail_url);
        const personKey = personKeyForImage(item.url || item.foreign_landing_url || item.detail_url);
        if (this.usedIds.has(itemId) || this.usedUrls.has(itemUrl) || (family && this.usedFamilies.has(family)) || (personKey && this.usedPeople.has(personKey))) continue;
        if (!isPortraitCandidate(item, profile)) continue;
        if (itemId) this.usedIds.add(itemId);
        if (itemUrl) this.usedUrls.add(itemUrl);
        if (family) this.usedFamilies.add(family);
        if (personKey) this.usedPeople.add(personKey);
        return item;
      }
      if (state.done || state.page > OPENVERSE_MAX) return null;
      const payload = await openverse(query, state.page);
      state.page += 1;
      state.index = 0;
      state.results = Array.isArray(payload.results) ? payload.results : [];
      if (!state.results.length) state.done = true;
    }
  }
}

function takeCurated(profile, finder) {
  const pools = uniq([...(CURATED_BY_PROFILE[profile] || []), ...(CURATED_BY_PROFILE.general || [])]);
  for (const item of pools) {
    const urlKey = norm(item.url);
    const family = normalizeImageFamily(item.url || item.foreign_landing_url);
    const personKey = personKeyForImage(item.url || item.foreign_landing_url);
    if (finder.usedUrls.has(urlKey) || (family && finder.usedFamilies.has(family)) || (personKey && finder.usedPeople.has(personKey))) continue;
    finder.usedUrls.add(urlKey);
    if (family) finder.usedFamilies.add(family);
    if (personKey) finder.usedPeople.add(personKey);
    return { ...item, id: item.url };
  }
  return null;
}

async function main() {
  const payload = JSON.parse(fs.readFileSync(FORUM_PATH, 'utf8'));
  const items = Array.isArray(payload.items) ? payload.items : [];
  const finder = new Finder(items.filter((item) => item.format === 'image' && item.imageUrl));
  let imageCount = items.filter((item) => item.format === 'image' && item.imageUrl).length;

  const candidates = items
    .filter((item) => item.format !== 'image' || !item.imageUrl)
    .map((item) => ({ item, profile: detectProfile(item) }))
    .filter((entry) => entry.profile)
    .sort((left, right) => {
      const leftPriority = ['glutes', 'abs', 'arms', 'chest', 'back', 'shoulders', 'legs', 'coaching', 'general', 'exercise', 'sports'].indexOf(left.profile);
      const rightPriority = ['glutes', 'abs', 'arms', 'chest', 'back', 'shoulders', 'legs', 'coaching', 'general', 'exercise', 'sports'].indexOf(right.profile);
      return leftPriority - rightPriority;
    });

  let added = 0;
  for (const { item, profile } of candidates) {
    if (imageCount >= TARGET_TOTAL_IMAGES) break;
    const queries = queriesForProfile(profile);
    let match = takeCurated(profile, finder);
    for (const query of uniq(queries)) {
      if (match) break;
      match = await finder.next(query, profile);
      if (match) break;
    }
    if (!match) continue;

    item.format = 'image';
    item.imageUrl = match.url;
    item.imageAlt = pickAlt(profile);
    item.imageSource = match.source || 'openverse';
    item.imageCreator = match.creator || null;
    item.imageLicense = match.license || null;
    item.imageLicenseUrl = match.license_url || null;
    item.imagePageUrl = match.foreign_landing_url || match.detail_url || null;
    item.imageId = match.id || null;
    if (match.manualVision) {
      item.manualVision = true;
      item.imageType = match.imageType;
      item.imageSubject = match.imageSubject;
      item.imageMainObject = match.imageSubject;
      item.imageMuscleGroup = match.imageMuscleGroup || null;
      item.imagePostAngle = match.imagePostAngle || null;
      item.imageCaption = match.imageCaption || null;
    }
    imageCount += 1;
    added += 1;
  }

  payload.generatedAt = new Date().toISOString();
  if (!payload.summary) payload.summary = {};
  payload.summary.imagePosts = imageCount;
  payload.summary.textPosts = items.length - imageCount;
  payload.items = items;
  fs.writeFileSync(FORUM_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log(JSON.stringify({ imageCount, added, target: TARGET_TOTAL_IMAGES }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
