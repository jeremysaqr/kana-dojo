// Stats dashboard: gojuon heat map, character detail, weak spots, confused pairs, daily streak,
// accuracy trend, levels passed.
import { KANA, SCRIPTS, SET_DEFS, GRID_ROWS, kanaById, setKey } from '/core/kana.js';
import { masteryBand, weaknessScore } from '/core/weakness.js';
import * as store from '../store.js';
import { ui, mount, launchLesson } from '../app.js';
import { SCRIPT_LABEL, SCRIPT_NATIVE, SET_NAMES } from '../lines.js';
import { icon } from '../icons.js';
import { weakList, confusedPairs, weakDrillPool, confusionDrillPool, confusedWith, charDrillPool, activeDays, dailyStreak, accuracyTrend, dayKey, relativeTime } from '../analytics.js';

const BANDS = [
  ['unseen', 'Not seen yet'],
  ['struggling', 'Struggling'],
  ['learning', 'Learning'],
  ['solid', 'Solid'],
  ['mastered', 'Mastered'],
];
const BAND_LABEL = Object.fromEntries(BANDS);
const COLS = ['a', 'i', 'u', 'e', 'o'];
const ROW_LABEL = { a: '–', k: 'k', s: 's', t: 't', n: 'n', h: 'h', m: 'm', y: 'y', r: 'r', w: 'w', nn: 'n', g: 'g', z: 'z', d: 'd', b: 'b', p: 'p' };

let selected = null;
let focusId = null;   // the one heat-map cell in the Tab order (arrow keys move it)

function cellHTML(k, p, now) {
  const s = p.chars[k.id];
  const band = masteryBand(s || { attempts: 0 }, now);
  const acc = s && s.attempts ? `${Math.round((s.correct / s.attempts) * 100)}% of ${s.attempts}` : 'not seen';
  return `<button type="button" class="cell" data-id="${k.id}" data-band="${band}" aria-pressed="${selected === k.id}" tabindex="${focusId === k.id ? 0 : -1}"
    aria-label="${k.char} ${k.romaji}: ${BAND_LABEL[band]}, ${acc}" title="${k.romaji} · ${BAND_LABEL[band]} · ${acc}">
    <span class="kana" lang="ja">${k.char}</span><span class="r">${k.romaji}</span></button>`;
}

function tableHTML(script, rows, caption, p, now) {
  const body = rows.map((row) => {
    const cells = COLS.map((_, col) => {
      const k = KANA.find((x) => x.script === script && x.grid.row === row && x.grid.col === col);
      return `<td>${k ? cellHTML(k, p, now) : '<span class="cell-empty"></span>'}</td>`;
    }).join('');
    return `<tr><th scope="row">${ROW_LABEL[row]}</th>${cells}</tr>`;
  }).join('');
  return `<table class="heat"><caption class="sr-only">${caption}</caption>
    <thead><tr><td></td>${COLS.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

function detailHTML(p, now) {
  if (!selected) {
    return `<section class="panel detail"><h2>Character detail</h2><p class="muted">Select any character on the chart to see its history and what you confuse it with.</p></section>`;
  }
  const k = kanaById.get(selected);
  const s = p.chars[k.id];
  if (!s || !s.attempts) {
    return `<section class="panel detail"><h2>Character detail</h2>
      <div class="who"><span class="kana" lang="ja">${k.char}</span><span class="r">${k.romaji}</span></div>
      <p class="muted">Not seen yet. It's in the ${SET_NAMES[k.set]} (${SCRIPT_LABEL[k.script]}).</p></section>`;
  }
  const band = masteryBand(s, now);
  const wrong = confusedWith(p, k.id).slice(0, 4);
  const hist = (s.history || []).slice(-20);
  return `<section class="panel detail"><h2>Character detail</h2>
    <div class="who"><span class="kana" lang="ja">${k.char}</span><div><span class="r">${k.romaji}</span><br><span class="muted">${BAND_LABEL[band]}</span></div></div>
    <dl>
      <dt>Attempts</dt><dd>${s.attempts}</dd>
      <dt>Accuracy</dt><dd>${Math.round((s.correct / s.attempts) * 100)}% (${s.correct} right, ${s.misses} missed)</dd>
      <dt>Current run</dt><dd>${s.streak} correct in a row</dd>
      <dt>Last seen</dt><dd>${relativeTime(s.lastSeen, now)}</dd>
      <dt>Confused with</dt><dd>${wrong.length ? `<span class="confused">${wrong.map(({ romaji, n, k: o }) => `<span>${o ? `<span class="kana" lang="ja">${o.char}</span> ` : ''}${escapeHTML(romaji)} <span class="muted">×${n}</span></span>`).join('')}</span>` : '<span class="muted">nothing yet</span>'}</dd>
      <dt>Recent</dt><dd><span class="history" aria-label="Last ${hist.length} answers: ${hist.filter((h) => h.ok).length} right">${hist.map((h) => `<i class="${h.ok ? '' : 'x'}" title="${h.ok ? 'right' : `missed (${h.given || '—'})`}"></i>`).join('')}</span></dd>
    </dl>
    <button type="button" class="btn drill-char" data-action="drill-char" data-id="${k.id}">Drill <span class="kana" lang="ja">${k.char}</span>${wrong.some((w) => w.k) ? ' and what you mix it up with' : ''}</button></section>`;
}

