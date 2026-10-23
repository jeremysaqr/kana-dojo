// Home screens for Learn / Recall / Mix / Type / Words: route maps, suggestions, locked explanations.
import { SCRIPTS, SET_DEFS, charsInSet, setKey, parseSetKey, allSetKeys } from '/core/kana.js';
import { wordById, readableWords, bestNextRow } from '/core/words.js';
import { L3_TARGET } from '/core/lesson.js';
import { nextLevel0Set, suggestWeakestSet, learnedSetKeys, autoPair } from '/core/selection.js';
import { mulberry32 } from '/core/rng.js';
import * as store from '../store.js';
import { ui, mount, launchLesson } from '../app.js';
import { routeHTML, isPassed, lockedHTML, kanaRow } from '../components.js';
import { SET_NAMES, SCRIPT_LABEL } from '../lines.js';
import { learnedPool } from '../analytics.js';

const TAB_LEVEL = { learn: 0, recall: 1, mix: 2, type: 3, words: 4 };
const WORDS_TO_OPEN = 15;                     // Level 4 opens once this many words are readable
let picked = { learn: null, recall: null };   // per-visit overrides (set ids for ui.script)
let mixChoice = [];                           // chosen set keys for Mix
let autoMix = null;
let mixOpen = false;                          // "choose two rows" disclosure state on Mix

// Persistent help for every home tab (the welcome panel only shows before the first lesson).
function helpHTML() {
  return `
  <details class="help">
    <summary>How levels work</summary>
    <div class="help-body">
      <dl>
        <dt>Learn</dt><dd>Study a row, then quiz it. Answer each character once in a row to pass. Passing marks the stop with an <b class="badge solid">L</b> badge and unlocks the row everywhere else.</dd>
        <dt>Recall</dt><dd>Quiz a row you've passed in Learn, with no study first. Passing adds an <b class="badge solid">R</b> badge.</dd>
        <dt>Mix</dt><dd>Every character from two passed rows (up to ten), in either script.</dd>
        <dt>Type</dt><dd>Type the romaji instead of picking it. Twenty different characters in a row, from every row you've passed. Opens at ${L3_TARGET} learned characters.</dd>
        <dt>Words</dt><dd>Read real words made only of kana you've learned, in the script you pick at the top. Opens after Type. First type how a word reads, then pick what it means. Ten different words in a row to pass each. A misread syllable counts against that kana in Stats.</dd>
      </dl>
      <p>A miss sends the train back to the first stop, and the missed character comes back within a few prompts. Every answer feeds Stats.</p>
    </div>
  </details>`;
}

function badgesFor(p, script, id) {
  const b = [];
  if (isPassed(p, script, id, 0)) b.push({ text: 'L', title: 'Passed Learn', solid: true });
  if (isPassed(p, script, id, 1)) b.push({ text: 'R', title: 'Passed Recall', solid: true });
  return b;
}

function setTitle(script, setId) {
  return `<span class="nowrap">${SET_NAMES[setId]}</span> <span class="kana" lang="ja">${kanaRow(script, setId)}</span>`;
}

function nextUpHTML({ script, setId, heading, sub, startLabel, extra = '' }) {
  return `
  <section class="panel next-up">
    <div class="what">
      <span class="kana" lang="ja" aria-hidden="true">${charsInSet(script, setId)[0].char}</span>
      <div><h2>${heading}</h2><p>${sub}</p></div>
    </div>
    <div class="actions">${extra}<button type="button" class="btn primary" data-action="start">${startLabel} <kbd>Enter</kbd></button></div>
  </section>`;
}

