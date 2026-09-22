/* Gráficos no desenho do SaaS Dashboard UI Kit, em SVG puro, sem biblioteca e sem rede.

   area(opts)   curva suave com degradê embaixo, grade tracejada, balão escuro no ponto (cartão "Deals")
   line(opts)   mesma grade, várias séries sem preenchimento
   bars(opts)   colunas agrupadas com topo arredondado, mesma grade
   hbars(items) barras horizontais com rótulo e valor (ranking)
   donut(opts)  anel fino de 8px com o número grande e colorido no centro (cartão "Tasks")
   spark(vals)  linha mínima para dentro de números
   legend(items,{row}) bolinha vazada + rótulo (+ valor)
   wire(root)   depois de inserir o HTML: desenha area/line/bars na largura real do cartão (e de novo
                se ela mudar), aplica larguras/cores (data-w, data-c) e liga o balão

   Cores vão em atributos fill/stroke do SVG, que a CSP (style-src 'self') permite; style="" não. */

export const KIT = { accent:'#109bf0', green:'#2ed47a', yellow:'#ffb946', purple:'#885af8', red:'#f7685b', ink:'#192a3e', grid:'#d3d8dd', axis:'#c2cfe0', track:'#ebeff2' };
export const SERIES = [KIT.accent, KIT.green, KIT.yellow, KIT.purple, KIT.red];

const nf = new Intl.NumberFormat('pt-BR');
export const fmt = v => nf.format(Math.round(Number(v) || 0));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const r1 = n => Math.round(n * 10) / 10;
let uid = 0;

// escala "redonda" para o eixo: 0, 50, 100, 150, 200 como no kit
function niceMax(max, ticks) {
  if (max <= 0) return ticks;
  const raw = max / ticks, mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) * ticks;
}

// curva monotônica: não inventa pico nem vale entre dois pontos reais
function smooth(pts) {
  if (pts.length < 2) return pts.length ? `M${r1(pts[0][0])} ${r1(pts[0][1])}` : '';
  const n = pts.length, d = [], m = [];
  for (let i = 0; i < n - 1; i++) d.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  let s = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = (x1 - x0) / 3;
    s += `C${r1(x0 + h)} ${r1(y0 + m[i] * h)} ${r1(x1 - h)} ${r1(y1 - m[i + 1] * h)} ${r1(x1)} ${r1(y1)}`;
  }
  return s;
}

// grade tracejada #d3d8dd, linha de base #c2cfe0, números do eixo em #4c5862 (via CSS)
function grid({ max, W, H, ticks }) {
  const L = 40, R = 8, T = 12, B = 30, iw = W - L - R, ih = H - T - B;
  const y = v => T + ih - (v / max) * ih;
  let g = '';
  for (let t = 0; t <= ticks; t++) {
    const yy = r1(y((max / ticks) * t));
    g += t === 0
      ? `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${KIT.axis}" stroke-width="1"/>`
      : `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" stroke="${KIT.grid}" stroke-width="1" stroke-dasharray="6 6"/>`;
    g += `<text x="0" y="${yy + 4}">${fmt((max / ticks) * t)}</text>`;
  }
  return { g, y, L, R, T, B, iw, ih };
}

function xLabels(labels, x, H, want = 4) {
  const n = labels.length, step = Math.max(1, Math.ceil((n - 1) / (want - 1)));
  return labels.map((lb, i) => {
    const keep = i === n - 1 || (i % step === 0 && n - 1 - i >= step / 2);
    if (!keep) return '';
    const anchor = n > 1 && i === 0 ? 'start' : n > 1 && i === n - 1 ? 'end' : 'middle';
    return `<text x="${r1(x(i))}" y="${H - 6}" text-anchor="${anchor}">${esc(lb)}</text>`;
  }).join('');
}

