import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLesson, nextPrompt, submitAnswer, L3_TARGET } from '../src/core/lesson.js';
import { charsInSet, kanaById } from '../src/core/kana.js';
import { mulberry32 } from '../src/core/rng.js';

const NOW = 1_700_000_000_000;
const ids = (script, set) => charsInSet(script, set).map((k) => k.id);

function perfectRun(lesson, seed, answerFor = (p) => p.id) {
  const rng = mulberry32(seed);
  let st = lesson;
  let result;
  while (!st.passed) {
    const r = nextPrompt(st, { statsById: new Map(), now: NOW, rng });
    result = submitAnswer(r.state, { given: answerFor(r.prompt), now: NOW, rng });
    st = result.state;
    if (st.prompts > 10000) throw new Error('did not pass');
  }
  return st;
}

test('defaults: L0 target = distinct pool size, choice mode; L3 target 20, type mode', () => {
  const l0 = createLesson({ level: 0, poolIds: [...ids('hiragana', 'k'), 'h-ka'], now: NOW });
  assert.equal(l0.target, 5);
  assert.equal(l0.mode, 'choice');
  assert.equal(l0.poolIds.length, 5);
  const big = [...ids('hiragana', 'a'), ...ids('hiragana', 'k'), ...ids('hiragana', 's'), ...ids('hiragana', 't'), ...ids('hiragana', 'n')];
  const l3 = createLesson({ level: 3, poolIds: big, now: NOW });
  assert.equal(l3.target, L3_TARGET);
  assert.equal(l3.target, 20);
  assert.equal(l3.mode, 'type');
  // a pool smaller than 20 caps the run at the pool size
  assert.equal(createLesson({ level: 3, poolIds: ids('hiragana', 'k'), now: NOW }).target, 5);
  assert.equal(createLesson({ level: 4, poolIds: ['wh-sakana', 'wh-neko'], now: NOW }).mode, 'read');
  assert.equal(createLesson({ level: 5, poolIds: ['wh-sakana', 'wh-neko'], now: NOW }).mode, 'meaning');
  assert.throws(() => createLesson({ level: 4, poolIds: ['h-a'] }), /unknown id/);
  assert.throws(() => createLesson({ level: 0, poolIds: [] }));
});

test('perfect learner passes a 5-char L0 in exactly 5 prompts (many seeds)', () => {
  for (let seed = 1; seed <= 200; seed++) {
    const st = perfectRun(createLesson({ level: 0, poolIds: ids('hiragana', 'a'), now: NOW }), seed);
    assert.equal(st.prompts, 5);
    assert.equal(st.streak, 5);
    assert.equal(st.correctCount, 5);
    assert.deepEqual(st.missedIds, []);
  }
});

test('sets of size 3 work (y, wn) and perfect pass takes 3 prompts', () => {
  for (const set of ['y', 'wn']) {
    for (const script of ['hiragana', 'katakana']) {
      const st = perfectRun(createLesson({ level: 1, poolIds: ids(script, set), now: NOW }), 3);
      assert.equal(st.target, 3);
      assert.equal(st.prompts, 3);
    }
  }
});

test('10-char mixed cross-script pool works', () => {
  const pool = [...ids('hiragana', 'z'), ...ids('katakana', 'd')];
  const lesson = createLesson({ level: 2, poolIds: pool, now: NOW });
  assert.equal(lesson.target, 10);
  const rng = mulberry32(8);
  let st = lesson;
  for (let i = 0; i < 300 && !st.passed; i++) {
    const r = nextPrompt(st, { statsById: new Map(), now: NOW, rng });
    assert.equal(r.prompt.options.length, 3);
    assert.equal(new Set(r.prompt.options.map((o) => o.romaji)).size, 3);
    const miss = rng() < 0.2;
    st = submitAnswer(r.state, { given: miss ? r.prompt.options.find((o) => o.id !== r.prompt.id).id : r.prompt.id, now: NOW, rng }).state;
  }
  assert.ok(st.passed, 'lesson with 20% misses eventually passes');
  assert.equal(st.streak, 10);
});

