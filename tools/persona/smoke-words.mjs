// Smoke test for the Words tab script switch and per-kana charging of misread words:
//   node tools/persona/smoke-words.mjs
import fs from 'node:fs';
import path from 'node:path';
import { start, seed, sleep, HERE } from './kd-driver.mjs';

const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) process.exitCode = 1; };
const dir = path.join(HERE, 'smoke-words');
fs.rmSync(dir, { recursive: true, force: true });
const rows = ['a', 'k', 's', 't', 'n', 'h', 'm', 'r', 'wn'];
await seed(path.join(dir, 'data'), { hiragana: rows, katakana: rows });
const kd = await start({ name: 'smoke-words', serverPort: 4186, cdpPort: 9336 });
try {
  // the switch is visible on Words, and katakana shows only katakana words
  await kd.go('#/words');
  const toggleShown = await kd.js(`return !document.getElementById('script-toggle').hidden`);
  ok(toggleShown, 'the hiragana/katakana switch shows on the Words tab');
  await kd.click('#script-toggle [data-script="katakana"]'); await sleep(400);
  const kata = await kd.js(`return { h1: document.querySelector('main h1').textContent, chips: [...document.querySelectorAll('.word-chips .kana')].map((x) => x.textContent) }`);
  ok(/Katakana/.test(kata.h1), `heading follows the switch (${kata.h1})`);
  ok(kata.chips.length > 0 && kata.chips.every((c) => /^[\u30A0-\u30FF]+$/.test(c)), `only katakana words listed (${kata.chips.slice(0, 6).join(' ')} …)`);
  // a katakana Read lesson asks katakana words only
  await kd.click('[data-action="start-read"]'); await sleep(500);
  const asked = [];
  let charged = null;
  for (let i = 0; i < 6; i++) {
    const s = await kd.state();
    if (s.phase !== 'quiz') break;
    asked.push(s.kana);
    if (!charged && s.romaji.length >= 4) {
      // misread the last syllable: swap its consonant for another reading
      const { WORDS } = await import(new URL('file:///C:/Users/Jeremy/Documents/Projects/Claude/Kana Dojo/src/core/words.js').href);
      const w = WORDS.find((x) => x.kana === s.kana);
      const lastId = w.units[w.units.length - 1];
      const { kanaById } = await import(new URL('file:///C:/Users/Jeremy/Documents/Projects/Claude/Kana Dojo/src/core/kana.js').href);
      const lastRomaji = kanaById.get(lastId).romaji;
      const wrongRead = lastRomaji === 'ka' ? 'ta' : 'ka';
      const typed = w.units.slice(0, -1).map((id) => kanaById.get(id).romaji).join('') + wrongRead;
      const before = (await kd.progress()).chars[lastId]?.misses || 0;
      await kd.js(`document.getElementById('type-input').value = ${JSON.stringify(typed)}; document.getElementById('type-input').form.requestSubmit(); return 1`);
      await sleep(900);
      const after = (await kd.progress()).chars[lastId];
      charged = { word: s.kana, typed, kana: kanaById.get(lastId).char, before, after: after?.misses || 0, wrong: after?.wrong };
      await kd.click('#next-btn'); await sleep(500);
    } else {
      await kd.js(`document.getElementById('type-input').value = ${JSON.stringify(s.romaji)}; document.getElementById('type-input').form.requestSubmit(); return 1`);
      await sleep(1400);
    }
  }
  ok(asked.length > 0 && asked.every((c) => /^[\u30A0-\u30FF]+$/.test(c)), `the lesson asked katakana words only (${asked.join(' ')})`);
  ok(charged && charged.after === charged.before + 1, `misreading ${charged?.word} as "${charged?.typed}" charged ${charged?.kana} one miss (${charged?.before} → ${charged?.after})`);
  ok(charged && charged.wrong && Object.keys(charged.wrong).length > 0, `the misreading is recorded as what was read (${JSON.stringify(charged?.wrong)})`);
  // Stats shows the charged kana's miss
  await kd.key('Escape'); await sleep(300);
  await kd.js(`document.querySelector('[data-leave="end"]')?.click(); return 1`); await sleep(300);
  await kd.go('#/stats');
  await kd.click('[data-script-tab="katakana"]'); await sleep(300);
  const cell = await kd.js(`const c = [...document.querySelectorAll('.heat .cell')].find((x) => x.textContent.includes(${JSON.stringify(charged?.kana || '')})); return c ? c.getAttribute('aria-label') : null`);
  ok(cell && /of 1|of \d/.test(cell) && !/not seen/.test(cell), `Stats shows the charged kana as seen (${cell})`);
  ok(kd.consoleErrors.length === 0, `no console errors (${kd.consoleErrors.join(' | ')})`);
} finally { await kd.stop(); }