function learnView(p) {
  const script = ui.script;
  const suggested = nextLevel0Set(p, script, SET_DEFS, Date.now());
  const chosen = picked.learn && picked.learn !== suggested ? picked.learn : null;
  const setId = chosen || suggested;
  const firstEver = p.lessons.length === 0;
  const passedCount = SET_DEFS.filter((d) => isPassed(p, script, d.id)).length;

  const welcome = firstEver ? `
  <section class="panel welcome">
    <span class="big kana" lang="ja" aria-hidden="true">あ</span>
    <div>
      <h2>Welcome to Kana Dojo</h2>
      <p class="lede">You'll learn kana one row at a time. Each row is a line on the map below; each character is a stop.</p>
      <ol>
        <li><strong>Learn</strong>: study a row, then answer each character once in a row to pass.</li>
        <li><strong>Recall</strong>: quiz a row you've passed, no study first.</li>
        <li><strong>Mix</strong> two rows, then <strong>Type</strong> answers from everything you know.</li>
      </ol>
    </div>
  </section>` : '';

  const heading = chosen ? `You picked: ${setTitle(script, setId)}` : `Next stop: ${setTitle(script, setId)}`;
  const sub = firstEver
    ? `Every ${SCRIPT_LABEL[script].toLowerCase()} journey starts with the vowels. Study the five, then ride the line.`
    : chosen ? 'Study it, then answer each character once in a row to pass.' : (isPassed(p, script, setId) ? 'Every row passed. Here is one to keep fresh.' : 'Study it, then answer each character once in a row to pass.');
  const extra = chosen ? '<button type="button" class="btn quiet" data-action="unpick">Back to suggested</button>' : '';

  return `
  <div class="page-head"><div><h1>Learn ${SCRIPT_LABEL[script]}</h1><p>Study a row, then quiz it. Pick any stop on the map to choose a different row.</p></div></div>
  ${welcome}
  ${nextUpHTML({ script, setId, heading, sub, startLabel: 'Start lesson', extra })}
  ${routeHTML({
    script, title: `${SCRIPT_LABEL[script]} line`, note: `${passedCount} of ${SET_DEFS.length} rows passed`,
    stateOf: (id) => ({ state: id === setId ? 'next' : isPassed(p, script, id) ? 'passed' : 'open', pressed: id === setId && !!chosen, label: id === setId && chosen ? '' : undefined, badges: badgesFor(p, script, id) }),
  })}
  ${legend(false, !chosen)}
  ${firstEver ? '' : helpHTML()}`;
}

// `suggested`: the ringed stop is the app's suggestion, not something the learner picked.
function legend(showLocked = true, suggested = false) {
  return `<div class="route-legend" aria-hidden="true"><span><i class="p"></i>Passed</span><span><i class="sel"></i>${suggested ? 'Next stop' : 'Selected'}</span><span><i></i>Not yet passed</span>${showLocked ? '<span><i class="l"></i>Locked</span>' : ''}<span><b class="badge solid">L</b>Learn passed</span><span><b class="badge solid">R</b>Recall passed</span></div>`;
}

function recallView(p) {
  const script = ui.script;
  const passed = SET_DEFS.filter((d) => isPassed(p, script, d.id));
  const head = `<div class="page-head"><div><h1>Recall ${SCRIPT_LABEL[script]}</h1><p>A quiz on a row you've passed in Learn. No study first.</p></div></div>`;
  if (passed.length === 0) {
    return head + lockedHTML('Recall opens after your first row', `Pass a row in Learn and it appears here. You've passed 0 ${SCRIPT_LABEL[script].toLowerCase()} rows so far.`)
      + `<p style="margin-top:16px"><a class="btn" href="#/learn">Go to Learn</a></p>`;
  }
  const suggested = suggestWeakestSet(p, script, Date.now());
  const setId = picked.recall && isPassed(p, script, picked.recall) ? picked.recall : suggested;
  return head + nextUpHTML({
    script, setId,
    heading: `${setId === suggested ? 'Weakest row' : 'You picked'}: ${setTitle(script, setId)}`,
    sub: 'Answer each character once in a row to pass.',
    startLabel: 'Start recall',
  }) + routeHTML({
    script, title: `${SCRIPT_LABEL[script]} line`, note: `${passed.length} ${passed.length === 1 ? 'row' : 'rows'} available`,
    stateOf: (id) => ({ state: !isPassed(p, script, id) ? 'locked' : id === setId ? 'next' : 'passed', pressed: isPassed(p, script, id) ? id === setId && setId !== suggested : undefined, label: id === setId && setId !== suggested ? '' : undefined, badges: badgesFor(p, script, id) }),
  }) + legend(true, setId === suggested) + helpHTML();
}

