// Painel de desempenho da Mídia Paga: tudo somado no banco, nada agregado no navegador.
//
// Importado por: lib/ads/routes.mjs (rota GET /api/ads/dashboard) e pelos testes.
// API pública: resolverPeriodo, resumo, ETAPAS.
// Só lê. Nenhum INSERT, UPDATE ou DELETE mora aqui, e nada fala com plataforma de anúncio.
//
// Tabelas lidas: leads (created_at ISO completo, campaign_id), lead_events (at ISO, to_stage),
// daily_metrics (date "2026-01-02", spend_cents inteiro, platform_leads), campaigns, sync_runs.
//
// DUAS CONTAGENS DE TEMPO DIFERENTES, de propósito:
//
//   série diária  — usa a data em que o evento aconteceu. O lead entrou no dia 3 e foi
//                   qualificado no dia 7: aparece no dia 3 na linha de leads e no dia 7 na
//                   linha de qualificados. Serve para ver o ritmo da captação.
//   funil e campanhas — usam os leads que NASCERAM no período e o estágio mais avançado que
//                   cada um alcançou até hoje. Serve para ver quanto daquela safra andou.
//
// Somar as duas dá número errado. Por isso a tela explica a diferença em cada bloco.
import { ROTULOS } from './funnel.mjs';

// Etapas na ordem do funil. 'perdido' fica fora: não é um degrau, é uma saída.
export const ETAPAS = ['lead', 'contato', 'qualificado', 'orcamento', 'proposta', 'venda'];
// Chegar a uma etapa vale para todas as anteriores: quem pediu orçamento passou pelo
// contato, mesmo que ninguém tenha clicado no degrau do meio.
const AO_MENOS = Object.fromEntries(ETAPAS.map((e, i) => [e, ETAPAS.slice(i)]));
const lista = estagios => estagios.map(e => `'${e}'`).join(',');

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const diaDe = d => d.toISOString().slice(0, 10);
const somaDias = (dia, n) => diaDe(new Date(Date.parse(dia + 'T00:00:00Z') + n * 86400000));

const PRESETS = { 7: 'Últimos 7 dias', 30: 'Últimos 30 dias', 90: 'Últimos 90 dias' };

/**
 * Traduz o filtro da tela em um par de datas fechado nos dois lados.
 * Período inválido cai no padrão de 30 dias, em vez de devolver tela vazia sem explicação.
 */
export function resolverPeriodo(db, { periodo = '30', desde, ate, agora = new Date() } = {}) {
  const hoje = diaDe(agora);
  if (periodo === 'personalizado' && DIA.test(desde || '') && DIA.test(ate || '')) {
    const [a, b] = desde <= ate ? [desde, ate] : [ate, desde];   // datas trocadas não quebram a tela
    return { periodo, desde: a, ate: b, rotulo: 'Período escolhido' };
  }
  if (periodo === 'tudo') {
    const inicio = db.prepare(`SELECT MIN(d) AS d FROM (
        SELECT MIN(date) AS d FROM daily_metrics UNION ALL SELECT MIN(substr(created_at,1,10)) FROM leads)`).get().d;
    return { periodo, desde: inicio || hoje, ate: hoje, rotulo: 'Todo o período' };
  }
  const n = PRESETS[periodo] ? Number(periodo) : 30;
  return { periodo: String(n), desde: somaDias(hoje, -(n - 1)), ate: hoje, rotulo: PRESETS[n] };
}

// Sem gasto ou sem denominador não existe custo. Devolver zero faria parecer que o lead
// saiu de graça, que é uma mentira diferente de "ainda não dá para saber".
const custo = (gasto, n) => (gasto > 0 && n > 0 ? Math.round(gasto / n) : null);
const parte = (n, todo) => (todo > 0 ? Math.round((n / todo) * 1000) / 10 : null);