function summary(title, labels, series, unit) {
  const s = series.map(se => `${se.name || ''}: ${se.values.map((v, i) => `${labels[i]} ${fmt(v)}${unit}`).join(', ')}`).join('; ');
  return `<title>${esc(title)}</title><desc>${esc(s)}</desc>`;
}

const norm = series => series.map((s, i) => ({ ...s, color: s.color || SERIES[i % SERIES.length], values: (s.values || []).map(v => Number(v) || 0) }));
const blank = (labels, series) => !labels.length || series.every(s => s.values.every(v => !v));

/* area({ labels, values, name, unit, color, marker:'max'|'last'|índice, title })
   ou series:[{name, values, color}]; só a primeira série ganha o degradê. */
export function area(opts) { return slot('line', { ...opts, fill: true }); }
export function line(opts) { return slot('line', { ...opts, fill: false }); }
export function bars(opts) { return slot('bars', opts); }

// O gráfico é desenhado por wire() na largura real do cartão: texto fica em 12px de verdade,
// em vez de esticar junto com um viewBox fixo.
function slot(kind, spec) {
  const h = spec.height || 220;
  return `<div class="k-chart-slot" data-kind="${kind}" data-h="${h}" data-spec="${esc(JSON.stringify(spec))}"></div>`;
}
const RENDER = { line: lineChart, bars: barChart };

function lineChart({ labels = [], values = [], name = '', series, unit = '', color = KIT.accent, marker = 'max', title = 'Gráfico', height = 220, width = 400, ticks = 4, fill }) {
  series = norm(series || [{ name, values, color }]);
  if (blank(labels, series)) return emptyChart('Ainda sem dados neste período.');
  const max = niceMax(Math.max(...series.flatMap(s => s.values)), ticks);
  const f = grid({ max, W: width, H: height, ticks });
  const x = i => f.L + (labels.length < 2 ? f.iw / 2 : (i / (labels.length - 1)) * f.iw);
  const id = 'kc' + (++uid);
  let defs = '', body = '';
  series.forEach((s, si) => {
    const pts = s.values.map((v, i) => [x(i), f.y(v)]), d = smooth(pts);
    if (fill && si === 0) {
      defs += `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${s.color}" stop-opacity=".22"/><stop offset="1" stop-color="${s.color}" stop-opacity="0"/></linearGradient>`;
      body += `<path d="${d}L${r1(pts.at(-1)[0])} ${r1(f.T + f.ih)}L${r1(pts[0][0])} ${r1(f.T + f.ih)}Z" fill="url(#${id})"/>`;
    }
    body += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
  });
  const first = series[0].values;
  const start = marker === 'last' ? first.length - 1 : marker === 'max' ? first.indexOf(Math.max(...first)) : Math.max(0, Math.min(first.length - 1, Number(marker) || 0));
  const pts = esc(JSON.stringify({ x: labels.map((_, i) => r1(x(i))), y: first.map(v => r1(f.y(v))), v: first.map(v => fmt(v) + unit), top: f.T, bottom: f.T + f.ih, W: width, start }));
  const slot = labels.length > 1 ? x(1) - x(0) : f.iw;
  const hit = labels.map((_, i) => `<rect class="k-hit" data-i="${i}" x="${r1(x(i) - slot / 2)}" y="${f.T}" width="${r1(slot)}" height="${f.ih}"/>`).join('');
  const tip = `<g class="k-tip" pointer-events="none"><line class="k-guide"/><circle r="5" fill="#fff" stroke="${series[0].color}" stroke-width="2"/><rect class="k-tip-bg" rx="12" height="24" width="46"/><text class="k-tip-text" text-anchor="middle"></text></g>`;
  return `<svg class="k-chart" viewBox="0 0 ${width} ${height}" role="img" data-chart="line" data-points="${pts}">${summary(title, labels, series, unit)}<defs>${defs}</defs>${f.g}${xLabels(labels, x, height)}${body}${tip}${hit}</svg>`;
}

