// Smoke test for the round-1 persistence fixes, through a real browser:
//   node tools/persona/smoke-persistence.mjs
// 1. boot + one answer; 2. a save from "another tab" in between → the next save merges, nothing lost;
// 3. the first /api/progress load fails → nothing is saved over the real file, and once the load
//    succeeds the answers given meanwhile are merged into the real progress.
import fs from 'node:fs';
import path from 'node:path';
import { start, seed, sleep, HERE } from './kd-driver.mjs';

// With profiles, a seeded data folder becomes the learner's profile on first start: read and write there.
async function learnerUrl(kd) {
  const { profiles } = await (await fetch(kd.base + 'api/profiles')).json();
  return kd.base + `api/progress?profile=${profiles[0].id}`;
}
async function learnerFile(kd) {
  const { profiles } = await (await fetch(kd.base + 'api/profiles')).json();
  return path.join(kd.dataDir, 'profiles', profiles[0].id, 'progress.json');
}
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) process.exitCode = 1; };
const dir = path.join(HERE, 'smoke-persistence');
fs.rmSync(dir, { recursive: true, force: true });

// --- 1 + 2: conflict merge
await seed(path.join(dir, 'a', 'data'), { hiragana: ['a', 'k'] });
let kd = await start({ name: 'smoke-persistence/a', serverPort: 4187, cdpPort: 9337 });
try {
  await kd.go('#/recall');
  await kd.key('Enter'); await sleep(400);
  let s = await kd.state();
  ok(s.phase === 'quiz' && !s.gateOpen && !s.revealedRomaji, 'quiz prompt shows with nothing revealed');
  await kd.key(String(s.options.findIndex((o) => o.id === s.answerId) + 1)); await sleep(700);
  const before = await kd.progress();
  // another tab saves a lesson the first tab hasn't seen
  const url = await learnerUrl(kd);
  const rev = Number((await fetch(url)).headers.get('x-progress-rev'));
  const other = { ...before, lessons: [...before.lessons, { id: 'other-tab', kind: 'set', script: 'hiragana', level: 1, sets: ['hiragana:k'], startedAt: Date.now(), endedAt: Date.now(), result: 'passed', prompts: 5, correct: 5, missedIds: [] }] };
  const put = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': String(rev) }, body: JSON.stringify(other) });
  ok(put.status === 200, 'the other tab saved');
  await sleep(1300);
  s = await kd.state();
  if (s.phase === 'quiz' && !s.answered) { await kd.key(String(s.options.findIndex((o) => o.id === s.answerId) + 1)); await sleep(800); }
  const after = await kd.progress();
  const attempts = (p) => Object.values(p.chars).reduce((n, c) => n + c.attempts, 0);
  ok(after.lessons.some((l) => l.id === 'other-tab'), 'the other tab\'s lesson survived this tab\'s save');
  ok(attempts(after) === attempts(before) + 1, `this tab's new answer is saved too (${attempts(before)} → ${attempts(after)})`);
  ok(kd.consoleErrors.length === 0, `no console errors (${kd.consoleErrors.join(' | ')})`);
} finally { await kd.stop(); }

// --- 3: failed first load
await seed(path.join(dir, 'b', 'data'), { hiragana: ['a', 'k', 's', 't'], katakana: ['a'] });
const realBefore = JSON.parse(fs.readFileSync(path.join(dir, 'b', 'data', 'progress.json'), 'utf8'));
kd = await start({ name: 'smoke-persistence/b', serverPort: 4188, cdpPort: 9338 });
try {
  // fail every /api/progress GET until released
  let blocking = true;
  await kd.send('Fetch.enable', { patterns: [{ urlPattern: '*api/progress*', requestStage: 'Request' }] });
  kd.send.onPaused = null;
  const pausedHandler = async (m) => {
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    if (blocking && request.method === 'GET') await kd.send('Fetch.failRequest', { requestId, errorReason: 'ConnectionRefused' });
    else await kd.send('Fetch.continueRequest', { requestId });
  };
  const ws = kd.ws;
  if (!ws) throw new Error('driver must expose ws');
  ws.addEventListener('message', (ev) => pausedHandler(JSON.parse(ev.data)));
  await kd.go('#/learn'); await sleep(3000);
  const banner = await kd.js(`return document.getElementById('banner').hidden ? null : document.getElementById('banner').textContent`);
  ok(/nothing is being saved/.test(banner || ''), `banner says nothing is saved (${banner})`);
  // play: answer a few things and toggle mute (both used to save the empty doc over the real file)
  await kd.click('#mute-btn'); await sleep(400);
  await kd.key('Enter'); await sleep(300); await kd.key('Enter'); await sleep(400);
  const s = await kd.state();
  if (s.phase === 'quiz') { await kd.key(String(s.options.findIndex((o) => o.id === s.answerId) + 1)); await sleep(600); }
  const onDisk = JSON.parse(fs.readFileSync(await learnerFile(kd), 'utf8'));
  ok(Object.keys(onDisk.sets).length === Object.keys(realBefore.sets).length, `real progress untouched while unloaded (sets ${Object.keys(onDisk.sets).length})`);
  blocking = false;
  await sleep(4500);   // the retry runs every 3 s
  const merged = await kd.progress();
  ok(Object.keys(merged.sets).length >= Object.keys(realBefore.sets).length, `after the late load the real rows are kept (${Object.keys(merged.sets).length})`);
  ok(merged.settings.muted === true, 'the mute toggled while unloaded was merged in');
  const banner2 = await kd.js(`return document.getElementById('banner').hidden`);
  ok(banner2 === true, 'banner cleared once loaded');
} finally { await kd.stop(); }

