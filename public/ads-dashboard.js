/* Aba Dashboard do módulo Mídia Paga: os anúncios estão trazendo lead, lead bom e pedido
   de orçamento?

   Importada por: public/ads.js, que a registra como a primeira aba.
   API pública: painelDashboard(), abrirDashboard(redesenhar, filtros), dashboardEvento(alvo, redesenhar).
   Consome só GET /api/ads/dashboard. Não escreve nada e não fala com plataforma de anúncio.

   Visual: componentes de public/ui/kit.css e gráficos de public/ui/charts.js, sem CSS novo,
   sem biblioteca e sem rede. Cor e largura viajam em data-c e data-w, aplicados por wire(),
   porque a CSP (style-src 'self') manda o navegador ignorar style="" no HTML.

   Venda, receita e ROAS não aparecem aqui de propósito: o anúncio da NGD capta contato e
   gera pedido de orçamento, quem fecha é o comercial. */
import { line, hbars, legend, KIT, fmt } from './ui/charts.js';
import { icon } from './ui/icons.js';

const CORES = { leads: KIT.accent, qualificados: KIT.green, orcamentos: KIT.purple };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = c => (c == null ? '—' : (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dinheiro = c => (c ? brl(c) : '—');   // zero aqui quase sempre é "não registrado"
const dataDe = iso => new Date(iso + 'T00:00:00');
const curta = iso => dataDe(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const longa = iso => dataDe(iso).toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const porcento = p => (p == null ? '—' : p.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%');
const pctDe = (n, todo) => (todo > 0 ? Math.round((n / todo) * 1000) / 10 : null);

// As duas contagens de tempo do módulo. Aparecem como dica ao passar o mouse nos títulos.
const NOTA_DIA = 'Cada ponto usa a data em que a coisa aconteceu: o dia em que o lead entrou, '
  + 'o dia em que foi qualificado e o dia em que pediu orçamento.';
const NOTA_SAFRA = 'Conta os leads que nasceram no período escolhido e até onde cada um chegou até hoje. '
  + 'Por isso os números não batem com o gráfico diário, e somar os dois dá resultado errado.';

const PERIODOS = [['7', '7 dias'], ['30', '30 dias'], ['90', '90 dias'], ['tudo', 'Tudo'], ['personalizado', 'Escolher']];
const ORDENS = { orcamentos: 'desc', leads: 'desc', qualificados: 'desc', investido_cents: 'desc', cpl: 'asc', cpql: 'asc', cpo: 'asc' };

const estado = {
  carregando: true, erro: '', dados: null, ordem: 'orcamentos',
  filtros: { periodo: '30', campanha: '', desde: '', ate: '' },
};

/** Busca o resumo já somado no servidor e redesenha quando chegar. */
export function abrirDashboard(redesenhar, filtros) {
  if (filtros) Object.assign(estado.filtros, filtros);
  const f = estado.filtros;
  if (f.periodo === 'personalizado' && !(f.desde && f.ate)) { redesenhar(); return; }
  estado.carregando = true;
  estado.erro = '';
  queueMicrotask(async () => {
    try {
      const q = new URLSearchParams({ periodo: f.periodo });
      if (f.campanha) q.set('campanha', f.campanha);
      if (f.periodo === 'personalizado') { q.set('desde', f.desde); q.set('ate', f.ate); }
      const r = await fetch('/api/ads/dashboard?' + q);
      const corpo = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(corpo.error || 'Não foi possível carregar o desempenho.');
      estado.dados = corpo;
    } catch (error) { estado.erro = error.message; }
    estado.carregando = false;
    redesenhar();
  });
}

/** Cliques e trocas de filtro da aba. Devolve true quando tratou o evento. */
export function dashboardEvento(alvo, redesenhar) {
  const d = alvo.dataset || {};
  if (d.dashPeriodo) {
    const f = { periodo: d.dashPeriodo };
    if (d.dashPeriodo !== 'personalizado') { f.desde = ''; f.ate = ''; }
    abrirDashboard(redesenhar, f);
    return true;
  }
  if (d.dashCampanha !== undefined) { abrirDashboard(redesenhar, { campanha: alvo.value }); return true; }
  if (d.dashDesde !== undefined) { estado.filtros.desde = alvo.value; return aplicar(redesenhar); }
  if (d.dashAte !== undefined) { estado.filtros.ate = alvo.value; return aplicar(redesenhar); }
  if (d.dashOrdem) { estado.ordem = d.dashOrdem; redesenhar(); return true; }
  return false;
}

// O intervalo escolhido só vale quando as duas pontas existem; até lá a tela espera.
function aplicar(redesenhar) {
  const f = estado.filtros;
  if (f.desde && f.ate) abrirDashboard(redesenhar, { periodo: 'personalizado' });
  return true;
}

export function painelDashboard() {
  if (estado.carregando) return `<section class="k-card"><div class="k-empty"><span>Carregando o desempenho…</span></div></section>`;
  if (estado.erro) {
    return `${filtros()}<section class="k-card"><div class="k-empty">${icon('warning', { size: 32 })}
      <strong>Não foi possível carregar o desempenho</strong><span>${esc(estado.erro)}</span></div></section>`;
  }
  const d = estado.dados;
  if (!d) return `${filtros()}<section class="k-card"><div class="k-empty"><span>Escolha as duas datas do período.</span></div></section>`;
  const vazio = d.indicadores.leads === 0 && d.indicadores.investido_cents === 0;
  return `${d.demonstracao ? `<div class="k-notice warn">${icon('warning', { size: 20 })}<p>
      <strong>Modo demonstração — dados fictícios.</strong> Estes números foram gerados pelo script de
      demonstração para desenhar e treinar a tela. Não são resultado de anúncio real.</p></div>` : ''}
    ${filtros()}
    ${indicadores(d)}
    ${vazio ? `<section class="k-card"><div class="k-empty">${icon('megaphone', { size: 32 })}
        <strong>Nada aconteceu neste período</strong>
        <span>Nenhum lead registrado e nenhum gasto lançado entre ${esc(longa(d.periodo.desde))} e ${esc(longa(d.periodo.ate))}.</span></div></section>`
      : `<div class="k-grid cols-dash">${evolucao(d)}${funil(d)}</div>${comparacao(d)}`}`;
}

/* ---------------- filtros ---------------- */

function filtros() {
  const f = estado.filtros;
  const campanhas = estado.dados?.campanhas || [];
  const p = estado.dados?.periodo;
  return `<div class="k-pagebar" id="dash-filtros">
    <div class="k-row-tight">${PERIODOS.map(([id, rotulo]) =>
      `<button type="button" class="k-btn ${f.periodo === id ? 'primary' : 'tertiary'} sm" data-dash-periodo="${id}">${rotulo}</button>`).join('')}
      ${f.periodo === 'personalizado' ? `<input class="k-input-sm" type="date" aria-label="Data inicial" data-dash-desde value="${esc(f.desde)}">
        <input class="k-input-sm" type="date" aria-label="Data final" data-dash-ate value="${esc(f.ate)}">` : ''}
    </div>
    <div class="k-row-tight">
      <select class="k-select" aria-label="Campanha" data-dash-campanha>
        <option value="">Todas as campanhas</option>
        ${campanhas.map(c => `<option value="${c.id}" ${String(f.campanha) === String(c.id) ? 'selected' : ''}>${esc(c.ref_code || '—')} · ${esc(c.name)}</option>`).join('')}
      </select>
      ${p ? `<span class="k-muted k-body2">${esc(longa(p.desde))} a ${esc(longa(p.ate))}</span>` : ''}
    </div>
  </div>`;
}

/* ---------------- indicadores ---------------- */

function indicadores(d) {
  const i = d.indicadores;
  const cartao = (rotulo, ic, valor, nota) => `<div class="k-kpi">
      <span class="k-kpi-label">${icon(ic, { size: 16 })}${rotulo}</span>
      <strong class="k-num">${esc(valor)}</strong><small>${esc(nota)}</small></div>`;
  return `<section class="k-card k-kpis" aria-label="Resultado do período">
      ${cartao('Investido em anúncios', 'megaphone', dinheiro(i.investido_cents), i.investido_cents ? 'no período escolhido' : 'nenhum gasto registrado')}
      ${cartao('Leads da NGD', 'users', fmt(i.leads), `a plataforma atribui ${fmt(d.plataforma.leads)}, e os dois não se somam`)}
      ${cartao('Leads qualificados', 'check', fmt(i.qualificados), `${porcento(pctDe(i.qualificados, i.leads))} dos leads`)}
      ${cartao('Pedidos de orçamento', 'link', fmt(i.orcamentos), `${porcento(pctDe(i.orcamentos, i.leads))} dos leads`)}
    </section>
    <section class="k-card k-kpis" aria-label="Custo por etapa">
      ${cartao('Custo por lead', 'users', brl(i.cpl), i.cpl == null ? 'falta gasto ou lead para calcular' : 'investido ÷ leads da NGD')}
      ${cartao('Custo por lead qualificado', 'check', brl(i.cpql), i.cpql == null ? 'falta gasto ou qualificado para calcular' : 'investido ÷ qualificados')}
      ${cartao('Custo por orçamento', 'link', brl(i.cpo), i.cpo == null ? 'falta gasto ou orçamento para calcular' : 'investido ÷ pedidos de orçamento')}
      ${cartao('Impressões e cliques', 'image', fmt(d.plataforma.impressoes), `${fmt(d.plataforma.cliques)} cliques, número da plataforma`)}
    </section>`;
}

/* ---------------- gráfico diário ---------------- */

function evolucao(d) {
  const s = d.serie;
  const series = [
    { name: 'Leads NGD', values: s.leads, color: CORES.leads },
    { name: 'Qualificados', values: s.qualificados, color: CORES.qualificados },
    { name: 'Pedidos de orçamento', values: s.orcamentos, color: CORES.orcamentos },
  ];
  const total = k => s[k].reduce((a, b) => a + b, 0);
  // O balão do gráfico mostra o valor do dia; o data-dias alimenta a dica completa, com a
  // data por extenso e as três séries, montada pelo ouvinte lá embaixo.
  return `<section class="k-card" id="dash-evolucao" data-dias="${esc(JSON.stringify(s))}">
    <div class="k-card-head"><h2 class="k-card-title" title="${esc(NOTA_DIA)}">Evolução da captação</h2>
      <span class="k-muted k-body2" title="${esc(NOTA_DIA)}">por dia do evento</span></div>
    <div class="k-card-body">
      ${legend([
    { label: 'Leads NGD', value: total('leads'), color: CORES.leads },
    { label: 'Qualificados', value: total('qualificados'), color: CORES.qualificados },
    { label: 'Pedidos de orçamento', value: total('orcamentos'), color: CORES.orcamentos },
  ], { row: true })}
      ${line({ labels: s.dias.map(curta), series, title: 'Evolução da captação por dia', height: 440 })}
      <p class="k-note">Dia sem nada registrado vale zero, e não some do gráfico. O investimento fica fora
        daqui de propósito: dinheiro e quantidade de lead têm escalas diferentes, e um esconderia o outro.</p>
    </div></section>`;
}

/* ---------------- funil ---------------- */

// Do azul da entrada ao amarelo do fim, para o olho seguir a descida sem precisar de legenda.
const ESCALA = [KIT.accent, KIT.accent, KIT.green, KIT.purple, KIT.purple, KIT.yellow];

function funil(d) {
  const etapas = d.funil;
  // As barras usam hbars() do kit, que já dá faixa de largura cheia e proporcional. A
  // tabela logo abaixo carrega os números que a barra não cabe: as duas porcentagens.
  const barras = etapas.map((e, i) => ({ label: e.rotulo, value: e.n, color: ESCALA[Math.min(i, ESCALA.length - 1)] }));
  return `<section class="k-card">
    <div class="k-card-head"><h2 class="k-card-title" title="${esc(NOTA_SAFRA)}">Funil dos leads</h2>
      <span class="k-muted k-body2" title="${esc(NOTA_SAFRA)}">leads nascidos no período</span></div>
    <div class="k-card-body">${etapas[0]?.n ? hbars(barras)
      : `<div class="k-empty k-chart-empty"><strong>Sem dados</strong><span>Nenhum lead nasceu neste período.</span></div>`}</div>
    <div class="k-table-scroll"><table class="k-table compact"><thead><tr><th>Etapa</th>
        <th class="t-right">Quantidade</th><th class="t-right">% dos leads</th>
        <th class="t-right" title="Quanto passou da etapa de cima para esta.">Da etapa anterior</th></tr></thead>
      <tbody>${etapas.map(e => `<tr>
        <td class="t-title">${esc(e.rotulo)}</td>
        <td class="t-right k-num">${fmt(e.n)}</td>
        <td class="t-right k-num">${esc(porcento(e.pctLeads))}</td>
        <td class="t-right k-num">${esc(porcento(e.pctAnterior))}</td></tr>`).join('')}
      </tbody></table></div>
    <p class="k-note k-pad">Quem chegou a uma etapa conta também nas anteriores por onde passou, lido do
      histórico de cada lead. "Fechado" aparece só como quantidade: o valor da venda não é resultado do anúncio.</p>
  </section>`;
}

/* ---------------- comparação por campanha ---------------- */

function comparacao(d) {
  const itens = [...d.campanhas].sort(comparador(estado.ordem));
  const barras = itens.filter(c => c.leads || c.investido_cents).flatMap(c => {
    const nome = c.ref_code || c.name;
    return [
      { label: `${nome} · Leads`, value: c.leads, color: CORES.leads },
      { label: `${nome} · Qualif.`, value: c.qualificados, color: CORES.qualificados },
      { label: `${nome} · Orçam.`, value: c.orcamentos, color: CORES.orcamentos },
    ];
  });
  const cabecalho = (rotulo, chave, dica = '') => `<th class="t-right">
    <button type="button" class="k-btn tertiary sm" data-dash-ordem="${chave}"${dica ? ` title="${esc(dica)}"` : ''}
      aria-pressed="${estado.ordem === chave}">${esc(rotulo)}</button></th>`;
  return `<section class="k-card">
    <div class="k-card-head"><h2 class="k-card-title" title="${esc(NOTA_SAFRA)}">Resultados por campanha</h2>
      <span class="k-muted k-body2">as três barras são etapas do mesmo funil, por isso não se empilham</span></div>
    <div class="k-card-body">
      ${legend([
    { label: 'Leads NGD', color: CORES.leads },
    { label: 'Qualificados', color: CORES.qualificados },
    { label: 'Pedidos de orçamento', color: CORES.orcamentos },
  ], { row: true })}
      ${barras.length ? hbars(barras) : `<div class="k-empty k-chart-empty"><strong>Sem dados</strong><span>Nenhuma campanha teve lead ou gasto neste período.</span></div>`}
    </div>
    <div class="k-table-scroll"><table class="k-table compact"><thead><tr><th>Campanha</th>
        ${cabecalho('Investido', 'investido_cents')}
        ${cabecalho('Orçamentos', 'orcamentos')}
        ${cabecalho('CPL', 'cpl', 'Custo por lead: investido ÷ leads da NGD.')}
        ${cabecalho('Custo por qualificado', 'cpql')}
        ${cabecalho('Custo por orçamento', 'cpo')}</tr></thead>
      <tbody>${itens.map(c => `<tr>
        <td><span class="k-code">${esc(c.ref_code || '—')}</span> <span class="t-title">${esc(c.name)}</span></td>
        <td class="t-right k-num">${esc(dinheiro(c.investido_cents))}</td>
        <td class="t-right k-num">${fmt(c.orcamentos)}</td>
        <td class="t-right k-num">${esc(brl(c.cpl))}</td>
        <td class="t-right k-num">${esc(brl(c.cpql))}</td>
        <td class="t-right k-num">${esc(brl(c.cpo))}</td></tr>`).join('')}
      </tbody></table></div>
    <p class="k-note k-pad">Traço significa que o número não pode ser calculado com segurança, e não zero.
      Campanha sem gasto lançado não tem custo por lead. Clique no título da coluna para ordenar.</p>
  </section>`;
}

// Custo menor é melhor, quantidade maior é melhor. Quem não tem número vai para o fim nos
// dois casos: falta de dado não é primeiro lugar nem último colocado.
function comparador(chave) {
  const desc = ORDENS[chave] !== 'asc';
  return (a, b) => {
    const x = a[chave], y = b[chave];
    if (x == null && y == null) return 0;
    if (x == null) return 1;
    if (y == null) return -1;
    return desc ? y - x : x - y;
  };
}

/* ---------------- dica do gráfico diário ----------------

   O balão do kit mostra só o valor do dia. A dica nativa do SVG completa com a data por
   extenso e as três séries. O ouvinte fica pendurado no documento uma vez só, então
   sobrevive a cada redesenho e a cada mudança de largura, quando o gráfico é refeito. */
document.addEventListener('mouseover', e => {
  const alvo = e.target;
  if (!alvo.classList?.contains('k-hit')) return;
  const cartao = alvo.closest('#dash-evolucao');
  if (!cartao || alvo.querySelector('title')) return;
  let s;
  try { s = JSON.parse(cartao.dataset.dias); } catch { return; }
  const i = Number(alvo.dataset.i);
  if (!s?.dias?.[i]) return;
  const t = document.createElementNS('http://www.w3.org/2000/svg', 'title');
  t.textContent = `${longa(s.dias[i])}\nLeads NGD: ${fmt(s.leads[i])}`
    + `\nQualificados: ${fmt(s.qualificados[i])}\nPedidos de orçamento: ${fmt(s.orcamentos[i])}`;
  alvo.appendChild(t);
}, true);
