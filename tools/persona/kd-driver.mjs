// Shared driver for the Kana Dojo persona bug hunt. Each persona imports this from its own script:
//
//   import { start } from 'file:///.../persona/kd-driver.mjs';
//   const kd = await start({ name: 'perfect', serverPort: 4191, cdpPort: 9341 });
//   await kd.go('#/learn');  ...  await kd.stop();
//
// start() launches the real server (node server.js --port P --data-dir <persona>/data --no-open) and a
// headless Edge with its own profile, and returns helpers. Nothing touches the real data/ folder.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = 'C:/Users/Jeremy/Documents/Projects/Claude/Kana Dojo';
export const HERE = path.dirname(fileURLToPath(import.meta.url));   // persona folders go next to this file (gitignored)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function startServer({ port, dataDir, extraArgs = [] }) {
  fs.mkdirSync(dataDir, { recursive: true });
  const proc = spawn(process.execPath, [path.join(ROOT, 'server.js'), '--port', String(port), '--data-dir', dataDir, '--no-open', ...extraArgs], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) break; } catch {}
    await sleep(150);
  }
  return { proc, log: () => log, stop: () => new Promise((r) => { if (proc.exitCode != null || proc.signalCode != null) return r(); proc.once('exit', r); proc.kill(); }) };
}

