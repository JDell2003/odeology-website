const fs = require('fs');
const path = require('path');

const FORUM_PATH = path.join(process.cwd(), 'data', 'forum-posts.json');
const IMAGE_DB_PATH = path.join(process.cwd(), 'data', 'forum-image-posts-db.json');

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

function stripImage(post) {
  return {
    ...post,
    format: 'text',
    imageUrl: null,
    imageAlt: null,
    imageSource: null,
    imageCreator: null,
    imageLicense: null,
    imageLicenseUrl: null,
    imagePageUrl: null,
    imageId: null,
    imageType: null,
    imageMainObject: null,
    imageSubject: null,
    imageMuscleGroup: null,
    imagePostAngle: null,
    imageCaption: null,
    manualVision: false
  };
}

function main() {
  const forum = JSON.parse(fs.readFileSync(FORUM_PATH, 'utf8'));
  const imageDb = JSON.parse(fs.readFileSync(IMAGE_DB_PATH, 'utf8'));
  const items = Array.isArray(forum.items) ? forum.items : [];
  const dbItems = Array.isArray(imageDb.items) ? imageDb.items : Array.isArray(imageDb) ? imageDb : [];

  const seenPeople = new Set();
  let removed = 0;

  const rewrittenItems = items.map((post) => {
    if (!(post.format === 'image' && post.imageUrl)) return post;
    const personKey = personKeyForImage(post.imageUrl || post.imagePageUrl);
    if (!personKey) return post;
    if (seenPeople.has(personKey)) {
      removed += 1;
      return stripImage(post);
    }
    seenPeople.add(personKey);
    return post;
  });

  const keptIds = new Set(rewrittenItems.filter((post) => post.format === 'image' && post.imageUrl).map((post) => post.id));
  const rewrittenDb = dbItems.filter((item) => keptIds.has(item.id));

  forum.items = rewrittenItems;
  forum.generatedAt = new Date().toISOString();
  if (!forum.summary) forum.summary = {};
  forum.summary.imagePosts = rewrittenItems.filter((post) => post.format === 'image' && post.imageUrl).length;
  forum.summary.textPosts = rewrittenItems.length - forum.summary.imagePosts;
  forum.summary.imagePostDatabaseCount = rewrittenDb.length;

  const dbPayload = Array.isArray(imageDb.items)
    ? { ...imageDb, items: rewrittenDb }
    : rewrittenDb;

  fs.writeFileSync(FORUM_PATH, JSON.stringify(forum, null, 2), 'utf8');
  fs.writeFileSync(IMAGE_DB_PATH, JSON.stringify(dbPayload, null, 2), 'utf8');
  console.log(JSON.stringify({
    removed,
    imagePosts: forum.summary.imagePosts,
    textPosts: forum.summary.textPosts,
    dbCount: rewrittenDb.length
  }, null, 2));
}

main();
