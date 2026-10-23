import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { startServer, sleep, HERE } from '../kd-driver.mjs';
export { sleep };
export const DIR = path.join(HERE, 'robust-runs');   // run output (gitignore it)

export function hardKill(proc) {
  try { proc.kill('SIGKILL'); } catch {}
}
export async function waitExit(proc) { if (proc.exitCode != null || proc.signalCode) return; await new Promise((r) => { proc.once('exit', r); setTimeout(r, 3000); }); }

export function sumAttempts(doc) {
  if (!doc || typeof doc !== 'object') return 0;
  let n = 0;
  for (const s of Object.values(doc.chars || {})) n += s.attempts || 0;
  for (const s of Object.values(doc.words || {})) n += s.attempts || 0;
  return n;
}

export function checkFile(f) {
  try {
    const t = fs.readFileSync(f, 'utf8');
    const v = JSON.parse(t);
    if (!v || typeof v !== 'object' || Array.isArray(v) || typeof v.version !== 'number') return { ok: false, why: 'shape' };
    return { ok: true, v };
  } catch (e) { return { ok: false, why: e.code === 'ENOENT' ? 'missing' : e.message.slice(0, 60) }; }
}

export function listDir(d) { try { return fs.readdirSync(d).sort(); } catch { return []; } }

// Page instrumentation: records every PUT and its result.
export const INSTRUMENT = `
(() => {
  const of = window.fetch.bind(window);
  const sum = (d) => { let n = 0; for (const s of Object.values(d.chars||{})) n += s.attempts||0; for (const s of Object.values(d.words||{})) n += s.attempts||0; return n; };
  window.__rb = { puts: 0, ok: 0, fail: 0, confirmed: -1, confirmedAt: 0, lastSent: -1, log: [] };
  window.fetch = async (url, opt = {}) => {
    if (opt.method === 'PUT') {
      let n = -1; try { n = sum(JSON.parse(opt.body)); } catch {}
      __rb.puts++; __rb.lastSent = n; const t0 = Date.now();
      try { const r = await of(url, opt); if (r.ok) { __rb.ok++; if (n > __rb.confirmed) { __rb.confirmed = n; __rb.confirmedAt = Date.now(); } } else { __rb.fail++; if (r.status===409) __rb.c409=(__rb.c409||0)+1; } __rb.log.push([n, r.status, Date.now()-t0]); return r; }
      catch (e) { __rb.fail++; __rb.log.push([n, 'ERR', Date.now()-t0]); throw e; }
    }
    if (String(url).includes('api/progress')) { let f = null; try { f = localStorage.getItem('__failGet'); } catch {} const c = Number(f||0); if (c > 0 && (!opt.method || opt.method === 'GET')) { localStorage.setItem('__failGet', String(c-1)); __rb.getFails = (__rb.getFails||0)+1; throw new TypeError('Failed to fetch (simulated)'); } }
    return of(url, opt);
  };
})();`;

export async function instrument(kd) {
  await kd.send('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT });
}

/** Answer one quiz prompt (correct unless wrong=true), then press Enter for next. Returns true if answered. */
export async function answerOne(kd, { wrong = false } = {}) {
  let s = await kd.state();
  if (s.phase === 'study') { await kd.key('Enter'); await sleep(250); s = await kd.state(); }
  if (s.phase !== 'quiz') return false;
  if (s.answered) { await kd.key('Enter'); await sleep(150); s = await kd.state(); if (s.phase !== 'quiz') return false; }
  if (s.typed) { await kd.type(wrong ? 'xq' : s.romaji); await kd.key('Enter'); }
  else {
    let i = s.options.findIndex((o) => o.id === s.answerId) + 1;
    if (wrong) i = (i % s.options.length) + 1;
    await kd.key(String(i));
  }
  await sleep(30);
  return true;
}

export async function memSum(kd) { return kd.js('return (() => { const d = window.__kanaDojo.store.get(); let n=0; for (const s of Object.values(d.chars||{})) n+=s.attempts||0; for (const s of Object.values(d.words||{})) n+=s.attempts||0; return n; })()'); }

export async function restart(port, dataDir, extraArgs = []) { return startServer({ port, dataDir, extraArgs }); }