/* bars({ labels, series:[{name, values, color}], unit, title }): colunas com topo de 4px */
function barChart({ labels = [], series = [], unit = '', title = 'Gráfico de colunas', height = 220, width = 400, ticks = 4 }) {
  series = norm(series);
  if (blank(labels, series)) return emptyChart('Ainda sem dados neste período.');
  const max = niceMax(Math.max(...series.flatMap(s => s.values)), ticks);
  const f = grid({ max, W: width, H: height, ticks });
  const slot = f.iw / labels.length, gap = 4, bw = Math.max(4, Math.min(14, (slot * 0.6 - gap * (series.length - 1)) / series.length));
  const cx = i => f.L + slot * i + slot / 2, base = f.T + f.ih;
  let body = '';
  labels.forEach((lb, i) => {
    const total = series.length * bw + (series.length - 1) * gap;
    series.forEach((s, si) => {
      const v = s.values[i]; if (!v) return;
      const h = (v / max) * f.ih, bx = cx(i) - total / 2 + si * (bw + gap), rr = Math.min(4, bw / 2, h);
      body += `<path d="M${r1(bx)} ${r1(base)}V${r1(base - h + rr)}Q${r1(bx)} ${r1(base - h)} ${r1(bx + rr)} ${r1(base - h)}H${r1(bx + bw - rr)}Q${r1(bx + bw)} ${r1(base - h)} ${r1(bx + bw)} ${r1(base - h + rr)}V${r1(base)}Z" fill="${s.color}"><title>${esc(s.name)} · ${esc(lb)}: ${fmt(v)}${esc(unit)}</title></path>`;
    });
  });
  const xl = labels.map((lb, i) => `<text x="${r1(cx(i))}" y="${height - 6}" text-anchor="middle">${esc(lb)}</text>`).join('');
  return `<svg class="k-chart" viewBox="0 0 ${width} ${height}" role="img">${summary(title, labels, series, unit)}${f.g}${xl}${body}</svg>`;
}

/* hbars([{label, value, color}], { unit }): HTML; largura e cor aplicadas por wire() */
export function hbars(items, { unit = '' } = {}) {
  const max = Math.max(0, ...items.map(i => Number(i.value) || 0));
  if (!max) return emptyChart('Ainda sem dados neste período.');
  return `<ul class="k-hbars">${items.map((it, i) => `<li><span class="k-hbars-label">${esc(it.label)}</span><span class="k-hbars-track"><i data-w="${r1((Number(it.value) || 0) / max * 100)}" data-c="${esc(it.color || SERIES[i % SERIES.length])}"></i></span><b class="k-num">${fmt(it.value)}${esc(unit)}</b></li>`).join('')}</ul>`;
}

/* donut({ slices:[{label, value, color}], center:'60%', centerColor, caption, title })
   Anel de 8px no círculo de 224px, como no cartão "Tasks" do kit. */
export function donut({ slices = [], center, centerColor, caption = '', title = 'Distribuição', size = 224, thickness = 8 }) {
  const total = slices.reduce((s, x) => s + (Number(x.value) || 0), 0);
  if (!total) return emptyChart('Ainda sem dados neste período.');
  const c = size / 2, r = c - thickness / 2, L = 2 * Math.PI * r;
  let acc = 0, arcs = '';
  slices.forEach((s, i) => {
    const v = Number(s.value) || 0; if (!v) return;
    const len = (v / total) * L, color = s.color || SERIES[i % SERIES.length];
    arcs += `<circle cx="${c}" cy="${c}" r="${r1(r)}" fill="none" stroke="${color}" stroke-width="${thickness}" stroke-dasharray="${r1(len)} ${r1(L - len)}" stroke-dashoffset="${r1(-acc)}" transform="rotate(-90 ${c} ${c})"><title>${esc(s.label)}: ${fmt(v)} (${Math.round(v / total * 100)}%)</title></circle>`;
    acc += len;
  });
  const main = slices.find(s => Number(s.value)) || slices[0];
  const label = center ?? Math.round((Number(main.value) || 0) / total * 100) + '%';
  const color = centerColor || main.color || SERIES[0];
  const desc = slices.map(s => `${s.label}: ${fmt(s.value)}`).join(', ');
  return `<svg class="k-chart" viewBox="0 0 ${size} ${size}" role="img"><title>${esc(title)}</title><desc>${esc(desc)}</desc>${arcs}<text class="k-donut-center" x="${c}" y="${caption ? c + 12 : c + 20}" text-anchor="middle" fill="${color}">${esc(label)}</text>${caption ? `<text class="k-donut-caption" x="${c}" y="${c + 40}" text-anchor="middle">${esc(caption)}</text>` : ''}</svg>`;
}

