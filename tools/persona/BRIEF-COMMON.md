# Kana Dojo persona bug hunt: common brief

You are one persona in a bug hunt on **Kana Dojo**, a local hiragana/katakana trainer at
`C:\Users\Jeremy\Documents\Projects\Claude\Kana Dojo` (vanilla ES modules; server.js + public/ + src/core/).
Use the app the way your persona would, through a real browser, and report reproducible bugs and undesired
behaviour with quantitative evidence. **You only hunt and report. Never edit anything under the Kana Dojo
folder** (no source, tests, docs, data). Write only inside your own persona folder (below).

## Your tools
- Driver: `C:/Users/Jeremy/AppData/Local/Temp/claude/C--Users-Jeremy-Documents-Projects-Claude-award-video/a991456d-a36f-458d-8876-aaa74c03bb25/scratchpad/persona/kd-driver.mjs`.
  Read it first (it's short). Write your scripts as `.mjs` files in your persona folder and `import { start, seed, startServer, sleep } from '../kd-driver.mjs'`.
  - `start({ name, serverPort, cdpPort, width, height, serverArgs })` runs the real server on your port with
    data in `<persona folder>/data` and a headless Edge on your CDP port. Returns `kd` with:
    `go(hash)` (fresh page load), `key(k)` (trusted keyboard: 'Enter','Escape','Tab',' ','1','a','ArrowRight'…),
    `type(str)`, `click(selector)` (trusted mouse), `js(asyncBody)` (evaluate in page, return JSON),
    `state()` (what's on screen in a lesson, including the correct answer computed from the data, the streak,
    the speech gate and the speech audit), `progress()` (saved JSON from the server), `shot(file)`,
    `viewport(w,h,{dark})`, `consoleErrors` (array), `stop()`.
  - `seed(dataDir, { hiragana:['a','k',…], katakana:[…], recall:['hiragana:a'], wordRuns:n })` writes a
    progress file with rows passed at Learn **before** `start()` (use your own `<persona folder>/data`).
  - `window.__kanaDojo` in the page has `speechAudit` ({spoken, refusedWhileClosed, spokenWhileClosed}),
    `isGateOpen()` and `store` (get()). Headless Edge has no speech voices, so `spoken` stays 0; judge the
    no-reveal rule from the gate state and the DOM.
- Pure core modules can also be imported directly in Node for big simulations:
  `src/core/{lesson,selection,progress,kana,words,matching,distractors}.js` (see `docs/ARCHITECTURE.md`).
  Prefer the browser for behaviour a learner sees; use Node only for large-N statistics.
- Always `await kd.stop()` in a `finally`. Use only your assigned ports. Kill nothing you didn't start.
- Run node with a generous timeout; keep each script run under ~4 minutes.

## Product rules to test against (the spec)
- Levels: 0 Learn (study a row, then quiz), 1 Recall (quiz a passed row), 2 Mix (10 chars from two passed
  rows), 3 Type (type romaji; opens at 20 learned characters; each run is 20 *different* characters),
  4 Read the word (Words tab; type a word's romaji; opens at 15 readable words; 10 different words in a row),
  5 What does it mean (Words tab; pick the English from 3; opens after one Level 4 pass).
- Pass rule (all levels): every item in the run answered correctly **once each, in a row**. A miss empties the
  streak (train back to stop 1), and the missed item comes back **2–3 prompts later**. No item twice in a row;
  no repeats within a run. In Type/Words a miss starts a fresh sampled run containing the missed item within
  its first 3 prompts. A perfect learner passes L0 in exactly the row size (5, or 3 for y / wn).
- Weak characters are weighted to come up earlier/more often. Distractors never read the same as the answer
  (じ/ぢ, ず/づ never against each other), never duplicated; word distractors never related or same meaning.
- **No reveal before answering (critical):** in any quiz prompt, before the answer is submitted the romaji,
  the row's line colour (sign band / code ring) and the sound must not be available; the speech gate must be
  closed. This includes the accessibility tree (aria-labels, live regions, titles).
- Gating: locked levels explain why and what unlocks them. A new Learn lesson never repeats the previous row
  unless nothing else remains.
- Persistence: progress saves to `<data>/progress.json` (atomic write, `.bak`), survives restarts and kills.
- Typed answers accept shi/si, chi/ti, tsu/tu, fu/hu, ji/zi, ぢ di, づ du/dzu, を wo/o, ん n/nn/n', any case,
  surrounding spaces, full-width letters; words accept any accepted spelling per kana, spaces/hyphens ignored.
- Calm voice; keyboard: 1/2/3 answer, Enter check/next, H hear, Escape ends a lesson (confirm if answers).

## What to report (your final message)
1. **Findings**, most severe first. Each: title; severity (P0 crash/stuck/no-reveal leak/data loss, P1 wrong
   behaviour, P2 friction/a11y, P3 polish); exact repro steps (script path + seed/settings); expected vs
   actual; evidence (numbers, captured state, screenshot path). Only report what you reproduced.
2. **Checks that passed**, briefly, with the numbers that show it (so a clean area is on record).
3. **Quantitative tables** your persona is asked for.
Keep the report factual and under ~900 words. Do not propose code patches beyond a one-line likely cause.
