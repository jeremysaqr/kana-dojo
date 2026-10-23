import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultProgress, migrate, recordAnswer, markSetPassed, recordLesson, recordMix,
  recordTypeRun, setLastL0, statsById, LESSONS_CAP, recordWordAnswer, recordWordRun, wordStatsById,
} from '../src/core/progress.js';

const NOW = 1_700_000_000_000;

function assertValid(p) {
  assert.equal(p.version, 1);
  assert.equal(typeof p.createdAt, 'number');
  assert.equal(typeof p.settings.muted, 'boolean');
  assert.ok(['system', 'light', 'dark'].includes(p.settings.theme));
  assert.ok(['textbook', 'print'].includes(p.settings.kanaFont));
  assert.equal(typeof p.chars, 'object');
  assert.equal(typeof p.sets, 'object');
  assert.ok(Array.isArray(p.mixes));
  assert.ok(Array.isArray(p.typeRuns));
  assert.ok(Array.isArray(p.lessons));
  assert.ok('hiragana' in p.lastL0Set && 'katakana' in p.lastL0Set);
  JSON.parse(JSON.stringify(p));
}

test('defaultProgress matches the contract', () => {
  assert.deepEqual(defaultProgress(NOW), {
    version: 1, createdAt: NOW, settings: { muted: false, theme: 'system', kanaFont: 'textbook' }, chars: {}, sets: {},
    mixes: [], typeRuns: [], words: {}, wordRuns: [], meaningRuns: [], lastL0Set: { hiragana: null, katakana: null }, lessons: [],
  });
});

test('word stats and Level 4–5 runs: recorded, kept by migrate, unknown word ids dropped', () => {
  let p = defaultProgress(NOW);
  p = recordWordAnswer(p, { wordId: 'wh-sakana', ok: false, given: 'sakama', level: 4, now: NOW });
  p = recordWordAnswer(p, { wordId: 'wh-sakana', ok: true, given: 'sakana', level: 4, now: NOW });
  p = recordWordRun(p, 'read', NOW, 12);
  p = recordWordRun(p, 'meaning', NOW, 10);
  assert.equal(p.words['wh-sakana'].attempts, 2);
  assert.equal(p.words['wh-sakana'].wrong.sakama, 1);
  assert.deepEqual(p.wordRuns, [{ passedAt: NOW, prompts: 12 }]);
  assert.deepEqual(p.meaningRuns, [{ passedAt: NOW, prompts: 10 }]);
  assert.throws(() => recordWordAnswer(p, { wordId: 'wh-nope', ok: true, now: NOW }));
  const m = migrate({ ...JSON.parse(JSON.stringify(p)), words: { ...p.words, 'wh-nope': { attempts: 3 } }, wordRuns: [null, ...p.wordRuns] }, NOW);
  assert.deepEqual(Object.keys(m.words), ['wh-sakana']);
  assert.equal(m.wordRuns.length, 1);
  assert.equal(m.meaningRuns.length, 1);
  assert.equal(wordStatsById(m).get('wh-sakana').attempts, 2);
  assert.equal(wordStatsById(m).get('wk-kamera').attempts, 0);
});

