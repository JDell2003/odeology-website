#!/usr/bin/env node
/* eslint-disable no-console */
const {
  isKlaviyoConfigured,
  createKlaviyoEvent,
  klaviyoRequest
} = require('../core/klaviyoClient');

const TARGET_EVENTS = [
  'Account Created',
  'Lead Submitted',
  'Lead Nurture Channel Enrolled',
  'Support Request Received',
  'Password Reset Requested',
  'Password Reset Completed',
  'Friend Request Received',
  'Friend Request Accepted',
  'Message Received',
  'Owner Message Received',
  'Owner Broadcast Received',
  'Workout Share Invite Received',
  'Workout Share Invite Accepted',
  'Workout Share Invite Declined',
  'Shared Workout Removed',
  'Shared Workout Left',
  'Daily Check-In Saved',
  'Weekly Weigh-In Logged',
  'Progress Photo Saved',
  'Workout Logged',
  'Pain Report Submitted',
  'High Pain Report Submitted',
  'Pain Follow-Up Submitted',
  'Compliance Warnings Updated',
  'Grocery Forecast Updated'
];

const FLOW_PREFIX = process.env.KLAVIYO_FLOW_NAME_PREFIX || 'ODE -';
const TEMPLATE_NAME = String(process.env.KLAVIYO_FLOW_TEMPLATE_NAME || 'ODE - Event Email Template').trim();
const DEFAULT_CTA_URL = String(process.env.KLAVIYO_FLOW_DEFAULT_CTA_URL || 'https://odeology.up.railway.app/').trim();

function normalizeEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  if (!email) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function seedEmail() {
  return normalizeEmail(
    process.env.KLAVIYO_FLOW_BOOTSTRAP_EMAIL
    || process.env.ADMIN_EMAIL
    || process.env.SUPPORT_EMAIL
    || ''
  );
}

function toPath(ref) {
  const src = String(ref || '').trim();
  if (!src) return '';
  if (/^https?:\/\//i.test(src)) {
    const url = new URL(src);
    return `${url.pathname}${url.search}`;
  }
  return src;
}

function nextFromLinks(links) {
  if (!links) return '';
  if (typeof links.next === 'string') return links.next;
  if (links.next && typeof links.next === 'object') {
    if (typeof links.next.href === 'string') return links.next.href;
    if (typeof links.next.related === 'string') return links.next.related;
  }
  return '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

function retryDelayMsFromError(err, attempt) {
  const raw = String(JSON.stringify(err?.details || err?.message || '') || '');
  const match = raw.match(/available in (\d+)\s*second/i);
  if (match) return (Number(match[1]) * 1000) + (attempt * 120);
  return 600 + (attempt * 450);
}

async function klaviyoRequestWithRetry(path, opts = {}, maxRetries = 4) {
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await klaviyoRequest(path, opts);
    } catch (err) {
      lastErr = err;
      const status = Number(err?.status || 0);
      const retryable = status === 429 || status >= 500;
      if (!retryable || attempt >= maxRetries) throw err;
      await sleep(retryDelayMsFromError(err, attempt));
    }
  }
  throw lastErr || new Error('Klaviyo request failed');
}

async function listAll(path) {
  const out = [];
  let next = path;
  while (next) {
    const json = await klaviyoRequestWithRetry(toPath(next));
    const data = Array.isArray(json?.data) ? json.data : [];
    out.push(...data);
    next = nextFromLinks(json?.links);
  }
  return out;
}

function eventToFlowName(eventName) {
  return `${FLOW_PREFIX} ${eventName}`.replace(/\s+/g, ' ').trim();
}

async function findMetricByName(metricName) {
  if (!metricName) return null;
  const rows = await listAll('/metrics/');
  return rows.find((row) => String(row?.attributes?.name || '').trim() === metricName) || null;
}

async function ensureMetric(metricName, email) {
  if (!metricName) return null;
  let metric = await findMetricByName(metricName);
  if (metric) return metric;
  if (email) {
    await createKlaviyoEvent({
      eventName: metricName,
      email,
      properties: {
        ode_bootstrap: true,
        ode_flow_bootstrap: true,
        ode_bootstrap_at: new Date().toISOString()
      }
    });
    await sleep(650);
    metric = await findMetricByName(metricName);
  }
  return metric;
}

