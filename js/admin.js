function qs(sel) {
  return document.querySelector(sel);
}

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  });
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null) return;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return node;
}

async function api(path, opts = {}) {
  const resp = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    ...opts
  });
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, json };
}

function fmtDate(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'â€”';
  return d.toLocaleString();
}

function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m <= 0) return `${r}s`;
  return `${m}m ${String(r).padStart(2, '0')}s`;
}

function prettyPath(path) {
  const raw = String(path || '');
  const cleaned = raw.replace(/^https?:\/\/[^/]+/i, '');
  const base = cleaned.split('?')[0].split('#')[0];
  const p = base || cleaned || '/';
  if (p === '/' || p.endsWith('/index.html') || p.includes('index.html')) return 'Home';
  if (p.includes('training')) return 'Training';
  if (p.includes('store')) return 'Store';
  if (p.includes('blueprint')) return 'Blueprint';
  if (p.includes('grocery')) return 'Groceries';
  if (p.includes('macro')) return 'Macro calculator';
  if (p.includes('dashboard')) return 'Dashboard';
  if (p.includes('overview')) return 'Overview';
  return p;
}

function describeEvent(ev) {
  const name = String(ev?.event_name || '');
  const props = ev?.props && typeof ev.props === 'object' ? ev.props : {};

  if (name === 'page_view') return `Viewed ${prettyPath(ev?.path)}`;
  if (name === 'page_exit') {
    const d = Number(props?.durationSec);
    const dur = Number.isFinite(d) ? fmtDuration(d) : null;
    return `Left ${prettyPath(ev?.path)}${dur ? ` (${dur})` : ''}`;
  }

  if (name === 'blueprint_click') {
    const action = String(props?.action || '').trim();
    const map = {
      macros_without_overspending: 'Clicked â€œMacros without overspendingâ€',
      workout_plan: 'Clicked â€œWorkout planâ€',
      supplements_store: 'Clicked â€œSupplements â†’ Storeâ€',
      self_paced_training: 'Clicked â€œSelf-Paced Coachingâ€'
    };
    return map[action] || `Blueprint click (${action || 'unknown'})`;
  }

  if (name === 'nutrition_body_stats') return 'Entered body stats (Nutrition)';
  if (name === 'nutrition_results') return 'Calculated calories & macros (Nutrition)';
  if (name === 'nutrition_unlock') return 'Unlocked macros (Nutrition)';

  if (name === 'grocery_preferences_saved') return 'Saved grocery preferences';
  if (name === 'grocery_plan_built') return 'Built grocery plan';
  if (name === 'grocery_prep_set') return 'Set grocery prep preference';
  if (name === 'grocery_taste_cost_set') return 'Set taste vs cost preference';

  if (name === 'guest_identify') return 'Provided contact info';

  return name;
}

function iconButton(label, onClick) {
  return el(
    'button',
    {
      type: 'button',
      class: 'admin-icon-btn',
      title: label,
      'aria-label': label,
      onClick
    },
    'ðŸ—‘'
  );
}

let currentTab = 'accounts';
let selectedId = null;
let currentListItems = [];
let selectedIdsByTab = {
  accounts: new Set(),
  leads: new Set(),
  messages: new Set(),
  guests: new Set(),
  data: new Set(),
  orders: new Set()
};

function getSelectedSet() {
  return selectedIdsByTab[currentTab] || new Set();
}

function selectedCount() {
  return getSelectedSet().size;
}

function renderBulkBar() {
  const bar = qs('#admin-bulkbar');
  const countEl = qs('#admin-selected-count');
  if (!bar || !countEl) return;
  if (currentTab === 'data' || currentTab === 'orders') {
    bar.classList.add('hidden');
    countEl.textContent = '0';
    return;
  }
  const count = selectedCount();
  countEl.textContent = String(count);
  bar.classList.toggle('hidden', count === 0);
}

function clearSelection() {
  getSelectedSet().clear();
  renderBulkBar();
}

function toggleSelected(id, next) {
  const set = getSelectedSet();
  if (next) set.add(id);
  else set.delete(id);
  renderBulkBar();
}

function selectAllVisible() {
  if (currentTab === 'data' || currentTab === 'orders') return;
  const set = getSelectedSet();
  currentListItems.forEach((it) => set.add(it.id));
  renderBulkBar();
  document.querySelectorAll('.admin-item-check input[type="checkbox"]').forEach((cb) => (cb.checked = true));
}

function visibleSelectionState(id) {
  return getSelectedSet().has(id);
}

function setStatus(text) {
  qs('#admin-status').textContent = text;
}

function initAdminThemeToggle() {
  const btn = qs('#admin-theme-toggle');
  if (!btn) return;
  const root = document.documentElement;
  const apply = (theme) => {
    const next = theme === 'light' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('ode_theme', next); } catch {}
    btn.textContent = next === 'light' ? 'Dark' : 'Light';
  };
  const saved = (() => {
    try { return localStorage.getItem('ode_theme'); } catch { return null; }
  })();
  apply(saved || root.getAttribute('data-theme') || 'dark');
  btn.addEventListener('click', () => {
    const current = root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    apply(current === 'light' ? 'dark' : 'light');
  });
}

function setError(text) {
  const box = qs('#admin-error');
  if (!text) {
    box.classList.add('hidden');
    box.textContent = '';
    return;
  }
  box.textContent = text;
  box.classList.remove('hidden');
}

