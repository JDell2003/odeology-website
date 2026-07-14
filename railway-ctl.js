// railway-ctl.js — enable SCORING_ENGINE_V2 in prod via the Railway GraphQL API.
// Reads RAILWAY_TOKEN from .env. NEVER prints secret values — only variable KEYS
// and non-secret IDs/names. Handles BOTH account tokens (Authorization: Bearer)
// and project tokens (Project-Access-Token + projectToken{} discovery).
// Modes: discover | apply | redeploy | logs
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const MODE = (process.argv[2] || 'discover').toLowerCase();
const ENDPOINT = 'https://backboard.railway.app/graphql/v2';

function readEnvToken() {
  const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*RAILWAY_TOKEN\s*=\s*"?([^"\r\n]+)"?\s*$/);
    if (m) return m[1].trim();
  }
  throw new Error('RAILWAY_TOKEN not found in .env');
}
const TOKEN = readEnvToken();

function gql(query, variables, mode) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query, variables: variables || {} });
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) };
    if (mode === 'project') headers['Project-Access-Token'] = TOKEN;
    else headers['Authorization'] = `Bearer ${TOKEN}`;
    const req = https.request(ENDPOINT, { method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, json: null, raw: data.slice(0, 300) }); }
      });
    });
    req.on('error', reject);
    req.write(body); req.end();
  });
}
const errsOf = (r) => (r && r.json && r.json.errors ? r.json.errors.map((e) => e.message) : (r && r.raw) || 'no data');

const WANT = {
  SCORING_ENGINE_V2: 'true',
  DEFAULT_TZ: 'America/New_York',
  FITBIT_SCOPES: 'activity sleep profile heart'
};
const CONFIRM = ['DATABASE_URL', 'PUBLIC_BASE_URL', 'STRAVA_CLIENT_ID', 'STRAVA_CLIENT_SECRET', 'FITBIT_CLIENT_ID', 'FITBIT_CLIENT_SECRET'];

async function resolveContext() {
  // 1) account token path
  const me = await gql('query { me { name email } }', {}, 'bearer');
  if (me.json && me.json.data && me.json.data.me) {
    const proj = await gql(`query { projects { edges { node { id name environments { edges { node { id name } } } services { edges { node { id name } } } } } } }`, {}, 'bearer');
    const projects = (proj.json?.data?.projects?.edges || []).map((e) => e.node);
    return { auth: 'bearer', who: me.json.data.me.name || me.json.data.me.email, projects };
  }
  // 2) project token path
  const pt = await gql('query { projectToken { projectId environmentId } }', {}, 'project');
  if (pt.json && pt.json.data && pt.json.data.projectToken) {
    const { projectId, environmentId } = pt.json.data.projectToken;
    const p = await gql(`query($id:String!){ project(id:$id){ id name environments{edges{node{id name}}} services{edges{node{id name}}} } }`, { id: projectId }, 'project');
    const project = p.json?.data?.project || null;
    return { auth: 'project', scopedProjectId: projectId, scopedEnvironmentId: environmentId, project, projErr: project ? null : errsOf(p) };
  }
  return { auth: null, meErr: errsOf(me), ptErr: errsOf(pt) };
}

function pickService(services, hint) {
  const svcs = (services?.edges || []).map((e) => e.node);
  return svcs.find((s) => /web|server|app|odeology|stryve|rise/i.test(s.name)) || svcs[0] || null;
}

