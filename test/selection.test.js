import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickNext, nextLevel0Set, suggestWeakestSet, learnedSetKeys, autoPair } from '../src/core/selection.js';
import { createLesson, nextPrompt, submitAnswer } from '../src/core/lesson.js';
import { defaultProgress, markSetPassed, recordAnswer, setLastL0, statsById } from '../src/core/progress.js';
import { charsInSet, kanaById, SET_DEFS } from '../src/core/kana.js';
import { mulberry32 } from '../src/core/rng.js';

const NOW = 1_700_000_000_000;
const ids = (script, set) => charsInSet(script, set).map((k) => k.id);

/**
 * Drive a long streak-based ('stream' mode, repeats allowed) lesson through the real lesson machine
 * with an unreachable target. This exercises pickNext (the weighted streak picker).
 */
function simulate({ pool, turns, seed, missProb = () => 0, stats = new Map() }) {
  const rng = mulberry32(seed);
  let st = createLesson({ level: 3, mode: 'stream', poolIds: pool, target: 1e9, now: NOW });
  const seq = [];
  const missTurns = [];
  for (let i = 0; i < turns; i++) {
    const r = nextPrompt(st, { statsById: stats, now: NOW, rng });
    st = r.state;
    const id = r.prompt.id;
    seq.push(id);
    const miss = rng() < missProb(id);
    if (miss) missTurns.push({ id, turn: st.turn });
    const answer = miss ? 'zzz' : kanaById.get(id).romaji;
    st = submitAnswer(st, { given: answer, now: NOW, rng }).state;
  }
  return { seq, missTurns };
}

function maxGaps(seq, pool) {
  const last = Object.fromEntries(pool.map((id) => [id, 0]));
  const gaps = Object.fromEntries(pool.map((id) => [id, 0]));
  seq.forEach((id, i) => {
    const t = i + 1;
    gaps[id] = Math.max(gaps[id], t - last[id]);
    last[id] = t;
  });
  return gaps;
}

test('stream mode (pickNext): never the same char twice in a row over 10k turns (pool sizes 2, 3, 5, 10)', () => {
  const pools = [
    ['h-a', 'h-i'],
    ids('hiragana', 'wn'),
    ids('hiragana', 'k'),
    [...ids('hiragana', 's'), ...ids('katakana', 't')],
  ];
  for (const pool of pools) {
    const { seq } = simulate({ pool, turns: 10000, seed: pool.length, missProb: () => 0.3 });
    for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1], `repeat at ${i}`);
  }
});

test('pool of 1 always returns that char', () => {
  const rng = mulberry32(1);
  for (let t = 1; t < 20; t++) assert.equal(pickNext({ poolIds: ['h-a'], lastId: 'h-a', turn: t, now: NOW, rng }), 'h-a');
});

test('stream mode (pickNext): misses reappear within 2–3 turns', () => {
  for (const pool of [ids('hiragana', 'k'), ids('hiragana', 'y'), [...ids('hiragana', 'm'), ...ids('katakana', 'm')]]) {
    const { seq, missTurns } = simulate({ pool, turns: 10000, seed: 11, missProb: () => 0.25 });
    let within = 0;
    const delays = new Map();
    for (const { id, turn } of missTurns) {
      // seq is 0-based: turn t is seq[t-1]
      const next = seq.indexOf(id, turn) + 1;
      if (next === 0) continue; // end of run
      const d = next - turn;
      delays.set(d, (delays.get(d) || 0) + 1);
      assert.ok(d >= 1, 'never immediately');
      if (d <= 3) within++;
    }
    const rate = within / missTurns.length;
    console.log(`  pool ${pool.length}: misses ${missTurns.length}, reappear delay histogram`, Object.fromEntries([...delays].sort((a, b) => a[0] - b[0])));
    // The hard bounded-window rule may delay a re-ask in rare runs of consecutive misses.
    assert.ok(rate > 0.995, `only ${rate} reappeared within 3 turns`);
    assert.ok(Math.max(...delays.keys()) <= 4);
  }
});