function setActiveTab(tab) {
  currentTab = tab;
  selectedId = null;
  renderBulkBar();
  document.querySelectorAll('.admin-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  qs('#admin-list-title').textContent =
    tab === 'leads'
      ? 'Leads'
      : tab === 'messages'
        ? 'Messages'
      : tab === 'guests'
        ? 'Guests'
        : tab === 'data'
          ? 'Data'
          : tab === 'orders'
            ? 'Orders'
            : 'Accounts';
  qs('#admin-detail-body').innerHTML = '<p class="admin-muted">Select an item.</p>';
  refresh();
}

async function refresh() {
  setStatus('Loadingâ€¦');
  const itemsEl = qs('#admin-items');
  itemsEl.innerHTML = '';
  currentListItems = [];

  if (currentTab === 'data') {
    const detail = qs('#admin-detail-body');
    if (detail) detail.innerHTML = '<p class="admin-muted">Loading...</p>';
    const { ok, json } = await api('/api/admin/analytics');
    if (!ok) {
      setStatus('Failed to load analytics');
      if (detail) detail.innerHTML = '<p class="admin-muted">Failed to load.</p>';
      return;
    }

    const visitorsByDay = Array.isArray(json.visitorsByDay) ? json.visitorsByDay : [];
    const accountsByDay = Array.isArray(json.accountsByDay) ? json.accountsByDay : [];
    const leadsByDay = Array.isArray(json.leadsByDay) ? json.leadsByDay : [];
    const today = json.today || {};
    const todayTopEvents = Array.isArray(json.todayTopEvents) ? json.todayTopEvents : [];
    const breakdown = json.todayGuestBreakdown || {};

    const avgFrom = (rows, key) => {
      if (!rows.length) return null;
      const nums = rows.map((r) => Number(r?.[key]) || 0);
      if (!nums.length) return null;
      const sum = nums.reduce((a, b) => a + b, 0);
      return sum / nums.length;
    };

    const avgVisitors = avgFrom(visitorsByDay, 'visitors');
    const avgAccounts = avgFrom(accountsByDay, 'accounts_created');
    const avgLeads = avgFrom(leadsByDay, 'leads_created');

    const sumVisitors = visitorsByDay.reduce((sum, r) => sum + (Number(r.visitors) || 0), 0);
    const sumSignedIn = visitorsByDay.reduce((sum, r) => sum + (Number(r.signed_in) || 0), 0);
    const avgSignedIn = avgFrom(visitorsByDay, 'signed_in');
    const avgSignedInPct = sumVisitors > 0 ? (sumSignedIn / sumVisitors) * 100 : null;

    const pct = (value, baseline) => {
      if (!Number.isFinite(value) || !Number.isFinite(baseline) || baseline <= 0) return null;
      return ((value - baseline) / baseline) * 100;
    };

    const fmtPct = (value) => {
      if (value == null || !Number.isFinite(value)) return '--';
      const sign = value > 0 ? '+' : '';
      return `${sign}${value.toFixed(1)}%`;
    };

    const monthVisitors = Number(json.monthVisitors) || 0;
    const monthUsers = Number(json.monthUsers) || 0;
    const monthUsersPrev = Number(json.monthUsersPrev) || 0;
    const monthUserPct = monthUsersPrev > 0 ? ((monthUsers - monthUsersPrev) / monthUsersPrev) * 100 : null;

    const rows = visitorsByDay.slice(-14).map((r) => ({
      day: r.day ? new Date(r.day).toLocaleDateString() : '-',
      visitors: Number(r.visitors) || 0,
      signedIn: Number(r.signed_in) || 0
    }));

    setStatus('Analytics loaded');
    if (!detail) return;
    qs('#admin-detail-title').textContent = 'Data';
    detail.innerHTML = '';

    const kvRow = (k, v) => el('div', { class: 'admin-kv-row' }, [
      el('div', { class: 'k' }, k),
      el('div', { class: 'v' }, v)
    ]);

    detail.appendChild(el('h3', { class: 'admin-h3' }, 'Today'));
    detail.appendChild(el('div', { class: 'admin-kv' }, [
      kvRow('Visitors', `${Number(today.visitors_today) || 0} (${fmtPct(pct(Number(today.visitors_today) || 0, avgVisitors || 0))})`),
      kvRow('Accounts created', `${Number(today.accounts_today) || 0} (${fmtPct(pct(Number(today.accounts_today) || 0, avgAccounts || 0))})`),
      kvRow('Leads', `${Number(today.leads_today) || 0} (${fmtPct(pct(Number(today.leads_today) || 0, avgLeads || 0))})`),
      kvRow(
        'Surfing vs signed-in',
        `${Math.max(0, Number(breakdown.guests_today || 0) - Number(breakdown.guests_with_user_today || 0))} surfing / ${Number(breakdown.guests_with_user_today || 0)} with account (${fmtPct(
          Number(today.visitors_today) > 0 ? (Number(breakdown.guests_with_user_today || 0) / Number(today.visitors_today)) * 100 : null
        )})`
      )
    ]));

    detail.appendChild(el('h3', { class: 'admin-h3' }, 'Average (window)'));
    detail.appendChild(el('div', { class: 'admin-kv' }, [
      kvRow('Avg visitors/day', avgVisitors == null ? '--' : avgVisitors.toFixed(1)),
      kvRow('Avg accounts/day', avgAccounts == null ? '--' : avgAccounts.toFixed(2)),
      kvRow('Avg leads/day', avgLeads == null ? '--' : avgLeads.toFixed(2)),
      kvRow('Avg signed-in/day', avgSignedIn == null ? '--' : avgSignedIn.toFixed(2)),
      kvRow('Signed-in % (window)', avgSignedInPct == null ? '--' : `${avgSignedInPct.toFixed(1)}%`),
      kvRow('Window days', String(Number(json.windowDays) || 0))
    ]));

    detail.appendChild(el('h3', { class: 'admin-h3' }, 'Monthly totals'));
    detail.appendChild(el('div', { class: 'admin-kv' }, [
      kvRow('Visitors this month', String(monthVisitors)),
      kvRow('Users this month', `${monthUsers} (${fmtPct(monthUserPct)})`),
      kvRow('Users last month', String(monthUsersPrev))
    ]));

    detail.appendChild(el('h3', { class: 'admin-h3' }, 'Last 14 days'));
    detail.appendChild(el('div', { class: 'admin-events' }, rows.map((r) =>
      el('div', { class: 'admin-event' }, [
        el('div', { class: 'admin-event-name' }, r.day),
        el('div', { class: 'admin-event-meta' }, `visitors: ${r.visitors} / signed-in: ${r.signedIn}`)
      ])
    )));

    if (todayTopEvents.length) {
      detail.appendChild(el('h3', { class: 'admin-h3' }, 'Top events today'));
      detail.appendChild(el('div', { class: 'admin-events' }, todayTopEvents.map((r) =>
        el('div', { class: 'admin-event' }, [
          el('div', { class: 'admin-event-name' }, r.event_name),
          el('div', { class: 'admin-event-meta' }, `count: ${Number(r.count) || 0}`)
        ])
      )));
    }

    return;
  }
  if (currentTab === 'accounts') {
    const { ok, json } = await api('/api/admin/users');
    if (!ok) return setStatus('Failed to load accounts');
    setStatus(`Loaded ${json.users?.length || 0} accounts`);
    currentListItems = (json.users || []).map((u) => ({ id: u.id }));
    (json.users || []).forEach((u) => {
      const title = u.display_name || u.username || u.email || u.phone || u.id;
      const subtitle = [u.username, u.email, u.phone].filter(Boolean).join(' â€¢ ');
      const row = el('div', { class: `admin-item ${selectedId === u.id ? 'active' : ''}` }, [
        el('label', { class: 'admin-item-check' }, [
          el('input', {
            type: 'checkbox',
            checked: visibleSelectionState(u.id) ? 'checked' : null,
            onClick: (e) => e.stopPropagation(),
            onChange: (e) => toggleSelected(u.id, e.target.checked)
          })
        ]),
        el(
          'button',
          {
            class: 'admin-item-main',
            type: 'button',
            onClick: async () => {
              selectedId = u.id;
              document.querySelectorAll('.admin-item').forEach((n) => n.classList.remove('active'));
              row.classList.add('active');
              await loadAccount(u.id);
            }
          },
          [
            el('div', { class: 'admin-item-title' }, title),
            el('div', { class: 'admin-item-sub' }, subtitle || 'â€”'),
            el('div', { class: 'admin-item-meta' }, `Last seen: ${fmtDate(u.last_seen)}`)
          ]
        ),
        iconButton('Delete account', async (e) => {
          e.stopPropagation();
          if (!confirm('Delete this account?')) return;
          const resp = await api(`/api/admin/users/${encodeURIComponent(u.id)}/delete`, { method: 'POST', body: '{}' });
          if (!resp.ok) return alert(resp.json?.error || 'Failed to delete');
          selectedId = null;
          toggleSelected(u.id, false);
          await refresh();
          qs('#admin-detail-body').innerHTML = '<p class="admin-muted">Select an item.</p>';
        })
      ]);
      itemsEl.appendChild(row);
    });
	    renderBulkBar();
	    return;
	  }

  if (currentTab === 'orders') {
	    const { ok, json } = await api('/api/admin/orders');
	    if (!ok) return setStatus('Failed to load orders');
	    const orders = json.orders || [];
	    setStatus(`Loaded ${orders.length || 0} orders`);
	    currentListItems = orders.map((o) => ({ id: o.id }));

	    if (!orders.length) {
	      itemsEl.appendChild(el('div', { class: 'admin-empty' }, 'No orders yet.'));
	      renderBulkBar();
	      return;
	    }

	    orders.forEach((o) => {
	      const title = o.title || o.id;
	      const amount = Number.isFinite(Number(o.amount_cents))
	        ? `$${(Number(o.amount_cents) / 100).toFixed(2)} ${String(o.currency || '').toUpperCase()}`
	        : 'â€”';
	      const subtitle = [o.email, o.phone].filter(Boolean).join(' â€¢ ') || 'â€”';
	      const row = el('div', { class: `admin-item ${selectedId === o.id ? 'active' : ''}` }, [
	        el('button', {
	          class: 'admin-item-main',
	          type: 'button',
	          onClick: async () => {
	            selectedId = o.id;
	            document.querySelectorAll('.admin-item').forEach((n) => n.classList.remove('active'));
	            row.classList.add('active');
	            await loadOrder(o.id);
	          }
	        }, [
	          el('div', { class: 'admin-item-title' }, title),
	          el('div', { class: 'admin-item-sub' }, subtitle),
	          el('div', { class: 'admin-item-meta' }, `${String(o.status || 'paid').toUpperCase()} â€¢ ${amount}`)
	        ])
	      ]);
	      itemsEl.appendChild(row);
	    });
    renderBulkBar();
    return;
  }

  if (currentTab === 'messages') {
    const { ok, json } = await api('/api/admin/messages');
    if (!ok) return setStatus('Failed to load messages');
    const messages = json.messages || [];
    setStatus(`Loaded ${messages.length || 0} messages`);
    currentListItems = messages.map((m) => ({ id: m.id }));

    if (!messages.length) {
      itemsEl.appendChild(el('div', { class: 'admin-empty' }, 'No messages yet.'));
      return;
    }

    messages.forEach((m) => {
      const title = m.name || m.email || m.subject || m.id;
      const subtitle = [m.email, m.subject].filter(Boolean).join(' \u2022 ');
      const row = el('div', { class: `admin-item ${selectedId === m.id ? 'active' : ''}` }, [
        el('label', { class: 'admin-item-check' }, [
          el('input', {
            type: 'checkbox',
            checked: visibleSelectionState(m.id) ? 'checked' : null,
            onClick: (e) => e.stopPropagation(),
            onChange: (e) => toggleSelected(m.id, e.target.checked)
          })
        ]),
        el(
          'button',
          {
            class: 'admin-item-main',
            type: 'button',
            onClick: async () => {
              selectedId = m.id;
              document.querySelectorAll('.admin-item').forEach((n) => n.classList.remove('active'));
              row.classList.add('active');
              await loadMessage(m.id);
            }
          },
          [
            el('div', { class: 'admin-item-title' }, title),
            el('div', { class: 'admin-item-sub' }, subtitle || '\u2014'),
            el('div', { class: 'admin-item-meta' }, `${String(m.status || 'new').toUpperCase()} \u2022 ${fmtDate(m.created_at)}`)
          ]
        ),
        iconButton('Delete message', async (e) => {
          e.stopPropagation();
          if (!confirm('Delete this message?')) return;
          const resp = await api(`/api/admin/messages/${encodeURIComponent(m.id)}/delete`, { method: 'POST', body: '{}' });
          if (!resp.ok) return alert(resp.json?.error || 'Failed to delete');
          selectedId = null;
          toggleSelected(m.id, false);
          await refresh();
          qs('#admin-detail-body').innerHTML = '<p class="admin-muted">Select an item.</p>';
        })
      ]);
      itemsEl.appendChild(row);
    });
    renderBulkBar();
    return;
  }

  if (currentTab === 'guests') {
    const { ok, json } = await api('/api/admin/guests');
    if (!ok) return setStatus('Failed to load guests');
    setStatus(`Loaded ${json.guests?.length || 0} guests`);
    currentListItems = (json.guests || []).map((g) => ({ id: g.id }));
    (json.guests || []).forEach((g) => {
      const title = g.email || g.phone || g.id;
      const bits = [];
      if (g.email) bits.push(g.email);
      if (g.phone) bits.push(g.phone);
      if (g.inferred_user_name) bits.push(`Possible match: ${g.inferred_user_name}`);
      else if (g.inferred_user_id) bits.push(`Possible match: ${g.inferred_user_id}`);
      if (!bits.length) bits.push('Unmatched guest');
      const subtitle = bits.join(' â€¢ ');
      const row = el('div', { class: `admin-item ${selectedId === g.id ? 'active' : ''}` }, [
        el('label', { class: 'admin-item-check' }, [
          el('input', {
            type: 'checkbox',
            checked: visibleSelectionState(g.id) ? 'checked' : null,
            onClick: (e) => e.stopPropagation(),
            onChange: (e) => toggleSelected(g.id, e.target.checked)
          })
        ]),
        el(
          'button',
          {
            class: 'admin-item-main',
            type: 'button',
            onClick: async () => {
              selectedId = g.id;
              document.querySelectorAll('.admin-item').forEach((n) => n.classList.remove('active'));
              row.classList.add('active');
              await loadGuest(g.id);
            }
          },
          [
            el('div', { class: 'admin-item-title' }, title),
            el('div', { class: 'admin-item-sub' }, subtitle),
            el('div', { class: 'admin-item-meta' }, `Last seen: ${fmtDate(g.last_seen)}`)
          ]
        ),
        iconButton('Delete guest', async (e) => {
          e.stopPropagation();
          if (!confirm('Delete this guest profile and its events/leads?')) return;
          const resp = await api(`/api/admin/guests/${encodeURIComponent(g.id)}/delete`, { method: 'POST', body: '{}' });
          if (!resp.ok) return alert(resp.json?.error || 'Failed to delete');
          selectedId = null;
          toggleSelected(g.id, false);
          await refresh();
          qs('#admin-detail-body').innerHTML = '<p class="admin-muted">Select an item.</p>';
        })
      ]);
      itemsEl.appendChild(row);
    });
    renderBulkBar();
    return;
  }

  const { ok, json } = await api('/api/admin/leads');
  if (!ok) return setStatus('Failed to load leads');
  setStatus(`Loaded ${json.leads?.length || 0} leads`);
  currentListItems = (json.leads || []).map((l) => ({ id: l.id }));
  (json.leads || []).forEach((l) => {
    const title = [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || l.phone || l.id;
    const wants = Array.isArray(l.wants) ? l.wants.slice(0, 4).join(', ') : '';
    const subtitle = [l.email, l.phone].filter(Boolean).join(' â€¢ ');
    const row = el('div', { class: `admin-item ${selectedId === l.id ? 'active' : ''}` }, [
      el('label', { class: 'admin-item-check' }, [
        el('input', {
          type: 'checkbox',
          checked: visibleSelectionState(l.id) ? 'checked' : null,
          onClick: (e) => e.stopPropagation(),
          onChange: (e) => toggleSelected(l.id, e.target.checked)
        })
      ]),
      el(
        'button',
        {
          class: 'admin-item-main',
          type: 'button',
          onClick: async () => {
            selectedId = l.id;
            document.querySelectorAll('.admin-item').forEach((n) => n.classList.remove('active'));
            row.classList.add('active');
            await loadLead(l.id);
          }
        },
        [
          el('div', { class: 'admin-item-title' }, title),
          el('div', { class: 'admin-item-sub' }, subtitle || 'â€”'),
          el('div', { class: 'admin-item-meta' }, `${(l.status || 'new').toUpperCase()} â€¢ ${wants}`)
        ]
      ),
      iconButton('Delete lead', async (e) => {
        e.stopPropagation();
        if (!confirm('Delete this lead?')) return;
        const resp = await api(`/api/admin/leads/${encodeURIComponent(l.id)}/delete`, { method: 'POST', body: '{}' });
        if (!resp.ok) return alert(resp.json?.error || 'Failed to delete');
        selectedId = null;
        toggleSelected(l.id, false);
        await refresh();
        qs('#admin-detail-body').innerHTML = '<p class="admin-muted">Select an item.</p>';
      })
    ]);
    itemsEl.appendChild(row);
  });
  renderBulkBar();
}

async function loadMessage(messageId) {
  const body = qs('#admin-detail-body');
  body.innerHTML = '<p class="admin-muted">Loading\u2026</p>';
  const { ok, json } = await api(`/api/admin/messages/${encodeURIComponent(messageId)}`);
  if (!ok) return (body.innerHTML = '<p class="admin-muted">Failed to load.</p>');

  const m = json.message;
  if (!m) return (body.innerHTML = '<p class="admin-muted">Not found.</p>');

  const lines = [
    ['Received', fmtDate(m.created_at)],
    ['Name', m.name || '\u2014'],
    ['Email', m.email || '\u2014'],
    ['Subject', m.subject || '\u2014'],
    ['Path', m.path || '\u2014'],
    ['Status', String(m.status || 'new')]
  ];

  body.innerHTML = '';
  body.appendChild(el('h3', { class: 'admin-h3' }, 'Message'));
  const grid = el('div', { class: 'admin-kv' }, lines.map(([k, v]) => el('div', { class: 'admin-kv-row' }, [
    el('div', { class: 'k' }, k),
    el('div', { class: 'v' }, v)
  ])));
  body.appendChild(grid);

  body.appendChild(el('h3', { class: 'admin-h3' }, 'Body'));
  body.appendChild(el('pre', { class: 'admin-pre' }, String(m.message || '')));
}

async function loadAccount(userId) {
  const body = qs('#admin-detail-body');
  body.innerHTML = '<p class="admin-muted">Loadingâ€¦</p>';
  const { ok, json } = await api(`/api/admin/users/${encodeURIComponent(userId)}`);
  if (!ok) return (body.innerHTML = '<p class="admin-muted">Failed to load.</p>');

  const u = json.user;
  if (!u) return (body.innerHTML = '<p class="admin-muted">Not found.</p>');

  const notes = el('textarea', { class: 'admin-textarea', id: 'admin-user-notes' }, u.admin_notes || '');
  const saveBtn = el(
    'button',
    {
      class: 'btn btn-primary',
      type: 'button',
      onClick: async () => {
        const resp = await api(`/api/admin/users/${encodeURIComponent(userId)}/notes`, {
          method: 'POST',
          body: JSON.stringify({ notes: notes.value })
        });
        if (!resp.ok) alert(resp.json?.error || 'Failed to save');
      }
    },
    'Save notes'
  );

  body.innerHTML = '';
  body.appendChild(el('div', { class: 'admin-kv' }, [
    el('div', { class: 'k' }, 'Name'),
    el('div', { class: 'v' }, u.display_name || 'â€”'),
    el('div', { class: 'k' }, 'Username'),
    el('div', { class: 'v' }, u.username || 'â€”'),
    el('div', { class: 'k' }, 'Email'),
    el('div', { class: 'v' }, u.email || 'â€”'),
    el('div', { class: 'k' }, 'Phone'),
    el('div', { class: 'v' }, u.phone || 'â€”'),
    el('div', { class: 'k' }, 'Created'),
    el('div', { class: 'v' }, fmtDate(u.created_at)),
    el('div', { class: 'k' }, 'Last login'),
    el('div', { class: 'v' }, fmtDate(u.last_login)),
    el('div', { class: 'k' }, 'Last seen'),
    el('div', { class: 'v' }, fmtDate(u.last_seen))
  ]));

  body.appendChild(el('h3', { class: 'admin-h3' }, 'Notes'));
  body.appendChild(notes);
  body.appendChild(saveBtn);

  body.appendChild(el('h3', { class: 'admin-h3' }, `Leads (${json.leads?.length || 0})`));
  body.appendChild(el('pre', { class: 'admin-pre' }, JSON.stringify(json.leads || [], null, 2)));

  const eventsAll = Array.isArray(json.events) ? json.events : [];
  body.appendChild(el('h3', { class: 'admin-h3' }, `Events (${eventsAll.length})`));
  if (!eventsAll.length) {
    body.appendChild(el('p', { class: 'admin-muted' }, 'No events yet.'));
  } else {
    body.appendChild(el('div', { class: 'admin-events' }, eventsAll.map((ev) =>
      el('div', { class: 'admin-event' }, [
        el('div', { class: 'admin-event-name' }, describeEvent(ev)),
        el('div', { class: 'admin-event-meta' }, fmtDate(ev.created_at))
      ])
    )));
  }
}

async function loadLead(leadId) {
  const body = qs('#admin-detail-body');
  body.innerHTML = '<p class="admin-muted">Loadingâ€¦</p>';
  const { ok, json } = await api(`/api/admin/leads/${encodeURIComponent(leadId)}`);
  if (!ok) return (body.innerHTML = '<p class="admin-muted">Failed to load.</p>');

  const lead = json.lead;
  const guest = json.guest || null;
  const likelyUsers = Array.isArray(json.likelyUsers) ? json.likelyUsers : [];
  if (!lead) return (body.innerHTML = '<p class="admin-muted">Not found.</p>');

  const WANT_LABELS = {
    track_calories_macros: 'Track calories & macros',
    lower_grocery_costs: 'Lower grocery costs',
    get_workout_plan: 'Make a custom workout plan',
    coaching_self_paced: 'Self-paced coaching',
    coaching_1on1: 'Custom 1-on-1 coaching',
    supplements_delivered: 'Supplements delivered',
    meals_planned_or_cooked: 'Meals delivered',
  };

  const wantsList = Array.isArray(lead.wants) ? lead.wants : [];
  const wantsHuman = wantsList.map((w) => WANT_LABELS[w] || w).filter(Boolean);

  const snapshot = lead.snapshot && typeof lead.snapshot === 'object' ? lead.snapshot : {};
  const summaryFromSnapshot = (() => {
    const lines = [];
    if (lead.source === 'meals_delivered') {
      if (snapshot.do_not_call) lines.push(`Times NOT to call: ${snapshot.do_not_call}`);
      if (snapshot.extra_notes) lines.push(`Extra notes: ${snapshot.extra_notes}`);
    }
    if (lead.source === 'coaching_self_paced') {
      if (snapshot.goal) lines.push(`Goal: ${snapshot.goal}`);
      if (snapshot.days) lines.push(`Days/week: ${snapshot.days}`);
      if (snapshot.equipment) lines.push(`Equipment: ${snapshot.equipment}`);
      if (snapshot.constraints) lines.push(`Constraints: ${snapshot.constraints}`);
    }
    return lines;
  })();

  const notes = el('textarea', { class: 'admin-textarea', id: 'admin-lead-notes' }, lead.notes || '');
  const statusSel = el('select', { class: 'admin-select', id: 'admin-lead-status' }, [
    el('option', { value: 'new' }, 'new'),
    el('option', { value: 'contacted' }, 'contacted'),
    el('option', { value: 'qualified' }, 'qualified'),
    el('option', { value: 'won' }, 'won'),
    el('option', { value: 'lost' }, 'lost')
  ]);
  statusSel.value = lead.status || 'new';

  const saveBtn = el(
    'button',
    {
      class: 'btn btn-primary',
      type: 'button',
      onClick: async () => {
        const resp = await api(`/api/admin/leads/${encodeURIComponent(leadId)}/update`, {
          method: 'POST',
          body: JSON.stringify({ notes: notes.value, status: statusSel.value })
        });
        if (!resp.ok) alert(resp.json?.error || 'Failed to save');
      }
    },
    'Save'
  );

  body.innerHTML = '';
  body.appendChild(el('div', { class: 'admin-kv' }, [
    el('div', { class: 'k' }, 'Name'),
    el('div', { class: 'v' }, [lead.first_name, lead.last_name].filter(Boolean).join(' ') || 'â€”'),
    el('div', { class: 'k' }, 'Email'),
    el('div', { class: 'v' }, lead.email || 'â€”'),
    el('div', { class: 'k' }, 'Phone'),
    el('div', { class: 'v' }, lead.phone || 'â€”'),
    el('div', { class: 'k' }, 'Created'),
    el('div', { class: 'v' }, fmtDate(lead.created_at)),
    el('div', { class: 'k' }, 'Status'),
    el('div', { class: 'v' }, statusSel),
    el('div', { class: 'k' }, 'Wants'),
    el('div', { class: 'v' }, wantsHuman.length ? wantsHuman.join(', ') : (Array.isArray(lead.wants) ? lead.wants.join(', ') : 'â€”'))
  ]));

  body.appendChild(el('h3', { class: 'admin-h3' }, 'Notes'));
  body.appendChild(notes);
  body.appendChild(saveBtn);

  body.appendChild(el('h3', { class: 'admin-h3' }, 'Snapshot'));
  body.appendChild(el('pre', { class: 'admin-pre' }, JSON.stringify(lead.snapshot || {}, null, 2)));

  body.appendChild(el('h3', { class: 'admin-h3' }, `Events (${json.events?.length || 0})`));
  body.appendChild(el('pre', { class: 'admin-pre' }, JSON.stringify(json.events || [], null, 2)));
}

async function loadOrder(orderId) {
  const body = qs('#admin-detail-body');
  body.innerHTML = '<p class="admin-muted">Loadingâ€¦</p>';
  const { ok, json } = await api(`/api/admin/orders/${encodeURIComponent(orderId)}`);
  if (!ok) return (body.innerHTML = '<p class="admin-muted">Failed to load.</p>');

  const order = json.order;
  if (!order) return (body.innerHTML = '<p class="admin-muted">Not found.</p>');

  const amount = Number.isFinite(Number(order.amount_cents))
    ? `$${(Number(order.amount_cents) / 100).toFixed(2)} ${String(order.currency || '').toUpperCase()}`
    : 'â€”';

  body.innerHTML = '';
  body.appendChild(el('div', { class: 'admin-kv' }, [
    el('div', { class: 'k' }, 'Title'),
    el('div', { class: 'v' }, order.title || 'â€”'),
    el('div', { class: 'k' }, 'Status'),
    el('div', { class: 'v' }, String(order.status || 'paid')),
    el('div', { class: 'k' }, 'Amount'),
    el('div', { class: 'v' }, amount),
    el('div', { class: 'k' }, 'Email'),
    el('div', { class: 'v' }, order.email || 'â€”'),
    el('div', { class: 'k' }, 'Phone'),
    el('div', { class: 'v' }, order.phone || 'â€”'),
    el('div', { class: 'k' }, 'Created'),
    el('div', { class: 'v' }, fmtDate(order.created_at)),
  ]));

  if (order.image_url) {
    const img = el('img', { src: order.image_url, alt: order.title || 'Order', style: 'max-width:100%; border-radius:12px; border:1px solid rgba(255,255,255,0.08); margin-top:0.75rem;' });
    body.appendChild(img);
  }

  body.appendChild(el('h3', { class: 'admin-h3' }, 'Snapshot'));
  body.appendChild(el('pre', { class: 'admin-pre' }, JSON.stringify(order.snapshot || {}, null, 2)));
}

async function loadGuest(guestId) {
  const body = qs('#admin-detail-body');
  body.innerHTML = '<p class="admin-muted">Loadingâ€¦</p>';
  const { ok, json } = await api(`/api/admin/guests/${encodeURIComponent(guestId)}`);
  if (!ok) return (body.innerHTML = '<p class="admin-muted">Failed to load.</p>');

  const g = json.guest;
  if (!g) return (body.innerHTML = '<p class="admin-muted">Not found.</p>');

  const summary = json.summary || {};
  const topPaths = Array.isArray(summary.topPaths) ? summary.topPaths : [];
  const leads = Array.isArray(json.leads) ? json.leads : [];
  const eventsAll = Array.isArray(json.events) ? json.events : [];
  const findLatest = (name) => eventsAll.find((e) => String(e?.event_name || '') === name) || null;
  const latestBody = findLatest('nutrition_body_stats');
  const latestNutrition = findLatest('nutrition_results');
  const latestGrocery = findLatest('grocery_plan_built');
  const latestPrefs = findLatest('grocery_preferences_saved');

  body.innerHTML = '';
  body.appendChild(el('div', { class: 'admin-kv' }, [
    el('div', { class: 'k' }, 'Guest ID'),
    el('div', { class: 'v' }, g.id),
    el('div', { class: 'k' }, 'Email'),
    el('div', { class: 'v' }, g.email || '-'),
    el('div', { class: 'k' }, 'Phone'),
    el('div', { class: 'v' }, g.phone || '-'),
    el('div', { class: 'k' }, 'Created'),
    el('div', { class: 'v' }, fmtDate(g.created_at)),
    el('div', { class: 'k' }, 'Last seen'),
    el('div', { class: 'v' }, fmtDate(g.last_seen)),
    el('div', { class: 'k' }, 'Possible user'),
    el('div', { class: 'v' }, g.inferred_user_name || g.inferred_user_id || 'â€”')
  ]));

  body.appendChild(el('div', { class: 'admin-summary' }, [
    el('div', { class: 'admin-summary-card' }, [
      el('div', { class: 'admin-summary-label' }, 'Total time on page'),
      el('div', { class: 'admin-summary-value' }, fmtDuration(summary.durationSec || 0) + (Number(summary.durationSec || 0) >= 360 ? '+' : ''))
    ]),
	    el('div', { class: 'admin-summary-card' }, [
	      el('div', { class: 'admin-summary-label' }, 'Events recorded'),
	      el('div', { class: 'admin-summary-value' }, `${String(summary.eventsStored || eventsAll.length || 0)}${Number(summary.eventsPruned || 0) > 0 ? ` (+${Number(summary.eventsPruned || 0)} pruned)` : ''}`)
	    ])
	  ]));

  if (latestNutrition?.props && typeof latestNutrition.props === 'object') {
    const p = latestNutrition.props || {};
    body.appendChild(el('h3', { class: 'admin-h3' }, 'Latest macros'));
    body.appendChild(el('div', { class: 'admin-kv' }, [
      el('div', { class: 'k' }, 'Calories'),
      el('div', { class: 'v' }, p.calories ? String(p.calories) : 'â€”'),
      el('div', { class: 'k' }, 'Protein (g)'),
      el('div', { class: 'v' }, p.proteinG ? String(p.proteinG) : 'â€”'),
      el('div', { class: 'k' }, 'Carbs (g)'),
      el('div', { class: 'v' }, p.carbG ? String(p.carbG) : 'â€”'),
      el('div', { class: 'k' }, 'Fats (g)'),
      el('div', { class: 'v' }, p.fatG ? String(p.fatG) : 'â€”')
    ]));
  }

  if (latestBody?.props && typeof latestBody.props === 'object') {
    const p = latestBody.props || {};
    body.appendChild(el('h3', { class: 'admin-h3' }, 'Body stats'));
    body.appendChild(el('div', { class: 'admin-kv' }, [
      el('div', { class: 'k' }, 'Height (in)'),
      el('div', { class: 'v' }, p.heightIn ? String(p.heightIn) : '-'),
      el('div', { class: 'k' }, 'Weight (lb)'),
      el('div', { class: 'v' }, p.weightLbs ? String(p.weightLbs) : '-'),
      el('div', { class: 'k' }, 'Sex'),
      el('div', { class: 'v' }, p.sex || '-'),
      el('div', { class: 'k' }, 'Age range'),
      el('div', { class: 'v' }, p.ageRange || '-')
    ]));
  }

  if (latestGrocery?.props && typeof latestGrocery.props === 'object') {
    const p = latestGrocery.props || {};
    body.appendChild(el('h3', { class: 'admin-h3' }, 'Grocery summary'));
    body.appendChild(el('div', { class: 'admin-kv' }, [
      el('div', { class: 'k' }, 'Avg weekly'),
      el('div', { class: 'v' }, p.avgWeeklyCost ? `$${Number(p.avgWeeklyCost).toFixed(2)}` : 'â€”'),
      el('div', { class: 'k' }, 'Avg monthly'),
      el('div', { class: 'v' }, p.avgMonthlyCost ? `$${Number(p.avgMonthlyCost).toFixed(2)}` : 'â€”'),
      el('div', { class: 'k' }, 'Budget delta'),
      el('div', { class: 'v' }, p.budgetDelta === null || p.budgetDelta === undefined ? 'â€”' : `${Number(p.budgetDelta) >= 0 ? 'Under ' : 'Over '}$${Math.abs(Number(p.budgetDelta)).toFixed(2)}`)
    ]));
  }

  if (latestPrefs?.props && typeof latestPrefs.props === 'object') {
    const p = latestPrefs.props || {};
    body.appendChild(el('h3', { class: 'admin-h3' }, 'Preferences'));
    body.appendChild(el('div', { class: 'admin-kv' }, [
      el('div', { class: 'k' }, 'Prep'),
      el('div', { class: 'v' }, p.prep || '-'),
      el('div', { class: 'k' }, 'Taste vs cost'),
      el('div', { class: 'v' }, p.tasteCost || '-'),
      el('div', { class: 'k' }, 'Meals/day'),
      el('div', { class: 'v' }, p.mealsPerDay ? String(p.mealsPerDay) : '-'),
      el('div', { class: 'k' }, 'Store'),
      el('div', { class: 'v' }, p.store || '-')
    ]));
  }

  if (leads.length) {
    body.appendChild(el('h3', { class: 'admin-h3' }, `Leads (${leads.length})`));
    const formatLeadLine = (l) => {
      const who = [l.first_name, l.last_name].filter(Boolean).join(' ') || l.email || l.phone || l.id;
      const wants = Array.isArray(l.wants) ? l.wants.slice(0, 6).join(', ') : '';
      return [who, l.source ? `source:${l.source}` : null, wants ? `wants:${wants}` : null].filter(Boolean).join(' â€¢ ');
    };
    body.appendChild(el('div', { class: 'admin-events' }, leads.slice(0, 20).map((l) =>
      el('div', { class: 'admin-event' }, [
        el('div', { class: 'admin-event-name' }, formatLeadLine(l)),
        el('div', { class: 'admin-event-meta' }, `${fmtDate(l.created_at)} â€¢ opt-in: ${l.email_optin ? 'yes' : 'no'}`)
      ])
    )));

    body.appendChild(el('h3', { class: 'admin-h3' }, 'Newest lead snapshot'));
    body.appendChild(el('pre', { class: 'admin-pre' }, JSON.stringify(leads[0].snapshot || {}, null, 2)));
  }

  if (topPaths.length) {
    body.appendChild(el('h3', { class: 'admin-h3' }, 'Top pages'));
    const list = el('div', { class: 'admin-chips' }, topPaths.map((p) =>
      el('div', { class: 'admin-chip' }, `${p.path} (${p.count})`)
    ));
    body.appendChild(list);
  }

  const stored = Number(summary.eventsStored || eventsAll.length || 0);
  const pruned = Number(summary.eventsPruned || 0);
  const recentTitle = pruned > 0 ? `Recent activity (showing ${stored} â€¢ pruned ${pruned})` : `Recent activity (showing ${stored})`;
  body.appendChild(el('h3', { class: 'admin-h3' }, recentTitle));

  body.appendChild(el('div', { class: 'admin-events' }, eventsAll.map((ev) =>
    el('div', { class: 'admin-event' }, [
      el('div', { class: 'admin-event-name' }, describeEvent(ev)),
      el('div', { class: 'admin-event-meta' }, fmtDate(ev.created_at))
    ])
  )));
}

async function boot() {
  initAdminThemeToggle();
  qs('#admin-refresh').addEventListener('click', refresh);
  qs('#admin-logout').addEventListener('click', async () => {
    await api('/api/admin/logout', { method: 'POST' });
    location.reload();
  });

  document.querySelectorAll('.admin-tab').forEach((b) => {
    b.addEventListener('click', () => setActiveTab(b.dataset.tab));
  });

  qs('#admin-select-all')?.addEventListener('click', (e) => {
    e.preventDefault();
    selectAllVisible();
  });

  qs('#admin-clear-selected')?.addEventListener('click', (e) => {
    e.preventDefault();
    clearSelection();
    document.querySelectorAll('.admin-item-check input[type="checkbox"]').forEach((cb) => (cb.checked = false));
  });

  qs('#admin-delete-selected')?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (currentTab === 'data' || currentTab === 'orders') return alert('Bulk delete is not available for this tab.');
    const ids = Array.from(getSelectedSet());
    if (ids.length === 0) return;
    const label = currentTab === 'accounts' ? 'accounts' : currentTab;
    if (!confirm(`Delete ${ids.length} ${label}?`)) return;
    const endpoint =
      currentTab === 'accounts'
        ? '/api/admin/users/bulk-delete'
        : currentTab === 'messages'
          ? '/api/admin/messages/bulk-delete'
        : currentTab === 'guests'
          ? '/api/admin/guests/bulk-delete'
          : '/api/admin/leads/bulk-delete';
    const resp = await api(endpoint, { method: 'POST', body: JSON.stringify({ ids }) });
    if (!resp.ok) return alert(resp.json?.error || 'Failed to delete');
    clearSelection();
    selectedId = null;
    await refresh();
    qs('#admin-detail-body').innerHTML = '<p class="admin-muted">Select an item.</p>';
  });

  qs('#admin-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    setError('');
    const payload = {
      username: qs('#admin-username').value,
      passcode: qs('#admin-passcode').value
    };
    const { ok, json } = await api('/api/admin/login', { method: 'POST', body: JSON.stringify(payload) });
    if (!ok) return setError(json?.error || 'Sign-in failed');
    location.reload();
  });

  const ready = await api('/api/admin/ready');
  if (!ready.ok) {
    setStatus('Admin API unreachable');
    qs('#admin-login').classList.remove('hidden');
    return;
  }
  if (!ready.json?.ok) {
    setStatus(`Admin not configured (missing: ${(ready.json?.missing || []).join(', ')})`);
    qs('#admin-login').classList.remove('hidden');
    return;
  }

  const me = await api('/api/admin/me');
  if (me.ok && me.json?.ok) {
    setStatus('Signed in');
    qs('#admin-app').classList.remove('hidden');
    await refresh();
  } else {
    setStatus('Sign in required');
    qs('#admin-login').classList.remove('hidden');
  }
}

boot().catch(() => {
  setStatus('Failed to start admin UI');
});


