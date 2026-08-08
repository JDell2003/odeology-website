const test = require('node:test');
const assert = require('node:assert/strict');

const trainerPages = require('../core/trainerPages');

function createMockDb(handlers = []) {
  let index = 0;
  return {
    async query(sql, params) {
      const handler = handlers[index];
      index += 1;
      if (!handler) {
        throw new Error(`Unexpected query #${index}: ${String(sql).slice(0, 80)}`);
      }
      if (typeof handler === 'function') {
        return handler(sql, params);
      }
      return handler;
    }
  };
}

test('normalizePagePayload builds a root home page with bounded content', () => {
  const payload = trainerPages.normalizePagePayload({
    siteSlug: 'Coach Jason',
    pageSlug: '',
    pageName: 'Main Landing Page',
    navLabel: 'Start Here',
    mode: 'custom_code',
    seo: {
      title: 'A'.repeat(140),
      description: 'D'.repeat(500)
    },
    draftContent: {
      customCode: {
        html: '<div>Hello</div>',
        css: 'body { color: red; }',
        javascript: 'console.log("ok")'
      },
      forms: [
        {
          id: 'lead-form',
          fields: [
            { id: 'email', type: 'email', label: 'Email', required: true },
            { id: 'budget', type: 'dropdown', options: ['Low', 'Mid', 'High', 'High'] }
          ]
        }
      ]
    }
  }, 'fallback-slug');

  assert.equal(payload.siteSlug, 'coach-jason');
  assert.equal(payload.pageSlug, '');
  assert.equal(payload.isHome, true);
  assert.equal(payload.mode, 'custom_code');
  assert.equal(payload.seo.title.length, 120);
  assert.equal(payload.seo.description.length, 300);
  assert.equal(payload.draftContent.customCode.html, '<div>Hello</div>');
  assert.equal(payload.draftContent.forms.length, 1);
  assert.deepEqual(payload.draftContent.forms[0].fields[1].options, ['Low', 'Mid', 'High']);
  assert.deepEqual(payload.draftContent.forms[0].fields[1].accept, []);
});

test('normalizePagePayload normalizes secondary-page slugs while collapsing legacy page-builder snapshots into the custom-code lane', () => {
  const payload = trainerPages.normalizePagePayload({
    siteSlug: 'my brand',
    pageSlug: 'Weight Loss Results!',
    pageName: 'Weight Loss Results!',
    mode: 'template',
    draftContent: {
      templateKey: 'legacy_weight_loss_page',
      blocks: [
        {
          id: 'hero-1',
          type: 'hero',
          label: 'Hero',
          content: { headline: 'Headline' }
        }
      ]
    }
  }, 'fallback-slug');

  assert.equal(payload.siteSlug, 'my-brand');
  assert.equal(payload.pageSlug, 'weight-loss-results');
  assert.equal(payload.isHome, false);
  assert.equal(payload.navOrder, null);
  assert.equal(payload.mode, 'custom_code');
  assert.equal(Object.prototype.hasOwnProperty.call(payload.draftContent, 'templateKey'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.draftContent, 'blocks'), false);
  assert.match(String(payload.draftContent.customCode.html || ''), /Headline|Weight Loss Results/i);
});

test('normalizePagePayload keeps a non-negative nav order for custom menus', () => {
  const payload = trainerPages.normalizePagePayload({
    siteSlug: 'Coach Jason',
    pageSlug: 'offers',
    pageName: 'Offers',
    navLabel: 'Offers',
    navOrder: -4
  }, 'fallback-slug');

  assert.equal(payload.navOrder, 0);
});

test('normalizePagePayload keeps custom-code drafts free of empty legacy builder fields', () => {
  const payload = trainerPages.normalizePagePayload({
    siteSlug: 'Coach Jason',
    pageSlug: 'apply',
    pageName: 'Apply',
    mode: 'custom_code',
    draftContent: {
      customCode: {
        html: '<section>Apply</section>',
        css: 'body{color:#10283c;}',
        javascript: 'console.log("ready")'
      }
    }
  }, 'fallback-slug');

  assert.equal(payload.mode, 'custom_code');
  assert.equal(payload.draftContent.customCode.html, '<section>Apply</section>');
  assert.equal(Object.prototype.hasOwnProperty.call(payload.draftContent, 'templateKey'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.draftContent, 'theme'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.draftContent, 'blocks'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.draftContent, 'forms'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.draftContent, 'automations'), false);
});

test('buildPublicPath maps root and nested trainer pages', () => {
  assert.equal(trainerPages.buildPublicPath('Coach Jason', ''), '/coach/coach-jason');
  assert.equal(trainerPages.buildPublicPath('Coach Jason', 'book-now'), '/coach/coach-jason/book-now');
});

test('normalizeLeadUploads enforces upload caps and strips oversize entries', () => {
  const uploads = trainerPages.normalizeLeadUploads([
    {
      key: 'progressPhotos',
      files: [
        { name: 'ok.jpg', type: 'image/jpeg', size: 1200, dataUrl: 'data:image/jpeg;base64,abc' },
        { name: 'too-big.jpg', type: 'image/jpeg', size: trainerPages.MAX_LEAD_UPLOAD_SIZE_BYTES + 1, dataUrl: 'data:image/jpeg;base64,def' },
        { name: 'bad.txt', type: 'text/plain', size: 12, dataUrl: 'not-a-data-url' }
      ]
    },
    {
      key: '',
      files: [
        { name: 'skip.jpg', type: 'image/jpeg', size: 100, dataUrl: 'data:image/jpeg;base64,ghi' }
      ]
    }
  ]);

  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].key, 'progressPhotos');
  assert.equal(uploads[0].files.length, 1);
  assert.equal(uploads[0].files[0].name, 'ok.jpg');
});