function escapeHTML(t) { return String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])); }

function trendHTML(trend, W = 300) {
  if (trend.length < 2) return '<p class="empty">The trend appears after two days of practice.</p>';
  const H = 140, L = 40, R = 8, T = 10, B = 22;   // L fits "100%" right-aligned at L - 6
  const x = (i) => L + (i / (trend.length - 1)) * (W - L - R);
  const y = (a) => T + (1 - a) * (H - T - B);
  const pts = trend.map((d, i) => `${x(i).toFixed(1)},${y(d.accuracy).toFixed(1)}`).join(' ');
  const last = trend[trend.length - 1];
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Accuracy by day, last ${trend.length} practice days. Latest ${Math.round(last.accuracy * 100)}%.">
    ${[0, 0.5, 1].map((a) => `<line class="axis" x1="${L}" x2="${W - R}" y1="${y(a)}" y2="${y(a)}"/><text x="${L - 6}" y="${y(a) + 4}" text-anchor="end">${a * 100}%</text>`).join('')}
    <polyline class="line" points="${pts}"/>
    ${trend.map((d, i) => `<circle class="pt" cx="${x(i)}" cy="${y(d.accuracy)}" r="4"><title>${d.day}: ${Math.round(d.accuracy * 100)}% of ${d.prompts} prompts</title></circle>`).join('')}
    <text x="${L}" y="${H - 6}">${trend[0].day.slice(5)}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${last.day.slice(5)}</text>
  </svg>`;
}

function calendarHTML(p, now) {
  const days = activeDays(p);
  const weeks = 12;
  const today = new Date(now); today.setHours(12, 0, 0, 0);
  const start = new Date(today.getTime() - ((weeks - 1) * 7 + today.getDay()) * 86400000);
  const cells = [];
  for (let i = 0; i < weeks * 7; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    if (d > today) { cells.push('<i style="visibility:hidden"></i>'); continue; }
    const key = dayKey(d.getTime());
    const on = days.has(key);
    cells.push(`<i class="${on ? 'on' : ''} ${key === dayKey(now) ? 'today' : ''}" title="${key}${on ? ': practised' : ''}"></i>`);
  }
  return `<div class="calendar" role="img" aria-label="Practice calendar, last ${weeks} weeks: ${[...days].filter((k) => k >= dayKey(start.getTime())).length} days practised">${cells.join('')}</div>`;
}

function levelsHTML(p) {
  const rows = SCRIPTS.map((sc) => {
    const l0 = SET_DEFS.filter((d) => p.sets[setKey(sc, d.id)]?.passed?.['0'] != null).length;
    const l1 = SET_DEFS.filter((d) => p.sets[setKey(sc, d.id)]?.passed?.['1'] != null).length;
    return `<tr><td>${SCRIPT_LABEL[sc]}</td><td>${l0} / ${SET_DEFS.length}</td><td>${l1} / ${SET_DEFS.length}</td></tr>`;
  }).join('');
  return `<table class="levels-table"><caption class="sr-only">Rows passed in Learn and Recall, by script</caption><thead><tr><th scope="col">Script</th><th scope="col">Learn</th><th scope="col">Recall</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="muted" style="font-size:14px;margin-top:10px">Mix passed ${p.mixes.length} ${p.mixes.length === 1 ? 'time' : 'times'} · Type passed ${p.typeRuns.length} ${p.typeRuns.length === 1 ? 'time' : 'times'} · Read the word passed ${p.wordRuns.length} · What does it mean passed ${p.meaningRuns.length} · ${p.lessons.length} lessons in total</p>`;
}

export function renderStats() {
  let script = ui.script;
  const draw = () => {
    const p = store.get();
    const now = Date.now();
    const weak = weakList(p, now, 8);
    const pairs = confusedPairs(p, 6);
    const weakPool = weakDrillPool(p, now);
    const confPool = confusionDrillPool(p);
    const streak = dailyStreak(p, now);
    const counts = Object.fromEntries(BANDS.map(([b]) => [b, 0]));
    for (const k of KANA) if (k.script === script) counts[masteryBand(p.chars[k.id] || { attempts: 0 }, now)]++;
    const empty = p.lessons.length === 0 && Object.keys(p.chars).length === 0;

    mount(`
    <div class="page-head">
      <div><h1>Your progress</h1><p>Every answer feeds this map. Weak characters are drilled more often in every level.</p></div>
      <div class="actions">
        <button type="button" class="btn" data-action="confusion" ${confPool ? '' : 'disabled'} title="${confPool ? '' : 'Appears once you have mixed up two characters'}">Confusion drill</button>
        <button type="button" class="btn primary" data-action="weak" ${weakPool ? '' : 'disabled'} title="${weakPool ? '' : 'Answer a few characters first'}">Drill my weak spots</button>
      </div>
    </div>
    ${empty ? '<section class="panel locked-note" style="margin-bottom:24px"><div><h2>Nothing to show yet</h2><p>Finish your first Learn lesson and this chart starts filling in, one character at a time.</p><p style="margin-top:12px"><a class="btn primary" href="#/learn">Start with the vowels</a></p></div></section>' : ''}
    <div class="stats-grid">
      <section class="panel heat-wrap" aria-label="Heat map">
        <div class="heat-head">
          <h2>${SCRIPT_LABEL[script]} chart <span class="kana muted" lang="ja" style="font-size:15px;font-weight:400">${SCRIPT_NATIVE[script]}</span></h2>
          <div class="seg light" role="group" aria-label="Chart script">${SCRIPTS.map((sc) => `<button type="button" data-script-tab="${sc}" aria-pressed="${sc === script}">${SCRIPT_LABEL[sc]}</button>`).join('')}</div>
        </div>
        <div class="heat-tables">
          ${tableHTML(script, GRID_ROWS.basic, `${SCRIPT_LABEL[script]} basic characters`, p, now)}
          ${tableHTML(script, GRID_ROWS.dakuten, `${SCRIPT_LABEL[script]} dakuten and handakuten`, p, now)}
        </div>
        <div class="heat-legend" aria-label="Legend">${BANDS.map(([b, l]) => `<span><span class="cell" data-band="${b}" aria-hidden="true"></span>${l} <span class="muted">${counts[b]}</span></span>`).join('')}</div>
      </section>
      ${detailHTML(p, now)}
    </div>

    <div class="section cards-row">
      <section class="panel block"><h2>Weak spots</h2>
        ${weak.length ? `<ol class="side-list" aria-label="Weak spots">${weak.map(({ k, s, w }) => `<li><span class="kana" lang="ja">${k.char}</span><div class="grow">${k.romaji} <span class="muted">${SCRIPT_LABEL[k.script]}</span><div class="bar-meter" aria-hidden="true"><i style="width:${Math.round(w * 100)}%"></i></div></div><span class="num">${Math.round((s.correct / s.attempts) * 100)}%</span></li>`).join('')}</ol>` : '<p class="empty">No weak spots yet. They appear as you answer.</p>'}
      </section>
      <section class="panel block"><h2>Most confused pairs</h2>
        ${pairs.length ? `<ol class="side-list" aria-label="Most confused pairs">${pairs.map((x) => `<li><span class="kana" lang="ja">${x.a.char}</span><span class="muted">${icon('swap')}</span><span class="kana" lang="ja">${x.b.char}</span><div class="grow">${x.a.romaji} / ${x.b.romaji}</div><span class="num">${x.count}×</span></li>`).join('')}</ol>` : '<p class="empty">No mix-ups recorded yet.</p>'}
      </section>
      <section class="panel block"><h2>Practice days</h2>
        <p style="margin-bottom:12px"><span class="streak-num">${streak}</span> <span class="muted">${streak === 1 ? 'day' : 'days'} in a row</span></p>
        ${calendarHTML(p, now)}
      </section>
      <section class="panel block trend"><h2>Accuracy, last 30 days</h2><div class="trend-plot">${trendHTML(accuracyTrend(p, now))}</div></section>
      <section class="panel block"><h2>Rows passed</h2>${levelsHTML(p)}</section>
    </div>`);
    fitTrend();
    // one Tab stop per chart table (basic, then dakuten): the remembered cell, else the table's first
    for (const table of document.querySelectorAll('.heat')) {
      if (!table.querySelector('.cell[tabindex="0"]')) { const first = table.querySelector('.cell'); if (first) first.tabIndex = 0; }
    }
  };
  draw();

  const app = document.getElementById('app');
  const onClick = (e) => {
    const cell = e.target.closest('.heat .cell');
    if (cell) {
      selected = selected === cell.dataset.id ? null : cell.dataset.id;
      focusId = cell.dataset.id;
      draw();
      document.querySelector(`.cell[data-id="${cell.dataset.id}"]`)?.focus();
      const k = kanaById.get(cell.dataset.id);
      const live = document.getElementById('live');
      if (live) { live.textContent = ''; setTimeout(() => { live.textContent = selected ? `${k.char} selected. Its details follow the charts.` : `${k.char} deselected.`; }, 60); }
      return;
    }
    const tab = e.target.closest('[data-script-tab]');
    if (tab) { script = tab.dataset.scriptTab; focusId = null; draw(); document.querySelector(`[data-script-tab="${script}"]`)?.focus(); return; }
    const b = e.target.closest('[data-action]');
    if (!b || b.disabled) return;
    const p = store.get();
    const act = b.dataset.action;
    const pool = act === 'weak' ? weakDrillPool(p, Date.now()) : act === 'drill-char' ? charDrillPool(p, b.dataset.id) : confusionDrillPool(p);
    if (!pool) return;
    const title = act === 'drill-char' ? kanaById.get(b.dataset.id).char : undefined;   // the crumb already says "Drill"
    launchLesson({ kind: act === 'confusion' ? 'confusion' : 'weak', title, level: 1, poolIds: pool, sets: [...new Set(pool.map((id) => { const k = kanaById.get(id); return setKey(k.script, k.set); }))] });
  };
  app.addEventListener('click', onClick);
  // Fit the chart to its panel (one column on narrow screens, two on wide ones).
  function fitTrend() {
    const plot = document.querySelector('.trend-plot');
    if (plot && plot.clientWidth) plot.innerHTML = trendHTML(accuracyTrend(store.get(), Date.now()), Math.max(240, Math.round(plot.clientWidth)));
  }
  fitTrend();
  let resizeTimer = null;
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(fitTrend, 120); };
  addEventListener('resize', onResize);
  // Arrow keys move between heat-map cells (one Tab stop for the whole chart, instead of 73).
  function onKey(e) {
    const cell = e.target.closest?.('.heat .cell');
    if (!cell) return;
    const table = cell.closest('table');
    const rows = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.querySelectorAll('td')]);
    let r = rows.findIndex((tds) => tds.some((td) => td.contains(cell)));
    let c = rows[r].findIndex((td) => td.contains(cell));
    const step = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] }[e.key];
    let target = null;
    if (step) {
      for (let i = 0; i < 12 && !target; i++) {
        r += step[0]; c += step[1];
        if (r < 0 || r >= rows.length || c < 0 || c >= rows[0].length) break;
        target = rows[r][c].querySelector('.cell');
      }
    } else if (e.key === 'Home' || e.key === 'End') {
      const all = [...table.querySelectorAll('.cell')];
      target = e.key === 'Home' ? all[0] : all[all.length - 1];
    } else return;
    e.preventDefault();
    if (!target) return;
    for (const x of table.querySelectorAll('.cell')) x.tabIndex = -1;
    target.tabIndex = 0;
    focusId = target.dataset.id;
    target.focus();
  }
  return { onKey, destroy() { app.removeEventListener('click', onClick); removeEventListener('resize', onResize); clearTimeout(resizeTimer); } };
}
