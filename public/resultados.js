/* Aba Resultados: painel de analytics no kit da Central (k-card, ui/charts.js, ui/icons.js).
   resumoResultados() é pura e testada em tests/resultados.test.mjs; os filtros só recortam as
   publicações antes do resumo, então todo número da tela sai dos dados coletados das redes.
   Cor e largura viajam em data-*, aplicadas por wire() depois de inserir o HTML (CSP). */
import { area, spark, KIT, fmt } from './ui/charts.js';
import { icon } from './ui/icons.js';
import { marcaRede, REDE_COR } from './ui/redes.js';

export const METRICAS = [
  { k: 'views', titulo: 'Visualizações', icone: 'eye', cor: KIT.accent },
  { k: 'likes', titulo: 'Curtidas', icone: 'heart', cor: KIT.green },
  { k: 'comments', titulo: 'Comentários', icone: 'chat', cor: KIT.yellow },
  { k: 'shares', titulo: 'Compartilhamentos', icone: 'share', cor: KIT.purple },
];
export const PERIODOS = [[7, 'Últimos 7 dias'], [30, 'Últimos 30 dias'], [90, 'Últimos 90 dias'], [0, 'Todo o período']];
// Redes que a automação publica aparecem sempre; as demais só quando houver publicação.
const REDES_FIXAS = ['youtube', 'instagram', 'facebook', 'tiktok'];
const TIPO = { video: 'Vídeo', image: 'Imagem', carousel: 'Carrossel' };
const DIA = 86400000;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const diaBrasilia = iso => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const pct = v => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%';

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

/* Mantém só as publicações da rede e da janela pedidas (data de publicação em [inicio, fim)).
   Sem janela (inicio = null) vale todo o histórico. */
export function recortar(contents, { rede = 'todas', inicio = null, fim = null } = {}) {
  return contents.map(c => ({ ...c, posts: Object.fromEntries(Object.entries(c.posts || {}).filter(([n, p]) => {
    if (rede !== 'todas' && n !== rede) return false;
    if (inicio == null) return true;
    const t = Date.parse(p.updatedAt);
    return Number.isFinite(t) && t >= inicio && t < fim;
  })) }));
}

/* Variação contra a janela anterior de mesmo tamanho. Sem base na janela anterior, não há número. */
export function variacao(atual, anterior) {
  if (!(anterior > 0)) return null;
  return ((atual - anterior) / anterior) * 100;
}

// Filtros da página: sobrevivem às atualizações automáticas do painel e, se der, ao recarregar.
const filtro = { dias: 30, rede: 'todas', metrica: 'views' };
try { Object.assign(filtro, JSON.parse(globalThis.localStorage?.getItem('ngd.resultados') || '{}')); } catch { /* sem armazenamento */ }
const guardar = () => { try { globalThis.localStorage?.setItem('ngd.resultados', JSON.stringify(filtro)); } catch { /* sem armazenamento */ } };

// .k-scope isola o kit dos estilos antigos de SVG/ícone do painel (mesmo envoltório da Mídia paga).
const scope = html => `<div class="k-scope r-page">${html}</div>`;
const cabeca = (titulo, ic, sub, extra = '') => `<div class="r-card-head"><div class="r-card-title">${ic}<div><h2 class="k-card-title with-icon">${titulo}</h2>${sub ? `<p>${sub}</p>` : ''}</div></div>${extra}</div>`;
const selo = v => v == null ? '' : `<span class="r-delta ${v >= 0 ? 'up' : 'down'}" title="Comparado com as publicações dos ${filtro.dias} dias anteriores">${v >= 0 ? '▲' : '▼'} ${v >= 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</span>`;
const duracao = s => { s = Math.round(Number(s) || 0); return s ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : ''; };

