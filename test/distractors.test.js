import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDistractors, buildOptions } from '../src/core/distractors.js';
import { KANA, kanaById, charsInSet } from '../src/core/kana.js';
import { mulberry32 } from '../src/core/rng.js';

const ids = (script, set) => charsInSet(script, set).map((k) => k.id);

test('never same romaji, never answer, labels distinct — all chars, thousands of runs', () => {
  const rng = mulberry32(123);
  const pools = [
    ids('hiragana', 'z').concat(ids('hiragana', 'd')),
    ids('katakana', 'z').concat(ids('katakana', 'd')),
    ids('hiragana', 'd'),
    ids('hiragana', 'wn'),
    ids('hiragana', 'a').concat(ids('hiragana', 'wn')),
    [],
  ];
  let runs = 0;
  for (let rep = 0; rep < 8; rep++) {
    for (const answer of KANA) {
      for (const pool of pools) {
        const opts = buildOptions(answer.id, pool, rng);
        runs++;
        assert.equal(opts.length, 3);
        assert.equal(opts.filter((o) => o.id === answer.id).length, 1);
        assert.equal(new Set(opts.map((o) => o.romaji)).size, 3, `labels ${JSON.stringify(opts)}`);
        assert.equal(new Set(opts.map((o) => o.id)).size, 3);
        for (const o of opts) if (o.id !== answer.id) assert.notEqual(o.romaji, answer.romaji);
      }
    }
  }
  assert.ok(runs > 5000);
});

test('じ/ぢ and ず/づ are never each other\'s distractors', () => {
  const rng = mulberry32(9);
  const pairs = [['h-ji', 'h-di'], ['h-zu', 'h-du'], ['k-ji', 'k-di'], ['k-zu', 'k-du']];
  const pool = [...ids('hiragana', 'z'), ...ids('hiragana', 'd'), ...ids('katakana', 'z'), ...ids('katakana', 'd')];
  for (let i = 0; i < 3000; i++) {
    for (const [a, b] of pairs) {
      assert.ok(!pickDistractors(a, pool, rng).includes(b));
      assert.ok(!pickDistractors(b, pool, rng).includes(a));
    }
  }
});

test('を never gets お as a distractor (お reads as an accepted spelling of を)', () => {
  const rng = mulberry32(5);
  const pool = [...ids('hiragana', 'a'), ...ids('hiragana', 'wn')];
  for (let i = 0; i < 2000; i++) {
    assert.ok(!pickDistractors('h-wo', pool, rng).includes('h-o'));
    assert.ok(!pickDistractors('h-o', pool, rng).includes('h-wo'));
  }
});

test('prefers lesson pool, then confusables, then same script/group', () => {
  const rng = mulberry32(77);
  const pool = ids('hiragana', 'k');
  for (let i = 0; i < 2000; i++) {
    for (const d of pickDistractors('h-ka', pool, rng)) assert.ok(pool.includes(d));
  }
  // pool of 3 with a single usable other member → one pool, one confusable
  const tiny = ['h-u', 'h-ra'];
  for (let i = 0; i < 500; i++) {
    const d = pickDistractors('h-u', tiny, rng);
    assert.ok(d.includes('h-ra'));
    const other = d.find((x) => x !== 'h-ra');
    assert.ok(kanaById.get('h-u').confusables.includes(other), `${other} should be a confusable`);
  }
  // empty pool, no confusables → same script and group
  for (let i = 0; i < 500; i++) {
    for (const d of pickDistractors('h-pi', [], rng)) {
      const e = kanaById.get(d);
      assert.equal(e.script, 'hiragana');
      assert.ok(['g', 'z', 'd', 'b', 'p'].includes(e.set));
    }
  }
});

test('distribution is randomised over the pool', () => {
  const rng = mulberry32(3);
  const pool = ids('hiragana', 'a');
  const seen = new Map();
  for (let i = 0; i < 2000; i++) for (const d of pickDistractors('h-a', pool, rng)) seen.set(d, (seen.get(d) || 0) + 1);
  assert.equal(seen.size, 4);
  for (const c of seen.values()) assert.ok(c > 700, `count ${c}`);
});
