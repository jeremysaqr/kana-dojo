# Kana Dojo

Kana Dojo takes a complete beginner from zero to reliable recognition of hiragana and katakana, one
consonant row at a time. It tracks every weakness and turns your progress into statistics and heat maps.
It runs entirely on your own computer: no accounts, no internet needed after setup.

## Start it (30 seconds)

1. Install **Node.js 18 or newer** if you don't have it: <https://nodejs.org> (the LTS button).
2. Double-click **`Launch Kana Dojo.bat`**. Your browser opens at `http://127.0.0.1:4173/`.
3. Keep the black console window open while you practise. Close it to stop Kana Dojo.

Want to practise on your phone? Double-click **`Launch Kana Dojo (LAN - phone).bat`** instead. The
console prints an address like `http://192.168.1.23:4173/`; open it on a phone on the same Wi-Fi.
If Windows Firewall asks about Node.js, allow **Private networks** only. LAN mode is off unless you
use that launcher.

If something goes wrong the launcher tells you why: Node missing or too old, or the port busy (it
reuses a running Kana Dojo or moves to the next free port).

## Learners (profiles)

Everyone who practises on this computer can have their own profile: progress, stats, settings and words.
Kana Dojo asks **"Who's practising?"** when there's more than one learner. Switch at any time with the name
button in the top bar, where you can also add, rename or remove learners. There are no passwords: anyone at
the computer can open any profile. Removing a learner moves their progress to `data/deleted-profiles/`,
never erasing it.

## Desktop app (installer)

Kana Dojo also runs as a normal Windows app in its own window, with an installer and automatic updates.
The code is the same as the browser version: keep using the browser for quick changes, and build the app
now and then.

| What | Command |
|---|---|
| Run the desktop app from source | `npm run app` |
| Build the installer (`dist\Kana Dojo Setup <version>.exe`) | `npm run dist` |
| Build and publish a GitHub Release (installed copies update from it) | `npm run release` (see `tools/release.mjs` for the token it needs) |

