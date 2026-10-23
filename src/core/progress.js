// Progress document: defaults, migration and pure update helpers. Never mutates its input.
import { SCRIPTS, SET_DEFS, kanaById, allSetKeys } from './kana.js';
import { wordById } from './words.js';
import { emptyStats, updateStats, wrongMap, HISTORY_CAP, GIVEN_CAP } from './weakness.js';

export const PROGRESS_VERSION = 1;
export const LESSONS_CAP = 500;
export const RUNS_CAP = 500;
const THEMES = ['system', 'light', 'dark'];
const KANA_FONTS = ['textbook', 'print'];
const LESSON_KINDS = ['set', 'mix', 'type', 'weak', 'confusion', 'read', 'meaning'];
const VALID_SET_KEYS = new Set(allSetKeys());
const VALID_SET_IDS = new Set(SET_DEFS.map((s) => s.id));

const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const num = (x) => typeof x === 'number' && Number.isFinite(x);
const count = (x) => (num(x) && x >= 0 ? Math.floor(x) : 0);
const tsOrNull = (x) => (num(x) ? x : null);

export function defaultProgress(now) {
  return {
    version: PROGRESS_VERSION,
    createdAt: num(now) ? now : 0,
    settings: { muted: false, theme: 'system', kanaFont: 'textbook' },
    chars: {},
    sets: {},
    mixes: [],
    typeRuns: [],
    words: {},          // word id → CharStats-shaped stats (Levels 4–5)
    wordRuns: [],       // Level 4 passes: { passedAt, prompts }
    meaningRuns: [],    // Level 5 passes: { passedAt, prompts }
    lastL0Set: { hiragana: null, katakana: null },
    lessons: [],
  };
}

function cleanStats(s) {
  if (!isObj(s)) return emptyStats();
  const history = Array.isArray(s.history)
    ? s.history.filter(isObj).map((h) => ({
        t: tsOrNull(h.t),
        ok: !!h.ok,
        given: typeof h.given === 'string' ? h.given.slice(0, GIVEN_CAP) : '',
        level: num(h.level) ? h.level : null,
      })).slice(-HISTORY_CAP)
    : [];
  const wrong = wrongMap();
  if (isObj(s.wrong)) for (const [k, v] of Object.entries(s.wrong)) if (count(v) > 0) { const key = k.slice(0, GIVEN_CAP); wrong[key] = (wrong[key] || 0) + count(v); }
  const attempts = count(s.attempts);
  return {
    attempts,
    correct: Math.min(count(s.correct), attempts),
    misses: Math.min(count(s.misses), attempts),
    streak: count(s.streak),
    lastSeen: tsOrNull(s.lastSeen),
    ewmaErr: num(s.ewmaErr) && attempts > 0 ? Math.min(1, Math.max(0, s.ewmaErr)) : null,
    history,
    wrong,
  };
}

function cleanSetEntry(e) {
  const out = { passed: {} };
  if (isObj(e)) {
    if (isObj(e.passed)) for (const [lvl, ts] of Object.entries(e.passed)) if (/^[0-3]$/.test(lvl) && num(ts)) out.passed[lvl] = ts;
    if (num(e.lastPlayed)) out.lastPlayed = e.lastPlayed;
  }
  return out;
}

function cleanLesson(l) {
  if (!isObj(l)) return null;
  return {
    id: typeof l.id === 'string' || num(l.id) ? l.id : null,
    script: ['hiragana', 'katakana', 'mixed'].includes(l.script) ? l.script : 'mixed',
    level: num(l.level) ? l.level : 0,
    kind: LESSON_KINDS.includes(l.kind) ? l.kind : 'set',
    ...(l.drill === true ? { drill: true } : {}),
    sets: Array.isArray(l.sets) ? l.sets.filter((k) => typeof k === 'string') : [],
    startedAt: tsOrNull(l.startedAt),
    endedAt: tsOrNull(l.endedAt),
    result: l.result === 'passed' ? 'passed' : 'quit',
    prompts: count(l.prompts),
    correct: count(l.correct),
    missedIds: Array.isArray(l.missedIds) ? l.missedIds.filter((x) => typeof x === 'string') : [],
  };
}

