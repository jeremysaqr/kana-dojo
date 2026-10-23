// Seeded RNG and helpers. Pure: every function that needs randomness takes an `rng`
// function (() => float in [0,1)), so behaviour is reproducible in tests.

/**
 * Mulberry32 PRNG. Small, fast, good enough for shuffling flash cards.
 * @param {number} seed any number (coerced to uint32)
 * @returns {() => number} float in [0, 1)
 */
export function mulberry32(seed) {
  let a = (Number(seed) >>> 0) || 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pick one item with probability proportional to its weight. Non-finite or negative weights
 * count as 0; if every weight is 0 the pick is uniform. Throws on an empty list.
 */
export function pickWeighted(items, weights, rng) {
  if (!items || items.length === 0) throw new Error('pickWeighted: empty items');
  const w = items.map((_, i) => {
    const x = Number(weights[i]);
    return Number.isFinite(x) && x > 0 ? x : 0;
  });
  const total = w.reduce((s, x) => s + x, 0);
  if (total <= 0) return items[Math.min(items.length - 1, Math.floor(rng() * items.length))];
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= w[i];
    if (r < 0 && w[i] > 0) return items[i];
  }
  // Floating-point fallthrough: last item with positive weight.
  for (let i = items.length - 1; i >= 0; i--) if (w[i] > 0) return items[i];
  return items[items.length - 1];
}

/** Fisher–Yates shuffle. Returns a new array; the input is not modified. */
export function shuffle(arr, rng) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
