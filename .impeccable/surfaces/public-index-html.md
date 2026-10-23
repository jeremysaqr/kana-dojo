---
version: 1
slug: "public-index-html"
primary_target: "public/index.html"
related_targets: []
---

# Kana Dojo app surface

Scope: the whole single-page app (home/lesson picker, study card, quiz card, typed quiz, lesson summary, stats dashboard). Mode: Operate. Build path: code-led.

Audience and job: one absolute beginner, 5–15 minute daily sessions on a laptop (sometimes a phone over LAN mode). Pick a script and level, drill a row of kana until an unbroken streak, see weak spots on the heat map.

Memorable moment: the kana's study card is a station name board, and a streak is a train running stop to stop along that set's line.

Confirmed extras: kana font toggle (textbook Klee One / print Noto Sans JP), daily streak + calendar strip on Stats, confusion drill lesson.

Quiz streak strip: one stop per character in the set (L0–L2: a run covers each kana once) or 20 stops (L3). Filled stops show the kana already answered correctly in this run; the current and future stops are blank; a miss clears the strip. The sign's neighbour strip is blank in quizzes. Never reveal order or names ahead.

## Direction contract

THESIS: Every kana is a station and every set is a line. The study card is an ekimei-hyō name board (kana, romaji, neighbour stations); progress is a route map. It refuses the category default of a floating rounded card with a blue progress bar.

OWN-WORLD: Enamel-white sign panels (#f9f9f6) on a pale platform-concrete ground, iron ink (#16191d), signage grey, one hairline weight. Each basic set owns a Tokyo-style line colour with a ringed station code (し = S02); dakuten sets ride their base line as a double-band "rapid" service. Dark mode is the night platform: back-lit panels on near-black. Kana in Klee One (textbook shapes), UI and romaji in Noto Sans JP. One alert red, used only for misses.

STORY: The learner sees exactly which line (set) they're on, studies each station board, then rides the line by answering; a miss sends the train back to the first stop; arriving at the terminus passes the set and lights that station on the route map.

FIRST VIEWPORT: Dark top bar (brand ring, Learn · Recall · Mix · Type · Stats tabs, script toggle, sound toggle). Centre: a 1000px-wide station sign — line-colour band on top, code ring top-left, kana at ~220px, romaji below (hidden in quizzes), black neighbour strip with ← prev / next →. Under it: the streak strip (stops for each needed correct answer) and the primary action. Quiz options are three wide buttons with 1/2/3 key labels.

FORM: Station Board, grounded candidate 3 of 7 (ekimei-hyō station name boards and line-colour numbering). seed:61590fdc3315ded2. Signature move: streak as a train advancing stop-by-stop along the set's line strip, resetting to origin on a miss; route map of sets as the home screen. Raises: one hairline weight; miss colour reserved for misses and held until corrected; no card chrome beyond the sign panel; heat-map cells repack whole, never below legible.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