/**
 * Return a valid progress document built from `doc`, keeping every valid field and replacing
 * anything missing or malformed with defaults. Never throws. Unknown char ids / set keys dropped.
 */
export function migrate(doc, now) {
  const base = defaultProgress(now);
  if (!isObj(doc)) return base;
  try {
    const out = base;
    if (num(doc.createdAt)) out.createdAt = doc.createdAt;
    if (isObj(doc.settings)) {
      if (typeof doc.settings.muted === 'boolean') out.settings.muted = doc.settings.muted;
      if (THEMES.includes(doc.settings.theme)) out.settings.theme = doc.settings.theme;
      if (KANA_FONTS.includes(doc.settings.kanaFont)) out.settings.kanaFont = doc.settings.kanaFont;
    }
    if (isObj(doc.chars)) for (const [id, s] of Object.entries(doc.chars)) if (kanaById.has(id)) out.chars[id] = cleanStats(s);
    if (isObj(doc.sets)) for (const [k, e] of Object.entries(doc.sets)) if (VALID_SET_KEYS.has(k)) out.sets[k] = cleanSetEntry(e);
    if (Array.isArray(doc.mixes)) {
      out.mixes = doc.mixes
        .filter((m) => isObj(m) && Array.isArray(m.sets) && m.sets.every((k) => typeof k === 'string'))
        .map((m) => ({ sets: [...m.sets], passedAt: tsOrNull(m.passedAt) }))
        .slice(-RUNS_CAP);
    }
    for (const k of ['typeRuns', 'wordRuns', 'meaningRuns']) {
      if (Array.isArray(doc[k])) {
        out[k] = doc[k].filter(isObj)
          .map((r) => ({ passedAt: tsOrNull(r.passedAt), prompts: count(r.prompts) }))
          .slice(-RUNS_CAP);
      }
    }
    if (isObj(doc.words)) for (const [id, s] of Object.entries(doc.words)) if (wordById.has(id)) out.words[id] = cleanStats(s);
    if (isObj(doc.lastL0Set)) {
      for (const sc of SCRIPTS) {
        const v = doc.lastL0Set[sc];
        if (VALID_SET_IDS.has(v)) out.lastL0Set[sc] = v;
      }
    }
    if (Array.isArray(doc.lessons)) out.lessons = doc.lessons.map(cleanLesson).filter(Boolean).slice(-LESSONS_CAP);
    return out;
  } catch {
    return defaultProgress(now);
  }
}

/** Record one answer for a character (updates chars[charId] via weakness.updateStats). */
export function recordAnswer(progress, { charId, ok, given, level, now }) {
  if (!kanaById.has(charId)) throw new Error(`recordAnswer: unknown id ${charId}`);
  const prev = progress.chars?.[charId] || emptyStats();
  return { ...progress, chars: { ...progress.chars, [charId]: updateStats(prev, { ok, given, level, now }) } };
}

/** Mark a set passed at a level. Keeps the first pass timestamp; updates lastPlayed. */
export function markSetPassed(progress, setKey, level, now) {
  const prev = progress.sets?.[setKey] || { passed: {} };
  const lvl = String(level);
  const passed = { ...(prev.passed || {}) };
  if (passed[lvl] == null) passed[lvl] = now;
  return { ...progress, sets: { ...progress.sets, [setKey]: { ...prev, passed, lastPlayed: now } } };
}

