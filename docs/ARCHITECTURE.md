# Kana Dojo — architecture contract

This file is the shared contract between modules. Change it deliberately.

## Stack
- Node 24, **built-in modules only** (no npm runtime deps). Tests: `node --test test/`.
- Frontend: vanilla ES modules, no build step. `src/core/*` is pure, environment-agnostic
  (no DOM, no fs, no `Date.now()`/`Math.random()` inside — time and RNG are passed in) and is
  imported by both the browser (served at `/core/*`) and Node tests.
- All modules are ES modules (`"type": "module"` in package.json).

## Layout
```
Kana Dojo/
  Launch Kana Dojo.bat
  server.js                  static server + JSON API, binds 127.0.0.1
  package.json               {"type":"module"}, scripts.test
  data/progress.json         created on first run (+ progress.json.bak)
  src/core/
    kana.js                  character data + set definitions (data only + tiny helpers)
    rng.js                   seeded RNG: mulberry32(seed) -> () => float in [0,1)
    weakness.js              per-character stats update, weakness score, mastery band
    selection.js             in-lesson next-prompt picking, set suggestions, auto pairing
    lesson.js                lesson state machine (streak, requeue, pass)
    distractors.js           multiple-choice distractor picking
    matching.js              typed-answer normalisation + checking (kana and words)
    words.js                 Level 4–5 word list (kana + English), readability helpers
    progress.js              progress document defaults, migration, pure update helpers
  public/                    index.html, css/, js/ (UI), fonts/
  test/                      *.test.js (node:test), sim/ persona simulators
  docs/
```

## Data: `src/core/kana.js`
```js
export const SCRIPTS = ['hiragana', 'katakana'];
// Teaching order. group: 'basic' | 'dakuten' | 'yoon' (future) | 'extended' (future)
export const SET_DEFS = [
  { id: 'a',  label: 'a · i · u · e · o', group: 'basic',   order: 1 },
  { id: 'k',  ... order 2 }, s 3, t 4, n 5, h 6, m 7, y 8, r 9, wn 10,
  { id: 'g', group: 'dakuten', order 11 }, z 12, d 13, b 14, p 15,
];
// One entry per character:
export const KANA = [
  { id: 'h-ka', char: 'か', script: 'hiragana', set: 'k', romaji: 'ka', alt: [],
    grid: { row: 'k', col: 0 },        // gojuon grid position; col 0..4 = a,i,u,e,o
    confusables: ['h-ki', 'k-ka'] },   // ids that look/sound similar (may cross scripts)
  ...
];
export const kanaById: Map<id, entry>
export function setKey(script, setId) -> 'hiragana:k'
export function parseSetKey(key) -> { script, setId }
export function charsInSet(script, setId) -> entry[] (gojuon order)
export const GRID_ROWS = { basic: ['a','k','s','t','n','h','m','y','r','w','nn'], dakuten: ['g','z','d','b','p'] }
```
- ids: `h-` hiragana, `k-` katakana, then canonical romaji; duplicates disambiguated:
  ぢ = `h-di`, づ = `h-du`, ヂ = `k-di`, ヅ = `k-du`, を = `h-wo`, ん = `h-n`.
- Canonical romaji = modified Hepburn: shi chi tsu fu ji(じ and ぢ) zu(ず and づ) wo n.
- `alt` = other accepted typed spellings (Kunrei/Nihon-shiki/IME): si ti tu hu zi di du dzu o(を) nn n'.
- Grid: wa row is `'w'` (wa col 0, wo col 4); ん row `'nn'` col 0. y row: ya col 0, yu col 2, yo col 4.
- Set 'wn' contains wa, wo, n. Set 'y' contains ya, yu, yo.

## Progress document (`data/progress.json`)
```js
{
  version: 1,
  createdAt: number,
  settings: { muted: false, theme: 'system' },      // theme: system|light|dark
  chars: { [charId]: CharStats },
  sets:  { ['hiragana:k']: { passed: { '0'?: ts, '1'?: ts }, lastPlayed?: ts } },
  mixes: [ { sets: [setKey, setKey], passedAt } ],   // Level 2 passes
  typeRuns: [ { passedAt, prompts } ],                // Level 3 passes
  words: { [wordId]: CharStats },                     // Level 4–5 per-word stats
  wordRuns: [ { passedAt, prompts } ],                // Level 4 passes
  meaningRuns: [ { passedAt, prompts } ],             // Level 5 passes
  lastL0Set: { hiragana: setId|null, katakana: setId|null },
  lessons: [ LessonRecord ]                           // newest last, cap 500
}
CharStats = { attempts, correct, misses, streak, lastSeen, ewmaErr,
              history: [{ t, ok, given, level }]  /* last 30 */,
              wrong: { [givenRomaji]: count } }
LessonRecord = { id, script /* 'hiragana'|'katakana'|'mixed' */, level, sets: [setKey],
                 startedAt, endedAt, result: 'passed'|'quit', prompts, correct, missedIds: [] }
```

