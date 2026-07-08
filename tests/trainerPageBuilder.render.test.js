const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function readSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'js', 'trainer-profile.js'), 'utf8');
}

function extractFunctionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.lastIndexOf(marker);
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
      if (ch === quote) quote = '';
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
      if (ch === quote) quote = '';
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

function loadTrainerProfileFunctions(names) {
  const src = readSource();
  const constants = `
    const pageState = {
      trainer: null,
      view: '',
      trainerPages: [],
      currentTrainerPage: null,
      publicPagePayload: null,
      publicAutomationEventKey: ''
    };
    const qualificationState = {
      revealed: false
    };
    const editorState = {
      previewMode: false,
      previewDevice: 'desktop',
      enabled: false
    };
  `;
  const chunks = names.map((name) => extractFunctionSource(src, name)).join('\n');
  const context = {
    module: { exports: {} },
    window: { location: { origin: 'https://example.test', href: 'https://example.test/coach/avery' } },
    document: {}
  };
  vm.runInNewContext(`${constants}\n${chunks}\nmodule.exports = { ${names.join(', ')}, pageState, qualificationState, editorState };`, context);
  return context.module.exports;
}

test('starter custom-code sample content renders inside the sandboxed preview iframe', () => {
  const { createBlankTrainerPage, renderActiveBuilderPage } = loadTrainerProfileFunctions([
    'escapeHtml',
    'cloneJson',
    'sanitizeHandle',
    'slugify',
    'builderContentHasRenderableData',
    'activeBuilderDraftContent',
    'normalizeEditableCustomCode',
    'isEditableCustomCodeEmpty',
    'resolveEditableCustomCode',
    'normalizeBuilderPageShape',
    'buildStarterCustomCode',
    'createBlankTrainerPage',
    'renderCustomCodePreview',
    'renderActiveBuilderPage'
  ]);

  const trainer = { fullName: 'Avery Stone' };
  const draft = createBlankTrainerPage(trainer, { pageName: 'Book a consult', pageSlug: 'book' });

  assert.equal(draft.mode, 'custom_code');
  assert.match(String(draft.draftContent.customCode.html || ''), /Book a consult/);
  assert.match(String(draft.draftContent.customCode.html || ''), /Apply for coaching/);
  assert.match(String(draft.draftContent.customCode.html || ''), /Results and testimonials go here/);
  assert.match(String(draft.draftContent.customCode.css || ''), /\.coach-custom-hero/);
  assert.match(String(draft.draftContent.customCode.css || ''), /\.coach-custom-panel/);
  assert.match(String(draft.draftContent.customCode.javascript || ''), /coach_custom_cta_clicked/);

  const html = renderActiveBuilderPage(draft);
  assert.match(html, /sandbox="allow-scripts allow-forms allow-popups allow-modals"/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /srcdoc=/);
});

test('public rendering prefers published custom code over draft code', () => {
  const { renderActiveBuilderPage } = loadTrainerProfileFunctions([
    'escapeHtml',
    'builderContentHasRenderableData',
    'activeBuilderDraftContent',
    'normalizeEditableCustomCode',
    'isEditableCustomCodeEmpty',
    'resolveEditableCustomCode',
    'renderCustomCodePreview',
    'renderActiveBuilderPage'
  ]);

  const page = {
    mode: 'custom_code',
    draftContent: {
      mode: 'custom_code',
      customCode: {
        html: '<section><h1>Draft headline</h1></section>',
        css: '.draft{color:red}',
        javascript: '',
        iframes: [],
        embedScripts: []
      }
    },
    publishedContent: {
      mode: 'custom_code',
      customCode: {
        html: '<section><h1>Published headline</h1></section>',
        css: '.published{color:blue}',
        javascript: '',
        iframes: [],
        embedScripts: []
      }
    }
  };

  const publicHtml = renderActiveBuilderPage(page, { publicView: true });
  const draftHtml = renderActiveBuilderPage(page, { publicView: false });

  assert.match(publicHtml, /Published headline/);
  assert.doesNotMatch(publicHtml, /Draft headline/);
  assert.doesNotMatch(publicHtml, /trainer-builder-browser-chrome/);
  assert.match(publicHtml, /data-builder-preview-surface="public"/);
  assert.match(draftHtml, /Draft headline/);
  assert.doesNotMatch(draftHtml, /Published headline/);
  assert.match(draftHtml, /trainer-builder-browser-chrome/);
  assert.match(draftHtml, /data-builder-preview-surface="editor"/);
});

test('public rendering falls back to a generic preserved-page message when published custom code is empty', () => {
  const {
    pageState,
    renderActiveBuilderPage
  } = loadTrainerProfileFunctions([
    'escapeHtml',
    'humanizeLegacyKey',
    'builderContentHasRenderableData',
    'activeBuilderDraftContent',
    'normalizeEditableCustomCode',
    'isEditableCustomCodeEmpty',
    'resolveEditableCustomCode',
    'renderCustomCodePreview',
    'renderActiveBuilderPage',
    'buildLegacyFallbackCustomCode'
  ]);

  pageState.trainer = { fullName: 'Avery Stone' };
  const page = {
    mode: 'custom_code',
    legacyMode: 'template',
    draftContent: {
      mode: 'template',
      templateKey: 'legacy_landing_page',
      theme: {
        headline: 'Draft legacy headline',
        subheadline: 'Draft legacy subheadline'
      },
      customCode: {
        html: '',
        css: '',
        javascript: '',
        iframes: [],
        embedScripts: []
      }
    },
    publishedContent: {
      mode: 'template',
      templateKey: 'legacy_landing_page',
      theme: {
        headline: 'Published legacy headline',
        subheadline: 'Published legacy subheadline'
      },
      customCode: {
        html: '',
        css: '',
        javascript: '',
        iframes: [],
        embedScripts: []
      }
    }
  };

  const publicHtml = renderActiveBuilderPage(page, { publicView: true });

  assert.match(publicHtml, /This page was preserved in the custom code editor/i);
  assert.doesNotMatch(publicHtml, /No custom code yet/);
});