function mixView(p) {
  const learned = learnedSetKeys(p);
  const head = `<div class="page-head"><div><h1>Mix two rows</h1><p>Every character from two rows you've passed (up to ten), in either script. Answer each once in a row to pass.</p></div></div>`;
  if (learned.length < 2) {
    return head + lockedHTML('Mix opens once you\'ve passed two rows', `Pass two rows in Learn (either script). You've passed ${learned.length}.`)
      + `<p style="margin-top:16px"><a class="btn" href="#/learn">Go to Learn</a></p>`;
  }
  if (!autoMix || !autoMix.every((k) => learned.includes(k))) autoMix = autoPair(p, Date.now(), mulberry32(Date.now() >>> 0));
  mixChoice = mixChoice.filter((k) => learned.includes(k));
  const name = (k) => { const { script, setId } = parseSetKey(k); return `${SET_NAMES[setId]} <span class="muted">${SCRIPT_LABEL[script]}</span> <span class="kana" lang="ja">${kanaRow(script, setId)}</span>`; };
  const chooseReady = mixChoice.length === 2;
  return head + `
  <section class="panel next-up">
    <div><h2>Auto pick, weighted toward your weak spots</h2><p>${name(autoMix[0])}<br>${name(autoMix[1])}</p></div>
    <div class="actions"><button type="button" class="btn quiet" data-action="reshuffle">Pick again</button><button type="button" class="btn primary" data-action="start-auto">Start mix <kbd>Enter</kbd></button></div>
  </section>
  <details class="choose"${mixOpen || mixChoice.length ? ' open' : ''}>
  <summary>Or choose two rows yourself</summary>
  <section class="panel next-up">
    <div><h2>Choose two rows</h2><p>${mixChoice.length === 0 ? 'Select two passed stops on the maps below.' : mixChoice.map(name).join('<br>') + (mixChoice.length === 1 ? '<br><span class="muted">Select one more.</span>' : '')}</p></div>
    <div class="actions">${mixChoice.length ? '<button type="button" class="btn quiet" data-action="clear-mix">Clear</button>' : ''}<button type="button" class="btn" data-action="start-chosen" ${chooseReady ? '' : 'disabled'}>Start chosen mix</button></div>
  </section>
  ${SCRIPTS.map((script) => routeHTML({
    script, title: `${SCRIPT_LABEL[script]} line`, note: '',
    stateOf: (id) => {
      const key = setKey(script, id);
      if (!learned.includes(key)) return { state: 'locked' };
      return { state: 'passed', pressed: mixChoice.includes(key), badges: badgesFor(p, script, id) };
    },
  })).join('')}
  </details>
  ${helpHTML()}`;
}

function typeView(p) {
  const learned = learnedSetKeys(p);
  const pool = learnedPool(p);
  const head = `<div class="page-head"><div><h1>Type the sound</h1><p>No buttons: type the romaji. Twenty different characters in a row, drawn from every row you've passed, both scripts, weighted toward weak spots.</p></div></div>`;
  if (pool.length < L3_TARGET) {
    return head + lockedHTML(`Type opens at ${L3_TARGET} learned characters`, `You have ${pool.length}. Each row you pass in Learn adds its characters, in either script.`)
      + `<p style="margin-top:16px"><a class="btn" href="#/learn">Go to Learn</a></p>`;
  }
  const runs = p.typeRuns.length;
  return head + `
  <section class="panel next-up">
    <div><h2>${pool.length} characters from ${learned.length} ${learned.length === 1 ? 'row' : 'rows'}</h2>
    <p>Each run is twenty different characters. A miss starts a fresh run, and the missed one comes back early in it. Common spellings all count: shi or si, chi or ti, tsu or tu, fu or hu, ji or zi. ${runs ? `Passed ${runs} ${runs === 1 ? 'time' : 'times'} so far.` : ''}</p></div>
    <div class="actions"><button type="button" class="btn primary" data-action="start-type">Start typing <kbd>Enter</kbd></button></div>
  </section>
  ${SCRIPTS.map((script) => routeHTML({
    script, title: `${SCRIPT_LABEL[script]} line`, interactive: false,
    note: `${SET_DEFS.filter((d) => isPassed(p, script, d.id)).length} rows in the pool`,
    stateOf: (id) => ({ state: isPassed(p, script, id) ? 'passed' : 'locked', badges: badgesFor(p, script, id) }),
  })).join('')}
  ${helpHTML()}`;
}

function rowName(key) {
  const { script, setId } = parseSetKey(key);
  return `the ${SET_NAMES[setId]} (${SCRIPT_LABEL[script]})`;
}

