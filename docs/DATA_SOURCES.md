# Kana Dojo: data sources and romaji decisions

Covers `src/core/kana.js`, v1 scope: the 46 basic gojūon plus the dakuten/handakuten rows
(g, z, d, b, p) for both hiragana and katakana. That is 71 per script, 142 in total.
Last verified 2026-10-19.

## Sources

| # | Source | URL | Used for |
|---|--------|-----|----------|
| 1 | Unicode Character Database, Blocks.txt | https://www.unicode.org/Public/UCD/latest/ucd/Blocks.txt | Block ranges: Hiragana `3040..309F`, Katakana `30A0..30FF` |
| 2 | Wikipedia, "Hiragana (Unicode block)" | https://en.wikipedia.org/wiki/Hiragana_(Unicode_block) | Code point of every hiragana glyph |
| 3 | Wikipedia, "Katakana (Unicode block)" | https://en.wikipedia.org/wiki/Katakana_(Unicode_block) | Code point of every katakana glyph |
| 4 | Python `unicodedata` (Unicode Character Database names) | n/a, run locally | Each `char`'s official name (for example `HIRAGANA LETTER DI`) checked against its id |
| 5 | Wikipedia, "Hepburn romanization" | https://en.wikipedia.org/wiki/Hepburn_romanization | Canonical romaji, the じ/ぢ = ji and ず/づ = zu merge, を, ん |
| 6 | Wikipedia, "Kunrei-shiki romanization" | https://en.wikipedia.org/wiki/Kunrei-shiki_romanization | Alternates si ti tu hu zi zu; ぢ = zi, づ = zu; を = o |
| 7 | Wikipedia, "Nihon-shiki romanization" | https://en.wikipedia.org/wiki/Nihon-shiki_romanization | Alternates di, du, wo; ん = n / n' |
| 8 | Google Mozc (Google Japanese Input) romaji table | https://raw.githubusercontent.com/google/mozc/master/src/data/preedit/romanji-hiragana.tsv | Real IME inputs: si ti tu hu zi di du wo nn n'; `la`..`lo` produce small ぁ..ぉ; no `dzu` or `dji` |
| 9 | Tofugu, "Learn Hiragana" | https://www.tofugu.com/japanese/learn-hiragana/ | Learner romaji (wo, typing di/du) and hiragana look-alikes |
| 10 | Tofugu, "Learn Katakana" | https://www.tofugu.com/japanese/learn-katakana/ | Katakana look-alikes (シ/ツ, ソ/ン) and katakana that resemble their hiragana |

Every glyph was checked against at least two sources: the Unicode block pages (2, 3) and the
UCD names (4). Each romaji value was also checked against at least two sources (5, 6, 7, plus 8 or 9).
`test/kana-data.test.js` enforces block membership and the key spot checks.

## Glyph verification

- All 142 `char` values are single code points. Each one's Unicode name matches its id.
  Unicode names use Nihon-shiki, so `h-shi` → `HIRAGANA LETTER SI`, `h-di` → `HIRAGANA LETTER DI`,
  `k-wo` → `KATAKANA LETTER WO`, and `k-n` → `KATAKANA LETTER N`. No errors were found in the draft.
- Correctly distinguished: ヲ U+30F2 (wo, included) vs ヮ U+30EE (small wa, excluded);
  ヂ U+30C2 / ヅ U+30C5 (included) vs ジ U+30B8 / ズ U+30BA; ぢ U+3062 / づ U+3065.
- Excluded, and enforced by test: ゐ ゑ ヰ ヱ (obsolete wi/we), ゎ ヮ, small kana (っ ゃ etc.),
  ゔ ヴ, the combining and spacing (han)dakuten marks, the iteration marks, ・, and ー
  (U+30FC, the long-vowel mark, which is not a kana).

## Canonical romaji and accepted alternates

The canonical spelling is modified Hepburn. `alt` lists the other spellings a learner may type.

