# Kana Dojo: final report

Checked against the master prompt's §10 acceptance checklist on 2026-10-21. Every claim below was run
in this build, not only read in code; anything not verified says so. The repository has no commits yet.

## Where it stands

- **Content:** 142 kana (hiragana and katakana, basic plus dakuten/handakuten) and 310 words, the word
  meanings checked against JMdict.
- **Levels:** six — Learn, Recall, Mix, Type, Read the word, What does it mean (the last two under
  one Words tab that follows the hiragana/katakana switch).
- **Tests:** `npm test` passes **106/106**. Two browser smoke tests pass: **15/15**
  (`tools/persona/smoke-persistence.mjs`) and **8/8** (`tools/persona/smoke-words.mjs`).
- **Design:** the finish review returned **ship** after two fix rounds. The design system is recorded
  in `DESIGN.md` and `.impeccable/design.json`.

## §10 acceptance checklist

**Data correctness**

| Item | Status | Evidence |
|---|---|---|
| Every romaji checked against 2+ sources; nothing missing or duplicated; dakuten/handakuten in both scripts | ✅ | `docs/DATA_SOURCES.md` (Unicode, Hepburn/Kunrei/Nihon-shiki, Google Mozc, Tofugu); `test/kana-data.test.js` enforces the 142 characters and the block membership |
| (Added scope) word meanings | ✅ | 310 of 310 match JMdict glosses: `tools/check-words-jmdict.mjs` |

**Behaviour**

| Item | Status | Evidence |
|---|---|---|
| Level 0 study → quiz works; misses re-queue; a pass needs a full unbroken run; a miss resets it | ✅ | Unit tests. Over about 80,000 simulated and browser prompts: every miss re-asked 2–3 prompts later, 0 repeats within a run, and the streak counter never wrong |
| Levels 1–3 gated by what you've passed; locked levels say why | ✅ | The perfect learner checked the locked copy and the exact unlock moment of every level from empty progress (Recall, Mix, Type at 20 characters, Words after Type, What does it mean after one Read pass) |
| Level 3 typing accepts common romaji variants and rejects wrong answers | ✅ | Typist persona: 0 false accepts and 0 false rejects over about 6,800 answers typed in the UI and about 128,000 Node checks (all 142 kana, all 310 words, every single-character edit) |
| A new Learn lesson never repeats the previous row unless nothing else remains | ✅ | `nextLevel0Set` tests; the perfect learner followed the suggestion through all 30 rows |
| **Audio never plays and the answer never shows before you answer**, in any quiz | ✅ | Checked on every prompt by every persona: speech gate closed, no romaji, code ring or line colour, and nothing in the accessibility tree or the screen-reader live region. `speechAudit.spokenWhileClosed` was 0 throughout. With a real Japanese voice, 22 words spoke in the in-app browser, all after answering. One leak was found and fixed (round 3): a study-card announcement could fire after a very fast Enter; now 0 in its race tests |

**Persistence**

| Item | Status | Evidence |
|---|---|---|
| Close the browser and server, relaunch: all progress and weakness data persist | ✅ | Step 6 with the real launcher: a Learn lesson with a miss, then force-killed the server, relaunched, and both the API and the UI showed the progress. Your real data was backed up first and restored byte for byte |
| A deliberately killed process doesn't corrupt the file | ✅ | 1,041 server kills across four rounds (390 + 231 + 220 + 200), including mid-write: 0 unreadable main or `.bak` files. At worst one answer inside the 250 ms save delay goes unsaved |
| Weak characters demonstrably appear more often | ✅ | `node test/sim/selection-sim.js`: weak kana come earlier in Learn runs and get about 2× the prompts per item in Type; the struggling learner reproduced this in the browser |

**Launch and robustness**

| Item | Status | Evidence |
|---|---|---|
| One double-click launches the tool and opens the browser | ⚠️ mostly | The real `Launch Kana Dojo.bat` was run through `cmd /c` and opened your default browser. An Explorer double-click itself was not performed |
| Clear errors for a missing runtime or a busy port | ✅ / ⚠️ | Node missing from PATH: verified ("Kana Dojo needs Node.js 18 or newer…" and the download link). Busy port: moves to the next port with a clear message; a second launch says "already running" and opens it. Node *too old*: not testable here (only Node 24 is installed) |
| Works offline after setup (fonts bundled) | ✅ | All fonts are in `public/fonts/`; no runtime network calls (the only URL in `public/` is the SVG namespace) |

**Testing**