test('executeTrainerPageAutomationNodes runs trigger sequences and gated actions', () => {
  const page = {
    publishedContent: {
      automations: {
        nodes: [
          { type: 'page_viewed', config: {} },
          { type: 'redirect', config: { target: '/coach/demo/results' } },
          { type: 'form_submitted', config: { target: 'lead-form' } },
          { type: 'field_condition', config: { field: 'goal', operator: 'contains', target: 'fat loss' } },
          { type: 'add_tag', config: { target: 'High intent' } },
          { type: 'change_stage', config: { target: 'Qualified' } },
          { type: 'button_clicked', config: { target: '/apply' } },
          { type: 'redirect', config: { target: 'https://example.com/apply' } }
        ]
      }
    }
  };

  const pageViewed = trainerPages.executeTrainerPageAutomationNodes(page, {
    eventType: 'page_viewed',
    page: { siteSlug: 'demo', pageSlug: '' },
    payload: {}
  });
  assert.equal(pageViewed.redirectTarget, '/coach/demo/results');
  assert.equal(pageViewed.matchedTriggers, 1);

  const submitted = trainerPages.executeTrainerPageAutomationNodes(page, {
    eventType: 'form_submitted',
    page: { siteSlug: 'demo', pageSlug: '' },
    payload: { formId: 'lead-form', answers: { goal: 'fat loss and strength' } },
    lead: { formId: 'lead-form' }
  });
  assert.deepEqual(submitted.tagsAdded, ['High intent']);
  assert.equal(submitted.stageChangedTo, 'Qualified');
  assert.equal(submitted.redirectTarget, '');
  assert.equal(submitted.conditions[0]?.result, true);

  const clicked = trainerPages.executeTrainerPageAutomationNodes(page, {
    eventType: 'button_clicked',
    eventTarget: '/apply',
    page: { siteSlug: 'demo', pageSlug: '' },
    payload: {}
  });
  assert.equal(clicked.redirectTarget, 'https://example.com/apply');
});

test('executeTrainerPageAutomationNodes captures offer, notifications, delays, integrations, and lead-upsert intents', () => {
  const page = {
    publishedContent: {
      automations: {
        nodes: [
          { type: 'form_submitted', config: { target: 'lead-form' } },
          { type: 'assign_offer', config: { target: 'High Ticket Coaching' } },
          { type: 'notify_trainer', config: { target: 'New high-intent lead' } },
          { type: 'email', config: { target: 'trainer@example.com' } },
          { type: 'webhook', config: { target: 'https://hooks.example.com/trainer' } },
          { type: 'wait_delay', config: { target: '2 days' } },
          { type: 'google_sheets', config: { target: 'Leads Sheet' } },
          { type: 'google_calendar', config: { target: 'Consult Calendar' } },
          { type: 'create_update_lead', config: {} }
        ]
      }
    }
  };

  const summary = trainerPages.executeTrainerPageAutomationNodes(page, {
    eventType: 'form_submitted',
    page: { siteSlug: 'demo', pageSlug: 'apply' },
    payload: { formId: 'lead-form', answers: { email: 'lead@example.com' } },
    lead: { formId: 'lead-form', email: 'lead@example.com' }
  });

  assert.equal(summary.assignedOffer, 'High Ticket Coaching');
  assert.deepEqual(summary.notifications, ['New high-intent lead']);
  assert.deepEqual(summary.emails, ['trainer@example.com']);
  assert.deepEqual(summary.webhooks, ['https://hooks.example.com/trainer']);
  assert.deepEqual(summary.delays, ['2 days']);
  assert.equal(summary.integrations.length, 2);
  assert.deepEqual(summary.integrations.map((entry) => entry.type), ['google_sheets', 'google_calendar']);
  assert.equal(summary.createOrUpdateLead, true);
});

test('executeTrainerPageAutomationNodes honors if/else branching after field conditions', () => {
  const page = {
    publishedContent: {
      automations: {
        nodes: [
          { type: 'form_submitted', config: { target: 'lead-form' } },
          { type: 'field_condition', config: { field: 'goal', operator: 'contains', target: 'fat loss' } },
          { type: 'if_else', config: { target: 'if' } },
          { type: 'add_tag', config: { target: 'Cutting track' } },
          { type: 'change_stage', config: { target: 'Qualified' } },
          { type: 'if_else', config: { target: 'else' } },
          { type: 'add_tag', config: { target: 'General inquiry' } },
          { type: 'change_stage', config: { target: 'Contacted' } }
        ]
      }
    }
  };

  const matched = trainerPages.executeTrainerPageAutomationNodes(page, {
    eventType: 'form_submitted',
    page: { siteSlug: 'demo', pageSlug: 'apply' },
    payload: { formId: 'lead-form', answers: { goal: 'fat loss with accountability' } },
    lead: { formId: 'lead-form' }
  });
  assert.deepEqual(matched.tagsAdded, ['Cutting track']);
  assert.equal(matched.stageChangedTo, 'Qualified');
  assert.equal(matched.conditions[0]?.result, true);

  const unmatched = trainerPages.executeTrainerPageAutomationNodes(page, {
    eventType: 'form_submitted',
    page: { siteSlug: 'demo', pageSlug: 'apply' },
    payload: { formId: 'lead-form', answers: { goal: 'strength and muscle' } },
    lead: { formId: 'lead-form' }
  });
  assert.deepEqual(unmatched.tagsAdded, ['General inquiry']);
  assert.equal(unmatched.stageChangedTo, 'Contacted');
  assert.equal(unmatched.conditions[0]?.result, false);
});

test('normalizePagePayload preserves upload field accept lists and multiple metadata', () => {
  const payload = trainerPages.normalizePagePayload({
    siteSlug: 'Coach Jason',
    pageSlug: 'apply',
    pageName: 'Apply',
    draftContent: {
      forms: [
        {
          id: 'application',
          fields: [
            {
              id: 'photos',
              name: 'photos',
              label: 'Photos',
              type: 'photo',
              accept: ['image/*', 'image/png', 'image/*'],
              meta: { multiple: true }
            }
          ]
        }
      ]
    }
  }, 'fallback-slug');

  const field = payload.draftContent.forms[0].fields[0];
  assert.equal(field.type, 'photo');
  assert.deepEqual(field.accept, ['image/*', 'image/png']);
  assert.equal(field.meta.multiple, true);
});

