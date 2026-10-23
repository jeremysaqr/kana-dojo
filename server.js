// Kana Dojo local server: static files + JSON progress API.
// Node built-in modules only. Binds to 127.0.0.1 exclusively.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const LAN_HOST = '0.0.0.0';
const DEFAULT_PORT = 4173;
const PORT_SCAN = 10;
const MAX_BODY = 5 * 1024 * 1024;
export const EXIT_ALREADY_RUNNING = 3;

function readVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}
export const VERSION = readVersion();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
};

const VIRTUAL_IF = /vethernet|wsl|hyper-v|virtualbox|vmware|vbox|docker|loopback|tailscale|zerotier|vpn|tap|tun/i;

/**
 * This machine's non-internal IPv4 addresses (for LAN mode).
 * physicalOnly: skip virtual adapters (WSL, Hyper-V, VPN...) a phone can't reach - used for display.
 */
export function lanAddresses({ physicalOnly = false } = {}) {
  const out = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    if (physicalOnly && VIRTUAL_IF.test(name)) continue;
    for (const a of list || []) {
      const v4 = a.family === 'IPv4' || a.family === 4;
      if (v4 && !a.internal && !a.address.startsWith('169.254.')) out.push(a.address);
    }
  }
  return [...new Set(out)];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- persistence

const MAIN = 'progress.json';
const BAK = 'progress.json.bak';
const TMP = 'progress.json.tmp';
const BAK_TMP = 'progress.json.bak.tmp';

function isDocObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Read + parse a JSON object file. Returns {ok, value} | {ok:false, missing} | {ok:false, error}. */
async function tryReadJson(file) {
  let text;
  try {
    text = await fsp.readFile(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: false, missing: true };
    return { ok: false, error: err };
  }
  try {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const value = JSON.parse(text);
    if (!isDocObject(value)) return { ok: false, error: new Error('not a JSON object') };
    if (typeof value.version !== 'number' || !Number.isFinite(value.version)) return { ok: false, error: new Error('not a progress document (no version)') };
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err };
  }
}

async function renameWithRetry(from, to, attempts = 10) {
  for (let i = 0; ; i++) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (err) {
      const retryable = err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES';
      if (!retryable || i >= attempts - 1) throw err;
      await sleep(15 * (i + 1));
    }
  }
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** Move an unreadable file aside as progress.corrupt-<tag><ts>.json (never deleted). Returns its name. */
async function moveAside(dataDir, file, tag, reason, log) {
  const aside = path.join(dataDir, `progress.corrupt-${tag}${timestamp()}.json`);
  log.warn?.(`[kana-dojo] ${path.basename(file)} is unreadable (${reason}); keeping it as ${path.basename(aside)}`);
  try {
    await renameWithRetry(file, aside);
  } catch (err) {
    try { await fsp.copyFile(file, aside); } catch { /* best effort */ }
    log.warn?.(`[kana-dojo] could not move corrupt file aside: ${err.message}`);
  }
  return path.basename(aside);
}

/**
 * Read progress from dataDir. Returns the parsed document or null.
 * An unreadable main file (bad JSON, or not a progress document) is moved aside as
 * progress.corrupt-<ts>.json (never deleted), then the .bak file is used. An unreadable .bak is moved
 * aside too, so a later save can't overwrite it. When `info` is given, info.recovery is set to
 * { kind: 'bak' | 'fresh', aside: [file names] } whenever a file had to be set aside.
 */
export async function readProgress(dataDir, log = console, info = null) {
  const mainPath = path.join(dataDir, MAIN);
  const bakPath = path.join(dataDir, BAK);
  const main = await tryReadJson(mainPath);
  if (main.ok) return main.value;
  const aside = [];
  if (!main.missing) aside.push(await moveAside(dataDir, mainPath, '', main.error?.message, log));
  const bak = await tryReadJson(bakPath);
  if (bak.ok) {
    if (!main.missing) {
      log.warn?.('[kana-dojo] recovered progress from progress.json.bak');
      if (info) info.recovery = { kind: 'bak', aside };
    }
    return bak.value;
  }
  if (!bak.missing) aside.push(await moveAside(dataDir, bakPath, 'bak-', bak.error?.message, log));
  if (aside.length) {
    log.warn?.('[kana-dojo] no readable progress file found; starting fresh');
    if (info) info.recovery = { kind: 'fresh', aside };
  }
  return null;
}

