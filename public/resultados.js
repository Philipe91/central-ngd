/* Aba Resultados: mesma família visual da Mídia paga (cartões k-card, gráficos de ui/charts.js e
   ícones de ui/icons.js). resumoResultados() é pura e testada em tests/resultados.test.mjs.
   Cor e largura viajam em data-*, aplicadas por wire() depois de inserir o HTML (CSP). */
import { area, bars, hbars, donut, legend, KIT, fmt } from './ui/charts.js';
import { icon } from './ui/icons.js';
import { NETWORK_COLORS } from './charts.js';

export const METRICAS = [
  { k: 'views', titulo: 'Visualizações', icone: 'eye', cor: KIT.accent },
  { k: 'likes', titulo: 'Curtidas', icone: 'heart', cor: KIT.green },
  { k: 'comments', titulo: 'Comentários', icone: 'chat', cor: KIT.yellow },
  { k: 'shares', titulo: 'Compartilhamentos', icone: 'share', cor: KIT.purple },
];
const TIPO = { video: 'Vídeo', image: 'Imagem', carousel: 'Carrossel' };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const diaBrasilia = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

export function resumoResultados(contents) {
  const rows = contents.flatMap(c => Object.entries(c.posts || {})
    .filter(([, p]) => ['published', 'manual'].includes(p.status))
    .map(([n, p]) => ({ id: c.id, title: c.title, kind: c.kind || 'video', network: n, url: p.url, at: p.updatedAt, m: p.metrics })));
  const total = Object.fromEntries(METRICAS.map(({ k }) => [k, rows.reduce((t, r) => t + (Number(r.m?.[k]) || 0), 0)]));
  const medidas = rows.filter(r => r.m);
  const porRede = {};
  for (const r of rows) {
    const n = (porRede[r.network] ??= { network: r.network, posts: 0, medidos: 0, views: 0, likes: 0, comments: 0, shares: 0 });
    n.posts += 1; if (r.m) n.medidos += 1;
    for (const { k } of METRICAS) n[k] += Number(r.m?.[k]) || 0;
  }
  // Evolução: visualizações somadas por dia de publicação (fuso de Brasília), em ordem cronológica.
  const dias = {};
  for (const r of medidas) if (r.at) { const d = diaBrasilia(r.at); dias[d] = (dias[d] || 0) + (Number(r.m.views) || 0); }
  const interacoes = total.likes + total.comments + total.shares;
  return {
    rows, total, medidos: medidas.length,
    taxa: total.views ? (interacoes / total.views) * 100 : 0,
    porRede: Object.values(porRede).sort((a, b) => b.views - a.views || b.posts - a.posts),
    serie: Object.keys(dias).sort().map(dia => ({ dia, views: dias[dia] })),
    ultima: medidas.map(r => r.m.at).filter(Boolean).sort().at(-1) || '',
  };
}

// .k-scope isola o kit dos estilos antigos de SVG/ícone do painel (mesmo envoltório da Mídia paga).
const scope = html => `<div class="k-scope">${html}</div>`;
const cartao = (titulo, ic, nota, corpo, extra = '') => `<section class="k-card${extra}">
  <div class="k-card-head"><h2 class="k-card-title with-icon">${icon(ic, { size: 20 })} ${titulo}</h2><span class="k-muted k-body2">${nota}</span></div>
  <div class="k-card-body">${corpo}</div></section>`;

