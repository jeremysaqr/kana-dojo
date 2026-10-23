import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WORDS, wordById, wordSetKeys, readableWords, bestNextRow } from '../src/core/words.js';
import { kanaById, setDefById, allSetKeys } from '../src/core/kana.js';
import { checkTypedWord } from '../src/core/matching.js';
import { buildMeaningOptions } from '../src/core/distractors.js';
import { createLesson, nextPrompt, submitAnswer, WORD_TARGET } from '../src/core/lesson.js';
import { sampleRun } from '../src/core/selection.js';
import { mulberry32 } from '../src/core/rng.js';

const NOW = 1_700_000_000_000;

test('word data: ids unique, units exist, romaji is the units read in order, meanings present', () => {
  assert.ok(WORDS.length >= 150 && WORDS.length <= 350, `${WORDS.length} words`);
  assert.equal(new Set(WORDS.map((w) => w.id)).size, WORDS.length, 'duplicate id');
  assert.equal(new Set(WORDS.map((w) => w.kana)).size, WORDS.length, 'duplicate kana');
  for (const w of WORDS) {
    assert.ok(w.units.length >= 2, `${w.kana}: needs two or more kana`);
    assert.equal(w.units.join(''), w.units.join(''));
    for (const id of w.units) {
      const k = kanaById.get(id);
      assert.ok(k, `${w.kana}: unknown unit ${id}`);
      assert.equal(k.script, w.script, `${w.kana}: mixed scripts`);
      assert.ok(['basic', 'dakuten'].includes(setDefById.get(k.set).group), `${w.kana}: ${k.char} is outside v1`);
    }
    assert.equal(w.units.map((id) => kanaById.get(id).char).join(''), w.kana);
    assert.equal(w.units.map((id) => kanaById.get(id).romaji).join(''), w.romaji);
    assert.ok(Array.isArray(w.en) && w.en.length > 0 && w.en.every((e) => typeof e === 'string' && e.trim()), `${w.kana}: no meaning`);
  }
});

test('word data: v1 exclusions (を, ぢ/づ, ん before a vowel or y), unique shown meanings', () => {
  const vowelOrY = new Set(['a', 'i', 'u', 'e', 'o', 'ya', 'yu', 'yo']);
  for (const w of WORDS) {
    const r = w.units.map((id) => kanaById.get(id));
    assert.ok(!r.some((k) => k.id.endsWith('-wo')), `${w.kana}: を reads as o in words`);
    assert.ok(!r.some((k) => /-(di|du)$/.test(k.id)), `${w.kana}: ぢ/づ are rare in v1 words`);
    r.forEach((k, i) => {
      if (k.romaji === 'n' && r[i + 1]) assert.ok(!vowelOrY.has(r[i + 1].romaji), `${w.kana}: ん before ${r[i + 1].char} needs n'`);
    });
  }
  const labels = WORDS.map((w) => w.en[0].toLowerCase());
  assert.equal(new Set(labels).size, labels.length, 'two words share a shown meaning');
  for (const w of WORDS) for (const id of w.related) assert.ok(wordById.get(id).related.includes(w.id), 'related is symmetric');
});

test('checkTypedWord: canonical, per-kana alternates, spacing and case; wrong readings rejected', () => {
  const w = (kana) => WORDS.find((x) => x.kana === kana);
  assert.deepEqual(checkTypedWord('sakana', w('さかな')), { correct: true, canonical: 'sakana', nonStandard: false });
  assert.equal(checkTypedWord(' Saka na ', w('さかな')).correct, true);
  assert.equal(checkTypedWord('sakama', w('さかな')).correct, false);
  assert.equal(checkTypedWord('', w('さかな')).correct, false);
  assert.deepEqual(checkTypedWord('susi', w('すし')), { correct: true, canonical: 'sushi', nonStandard: true });
  assert.equal(checkTypedWord('tikara', w('ちから')).correct, true);
  assert.equal(checkTypedWord('tukue', w('つくえ')).correct, true);
  assert.equal(checkTypedWord('hune', w('ふね')).correct, true);
  assert.equal(checkTypedWord('nizi', w('にじ')).correct, true);
  assert.equal(checkTypedWord('honn', w('ほん')).correct, true);
  assert.equal(checkTypedWord('tenpura', w('てんぷら')).correct, true);
  assert.equal(checkTypedWord('tennpura', w('てんぷら')).correct, true);
  assert.equal(checkTypedWord('tempura', w('てんぷら')).correct, false, 'm for ん is not a kana spelling');
  assert.equal(checkTypedWord('kamera', w('カメラ')).correct, true);
  assert.equal(checkTypedWord('sakanaa', w('さかな')).correct, false);
  assert.equal(checkTypedWord('saka', w('さかな')).correct, false);
});

test('readableWords and bestNextRow follow learned rows', () => {
  assert.deepEqual(readableWords([]), []);
  const vowelsAndK = readableWords(['hiragana:a', 'hiragana:k']);
  assert.ok(vowelsAndK.includes('wh-ike') && vowelsAndK.includes('wh-kao'));
  for (const id of vowelsAndK) assert.ok(wordSetKeys(wordById.get(id)).every((k) => ['hiragana:a', 'hiragana:k'].includes(k)));
  assert.ok(!vowelsAndK.some((id) => id.startsWith('wk-')), 'katakana words need katakana rows');
  const best = bestNextRow(['hiragana:a', 'hiragana:k'], allSetKeys());
  assert.ok(best && best.adds > 0);
  assert.equal(readableWords(['hiragana:a', 'hiragana:k', best.key]).length, vowelsAndK.length + best.adds);
  assert.equal(readableWords(allSetKeys()).length, WORDS.length, 'every word is readable once every row is learned');
});

