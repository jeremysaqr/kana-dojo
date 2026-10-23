// C re-check with real `node server.js` processes: port-clash path, simultaneous starts, stale locks.
import fs from 'node:fs'; import path from 'node:path'; import http from 'node:http'; import net from 'node:net';
import { spawn } from 'node:child_process';
import { DIR, sleep } from './lib.mjs';
import { ROOT } from '../kd-driver.mjs';
const d = path.join(DIR, 'data-twoinst4');
const procs = new Set();
function run(port, extra = []) {
  const p = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(port), '--data-dir', d, '--no-open', ...extra], { cwd: ROOT });
  procs.add(p); let out = ''; p.stdout.on('data', (x) => (out += x)); p.stderr.on('data', (x) => (out += x));
  const exited = new Promise((r) => p.on('exit', (c) => r(c)));
  return { p, out: () => out.trim().replace(/\n/g, ' / '), exited, alive: () => p.exitCode == null && p.signalCode == null };
}
const kill = async (x) => { if (x.alive()) { x.p.kill('SIGKILL'); await x.exited; } };
const health = async (port) => { try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); return r.ok; } catch { return false; } };
async function up(x, port, ms = 6000) { const t = Date.now(); while (Date.now() - t < ms) { if (!x.alive()) return false; if (await health(port)) return true; await sleep(50); } return false; }
const reset = () => { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); };
try {
  // 1. round-3 path: instance 1 is pushed from 4198 to 4199 by another program; the blocker exits; instance 2 on 4198
  reset();
  const blocker = http.createServer((q, r) => r.end('other app')).listen(4198, '127.0.0.1'); await sleep(200);
  const i1 = run(4198); await up(i1, 4199);
  await new Promise((r) => blocker.close(r));
  const i2 = run(4198); const c2 = await Promise.race([i2.exited, sleep(5000).then(() => 'still running')]);
  console.log('1 port-clash path: instance 2 exit', c2, '|', i2.out().slice(0, 120));
  await kill(i1); await kill(i2);

  // 2. both started at the same instant, different ports, same data folder
  let both = 0; const ex = [];
  const N = Number(process.argv[2] || 20);
  for (let t = 0; t < N; t++) {
    reset();
    const a = run(4198), b = run(4199);
    await Promise.all([up(a, 4198, 4000), up(b, 4199, 4000)]); await sleep(300);
    const aa = a.alive() && await health(4198), bb = b.alive() && await health(4199);
    if (aa && bb) { both++; if (ex.length < 2) ex.push({ t, lock: fs.readFileSync(path.join(d, 'server.lock'), 'utf8'), a: a.out().slice(0, 60), b: b.out().slice(0, 60) }); }
    await kill(a); await kill(b);
  }
  console.log(`2 simultaneous start x${N}: both serving in ${both}`, JSON.stringify(ex));
  // 2b: what two live instances do to answers
  if (both) {
    let got = null;
    for (let t = 0; t < 30 && !got; t++) { reset(); const a = run(4198), b = run(4199); await Promise.all([up(a, 4198, 4000), up(b, 4199, 4000)]); if (a.alive() && b.alive() && await health(4198) && await health(4199)) got = [a, b]; else { await kill(a); await kill(b); } }
    if (got) {
      const u = (p) => `http://127.0.0.1:${p}/api/progress`;
      async function save(p, key) { for (let k = 0; k < 5; k++) { const g = await fetch(u(p)); const doc = (await g.json()) || { version: 1, c: {} }; doc.c = { ...(doc.c || {}) }; doc.c[key] = (doc.c[key] || 0) + 1; delete doc.rev; delete doc.saveIds;
        const r = await fetch(u(p), { method: 'PUT', headers: { 'content-type': 'application/json', 'if-match': g.headers.get('x-progress-rev'), 'x-save-id': key + Date.now() }, body: JSON.stringify(doc) }); if (r.ok) return; } }
      for (let i = 0; i < 10; i++) { await save(4198, 'A'); await save(4199, 'B'); }
      console.log('2b given A=10 B=10 | file', JSON.stringify(JSON.parse(fs.readFileSync(path.join(d, 'progress.json'))).c));
      await kill(got[0]); await kill(got[1]);
    }
  }

  // 3. stale lock from a dead pid
  reset(); fs.writeFileSync(path.join(d, 'server.lock'), JSON.stringify({ pid: 999999, port: 4199 }));
  let t0 = Date.now(); const s3 = run(4198); console.log('3 dead-pid lock: serving', await up(s3, 4198), Date.now() - t0, 'ms'); await kill(s3);
  // 4. lock naming a live non-Kana process (this test runner) and a silent port
  const silent = net.createServer(() => {}).listen(4199, '127.0.0.1'); await sleep(100);
  fs.writeFileSync(path.join(d, 'server.lock'), JSON.stringify({ pid: process.pid, port: 4199 }));
  t0 = Date.now(); const s4 = run(4198); const ok4 = await up(s4, 4198, 30000); console.log('4 live non-Kana pid + silent port lock: serving', ok4, Date.now() - t0, 'ms', s4.out().slice(0, 100)); await kill(s4); silent.close();
  // 5. garbage lock file
  fs.writeFileSync(path.join(d, 'server.lock'), '{not json'); t0 = Date.now(); const s5 = run(4198); console.log('5 garbage lock: serving', await up(s5, 4198), Date.now() - t0, 'ms'); await kill(s5);
} finally { for (const p of procs) try { p.kill('SIGKILL'); } catch {} }