export async function start({ name, serverPort, cdpPort, dataDir, width = 1280, height = 800, serverArgs = [] }) {
  const dir = path.join(HERE, name);
  const data = dataDir || path.join(dir, 'data');
  const server = await startServer({ port: serverPort, dataDir: data, extraArgs: serverArgs });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `kd-${name.replace(/[\/]/g, "-")}-`));
  const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${cdpPort}`, `--user-data-dir=${profile}`, '--hide-scrollbars', '--mute-audio', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  let targets;
  for (let i = 0; i < 80; i++) { try { targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json(); if (targets.some((t) => t.type === 'page')) break; } catch {} await sleep(200); }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0; const pending = new Map(); const consoleErrors = [];
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') consoleErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Page.enable'); await send('Runtime.enable');
  // Silence speech in tests. --mute-audio doesn't cover it: Windows speaks through the OS speech
  // service, outside the browser. The app's gate and speechAudit still run (they count before speak()).
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `try { if (window.speechSynthesis) window.speechSynthesis.speak = function () {}; } catch (e) {}` });
  const base = `http://127.0.0.1:${serverPort}/`;

  /** Evaluate an async function body in the page; returns its value (JSON-serialisable). */
  async function js(body) {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails));
    return r.result?.result?.value;
  }
  async function viewport(w, h, { dark = false, reducedMotion = true } = {}) {
    const mobile = w < 768;
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: mobile ? 2 : 1, mobile });
    await send('Emulation.setTouchEmulationEnabled', { enabled: mobile });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }, { name: 'prefers-reduced-motion', value: reducedMotion ? 'reduce' : 'no-preference' }] });
  }
  /** Full navigation (fresh page load). hash like '#/learn'. */
  async function go(hash = '#/learn') {
    await send('Page.navigate', { url: 'about:blank' }); await sleep(100);
    await send('Page.navigate', { url: base + hash }); await sleep(700);
    await js('await document.fonts.ready; return 1');
  }
  /** Real keyboard input through the browser (trusted events). key like 'Enter', 'Escape', 'Tab', '1', 'a', 'ArrowRight', ' '. */
  async function key(k, { shift = false } = {}) {
    const named = { Enter: [13, 'Enter', '\r'], Escape: [27, 'Escape'], Tab: [9, 'Tab'], ' ': [32, 'Space', ' '], ArrowRight: [39, 'ArrowRight'], ArrowLeft: [37, 'ArrowLeft'], ArrowUp: [38, 'ArrowUp'], ArrowDown: [40, 'ArrowDown'], Backspace: [8, 'Backspace'] };
    const [code, codeName, text] = named[k] || [k.toUpperCase().charCodeAt(0), /\d/.test(k) ? `Digit${k}` : `Key${k.toUpperCase()}`, k];
    const mods = shift ? 8 : 0;
    await send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key: k === ' ' ? ' ' : k, code: codeName, windowsVirtualKeyCode: code, text, unmodifiedText: text, modifiers: mods });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k === ' ' ? ' ' : k, code: codeName, windowsVirtualKeyCode: code, modifiers: mods });
    await sleep(40);
  }
  /** Type a string with real key events. */
  async function type(str) { for (const ch of str) { await send('Input.insertText', { text: ch }); await sleep(15); } }
  /** Real mouse click on the centre of the first element matching selector. Returns false if not found/hidden. */
  async function click(selector) {
    const box = await js(`const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return null; el.scrollIntoView({block:'nearest'}); const r = el.getBoundingClientRect(); if (!r.width) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 };`);
    if (!box) return false;
    for (const type of ['mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    await sleep(60);
    return true;
  }
  async function shot(file) {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return file;
  }
  /**
   * What is on screen in a lesson: { phase, kana, script, answered, correct, options:[{id,label}], answerId,
   * answerLabel, streak, target, crumb, revealedRomaji, codeRingVisible, bandColour, gateOpen, audit }.
   * answerId/answerLabel are computed from the data (the correct answer), for driving personas.
   */
  async function state() {
    return js(`
      const { KANA } = await import('/core/kana.js'); const { WORDS } = await import('/core/words.js');
      const sign = document.querySelector('.sign-kana'); const arrived = document.getElementById('arrived-h');
      const phase = arrived ? 'summary' : document.querySelector('[data-action="start-quiz"]') ? 'study' : sign ? 'quiz' : 'home';
      if (phase !== 'quiz' && phase !== 'study') return { phase, heading: arrived?.textContent || document.querySelector('main h1')?.textContent, audit: { ...window.__kanaDojo.speechAudit }, gateOpen: window.__kanaDojo.isGateOpen() };
      const kana = sign.textContent.trim();
      const script = document.querySelector('.sign-script')?.textContent.includes('Katakana') ? 'katakana' : 'hiragana';
      const word = WORDS.find((w) => w.kana === kana); const k = KANA.find((x) => x.char === kana && x.script === script);
      const opts = [...document.querySelectorAll('.opt')].map((o) => ({ id: o.dataset.opt, label: o.textContent.replace(/^\\d/, '').trim(), state: o.dataset.state }));
      const answerLabel = word ? word.en[0] : k?.romaji;
      const answerOpt = opts.find((o) => (word ? o.id === word.id : o.label === k?.romaji));
      const ride = document.querySelector('.ride-head strong');
      const res = document.querySelector('.sign')?.dataset.result || '';
      return {
        phase, kana, script, id: word ? word.id : k?.id, isWord: !!word,
        romaji: word ? word.romaji : k?.romaji, alt: k?.alt || [],
        answered: !!res, correct: res === 'ok',
        options: opts, answerId: answerOpt?.id || null, answerLabel,
        typed: !!document.getElementById('type-input'),
        streak: ride ? Number(ride.textContent) : null,
        target: ride ? Number(document.querySelector('.ride-head span:last-child')?.textContent.match(/of (\\d+)/)?.[1]) : null,
        crumb: document.querySelector('.crumb')?.textContent.replace(/\\s+/g, ' ').trim(),
        revealedRomaji: document.querySelector('.sign-romaji')?.textContent.replace(/Romaji hidden until you answer|Reading hidden until you answer/, '').trim(),
        codeRingVisible: !!document.querySelector('.code-ring:not(.hidden)'),
        bandStyle: document.querySelector('.sign')?.getAttribute('style') || '',
        feedback: document.querySelector('.feedback')?.textContent.trim(),
        gateOpen: window.__kanaDojo.isGateOpen(), audit: { ...window.__kanaDojo.speechAudit },
        nextVisible: !!document.getElementById('next-btn'),
      };`);
  }
  /** Saved progress document straight from the server API. */
  /** Saved progress of the learner in use (profiles: the remembered one, else the first), from the server. */
  async function progress() {
    const { profiles = [] } = await (await fetch(base + 'api/profiles')).json().catch(() => ({}));
    let id = null;
    try { id = await js(`return localStorage.getItem('kd-profile')`); } catch { /* no page yet */ }
    if (!profiles.some((p) => p.id === id)) id = profiles[0]?.id ?? null;
    return (await fetch(base + (id ? `api/progress?profile=${id}` : 'api/progress'))).json();
  }
  async function stop() {
    try { ws.close(); } catch {}
    edge.kill();
    await server.stop();
    await sleep(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
  await viewport(width, height);
  return { send, ws, js, viewport, go, key, type, click, shot, state, progress, stop, server, base, dir, dataDir: data, consoleErrors, sleep };
}

/** Write a seeded progress document (rows passed at Learn) into a data dir before start(). */
export async function seed(dataDir, { hiragana = [], katakana = [], recall = [], wordRuns = 0 } = {}) {
  const imp = (p) => import(new URL(`file:///${ROOT}/${p}`).href);
  const { defaultProgress, markSetPassed, recordWordRun } = await imp('src/core/progress.js');
  const now = Date.now() - 86400000;
  let p = defaultProgress(now);
  for (const s of hiragana) p = markSetPassed(p, `hiragana:${s}`, 0, now);
  for (const s of katakana) p = markSetPassed(p, `katakana:${s}`, 0, now);
  for (const k of recall) p = markSetPassed(p, k, 1, now);
  for (let i = 0; i < wordRuns; i++) p = recordWordRun(p, 'read', now, 10);
  p.lessons.push({ id: 'seed', kind: 'set', script: 'hiragana', level: 0, sets: ['hiragana:a'], startedAt: now, endedAt: now, result: 'passed', prompts: 5, correct: 5, missedIds: [] });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'progress.json'), JSON.stringify(p));
}