// --- 4: a save that landed but whose reply was lost must not be counted twice
await seed(path.join(dir, 'c', 'data'), { hiragana: ['a', 'k'] });
kd = await start({ name: 'smoke-persistence/c', serverPort: 4189, cdpPort: 9339 });
try {
  let dropNext = false;
  await kd.send('Fetch.enable', { patterns: [{ urlPattern: '*api/progress*', requestStage: 'Response' }] });
  kd.ws.addEventListener('message', async (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    if (dropNext && request.method === 'PUT') { dropNext = false; await kd.send('Fetch.failRequest', { requestId, errorReason: 'ConnectionReset' }); }
    else await kd.send('Fetch.continueRequest', { requestId });
  });
  await kd.go('#/recall');
  await kd.key('Enter'); await sleep(400);
  const answer = async () => { const s = await kd.state(); if (s.phase === 'quiz' && !s.answered) { await kd.key(String(s.options.findIndex((o) => o.id === s.answerId) + 1)); await sleep(1300); } };
  await answer(); await sleep(400);
  const attempts = (p) => Object.values(p.chars).reduce((n, c) => n + c.attempts, 0);
  const before = attempts(await kd.progress());
  dropNext = true;
  await answer();                     // this save reaches the server, but its reply is dropped
  await sleep(600);
  ok(attempts(await kd.progress()) === before + 1, 'the dropped-reply save did land on the server');
  await sleep(5500);                  // the tab retries after 5 s: 409, sees its save id, merges without double counting
  await answer(); await sleep(800);
  const after = attempts(await kd.progress());
  ok(after === before + 2, `no double count after the lost reply (${before} → ${after}, expected ${before + 2})`);
  const tabTotal = await kd.js(`return Object.values(window.__kanaDojo.store.get().chars).reduce((n, c) => n + c.attempts, 0)`);
  ok(tabTotal === after, `the tab agrees with the server (${tabTotal})`);
} finally { await kd.stop(); }

// --- 5: answer, then leave the page at once while another tab has saved since (the last-moment save
//        conflicts after the page is gone): the outbox brings the answer back on the next load
await seed(path.join(dir, 'd', 'data'), { hiragana: ['a', 'k'] });
kd = await start({ name: 'smoke-persistence/d', serverPort: 4183, cdpPort: 9333 });
try {
  const attempts = (p) => Object.values(p.chars).reduce((n, c) => n + c.attempts, 0);
  let lost = 0;
  for (let trial = 0; trial < 4; trial++) {
    await kd.go('#/recall');
    await kd.key('Enter'); await sleep(400);
    const before = attempts(await kd.progress());
    // another tab saves (bumps the revision this page knows)
    const url = await learnerUrl(kd);
    const g = await fetch(url);
    const rev = g.headers.get('x-progress-rev');
    const doc = await g.json();
    await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': rev }, body: JSON.stringify({ ...doc, settings: { ...doc.settings, theme: trial % 2 ? 'dark' : 'light' } }) });
    const s = await kd.state();
    await kd.key(String(s.options.findIndex((o) => o.id === s.answerId) + 1));
    await sleep(30);
    await kd.go('#/learn');                       // leaves within 30 ms: the outbox must carry the answer
    await sleep(1500);
    const after = attempts(await kd.progress());
    if (after !== before + 1) lost++;
  }
  ok(lost === 0, `answer then leave at once, with another tab's save in between: ${lost} of 4 lost`);
  const left = await kd.js(`return Object.keys(localStorage).filter((k) => k.startsWith('kd-outbox-')).length`);
  ok(left === 0, `outbox emptied after merging (${left} left)`);
} finally { await kd.stop(); }
