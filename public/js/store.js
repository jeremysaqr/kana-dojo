// Loads and saves the progress document through the local server.
//
// Two rules keep progress safe (both came out of the persona bug hunt):
//  - Nothing is saved until the real document has loaded. If the first load fails, the tab keeps
//    retrying; answers given meanwhile are merged into the real progress once it arrives.
//  - Every save names the revision it was based on (If-Match). If another tab saved in between, the
//    server answers 409 with its copy; this tab merges (mergeProgress) and saves again, so neither
//    tab's answers are lost.
//  - Every save also carries an id (X-Save-Id) that the server records in the document. If a reply is
//    lost (the server was killed just after writing), the next response shows the id, so this tab
//    knows its save landed and merges from it instead of adding the same answers twice.
//  - Leaving the page with unsaved work writes it to an outbox in localStorage before the last-moment
//    save goes out (that save can hit a conflict, or no server, after the page is gone). The next page
//    load, in any tab, merges each outbox entry unless the server already recorded its save id.
import { migrate, defaultProgress, mergeProgress } from '/core/progress.js';

let current = null;      // the document the app works on
let base = null;         // the server's document as last loaded or saved (merge base)
let rev = null;          // the server revision `base` corresponds to
let loaded = false;      // true once the real document has been read from the server
let saveTimer = null;
let loadTimer = null;
let inflight = Promise.resolve();
let profile = null;      // the learner whose progress this tab works on (null: single-profile mode)
let pending = [];        // [{ id, doc }] saves sent but not acknowledged (oldest first)
let onStatus = () => {};
let onNotice = () => {};
const changeListeners = new Set();

export function setStatusHandler(fn) { onStatus = fn; }
/** Choose the learner before load(). Every request and outbox entry is then for that profile only. */
export function setProfile(id) { profile = id; }
export function getProfile() { return profile; }
const progressUrl = () => (profile ? `/api/progress?profile=${encodeURIComponent(profile)}` : '/api/progress');
/** Calm one-off notices (not errors), e.g. "your progress was restored from the backup". */
export function setNoticeHandler(fn) { onNotice = fn; }
/** Called when the document changed underneath the app (merged in from another tab or a late load). */
export function onExternalChange(fn) { changeListeners.add(fn); }

const strip = (doc) => { if (!doc) return doc; const { rev: _r, saveIds: _s, ...rest } = doc; return rest; };
const newSaveId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

async function fetchProgress() {
  const res = await fetch(progressUrl(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = await res.json();
  const recovered = res.headers.get('X-Progress-Recovered');
  return { doc: doc ? migrate(strip(doc), Date.now()) : null, rev: Number(res.headers.get('X-Progress-Rev')) || 0, recovered, saveIds: doc?.saveIds };
}

function recoveryNotice(header) {
  if (!header) return;
  const [kind, asideRaw] = header.split(';').map((x) => x.trim());
  const aside = (asideRaw || '').replace(/^aside=/, '').split(',').filter(Boolean).join(', ');
  onNotice(kind === 'bak'
    ? `Your progress file was damaged, so Kana Dojo restored the last good copy. The damaged file is kept in the data folder as ${aside}.`
    : `Kana Dojo couldn't read your progress file, so it started fresh. The unreadable file is kept in the data folder as ${aside}.`);
}

/** Take a freshly loaded server document: merge in anything done locally since `base`. */
function adopt({ doc, rev: r, saveIds }) {
  // A save whose reply was lost but which the server did record already holds our answers: merge from it.
  if (pending.length && Array.isArray(saveIds)) {
    const i = pending.findLastIndex((x) => saveIds.includes(x.id));
    if (i >= 0) { base = pending[i].doc; pending = pending.slice(i + 1); }
  }
  const remote = doc || defaultProgress(Date.now());
  const merged = current ? mergeProgress(base, current, remote) : remote;
  const changed = JSON.stringify(merged) !== JSON.stringify(current);
  const hadLocalWork = current && JSON.stringify(current) !== JSON.stringify(base ?? defaultProgress(current.createdAt));
  base = remote;
  rev = r;
  current = merged;
  return { changed, hadLocalWork };
}

// ---------- outbox: work left unsaved when a page went away ----------
const outbox = () => `kd-outbox-${profile || 'default'}-`;   // per learner: one learner's work never lands in another's
const myOutbox = new Set();     // entries this page wrote (taken back if the page comes back from bfcache)

// An entry holds the work (`local`), the last acknowledged server copy (`base`), and the saves still in
// flight (`inflight`, newest last): any of them may have landed without this page hearing back, so the
// merge must start from the newest one the server recorded, or it would count that save twice.
function writeOutbox(id) {
  const entry = { id, base, local: current, inflight: pending.slice(-3), t: Date.now() };
  try { localStorage.setItem(outbox() + id, JSON.stringify(entry)); myOutbox.add(id); return true; } catch { return false; }
}

/** Merge every outbox entry the server hasn't recorded into `current`. Returns true if anything was merged. */
function drainOutbox(saveIds) {
  let entries = [];
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(outbox())) continue;
      const raw = localStorage.getItem(key);
      localStorage.removeItem(key);                     // claim it first, so no other tab merges it too
      try { entries.push(JSON.parse(raw)); } catch { /* unreadable: drop */ }
    }
  } catch { return false; }
  const recorded = new Set(Array.isArray(saveIds) ? saveIds : []);
  // its own last-moment save landed: everything in the entry is already saved
  entries = entries.filter((e) => e && e.local && !recorded.has(e.id)).sort((a, b) => a.t - b.t);
  for (const e of entries) {
    const landed = (e.inflight || []).filter((x) => x && recorded.has(x.id)).pop();
    const from = landed ? landed.doc : e.base;
    current = mergeProgress(from ? migrate(from, Date.now()) : null, migrate(e.local, Date.now()), current);
  }
  return entries.length > 0;
}

