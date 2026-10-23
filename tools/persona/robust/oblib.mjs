// Outbox harness: one server, one headless Edge, several tabs (shared localStorage), answer counting.
import fs from 'node:fs'; import path from 'node:path';
import { start, seed } from '../kd-driver.mjs';
import { DIR, sleep, sumAttempts, hardKill, waitExit, restart } from './lib.mjs';
export { sleep, sumAttempts };
export const PORT = 4196, CDP = 9346;

export async function boot(name, { big = false } = {}) {
  const data = path.join(DIR, 'data-' + name);
  fs.rmSync(data, { recursive: true, force: true });
  await seed(data, { hiragana: ['a', 'k', 's', 't', 'n', 'h', 'm'] });
  if (big) { // a long-time learner: every kana answered, long history, 500 lessons (> 64 KB body)
    const { KANA } = await import('file:///C:/Users/Jeremy/Documents/Projects/Claude/Kana Dojo/src/core/kana.js');
    const f = path.join(data, 'progress.json'); const doc = JSON.parse(fs.readFileSync(f)); const t = Date.now() - 86400e3;
    for (const k of KANA) doc.chars[k.id] = { attempts: 20, correct: 18, misses: 2, streak: 3, lastSeen: t, ewmaErr: 0.1, history: Array.from({ length: 20 }, (_, i) => ({ t: t + i, ok: i % 10 !== 0, given: k.romaji, level: 1 })), wrong: {} };
    for (let i = 0; i < 400; i++) doc.lessons.push({ id: 'old' + i, kind: 'set', script: 'hiragana', level: 1, sets: ['hiragana:a'], startedAt: t + i, endedAt: t + i, result: 'passed', prompts: 5, correct: 5, missedIds: [] });
    fs.writeFileSync(f, JSON.stringify(doc));
  }
  const kd = await start({ name: 'robust4', serverPort: PORT, cdpPort: CDP, dataDir: data });
  const env = { kd, data, srv: kd.server, tabs: [], base: kd.base };
  env.served = async () => sumAttempts(await (await fetch(kd.base + 'api/progress')).json());
  env.doc = async () => (await fetch(kd.base + 'api/progress')).json();
  env.kill = async () => { hardKill(env.srv.proc); await waitExit(env.srv.proc); };
  env.restart = async () => { env.srv = await restart(PORT, data); };
  env.tab = (opts) => tab(env, opts);
  env.stop = async () => { for (const t of env.tabs) try { t.ws.close(); } catch {} try { await env.srv.stop(); } catch {} await Promise.race([kd.stop(), sleep(2500)]); };
  return env;
}

export async function tab(env, { blockStorage = false } = {}) {
  const { kd } = env;
  const { result } = await kd.send('Target.createTarget', { url: 'about:blank' });
  await sleep(300);
  const t = (await (await fetch(`http://127.0.0.1:${CDP}/json`)).json()).find((x) => x.id === result.targetId);
  const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pend = new Map(); const listeners = new Set();
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } for (const fn of listeners) fn(m); });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__ev = { show: [], hide: [], kaErr: 0, puts: [] };
    addEventListener('pageshow', (e) => __ev.show.push(e.persisted)); addEventListener('pagehide', (e) => __ev.hide.push(e.persisted));
    addEventListener('unhandledrejection', (e) => { __ev.kaErr++; __ev.lastRej = String(e.reason).slice(0, 80); });
    ${blockStorage ? "Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Access is denied for this document.', 'SecurityError'); } });" : ''}` });
  const h = { id: result.targetId, send, ws, n: 0, on: (fn) => listeners.add(fn), off: (fn) => listeners.delete(fn) };
  h.js = async (body) => { const r = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true }); return r.result?.result?.value; };
  h.ready = async (ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await h.js("return !!(window.__kanaDojo?.store.get() && document.querySelector('main h1'))").catch(() => false)) return true; await sleep(100); } return false; };
  h.go = async (hash = '#/learn') => { await send('Page.navigate', { url: env.base + hash }); return h.ready(); };
  h.leave = async (url = 'about:blank') => send('Page.navigate', { url });
  h.close = async () => kd.send('Target.closeTarget', { targetId: result.targetId });
  h.key = async (k) => { const code = /\d/.test(k) ? `Digit${k}` : k; const vk = k === 'Enter' ? 13 : k.charCodeAt(0); const text = k === 'Enter' ? '\r' : k; await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, text }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk }); await sleep(25); };
  h.mem = () => h.js('const d = window.__kanaDojo.store.get(); let n=0; for (const s of Object.values(d.chars||{})) n+=s.attempts||0; return n;');
  h.unsaved = () => h.js("return document.getElementById('banner') && !document.getElementById('banner').hidden ? document.getElementById('banner').textContent.slice(0,50) : null");
  env.tabs.push(h);
  return h;
}

/** Answer one prompt in tab h (correct, or wrong). Returns true if an answer was registered. */
export async function answer(h, { wrong = false } = {}, depth = 0) {
  if (depth > 6) return false;
  const r = await h.js(`
    const { KANA } = await import('/core/kana.js');
    if (document.querySelector('[data-action="start-quiz"]')) return 'study';
    if (document.getElementById('arrived-h')) return 'none';
    const sign = document.querySelector('.sign-kana'); if (!sign) return 'none';
    if (document.querySelector('.sign')?.dataset.result) return 'answered';
    const script = document.querySelector('.sign-script')?.textContent.includes('Katakana') ? 'katakana' : 'hiragana';
    const k = KANA.find((x) => x.char === sign.textContent.trim() && x.script === script);
    const opts = [...document.querySelectorAll('.opt')].map((o) => o.textContent.replace(/^\\d/, '').trim());
    let i = opts.indexOf(k.romaji); ${wrong ? 'i = (i + 1) % opts.length;' : ''} return String(i + 1);`);
  if (r === 'study' || r === 'answered') { await h.key('Enter'); await sleep(120); return answer(h, { wrong }, depth + 1); }
  if (r === 'none' || r == null) { await h.go('#/learn'); await h.key('Enter'); await sleep(200); return answer(h, { wrong }, depth + 1); }
  await h.key(r);
  const ok = await h.js("return !!document.querySelector('.sign')?.dataset.result");
  if (ok) h.n++;
  return ok;
}
/** Get to a quiz prompt without answering. */
export async function toQuiz(h) { for (let i = 0; i < 6; i++) { const s = await h.js("return document.querySelector('[data-action=\"start-quiz\"]') ? 'study' : document.querySelector('.sign-kana') ? (document.querySelector('.sign')?.dataset.result ? 'answered' : 'quiz') : 'none'"); if (s === 'quiz') return true; if (s === 'none') { await h.go('#/learn'); } await h.key('Enter'); await sleep(150); } return false; }

export async function outboxKeys(h) { return h.js("try { return Object.keys(localStorage).filter((k) => k.startsWith('kd-outbox-')).length; } catch { return 'blocked'; }"); }
export async function settle(env, ms = 12000) { let last = -1, stable = 0; const t0 = Date.now(); while (Date.now() - t0 < ms) { await sleep(250); let s; try { s = await env.served(); } catch { s = -2; } if (s === last) { if (++stable >= 6) return s; } else stable = 0; last = s; } return last; }