test('normalizePagePayload preserves the full required builder field and automation type surface', () => {
  const payload = trainerPages.normalizePagePayload({
    siteSlug: 'Coach Jason',
    pageSlug: 'intake',
    pageName: 'Intake',
    draftContent: {
      forms: [
        {
          id: 'application',
          fields: [
            { id: 'name', name: 'name', label: 'Name', type: 'text' },
            { id: 'email', name: 'email', label: 'Email', type: 'email' },
            { id: 'phone', name: 'phone', label: 'Phone', type: 'tel' },
            { id: 'budget', name: 'budget', label: 'Budget', type: 'number' },
            { id: 'availability', name: 'availability', label: 'Availability', type: 'date' },
            { id: 'goal', name: 'goal', label: 'Goal', type: 'textarea' },
            { id: 'injuries', name: 'injuries', label: 'Injuries', type: 'long_text' },
            { id: 'coachingType', name: 'coachingType', label: 'Coaching type', type: 'dropdown', options: ['Remote', 'Hybrid'] },
            { id: 'experience', name: 'experience', label: 'Experience', type: 'radio', options: ['Beginner', 'Intermediate'] },
            { id: 'days', name: 'days', label: 'Days', type: 'checkbox', options: ['Mon', 'Wed'] },
            { id: 'attachments', name: 'attachments', label: 'Attachments', type: 'file', accept: ['application/pdf'] },
            { id: 'photos', name: 'photos', label: 'Photos', type: 'photo', meta: { multiple: true } },
            { id: 'uploads', name: 'uploads', label: 'Uploads', type: 'upload', accept: ['image/*', 'application/pdf'] }
          ]
        }
      ],
      automations: {
        nodes: [
          { id: 'n1', type: 'form_submitted' },
          { id: 'n2', type: 'button_clicked' },
          { id: 'n3', type: 'page_viewed' },
          { id: 'n4', type: 'field_condition' },
          { id: 'n5', type: 'if_else' },
          { id: 'n6', type: 'add_tag' },
          { id: 'n7', type: 'create_update_lead' },
          { id: 'n8', type: 'assign_offer' },
          { id: 'n9', type: 'change_stage' },
          { id: 'n10', type: 'redirect' },
          { id: 'n11', type: 'notify_trainer' },
          { id: 'n12', type: 'email' },
          { id: 'n13', type: 'wait_delay' },
          { id: 'n14', type: 'webhook' },
          { id: 'n15', type: 'google_sheets' },
          { id: 'n16', type: 'google_calendar' }
        ]
      }
    }
  }, 'fallback-slug');

  const fieldTypes = payload.draftContent.forms[0].fields.map((field) => field.type);
  assert.deepEqual(fieldTypes, [
    'text',
    'email',
    'tel',
    'number',
    'date',
    'textarea',
    'long_text',
    'dropdown',
    'radio',
    'checkbox',
    'file',
    'photo',
    'upload'
  ]);

  const automationTypes = payload.draftContent.automations.nodes.map((node) => node.type);
  assert.deepEqual(automationTypes, [
    'form_submitted',
    'button_clicked',
    'page_viewed',
    'field_condition',
    'if_else',
    'add_tag',
    'create_update_lead',
    'assign_offer',
    'change_stage',
    'redirect',
    'notify_trainer',
    'email',
    'wait_delay',
    'webhook',
    'google_sheets',
    'google_calendar'
  ]);
});

test('saveTrainerPage enforces the 5 page limit before insert', async () => {
  const db = createMockDb([
    { rows: [{ username: 'coach', display_name: 'Coach', meta: {} }] },
    { rows: [{ site_slug: 'coach' }] },
    { rows: [] },
    { rows: [] },
    {
      rows: Array.from({ length: trainerPages.MAX_TRAINER_PAGES }, (_, index) => ({
        id: `page-${index}`,
        trainer_user_id: 'trainer-1',
        site_slug: 'coach',
        page_slug: `page-${index}`,
        page_name: `Page ${index}`,
        nav_label: `Page ${index}`,
        nav_order: index,
        mode: 'template',
        is_home: index === 0,
        is_published: false,
        seo: {},
        settings: {},
        draft_content: {},
        published_content: {},
        created_at: null,
        updated_at: null,
        published_at: null
      }))
    }
  ]);

  await assert.rejects(
    trainerPages.saveTrainerPage(db, 'trainer-1', {
      pageName: 'Overflow',
      pageSlug: 'overflow',
      siteSlug: 'coach'
    }),
    /Only 5 trainer pages are allowed per account/
  );
});

test('saveTrainerPage rejects duplicate page slugs on the same coach site', async () => {
  const db = createMockDb([
    { rows: [{ username: 'coach', display_name: 'Coach', meta: {} }] },
    { rows: [{ site_slug: 'coach' }] },
    { rows: [] },
    { rows: [] },
    {
      rows: [{
        id: 'page-1',
        trainer_user_id: 'trainer-1',
        site_slug: 'coach',
        page_slug: 'offers',
        page_name: 'Offers',
        nav_label: 'Offers',
        nav_order: 0,
        mode: 'template',
        is_home: false,
        is_published: false,
        seo: {},
        settings: {},
        draft_content: {},
        published_content: {},
        created_at: null,
        updated_at: null,
        published_at: null
      }]
    }
  ]);

  await assert.rejects(
    trainerPages.saveTrainerPage(db, 'trainer-1', {
      pageName: 'Offers Copy',
      pageSlug: 'offers',
      siteSlug: 'coach'
    }),
    /page slug is already in use/
  );
});

test('saveTrainerPage rejects a public coach site slug already owned by another trainer', async () => {
  const db = createMockDb([
    { rows: [{ username: 'coach', display_name: 'Coach', meta: {} }] },
    { rows: [{ site_slug: 'coach' }] },
    { rows: [{ trainer_user_id: 'trainer-2' }] },
    { rows: [] }
  ]);

  await assert.rejects(
    trainerPages.saveTrainerPage(db, 'trainer-1', {
      pageName: 'Home',
      pageSlug: '',
      siteSlug: 'coach'
    }),
    /public coach slug is already taken/
  );
});

test('saveTrainerPage rejects a second home page on the same coach site', async () => {
  const db = createMockDb([
    { rows: [{ username: 'coach', display_name: 'Coach', meta: {} }] },
    { rows: [{ site_slug: 'coach' }] },
    { rows: [] },
    { rows: [] },
    {
      rows: [{
        id: 'home-1',
        trainer_user_id: 'trainer-1',
        site_slug: 'coach',
        page_slug: '',
        page_name: 'Home',
        nav_label: 'Home',
        nav_order: 0,
        mode: 'template',
        is_home: true,
        is_published: true,
        seo: {},
        settings: {},
        draft_content: {},
        published_content: {},
        created_at: null,
        updated_at: null,
        published_at: null
      }]
    }
  ]);

  await assert.rejects(
    trainerPages.saveTrainerPage(db, 'trainer-1', {
      pageName: 'New Home',
      pageSlug: '',
      siteSlug: 'coach',
      isHome: true
    }),
    /already has a home page/
  );
});

