// Shared markup: the station sign, the route map, the ride (streak strip).
import { SET_DEFS, charsInSet, kanaById, setKey } from '/core/kana.js';
import { LINES, SET_NAMES, stationCode, SCRIPT_LABEL, SCRIPT_NATIVE } from './lines.js';
import { icon } from './icons.js';

/**
 * Station sign. `reveal` controls whether the line colour, station code and romaji are visible.
 * In a quiz, reveal stays false until the learner has answered (the code and colour encode the row).
 */
export function signHTML({ id, reveal, strip, result = '', enter = false, label, quiz = false }) {
  const k = kanaById.get(id);
  const line = LINES[k.set];
  const code = stationCode(id);
  const romaji = reveal
    ? `<span>${k.romaji}</span>${k.alt.length ? `<span class="alt">also ${k.alt.join(', ')}</span>` : ''}`
    : '<span class="blank" aria-hidden="true"></span><span class="sr-only">Romaji hidden until you answer</span>';
  return `
  <section class="sign ${quiz ? 'quiz' : ''} ${reveal && line.rapid ? 'rapid' : ''}" data-result="${result}" style="${reveal ? `--band:${line.colour}` : ''}" aria-label="${label || 'Character card'}">
    <div class="sign-band"></div>
    <div class="sign-body">
      ${reveal
        ? `<div class="code-ring" aria-label="Station code ${code}"><b>${code.slice(0, 1)}</b><strong>${code.slice(1)}</strong></div>`
        : '<div class="code-ring hidden" aria-hidden="true"></div>'}
      <div class="sign-script"><span lang="ja">${SCRIPT_NATIVE[k.script]}</span><br>${SCRIPT_LABEL[k.script]}</div>
      <div class="sign-kana kana ${enter ? 'enter' : ''}" lang="ja" role="img" aria-label="${reveal ? `${k.char}, ${k.romaji}` : `Character ${k.char}`}">${k.char}</div>
      <div class="sign-romaji">${romaji}</div>
    </div>
    <div class="sign-strip">${strip || '<span></span><span class="mid"></span><span></span>'}</div>
  </section>`;
}

/**
 * Word sign (Levels 4–5). The word stands alone on a neutral band: words cross rows, so there is
 * no line colour or station code. `reveal` adds the romaji and, when `meaning` is set, the English.
 */
export function wordSignHTML({ word, reveal, meaning = true, strip, result = '', enter = false, label }) {
  const below = reveal
    ? `<span>${word.romaji}</span>${meaning && word.en[0].toLowerCase().replace(/[^a-z]/g, '') !== word.romaji ? `<span class="alt">${word.en.join(', ')}</span>` : ''}`
    : '<span class="blank" aria-hidden="true"></span><span class="sr-only">Reading hidden until you answer</span>';
  return `
  <section class="sign quiz word" data-result="${result}" data-len="${Math.min([...word.kana].length, 6)}" aria-label="${label || 'Word card'}">
    <div class="sign-band"></div>
    <div class="sign-body">
      <div class="sign-script"><span lang="ja">${SCRIPT_NATIVE[word.script]}</span><br>${SCRIPT_LABEL[word.script]}</div>
      <div class="sign-kana kana ${enter ? 'enter' : ''}" lang="ja" role="img" aria-label="${reveal ? `${word.kana}, ${word.romaji}` : `Word ${word.kana}`}">${word.kana}</div>
      <div class="sign-romaji">${below}</div>
    </div>
    <div class="sign-strip">${strip || '<span></span><span class="mid"></span><span></span>'}</div>
  </section>`;
}

/** The streak strip. `done` = kana ids already answered correctly in this run (shown); rest blank. */
export function ridePct(target, doneCount) {
  return target > 1 ? (Math.min(doneCount, target - 1) / (target - 1)) * 100 : 0;
}

/**
 * The streak strip. `done` = kana ids already answered correctly in this run (shown); the rest stay
 * blank so nothing hints at what comes next. The fill renders at `fromPct` and the caller animates
 * it to its target (data-to) after mounting, so the "train" visibly moves stop to stop or back.
 */
