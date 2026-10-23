# Bugs to fix (found while recording the demo video, 2026-10-20)

> **Status: bugs 1–5 fixed on 2026-10-20.** Bug 4 is fixed by the new Type rule (20 different
> characters per run). See NEXT.md. The two "worth considering" items are still open.

These turned up during a scripted run-through on a sandboxed copy, with Playwright on Chromium at 1920×1080.
They are in priority order. Each one has a repro, the cause where it's known, and a suggested fix.

## 1. Settings popover closes on every choice

- **Repro:** open Settings (gear), then click any Theme or Kana style button. The setting applies, but the popover
  closes straight away, so you can't compare options or change two settings in one go.
- **Cause:** `public/js/app.js`
  - The click on a `[data-set]` button calls `updateSettings`, which re-renders the popover through `renderSettings()`.
    That replaces `settingsEl.innerHTML`.
  - The document-level outside-click handler (`app.js:88`) then runs `settingsEl.contains(e.target)`. The clicked
    button is no longer in the DOM, so the check is false and `toggleSettings(false)` fires.
- **Fix (pick one):**
  - In the outside-click handler, bail out when `!e.target.isConnected`, or use `e.composedPath().includes(settingsEl)`.
  - Or update `aria-pressed` on the existing buttons in place, without rebuilding the HTML. This also keeps keyboard
    focus on the pressed button, which a re-render loses today.
- **Check:** pick Dark, then Textbook, without reopening. Focus stays on the button you pressed, and Escape and
  outside clicks still close the popover.

## 2. Accuracy chart's top label is clipped ("100%" shows as ".00%")

- **Repro:** Stats → "Accuracy, last 30 days". The top y-axis label is cut off at the SVG's left edge. This
  happens in both themes.
- **Cause:** `public/js/views/stats.js:76`. The left margin is `L = 30`, and labels are drawn at `x = L - 6` with
  `text-anchor="end"`. That leaves 24 px, which is too narrow for "100%" at the chart's font size.
- **Fix:** widen `L` (about 40), or compute it from the longest label. Another option is to label the axis
  "0 / 50 / 100" and put "%" in the chart title.
- **Check:** all three labels show in full in light and dark, and at 375 px wide.

## 3. Answering scrolls the page on short viewports

- **Repro:** on a viewport under about 830 px tall (for example 1280×720, a common laptop size), answer a quiz
  prompt. The page scrolls so the Next button is visible, and the breadcrumb ends up under the sticky top bar.
- **Cause:** `public/js/views/lesson.js:219`, `next?.scrollIntoView({ block: 'nearest' })`. On a short screen the
  sign plus feedback plus actions are taller than the viewport, so the page has to scroll. NEXT.md step 2 tuned the
  quiz for 1280×800, but 720 still overflows.
- **Fix:** tighten the sign height on short screens with `@media (max-height: 760px)` (smaller kana and sign
  padding), so the answered state fits without scrolling. Also add `scroll-margin-top` equal to the top-bar height
  on the lesson container, so any scroll that still happens doesn't tuck content under the bar.
- **Check:** at 1280×720 and 1366×768, answer correctly and wrongly. Next stays visible with no scroll, or at
  least the crumb stays clear of the top bar.

## 4. Type mode repeats a character too soon

- **Repro:** Level 3 Type. A character can come back within three prompts (な was prompt 1 and prompt 3 with no
  miss in between). This is allowed by the algorithm, but it feels repetitive and like an easy streak.
- **Cause:** `pickNext` in `src/core/selection.js` excludes only `lastId`. Otherwise it is a weighted random pick
  over the pool, so weak characters often come back two turns later.
- **Fix:** add a short minimum gap for characters that weren't missed, such as `min(3, floor(poolSize / 3))` turns
  since last seen. Keep requeued misses exempt, so the "comes back 2–3 prompts later" rule still holds. Add a
  `selection.test.js` case, and re-run the `test/sim` personas to confirm the bounded window still holds.
- **Check:** `npm test` passes. A seeded 40-prompt run over a pool of 9 or more has no non-requeued repeat within
  the gap.

## 5. Route-map legend says "Selected" when nothing was selected

- **Repro:** Learn or Recall home on first load. The suggested station is drawn with the ring that the legend
  calls "Selected", but the learner hasn't picked anything. It's the app's suggestion.
- **Cause:** `public/js/views/home.js:97`. The legend always labels the `sel` ring "Selected". The station's
  aria-label already tells "suggested" and "selected" apart (`home.js:90`, `label: ... chosen ? 'selected'`), but
  the legend doesn't.
- **Fix:** label the legend entry "Next stop" when the station is the suggestion, and "Selected" once the learner
  has clicked a station.

---

## Not bugs, but worth considering

- **No theme-change transition:** switching Light/Dark is an instant cut. A brief cross-fade would help, for
  example a ~200 ms transition on `background-color`/`color` on `body` and panels, applied only while the theme
  changes and turned off under `prefers-reduced-motion` (`app.css:511` already does this globally). Use the
  View Transitions API (`document.startViewTransition`) where it's available.
- **Arrival screen:** the just-passed station is drawn as a hollow ring rather than filled with the line colour.
  NEXT.md records that the "just passed" label was deliberate, so this is a judgement call. Check it against the
  direction contract before changing it.
