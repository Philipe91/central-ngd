/* Aba Site: desempenho de nucleografico.com.br no Google (Search Console), nas visitas (GA4) e na
   velocidade (PageSpeed). Os dados vêm de /api/site, que só lê APIs do Google com o robô de leitura;
   nada aqui fala com o servidor do site. htmlSite() é pura e testada em tests/site.test.mjs.
   Sem a chave do robô, o servidor devolve dados de exemplo (dados.exemplo = true) e a página avisa.
   Cor e largura viajam em data-*, aplicadas por wire() depois de inserir o HTML (CSP). */
import { area, spark, hbars, KIT, fmt, wire } from './ui/charts.js';
import { icon } from './ui/icons.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dec = (v, d = 1) => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
const curta = d => d.slice(8, 10) + '/' + d.slice(5, 7);
const longa = d => d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '';
const SITE = 'https://nucleografico.com.br';
const SERIES = {
  clicks: { titulo: 'Cliques no Google', fonte: 'gsc', k: 'clicks', cor: KIT.accent, sufixo: 'cliques' },
  impressions: { titulo: 'Aparições no Google', fonte: 'gsc', k: 'impressions', cor: KIT.purple, sufixo: 'aparições' },
  sessions: { titulo: 'Visitas ao site', fonte: 'ga4', k: 'sessions', cor: KIT.green, sufixo: 'visitas' },
};

/* Variação contra os 28 dias anteriores; sem base, não há número. */
export function variacao(atual, anterior) { return anterior > 0 ? ((atual - anterior) / anterior) * 100 : null; }
/* Faixas do PageSpeed: 0-49 ruim, 50-89 precisa melhorar, 90-100 bom. */
export const faixaNota = n => n == null ? 'sem' : n >= 90 ? 'boa' : n >= 50 ? 'media' : 'ruim';

let estado = { resp: null, carregando: false, erro: '' };
let serie = 'clicks';
try { serie = globalThis.localStorage?.getItem('ngd.site.serie') || serie; } catch { /* sem armazenamento */ }
if (!SERIES[serie]) serie = 'clicks';

const cabeca = (titulo, ic, sub, extra = '') => `<div class="r-card-head"><div class="r-card-title">${ic}<div><h2 class="k-card-title with-icon">${titulo}</h2>${sub ? `<p>${sub}</p>` : ''}</div></div>${extra}</div>`;
const selo = (v, { menorMelhor = false, dica = 'Comparado com os 28 dias anteriores' } = {}) => {
  if (v == null) return '';
  const bom = menorMelhor ? v <= 0 : v >= 0;
  return `<span class="r-delta ${bom ? 'up' : 'down'}" title="${esc(dica)}">${v >= 0 ? '▲' : '▼'} ${v >= 0 ? '+' : ''}${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</span>`;
};
const vazio = (titulo, texto) => `<div class="k-empty"><strong>${esc(titulo)}</strong><span>${esc(texto)}</span></div>`;

