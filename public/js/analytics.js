// Derived views of the progress document for Stats and the drill lessons.
import { KANA, kanaById } from '/core/kana.js';
import { weaknessScore, masteryBand, practiceNeed } from '/core/weakness.js';
import { learnedSetKeys } from '/core/selection.js';

const DAY = 86400000;

export function statsOf(progress, id) {
  return progress.chars[id] || null;
}

/**
 * Characters seen at least once, most in need of practice first. Ranked by practiceNeed (recent
 * misses and lifetime accuracy together), so a long weak record isn't hidden by a few lucky answers.
 */
export function weakList(progress, now, limit = 8) {
  return KANA
    .filter((k) => progress.chars[k.id]?.attempts > 0)
    .map((k) => ({ k, s: progress.chars[k.id], w: practiceNeed(progress.chars[k.id], now) }))
    .filter((x) => masteryBand(x.s, now) !== 'mastered')
    .sort((a, b) => b.w - a.w)
    .slice(0, limit);
}

/**
 * Pairs the learner confuses: for each character, each wrong romaji answer is mapped to the
 * character(s) of the same script that the answer actually names. Counts are summed per pair.
 */
/** script|spelling → the kana that spelling names (canonical romaji or an accepted alternate). */
const byScriptSpelling = new Map();
for (const k of KANA) {
  for (const sp of [k.romaji, ...(k.alt || [])]) {
    const key = `${k.script}|${sp}`;
    if (!byScriptSpelling.has(key)) byScriptSpelling.set(key, []);
    if (!byScriptSpelling.get(key).includes(k)) byScriptSpelling.get(key).push(k);
  }
}

export function confusedPairs(progress, limit = 6) {
  const byScriptRomaji = byScriptSpelling;
  const pairs = new Map();
  for (const [id, s] of Object.entries(progress.chars)) {
    const k = kanaById.get(id);
    if (!k || !s.wrong) continue;
    for (const [romaji, n] of Object.entries(s.wrong)) {
      const others = byScriptRomaji.get(`${k.script}|${romaji}`) || [];
      for (const o of others) {
        if (o.id === k.id) continue;
        const key = [k.id, o.id].sort().join('~');
        const cur = pairs.get(key) || { a: kanaById.get(key.split('~')[0]), b: kanaById.get(key.split('~')[1]), count: 0 };
        cur.count += n;
        pairs.set(key, cur);
      }
    }
  }
  return [...pairs.values()].sort((x, y) => y.count - x.count).slice(0, limit);
}

/**
 * What one character gets mistaken for: each wrong romaji answer, with the same-script kana it names
 * (null when the answer isn't a kana reading, e.g. a typo in Type). Most frequent first.
 */
export function confusedWith(progress, id) {
  const k = kanaById.get(id);
  const s = progress.chars[id];
  if (!k || !s?.wrong) return [];
  return Object.entries(s.wrong)
    .sort((a, b) => b[1] - a[1])
    .map(([romaji, n]) => ({ romaji, n, k: (byScriptSpelling.get(`${k.script}|${romaji}`) || []).find((o) => o.id !== id) || null }));
}

/** Pool for drilling one character: it, what it's confused with, topped up from its own row (min 3). */
export function charDrillPool(progress, id) {
  const k = kanaById.get(id);
  if (!k) return null;
  const ids = [id];
  for (const c of confusedWith(progress, id)) if (c.k && !ids.includes(c.k.id) && ids.length < 6) ids.push(c.k.id);
  for (const o of KANA) if (ids.length < 3 && o.script === k.script && o.set === k.set && !ids.includes(o.id)) ids.push(o.id);
  return ids;
}

/** Pool for a "drill my weak spots" lesson: up to 6 weakest seen characters (min 3). */
export function weakDrillPool(progress, now) {
  const list = weakList(progress, now, 6);
  return list.length >= 3 ? list.map((x) => x.k.id) : null;
}

/** Pool for a confusion drill: characters from the most-confused pairs, up to 6. */
export function confusionDrillPool(progress) {
  const ids = [];
  for (const p of confusedPairs(progress, 10)) {
    for (const id of [p.a.id, p.b.id]) if (!ids.includes(id) && ids.length < 6) ids.push(id);
    if (ids.length >= 6) break;
  }
  return ids.length >= 2 ? ids : null;
}

/** Local-date key, YYYY-MM-DD. */
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Set of local days with at least one answered prompt (from lessons and answer history). */
export function activeDays(progress) {
  const days = new Set();
  for (const l of progress.lessons) if (l.prompts > 0 && (l.endedAt || l.startedAt)) days.add(dayKey(l.endedAt || l.startedAt));
  for (const s of Object.values(progress.chars)) for (const h of s.history || []) if (h.t) days.add(dayKey(h.t));
  return days;
}

/** Consecutive days practised ending today (or yesterday, if today has no practice yet). */
export function dailyStreak(progress, now) {
  const days = activeDays(progress);
  let d = new Date(now);
  d.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(d.getTime()))) d = new Date(d.getTime() - DAY);
  let n = 0;
  while (days.has(dayKey(d.getTime()))) { n++; d = new Date(d.getTime() - DAY); }
  return n;
}

/** Accuracy per active day over the last `span` days, from lesson records. */
export function accuracyTrend(progress, now, span = 30) {
  const byDay = new Map();
  for (const l of progress.lessons) {
    const t = l.endedAt || l.startedAt;
    if (!t || l.prompts === 0 || now - t > span * DAY) continue;
    const k = dayKey(t);
    const cur = byDay.get(k) || { prompts: 0, correct: 0, t };
    cur.prompts += l.prompts;
    cur.correct += l.correct;
    byDay.set(k, cur);
  }
  return [...byDay.entries()].sort().map(([day, v]) => ({ day, t: v.t, accuracy: v.correct / v.prompts, prompts: v.prompts }));
}

export function learnedPool(progress) {
  const sets = new Set(learnedSetKeys(progress));
  return KANA.filter((k) => sets.has(`${k.script}:${k.set}`)).map((k) => k.id);
}

export function relativeTime(ts, now) {
  if (!ts) return 'never';
  const diff = now - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.round(diff / 60000)} min ago`;
  if (diff < DAY) return `${Math.round(diff / 3600000)} h ago`;
  const days = Math.round(diff / DAY);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}
