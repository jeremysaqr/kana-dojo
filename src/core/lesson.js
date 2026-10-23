// Lesson state machine. Pure: every function returns a new state object.
import { kanaById } from './kana.js';
import { wordById } from './words.js';
import { pickNext, pickNextInRun, sampleRun } from './selection.js';
import { buildOptions, buildMeaningOptions } from './distractors.js';
import { checkTyped, checkTypedWord, normalizeInput } from './matching.js';

/** Level 3 (typing) run length: twenty different characters in a row. */
export const L3_TARGET = 20;
/** Levels 4–5 (words) run length: ten different words in a row. */
export const WORD_TARGET = 10;
/** Level 3: at most this many weak kana in one run of 20 (owner decision 2026-10-21). */
export const L3_MAX_WEAK = 4;

/**
 * Lesson modes. Every mode except 'stream' is run-based: a streak is one pass through a run of
 * distinct items, each exactly once; `lapCovered` lists the ids answered correctly in the current
 * run, and the lesson passes when it covers the run.
 *  - 'choice'  (L0–L2) kana, pick the romaji from 3; the run is the whole pool.
 *  - 'type'    (L3)    kana, type the romaji; each run is `target` (20) distinct kana sampled from
 *                      the pool, weighted toward weak spots.
 *  - 'read'    (L4)    word, type the romaji; runs of 10 sampled words.
 *  - 'meaning' (L5)    word, pick the English meaning from 3; runs of 10 sampled words.
 *  - 'stream'          kana, typed, repeats allowed, passed at `target` correct in a row (the
 *                      original Level 3 rule; kept for the weighted streak picker, not used by the app).
 * A miss in a sampled mode ends the run: the next run is a fresh sample that always contains the
 * missed item, re-asked at turn +2/+3 so it comes back within the first three prompts.
 */
const MODES = {
  choice: { item: 'kana', answer: 'choice', sampled: false },
  type: { item: 'kana', answer: 'typed', sampled: true },
  read: { item: 'word', answer: 'typed', sampled: true },
  meaning: { item: 'word', answer: 'choice', sampled: true },
  stream: { item: 'kana', answer: 'typed', stream: true },
};
const LEVEL_MODE = ['choice', 'choice', 'choice', 'type', 'read', 'meaning'];

const lookup = (mode) => (MODES[mode].item === 'word' ? wordById : kanaById);

export function createLesson({ level = 0, poolIds, target, now = null, mode } = {}) {
  const pool = [...new Set(poolIds || [])];
  if (pool.length === 0) throw new Error('createLesson: empty pool');
  const lvl = Number(level) || 0;
  const m = MODES[mode] ? mode : (LEVEL_MODE[lvl] || 'choice');
  const items = lookup(m);
  for (const id of pool) if (!items.has(id)) throw new Error(`createLesson: unknown id ${id}`);
  const def = MODES[m];
  let t;
  if (def.stream) t = Number.isInteger(target) && target > 0 ? target : L3_TARGET;
  else if (!def.sampled) t = pool.length;
  else t = Math.min(Number.isInteger(target) && target > 0 ? target : (def.item === 'word' ? WORD_TARGET : L3_TARGET), pool.length);
  return {
    level: lvl,
    mode: m,
    poolIds: pool,
    runIds: def.sampled ? null : pool,   // sampled modes draw a run lazily (nextPrompt has the rng)
    carry: [],                           // ids the next sampled run must include (the last miss)
    target: t,
    startedAt: now,
    streak: 0,
    best: 0,
    turn: 0,
    lastId: null,
    requeue: [],
    sinceSeen: {},
    lapCovered: [],
    current: null,
    answered: false,
    passed: false,
    prompts: 0,
    correctCount: 0,
    missedIds: [],
    log: [],
  };
}

/**
 * Advance to the next prompt. Throws if the current prompt is unanswered or the lesson is passed.
 * @returns {{ state, prompt: { id: string, options?: {id:string, romaji?:string, en?:string}[] } }}
 */
export function nextPrompt(state, { statsById, now, rng } = {}) {
  if (state.passed) throw new Error('nextPrompt: lesson already passed');
  if (state.current && !state.answered) throw new Error('nextPrompt: current prompt not answered');
  if (typeof rng !== 'function') throw new Error('nextPrompt: rng required');
  const def = MODES[state.mode];
  const turn = state.turn + 1;
  let runIds = state.runIds;
  let carry = state.carry || [];
  if (def.sampled && !runIds) {
    const maxWeak = state.mode === 'type' ? Math.max(1, Math.round((L3_MAX_WEAK * state.target) / L3_TARGET)) : null;
    runIds = sampleRun({ poolIds: state.poolIds, size: state.target, statsById, now, rng, include: carry, maxWeak });
    carry = [];
  }
  const common = { statsById, lastId: state.lastId, turn, requeue: state.requeue, now, rng };
  const id = def.stream
    ? pickNext({ ...common, poolIds: state.poolIds, sinceSeen: state.sinceSeen })
    : pickNextInRun({ ...common, poolIds: runIds, lapCovered: state.lapCovered || [], ...(state.mode === 'type' ? { sinceSeen: state.sinceSeen, poolSize: state.poolIds.length } : {}) });
  const prompt = { id };
  if (state.mode === 'choice') prompt.options = buildOptions(id, state.poolIds, rng);
  if (state.mode === 'meaning') prompt.options = buildMeaningOptions(id, state.poolIds, rng);
  return {
    state: {
      ...state,
      runIds,
      carry,
      turn,
      lastId: id,
      // Serving an item by any route satisfies its pending re-ask; a new miss re-schedules it.
      requeue: state.requeue.filter((r) => r.id !== id),
      sinceSeen: { ...state.sinceSeen, [id]: turn },
      current: prompt,
      answered: false,
      prompts: state.prompts + 1,
    },
    prompt,
  };
}