export function htmlSite(resp, ui = {}) {
  const d = resp?.dados || {};
  const date = ui.date || (v => v ? new Date(v).toLocaleString('pt-BR') : '—');
  const fontes = d.fontes || {};
  const ok = k => fontes[k]?.ok && d[k];
  const gsc = ok('gsc') ? d.gsc : null, ga4 = ok('ga4') ? d.ga4 : null, idx = ok('indexacao') ? d.indexacao : null, vel = ok('velocidade') ? d.velocidade : null;

  const head = `<header class="r-head"><div><h1>Site</h1><p>Como o <a class="k-link" href="${SITE}" target="_blank" rel="noopener noreferrer">nucleografico.com.br ↗</a> aparece no Google, quem visita e quão rápido ele abre.</p>
    <small class="r-meta">${d.exemplo ? 'Dados de exemplo · ' : ''}${d.atualizadoEm && !d.exemplo ? 'Atualizado em ' + esc(date(d.atualizadoEm)) + ' · ' : ''}Coleta automática diária às 7h · só leitura, direto do Google</small></div>
    <div class="r-head-tools"><button id="site-coletar" class="r-btn" type="button" ${resp?.robo ? '' : 'disabled title="Falta a chave do robô"'}>${icon('refresh', { size: 16 })} ${resp?.rodando || estado.carregando ? 'Atualizando…' : 'Atualizar agora'}</button></div></header>`;

  const faixaExemplo = d.exemplo ? `<div class="s-exemplo" role="status">${icon('warning', { size: 18 })}<div><strong>Dados de exemplo</strong><span>Os números abaixo são fictícios, só para mostrar como a aba vai ficar. Eles somem na primeira coleta real com o robô do Google.</span></div></div>` : '';

  // Configuração: aparece enquanto faltar a chave ou o ID do GA4.
  const passo = (feito, titulo, texto) => `<li class="${feito ? 'feito' : ''}"><span class="s-check">${feito ? icon('check', { size: 14 }) : ''}</span><div><strong>${titulo}</strong><span>${texto}</span></div></li>`;
  const config = (!resp?.robo || !resp?.propertyId) ? `<section class="k-card r-card s-config">${cabeca('Ligar a coleta', `<span class="r-ic blue">${icon('settings', { size: 20 })}</span>`, 'Dois passos, uma vez só. O robô só consegue ler: não altera o site, o Search Console nem o Analytics.')}
    <ol class="s-passos">${passo(!!resp?.robo, 'Chave do robô de leitura', resp?.robo ? `Robô ${esc(resp.robo.email)} pronto. Ele precisa estar como usuário restrito no Search Console e como Leitor no GA4.` : 'Salve o arquivo JSON da conta de serviço em <code>data/google-site-leitura.json</code>, na pasta da Central. Nunca envie a chave por chat.')}
    ${passo(!!resp?.propertyId, 'ID da propriedade do GA4', resp?.propertyId ? `Propriedade ${esc(resp.propertyId)}.` : 'Número de 9 dígitos em Analytics → Administrador → Detalhes da propriedade (não é o código G-…).')}</ol>
    ${resp?.propertyId ? '' : `<form id="site-config" class="s-form"><label for="site-property">ID da propriedade do GA4</label><div><input id="site-property" name="propertyId" inputmode="numeric" pattern="[0-9]{6,12}" placeholder="ex.: 412345678" required><button class="r-btn soft" type="submit">Salvar</button></div></form>`}</section>` : '';

  // Erros por fonte, em português, sem esconder os últimos dados bons.
  const NOMES = { gsc: 'Buscas no Google', indexacao: 'Indexação', ga4: 'Visitas (GA4)', velocidade: 'Velocidade' };
  const erros = Object.entries(fontes).filter(([, f]) => f && !f.ok);
  const avisos = erros.length ? `<ul class="s-erros">${erros.map(([k, f]) => `<li>${icon('warning', { size: 16 })}<span><strong>${NOMES[k] || k}:</strong> ${esc(f.erro)}${d[k] ? ' Mostrando a última coleta que deu certo.' : ''}</span></li>`).join('')}</ul>` : '';

  // KPIs: cliques (destaque), aparições, posição média e visitantes.
  const kpi = (ic, cor, valor, rotulo, delta, dica = '') => `<section class="r-kpi" data-c="${cor}"${dica ? ` title="${esc(dica)}"` : ''}><span class="r-kpi-icon">${ic}</span><div><strong class="k-num">${valor}</strong><small>${rotulo}</small></div>${delta}</section>`;
  const dCliques = gsc ? variacao(gsc.atual.clicks, gsc.anterior.clicks) : null;
  const sparkCliques = gsc?.serie?.length > 1 ? spark(gsc.serie.map(s => s.clicks), { color: 'rgba(255,255,255,.9)', width: 190, height: 52 }) : '';
  const hero = `<section class="r-kpi r-kpi-hero" aria-label="Cliques vindos do Google"><span class="r-kpi-icon">${icon('search', { size: 26 })}</span><div><span class="r-kpi-label">Cliques vindos do Google</span><div class="r-kpi-main"><strong class="k-num">${gsc ? fmt(gsc.atual.clicks) : '—'}</strong>${selo(dCliques)}<small>${gsc ? `de ${curta(gsc.periodo.inicio)} a ${curta(gsc.periodo.fim)}` : 'aguardando o Search Console'}</small></div></div>${sparkCliques ? `<span class="r-kpi-spark" title="Cliques por dia">${sparkCliques}</span>` : ''}</section>`;
  const kpis = '<div class="r-kpis">' + hero +
    kpi(icon('eye', { size: 22 }), KIT.purple, gsc ? fmt(gsc.atual.impressions) : '—', 'aparições no Google' + (gsc ? ` · CTR ${dec(gsc.atual.ctr)}%` : ''), selo(gsc ? variacao(gsc.atual.impressions, gsc.anterior.impressions) : null), 'Quantas vezes o site apareceu numa busca, mesmo sem clique') +
    kpi(icon('trend', { size: 22 }), KIT.yellow, gsc ? dec(gsc.atual.position) : '—', 'posição média nas buscas', selo(gsc ? variacao(gsc.atual.position, gsc.anterior.position) : null, { menorMelhor: true, dica: 'Quanto menor, mais perto do topo. Comparado com os 28 dias anteriores' }), '1 = primeiro resultado do Google') +
    kpi(icon('users', { size: 22 }), KIT.green, ga4 ? fmt(ga4.atual.users) : '—', ga4 ? `visitantes · ${fmt(ga4.atual.sessions)} visitas` : 'visitantes (aguardando o GA4)', selo(ga4 ? variacao(ga4.atual.users, ga4.anterior.users) : null), 'Pessoas diferentes que abriram o site nos últimos 28 dias') + '</div>';

  // Evolução diária com troca de série.
  const sel = SERIES[serie], fonteSerie = sel.fonte === 'gsc' ? gsc : ga4, pontos = fonteSerie?.serie || [];
  const botoes = `<div class="r-seg" role="group" aria-label="Indicador">${Object.entries(SERIES).map(([k, s]) => `<button type="button" data-site-serie="${k}" class="${serie === k ? 'on' : ''}" aria-pressed="${serie === k}">${s.titulo.replace(' no Google', '').replace(' ao site', '')}</button>`).join('')}</div>`;
  const evolucao = `<section class="k-card r-card r-evolucao">${cabeca(sel.titulo + ' por dia', `<span class="r-ic blue">${icon('chart', { size: 20 })}</span>`, sel.fonte === 'gsc' ? 'Search Console, últimos 28 dias fechados (o Google consolida com ~3 dias de atraso)' : 'Google Analytics, últimos 28 dias até ontem', botoes)}
    <div class="r-card-body">${pontos.length > 1 ? area({ labels: pontos.map(p => curta(p.dia)), tipLabels: pontos.map(p => longa(p.dia)), tipSuffix: sel.sufixo, values: pontos.map(p => p[sel.k]), name: sel.titulo, title: sel.titulo + ' por dia', height: 250, linear: true, xTicks: 8, color: sel.cor }) : vazio('Sem série ainda', sel.fonte === 'gsc' ? 'Aguardando o Search Console.' : 'Aguardando o Google Analytics.')}</div></section>`;

  // Velocidade: nota celular/computador por página + histórico do celular.
  const nota = (v, rotulo) => `<div class="s-nota ${faixaNota(v?.nota)}"><b class="k-num">${v?.nota ?? '—'}</b><span>${rotulo}</span></div>`;
  const hist = p => (d.historico || []).map(h => h.velocidade?.[p]?.m).filter(v => v != null);
  const linhaVel = ([p, v]) => { const h = hist(p); return `<li><div class="s-vel-pag"><strong>${p === '/' ? 'Página inicial' : esc(p)}</strong><small>${v?.mobile ? `Celular: maior elemento em ${dec(v.mobile.lcp)} s · bloqueio ${fmt(v.mobile.tbt)} ms` : 'sem medição'}</small>${h.length > 1 ? `<span class="s-vel-hist" title="Nota no celular, últimas ${h.length} coletas">${spark(h, { color: KIT.accent, width: 120, height: 26 })}</span>` : ''}</div>${nota(v?.mobile, 'Celular')}${nota(v?.desktop, 'Computador')}</li>`; };
  const velocidade = `<section class="k-card r-card s-velocidade">${cabeca('Velocidade', `<span class="r-ic blue">${icon('gauge', { size: 20 })}</span>`, 'Nota do PageSpeed (Google). 90+ bom · 50–89 precisa melhorar · abaixo de 50 ruim')}
    ${vel ? `<ul class="s-vel">${Object.entries(vel.atual).map(linhaVel).join('')}</ul><p class="k-note k-pad">O celular pesa mais: é como a maioria chega pelo Instagram. Medido uma vez por dia; a nota varia alguns pontos entre medições.</p>` : vazio('Sem medição ainda', 'Aguardando o PageSpeed.')}</section>`;

  // Buscas e páginas do Search Console.
  const tabela = (cab, linhas, vazioTxt) => linhas.length ? `<div class="r-table-scroll"><table class="r-table s-table"><thead><tr>${cab.map((c, i) => `<th scope="col"${i ? ' class="t-right"' : ''}>${c}</th>`).join('')}</tr></thead><tbody>${linhas.join('')}</tbody></table></div>` : vazio('Nada ainda', vazioTxt);
  const buscas = `<section class="k-card r-card">${cabeca('Buscas que trazem gente', `<span class="r-ic yellow">${icon('search', { size: 20 })}</span>`, 'O que as pessoas digitaram no Google antes de achar o site')}
    ${tabela(['Busca', 'Cliques', 'Aparições', 'Posição'], (gsc?.buscas || []).map(b => `<tr><td class="s-q">${esc(b.busca)}</td><td class="t-right k-num"><strong>${fmt(b.clicks)}</strong></td><td class="t-right k-num">${fmt(b.impressions)}</td><td class="t-right k-num">${dec(b.position)}</td></tr>`), 'O Google ainda não informou buscas para este período.')}</section>`;
  const paginasGsc = `<section class="k-card r-card">${cabeca('Páginas mais clicadas no Google', `<span class="r-ic blue">${icon('trophy', { size: 20 })}</span>`, 'Quais páginas do site o Google mais entrega')}
    ${tabela(['Página', 'Cliques', 'Aparições', 'Posição'], (gsc?.paginas || []).map(p => `<tr><td class="s-q"><a class="k-link" href="${esc(SITE + p.pagina)}" target="_blank" rel="noopener noreferrer">${esc(p.pagina)}</a></td><td class="t-right k-num"><strong>${fmt(p.clicks)}</strong></td><td class="t-right k-num">${fmt(p.impressions)}</td><td class="t-right k-num">${dec(p.position)}</td></tr>`), 'Sem páginas com clique neste período.')}</section>`;

  // Indexação: alertas, sitemaps e situação de cada página principal.
  const ESTADO = { PASS: ['No Google', 'boa'], NEUTRAL: ['Fora do Google', 'media'], FAIL: ['Com erro', 'ruim'], PARTIAL: ['Parcial', 'media'] };
  const nIdx = (idx?.paginas || []).filter(p => p.veredito === 'PASS').length;
  const indexacao = `<section class="k-card r-card s-indexacao">${cabeca('O Google está reconhecendo o site?', `<span class="r-ic blue">${icon('globe', { size: 20 })}</span>`, idx ? `${nIdx} de ${idx.paginas.length} páginas principais no índice${idx.inspecionadoEm ? ' · conferido em ' + esc(date(idx.inspecionadoEm)) : ''}` : 'Aguardando o Search Console')}
    ${idx ? `${idx.alertas?.length ? `<ul class="s-alertas">${idx.alertas.slice(0, 5).map(a => `<li class="${a.tipo}">${icon('warning', { size: 16 })}<span>${esc(a.texto)}<small>${esc(date(a.em))}</small></span></li>`).join('')}</ul>` : ''}
    <ul class="s-idx">${idx.paginas.map(p => { const [rot, cls] = ESTADO[p.veredito] || ['Sem informação', 'sem']; return `<li><a class="k-link" href="${esc(SITE + (p.pagina === '/' ? '/' : p.pagina))}" target="_blank" rel="noopener noreferrer">${esc(p.pagina)}</a><span class="s-pill ${cls}" title="${esc(p.cobertura)}">${rot}</span><small>${esc(p.cobertura)}${p.ultimoRastreio ? ' · visitada pelo Google em ' + esc(date(p.ultimoRastreio)) : ''}</small></li>`; }).join('')}</ul>
    <p class="k-note k-pad">${(idx.sitemaps || []).map(s => `Sitemap ${esc(s.url.replace(SITE, ''))}: ${fmt(s.paginas)} endereços enviados${s.erros ? `, ${s.erros} erro(s)` : ''}${s.lido ? ', lido em ' + esc(date(s.lido)) : ''}.`).join(' ')} A inspeção página a página roda uma vez por dia por causa do limite do Google.</p>` : vazio('Sem dados de indexação', 'Aguardando o Search Console.')}</section>`;

  // Tráfego (GA4): canais e origens, páginas mais vistas.
  const canais = `<section class="k-card r-card s-canais">${cabeca('De onde vêm as visitas', `<span class="r-ic blue">${icon('network', { size: 20 })}</span>`, 'Visitas dos últimos 28 dias por canal e por origem')}
    <div class="r-card-body">${ga4 ? hbars((ga4.canais || []).map(c => ({ label: c.nome, value: c.sessoes }))) + `<h3 class="s-sub">Principais origens</h3>` + hbars((ga4.origens || []).slice(0, 6).map((c, i) => ({ label: c.nome, value: c.sessoes, color: [KIT.accent, KIT.green, KIT.purple, KIT.yellow, KIT.red, KIT.ink][i] }))) + '<p class="k-note">"instagram" e "l.instagram.com" são cliques vindos do Instagram (perfil, stories e anúncios).</p>' : vazio('Sem visitas ainda', 'Aguardando o Google Analytics.')}</div></section>`;
  const paginasGa = `<section class="k-card r-card">${cabeca('Páginas mais vistas', `<span class="r-ic yellow">${icon('eye', { size: 20 })}</span>`, 'Google Analytics, últimos 28 dias')}
    ${tabela(['Página', 'Visualizações', 'Visitantes'], (ga4?.paginas || []).map(p => `<tr><td class="s-q">${esc(p.pagina)}</td><td class="t-right k-num"><strong>${fmt(p.views)}</strong></td><td class="t-right k-num">${fmt(p.users)}</td></tr>`), 'O Analytics ainda não informou páginas.')}</section>`;
  // Cliques no WhatsApp (evento clique_whatsapp do GA4). "Pessoas" conta cada visitante uma vez; "cliques" soma repetições.
  const zap = ga4?.whatsapp;
  const whatsapp = `<section class="k-card r-card s-zap">${cabeca('Cliques no WhatsApp', `<span class="r-ic green">${icon('chat', { size: 20 })}</span>`, 'Quem chamou no WhatsApp pelo site, últimos 28 dias')}
    ${zap ? `<div class="r-card-body"><p class="s-zap-total"><strong class="k-num">${fmt(zap.atual.pessoas)}</strong> pessoas chamaram ${selo(variacao(zap.atual.pessoas, zap.anterior.pessoas))}<small>${fmt(zap.atual.cliques)} cliques no total · ${fmt(zap.anterior.pessoas)} pessoas nos 28 dias anteriores</small></p>
    <h3 class="s-sub">Por canal</h3>${hbars((zap.canais || []).map(c => ({ label: c.nome, value: c.pessoas })))}</div>
    ${tabela(['Página', 'Pessoas', 'Cliques'], (zap.paginas || []).map(p => `<tr><td class="s-q">${esc(p.pagina)}</td><td class="t-right k-num"><strong>${fmt(p.pessoas)}</strong></td><td class="t-right k-num">${fmt(p.cliques)}</td></tr>`), 'Nenhum clique no WhatsApp no período.')}
    <p class="k-note k-pad">Vem do evento "clique_whatsapp" que o site já envia ao Analytics. Muitos cliques por pessoa numa página podem ser cliques repetidos ou disparos duplicados.</p>` : vazio('Sem cliques ainda', 'Aguardando o Google Analytics.')}</section>`;

  return `<div class="k-scope r-page s-page">${head}${faixaExemplo}${config}${avisos}${kpis}
    <div class="r-grid">${evolucao}${velocidade}${buscas}${canais}${paginasGsc}${indexacao}${paginasGa}${whatsapp}</div></div>`;
}

