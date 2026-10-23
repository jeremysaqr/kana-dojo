// Lesson flow: study (Level 0 only) → quiz (choice or typed; kana or, at Levels 4–5, words) →
// arrival summary.
// The no-reveal rule lives here: in a quiz the sign hides romaji, line colour and station code, the
// speech gate is closed when a prompt appears, and both open only after the answer is submitted.
import { kanaById, charsInSetKey, parseSetKey, SET_DEFS, setKey } from '/core/kana.js';
import { wordById } from '/core/words.js';
import { createLesson, nextPrompt, submitAnswer } from '/core/lesson.js';
import { alignWord } from '/core/matching.js';
import { mulberry32 } from '/core/rng.js';
import { nextLevel0Set } from '/core/selection.js';
import { recordAnswer, recordWordAnswer, markSetPassed, recordLesson, recordMix, recordTypeRun, recordWordRun, setLastL0, statsById, wordStatsById } from '/core/progress.js';
import * as store from '../store.js';
import * as speech from '../speech.js';
import { mount, focusMain, launchLesson, route, confirmLeave, toggleSettings } from '../app.js';
import { signHTML, wordSignHTML, rideHTML, routeHTML, isPassed } from '../components.js';
import { SET_NAMES, SCRIPT_LABEL, LINES } from '../lines.js';
import { icon } from '../icons.js';

const LEVEL_NAME = ['Learn', 'Recall', 'Mix', 'Type', 'Read', 'Meaning'];
const LEVEL_MODE = { 3: 'type', 4: 'read', 5: 'meaning' };   // everything else is 'choice'
const AUTO_ADVANCE_MS = 1100;

let active = null;   // the running lesson controller, or null

export function isLessonActive() {
  return !!active && (active.phase === 'study' || active.phase === 'quiz');
}

/** True when leaving now would end a quiz that already has answers (worth confirming). */
export function lessonHasProgress() {
  return !!active && active.phase === 'quiz' && !!active.lesson && active.lesson.log.length > 0;
}

// One pending announcement at a time: a newer one (or a fresh quiz prompt) cancels it, and `onlyIf`
// is re-checked when it fires. A study card's "き, ki" must never land after the quiz has opened.
let announceTimer = null;
function announce(text, { onlyIf } = {}) {
  const el = document.getElementById('live');
  if (!el) return;
  clearTimeout(announceTimer);
  el.textContent = '';
  announceTimer = setTimeout(() => { if (!onlyIf || onlyIf()) el.textContent = text; }, 60);
}
function silence() {
  clearTimeout(announceTimer);
  const el = document.getElementById('live');
  if (el) el.textContent = '';
}

/** Called when the learner navigates away mid-lesson: record it as ended early (or passed, if it was). */
export function endLessonSilently() {
  if (!active) return;
  active.quit({ silent: true });
}

/** Hold the post-answer auto-advance while the leave dialog asks (nothing moves behind it). */
export function pauseLesson() { active?.pause?.(); }
export function resumeLesson() { active?.resume?.(); }

function seed() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0];
}

function describe(spec) {
  const scripts = spec.script ? [spec.script] : [...new Set(spec.sets.map((k) => parseSetKey(k).script))];
  const script = scripts.length === 1 ? scripts[0] : 'mixed';
  let title;
  if (spec.title) title = spec.title;                  // display-only override (e.g. a one-character drill)
  else if (spec.kind === 'weak') title = 'Weak-spot drill';
  else if (spec.kind === 'confusion') title = 'Confusion drill';
  else if (spec.kind === 'type') title = 'All learned rows';
  else if (spec.kind === 'read') title = `Read the word${spec.script ? ` (${SCRIPT_LABEL[spec.script]})` : ''}`;
  else if (spec.kind === 'meaning') title = `What does it mean${spec.script ? ` (${SCRIPT_LABEL[spec.script]})` : ''}`;
  else title = spec.sets.map((k) => { const p = parseSetKey(k); return `${SET_NAMES[p.setId]}${scripts.length > 1 || spec.kind === 'mix' ? ` (${SCRIPT_LABEL[p.script]})` : ''}`; }).join(' + ');
  return { script, title };
}

