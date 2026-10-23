---
target: Kana Dojo app
total_score: 17
max_score: 20
target_path: "public/index.html"
timestamp: 2026-10-20T06-30-00Z
slug: public-index-html
---
Method: the bundled detector on the source and the live URL; a scripted WCAG contrast scan of every home tab and Stats, light and dark, with all disclosures open; a touch-target and overflow scan at 375×812 (emulated viewport, Chromium in-app browser); source review.

## Audit Health Score
| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Live regions re-created on each render (ride, Stats detail); no h1 on study and quiz screens |
| 2 | Performance | 4 | Subset woff2 fonts (~57 KB each), no images, small DOM; full re-render per answer is cheap |
| 3 | Theming | 3 | Dark tokens duplicated in two blocks (media query and `[data-theme=dark]`); otherwise token-clean |
| 4 | Responsive | 3 | Phone touch targets: tabs 35 px, script toggle 32 px, icon buttons 38 px, brand 22 px (all ≥ 24 px, so AA 2.5.8 passes) |
| 5 | Implementation integrity | 4 | Detector: 1 advisory (struggling-cell stripes; an intentional non-colour cue, kept) |
| **Total** | | **17/20** | **Good** |

## Implementation Integrity Verdict
Pass. A product-specific system: line-colour tokens, station/ride components shared by home, lesson and summary, and one alert red used only for misses. The contrast scan found no failures in either theme. The only flags were struggling heat cells, a false positive: the scanner misread `color(srgb …)`, and the real contrast is about 7:1.

## Findings
- **[P2] Re-created live regions.** In `components.js` `rideHTML` and in the `stats.js` detail panel, a pre-filled `aria-live` element is rebuilt on every render. That is unreliable, and it can double-announce with the persistent `#live`. Remove it; `#live` already carries the streak.
- **[P2] No h1 on study, quiz and typing screens** in `lesson.js`. Add a visually hidden h1 such as "Learn · Ka row".
- **[P2] Touch targets under 44 px on coarse pointers**: the top bar tabs, the script toggle, the icon buttons and the brand. Raise them to 44 px under `(pointer: coarse)`.
- **[P2] Stats "Recent" history encodes right and wrong by colour only.** Give misses a distinct shape.
- **[P2] A picked station on Learn is announced as "suggested".** It should say "selected".
- **[P3] Two h1s on the very first visit** (the welcome panel and the page head).
- **[P3] `inputmode="latin"`** is not a standard value. Drop it.
- **[P3] Duplicated dark-token block.** Keep the two blocks in sync, or generate one from the other. Documented; not changed.

## Positive findings
- Every text pair is AA in both themes. Focus rings are visible. Full keyboard flow, a persistent `#live` announcer, a leave-confirm dialog with Escape.
- No horizontal scroll at 375 px on any view. Heat-map bands use patterns as well as colour.
- Reduced motion removes animation, but state changes still show: the ride fill jumps instead of sliding.