(async () => {
  const ctx = await resolveContext();
  if (!ctx.auth) {
    console.log('AUTH FAILED both ways.');
    console.log('  bearer/me errors:', JSON.stringify(ctx.meErr));
    console.log('  project/projectToken errors:', JSON.stringify(ctx.ptErr));
    return;
  }

  let projectId, environmentId, serviceId, projName, envName, svcName, envs, svcs, authMode = ctx.auth;

  if (ctx.auth === 'bearer') {
    const p = (ctx.projects || []).sort((a, b) => {
      const s = (x) => (/odeology|stryve|riseforit|rise/i.test(x.name) ? 10 : 0) + ((x.services?.edges || []).length ? 1 : 0);
      return s(b) - s(a);
    })[0];
    if (!p) { console.log('No projects visible to this account token.'); return; }
    envs = (p.environments?.edges || []).map((e) => e.node);
    svcs = (p.services?.edges || []).map((e) => e.node);
    const env = envs.find((e) => /prod/i.test(e.name)) || envs[0];
    const svc = pickService(p.services);
    projectId = p.id; environmentId = env?.id; serviceId = svc?.id;
    projName = p.name; envName = env?.name; svcName = svc?.name;
    console.log('AUTH ok (account token) as', ctx.who);
    console.log('PROJECTS:', (ctx.projects || []).map((x) => x.name).join(' | '));
  } else {
    const p = ctx.project;
    if (!p) { console.log('project token ok but project query failed:', JSON.stringify(ctx.projErr)); }
    projectId = ctx.scopedProjectId; environmentId = ctx.scopedEnvironmentId;
    envs = (p?.environments?.edges || []).map((e) => e.node);
    svcs = (p?.services?.edges || []).map((e) => e.node);
    const svc = pickService(p?.services);
    serviceId = svc?.id;
    projName = p?.name; svcName = svc?.name;
    envName = (envs.find((e) => e.id === environmentId) || {}).name || '(scoped)';
    console.log('AUTH ok (PROJECT token) scoped to project', projName || projectId, 'env', envName);
  }

  console.log('TARGET  project=', projName, ' env=', envName, ' service=', svcName);
  console.log('  projectId=', projectId);
  console.log('  environmentId=', environmentId);
  console.log('  serviceId=', serviceId);
  console.log('  environments:', (envs || []).map((e) => `${e.name}:${e.id.slice(0,8)}`).join(', '));
  console.log('  services:', (svcs || []).map((s) => `${s.name}:${s.id.slice(0,8)}`).join(', '));

  if (!projectId || !environmentId || !serviceId) {
    console.log('*** Could not resolve all three IDs. Stopping before any change. ***');
    return;
  }
  const ids = { projectId, environmentId, serviceId };

  const varsRes = await gql(`query v($projectId:String!,$environmentId:String!,$serviceId:String!){ variables(projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId) }`, ids, authMode);
  const vars = varsRes.json?.data?.variables || null;
  if (!vars) { console.log('Could not read variables:', JSON.stringify(errsOf(varsRes))); return; }
  const keys = Object.keys(vars).sort();
  console.log('VARIABLE KEYS (', keys.length, '):', keys.join(', '));
  console.log('--- confirm-present ---');
  for (const k of CONFIRM) console.log('  ', k, keys.includes(k) ? 'PRESENT' : '*** MISSING ***');
  console.log('--- to-set ---');
  for (const k of Object.keys(WANT)) {
    const already = vars[k] === WANT[k];
    if (k === 'SCORING_ENGINE_V2') console.log('  ', k, '=', vars[k] === undefined ? '(unset)' : vars[k], '-> want', WANT[k], already ? '(already)' : '(WILL CHANGE)');
    else console.log('  ', k, already ? '(already correct)' : (vars[k] === undefined ? '(unset -> WILL SET)' : '(differs -> WILL SET)'));
  }

  if (MODE === 'discover') { console.log('\nMODE=discover: NO changes made.'); return; }

  if (MODE === 'apply') {
    for (const [name, value] of Object.entries(WANT)) {
      if (vars[name] === value) { console.log('skip (already):', name); continue; }
      const up = await gql(`mutation u($input:VariableUpsertInput!){ variableUpsert(input:$input) }`, { input: { ...ids, name, value } }, authMode);
      console.log('upsert', name, '->', (up.json && up.json.data && !up.json.errors) ? 'OK' : ('FAIL ' + JSON.stringify(errsOf(up))));
    }
    console.log('APPLY done.');
    return;
  }

  if (MODE === 'redeploy') {
    const rd = await gql(`mutation r($serviceId:String!,$environmentId:String!){ serviceInstanceRedeploy(serviceId:$serviceId,environmentId:$environmentId) }`, { serviceId, environmentId }, authMode);
    console.log('serviceInstanceRedeploy ->', (rd.json && rd.json.data && !rd.json.errors) ? 'OK' : ('FAIL ' + JSON.stringify(errsOf(rd))));
    return;
  }

  if (MODE === 'logs') {
    const dep = await gql(`query d($projectId:String!,$environmentId:String!,$serviceId:String!){ deployments(first:3, input:{projectId:$projectId,environmentId:$environmentId,serviceId:$serviceId}){ edges{ node{ id status createdAt } } } }`, ids, authMode);
    const edges = dep.json?.data?.deployments?.edges || [];
    console.log('DEPLOYMENTS:', edges.map((e) => `${e.node.status}@${String(e.node.createdAt).slice(11,19)}(${e.node.id.slice(0,8)})`).join(' | ') || ('none / ' + JSON.stringify(errsOf(dep))));
    if (!edges.length) return;
    const latest = edges[0].node;
    const lg = await gql(`query l($id:String!){ deploymentLogs(deploymentId:$id, limit:500){ message } }`, { id: latest.id }, authMode);
    const lines = (lg.json?.data?.deploymentLogs || []).map((l) => l.message);
    const hits = lines.filter((m) => /scoring|SCORING_ENGINE_V2|schema ensured|DEFAULT_TZ|FITBIT|Server running|listen|error/i.test(m));
    console.log('--- filtered log lines (', latest.status, ') ---');
    (hits.length ? hits : lines).slice(-45).forEach((m) => console.log(m));
    if (!hits.length) console.log('(no scoring/boot lines yet — may still be building)');
    return;
  }
})().catch((e) => console.log('SCRIPT ERROR:', e && e.message ? e.message : String(e)));
