/* Owner calendar — month/week views over app_owner_calendar_events via the
   owner-only /api/owner/calendar endpoints. Standalone (no external calendar
   integrations). */
(() => {
  const $ = (sel) => document.querySelector(sel);
  const TYPES = ['call', 'content', 'outreach', 'follow-up'];
  const TYPE_DOT = { call: '#1f6c8f', content: '#b98a2b', outreach: '#6b4fbf', 'follow-up': '#1f8f52' };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const state = {
    view: 'month',            // 'month' | 'week'
    cursor: startOfDay(new Date()),
    events: [],               // events for the loaded range
    editingId: null,
    modalDate: ''
  };

  function startOfDay(d) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function ymd(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function startOfWeek(d) { return addDays(startOfDay(d), -startOfDay(d).getDay()); }
  function escapeHtml(raw) {
    return String(raw || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtTime(t) {
    const m = /^(\d{2}):(\d{2})/.exec(String(t || ''));
    if (!m) return '';
    let h = Number(m[1]);
    const ampm = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${h}:${m[2]}${ampm}`;
  }
  function setStatus(text, kind = '') {
    const el = $('#owner-cal-status');
    if (!el) return;
    el.textContent = String(text || '');
    el.classList.remove('error', 'ok');
    if (kind) el.classList.add(kind);
  }

  async function api(path, options = {}) {
    try {
      const resp = await fetch(path, {
        credentials: 'include',
        ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
      });
      const json = await resp.json().catch(() => ({}));
      return { ok: resp.ok, status: resp.status, json };
    } catch {
      return { ok: false, status: 0, json: { error: 'Network error' } };
    }
  }

  function visibleRange() {
    if (state.view === 'week') {
      const from = startOfWeek(state.cursor);
      return { from, to: addDays(from, 6) };
    }
    const first = new Date(state.cursor.getFullYear(), state.cursor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return { from: gridStart, to: addDays(gridStart, 41) };
  }

  async function loadEvents() {
    const { from, to } = visibleRange();
    const resp = await api(`/api/owner/calendar?from=${ymd(from)}&to=${ymd(to)}`);
    if (!resp.ok || !resp.json?.ok) {
      setStatus(resp.status === 403 ? 'Owner account required.' : (resp.json?.error || 'Could not load events.'), 'error');
      state.events = [];
      return;
    }
    setStatus('');
    state.events = resp.json.events || [];
  }

  function eventsOn(dateStr) {
    return state.events.filter((e) => e.date === dateStr);
  }

  function render() {
    const title = $('#owner-cal-title');
    $('#owner-cal-view-month')?.classList.toggle('active', state.view === 'month');
    $('#owner-cal-view-week')?.classList.toggle('active', state.view === 'week');
    const body = $('#owner-cal-body');
    if (!body) return;
    const todayStr = ymd(new Date());

    if (state.view === 'week') {
      const from = startOfWeek(state.cursor);
      const to = addDays(from, 6);
      if (title) title.textContent = `${MONTHS[from.getMonth()].slice(0, 3)} ${from.getDate()} – ${MONTHS[to.getMonth()].slice(0, 3)} ${to.getDate()}, ${to.getFullYear()}`;
      let html = '<div class="owner-cal-week">';
      for (let i = 0; i < 7; i++) {
        const d = addDays(from, i);
        const ds = ymd(d);
        const evts = eventsOn(ds);
        html += `
          <div class="owner-cal-week-day${ds === todayStr ? ' is-today' : ''}">
            <div class="owner-cal-week-head">
              <span class="owner-cal-week-title">${DOW[d.getDay()]} · ${MONTHS[d.getMonth()].slice(0, 3)} ${d.getDate()}${ds === todayStr ? ' · Today' : ''}</span>
              <button class="owner-cal-btn" type="button" data-add-date="${ds}">+ Add</button>
            </div>
            <div class="owner-cal-week-list">
              ${evts.map((e) => `
                <button class="owner-cal-week-evt" type="button" data-edit-id="${escapeHtml(e.id)}">
                  <span class="dot" style="background:${TYPE_DOT[e.type] || '#666'}"></span>
                  <span class="t">${escapeHtml(e.title)}</span>
                  <span class="m">${escapeHtml(fmtTime(e.time) || e.type)}</span>
                </button>`).join('') || '<div class="owner-accounts-muted" style="font-size:12px;">No events</div>'}
            </div>
          </div>`;
      }
      body.innerHTML = html + '</div>';
    } else {
      const y = state.cursor.getFullYear();
      const m = state.cursor.getMonth();
      if (title) title.textContent = `${MONTHS[m]} ${y}`;
      const gridStart = startOfWeek(new Date(y, m, 1));
      let html = '<div class="owner-cal-grid">';
      DOW.forEach((d) => { html += `<div class="owner-cal-dow">${d}</div>`; });
      for (let i = 0; i < 42; i++) {
        const d = addDays(gridStart, i);
        const ds = ymd(d);
        const evts = eventsOn(ds);
        const shown = evts.slice(0, 3);
        html += `
          <div class="owner-cal-day${d.getMonth() !== m ? ' is-out' : ''}${ds === todayStr ? ' is-today' : ''}" data-add-date="${ds}" role="button" tabindex="0" aria-label="Add event on ${ds}">
            <span class="owner-cal-daynum">${d.getDate()}</span>
            ${shown.map((e) => `<button class="owner-cal-evt t-${escapeHtml(e.type)}" type="button" data-edit-id="${escapeHtml(e.id)}" title="${escapeHtml(e.title)}">${escapeHtml((fmtTime(e.time) ? fmtTime(e.time) + ' ' : '') + e.title)}</button>`).join('')}
            ${evts.length > 3 ? `<span class="owner-cal-more">+${evts.length - 3} more</span>` : ''}
          </div>`;
      }
      body.innerHTML = html + '</div>';
    }
  }

  async function refresh() { await loadEvents(); render(); }

  // ---- modal ----
  function openModal({ id = null, date = '' } = {}) {
    state.editingId = id;
    state.modalDate = date;
    const evt = id ? state.events.find((e) => e.id === id) : null;
    $('#owner-cal-modal-title').textContent = evt ? 'Edit event' : 'Add event';
    $('#owner-cal-f-title').value = evt?.title || '';
    $('#owner-cal-f-date').value = evt?.date || date || ymd(new Date());
    $('#owner-cal-f-time').value = evt?.time || '';
    $('#owner-cal-f-type').value = TYPES.includes(evt?.type) ? evt.type : 'call';
    $('#owner-cal-f-note').value = evt?.note || '';
    $('#owner-cal-f-delete').hidden = !evt;
    $('#owner-cal-modal').hidden = false;
    $('#owner-cal-f-title').focus();
  }
  function closeModal() { $('#owner-cal-modal').hidden = true; state.editingId = null; }

  async function saveModal() {
    const payload = {
      title: $('#owner-cal-f-title').value.trim(),
      date: $('#owner-cal-f-date').value,
      time: $('#owner-cal-f-time').value,
      type: $('#owner-cal-f-type').value,
      note: $('#owner-cal-f-note').value.trim()
    };
    if (!payload.title) { setStatus('Title required.', 'error'); return; }
    if (!payload.date) { setStatus('Date required.', 'error'); return; }
    const resp = state.editingId
      ? await api(`/api/owner/calendar/${encodeURIComponent(state.editingId)}`, { method: 'PATCH', body: JSON.stringify(payload) })
      : await api('/api/owner/calendar', { method: 'POST', body: JSON.stringify(payload) });
    if (!resp.ok || !resp.json?.ok) { setStatus(resp.json?.error || 'Could not save event.', 'error'); return; }
    closeModal();
    setStatus('Saved.', 'ok');
    await refresh();
  }

  async function deleteEditing() {
    if (!state.editingId) return;
    if (!window.confirm('Delete this event?')) return;
    const resp = await api(`/api/owner/calendar/${encodeURIComponent(state.editingId)}`, { method: 'DELETE' });
    if (!resp.ok || !resp.json?.ok) { setStatus(resp.json?.error || 'Could not delete event.', 'error'); return; }
    closeModal();
    setStatus('Deleted.', 'ok');
    await refresh();
  }

  function step(dir) {
    if (state.view === 'week') state.cursor = addDays(state.cursor, dir * 7);
    else state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + dir, 1);
    refresh();
  }

  function wire() {
    $('#owner-cal-prev')?.addEventListener('click', () => step(-1));
    $('#owner-cal-next')?.addEventListener('click', () => step(1));
    $('#owner-cal-today')?.addEventListener('click', () => { state.cursor = startOfDay(new Date()); refresh(); });
    $('#owner-cal-view-month')?.addEventListener('click', () => { state.view = 'month'; refresh(); });
    $('#owner-cal-view-week')?.addEventListener('click', () => { state.view = 'week'; refresh(); });
    $('#owner-cal-f-cancel')?.addEventListener('click', closeModal);
    $('#owner-cal-f-save')?.addEventListener('click', saveModal);
    $('#owner-cal-f-delete')?.addEventListener('click', deleteEditing);
    $('#owner-cal-modal')?.addEventListener('click', (e) => { if (e.target === $('#owner-cal-modal')) closeModal(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#owner-cal-modal').hidden) closeModal(); });

    $('#owner-cal-body')?.addEventListener('click', (e) => {
      const editBtn = e.target.closest?.('[data-edit-id]');
      if (editBtn) { e.stopPropagation(); openModal({ id: editBtn.getAttribute('data-edit-id') }); return; }
      const addEl = e.target.closest?.('[data-add-date]');
      if (addEl) openModal({ date: addEl.getAttribute('data-add-date') });
    });
    $('#owner-cal-body')?.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const addEl = e.target.closest?.('[data-add-date]');
      if (addEl) { e.preventDefault(); openModal({ date: addEl.getAttribute('data-add-date') }); }
    });
  }

  function boot() { wire(); refresh(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