export function spark(values, { color = KIT.accent, width = 96, height = 28 } = {}) {
  const v = values.map(Number); if (v.length < 2) return '';
  const max = Math.max(...v), min = Math.min(...v), span = max - min || 1;
  const pts = v.map((y, i) => [2 + (i / (v.length - 1)) * (width - 4), 2 + (height - 4) - ((y - min) / span) * (height - 4)]);
  return `<svg class="k-spark" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${smooth(pts)}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round"/></svg>`;
}

export function legend(items, { row = false } = {}) {
  return `<ul class="k-legend${row ? ' row' : ''}">${items.map((it, i) => `<li data-c="${esc(it.color || SERIES[i % SERIES.length])}"><i></i><span>${esc(it.label)}</span>${it.value !== undefined ? `<b>${esc(typeof it.value === 'number' ? fmt(it.value) : it.value)}</b>` : ''}</li>`).join('')}</ul>`;
}

function emptyChart(msg) { return `<div class="k-empty k-chart-empty"><strong>Sem dados</strong><span>${esc(msg)}</span></div>`; }

/* Depois de inserir o HTML: larguras/cores por propriedade (permitido pela CSP) e balão que segue o mouse. */
export function wire(root = document) {
  root.querySelectorAll('[data-w]').forEach(el => { el.style.width = el.dataset.w + '%'; });
  root.querySelectorAll('[data-c]').forEach(el => { if (el.tagName === 'I') el.style.background = el.dataset.c; else el.style.setProperty('--dot', el.dataset.c); });
  root.querySelectorAll('.k-chart-slot').forEach(el => {
    el.style.minHeight = el.dataset.h + 'px';
    const draw = () => { const w = Math.round(el.clientWidth); if (!w || w === +el.dataset.drawn) return; el.dataset.drawn = w; el.innerHTML = RENDER[el.dataset.kind]({ ...JSON.parse(el.dataset.spec), width: w }); tips(el); };
    draw();
    if (!el.dataset.watch && 'ResizeObserver' in window) { el.dataset.watch = 1; new ResizeObserver(draw).observe(el); }
  });
}

function tips(root) {
  root.querySelectorAll('svg[data-chart=line]').forEach(svg => {
    const d = JSON.parse(svg.dataset.points), [guide, dot, bg, txt] = svg.querySelector('.k-tip').children;
    const show = i => {
      const x = d.x[i], y = d.y[i], w = Math.max(40, d.v[i].length * 7 + 18);
      guide.setAttribute('x1', x); guide.setAttribute('x2', x); guide.setAttribute('y1', d.top); guide.setAttribute('y2', d.bottom);
      dot.setAttribute('cx', x); dot.setAttribute('cy', y);
      let bx = x + 10; if (bx + w > d.W) bx = x - 10 - w;
      bg.setAttribute('width', w); bg.setAttribute('x', bx); bg.setAttribute('y', y - 12);
      txt.textContent = d.v[i]; txt.setAttribute('x', bx + w / 2); txt.setAttribute('y', y + 4);
    };
    show(d.start);
    svg.querySelectorAll('.k-hit').forEach(h => h.addEventListener('mouseenter', () => show(+h.dataset.i)));
    svg.addEventListener('mouseleave', () => show(d.start));
  });
}
