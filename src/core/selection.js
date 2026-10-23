// In-lesson next-prompt picking and lesson-level suggestions. Pure.
import { SET_DEFS, allSetKeys, charsInSet, charsInSetKey, setKey } from './kana.js';
import { emptyStats, weaknessScore } from './weakness.js';
import { pickWeighted } from './rng.js';

/** Selection tuning constants. */
export const SELECTION = Object.freeze({
  BASE_WEIGHT: 0.25,      // every eligible char gets this, so strong chars still appear
  STARVE_START: 0.6,      // boost starts once unseen for more than START × poolSize turns
  STARVE_SLOPE: 4,        // boost = SLOPE × max(0, gap/poolSize − START)², quadratic
  SOFT_WINDOW_FACTOR: 2,  // weighted picks keep every char within 2×poolSize turns when possible
  HARD_WINDOW_FACTOR: 3,  // absolute bound: even re-asks yield so no char waits > 3×poolSize turns
  WEAK_SCORE: 0.45,       // sampleRun with maxWeak: a seen item scoring at least this counts as weak
});

/** Stats lookup accepting a Map, a plain object, or nothing. */
export function getStats(statsById, id) {
  if (!statsById) return emptyStats();
  const s = statsById instanceof Map ? statsById.get(id) : statsById[id];
  return s || emptyStats();
}

/**
 * Pick the next character for a streak-based ('type' mode, Level 3) lesson, where repeats are
 * allowed. Choice-mode lessons use pickNextInRun instead.
 *
 * @param {object} a
 * @param {string[]} a.poolIds    distinct char ids in the lesson
 * @param {Map|object} a.statsById
 * @param {string|null} a.lastId  the previous prompt's id
 * @param {number} a.turn         the turn being picked (1-based; first prompt is turn 1)
 * @param {{id:string,dueTurn:number}[]} a.requeue  scheduled re-asks of missed chars
 * @param {Object<string,number>} a.sinceSeen  id → turn it was last shown in this lesson
 *                                (missing = never shown; treated as shown at turn 0)
 * @param {number} a.now
 * @param {() => number} a.rng
 *
 * Algorithm:
 *  1. Requeue: serve the earliest-due requeued miss (dueTurn ≤ turn), skipping lastId — a due
 *     item equal to lastId simply stays due and is served next turn ("pushed by one").
 *  2. Otherwise weighted random over the pool minus lastId (unless pool size is 1), weight =
 *     BASE_WEIGHT + weaknessScore + starvation boost, where the boost grows quadratically once a
 *     char has been unseen for more than 0.6 × poolSize turns.
 *  Bounded window (see feasibleAfter, an earliest-deadline-first check that counts the slots
 *  already reserved by pending re-asks):
 *   - weighted picks are restricted to chars that keep every char reappearing within
 *     2 × poolSize turns (soft window — the practical bound);
 *   - a due re-ask is served unless doing so would break the 3 × poolSize hard window. That only
 *     happens in long runs of consecutive misses, where back-to-back re-asks would otherwise
 *     starve the rest of the pool; the re-ask then waits a turn or two.
 */