/**
 * Atomically persist a progress document (object or pre-serialised JSON string):
 * tmp -> fsync -> close; copy current good main to .bak; rename tmp over main.
 */
export async function writeProgressAtomic(dataDir, doc) {
  await fsp.mkdir(dataDir, { recursive: true });
  const text = typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2);
  const mainPath = path.join(dataDir, MAIN);
  const tmpPath = path.join(dataDir, TMP);

  const fh = await fsp.open(tmpPath, 'w');
  try {
    await fh.writeFile(text, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }

  try {
    // Back up the current main file, but only if it is a good document. Written as a new file (not
    // copyFile, which carries a read-only attribute over), and our own read-only .bak is unlocked first.
    const current = await tryReadJson(mainPath);
    if (current.ok) {
      const bakTmp = path.join(dataDir, BAK_TMP);
      const bakPath = path.join(dataDir, BAK);
      await fsp.writeFile(bakTmp, await fsp.readFile(mainPath));
      try { await fsp.chmod(bakPath, 0o666); } catch { /* no .bak yet */ }
      await renameWithRetry(bakTmp, bakPath);
    }
    await renameWithRetry(tmpPath, mainPath);
  } catch (err) {
    for (const f of [TMP, BAK_TMP]) { try { await fsp.unlink(path.join(dataDir, f)); } catch { /* gone */ } }
    throw err;
  }
}

/** How many recent save ids the document remembers (lets a client whose reply was lost see that it landed). */
export const SAVE_IDS_CAP = 500;   // ~13 KB; an outbox entry left by a closed tab stays recognisable for 500 saves

/**
 * Serialises disk writes; when several are queued only the newest is written.
 * Holds `durable` = { doc, rev }: exactly what is on disk. It changes only after a write has landed,
 * so GET and 409 replies never show a revision that a restart (or a failed write) could take back.
 * Saves go through `exclusive()`, one at a time: check If-Match against `durable`, write, then publish.
 * Also keeps the last recovery note.
 */
export function createProgressStore(dataDir, log = console) {
  let latest = null; // { text, seq }
  let seq = 0;
  let running = null;
  const waiters = []; // { seq, resolve, reject }
  let current = null;      // durable { doc, rev } once read; doc may be null (no progress yet)
  let reading = null;
  let lock = Promise.resolve();   // serialises save transactions
  let recovery = null;     // { kind, aside } after a corrupt file was set aside; cleared by a good save

  async function drain() {
    while (latest) {
      const job = latest;
      latest = null;
      let error = null;
      try {
        await writeProgressAtomic(dataDir, job.text);
      } catch (err) {
        error = err;
        log.error?.(`[kana-dojo] failed to save progress: ${err.message}`);
      }
      for (let i = waiters.length - 1; i >= 0; i--) {
        const w = waiters[i];
        if (w.seq <= job.seq) {
          waiters.splice(i, 1);
          if (error) w.reject(error); else w.resolve();
        }
      }
    }
    running = null;
  }

  async function firstRead() {
    while (running) await running;
    for (const f of [TMP, BAK_TMP]) { try { await fsp.unlink(path.join(dataDir, f)); } catch { /* none */ } }
    const info = {};
    const doc = await readProgress(dataDir, log, info);
    if (info.recovery) recovery = info.recovery;
    const r = Number.isSafeInteger(doc?.rev) && doc.rev >= 0 && doc.rev < 2 ** 50 ? doc.rev : 0;
    current = { doc, rev: r };
  }

  return {
    /** Load the document from disk once; afterwards memory is authoritative. */
    async ready() {
      if (!current) { reading ??= firstRead(); await reading; }
      return current;
    },
    /** What is on disk, { doc, rev } (call after ready(); synchronous). */
    snapshot() { return current; },
    /** Run `fn` with no other save transaction in between (check, write and publish as one step). */
    exclusive(fn) {
      const run = lock.then(fn);
      lock = run.catch(() => {});
      return run;
    },
    /**
     * The next document to write: next revision, remembered save id (any `rev`/`saveIds` in the body
     * are ignored). Nothing is published until `publish()` after the write has landed.
     */
    prepare(doc, saveId) {
      const { rev: _r, saveIds: _s, ...body } = doc;
      const rev = current.rev + 1;
      const prevIds = Array.isArray(current.doc?.saveIds) ? current.doc.saveIds : [];
      const saveIds = saveId ? [...prevIds.filter((x) => x !== saveId), saveId].slice(-SAVE_IDS_CAP) : prevIds;
      const stored = { ...body, rev, ...(saveIds.length ? { saveIds } : {}) };
      return { stored, rev, text: JSON.stringify(stored, null, 2) };
    },
    /** The write landed: this is now the served document. */
    publish(stored) { current = { doc: stored, rev: stored.rev }; },
    get recovery() { return recovery; },
    clearRecovery() { recovery = null; },
    save(text) {
      const mySeq = ++seq;
      latest = { text, seq: mySeq };
      const p = new Promise((resolve, reject) => waiters.push({ seq: mySeq, resolve, reject }));
      if (!running) running = drain();
      return p;
    },
    /** The current document (from memory after the first read). */
    async load() { await this.ready(); return current.doc; },
    async flush() {
      while (running) await running;
    },
  };
}