test('publishTrainerPage copies draft content into published content and records a version', async () => {
  const draftContent = { mode: 'template', theme: { headline: 'Hello' } };
  const updatedRow = {
    id: 'page-1',
    trainer_user_id: 'trainer-1',
    site_slug: 'coach',
    page_slug: '',
    page_name: 'Home',
    nav_label: 'Home',
    nav_order: 0,
    mode: 'template',
    is_home: true,
    is_published: true,
    seo: {},
    settings: {},
    draft_content: draftContent,
    published_content: draftContent,
    created_at: null,
    updated_at: null,
    published_at: '2026-06-16T00:00:00Z'
  };
  let publishParams = null;
  const db = createMockDb([
    { rows: [{ ...updatedRow, is_published: false, published_content: {} }] },
    (sql, params) => {
      publishParams = params;
      return { rows: [updatedRow] };
    },
    { rows: [] }
  ]);

  const page = await trainerPages.publishTrainerPage(db, 'trainer-1', 'page-1');
  assert.equal(publishParams[0], 'trainer-1');
  assert.equal(publishParams[1], 'page-1');
  assert.equal(page.isPublished, true);
  assert.equal(Object.prototype.hasOwnProperty.call(page.publishedContent, 'theme'), false);
  assert.match(String(page.publishedContent.customCode.html || ''), /Hello/);
});

test('unpublishTrainerPage throws when the trainer does not own the page', async () => {
  const db = createMockDb([
    { rows: [] }
  ]);

  await assert.rejects(
    trainerPages.unpublishTrainerPage(db, 'trainer-1', 'missing-page'),
    /Trainer page not found/
  );
});

test('sample page payloads normalize cleanly while preserving legacy page-builder and drag-drop content in the custom-code lane', () => {
  const templatePage = trainerPages.normalizePagePayload({
    siteSlug: 'Coach Avery',
    pageSlug: '',
    pageName: 'Home',
    mode: 'template',
    draftContent: {
      templateKey: 'legacy_online_coaching_page',
      theme: {
        headline: 'Online coaching for busy professionals',
        subheadline: 'Simple structure, steady accountability.',
        body: 'Training, nutrition, and check-ins built around your actual week.',
        ctaLabel: 'Apply now'
      },
      forms: [
        {
          id: 'consult',
          fields: [
            { id: 'name', name: 'name', type: 'text', label: 'Name', required: true },
            { id: 'goal', name: 'goal', type: 'long_text', label: 'Goal', required: false }
          ]
        }
      ]
    }
  }, 'fallback');

  const dragDropPage = trainerPages.normalizePagePayload({
    siteSlug: 'Coach Avery',
    pageSlug: 'results',
    pageName: 'Results',
    mode: 'drag_drop',
    draftContent: {
      blocks: [
        { id: 'hero-1', type: 'hero', content: { headline: 'Real client transformations', ctaLabel: 'Start here', ctaHref: '/coach/coach-avery/apply' } },
        { id: 'proof-1', type: 'before_after', content: { items: ['Client A', 'Client B'] } },
        { id: 'faq-1', type: 'faq', content: { items: ['How it works', 'Pricing'] } }
      ]
    }
  }, 'fallback');

  const customCodePage = trainerPages.normalizePagePayload({
    siteSlug: 'Coach Avery',
    pageSlug: 'book',
    pageName: 'Book',
    mode: 'custom_code',
    draftContent: {
      customCode: {
        html: '<section><h1>Book a consult</h1></section>',
        css: 'h1 { color: #123456; }',
        javascript: 'window.customReady = true;',
        iframes: [{ src: 'https://calendar.example.com/embed' }],
        embedScripts: [{ src: 'https://widgets.example.com/form.js' }]
      }
    }
  }, 'fallback');

  assert.equal(templatePage.mode, 'custom_code');
  assert.equal(Object.prototype.hasOwnProperty.call(templatePage.draftContent, 'templateKey'), false);
  assert.equal(templatePage.draftContent.forms[0].fields[1].type, 'long_text');
  assert.match(String(templatePage.draftContent.customCode.html || ''), /Online coaching for busy professionals/);

  assert.equal(dragDropPage.mode, 'custom_code');
  assert.equal(Object.prototype.hasOwnProperty.call(dragDropPage.draftContent, 'blocks'), false);
  assert.match(String(dragDropPage.draftContent.customCode.html || ''), /Real client transformations/);

  assert.equal(customCodePage.mode, 'custom_code');
  assert.equal(customCodePage.draftContent.customCode.iframes.length, 1);
  assert.equal(customCodePage.draftContent.customCode.embedScripts.length, 1);
});

test('getPublicTrainerPage returns the published page and published navigation only', async () => {
  const db = createMockDb([
    {
      rows: [{
        id: 'page-home',
        trainer_user_id: 'trainer-1',
        site_slug: 'coach-avery',
        page_slug: '',
        page_name: 'Home',
        nav_label: 'Home',
        nav_order: 0,
        mode: 'template',
        is_home: true,
        is_published: true,
        seo: {},
        settings: {},
        draft_content: { theme: { headline: 'Draft only' } },
        published_content: { theme: { headline: 'Published home' } },
        created_at: null,
        updated_at: null,
        published_at: '2026-06-16T00:00:00Z',
        username: 'avery',
        display_name: 'Avery',
        full_name: 'Avery Stone',
        contact_email: 'avery@example.com',
        meta: {}
      }]
    },
    {
      rows: [
        {
          id: 'page-home',
          site_slug: 'coach-avery',
          page_slug: '',
          page_name: 'Home',
          nav_label: 'Home',
          nav_order: 0,
          is_home: true,
          mode: 'template',
          is_published: true,
          published_at: '2026-06-16T00:00:00Z'
        },
        {
          id: 'page-results',
          site_slug: 'coach-avery',
          page_slug: 'results',
          page_name: 'Results',
          nav_label: 'Results',
          nav_order: 1,
          is_home: false,
          mode: 'drag_drop',
          is_published: true,
          published_at: '2026-06-16T00:00:00Z'
        }
      ]
    }
  ]);

  const payload = await trainerPages.getPublicTrainerPage(db, 'Coach Avery', '');
  assert.equal(payload.page.siteSlug, 'coach-avery');
  assert.equal(payload.page.isPublished, true);
  assert.equal(Object.prototype.hasOwnProperty.call(payload.page.publishedContent, 'theme'), false);
  assert.match(String(payload.page.publishedContent.customCode.html || ''), /Published home/);
  assert.equal(payload.navigation.length, 2);
  assert.deepEqual(payload.navigation.map((entry) => entry.pageSlug), ['', 'results']);
});

