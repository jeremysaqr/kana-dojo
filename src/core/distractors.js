// Multiple-choice distractor picking. Pure.
import { KANA, kanaById, setDefById } from './kana.js';
import { WORDS, wordById } from './words.js';
import { shuffle } from './rng.js';

/**
 * Two entries "read the same" if their canonical romaji match, or one's canonical romaji is an
 * accepted alt spelling of the other (e.g. を accepts "o", so お is never a distractor for を).
 * This covers じ/ぢ and ず/づ (identical canonical romaji).
 */
function readsSame(a, b) {
  if (a.romaji === b.romaji) return true;
  return (a.alt || []).includes(b.romaji) || (b.alt || []).includes(a.romaji);
}

function groupOf(entry) {
  return setDefById.get(entry.set)?.group;
}

/**
 * Pick n distinct distractor ids for answerId.
 * Never the answer, never an entry that reads the same as the answer, never two options with the
 * same label. Preference: lesson pool → answer's confusables → same script & group → anything.
 * Each tier is shuffled with rng. Returns fewer than n only if the whole kana table can't supply n.
 */
export function pickDistractors(answerId, poolIds, rng, n = 2) {
  const answer = kanaById.get(answerId);
  if (!answer) throw new Error(`pickDistractors: unknown id ${answerId}`);
  const chosen = [];
  const labels = new Set([answer.romaji]);
  const tiers = [
    (poolIds || []).filter((id) => kanaById.has(id)),
    answer.confusables || [],
    KANA.filter((k) => k.script === answer.script && groupOf(k) === groupOf(answer)).map((k) => k.id),
    KANA.map((k) => k.id),
  ];
  for (const tier of tiers) {
    for (const id of shuffle([...new Set(tier)], rng)) {
      if (chosen.length >= n) return chosen;
      if (id === answerId || chosen.includes(id)) continue;
      const e = kanaById.get(id);
      if (!e || readsSame(e, answer) || labels.has(e.romaji)) continue;
      if (chosen.some((cid) => readsSame(kanaById.get(cid), e))) continue;
      chosen.push(id);
      labels.add(e.romaji);
    }
  }
  return chosen;
}

/** Answer + 2 distractors, shuffled, as [{ id, romaji }] (3 distinct labels). */
export function buildOptions(answerId, poolIds, rng) {
  const ids = [answerId, ...pickDistractors(answerId, poolIds, rng, 2)];
  return shuffle(ids, rng).map((id) => ({ id, romaji: kanaById.get(id).romaji }));
}

/**
 * Level 5: answer + 2 distractor words, shuffled, as [{ id, en }] where `en` is the shown meaning.
 * A distractor is never a related word (words.js RELATED), never shares any meaning with the
 * answer, and the three labels are distinct. Preference: lesson pool, same script → lesson pool →
 * any word (so a small pool still gets three options).
 */
export function buildMeaningOptions(answerId, poolIds, rng) {
  const answer = wordById.get(answerId);
  if (!answer) throw new Error(`buildMeaningOptions: unknown id ${answerId}`);
  const pool = (poolIds || []).filter((id) => wordById.has(id));
  const meanings = new Set(answer.en.map((e) => e.toLowerCase()));
  const tiers = [
    pool.filter((id) => wordById.get(id).script === answer.script),
    pool,
    WORDS.map((w) => w.id),
  ];
  const chosen = [];
  for (const tier of tiers) {
    for (const id of shuffle([...new Set(tier)], rng)) {
      if (chosen.length >= 2) break;
      const w = wordById.get(id);
      if (id === answerId || chosen.includes(id) || answer.related.includes(id)) continue;
      if (w.en.some((e) => meanings.has(e.toLowerCase()))) continue;
      if (chosen.some((c) => wordById.get(c).en[0] === w.en[0])) continue;
      chosen.push(id);
    }
  }
  return shuffle([answerId, ...chosen], rng).map((id) => ({ id, en: wordById.get(id).en[0] }));
}