/** Resumo completo da aba Dashboard. Uma chamada, tudo já somado. */
export function resumo(db, filtros = {}) {
  const periodo = resolverPeriodo(db, filtros);
  const { desde, ate } = periodo;
  const pedida = Number(filtros.campanha) || null;
  // Campanha inexistente vira "todas": melhor mostrar o geral do que uma tela vazia mentirosa.
  const alvo = pedida && db.prepare('SELECT 1 FROM campaigns WHERE id = ?').get(pedida) ? pedida : null;
  const porCampanha = alvo ? ' AND l.campaign_id = ' + alvo : '';
  const porCampanhaM = alvo ? ' AND m.campaign_id = ' + alvo : '';

  const gasto = db.prepare(`SELECT COALESCE(SUM(m.spend_cents),0) AS gasto, COALESCE(SUM(m.impressions),0) AS impressoes,
      COALESCE(SUM(m.clicks),0) AS cliques, COALESCE(SUM(m.platform_leads),0) AS leads
    FROM daily_metrics m WHERE m.date BETWEEN ? AND ?${porCampanhaM}`).get(desde, ate);

  // --- Leads nascidos no período: base do funil, das campanhas e dos custos ---
  const leads = db.prepare(`SELECT COUNT(*) AS n FROM leads l
    WHERE substr(l.created_at,1,10) BETWEEN ? AND ?${porCampanha}`).get(desde, ate).n;
  const alcancaram = estagio => db.prepare(`SELECT COUNT(DISTINCT l.id) AS n FROM leads l
      JOIN lead_events e ON e.lead_id = l.id
      WHERE substr(l.created_at,1,10) BETWEEN ? AND ?${porCampanha}
        AND e.to_stage IN (${lista(AO_MENOS[estagio])})`).get(desde, ate).n;

  const contagem = { lead: leads };
  for (const etapa of ETAPAS.slice(1)) contagem[etapa] = alcancaram(etapa);
  const funil = ETAPAS.map((etapa, i) => ({
    stage: etapa,
    rotulo: ROTULOS[etapa],
    n: contagem[etapa],
    pctLeads: parte(contagem[etapa], leads),
    pctAnterior: i === 0 ? null : parte(contagem[etapa], contagem[ETAPAS[i - 1]]),
  }));

  return {
    periodo,
    campanha: alvo,
    demonstracao: !!db.prepare("SELECT 1 FROM campaigns WHERE external_id LIKE 'demo:%' LIMIT 1").get(),
    ultimaSync: db.prepare('SELECT MAX(finished_at) AS q FROM sync_runs WHERE ok = 1').get().q || null,
    indicadores: {
      investido_cents: gasto.gasto,
      leads,
      qualificados: contagem.qualificado,
      orcamentos: contagem.orcamento,
      cpl: custo(gasto.gasto, leads),
      cpql: custo(gasto.gasto, contagem.qualificado),
      cpo: custo(gasto.gasto, contagem.orcamento),
    },
    // Nunca somar plataforma.leads com indicadores.leads: são duas medições do mesmo
    // mundo, não duas partes de um total.
    plataforma: { leads: gasto.leads, investido_cents: gasto.gasto, impressoes: gasto.impressoes, cliques: gasto.cliques },
    funil,
    serie: serieDiaria(db, desde, ate, porCampanha),
    campanhas: porCampanhas(db, desde, ate, alvo),
  };
}

/** Uma linha por dia do período, sem buraco: dia sem evento vale zero, não vale nada. */
function serieDiaria(db, desde, ate, porCampanha) {
  const dias = [];
  for (let d = desde; d <= ate; d = somaDias(d, 1)) dias.push(d);

  const novos = db.prepare(`SELECT substr(l.created_at,1,10) AS d, COUNT(*) AS n
     FROM leads l WHERE substr(l.created_at,1,10) BETWEEN ? AND ?${porCampanha} GROUP BY d`).all(desde, ate);
  // O dia que conta é o da PRIMEIRA vez que o lead chegou à etapa. Sem o MIN, um lead que
  // passou por qualificado e depois por orçamento apareceria duas vezes na mesma linha.
  const primeiraVez = estagio => db.prepare(`SELECT d, COUNT(*) AS n FROM (
        SELECT substr(MIN(e.at),1,10) AS d FROM lead_events e JOIN leads l ON l.id = e.lead_id
        WHERE e.to_stage IN (${lista(AO_MENOS[estagio])})${porCampanha} GROUP BY e.lead_id)
      WHERE d BETWEEN ? AND ? GROUP BY d`).all(desde, ate);

  const espalhar = linhas => {
    const mapa = new Map(linhas.map(r => [r.d, r.n]));
    return dias.map(d => mapa.get(d) || 0);
  };
  return {
    dias,
    leads: espalhar(novos),
    qualificados: espalhar(primeiraVez('qualificado')),
    orcamentos: espalhar(primeiraVez('orcamento')),
  };
}

/** Comparação lado a lado. Os três números são etapas do mesmo funil, então não se empilham. */
function porCampanhas(db, desde, ate, alvo) {
  const filtro = alvo ? ' WHERE c.id = ' + alvo : '';
  const chegou = estagio => `(SELECT COUNT(DISTINCT l.id) FROM leads l JOIN lead_events e ON e.lead_id = l.id
      WHERE l.campaign_id = c.id AND substr(l.created_at,1,10) BETWEEN @desde AND @ate
        AND e.to_stage IN (${lista(AO_MENOS[estagio])}))`;
  const linhas = db.prepare(`SELECT c.id, c.ref_code, c.name,
      (SELECT COALESCE(SUM(m.spend_cents),0) FROM daily_metrics m
         WHERE m.campaign_id = c.id AND m.date BETWEEN @desde AND @ate) AS investido_cents,
      (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id
         AND substr(l.created_at,1,10) BETWEEN @desde AND @ate) AS leads,
      ${chegou('qualificado')} AS qualificados,
      ${chegou('orcamento')} AS orcamentos
    FROM campaigns c${filtro}`).all({ desde, ate });

  return linhas.map(c => ({
    ...c,
    cpl: custo(c.investido_cents, c.leads),
    cpql: custo(c.investido_cents, c.qualificados),
    cpo: custo(c.investido_cents, c.orcamentos),
  })).sort((a, b) => b.orcamentos - a.orcamentos || b.leads - a.leads);
}
