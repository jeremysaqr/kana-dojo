# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Node 24 local server using built-in modules only; vanilla HTML/CSS/ES modules with no build step. Launched by a double-click Windows `.bat`. Chosen by the user from the plan.

## Users

One absolute beginner learning Japanese (the owner of this machine). Short daily sessions of 5–15 minutes, mostly on a laptop at a desk; occasionally on a phone via opt-in LAN mode or in a narrow browser window. Starts with zero kana knowledge.

## Product Purpose

Kana Dojo takes a complete beginner from zero to reliable recognition of hiragana and katakana. It tracks per-character weaknesses and maintains statistics and heat maps that illustrate progress. Success: the learner can recognize every basic and dakuten kana in both scripts quickly and reliably, and can see that progress.

## Positioning

Takes a complete beginner from zero to reliable hiragana and katakana recognition, one consonant row at a time, tracking every weakness and turning progress into statistics and heat maps.

## Operating Context

- Lessons by script (hiragana / katakana) and level: Level 0 Learn (study, then 3-button quiz on one row), Level 1 Recall (quiz on a passed row), Level 2 Mix (two passed rows, cross-script allowed), Level 3 Type (typed romaji, all learned rows, 20 in a row).
- Pass rule: a full unbroken streak equal to the pool size (L3: 20). A miss resets the streak; missed characters return within 2–3 prompts. Lessons run until passed or quit.
- Rows are "sets": a, k, s, t, n, h, m, y (3), r, w/n (3), then dakuten g, z, d, b, p.
- Stats dashboard: gojuon-grid heat map per script, weak-spot ranking, most-confused pairs, levels passed, accuracy trend, a "drill my weak spots" lesson.
- Keyboard-first: 1/2/3 for options, Enter to submit, arrows/space in study.

## Capabilities and Constraints

- Fully local and offline after setup: no accounts, cloud, telemetry, or runtime network calls. Fonts bundled.
- Progress in a JSON file in the tool folder (atomic writes, backup).
- Server binds to localhost by default; an opt-in LAN mode lets a phone on the same network connect.
- Audio (browser ja-JP speech synthesis) only in the study phase and after an answer; never before an answer in a quiz. Mute toggle.
- v1 scope: basic 46 + dakuten/handakuten, both scripts. Yoon and extended katakana are future additions.
- Terminology: "set" (a consonant row), "level", "streak", "Learn / Recall / Mix / Type".

## Brand Commitments

- Name: Kana Dojo.
- Voice: calm, plain, encouraging — a patient teacher. Short sentences. No exclamation spam, mascots, or gamified hype. Example: "Not quite. That's し, shi."
- Clean and minimal; the kana is always the hero.

## Evidence on Hand

No testimonials, users, or metrics exist; none may be invented. Character data verified against Unicode, Wikipedia (Hepburn/Kunrei/Nihon-shiki), Mozc, and Tofugu (see docs/DATA_SOURCES.md).

## Product Principles

1. The character is the hero: nothing competes with the kana on screen.
2. Progress is visible: every answer feeds statistics the learner can see and act on.
3. Drill what's weak: practice time goes where mistakes are.
4. Calm focus over stimulation: short, quiet feedback; no hype.
5. Honest learning: the tool never hands over an answer the learner hasn't earned.

## Accessibility & Inclusion

WCAG AA contrast; full keyboard operation with visible focus; ARIA labels on interactive kana; heat-map states never rely on color alone (patterns and labels); all motion respects prefers-reduced-motion; light and dark themes.
