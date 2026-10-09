// Monitoração do site oficial (nucleografico.com.br) para a aba "Site" da Central.
// Só lê APIs do Google: Search Console (busca e indexação), Analytics 4 e PageSpeed Insights.
// Nenhuma chamada vai ao servidor do site. Cada fonte falha sozinha: o erro fica em português em
// fontes.<nome>.erro e os últimos dados bons daquela fonte são mantidos.
// Arquivos: data/site.json (último retrato + histórico diário enxuto) e data/site-config.json (ID do GA4).
import fs from 'node:fs';
import path from 'node:path';
import { createGoogle } from './google.mjs';

export const SITE = 'https://nucleografico.com.br';
export const GSC_SITE = 'sc-domain:nucleografico.com.br';
// Páginas que recebem inspeção de URL (cota baixa do Google: no máximo uma rodada por dia).
export const PAGINAS_PRINCIPAIS = ['/', '/servicos', '/portfolio', '/contato', '/backdrop', '/roll-up', '/fachada-comercial', '/letra-caixa-aco', '/lp/box-truss', '/lp/placas-de-campo'];
export const PAGINAS_VELOCIDADE = ['/', '/backdrop'];
const WEBMASTERS = 'https://www.googleapis.com/webmasters/v3';
const INSPECAO = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
const GA4 = 'https://analyticsdata.googleapis.com/v1beta';
const PAGESPEED = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const DIA = 86400000;
const INTERVALO_MANUAL = 10 * 60 * 1000;
const INTERVALO_INSPECAO = 20 * 3600 * 1000;
const HISTORICO_DIAS = 400;
const ATRASO_GSC = 3;   // o Search Console fecha os números com ~2-3 dias de atraso

const num = v => Number(v) || 0;
const r2 = v => Math.round(num(v) * 100) / 100;
export const diaSP = t => new Date(t).toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const somaDias = (dia, n) => new Date(Date.parse(dia + 'T12:00:00Z') + n * DIA).toISOString().slice(0, 10);

/* Janelas de 28 dias: atual termina `atraso` dias antes de hoje; anterior são os 28 dias antes dela. */
export function janelas(agora, atraso = 1) {
  const fim = somaDias(diaSP(agora), -atraso);
  const inicio = somaDias(fim, -27);
  return { atual: { inicio, fim }, anterior: { inicio: somaDias(inicio, -28), fim: somaDias(inicio, -1) } };
}

/* ---------- normalização das respostas (puras, testadas com fixtures) ---------- */

export function normGscTotais(resp) {
  const r = resp?.rows?.[0];
  return r ? { clicks: num(r.clicks), impressions: num(r.impressions), ctr: r2(num(r.ctr) * 100), position: r2(r.position) } : { clicks: 0, impressions: 0, ctr: 0, position: 0 };
}
export function normGscLinhas(resp, chave = 'chave') {
  return (resp?.rows || []).map(r => ({ [chave]: r.keys?.[0] ?? '', clicks: num(r.clicks), impressions: num(r.impressions), ctr: r2(num(r.ctr) * 100), position: r2(r.position) }));
}
export const caminho = url => { try { const u = new URL(url); return (u.pathname.replace(/\/$/, '') || '/') + u.search; } catch { return url; } };

export function normSitemaps(resp) {
  return (resp?.sitemap || []).map(s => ({
    url: s.path, enviado: s.lastSubmitted || '', lido: s.lastDownloaded || '', pendente: !!s.isPending,
    erros: num(s.errors), avisos: num(s.warnings), paginas: (s.contents || []).reduce((t, c) => t + num(c.submitted), 0),
  }));
}