// ---------------------------------------------------------------- profiles

/**
 * Several learners on one machine. `data/profiles.json` lists { id, name, createdAt }; each profile's
 * progress lives in `data/profiles/<id>/` with its own store (revisions, save ids, .bak, recovery).
 * The first time profiles are used, an existing `data/progress.json` becomes a profile (named
 * `firstName`); the original files stay as `progress.json.pre-profiles` (and `.bak.pre-profiles`).
 * Deleting a profile moves its folder to `data/deleted-profiles/` (never erased).
 */
export function createProfiles(dataDir, log = console, { firstName = 'Player 1' } = {}) {
  const indexPath = path.join(dataDir, 'profiles.json');
  const stores = new Map();
  let list = null;
  let lock = Promise.resolve();
  const exclusive = (fn) => { const run = lock.then(fn); lock = run.catch(() => {}); return run; };
  const newId = () => `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const cleanName = (n) => String(n ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);

  async function writeIndex(next) {
    const tmp = `${indexPath}.tmp`;
    await fsp.writeFile(tmp, JSON.stringify({ version: 1, profiles: next }, null, 2));
    await renameWithRetry(tmp, indexPath);
    list = next;
  }

  async function load() {
    if (list) return list;
    return exclusive(async () => {
      if (list) return list;
      let raw = null;
      try { raw = JSON.parse(await fsp.readFile(indexPath, 'utf8')); } catch (err) {
        if (err.code !== 'ENOENT') log.warn?.(`[kana-dojo] profiles.json is unreadable (${err.message}); rebuilding it from the profile folders`);
      }
      if (raw && Array.isArray(raw.profiles)) {
        list = raw.profiles.filter((p) => p && /^[\w-]{1,40}$/.test(p.id) && cleanName(p.name));
        return list;
      }
      // No index: rebuild from folders, or adopt the single-profile progress file.
      const found = [];
      try {
        for (const e of await fsp.readdir(path.join(dataDir, 'profiles'), { withFileTypes: true })) {
          if (e.isDirectory() && /^[\w-]{1,40}$/.test(e.name)) found.push({ id: e.name, name: e.name, createdAt: Date.now() });
        }
      } catch { /* no profiles folder yet */ }
      if (!found.length && (fs.existsSync(path.join(dataDir, MAIN)) || fs.existsSync(path.join(dataDir, BAK)))) {
        const id = newId();
        const dir = path.join(dataDir, 'profiles', id);
        await fsp.mkdir(dir, { recursive: true });
        for (const f of [MAIN, BAK]) {
          const from = path.join(dataDir, f);
          if (!fs.existsSync(from)) continue;
          await fsp.copyFile(from, path.join(dir, f));
          await renameWithRetry(from, `${from}.pre-profiles`);
        }
        found.push({ id, name: firstName, createdAt: Date.now() });
        log.log?.(`[kana-dojo] your progress is now the profile "${firstName}" (the original file is kept as progress.json.pre-profiles)`);
      }
      await fsp.mkdir(dataDir, { recursive: true });
      await writeIndex(found);
      return list;
    });
  }

  return {
    load,
    async list() { return [...(await load())]; },
    async has(id) { return (await load()).some((p) => p.id === id); },
    /** The progress store for one profile (created on first use). */
    store(id) {
      if (!stores.has(id)) stores.set(id, createProgressStore(path.join(dataDir, 'profiles', id), log));
      return stores.get(id);
    },
    allStores() { return [...stores.values()]; },
    async create(name) {
      const n = cleanName(name);
      if (!n) return { error: 'name required' };
      await load();
      return exclusive(async () => {
        if (list.some((p) => p.name.toLowerCase() === n.toLowerCase())) return { error: 'name taken' };
        const profile = { id: newId(), name: n, createdAt: Date.now() };
        await fsp.mkdir(path.join(dataDir, 'profiles', profile.id), { recursive: true });
        await writeIndex([...list, profile]);
        return { profile };
      });
    },
    async rename(id, name) {
      const n = cleanName(name);
      if (!n) return { error: 'name required' };
      await load();
      return exclusive(async () => {
        if (!list.some((p) => p.id === id)) return { error: 'not found' };
        if (list.some((p) => p.id !== id && p.name.toLowerCase() === n.toLowerCase())) return { error: 'name taken' };
        await writeIndex(list.map((p) => (p.id === id ? { ...p, name: n } : p)));
        return { profile: list.find((p) => p.id === id) };
      });
    },
    async remove(id) {
      await load();
      return exclusive(async () => {
        if (!list.some((p) => p.id === id)) return { error: 'not found' };
        await stores.get(id)?.flush();
        stores.delete(id);
        const from = path.join(dataDir, 'profiles', id);
        const to = path.join(dataDir, 'deleted-profiles', `${id}-${timestamp()}`);
        await fsp.mkdir(path.dirname(to), { recursive: true });
        try { await renameWithRetry(from, to); } catch (err) { if (err.code !== 'ENOENT') throw err; }
        await writeIndex(list.filter((p) => p.id !== id));
        return { ok: true, keptAs: path.relative(dataDir, to) };
      });
    },
  };
}

// ---------------------------------------------------------------- HTTP

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  });
  res.end(payload);
}

/** Collect a request body up to `limit` bytes. Resolves {tooLarge} without buffering past the limit. */
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    let tooLarge = Number.isFinite(declared) && declared > limit;
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      if (tooLarge) return; // drain without buffering
      size += chunk.length;
      if (size > limit) {
        tooLarge = true;
        chunks.length = 0;
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(tooLarge ? { tooLarge: true } : { text: Buffer.concat(chunks).toString('utf8') }));
    req.on('error', reject);
  });
}

/** Resolve a URL sub-path inside root; returns absolute path or null if it escapes. */
function safeJoin(root, subPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(subPath);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const resolved = path.resolve(root, '.' + path.sep + decoded.replace(/^[/\\]+/, ''));
  const rel = path.relative(root, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return resolved;
}

async function realInside(root, file) {
  try {
    const [r, f] = await Promise.all([fsp.realpath(root), fsp.realpath(file)]);
    const rel = path.relative(r, f);
    return !(rel.startsWith('..') || path.isAbsolute(rel));
  } catch {
    return false;
  }
}

async function serveStatic(req, res, root, subPath) {
  const file = safeJoin(root, subPath);
  if (!file) return send(res, 403, 'Forbidden');
  let target = file;
  let st;
  try {
    st = await fsp.stat(target);
    if (st.isDirectory()) {
      target = path.join(target, 'index.html');
      st = await fsp.stat(target);
    }
  } catch {
    return send(res, 404, 'Not found');
  }
  if (!st.isFile()) return send(res, 404, 'Not found');
  if (!(await realInside(root, target))) return send(res, 403, 'Forbidden');

  const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': st.size,
    'Cache-Control': 'no-cache',
    'X-Content-Type-Options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  const stream = fs.createReadStream(target);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

/**
 * Create (but do not start) the Kana Dojo HTTP server.
 * The returned http.Server has `.store` (progress store) attached.
 */
export function createServer({
  dataDir = path.join(ROOT, 'data'),
  publicDir = path.join(ROOT, 'public'),
  coreDir = path.join(ROOT, 'src', 'core'),
  log = console,
  maxBody = MAX_BODY,
  lan = false, // LAN mode: also accept this machine's own LAN IPv4 addresses as Host/Origin
  firstProfileName = 'Player 1',   // name for existing progress when it becomes the first profile
} = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const rootStore = createProgressStore(dataDir, log);     // single-profile mode (requests with no ?profile=)
  const profiles = createProfiles(dataDir, log, { firstName: firstProfileName });

  const server = http.createServer(async (req, res) => {
    try {
      const port = server.address()?.port;
      const allowedHosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (lan) for (const ip of lanAddresses()) allowedHosts.add(`${ip}:${port}`);
      const host = String(req.headers.host || '').toLowerCase();
      if (!allowedHosts.has(host)) return send(res, 421, 'Misdirected request');

      const origin = req.headers.origin;
      const originOk = !origin || (origin.startsWith('http://') && allowedHosts.has(origin.slice(7).toLowerCase()));

      let url;
      try {
        url = new URL(req.url, `http://${host}`);
      } catch {
        return send(res, 400, 'Bad request');
      }
      const pathname = url.pathname;

      if (pathname === '/api/health') {
        if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET' });
        return send(res, 200, { app: 'kana-dojo', version: VERSION });
      }

      if (pathname === '/api/profiles' || pathname.startsWith('/api/profiles/')) {
        const id = pathname.slice('/api/profiles/'.length) || null;
        if (req.method === 'GET' && !id) return send(res, 200, { profiles: await profiles.list() });
        if (!originOk) return send(res, 403, { ok: false, error: 'cross-origin request rejected' });
        let input = {};
        if (req.method === 'POST' || req.method === 'PATCH') {
          const body = await readBody(req, 4096);
          try { input = JSON.parse(body.text || '{}'); } catch { return send(res, 400, { ok: false, error: 'body is not valid JSON' }); }
        }
        let out;
        if (req.method === 'POST' && !id) out = await profiles.create(input.name);
        else if (req.method === 'PATCH' && id) out = await profiles.rename(id, input.name);
        else if (req.method === 'DELETE' && id) out = await profiles.remove(id);
        else return send(res, 405, 'Method not allowed', { Allow: 'GET, POST, PATCH, DELETE' });
        if (out.error) return send(res, out.error === 'not found' ? 404 : out.error === 'name taken' ? 409 : 400, { ok: false, error: out.error });
        return send(res, 200, { ok: true, ...out });
      }

      if (pathname === '/api/progress') {
        const profileId = url.searchParams.get('profile');
        if (profileId !== null && !(await profiles.has(profileId))) return send(res, 404, { ok: false, error: 'unknown profile' });
        const store = profileId !== null ? profiles.store(profileId) : rootStore;
        if (req.method === 'GET') {
          await store.ready();
          const { doc, rev } = store.snapshot();          // one consistent pair, no await after this
          const headers = { 'X-Progress-Rev': String(rev) };
          if (store.recovery) headers['X-Progress-Recovered'] = `${store.recovery.kind}; aside=${store.recovery.aside.join(',')}`;
          return send(res, 200, doc ? { ...doc, rev } : null, headers);
        }
        if (req.method === 'PUT') {
          if (!originOk) return send(res, 403, { ok: false, error: 'cross-origin request rejected' });
          const body = await readBody(req, maxBody);
          if (body.tooLarge) return send(res, 413, { ok: false, error: 'body too large' });
          let doc;
          try {
            doc = JSON.parse(body.text);
          } catch {
            return send(res, 400, { ok: false, error: 'body is not valid JSON' });
          }
          if (!isDocObject(doc)) return send(res, 400, { ok: false, error: 'body must be a JSON object' });
          if (typeof doc.version !== 'number' || !Number.isFinite(doc.version)) {
            return send(res, 400, { ok: false, error: 'document must have a numeric version' });
          }
          // Optimistic concurrency: a client that sends If-Match must have seen the current revision,
          // otherwise another tab saved in between and the client merges and retries.
          await store.ready();
          const ifMatch = req.headers['if-match'];
          const saveId = /^[\w-]{1,64}$/.test(String(req.headers['x-save-id'] || '')) ? String(req.headers['x-save-id']) : null;
          // One save at a time: check against what is on disk, write, and only then publish. A failed
          // write publishes nothing, so no tab ever sees (or merges from) answers that aren't saved.
          const outcome = await store.exclusive(async () => {
            const now = store.snapshot();
            if (ifMatch !== undefined && String(ifMatch).trim().replace(/"/g, '') !== String(now.rev)) {
              return { status: 409, body: { ok: false, conflict: true, rev: now.rev, doc: now.doc ? { ...now.doc, rev: now.rev } : null } };
            }
            const { stored, rev, text } = store.prepare(doc, saveId);
            try {
              await store.save(text);
            } catch (err) {
              return { status: 500, body: { ok: false, error: 'could not write the progress file', code: err.code || 'EIO' } };
            }
            store.publish(stored);
            store.clearRecovery();
            return { status: 200, body: { ok: true, savedAt: Date.now(), rev } };
          });
          return send(res, outcome.status, outcome.body);
        }
        return send(res, 405, 'Method not allowed', { Allow: 'GET, PUT' });
      }

      if (pathname.startsWith('/api/')) return send(res, 404, { ok: false, error: 'unknown endpoint' });

      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });

      // Reject any raw traversal segments, even ones URL normalisation already collapsed.
      if (/(^|[/\\])\.\.([/\\]|$)/.test(safeDecode(req.url.split('?')[0]))) return send(res, 403, 'Forbidden');

      if (pathname === '/core' || pathname.startsWith('/core/')) {
        return serveStatic(req, res, coreDir, pathname.slice('/core'.length));
      }
      return serveStatic(req, res, publicDir, pathname === '/' ? '/index.html' : pathname);
    } catch (err) {
      log.error?.(`[kana-dojo] request error: ${err.stack || err.message}`);
      if (!res.headersSent) send(res, 500, { ok: false, error: 'internal error' });
      else res.destroy();
    }
  });
  server.store = rootStore;
  server.profiles = profiles;
  server.lan = lan;
  return server;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const opts = { port: undefined, open: false, probe: false, dataDir: undefined, lan: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--open') opts.open = true;
    else if (a === '--probe') opts.probe = true;
    else if (a === '--lan') opts.lan = true;
    else if (a === '--port') opts.port = argv[++i];
    else if (a.startsWith('--port=')) opts.port = a.slice(7);
    else if (a === '--data-dir') opts.dataDir = argv[++i];
    else if (a.startsWith('--data-dir=')) opts.dataDir = a.slice(11);
  }
  const raw = opts.port ?? process.env.KANA_DOJO_PORT ?? DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`invalid port: ${raw}`);
  }
  opts.port = port;
  if (/^(1|true|yes|on)$/i.test(process.env.KANA_DOJO_LAN || '')) opts.lan = true;
  opts.dataDir = opts.dataDir ?? process.env.KANA_DOJO_DATA_DIR ?? path.join(ROOT, 'data');
  return opts;
}

