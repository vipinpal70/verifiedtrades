import { computeStats, outcome, sortTrades, tradeUsd } from './stats.js';
import { renderEquityChart } from './chart.js';
import { maxLotFor, ruleRows } from './rules.js';

const $ = (sel, root = document) => root.querySelector(sel);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---- per-viewer preferences (best effort) ----------------------------------
const store = {
  get(k, d) { try { return localStorage.getItem(`tr.${k}`) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`tr.${k}`, v); } catch { /* storage blocked */ } },
};

const state = {
  data: null,
  tab: store.get('tab', 'all'),
  // Calculator always opens at these defaults (not remembered between visits).
  lots: 1,
  balance: 10000,
  unit: 'r',
};

// ---- formatting --------------------------------------------------------------
const nf = (d) => new Intl.NumberFormat(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
const fmt = {
  r: (v, axis) => `${sign(v)}${nf(axis ? 0 : 1).format(Math.abs(v))}R`,
  pips: (v) => `${sign(v)}${nf(0).format(Math.abs(v))}`,
  usd: (v, axis) => `${sign(v)}$${nf(axis || Math.abs(v) >= 1000 ? 0 : 2).format(Math.abs(v))}`,
  pct: (v) => (v == null ? '—' : `${nf(1).format(v * 100)}%`),
  price: (v) => (v == null ? '—' : nf(2).format(v)),
  date: (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }),
  month: (m) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const tone = (v) => (v > 0 ? 'accent' : v < 0 ? 'loss' : '');

function countUp(node, to, format) {
  if (reduceMotion || !Number.isFinite(to)) { node.textContent = format(to); return; }
  const start = performance.now(), dur = 900;
  const step = (now) => {
    const k = Math.min(1, (now - start) / dur), e = 1 - (1 - k) ** 3;
    node.textContent = format(to * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const relTime = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  return h < 24 ? `${h} h ago` : fmt.date(iso.slice(0, 10));
};

// ---- data --------------------------------------------------------------------
function views() {
  const chans = state.data.channels.map((c) => ({
    ...c,
    trades: c.trades.map((t) => ({ ...t, pipValuePerLot: c.pipValuePerLot, channelName: c.name })),
  }));
  const all = { id: 'all', name: 'All sources', instrument: 'Combined', trades: chans.flatMap((c) => c.trades), combined: true };
  return [all, ...chans];
}

async function load() {
  const panel = $('#panel');
  try {
    const res = await fetch('/api/data', { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (state.data && data.generatedAt === state.data.generatedAt) { renderStatus(); return; }
    state.data = data;
    renderAll();
  } catch (err) {
    console.error(err);
    $('#sync-status').textContent = 'Offline';
    panel.innerHTML = '<div class="state"><p>Couldn’t load the trade record.</p><button class="btn" type="button" id="retry">Try again</button></div>';
    $('#retry').onclick = () => { panel.innerHTML = '<p class="state">Loading trade record…</p>'; load(); };
  }
}

// ---- render ------------------------------------------------------------------
function renderAll() {
  const vs = views();
  if (!vs.some((v) => v.id === state.tab)) state.tab = 'all';
  renderStatus();
  renderHero(vs[0]);
  renderTabs(vs);
  renderPanel(vs.find((v) => v.id === state.tab));
}

function renderStatus() {
  const chans = state.data.channels;
  const synced = chans.map((c) => c.lastSyncedAt).filter(Boolean).sort().at(-1);
  const sample = chans.some((c) => c.source === 'seed');
  const node = $('#sync-status');
  node.innerHTML = synced
    ? `<span class="dot" aria-hidden="true"></span>Updated ${esc(relTime(synced))} · refreshes every ${state.data.syncIntervalMin} min${sample ? ' · includes sample data' : ''}`
    : 'Not synced yet';
}

function renderHero(all) {
  const s = computeStats(all.trades);
  const box = $('#hero-stats');
  countUp(box.querySelector('[data-k="count"]'), s.count, (v) => nf(0).format(Math.round(v)));
  countUp(box.querySelector('[data-k="winRate"]'), s.winRate ?? NaN, (v) => (Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—'));
  countUp(box.querySelector('[data-k="totalR"]'), s.totalR, (v) => fmt.r(v));
  const months = (d) => new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const [a, b] = s.first ? [months(s.first), months(s.last)] : [];
  $('#hero-period').textContent = !a ? '' : a === b ? a : `${a} — ${b}`;
}

function renderTabs(vs) {
  const tabs = $('#tabs');
  tabs.innerHTML = vs.map((v) => `
    <button role="tab" id="tab-${v.id}" aria-controls="panel" aria-selected="${v.id === state.tab}" tabindex="${v.id === state.tab ? 0 : -1}" data-tab="${v.id}">
      ${esc(v.name)}<span class="tab-count">${v.trades.length}</span>
    </button>`).join('');
  $('#panel').setAttribute('aria-labelledby', `tab-${state.tab}`);
  tabs.onclick = (e) => { const b = e.target.closest('[role="tab"]'); if (b) selectTab(b.dataset.tab, false); };
  tabs.onkeydown = (e) => {
    const ids = vs.map((v) => v.id);
    let i = ids.indexOf(state.tab);
    if (e.key === 'ArrowRight') i = (i + 1) % ids.length;
    else if (e.key === 'ArrowLeft') i = (i - 1 + ids.length) % ids.length;
    else if (e.key === 'Home') i = 0;
    else if (e.key === 'End') i = ids.length - 1;
    else return;
    e.preventDefault(); selectTab(ids[i], true);
  };
}

function selectTab(id, focus) {
  state.tab = id;
  if (id === 'all' && state.unit === 'pips') state.unit = 'r';
  store.set('tab', id);
  renderAll();
  if (focus) $(`#tab-${id}`).focus();
}

// The calculator is one persistent element, moved below the chart on every render,
// so its inputs keep their listeners and focus while the panel around them redraws.
const calcEl = document.getElementById('calc');
function placeCalc(panel) {
  const slot = panel.querySelector('#calc-slot');
  if (!slot) { calcEl.hidden = true; return; }
  const focused = calcEl.contains(document.activeElement) ? document.activeElement : null;
  slot.replaceWith(calcEl);
  calcEl.hidden = false;
  focused?.focus({ preventScroll: true });
}

function renderPanel(view) {
  const panel = $('#panel');
  calcEl.remove(); // detach before innerHTML replaces the panel contents
  const s = computeStats(view.trades, { lots: state.lots });
  const units = view.combined ? ['r', 'usd'] : ['r', 'pips', 'usd'];
  if (!units.includes(state.unit)) state.unit = 'r';
  const sample = !view.combined && view.source === 'seed';

  if (!view.trades.length) {
    panel.innerHTML = `<div class="panel-head"><h2>${esc(view.name)}</h2><span class="badge">${esc(view.instrument)}</span></div>
      <div class="state card"><p>No trades published for ${esc(view.name)} yet.</p>
      <p class="muted small">They appear here automatically after the next sheet sync (every ${state.data.syncIntervalMin} min).</p></div>`;
    return;
  }

  const final = state.balance + s.totalUsd;
  panel.innerHTML = `
    <div class="panel-head reveal">
      <h2>${esc(view.name)}</h2>
      <div>${sample ? '<span class="badge warn" title="Bundled sample: the November 2026 trade sheet">Sample data</span> ' : ''}<span class="badge">${esc(view.instrument)}</span>
      <span class="muted small">${fmt.date(s.first)} – ${fmt.date(s.last)}</span></div>
    </div>

    <div class="kpis reveal">
      ${kpi(nf(0).format(s.count), 'Trades')}
      ${kpi(`${s.wins}–${s.losses}${s.be ? `–${s.be}` : ''}`, s.be ? 'W – L – BE' : 'Wins – Losses')}
      ${kpi(fmt.pct(s.winRate), 'Win rate')}
      ${kpi(fmt.r(s.totalR), 'Total R', tone(s.totalR))}
      ${view.combined ? kpi(s.avgWinR == null ? '—' : fmt.r(s.avgWinR), 'Avg win') : kpi(fmt.pips(s.totalPips), 'Net pips', tone(s.totalPips))}
      ${kpi(s.profitFactor == null ? '—' : `${nf(1).format(s.profitFactor)}×`, 'Profit factor')}
      ${kpi(s.maxDrawdownR ? `−${nf(1).format(s.maxDrawdownR)}R` : '0R', 'Max drawdown')}
    </div>

    <div class="card chart-card reveal">
      <div class="chart-head">
        <div><h3>Cumulative growth</h3><div class="big ${tone(s.equity.at(-1)[state.unit])}" id="chart-total"></div></div>
        <div class="seg" role="group" aria-label="Chart unit">
          ${units.map((u) => `<button type="button" data-unit="${u}" aria-pressed="${u === state.unit}">${{ r: 'R', pips: 'Pips', usd: `$ @ ${state.lots} lot` }[u]}</button>`).join('')}
        </div>
      </div>
      <div class="chart-host" id="chart"></div>
      <p class="chart-note">Hover or focus the chart and use ← → to step through trades.</p>
    </div>

    <div id="calc-slot"></div>

    <h3 class="section-title">Copying at ${esc(nf(2).format(state.lots))} lot from $${esc(nf(0).format(state.balance))}</h3>
    <div class="copy-strip reveal">
      <div><div class="v ${tone(s.totalUsd)}">${fmt.usd(s.totalUsd)}</div><div class="l">Net P&amp;L</div></div>
      <div><div class="v">$${nf(2).format(final)}</div><div class="l">Final balance</div></div>
      <div><div class="v ${tone(s.totalUsd)}">${sign(s.totalUsd)}${nf(1).format(Math.abs(s.totalUsd / state.balance) * 100)}%</div><div class="l">Return</div></div>
      <div><div class="v ${s.maxDrawdownUsd ? 'loss' : ''}">${s.maxDrawdownUsd ? `−$${nf(2).format(s.maxDrawdownUsd)}` : '$0'}</div><div class="l">Max drawdown</div></div>
    </div>

    <h3 class="section-title">Monthly reports</h3>
    <div class="months">${[...s.months].reverse().map((m) => monthCard(m, view)).join('')}</div>

    <div class="table-box">
      <div class="table-wrap" tabindex="0" role="region" aria-label="Trade log, ${view.trades.length} trades, scrollable">${tradeTable(view, s)}</div>
      <div class="vbar" aria-hidden="true"><div class="vbar-thumb"></div></div>
    </div>
  `;

  placeCalc(panel);
  panel.querySelectorAll('.bar > span').forEach((b) => { b.style.width = `${b.dataset.w}%`; });
  panel.querySelector('.seg').onclick = (e) => {
    const b = e.target.closest('[data-unit]'); if (!b) return;
    state.unit = b.dataset.unit; renderPanel(view);
  };
  initScrollbar(panel.querySelector('.table-box'));

  drawChart(view, s);
}

/**
 * Custom vertical scrollbar for the fixed-height trade log: a green, shimmering thumb that tracks
 * the scroll position, can be dragged, and jumps a page when the track is clicked.
 * The box keeps native scrolling (wheel, touch, keyboard); only the native vertical bar is hidden.
 */
let tableResizeObs = null;
function initScrollbar(box) {
  if (!box) return;
  const sc = box.querySelector('.table-wrap'), bar = box.querySelector('.vbar'), thumb = bar.firstElementChild;
  let thumbH = 0, idle = 0;

  const update = () => {
    const { scrollHeight: sh, clientHeight: ch, scrollTop: st } = sc;
    bar.hidden = sh <= ch + 1;
    if (bar.hidden) return;
    const track = bar.clientHeight;
    thumbH = Math.max(36, (ch / sh) * track);
    thumb.style.height = `${thumbH}px`;
    thumb.style.transform = `translateY(${(st / (sh - ch)) * (track - thumbH)}px)`;
  };

  sc.addEventListener('scroll', () => {
    update();
    box.classList.add('scrolling');
    clearTimeout(idle); idle = setTimeout(() => box.classList.remove('scrolling'), 600);
  }, { passive: true });

  thumb.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation();
    thumb.setPointerCapture(e.pointerId);
    box.classList.add('dragging');
    const startY = e.clientY, startTop = sc.scrollTop;
    const ratio = (sc.scrollHeight - sc.clientHeight) / (bar.clientHeight - thumbH);
    const move = (ev) => { sc.scrollTop = startTop + (ev.clientY - startY) * ratio; };
    const up = () => { thumb.removeEventListener('pointermove', move); box.classList.remove('dragging'); };
    thumb.addEventListener('pointermove', move);
    thumb.addEventListener('pointerup', up, { once: true });
    thumb.addEventListener('pointercancel', up, { once: true });
  });

  bar.addEventListener('pointerdown', (e) => {
    if (e.target === thumb) return;
    const thumbTop = thumb.getBoundingClientRect().top;
    sc.scrollBy({ top: (e.clientY < thumbTop ? -1 : 1) * sc.clientHeight * 0.9, behavior: reduceMotion ? 'auto' : 'smooth' });
  });

  tableResizeObs?.disconnect();
  tableResizeObs = new ResizeObserver(update);
  tableResizeObs.observe(sc);
  update();
}

const kpi = (v, l, cls = '') =>
  `<div class="card kpi"><div class="v ${cls}${String(v).length > 8 ? ' long' : ''}">${esc(v)}</div><div class="l">${esc(l)}</div></div>`;

function monthCard(m, view) {
  return `<article class="card month">
    <h4>${esc(fmt.month(m.month))} <span class="muted small">${m.count} trades</span></h4>
    <div class="r ${tone(m.r)}">${fmt.r(m.r)}</div>
    <div class="bar" aria-hidden="true"><span data-w="${Math.round((m.winRate ?? 0) * 100)}"></span></div>
    <dl>
      <dt>Win rate</dt><dd>${fmt.pct(m.winRate)}</dd>
      <dt>W – L</dt><dd>${m.wins} – ${m.losses}</dd>
      ${view.combined ? '' : `<dt>Pips</dt><dd class="${tone(m.pips)}">${fmt.pips(m.pips)}</dd>`}
      <dt>At ${nf(2).format(state.lots)} lot</dt><dd class="${tone(m.usd)}">${fmt.usd(m.usd)}</dd>
    </dl>
  </article>`;
}

function tradeTable(view, s) {
  const rows = sortTrades(view.trades).map((t, i) => ({ t, n: i + 1 })).reverse();
  return `<table>
    <caption>Trade log · newest first</caption>
    <thead><tr>
      <th scope="col">#</th><th scope="col">Date</th><th scope="col">${view.combined ? 'Source' : 'Time'}</th><th scope="col">Side</th>
      <th scope="col">Entry</th><th scope="col">Exit</th><th scope="col">TP</th><th scope="col">SL</th>
      <th scope="col">Result</th><th scope="col">Pips</th><th scope="col">R</th><th scope="col">$ @ ${esc(state.lots)}</th>
    </tr></thead>
    <tbody>${rows.map(({ t, n }) => {
      const o = outcome(t), cls = o === 'win' ? 'tp' : o === 'loss' ? 'sl' : 'be';
      const u = tradeUsd(t, state.lots);
      return `<tr>
        <td class="muted">${String(n).padStart(2, '0')}</td>
        <td>${esc(fmt.date(t.date))}</td>
        <td class="muted">${esc(view.combined ? t.channelName : (t.time ?? '—'))}</td>
        <td>${esc(t.side ?? '—')}</td>
        <td>${fmt.price(t.entry)}</td><td>${fmt.price(t.exit)}</td>
        <td class="muted">${fmt.price(t.tp)}</td><td class="muted">${fmt.price(t.sl)}</td>
        <td><span class="pill ${cls}">${esc(t.result)}</span></td>
        <td class="${tone(t.pips)}">${t.pips == null ? '—' : fmt.pips(t.pips)}</td>
        <td class="${tone(t.r)}">${t.r == null ? '—' : fmt.r(t.r)}</td>
        <td class="${tone(u)}">${fmt.usd(u)}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

function drawChart(view, s) {
  const host = $('#chart');
  const unit = state.unit;
  const format = (v, axis) => fmt[unit](v, axis);
  const points = s.equity.map((e) => ({ value: e[unit], trade: e.trade }));
  $('#chart-total').textContent = format(points.at(-1).value);
  const draw = () => renderEquityChart(host, points, {
    format,
    label: `${view.name} cumulative ${unit === 'r' ? 'R' : unit === 'usd' ? 'dollar' : 'pip'} growth over ${s.count} trades, ending at ${format(points.at(-1).value)}`,
    describe: (p, i) => {
      const t = p.trade;
      const own = { r: t.r == null ? '—' : fmt.r(t.r), pips: t.pips == null ? '—' : fmt.pips(t.pips), usd: fmt.usd(tradeUsd(t, state.lots)) }[unit];
      return [`#${i} · ${t.side ?? ''} ${t.result}`, `${fmt.date(t.date)}${t.time ? ` ${t.time}` : ''}`, `Trade ${own}`, `Total ${format(p.value)}`];
    },
  });
  draw();
  resizeObs?.disconnect();
  let w = host.clientWidth, raf = 0;
  resizeObs = new ResizeObserver(() => {
    if (Math.abs(host.clientWidth - w) < 8) return;
    w = host.clientWidth; cancelAnimationFrame(raf); raf = requestAnimationFrame(draw);
  });
  resizeObs.observe(host);
}
let resizeObs = null;

// ---- calculator --------------------------------------------------------------
const money = (v) => `$${nf(0).format(v)}`;

/** Updates the rule book table, the "max" hint, and which presets are allowed for this capital. */
function renderRules(capital) {
  const max = maxLotFor(capital);
  $('#max-lot').textContent = capital >= 1 ? `· max ${nf(2).format(max)}` : '';
  $('#lots').max = max || '';
  document.querySelectorAll('[data-lots]').forEach((b) => {
    const over = capital >= 1 && Number(b.dataset.lots) > max;
    b.disabled = over;
    b.title = over ? `Above the rule book max (${nf(2).format(max)} lot) for ${money(capital)}` : '';
  });
  $('#rulebook-rows').innerHTML = ruleRows(capital).map((r) => `
    ${r.gap ? '<tr class="gap" aria-hidden="true"><td colspan="2">⋯</td></tr>' : ''}
    <tr${r.current ? ' class="current" aria-current="true"' : ''}>
      <td>${r.from === 0 ? `Under ${money(r.below)}` : `${money(r.from)} – ${money(r.below - 1)}`}</td>
      <td>${nf(2).format(r.maxLot)} lot${r.current ? ' <span class="you">your capital</span>' : ''}</td>
    </tr>`).join('');
}

function initCalc() {
  const lots = $('#lots'), bal = $('#balance'), err = $('#calc-error'), note = $('#calc-note');
  lots.value = state.lots; bal.value = state.balance;
  const syncPresets = () => document.querySelectorAll('[data-lots]').forEach((b) => b.setAttribute('aria-pressed', Number(b.dataset.lots) === state.lots));
  syncPresets();
  renderRules(state.balance);

  const apply = (changed) => {
    let l = Number(lots.value);
    const b = Number(bal.value);
    const balOk = b >= 1;
    const max = balOk ? maxLotFor(b) : null;
    note.hidden = true;

    // Capital went down and the current lot is now over the rule: step the lot down to the max.
    if (balOk && changed === 'balance' && l > max) {
      l = max; lots.value = max;
      note.textContent = `Lot size reduced to ${nf(2).format(max)}, the rule book max for ${money(b)} capital.`;
      note.hidden = false;
    }

    const lotsOk = l >= 0.01 && (max === null || l <= max);
    lots.setAttribute('aria-invalid', !lotsOk); bal.setAttribute('aria-invalid', !balOk);
    err.hidden = lotsOk && balOk;
    err.textContent = !balOk ? 'Starting capital must be at least $1.'
      : !(l >= 0.01) ? 'Lot size must be at least 0.01.'
      : !lotsOk ? `Rule book: max lot for ${money(b)} capital is ${nf(2).format(max)}.` : '';
    if (balOk) renderRules(b);
    if (!lotsOk || !balOk) return;
    state.lots = Math.round(l * 100) / 100; state.balance = b;
    syncPresets();
    if (state.data) renderPanel(views().find((v) => v.id === state.tab));
  };
  let t = 0;
  lots.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => apply('lots'), 250); });
  bal.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => apply('balance'), 250); });
  $('#calc-form').addEventListener('submit', (e) => { e.preventDefault(); apply('lots'); });
  document.querySelectorAll('[data-lots]').forEach((b) => b.addEventListener('click', () => { lots.value = b.dataset.lots; apply('lots'); }));
}

initCalc();
load();
setInterval(load, 5 * 60_000); // pick up new syncs without a reload