test('buildMeaningOptions: three distinct meanings, never related or overlapping with the answer', () => {
  const rng = mulberry32(3);
  const pool = WORDS.map((w) => w.id);
  for (let i = 0; i < 2000; i++) {
    const answer = WORDS[i % WORDS.length];
    const opts = buildMeaningOptions(answer.id, pool, rng);
    assert.equal(opts.length, 3);
    assert.equal(new Set(opts.map((o) => o.en)).size, 3);
    assert.ok(opts.some((o) => o.id === answer.id && o.en === answer.en[0]));
    for (const o of opts) {
      if (o.id === answer.id) continue;
      assert.ok(!answer.related.includes(o.id), `${answer.kana}: related distractor ${o.id}`);
      assert.ok(!wordById.get(o.id).en.some((e) => answer.en.includes(e)));
    }
  }
  // a tiny pool still gets three options, topped up from the whole list
  assert.equal(buildMeaningOptions('wh-neko', ['wh-neko', 'wh-inu'], rng).length, 3);
});

test('sampleRun: distinct, right size, always includes the carried ids, weighted toward weak', () => {
  const pool = WORDS.slice(0, 40).map((w) => w.id);
  const rng = mulberry32(5);
  for (let i = 0; i < 200; i++) {
    const s = sampleRun({ poolIds: pool, size: 10, statsById: new Map(), now: NOW, rng, include: [pool[39]] });
    assert.equal(s.length, 10);
    assert.equal(new Set(s).size, 10);
    assert.ok(s.includes(pool[39]));
  }
  assert.equal(sampleRun({ poolIds: pool.slice(0, 4), size: 10, statsById: new Map(), now: NOW, rng }).length, 4);
  // one weak word among well-known ones
  const known = { attempts: 20, correct: 20, misses: 0, streak: 20, lastSeen: NOW, ewmaErr: 0.02, history: [], wrong: {} };
  const stats = new Map(pool.map((id) => [id, known]));
  stats.set(pool[0], { attempts: 10, correct: 2, misses: 8, streak: 0, lastSeen: NOW, ewmaErr: 0.9, history: [], wrong: {} });
  let hits = 0;
  for (let i = 0; i < 1000; i++) if (sampleRun({ poolIds: pool, size: 10, statsById: stats, now: NOW, rng }).includes(pool[0])) hits++;
  assert.ok(hits > 450, `weak word sampled ${hits}/1000 (uniform ≈ 250)`);
});

test('Level 4 (read) and Level 5 (meaning) lessons: 10 different words in a row, a miss resets', () => {
  const pool = readableWords(allSetKeys());
  for (const level of [4, 5]) {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = mulberry32(seed);
      let st = createLesson({ level, poolIds: pool, now: NOW });
      assert.equal(st.target, WORD_TARGET);
      let runSeen = new Set();
      while (!st.passed) {
        const r = nextPrompt(st, { statsById: new Map(), now: NOW, rng });
        st = r.state;
        const w = wordById.get(r.prompt.id);
        assert.ok(!runSeen.has(w.id), 'no word repeats within a run');
        runSeen.add(w.id);
        const miss = rng() < 0.1;
        let given;
        if (level === 4) given = miss ? 'zzz' : w.romaji;
        else {
          assert.equal(r.prompt.options.length, 3);
          given = miss ? r.prompt.options.find((o) => o.id !== w.id).id : w.id;
        }
        const res = submitAnswer(st, { given, now: NOW, rng });
        assert.equal(res.correct, !miss);
        assert.equal(res.canonical, w.romaji);
        st = res.state;
        if (miss) runSeen = new Set();
        if (st.prompts > 3000) throw new Error('did not pass');
      }
      assert.equal(st.lapCovered.length, 10);
    }
  }
});

test('alignWord: a misread word is charged to the kana that were misread, and only to them', async () => {
  const { alignWord } = await import('../src/core/matching.js');
  const w = (kana) => WORDS.find((x) => x.kana === kana);
  const wrong = (kana, typed) => (alignWord(typed, w(kana)) || []).filter((u) => !u.ok).map((u) => `${kanaById.get(u.id).char}:${u.given}`);
  assert.deepEqual(wrong('あさ', 'aka'), ['さ:ka'], 'the user\'s example');
  assert.deepEqual(wrong('さかな', 'sakama'), ['な:ma']);
  assert.deepEqual(wrong('さかな', 'takana'), ['さ:ta']);
  assert.deepEqual(wrong('おとうさん', 'otosan'), ['う:'], 'a left-out kana is charged with no reading');
  assert.deepEqual(wrong('てんぷら', 'tempura'), ['ん:m']);
  assert.deepEqual(wrong('カメラ', 'kanera'), ['メ:ne']);
  assert.deepEqual(wrong('さかな', 'sakanaa'), [], 'every kana read right: extra letters charge nothing');
  assert.equal(alignWord('zzz', w('あさ')), null, 'not a reading attempt: nothing charged');
  assert.equal(alignWord('', w('あさ')), null);
  assert.equal(alignWord('qwertyuiop', w('さかな')), null);
  // every correct spelling aligns cleanly, so a correct answer could never charge a kana
  for (const word of WORDS) {
    const r = alignWord(word.romaji, word);
    assert.ok(r && r.every((u) => u.ok), word.kana);
  }
});