test('migrate never throws on garbage and returns a valid document', () => {
  const garbage = [
    null, undefined, 0, 42, 'string', true, [], [1, 2], {}, { version: 'x' },
    { chars: 'nope', sets: [], mixes: {}, lessons: 'x', settings: 5, lastL0Set: [] },
    { chars: { 'h-a': 'bad', 'h-i': { attempts: -3, ewmaErr: 7, history: 'x', wrong: [] }, bogus: {} } },
    { sets: { 'hiragana:a': { passed: { 0: 'x', 1: NOW } }, 'nope:zz': {} }, lastL0Set: { hiragana: 'zz', katakana: 'k' } },
    { lessons: [null, 5, { result: 'passed', sets: [1, 'hiragana:a'] }], mixes: [null, { sets: ['a', 'b'], passedAt: NOW }] },
    { settings: { muted: 'yes', theme: 'neon' }, createdAt: NaN },
    Object.create(null),
  ];
  for (const g of garbage) {
    const p = migrate(g, NOW);
    assertValid(p);
  }
  const p = migrate(garbage[11], NOW);
  assert.deepEqual(Object.keys(p.chars).sort(), ['h-a', 'h-i']);
  assert.equal(p.chars['h-i'].attempts, 0);
  assert.equal(p.chars['h-i'].ewmaErr, null);
  const q = migrate(garbage[12], NOW);
  assert.deepEqual(q.sets, { 'hiragana:a': { passed: { 1: NOW } } });
  assert.deepEqual(q.lastL0Set, { hiragana: null, katakana: 'k' });
  const r = migrate(garbage[13], NOW);
  assert.equal(r.lessons.length, 1);
  assert.deepEqual(r.lessons[0].sets, ['hiragana:a']);
  assert.equal(r.mixes.length, 1);
});

test('migrate keeps a valid document intact', () => {
  let p = defaultProgress(NOW - 1000);
  p = recordAnswer(p, { charId: 'h-a', ok: false, given: 'o', level: 0, now: NOW });
  p = markSetPassed(p, 'hiragana:a', 0, NOW);
  p = recordMix(p, ['hiragana:a', 'katakana:a'], NOW);
  p = recordTypeRun(p, NOW, 24);
  p = setLastL0(p, 'hiragana', 'a');
  p = recordLesson(p, { id: 'L1', kind: 'set', script: 'hiragana', level: 0, sets: ['hiragana:a'], startedAt: NOW - 50, endedAt: NOW, result: 'passed', prompts: 6, correct: 5, missedIds: ['h-a'] });
  p = { ...p, settings: { muted: true, theme: 'dark', kanaFont: 'print' } };
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(p)), NOW + 1), p);
});

test('helpers do not mutate input', () => {
  const p0 = defaultProgress(NOW);
  const snap = JSON.stringify(p0);
  const p1 = recordAnswer(p0, { charId: 'h-ka', ok: true, given: 'ka', level: 0, now: NOW });
  markSetPassed(p1, 'hiragana:k', 0, NOW);
  recordMix(p1, ['a', 'b'], NOW);
  recordTypeRun(p1, NOW, 20);
  setLastL0(p1, 'katakana', 'k');
  recordLesson(p1, { id: 1, sets: ['hiragana:k'], endedAt: NOW });
  assert.equal(JSON.stringify(p0), snap);
  assert.equal(p1.chars['h-ka'].attempts, 1);
  assert.deepEqual(p1.sets, {});
  assert.throws(() => recordAnswer(p0, { charId: 'nope', ok: true, now: NOW }));
});

test('markSetPassed keeps first pass time; recordLesson caps at 500', () => {
  let p = markSetPassed(defaultProgress(NOW), 'hiragana:k', 0, NOW);
  p = markSetPassed(p, 'hiragana:k', 0, NOW + 5);
  p = markSetPassed(p, 'hiragana:k', 1, NOW + 9);
  assert.deepEqual(p.sets['hiragana:k'], { passed: { 0: NOW, 1: NOW + 9 }, lastPlayed: NOW + 9 });
  let q = defaultProgress(NOW);
  for (let i = 0; i < LESSONS_CAP + 20; i++) q = recordLesson(q, { id: i, result: 'quit', sets: [] });
  assert.equal(q.lessons.length, 500);
  assert.equal(q.lessons[0].id, 20);
  assert.equal(q.lessons.at(-1).id, 519);
});

test('statsById has every char', () => {
  const p = recordAnswer(defaultProgress(NOW), { charId: 'k-n', ok: true, given: 'n', level: 3, now: NOW });
  const m = statsById(p);
  assert.equal(m.size, 142);
  assert.equal(m.get('k-n').attempts, 1);
  assert.equal(m.get('h-n').attempts, 0);
});