export function pickNext({ poolIds, statsById, lastId = null, turn = 1, requeue = [], sinceSeen = {}, now, rng }) {
  const pool = [...new Set(poolIds || [])];
  if (pool.length === 0) throw new Error('pickNext: empty pool');
  if (pool.length === 1) return pool[0];
  const size = pool.length;
  const seen = sinceSeen || {};
  const lastShown = (id) => (Number.isFinite(seen[id]) ? seen[id] : 0);
  const pending = (requeue || []).filter((r) => r && pool.includes(r.id));
  const fits = (W) => (id) => feasibleAfter(id, pool, turn, lastShown, pending, W * size);
  const fitsSoft = fits(SELECTION.SOFT_WINDOW_FACTOR);
  const fitsHard = fits(SELECTION.HARD_WINDOW_FACTOR);

  // 1. requeue
  const due = pending
    .filter((r) => r.dueTurn <= turn && r.id !== lastId)
    .sort((a, b) => a.dueTurn - b.dueTurn);
  if (due.length > 0 && fitsHard(due[0].id)) return due[0].id;

  // 2. weighted, restricted to picks that keep the bounded window feasible
  const others = pool.filter((id) => id !== lastId);
  let candidates = others.filter(fitsSoft);
  if (candidates.length === 0) candidates = others.filter(fitsHard);
  if (candidates.length === 0) {
    // Cannot happen while the invariant holds; degrade to earliest deadline.
    const minLast = Math.min(...others.map(lastShown));
    candidates = others.filter((id) => lastShown(id) === minLast);
  }
  const weights = candidates.map((id) => {
    const over = Math.max(0, (turn - lastShown(id)) / size - SELECTION.STARVE_START);
    const boost = SELECTION.STARVE_SLOPE * over * over;
    return SELECTION.BASE_WEIGHT + weaknessScore(getStats(statsById, id), now) + boost;
  });
  return pickWeighted(candidates, weights, rng);
}

/**
 * Pick the next character for a run-based ('choice' mode, Levels 0–2) lesson, where a streak is
 * one pass through every pool char exactly once.
 *
 * @param {object} a
 * @param {string[]} a.poolIds
 * @param {Map|object} a.statsById
 * @param {string|null} a.lastId
 * @param {number} a.turn                    turn being picked (1-based)
 * @param {{id:string,dueTurn:number}[]} a.requeue
 * @param {string[]} a.lapCovered            ids answered correctly in the current run
 * @param {Object<string,number>} [a.sinceSeen]  Type only: id → turn last shown. Adds the starvation
 *                                           boost, so a strong kana doesn't wait hundreds of prompts
 *                                           behind weak ones that keep ending runs early.
 * @param {number} [a.poolSize]              size of the whole pool the run was sampled from
 * @param {number} a.now
 * @param {() => number} a.rng
 *
 * Algorithm:
 *  1. Requeue: the earliest-due re-ask (dueTurn ≤ turn) that is not lastId. A re-asked id is never
 *     in lapCovered, because a miss resets the run.
 *  2. Otherwise weighted random (BASE_WEIGHT + weaknessScore, so weak chars tend to come earlier in
 *     the run) over uncovered pool ids, excluding lastId and ids with a pending re-ask (so a missed
 *     char comes back exactly at its 2–3 turn slot).
 *  Fallbacks, only reachable in tiny pools or bursts of misses: a pending (not yet due) re-ask,
 *  earliest first; then lastId (only possible when the pool has a single char).
 *  No char repeats within a run. In Type (sinceSeen given) the weight also gets the starvation boost,
 *  because a miss ends a sampled run after a few prompts and weak-first ordering would otherwise leave
 *  strong kana unasked for hundreds of prompts.
 */
export function pickNextInRun({ poolIds, statsById, lastId = null, turn = 1, requeue = [], lapCovered = [], now, rng, sinceSeen = null, poolSize = null }) {
  const pool = [...new Set(poolIds || [])];
  if (pool.length === 0) throw new Error('pickNextInRun: empty pool');
  const covered = new Set(lapCovered || []);
  const uncovered = pool.filter((id) => !covered.has(id));
  if (uncovered.length === 0) throw new Error('pickNextInRun: run already complete');
  const pending = (requeue || [])
    .filter((r) => r && uncovered.includes(r.id))
    .sort((a, b) => a.dueTurn - b.dueTurn);

  const due = pending.filter((r) => r.dueTurn <= turn && r.id !== lastId);
  if (due.length > 0) return due[0].id;

  const pendingIds = new Set(pending.map((r) => r.id));
  const candidates = uncovered.filter((id) => id !== lastId && !pendingIds.has(id));
  if (candidates.length > 0) {
    const n = poolSize || pool.length;
    const boost = (id) => {
      if (!sinceSeen) return 0;
      const over = Math.max(0, (turn - (sinceSeen[id] ?? 0)) / n - SELECTION.STARVE_START);
      return SELECTION.STARVE_SLOPE * over * over;
    };
    const weights = candidates.map((id) => SELECTION.BASE_WEIGHT + weaknessScore(getStats(statsById, id), now) + boost(id));
    return pickWeighted(candidates, weights, rng);
  }
  const early = pending.find((r) => r.id !== lastId);
  if (early) return early.id;
  return uncovered[0];
}