export function startLesson(spec) {
  const app = document.getElementById('app');
  const poolIds = spec.poolIds || spec.sets.flatMap((k) => charsInSetKey(k).map((c) => c.id));
  const { script, title } = describe(spec);
  const rng = mulberry32(seed());
  const mode = LEVEL_MODE[spec.level] || 'choice';
  const isWord = mode === 'read' || mode === 'meaning';
  const typed = mode === 'type' || mode === 'read';
  const picks = mode === 'choice' || mode === 'meaning';
  const item = (id) => (isWord ? wordById.get(id) : kanaById.get(id));
  const textOf = (id) => (isWord ? wordById.get(id).kana : kanaById.get(id).char);   // what is shown and spoken
  const runLabel = spec.drill ? 'Each word once, in a row' : { choice: 'Each character once, in a row', type: 'Twenty different characters in a row', read: 'Ten different words in a row', meaning: 'Ten different words in a row' }[mode];
  const isDrill = spec.kind === 'weak' || spec.kind === 'confusion' || !!spec.drill;   // drills never count as level passes
  const levelLabel = isDrill ? 'Drill' : `Level ${spec.level} · ${LEVEL_NAME[spec.level]}`;

  const c = {
    phase: spec.level === 0 && spec.kind === 'set' ? 'study' : 'quiz',
    studyIdx: 0,
    lesson: null,
    result: null,
    startedAt: Date.now(),
    timer: null,
    recorded: false,
    ridePct: 0,
    quit,
    pause() { clearTimeout(c.timer); c.timer = null; },
    resume() { if (c.phase === 'quiz' && c.result?.correct) c.timer = setTimeout(advance, AUTO_ADVANCE_MS); },
  };
  active = c;

  // ---------- study ----------
  function renderStudy() {
    speech.openGate();
    const id = poolIds[c.studyIdx];
    const prev = c.studyIdx > 0 ? kanaById.get(poolIds[c.studyIdx - 1]) : null;
    const next = c.studyIdx < poolIds.length - 1 ? kanaById.get(poolIds[c.studyIdx + 1]) : null;
    const strip = `
      <button type="button" class="nb prev" data-action="prev" ${prev ? '' : 'disabled'} aria-label="${prev ? `Previous: ${prev.char}, ${prev.romaji}` : 'No previous character'}">${icon('left')}${prev ? `<span class="kana" lang="ja">${prev.char}</span> ${prev.romaji}` : ''}</button>
      <span class="mid">${c.studyIdx + 1} of ${poolIds.length}</span>
      <button type="button" class="nb next" data-action="next-card" ${next ? '' : 'disabled'} aria-label="${next ? `Next: ${next.char}, ${next.romaji}` : 'No next character'}">${next ? `${next.romaji} <span class="kana" lang="ja">${next.char}</span>` : ''}${icon('right')}</button>`;
    mount(`
    <div class="lesson">
      <div class="lesson-top">
        <h1 class="sr-only">${title}: study</h1>
        <div class="crumb"><span>${levelLabel}</span><span aria-hidden="true">·</span><strong>${title}</strong><span aria-hidden="true">·</span><span>Study</span></div>
        <button type="button" class="btn quiet" data-action="quit">End lesson</button>
      </div>
      ${signHTML({ id, reveal: true, strip, enter: true, label: 'Study card' })}
      <div class="lesson-actions">
        <div class="dots" aria-hidden="true">${poolIds.map((_, i) => `<i class="${i <= c.studyIdx ? 'on' : ''}"></i>`).join('')}</div>
        <span class="keys"><span><kbd>←</kbd> <kbd>→</kbd> browse</span><span><kbd>Space</kbd> next</span>${speech.hasJapaneseVoice() ? '<span><kbd>H</kbd> hear</span>' : ''}</span>
        <span class="spacer"></span>
        ${speech.hasJapaneseVoice() ? `<button type="button" class="btn" data-action="hear">${icon('play')}Hear it</button>` : ''}
        <button type="button" class="btn primary" data-action="start-quiz">Start quiz <kbd>Enter</kbd></button>
      </div>
      <p class="muted" style="font-size:14px">Browse as long as you like. In the quiz you'll answer each character once in a row to pass.</p>
      ${soundHintHTML()}
    </div>`);
    speech.say(kanaById.get(id).char);
  }

  function moveStudy(delta) {
    const n = c.studyIdx + delta;
    if (n < 0 || n >= poolIds.length) return;
    c.studyIdx = n;
    renderStudy();
    const k = kanaById.get(poolIds[n]);
    announce(`${k.char}, ${k.romaji}. ${n + 1} of ${poolIds.length}.`, { onlyIf: () => c.phase === 'study' && active === c });   // study shows everything anyway
  }

  // ---------- quiz ----------
  function beginQuiz() {
    silence();                                       // nothing from the study cards may carry over
    if (spec.level === 0 && spec.kind === 'set') {
      const { script: sc, setId } = parseSetKey(spec.sets[0]);
      store.set(setLastL0(store.get(), sc, setId));
    }
    c.phase = 'quiz';
    c.lesson = createLesson({ level: spec.level, poolIds, now: Date.now(), mode });
    c.ridePct = 0;
    c.startedAt = c.startedAt || Date.now();
    focusMain();
    nextQuestion();
  }

  function nextQuestion() {
    clearTimeout(c.timer);
    speech.closeGate();                                // nothing may be heard for a fresh prompt
    const r = nextPrompt(c.lesson, { statsById: (isWord ? wordStatsById : statsById)(store.get()), now: Date.now(), rng });
    c.lesson = r.state;
    c.result = null;
    renderQuiz(true);
    if (typed) document.getElementById('type-input')?.focus();
    announce(`Next ${isWord ? 'word' : 'character'}. ${c.lesson.streak} of ${c.lesson.target} in a row.`);
  }

  function doneIds() {
    return c.lesson.lapCovered;          // every app mode is run-based: the run so far, in order
  }

  function renderQuiz(enter = false) {
    const L = c.lesson;
    const id = L.current.id;
    const k = item(id);
    const res = c.result;
    const answered = !!res;
    let mid = { choice: 'Which sound is this?', type: 'Type the sound', read: 'Type how it reads', meaning: 'What does it mean?' }[mode];
    if (answered) mid = res.correct ? `${icon('check')}Correct` : `${icon('cross')}Not quite`;
    const strip = `<span></span><span class="mid">${mid}</span><span></span>`;

    let body;
    if (picks) {
      const labelOf = (o) => (mode === 'meaning' ? o.en : o.romaji);
      const isAnswer = (o) => (mode === 'meaning' ? o.id === id : o.romaji === res.canonical);
      body = `<div class="options ${mode === 'meaning' ? 'meanings' : ''}" id="options" role="group" tabindex="-1" aria-label="Answer options, press 1, 2 or 3">${L.current.options.map((o, i) => {
        let state = '';
        if (answered) {
          if (isAnswer(o)) state = 'correct';
          else if (o.id === res.givenId) state = 'wrong';
          else state = 'dim';
        }
        const mark = state === 'correct' ? icon('check') : state === 'wrong' ? icon('cross') : '';
        return `<button type="button" class="opt" data-opt="${o.id}" data-state="${state}" ${answered ? 'disabled' : ''} aria-label="${i + 1}: ${escapeAttr(labelOf(o))}${state === 'correct' ? ', correct answer' : state === 'wrong' ? ', your answer, incorrect' : ''}"><kbd>${i + 1}</kbd>${escapeHTML(labelOf(o))}<span class="mark">${mark}</span></button>`;
      }).join('')}</div>`;
    } else {
      body = `<form class="typebox" data-form="type" autocomplete="off">
        <label for="type-input" class="sr-only">${isWord ? 'Type the word in romaji' : 'Type the romaji'}</label>
        <input id="type-input" name="answer" type="text" maxlength="${isWord ? 60 : 40}" autocapitalize="off" autocorrect="off" spellcheck="false"
          placeholder="${isWord ? 'type the word' : 'type the sound'}" ${answered ? 'readonly' : ''} aria-invalid="${answered && !res.correct}" value="${answered ? escapeAttr(clip(res.typed)) : ''}">
        <button type="submit" class="btn primary" ${answered ? 'hidden' : ''}>Check</button>
      </form>`;
    }

    let feedback = '';
    if (answered) {
      const kanaSpan = `<span class="kana" lang="ja">${textOf(id)}</span>`;
      if (isWord) {
        const means = escapeHTML(k.en[0]);
        const plusMeaning = sameAsRomaji(k) ? '' : `: ${means}`;   // トマト is tomato, not "tomato: tomato"
        if (res.correct) {
          feedback = mode === 'read'
            ? `<strong>Correct.</strong> ${kanaSpan} is ${k.romaji}${plusMeaning}.`
            : `<strong>Correct.</strong> ${kanaSpan} (${k.romaji}) means ${means}.`;
        } else {
          const chose = mode === 'read' ? clip(res.typed) : wordById.get(res.givenId)?.en[0];
          feedback = mode === 'read'
            ? `<strong>Not quite.</strong> ${kanaSpan} is ${k.romaji}${plusMeaning}.${chose ? ` You typed ${escapeHTML(chose)}.` : ''} It comes back in a moment.`
            : `<strong>Not quite.</strong> ${kanaSpan} (${k.romaji}) means ${means}.${chose ? ` You chose ${escapeHTML(chose)}.` : ''} It comes back in a moment.`;
        }
      } else if (res.correct) {
        feedback = `<strong>Correct.</strong> ${kanaSpan} is ${k.romaji}.`;
      } else {
        const chose = mode === 'choice' ? kanaById.get(res.givenId)?.romaji : clip(res.typed);
        feedback = `<strong>Not quite.</strong> That's ${kanaSpan}, ${k.romaji}.${chose ? ` You ${mode === 'choice' ? 'chose' : 'typed'} ${escapeHTML(chose)}.` : ''} It comes back in a moment.`;
      }
      if (res.correct && res.nonStandard) feedback += ` <span class="muted">Standard spelling: ${k.romaji}.</span>`;
    }
    const passedNow = answered && L.passed;
    const nextLabel = passedNow ? 'Finish' : 'Next';
    const result = answered ? (res.correct ? 'ok' : 'miss') : '';
    const sign = isWord
      ? wordSignHTML({ word: k, reveal: answered, meaning: mode === 'read', strip, result, enter, label: 'Quiz card' })
      : signHTML({ id, reveal: answered, strip, result, enter, label: 'Quiz card', quiz: true });

    mount(`
    <div class="lesson">
      <div class="lesson-top">
        <h1 class="sr-only">${title}: quiz</h1>
        <div class="crumb"><span>${levelLabel}</span><span aria-hidden="true">·</span><strong>${title}</strong></div>
        <button type="button" class="btn quiet" data-action="quit">End lesson</button>
      </div>
      ${sign}
      ${rideHTML({ target: L.target, done: doneIds(), label: runLabel, fromPct: c.ridePct, mode: answered && !res.correct ? 'reset' : '', textOf, words: isWord })}
      ${body}
      <p class="feedback ${result}">${feedback}</p>
      <div class="lesson-actions">
        <span class="keys">${picks ? '<span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> answer</span>' : '<span><kbd>Enter</kbd> check</span>'}<span><kbd>Enter</kbd> next</span>${answered && speech.hasJapaneseVoice() ? '<span><kbd>H</kbd> hear again</span>' : ''}</span>
        <span class="spacer"></span>
        ${answered && speech.hasJapaneseVoice() ? `<button type="button" class="btn" data-action="hear">${icon('play')}Hear it</button>` : ''}
        ${answered ? `<button type="button" class="btn primary" data-action="next" id="next-btn">${nextLabel} <kbd>Enter</kbd></button>` : ''}
      </div>
      ${answered ? soundHintHTML() : ''}
    </div>`);
    animateRide();
    if (answered) {
      const plain = document.querySelector('.feedback')?.textContent.trim() || '';
      announce(`${plain} ${L.passed ? 'Lesson passed.' : `${L.streak} of ${L.target} in a row.`}`);
      const next = document.getElementById('next-btn');
      next?.focus({ preventScroll: true });
      next?.scrollIntoView({ block: 'nearest' });
    } else if (picks) {
      document.getElementById('options')?.focus({ preventScroll: true });
    }
  }

  function animateRide() {
    const fill = document.querySelector('.ride .fill');
    if (!fill) return;
    c.ridePct = Number(fill.dataset.to);
    fill.getBoundingClientRect();                         // commit the start width so the change animates
    fill.style.width = `${fill.dataset.to}%`;
  }

  function answer(given) {
    if (c.phase !== 'quiz' || c.result) return;
    const L = c.lesson;
    const id = L.current.id;
    const now = Date.now();
    const r = submitAnswer(L, { given, now, rng });
    c.lesson = r.state;
    c.result = { correct: r.correct, canonical: r.canonical, nonStandard: r.nonStandard, givenId: picks ? given : null, typed: typed ? given : null };
    const ans = { ok: r.correct, given: r.givenRomaji, level: spec.level, now };
    let p = isWord ? recordWordAnswer(store.get(), { wordId: id, ...ans }) : recordAnswer(store.get(), { charId: id, ...ans });
    // A misread word also counts against the kana that were misread (asa typed "aka": さ read as ka).
    if (mode === 'read' && !r.correct) {
      for (const u of alignWord(given, wordById.get(id)) || []) {
        if (!u.ok) p = recordAnswer(p, { charId: u.id, ok: false, given: u.given, level: spec.level, now });
      }
    }
    store.set(p);
    speech.openGate();                                 // the answer is in: sound is now allowed
    renderQuiz();
    speech.say(textOf(id));
    if (r.correct) c.timer = setTimeout(advance, AUTO_ADVANCE_MS);
  }

  function advance() {
    clearTimeout(c.timer);
    if (!c.result) return;
    if (c.lesson.passed) finish('passed');
    else nextQuestion();
  }

  // ---------- finish ----------
  function record(result) {
    if (c.recorded) return;
    c.recorded = true;
    const L = c.lesson;
    if (!L || L.log.length === 0) return;               // nothing answered: nothing to record
    const now = Date.now();
    let p = store.get();
    p = recordLesson(p, {
      id: `${c.startedAt}-${Math.floor(Math.random() * 1e6)}`, kind: spec.kind, ...(isDrill ? { drill: true } : {}), script, level: spec.level, sets: [...spec.sets],
      startedAt: c.startedAt, endedAt: now, result, prompts: L.log.length, correct: L.correctCount, missedIds: [...L.missedIds],
    });
    if (result === 'passed') {
      if (spec.kind === 'set') p = markSetPassed(p, spec.sets[0], spec.level, now);
      if (spec.kind === 'mix') p = recordMix(p, spec.sets, now);
      if (spec.kind === 'type') p = recordTypeRun(p, now, L.log.length);
      if ((spec.kind === 'read' || spec.kind === 'meaning') && !spec.drill) p = recordWordRun(p, spec.kind, now, L.log.length);
    }
    store.set(p);
    store.flush();
  }

  function finish(result) {
    clearTimeout(c.timer);
    record(result);
    c.phase = 'summary';
    speech.openGate();
    renderSummary(result);
    animateRide();
    focusMain();
  }

  function quit({ silent = false } = {}) {
    clearTimeout(c.timer);
    if (c.phase === 'quiz' && c.lesson?.passed) {          // the run was complete: it counts
      if (silent) { record('passed'); c.phase = 'done'; active = null; return; }
      finish('passed');
      return;
    }
    speech.closeGate();
    if (c.phase === 'quiz') record('quit');
    if (silent) { c.phase = 'done'; active = null; return; }
    if (c.phase === 'study' || !c.lesson || c.lesson.log.length === 0) { c.phase = 'done'; active = null; route(); return; }
    c.phase = 'summary';
    renderSummary('quit');
    focusMain();
  }

  function renderSummary(result) {
    const L = c.lesson;
    const p = store.get();
    const passed = result === 'passed';
    const acc = L.log.length ? Math.round((L.correctCount / L.log.length) * 100) : 0;
    const missed = isWord ? [] : L.missedIds.map((id) => kanaById.get(id));
    const missedWords = isWord ? L.missedIds.map((id) => wordById.get(id)) : [];
    const actions = [];
    if (passed && spec.kind === 'set' && spec.level === 0) {
      const { script: sc } = parseSetKey(spec.sets[0]);
      const nxt = nextLevel0Set(p, sc, SET_DEFS, Date.now());
      actions.push({ label: `Next stop: ${SET_NAMES[nxt]}`, primary: true, go: () => launchLesson({ kind: 'set', level: 0, sets: [setKey(sc, nxt)] }) });
      actions.push({ label: 'Recall this row', go: () => launchLesson({ kind: 'set', level: 1, sets: [...spec.sets] }) });
    } else if (passed && spec.kind === 'read' && !spec.drill) {
      actions.push({ label: 'What does it mean?', primary: true, go: () => launchLesson({ ...spec, kind: 'meaning', level: 5 }) });
      actions.push({ label: 'Read again', go: () => launchLesson({ ...spec }) });
    } else {
      actions.push({ label: passed ? 'Go again' : 'Try again', primary: true, go: () => launchLesson({ ...spec }) });
    }
    if (missed.length >= 2) actions.push({ label: 'Drill these misses', go: () => launchLesson({ kind: 'weak', level: 1, poolIds: missed.map((k) => k.id), sets: [...new Set(missed.map((k) => setKey(k.script, k.set)))] }) });
    if (missedWords.length >= 2) actions.push({ label: 'Drill these words', go: () => launchLesson({ kind: spec.kind, level: spec.level, drill: true, title: 'Missed words', sets: [], poolIds: missedWords.map((w) => w.id) }) });
    actions.push({ label: 'Done', go: () => { active = null; route(); } });
    c.actions = actions;

    const heading = passed
      ? (isDrill ? 'Drill passed'
        : { set: `${SET_NAMES[parseSetKey(spec.sets[0] || 'hiragana:a').setId]} passed`, type: 'Twenty in a row', read: 'Ten words in a row', meaning: 'Ten words, read and understood' }[spec.kind] || 'Lesson passed')
      : 'Lesson ended early';
    // The final level ends on a quiet note, in the app's calm voice.
    const firstMeaningPass = spec.kind === 'meaning' && p.meaningRuns.length === 1;
    const sub = passed
      ? (spec.kind === 'set' && spec.level === 0 ? 'This row now counts as learned: it unlocks Recall, and joins Mix and Type.'
        : spec.kind === 'read' && !spec.drill ? `Every word in the final run was read right.${p.wordRuns.length === 1 ? ' What does it mean? is open.' : ''}`
        : spec.kind === 'meaning' ? (firstMeaningPass ? 'You\'re reading Japanese.' : 'Every word in the final run, read and understood.')
        : 'Every answer in the final run was right.')
      : 'Your answers so far still count toward your stats.';
    const drill = missed.length || missedWords.length ? 'Worth another look:' : 'No misses this time.';
    // A passed row arrives in its own line colour, and its station lights up on the route map.
    const setInfo = spec.kind === 'set' ? parseSetKey(spec.sets[0]) : null;
    const band = passed && setInfo ? LINES[setInfo.setId].colour : passed ? 'var(--ink)' : 'var(--line-neutral)';
    const nextSet = passed && setInfo && spec.level === 0 ? nextLevel0Set(p, setInfo.script, SET_DEFS, Date.now()) : null;
    const routeMap = passed && setInfo && spec.level === 0 ? `<div class="arrived-route">${routeHTML({
      script: setInfo.script, title: `${SCRIPT_LABEL[setInfo.script]} line`, interactive: false,
      note: `${SET_DEFS.filter((d) => isPassed(p, setInfo.script, d.id)).length} of ${SET_DEFS.length} rows passed`,
      stateOf: (sid) => (sid === setInfo.setId ? { state: 'passed', just: true, label: 'just passed' }
        : sid === nextSet ? { state: 'next', label: 'next stop' }
        : { state: isPassed(p, setInfo.script, sid) ? 'passed' : 'open' }),
    })}</div>` : '';
    mount(`
    <div class="lesson">
      <section class="sign arrived ${setInfo && LINES[setInfo.setId].rapid && passed ? 'rapid' : ''}" style="--band:${band}" aria-labelledby="arrived-h">
        <div class="sign-band"></div>
        <div class="sign-body">
          <h1 id="arrived-h">${heading}</h1>
          <p class="lede">${sub}</p>
          <div class="stats-row">
            <div><b>${L.log.length}</b>prompts</div>
            <div><b>${acc}%</b>accuracy</div>
            <div><b>${L.best}</b>best run</div>
          </div>
          <p class="muted" style="margin-top:14px">${drill}</p>
          ${missed.length ? `<ul class="missed-list" aria-label="Missed characters">${missed.map((k) => `<li class="chip miss"><span class="kana" lang="ja">${k.char}</span>${k.romaji}</li>`).join('')}</ul>` : ''}
          ${missedWords.length ? `<ul class="missed-list" aria-label="Missed words">${missedWords.map((w) => `<li class="chip miss"><span class="kana" lang="ja">${w.kana}</span>${w.romaji}${sameAsRomaji(w) ? '' : ` <span class="muted">${escapeHTML(w.en[0])}</span>`}</li>`).join('')}</ul>` : ''}
          ${passed ? `<div class="arrive-wrap">${rideHTML({ target: L.target, done: doneIds(), label: spec.drill ? 'Final run' : { choice: 'Final run', type: 'Final twenty' }[mode] || 'Final ten', fromPct: 0, mode: 'arrive', textOf, words: isWord })}</div>` : ''}
        </div>
        <div class="sign-strip"><span></span><span class="mid">${title}</span><span></span></div>
      </section>
      <div class="lesson-actions" style="justify-content:center">
        ${actions.map((a, i) => `<button type="button" class="btn ${a.primary ? 'primary' : ''}" data-summary="${i}">${a.label}${a.primary ? ' <kbd>Enter</kbd>' : ''}</button>`).join('')}
      </div>
      ${routeMap}
    </div>`);
    announce(`${heading}. ${L.log.length} prompts, ${acc}% accuracy.`);
  }

  // ---------- events ----------
  const onClick = (e) => {
    const opt = e.target.closest('.opt');
    if (opt && !opt.disabled) { answer(opt.dataset.opt); return; }
    const s = e.target.closest('[data-summary]');
    if (s) { const a = c.actions[Number(s.dataset.summary)]; active = null; a.go(); return; }
    const b = e.target.closest('[data-action]');
    if (!b) return;
    const a = b.dataset.action;
    if (a === 'prev' || a === 'next-card') {
      moveStudy(a === 'prev' ? -1 : 1);
      const same = document.querySelector(`[data-action="${a}"]:not(:disabled)`);
      const start = document.querySelector('[data-action="start-quiz"]');
      const other = document.querySelector(`[data-action="${a === 'prev' ? 'next-card' : 'prev'}"]:not(:disabled)`);
      // past the last card the next step is the quiz, not walking back through the row
      (same || (a === 'next-card' ? start : other) || start)?.focus();
    }
    else if (a === 'start-quiz') beginQuiz();
    else if (a === 'hear') speech.say(textOf(c.phase === 'study' ? poolIds[c.studyIdx] : c.lesson.current.id));
    else if (a === 'next') advance();
    else if (a === 'quit') quit();
    else if (a === 'sound-help') { e.stopPropagation(); clearTimeout(c.timer); toggleSettings(true); }   // stop: the outside-click handler would close it
    else if (a === 'sound-hint-ok') {
      try { localStorage.setItem('kd-sound-hint', 'seen'); } catch {}
      document.querySelector('.sound-hint')?.remove();
      (document.getElementById('next-btn') || app).focus({ preventScroll: true });
    }
  };
  const onSubmit = (e) => {
    if (e.target.dataset.form !== 'type') return;
    e.preventDefault();
    if (c.result) { advance(); return; }
    const input = document.getElementById('type-input');
    const v = input.value;
    if (!v.trim()) { input.setAttribute('placeholder', isWord ? 'type the word first, e.g. neko' : 'type the sound first, e.g. ka'); input.focus(); return; }
    answer(v);
  };
  app.addEventListener('click', onClick);
  app.addEventListener('submit', onSubmit);
  // Voices can arrive after the first study card: redraw so Hear (or the hint) appears.
  const onVoices = () => { if (c.phase === 'study') renderStudy(); };
  speech.onVoicesChanged(onVoices);

  function onKey(e) {
    const inInput = e.target.tagName === 'INPUT';
    if (e.key === 'Escape' && (c.phase === 'study' || c.phase === 'quiz')) {
      e.preventDefault();
      if (c.phase === 'study' || !lessonHasProgress()) { quit(); return; }
      clearTimeout(c.timer);
      confirmLeave().then((leave) => { if (leave) quit(); else if (c.result?.correct) c.timer = setTimeout(advance, AUTO_ADVANCE_MS); });
      return;
    }
    if (c.phase === 'study') {
      if (e.key === 'ArrowRight' || (e.key === ' ' && !e.target.closest('button'))) { e.preventDefault(); moveStudy(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); moveStudy(-1); }
      else if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); beginQuiz(); }
      else if (e.key === 'h' || e.key === 'H') speech.say(kanaById.get(poolIds[c.studyIdx]).char);
    } else if (c.phase === 'quiz') {
      const numKey = picks && ['1', '2', '3'].includes(e.key);
      if (numKey && e.repeat) { e.preventDefault(); return; }   // a held key never answers the next prompt
      if (!c.result) {
        if (numKey) {
          const o = c.lesson.current.options[Number(e.key) - 1];
          if (o) { e.preventDefault(); answer(o.id); }
        }
      } else if (numKey && c.result.correct) {
        // During the pause after a correct answer, a number key skips the pause. It only shows the
        // next prompt; it never answers a prompt the learner hasn't seen.
        e.preventDefault(); advance();
      } else if ((e.key === 'Enter' || (e.key === ' ' && !inInput)) && !e.target.closest('button')) {
        e.preventDefault(); advance();
      } else if ((e.key === 'h' || e.key === 'H') && !inInput) speech.say(textOf(c.lesson.current.id));
    } else if (c.phase === 'summary') {
      if (e.key === 'Enter' && !e.target.closest('button')) {
        e.preventDefault();
        const a = c.actions.find((x) => x.primary);
        if (a) { active = null; a.go(); }
      }
    }
  }

  if (c.phase === 'study') { renderStudy(); focusMain(); } else beginQuiz();

  return {
    onKey,
    destroy() {
      clearTimeout(c.timer);
      app.removeEventListener('click', onClick);
      app.removeEventListener('submit', onSubmit);
      speech.offVoicesChanged(onVoices);
      if (active === c && (c.phase === 'study' || c.phase === 'quiz')) quit({ silent: true });
      if (active === c) active = null;
    },
  };
}

// The reason sound is missing, shown where the Hear button would be, until the learner dismisses it.
function soundHintSeen() { try { return localStorage.getItem('kd-sound-hint') === 'seen'; } catch { return false; } }
function soundHintHTML() {
  if (!speech.knownSilent() || soundHintSeen()) return '';
  const why = speech.isSupported() ? 'no Japanese voice is installed' : 'this browser has no speech support';
  return `<p class="sound-hint">Sound is off: ${why}. <button type="button" class="linkish" data-action="sound-help">How to add one</button> <button type="button" class="linkish" data-action="sound-hint-ok">Got it</button></p>`;
}

/** A loanword whose meaning is spelled like its romaji (トマト, tomato) needs no gloss. */
function sameAsRomaji(w) { return w.en[0].toLowerCase().replace(/[^a-z]/g, '') === w.romaji; }

/** What was typed, as echoed back (the input caps typing; this caps anything set by script). */
function clip(t) { const s = String(t ?? ''); return s.length > 60 ? `${s.slice(0, 60)}…` : s; }

function escapeHTML(s) { return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }
function escapeAttr(s) { return escapeHTML(s); }