export function paginaResultados(contents, ui) {
  const agora = (ui.agora ? new Date(ui.agora) : new Date()).getTime();
  const nome = id => ui.networks[id]?.name || id;
  const todas = resumoResultados(contents);
  const fim = agora, inicio = filtro.dias ? agora - filtro.dias * DIA : null;
  const r = resumoResultados(recortar(contents, { rede: filtro.rede, inicio, fim }));
  const ant = filtro.dias ? resumoResultados(recortar(contents, { rede: filtro.rede, inicio: inicio - filtro.dias * DIA, fim: inicio })) : null;
  const tem = r.medidos > 0;
  const curta = d => d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4);
  const longa = t => new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'America/Sao_Paulo' }).replace('.', '');
  const datasTodas = todas.rows.filter(x => x.at).map(x => Date.parse(x.at)).sort((a, b) => a - b);
  const faixa = inicio != null ? longa(inicio) + ' — ' + longa(fim) : datasTodas.length ? longa(datasTodas[0]) + ' — ' + longa(fim) : 'Todas as publicações';

  // Cabeçalho com filtros reais: período e rede recortam a página inteira.
  const redesFiltro = [...new Set([...REDES_FIXAS, ...todas.rows.map(x => x.network)])];
  const opcao = (v, rotulo, atual) => `<option value="${v}"${String(v) === String(atual) ? ' selected' : ''}>${esc(rotulo)}</option>`;
  const seletor = (chave, ic, rotulo, opcoes, extra = '') => `<label class="r-select${extra}">${ic}<span>${esc(rotulo)}</span>${icon('caret', { size: 14 })}<select data-r-filtro="${chave}" aria-label="${chave === 'dias' ? 'Período' : chave === 'rede' ? 'Rede social' : 'Indicador'}">${opcoes}</select></label>`;
  const head = `<header class="r-head"><div><h1>Resultados</h1><p>Acompanhe o desempenho dos seus conteúdos em todas as redes sociais.</p>
    <small class="r-meta">${r.ultima ? 'Última coleta: ' + esc(ui.date(r.ultima)) : 'Coleta automática diária às 7h'} · ${r.medidos} de ${r.rows.length} publicaç${r.rows.length === 1 ? 'ão' : 'ões'} com métricas no período</small></div>
    <div class="r-head-tools">${seletor('dias', icon('calendar', { size: 16 }), faixa, PERIODOS.map(([d, t]) => opcao(d, t, filtro.dias)).join(''), ' r-periodo')}${seletor('rede', icon('network', { size: 16 }), filtro.rede === 'todas' ? 'Todas as redes' : nome(filtro.rede), opcao('todas', 'Todas as redes', filtro.rede) + redesFiltro.map(n => opcao(n, nome(n), filtro.rede)).join(''))}
    <button id="collect" class="r-btn" type="button" title="Busca agora as métricas nas redes">${icon('refresh', { size: 16 })} Atualizar métricas</button><span class="r-local">Neste computador</span><span class="r-avatar">NG</span></div></header>`;

  if (!todas.rows.length) return scope(head + '<section class="k-card"><div class="k-empty"><strong>Seus resultados vão aparecer aqui</strong><span>Conecte as contas e publique o primeiro conteúdo. Os indicadores variam entre as redes.</span><a href="#networks" class="button secondary">Gerenciar redes</a></div></section>');

  // Primeira linha: totais do período, com variação só quando a janela anterior tem base.
  const interacoes = r.total.likes + r.total.comments + r.total.shares;
  const intAnt = ant ? ant.total.likes + ant.total.comments + ant.total.shares : 0;
  const publicados = new Set(r.rows.map(x => x.id)).size;
  const dViews = ant ? variacao(r.total.views, ant.total.views) : null;
  const sparkViews = r.serie.length > 1 ? spark(r.serie.map(s => s.views), { color: 'rgba(255,255,255,.9)', width: 190, height: 52 }) : '';
  const kpiViews = `<section class="r-kpi r-kpi-hero" aria-label="Total de visualizações"><span class="r-kpi-icon">${icon('eye', { size: 26 })}</span><div><span class="r-kpi-label">Total de visualizações</span><div class="r-kpi-main"><strong class="k-num">${tem ? fmt(r.total.views) : '—'}</strong>${tem ? selo(dViews) : ''}<small>${!tem ? 'aguardando a coleta das redes' : dViews != null ? 'em relação ao período anterior' : 'nas publicações medidas'}</small></div></div>${sparkViews ? `<span class="r-kpi-spark" title="Visualizações por dia de publicação">${sparkViews}</span>` : ''}</section>`;
  const kpi = (ic, cor, valor, rotulo, delta, dica = '') => `<section class="r-kpi" data-c="${cor}"${dica ? ` title="${esc(dica)}"` : ''}><span class="r-kpi-icon">${ic}</span><div><strong class="k-num">${valor}</strong><small>${rotulo}</small></div>${selo(delta)}</section>`;
  const kpis = '<div class="r-kpis">' + kpiViews +
    kpi(icon('video', { size: 22 }), REDE_COR.youtube, fmt(publicados), 'conteúdos publicados', ant ? variacao(publicados, new Set(ant.rows.map(x => x.id)).size) : null, r.rows.length + ' publicações somando todas as redes') +
    kpi(icon('users', { size: 22 }), KIT.accent, tem ? fmt(interacoes) : '—', 'interações totais', tem && ant ? variacao(interacoes, intAnt) : null, 'Curtidas, comentários e compartilhamentos') +
    kpi(icon('trend', { size: 22 }), KIT.accent, tem ? pct(r.taxa) : '—', 'taxa de engajamento', null, 'Interações por visualização. As redes não informam taxa de conclusão dos vídeos.') + '</div>';

  if (!tem) return scope(head + kpis + '<p class="k-note k-m0">Nenhuma publicação deste período tem métricas ainda: aguardando a coleta das redes.</p>' + tabela(r, ui, nome));

  // Evolução: mesma série de antes (soma por dia de publicação), agora com botões de período.
  const botoes = `<div class="r-seg" role="group" aria-label="Período">${[7, 30, 90].map(d => `<button type="button" data-r-periodo="${d}" class="${filtro.dias === d ? 'on' : ''}" aria-pressed="${filtro.dias === d}">${d} dias</button>`).join('')}</div>`;
  const evolucao = `<section class="k-card r-card r-evolucao">${cabeca('Evolução de visualizações', `<span class="r-ic blue">${icon('chart', { size: 20 })}</span>`, 'Visualizações nas publicações de cada dia, somando ' + (filtro.rede === 'todas' ? 'todas as redes' : esc(nome(filtro.rede))), botoes)}
    <div class="r-card-body">${area({ labels: r.serie.map(s => s.dia.slice(8, 10) + '/' + s.dia.slice(5, 7)), tipLabels: r.serie.map(s => curta(s.dia)), tipSuffix: 'visualizações', values: r.serie.map(s => s.views), name: 'Visualizações', title: 'Visualizações por dia de publicação', height: 250, linear: true, xTicks: 9 })}
    <p class="k-note">Cada ponto soma as visualizações dos conteúdos publicados naquele dia (${esc(curta(r.serie[0].dia))} a ${esc(curta(r.serie.at(-1).dia))}). Não representa as visualizações recebidas no dia nem um histórico de crescimento.</p></div></section>`;

  // Por rede: linha por rede com total, participação e mini-série por dia de publicação (só com 2+ dias reais).
  const met = METRICAS.find(m => m.k === filtro.metrica) || METRICAS[0];
  const redes = [...new Set([...(filtro.rede === 'todas' ? REDES_FIXAS : [filtro.rede]), ...r.porRede.map(n => n.network)])];
  const info = id => r.porRede.find(n => n.network === id);
  const totalMet = r.porRede.reduce((t, n) => t + n[met.k], 0);
  const serieRede = id => { const d = {}; for (const x of r.rows) if (x.network === id && x.m && x.at) { const k = diaBrasilia(x.at); d[k] = (d[k] || 0) + (Number(x.m[met.k]) || 0); } return Object.keys(d).sort().map(k => d[k]); };
  const linhaRede = id => {
    const n = info(id), cor = REDE_COR[id] || KIT.accent, serie = serieRede(id);
    const valor = !n ? '0' : n.medidos ? fmt(n[met.k]) : '—';
    const parte = n?.medidos && totalMet ? pct(n[met.k] / totalMet * 100) : '0%';
    const fimLinha = !n ? '<span class="r-quiet">sem publicações</span>' : !n.medidos ? '<span class="r-quiet">sem coleta</span>' : serie.length > 1 ? spark(serie, { color: cor, width: 150, height: 34 }) : '<span class="r-quiet">1 dia com dados</span>';
    return `<li class="r-rede" data-c="${cor}">${marcaRede(id, 26)}<span class="r-rede-nome">${esc(nome(id))}</span><b class="k-num">${valor}</b><span class="r-rede-pct">${parte}</span><span class="r-rede-spark" title="${esc(met.titulo)} por dia de publicação">${fimLinha}</span></li>`;
  };
  const porRede = `<section class="k-card r-card r-redes">${cabeca(esc(met.titulo) + ' por rede social', `<span class="r-ic blue">${icon('network', { size: 20 })}</span>`, 'Participação de cada rede no total do período', seletor('metrica', '', met.titulo, METRICAS.map(m => opcao(m.k, m.titulo, met.k)).join(''), ' r-mini'))}
    <ul class="r-redes-list">${redes.map(linhaRede).join('')}</ul></section>`;

  // Ranking: publicações com mais visualizações no período, com miniatura real quando houver.
  const porId = Object.fromEntries(contents.map(c => [c.id, c]));
  const top = r.rows.filter(x => Number(x.m?.views) > 0).sort((a, b) => b.m.views - a.m.views).slice(0, 5);
  const max = Number(top[0]?.m.views) || 0;
  const num = v => v != null ? fmt(v) : '—';
  const linhaTop = (x, i) => {
    const c = porId[x.id], d = x.kind === 'video' ? duracao(c?.media?.duration) : '';
    const thumb = `<span class="r-thumb">${c?.media?.thumb ? `<img src="/media/prepared/${encodeURIComponent(c.media.thumb)}" alt="" loading="lazy">` : icon(x.kind === 'video' ? 'video' : 'image', { size: 18 })}${d ? `<em>${d}</em>` : ''}</span>`;
    return `<tr><td class="r-pos">${String(i + 1).padStart(2, '0')}</td><td><div class="r-conteudo">${thumb}<span><strong>${esc(x.title)}</strong><small>${esc(TIPO[x.kind] || 'Vídeo')}${d ? ' · ' + d : ''}</small></span></div></td><td class="r-rede-cel" title="${esc(nome(x.network))}">${marcaRede(x.network, 22)}<span class="sr">${esc(nome(x.network))}</span></td><td><div class="r-views"><b class="k-num">${fmt(x.m.views)}</b><span class="k-hbars-track"><i data-w="${(Number(x.m.views) / max * 100).toFixed(1)}" data-c="${REDE_COR[x.network] || KIT.accent}"></i></span></div></td><td><div class="r-eng"><span title="Curtidas">${icon('heart', { size: 16 })}${num(x.m.likes)}</span><span title="Comentários">${icon('chat', { size: 16 })}${num(x.m.comments)}</span><span title="Compartilhamentos">${icon('share', { size: 16 })}${num(x.m.shares)}</span></div></td><td>${x.url ? `<a class="r-open" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer" title="Abrir publicação" aria-label="Abrir publicação">${icon('link', { size: 16 })}</a>` : ''}</td></tr>`;
  };
  const melhores = `<section class="k-card r-card r-top">${cabeca('Conteúdos que mais alcançaram', `<span class="r-ic yellow">${icon('trophy', { size: 20 })}</span>`, 'Ranking das publicações com mais visualizações no período', '<button type="button" class="r-btn soft" data-r-todos>Ver todos</button>')}
    ${top.length ? `<div class="r-table-scroll"><table class="r-table"><thead><tr><th scope="col">#</th><th scope="col">Conteúdo</th><th scope="col">Rede</th><th scope="col">Visualizações</th><th scope="col">Engajamento</th><th scope="col"><span class="sr">Abrir</span></th></tr></thead><tbody>${top.map(linhaTop).join('')}</tbody></table></div>` : '<div class="k-empty"><strong>Aguardando alcance</strong><span>O ranking aparece quando houver visualizações medidas.</span></div>'}</section>`;

  // Interações: mesma escala por indicador entre as redes (compara o mesmo indicador, números absolutos).
  const medidasRede = redes.map(id => info(id) || { network: id, posts: 0, medidos: 0, views: 0, likes: 0, comments: 0, shares: 0 });
  const maximos = Object.fromEntries(METRICAS.slice(1).map(m => [m.k, Math.max(0, ...medidasRede.map(n => n[m.k]))]));
  const interacao = `<section class="k-card r-card r-interacao">${cabeca('Como as pessoas interagem', `<span class="r-ic red">${icon('heart', { size: 20 })}</span>`, 'Comparação entre redes, na mesma escala por indicador')}
    <div class="k-engagement-grid">${medidasRede.map(n => `<section class="k-engagement" data-rede="${esc(n.network)}"><h3>${marcaRede(n.network, 20)}${esc(nome(n.network))}</h3>${METRICAS.slice(1).map(m => `<div class="k-engagement-row"><span>${m.titulo}</span><b>${fmt(n[m.k])}</b><span class="k-hbars-track"><i data-w="${(maximos[m.k] ? n[m.k] / maximos[m.k] * 100 : 0).toFixed(1)}" data-c="${REDE_COR[n.network] || KIT.accent}"></i></span></div>`).join('')}</section>`).join('')}</div>
    <p class="k-note">Cada barra usa a escala do próprio indicador, igual entre as redes. Os números são absolutos.</p></section>`;

  return scope(head + kpis + '<div class="r-grid">' + evolucao + porRede + melhores + interacao + '</div>' + tabela(r, ui, nome));
}

