// Per-character statistics, weakness score and mastery band. Pure: `now` is passed in.
import { normalizeInput } from './matching.js';

export const EWMA_ALPHA = 0.35;
export const HISTORY_CAP = 30;
/** Longest learner answer kept in stats (a pasted essay must never bloat the progress file). */
export const GIVEN_CAP = 32;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Weakness formula weights / constants (see weaknessScore). */
export const WEAKNESS = Object.freeze({
  UNSEEN: 0.5,          // score for a character never answered
  W_ERR: 0.75,          // weight of ewmaErr (dominant term)
  W_EXPOSURE: 0.15,     // weight of the low-exposure bonus
  W_STALE: 0.10,        // weight of the staleness bonus
  EXPOSURE_K: 3,        // exposure bonus = K / (K + attempts)
  STALE_TAU_DAYS: 3,    // staleness = 1 - exp(-daysSinceSeen / TAU)
});

/** Mastery band thresholds (see masteryBand). */
export const MASTERY = Object.freeze({
  STRUGGLING_ERR: 0.5,      // ewmaErr >= this → struggling
  SOLID_MIN_ATTEMPTS: 4,
  SOLID_MAX_ERR: 0.3,
  MASTERED_MIN_ATTEMPTS: 8,
  MASTERED_MAX_ERR: 0.15,
  MASTERED_MIN_STREAK: 5,
  MASTERED_MAX_IDLE_DAYS: 30, // mastered chars unseen longer than this show as solid
  // Lifetime accuracy guards, so a long weak record can't read as solid after a few lucky answers.
  LIFETIME_MIN_ATTEMPTS: 8,   // the guards apply from this many attempts
  STRUGGLING_MAX_ACC: 0.6,    // lifetime accuracy below this → struggling
  SOLID_MIN_ACC: 0.7,
  MASTERED_MIN_ACC: 0.85,
});

/** Lifetime accuracy, smoothed toward 50% for small samples: (correct + 1) / (attempts + 2). */
export function lifetimeAccuracy(stats) {
  if (!stats || !stats.attempts) return null;
  return ((stats.correct || 0) + 1) / (stats.attempts + 2);
}

/** Copy a `wrong` map into a null-prototype object, so answers like "__proto__" stay plain keys. */
export function wrongMap(src) {
  const out = Object.create(null);
  if (src && typeof src === 'object') for (const [k, v] of Object.entries(src)) out[k] = v;
  return out;
}

export function emptyStats() {
  return { attempts: 0, correct: 0, misses: 0, streak: 0, lastSeen: null, ewmaErr: null, history: [], wrong: wrongMap() };
}

/**
 * Return NEW stats after one answer. ewmaErr ← ewmaErr + α·(err − ewmaErr), err = 1 on a miss,
 * 0 when correct; the first observation initialises it to err. history keeps the last 30 answers.
 * On a miss, wrong[normalisedGiven]++. The given answer is capped at GIVEN_CAP characters.
 * @param {object} stats
 * @param {{ ok: boolean, given?: string, level?: number, now: number }} answer
 */
export function updateStats(stats, { ok, given, level, now }) {
  const s = stats || emptyStats();
  const err = ok ? 0 : 1;
  const prev = typeof s.ewmaErr === 'number' && Number.isFinite(s.ewmaErr) ? s.ewmaErr : null;
  const ewmaErr = prev === null ? err : prev + EWMA_ALPHA * (err - prev);
  const g = normalizeInput(given).slice(0, GIVEN_CAP);
  const history = [...(s.history || []), { t: now, ok: !!ok, given: g, level: level ?? null }].slice(-HISTORY_CAP);
  const wrong = wrongMap(s.wrong);
  if (!ok && g) wrong[g] = (wrong[g] || 0) + 1;
  return {
    attempts: (s.attempts || 0) + 1,
    correct: (s.correct || 0) + (ok ? 1 : 0),
    misses: (s.misses || 0) + (ok ? 0 : 1),
    streak: ok ? (s.streak || 0) + 1 : 0,
    lastSeen: now,
    ewmaErr,
    history,
    wrong,
  };
}

