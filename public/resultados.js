/* Aba Resultados: mesma família visual da Mídia paga (cartões k-card, gráficos de ui/charts.js e
   ícones de ui/icons.js). resumoResultados() é pura e testada em tests/resultados.test.mjs.
   Cor e largura viajam em data-*, aplicadas por wire() depois de inserir o HTML (CSP). */
import { area, donut, KIT, fmt } from './ui/charts.js';
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
  const head = ui.heading('Resultados', 'Veja quais conteúdos geram alcance e como as pessoas interagem com a NGD.', false);
  const nome = id => ui.networks[id]?.name || id;
  const tem = r.medidos > 0;
  const datas = r.rows.filter(x => x.at).map(x => diaBrasilia(x.at)).sort();
  const curta = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  const periodo = datas.length ? curta(datas[0]) + ' — ' + curta(datas.at(-1)) : 'Todas as publicações';
  const toolbar = '<div class="k-results-toolbar"><div class="k-results-context"><div><strong>Publicações analisadas</strong>' + esc(periodo) + '</div><div><strong>' + (r.ultima ? 'Última atualização' : 'Coleta diária às 7h') + '</strong>' + (r.ultima ? esc(ui.date(r.ultima)) : 'Aguardando métricas das redes') + '</div></div><button id="collect" class="button secondary small">' + icon('refresh', { size: 16 }) + ' Atualizar métricas</button></div>';
  if (!r.rows.length) return head + scope(toolbar + '<section class="k-card"><div class="k-empty"><strong>Seus resultados vão aparecer aqui</strong><span>Conecte as contas e publique o primeiro conteúdo. Os indicadores variam entre as redes.</span><a href="#networks" class="button secondary">Gerenciar redes</a></div></section>');
  const kpi = ({ k, titulo, icone }) => '<div class="k-kpi"><span class="k-kpi-label">' + icon(icone, { size: 16 }) + titulo + '</span><strong class="k-num">' + (tem ? fmt(r.total[k]) : '—') + '</strong><small>' + (!tem ? 'aguardando a coleta das redes' : k === 'views' ? r.taxa.toFixed(1).replace('.', ',') + '% de interações por visualização' : 'em ' + r.medidos + ' publicaç' + (r.medidos === 1 ? 'ão medida' : 'ões medidas')) + '</small></div>';
  const kpis = '<section class="k-card k-kpis k-results-kpis" aria-label="Totais das publicações">' + METRICAS.map(kpi).join('') + '</section>';
  const coverage = '<p class="k-note k-m0">' + r.medidos + ' de ' + r.rows.length + ' publicações com métricas. Coleta automática diária às 7h; os dados disponíveis variam por rede.</p>';
  if (!tem) return head + scope(toolbar + kpis + coverage + tabela(r, ui, nome));
  const medidasRede = r.porRede.filter(n => n.medidos > 0);
  const lider = medidasRede.find(n => n.views > 0);
  const evolucao = cartao('Alcance ao longo do tempo', 'trend', 'por dia de publicação',
    '<p class="k-result-summary"><strong class="k-num">' + fmt(r.total.views) + '</strong><span>visualizações nas publicações medidas</span></p>' +
    area({ labels: r.serie.map(s => s.dia.slice(8, 10) + '/' + s.dia.slice(5, 7)), values: r.serie.map(s => s.views), name: 'Visualizações', title: 'Visualizações por dia de publicação', height: 236, linear: true }) +
    '<p class="k-note">Cada ponto soma as visualizações dos conteúdos publicados naquele dia. Não representa as visualizações recebidas no dia nem um histórico de crescimento.</p>');
  const fatias = medidasRede.map(n => ({ label: nome(n.network), value: n.views, color: NETWORK_COLORS[n.network] }));
  const rosca = cartao('De onde vem o alcance', 'pie', lider ? esc(nome(lider.network)) + ' na frente' : 'por rede',
    '<div class="k-donut-wrap">' + donut({ slices: fatias, center: fmt(r.total.views), centerColor: KIT.ink, caption: 'visualizações', title: 'Visualizações por rede', size: 180, thickness: 18 }) +
    '<ul class="k-reach-legend">' + fatias.map(x => '<li data-c="' + esc(x.color || KIT.accent) + '"><i aria-hidden="true"></i><span>' + esc(x.label) + '</span><b>' + fmt(x.value) + '</b><small>' + (r.total.views ? (x.value / r.total.views * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '0') + '% do alcance medido</small></li>').join('') + '</ul></div>');
  const top = r.rows.filter(x => Number(x.m?.views) > 0).sort((a, b) => b.m.views - a.m.views).slice(0, 6);
  const max = Number(top[0]?.m.views) || 0;
  const melhores = cartao('Conteúdos que mais alcançaram', 'trophy', 'ranking por publicação', top.length ?
    '<ol class="k-hbars k-ranking">' + top.map(x => '<li><span class="k-hbars-label"><strong>' + esc(x.title) + '</strong><small>' + esc(nome(x.network)) + ' · ' + esc(TIPO[x.kind] || 'Vídeo') + '</small></span><span class="k-hbars-track"><i data-w="' + (Number(x.m.views) / max * 100).toFixed(1) + '" data-c="' + esc(NETWORK_COLORS[x.network] || KIT.accent) + '"></i></span><b class="k-num">' + fmt(x.m.views) + '</b></li>').join('') + '</ol>' : '<div class="k-empty"><strong>Aguardando alcance</strong><span>O ranking aparece quando houver visualizações medidas.</span></div>');
  const maximos = Object.fromEntries(METRICAS.slice(1).map(m => [m.k, Math.max(0, ...medidasRede.map(n => n[m.k]))]));
  const interacao = cartao('Como as pessoas interagem', 'heart', 'comparação entre redes',
    '<div class="k-engagement-grid">' + medidasRede.map(n => '<section class="k-engagement"><h3>' + esc(nome(n.network)) + '</h3>' + METRICAS.slice(1).map(m => '<div class="k-engagement-row"><span>' + m.titulo + '</span><b>' + fmt(n[m.k]) + '</b><span class="k-hbars-track"><i data-w="' + (maximos[m.k] ? n[m.k] / maximos[m.k] * 100 : 0).toFixed(1) + '" data-c="' + m.cor + '"></i></span></div>').join('') + '</section>').join('') + '</div><p class="k-note">Escala própria para cada indicador, igual entre as redes. Compare o mesmo indicador entre redes; os números são absolutos.</p>');
  return head + scope(toolbar + kpis + coverage + '<div class="k-results-grid">' + evolucao + rosca + melhores + interacao + '</div>' + tabela(r, ui, nome));
}

