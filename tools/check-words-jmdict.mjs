// Check every word in src/core/words.js against JMdict (common-word subset).
//
//   node tools/check-words-jmdict.mjs <path to jmdict-eng-common-*.json>
//
// Get the JSON from the jmdict-simplified releases (https://github.com/scriptin/jmdict-simplified),
// asset `jmdict-eng-common-<version>.json.tgz`. JMdict © EDRDG, CC BY-SA 4.0. The file is not
// stored in this repo.
//
// For each word: the JMdict entries with exactly that kana reading must exist, and every meaning in
// `en` must equal one of those entries' English glosses (case-insensitive; a parenthetical may be
// dropped or kept on either side, so "(face) mask" matches "mask" and "face mask"). Readings that other common
// entries share are listed as a homonym watch (information only). Exit code 1 on any mismatch.
import fs from 'node:fs';
import { WORDS } from '../src/core/words.js';

const jmPath = process.argv[2];
if (!jmPath) { console.error('usage: node tools/check-words-jmdict.mjs <jmdict-eng-common.json>'); process.exit(2); }
const jm = JSON.parse(fs.readFileSync(jmPath, 'utf8'));

const byReading = new Map();
for (const e of jm.words) for (const k of e.kana) {
  if (!byReading.has(k.text)) byReading.set(k.text, []);
  byReading.get(k.text).push(e);
}

const clean = (s) => s.toLowerCase().replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ').trim();
/** A gloss's accepted forms: parentheticals removed (nested too), and parentheses simply unwrapped. */
function forms(gloss) {
  let dropped = gloss;
  while (/\([^()]*\)/.test(dropped)) dropped = dropped.replace(/\([^()]*\)/g, '');
  return new Set([clean(dropped), clean(gloss.replace(/[()]/g, ''))]);
}
const glossesOf = (e) => e.sense.flatMap((s) => s.gloss.map((g) => g.text));
const label = (e) => `${(e.kanji[0] || e.kana[0]).text}: ${glossesOf(e).slice(0, 4).join('; ')}`;

let bad = 0;
const watch = [];
for (const w of WORDS) {
  const entries = byReading.get(w.kana) || [];
  if (!entries.length) { bad++; console.log(`NO ENTRY  ${w.kana} [${w.en.join(', ')}]`); continue; }
  // the app's own clarifying parentheticals ("right (side)") are treated the same way
  const hits = (m) => entries.filter((e) => glossesOf(e).some((g) => { const gf = forms(g); return [...forms(m)].some((f) => gf.has(f)); }));
  const missing = w.en.filter((m) => hits(m).length === 0);
  if (missing.length) {
    bad++;
    console.log(`MISMATCH  ${w.kana} [${w.en.join(', ')}]: not a gloss: ${missing.join(', ')}`);
    for (const e of entries) console.log(`            ${label(e)}`);
    continue;
  }
  const others = entries.filter((e) => !hits(w.en[0]).includes(e));
  if (others.length) watch.push(`  ${w.kana} [${w.en[0]}] also: ${others.map(label).join(' | ')}`);
}
console.log(`\nJMdict ${jm.version} (${jm.dictDate}): ${WORDS.length - bad} of ${WORDS.length} words match.`);
console.log(`\nHomonym watch (other common entries share the reading; information only): ${watch.length}`);
for (const line of watch) console.log(line);
process.exitCode = bad ? 1 : 0;