/**
 * Draw one run's worth of distinct ids from a larger pool (Level 3 Type, Levels 4–5 words).
 * Every id in `include` (e.g. the item just missed) is always part of the sample.
 *  - Without `maxWeak`: weighted sampling without replacement, weight BASE_WEIGHT + weaknessScore,
 *    so weak items tend to make the cut (Words).
 *  - With `maxWeak` (Type): at most that many currently weak items per run (seen, weaknessScore ≥
 *    WEAK_SCORE). Measured in round 2 against lifetime-weak (the Stats 'struggling' band): counting those
 *    too made Type slower to pass (median 556 vs 447 prompts) and starved strong kana longer (976 vs 273
 *    prompts), so it is not used. Weak items are picked by weight, and included ids count toward the
 *    cap; the rest of the run is filled uniformly from the other items. A run of 20 packed with weak kana is near-unwinnable, and heavy weighting
 *    starves strong kana for hundreds of prompts.
 * Returns ids in pool order; the in-run picker decides the order they're asked in.
 * @returns {string[]} min(size, pool) distinct ids
 */
export function sampleRun({ poolIds, size, statsById, now, rng, include = [], maxWeak = null }) {
  const pool = [...new Set(poolIds || [])];
  if (pool.length === 0) throw new Error('sampleRun: empty pool');
  const n = Math.min(Math.max(1, size | 0), pool.length);
  const chosen = new Set((include || []).filter((id) => pool.includes(id)).slice(0, n));
  const score = (id) => weaknessScore(getStats(statsById, id), now);
  const draw = (from, count, weightOf) => {
    let rest = from.filter((id) => !chosen.has(id));
    for (let i = 0; i < count && rest.length; i++) {
      const id = pickWeighted(rest, rest.map(weightOf), rng);
      chosen.add(id);
      rest = rest.filter((x) => x !== id);
    }
  };
  if (Number.isInteger(maxWeak) && maxWeak >= 0) {
    const isWeak = (id) => getStats(statsById, id).attempts > 0 && score(id) >= SELECTION.WEAK_SCORE;
    const weak = pool.filter(isWeak);
    const weakRoom = Math.max(0, maxWeak - [...chosen].filter(isWeak).length);
    draw(weak, Math.min(weakRoom, n - chosen.size), (id) => SELECTION.BASE_WEIGHT + score(id));
    draw(pool.filter((id) => !isWeak(id)), n - chosen.size, () => 1);
    draw(weak, n - chosen.size, (id) => SELECTION.BASE_WEIGHT + score(id));   // only if the pool is mostly weak
  } else {
    draw(pool, n - chosen.size, (id) => SELECTION.BASE_WEIGHT + score(id));
  }
  return pool.filter((id) => chosen.has(id));
}

/**
 * Bounded-window feasibility after serving `servedId` at `turn`.
 * Every other char has a deadline lastShown + W. Pending re-asks (other than servedId) occupy one
 * future slot each (their dueTurn, or the next free turn if overdue); a char whose re-ask slot is
 * within its deadline is covered. The remaining chars, sorted by deadline d1 ≤ d2 ≤ …, fit iff
 * for every k the free (unreserved) turns in (turn, dk] number at least k — earliest-deadline-first
 * scheduling. Returns true when the schedule still fits.
 */
