const test = require('node:test');
const assert = require('node:assert/strict');

const authRoutes = require('../core/authRoutes');
const db = require('../core/db');
const trainerPages = require('../core/trainerPages');

function createResponseCapture() {
  return {
    calls: [],
    sendJson(res, status, body) {
      this.calls.push({ status, body });
      return true;
    }
  };
}

function createNodeResponseStub() {
  return {
    status: 0,
    headers: null,
    bodyText: '',
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(body) {
      this.bodyText = String(body || '');
    },
    json() {
      return this.bodyText ? JSON.parse(this.bodyText) : null;
    }
  };
}

test('requireTrainerActorWithDeps returns 401 when no actor is present', async () => {
  const capture = createResponseCapture();
  const actor = await authRoutes._private.requireTrainerActorWithDeps({}, {}, {
    getUserFromRequestFn: async () => null,
    getTrainerProfileFn: async () => null,
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(actor, null);
  assert.equal(capture.calls[0].status, 401);
  assert.equal(capture.calls[0].body.error, 'UNAUTHORIZED');
});

test('requireTrainerActorWithDeps returns 403 for non-trainer non-owner actors', async () => {
  const capture = createResponseCapture();
  const actor = await authRoutes._private.requireTrainerActorWithDeps({}, {}, {
    getUserFromRequestFn: async () => ({ id: 'user-1', isOwner: false, isTrainer: false }),
    getTrainerProfileFn: async () => null,
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(actor, null);
  assert.equal(capture.calls[0].status, 403);
  assert.equal(capture.calls[0].body.error, 'TRAINER_REQUIRED');
});

test('requireTrainerActorWithDeps allows owners and trainer-profile users', async () => {
  const capture = createResponseCapture();
  const owner = await authRoutes._private.requireTrainerActorWithDeps({}, {}, {
    getUserFromRequestFn: async () => ({ id: 'owner-1', isOwner: true }),
    getTrainerProfileFn: async () => null,
    sendJsonFn: capture.sendJson.bind(capture)
  });
  const trainer = await authRoutes._private.requireTrainerActorWithDeps({}, {}, {
    getUserFromRequestFn: async () => ({ id: 'user-2', isOwner: false, isTrainer: false }),
    getTrainerProfileFn: async () => ({ userId: 'user-2' }),
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(owner.id, 'owner-1');
  assert.equal(trainer.id, 'user-2');
  assert.equal(capture.calls.length, 0);
});

test('handleTrainerPageSaveWithDeps sends autosave version kind through to trainerPages.saveTrainerPage', async () => {
  const capture = createResponseCapture();
  let savedArgs = null;
  const req = {};
  const res = {};
  await authRoutes._private.handleTrainerPageSaveWithDeps(req, res, {
    requireTrainerActorFn: async () => ({ id: 'trainer-1' }),
    readJsonBodyFn: async () => ({ pageName: 'Home', autosave: true }),
    trainerPagesApi: {
      async saveTrainerPage(dbApi, trainerUserId, payload, options) {
        savedArgs = { dbApi, trainerUserId, payload, options };
        return { id: 'page-1', pageName: 'Home' };
      },
      async listTrainerPages() {
        return [{ id: 'page-1', pageName: 'Home' }];
      }
    },
    dbApi: { fake: true },
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(savedArgs.trainerUserId, 'trainer-1');
  assert.equal(savedArgs.options.versionKind, 'autosave');
  assert.equal(savedArgs.options.publish, false);
  assert.equal(capture.calls[0].status, 200);
  assert.equal(capture.calls[0].body.ok, true);
  assert.equal(capture.calls[0].body.page.id, 'page-1');
});

test('handleTrainerPageSaveWithDeps forwards publish requests for manual saves', async () => {
  const capture = createResponseCapture();
  let savedArgs = null;
  await authRoutes._private.handleTrainerPageSaveWithDeps({}, {}, {
    requireTrainerActorFn: async () => ({ id: 'trainer-1' }),
    readJsonBodyFn: async () => ({ pageName: 'Home', publish: true }),
    trainerPagesApi: {
      async saveTrainerPage(dbApi, trainerUserId, payload, options) {
        savedArgs = { dbApi, trainerUserId, payload, options };
        return { id: 'page-1', pageName: 'Home', isPublished: true };
      },
      async listTrainerPages() {
        return [{ id: 'page-1', pageName: 'Home', isPublished: true }];
      }
    },
    dbApi: { fake: true },
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(savedArgs.trainerUserId, 'trainer-1');
  assert.equal(savedArgs.options.versionKind, 'manual_save');
  assert.equal(savedArgs.options.publish, true);
  assert.equal(capture.calls[0].status, 200);
  assert.equal(capture.calls[0].body.page.isPublished, true);
});

test('handleTrainerPagePublishWithDeps validates page id before publishing', async () => {
  const capture = createResponseCapture();
  await authRoutes._private.handleTrainerPagePublishWithDeps({}, {}, {
    requireTrainerActorFn: async () => ({ id: 'trainer-1' }),
    readJsonBodyFn: async () => ({}),
    trainerPagesApi: {
      async publishTrainerPage() {
        throw new Error('should not reach publish');
      },
      async listTrainerPages() {
        return [];
      }
    },
    dbApi: {},
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(capture.calls[0].status, 400);
  assert.equal(capture.calls[0].body.error, 'Page id is required.');
});

test('handleTrainerPageUnpublishWithDeps stops when trainer auth fails', async () => {
  const capture = createResponseCapture();
  const result = await authRoutes._private.handleTrainerPageUnpublishWithDeps({}, {}, {
    requireTrainerActorFn: async () => null,
    readJsonBodyFn: async () => ({ id: 'page-1' }),
    trainerPagesApi: {
      async unpublishTrainerPage() {
        throw new Error('should not reach unpublish');
      },
      async listTrainerPages() {
        return [];
      }
    },
    dbApi: {},
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(result, true);
  assert.equal(capture.calls.length, 0);
});

test('handleTrainerLeadsListWithDeps stops when trainer auth fails', async () => {
  const capture = createResponseCapture();
  const result = await authRoutes._private.handleTrainerLeadsListWithDeps({}, {}, new URL('https://example.test/api/auth/trainer/leads'), {
    requireTrainerActorFn: async () => null,
    trainerPagesApi: {
      async listTrainerLeads() {
        throw new Error('should not list leads');
      },
      LEAD_STAGES: []
    },
    dbApi: {},
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(result, true);
  assert.equal(capture.calls.length, 0);
});

test('handleTrainerLeadsListWithDeps forwards filters and stages', async () => {
  const capture = createResponseCapture();
  let listArgs = null;
  await authRoutes._private.handleTrainerLeadsListWithDeps({}, {}, new URL('https://example.test/api/auth/trainer/leads?status=Qualified&q=avery'), {
    requireTrainerActorFn: async () => ({ id: 'trainer-1' }),
    trainerPagesApi: {
      LEAD_STAGES: ['New Lead', 'Qualified'],
      async listTrainerLeads(dbApi, trainerUserId, filters) {
        listArgs = { dbApi, trainerUserId, filters };
        return [{ id: 'lead-1' }];
      }
    },
    dbApi: { fake: true },
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(listArgs.trainerUserId, 'trainer-1');
  assert.deepEqual(listArgs.filters, { status: 'Qualified', query: 'avery' });
  assert.equal(capture.calls[0].status, 200);
  assert.deepEqual(capture.calls[0].body.stages, ['New Lead', 'Qualified']);
  assert.deepEqual(capture.calls[0].body.leads, [{ id: 'lead-1' }]);
});

test('handleTrainerLeadUpdateWithDeps validates lead id before updating', async () => {
  const capture = createResponseCapture();
  await authRoutes._private.handleTrainerLeadUpdateWithDeps({}, {}, {
    requireTrainerActorFn: async () => ({ id: 'trainer-1' }),
    readJsonBodyFn: async () => ({ notes: 'hello' }),
    trainerPagesApi: {
      async updateTrainerLead() {
        throw new Error('should not update lead');
      }
    },
    dbApi: {},
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(capture.calls[0].status, 400);
  assert.equal(capture.calls[0].body.error, 'Lead id is required.');
});

test('handleTrainerLeadUpdateWithDeps returns 404 when the scoped lead is missing', async () => {
  const capture = createResponseCapture();
  await authRoutes._private.handleTrainerLeadUpdateWithDeps({}, {}, {
    requireTrainerActorFn: async () => ({ id: 'trainer-1' }),
    readJsonBodyFn: async () => ({ leadId: 'lead-404', notes: 'hello' }),
    trainerPagesApi: {
      async updateTrainerLead() {
        return null;
      }
    },
    dbApi: {},
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(capture.calls[0].status, 404);
  assert.equal(capture.calls[0].body.error, 'Lead not found.');
});

test('handleTrainerLeadUpdateWithDeps scopes updates to the authenticated trainer id', async () => {
  const capture = createResponseCapture();
  let updateArgs = null;
  await authRoutes._private.handleTrainerLeadUpdateWithDeps({}, {}, {
    requireTrainerActorFn: async () => ({ id: 'trainer-77' }),
    readJsonBodyFn: async () => ({ leadId: 'lead-1', status: 'Qualified' }),
    trainerPagesApi: {
      async updateTrainerLead(dbApi, trainerUserId, leadId, payload) {
        updateArgs = { dbApi, trainerUserId, leadId, payload };
        return { id: leadId, status: payload.status };
      }
    },
    dbApi: { fake: true },
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(updateArgs.trainerUserId, 'trainer-77');
  assert.equal(updateArgs.leadId, 'lead-1');
  assert.equal(capture.calls[0].status, 200);
  assert.equal(capture.calls[0].body.lead.status, 'Qualified');
});

test('handlePublicTrainerPageEventWithDeps stops before processing when throttled', async () => {
  const capture = createResponseCapture();
  let processed = false;
  await authRoutes._private.handlePublicTrainerPageEventWithDeps({
    headers: { 'x-forwarded-for': '203.0.113.9' }
  }, {}, {
    readJsonBodyFn: async () => ({ siteSlug: 'avery', eventType: 'page_viewed' }),
    trainerPagesApi: {
      async processPublicTrainerPageEvent() {
        processed = true;
        return { automation: {}, publicPage: { page: {} } };
      }
    },
    dbApi: {},
    rateLimitFn: () => ({ ok: false, retryAfterSec: 17 }),
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(processed, false);
  assert.equal(capture.calls[0].status, 429);
  assert.equal(capture.calls[0].body.error, 'Too many page events from this address. Try again shortly.');
});

test('handlePublicTrainerPageGet validates that a coach slug is present', async () => {
  const res = createNodeResponseStub();
  await authRoutes._private.handlePublicTrainerPageGet({}, res, new URL('https://example.test/api/coach/pages/public'));

  assert.equal(res.status, 400);
  assert.equal(res.json().error, 'Coach slug is required.');
});

test('handlePublicTrainerPageGet returns 404 when no published page is found', async () => {
  const res = createNodeResponseStub();
  const original = trainerPages.getPublicTrainerPage;
  trainerPages.getPublicTrainerPage = async () => null;
  try {
    await authRoutes._private.handlePublicTrainerPageGet({}, res, new URL('https://example.test/api/coach/pages/public?siteSlug=avery&pageSlug=apply'));
  } finally {
    trainerPages.getPublicTrainerPage = original;
  }

  assert.equal(res.status, 404);
  assert.equal(res.json().error, 'Published coach page not found.');
});

test('handlePublicTrainerPageGet returns the published payload for a matching page', async () => {
  const res = createNodeResponseStub();
  const original = trainerPages.getPublicTrainerPage;
  const originalNormalizeQualification = trainerPages.normalizeQualificationSettings;
  trainerPages.getPublicTrainerPage = async (dbApi, siteSlug, pageSlug) => ({
    trainer: { id: 'trainer-1', displayName: 'Avery Stone' },
    page: { id: 'page-1', siteSlug, pageSlug, pageName: 'Apply' },
    navigation: [{ id: 'page-1', navLabel: 'Apply', pageSlug, isPublished: true }]
  });
  trainerPages.normalizeQualificationSettings = () => ({ enabled: true, questions: [{ id: 'gender' }] });
  try {
    await authRoutes._private.handlePublicTrainerPageGet({}, res, new URL('https://example.test/api/coach/pages/public?siteSlug=avery&pageSlug=apply'));
  } finally {
    trainerPages.getPublicTrainerPage = original;
    trainerPages.normalizeQualificationSettings = originalNormalizeQualification;
  }

  assert.equal(res.status, 200);
  assert.equal(res.json().ok, true);
  assert.equal(res.json().page.siteSlug, 'avery');
  assert.equal(res.json().page.pageSlug, 'apply');
  assert.equal(res.json().trainer.displayName, 'Avery Stone');
  assert.deepEqual(res.json().qualification, { enabled: true, questions: [{ id: 'gender' }] });
});

test('getUserFromRequest returns null without querying the database when no auth cookie is present', async () => {
  const originalIsConfigured = db.isConfigured;
  const originalQuery = db.query;
  let queryCalls = 0;
  db.isConfigured = () => true;
  db.query = async () => {
    queryCalls += 1;
    throw new Error('db.query should not run without an auth cookie');
  };
  try {
    const user = await authRoutes._private.getUserFromRequest({
      headers: {}
    });
    assert.equal(user, null);
    assert.equal(queryCalls, 0);
  } finally {
    db.isConfigured = originalIsConfigured;
    db.query = originalQuery;
  }
});

test('handlePublicTrainerPageGet returns db unavailable when the public page lookup stalls', async () => {
  const res = createNodeResponseStub();
  const original = trainerPages.getPublicTrainerPage;
  trainerPages.getPublicTrainerPage = async () => new Promise(() => {});
  const startedAt = Date.now();
  try {
    await authRoutes._private.handlePublicTrainerPageGet({}, res, new URL('https://example.test/api/coach/pages/public?siteSlug=avery'));
  } finally {
    trainerPages.getPublicTrainerPage = original;
  }

  const elapsedMs = Date.now() - startedAt;
  assert.equal(res.status, 503);
  assert.equal(res.json().error, 'DB_UNAVAILABLE');
  assert.ok(elapsedMs < 7000, `expected fast failure, got ${elapsedMs}ms`);
});

test('handlePublicTrainerQualificationWithDeps saves qualification progress and completion', async () => {
  const capture = createResponseCapture();
  let saveArgs = null;
  await authRoutes._private.handlePublicTrainerQualificationWithDeps({}, {}, {
    readJsonBodyFn: async () => ({ siteSlug: 'avery', pageSlug: 'apply', sessionKey: 'sess-1', currentStep: 2, completed: true }),
    trainerPagesApi: {
      async upsertPublicQualificationSession(dbApi, payload) {
        saveArgs = { dbApi, payload };
        return {
          session: { id: 'session-1', status: 'completed', currentStep: 2 },
          lead: { id: 'lead-1' },
          automation: {},
          qualification: { enabled: true },
          publicPage: { page: { id: 'page-1', siteSlug: 'avery', pageSlug: 'apply' } }
        };
      }
    },
    dbApi: { fake: true },
    rateLimitFn: () => ({ ok: true, retryAfterSec: 0 }),
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.deepEqual(saveArgs, {
    dbApi: { fake: true },
    payload: { siteSlug: 'avery', pageSlug: 'apply', sessionKey: 'sess-1', currentStep: 2, completed: true }
  });
  assert.equal(capture.calls[0].status, 200);
  assert.equal(capture.calls[0].body.session.id, 'session-1');
  assert.equal(capture.calls[0].body.lead.id, 'lead-1');
  assert.equal(capture.calls[0].body.publicPage.pageId, 'page-1');
});

test('handlePublicTrainerLeadCreateWithDeps stops before creating a lead when throttled', async () => {
  const capture = createResponseCapture();
  let created = false;
  await authRoutes._private.handlePublicTrainerLeadCreateWithDeps({
    headers: { 'x-forwarded-for': '203.0.113.9' }
  }, {}, {
    readJsonBodyFn: async () => ({ siteSlug: 'avery', pageSlug: 'apply', formId: 'lead-form' }),
    trainerPagesApi: {
      async createPublicLead() {
        created = true;
        return { lead: {}, automation: {}, publicPage: { page: {} } };
      }
    },
    dbApi: {},
    rateLimitFn: () => ({ ok: false, retryAfterSec: 23 }),
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.equal(created, false);
  assert.equal(capture.calls[0].status, 429);
  assert.equal(capture.calls[0].body.error, 'Too many lead submissions from this address. Try again shortly.');
});

test('handlePublicTrainerLeadCreateWithDeps creates a scoped public lead when under the limit', async () => {
  const capture = createResponseCapture();
  let createArgs = null;
  await authRoutes._private.handlePublicTrainerLeadCreateWithDeps({}, {}, {
    readJsonBodyFn: async () => ({ siteSlug: 'avery', pageSlug: 'apply', formId: 'lead-form', fullName: 'Avery Prospect' }),
    trainerPagesApi: {
      async createPublicLead(dbApi, payload) {
        createArgs = { dbApi, payload };
        return {
          lead: { id: 'lead-1', fullName: 'Avery Prospect' },
          automation: { redirectTarget: '/coach/avery/book' },
          publicPage: {
            page: { id: 'page-1', siteSlug: 'avery', pageSlug: 'apply' }
          }
        };
      }
    },
    dbApi: { fake: true },
    rateLimitFn: () => ({ ok: true, retryAfterSec: 0 }),
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.deepEqual(createArgs, {
    dbApi: { fake: true },
    payload: { siteSlug: 'avery', pageSlug: 'apply', formId: 'lead-form', fullName: 'Avery Prospect' }
  });
  assert.equal(capture.calls[0].status, 200);
  assert.equal(capture.calls[0].body.lead.id, 'lead-1');
  assert.equal(capture.calls[0].body.automation.redirectTarget, '/coach/avery/book');
  assert.equal(capture.calls[0].body.publicPage.pageId, 'page-1');
});

test('handlePublicTrainerPageEventWithDeps processes public automation events when under the limit', async () => {
  const capture = createResponseCapture();
  let eventArgs = null;
  await authRoutes._private.handlePublicTrainerPageEventWithDeps({}, {}, {
    readJsonBodyFn: async () => ({ siteSlug: 'avery', pageSlug: 'results', eventType: 'button_clicked', eventTarget: '/apply' }),
    trainerPagesApi: {
      async processPublicTrainerPageEvent(dbApi, payload) {
        eventArgs = { dbApi, payload };
        return {
          automation: { redirectTarget: '/coach/avery/thanks' },
          publicPage: {
            page: { id: 'page-1', siteSlug: 'avery', pageSlug: 'results' }
          }
        };
      }
    },
    dbApi: { fake: true },
    rateLimitFn: () => ({ ok: true, retryAfterSec: 0 }),
    sendJsonFn: capture.sendJson.bind(capture)
  });

  assert.deepEqual(eventArgs, {
    dbApi: { fake: true },
    payload: { siteSlug: 'avery', pageSlug: 'results', eventType: 'button_clicked', eventTarget: '/apply' }
  });
  assert.equal(capture.calls[0].status, 200);
  assert.equal(capture.calls[0].body.automation.redirectTarget, '/coach/avery/thanks');
  assert.equal(capture.calls[0].body.publicPage.pageId, 'page-1');
});
