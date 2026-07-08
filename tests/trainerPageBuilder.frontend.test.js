const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function readSource() {
  return fs.readFileSync(path.join(__dirname, '..', 'js', 'trainer-profile.js'), 'utf8');
}

function readHtml() {
  return fs.readFileSync(path.join(__dirname, '..', 'trainer-profile.html'), 'utf8');
}

test('trainer profile frontend wires public route loading, seo, and qualification persistence', () => {
  const src = readSource();
  assert.match(src, /const TRAINER_PROFILE_API_TIMEOUT_MS = 6500/);
  assert.match(src, /const timeoutMs = Math\.max\(1200, Number\(options\.timeoutMs\) \|\| TRAINER_PROFILE_API_TIMEOUT_MS\)/);
  assert.match(src, /async function loadTrainerPagesForViewer\(\)/);
  assert.match(src, /async function loadPublicTrainerPage\(siteSlug, pageSlug = ''\)/);
  assert.match(src, /\/api\/auth\/trainer\/pages/);
  assert.match(src, /\/api\/coach\/pages\/public/);
  assert.match(src, /function applyTrainerPageSeo\(/);
  assert.match(src, /ensureHeadTag\('meta\[name="description"\]'/);
  assert.match(src, /ensureHeadTag\('link\[rel="canonical"\]'/);
  assert.match(src, /const QUALIFICATION_PROGRESS_KEY = 'trainer-page-qualification-v1'/);
  assert.match(src, /const QUALIFICATION_DISMISS_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(src, /function currentRenderedPage\(\)/);
  assert.match(src, /function qualificationStorageKey\(page = currentRenderedPage\(\)\)/);
  assert.match(src, /function initializeQualificationState\(page = currentRenderedPage\(\)\)/);
  assert.match(src, /function dismissQualificationGate\(\)/);
  assert.match(src, /function isStandalonePublicCoachRoute\(\)/);
  assert.match(src, /const questions = Array\.isArray\(qualification\.questions\) && qualification\.questions\.length\s+\? qualification\.questions\s+\: DEFAULT_QUALIFICATION_QUESTIONS/);
  assert.match(src, /function saveQualificationProgress\(\{ completed = false \} = \{\}\)/);
  assert.match(src, /\/api\/coach\/pages\/qualification/);
  assert.match(src, /Promise\.all\(\[/);
  assert.match(src, /Promise\.race\(\[/);
  assert.match(src, /if \(param\) \{/);
  assert.match(src, /const publicPageSlug = pathMatch \? view : ''/);
});

test('trainer profile frontend exposes a code-first website studio with a single custom-code editor surface', () => {
  const src = readSource();
  assert.match(src, /Trainer website studio/);
  assert.match(src, /code-first website editor/i);
  assert.match(src, /id="trainer-page-code-form"/);
  assert.match(src, /id="trainer-page-code-html"/);
  assert.match(src, /id="trainer-page-code-css"/);
  assert.match(src, /id="trainer-page-code-js"/);
  assert.match(src, /id="trainer-page-code-iframes"/);
  assert.match(src, /id="trainer-page-code-embeds"/);
  assert.match(src, /data-builder-code-tab="\$\{value\}"/);
  assert.match(src, /\['html', 'HTML'\]/);
  assert.match(src, /\['css', 'CSS'\]/);
  assert.match(src, /\['javascript', 'JS'\]/);
  assert.match(src, /editorState\.editorCodeTab/);
  assert.match(src, /loadCurrentBuilderVersions/);
  assert.match(src, /restoreBuilderVersion/);
  assert.match(src, /moveCurrentBuilderPage\(offset = 0\)/);
  assert.match(src, /trainer-builder-preview-canvas/);
  assert.match(src, /Rendered output/);
  assert.doesNotMatch(src, /dragstart/);
  assert.doesNotMatch(src, /draggable="true"/);
  assert.doesNotMatch(src, /trainer-builder-section-grip/);
  assert.doesNotMatch(src, /Page mode/i);
  assert.doesNotMatch(src, /Website structure/);
  assert.doesNotMatch(src, /data-builder-section-select/);
  assert.doesNotMatch(src, /data-builder-add-section/);
  assert.doesNotMatch(src, /data-builder-section-action/);
  assert.doesNotMatch(src, /trainer-builder-inline-copy-form/);
  assert.doesNotMatch(src, /Theme/i);
  assert.doesNotMatch(src, /<summary>Forms<\/summary>/);
  assert.doesNotMatch(src, /<summary>Automations<\/summary>/);
  assert.doesNotMatch(src, /<summary>Qualification<\/summary>/);
});

test('trainer profile frontend keeps the sandboxed custom-code preview and CTA event bridge', () => {
  const src = readSource();
  assert.match(src, /Content-Security-Policy/);
  assert.match(src, /sandbox="allow-scripts allow-forms allow-popups allow-modals"/);
  assert.match(src, /data-qualification-dismiss/);
  assert.match(src, /data-public-builder-cta="1"/);
  assert.match(src, /\/api\/coach\/pages\/event/);
  assert.match(src, /eventType: 'page_viewed'/);
  assert.match(src, /eventType: 'button_clicked'/);
  assert.match(src, /draft\.draftContent\.customCode\.iframes = parseCustomCodeEntries/);
  assert.match(src, /draft\.draftContent\.customCode\.embedScripts = parseCustomCodeEntries/);
  assert.match(src, /window\.location\.href = redirectTarget/);
});

test('trainer profile public shell does not opt into the global auth gate', () => {
  const html = readHtml();
  assert.match(html, /<body class="trainer-profile-page">/);
  assert.doesNotMatch(html, /data-require-auth="1"/);
});