test('stream mode (pickNext): every char appears within a bounded window (soft 2×poolSize, hard 3×poolSize)', () => {
  const pools = [ids('hiragana', 'wn'), ids('hiragana', 'k'), [...ids('hiragana', 'a'), ...ids('katakana', 'a')]];
  for (const pool of pools) {
    const n = pool.length;
    const weakStats = new Map([[pool[0], { attempts: 10, correct: 1, misses: 9, streak: 0, lastSeen: NOW, ewmaErr: 1, history: [], wrong: {} }]]);
    const scenarios = [
      { name: 'perfect', missProb: () => 0, soft: 'strict' },
      { name: 'perfect, one weak char', missProb: () => 0, stats: weakStats, soft: 'strict' },
      { name: '10% misses', missProb: () => 0.1, soft: 0.995 },
      { name: '20% misses', missProb: () => 0.2, soft: 0.99 },
      { name: '50% misses', missProb: () => 0.5, soft: null },
      { name: 'one char missed 90%', missProb: (id) => (id === pool[0] ? 0.9 : 0.05), stats: weakStats, soft: null },
    ];
    for (const sc of scenarios) {
      const { seq } = simulate({ pool, turns: 5000, seed: 5, missProb: sc.missProb, stats: sc.stats });
      const gaps = maxGaps(seq, pool);
      const worst = Math.max(...Object.values(gaps));
      assert.ok(worst <= 3 * n, `pool ${n} ${sc.name}: max gap ${worst} exceeds hard bound`);
      // fraction of re-appearances within the soft window
      const last = {};
      let within = 0, total = 0;
      seq.forEach((id, i) => { const g = i + 1 - (last[id] ?? 0); last[id] = i + 1; total++; if (g <= 2 * n) within++; });
      if (sc.soft === 'strict') assert.ok(worst <= 2 * n, `pool ${n} ${sc.name}: max gap ${worst}`);
      else if (sc.soft) assert.ok(within / total >= sc.soft, `pool ${n} ${sc.name}: ${within / total}`);
    }
  }
});

test('stream mode (pickNext): weak chars appear measurably more often', () => {
  const pool = ids('hiragana', 'k');
  const weak = 'h-ki';
  const stats = new Map(pool.map((id) => [id, {
    attempts: 20, correct: 20, misses: 0, streak: 20, lastSeen: NOW, ewmaErr: 0.02, history: [], wrong: {},
  }]));
  stats.set(weak, { attempts: 20, correct: 8, misses: 12, streak: 0, lastSeen: NOW, ewmaErr: 0.8, history: [], wrong: {} });
  const { seq } = simulate({ pool, turns: 20000, seed: 99, stats });
  const counts = Object.fromEntries(pool.map((id) => [id, seq.filter((x) => x === id).length]));
  console.log('  appearance counts (h-ki weak, no misses in lesson):', counts);
  const others = pool.filter((id) => id !== weak).map((id) => counts[id]);
  const meanOther = others.reduce((a, b) => a + b, 0) / others.length;
  assert.ok(counts[weak] > meanOther * 1.25, `${counts[weak]} vs ${meanOther}`);
});

test('requeue: earliest due served, lastId pushed by one turn', () => {
  const rng = mulberry32(2);
  const pool = ids('hiragana', 'k');
  const sinceSeen = Object.fromEntries(pool.map((id) => [id, 9]));
  const req = [{ id: 'h-ku', dueTurn: 9 }, { id: 'h-ke', dueTurn: 8 }];
  assert.equal(pickNext({ poolIds: pool, lastId: 'h-ka', turn: 10, requeue: req, sinceSeen, now: NOW, rng }), 'h-ke');
  assert.equal(pickNext({ poolIds: pool, lastId: 'h-ke', turn: 10, requeue: req, sinceSeen, now: NOW, rng }), 'h-ku');
  const onlyLast = [{ id: 'h-ke', dueTurn: 10 }];
  assert.notEqual(pickNext({ poolIds: pool, lastId: 'h-ke', turn: 10, requeue: onlyLast, sinceSeen, now: NOW, rng }), 'h-ke');
  assert.equal(pickNext({ poolIds: pool, lastId: 'h-ka', turn: 11, requeue: onlyLast, sinceSeen, now: NOW, rng }), 'h-ke');
});