test('getPublicTrainerPage returns null when the requested page is not published', async () => {
  const db = createMockDb([
    { rows: [] }
  ]);

  const payload = await trainerPages.getPublicTrainerPage(db, 'Coach Avery', 'draft-only');
  assert.equal(payload, null);
});

test('processPublicTrainerPageEvent executes against published automation content', async () => {
  const db = createMockDb([
    {
      rows: [{
        id: 'page-home',
        trainer_user_id: 'trainer-1',
        site_slug: 'coach-avery',
        page_slug: '',
        page_name: 'Home',
        nav_label: 'Home',
        nav_order: 0,
        mode: 'template',
        is_home: true,
        is_published: true,
        seo: {},
        settings: {},
        draft_content: {
          automations: {
            nodes: [
              { type: 'page_viewed', config: {} },
              { type: 'redirect', config: { target: '/draft-should-not-run' } }
            ]
          }
        },
        published_content: {
          automations: {
            nodes: [
              { type: 'page_viewed', config: {} },
              { type: 'redirect', config: { target: '/published-result' } }
            ]
          }
        },
        created_at: null,
        updated_at: null,
        published_at: '2026-06-16T00:00:00Z',
        username: 'avery',
        display_name: 'Avery',
        full_name: 'Avery Stone',
        contact_email: 'avery@example.com',
        meta: {}
      }]
    },
    { rows: [] }
  ]);

  const result = await trainerPages.processPublicTrainerPageEvent(db, {
    siteSlug: 'coach-avery',
    pageSlug: '',
    eventType: 'page_viewed'
  });

  assert.equal(result.publicPage.page.id, 'page-home');
  assert.equal(result.automation.redirectTarget, '/published-result');
  assert.equal(result.automation.matchedTriggers, 1);
});

test('updateTrainerLead can clear notes and returns refreshed recent events', async () => {
  const db = createMockDb([
    {
      rows: [{
        id: 'lead-1',
        trainer_user_id: 'trainer-1',
        page_id: 'page-1',
        source_site_slug: 'avery',
        source_page_slug: 'apply',
        source_page_name: 'Apply',
        form_id: 'qualify',
        status: 'Contacted',
        tag_list: ['Warm'],
        full_name: 'Taylor Lead',
        email: 'taylor@example.com',
        phone: '555-0100',
        goal: 'Fat loss',
        budget: '300+',
        location: 'Miami',
        coaching_type: 'Online',
        availability: 'Mornings',
        injuries: '',
        notes: 'Old note',
        answers: {},
        uploads: [],
        meta: {},
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-01T00:00:00Z'
      }]
    },
    {
      rows: [{
        id: 'lead-1',
        trainer_user_id: 'trainer-1',
        page_id: 'page-1',
        source_site_slug: 'avery',
        source_page_slug: 'apply',
        source_page_name: 'Apply',
        form_id: 'qualify',
        status: 'Qualified',
        tag_list: ['Hot'],
        full_name: 'Taylor Lead',
        email: 'taylor@example.com',
        phone: '555-0100',
        goal: 'Fat loss',
        budget: '300+',
        location: 'Miami',
        coaching_type: 'Online',
        availability: 'Mornings',
        injuries: '',
        notes: '',
        answers: {},
        uploads: [],
        meta: {},
        created_at: '2026-06-01T00:00:00Z',
        updated_at: '2026-06-02T00:00:00Z'
      }]
    },
    { rows: [] },
    {
      rows: [{
        lead_id: 'lead-1',
        event_type: 'updated',
        details: { status: 'Qualified', notes: '', tags: ['Hot'] },
        created_at: '2026-06-02T00:00:00Z'
      }]
    }
  ]);

  const lead = await trainerPages.updateTrainerLead(db, 'trainer-1', 'lead-1', {
    status: 'Qualified',
    notes: '',
    tags: ['Hot']
  });

  assert.equal(lead.status, 'Qualified');
  assert.equal(lead.notes, '');
  assert.deepEqual(lead.tags, ['Hot']);
  assert.equal(Array.isArray(lead.recentEvents), true);
  assert.equal(lead.recentEvents.length, 1);
  assert.equal(lead.recentEvents[0].eventType, 'updated');
  assert.deepEqual(lead.recentEvents[0].details.tags, ['Hot']);
});

