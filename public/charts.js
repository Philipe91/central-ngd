// Gráficos em SVG puro, sem biblioteca e sem build: o painel roda offline em 127.0.0.1,
// então um CDN quebraria sem internet. As cores saem dos mesmos tokens do style.css,
// para os gráficos parecerem parte da interface e não um enxerto.
//
// IMPORTANTE: o painel envia Content-Security-Policy com `style-src 'self'`, ou seja,
// atributo style="" no HTML é ignorado pelo navegador. Por isso cada valor dinâmico
// (cor, largura, atraso) viaja em um data-* e é aplicado por `paint()` depois de inserir
// o HTML, o que a política permite. Não troque isso por style inline nem afrouxe a CSP.

// Cor de cada rede: as mesmas dos ícones em .network-icon do style.css.
export const NETWORK_COLORS = {
  instagram: '#c44c79',
  youtube: '#df3e3e',
  tiktok: '#1e2d3d',
  facebook: '#3378dd',
  linkedin: '#3374a1',
};
// Cores de série do SaaS Dashboard UI Kit, para gráficos que não separam por rede.
export const SERIES_COLORS = ['#109cf1', '#2ed47a', '#ffb946', '#885af8', '#f7685b'];

const nf = new Intl.NumberFormat('pt-BR');
export const fmt = value => nf.format(Math.round(Number(value) || 0));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (part, whole) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/**
 * Aplica os valores dinâmicos guardados em data-*. Chame depois de escrever o HTML.
 * Estilo via JavaScript é aceito pela CSP; atributo style="" não é.
 */
export function paint(root = document) {
  for (const el of root.querySelectorAll('[data-bg]')) el.style.background = el.dataset.bg;
  for (const el of root.querySelectorAll('[data-w]')) el.style.width = el.dataset.w;
  for (const el of root.querySelectorAll('[data-h]')) el.style.height = el.dataset.h;
  for (const el of root.querySelectorAll('[data-delay]')) el.style.animationDelay = el.dataset.delay;
  for (const el of root.querySelectorAll('[data-size]')) el.style.setProperty('--donut-size', el.dataset.size);
  for (const el of root.querySelectorAll('[data-accent]')) el.style.setProperty('--accent', el.dataset.accent);
}

/**
 * Rosca com legenda ao lado. Mostra a participação de cada fatia no total.
 * slices: [{ label, value, color }]
 */
export function donut(slices, { unit = '', centerLabel = 'total', size = 168, thickness = 22 } = {}) {
  const data = slices.filter(s => Number(s.value) > 0).sort((a, b) => b.value - a.value);
  const total = data.reduce((t, s) => t + Number(s.value), 0);
  if (!total) return emptyChart('Sem números ainda');

  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  // stroke e stroke-dasharray são atributos de apresentação do SVG, não style: a CSP permite.
  const arcs = data.map((s, i) => {
    const color = s.color || SERIES_COLORS[i % SERIES_COLORS.length];
    const dash = (Number(s.value) / total) * c;
    const arc = `<circle class="donut-arc" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none"
      stroke="${color}" stroke-width="${thickness}"
      stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}"
      data-delay="${i * 90}ms"><title>${esc(s.label)}: ${fmt(s.value)} (${pct(s.value, total)}%)</title></circle>`;
    offset += dash;
    return arc;
  }).join('');

  const legendItems = data.map((s, i) => `<li>
      <span class="dot" data-bg="${s.color || SERIES_COLORS[i % SERIES_COLORS.length]}"></span>
      <span class="legend-name">${esc(s.label)}</span>
      <span class="legend-value">${fmt(s.value)}<em>${pct(s.value, total)}%</em></span>
    </li>`).join('');

  return `<div class="chart chart-donut" data-size="${size}px">
    <svg class="donut-svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="Distribuição por rede">
      <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#eef1f6" stroke-width="${thickness}"></circle>
      <g transform="rotate(-90 ${size / 2} ${size / 2})">${arcs}</g>
      <text class="donut-total" x="50%" y="48%" text-anchor="middle">${fmt(total)}</text>
      <text class="donut-caption" x="50%" y="62%" text-anchor="middle">${esc(unit || centerLabel)}</text>
    </svg>
    <ul class="chart-legend">${legendItems}</ul>
  </div>`;
}

/**
 * Barras horizontais, uma por item, da maior para a menor.
 * items: [{ label, value, color, sub, mark }]
 */
export function bars(items, { unit = '' } = {}) {
  const data = items.filter(i => Number(i.value) > 0);
  if (!data.length) return emptyChart('Sem números ainda');
  const max = Math.max(...data.map(i => Number(i.value)));

  return `<ul class="chart chart-bars">${data.map((i, n) => `<li data-delay="${n * 70}ms">
    <div class="bar-head">
      <span class="bar-label" title="${esc(i.label)}">${i.mark || ''}${esc(i.label)}</span>
      <strong>${fmt(i.value)}${unit ? `<em>${esc(unit)}</em>` : ''}</strong>
    </div>
    <div class="bar-track"><div class="bar-fill" data-w="${Math.max(4, (i.value / max) * 100).toFixed(1)}%" data-bg="${i.color || SERIES_COLORS[n % SERIES_COLORS.length]}"></div></div>
    ${i.sub ? `<small>${esc(i.sub)}</small>` : ''}
  </li>`).join('')}</ul>`;
}

/**
 * Barras agrupadas por categoria, para comparar métricas diferentes lado a lado.
 * groups: [{ label, mark, values: [{ label, value, color }] }]
 */
export function groupedBars(groups) {
  const all = groups.flatMap(g => g.values.map(v => Number(v.value) || 0));
  const max = Math.max(1, ...all);
  if (!all.some(v => v > 0)) return emptyChart('Sem números ainda');

  return `<div class="chart chart-grouped">${groups.map((g, n) => `<div class="group" data-delay="${n * 80}ms">
      <div class="group-plot">${g.values.map(v => `<div class="group-bar" title="${esc(v.label)}: ${fmt(v.value)}">
          <div class="group-fill" data-h="${Math.max(3, ((Number(v.value) || 0) / max) * 100).toFixed(1)}%" data-bg="${v.color}"></div>
        </div>`).join('')}</div>
      <div class="group-label">${g.mark || ''}<span>${esc(g.label)}</span></div>
    </div>`).join('')}</div>`;
}

/** Legenda solta, para quando o gráfico não traz a sua. items: [{label, color}] */
export function legend(items) {
  return `<ul class="chart-legend inline">${items.map(i => `<li><span class="dot" data-bg="${i.color}"></span><span class="legend-name">${esc(i.label)}</span></li>`).join('')}</ul>`;
}

function emptyChart(message) {
  return `<div class="chart chart-empty"><div class="result-bars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div><p>${esc(message)}</p></div>`;
}
