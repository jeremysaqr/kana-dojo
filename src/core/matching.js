// Typed-answer normalisation and checking (Levels 3 and 4). Pure.
import { kanaById } from './kana.js';

/**
 * Normalise learner input: drop zero-width characters, full-width ASCII → half-width, ideographic
 * space → space, typographic apostrophes (and ` ´) → ', lowercase, trim, collapse inner whitespace,
 * strip one trailing period ('.' or '。').
 * @param {unknown} s
 * @returns {string}
 */
export function normalizeInput(s) {
  if (s === null || s === undefined) return '';
  let t = String(s)
    .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
    .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .replace(/[‘’ʼ`´]/g, "'")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  t = t.replace(/[.。]$/, '').trim();
  return t;
}

/**
 * Check typed input against a kana entry.
 * correct: normalised input equals the canonical romaji or any accepted `alt` spelling.
 * nonStandard: correct, but not the canonical (Hepburn) spelling — UI can show a gentle hint.
 * Empty input is never correct.
 * @returns {{ correct: boolean, canonical: string, nonStandard: boolean }}
 */
export function checkTyped(input, kanaEntry) {
  const canonical = kanaEntry.romaji;
  const n = normalizeInput(input).replace(/\s+/g, '');   // "s hi" is still shi
  if (!n) return { correct: false, canonical, nonStandard: false };
  const alts = Array.isArray(kanaEntry.alt) ? kanaEntry.alt : [];
  const correct = n === canonical || alts.includes(n);
  return { correct, canonical, nonStandard: correct && n !== canonical };
}

/**
 * Check typed input against a word (Level 4). Spaces and hyphens are ignored ("saka na"), and
 * every kana may be spelled any way checkTyped accepts for it, so "susi" and "sushi" both pass.
 * @param {unknown} input
 * @param {{ romaji: string, units: string[] }} word  units are kana ids (see words.js)
 * @param {Map<string, {romaji:string, alt?:string[]}>} [kanaLookup] defaults to the kana table
 * @returns {{ correct: boolean, canonical: string, nonStandard: boolean }}
 */
export function checkTypedWord(input, word, kanaLookup = kanaById) {
  const canonical = word.romaji;
  const n = normalizeInput(input).replace(/[\s-]+/g, '');
  if (!n) return { correct: false, canonical, nonStandard: false };
  if (n === canonical) return { correct: true, canonical, nonStandard: false };
  // reach = string positions reachable after matching the first i units
  let reach = new Set([0]);
  for (const id of word.units) {
    const k = kanaLookup.get(id);
    const spellings = [k.romaji, ...(k.alt || [])];
    const next = new Set();
    for (const pos of reach) for (const s of spellings) if (n.startsWith(s, pos)) next.add(pos + s.length);
    if (next.size === 0) return { correct: false, canonical, nonStandard: false };
    reach = next;
  }
  const correct = reach.has(n.length);
  return { correct, canonical, nonStandard: correct };
}

const READINGS = new Set();
for (const k of kanaById.values()) for (const s of [k.romaji, ...(k.alt || [])]) READINGS.add(s);

/**
 * Which syllables of a misread word were misread (Level 4), so each can count against its own kana.
 * Lines the typed answer up with the word's kana at the lowest cost:
 *   a kana spelled any accepted way      cost 0
 *   a kana read as 1–4 other letters     cost 1 (0.9 if those letters are a real kana reading)
 *   a kana left out, or letters extra    cost 1
 * "asa" typed as "aka" → あ ok, さ read as "ka". When the cheapest line-up costs more than about half
 * the word (≥ ceil(units / 2) + 0.5, e.g. "zzz" for asa), the answer isn't treated as a reading attempt
 * and null is returned, so nothing is charged to any kana.
 * @returns {{ id: string, ok: boolean, given: string }[] | null}  one entry per unit, in order
 */
export function alignWord(input, word, kanaLookup = kanaById) {
  const t = normalizeInput(input).replace(/[\s-]+/g, '');
  const units = word.units;
  const n = units.length;
  if (!t) return null;
  const INF = Infinity;
  // cost[i][j]: best cost lining up units[0..i) with t[0..j); from[i][j] remembers how
  const cost = Array.from({ length: n + 1 }, () => new Array(t.length + 1).fill(INF));
  const from = Array.from({ length: n + 1 }, () => new Array(t.length + 1).fill(null));
  cost[0][0] = 0;
  for (let i = 0; i < n; i++) {
    const k = kanaLookup.get(units[i]);
    const spellings = new Set([k.romaji, ...(k.alt || [])]);
    for (let j = 0; j <= t.length; j++) {
      const c = cost[i][j];
      if (c === INF) continue;
      const relax = (j2, add, ok, given) => {
        if (c + add < cost[i + 1][j2]) { cost[i + 1][j2] = c + add; from[i + 1][j2] = { j, ok, given }; }
      };
      for (const s of spellings) if (t.startsWith(s, j)) relax(j + s.length, 0, true, s);
      for (let len = 1; len <= 4 && j + len <= t.length; len++) {
        const sub = t.slice(j, j + len);
        if (!spellings.has(sub)) relax(j + len, READINGS.has(sub) ? 0.9 : 1, false, sub);
      }
      relax(j, 1, false, '');                                   // left out
    }
  }
  // extra letters after the last kana cost 1 (whatever their length)
  let bestJ = -1;
  let best = INF;
  for (let j = 0; j <= t.length; j++) {
    const c = cost[n][j] + (j < t.length ? 1 : 0);
    if (c < best) { best = c; bestJ = j; }
  }
  if (best === INF || best >= Math.ceil(n / 2) + 0.5) return null;
  const out = [];
  for (let i = n, j = bestJ; i > 0; i--) {
    const step = from[i][j];
    out.unshift({ id: units[i - 1], ok: step.ok, given: step.given });
    j = step.j;
  }
  return out;
}