async function getSenderDefaults() {
  try {
    const rows = await listAll('/accounts/');
    const account = rows[0] || null;
    const ci = account?.attributes?.contact_information || {};
    const fromEmail = normalizeEmail(ci.default_sender_email || process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || '');
    const fromLabel = String(ci.default_sender_name || process.env.KLAVIYO_FROM_LABEL || 'ODEOLOGY').trim().slice(0, 120) || 'ODEOLOGY';
    if (!fromEmail) {
      throw new Error('No default sender email found in account. Configure a sender in Klaviyo account settings.');
    }
    return { fromEmail, fromLabel };
  } catch (err) {
    const envEmail = normalizeEmail(process.env.SUPPORT_EMAIL || process.env.ADMIN_EMAIL || '');
    if (!envEmail) throw err;
    return {
      fromEmail: envEmail,
      fromLabel: String(process.env.KLAVIYO_FROM_LABEL || 'ODEOLOGY').trim().slice(0, 120) || 'ODEOLOGY'
    };
  }
}

async function findTemplateByName(name) {
  if (!name) return null;
  const rows = await listAll('/templates/');
  return rows.find((row) => String(row?.attributes?.name || '').trim() === name) || null;
}

function buildUniversalTemplateHtml() {
  return [
    '<!doctype html>',
    '<html>',
    '<head>',
    '  <meta charset="utf-8"/>',
    '  <meta name="viewport" content="width=device-width,initial-scale=1"/>',
    '  <title>ODEOLOGY Update</title>',
    '</head>',
    '<body style="margin:0;padding:0;background:#f5f6f8;font-family:Arial,sans-serif;color:#1f2937;">',
    '  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background:#f5f6f8;padding:24px 10px;">',
    '    <tr>',
    '      <td align="center">',
    '        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="max-width:600px;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden;">',
    '          <tr><td style="padding:20px 24px;background:#111827;color:#f9fafb;font-size:22px;font-weight:700;letter-spacing:0.08em;">ODEOLOGY</td></tr>',
    '          <tr>',
    '            <td style="padding:24px;">',
    '              <div style="font-size:21px;line-height:1.3;font-weight:700;margin:0 0 12px 0;">{{ event.ode_email_subject|default:"ODEOLOGY update" }}</div>',
    '              <div style="font-size:15px;line-height:1.45;color:#4b5563;margin:0 0 18px 0;">{{ event.ode_email_preheader|default:"You have a new update in ODEOLOGY." }}</div>',
    '              <div style="font-size:15px;line-height:1.55;white-space:pre-line;color:#111827;margin:0 0 20px 0;">{{ event.ode_email_text|default:"Open ODEOLOGY to view your latest update." }}</div>',
    '              <table role="presentation" cellspacing="0" cellpadding="0" border="0">',
    '                <tr>',
    '                  <td style="background:#d38b2c;border-radius:8px;">',
    `                    <a href="{{ event.ode_email_cta_url|default:"${DEFAULT_CTA_URL}" }}" style="display:inline-block;padding:12px 18px;color:#111827;font-size:15px;font-weight:700;text-decoration:none;">{{ event.ode_email_cta_label|default:"Open ODEOLOGY" }}</a>`,
    '                  </td>',
    '                </tr>',
    '              </table>',
    `              <div style="margin-top:18px;font-size:12px;line-height:1.45;color:#6b7280;">If the button does not work, copy this link:<br/>{{ event.ode_email_cta_url|default:"${DEFAULT_CTA_URL}" }}</div>`,
    '            </td>',
    '          </tr>',
    '        </table>',
    '      </td>',
    '    </tr>',
    '  </table>',
    '</body>',
    '</html>'
  ].join('\n');
}

async function createTemplate(name, html) {
  const payload = {
    data: {
      type: 'template',
      attributes: {
        name,
        editor_type: 'CODE',
        html
      }
    }
  };
  const json = await klaviyoRequestWithRetry('/templates/', {
    method: 'POST',
    body: payload
  });
  return json?.data || null;
}

async function ensureTemplate() {
  const existing = await findTemplateByName(TEMPLATE_NAME);
  if (existing?.id) return existing;
  const created = await createTemplate(TEMPLATE_NAME, buildUniversalTemplateHtml());
  return created;
}

async function createFlow(flowName, definition) {
  const payload = {
    data: {
      type: 'flow',
      attributes: {
        name: flowName,
        definition
      }
    }
  };
  const json = await klaviyoRequestWithRetry('/flows/', {
    method: 'POST',
    body: payload
  });
  return json?.data || null;
}

async function patchFlowStatus(flowId, status) {
  if (!flowId) return;
  await klaviyoRequestWithRetry(`/flows/${encodeURIComponent(flowId)}/`, {
    method: 'PATCH',
    body: {
      data: {
        type: 'flow',
        id: String(flowId),
        attributes: {
          status: String(status)
        }
      }
    }
  });
}

