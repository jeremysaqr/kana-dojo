// Kana Dojo app shell: routing, top bar, settings, keyboard dispatch.
import * as store from './store.js';
import * as speech from './speech.js';
import { icon } from './icons.js';
import { renderHome } from './views/home.js';
import { renderStats } from './views/stats.js';
import { startLesson, isLessonActive, endLessonSilently, lessonHasProgress, pauseLesson, resumeLesson } from './views/lesson.js';
import { renderProfiles, fetchProfiles, rememberedProfile } from './views/profiles.js';

export const ui = {
  script: 'hiragana',
  view: null,          // object with optional onKey(e) and destroy()
};

const app = document.getElementById('app');
const banner = document.getElementById('banner');
const muteBtn = document.getElementById('mute-btn');
const settingsBtn = document.getElementById('settings-btn');
const settingsEl = document.getElementById('settings');

store.setStatusHandler((msg) => {
  banner.hidden = !msg;
  banner.textContent = msg || '';
});
// Calm one-off notices (a recovered progress file): shown until dismissed, never alarming.
const notice = document.getElementById('notice');
store.setNoticeHandler((msg) => {
  notice.hidden = !msg;
  notice.innerHTML = msg ? `<p></p><button type="button" class="btn quiet" data-dismiss>OK</button>` : '';
  if (msg) notice.querySelector('p').textContent = msg;
});
notice.addEventListener('click', (e) => {
  if (!e.target.closest('[data-dismiss]')) return;
  notice.hidden = true; notice.innerHTML = '';
  store.acknowledgeRecovery();
  focusMain();
});
// Another tab saved, or progress arrived late: show it, unless a lesson is running (it reads the store itself).
store.onExternalChange(() => { applySettings(); if (!isLessonActive()) route({ keepFocus: true }); });

function setView(view) {
  ui.view?.destroy?.();
  ui.view = view;
}

export function mount(html) {
  app.innerHTML = html;
  // Key hints are for sighted keyboard users; keep them out of button names ("Next", not "Next Enter").
  for (const k of app.querySelectorAll('button kbd, a kbd')) k.setAttribute('aria-hidden', 'true');
}

export function focusMain() {
  app.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

// ---------- settings ----------
function applySettings() {
  const s = store.get().settings;
  const root = document.documentElement;
  if (s.theme === 'system') delete root.dataset.theme; else root.dataset.theme = s.theme;
  if (s.kanaFont === 'print') root.dataset.kanaFont = 'print'; else delete root.dataset.kanaFont;
  try { localStorage.setItem('kd-theme', s.theme); localStorage.setItem('kd-font', s.kanaFont); } catch {}
  speech.setMuted(s.muted);
  muteBtn.innerHTML = icon(s.muted ? 'soundOff' : 'soundOn');
  muteBtn.setAttribute('aria-pressed', String(s.muted));   // the pressed state says it; the name stays fixed
  muteBtn.setAttribute('aria-label', 'Mute sound');
  muteBtn.title = s.muted ? 'Sound off' : 'Sound on';
}

export function updateSettings(patch) {
  const p = store.get();
  if (!p) return;                                   // still loading
  store.set({ ...p, settings: { ...p.settings, ...patch } });
  applySettings();
  // Update the open popover in place: a re-render would drop focus from the pressed button.
  const s = store.get().settings;
  for (const b of settingsEl.querySelectorAll('button[data-set]')) b.setAttribute('aria-pressed', String(s[b.dataset.set] === b.dataset.val));
}

function renderSettings() {
  const s = store.get().settings;
  const seg = (name, opts, cur, label) => `<div class="seg" role="group" aria-label="${label}">${opts.map(([v, l]) =>
    `<button type="button" data-set="${name}" data-val="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  let voiceNote;
  if (!speech.isSupported()) voiceNote = 'This browser has no speech support, so lessons run silently.';
  else if (!speech.hasJapaneseVoice()) voiceNote = 'No Japanese voice is installed, so lessons run silently. In Windows: Settings › Time & language › Language & region › Add a language › Japanese, with Speech ticked. Then restart the browser.';
  else voiceNote = 'Japanese voice found. Sound plays while studying and after each answer, never before.';
  settingsEl.innerHTML = `
    <h2>Settings</h2>
    <div class="row"><span>Theme</span>${seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], s.theme, 'Theme')}</div>
    <div class="row"><span>Kana style</span>${seg('kanaFont', [['textbook', '<span class="kana" style="font-family:var(--font-kana-textbook)">あ</span>&nbsp;Textbook'], ['print', '<span style="font-family:var(--font-kana-print)">あ</span>&nbsp;Print']], s.kanaFont, 'Kana style')}</div>
    <p class="voice-note">${voiceNote}</p>`;
}
speech.onVoicesChanged(() => { if (!settingsEl.hidden) renderSettings(); });

settingsEl.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-set]');
  if (b) updateSettings({ [b.dataset.set]: b.dataset.val });
});
export function toggleSettings(open = settingsEl.hidden) {
  if (!store.get()) return;                         // still loading
  settingsEl.hidden = !open;
  settingsBtn.setAttribute('aria-expanded', String(open));
  if (open) { renderSettings(); settingsEl.querySelector('button')?.focus(); }
}
settingsBtn.innerHTML = icon('settings');
settingsBtn.addEventListener('click', () => toggleSettings());
document.addEventListener('click', (e) => {
  // composedPath still holds the popover when the clicked node was replaced during the click.
  const path = e.composedPath();
  if (!settingsEl.hidden && !path.includes(settingsEl) && !path.includes(settingsBtn)) toggleSettings(false);
});
// Settings closes when focus leaves it (Tab away), so it never sits open while keys drive a quiz.
// (and when focus then leaves the gear button too: Shift+Tab out lands there first)
const closeIfAway = (e) => {
  if (!settingsEl.hidden && e.relatedTarget && !settingsEl.contains(e.relatedTarget) && e.relatedTarget !== settingsBtn) toggleSettings(false);
};
settingsEl.addEventListener('focusout', closeIfAway);
settingsBtn.addEventListener('focusout', closeIfAway);
muteBtn.addEventListener('click', () => { if (store.get()) updateSettings({ muted: !store.get().settings.muted }); });

