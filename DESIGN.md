---
name: Kana Dojo
description: A kana trainer drawn as a Tokyo rail system. Every kana is a station, every set is a line, and progress is a route map.
colors:
  # Light: the day platform (the :root defaults)
  platform-concrete: "#e8e8e2"
  enamel-white: "#fafaf7"
  enamel-shade: "#f0f0ea"
  iron-ink: "#16191d"
  signage-grey: "#474d53"
  faded-grey: "#62686e"
  hairline: "#c4c5bf"
  hairline-strong: "#8d9096"
  top-bar: "#16191d"
  top-bar-raised: "#23272c"
  bar-ink: "#f3f3ef"
  bar-ink-muted: "#b4b9be"
  bar-rule: "#4a4f55"
  miss-red: "#b02a17"
  miss-wash: "#fbe8e3"
  miss-on-bar: "#ff8a75"
  ok-green: "#17703f"
  ok-wash: "#e3f1e7"
  ok-on-bar: "#6fd69a"
  focus-blue: "#0a5fd6"
  line-a-orange: "#f39700"
  line-k-blue: "#0096d6"
  line-s-green: "#009b48"
  line-t-violet: "#8a68b6"
  line-n-teal: "#00a29a"
  line-h-brown: "#b0611c"
  line-m-gold: "#c49b16"
  line-y-magenta: "#dc4489"
  line-r-leaf: "#5aa83f"
  line-wn-slate: "#8a9ea8"
  line-neutral: "#9a9da2"
  heat-struggling: "#f0a83c"
  heat-learning: "#e4f1e7"
  heat-solid: "#b9dcc3"
  heat-mastered: "#1d6b43"
  heat-ink-on-mastered: "#ffffff"
  # Dark: the night platform (prefers-color-scheme: dark and [data-theme="dark"], identical values)
  night-ground: "#0d0f11"
  night-panel: "#23282d"
  night-panel-shade: "#2c3137"
  night-panel-rim: "rgba(255, 255, 255, 0.12)"
  night-sign-bg: "#2b3036"
  night-sign-glow: "#31373d"
  night-ink: "#eef0ec"
  night-ink-2: "#c0c5ca"
  night-ink-3: "#9ba1a7"
  night-hairline: "#3c4249"
  night-hairline-strong: "#5d636a"
  night-bar: "#050607"
  night-bar-raised: "#16191c"
  night-miss-red: "#ff7a63"
  night-miss-wash: "#3b1813"
  night-ok-green: "#5fd08f"
  night-ok-wash: "#12311f"
  night-focus-blue: "#6aa8ff"
  night-line-k-blue: "#22aef0"
  night-line-t-violet: "#a585d6"
  night-line-h-brown: "#d07a2e"
  night-line-wn-slate: "#a3b6c0"
  night-line-neutral: "#6c7076"
  night-heat-struggling: "#d9902a"
  night-heat-learning: "#1f3527"
  night-heat-solid: "#2f5b3e"
  night-heat-mastered: "#5fd08f"
  night-heat-ink-on-mastered: "#0d0f11"
typography:
  sign-kana:
    fontFamily: "Klee One, Yu Mincho, serif"
    fontSize: "clamp(120px, min(19vw, 24vh), 210px)"
    fontWeight: 600
    lineHeight: 1
  sign-kana-quiz:
    fontFamily: "Klee One, Yu Mincho, serif"
    fontSize: "clamp(104px, min(17vw, 19vh), 180px)"
    fontWeight: 600
    lineHeight: 1
  sign-romaji:
    fontFamily: "Noto Sans JP, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "clamp(26px, 3.4vw, 34px)"
    fontWeight: 500
    letterSpacing: "0.08em"
  headline:
    fontFamily: "Noto Sans JP, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "clamp(24px, 3vw, 30px)"
    fontWeight: 700
    lineHeight: 1.25
  title:
    fontFamily: "Noto Sans JP, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.25
  title-panel:
    fontFamily: "Noto Sans JP, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: 1.25
  body:
    fontFamily: "Noto Sans JP, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
    fontFeature: "tnum"
  body-small:
    fontFamily: "Noto Sans JP, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Noto Sans JP, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  option:
    fontFamily: "Noto Sans JP, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 500
    letterSpacing: "0.04em"
  key-cap:
    fontFamily: "Noto Sans JP, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.6
  badge:
    fontFamily: "Noto Sans JP, Yu Gothic UI, Meiryo, system-ui, sans-serif"
    fontSize: "10px"
    fontWeight: 700
    lineHeight: "14px"
  kana-print:
    fontFamily: "Noto Sans JP, Yu Gothic, sans-serif"
    fontWeight: 500