async function api(url, options) {
  const r = await fetch(url, options);
  const corpo = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(corpo.error || 'Não foi possível concluir.');
  return corpo;
}

/* app.js chama de forma síncrona; os dados chegam depois e redesenham só o corpo da aba. */
export function paginaSite(ui) {
  if (!estado.carregando) carregar(ui);   // mostra o que já tem e busca o retrato atual
  return corpo(ui);
}
const corpo = ui => `<div id="site-body">${estado.resp ? htmlSite(estado.resp, ui) : estado.erro ? `<div class="k-scope r-page">${vazio('Não deu para abrir a aba Site', estado.erro)}</div>` : '<div class="k-scope r-page"><p class="k-note">Carregando dados do site…</p></div>'}</div>`;

async function carregar(ui, opcoes) {
  estado.carregando = true;
  try { estado.resp = await api(opcoes ? '/api/site/coletar' : '/api/site', opcoes); estado.erro = ''; }
  catch (e) { estado.erro = e.message; if (opcoes) ui.toast?.(e.message); }
  finally { estado.carregando = false; redesenhar(ui); }
}

function redesenhar(ui) {
  const alvo = document.getElementById('site-body');
  if (!alvo) return;
  alvo.outerHTML = corpo(ui);
  const novo = document.getElementById('site-body');
  wire(novo); ligarSite(novo, ui);
}

/* Liga botões e formulário depois que a página entra no DOM. */
export function ligarSite(root, ui = {}) {
  root.querySelectorAll('[data-site-serie]').forEach(b => b.addEventListener('click', () => {
    serie = b.dataset.siteSerie; try { globalThis.localStorage?.setItem('ngd.site.serie', serie); } catch { /* sem armazenamento */ }
    redesenhar(ui);
  }));
  root.querySelector('#site-coletar')?.addEventListener('click', e => {
    e.currentTarget.disabled = true; e.currentTarget.lastChild.textContent = ' Atualizando…';
    ui.toast?.('Buscando os dados no Google. Pode levar até 2 minutos.');
    carregar(ui, { method: 'POST' });
  });
  root.querySelector('#site-config')?.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      estado.resp = { ...(estado.resp || {}), ...await api('/api/site/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ propertyId: e.target.elements.propertyId.value }) }) };
      if (!estado.resp.dados) estado.resp = await api('/api/site');
      ui.toast?.('ID do GA4 salvo.');
      redesenhar(ui);
    } catch (error) { ui.toast?.(error.message); }
  });
}
