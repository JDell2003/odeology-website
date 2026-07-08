const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function readSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'js', 'account-trainer.js'), 'utf8');
}

function extractFunctionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`Function not found: ${name}`);
  let sigIndex = source.indexOf('(', start);
  if (sigIndex < 0) throw new Error(`No signature for function: ${name}`);
  let parenDepth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  let i = sigIndex;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '(') parenDepth += 1;
    if (ch === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) break;
    }
  }
  i = source.indexOf('{', i);
  if (i < 0) throw new Error(`No body for function: ${name}`);
  let depth = 0;
  quote = '';
  escaped = false;
  lineComment = false;
  blockComment = false;
  for (; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (lineComment) {
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (ch === '*' && next === '/') {
        blockComment = false;
        i += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) {
        quote = '';
      }
      continue;
    }
    if (ch === '/' && next === '/') {
      lineComment = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      blockComment = true;
      i += 1;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unbalanced braces for function: ${name}`);
}

function loadFunctions(names) {
  const src = readSource();
  const constants = `
    const LEAD_STAGES = [
      'New Lead',
      'Contacted',
      'Qualified',
      'Appointment Booked',
      'Showed',
      'Offer Sent',
      'Won',
      'Lost',
      'Waitlist'
    ];
    function escapeHtml(raw) {
      return String(raw || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    function normalizeLookupText(value = '') {
      return String(value || '').trim().toLowerCase();
    }
    function renderEmpty(message) {
      return \`<div class="account-trainer-empty">\${escapeHtml(message)}</div>\`;
    }
    function formatShortDate(raw) {
      const value = String(raw || '').trim();
      if (!value) return '';
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;
      return date.toISOString().slice(0, 10);
    }
  `;
  const chunks = names.map((name) => extractFunctionSource(src, name)).join('\n');
  const context = { module: { exports: {} } };
  vm.runInNewContext(`${constants}\n${chunks}\nmodule.exports = { ${names.join(', ')} };`, context);
  return context.module.exports;
}

test('renderPotentialLeads surfaces custom answers, upload details, and readable history summaries', () => {
  const {
    renderPotentialLeads
  } = loadFunctions([
    'normalizeLeadStage',
    'matchLeadTag',
    'leadAnswerLabel',
    'normalizeLeadAnswerValue',
    'renderLeadCustomAnswers',
    'renderLeadUploadDetails',
    'formatLeadEventSummary',
    'renderPotentialLeads'
  ]);

  const html = renderPotentialLeads([
    {
      id: 'lead-1',
      fullName: 'Avery Client',
      email: 'avery@example.com',
      status: 'Qualified',
      sourcePageName: 'Apply',
      goal: 'Fat loss',
      budget: '300+',
      location: 'Miami',
      coachingType: 'Online',
      availability: 'Mornings',
      injuries: 'None',
      formId: 'qualification-form',
      tags: ['Hot lead', 'Miami'],
      answers: {
        goal: 'Fat loss',
        best_contact_time: 'Weeknights',
        equipment_access: ['Dumbbells', 'Bands']
      },
      uploads: [
        {
          key: 'progress_photos',
          files: [
            { name: 'front.jpg', type: 'image/jpeg' },
            { name: 'side.jpg', type: 'image/jpeg' }
          ]
        }
      ],
      recentEvents: [
        {
          eventType: 'automation_add_tag',
          createdAt: '2026-06-16T10:00:00Z',
          details: { tags: ['Hot lead'] }
        },
        {
          eventType: 'automation_change_stage',
          createdAt: '2026-06-16T10:02:00Z',
          details: { status: 'Qualified' }
        },
        {
          eventType: 'automation_integration',
          createdAt: '2026-06-16T10:04:00Z',
          details: {
            integrations: [{ type: 'google_sheets', target: 'Leads sheet' }]
          }
        }
      ]
    }
  ], { search: '', stage: '', tag: '' });

  assert.match(html, /Custom answers/);
  assert.match(html, /Best Contact Time/);
  assert.match(html, /Weeknights/);
  assert.match(html, /Equipment Access/);
  assert.match(html, /Dumbbells, Bands/);
  assert.match(html, /Uploaded files/);
  assert.match(html, /Progress Photos/);
  assert.match(html, /front\.jpg/);
  assert.match(html, /side\.jpg/);
  assert.match(html, /Tags: Hot lead/);
  assert.match(html, /Stage: Qualified/);
  assert.match(html, /google_sheets: Leads sheet/);
});