test('nextLevel0Set: first is a; never repeats last unless only option', () => {
  let p = defaultProgress(NOW);
  assert.equal(nextLevel0Set(p, 'hiragana', SET_DEFS), 'a');
  assert.equal(nextLevel0Set(p, 'katakana', SET_DEFS), 'a');
  // quit 'a' (lastL0Set=a, not passed): suggest the next unpassed set, not 'a' again
  p = setLastL0(p, 'hiragana', 'a');
  assert.equal(nextLevel0Set(p, 'hiragana', SET_DEFS), 'k');
  p = markSetPassed(p, 'hiragana:a', 0, NOW);
  assert.equal(nextLevel0Set(p, 'hiragana', SET_DEFS), 'k');
  p = setLastL0(markSetPassed(p, 'hiragana:k', 0, NOW), 'hiragana', 'k');
  assert.equal(nextLevel0Set(p, 'hiragana', SET_DEFS), 's');
  // walk all sets: never returns last
  let q = defaultProgress(NOW);
  for (let i = 0; i < 40; i++) {
    const next = nextLevel0Set(q, 'hiragana', SET_DEFS, NOW);
    assert.ok(next);
    if (i > 0) assert.notEqual(next, q.lastL0Set.hiragana, `repeat at step ${i}`);
    q = setLastL0(markSetPassed(q, `hiragana:${next}`, 0, NOW), 'hiragana', next);
  }
  // all passed: weakest passed set other than last
  let all = defaultProgress(NOW);
  for (const d of SET_DEFS) all = markSetPassed(all, `hiragana:${d.id}`, 0, NOW);
  all = setLastL0(all, 'hiragana', 'm');
  for (const id of ids('hiragana', 'm')) all = recordAnswer(all, { charId: id, ok: false, given: 'x', level: 0, now: NOW });
  for (const id of ids('hiragana', 'r')) all = recordAnswer(all, { charId: id, ok: false, given: 'x', level: 0, now: NOW });
  for (const d of SET_DEFS) if (!['m', 'r'].includes(d.id)) for (const id of ids('hiragana', d.id)) all = recordAnswer(all, { charId: id, ok: true, given: '', level: 0, now: NOW });
  assert.equal(nextLevel0Set(all, 'hiragana', SET_DEFS, NOW), 'r');
  // only one set defined → repeat it
  const single = [{ id: 'a', order: 1 }];
  const sp = setLastL0(markSetPassed(defaultProgress(NOW), 'hiragana:a', 0, NOW), 'hiragana', 'a');
  assert.equal(nextLevel0Set(sp, 'hiragana', single), 'a');
});

test('suggestWeakestSet, learnedSetKeys, autoPair', () => {
  let p = defaultProgress(NOW);
  assert.equal(suggestWeakestSet(p, 'hiragana', NOW), null);
  assert.deepEqual(learnedSetKeys(p), []);
  assert.equal(autoPair(p, NOW, mulberry32(1)), null);
  p = markSetPassed(p, 'hiragana:a', 0, NOW);
  assert.equal(autoPair(p, NOW, mulberry32(1)), null);
  p = markSetPassed(p, 'hiragana:k', 0, NOW);
  p = markSetPassed(p, 'katakana:a', 0, NOW);
  p = markSetPassed(p, 'katakana:s', 1, NOW); // L1 only: not learned
  assert.deepEqual(learnedSetKeys(p), ['hiragana:a', 'hiragana:k', 'katakana:a']);
  for (const id of ids('hiragana', 'a')) p = recordAnswer(p, { charId: id, ok: true, given: '', level: 0, now: NOW });
  for (const id of ids('hiragana', 'k')) p = recordAnswer(p, { charId: id, ok: false, given: 'x', level: 0, now: NOW });
  assert.equal(suggestWeakestSet(p, 'hiragana', NOW), 'k');
  const rng = mulberry32(4);
  const counts = {};
  for (let i = 0; i < 3000; i++) {
    const pair = autoPair(p, NOW, rng);
    assert.equal(pair.length, 2);
    assert.notEqual(pair[0], pair[1]);
    for (const k of pair) counts[k] = (counts[k] || 0) + 1;
  }
  assert.ok(counts['hiragana:k'] > counts['hiragana:a'], JSON.stringify(counts));
});

test('statsById returns a full Map with empty fallback', () => {
  const m = statsById(defaultProgress(NOW));
  assert.ok(m instanceof Map);
  assert.equal(m.get('h-a').attempts, 0);
  assert.equal(m.get('k-n').ewmaErr, null);
});

