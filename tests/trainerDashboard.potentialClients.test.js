const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function read(filePath) {
  return fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
}

test('trainer dashboard frontend loads and updates scoped potential-client leads', () => {
  const src = read(path.join('js', 'account-trainer.js'));
  assert.match(src, /const LEAD_STAGES = \[/);
  assert.match(src, /api\('\/api\/auth\/trainer\/leads'\)/);
  assert.match(src, /api\('\/api\/auth\/trainer\/lead'/);
  assert.match(src, /data-clients-view="potential-clients"/);
  assert.match(src, /data-clients-panel="potential-clients"/);
  assert.match(src, /renderPotentialLeads/);
  assert.match(src, /Submission history/);
  assert.match(src, /data-lead-history="1"/);
  assert.match(src, /recentEvents/);
  assert.match(src, /renderLeadCustomAnswers/);
  assert.match(src, /Custom answers/);
  assert.match(src, /data-lead-custom-answers="1"/);
  assert.match(src, /renderLeadUploadDetails/);
  assert.match(src, /Uploaded files/);
  assert.match(src, /data-lead-upload-list="1"/);
});

test('trainer sidebar exposes a Potential Clients entry in dynamic and static control panels', () => {
  const mainSrc = read(path.join('js', 'main.js'));
  const htmlSrc = read('trainer-dashboard.html');
  assert.match(mainSrc, /control-trainer-potential-clients-link/);
  assert.match(mainSrc, /trainer-dashboard\.html\?tab=potential-clients/);
  assert.match(htmlSrc, /control-trainer-potential-clients-link/);
  assert.match(htmlSrc, /trainer-dashboard\.html\?tab=potential-clients/);
});

test('trainer page routes expose public lead throttling and event-backed history', () => {
  const authSrc = read(path.join('core', 'authRoutes.js'));
  const pageSrc = read(path.join('core', 'trainerPages.js'));
  assert.match(authSrc, /PUBLIC_TRAINER_LEAD_LIMIT/);
  assert.match(authSrc, /checkPublicTrainerLeadRateLimit/);
  assert.match(authSrc, /handlePublicTrainerLeadCreateWithDeps/);
  assert.match(authSrc, /sendJsonFn\(res, 429/);
  assert.match(pageSrc, /MAX_LEAD_UPLOAD_SIZE_BYTES/);
  assert.match(pageSrc, /normalizeLeadUploads/);
  assert.match(pageSrc, /recentEvents/);
  assert.match(pageSrc, /app_trainer_page_lead_events/);
  assert.match(authSrc, /\/api\/auth\/trainer\/page\/versions/);
  assert.match(authSrc, /\/api\/auth\/trainer\/page\/version\/restore/);
  assert.match(pageSrc, /listTrainerPageVersions/);
  assert.match(pageSrc, /restoreTrainerPageVersion/);
  assert.match(pageSrc, /matchingAutomationNodes/);
  assert.match(pageSrc, /executeTrainerPageAutomationNodes/);
  assert.match(pageSrc, /processPublicTrainerPageEvent/);
  assert.match(pageSrc, /automation_redirect/);
  assert.match(pageSrc, /automation_change_stage/);
  assert.match(pageSrc, /automation_add_tag/);
  assert.match(authSrc, /automation: created\.automation \|\| \{\}/);
  assert.match(authSrc, /\/api\/coach\/pages\/event/);
});