## Saving safely (persona bug hunt, round 1)
- The document carries a server-managed `rev`. GET returns it (`X-Progress-Rev` header and `rev` field).
  A PUT with `If-Match: <rev>` that is stale gets **409** `{ conflict, rev, doc }`; the client merges with
  `progress.mergeProgress(base, local, remote)` (counts add up, history and runs union, changed settings
  win) and retries. PUTs without If-Match are still accepted.
- The client never saves before a successful load (`store.js`); a failed first load retries every 3 s
  and then merges whatever was answered meanwhile. Tabs refresh on focus.
- A corrupt or wrong-shape main file (no numeric `version`) and a corrupt `.bak` are moved aside as
  `progress.corrupt-[bak-]<ts>.json`; GET then sends `X-Progress-Recovered: bak|fresh; aside=…` until the
  next good save, and the app shows a calm notice. A failed write returns 500 `{ code }`.
- Typed answers are capped (input maxlength 40/60; `weakness.GIVEN_CAP` = 32 in stats); `wrong` maps
  are null-prototype objects.

## Server API (127.0.0.1 only)
- `GET /api/health` → `{ app: 'kana-dojo', version }` (launcher uses it to detect an existing instance)
- `GET /api/progress` → progress document (default document if none)
- `PUT /api/progress` body = whole document → `{ ok: true, savedAt }`. Validates JSON shape minimally.
- Static: `/` → public/, `/core/*` → src/core/*.
- Writes: temp file → fsync → rename; previous good file copied to `.bak` first. Load falls back
  to `.bak` if main is unparseable. Writes serialized (queue), never concurrent.

## Product rules the logic must enforce
- Pass rule L0–L2 ('choice' mode) — **each kana once per run**: a streak is one run through every
  distinct character in the pool exactly once. `state.lapCovered` = ids answered correctly in the
  current run; `streak == lapCovered.length`; `target == poolIds.length` (5, 3, or 10); passed when
  lapCovered contains every pool id. A perfect learner passes in exactly poolIds.length prompts.
  Picking (`selection.pickNextInRun`): (1) a due re-queued miss first (never the same as the last
  prompt); (2) otherwise weighted random (0.25 + weaknessScore, so weak kana tend to come earlier)
  among pool ids not yet in lapCovered, excluding the last prompt and ids awaiting a re-ask. No
  kana repeats within a run. Miss → streak 0, lapCovered = [], missed kana re-queued at turn +2 or
  +3, so it reappears 2–3 prompts into the new run. The UI may show lapCovered (past kana only).
- Pass rule L3 ('type' mode), L4 ('read'), L5 ('meaning'): run-based over a **sampled run**.
  `selection.sampleRun` draws `target` distinct ids (20 kana / 10 words; capped at the pool size)
  by weighted sampling without replacement (0.25 + weaknessScore). Type passes `maxWeak` = 4
  (`lesson.L3_MAX_WEAK`): at most 4 weak ids (seen, score ≥ 0.45) per run, the rest drawn uniformly; `state.runIds` holds it and
  `pickNextInRun` serves it. A miss sets `runIds = null` and `carry` = the missed id plus any id
  still owed a re-ask; the next prompt draws a fresh sample that includes them, so the re-ask at
  +2/+3 lands inside the first three prompts. No repeats within a run. Type opens at 20 learned
  characters (both scripts); Words open at 15 readable words; Level 5 after one Level 4 pass.
- 'stream' mode (not used by the app): the original L3 rule, 20 correct in a row with repeats,
  `selection.pickNext` with the bounded window (2×poolSize soft, 3×poolSize hard). Kept with tests.
- Words (`src/core/words.js`): `{ id: 'wh-sakana'|'wk-kamera', script, kana, units: [kanaId],
  romaji, en: [...], related: [wordId] }`. units/romaji are derived from the kana table. A word is
  readable when every unit's row is passed (`readableWords(learnedSetKeys)`). The Words tab follows the
  hiragana/katakana switch (one script per lesson; the 15-word gate counts that script). L4 checks typed
  input per unit (`checkTypedWord`, any accepted spelling of each kana). A miss is also lined up with
  the word's kana (`matching.alignWord`, lowest-cost alignment: spelling 0, other reading 0.9/1, left
  out 1; null when the cost reaches about half the word) and each misread kana gets a level-4 miss
  with what was read as `given` (feeds the heat map and confusions). Correct syllables aren't credited. L5 options come from
  `buildMeaningOptions`: never a `related` word, never an overlapping meaning, 3 distinct labels.
- Both modes: misses re-queued to reappear 2–3 turns later. Never same char twice in a row
  (unless pool size is 1).
- Distractors: never same romaji as the answer (じ/ぢ, ず/づ are never each other's distractors),
  never duplicated, prefer same set, then confusables, then same-script others.
- No audio / name reveal before answering is a UI rule, gated in one function.