function wordChips(ids) {
  return `<ul class="word-chips" aria-label="Readable words">${ids.map((id) => { const w = wordById.get(id); return `<li class="chip"><span class="kana" lang="ja">${w.kana}</span></li>`; }).join('')}</ul>`;
}

/** Readable words in one script (the Words tab follows the hiragana/katakana switch). */
function scriptWords(p, script) {
  return readableWords(learnedSetKeys(p)).filter((id) => wordById.get(id).script === script);
}

function wordsView(p) {
  const script = ui.script;
  const learned = learnedSetKeys(p);
  const pool = scriptWords(p, script);
  const next = bestNextRow(learned, allSetKeys().filter((k) => parseSetKey(k).script === script));
  const grows = next ? ` Passing ${rowName(next.key)} adds ${next.adds}.` : '';
  const head = `<div class="page-head"><div><h1>Read ${SCRIPT_LABEL[script]} words</h1><p>Real words, made only of ${SCRIPT_LABEL[script].toLowerCase()} you've learned. The list grows with every row you pass.</p></div></div>`;
  const learnedChars = learnedPool(p).length;
  if (learnedChars < L3_TARGET) {
    return head + lockedHTML('Words open after Type', `Type opens at ${L3_TARGET} learned characters, and Words right after. You have ${learnedChars}.`)
      + (pool.length ? `<p class="muted" style="margin:16px 0 8px;font-size:14px">Already readable:</p>${wordChips(pool)}` : '')
      + `<p style="margin-top:16px"><a class="btn" href="#/learn">Go to Learn</a></p>${helpHTML()}`;
  }
  if (pool.length < WORDS_TO_OPEN) {
    return head + lockedHTML(`${pool.length} of ${WORDS_TO_OPEN} ${SCRIPT_LABEL[script].toLowerCase()} words ready`, `${SCRIPT_LABEL[script]} words open once you can read ${WORDS_TO_OPEN} of them.${grows}`)
      + (pool.length ? `<p class="muted" style="margin:16px 0 8px;font-size:14px">Already readable:</p>${wordChips(pool)}` : '')
      + `<p style="margin-top:16px"><a class="btn" href="#/learn">Go to Learn</a></p>${helpHTML()}`;
  }
  const readRuns = p.wordRuns.length;
  const meaningRuns = p.meaningRuns.length;
  const sample = pool.slice(0, 24);
  return head + `
  <section class="panel next-up">
    <div class="what"><span class="badge solid level-badge" aria-hidden="true">4</span><div><h2>Read the word</h2>
    <p>Type how each word reads, in romaji. Ten different words in a row. ${readRuns ? `Passed ${readRuns} ${readRuns === 1 ? 'time' : 'times'}.` : ''}</p></div></div>
    <div class="actions"><button type="button" class="btn ${meaningRuns || !readRuns ? 'primary' : ''}" data-action="start-read">Start reading${meaningRuns || !readRuns ? ' <kbd>Enter</kbd>' : ''}</button></div>
  </section>
  ${readRuns ? `
  <section class="panel next-up">
    <div class="what"><span class="badge solid level-badge" aria-hidden="true">5</span><div><h2>What does it mean?</h2>
    <p>Pick the English meaning from three. The last level. ${meaningRuns ? `Passed ${meaningRuns} ${meaningRuns === 1 ? 'time' : 'times'}.` : ''}</p></div></div>
    <div class="actions"><button type="button" class="btn ${meaningRuns ? '' : 'primary'}" data-action="start-meaning">Start meanings${meaningRuns ? '' : ' <kbd>Enter</kbd>'}</button></div>
  </section>` : lockedHTML('What does it mean? opens after Read the word', 'Pass Read the word once and the last level opens: picking what each word means.')}
  <section class="panel words-ready">
    <div class="route-head"><h2>${pool.length} ${SCRIPT_LABEL[script].toLowerCase()} words you can read</h2><span class="muted">${next ? `Passing ${rowName(next.key)} adds ${next.adds}` : 'Every word in the list'}</span></div>
    ${wordChips(sample)}${pool.length > sample.length ? `<p class="muted" style="margin-top:10px;font-size:14px">and ${pool.length - sample.length} more</p>` : ''}
  </section>
  ${helpHTML()}`;
}

