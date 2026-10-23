// Regression tests for the persona bug hunt, round 1: two tabs saving one document lost half the
// answers (last writer wins), and a tab that failed its first load could overwrite real progress.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultProgress, mergeProgress, recordAnswer, markSetPassed, recordLesson, recordTypeRun, setLastL0, migrate } from '../src/core/progress.js';

const NOW = 1_700_000_000_000;

function answer(p, charId, ok, t) { return recordAnswer(p, { charId, ok, given: ok ? '' : 'xx', level: 0, now: t }); }
function lesson(p, id, t) { return recordLesson(p, { id, kind: 'set', script: 'hiragana', level: 0, sets: ['hiragana:a'], startedAt: t, endedAt: t, result: 'passed', prompts: 5, correct: 5, missedIds: [] }); }

test('two tabs: every answer from both survives the merge', () => {
  let base = defaultProgress(NOW);
  base = answer(base, 'h-a', true, NOW);
  let a = base, b = base;
  for (let i = 1; i <= 20; i++) a = answer(a, i % 2 ? 'h-ka' : 'h-a', i % 3 !== 0, NOW + i * 1000);
  for (let i = 1; i <= 20; i++) b = answer(b, i % 2 ? 'h-ka' : 'h-ki', i % 4 !== 0, NOW + i * 1000 + 500);
  a = lesson(a, 'tab-a', NOW + 30000);
  b = lesson(markSetPassed(b, 'hiragana:k', 0, NOW + 31000), 'tab-b', NOW + 31000);
  // tab B saved first; tab A's save conflicts and merges onto B's
  const merged = mergeProgress(base, a, b);
  const total = (p) => Object.values(p.chars).reduce((s, c) => s + c.attempts, 0);
  assert.equal(total(merged), total(base) + 20 + 20, 'no answer lost');
  for (const id of ['h-a', 'h-ka', 'h-ki']) {
    const m = merged.chars[id];
    const exp = (k) => (a.chars[id]?.[k] || 0) + (b.chars[id]?.[k] || 0) - (base.chars[id]?.[k] || 0);
    assert.equal(m.attempts, exp('attempts'), id);
    assert.equal(m.correct, exp('correct'), id);
    assert.equal(m.misses, exp('misses'), id);
    assert.equal(Object.values(m.wrong).reduce((s, n) => s + n, 0), m.misses, `${id} wrong counts add up`);
  }
  assert.deepEqual(merged.lessons.map((l) => l.id), ['tab-a', 'tab-b']);
  assert.ok(merged.sets['hiragana:k'].passed['0'], 'a row passed in one tab stays passed');
  assert.deepEqual(migrate(merged, NOW), merged, 'the merged document is already valid');
});

test('a tab that never loaded (base = default doc) adds its work to the real progress, never replaces it', () => {
  let real = defaultProgress(NOW - 1e9);
  for (const s of ['a', 'k', 's']) real = markSetPassed(real, `hiragana:${s}`, 0, NOW - 1e8);
  real = lesson(answer(real, 'h-sa', false, NOW - 1e8), 'old', NOW - 1e8);
  real = recordTypeRun(real, NOW - 1e7, 22);
  const offlineBase = defaultProgress(NOW);
  let offline = answer(offlineBase, 'h-a', true, NOW + 1);
  offline = { ...offline, settings: { ...offline.settings, muted: true } };
  const merged = mergeProgress(null, offline, real);
  assert.equal(Object.keys(merged.sets).length, 3, 'passed rows kept');
  assert.equal(merged.lessons.length, 1);
  assert.equal(merged.typeRuns.length, 1);
  assert.equal(merged.chars['h-sa'].misses, 1);
  assert.equal(merged.chars['h-a'].attempts, 1);
  assert.equal(merged.settings.muted, true, 'a setting changed locally wins');
  assert.equal(merged.createdAt, real.createdAt);
});

test('settings and last-row choices: the side that changed wins; untouched fields follow remote', () => {
  const base = defaultProgress(NOW);
  const local = { ...setLastL0(base, 'hiragana', 'k'), settings: { ...base.settings, theme: 'dark' } };
  const remote = { ...setLastL0(base, 'katakana', 's'), settings: { ...base.settings, kanaFont: 'print' } };
  const m = mergeProgress(base, local, remote);
  assert.equal(m.settings.theme, 'dark');
  assert.equal(m.settings.kanaFont, 'print');
  assert.deepEqual(m.lastL0Set, { hiragana: 'k', katakana: 's' });
});

test('merging is idempotent when nothing changed locally', () => {
  let base = answer(defaultProgress(NOW), 'h-a', true, NOW);
  const remote = answer(base, 'h-i', false, NOW + 5);
  assert.deepEqual(mergeProgress(base, base, remote), { ...remote, createdAt: remote.createdAt });
  assert.equal(mergeProgress(base, base, remote).chars['h-i'].attempts, 1);
});

test('two tabs answering the same kana the same way in the same millisecond keep both history entries', () => {
  const base = answer(defaultProgress(NOW), 'h-a', true, NOW);
  const a = answer(base, 'h-ka', false, NOW + 5);
  const b = answer(base, 'h-ka', false, NOW + 5);
  const m = mergeProgress(base, a, b);
  assert.equal(m.chars['h-ka'].attempts, 2);
  assert.equal(m.chars['h-ka'].history.length, 2, 'history agrees with attempts');
});
