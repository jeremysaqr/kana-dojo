import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, pickWeighted, shuffle } from '../src/core/rng.js';

test('mulberry32 is deterministic per seed and in [0,1)', () => {
  const a = mulberry32(42), b = mulberry32(42), c = mulberry32(43);
  const sa = Array.from({ length: 1000 }, a);
  const sb = Array.from({ length: 1000 }, b);
  const sc = Array.from({ length: 1000 }, c);
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const x of sa) assert.ok(x >= 0 && x < 1);
});

test('pickWeighted respects weights and zero weights', () => {
  const rng = mulberry32(1);
  const counts = { a: 0, b: 0, c: 0 };
  for (let i = 0; i < 20000; i++) counts[pickWeighted(['a', 'b', 'c'], [1, 3, 0], rng)]++;
  assert.equal(counts.c, 0);
  const ratio = counts.b / counts.a;
  assert.ok(ratio > 2.7 && ratio < 3.3, `ratio ${ratio}`);
  assert.equal(pickWeighted(['x'], [0], rng), 'x');
  assert.throws(() => pickWeighted([], [], rng));
});

test('shuffle returns a new permutation and is deterministic', () => {
  const src = [1, 2, 3, 4, 5, 6, 7, 8];
  const s1 = shuffle(src, mulberry32(7));
  const s2 = shuffle(src, mulberry32(7));
  assert.deepEqual(s1, s2);
  assert.deepEqual(src, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual([...s1].sort((a, b) => a - b), src);
});