/** Resolves 'kana-dojo' | 'other' | 'none' for what is listening on the port. */
function probe(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port, path: '/api/health', timeout: timeoutMs }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { if (data.length < 4096) data += c; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data)?.app === 'kana-dojo' ? 'kana-dojo' : 'other');
        } catch {
          resolve('other');
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve('other'); });
    req.on('error', (err) => resolve(err.code === 'ECONNREFUSED' ? 'none' : 'other'));
  });
}

function listen(server, port, host = HOST) {
  return new Promise((resolve, reject) => {
    const onError = (err) => { server.off('listening', onListening); reject(err); };
    const onListening = () => { server.off('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
  });
}

export function openBrowser(url) {
  let cmd;
  let args;
  const options = { detached: true, stdio: 'ignore', windowsHide: true };
  if (process.platform === 'win32') {
    cmd = process.env.ComSpec || 'cmd.exe';
    args = ['/d', '/s', '/c', `start "" "${url}"`];
    options.windowsVerbatimArguments = true;
  } else if (process.platform === 'darwin') {
    cmd = 'open';
    args = [url];
  } else {
    cmd = 'xdg-open';
    args = [url];
  }
  try {
    const child = spawn(cmd, args, options);
    child.on('error', (err) => console.warn(`[kana-dojo] could not open browser (${err.message}); visit ${url}`));
    child.unref();
  } catch (err) {
    console.warn(`[kana-dojo] could not open browser (${err.message}); visit ${url}`);
  }
}

// ---------------------------------------------------------------- one server per data folder

const LOCK = 'server.lock';

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

/** Read the lock file, or null. */
function readLock(dataDir) {
  try { return JSON.parse(fs.readFileSync(path.join(dataDir, LOCK), 'utf8')); } catch { return null; }
}

/**
 * The port of another live Kana Dojo using this data folder, or null. Two servers on one folder
 * would each trust their own copy of the progress and overwrite the other's saves. A lock whose
 * process is gone, or whose port answers as something other than Kana Dojo (a reused pid), is stale.
 * A lock with no port yet belongs to a server that is still starting: wait briefly for it.
 */
export async function otherInstance(dataDir) {
  for (let i = 0; i < 12; i++) {
    const lock = readLock(dataDir);
    if (!lock || lock.pid === process.pid || !pidAlive(lock.pid)) return null;
    if (Number.isInteger(lock.port)) {
      const who = await probe(lock.port, 800);
      if (who === 'kana-dojo') return lock.port;
      if (who === 'other') return null;                 // the pid was reused by something else
    }
    await sleep(250);                                    // starting up, or restarting: look again
  }
  return null;
}

/**
 * Claim this data folder before listening. The lock is created exclusively ('wx'), so two servers
 * started at the same moment can't both get it. Returns { busy: port } if a live Kana Dojo holds it.
 */
export async function acquireLock(dataDir) {
  const file = path.join(dataDir, LOCK);
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, port: null }), { flag: 'wx' });
      process.on('exit', () => {
        try { if (readLock(dataDir)?.pid === process.pid) fs.unlinkSync(file); } catch { /* gone */ }
      });
      return { ok: true };
    } catch (err) {
      if (err.code !== 'EEXIST') return { ok: true };   // can't lock (read-only folder?): run unlocked
    }
    const busy = await otherInstance(dataDir);
    if (busy !== null) return { busy };
    const lock = readLock(dataDir);
    if (lock && lock.pid !== process.pid && pidAlive(lock.pid) && lock.port === null) continue;   // still starting
    try { fs.unlinkSync(file); } catch { /* someone else took it over */ }
  }
  return { ok: true };
}