| Kana | Canonical | Alternates | Rationale |
|------|-----------|-----------|-----------|
| し シ | shi | si | Kunrei/Nihon-shiki; IME input |
| ち チ | chi | ti | Kunrei/Nihon-shiki; IME input |
| つ ツ | tsu | tu | Kunrei/Nihon-shiki; IME input |
| ふ フ | fu | hu | Kunrei/Nihon-shiki; IME input |
| じ ジ | ji | zi | Kunrei/Nihon-shiki; IME input |
| ぢ ヂ | **ji** | di, zi | Hepburn merges ぢ into ji (5). Nihon-shiki and the IME use di (7, 8). Kunrei uses zi (6) |
| ず ズ | zu | (none) | Same spelling in every system |
| づ ヅ | **zu** | du, dzu | Hepburn merges づ into zu (5). Nihon-shiki and the IME use du (7, 8). `dzu` is kept because the architecture contract names it as an accepted variant |
| を ヲ | **wo** | o | See below |
| ん ン | n | nn, n' | `nn` is the standard IME input. `n'` is the Hepburn/Kunrei/Nihon-shiki spelling before vowels and y, and also an IME input (5, 6, 7, 8) |
| all other kana | plain Hepburn | (none) | All systems agree |

Notes:
- **じ/ぢ both "ji", ず/づ both "zu".** In standard Japanese each pair sounds the same, and
  Hepburn spells both members identically. So the canonical romaji is shared, and ids are
  disambiguated as `h-di`/`h-du`/`k-di`/`k-du`. Per the contract, matching must accept "ji" for ぢ
  and "zu" for づ, and distractors must never pair じ with ぢ or ず with づ.
- **を "wo" vs "o".** Modified Hepburn writes the particle を as "o" (5), and Kunrei does too (6).
  Traditional Hepburn and Nihon-shiki write "wo" (5, 7). The IME input is `wo` (8), and learner
  guides name the character "wo" (9, 10). For a flash card that shows the isolated character,
  **wo** is the most recognisable label and keeps を apart from お. "o" is accepted as an alternate.
- **ん "n".** The canonical spelling is "n". Plain `n` is accepted (it is the canonical form), and
  `nn` and `n'` are also accepted.

### Discrepancies and how they were resolved

| Topic | Disagreement | Resolution |
|-------|--------------|-----------|
| ぢ / づ | Hepburn ji/zu; Kunrei zi/zu; Nihon-shiki di/du | Canonical uses Hepburn. Every other spelling is accepted as an alternate |
| を | Modified Hepburn and Kunrei "o"; traditional Hepburn, Nihon-shiki, IME and Tofugu "wo" | Canonical "wo", alternate "o" (reasons above) |
| ん before vowels | Hepburn n'; traditional Hepburn m before labials; IME nn | Canonical "n". Alternates nn and n'. "m" is not accepted, because it is obsolete and would collide with the m-row in typing |
| `dji` (draft alt for ぢ) | No source supports it. Mozc has no entry for it, and Hepburn uses ji | **Removed** |
| `la li lu le lo` (draft alts for the r-row) | Mozc maps `la`..`lo` to **small ぁ ぃ ぅ ぇ ぉ**, not to ら..ろ | **Removed.** Accepting them would teach a typing habit that produces the wrong kana in a real IME. It would also clash with small-kana answers once extended katakana (ファ = "fa", with ァ typed as `la`/`xa`) is added. Learners who hear Japanese r as l can be told so by a "did you mean r?" hint in `matching.js` rather than through the data |

## Confusable groups

Every member of a group lists every other member, and cross-script links are allowed. Changes made
to the draft:

- **Split large mixed groups into precise pairs** so that only real look-alikes are linked:
  - あ/お/め/ぬ became あ/お and あ/め/ぬ.
  - い/り/こ became い/り and い/こ.
  - う/つ/ら/ち became う/つ, う/ら and ら/ち.
  - さ/き/ち became さ/き and さ/ち.
- **Removed:** そ from the し/つ group (そ does not resemble し or つ). The redundant ぬ/め group is
  now covered by あ/め/ぬ.
- **Added (hiragana):** ぬ/ね, ほ/ま, こ/に, and the dakuten-vs-handakuten pairs び/ぴ, べ/ぺ, ぼ/ぽ.
  ば/ぱ and ぶ/ぷ were already present.
- **Added (katakana):** コ/ヨ, ヌ/メ, オ/ホ, and ビ/ピ, ベ/ペ, ボ/ポ.
- **Added (cross-script):** け/ケ and カ/ガ.
- **Kept:** シ/ツ/ソ/ン, ク/タ/ケ/ワ, ウ/ワ/フ/ヲ, コ/ユ/ロ, エ/コ, ヌ/ス/フ/ラ, チ/テ/ナ, ノ/メ/ソ,
  マ/ム/ア, セ/サ/ヤ, ル/レ, ハ/ホ, キ/サ, ね/れ/わ, る/ろ, は/ほ/け, ま/も/よ, く/へ, た/な, and the
  cross-script pairs か/カ, き/キ, へ/ヘ, り/リ, も/モ, や/ヤ, せ/セ, こ/コ, に/ニ, わ/ワ, う/ウ,
  べ/ベ, ぺ/ペ, が/ガ.

## Adding yoon / extended katakana later

The data model already supports both. No other module needs structural changes.

1. **Add SET_DEFS entries** with `group: 'yoon'` or `group: 'extended'` and continue the `order`
   numbering. Example: `{ id: 'ky', label: 'kya · kyu · kyo', group: 'yoon', order: 16 }`.
   Set ids must be unique across groups.