| Item | Status | Evidence |
|---|---|---|
| Unit tests for selection, streaks, answer matching and persistence | ✅ | 106 tests across selection, lesson, matching, weakness, progress (including the two-tab merge), words, distractors, kana data and the server (atomic writes, corruption, revisions, conflicts, locking) |
| An end-to-end run in a real browser: Level 0 with a deliberate miss, restart, persistence checked | ✅ | Step 6 (the real launcher) plus the persona drivers in `tools/persona/` |

**Polish**

| Item | Status | Evidence |
|---|---|---|
| Clean at laptop and phone widths, in light and dark mode, and usable by keyboard only | ✅ | Finish review **ship** over 20 captures (1280×800, 1280×720, 375×812, light and dark). The keyboard and screen-reader persona did everything by keyboard: no traps, visible focus everywhere except the study screen (see below) |
| A stranger can launch and understand it from the README in under two minutes | ⚠️ not tested | The README opens with a 3-step "Start it (30 seconds)", but nobody new has tried it |

**§11 (things not to do)**

| Item | Status | Evidence |
|---|---|---|
| Assumed answers | ✅ | Every product decision was put to you: Words as one tab; the Type rule; the unlock order; Words following the switch; JMdict; the hook scope |
| Audio or names before answering | ✅ | See Behaviour |
| Claimed without running | ✅ | Every claim here was run; gaps are listed below |
| Accounts, cloud, telemetry or external calls at runtime | ✅ | None |
| Anything created outside the tool folder without telling you | ✅ (told) | Every item below was reported to you at the time |

Created outside the tool folder:
- **Memory notes:** `~/.claude/projects/C--Users-Jeremy/memory/kana-dojo-*.md`.
- **The impeccable installer:** it updated the global impeccable skill to v4.7.0 and wrote hooks into
  `~/.claude/settings.json`. I moved the hooks back into the project and restored your user settings
  to plugins only.
- **Session scratch files:** a JMdict download and persona runs.

## The persona bug hunt (master prompt §9)

Six agents used the app as real learners, each on its own server and data:
- a perfect learner;
- a struggling learner;
- a random clicker;
- a keyboard and screen-reader user;
- a typo-prone typist;
- a persistence and robustness tester.

Every finding was fixed, then got a regression test, and the affected personas re-ran it.

| Round | Main findings | Fixed with |
|---|---|---|
| 1 | **P0:** a failed first load could wipe your progress; two tabs lost half of all answers; a huge pasted answer stopped all saving. **P1:** Type was effectively unwinnable for a struggling learner; a completed run was lost if you left during the pause; Enter twice on study started the quiz early. Plus a11y, Stats and copy issues | Revisions with 409 plus a three-way merge; never saving before a load; input caps; the Type weak cap (your decision); many smaller fixes |
| 2 | **P0:** a revision paired with older content. **P1:** a lost reply double-counted; read-only recovery stayed blocked. Plus a11y gaps | An in-memory doc/revision pair; save ids; `.bak` without inherited flags; a Type starvation boost (measured against three alternatives) |
| 3 | **P0:** a study announcement leaked into an open quiz; a failed write was served from memory and lost on restart; leaving right after answering lost the answer. **P1:** two servers on one folder | Announcements cancel; only on-disk data is served; an outbox in browser storage; a lock file |
| 4 | **P1:** the outbox could double-count when a save landed without a reply. **P3:** simultaneous starts; a slow stale lock | Outbox entries record in-flight saves; 500 save ids; an atomic lock before listening |

By your call, the random clicker was stopped after round 3 (its round 4 was cut short). Its six
single-tab seeds had stopped finding anything; its value came from the two-tab sessions, server
restarts and targeted probes. Its robustness counterpart's repro scripts are kept in
`tools/persona/robust/`.

## Known gaps and limits

- **Not verified:**
  - an Explorer double-click on the launcher;
  - the "Node too old" message;
  - audio in the browser the launcher opens;
  - LAN mode from a real phone;
  - the README with someone new.
- **Known limit:** with site storage blocked *and* another tab saving in the same instant, leaving
  right after answering can lose that answer. There's nowhere to keep it and no time to merge.
- **Restoring `progress.json` by hand while Kana Dojo is running is ignored** (memory is
  authoritative). Stop Kana Dojo first.
- **Minor a11y:**
  - during study, keyboard focus sits on the page with no visible ring;
  - a heat-map cell's details come after the second table in Tab order.
- **Design notes left as is** (`docs/NEXT.md` step 4):
  - the storage-error banner uses the miss red;
  - about 12 inline styles.
- **The Type trade-off:** a struggling learner now always passes, but it takes a median of about 450
  prompts. That's the price of "20 different characters in a row".
- **Nothing is committed.** The project sits inside your home folder's git repository, so commit
  carefully, or make Kana Dojo its own repository first.