/**
 * Weakness score in [0, 1] — higher means "needs practice".
 *
 *   unseen (attempts = 0 or ewmaErr = null):  score = 0.5
 *   otherwise:
 *     exposure  = 3 / (3 + attempts)                       (1 → 0 as attempts grow)
 *     staleness = 1 − exp(−daysSinceLastSeen / 3)          (0 just seen, ~0.63 at 3 days, → 1)
 *     score     = 0.75·ewmaErr + 0.15·exposure + 0.10·staleness, clamped to [0, 1]
 *
 * ewmaErr dominates, so recent misses outweigh old ones; a freshly-missed character (~0.86)
 * outranks an unseen one (0.5), which outranks a well-known one (~0.05–0.15).
 * If `now` is not a finite number, staleness is treated as 0.
 */
export function weaknessScore(stats, now) {
  if (!stats || !stats.attempts || typeof stats.ewmaErr !== 'number') return WEAKNESS.UNSEEN;
  const err = Math.min(1, Math.max(0, stats.ewmaErr));
  const exposure = WEAKNESS.EXPOSURE_K / (WEAKNESS.EXPOSURE_K + stats.attempts);
  let staleness = 0;
  if (Number.isFinite(now) && Number.isFinite(stats.lastSeen)) {
    const days = Math.max(0, now - stats.lastSeen) / DAY_MS;
    staleness = 1 - Math.exp(-days / WEAKNESS.STALE_TAU_DAYS);
  }
  const score = WEAKNESS.W_ERR * err + WEAKNESS.W_EXPOSURE * exposure + WEAKNESS.W_STALE * staleness;
  return Math.min(1, Math.max(0, score));
}

/**
 * Mastery band:
 *   'unseen'     attempts = 0
 *   'struggling' ewmaErr ≥ 0.5, or (attempts ≥ 8 and lifetime accuracy < 0.6)
 *   'mastered'   attempts ≥ 8, ewmaErr ≤ 0.15, streak ≥ 5, seen within 30 days, lifetime accuracy ≥ 0.85
 *   'solid'      attempts ≥ 4, ewmaErr ≤ 0.3, lifetime accuracy ≥ 0.7 once attempts ≥ 8
 *                (or mastered but idle > 30 days)
 *   'learning'   everything else
 * Lifetime accuracy is the smoothed (correct + 1) / (attempts + 2).
 */
export function masteryBand(stats, now) {
  if (!stats || !stats.attempts) return 'unseen';
  const err = typeof stats.ewmaErr === 'number' ? stats.ewmaErr : 1;
  const acc = lifetimeAccuracy(stats);
  const long = stats.attempts >= MASTERY.LIFETIME_MIN_ATTEMPTS;
  if (err >= MASTERY.STRUGGLING_ERR || (long && acc < MASTERY.STRUGGLING_MAX_ACC)) return 'struggling';
  const idleDays = Number.isFinite(now) && Number.isFinite(stats.lastSeen)
    ? Math.max(0, now - stats.lastSeen) / DAY_MS : 0;
  if (stats.attempts >= MASTERY.MASTERED_MIN_ATTEMPTS && err <= MASTERY.MASTERED_MAX_ERR
      && (stats.streak || 0) >= MASTERY.MASTERED_MIN_STREAK && acc >= MASTERY.MASTERED_MIN_ACC) {
    return idleDays > MASTERY.MASTERED_MAX_IDLE_DAYS ? 'solid' : 'mastered';
  }
  if (stats.attempts >= MASTERY.SOLID_MIN_ATTEMPTS && err <= MASTERY.SOLID_MAX_ERR
      && (!long || acc >= MASTERY.SOLID_MIN_ACC)) return 'solid';
  return 'learning';
}

/**
 * How much a character needs practice, for Stats' weak-spot list and drills: half the selection
 * weakness (recent misses), half the lifetime error rate. Selection keeps using weaknessScore alone.
 */
export function practiceNeed(stats, now) {
  const acc = lifetimeAccuracy(stats);
  if (acc === null) return weaknessScore(stats, now);
  return 0.5 * weaknessScore(stats, now) + 0.5 * (1 - acc);
}