async function flowIdsForMetric(metricId) {
  const rows = await listAll(`/metrics/${encodeURIComponent(metricId)}/flow-triggers/`);
  return rows
    .map((row) => String(row?.id || '').trim())
    .filter(Boolean);
}

function buildFlowDefinitionForMetric({ metricId, templateId, fromEmail, fromLabel, eventName }) {
  return {
    triggers: [{ type: 'metric', id: String(metricId), trigger_filter: null }],
    profile_filter: null,
    actions: [
      {
        temporary_id: 'ode_send_email_1',
        type: 'send-email',
        links: { next: null },
        data: {
          message: {
            from_email: fromEmail,
            from_label: fromLabel,
            reply_to_email: fromEmail,
            cc_email: null,
            bcc_email: null,
            subject_line: '{{ event.ode_email_subject|default:"ODEOLOGY update" }}',
            preview_text: '{{ event.ode_email_preheader|default:"You have a new ODEOLOGY update." }}',
            template_id: String(templateId),
            smart_sending_enabled: true,
            transactional: false,
            add_tracking_params: false,
            custom_tracking_params: null,
            additional_filters: null,
            name: `${String(eventName || 'Event').slice(0, 80)} email`
          },
          status: 'draft'
        }
      }
    ],
    entry_action_id: 'ode_send_email_1'
  };
}

async function ensureFlowForEvent({
  eventName,
  metricId,
  templateId,
  sender
}) {
  const matchingFlowIds = await flowIdsForMetric(metricId);
  if (matchingFlowIds.length) {
    const flowId = matchingFlowIds[0];
    await patchFlowStatus(flowId, 'live').catch(() => {});
    return { eventName, flowId, mode: 'existing', status: 'live_attempted' };
  }

  const desiredName = eventToFlowName(eventName);
  const definition = buildFlowDefinitionForMetric({
    metricId,
    templateId,
    fromEmail: sender.fromEmail,
    fromLabel: sender.fromLabel,
    eventName
  });
  const created = await createFlow(desiredName, definition);
  const flowId = String(created?.id || '').trim();
  if (!flowId) throw new Error(`Flow creation returned no id for event "${eventName}".`);

  try {
    await patchFlowStatus(flowId, 'live');
  } catch {
    try {
      await patchFlowStatus(flowId, 'manual');
    } catch {
      // leave draft if both fail
    }
  }
  return { eventName, flowId, mode: 'created', status: 'live_attempted' };
}

async function main() {
  if (!isKlaviyoConfigured()) {
    throw new Error('Klaviyo key is not configured in environment.');
  }

  const email = seedEmail();
  if (!email) {
    console.warn('[klaviyo-flow-setup] No bootstrap email found. Set KLAVIYO_FLOW_BOOTSTRAP_EMAIL for first-run metric creation.');
  }

  console.log(`[klaviyo-flow-setup] Starting flow setup for ${TARGET_EVENTS.length} events...`);
  const sender = await getSenderDefaults();
  const template = await ensureTemplate();
  const templateId = String(template?.id || '').trim();
  if (!templateId) throw new Error('Could not create/find template for flow emails.');
  console.log(`[klaviyo-flow-setup] Using template ${templateId} (${template?.attributes?.name || TEMPLATE_NAME}).`);

  const summary = {
    templateId,
    created: 0,
    existing: 0,
    skippedNoMetric: 0,
    failed: 0,
    results: []
  };

  for (const eventName of TARGET_EVENTS) {
    try {
      const metric = await ensureMetric(eventName, email);
      const metricId = String(metric?.id || '').trim();
      if (!metricId) {
        summary.skippedNoMetric += 1;
        summary.results.push({ eventName, status: 'skipped_no_metric' });
        console.warn(`[klaviyo-flow-setup] Skipped "${eventName}" (metric not found and could not seed).`);
        continue;
      }

      const out = await ensureFlowForEvent({
        eventName,
        metricId,
        templateId,
        sender
      });
      if (out.mode === 'created') summary.created += 1;
      else summary.existing += 1;
      summary.results.push({ eventName, status: out.mode, flowId: out.flowId });
      console.log(`[klaviyo-flow-setup] ${out.mode === 'created' ? 'Created' : 'Updated'} flow for "${eventName}" -> ${out.flowId}`);
      await sleep(180);
    } catch (err) {
      summary.failed += 1;
      summary.results.push({ eventName, status: 'failed', error: err?.message || String(err) });
      console.error(`[klaviyo-flow-setup] Failed "${eventName}": ${err?.message || err}`);
    }
  }

  console.log('');
  console.log('[klaviyo-flow-setup] Summary');
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error('[klaviyo-flow-setup] Fatal:', err?.message || err);
  process.exit(1);
});
