// Selection simulator: evidence for the README.
//
//   node test/sim/selection-sim.js [seed]
//
// A simulated learner plays many full lessons (until passed). Accuracy per character starts at
// baseAcc (weakAcc for "weak" characters) and improves slowly with practice. Persistent stats are
// carried across lessons via progress.js exactly as the app does.
//
// Choice mode (L0–L2) is run-based: each kana once per run; a miss resets the run and the missed
// kana is re-asked 2–3 prompts later. Reported: prompts per lesson, appearances, misses, re-ask
// delays, mean position of each kana within its run (weak kana should come earlier), and a check
// that no kana repeats within a run.
//
// Type mode (L3) is run-based too, over a 20-character weighted sample of the pool per run; a miss
// starts a fresh sample that includes the missed kana. Reported the same way, plus repeats within a
// run (must be 0). Stream mode (repeats allowed, the original L3 rule) reports max gap between
// appearances (soft window 2n, hard 3n).
import { createLesson, nextPrompt, submitAnswer } from '../../src/core/lesson.js';
import { defaultProgress, recordAnswer, statsById } from '../../src/core/progress.js';
import { weaknessScore, masteryBand } from '../../src/core/weakness.js';
import { mulberry32 } from '../../src/core/rng.js';
import { charsInSet, kanaById } from '../../src/core/kana.js';

const SEED = Number(process.argv[2]) || 2024;
const MIN = 60 * 1000;
const ids = (script, set) => charsInSet(script, set).map((k) => k.id);
const fmtDelays = (d) => Object.entries(d).sort((a, b) => a[0] - b[0]).map(([k, c]) => `${k}:${c}`).join('  ');