rounded:
  tick: "2px"
  sign: "3px"
  ring: "50%"
spacing:
  hair: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  section: "40px"
  page-bottom: "64px"
  gutter: "clamp(16px, 4vw, 40px)"
  content-max: "1120px"
  sign-max: "960px"
components:
  button-primary:
    backgroundColor: "{colors.iron-ink}"
    textColor: "{colors.enamel-white}"
    rounded: "{rounded.sign}"
    padding: "0 20px"
    height: "44px"
    typography: "{typography.body}"
  button-primary-hover:
    backgroundColor: "{colors.signage-grey}"
    textColor: "{colors.enamel-white}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.iron-ink}"
    rounded: "{rounded.sign}"
    padding: "0 20px"
    height: "44px"
  button-secondary-hover:
    backgroundColor: "{colors.enamel-shade}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.signage-grey}"
    rounded: "{rounded.sign}"
    padding: "0 20px"
    height: "44px"
  tab:
    backgroundColor: "transparent"
    textColor: "{colors.bar-ink-muted}"
    rounded: "{rounded.sign}"
    padding: "7px 14px"
  tab-hover:
    backgroundColor: "{colors.top-bar-raised}"
    textColor: "{colors.bar-ink}"
  tab-current:
    backgroundColor: "{colors.bar-ink}"
    textColor: "{colors.top-bar}"
  segmented-on-bar-pressed:
    backgroundColor: "{colors.bar-ink}"
    textColor: "{colors.top-bar}"
    padding: "5px 12px"
  panel:
    backgroundColor: "{colors.enamel-white}"
    rounded: "{rounded.sign}"
    padding: "20px 24px"
  station-sign:
    backgroundColor: "{colors.enamel-white}"
    rounded: "{rounded.sign}"
    width: "{spacing.sign-max}"
  sign-band:
    backgroundColor: "{colors.line-neutral}"
    height: "14px"
  sign-strip:
    backgroundColor: "{colors.top-bar}"
    textColor: "{colors.bar-ink}"
    height: "64px"
  code-ring:
    backgroundColor: "{colors.enamel-white}"
    textColor: "{colors.iron-ink}"
    rounded: "{rounded.ring}"
    size: "clamp(56px, 7vw, 74px)"
  answer-option:
    backgroundColor: "{colors.enamel-white}"
    textColor: "{colors.iron-ink}"
    typography: "{typography.option}"
    rounded: "{rounded.sign}"
    height: "76px"
  answer-option-hover:
    backgroundColor: "{colors.enamel-shade}"
  answer-option-correct:
    backgroundColor: "{colors.ok-wash}"
    textColor: "{colors.iron-ink}"
  answer-option-wrong:
    backgroundColor: "{colors.miss-wash}"
    textColor: "{colors.iron-ink}"
  type-input:
    backgroundColor: "{colors.enamel-white}"
    textColor: "{colors.iron-ink}"
    rounded: "{rounded.sign}"
    height: "60px"
    padding: "0 18px"
  chip:
    backgroundColor: "{colors.enamel-white}"
    textColor: "{colors.iron-ink}"
    rounded: "{rounded.sign}"
    padding: "6px 12px"
  heat-cell:
    backgroundColor: "{colors.enamel-white}"
    textColor: "{colors.iron-ink}"
    rounded: "{rounded.sign}"
    width: "54px"
    height: "62px"
  heat-cell-mastered:
    backgroundColor: "{colors.heat-mastered}"
    textColor: "{colors.heat-ink-on-mastered}"
  station-dot:
    backgroundColor: "{colors.enamel-white}"
    rounded: "{rounded.ring}"
    size: "30px"
  ride-stop:
    backgroundColor: "{colors.enamel-white}"
    rounded: "{rounded.ring}"
    size: "24px"