/** Append a LessonRecord (newest last, capped at 500) and bump lastPlayed on its sets. */
export function recordLesson(progress, record) {
  const lessons = [...(progress.lessons || []), { ...record }].slice(-LESSONS_CAP);
  const ts = num(record?.endedAt) ? record.endedAt : record?.startedAt;
  let sets = progress.sets || {};
  if (num(ts) && Array.isArray(record?.sets)) {
    sets = { ...sets };
    for (const k of record.sets) sets[k] = { passed: {}, ...(sets[k] || {}), lastPlayed: ts };
  }
  return { ...progress, lessons, sets };
}

/** Record a Level 2 pass of a pair of sets. */
export function recordMix(progress, sets, now) {
  return { ...progress, mixes: [...(progress.mixes || []), { sets: [...sets], passedAt: now }].slice(-RUNS_CAP) };
}

/** Record a Level 3 pass. */
export function recordTypeRun(progress, now, prompts) {
  return { ...progress, typeRuns: [...(progress.typeRuns || []), { passedAt: now, prompts }].slice(-RUNS_CAP) };
}

/** Record one answer for a word (Levels 4–5), in progress.words. */
export function recordWordAnswer(progress, { wordId, ok, given, level, now }) {
  if (!wordById.has(wordId)) throw new Error(`recordWordAnswer: unknown id ${wordId}`);
  const prev = progress.words?.[wordId] || emptyStats();
  return { ...progress, words: { ...(progress.words || {}), [wordId]: updateStats(prev, { ok, given, level, now }) } };
}

/** Record a Level 4 ('read') or Level 5 ('meaning') pass. */
export function recordWordRun(progress, kind, now, prompts) {
  const key = kind === 'meaning' ? 'meaningRuns' : 'wordRuns';
  return { ...progress, [key]: [...(progress[key] || []), { passedAt: now, prompts }].slice(-RUNS_CAP) };
}

export function setLastL0(progress, script, setId) {
  return { ...progress, lastL0Set: { ...(progress.lastL0Set || { hiragana: null, katakana: null }), [script]: setId } };
}

// ---------------------------------------------------------------------------------------------
// Three-way merge, for two tabs (or a tab that worked offline) saving the same document.

const sameStats = (a, b) => (a?.attempts || 0) === (b?.attempts || 0) && (a?.lastSeen ?? null) === (b?.lastSeen ?? null);
const histKey = (h) => `${h.t}|${h.ok ? 1 : 0}|${h.given}|${h.level}`;

/** Remote stats plus whatever local added since base (counts add up; the newer answer sets the run state). */
function mergeStats(b, l, r) {
  if (!l) return r;
  if (!r) return l;
  if (sameStats(l, b)) return r;
  if (sameStats(r, b)) return l;
  const base = b || emptyStats();
  const d = (k) => Math.max(0, (l[k] || 0) - (base[k] || 0));
  const wrong = wrongMap(r.wrong);
  for (const [k, v] of Object.entries(l.wrong || {})) {
    const add = v - ((base.wrong && base.wrong[k]) || 0);
    if (add > 0) wrong[k] = (wrong[k] || 0) + add;
  }
  // local's new answers = its history minus base's, counted (two identical answers in the same
  // millisecond, one per tab, are two answers, not one)
  const inBase = new Map();
  for (const h of base.history || []) inBase.set(histKey(h), (inBase.get(histKey(h)) || 0) + 1);
  const fresh = [];
  for (const h of l.history || []) {
    const k = histKey(h);
    if (inBase.get(k) > 0) inBase.set(k, inBase.get(k) - 1); else fresh.push(h);
  }
  const history = [...(r.history || []), ...fresh].sort((x, y) => (x.t ?? 0) - (y.t ?? 0)).slice(-HISTORY_CAP);
  const newer = (l.lastSeen ?? 0) >= (r.lastSeen ?? 0) ? l : r;
  return {
    attempts: (r.attempts || 0) + d('attempts'),
    correct: (r.correct || 0) + d('correct'),
    misses: (r.misses || 0) + d('misses'),
    streak: newer.streak || 0,
    lastSeen: Math.max(l.lastSeen ?? 0, r.lastSeen ?? 0) || null,
    ewmaErr: newer.ewmaErr ?? null,
    history,
    wrong,
  };
}