- The first time, run `npm install` to get the build tools (Electron, electron-builder).
- The installed app keeps its data in **`%APPDATA%\Kana Dojo\data`**, separate from this folder's `data/`.
  To carry progress over, close both and copy `data\profiles\` and `data\profiles.json` across.
- **Updates:** raise `"version"` in `package.json`, then `npm run release`. The app checks GitHub on start,
  downloads a newer version in the background, and offers to restart.
- The installer isn't code-signed, so the first time Windows SmartScreen says "Windows protected your PC";
  choose **More info → Run anyway**.

## How it works

Each **row** of kana is a rail line, and each character is a station. You ride a line by answering.

| Level | What you do | Opens when |
|---|---|---|
| **0 · Learn** | Study a row's station boards (name and sound shown), then a 3-button quiz | Always. Your first lesson in each script is the vowels あいうえお / アイウエオ |
| **1 · Recall** | The quiz on its own, no study | You've passed that row in Learn |
| **2 · Mix** | Two passed rows (either script) at once, 10 characters | You've passed two rows |
| **3 · Type** | Type the romaji for characters from every passed row, both scripts | You've learned 20 characters |
| **4 · Read the word** (Words tab) | Type how a real word reads (さかな → sakana), in the script picked at the top. A misread syllable counts against that kana in Stats | Type is open, and 15 words in that script use only kana you've learned |
| **5 · What does it mean** (Words tab) | Pick a word's English meaning from three | You've passed Read the word once |

**Passing Learn/Recall/Mix:** answer every character in the lesson **once each, in a row**. One
wrong answer empties the streak, and the character you missed comes back 2–3 prompts later.
**Passing Type:** 20 *different* characters in a row, drawn from your learned pool. At most 4 of
the 20 are characters you find hard, so a run stays winnable and every character keeps coming up. A
miss starts a fresh run of 20, with the missed character inside its first three prompts.
**Passing Words:** the same rule with 10 different words. A word is only asked once every kana in it
belongs to a row you've passed, so the list grows as you learn.

Rows run in the classic order a, k, s, t, n, h, m, y, r, w/n, then the dakuten rows g, z, d, b, p.
Each new Learn lesson suggests a different row from last time (the next one you haven't passed); click
any station on the map to choose another.

**No peeking.** In a quiz, the romaji, the row's line colour, the station code and the sound all stay
hidden until you answer. The sound plays in the study phase and after each answer (if your computer
has a Japanese voice).

**Stats** shows a heat map of the full chart per script. Every cell is labelled and patterned, not just
coloured: *Not seen yet*, *Struggling*, *Learning*, *Solid*, *Mastered*. Click a cell for its attempts,
accuracy, recent answers and what you confuse it with. It also shows your weakest characters, most-confused
pairs, practice-day streak, accuracy trend and rows passed. **Drill my weak spots** and **Confusion drill**
start a lesson built from that data.

### Keyboard

| Where | Keys |
|---|---|
| Home screens | **Enter** starts the highlighted lesson |
| Study | **← →** browse · **Space** next · **H** hear it · **Enter** start the quiz |
| Quiz | **1 2 3** answer · **Enter**/**Space** next · **H** hear it again (after answering) |
| Type | type the sound · **Enter** check · **Enter** next |

Accepted spellings in Type include shi/si, chi/ti, tsu/tu, fu/hu, ji/zi, ぢ di, づ du/dzu, を wo/o, ん n/nn/n'.
Case and spaces don't matter. After a correct non-standard spelling, the standard Hepburn form is shown.

### Settings

The gear icon has the theme (System/Light/Dark) and the kana style: **Textbook** (Klee One, close to
handwriting) or **Print** (Noto Sans JP, as on signs). Practise with both. The speaker icon mutes sound.
No Japanese voice? Windows: Settings › Time & language › Speech › add Japanese.

## Your data

Each learner's progress lives in **`data/profiles/<id>/progress.json`** inside this folder, listed in
`data/profiles.json` (the desktop app uses `%APPDATA%\Kana Dojo\data` instead). Older single-learner
progress (`data/progress.json`) becomes the first profile automatically, and the original is kept as
`progress.json.pre-profiles`. Every save writes a temp file, flushes it to disk and renames it over the old
one, and the previous good version is kept as `progress.json.bak`. A crash or a killed process can't leave a half-written file. If the main file is
ever unreadable, Kana Dojo loads the backup and keeps the broken file as `progress.corrupt-<time>.json`.
Only one Kana Dojo can use a data folder at a time (`data/server.lock`). To start over, close Kana Dojo
and delete the `data` folder.

## The algorithm

All learning logic is pure functions in `src/core/` (no clock or randomness inside: time and a seeded
random generator are passed in), so it's tested directly.

**Per-character stats** (`weakness.js`): attempts, correct, misses, current streak, last seen, the last 30
answers, wrong answers given, and `ewmaErr`, an exponentially weighted error rate (miss = 1, correct = 0,
α = 0.35, so recent answers dominate).

**Weakness score**, 0 to 1:
`0.75 × ewmaErr + 0.15 × 3/(3 + attempts) + 0.10 × (1 − e^(−days since seen / 3))`.
A character you've never answered scores 0.5, a fresh miss about 0.86, and a well-known character 0.05–0.15.

**Mastery bands:** *unseen* (0 attempts), *struggling* (ewmaErr ≥ 0.5), *mastered* (≥ 8 attempts,
ewmaErr ≤ 0.15, streak ≥ 5, seen in the last 30 days), *solid* (≥ 4 attempts, ewmaErr ≤ 0.3), otherwise
*learning*.

**Choosing the next prompt** (`selection.js`):
- *Learn/Recall/Mix (a "run"):*
  1. A missed character due back is served first.
  2. Otherwise one is picked at random from the characters not yet answered in this run, weighted by
     `0.25 + weakness`, so weak ones tend to come early.
  3. Never the same character twice in a row, and no repeats within a run.
- *Type and Words:* each run is a sample (no repeats) of 20 characters or 10 words from the pool, then
  picked exactly like a Learn run. Words are sampled with weight `0.25 + weakness`. Type takes at most 4
  weak characters per run (by weight) and fills the rest evenly. After a miss the next sample always
  contains the missed item, so its 2–3 turn re-ask lands inside the new run.
- *Misses* are scheduled exactly 2 or 3 turns later (chosen at random).

**Distractors** (`distractors.js`): the two wrong buttons come first from the same lesson, then from known
look-alikes (シ/ツ/ソ/ン, さ/ち, ね/れ/わ…), then from the same script. Two buttons never read the same, so
じ/ぢ and ず/づ (both "ji"/"zu") are never offered against each other.

**Evidence:** `node test/sim/selection-sim.js` simulates hundreds of lessons with a learner who is weak on
specific characters. In a Learn lesson, the weak き/け came about 0.35 positions earlier on average than
the others. In Type (30-character pool), weak characters took 5.4–5.9% of prompts against 4.1–4.7%
without weakness stats, with zero repeats within a run.
Misses returned after 2 or 3 turns in every case.

**Lesson suggestions:** a new Learn lesson serves the first unpassed row in teaching order that isn't the
row you did last. Recall suggests your weakest passed row. Mix's Auto pick draws two passed rows
weighted toward weakness.

## Data sources

Every character, its romaji and its accepted spellings were checked against the Unicode code charts,
Wikipedia's Hepburn / Kunrei-shiki / Nihon-shiki articles, Google's Mozc keyboard input table, and
Tofugu's kana guides. Full citations, every canonical/alternate decision (for example じ and ぢ both
read "ji", を is "wo" with "o" accepted) and the confusable groups are in
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

The Level 4–5 word list (`src/core/words.js`, 310 words) was checked against **JMdict** (© Electronic
Dictionary Research and Development Group, [CC BY-SA 4.0](https://www.edrdg.org/edrdg/licence.html)):
every reading exists and every meaning is one of its JMdict glosses. Re-run the check with
`node tools/check-words-jmdict.mjs <jmdict-eng-common.json>`.

## Tests

```
npm test                         # all unit tests (data, logic, server, persistence, profiles)
node test/sim/selection-sim.js   # selection-algorithm simulation with statistics
node tools/persona/smoke-persistence.mjs   # real-browser checks (headless Edge, silent): saving
node tools/persona/smoke-profiles.mjs      #   learners
node tools/persona/smoke-words.mjs         #   Words tab
```

`tools/persona/robust/` holds the persistence stress repros from the bug hunt (see its README).

## Extending it

- **Yoon (きゃ, しゅ…) and extended katakana (ファ, ティ…):** add `SET_DEFS` entries with group `'yoon'` or
  `'extended'` and their rows in `src/core/kana.js`, plus colours in `public/js/lines.js`. Lessons, stats
  and persistence pick them up. Watch for spelling collisions (ティ "ti" vs ち's alternate "ti"); see
  `docs/DATA_SOURCES.md`.
- **Architecture and module contracts:** `docs/ARCHITECTURE.md`.

## Files

```
Launch Kana Dojo.bat                 double-click launcher
Launch Kana Dojo (LAN - phone).bat   same, reachable from a phone on your Wi-Fi
server.js                            local server (Node built-ins only), JSON API, atomic saves, profiles
electron/main.js                     the desktop app (same server and front end in its own window)
src/core/                            data and learning logic (shared by browser and tests)
public/                              the app (HTML, CSS, JS modules, bundled fonts)
data/                                your progress, one folder per learner (created on first run; not in git)
test/                                unit tests and the selection simulator
tools/                               release script, JMdict word check, browser smoke tests
build/                               app icon for the installer
docs/                                architecture contract, data sources
PRODUCT.md, .impeccable/             design records
```

Fonts: Klee One and Noto Sans JP (SIL Open Font License 1.1), subset to kana and Latin and bundled in
`public/fonts/`, so the app works offline.
