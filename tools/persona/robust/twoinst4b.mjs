// Same-port simultaneous starts (double-clicked launcher; normal + LAN launcher at once).
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process';
import { DIR, sleep } from './lib.mjs'; import { ROOT } from '../kd-driver.mjs';
const d = path.join(DIR, 'data-twoinst4b'); const procs = new Set();
function run(port, extra = []) { const p = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(port), '--data-dir', d, '--no-open', ...extra], { cwd: ROOT }); procs.add(p); let out = ''; p.stdout.on('data', (x) => (out += x)); p.stderr.on('data', (x) => (out += x)); const exited = new Promise((r) => p.on('exit', (c) => r(c))); return { p, out: () => out.trim().replace(/\n/g, ' / '), exited, alive: () => p.exitCode == null && p.signalCode == null }; }
const kill = async (x) => { if (x.alive()) { x.p.kill('SIGKILL'); await x.exited; } };
try {
  for (const [label, ea, eb] of [['same port, both default', [], []], ['same port, default + --lan', [], ['--lan']]]) {
    let both = 0; const outs = {}; const N = 15;
    for (let t = 0; t < N; t++) {
      fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true });
      const a = run(4198, ea), b = run(4198, eb); await sleep(2500);
      if (a.alive() && b.alive()) { both++; const k = (a.out().match(/running at \S+/) || ['?'])[0] + ' & ' + (b.out().match(/running at \S+|already running/) || ['?'])[0]; outs[k] = (outs[k] || 0) + 1; }
      else { const k = `a ${a.alive() ? 'up' : 'exit ' + a.p.exitCode} b ${b.alive() ? 'up' : 'exit ' + b.p.exitCode}`; outs[k] = (outs[k] || 0) + 1; }
      await kill(a); await kill(b);
    }
    console.log(label, `x${N}: both alive ${both}`, JSON.stringify(outs));
  }
} finally { for (const p of procs) try { p.kill('SIGKILL'); } catch {} }