test('createPublicLead records delay, integration, and lead-upsert automation activity', async () => {
  const eventTypes = [];
  const db = {
    async query(sql, params) {
      const text = String(sql);
      if (text.includes('FROM app_trainer_pages p') && text.includes('JOIN app_users u') && text.includes('LEFT JOIN app_trainer_profiles tp')) {
        return {
          rows: [{
            id: 'page-apply',
            trainer_user_id: 'trainer-1',
            site_slug: 'avery',
            page_slug: 'apply',
            page_name: 'Apply',
            nav_label: 'Apply',
            nav_order: 0,
            mode: 'template',
            is_home: false,
            is_published: true,
            seo: {},
            settings: {},
            draft_content: {},
            published_content: {
              automations: {
                nodes: [
                  { type: 'form_submitted', config: { target: 'qualify' } },
                  { type: 'wait_delay', config: { target: '2 days' } },
                  { type: 'google_sheets', config: { target: 'Leads Sheet' } },
                  { type: 'create_update_lead', config: {} }
                ]
              }
            },
            created_at: null,
            updated_at: null,
            published_at: '2026-06-16T00:00:00Z',
            username: 'avery',
            display_name: 'Avery',
            full_name: 'Avery Stone',
            contact_email: 'avery@example.com',
            meta: {}
          }]
        };
      }
      if (text.includes('FROM app_trainer_pages') && text.includes('ORDER BY nav_order ASC')) {
        return { rows: [] };
      }
      if (text.includes('FROM app_trainer_page_leads') && text.includes('ORDER BY updated_at DESC')) {
        return { rows: [] };
      }
      if (text.includes('INSERT INTO app_trainer_page_leads')) {
        return {
          rows: [{
            id: 'lead-9',
            trainer_user_id: 'trainer-1',
            page_id: 'page-apply',
            source_site_slug: 'avery',
            source_page_slug: 'apply',
            source_page_name: 'Apply',
            form_id: 'qualify',
            status: 'New Lead',
            tag_list: [],
            full_name: 'Jordan Lead',
            email: 'jordan@example.com',
            phone: '',
            goal: '',
            budget: '',
            location: '',
            coaching_type: '',
            availability: '',
            injuries: '',
            notes: '',
            answers: {},
            uploads: [],
            meta: {},
            created_at: '2026-06-01T00:00:00Z',
            updated_at: '2026-06-01T00:00:00Z'
          }]
        };
      }
      if (text.includes('UPDATE app_trainer_page_leads')) {
        return {
          rows: [{
            id: 'lead-9',
            trainer_user_id: 'trainer-1',
            page_id: 'page-apply',
            source_site_slug: 'avery',
            source_page_slug: 'apply',
            source_page_name: 'Apply',
            form_id: 'qualify',
            status: 'New Lead',
            tag_list: [],
            full_name: 'Jordan Lead',
            email: 'jordan@example.com',
            phone: '',
            goal: '',
            budget: '',
            location: '',
            coaching_type: '',
            availability: '',
            injuries: '',
            notes: '',
            answers: {},
            uploads: [],
            meta: JSON.parse(params[4]),
            created_at: '2026-06-01T00:00:00Z',
            updated_at: '2026-06-02T00:00:00Z'
          }]
        };
      }
      if (text.includes('INSERT INTO app_trainer_page_lead_events')) {
        if (text.includes(`'submitted'`)) eventTypes.push('submitted');
        else eventTypes.push(params[2]);
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${text.slice(0, 120)}`);
    }
  };

  const result = await trainerPages.createPublicLead(db, {
    siteSlug: 'avery',
    pageSlug: 'apply',
    formId: 'qualify',
    fullName: 'Jordan Lead',
    email: 'jordan@example.com'
  });

  assert.equal(result.lead.meta.automationCreateOrUpdateLead, true);
  assert.deepEqual(result.lead.meta.automationDelays, ['2 days']);
  assert.equal(result.lead.meta.automationIntegrations.length, 1);
  assert.deepEqual(eventTypes, [
    'submitted',
    'automation_wait_delay',
    'automation_integration',
    'automation_create_update_lead'
  ]);
});

test('createPublicLead treats a phone-only match with a different email as a new person', async () => {
  // The default consult capture makes a phone mandatory for every visitor, so
  // shared/junk phone collisions are routine: an update here would overwrite
  // the earlier lead's name and email with the new submitter's.
  let inserted = false;
  let updated = false;
  const db = {
    async query(sql, params) {
      const text = String(sql);
      if (text.includes('FROM app_trainer_pages p') && text.includes('JOIN app_users u') && text.includes('LEFT JOIN app_trainer_profiles tp')) {
        return {
          rows: [{
            id: 'page-home',
            trainer_user_id: 'trainer-1',
            site_slug: 'avery',
            page_slug: '',
            page_name: 'Home',
            nav_label: 'Home',
            nav_order: 0,
            mode: 'custom_code',
            is_home: true,
            is_published: true,
            seo: {},
            settings: {},
            draft_content: {},
            published_content: {},
            created_at: null,
            updated_at: null,
            published_at: '2026-06-16T00:00:00Z',
            username: 'avery',
            display_name: 'Avery',
            full_name: 'Avery Stone',
            contact_email: 'avery@example.com',
            meta: {}
          }]
        };
      }
      if (text.includes('FROM app_trainer_pages') && text.includes('ORDER BY nav_order ASC')) {
        return { rows: [] };
      }
      if (text.includes('FROM app_trainer_page_leads') && text.includes('ORDER BY updated_at DESC')) {
        // Existing lead that collides on PHONE but belongs to someone else.
        return {
          rows: [{
            id: 'lead-first-person',
            trainer_user_id: 'trainer-1',
            email: 'a@x.com',
            phone: '5550109999',
            full_name: 'Person A',
            status: 'New Lead',
            tag_list: [],
            answers: {},
            uploads: [],
            meta: {}
          }]
        };
      }
      if (text.includes('UPDATE app_trainer_page_leads')) {
        // Only the dedupe branch rewrites identity fields; the harmless
        // post-insert automation-summary update (status/tags/meta) is not it.
        if (text.includes('full_name = CASE WHEN')) {
          updated = true;
          return { rows: [{ id: 'lead-first-person', trainer_user_id: 'trainer-1', answers: {}, uploads: [], meta: {}, tag_list: [] }] };
        }
        return {
          rows: [{
            id: 'lead-second-person',
            trainer_user_id: 'trainer-1',
            page_id: 'page-home',
            source_site_slug: 'avery',
            source_page_slug: '',
            source_page_name: 'Home',
            form_id: 'consult-capture',
            status: 'New Lead',
            tag_list: [],
            full_name: 'Person B',
            email: 'b@y.com',
            phone: '5550109999',
            goal: '',
            budget: '',
            location: '',
            coaching_type: '',
            availability: '',
            injuries: '',
            answers: {},
            uploads: [],
            meta: {},
            created_at: '2026-08-08T00:00:00Z',
            updated_at: '2026-08-08T00:00:00Z'
          }]
        };
      }
      if (text.includes('INSERT INTO app_trainer_page_leads')) {
        inserted = true;
        return {
          rows: [{
            id: 'lead-second-person',
            trainer_user_id: 'trainer-1',
            page_id: 'page-home',
            source_site_slug: 'avery',
            source_page_slug: '',
            source_page_name: 'Home',
            form_id: 'consult-capture',
            status: 'New Lead',
            tag_list: [],
            full_name: params[8],
            email: params[9],
            phone: params[10],
            goal: '',
            budget: '',
            location: '',
            coaching_type: '',
            availability: '',
            injuries: '',
            answers: {},
            uploads: [],
            meta: {},
            created_at: '2026-08-08T00:00:00Z',
            updated_at: '2026-08-08T00:00:00Z'
          }]
        };
      }
      if (text.includes('INSERT INTO app_trainer_page_lead_events')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${text.slice(0, 120)}`);
    }
  };

  const result = await trainerPages.createPublicLead(db, {
    siteSlug: 'avery',
    formId: 'consult-capture',
    fullName: 'Person B',
    email: 'b@y.com',
    phone: '555 010 9999',
    answers: { first_name: 'Person', last_name: 'B' }
  });

  assert.equal(inserted, true);
  assert.equal(updated, false);
  assert.equal(result.lead.id, 'lead-second-person');
  assert.equal(result.lead.email, 'b@y.com');
});

