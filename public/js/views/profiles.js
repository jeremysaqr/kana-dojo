// "Who's practising?": pick, add, rename or remove a learner. Each learner has their own progress.
// Works before any progress is loaded (it is the first screen on a fresh install).
import { mount } from '../app.js';

const LAST = 'kd-profile';

export function rememberedProfile() { try { return localStorage.getItem(LAST); } catch { return null; } }
function remember(id) { try { localStorage.setItem(LAST, id); } catch { /* per-viewer convenience only */ } }

export async function fetchProfiles() {
  const res = await fetch('/api/profiles', { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).profiles || [];
}

async function call(method, path, body) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, ...out };
}

function esc(t) { return String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

/** Switch to a learner: save the current one, remember the choice, and start fresh in theirs. */
export async function switchTo(id, { flush } = {}) {
  try { await flush?.(); } catch { /* the outbox keeps anything unsaved */ }
  remember(id);
  location.hash = '#/learn';
  location.reload();
}

/**
 * Render the profile screen. `current` is the learner in use (null on a fresh start); `flush` saves
 * their progress before switching.
 */
export function renderProfiles({ current = null, flush } = {}) {
  const app = document.getElementById('app');
  let profiles = [];
  let editing = null;      // id being renamed
  let message = '';

  const draw = () => {
    const rows = profiles.map((p) => `
      <li class="profile-row ${p.id === current ? 'current' : ''}">
        ${editing === p.id
          ? `<form class="profile-edit" data-form="rename" data-id="${p.id}">
               <label class="sr-only" for="rename-${p.id}">New name for ${esc(p.name)}</label>
               <input id="rename-${p.id}" name="name" maxlength="40" value="${esc(p.name)}" autocomplete="off">
               <button type="submit" class="btn primary">Save</button>
               <button type="button" class="btn quiet" data-act="cancel">Cancel</button>
             </form>`
          : `<button type="button" class="profile-pick" data-act="pick" data-id="${p.id}">
               <span class="profile-ring" aria-hidden="true">${esc(p.name.slice(0, 1).toUpperCase())}</span>
               <span class="profile-name">${esc(p.name)}</span>${p.id === current ? '<span class="muted"> (practising now)</span>' : ''}
             </button>
             <span class="profile-tools">
               <button type="button" class="btn quiet" data-act="rename" data-id="${p.id}" aria-label="Rename ${esc(p.name)}">Rename</button>
               <button type="button" class="btn quiet" data-act="remove" data-id="${p.id}" aria-label="Remove ${esc(p.name)}">Remove</button>
             </span>`}
      </li>`).join('');
    mount(`
      <div class="page-head"><div><h1>Who's practising?</h1><p>Each learner has their own progress, stats and settings on this computer.</p></div></div>
      ${profiles.length ? `<ul class="profile-list" aria-label="Learners">${rows}</ul>` : '<section class="panel locked-note"><div><h2>No learners yet</h2><p>Add your name to start. Everyone who practises on this computer can have their own.</p></div></section>'}
      <form class="panel profile-add" data-form="add">
        <label for="new-profile">${profiles.length ? 'Add a learner' : 'Your name'}</label>
        <div class="profile-add-row">
          <input id="new-profile" name="name" maxlength="40" autocomplete="off" placeholder="Name">
          <button type="submit" class="btn primary">${profiles.length ? 'Add' : 'Start'}</button>
        </div>
      </form>
      <p class="profile-message" role="status">${esc(message)}</p>`);
  };

  const load = async () => {
    try { profiles = await fetchProfiles(); message = ''; } catch { message = 'Kana Dojo could not reach its window. Is it still open?'; }
    draw();
    if (!profiles.length) document.getElementById('new-profile')?.focus();
  };

  const onClick = async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.dataset.id;
    const p = profiles.find((x) => x.id === id);
    if (b.dataset.act === 'pick') { if (id === current) { location.hash = '#/learn'; return; } await switchTo(id, { flush }); }
    if (b.dataset.act === 'rename') { editing = id; draw(); document.getElementById(`rename-${id}`)?.select(); }
    if (b.dataset.act === 'cancel') { editing = null; draw(); document.querySelector(`[data-act="rename"][data-id="${id}"]`)?.focus(); }
    if (b.dataset.act === 'remove' && p) {
      if (!confirm(`Remove ${p.name}? Their progress is kept in the data folder (deleted-profiles), but they won't appear here any more.`)) return;
      const out = await call('DELETE', `/api/profiles/${id}`);
      message = out.ok ? `${p.name} was removed. Their progress is kept in the data folder.` : 'That learner could not be removed.';
      if (out.ok && id === current) { try { localStorage.removeItem(LAST); } catch { /* fine */ } location.reload(); return; }
      await load();
    }
  };

  const onSubmit = async (e) => {
    const form = e.target.closest('form[data-form]');
    if (!form) return;
    e.preventDefault();
    const name = form.querySelector('input[name="name"]').value;
    if (form.dataset.form === 'add') {
      const out = await call('POST', '/api/profiles', { name });
      if (out.ok) { await switchTo(out.profile.id, { flush }); return; }
      message = out.error === 'name taken' ? 'There is already a learner with that name.' : 'Type a name first.';
      draw();
      document.getElementById('new-profile')?.focus();
    } else {
      const out = await call('PATCH', `/api/profiles/${form.dataset.id}`, { name });
      if (out.ok) { editing = null; message = `Renamed to ${out.profile.name}.`; if (form.dataset.id === current) document.dispatchEvent(new CustomEvent('kd-profile-renamed', { detail: out.profile })); }
      else message = out.error === 'name taken' ? 'There is already a learner with that name.' : 'Type a name first.';
      await load();
      document.querySelector(`[data-act="rename"][data-id="${form.dataset.id}"]`)?.focus();
    }
  };

  app.addEventListener('click', onClick);
  app.addEventListener('submit', onSubmit);
  load();
  return { destroy() { app.removeEventListener('click', onClick); app.removeEventListener('submit', onSubmit); } };
}