test('miss resets streak, requeues 2–3 turns later, records missedIds uniquely', () => {
  const rng = mulberry32(1);
  let st = createLesson({ level: 0, poolIds: ids('hiragana', 'k'), now: NOW });
  let r = nextPrompt(st, { statsById: new Map(), now: NOW, rng });
  let s = submitAnswer(r.state, { given: r.prompt.id, now: NOW, rng });
  assert.equal(s.state.streak, 1);
  r = nextPrompt(s.state, { statsById: new Map(), now: NOW, rng });
  const missedId = r.prompt.id;
  const wrong = r.prompt.options.find((o) => o.id !== missedId);
  s = submitAnswer(r.state, { given: wrong.id, now: NOW, rng });
  assert.equal(s.correct, false);
  assert.equal(s.canonical, kanaById.get(missedId).romaji);
  assert.equal(s.givenRomaji, wrong.romaji);
  assert.equal(s.state.streak, 0);
  assert.equal(s.state.best, 1);
  assert.deepEqual(s.state.missedIds, [missedId]);
  assert.equal(s.state.requeue.length, 1);
  const due = s.state.requeue[0].dueTurn;
  assert.ok(due === s.state.turn + 2 || due === s.state.turn + 3);
  assert.deepEqual(s.state.log.at(-1), { id: missedId, given: wrong.id, ok: false, turn: 2, t: NOW });
});

test('double submit rejected; nextPrompt refused while unanswered or passed', () => {
  const rng = mulberry32(1);
  const st = createLesson({ level: 0, poolIds: ['h-a'], now: NOW });
  assert.throws(() => submitAnswer(st, { given: 'h-a', now: NOW }), /no current prompt/);
  const r = nextPrompt(st, { statsById: new Map(), now: NOW, rng });
  assert.throws(() => nextPrompt(r.state, { statsById: new Map(), now: NOW, rng }), /not answered/);
  const s = submitAnswer(r.state, { given: 'h-a', now: NOW });
  assert.equal(s.passed, true);
  assert.throws(() => submitAnswer(s.state, { given: 'h-a', now: NOW }), /already answered/);
  assert.throws(() => nextPrompt(s.state, { statsById: new Map(), now: NOW, rng }), /passed/);
  assert.equal(s.state.correctCount, 1);
  assert.equal(s.state.log.length, 1);
  // input states not mutated
  assert.equal(r.state.answered, false);
  assert.equal(st.turn, 0);
});

const TYPE_POOL = ['a', 's', 't', 'h', 'r'].flatMap((set) => [...ids('hiragana', set), ...ids('katakana', set)]);   // 50 chars

test('L3 typing lesson: 20 different characters in a row, alt spellings accepted, empty is a miss', () => {
  const rng = mulberry32(21);
  let st = createLesson({ level: 3, poolIds: TYPE_POOL, now: NOW });
  let r = nextPrompt(st, { statsById: new Map(), now: NOW, rng });
  assert.equal(r.state.runIds.length, 20, 'a run is a 20-character sample of the pool');
  const missed = r.prompt.id;
  let s = submitAnswer(r.state, { given: '   ', now: NOW, rng });
  assert.equal(s.correct, false);
  assert.equal(s.state.runIds, null, 'a miss ends the run');
  st = s.state;
  let nonStd = 0;
  while (!st.passed) {
    r = nextPrompt(st, { statsById: new Map(), now: NOW, rng });
    const e = kanaById.get(r.prompt.id);
    const typed = e.alt.length && rng() < 0.5 ? e.alt[0].toUpperCase() + ' ' : e.romaji;
    s = submitAnswer(r.state, { given: typed, now: NOW, rng });
    assert.equal(s.correct, true);
    if (s.nonStandard) nonStd++;
    st = s.state;
  }
  assert.equal(st.prompts, 21);
  assert.equal(st.streak, 20);
  const run = st.log.slice(1).map((e) => e.id);
  assert.equal(new Set(run).size, 20, 'no character repeats within the run');
  assert.ok(run.slice(0, 3).includes(missed), 'the missed character comes back within the first 3 prompts');
  assert.notEqual(run[0], missed, 'but never straight away');
  assert.ok(nonStd > 0);
});

