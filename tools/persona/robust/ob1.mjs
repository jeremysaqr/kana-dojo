// Outbox: leave the page right after answering (inside the 250 ms save delay), in several situations.
// Each trial: tab A answers 1-3 and leaves at once; then a fresh page load in tab C drains the outbox.
// Served attempts must grow by exactly the answers given (A's plus B's).
import { boot, answer, toQuiz, outboxKeys, settle, sleep } from './oblib.mjs';
const which = process.argv[2] || 'up';           // up | close | down | between | blocked | blocked-between | reload
const N = Number(process.argv[3] || 8);
const env = await boot('ob1-' + which, { big: process.argv[4] === 'big' });
const rows = [];
try {
  const blocked = which.startsWith('blocked');
  const C = await env.tab(); const I = await env.tab(); await I.leave(env.base + 'api/health'); await sleep(300);
  const B = which.includes('between') ? await env.tab({ blockStorage: blocked }) : null;
  if (B) await B.go('#/learn');
  for (let t = 0; t < N; t++) {
    const A = await env.tab({ blockStorage: blocked });
    await A.go('#/learn'); await toQuiz(A);
    if (B) { await toQuiz(B); }
    const s0 = await settle(env);
    let given = 0, otherGiven = 0;
    if (B) { if (await answer(B)) otherGiven++; await sleep(600); }   // B's save lands: A's revision is now stale
    const k = 1 + (t % 3);
    for (let i = 0; i < k; i++) if (await answer(A, { wrong: i === 1 })) given++;
    if (which === 'down') await env.kill();
    const evBefore = await A.js('return { kaErr: __ev.kaErr }');
    if (which === 'close') await A.close();
    else if (which === 'reload') { await A.send('Page.reload'); }
    else await A.leave();
    await sleep(800);
    const ob = await outboxKeys(I);
    if (which === 'down') { await sleep(300); await env.restart(); }
    let afterLeave = await settle(env, 4000);
    // a later page load (tab C) drains the outbox
    if (which !== 'reload') { await C.go('#/learn'); } else { await A.ready(); }
    const s1 = await settle(env);
    const obAfter = await outboxKeys(I);
    const d = s1 - s0;
    rows.push({ t, given, otherGiven, outboxAfterLeave: ob, servedAfterLeave: afterLeave - s0, delta: d, lost: Math.max(0, given + otherGiven - d), over: Math.max(0, d - given - otherGiven), outboxLeft: obAfter });
    if (which !== 'close' && which !== 'reload') await A.close();
    if (which === 'reload') { await A.leave(); await sleep(300); await A.close(); }
    await C.leave(); await sleep(200);
    if (B) await B.go('#/learn');
  }
} finally {
  await env.stop();
  for (const r of rows) console.log(JSON.stringify(r));
  const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
  console.log('SUMMARY', which, JSON.stringify({ trials: rows.length, given: sum('given') + sum('otherGiven'), lost: sum('lost'), lostTrials: rows.filter((r) => r.lost).length, over: sum('over'), overTrials: rows.filter((r) => r.over).length }));
}
