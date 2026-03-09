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
const PROTOTYPE_ID = String(process.env.KLAVIYO_FLOW_PROTOTYPE_ID || '').trim();

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

async function listAll(path) {
  const out = [];
  let next = path;
  while (next) {
    const json = await klaviyoRequest(toPath(next));
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
  const escaped = String(metricName || '').replace(/"/g, '\\"');
  const filter = encodeURIComponent(`equals(name,"${escaped}")`);
  const json = await klaviyoRequest(`/metrics/?filter=${filter}&page[size]=50`);
  const rows = Array.isArray(json?.data) ? json.data : [];
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
    metric = await findMetricByName(metricName);
  }
  return metric;
}

async function getFlow(flowId, includeDefinition = false) {
  const fields = includeDefinition ? '?additional-fields[flow]=definition' : '';
  const json = await klaviyoRequest(`/flows/${encodeURIComponent(flowId)}/${fields}`);
  return json?.data || null;
}

function hasSendEmailAction(flowData) {
  const actions = flowData?.attributes?.definition?.actions;
  if (!Array.isArray(actions)) return false;
  return actions.some((action) => String(action?.type || '').toLowerCase() === 'send-email');
}

function cloneDefinitionForMetric(definition, metricId) {
  const next = JSON.parse(JSON.stringify(definition || {}));
  const triggers = Array.isArray(next?.triggers) ? next.triggers : [];
  if (!triggers.length) throw new Error('Prototype flow has no trigger definition.');

  const originalMetricId = String(triggers[0]?.id || '').trim();
  triggers[0] = {
    ...triggers[0],
    type: 'metric',
    id: String(metricId || '').trim(),
    trigger_filter: null
  };
  next.triggers = triggers;

  const idMap = new Map();
  const actions = Array.isArray(next?.actions) ? next.actions : [];
  actions.forEach((action, idx) => {
    const oldId = String(action?.id || '').trim();
    const oldTemp = String(action?.temporary_id || '').trim();
    const temp = oldTemp || oldId || `ode_action_${idx + 1}`;
    if (oldId) idMap.set(oldId, temp);
    if (oldTemp) idMap.set(oldTemp, temp);
    action.temporary_id = temp;
    delete action.id;
    if (action?.data && typeof action.data === 'object') {
      if (action.type === 'send-email' || action.type === 'send-sms') {
        action.data.status = 'live';
      }
      if (action.type === 'send-email' && action.data.message && typeof action.data.message === 'object') {
        action.data.message.subject_line = '{{ event.ode_email_subject|default:"ODEOLOGY update" }}';
        action.data.message.preview_text = '{{ event.ode_email_preheader|default:"You have a new update in ODEOLOGY." }}';
      }
    }
  });

  actions.forEach((action) => {
    const links = action?.links;
    if (!links || typeof links !== 'object') return;
    Object.keys(links).forEach((key) => {
      const val = String(links[key] || '').trim();
      if (!val) return;
      if (idMap.has(val)) links[key] = idMap.get(val);
    });
  });
  next.actions = actions;

  if (next.entry_action_id && idMap.has(String(next.entry_action_id))) {
    next.entry_action_id = idMap.get(String(next.entry_action_id));
  }

  // Remove prototype-specific metric filters if any still reference the old metric.
  if (originalMetricId) {
    const walk = (obj) => {
      if (!obj || typeof obj !== 'object') return;
      Object.keys(obj).forEach((key) => {
        const value = obj[key];
        if (typeof value === 'string' && value === originalMetricId) obj[key] = String(metricId);
        else if (value && typeof value === 'object') walk(value);
      });
    };
    walk(next);
  }

  return next;
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
  const json = await klaviyoRequest('/flows/', {
    method: 'POST',
    body: payload
  });
  return json?.data || null;
}

async function patchFlowStatus(flowId, status) {
  if (!flowId) return;
  await klaviyoRequest(`/flows/${encodeURIComponent(flowId)}/`, {
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

async function setFlowActionsLive(flowId) {
  if (!flowId) return { ok: false, changed: 0 };
  const json = await klaviyoRequest(`/flows/${encodeURIComponent(flowId)}/flow-actions/`);
  const rows = Array.isArray(json?.data) ? json.data : [];
  let changed = 0;
  for (const row of rows) {
    const actionId = String(row?.id || '').trim();
    if (!actionId) continue;
    const current = String(row?.attributes?.status || '').toLowerCase();
    if (current === 'live') continue;
    try {
      await klaviyoRequest(`/flow-actions/${encodeURIComponent(actionId)}/`, {
        method: 'PATCH',
        body: {
          data: {
            type: 'flow-action',
            id: actionId,
            attributes: {
              status: 'live'
            }
          }
        }
      });
      changed += 1;
    } catch {
      // Continue; some action types may not support live status updates directly.
    }
  }
  return { ok: true, changed };
}

async function flowIdsForMetric(metricId) {
  const rows = await listAll(`/metrics/${encodeURIComponent(metricId)}/flow-triggers/?page[size]=50`);
  return rows
    .map((row) => String(row?.id || '').trim())
    .filter(Boolean);
}

async function pickPrototypeFlow() {
  if (PROTOTYPE_ID) {
    const flow = await getFlow(PROTOTYPE_ID, true);
    if (!flow) throw new Error(`Prototype flow "${PROTOTYPE_ID}" not found.`);
    if (!hasSendEmailAction(flow)) throw new Error('Provided prototype flow does not include a send-email action.');
    return flow;
  }

  const flows = await listAll('/flows/?page[size]=50');
  for (const flow of flows) {
    const flowId = String(flow?.id || '').trim();
    if (!flowId) continue;
    try {
      const detailed = await getFlow(flowId, true);
      if (hasSendEmailAction(detailed)) return detailed;
    } catch {
      // ignore this flow
    }
  }
  return null;
}

async function ensureFlowForEvent({
  eventName,
  metricId,
  prototypeFlow
}) {
  const matchingFlowIds = await flowIdsForMetric(metricId);
  const desiredName = eventToFlowName(eventName);

  if (matchingFlowIds.length) {
    const flowId = matchingFlowIds[0];
    try {
      await patchFlowStatus(flowId, 'live');
    } catch {
      // fallback handled below
    }
    await setFlowActionsLive(flowId).catch(() => ({}));
    return { eventName, flowId, mode: 'existing', status: 'live_attempted' };
  }

  const definition = cloneDefinitionForMetric(prototypeFlow?.attributes?.definition, metricId);
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
  await setFlowActionsLive(flowId).catch(() => ({}));
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
  const prototypeFlow = await pickPrototypeFlow();
  if (!prototypeFlow) {
    throw new Error('No existing send-email flow found to use as a prototype. Create one in Klaviyo first, then rerun.');
  }
  console.log(`[klaviyo-flow-setup] Using prototype flow ${prototypeFlow.id} (${prototypeFlow?.attributes?.name || 'Unnamed'}).`);

  const summary = {
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
        prototypeFlow
      });
      if (out.mode === 'created') summary.created += 1;
      else summary.existing += 1;
      summary.results.push({ eventName, status: out.mode, flowId: out.flowId });
      console.log(`[klaviyo-flow-setup] ${out.mode === 'created' ? 'Created' : 'Updated'} flow for "${eventName}" -> ${out.flowId}`);
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