function mergeStatsMap(b = {}, l = {}, r = {}) {
  const out = {};
  for (const id of new Set([...Object.keys(l), ...Object.keys(r)])) out[id] = mergeStats(b[id], l[id], r[id]);
  return out;
}

/** Union of two record lists, keyed by `key`, sorted by `time`, capped. */
function unionBy(l = [], r = [], key, time, cap) {
  const m = new Map();
  for (const x of [...r, ...l]) if (!m.has(key(x))) m.set(key(x), x);
  return [...m.values()].sort((a, b) => (time(a) ?? 0) - (time(b) ?? 0)).slice(-cap);
}

/**
 * Merge a local document into a newer remote one, given the common `base` both started from
 * (null = the default document). Nothing either side added is lost:
 *  - chars / words: counts are remote + (local − base); history gains local's new answers;
 *  - sets: per-level passes are unioned (earliest pass time kept), lastPlayed = latest;
 *  - lessons and every pass list: unioned;
 *  - settings and lastL0Set: local where local changed them since base, otherwise remote.
 * Pure; returns a new document shaped like `remote`.
 */
export function mergeProgress(base, local, remote) {
  const b = base || defaultProgress(local?.createdAt);
  if (!remote) return local;
  if (!local) return remote;
  const pick = (k, sub) => (JSON.stringify(local[k]?.[sub]) !== JSON.stringify(b[k]?.[sub]) ? local[k]?.[sub] : remote[k]?.[sub]);
  const settings = {};
  for (const k of new Set([...Object.keys(remote.settings || {}), ...Object.keys(local.settings || {})])) settings[k] = pick('settings', k);
  const lastL0Set = {};
  for (const sc of SCRIPTS) lastL0Set[sc] = pick('lastL0Set', sc) ?? null;
  const sets = {};
  for (const k of new Set([...Object.keys(remote.sets || {}), ...Object.keys(local.sets || {})])) {
    const lv = local.sets?.[k], rv = remote.sets?.[k];
    const passed = { ...(rv?.passed || {}) };
    for (const [lvl, ts] of Object.entries(lv?.passed || {})) passed[lvl] = passed[lvl] == null ? ts : Math.min(passed[lvl], ts);
    const lastPlayed = Math.max(lv?.lastPlayed ?? 0, rv?.lastPlayed ?? 0);
    sets[k] = { passed, ...(lastPlayed ? { lastPlayed } : {}) };
  }
  const runKey = (x) => `${x.passedAt}|${x.prompts ?? ''}|${(x.sets || []).join()}`;
  const runs = (k) => unionBy(local[k], remote[k], runKey, (x) => x.passedAt, RUNS_CAP);
  return {
    ...remote,
    createdAt: Math.min(local.createdAt ?? Infinity, remote.createdAt ?? Infinity) || remote.createdAt,
    settings,
    chars: mergeStatsMap(b.chars, local.chars, remote.chars),
    words: mergeStatsMap(b.words, local.words, remote.words),
    sets,
    mixes: runs('mixes'),
    typeRuns: runs('typeRuns'),
    wordRuns: runs('wordRuns'),
    meaningRuns: runs('meaningRuns'),
    lastL0Set,
    lessons: unionBy(local.lessons, remote.lessons, (x) => String(x.id), (x) => x.endedAt || x.startedAt, LESSONS_CAP),
  };
}

/** Map of every word id → stats (emptyStats() for words never answered). */
export function wordStatsById(progress) {
  const m = new Map();
  for (const id of wordById.keys()) m.set(id, progress?.words?.[id] || emptyStats());
  return m;
}

/** Map of every charId → stats (emptyStats() for chars never answered). */
export function statsById(progress) {
  const m = new Map();
  for (const id of kanaById.keys()) m.set(id, progress?.chars?.[id] || emptyStats());
  return m;
}
