---
target: Kana Dojo app
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:C:\\Users\\Jeremy\\Documents\\Projects\\Claude\\Kana Dojo\\public\\index.html"
target_fingerprint: "sha256:b850882853482d8fd2ddb194c5634160ded17b03eb35f786bdf31e5187f85c11"
target_path: "C:\\Users\\Jeremy\\Documents\\Projects\\Claude\\Kana Dojo\\public\\index.html"
timestamp: 2026-10-20T05-09-49Z
slug: public-index-html
---
Method: dual-agent (A: design review subagent · B: detector subagent)

## Design Health Score
| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Feedback + Next below the fold at 1280×800 after a miss |
| 2 | Match system / real world | 3 | "Level 0", rows/sets/lines, L/R badges mix vocabularies |
| 3 | User control & freedom | 2 | Tab click mid-lesson silently quits; no Escape |
| 4 | Consistency & standards | 2 | [hidden] overridden: script toggle on Mix/Type, Check button after answering |
| 5 | Error prevention | 3 | Quit-on-navigate unguarded |
| 6 | Recognition over recall | 3 | "H hear" shown with no voice installed |
| 7 | Flexibility & efficiency | 3 | Number keys dropped during 1.1 s pause; home Enter only from body |
| 8 | Aesthetic & minimalist | 3 | Miss state loud (red slab + red text + shake) |
| 9 | Error recovery | 4 | Exemplary miss copy |
| 10 | Help & documentation | 2 | Welcome vanishes after lesson 1; no level help after |
| **Total** | | **28/40** | **Good** |

## Design Specificity Verdict
Authored at the hero (station-board study card, rapid double rings, vertical strip map on phone), generic at the edges: grey ride strip, monochrome arrival, SaaS-like stats, all 15 sets on one grey track. Detector: 1 advisory (repeating-stripes-gradient on struggling heat cells: intentional non-colour cue, kept); browser: cream-palette on #e8e8e2 ground (borderline), one straggler line on Stats.

## Priority Issues
1. [P1] Screen-reader feedback lost: live regions re-created pre-filled on every render; focus drops to main. Fix: persistent live region; focus Next after answer, first option on new prompt.
2. [P1] [hidden] overridden by display rules (script toggle on Mix/Type; Check button after answer). Fix: [hidden]{display:none!important}.
3. [P1] Feedback + Next below the fold at 1280×800 and phone. Fix: shorter quiz sign, merge feedback into strip area, compact phone chrome.
4. [P2] Dark miss strip contrast 2.56:1. Fix: darker fill with white text.
5. [P2] Flat peak-end + unguarded exit: arrival in ink instead of line colour, no lit station; tab click silently quits. Fix: line-coloured arrival + route map with the new station; confirm leaving; Escape ends lesson.

## Persona Red Flags
Alex: number keys swallowed during pause; Enter on home fails after clicking a station; no Escape. Sam: unspoken feedback; focus reset each prompt; dark miss contrast; locked labels ~2:1; legend aria-hidden. Jordan: no persistent level help; "Locked" in Learn legend; "Level 0" jargon; busy Mix; "H hear" with no voice.

## Minor Observations
Duplicate "Not quite"; duplicate missed list on summary; Type placeholder truncates on phone; kbd hints on touch; hidden quiz ring still contains the code in DOM; confused-with shows romaji not kana; hard-coded #4a4f55; empty CSS rule; legend counts shown on zero.

## Questions to Consider
Quieter miss? Real network map with dakuten branches? (Elimination of the last kana: user already accepted this trade.)
