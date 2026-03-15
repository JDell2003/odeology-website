const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(process.cwd(), 'data', 'studies.json');
const MAX_STUDIES = Math.max(50, Number.parseInt(process.env.STUDIES_MAX || '500', 10) || 500);
const ENRICH_LIMIT = Math.max(0, Number.parseInt(process.env.STUDIES_ENRICH_LIMIT || '150', 10) || 150);
const OPENALEX_API_KEY = String(process.env.OPENALEX_API_KEY || '').trim();
const EMAIL = String(process.env.NCBI_EMAIL || process.env.CONTACT_EMAIL || '').trim();
const TOOL = 'odeology_studies_ingest';

const SEARCH_QUERIES = [
  { term: 'resistance training hypertrophy systematic review', tags: ['hypertrophy', 'training'] },
  { term: 'dietary protein muscle mass systematic review', tags: ['nutrition', 'protein', 'muscle-gain'] },
  { term: 'creatine resistance training meta-analysis', tags: ['supplements', 'creatine', 'performance'] },
  { term: 'time-restricted eating resistance training body composition', tags: ['fat-loss', 'nutrition', 'meal-timing'] },
  { term: 'exercise obesity randomized trial systematic review', tags: ['fat-loss', 'obesity', 'cardio'] },
  { term: 'sleep recovery exercise performance review', tags: ['recovery', 'sleep', 'performance'] },
  { term: 'sarcopenia exercise protein older adults systematic review', tags: ['recovery', 'older-adults', 'nutrition'] },
  { term: 'visceral fat exercise adults review', tags: ['fat-loss', 'body-composition'] },
  { term: 'VO2 max interval training review', tags: ['conditioning', 'cardio', 'performance'] },
  { term: 'body composition resistance training adults review', tags: ['body-composition', 'training'] }
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async (url, opts = {}) => {
  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${url}`);
  }
  return await res.json();
};

const fetchText = async (url, opts = {}) => {
  const res = await fetch(url, opts);
  if (!res.ok) {
    throw new Error(`Request failed (${res.status}) for ${url}`);
  }
  return await res.text();
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

async function searchPubMed(term, retmax = 120) {
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
    const ids = await searchPubMed(query.term, 120);
    for (const pmid of ids) {
      if (!pmidToTags.has(pmid)) orderedPmids.push(pmid);
      const nextTags = new Set([...(pmidToTags.get(pmid) || []), ...(query.tags || [])]);
      pmidToTags.set(pmid, Array.from(nextTags));
      if (orderedPmids.length >= MAX_STUDIES * 2) break;
    }
    if (orderedPmids.length >= MAX_STUDIES * 2) break;
  }

  const selectedPmids = orderedPmids.slice(0, MAX_STUDIES);
  const summaries = await fetchPubMedSummaries(selectedPmids);
  const abstracts = await fetchPubMedAbstracts(selectedPmids);
  const items = [];

  let enrichCount = 0;

  for (const pmid of selectedPmids) {
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
