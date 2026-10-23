// Smoke test for several learners on one machine:   node tools/persona/smoke-profiles.mjs
import fs from 'node:fs';
import path from 'node:path';
import { start, sleep, HERE } from './kd-driver.mjs';

const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) process.exitCode = 1; };
const dir = path.join(HERE, 'smoke-profiles');
fs.rmSync(dir, { recursive: true, force: true });
const kd = await start({ name: 'smoke-profiles', serverPort: 4182, cdpPort: 9332 });
const attempts = (p) => Object.values(p?.chars || {}).reduce((n, c) => n + c.attempts, 0);
const profiles = async () => (await (await fetch(kd.base + 'api/profiles')).json()).profiles;
const progressOf = async (id) => (await fetch(kd.base + `api/progress?profile=${id}`)).json();
// the learner button during a lesson asks "End this lesson?" (as any navigation does): end it
const toProfiles = async () => {
  await kd.click('#profile-btn'); await sleep(300);
  if (await kd.js(`return document.getElementById('leave-dialog').open`)) { await kd.click('[data-leave="end"]'); await sleep(500); }
};
const answerOne = async () => {
  await kd.go('#/learn'); await sleep(300);
  await kd.click('[data-action="start"]'); await sleep(300);
  await kd.click('[data-action="start-quiz"]'); await sleep(300);
  const s = await kd.state();
  await kd.key(String(s.options.findIndex((o) => o.id === s.answerId) + 1)); await sleep(900);
};
// accept the "Remove …?" confirm
kd.ws.addEventListener('message', (ev) => { const m = JSON.parse(ev.data); if (m.method === 'Page.javascriptDialogOpening') kd.send('Page.handleJavaScriptDialog', { accept: true }); });
try {
  await kd.go('#/learn');
  const first = await kd.js(`return { h1: document.querySelector('main h1')?.textContent, label: document.querySelector('.profile-add label')?.textContent, bar: document.getElementById('profile-btn').hidden }`);
  ok(first.h1 === "Who's practising?" && /Your name/.test(first.label), `a fresh install asks for a name first (${first.h1} / ${first.label})`);
  ok(first.bar === true, 'no learner shown in the top bar yet');

  await kd.click('#new-profile'); await kd.type('Ana'); await kd.key('Enter'); await sleep(1200);
  const ana = (await profiles()).find((p) => p.name === 'Ana');
  const afterAdd = await kd.js(`return { h1: document.querySelector('main h1')?.textContent, bar: document.querySelector('#profile-btn .profile-label').textContent }`);
  ok(ana && /Learn/.test(afterAdd.h1) && afterAdd.bar === 'Ana', `adding Ana opens Learn as Ana (${afterAdd.h1}, bar: ${afterAdd.bar})`);
  await answerOne();
  ok(attempts(await progressOf(ana.id)) === 1, 'Ana\'s answer is saved to Ana');

  await toProfiles();
  await kd.click('#new-profile'); await kd.type('Ben'); await kd.key('Enter'); await sleep(1200);
  const ben = (await profiles()).find((p) => p.name === 'Ben');
  const benHome = await kd.js(`return { welcome: !!document.querySelector('.welcome'), bar: document.querySelector('#profile-btn .profile-label').textContent }`);
  ok(ben && benHome.welcome && benHome.bar === 'Ben', 'Ben starts fresh (welcome screen) with his own name in the bar');
  await answerOne(); await answerOne();
  ok(attempts(await progressOf(ben.id)) === 2 && attempts(await progressOf(ana.id)) === 1, 'Ben\'s answers go to Ben; Ana still has 1');

  await toProfiles();
  await kd.click(`[data-act="pick"][data-id="${ana.id}"]`); await sleep(1500);
  const back = await kd.js(`return { welcome: !!document.querySelector('.welcome'), bar: document.querySelector('#profile-btn .profile-label').textContent }`);
  ok(!back.welcome && back.bar === 'Ana', 'switching back to Ana shows her progress');
  await kd.go('#/learn'); await sleep(500);
  ok((await kd.js(`return document.querySelector('#profile-btn .profile-label').textContent`)) === 'Ana', 'the chosen learner is remembered across a reload');

  await toProfiles();
  await kd.click(`[data-act="rename"][data-id="${ana.id}"]`); await sleep(200);
  await kd.js(`const i = document.getElementById('rename-${ana.id}'); i.value = 'Ana Maria'; i.form.requestSubmit(); return 1`); await sleep(700);
  ok((await profiles()).some((p) => p.name === 'Ana Maria'), 'rename works');
  ok((await kd.js(`return document.querySelector('#profile-btn .profile-label').textContent`)) === 'Ana Maria', 'the top bar follows a rename of the current learner');

  await kd.click(`[data-act="remove"][data-id="${ben.id}"]`); await sleep(900);
  ok(!(await profiles()).some((p) => p.id === ben.id), 'remove takes Ben off the list');
  ok(fs.readdirSync(path.join(kd.dataDir, 'deleted-profiles')).length === 1, 'Ben\'s progress is kept in deleted-profiles');

  await kd.viewport(375, 812); await kd.go('#/profiles'); await sleep(400);
  ok((await kd.js(`return document.documentElement.scrollWidth - innerWidth`)) === 0, 'no sideways scroll at 375 px');
  await kd.shot(path.join(dir, 'profiles-375.png'));
  await kd.viewport(1280, 800); await kd.go('#/profiles'); await sleep(400);
  await kd.shot(path.join(dir, 'profiles-1280.png'));
  ok(kd.consoleErrors.length === 0, `no console errors (${kd.consoleErrors.join(' | ')})`);
} finally { await kd.stop(); }