const COBERTURA = {
  'Submitted and indexed': 'Enviada e indexada', 'Indexed, not submitted in sitemap': 'Indexada, fora do sitemap',
  'Crawled - currently not indexed': 'Rastreada, ainda não indexada', 'Discovered - currently not indexed': 'Descoberta, ainda não indexada',
  'URL is unknown to Google': 'O Google ainda não conhece', 'Page with redirect': 'Página com redirecionamento',
  'Excluded by ‘noindex’ tag': 'Excluída por noindex', 'Not found (404)': 'Não encontrada (404)', 'Duplicate without user-selected canonical': 'Duplicada sem canônica',
  'Alternate page with proper canonical tag': 'Alternativa com canônica correta', 'Server error (5xx)': 'Erro no servidor (5xx)', 'Soft 404': 'Soft 404',
};
export function normInspecao(caminhoPagina, resp, em) {
  const s = resp?.inspectionResult?.indexStatusResult || {};
  return {
    pagina: caminhoPagina, veredito: s.verdict || 'VERDICT_UNSPECIFIED', cobertura: COBERTURA[s.coverageState] || s.coverageState || 'Sem informação',
    ultimoRastreio: s.lastCrawlTime || '', canonica: s.googleCanonical ? caminho(s.googleCanonical) : '', em,
  };
}
export const indexada = p => p?.veredito === 'PASS';

/* Alertas: página que estava no índice e saiu, ou que dá erro. Compara com a rodada anterior. */
export function alertasIndexacao(antes = [], depois = [], em) {
  const anterior = Object.fromEntries(antes.map(p => [p.pagina, p]));
  const out = [];
  for (const p of depois) {
    const a = anterior[p.pagina];
    if (p.veredito === 'FAIL') out.push({ pagina: p.pagina, tipo: 'erro', texto: `${p.pagina}: ${p.cobertura}`, em });
    else if (indexada(a) && !indexada(p)) out.push({ pagina: p.pagina, tipo: 'saiu', texto: `${p.pagina} saiu do índice do Google (${p.cobertura})`, em });
  }
  return out;
}

export function normGa4(resp, dims = []) {
  const mets = (resp?.metricHeaders || []).map(h => h.name);
  return (resp?.rows || []).map(r => {
    const o = {};
    dims.forEach((d, i) => { o[d] = r.dimensionValues?.[i]?.value ?? ''; });
    mets.forEach((m, i) => { o[m] = num(r.metricValues?.[i]?.value); });
    return o;
  });
}
const CANAIS = { 'Organic Search': 'Google (orgânico)', Direct: 'Direto', 'Organic Social': 'Redes sociais', 'Paid Search': 'Google Ads', 'Paid Social': 'Anúncios em redes', Referral: 'Outros sites', Unassigned: 'Não atribuído', 'Cross-network': 'Campanhas mistas', Email: 'E-mail', Display: 'Display', 'Organic Video': 'Vídeo', 'Paid Other': 'Outros anúncios', 'Organic Shopping': 'Shopping' };
export const nomeCanal = c => CANAIS[c] || c || 'Outros';

export function normPagespeed(resp) {
  const lh = resp?.lighthouseResult;
  if (!lh) return null;
  const a = lh.audits || {};
  return {
    nota: Math.round(num(lh.categories?.performance?.score) * 100),
    lcp: r2(num(a['largest-contentful-paint']?.numericValue) / 1000),
    cls: Math.round(num(a['cumulative-layout-shift']?.numericValue) * 1000) / 1000,
    tbt: Math.round(num(a['total-blocking-time']?.numericValue)),
  };
}