// ---------- script toggle ----------
const scriptToggle = document.getElementById('script-toggle');
function applyScript() {
  for (const b of scriptToggle.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.script === ui.script));
}
scriptToggle.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-script]');
  if (!b || b.dataset.script === ui.script) return;
  ui.script = b.dataset.script;
  try { localStorage.setItem('kd-script', ui.script); } catch {}
  applyScript();
  if (!isLessonActive()) route();
});

// ---------- leaving a lesson ----------
const leaveDialog = document.getElementById('leave-dialog');
/** Ask before ending a quiz that has answers. Resolves true to leave, false to keep going. */
export function confirmLeave() {
  return new Promise((resolve) => {
    const done = (v) => { leaveDialog.removeEventListener('click', onClick); leaveDialog.removeEventListener('cancel', onCancel); if (leaveDialog.open) leaveDialog.close(); resolve(v); };
    const onClick = (e) => { const b = e.target.closest('[data-leave]'); if (b) done(b.dataset.leave === 'end'); };
    const onCancel = (e) => { e.preventDefault(); done(false); };
    leaveDialog.addEventListener('click', onClick);
    leaveDialog.addEventListener('cancel', onCancel);
    leaveDialog.showModal();
  });
}

function setScriptToggleEnabled(on) {
  for (const b of scriptToggle.querySelectorAll('button')) b.disabled = !on;
}

// ---------- routing ----------
const TABS = ['learn', 'recall', 'mix', 'type', 'words', 'stats', 'profiles'];
let currentHash = location.hash;
let restoringHash = false;

async function onHashChange() {
  if (restoringHash) { restoringHash = false; return; }
  if (lessonHasProgress()) {
    const target = location.hash;
    restoringHash = true;
    history.replaceState(null, '', currentHash || '#/learn');   // stay put while asking
    restoringHash = false;
    pauseLesson();                                               // no auto-advance behind the dialog
    if (!(await confirmLeave())) { resumeLesson(); return; }
    history.replaceState(null, '', target);
  }
  route();
}

export function route({ keepFocus = false } = {}) {
  currentHash = location.hash;
  setScriptToggleEnabled(true);
  const tab = (location.hash.replace(/^#\/?/, '').split('/')[0]) || 'learn';
  const t = TABS.includes(tab) ? tab : 'learn';
  if (isLessonActive()) endLessonSilently();
  for (const a of document.querySelectorAll('.tabs a')) {
    if (a.dataset.tab === t) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  scriptToggle.hidden = t === 'mix' || t === 'type' || t === 'profiles';
  if (t === 'profiles' || !store.getProfile()) {
    setView(renderProfiles({ current: store.getProfile(), flush: () => store.flush() }));
    if (!keepFocus) focusMain();
    return;
  }
  setView(t === 'stats' ? renderStats() : renderHome(t));
  if (!keepFocus) focusMain();
}

export function launchLesson(spec) {
  setView(startLesson(spec));
  setScriptToggleEnabled(false);
}

addEventListener('hashchange', onHashChange);

document.addEventListener('keydown', (e) => {
  if (leaveDialog.open) return;                       // the dialog handles its own keys
  if (e.key === 'Escape' && !settingsEl.hidden) { toggleSettings(false); settingsBtn.focus(); return; }
  if (!settingsEl.hidden && settingsEl.contains(e.target)) return;   // keys in Settings stay in Settings
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  ui.view?.onKey?.(e);
});

// ---------- learner (profile) ----------
const profileBtn = document.getElementById('profile-btn');
function showProfile(p) {
  profileBtn.hidden = !p;
  if (!p) return;
  profileBtn.querySelector('.profile-initial').textContent = p.name.slice(0, 1).toUpperCase();
  profileBtn.querySelector('.profile-label').textContent = p.name;
  profileBtn.setAttribute('aria-label', `Learner: ${p.name}. Switch learner`);
}
profileBtn.addEventListener('click', () => { location.hash = '#/profiles'; });
document.addEventListener('kd-profile-renamed', (e) => showProfile(e.detail));

/** Which learner to open: the one remembered on this computer, or the only one there is. */
async function chooseProfile() {
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const list = await fetchProfiles();
      const remembered = rememberedProfile();
      return list.find((p) => p.id === remembered) || (list.length === 1 ? list[0] : null);
    } catch { await new Promise((r) => setTimeout(r, 300 * (attempt + 1))); }
  }
  return null;
}

// ---------- boot ----------
(async function boot() {
  if (/^kd-boot-\d+$/.test(window.name)) window.name = '';   // the code loaded: reset the reload count (index.html)
  try { const s = localStorage.getItem('kd-script'); if (s === 'hiragana' || s === 'katakana') ui.script = s; } catch {}
  applyScript();
  const who = await chooseProfile();
  if (!who) { route(); return; }                      // fresh install or several learners: "Who's practising?"
  store.setProfile(who.id);
  try { localStorage.setItem('kd-profile', who.id); } catch {}
  showProfile(who);
  await store.load();
  applySettings();
  route();
})();

// Read-only hooks for automated checks (no product behaviour depends on these).
window.__kanaDojo = { speechAudit: speech.audit, isGateOpen: speech.isGateOpen, store };
