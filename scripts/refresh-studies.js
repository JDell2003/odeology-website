const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(process.cwd(), 'data', 'studies.json');
const MAX_STUDIES = Math.max(50, Number.parseInt(process.env.STUDIES_MAX || '1830', 10) || 1830);
const ENRICH_LIMIT = Math.max(0, Number.parseInt(process.env.STUDIES_ENRICH_LIMIT || '0', 10) || 0);
const OPENALEX_API_KEY = String(process.env.OPENALEX_API_KEY || '').trim();
const EMAIL = String(process.env.NCBI_EMAIL || process.env.CONTACT_EMAIL || '').trim();
const TOOL = 'odeology_studies_ingest';

const SEARCH_QUERIES = [
  { term: 'resistance training adults', tags: ['training'] },
  { term: 'strength training adults', tags: ['training'] },
  { term: 'muscle hypertrophy review', tags: ['hypertrophy', 'training'] },
  { term: 'muscle hypertrophy randomized trial', tags: ['hypertrophy', 'training'] },
  { term: 'body composition resistance training adults', tags: ['body-composition', 'training'] },
  { term: 'lean mass resistance training adults', tags: ['body-composition', 'training'] },
  { term: 'dietary protein muscle mass adults', tags: ['nutrition', 'protein', 'muscle-gain'] },
  { term: 'protein supplementation exercise adults', tags: ['nutrition', 'protein', 'supplements'] },
  { term: 'sports nutrition review exercise adults', tags: ['nutrition', 'performance'] },
  { term: 'creatine supplementation exercise adults', tags: ['supplements', 'creatine', 'performance'] },
  { term: 'creatine resistance training meta-analysis', tags: ['supplements', 'creatine', 'performance'] },
  { term: 'beta alanine exercise performance review', tags: ['supplements', 'performance'] },
  { term: 'caffeine exercise performance review', tags: ['supplements', 'performance'] },
  { term: 'time restricted eating resistance training body composition', tags: ['fat-loss', 'meal-timing', 'nutrition'] },
  { term: 'intermittent fasting exercise body composition adults', tags: ['fat-loss', 'meal-timing', 'nutrition'] },
  { term: 'meal timing exercise adults review', tags: ['meal-timing', 'nutrition'] },
  { term: 'exercise obesity adults randomized trial', tags: ['fat-loss', 'obesity', 'cardio'] },
  { term: 'weight loss maintenance protein diet adults', tags: ['fat-loss', 'nutrition'] },
  { term: 'visceral fat exercise adults review', tags: ['fat-loss', 'body-composition'] },
  { term: 'adiposity exercise sedentary behavior adults', tags: ['fat-loss', 'body-composition'] },
  { term: 'VO2 max interval training adults', tags: ['conditioning', 'cardio', 'performance'] },
  { term: 'high intensity interval training adults review', tags: ['conditioning', 'cardio', 'performance'] },
  { term: 'endurance training adults review', tags: ['conditioning', 'cardio'] },
  { term: 'sleep exercise recovery adults', tags: ['recovery', 'sleep', 'performance'] },
  { term: 'exercise recovery soreness adults review', tags: ['recovery', 'performance'] },
  { term: 'sarcopenia exercise protein older adults', tags: ['recovery', 'older-adults', 'nutrition'] },
  { term: 'older adults resistance training muscle mass', tags: ['older-adults', 'training', 'body-composition'] },
  { term: 'appetite exercise adults review', tags: ['nutrition', 'fat-loss'] },
  { term: 'energy balance exercise adults body composition', tags: ['nutrition', 'body-composition'] },
  { term: 'cardiorespiratory fitness adults systematic review', tags: ['conditioning', 'cardio'] }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchWithRetry(url, opts = {}, retries = 4) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, opts);
      if (!response.ok) {
        throw new Error(`Request failed (${response.status}) for ${url}`);
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === retries) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
}