export async function load() {
  // A few quick tries first: a server that is just starting (or restarting) answers within a second.
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const got = await fetchProgress();
      current = null;
      adopt(got);
      loaded = true;
      onStatus(null);
      recoveryNotice(got.recovered);
      if (drainOutbox(got.saveIds)) flush();
      return current;
    } catch {
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
    }
  }
  // Still nothing: run on an empty document but never save it over the real file. Keep trying.
  current = defaultProgress(Date.now());
  base = null;
  onStatus('Kana Dojo could not load your progress yet, so nothing is being saved. Is the Kana Dojo window still open? It will keep trying.');
  scheduleLoadRetry();
  return current;
}

function scheduleLoadRetry() {
  clearTimeout(loadTimer);
  loadTimer = setTimeout(async () => {
    try {
      const got = await fetchProgress();
      const { hadLocalWork } = adopt(got);
      loaded = true;
      onStatus(null);
      recoveryNotice(got.recovered);
      const fromOutbox = drainOutbox(got.saveIds);
      for (const fn of changeListeners) fn();
      if (hadLocalWork || fromOutbox) flush();
    } catch {
      scheduleLoadRetry();
    }
  }, 3000);
}

export function get() { return current; }

/** Replace the document and schedule a save. */
export function set(next) {
  current = next;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 250);
}

function failureMessage(res, body) {
  if (res && res.status === 413) return 'Progress is too large to save. Your answers are kept in this tab.';
  if (res && res.status >= 500 && ['EPERM', 'EACCES', 'EROFS'].includes(body?.code)) {
    return 'Kana Dojo can\'t write to its progress file. data\\progress.json may be read-only. Your answers are kept in this tab and will save once that is fixed.';
  }
  if (res && res.status >= 500) return 'Kana Dojo couldn\'t write its progress file. Your answers are kept in this tab and it will keep trying.';
  return 'Progress could not be saved. Is the Kana Dojo window still open? Your answers are kept in this tab and will save when it reconnects.';
}

export function flush({ keepalive = false } = {}) {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!loaded) return inflight;          // never save over progress this tab hasn't seen
  inflight = inflight.then(async () => {
    let res = null;
    let body = null;
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const sending = current;
        const id = newSaveId();
        pending = [...pending, { id, doc: sending }].slice(-10);
        res = await fetch(progressUrl(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'If-Match': String(rev), 'X-Save-Id': id },
          body: JSON.stringify(sending),
          keepalive,
        });
        body = await res.json().catch(() => null);
        if (res.status === 409 && body?.conflict) {
          // Another tab saved first: merge its copy with ours and try again.
          adopt({ doc: body.doc ? migrate(strip(body.doc), Date.now()) : null, rev: body.rev, saveIds: body.doc?.saveIds });
          for (const fn of changeListeners) fn();
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        pending = [];
        base = sending;
        rev = body?.rev ?? rev;
        onStatus(null);
        return;
      }
      throw new Error('kept conflicting');
    } catch {
      onStatus(failureMessage(res, body));
      clearTimeout(saveTimer);
      saveTimer = setTimeout(flush, 5000);
    }
  });
  return inflight;
}

/** Dismissing the recovery notice: a save tells the server the file is healthy again (it stops reporting). */
export function acknowledgeRecovery() { if (loaded) flush(); }

/** Pick up saves from other tabs when this one comes back into view. */
export async function refresh() {
  if (!loaded || saveTimer) return false;
  await inflight;
  try {
    const got = await fetchProgress();
    if (got.rev === rev) return false;
    const { changed } = adopt(got);
    if (changed) for (const fn of changeListeners) fn();
    return changed;
  } catch {
    return false;
  }
}

addEventListener('pagehide', () => {
  if (!current || JSON.stringify(current) === JSON.stringify(base)) return;   // nothing unsaved
  const id = newSaveId();
  writeOutbox(id);                                  // safe even if the save below never lands
  pending = [...pending, { id, doc: current }].slice(-10);   // if it does land and the page comes back, no double count
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!loaded) return;                              // never save over progress this tab hasn't seen
  const body = JSON.stringify(current);
  if (body.length > 60000) return;                  // over the browser's 64 KB keepalive limit: the outbox carries it
  try {
    fetch(progressUrl(), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': String(rev), 'X-Save-Id': id },
      body,
      keepalive: true,
    });
  } catch { /* the outbox has it */ }
});
// Restored from the back/forward cache: this page still holds its work, so take back its own outbox
// entries (another load merging them too would count the answers twice) and save normally.
// If another tab already merged our entry while we were away, our work is saved there: adopt the server
// copy as our base instead of saving the same answers again.
addEventListener('pageshow', (e) => {
  if (!e.persisted) return;
  let claimedElsewhere = false;
  try {
    for (const id of myOutbox) {
      if (localStorage.getItem(outbox() + id) === null) claimedElsewhere = true;
      else localStorage.removeItem(outbox() + id);
    }
  } catch { /* blocked: we keep our work and save it below */ }
  myOutbox.clear();
  if (claimedElsewhere) { base = current; pending = []; refresh(); return; }
  if (loaded && current && JSON.stringify(current) !== JSON.stringify(base)) flush();
});
addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
addEventListener('focus', () => { refresh(); });