function feasibleAfter(servedId, pool, turn, lastShown, pending, W) {
  const reserved = [];
  const covered = new Set();
  for (const r of [...pending].filter((p) => p.id !== servedId).sort((a, b) => a.dueTurn - b.dueTurn)) {
    let slot = Math.max(r.dueTurn, turn + 1);
    while (reserved.includes(slot)) slot++;
    reserved.push(slot);
    if (slot <= lastShown(r.id) + W) covered.add(r.id);
  }
  const deadlines = pool
    .filter((id) => id !== servedId && !covered.has(id))
    .map((id) => lastShown(id) + W)
    .sort((a, b) => a - b);
  for (let k = 1; k <= deadlines.length; k++) {
    const d = deadlines[k - 1];
    const free = d - turn - reserved.filter((s) => s <= d).length;
    if (free < k) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Lesson-level suggestions

function charStats(progress, id) {
  return (progress && progress.chars && progress.chars[id]) || emptyStats();
}

function isPassed(progress, key, level = 0) {
  const p = progress && progress.sets && progress.sets[key] && progress.sets[key].passed;
  return !!(p && p[String(level)] != null);
}

/** Mean weakness of the chars in a set key. */
export function setWeakness(progress, key, now) {
  const chars = charsInSetKey(key);
  if (chars.length === 0) return 0;
  return chars.reduce((s, k) => s + weaknessScore(charStats(progress, k.id), now), 0) / chars.length;
}

/**
 * Next Level 0 set for a script:
 *  - first-ever L0 lesson for the script (no L0 pass and no lastL0Set) → 'a';
 *  - else the first set in teaching order not passed at L0 that is not lastL0Set[script];
 *  - else the weakest passed set that is not the last one;
 *  - else (only option) the last set.
 * `now` is optional (only affects the staleness part of weakness).
 */
export function nextLevel0Set(progress, script, setDefs = SET_DEFS, now = null) {
  const defs = [...setDefs].sort((a, b) => a.order - b.order);
  if (defs.length === 0) return null;
  const last = progress?.lastL0Set?.[script] ?? null;
  const passed = defs.filter((d) => isPassed(progress, setKey(script, d.id)));
  if (passed.length === 0 && last === null) {
    return defs.some((d) => d.id === 'a') ? 'a' : defs[0].id;
  }
  const unpassed = defs.find((d) => !isPassed(progress, setKey(script, d.id)) && d.id !== last);
  if (unpassed) return unpassed.id;
  let best = null;
  let bestW = -Infinity;
  for (const d of passed) {
    if (d.id === last) continue;
    const w = setWeakness(progress, setKey(script, d.id), now);
    if (w > bestW) { bestW = w; best = d.id; }
  }
  if (best !== null) return best;
  return last ?? defs[0].id;
}

/** Among sets passed at L0 for the script, the one with the highest mean weakness; null if none. */
export function suggestWeakestSet(progress, script, now) {
  let best = null;
  let bestW = -Infinity;
  for (const d of [...SET_DEFS].sort((a, b) => a.order - b.order)) {
    const key = setKey(script, d.id);
    if (!isPassed(progress, key)) continue;
    if (charsInSet(script, d.id).length === 0) continue;
    const w = setWeakness(progress, key, now);
    if (w > bestW) { bestW = w; best = d.id; }
  }
  return best;
}

/** All set keys ('hiragana:k') passed at level 0, both scripts, in teaching order. */
export function learnedSetKeys(progress) {
  return allSetKeys().filter((k) => isPassed(progress, k));
}

/**
 * Two distinct learned sets (cross-script allowed), each drawn by weighted random with weight
 * 0.1 + mean set weakness. null if fewer than 2 sets are learned.
 */
export function autoPair(progress, now, rng) {
  const learned = learnedSetKeys(progress);
  if (learned.length < 2) return null;
  const w = learned.map((k) => 0.1 + setWeakness(progress, k, now));
  const a = pickWeighted(learned, w, rng);
  const rest = learned.filter((k) => k !== a);
  const b = pickWeighted(rest, rest.map((k) => w[learned.indexOf(k)]), rng);
  return [a, b];
}

