// Outbox attacks that look for double counts: a save in flight when leaving, a lost reply, two loads at
// once, bfcache, and a stale outbox entry whose save id has dropped out of the server's last 20.
import { boot, answer, toQuiz, outboxKeys, settle, sleep } from './oblib.mjs';
const which = process.argv[2] || 'inflight';
const N = Number(process.argv[3] || 5);
const env = await boot('ob2-' + which, { big: process.argv[4] === 'big' });
const rows = [];
const row = (r) => { rows.push(r); console.log(JSON.stringify(r)); };
try {
  const C = await env.tab(); const I = await env.tab(); await I.leave(env.base + 'api/health'); await sleep(300);
  const drain = async () => { await C.go('#/learn'); const s = await settle(env); await C.leave(); await sleep(200); return s; };
  for (let t = 0; t < N; t++) {
    let B = null; if (which === 'stale') { B = await env.tab(); await B.go('#/learn'); await toQuiz(B); await settle(env); }
    const A = await env.tab();
    await A.go('#/learn'); await toQuiz(A);
    const s0 = await settle(env);
    let given = 0, other = 0; const info = {};

    if (which === 'inflight' || which === 'lostreply') {
      // hold the reply of A's next save (it has already been written by the server)
      await A.send('Fetch.enable', { patterns: [{ urlPattern: '*api/progress*', requestStage: 'Response' }] });
      let held = null; const seen = [];
      A.on((m) => { if (m.method !== 'Fetch.requestPaused') return; const p = m.params; seen.push(`${p.request.method}:${p.responseStatusCode}`);
        if (p.request.method === 'PUT' && !held) held = p.requestId; else A.send('Fetch.continueRequest', { requestId: p.requestId }); });
      for (let i = 0; i < 2; i++) if (await answer(A)) given++;
      for (let i = 0; i < 40 && !held; i++) await sleep(25);
      info.held = !!held; info.diskWhileHeld = (await env.served()) - s0;
      if (which === 'lostreply') { await env.kill(); await A.send('Fetch.failRequest', { requestId: held, errorReason: 'ConnectionReset' }); await sleep(300); }
      if (await answer(A)) given++;                                // one more answer, then leave at once
      await A.leave(); await sleep(400);
      if (which === 'inflight') await A.send('Fetch.continueRequest', { requestId: held }).catch(() => {});
      info.paused = seen.join(',');
      if (which === 'lostreply') { await sleep(300); await env.restart(); }
      await sleep(600); info.outbox = await outboxKeys(I); info.beforeDrain = (await settle(env, 4000)) - s0;
    }

    if (which.startsWith('natural')) {
      if (which === 'natural-lan') { await A.send('Network.enable'); await A.send('Network.emulateNetworkConditions', { offline: false, latency: 120, downloadThroughput: -1, uploadThroughput: -1 }); }  // no interception: leave d ms after the last answer (around the 250 ms save delay)
      const d = which === 'natural-lan' ? 200 + (t * 13) % 260 : 230 + (t * 7) % 110; info.d = d;
      for (let i = 0; i < 2; i++) if (await answer(A)) given++;
      await sleep(d); await A.leave(); await sleep(500);
      info.outbox = await outboxKeys(I);
    }

    if (which === 'tworeload') {  // an unlanded outbox entry, then two page loads at the same moment
      for (let i = 0; i < 2; i++) if (await answer(A)) given++;
      await env.kill(); await A.leave(); await sleep(400); await env.restart();
      info.outbox = await outboxKeys(I);
      const D = await env.tab();
      await Promise.all([C.send('Page.navigate', { url: env.base + '#/learn' }), D.send('Page.navigate', { url: env.base + '#/learn' })]);
      await Promise.all([C.ready(), D.ready()]); info.afterBoth = (await settle(env)) - s0;
      await D.leave(); await sleep(200); await D.close(); await C.leave(); await sleep(200);
    }

    if (which.startsWith('bfcache')) {  // leave to another page of the same site, then Back
      for (let i = 0; i < 2; i++) if (await answer(A)) given++;
      if (which !== 'bfcache-up') await env.kill();
      await A.leave(env.base + 'api/health'); await sleep(500);
      info.outbox = await outboxKeys(I);
      if (which === 'bfcache-otherload') { await env.restart(); await C.go('#/learn'); await settle(env); await C.leave(); await sleep(200); info.afterOtherLoad = (await env.served()) - s0; }
      const h = await A.send('Page.getNavigationHistory');
      const e = h.result.entries[h.result.currentIndex - 1];
      await A.send('Page.navigateToHistoryEntry', { entryId: e.id }); await sleep(800);
      if (which === 'bfcache-down') { await sleep(500); await env.restart(); await sleep(5600); }
      info.restoredFromBfcache = await A.js('return __ev.show.join()');
      info.hidePersisted = await A.js('return __ev.hide.join()');
      info.afterBack = (await settle(env)) - s0;
      info.memA = await A.mem();
    }

    if (which === 'stale') {   // A leaves quickly (its save lands); tab B, open all along, then saves 22 times
      for (let i = 0; i < 2; i++) if (await answer(A)) given++;
      await A.leave(); await sleep(500);
      info.outbox = await outboxKeys(I); info.afterLeave = (await env.served()) - s0;
      for (let i = 0; i < 22; i++) { if (await answer(B)) other++; await sleep(330); }
      await settle(env);
      const ids = (await env.doc()).saveIds || []; info.nIds = ids.length;
      await B.leave(); await sleep(200); await B.close();
    }

    const s1 = which === 'tworeload' ? await settle(env) : await drain();
    const d = s1 - s0;
    if (!which.startsWith('bfcache')) await A.close(); else { await A.leave(); await sleep(300); await A.close(); }
    const s2 = await settle(env);
    row({ t, given, other, ...info, delta: d, final: s2 - s0, lost: Math.max(0, given + other - (s2 - s0)), over: Math.max(0, s2 - s0 - given - other), outboxLeft: await outboxKeys(I) });
  }
} finally {
  await env.stop();
  const sum = (k) => rows.reduce((a, r) => a + (r[k] || 0), 0);
  console.log('SUMMARY', which, JSON.stringify({ trials: rows.length, given: sum('given') + sum('other'), lost: sum('lost'), lostTrials: rows.filter((r) => r.lost).length, over: sum('over'), overTrials: rows.filter((r) => r.over).length }));
}