export function rideHTML({ target, done, label, fromPct = null, mode = '', textOf = (id) => kanaById.get(id)?.char || '', words = false }) {
  const dense = target > 10;
  const stops = [];
  for (let i = 0; i < target; i++) {
    const id = done[i];
    const cls = i < done.length ? 'done' : i === done.length ? 'here' : '';
    stops.push(`<li class="${cls}" style="--i:${i}"><span class="stop"></span><span class="k kana" lang="ja">${id ? textOf(id) : ''}</span></li>`);
  }
  const pct = ridePct(target, done.length);
  const start = fromPct == null ? pct : fromPct;
  return `
  <div class="ride ${dense ? 'dense' : ''} ${words ? 'words' : ''} ${mode}" role="group" aria-label="Streak">
    <div class="ride-head"><span>${label}</span><span aria-hidden="true"><strong>${done.length}</strong> of ${target} in a row</span></div>
    <ol aria-hidden="true"><span class="fill" style="width:${start}%" data-to="${pct}"></span>${stops.join('')}</ol>
    <span class="sr-only">${done.length} of ${target} in a row</span>
  </div>`;
}

/**
 * Route map for one script. `stateOf(setId)` → { state: 'passed'|'next'|'open'|'locked', pressed?, badges?, label?, just? }
 * `just` lights a station that was passed this moment (arrival map): filled in its line colour, haloed.
 * `label` overrides the spoken state (e.g. "just passed" on the arrival map).
 */
export function routeHTML({ script, title, note, stateOf, interactive = true }) {
  const items = [...SET_DEFS].sort((a, b) => a.order - b.order).map((d) => {
    const st = stateOf(d.id);
    const first = charsInSet(script, d.id)[0];
    const line = LINES[d.id];
    const disabled = !interactive || st.state === 'locked';
    const badges = (st.badges || []).map((b) => `<span class="badge ${b.solid ? 'solid' : ''}" title="${b.title}">${b.text}</span>`).join('');
    // Badges are spoken too ("passed Learn and Recall"); that replaces the bare "passed".
    const passedLevels = (st.badges || []).map((x) => x.title.replace(/^Passed /, ''));
    let stateText = st.label ?? { passed: 'passed', next: 'suggested', open: '', locked: 'locked' }[st.state];
    if (passedLevels.length) stateText = [stateText === 'passed' ? '' : stateText, `passed ${passedLevels.join(' and ')}`].filter(Boolean).join(', ');
    return `<li>
      <button type="button" class="station ${line.rapid ? 'rapid' : ''}" style="--line:${line.colour}" data-set="${d.id}" data-script="${script}"
        data-state="${st.state}" ${st.just ? 'data-just' : ''} ${st.pressed !== undefined ? `aria-pressed="${st.pressed}"` : ''} ${disabled ? 'disabled' : ''}
        aria-label="${SET_NAMES[d.id]}, ${charsInSet(script, d.id).map((k) => k.char).join(' ')}${stateText ? `, ${stateText}` : ''}">
        <span class="dot"></span>
        <span class="name kana" lang="ja">${first.char}</span>
        <span class="sub">${SET_NAMES[d.id]}</span>
        <span class="badges">${badges}</span>
      </button></li>`;
  });
  return `
  <section class="panel route" aria-label="${title}">
    <div class="route-head"><h2>${title} <span class="kana" lang="ja">${SCRIPT_NATIVE[script]}</span></h2><span class="muted">${note || ''}</span></div>
    <ol class="stations" aria-label="Stations">${items.join('')}</ol>
  </section>`;
}

export function isPassed(progress, script, setId, level = 0) {
  return progress.sets[setKey(script, setId)]?.passed?.[String(level)] != null;
}

export function lockedHTML(title, body) {
  return `<section class="panel locked-note">${icon('lock')}<div><h2>${title}</h2><p>${body}</p></div></section>`;
}

export function kanaRow(script, setId) {
  return charsInSet(script, setId).map((k) => k.char).join(' ');
}