const fetchJson = async (url, opts = {}) => {
  let lastError = null;
  for (let attempt = 0; attempt <= 4; attempt += 1) {
    try {
      const res = await fetchWithRetry(url, opts, 0);
      return await res.json();
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
};

const fetchText = async (url, opts = {}) => {
  let lastError = null;
  for (let attempt = 0; attempt <= 4; attempt += 1) {
    try {
      const res = await fetchWithRetry(url, opts, 0);
      return await res.text();
    } catch (error) {
      lastError = error;
      if (attempt === 4) break;
      await sleep(500 * (attempt + 1));
    }
  }
  throw lastError;
};

function ncbiUrl(endpoint, params = {}) {
  const url = new URL(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/${endpoint}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value == null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  if (EMAIL) url.searchParams.set('email', EMAIL);
  url.searchParams.set('tool', TOOL);
  return url.toString();
}

function stripXml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function splitSentences(text) {
  return normalizeSpace(text).split(/(?<=[.!?])\s+/).filter(Boolean);
}

function inferStudyType(title, publicationTypes = []) {
  const haystack = `${title} ${publicationTypes.join(' ')}`.toLowerCase();
  if (haystack.includes('meta-analysis')) return 'Meta-analysis';
  if (haystack.includes('systematic review')) return 'Systematic review';
  if (haystack.includes('randomized')) return 'Randomized trial';
  if (haystack.includes('cohort')) return 'Cohort study';
  if (haystack.includes('review')) return 'Review';
  return 'Study';
}

function inferTags(title, abstractText, baseTags = []) {
  const haystack = `${title} ${abstractText}`.toLowerCase();
  const tags = new Set(baseTags.map((tag) => String(tag || '').toLowerCase()));
  const tagRules = [
    ['hypertrophy', ['hypertrophy', 'muscle mass', 'lean mass']],
    ['fat-loss', ['fat mass', 'weight loss', 'adiposity', 'obesity', 'visceral fat']],
    ['body-composition', ['body composition', 'lean mass', 'fat-free mass']],
    ['protein', ['protein', 'dietary protein']],
    ['creatine', ['creatine']],
    ['supplements', ['supplement', 'supplementation', 'creatine']],
    ['training', ['resistance training', 'strength training', 'exercise training']],
    ['conditioning', ['vo2', 'aerobic', 'endurance', 'interval training']],
    ['recovery', ['recovery', 'sleep', 'sarcopenia']],
    ['older-adults', ['older adults', 'aging', 'elderly']],
    ['meal-timing', ['time-restricted eating', 'meal timing', 'feeding window']],
    ['nutrition', ['nutrition', 'diet', 'dietary']]
  ];
  tagRules.forEach(([tag, phrases]) => {
    if (phrases.some((phrase) => haystack.includes(phrase))) tags.add(tag);
  });
  return Array.from(tags);
}

function computeFitnessRelevance(title, abstractText, journal = '', baseTags = []) {
  const haystack = `${title} ${abstractText} ${journal}`.toLowerCase();
  const strongPositive = [
    'resistance training',
    'strength training',
    'exercise training',
    'physical activity',
    'body composition',
    'lean mass',
    'muscle mass',
    'muscle hypertrophy',
    'weight loss',
    'fat mass',
    'fat-free mass',
    'dietary protein',
    'protein supplementation',
    'sports nutrition',
    'creatine',
    'aerobic exercise',
    'endurance training',
    'interval training',
    'vo2',
    'recovery',
    'sarcopenia'
  ];
  const weakPositive = [
    'exercise',
    'training',
    'muscle',
    'strength',
    'fitness',
    'nutrition',
    'diet',
    'protein',
    'obesity',
    'adiposity',
    'weight maintenance',
    'sedentary',
    'cardiorespiratory',
    'appetite',
    'supplementation',
    'body weight'
  ];
  const negativeSignals = [
    'carcinoma',
    'cancer',
    'tumor',
    'chemotherapy',
    'immunotherapy',
    'ultrasound',
    'midwives',
    'intrapartum',
    'pregnancy',
    'neonatal',
    'dentistry',
    'dental',
    'ophthalmology',
    'radiology',
    'anesthesia',
    'surgery',
    'surgical',
    'nursing education',
    'medical education',
    'curriculum',
    'medical students',
    'midwifery',
    'qualitative study'
  ];

  let score = 0;
  strongPositive.forEach((phrase) => {
    if (haystack.includes(phrase)) score += 4;
  });
  weakPositive.forEach((phrase) => {
    if (haystack.includes(phrase)) score += 1;
  });
  negativeSignals.forEach((phrase) => {
    if (haystack.includes(phrase)) score -= 5;
  });

  if (journal.toLowerCase().includes('sports')) score += 2;
  if (journal.toLowerCase().includes('exercise')) score += 2;
  if (journal.toLowerCase().includes('nutrition')) score += 1;

  return score;
}

function isFitnessStudy(title, abstractText, journal = '', baseTags = []) {
  return computeFitnessRelevance(title, abstractText, journal, baseTags) >= 3;
}

function buildSummary({ title, abstractText, studyType, journal, year, tags }) {
  const sentences = splitSentences(abstractText);
  const leadTag = Array.isArray(tags) && tags.length ? tags[0].replace(/-/g, ' ') : 'fitness';
  const first = sentences[0] || '';
  const second = sentences[1] || '';

  if (first) {
    const trimmed = normalizeSpace(first);
    if (trimmed.length <= 220) {
      return `${studyType} in ${journal || 'a peer-reviewed journal'} (${year || 'recent'}) focused on ${leadTag}. ${trimmed}`;
    }
  }

  if (second) {
    return `${studyType} in ${journal || 'a peer-reviewed journal'} (${year || 'recent'}) focused on ${leadTag}. ${normalizeSpace(second).slice(0, 220)}`;
  }

  return `${studyType} in ${journal || 'a peer-reviewed journal'} (${year || 'recent'}) covering ${leadTag}, based on the study titled "${title}".`;
}

async function searchPubMed(term, retmax = 320) {
  const url = ncbiUrl('esearch.fcgi', {
    db: 'pubmed',
    retmode: 'json',
    sort: 'pub date',
    retmax,
    term
  });
  const json = await fetchJson(url);
  await sleep(180);
  return Array.isArray(json?.esearchresult?.idlist) ? json.esearchresult.idlist : [];
}

async function fetchPubMedSummaries(pmids) {
  const chunks = [];
  for (let i = 0; i < pmids.length; i += 100) chunks.push(pmids.slice(i, i + 100));
  const out = new Map();
  for (const chunk of chunks) {
    const url = ncbiUrl('esummary.fcgi', {
      db: 'pubmed',
      retmode: 'json',
      id: chunk.join(',')
    });
    const json = await fetchJson(url);
    const result = json?.result || {};
    chunk.forEach((pmid) => {
      if (result[pmid]) out.set(String(pmid), result[pmid]);
    });
    await sleep(180);
  }
  return out;
}

async function fetchPubMedAbstracts(pmids) {
  const chunks = [];
  for (let i = 0; i < pmids.length; i += 40) chunks.push(pmids.slice(i, i + 40));
  const out = new Map();
  for (const chunk of chunks) {
    const url = ncbiUrl('efetch.fcgi', {
      db: 'pubmed',
      rettype: 'abstract',
      retmode: 'xml',
      id: chunk.join(',')
    });
    const xml = await fetchText(url);
    for (const pmid of chunk) {
      const articleMatch = xml.match(new RegExp(`<PubmedArticle>[\\s\\S]*?<PMID[^>]*>${pmid}<\\/PMID>[\\s\\S]*?<\\/PubmedArticle>`));
      const articleXml = articleMatch ? articleMatch[0] : '';
      const abstractParts = Array.from(articleXml.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)).map((match) => stripXml(match[1]));
      out.set(String(pmid), normalizeSpace(abstractParts.join(' ')));
    }
    await sleep(220);
  }
  return out;
}

async function fetchEuropePmcByPmid(pmid) {
  try {
    const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
    url.searchParams.set('query', `EXT_ID:${pmid} AND SRC:MED`);
    url.searchParams.set('format', 'json');
    url.searchParams.set('pageSize', '1');
    const json = await fetchJson(url.toString());
    const item = json?.resultList?.result?.[0];
    await sleep(120);
    return item || null;
  } catch {
    return null;
  }
}

async function fetchCrossrefByDoi(doi) {
  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(String(doi || '').trim())}`;
    const json = await fetchJson(url, {
      headers: {
        'User-Agent': 'odeology-studies-ingest/1.0'
      }
    });
    await sleep(120);
    return json?.message || null;
  } catch {
    return null;
  }
}

async function fetchOpenAlexByPmid(pmid) {
  if (!OPENALEX_API_KEY) return null;
  try {
    const url = new URL(`https://api.openalex.org/works/pmid:${encodeURIComponent(String(pmid || '').trim())}`);
    url.searchParams.set('api_key', OPENALEX_API_KEY);
    const json = await fetchJson(url.toString(), {
      headers: {
        'User-Agent': 'odeology-studies-ingest/1.0'
      }
    });
    await sleep(120);
    return json || null;
  } catch {
    return null;
  }
}