test('sampleRun with maxWeak (Type): at most 4 weak kana per run of 20, strong ones not starved', async () => {
  const { sampleRun } = await import('../src/core/selection.js');
  const pool = ['a', 'k', 's', 't', 'n', 'h'].flatMap((s) => [...ids('hiragana', s), ...ids('katakana', s)]);   // 60
  const weakIds = pool.filter((_, i) => i % 5 === 0);                                                             // 12 weak
  const weak = { attempts: 20, correct: 9, misses: 11, streak: 0, lastSeen: NOW, ewmaErr: 0.7, history: [], wrong: {} };
  const strong = { attempts: 20, correct: 19, misses: 1, streak: 9, lastSeen: NOW, ewmaErr: 0.05, history: [], wrong: {} };
  const stats = new Map(pool.map((id) => [id, weakIds.includes(id) ? weak : strong]));
  const rng = mulberry32(77);
  const seen = Object.fromEntries(pool.map((id) => [id, 0]));
  for (let i = 0; i < 400; i++) {
    const run = sampleRun({ poolIds: pool, size: 20, statsById: stats, now: NOW, rng, maxWeak: 4 });
    assert.equal(new Set(run).size, 20);
    assert.ok(run.filter((id) => weakIds.includes(id)).length <= 4, 'weak cap');
    for (const id of run) seen[id]++;
  }
  // carried misses still come along even past the cap
  const carried = sampleRun({ poolIds: pool, size: 20, statsById: stats, now: NOW, rng, maxWeak: 4, include: weakIds.slice(0, 6) });
  for (const id of weakIds.slice(0, 6)) assert.ok(carried.includes(id));
  assert.equal(carried.filter((id) => weakIds.includes(id)).length, 6, 'no extra weak beyond the carried ones');
  // every strong kana appears in a good share of runs (uniform fill: 16/48 ≈ 33%)
  const strongMin = Math.min(...pool.filter((id) => !weakIds.includes(id)).map((id) => seen[id]));
  assert.ok(strongMin > 400 * 0.2, `a strong kana appeared in only ${strongMin}/400 runs`);
});

test('Type stays winnable for a struggling learner (weak kana ~50%, the rest 85%)', () => {
  const pool = ['a', 'k', 's', 't', 'n', 'h', 'm'].flatMap((s) => [...ids('hiragana', s), ...ids('katakana', s)]);
  const weakIds = new Set(pool.filter((_, i) => i % 6 === 0));
  const prompts = [];
  let strongGap = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const rng = mulberry32(seed);
    let progress = defaultProgress(NOW);
    for (const id of pool) for (let i = 0; i < 6; i++) progress = recordAnswer(progress, { charId: id, ok: weakIds.has(id) ? i % 2 === 0 : i !== 2, given: '', level: 1, now: NOW });
    let st = createLesson({ level: 3, poolIds: pool, now: NOW });
    const last = {};
    while (!st.passed && st.prompts < 3000) {
      const r = nextPrompt(st, { statsById: statsById(progress), now: NOW, rng });
      if (!weakIds.has(r.prompt.id)) strongGap = Math.max(strongGap, r.state.turn - (last[r.prompt.id] ?? 0));
      last[r.prompt.id] = r.state.turn;
      const ok = rng() < (weakIds.has(r.prompt.id) ? 0.5 : 0.85);
      const res = submitAnswer(r.state, { given: ok ? kanaById.get(r.prompt.id).romaji : 'zz', now: NOW, rng });
      progress = recordAnswer(progress, { charId: r.prompt.id, ok, given: res.givenRomaji, level: 3, now: NOW });
      st = res.state;
    }
    prompts.push(st.passed ? st.prompts : Infinity);
  }
  prompts.sort((x, y) => x - y);
  const median = prompts[prompts.length >> 1];
  console.log(`  Type prompts to pass (struggling): median ${median}, p90 ${prompts[Math.floor(prompts.length * 0.9)]}`);
  assert.ok(prompts.filter(Number.isFinite).length >= 36, 'at least 90% pass within 3000 prompts');
  assert.ok(median < 600, `median ${median}`);
  // the in-run starvation boost: a strong kana is never left unseen for hundreds of prompts (was 817)
  console.log(`  longest a strong kana went unseen: ${strongGap} prompts`);
  assert.ok(strongGap < 400, `a strong kana went ${strongGap} prompts unseen`);
});