/* Mensagem em português para quem opera o painel, a partir do erro do Google. */
export function explicar(fonte, error) {
  const s = error?.status, g = String(error?.google || error?.message || '');
  if (error?.code === 'sem_chave') return 'Falta a chave do robô em data/google-site-leitura.json.';
  if (error?.code === 'token') return error.message;
  if (error?.code === 'sem_property') return 'Falta o ID da propriedade do GA4 (9 dígitos), em Configuração abaixo.';
  if (/has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(g + ' ' + (error?.reason || ''))) return `A API de ${fonte} está desativada no projeto do Google Cloud. Ative-a na Biblioteca de APIs.`;
  if (s === 429) return `Limite de consultas do Google atingido em ${fonte}. Tenta de novo na próxima coleta.`;
  if (s === 401 || s === 403) {
    if (fonte === 'Analytics') return 'O robô não tem acesso ao Analytics. Adicione o e-mail dele como Leitor na propriedade do GA4.';
    if (fonte === 'PageSpeed') return 'O PageSpeed recusou a consulta por limite de cota. Tenta de novo mais tarde.';
    return 'O robô não tem acesso ao Search Console. Adicione o e-mail dele como usuário restrito na propriedade.';
  }
  if (s === 404 && fonte === 'Analytics') return 'Propriedade do GA4 não encontrada. Confira o ID de 9 dígitos.';
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return `${fonte} demorou demais para responder.`;
  return `${fonte}: ${g || 'falha inesperada'}`.slice(0, 300);
}

/* ---------- monitor ---------- */