function buildAuthors(summary) {
  const authors = Array.isArray(summary?.authors) ? summary.authors : [];
  return authors
    .map((author) => normalizeSpace(author?.name || ''))
    .filter(Boolean)
    .slice(0, 8);
}

function toIsoDate(summary) {
  const raw = String(summary?.sortpubdate || summary?.pubdate || '').trim();
  const match = raw.match(/^(\d{4})(?:[\/-](\d{2})(?:[\/-](\d{2}))?)?/);
  if (!match) return '';
  const year = match[1];
  const month = match[2] || '01';
  const day = match[3] || '01';
  return `${year}-${month}-${day}`;
}

async function main() {
  const pmidToTags = new Map();
  const orderedPmids = [];

  for (const query of SEARCH_QUERIES) {
    const ids = await searchPubMed(query.term, 320);
    for (const pmid of ids) {
      if (!pmidToTags.has(pmid)) orderedPmids.push(pmid);
      const nextTags = new Set([...(pmidToTags.get(pmid) || []), ...(query.tags || [])]);
      pmidToTags.set(pmid, Array.from(nextTags));
      if (orderedPmids.length >= MAX_STUDIES * 2) break;
    }
    if (orderedPmids.length >= MAX_STUDIES * 2) break;
  }

  const candidatePmids = orderedPmids.slice(0, MAX_STUDIES * 2);
  const summaries = await fetchPubMedSummaries(candidatePmids);
  const prefilteredPmids = candidatePmids.filter((pmid) => {
    const summary = summaries.get(pmid);
    if (!summary) return false;
    const title = normalizeSpace(summary.title || '');
    const journal = normalizeSpace(summary.fulljournalname || summary.source || '');
    return isFitnessStudy(title, '', journal, pmidToTags.get(pmid) || []);
  }).slice(0, MAX_STUDIES + 500);
  const abstracts = await fetchPubMedAbstracts(prefilteredPmids);
  const items = [];

  let enrichCount = 0;

  for (const pmid of prefilteredPmids) {
    const summary = summaries.get(pmid);
    if (!summary) continue;
    const title = normalizeSpace(summary.title || '');
    if (!title) continue;
    const journal = normalizeSpace(summary.fulljournalname || summary.source || '');
    const publicationDate = toIsoDate(summary);
    const year = publicationDate ? publicationDate.slice(0, 4) : String(summary.pubdate || '').slice(0, 4);
    const abstractText = normalizeSpace(abstracts.get(pmid) || '');
    const publicationTypes = Array.isArray(summary.pubtype) ? summary.pubtype.map((x) => normalizeSpace(x)) : [];
    const studyType = inferStudyType(title, publicationTypes);
    if (!isFitnessStudy(title, abstractText, journal, pmidToTags.get(pmid) || [])) continue;
    const shouldEnrich = enrichCount < ENRICH_LIMIT;
    const europePmc = shouldEnrich ? await fetchEuropePmcByPmid(pmid) : null;
    const doi = normalizeSpace(europePmc?.doi || summary.elocationid || '').replace(/^doi:\s*/i, '');
    const crossref = shouldEnrich && doi ? await fetchCrossrefByDoi(doi) : null;
    const openAlex = shouldEnrich ? await fetchOpenAlexByPmid(pmid) : null;
    const tags = inferTags(title, abstractText, pmidToTags.get(pmid) || []);
    const evidenceType = publicationTypes[0] || studyType;
    const sourceUrl = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;
    const item = {
      id: `pmid-${pmid}`,
      title,
      summary: buildSummary({ title, abstractText, studyType, journal, year, tags }),
      abstract: abstractText,
      journal,
      year,
      publicationDate,
      studyType,
      evidenceType,
      authors: buildAuthors(summary),
      tags,
      source: 'PubMed',
      sourceUrl,
      doi: doi || '',
      pmid: String(pmid),
      citations: Number.parseInt(String(europePmc?.citedByCount || openAlex?.cited_by_count || ''), 10) || 0,
      publisher: normalizeSpace(crossref?.publisher || ''),
      crossrefType: normalizeSpace(crossref?.type || ''),
      europePmcUrl: europePmc?.id ? `https://europepmc.org/article/MED/${pmid}` : '',
      openAlexUrl: openAlex?.id || ''
    };
    items.push(item);
    if (shouldEnrich) enrichCount += 1;
    if (items.length >= MAX_STUDIES) break;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    total: items.length,
    sources: [
      {
        key: 'pubmed',
        label: 'PubMed / NCBI E-utilities',
        url: 'https://www.ncbi.nlm.nih.gov/home/develop/api/'
      },
      {
        key: 'europepmc',
        label: 'Europe PMC REST API',
        url: 'https://europepmc.org/RestfulWebService'
      },
      {
        key: 'crossref',
        label: 'Crossref REST API',
        url: 'https://www.crossref.org/documentation/retrieve-metadata/rest-api/'
      },
      {
        key: 'openalex',
        label: 'OpenAlex API',
        url: 'https://docs.openalex.org/how-to-use-the-api/api-overview',
        enabled: Boolean(OPENALEX_API_KEY)
      }
    ],
    items
  };

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`Saved ${items.length} studies to ${DATA_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