2. **Add KANA rows.** Yoon ids follow the existing rule (`h-kya`, `k-kya`). The `char` is the
   two-code-point string (`'きゃ'`), so extend the test so that yoon and extended entries may have
   2 code points and check each code point's block. Use modified Hepburn: kya, sha (alt sya),
   cha (alt tya, cya), ja (alt zya, jya), and so on. Mozc (source 8) is a good reference for IME
   alternates. ぢゃ/ぢゅ/ぢょ are optional (romanised ja/ju/jo, alt dya/dyu/dyo).
3. **Extended katakana** (ファ fa, ティ ti, ドゥ du, ヴ vu, ウィ wi, シェ she, チェ che, ジェ je…)
   are katakana-only. Add the rows with only a katakana entry rather than through the shared
   `ROWS` tuple. Watch for romaji collisions with the basic alternates: ティ "ti" collides with
   ち's alt `ti`, and ドゥ "du" with づ's alt `du`. Before adding them, decide whether those basic
   alternates stay. Also make sure `matching.js` accepts only the prompted character's own romaji/alt,
   and that distractor de-duplication compares canonical romaji.
4. **Grid.** Add a new key to `GRID_ROWS` (for example `yoon: ['ky','sh','ch',…]`) with col
   0/1/2 = a/u/o, and keep `(row, col)` unique per script.
5. **Confusables.** Add groups such as しゃ/しゅ/しょ, ニャ/ニュ/ニョ and シャ/ジャ (link real ids only).
   Every id must exist; `buildKana()` throws on unknown ids.
6. Update the expected sizes and totals in `test/kana-data.test.js`.

## Words (Levels 4–5), `src/core/words.js`

310 entries (247 hiragana, 63 katakana) written for v1 on 2026-10-20 and checked against JMdict
the same day (see below). Each is stored as kana plus
English meanings. Units, romaji and ids are derived from the kana table, so they can't drift from it.

Selection rules (enforced by `test/words.test.js`):
- Two or more kana, all from the basic and dakuten rows the app teaches: no small ゃゅょっ, no ー.
- Romaji is the kana read one by one (おとうさん → otousan, せんせい → sensei). So: no を, no particle
  readings (は/へ as wa/e), no ぢ/づ, and no ん before a vowel or y (that would need "n'").
- No common homonyms (あめ rain/candy, はし bridge/chopsticks, かみ, くも, かぜ, かわ, はな, した, しろ,
  かう, あう, なく, かえる…, and, after the JMdict check, さん "Mr/Ms", くらい "about", しめる 締める,
  ふく 吹く, すむ 済む). Each word has one meaning, so Level 5 can ask about it without
  ambiguity. No two words share a shown (first) meaning.
- `RELATED` groups (いえ/へや, ほん/えほん, たべもの/たべる/ごはん…) are never each other's Level 5
  distractors.
- Content: everyday beginner vocabulary (family, body, animals, food, nature, places, things,
  colours, common adjectives and verbs in dictionary form, numbers) and katakana loanwords and
  country names. The vocabulary overlaps heavily with JLPT N5 lists.

### Verification against JMdict

| Source | URL | Used for |
|--------|-----|----------|
| JMdict (Electronic Dictionary Research and Development Group), common-word subset, English | https://www.edrdg.org/jmdict/j_jmdict.html | Every word's reading and meanings. Licence: CC BY-SA 4.0 |
| jmdict-simplified 3.6.2 (JMdict dated 2026-10-19), `jmdict-eng-common` JSON | https://github.com/scriptin/jmdict-simplified | The machine-readable copy the check reads |

`node tools/check-words-jmdict.mjs <jmdict-eng-common.json>` looks up each word's exact kana among
JMdict readings and requires **every** meaning in `en` to equal one of those entries' glosses
(case-insensitive; parentheticals such as "(face) mask" or the app's "light (not heavy)" may be
dropped or kept). It exits 1 on any mismatch. The JSON is not kept in the repo; re-download it to
re-run the check.

Result on 2026-10-20: **310 of 310 words match.** Changes made to reach that, from the first run of
316 words:

- **Wording aligned with JMdict** (same sense, the app had paraphrased): のみもの drink, こめ rice,
  うどん udon, ぶどう grape, だいこん daikon, となり next to / adjacent, てぶくろ glove,
  すき liking / being fond of, きらい disliking / hating, へた unskillful / poor,
  ビル multi-storey building.
- **Removed, not in the common subset:** わに crocodile.
- **Removed, homonym of another common word** (Level 5 shows kana with no kanji to tell them
  apart): さん three (さん, the "Mr/Ms" suffix), くらい dark (くらい "about"), しめる to close (締める to
  tie), ふく clothes (吹く to blow), すむ to live (済む to finish).
- The script also prints a **homonym watch**: 74 kept words share a reading with a rarer common
  entry (きく to hear / 菊 chrysanthemum, あさ morning / 麻 hemp, いち one / 位置 position…). Those were
  judged clear enough for a beginner, since the kept meaning is by far the usual one.