test('L3 typing: over many seeds with misses, runs never repeat a character and misses return within 3', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const rng = mulberry32(seed);
    let st = createLesson({ level: 3, poolIds: TYPE_POOL, now: NOW });
    let runSeen = new Set();
    let pendingMiss = null;   // { id, at }
    while (!st.passed) {
      const r = nextPrompt(st, { statsById: new Map(), now: NOW, rng });
      st = r.state;
      const id = r.prompt.id;
      assert.ok(!runSeen.has(id), `seed ${seed}: ${id} repeated within a run`);
      runSeen.add(id);
      if (pendingMiss && pendingMiss.id === id) {
        assert.ok(st.turn - pendingMiss.at <= 3, `seed ${seed}: re-ask after ${st.turn - pendingMiss.at}`);
        pendingMiss = null;
      }
      const miss = rng() < 0.08;
      st = submitAnswer(st, { given: miss ? 'x' : kanaById.get(id).romaji, now: NOW, rng }).state;
      if (miss) { runSeen = new Set(); pendingMiss = { id, at: st.turn }; }
      if (st.prompts > 5000) throw new Error('did not pass');
    }
    assert.equal(st.lapCovered.length, 20);
  }
});

test('choice mode accepts a same-romaji label but rejects other labels', () => {
  const rng = mulberry32(2);
  const r = nextPrompt(createLesson({ level: 0, poolIds: ['h-di', 'h-a'], now: NOW }), { statsById: new Map(), now: NOW, rng });
  const ans = kanaById.get(r.prompt.id);
  assert.equal(submitAnswer(r.state, { given: ans.romaji, now: NOW }).correct, true);
  assert.equal(submitAnswer(r.state, { given: 'zzz', now: NOW }).correct, false);
});

// ---------------------------------------------------------------------------------------------
// Choice mode (L0–L2): run-based pass rule — each kana once per run.

/** Play a choice lesson; missFn(id, state) decides misses. Returns final state and the prompt ids. */
function playChoice({ pool, seed, missFn = () => false, stats = new Map(), level = 0, maxPrompts = 5000 }) {
  const rng = mulberry32(seed);
  let st = createLesson({ level, poolIds: pool, now: NOW });
  const events = [];
  while (!st.passed) {
    const r = nextPrompt(st, { statsById: stats, now: NOW, rng });
    const id = r.prompt.id;
    const miss = missFn(id, r.state, rng);
    const given = miss ? r.prompt.options.find((o) => o.id !== id).id : id;
    const coveredBefore = r.state.lapCovered;
    const res = submitAnswer(r.state, { given, now: NOW, rng });
    events.push({ id, turn: r.state.turn, ok: res.correct, coveredBefore });
    st = res.state;
    if (st.prompts > maxPrompts) throw new Error('did not pass');
  }
  return { st, events };
}

test('choice: createLesson exposes lapCovered and forces target = pool size', () => {
  const l = createLesson({ level: 1, poolIds: ids('hiragana', 'k'), target: 99, now: NOW });
  assert.equal(l.mode, 'choice');
  assert.equal(l.target, 5);
  assert.deepEqual(l.lapCovered, []);
});

test('choice: perfect learner passes in exactly N prompts for N = 3, 5, 10 (incl. cross-script)', () => {
  const pools = [
    ids('hiragana', 'y'), ids('katakana', 'wn'), ids('hiragana', 'a'), ids('katakana', 'd'),
    [...ids('hiragana', 'k'), ...ids('hiragana', 's')],
    [...ids('hiragana', 'z'), ...ids('katakana', 'd')],
  ];
  for (const pool of pools) {
    for (let seed = 1; seed <= 100; seed++) {
      const { st, events } = playChoice({ pool, seed });
      assert.equal(st.prompts, pool.length);
      assert.equal(st.streak, pool.length);
      assert.equal(st.lapCovered.length, pool.length);
      assert.deepEqual([...st.lapCovered].sort(), [...pool].sort());
      assert.deepEqual(new Set(events.map((e) => e.id)).size, pool.length, 'each kana exactly once');
      events.forEach((e, i) => assert.equal(e.coveredBefore.length, i, 'streak == lapCovered.length'));
    }
  }
});