/** Record the port once listening (keeps the pid; another start can now find us). */
export function writeLock(dataDir, port) {
  const file = path.join(dataDir, LOCK);
  try { fs.writeFileSync(file, JSON.stringify({ pid: process.pid, port })); } catch { /* unlocked run */ }
  process.on('exit', () => {
    try { if (readLock(dataDir)?.pid === process.pid) fs.unlinkSync(file); } catch { /* gone */ }
  });
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[kana-dojo] ${err.message}`);
    process.exit(2);
  }

  // --probe: print the URL of a running instance (start port .. +10) and exit 0, else exit 1.
  if (opts.probe) {
    for (let p = opts.port; p <= Math.min(opts.port + PORT_SCAN, 65535); p++) {
      if ((await probe(p)) === 'kana-dojo') {
        console.log(`KANA_DOJO_URL=http://${HOST}:${p}/`);
        process.exit(0);
      }
    }
    process.exit(1);
  }

  const server = createServer({ dataDir: opts.dataDir, lan: opts.lan });
  const bindHost = opts.lan ? LAN_HOST : HOST;
  const dataDir = opts.dataDir || path.join(ROOT, 'data');
  const alreadyRunning = (p) => {
    console.log(`Kana Dojo is already running at http://${HOST}:${p}/ (not starting a second copy).`);
    if (opts.lan) console.log('If your phone cannot connect, close the other Kana Dojo window and start the LAN launcher again.');
    console.log(`KANA_DOJO_URL=http://${HOST}:${p}/`);
    process.exit(EXIT_ALREADY_RUNNING);
  };
  fs.mkdirSync(dataDir, { recursive: true });
  const claim = await acquireLock(dataDir);
  if (claim.busy) alreadyRunning(claim.busy);
  await server.store.ready().catch(() => {});          // read before serving: clears stale .tmp files
  await server.profiles.load().catch((err) => console.error(`[kana-dojo] could not read profiles: ${err.message}`));
  let port = opts.port;
  const lastPort = opts.port === 0 ? 0 : Math.min(opts.port + PORT_SCAN, 65535);
  for (;;) {
    // Windows lets a 127.0.0.1 bind and a 0.0.0.0 bind coexist on the same port (in either
    // order), so EADDRINUSE alone can't detect a LAN-mode vs default-mode clash. Probe first.
    if (port !== 0) {
      const who = await probe(port);
      if (who === 'kana-dojo') alreadyRunning(port);
      if (who === 'other') {
        if (port >= lastPort) {
          console.error(`[kana-dojo] ports ${opts.port}-${lastPort} are all in use by other programs. Try --port <N>.`);
          process.exit(1);
        }
        console.log(`[kana-dojo] port ${port} is in use by another program; trying ${port + 1}...`);
        port++;
        continue;
      }
    }
    try {
      await listen(server, port, bindHost);
      break;
    } catch (err) {
      if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') {
        console.error(`[kana-dojo] could not start server: ${err.message}`);
        process.exit(1);
      }
      const who = err.code === 'EADDRINUSE' ? await probe(port) : 'other';
      if (who === 'kana-dojo') alreadyRunning(port);
      if (port >= lastPort) {
        console.error(`[kana-dojo] ports ${opts.port}-${lastPort} are all in use by other programs. Try --port <N>.`);
        process.exit(1);
      }
      console.log(`[kana-dojo] port ${port} is in use by another program; trying ${port + 1}...`);
      port++;
    }
  }

  const actual = server.address().port;
  writeLock(dataDir, actual);
  const url = `http://${HOST}:${actual}/`;
  if (actual !== opts.port && opts.port !== 0) console.log(`[kana-dojo] using port ${actual} instead of ${opts.port}.`);
  console.log(`Kana Dojo is running at ${url} - close this window (or press Ctrl+C) to stop.`);
  if (opts.lan) {
    let ips = lanAddresses({ physicalOnly: true });
    if (ips.length === 0) ips = lanAddresses();
    if (ips.length === 0) console.log('LAN mode is on, but no Wi-Fi/Ethernet IPv4 address was found on this computer.');
    for (const ip of ips) console.log(`On your phone (same Wi-Fi): http://${ip}:${actual}/`);
    console.log('Note: while LAN mode is on, anyone on this network can open Kana Dojo. If Windows Firewall asks about Node.js, allow it on Private networks only.');
  }
  console.log(`KANA_DOJO_URL=${url}`);
  if (opts.open) openBrowser(url);

  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[kana-dojo] ${signal} received; saving and shutting down...`);
    server.close();
    server.closeAllConnections?.();
    const force = setTimeout(() => process.exit(0), 4000);
    force.unref();
    try {
      await server.store.flush();
      for (const s of server.profiles.allStores()) await s.flush();
    } catch { /* already logged */ }
    process.exit(0);
  };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    try { process.on(sig, () => shutdown(sig)); } catch { /* unsupported on this platform */ }
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedDirectly) main();