export function renderHome(tab) {
  const draw = () => {
    const p = store.get();
    const was = document.activeElement?.closest?.('[data-action]')?.dataset.action;
    const html = { learn: learnView, recall: recallView, mix: mixView, type: typeView, words: wordsView }[tab](p);
    mount(html);
    if (was) {
      // the same control if it is still there, else the panel's primary action
      (app.querySelector(`[data-action="${was}"]:not(:disabled)`) || app.querySelector('[data-action^="start"]:not(:disabled)'))?.focus();
    }
  };
  const app = document.getElementById('app');
  draw();

  const start = (action) => {
    const p = store.get();
    const script = ui.script;
    if (tab === 'learn') {
      const suggested = nextLevel0Set(p, script, SET_DEFS, Date.now());
      const setId = picked.learn || suggested;
      picked.learn = null;
      launchLesson({ kind: 'set', level: 0, sets: [setKey(script, setId)] });
    } else if (tab === 'recall') {
      const setId = (picked.recall && isPassed(p, script, picked.recall)) ? picked.recall : suggestWeakestSet(p, script, Date.now());
      if (!setId) return;
      launchLesson({ kind: 'set', level: 1, sets: [setKey(script, setId)] });
    } else if (tab === 'mix') {
      const sets = action === 'start-chosen' ? mixChoice : autoMix;
      if (!sets || sets.length !== 2) return;
      autoMix = null;
      launchLesson({ kind: 'mix', level: 2, sets: [...sets] });
    } else if (tab === 'type') {
      if (learnedPool(p).length < L3_TARGET) return;
      launchLesson({ kind: 'type', level: 3, sets: learnedSetKeys(p) });
    } else if (tab === 'words') {
      const pool = scriptWords(p, script);
      if (pool.length < WORDS_TO_OPEN || learnedPool(p).length < L3_TARGET) return;
      if (action === 'start-meaning' && p.wordRuns.length === 0) return;
      const kind = action === 'start-meaning' ? 'meaning' : 'read';
      launchLesson({ kind, level: kind === 'meaning' ? 5 : 4, sets: [], script, poolIds: pool });
    }
  };

  const onClick = (e) => {
    const st = e.target.closest('.station');
    if (st && !st.disabled) {
      const { set, script } = st.dataset;
      if (tab === 'learn' || tab === 'recall') picked[tab] = set;
      if (tab === 'mix') {
        const key = setKey(script, set);
        mixChoice = mixChoice.includes(key) ? mixChoice.filter((k) => k !== key) : [...mixChoice, key].slice(-2);
      }
      draw();
      document.querySelector(`.station[data-set="${set}"][data-script="${script}"]`)?.focus();
      return;
    }
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'unpick') { picked.learn = null; draw(); return; }
    if (a === 'reshuffle') {
      autoMix = autoPair(store.get(), Date.now(), mulberry32((Date.now() ^ 0x9e3779b9) >>> 0));
      draw();
      const live = document.getElementById('live');
      const plain = (k) => { const { script, setId } = parseSetKey(k); return `${SET_NAMES[setId]} (${SCRIPT_LABEL[script]})`; };
      const pair = autoMix;                         // Start may clear autoMix before this fires
      if (live && pair) { live.textContent = ''; setTimeout(() => { live.textContent = `Picked ${plain(pair[0])} and ${plain(pair[1])}.`; }, 60); }
      return;
    }
    if (a === 'clear-mix') { mixChoice = []; draw(); return; }
    if (a.startsWith('start')) start(a);
  };
  app.addEventListener('click', onClick);
  const onToggle = (e) => { if (e.target.matches?.('details.choose')) mixOpen = e.target.open; };
  app.addEventListener('toggle', onToggle, true);

  return {
    onKey(e) {
      // Enter on a Learn/Recall stop goes straight to that row (Space still just selects it).
      const st = e.target.closest?.('.station');
      if (e.key === 'Enter' && st && !st.disabled && (tab === 'learn' || tab === 'recall')) {
        e.preventDefault();
        picked[tab] = st.dataset.set;
        start('start');
        return;
      }
      if (e.key === 'Enter' && (e.target === document.body || e.target === app)) {
        const primary = app.querySelector('[data-action^="start"].primary:not(:disabled)');
        if (primary) { e.preventDefault(); start(primary.dataset.action); }
      }
    },
    destroy() { app.removeEventListener('click', onClick); app.removeEventListener('toggle', onToggle, true); },
  };
}