/** Choose turn+2 or turn+3 (rng; +2 without rng), avoiding a slot another re-ask holds. */
function scheduleDue(requeue, turn, rng) {
  const taken = new Set(requeue.map((r) => r.dueTurn));
  const first = typeof rng === 'function' && rng() < 0.5 ? 3 : 2;
  const order = [turn + first, turn + (first === 2 ? 3 : 2)];
  for (const d of order) if (!taken.has(d)) return d;
  let d = turn + 4;
  while (taken.has(d)) d++;
  return d;
}

/**
 * Answer the current prompt.
 * 'choice':  given = chosen char id (a romaji label is also accepted); correct iff same romaji.
 * 'type', 'stream': given = typed string, checked with matching.checkTyped.
 * 'read':    given = typed string, checked with matching.checkTypedWord.
 * 'meaning': given = chosen word id; correct iff it is the prompt word.
 * A miss resets the streak (run modes: clears lapCovered; sampled modes: also ends the run) and
 * re-queues the item 2–3 turns later. Throws on a second submit.
 * `rng` is optional (picks +2 vs +3 for the re-ask; defaults to +2).
 * @returns {{ state, correct, canonical, nonStandard, passed, givenRomaji }}
 *   canonical = the answer's romaji (kana, words); givenRomaji = what to log as the learner's answer.
 */
export function submitAnswer(state, { given, now = null, rng } = {}) {
  if (!state.current) throw new Error('submitAnswer: no current prompt');
  if (state.answered) throw new Error('submitAnswer: prompt already answered');
  if (state.passed) throw new Error('submitAnswer: lesson already passed');
  const def = MODES[state.mode];
  const id = state.current.id;
  const answer = lookup(state.mode).get(id);
  let correct;
  let nonStandard = false;
  let givenRomaji;
  if (state.mode === 'type' || state.mode === 'stream') {
    const r = checkTyped(given, answer);
    correct = r.correct;
    nonStandard = r.nonStandard;
    givenRomaji = normalizeInput(given);
  } else if (state.mode === 'read') {
    const r = checkTypedWord(given, answer);
    correct = r.correct;
    nonStandard = r.nonStandard;
    givenRomaji = normalizeInput(given);
  } else if (state.mode === 'meaning') {
    correct = given === id;
    givenRomaji = typeof given === 'string' ? given : '';
  } else {
    const chosen = kanaById.get(given);
    givenRomaji = chosen ? chosen.romaji : normalizeInput(given);
    correct = givenRomaji !== '' && givenRomaji === answer.romaji;
  }
  let lapCovered = state.lapCovered || [];
  let runIds = state.runIds;
  let carry = state.carry || [];
  let streak;
  let passed;
  if (def.stream) {
    streak = correct ? state.streak + 1 : 0;
    passed = streak >= state.target;
  } else {
    lapCovered = correct ? (lapCovered.includes(id) ? lapCovered : [...lapCovered, id]) : [];
    streak = lapCovered.length;
    passed = runIds.every((p) => lapCovered.includes(p));
    // Every item still owed a re-ask joins the next sample, so back-to-back misses all come back.
    if (!correct && def.sampled) { runIds = null; carry = [id, ...state.requeue.map((r) => r.id).filter((x) => x !== id)]; }
  }
  const requeue = correct
    ? state.requeue
    : [...state.requeue.filter((r) => r.id !== id), { id, dueTurn: scheduleDue(state.requeue.filter((r) => r.id !== id), state.turn, rng) }];
  const next = {
    ...state,
    streak,
    lapCovered,
    runIds,
    carry,
    best: Math.max(state.best, streak),
    answered: true,
    passed,
    correctCount: state.correctCount + (correct ? 1 : 0),
    missedIds: correct || state.missedIds.includes(id) ? state.missedIds : [...state.missedIds, id],
    requeue,
    log: [...state.log, { id, given, ok: correct, turn: state.turn, t: now }],
  };
  return { state: next, correct, canonical: answer.romaji, nonStandard, passed, givenRomaji };
}