test('upsertPublicQualificationSession stores progress and completes into a qualified lead', async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      const text = String(sql);
      queries.push(text);
      if (text.includes('FROM app_trainer_pages p') && text.includes('JOIN app_users u') && text.includes('LEFT JOIN app_trainer_profiles tp')) {
        return {
          rows: [{
            id: 'page-apply',
            trainer_user_id: 'trainer-1',
            site_slug: 'avery',
            page_slug: 'apply',
            page_name: 'Apply',
            nav_label: 'Apply',
            nav_order: 0,
            mode: 'template',
            is_home: false,
            is_published: true,
            seo: {},
            settings: { qualification: { enabled: true } },
            draft_content: {},
            published_content: { automations: { nodes: [] } },
            created_at: null,
            updated_at: null,
            published_at: '2026-06-16T00:00:00Z',
            username: 'avery',
            display_name: 'Avery',
            full_name: 'Avery Stone',
            contact_email: 'avery@example.com',
            meta: {}
          }]
        };
      }
      if (text.includes('FROM app_trainer_pages') && text.includes('ORDER BY nav_order ASC')) {
        return { rows: [] };
      }
      if (text.includes('INSERT INTO app_trainer_page_qualification_sessions')) {
        return {
          rows: [{
            id: 'qual-session-1',
            trainer_user_id: 'trainer-1',
            page_id: 'page-apply',
            source_site_slug: 'avery',
            source_page_slug: 'apply',
            session_key: 'session-1',
            visitor_email: 'jordan@example.com',
            visitor_phone: '+15551234567',
            lead_id: null,
            status: params[11] ? 'completed' : 'draft',
            current_step: 2,
            answers: {
              gender: 'Male',
              email: 'jordan@example.com',
              name_and_phone: {
                full_name: 'Jordan Lead',
                phone: '+15551234567'
              }
            },
            meta: {},
            created_at: '2026-06-16T00:00:00Z',
            updated_at: '2026-06-16T00:00:00Z',
            completed_at: params[11] ? '2026-06-16T00:00:00Z' : null
          }]
        };
      }
      if (text.includes('FROM app_trainer_page_leads') && text.includes('ORDER BY updated_at DESC')) {
        return { rows: [] };
      }
      if (text.includes('INSERT INTO app_trainer_page_leads')) {
        return {
          rows: [{
            id: 'lead-qualified-1',
            trainer_user_id: 'trainer-1',
            page_id: 'page-apply',
            source_site_slug: 'avery',
            source_page_slug: 'apply',
            source_page_name: 'Apply',
            form_id: 'qualification-gate',
            status: 'Qualified',
            tag_list: ['Qualified'],
            full_name: 'Jordan Lead',
            email: 'jordan@example.com',
            phone: '+15551234567',
            goal: '',
            budget: '',
            location: '',
            coaching_type: '',
            availability: '',
            injuries: '',
            notes: '',
            answers: {},
            uploads: [],
            meta: { qualificationRequired: true },
            created_at: '2026-06-16T00:00:00Z',
            updated_at: '2026-06-16T00:00:00Z'
          }]
        };
      }
      if (text.includes('UPDATE app_trainer_page_leads')) {
        return {
          rows: [{
            id: 'lead-qualified-1',
            trainer_user_id: 'trainer-1',
            page_id: 'page-apply',
            source_site_slug: 'avery',
            source_page_slug: 'apply',
            source_page_name: 'Apply',
            form_id: 'qualification-gate',
            status: 'Qualified',
            tag_list: ['Qualified', 'Trainer page'],
            full_name: 'Jordan Lead',
            email: 'jordan@example.com',
            phone: '+15551234567',
            goal: '',
            budget: '',
            location: '',
            coaching_type: '',
            availability: '',
            injuries: '',
            notes: '',
            answers: {},
            uploads: [],
            meta: JSON.parse(params[4]),
            created_at: '2026-06-16T00:00:00Z',
            updated_at: '2026-06-16T00:00:00Z'
          }]
        };
      }
      if (text.includes('UPDATE app_trainer_page_qualification_sessions') && text.includes('SET lead_id = $2')) {
        return {
          rows: [{
            id: 'qual-session-1',
            trainer_user_id: 'trainer-1',
            page_id: 'page-apply',
            source_site_slug: 'avery',
            source_page_slug: 'apply',
            session_key: 'session-1',
            visitor_email: 'jordan@example.com',
            visitor_phone: '+15551234567',
            lead_id: 'lead-qualified-1',
            status: 'completed',
            current_step: 2,
            answers: {},
            meta: {},
            created_at: '2026-06-16T00:00:00Z',
            updated_at: '2026-06-16T00:00:00Z',
            completed_at: '2026-06-16T00:00:00Z'
          }]
        };
      }
      if (text.includes('INSERT INTO app_trainer_page_lead_events')) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${text.slice(0, 140)}`);
    }
  };

  const result = await trainerPages.upsertPublicQualificationSession(db, {
    siteSlug: 'avery',
    pageSlug: 'apply',
    sessionKey: 'session-1',
    currentStep: 2,
    completed: true,
    answers: {
      gender: 'Male',
      email: 'jordan@example.com',
      name_and_phone: {
        full_name: 'Jordan Lead',
        phone: '+15551234567'
      }
    }
  });

  assert.equal(result.session.leadId, 'lead-qualified-1');
  assert.equal(result.lead.id, 'lead-qualified-1');
  assert.equal(result.qualification.enabled, true);
  assert.ok(queries.some((entry) => entry.includes('INSERT INTO app_trainer_page_qualification_sessions')));
});

test('upsertPublicQualificationSession can resolve a trainer by fallback public handle when no published page exists', async () => {
  const queries = [];
  const db = {
    async query(sql, params) {
      const text = String(sql);
      queries.push(text);
      if (text.includes('FROM app_trainer_pages p') && text.includes('JOIN app_users u') && text.includes('LEFT JOIN app_trainer_profiles tp')) {
        return { rows: [] };
      }
      if (text.includes('LEFT JOIN LATERAL') && text.includes("tp.meta->>'publicHandle'")) {
        return {
          rows: [{
            trainer_user_id: 'trainer-1',
            username: 'mason0205',
            display_name: 'ODeology_',
            full_name: 'ODeology_',
            contact_email: 'odeology@example.com',
            meta: { publicHandle: 'jasonodell', pageSiteSlug: 'jasonodell' },
            page_id: null,
            site_slug: 'jasonodell',
            page_slug: '',
            page_name: 'ODeology_ page',
            settings: {}
          }]
        };
      }
      if (text.includes('INSERT INTO app_trainer_page_qualification_sessions')) {
        return {
          rows: [{
            id: 'qual-fallback-1',
            trainer_user_id: 'trainer-1',
            page_id: null,
            source_site_slug: 'jasonodell',
            source_page_slug: '',
            session_key: 'session-fallback-1',
            visitor_email: 'fallback@example.com',
            visitor_phone: '+15551234567',
            lead_id: null,
            status: params[11] ? 'completed' : 'draft',
            current_step: 14,
            answers: {
              gender: 'Male',
              email: 'fallback@example.com',
              zip_or_town: '33101',
              name_and_phone: {
                full_name: 'Fallback Lead',
                phone: '+15551234567'
              }
            },
            meta: {},
            created_at: '2026-06-17T00:00:00Z',
            updated_at: '2026-06-17T00:00:00Z',
            completed_at: params[11] ? '2026-06-17T00:00:00Z' : null
          }]
        };
      }
      if (text.includes('FROM app_trainer_page_leads') && text.includes('ORDER BY updated_at DESC')) {
        return { rows: [] };
      }
      if (text.includes('INSERT INTO app_trainer_page_leads')) {
        return {
          rows: [{
            id: 'lead-fallback-1',
            trainer_user_id: 'trainer-1',
            page_id: null,
            source_site_slug: 'jasonodell',
            source_page_slug: '',
            source_page_name: 'ODeology_ page',
            form_id: 'qualification-gate',
            status: 'Qualified',
            tag_list: ['Qualified', 'Trainer page'],
            full_name: 'Fallback Lead',
            email: 'fallback@example.com',
            phone: '+15551234567',
            goal: '',
            budget: '',
            location: '33101',
            coaching_type: '',
            availability: '',
            injuries: '',
            notes: '',
            answers: {},
            uploads: [],
            meta: { qualificationRequired: true },
            created_at: '2026-06-17T00:00:00Z',
            updated_at: '2026-06-17T00:00:00Z'
          }]
        };
      }
      if (text.includes('UPDATE app_trainer_page_leads') && text.includes('meta = $5::jsonb')) {
        return {
          rows: [{
            id: 'lead-fallback-1',
            trainer_user_id: 'trainer-1',
            page_id: null,
            source_site_slug: 'jasonodell',
            source_page_slug: '',
            source_page_name: 'ODeology_ page',
            form_id: 'qualification-gate',
            status: params[2],
            tag_list: Array.isArray(params[3]) ? params[3] : ['Qualified', 'Trainer page'],
            full_name: 'Fallback Lead',
            email: 'fallback@example.com',
            phone: '+15551234567',
            goal: '',
            budget: '',
            location: '33101',
            coaching_type: '',
            availability: '',
            injuries: '',
            notes: '',
            answers: {},
            uploads: [],
            meta: JSON.parse(params[4]),
            created_at: '2026-06-17T00:00:00Z',
            updated_at: '2026-06-17T00:00:00Z'
          }]
        };
      }
      if (text.includes('INSERT INTO app_trainer_page_lead_events')) {
        return { rows: [] };
      }
      if (text.includes('UPDATE app_trainer_page_qualification_sessions') && text.includes('SET lead_id = $2')) {
        return {
          rows: [{
            id: 'qual-fallback-1',
            trainer_user_id: 'trainer-1',
            page_id: null,
            source_site_slug: 'jasonodell',
            source_page_slug: '',
            session_key: 'session-fallback-1',
            visitor_email: 'fallback@example.com',
            visitor_phone: '+15551234567',
            lead_id: 'lead-fallback-1',
            status: 'completed',
            current_step: 14,
            answers: {},
            meta: {},
            created_at: '2026-06-17T00:00:00Z',
            updated_at: '2026-06-17T00:00:00Z',
            completed_at: '2026-06-17T00:00:00Z'
          }]
        };
      }
      throw new Error(`Unexpected query: ${text.slice(0, 160)}`);
    }
  };

  const result = await trainerPages.upsertPublicQualificationSession(db, {
    siteSlug: 'jasonodell',
    pageSlug: '',
    pageName: 'ODeology_ page',
    sessionKey: 'session-fallback-1',
    currentStep: 14,
    completed: true,
    answers: {
      gender: 'Male',
      email: 'fallback@example.com',
      zip_or_town: '33101',
      name_and_phone: {
        full_name: 'Fallback Lead',
        phone: '+15551234567'
      }
    }
  });

  assert.equal(result.session.leadId, 'lead-fallback-1');
  assert.equal(result.lead.id, 'lead-fallback-1');
  assert.equal(result.publicPage.page.siteSlug, 'jasonodell');
  assert.equal(result.publicPage.page.id, null);
  // The fallback trainer never saved qualification settings; the gate is
  // opt-in, so it reports disabled — answers that do arrive still persist.
  assert.equal(result.qualification.enabled, false);
  assert.ok(queries.some((entry) => entry.includes('LEFT JOIN LATERAL')));
  assert.ok(queries.some((entry) => entry.includes('INSERT INTO app_trainer_page_qualification_sessions')));
});

test('updateTrainerLead rejects invalid stages before writing', async () => {
  const db = createMockDb([]);
  await assert.rejects(
    trainerPages.updateTrainerLead(db, 'trainer-1', 'lead-1', { status: 'Not A Stage' }),
    /Invalid lead stage/
  );
});
