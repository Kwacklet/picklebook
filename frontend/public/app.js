// PickleBook frontend. Calls the APIs through the reverse proxy using relative
// URLs (/api/...), so the browser only ever talks to one address.
(function () {
  'use strict';

  const BUILD = window.APP_BUILD || 'dev';
  const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
  const $ = (id) => document.getElementById(id);

  // Show the Jenkins build number (proves which version is deployed)
  $('build-badge').textContent = `Build ${BUILD}`;
  $('build-footer').textContent = `Build ${BUILD}`;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function hourLabel(hour) {
    const suffix = hour >= 12 ? 'PM' : 'AM';
    const h = hour % 12 === 0 ? 12 : hour % 12;
    return `${h}:00 ${suffix}`;
  }

  function todayInManila() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    let body = null;
    try { body = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
      const message = (body && (body.error || (body.errors && body.errors.join(', ')))) || `Request failed (${res.status})`;
      throw new Error(message);
    }
    return body;
  }

  function showMessage(el, text, ok) {
    el.textContent = text;
    el.className = `message ${ok ? 'ok' : 'error'}`;
  }

  // ---------- Courts ----------
  async function loadCourts() {
    try {
      const courts = await api('/api/courts');
      const list = $('courts-list');
      list.innerHTML = courts.length
        ? courts.map((c) => `
            <li>
              <div>
                <div class="court-name">${escapeHtml(c.name)}</div>
                <div class="court-meta">${escapeHtml(c.surface)}${c.is_active ? '' : ' · unavailable'}</div>
              </div>
              <div class="court-rate">${peso.format(c.hourly_rate)}/hr</div>
            </li>`).join('')
        : '<li class="muted">No courts yet.</li>';

      const select = $('court-select');
      const selected = select.value;
      select.innerHTML = courts
        .filter((c) => c.is_active)
        .map((c) => `<option value="${c.id}">${escapeHtml(c.name)} – ${peso.format(c.hourly_rate)}/hr</option>`)
        .join('');
      if (selected) select.value = selected;
    } catch (err) {
      $('courts-list').innerHTML = `<li class="muted">Could not load courts: ${escapeHtml(err.message)}</li>`;
    }
  }

  // ---------- Reservations ----------
  const NEXT_ACTIONS = {
    pending: [['confirmed', 'Confirm'], ['cancelled', 'Cancel']],
    confirmed: [['completed', 'Complete'], ['cancelled', 'Cancel']],
    completed: [],
    cancelled: [],
  };

  async function loadReservations() {
    const params = new URLSearchParams();
    if ($('filter-date').value) params.set('date', $('filter-date').value);
    if ($('filter-status').value) params.set('status', $('filter-status').value);
    const query = params.toString() ? `?${params}` : '';
    const body = $('reservations-body');
    try {
      const rows = await api(`/api/reservations${query}`);
      body.innerHTML = rows.length
        ? rows.map((r) => `
            <tr>
              <td>${r.id}</td>
              <td>${escapeHtml(r.play_date)}</td>
              <td>${hourLabel(r.start_hour)} – ${hourLabel(r.start_hour + r.hours)}</td>
              <td>${escapeHtml(r.court_name)}</td>
              <td>${escapeHtml(r.customer_name)}<div class="muted">${escapeHtml(r.contact)}</div></td>
              <td>${peso.format(r.total)}</td>
              <td><span class="status status-${r.status}">${r.status}</span></td>
              <td>${NEXT_ACTIONS[r.status].map(([status, label]) =>
                `<button class="btn-small" data-id="${r.id}" data-status="${status}">${label}</button>`).join('')}</td>
            </tr>`).join('')
        : '<tr><td colspan="8" class="muted">No reservations found.</td></tr>';
    } catch (err) {
      body.innerHTML = `<tr><td colspan="8" class="muted">Could not load reservations: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  async function loadSummary() {
    try {
      const s = await api('/api/reservations/summary');
      $('stat-total').textContent = s.total_reservations;
      $('stat-pending').textContent = s.by_status.pending;
      $('stat-confirmed').textContent = s.by_status.confirmed;
      $('stat-revenue').textContent = peso.format(s.revenue);
    } catch (err) {
      /* stats are optional; leave the dashes */
    }
  }

  function refreshAll() {
    loadCourts();
    loadReservations();
    loadSummary();
  }

  // ---------- Forms ----------
  function setupBookingForm() {
    const startSelect = $('start-hour');
    for (let h = 6; h <= 22; h += 1) {
      startSelect.insertAdjacentHTML('beforeend', `<option value="${h}"${h === 8 ? ' selected' : ''}>${hourLabel(h)}${h >= 17 ? ' (peak)' : ''}</option>`);
    }
    const today = todayInManila();
    $('play-date').min = today;
    $('play-date').value = today;

    $('booking-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      const payload = {
        court_id: Number(form.get('court_id')),
        play_date: form.get('play_date'),
        start_hour: Number(form.get('start_hour')),
        hours: Number(form.get('hours')),
        customer_name: String(form.get('customer_name') || ''),
        contact: String(form.get('contact') || ''),
      };
      const msg = $('booking-message');
      try {
        const r = await api('/api/reservations', { method: 'POST', body: JSON.stringify(payload) });
        showMessage(msg, `Reserved! #${r.id} · ${r.court_name} · ${peso.format(r.total)} (pending confirmation)`, true);
        event.target.customer_name.value = '';
        event.target.contact.value = '';
        loadReservations();
        loadSummary();
      } catch (err) {
        showMessage(msg, err.message, false);
      }
    });
  }

  function setupCourtForm() {
    $('court-form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const form = new FormData(event.target);
      const msg = $('court-message');
      try {
        const c = await api('/api/courts', {
          method: 'POST',
          body: JSON.stringify({ name: form.get('name'), surface: form.get('surface'), hourly_rate: Number(form.get('hourly_rate')) }),
        });
        showMessage(msg, `Added ${c.name}.`, true);
        event.target.name.value = '';
        loadCourts();
      } catch (err) {
        showMessage(msg, err.message, false);
      }
    });
  }

  // Status buttons in the reservations table
  $('reservations-body').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-id]');
    if (!button) return;
    button.disabled = true;
    try {
      await api(`/api/reservations/${button.dataset.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: button.dataset.status }),
      });
    } catch (err) {
      showMessage($('booking-message'), err.message, false);
    }
    loadReservations();
    loadSummary();
  });

  $('filter-date').addEventListener('change', loadReservations);
  $('filter-status').addEventListener('change', loadReservations);

  setupBookingForm();
  setupCourtForm();
  refreshAll();
})();
