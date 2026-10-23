import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput, checkTyped } from '../src/core/matching.js';
import { kanaById } from '../src/core/kana.js';

const k = (id) => kanaById.get(id);
const ok = (input, id) => checkTyped(input, k(id)).correct;

test('normalizeInput', () => {
  assert.equal(normalizeInput('  SHI  '), 'shi');
  assert.equal(normalizeInput('ｓｈｉ'), 'shi');
  assert.equal(normalizeInput('ＳＨＩ'), 'shi');
  assert.equal(normalizeInput('shi.'), 'shi');
  assert.equal(normalizeInput('a   b'), 'a b');
  assert.equal(normalizeInput('　tsu　'), 'tsu');
  assert.equal(normalizeInput(null), '');
  assert.equal(normalizeInput(undefined), '');
  assert.equal(normalizeInput('n’'), "n'");
});

test('Hepburn and alternative spellings', () => {
  for (const [id, inputs] of [
    ['h-shi', ['shi', 'si']], ['k-shi', ['shi', 'si']],
    ['h-chi', ['chi', 'ti']], ['h-tsu', ['tsu', 'tu']], ['h-fu', ['fu', 'hu']],
    ['h-ji', ['ji', 'zi']], ['h-di', ['ji', 'di']], ['k-di', ['ji', 'di']],
    ['h-zu', ['zu']], ['h-du', ['zu', 'du', 'dzu']],
    ['h-wo', ['wo', 'o']], ['h-n', ['n', 'nn']], ['k-n', ['n', 'nn']],
  ]) {
    for (const s of inputs) assert.ok(ok(s, id), `${s} should be accepted for ${id}`);
  }
});

test('canonical vs nonStandard flag', () => {
  assert.deepEqual(checkTyped('shi', k('h-shi')), { correct: true, canonical: 'shi', nonStandard: false });
  assert.deepEqual(checkTyped('si', k('h-shi')), { correct: true, canonical: 'shi', nonStandard: true });
  assert.deepEqual(checkTyped('di', k('h-di')), { correct: true, canonical: 'ji', nonStandard: true });
});

test('case, whitespace, full-width and trailing period', () => {
  assert.ok(ok(' SHI ', 'h-shi'));
  assert.ok(ok('Tsu.', 'h-tsu'));
  assert.ok(ok('ｆｕ', 'h-fu'));
  assert.ok(ok('ＫＡ', 'h-ka'));
});

test('empty input is never correct', () => {
  for (const s of ['', '   ', '.', null, undefined, '　']) {
    assert.equal(checkTyped(s, k('h-a')).correct, false);
  }
});

test('wrong answers rejected', () => {
  assert.equal(ok('shi', 'h-tsu'), false);
  assert.equal(ok('su', 'h-tsu'), false);
  assert.equal(ok('ji', 'h-zu'), false);
  assert.equal(ok('du', 'h-zu'), false, 'ず does not accept du');
  assert.equal(ok('di', 'h-ji'), false, 'じ does not accept di');
  assert.equal(ok('o', 'h-a'), false);
  assert.equal(ok('ka ', 'h-ki'), false);
});

test('inner spaces, zero-width characters and odd apostrophes are tolerated', () => {
  assert.equal(ok('s hi', 'h-shi'), true, 'spaces are ignored, as they are for words');
  assert.equal(ok('​shi﻿', 'h-shi'), true);
  assert.equal(ok('n`', 'h-n'), true);
  assert.equal(ok('n´', 'h-n'), true);
  assert.equal(ok('s hi', 'h-su'), false);
});
