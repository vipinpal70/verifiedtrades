// Dependency-free animated equity curve (SVG) with crosshair tooltip + keyboard support.
const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

function niceTicks(min, max, count = 4) {
  const span = max - min || 1;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const ticks = [];
  const lo = Math.floor(min / step), hi = Math.ceil(max / step);
  for (let k = lo; k <= hi; k++) ticks.push(Number((k * step).toFixed(10)));
  return ticks;
}

/**
 * @param host    element to render into (cleared)
 * @param points  [{ value, trade }] cumulative; points[0] is the 0 baseline
 * @param opts    { format(v) => string, label, describe(point) => string[] }
 */
export function renderEquityChart(host, points, { format, label, describe }) {
  host.replaceChildren();
  if (points.length < 2) {
    host.innerHTML = '<p class="chart-empty">No trades yet for this view.</p>';
    return;
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const W = Math.max(280, host.clientWidth);
  const H = W < 560 ? 220 : 300;
  const m = { t: 12, r: 72, b: 28, l: 4 };
  const iw = W - m.l - m.r, ih = H - m.t - m.b;

  const vals = points.map((p) => p.value);
  const ticks = niceTicks(Math.min(0, ...vals), Math.max(0, ...vals));
  const lo = ticks[0], hi = ticks.at(-1);
  const x = (i) => m.l + (i / (points.length - 1)) * iw;
  const y = (v) => m.t + (1 - (v - lo) / (hi - lo || 1)) * ih;

  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': label, class: 'chart-svg' });
  const defs = el('defs');
  const grad = el('linearGradient', { id: 'eqfill', x1: 0, y1: 0, x2: 0, y2: 1 });
  // CSS vars only resolve via style, not presentation attributes. Set via CSSOM so CSP (no inline styles) allows it.
  for (const [offset, opacity] of [[0, 0.28], [1, 0]]) {
    const stop = el('stop', { offset });
    stop.style.stopColor = 'var(--accent)'; stop.style.stopOpacity = opacity;
    grad.append(stop);
  }
  defs.append(grad); svg.append(defs);

  for (const t of ticks) {
    svg.append(el('line', { x1: m.l, x2: m.l + iw, y1: y(t), y2: y(t), class: t === 0 ? 'grid zero' : 'grid' }));
    const tx = el('text', { x: W - m.r + 10, y: y(t) + 4, class: 'axis' }); tx.textContent = format(t, true); svg.append(tx);
  }

  // x labels: ~1 per 110px so they never collide
  const n = Math.max(1, Math.min(Math.floor(iw / 110), points.length - 1));
  let prevDate = null;
  for (let k = 0; k <= n; k++) {
    const i = Math.max(1, Math.round((k / n) * (points.length - 1)));
    const d = points[i].trade?.date; if (!d || d === prevDate) continue;
    prevDate = d;
    const tx = el('text', { x: x(i), y: H - 6, class: 'axis', 'text-anchor': k === 0 ? 'start' : k === n ? 'end' : 'middle' });
    tx.textContent = new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    svg.append(tx);
  }

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const area = el('path', { d: `${line}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z`, fill: 'url(#eqfill)', class: 'area' });
  const path = el('path', { d: line, class: 'line' });
  svg.append(area, path);

  const last = points.length - 1;
  const endDot = el('circle', { cx: x(last), cy: y(points[last].value), r: 5, class: 'end-dot' });
  svg.append(endDot);

  // hover layer
  const cross = el('line', { y1: m.t, y2: m.t + ih, class: 'crosshair', visibility: 'hidden' });
  const dot = el('circle', { r: 5, class: 'hover-dot', visibility: 'hidden' });
  svg.append(cross, dot);
  const tip = document.createElement('div');
  tip.className = 'chart-tip'; tip.hidden = true;
  tip.setAttribute('role', 'status');
  host.append(svg, tip);

  let active = null;
  const show = (i) => {
    active = Math.max(1, Math.min(last, i));
    const p = points[active], px = x(active), py = y(p.value);
    cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
    dot.classList.toggle('loss', p.trade && (p.trade.pips ?? p.trade.r) < 0);
    tip.replaceChildren(...describe(p, active).map((txt, k) => Object.assign(document.createElement(k ? 'span' : 'strong'), { textContent: txt })));
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = `${Math.min(Math.max(px - tw / 2, 0), W - tw)}px`;
    tip.style.top = `${Math.max(py - tip.offsetHeight - 14, 0)}px`;
  };
  const hide = () => { active = null; tip.hidden = true; cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };

  svg.addEventListener('pointermove', (e) => {
    const r = svg.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    show(Math.round(((px - m.l) / iw) * (points.length - 1)));
  });
  svg.addEventListener('pointerleave', hide);
  host.tabIndex = 0;
  host.onkeydown = (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault(); show((active ?? (e.key === 'ArrowRight' ? 0 : last + 1)) + (e.key === 'ArrowRight' ? 1 : -1));
    } else if (e.key === 'Escape') hide();
  };
  host.onblur = hide;

  if (!reduce) {
    const len = path.getTotalLength();
    path.style.strokeDasharray = len; path.style.strokeDashoffset = len;
    area.style.opacity = 0; endDot.style.opacity = 0;
    requestAnimationFrame(() => {
      path.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(.2,.7,.2,1)';
      area.style.transition = endDot.style.transition = 'opacity .6s ease 1s';
      path.style.strokeDashoffset = 0; area.style.opacity = 1; endDot.style.opacity = 1;
    });
  }
}