---

# Design System: Kana Dojo

## Overview

**Creative North Star: "The Station Board"**

Every kana is a station and every set is a rail line. The study card is an ekimei-hyō, the enamel name board on a Japanese platform: a band in the line's colour on top, a ringed station code (し = S02), the kana large in the middle, the romaji under it, and a black strip below naming the neighbouring stations. Progress is drawn as a route map. A streak is a train that moves one stop per correct answer and returns to the first stop on a miss. The interface borrows only what transit signage already does: flat enamel panels, iron-black type, one hairline weight for borders, and saturated line colours that identify a line and do nothing else.

The density is calm, and only one thing is the hero on each screen. On a lesson screen the sign fills the centre column (960px at most), with the kana at up to 210px, and everything else sits under it in quiet ink. Chrome is a dark top bar and enamel panels on a pale concrete ground. There are no floating rounded cards, gradient fills, accent buttons or decorative illustration. The primary action is filled in iron ink, not in a brand hue, because in this world colour belongs to the lines.

At night the board is back-lit. Dark mode is the night platform: a near-black ground, panels lifted to a warm charcoal with a faint top rim, and the sign body lit from within by a radial glow, as an illuminated sign is.

**Key Characteristics:**
- Enamel panels on concrete, with 1px hairline borders and 3px corners.
- Fifteen line colours (Tokyo-style), one per set. Dakuten sets run as "rapid" services on their base line's colour, with a double band and double rings.
- Kana are set in Klee One 600 (textbook shapes). The UI and romaji are set in Noto Sans JP.
- Feedback is a hairline, never a slab. One red is used, only for misses.
- Line-and-ring geometry (stations, tracks, rides) is the signature form.
- The dark theme is a back-lit night platform, not an inverted day.

## Colors

The palette is a transit system: neutrals are platform materials, and saturated colour is reserved for line identity and the two answer outcomes.

### Primary
- **Iron Ink** (iron-ink): body text, the filled primary button, the selected-state halo, the streak fill, and the "done" ride stops. It is the action colour; there is no separate brand accent.

### Secondary: the line colours
- **Line colours** (line-a-orange through line-wn-slate): one per basic set, applied only as the sign band, the code ring, the route-map station dot, and the arrival ride. Dakuten sets reuse their base line: Ga on K blue, Za on S green, Da on T violet, Ba and Pa on H brown. On the night platform, K, T, H and Wa·N are lifted (night-line-*) so the rings stay visible on charcoal.
- **Line Neutral** (line-neutral): the band of any sign whose line is not revealed. That covers a quiz before it is answered, every Level 4–5 word sign (words cross rows, so they belong to no line), and an arrival that did not pass.

### Tertiary: outcomes
- **Miss Red** (miss-red, with miss-wash behind wrong options, and miss-on-bar for the icon on the black strip): marks a wrong answer. It appears on a wrong option, the sign's miss hairline, the ride reset fill, a hollow miss tick in the history, an invalid typed answer, and missed-character chips.
- **OK Green** (ok-green, ok-wash, ok-on-bar): marks a correct answer on the option, the strip icon, and the history bars.
- **Struggling Amber** (heat-struggling): marks a struggling character on the heat map and the weak-spot meter. It is never used for errors.
- **Focus Blue** (focus-blue): the 3px focus outline, the typed-input focus ring, and today's mark on the calendar.

