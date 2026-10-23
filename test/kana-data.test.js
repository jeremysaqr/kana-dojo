import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCRIPTS, SET_DEFS, GRID_ROWS, KANA, kanaById, charsInSet,
} from '../src/core/kana.js';

const BLOCKS = {
  hiragana: [0x3040, 0x309f],
  katakana: [0x30a0, 0x30ff],
};
const EXPECTED_SET_SIZE = (id) => (id === 'y' || id === 'wn' ? 3 : 5);

test('71 entries per script, 142 total', () => {
  assert.equal(KANA.length, 142);
  for (const script of SCRIPTS) {
    assert.equal(KANA.filter((k) => k.script === script).length, 71, script);
  }
});

test('ids are unique and prefixed by script', () => {
  const ids = KANA.map((k) => k.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(kanaById.size, KANA.length);
  for (const k of KANA) {
    assert.ok(k.id.startsWith(k.script === 'hiragana' ? 'h-' : 'k-'), k.id);
  }
});

test('chars are unique single code points in the correct Unicode block', () => {
  const chars = KANA.map((k) => k.char);
  assert.equal(new Set(chars).size, chars.length);
  for (const k of KANA) {
    assert.equal([...k.char].length, 1, `${k.id} must be one code point`);
    const cp = k.char.codePointAt(0);
    const [lo, hi] = BLOCKS[k.script];
    assert.ok(cp >= lo && cp <= hi, `${k.id} U+${cp.toString(16)} outside ${k.script} block`);
  }
});

test('excluded characters are absent (obsolete, small, marks, long vowel)', () => {
  const chars = new Set(KANA.map((k) => k.char));
  for (const c of ['ゐ', 'ゑ', 'ヰ', 'ヱ', 'ゎ', 'ヮ', 'ー', 'ゔ', 'ヴ', 'っ', 'ッ', 'ゃ', 'ャ', '゛', '゜', 'ゝ', 'ヽ', '・']) {
    assert.ok(!chars.has(c), `${c} must not be in v1 data`);
  }
});

test('key glyph/romaji spot checks', () => {
  const expect = {
    'h-wo': ['を', 'wo'], 'k-wo': ['ヲ', 'wo'], 'h-n': ['ん', 'n'], 'k-n': ['ン', 'n'],
    'h-ji': ['じ', 'ji'], 'h-di': ['ぢ', 'ji'], 'k-di': ['ヂ', 'ji'],
    'h-zu': ['ず', 'zu'], 'h-du': ['づ', 'zu'], 'k-du': ['ヅ', 'zu'],
    'k-shi': ['シ', 'shi'], 'k-tsu': ['ツ', 'tsu'], 'k-so': ['ソ', 'so'], 'h-fu': ['ふ', 'fu'],
  };
  for (const [id, [char, romaji]] of Object.entries(expect)) {
    const k = kanaById.get(id);
    assert.ok(k, id);
    assert.equal(k.char, char, id);
    assert.equal(k.romaji, romaji, id);
  }
});

test('every SET_DEFS set has the expected size in both scripts', () => {
  for (const script of SCRIPTS) {
    let total = 0;
    for (const s of SET_DEFS) {
      const n = charsInSet(script, s.id).length;
      assert.equal(n, EXPECTED_SET_SIZE(s.id), `${script}:${s.id}`);
      total += n;
    }
    assert.equal(total, 71);
  }
  for (const k of KANA) assert.ok(SET_DEFS.some((s) => s.id === k.set), k.id);
});

test('confusables exist, are symmetric, and never self-reference', () => {
  for (const k of KANA) {
    assert.equal(new Set(k.confusables).size, k.confusables.length, `${k.id} duplicate confusable`);
    for (const c of k.confusables) {
      assert.notEqual(c, k.id);
      const other = kanaById.get(c);
      assert.ok(other, `${k.id} -> unknown ${c}`);
      assert.ok(other.confusables.includes(k.id), `${c} does not list ${k.id}`);
    }
  }
});

test('romaji and alt are lowercase ASCII; no alt duplicates canonical', () => {
  const re = /^[a-z']+$/;
  for (const k of KANA) {
    assert.match(k.romaji, re, k.id);
    assert.ok(Array.isArray(k.alt), k.id);
    assert.equal(new Set(k.alt).size, k.alt.length, `${k.id} duplicate alt`);
    for (const a of k.alt) {
      assert.match(a, re, `${k.id} alt ${a}`);
      assert.notEqual(a, k.romaji, `${k.id} alt duplicates canonical`);
    }
  }
});

test('grid positions are unique per script and valid', () => {
  const rows = new Set([...GRID_ROWS.basic, ...GRID_ROWS.dakuten]);
  for (const script of SCRIPTS) {
    const seen = new Set();
    for (const k of KANA.filter((x) => x.script === script)) {
      assert.ok(rows.has(k.grid.row), `${k.id} row ${k.grid.row}`);
      assert.ok(Number.isInteger(k.grid.col) && k.grid.col >= 0 && k.grid.col <= 4, k.id);
      const key = `${k.grid.row}:${k.grid.col}`;
      assert.ok(!seen.has(key), `${script} duplicate grid ${key}`);
      seen.add(key);
    }
  }
});
