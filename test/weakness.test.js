import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyStats, updateStats, weaknessScore, masteryBand, practiceNeed, lifetimeAccuracy, MASTERY, EWMA_ALPHA, GIVEN_CAP } from '../src/core/weakness.js';

const DAY = 86400000;
const T0 = 1_700_000_000_000;

function run(seq, start = T0) {
  let s = emptyStats();
  seq.forEach((ok, i) => { s = updateStats(s, { ok, given: ok ? '' : 'X ', level: 0, now: start + i * 1000 }); });
  return s;
}

test('updateStats is immutable and counts correctly', () => {
  const s0 = emptyStats();
  const s1 = updateStats(s0, { ok: false, given: ' Shi ', level: 0, now: T0 });
  assert.deepEqual(s0, emptyStats());
  assert.equal(s1.attempts, 1);
  assert.equal(s1.misses, 1);
  assert.equal(s1.streak, 0);
  assert.equal(s1.ewmaErr, 1, 'first observation initialises ewma');
  assert.deepEqual({ ...s1.wrong }, { shi: 1 });
  assert.equal(Object.getPrototypeOf(s1.wrong), null, 'null prototype: "__proto__" stays a plain key');
  assert.equal(s1.lastSeen, T0);
  const s2 = updateStats(s1, { ok: true, given: 'tsu', level: 0, now: T0 + 1 });
  assert.equal(s2.correct, 1);
  assert.equal(s2.streak, 1);
  assert.ok(Math.abs(s2.ewmaErr - (1 - EWMA_ALPHA)) < 1e-12);
  assert.deepEqual({ ...s2.wrong }, { shi: 1 }, 'correct answers do not touch wrong');
  assert.notEqual(s2.history, s1.history);
  assert.equal(s1.history.length, 1);
});

test('history keeps last 30', () => {
  const s = run(Array(45).fill(true));
  assert.equal(s.history.length, 30);
  assert.equal(s.history[29].t, T0 + 44 * 1000);
});

test('unseen chars score ~0.5; fresh miss > unseen > known', () => {
  assert.equal(weaknessScore(emptyStats(), T0), 0.5);
  const miss = run([false]);
  const known = run(Array(10).fill(true));
  assert.ok(weaknessScore(miss, T0) > 0.5);
  assert.ok(weaknessScore(known, T0 + 10000) < 0.2);
  for (const s of [miss, known]) {
    const w = weaknessScore(s, T0 + 365 * DAY);
    assert.ok(w >= 0 && w <= 1);
  }
});

test('recent misses outweigh old misses', () => {
  const oldMiss = run([false, false, true, true, true, true, true, true]);
  const recentMiss = run([true, true, true, true, true, true, false, false]);
  const now = T0 + 10000;
  assert.ok(weaknessScore(recentMiss, now) > weaknessScore(oldMiss, now) + 0.3,
    `${weaknessScore(recentMiss, now)} vs ${weaknessScore(oldMiss, now)}`);
});

test('staleness grows slowly and saturates', () => {
  const s = run(Array(10).fill(true));
  const last = s.lastSeen;
  const w0 = weaknessScore(s, last);
  const w1 = weaknessScore(s, last + DAY);
  const w7 = weaknessScore(s, last + 7 * DAY);
  const w100 = weaknessScore(s, last + 100 * DAY);
  assert.ok(w0 < w1 && w1 < w7 && w7 <= w100);
  assert.ok(w100 - w0 <= 0.1 + 1e-9, 'staleness bonus is small');
  assert.ok(w100 - weaknessScore(s, last + 30 * DAY) < 0.001, 'saturates');
});

test('masteryBand thresholds', () => {
  const now = T0 + 100000;
  assert.equal(masteryBand(emptyStats(), now), 'unseen');
  assert.equal(masteryBand(run([false]), now), 'struggling');
  assert.equal(masteryBand(run([true, false]), now), 'learning', 'one miss after a hit: ewma 0.35');
  assert.equal(masteryBand(run([true, false, false]), now), 'struggling');
  assert.equal(masteryBand(run([true, true]), now), 'learning');
  assert.equal(masteryBand(run([true, true, true, true]), now), 'solid');
  const eight = run(Array(MASTERY.MASTERED_MIN_ATTEMPTS).fill(true));
  assert.equal(masteryBand(eight, now), 'mastered');
  assert.equal(masteryBand(run(Array(7).fill(true)), now), 'solid', '7 attempts is not enough');
  // streak too short for mastered
  assert.notEqual(masteryBand(run([true, true, true, true, true, true, false, true, true, true, true]), now), 'mastered');
  // idle mastered → solid
  assert.equal(masteryBand(eight, eight.lastSeen + 31 * DAY), 'solid');
});

test('typos named like object internals are counted, and pasted essays are capped', () => {
  let s = emptyStats();
  for (const g of ['__proto__', 'constructor', '__proto__', 'toString']) s = updateStats(s, { ok: false, given: g, level: 3, now: T0 });
  assert.equal(s.wrong.__proto__, 2);
  assert.equal(s.wrong.constructor, 1);
  assert.equal(Object.values(s.wrong).reduce((a, b) => a + b, 0), s.misses);
  const big = updateStats(emptyStats(), { ok: false, given: 'z'.repeat(2_700_000), level: 3, now: T0 });
  assert.equal(big.history[0].given.length, GIVEN_CAP);
  assert.ok(JSON.stringify(big).length < 400, 'a huge answer adds only a few bytes');
});

test('lifetime accuracy keeps a long weak record out of solid/mastered', () => {
  // 131 attempts at ~51%, ending on a lucky streak: recent EWMA looks fine, lifetime does not.
  const seq = [];
  for (let i = 0; i < 125; i++) seq.push(i % 2 === 0);
  for (let i = 0; i < 6; i++) seq.push(true);
  const s = run(seq);
  assert.ok(s.ewmaErr < 0.15, 'the recent answers alone look mastered');
  assert.equal(masteryBand(s, T0 + 200000), 'struggling');
  assert.ok(practiceNeed(s, T0 + 200000) > practiceNeed(run(Array(20).fill(true)), T0 + 200000) + 0.2);
  // a genuinely strong record is unaffected
  assert.equal(masteryBand(run(Array(12).fill(true)), T0 + 20000), 'mastered');
  assert.equal(lifetimeAccuracy(emptyStats()), null);
});