### Neutral
- **Platform Concrete** (platform-concrete): the page ground.
- **Enamel White** (enamel-white): panels, signs, options, inputs, and station-dot fills. **Enamel Shade** (enamel-shade) is used for hover fills and empty meters.
- **Signage Grey** (signage-grey) and **Faded Grey** (faded-grey): secondary and tertiary text. Faded Grey holds 4.5:1 or better on both panel and ground.
- **Hairline** and **Hairline Strong**: dividers, panel borders and track lines, and the borders of options, inputs, keycaps and unseen cells.
- **Top Bar** (top-bar, top-bar-raised, bar-ink, bar-ink-muted, bar-rule): the dark top bar and the sign's neighbour strip.
- **Heat ramp** (heat-learning, heat-solid, heat-mastered): learning, solid and mastered cells, from wash to deep green.
- **Night platform**: night-ground (near-black), night-panel and night-panel-shade (lifted charcoal), night-panel-rim (a 12% white inset rim), and night-sign-bg/night-sign-glow (the sign body's radial glow, with the centre capped so muted text keeps 4.5:1 or better). In light mode the rim is transparent and both sign tokens equal the panel.

### Named Rules
**The Line Owns Its Colour Rule.** A line colour identifies a set. It appears on bands, code rings, station dots and the arrival ride, and nowhere else: never on text, buttons, panel fills or chrome.

**The One Red Rule.** Miss Red means "that answer was wrong" and is held until the answer is corrected. Struggling is amber, and focus is blue.

**The Unrevealed Line Rule.** In a quiz the band stays neutral and the code ring stays hidden until the learner answers, because the line colour and code would reveal the row.

**The Ink Is The Action Rule.** The primary action is filled with Iron Ink. Don't add a brand accent hue for buttons or links.

## Typography

**Display Font:** Klee One (with Yu Mincho, serif), for kana only
**Body Font:** Noto Sans JP (with Yu Gothic UI, Meiryo, system-ui, sans-serif)
**Alternate kana:** Noto Sans JP 500, used when the learner picks "print" kana in Settings

**Character:** Klee One gives handwritten textbook strokes, the shapes a learner copies. Noto Sans JP is plain signage type for everything else, and it shares a family with the print-kana alternative, so switching the setting changes only the kana.

### Hierarchy
- **Sign kana** (Klee One 600, clamp(120px, min(19vw, 24vh), 210px), line-height 1): the kana on the study sign. In quizzes it uses sign-kana-quiz (104 to 180px). On short laptop screens it drops to clamp(88px, 15vh, 120px). Word signs scale down by length: 3 characters reach 150px, 4 reach 124px, and 5–6 reach 104px.
- **Sign romaji** (500, clamp(26px, 3.4vw, 34px), tracked 0.08em): the reading under the kana. Before the answer it shows a 3.2em hairline blank.
- **Headline** (700, clamp(24px, 3vw, 30px), line-height 1.25, balanced): page titles.
- **Title** (700, 19px): section headings. Panel headings use 17–18px at 700.
- **Option** (500, 26px, tracked 0.04em): answer buttons. Meaning options use 20px untracked.
- **Body** (400, 16px, line-height 1.55, tabular numerals): running text, capped at 62ch.
- **Body small** (14px): crumbs, notes, stat rows and help.
- **Label** (13px): legends, the keys hint, and settings labels. Key caps are 12px 500. Station badges are 10px 700.

Kana inside UI text (route names, chips, cells and the ride) always use the kana family at the kana weight.

### Named Rules
**The Kana Is The Hero Rule.** No other type on a screen comes within half the size of the kana. Nothing else is set in Klee One.

**The No Uppercase Rule.** Labels stay in sentence case at weight 400–500. Signage hierarchy comes from size and weight, not from letter-spaced capitals.

## Layout

The page is one centred column (1120px max) with fluid gutters (clamp(16px, 4vw, 40px)) and 64px of bottom space. Lesson screens narrow to a 960px column that holds the sign, the ride, the options and the actions, in that order, with gaps of 20px (14px on phones). Stats uses a two-column grid (a fluid heat map plus a 290px sticky detail panel) that stacks below 980px. The cards row auto-fits columns of at least 280px, and Accuracy spans two columns from 980px up.

Spacing is set in 4px steps. The common values are 4, 8, 12, 16 and 24, with 40 between sections. Panel padding is 20–24px.

Responsive behaviour:
- **860px and below:** the route map changes from a horizontal line of 15 stations to a vertical line.
- **720px and below:** the top bar wraps, and the tabs drop to their own row.
- **480px and below:** the brand collapses to its ring.
- **560px and below:** the crumb stacks, and the options tighten to 64px high. Meaning options go to one column.
- **330px and below:** options go to one column.
- **Short screens** (max-height 800px, min-width 721px, such as 1280×720 and 1366×768): the quiz compresses to fit. Kana are 88–120px, the band is 10px, the code ring is 52px, options are 60px and the input is 52px, so the answered state fits without scrolling.
- **Coarse pointers:** tabs, segmented buttons, icon buttons, link-buttons and the brand grow to 44px touch targets.
- **No hover:** key caps and the keys hint are hidden.

## Elevation & Depth

The platform is flat. Panels and signs sit on the ground with a 1px hairline and no shadow. Depth comes from tone: concrete, then enamel, then a shade for hover. At night, depth comes from the inset rim light and the sign's inner glow. Real shadows appear only on layers that float above the page: the settings popover and the leave dialog. Selection uses concentric ring halos, as on a transit map, not lift.

### Shadow Vocabulary
- **Panel rim** (`box-shadow: inset 0 1px 0 var(--panel-rim)`): a top edge catching light on night panels. It is invisible by day.
- **Sign rim** (`box-shadow: inset 0 -1px 0 var(--panel-rim), 0 0 0 1px var(--panel-rim)`): the outline of a back-lit sign at night.
- **Station halo** (`box-shadow: 0 0 0 3px var(--panel), 0 0 0 5px var(--ink)`): the next, selected or just-passed station on the route map.
- **Ride "here" halo** (`box-shadow: 0 0 0 4px var(--ground), 0 0 0 6px var(--ink)`): the stop the train is at.
- **Popover** (`box-shadow: 0 12px 32px rgba(0,0,0,.18)`): settings.
- **Dialog** (`box-shadow: 0 16px 40px rgba(0,0,0,.25)`, with a backdrop of rgba(10, 12, 14, 0.45)): leave confirmation.

### Named Rules
**The Flat Platform Rule.** Nothing on the page casts a shadow. Only layers floating above it (popovers and dialogs) get a soft drop.

**The Back-Lit Night Rule.** In dark mode, lift panels by tone, give them a rim light, and light the sign from inside. Never put a pure-black card on a black ground.

## Shapes

Corners are barely softened (3px), like enamel plate. Small ticks (badges, calendar days, history bars) use 2px. Everything that is a station or a stop is a full circle. Strokes come in two families. Borders and dividers are one hairline (1px). Line geometry is deliberately heavy: the route track is 6px, the ride track 4px, station rings 5px, ride stops 4px, and code rings 6–8px. A rapid (dakuten) line shows as a double band (5px, a 4px gap, then 5px) and double station rings (7px double). Locked stations are dashed, and unseen heat cells have dashed borders.

## Components

### Buttons
Plain enamel and ink controls.
- **Shape:** 3px corners, at least 44px high, 0 20px padding, Noto Sans JP 16px 500.
- **Primary:** filled with Iron Ink, with enamel text. It carries an Enter key cap when it is the keyboard default.
- **Secondary:** a 1px ink outline on a transparent fill.
- **Quiet:** borderless, in Signage Grey. Used for "End lesson", "Pick again" and "Clear".
- **Hover / Focus:** background changes over 160ms on the ease-out curve. Primary moves to Signage Grey, and the others to Enamel Shade. Every control gets a 3px Focus Blue outline offset 2px. Disabled controls drop to 45% opacity.

### Chips
- **Style:** an enamel fill with a 1px Hairline Strong border, 3px corners, 6px 12px padding and a 24px kana. Missed-character chips take a Miss Red border.

### Cards / Containers
- **Corner Style:** 3px.
- **Background:** Enamel White. At night it is the lifted charcoal with an inset rim.
- **Shadow Strategy:** none (see Flat Platform).
- **Border:** a 1px Hairline.
- **Internal Padding:** 20–24px.

### Inputs / Fields
- **Style:** the typed-romaji box. It is 60px high, with a 26px centred entry tracked 0.06em, a 1px Hairline Strong border, an enamel fill and 3px corners.
- **Focus:** the border turns ink, and a 3px ring of Focus Blue at 55% appears.
- **Error:** a Miss Red border.

### Navigation
A dark top bar (60px, sticky) holds the brand ring (a station ring in S green), the tabs (Learn, Recall, Mix, Type, Words, Stats), a segmented script toggle (ひらがな / カタカナ) and SVG icon buttons. Tabs are 15px Bar Ink Muted text. Hovering fills them with Top Bar Raised, and the current tab is an inverted Bar Ink pill. On phones the tabs move to their own scrolling row.

### Station Sign (signature)
The ekimei-hyō is a full-width enamel panel, 960px at most, with `overflow: hidden`. It stacks a 14px line band, a body with the code ring top-left, the script label top-right, the kana and the romaji, and a black neighbour strip (64px, or 48px in quizzes) with previous and next stations and a centred status. A correct answer shows an OK Green icon in the strip. A miss turns the panel border and a 1px ring Miss Red, with the icon in miss-on-bar. The kana enters with a 260ms rise (6px). Word signs (Levels 4–5) always carry the neutral band and no code ring.

### Route Map (signature)
Each script is one line of 15 stations on a 6px Hairline track. Stations are 30px rings in their line colour. A passed station is filled. The next or selected station scales to 1.2 with the station halo. A station passed just now, on the arrival map, is filled in its line colour and haloed. Locked stations are dashed and grey. L and R badges under a station record passed levels.

### The Ride (signature)
The streak strip shows one stop per needed correct answer on a 4px track. The ink fill moves stop to stop over 420ms. On a miss it runs back in Miss Red over 640ms (cubic-bezier(0.65, 0, 0.35, 1)). On arrival, the done stops pop in (340ms, 70ms stagger), and the fill and stops take the line's band colour. Strips with more than 10 stops switch to a dense 16px variant.

### Heat Map Cell
Each cell is 54×62px with 3px corners and a kana over its romaji. Every band carries a pattern as well as a colour: unseen is dashed, struggling has amber stripes, learning has a dot row, solid has a half bar, and mastered is solid deep green with a full bar.

## Do's and Don'ts

### Do:
- **Do** give each set its line colour on the band, code ring and station dot, and reuse the base line for dakuten as a double-band rapid service.
- **Do** keep the band neutral (line-neutral) and the code ring hidden until a quiz answer is in.
- **Do** mark a miss with a hairline (a Miss Red border plus a 1px ring) and a small strip icon, and hold it until corrected.
- **Do** pair every heat-map colour with a pattern (dashes, stripes, dots, half bar or full bar).
- **Do** fill the primary action with Iron Ink, and keep exactly one primary per action group.
- **Do** keep touch targets at 44px under coarse pointers, and keep 1280×720 quiz states scroll-free.
- **Do** run all motion on cubic-bezier(0.16, 1, 0.3, 1), and drop all of it under prefers-reduced-motion.

### Don't:
- **Don't** put a line colour on text, buttons, links or panel fills.
- **Don't** use Miss Red for anything but a wrong answer. Struggling is amber.
- **Don't** fill a sign or panel with red on a miss.
- **Don't** add shadows to panels or signs. Shadows are for popovers and dialogs only.
- **Don't** round panels beyond 3px or float them as cards.
- **Don't** set anything but kana in Klee One, or let any text compete with the sign kana.
- **Don't** render the dark theme as black cards on black. Lift and back-light them.