function runScenario({ name, pool, weak, lessons, level = 0, baseAcc = 0.92, weakAcc = 0.55, useStats = true }) {
  const rng = mulberry32(SEED);
  let now = 1_700_000_000_000;
  let progress = defaultProgress(now);
  const acc = Object.fromEntries(pool.map((id) => [id, weak.includes(id) ? weakAcc : baseAcc]));
  const zero = () => Object.fromEntries(pool.map((id) => [id, 0]));
  const appear = zero(), missCount = zero(), maxGap = zero(), posSum = zero(), posN = zero();
  const reaskDelay = {};
  let totalPrompts = 0, maxPrompts = 0, softViolations = 0, gapsTotal = 0, repeatsInRun = 0, runsCompletedFirstTry = 0;
  let mode;
  let perfect = 0;

  for (let l = 0; l < lessons; l++) {
    let st = createLesson({ level, poolIds: pool, now });
    mode = st.mode;
    const lastShown = zero();
    const pendingMiss = new Map(); // id → turn missed
    let runSeen = new Set();
    while (!st.passed) {
      const stats = useStats ? statsById(progress) : new Map();
      const r = nextPrompt(st, { statsById: stats, now, rng });
      st = r.state;
      const id = r.prompt.id;
      const t = st.turn;
      appear[id]++;
      const gap = t - lastShown[id];
      maxGap[id] = Math.max(maxGap[id], gap);
      gapsTotal++;
      if (gap > 2 * pool.length) softViolations++;
      lastShown[id] = t;
      if (mode !== 'stream') {
        posSum[id] += st.lapCovered.length + 1;
        posN[id]++;
        if (runSeen.has(id)) repeatsInRun++;
        runSeen.add(id);
      }
      if (pendingMiss.has(id)) {
        const d = t - pendingMiss.get(id);
        reaskDelay[d] = (reaskDelay[d] || 0) + 1;
        pendingMiss.delete(id);
      }
      const ok = rng() < acc[id];
      const entry = kanaById.get(id);
      const given = mode === 'choice'
        ? (ok ? id : r.prompt.options.find((o) => o.id !== id).id)
        : (ok ? entry.romaji : 'x');
      const res = submitAnswer(st, { given, now, rng });
      st = res.state;
      if (!ok) { missCount[id]++; pendingMiss.set(id, t); runSeen = new Set(); }
      progress = recordAnswer(progress, { charId: id, ok, given: res.givenRomaji, level, now });
      acc[id] = Math.min(0.97, acc[id] + (weak.includes(id) ? 0.0005 : 0.0002));
      now += 4000;
      if (st.prompts > 5000) throw new Error('lesson did not finish');
    }
    if (st.prompts === st.target) runsCompletedFirstTry++;
    perfect = st.target;
    totalPrompts += st.prompts;
    maxPrompts = Math.max(maxPrompts, st.prompts);
    now += 30 * MIN;
  }

  const n = pool.length;
  const total = Object.values(appear).reduce((a, b) => a + b, 0);
  console.log(`\n=== ${name} — ${mode} mode, pool ${n}, ${lessons} lessons, seed ${SEED}${useStats ? '' : ' (stats ignored: control)'}`);
  console.log(`prompts/lesson: mean ${(totalPrompts / lessons).toFixed(1)}, max ${maxPrompts} (perfect = ${perfect}); `
    + `perfect lessons: ${runsCompletedFirstTry}/${lessons}`);
  const runBased = mode !== 'stream';
  const posHdr = runBased ? '  meanPos' : '   maxGap';
  console.log(`char    weak  appearances  share   misses${posHdr}  weakness  band`);
  for (const id of pool) {
    const s = progress.chars[id];
    const col = runBased ? (posSum[id] / Math.max(1, posN[id])).toFixed(2) : String(maxGap[id]);
    console.log(
      `${(kanaById.get(id).char + ' ' + id).padEnd(8)}${(weak.includes(id) ? 'yes' : '').padEnd(6)}`
      + `${String(appear[id]).padStart(11)}  ${(100 * appear[id] / total).toFixed(1).padStart(5)}%`
      + `${String(missCount[id]).padStart(8)}${col.padStart(9)}`
      + `${weaknessScore(s, now).toFixed(2).padStart(10)}  ${masteryBand(s, now)}`,
    );
  }
  console.log(`re-ask delay after a miss (turns:count): ${fmtDelays(reaskDelay)}`);
  if (runBased) {
    console.log(`repeats within a run: ${repeatsInRun} (must be 0); meanPos = average position within the run (1..${perfect}), lower = earlier`);
    if (repeatsInRun !== 0) process.exitCode = 1;
  } else {
    console.log(`max gap overall: ${Math.max(...Object.values(maxGap))} (soft window 2n = ${2 * n}, hard 3n = ${3 * n}); `
      + `gaps beyond 2n: ${softViolations}/${gapsTotal} (${(100 * softViolations / gapsTotal).toFixed(2)}%)`);
  }
}

runScenario({ name: 'L0 hiragana k-row, weak on き and け', pool: ids('hiragana', 'k'), weak: ['h-ki', 'h-ke'], lessons: 300 });
runScenario({ name: 'Same learner, control without weakness stats', pool: ids('hiragana', 'k'), weak: ['h-ki', 'h-ke'], lessons: 300, useStats: false });
runScenario({ name: 'L1 hiragana wa·wo·n (3 chars), weak on を', pool: ids('hiragana', 'wn'), weak: ['h-wo'], lessons: 300, level: 1 });
runScenario({
  name: 'L2 mixed: hiragana s-row + katakana s-row, weak on シ and ソ',
  pool: [...ids('hiragana', 's'), ...ids('katakana', 's')], weak: ['k-shi', 'k-so'], lessons: 200, level: 2,
});
const typePool = ['a', 'k', 's'].flatMap((set) => [...ids('hiragana', set), ...ids('katakana', set)]);
runScenario({
  name: 'L3 typing (20 different in a row) over a·k·s rows, both scripts, weak on き and シ',
  pool: typePool, weak: ['h-ki', 'k-shi'], lessons: 100, level: 3,
});
runScenario({
  name: 'Same L3 drill, control without weakness stats',
  pool: typePool, weak: ['h-ki', 'k-shi'], lessons: 100, level: 3, useStats: false,
});
