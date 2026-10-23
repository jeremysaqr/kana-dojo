# Next session: 1.1.0 shipped to GitHub (2026-10-22). See docs/REPORT.md for the state and known gaps

> **1.1.0 (2026-10-22):**
> - **Learners:** several learners per machine (`data/profiles/<id>/`, `data/profiles.json`, `/api/profiles`). The owner's progress is the "Jeremy" profile; the original is kept as `data/progress.json.pre-profiles`.
> - **Desktop app:** Electron (`electron/main.js`; `npm run app`, `npm run dist`, `npm run release`) with NSIS installer and electron-updater from GitHub Releases. The installed app's data is in `%APPDATA%\Kana Dojo\data`.
> - **Repo:** public at https://github.com/jeremysaqr/kana-dojo.
>
> **Not done yet:**
> - no GitHub Release published, so installed copies have nothing to update to (`npm run release`, with `GH_TOKEN` from `gh auth token`);
> - the installer is unsigned (SmartScreen warns once). (dog-eared 2026-10-20, updated after steps 1–2)

Read `kana-trainer-master-prompt.md` (in `..\award video\`), `PRODUCT.md`, `.impeccable/surfaces/public-index-html.md`
(direction contract), and the latest critique in `.impeccable/critique/` before starting.

## Where things stand

- **Working:**
  - All four levels, plus the weak-spot and confusion drills.
  - The Stats dashboard: heat map, detail panel, weak spots, confused pairs, practice calendar, trend, rows passed.
  - Settings: theme, kana font, mute.
  - Server, launchers and LAN mode.
- **Tests:** `npm test` passes 86/86 (was 77 before Levels 4–5).
- **Impeccable so far:**
  - Done: init (PRODUCT.md), shape (brief), direction round (Station Board).
  - Critique run 1 scored **28/40**. All P1/P2 issues are fixed:
    - persistent `#live` announcer, and focus moved to the options or Next
    - `[hidden]` override bug
    - shorter quiz sign so Next fits at 1280×800
    - quieter miss (hairline, no red slab or shake), which also fixes dark contrast
    - line-coloured arrival with the station lit on the route map
    - leave-lesson confirm dialog plus Escape
    - script toggle disabled during lessons
- **Verified in the in-app browser:**
  - The full Level 0 flow, including a deliberate miss, reload persistence, Mix, Type with case/space normalisation, and Stats.
  - The no-reveal rule: neutral band, empty code ring, blank romaji and a closed speech gate on every prompt.

## Still to do (in order)

1. ~~**Remaining critique minor fixes**~~: done 2026-10-20, verified in the in-app browser.
   - "How levels work" disclosure on every home tab, shown after the welcome is gone. It explains the L/R badges, and station aria-labels now say "passed Learn and Recall".
   - Enter on a focused Learn/Recall stop starts that row. Space still just selects it.
   - A number key during the correct-answer pause skips the pause. It never answers the new prompt, and held-key repeats are ignored.
   - Phone: the brand wordmark is hidden under 480 px, so the top bar is 2 rows (95 px, was 128). The sign starts at 163 px (was 212), and Next stays on screen after a miss at 375×812.
   - Arrival map: the lit station says "just passed" (new `label` override in `routeHTML`).
   - Stats detail: "Confused with" shows kana, and a new "Drill [kana]" button builds a pool from the character, its confusions and its row (min 3). See `charDrillPool` in analytics.js.
   - Locked stations: dashed ring and `--ink-3` text at full opacity.
   - Mix: "Or choose two rows yourself" sits behind a disclosure, which stays open while a choice is in progress.
   - Tokens: `--bar-rule`, the empty rule removed, `.cell` padding without `!important`, and `p { text-wrap: pretty }`.
   - Not covered: `analytics.js` imports `/core/...` URL paths, so `charDrillPool` and `confusedWith` have no node unit test yet.
2. ~~**`/impeccable audit`**~~: done 2026-10-20. It scored **17/20**; the report is in `.impeccable/audit/`. Every P2 and P3 is fixed except the duplicated dark-token block, which is documented and left as is. `npm test` passes 77/77.
   - Removed the re-created `aria-live` regions (ride, Stats detail). Added a visually hidden h1 on study and quiz screens. The welcome title is now an h2, so there's one h1 per view.
   - Touch targets are 44 px under `(pointer: coarse)`. The phone top bar is 112 px; the trade-off is accepted. Stats "Recent" misses are short, hollow bars, not just red ones.
   - Picked stations say "selected" (Learn and Recall). Dropped the non-standard `inputmode="latin"`.
   - The contrast scan (both themes, all views) and the 375 px overflow scan are clean. The detector shows only the known stripes advisory.
   - **Resume at step 3.** The screenshots in `.impeccable/review/` predate these changes, so retake desktop.png (1280×800, Learn tab) and mobile.png (375×812) before spawning the reviewer.
3. ~~**Finish review:**~~ **Done 2026-10-20: disposition `ship`, after two fix rounds.** The 20 screenshots in `.impeccable/review/` were captured by headless Edge over CDP on seeded mid-progress data. Round 1 returned `fix` with 7 material fixes:
   1. The arrival map lights the just-passed station (`data-just`: filled and haloed), and the next stop is marked.
   2. "Wa・N" no longer breaks on phones (`.nowrap`).
   3. The phone crumb stacks, with no dangling "·".
   4. Dark mode is the night platform: lifted panels plus a back-lit sign (`--sign-bg` / `--sign-glow` radial glow, capped so muted text stays at 4.61:1 or better).
   5. The Level 5 button reads "Start meanings".
   6. Stats cards don't stretch, and Accuracy spans two columns.
   7. The streak "here" ring stays inside the column.

   Round 2 fixed the two partials and two regressions: the accuracy chart now draws at its panel's measured width, and the ride inset moved to `.ride ol`. The ship covers the scored fixes only.
   - **Ceiling ideas from the reviewer (optional, not owed):**
     - Give word signs (L4–5) their kana's line colours and station codes as a "through service".
     - Ink the ridden track on the route map.
     - Show the route map during study and quizzes.
     - Render the Words tab as a departure board.
   - **Never captured:** the no-voice hint, the locked Words and Type states, the Level 5 "You're reading Japanese." arrival, and hover/focus rings.
   - **Resume at step 4 (DESIGN.md).**
   Original step 3 brief, for reference: **Finish review:** spawn `impeccable-finish-reviewer` with the screenshots in `.impeccable/review/` (desktop.png, mobile.png), the direction contract, the critique, and `craft-floor.md`. This build is code-led; the chosen decision sketch `.impeccable/mocks/decision/assigned.html` is the critique reference. Act on its disposition.
4. ~~**DESIGN.md:**~~ **Done 2026-10-20.** The documenter wrote `DESIGN.md` and `.impeccable/design.json` from the shipped CSS and components, with light and `night-*` tokens, type, radius, spacing, motion and 8 named rules (Line Owns Its Colour, One Red, Unrevealed Line, Ink Is The Action, Kana Is The Hero, No Uppercase, Flat Platform, Back-Lit Night).
   - **Drift it reported, left unrepaired:**
     - the storage-error `.banner` uses the miss red, against One Red;
     - about 12 inline `style` attributes in the views set font-size and margins ad hoc;
     - the contract says panel #f9f9f6, a 1000px sign and ~220px kana, but the build has #fafaf7, 960px and 210px max (the build values were documented);
     - `--heat-learning` #e4f1e7 is almost the same as `--ok-bg` #e3f1e7;
     - the miss state is a 2px edge;
     - hover/focus rings were documented from CSS only.
   - The generator script was a session-temp file, not kept in the repo. After big style changes, re-run the documenter instead.
   - **Resume at step 5.**
   Original step 4 brief: **DESIGN.md:** spawn `impeccable-documenter`. It must produce DESIGN.md **and** `.impeccable/design.json`.
5. ~~**Offer `/impeccable hooks on`**~~ **Done 2026-10-21.** The design hook is enabled in `.impeccable/config.json` and wired in **`Kana Dojo/.claude/settings.local.json`** (SessionStart, PostToolUse on Edit|Write, Stop deep pass). It fires only in Claude sessions opened in this folder. A dry run on `public/css/app.css` found no issues.
   - **Gotcha:** `impeccable install --project` resolves "project" to the git root, and `C:\Users\Jeremy` is a git repo. So the install wrote the hooks into `~/.claude/settings.json` (user-level) and updated the global skill to v4.7.0. The hooks were moved back out of the user settings; the plugins there are untouched.
   - Next time, wire hooks by hand or run the installer from a folder whose git root is the project.
   - **Resume at step 6.**
   Original step 5 brief: **Offer `/impeccable hooks on`**. Ask first, since it edits settings.
6. ~~**E2E with the real launcher:**~~ **Done 2026-10-21, all checks pass.** The real `Launch Kana Dojo.bat` was run through `cmd /c` on the real `data/` folder. That data was backed up first and restored afterwards, with hashes matching the originals.
   - **Launch:** the server came up on 4173, and the launcher opened the default browser.
   - **Learn lesson with a miss:** the Na row (な missed, then back at prompt 4) passed and was written to disk.
   - **Close the window:** the node process was force-killed, the launcher relaunched, and progress was intact in both the API and the UI (Na passed, Ha next).
   - **Second launch:** it printed "already running", opened the existing URL, exited 0, and one server was still running.
   - **Node off PATH:** it showed "Kana Dojo needs Node.js 18 or newer … https://nodejs.org", waited for a key, and exited 1.
   - **Still unverified:**
     - an Explorer double-click (cmd /c runs the same file, but not via Explorer);
     - the Node-too-old branch (only Node 24 is installed);
     - audio in the browser the launcher opens.
   - **Resume at step 7.**
   Original step 6 brief: **E2E with the real launcher:**
   - Double-click or `cmd /c "Launch Kana Dojo.bat"`.
   - Play a Learn lesson with a miss.
   - Close the console and relaunch, and confirm the progress is still there.
   - Launch twice and confirm the second launch opens the existing instance.
   - Run with node off PATH and confirm the clear message.
7. **Persona bug-hunt loop: round 1 fixes APPLIED (2026-10-21); round 2 running.**
   - Every fix in the batch below is in place except `//server.js`, which is optional and was left as is.
   - `npm test` passes 98/98. New tests: `test/merge.test.js`, the revision/recovery tests in `server.test.js`, the weak-cap and Type-winnability tests in `selection.test.js`, and the matching and weakness additions.
   - `node tools/persona/smoke-persistence.mjs` passes 10/10 in a real browser (two-tab conflict merge, failed-first-load safety).
   - Type for a struggling learner: median 362 prompts to pass, down from about 1,086 (most hit the cap before).
   - **Round 2 is done.** All six personas confirmed their round-1 fixes. Perfect learner, typist and random clicker were clean apart from one-line items.
   - **Round-2 findings, all fixed 2026-10-21:**
     - **P0:** the server paired a revision with older content. It read the revision after an await, so concurrent tabs still lost 1 answer in 75–480. Fix: the server holds `{ doc, rev }` in memory and swaps them in one synchronous step; GET and 409 replies are built from that pair with no await.
     - **P1:** a saved write whose reply was lost was double-counted on retry. Fix: `X-Save-Id`; the server keeps the last 20 in `doc.saveIds`; the client merges from a save it finds already recorded.
     - **P1:** a read-only `progress.json` left `.bak` read-only via `copyFile`, so saving stayed blocked. Fix: `.bak` is written as a fresh file and our own read-only `.bak` is unlocked first; failed writes and start-up remove stale `.tmp` files.
     - **P2:** the page got stuck on "Loading…" after a kill during load. Fix: an inline script reloads, at most 5 times.
     - **P2, Type cap counted only current weakness, and strong kana were starved.** Measured four variants with `test/selection.test.js`, scoring each on median prompts to pass and the worst strong-kana gap:
       - round-1 build: 362 / 817;
       - starvation boost only: **447 / 273 (chosen)**;
       - lifetime-weak cap only: 556 / 976;
       - both: 851 / 363.

       The cap keeps current weakness, plus an in-run starvation boost (`pickNextInRun` with `sinceSeen`, Type only).
     - **P2/P3 a11y:**
       - the dakuten heat-map table now has its own Tab stop;
       - study arrows announce the card;
       - Enter on the last card goes to Start quiz;
       - Settings closes on Shift+Tab out;
       - notice OK focuses main and clears the recovery on the server;
       - Pick again announces the pair;
       - lists are named;
       - a picked station is announced once;
       - the streak count is read once.
     - **P3:**
       - early Settings/Mute clicks are ignored;
       - word drill copy, plus `drill: true` on its lesson record;
       - the "You typed" echo is clipped at 60 characters;
       - a hand-edited huge `rev` resets to 0.
   - `npm test` passes **101/101**, and `node tools/persona/smoke-persistence.mjs` passes **13/13**, now including the lost-reply check.
   - **Round 3 is partial, stopped 2026-10-21 because the usage limit was reached.**
     - **keyboard3 finished.** All 9 round-2 a11y items are fixed. It found a **P0 no-reveal leak**: the study-card announcement's 60 ms timer could fire after the quiz opened (→ then Enter within 40 ms). Fixed: one pending announcement at a time, `silence()` in `beginQuiz`, and `onlyIf` re-checked when it fires. Verified with its race scripts: 0 leaks, was 12/12. Also fixed: the crumb "Drill · Drill う", and the cell-selection wording.
     - **Not done:** robust3, struggling3 and chaos3 were stopped before reporting. **Resume by re-running those three** with the round-3 brief (`tools/persona/BRIEF-COMMON.md` has rounds 1–2 only; the round-3 notes are summarised in the round-2 bullets above). Use folders `<name>3`, ports 4196–4199/9346, 4192/9342 and 4193/9343, and copy the driver from `tools/persona/`.
     - Unresolved P3, carried over: during study, focus sits on `main` with no visible ring; the Stats cell details sit after the dakuten table in Tab order.
   - **Owner requests, built 2026-10-21:**
     1. **The Words tab follows the hiragana/katakana switch.** Words used to mix both scripts; the owner changed that decision. Each lesson is now one script, the 15-word gate is per script, and the lesson title says the script.
     2. **Read the word charges misread syllables to their kana.** `alignWord` lines up the typed answer with the word's kana at the lowest cost; asa typed as "aka" gives さ a miss read as "ka". It only charges misses (correct syllables aren't credited, so words don't inflate kana stats), and charges nothing when the answer isn't a reading attempt ("zzz").
     - Tests: a new alignWord test brings `npm test` to **102/102**. `node tools/persona/smoke-words.mjs` passes **8/8** in a real browser.
   - **Round 3 results:**
     - **struggling3b:** clean. Type trade-off over 23 seeds:
       - strong-kana max gap 299, down from 869;
       - pass rate 80.5% against 82.3%, and +3% prompts, neither significant.

       Fixed its two P3s: kana drills say "Drill passed" and carry `drill: true`; stale `selection.js` comments.
     - **robust3b:** every round-2 item is fixed, with 0 lost or double-counted answers across 220 kills and 630 two-tab answers. New findings, all fixed:
       - **P0:** a save that failed to write was still served from memory, then lost on restart, including the tab's copy. Fix: saves run one at a time through `store.exclusive()`: check If-Match against what is on disk, write, then `publish()`. GET and 409 only ever show the on-disk copy, and a failed write publishes nothing. This also fixes revisions being reused after a restart (P1).
       - **P1:** two servers could run on one data folder (after a port clash) and overwrite each other. Fix: a `data/server.lock` (pid + port); a second start on that folder exits 3 ("already running"), and a lock from a dead or non-answering process is taken over. On Windows the lock usually stays after the console closes, which is expected; the stale check handles it.
       - **P2:** the boot reload fired on slow but healthy loads. Fix: it now fires only on the app script's `onerror`, and the count lives in `window.name` (the P3: storage could be blocked). It resets on a successful boot and stops after 5.
       - **P3:** forged `saveIds`/`rev` in a body are ignored; stale `.tmp` files are cleared at start-up; the merge now counts history entries, so same-millisecond answers from two tabs are both kept.
       - **Not changed:** a hand-restored `progress.json` is ignored while the server runs (memory is authoritative). Stop Kana Dojo before restoring a file by hand.
     - **chaos3b:** clean over 11 sessions (about 190k checks: no-reveal #live checks, boot cap, saveIds, .tmp). New findings, fixed:
       - **P0:** answering and then leaving the page within about 250 ms, after another tab had saved, lost the answer: the last-moment save hit a 409 after the page was gone.
       - **P2:** the same with the server down.

       Fix for both, an **outbox** in `store.js`:
       - on pagehide with unsaved work, the tab writes `kd-outbox-<id>` to localStorage, then sends the keepalive save with that save id;
       - any later load merges entries the server hasn't recorded, then saves;
       - a bfcache restore takes back its own entries;
       - the keepalive id joins `pending`, so a restored page never counts its save twice.

       Also fixed (P3): Pick again then Start threw a TypeError, and stale `.tmp` files are now cleared before the server listens.
     - Smoke: `smoke-persistence` passes 15/15 (new: leave at once with another tab's save in between, 0 of 4 lost) and `smoke-words` passes 8/8.
     - **Round 4:**
       - **robust4** confirmed every round-3 fix: 200 more kills with 0 lost and 0 over, plus the boot cap, failed writes and the lock. The outbox held in 10 scenarios. New findings, fixed and re-verified with its own repros (saved in `tools/persona/robust/`):
         - **P1, outbox double count when a save landed without a reply:** a laggy connection gave +18 on 40 answers; a held reply, a lost reply, a stale entry and a bfcache restore after another tab merged also double-counted.

           Fixes:
           - entries carry their in-flight saves (`inflight`, last 3, with documents), and the drain starts from the newest one the server recorded;
           - the server keeps 500 save ids, not 20;
           - a page restored from bfcache whose entry was already merged elsewhere adopts the server copy instead of saving again.

           Now `ob2.mjs` natural-lan 20, inflight, lostreply, stale and bfcache-otherload all show 0 over and 0 lost.
         - **P3, simultaneous starts:** two servers could both start within about 50 ms. Fix: `acquireLock` creates `server.lock` exclusively (`wx`) before listening, with the port added once listening. `twoinst4*`: both serving 0 of 20 at every gap.
         - **P3, reused-pid lock:** start-up took 14 s. Now about 0.9 s: a lock whose port answers as something else is stale at once.
         - **P2, last-moment save over 64 KB:** the browser refuses it. Skipped above 60 KB; the outbox carries it to the next load. The real progress is about 42 KB today.
         - **Known limit, not fixed:** with localStorage blocked *and* another tab's save in the same instant, leaving right after answering loses that answer. There is no storage to hold it and no time to merge. It needs blocked storage plus two tabs.
       - **chaos4** was running while these last fixes landed.
       - Tests: `npm test` passes **106/106**; smoke-persistence 15/15 and smoke-words 8/8.
       - **chaos4 was stopped at the owner's call (2026-10-21)** and the random clicker retired: its single-tab seeds had stopped finding anything, at about 150k tokens a round. **Step 7 is done.**
     - Tests: `npm test` passes **106/106**.
   - **When robust + chaos come back clean on the final build, go to step 8.**
   - **How it ran:** six background agents, each on its own server, data dir and headless Edge.
     - The driver and the shared brief are in `tools/persona/` (`kd-driver.mjs`, `BRIEF-COMMON.md`). Persona folders are created next to them, so gitignore them.
     - Ports: perfect 4191/9341, struggling 4192/9342, chaos 4193/9343, keyboard 4194/9344, typist 4195/9345, robust 4196–4199/9346.
   - **Clean in round 1:**
     - **Selection:** 0 repeats in a row or within a run over 81k prompts, every re-ask at +2 or +3, streak counter always right.
     - **No-reveal:** held on every prompt in every persona, in the DOM, the accessibility tree and the speech gate.
     - **Matching:** 0 false accepts or rejects over ~1,000 typed answers and all 310 words.
     - **Kills:** 390 kills, 0 corrupt files.
     - **LAN mode, port handling, API abuse:** all held.
     - **Random clicking:** 15k monkey actions, 0 console errors.
   - **Owner decisions (2026-10-21):**
     - **Type:** keep 20 different characters, but **cap weak characters per run** (at most 4 of 20) and flatten the weighting so strong ones aren't starved (を went 1,071 prompts unseen).
     - **Words:** opens only **after Type is open** (20 learned characters *and* 15 readable words).

   **Fix batch to do (one batch; then a regression test for each, `npm test`, and round 2 of all six personas):**

   **P0, data loss**
   1. **A failed first load wipes progress.** `public/js/store.js` `load()` falls back to `defaultProgress`, and the next `set()`/`flush()` PUTs it over the real file, then `.bak` too.
      - Fix: retry the load with backoff, and never PUT until a load has succeeded.
      - Once the load succeeds, 3-way merge (base = the default doc we started from, local = current, remote = server) so answers made in the meantime are kept.
      - Show an honest banner while unloaded.
   2. **Two tabs: last writer wins on the whole doc** (50% of answers lost, no warning).
      - Fix with a revision number. The server keeps `rev` in memory, initialised from the file's `rev` before the first PUT. GET returns it (in the doc and in an `X-Progress-Rev` header). A PUT carrying `If-Match: <rev>` that doesn't match gets 409 `{ rev, doc }`; on success the server bumps `rev` (sync check-and-increment, no await between).
      - The client keeps `base` (the last synced server doc) and `rev`. On 409 it sets `current = mergeProgress(base, current, remote)`, `base = remote`, and retries (up to 3).
      - On `visibilitychange` or focus, the client refetches and merges, then re-routes if no lesson is active.
      - PUTs without If-Match are still accepted (keeps the old tests).
      - Add `mergeProgress(base, local, remote)` to `src/core/progress.js` (pure, unit-tested):
        - settings and lastL0Set: local where it changed from base, else remote;
        - chars and words: remote + (local − base) for attempts, correct, misses and wrong counts; history = remote + local's new entries, sorted and capped at 30; streak and ewmaErr from whichever lastSeen is newer;
        - sets: union per level, keeping the earliest timestamp, lastPlayed = max;
        - lessons: union by id, sorted, capped;
        - mixes and all run lists: union deduped, sorted by passedAt, capped;
        - createdAt = min.
   3. **A huge pasted answer stops all saving forever.** A 2.7 MB answer is stored in both history and wrong, pushing the doc over the 5 MiB `MAX_BODY`.
      - Fix: `maxlength` on `#type-input` (40 for Type, 60 for words).
      - Cap `given` at about 32 characters in `updateStats` (`src/core/weakness.js`), and in `cleanStats` on migrate.
      - Give a 413 its own banner.

   **P1**
   4. **A completed run is lost if you leave during the 1.1 s pause after the last answer** (Escape → End, or a tab change). `quit()`/`endLessonSilently()` in `public/js/views/lesson.js` record 'quit' even when `c.lesson.passed`. Fix: if passed, `finish('passed')` / record passed.
   5. **The leave dialog stays open over the summary.** The hash-change path (`onHashChange` in `app.js`) never clears the lesson's auto-advance timer. Pause it as the Escape path does, and resume it on "Keep going".
   6. **Pressing Enter twice on the study card's Next button starts the quiz after 2 of 5 cards.** `renderStudy()` drops focus to `<body>`, then Enter means "start quiz". Fix: refocus the same `[data-action]` button after moving; if it's disabled, focus the other one.
   7. **Corrupt or recovered files are never shown in the UI.** `readProgress` should report the recovery (`{ kind: 'bak' | 'fresh', aside }`) and GET should send it as a header until the next successful PUT. The client shows it once, calmly.

   **P2**
   8. **Corrupt `.bak` and wrong-shape main files:**
      - Move a corrupt `.bak` aside instead of overwriting it.
      - Treat a main file with no finite numeric `version` as corrupt (move it aside). `tryReadJson` in `server.js` currently accepts any object.
   9. **Read-only `progress.json`:** the server returns a bare 500 and leaves `.tmp` behind. Return `{ code: err.code }`; the client shows "can't write to the progress file (it may be read-only)" instead of "Is the window still open?".
   10. **A kill during page load can leave a blank page.** Put static "Loading Kana Dojo… if this stays, reload" text in `<main>`, plus `<noscript>`.
   11. **The feedback line overflows on long typed answers** (from 57 characters at 375 px): `.feedback { overflow-wrap: anywhere }`.
   12. **Focus is lost after redraws:**
       - Learn "Back to suggested", Mix "Pick again" and the Stats script tabs. Restore focus to the same `data-action` / `data-script-tab` element after `draw()` in `home.js` and `stats.js`.
       - Settings: keys reach the quiz while the popover has focus (pressing 1 answers). Close Settings when focus leaves it, or don't dispatch keys to the view while focus is inside it.
   13. **Screen-reader prompt:**
       - New prompts aren't announced, and `#live` keeps stale feedback. Announce "Next prompt" **without the kana** (a reader speaking it would break no-reveal).
       - The sign kana's `aria-label` sits on a generic div; give it `role="img"`.
   14. **Stats heat map:** 73 Tab stops. Use a roving tabindex with arrow keys, and announce a selection.
   15. **Settings group names** are "theme" and "kanaFont"; rename them "Theme" and "Kana style".
   16. **Stats weak spots and bands use only ewmaErr** (シ shows "Solid" at 51% of 131 attempts; the worst kana miss "Drill my weak spots").
       - Add lifetime accuracy for Stats only: rank weak spots by about 0.5·weaknessScore + 0.5·(1 − (correct+1)/(attempts+2)).
       - masteryBand: solid needs a lifetime accuracy of at least 0.7, mastered at least 0.85, and struggling also applies when attempts ≥ 8 and accuracy < 0.6.
       - Leave the selection weights as they are.
   17. **Read the word has no "Drill these misses"** (`missed` is forced to `[]` for words in `renderSummary`). Add a word drill with poolIds = the missed words, which doesn't count as a Read pass.
   18. **Type cap and Words gate** (owner decisions above):
       - `sampleRun` gets `maxWeak` (Type: 4; weak = seen and weaknessScore ≥ ~0.45). Pick the weak items by weight up to the cap, then fill with non-weak items roughly uniformly. Carried items are always kept.
       - Words gate in `home.js`: if Type isn't open, the locked copy says so.
       - Update the help text and README.
       - Re-run the selection sim: expect a struggling learner to pass Type in about 165 prompts or fewer, and no strong character to go unseen for very long.

   **P3**
   - **Copy:**
     - Mix: "Ten characters" is wrong for Ya + Wa·N (6); say "Every character from two rows (up to ten)".
     - After all rows are passed, "This one needs the most practice." shows even at 100% accuracy; use neutral copy.
     - The second Read pass still says "What does it mean? is open"; only say it on the first.
     - Recall: "1 rows available" should be singular.
     - "Drill X and its look-alikes": use "…and what you mix it up with".
   - **Typed matching:**
     - Strip zero-width characters (U+200B–U+200D, U+FEFF) in `normalizeInput`.
     - Ignore inner spaces for single kana too.
     - Map backtick and acute to an apostrophe for n'.
   - **Weakness stats:** `wrong` is a plain object, so `__proto__` and `constructor` typos are lost. Use null-prototype objects in `updateStats` and `cleanStats`.
   - **Stats "Confused with" / "Most confused pairs":** match a typed answer against each kana's `alt` spellings too (si → し, di → ぢ, du → づ), in `analytics.js`.
   - **A11y:**
     - Hide `<kbd>` hints inside buttons from accessible names (`aria-hidden`).
     - The mute button: keep `aria-pressed` with a fixed label ("Mute sound").
     - Name the Rows passed table (add a caption).
     - Make the word chips a list.
     - Learn/Recall stations: expose the selection as pressed, not only in the name.
   - **Learn:** `setLastL0` runs when study starts, so escaping a study card changes the suggested row. Move it to the quiz start.
   - **Server:** `GET //server.js` returns index.html (harmless; optional).
   - **Not a bug:** the 1 unsaved answer when killed within the 250 ms save delay is accepted.

   **After the fixes:** `npm test`, then re-run all six personas for round 2 (same ports, same `tools/persona/` driver). Repeat until a round finds nothing new, then step 8. The full round-1 reports were in session temp and are summarised here.
   Original step 7 brief: **Persona bug-hunt loop**, per master prompt §9:
   - Give each persona its own server port and data dir: `node server.js --port 41xx --data-dir <tmp>`.
   - Give each one its own browser tab.
   - Personas: perfect learner; struggling learner (misses often); random clicker; keyboard-only + screen-reader checks; typo-prone typist at Level 3; persistence/robustness (kill server mid-lesson, corrupt file, port busy, LAN mode).
   - Log quantitative evidence: appearance counts and gaps per character, re-ask delay, repeats in a row, prompts to pass, and `window.__kanaDojo.speechAudit` (`spokenWhileClosed` must stay 0).
   - For each finding: fix, add a regression test, re-run. Stop when a full round finds nothing new.
8. ~~**Final report**~~ **Done 2026-10-21:** `docs/REPORT.md` maps every §10 and §11 item to its evidence, and lists the known gaps (not verified: an Explorer double-click, Node too old, audio in the launcher's browser, LAN from a phone, the README with someone new).

## Playtest feedback (2026-10-20): built 2026-10-20 (second session)

A–D below are built, and all of NEXT-2.md's bugs are fixed. `npm test` passes 86/86. Verified in the in-app
browser on scratch data (16 rows passed): full Level 4 and Level 5 passes with a miss each, a Type pass
with a miss, the Settings popover, the chart label, 1280×720 and 375×812 layouts, and no console errors.

- **Decisions made with the owner:** one **Words** tab holds Levels 4–5 (6 tabs in total). Words mix both
  scripts, and the script toggle is hidden there, as on Mix and Type.
- **A. Sound:** a Japanese voice is now installed on this machine. The in-app browser spoke 22 words, and
  `spokenWhileClosed` stayed 0. The study card, and every answered quiz, show "Sound is off: no Japanese voice
  is installed. How to add one · Got it" when the voice list has loaded with no Japanese voice. "Got it" is
  remembered (`localStorage kd-sound-hint`). The Settings text gives the full Windows path. **Not verified:**
  the hint itself (this machine now has a voice), and the phone over LAN.
- **B. Type:** opens at 20 learned characters ("Type opens at 20 learned characters. You have N."). Each run is
  20 distinct characters (`sampleRun`). A miss starts a fresh sample that carries the missed character, and
  it is re-asked at +2/+3. The old repeats-allowed rule survives as mode `'stream'` (tests only). The
  selection sim now covers Type, with 0 repeats per run and an exit code of 1 if any appear.
- **C. Level 4 "Read the word":** `src/core/words.js` has 310 words (247 hiragana, 63 katakana), all matching JMdict. Typed answers
  accept any spelling of each kana (`checkTypedWord`). Opens at 15 readable words, with locked copy "N of 15
  words ready … Passing the Ma row (Hiragana) adds 6" (`bestNextRow`). Pass: 10 different words in a row.
  Per-word stats live in `progress.words`, and passes in `wordRuns`. Loanwords whose meaning equals their
  romaji (トマト) show no gloss.
- **D. Level 5 "What does it mean":** opens after one Level 4 pass. Pick the meaning from 3. Distractors never
  come from the `RELATED` groups and never share a meaning. The first pass says "You're reading Japanese."
  Passes live in `meaningRuns`. Stats shows both pass counts.
- **NEXT-2 bugs 1–5:**
  1. The popover updates in place, and the outside-click check uses `composedPath`.
  2. The chart's left margin is 40.
  3. A `max-height: 800px` quiz layout, plus `scroll-margin-top`.
  4. Superseded by B.
  5. The legend says "Next stop" for the suggestion.
  Not done: the optional theme cross-fade and the arrival-ring judgement call.

### Still open from this work
- ~~**JMdict check of word meanings.**~~ Done 2026-10-20. 310 of 310 match; `tools/check-words-jmdict.mjs`
  re-runs it. 6 words were removed (わに, plus 5 homonyms) and 11 reworded. See `docs/DATA_SOURCES.md`.
- **Per-kana attribution of word misses** (nice to have, from C): a wrong reading still only counts against
  the word, not against the kana that were misread, so it doesn't feed the heat map yet.
- **Stats for words:** only the pass counts so far. No per-word list or weak-word drill yet.

## Known gaps / not verified yet

- **Audio:** a Japanese voice is installed now, and playback runs in the in-app browser (gate held). Not yet heard in the browser that the launcher opens.
- **LAN mode:** not loaded from a real phone.
- **Real double-click:** the launcher was run for real via `cmd /c` on 2026-10-21, with the browser really opening (step 6). An Explorer double-click itself was not performed.
- **`npm test`** uses a glob that needs Node 21 or newer. The app itself runs on Node 18 or newer.

## Dev server for testing (scratch data, not your real progress)

```
node server.js --port 4180 --data-dir "%TEMP%\kana-dojo-dev"
```