test('choice: no character repeats within a run; never twice in a row', () => {
  for (const pool of [ids('hiragana', 'wn'), ids('hiragana', 'k'), [...ids('hiragana', 'a'), ...ids('katakana', 'a')]]) {
    for (let seed = 1; seed <= 300; seed++) {
      const { events } = playChoice({ pool, seed, missFn: (id, s, rng) => rng() < 0.2 });
      let run = new Set();
      for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (i > 0) assert.notEqual(e.id, events[i - 1].id, 'same char twice in a row');
        assert.ok(!e.coveredBefore.includes(e.id), 'served an already-covered char');
        assert.ok(!run.has(e.id), 'repeat within a run');
        if (e.ok) run.add(e.id); else run = new Set();
      }
    }
  }
});

test('choice: a miss clears lapCovered and the missed id reappears exactly 2 or 3 prompts later', () => {
  const delays = {};
  for (const pool of [ids('hiragana', 'k'), [...ids('hiragana', 'z'), ...ids('katakana', 'd')]]) {
    for (let seed = 1; seed <= 300; seed++) {
      const { events } = playChoice({ pool, seed, missFn: (id, s, rng) => rng() < 0.2 });
      events.forEach((e, i) => {
        if (e.ok) return;
        if (i + 1 < events.length) assert.deepEqual(events[i + 1].coveredBefore, [], 'run reset after miss');
        const j = events.findIndex((x, k) => k > i && x.id === e.id);
        if (j === -1) return;
        const d = events[j].turn - e.turn;
        delays[d] = (delays[d] || 0) + 1;
        assert.ok(d === 2 || d === 3, `missed ${e.id} came back after ${d}`);
      });
    }
  }
  console.log('  choice-mode re-ask delays (turns: count):', delays);
  assert.ok(delays[2] > 0 && delays[3] > 0, 'both 2 and 3 occur');
  // direct check of state after a miss
  const rng = mulberry32(3);
  let st = createLesson({ level: 0, poolIds: ids('hiragana', 'a'), now: NOW });
  let r = nextPrompt(st, { statsById: new Map(), now: NOW, rng });
  st = submitAnswer(r.state, { given: r.prompt.id, now: NOW, rng }).state;
  assert.equal(st.lapCovered.length, 1);
  r = nextPrompt(st, { statsById: new Map(), now: NOW, rng });
  const res = submitAnswer(r.state, { given: r.prompt.options.find((o) => o.id !== r.prompt.id).id, now: NOW, rng });
  assert.equal(res.state.streak, 0);
  assert.deepEqual(res.state.lapCovered, []);
  assert.equal(res.passed, false);
});

test('choice: order is randomised and weak chars come earlier on average', () => {
  const pool = ids('hiragana', 'k');
  const orders = new Set();
  for (let seed = 1; seed <= 200; seed++) orders.add(playChoice({ pool, seed }).events.map((e) => e.id).join(','));
  assert.ok(orders.size >= 20, `only ${orders.size} distinct orders`);
  const known = { attempts: 20, correct: 20, misses: 0, streak: 20, lastSeen: NOW, ewmaErr: 0.02, history: [], wrong: {} };
  const stats = new Map(pool.map((id) => [id, known]));
  stats.set('h-ke', { ...known, correct: 8, misses: 12, streak: 0, ewmaErr: 0.85 });
  const posSum = Object.fromEntries(pool.map((id) => [id, 0]));
  const N = 2000;
  for (let seed = 1; seed <= N; seed++) {
    playChoice({ pool, seed, stats }).events.forEach((e, i) => { posSum[e.id] += i + 1; });
  }
  const mean = Object.fromEntries(pool.map((id) => [id, +(posSum[id] / N).toFixed(2)]));
  console.log('  mean position in run (1–5), h-ke weak:', mean);
  for (const id of pool) if (id !== 'h-ke') assert.ok(mean['h-ke'] < mean[id] - 0.5, JSON.stringify(mean));
});

test('choice: pool of 1 passes in one prompt', () => {
  const { st } = playChoice({ pool: ['k-n'], seed: 1 });
  assert.equal(st.prompts, 1);
});