export function createSiteMonitor({ dataDir, fetch: fetchImpl = globalThis.fetch, now = Date.now, log = () => {} }) {
  const arquivo = path.join(dataDir, 'site.json');
  const arquivoConfig = path.join(dataDir, 'site-config.json');
  const google = createGoogle({ file: path.join(dataDir, 'google-site-leitura.json'), fetch: fetchImpl, now });
  let rodando = null, ultimaManual = 0;

  const ler = (f, padrao) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return padrao; } };
  const gravar = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const tmp = f + '.tmp'; fs.writeFileSync(tmp, JSON.stringify(v, null, 2)); fs.renameSync(tmp, f); };
  const config = () => ({ propertyId: '', pagespeedKey: '', ...ler(arquivoConfig, {}) });
  const dados = () => ler(arquivo, null);

  function salvarConfig({ propertyId }) {
    const id = String(propertyId ?? '').trim();
    if (!/^\d{6,12}$/.test(id)) throw Object.assign(new Error('O ID da propriedade do GA4 tem só números (6 a 12 dígitos). Não é o código G-…'), { status: 400 });
    gravar(arquivoConfig, { ...config(), propertyId: id });
    return status();
  }

  function status() {
    const c = config();
    return { robo: google.robo(), propertyId: c.propertyId, rodando: !!rodando, dados: dados() };
  }

  // Search Console: totais das duas janelas, série diária, top buscas e top páginas.
  async function coletarGsc(agora) {
    const { atual, anterior } = janelas(agora, ATRASO_GSC);
    const url = `${WEBMASTERS}/sites/${encodeURIComponent(GSC_SITE)}/searchAnalytics/query`;
    const q = (j, extra = {}) => google.chamar(url, { method: 'POST', body: { startDate: j.inicio, endDate: j.fim, dataState: 'all', ...extra } });
    const [ta, tp, serie, buscas, paginas] = await Promise.all([
      q(atual), q(anterior), q(atual, { dimensions: ['date'], rowLimit: 100 }),
      q(atual, { dimensions: ['query'], rowLimit: 10 }), q(atual, { dimensions: ['page'], rowLimit: 10 }),
    ]);
    return {
      periodo: atual, atual: normGscTotais(ta), anterior: normGscTotais(tp),
      serie: normGscLinhas(serie, 'dia').map(r => ({ dia: r.dia, clicks: r.clicks, impressions: r.impressions })).sort((a, b) => a.dia.localeCompare(b.dia)),
      buscas: normGscLinhas(buscas, 'busca'),
      paginas: normGscLinhas(paginas, 'url').map(r => ({ ...r, pagina: caminho(r.url) })),
    };
  }

  // Indexação: sitemaps a cada coleta; inspeção de URL no máximo uma rodada a cada 20 h.
  async function coletarIndexacao(agora, antes) {
    const em = new Date(agora).toISOString();
    const sm = await google.chamar(`${WEBMASTERS}/sites/${encodeURIComponent(GSC_SITE)}/sitemaps`);
    const out = { sitemaps: normSitemaps(sm), paginas: antes?.paginas || [], alertas: antes?.alertas || [], inspecionadoEm: antes?.inspecionadoEm || '' };
    if (out.inspecionadoEm && agora - Date.parse(out.inspecionadoEm) < INTERVALO_INSPECAO) return out;
    const novas = [];
    for (const p of PAGINAS_PRINCIPAIS) {   // em série: a cota por minuto do Google é baixa
      const r = await google.chamar(INSPECAO, { method: 'POST', body: { inspectionUrl: SITE + (p === '/' ? '/' : p), siteUrl: GSC_SITE, languageCode: 'pt-BR' } });
      novas.push(normInspecao(p, r, em));
    }
    out.alertas = [...alertasIndexacao(out.paginas, novas, em), ...out.alertas].slice(0, 20);
    out.paginas = novas; out.inspecionadoEm = em;
    return out;
  }

  // Analytics 4: totais das duas janelas, série diária, canais, origens e páginas.
  async function coletarGa4(agora) {
    const id = config().propertyId;
    if (!id) throw Object.assign(new Error('sem property'), { code: 'sem_property' });
    const { atual, anterior } = janelas(agora, 1);   // até ontem: o dia de hoje ainda está incompleto
    const url = `${GA4}/properties/${id}:runReport`;
    const rel = (j, dimensions, metrics, extra = {}) => google.chamar(url, { method: 'POST', body: { dateRanges: [{ startDate: j.inicio, endDate: j.fim }], dimensions: dimensions.map(name => ({ name })), metrics: metrics.map(name => ({ name })), ...extra } });
    const M = ['activeUsers', 'sessions', 'screenPageViews'];
    const porSessao = m => ({ orderBys: [{ metric: { metricName: m }, desc: true }], limit: 10 });
    const [ta, tp, serie, canais, origens, paginas] = await Promise.all([
      rel(atual, [], M), rel(anterior, [], M), rel(atual, ['date'], ['activeUsers', 'sessions'], { orderBys: [{ dimension: { dimensionName: 'date' } }] }),
      rel(atual, ['sessionDefaultChannelGroup'], ['sessions'], porSessao('sessions')), rel(atual, ['sessionSource'], ['sessions'], porSessao('sessions')),
      rel(atual, ['pagePath'], ['screenPageViews', 'activeUsers'], porSessao('screenPageViews')),
    ]);
    const tot = r => { const x = normGa4(r)[0] || {}; return { users: num(x.activeUsers), sessions: num(x.sessions), views: num(x.screenPageViews) }; };
    return {
      periodo: atual, atual: tot(ta), anterior: tot(tp),
      serie: normGa4(serie, ['date']).map(r => ({ dia: `${r.date.slice(0, 4)}-${r.date.slice(4, 6)}-${r.date.slice(6, 8)}`, users: r.activeUsers, sessions: r.sessions })),
      canais: normGa4(canais, ['sessionDefaultChannelGroup']).map(r => ({ nome: nomeCanal(r.sessionDefaultChannelGroup), sessoes: r.sessions })),
      origens: normGa4(origens, ['sessionSource']).map(r => ({ nome: r.sessionSource || '(direto)', sessoes: r.sessions })),
      paginas: normGa4(paginas, ['pagePath']).map(r => ({ pagina: r.pagePath, views: r.screenPageViews, users: r.activeUsers })),
    };
  }

  // PageSpeed: celular e computador das páginas de referência. Usa o token do robô (cota própria); a chave de API é opcional.
  async function coletarVelocidade() {
    const key = config().pagespeedKey;
    const atual = {};
    for (const p of PAGINAS_VELOCIDADE) {
      atual[p] = {};
      for (const strategy of ['mobile', 'desktop']) {
        const q = new URLSearchParams({ url: SITE + p, strategy, category: 'performance', locale: 'pt_BR' });
        if (key) q.set('key', key);
        atual[p][strategy] = normPagespeed(await google.chamar(`${PAGESPEED}?${q}`, { auth: !key, timeout: 90000 }));
      }
    }
    return { atual };
  }

  async function executar() {
    const agora = now(), em = new Date(agora).toISOString(), hoje = diaSP(agora);
    const antes = dados() || {};
    const novo = { ...antes, exemplo: false, atualizadoEm: em, fontes: { ...(antes.fontes || {}) } };
    const fontes = [
      ['gsc', 'Search Console', () => coletarGsc(agora)],
      ['indexacao', 'Search Console', () => coletarIndexacao(agora, antes.indexacao)],
      ['ga4', 'Analytics', () => coletarGa4(agora)],
      ['velocidade', 'PageSpeed', () => coletarVelocidade()],
    ];
    await Promise.all(fontes.map(async ([k, nome, fn]) => {
      try { novo[k] = await fn(); novo.fontes[k] = { ok: true, em }; }
      catch (error) { novo.fontes[k] = { ok: false, erro: explicar(nome, error), em }; log(`Site: falha em ${nome}: ${error.message}`); }
    }));
    // Histórico diário enxuto: um registro por dia, o último da data vence.
    const ponto = { dia: hoje };
    if (novo.fontes.gsc?.ok) Object.assign(ponto, { clicks: novo.gsc.atual.clicks, impressions: novo.gsc.atual.impressions, position: novo.gsc.atual.position });
    if (novo.fontes.ga4?.ok) Object.assign(ponto, { users: novo.ga4.atual.users, sessions: novo.ga4.atual.sessions });
    if (novo.fontes.velocidade?.ok) ponto.velocidade = Object.fromEntries(Object.entries(novo.velocidade.atual).map(([p, v]) => [p, { m: v.mobile?.nota ?? null, d: v.desktop?.nota ?? null }]));
    if (novo.fontes.indexacao?.ok) ponto.indexadas = (novo.indexacao.paginas || []).filter(indexada).length;
    novo.historico = [...(antes.historico || []).filter(h => h.dia !== hoje), ponto].slice(-HISTORICO_DIAS);
    gravar(arquivo, novo);
    return novo;
  }

  /* Coleta: uma por vez; a manual respeita 10 min de intervalo. */
  function coletar({ manual = false } = {}) {
    if (!google.configurado()) return Promise.reject(Object.assign(new Error('Falta a chave do robô em data/google-site-leitura.json.'), { status: 409 }));
    if (rodando) return Promise.reject(Object.assign(new Error('A coleta do site já está em andamento.'), { status: 409 }));
    if (manual) {
      const falta = ultimaManual + INTERVALO_MANUAL - now();
      if (falta > 0) return Promise.reject(Object.assign(new Error(`Aguarde ${Math.ceil(falta / 60000)} min para atualizar de novo.`), { status: 429 }));
      ultimaManual = now();
    }
    rodando = executar().finally(() => { rodando = null; });
    return rodando;
  }

  /* Diária: a partir das 7h (Brasília), uma vez por dia; na subida, se a última tiver mais de 24 h. */
  function agendar() {
    const tick = () => {
      if (!google.configurado() || rodando) return;
      const d = dados(), ultima = Date.parse(d?.atualizadoEm || 0) || 0, agora = now();
      const hora = Number(new Date(agora).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false }));
      if (agora - ultima > DIA || (hora >= 7 && diaSP(ultima) !== diaSP(agora))) coletar().catch(e => log(`Site: coleta automática falhou: ${e.message}`));
    };
    setTimeout(tick, 15000);
    return setInterval(tick, 30 * 60 * 1000);
  }

  return { status, coletar, salvarConfig, agendar, executar, google };
}