function tabela(r, ui, nome) {
  const num = v => v != null ? fmt(v) : '—';
  const linhas = r.rows.slice().sort((a, b) => (Number(b.m?.views) || 0) - (Number(a.m?.views) || 0)).map(x => '<tr><td class="t-title">' + esc(x.title) + '</td><td>' + (TIPO[x.kind] || 'Vídeo') + '</td><td><span class="cell-net">' + marcaRede(x.network, 18) + esc(nome(x.network)) + '</span></td><td>' + ui.date(x.at) + '</td><td class="t-right k-num"><strong>' + num(x.m?.views) + '</strong></td><td class="t-right k-num">' + num(x.m?.likes) + '</td><td class="t-right k-num">' + num(x.m?.comments) + '</td><td class="t-right k-num">' + num(x.m?.shares) + '</td><td>' + (x.url ? '<a class="k-link" href="' + esc(x.url) + '" target="_blank" rel="noopener noreferrer">Abrir ↗</a>' : '—') + '</td></tr>').join('');
  return '<section class="k-card k-results-table r-card" id="r-todas">' + cabeca('Desempenho por publicação', `<span class="r-ic blue">${icon('rows', { size: 20 })}</span>`, r.rows.length + ' publicações no período · maior alcance primeiro') + '<div class="k-table-scroll"><table class="k-table compact"><thead><tr><th scope="col">Conteúdo</th><th scope="col">Tipo</th><th scope="col">Rede</th><th scope="col">Data</th><th scope="col" class="t-right">Views</th><th scope="col" class="t-right">Curtidas</th><th scope="col" class="t-right">Comentários</th><th scope="col" class="t-right">Compart.</th><th scope="col">Abrir</th></tr></thead><tbody>' + (linhas || '<tr><td colspan="9">Nenhuma publicação neste período.</td></tr>') + '</tbody></table></div><p class="k-note k-pad">Métricas coletadas todo dia às 7h para publicações feitas pela automação. Publicações registradas à mão não têm coleta, e cada rede mostra indicadores diferentes. Traço indica dado indisponível.</p></section>';
}

/* Liga filtros e atalhos depois que a página entra no DOM; rerender redesenha com o filtro novo. */
export function ligarResultados(root, rerender) {
  const mudar = (chave, valor) => { filtro[chave] = chave === 'dias' ? Number(valor) : valor; guardar(); rerender(); };
  root.querySelectorAll('[data-r-filtro]').forEach(el => el.addEventListener('change', () => mudar(el.dataset.rFiltro, el.value)));
  root.querySelectorAll('[data-r-periodo]').forEach(b => b.addEventListener('click', () => mudar('dias', b.dataset.rPeriodo)));
  root.querySelector('[data-r-todos]')?.addEventListener('click', () => root.querySelector('#r-todas')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}