export function paginaResultados(contents, ui) {
  const r = resumoResultados(contents);
  const head = ui.heading('Resultados', 'Entenda quais conteúdos aproximam mais pessoas da NGD.', false);
  if (!r.rows.length) return head + scope(`<section class="k-card"><div class="k-empty"><strong>Seus resultados vão aparecer aqui</strong><span>Conecte as contas e publique o primeiro conteúdo. Os indicadores variam entre as redes.</span><a href="#networks" class="button secondary">Gerenciar redes</a></div></section>`);
  const nome = id => ui.networks[id]?.name || id;
  const tem = r.medidos > 0;
  const kpi = ({ k, titulo, icone }) => `<div class="k-kpi"><span class="k-kpi-label">${icon(icone, { size: 16 })}${titulo}</span>
    <strong class="k-num">${tem ? fmt(r.total[k]) : '—'}</strong>
    <small>${!tem ? 'aguardando a coleta das redes' : k === 'views' ? `${r.taxa.toFixed(1).replace('.', ',')}% viraram interação` : `em ${r.medidos} publicaç${r.medidos === 1 ? 'ão medida' : 'ões medidas'}`}</small></div>`;
  const kpis = `<section class="k-card k-kpis" aria-label="Totais das publicações">${METRICAS.map(kpi).join('')}</section>`;
  if (!tem) return head + scope(kpis + tabela(r, ui, nome));

  const medidasRede = r.porRede.filter(n => n.medidos > 0);
  const lider = medidasRede.find(n => n.views > 0);
  const evolucao = cartao('Alcance ao longo do tempo', 'trend', 'visualizações por dia de publicação',
    area({ labels: r.serie.map(s => s.dia.slice(8, 10) + '/' + s.dia.slice(5, 7)), values: r.serie.map(s => s.views), name: 'Visualizações', title: 'Visualizações por dia de publicação', height: 260 }), ' k-span-2');
  const fatias = medidasRede.map(n => ({ label: nome(n.network), value: n.views, color: NETWORK_COLORS[n.network] }));
  const rosca = cartao('De onde vem o alcance', 'pie', lider ? `${esc(nome(lider.network))} na frente` : 'por rede',
    `<div class="k-donut-wrap">${donut({ slices: fatias, caption: 'das visualizações', title: 'Visualizações por rede' })}${legend(fatias)}</div>`);
  const top = r.rows.filter(x => Number(x.m?.views) > 0).sort((a, b) => b.m.views - a.m.views).slice(0, 6);
  const melhores = cartao('Conteúdos que mais alcançaram', 'trophy', 'os seis melhores',
    hbars(top.map(x => ({ label: `${x.title} · ${nome(x.network)}`, value: x.m.views, color: NETWORK_COLORS[x.network] }))));
  const interacao = cartao('Como as pessoas interagem', 'heart', 'curtidas, comentários e compartilhamentos por rede',
    legend(METRICAS.slice(1).map(m => ({ label: m.titulo, color: m.cor })), { row: true }) +
    bars({ labels: medidasRede.map(n => nome(n.network)), series: METRICAS.slice(1).map(m => ({ name: m.titulo, color: m.cor, values: medidasRede.map(n => n[m.k]) })), title: 'Interações por rede', height: 240 }), ' k-span-2');

  return head + scope(kpis + `<div class="k-grid cols-2">${evolucao}${rosca}${melhores}${interacao}</div>` + tabela(r, ui, nome));
}

function tabela(r, ui, nome) {
  const num = v => (v != null ? fmt(v) : '—');
  const linhas = r.rows.slice().sort((a, b) => (Number(b.m?.views) || 0) - (Number(a.m?.views) || 0)).map(x => `<tr>
    <td class="t-title">${esc(x.title)}</td><td>${TIPO[x.kind] || 'Vídeo'}</td><td><span class="cell-net">${ui.networkMark(x.network)}${esc(nome(x.network))}</span></td>
    <td>${ui.date(x.at)}</td><td class="t-right k-num"><strong>${num(x.m?.views)}</strong></td><td class="t-right k-num">${num(x.m?.likes)}</td>
    <td class="t-right k-num">${num(x.m?.comments)}</td><td class="t-right k-num">${num(x.m?.shares)}</td>
    <td>${x.url ? `<a class="k-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">Abrir ↗</a>` : ''}</td></tr>`).join('');
  return `<section class="k-card"><div class="k-card-head"><h2 class="k-card-title with-icon">${icon('rows', { size: 20 })} Desempenho por publicação</h2>
    <div class="k-actions"><span class="k-muted k-body2">${r.ultima ? `Última coleta em ${ui.date(r.ultima)}` : 'Ainda sem coleta das plataformas'}</span>
    <button id="collect" class="button secondary small">${icon('refresh', { size: 16 })} Atualizar métricas</button></div></div>
    <div class="k-table-scroll"><table class="k-table compact"><thead><tr><th>Conteúdo</th><th>Tipo</th><th>Rede</th><th>Data</th>
    <th class="t-right">Views</th><th class="t-right">Curtidas</th><th class="t-right">Coment.</th><th class="t-right">Compart.</th><th></th></tr></thead>
    <tbody>${linhas}</tbody></table></div>
    <p class="k-note k-pad">Métricas coletadas todo dia às 7h para publicações feitas pela automação. Publicações registradas à mão não têm coleta, e cada rede mostra indicadores diferentes.</p></section>`;
}
