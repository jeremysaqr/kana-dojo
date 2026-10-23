import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createServer, writeProgressAtomic, readProgress, lanAddresses, otherInstance, writeLock } from '../server.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERVER_JS = path.join(ROOT, 'server.js');
const quietLog = { warn() {}, error() {}, log() {} };

async function tempDir() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'kana-dojo-test-'));
}

async function start(dataDir, extra = {}) {
  const server = createServer({ dataDir, log: quietLog, ...extra });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  return {
    server,
    port,
    base: `http://127.0.0.1:${port}`,
    async stop() {
      await server.store.flush();
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    },
  };
}

/** Raw HTTP request that does not normalise the path (fetch would collapse "..") */
function raw(port, { method = 'GET', path: p = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: p, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

const put = (base, body, headers = {}) =>
  fetch(`${base}/api/progress`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

/** The document without the server-managed revision number. */
const noRev = (doc) => { if (!doc) return doc; const { rev, ...rest } = doc; return rest; };
const readMain = async (dir) => noRev(JSON.parse(await fsp.readFile(path.join(dir, 'progress.json'), 'utf8')));
const getDoc = async (base) => noRev(await (await fetch(`${base}/api/progress`)).json());

describe('kana dojo server', () => {
  let dir;
  let srv;

  before(async () => {
    dir = await tempDir();
    srv = await start(dir);
  });
  after(async () => {
    await srv.stop();
    await fsp.rm(dir, { recursive: true, force: true });
  });

  test('health endpoint identifies the app', async () => {
    const res = await fetch(`${srv.base}/api/health`);
    assert.equal(res.status, 200);
    const pkg = JSON.parse(await fsp.readFile(path.join(ROOT, 'package.json'), 'utf8'));
    assert.deepEqual(await res.json(), { app: 'kana-dojo', version: pkg.version });
  });

  test('GET progress with no file returns null', async () => {
    const res = await fetch(`${srv.base}/api/progress`);
    assert.equal(res.status, 200);
    assert.equal(await res.json(), null);
  });

  test('PUT then GET round-trips', async () => {
    const doc = { version: 1, createdAt: 123, chars: { 'h-ka': { attempts: 3 } }, note: 'かな' };
    const res = await put(srv.base, doc);
    assert.equal(res.status, 200);
    const out = await res.json();
    assert.equal(out.ok, true);
    assert.equal(typeof out.savedAt, 'number');
    const got = await getDoc(srv.base);
    assert.deepEqual(got, doc);
    assert.deepEqual(await readMain(dir), doc);
  });

  test('invalid PUTs are rejected and leave the file untouched', async () => {
    const good = { version: 1, marker: 'keep-me' };
    assert.equal((await put(srv.base, good)).status, 200);
    const before = await fsp.readFile(path.join(dir, 'progress.json'), 'utf8');

    assert.equal((await put(srv.base, '{not json')).status, 400);
    assert.equal((await put(srv.base, { noVersion: true })).status, 400);
    assert.equal((await put(srv.base, { version: '1' })).status, 400);
    assert.equal((await put(srv.base, [1, 2, 3])).status, 400);
    assert.equal((await put(srv.base, 'null')).status, 400);
    const big = JSON.stringify({ version: 1, pad: 'x'.repeat(6 * 1024 * 1024) });
    assert.equal((await put(srv.base, big)).status, 413);

    assert.equal(await fsp.readFile(path.join(dir, 'progress.json'), 'utf8'), before);
  });

  test('.bak holds the previous version after a second save', async () => {
    await put(srv.base, { version: 1, gen: 'first' });
    await put(srv.base, { version: 1, gen: 'second' });
    const bak = JSON.parse(await fsp.readFile(path.join(dir, 'progress.json.bak'), 'utf8'));
    assert.equal(bak.gen, 'first');
    assert.equal((await readMain(dir)).gen, 'second');
  });

  test('cross-origin PUT is rejected', async () => {
    await put(srv.base, { version: 1, gen: 'origin-before' });
    const res = await put(srv.base, { version: 1, gen: 'evil' }, { Origin: 'http://evil.example' });
    assert.equal(res.status, 403);
    assert.equal((await readMain(dir)).gen, 'origin-before');
    const ok = await put(srv.base, { version: 1, gen: 'same-origin' }, { Origin: srv.base });
    assert.equal(ok.status, 200);
  });

  test('bad Host header is rejected (DNS rebinding guard)', async () => {
    const r1 = await raw(srv.port, { path: '/api/health', headers: { Host: 'evil.example' } });
    assert.ok(r1.status >= 400, `status ${r1.status}`);
    const r2 = await raw(srv.port, { path: '/api/progress', headers: { Host: `evil.example:${srv.port}` } });
    assert.ok(r2.status >= 400);
    const r3 = await raw(srv.port, { path: '/api/health', headers: { Host: '127.0.0.1:1' } });
    assert.ok(r3.status >= 400);
    const ok = await raw(srv.port, { path: '/api/health', headers: { Host: `localhost:${srv.port}` } });
    assert.equal(ok.status, 200);
  });

  test('static files are served with correct MIME and no-cache', async () => {
    const idx = await fetch(`${srv.base}/`);
    assert.equal(idx.status, 200);
    assert.match(idx.headers.get('content-type'), /^text\/html/);
    assert.equal(idx.headers.get('cache-control'), 'no-cache');
    const core = await fetch(`${srv.base}/core/kana.js`);
    assert.equal(core.status, 200);
    assert.match(core.headers.get('content-type'), /^text\/javascript/);
    assert.equal((await fetch(`${srv.base}/nope.css`)).status, 404);
    assert.equal((await fetch(`${srv.base}/core/nope.js`)).status, 404);
  });

  test('path traversal is blocked', async () => {
    const attempts = [
      '/../server.js',
      '/core/../../server.js',
      '/core/../../package.json',
      '/%2e%2e/server.js',
      '/core/%2e%2e/%2e%2e/server.js',
      '/core/%2E%2E%2F%2E%2E%2Fserver.js',
      '/..%2fserver.js',
      '/..%5cserver.js',
      '/core/..%5c..%5cserver.js',
      '/%00../server.js',
    ];
    for (const p of attempts) {
      const r = await raw(srv.port, { path: p, headers: { Host: `127.0.0.1:${srv.port}` } });
      assert.ok(r.status === 403 || r.status === 404 || r.status === 400, `${p} -> ${r.status}`);
      assert.ok(!r.body.includes('createServer'), `${p} leaked server.js`);
    }
  });

  test('20 concurrent PUTs leave a valid file equal to one of the bodies', async () => {
    const bodies = Array.from({ length: 20 }, (_, i) => ({ version: 1, n: i, pad: 'y'.repeat(2000 + i) }));
    const results = await Promise.all(bodies.map((b) => put(srv.base, b)));
    for (const r of results) assert.equal(r.status, 200);
    const final = await readMain(dir);
    assert.ok(bodies.some((b) => JSON.stringify(b) === JSON.stringify(final)), 'final equals one of the bodies');
    assert.deepEqual(await getDoc(srv.base), final);
  });
});

describe('persistence helpers', () => {
  test('store coalesces queued writes: last save wins', async () => {
    const dir = await tempDir();
    const srv = await start(dir);
    try {
      const saves = [];
      for (let i = 0; i < 20; i++) saves.push(srv.server.store.save(JSON.stringify({ version: 1, n: i })));
      await Promise.all(saves);
      assert.equal((await readMain(dir)).n, 19);
    } finally {
      await srv.stop();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('corrupt main file falls back to .bak and is preserved', async () => {
    const dir = await tempDir();
    try {
      await writeProgressAtomic(dir, { version: 1, gen: 'old' });
      await writeProgressAtomic(dir, { version: 1, gen: 'new' });
      await fsp.writeFile(path.join(dir, 'progress.json'), '{"version":1, "gen": "tru');
      const srv = await start(dir);
      try {
        assert.deepEqual(await getDoc(srv.base), { version: 1, gen: 'old' });
        const files = await fsp.readdir(dir);
        const corrupt = files.filter((f) => /^progress\.corrupt-.*\.json$/.test(f));
        assert.equal(corrupt.length, 1);
        assert.equal(await fsp.readFile(path.join(dir, corrupt[0]), 'utf8'), '{"version":1, "gen": "tru');
        // A subsequent save works and does not clobber the good backup with garbage.
        assert.equal((await put(srv.base, { version: 1, gen: 'after' })).status, 200);
        assert.equal((await readMain(dir)).gen, 'after');
        assert.equal(JSON.parse(await fsp.readFile(path.join(dir, 'progress.json.bak'), 'utf8')).gen, 'old');
      } finally {
        await srv.stop();
      }
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('corrupt main and corrupt .bak -> null, nothing deleted', async () => {
    const dir = await tempDir();
    try {
      await fsp.writeFile(path.join(dir, 'progress.json'), 'garbage');
      await fsp.writeFile(path.join(dir, 'progress.json.bak'), 'more garbage');
      assert.equal(await readProgress(dir, quietLog), null);
      const files = await fsp.readdir(dir);
      assert.ok(files.some((f) => /^progress\.corrupt-\d/.test(f)), 'main moved aside');
      // the corrupt .bak is moved aside too (it used to stay, and a later save overwrote it)
      const bakAside = files.find((f) => f.startsWith('progress.corrupt-bak-'));
      assert.ok(bakAside, 'bak moved aside');
      assert.equal(await fsp.readFile(path.join(dir, bakAside), 'utf8'), 'more garbage');
      assert.ok(!files.includes('progress.json.bak'));
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('stray garbage progress.json.tmp does not affect reads or writes', async () => {
    const dir = await tempDir();
    try {
      await writeProgressAtomic(dir, { version: 1, gen: 'good' });
      await fsp.writeFile(path.join(dir, 'progress.json.tmp'), '{"version": 1, "half-writ');
      const srv = await start(dir);
      try {
        assert.deepEqual(await getDoc(srv.base), { version: 1, gen: 'good' });
        assert.equal((await put(srv.base, { version: 1, gen: 'next' })).status, 200);
        assert.deepEqual(await getDoc(srv.base), { version: 1, gen: 'next' });
        assert.ok(!fs.existsSync(path.join(dir, 'progress.json.tmp')));
      } finally {
        await srv.stop();
      }
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('data dir is created if missing', async () => {
    const parent = await tempDir();
    const dir = path.join(parent, 'nested', 'data');
    const srv = await start(dir);
    try {
      assert.ok(fs.existsSync(dir));
    } finally {
      await srv.stop();
      await fsp.rm(parent, { recursive: true, force: true });
    }
  });
});

describe('crash safety', () => {
  function spawnServer(dataDir) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [SERVER_JS, '--port', '0', '--data-dir', dataDir], {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
      let out = '';
      const timer = setTimeout(() => reject(new Error(`server did not start: ${out}`)), 10000);
      child.stdout.on('data', (c) => {
        out += c;
        const m = out.match(/KANA_DOJO_URL=(http:\/\/127\.0\.0\.1:\d+)\//);
        if (m) {
          clearTimeout(timer);
          resolve({ child, base: m[1] });
        }
      });
      child.stderr.on('data', () => {});
      child.on('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`server exited early (${code}): ${out}`));
      });
    });
  }

  test('SIGKILL mid-write never leaves an unparseable progress.json', { timeout: 60000 }, async () => {
    const dir = await tempDir();
    try {
      for (let round = 0; round < 6; round++) {
        const { child, base } = await spawnServer(dir);
        const exited = new Promise((r) => child.once('exit', r));
        let stop = false;
        let n = 0;
        const pump = (async () => {
          while (!stop) {
            const batch = [];
            for (let k = 0; k < 4; k++) {
              n++;
              batch.push(
                put(base, { version: 1, round, n, pad: 'z'.repeat(150000 + (n % 7) * 1000) }).catch(() => {}),
              );
            }
            await Promise.all(batch);
          }
        })();
        await new Promise((r) => setTimeout(r, 150 + round * 60));
        child.kill('SIGKILL');
        await exited;
        stop = true;
        await pump;

        const main = path.join(dir, 'progress.json');
        if (fs.existsSync(main)) {
          const doc = JSON.parse(await fsp.readFile(main, 'utf8')); // throws if corrupt
          assert.equal(doc.version, 1);
        }
        // And the server's own read path recovers a document.
        const doc = await readProgress(dir, quietLog);
        if (round > 0) assert.ok(doc && doc.version === 1, `round ${round}: progress readable`);
      }
      const files = await fsp.readdir(dir);
      assert.ok(!files.some((f) => f.startsWith('progress.corrupt-')), `no corruption: ${files.join(', ')}`);
    } finally {
      await fsp.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  });
});

describe('bind address / LAN mode', () => {
  test('default mode binds only to 127.0.0.1', async () => {
    const dir = await tempDir();
    const srv = await start(dir);
    try {
      assert.equal(srv.server.address().address, '127.0.0.1');
      assert.equal(srv.server.lan, false);
    } finally {
      await srv.stop();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('default mode rejects a LAN IP Host header', async (t) => {
    const ip = lanAddresses()[0];
    if (!ip) return t.skip('no LAN IPv4 address on this machine');
    const dir = await tempDir();
    const srv = await start(dir);
    try {
      const r = await raw(srv.port, { path: '/api/health', headers: { Host: `${ip}:${srv.port}` } });
      assert.equal(r.status, 421);
    } finally {
      await srv.stop();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('LAN mode binds 0.0.0.0, accepts own LAN IP, still rejects foreign hosts', async (t) => {
    const dir = await tempDir();
    const server = createServer({ dataDir: dir, log: quietLog, lan: true });
    await new Promise((resolve) => server.listen(0, '0.0.0.0', resolve));
    const port = server.address().port;
    try {
      assert.equal(server.address().address, '0.0.0.0');
      const loopback = await raw(port, { path: '/api/health', headers: { Host: `127.0.0.1:${port}` } });
      assert.equal(loopback.status, 200);
      for (const host of ['evil.example', `evil.example:${port}`, `10.255.255.254:${port}`]) {
        const r = await raw(port, { path: '/api/health', headers: { Host: host } });
        assert.equal(r.status, 421, host);
      }
      const evilPut = await raw(port, {
        method: 'PUT', path: '/api/progress', body: '{"version":1}',
        headers: { Host: `127.0.0.1:${port}`, Origin: 'http://evil.example', 'Content-Type': 'application/json' },
      });
      assert.equal(evilPut.status, 403);

      const ip = lanAddresses()[0];
      if (!ip) return t.skip('no LAN IPv4 address on this machine');
      const viaLan = await raw(port, { path: '/api/health', headers: { Host: `${ip}:${port}` } });
      assert.equal(viaLan.status, 200);
      assert.equal(JSON.parse(viaLan.body).app, 'kana-dojo');
      const lanPut = await raw(port, {
        method: 'PUT', path: '/api/progress', body: '{"version":1,"from":"phone"}',
        headers: { Host: `${ip}:${port}`, Origin: `http://${ip}:${port}`, 'Content-Type': 'application/json' },
      });
      assert.equal(lanPut.status, 200);
      assert.equal((await readMain(dir)).from, 'phone');
    } finally {
      await server.store.flush();
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('revisions and recovery (persona bug hunt round 1)', () => {
  test('a stale If-Match gets 409 with the current document; a fresh one saves and bumps rev', async () => {
    const dir = await tempDir();
    const srv = await start(dir);
    try {
      const r0 = await fetch(`${srv.base}/api/progress`);
      assert.equal(r0.headers.get('x-progress-rev'), '0');
      const a = await put(srv.base, { version: 1, tab: 'A' }, { 'If-Match': '0' });
      assert.equal(a.status, 200);
      assert.equal((await a.json()).rev, 1);
      const b = await put(srv.base, { version: 1, tab: 'B' }, { 'If-Match': '0' });   // tab B never saw rev 1
      assert.equal(b.status, 409);
      const conflict = await b.json();
      assert.equal(conflict.rev, 1);
      assert.equal(conflict.doc.tab, 'A');
      assert.equal((await readMain(dir)).tab, 'A', 'the stale write did not land');
      const b2 = await put(srv.base, { version: 1, tab: 'B+A' }, { 'If-Match': '1' });
      assert.equal(b2.status, 200);
      assert.equal((await getDoc(srv.base)).tab, 'B+A');
      // without If-Match (older clients) the save is still accepted
      assert.equal((await put(srv.base, { version: 1, tab: 'old client' })).status, 200);
    } finally {
      await srv.stop();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('the revision survives a restart (read from the file)', async () => {
    const dir = await tempDir();
    try {
      let srv = await start(dir);
      await put(srv.base, { version: 1 }); await put(srv.base, { version: 1 });
      await srv.stop();
      srv = await start(dir);
      try {
        const r = await fetch(`${srv.base}/api/progress`);
        assert.equal(r.headers.get('x-progress-rev'), '2');
        assert.equal((await put(srv.base, { version: 1 }, { 'If-Match': '2' })).status, 200);
      } finally { await srv.stop(); }
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('recovery is reported to the client until the next good save; wrong-shape files are set aside', async () => {
    const dir = await tempDir();
    try {
      await fsp.writeFile(path.join(dir, 'progress.json'), JSON.stringify({ version: 'one', chars: [] }));
      await fsp.writeFile(path.join(dir, 'progress.json.bak'), JSON.stringify({ version: 1, gen: 'bak' }));
      const srv = await start(dir);
      try {
        const r = await fetch(`${srv.base}/api/progress`);
        assert.match(r.headers.get('x-progress-recovered') || '', /^bak; aside=progress\.corrupt-/);
        assert.equal(noRev(await r.json()).gen, 'bak');
        assert.equal((await put(srv.base, { version: 1, gen: 'saved' })).status, 200);
        assert.equal((await fetch(`${srv.base}/api/progress`)).headers.get('x-progress-recovered'), null);
        const files = await fsp.readdir(dir);
        assert.ok(files.some((f) => /^progress\.corrupt-\d/.test(f)), 'the wrong-shape main file is kept aside');
      } finally { await srv.stop(); }
    } finally {
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('consistency under concurrency (persona bug hunt round 2)', () => {
  test('every GET and 409 pairs a revision with exactly that revision\'s content', async () => {
    const dir = await tempDir();
    const srv = await start(dir);
    try {
      const byRev = new Map();      // rev -> marker written at that rev (from 200 replies)
      const seen = [];              // [rev, marker] pairs served by GET / 409
      const client = async (c) => {
        for (let i = 0; i < 25; i++) {
          const g = await fetch(`${srv.base}/api/progress`);
          const gdoc = await g.json();
          const rev = Number(g.headers.get('x-progress-rev'));
          if (gdoc) seen.push([gdoc.rev, gdoc.marker]);
          assert.equal(gdoc ? gdoc.rev : rev, rev, 'GET header and body agree');
          const marker = `c${c}-${i}`;
          const r = await put(srv.base, { version: 1, marker }, { 'If-Match': String(rev) });
          const body = await r.json();
          if (r.status === 200) byRev.set(body.rev, marker);
          else { assert.equal(r.status, 409); if (body.doc) seen.push([body.rev, body.doc.marker]); assert.equal(body.doc?.rev, body.rev); }
        }
      };
      await Promise.all([0, 1, 2, 3, 4].map(client));
      assert.ok(byRev.size > 10);
      for (const [rev, marker] of seen) if (byRev.has(rev)) assert.equal(marker, byRev.get(rev), `rev ${rev} served with another revision's content`);
      assert.equal((await readMain(dir)).marker, byRev.get(Math.max(...byRev.keys())), 'disk holds the newest revision');
    } finally {
      await srv.stop();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('a save id is recorded in the document (lets a client whose reply was lost see it landed)', async () => {
    const dir = await tempDir();
    const srv = await start(dir);
    try {
      assert.equal((await put(srv.base, { version: 1, n: 1 }, { 'X-Save-Id': 'abc-1' })).status, 200);
      assert.equal((await put(srv.base, { version: 1, n: 2 }, { 'X-Save-Id': 'abc-2', 'If-Match': '1' })).status, 200);
      const doc = await (await fetch(`${srv.base}/api/progress`)).json();
      assert.deepEqual(doc.saveIds, ['abc-1', 'abc-2']);
      const stale = await (await put(srv.base, { version: 1, n: 3 }, { 'X-Save-Id': 'late', 'If-Match': '1' })).json();
      assert.deepEqual(stale.doc.saveIds, ['abc-1', 'abc-2'], 'a 409 shows the recorded ids');
      assert.equal((await put(srv.base, { version: 1 }, { 'X-Save-Id': '../../bad id' })).status, 200);
      assert.ok(!(await (await fetch(`${srv.base}/api/progress`)).json()).saveIds.includes('../../bad id'), 'odd ids are ignored');
    } finally {
      await srv.stop();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('a read-only progress.json reports its code, and saving resumes once the file is writable again', async () => {
    const dir = await tempDir();
    const srv = await start(dir);
    const main = path.join(dir, 'progress.json');
    try {
      assert.equal((await put(srv.base, { version: 1, gen: 1 })).status, 200);
      assert.equal((await put(srv.base, { version: 1, gen: 2 })).status, 200);   // a .bak now exists
      await fsp.chmod(main, 0o444);
      const r = await put(srv.base, { version: 1, gen: 3 });
      assert.equal(r.status, 500);
      assert.match((await r.json()).code, /^(EPERM|EACCES)$/);
      await fsp.chmod(main, 0o666);                                              // the learner fixes it
      assert.equal((await put(srv.base, { version: 1, gen: 4 })).status, 200, 'the .bak did not inherit the read-only flag');
      assert.equal((await readMain(dir)).gen, 4);
      const files = await fsp.readdir(dir);
      assert.ok(!files.includes('progress.json.tmp') && !files.includes('progress.json.bak.tmp'), 'no temp files left');
    } finally {
      try { await fsp.chmod(main, 0o666); } catch {}
      await srv.stop();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('only what is on disk is served (persona bug hunt round 3)', () => {
  test('a failed write is never served: nothing vanishes on restart, and no revision is reused', async () => {
    const dir = await tempDir();
    const main = path.join(dir, 'progress.json');
    try {
      let srv = await start(dir);
      try {
        assert.equal((await put(srv.base, { version: 1, n: 1 }, { 'X-Save-Id': 'one' })).status, 200);
        await fsp.chmod(main, 0o444);
        const failed = await put(srv.base, { version: 1, n: 2 }, { 'If-Match': '1', 'X-Save-Id': 'two' });
        assert.equal(failed.status, 500);
        const g = await fetch(`${srv.base}/api/progress`);
        assert.equal(g.headers.get('x-progress-rev'), '1', 'the failed save did not advance the served revision');
        const doc = await g.json();
        assert.equal(doc.n, 1, 'the failed save is not served');
        assert.ok(!doc.saveIds.includes('two'), 'its save id is not shown either');
        const stale = await put(srv.base, { version: 1, n: 3 }, { 'If-Match': '2' });
        assert.equal(stale.status, 409, 'a revision that never landed cannot be used');
        await fsp.chmod(main, 0o666);
        assert.equal((await put(srv.base, { version: 1, n: 2 }, { 'If-Match': '1', 'X-Save-Id': 'two' })).status, 200, 'the retry lands');
      } finally { await srv.stop(); }
      srv = await start(dir);
      try {
        const g = await fetch(`${srv.base}/api/progress`);
        assert.equal(g.headers.get('x-progress-rev'), '2');
        assert.equal((await g.json()).n, 2, 'after a restart the server shows what it showed before');
      } finally { await srv.stop(); }
    } finally {
      try { await fsp.chmod(main, 0o666); } catch {}
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('saveIds and rev sent in a body are ignored (only the server records them)', async () => {
    const dir = await tempDir();
    const srv = await start(dir);
    try {
      await put(srv.base, { version: 1, rev: 999, saveIds: Array.from({ length: 5000 }, (_, i) => `x${i}`) });
      let doc = await (await fetch(`${srv.base}/api/progress`)).json();
      assert.equal(doc.rev, 1);
      assert.equal(doc.saveIds, undefined);
      await put(srv.base, { version: 1, saveIds: 'oops' }, { 'X-Save-Id': 'real' });
      doc = await (await fetch(`${srv.base}/api/progress`)).json();
      assert.deepEqual(doc.saveIds, ['real']);
    } finally {
      await srv.stop();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });

  test('a second server on the same data folder is refused; a stale lock is taken over', async () => {
    const dir = await tempDir();
    const srv = await start(dir);
    try {
      const port = new URL(srv.base).port;
      // a lock from a live Kana Dojo (this test process, answering on `port`), written as if by another pid
      await fsp.writeFile(path.join(dir, 'server.lock'), JSON.stringify({ pid: process.ppid, port: Number(port) }));
      assert.equal(await otherInstance(dir), Number(port), 'a live instance on this folder is found');
      // a lock left by a process that is gone is stale
      await fsp.writeFile(path.join(dir, 'server.lock'), JSON.stringify({ pid: 999999, port: Number(port) }));
      assert.equal(await otherInstance(dir), null);
      // our own lock is never "another" instance
      writeLock(dir, Number(port));
      assert.equal(await otherInstance(dir), null);
    } finally {
      await srv.stop();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});

describe('profiles', () => {
  const api = (base, p, method = 'GET', body) => fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

  test('existing progress becomes the first profile, and the original file is kept', async () => {
    const dir = await tempDir();
    try {
      await writeProgressAtomic(dir, { version: 1, mine: 'old' });
      await writeProgressAtomic(dir, { version: 1, mine: 'current' });
      const srv = await start(dir, { firstProfileName: 'Jeremy' });
      try {
        const { profiles } = await (await api(srv.base, '/api/profiles')).json();
        assert.equal(profiles.length, 1);
        assert.equal(profiles[0].name, 'Jeremy');
        const doc = await (await api(srv.base, `/api/progress?profile=${profiles[0].id}`)).json();
        assert.equal(doc.mine, 'current');
        const files = await fsp.readdir(dir);
        assert.ok(files.includes('progress.json.pre-profiles') && files.includes('progress.json.bak.pre-profiles'), 'originals kept');
        assert.ok(!files.includes('progress.json'), 'the single-profile file is no longer the live one');
        assert.equal(JSON.parse(await fsp.readFile(path.join(dir, 'profiles', profiles[0].id, 'progress.json.bak'), 'utf8')).mine, 'old', 'the backup moved too');
      } finally { await srv.stop(); }
      // a restart reads the index; no second migration
      const srv2 = await start(dir, { firstProfileName: 'Jeremy' });
      try { assert.equal((await (await api(srv2.base, '/api/profiles')).json()).profiles.length, 1); } finally { await srv2.stop(); }
    } finally { await fsp.rm(dir, { recursive: true, force: true }); }
  });

  test('profiles are separate; names are checked; delete keeps the folder aside', async () => {
    const dir = await tempDir();
    const srv = await start(dir);
    try {
      assert.deepEqual((await (await api(srv.base, '/api/profiles')).json()).profiles, [], 'a fresh install starts with no profiles');
      const a = (await (await api(srv.base, '/api/profiles', 'POST', { name: '  Ana  ' })).json()).profile;
      const b = (await (await api(srv.base, '/api/profiles', 'POST', { name: 'Ben' })).json()).profile;
      assert.equal(a.name, 'Ana');
      assert.equal((await api(srv.base, '/api/profiles', 'POST', { name: 'ana' })).status, 409, 'names are unique, ignoring case');
      assert.equal((await api(srv.base, '/api/profiles', 'POST', { name: '   ' })).status, 400);
      assert.equal((await put(srv.base + '', { version: 1, who: 'A' }, {})).status, 200);   // single-profile mode still works
      const putTo = (id, doc, h = {}) => fetch(`${srv.base}/api/progress?profile=${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(doc) });
      assert.equal((await putTo(a.id, { version: 1, who: 'A' }, { 'If-Match': '0' })).status, 200);
      assert.equal((await putTo(b.id, { version: 1, who: 'B' }, { 'If-Match': '0' })).status, 200, 'each profile has its own revision');
      assert.equal((await (await api(srv.base, `/api/progress?profile=${a.id}`)).json()).who, 'A');
      assert.equal((await (await api(srv.base, `/api/progress?profile=${b.id}`)).json()).who, 'B');
      assert.equal((await api(srv.base, '/api/progress?profile=nope')).status, 404);
      assert.equal((await api(srv.base, `/api/profiles/${a.id}`, 'PATCH', { name: 'Ana Maria' })).status, 200);
      assert.equal((await api(srv.base, `/api/profiles/${a.id}`, 'PATCH', { name: 'BEN' })).status, 409);
      const del = await (await api(srv.base, `/api/profiles/${b.id}`, 'DELETE')).json();
      assert.ok(del.ok && /deleted-profiles/.test(del.keptAs));
      assert.deepEqual((await (await api(srv.base, '/api/profiles')).json()).profiles.map((p) => p.name), ['Ana Maria']);
      const kept = await fsp.readdir(path.join(dir, 'deleted-profiles'));
      assert.equal(kept.length, 1, 'the deleted profile is kept on disk');
      assert.equal((await fetch(`${srv.base}/api/profiles`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://evil.example' }, body: '{"name":"x"}' })).status, 403);
    } finally {
      await srv.stop();
      await fsp.rm(dir, { recursive: true, force: true });
    }
  });
});