function tabela(r, ui, nome) {
  const num = v => v != null ? fmt(v) : '—';
  const linhas = r.rows.slice().sort((a, b) => (Number(b.m?.views) || 0) - (Number(a.m?.views) || 0)).map(x => '<tr><td class="t-title">' + esc(x.title) + '</td><td>' + (TIPO[x.kind] || 'Vídeo') + '</td><td><span class="cell-net">' + ui.networkMark(x.network) + esc(nome(x.network)) + '</span></td><td>' + ui.date(x.at) + '</td><td class="t-right k-num"><strong>' + num(x.m?.views) + '</strong></td><td class="t-right k-num">' + num(x.m?.likes) + '</td><td class="t-right k-num">' + num(x.m?.comments) + '</td><td class="t-right k-num">' + num(x.m?.shares) + '</td><td>' + (x.url ? '<a class="k-link" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">Abrir ↗</a>' : '—') + '</td></tr>').join('');
  return '<section class="k-card k-results-table"><div class="k-card-head"><h2 class="k-card-title with-icon">' + icon('rows', { size: 20 }) + ' Desempenho por publicação</h2><span class="k-muted k-body2">' + r.rows.length + ' publicações · maior alcance primeiro</span></div><div class="k-table-scroll"><table class="k-table compact"><thead><tr><th scope="col">Conteúdo</th><th scope="col">Tipo</th><th scope="col">Rede</th><th scope="col">Data</th><th scope="col" class="t-right">Views</th><th scope="col" class="t-right">Curtidas</th><th scope="col" class="t-right">Comentários</th><th scope="col" class="t-right">Compart.</th><th scope="col">Abrir</th></tr></thead><tbody>' + linhas + '</tbody></table></div><p class="k-note k-pad">Métricas coletadas todo dia às 7h para publicações feitas pela automação. Publicações registradas à mão não têm coleta, e cada rede mostra indicadores diferentes. Traço indica dado indisponível.</p></section>';
}