test('legacy pages that already have migrated custom code keep it in the code workspace', () => {
  const {
    hydrateBuilderDraftCustomCode
  } = loadTrainerProfileFunctions([
    'cloneJson',
    'sanitizeHandle',
    'slugify',
    'normalizeBuilderPageShape',
    'builderContentHasRenderableData',
    'activeBuilderDraftContent',
    'normalizeEditableCustomCode',
    'isEditableCustomCodeEmpty',
    'resolveEditableCustomCode',
    'hydrateBuilderDraftCustomCode'
  ]);

  const page = {
    mode: 'custom_code',
    legacyMode: 'template',
    draftContent: {
      mode: 'custom_code',
      customCode: {
        html: '<section><h1>Legacy editor headline</h1><p>Legacy editor subheadline</p></section>',
        css: '.legacy-site{color:#10283c}',
        javascript: '',
        iframes: [],
        embedScripts: []
      }
    },
    publishedContent: {}
  };

  const hydrated = hydrateBuilderDraftCustomCode(page);
  assert.match(String(hydrated.draftContent.customCode.html || ''), /Legacy editor headline/);
  assert.match(String(hydrated.draftContent.customCode.css || ''), /legacy-site/);
});

test('public rendering uses draft custom code when a fallback page is not yet published', () => {
  const { renderActiveBuilderPage } = loadTrainerProfileFunctions([
    'escapeHtml',
    'builderContentHasRenderableData',
    'activeBuilderDraftContent',
    'normalizeEditableCustomCode',
    'isEditableCustomCodeEmpty',
    'resolveEditableCustomCode',
    'renderCustomCodePreview',
    'renderActiveBuilderPage'
  ]);

  const page = {
    mode: 'custom_code',
    isPublished: false,
    draftContent: {
      mode: 'custom_code',
      customCode: {
        html: '<section><h1>Starter public page</h1><p>Apply for coaching</p></section>',
        css: '',
        javascript: '',
        iframes: [],
        embedScripts: []
      }
    },
    publishedContent: {
      mode: '',
      customCode: {
        html: '',
        css: '',
        javascript: '',
        iframes: [],
        embedScripts: []
      }
    }
  };

  const html = renderActiveBuilderPage(page, { publicView: true });
  assert.match(html, /Starter public page/);
  assert.match(html, /Apply for coaching/);
  assert.doesNotMatch(html, /legacy page was converted/i);
});

test('public builder shell renders only the trainer code frame and qualification overlay hook', () => {
  const { qualificationState, renderBuilderPublicShell } = loadTrainerProfileFunctions([
    'escapeHtml',
    'builderContentHasRenderableData',
    'activeBuilderDraftContent',
    'normalizeEditableCustomCode',
    'isEditableCustomCodeEmpty',
    'resolveEditableCustomCode',
    'renderCustomCodePreview',
    'renderActiveBuilderPage',
    'canBypassQualificationGate',
    'renderQualificationGate',
    'normalizeText',
    'normalizeQuestionOptions',
    'questionValue',
    'renderQualificationQuestion',
    'qualificationConfig',
    'renderBuilderPublicShell'
  ]);

  qualificationState.revealed = false;
  const page = {
    siteSlug: 'avery',
    pageSlug: 'apply',
    pageName: 'Apply',
    settings: {
      qualification: {
        enabled: true,
        questions: [{ id: 'gender', label: 'Gender', type: 'radio', required: true, options: ['Female', 'Male', 'Other'] }]
      }
    },
    publishedContent: {
      mode: 'custom_code',
      customCode: {
        html: '<section><h1>Apply for coaching</h1></section>',
        css: '',
        javascript: '',
        iframes: [],
        embedScripts: []
      }
    }
  };

  const html = renderBuilderPublicShell(page, { fullName: 'Avery Stone' }, { publicView: true });
  assert.match(html, /trainer-builder-public-frame/);
  assert.match(html, /Apply for coaching/);
  assert.match(html, /data-trainer-qualification="1"/);
  assert.doesNotMatch(html, /Coach site navigation/);
  assert.doesNotMatch(html, /data-public-trainer-form=/);
});

test('public fallback renders a website-style unavailable shell instead of the legacy profile layout', () => {
  const { renderBuilderUnavailableShell } = loadTrainerProfileFunctions([
    'escapeHtml',
    'sanitizeHandle',
    'renderBuilderUnavailableShell'
  ]);

  const html = renderBuilderUnavailableShell({
    fullName: 'Avery Stone',
    publicHandle: 'avery',
    brandPositioning: 'This coach has not published a live website page yet.'
  });

  assert.match(html, /Coach site unavailable/);
  assert.match(html, /Avery Stone/);
  assert.match(html, /trainer-builder-public-shell-unavailable/);
  assert.doesNotMatch(html, /trainer-profile-card/);
});
